// @ts-check
/**
 * Late-game luxury cash sinks — optional, cosmetic / prestige ownership only.
 * Does not book into Net Worth. No Desk Prestige / BP / margin / slippage / APR.
 */

import { getSpendableCash } from './portfolio.js';

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   price: number,
 *   blurb: string,
 *   flair: string | null,
 * }} LuxuryItem
 */

/** @type {LuxuryItem[]} */
export const LUXURY_ITEMS = [
  {
    id: 'cornerSuiteArt',
    name: 'Corner Suite Art',
    price: 100_000,
    blurb: 'A quiet canvas behind the monitors. Flex only.',
    flair: null,
  },
  {
    id: 'privateScreening',
    name: 'Private Screening',
    price: 500_000,
    blurb: 'Invite-only tape review room. Prestige sink.',
    flair: null,
  },
  {
    id: 'harborSlip',
    name: 'Harbor Slip',
    price: 2_000_000,
    blurb: 'A berth you barely use. Money with nowhere else to go.',
    flair: 'Harbor Slip',
  },
  {
    id: 'skylineLease',
    name: 'Skyline Lease',
    price: 8_000_000,
    blurb: 'Floor-to-ceiling night lights. Pure ownership.',
    flair: 'Skyline Lease',
  },
  {
    id: 'foundersGallery',
    name: 'Founders’ Gallery',
    price: 15_000_000,
    blurb: 'Wall of provenance. Collectors notice.',
    flair: 'Founders’ Gallery',
  },
  {
    id: 'dynastyWing',
    name: 'Dynasty Wing',
    price: 25_000_000,
    blurb: 'The late-game burn. No trading edge — just legend.',
    flair: 'Dynasty Wing',
  },
];

export const KNOWN_LUXURY_IDS = new Set(LUXURY_ITEMS.map((i) => i.id));
const LUXURY_BY_ID = new Map(LUXURY_ITEMS.map((i) => [i.id, i]));
export const LUXURY_COST_BY_ID = new Map(LUXURY_ITEMS.map((i) => [i.id, i.price]));

/**
 * @param {string} id
 * @returns {LuxuryItem | null}
 */
export function getLuxuryItem(id) {
  return LUXURY_BY_ID.get(id) || null;
}

/**
 * Next unowned luxury by catalog order (single CTA on Dashboard).
 * @param {{ luxuryOwned?: string[] }} [state]
 * @returns {LuxuryItem | null}
 */
export function getNextLuxuryPurchase(state = {}) {
  const owned = new Set(Array.isArray(state.luxuryOwned) ? state.luxuryOwned : []);
  return LUXURY_ITEMS.find((item) => !owned.has(item.id)) || null;
}

/**
 * Highest owned luxury (for quiet ambient attribute).
 * @param {{ luxuryOwned?: string[] }} [state]
 * @returns {LuxuryItem | null}
 */
export function getHighestOwnedLuxury(state = {}) {
  const owned = new Set(Array.isArray(state.luxuryOwned) ? state.luxuryOwned : []);
  let best = null;
  for (const item of LUXURY_ITEMS) {
    if (owned.has(item.id)) best = item;
  }
  return best;
}

/**
 * @param {{ portfolio?: object, luxuryOwned?: string[] }} state
 * @param {string} itemId
 */
export function canPurchaseLuxury(state, itemId) {
  const item = getLuxuryItem(itemId);
  if (!item) return { ok: false, reason: 'Unknown luxury', code: 'unknown' };
  const owned = new Set(Array.isArray(state.luxuryOwned) ? state.luxuryOwned : []);
  if (owned.has(item.id)) return { ok: false, reason: 'Already owned', code: 'owned' };
  const next = getNextLuxuryPurchase(state);
  if (!next || next.id !== item.id) {
    return { ok: false, reason: 'Buy luxuries in catalog order', code: 'order' };
  }
  const cash = getSpendableCash(state.portfolio || { cash: 0 });
  if (cash < item.price) return { ok: false, reason: 'Insufficient cash', code: 'cash' };
  return { ok: true, item };
}

/**
 * @param {{ portfolio: { cash: number }, luxuryOwned?: string[], luxurySpentTotal?: number, meta?: object }} state
 * @param {string} itemId
 */
export function purchaseLuxury(state, itemId) {
  const gate = canPurchaseLuxury(state, itemId);
  if (!gate.ok) return { ok: false, msg: gate.reason, code: gate.code };
  const item = gate.item;
  state.portfolio.cash -= item.price;
  if (!Array.isArray(state.luxuryOwned)) state.luxuryOwned = [];
  state.luxuryOwned.push(item.id);
  state.luxurySpentTotal = Math.max(0, Number(state.luxurySpentTotal) || 0) + item.price;
  if (item.flair) {
    if (!state.meta || typeof state.meta !== 'object') state.meta = {};
    state.meta.luxuryFlair = String(item.flair).slice(0, 40);
  }
  return { ok: true, item, spent: item.price };
}

/**
 * Spend-ledger sanitize (Seat-style prestige sink — not Net Worth).
 * @param {{ luxuryOwned?: string[], luxurySpentTotal?: number }} raw
 */
export function sanitizeLuxuryProgress(raw = {}) {
  const MAX_CASH = 1e12;
  let spent = Number(raw.luxurySpentTotal);
  if (!Number.isFinite(spent) || spent < 0) spent = 0;
  spent = Math.min(MAX_CASH, spent);

  const ownedRaw = Array.isArray(raw.luxuryOwned) ? raw.luxuryOwned : [];
  const seen = new Set();
  /** @type {string[]} */
  const owned = [];
  let justified = 0;
  for (const id of ownedRaw) {
    if (!KNOWN_LUXURY_IDS.has(id) || seen.has(id)) continue;
    const cost = Number(LUXURY_COST_BY_ID.get(id) || 0);
    if (justified + cost <= spent + 0.001) {
      seen.add(id);
      owned.push(id);
      justified += cost;
    }
  }
  // Enforce catalog order after ledger filter.
  const ordered = [];
  for (const item of LUXURY_ITEMS) {
    if (owned.includes(item.id)) ordered.push(item.id);
    else break;
  }
  return { luxuryOwned: ordered, luxurySpentTotal: spent };
}
