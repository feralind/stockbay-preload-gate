// @ts-check
import { CONFIG } from './config.js';
import { getCachedQuote } from './api.js';
import { getDayCount, isSymbolHalted } from './market.js';
import { blackScholesPremium, defaultVol, optionGreeks } from './options-math.js';
import { earningsVolMultiplier } from './corporate-actions.js';
import { accrueTaxablePnL, consumeLotsFifo, ensureTaxState } from './tax.js';
import { applySlippage } from './slippage.js';
import { maybeRecordPatienceWin, normalizeExitReason } from './process-wins.js';
import { marginBuyingPowerMultiplier } from './desk-rules.js';

export { optionGreeks, defaultVol };

/** Wall-clock cool-down after a blowup close (not scaled by game speed). */
export const BUY_SUSPEND_MS = 30_000;
/** Single-close loss vs firm NW that arms the cool-down. */
export const BUY_SUSPEND_LOSS_PCT = 0.15;
/** Absolute floor so micro scalps do not trip the desk lock. */
export const BUY_SUSPEND_MIN_LOSS = 40;

/**
 * Pure gate: voluntary blowup close should arm the open-side cool-down?
 * @param {number} pnl
 * @param {number} netWorth firm NW at close
 */
export function shouldArmRevengeCooloff(pnl, netWorth) {
  if (!(pnl < 0)) return false;
  const loss = Math.abs(Number(pnl) || 0);
  if (loss < BUY_SUSPEND_MIN_LOSS) return false;
  const nw = Number(netWorth);
  if (!(nw > 0)) return false;
  return loss / nw >= BUY_SUSPEND_LOSS_PCT;
}

const MAX_SHARES = 1_000_000;
const MAX_PRICE = 1_000_000;

/** Whole-share qty in (0, MAX_SHARES] or null if invalid. */
export function normalizeTradeShares(shares) {
  const n = Number(shares);
  if (!Number.isFinite(n) || n <= 0) return null;
  const whole = Math.floor(n);
  if (whole < 1 || whole > MAX_SHARES) return null;
  return whole;
}

/** Positive finite price or null. */
export function normalizeTradePrice(price) {
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_PRICE) return null;
  return n;
}

function normalizeSymbol(sym) {
  const s = String(sym || '').trim().toUpperCase();
  if (!s || !/^[A-Z0-9.\-]{1,16}$/.test(s)) return null;
  return s;
}

/** Cash + margin reserved by working limit opens. */
export function getPendingOrderCommitment(portfolio) {
  let cash = 0;
  let margin = 0;
  ensurePendingOrders(portfolio).forEach((o) => {
    if (o.side === 'long') cash += o.shares * o.limitPrice + CONFIG.COMMISSION;
    if (o.side === 'short') margin += o.shares * o.limitPrice * CONFIG.MARGIN_REQUIREMENT;
  });
  return { cash, margin };
}

/** Spendable cash for new longs (margin perk scales buying power by personal credit). */
export function getAvailableForLong(portfolio, perks = [], personalCredit) {
  const pending = getPendingOrderCommitment(portfolio);
  const base = perks.includes('margin')
    ? getBuyingPower(portfolio, perks, personalCredit)
    : getSpendableCash(portfolio);
  return Math.max(0, base - pending.cash);
}

/** Spendable cash for new shorts after pending margin. */
export function getAvailableForShort(portfolio) {
  const pending = getPendingOrderCommitment(portfolio);
  return Math.max(0, getSpendableCash(portfolio) - pending.margin);
}

export function createPortfolio(cash = CONFIG.STARTING_CASH) {
  return {
    cash,
    longs: {},      // sym -> { shares, avgPrice, lots?, stopLoss?, takeProfit? }
    shorts: {},     // sym -> { shares, avgPrice, marginHeld, openedDay?, stopLoss?, takeProfit? }
    options: [],    // { id, sym, type, strike, expiry, expiryDay, expiryDays, qty, premium, openedDay }
    pendingOrders: [], // limit / working orders
    orderTickets: [], // open + recent filled/cancelled ticket history
    history: [],
    totalTrades: 0,
    realizedPnL: 0,
    taxAccrual: { shortTermGain: 0, longTermGain: 0, shortTermLoss: 0, longTermLoss: 0 },
    taxOwed: 0,
  };
}

/** Cash free to spend (margin already deducted from cash on open short). */
export function getSpendableCash(portfolio) {
  return Math.max(0, portfolio.cash || 0);
}

/**
 * Available buying power for new long risk.
 * With margin perk: spendable cash × credit-scaled multiplier (Good 2× / Fair 1.5× / Poor 1×).
 * @param {object} portfolio
 * @param {string[]} [perks]
 * @param {number} [personalCredit]
 */
export function getBuyingPower(portfolio, perks = [], personalCredit) {
  const cash = getSpendableCash(portfolio);
  if (!perks?.includes('margin')) return cash;
  return cash * marginBuyingPowerMultiplier(personalCredit);
}

/** @param {object} portfolio @param {number} [now] */
export function isBuySuspended(portfolio, now = Date.now()) {
  const until = Number(portfolio?.buySuspendUntilMs);
  return Number.isFinite(until) && until > now;
}

/** Arm a wall-clock open-side cool-down. @returns {number} until ms */
export function armBuySuspend(portfolio, now = Date.now()) {
  const until = now + BUY_SUSPEND_MS;
  if (portfolio) portfolio.buySuspendUntilMs = until;
  return until;
}

/** Drop expired suspend markers. @returns {boolean} true if clear (not suspended) */
export function clearExpiredBuySuspend(portfolio, now = Date.now()) {
  if (!portfolio) return true;
  if (isBuySuspended(portfolio, now)) return false;
  if (portfolio.buySuspendUntilMs != null) delete portfolio.buySuspendUntilMs;
  return true;
}

function denyIfBuySuspended(portfolio) {
  if (isBuySuspended(portfolio)) {
    return { ok: false, msg: 'Trading desk suspended — cool-down from risk management' };
  }
  return null;
}

export function getLongMarketValue(portfolio) {
  let val = 0;
  Object.entries(portfolio.longs || {}).forEach(([sym, p]) => {
    const q = getCachedQuote(sym);
    if (q) val += p.shares * q.price;
  });
  return val;
}

/** Reserved margin locked in open shorts (already deducted from cash). */
export function getMarginHeld(portfolio) {
  let val = 0;
  Object.values(portfolio.shorts || {}).forEach((p) => {
    val += p.marginHeld || 0;
  });
  return val;
}

/** Unrealized P&L on shorts only (avg − mkt) × shares. */
export function getShortUnrealizedPnL(portfolio) {
  let pnl = 0;
  Object.entries(portfolio.shorts || {}).forEach(([sym, p]) => {
    const q = getCachedQuote(sym);
    const mkt = q?.price ?? p.avgPrice;
    pnl += (p.avgPrice - mkt) * p.shares;
  });
  return pnl;
}

export function getOptionsMarketValue(portfolio) {
  let val = 0;
  (portfolio.options || []).forEach((opt) => {
    val += estimateOptionValue(opt);
  });
  return val;
}

export function getPositionValue(portfolio) {
  // Shorts: reserved margin + unrealized PnL (avg - mkt) * shares
  // Keeps equity flat at open without crediting short proceeds as spendable cash.
  return getLongMarketValue(portfolio)
    + getMarginHeld(portfolio)
    + getShortUnrealizedPnL(portfolio)
    + getOptionsMarketValue(portfolio);
}

export function getEquity(portfolio) {
  return portfolio.cash + getPositionValue(portfolio);
}

/** Equity net of outstanding loan balances (matches HUD / prevents borrow-inflated P&L). */
export function getNetEquity(portfolio, debt = 0) {
  return getEquity(portfolio) - (Number(debt) || 0);
}

/**
 * Firm Total Equity / net worth used by HUD, Portfolio, mega-goals, and estate gates.
 * Trading book (cash + positions MTM) − loans/estate credit + vault book + estate equity.
 * Estate equity is syncEstateDerived's base (owned prices) minus cash-outs; credit drawn
 * is subtracted via `debt` (getFirmDebt), not by shrinking estateEquity.
 * @param {object} portfolio
 * @param {{ debt?: number, vaultBook?: number, estateEquity?: number }} [extras]
 */
export function getFirmNetWorth(portfolio, extras = {}) {
  const debt = Number(extras.debt) || 0;
  const vaultBook = Math.max(0, Number(extras.vaultBook) || 0);
  const estateEquity = Math.max(0, Number(extras.estateEquity) || 0);
  return getNetEquity(portfolio, debt) + vaultBook + estateEquity;
}

export function getUnrealizedPnL(portfolio) {
  let pnl = 0;
  Object.entries(portfolio.longs).forEach(([sym, p]) => {
    const q = getCachedQuote(sym);
    if (q) pnl += (q.price - p.avgPrice) * p.shares;
  });
  Object.entries(portfolio.shorts).forEach(([sym, p]) => {
    const q = getCachedQuote(sym);
    if (q) pnl += (p.avgPrice - q.price) * p.shares;
  });
  portfolio.options.forEach(opt => {
    pnl += (estimateOptionValue(opt) - opt.premium * opt.qty * 100);
  });
  return pnl;
}

/**
 * On seed→live quote correction: keep recorded avgPrice / premiums as-is, but emit a
 * one-time notice per open position. Sets priceCorrectedAck so it never repeats.
 * Does NOT mutate avgPrice.
 */
export function markPriceCorrectedNotices(sym, portfolio, { livePrice = null } = {}) {
  const key = String(sym || '').toUpperCase();
  if (!key || !portfolio) return [];
  const notices = [];
  const live = Number(livePrice);

  const markPos = (book, side) => {
    const p = book?.[key];
    if (!p?.shares || p.priceCorrectedAck) return;
    p.priceCorrectedAck = true;
    notices.push({
      sym: key,
      side,
      shares: p.shares,
      avgPrice: p.avgPrice,
      livePrice: live > 0 ? live : null,
    });
  };

  markPos(portfolio.longs, 'long');
  markPos(portfolio.shorts, 'short');

  for (const opt of portfolio.options || []) {
    if (String(opt?.sym || '').toUpperCase() !== key) continue;
    if (opt.priceCorrectedAck) continue;
    opt.priceCorrectedAck = true;
    notices.push({
      sym: key,
      side: 'option',
      shares: opt.qty || 1,
      avgPrice: opt.premium,
      livePrice: live > 0 ? live : null,
      optId: opt.id,
    });
  }

  return notices;
}

/**
 * Line items for the Equity HUD popover.
 * cash + longs + marginHeld + shortUPnL + options − debt === getNetEquity.
 */
export function getEquityBreakdown(portfolio, debt = 0) {
  const cash = portfolio.cash || 0;
  const longMv = getLongMarketValue(portfolio);
  const marginHeld = getMarginHeld(portfolio);
  const shortUnrealized = getShortUnrealizedPnL(portfolio);
  const options = getOptionsMarketValue(portfolio);
  const loans = Number(debt) || 0;
  const total = cash + longMv + marginHeld + shortUnrealized + options - loans;
  return {
    cash,
    longMv,
    marginHeld,
    shortUnrealized,
    options,
    debt: loans,
    unrealized: getUnrealizedPnL(portfolio),
    total,
  };
}

function logTrade(portfolio, entry) {
  portfolio.history.unshift({ ...entry, time: Date.now() });
  if (portfolio.history.length > 200) portfolio.history.pop();
  portfolio.totalTrades++;
}

function getDayRedExitMarkers(portfolio) {
  if (!portfolio) return [];
  return Array.isArray(portfolio.dayLastRedExit)
    ? portfolio.dayLastRedExit
    : (portfolio.dayLastRedExit ? [portfolio.dayLastRedExit] : []);
}

function maybeMarkChased(portfolio, sym, day) {
  if (!portfolio?.dayLastRedExit || portfolio.dayChased) return;
  const chased = getDayRedExitMarkers(portfolio).some((m) => (
    m?.sym === sym && m?.day === day
  ));
  if (chased) portfolio.dayChased = true;
}

function recordVoluntaryRedExit(portfolio, sym, day, exitReason, pnl) {
  if (!portfolio || exitReason !== 'voluntary' || !(Number(pnl) < 0)) return;
  const markers = getDayRedExitMarkers(portfolio)
    .filter((m) => m?.sym && m?.day === day);
  if (!markers.some((m) => m.sym === sym && m.day === day)) {
    markers.push({ sym, day });
  }
  portfolio.dayLastRedExit = markers.slice(-8);
}

export function buyLong(portfolio, sym, shares, price, risk = {}, perks = [], personalCredit) {
  const qty = normalizeTradeShares(shares);
  const px = normalizeTradePrice(price);
  const symbol = normalizeSymbol(sym);
  if (!qty || !px || !symbol) return { ok: false, msg: 'Invalid trade size or price' };
  const suspended = denyIfBuySuspended(portfolio);
  if (suspended) return suspended;
  if (isSymbolHalted(symbol)) return { ok: false, msg: 'TRADING HALTED' };
  if (portfolio?.marginCall?.level === 'call' && perks.includes('margin')) {
    return { ok: false, msg: 'MARGIN CALL — close risk before new margin buys' };
  }
  const cost = qty * px + CONFIG.COMMISSION;
  if (getAvailableForLong(portfolio, perks, personalCredit) < cost) return { ok: false, msg: 'Insufficient cash' };
  const wasNew = !portfolio.longs[symbol];
  const equityBefore = wasNew ? Math.max(0, getEquity(portfolio)) : 0;
  portfolio.cash -= cost;
  const day = getDayCount();
  maybeMarkChased(portfolio, symbol, day);
  const p = portfolio.longs[symbol] || { shares: 0, avgPrice: 0, lots: [] };
  if (!Array.isArray(p.lots)) p.lots = [];
  // Migrate legacy position into a single lot before adding
  if (p.shares > 0 && p.lots.length === 0) {
    p.lots.push({ shares: p.shares, avgPrice: p.avgPrice, openedDay: day });
  }
  p.avgPrice = (p.avgPrice * p.shares + px * qty) / (p.shares + qty);
  p.shares += qty;
  p.lots.push({ shares: qty, avgPrice: px, openedDay: day });
  // Snapshot once at first open — never invent for legacy/add-on fills
  if (wasNew && equityBefore > 0 && p.notionalPctAtEntry == null) {
    p.notionalPctAtEntry = (qty * px) / equityBefore;
  }
  // Adding shares re-averages cost — "avg kept" badge is no longer accurate
  if (p.priceCorrectedAck) delete p.priceCorrectedAck;
  if (risk.stopLoss) p.stopLoss = risk.stopLoss;
  if (risk.takeProfit) p.takeProfit = risk.takeProfit;
  portfolio.longs[symbol] = p;
  logTrade(portfolio, { action: 'BUY', sym: symbol, shares: qty, price: px, side: 'long' });
  return { ok: true };
}

export function sellLong(portfolio, sym, shares, price, opts = {}) {
  const qty = normalizeTradeShares(shares);
  const px = normalizeTradePrice(price);
  const symbol = normalizeSymbol(sym);
  if (!qty || !px || !symbol) return { ok: false, msg: 'Invalid trade size or price' };
  // Exits allowed during circuit halt (risk reduction / stop-loss / margin raise)
  const p = portfolio.longs[symbol];
  if (!p || p.shares < qty) return { ok: false, msg: 'Not enough shares' };
  const exitReason = normalizeExitReason(opts?.exitReason);
  const worstUnrealizedPct = p.worstUnrealizedPct;
  const day = getDayCount();
  ensureTaxState(portfolio);
  if (!Array.isArray(p.lots) || p.lots.length === 0) {
    p.lots = [{ shares: p.shares, avgPrice: p.avgPrice, openedDay: day }];
  }
  const slices = consumeLotsFifo(p.lots, qty, px);
  for (const s of slices) {
    accrueTaxablePnL(portfolio, s.pnl, { openedDay: s.openedDay, sellDay: day });
  }
  // Legacy leftover if lots under-counted
  const slicedShares = slices.reduce((n, s) => n + s.shares, 0);
  if (slicedShares < qty) {
    const rem = qty - slicedShares;
    const pnlRem = (px - p.avgPrice) * rem;
    accrueTaxablePnL(portfolio, pnlRem, { openedDay: day, sellDay: day });
  }
  const proceeds = qty * px - CONFIG.COMMISSION;
  portfolio.cash += proceeds;
  const pnl = (px - p.avgPrice) * qty;
  portfolio.realizedPnL += pnl;
  p.shares -= qty;
  if (p.shares <= 0) delete portfolio.longs[symbol];
  logTrade(portfolio, {
    action: 'SELL',
    sym: symbol,
    shares: qty,
    price: px,
    side: 'long',
    pnl,
    exitReason,
  });
  recordVoluntaryRedExit(portfolio, symbol, day, exitReason, pnl);
  maybeRecordPatienceWin(portfolio, { exitReason, pnl, worstUnrealizedPct, sym: symbol });
  return { ok: true, pnl, exitReason };
}

/**
 * Shorts lock margin only — short proceeds are NOT spendable cash.
 * Equity stays ~flat at open via marginHeld + unrealized in getPositionValue.
 */
export function openShort(portfolio, sym, shares, price, hasMarginPerk, risk = {}) {
  if (!hasMarginPerk) return { ok: false, msg: 'Unlock Margin Account perk to short' };
  const qty = normalizeTradeShares(shares);
  const px = normalizeTradePrice(price);
  const symbol = normalizeSymbol(sym);
  if (!qty || !px || !symbol) return { ok: false, msg: 'Invalid trade size or price' };
  const suspended = denyIfBuySuspended(portfolio);
  if (suspended) return suspended;
  if (isSymbolHalted(symbol)) return { ok: false, msg: 'TRADING HALTED' };
  if (portfolio?.marginCall?.level === 'call') {
    return { ok: false, msg: 'MARGIN CALL — cover before opening new shorts' };
  }
  const margin = qty * px * CONFIG.MARGIN_REQUIREMENT;
  if (getAvailableForShort(portfolio) < margin) return { ok: false, msg: 'Insufficient margin' };
  const wasNew = !portfolio.shorts[symbol];
  const equityBefore = wasNew ? Math.max(0, getEquity(portfolio)) : 0;
  portfolio.cash -= margin;
  const day = getDayCount();
  maybeMarkChased(portfolio, symbol, day);
  const p = portfolio.shorts[symbol] || { shares: 0, avgPrice: 0, marginHeld: 0, openedDay: day };
  // Weighted open day for adds
  if (p.shares > 0 && p.openedDay != null) {
    p.openedDay = Math.round((p.openedDay * p.shares + day * qty) / (p.shares + qty));
  } else {
    p.openedDay = day;
  }
  p.avgPrice = (p.avgPrice * p.shares + px * qty) / (p.shares + qty);
  p.shares += qty;
  p.marginHeld += margin;
  // Snapshot once at first open — leave undefined on adds / legacy shorts
  if (wasNew && equityBefore > 0 && p.notionalPctAtEntry == null) {
    p.notionalPctAtEntry = (qty * px) / equityBefore;
  }
  // Adding to a short re-averages — clear the "avg kept" badge
  if (p.priceCorrectedAck) delete p.priceCorrectedAck;
  if (risk.stopLoss) p.stopLoss = risk.stopLoss;
  if (risk.takeProfit) p.takeProfit = risk.takeProfit;
  portfolio.shorts[symbol] = p;
  logTrade(portfolio, { action: 'SHORT', sym: symbol, shares: qty, price: px, side: 'short' });
  return { ok: true };
}

/**
 * Cover settles PnL + releases margin (no full repurchase debit —
 * proceeds were never credited to cash).
 */
export function coverShort(portfolio, sym, shares, price, opts = {}) {
  const qty = normalizeTradeShares(shares);
  const px = normalizeTradePrice(price);
  const symbol = normalizeSymbol(sym);
  if (!qty || !px || !symbol) return { ok: false, msg: 'Invalid trade size or price' };
  // Covers allowed during circuit halt (risk reduction)
  const p = portfolio.shorts[symbol];
  if (!p || p.shares < qty) return { ok: false, msg: 'No short position' };
  const exitReason = normalizeExitReason(opts?.exitReason);
  const worstUnrealizedPct = p.worstUnrealizedPct;
  const pnl = (p.avgPrice - px) * qty;
  const commission = CONFIG.COMMISSION;
  const marginHeld = Number(p.marginHeld) || 0;
  const marginRelease = p.shares > 0 ? (marginHeld / p.shares) * qty : 0;
  const cashDelta = pnl - commission + marginRelease;
  if (cashDelta < 0 && getSpendableCash(portfolio) < -cashDelta) {
    return { ok: false, msg: 'Insufficient cash to cover short loss' };
  }
  portfolio.cash += cashDelta;
  portfolio.realizedPnL += pnl - commission;
  const day = getDayCount();
  const openedDay = p.openedDay ?? day;
  const netPnl = pnl - commission;
  accrueTaxablePnL(portfolio, netPnl, { openedDay, sellDay: day });
  p.shares -= qty;
  p.marginHeld -= marginRelease;
  if (p.shares <= 0) delete portfolio.shorts[symbol];
  logTrade(portfolio, {
    action: 'COVER',
    sym: symbol,
    shares: qty,
    price: px,
    side: 'short',
    pnl: netPnl,
    exitReason,
  });
  recordVoluntaryRedExit(portfolio, symbol, day, exitReason, netPnl);
  maybeRecordPatienceWin(portfolio, { exitReason, pnl: netPnl, worstUnrealizedPct, sym: symbol });
  return { ok: true, pnl: netPnl, exitReason };
}

export function buyOption(portfolio, opt, hasOptionsPerk) {
  if (!hasOptionsPerk) return { ok: false, msg: 'Unlock Options Desk perk' };
  if (!opt || typeof opt !== 'object') return { ok: false, msg: 'Invalid option' };
  const symbol = normalizeSymbol(opt.sym);
  const qty = normalizeTradeShares(opt.qty);
  const premium = normalizeTradePrice(opt.premium);
  const strike = normalizeTradePrice(opt.strike);
  if (!symbol || !qty || !premium || !strike) return { ok: false, msg: 'Invalid option contract' };
  const suspended = denyIfBuySuspended(portfolio);
  if (suspended) return suspended;
  if (isSymbolHalted(symbol)) return { ok: false, msg: 'TRADING HALTED' };
  if (!['call', 'put'].includes(String(opt.type || '').toLowerCase())) {
    return { ok: false, msg: 'Invalid option type' };
  }
  const cost = premium * qty * 100;
  if (getSpendableCash(portfolio) < cost) return { ok: false, msg: 'Insufficient cash' };
  portfolio.cash -= cost;
  const entry = {
    ...opt,
    sym: symbol,
    qty,
    premium,
    strike,
    type: String(opt.type).toLowerCase(),
    id: `opt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  };
  const day = getDayCount();
  entry.openedDay = day;
  entry.expiryDay = day + (entry.expiryDays || 30);
  if (!entry.vol) {
    // Snapshot entry IV for dossier / IV-crush teach; marks use live vol below.
    entry.vol = defaultVol(symbol, getCachedQuote(symbol)?.price ?? strike, 0, earningsVolMultiplier(symbol, day));
  }
  entry.entryVol = entry.vol;
  portfolio.options.push(entry);
  logTrade(portfolio, { action: 'BUY_OPT', sym: symbol, type: entry.type, strike, qty, price: premium });
  return { ok: true };
}

export function sellOption(portfolio, optId, currentPremium) {
  const idx = portfolio.options.findIndex(o => o.id === optId);
  if (idx < 0) return { ok: false, msg: 'Option not found' };
  const opt = portfolio.options[idx];
  const px = normalizeTradePrice(currentPremium);
  if (!px) return { ok: false, msg: 'Invalid option price' };
  const proceeds = px * opt.qty * 100;
  portfolio.cash += proceeds;
  const pnl = proceeds - opt.premium * opt.qty * 100;
  portfolio.realizedPnL += pnl;
  accrueTaxablePnL(portfolio, pnl, { openedDay: opt.openedDay ?? getDayCount(), sellDay: getDayCount() });
  portfolio.options.splice(idx, 1);
  logTrade(portfolio, { action: 'SELL_OPT', sym: opt.sym, pnl });
  return { ok: true, pnl };
}

export function estimateOptionValue(opt) {
  const q = getCachedQuote(opt.sym);
  const spot = q?.price ?? opt.strike;
  const gameDay = getDayCount();
  const openedDay = opt.openedDay ?? gameDay;
  const expiryDay = opt.expiryDay ?? (openedDay + (opt.expiryDays || 30));
  const daysLeft = Math.max(0, expiryDay - gameDay);
  // Align with settleExpiredOptions: at/after expiry, mark to intrinsic only (no fake 1-day TV).
  if (daysLeft <= 0) {
    const intrinsic = opt.type === 'call'
      ? Math.max(0, spot - opt.strike)
      : Math.max(0, opt.strike - spot);
    return intrinsic * (opt.qty || 0) * 100;
  }
  // Live mark: recompute IV from today's move + earnings calendar so IV crush is visible.
  // Keep opt.vol / entryVol as the purchase-time snapshot for teach moments.
  const liveVol = defaultVol(opt.sym, spot, q?.changePct, earningsVolMultiplier(opt.sym, gameDay));
  const prem = blackScholesPremium({
    spot, strike: opt.strike, daysToExpiry: daysLeft,
    vol: liveVol, type: opt.type,
  });
  return prem * opt.qty * 100;
}

/** Live implied vol for a held contract (same inputs as estimateOptionValue). */
export function liveOptionVol(opt) {
  const q = getCachedQuote(opt?.sym);
  const spot = q?.price ?? opt?.strike ?? 0;
  if (!(spot > 0)) return 0.28;
  return defaultVol(opt.sym, spot, q?.changePct, earningsVolMultiplier(opt.sym, getDayCount()));
}

/** Shared intrinsic helper (tests + settle path). */
export function optionIntrinsicPerShare(opt, spot) {
  if (opt?.type === 'put') return Math.max(0, opt.strike - spot);
  return Math.max(0, spot - opt.strike);
}

/** Settle options that hit expiry — ITM pays intrinsic, OTM expires worthless */
export function settleExpiredOptions(portfolio, gameDay = getDayCount()) {
  const settled = [];
  portfolio.options = portfolio.options.filter(opt => {
    const expiryDay = opt.expiryDay ?? (opt.openedDay != null ? opt.openedDay + 30 : gameDay + 1);
    if (gameDay < expiryDay) return true;
    const q = getCachedQuote(opt.sym);
    const spot = q?.price ?? opt.strike;
    const intrinsic = optionIntrinsicPerShare(opt, spot);
    const payout = intrinsic * opt.qty * 100;
    const cost = opt.premium * opt.qty * 100;
    portfolio.cash += payout;
    portfolio.realizedPnL += payout - cost;
    accrueTaxablePnL(portfolio, payout - cost, {
      openedDay: opt.openedDay ?? gameDay,
      sellDay: gameDay,
    });
    logTrade(portfolio, { action: 'OPT_EXPIRE', sym: opt.sym, type: opt.type, strike: opt.strike, pnl: payout - cost });
    settled.push({ opt, payout, pnl: payout - cost, intrinsic });
    return false;
  });
  return settled;
}

export function generateOptionChain(sym, spot) {
  const step = spot < 5 ? 0.5 : spot < 25 ? 1 : spot < 100 ? 2.5 : 5;
  const wings = spot < 25 ? 10 : 8;
  const base = Math.round(spot / step) * step;
  const strikes = [];
  for (let i = -wings; i <= wings; i++) {
    const s = +(base + i * step).toFixed(2);
    if (s > 0) strikes.push(s);
  }
  const vol = defaultVol(sym, spot, 0, earningsVolMultiplier(sym, getDayCount()));
  const expiryDays = [14, 45, 90];
  const chains = [];
  for (const days of expiryDays) {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + days);
    const expiryStr = expiry.toISOString().slice(0, 10);
    for (const strike of strikes) {
      const callPrem = blackScholesPremium({ spot, strike, daysToExpiry: days, vol, type: 'call' });
      const putPrem = blackScholesPremium({ spot, strike, daysToExpiry: days, vol, type: 'put' });
      chains.push({
        sym, type: 'call', strike, expiry: expiryStr, expiryDays: days, vol,
        premium: callPrem,
        expiryLabel: `${days} game days`,
      });
      chains.push({
        sym, type: 'put', strike, expiry: expiryStr, expiryDays: days, vol,
        premium: putPrem,
        expiryLabel: `${days} game days`,
      });
    }
  }
  return chains;
}

/* ─── Pending limit orders + ticket history ─── */

export function ensurePendingOrders(portfolio) {
  if (!Array.isArray(portfolio.pendingOrders)) portfolio.pendingOrders = [];
  return portfolio.pendingOrders;
}

export function ensureOrderTickets(portfolio) {
  if (!Array.isArray(portfolio.orderTickets)) portfolio.orderTickets = [];
  return portfolio.orderTickets;
}

function pushOrderTicket(portfolio, ticket) {
  const tickets = ensureOrderTickets(portfolio);
  tickets.unshift(ticket);
  if (tickets.length > 40) tickets.length = 40;
  return ticket;
}

export function markOrderTicketFilled(portfolio, order, fillPrice) {
  ensureOrderTickets(portfolio);
  const ticket = portfolio.orderTickets.find((t) => t.id === order?.id)
    || pushOrderTicket(portfolio, {
      id: order.id,
      sym: order.sym,
      side: order.side,
      shares: order.shares,
      limitPrice: order.limitPrice,
      createdAt: order.createdAt || Date.now(),
      status: 'open',
    });
  ticket.status = 'filled';
  ticket.fillPrice = Number(fillPrice);
  ticket.filledAt = Date.now();
  return ticket;
}

export function markOrderTicketCancelled(portfolio, orderId) {
  ensureOrderTickets(portfolio);
  const ticket = portfolio.orderTickets.find((t) => t.id === orderId);
  if (!ticket) return null;
  ticket.status = 'cancelled';
  ticket.cancelledAt = Date.now();
  return ticket;
}

export function placeLimitOrder(portfolio, order, { perks = [], personalCredit } = {}) {
  ensurePendingOrders(portfolio);
  ensureOrderTickets(portfolio);
  const limitPrice = normalizeTradePrice(order.limitPrice ?? order.price);
  if (!limitPrice) return { ok: false, msg: 'Enter a valid limit price' };
  const shares = normalizeTradeShares(order.shares);
  if (!shares) return { ok: false, msg: 'Enter a valid share count' };
  const symbol = normalizeSymbol(order.sym);
  if (!symbol) return { ok: false, msg: 'Invalid symbol' };
  const side = order.action || order.side;
  if (!['long', 'short', 'sell', 'cover'].includes(side)) {
    return { ok: false, msg: 'Invalid order side' };
  }
  if ((side === 'long' || side === 'short')) {
    const suspended = denyIfBuySuspended(portfolio);
    if (suspended) return suspended;
  }
  if (isSymbolHalted(symbol) && (side === 'long' || side === 'short')) {
    return { ok: false, msg: 'TRADING HALTED' };
  }
  if (side === 'long') {
    const cost = shares * limitPrice + CONFIG.COMMISSION;
    if (getAvailableForLong(portfolio, perks, personalCredit) < cost) return { ok: false, msg: 'Insufficient cash for limit buy' };
  }
  if (side === 'short') {
    if (!perks.includes('margin')) return { ok: false, msg: 'Unlock Margin Account perk to short' };
    const margin = shares * limitPrice * CONFIG.MARGIN_REQUIREMENT;
    if (getAvailableForShort(portfolio) < margin) return { ok: false, msg: 'Insufficient margin for limit short' };
  }
  if (side === 'sell') {
    const p = portfolio.longs[symbol];
    if (!p || p.shares < shares) return { ok: false, msg: 'Not enough shares for limit sell' };
  }
  if (side === 'cover') {
    const p = portfolio.shorts[symbol];
    if (!p || p.shares < shares) return { ok: false, msg: 'No short for limit cover' };
  }
  const entry = {
    id: `lim_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    sym: symbol,
    side,
    shares,
    limitPrice,
    stopLoss: order.stopLoss || null,
    takeProfit: order.takeProfit || null,
    createdAt: Date.now(),
  };
  portfolio.pendingOrders.unshift(entry);
  pushOrderTicket(portfolio, {
    id: entry.id,
    sym: entry.sym,
    side: entry.side,
    shares: entry.shares,
    limitPrice: entry.limitPrice,
    createdAt: entry.createdAt,
    status: 'open',
  });
  logTrade(portfolio, {
    action: 'LIMIT_OPEN',
    sym: entry.sym,
    shares: entry.shares,
    price: entry.limitPrice,
    side: entry.side,
  });
  return { ok: true, order: entry };
}

export function cancelPendingOrder(portfolio, orderId) {
  ensurePendingOrders(portfolio);
  const idx = portfolio.pendingOrders.findIndex((o) => o.id === orderId);
  if (idx < 0) return { ok: false, msg: 'Order not found' };
  const [removed] = portfolio.pendingOrders.splice(idx, 1);
  markOrderTicketCancelled(portfolio, removed.id);
  logTrade(portfolio, {
    action: 'LIMIT_CANCEL',
    sym: removed.sym,
    shares: removed.shares,
    price: removed.limitPrice,
    side: removed.side,
  });
  return { ok: true, order: removed };
}

/** Returns whether limit is marketable at quote price. */
export function isLimitMarketable(order, marketPrice) {
  if (!Number.isFinite(marketPrice)) return false;
  if (order.side === 'long' || order.side === 'cover') return marketPrice <= order.limitPrice;
  if (order.side === 'short' || order.side === 'sell') return marketPrice >= order.limitPrice;
  return false;
}

/**
 * Try fill one pending order at current quotes (with the same slippage as market orders).
 * fillFns: { buyLong, sellLong, openShort, coverShort, hasMargin }
 */
export function tryFillPendingOrder(portfolio, order, fillFns) {
  const q = getCachedQuote(order.sym);
  const px = q?.price;
  if (!isLimitMarketable(order, px)) return { filled: false };
  const slipSide = order.side === 'long' || order.side === 'cover'
    ? (order.side === 'cover' ? 'cover' : 'buy')
    : (order.side === 'short' ? 'short' : 'sell');
  const slipper = typeof fillFns?.applySlippage === 'function' ? fillFns.applySlippage : applySlippage;
  const slip = slipper({
    sym: order.sym,
    side: slipSide,
    shares: order.shares,
    quotePrice: px,
    quote: q,
  });
  let fillPx = slip.fillPrice;
  // Limit protection: never fill a buy/cover worse than the limit, or a sell/short below it
  if (order.side === 'long' || order.side === 'cover') {
    fillPx = Math.min(fillPx, order.limitPrice);
  } else if (order.side === 'short' || order.side === 'sell') {
    fillPx = Math.max(fillPx, order.limitPrice);
  }
  const risk = { stopLoss: order.stopLoss, takeProfit: order.takeProfit };
  let result;
  if (order.side === 'long') {
    result = fillFns.buyLong(portfolio, order.sym, order.shares, fillPx, risk, fillFns.perks || []);
  }
  else if (order.side === 'short') {
    result = fillFns.openShort(portfolio, order.sym, order.shares, fillPx, fillFns.hasMargin, risk);
  } else if (order.side === 'sell') {
    result = fillFns.sellLong(portfolio, order.sym, order.shares, fillPx);
  } else if (order.side === 'cover') {
    result = fillFns.coverShort(portfolio, order.sym, order.shares, fillPx);
  } else {
    return { filled: false, error: 'bad side' };
  }
  if (!result?.ok) return { filled: false, error: result?.msg };
  return { filled: true, fillPrice: fillPx, result };
}
