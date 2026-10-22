# Assistant backend (pilot)

The form backend of the Schreinerei Schmidt site: it receives the configurator and contact
posts, delivers the enquiry mail to the owner and runs the Angebot pipeline. Spec:
`docs/angebot.md` (phases 7b–7f) and `docs/assistant.md` §2.2 and §8.

Phase 7b (this package so far): Hono server, `POST /anfrage` (form.taxi-compatible),
server-side validation against `src/lib/configurator/fields.ts`, SQLite store, job runner with
the `preis` step, the enquiry mail and `SEND_MODE`. Claude (7c), the TL;DR mail, review page and
customer mails (7d) come later.

It is its own npm package (Node 24, ESM, TypeScript 6.0.3) and imports the shared configurator
code from `../src/lib/configurator/` by relative path; the production bundle inlines it.

## Commands

Run them in `assistant/`:

| Command             | What it does                                                  |
| ------------------- | ------------------------------------------------------------- |
| `npm ci`            | Install the pinned dependencies                               |
| `npm run dev`       | Dev server with reload (`tsx watch`), reads `.env` if present |
| `npm run typecheck` | `tsc --noEmit` with the site's strictness                     |
| `npm test`          | Vitest, in-process, a temp data directory per test            |
| `npm run build`     | esbuild bundle `dist/server.mjs` (npm packages stay external) |
| `npm start`         | Run the bundle (`npm ci --omit=dev` is enough on the host)    |

`GET /health` answers `204`. Outside production, `GET /dev/outbox` lists the dry-run mails.

## Configuration

All names are in `.env.example` (no values). Locally, copy it to `.env` (git-ignored); on a host,
use its secret store. Without `NODE_ENV=production` everything has a safe default
(`SEND_MODE=dry-run`, `DATA_DIR=./data`, `.invalid` addresses). In production the process
refuses to start until `PUBLIC_BASE_URL`, `SITE_ORIGIN`, `OWNER_EMAIL`, `MAIL_FROM`, `SEND_MODE`
and `DATA_DIR` are set; errors name the variables, never their values.

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
