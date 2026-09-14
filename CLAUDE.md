# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Vow & Co. ("Vowly") — a static marketing site plus a client-side "couple's dashboard" app for a luxury wedding-planning product, now with a real Supabase backend layered underneath it. No build step, no package manager, no bundler: every page is still a plain `.html` file that loads shared `.css`/`.js` via `<script src>` / `<link>` tags and runs directly in the browser — the backend was added by hydrating/writing through the existing client-side data layer rather than introducing a framework. See "Supabase backend" below.

This directory (`website v3`) is a git repository, pushed to **`origin` → `https://github.com/matildarv/Vowly.git`, branch `main`**. There is no test suite (see "Verifying changes" below for what "tested" means here). There is a sibling directory, `../website v2`, which is an **older, divergent snapshot** of this same site — it is missing `wedding-data.js` and `dashboard.js` entirely and its `dashboard.html` is the small static-demo version, and it is not a git repository. Do not treat it as a reference for current behavior; this directory (`website v3`) is the actively developed one.

## Running it locally

There's no dev server config. Serve the directory with any static file server and open `dashboard.html` (or any page) through `http://localhost:...`, not `file://` — the dashboard app writes to `localStorage`, and some browsers scope that differently for `file://` origins.

```bash
python3 -m http.server 8843
```

Then visit `http://localhost:8843/plan.html` to create a plan (redirects into `dashboard.html?name=...&date=...` on completion) or `http://localhost:8843/dashboard.html` directly to see the static demo state.

There is no lint or test command — verify changes by loading the page in a browser and checking the console (see "Verifying changes" below).

For the Supabase-backed features (accounts, persistence) to work, `.env` needs real `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY` values (copy `.env.example` → `.env`, fill in from the Supabase dashboard's Project Settings → API), then run `python3 generate-public-config.py` (re-run any time `.env` changes — see "Supabase backend" below for why). Without it, the site still works exactly as before — signed-out/local-draft mode, unchanged.

## Visual identity (do not deviate)

The Vowly system (from the V0 "Claret & Mercury" concept): Ivory page, Ink text, a single Claret accent used sparingly, hairline Stone/Mercury borders, minimal radii, almost no shadows — no bright colors, gradients, or cartoon icons. Everything is tokenised at the top of `styles.css`; use the tokens, never raw hex values, in new CSS or inline styles.
- Palette: `--color-ink #17161A`, `--color-claret #7C1D2E`, `--color-mercury #C4C7CB`, `--color-stone #E7E3DC`, `--color-ivory #FBFAF7`, plus derived neutrals (`--color-graphite` secondary text, `--color-surface` cards/inputs, `--color-mist` sunken sections). Semantic roles (`--text-secondary`, `--bg-surface`, `--border-hairline`, `--accent`, `--color-error`, `--progress-fill`…) sit on top.
- Fonts: `Fraunces` (display/headings, big numbers; `<em>` inside a heading renders italic Claret), `Geist` (body/UI), `Geist Mono` (uppercase eyebrows, metric labels, dates, amounts) — loaded via the `@import` at the top of `styles.css`. Use `var(--font-display|sans|mono)`, not font names.
- The old names `--white`, `--offwhite`, `--black`, `--muted`, `--line` are kept as aliases onto the new tokens because many inline styles in the HTML/JS still use them.
- Brand markup is `<a class="brand"><span class="brand-mark" aria-hidden="true">V</span>Vowly</a>`.
- Buttons: `.btn--black` (Ink primary), `.btn--ghost` (surface + Stone hairline), `.btn--claret` (accent), 4px radius — not pills. Inside `.page-hero-ctas`, `.btn--ghost` renders as a mono caps text link. Progress bars are 3px Claret on Stone. Icons are inline stroke-only SVGs (`viewBox="0 0 24 24"`, `stroke-width="1.2–1.4"`, no fill), never an icon font or emoji.
- Form controls get their look from a zero-specificity `:where(input…, select, textarea)` rule — don't re-declare border/font inline on new inputs, or you'll lose the Claret focus state.
- Button hover is CSS-only: primary Ink → Claret with a 1px lift and soft shadow; secondary keeps Ivory and turns its border/text Claret. Timing/lift/shadow are the `--hover-*` tokens.

### Shared input components
- **`js/quantity-input.js` (`window.VOWQTY`) — product rule: when a user enters a quantity with no real-world maximum (budget, guests…), never use a slider or an arbitrary cap.** Use the `.qty-field` markup (see the file header) with presets as shortcuts only. The visible text is comma-formatted, so always read it with `VOWQTY.value(input)` (Number or null) and write with `VOWQTY.set(input, n)` — never `Number(input.value)`. The only ceiling is the database column size (`weddings.budget numeric(12,2)`, `guest_count integer`). Used on the homepage calculator, `plan.html` and `wedding-details.html`.
- **`js/calendar.js` (`window.VOWCAL`)** automatically replaces every `<input type="date">` (including ones dashboard.js renders later) with the Vowly calendar. The native input stays hidden and remains the source of truth, so `input.value` reads/writes of `'YYYY-MM-DD'` keep working and selecting a day fires `input`/`change`. Opt-ins: `data-calendar="inline"`, `data-calendar-min="today"`. Include the script on any page that has date inputs.

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

### Supabase backend
`js/supabase.js`, `js/auth.js`, `js/data.js`, and `supabase/schema.sql` add real accounts and persistence on top of the architecture above, without changing it:

- `js/supabase.js` fetches `public-config.txt` (plain text, over http — this only works when the site is served by a real static server, not opened as `file://`) and creates the one shared `window.VOWSUPA.client`. `public-config.txt` is generated from `.env` by `generate-public-config.py` and holds only the two values meant to be public (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`) — the app never fetches `.env` itself. Both `.env` and `public-config.txt` are gitignored; `.env.example` documents the shape and is tracked. **Never put a `service_role`/secret key anywhere in this repo, including in `.env`.**
- `js/auth.js` (`window.VOWAUTH`) wraps sign up/in/out, session, password reset, and `ensureProfile()` (creates a couple's `profiles` row on first login).
- `js/data.js` (`window.VOWREMOTE`) is the only file that knows the Postgres row shapes; it maps them to/from `VOWDATA`'s existing local shape.
- `wedding-data.js` itself stays the single synchronous local cache every render function already reads/writes (unchanged) — `VOWDATA.hydrateFrom(remoteShape)` overwrites the Supabase-backed sections of that cache on page load, and `VOWDATA.enableRemoteSync(weddingId)` makes every mutator additionally fire a matching `window.VOWREMOTE.sync*()` call in the background afterward. If nobody's signed in, none of this runs and the app behaves exactly like the original localStorage-only build.
- Writes go through an outbox in `wedding-data.js` (`remoteSync()` → localStorage key `vowco_sync_outbox_v1`): one op per change, sent one at a time, removed only once Supabase confirms it, retried with backoff/when back online, and replayed by `flushPendingSyncs()` before a page hydrates, so a failed save is never silently overwritten. `js/sync-status.js` (included on `dashboard.html` and `wedding-details.html`) shows "Saving…" / "Saved" / a "Couldn't save — we'll retry" message from `VOWDATA.onSyncStateChange()`. Any new Supabase-backed mutator must go through `remoteSync()` and have an entry in `SYNC_TARGETS`, and any page that navigates right after a mutation must `await VOWDATA.waitForSync()` and not treat `false` as saved.
- Logout (`dashboard.js`) and any signed-out load of `dashboard.html`/`wedding-details.html` call `VOWDATA.clearAccountData()`, which removes a signed-in couple's plan from the browser (never from Supabase). The local-only sections (vendors, messages, wedding day) are set aside per wedding id under `vowco_local_only_by_wedding_v1` and restored by `hydrateFrom()` only for that same wedding. Anonymous local drafts (no `wedding.id`) are left alone.
- `supabase/schema.sql` is the full schema (`profiles`, `weddings`, `guests`, `tables`, `tasks`, `appointments`, `budget_items`, `wedding_settings`) with RLS enabled and policies enforcing the `auth user → profile → wedding → everything else` ownership chain. It's idempotent — safe to re-run.
- **Not backed by Supabase yet, still localStorage-only:** vendors/enquiries/quotes, messages, wedding-day timeline/contacts — deliberately, to leave room for a future vendor-marketplace schema.
- `login.html`, `signup.html`, `reset-password.html`, `update-password.html` are the auth pages, built from the same visual components as everything else. `dashboard.html` and `wedding-details.html` each run an async auth-check-then-hydrate bootstrap before their existing (otherwise-unchanged) render code runs.

### Vendor marketplace
`vendor-directory.js` (`window.VOWVENDORS`) is a static, hand-curated directory of real Sydney vendors — platform data, not per-couple data, and deliberately kept out of `VOWDATA`/Supabase. `vendors.html` + `vendors.js` are the public directory/search/profile UI; a couple's relationship to a vendor (shortlisted/enquiry/quote/booked) lives in `VOWDATA.vendors[]` in `dashboard.js`'s "My Vendors" view, linked by `vendorId`.

### Images
All photos live in `photos/`, referenced as `src="photos/whatever.jpg"` — not in the project root.

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

## Working in this repo — standing instructions

These apply to all future work here, not just the task at hand:

- This project is connected to GitHub at `origin/main`.
- After completing a requested change, check the work and run appropriate tests.
- Review `git status` and `git diff` before committing.
- If the changes are safe and successful, automatically `git add` the relevant files, create a clear, descriptive commit, and `git push origin main`. **This auto-commit/push rule covers code only — it does not extend to the live Supabase database.** See "Database changes" below for the separate (never-automatic) rule that applies there.
- Never commit or push `.env` files, `public-config.txt`, API keys, passwords, Supabase credentials, secrets, or other sensitive information.
- Never use `git push --force`.
- Never commit `node_modules`, temporary files, build artifacts, or other unnecessary files.
- If there is a merge conflict, an authentication problem, a failing test, or a potentially destructive change, stop and tell the user instead of pushing.
- Keep commits focused on the current task.
- Preserve the existing Vowly design system and functionality unless explicitly asked to change it.
- Before making major changes, inspect the existing code and understand how the relevant feature currently works.

### Verifying changes (what "run appropriate tests" means here)
There's no automated test suite. "Testing" a change means: load the affected page(s) in a browser via a real `http://` server (see "Running it locally"), exercise the actual feature, and check the browser console for errors. For Supabase-backed features specifically, also confirm the relevant row actually persisted/updated correctly (e.g. via the Supabase Table Editor) — a change that only updates the local `VOWDATA` cache without the background sync succeeding is not actually done.

### Database changes (Supabase migrations)
Schema changes are tracked as migration files under `supabase/migrations/`, one file per change, oldest-first by filename timestamp (`<YYYYMMDDHHMMSS>_<description>.sql`). `supabase/migrations/20260907000000_baseline_schema.sql` is the starting point — a copy of the schema exactly as it was first run against the live project (see that file's own header comment). `supabase/schema.sql` is kept as the same content for historical reference; migrations are the canonical source going forward.

The Supabase CLI is installed locally at `~/.local/bin/supabase` (not on PATH by default) and is linked to the live project (`jrxrmzpgjbjummtaybdu`). There is **no Docker/Podman on this machine**, so the CLI's own shadow-database features (`supabase db pull` in diff mode, `supabase db push`, `supabase db reset`, local dev databases) are not usable here — don't reach for them. Migrations are written and reviewed by hand instead.

**The rule, with no exceptions:**
- **Code changes** get auto-committed and auto-pushed to GitHub per the rule above, once verified.
- **Supabase database migrations must NEVER be automatically applied to the live/production database.** Writing a new migration file and committing *the file itself* to GitHub is fine and expected (that's just tracking intent, same as any other code). Actually *running* that SQL against the live database — whether via `supabase db push`, pasting it into the Supabase SQL Editor, or any other means — always requires the user's explicit, per-change approval. Never inferred from an earlier "yes," never bundled into a routine code auto-push.
- **Never run `supabase db reset`** against the linked project. It rebuilds a database from migration files, destroying anything not represented in them.
- Workflow for a new schema change: create a new file in `supabase/migrations/` with the next timestamp, write the SQL, show it to the user (plain SQL, not summarized), and wait for explicit approval before it's run anywhere against the live database.
