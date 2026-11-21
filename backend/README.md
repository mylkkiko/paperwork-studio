# Paperwork Studio — Backend

REST API for Armenian document templates: upload `.docx` templates with `{{merge.fields}}`, generate PDF + Word packs
for a whole group, compare template versions clause by clause, and collect online/paper signatures with reminders.

Node.js 20 · Express 5 · TypeScript · PostgreSQL 16 + Prisma · BullMQ + Redis · docxtemplater · Gotenberg (LibreOffice) · Mailpit

---

## Quick start (everything in Docker)

From the repository root:

```bash
docker compose up --build
```

On first start the backend applies migrations and seeds demo data (skipped on later starts).

| What | URL |
| --- | --- |
| API | http://localhost:4000/api (health: `/api/health`) |
| Mailpit — every email the app sends | http://localhost:8025 |
| Gotenberg (PDF converter) | http://localhost:3010 |
| PostgreSQL | `localhost:5433` (user/password/db: `paperwork`) |
| Redis | `localhost:6380` |

Host ports avoid the defaults (5432, 6379, 3000) because they are often taken on dev machines.

### Demo credentials

| Role | Email | Password |
| --- | --- | --- |
| admin | `admin@academy.am` | `Admin123!` |
| editor | `editor@academy.am` | `Editor123!` |
| coordinator | `coordinator@academy.am` | `Coord123!` |

### Demo data

- **Core Engine stub** (in memory, `src/integrations/core-engine/stub-data.ts`): group `grp-web-2026-a` «ՎԾ-2026-Ա» with
  24 students, 5 staff, 3 partners. Two students are incomplete on purpose so the precheck has something to show:
  `stu-007` has no passport, `stu-015` has no address.
- **Templates**: «Ուսուցման պայմանագիր» v1 published + v2 draft (comparison demo: clause 3.2 removed, 4.2 payment term
  10 → 5 days, 6.2 added), «Պայմանագրի լուծման ակտ» v1 published, «Ընդունելության ծանուցում» v1 published.

To start over with a clean demo: `docker compose down -v && docker compose up --build`.

---

## Local development

Run the infrastructure in Docker and the API on your machine (hot reload):

```bash
docker compose up -d postgres redis gotenberg mailpit
cd backend
cp .env.example .env
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev            # http://localhost:4000
```

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | API + background workers with hot reload (tsx) |
| `npm run build` / `npm start` | Compile to `dist/` / run compiled |
| `npm run typecheck` | TypeScript check only |
| `npm run prisma:migrate` | Create/apply a migration after editing `prisma/schema.prisma` |
| `npm run db:seed` | Seed demo data (no-op if users exist) |
| `npm run db:reset` | Drop the database, re-migrate, re-seed |
| `npm run seed:templates` | Regenerate the Armenian seed `.docx` files in `seed/templates/` |
| `npm run inspect:docx -- file.docx` | Print a template's text, fields and clause numbers |
| `npx tsx scripts/try-compare.ts a.docx b.docx` | Compare two templates and print the summary |
| `./scripts/walkthrough.sh` | End-to-end curl walkthrough (below) |
| `npm test` | Test suite (Phase 2) |

### Environment variables

See [.env.example](.env.example) for defaults.

| Variable | Meaning |
| --- | --- |
| `PORT` | API port (4000) |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis for BullMQ jobs |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Access-token signing key (≥ 16 chars) and lifetime (`8h`) |
| `STORAGE_DIR` | Where templates, generated documents and scans are stored. Never served statically. |
| `GOTENBERG_URL` | PDF converter |
| `SMTP_HOST`, `SMTP_PORT`, `MAIL_FROM` | Outgoing mail (Mailpit in dev) |
| `APP_PUBLIC_URL` | Frontend URL, used to build signing links in emails (`…/sign/<token>`) |
| `CORS_ORIGIN` | Allowed browser origin(s), comma-separated, or `*` |
| `APP_TIMEZONE` | Timezone for printed dates/times (`Asia/Yerevan`) |
| `SIGN_LINK_TTL_DAYS` | Signing link lifetime (14) |
| `REMINDER_SCHEDULE_DAYS` | Auto-reminder days after sending (`2,5`) |
| `REMINDER_CRON` | How often the reminder job runs (`0 * * * *` = hourly) |
| `GENERATION_CONCURRENCY` | Parallel PDF conversions per batch (4) |
| `SEED_ON_START` | Docker only: seed on container start |

---

## API

Full spec: [openapi.yaml](openapi.yaml) (OpenAPI 3.0; 44 operations, checked against the Express routes).

All errors are `{"error": {"code": "...", "message": "...", "details": ...}}` with a matching HTTP status
(400 validation, 401 no/invalid token, 403 role, 404, 409 state conflict, 410 expired link, 422 business rule).

| Role | Can |
| --- | --- |
| admin | everything (passes every role check) |
| editor | upload templates and versions, edit summaries, publish |
| coordinator | precheck, generate, send, remind, paper signatures, signature table, exports |
| signer (no account) | `/api/sign/:token` only |

### curl walkthrough

The whole main flow as one script (requires `curl` and `jq`; creates a new template each run):

```bash
./scripts/walkthrough.sh
```

It runs these steps; each prints its result:

```bash
API=http://localhost:4000/api
EDITOR=$(curl -s $API/auth/login -H 'content-type: application/json' \
  -d '{"email":"editor@academy.am","password":"Editor123!"}' | jq -r .token)
COORD=$(curl -s $API/auth/login -H 'content-type: application/json' \
  -d '{"email":"coordinator@academy.am","password":"Coord123!"}' | jq -r .token)

# 1. Upload a template -> v1 draft (response includes field warnings)
curl -s $API/templates -H "authorization: Bearer $EDITOR" \
  -F title='Ուսուցման պայմանագիր' -F category=student_agreement \
  -F file=@seed/templates/student_agreement_v1.docx
#    -> {"template":{"id":TPL,...},"version":{"id":V1,...},"warnings":[]}

# 2. Publish
curl -s -X POST $API/templates/$TPL/versions/$V1/publish -H "authorization: Bearer $EDITOR"

# 3. Precheck the group: shared values to enter + recipients with missing data
curl -s $API/batches/precheck -H "authorization: Bearer $COORD" -H 'content-type: application/json' \
  -d '{"templateId":"'$TPL'","recipientType":"student","groupId":"grp-web-2026-a"}'
#    -> missingCommon: contract.date, contract.amount; stu-007 missing passport; stu-015 missing address

# 4. Generate 24 documents (fill the gaps; or put ids in "excludedIds" to skip recipients)
curl -s $API/batches -H "authorization: Bearer $COORD" -H 'content-type: application/json' -d '{
  "templateId":"'$TPL'","recipientType":"student","groupId":"grp-web-2026-a",
  "commonValues":{"contract.date":"2026-11-21","contract.amount":450000},
  "overrides":{"stu-007":{"student.passport":"AN7654321"},"stu-015":{"student.address":"ք. Երևան, Աբովյան փ. 52"}}}'
curl -s $API/batches/$BATCH -H "authorization: Bearer $COORD"          # poll: {"status":"running","progress":12,"total":24}
curl -so pack.zip $API/batches/$BATCH/zip -H "authorization: Bearer $COORD"
curl -so pack.pdf $API/batches/$BATCH/merged-pdf -H "authorization: Bearer $COORD"

# 5. Send for signature (emails appear in Mailpit)
curl -s $API/documents/send -H "authorization: Bearer $COORD" -H 'content-type: application/json' \
  -d "$(curl -s "$API/documents?batchId=$BATCH" -H "authorization: Bearer $COORD" | jq -c '{documentIds:[.items[].id]}')"

# 6. Signer: token comes from the email link http://localhost:3100/sign/<TOKEN>
curl -s $API/sign/$TOKEN                                               # info; marks "viewed"
curl -s -X POST $API/sign/$TOKEN -H 'content-type: application/json' -d '{"agree":true}'
curl -so signed.pdf $API/sign/$TOKEN/pdf                               # PDF with ☑ and confirmation time

# 7. Remind someone who hasn't signed, then look at the table / export
curl -s -X POST $API/documents/$DOC/remind -H "authorization: Bearer $COORD"
curl -s "$API/signatures/table?groupId=grp-web-2026-a" -H "authorization: Bearer $COORD"
curl -so signatures.xlsx "$API/signatures/export?format=xlsx&groupId=grp-web-2026-a" -H "authorization: Bearer $COORD"
```

---

## How it works (where to look)

| Concern | File |
| --- | --- |
| Wiring of all services (one place) | [src/services/index.ts](src/services/index.ts), [src/container.ts](src/container.ts) |
| Field extraction (incl. fields split across Word runs), rendering, ☐/☑ font handling | [src/services/docx.service.ts](src/services/docx.service.ts) |
| Value resolution order, Armenian formatting | [src/services/recipients.service.ts](src/services/recipients.service.ts), [src/services/formatters.ts](src/services/formatters.ts) |
| Clause splitting | [src/services/clauses.service.ts](src/services/clauses.service.ts) |
| Clause matching + word diff | [src/services/compare.service.ts](src/services/compare.service.ts) |
| Rule-based change summary | [src/services/summary/RuleBasedSummaryGenerator.ts](src/services/summary/RuleBasedSummaryGenerator.ts) |
| Version lifecycle, upload warnings, preview | [src/services/templates.service.ts](src/services/templates.service.ts) |
| Precheck, generation job, ZIP + merged PDF, numbering | [src/services/batches.service.ts](src/services/batches.service.ts) |
| Token handling (hashing, expiry, revoke) | [src/services/sign-links.service.ts](src/services/sign-links.service.ts) |
| Public signing | [src/services/signing.service.ts](src/services/signing.service.ts) |
| Send / remind / paper signature / resend new version | [src/services/documents.service.ts](src/services/documents.service.ts) |
| Auto reminders + expiry | [src/services/reminders.service.ts](src/services/reminders.service.ts) |
| Background jobs | [src/jobs/queues.ts](src/jobs/queues.ts) |

Extension points (swap in `container.ts`): `CoreEngineClient` (HTTP client later), `StorageService` (S3),
`PdfConverter`, `Mailer`, `SummaryGenerator` (LLM summary, P2).

### Armenian fonts in PDFs

The stock Gotenberg image ships Noto Serif/Sans Armenian, but that font has no digits, Latin or ☐/☑. LibreOffice's
automatic fallback picked the colour-emoji font (grey wide digits, ☑ as an emoji), and a fallback ☐ broke the layout
of the whole line. Two fixes, both verified visually and by text extraction:

1. [docker/gotenberg/fonts.conf](../docker/gotenberg/fonts.conf) rejects the emoji font and sets the fallback order:
   Noto Serif Armenian → Noto Serif (digits, Latin) → DejaVu Sans (☐ ☑).
2. The renderer puts every ☐/☑ in its own Word run with an explicit `DejaVu Sans` font (`isolateSymbols`).

### Template conventions

- Merge fields: `{{group.key}}` from the dictionary (`/api/merge-fields`). Unknown fields are reported on upload and
  block publishing.
- Clause numbers must be typed (`4.2. …`), not Word automatic numbering. If a document uses automatic numbering and
  no typed numbers are found, the upload returns the warning `CLAUSES_NOT_DETECTED` (the draft is still saved).
- Every template should contain `{{signature.checkbox}}` (warning `MISSING_SIGNATURE_FIELD` otherwise).
