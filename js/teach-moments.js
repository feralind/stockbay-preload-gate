// @ts-check
/**
 * Teach-moment shell — quiet, one-shot lessons keyed on real desk events.
 *
 * Pattern mirrors the margin-call coachmark: each moment fires once per save
 * (flagged in meta.teachMomentsShown), stays to 1–2 plain sentences, and never
 * repeats. Day-end lessons surface as a single recap chip, not a popup barrage.
 */

/** @type {Record<string, { text: string }>} */
export const TEACH_MOMENTS = {
  firstLoss: {
    text: 'First loss booked. Losses are tuition, not failure — what matters is that one loss stays small enough that the next good trade pays it back.',
  },
  firstInterest: {
    text: 'Your loan just accrued its first interest at day-end. Debt quietly charges you every day you hold it — that daily drip is why cheap borrowing still needs a plan.',
  },
  firstLate: {
    text: 'A loan payment went out late because cash ran dry. Payment history is the heaviest part of a credit score — keep enough cash for the daily auto-pay before sizing new trades.',
  },
  firstOversized: {
    text: 'That position is more than half your equity in one name. Pros size so one bad trade cannot end the run — consider smaller entries until the account can absorb a miss.',
  },
  firstRevengeCooloff: {
    text: 'Trading desk suspended for 30 seconds — cool-down from risk management. After a blowup loss, pause before revenge sizing. Watch the tape; do not chase the hole.',
  },
  firstIvCrush: {
    text: 'Your option fell while the stock went your way? The market calmed down, and calm is cheap. You just felt IV crush — when implied volatility drops, option premiums deflate fast.',
  },
  firstEarningsHold: {
    text: 'You held through an earnings print. Overnight gaps are the classic options coin-flip — the premium you paid was the price of that lottery ticket.',
  },
  firstFedEvent: {
    text: 'A Fed headline just moved the tape. Policy rates reprice the whole desk — growth, housing, and anything that lives on cheap money feel it first.',
  },
  firstOilEvent: {
    text: 'An oil shock just rotated the book. Energy can rip while transports and discretionary pay the fuel bill — sector stories matter as much as the index.',
  },
};

/** One-shot license-earned moments use ids like license_series7. */
export function teachIdForLicense(licenseId) {
  return `license_${licenseId}`;
}

/** @param {object} meta @param {string} id */
export function teachMomentShown(meta, id) {
  return !!meta?.teachMomentsShown?.[id];
}

/**
 * Mark a moment shown. Returns true only when it was newly marked
 * (i.e. the caller should actually display it).
 * @param {object} meta @param {string} id
 */
export function markTeachMoment(meta, id) {
  if (!meta || !id) return false;
  if (!meta.teachMomentsShown || typeof meta.teachMomentsShown !== 'object') {
    meta.teachMomentsShown = {};
  }
  if (meta.teachMomentsShown[id]) return false;
  meta.teachMomentsShown[id] = true;
  return true;
}

/**
 * One "what today taught" sentence for the day summary — only when a lesson
 * event actually fired today. Priority: late pay > thin reserves > utilization.
 * @param {{ loanEvents?: Array<{type?: string}> }} daySummary
 * @returns {string} empty string when no lesson today
 */
export function lessonLineForDay(daySummary = {}) {
  const events = Array.isArray(daySummary.loanEvents) ? daySummary.loanEvents : [];
  if (events.some((e) => e?.type === 'late')) {
    return 'Today taught: a missed payment costs more than the fee — the credit hit follows you to every future loan quote.';
  }
  if (events.some((e) => e?.type === 'reserve')) {
    return 'Today taught: lenders read company debt above cash as thin reserves — hold a cash cushion against what you owe.';
  }
  if (events.some((e) => e?.type === 'utilization')) {
    return 'Today taught: running credit lines near their limit pressures your score even when payments are on time.';
  }
  if (events.some((e) => e?.type === 'paid_off')) {
    return 'Today taught: a loan paid off in full is the cheapest credit boost there is — aged, finished debt reads as trust.';
  }
  const majors = Array.isArray(daySummary.majorEvents) ? daySummary.majorEvents : [];
  if (majors.some((id) => id === 'fed_hike' || id === 'fed_cut')) {
    return 'Today taught: when the Fed speaks, duration moves first — rates are the quiet lever behind growth and housing prices.';
  }
  if (majors.some((id) => id === 'oil_spike' || id === 'oil_crash')) {
    return 'Today taught: energy shocks rotate the book — winners and losers sit in different sectors of the same headline.';
  }
  if (majors.includes('recession_scare')) {
    return 'Today taught: a soft-data scare can make the tape feel choppy even when the day is still a trend underneath — size down until it settles.';
  }
  if (majors.includes('housing_rates') || majors.includes('dollar_spike')) {
    return 'Today taught: rate-sensitive stories hit harder when policy is already far from normal — the macro backdrop scales the punch.';
  }
  return '';
}

/**
 * Track consecutive days of negative net worth and produce a quiet recovery
 * hint once the slump is 5+ days old. Mutates state.stats.negativeNwDays.
 * @param {object} state
 * @param {number} equity net equity after settlement
 * @returns {string} empty string when no hint needed
 */
export function updateRecoveryHint(state, equity) {
  if (!state.stats) state.stats = {};
  if (equity < 0) {
    state.stats.negativeNwDays = (state.stats.negativeNwDays || 0) + 1;
  } else {
    state.stats.negativeNwDays = 0;
    return '';
  }
  if (state.stats.negativeNwDays < 5) return '';
  return 'Net worth has been negative for '
    + `${state.stats.negativeNwDays} days. Levers: trim payroll, pay down the highest-APR loan first, and size positions down until the book is green again.`;
}

/**
 * Which one-shot teach moments do today's loan events justify?
 * Pure check — caller marks + displays.
 * @param {Array<{type?: string}>} loanEvents
 * @param {object} meta
 * @returns {string[]} teach ids not yet shown, in priority order
 */
export function pendingLoanTeachMoments(loanEvents = [], meta = {}) {
  const ids = [];
  const events = Array.isArray(loanEvents) ? loanEvents : [];
  if (events.some((e) => e?.type === 'late') && !teachMomentShown(meta, 'firstLate')) {
    ids.push('firstLate');
  }
  if (events.some((e) => e?.type === 'payment') && !teachMomentShown(meta, 'firstInterest')) {
    ids.push('firstInterest');
  }
  return ids;
}

/**
 * Pure: did a long option just feel IV crush?
 * Favorable underlying day move, mark below entry cost, live IV clearly below entry IV.
 * @param {{ type?: string, premium?: number, qty?: number, vol?: number, entryVol?: number }} opt
 * @param {{ changePct?: number, markedValue?: number, liveVol?: number }} ctx
 */
export function detectIvCrush(opt, ctx = {}) {
  if (!opt) return false;
  const type = String(opt.type || '').toLowerCase();
  const changePct = Number(ctx.changePct) || 0;
  const favorable = type === 'call' ? changePct >= 1.5 : type === 'put' ? changePct <= -1.5 : false;
  if (!favorable) return false;
  const cost = Math.max(0, (Number(opt.premium) || 0) * (Number(opt.qty) || 0) * 100);
  const marked = Number(ctx.markedValue);
  if (!(cost > 0) || !Number.isFinite(marked) || marked >= cost * 0.98) return false;
  const entryVol = Number(opt.entryVol ?? opt.vol) || 0;
  const liveVol = Number(ctx.liveVol) || 0;
  if (!(entryVol > 0) || !(liveVol > 0)) return false;
  // Live IV at least ~12% relative cooler than what you paid for
  return liveVol <= entryVol * 0.88;
}

/**
 * Pure: player held stock or options through an earnings gap print.
 * @param {Array<{ sym?: string }>} earningsResults
 * @param {object} portfolio
 */
export function heldThroughEarnings(earningsResults = [], portfolio = {}) {
  if (!Array.isArray(earningsResults) || !earningsResults.length) return false;
  const longs = portfolio.longs || {};
  const shorts = portfolio.shorts || {};
  const opts = Array.isArray(portfolio.options) ? portfolio.options : [];
  return earningsResults.some((r) => {
    const sym = String(r?.sym || '').toUpperCase();
    if (!sym) return false;
    if (longs[sym]?.shares > 0 || shorts[sym]?.shares > 0) return true;
    return opts.some((o) => String(o?.sym || '').toUpperCase() === sym);
  });
}
