// @ts-check
/**
 * Corporate calendar — earnings gaps + dividends (deterministic from game day + symbol).
 * Quarter length is 63 game days (~one trading quarter at desk pace).
 */
import { ALL_SYMBOLS } from './symbols.js';
import { getCachedQuote } from './api.js';
import { applyPriceShock } from './market.js';

export const QUARTER_LEN = 63;

/** Annual dividend yield for realistic payers (quarterly = yield/4 of spot). */
export const DIVIDEND_PAYERS = {
  KO: 0.030,
  PG: 0.025,
  JNJ: 0.028,
  T: 0.055,
  VZ: 0.048,
  PEP: 0.028,
  XOM: 0.032,
  CVX: 0.035,
  IBM: 0.040,
  MRK: 0.028,
  ABBV: 0.035,
  MO: 0.080,
  PM: 0.050,
  WMT: 0.012,
  MCD: 0.022,
  HD: 0.024,
  V: 0.008,
  MA: 0.006,
  JPM: 0.024,
  BAC: 0.028,
};

let appliedEarningsDay = -1;
let appliedDividendDay = -1;

export function hashSym(sym) {
  let h = 0;
  const s = String(sym || '').toUpperCase();
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function quarterDay(gameDay) {
  const d = Math.max(1, Math.floor(Number(gameDay) || 1));
  return ((d - 1) % QUARTER_LEN) + 1;
}

/** Earnings day within each quarter (5–59) — stable per symbol. */
export function earningsDayInQuarter(sym) {
  return (hashSym(sym) % 55) + 5;
}

/** Dividend ex-day within each quarter (10–49) — offset from earnings. */
export function dividendExDayInQuarter(sym) {
  return (hashSym(`${sym}:div`) % 40) + 10;
}

export function daysUntilEarnings(sym, gameDay) {
  const q = quarterDay(gameDay);
  const e = earningsDayInQuarter(sym);
  if (q <= e) return e - q;
  return QUARTER_LEN - q + e;
}

export function daysSinceEarnings(sym, gameDay) {
  const q = quarterDay(gameDay);
  const e = earningsDayInQuarter(sym);
  if (q >= e) return q - e;
  return q + (QUARTER_LEN - e);
}

export function isEarningsDay(sym, gameDay) {
  return daysUntilEarnings(sym, gameDay) === 0;
}

export function isDividendExDay(sym, gameDay) {
  return dividendExDayInQuarter(sym) === quarterDay(gameDay);
}

/**
 * Beat / miss / inline with overnight gap size.
 * Pure — no market mutation.
 */
export function rollEarningsOutcome(sym, gameDay) {
  const r = (hashSym(sym) + Math.floor(Number(gameDay) || 1) * 17) % 100;
  if (r < 45) {
    const gapPct = 0.03 + (r % 5) * 0.01;
    return { outcome: 'beat', gapPct };
  }
  if (r < 80) {
    const gapPct = -(0.03 + (r % 5) * 0.01);
    return { outcome: 'miss', gapPct };
  }
  const gapPct = ((r % 5) - 2) * 0.005;
  return { outcome: 'inline', gapPct };
}

/**
 * IV rise into earnings, crush for ~2 days after.
 * Returns multiplier applied on top of base vol.
 */
export function earningsVolMultiplier(sym, gameDay) {
  const until = daysUntilEarnings(sym, gameDay);
  if (until === 0) return 1.35;
  if (until > 0 && until <= 5) return 1 + 0.25 * (1 - until / 5);
  const since = daysSinceEarnings(sym, gameDay);
  if (since >= 1 && since <= 2) return 0.72;
  return 1;
}

/** Apply overnight earnings gaps for symbols with quotes on this game day. */
export function processEarningsForDay(gameDay, { symbols } = {}) {
  const day = Math.floor(Number(gameDay) || 1);
  if (appliedEarningsDay === day) return [];
  appliedEarningsDay = day;
  const list = symbols || ALL_SYMBOLS;
  const results = [];
  for (const sym of list) {
    if (!isEarningsDay(sym, day)) continue;
    const q = getCachedQuote(sym);
    if (!q?.price) continue;
    const roll = rollEarningsOutcome(sym, day);
    applyPriceShock(sym, roll.gapPct, { skipCircuit: true, maxPct: 0.08, countDaily: true });
    results.push({ sym, ...roll, price: getCachedQuote(sym)?.price });
  }
  return results;
}

/** Credit quarterly dividends to open longs on ex-date. */
export function processDividendsForDay(portfolio, gameDay) {
  const day = Math.floor(Number(gameDay) || 1);
  if (appliedDividendDay === day) return [];
  appliedDividendDay = day;
  if (!portfolio) return [];
  const paid = [];
  for (const [sym, pos] of Object.entries(portfolio.longs || {})) {
    const yld = DIVIDEND_PAYERS[sym];
    if (yld == null || !pos?.shares) continue;
    if (!isDividendExDay(sym, day)) continue;
    const q = getCachedQuote(sym);
    const px = q?.price ?? pos.avgPrice;
    if (!(px > 0)) continue;
    const dps = +(px * yld / 4).toFixed(4);
    const amount = +(dps * pos.shares).toFixed(2);
    if (!(amount > 0)) continue;
    portfolio.cash = (portfolio.cash || 0) + amount;
    if (Array.isArray(portfolio.history)) {
      portfolio.history.unshift({
        action: 'DIVIDEND',
        sym,
        shares: pos.shares,
        price: dps,
        pnl: amount,
        time: Date.now(),
      });
      if (portfolio.history.length > 200) portfolio.history.pop();
    }
    paid.push({ sym, amount, dps, shares: pos.shares });
  }
  return paid;
}

/** Test helper — reset once-per-day guards. */
export function resetCorporateActionGuards() {
  appliedEarningsDay = -1;
  appliedDividendDay = -1;
}
