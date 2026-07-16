// @ts-check
/**
 * Legacy Floor Relics — Black Market shop retired.
 * Only the two mechanical relics remain so legacy saves keep ownership + desk effects.
 * Cosmetics from the old pool sanitize out (they never applied desk skins).
 */

/** Minimal catalog: relics only (legacy ownership + equip effects). */
export const BLACKMARKET_ITEM_POOL = [
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
  return { ok: false, reason: 'Floor relics are no longer sold on this desk.', code: 'retired' };
}

export function purchaseBlackMarketItem(_state, _item) {
  return { ok: false, msg: 'Floor relics are no longer sold on this desk.', code: 'retired' };
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
