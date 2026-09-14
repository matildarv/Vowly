// Community page logic for Vow & Co.
// A self-contained hash-router over community-data.js, following the same
// pattern as dashboard.js: every render function does a full read of
// VOWCOMMUNITY.get() and rebuilds its view's DOM from scratch.

(function () {
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function formatWhen(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (diffDays <= 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 14) return diffDays + ' days ago';
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  }

  // ---------------- ROUTER ----------------

  function currentRoute() {
    const hash = window.location.hash.replace('#', '') || 'boards';
    const idx = hash.indexOf(':');
    if (idx === -1) return { view: hash, arg: undefined };
    return { view: hash.slice(0, idx), arg: decodeURIComponent(hash.slice(idx + 1)) };
  }

  function showView(view) {
    document.querySelectorAll('.app-view').forEach(function (v) { v.classList.toggle('active', v.dataset.view === view); });
  }

  function updateTabs(view) {
    const boardViews = ['boards', 'category', 'thread', 'new-thread'];
    const isBoards = boardViews.indexOf(view) !== -1;
    const boardsTab = document.querySelector('[data-tab="boards"]');
    const marketTab = document.querySelector('[data-tab="marketplace"]');
    boardsTab.classList.toggle('btn--black', isBoards);
    boardsTab.classList.toggle('btn--ghost', !isBoards);
    marketTab.classList.toggle('btn--black', !isBoards);
    marketTab.classList.toggle('btn--ghost', isBoards);
  }

  function router() {
    const r = currentRoute();
    updateTabs(r.view);
    if (r.view === 'category') { showView('category'); renderCategoryView(r.arg); }
    else if (r.view === 'thread') { showView('thread'); renderThreadView(r.arg); }
    else if (r.view === 'new-thread') { showView('new-thread'); renderNewThreadForm(r.arg); }
    else if (r.view === 'marketplace') { showView('marketplace'); renderMarketplaceView(r.arg); }
    else if (r.view === 'listing') { showView('listing'); renderListingView(r.arg); }
    else if (r.view === 'new-listing') { showView('new-listing'); renderNewListingForm(); }
    else { showView('boards'); renderBoardsView(); }
  }
  window.addEventListener('hashchange', router);

  // ---------------- PHOTO UPLOAD WIDGET ----------------
  // photosArray is mutated in place (push/splice) so the caller's reference
  // (read again at submit time) always reflects the current selection.

  function renderPhotoUploadWidget(containerId, photosArray) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const thumbs = photosArray.map(function (src, idx) {
      return '<div class="photo-thumb"><img src="' + src + '" alt=""><span class="remove-photo" data-idx="' + idx + '">&times;</span></div>';
    }).join('');
    const canAddMore = photosArray.length < VOWCOMMUNITY.MAX_PHOTOS;
    el.innerHTML = '<label style="font-size:0.78rem; color:var(--muted); display:block; margin-bottom:8px;">Photos (up to ' + VOWCOMMUNITY.MAX_PHOTOS + ')</label>' +
      '<div class="photo-upload-grid">' + thumbs +
      (canAddMore ? '<label class="photo-add-btn">+ Add<input type="file" accept="image/*" multiple style="display:none;" id="' + containerId + 'Input"></label>' : '') +
      '</div><div id="' + containerId + 'Error" style="color:var(--color-error); font-size:0.8rem; margin-top:8px;"></div>';

    el.querySelectorAll('.remove-photo').forEach(function (btn) {
      btn.addEventListener('click', function () {
        photosArray.splice(Number(btn.dataset.idx), 1);
        renderPhotoUploadWidget(containerId, photosArray);
      });
    });
    const input = document.getElementById(containerId + 'Input');
    if (input) {
      input.addEventListener('change', function (e) {
        const remaining = VOWCOMMUNITY.MAX_PHOTOS - photosArray.length;
        const files = Array.prototype.slice.call(e.target.files).slice(0, remaining);
        const errorEl = document.getElementById(containerId + 'Error');
        errorEl.textContent = '';
        Promise.all(files.map(function (f) { return VOWCOMMUNITY.fileToCompressedDataUrl(f); }))
          .then(function (dataUrls) {
            dataUrls.forEach(function (d) { photosArray.push(d); });
            renderPhotoUploadWidget(containerId, photosArray);
          })
          .catch(function () {
            errorEl.textContent = 'One or more photos could not be added — try a different image.';
          });
      });
    }
  }

  // ---------------- BOARDS ----------------

  const BOARD_PHOTOS = { venues: 'gazebo.jpg', budget: 'ringshands2.jpg', 'diy-decor': 'florist.jpg', 'vendors-reviews': 'quartet.jpg', 'real-weddings': 'beachbride.jpg', general: 'bigparty.jpg' };

  function renderBoardsView() {
    const data = VOWCOMMUNITY.get();
    const counts = VOWCOMMUNITY.boardCounts(data);
    document.getElementById('boardGrid').innerHTML = VOWCOMMUNITY.BOARD_CATEGORIES.map(function (c) {
      const n = counts[c.slug] || 0;
      return '<a class="cat-card" href="#category:' + c.slug + '">' +
        '<div class="photo cat-photo"><img src="' + BOARD_PHOTOS[c.slug] + '" alt=""></div>' +
        '<div class="cat-body"><h4>' + esc(c.label) + '</h4><div class="progress">' + n + ' thread' + (n === 1 ? '' : 's') + '</div></div></a>';
    }).join('');
  }

  function renderCategoryView(slug) {
    const data = VOWCOMMUNITY.get();
    const cat = VOWCOMMUNITY.BOARD_CATEGORIES.find(function (c) { return c.slug === slug; });
    const threads = VOWCOMMUNITY.threadsByCategory(data, slug);
    document.getElementById('categoryHead').innerHTML =
      '<div><h2>' + esc(cat ? cat.label : 'Board') + '</h2><p>' + esc(cat ? cat.desc : '') + '</p></div>' +
      '<a href="#new-thread:' + esc(slug) + '" class="btn btn--black">Start a new thread</a>';
    const table = document.getElementById('threadTable');
    if (!threads.length) {
      table.innerHTML = '<tbody><tr><td class="empty-state">No threads yet — start the first one.</td></tr></tbody>';
      return;
    }
    table.innerHTML = '<thead><tr><th>Thread</th><th>Started by</th><th>Replies</th><th>Last activity</th></tr></thead><tbody>' +
      threads.map(function (t) {
        const last = t.replies.length ? t.replies[t.replies.length - 1].createdAt : t.createdAt;
        return '<tr class="clickable" data-id="' + t.id + '"><td>' + esc(t.title) + '</td><td class="cell-muted">' + esc(t.authorName) + '</td><td class="cell-muted">' + t.replies.length + '</td><td class="cell-muted">' + formatWhen(last) + '</td></tr>';
      }).join('') + '</tbody>';
    table.querySelectorAll('tr[data-id]').forEach(function (tr) {
      tr.addEventListener('click', function () { window.location.hash = 'thread:' + tr.dataset.id; });
    });
  }

  function renderThreadView(id) {
    const data = VOWCOMMUNITY.get();
    const t = VOWCOMMUNITY.getThread(data, id);
    const backLink = document.getElementById('threadBackLink');
    const el = document.getElementById('threadDetail');
    if (!t) {
      backLink.href = '#boards';
      el.innerHTML = '<p style="color:var(--muted);">This thread no longer exists.</p>';
      return;
    }
    backLink.href = '#category:' + t.category;
    const cat = VOWCOMMUNITY.BOARD_CATEGORIES.find(function (c) { return c.slug === t.category; });
    const photosHtml = t.photos && t.photos.length
      ? '<div style="display:flex; gap:10px; flex-wrap:wrap; margin:20px 0;">' + t.photos.map(function (p) { return '<div class="photo" style="width:180px; aspect-ratio:4/3;"><img src="' + p + '" alt=""></div>'; }).join('') + '</div>'
      : '';
    const repliesHtml = t.replies.length ? t.replies.map(function (r) {
      return '<div class="reply-item"><span class="who">' + esc(r.authorName) + '</span><span class="when">' + formatWhen(r.createdAt) + '</span><div class="txt">' + esc(r.text) + '</div></div>';
    }).join('') : '<p style="color:var(--muted); font-size:0.9rem;">No replies yet — be the first.</p>';

    el.innerHTML =
      '<div class="eyebrow">' + esc(cat ? cat.label.toUpperCase() : '') + '</div>' +
      '<h2 style="margin-bottom:10px;">' + esc(t.title) + '</h2>' +
      '<p style="color:var(--muted); font-size:0.85rem;">' + esc(t.authorName) + ' · ' + formatWhen(t.createdAt) + '</p>' +
      (t.body ? '<p style="margin-top:16px; font-size:1.02rem; max-width:70ch;">' + esc(t.body) + '</p>' : '') +
      photosHtml +
      '<div class="app-card" style="margin-top:32px;"><h3>' + t.replies.length + ' repl' + (t.replies.length === 1 ? 'y' : 'ies') + '</h3>' + repliesHtml + '</div>' +
      '<div class="app-card" style="margin-top:20px;"><h3>Add a reply</h3>' +
      '<div class="form-field"><label>Your name</label><input type="text" id="replyName" value="' + esc(VOWCOMMUNITY.getMe()) + '"></div>' +
      '<div class="form-field" style="margin-top:12px;"><label>Reply</label><textarea id="replyText" style="width:100%; min-height:90px; padding:12px 14px; font-size:0.92rem;"></textarea></div>' +
      '<div class="form-actions" style="margin-top:12px;"><button class="btn btn--black" id="submitReplyBtn">Post reply</button></div>' +
      '</div>';

    document.getElementById('submitReplyBtn').addEventListener('click', function () {
      const name = document.getElementById('replyName').value.trim() || 'Anonymous';
      const text = document.getElementById('replyText').value.trim();
      if (!text) return;
      VOWCOMMUNITY.setMe(name);
      VOWCOMMUNITY.addReply(t.id, name, text);
      renderThreadView(t.id);
    });
  }

  let newThreadPhotos = [];
  function renderNewThreadForm(presetSlug) {
    newThreadPhotos = [];
    document.getElementById('newThreadError').style.display = 'none';
    document.getElementById('newThreadFields').innerHTML =
      '<div class="form-field"><label>Board</label><select id="ntCategory">' + VOWCOMMUNITY.BOARD_CATEGORIES.map(function (c) {
        return '<option value="' + c.slug + '"' + (c.slug === presetSlug ? ' selected' : '') + '>' + esc(c.label) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="form-field"><label>Your name</label><input type="text" id="ntName" value="' + esc(VOWCOMMUNITY.getMe()) + '"></div>' +
      '<div class="form-field span-2"><label>Title</label><input type="text" id="ntTitle" placeholder="What\'s your question or topic?"></div>' +
      '<div class="form-field span-2"><label>Details</label><textarea id="ntBody" style="width:100%; min-height:110px; padding:12px 14px; font-size:0.92rem;"></textarea></div>';
    renderPhotoUploadWidget('newThreadPhotoUpload', newThreadPhotos);
  }

  function bindSubmitThread() {
    document.getElementById('submitThreadBtn').addEventListener('click', function () {
      const category = document.getElementById('ntCategory').value;
      const name = document.getElementById('ntName').value.trim() || 'Anonymous';
      const title = document.getElementById('ntTitle').value.trim();
      const body = document.getElementById('ntBody').value.trim();
      if (!title) return;
      VOWCOMMUNITY.setMe(name);
      const result = VOWCOMMUNITY.addThread({ category: category, title: title, body: body, authorName: name, photos: newThreadPhotos });
      if (!result.ok) {
        const err = document.getElementById('newThreadError');
        err.textContent = 'Could not save your thread — your browser storage may be full. Try removing a photo and posting again.';
        err.style.display = 'block';
        return;
      }
      window.location.hash = 'thread:' + result.thread.id;
    });
  }

  // ---------------- MARKETPLACE ----------------

  function renderMarketplaceView(presetCategory) {
    const select = document.getElementById('marketCategorySelect');
    const current = presetCategory !== undefined ? presetCategory : (select.dataset.selected || '');
    select.innerHTML = '<option value="">All categories</option>' + VOWCOMMUNITY.MARKET_CATEGORIES.map(function (c) {
      return '<option value="' + esc(c) + '"' + (c === current ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    select.value = current;
    select.dataset.selected = current;
    select.onchange = function () {
      window.location.hash = select.value ? 'marketplace:' + encodeURIComponent(select.value) : 'marketplace';
    };
    renderListingGrid(current);
  }

  function renderListingGrid(category) {
    const data = VOWCOMMUNITY.get();
    const listings = VOWCOMMUNITY.listingsByCategory(data, category);
    const grid = document.getElementById('listingGrid');
    if (!listings.length) {
      grid.innerHTML = '<p style="color:var(--muted); padding:40px 0;">No listings in this category yet.</p>';
      return;
    }
    grid.innerHTML = listings.map(function (l) {
      const photo = l.photos && l.photos.length ? l.photos[0] : '';
      return '<div class="listing-cell" data-id="' + l.id + '">' +
        '<div class="photo lc-photo">' + (photo ? '<img src="' + photo + '" alt="">' : '') + '</div>' +
        '<div class="lc-body"><div class="lc-title">' + esc(l.title) + '</div><div class="lc-meta"><span>' + esc(l.category) + '</span><span class="lc-price">' + VOWCO.formatCurrency(l.price) + '</span></div></div>' +
        '</div>';
    }).join('');
    grid.querySelectorAll('.listing-cell').forEach(function (cell) {
      cell.addEventListener('click', function () { window.location.hash = 'listing:' + cell.dataset.id; });
    });
  }

  function renderListingView(id) {
    const data = VOWCOMMUNITY.get();
    const l = VOWCOMMUNITY.getListing(data, id);
    const el = document.getElementById('listingDetail');
    if (!l) { el.innerHTML = '<p style="color:var(--muted);">This listing is no longer available.</p>'; return; }
    const photosHtml = l.photos && l.photos.length
      ? '<div class="photo" style="aspect-ratio:4/3; margin-bottom:14px;"><img src="' + l.photos[0] + '" alt=""></div>' +
        (l.photos.length > 1 ? '<div style="display:flex; gap:10px;">' + l.photos.slice(1).map(function (p) { return '<div class="photo" style="width:90px; aspect-ratio:4/3;"><img src="' + p + '" alt=""></div>'; }).join('') + '</div>' : '')
      : '<div class="photo" style="aspect-ratio:4/3; display:flex; align-items:center; justify-content:center; color:var(--muted); font-size:0.85rem;">No photos added</div>';
    el.innerHTML =
      '<div class="split">' +
      '<div>' + photosHtml + '</div>' +
      '<div>' +
      '<div class="eyebrow">' + esc(l.category.toUpperCase()) + '</div>' +
      '<h2>' + esc(l.title) + '</h2>' +
      '<div style="font-family:var(--font-display); font-size:1.8rem; margin:14px 0;">' + VOWCO.formatCurrency(l.price) + '</div>' +
      '<p style="color:var(--muted); font-size:0.88rem; margin-bottom:20px;">Condition: ' + esc(l.condition) + ' · Listed by ' + esc(l.sellerName) + ' · ' + formatWhen(l.createdAt) + '</p>' +
      '<p style="margin-bottom:28px; max-width:50ch;">' + esc(l.description) + '</p>' +
      (l.sellerContact
        ? '<a class="btn btn--black" href="mailto:' + esc(l.sellerContact) + '?subject=' + encodeURIComponent('Interested in: ' + l.title) + '">Message seller</a>'
        : '<p style="color:var(--muted); font-size:0.85rem;">No contact details provided for this listing.</p>') +
      '</div>' +
      '</div>';
  }

  let newListingPhotos = [];
  function renderNewListingForm() {
    newListingPhotos = [];
    document.getElementById('newListingError').style.display = 'none';
    document.getElementById('newListingFields').innerHTML =
      '<div class="form-field"><label>Category</label><select id="nlCategory">' + VOWCOMMUNITY.MARKET_CATEGORIES.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</select></div>' +
      '<div class="form-field"><label>Condition</label><select id="nlCondition">' + VOWCOMMUNITY.LISTING_CONDITIONS.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</select></div>' +
      '<div class="form-field span-2"><label>Title</label><input type="text" id="nlTitle" placeholder="e.g. Set of 12 glass tealight holders"></div>' +
      '<div class="form-field"><label>Price (AUD)</label><input type="number" min="0" id="nlPrice"></div>' +
      '<div class="form-field"><label>Your name</label><input type="text" id="nlSellerName" value="' + esc(VOWCOMMUNITY.getMe()) + '"></div>' +
      '<div class="form-field span-2"><label>Contact email</label><input type="email" id="nlContact" placeholder="Buyers will message you here"></div>' +
      '<div class="form-field span-2"><label>Description</label><textarea id="nlDescription" style="width:100%; min-height:100px; padding:12px 14px; font-size:0.92rem;"></textarea></div>';
    renderPhotoUploadWidget('newListingPhotoUpload', newListingPhotos);
  }

  function bindSubmitListing() {
    document.getElementById('submitListingBtn').addEventListener('click', function () {
      const category = document.getElementById('nlCategory').value;
      const condition = document.getElementById('nlCondition').value;
      const title = document.getElementById('nlTitle').value.trim();
      const price = document.getElementById('nlPrice').value;
      const sellerName = document.getElementById('nlSellerName').value.trim() || 'Anonymous';
      const contact = document.getElementById('nlContact').value.trim();
      const description = document.getElementById('nlDescription').value.trim();
      if (!title) return;
      VOWCOMMUNITY.setMe(sellerName);
      const result = VOWCOMMUNITY.addListing({ category: category, condition: condition, title: title, price: price, sellerName: sellerName, sellerContact: contact, description: description, photos: newListingPhotos });
      if (!result.ok) {
        const err = document.getElementById('newListingError');
        err.textContent = 'Could not save your listing — your browser storage may be full. Try removing a photo and posting again.';
        err.style.display = 'block';
        return;
      }
      window.location.hash = 'listing:' + result.listing.id;
    });
  }

  // ---------------- INIT ----------------

  bindSubmitThread();
  bindSubmitListing();
  router();
})();
