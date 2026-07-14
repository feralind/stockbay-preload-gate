// @ts-check
/**
 * Lifestyle & Estate Assets — late-game houses, cars, yachts, islands.
 * Mechanical: HELOC-style credit, equity cash-out, margin resilience, passive income/upkeep.
 * Cosmetic luxuries in luxury.js stay separate prestige sinks.
 */

import { getSpendableCash } from './portfolio.js';

/**
 * @typedef {'residences' | 'penthouses' | 'cars' | 'yachts' | 'islands'} EstateCategoryId
 */

/**
 * @typedef {{
 *   id: EstateCategoryId,
 *   name: string,
 *   subtitle: string,
 *   tier: 1 | 2 | 3 | 4,
 *   tierLabel: string,
 *   layout: 'hero' | 'tall' | 'wide' | 'feature',
 *   blurb: string,
 *   imagePlaceholder: string,
 *   imageFuturePath: string,
 *   // Both fields are identical local assets/estates/*.png paths (offline).
 *   imageAlt: string,
 *   requiresCategory: EstateCategoryId | null,
 * }} EstateCategory
 */

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   category: EstateCategoryId,
 *   tier: 1 | 2 | 3 | 4,
 *   tierLabel: string,
 *   price: number,
 *   minNet: number,
 *   minRep: number,
 *   blurb: string,
 *   flair: string | null,
 *   creditLtv: number,
 *   resilience: number,
 *   incomePerDay: number,
 *   upkeepPerDay: number,
 *   beds: number | null,
 *   baths: number | null,
 *   sqft: number | null,
 *   built: number | null,
 *   specs: string[] | null,
 *   vaultPrestige: { repPerClose: number, dailyCap: number } | null,
 *   imagePlaceholder: string,
 *   imageFuturePath: string,
 *   // Both fields are identical local assets/estates/*.png paths (offline).
 *   imageAlt: string,
 *   requiresCategory: EstateCategoryId | null,
 * }} EstateAsset
 */

/** Days between equity cash-out actions. */
export const ESTATE_CASHOUT_COOLDOWN_DAYS = 30;
/** Daily interest on drawn property credit (~14.6% APR). */
export const ESTATE_CREDIT_DAILY_RATE = 0.0004;
/** Soft cap for resilience rating display / effects. */
export const ESTATE_RESILIENCE_CAP = 100;

/** Bust cache for packaged local PNGs under assets/estates/ (offline-safe). */
export const ESTATE_MEDIA_VER = 8;

/**
 * Local-only estate media paths (no remote CDN).
 * @param {string} file basename or assets/estates/... path
 */
export function estateLocalMedia(file) {
  const base = String(file || '')
    .replace(/^assets\/estates\//, '')
    .split('?')[0]
    .replace(/^\/+/, '');
  const src = `assets/estates/${base}?v=${ESTATE_MEDIA_VER}`;
  return { imagePlaceholder: src, imageFuturePath: src };
}

/** @type {EstateCategory[]} */
export const ESTATE_CATEGORIES = [
  {
    id: 'residences',
    name: 'Residences',
    subtitle: 'Coastal & villas',
    tier: 1,
    tierLabel: 'Foundation',
    layout: 'hero',
    blurb: 'First real equity base — unlock the property credit line.',
    ...estateLocalMedia('cat-residences.png'),
    imageAlt: 'Cliffside coastal villa at golden hour overlooking the ocean',
    requiresCategory: null,
  },
  {
    id: 'penthouses',
    name: 'Penthouses',
    subtitle: 'Skyline living',
    tier: 2,
    tierLabel: 'Status',
    layout: 'tall',
    blurb: 'High-floor collateral and stronger margin resilience.',
    ...estateLocalMedia('cat-penthouses.png'),
    imageAlt: 'Night skyline view from a glass penthouse terrace',
    requiresCategory: 'residences',
  },
  {
    id: 'yachts',
    name: 'Yachts',
    subtitle: 'Private fleet',
    tier: 3,
    tierLabel: 'Power',
    layout: 'tall',
    blurb: 'Late-game cushion with vault-grade Desk Prestige.',
    ...estateLocalMedia('cat-yachts.png'),
    imageAlt: 'White luxury yacht on turquoise water at sunset',
    requiresCategory: 'penthouses',
  },
  {
    id: 'cars',
    name: 'Garage',
    subtitle: 'Performance fleet',
    tier: 2,
    tierLabel: 'Status',
    layout: 'wide',
    blurb: 'Prestige garage — thinner credit lines, light upkeep.',
    ...estateLocalMedia('cat-cars.png'),
    imageAlt: 'Matte black supercar under studio spotlight',
    requiresCategory: 'residences',
  },
  {
    id: 'islands',
    name: 'Islands',
    subtitle: 'Ultimate estate',
    tier: 4,
    tierLabel: 'Ultimate',
    layout: 'feature',
    blurb: 'Endgame resilience and fortress credit — empire upkeep.',
    ...estateLocalMedia('cat-islands.png'),
    imageAlt: 'Aerial view of a private island with white-sand bays',
    requiresCategory: 'yachts',
  },
];

/**
 * @param {Partial<EstateAsset> & {
 *   id: string,
 *   name: string,
 *   category: EstateCategoryId,
 *   price: number,
 *   blurb: string,
 *   imageAlt: string,
 * }} spec
 * @returns {EstateAsset}
 */
function asset(spec) {
  const cat = ESTATE_CATEGORIES.find((c) => c.id === spec.category);
  const slug = spec.id.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');
  return {
    tier: cat?.tier || 1,
    tierLabel: cat?.tierLabel || 'Foundation',
    minNet: 0,
    minRep: 0,
    flair: null,
    creditLtv: 0.4,
    resilience: 5,
    incomePerDay: 0,
    upkeepPerDay: 50,
    beds: null,
    baths: null,
    sqft: null,
    built: null,
    specs: null,
    vaultPrestige: null,
    ...estateLocalMedia(`${slug}.png`),
    requiresCategory: cat?.requiresCategory ?? null,
    ...spec,
  };
}

/** @type {EstateAsset[]} */
export const ESTATE_ASSETS = [
  /* ── Residences (4+) ── */
  asset({
    id: 'coastalResidence',
    name: 'Coastal Residence',
    category: 'residences',
    price: 125_000,
    minNet: 100_000,
    minRep: 80,
    beds: 2,
    baths: 1,
    sqft: 1100,
    built: 2005,
    blurb: 'Modest waterfront home. First real equity base — unlocks a property credit line.',
    flair: 'Coastal Desk',
    creditLtv: 0.5,
    resilience: 8,
    incomePerDay: 85,
    upkeepPerDay: 45,
    ...estateLocalMedia('coastal-residence.png'),
    imageAlt: 'Weathered coastal beach house on stilts at the ocean shoreline',
  }),
  asset({
    id: 'harborVilla',
    name: 'Harbor Villa',
    category: 'residences',
    price: 210_000,
    minNet: 160_000,
    minRep: 100,
    beds: 3,
    baths: 2,
    sqft: 1650,
    built: 2010,
    blurb: 'White stucco villa with private slip access. Quiet rental income.',
    flair: 'Harbor Villa',
    creditLtv: 0.48,
    resilience: 9,
    incomePerDay: 120,
    upkeepPerDay: 70,
    ...estateLocalMedia('harbor-villa.png'),
    imageAlt: 'Light waterfront villa with white deck on a calm harbor canal',
  }),
  asset({
    id: 'cliffsideRetreat',
    name: 'Cliffside Retreat',
    category: 'residences',
    price: 320_000,
    minNet: 250_000,
    minRep: 140,
    beds: 3,
    baths: 2.5,
    sqft: 2100,
    built: 2015,
    blurb: 'Glass-walled cliff home. Stronger collateral, higher upkeep.',
    flair: 'Cliffside',
    creditLtv: 0.46,
    resilience: 10,
    incomePerDay: 160,
    upkeepPerDay: 110,
    ...estateLocalMedia('cliffside-retreat.png'),
    imageAlt: 'Modern glass-walled coastal house overlooking a rocky shoreline',
  }),
  asset({
    id: 'lakesideCompound',
    name: 'Lakeside Compound',
    category: 'residences',
    price: 480_000,
    minNet: 380_000,
    minRep: 180,
    beds: 5,
    baths: 4,
    sqft: 3400,
    built: 2020,
    blurb: 'Multi-wing lake estate. Foundation-tier peak equity and cushion.',
    flair: 'Lakeside',
    creditLtv: 0.45,
    resilience: 12,
    incomePerDay: 220,
    upkeepPerDay: 150,
    ...estateLocalMedia('lakeside-compound.png'),
    imageAlt: 'Modern multi-level lakeside estate with private wooden dock',
  }),

  /* ── Penthouses (4+) ── */
  asset({
    id: 'skylinePenthouse',
    name: 'Skyline Penthouse',
    category: 'penthouses',
    price: 2_500_000,
    minNet: 1_000_000,
    minRep: 300,
    beds: 3,
    baths: 3,
    sqft: 2800,
    built: 2016,
    blurb: 'High-floor night skyline. Serious collateral and rental income.',
    flair: 'Skyline Owner',
    creditLtv: 0.45,
    resilience: 15,
    incomePerDay: 900,
    upkeepPerDay: 600,
    ...estateLocalMedia('skyline-penthouse.png'),
    imageAlt: 'Lower Manhattan skyline at twilight across the river',
  }),
  asset({
    id: 'auroraAerie',
    name: 'Aurora Aerie',
    category: 'penthouses',
    price: 3_200_000,
    minNet: 1_400_000,
    minRep: 360,
    beds: 3,
    baths: 3.5,
    sqft: 3400,
    built: 2017,
    blurb: 'Corner aerie with wraparound glass. Higher LTV cushion.',
    flair: 'Aurora Aerie',
    creditLtv: 0.44,
    resilience: 17,
    incomePerDay: 1_150,
    upkeepPerDay: 750,
    ...estateLocalMedia('aurora-aerie.png'),
    imageAlt: 'Open-plan luxury living suite with floor-to-ceiling glass and deck',
  }),
  asset({
    id: 'spireCrown',
    name: 'Spire Crown',
    category: 'penthouses',
    price: 4_800_000,
    minNet: 2_200_000,
    minRep: 450,
    beds: 4,
    baths: 4,
    sqft: 4200,
    built: 2019,
    blurb: 'Top-of-spire residence. Prestige collateral for late mid-game.',
    flair: 'Spire Crown',
    creditLtv: 0.42,
    resilience: 20,
    incomePerDay: 1_700,
    upkeepPerDay: 1_100,
    ...estateLocalMedia('spire-crown.png'),
    imageAlt: 'Night city skyline with lit towers and a landmark spire',
  }),
  asset({
    id: 'nexusTowerSuite',
    name: 'Nexus Tower Suite',
    category: 'penthouses',
    price: 6_500_000,
    minNet: 3_500_000,
    minRep: 520,
    beds: 5,
    baths: 5,
    sqft: 6100,
    built: 2021,
    blurb: 'Full-floor suite in the financial district. Peak penthouse resilience.',
    flair: 'Nexus Suite',
    creditLtv: 0.4,
    resilience: 24,
    incomePerDay: 2_300,
    upkeepPerDay: 1_500,
    ...estateLocalMedia('nexus-tower-suite.png'),
    imageAlt: 'Full-floor modern tower suite corridor with glass offices and lounge',
  }),

  /* ── Cars (10+) ── */
  asset({
    id: 'performanceGt',
    name: 'Shadow GT',
    category: 'cars',
    price: 450_000,
    minNet: 400_000,
    minRep: 200,
    specs: ['620 hp', '2 seats', '2021'],
    blurb: 'Stealth black GT at speed. Prestige flex with a thinner credit line.',
    flair: 'Garage Royalty',
    creditLtv: 0.3,
    resilience: 4,
    incomePerDay: 0,
    upkeepPerDay: 120,
    ...estateLocalMedia('performance-gt.png'),
    imageAlt: 'Gloss black performance GT coupe blasting down a highway',
  }),
  asset({
    id: 'velvetCoupe',
    name: 'Velvet Grand',
    category: 'cars',
    price: 285_000,
    minNet: 350_000,
    minRep: 180,
    specs: ['550 hp', '4 seats', '2020'],
    blurb: 'Four-door grand tourer. Quiet entry into the garage.',
    creditLtv: 0.28,
    resilience: 3,
    upkeepPerDay: 95,
    ...estateLocalMedia('velvet-coupe.png'),
    imageAlt: 'Black four-door grand-touring sedan on the highway at dusk',
  }),
  asset({
    id: 'midnightSpider',
    name: 'Midnight Spider',
    category: 'cars',
    price: 540_000,
    minNet: 460_000,
    minRep: 225,
    specs: ['650 hp', '2 seats', '2022'],
    blurb: 'Open-top night runner. Light resilience bump.',
    flair: 'Midnight Spider',
    creditLtv: 0.29,
    resilience: 4,
    upkeepPerDay: 145,
    ...estateLocalMedia('midnight-spider.png'),
    imageAlt: 'Matte black open-top spider supercar on a city street at night',
  }),
  asset({
    id: 'carbonRs',
    name: 'Cobalt RS',
    category: 'cars',
    price: 675_000,
    minNet: 550_000,
    minRep: 250,
    specs: ['650 hp', '2 seats', '2019'],
    blurb: 'Desert muscle with a carbon-look hood. Garage status step-up.',
    creditLtv: 0.27,
    resilience: 5,
    upkeepPerDay: 165,
    ...estateLocalMedia('carbon-rs.png'),
    imageAlt: 'Metallic blue muscle coupe with carbon-look hood on a desert road',
  }),
  asset({
    id: 'obsidianHyper',
    name: 'Obsidian Stealth',
    category: 'cars',
    price: 820_000,
    minNet: 700_000,
    minRep: 290,
    specs: ['620 hp', '2 seats', '2020'],
    blurb: 'Matte mid-engine coupe. Thin LTV, loud presence.',
    flair: 'Obsidian Stealth',
    creditLtv: 0.25,
    resilience: 5,
    upkeepPerDay: 195,
    ...estateLocalMedia('obsidian-hyper.png'),
    imageAlt: 'Dark gunmetal mid-engine exotic coupe with red deep-dish wheels against a light wall',
  }),
  asset({
    id: 'silverArrowEv',
    name: 'Ember GT',
    category: 'cars',
    price: 175_000,
    minNet: 320_000,
    minRep: 160,
    specs: ['577 hp', '2 seats', '2019'],
    blurb: 'Orange V8 grand tourer. Lowest garage upkeep.',
    creditLtv: 0.32,
    resilience: 2,
    upkeepPerDay: 55,
    ...estateLocalMedia('silver-arrow-ev.png'),
    imageAlt: 'Gloss orange V8 sports coupe with black roof parked against green trees',
  }),
  asset({
    id: 'royalTourer',
    name: 'Royal Chrome',
    category: 'cars',
    price: 395_000,
    minNet: 420_000,
    minRep: 210,
    specs: ['180 hp', '5 seats', '1930'],
    blurb: 'Two-tone chrome classic. Prestige without track drama.',
    flair: 'Royal Chrome',
    creditLtv: 0.3,
    resilience: 4,
    upkeepPerDay: 125,
    ...estateLocalMedia('royal-tourer.png'),
    imageAlt: 'Two-tone pale blue and black classic luxury tourer with chrome grille before a brick manor',
  }),
  asset({
    id: 'apexRoadster',
    name: 'Apex Speedster',
    category: 'cars',
    price: 920_000,
    minNet: 780_000,
    minRep: 305,
    specs: ['641 hp', '2 seats', '2009'],
    blurb: 'Ultra-rare open speedster. Mid-garage resilience bump.',
    flair: 'Apex Speedster',
    creditLtv: 0.26,
    resilience: 5,
    upkeepPerDay: 205,
    ...estateLocalMedia('apex-roadster.png'),
    imageAlt: 'Gloss black open speedster with roll hoops at a golden-hour prestige gathering',
  }),
  asset({
    id: 'ghostLimousine',
    name: 'Ghost Executive',
    category: 'cars',
    price: 615_000,
    minNet: 580_000,
    minRep: 260,
    specs: ['500 hp', '4 seats', '2019'],
    blurb: 'Long white executive sedan. Slightly better credit LTV.',
    creditLtv: 0.33,
    resilience: 4,
    upkeepPerDay: 185,
    ...estateLocalMedia('ghost-limousine.png'),
    imageAlt: 'White ultra-luxury executive sedan with tall chrome grille in a city alley',
  }),
  asset({
    id: 'titaniumGt3',
    name: 'Titanium Wing',
    category: 'cars',
    price: 1_050_000,
    minNet: 880_000,
    minRep: 315,
    specs: ['755 hp', '2 seats', '2019'],
    blurb: 'Race-wing exotic coupe. Peak garage flex.',
    flair: 'Titanium Wing',
    creditLtv: 0.26,
    resilience: 6,
    upkeepPerDay: 230,
    ...estateLocalMedia('titanium-gt3.png'),
    imageAlt: 'Orange exotic hypercar with fixed rear wing speeding across a bridge',
  }),

  /* ── Yachts (4+) ── */
  asset({
    id: 'privateYachtAurora',
    name: 'Private Yacht Aurora',
    category: 'yachts',
    price: 12_000_000,
    minNet: 8_000_000,
    minRep: 700,
    specs: ['180 ft', '8 cabins', '2019'],
    blurb: 'Flagship Aurora. Late-game cushion and vault-grade Desk Prestige.',
    flair: 'Aurora Fleet',
    creditLtv: 0.35,
    resilience: 25,
    incomePerDay: 1_200,
    upkeepPerDay: 2_000,
    vaultPrestige: { repPerClose: 1, dailyCap: 1 },
    ...estateLocalMedia('private-yacht-aurora.png'),
    imageAlt: 'Elegant multi-deck motor yacht with dark hull on open blue water',
  }),
  asset({
    id: 'sloopMeridian',
    name: 'Sloop Meridian',
    category: 'yachts',
    price: 6_500_000,
    minNet: 5_500_000,
    minRep: 580,
    specs: ['110 ft', '4 cabins', '2017'],
    blurb: 'Entry megayacht. Lower prestige, real resilience.',
    flair: 'Meridian',
    creditLtv: 0.38,
    resilience: 18,
    incomePerDay: 650,
    upkeepPerDay: 1_100,
    vaultPrestige: { repPerClose: 1, dailyCap: 1 },
    ...estateLocalMedia('sloop-meridian.png'),
    imageAlt: 'White sailing yacht with full sails on deep blue ocean',
  }),
  asset({
    id: 'catamaranSolstice',
    name: 'Catamaran Solstice',
    category: 'yachts',
    price: 9_200_000,
    minNet: 7_000_000,
    minRep: 640,
    specs: ['140 ft', '6 cabins', '2020'],
    blurb: 'Twin-hull explorer. Charter income with heavy upkeep.',
    creditLtv: 0.37,
    resilience: 21,
    incomePerDay: 900,
    upkeepPerDay: 1_500,
    vaultPrestige: { repPerClose: 1, dailyCap: 1 },
    ...estateLocalMedia('catamaran-solstice.png'),
    imageAlt: 'Aerial twin-hull sailing catamaran docked in clear turquoise water',
  }),
  asset({
    id: 'superyachtVesper',
    name: 'Superyacht Vesper',
    category: 'yachts',
    price: 18_000_000,
    minNet: 12_000_000,
    minRep: 850,
    specs: ['240 ft', '12 cabins', '2022'],
    blurb: 'Fleet crown before islands. Peak yacht prestige.',
    flair: 'Vesper Fleet',
    creditLtv: 0.33,
    resilience: 30,
    incomePerDay: 1_800,
    upkeepPerDay: 3_000,
    vaultPrestige: { repPerClose: 2, dailyCap: 2 },
    ...estateLocalMedia('superyacht-vesper.png'),
    imageAlt: 'Massive multi-deck megayacht with bow and aft helipads on open water',
  }),

  /* ── Islands (4+) ── */
  asset({
    id: 'privateIslandElysium',
    name: 'Private Island Elysium',
    category: 'islands',
    price: 80_000_000,
    minNet: 50_000_000,
    minRep: 1_500,
    specs: ['420 acres', '3 villas', 'helipad'],
    blurb: 'Flagship Elysium. Endgame resilience and crown Desk Prestige.',
    flair: 'Elysium',
    creditLtv: 0.4,
    resilience: 40,
    incomePerDay: 8_000,
    upkeepPerDay: 12_000,
    vaultPrestige: { repPerClose: 2, dailyCap: 2 },
    ...estateLocalMedia('private-island-elysium.png'),
    imageAlt: 'Tropical private island villa compound with pool and mountain backdrop',
  }),
  asset({
    id: 'isleCitrine',
    name: 'Isle Citrine',
    category: 'islands',
    price: 45_000_000,
    minNet: 32_000_000,
    minRep: 1_200,
    specs: ['180 acres', '1 villa', 'private dock'],
    blurb: 'Entry private cay. Real fortress credit without full empire tax.',
    flair: 'Isle Citrine',
    creditLtv: 0.42,
    resilience: 30,
    incomePerDay: 4_500,
    upkeepPerDay: 6_500,
    vaultPrestige: { repPerClose: 1, dailyCap: 1 },
    ...estateLocalMedia('isle-citrine.png'),
    imageAlt: 'Small private cay pier with lit villa pavilion over turquoise water',
  }),
  asset({
    id: 'atollMirage',
    name: 'Atoll Mirage',
    category: 'islands',
    price: 62_000_000,
    minNet: 42_000_000,
    minRep: 1_350,
    specs: ['290 acres', '2 villas', 'research lab'],
    blurb: 'Ring atoll with research villa. Strong passive income.',
    creditLtv: 0.41,
    resilience: 34,
    incomePerDay: 6_000,
    upkeepPerDay: 8_800,
    vaultPrestige: { repPerClose: 1, dailyCap: 1 },
    ...estateLocalMedia('atoll-mirage.png'),
    imageAlt: 'Aerial overwater villa walkway across a turquoise atoll lagoon',
  }),
  asset({
    id: 'archipelagoSovereign',
    name: 'Archipelago Sovereign',
    category: 'islands',
    price: 110_000_000,
    minNet: 75_000_000,
    minRep: 1_800,
    specs: ['980 acres', '6 villas', 'airstrip'],
    blurb: 'Multi-island holding. Absolute endgame equity and prestige.',
    flair: 'Sovereign Isles',
    creditLtv: 0.38,
    resilience: 48,
    incomePerDay: 11_000,
    upkeepPerDay: 16_500,
    vaultPrestige: { repPerClose: 2, dailyCap: 2 },
    ...estateLocalMedia('archipelago-sovereign.png'),
    imageAlt: 'Aerial tropical island holding with villas, lagoon, and distant landmasses',
  }),
];

export const KNOWN_ESTATE_IDS = new Set(ESTATE_ASSETS.map((a) => a.id));
const ESTATE_BY_ID = new Map(ESTATE_ASSETS.map((a) => [a.id, a]));
export const ESTATE_COST_BY_ID = new Map(ESTATE_ASSETS.map((a) => [a.id, a.price]));
const CATEGORY_BY_ID = new Map(ESTATE_CATEGORIES.map((c) => [c.id, c]));

/**
 * @param {string} id
 * @returns {EstateAsset | null}
 */
export function getEstateAsset(id) {
  return ESTATE_BY_ID.get(id) || null;
}

/**
 * @param {string} id
 * @returns {EstateCategory | null}
 */
export function getEstateCategory(id) {
  return CATEGORY_BY_ID.get(/** @type {EstateCategoryId} */ (id)) || null;
}

/**
 * @param {EstateCategoryId} categoryId
 * @returns {EstateAsset[]}
 */
export function getEstatesByCategory(categoryId) {
  return ESTATE_ASSETS.filter((a) => a.category === categoryId);
}

/**
 * @param {{ estateOwned?: string[] }} [state]
 * @param {EstateCategoryId} categoryId
 */
export function ownsEstateCategory(state = {}, categoryId) {
  const owned = new Set(Array.isArray(state.estateOwned) ? state.estateOwned : []);
  return ESTATE_ASSETS.some((a) => a.category === categoryId && owned.has(a.id));
}

/**
 * @param {{ estateOwned?: string[] }} [state]
 * @returns {EstateAsset[]}
 */
export function getOwnedEstates(state = {}) {
  const owned = new Set(Array.isArray(state.estateOwned) ? state.estateOwned : []);
  return ESTATE_ASSETS.filter((a) => owned.has(a.id));
}

/**
 * Owned catalog price sum per Estates category (book value before cash-out haircut).
 * Order matches ESTATE_CATEGORIES (Residences → Penthouses → Yachts → Garage → Islands).
 * @param {{ estateOwned?: string[] }} [state]
 * @returns {{ id: EstateCategoryId, name: string, value: number }[]}
 */
export function getEstateCategoryBookValues(state = {}) {
  /** @type {Map<string, number>} */
  const sums = new Map(ESTATE_CATEGORIES.map((c) => [c.id, 0]));
  for (const asset of getOwnedEstates(state)) {
    const prev = sums.get(asset.category) || 0;
    sums.set(asset.category, prev + (Number(asset.price) || 0));
  }
  return ESTATE_CATEGORIES.map((cat) => ({
    id: /** @type {EstateCategoryId} */ (cat.id),
    name: cat.name,
    value: sums.get(cat.id) || 0,
  }));
}

/**
 * @param {{ estateOwned?: string[] }} [state]
 * @returns {EstateAsset | null}
 */
export function getHighestOwnedEstate(state = {}) {
  let best = null;
  for (const asset of getOwnedEstates(state)) best = asset;
  return best;
}

/**
 * Recalculate derived estate fields from ownership + credit/cash-out history.
 * @param {object} state
 */
export function syncEstateDerived(state) {
  const owned = getOwnedEstates(state);
  let equityBase = 0;
  let income = 0;
  let upkeep = 0;
  let resilience = 0;
  let creditMax = 0;
  for (const asset of owned) {
    equityBase += asset.price;
    income += asset.incomePerDay;
    upkeep += asset.upkeepPerDay;
    resilience += asset.resilience;
    creditMax += asset.price * asset.creditLtv;
  }
  const extracted = Math.max(0, Number(state.estateEquityExtracted) || 0);
  const creditUsed = Math.max(0, Number(state.estateCreditUsed) || 0);
  state.estateEquity = Math.max(0, Math.round(equityBase - extracted));
  state.estateIncomePerDay = Math.round(income * 100) / 100;
  state.estateUpkeepPerDay = Math.round(upkeep * 100) / 100;
  state.resilienceRating = Math.min(ESTATE_RESILIENCE_CAP, Math.max(0, Math.round(resilience)));
  state.estateCreditMax = Math.max(0, Math.round(creditMax));
  if (creditUsed > state.estateCreditMax) {
    state.estateCreditUsed = state.estateCreditMax;
  }
  return state;
}

/**
 * @param {object} [state]
 */
export function getEstateCreditMax(state = {}) {
  syncEstateDerived(state);
  return Math.max(0, Number(state.estateCreditMax) || 0);
}

/**
 * @param {object} [state]
 */
export function getEstateCreditAvailable(state = {}) {
  const max = getEstateCreditMax(state);
  const used = Math.max(0, Number(state.estateCreditUsed) || 0);
  return Math.max(0, max - used);
}

/**
 * @param {object} [state]
 */
export function getEstateNetIncomePerDay(state = {}) {
  syncEstateDerived(state);
  return (Number(state.estateIncomePerDay) || 0) - (Number(state.estateUpkeepPerDay) || 0);
}

/**
 * Extra margin-call grace minutes from resilience (0–20).
 * @param {object} [state]
 */
export function getEstateGraceBonus(state = {}) {
  const rating = Math.max(0, Math.min(ESTATE_RESILIENCE_CAP, Number(state.resilienceRating) || 0));
  return Math.floor(rating / 5);
}

/**
 * Liquidation aggressiveness multiplier (1 = normal, lower = softer).
 * @param {object} [state]
 */
export function getEstateLiquidationScale(state = {}) {
  const rating = Math.max(0, Math.min(ESTATE_RESILIENCE_CAP, Number(state.resilienceRating) || 0));
  return Math.max(0.55, 1 - rating / 250);
}

/**
 * Passive Desk Prestige from yacht / island ownership.
 * @param {object} [state]
 */
export function getEstatePrestigeAura(state = {}) {
  let repPerClose = 0;
  let dailyCap = 0;
  /** @type {Array<{ id: string, name: string, repPerClose: number, dailyCap: number }>} */
  const items = [];
  for (const asset of getOwnedEstates(state)) {
    const bonus = asset.vaultPrestige;
    if (!bonus) continue;
    const rpc = Math.max(0, Math.floor(Number(bonus.repPerClose) || 0));
    const cap = Math.max(0, Math.floor(Number(bonus.dailyCap) || 0));
    if (!rpc && !cap) continue;
    repPerClose += rpc;
    dailyCap += cap;
    items.push({ id: asset.id, name: asset.name, repPerClose: rpc, dailyCap: cap });
  }
  return {
    repPerClose: Math.min(5, repPerClose),
    dailyCap: Math.min(6, dailyCap),
    items,
    summary: items.length
      ? `Estate prestige +${Math.min(5, repPerClose)} REP/close (cap ${Math.min(6, dailyCap)}/day)`
      : 'No estate prestige',
  };
}

/**
 * @param {object} state
 */
export function getEstateCashOutQuote(state) {
  syncEstateDerived(state);
  const equity = Math.max(0, Number(state.estateEquity) || 0);
  const creditUsed = Math.max(0, Number(state.estateCreditUsed) || 0);
  const freeEquity = Math.max(0, equity - creditUsed);
  if (freeEquity < 1000) {
    return { ok: false, reason: 'Not enough free equity', amount: 0, freeEquity, pct: 0 };
  }
  const count = Math.max(0, Math.floor(Number(state.estateCashOutCount) || 0));
  const pct = count === 0 ? 0.25 : count === 1 ? 0.15 : 0.1;
  const amount = Math.floor(freeEquity * pct);
  if (amount < 500) {
    return { ok: false, reason: 'Cash-out too small', amount: 0, freeEquity, pct };
  }
  const lastDay = state.estateLastCashOutDay != null
    ? Math.floor(Number(state.estateLastCashOutDay) || 0)
    : null;
  return {
    ok: true,
    amount,
    freeEquity,
    pct,
    lastDay,
    cooldownDays: ESTATE_CASHOUT_COOLDOWN_DAYS,
  };
}

/**
 * @param {object} state
 * @param {string} assetId
 * @param {{ netWorth?: number }} [ctx]
 */
export function canPurchaseEstate(state, assetId, ctx = {}) {
  const asset = getEstateAsset(assetId);
  if (!asset) return { ok: false, reason: 'Unknown estate', code: 'unknown' };
  const owned = new Set(Array.isArray(state.estateOwned) ? state.estateOwned : []);
  if (owned.has(asset.id)) return { ok: false, reason: 'Already owned', code: 'owned' };
  if (asset.requiresCategory && !ownsEstateCategory(state, asset.requiresCategory)) {
    const need = getEstateCategory(asset.requiresCategory);
    return {
      ok: false,
      reason: `Requires a ${need?.name || asset.requiresCategory} first`,
      code: 'prereq',
    };
  }
  const nw = Math.max(0, Number(ctx.netWorth) || 0);
  const rep = Math.max(0, Math.floor(Number(state.meta?.reputation) || 0));
  if (nw < asset.minNet) {
    return { ok: false, reason: `Need ${asset.minNet.toLocaleString()} Net Worth`, code: 'net' };
  }
  if (rep < asset.minRep) {
    return { ok: false, reason: `Requires ${asset.minRep} REP`, code: 'rep' };
  }
  const cash = getSpendableCash(state.portfolio || { cash: 0 });
  if (cash < asset.price) return { ok: false, reason: 'Insufficient cash', code: 'cash' };
  return { ok: true, asset };
}

/**
 * @param {object} state
 * @param {string} assetId
 * @param {{ netWorth?: number }} [ctx]
 */
export function purchaseEstate(state, assetId, ctx = {}) {
  const gate = canPurchaseEstate(state, assetId, ctx);
  if (!gate.ok) return { ok: false, msg: gate.reason, code: gate.code };
  const asset = gate.asset;
  state.portfolio.cash -= asset.price;
  if (!Array.isArray(state.estateOwned)) state.estateOwned = [];
  state.estateOwned.push(asset.id);
  state.estateSpentTotal = Math.max(0, Number(state.estateSpentTotal) || 0) + asset.price;
  if (asset.flair) {
    if (!state.meta || typeof state.meta !== 'object') state.meta = {};
    state.meta.estateFlair = String(asset.flair).slice(0, 40);
  }
  syncEstateDerived(state);
  return { ok: true, asset, spent: asset.price };
}

/**
 * @param {object} state
 * @param {number} amount
 */
export function drawEstateCredit(state, amount) {
  syncEstateDerived(state);
  const want = Math.floor(Number(amount) || 0);
  if (!(want > 0)) return { ok: false, msg: 'Enter a positive amount', code: 'amount' };
  const available = getEstateCreditAvailable(state);
  if (available <= 0) return { ok: false, msg: 'No property credit available', code: 'none' };
  if (want > available) return { ok: false, msg: `Max available ${available.toLocaleString()}`, code: 'limit' };
  state.estateCreditUsed = Math.max(0, Number(state.estateCreditUsed) || 0) + want;
  state.portfolio.cash = (Number(state.portfolio.cash) || 0) + want;
  syncEstateDerived(state);
  return { ok: true, drawn: want, used: state.estateCreditUsed, available: getEstateCreditAvailable(state) };
}

/**
 * @param {object} state
 * @param {number} amount
 */
export function repayEstateCredit(state, amount) {
  const used = Math.max(0, Number(state.estateCreditUsed) || 0);
  if (!(used > 0)) return { ok: false, msg: 'No property credit drawn', code: 'none' };
  const want = Math.floor(Number(amount) || 0);
  if (!(want > 0)) return { ok: false, msg: 'Enter a positive amount', code: 'amount' };
  const cash = getSpendableCash(state.portfolio || { cash: 0 });
  const pay = Math.min(want, used, cash);
  if (!(pay > 0)) return { ok: false, msg: 'Insufficient cash', code: 'cash' };
  state.portfolio.cash -= pay;
  state.estateCreditUsed = Math.round((used - pay) * 100) / 100;
  if (state.estateCreditUsed < 0.5) state.estateCreditUsed = 0;
  syncEstateDerived(state);
  return { ok: true, paid: pay, remaining: state.estateCreditUsed };
}

/**
 * @param {object} state
 * @param {number} currentDay
 */
export function cashOutEstateEquity(state, currentDay) {
  const day = Math.max(1, Math.floor(Number(currentDay) || 1));
  const quote = getEstateCashOutQuote(state);
  if (!quote.ok) return { ok: false, msg: quote.reason, code: 'equity' };
  if (quote.lastDay != null && day - quote.lastDay < ESTATE_CASHOUT_COOLDOWN_DAYS) {
    const left = ESTATE_CASHOUT_COOLDOWN_DAYS - (day - quote.lastDay);
    return { ok: false, msg: `Cash-out cools down in ${left} day${left === 1 ? '' : 's'}`, code: 'cooldown' };
  }
  const amount = quote.amount;
  state.portfolio.cash = (Number(state.portfolio.cash) || 0) + amount;
  state.estateEquityExtracted = Math.max(0, Number(state.estateEquityExtracted) || 0) + amount;
  state.estateLastCashOutDay = day;
  state.estateCashOutCount = Math.max(0, Math.floor(Number(state.estateCashOutCount) || 0)) + 1;
  syncEstateDerived(state);
  return { ok: true, amount, equityLeft: state.estateEquity, count: state.estateCashOutCount };
}

/**
 * @param {object} state
 * @returns {{ netIncome: number, creditInterest: number, events: object[] }}
 */
export function processDailyEstates(state) {
  syncEstateDerived(state);
  const events = [];
  const netIncome = getEstateNetIncomePerDay(state);
  if (netIncome !== 0 && (state.estateOwned || []).length) {
    state.portfolio.cash = (Number(state.portfolio.cash) || 0) + netIncome;
    events.push({
      type: netIncome >= 0 ? 'estate_income' : 'estate_upkeep',
      msg: netIncome >= 0
        ? `Estate net income $${netIncome.toFixed(2)}`
        : `Estate upkeep net −$${Math.abs(netIncome).toFixed(2)}`,
      amount: netIncome,
    });
  }

  let creditInterest = 0;
  const used = Math.max(0, Number(state.estateCreditUsed) || 0);
  if (used > 0) {
    creditInterest = Math.round(used * ESTATE_CREDIT_DAILY_RATE * 100) / 100;
    if (creditInterest > 0) {
      const cash = getSpendableCash(state.portfolio || { cash: 0 });
      if (cash >= creditInterest) {
        state.portfolio.cash -= creditInterest;
      } else {
        // Roll unpaid interest into the credit line when under the LTV cap;
        // at the cap, still charge cash (may go negative) so interest is never free.
        const rolled = Math.round((used + creditInterest) * 100) / 100;
        const max = Math.max(0, Number(state.estateCreditMax) || 0);
        if (rolled <= max + 0.001) {
          state.estateCreditUsed = rolled;
        } else {
          state.portfolio.cash = (Number(state.portfolio.cash) || 0) - creditInterest;
        }
      }
      events.push({
        type: 'estate_credit_interest',
        msg: `Property credit interest $${creditInterest.toFixed(2)}`,
        amount: creditInterest,
      });
    }
  }

  syncEstateDerived(state);
  return { netIncome, creditInterest, events };
}

/**
 * @param {object} raw
 */
export function sanitizeEstateProgress(raw = {}) {
  const MAX_CASH = 1e12;
  let spent = Number(raw.estateSpentTotal);
  if (!Number.isFinite(spent) || spent < 0) spent = 0;
  spent = Math.min(MAX_CASH, spent);

  const ownedRaw = Array.isArray(raw.estateOwned) ? raw.estateOwned : [];
  const seen = new Set();
  /** @type {string[]} */
  const owned = [];
  let justified = 0;
  for (const id of ownedRaw) {
    if (!KNOWN_ESTATE_IDS.has(id) || seen.has(id)) continue;
    const cost = Number(ESTATE_COST_BY_ID.get(id) || 0);
    if (justified + cost <= spent + 0.001) {
      seen.add(id);
      owned.push(id);
      justified += cost;
    }
  }

  // Enforce category prerequisites after ledger filter.
  // Check against already-validated ids only — a stripped yacht must not unlock an island.
  const ownedSet = new Set(owned);
  /** @type {string[]} */
  const ordered = [];
  const validated = new Set();
  for (const asset of ESTATE_ASSETS) {
    if (!ownedSet.has(asset.id)) continue;
    const need = asset.requiresCategory;
    if (need) {
      const hasNeed = ESTATE_ASSETS.some((a) => a.category === need && validated.has(a.id));
      if (!hasNeed) continue;
    }
    ordered.push(asset.id);
    validated.add(asset.id);
  }

  let extracted = Number(raw.estateEquityExtracted);
  if (!Number.isFinite(extracted) || extracted < 0) extracted = 0;
  const maxEquity = ordered.reduce((s, id) => s + (Number(ESTATE_COST_BY_ID.get(id)) || 0), 0);
  extracted = Math.min(maxEquity, extracted);

  let creditUsed = Number(raw.estateCreditUsed);
  if (!Number.isFinite(creditUsed) || creditUsed < 0) creditUsed = 0;
  const creditMax = ordered.reduce((s, id) => {
    const a = getEstateAsset(id);
    return s + (a ? a.price * a.creditLtv : 0);
  }, 0);
  creditUsed = Math.min(creditMax, creditUsed);

  let cashOutCount = Math.floor(Number(raw.estateCashOutCount) || 0);
  if (!Number.isFinite(cashOutCount) || cashOutCount < 0) cashOutCount = 0;
  cashOutCount = Math.min(50, cashOutCount);

  let lastCashOut = raw.estateLastCashOutDay;
  if (lastCashOut != null) {
    lastCashOut = Math.max(1, Math.floor(Number(lastCashOut) || 1));
  } else {
    lastCashOut = null;
  }

  const tmp = {
    estateOwned: ordered,
    estateSpentTotal: spent,
    estateEquityExtracted: extracted,
    estateCreditUsed: creditUsed,
    estateCashOutCount: cashOutCount,
    estateLastCashOutDay: lastCashOut,
  };
  syncEstateDerived(tmp);
  return {
    estateOwned: tmp.estateOwned,
    estateSpentTotal: spent,
    estateEquity: tmp.estateEquity,
    estateEquityExtracted: extracted,
    estateCreditUsed: tmp.estateCreditUsed,
    estateCreditMax: tmp.estateCreditMax,
    resilienceRating: tmp.resilienceRating,
    estateIncomePerDay: tmp.estateIncomePerDay,
    estateUpkeepPerDay: tmp.estateUpkeepPerDay,
    estateCashOutCount: cashOutCount,
    estateLastCashOutDay: lastCashOut,
  };
}

/**
 * @param {object} finance
 * @param {number} [estateCreditUsed]
 * @param {(f: object) => number} getLoanDebt
 */
export function getFirmDebtWithEstates(finance, estateCreditUsed, getLoanDebt) {
  const loans = typeof getLoanDebt === 'function' ? getLoanDebt(finance) : 0;
  return loans + Math.max(0, Number(estateCreditUsed) || 0);
}
