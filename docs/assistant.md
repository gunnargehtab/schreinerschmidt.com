# Assistant spec: inquiry automation and chat (proposed)

**Status: proposal (2026-10-13), not part of the approved `docs/plan.md`.** Nothing here ships until the user approves it and the owner has answered the open items (§10, mirrored in `docs/owner-checklist.md`). The demo on GitHub Pages stays as it is: no network for forms, no assistant.

**Configurator enquiries:** `docs/angebot.md` (2026-10-22) replaces part A for them with a priced, owner-approved Angebot flow. Part A below still applies to the contact form.

This spec adds two Claude-powered features to the production site:
- **A. Inquiry automation.** Every enquiry (contact, configurator, application) is still delivered by email, and also gets an AI triage note and a reply draft for the owner. A person always decides and sends.
- **B. Chat ("Frage stellen").** An opt-in widget that answers questions about the workshop and its services, from confirmed site content only, and hands off to the enquiry form.

A comes first: it is lower risk, needs no new UI, and pays off with every enquiry. B follows behind a flag.

## 0. Decisions needed before Phase 6a
| # | Decision | Recommendation |
|---|---|---|
| D1 | Backend host | An EU-hosted serverless function or a small EU VPS (§2.1). Decide together with the production host (plan §12 item 10). |
| D2 | Where Claude runs | Claude API (Anthropic, US) with a DPA, or Claude on Google Vertex AI in the `eu` multi-region (Google as processor). Legal review decides (§7). |
| D3 | Keep form.taxi? | Replace it with the assistant backend for all forms (one processor fewer), or keep form.taxi and only forward a copy. Recommendation: replace. |
| D4 | Chat at all? | Only after A has run for a few weeks and the owner sees value. |

## 1. Scope
**In scope**
- A backend (`assistant/` in this repo, its own package) that receives form posts, sends the email, calls Claude and serves the chat endpoint.
- Site changes: a new endpoint env var, the CSP origin, the chat widget, the knowledge export, tests and budgets.
- German microcopy for the widget, the AI disclosure and the Datenschutz section.

**Out of scope (non-goals)**
- Claude never replies to a customer by email on its own, never promises prices, dates or availability, and never books appointments. (The configurator flow in `docs/angebot.md` sends a price range calculated by code, and only after the owner approves it.)
- No tools for the chat model (no web search, no database, no calendar). It only answers from the knowledge text.
- No accounts, no cookies, no analytics, no chat history across visits.
- No voice, no file upload in the chat.

## 2. Architecture
```
Browser (static site, any host)
  ├─ form POST (no JS) / fetch (JS) ──► POST {ASSISTANT}/anfrage ──► 1. email to the owner (always first)
  │                                                                  2. Claude triage + draft ──► 2nd email "KI-Notiz"
  └─ chat widget (JS, on click) ──────► POST {ASSISTANT}/chat ────► Claude (no tools) ──► streamed text
```
- The **API key lives only in the backend** as a secret. It never appears in the site build, the repo or the browser.
- **Delivery never depends on Claude.** `/anfrage` sends the plain enquiry email first and responds to the browser; the AI step runs after that (queued or `waitUntil`). If Claude fails, times out or refuses, the owner still has the enquiry and simply gets no AI note.
- The backend is a few hundred lines of TypeScript using the official SDK `@anthropic-ai/sdk`. No agent framework and no Managed Agents: both features are single calls.

### 2.1 Hosting options (D1)
| Option | Fit | Notes |
|---|---|---|
| Serverless function in an EU region (e.g. Cloudflare Workers, Scaleway Serverless, a Vercel/Netlify function pinned to an EU region) | Good | Pay per use, nothing to patch. Check the provider's EU data localisation terms and DPA. |
| Small EU VPS (e.g. Hetzner) with Node 24 | Good | Full control; must be patched and monitored. Can also host the static site, which solves plan R19 (Pages terms). |
| GitHub Pages only | Not possible | No server code; the key would be public. |

The backend must be on **its own subdomain of the production domain** (e.g. `anfrage.<domain>`), so the CSP adds a first-party origin and no third-party request leaves the browser.

### 2.2 Endpoints
| Endpoint | Request | Response |
|---|---|---|
| `POST /anfrage` | `multipart/form-data`, the existing field names (`docs/architecture.md` §8, `docs/configurator.md` §5) including `anfrage_json` (`ss-anfrage@1`) | form.taxi-compatible: `{success, error, error_msg}` with `Accept: application/json`; otherwise `303` to `_next` (the danke page). The site's submit code needs no change beyond the endpoint. |
| `POST /chat` | JSON `{messages: [{role, content}], page}`; at most 10 user turns, 800 characters per message | `text/plain; charset=utf-8`, streamed. Errors as `4xx/5xx` with a reason key (`rate`, `length`, `unavailable`); the widget maps keys to German lines, like the forms do. |
| `GET /health` | — | `204` |

Both POST endpoints check `Origin` against the production origin, reject other content types, and enforce the same honeypot and time-trap rules as today.

## 3. Site changes
- **Env:** `PUBLIC_ASSISTANT_ENDPOINT` (https, optional) replaces `PUBLIC_FORM_ENDPOINT` under D3, or sits beside it. `PUBLIC_ASSISTANT_CHAT` (boolean, default `false`) gates the widget.
- **CSP:** `connect-src` and `form-action` gain the backend origin, exactly like `formSrc` today. Extend the dist test that checks the CSP so the origin appears only when the env var is set.
- **Demo builds** (`PUBLIC_DEMO=true`): no endpoint, so no CSP change, no widget and zero network, unchanged from today.
- **Build guard:** a production build with `PUBLIC_ASSISTANT_CHAT=true` fails unless the knowledge export (§5.3) is non-empty and the Datenschutz entry for the assistant is no longer `needs-review`.

## 4. A: inquiry automation
### 4.1 Pipeline (`/anfrage`)
1. Validate, honeypot, time-trap, size limits (CV 10 MB as today).
2. **Send the enquiry email** to the owner, as form.taxi does today (subject from `_subject`, `_replyto` set, attachments attached). Respond to the browser.
3. **Triage** with Claude Haiku 5.5, structured output (§4.2). Input: `zusammenfassung`, the free-text fields and `anfrage_json`. Attachments are not sent to Claude (data minimisation); photo file names are.
4. **Draft** with Claude Opus 5.5 for enquiries that are not spam: a German reply draft in the shop's voice, plus the questions to clarify before an Aufmaß. For Möbel enquiries the existing `stueckliste` and `derived` values from the payload are passed, so the draft can refer to real dimensions.
5. **Send the "KI-Notiz" email** to the owner, threaded as a reply to the first one: category, urgency, summary, missing information, the draft, and the line „KI-Entwurf – bitte prüfen, nicht automatisch versendet.“
6. Log only ids, timings, token counts and the outcome. **Never log message content.**

Spam (triage `spam: true` with high confidence) still goes to the owner, with the subject prefixed „[Spam?]“. Nothing is dropped silently.

### 4.2 Triage schema
Defined with Zod and passed via `output_config.format` (`zodOutputFormat`), parsed with `client.messages.parse`:
```ts
const Triage = z.object({
  kategorie: z.enum(['kueche', 'moebel', 'fenster_tueren', 'boden', 'treppe', 'terrasse', 'reparatur', 'bewerbung', 'sonstiges']),
  dringlichkeit: z.enum(['normal', 'zeitnah', 'dringend']),
  spam: z.boolean(),
  zusammenfassung: z.string(),        // ≤ 3 German sentences
  fehlende_angaben: z.array(z.string()), // e.g. „Raumhöhe“, „Wunschtermin“
  ausserhalb_einzugsgebiet: z.boolean(),
});
```
Categories follow the service pages; update them with the owner's answer on Treppen (owner checklist).

### 4.3 Prompt rules (both calls)
- The enquiry text is **untrusted data**. The system prompt says so, and nothing in it can change the task. The output only ever reaches the owner, so a manipulated enquiry can at worst produce a bad draft.
- The draft must not name prices, delivery times, appointment dates or availability, and must not make green claims (CLAUDE.md hard rule). Where the customer asks about them, the draft says the owner will get back to them on that.
- Copy rules from `docs/plan.md` §3.4 apply to drafts: sentence case, „…“ quotes, U+202F between number and unit, formal „Sie“.

## 5. B: chat widget
### 5.1 UX
- **Trigger:** a link „Frage stellen“ in the footer and on `/kontakt/`. Without JS (or with the flag off) it is a plain link to `kontakt/` (via `url()`), so every feature still works without JS.
- **With JS:** a click loads the widget chunk and opens it as a dialog (`<dialog>`, modal on small screens, non-modal panel on desktop). Closed state follows the popover exception in `docs/design-system.md` §6. Focus moves into the dialog and returns to the trigger on close; Escape closes it.
- **Disclosure** (always visible at the top, before the first message): „Sie schreiben mit einem KI-Assistenten. Antworten können Fehler enthalten. Verbindliche Auskünfte erhalten Sie von uns persönlich.“ Below it: „Bitte geben Sie hier keine persönlichen Daten ein.“ and a link to the Datenschutz section.
- **Messages:** a list (`role="log"`, `aria-live="polite"`); the streamed answer is announced once when complete, not per token. Visible label on the textarea; send button ≥ 44 px.
- **Hand-off:** every answer that touches prices, dates or a concrete project ends with a link „Anfrage stellen“ to `kontakt/` or `konfigurator/`. The widget does not prefill forms (no data passes from chat to form).
- **State:** the conversation lives in memory only. Closing the tab ends it. No `localStorage`, no `sessionStorage`.
- **Motion:** opening uses the design-system tokens; the finished state is the base CSS, keyframes are gated by `prefers-reduced-motion: no-preference`.

### 5.2 Budgets
- The trigger enhancement is part of the shared page script: **≤ 0.5 KB gz**, and content pages stay **≤ 15 KB** in total.
- The widget chunk loads only on click: **≤ 4 KB gz**. No markdown renderer: answers are plain text with line breaks; the backend strips markdown.
- `scripts/check-budgets.mjs` gets a `CHAT` entry; the dist test checks that no page loads the chunk eagerly.

### 5.3 Knowledge
- `scripts/build-assistant-knowledge.mjs` exports a plain-text knowledge file from the content collections at build time: services, the workshop, service area, the configurator's options, the FAQ, the contact details.
- **Entries flagged `needs-review` or `placeholder` are left out.** A unit test asserts that none of them reach the export. This is how the bot avoids inventing open facts (`docs/owner-checklist.md`).
- The file is deployed with the backend, not served publicly; it becomes the cached part of the system prompt.

### 5.4 System prompt rules
- Answer in German, briefly (≤ 120 words), formal „Sie“, only from the knowledge text.
- If the answer is not in the knowledge text: say so and offer the enquiry form or phone. Never guess.
- Never state prices, delivery times, appointment availability, certifications or environmental claims beyond the knowledge text's wording.
- Never claim to be a person. Decline off-topic requests politely in one sentence.
- No legal, tax or structural-engineering advice (e.g. whether a wall is load-bearing); refer to the appropriate professional.

## 6. Models, settings and cost
| Call | Model | Settings |
|---|---|---|
| Triage (A3) | `claude-haiku-5-5` | Structured output; effort `low`; `max_tokens` 1000. |
| Reply draft (A4) | `claude-opus-5-5` | Effort `medium` (set explicitly); `max_tokens` 4000; server-side refusal `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) on the Claude API. |
| Chat (B) | `claude-haiku-5-5` | Effort `low`; `max_tokens` 600; streaming; prompt caching on the system prompt + knowledge text. |

Thinking can't be switched off on these models; effort is the only control. Check `stop_reason` before using any output (`refusal`, `max_tokens`).

**Cost estimate** (list prices on 2026-10-13: Haiku 5.5 $0.10 / $0.50, Opus 5.5 $4 / $20 per million input / output tokens; re-check before launch):
| Item | Assumption | Cost |
|---|---|---|
| Triage | 3k in, 300 out | ≈ $0.0005 per enquiry |
| Draft | 5k in, 800 out | ≈ $0.04 per enquiry |
| Chat | 5 turns × (6k in, mostly cached, + 250 out) | ≈ $0.004 per conversation |

At 100 enquiries and 1,000 conversations a month: about **$8–10 a month**. Hard limits: a monthly spend limit in the Claude Console, plus the per-IP limits in §8.

## 7. Privacy and legal (all `needs-review`)
- **Processor:** Anthropic (D2: Claude API) or Google (D2: Vertex AI `eu`) processes enquiry and chat text. A DPA (AVV) is required. The backend host is a further processor.
- **Third-country transfer:** the Claude API runs in the US or globally (`inference_geo` offers `us` and `global`, not an EU-only pin). The EU route is Claude on Vertex AI in the `eu` multi-region. Legal review decides which route and which transfer basis.
- **Retention:** the backend stores no message content. The provider's API retention period goes into the Datenschutz text.
- **Legal basis:** enquiries under Art. 6(1)(b) DSGVO as today; the chat under Art. 6(1)(f) or (b), to be decided in review. No consent banner is planned, because no cookies or storage are used.
- **EU AI Act Art. 50:** the disclosure in §5.1 is shown before the first message; reply drafts are marked as AI drafts to the owner.
- **Applications (§ 26 BDSG):** decide whether CVs and cover letters may be triaged by Claude at all. Default: **applications get the email only, no AI step**, until the review says otherwise.
- **Datenschutz page:** a new section „KI-Assistent und Anfrageverarbeitung“ (copywriter, flagged `needs-review`).

## 8. Abuse and security
- API key as a host secret; separate keys (or workspaces) for production and staging.
- `Origin` check, JSON/multipart only, body size limits.
- Rate limits keyed by a salted hash of the IP held for at most 24 h: chat 20 messages per 10 minutes and 100 per day per IP; `/anfrage` 10 per hour.
- The chat model has no tools, so prompt injection can only change its text. The system prompt is not secret, and nothing secret goes into it.
- Responses are rendered as text (`textContent`), never as HTML.
- A kill switch: an env var on the backend turns `/chat` off (the widget then shows „Der Assistent ist gerade nicht verfügbar.“ and the contact links).

## 9. Tests and acceptance
**Site (in `npm run verify`):**
- Unit: the knowledge export excludes `needs-review` / `placeholder` entries; the widget's reason-key mapping.
- Dist: the CSP contains the backend origin only when the env var is set; the demo build contains no widget and no endpoint; budgets (§5.2).
- E2E: the trigger is a working link without JS; the widget opens, sends and renders a mocked stream (`page.route`); focus order and Escape; axe on the open dialog; the error and rate-limit lines.

**Backend (`assistant/`, its own `npm test`):**
- Contract tests with the SDK mocked: the email goes out even when Claude throws, times out or refuses; the form.taxi-compatible response; honeypot and time-trap; rate limits.
- No content in logs (a test feeds a canary string and greps the log output).

**Quality eval (before B goes live):** about 40 German questions with expected behaviour, graded by a person or an LLM judge, including traps: „Was kostet eine Küche?“, „Haben Sie nächste Woche Zeit?“, „Ist Ihr Holz nachhaltig?“, off-topic and injection attempts, and questions whose answer is a `needs-review` fact. The bar: no invented price, date or claim in any answer.

## 10. Phases
| Phase | Content | Depends on |
|---|---|---|
| 6a | Backend `/anfrage` (email + triage + draft), site endpoint switch, Datenschutz section | D1–D3, production host, DPA |
| 6b | Knowledge export, `/chat`, widget behind `PUBLIC_ASSISTANT_CHAT`, eval | 6a live for some weeks, D4 |
| 6c (optional) | A daily digest email of open enquiries | 6a |

**Routing** (CLAUDE.md): core-engineer for the backend, CSP, env and build guard; implementer for the widget and tests; copywriter for the widget microcopy, the disclosure and the Datenschutz section; configurator-engineer reviews the Möbel draft input; reviewer for each phase; test-runner for every verification.
