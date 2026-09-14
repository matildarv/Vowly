// Vowly quantity input — an open-ended number field that replaces sliders.
//
// Product principle: when a couple is entering a quantity with no real-world
// maximum (budget, guests…), never cap them with a slider. They type any
// amount; presets are shortcuts, not limits.
//
// Markup:
//   <div class="qty-field">
//     <div class="qty-box">
//       <span class="qty-prefix">$</span>            (currency only)
//       <input type="text" inputmode="numeric" class="qty-input" data-qty="currency|integer" value="45000">
//     </div>
//     <p class="qty-help">…</p>
//     <div class="qty-presets"><button type="button" class="qty-preset" data-value="30000">$30k</button>…</div>
//   </div>
//
// The visible text is formatted ("45,000"); read the real number with
// VOWQTY.value(input) — a Number, or null while the field is empty.
// Write one with VOWQTY.set(input, n). Presets fire a normal `input` event.
window.VOWQTY = (function () {
  // The only ceiling is what the database can store, not a UI opinion:
  // weddings.budget is numeric(12,2) and weddings.guest_count is integer.
  const MAX_INTEGER_DIGITS = { currency: 10, integer: 9 };

  function kindOf(input) { return input.dataset.qty === 'currency' ? 'currency' : 'integer'; }

  function clean(raw, kind) {
    const s = String(raw === null || raw === undefined ? '' : raw).replace(/[^\d.]/g, '');
    const dot = s.indexOf('.');
    let intPart = dot === -1 ? s : s.slice(0, dot);
    let dec = null;
    if (kind === 'currency' && dot !== -1) dec = s.slice(dot + 1).replace(/\./g, '').slice(0, 2);
    intPart = intPart.replace(/^0+(?=\d)/, '').slice(0, MAX_INTEGER_DIGITS[kind]);
    return { intPart: intPart, dec: dec };
  }

  function format(parts) {
    const grouped = parts.intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.dec === null ? grouped : (grouped || '0') + '.' + parts.dec;
  }

  function toNumber(parts) {
    if (!parts.intPart && !parts.dec) return null;
    return Number((parts.intPart || '0') + (parts.dec ? '.' + parts.dec : ''));
  }

  // Count digits (and the decimal point) so the caret lands in the same
  // logical place after commas are inserted or removed.
  function significantCount(text) { return (text.match(/[\d.]/g) || []).length; }
  function caretFor(formatted, count) {
    if (count <= 0) return 0;
    let seen = 0;
    for (let i = 0; i < formatted.length; i++) {
      if (/[\d.]/.test(formatted[i])) seen++;
      if (seen === count) return i + 1;
    }
    return formatted.length;
  }

  function value(input) {
    return toNumber(clean(input.value, kindOf(input)));
  }

  function attach(input) {
    if (!input || input._vowqty) return input && input._vowqty;
    const kind = kindOf(input);
    const field = input.closest('.qty-field');
    const presets = field ? Array.prototype.slice.call(field.querySelectorAll('.qty-preset')) : [];

    function apply(raw) {
      const parts = clean(raw, kind);
      const text = format(parts);
      const n = toNumber(parts);
      input.value = text;
      input.dataset.value = n === null ? '' : String(n);
      presets.forEach(function (b) {
        const on = n !== null && Number(b.dataset.value) === n;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      if (field) field.classList.toggle('is-empty', n === null);
      return text;
    }

    input.setAttribute('autocomplete', 'off');
    if (!input.getAttribute('inputmode')) input.setAttribute('inputmode', kind === 'currency' ? 'decimal' : 'numeric');

    input.addEventListener('input', function () {
      const caretBefore = input.selectionStart === null ? input.value.length : input.selectionStart;
      const count = significantCount(input.value.slice(0, caretBefore));
      const text = apply(input.value);
      if (document.activeElement === input) {
        const caret = caretFor(text, count);
        input.setSelectionRange(caret, caret);
      }
    });

    // Tidy a trailing "." or a single decimal digit once the user moves on.
    input.addEventListener('blur', function () {
      const n = value(input);
      if (n === null) return;
      apply(kind === 'currency' && n % 1 !== 0 ? n.toFixed(2) : String(n));
    });

    presets.forEach(function (b) {
      b.addEventListener('click', function () {
        apply(b.dataset.value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });

    const box = field && field.querySelector('.qty-box');
    if (box) {
      box.addEventListener('mousedown', function (e) {
        if (e.target !== input) { e.preventDefault(); input.focus(); }
      });
    }

    const api = { apply: apply };
    input._vowqty = api;
    apply(input.value);
    return api;
  }

  function set(input, n) {
    attach(input)
      .apply(n === null || n === undefined || n === '' || isNaN(Number(n)) ? '' : String(Number(n)));
  }

  return { attach: attach, value: value, set: set };
})();
