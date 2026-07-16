// @ts-check
import { getSpendableCash } from './portfolio.js';
import { requiredLicenseForRep, hasLicense } from './licenses.js';

export const BLACKMARKET_ITEM_POOL = [
  {
    id: 'afterHoursMonogram',
    name: 'After-Hours Monogram',
    desc: 'A brushed-metal profile badge seen on old floor jackets.',
    cost: 42000,
    rarity: 'common',
    repRequired: 180,
    category: 'trophy',
    icon: 'monogram',
  },
  {
    id: 'nightWatchTitle',
    name: 'Night Watch',
    desc: 'Title for desks that thrive in pre-market chaos.',
    cost: 50000,
    rarity: 'common',
    repRequired: 200,
    category: 'title',
    icon: 'title-nightwatch',
  },
  {
    id: 'tickerVaultBackdrop',
    name: 'Ticker Vault Backdrop',
    desc: 'Dark vault-room background with suspended neon ticker bands.',
    cost: 56000,
    rarity: 'common',
    repRequired: 210,
    category: 'background',
    icon: 'bg-vault',
  },
  {
    id: 'clockworkDeskSkin',
    name: 'Clockwork Desk Skin',
    desc: 'Bronze and steel dashboard accent with analog dial motifs.',
    cost: 61000,
    rarity: 'common',
    repRequired: 220,
    category: 'dashboard',
    icon: 'dash-clockwork',
  },
  {
    id: 'pitPassLanyard',
    name: 'Pit Pass Lanyard',
    desc: 'Worn fabric pass from a forgotten night session. Cosmetic desk flair only.',
    cost: 47000,
    rarity: 'common',
    repRequired: 225,
    category: 'trophy',
    icon: 'lanyard-pit',
  },
  {
    id: 'amberTapeBackdrop',
    name: 'Amber Tape Room',
    desc: 'Warm amber ticker-room backdrop for late closes. Cosmetic only.',
    cost: 58000,
    rarity: 'common',
    repRequired: 235,
    category: 'background',
    icon: 'bg-amber-tape',
  },
  {
    id: 'ledgerLineTitle',
    name: 'Ledger Line',
    desc: 'A quiet floor title for desks that keep clean books. Cosmetic only.',
    cost: 66000,
    rarity: 'common',
    repRequired: 250,
    category: 'title',
    icon: 'title-ledger-line',
  },
  {
    id: 'floorMythTitle',
    name: 'Floor Myth',
    desc: 'A rare title whispered about on profitable desks.',
    cost: 78000,
    rarity: 'rare',
    repRequired: 260,
    category: 'title',
    icon: 'title-myth',
  },
  {
    id: 'dragonLedgerBadge',
    name: 'Dragon Ledger Badge',
    desc: 'Rare enamel badge featuring a dragon curled around a ledger book.',
    cost: 86000,
    rarity: 'rare',
    repRequired: 280,
    category: 'trophy',
    icon: 'badge-dragon-ledger',
  },
  {
    id: 'stormGlassBackdrop',
    name: 'Storm Glass',
    desc: 'Rare storm-cell skyline background with distant circuit flashes.',
    cost: 94000,
    rarity: 'rare',
    repRequired: 300,
    category: 'background',
    icon: 'bg-storm',
  },
  {
    id: 'midnightBloomDesk',
    name: 'Midnight Bloom Console',
    desc: 'Rare violet/cyan dashboard accent pass for night sessions.',
    cost: 99000,
    rarity: 'rare',
    repRequired: 320,
    category: 'dashboard',
    icon: 'dash-midnight',
  },
  {
    id: 'mageOfTheDesk',
    name: 'The Mage of the Desk',
    desc: 'Relic: execution sigil. While equipped, stock fills take 15% less slippage.',
    cost: 150000,
    rarity: 'legendary',
    repRequired: 300,
    category: 'relic',
    icon: 'title-mage',
  },
  {
    id: 'liquidityCrown',
    name: 'Liquidity Crown',
    desc: 'Relic: crisis lanyard. While equipped, margin-call liquidation grace is extended by 6 minutes.',
    cost: 165000,
    rarity: 'legendary',
    repRequired: 340,
    category: 'relic',
    icon: 'badge-crown',
  },
  {
    id: 'orbitalFloorBackdrop',
    name: 'Orbital Floor',
    desc: 'Legendary background with an orbital-ring market floor aesthetic.',
    cost: 185000,
    rarity: 'legendary',
    repRequired: 360,
    category: 'background',
    icon: 'bg-orbital',
  },
  {
    id: 'obsidianMonolithDesk',
    name: 'Obsidian Monolith Desk',
    desc: 'Legendary dashboard skin with polished obsidian contrast.',
    cost: 210000,
    rarity: 'legendary',
    repRequired: 400,
    category: 'dashboard',
    icon: 'dash-obsidian-monolith',
  },
];

export const KNOWN_BLACKMARKET_IDS = new Set(BLACKMARKET_ITEM_POOL.map((item) => item.id));
export const BLACKMARKET_COST_BY_ID = new Map(BLACKMARKET_ITEM_POOL.map((item) => [item.id, item.cost]));

export const BLACKMARKET_LISTING_TTL_DAYS = 3;
export const BLACKMARKET_SEEN_EXPIRED_MAX = 120;

export const LEGENDARY_BLACKMARKET_COACH_TEXT = '';

export function getBlackMarketItem(itemId) {
  if (!itemId) return null;
  return BLACKMARKET_ITEM_POOL.find((item) => item.id === itemId) || null;
}

export function getTodaysBlackMarketListing(seedDay, { ownedIds = [] } = {}) {
  // Black Market shop removed from the desk — keep API shape for saves/tests.
  void ownedIds;
  const day = Math.max(1, Math.floor(Number(seedDay) || 1));
  return {
    day,
    expiresDay: day + BLACKMARKET_LISTING_TTL_DAYS - 1,
    items: [],
  };
}

export function isBlackMarketListingExpired(listing, currentDay) {
  if (!listing || typeof listing !== 'object') return false;
  const day = Math.floor(Number(currentDay) || 0);
  if (day <= 0) return false;
  const expiresDay = Math.floor(Number(listing.expiresDay) || (Number(listing.day) + BLACKMARKET_LISTING_TTL_DAYS));
  return day >= expiresDay;
}

export function canPurchaseBlackMarketItem(_item, _ctx = {}) {
  return { ok: false, reason: 'Black Market has been retired from this desk.', code: 'retired' };
}

export function purchaseBlackMarketItem(_state, _item) {
  return { ok: false, msg: 'Black Market has been retired from this desk.', code: 'retired' };
}

export function collectExpiredBlackMarketIds(_currentDay, _opts = {}) {
  return [];
}

export function recordExpiredBlackMarketSeen(state, currentDay) {
  if (!Array.isArray(state.blackMarketSeenExpired)) state.blackMarketSeenExpired = [];
  const expiredIds = collectExpiredBlackMarketIds(currentDay, { ownedIds: state.blackMarketOwned });
  if (!expiredIds.length) return 0;
  const seen = new Set(state.blackMarketSeenExpired);
  expiredIds.forEach((id) => seen.add(id));
  state.blackMarketSeenExpired = [...seen].slice(-BLACKMARKET_SEEN_EXPIRED_MAX);
  return expiredIds.length;
}

export function shouldShowBlackMarketLegendaryCoach() {
  return false;
}

export function maybeShowBlackMarketLegendaryCoach() {
  return false;
}
