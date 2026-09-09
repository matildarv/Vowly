# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Vow & Co. — a static marketing site plus a client-side "couple's dashboard" app for a luxury wedding-planning product. No build step, no package manager, no backend: every page is a plain `.html` file that loads shared `.css`/`.js` via `<script src>` / `<link>` tags and runs directly in the browser.

There is no git repository here and no test suite. There is a sibling directory, `../website v2`, which is an **older, divergent snapshot** of this same site — it is missing `wedding-data.js` and `dashboard.js` entirely and its `dashboard.html` is the small static-demo version. Do not treat it as a reference for current behavior; this directory (`website v3`) is the actively developed one.

## Running it locally

There's no dev server config. Serve the directory with any static file server and open `dashboard.html` (or any page) through `http://localhost:...`, not `file://` — the dashboard app writes to `localStorage`, and some browsers scope that differently for `file://` origins.

```bash
python3 -m http.server 8843
```

Then visit `http://localhost:8843/plan.html` to create a plan (redirects into `dashboard.html?name=...&date=...` on completion) or `http://localhost:8843/dashboard.html` directly to see the static demo state.

There is no lint or test command — verify changes by loading the page in a browser and checking the console.

## Visual identity (do not deviate)

Black / white / off-white editorial aesthetic — no bright colors, gradients, or cartoon icons. Defined in `styles.css`:
- Fonts: `Bodoni Moda` (serif, all headings) + `Inter` (sans, body) — loaded via the `@import` at the top of `styles.css`.
- CSS variables: `--white`, `--offwhite`, `--black`, `--muted`, `--line` (hairline borders everywhere, not shadows/dividers).
- Buttons are pill-shaped (`.btn--black`, `.btn--white`, `.btn--ghost`); icons are inline stroke-only SVGs (`viewBox="0 0 24 24"`, `stroke-width="1.3–1.6"`, no fill), never an icon font or emoji.

## Architecture

### Marketing pages
`index.html`, `vendors.html`, `pricing.html`, `planning-tools.html`, `inspiration.html` are conventional static pages sharing the `header.nav` / `footer` markup and `.wrap`/`.section` layout primitives from `styles.css`. `script.js` wires up the mobile nav toggle, animates `.bar-fill`/`.budget-bar-fill` elements on load, and drives the category-tab widget on `planning-tools.html` (and homepage) via a `window.categoryData` object each page defines inline.

### The wizard → dashboard handoff
`plan.html` is a 5-step client-side wizard (date, location, guests, budget, style) with no persistence of its own. On completion it calls `createAccount()`, which builds a query string and redirects to `dashboard.html?name=...&partner=...&date=...&location=...&guests=...&budget=...&style=...`. `dashboard.html`'s bootstrap script reads those params and calls `VOWDATA.init(weddingParams)` **once** — if a plan already exists in `localStorage`, the saved plan always wins over URL params, so re-visiting the wizard never clobbers real progress.

### `calculator.js` — `VOWCO`
Shared, stateless estimation helpers used by the homepage calculator, the wizard's results screen, and the dashboard: `formatCurrency`, `budgetBreakdown` (splits a total budget across `BUDGET_WEIGHTS` categories), `daysUntil`/`monthsUntil`, `formatDateLong`, and rough vendor/task/venue count estimators. Pure functions, no DOM access, no dependency on `wedding-data.js`.

### `wedding-data.js` — `VOWDATA` (the data model)
An IIFE exposing a single `VOWDATA` global. This is the one and only persistence layer for the dashboard app — **every new feature extends this object rather than inventing parallel storage**, and every read/write goes through it so a real backend could later replace `loadRaw()`/`saveRaw()` (the only two functions that touch `localStorage`, under key `vowco_wedding_data_v1`) without changing any calling code.

The stored shape:
```
{ wedding, tasks[], budgetItems[], vendors[], guests[], tables[], appointments[],
  messages: { threads[] }, weddingDay: { timeline[], contacts[] } }
```
`migrate()` backfills any of these arrays that are missing on an older saved plan, so schema additions are always additive and non-breaking. `VOWDATA.get()` runs `migrate()` automatically; call it (not raw `localStorage`) whenever you need current state.

Key cross-entity behavior worth knowing before touching budget/vendor code: **vendors and budget expenses auto-sync one-way.** `setVendorStatus(id, 'Booked'|'Paid')` creates a linked `budgetItems` row the *first* time a vendor is booked (`vendor.linkedBudgetItemId`) so its cost flows into real budget totals without double entry. After that initial link, the two records evolve independently — editing a vendor's quote afterward does not silently overwrite payments already tracked against the budget item.

`VOWDATA.CATEGORIES` (7 fixed categories matching `VOWCO.BUDGET_WEIGHTS` labels exactly, e.g. `'Photography & film'`) is the single category taxonomy used by both budget items and vendors — this is what makes "your allocation vs. your spend" comparisons and per-category budget alerts possible. Don't introduce a separate category list for vendors.

`VOWDATA.askVow(promptText, data)` is a template-driven "AI assistant" — pure keyword matching over real computed data (progress %, budget totals, days until wedding, overdue tasks). It's written as a stable entry point specifically so it can later be swapped for a real Claude API call without touching call sites.

### `dashboard.html` + `dashboard.js` (the SPA)
`dashboard.html` is a single page containing the sidebar, topbar, and one `<div class="app-view" data-view="...">` per section (dashboard, budget, vendors, vendor-detail, guests, seating, timeline, checklist, appointments, weddingday, messages). `dashboard.js` is a hash-router SPA over that shell:

- Routes are `location.hash` values like `#budget`, `#vendor:<id>`, `#checklist:Ceremony` (a `view:arg` split on `:`). `router()` reads the hash, toggles `.active` on the matching `.app-view` and matching sidebar `<a data-view>`, and calls that view's `render*()` function.
- Every `render*()` function is a full re-read of `VOWDATA.get()` followed by rebuilding that view's DOM via template-string `innerHTML` — there's no diffing/virtual-DOM and no per-widget incremental updates. The convention after any mutation is to call `rerender()` (`refreshData(); router();`), which re-renders the *entire current view* from scratch. Follow this pattern for new features rather than hand-patching individual DOM nodes.
- Add/edit forms (expenses, vendors, guests, tables, appointments, timeline items, contacts) are inline collapsible panels toggled by `toggle*Form()` functions, not modals — an `editing<Entity>Id` closure variable tracks whether Save should call `add*` or `update*`. Follow this pattern (not `<dialog>`/modal overlays) for any new entity form.
- All user-facing strings that get concatenated into `innerHTML` go through the local `esc()` helper to avoid XSS — always escape when adding new template strings.
- Handlers referenced from inline `onclick="..."` in the HTML are the ones exported on the `window.DASH = {...}` object at the bottom of the IIFE; everything else is a private closure function. If you add an onclick in `dashboard.html`, you must also add the function to that export list.
- Mobile nav: the sidebar's `.app-nav-group`/`.app-sidebar-foot` live inside `.app-sidebar-scroll`, which is `display:flex` by default and only collapsed to `display:none` (revealed via `.app-sidebar.open`) inside the `@media (max-width:980px)` block in `styles.css`. **Base/reset rules for anything with a responsive override must be declared before the `RESPONSIVE` media-query section in `styles.css`** — this file learned that the hard way (a rule declared after the media query silently wins regardless of viewport, since equal-specificity + later source order beats the media query condition).

### Messages / Wedding Day / Guests-Seating relationships
- Guests (`data.guests`) and the seating chart (`data.tables`, `guest.tableId`) share one array — the seating view never holds its own guest list, it filters/reads `data.guests` directly. Keep it that way if you extend it.
- `data.messages.threads` is one thread per vendor (`getOrCreateThread(vendorId, vendorName)`); sending a couple message schedules a `setTimeout`-simulated vendor auto-reply from a canned-response pool purely for demo realism — this lives in `dashboard.js`, not in `wedding-data.js`, since it's UI-timing behavior rather than data modeling.
