// Mobile nav toggle
document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.querySelector('.nav-toggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      document.querySelector('.nav-links').classList.toggle('mobile-open');
    });
  }

  // Animate any progress bars on load
  document.querySelectorAll('.bar-fill, .budget-bar-fill').forEach(function (bar) {
    var target = bar.getAttribute('data-fill') || '0%';
    requestAnimationFrame(function () {
      bar.style.width = target;
    });
  });

  // Category tabs (planning tools + homepage)
  var panel = document.getElementById('categoryPanel');
  if (panel && window.categoryData) {
    function renderCategory(key) {
      var d = window.categoryData[key];
      var itemsHtml = d.items.map(function (i) {
        return '<li><span class="dot"></span>' + i + '</li>';
      }).join('');
      panel.innerHTML =
        '<div class="photo cp-photo"><img src="' + d.img + '" alt=""></div>' +
        '<div class="cp-text"><h4>' + d.title + '</h4><p>' + d.desc + '</p><ul>' + itemsHtml + '</ul></div>';
    }
    document.querySelectorAll('.category-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.category-tab').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        renderCategory(btn.dataset.cat);
      });
    });
    renderCategory('ceremony');
  }
});
