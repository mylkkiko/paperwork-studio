# Paperwork Studio — UI redesign (v2): audit and proposal

Goal: a calm, clean, professional interface that is comfortable during long work with tables and documents,
in a light and a dark theme. **Scope: visual layer only** — no changes to business logic, API calls, routes, data,
documents (PDF/DOCX), emails or generated files.

Audit screenshots (current UI, light, desktop 1440×900 and phone 390×844, Armenian):
[docs/screenshots/ui-v1-audit/](screenshots/ui-v1-audit/) — 61 images, produced by `frontend/e2e/audit.spec.ts`.
File names are referenced below as `desktop-26` = `light-desktop-26-compare.png`, etc.

---

## 1. Audit — what is wrong today

### 1.1 Layout and spacing
| # | Problem | Where |
| --- | --- | --- |
| L1 | **Inputs unreachable on phones**: the precheck table puts the missing-value inputs in the 2nd column, which scrolls off-screen. A coordinator on a phone can barely complete step 3. | phone-33 |
| L2 | **Key columns off-screen on phones**: status, dates and actions of the signatures table and the versions table are only reachable by horizontal scrolling; the first visible columns are the least important. | phone-37, phone-24 |
| L3 | **Filters eat the phone screen**: four stacked selects + a checkbox (~300 px) before the first table row. | phone-37 |
| L4 | **Dashboard tables wrap and clip**: template titles wrap to 4 lines, the date column is cut off at 1440 px. | desktop-30 |
| L5 | **No real header**: language switcher and logout live at the bottom of the sidebar; there is no place for a theme toggle; the user has to look in two places. | all desktop |
| L6 | **Sidebar background stops at the viewport height** on long pages (the area below is a different colour). | desktop-42, desktop-37 |
| L7 | Wide pages use the full width (1170 px of text lines in summary/comparison); no max content width. | desktop-26 |
| L8 | Stepper labels truncated on phones ("Տվյալների …", "Ընդհանուր …"); current vs. done vs. next differ only slightly. | phone-31..36 |
| L9 | Summary editor toolbar wraps into two uneven rows on phones. | phone-26 |

### 1.2 Typography
| # | Problem |
| --- | --- |
| T1 | **Body text is 14 px** (`text-sm`) almost everywhere, 12 px in tables' secondary lines and badges. Armenian letterforms are dense; 14 px is tiring for long sessions. |
| T2 | **No web font**: the stack falls back to the OS (San Francisco / Segoe UI + whatever Armenian font the OS has), so Armenian, Cyrillic and Latin come from different fonts with different x-heights — visible in mixed lines like "PS-2026-000001 · Ուսուցման պայմանագիր". |
| T3 | Weak heading hierarchy: card titles (16 px semibold) look the same as table headers' importance; page titles 24 px with no secondary level between. |
| T4 | Numbers (document numbers, counters, dates) are proportional → columns don't line up. |

### 1.3 Colour and contrast (measured, WCAG 2.x)
| Pair | Ratio | Result |
| --- | --- | --- |
| Success badge text on its tint | 3.75:1 | **fails AA** (small text) |
| Danger badge text on its tint | 4.42:1 | **fails AA** |
| Input border vs. white (non-text, 1.4.11) | 1.44:1 | **fails 3:1** — inputs barely visible |
| Disabled primary button | 2.55:1 | exempt, but unreadable |
| Body / secondary text, links, primary button | 5.5–16:1 | pass |

Other colour issues: hard-coded Tailwind colours in components (`red-100`, `green-800`, `amber-500` in the diff view;
`oklch(...)` literals in badges/warnings) — they won't adapt to a dark theme. Status colours are not systematic:
*viewed* and *draft* use the same amber, *declined* and *expired* the same red.

### 1.4 Components
| # | Problem | Where |
| --- | --- | --- |
| C1 | Buttons: primary/outline/secondary/ghost/link variants used ad hoc (e.g. "Remind" outline, "Paper" outline, "Scan" ghost); no danger style for "Deactivate"; disabled primary looks broken. | desktop-37, desktop-40 |
| C2 | Badges: two shapes (pills with/without border), category badge in outline style looks like a status. | desktop-24 |
| C3 | Native `<select>` styling differs per OS; language switcher is a raw select. | all |
| C4 | **Empty states** have no action ("No templates match the filters." — no "Clear filters"; signatures empty — no "Generate a pack"). | desktop-22, desktop-38 |
| C5 | **"No access"** page: no way back. | desktop-29 |
| C6 | Tables: no sticky header (signatures table is 24+ rows), hover is barely visible, row height inconsistent (48–90 px depending on wrapped text). | desktop-37, desktop-42 |
| C7 | Dialog overlay is a flat 40% black; dialogs have no visible separation of header / body / footer; long Armenian titles touch the close button. | desktop-25, desktop-28 |
| C8 | Toasts sit over the page actions (CSV/XLSX) at top-right. | desktop-37 (Phase 3) |
| C9 | Focus ring only on inputs/buttons; links in tables, the template cards (radio) and the clause rows have no visible focus. | keyboard check |
| C10 | Skeletons are uniform grey bars that don't resemble the content; the version panel shows 3 bars that jump. | phone-24 |
| C11 | Diff colours are hard-coded light tints; in a dark theme they would be glaring or unreadable. | desktop-26 |

### 1.5 Languages
Armenian is the longest of the three (e.g. "Ստորագրել են հին տարբերակը", "Հետևել ստորագրություններին"); today it wraps
in quick-action cards (desktop-30), table headers ("Ստորագրվել է" on two lines) and the stepper. Russian is close
behind. Layouts must be designed for Armenian first.

---

## 2. Design tokens

All colours become CSS variables, defined for both themes; components use **only** tokens (no Tailwind colour
classes like `red-100`, no literal `oklch()`/hex). Theme switching = `class="dark"` on `<html>` (next-themes).

```css
:root {
  /* surfaces */
  --bg:            #F5F6F8;   /* page */
  --surface:       #FFFFFF;   /* cards, tables, dialogs */
  --surface-muted: #F0F2F5;   /* table header, hover, inset areas */
  --border:        #E0E4EA;   /* dividers, card borders */
  --border-strong: #858F9E;   /* input borders (3:1 non-text) */
  /* text */
  --text:          #1C2430;   /* primary text (not pure black) */
  --text-muted:    #576170;   /* secondary text, captions, placeholders */
  /* accent (one colour) */
  --accent:        #2C5A96;   /* primary buttons, selected states */
  --accent-hover:  #244B7E;
  --accent-fg:     #FFFFFF;   /* text on accent */
  --accent-soft:   #E7EEF7;   /* active nav item, selected row */
  --accent-text:   #24508A;   /* links, active nav text */
  /* feedback tones: fg = text/icon, bg = tint */
  --neutral-fg: #4A5361;  --neutral-bg: #ECEEF2;
  --info-fg:    #1E5F86;  --info-bg:    #E2EFF6;
  --violet-fg:  #5A3E99;  --violet-bg:  #EEE9F8;
  --success-fg: #1B6B42;  --success-bg: #E3F2E9;
  --warning-fg: #7A4F00;  --warning-bg: #FBEFD5;
  --danger-fg:  #A3222A;  --danger-bg:  #FBE8E9;
  --danger-solid: #B4262E; --danger-solid-fg: #FFFFFF;   /* destructive buttons */
  /* diff */
  --diff-removed-fg: #8A1C1C; --diff-removed-bg: #FCE1E1;
  --diff-added-fg:   #135A33; --diff-added-bg:   #D9F1E2;
  /* focus */
  --focus: #2F6FD0;
  /* the PDF page stays white in both themes */
  --paper: #FFFFFF;
  --overlay: rgb(16 20 26 / 0.45);
  --shadow-sm: 0 1px 2px rgb(16 24 40 / 0.06);
  --shadow-md: 0 4px 16px rgb(16 24 40 / 0.10);
}

.dark {
  --bg:            #16191E;   /* soft dark grey, not black */
  --surface:       #1D2128;
  --surface-muted: #242A32;
  --border:        #2F353F;
  --border-strong: #6B7482;
  --text:          #E2E5EA;   /* not pure white */
  --text-muted:    #A3ABB7;
  --accent:        #5B88C4;   /* desaturated */
  --accent-hover:  #6995CE;
  --accent-fg:     #0F151E;
  --accent-soft:   #233246;
  --accent-text:   #9DBDE6;
  --neutral-fg: #B9C0CA;  --neutral-bg: #2A3038;
  --info-fg:    #8CC6DE;  --info-bg:    #1C3340;
  --violet-fg:  #C3B2EC;  --violet-bg:  #2E2843;
  --success-fg: #8FD0AA;  --success-bg: #1C3528;
  --warning-fg: #E6BE6E;  --warning-bg: #3A2F16;
  --danger-fg:  #F19C9C;  --danger-bg:  #3E2125;
  --danger-solid: #D45C61; --danger-solid-fg: #0F151E;
  --diff-removed-fg: #F6C3C3; --diff-removed-bg: #4B2328;
  --diff-added-fg:   #BDE7CB; --diff-added-bg:   #1E3C2B;
  --focus: #8CB4EE;
  --paper: #FFFFFF;
  --overlay: rgb(0 0 0 / 0.6);
  --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.3);
  --shadow-md: 0 6px 20px rgb(0 0 0 / 0.4);
  color-scheme: dark;         /* native scrollbars, date pickers, selects follow the theme */
}
```

These are mapped into Tailwind 4 with `@theme inline` (e.g. `--color-surface: var(--surface)`), so classes read
`bg-surface text-text-muted border-border` and the dark theme is just a different set of variable values.

### 2.1 Measured contrast of the proposal (WCAG 2.x, computed)

| Pair | Needs | Light | Dark |
| --- | --- | --- | --- |
| body text / page bg | 4.5:1 | 14.45:1 | 13.95:1 |
| body text / surface | 4.5:1 | 15.62:1 | 12.79:1 |
| secondary text / surface | 4.5:1 | 6.27:1 | 6.97:1 |
| secondary text / page bg | 4.5:1 | 5.8:1 | 7.61:1 |
| secondary text / table header & hover | 4.5:1 | 5.59:1 | 6.24:1 |
| link & active nav text / surface | 4.5:1 | 8.11:1 | 8.35:1 |
| active nav text / accent-soft | 4.5:1 | 6.94:1 | 6.72:1 |
| primary button text / accent | 4.5:1 | 6.98:1 | 5.03:1 |
| primary button hover | 4.5:1 | 8.81:1 | 5.92:1 |
| danger button text | 4.5:1 | 6.45:1 | 4.8:1 |
| input border / surface (non-text) | 3:1 | 3.27:1 | 3.42:1 |
| focus ring / surface (non-text) | 3:1 | 4.88:1 | 7.6:1 |
| focus ring / page bg (non-text) | 3:1 | 4.51:1 | 8.29:1 |
| badge neutral | 4.5:1 | 6.69:1 | 7.26:1 |
| badge info | 4.5:1 | 5.9:1 | 7.04:1 |
| badge violet | 4.5:1 | 6.83:1 | 7.26:1 |
| badge success | 4.5:1 | 5.62:1 | 7.41:1 |
| badge warning | 4.5:1 | 6.25:1 | 7.48:1 |
| badge danger | 4.5:1 | 6.32:1 | 6.88:1 |
| diff removed text | 4.5:1 | 7.51:1 | 8.61:1 |
| diff added text | 4.5:1 | 6.95:1 | 8.9:1 |

Dark-theme principles applied: background `#16191E` (not black), text `#E2E5EA` (not white), accent and tones
desaturated and lightened, tints dark (no glowing pastel blocks), shadows replaced by slightly lighter surfaces.

---

## 3. Typography

**Font**: Noto Sans (Latin + Cyrillic) + Noto Sans Armenian, self-hosted through `next/font/google` (downloaded at
build time, served by the app — no runtime requests to Google). Same design family → equal x-height and stroke across
the three scripts. Stack: `"Noto Sans", "Noto Sans Armenian", system-ui, sans-serif` — the browser takes Armenian
glyphs from Noto Sans Armenian automatically. Monospace (merge-field keys): `ui-monospace, "SF Mono", Menlo, monospace`.

| Token | Size / line height | Weight | Use |
| --- | --- | --- | --- |
| `text-display` | 26 / 34 px (22 / 30 on phones) | 650 | page title (h1) |
| `text-title` | 18 / 26 px | 600 | card / section title (h2), dialog title |
| `text-subtitle` | 16 / 24 px | 600 | sub-sections (h3), wizard step title |
| `text-body` | **15 / 24 px** (1.6) | 400 | default body text, table cells, inputs |
| `text-body-lg` | 16 / 26 px | 400 | signing page (read by recipients on phones) |
| `text-small` | 13.5 / 20 px | 400–500 | secondary lines (emails, template under number), table headers, captions |
| `text-xs` | 12.5 / 18 px | 500 | badges only |

- Body 15 px (16 px on the public signing page and phones' inputs to avoid iOS zoom).
- Headings with `text-wrap: balance`; paragraphs with `text-wrap: pretty`; `overflow-wrap: anywhere` on cells with long
  Armenian compounds and e-mails so nothing pushes the layout.
- `font-variant-numeric: tabular-nums` for document numbers, counts, dates and amounts; numeric columns right-aligned.
- Table headers: sentence case, `text-small`, weight 500, `text-muted` (no ALL CAPS — unreadable in Armenian).

## 4. Spacing, radius, elevation, motion

| Spacing (4 px base) | `1`=4 · `2`=8 · `3`=12 · `4`=16 · `5`=20 · `6`=24 · `8`=32 · `10`=40 · `12`=48 |
| --- | --- |
| Page padding | 16 (phone) · 24 (tablet) · 32 (desktop) |
| Card padding | 20 (phone 16); gap between cards 24 |
| Form field gap | 16 vertical; label → input 6 |
| Table cell | 12 horizontal · row height **48 px** (single-line rows; two-line rows 60 px) |
| Max content width | 1280 px for pages; 760 px for reading text (summary, signing page) |

| Radius | `sm` 6 px (badges, small buttons) · `md` 8 px (inputs, buttons) · `lg` 12 px (cards, dialogs) · `full` (avatars, dots) |
| --- | --- |
| Elevation | cards: border + `--shadow-sm`; dialogs/menus: `--shadow-md`; dark theme relies on surface lightness instead |
| Motion | 120–160 ms `ease-out` for hover/press/menus/dialogs; no motion at all under `prefers-reduced-motion: reduce` (transitions, skeleton shimmer and spinner rotation off — spinner becomes a static icon + text) |

## 5. Status badges — one colour per status, everywhere

Same badge component everywhere (tables, cards, signing page, dashboard): rounded `sm`, tint background, coloured
text **plus a small icon**, so status is never conveyed by colour alone.

### Document status
| Status | Tone | Icon | Reasoning |
| --- | --- | --- | --- |
| created | neutral (grey) | `FilePlus` | exists, nothing happened yet |
| sent | info (blue) | `Send` | in progress, waiting |
| viewed | violet | `Eye` | opened by the signer, distinct from *sent* |
| signed | success (green) | `CheckCircle2` | done |
| declined | danger (red) | `XCircle` | negative final state |
| expired | warning (amber) | `Clock` | needs action: send again |

### Version status
| Status | Tone | Icon |
| --- | --- | --- |
| draft | warning (amber) | `PencilLine` |
| published | success (green) | `BadgeCheck` |
| archived | neutral (grey) | `Archive` |

### Other badges
- Batch: queued neutral · running info (with progress) · completed success · failed danger.
- Version marker in the signatures table: *current* success (subtle outline), *older* warning.
- Field source: core info · manual warning · system neutral. Category: plain text label (not a badge).
- All tone pairs measured above (≥ 5.6:1 light, ≥ 6.9:1 dark).

## 6. Components and patterns

| Component | Spec |
| --- | --- |
| **Buttons** | 4 variants only: **primary** (accent, one per area), **secondary** (surface + strong border), **ghost** (text only, for low-emphasis/icon actions), **danger** (solid red, destructive). Sizes: sm 32 px, md 40 px, lg 48 px (signing page). Icon-only buttons have a tooltip + aria-label. Disabled = surface-muted bg + text-muted (not transparent accent). Loading = spinner + label kept. |
| **Inputs / selects / textarea** | 40 px height, `--border-strong`, radius md, 15 px text (16 px on phones); error = danger border + message with icon below; selects get a consistent chevron and follow `color-scheme`. |
| **Dialogs** | overlay `--overlay` + blur 2 px; panel radius lg, `--shadow-md`; header (title + description), scrolling body, footer with right-aligned actions separated by a border; full-screen sheet on phones. |
| **Menus** (theme, language, user) | Radix dropdown, 8 px radius, keyboard navigable, checkmark on the active item. |
| **Toasts** | bottom-right on desktop, top on phones; follow the theme; success/error/info icons; never cover page actions. |
| **Tables** | sticky header (`surface-muted`), 48 px rows, hover `surface-muted`, selected rows `accent-soft`, zebra off, numeric columns right-aligned + tabular, horizontal scroll inside the card with a fade edge; **first column sticky** on small screens; column order = importance (recipient, **status**, document, version, dates, actions). |
| **Empty states** | icon, one-line title, one short hint, one action (e.g. *Clear filters*, *Generate a pack*, *Upload template*). |
| **Loading** | skeletons shaped like the content (table rows with cells, card with title + lines) instead of grey bars; buttons show spinners. |
| **No access** | lock icon, short explanation, *Back to dashboard* button. |
| **Focus** | 2 px `--focus` ring with 2 px offset on every interactive element (`:focus-visible`), including table links, card-radios and menu items. |
| **Diff** | removed: `--diff-removed-*` + strike-through; added: `--diff-added-*` + underline-free highlight; also icons/labels "Removed"/"Added" in the legend, so colour is not the only signal. |
| **PDF preview** | container with `--paper` (white) background and `color-scheme: light` in both themes; a thin border so the page edge is visible in dark mode. |

## 7. Layout changes

- **Top header** (desktop and phone): page context on the left; **theme toggle** (sun / moon / monitor icon → menu
  *Light / Dark / System*), **language menu** and **user menu** (name, role, *Log out*) on the right. Sidebar keeps
  navigation only and spans the full page height.
- **Public signing page**: header with app name, language menu and theme toggle; reading width 760 px; 16 px text;
  sticky action bar on phones (kept).
- **Phones**:
  - signatures and versions tables: sticky first column + status moved next to the name; filters collapsed into a
    *Filters* button with a count of active filters;
  - precheck: **one card per recipient** (name, missing fields as full-width inputs, *Exclude* switch) instead of a table;
  - stepper: compact "Step 3 of 6 · Check data" with a progress bar; full stepper from `sm` up;
  - summary editor actions in one row (icon + short label), *Publish* as the primary.
- **Wizard stepper** (desktop): done = filled accent circle with check + accent connector, current = accent ring +
  bold label, next = neutral outline; connectors between steps; labels never truncated (wrap to two lines if needed).
- **Dashboard**: quick actions as compact tiles that fit Armenian labels; recent packs show title (one line, ellipsis
  with tooltip) + version as a second line; dates never clipped.

## 8. Theme implementation (Step 2)

- `next-themes` with `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`.
  next-themes injects a tiny blocking script in `<head>` that sets the class before first paint → **no flash**.
  `<html suppressHydrationWarning>`. Choice stored in `localStorage` (`theme` key) → persists across reloads.
- Tailwind 4: `@custom-variant dark (&:where(.dark, .dark *));`
- Theme toggle labels and the three options go into hy/en/ru dictionaries.
- sonner `Toaster` gets `theme={resolvedTheme}`.

## 9. Tests to add (Step 2)

- Playwright: toggle Light → Dark → System; `html.dark` set/unset; persists after reload; with `colorScheme: 'dark'`
  and the System option the dark class is applied, with `colorScheme: 'light'` it isn't; no flash: the class is
  present in the first paint (checked via `page.evaluate` at `domcontentloaded`).
- `@axe-core/playwright` on login, dashboard, templates, template detail, compare, wizard, signatures, signing page,
  admin users/fields — **light and dark** — fail on `serious`/`critical` violations.
- Language overflow check in hy/ru/en: no element wider than the viewport (`scrollWidth <= innerWidth`) on phone.
- Existing unit, backend and E2E suites unchanged and green (selectors/test ids kept).

## 10. Out of scope / constraints

- No change to routes, API calls, data, validation or business rules; test ids and accessible names stay.
- Documents, emails, generated PDFs/DOCX/ZIP/CSV/XLSX untouched.
- Native date-picker popups are drawn by the browser (they will follow `color-scheme`, but their language follows
  the browser).

---

## 11. Implementation (step 2) — status

Implemented as proposed; screenshots of every screen in light and dark, desktop and phone:
[docs/screenshots/ui-v2/](screenshots/ui-v2/) (122 images, `{light|dark}-{desktop|phone}-NN-screen.png`, produced by
`AUDIT_DIR=ui-v2 AUDIT_THEME=dark npx playwright test --config playwright.screenshots.config.ts e2e/audit.spec.ts`).

| Area | Where |
| --- | --- |
| Tokens, both themes, type scale, focus ring, reduced motion | `frontend/src/app/globals.css` |
| **Brand colour (one place)** | `--brand` in `globals.css`; every accent shade in both themes is derived with `color-mix()` |
| Theme (next-themes, class strategy, System default, no flash) | `components/providers.tsx`, `components/theme-toggle.tsx` |
| Header with language, theme and account menus; sidebar = navigation | `components/app-shell.tsx` |
| Buttons, inputs/selects, badges (tones), tables (sticky header/first column), dialogs (sheet on phones), skeletons, empty states | `components/ui/*`, `components/states.tsx` |
| Status badges (tone + icon) | `components/status-badge.tsx` |
| Precheck as cards on phones; stepper; signatures filters collapse; column order | `components/generate/*`, `components/signatures/*`, `app/(app)/signatures/page.tsx` |
| Fonts | Noto Sans + Noto Sans Armenian via `next/font` (self-hosted) |

Tests added: `e2e/theme.spec.ts` (toggle, persistence, System ↔ OS, no flash, paper stays white),
`e2e/a11y.spec.ts` (axe, WCAG 2.1 A/AA incl. colour contrast, 8 screens × 2 themes, 0 serious/critical),
phone overflow check in hy/ru/en (`e2e/languages.spec.ts`).

Known leftovers:
- Native `<select>` option lists and the date picker are drawn by the browser (they follow the theme via
  `color-scheme`, but their look and the date format are the browser's).
- Full-page screenshots show the fixed sidebar only for the first viewport height (capture artifact; in the browser it
  always fills the window).
- In headless screenshots the PDF frame is empty (Chromium headless doesn't render PDFs in frames); real browsers show
  the page on the white `--paper` background.
