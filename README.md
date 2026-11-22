# Paperwork Studio

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

Signers have no account: they open the link from their email (see Mailpit).

The test/staging environment has no extra password gates; only the app's own login.

Clean restart with fresh demo data: `docker compose down -v && docker compose up --build`.
