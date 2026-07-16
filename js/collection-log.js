// @ts-check
import { VAULT_ITEMS, getVaultItem, VAULT_COST_BY_ID } from './vault.js';
import { isRelicItem } from './relics.js';
import { getItemLore, getSetForItemId } from './collection-flavor.js';

function normalizeRarity(item, fallback = 'common') {
  const r = String(item?.rarity || '').toLowerCase();
  if (r === 'common' || r === 'rare' || r === 'legendary' || r === 'masterwork' || r === 'crown') return r;
  return fallback;
}

/** Display-only lore / set chips for Collection Log + Museum. */
function flavorFields(id) {
  const set = getSetForItemId(id);
  return {
    lore: getItemLore(id),
    setId: set?.id || null,
    setName: set?.name || null,
  };
}

/** Claimable completion milestones — cash + flair only; no buying-power hooks. */
export const COLLECTION_MILESTONES = [
  {
    id: 'pct25',
    label: 'First Quarter',
    kind: 'pct',
    threshold: 25,
    cash: 250,
    flair: null,
    blurb: 'Own 25% of the full catalog.',
  },
  {
    id: 'pct50',
    label: 'Halfway Desk',
    kind: 'pct',
    threshold: 50,
    cash: 750,
    flair: null,
    blurb: 'Half the catalog booked. Cash toast for the grind.',
  },
  {
    id: 'pct75',
    label: 'Near Complete',
    kind: 'pct',
    threshold: 75,
    cash: 2000,
    flair: null,
    blurb: 'Three-quarters done — rare chase territory.',
  },
  {
    id: 'pct100',
    label: 'Full Catalog',
    kind: 'pct',
    threshold: 100,
    cash: 5000,
    flair: 'Collection Archivist',
    blurb: 'Every registered piece owned. Prestige title unlocked.',
  },
  {
    id: 'vaultSet',
    label: 'Vault Cleared',
    kind: 'vault_all',
    cash: 1500,
    flair: null,
    blurb: 'Every Trophy Vault item owned.',
  },
  {
    id: 'seatTaken',
    label: 'Seat Secured',
    kind: 'seat',
    cash: 500,
    flair: null,
    blurb: 'A Seat on the Trading Floor is yours.',
  },
  {
    id: 'masterwork3',
    label: 'Master Collector',
    kind: 'masterwork_n',
    threshold: 3,
    cash: 5000,
    flair: 'Master Collector',
    blurb: 'Own three masterwork-tier Trophy Vault pieces.',
  },
  {
    id: 'crownSecured',
    label: 'Crown Provenance',
    kind: 'crown_any',
    cash: 10000,
    flair: 'Crown Provenance',
    blurb: 'Acquire any Private Salon crown jewel.',
  },
];

/** Highest-appraisal equipped vault piece (masterwork/crown flex). */
export function getFlagshipEquippedVaultItem(cosmetics = {}, vaultOwned = []) {
  const owned = new Set(Array.isArray(vaultOwned) ? vaultOwned : []);
  const slots = ['dashboard', 'background', 'badge', 'title'];
  let best = null;
  let bestCost = 0;
  for (const slot of slots) {
    const id = cosmetics?.[slot];
    if (!id || !owned.has(id)) continue;
    const item = getVaultItem(id);
    if (!item) continue;
    const cost = Number(VAULT_COST_BY_ID.get(id) || item.cost || 0);
    if (cost > bestCost) {
      bestCost = cost;
      best = item;
    }
  }
  return best;
}

export const KNOWN_COLLECTION_MILESTONE_IDS = new Set(COLLECTION_MILESTONES.map((m) => m.id));
export const COLLECTION_MILESTONE_BY_ID = new Map(COLLECTION_MILESTONES.map((m) => [m.id, m]));

/**
 * Build collection entries from all registered sources.
 * @param {object} state
 * @param {{ blackMarketPool?: Array<any>, seatItem?: any, salonPool?: Array<any> }} [opts]
 */
export function getCollectionLogEntries(state = {}, { blackMarketPool = [], seatItem = null, salonPool = [] } = {}) {
  const vaultOwned = new Set(Array.isArray(state.vaultOwned) ? state.vaultOwned : []);
  const blackOwned = new Set(Array.isArray(state.blackMarketOwned) ? state.blackMarketOwned : []);
  const entries = [];

  Object.values(VAULT_ITEMS).forEach((item) => {
    entries.push({
      id: item.id,
      name: item.name,
      category: item.category,
      icon: '',
      source: 'vault',
      rarity: normalizeRarity(item, 'common'),
      owned: vaultOwned.has(item.id),
      cost: Number(item.cost) || 0,
      ...flavorFields(item.id),
    });
  });

  (Array.isArray(salonPool) ? salonPool : []).forEach((item) => {
    if (!item?.id) return;
    entries.push({
      id: item.id,
      name: item.name || item.id,
      category: item.category || 'salon',
      icon: '',
      source: 'salon',
      rarity: normalizeRarity(item, 'crown'),
      owned: vaultOwned.has(item.id),
      cost: Number(item.cost) || 0,
      ...flavorFields(item.id),
    });
  });

  (Array.isArray(blackMarketPool) ? blackMarketPool : []).forEach((item) => {
    if (!item?.id) return;
    // Shop removed — only legacy owned pieces remain in the Collection Log.
    if (!blackOwned.has(item.id)) return;
    entries.push({
      id: item.id,
      name: item.name || item.id,
      category: item.category || 'blackmarket',
      icon: item.icon || '',
      source: 'blackmarket',
      rarity: normalizeRarity(item, 'rare'),
      owned: true,
      cost: Number(item.cost) || 0,
      ...flavorFields(item.id),
    });
  });

  if (seatItem?.id) {
    entries.push({
      id: seatItem.id,
      name: seatItem.name || seatItem.id,
      category: seatItem.category || 'seat',
      icon: seatItem.icon || '',
      source: 'seat',
      rarity: normalizeRarity(seatItem, 'legendary'),
      owned: !!state.seatOwned,
      cost: Number(seatItem.cost) || 0,
      ...flavorFields(seatItem.id),
    });
  }

  return entries.sort((a, b) => {
    if (a.source !== b.source) return a.source.localeCompare(b.source);
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.name.localeCompare(b.name);
  });
}

/**
 * @param {object} state
 * @param {{ blackMarketPool?: Array<any>, seatItem?: any }} [opts]
 */
export function getCollectionCompletion(state = {}, opts = {}) {
  const entries = getCollectionLogEntries(state, opts);
  const total = entries.length;
  const owned = entries.filter((entry) => entry.owned).length;
  return {
    owned,
    total,
    pct: total ? Math.round((owned / total) * 100) : 0,
  };
}

/**
 * Late-game progression score for leaderboard/profile flex.
 * @param {object} state
 * @param {{ blackMarketPool?: Array<any>, seatItem?: any, salonPool?: Array<any> }} [opts]
 */
export function getCollectionPrestigeScore(state = {}, { blackMarketPool = [], seatItem = null, salonPool = [] } = {}) {
  const vaultOwned = new Set(Array.isArray(state.vaultOwned) ? state.vaultOwned : []);
  const blackOwned = new Set(Array.isArray(state.blackMarketOwned) ? state.blackMarketOwned : []);
  const equippedRelics = new Set(
    (Array.isArray(state.blackMarketEquippedRelics) ? state.blackMarketEquippedRelics : [])
      .filter((id) => isRelicItem(id)),
  );
  let score = 0;

  for (const id of vaultOwned) {
    const item = getVaultItem(id);
    const rarity = normalizeRarity(item, 'common');
    if (rarity === 'crown') score += 400;
    else if (rarity === 'masterwork') score += 120;
    else score += 8;
  }

  (Array.isArray(blackMarketPool) ? blackMarketPool : []).forEach((item) => {
    if (!item?.id || !blackOwned.has(item.id)) return;
    const rarity = normalizeRarity(item, 'common');
    if (rarity === 'legendary') score += 90;
    else if (rarity === 'rare') score += 45;
    else score += 20;
  });

  score += equippedRelics.size * 30;
  if (seatItem?.id && state.seatOwned) score += 260;

  const claims = Array.isArray(state.collectionClaims) ? state.collectionClaims.length : 0;
  score += claims * 12;

  return Math.max(0, Math.round(score));
}

function isMilestoneEarned(milestone, state, opts) {
  const entries = getCollectionLogEntries(state, opts);
  const completion = getCollectionCompletion(state, opts);
  if (milestone.kind === 'pct') {
    return completion.pct >= (milestone.threshold || 0);
  }
  if (milestone.kind === 'vault_all') {
    const vault = entries.filter((e) => e.source === 'vault');
    return vault.length > 0 && vault.every((e) => e.owned);
  }
  if (milestone.kind === 'seat') {
    return !!state.seatOwned;
  }
  if (milestone.kind === 'masterwork_n') {
    const ownedMasterworks = entries.filter((e) => e.source === 'vault' && e.rarity === 'masterwork' && e.owned);
    return ownedMasterworks.length >= (milestone.threshold || 3);
  }
  if (milestone.kind === 'crown_any') {
    return entries.some((e) => e.source === 'salon' && e.rarity === 'crown' && e.owned);
  }
  return false;
}

/**
 * @param {object} state
 * @param {{ blackMarketPool?: Array<any>, seatItem?: any }} [opts]
 */
export function getCollectionMilestones(state = {}, opts = {}) {
  const claimed = new Set(Array.isArray(state.collectionClaims) ? state.collectionClaims : []);
  return COLLECTION_MILESTONES.map((milestone) => {
    const earned = isMilestoneEarned(milestone, state, opts);
    const isClaimed = claimed.has(milestone.id);
    return {
      ...milestone,
      earned,
      claimed: isClaimed,
      claimable: earned && !isClaimed,
    };
  });
}

/**
 * Missing chase targets — seat / legendary / rare / high-cost first.
 * @param {object} state
 * @param {{ blackMarketPool?: Array<any>, seatItem?: any, limit?: number }} [opts]
 */
export function getCollectionHuntTargets(state = {}, opts = {}) {
  const limit = Math.max(1, Math.min(6, Math.floor(Number(opts.limit) || 3)));
  const rarityRank = { crown: 5, masterwork: 4, legendary: 3, rare: 2, common: 1 };
  const sourceRank = { salon: 5, seat: 4, vault: 2 };
  return getCollectionLogEntries(state, opts)
    .filter((entry) => !entry.owned)
    .slice()
    .sort((a, b) => {
      const sr = (sourceRank[b.source] || 0) - (sourceRank[a.source] || 0);
      if (sr !== 0) return sr;
      const rr = (rarityRank[b.rarity] || 0) - (rarityRank[a.rarity] || 0);
      if (rr !== 0) return rr;
      return (b.cost || 0) - (a.cost || 0);
    })
    .slice(0, limit);
}

/**
 * Claim a milestone. Mutates state.portfolio.cash / collectionClaims / meta.collectionFlair.
 * @param {object} state
 * @param {string} milestoneId
 * @param {{ blackMarketPool?: Array<any>, seatItem?: any }} [opts]
 */
export function claimCollectionMilestone(state, milestoneId, opts = {}) {
  const milestone = COLLECTION_MILESTONE_BY_ID.get(milestoneId);
  if (!milestone) return { ok: false, msg: 'Unknown milestone.' };
  if (!state.portfolio || typeof state.portfolio.cash !== 'number') {
    return { ok: false, msg: 'No portfolio.' };
  }
  if (!Array.isArray(state.collectionClaims)) state.collectionClaims = [];
  if (state.collectionClaims.includes(milestone.id)) {
    return { ok: false, msg: 'Already claimed.' };
  }
  if (!isMilestoneEarned(milestone, state, opts)) {
    return { ok: false, msg: 'Milestone not earned yet.' };
  }

  state.collectionClaims.push(milestone.id);
  const cash = Math.max(0, Math.floor(Number(milestone.cash) || 0));
  if (cash > 0) {
    state.portfolio.cash += cash;
  }
  state.collectionRewardCashTotal = Math.max(0, Number(state.collectionRewardCashTotal) || 0) + cash;
  if (milestone.flair) {
    if (!state.meta || typeof state.meta !== 'object') state.meta = {};
    state.meta.collectionFlair = String(milestone.flair).slice(0, 40);
  }

  return {
    ok: true,
    milestone,
    cash,
    flair: milestone.flair || null,
    claims: state.collectionClaims.slice(),
    rewardCashTotal: state.collectionRewardCashTotal,
  };
}

/** Sum of cash rewards for a claim list (sanitize ledger). */
export function getCollectionClaimedCashTotal(claims = []) {
  let total = 0;
  (Array.isArray(claims) ? claims : []).forEach((id) => {
    const m = COLLECTION_MILESTONE_BY_ID.get(id);
    if (m) total += Math.max(0, Math.floor(Number(m.cash) || 0));
  });
  return total;
}

/**
 * Drop forged claims that are not currently earned.
 * @param {string[]} claims
 * @param {object} state
 * @param {{ blackMarketPool?: Array<any>, seatItem?: any }} [opts]
 */
export function sanitizeCollectionClaims(claims, state, opts = {}) {
  const list = Array.isArray(claims) ? claims : [];
  const kept = [];
  const seen = new Set();
  list.forEach((id) => {
    if (!KNOWN_COLLECTION_MILESTONE_IDS.has(id) || seen.has(id)) return;
    const milestone = COLLECTION_MILESTONE_BY_ID.get(id);
    if (!milestone || !isMilestoneEarned(milestone, state, opts)) return;
    seen.add(id);
    kept.push(id);
  });
  return kept;
}
