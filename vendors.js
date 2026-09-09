// Vendor directory SPA logic for Vow & Co. (vendors.html).
// Reads the shared, public VOWVENDORS directory (vendor-directory.js) and, when
// a couple already has a plan saved in VOWDATA (wedding-data.js) on this
// browser, connects Save/Enquire actions straight into that plan's private
// vendor relationships — the same data the dashboard's My Vendors view reads.

(function () {
  if (typeof VOWVENDORS === 'undefined') return;

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  let data = (typeof VOWDATA !== 'undefined') ? VOWDATA.get() : null;
  function refreshData() { data = (typeof VOWDATA !== 'undefined') ? VOWDATA.get() : null; }
  const w = function () { return (data && data.wedding) || null; };

  const state = { search: '', category: '', region: '', sort: 'recommended' };

  function formatVendorPrice(v) {
    if (v.priceRange) return v.priceRange;
    if (v.startingPrice) return 'From ' + VOWCO.formatCurrency(v.startingPrice);
    return 'Pricing on request';
  }

  function savedRelationship(vendorId) {
    return data ? VOWDATA.findVendorByDirectoryId(data, vendorId) : null;
  }

  function vendorCardHtml(v, opts) {
    opts = opts || {};
    const rel = savedRelationship(v.id);
    const match = opts.match;
    const meta = [v.suburb, v.region].filter(Boolean).join(', ') || v.region || 'Sydney';
    return '<div class="vendor-result-card" data-id="' + esc(v.id) + '">' +
      '<button type="button" class="vrc-save' + (rel ? ' is-saved' : '') + '" data-id="' + esc(v.id) + '" aria-label="Save vendor">' + (rel ? '♥' : '♡') + '</button>' +
      '<div class="vrc-name">' + esc(v.name) + '</div>' +
      '<div class="vrc-meta">' + esc(v.category) + (meta ? ' · ' + esc(meta) : '') + '</div>' +
      '<div class="vrc-price">' + esc(formatVendorPrice(v)) + '</div>' +
      (match && match.pct !== null ? '<div class="vrc-match">Good match for your wedding · ' + match.pct + '%</div>' : '') +
      '<a href="#vendor:' + esc(v.id) + '" class="vrc-view">View profile</a>' +
    '</div>';
  }

  function populateFilters() {
    const catSelect = document.getElementById('vdCategory');
    const counts = VOWVENDORS.categoryCounts();
    catSelect.innerHTML = '<option value="">All categories</option>' + VOWVENDORS.CATEGORIES.map(function (c) {
      return '<option value="' + esc(c) + '">' + esc(c) + (counts[c] ? ' (' + counts[c] + ')' : ' — coming soon') + '</option>';
    }).join('');

    const regionSelect = document.getElementById('vdRegion');
    regionSelect.innerHTML = '<option value="">All Sydney regions</option>' + VOWVENDORS.REGIONS.map(function (r) {
      return '<option value="' + esc(r) + '">' + esc(r) + '</option>';
    }).join('');

    document.getElementById('vdSearch').addEventListener('input', function (e) { state.search = e.target.value; renderResults(); });
    catSelect.addEventListener('change', function (e) { state.category = e.target.value; renderResults(); });
    regionSelect.addEventListener('change', function (e) { state.region = e.target.value; renderResults(); });
    document.getElementById('vdSort').addEventListener('change', function (e) { state.sort = e.target.value; renderResults(); });
  }

  function renderCategoryStrip() {
    const counts = VOWVENDORS.categoryCounts();
    const withVendors = VOWVENDORS.CATEGORIES.filter(function (c) { return counts[c] > 0; });
    const strip = document.getElementById('vdCategoryStrip');
    strip.innerHTML = withVendors.map(function (c) {
      return '<button type="button" class="vendor-category-chip' + (state.category === c ? ' active' : '') + '" data-cat="' + esc(c) + '">' + esc(c) + ' <span>' + counts[c] + '</span></button>';
    }).join('');
    strip.querySelectorAll('[data-cat]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.category = state.category === btn.dataset.cat ? '' : btn.dataset.cat;
        document.getElementById('vdCategory').value = state.category;
        renderResults();
      });
    });
  }

  function renderRecommended() {
    const wrap = document.getElementById('vdRecommendedWrap');
    const wedding = w();
    if (!wedding) { wrap.style.display = 'none'; return; }
    const have = {};
    (data.vendors || []).forEach(function (v) { have[v.category] = true; });
    const priority = VOWVENDORS.CATEGORIES.filter(function (c) {
      return !have[c] && VOWVENDORS.byCategory(c).length;
    }).sort(function (a, b) {
      const ai = VOWDATA.MAJOR_VENDOR_CATEGORIES.indexOf(a);
      const bi = VOWDATA.MAJOR_VENDOR_CATEGORIES.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    }).slice(0, 6);
    const cards = priority.map(function (c) {
      const top = VOWVENDORS.recommendedForWedding(wedding, c, 1)[0];
      return top ? vendorCardHtml(top, { match: top.match }) : '';
    }).filter(Boolean);
    if (!cards.length) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'block';
    document.getElementById('vdRecommendedGrid').innerHTML = cards.join('');
    wireCardEvents(document.getElementById('vdRecommendedGrid'));
  }

  function renderResults() {
    renderCategoryStrip();
    const wedding = w();
    let results = VOWVENDORS.search(state.search, { category: state.category || undefined, region: state.region || undefined });
    if (state.sort === 'name') {
      results = results.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    } else if (wedding) {
      results = results.map(function (v) { return Object.assign({}, v, { match: VOWVENDORS.vowMatch(v, wedding) }); })
        .sort(function (a, b) { return (b.match.pct || 0) - (a.match.pct || 0); });
    }
    const meta = document.getElementById('vdResultsMeta');
    const grid = document.getElementById('vdResultsGrid');
    if (!results.length) {
      meta.textContent = '';
      const catNote = state.category && !VOWVENDORS.byCategory(state.category).length
        ? "We don't have any verified " + state.category.toLowerCase() + ' vendors listed yet — check back soon, or try another category.'
        : 'No vendors match your search yet — try a different keyword or clear a filter.';
      grid.innerHTML = '<p class="empty-state">' + esc(catNote) + '</p>';
      return;
    }
    meta.textContent = results.length + ' vendor' + (results.length === 1 ? '' : 's') + (state.category ? ' in ' + state.category : '');
    grid.innerHTML = results.map(function (v) { return vendorCardHtml(v, { match: v.match }); }).join('');
    wireCardEvents(grid);
  }

  function wireCardEvents(scope) {
    scope.querySelectorAll('.vrc-save').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        toggleSave(btn.dataset.id);
      });
    });
  }

  function toggleSave(vendorId) {
    if (!data) {
      window.location.href = 'plan.html';
      return;
    }
    const rel = savedRelationship(vendorId);
    if (rel) {
      if (rel.status !== 'Shortlisted' && !confirm('You have already been in touch with this vendor. Remove them from My Vendors?')) return;
      VOWDATA.deleteVendor(rel.id);
    } else {
      VOWDATA.addVendor({ vendorId: vendorId, status: 'Shortlisted' });
    }
    refreshData();
    renderResults();
    renderRecommended();
    if (currentVendorId()) renderProfile(currentVendorId());
  }

  function buildEnquiryMessage(vendor, wedding) {
    const lines = [];
    lines.push('Hi ' + (vendor.name || 'there') + ',');
    lines.push('');
    let intro = "We're planning our wedding";
    if (wedding.date) intro += ' for ' + (VOWCO.formatDateLong(wedding.date) || wedding.date);
    if (wedding.location) intro += ' in ' + wedding.location;
    intro += ", and we'd love to find out more about your " + (vendor.category || 'wedding').toLowerCase() + ' services.';
    lines.push(intro);
    const details = [];
    if (wedding.guests) details.push(wedding.guests + ' guests');
    if (wedding.style) details.push(wedding.style + ' style');
    const budgetCat = VOWVENDORS.BUDGET_CATEGORY_MAP[vendor.category];
    if (budgetCat && wedding.budget) {
      const allocated = VOWCO.budgetBreakdown(wedding.budget).find(function (b) { return b.label === budgetCat; });
      if (allocated) details.push('a ' + budgetCat.toLowerCase() + ' budget of around ' + VOWCO.formatCurrency(allocated.amount));
    }
    if (details.length) lines.push("A bit about us: we're expecting " + details.join(', ') + '.');
    lines.push('');
    lines.push('Could you let us know your availability and pricing? We look forward to hearing from you.');
    return lines.join('\n');
  }

  function currentVendorId() {
    const m = /vendor:([^&]+)/.exec(window.location.hash);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function tagRowHtml(items) {
    if (!items || !items.length) return '';
    return '<div class="vp-tag-row">' + items.map(function (t) { return '<span class="vp-tag">' + esc(t) + '</span>'; }).join('') + '</div>';
  }

  function renderProfile(id) {
    const v = VOWVENDORS.byId(id);
    const overlay = document.getElementById('vendorProfileOverlay');
    const body = document.getElementById('vendorProfileBody');
    if (!v) {
      body.innerHTML = '<p class="empty-state">Vendor not found.</p>';
      overlay.hidden = false;
      return;
    }
    const wedding = w();
    const match = wedding ? VOWVENDORS.vowMatch(v, wedding) : null;
    const rel = savedRelationship(v.id);
    const links = [];
    if (v.website) links.push('<a href="' + esc(v.website) + '" target="_blank" rel="noopener" class="btn btn--ghost">Visit website</a>');
    if (v.phone) links.push('<a href="tel:' + esc(v.phone) + '" class="btn btn--ghost">Call ' + esc(v.phone) + '</a>');
    if (v.instagram) links.push('<a href="https://instagram.com/' + esc(String(v.instagram).replace('@', '')) + '" target="_blank" rel="noopener" class="btn btn--ghost">Instagram</a>');

    body.innerHTML =
      '<div class="vp-gallery-placeholder"><span>' + esc(v.category) + '</span></div>' +
      '<div class="vp-header">' +
        '<div><h2>' + esc(v.name) + '</h2><p>' + esc(v.category) + (v.subcategory ? ' · ' + esc(v.subcategory) : '') + '</p></div>' +
        '<button type="button" class="btn ' + (rel ? 'btn--ghost' : 'btn--black') + '" id="vpSaveBtn">' + (rel ? 'Saved to My Vendors ♥' : 'Save to shortlist') + '</button>' +
      '</div>' +
      (match && match.pct !== null ? '<div class="vrc-match" style="margin-bottom:16px;">Good match for your wedding · ' + match.pct + '%' + (match.reasons.length ? ' — ' + esc(match.reasons.join(', ')) : '') + '</div>' : '') +
      (v.description ? '<p class="vp-section">' + esc(v.description) + '</p>' : '') +
      '<div class="detail-row"><span class="k">Location</span><span class="v">' + esc([v.suburb, v.region].filter(Boolean).join(', ') || v.region || 'Sydney') + '</span></div>' +
      (v.serviceAreas && v.serviceAreas.length ? '<div class="detail-row"><span class="k">Service areas</span><span class="v">' + esc(v.serviceAreas.join(', ')) + '</span></div>' : '') +
      '<div class="detail-row"><span class="k">Pricing</span><span class="v">' + esc(formatVendorPrice(v)) + '</span></div>' +
      (v.capacity ? '<div class="detail-row"><span class="k">Capacity</span><span class="v">' + esc(v.capacity) + '</span></div>' : '') +
      tagRowHtml(v.styles) + tagRowHtml(v.services) + tagRowHtml(v.tags) +
      (links.length ? '<div class="contact-actions" style="margin-top:18px;">' + links.join('') + '</div>' : '') +
      '<p style="font-size:0.76rem; color:var(--muted); margin-top:18px;">Listed on Vow &amp; Co.' + (v.verified ? ' · Verified by Vow & Co.' : '') + ' · Source: <a href="' + esc(v.sourceUrl || v.website || '#') + '" target="_blank" rel="noopener" style="text-decoration:underline;">' + esc(v.sourceType || 'Official website') + '</a> · Checked ' + esc(v.lastChecked) + '</p>' +
      '<div id="vpEnquiryWrap" style="margin-top:26px;"></div>';

    document.getElementById('vpSaveBtn').addEventListener('click', function () { toggleSave(v.id); });
    renderEnquiryBlock(v, wedding, rel);
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function renderEnquiryBlock(v, wedding, rel) {
    const wrap = document.getElementById('vpEnquiryWrap');
    if (!wrap) return;
    if (!wedding) {
      wrap.innerHTML = '<div class="app-card"><h3>Enquire</h3><p style="color:var(--muted); font-size:0.9rem;">Start your free Vow &amp; Co. plan to send a personalised enquiry to this vendor and track their reply.</p><a href="plan.html" class="btn btn--black" style="margin-top:12px;">Build your free plan</a></div>';
      return;
    }
    const enquiry = (rel && rel.enquiry) || { message: '', status: 'Draft' };
    const message = enquiry.message || buildEnquiryMessage(v, wedding);
    wrap.innerHTML = '<div class="app-card"><h3>Enquire</h3>' +
      (enquiry.status === 'Sent'
        ? '<p style="font-size:0.82rem; color:var(--muted); margin-bottom:10px;">Enquiry saved. Vow &amp; Co. doesn\'t email vendors automatically yet — reach out via the links above, and track their reply from Messages in your dashboard.</p>'
        : '<p style="font-size:0.82rem; color:var(--muted); margin-bottom:10px;">Edit this message, then save it — it will be added to My Vendors so you can track this enquiry.</p>') +
      '<textarea id="vpEnquiryMessage" style="width:100%; min-height:140px; padding:12px 14px; border:1px solid var(--line); font-family:\'Inter\',sans-serif; font-size:0.9rem;">' + esc(message) + '</textarea>' +
      '<div class="form-actions" style="margin-top:12px;"><button type="button" class="btn btn--black" id="vpSendEnquiryBtn">' + (enquiry.status === 'Sent' ? 'Save enquiry' : 'Save &amp; mark as sent') + '</button></div>' +
      '</div>';
    document.getElementById('vpSendEnquiryBtn').addEventListener('click', function () {
      let relRecord = savedRelationship(v.id);
      if (!relRecord) {
        VOWDATA.addVendor({ vendorId: v.id, status: 'Shortlisted' });
        refreshData();
        relRecord = savedRelationship(v.id);
      }
      VOWDATA.saveVendorEnquiry(relRecord.id, { message: document.getElementById('vpEnquiryMessage').value });
      VOWDATA.sendVendorEnquiry(relRecord.id);
      refreshData();
      renderResults();
      renderRecommended();
      renderProfile(v.id);
    });
  }

  function closeProfile() {
    document.getElementById('vendorProfileOverlay').hidden = true;
    document.body.style.overflow = '';
    if (currentVendorId()) history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function handleHash() {
    const id = currentVendorId();
    if (id) renderProfile(id);
    else closeProfile();
  }

  function init() {
    populateFilters();
    renderRecommended();
    renderResults();
    document.getElementById('vendorProfileClose').addEventListener('click', closeProfile);
    document.getElementById('vendorProfileOverlay').addEventListener('click', function (e) {
      if (e.target === e.currentTarget) closeProfile();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeProfile(); });
    window.addEventListener('hashchange', handleHash);
    handleHash();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
