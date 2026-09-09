// Community data model for Vow & Co.
// This site has no real backend, so — same as wedding-data.js — everything
// here persists to localStorage under its own key, independent of any one
// couple's wedding plan (vendors and browsing visitors with no plan at all
// should still be able to take part). Seeded with realistic example content
// so the space feels alive on a first visit; a couple's own new posts,
// replies, and listings save locally in their browser. Structured so a real
// backend (with real multi-user sync) can replace loadRaw()/saveRaw() later
// without changing anything that calls into VOWCOMMUNITY.

const VOWCOMMUNITY = (function () {
  const STORAGE_KEY = 'vowco_community_data_v1';
  const ME_KEY = 'vowco_community_me_v1';

  const BOARD_CATEGORIES = [
    { slug: 'venues', label: 'Venues & Locations', desc: 'Shortlists, walkthroughs, and honest reviews.' },
    { slug: 'budget', label: 'Budget & Money-Saving', desc: 'Where to spend, where to save.' },
    { slug: 'diy-decor', label: 'DIY & Decor Ideas', desc: 'Styling, centrepieces, and projects.' },
    { slug: 'vendors-reviews', label: 'Vendors & Reviews', desc: 'Recommendations and real experiences.' },
    { slug: 'real-weddings', label: 'Real Weddings & Inspiration', desc: 'Photos and stories from real days.' },
    { slug: 'general', label: 'General Chat', desc: 'Anything else on your mind.' }
  ];

  const MARKET_CATEGORIES = ['Furniture & Rentals', 'Jewelry & Accessories', 'Clothing & Attire', 'Decor & Florals', 'Other'];
  const LISTING_CONDITIONS = ['New, unused', 'Like new', 'Good', 'Well loved'];

  const MAX_PHOTOS = 4;
  const MAX_PHOTO_DIMENSION = 900;
  const JPEG_QUALITY = 0.72;

  function uid(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function loadRaw() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveRaw(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      return false; // most likely storage quota exceeded — caller should tell the user
    }
  }

  function seedData() {
    const now = Date.now();
    const daysAgo = function (n) { return new Date(now - n * 86400000).toISOString(); };
    return {
      threads: [
        {
          id: 'seed-t1', category: 'venues', title: 'Anyone booked a barn venue in the Hunter Valley?',
          authorName: 'Priya', createdAt: daysAgo(6), photos: [],
          replies: [
            { id: 'seed-r1', authorName: 'Ashleigh', text: 'We looked at three out there — happy to share names if useful!', createdAt: daysAgo(5) },
            { id: 'seed-r2', authorName: 'Priya', text: 'Yes please, would love that.', createdAt: daysAgo(5) }
          ]
        },
        {
          id: 'seed-t2', category: 'budget', title: 'How much did you actually spend on flowers?',
          authorName: 'Meg', createdAt: daysAgo(9), photos: [],
          replies: [
            { id: 'seed-r3', authorName: 'Danielle', text: 'About $2,800 for 90 guests, mostly greenery with a few statement blooms to keep cost down.', createdAt: daysAgo(8) }
          ]
        },
        {
          id: 'seed-t3', category: 'diy-decor', title: 'DIY table numbers that don’t look DIY — tips?',
          authorName: 'Sarah', createdAt: daysAgo(3), photos: [],
          replies: []
        },
        {
          id: 'seed-t4', category: 'vendors-reviews', title: 'Amazing celebrant in Melbourne — highly recommend',
          authorName: 'Tom', createdAt: daysAgo(14), photos: [],
          replies: [
            { id: 'seed-r4', authorName: 'Liv', text: 'Ooh, do you have contact details? Still looking for ours.', createdAt: daysAgo(13) }
          ]
        },
        {
          id: 'seed-t5', category: 'real-weddings', title: 'Our coastal wedding — a few photos from the day',
          authorName: 'Hannah', createdAt: daysAgo(20), photos: [],
          replies: [
            { id: 'seed-r5', authorName: 'Grace', text: 'This is beautiful — congratulations!', createdAt: daysAgo(19) }
          ]
        },
        {
          id: 'seed-t6', category: 'general', title: 'How is everyone managing wedding planning stress?',
          authorName: 'Jess', createdAt: daysAgo(2), photos: [],
          replies: [
            { id: 'seed-r6', authorName: 'Priya', text: 'A running list on this site has helped me stop carrying it all in my head, honestly.', createdAt: daysAgo(1) }
          ]
        }
      ],
      listings: [
        {
          id: 'seed-l1', category: 'Decor & Florals', title: 'Set of 12 glass tealight holders', price: 45, condition: 'Like new',
          description: 'Used for one wedding, boxed carefully. Great for reception tables.', photos: [],
          sellerName: 'Ashleigh', sellerContact: 'ashleigh.example@email.com', createdAt: daysAgo(4)
        },
        {
          id: 'seed-l2', category: 'Clothing & Attire', title: 'Ivory A-line wedding dress, size 10', price: 650, condition: 'Good',
          description: 'Professionally dry cleaned after wearing. Comes with garment bag.', photos: [],
          sellerName: 'Grace', sellerContact: 'grace.example@email.com', createdAt: daysAgo(11)
        },
        {
          id: 'seed-l3', category: 'Furniture & Rentals', title: '6x round tables + linens', price: 220, condition: 'Good',
          description: 'Seats 60 total. Local pickup only, Sydney inner west.', photos: [],
          sellerName: 'Tom', sellerContact: 'tom.example@email.com', createdAt: daysAgo(8)
        },
        {
          id: 'seed-l4', category: 'Jewelry & Accessories', title: 'Pearl drop earrings, worn once', price: 60, condition: 'Like new',
          description: 'Bought for the wedding, never worn again. Freshwater pearls.', photos: [],
          sellerName: 'Hannah', sellerContact: 'hannah.example@email.com', createdAt: daysAgo(15)
        }
      ]
    };
  }

  function migrate(data) {
    if (!data) return data;
    if (!Array.isArray(data.threads)) data.threads = [];
    if (!Array.isArray(data.listings)) data.listings = [];
    return data;
  }

  function get() {
    let data = migrate(loadRaw());
    if (!data) {
      data = seedData();
      saveRaw(data);
    }
    return data;
  }

  function save(data) { return saveRaw(data); }

  // ---------------- IDENTITY ----------------
  // No real accounts on this site — a lightweight local display name is all
  // that's needed to post. Prompted for once, then reused.

  function getMe() {
    try { return localStorage.getItem(ME_KEY) || ''; } catch (e) { return ''; }
  }
  function setMe(name) {
    try { localStorage.setItem(ME_KEY, name); return true; } catch (e) { return false; }
  }

  // ---------------- PHOTOS ----------------
  // Resizes/compresses in the browser before storing as a data URL — keeps
  // each image small enough that a handful fit inside localStorage's ~5-10MB
  // per-origin limit. Real cloud storage would replace this entirely.

  function fileToCompressedDataUrl(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onerror = function () { reject(new Error('Could not read file')); };
      reader.onload = function () {
        const img = new Image();
        img.onerror = function () { reject(new Error('Could not read image')); };
        img.onload = function () {
          const scale = Math.min(1, MAX_PHOTO_DIMENSION / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ---------------- BOARDS / THREADS ----------------

  function boardCounts(data) {
    const counts = {};
    BOARD_CATEGORIES.forEach(function (c) { counts[c.slug] = 0; });
    data.threads.forEach(function (t) { counts[t.category] = (counts[t.category] || 0) + 1; });
    return counts;
  }

  function threadsByCategory(data, slug) {
    return data.threads.filter(function (t) { return t.category === slug; })
      .sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); });
  }

  function getThread(data, id) {
    return data.threads.find(function (t) { return t.id === id; }) || null;
  }

  function addThread(thread) {
    const data = loadRaw() || seedData();
    const newThread = {
      id: uid('t'),
      category: thread.category,
      title: thread.title || '',
      authorName: thread.authorName || 'Anonymous',
      createdAt: new Date().toISOString(),
      photos: thread.photos || [],
      body: thread.body || '',
      replies: []
    };
    data.threads.unshift(newThread);
    const ok = saveRaw(data);
    return { data: data, ok: ok, thread: newThread };
  }

  function addReply(threadId, authorName, text) {
    const data = loadRaw() || seedData();
    const thread = getThread(data, threadId);
    if (!thread) return { data: data, ok: false };
    thread.replies.push({ id: uid('r'), authorName: authorName || 'Anonymous', text: text, createdAt: new Date().toISOString() });
    const ok = saveRaw(data);
    return { data: data, ok: ok };
  }

  // ---------------- MARKETPLACE ----------------

  function listingsByCategory(data, category) {
    const list = category ? data.listings.filter(function (l) { return l.category === category; }) : data.listings.slice();
    return list.sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); });
  }

  function getListing(data, id) {
    return data.listings.find(function (l) { return l.id === id; }) || null;
  }

  function addListing(listing) {
    const data = loadRaw() || seedData();
    const newListing = {
      id: uid('l'),
      category: listing.category,
      title: listing.title || '',
      price: Number(listing.price) || 0,
      condition: listing.condition || LISTING_CONDITIONS[0],
      description: listing.description || '',
      photos: listing.photos || [],
      sellerName: listing.sellerName || 'Anonymous',
      sellerContact: listing.sellerContact || '',
      createdAt: new Date().toISOString()
    };
    data.listings.unshift(newListing);
    const ok = saveRaw(data);
    return { data: data, ok: ok, listing: newListing };
  }

  function deleteListing(id) {
    const data = loadRaw() || seedData();
    data.listings = data.listings.filter(function (l) { return l.id !== id; });
    saveRaw(data);
    return data;
  }

  function deleteThread(id) {
    const data = loadRaw() || seedData();
    data.threads = data.threads.filter(function (t) { return t.id !== id; });
    saveRaw(data);
    return data;
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    BOARD_CATEGORIES: BOARD_CATEGORIES,
    MARKET_CATEGORIES: MARKET_CATEGORIES,
    LISTING_CONDITIONS: LISTING_CONDITIONS,
    MAX_PHOTOS: MAX_PHOTOS,
    get: get,
    save: save,
    getMe: getMe,
    setMe: setMe,
    fileToCompressedDataUrl: fileToCompressedDataUrl,
    boardCounts: boardCounts,
    threadsByCategory: threadsByCategory,
    getThread: getThread,
    addThread: addThread,
    addReply: addReply,
    deleteThread: deleteThread,
    listingsByCategory: listingsByCategory,
    getListing: getListing,
    addListing: addListing,
    deleteListing: deleteListing
  };
})();
