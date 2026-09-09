// Central Supabase client for Vow & Co.
//
// This is a plain static site (no build step, no bundler), so there's no
// compile-time process to inject a .env file into browser code the way a
// Node/Next.js project would. Instead, this file fetches .env itself as
// plain text at runtime and parses SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY
// out of it — so the site must be served over http(s) (a local static
// server, or once deployed), not opened as a file:// URL.
//
// Every other script (auth.js, data.js) awaits window.VOWSUPA.ready before
// touching window.VOWSUPA.client, since the fetch above is asynchronous.
//
// This file never touches a service_role key. The publishable/anon key is
// the only credential that ever reaches the browser; Row Level Security in
// Postgres is what actually keeps one couple's data away from another's.

(function () {
  function parseEnvText(text) {
    const out = {};
    text.split('\n').forEach(function (line) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.indexOf('#') === 0) return;
      const eq = trimmed.indexOf('=');
      if (eq === -1) return;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value[0] === '"' && value[value.length - 1] === '"') || (value[0] === "'" && value[value.length - 1] === "'")) {
        value = value.slice(1, -1);
      }
      out[key] = value;
    });
    return out;
  }

  async function loadEnv() {
    try {
      const res = await fetch('.env', { cache: 'no-store' });
      if (!res.ok) return {};
      return parseEnvText(await res.text());
    } catch (e) {
      return {};
    }
  }

  let resolveReady;
  const ready = new Promise(function (resolve) { resolveReady = resolve; });

  // Available synchronously so scripts can check `.configured` after
  // `.ready` resolves, or reference the object before it's populated.
  window.VOWSUPA = { client: null, configured: false, ready: ready };

  loadEnv().then(function (env) {
    const url = (env.SUPABASE_URL || '').trim();
    const key = (env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || '').trim();
    const configured = !!(url && key && !/YOUR-PROJECT-REF/i.test(url) && !/your-.*key/i.test(key));

    let client = null;
    if (configured && window.supabase && typeof window.supabase.createClient === 'function') {
      client = window.supabase.createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
    }

    window.VOWSUPA.client = client;
    window.VOWSUPA.configured = configured;

    if (!configured) {
      console.warn('[Vow & Co.] Supabase is not configured yet — copy .env.example to .env and fill in your project URL and publishable key. Falling back to local-only mode.');
    } else if (!client) {
      console.error('[Vow & Co.] .env looks filled in, but the Supabase client library did not load — check the <script> tag for the Supabase SDK.');
    }

    resolveReady(window.VOWSUPA);
  });
})();
