// @ts-check
/**
 * End-of-day settlement core — challenge, loans, payroll, day REP, options expiry, summary DTO.
 * UI (toasts, day-summary modal, clock/pause) stays in app.js.
 */
import { getNetEquity, settleExpiredOptions } from './portfolio.js';
import { getFirmDebt, processDailyLoans } from './finance.js';
import { getDayStats } from './market.js';
import { payDailySalaries } from './staff.js';
import {
  updateChallengeProgress,
  claimChallenge,
  adjustReputation,
} from './meta.js';
import { recordBestRun } from './leaderboard.js';
import { repossessVaultForLateLoans, getVaultSlotForItem, getVaultItem } from './vault.js';
import { setProfileCosmetic } from './profile.js';
import { processDailyEstates, syncEstateDerived } from './estates.js';

/** Soft-taper loan auto-pay REP so late ranks don't farm as fast as early Desk Hand. */
export function taperLoanRep(rep, currentReputation) {
  let next = Number(rep) || 0;
  if (!(next > 0)) return next;
  const cur = Number(currentReputation) || 0;
  if (cur >= 400) return Math.max(1, Math.round(next * 0.5));
  if (cur >= 200) return Math.max(1, Math.round(next * 0.75));
  return next;
}

/**
 * Mutate run state for day close; return summary DTO + toast hints.
 * Does not show UI, stop the clock, or save.
 *
 * @param {object} state
 * @param {number} day
 * @returns {{
 *   equity: number,
 *   debt: number,
 *   stats: object,
 *   staffActions: number,
 *   challengeDone: boolean,
 *   challengeReward: number,
 *   dayRepDelta: number,
 *   loanEvents: object[],
 *   payroll: number,
 *   bestRun: { isRecord?: boolean },
 *   expiredOpts: object[],
 *   daySummary: object,
 * }}
 */
export function runDayEndSettlement(state, day) {
  syncEstateDerived(state);
  const debt = getFirmDebt(state.finance, state.estateCreditUsed);
  const equity = getNetEquity(state.portfolio, debt);
  const stats = getDayStats(equity, state.portfolio.cash, debt);
  const staffActions = (state.staff || []).reduce((n, s) => n + (s.actionsToday || 0), 0);
  state.meta.dayStaffActions = staffActions;

  updateChallengeProgress(state.meta, {
    ...stats,
    staffActions,
    trades: (state.meta.dayBuys || 0) + (state.meta.daySells || 0),
  });

  let challengeDone = false;
  let challengeReward = 0;
  if (state.meta.challenge?.completed && !state.meta.challenge.claimed) {
    const cr = claimChallenge(state.meta, state.portfolio);
    if (cr.ok) {
      challengeDone = true;
      challengeReward = cr.reward;
    }
  }

  let dayRepDelta = 0;
  const addRep = (delta, reason) => {
    dayRepDelta += adjustReputation(state.meta, delta, reason).delta;
  };

  const loanEvents = processDailyLoans(state.finance, state.portfolio, day);
  const estateDay = processDailyEstates(state);
  const repossessions = repossessVaultForLateLoans(state, loanEvents);
  for (const repo of repossessions) {
    for (const id of repo.seized) {
      const item = getVaultItem(id);
      const slot = getVaultSlotForItem(item);
      if (slot) setProfileCosmetic(slot, null);
    }
  }
  for (const ev of loanEvents) {
    if (!ev.rep) continue;
    const rep = taperLoanRep(ev.rep, state.meta.reputation || 0);
    addRep(rep, ev.type);
  }

  const payroll = payDailySalaries(state);
  if (!state.stats) state.stats = {};

  if (stats.equityDelta >= 100) {
    state.stats.greenDays = (state.stats.greenDays || 0) + 1;
    state.stats.greenStreak = (state.stats.greenStreak || 0) + 1;
    addRep(20, 'green_day');
    if (state.stats.greenStreak > 0 && state.stats.greenStreak % 3 === 0) {
      addRep(8, 'green_streak');
    }
  } else if (stats.equityDelta < -100) {
    state.stats.greenStreak = 0;
    addRep(-10, 'red_day');
  } else {
    state.stats.greenStreak = 0;
    addRep(3, 'day_complete');
  }

  const bestRun = recordBestRun({
    equity,
    day,
    rep: state.meta.reputation,
    cash: state.portfolio.cash,
  }) || {};

  const expiredOpts = settleExpiredOptions(state.portfolio, day);

  const daySummary = {
    ...stats,
    day,
    payroll,
    fees: state.meta.dayFees || 0,
    staffActions,
    buys: state.meta.dayBuys || 0,
    sells: state.meta.daySells || 0,
    bestTrade: state.meta.dayBestTrade || 0,
    worstTrade: state.meta.dayWorstTrade || 0,
    challengeDone,
    challengeReward,
    repDelta: dayRepDelta,
    loanEvents,
    estateEvents: estateDay.events,
    estateNetIncome: estateDay.netIncome,
    optionsExpired: expiredOpts.length,
    repossessions,
  };

  return {
    equity,
    debt,
    stats,
    staffActions,
    challengeDone,
    challengeReward,
    dayRepDelta,
    loanEvents,
    estateEvents: estateDay.events,
    repossessions,
    payroll,
    bestRun,
    expiredOpts,
    daySummary,
  };
}
