# Vow & Co. — Backend setup (Stage 1)

This is a plain static site — HTML, CSS, and vanilla JavaScript, no build step,
no framework. Stage 1 adds a real backend on top of it using
[Supabase](https://supabase.com) (hosted Postgres + authentication), while
keeping every existing page and its visual design exactly as it was.

This guide assumes no prior backend experience.

## 1. Create your Supabase project

1. Go to [supabase.com](https://supabase.com) and sign up (free tier is fine).
2. Click **New project**. Pick any name and a database password (save that
   password somewhere — you won't need it for this setup, but Supabase asks
   for one).
3. Wait a minute or two for the project to finish provisioning.

## 2. Find your Project URL and publishable key

In your new project's dashboard:

1. Click **Project Settings** (gear icon) → **API**.
2. You'll see:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **Project API keys** → the **`anon` `public`** key (Supabase's newer
     dashboards may label this **"publishable key"** instead — it's the same
     thing). It's a long string starting with `eyJ...`.
3. **Do not** copy the `service_role` / `secret` key anywhere in this
   project. That key can bypass all security rules and must never reach the
   browser. Stage 1 never asks for it.

## 3. Fill in your `.env` file

In this project's root folder, you'll find two files:

- **`.env.example`** — a template showing what's needed (safe to commit, has
  no real values).
- **`.env`** — this is where your *real* values go. It's already listed in
  `.gitignore`, so it will never be committed.

Open `.env` and paste your values in:

```
SUPABASE_URL=https://abcdefgh.supabase.co
SUPABASE_PUBLISHABLE_KEY=eyJ...your-real-key...
```

That's it for configuration — every page reads these two values
automatically (see **How this actually works** below if you're curious).

## 4. Run the database schema

1. In the Supabase dashboard, open the **SQL Editor** (left sidebar).
2. Click **New query**.
3. Open `supabase/schema.sql` from this project, copy its entire contents,
   and paste it into the SQL editor.
4. Click **Run**.

You should see "Success. No rows returned." This creates every table
(`profiles`, `weddings`, `guests`, `tables`, `tasks`, `appointments`,
`budget_items`, `wedding_settings`), locks them all down with Row Level
Security, and sets up the policies that keep one couple's data away from
another's. The script is safe to re-run if you ever need to (it won't
duplicate anything).

## 5. Turn off email confirmation (optional, but recommended while testing)

By default, Supabase requires a new user to click a confirmation link in
their email before they can sign in. That's fine for production, but it
gets in the way while you're testing locally with a real inbox you may not
want to check every time.

To turn it off: **Authentication** → **Providers** → **Email** → toggle off
**"Confirm email"**. You can turn it back on later before you launch for
real.

If you leave it on, signup still works — the app will show a "check your
email" message after signing up, and the account becomes usable once they
click the link.

## 6. Run the website locally

Because this is a static site with no build step, `js/supabase.js` fetches
your `.env` file directly over HTTP at runtime — which means the site has to
be served by *some* local web server (opening the HTML files directly as
`file://` won't work, since a browser won't let a page `fetch()` a local
file that way).

The simplest option, from this project's folder in a terminal:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/index.html` in your browser. Any other
static server works too (VS Code's "Live Server" extension, `npx serve`,
etc.) — the only requirement is that it serves this folder over http.

## 7. Create a test account

1. From the homepage, click **Plan My Wedding**, go through the short
   wizard (date, location, guest count, budget, style).
2. On the results screen, fill in the "Create your free account" form and
   submit. This takes you to a full signup page (name, partner's name,
   email, password) with your wizard answers already carried across.
3. Submit that form. If email confirmation is off (step 5), you're taken
   straight to your dashboard with your real wedding already saved. If it's
   on, you'll see a "check your email" message — click the link, then log
   in.

You can also go to `login.html` directly at any time, or `signup.html` to
create an account without going through the wizard first.

## 8. Test that wedding data persists

1. On your dashboard, add a guest, add a budget item, and complete a task.
2. **Refresh the page.** Everything you just added should still be there —
   it's now read back from Supabase, not from anything cached in the
   browser.
3. Log out (the "Log out" link in the top-right, which replaces "Reset my
   plan" once you're signed in), then log back in. Your wedding, guests,
   budget, and tasks should all still be exactly as you left them.

## 9. Test Row Level Security

This is the part that proves one couple genuinely cannot see another
couple's data — not just that the app's UI doesn't show it, but that the
*database itself* refuses the request.

1. Create a second test account (different email) and give it a different
   wedding date/guest count so you can tell them apart.
2. While logged in as the second account, open your browser's dev tools
   (F12) → Console, and run:
   ```js
   const { data, error } = await VOWSUPA.client.from('weddings').select('*');
   console.log(data);
   ```
   You should only ever see **your own** wedding row — never the first
   account's — no matter what you try. That's Row Level Security enforcing
   it at the database level, not the app hiding rows on purpose.
3. For extra confidence, you can also try (still logged in as account 2):
   ```js
   await VOWSUPA.client.from('guests').select('*').eq('wedding_id', '<account 1's wedding id>');
   ```
   This should come back empty, even though the row exists — RLS blocks it
   before Postgres even considers returning it.

## 10. Troubleshooting

**"This site isn't connected to Supabase yet" banner on login/signup**
`.env` still has the placeholder values, wasn't saved, or the site isn't
being served over http (see step 6). Reload after fixing.

**Nothing happens when I submit the login/signup form, no error either**
Open the browser console — Supabase almost always returns a specific error
message (wrong password, user already exists, etc.) that gets displayed on
the page. If the console shows a CORS or network error instead, double
check your Project URL in `.env` has no typo.

**"new row violates row-level security policy"**
This means a write was attempted that doesn't match the RLS ownership
chain — e.g. trying to insert a wedding for a `couple_id` that isn't your
own profile. If you didn't write custom code, this usually means the schema
wasn't fully applied — re-run `supabase/schema.sql`.

**Guests/budget/tasks I added while signed out (`?name=Alex&...` local
draft) don't appear after I sign up**
Currently, creating an account starts a *new*, empty wedding in Supabase —
it does not yet pull in an anonymous local draft's guests, budget items, or
tasks (only the wizard's own answers: date, location, guest count, budget,
style). This is a known Stage 1 limitation — see below.

**Images look broken across the site**
This is unrelated to the backend work in this stage — the site's `.jpg`
files currently live in a `photos/` subfolder while most pages still
reference them as if they were in the root folder. Worth fixing, but it's a
pre-existing front-end issue, not something Stage 1 touched.

## How this actually works (architecture notes)

- **`wedding-data.js`** (unchanged in spirit) is still the one module every
  page's UI reads and writes through, and it still keeps its working copy in
  `localStorage` so every existing render function keeps working exactly as
  before, synchronously, with zero rewriting.
- When a couple is signed in, `dashboard.js` (and `wedding-details.html`)
  fetch their real data from Supabase on page load and write it into that
  same local cache (`VOWDATA.hydrateFrom(...)`) *before* anything renders —
  so Supabase is the source of truth, but nothing downstream needs to become
  asynchronous to use it.
- From then on, every mutation (add a guest, complete a task, etc.) updates
  the local cache instantly as before, and separately fires a matching
  Supabase write in the background (`VOWDATA.enableRemoteSync()` /
  `window.VOWREMOTE` in `js/data.js`). If that background write fails (offline,
  expired session), it's logged to the console — the local UI doesn't block
  or roll back, but the next successful hydration reconciles from the
  server.
- If nobody is signed in, none of this runs — the site behaves exactly like
  the original localStorage-only build, including the fully anonymous
  "build a plan without an account" path.
- **Vendors, messages, and the wedding-day timeline are not in Stage 1's
  database** (this was explicit in the brief, to leave room for Stage 2's
  vendor marketplace tables) — they still live in `localStorage` only, on
  this device, exactly as before.
