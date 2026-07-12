// @ts-check
/**
 * Capital gains tax — lot holding period → ST/LT rates, settled on Tax Day.
 */
import { getDayCount } from './market.js';

/** Game trading days treated as one year for LT eligibility. */
export const GAME_YEAR_DAYS = 252;
/** Settle accrued tax every N game days (quarterly cadence). */
export const TAX_DAY_INTERVAL = 63;
export const SHORT_TERM_TAX_RATE = 0.15;
export const LONG_TERM_TAX_RATE = 0.05;

export function createTaxAccrual() {
  return {
    shortTermGain: 0,
    longTermGain: 0,
    shortTermLoss: 0,
    longTermLoss: 0,
  };
}

export function ensureTaxState(portfolio) {
  if (!portfolio.taxAccrual || typeof portfolio.taxAccrual !== 'object') {
    portfolio.taxAccrual = createTaxAccrual();
  }
  if (!Number.isFinite(Number(portfolio.taxOwed))) portfolio.taxOwed = 0;
  return portfolio;
}

export function isLongTermHold(openedDay, sellDay = getDayCount()) {
  const opened = Math.max(1, Math.floor(Number(openedDay) || 1));
  const sell = Math.max(1, Math.floor(Number(sellDay) || 1));
  return (sell - opened) >= GAME_YEAR_DAYS;
}

/** Record a realized PnL slice into ST/LT accrual buckets (gains vs losses). */
export function accrueTaxablePnL(portfolio, pnl, { openedDay, sellDay } = {}) {
  ensureTaxState(portfolio);
  const amount = Number(pnl) || 0;
  if (!amount) return;
  const lt = isLongTermHold(openedDay, sellDay ?? getDayCount());
  const a = portfolio.taxAccrual;
  if (amount > 0) {
    if (lt) a.longTermGain += amount;
    else a.shortTermGain += amount;
  } else {
    if (lt) a.longTermLoss += -amount;
    else a.shortTermLoss += -amount;
  }
}

/**
 * Pure: tax due from accrual + prior unpaid.
 * Losses offset gains within the same term; no cross-term offset (simple desk rules).
 */
export function computeTaxBill(accrual, taxOwed = 0) {
  const a = accrual || createTaxAccrual();
  const netST = Math.max(0, (a.shortTermGain || 0) - (a.shortTermLoss || 0));
  const netLT = Math.max(0, (a.longTermGain || 0) - (a.longTermLoss || 0));
  const periodTax = netST * SHORT_TERM_TAX_RATE + netLT * LONG_TERM_TAX_RATE;
  const prior = Math.max(0, Number(taxOwed) || 0);
  return {
    netST,
    netLT,
    periodTax: +periodTax.toFixed(2),
    priorOwed: +prior.toFixed(2),
    totalDue: +(periodTax + prior).toFixed(2),
  };
}

export function isTaxDay(gameDay, interval = TAX_DAY_INTERVAL) {
  const d = Math.floor(Number(gameDay) || 0);
  return d > 0 && d % Math.max(1, interval) === 0;
}

/**
 * Settle Tax Day — debit cash, carry unpaid as taxOwed, clear accrual.
 */
export function settleTaxDay(portfolio, gameDay = getDayCount()) {
  ensureTaxState(portfolio);
  const bill = computeTaxBill(portfolio.taxAccrual, portfolio.taxOwed);
  const due = bill.totalDue;
  if (!(due > 0)) {
    portfolio.taxAccrual = createTaxAccrual();
    portfolio.taxOwed = 0;
    return { ok: true, paid: 0, owed: 0, bill, gameDay };
  }
  const available = Math.max(0, portfolio.cash || 0);
  const paid = Math.min(due, available);
  portfolio.cash -= paid;
  portfolio.taxOwed = +(due - paid).toFixed(2);
  portfolio.taxAccrual = createTaxAccrual();
  if (Array.isArray(portfolio.history)) {
    portfolio.history.unshift({
      action: 'TAX',
      shares: 0,
      price: 0,
      pnl: -paid,
      taxDue: due,
      taxPaid: paid,
      taxOwed: portfolio.taxOwed,
      netST: bill.netST,
      netLT: bill.netLT,
      time: Date.now(),
      day: gameDay,
    });
    if (portfolio.history.length > 200) portfolio.history.pop();
  }
  return { ok: true, paid, owed: portfolio.taxOwed, bill, gameDay };
}

/** FIFO lot helper — returns realized slices { pnl, openedDay }. */
export function consumeLotsFifo(lots, qty, sellPrice) {
  const out = [];
  let left = Math.floor(Number(qty) || 0);
  const px = Number(sellPrice);
  if (!(left > 0) || !(px > 0) || !Array.isArray(lots)) return out;
  while (left > 0 && lots.length) {
    const lot = lots[0];
    const take = Math.min(left, lot.shares || 0);
    if (!(take > 0)) {
      lots.shift();
      continue;
    }
    const basis = Number(lot.avgPrice) || px;
    out.push({
      pnl: (px - basis) * take,
      openedDay: lot.openedDay ?? 1,
      shares: take,
    });
    lot.shares -= take;
    left -= take;
    if (lot.shares <= 0) lots.shift();
  }
  return out;
}
