// @ts-check
/**
 * Thin Phase C — process-win callouts for day summary (text only, no REP/cash).
 * Sized-right uses optional notionalPctAtEntry stored at open; old positions skip silently.
 * Patience-paid needs MAE (worstUnrealizedPct) + voluntary exit tagging.
 */

/** Max notional / equity at open to earn “Sized right”. */
export const PROCESS_WIN_MAX_SIZE_PCT = 0.25;

/** Adverse excursion (fraction of avg) required before a green voluntary exit counts as patience. */
export const PROCESS_WIN_DRAWDOWN_PCT = 0.05;

/** @typedef {'voluntary' | 'stop_loss' | 'take_profit' | 'margin'} ExitReason */

/**
 * @param {unknown} reason
 * @returns {ExitReason}
 */
export function normalizeExitReason(reason) {
  if (reason === 'stop_loss' || reason === 'take_profit' || reason === 'margin') return reason;
  return 'voluntary';
}

/**
 * @param {{ type?: string }} ev
 * @returns {boolean}
 */
function isLoanPayment(ev) {
  return ev?.type === 'payment';
}

/**
 * @param {{ type?: string }} ev
 * @returns {boolean}
 */
function isLoanLate(ev) {
  return ev?.type === 'late';
}

/**
 * Update running MAE on open longs/shorts from a price lookup.
 * @param {{ longs?: object, shorts?: object }} portfolio
 * @param {(sym: string) => number|null|undefined} getPrice
 */
export function updateOpenPositionMae(portfolio, getPrice) {
  if (!portfolio || typeof getPrice !== 'function') return;
  for (const [sym, pos] of Object.entries(portfolio.longs || {})) {
    if (!pos?.shares || !(pos.avgPrice > 0)) continue;
    const px = Number(getPrice(sym));
    if (!(px > 0)) continue;
    const unreal = (px - pos.avgPrice) / pos.avgPrice;
    if (!Number.isFinite(unreal)) continue;
    if (pos.worstUnrealizedPct == null || unreal < pos.worstUnrealizedPct) {
      pos.worstUnrealizedPct = unreal;
    }
  }
  for (const [sym, pos] of Object.entries(portfolio.shorts || {})) {
    if (!pos?.shares || !(pos.avgPrice > 0)) continue;
    const px = Number(getPrice(sym));
    if (!(px > 0)) continue;
    const unreal = (pos.avgPrice - px) / pos.avgPrice;
    if (!Number.isFinite(unreal)) continue;
    if (pos.worstUnrealizedPct == null || unreal < pos.worstUnrealizedPct) {
      pos.worstUnrealizedPct = unreal;
    }
  }
}

/**
 * If this close qualifies, queue a one-shot patience chip for day-end.
 * Forced / SL / TP exits never count.
 * @param {{ dayPatienceWins?: object[] }} portfolio
 * @param {{
 *   exitReason?: string,
 *   pnl?: number,
 *   worstUnrealizedPct?: number|null,
 *   sym?: string,
 * }} detail
 * @returns {boolean}
 */
export function maybeRecordPatienceWin(portfolio, detail = {}) {
  if (!portfolio) return false;
  const reason = normalizeExitReason(detail.exitReason);
  if (reason !== 'voluntary') return false;
  const pnl = Number(detail.pnl);
  if (!(pnl >= 0)) return false;
  const mae = detail.worstUnrealizedPct;
  if (mae == null || !Number.isFinite(mae) || mae > -PROCESS_WIN_DRAWDOWN_PCT) return false;
  if (!Array.isArray(portfolio.dayPatienceWins)) portfolio.dayPatienceWins = [];
  // One chip per day is enough feedback
  if (portfolio.dayPatienceWins.some((w) => w?.id === 'patience_paid')) return false;
  const pct = Math.round(Math.abs(mae) * 100);
  portfolio.dayPatienceWins.push({
    id: 'patience_paid',
    text: `Patience paid — held through a ${pct}% drawdown, then closed green${detail.sym ? ` (${detail.sym})` : ''}.`,
  });
  return true;
}

/**
 * Collect 0–N process wins for the day wrap-up. Never fabricates.
 * @param {{
 *   loanEvents?: object[],
 *   portfolio?: { longs?: object, shorts?: object, dayPatienceWins?: object[], dayLastRedExit?: object|object[], dayChased?: boolean },
 *   day?: number,
 * }} opts
 * @returns {{ id: string, text: string }[]}
 */
export function collectProcessWins({ loanEvents = [], portfolio = {}, day = 1 } = {}) {
  const wins = [];
  const events = Array.isArray(loanEvents) ? loanEvents : [];

  const paid = events.some(isLoanPayment);
  const late = events.some(isLoanLate);
  if (paid && !late) {
    wins.push({
      id: 'paid_on_time',
      text: 'Paid on time — loan auto-pay cleared with no late hit.',
    });
  }

  const pcts = [];
  for (const pos of Object.values(portfolio.longs || {})) {
    const pct = pos?.notionalPctAtEntry;
    if (pct == null || !Number.isFinite(pct)) continue;
    const openDay = pos.lots?.[0]?.openedDay;
    if (openDay !== day) continue;
    pcts.push(pct);
  }
  for (const pos of Object.values(portfolio.shorts || {})) {
    const pct = pos?.notionalPctAtEntry;
    if (pct == null || !Number.isFinite(pct)) continue;
    if (pos.openedDay !== day) continue;
    pcts.push(pct);
  }

  if (pcts.length > 0 && pcts.every((p) => p <= PROCESS_WIN_MAX_SIZE_PCT)) {
    const maxPct = Math.max(...pcts);
    wins.push({
      id: 'sized_right',
      text: `Sized right — largest new ticket was ${(maxPct * 100).toFixed(0)}% of equity (≤${Math.round(PROCESS_WIN_MAX_SIZE_PCT * 100)}%).`,
    });
  }

  const patience = Array.isArray(portfolio.dayPatienceWins) ? portfolio.dayPatienceWins : [];
  for (const win of patience) {
    if (win?.id && win?.text && !wins.some((w) => w.id === win.id)) {
      wins.push({ id: win.id, text: win.text });
    }
  }

  const redExitMarkers = Array.isArray(portfolio.dayLastRedExit)
    ? portfolio.dayLastRedExit
    : (portfolio.dayLastRedExit ? [portfolio.dayLastRedExit] : []);
  const stayedOut = redExitMarkers.some((m) => m?.day === day && m?.sym) && portfolio.dayChased !== true;
  if (stayedOut) {
    wins.push({
      id: 'no_chase',
      text: 'No chase — took the red exit and did not rebuy it today.',
    });
  }

  return wins;
}
