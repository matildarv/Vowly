// Vowly — Editorial Atelier concept interactions. Self-contained, progressive enhancement only.
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

  /* Magnetic buttons */
  function initMagnetic() {
    if (reduceMotion || window.matchMedia("(pointer: coarse)").matches) return;
    document.querySelectorAll("[data-magnetic]").forEach(function (el) {
      var strength = 0.3;
      el.addEventListener("mousemove", function (e) {
        var r = el.getBoundingClientRect();
        var x = e.clientX - r.left - r.width / 2;
        var y = e.clientY - r.top - r.height / 2;
        el.style.transform = "translate(" + x * strength + "px," + y * strength + "px)";
      });
      el.addEventListener("mouseleave", function () { el.style.transform = ""; });
    });
  }

  /* Range slider with fill + floating bubble */
  function initRanges() {
    document.querySelectorAll("[data-range]").forEach(function (wrap) {
      var input = wrap.querySelector("input[type=range]");
      var fill = wrap.querySelector(".vy-range__fill");
      var bubble = wrap.querySelector(".vy-range__bubble");
      function fmt(v) { return "$" + Number(v).toLocaleString("en-US"); }
      function update() {
        var min = Number(input.min), max = Number(input.max), val = Number(input.value);
        var pct = ((val - min) / (max - min)) * 100;
        if (fill) fill.style.width = pct + "%";
        if (bubble) { bubble.style.left = pct + "%"; bubble.textContent = fmt(val); }
        wrap.style.setProperty("--x", pct + "%");
      }
      input.addEventListener("input", update);
      update();
    });
  }

  /* Tabs with sliding ink underline */
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
      trigger.addEventListener("click", function (e) {
        e.stopPropagation();
        document.querySelectorAll("[data-menu].is-open").forEach(function (m) { if (m !== menu) m.classList.remove("is-open"); });
        menu.classList.toggle("is-open");
      });
      menu.querySelectorAll(".vy-menu__list li").forEach(function (li) {
        li.addEventListener("click", function () {
          trigger.firstChild.textContent = li.textContent + " ";
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

  /* Editorial calendar */
  function initCalendar() {
    var root = document.querySelector("[data-cal]");
    if (!root) return;
    var grid = root.querySelector("[data-cal-grid]");
    var title = root.querySelector("[data-cal-title]");
    var months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    var view = new Date(2026, 7, 1);
    var selected = new Date(2026, 7, 16);
    var today = new Date();
    function render() {
      title.textContent = months[view.getMonth()] + " " + view.getFullYear();
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
    }
    function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
    root.querySelector("[data-cal-prev]").addEventListener("click", function () { view.setMonth(view.getMonth() - 1); render(); });
    root.querySelector("[data-cal-next]").addEventListener("click", function () { view.setMonth(view.getMonth() + 1); render(); });
    render();
  }

  function init() {
    initReveal();
    initMagnetic();
    initRanges();
    initTabs();
    initMenus();
    initProgress();
    initCalendar();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
