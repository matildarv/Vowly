// Vowly — refined concept interactions. Self-contained, progressive enhancement only.
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  var MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  /* Scroll reveal with stagger inside groups */
  function initReveal() {
    var items = Array.prototype.slice.call(document.querySelectorAll("[data-reveal]"));
    if (reduceMotion || !("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var group = el.closest("[data-reveal-group]");
        var delay = 0;
        if (group) {
          var siblings = Array.prototype.slice.call(group.querySelectorAll("[data-reveal]"));
          delay = Math.min(siblings.indexOf(el), 6) * 90;
        }
        setTimeout(function () { el.classList.add("is-in"); }, delay);
        io.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    items.forEach(function (el) { io.observe(el); });
  }

  /* Magnetic buttons — subtle */
  function initMagnetic() {
    if (reduceMotion || window.matchMedia("(pointer: coarse)").matches) return;
    document.querySelectorAll("[data-magnetic]").forEach(function (el) {
      var strength = 0.22;
      el.addEventListener("mousemove", function (e) {
        var r = el.getBoundingClientRect();
        var x = e.clientX - r.left - r.width / 2;
        var y = e.clientY - r.top - r.height / 2;
        el.style.transform = "translate(" + x * strength + "px," + y * strength + "px)";
      });
      el.addEventListener("mouseleave", function () { el.style.transform = ""; });
    });
  }

  /* Budget — premium currency input with live thousands formatting, no maximum */
  function initMoney() {
    document.querySelectorAll("[data-money]").forEach(function (wrap) {
      var field = wrap.querySelector(".vy-money__field");
      var input = wrap.querySelector(".vy-money__input");
      var chips = Array.prototype.slice.call(wrap.querySelectorAll(".vy-chip"));

      function digitsOnly(s) { return (s || "").replace(/[^\d]/g, ""); }
      function group(digits) { return digits ? Number(digits).toLocaleString("en-US") : ""; }

      function syncChips() {
        var current = digitsOnly(input.value);
        chips.forEach(function (c) { c.classList.toggle("is-active", c.getAttribute("data-preset") === current); });
      }

      // Format as the user types, preserving caret position relative to the end.
      input.addEventListener("input", function () {
        var digits = digitsOnly(input.value);
        var fromEnd = input.value.length - input.selectionStart;
        input.value = group(digits);
        var pos = Math.max(0, input.value.length - fromEnd);
        try { input.setSelectionRange(pos, pos); } catch (e) {}
        syncChips();
      });

      input.addEventListener("focus", function () { field.classList.add("is-focus"); });
      input.addEventListener("blur", function () {
        field.classList.remove("is-focus");
        var digits = digitsOnly(input.value);
        input.value = group(digits);
        syncChips();
      });

      chips.forEach(function (chip) {
        chip.addEventListener("click", function () {
          input.value = group(chip.getAttribute("data-preset"));
          syncChips();
          input.focus();
        });
      });

      syncChips();
    });
  }

  /* Tabs with sliding underline */
  function initTabs() {
    document.querySelectorAll("[data-tabs]").forEach(function (root) {
      var tabs = Array.prototype.slice.call(root.querySelectorAll(".vy-tab"));
      var ink = root.querySelector(".vy-tabs__ink");
      var panels = root.querySelectorAll(".vy-tabs__panel");
      function moveInk(tab) {
        if (!ink) return;
        ink.style.width = tab.offsetWidth + "px";
        ink.style.transform = "translateX(" + tab.offsetLeft + "px)";
      }
      function activate(tab) {
        tabs.forEach(function (t) { t.classList.toggle("is-active", t === tab); });
        var id = tab.getAttribute("data-tab");
        panels.forEach(function (p) { p.classList.toggle("is-active", p.getAttribute("data-panel") === id); });
        moveInk(tab);
      }
      tabs.forEach(function (tab) { tab.addEventListener("click", function () { activate(tab); }); });
      var active = root.querySelector(".vy-tab.is-active") || tabs[0];
      if (active) requestAnimationFrame(function () { moveInk(active); });
      window.addEventListener("resize", function () { var a = root.querySelector(".vy-tab.is-active"); if (a) moveInk(a); });
    });
  }

  /* Dropdown menu */
  function initMenus() {
    document.querySelectorAll("[data-menu]").forEach(function (menu) {
      var trigger = menu.querySelector(".vy-menu__trigger");
      var label = menu.querySelector(".vy-menu__label");
      trigger.addEventListener("click", function (e) {
        e.stopPropagation();
        document.querySelectorAll("[data-menu].is-open").forEach(function (m) { if (m !== menu) m.classList.remove("is-open"); });
        menu.classList.toggle("is-open");
      });
      menu.querySelectorAll(".vy-menu__list li").forEach(function (li) {
        li.addEventListener("click", function () {
          if (label) label.textContent = li.textContent;
          menu.classList.remove("is-open");
        });
      });
    });
    document.addEventListener("click", function () {
      document.querySelectorAll("[data-menu].is-open").forEach(function (m) { m.classList.remove("is-open"); });
    });
  }

  /* Animated progress bars */
  function initProgress() {
    var bars = Array.prototype.slice.call(document.querySelectorAll("[data-progress]"));
    function fill(el) {
      var val = Number(el.getAttribute("data-progress"));
      var span = el.querySelector(".vy-progress__bar span");
      if (span) span.style.width = val + "%";
    }
    if (reduceMotion || !("IntersectionObserver" in window)) { bars.forEach(fill); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { fill(e.target); io.unobserve(e.target); } });
    }, { threshold: 0.4 });
    bars.forEach(function (b) { io.observe(b); });
  }

  /* Calendar with fast month + year selection for far-future dates */
  function initCalendar() {
    var root = document.querySelector("[data-cal]");
    if (!root) return;
    var grid = root.querySelector("[data-cal-grid]");
    var monthSel = root.querySelector("[data-cal-month]");
    var yearSel = root.querySelector("[data-cal-year]");
    var selectedLabel = root.querySelector("[data-cal-selected]");
    var today = new Date();
    var view = new Date(2026, 7, 1);
    var selected = new Date(2026, 7, 16);

    // Populate month + year selectors (this year through +10 for far-future weddings).
    MONTHS.forEach(function (name, i) {
      var o = document.createElement("option");
      o.value = String(i); o.textContent = name;
      monthSel.appendChild(o);
    });
    var startYear = today.getFullYear();
    for (var y = startYear; y <= startYear + 10; y++) {
      var oy = document.createElement("option");
      oy.value = String(y); oy.textContent = String(y);
      yearSel.appendChild(oy);
    }

    function sameDay(a, b) { return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
    function fmt(d) { return d ? MONTHS_SHORT[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear() : null; }

    function syncSelectors() {
      monthSel.value = String(view.getMonth());
      // Keep the year list covering the viewed year even if it drifts past the default range.
      if (!yearSel.querySelector('option[value="' + view.getFullYear() + '"]')) {
        var extra = document.createElement("option");
        extra.value = String(view.getFullYear()); extra.textContent = String(view.getFullYear());
        yearSel.appendChild(extra);
      }
      yearSel.value = String(view.getFullYear());
    }

    function render() {
      syncSelectors();
      grid.innerHTML = "";
      var first = new Date(view.getFullYear(), view.getMonth(), 1);
      var startDow = (first.getDay() + 6) % 7; // Monday-first
      var days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
      for (var i = 0; i < startDow; i++) {
        var blank = document.createElement("span");
        blank.className = "vy-cal__cell is-empty";
        grid.appendChild(blank);
      }
      for (var d = 1; d <= days; d++) {
        var cell = document.createElement("button");
        cell.type = "button";
        cell.className = "vy-cal__cell";
        cell.textContent = d;
        var cur = new Date(view.getFullYear(), view.getMonth(), d);
        if (sameDay(cur, selected)) cell.classList.add("is-selected");
        if (sameDay(cur, today)) cell.classList.add("is-today");
        (function (dd) {
          cell.addEventListener("click", function () {
            selected = new Date(view.getFullYear(), view.getMonth(), dd);
            render();
          });
        })(d);
        grid.appendChild(cell);
      }
      if (selectedLabel) selectedLabel.textContent = selected ? "Selected: " + fmt(selected) : "No date selected";
    }

    monthSel.addEventListener("change", function () { view.setMonth(Number(monthSel.value)); render(); });
    yearSel.addEventListener("change", function () { view.setFullYear(Number(yearSel.value)); render(); });
    root.querySelector("[data-cal-prev]").addEventListener("click", function () { view.setMonth(view.getMonth() - 1); render(); });
    root.querySelector("[data-cal-next]").addEventListener("click", function () { view.setMonth(view.getMonth() + 1); render(); });
    var clearBtn = root.querySelector("[data-cal-clear]");
    if (clearBtn) clearBtn.addEventListener("click", function () { selected = null; render(); });
    render();
  }

  function init() {
    initReveal();
    initMagnetic();
    initMoney();
    initTabs();
    initMenus();
    initProgress();
    initCalendar();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
