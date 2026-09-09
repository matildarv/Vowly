// Dashboard SPA logic for Vow & Co.
// Every view is a plain render function driven entirely by VOWDATA; nothing
// here holds its own parallel state beyond small in-memory "is this form open
// / which row am I editing" flags, which are reset whenever the underlying
// data changes.

(async function () {
  const params = new URLSearchParams(window.location.search);
  const nameParam = params.get('name');

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function showLoadingOverlay() {
    const el = document.createElement('div');
    el.id = 'authLoadingOverlay';
    el.style.cssText = 'position:fixed; inset:0; background:var(--white); z-index:500; display:flex; align-items:center; justify-content:center; font-family:Inter,sans-serif; color:var(--muted); font-size:0.95rem;';
    el.textContent = 'Loading your wedding…';
    document.body.appendChild(el);
    return el;
  }

  function showFatalError(message) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed; inset:0; background:var(--white); z-index:500; display:flex; align-items:center; justify-content:center; padding:24px;';
    el.innerHTML = '<div style="max-width:420px; text-align:center;"><p style="font-size:1rem; margin-bottom:16px;">' + esc(message) + '</p><button class="btn btn--black" onclick="window.location.reload()">Try again</button></div>';
    document.body.appendChild(el);
  }

  function showNoWeddingYetState(profileId) {
    const main = document.querySelector('.app-main');
    if (!main) return;
    main.innerHTML =
      '<div style="max-width:480px; margin:100px auto; text-align:center;">' +
        '<h2 style="margin-bottom:14px;">Your wedding plan is just getting started.</h2>' +
        '<p style="color:var(--muted); margin-bottom:24px;">You\'re signed in, but there\'s no wedding saved on your account yet.</p>' +
        '<button type="button" class="btn btn--black" id="startWeddingBtn">Start my wedding plan</button>' +
        '<p style="color:#a33; margin-top:16px; font-size:0.85rem; display:none;" id="startWeddingError"></p>' +
        '<p style="color:var(--muted); margin-top:16px; font-size:0.82rem;">You can fill in your date, guest count, budget and style afterward from Wedding details.</p>' +
      '</div>';
    const btn = document.getElementById('startWeddingBtn');
    const errEl = document.getElementById('startWeddingError');
    if (!btn) return;
    if (!profileId) {
      console.error('[Vow & Co.] Cannot start a wedding — no profile id was found for the signed-in user.');
      btn.disabled = true;
      if (errEl) {
        errEl.textContent = 'Something went wrong loading your account profile. Try refreshing the page (check the browser console for details).';
        errEl.style.display = 'block';
      }
      return;
    }
    btn.addEventListener('click', async function () {
      btn.disabled = true;
      btn.textContent = 'Creating your wedding…';
      if (errEl) errEl.style.display = 'none';
      try {
        await VOWREMOTE.createWedding(profileId, { name: '', partner: '', date: '', location: '', guests: 0, budget: 0, style: '' });
        window.location.reload();
      } catch (e) {
        console.error('[Vow & Co.] Failed to create your wedding:', e);
        btn.disabled = false;
        btn.textContent = 'Start my wedding plan';
        if (errEl) {
          errEl.textContent = (e && e.message) ? e.message : 'Something went wrong creating your wedding. Please try again.';
          errEl.style.display = 'block';
        }
      }
    });
  }

  // ---------------- AUTH + SUPABASE HYDRATION ----------------
  // localStorage stays the synchronous cache every render function below
  // reads/writes (see wedding-data.js) — nothing past this block changes.
  // If a couple is signed in, this fetches their real wedding from Supabase
  // and writes it into that same local cache before anything renders, so
  // Supabase is the source of truth without any render function becoming
  // async. If they're not signed in, this falls back to the original
  // localStorage-only/demo behaviour exactly as before.
  let data;
  const loadingOverlay = showLoadingOverlay();
  const sessionResult = await VOWAUTH.getSession();
  let authedWedding = null;
  let authedProfile = null;

  if (sessionResult.data) {
    try {
      const profileResult = await VOWAUTH.ensureProfile({});
      const profile = profileResult.data;
      authedProfile = profile;
      if (profile) {
        let wedding = await VOWREMOTE.getWeddingForProfile(profile.id);
        if (!wedding && nameParam) {
          // Landed here with wizard handoff params but no wedding row yet
          // (e.g. signup redirected before the wedding was created) —
          // create it now so nothing the couple entered gets lost.
          wedding = await VOWREMOTE.createWedding(profile.id, {
            name: nameParam,
            partner: params.get('partner') || '',
            date: params.get('date') || '',
            location: params.get('location') || '',
            guests: Number(params.get('guests')) || 0,
            budget: Number(params.get('budget')) || 0,
            style: params.get('style') || ''
          });
          history.replaceState(null, '', window.location.pathname + window.location.hash);
        }
        if (wedding) {
          const full = await VOWREMOTE.fetchFullWedding(wedding.id);
          VOWDATA.hydrateFrom(full);
          VOWDATA.enableRemoteSync(wedding.id);
          authedWedding = wedding;
        }
      }
    } catch (e) {
      console.error('[Vow & Co.] Failed to load your wedding from Supabase:', e);
      loadingOverlay.remove();
      showFatalError('Something went wrong loading your wedding. Please refresh the page to try again.');
      return;
    }
  }

  loadingOverlay.remove();
  data = VOWDATA.get();

  if (sessionResult.data && !authedWedding) {
    showNoWeddingYetState(authedProfile && authedProfile.id);
    setupMobileNav();
    window.DASH = {};
    return;
  }

  if (!data && !sessionResult.data && nameParam) {
    // Anonymous local-only draft — unchanged from the original build. A
    // banner further down invites them to create an account to save it for
    // real; see the demoNotice handling right below.
    data = VOWDATA.init({
      name: nameParam,
      partner: params.get('partner') || '',
      date: params.get('date') || '',
      location: params.get('location') || '',
      guests: Number(params.get('guests')) || 0,
      budget: Number(params.get('budget')) || 0,
      style: params.get('style') || ''
    });
  }

  if (!data) {
    // No saved plan and no handoff params — keep the static demo dashboard
    // as-is, but still let the mobile nav toggle work on the demo shell.
    setupMobileNav();
    window.DASH = {};
    return;
  }

  const isAuthed = !!sessionResult.data;
  const demoNotice = document.getElementById('demoNotice');
  if (isAuthed) {
    demoNotice.style.display = 'none';
  } else {
    // Anonymous local draft — data is real (the wizard's answers), but it
    // only lives in this browser until they create an account.
    demoNotice.innerHTML = 'This plan is only saved on this device right now. <a href="signup.html?' +
      new URLSearchParams({ name: w0Name(), partner: w0Partner(), date: data.wedding.date || '', location: data.wedding.location || '', guests: data.wedding.guests || '', budget: data.wedding.budget || '', style: data.wedding.style || '' }).toString() +
      '" class="link" style="text-decoration:underline;">Create a free account to save it permanently</a>.';
    demoNotice.style.display = 'block';
  }
  function w0Name() { return data.wedding.name || ''; }
  function w0Partner() { return data.wedding.partner || ''; }

  if (params.get('updated') === 'details') {
    const banner = document.getElementById('confirmBanner');
    if (banner) {
      banner.style.display = 'block';
      setTimeout(function () { banner.style.display = 'none'; }, 5000);
    }
    history.replaceState(null, '', window.location.pathname + window.location.hash);
  }

  const resetLink = document.getElementById('resetLink');
  resetLink.style.display = 'inline';
  if (isAuthed) {
    resetLink.textContent = 'Log out';
    resetLink.addEventListener('click', async function (e) {
      e.preventDefault();
      await VOWAUTH.signOut();
      VOWDATA.disableRemoteSync();
      window.location.href = 'index.html';
    });
  } else {
    resetLink.addEventListener('click', function (e) {
      e.preventDefault();
      if (confirm('Clear your saved plan and start over?')) {
        VOWDATA.clearAll();
        window.location.href = 'dashboard.html';
      }
    });
  }

  const w = data.wedding;
  const displayName = w.name.charAt(0).toUpperCase() + w.name.slice(1);
  const coupleLabel = w.partner ? displayName + ' &amp; ' + (w.partner.charAt(0).toUpperCase() + w.partner.slice(1)) : displayName;
  document.getElementById('sidebarWho').innerHTML = coupleLabel;
  document.getElementById('sidebarDate').textContent = VOWCO.formatDateLong(w.date) || w.location;
  document.getElementById('topbarGreeting').textContent = 'Welcome, ' + displayName;

  // ---------------- FORM / EDIT STATE ----------------
  let editingExpenseId = null;
  let editingVendorId = null;
  let editingGuestId = null;
  let editingAppointmentId = null;
  let editingTimelineItemId = null;
  let editingContactId = null;
  let activeThreadId = null;
  let quoteDraft = null;
  let vendorFilterTab = 'All';
  const pendingVendorReplies = {};
  let guestSearchQuery = '';
  const guestActiveFilters = [];
  let editingTableId = null;

  function refreshData() { data = VOWDATA.get(); }
  function rerender() { refreshData(); router(); }

  // ---------------- ROUTER ----------------
  function currentRoute() {
    const hash = window.location.hash.replace('#', '') || 'dashboard';
    const parts = hash.split(':');
    return { view: parts[0] || 'dashboard', arg: parts[1] };
  }

  function showView(view) {
    document.querySelectorAll('.app-view').forEach(function (v) { v.classList.toggle('active', v.dataset.view === view); });
    document.querySelectorAll('#appSidebar .app-nav a').forEach(function (a) { a.classList.toggle('active', a.dataset.view === view); });
  }

  function updateTopbar() {
    const daysUntil = VOWCO.daysUntil(w.date);
    document.getElementById('topbarDate').textContent = (daysUntil !== null && daysUntil >= 0)
      ? daysUntil + ' days until the wedding in ' + w.location
      : 'Planning your wedding in ' + w.location;
  }

  function router() {
    const r = currentRoute();
    closeMobileNav();
    updateTopbar();
    if (r.view === 'budget') { showView('budget'); renderBudgetView(); }
    else if (r.view === 'vendors') { showView('vendors'); renderVendorsView(); }
    else if (r.view === 'vendor') { showView('vendor-detail'); renderVendorDetail(r.arg); }
    else if (r.view === 'guests') { showView('guests'); renderGuestsView(); }
    else if (r.view === 'seating') { showView('seating'); renderSeatingView(); }
    else if (r.view === 'table') { showView('table-detail'); renderTableDetail(r.arg); }
    else if (r.view === 'timeline') { showView('timeline'); renderTimelineView(); }
    else if (r.view === 'checklist') { showView('checklist'); renderChecklistView(r.arg); }
    else if (r.view === 'appointments') { showView('appointments'); renderAppointmentsView(); }
    else if (r.view === 'weddingday') { showView('weddingday'); renderWeddingDayView(); }
    else if (r.view === 'messages') { showView('messages'); renderMessagesView(r.arg); }
    else { showView('dashboard'); renderDashboard(); }
  }

  window.addEventListener('hashchange', router);

  function setupMobileNav() {
    const sidebar = document.getElementById('appSidebar');
    const toggle = document.getElementById('mobileNavToggle');
    if (!sidebar || !toggle) return;
    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      sidebar.classList.toggle('open');
    });
    document.addEventListener('click', function (e) {
      if (sidebar.classList.contains('open') && !sidebar.contains(e.target)) sidebar.classList.remove('open');
    });
  }
  function closeMobileNav() {
    const sidebar = document.getElementById('appSidebar');
    if (sidebar) sidebar.classList.remove('open');
  }
  setupMobileNav();

  function categoryOptions(selected) {
    return VOWDATA.CATEGORIES.map(function (c) {
      return '<option value="' + esc(c) + '"' + (c === selected ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
  }

  // ================= DASHBOARD =================

  const vendorLabels = { Venue: 'Find venues', Photography: 'Find photographers', Flowers: 'Find florists', Entertainment: 'Find entertainment', Catering: 'Find caterers', Vendors: 'Find vendors', Ceremony: 'Find celebrants', Attire: 'Find attire shops' };

  function ctaFor(task) {
    if (vendorLabels[task.category]) return { href: 'vendors.html', label: vendorLabels[task.category] };
    if (task.category === 'Guests') return { href: '#guests', label: 'Manage guest list' };
    return { href: '#checklist', label: 'View checklist' };
  }
  function whyText(task) {
    if ((w.needHelpWith || []).indexOf(task.category) !== -1) {
      return 'You told us you need help with ' + task.category.toLowerCase() + ' — this is a good place to start.';
    }
    return task.dueDate ? ('Recommended by ' + VOWDATA.formatDateShort(task.dueDate) + '.') : 'Part of your overall planning timeline.';
  }
  function taskNoteHtml(t) {
    return t.autoNote ? ' <span style="color:var(--muted); font-size:0.72rem; font-style:italic;">(' + esc(t.autoNote) + ')</span>' : '';
  }

  // RSVP is stored as the short 'Awaiting'/'Yes'/'No' the edit form uses, but
  // read-only summaries read more naturally with a fuller label.
  const RSVP_LABELS = { Awaiting: 'Awaiting response', Yes: 'Confirmed', No: 'Declined' };
  function rsvpLabel(rsvp) { return RSVP_LABELS[rsvp] || rsvp; }
  function catProgressText(cat) {
    const tasks = data.tasks.filter(function (t) { return t.category === cat; });
    if (!tasks.length) return 'No tasks yet';
    const done = tasks.filter(function (t) { return t.completed; }).length;
    return done + ' of ' + tasks.length + ' tasks complete';
  }

  function renderDashboard() {
    const totals = VOWDATA.budgetTotals(data);
    document.getElementById('statBudgetLabel').textContent = 'Budget spent';
    document.getElementById('statBudgetNum').textContent = VOWCO.formatCurrency(totals.totalPaid);
    document.getElementById('statBudgetSub').textContent = 'of ' + VOWCO.formatCurrency(totals.totalBudget) + ' total';

    const gTotals = VOWDATA.guestTotals(data);
    document.getElementById('statGuestsNum').textContent = gTotals.byStatus['Yes'];
    document.getElementById('statGuestsSub').textContent = gTotals.total ? ('of ' + gTotals.total + ' on your list') : ('of ' + (w.guests || 0) + ' expected — add your guests');

    const vTotals = VOWDATA.vendorTotals(data);
    document.getElementById('statVendorsNum').textContent = vTotals.booked;
    document.getElementById('statVendorsSub').textContent = vTotals.pending + ' quotes pending';

    const byCategory = VOWDATA.budgetByCategory(data);
    document.getElementById('dashBudgetRows').innerHTML = byCategory.map(function (c) {
      const pct = c.allocated > 0 ? Math.min(100, Math.round((c.committed / c.allocated) * 100)) : 0;
      return '<div class="budget-row"><div class="top"><span class="cat">' + esc(c.category) + '</span><span class="amt">' + VOWCO.formatCurrency(c.committed) + ' / ' + VOWCO.formatCurrency(c.allocated) + '</span></div>' +
        '<div class="budget-bar-track"><div class="budget-bar-fill" style="width:' + pct + '%"></div></div></div>';
    }).join('');

    const appts = VOWDATA.upcomingAppointments(data, 4);
    document.getElementById('dashAppointments').innerHTML = appts.length ? appts.map(function (a) {
      return '<li><span>' + esc(a.vendorName || 'Appointment') + '</span><span class="who">' + formatApptDate(a.date, a.time) + '</span></li>';
    }).join('') : '<li><span style="color:var(--muted);">No appointments booked yet</span></li>';

    renderRecommendedVendors();
    renderUpcomingVendorPayments();

    document.getElementById('guestSnapshot').innerHTML = VOWDATA.RSVP_STATUSES.map(function (s) {
      return '<li><span>' + rsvpLabel(s) + '</span><span class="who">' + gTotals.byStatus[s] + '</span></li>';
    }).join('');

    const seatStats = VOWDATA.seatingStats(data);
    const caterSummary = VOWDATA.catererSummary(data);
    const dietaryCount = caterSummary.dietary.reduce(function (s, d) { return s + d.count; }, 0);
    document.getElementById('seatingCateringSummary').innerHTML =
      seatStats.confirmedCount
        ? seatStats.seatedCount + ' / ' + seatStats.confirmedCount + ' confirmed guests seated' + (seatStats.unassignedCount ? ' · ' + seatStats.unassignedCount + ' need seating' : '') + '<br>' +
          (dietaryCount ? dietaryCount + ' dietary requirement' + (dietaryCount === 1 ? '' : 's') + ' to confirm' : 'No dietary requirements logged yet')
        : 'Add confirmed guests to start your seating chart.';

    document.getElementById('checklistTitle').textContent = 'Your checklist';
    document.getElementById('addTaskRow').style.display = 'block';

    const steps = VOWDATA.nextSteps(data, 3);
    const stepsList = document.getElementById('nextStepsList');
    if (!steps.length) {
      stepsList.innerHTML = '<p style="color:var(--muted); font-size:0.9rem; padding-top:8px;">You have completed everything on your checklist so far. Nicely done.</p>';
    } else {
      stepsList.innerHTML = steps.map(function (t, i) {
        const cta = ctaFor(t);
        return '<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px; padding:16px 0; border-bottom:1px solid var(--line);">' +
          '<div><div style="font-family:\'Bodoni Moda\',serif; font-size:1rem; margin-bottom:4px;">0' + (i + 1) + ' — ' + esc(t.title) + '</div>' +
          '<div style="font-size:0.85rem; color:var(--muted);">' + whyText(t) + '</div></div>' +
          '<a href="' + cta.href + '" class="link" style="white-space:nowrap; text-decoration:underline;">' + cta.label + '</a></div>';
      }).join('');
    }

    const prioritiesNote = document.getElementById('prioritiesNote');
    if (w.priorities && w.priorities.trim()) {
      prioritiesNote.textContent = 'Keeping in mind what matters most to you: "' + w.priorities.trim() + '"';
      prioritiesNote.style.display = 'block';
    } else {
      prioritiesNote.style.display = 'none';
    }

    renderWeddingDetailsCard();

    const p = VOWDATA.progress(data);
    document.getElementById('progressPct').textContent = p.pct;
    document.getElementById('progressBarFill').style.width = p.pct + '%';
    document.getElementById('progressSub').textContent = p.done + ' of ' + p.total + ' important tasks complete';
    document.getElementById('progressMsg').textContent = p.pct >= 60 ? "You're ahead of schedule." : p.pct >= 25 ? "You're on track for your wedding." : "You're just getting started — here's what to prioritise.";
    document.getElementById('statTasksNum').textContent = p.done + ' / ' + p.total;
    document.getElementById('statTasksSub').textContent = p.pct + '% of your checklist complete';

    document.getElementById('catCeremonyProgress').textContent = catProgressText('Ceremony');
    document.getElementById('catReceptionProgress').textContent = catProgressText('Reception');
    document.getElementById('catCateringProgress').textContent = catProgressText('Catering');
    document.getElementById('catFlowersProgress').textContent = catProgressText('Flowers');

    const sorted = data.tasks.slice().sort(function (a, b) { return (a.dueDate || '9999').localeCompare(b.dueDate || '9999'); });
    document.getElementById('dashChecklist').innerHTML = sorted.map(function (t) {
      const dueLabel = t.dueDate ? ' <span style="color:var(--muted); font-size:0.78rem;">— ' + VOWDATA.formatDateShort(t.dueDate) + '</span>' : '';
      return '<li class="' + (t.completed ? 'done' : '') + '" style="cursor:pointer;" data-id="' + t.id + '"><span class="box"></span>' + esc(t.title) + dueLabel + taskNoteHtml(t) + '</li>';
    }).join('');
    document.querySelectorAll('#dashChecklist li').forEach(function (li) {
      li.addEventListener('click', function () { VOWDATA.toggleTask(li.dataset.id); rerender(); });
    });

    const monthly = VOWDATA.monthlyTaskSummary(data);
    document.getElementById('monthSummary').textContent = "You've completed " + monthly.done + ' of ' + monthly.total + ' tasks due this month.';
    document.getElementById('monthTaskList').innerHTML = monthly.tasks.length ? monthly.tasks.map(function (t) {
      return '<li class="' + (t.completed ? 'done' : '') + '" style="cursor:pointer;" data-id="' + t.id + '"><span class="box"></span>' + esc(t.title) + ' <span style="color:var(--muted); font-size:0.78rem;">— ' + VOWDATA.formatDateShort(t.dueDate) + '</span>' + taskNoteHtml(t) + '</li>';
    }).join('') : '<li style="color:var(--muted);">Nothing due this month.</li>';
    document.querySelectorAll('#monthTaskList li[data-id]').forEach(function (li) {
      li.addEventListener('click', function () { VOWDATA.toggleTask(li.dataset.id); rerender(); });
    });

    renderAskVowPrompts();
  }

  function renderRecommendedVendors() {
    const el = document.getElementById('dashRecommendedVendors');
    if (!el) return;
    if (typeof VOWVENDORS === 'undefined') { el.innerHTML = '<p class="empty-state">Vendor directory unavailable.</p>'; return; }
    const haveCategory = {};
    data.vendors.forEach(function (v) { haveCategory[v.category] = true; });
    const missing = VOWVENDORS.CATEGORIES.filter(function (c) { return !haveCategory[c] && VOWVENDORS.byCategory(c).length; });
    const priority = missing.sort(function (a, b) {
      const ai = VOWDATA.MAJOR_VENDOR_CATEGORIES.indexOf(a);
      const bi = VOWDATA.MAJOR_VENDOR_CATEGORIES.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    }).slice(0, 3);
    if (!priority.length) {
      el.innerHTML = '<p class="empty-state">You have a vendor saved in every directory category we currently list. Nicely done.</p>';
      return;
    }
    el.innerHTML = priority.map(function (cat) {
      const top = VOWVENDORS.recommendedForWedding(w, cat, 1)[0];
      if (!top) return '';
      return '<div style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:12px 0; border-bottom:1px solid var(--line);">' +
        '<div><div style="font-weight:600; font-size:0.9rem;">' + esc(top.name) + '</div>' +
        '<div style="font-size:0.78rem; color:var(--muted);">' + esc(cat) + (top.match && top.match.pct !== null ? ' · Good match for your wedding (' + top.match.pct + '%)' : '') + '</div></div>' +
        '<a href="vendors.html#vendor:' + esc(top.id) + '" class="link" style="text-decoration:underline; font-size:0.82rem; white-space:nowrap;">View</a></div>';
    }).join('');
  }

  function renderUpcomingVendorPayments() {
    const el = document.getElementById('dashUpcomingPayments');
    if (!el) return;
    const list = VOWDATA.upcomingVendorPayments(data, 5);
    el.innerHTML = list.length ? list.map(function (p) {
      return '<li><span>' + esc(p.vendorName) + ' — ' + esc(p.label) + '</span><span class="who">' + VOWCO.formatCurrency(p.amount) + ' · ' + (VOWDATA.formatDateShort(p.date) || p.date) + '</span></li>';
    }).join('') : '<li><span style="color:var(--muted);">No upcoming vendor payments scheduled</span></li>';
  }

  function formatApptDate(dateStr, time) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    const label = d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
    return time ? label + ', ' + time : label;
  }

  function renderWeddingDetailsCard() {
    const el = document.getElementById('weddingDetailsCard');
    if (!el) return;
    const completion = VOWDATA.weddingDetailsCompletion(data);
    if (completion.answered === 0) {
      el.innerHTML =
        '<h3>Tell us more about your day</h3>' +
        '<p style="color:var(--muted); font-size:0.9rem; margin:8px 0 16px;">A few more details help us tailor your checklist and next steps — dress code, ceremony style, what you\'ve already booked, and what you still need help with.</p>' +
        '<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">' +
          '<span style="font-size:0.82rem; color:var(--muted);">' + completion.answered + ' of ' + completion.total + ' answered</span>' +
          '<a href="wedding-details.html" class="btn btn--black">Add your details</a>' +
        '</div>';
    } else {
      const bits = [w.dressCode, w.ceremonyType, w.receptionType].filter(Boolean);
      const summary = bits.length ? bits.join(' · ') : 'A few details saved so far.';
      el.innerHTML =
        '<h3>Update your wedding details</h3>' +
        '<p style="color:var(--muted); font-size:0.9rem; margin:8px 0 16px;">' + esc(summary) + '</p>' +
        '<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">' +
          '<span style="font-size:0.82rem; color:var(--muted);">' + completion.answered + ' of ' + completion.total + ' answered</span>' +
          '<a href="wedding-details.html" class="btn btn--ghost">Edit details</a>' +
        '</div>';
    }
  }

  window.addNewTask = function () {
    const input = document.getElementById('newTaskInput');
    const title = input.value.trim();
    if (!title) { input.reportValidity(); return; }
    VOWDATA.addTask(title, 'Other', '', 'medium');
    input.value = '';
    rerender();
  };

  // ================= ASK VOW =================

  const ASKVOW_PROMPTS = ['Am I on track?', 'What should I book next?', 'Can I afford a $5,000 photographer?', 'How can I save $3,000?', 'What have I forgotten?', 'What should I be doing this month?'];

  function renderAskVowPrompts() {
    const el = document.getElementById('askVowPrompts');
    if (!el) return;
    el.innerHTML = ASKVOW_PROMPTS.map(function (p) {
      return '<button type="button" class="askvow-prompt" data-prompt="' + esc(p) + '">' + esc(p) + '</button>';
    }).join('');
    el.querySelectorAll('.askvow-prompt').forEach(function (btn) {
      btn.addEventListener('click', function () { askVowAsk(btn.dataset.prompt); });
    });
  }

  function askVowAsk(text) {
    refreshData();
    const thread = document.getElementById('askVowThread');
    if (!thread) return;
    thread.insertAdjacentHTML('beforeend', '<div class="askvow-msg from-user">' + esc(text) + '</div>');
    const reply = VOWDATA.askVow(text, data);
    thread.insertAdjacentHTML('beforeend', '<div class="askvow-msg from-vow">' + esc(reply) + '</div>');
    thread.scrollTop = thread.scrollHeight;
  }

  function askVowSend() {
    const input = document.getElementById('askVowInput');
    const text = input.value.trim();
    if (!text) return;
    askVowAsk(text);
    input.value = '';
  }

  // ================= BUDGET =================

  function renderBudgetView() {
    const totals = VOWDATA.budgetTotals(data);
    document.getElementById('budgetStatRow').innerHTML =
      '<div class="stat-card"><div class="label">Total budget</div><div class="num">' + VOWCO.formatCurrency(totals.totalBudget) + '</div></div>' +
      '<div class="stat-card"><div class="label">Committed</div><div class="num">' + VOWCO.formatCurrency(totals.totalCommitted) + '</div><div class="sub">' + (totals.totalBudget ? Math.round(totals.totalCommitted / totals.totalBudget * 100) : 0) + '% of budget</div></div>' +
      '<div class="stat-card"><div class="label">Paid so far</div><div class="num">' + VOWCO.formatCurrency(totals.totalPaid) + '</div><div class="sub">' + VOWCO.formatCurrency(totals.totalRemaining) + ' still owed</div></div>' +
      '<div class="stat-card"><div class="label">Unallocated</div><div class="num">' + VOWCO.formatCurrency(totals.unallocated) + '</div></div>';

    const alerts = VOWDATA.budgetAlerts(data);
    document.getElementById('budgetAlerts').innerHTML = alerts.length ? alerts.map(function (a) {
      const icon = a.level === 'warning' ? '⚠️ ' : a.level === 'success' ? '✓ ' : '';
      return '<div class="alert alert--' + a.level + '"><div class="txt">' + icon + esc(a.text) + '</div>' +
        (a.linkLabel ? '<a href="' + a.linkHref + '" class="link">' + a.linkLabel + '</a>' : '') + '</div>';
    }).join('') : '<div class="alert alert--info"><div class="txt">Add a wedding budget from Plan setup to see live alerts here.</div></div>';

    const byCategory = VOWDATA.budgetByCategory(data);
    document.getElementById('budgetCategoryRows').innerHTML = byCategory.map(function (c) {
      const pct = c.allocated > 0 ? Math.min(100, Math.round((c.committed / c.allocated) * 100)) : 0;
      return '<div class="budget-row"><div class="top"><span class="cat">' + esc(c.category) + '</span><span class="amt">' + VOWCO.formatCurrency(c.committed) + ' / ' + VOWCO.formatCurrency(c.allocated) + '</span></div>' +
        '<div class="budget-bar-track"><div class="budget-bar-fill" style="width:' + pct + '%"></div></div></div>';
    }).join('');

    renderExpenseTable();
    renderQuoteCompare();
  }

  function renderExpenseTable() {
    const items = data.budgetItems.slice().sort(function (a, b) { return (a.dueDate || '9999').localeCompare(b.dueDate || '9999'); });
    const table = document.getElementById('expenseTable');
    if (!items.length) {
      table.innerHTML = '<tbody><tr><td class="empty-state">No expenses yet. Add one to start tracking your real spend.</td></tr></tbody>';
      return;
    }
    table.innerHTML = '<thead><tr><th>Category</th><th>Vendor</th><th>Description</th><th>Total</th><th>Paid</th><th>Remaining</th><th>Due</th><th></th></tr></thead><tbody>' +
      items.map(function (i) {
        const remaining = (Number(i.amount) || 0) - (Number(i.paidAmount) || 0);
        return '<tr class="clickable" data-id="' + i.id + '">' +
          '<td>' + esc(i.category) + '</td>' +
          '<td>' + esc(i.vendorName || '—') + '</td>' +
          '<td class="cell-muted">' + esc(i.description || '—') + '</td>' +
          '<td>' + VOWCO.formatCurrency(i.amount) + '</td>' +
          '<td>' + VOWCO.formatCurrency(i.paidAmount) + '</td>' +
          '<td>' + VOWCO.formatCurrency(remaining) + '</td>' +
          '<td class="cell-muted">' + (i.dueDate ? VOWDATA.formatDateShort(i.dueDate) : '—') + '</td>' +
          '<td class="cell-actions">' +
            '<a href="#" class="row-action" data-action="paid" data-id="' + i.id + '">' + (remaining <= 0 ? 'Mark unpaid' : 'Mark paid') + '</a>' +
            '<a href="#" class="row-action" data-action="delete" data-id="' + i.id + '">Delete</a>' +
          '</td></tr>';
      }).join('') + '</tbody>';

    table.querySelectorAll('tr[data-id]').forEach(function (tr) {
      tr.addEventListener('click', function (e) {
        if (e.target.closest('.row-action')) return;
        openExpenseFormForEdit(tr.dataset.id);
      });
    });
    table.querySelectorAll('.row-action[data-action="delete"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        if (confirm('Delete this expense?')) { VOWDATA.deleteBudgetItem(a.dataset.id); rerender(); }
      });
    });
    table.querySelectorAll('.row-action[data-action="paid"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        const item = data.budgetItems.find(function (b) { return b.id === a.dataset.id; });
        const isPaid = item && (Number(item.amount) - Number(item.paidAmount)) <= 0;
        VOWDATA.markBudgetItemPaid(a.dataset.id, !isPaid);
        rerender();
      });
    });
  }

  function expenseFormFieldsHtml(item) {
    item = item || { category: VOWDATA.CATEGORIES[0], vendorName: '', description: '', amount: '', paidAmount: 0, dueDate: '' };
    return '<div class="form-field"><label>Category</label><select id="expCategory">' + categoryOptions(item.category) + '</select></div>' +
      '<div class="form-field"><label>Vendor</label><input type="text" id="expVendor" value="' + esc(item.vendorName) + '" placeholder="e.g. Willow Barn Co."></div>' +
      '<div class="form-field"><label>Description</label><input type="text" id="expDescription" value="' + esc(item.description) + '" placeholder="What is this for?"></div>' +
      '<div class="form-field"><label>Total cost</label><input type="number" min="0" id="expAmount" value="' + esc(item.amount) + '"></div>' +
      '<div class="form-field"><label>Amount paid</label><input type="number" min="0" id="expPaid" value="' + esc(item.paidAmount) + '"></div>' +
      '<div class="form-field"><label>Next payment due</label><input type="date" id="expDueDate" value="' + esc(item.dueDate) + '"></div>';
  }

  function toggleExpenseForm() {
    editingExpenseId = null;
    const panel = document.getElementById('expenseFormPanel');
    const opening = panel.style.display === 'none';
    document.getElementById('expenseFormFields').innerHTML = expenseFormFieldsHtml(null);
    panel.style.display = opening ? 'block' : 'none';
  }
  function openExpenseFormForEdit(id) {
    const item = data.budgetItems.find(function (b) { return b.id === id; });
    if (!item) return;
    editingExpenseId = id;
    document.getElementById('expenseFormFields').innerHTML = expenseFormFieldsHtml(item);
    document.getElementById('expenseFormPanel').style.display = 'block';
    document.getElementById('expenseFormPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function saveExpenseForm() {
    const payload = {
      category: document.getElementById('expCategory').value,
      vendorName: document.getElementById('expVendor').value.trim(),
      description: document.getElementById('expDescription').value.trim(),
      amount: Number(document.getElementById('expAmount').value) || 0,
      paidAmount: Number(document.getElementById('expPaid').value) || 0,
      dueDate: document.getElementById('expDueDate').value
    };
    if (editingExpenseId) VOWDATA.updateBudgetItem(editingExpenseId, payload);
    else VOWDATA.addBudgetItem(payload);
    editingExpenseId = null;
    document.getElementById('expenseFormPanel').style.display = 'none';
    rerender();
  }
  function cancelExpenseForm() {
    editingExpenseId = null;
    document.getElementById('expenseFormPanel').style.display = 'none';
  }

  function renderQuoteCompare() {
    const select = document.getElementById('compareCategorySelect');
    const cats = Object.keys(VOWDATA.shortlistByCategory(data)).sort();
    if (!cats.length) {
      select.innerHTML = '<option>No vendors saved yet</option>';
      document.getElementById('quoteCompareGrid').innerHTML = '<p style="color:var(--muted); font-size:0.88rem;">Add vendors from <a href="#vendors" class="link" style="text-decoration:underline;">My vendors</a> to compare their quotes here.</p>';
      return;
    }
    const current = cats.includes(select.dataset.selected) ? select.dataset.selected : cats[0];
    select.innerHTML = cats.map(function (c) { return '<option value="' + esc(c) + '"' + (c === current ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
    select.dataset.selected = current;
    select.onchange = function () { select.dataset.selected = select.value; renderQuoteCompareGrid(select.value); };
    renderQuoteCompareGrid(current);
  }
  function renderQuoteCompareGrid(category) {
    const vendors = VOWDATA.vendorsByCategory(data, category);
    document.getElementById('quoteCompareGrid').innerHTML = vendors.map(function (v) {
      const extra = [];
      if (v.quote && v.quote.packageName) extra.push('<div class="detail-row"><span class="k">Package</span><span class="v">' + esc(v.quote.packageName) + '</span></div>');
      if (v.quote && v.quote.deposit) extra.push('<div class="detail-row"><span class="k">Deposit</span><span class="v">' + VOWCO.formatCurrency(v.quote.deposit) + '</span></div>');
      if (v.quote && v.quote.expiryDate) extra.push('<div class="detail-row"><span class="k">Expires</span><span class="v">' + (VOWDATA.formatDateShort(v.quote.expiryDate) || v.quote.expiryDate) + '</span></div>');
      if (v.quote && v.quote.servicesIncluded && v.quote.servicesIncluded.length) extra.push('<div class="detail-row"><span class="k">Includes</span><span class="v">' + esc(v.quote.servicesIncluded.join(', ')) + '</span></div>');
      return '<div class="quote-card"><div class="qname">' + esc(v.name) + '</div>' +
        '<div class="qstatus"><span class="status-pill' + vendorStatusPillClass(v.status) + '">' + esc(v.status) + '</span></div>' +
        '<div class="qprice">' + (v.quote && v.quote.amount ? VOWCO.formatCurrency(v.quote.amount) : 'Pricing on request') + '</div>' +
        extra.join('') +
        '<a href="#vendor:' + v.id + '" class="link" style="text-decoration:underline; font-size:0.85rem;">View details</a></div>';
    }).join('');
  }

  // ================= VENDORS =================

  const QUOTE_STATUS_OPTIONS = ['Requested', 'Received', 'Comparing', 'Accepted', 'Declined', 'Expired'];
  const VENDOR_FILTER_TABS = ['All', 'Shortlisted', 'Enquiries', 'Quotes', 'Booked', 'Paid'];

  function vendorStatusPillClass(status) {
    if (status === 'Booked' || status === 'Paid') return ' is-done';
    if (status === 'Not proceeding') return ' is-cancelled';
    return ' is-active';
  }

  function vendorMatchesTab(v, tab) {
    if (tab === 'Shortlisted') return v.status === 'Shortlisted';
    if (tab === 'Enquiries') return v.status === 'Enquiry sent' || v.status === 'Response received';
    if (tab === 'Quotes') return v.status === 'Quote received' || v.status === 'Negotiating';
    if (tab === 'Booked') return v.status === 'Booked';
    if (tab === 'Paid') return v.status === 'Paid';
    return true;
  }

  function renderVendorsView() {
    const progress = VOWDATA.vendorProgressStats(data);
    document.getElementById('vendorProgressLine').textContent =
      progress.majorBooked + '/' + progress.majorTotal + ' major vendors booked (' + progress.pct + '%) · ' +
      progress.booked + ' total booked · ' + progress.quotesPending + ' awaiting a reply or quote';
    document.getElementById('vendorProgressBar').style.width = progress.pct + '%';

    document.getElementById('vendorFilterTabs').innerHTML = VENDOR_FILTER_TABS.map(function (t) {
      return '<button type="button" class="status-pill' + (t === vendorFilterTab ? ' is-active' : '') + '" data-tab="' + t + '" style="cursor:pointer; background:none; font-family:inherit;">' + t + '</button>';
    }).join('');
    document.querySelectorAll('#vendorFilterTabs [data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () { vendorFilterTab = btn.dataset.tab; renderVendorsView(); });
    });

    const wrap = document.getElementById('vendorGroupsWrap');
    if (!data.vendors.length) {
      wrap.innerHTML = '<div class="app-card"><p class="empty-state">No vendors saved yet. <a href="vendors.html" class="link" style="text-decoration:underline;">Browse the vendor directory</a> to shortlist real Sydney vendors, or add one manually above.</p></div>';
      return;
    }
    const groups = VOWDATA.shortlistByCategory(data);
    const cats = Object.keys(groups).sort();
    const html = cats.map(function (cat) {
      const rows = groups[cat].filter(function (v) { return vendorMatchesTab(v, vendorFilterTab); });
      if (!rows.length) return '';
      return '<div class="app-card" style="margin-bottom:18px;">' +
        '<h3>' + esc(cat) + ' <span style="color:var(--muted); font-weight:400; font-size:0.82rem;">(' + rows.length + ')</span>' +
        (rows.length > 1 ? ' <a href="#quotes" class="link" style="text-decoration:underline; font-size:0.8rem; margin-left:10px;">Compare quotes</a>' : '') +
        '</h3>' +
        '<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Vendor</th><th>Status</th><th>Quote</th><th></th></tr></thead><tbody>' +
        rows.map(function (v) {
          return '<tr class="clickable" data-id="' + v.id + '">' +
            '<td>' + esc(v.name) + (v.vendorId ? ' <span style="color:var(--muted); font-size:0.76rem;">· Listed on Vow &amp; Co.</span>' : '') + '</td>' +
            '<td><span class="status-pill' + vendorStatusPillClass(v.status) + '">' + esc(v.status) + '</span></td>' +
            '<td>' + (v.quote && v.quote.amount ? VOWCO.formatCurrency(v.quote.amount) : 'Pricing on request') + '</td>' +
            '<td class="cell-actions"><a href="#" class="row-action" data-action="edit" data-id="' + v.id + '">Edit</a><a href="#" class="row-action" data-action="delete" data-id="' + v.id + '">Remove</a></td>' +
          '</tr>';
        }).join('') + '</tbody></table></div></div>';
    }).join('');
    wrap.innerHTML = html || '<div class="app-card"><p class="empty-state">No vendors match this filter.</p></div>';

    wrap.querySelectorAll('tr[data-id]').forEach(function (tr) {
      tr.addEventListener('click', function (e) {
        if (e.target.closest('.row-action')) return;
        window.location.hash = 'vendor:' + tr.dataset.id;
      });
    });
    wrap.querySelectorAll('.row-action[data-action="edit"]').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); openVendorFormForEdit(a.dataset.id); });
    });
    wrap.querySelectorAll('.row-action[data-action="delete"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        if (confirm('Remove this vendor from your list?')) { VOWDATA.deleteVendor(a.dataset.id); rerender(); }
      });
    });
  }

  function vendorStatusOptions(selected) {
    return VOWDATA.VENDOR_STATUSES.map(function (s) { return '<option value="' + s + '"' + (s === selected ? ' selected' : '') + '>' + s + '</option>'; }).join('');
  }

  function vendorFormFieldsHtml(v) {
    v = v || { name: '', category: VOWDATA.CATEGORIES[0], location: '', price: '', status: 'Shortlisted', contactEmail: '', contactPhone: '' };
    return '<div class="form-field"><label>Vendor name</label><input type="text" id="venName" value="' + esc(v.name) + '"></div>' +
      '<div class="form-field"><label>Category</label><select id="venCategory">' + categoryOptions(v.category) + '</select></div>' +
      '<div class="form-field"><label>Location</label><input type="text" id="venLocation" value="' + esc(v.location) + '"></div>' +
      '<div class="form-field"><label>Price / quote</label><input type="number" min="0" id="venPrice" value="' + esc(v.price) + '"></div>' +
      '<div class="form-field"><label>Status</label><select id="venStatus">' + vendorStatusOptions(v.status) + '</select></div>' +
      '<div class="form-field"><label>Email</label><input type="email" id="venEmail" value="' + esc(v.contactEmail) + '"></div>' +
      '<div class="form-field"><label>Phone</label><input type="tel" id="venPhone" value="' + esc(v.contactPhone) + '"></div>';
  }

  function toggleVendorForm() {
    editingVendorId = null;
    const panel = document.getElementById('vendorFormPanel');
    const opening = panel.style.display === 'none';
    document.getElementById('vendorFormFields').innerHTML = vendorFormFieldsHtml(null);
    panel.style.display = opening ? 'block' : 'none';
  }
  function openVendorFormForEdit(id) {
    const v = VOWDATA.getVendor(data, id);
    if (!v) return;
    editingVendorId = id;
    document.getElementById('vendorFormFields').innerHTML = vendorFormFieldsHtml(v);
    document.getElementById('vendorFormPanel').style.display = 'block';
  }
  function saveVendorForm() {
    const payload = {
      name: document.getElementById('venName').value.trim(),
      category: document.getElementById('venCategory').value,
      location: document.getElementById('venLocation').value.trim(),
      price: Number(document.getElementById('venPrice').value) || 0,
      contactEmail: document.getElementById('venEmail').value.trim(),
      contactPhone: document.getElementById('venPhone').value.trim()
    };
    const status = document.getElementById('venStatus').value;
    if (editingVendorId) {
      VOWDATA.updateVendor(editingVendorId, payload);
      VOWDATA.setVendorStatus(editingVendorId, status);
    } else {
      VOWDATA.addVendor(Object.assign({ status: status }, payload));
    }
    editingVendorId = null;
    document.getElementById('vendorFormPanel').style.display = 'none';
    rerender();
  }
  function cancelVendorForm() {
    editingVendorId = null;
    document.getElementById('vendorFormPanel').style.display = 'none';
  }

  function buildEnquiryMessage(v) {
    const lines = [];
    lines.push('Hi ' + (v.name || 'there') + ',');
    lines.push('');
    let intro = "We're planning our wedding";
    if (w.date) intro += ' for ' + (VOWCO.formatDateLong(w.date) || w.date);
    if (w.location) intro += ' in ' + w.location;
    intro += ", and we'd love to find out more about your " + (v.category || 'wedding').toLowerCase() + (v.category ? ' services' : ' offering') + '.';
    lines.push(intro);
    const details = [];
    if (w.guests) details.push(w.guests + ' guests');
    if (w.style) details.push(w.style + ' style');
    const budgetCat = (typeof VOWVENDORS !== 'undefined' && VOWVENDORS.BUDGET_CATEGORY_MAP[v.category]) || null;
    if (budgetCat && w.budget) {
      const allocated = VOWCO.budgetBreakdown(w.budget).find(function (b) { return b.label === budgetCat; });
      if (allocated) details.push('a ' + budgetCat.toLowerCase() + ' budget of around ' + VOWCO.formatCurrency(allocated.amount));
    }
    if (details.length) lines.push("A bit about us: we're expecting " + details.join(', ') + '.');
    lines.push('');
    lines.push('Could you let us know your availability and pricing? We look forward to hearing from you.');
    return lines.join('\n');
  }

  function renderEnquiryCard(v) {
    const enquiry = v.enquiry || { message: '', status: 'Draft', preparedAt: '', sentAt: '' };
    const message = enquiry.message || buildEnquiryMessage(v);
    const sentNote = enquiry.status === 'Sent'
      ? '<p style="font-size:0.82rem; color:var(--muted); margin-bottom:10px;">Enquiry saved' + (enquiry.sentAt ? ' on ' + (VOWDATA.formatDateShort(enquiry.sentAt.slice(0, 10)) || enquiry.sentAt.slice(0, 10)) : '') + '. Vow &amp; Co. doesn\'t email vendors automatically yet — reach out via their website, phone, or Instagram above, and log their reply under Messages.</p>'
      : '<p style="font-size:0.82rem; color:var(--muted); margin-bottom:10px;">This is a draft — nothing is sent until you save it below. There\'s no automatic vendor email yet, so you\'ll still need to reach out yourself.</p>';
    document.getElementById('vendorEnquiryCard').innerHTML =
      '<h3>Enquiry</h3>' + sentNote +
      '<textarea id="enquiryMessageInput" style="width:100%; min-height:150px; padding:12px 14px; border:1px solid var(--line); font-family:\'Inter\',sans-serif; font-size:0.9rem;">' + esc(message) + '</textarea>' +
      '<div class="form-actions" style="margin-top:12px;">' +
        '<button type="button" class="btn btn--ghost" id="saveEnquiryDraftBtn">Save draft</button>' +
        '<button type="button" class="btn btn--black" id="sendEnquiryBtn">' + (enquiry.status === 'Sent' ? 'Save enquiry' : 'Save &amp; mark as sent') + '</button>' +
      '</div>';
    document.getElementById('saveEnquiryDraftBtn').addEventListener('click', function () {
      VOWDATA.saveVendorEnquiry(v.id, { message: document.getElementById('enquiryMessageInput').value });
      rerender();
    });
    document.getElementById('sendEnquiryBtn').addEventListener('click', function () {
      VOWDATA.saveVendorEnquiry(v.id, { message: document.getElementById('enquiryMessageInput').value });
      VOWDATA.sendVendorEnquiry(v.id);
      rerender();
    });
  }

  function renderVendorDetail(id) {
    const v = VOWDATA.getVendor(data, id);
    if (!v) {
      document.getElementById('vendorDetailHead').innerHTML = '<div><h2>Vendor not found</h2><p>It may have been deleted.</p></div>';
      document.getElementById('vendorEnquiryCard').innerHTML = '';
      document.getElementById('vendorDetailContact').innerHTML = '';
      document.getElementById('vendorDetailQuote').innerHTML = '';
      return;
    }
    const links = [];
    if (v.website) links.push('<a href="' + esc(v.website) + '" target="_blank" rel="noopener" class="link" style="text-decoration:underline;">Website</a>');
    if (v.instagram) links.push('<a href="https://instagram.com/' + esc(String(v.instagram).replace('@', '')) + '" target="_blank" rel="noopener" class="link" style="text-decoration:underline; margin-left:12px;">Instagram</a>');
    document.getElementById('vendorDetailHead').innerHTML =
      '<div><h2>' + esc(v.name) + '</h2><p>' + esc(v.category) + (v.location ? ' · ' + esc(v.location) : '') + ' · ' + (v.quote && v.quote.amount ? VOWCO.formatCurrency(v.quote.amount) : 'Pricing on request') + '</p>' +
      (links.length ? '<p style="margin-top:6px;">' + links.join('') + '</p>' : '') + '</div>' +
      '<select id="vendorStatusSelect" style="padding:11px 14px; border:1px solid var(--line); font-family:\'Inter\',sans-serif; font-size:0.9rem;">' + vendorStatusOptions(v.status) + '</select>';
    document.getElementById('vendorStatusSelect').addEventListener('change', function (e) {
      VOWDATA.setVendorStatus(v.id, e.target.value);
      rerender();
    });

    renderEnquiryCard(v);

    const contactHtml = [];
    if (v.contactPhone) contactHtml.push('<a class="btn btn--ghost" href="tel:' + esc(v.contactPhone) + '">Call ' + esc(v.contactPhone) + '</a>');
    if (v.contactEmail) contactHtml.push('<a class="btn btn--ghost" href="mailto:' + esc(v.contactEmail) + '">Email</a>');
    contactHtml.push('<button class="btn btn--black" onclick="DASH.messageVendor(\'' + v.id + '\',\'' + esc(v.name).replace(/'/g, "\\'") + '\')">Open messages</button>');
    if (v.status !== 'Booked' && v.status !== 'Paid' && v.status !== 'Not proceeding') {
      contactHtml.push('<button type="button" class="btn btn--ghost" id="bookVendorBtn">Mark as booked</button>');
    }
    document.getElementById('vendorDetailContact').innerHTML =
      (v.contactEmail || v.contactPhone ? '' : '<p style="color:var(--muted); font-size:0.88rem; margin-bottom:8px;">No contact details saved yet — add them from My vendors.</p>') +
      '<div class="contact-actions">' + contactHtml.join('') + '</div>' +
      (v.linkedBudgetItemId ? '<p style="font-size:0.8rem; color:var(--muted); margin-top:10px;">Added to your budget as a committed item — see Budget.</p>' : '');
    const bookBtn = document.getElementById('bookVendorBtn');
    if (bookBtn) bookBtn.addEventListener('click', function () { VOWDATA.setVendorStatus(v.id, 'Booked'); rerender(); });

    quoteDraft = {
      amount: v.quote ? v.quote.amount : v.price,
      packageName: v.quote ? v.quote.packageName : '',
      status: (v.quote && v.quote.status) || 'Received',
      expiryDate: v.quote ? v.quote.expiryDate : '',
      servicesIncluded: (v.quote && v.quote.servicesIncluded) ? v.quote.servicesIncluded.slice() : [],
      deposit: v.quote ? v.quote.deposit : 0,
      depositPaid: !!(v.quote && v.quote.depositPaid),
      paymentDates: (v.quote && v.quote.paymentDates ? v.quote.paymentDates.slice() : [])
    };
    renderQuoteSection(v.id);

    document.getElementById('vendorNotesInput').value = v.notes || '';
  }

  function quoteStatusOptionsHtml(selected) {
    return QUOTE_STATUS_OPTIONS.map(function (s) { return '<option value="' + s + '"' + (s === selected ? ' selected' : '') + '>' + s + '</option>'; }).join('');
  }

  function renderQuoteSection(vendorId) {
    const rows = quoteDraft.paymentDates.map(function (pd, idx) {
      return '<li style="flex-wrap:wrap; gap:8px;">' +
        '<input type="text" class="pd-label" data-idx="' + idx + '" value="' + esc(pd.label) + '" placeholder="Label" style="width:110px; padding:7px 8px; border:1px solid var(--line); font-size:0.82rem;">' +
        '<input type="date" class="pd-date" data-idx="' + idx + '" value="' + esc(pd.date) + '" style="padding:7px 8px; border:1px solid var(--line); font-size:0.82rem;">' +
        '<input type="number" min="0" class="pd-amount" data-idx="' + idx + '" value="' + esc(pd.amount) + '" style="width:90px; padding:7px 8px; border:1px solid var(--line); font-size:0.82rem;">' +
        '<span style="margin-left:auto; display:flex; align-items:center; gap:10px;"><label style="font-size:0.8rem; color:var(--muted); display:flex; align-items:center; gap:5px;"><input type="checkbox" data-idx="' + idx + '" class="pd-paid" ' + (pd.paid ? 'checked' : '') + '> Paid</label> <a href="#" class="row-action pd-remove" data-idx="' + idx + '">Remove</a></span></li>';
    }).join('');

    const paidSoFar = (quoteDraft.depositPaid ? Number(quoteDraft.deposit) || 0 : 0) +
      quoteDraft.paymentDates.reduce(function (s, pd) { return s + (pd.paid ? Number(pd.amount) || 0 : 0); }, 0);
    const remaining = (Number(quoteDraft.amount) || 0) - paidSoFar;

    document.getElementById('vendorDetailQuote').innerHTML =
      '<div class="form-grid" style="margin-bottom:14px;">' +
        '<div class="form-field"><label>Quote amount</label><input type="number" min="0" id="quoteAmount" value="' + esc(quoteDraft.amount) + '"></div>' +
        '<div class="form-field"><label>Package name</label><input type="text" id="quotePackage" value="' + esc(quoteDraft.packageName || '') + '" placeholder="e.g. Silver package"></div>' +
        '<div class="form-field"><label>Quote status</label><select id="quoteStatus">' + quoteStatusOptionsHtml(quoteDraft.status) + '</select></div>' +
        '<div class="form-field"><label>Quote expires</label><input type="date" id="quoteExpiry" value="' + esc(quoteDraft.expiryDate || '') + '"></div>' +
        '<div class="form-field"><label>Deposit</label><input type="number" min="0" id="quoteDeposit" value="' + esc(quoteDraft.deposit) + '"></div>' +
      '</div>' +
      '<div class="form-field" style="margin-bottom:14px;"><label>Services included (comma-separated)</label><input type="text" id="quoteServices" value="' + esc((quoteDraft.servicesIncluded || []).join(', ')) + '"></div>' +
      '<div class="detail-row"><span class="k">Remaining balance</span><span class="v">' + VOWCO.formatCurrency(remaining) + '</span></div>' +
      '<label style="display:flex; align-items:center; gap:8px; font-size:0.86rem; margin:14px 0;"><input type="checkbox" id="quoteDepositPaid" ' + (quoteDraft.depositPaid ? 'checked' : '') + '> Deposit paid</label>' +
      '<div style="font-size:0.78rem; color:var(--muted); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:8px;">Payment schedule</div>' +
      '<ul class="payment-list" id="paymentDateList">' + (rows || '<li style="color:var(--muted);">No payment dates added.</li>') + '</ul>' +
      '<div class="form-actions" style="margin-top:14px;">' +
        '<button type="button" class="btn btn--ghost" id="addPaymentDateBtn">Add payment date</button>' +
        '<button type="button" class="btn btn--black" id="saveQuoteBtn">Save quote</button>' +
      '</div>';

    document.getElementById('addPaymentDateBtn').addEventListener('click', function () {
      syncQuoteDraftFromDom();
      quoteDraft.paymentDates.push({ label: 'Payment ' + (quoteDraft.paymentDates.length + 1), date: '', amount: 0, paid: false });
      renderQuoteSection(vendorId);
    });
    document.querySelectorAll('.pd-remove').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        syncQuoteDraftFromDom();
        quoteDraft.paymentDates.splice(Number(a.dataset.idx), 1);
        renderQuoteSection(vendorId);
      });
    });
    document.getElementById('saveQuoteBtn').addEventListener('click', function () {
      syncQuoteDraftFromDom();
      VOWDATA.saveVendorQuote(vendorId, quoteDraft);
      rerender();
    });
  }
  function syncQuoteDraftFromDom() {
    quoteDraft.amount = Number(document.getElementById('quoteAmount').value) || 0;
    quoteDraft.packageName = document.getElementById('quotePackage').value.trim();
    quoteDraft.status = document.getElementById('quoteStatus').value;
    quoteDraft.expiryDate = document.getElementById('quoteExpiry').value;
    quoteDraft.servicesIncluded = document.getElementById('quoteServices').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    quoteDraft.deposit = Number(document.getElementById('quoteDeposit').value) || 0;
    quoteDraft.depositPaid = document.getElementById('quoteDepositPaid').checked;
    quoteDraft.paymentDates.forEach(function (pd, idx) {
      const label = document.querySelector('.pd-label[data-idx="' + idx + '"]');
      const date = document.querySelector('.pd-date[data-idx="' + idx + '"]');
      const amount = document.querySelector('.pd-amount[data-idx="' + idx + '"]');
      const paid = document.querySelector('.pd-paid[data-idx="' + idx + '"]');
      if (label) pd.label = label.value;
      if (date) pd.date = date.value;
      if (amount) pd.amount = Number(amount.value) || 0;
      if (paid) pd.paid = paid.checked;
    });
  }

  function saveVendorDetailNotes() {
    const id = currentRoute().arg;
    VOWDATA.saveVendorNotes(id, document.getElementById('vendorNotesInput').value);
    rerender();
  }

  function messageVendor(vendorId, vendorName) {
    VOWDATA.getOrCreateThread(vendorId, vendorName);
    refreshData();
    if (currentRoute().view === 'messages') renderMessagesView(vendorId);
    else window.location.hash = 'messages:' + vendorId;
  }

  // ================= GUESTS =================
  // The guest list is the single source of truth for RSVPs, plus-ones,
  // dietary needs, and table assignments — the seating chart (below) only
  // ever reads and writes through the same VOWDATA guest functions.

  const GUEST_FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'invited', label: 'Invited' },
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'awaiting', label: 'Awaiting RSVP' },
    { key: 'declined', label: 'Declined' },
    { key: 'plusones', label: 'Plus ones' },
    { key: 'dietary', label: 'Dietary requirements' },
    { key: 'unassigned', label: 'Unassigned seating' },
    { key: 'bride', label: 'Bride’s side' },
    { key: 'groom', label: 'Groom’s side' }
  ];

  function guestRsvpPillClass(rsvp) { return rsvp === 'Yes' ? ' is-done' : rsvp === 'No' ? ' is-cancelled' : ''; }
  function guestPlusOneText(g) {
    if (g.plusOneConfirmed && g.plusOneName) return g.plusOneName;
    if (g.plusOneAllowed) return 'Allowed';
    return '—';
  }
  function guestTableName(g) {
    const t = data.tables.find(function (x) { return x.id === g.tableId; });
    return t ? t.name : 'Unassigned';
  }
  function guestDietaryText(g) { return g.dietaryRequirement && g.dietaryRequirement !== 'None' ? g.dietaryRequirement : '—'; }

  function renderGuestsView() {
    const totals = VOWDATA.guestTotals(data);
    document.getElementById('guestSummaryLine').textContent =
      totals.byStatus['Yes'] + ' confirmed · ' + totals.byStatus['Awaiting'] + ' awaiting · ' + totals.byStatus['No'] + ' declined · ' + totals.invited + ' invited';

    const pct = totals.invited ? Math.round((totals.byStatus['Yes'] / totals.invited) * 100) : 0;
    document.getElementById('guestProgressLine').textContent = totals.byStatus['Yes'] + ' / ' + totals.invited + ' guests confirmed';
    document.getElementById('guestProgressBar').style.width = pct + '%';

    document.getElementById('guestStatRow').innerHTML =
      '<div class="guest-stat"><div class="num">' + totals.byStatus['Yes'] + '</div><div class="lbl">Confirmed</div></div>' +
      '<div class="guest-stat"><div class="num">' + totals.byStatus['Awaiting'] + '</div><div class="lbl">Awaiting</div></div>' +
      '<div class="guest-stat"><div class="num">' + totals.byStatus['No'] + '</div><div class="lbl">Declined</div></div>' +
      '<div class="guest-stat"><div class="num">' + totals.invited + '</div><div class="lbl">Invited</div></div>';

    const dietary = VOWDATA.dietaryBreakdown(data);
    document.getElementById('dietaryRows').innerHTML = dietary.length ? dietary.map(function (d) {
      return '<div class="dietary-chip">' + esc(d.label) + '<b>' + d.count + '</b></div>';
    }).join('') : '<p style="color:var(--muted); font-size:0.88rem;">No dietary requirements logged yet.</p>';

    renderGuestFilterRow();
    renderGuestTable();
  }

  function renderGuestFilterRow() {
    const el = document.getElementById('guestFilterRow');
    el.innerHTML = GUEST_FILTERS.map(function (f) {
      const active = f.key === 'all' ? guestActiveFilters.length === 0 : guestActiveFilters.indexOf(f.key) !== -1;
      return '<button type="button" class="' + (active ? 'active' : '') + '" data-key="' + f.key + '">' + f.label + '</button>';
    }).join('');
    el.querySelectorAll('button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const key = btn.dataset.key;
        if (key === 'all') guestActiveFilters.length = 0;
        else {
          const idx = guestActiveFilters.indexOf(key);
          if (idx === -1) guestActiveFilters.push(key); else guestActiveFilters.splice(idx, 1);
        }
        renderGuestFilterRow();
        renderGuestTable();
      });
    });
  }

  function renderGuestTable() {
    const list = VOWDATA.filterGuests(data, { query: guestSearchQuery, filters: guestActiveFilters });
    const table = document.getElementById('guestTable');
    const cardList = document.getElementById('guestCardList');

    if (!list.length) {
      const msg = data.guests.length ? 'No guests match — try adjusting search or filters.' : 'No guests yet. Add your first guest to start your list.';
      table.innerHTML = '<tbody><tr><td class="empty-state">' + msg + '</td></tr></tbody>';
      cardList.innerHTML = '<div class="empty-state">' + msg + '</div>';
      return;
    }

    table.innerHTML = '<thead><tr><th>Guest</th><th>RSVP</th><th>Plus one</th><th>Dietary</th><th>Table</th><th>Notes</th></tr></thead><tbody>' +
      list.map(function (g) {
        return '<tr class="clickable" data-id="' + g.id + '">' +
          '<td>' + esc(g.displayName) + '</td>' +
          '<td><span class="status-pill' + guestRsvpPillClass(g.rsvp) + '">' + rsvpLabel(g.rsvp) + '</span></td>' +
          '<td class="cell-muted">' + esc(guestPlusOneText(g)) + '</td>' +
          '<td class="cell-muted">' + esc(guestDietaryText(g)) + '</td>' +
          '<td class="cell-muted">' + esc(guestTableName(g)) + '</td>' +
          '<td class="cell-muted">' + esc(g.notes || '—') + '</td>' +
        '</tr>';
      }).join('') + '</tbody>';
    table.querySelectorAll('tr[data-id]').forEach(function (tr) {
      tr.addEventListener('click', function () { openGuestFormForEdit(tr.dataset.id); });
    });

    cardList.innerHTML = list.map(function (g) {
      return '<div class="guest-card" data-id="' + g.id + '">' +
        '<div class="gc-top"><div><div class="gc-name">' + esc(g.displayName) + '</div>' +
        (g.plusOneConfirmed && g.plusOneName ? '<div class="gc-plusone">↳ ' + esc(g.plusOneName) + '</div>' : '') + '</div>' +
        '<span class="status-pill' + guestRsvpPillClass(g.rsvp) + '">' + rsvpLabel(g.rsvp) + '</span></div>' +
        '<div class="gc-row"><span>Dietary</span><span>' + esc(guestDietaryText(g)) + '</span></div>' +
        '<div class="gc-row"><span>Table</span><span>' + esc(guestTableName(g)) + '</span></div>' +
      '</div>';
    }).join('');
    cardList.querySelectorAll('.guest-card').forEach(function (card) {
      card.addEventListener('click', function () { openGuestFormForEdit(card.dataset.id); });
    });
  }

  function bindGuestSearch() {
    const input = document.getElementById('guestSearchInput');
    input.addEventListener('input', function () { guestSearchQuery = input.value; renderGuestTable(); });
  }

  function sectionLabel(text) {
    return '<div style="font-size:0.72rem; letter-spacing:0.08em; text-transform:uppercase; color:var(--muted); font-weight:600; margin:20px 0 10px;">' + text + '</div>';
  }

  function guestTableSelectOptions(selected) {
    let html = '<option value=""' + (!selected ? ' selected' : '') + '>Unassigned</option>';
    html += data.tables.map(function (t) {
      const occ = VOWDATA.tableOccupancy(data, t.id);
      return '<option value="' + t.id + '"' + (t.id === selected ? ' selected' : '') + '>' + esc(t.name) + ' (' + occ.seatsUsed + '/' + occ.seatsTotal + ')</option>';
    }).join('');
    return html;
  }

  function guestFormFieldsHtml(g) {
    g = g || { firstName: '', lastName: '', email: '', phone: '', rsvp: 'Awaiting', plusOneAllowed: false, plusOneConfirmed: false, plusOneName: '', plusOneRelationship: '', dietaryRequirement: 'None', dietaryNotes: '', tableId: null, sideOfCouple: '', relationshipGroup: '', notes: '', isChild: false };
    const poStatus = VOWDATA.plusOneStatus(g);
    const poVisible = poStatus === 'confirmed';
    return sectionLabel('Guest details') +
      '<div class="form-grid cols-3">' +
        '<div class="form-field"><label>First name</label><input type="text" id="gstFirst" value="' + esc(g.firstName) + '"></div>' +
        '<div class="form-field"><label>Last name</label><input type="text" id="gstLast" value="' + esc(g.lastName) + '"></div>' +
        '<div class="form-field"><label>Email</label><input type="email" id="gstEmail" value="' + esc(g.email) + '"></div>' +
      '</div>' +
      '<div class="form-grid cols-3">' +
        '<div class="form-field"><label>Phone</label><input type="tel" id="gstPhone" value="' + esc(g.phone) + '"></div>' +
        '<div class="form-field"><label>RSVP</label><select id="gstRsvp">' + VOWDATA.RSVP_STATUSES.map(function (s) { return '<option value="' + s + '"' + (s === g.rsvp ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div>' +
        '<div class="form-field"><label>Table</label><select id="gstTable">' + guestTableSelectOptions(g.tableId) + '</select></div>' +
      '</div>' +
      sectionLabel('Plus one') +
      '<div class="form-grid cols-3">' +
        '<div class="form-field"><label>Plus one</label><select id="gstPlusOneStatus">' +
          '<option value="none"' + (poStatus === 'none' ? ' selected' : '') + '>No plus one</option>' +
          '<option value="allowed"' + (poStatus === 'allowed' ? ' selected' : '') + '>Plus one allowed</option>' +
          '<option value="confirmed"' + (poStatus === 'confirmed' ? ' selected' : '') + '>Plus one confirmed</option>' +
        '</select></div>' +
        '<div class="form-field" id="gstPlusOneNameField" style="' + (poVisible ? '' : 'display:none;') + '"><label>Plus-one name</label><input type="text" id="gstPlusOneName" value="' + esc(g.plusOneName) + '"></div>' +
        '<div class="form-field" id="gstPlusOneRelField" style="' + (poVisible ? '' : 'display:none;') + '"><label>Relationship</label><input type="text" id="gstPlusOneRelationship" value="' + esc(g.plusOneRelationship) + '" placeholder="e.g. Partner"></div>' +
      '</div>' +
      sectionLabel('Dietary requirements') +
      '<div class="form-grid cols-3">' +
        '<div class="form-field"><label>Requirement</label><select id="gstDietary">' + VOWDATA.DIETARY_OPTIONS.map(function (d) { return '<option value="' + d + '"' + (d === g.dietaryRequirement ? ' selected' : '') + '>' + d + '</option>'; }).join('') + '</select></div>' +
        '<div class="form-field span-2"><label>Notes</label><input type="text" id="gstDietaryNotes" value="' + esc(g.dietaryNotes) + '" placeholder="e.g. severe — carries an EpiPen"></div>' +
      '</div>' +
      sectionLabel('Additional information') +
      '<div class="form-grid cols-3">' +
        '<div class="form-field"><label>Side</label><select id="gstSide">' +
          '<option value=""' + (!g.sideOfCouple ? ' selected' : '') + '>Not set</option>' +
          VOWDATA.SIDES.map(function (s) { return '<option value="' + s + '"' + (s === g.sideOfCouple ? ' selected' : '') + '>' + s + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="form-field"><label>Relationship group</label><input type="text" id="gstGroup" value="' + esc(g.relationshipGroup) + '" placeholder="e.g. Bride\'s family"></div>' +
        '<div class="form-field"><label style="display:flex; align-items:center; gap:8px; margin-top:26px;"><input type="checkbox" id="gstChild" ' + (g.isChild ? 'checked' : '') + '> Child</label></div>' +
      '</div>' +
      '<div class="form-field"><label>Notes</label><input type="text" id="gstNotes" value="' + esc(g.notes) + '"></div>';
  }

  function bindGuestFormExtras() {
    document.getElementById('gstPlusOneStatus').addEventListener('change', function (e) {
      const visible = e.target.value === 'confirmed';
      document.getElementById('gstPlusOneNameField').style.display = visible ? '' : 'none';
      document.getElementById('gstPlusOneRelField').style.display = visible ? '' : 'none';
    });
    document.getElementById('deleteGuestLink').onclick = function (e) {
      e.preventDefault();
      if (editingGuestId && confirm('Remove this guest?')) {
        VOWDATA.deleteGuest(editingGuestId);
        editingGuestId = null;
        document.getElementById('guestFormPanel').style.display = 'none';
        rerender();
      }
    };
  }

  function toggleGuestForm() {
    editingGuestId = null;
    const panel = document.getElementById('guestFormPanel');
    const opening = panel.style.display === 'none';
    document.getElementById('guestFormFields').innerHTML = guestFormFieldsHtml(null);
    document.getElementById('deleteGuestLink').style.display = 'none';
    document.getElementById('guestFormError').style.display = 'none';
    bindGuestFormExtras();
    panel.style.display = opening ? 'block' : 'none';
  }
  function openGuestFormForEdit(id) {
    const g = data.guests.find(function (x) { return x.id === id; });
    if (!g) return;
    editingGuestId = id;
    document.getElementById('guestFormFields').innerHTML = guestFormFieldsHtml(g);
    document.getElementById('deleteGuestLink').style.display = 'inline';
    document.getElementById('guestFormError').style.display = 'none';
    bindGuestFormExtras();
    document.getElementById('guestFormPanel').style.display = 'block';
    document.getElementById('guestFormPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function saveGuestForm() {
    const errorEl = document.getElementById('guestFormError');
    errorEl.style.display = 'none';
    const firstName = document.getElementById('gstFirst').value.trim();
    const lastName = document.getElementById('gstLast').value.trim();
    if (!firstName && !lastName) {
      errorEl.textContent = 'Add at least a first or last name before saving.';
      errorEl.style.display = 'block';
      return;
    }
    const poStatusVal = document.getElementById('gstPlusOneStatus').value;
    const newRsvp = document.getElementById('gstRsvp').value;
    const newTableId = document.getElementById('gstTable').value || null;
    const payload = {
      firstName: firstName,
      lastName: lastName,
      displayName: (firstName + ' ' + lastName).trim(),
      email: document.getElementById('gstEmail').value.trim(),
      phone: document.getElementById('gstPhone').value.trim(),
      rsvp: newRsvp,
      plusOneAllowed: poStatusVal !== 'none',
      plusOneConfirmed: poStatusVal === 'confirmed',
      plusOneName: document.getElementById('gstPlusOneName').value.trim(),
      plusOneRelationship: document.getElementById('gstPlusOneRelationship').value.trim(),
      dietaryRequirement: document.getElementById('gstDietary').value,
      dietaryNotes: document.getElementById('gstDietaryNotes').value.trim(),
      sideOfCouple: document.getElementById('gstSide').value,
      relationshipGroup: document.getElementById('gstGroup').value.trim(),
      isChild: document.getElementById('gstChild').checked,
      notes: document.getElementById('gstNotes').value.trim()
    };

    if (editingGuestId) {
      const existing = data.guests.find(function (x) { return x.id === editingGuestId; });
      const oldRsvp = existing ? existing.rsvp : null;
      const oldTableId = existing ? existing.tableId : null;
      VOWDATA.updateGuest(editingGuestId, payload);
      refreshData();
      if (oldRsvp === 'Yes' && newRsvp === 'No' && oldTableId) {
        const tableName = (data.tables.find(function (t) { return t.id === oldTableId; }) || {}).name || 'their table';
        if (confirm(payload.displayName + ' has declined. They are currently assigned to ' + tableName + '. Remove them from that table?')) {
          VOWDATA.assignGuestToTable(editingGuestId, null);
          // their RSVP change just carried over to a linked plus-one too (see
          // setGuestRsvp) — if that plus-one was seated, free their seat as well
          const updated = data.guests.find(function (x) { return x.id === editingGuestId; });
          if (updated && updated.plusOneGuestId) VOWDATA.assignGuestToTable(updated.plusOneGuestId, null);
        }
      } else if (newTableId !== oldTableId) {
        moveGuestWithPartnerPrompt(editingGuestId, newTableId);
      }
    } else {
      const result = VOWDATA.addGuest(payload);
      if (newTableId && result && result.guest) VOWDATA.assignGuestToTable(result.guest.id, newTableId);
    }
    editingGuestId = null;
    document.getElementById('guestFormPanel').style.display = 'none';
    rerender();
  }
  function cancelGuestForm() {
    editingGuestId = null;
    document.getElementById('guestFormPanel').style.display = 'none';
  }

  // Moves a guest to a table and, if they have a linked plus-one (in either
  // direction) not already seated together, asks whether to move them too —
  // this is the one place that decision is made, shared by the guest form,
  // the seating chart's unassigned list, the table cards, and table detail.
  function moveGuestWithPartnerPrompt(guestId, tableId) {
    VOWDATA.assignGuestToTable(guestId, tableId);
    refreshData();
    const g = VOWDATA.getGuest(data, guestId);
    if (!g) return;
    const partnerId = g.plusOneGuestId || g.linkedToGuestId;
    if (!partnerId) return;
    const partner = VOWDATA.getGuest(data, partnerId);
    if (!partner || partner.tableId === tableId) return;
    const tableName = tableId ? ((data.tables.find(function (t) { return t.id === tableId; }) || {}).name || 'that table') : 'Unassigned';
    if (confirm(partner.displayName + ' is linked to ' + g.displayName + '. Move ' + partner.displayName + ' to ' + tableName + ' as well?')) {
      VOWDATA.assignGuestToTable(partner.id, tableId);
    }
  }

  function toggleImportGuests() {
    const panel = document.getElementById('importGuestsPanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    document.getElementById('importGuestsResult').style.display = 'none';
  }
  function cancelImportGuests() { document.getElementById('importGuestsPanel').style.display = 'none'; }
  function importGuests() {
    const fileInput = document.getElementById('importGuestsFile');
    const resultEl = document.getElementById('importGuestsResult');
    function finish(csvText) {
      const result = VOWDATA.importGuestsFromCSV(csvText);
      resultEl.style.display = 'block';
      resultEl.style.color = result && result.added ? 'var(--muted)' : '#a33';
      resultEl.textContent = result && result.added ? 'Added ' + result.added + ' guest' + (result.added === 1 ? '' : 's') + '.' : 'No guests found — check the file has a First name column.';
      if (result && result.added) { document.getElementById('importGuestsText').value = ''; if (fileInput) fileInput.value = ''; rerender(); }
    }
    if (fileInput.files && fileInput.files[0]) {
      const reader = new FileReader();
      reader.onload = function () { finish(reader.result); };
      reader.readAsText(fileInput.files[0]);
    } else {
      finish(document.getElementById('importGuestsText').value);
    }
  }
  function exportGuestList() { downloadCsv('guest-list.csv', VOWDATA.exportGuestListCSV(data)); }
  function exportCateringList() { downloadCsv('catering-guest-list.csv', VOWDATA.exportCateringCSV(data)); }
  function downloadCsv(filename, csvText) {
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // ================= SEATING =================

  function renderSeatingView() {
    const stats = VOWDATA.seatingStats(data);
    document.getElementById('seatingStatRow').innerHTML =
      '<div class="guest-stat"><div class="num">' + stats.seatedCount + '</div><div class="lbl">Seated</div></div>' +
      '<div class="guest-stat"><div class="num">' + stats.unassignedCount + '</div><div class="lbl">Unassigned</div></div>' +
      '<div class="guest-stat"><div class="num">' + stats.tableCount + '</div><div class="lbl">Tables</div></div>' +
      '<div class="guest-stat"><div class="num">' + stats.seatsRemaining + '</div><div class="lbl">Seats remaining</div></div>';

    document.getElementById('seatingProgressLine').innerHTML = stats.confirmedCount
      ? (stats.completionPct === 100
        ? '<strong>Seating complete ✓</strong> — ' + stats.seatedCount + ' / ' + stats.confirmedCount + ' guests seated'
        : stats.seatedCount + ' / ' + stats.confirmedCount + ' confirmed guests seated — ' + stats.completionPct + '% complete')
      : 'No confirmed guests yet.';
    document.getElementById('seatingProgressBar').style.width = stats.completionPct + '%';

    const warnings = VOWDATA.seatingWarnings(data);
    document.getElementById('seatingWarnings').innerHTML = warnings.length ? warnings.map(function (w2) {
      return '<div class="alert alert--' + w2.level + '"><div class="txt">⚠️ ' + esc(w2.text) + '</div></div>';
    }).join('') : '';

    const unassigned = stats.unassignedGuests;
    document.getElementById('unassignedHeading').textContent = unassigned.length ? unassigned.length + ' guest' + (unassigned.length === 1 ? '' : 's') + ' still need' + (unassigned.length === 1 ? 's' : '') + ' a seat' : 'Unassigned guests';
    document.getElementById('unassignedGuestList').innerHTML = unassigned.length ? unassigned.map(function (g) {
      return '<div class="unassigned-guest-row"><span>' + esc(g.displayName) +
        (g.dietaryRequirement && g.dietaryRequirement !== 'None' ? '<span class="ug-diet">' + esc(g.dietaryRequirement) + '</span>' : '') + '</span>' +
        '<select data-guest="' + g.id + '" class="assign-select"><option value="">Choose a table…</option>' +
        data.tables.map(function (t) {
          const occ = VOWDATA.tableOccupancy(data, t.id);
          const full = occ.seatsUsed >= occ.seatsTotal;
          return '<option value="' + t.id + '"' + (full ? ' disabled' : '') + '>' + esc(t.name) + ' — ' + occ.seatsUsed + '/' + occ.seatsTotal + (full ? ' (full)' : '') + '</option>';
        }).join('') + '</select></div>';
    }).join('') : '<p style="color:var(--muted); font-size:0.88rem;">No unassigned confirmed guests right now.</p>';
    document.querySelectorAll('#unassignedGuestList .assign-select').forEach(function (sel) {
      sel.addEventListener('change', function () {
        if (!sel.value) return;
        moveGuestWithPartnerPrompt(sel.dataset.guest, sel.value);
        rerender();
      });
    });

    const catering = VOWDATA.catererSummary(data);
    document.getElementById('seatingDietaryRows').innerHTML = catering.dietary.length ? catering.dietary.map(function (d) {
      return '<div class="dietary-chip">' + esc(d.label) + '<b>' + d.count + '</b></div>';
    }).join('') : '<p style="color:var(--muted); font-size:0.88rem;">No dietary requirements among confirmed guests yet.</p>';

    document.getElementById('tableGrid').innerHTML = data.tables.length ? data.tables.map(function (t) { return tableCardHtml(t); }).join('') : '<p style="color:var(--muted); font-size:0.88rem;">No tables yet — add one to start seating guests.</p>';
    document.querySelectorAll('.table-card').forEach(function (card) {
      card.addEventListener('click', function () { window.location.hash = 'table:' + card.dataset.id; });
    });
  }

  function tableCardHtml(t) {
    const occ = VOWDATA.tableOccupancy(data, t.id);
    const over = occ.seatsUsed > occ.seatsTotal;
    const guestRows = occ.guests.map(function (g) {
      const diet = g.dietaryRequirement && g.dietaryRequirement !== 'None' ? '<span class="diet-badge" title="' + esc(g.dietaryNotes || '') + '">' + esc(g.dietaryRequirement) + '</span>' : '';
      return '<li' + (g.linkedToGuestId ? ' class="plus-one-row"' : '') + '><span>' + (g.linkedToGuestId ? '↳ ' : '') + esc(g.displayName) + diet + '</span></li>';
    }).join('');
    return '<div class="table-card' + (over ? ' over-capacity' : '') + '" data-id="' + t.id + '">' +
      '<div class="thead"><h4>' + esc(t.name) + '</h4><span class="cap' + (over ? ' over' : '') + '">' + occ.seatsUsed + ' / ' + occ.seatsTotal + ' seats</span></div>' +
      '<ul class="table-guest-list">' + (guestRows || '<li style="color:var(--muted);">No guests assigned</li>') + '</ul>' +
      (over ? '<div class="warn-line">⚠️ Over capacity by ' + (occ.seatsUsed - occ.seatsTotal) + '</div>' : occ.seatsTotal - occ.seatsUsed > 0 ? '<div class="cap" style="margin-top:8px;">' + (occ.seatsTotal - occ.seatsUsed) + ' seat' + (occ.seatsTotal - occ.seatsUsed === 1 ? '' : 's') + ' available</div>' : '') +
    '</div>';
  }

  // idPrefix keeps this form's field ids unique per container — the Add
  // Table panel (Seating view) and the Edit Table panel (Table Detail view)
  // are both always present in the DOM at once (hidden via CSS, not
  // removed), so sharing ids between them would make getElementById()
  // silently grab whichever one happens to come first in the markup.
  function tableFormFieldsHtml(t, idPrefix) {
    idPrefix = idPrefix || 'tbl';
    t = t || { name: '', seats: 8, shape: 'Round', notes: '' };
    return '<div class="form-field"><label>Table name</label><input type="text" id="' + idPrefix + 'Name" value="' + esc(t.name) + '" placeholder="e.g. Table 1"></div>' +
      '<div class="form-field"><label>Capacity (seats)</label><input type="number" min="1" id="' + idPrefix + 'Seats" value="' + esc(t.seats) + '"></div>' +
      '<div class="form-field"><label>Shape</label><select id="' + idPrefix + 'Shape">' + VOWDATA.TABLE_SHAPES.map(function (s) { return '<option value="' + s + '"' + (s === t.shape ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div>' +
      '<div class="form-field"><label>Notes</label><input type="text" id="' + idPrefix + 'Notes" value="' + esc(t.notes) + '"></div>';
  }

  function toggleTableForm() {
    const panel = document.getElementById('tableFormPanel');
    const opening = panel.style.display === 'none';
    document.getElementById('tableFormFields').innerHTML = tableFormFieldsHtml(null);
    panel.style.display = opening ? 'block' : 'none';
  }
  function saveTableForm() {
    const name = document.getElementById('tblName').value.trim();
    VOWDATA.addTable({ name: name, seats: document.getElementById('tblSeats').value, shape: document.getElementById('tblShape').value, notes: document.getElementById('tblNotes').value.trim() });
    document.getElementById('tableFormPanel').style.display = 'none';
    rerender();
  }
  function cancelTableForm() { document.getElementById('tableFormPanel').style.display = 'none'; }

  function toggleSuggestSeating() {
    const panel = document.getElementById('suggestSeatingPanel');
    const opening = panel.style.display === 'none';
    if (opening) {
      const suggestions = VOWDATA.suggestSeating(data);
      if (!suggestions.length) {
        document.getElementById('suggestSeatingBody').innerHTML = '<p style="color:var(--muted); font-size:0.9rem;">Everyone confirmed is already seated, or there’s no table space left to suggest into.</p>';
      } else {
        document.getElementById('suggestSeatingBody').innerHTML =
          '<p style="color:var(--muted); font-size:0.9rem; margin-bottom:14px;">We’ve put together a suggested seating arrangement for ' + suggestions.length + ' confirmed guest' + (suggestions.length === 1 ? '' : 's') + '. Review it below before applying.</p>' +
          suggestions.map(function (a) { return '<div class="suggest-seating-row"><span>' + esc(a.guestName) + '</span><span class="cell-muted">' + esc(a.tableName) + '</span></div>'; }).join('') +
          '<div class="form-actions" style="margin-top:16px;"><button class="btn btn--black" id="applySuggestedSeatingBtn">Apply suggested seating</button><button class="btn btn--ghost" id="dismissSuggestedSeatingBtn">Review later</button></div>';
        document.getElementById('applySuggestedSeatingBtn').addEventListener('click', function () {
          VOWDATA.applySeatingSuggestions(suggestions);
          document.getElementById('suggestSeatingPanel').style.display = 'none';
          rerender();
        });
        document.getElementById('dismissSuggestedSeatingBtn').addEventListener('click', function () {
          document.getElementById('suggestSeatingPanel').style.display = 'none';
        });
      }
    }
    panel.style.display = opening ? 'block' : 'none';
  }

  // ---- Table detail (routed view: #table:<id>) ----

  function renderTableDetail(id) {
    const t = data.tables.find(function (x) { return x.id === id; });
    if (!t) {
      document.getElementById('tableDetailHead').innerHTML = '<div><h2>Table not found</h2><p>It may have been deleted.</p></div>';
      document.getElementById('tableEditFields').innerHTML = '';
      document.getElementById('tableDetailGuestList').innerHTML = '';
      return;
    }
    editingTableId = id;
    const occ = VOWDATA.tableOccupancy(data, id);
    document.getElementById('tableDetailHead').innerHTML = '<div><h2>' + esc(t.name) + '</h2><p>' + occ.seatsUsed + ' / ' + occ.seatsTotal + ' seats' + (occ.seatsUsed > occ.seatsTotal ? ' — over capacity' : '') + '</p></div>';
    document.getElementById('tableEditFields').innerHTML = tableFormFieldsHtml(t, 'ted');

    document.getElementById('tableDetailGuestList').innerHTML = occ.guests.length ? occ.guests.map(function (g, i) {
      const diet = g.dietaryRequirement && g.dietaryRequirement !== 'None' ? '<span class="diet-badge">' + esc(g.dietaryRequirement) + '</span>' : '';
      return '<div class="unassigned-guest-row"><span>' + (i + 1) + '. ' + (g.linkedToGuestId ? '↳ ' : '') + esc(g.displayName) + diet + '</span>' +
        '<a href="#" class="row-action remove-from-table" data-guest="' + g.id + '">Remove</a></div>';
    }).join('') : '<p style="color:var(--muted); font-size:0.88rem;">No guests assigned yet.</p>';
    document.querySelectorAll('.remove-from-table').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); moveGuestWithPartnerPrompt(a.dataset.guest, null); rerender(); });
    });

    const assignSelect = document.getElementById('tableDetailAssignSelect');
    const assignable = data.guests.filter(function (g) { return g.rsvp === 'Yes' && g.tableId !== id; });
    assignSelect.innerHTML = '<option value="">Choose a confirmed guest…</option>' + assignable.map(function (g) {
      return '<option value="' + g.id + '">' + esc(g.displayName) + (g.tableId ? ' (currently ' + esc(guestTableName(g)) + ')' : '') + '</option>';
    }).join('');
    document.getElementById('tableDetailAssignBtn').onclick = function () {
      if (!assignSelect.value) return;
      moveGuestWithPartnerPrompt(assignSelect.value, id);
      rerender();
    };

    document.getElementById('saveTableDetailBtn').onclick = function () {
      const newSeats = Math.max(1, Number(document.getElementById('tedSeats').value) || t.seats);
      if (newSeats < occ.seatsUsed && !confirm('This table has ' + occ.seatsUsed + ' guests assigned. Reducing capacity to ' + newSeats + ' will leave it over capacity rather than removing anyone. Continue?')) return;
      VOWDATA.updateTable(id, { name: document.getElementById('tedName').value.trim() || t.name, seats: newSeats, shape: document.getElementById('tedShape').value, notes: document.getElementById('tedNotes').value.trim() });
      rerender();
    };
    document.getElementById('deleteTableLink').onclick = function (e) {
      e.preventDefault();
      if (confirm('Delete ' + t.name + '? Assigned guests will become unassigned.')) {
        VOWDATA.deleteTable(id);
        window.location.hash = 'seating';
      }
    };
  }

  // ================= TIMELINE =================

  function renderTimelineView() {
    const milestones = VOWDATA.weddingTimelineMilestones(data);
    document.getElementById('milestoneList').innerHTML = milestones.map(function (m) {
      const cls = 'milestone' + (m.isPast ? ' is-past' : '') + (m.isCurrent ? ' is-current' : '');
      const items = m.tasks.length ? '<ul>' + m.tasks.map(function (t) {
        return '<li class="' + (t.completed ? 'done' : '') + '" data-id="' + t.id + '" style="cursor:pointer;"><span class="box"></span>' + esc(t.title) + taskNoteHtml(t) + '</li>';
      }).join('') + '</ul>' : '<div class="milestone-empty">No tasks scheduled around this milestone.</div>';
      return '<div class="' + cls + '"><div class="milestone-head"><span class="dot"></span><h4>' + m.label + '</h4><span class="msub">' + m.done + ' of ' + m.total + ' complete</span></div>' + items + '</div>';
    }).join('');
    document.querySelectorAll('#milestoneList li[data-id]').forEach(function (li) {
      li.addEventListener('click', function () { VOWDATA.toggleTask(li.dataset.id); rerender(); });
    });
  }

  // ================= FULL CHECKLIST =================

  function renderChecklistView(categoryFilter) {
    document.getElementById('checklistViewTitle').textContent = categoryFilter ? 'Checklist — ' + categoryFilter : 'Checklist';
    const tasks = data.tasks.filter(function (t) { return !categoryFilter || t.category === categoryFilter; })
      .slice().sort(function (a, b) { return (a.dueDate || '9999').localeCompare(b.dueDate || '9999'); });
    const list = document.getElementById('fullChecklistList');
    list.innerHTML = tasks.length ? tasks.map(function (t) {
      const dueLabel = t.dueDate ? ' <span style="color:var(--muted); font-size:0.78rem;">— ' + VOWDATA.formatDateShort(t.dueDate) + '</span>' : '';
      return '<li class="' + (t.completed ? 'done' : '') + '" data-id="' + t.id + '"><span class="box" style="cursor:pointer;"></span><span style="flex:1; cursor:pointer;">' + esc(t.title) + dueLabel + taskNoteHtml(t) + '</span><a href="#" class="row-action" data-action="delete" data-id="' + t.id + '" style="margin-left:auto;">Remove</a></li>';
    }).join('') : '<li style="color:var(--muted);">No tasks in this category yet.</li>';
    list.querySelectorAll('li[data-id]').forEach(function (li) {
      li.querySelector('.box').addEventListener('click', function () { VOWDATA.toggleTask(li.dataset.id); rerender(); });
      const label = li.querySelector('span[style*="flex:1"]');
      if (label) label.addEventListener('click', function () { VOWDATA.toggleTask(li.dataset.id); rerender(); });
    });
    list.querySelectorAll('.row-action[data-action="delete"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        if (confirm('Remove this task?')) { VOWDATA.deleteTask(a.dataset.id); rerender(); }
      });
    });
  }

  function toggleFullChecklistForm() {
    const panel = document.getElementById('fullChecklistFormPanel');
    const opening = panel.style.display === 'none';
    document.getElementById('fullChecklistFormFields').innerHTML =
      '<div class="form-field"><label>Task</label><input type="text" id="taskTitle" required placeholder="e.g. Confirm cake flavour"></div>' +
      '<div class="form-field"><label>Category</label><select id="taskCategory">' + categoryOptions(VOWDATA.CATEGORIES[0]) + '</select></div>' +
      '<div class="form-field"><label>Due date</label><input type="date" id="taskDueDate"></div>' +
      '<div class="form-field"><label>Priority</label><select id="taskPriority"><option value="high">High</option><option value="medium" selected>Medium</option><option value="low">Low</option></select></div>';
    panel.style.display = opening ? 'block' : 'none';
  }
  function saveFullChecklistForm() {
    const titleInput = document.getElementById('taskTitle');
    const title = titleInput.value.trim();
    if (!title) { titleInput.reportValidity(); return; }
    VOWDATA.addTask(title, document.getElementById('taskCategory').value, document.getElementById('taskDueDate').value, document.getElementById('taskPriority').value);
    document.getElementById('fullChecklistFormPanel').style.display = 'none';
    rerender();
  }
  function cancelFullChecklistForm() { document.getElementById('fullChecklistFormPanel').style.display = 'none'; }

  // ================= APPOINTMENTS =================

  function renderAppointmentsView() {
    const appts = data.appointments.slice().sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
    const table = document.getElementById('appointmentTable');
    if (!appts.length) {
      table.innerHTML = '<tbody><tr><td class="empty-state">No appointments yet.</td></tr></tbody>';
    } else {
      table.innerHTML = '<thead><tr><th>Date</th><th>Time</th><th>Vendor</th><th>Notes</th><th></th></tr></thead><tbody>' +
        appts.map(function (a) {
          return '<tr class="clickable" data-id="' + a.id + '">' +
            '<td>' + (a.date ? VOWDATA.formatDateShort(a.date) : '—') + '</td>' +
            '<td class="cell-muted">' + esc(a.time || '—') + '</td>' +
            '<td>' + esc(a.vendorName || '—') + '</td>' +
            '<td class="cell-muted">' + esc(a.notes || '—') + '</td>' +
            '<td class="cell-actions"><a href="#" class="row-action" data-action="delete" data-id="' + a.id + '">Delete</a></td>' +
          '</tr>';
        }).join('') + '</tbody>';
    }
    table.querySelectorAll('tr[data-id]').forEach(function (tr) {
      tr.addEventListener('click', function (e) {
        if (e.target.closest('.row-action')) return;
        openAppointmentFormForEdit(tr.dataset.id);
      });
    });
    table.querySelectorAll('.row-action[data-action="delete"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        if (confirm('Delete this appointment?')) { VOWDATA.deleteAppointment(a.dataset.id); rerender(); }
      });
    });
  }

  function appointmentFormFieldsHtml(a) {
    a = a || { date: '', time: '', vendorName: '', notes: '' };
    return '<div class="form-field"><label>Date</label><input type="date" id="apptDate" value="' + esc(a.date) + '"></div>' +
      '<div class="form-field"><label>Time</label><input type="time" id="apptTime" value="' + esc(a.time) + '"></div>' +
      '<div class="form-field"><label>Vendor</label><input type="text" id="apptVendor" value="' + esc(a.vendorName) + '"></div>' +
      '<div class="form-field span-2"><label>Notes</label><input type="text" id="apptNotes" value="' + esc(a.notes) + '"></div>';
  }
  function toggleAppointmentForm() {
    editingAppointmentId = null;
    const panel = document.getElementById('appointmentFormPanel');
    const opening = panel.style.display === 'none';
    document.getElementById('appointmentFormFields').innerHTML = appointmentFormFieldsHtml(null);
    panel.style.display = opening ? 'block' : 'none';
  }
  function openAppointmentFormForEdit(id) {
    const a = data.appointments.find(function (x) { return x.id === id; });
    if (!a) return;
    editingAppointmentId = id;
    document.getElementById('appointmentFormFields').innerHTML = appointmentFormFieldsHtml(a);
    document.getElementById('appointmentFormPanel').style.display = 'block';
  }
  function saveAppointmentForm() {
    const payload = {
      date: document.getElementById('apptDate').value,
      time: document.getElementById('apptTime').value,
      vendorName: document.getElementById('apptVendor').value.trim(),
      notes: document.getElementById('apptNotes').value.trim()
    };
    if (editingAppointmentId) VOWDATA.updateAppointment(editingAppointmentId, payload);
    else VOWDATA.addAppointment(payload);
    editingAppointmentId = null;
    document.getElementById('appointmentFormPanel').style.display = 'none';
    rerender();
  }
  function cancelAppointmentForm() {
    editingAppointmentId = null;
    document.getElementById('appointmentFormPanel').style.display = 'none';
  }

  // ================= WEDDING DAY MODE =================

  function bindSeatFinder() {
    const input = document.getElementById('seatFinderInput');
    if (!input) return;
    input.addEventListener('input', function () {
      const resultsEl = document.getElementById('seatFinderResults');
      const q = input.value.trim();
      if (!q) { resultsEl.innerHTML = ''; return; }
      const matches = VOWDATA.findGuestSeat(data, q);
      if (!matches.length) { resultsEl.innerHTML = '<p style="color:var(--muted); font-size:0.9rem;">No matching guest found.</p>'; return; }
      resultsEl.innerHTML = matches.slice(0, 6).map(function (m) {
        const diet = m.guest.dietaryRequirement && m.guest.dietaryRequirement !== 'None' ? ' · ' + esc(m.guest.dietaryRequirement) : '';
        return '<div class="detail-row"><span class="k">' + esc(m.guest.displayName) + '</span><span class="v">' + (m.table ? esc(m.table.name) + (m.guest.tableSeat ? ' · Seat ' + m.guest.tableSeat : '') : 'Not yet seated') + diet + '</span></div>';
      }).join('');
    });
  }

  function renderWeddingDayView() {
    const days = VOWCO.daysUntil(w.date);
    const timeline = data.weddingDay.timeline;
    const done = timeline.filter(function (t) { return t.completed; }).length;
    let bannerMsg;
    if (days === null) bannerMsg = 'Set your wedding date to unlock your day-of countdown.';
    else if (days > 0) bannerMsg = days + ' days until your wedding';
    else if (days === 0) bannerMsg = "Today's the day!";
    else bannerMsg = "Congratulations — you're married!";
    document.getElementById('weddingDayBanner').innerHTML = '<span>' + bannerMsg + '</span><span class="num">' + done + ' / ' + timeline.length + ' run-of-show complete</span>';

    const list = document.getElementById('wdTimelineList');
    list.innerHTML = timeline.length ? timeline.map(function (t) {
      return '<div class="wd-item' + (t.completed ? ' done' : '') + '" data-id="' + t.id + '">' +
        '<div class="wd-time">' + esc(t.time || '—') + '</div>' +
        '<div class="box" data-action="toggle"></div>' +
        '<div class="wd-body"><div class="wd-title">' + esc(t.title) + '</div>' + (t.notes ? '<div class="wd-notes">' + esc(t.notes) + '</div>' : '') + '</div>' +
        '<a href="#" class="row-action" data-action="delete">Remove</a></div>';
    }).join('') : '<div class="empty-state">Add your first run-of-show item.</div>';
    list.querySelectorAll('.wd-item').forEach(function (item) {
      item.querySelector('[data-action="toggle"]').addEventListener('click', function () { VOWDATA.toggleTimelineItem(item.dataset.id); rerender(); });
      item.querySelector('[data-action="delete"]').addEventListener('click', function (e) {
        e.preventDefault();
        if (confirm('Remove this item?')) { VOWDATA.deleteTimelineItem(item.dataset.id); rerender(); }
      });
    });

    const contacts = data.weddingDay.contacts;
    document.getElementById('contactList').innerHTML = contacts.length ? contacts.map(function (c) {
      return '<div class="contact-card"><div><div class="role">' + esc(c.role || 'Contact') + '</div><div class="cname">' + esc(c.name) + '</div></div>' +
        '<div class="contact-actions-row">' +
          (c.phone ? '<a class="icon-btn" href="tel:' + esc(c.phone) + '" aria-label="Call"><svg viewBox="0 0 24 24"><path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.9 21 3 13.1 3 3c0-.6.4-1 1-1h3.2c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8Z"/></svg></a>' : '') +
          (c.email ? '<a class="icon-btn" href="mailto:' + esc(c.email) + '" aria-label="Email"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3 6l9 7 9-7"/></svg></a>' : '') +
          '<a href="#" class="row-action delete-contact" data-id="' + c.id + '">Remove</a>' +
        '</div></div>';
    }).join('') : '<div class="empty-state">Add the people you might need to call on the day.</div>';
    document.querySelectorAll('.delete-contact').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        if (confirm('Remove this contact?')) { VOWDATA.deleteContact(a.dataset.id); rerender(); }
      });
    });
  }

  function toggleTimelineItemForm() {
    editingTimelineItemId = null;
    const panel = document.getElementById('timelineItemFormPanel');
    const opening = panel.style.display === 'none';
    document.getElementById('timelineItemFormFields').innerHTML =
      '<div class="form-field"><label>Time</label><input type="time" id="wdTime"></div>' +
      '<div class="form-field"><label>Title</label><input type="text" id="wdTitle" required placeholder="e.g. First dance"></div>' +
      '<div class="form-field span-2"><label>Notes</label><input type="text" id="wdNotes"></div>';
    panel.style.display = opening ? 'block' : 'none';
  }
  function saveTimelineItemForm() {
    const titleInput = document.getElementById('wdTitle');
    const title = titleInput.value.trim();
    if (!title) { titleInput.reportValidity(); return; }
    VOWDATA.addTimelineItem({ time: document.getElementById('wdTime').value, title: title, notes: document.getElementById('wdNotes').value.trim() });
    document.getElementById('timelineItemFormPanel').style.display = 'none';
    rerender();
  }
  function cancelTimelineItemForm() { document.getElementById('timelineItemFormPanel').style.display = 'none'; }

  function toggleContactForm() {
    editingContactId = null;
    const panel = document.getElementById('contactFormPanel');
    const opening = panel.style.display === 'none';
    document.getElementById('contactFormFields').innerHTML =
      '<div class="form-field"><label>Role</label><input type="text" id="cnRole" placeholder="e.g. Venue coordinator"></div>' +
      '<div class="form-field"><label>Name</label><input type="text" id="cnName" required></div>' +
      '<div class="form-field"><label>Phone</label><input type="tel" id="cnPhone"></div>' +
      '<div class="form-field"><label>Email</label><input type="email" id="cnEmail"></div>';
    panel.style.display = opening ? 'block' : 'none';
  }
  function saveContactForm() {
    const nameInput = document.getElementById('cnName');
    const name = nameInput.value.trim();
    if (!name) { nameInput.reportValidity(); return; }
    VOWDATA.addContact({ role: document.getElementById('cnRole').value.trim(), name: name, phone: document.getElementById('cnPhone').value.trim(), email: document.getElementById('cnEmail').value.trim() });
    document.getElementById('contactFormPanel').style.display = 'none';
    rerender();
  }
  function cancelContactForm() { document.getElementById('contactFormPanel').style.display = 'none'; }

  // ================= MESSAGES =================

  const VENDOR_CANNED_REPLIES = [
    "Thanks so much for reaching out — I'll get back to you with details shortly!",
    "Great question — let me check availability and confirm with you soon.",
    "Absolutely, that works on our end. I'll send over the paperwork.",
    "Thanks for the update, noted on our side."
  ];

  function renderMessagesView(vendorIdArg) {
    if (vendorIdArg) {
      const thread = data.messages.threads.find(function (t) { return t.vendorId === vendorIdArg; });
      if (thread) activeThreadId = thread.id;
    }
    const threads = data.messages.threads;
    document.getElementById('threadList').innerHTML = threads.length ? threads.map(function (t) {
      const last = t.messages[t.messages.length - 1];
      return '<div class="thread-item' + (t.id === activeThreadId ? ' active' : '') + '" data-id="' + t.id + '">' +
        '<div><div class="tname">' + esc(t.vendorName) + '</div><div class="tprev">' + (last ? esc(last.text) : 'No messages yet') + '</div></div>' +
        (t.unread ? '<span class="unread-dot"></span>' : '') + '</div>';
    }).join('') : '<div class="empty-state">Message a vendor from their detail page to start a conversation.</div>';
    document.querySelectorAll('.thread-item').forEach(function (item) {
      item.addEventListener('click', function () {
        activeThreadId = item.dataset.id;
        VOWDATA.markThreadRead(activeThreadId);
        refreshData();
        renderMessagesView();
      });
    });

    const pane = document.getElementById('threadPane');
    const thread = threads.find(function (t) { return t.id === activeThreadId; });
    if (!thread) {
      pane.innerHTML = '<div class="empty-state">Select a conversation to see messages.</div>';
      return;
    }
    pane.innerHTML = '<div class="thread-pane-head">' + esc(thread.vendorName) + '</div>' +
      '<div class="thread-messages" id="threadMessages">' + thread.messages.map(function (m) {
        return '<div class="msg-bubble from-' + m.from + '">' + esc(m.text) + '<div class="meta">' + new Date(m.date).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '</div></div>';
      }).join('') + '</div>' +
      '<div class="thread-compose"><input type="text" id="threadComposeInput" placeholder="Write a message…"><button class="btn btn--black" id="threadSendBtn">Send</button></div>';
    const messagesEl = document.getElementById('threadMessages');
    messagesEl.scrollTop = messagesEl.scrollHeight;

    function send() {
      const input = document.getElementById('threadComposeInput');
      const text = input.value.trim();
      if (!text) return;
      VOWDATA.sendMessage(thread.id, text, 'couple');
      input.value = '';
      refreshData();
      renderMessagesView();
      const tid = thread.id;
      const timeoutId = setTimeout(function () {
        VOWDATA.sendMessage(tid, VENDOR_CANNED_REPLIES[Math.floor(Math.random() * VENDOR_CANNED_REPLIES.length)], 'vendor');
        if (activeThreadId === tid) VOWDATA.markThreadRead(tid);
        refreshData();
        if (currentRoute().view === 'messages') renderMessagesView();
      }, 1400);
      pendingVendorReplies[tid] = timeoutId;
    }
    document.getElementById('threadSendBtn').addEventListener('click', send);
    document.getElementById('threadComposeInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
  }

  // ================= INIT =================

  bindGuestSearch();
  bindSeatFinder();
  router();

  window.DASH = {
    askVowSend: askVowSend,
    toggleExpenseForm: toggleExpenseForm,
    saveExpenseForm: saveExpenseForm,
    cancelExpenseForm: cancelExpenseForm,
    toggleVendorForm: toggleVendorForm,
    saveVendorForm: saveVendorForm,
    cancelVendorForm: cancelVendorForm,
    saveVendorDetailNotes: saveVendorDetailNotes,
    messageVendor: messageVendor,
    toggleGuestForm: toggleGuestForm,
    saveGuestForm: saveGuestForm,
    cancelGuestForm: cancelGuestForm,
    toggleImportGuests: toggleImportGuests,
    cancelImportGuests: cancelImportGuests,
    importGuests: importGuests,
    exportGuestList: exportGuestList,
    exportCateringList: exportCateringList,
    toggleTableForm: toggleTableForm,
    saveTableForm: saveTableForm,
    cancelTableForm: cancelTableForm,
    toggleSuggestSeating: toggleSuggestSeating,
    toggleFullChecklistForm: toggleFullChecklistForm,
    saveFullChecklistForm: saveFullChecklistForm,
    cancelFullChecklistForm: cancelFullChecklistForm,
    toggleAppointmentForm: toggleAppointmentForm,
    saveAppointmentForm: saveAppointmentForm,
    cancelAppointmentForm: cancelAppointmentForm,
    toggleTimelineItemForm: toggleTimelineItemForm,
    saveTimelineItemForm: saveTimelineItemForm,
    cancelTimelineItemForm: cancelTimelineItemForm,
    toggleContactForm: toggleContactForm,
    saveContactForm: saveContactForm,
    cancelContactForm: cancelContactForm,
    addNewTask: window.addNewTask
  };
})();
