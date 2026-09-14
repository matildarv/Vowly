// Central wedding data model for Vow & Co.
// MVP persistence via localStorage, structured so a real backend/database
// can replace loadRaw()/saveRaw() later without changing anything else
// that calls into VOWDATA.

const VOWDATA = (function () {
  const STORAGE_KEY = 'vowco_wedding_data_v1';

  const CATEGORIES = ['Venue & reception', 'Catering', 'Photography & film', 'Flowers', 'Entertainment', 'Attire', 'Other'];
  const VENDOR_STATUSES = ['Shortlisted', 'Enquiry sent', 'Response received', 'Quote received', 'Negotiating', 'Booked', 'Paid', 'Not proceeding'];
  const MAJOR_VENDOR_CATEGORIES = ['Venues', 'Photography', 'Celebrants', 'Florals', 'Catering', 'Entertainment', 'Hair & Makeup', 'Cakes', 'Videography', 'Styling & Decor'];
  const RSVP_STATUSES = ['Awaiting', 'Yes', 'No'];
  const DIETARY_OPTIONS = ['None', 'Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free', 'Nut allergy', 'Halal', 'Kosher', 'Other'];
  const TABLE_SHAPES = ['Round', 'Rectangle', 'Long table', 'Custom'];
  const SIDES = ['Bride', 'Groom', 'Both', 'Neither'];

  // Categories couples can mark as "already booked" / "need help with" on the
  // Wedding Details page. Deliberately the same values as task.category (not
  // the Budget/Vendor CATEGORIES above) so they match checklist tasks with no
  // translation layer — see applyAlreadyBookedCompletion() and nextSteps().
  const WEDDING_DETAIL_CATEGORIES = [
    { value: 'Venue', label: 'Venue' },
    { value: 'Photography', label: 'Photography' },
    { value: 'Ceremony', label: 'Ceremony & celebrant' },
    { value: 'Flowers', label: 'Flowers' },
    { value: 'Entertainment', label: 'Entertainment' },
    { value: 'Catering', label: 'Catering' },
    { value: 'Attire', label: 'Attire' }
  ];
  const DRESS_CODES = ['Black tie', 'Cocktail', 'Smart casual', 'Casual', 'Beach formal', 'Costume/theme'];
  const CEREMONY_TYPES = ['Religious', 'Civil/legal', 'Symbolic/humanist', 'Elopement'];
  const RECEPTION_TYPES = ['Seated dinner', 'Cocktail reception', 'Casual/BBQ', 'Brunch', 'Destination'];

  // Real UUIDs (not just opaque local strings) so a record created locally
  // can be written straight into Supabase with the same id — no remapping
  // between a "local id" and a "server id" anywhere in the app. `prefix` is
  // kept as a no-op parameter so existing call sites (uid('g'), uid('t'), …)
  // don't all need to change.
  function uid(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    // Fallback for a non-secure context (e.g. plain http:// on a LAN IP)
    // where crypto.randomUUID isn't available.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Older local-only plans stored checklist tasks as 't0', 't1', … — those
  // can never be written to a uuid column, so callers that are about to sync
  // a list use this to decide whether an existing id can be kept.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function isUuid(id) { return typeof id === 'string' && UUID_RE.test(id); }

  function loadRaw() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null; // storage unavailable (private browsing, sandboxed preview, etc.)
    }
  }

  // ---------------- REMOTE SYNC (Supabase) ----------------
  // localStorage stays the synchronous cache every render function in
  // dashboard.js already reads/writes — that's unchanged. When a couple is
  // signed in, js/data.js calls enableRemoteSync(weddingId) once, and every
  // mutator below fires a matching window.VOWREMOTE.sync*() call in the
  // background afterwards, so Supabase stays the source of truth without any
  // render code needing to become async. If remote sync was never enabled
  // (no session, or Supabase isn't configured), these calls are no-ops and
  // the app behaves exactly as the original localStorage-only build did.
  //
  // Writes go through an outbox rather than straight to Supabase, so a
  // failed save is never silently lost:
  //  - every mutation records one op, kept in localStorage until Supabase
  //    confirms it — a failed or interrupted save survives a refresh and is
  //    replayed (see flushPendingSyncs) instead of being overwritten by the
  //    next hydrate;
  //  - ops are written one at a time, oldest first. Each op carries the
  //    record's (or the whole list's) current state, so a newer op for the
  //    same record, or a whole-list replace of the same table, supersedes an
  //    older unsent one;
  //  - after a failure, later ops for the same table wait (a stale upsert
  //    must never land after a newer delete), other tables carry on, and the
  //    outbox is retried with backoff and whenever the browser comes back
  //    online.
  // Pages show progress via onSyncStateChange() — see js/sync-status.js.
  const OUTBOX_KEY = 'vowco_sync_outbox_v1';
  const RETRY_DELAYS_MS = [2000, 5000, 10000, 20000, 30000];

  // Which record each VOWREMOTE sync call writes, so ops can supersede each other.
  const SYNC_TARGETS = {
    syncWeddingUpdate: { table: 'wedding' },
    syncTasksBulkReplace: { table: 'tasks', bulk: true },
    syncTaskUpsert: { table: 'tasks', id: function (t) { return t.id; } },
    syncTaskDelete: { table: 'tasks', id: function (id) { return id; } },
    syncGuestsBulkReplace: { table: 'guests', bulk: true },
    syncTablesBulkReplace: { table: 'tables', bulk: true },
    syncAppointmentUpsert: { table: 'appointments', id: function (a) { return a.id; } },
    syncAppointmentDelete: { table: 'appointments', id: function (id) { return id; } },
    syncBudgetItemUpsert: { table: 'budgetItems', id: function (b) { return b.id; } },
    syncBudgetItemDelete: { table: 'budgetItems', id: function (id) { return id; } }
  };

  let remoteEnabled = false;
  let remoteWeddingId = null;
  let outbox = emptyOutbox(null);
  let draining = false;
  let drainAgain = false;
  let drainWaiters = [];
  let retryTimer = null;
  let retryAttempt = 0;
  let lastSyncError = null; // { kind: 'network' | 'rejected' } while the latest attempt failed
  let hasSavedThisPage = false;
  const syncListeners = [];

  function emptyOutbox(weddingId) { return { weddingId: weddingId, seq: 0, ops: {} }; }
  function outboxSize() { return Object.keys(outbox.ops).length; }

  function persistOutbox() {
    try {
      if (outboxSize()) localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox));
      else localStorage.removeItem(OUTBOX_KEY);
    } catch (e) { /* storage unavailable — the outbox still works in memory for this page */ }
  }

  function loadOutbox(weddingId) {
    try {
      const saved = JSON.parse(localStorage.getItem(OUTBOX_KEY) || 'null');
      if (saved && saved.weddingId === weddingId && saved.ops) return saved;
      if (saved) {
        // Unsent changes for a different wedding can't be written under this
        // account's session (RLS would reject them), so they're dropped.
        console.warn('[Vow & Co.] Discarding unsent changes that belong to a different wedding.');
        localStorage.removeItem(OUTBOX_KEY);
      }
    } catch (e) { /* storage unavailable or unreadable */ }
    return emptyOutbox(weddingId);
  }

  function getSyncState() {
    if (!remoteEnabled) return { status: 'idle', pending: 0 };
    const pending = outboxSize();
    if (pending && lastSyncError) return { status: 'error', pending: pending, errorKind: lastSyncError.kind };
    if (pending || draining) return { status: 'saving', pending: pending };
    return { status: hasSavedThisPage ? 'saved' : 'idle', pending: 0 };
  }

  function emitSyncState() {
    const state = getSyncState();
    syncListeners.slice().forEach(function (fn) {
      try { fn(state); } catch (e) { console.error('[Vow & Co.] Sync state listener failed:', e); }
    });
  }

  function onSyncStateChange(fn) {
    syncListeners.push(fn);
    return function () {
      const i = syncListeners.indexOf(fn);
      if (i !== -1) syncListeners.splice(i, 1);
    };
  }

  // supabase-js reports a request that never reached the server (offline,
  // DNS, CORS) as an error with an empty code; anything PostgREST/Postgres
  // actually rejected carries one.
  function isNetworkError(e) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
    return !e || !e.code;
  }

  function enableRemoteSync(weddingId) {
    remoteEnabled = true;
    remoteWeddingId = weddingId;
    outbox = loadOutbox(weddingId);
    lastSyncError = null;
    retryAttempt = 0;
    hasSavedThisPage = false;
    emitSyncState();
    if (outboxSize()) drain();
  }

  function disableRemoteSync() {
    remoteEnabled = false;
    remoteWeddingId = null;
    clearTimeout(retryTimer);
    retryTimer = null;
    emitSyncState();
  }

  function isRemoteSyncEnabled() { return remoteEnabled; }

  function remoteSync(fn, arg) {
    if (!remoteEnabled || !remoteWeddingId || !window.VOWREMOTE || typeof window.VOWREMOTE[fn] !== 'function') return;
    const target = SYNC_TARGETS[fn] || { table: fn };
    const key = target.table + ':' + (target.bulk ? '*' : (target.id ? target.id(arg) : ''));
    const op = { key: key, table: target.table, fn: fn, arg: arg === undefined ? null : JSON.parse(JSON.stringify(arg)), seq: ++outbox.seq };
    if (target.bulk) {
      Object.keys(outbox.ops).forEach(function (k) { if (outbox.ops[k].table === target.table) delete outbox.ops[k]; });
    }
    outbox.ops[key] = op;
    persistOutbox();
    emitSyncState();
    drain();
  }

  async function drain() {
    if (draining) { drainAgain = true; return; }
    if (!remoteEnabled) return;
    draining = true;
    clearTimeout(retryTimer);
    retryTimer = null;
    emitSyncState();

    let failure = null;
    do {
      drainAgain = false;
      failure = null;
      const blockedTables = {};
      const ops = Object.keys(outbox.ops).map(function (k) { return outbox.ops[k]; }).sort(function (a, b) { return a.seq - b.seq; });
      for (let i = 0; i < ops.length && remoteEnabled; i++) {
        const op = ops[i];
        if (outbox.ops[op.key] !== op || blockedTables[op.table]) continue; // superseded, or waiting behind a failed op
        try {
          await window.VOWREMOTE[op.fn](outbox.weddingId, op.arg);
          if (outbox.ops[op.key] === op) { delete outbox.ops[op.key]; persistOutbox(); }
          hasSavedThisPage = true;
        } catch (e) {
          console.error('[Vow & Co.] Supabase sync failed (' + op.fn + '):', e);
          if (typeof window.__vowcoSyncError === 'function') window.__vowcoSyncError(e, op.fn);
          blockedTables[op.table] = true;
          failure = e;
        }
      }
    } while (drainAgain && remoteEnabled);

    lastSyncError = failure && outboxSize() ? { kind: isNetworkError(failure) ? 'network' : 'rejected' } : null;
    if (lastSyncError && remoteEnabled) scheduleRetry();
    else retryAttempt = 0;
    draining = false;
    emitSyncState();
    const waiters = drainWaiters;
    drainWaiters = [];
    waiters.forEach(function (resolve) { resolve(); });
  }

  function scheduleRetry() {
    clearTimeout(retryTimer);
    const delay = RETRY_DELAYS_MS[Math.min(retryAttempt, RETRY_DELAYS_MS.length - 1)];
    retryAttempt++;
    retryTimer = setTimeout(function () { retryTimer = null; drain(); }, delay);
  }

  window.addEventListener('online', function () {
    if (remoteEnabled && outboxSize()) drain();
  });

  // Resolves true once every change recorded so far has reached Supabase, or
  // false if one failed (it stays queued and keeps retrying). A page about to
  // navigate away right after a mutation (e.g. wedding details' "Save
  // changes") must await this first — navigation can cancel an in-flight
  // request, and a failed save must not be reported as saved.
  function waitForSync() {
    return new Promise(function (resolve) {
      function done() { resolve(outboxSize() === 0); }
      if (draining) drainWaiters.push(done);
      else done();
    });
  }

  // Attempts any queued changes now (e.g. ones left over from a previous
  // page load) and resolves like waitForSync().
  function flushPendingSyncs() {
    if (remoteEnabled && outboxSize() && !draining) drain();
    return waitForSync();
  }

  function saveRaw(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  }

  // Fills in any fields added to the schema after a plan was first saved,
  // so older saved plans keep working without a manual migration step.
  function migrate(data) {
    if (!data) return data;
    if (!Array.isArray(data.budgetItems)) data.budgetItems = [];
    if (!Array.isArray(data.vendors)) data.vendors = [];
    if (!Array.isArray(data.appointments)) data.appointments = [];
    if (!Array.isArray(data.guests)) data.guests = [];
    if (!Array.isArray(data.tables)) data.tables = [];
    if (!data.messages || !Array.isArray(data.messages.threads)) data.messages = { threads: [] };
    if (!data.weddingDay) data.weddingDay = { timeline: [], contacts: [] };
    if (!Array.isArray(data.weddingDay.timeline)) data.weddingDay.timeline = [];
    if (!Array.isArray(data.weddingDay.contacts)) data.weddingDay.contacts = [];
    if (data.wedding) {
      if (data.wedding.dressCode === undefined) data.wedding.dressCode = '';
      if (data.wedding.ceremonyType === undefined) data.wedding.ceremonyType = '';
      if (data.wedding.receptionType === undefined) data.wedding.receptionType = '';
      if (!Array.isArray(data.wedding.alreadyBooked)) data.wedding.alreadyBooked = [];
      if (!Array.isArray(data.wedding.needHelpWith)) data.wedding.needHelpWith = [];
      if (data.wedding.priorities === undefined) data.wedding.priorities = '';
    }

    // Guests moved from a flat {firstName, rsvp:'Confirmed', dietary:'free text', ...}
    // shape to a richer record (see newGuestRecord below) with a proper plus-one
    // link. Only re-derive records that are still in the old shape — this must
    // stay a no-op on every normal load once a guest list has been migrated.
    const needsGuestMigration = data.guests.some(function (g) { return g.displayName === undefined; });
    if (needsGuestMigration) {
      const rsvpMap = { Confirmed: 'Yes', Declined: 'No', 'Awaiting response': 'Awaiting', Invited: 'Awaiting' };
      data.guests = data.guests.map(function (g) {
        if (g.displayName !== undefined) return g;
        let dietReq = 'None';
        let dietNotes = g.dietaryNotes || '';
        if (g.dietary) {
          const found = DIETARY_OPTIONS.find(function (d) { return d !== 'None' && g.dietary.toLowerCase().indexOf(d.toLowerCase()) !== -1; });
          if (found) { dietReq = found; } else { dietReq = 'Other'; dietNotes = g.dietary; }
        }
        const hasPlusOne = !!(g.partner && g.partner.trim());
        return newGuestRecord({
          firstName: g.firstName, lastName: g.lastName, email: g.email, phone: g.phone,
          rsvp: rsvpMap[g.rsvp] || g.rsvp || 'Awaiting',
          dietaryRequirement: dietReq, dietaryNotes: dietNotes,
          tableId: g.tableId, notes: g.notes,
          plusOneAllowed: hasPlusOne, plusOneConfirmed: hasPlusOne, plusOneName: g.partner || ''
        });
      });
      data.guests.slice().forEach(function (g) { if (!g.linkedToGuestId) syncPlusOneRecord(data, g); });
    }
    if (!Array.isArray(data.tables)) data.tables = [];
    data.tables.forEach(function (t) {
      if (t.shape === undefined) t.shape = 'Round';
      if (t.notes === undefined) t.notes = '';
    });

    // Vendors moved from a flat shortlist entry to one linked to the shared
    // vendor directory (vendorId), with a real enquiry lifecycle and a richer
    // quote — additive only, so an already-migrated vendor is untouched.
    data.vendors.forEach(function (v) {
      if (v.vendorId === undefined) v.vendorId = null;
      if (v.website === undefined) v.website = '';
      if (v.instagram === undefined) v.instagram = '';
      if (v.savedAt === undefined) v.savedAt = '';
      if (!v.enquiry) v.enquiry = { message: '', status: 'Draft', preparedAt: '', sentAt: '' };
      if (!v.quote) v.quote = { amount: Number(v.price) || 0, deposit: 0, depositPaid: false, paymentDates: [] };
      if (v.quote.packageName === undefined) v.quote.packageName = '';
      if (!Array.isArray(v.quote.servicesIncluded)) v.quote.servicesIncluded = [];
      if (v.quote.expiryDate === undefined) v.quote.expiryDate = '';
      if (v.quote.status === undefined) v.quote.status = v.quote.amount > 0 ? 'Received' : 'Requested';
      if (v.quote.receivedAt === undefined) v.quote.receivedAt = '';
      if (v.status === 'Cancelled') v.status = 'Not proceeding';
    });
    return data;
  }

  // A generic engagement-to-wedding checklist, spaced out relative to the
  // wedding date. This is the seed data for a fresh plan.
  function defaultTaskTemplate() {
    return [
      { title: 'Set your wedding budget', category: 'Planning', monthsBefore: 12, priority: 'high' },
      { title: 'Choose your wedding style', category: 'Planning', monthsBefore: 12, priority: 'high' },
      { title: 'Shortlist venues', category: 'Venue', monthsBefore: 11, priority: 'high' },
      { title: 'Book your venue', category: 'Venue', monthsBefore: 10, priority: 'high' },
      { title: 'Book your photographer', category: 'Photography', monthsBefore: 9, priority: 'high' },
      { title: 'Book your celebrant', category: 'Ceremony', monthsBefore: 9, priority: 'medium' },
      { title: 'Choose your florist', category: 'Flowers', monthsBefore: 8, priority: 'medium' },
      { title: 'Send save-the-dates', category: 'Guests', monthsBefore: 8, priority: 'medium' },
      { title: 'Book entertainment', category: 'Entertainment', monthsBefore: 6, priority: 'medium' },
      { title: 'Menu tasting', category: 'Catering', monthsBefore: 6, priority: 'medium' },
      { title: 'Order wedding attire', category: 'Attire', monthsBefore: 6, priority: 'medium' },
      { title: 'Send invitations', category: 'Guests', monthsBefore: 4, priority: 'high' },
      { title: 'Dress / suit fitting', category: 'Attire', monthsBefore: 3, priority: 'medium' },
      { title: 'Finalise ceremony readings', category: 'Ceremony', monthsBefore: 3, priority: 'medium' },
      { title: 'Confirm final guest numbers', category: 'Guests', monthsBefore: 2, priority: 'high' },
      { title: 'Build your seating plan', category: 'Reception', monthsBefore: 1.5, priority: 'medium' },
      { title: 'Confirm all vendors', category: 'Vendors', monthsBefore: 1, priority: 'high' },
      { title: 'Make final payments', category: 'Budget', monthsBefore: 0.5, priority: 'high' },
      { title: 'Give caterer final headcount', category: 'Catering', monthsBefore: 0.25, priority: 'high' }
    ];
  }

  function buildTasksFromDate(weddingDateStr) {
    const template = defaultTaskTemplate();
    const wedding = weddingDateStr ? new Date(weddingDateStr + 'T00:00:00') : null;
    return template.map(function (t) {
      let due = '';
      if (wedding && !isNaN(wedding.getTime())) {
        const d = new Date(wedding);
        d.setDate(d.getDate() - Math.round(t.monthsBefore * 30));
        due = d.toISOString().slice(0, 10);
      }
      return { id: uid('t'), title: t.title, category: t.category, monthsBefore: t.monthsBefore, dueDate: due, priority: t.priority, completed: false };
    });
  }

  function defaultWeddingDayTimeline() {
    return [
      { id: uid('wd'), time: '08:00', title: 'Hair & makeup begins', notes: '', completed: false },
      { id: uid('wd'), time: '11:00', title: 'Getting-ready photos', notes: '', completed: false },
      { id: uid('wd'), time: '12:30', title: 'Guests begin arriving', notes: '', completed: false },
      { id: uid('wd'), time: '13:00', title: 'Ceremony begins', notes: '', completed: false },
      { id: uid('wd'), time: '13:45', title: 'Cocktail hour & group photos', notes: '', completed: false },
      { id: uid('wd'), time: '15:00', title: 'Reception & guests seated', notes: '', completed: false },
      { id: uid('wd'), time: '15:30', title: 'Speeches & toasts', notes: '', completed: false },
      { id: uid('wd'), time: '16:30', title: 'Meal service', notes: '', completed: false },
      { id: uid('wd'), time: '19:00', title: 'First dance', notes: '', completed: false },
      { id: uid('wd'), time: '19:15', title: 'Dancing & entertainment', notes: '', completed: false },
      { id: uid('wd'), time: '23:00', title: 'Send-off', notes: '', completed: false }
    ];
  }

  // Creates and saves a fresh plan if none exists yet. Returns the active data
  // either way (existing saved plan takes priority over new params, so we never
  // clobber progress a couple has already made).
  function init(weddingParams) {
    let data = migrate(loadRaw());
    if (!data && weddingParams) {
      data = {
        wedding: weddingParams,
        tasks: buildTasksFromDate(weddingParams.date),
        budgetItems: [],
        vendors: [],
        appointments: [],
        guests: [],
        tables: [],
        messages: { threads: [] },
        weddingDay: { timeline: defaultWeddingDayTimeline(), contacts: [] }
      };
      saveRaw(data);
    }
    return data;
  }

  function get() { return migrate(loadRaw()); }
  function save(data) { return saveRaw(data); }
  function clearAll() { try { localStorage.removeItem(STORAGE_KEY); } catch (e) {} }

  // Replaces the Supabase-backed sections of the local cache (wedding,
  // tasks, budgetItems, guests, tables, appointments) with freshly-fetched
  // rows from js/data.js, while leaving Stage-2/local-only sections —
  // vendors, messages, weddingDay — exactly as they were. This is what makes
  // Supabase the source of truth for a signed-in couple: every dashboard
  // load re-hydrates from here before any render function runs, and every
  // render function keeps reading the same synchronous local cache as
  // before, unaware anything changed underneath it.
  //
  // The local-only sections come from this same wedding's cached plan, or
  // the copy set aside when that account last logged out (see
  // clearAccountData), or — for a couple who just signed up from an
  // anonymous draft in this browser — that draft. Never from a different
  // account's plan.
  function hydrateFrom(remoteShape) {
    const existing = loadRaw() || {};
    const weddingId = remoteShape.wedding && remoteShape.wedding.id;
    const existingId = existing.wedding && existing.wedding.id;
    const stash = loadLocalOnlyStash();
    let localOnly = {};
    if (existingId && existingId === weddingId) localOnly = existing;
    else if (weddingId && stash[weddingId]) localOnly = stash[weddingId];
    else if (existing.wedding && !existingId) localOnly = existing;

    const merged = {
      wedding: remoteShape.wedding || existing.wedding,
      tasks: remoteShape.tasks || [],
      budgetItems: remoteShape.budgetItems || [],
      guests: remoteShape.guests || [],
      tables: remoteShape.tables || [],
      appointments: remoteShape.appointments || [],
      vendors: localOnly.vendors || [],
      messages: localOnly.messages || { threads: [] },
      weddingDay: localOnly.weddingDay || { timeline: defaultWeddingDayTimeline(), contacts: [] }
    };
    const migrated = migrate(merged);
    if (saveRaw(migrated) && weddingId && stash[weddingId]) {
      delete stash[weddingId];
      saveLocalOnlyStash(stash);
    }
    return migrated;
  }

  // Local-only sections (not in Supabase yet) of each account that has
  // logged out in this browser, keyed by wedding id. Only ever read back by
  // hydrateFrom() for that same wedding, so another visitor or account never
  // sees them.
  const LOCAL_ONLY_STASH_KEY = 'vowco_local_only_by_wedding_v1';

  function loadLocalOnlyStash() {
    try { return JSON.parse(localStorage.getItem(LOCAL_ONLY_STASH_KEY) || '{}') || {}; } catch (e) { return {}; }
  }

  function saveLocalOnlyStash(stash) {
    try {
      if (Object.keys(stash).length) localStorage.setItem(LOCAL_ONLY_STASH_KEY, JSON.stringify(stash));
      else localStorage.removeItem(LOCAL_ONLY_STASH_KEY);
      return true;
    } catch (e) {
      console.warn('[Vow & Co.] Could not keep vendors/messages/wedding-day data for next sign-in:', e);
      return false;
    }
  }

  // Removes a signed-in couple's wedding plan from this browser, so the next
  // person using it can't see it — on logout, and whenever a signed-out page
  // finds one left behind. Nothing in Supabase is touched; signing back in
  // reloads it all from there. The local-only sections are set aside for that
  // account (see loadLocalOnlyStash). Unsent changes stay queued for the same
  // account unless `discardUnsaved` (logout, after the couple has confirmed
  // losing them). An anonymous local draft has no wedding id, isn't an
  // account's data, and is left alone.
  function clearAccountData(opts) {
    const data = loadRaw();
    const weddingId = data && data.wedding && data.wedding.id;
    if (weddingId) {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      const stash = loadLocalOnlyStash();
      stash[weddingId] = {
        vendors: data.vendors || [],
        messages: data.messages || { threads: [] },
        weddingDay: data.weddingDay || { timeline: [], contacts: [] }
      };
      saveLocalOnlyStash(stash);
    }
    if (opts && opts.discardUnsaved) {
      try { localStorage.removeItem(OUTBOX_KEY); } catch (e) {}
      outbox = emptyOutbox(null);
      lastSyncError = null;
    }
    disableRemoteSync();
  }

  // ---------------- TASKS ----------------

  function toggleTask(id) {
    const data = loadRaw();
    if (!data) return null;
    const t = data.tasks.find(function (x) { return x.id === id; });
    if (t) { t.completed = !t.completed; delete t.autoNote; }
    saveRaw(data);
    if (t) remoteSync('syncTaskUpsert', t);
    return data;
  }

  function addTask(title, category, dueDate, priority) {
    const data = loadRaw();
    if (!data) return null;
    const id = uid('t');
    const record = { id: id, title: title, category: category || 'Other', dueDate: dueDate || '', priority: priority || 'medium', completed: false };
    data.tasks.push(record);
    saveRaw(data);
    remoteSync('syncTaskUpsert', record);
    return data;
  }

  function deleteTask(id) {
    const data = loadRaw();
    if (!data) return null;
    data.tasks = data.tasks.filter(function (t) { return t.id !== id; });
    saveRaw(data);
    remoteSync('syncTaskDelete', id);
    return data;
  }

  function progress(data) {
    if (!data || !data.tasks || !data.tasks.length) return { pct: 0, done: 0, total: 0 };
    const done = data.tasks.filter(function (t) { return t.completed; }).length;
    return { pct: Math.round((done / data.tasks.length) * 100), done: done, total: data.tasks.length };
  }

  // Priority tier (0=high..2=low), nudged by what the couple told us in
  // Wedding Details: a category they need help with floats above same-tier
  // tasks, and reception-heavy tasks sink for an elopement or a non-seated
  // reception, where they're less likely to be relevant right now.
  function taskWeight(t, wedding) {
    const weight = { high: 0, medium: 1, low: 2 };
    let w = weight[t.priority] !== undefined ? weight[t.priority] : 1;
    const wd = wedding || {};
    if ((wd.needHelpWith || []).indexOf(t.category) !== -1) w -= 0.5;
    const deprioritizeReception = wd.ceremonyType === 'Elopement' || (wd.receptionType && wd.receptionType !== 'Seated dinner');
    if (deprioritizeReception && t.category === 'Reception') w += 1;
    return w;
  }

  function nextSteps(data, n) {
    n = n || 3;
    if (!data || !data.tasks) return [];
    const wedding = data.wedding;
    const incomplete = data.tasks.filter(function (t) { return !t.completed; });
    incomplete.sort(function (a, b) {
      const pa = taskWeight(a, wedding);
      const pb = taskWeight(b, wedding);
      if (pa !== pb) return pa - pb;
      return (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99');
    });
    return incomplete.slice(0, n);
  }

  function tasksThisMonth(data) {
    if (!data || !data.tasks) return [];
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    return data.tasks.filter(function (t) {
      if (!t.dueDate) return false;
      const d = new Date(t.dueDate + 'T00:00:00');
      return !isNaN(d.getTime()) && d.getFullYear() === y && d.getMonth() === m;
    }).sort(function (a, b) { return a.dueDate.localeCompare(b.dueDate); });
  }

  function monthlyTaskSummary(data) {
    const tasks = tasksThisMonth(data);
    const done = tasks.filter(function (t) { return t.completed; }).length;
    return { tasks: tasks, done: done, total: tasks.length };
  }

  // Groups tasks into fixed "X months out" milestones, based on how many
  // months before the wedding each task was originally scheduled for.
  // A custom (user-added) task with no monthsBefore is bucketed from its due date.
  function weddingTimelineMilestones(data) {
    const buckets = [12, 9, 6, 3, 1];
    if (!data || !data.wedding) return [];
    const weddingDate = data.wedding.date;
    const monthsUntilWedding = weddingDate ? monthsBetween(new Date(), new Date(weddingDate + 'T00:00:00')) : null;

    function nearestBucket(mb) {
      let best = buckets[0], bestDiff = Infinity;
      buckets.forEach(function (b) {
        const diff = Math.abs(b - mb);
        if (diff < bestDiff) { bestDiff = diff; best = b; }
      });
      return best;
    }

    const map = {};
    buckets.forEach(function (b) { map[b] = []; });

    (data.tasks || []).forEach(function (t) {
      let mb = t.monthsBefore;
      if (mb === undefined || mb === null) {
        if (t.dueDate && weddingDate) {
          mb = monthsBetween(new Date(t.dueDate + 'T00:00:00'), new Date(weddingDate + 'T00:00:00'));
        } else {
          mb = 1;
        }
      }
      map[nearestBucket(mb)].push(t);
    });

    return buckets.map(function (b) {
      const tasks = map[b];
      const done = tasks.filter(function (t) { return t.completed; }).length;
      return {
        monthsOut: b,
        label: b + ' month' + (b === 1 ? '' : 's') + ' out',
        tasks: tasks,
        done: done,
        total: tasks.length,
        isPast: monthsUntilWedding !== null && monthsUntilWedding < b - 1.5,
        isCurrent: monthsUntilWedding !== null && Math.abs(monthsUntilWedding - b) <= 1.5
      };
    });
  }

  function monthsBetween(from, to) {
    let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
    const dayFrac = (to.getDate() - from.getDate()) / 30;
    return months + dayFrac;
  }

  function formatDateShort(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  }

  // ---------------- WEDDING DETAILS ----------------

  function weddingDetailsCompletion(data) {
    const w = (data && data.wedding) || {};
    const fields = [
      !!w.dressCode,
      !!w.ceremonyType,
      !!w.receptionType,
      !!(w.alreadyBooked && w.alreadyBooked.length),
      !!(w.needHelpWith && w.needHelpWith.length),
      !!(w.priorities && w.priorities.trim())
    ];
    return { answered: fields.filter(Boolean).length, total: fields.length };
  }

  // Marks every incomplete task in a booked category as done, with a small
  // note so it's clear why. The note (and this effect) clears the moment a
  // couple manually toggles that task themselves — see toggleTask().
  function applyAlreadyBookedCompletion(data) {
    const booked = (data.wedding && data.wedding.alreadyBooked) || [];
    if (!booked.length) return;
    data.tasks.forEach(function (t) {
      if (!t.completed && booked.indexOf(t.category) !== -1) {
        t.completed = true;
        t.autoNote = 'Marked complete from your wedding details';
      }
    });
  }

  // Merges new answers into the existing wedding object — this is an update,
  // never a new record. If the date/guest count/budget changed, task due
  // dates are regenerated from scratch, but each template task keeps its
  // existing id and completion by matching on title — so changing your date
  // never wipes real progress, and the synced Supabase rows are updated in
  // place rather than deleted and recreated.
  function updateWeddingDetails(patch) {
    const data = loadRaw();
    if (!data || !data.wedding) return null;
    const oldWedding = data.wedding;
    const dateChanged = patch.date !== undefined && patch.date !== oldWedding.date;
    const guestsChanged = patch.guests !== undefined && Number(patch.guests) !== Number(oldWedding.guests);
    const budgetChanged = patch.budget !== undefined && Number(patch.budget) !== Number(oldWedding.budget);

    data.wedding = Object.assign({}, oldWedding, patch);
    if (patch.guests !== undefined) data.wedding.guests = Number(patch.guests) || 0;
    if (patch.budget !== undefined) data.wedding.budget = Number(patch.budget) || 0;

    if (dateChanged || guestsChanged || budgetChanged) {
      const fresh = buildTasksFromDate(data.wedding.date);
      const templateTitles = {};
      defaultTaskTemplate().forEach(function (t) { templateTitles[t.title] = true; });
      const existingByTitle = {};
      data.tasks.forEach(function (t) {
        if (templateTitles[t.title] && !existingByTitle[t.title]) existingByTitle[t.title] = t;
      });
      const customTasks = data.tasks
        .filter(function (t) { return !templateTitles[t.title]; })
        .map(function (t) { return isUuid(t.id) ? t : Object.assign({}, t, { id: uid('t') }); });
      const regenerated = fresh.map(function (t) {
        const prev = existingByTitle[t.title];
        const patch = { completed: !!(prev && prev.completed) };
        if (prev && isUuid(prev.id)) patch.id = prev.id;
        if (prev && prev.completed && prev.autoNote) patch.autoNote = prev.autoNote;
        return Object.assign({}, t, patch);
      });
      data.tasks = regenerated.concat(customTasks);
    }

    applyAlreadyBookedCompletion(data);
    saveRaw(data);
    remoteSync('syncWeddingUpdate', data.wedding);
    if (dateChanged || guestsChanged || budgetChanged) remoteSync('syncTasksBulkReplace', data.tasks);
    return data;
  }

  // ---------------- BUDGET ----------------

  function addBudgetItem(item) {
    const data = loadRaw();
    if (!data) return null;
    const record = {
      id: uid('b'),
      category: item.category || 'Other',
      vendorName: item.vendorName || '',
      description: item.description || '',
      amount: Number(item.amount) || 0,
      paidAmount: Number(item.paidAmount) || 0,
      dueDate: item.dueDate || '',
      linkedVendorId: item.linkedVendorId || null
    };
    data.budgetItems.push(record);
    saveRaw(data);
    remoteSync('syncBudgetItemUpsert', record);
    return data;
  }

  function updateBudgetItem(id, patch) {
    const data = loadRaw();
    if (!data) return null;
    const item = data.budgetItems.find(function (b) { return b.id === id; });
    if (item) Object.assign(item, patch);
    saveRaw(data);
    if (item) remoteSync('syncBudgetItemUpsert', item);
    return data;
  }

  function deleteBudgetItem(id) {
    const data = loadRaw();
    if (!data) return null;
    data.budgetItems = data.budgetItems.filter(function (b) { return b.id !== id; });
    saveRaw(data);
    remoteSync('syncBudgetItemDelete', id);
    return data;
  }

  function markBudgetItemPaid(id, paid) {
    const data = loadRaw();
    if (!data) return null;
    const item = data.budgetItems.find(function (b) { return b.id === id; });
    if (item) item.paidAmount = paid ? item.amount : 0;
    saveRaw(data);
    if (item) remoteSync('syncBudgetItemUpsert', item);
    return data;
  }

  function budgetTotals(data) {
    const items = (data && data.budgetItems) || [];
    const totalBudget = (data && data.wedding && Number(data.wedding.budget)) || 0;
    const totalCommitted = items.reduce(function (s, i) { return s + (Number(i.amount) || 0); }, 0);
    const totalPaid = items.reduce(function (s, i) { return s + (Number(i.paidAmount) || 0); }, 0);
    const totalRemaining = totalCommitted - totalPaid;
    const unallocated = totalBudget - totalCommitted;
    return { totalBudget: totalBudget, totalCommitted: totalCommitted, totalPaid: totalPaid, totalRemaining: totalRemaining, unallocated: unallocated };
  }

  // Combines the couple's target allocation per category (from VOWCO's
  // percentage model) with what's actually been committed/paid so far.
  function budgetByCategory(data) {
    const budget = (data && data.wedding && Number(data.wedding.budget)) || 0;
    const breakdown = (typeof VOWCO !== 'undefined') ? VOWCO.budgetBreakdown(budget) : CATEGORIES.map(function (c) { return { label: c, amount: 0 }; });
    const items = (data && data.budgetItems) || [];
    return breakdown.map(function (b) {
      const catItems = items.filter(function (i) { return i.category === b.label; });
      const committed = catItems.reduce(function (s, i) { return s + (Number(i.amount) || 0); }, 0);
      const paid = catItems.reduce(function (s, i) { return s + (Number(i.paidAmount) || 0); }, 0);
      return { category: b.label, allocated: b.amount, committed: committed, paid: paid, items: catItems };
    });
  }

  function budgetAlerts(data) {
    if (!data || !data.wedding) return [];
    const alerts = [];
    const totals = budgetTotals(data);
    const byCategory = budgetByCategory(data);
    const p = progress(data);

    byCategory.forEach(function (c) {
      if (c.allocated > 0 && c.committed > c.allocated) {
        alerts.push({
          level: 'warning',
          text: c.category + ' is over budget — your allocation is ' + VOWCO.formatCurrency(c.allocated) + ', your current committed spend is ' + VOWCO.formatCurrency(c.committed) + '.',
          linkHref: '#vendors',
          linkLabel: 'View alternatives'
        });
      }
    });

    if (totals.totalBudget > 0) {
      const spentPct = Math.round((totals.totalPaid / totals.totalBudget) * 100);
      if (!byCategory.some(function (c) { return c.allocated > 0 && c.committed > c.allocated; })) {
        alerts.push({
          level: 'success',
          text: "You're on track — you've spent " + spentPct + '% of your budget and completed ' + p.pct + '% of your planning.',
          linkHref: '#budget',
          linkLabel: null
        });
      }
      if (totals.unallocated > 0) {
        alerts.push({
          level: 'info',
          text: VOWCO.formatCurrency(totals.unallocated) + ' unallocated — you still have ' + VOWCO.formatCurrency(totals.unallocated) + ' of your budget that hasn’t been assigned to a vendor or expense yet.',
          linkHref: '#budget',
          linkLabel: 'Review the budget'
        });
      }
    }

    return alerts;
  }

  // ---------------- VENDORS ----------------
  // A vendor relationship record (data.vendors[]) is couple-private: it tracks
  // where this couple has got to with one business, never the business's own
  // public details. When vendorId is set it links back to a record in the
  // shared VOWVENDORS directory (vendor-directory.js) — name/category/contact
  // are copied in once at save time purely so the rest of this app's UI can
  // keep reading v.name/v.category directly, not because the directory record
  // is duplicated data of record. A vendor added with no vendorId is a fully
  // custom entry (a business not yet in the directory) and behaves exactly as
  // before.

  function addVendor(v) {
    const data = loadRaw();
    if (!data) return null;
    let dir = null;
    if (v.vendorId && typeof VOWVENDORS !== 'undefined') dir = VOWVENDORS.byId(v.vendorId);
    data.vendors.push({
      id: uid('v'),
      vendorId: v.vendorId || null,
      name: v.name || (dir ? dir.name : ''),
      category: v.category || (dir ? dir.category : 'Other'),
      location: v.location || (dir ? [dir.suburb, dir.region].filter(Boolean).join(', ') : ''),
      website: v.website || (dir ? dir.website : ''),
      instagram: v.instagram || (dir ? dir.instagram : ''),
      price: Number(v.price) || (dir && dir.startingPrice ? Number(dir.startingPrice) : 0),
      status: v.status || 'Shortlisted',
      contactEmail: v.contactEmail || (dir ? dir.email : ''),
      contactPhone: v.contactPhone || (dir ? dir.phone : ''),
      enquiry: { message: '', status: 'Draft', preparedAt: '', sentAt: '' },
      quote: { amount: Number(v.price) || 0, deposit: 0, depositPaid: false, paymentDates: [], packageName: '', servicesIncluded: [], expiryDate: '', status: 'Requested', receivedAt: '' },
      notes: '',
      documents: [],
      linkedBudgetItemId: null,
      savedAt: new Date().toISOString()
    });
    saveRaw(data);
    return data;
  }

  function getVendor(data, id) {
    return (data.vendors || []).find(function (v) { return v.id === id; }) || null;
  }

  // A couple can shortlist the same directory business more than once only by
  // mistake (e.g. double-clicking Save) — this finds an existing link so the
  // UI can treat a repeat Save as a no-op rather than creating a duplicate row.
  function findVendorByDirectoryId(data, vendorId) {
    return (data && data.vendors || []).find(function (v) { return v.vendorId === vendorId; }) || null;
  }

  function updateVendor(id, patch) {
    const data = loadRaw();
    if (!data) return null;
    const v = data.vendors.find(function (x) { return x.id === id; });
    if (v) Object.assign(v, patch);
    saveRaw(data);
    return data;
  }

  function deleteVendor(id) {
    const data = loadRaw();
    if (!data) return null;
    data.vendors = data.vendors.filter(function (v) { return v.id !== id; });
    saveRaw(data);
    return data;
  }

  function setVendorStatus(id, status) {
    const data = loadRaw();
    if (!data) return null;
    const v = data.vendors.find(function (x) { return x.id === id; });
    if (!v) return data;
    v.status = status;
    if ((status === 'Booked' || status === 'Paid') && !v.linkedBudgetItemId && v.quote && v.quote.amount > 0) {
      const nextUnpaid = (v.quote.paymentDates || []).find(function (p) { return !p.paid; });
      // v.category may be a shared-directory category (e.g. "Venues") rather
      // than one of the budget's own categories (e.g. "Venue & reception") —
      // map it across so the booking actually lands in the right budget row
      // instead of silently vanishing from every category's committed total.
      const budgetCategory = (typeof VOWVENDORS !== 'undefined' && VOWVENDORS.BUDGET_CATEGORY_MAP[v.category]) ||
        (CATEGORIES.indexOf(v.category) !== -1 ? v.category : 'Other');
      const item = {
        id: uid('b'),
        category: budgetCategory,
        vendorName: v.name,
        description: 'Booked via My Vendors',
        amount: v.quote.amount,
        paidAmount: v.quote.depositPaid ? (Number(v.quote.deposit) || 0) : 0,
        dueDate: nextUnpaid ? nextUnpaid.date : '',
        linkedVendorId: v.id
      };
      data.budgetItems.push(item);
      v.linkedBudgetItemId = item.id;
      saveRaw(data);
      remoteSync('syncBudgetItemUpsert', item);
      return data;
    }
    if (status === 'Paid' && v.linkedBudgetItemId) {
      const item = data.budgetItems.find(function (b) { return b.id === v.linkedBudgetItemId; });
      if (item) {
        item.paidAmount = item.amount;
        saveRaw(data);
        remoteSync('syncBudgetItemUpsert', item);
        return data;
      }
    }
    saveRaw(data);
    return data;
  }

  function saveVendorNotes(id, notes) {
    const data = loadRaw();
    if (!data) return null;
    const v = data.vendors.find(function (x) { return x.id === id; });
    if (v) v.notes = notes;
    saveRaw(data);
    return data;
  }

  // Builds/updates the editable enquiry draft (message + any fields the UI
  // wants to pre-fill). This never contacts a vendor — it only ever saves a
  // draft. Call sendVendorEnquiry to move it into "sent" state.
  function saveVendorEnquiry(id, patch) {
    const data = loadRaw();
    if (!data) return null;
    const v = data.vendors.find(function (x) { return x.id === id; });
    if (!v) return data;
    if (!v.enquiry) v.enquiry = { message: '', status: 'Draft', preparedAt: '', sentAt: '' };
    v.enquiry = Object.assign(v.enquiry, patch, { preparedAt: v.enquiry.preparedAt || new Date().toISOString() });
    if (!v.enquiry.status || v.enquiry.status === 'Draft') v.enquiry.status = 'Prepared';
    saveRaw(data);
    return data;
  }

  // Marks an enquiry as sent and opens/continues its message thread with the
  // enquiry text as the first message. There is no real vendor-side email
  // integration in this app, so the UI must describe this as "Enquiry saved",
  // never as a message actually delivered to the vendor.
  function sendVendorEnquiry(id) {
    let data = loadRaw();
    if (!data) return null;
    const v = data.vendors.find(function (x) { return x.id === id; });
    if (!v) return data;
    if (!v.enquiry) v.enquiry = { message: '', status: 'Draft', preparedAt: '', sentAt: '' };
    v.enquiry.status = 'Sent';
    v.enquiry.sentAt = new Date().toISOString();
    if (v.status === 'Shortlisted') v.status = 'Enquiry sent';
    saveRaw(data);
    data = getOrCreateThread(v.id, v.name);
    const thread = data.messages.threads.find(function (t) { return t.vendorId === v.id; });
    if (thread && v.enquiry.message) {
      thread.messages.push({ id: uid('m'), from: 'couple', text: v.enquiry.message, date: new Date().toISOString() });
      saveRaw(data);
    }
    return data;
  }

  function saveVendorQuote(id, quote) {
    const data = loadRaw();
    if (!data) return null;
    const v = data.vendors.find(function (x) { return x.id === id; });
    if (v) {
      const hadAmount = !!(v.quote && v.quote.amount > 0);
      v.quote = Object.assign({ amount: 0, deposit: 0, depositPaid: false, paymentDates: [], packageName: '', servicesIncluded: [], expiryDate: '', status: 'Received', receivedAt: '' }, v.quote, quote);
      v.price = Number(v.quote.amount) || v.price;
      if (!hadAmount && v.quote.amount > 0) {
        v.quote.receivedAt = v.quote.receivedAt || new Date().toISOString();
        if (['Shortlisted', 'Enquiry sent', 'Response received'].indexOf(v.status) !== -1) v.status = 'Quote received';
      }
      if (v.linkedBudgetItemId) {
        const item = data.budgetItems.find(function (b) { return b.id === v.linkedBudgetItemId; });
        if (item) {
          item.amount = v.quote.amount;
          const paidSoFar = (v.quote.depositPaid ? Number(v.quote.deposit) || 0 : 0) +
            (v.quote.paymentDates || []).reduce(function (s, p) { return s + (p.paid ? Number(p.amount) || 0 : 0); }, 0);
          item.paidAmount = item.amount ? Math.min(paidSoFar, item.amount) : paidSoFar;
          if (item.amount > 0 && item.paidAmount >= item.amount) v.status = 'Paid';
          saveRaw(data);
          remoteSync('syncBudgetItemUpsert', item);
          return data;
        }
      }
    }
    saveRaw(data);
    return data;
  }

  // Adds a future, unpaid instalment to the payment schedule (e.g. "Final
  // balance due 3 weeks before the wedding") without marking anything paid.
  function addVendorPaymentScheduleItem(id, item) {
    const data = loadRaw();
    if (!data) return null;
    const v = data.vendors.find(function (x) { return x.id === id; });
    if (!v) return data;
    if (!v.quote) v.quote = { amount: 0, deposit: 0, depositPaid: false, paymentDates: [] };
    if (!Array.isArray(v.quote.paymentDates)) v.quote.paymentDates = [];
    v.quote.paymentDates.push({ id: uid('pay'), label: item.label || 'Payment', date: item.date || '', amount: Number(item.amount) || 0, paid: false });
    saveRaw(data);
    return data;
  }

  // Records a payment actually made — either against an existing scheduled
  // instalment (pass paymentId) or as a new ad-hoc paid entry — and keeps the
  // linked budget item's paidAmount, and a fully-paid vendor's status, in sync.
  function recordVendorPayment(id, payment) {
    const data = loadRaw();
    if (!data) return null;
    const v = data.vendors.find(function (x) { return x.id === id; });
    if (!v) return data;
    if (!v.quote) v.quote = { amount: 0, deposit: 0, depositPaid: false, paymentDates: [] };
    if (!Array.isArray(v.quote.paymentDates)) v.quote.paymentDates = [];
    let entry = payment.paymentId ? v.quote.paymentDates.find(function (p) { return p.id === payment.paymentId; }) : null;
    if (entry) {
      entry.paid = true;
      entry.date = payment.date || entry.date || new Date().toISOString().slice(0, 10);
      if (payment.amount != null) entry.amount = Number(payment.amount) || entry.amount;
    } else {
      entry = { id: uid('pay'), label: payment.label || 'Payment', date: payment.date || new Date().toISOString().slice(0, 10), amount: Number(payment.amount) || 0, paid: true };
      v.quote.paymentDates.push(entry);
    }
    if (v.linkedBudgetItemId) {
      const budgetItem = data.budgetItems.find(function (b) { return b.id === v.linkedBudgetItemId; });
      if (budgetItem) {
        const paidSoFar = v.quote.paymentDates.filter(function (p) { return p.paid; }).reduce(function (s, p) { return s + (Number(p.amount) || 0); }, 0);
        budgetItem.paidAmount = budgetItem.amount ? Math.min(paidSoFar, budgetItem.amount) : paidSoFar;
        if (budgetItem.amount > 0 && budgetItem.paidAmount >= budgetItem.amount) v.status = 'Paid';
        saveRaw(data);
        remoteSync('syncBudgetItemUpsert', budgetItem);
        return data;
      }
    }
    saveRaw(data);
    return data;
  }

  function vendorsByCategory(data, category) {
    return (data.vendors || []).filter(function (v) { return v.category === category; });
  }

  function shortlistByCategory(data) {
    const groups = {};
    (data && data.vendors || []).forEach(function (v) {
      if (!groups[v.category]) groups[v.category] = [];
      groups[v.category].push(v);
    });
    return groups;
  }

  function vendorTotals(data) {
    const vendors = (data && data.vendors) || [];
    const booked = vendors.filter(function (v) { return v.status === 'Booked' || v.status === 'Paid'; }).length;
    const pending = vendors.filter(function (v) { return v.status === 'Quote received' || v.status === 'Negotiating'; }).length;
    return { total: vendors.length, booked: booked, pending: pending };
  }

  // Booked-vendor progress across the categories that matter most for a
  // typical wedding, for a "6/10 major vendors booked" style summary. A
  // category counts once it has at least one Booked or Paid vendor.
  function vendorProgressStats(data) {
    const vendors = (data && data.vendors) || [];
    const bookedCategories = {};
    vendors.forEach(function (v) {
      if (v.status === 'Booked' || v.status === 'Paid') bookedCategories[v.category] = true;
    });
    const majorBooked = MAJOR_VENDOR_CATEGORIES.filter(function (c) { return bookedCategories[c]; }).length;
    return {
      total: vendors.length,
      booked: vendors.filter(function (v) { return v.status === 'Booked' || v.status === 'Paid'; }).length,
      shortlisted: vendors.filter(function (v) { return v.status === 'Shortlisted'; }).length,
      quotesPending: vendors.filter(function (v) { return v.status === 'Enquiry sent' || v.status === 'Response received'; }).length,
      majorTotal: MAJOR_VENDOR_CATEGORIES.length,
      majorBooked: majorBooked,
      pct: MAJOR_VENDOR_CATEGORIES.length ? Math.round((majorBooked / MAJOR_VENDOR_CATEGORIES.length) * 100) : 0
    };
  }

  // Every unpaid, dated instalment across all booked vendors, soonest first —
  // feeds the dashboard / wedding-day "Upcoming vendor payments" widget.
  function upcomingVendorPayments(data, n) {
    const vendors = (data && data.vendors) || [];
    const now = new Date().toISOString().slice(0, 10);
    const list = [];
    vendors.forEach(function (v) {
      ((v.quote && v.quote.paymentDates) || []).forEach(function (p) {
        if (!p.paid && p.date && p.date >= now) {
          list.push({ vendorRecordId: v.id, paymentId: p.id, vendorName: v.name, category: v.category, date: p.date, amount: p.amount, label: p.label || 'Payment' });
        }
      });
    });
    list.sort(function (a, b) { return a.date.localeCompare(b.date); });
    return n ? list.slice(0, n) : list;
  }

  // ---------------- GUESTS & SEATING ----------------
  // One guest list is the single source of truth for RSVPs, dietary needs,
  // plus-ones, and table assignments — the seating chart never holds its own
  // guest data, it only ever reads/writes through these same functions.
  //
  // A confirmed plus-one is materialized as its own real guest record (not
  // just a text field) so it can be seated, counted, and shown a dietary
  // requirement like anyone else. It's linked both ways: the primary guest
  // stores plusOneGuestId, the plus-one record stores linkedToGuestId back to
  // them. Plus-one records are filtered out of the main guest list table (they
  // show nested under their primary instead) — see filterGuests().

  function newGuestRecord(g) {
    g = g || {};
    const first = (g.firstName || '').trim();
    const last = (g.lastName || '').trim();
    return {
      id: uid('g'),
      firstName: first,
      lastName: last,
      displayName: g.displayName || ((first + ' ' + last).trim()) || 'Guest',
      email: g.email || '',
      phone: g.phone || '',
      rsvp: g.rsvp || 'Awaiting',
      guestType: g.guestType || 'guest',
      invited: g.invited !== undefined ? !!g.invited : true,
      plusOneAllowed: !!g.plusOneAllowed,
      plusOneConfirmed: !!g.plusOneConfirmed,
      plusOneName: g.plusOneName || '',
      plusOneRelationship: g.plusOneRelationship || '',
      plusOneGuestId: g.plusOneGuestId || null,
      linkedToGuestId: g.linkedToGuestId || null,
      dietaryRequirement: g.dietaryRequirement || 'None',
      dietaryNotes: g.dietaryNotes || '',
      tableId: g.tableId || null,
      tableSeat: g.tableSeat || null,
      lastTableId: g.lastTableId || null,
      relationshipGroup: g.relationshipGroup || '',
      sideOfCouple: g.sideOfCouple || '',
      notes: g.notes || '',
      isChild: !!g.isChild,
      accessibilityNotes: g.accessibilityNotes || '',
      invitationSent: !!g.invitationSent,
      invitationDate: g.invitationDate || '',
      rsvpDate: g.rsvpDate || ''
    };
  }

  function plusOneStatus(g) {
    if (!g.plusOneAllowed) return 'none';
    return g.plusOneConfirmed ? 'confirmed' : 'allowed';
  }

  // Creates, updates, or removes a primary guest's linked plus-one record so
  // it always matches what the primary's form says right now.
  function syncPlusOneRecord(data, primary) {
    const shouldExist = primary.plusOneConfirmed && primary.plusOneName.trim();
    let linked = primary.plusOneGuestId ? data.guests.find(function (x) { return x.id === primary.plusOneGuestId; }) : null;

    if (!shouldExist) {
      if (linked) {
        data.guests = data.guests.filter(function (x) { return x.id !== linked.id; });
        primary.plusOneGuestId = null;
      }
      return;
    }

    if (!linked) {
      linked = newGuestRecord({ firstName: primary.plusOneName.trim(), guestType: 'plus-one', linkedToGuestId: primary.id });
      data.guests.push(linked);
      primary.plusOneGuestId = linked.id;
    }

    linked.firstName = primary.plusOneName.trim();
    linked.lastName = '';
    linked.displayName = primary.plusOneName.trim();
    linked.rsvp = primary.rsvp;
    linked.invited = primary.invited;
    linked.relationshipGroup = primary.relationshipGroup;
    linked.sideOfCouple = primary.sideOfCouple;
    linked.linkedToGuestId = primary.id;
  }

  function addGuest(g) {
    const data = loadRaw();
    if (!data) return null;
    const guest = newGuestRecord(g);
    data.guests.push(guest);
    syncPlusOneRecord(data, guest);
    saveRaw(data);
    remoteSync('syncGuestsBulkReplace', data.guests);
    return { data: data, guest: guest };
  }

  function updateGuest(id, patch) {
    const data = loadRaw();
    if (!data) return null;
    const g = data.guests.find(function (x) { return x.id === id; });
    if (!g) return data;
    const rsvpChanging = patch.rsvp !== undefined && patch.rsvp !== g.rsvp;
    Object.assign(g, patch);

    if (rsvpChanging) {
      g.rsvpDate = new Date().toISOString().slice(0, 10);
      // Coming back to Yes with no current seat: restore the table they were
      // last removed from, if it still exists and still has room.
      if (g.rsvp === 'Yes' && !g.tableId && g.lastTableId) {
        const table = data.tables.find(function (t) { return t.id === g.lastTableId; });
        if (table) {
          const occ = data.guests.filter(function (x) { return x.tableId === table.id; }).length;
          if (occ < table.seats) g.tableId = table.id;
        }
        g.lastTableId = null;
      }
    }

    if (g.linkedToGuestId) {
      // editing a materialized plus-one record directly — keep the primary's text field in sync
      const primary = data.guests.find(function (x) { return x.id === g.linkedToGuestId; });
      if (primary) primary.plusOneName = g.displayName;
    } else {
      syncPlusOneRecord(data, g);
      if (rsvpChanging && g.plusOneGuestId) {
        const po = data.guests.find(function (x) { return x.id === g.plusOneGuestId; });
        if (po) po.rsvp = g.rsvp;
      }
    }
    saveRaw(data);
    remoteSync('syncGuestsBulkReplace', data.guests);
    return data;
  }

  function deleteGuest(id) {
    const data = loadRaw();
    if (!data) return null;
    const g = data.guests.find(function (x) { return x.id === id; });
    if (g) {
      if (g.plusOneGuestId) data.guests = data.guests.filter(function (x) { return x.id !== g.plusOneGuestId; });
      if (g.linkedToGuestId) {
        const primary = data.guests.find(function (x) { return x.id === g.linkedToGuestId; });
        if (primary) { primary.plusOneGuestId = null; primary.plusOneConfirmed = false; }
      }
    }
    data.guests = data.guests.filter(function (x) { return x.id !== id; });
    saveRaw(data);
    remoteSync('syncGuestsBulkReplace', data.guests);
    return data;
  }

  function getGuest(data, id) {
    return (data.guests || []).find(function (g) { return g.id === id; }) || null;
  }

  // Convenience wrapper — all the actual RSVP side effects (date stamping,
  // linked plus-one sync, restoring a previous table on a return to Yes)
  // live in updateGuest() so they apply no matter which entry point is used.
  function setGuestRsvp(id, rsvp) { return updateGuest(id, { rsvp: rsvp }); }

  function guestTotals(data) {
    const guests = (data && data.guests) || [];
    const totals = {};
    RSVP_STATUSES.forEach(function (s) { totals[s] = 0; });
    guests.forEach(function (g) { totals[g.rsvp] = (totals[g.rsvp] || 0) + 1; });
    return { byStatus: totals, total: guests.length, invited: guests.filter(function (g) { return g.invited; }).length };
  }

  // confirmedOnly=true restricts to guests who RSVP'd Yes — used for catering,
  // since planning food for an "awaiting" guest isn't useful yet.
  function dietaryBreakdown(data, confirmedOnly) {
    const guests = ((data && data.guests) || []).filter(function (g) { return !confirmedOnly || g.rsvp === 'Yes'; });
    const counts = {};
    guests.forEach(function (g) {
      const d = g.dietaryRequirement;
      if (!d || d === 'None') return;
      counts[d] = (counts[d] || 0) + 1;
    });
    return DIETARY_OPTIONS.filter(function (d) { return d !== 'None' && counts[d]; }).map(function (d) { return { label: d, count: counts[d] }; });
  }

  // Search + combinable filters over the guest list. Plus-one records are
  // excluded here — they're shown nested under their primary guest instead.
  function filterGuests(data, opts) {
    opts = opts || {};
    let list = (data.guests || []).filter(function (g) { return !g.linkedToGuestId; });
    const q = (opts.query || '').trim().toLowerCase();
    if (q) {
      list = list.filter(function (g) {
        return g.displayName.toLowerCase().indexOf(q) !== -1 ||
          (g.email || '').toLowerCase().indexOf(q) !== -1 ||
          (g.phone || '').toLowerCase().indexOf(q) !== -1;
      });
    }
    (opts.filters || []).forEach(function (f) {
      if (f === 'invited') list = list.filter(function (g) { return g.invited; });
      else if (f === 'confirmed') list = list.filter(function (g) { return g.rsvp === 'Yes'; });
      else if (f === 'awaiting') list = list.filter(function (g) { return g.rsvp === 'Awaiting'; });
      else if (f === 'declined') list = list.filter(function (g) { return g.rsvp === 'No'; });
      else if (f === 'plusones') list = list.filter(function (g) { return g.plusOneAllowed; });
      else if (f === 'dietary') list = list.filter(function (g) { return g.dietaryRequirement && g.dietaryRequirement !== 'None'; });
      else if (f === 'unassigned') list = list.filter(function (g) { return !g.tableId; });
      else if (f === 'bride') list = list.filter(function (g) { return g.sideOfCouple === 'Bride'; });
      else if (f === 'groom') list = list.filter(function (g) { return g.sideOfCouple === 'Groom'; });
    });
    return list;
  }

  function relationshipGroups(data) {
    const groups = {};
    (data.guests || []).forEach(function (g) {
      const key = g.relationshipGroup || 'Ungrouped';
      (groups[key] = groups[key] || []).push(g);
    });
    return groups;
  }

  // ---- Tables ----

  function addTable(opts) {
    const data = loadRaw();
    if (!data) return null;
    const table = {
      id: uid('tbl'),
      name: (opts && opts.name) || ('Table ' + (data.tables.length + 1)),
      seats: Math.max(1, Number(opts && opts.seats) || 8),
      shape: (opts && opts.shape) || 'Round',
      notes: (opts && opts.notes) || ''
    };
    data.tables.push(table);
    saveRaw(data);
    remoteSync('syncTablesBulkReplace', data.tables);
    return data;
  }

  function updateTable(id, patch) {
    const data = loadRaw();
    if (!data) return null;
    const t = data.tables.find(function (x) { return x.id === id; });
    if (t) Object.assign(t, patch);
    saveRaw(data);
    remoteSync('syncTablesBulkReplace', data.tables);
    return data;
  }

  function deleteTable(id) {
    const data = loadRaw();
    if (!data) return null;
    data.tables = data.tables.filter(function (t) { return t.id !== id; });
    data.guests.forEach(function (g) { if (g.tableId === id) { g.tableId = null; g.tableSeat = null; } });
    saveRaw(data);
    remoteSync('syncTablesBulkReplace', data.tables);
    remoteSync('syncGuestsBulkReplace', data.guests);
    return data;
  }

  function assignGuestToTable(guestId, tableId, seatNum) {
    const data = loadRaw();
    if (!data) return null;
    const g = data.guests.find(function (x) { return x.id === guestId; });
    if (g) {
      if (!tableId && g.tableId) g.lastTableId = g.tableId; // remembered so a later "Yes" can restore it
      g.tableId = tableId || null;
      g.tableSeat = tableId ? (seatNum || null) : null;
    }
    saveRaw(data);
    remoteSync('syncGuestsBulkReplace', data.guests);
    return data;
  }

  function tableOccupancy(data, tableId) {
    const guests = (data.guests || []).filter(function (g) { return g.tableId === tableId; });
    const table = (data.tables || []).find(function (t) { return t.id === tableId; });
    return { guests: guests, seatsUsed: guests.length, seatsTotal: table ? table.seats : 0, table: table || null };
  }

  function seatingStats(data) {
    const guests = data.guests || [];
    const confirmed = guests.filter(function (g) { return g.rsvp === 'Yes'; });
    const seatedConfirmed = confirmed.filter(function (g) { return g.tableId; });
    const unassignedConfirmed = confirmed.filter(function (g) { return !g.tableId; });
    const occupancies = (data.tables || []).map(function (t) { return tableOccupancy(data, t.id); });
    const overCapacityTables = occupancies.filter(function (o) { return o.seatsUsed > o.seatsTotal; });
    const totalSeats = occupancies.reduce(function (s, o) { return s + o.seatsTotal; }, 0);
    const usedSeats = occupancies.reduce(function (s, o) { return s + o.seatsUsed; }, 0);
    return {
      confirmedCount: confirmed.length,
      seatedCount: seatedConfirmed.length,
      unassignedCount: unassignedConfirmed.length,
      unassignedGuests: unassignedConfirmed,
      tableCount: data.tables.length,
      totalSeats: totalSeats,
      usedSeats: usedSeats,
      seatsRemaining: Math.max(0, totalSeats - usedSeats),
      overCapacityTables: overCapacityTables,
      completionPct: confirmed.length ? Math.round((seatedConfirmed.length / confirmed.length) * 100) : 0
    };
  }

  // Computed, not stored — always derived fresh from real guest/table data.
  function seatingWarnings(data) {
    const warnings = [];
    const stats = seatingStats(data);

    stats.overCapacityTables.forEach(function (o) {
      const over = o.seatsUsed - o.seatsTotal;
      warnings.push({ level: 'warning', text: (o.table ? o.table.name : 'A table') + ' is over capacity by ' + over + ' guest' + (over === 1 ? '' : 's') + '.' });
    });

    if (stats.unassignedCount > 0) {
      warnings.push({ level: 'info', text: stats.unassignedCount + ' confirmed guest' + (stats.unassignedCount === 1 ? '' : 's') + ' still need' + (stats.unassignedCount === 1 ? 's' : '') + ' a table.' });
    }

    data.guests.forEach(function (g) {
      if (!g.plusOneGuestId) return;
      const po = data.guests.find(function (x) { return x.id === g.plusOneGuestId; });
      if (!po) return;
      if (g.tableId && po.tableId && g.tableId !== po.tableId) {
        warnings.push({ level: 'warning', text: g.displayName + ' and ' + po.displayName + ' are currently seated at different tables.' });
      } else if (g.tableId && !po.tableId) {
        warnings.push({ level: 'warning', text: po.displayName + ' is marked as ' + g.displayName + '’s plus-one but hasn’t been assigned a table.' });
      }
    });

    return warnings;
  }

  // Simple rule-based suggestions (not AI): keeps a confirmed guest and their
  // plus-one together, groups by relationshipGroup where possible, and fills
  // tables in order of remaining space. Returns proposed assignments without
  // applying them — see applySeatingSuggestions().
  function suggestSeating(data) {
    const confirmed = (data.guests || []).filter(function (g) { return g.rsvp === 'Yes' && !g.tableId; });
    const tableSpace = (data.tables || []).map(function (t) {
      return { table: t, remaining: t.seats - tableOccupancy(data, t.id).seatsUsed };
    }).filter(function (x) { return x.remaining > 0; });

    const units = [];
    const handled = {};
    confirmed.forEach(function (g) {
      if (g.linkedToGuestId || handled[g.id]) return;
      const unit = [g];
      handled[g.id] = true;
      if (g.plusOneGuestId) {
        const po = confirmed.find(function (x) { return x.id === g.plusOneGuestId; });
        if (po) { unit.push(po); handled[po.id] = true; }
      }
      units.push(unit);
    });
    units.sort(function (a, b) { return (a[0].relationshipGroup || '').localeCompare(b[0].relationshipGroup || ''); });

    const assignments = [];
    units.forEach(function (unit) {
      let target = tableSpace.find(function (t) { return t.remaining >= unit.length; });
      if (!target) target = tableSpace.slice().sort(function (a, b) { return b.remaining - a.remaining; })[0];
      if (!target) return;
      unit.forEach(function (g) {
        assignments.push({ guestId: g.id, guestName: g.displayName, tableId: target.table.id, tableName: target.table.name });
        target.remaining--;
      });
    });
    return assignments;
  }

  function applySeatingSuggestions(assignments) {
    const data = loadRaw();
    if (!data) return null;
    (assignments || []).forEach(function (a) {
      const g = data.guests.find(function (x) { return x.id === a.guestId; });
      if (g) g.tableId = a.tableId;
    });
    saveRaw(data);
    remoteSync('syncGuestsBulkReplace', data.guests);
    return data;
  }

  function findGuestSeat(data, query) {
    const q = (query || '').trim().toLowerCase();
    if (!q) return [];
    return (data.guests || []).filter(function (g) { return g.displayName.toLowerCase().indexOf(q) !== -1; })
      .map(function (g) { return { guest: g, table: (data.tables || []).find(function (t) { return t.id === g.tableId; }) || null }; });
  }

  function catererSummary(data) {
    return { confirmedCount: (data.guests || []).filter(function (g) { return g.rsvp === 'Yes'; }).length, dietary: dietaryBreakdown(data, true) };
  }

  function csvEscape(v) {
    v = String(v === undefined || v === null ? '' : v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  function exportGuestListCSV(data) {
    const rows = [['First name', 'Last name', 'Email', 'Phone', 'RSVP', 'Plus one', 'Dietary', 'Table', 'Notes']];
    filterGuests(data, {}).forEach(function (g) {
      const table = (data.tables || []).find(function (t) { return t.id === g.tableId; });
      rows.push([g.firstName, g.lastName, g.email, g.phone, g.rsvp, g.plusOneConfirmed ? g.plusOneName : '', g.dietaryRequirement, table ? table.name : 'Unassigned', g.notes]);
    });
    return rows.map(function (r) { return r.map(csvEscape).join(','); }).join('\n');
  }

  function exportCateringCSV(data) {
    const rows = [['Guest', 'Table', 'Dietary requirement', 'Dietary notes']];
    (data.guests || []).filter(function (g) { return g.rsvp === 'Yes'; }).forEach(function (g) {
      const table = (data.tables || []).find(function (t) { return t.id === g.tableId; });
      rows.push([g.displayName, table ? table.name : 'Unassigned', g.dietaryRequirement || 'None', g.dietaryNotes || '']);
    });
    return rows.map(function (r) { return r.map(csvEscape).join(','); }).join('\n');
  }

  function parseCsvLine(line) {
    const out = [];
    let cur = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') { inQuotes = false; }
        else { cur += c; }
      } else if (c === '"') { inQuotes = true; }
      else if (c === ',') { out.push(cur); cur = ''; }
      else { cur += c; }
    }
    out.push(cur);
    return out;
  }

  function normalizeRsvpValue(v) {
    v = (v || '').trim().toLowerCase();
    if (v === 'yes' || v === 'confirmed' || v === 'y') return 'Yes';
    if (v === 'no' || v === 'declined' || v === 'n') return 'No';
    return 'Awaiting';
  }

  // Expects a header row with at least a first-name column; other recognized
  // headers: last name, email, phone, rsvp, dietary. Unrecognized columns are
  // ignored rather than rejected, so a real export from another tool mostly
  // just works.
  function importGuestsFromCSV(csvText) {
    const data = loadRaw();
    if (!data) return null;
    const lines = (csvText || '').split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (lines.length < 2) return { data: data, added: 0 };
    const header = parseCsvLine(lines[0]).map(function (h) { return h.trim().toLowerCase(); });
    let added = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      const row = {};
      header.forEach(function (h, idx) { row[h] = (cols[idx] || '').trim(); });
      const firstName = row['first name'] || row['firstname'] || row['first'] || '';
      if (!firstName) continue;
      data.guests.push(newGuestRecord({
        firstName: firstName,
        lastName: row['last name'] || row['lastname'] || row['last'] || '',
        email: row.email || '',
        phone: row.phone || '',
        rsvp: normalizeRsvpValue(row.rsvp),
        dietaryRequirement: DIETARY_OPTIONS.indexOf(row.dietary || row['dietary requirement']) !== -1 ? (row.dietary || row['dietary requirement']) : 'None'
      }));
      added++;
    }
    saveRaw(data);
    if (added) remoteSync('syncGuestsBulkReplace', data.guests);
    return { data: data, added: added };
  }

  // ---------------- APPOINTMENTS ----------------

  function addAppointment(a) {
    const data = loadRaw();
    if (!data) return null;
    const record = {
      id: uid('a'),
      date: a.date || '',
      time: a.time || '',
      vendorName: a.vendorName || '',
      notes: a.notes || ''
    };
    data.appointments.push(record);
    saveRaw(data);
    remoteSync('syncAppointmentUpsert', record);
    return data;
  }

  function updateAppointment(id, patch) {
    const data = loadRaw();
    if (!data) return null;
    const a = data.appointments.find(function (x) { return x.id === id; });
    if (a) Object.assign(a, patch);
    saveRaw(data);
    if (a) remoteSync('syncAppointmentUpsert', a);
    return data;
  }

  function deleteAppointment(id) {
    const data = loadRaw();
    if (!data) return null;
    data.appointments = data.appointments.filter(function (a) { return a.id !== id; });
    saveRaw(data);
    remoteSync('syncAppointmentDelete', id);
    return data;
  }

  function upcomingAppointments(data, n) {
    const now = new Date().toISOString().slice(0, 10);
    const list = (data.appointments || []).filter(function (a) { return a.date >= now; })
      .sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
    return n ? list.slice(0, n) : list;
  }

  // ---------------- MESSAGES ----------------

  function getOrCreateThread(vendorId, vendorName) {
    const data = loadRaw();
    if (!data) return null;
    let thread = data.messages.threads.find(function (t) { return t.vendorId === vendorId; });
    if (!thread) {
      thread = { id: uid('th'), vendorId: vendorId, vendorName: vendorName, unread: false, messages: [] };
      data.messages.threads.push(thread);
      saveRaw(data);
    }
    return data;
  }

  function sendMessage(threadId, text, from) {
    const data = loadRaw();
    if (!data) return null;
    const thread = data.messages.threads.find(function (t) { return t.id === threadId; });
    if (!thread) return data;
    thread.messages.push({ id: uid('m'), from: from || 'couple', text: text, date: new Date().toISOString() });
    if (from === 'vendor') thread.unread = true;
    saveRaw(data);
    return data;
  }

  function markThreadRead(threadId) {
    const data = loadRaw();
    if (!data) return null;
    const thread = data.messages.threads.find(function (t) { return t.id === threadId; });
    if (thread) thread.unread = false;
    saveRaw(data);
    return data;
  }

  // ---------------- WEDDING DAY ----------------

  function addTimelineItem(item) {
    const data = loadRaw();
    if (!data) return null;
    data.weddingDay.timeline.push({ id: uid('wd'), time: item.time || '', title: item.title || '', notes: item.notes || '', completed: false });
    data.weddingDay.timeline.sort(function (a, b) { return (a.time || '').localeCompare(b.time || ''); });
    saveRaw(data);
    return data;
  }

  function updateTimelineItem(id, patch) {
    const data = loadRaw();
    if (!data) return null;
    const item = data.weddingDay.timeline.find(function (x) { return x.id === id; });
    if (item) Object.assign(item, patch);
    data.weddingDay.timeline.sort(function (a, b) { return (a.time || '').localeCompare(b.time || ''); });
    saveRaw(data);
    return data;
  }

  function deleteTimelineItem(id) {
    const data = loadRaw();
    if (!data) return null;
    data.weddingDay.timeline = data.weddingDay.timeline.filter(function (x) { return x.id !== id; });
    saveRaw(data);
    return data;
  }

  function toggleTimelineItem(id) {
    const data = loadRaw();
    if (!data) return null;
    const item = data.weddingDay.timeline.find(function (x) { return x.id === id; });
    if (item) item.completed = !item.completed;
    saveRaw(data);
    return data;
  }

  function addContact(c) {
    const data = loadRaw();
    if (!data) return null;
    data.weddingDay.contacts.push({ id: uid('c'), role: c.role || '', name: c.name || '', phone: c.phone || '', email: c.email || '' });
    saveRaw(data);
    return data;
  }

  function updateContact(id, patch) {
    const data = loadRaw();
    if (!data) return null;
    const c = data.weddingDay.contacts.find(function (x) { return x.id === id; });
    if (c) Object.assign(c, patch);
    saveRaw(data);
    return data;
  }

  function deleteContact(id) {
    const data = loadRaw();
    if (!data) return null;
    data.weddingDay.contacts = data.weddingDay.contacts.filter(function (x) { return x.id !== id; });
    saveRaw(data);
    return data;
  }

  // ---------------- ASK VOW ----------------
  // Template-driven responses built entirely from the couple's real data.
  // askVow() is the stable entry point: swap its body for a real Claude API
  // call later (e.g. POST the prompt + a data summary to your backend) without
  // changing any calling code — askVowTemplate() can stay as the local fallback.

  function askVow(promptText, data) {
    return askVowTemplate(promptText, data);
  }

  function askVowTemplate(promptText, data) {
    if (!data || !data.wedding) return "Start your plan first and I'll be able to answer questions about it.";
    const q = (promptText || '').toLowerCase();
    const w = data.wedding;
    const p = progress(data);
    const totals = budgetTotals(data);
    const days = VOWCO.daysUntil(w.date);
    const gTotals = guestTotals(data);
    const alerts = budgetAlerts(data);

    function moneyAsk() {
      const match = q.match(/\$?\s?([\d,]+(?:\.\d+)?)\s*k?/i);
      if (!match) return null;
      let n = parseFloat(match[1].replace(/,/g, ''));
      if (/k\b/i.test(match[0])) n *= 1000;
      return n;
    }

    if (/afford/.test(q)) {
      const amount = moneyAsk();
      if (amount === null) return "Tell me the amount you're considering (e.g. \"Can I afford a $5,000 photographer?\") and I'll check it against what's unallocated.";
      if (amount <= totals.unallocated) {
        return 'Yes — you have ' + VOWCO.formatCurrency(totals.unallocated) + ' unallocated, so ' + VOWCO.formatCurrency(amount) + ' fits comfortably within your ' + VOWCO.formatCurrency(totals.totalBudget) + ' budget.';
      }
      const short = amount - totals.unallocated;
      return 'It’s tight — you only have ' + VOWCO.formatCurrency(totals.unallocated) + ' unallocated right now, which is ' + VOWCO.formatCurrency(short) + ' short of ' + VOWCO.formatCurrency(amount) + '. You’d need to trim another category or increase your overall budget.';
    }

    if (/save/.test(q)) {
      const target = moneyAsk();
      const byCategory = budgetByCategory(data).filter(function (c) { return c.allocated > 0; })
        .sort(function (a, b) { return (b.allocated - b.committed) - (a.allocated - a.committed); });
      const room = byCategory.filter(function (c) { return c.allocated - c.committed > 0; }).slice(0, 3);
      if (!room.length) return "Every category is already fully committed, so the easiest place to save is by renegotiating an existing vendor quote or trimming your guest list.";
      const lines = room.map(function (c) { return c.category + ' has ' + VOWCO.formatCurrency(c.allocated - c.committed) + ' of headroom left'; });
      const prefix = target ? 'To find ' + VOWCO.formatCurrency(target) + ' in savings, start here: ' : "Here's where you have the most room to save: ";
      return prefix + lines.join('; ') + '.';
    }

    if (/forgot|forgotten|missing/.test(q)) {
      const overdue = data.tasks.filter(function (t) { return !t.completed && t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10); });
      if (!overdue.length) return "Nothing urgent is slipping — your checklist is up to date for where you are in planning.";
      const list = overdue.slice(0, 4).map(function (t) { return t.title; }).join(', ');
      return "A few things are overdue on your checklist: " + list + (overdue.length > 4 ? ', and ' + (overdue.length - 4) + ' more.' : '.');
    }

    if (/this month|month\b/.test(q)) {
      const m = monthlyTaskSummary(data);
      if (!m.total) return "You have no tasks due this month — a good moment to get ahead on next month's list.";
      const next = m.tasks.find(function (t) { return !t.completed; });
      return "You've completed " + m.done + " of " + m.total + " tasks due this month." + (next ? ' Next up: ' + next.title + '.' : ' Everything for this month is done.');
    }

    if (/book next|what.*next|next step/.test(q)) {
      const steps = nextSteps(data, 1);
      if (!steps.length) return "You're fully caught up — nothing urgent is next on your checklist.";
      return 'Your top priority right now is: ' + steps[0].title + (steps[0].dueDate ? ' (recommended by ' + formatDateShort(steps[0].dueDate) + ')' : '') + '.';
    }

    if (/on track|how.*doing|status/.test(q)) {
      const spentPct = totals.totalBudget ? Math.round((totals.totalPaid / totals.totalBudget) * 100) : 0;
      const warn = alerts.find(function (a) { return a.level === 'warning'; });
      let msg = "You're " + p.pct + '% through your checklist and ' + spentPct + '% through your budget, with ' + (days !== null ? days + ' days' : 'some time') + ' until the wedding.';
      if (warn) msg += ' One thing to watch: ' + warn.text;
      else msg += ' Nothing is flagged as over budget right now.';
      return msg;
    }

    // Generic fallback — a full-data summary.
    return "Here's where things stand: " + p.pct + '% of your checklist is done (' + p.done + '/' + p.total + '), ' +
      VOWCO.formatCurrency(totals.totalPaid) + ' of ' + VOWCO.formatCurrency(totals.totalBudget) + ' budget spent, ' +
      gTotals.byStatus['Yes'] + ' guests confirmed, and ' + (days !== null ? days + ' days' : 'no date yet') + ' to go. Ask me something more specific and I can dig in further.';
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    CATEGORIES: CATEGORIES,
    VENDOR_STATUSES: VENDOR_STATUSES,
    MAJOR_VENDOR_CATEGORIES: MAJOR_VENDOR_CATEGORIES,
    RSVP_STATUSES: RSVP_STATUSES,
    WEDDING_DETAIL_CATEGORIES: WEDDING_DETAIL_CATEGORIES,
    DRESS_CODES: DRESS_CODES,
    CEREMONY_TYPES: CEREMONY_TYPES,
    RECEPTION_TYPES: RECEPTION_TYPES,
    init: init,
    get: get,
    save: save,
    clearAll: clearAll,
    hydrateFrom: hydrateFrom,
    clearAccountData: clearAccountData,
    enableRemoteSync: enableRemoteSync,
    disableRemoteSync: disableRemoteSync,
    isRemoteSyncEnabled: isRemoteSyncEnabled,
    waitForSync: waitForSync,
    flushPendingSyncs: flushPendingSyncs,
    getSyncState: getSyncState,
    onSyncStateChange: onSyncStateChange,
    toggleTask: toggleTask,
    addTask: addTask,
    deleteTask: deleteTask,
    progress: progress,
    nextSteps: nextSteps,
    tasksThisMonth: tasksThisMonth,
    monthlyTaskSummary: monthlyTaskSummary,
    weddingTimelineMilestones: weddingTimelineMilestones,
    buildTasksFromDate: buildTasksFromDate,
    formatDateShort: formatDateShort,
    weddingDetailsCompletion: weddingDetailsCompletion,
    updateWeddingDetails: updateWeddingDetails,
    addBudgetItem: addBudgetItem,
    updateBudgetItem: updateBudgetItem,
    deleteBudgetItem: deleteBudgetItem,
    markBudgetItemPaid: markBudgetItemPaid,
    budgetTotals: budgetTotals,
    budgetByCategory: budgetByCategory,
    budgetAlerts: budgetAlerts,
    addVendor: addVendor,
    getVendor: getVendor,
    findVendorByDirectoryId: findVendorByDirectoryId,
    updateVendor: updateVendor,
    deleteVendor: deleteVendor,
    setVendorStatus: setVendorStatus,
    saveVendorNotes: saveVendorNotes,
    saveVendorEnquiry: saveVendorEnquiry,
    sendVendorEnquiry: sendVendorEnquiry,
    saveVendorQuote: saveVendorQuote,
    addVendorPaymentScheduleItem: addVendorPaymentScheduleItem,
    recordVendorPayment: recordVendorPayment,
    vendorsByCategory: vendorsByCategory,
    shortlistByCategory: shortlistByCategory,
    vendorTotals: vendorTotals,
    vendorProgressStats: vendorProgressStats,
    upcomingVendorPayments: upcomingVendorPayments,
    DIETARY_OPTIONS: DIETARY_OPTIONS,
    TABLE_SHAPES: TABLE_SHAPES,
    SIDES: SIDES,
    plusOneStatus: plusOneStatus,
    addGuest: addGuest,
    updateGuest: updateGuest,
    deleteGuest: deleteGuest,
    getGuest: getGuest,
    setGuestRsvp: setGuestRsvp,
    guestTotals: guestTotals,
    dietaryBreakdown: dietaryBreakdown,
    filterGuests: filterGuests,
    relationshipGroups: relationshipGroups,
    addTable: addTable,
    updateTable: updateTable,
    deleteTable: deleteTable,
    assignGuestToTable: assignGuestToTable,
    tableOccupancy: tableOccupancy,
    seatingStats: seatingStats,
    seatingWarnings: seatingWarnings,
    suggestSeating: suggestSeating,
    applySeatingSuggestions: applySeatingSuggestions,
    findGuestSeat: findGuestSeat,
    catererSummary: catererSummary,
    exportGuestListCSV: exportGuestListCSV,
    exportCateringCSV: exportCateringCSV,
    importGuestsFromCSV: importGuestsFromCSV,
    addAppointment: addAppointment,
    updateAppointment: updateAppointment,
    deleteAppointment: deleteAppointment,
    upcomingAppointments: upcomingAppointments,
    getOrCreateThread: getOrCreateThread,
    sendMessage: sendMessage,
    markThreadRead: markThreadRead,
    addTimelineItem: addTimelineItem,
    updateTimelineItem: updateTimelineItem,
    deleteTimelineItem: deleteTimelineItem,
    toggleTimelineItem: toggleTimelineItem,
    addContact: addContact,
    updateContact: updateContact,
    deleteContact: deleteContact,
    askVow: askVow
  };
})();
