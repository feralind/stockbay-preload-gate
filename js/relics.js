// @ts-check

export const RELIC_SLOT_BASE = 1;
export const RELIC_SLOT_SEAT_BONUS = 1;
export const RELIC_SLOT_MAX = 2;

export const RELIC_EFFECTS_BY_ITEM_ID = {
  mageOfTheDesk: {
    id: 'mageOfTheDesk',
    name: 'Execution Sigil',
    summary: '15% less slippage on stock fills while equipped.',
    slippageMultiplier: 0.85,
  },
  liquidityCrown: {
    id: 'liquidityCrown',
    name: 'Crisis Lanyard',
    summary: '+6m extra margin-call grace before forced liquidation.',
    marginGraceBonusMinutes: 6,
  },
};

export const KNOWN_RELIC_IDS = new Set(Object.keys(RELIC_EFFECTS_BY_ITEM_ID));

export function getRelicEffect(itemId) {
  if (!itemId) return null;
  return RELIC_EFFECTS_BY_ITEM_ID[itemId] || null;
}

export function isRelicItem(itemId) {
  return KNOWN_RELIC_IDS.has(String(itemId || ''));
}

export function getRelicSlotLimit({ seatOwned = false } = {}) {
  const base = RELIC_SLOT_BASE + (seatOwned ? RELIC_SLOT_SEAT_BONUS : 0);
  return Math.max(RELIC_SLOT_BASE, Math.min(RELIC_SLOT_MAX, base));
}

export function sanitizeEquippedRelics(equippedRelics, {
  ownedRelics = [],
  seatOwned = false,
} = {}) {
  const slotLimit = getRelicSlotLimit({ seatOwned });
  const owned = new Set(
    (Array.isArray(ownedRelics) ? ownedRelics : []).filter((id) => isRelicItem(id)),
  );
  const unique = [];
  for (const id of Array.isArray(equippedRelics) ? equippedRelics : []) {
    if (!isRelicItem(id) || !owned.has(id) || unique.includes(id)) continue;
    unique.push(id);
    if (unique.length >= slotLimit) break;
  }
  return unique;
}

/** Sync + return equipped relic IDs on state (mutates state.blackMarketEquippedRelics via sanitize). */
export function getEquippedRelicIds(state) {
  if (!state) return [];
  state.blackMarketEquippedRelics = sanitizeEquippedRelics(state.blackMarketEquippedRelics, {
    ownedRelics: state.blackMarketOwned,
    seatOwned: state.seatOwned,
  });
  return state.blackMarketEquippedRelics;
}

/**
 * Equip or unequip a owned relic within slot limits.
 * Pure of UI — no toast/alert/save/render; caller handles side effects from the result.
 * @returns {{ ok: boolean, equipped: boolean, reason?: string, msg?: string, relic?: object|null, itemId?: string, slotLimit?: number, equippedCount?: number }}
 */
export function toggleEquippedRelic(state, itemId) {
  if (!isRelicItem(itemId)) {
    return { ok: false, equipped: false, reason: 'not_relic' };
  }
  if (!Array.isArray(state?.blackMarketOwned) || !state.blackMarketOwned.includes(itemId)) {
    return { ok: false, equipped: false, reason: 'unowned', msg: 'Buy this relic first.' };
  }
  const equipped = getEquippedRelicIds(state);
  if (equipped.includes(itemId)) {
    state.blackMarketEquippedRelics = equipped.filter((id) => id !== itemId);
    return { ok: true, equipped: false, itemId };
  }
  const slotLimit = getRelicSlotLimit({ seatOwned: !!state.seatOwned });
  if (equipped.length >= slotLimit) {
    const seatHint = state.seatOwned
      ? 'Unequip one relic to swap.'
      : 'Claim The Seat to unlock a second relic slot.';
    return {
      ok: false,
      equipped: false,
      reason: 'slots_full',
      msg: `Relic slots full (${equipped.length}/${slotLimit}). ${seatHint}`,
      slotLimit,
      equippedCount: equipped.length,
    };
  }
  state.blackMarketEquippedRelics = sanitizeEquippedRelics([...equipped, itemId], {
    ownedRelics: state.blackMarketOwned,
    seatOwned: state.seatOwned,
  });
  return { ok: true, equipped: true, itemId, relic: getRelicEffect(itemId) };
}

/**
 * After a BM purchase, equip the relic if a slot is free.
 * @returns {{ ok: boolean, equipped: boolean }}
 */
export function tryAutoEquipRelic(state, itemId) {
  if (!isRelicItem(itemId) || !getRelicEffect(itemId)) {
    return { ok: false, equipped: false };
  }
  const slots = getRelicSlotLimit({ seatOwned: !!state.seatOwned });
  const equipped = getEquippedRelicIds(state);
  if (equipped.length < slots && !equipped.includes(itemId)) {
    equipped.push(itemId);
    state.blackMarketEquippedRelics = sanitizeEquippedRelics(equipped, {
      ownedRelics: state.blackMarketOwned,
      seatOwned: state.seatOwned,
    });
    return { ok: true, equipped: true };
  }
  return { ok: true, equipped: false };
}

export function getRelicSlippageMultiplier(equippedRelics = []) {
  let multiplier = 1;
  for (const id of Array.isArray(equippedRelics) ? equippedRelics : []) {
    const effect = getRelicEffect(id);
    const next = Number(effect?.slippageMultiplier);
    if (Number.isFinite(next) && next > 0) {
      multiplier = Math.min(multiplier, next);
    }
  }
  return multiplier;
}

export function getRelicMarginGraceMinutes(equippedRelics = [], baseMinutes = 20) {
  const base = Math.max(1, Math.floor(Number(baseMinutes) || 20));
  let bonus = 0;
  for (const id of Array.isArray(equippedRelics) ? equippedRelics : []) {
    const effect = getRelicEffect(id);
    const add = Math.floor(Number(effect?.marginGraceBonusMinutes) || 0);
    if (add > 0) bonus += add;
  }
  return base + Math.min(12, bonus);
}

export function applyRelicSlippageEffect(slip, {
  quotePrice = null,
  equippedRelics = [],
} = {}) {
  const multiplier = getRelicSlippageMultiplier(equippedRelics);
  if (!(multiplier > 0) || multiplier >= 0.999) return slip;
  const fillPrice = Number(slip?.fillPrice);
  const mid = Number(quotePrice);
  if (!(fillPrice > 0) || !(mid > 0)) return slip;
  const delta = fillPrice - mid;
  const adjusted = Math.max(0.01, +(mid + delta * multiplier).toFixed(4));
  return {
    ...slip,
    fillPrice: adjusted,
    relicAdjusted: true,
  };
}
