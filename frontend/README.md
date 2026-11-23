# Paperwork Studio — Frontend

Next.js 15 (App Router) + TypeScript · Tailwind CSS 4 + shadcn/ui-style components · TanStack Query ·
react-hook-form + zod · next-intl (Armenian default, English, Russian).

The app talks to the backend **only through its REST API** (`NEXT_PUBLIC_API_URL`).

## Run

Everything (backend + frontend + services), from the repository root:

```bash
docker compose up --build
```

| What | URL |
| --- | --- |
| App | http://localhost:3100 |
| Public signing page | http://localhost:3100/sign/&lt;token&gt; (link from the email in Mailpit, http://localhost:8025) |

### Local development

```bash
docker compose up -d        # backend + services (or run the backend locally, see backend/README.md)
cd frontend
cp .env.example .env.local
npm install
npm run dev                 # http://localhost:3100 (hot reload)
```

| Variable | Meaning |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | Backend API **as seen from the browser**, e.g. `http://localhost:4000/api`. Inlined at build time. |
| `NEXT_PUBLIC_APP_ENV` | `development` / `test` / `production`. Demo logins on the login page are shown only when this is **not** `production`. |

In Docker these are build arguments (`PUBLIC_API_URL`, `APP_ENV` in `docker-compose.yml`). For a production build:
`APP_ENV=production docker compose build frontend`.

## Demo logins

Outside production the login page lists the seeded accounts with a one-click **"Log in as …"** button:

| Role | Email | Password |
| --- | --- | --- |
| admin | `admin@academy.am` | `Admin123!` |
| editor | `editor@academy.am` | `Editor123!` |
| coordinator | `coordinator@academy.am` | `Coord123!` |

## Screens

| Route | Who | What |
| --- | --- | --- |
| `/login` | everyone | Login, demo accounts (dev/test only), language switcher |
| `/dashboard` | all roles | Quick actions; recent packs and documents waiting for signature (coordinator), drafts (editor) |
| `/templates` | all roles | Library: search, filter by category and status, upload (editor) |
| `/templates/[id]` | all roles | Versions with statuses, preview PDF, fields with unknown ones highlighted, warnings, publish / upload version (editor), delete (admin) |
| `/templates/[id]/compare` | all roles | Two-column clause comparison with word diff (red removed, green added), moved clauses, editable summary + publish (editor, draft only) |
| `/generate` | coordinator | Wizard: template → recipients → precheck (fill in / exclude) → shared fields → progress `12 / 24` → ZIP, merged PDF, send |
| `/signatures` | coordinator | Table with filters (group, template, version, status, "signed an older version"), remind, upload the signed scan (required; the only way to "signed"), "View scan" on signed rows, export CSV/XLSX, send selected, resend new version |
| `/sign/[token]` | recipient (no login) | Document page, mobile-first: PDF, Download / Print, instruction (print → sign by hand next to ☐ → hand to the coordinator by the deadline), decline. States: open, signed on paper, declined, deadline passed (document still shown), replaced, invalid. No online signing |
| `/admin/users`, `/admin/merge-fields` | admin | Users and roles; merge-field dictionary |

Screenshots: [docs/screenshots](../docs/screenshots).

## How it is organised

```
messages/hy.json en.json ru.json   all UI strings (next-intl); `npm run i18n:check` verifies they match
src/i18n/                          locale from a cookie (not the URL, so /sign/<token> links stay simple)
src/lib/api.ts                     fetch wrapper: JWT, JSON errors -> ApiError, authenticated downloads
src/lib/auth.tsx                   session (token in localStorage, validated with /auth/me)
src/lib/roles.ts                   what each role can see (the API enforces the same rules)
src/lib/wizard.ts                  wizard state, step validation and API payload (pure functions)
src/lib/format.ts                  UI dates per language (Armenian month names done here: browsers lack them)
src/components/ui/                 shadcn/ui-style primitives (Radix + Tailwind), written in the repo
src/components/                    app shell, states (loading / error / 403), PDF viewer, diff view, wizard steps, ...
src/app/                           routes
```

### Look and theme

Design tokens for light and dark live in `src/app/globals.css` (see [docs/UI-REDESIGN.md](../docs/UI-REDESIGN.md) for
the measured contrast of every pair). Components use only tokens. The brand colour is the single variable `--brand`;
all accent shades in both themes are derived from it, so changing it is one line (then run `npm run test:e2e` —
the axe test checks contrast). Theme: next-themes, Light / Dark / System (default), toggle in the header and on the
signing page, stored in `localStorage`.

### Rules followed

- **No hard-coded UI strings**: every text goes through `next-intl`. `npm run i18n:check` checks that hy/en/ru have
  the same keys, that every message is valid ICU, and that every literal key used in code exists.
  Documents, emails and the stored change summary stay Armenian whatever the UI language.
- **Role-based UI**: navigation shows only what the role can do; opening a forbidden page by URL shows "no access";
  a 403 from the API is shown as a "no access" state, never a crash.
- **Loading and error states** on every page (`QueryState`, `ErrorState` with retry).
- **Files are never public**: downloads and in-app PDF previews fetch with the JWT and use blob URLs.
- **Responsive**: sidebar on desktop, menu on phones; wide tables scroll inside their card; on phones the PDF opens
  with a button (mobile browsers can't show a PDF inside a page).

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js on port 3100 |
| `npm run typecheck` | TypeScript |
| `npm run i18n:check` | Dictionary consistency |
| `npm run screenshots` | Walks the main flow in a real browser against the Docker stack and saves `docs/screenshots/*.png` (reset the stack first: `docker compose down -v && docker compose up -d`) |

| `npm test` | Unit/component tests (Vitest + React Testing Library + MSW) |
| `npm run test:coverage` | Same, with coverage |
| `npm run test:e2e` | End-to-end tests (Playwright) against the running Docker stack |

## Tests

### Unit / component (`npm test`, no backend needed)

The API is mocked with MSW, Next.js navigation is mocked, components render with the real i18n dictionaries.

| File | Covers |
| --- | --- |
| `tests/unit/diff-view` | word diff (red removed / green added), clause rows: changed, added, removed, moved, preamble |
| `tests/unit/wizard` | every step's validation, API payload (empty values dropped, amounts as numbers), shared-fields form errors and submit |
| `tests/unit/precheck-table` | ready/missing/excluded summary, inline fill per recipient, exclude disables inputs |
| `tests/unit/signatures` | filters ⇄ URL ⇄ API query, actions per status, select-all, "signed an older version" + resend, error state |
| `tests/unit/roles` | menu per role, forbidden URLs show "No access", redirect to login, 403 handling |
| `tests/unit/sign-flow` | document page states: open (instruction, Download / Print, no checkbox or sign button), signed on paper, declined (+ decline error), deadline passed in hy/ru/en, replaced, invalid, error |
| `tests/unit/login` | demo one-click login, validation, translated error (Russian) |
| `tests/unit/format-i18n` | Armenian/English/Russian dates, missing-translation marker, dictionary consistency |

### End-to-end (`npm run test:e2e`)

Against the real stack: `docker compose up -d --build` first (Chromium is installed with `npx playwright install chromium`).
Each run creates its own templates with unique names, so it works on any database state; Mailpit is emptied first.

| Spec | Scenario |
| --- | --- |
| `main-flow` 1 | editor uploads v2 → comparison (counts, word diff, summary) → edits summary → publishes; v1 archived |
| `main-flow` 2 | coordinator wizard for the 24-student group: precheck fills, shared fields, progress → ZIP download (checked) → send 24 |
| `main-flow` 3 | recipient opens the link from Mailpit → sees the document and the instruction, no sign button; coordinator uploads the scan (refused without a file) → "signed" on v2, "View scan"; the link then shows "signed on paper" |
| `main-flow` 4 | "remind now" → reminder email in Mailpit, counter updated |
| `main-flow` 5 | "signed an older version" filter → resend → email with the change summary → new v2 document sent |
| `main-flow` 6 | deadline passed → the page still shows the document with "deadline passed, contact your coordinator", no decline; row shows expired |
| `main-flow` 7 | recipient declines via the link → coordinator sees "declined" |
| `theme` | Light / Dark / System toggle, choice persists after reload, System follows the OS (`colorScheme`), no flash of the wrong theme, PDF area stays white |
| `a11y` | axe-core (WCAG 2.1 A/AA incl. contrast) on login, signing page, dashboards, templates, template detail, compare, wizard, signatures, admin — light and dark; fails on serious/critical |
| `mobile-signing` | phone viewport: instruction + Download / Print (no empty PDF frame, no sign button, no horizontal scroll), the PDF opens; after the coordinator uploads the scan the page shows "signed on paper" |
| `languages` | hy → ru → en on dashboard and signatures table: no missing keys (visible `⟦missing:…⟧` marker), no raw keys, no i18n console errors, choice remembered; phone (375 px): nothing overflows the screen in any language, incl. the document page (open and deadline passed) |

The deadline can't be waited for (14 days), so scenario 6 moves the link's expiry into the past directly in Postgres
(`docker compose exec postgres psql …`). A missing translation renders as `⟦missing:namespace.key⟧`
(`src/i18n/fallback.ts`), which the language test looks for.
