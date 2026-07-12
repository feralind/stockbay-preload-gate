// @ts-check
/** Reputation, daily challenges, equity history */

import { getRepRank } from './config.js';

export function createMetaState() {
  return {
    reputation: 0,
    speed: 1,
    equityHistory: [],
    challenge: null,
    challengeHistory: [],
    dayBuys: 0,
    daySells: 0,
    dayBestTrade: 0,
    dayWorstTrade: 0,
    dayFees: 0,
    dayStaffActions: 0,
    /** One-time perk unlock callouts already shown (perkId → true). */
    perkCalloutsShown: {},
    /** One-time Portfolio metrics tour completed. */
    portfolioTourShown: false,
    /** One-time coachmarks for scary risk moments / honesty about the sim. */
    marginCallCoachShown: false,
    circuitHaltCoachShown: false,
    simStatusCoachShown: false,
    blackMarketLegendCoachShown: false,
    /** Desk Prestige REP granted today from equipped vault cosmetics. */
    vaultAuraRepToday: 0,
    /** Prestige title from Collection Log full-catalog claim. */
    collectionFlair: null,
  };
}

export function adjustReputation(meta, delta, reason) {
  const before = meta.reputation || 0;
  meta.reputation = Math.max(0, Math.min(99999, Math.round(before + delta)));
  return { reputation: meta.reputation, delta: meta.reputation - before, reason };
}

/** Scale REP from closed-trade P&L */
export function repFromPnL(pnl) {
  if (pnl > 50) return Math.min(25, 6 + Math.floor(pnl / 40));
  if (pnl > 0) return 4;
  if (pnl > -25) return -2;
  return Math.max(-20, -4 + Math.floor(pnl / 50));
}

export function recordEquityPoint(meta, equity, day, phase) {
  meta.equityHistory.push({ t: Date.now(), equity, day, phase });
  if (meta.equityHistory.length > 200) meta.equityHistory.shift();
}

const CHALLENGE_POOL = [
  { id: 'green_100', name: 'Green Machine', desc: 'Finish the day with +$100 equity', target: 100, metric: 'equityDelta', reward: 50, rep: 40 },
  { id: 'trade_5', name: 'Active Desk', desc: 'Complete 5 trades today', target: 5, metric: 'trades', reward: 40, rep: 25 },
  { id: 'snipe_deal', name: 'Deal Hunter', desc: 'Buy from a GREAT DEAL listing', target: 1, metric: 'dealBuys', reward: 45, rep: 30 },
  { id: 'no_loss', name: 'Iron Hands', desc: 'End the day without a losing closed trade', target: 0, metric: 'losingTrades', reward: 60, rep: 50, invert: true },
  { id: 'staff_10', name: 'Delegation', desc: 'Let staff complete 10 actions', target: 10, metric: 'staffActions', reward: 35, rep: 20 },
  { id: 'cash_up', name: 'Liquidity Flex', desc: 'Increase cash by $150 today', target: 150, metric: 'cashDelta', reward: 55, rep: 35 },
];

export function rollDailyChallenge(day) {
  const c = CHALLENGE_POOL[day % CHALLENGE_POOL.length];
  return {
    ...c,
    day,
    progress: 0,
    completed: false,
    claimed: false,
    dealBuys: 0,
    losingTrades: 0,
  };
}

export function updateChallengeProgress(meta, stats) {
  const ch = meta.challenge;
  if (!ch || ch.completed) return;
  let progress = 0;
  switch (ch.metric) {
    case 'equityDelta': progress = stats.equityDelta || 0; break;
    case 'trades': progress = stats.trades || 0; break;
    case 'dealBuys': progress = ch.dealBuys || 0; break;
    case 'losingTrades': progress = ch.losingTrades || 0; break;
    case 'staffActions': progress = stats.staffActions || 0; break;
    case 'cashDelta': progress = stats.cashDelta || 0; break;
    default: progress = 0;
  }
  ch.progress = progress;
  if (ch.invert) {
    if ((stats.trades || 0) >= 1 && progress <= ch.target) ch.completed = true;
  } else if (progress >= ch.target) {
    ch.completed = true;
  }
}

export function claimChallenge(meta, portfolio) {
  const ch = meta.challenge;
  if (!ch?.completed || ch.claimed) return { ok: false };
  ch.claimed = true;
  portfolio.cash += ch.reward;
  adjustReputation(meta, ch.rep, ch.name);
  meta.challengeHistory.unshift({ ...ch, claimedAt: Date.now() });
  return { ok: true, reward: ch.reward, rep: ch.rep, name: ch.name };
}

export function resetDayCounters(meta) {
  meta.dayBuys = 0;
  meta.daySells = 0;
  meta.dayBestTrade = 0;
  meta.dayWorstTrade = 0;
  meta.dayFees = 0;
  meta.dayStaffActions = 0;
  meta.vaultAuraRepToday = 0;
}

export function recordClosedTrade(meta, pnl) {
  if (pnl >= meta.dayBestTrade) meta.dayBestTrade = pnl;
  if (pnl < meta.dayWorstTrade) meta.dayWorstTrade = pnl;
  if (pnl < 0 && meta.challenge) meta.challenge.losingTrades = (meta.challenge.losingTrades || 0) + 1;
}

export function repTitle(rep) {
  return getRepRank(rep).name;
}
