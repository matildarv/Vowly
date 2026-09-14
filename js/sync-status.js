// Save status for Supabase-backed changes (window.VOWDATA's outbox).
//
// Shows a small fixed status line on any page that includes this script
// after wedding-data.js: "Saving…" while a change is on its way, "Saved"
// briefly once Supabase has confirmed it, and a clear message while a save
// has failed and is being retried. Signed-out/local-only pages never enter
// a sync state, so nothing is shown there.

(function () {
  // VOWDATA is a top-level `const` in wedding-data.js — a global binding,
  // but not a property of window.
  if (typeof VOWDATA === 'undefined' || typeof VOWDATA.onSyncStateChange !== 'function') return;

  const SAVED_VISIBLE_MS = 2500;
  const MESSAGES = {
    saving: 'Saving…',
    saved: 'Saved',
    network: "Couldn't save — we'll retry. Please check your connection.",
    rejected: "Couldn't save — we'll keep retrying. If this continues, refresh the page."
  };

  let el = null;
  let hideTimer = null;

  function ensureEl() {
    if (el) return el;
    el = document.createElement('div');
    el.className = 'sync-status';
    el.hidden = true;
    document.body.appendChild(el);
    return el;
  }

  function render(state) {
    clearTimeout(hideTimer);
    if (state.status === 'idle') {
      if (el) el.hidden = true;
      return;
    }
    if (!document.body) return;
    const node = ensureEl();
    const isError = state.status === 'error';
    node.classList.toggle('sync-status--error', isError);
    node.setAttribute('role', isError ? 'alert' : 'status');
    node.textContent = isError ? MESSAGES[state.errorKind === 'rejected' ? 'rejected' : 'network'] : MESSAGES[state.status];
    node.hidden = false;
    if (state.status === 'saved') hideTimer = setTimeout(function () { node.hidden = true; }, SAVED_VISIBLE_MS);
  }

  VOWDATA.onSyncStateChange(render);
  render(VOWDATA.getSyncState());
})();
