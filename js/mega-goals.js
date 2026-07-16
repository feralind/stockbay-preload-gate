// @ts-check
/**
 * Mega Goals — Dashboard dream ladder.
 * Claims: flair only (no REP, no cash). Progress uses vault-inclusive Net Worth where relevant.
 */

import { getCollectionCompletion, getCollectionLogEntries } from './collection-log.js';
import { getOfficeTierIndex } from './office.js';

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   kind: 'netWorth' | 'office' | 'licenses' | 'collectionPct' | 'legendaryOwned' | 'estateOwned' | 'estateId',
 *   target: number,
 *   blurb: string,
 *   flair: string | null,
 *   officeId?: string,
 *   estateId?: string,
 * }} MegaGoal
 */

/** Kind priority: NW → Office → Licenses → Collection → Estates (per Section 4 approval). */
const KIND_PRIORITY = {
  netWorth: 0,
  office: 1,
  licenses: 2,
  collectionPct: 3,
  legendaryOwned: 4,
  estateOwned: 5,
  estateId: 6,
};

/** @type {MegaGoal[]} */
export const MEGA_GOALS = [
  { id: 'nw1k', label: 'First $1,000', kind: 'netWorth', target: 1000, blurb: 'Prove the desk can compound.', flair: null },
  { id: 'nw10k', label: 'First $10,000', kind: 'netWorth', target: 10000, blurb: 'Five figures. Keep the edge.', flair: null },
  { id: 'nw100k', label: 'First $100,000', kind: 'netWorth', target: 100000, blurb: 'Six figures. The room notices.', flair: null },
  { id: 'nw250k', label: 'First $250,000', kind: 'netWorth', target: 250000, blurb: 'A quarter million. Serious compounding.', flair: 'Quarter Desk' },
  { id: 'nw500k', label: 'First $500,000', kind: 'netWorth', target: 500000, blurb: 'Half a million. The desk has weight.', flair: 'Half Million' },
  { id: 'nw1m', label: 'First Million', kind: 'netWorth', target: 1000000, blurb: 'Seven figures. Real weight.', flair: 'Million Desk' },
  { id: 'nw10m', label: 'First Ten Million', kind: 'netWorth', target: 10000000, blurb: 'Institutional scale.', flair: 'Ten Million Club' },
  { id: 'nw100m', label: 'First Hundred Million', kind: 'netWorth', target: 100000000, blurb: 'Empire money.', flair: 'Hundred Million' },
  { id: 'nw1b', label: 'First Billion', kind: 'netWorth', target: 1000000000, blurb: 'Legend balance sheet.', flair: 'Billionaire Desk' },
  {
    id: 'officeEmpire',
    label: 'Empire Desk',
    kind: 'office',
    target: 1,
    officeId: 'empire',
    blurb: 'Purchase the Investment Empire office.',
    flair: 'Empire Seat',
  },
  {
    id: 'legendDesk',
    label: 'Fully Accredited',
    kind: 'licenses',
    target: 4,
    blurb: 'Hold every license — Retail through Reg D Institutional.',
    flair: 'Fully Accredited',
  },
  {
    id: 'collectionHalf',
    label: 'Half the Museum',
    kind: 'collectionPct',
    target: 50,
    blurb: 'Own half the registered collection.',
    flair: null,
  },
  {
    id: 'collectionFull',
    label: 'Complete Museum',
    kind: 'collectionPct',
    target: 100,
    blurb: 'Own every registered piece.',
    flair: 'Museum Complete',
  },
  {
    id: 'everyLegendary',
    label: 'Own Every Legendary',
    kind: 'legendaryOwned',
    target: 1,
    blurb: 'Own every legendary-tier collectible on the log.',
    flair: 'Legendary Sweep',
  },
  {
    id: 'firstEstate',
    label: 'First Estate',
    kind: 'estateOwned',
    target: 1,
    blurb: 'Buy your first Lifestyle estate — Coastal Residence or beyond.',
    flair: 'Home Desk',
  },
  {
    id: 'elysiumEmpire',
    label: 'Elysium Empire',
    kind: 'estateId',
    target: 1,
    estateId: 'privateIslandElysium',
    blurb: 'Own Private Island Elysium. Endgame lifestyle secured.',
    flair: 'Island Empire',
  },
];

export const KNOWN_MEGA_GOAL_IDS = new Set(MEGA_GOALS.map((g) => g.id));
const MEGA_GOAL_BY_ID = new Map(MEGA_GOALS.map((g) => [g.id, g]));

/**
 * @param {string} id
 * @returns {MegaGoal | null}
 */
export function getMegaGoal(id) {
  return MEGA_GOAL_BY_ID.get(id) || null;
}

/**
 * @param {MegaGoal} goal
 * @param {object} state
 * @param {{
 *   netWorth?: number,
 *   blackMarketPool?: Array<any>,
 *   seatItem?: any,
 *   salonPool?: Array<any>,
 * }} [ctx]
 */
export function getMegaGoalProgress(goal, state = {}, ctx = {}) {
  const nw = Math.max(0, Number(ctx.netWorth) || 0);
  const collectionOpts = {
    blackMarketPool: ctx.blackMarketPool || [],
    seatItem: ctx.seatItem || null,
    salonPool: ctx.salonPool || [],
  };

  if (goal.kind === 'netWorth') {
    const current = nw;
    const target = goal.target;
    const complete = current >= target;
    const pct = target > 0 ? Math.min(100, Math.max(0, Math.round((current / target) * 100))) : 100;
    return { current, target, pct, complete, unit: 'nw' };
  }

  if (goal.kind === 'office') {
    const needId = goal.officeId || 'empire';
    const have = getOfficeTierIndex(state.officeTierId);
    const need = getOfficeTierIndex(needId);
    const complete = have >= need;
    const pct = need > 0 ? Math.min(100, Math.round((have / need) * 100)) : (complete ? 100 : 0);
    return { current: have, target: need, pct, complete, unit: 'office' };
  }

  if (goal.kind === 'licenses') {
    const held = new Set(['retail', ...(Array.isArray(state.licenses) ? state.licenses : [])]);
    const current = held.size;
    const target = goal.target;
    const complete = current >= target;
    const pct = target > 0 ? Math.min(100, Math.max(0, Math.round((current / target) * 100))) : 100;
    return { current, target, pct, complete, unit: 'licenses' };
  }

  if (goal.kind === 'collectionPct') {
    const { pct: ownedPct, owned, total } = getCollectionCompletion(state, collectionOpts);
    const target = goal.target;
    const complete = ownedPct >= target;
    const pct = target > 0 ? Math.min(100, Math.max(0, Math.round((ownedPct / target) * 100))) : 100;
    return { current: ownedPct, target, pct, complete, unit: 'pct', owned, total };
  }

  if (goal.kind === 'legendaryOwned') {
    const entries = getCollectionLogEntries(state, collectionOpts)
      .filter((e) => e.rarity === 'legendary');
    const total = entries.length;
    const owned = entries.filter((e) => e.owned).length;
    const complete = total > 0 && owned >= total;
    const pct = total > 0 ? Math.min(100, Math.round((owned / total) * 100)) : 100;
    return { current: owned, target: total || 1, pct, complete, unit: 'count' };
  }

  if (goal.kind === 'estateOwned') {
    const current = Array.isArray(state.estateOwned) ? state.estateOwned.length : 0;
    const target = Math.max(1, Number(goal.target) || 1);
    const complete = current >= target;
    const pct = target > 0 ? Math.min(100, Math.max(0, Math.round((current / target) * 100))) : 100;
    return { current, target, pct, complete, unit: 'count' };
  }

  if (goal.kind === 'estateId') {
    const needId = goal.estateId || '';
    const have = Array.isArray(state.estateOwned) && state.estateOwned.includes(needId);
    const complete = !!have;
    return { current: have ? 1 : 0, target: 1, pct: complete ? 100 : 0, complete, unit: 'estate' };
  }

  return { current: 0, target: 1, pct: 0, complete: false, unit: 'unknown' };
}

function claimedSet(state) {
  const raw = state.meta?.megaGoalsClaimed;
  return new Set(Array.isArray(raw) ? raw.filter(Boolean) : []);
}

/**
 * Ordered catalog: kind priority, then catalog order.
 * @returns {MegaGoal[]}
 */
export function listMegaGoalsOrdered() {
  return [...MEGA_GOALS].sort((a, b) => {
    const pa = KIND_PRIORITY[a.kind] ?? 99;
    const pb = KIND_PRIORITY[b.kind] ?? 99;
    if (pa !== pb) return pa - pb;
    return MEGA_GOALS.indexOf(a) - MEGA_GOALS.indexOf(b);
  });
}

/**
 * Next active dream: first unclaimed goal (complete or in-progress).
 * @param {object} state
 * @param {object} [ctx]
 */
export function getActiveMegaGoal(state = {}, ctx = {}) {
  const claimed = claimedSet(state);
  const ordered = listMegaGoalsOrdered();
  for (const goal of ordered) {
    if (claimed.has(goal.id)) continue;
    const progress = getMegaGoalProgress(goal, state, ctx);
    return {
      goal,
      progress,
      claimable: !!progress.complete,
      allDone: false,
    };
  }
  const last = ordered[ordered.length - 1];
  const progress = last ? getMegaGoalProgress(last, state, ctx) : null;
  return {
    goal: last || null,
    progress,
    claimable: false,
    allDone: true,
  };
}

/**
 * @param {object} state
 * @param {string} goalId
 * @param {object} [ctx]
 */
export function canClaimMegaGoal(state, goalId, ctx = {}) {
  const goal = getMegaGoal(goalId);
  if (!goal) return { ok: false, reason: 'Unknown goal', code: 'unknown' };
  if (claimedSet(state).has(goal.id)) return { ok: false, reason: 'Already claimed', code: 'claimed' };
  const progress = getMegaGoalProgress(goal, state, ctx);
  if (!progress.complete) return { ok: false, reason: 'Goal not complete', code: 'incomplete' };
  return { ok: true, goal, progress };
}

/**
 * Claim = flair only (no REP, no cash).
 * @param {object} state
 * @param {string} goalId
 * @param {object} [ctx]
 */
export function claimMegaGoal(state, goalId, ctx = {}) {
  const gate = canClaimMegaGoal(state, goalId, ctx);
  if (!gate.ok) return { ok: false, msg: gate.reason, code: gate.code };
  if (!state.meta || typeof state.meta !== 'object') state.meta = {};
  if (!Array.isArray(state.meta.megaGoalsClaimed)) state.meta.megaGoalsClaimed = [];
  state.meta.megaGoalsClaimed.push(gate.goal.id);
  if (gate.goal.flair) {
    state.meta.megaGoalFlair = String(gate.goal.flair).slice(0, 40);
  }
  return { ok: true, goal: gate.goal, flair: gate.goal.flair || null };
}

/**
 * Drop forged claims that are not actually complete.
 * @param {string[]} claims
 * @param {object} state
 * @param {object} [ctx]
 * @returns {string[]}
 */
export function sanitizeMegaGoalsClaimed(claims, state = {}, ctx = {}) {
  if (!Array.isArray(claims)) return [];
  const seen = new Set();
  const out = [];
  for (const id of claims) {
    if (!KNOWN_MEGA_GOAL_IDS.has(id) || seen.has(id)) continue;
    const goal = getMegaGoal(id);
    if (!goal) continue;
    if (!getMegaGoalProgress(goal, state, ctx).complete) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** @deprecated Keep for dashboard tests — thin NW-only helper. */
export function getNextNetWorthMilestone(netWorth = 0) {
  const nw = Math.max(0, Number(netWorth) || 0);
  const nwGoals = MEGA_GOALS.filter((g) => g.kind === 'netWorth');
  for (const m of nwGoals) {
    if (nw < m.target) {
      const pct = Math.min(100, Math.max(0, Math.round((nw / m.target) * 100)));
      return { id: m.id, label: m.label, target: m.target, current: nw, pct, complete: false };
    }
  }
  const last = nwGoals[nwGoals.length - 1];
  return { id: last.id, label: last.label, target: last.target, current: nw, pct: 100, complete: true };
}
