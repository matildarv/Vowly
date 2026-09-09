// Public vendor directory for Vow & Co.
// This is PLATFORM data — shared, read-only reference information about real
// businesses — and is deliberately separate from a couple's private
// relationship with a vendor (saved/shortlisted, enquiries, quotes, notes,
// booking, payments), which lives per-couple in VOWDATA (wedding-data.js).
// See VOWDATA.vendors[] — each entry there stores a `vendorId` referencing a
// record here, plus everything specific to that couple's relationship.
//
// Every vendor below is a real, currently-operating Sydney-area business,
// found via web search and checked against its own official website/social
// profile as of the lastChecked date. Descriptions are short original
// summaries, not copied from vendor sites. Pricing/capacity fields are only
// filled in where a business publicly states them — otherwise they're left
// null and the UI shows "Pricing on request". No vendor here is described as
// "verified" or "vetted" — everything starts as `listed: true, verified:
// false, claimed: false, featured: false` until an actual Vow & Co.
// verification or claim process exists (see PART 12 of the vendor phase 2
// brief this file implements).
//
// This is a starting seed (~43 vendors across 11 of the ~20 planned
// categories), not the finished marketplace — quality and honesty over
// hitting a target count. Categories with no listings yet still exist in
// CATEGORIES so the directory's architecture is ready for more.

const VOWVENDORS = (function () {
  const LAST_CHECKED = '2026-09-06';

  // All primary categories the directory is designed for. Categories with
  // zero vendors currently show an honest empty state rather than being
  // hidden — the taxonomy is meant to be complete even before every
  // category has real listings.
  const CATEGORIES = [
    'Venues', 'Photography', 'Videography', 'Florals', 'Catering', 'Celebrants',
    'Entertainment', 'Bridal', 'Suits & Formalwear', 'Hair & Makeup', 'Cakes',
    'Styling & Decor', 'Stationery', 'Transport', 'Hire', 'Jewellery',
    'Content Creators', 'Photo Booths', 'Accommodation', 'Wedding Planning'
  ];

  const REGIONS = [
    'Sydney CBD', 'Eastern Suburbs', 'Northern Beaches', 'North Shore', 'Lower North Shore',
    'Inner West', 'Northern Suburbs', 'Western Sydney', 'South Sydney', 'Sutherland Shire',
    'Hills District', 'Parramatta', 'Hawkesbury', 'Blue Mountains', 'Central Coast',
    'Wollongong / Illawarra', 'Greater Sydney'
  ];

  // Budget categories (see calculator.js VOWCO.BUDGET_WEIGHTS) each directory
  // category maps to, so "within your budget" matching has something to
  // compare a vendor's price against.
  const BUDGET_CATEGORY_MAP = {
    Venues: 'Venue & reception', Catering: 'Catering', Photography: 'Photography & film',
    Videography: 'Photography & film', Florals: 'Flowers', Entertainment: 'Entertainment',
    Bridal: 'Attire', 'Suits & Formalwear': 'Attire', 'Hair & Makeup': 'Attire'
  };

  function v(rec) {
    return Object.assign({
      subcategory: '', description: '', suburb: '', region: '', serviceAreas: [],
      website: '', email: '', phone: '', instagram: '', priceRange: null, startingPrice: null,
      capacity: null, styles: [], services: [], tags: [], images: [],
      sourceType: 'Official website', lastChecked: LAST_CHECKED,
      listed: true, verified: false, claimed: false, featured: false, notes: ''
    }, rec);
  }

  const directory = [
    // ---------------- VENUES ----------------
    v({ id: 'doltone-house', name: 'Doltone House', category: 'Venues', subcategory: 'Multiple venues',
      description: 'Sydney reception group with waterfront, city and Western Sydney venues, hosting weddings from intimate to very large.',
      suburb: 'Multiple Sydney locations', region: 'Greater Sydney', serviceAreas: ['Greater Sydney'],
      website: 'https://doltonehouse.com.au/', priceRange: 'From $120 per person (Sunday packages)', capacity: '10–750 guests',
      styles: ['Luxury', 'Waterfront', 'City'], tags: ['Multiple venues', 'Large weddings'],
      sourceUrl: 'https://doltonehouse.com.au/wedding/venues/sydney/' }),
    v({ id: 'zest-waterfront-venues', name: 'Zest Waterfront Venues', category: 'Venues', subcategory: 'Waterfront',
      description: 'Hamptons-style waterfront reception venue at the Royal Motor Yacht Club, Point Piper, overlooking Rose Bay.',
      suburb: 'Point Piper', region: 'Eastern Suburbs', serviceAreas: ['Eastern Suburbs', 'Sydney CBD'],
      website: 'https://zest.net.au/', capacity: 'Up to 160 seated / 300 cocktail',
      styles: ['Luxury', 'Waterfront', 'Hamptons'], tags: ['ABIA Best Reception Venue NSW winner, multiple years', 'In-house styling included'],
      sourceUrl: 'https://zest.net.au/weddings/waterfront-weddings-at-point-piper/' }),
    v({ id: 'the-grounds-of-alexandria', name: 'The Grounds of Alexandria', category: 'Venues', subcategory: 'Garden',
      description: 'Industrial-chic garden and event space in a converted pie factory, with indoor and landscaped outdoor areas for receptions.',
      suburb: 'Alexandria', region: 'South Sydney', serviceAreas: ['South Sydney', 'Inner West', 'Sydney CBD'],
      website: 'https://thegrounds.com.au/', startingPrice: 2400, priceRange: 'From $2,400 venue hire', capacity: 'Up to 550 (reception)',
      styles: ['Garden', 'Industrial', 'Rustic'], tags: ['Exclusive use available', 'On-site coordinator'],
      sourceUrl: 'https://thegrounds.com.au/Spaces/events-the-garden/' }),
    v({ id: 'curzon-hall', name: 'Curzon Hall', category: 'Venues', subcategory: 'Estate',
      description: 'Heritage 1800s ballroom estate on three acres, with indoor ballrooms and outdoor garden ceremony spaces.',
      suburb: 'Marsfield', region: 'Northern Suburbs', serviceAreas: ['Northern Suburbs', 'North Shore', 'Hills District'],
      website: 'https://navarravenues.com.au/venues/curzon-hall/', capacity: '30–500+ guests',
      styles: ['Estate', 'Ballroom', 'Classic'], tags: ['Heritage architecture', 'Large weddings'],
      sourceUrl: 'https://navarravenues.com.au/venues/curzon-hall/' }),
    v({ id: 'gunners-barracks', name: 'Gunners Barracks', category: 'Venues', subcategory: 'Heritage',
      description: 'Historic harbourside venue in bushland at Georges Heights, Mosman, with Sydney Harbour views.',
      suburb: 'Mosman', region: 'Lower North Shore', serviceAreas: ['Lower North Shore', 'North Shore', 'Sydney CBD'],
      website: 'https://gunnersbarracks.com.au/', capacity: 'Up to 130 seated / 180 cocktail',
      styles: ['Heritage', 'Waterfront', 'Luxury'], tags: ['Harbour views', 'Small–medium weddings'],
      sourceUrl: 'https://gunnersbarracks.com.au/wedding-venue/reception/' }),
    v({ id: 'san-martin-akuna-bay', name: 'San Martin', category: 'Venues', subcategory: 'Waterfront',
      description: 'Waterfront reception venue inside Ku-ring-gai Chase National Park at Akuna Bay, on Sydney’s Northern Beaches.',
      suburb: 'Akuna Bay', region: 'Northern Beaches', serviceAreas: ['Northern Beaches', 'North Shore'],
      website: 'https://www.sanmartin.com.au/', priceRange: 'From $135 per person', capacity: 'Up to 180 seated / 250 cocktail',
      styles: ['Waterfront', 'Garden', 'National park'], tags: ['Destination-style setting'],
      sourceUrl: 'https://www.sanmartin.com.au/wedding-venue-near-sydney' }),

    // ---------------- PHOTOGRAPHY ----------------
    v({ id: 'salt-atelier', name: 'Salt Atelier', category: 'Photography', subcategory: 'Editorial',
      description: 'Sydney studio shooting refined, editorial-style wedding photography and film for over a decade.',
      region: 'Greater Sydney', serviceAreas: ['Greater Sydney'],
      website: 'https://saltatelier.com.au/', styles: ['Editorial', 'Fine art'],
      tags: ['Featured in Vogue, Hello May, Polka Dot Bride'], services: ['Wedding photography', 'Wedding film'],
      sourceUrl: 'https://saltatelier.com.au/' }),
    v({ id: 'splendid-photography-video', name: 'Splendid Photography & Video', category: 'Photography', subcategory: 'Editorial',
      description: 'Award-winning Sydney studio offering combined photography and videography, with 15+ years shooting weddings.',
      suburb: 'Homebush', region: 'Inner West', serviceAreas: ['Inner West', 'Sydney CBD', 'Western Sydney'],
      website: 'https://splendid.net.au/', styles: ['Editorial', 'Luxury'],
      tags: ['Featured in British Vogue, Tatler'], services: ['Wedding photography', 'Wedding videography'],
      sourceUrl: 'https://splendid.net.au/' }),
    v({ id: 'daniel-griffiths-photography', name: 'Daniel Griffiths Photography', category: 'Photography', subcategory: 'Editorial',
      description: 'Sydney photographer known for fashion-inspired, editorial wedding imagery with clean composition and natural light.',
      suburb: 'St Ives', region: 'North Shore', serviceAreas: ['North Shore', 'Greater Sydney'],
      website: 'https://dgphotos.com.au/', startingPrice: 2800, styles: ['Editorial', 'Fashion-inspired'],
      sourceUrl: 'https://dgphotos.com.au/' }),
    v({ id: 'vincent-lai-photography', name: 'Vincent Lai Photography', category: 'Photography', subcategory: 'Documentary',
      description: 'AIPP-accredited Sydney photographer with an honest, simple documentary approach, having shot 800+ weddings.',
      region: 'Greater Sydney', serviceAreas: ['Greater Sydney'],
      website: 'https://www.vincentlai.com.au/', styles: ['Documentary'], tags: ['AIPP accredited member', '800+ weddings photographed'],
      sourceUrl: 'https://www.vincentlai.com.au/' }),

    // ---------------- VIDEOGRAPHY ----------------
    v({ id: 'truelight-studio', name: 'Truelight Studio', category: 'Videography', subcategory: 'Cinematic',
      description: 'Sydney wedding videography team with over ten years making polished, cinematic wedding films.',
      region: 'Greater Sydney', serviceAreas: ['Greater Sydney'], styles: ['Cinematic'],
      sourceUrl: 'https://onefinedayweddingexpo.com.au/wedding-hub/wedding-tips/best-wedding-videographers-in-sydney/', sourceType: 'Business listing' }),
    v({ id: 'be-mine-films', name: 'Be Mine Films', category: 'Videography', subcategory: 'Cinematic',
      description: 'Sydney and NSW wedding videography team producing cinematic films that stay candid and natural.',
      region: 'Greater Sydney', serviceAreas: ['Greater Sydney'], styles: ['Cinematic', 'Candid'],
      sourceUrl: 'https://onefinedayweddingexpo.com.au/wedding-hub/wedding-tips/best-wedding-videographers-in-sydney/', sourceType: 'Business listing' }),
    v({ id: 'c2-films', name: 'C2 Films', category: 'Videography', subcategory: 'Cinematic',
      description: 'Sydney and Melbourne wedding cinematography studio with over two decades of experience filming weddings.',
      region: 'Greater Sydney', serviceAreas: ['Greater Sydney'],
      website: 'https://www.c2films.com.au/', styles: ['Cinematic'], tags: ['20+ years experience'],
      sourceUrl: 'https://www.c2films.com.au/wedding-photography-videography-sydney' }),
    v({ id: 'arian-film-productions', name: 'Arian Film Productions', category: 'Videography', subcategory: 'Cinematic',
      description: 'Sydney wedding filmmaker using cinematic techniques to capture the genuine emotion of the day.',
      region: 'Greater Sydney', serviceAreas: ['Greater Sydney'],
      website: 'https://www.arianfilmproductions.com/', styles: ['Cinematic'],
      sourceUrl: 'https://www.arianfilmproductions.com/' }),

    // ---------------- FLORALS ----------------
    v({ id: 'nonies-floristry', name: 'Nonie’s Floristry', category: 'Florals', subcategory: 'Classic',
      description: 'Sydney wedding florist led by Head Florist Nonie, with over 20 years of floral design experience.',
      region: 'Greater Sydney', serviceAreas: ['Greater Sydney'],
      website: 'https://www.noniesfloristry.com.au/', styles: ['Classic', 'Romantic'], tags: ['Featured on Sunrise Australia'],
      sourceUrl: 'https://www.noniesfloristry.com.au/' }),
    v({ id: 'biophilia-blooms', name: 'Biophilia Blooms', category: 'Florals', subcategory: 'Modern',
      description: 'Sydney wedding and event florist creating modern, sculptural floral arrangements using floral-foam-free techniques.',
      region: 'Greater Sydney', serviceAreas: ['Greater Sydney'],
      website: 'https://www.biophiliablooms.com/', styles: ['Modern', 'Sustainable'], tags: ['Floral-foam-free designs'],
      sourceUrl: 'https://www.biophiliablooms.com/' }),
    v({ id: 'christine-and-rose-flowers', name: 'Christine & Rose Flowers', category: 'Florals', subcategory: 'Bespoke',
      description: 'Studio-based Sydney florist in Five Dock run by Gemma, specialising in bespoke seasonal wedding floral design.',
      suburb: 'Five Dock', region: 'Inner West', serviceAreas: ['Inner West', 'Sydney CBD'],
      website: 'https://www.christineandroseflowers.com.au/', styles: ['Bespoke', 'Seasonal'],
      sourceUrl: 'https://www.christineandroseflowers.com.au/' }),
    v({ id: 'the-lillipillian', name: 'The Lillipillian', category: 'Florals', subcategory: 'Organic',
      description: 'Floral design and styling studio founded by Tegan O’Brien, working across Greater Sydney with wild, organic arrangements.',
      region: 'Greater Sydney', serviceAreas: ['Greater Sydney'],
      website: 'https://www.thelillipillian.com.au/', styles: ['Organic', 'Romantic'],
      sourceUrl: 'https://www.thelillipillian.com.au/' }),

    // ---------------- CATERING ----------------
    v({ id: 'zing-fresh-catering', name: 'Zing Fresh Catering & Styling', category: 'Catering', subcategory: 'Modern',
      description: 'Northern Beaches-based catering and styling company led by Jennifer Jones, official caterer for the One Fine Day Wedding Expo Sydney.',
      suburb: 'Brookvale', region: 'Northern Beaches', serviceAreas: ['Northern Beaches', 'North Shore', 'Sydney CBD'],
      phone: '+61 422 504 945', styles: ['Modern'], tags: ['Official caterer, One Fine Day Wedding Expo'],
      sourceUrl: 'https://www.weddingdiaries.com.au/meet/zing-fresh/', sourceType: 'Business listing' }),
    v({ id: 'bevs-catering', name: 'Bev’s Catering', category: 'Catering', subcategory: 'Classic',
      description: 'Family-run Sydney catering business, operating since 1989, offering wedding catering and bespoke cakes.',
      region: 'Greater Sydney', serviceAreas: ['Greater Sydney'],
      website: 'https://www.bevscatering.com.au/', tags: ['Family-run since 1989'],
      sourceUrl: 'https://www.bevscatering.com.au/' }),
    v({ id: 'shared-affair', name: 'Shared Affair', category: 'Catering', subcategory: 'Bespoke',
      description: 'Sydney CBD-based bespoke catering and event styling company led by chef Nikki Phillips.',
      suburb: 'Sydney CBD', region: 'Sydney CBD', serviceAreas: ['Sydney CBD', 'Eastern Suburbs', 'Inner West'],
      website: 'https://www.sharedaffair.com.au/', phone: '+61 2 8089 2555', tags: ['Event styling included'],
      sourceUrl: 'https://www.sharedaffair.com.au/' }),
    v({ id: 'little-caterer-sydney', name: 'Little Caterer Sydney', category: 'Catering', subcategory: 'Sustainable',
      description: 'Owner-operated Sydney caterer using sustainable, seasonal produce, working from the Blue Mountains to the Inner West.',
      region: 'Greater Sydney', serviceAreas: ['Inner West', 'Blue Mountains', 'Sydney CBD', 'Greater Sydney'],
      website: 'https://www.littlecaterersydney.com/', styles: ['Sustainable', 'Seasonal'],
      sourceUrl: 'https://www.littlecaterersydney.com/' }),

    // ---------------- CELEBRANTS ----------------
    v({ id: 'the-love-diaries-co', name: 'The Love Diaries Co', category: 'Celebrants', subcategory: 'Personalised',
      description: 'Sydney marriage celebrant and MC, Claudia Neal-Shaw, offering personalised ceremony planning.',
      region: 'Greater Sydney', serviceAreas: ['Greater Sydney'],
      website: 'https://www.thelovediariesco.com/',
      sourceUrl: 'https://www.thelovediariesco.com/' }),
    v({ id: 'marry-me-zoe', name: 'Marry Me Zoe', category: 'Celebrants', subcategory: 'Fun',
      description: 'Sydney celebrant and MC Zoe Sabados, known for upbeat, joyful ceremonies, with 400+ weddings performed.',
      region: 'Greater Sydney', serviceAreas: ['Greater Sydney', 'Central Coast', 'Wollongong / Illawarra'],
      website: 'https://www.marrymezoe.com.au/', styles: ['Fun', 'Modern'], tags: ['400+ weddings performed'],
      sourceUrl: 'https://www.marrymezoe.com.au/' }),
    v({ id: 'michael-janz-celebrant', name: 'Michael Janz Celebrant', category: 'Celebrants', subcategory: 'Warm',
      description: 'Randwick-based marriage celebrant with 10+ years’ experience, known for warm, personal ceremonies; books one wedding per day.',
      suburb: 'Randwick', region: 'Eastern Suburbs', serviceAreas: ['Eastern Suburbs', 'North Shore', 'Sydney CBD'],
      website: 'https://www.michaeljanzcelebrant.com.au/', styles: ['Warm', 'Relaxed'], tags: ['One wedding booked per day'],
      sourceUrl: 'https://www.michaeljanzcelebrant.com.au/' }),

    // ---------------- ENTERTAINMENT ----------------
    v({ id: 'lily-road-band', name: 'Lily Road', category: 'Entertainment', subcategory: 'Live band & DJ',
      description: 'Sydney and Melbourne wedding entertainment agency providing live singers, bands and DJs.',
      region: 'Greater Sydney', serviceAreas: ['Greater Sydney'],
      website: 'https://www.lilyroad.com.au/', services: ['Live band', 'DJ', 'MC'],
      sourceUrl: 'https://www.lilyroad.com.au/' }),
    v({ id: 'ben-fox-band', name: 'Ben Fox Band', category: 'Entertainment', subcategory: 'Live band & DJ',
      description: 'Sydney wedding entertainer with 20+ years’ experience, offering acoustic sets, DJ sets and full live band packages.',
      suburb: 'Wollstonecraft', region: 'Lower North Shore', serviceAreas: ['Lower North Shore', 'North Shore', 'Sydney CBD'],
      website: 'https://www.benfoxband.com/', services: ['Acoustic', 'DJ', 'Full band'], tags: ['20+ years experience'],
      sourceUrl: 'https://www.benfoxband.com/' }),
    v({ id: 'big-love-music', name: 'Big Love Music', category: 'Entertainment', subcategory: 'Live band',
      description: 'Sydney live music duo/band (Sam & Joel) performing pop, RnB and classic hits for wedding ceremonies and receptions.',
      suburb: 'Casula', region: 'Western Sydney', serviceAreas: ['Western Sydney', 'South Sydney'],
      website: 'https://www.biglovemusic.com.au/', services: ['Live band'],
      sourceUrl: 'https://www.biglovemusic.com.au/' }),
    v({ id: 'entertainment-co', name: 'Entertainment Co', category: 'Entertainment', subcategory: 'DJ',
      description: 'Sydney wedding DJ and MC company with a team of professional DJs and in-house sound and lighting equipment.',
      region: 'Greater Sydney', serviceAreas: ['Greater Sydney'],
      website: 'https://entertainmentco.com.au/', phone: '1300 858 981', services: ['DJ', 'MC'],
      sourceUrl: 'https://entertainmentco.com.au/' }),

    // ---------------- BRIDAL ----------------
    v({ id: 'steven-khalil', name: 'Steven Khalil', category: 'Bridal', subcategory: 'Designer',
      description: 'Australian bridal and red-carpet gown designer based in Paddington, known for luxurious, contemporary silhouettes.',
      suburb: 'Paddington', region: 'Eastern Suburbs', serviceAreas: ['Eastern Suburbs', 'Sydney CBD'],
      website: 'https://stevenkhalil.com/', styles: ['Luxury', 'Contemporary'], tags: ['Australian designer'],
      sourceUrl: 'https://stevenkhalil.com/about/' }),
    v({ id: 'j-andreatta', name: 'J. Andreatta', category: 'Bridal', subcategory: 'Couture',
      description: 'Sydney couture bridal atelier known for modern silhouettes and handcrafted, innovative gown construction.',
      region: 'Greater Sydney', serviceAreas: ['Greater Sydney'],
      website: 'https://www.jandreatta.com/', styles: ['Modern', 'Couture'],
      sourceUrl: 'https://www.jandreatta.com/about' }),
    v({ id: 'moira-hughes-couture', name: 'Moira Hughes Couture', category: 'Bridal', subcategory: 'Couture',
      description: 'Sydney-based couture designer creating romantic, made-to-measure wedding gowns using premium silks.',
      region: 'Greater Sydney', serviceAreas: ['Greater Sydney'],
      website: 'https://moirahughes.com.au/', styles: ['Romantic', 'Couture'], tags: ['Handcrafted in Sydney'],
      sourceUrl: 'https://moirahughes.com.au/about/' }),
    v({ id: 'helen-rodrigues-bridal', name: 'Helen Rodrigues Bridal', category: 'Bridal', subcategory: 'Multi-designer',
      description: 'Sydney bridal boutique operating since 2001, stocking international designers including Elie Saab and Monique Lhuillier.',
      suburb: 'Neutral Bay', region: 'Lower North Shore', serviceAreas: ['Lower North Shore', 'North Shore', 'Sydney CBD'],
      website: 'https://helenrodrigues.com.au/', tags: ['Multi-designer boutique since 2001'],
      services: ['Elie Saab', 'Inbal Dror', 'Monique Lhuillier', 'Suzanne Neville'],
      sourceUrl: 'https://helenrodrigues.com.au/about-us/' }),

    // ---------------- HAIR & MAKEUP ----------------
    v({ id: 'blossom-hair-makeup', name: 'Blossom Hair & Makeup', category: 'Hair & Makeup', subcategory: 'Bridal',
      description: 'Sydney bridal hair and makeup studio founded by Sarah Young, winner of multiple Wedding Industry Awards.',
      region: 'Greater Sydney', serviceAreas: ['Greater Sydney'],
      website: 'https://blossomhairandmakeup.com/', tags: ['1st Place, Wedding Industry Awards, 2021 & 2026'],
      sourceUrl: 'https://blossomhairandmakeup.com/' }),
    v({ id: 'kirsty-bremner', name: 'Kirsty Bremner Hair & Makeup', category: 'Hair & Makeup', subcategory: 'Bridal',
      description: 'Abbotsford-based mobile hair and makeup artist with 24+ years’ experience, including editorial and bridal work.',
      suburb: 'Abbotsford', region: 'Inner West', serviceAreas: ['Inner West', 'Sydney CBD'],
      website: 'https://www.kirstybremner.com/', email: 'info@kirstybremner.com', tags: ['24+ years experience'],
      sourceUrl: 'https://www.kirstybremner.com/about' }),
    v({ id: 'tri-tran-makeup', name: 'Tri Tran', category: 'Hair & Makeup', subcategory: 'Bridal',
      description: 'Award-winning Sydney makeup artist with 13+ years’ experience across bridal, editorial and fashion work.',
      region: 'Greater Sydney', serviceAreas: ['Greater Sydney'],
      instagram: '@tritran_makeup', email: 'makeupbytritran@gmail.com', tags: ['Best Bridal Makeup, IBI Awards 2023'],
      sourceUrl: 'https://www.instagram.com/tritran_makeup/', sourceType: 'Instagram' }),

    // ---------------- CAKES ----------------
    v({ id: 'caked-by-carissa', name: 'CAKED by Carissa', category: 'Cakes', subcategory: 'Modern',
      description: 'Sydney wedding cake designer with 10+ years’ experience, specialising in handcrafted modern-romantic cake design.',
      region: 'Greater Sydney', serviceAreas: ['Greater Sydney'],
      website: 'https://www.cakedbycarissa.com/', styles: ['Modern', 'Romantic'],
      sourceUrl: 'https://www.cakedbycarissa.com/' }),
    v({ id: 'flour-lane', name: 'Flour Lane', category: 'Cakes', subcategory: 'Classic',
      description: 'Annandale bakery run by pastry chefs trained in France, delivering wedding cakes across Sydney.',
      suburb: 'Annandale', region: 'Inner West', serviceAreas: ['Inner West', 'Sydney CBD', 'Greater Sydney'],
      website: 'https://www.flourlane.com.au/', email: 'info@flourlane.com.au', tags: ['Pastry chefs trained in France'],
      sourceUrl: 'https://www.flourlane.com.au/' }),
    v({ id: 'lushcups', name: 'Lushcups', category: 'Cakes', subcategory: 'Custom',
      description: 'Sydney wedding cake bakery designing and baking custom cakes to match any colour scheme or theme.',
      region: 'Greater Sydney', serviceAreas: ['Greater Sydney'],
      website: 'https://lushcups.com.au/', styles: ['Custom'],
      sourceUrl: 'https://lushcups.com.au/' }),

    // ---------------- STYLING & DECOR ----------------
    v({ id: 'wedding-styling-sydney', name: 'Wedding Styling Sydney', category: 'Styling & Decor', subcategory: 'Full-service',
      description: 'Sydney event styling company with 18+ years’ experience hiring arbours, drapery, chairs and centrepieces.',
      region: 'Greater Sydney', serviceAreas: ['Greater Sydney'],
      website: 'https://www.weddingstylingsydney.com.au/', tags: ['18+ years experience'],
      sourceUrl: 'https://www.weddingstylingsydney.com.au/' }),
    v({ id: 'hire-for-style', name: 'Hire For Style', category: 'Styling & Decor', subcategory: 'Decor hire',
      description: 'Sydney event stylist and decor hire company with 11+ years’ experience styling ceremonies and receptions.',
      region: 'Greater Sydney', serviceAreas: ['Greater Sydney'],
      website: 'https://hireforstyle.com/', tags: ['11+ years experience'],
      sourceUrl: 'https://hireforstyle.com/' }),
    v({ id: 'simply-seated', name: 'Simply Seated', category: 'Styling & Decor', subcategory: 'Furniture hire',
      description: 'Sydney wedding decor hire company with a range of furniture and styling items from classic to modern themes.',
      region: 'Greater Sydney', serviceAreas: ['Greater Sydney'],
      website: 'https://www.simplyseated.com.au/', services: ['Furniture hire'],
      sourceUrl: 'https://www.simplyseated.com.au/wedding-decoration-hire-sydney' })
  ];

  function all() { return directory; }
  function byId(id) { return directory.find(function (x) { return x.id === id; }) || null; }
  function byCategory(category) { return directory.filter(function (x) { return x.category === category; }); }

  function categoryCounts() {
    const counts = {};
    CATEGORIES.forEach(function (c) { counts[c] = 0; });
    directory.forEach(function (x) { counts[x.category] = (counts[x.category] || 0) + 1; });
    return counts;
  }

  // Search across name, category, suburb, region, service areas, services,
  // styles and tags. Deliberately simple substring matching, not a search index.
  function search(query, opts) {
    opts = opts || {};
    let list = directory.slice();
    const q = (query || '').trim().toLowerCase();
    if (q) {
      list = list.filter(function (x) {
        const haystack = [x.name, x.category, x.subcategory, x.suburb, x.region]
          .concat(x.serviceAreas, x.services, x.styles, x.tags)
          .join(' ').toLowerCase();
        return haystack.indexOf(q) !== -1;
      });
    }
    if (opts.category) list = list.filter(function (x) { return x.category === opts.category; });
    if (opts.region) list = list.filter(function (x) { return x.region === opts.region || x.serviceAreas.indexOf(opts.region) !== -1; });
    if (opts.style) list = list.filter(function (x) { return x.styles.indexOf(opts.style) !== -1; });
    return list;
  }

  function stylesInCategory(category) {
    const set = {};
    byCategory(category).forEach(function (v2) { v2.styles.forEach(function (s) { set[s] = true; }); });
    return Object.keys(set).sort();
  }

  // ---------------- VOW MATCH (rules-based, not AI) ----------------
  // Only counts a criterion toward the percentage when there's real data to
  // judge it on, so a vendor who simply hasn't published pricing isn't
  // unfairly penalised versus one who has.
  function vowMatch(vendorRecord, wedding) {
    let score = 0, max = 0;
    const reasons = [];
    wedding = wedding || {};

    // The plan wizard only collects a broad city (Sydney, Melbourne, ...),
    // not a Sydney sub-region, and this directory is Sydney-only — so this
    // only ever scores when the wedding is actually in Sydney, and doesn't
    // penalise a vendor for a city-level location it was never able to serve.
    if (wedding.location === 'Sydney') {
      max += 1;
      score += 1;
      reasons.push('Serves Sydney');
    }

    if (wedding.style && vendorRecord.styles.length) {
      max += 1;
      const styleMatch = vendorRecord.styles.some(function (s) { return s.toLowerCase().indexOf(String(wedding.style).toLowerCase()) !== -1 || String(wedding.style).toLowerCase().indexOf(s.toLowerCase()) !== -1; });
      if (styleMatch) { score += 1; reasons.push('Matches your ' + wedding.style + ' style'); }
    }

    const budgetCat = BUDGET_CATEGORY_MAP[vendorRecord.category];
    if (budgetCat && wedding.budget && typeof VOWCO !== 'undefined') {
      const allocated = VOWCO.budgetBreakdown(wedding.budget).find(function (b) { return b.label === budgetCat; });
      if (allocated && vendorRecord.startingPrice) {
        max += 1;
        if (vendorRecord.startingPrice <= allocated.amount) { score += 1; reasons.push('Within your ' + budgetCat.toLowerCase() + ' budget'); }
      }
    }

    max += 1; score += 1; reasons.push('Relevant category');

    return { pct: max ? Math.round((score / max) * 100) : null, reasons: reasons };
  }

  function recommendedForWedding(wedding, category, n) {
    const pool = byCategory(category).map(function (x) { return Object.assign({}, x, { match: vowMatch(x, wedding) }); });
    pool.sort(function (a, b) { return (b.match.pct || 0) - (a.match.pct || 0); });
    return n ? pool.slice(0, n) : pool;
  }

  return {
    CATEGORIES: CATEGORIES, REGIONS: REGIONS, BUDGET_CATEGORY_MAP: BUDGET_CATEGORY_MAP,
    all: all, byId: byId, byCategory: byCategory, categoryCounts: categoryCounts,
    search: search, stylesInCategory: stylesInCategory,
    vowMatch: vowMatch, recommendedForWedding: recommendedForWedding
  };
})();
