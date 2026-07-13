// @ts-check
import { getSpendableCash } from './portfolio.js';

/**
 * Ultra-rare crown jewels — Private Salon rotation only.
 * Purchase writes into state.vaultOwned (same collateral / book-value path as vault).
 */
export const PRIVATE_SALON_ITEMS = {
  vermeerAttribution: {
    id: 'vermeerAttribution',
    name: 'Interior with Attribution, c. 1660',
    desc: 'Museum-grade Dutch interior, disputed attribution. Crown provenance — extreme appraisal and flagship Desk Prestige when equipped.',
    cost: 2500000,
    category: 'background',
    repRequired: 1400,
    rarity: 'crown',
    salonOnly: true,
    listingRate: 1 / 120,
    prestigeBonus: { repPerClose: 2, dailyCap: 2 },
  },
  fabergeImperial: {
    id: 'fabergeImperial',
    name: 'Imperial Easter Egg, Fabergé Workshop',
    desc: 'Imperial workshop Easter egg. The rarest salon listing — books enormous wealth and the strongest prestige bonus in the catalog.',
    cost: 5000000,
    category: 'trophy',
    repRequired: 1600,
    rarity: 'crown',
    salonOnly: true,
    listingRate: 1 / 180,
    prestigeBonus: { repPerClose: 3, dailyCap: 3 },
  },
};

export const PRIVATE_SALON_POOL = Object.values(PRIVATE_SALON_ITEMS);

export const SALON_LISTING_TTL_DAYS = 5;
export const SALON_SEEN_EXPIRED_MAX = 60;

export const SALON_CROWN_COACH_TEXT = 'Private Salon crown jewels appear on extremely rare windows and expire in a few in-game days. If you want it, buy it before the window closes.';

export function getSalonItem(itemId) {
  if (!itemId) return null;
  return PRIVATE_SALON_ITEMS[itemId] || null;
}

function seededSalonRoll(day, salt) {
  const d = Math.max(1, Math.floor(Number(day) || 1));
  const x = Math.sin((d + salt) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Deterministic salon listing for a seed day — at most one unowned crown.
 * @param {number} seedDay
 * @param {{ ownedIds?: string[] }} [opts]
 */
export function getTodaysSalonListing(seedDay, { ownedIds = [] } = {}) {
  const day = Math.max(1, Math.floor(Number(seedDay) || 1));
  const owned = new Set(Array.isArray(ownedIds) ? ownedIds : []);
  const pool = PRIVATE_SALON_POOL.filter((item) => !owned.has(item.id));
  const active = [];
  for (const item of pool) {
    const rate = Number(item.listingRate) || (1 / 120);
    const salt = item.id.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
    if (seededSalonRoll(day, salt) < rate) active.push(item);
  }
  const item = active.length
    ? active.slice().sort((a, b) => (b.cost || 0) - (a.cost || 0))[0]
    : null;
  return {
    day,
    expiresDay: day + SALON_LISTING_TTL_DAYS,
    item,
  };
}

/** Active salon window on currentDay (may have started on an earlier day within TTL). */
export function getActiveSalonListing(currentDay, { ownedIds = [] } = {}) {
  const day = Math.floor(Number(currentDay) || 1);
  for (let d = day; d >= Math.max(1, day - SALON_LISTING_TTL_DAYS + 1); d--) {
    const listing = getTodaysSalonListing(d, { ownedIds });
    if (listing.item && day >= listing.day && day < listing.expiresDay) {
      return listing;
    }
  }
  return { day, expiresDay: day, item: null };
}

export function isSalonListingExpired(listing, currentDay) {
  if (!listing || typeof listing !== 'object' || !listing.item) return true;
  const day = Math.floor(Number(currentDay) || 0);
  if (day <= 0) return true;
  const expiresDay = Math.floor(Number(listing.expiresDay) || (Number(listing.day) + SALON_LISTING_TTL_DAYS));
  return day >= expiresDay;
}

export function isSalonListingActive(currentDay, { ownedIds = [] } = {}) {
  const listing = getActiveSalonListing(currentDay, { ownedIds });
  return !!listing.item;
}

export function canPurchaseSalonItem(item, { cash = 0, vaultOwned = [], reputation = 0, listingActive = false } = {}) {
  if (!item?.id) return { ok: false, reason: 'Unknown listing', code: 'unknown' };
  if (!listingActive) return { ok: false, reason: 'Salon listing not active', code: 'window' };
  if (Array.isArray(vaultOwned) && vaultOwned.includes(item.id)) {
    return { ok: false, reason: 'Already owned', code: 'owned' };
  }
  const repNeed = Number(item.repRequired) || 0;
  if (Number(reputation) < repNeed) {
    return { ok: false, reason: `Requires ${repNeed} REP`, code: 'rep' };
  }
  if (Number(cash) < Number(item.cost || 0)) {
    return { ok: false, reason: 'Insufficient cash', code: 'cash' };
  }
  return { ok: true };
}

export function purchaseSalonItem(state, item, currentDay) {
  if (!item?.id) return { ok: false, msg: 'Unknown listing.' };
  if (!Array.isArray(state?.vaultOwned)) state.vaultOwned = [];
  const day = Math.floor(Number(currentDay) || 1);
  const listing = getActiveSalonListing(day, { ownedIds: state.vaultOwned });
  const listingActive = listing.item?.id === item.id;
  const gate = canPurchaseSalonItem(item, {
    cash: getSpendableCash(state.portfolio),
    vaultOwned: state.vaultOwned,
    reputation: state.meta?.reputation || 0,
    listingActive,
  });
  if (!gate.ok) return { ok: false, msg: gate.reason, code: gate.code };
  state.portfolio.cash -= item.cost;
  state.vaultOwned.push(item.id);
  state.vaultSpentTotal = Math.max(0, Number(state.vaultSpentTotal) || 0) + item.cost;
  state.salonSpentTotal = Math.max(0, Number(state.salonSpentTotal) || 0) + item.cost;
  return { ok: true, item, listing };
}

export function collectExpiredSalonIds(currentDay, { ownedIds = [] } = {}) {
  const day = Math.floor(Number(currentDay) || 0);
  if (day <= 0) return [];
  const owned = new Set(Array.isArray(ownedIds) ? ownedIds : []);
  const missed = [];
  for (let d = Math.max(1, day - 90); d < day; d++) {
    const listing = getTodaysSalonListing(d, { ownedIds: [...owned, ...missed] });
    if (!listing.item) continue;
    if (day >= listing.expiresDay && !owned.has(listing.item.id) && !missed.includes(listing.item.id)) {
      missed.push(listing.item.id);
    }
  }
  return missed.slice(-SALON_SEEN_EXPIRED_MAX);
}
