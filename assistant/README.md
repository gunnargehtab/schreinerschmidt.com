# Assistant backend (pilot)

The form backend of the Schreinerei Schmidt site: it receives the configurator and contact
posts, delivers the enquiry mail to the owner and runs the Angebot pipeline. Spec:
`docs/angebot.md` (phases 7b–7f) and `docs/assistant.md` §2.2 and §8.

Phase 7b: Hono server, `POST /anfrage` (form.taxi-compatible), server-side validation against
`src/lib/configurator/fields.ts`, SQLite store, job runner with the `preis` step, the enquiry mail
and `SEND_MODE`. Phase 7c: the `bewertung` step after `preis` (Claude's assessment, Mengen pricing
for free-text projects, the Angebot text through the output guards; `src/claude/`). Phase 7d: the
owner's side (the recommendation, the TL;DR mail, the review page with its actions, the customer
mails with the PDF, reminders, expiry and retention). Phase 7f: `npm run demo`, a dry-run
walkthrough of all 24 eval fixtures for the owner, with recorded Claude answers.

It is its own npm package (Node 24, ESM, TypeScript 6.0.3) and imports the shared configurator
code from `../src/lib/configurator/` by relative path; the production bundle inlines it.

## Commands

Run them in `assistant/`:

| Command                       | What it does                                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `npm ci`                      | Install the pinned dependencies                                                                                |
| `npm run dev`                 | Dev server with reload (`tsx watch`), reads `.env` if present                                                  |
| `npm run typecheck`           | `tsc --noEmit` with the site's strictness                                                                      |
| `npm test`                    | Vitest, in-process, a temp data directory per test                                                             |
| `npm run build`               | esbuild bundle `dist/server.mjs` (npm packages stay external)                                                  |
| `npm start`                   | Run the bundle (`npm ci --omit=dev` is enough on the host)                                                     |
| `npm run brief`               | Regenerate `src/claude/brief.generated.ts` (brief, confirmed shop contact) and `src/pdf/wordmark.generated.ts` |
| `npm run eval`                | Quality eval against Claude (key, cost estimate, `--yes`)                                                      |
| `npm run eval -- --dry`       | The same eval against the in-process fake (no key, no cost)                                                    |
| `npm run eval -- --aufnahmen` | The same eval against the recorded answers (no key, no cost; the bar as a regression test)                     |
| `npm run demo`                | The owner demo: 24 cases in dry-run with recorded answers, output in `DATA_DIR/demo/` (see below)              |

`GET /health` answers `204`. Outside production and in `dry-run`, `GET /dev/outbox` lists the outbox.

## Configuration

All names are in `.env.example` (no values). Locally, copy it to `.env` (git-ignored); on a host,
use its secret store. **On a host, `NODE_ENV=production` is mandatory**: it removes the
development tools (`/dev/outbox`). Without it everything has a safe default (`SEND_MODE=dry-run`,
`DATA_DIR=./data`, `.invalid` addresses). In production, and whenever `SEND_MODE` is `allowlist`
or `live`, the process refuses to start until `PUBLIC_BASE_URL`, `SITE_ORIGIN`, `OWNER_EMAIL`,
`MAIL_FROM`, `SEND_MODE` and `DATA_DIR` are set; errors name the variables, never their values.
`GET /dev/outbox` exists only outside production and only in `dry-run`.

**The site side (phase 7e, decision D3).** Build the site with `PUBLIC_ASSISTANT_ENDPOINT` set to
this backend's origin (no path, e.g. `https://anfrage.<domain>`): every site form (Konfigurator,
Kontakt, Karriere) then posts multipart to `/anfrage` and the site's CSP allows this origin. Set
`SITE_ORIGIN` to the site's `SITE` origin (the `Origin` check, CORS and the `_next` redirect depend
on it) and `SITE_BASE` to its base path. See `docs/architecture.md` §8 "Endpoint".

Behind a reverse proxy set `TRUST_PROXY=1`: the rate limit then keys on the last
`X-Forwarded-For` hop, but only for connections from loopback or a private address (127/8, ::1,
10/8, 172.16/12, 192.168/16, fc00::/7), i.e. the proxy itself. Any other peer's header is ignored.

## Claude (phase 7c)

The `bewertung` step calls `claude-opus-5-5` twice per case (`bewerten`, then `angebotstext`
unless spam) with structured output, effort `medium` and the server-side refusal fallback; spec
and decisions in `docs/angebot.md` §6. Only project fields, the PLZ with its service tier and the
free text (contact data redacted) go to Claude; name, e-mail, phone, Ort, Erreichbarkeit and
attachments never do. Customer-facing text passes the output guards (`src/claude/guards.ts`):
one corrective retry, then a neutral template.

- `ANTHROPIC_API_KEY` is required for `allowlist` and `live`. Without it (dev, `dry-run`) the
  step stores a "without AI" marker and the template text, and the case continues.
- `CLAUDE_MONTHLY_LIMIT_USD` (optional) caps the estimated monthly spend (usage tokens × list
  prices, summed per UTC month in the store). Once reached, cases continue without AI (event
  `ki_budget`). Set a spend limit in the Claude Console too; the estimate is not the bill.
- The shop brief in the system prompt comes from confirmed content only. After the owner confirms
  entries in `src/content`, run `npm run brief` and commit the result (a test fails on drift).

## Owner side (phase 7d)

Spec and decisions in `docs/angebot.md` §3, §5, §7 and §8. All German copy lives in
`src/texte/inhaber.ts` (owner) and `src/texte/kunde.ts` (customer, `needs-review`).

- **Recommendation** (`src/empfehlung.ts`): Absagen empfohlen, Prüfen or Freigeben empfohlen, with a
  reason per flag. Computed in code, never by Claude; a case without AI is at most „Prüfen“.
- **TL;DR** (step `tldr`, after `bewertung`, also for a failed case): a reply to the enquiry mail
  with the recommendation, range, assessment and one link
  `PUBLIC_BASE_URL/angebot/<id>?t=<token>`. Only the token's SHA-256 is stored; the link is valid
  `TOKEN_TTL_DAYS` days.
- **Review page** `GET /angebot/:id?t=…`: server-rendered, no JS, strict CSP, `noindex`. Forms:
  Freigeben (range and text editable, confirm step), Ablehnen (selbst kalkulieren, Rückfragen or
  call, Absage with an internal reason), „Eigener Preisrahmen“ after selbst kalkulieren or a
  failed assessment. `GET` never changes anything; each POST checks Origin, token, version and
  content type, so a double click sends one mail.
- **Customer mails** go through the same `SEND_MODE`, from `MAIL_FROM` with a BCC to the owner;
  the Angebot carries `Angebot-<Vorgangsnummer>.pdf` with the Angebotsnummer `A-YYYY-NNNN`.
  The preview `GET /angebot/:id/vorschau.pdf?t=…` has a „Vorschau“ watermark.
- **Optional PIN:** set `OWNER_PIN` and `SESSION_SECRET` (≥ 32 random characters). The owner
  enters the PIN once per 12 h; 5 attempts per 15 minutes.
- **Timers** (on the runner's minute tick): one reminder after 2 working days (BW holidays
  2026–2027, placeholder list), `abgelaufen` after the link's validity, and daily retention (90
  days for Absage/expired, 12 months otherwise; content only, the row and range stay).

## Demo for the owner (phase 7f)

`npm run demo` runs the 24 eval fixtures (`eval/fixtures/faelle.ts`, invented customers) through
the real backend in-process: `POST /anfrage` with the site's multipart body, the pipeline up to
the TL;DR, then owner actions through the review routes (Freigeben with confirm for the clear
cases, Selbst kalkulieren with an own range, Rückfragen, Absage). `SEND_MODE=dry-run` is forced, the
store and outbox are temporary, the clock is fake. Spec and details: `docs/angebot.md` §11.

- **Claude:** recorded answers (`eval/fixtures/aufnahmen.ts`) unless `ANTHROPIC_API_KEY` is set
  **and** `--live` is passed; then the cost estimate is printed and the run needs `--yes`
  (`npm run demo -- --live --yes`).
- **Output:** `DATA_DIR/demo/` (default `data/demo/`, wiped each run): `index.html`, the German
  overview for the owner, and one folder per case with the enquiry and TL;DR mails (`.eml`,
  `.html`), the review page, the PDF preview and, after an action, the confirm and result pages,
  the customer mail and the Angebot PDF.
- **Screenshots (optional):** PNGs of the review pages need Playwright with Chromium from the
  site's `node_modules` (`DEMO_CHROMIUM=/path/to/chrome` picks the browser), PNGs of the Angebot
  PDFs need `pdftoppm`. Missing tools are skipped with a note; `--ohne-bilder` skips both.

## SEND_MODE

| Mode        | Effect                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `dry-run`   | Default. No SMTP at all: every mail is written as `.eml` to `DATA_DIR/outbox/`.                                                      |
| `allowlist` | Real SMTP. Customer mails outside `SEND_ALLOWLIST` go to `OWNER_EMAIL`, subject prefixed `[Pilot – nicht an Kunde]`. Needs `SMTP_*`. |
| `live`      | Real sending. Needs the owner's OK, the confirmed mailbox and the legal review.                                                      |

## Data

`DATA_DIR/angebote.sqlite` (WAL) holds the cases, a content-free event log and the job queue.
Attachments are never stored; they travel only in the enquiry mail. Logs are JSON lines with
ids, timings and outcome codes only, never names, addresses or free text.
