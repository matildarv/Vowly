// Authentication for Vow & Co. — thin wrapper around Supabase Auth.
//
// Every function returns a plain { data, error } object (mirroring the
// Supabase client's own convention) so callers can check `.error` instead of
// wrapping every call in try/catch. Nothing here stores a session manually —
// Supabase's client already persists the session (in the browser's own
// storage) and keeps it refreshed; we just read it back.

(function () {
  async function client() {
    if (window.VOWSUPA && window.VOWSUPA.ready) await window.VOWSUPA.ready;
    return window.VOWSUPA && window.VOWSUPA.client;
  }

  function notConfigured() {
    return { data: null, error: { message: "Supabase isn't configured yet. Copy .env.example to .env and add your project's URL and publishable key." } };
  }

  // Creates the auth user, then creates their `profiles` row. If the
  // Supabase project has email confirmation turned on, there is no session
  // yet — data.needsEmailConfirmation tells the caller to show a "check your
  // inbox" message instead of continuing straight into the app.
  async function signUp({ email, password, firstName, lastName }) {
    const c = await client();
    if (!c) return notConfigured();

    const { data, error } = await c.auth.signUp({ email: email, password: password });
    if (error) return { data: null, error: error };

    const needsEmailConfirmation = !data.session;
    if (!needsEmailConfirmation) {
      const profileResult = await ensureProfile({ firstName: firstName, lastName: lastName });
      if (profileResult.error) return { data: null, error: profileResult.error };
    }

    return { data: { user: data.user, session: data.session, needsEmailConfirmation: needsEmailConfirmation, pendingProfile: { firstName: firstName, lastName: lastName } }, error: null };
  }

  async function signIn({ email, password }) {
    const c = await client();
    if (!c) return notConfigured();
    const { data, error } = await c.auth.signInWithPassword({ email: email, password: password });
    if (error) return { data: null, error: error };
    // In case an earlier signUp on this device never got to create a
    // profile (e.g. they closed the tab before email confirmation), make
    // sure one exists now.
    await ensureProfile({});
    return { data: data, error: null };
  }

  async function signOut() {
    const c = await client();
    if (!c) return notConfigured();
    const { error } = await c.auth.signOut();
    return { data: !error, error: error };
  }

  async function getSession() {
    const c = await client();
    if (!c) return { data: null, error: null };
    const { data, error } = await c.auth.getSession();
    if (error) return { data: null, error: error };
    return { data: data.session, error: null };
  }

  // Returns a stable subscription-like object immediately (safe to call
  // .unsubscribe() on right away); the real Supabase listener is wired up
  // once the client has finished loading .env.
  function onAuthStateChange(callback) {
    let real = { unsubscribe: function () {} };
    let unsubscribedEarly = false;
    client().then(function (c) {
      if (!c || unsubscribedEarly) return;
      const { data } = c.auth.onAuthStateChange(function (event, session) { callback(event, session); });
      real = data.subscription;
    });
    return { unsubscribe: function () { unsubscribedEarly = true; real.unsubscribe(); } };
  }

  // Finds (or lazily creates) the profiles row for the current session's
  // user. Safe to call repeatedly — a second call just returns the existing
  // row. `role` always starts as 'couple'; nothing in this stage grants
  // 'admin'.
  async function ensureProfile({ firstName, lastName }) {
    const c = await client();
    if (!c) return notConfigured();

    const { data: sessionData, error: sessionError } = await c.auth.getSession();
    if (sessionError) return { data: null, error: sessionError };
    const user = sessionData.session && sessionData.session.user;
    if (!user) return { data: null, error: { message: 'Not signed in.' } };

    const existing = await c.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
    if (existing.error) return { data: null, error: existing.error };
    if (existing.data) return { data: existing.data, error: null };

    const insertPayload = {
      user_id: user.id,
      first_name: firstName || null,
      last_name: lastName || null,
      role: 'couple'
    };
    const created = await c.from('profiles').insert(insertPayload).select().single();
    if (created.error) return { data: null, error: created.error };
    return { data: created.data, error: null };
  }

  async function getProfile() {
    const c = await client();
    if (!c) return notConfigured();
    const { data: sessionData } = await c.auth.getSession();
    const user = sessionData.session && sessionData.session.user;
    if (!user) return { data: null, error: null };
    const result = await c.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
    return { data: result.data, error: result.error };
  }

  async function resetPasswordForEmail(email) {
    const c = await client();
    if (!c) return notConfigured();
    const redirectTo = window.location.origin + window.location.pathname.replace(/[^/]+$/, '') + 'update-password.html';
    const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: redirectTo });
    return { data: !error, error: error };
  }

  async function updatePassword(newPassword) {
    const c = await client();
    if (!c) return notConfigured();
    const { data, error } = await c.auth.updateUser({ password: newPassword });
    return { data: data, error: error };
  }

  // For pages that require a signed-in user (dashboard, wedding-details).
  // Redirects to login.html?redirect=<this page> if there's no session, and
  // resolves with the session otherwise. login.html sends the user back to
  // `redirect` after a successful sign-in.
  async function requireAuth() {
    const result = await getSession();
    if (!result.data) {
      const here = window.location.pathname.split('/').pop() + window.location.search + window.location.hash;
      window.location.href = 'login.html?redirect=' + encodeURIComponent(here);
      return null;
    }
    return result.data;
  }

  window.VOWAUTH = {
    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    getSession: getSession,
    onAuthStateChange: onAuthStateChange,
    ensureProfile: ensureProfile,
    getProfile: getProfile,
    resetPasswordForEmail: resetPasswordForEmail,
    updatePassword: updatePassword,
    requireAuth: requireAuth
  };
})();
