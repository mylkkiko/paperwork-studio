# Paperwork Studio

<!-- Replace OWNER/REPO with the GitHub repository path once the repo is on GitHub. -->
[![CI](https://github.com/OWNER/REPO/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/OWNER/REPO/actions/workflows/ci.yml)

Armenian document templates for the Academy: student agreements, termination acts, enrollment letters, vacation
orders, partner invoices. Fill templates from the Core Engine, generate print-ready packs (PDF + Word) for a whole
group, compare template versions clause by clause with a plain-language summary, and track who signed which version.

```
paperwork-studio/
  backend/            Node.js + Express + TypeScript REST API   -> backend/README.md
  frontend/           Next.js app                               -> frontend/README.md
  docker/             Gotenberg font config, Postgres init (test database)
  docker-compose.yml  postgres, redis, gotenberg, mailpit, backend, frontend
  docs/PLAN.md        plan, risks, assumptions
```

## Run

```bash
docker compose up --build
```

| What | URL |
| --- | --- |
| **App** | **http://localhost:3100** |
| API | http://localhost:4000/api |
| Mailpit (all outgoing emails, signing links) | http://localhost:8025 |

The first start builds the images and seeds demo data (about 2–4 minutes). UI languages: Armenian (default),
English, Russian; documents are always Armenian.

## Demo credentials

| Role | Email | Password |
| --- | --- | --- |
| admin | `admin@academy.am` | `Admin123!` |
| editor | `editor@academy.am` | `Editor123!` |
| coordinator | `coordinator@academy.am` | `Coord123!` |

In this test/demo environment the login page shows these accounts with one-click "Log in as …" buttons
(hidden when the frontend is built with `APP_ENV=production`).

Recipients have no account: they open the link from their email (see Mailpit), read and print the document, sign it
by hand next to the ☐ box and hand the paper to their coordinator. The coordinator uploads the scan, which sets the
document to "signed" — there is no online signing. The 14-day link lifetime is the deadline to hand in the paper.

The test/staging environment has no extra password gates; only the app's own login.

Clean restart with fresh demo data: `docker compose down -v && docker compose up --build`.

## Tests

```bash
npm --prefix backend install && npm --prefix frontend install   # once
npx --prefix frontend playwright install chromium              # once, for E2E
docker compose up -d --build                                    # backend tests use its Postgres + Gotenberg; E2E uses the whole stack

npm test            # backend (Jest + Supertest, 330 tests) + frontend unit/component (Vitest, 57 tests)
npm run test:e2e    # Playwright end-to-end against the running stack (23 tests)
```

Details: [backend/README.md](backend/README.md#tests), [frontend/README.md](frontend/README.md#tests).

## Not in this build (P2, extension points only)

| Item | Extension point |
| --- | --- |
| In-browser template editor (T-9) | templates are uploaded as .docx; `TemplatesService.create/addVersion` take a buffer from any source |
| LLM-written change summary (V-6) | `SummaryGenerator` interface (`backend/src/services/summary/`), wired in `backend/src/container.ts` |
| Qualified e-signatures (S-8), e.g. Armenian ID card / mobile ID | `Signature.method` + `SignatureMethod` enum (`online` is kept, unused, for this; today only `paper` is recorded) |
| Real Core Engine | `CoreEngineClient` interface; today `StubCoreEngineClient` |
| S3 storage | `StorageService` interface; today `LocalStorageService` |
