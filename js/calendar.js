// Vowly calendar — progressive enhancement for every <input type="date">.
//
// The native input stays in the DOM (hidden) and remains the single source
// of truth: its `.value` is still a plain 'YYYY-MM-DD' string, so every
// existing read (`el.value`) and write (`el.value = '2027-03-14'`) keeps
// working unchanged. Selecting a day fires the normal `input` + `change`
// events on it.
//
// Options (data attributes on the <input>):
//   data-calendar="inline"      render the calendar open in the page (default: popover)
//   data-calendar-min="today"   disable days before today
//
// Inputs added later (e.g. dashboard forms rebuilt via innerHTML) are
// enhanced automatically by a MutationObserver.
window.VOWCAL = (function () {
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const WEEKDAYS = [['M', 'Monday'], ['T', 'Tuesday'], ['W', 'Wednesday'], ['T', 'Thursday'], ['F', 'Friday'], ['S', 'Saturday'], ['S', 'Sunday']];
  const nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="1.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';
  let openInstance = null;

  function pad(n) { return String(n).padStart(2, '0'); }
  function toISO(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseISO(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  function today() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function sameDay(a, b) { return !!(a && b) && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function addMonths(d, n) {
    const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    return new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), lastDay));
  }
  function formatLong(d) { return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
  function formatShort(d) { return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); }

  function enhance(input) {
    if (!input || input.dataset.vowCal) return;
    input.dataset.vowCal = '1';

    const inline = input.dataset.calendar === 'inline';
    const minDate = input.dataset.calendarMin === 'today' ? today() : null;
    const optional = !inline && !input.required;

    const root = document.createElement('div');
    root.className = 'vow-cal ' + (inline ? 'vow-cal--inline' : 'vow-cal--popover');
    input.parentNode.insertBefore(root, input);
    root.appendChild(input);
    input.classList.add('vow-cal-native');
    input.tabIndex = -1;
    input.setAttribute('aria-hidden', 'true');

    let trigger = null;
    let triggerText = null;
    if (!inline) {
      trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'vow-cal-trigger';
      trigger.setAttribute('aria-haspopup', 'dialog');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.innerHTML = '<span class="vow-cal-trigger-text"></span>' + ICON;
      triggerText = trigger.firstChild;
      root.insertBefore(trigger, input);
      // Keep label clicks working for "<label>…</label><input>" pairs.
      const label = input.id ? document.querySelector('label[for="' + input.id + '"]') : null;
      if (label) label.addEventListener('click', function (e) { e.preventDefault(); trigger.focus(); });
    }

    const panel = document.createElement('div');
    panel.className = 'vow-cal-panel';
    if (!inline) {
      panel.hidden = true;
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'Choose a date');
    }
    root.appendChild(panel);

    let view = null;      // first day of the month on screen
    let focusDay = null;  // day holding the roving tabindex

    function selected() { return parseISO(nativeValue.get.call(input)); }
    function isDisabled(d) { return !!minDate && d < minDate; }

    function syncTrigger() {
      if (!triggerText) return;
      const d = selected();
      triggerText.textContent = d ? formatShort(d) : (input.getAttribute('placeholder') || 'Select a date');
      trigger.classList.toggle('is-empty', !d);
    }

    function yearOptions(year) {
      const now = new Date().getFullYear();
      const sel = selected();
      let from = minDate ? now : now - 2;
      let to = now + 12;
      [year, sel && sel.getFullYear()].forEach(function (y) {
        if (y) { from = Math.min(from, y); to = Math.max(to, y); }
      });
      let html = '';
      for (let y = from; y <= to; y++) html += '<option value="' + y + '"' + (y === year ? ' selected' : '') + '>' + y + '</option>';
      return html;
    }

    function render(focusAfter) {
      const sel = selected();
      const t = today();
      const year = view.getFullYear();
      const month = view.getMonth();
      const offset = (new Date(year, month, 1).getDay() + 6) % 7;
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      if (!focusDay || focusDay.getMonth() !== month || focusDay.getFullYear() !== year) {
        focusDay = sel && sel.getMonth() === month && sel.getFullYear() === year ? sel
          : t.getMonth() === month && t.getFullYear() === year ? t
          : new Date(year, month, 1);
      }
      const prevDisabled = !!minDate && new Date(year, month, 0) < minDate;

      let cells = '';
      for (let i = 0; i < offset; i++) cells += '<span class="vow-cal-blank" aria-hidden="true"></span>';
      for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, month, day);
        const cls = ['vow-cal-day'];
        if (sameDay(d, sel)) cls.push('is-selected');
        if (sameDay(d, t)) cls.push('is-today');
        cells += '<button type="button" class="' + cls.join(' ') + '" data-date="' + toISO(d) + '"' +
          ' tabindex="' + (sameDay(d, focusDay) ? '0' : '-1') + '"' +
          ' aria-label="' + formatLong(d) + (sameDay(d, t) ? ', today' : '') + '"' +
          ' aria-pressed="' + (sameDay(d, sel) ? 'true' : 'false') + '"' +
          (isDisabled(d) ? ' disabled' : '') + '>' + day + '</button>';
      }

      let foot = '';
      if (inline) {
        foot = '<div class="vow-cal-foot vow-cal-readout" aria-live="polite">' +
          '<span class="vow-cal-readout-label">Your date</span>' +
          '<span class="vow-cal-readout-value' + (sel ? '' : ' is-empty') + '">' + (sel ? formatLong(sel) : 'Choose a day above') + '</span></div>';
      } else {
        foot = '<div class="vow-cal-foot">' +
          (isDisabled(t) ? '<span></span>' : '<button type="button" class="vow-cal-link" data-action="today">Today</button>') +
          (optional ? '<button type="button" class="vow-cal-link" data-action="clear"' + (sel ? '' : ' disabled') + '>Clear</button>' : '') +
          '</div>';
      }

      panel.innerHTML =
        '<div class="vow-cal-head">' +
          '<button type="button" class="vow-cal-nav" data-nav="-1" aria-label="Previous month"' + (prevDisabled ? ' disabled' : '') + '>&larr;</button>' +
          '<div class="vow-cal-title"><span class="vow-cal-month" aria-live="polite">' + MONTHS[month] + '</span>' +
            '<span class="vow-cal-year-wrap"><select class="vow-cal-year" aria-label="Year">' + yearOptions(year) + '</select></span></div>' +
          '<button type="button" class="vow-cal-nav" data-nav="1" aria-label="Next month">&rarr;</button>' +
        '</div>' +
        '<div class="vow-cal-dow" aria-hidden="true">' + WEEKDAYS.map(function (w) { return '<span title="' + w[1] + '">' + w[0] + '</span>'; }).join('') + '</div>' +
        '<div class="vow-cal-grid">' + cells + '</div>' + foot;

      if (focusAfter) {
        const btn = panel.querySelector('.vow-cal-day[tabindex="0"]');
        if (btn) btn.focus();
      }
    }

    function showMonthOf(d, focusAfter) {
      view = new Date(d.getFullYear(), d.getMonth(), 1);
      focusDay = d;
      render(focusAfter);
    }

    function commit(value) {
      nativeValue.set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      syncTrigger();
      if (inline) {
        render(true);
      } else {
        close(true);
      }
    }

    function position() {
      root.classList.remove('vow-cal--up');
      panel.style.left = '0px';
      const rect = panel.getBoundingClientRect();
      const gutter = 12;
      let shift = 0;
      if (rect.right > window.innerWidth - gutter) shift = window.innerWidth - gutter - rect.right;
      if (rect.left + shift < gutter) shift = gutter - rect.left;
      panel.style.left = shift + 'px';
      const triggerRect = trigger.getBoundingClientRect();
      if (rect.bottom > window.innerHeight - gutter && triggerRect.top - rect.height - 8 > gutter) {
        root.classList.add('vow-cal--up');
      }
    }

    function open() {
      if (openInstance && openInstance !== api) openInstance.close(false);
      openInstance = api;
      showMonthOf(selected() || (minDate && today() < minDate ? minDate : today()), false);
      panel.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      root.classList.add('is-open');
      position();
      const btn = panel.querySelector('.vow-cal-day[tabindex="0"]');
      if (btn) btn.focus();
    }

    function close(returnFocus) {
      if (inline || panel.hidden) return;
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      root.classList.remove('is-open', 'vow-cal--up');
      if (openInstance === api) openInstance = null;
      if (returnFocus) trigger.focus();
    }

    panel.addEventListener('click', function (e) {
      const day = e.target.closest('.vow-cal-day');
      if (day && !day.disabled) { commit(day.dataset.date); return; }
      const nav = e.target.closest('.vow-cal-nav');
      if (nav && !nav.disabled) { showMonthOf(addMonths(view, Number(nav.dataset.nav)), false); return; }
      const action = e.target.closest('[data-action]');
      if (action && !action.disabled) {
        if (action.dataset.action === 'today') commit(toISO(today()));
        if (action.dataset.action === 'clear') commit('');
      }
    });

    panel.addEventListener('change', function (e) {
      if (!e.target.classList.contains('vow-cal-year')) return;
      e.stopPropagation();
      let d = new Date(Number(e.target.value), view.getMonth(), 1);
      if (minDate && d < new Date(minDate.getFullYear(), minDate.getMonth(), 1)) d = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
      showMonthOf(d, false);
      const yearSelect = panel.querySelector('.vow-cal-year');
      if (yearSelect) yearSelect.focus();
    });
    panel.addEventListener('input', function (e) { if (e.target.classList.contains('vow-cal-year')) e.stopPropagation(); });

    panel.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
      const day = e.target.closest('.vow-cal-day');
      if (!day) return;
      const current = parseISO(day.dataset.date);
      let next = null;
      switch (e.key) {
        case 'ArrowLeft': next = addDays(current, -1); break;
        case 'ArrowRight': next = addDays(current, 1); break;
        case 'ArrowUp': next = addDays(current, -7); break;
        case 'ArrowDown': next = addDays(current, 7); break;
        case 'Home': next = addDays(current, -((current.getDay() + 6) % 7)); break;
        case 'End': next = addDays(current, 6 - ((current.getDay() + 6) % 7)); break;
        case 'PageUp': next = addMonths(current, e.shiftKey ? -12 : -1); break;
        case 'PageDown': next = addMonths(current, e.shiftKey ? 12 : 1); break;
        default: return;
      }
      e.preventDefault();
      if (minDate && next < minDate) next = minDate;
      if (next.getMonth() !== view.getMonth() || next.getFullYear() !== view.getFullYear()) {
        showMonthOf(next, true);
      } else {
        focusDay = next;
        panel.querySelectorAll('.vow-cal-day').forEach(function (b) {
          const on = b.dataset.date === toISO(next);
          b.tabIndex = on ? 0 : -1;
          if (on) b.focus();
        });
      }
    });

    if (trigger) {
      trigger.addEventListener('click', function () { panel.hidden ? open() : close(false); });
      trigger.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown' && panel.hidden) { e.preventDefault(); open(); }
      });
    }

    // Programmatic writes (`input.value = …`) keep the calendar in sync.
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: function () { return nativeValue.get.call(input); },
      set: function (v) {
        nativeValue.set.call(input, v);
        syncTrigger();
        if (inline || !panel.hidden) showMonthOf(selected() || today(), false);
      }
    });

    const api = { close: close };
    syncTrigger();
    if (inline) showMonthOf(selected() || (minDate || today()), false);
    return api;
  }

  function enhanceAll(scope) {
    (scope || document).querySelectorAll('input[type="date"]:not([data-vow-cal])').forEach(enhance);
  }

  document.addEventListener('mousedown', function (e) {
    if (!openInstance) return;
    const openPanel = document.querySelector('.vow-cal.is-open');
    if (openPanel && !openPanel.contains(e.target)) openInstance.close(false);
  });
  window.addEventListener('resize', function () { if (openInstance) openInstance.close(false); });

  function start() {
    enhanceAll(document);
    new MutationObserver(function (records) {
      for (let i = 0; i < records.length; i++) {
        const nodes = records[i].addedNodes;
        for (let j = 0; j < nodes.length; j++) {
          const n = nodes[j];
          if (n.nodeType !== 1) continue;
          if (n.matches('input[type="date"]')) enhance(n);
          else if (n.querySelector('input[type="date"]')) enhanceAll(n);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);

  return { enhance: enhance, enhanceAll: enhanceAll };
})();
