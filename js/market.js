// @ts-check
import { CONFIG } from './config.js';
import { getQuoteCache, isSimulationMode } from './api.js';
import { getSymbolSector } from './symbols.js';
import { serializeMacro, loadMacro, stepMacroTowardNeutral, resetMacro } from './macro.js';

let marketDate = new Date();
{
  const pre = CONFIG.PREMARKET_MINUTES ?? 30;
  marketDate.setHours(CONFIG.MARKET_OPEN.hour, CONFIG.MARKET_OPEN.minute, 0, 0);
  marketDate = new Date(marketDate.getTime() - pre * 60000);
}
let marketRunning = true;
let pausedByUser = false;
let pausedByBackground = false;
let tickInterval = null;
let dayCount = 1;
let dayStartEquity = CONFIG.STARTING_CASH;
let dayStartCash = CONFIG.STARTING_CASH;
let dayStartDebt = 0;
let dayTrades = 0;
let dayRealized = 0;
let speedMultiplier = 1;
/** Broad risk-on / risk-off state in [-1, 1]. Mean-reverts toward 0. */
let marketBeta = 0;
let tapeRegime = getTapeRegime(dayCount);

/** Session open anchors for circuit breakers (reset each game day). */
const sessionOpen = new Map();
/** Active halts: sym -> { day, untilMinute, reason, movePct } */
const halts = new Map();

export const CIRCUIT_BREAK_PCT = 0.07;
export const CIRCUIT_HALT_MINUTES = 15;
/** Hard cap on a single shock apply (events, drift, gaps use their own max via opts). */
export const MAX_SHOCK_PCT = 0.04;
/** Per-symbol cumulative event+earnings shock budget per session day (±10%). */
export const MAX_DAILY_SHOCK_PCT = 0.10;
/** Per-minute drift clamp — stops runaway ticks even if vol math misbehaves. */
export const MAX_DRIFT_PER_MINUTE = 0.0008;
/**
 * If price vs session-open diverges beyond this, treat as a rebase (seed→live / candle sync)
 * instead of a real circuit trip — prevents 1000%+ halt spam.
 */
export const SESSION_OPEN_REBASE_PCT = 0.35;

/** Signed cumulative shock % applied via countDaily this session day. */
const dailyShockAccum = new Map();

export function resetDailyShockAccum() {
  dailyShockAccum.clear();
}

export function getDailyShockAccum(sym) {
  const key = String(sym || '').toUpperCase();
  return dailyShockAccum.get(key) || 0;
}

/**
 * Clamp a proposed shock so (accum + allowed) stays within ±MAX_DAILY_SHOCK_PCT.
 * Returns the allowed pct (may be 0 if budget exhausted). Updates accum when non-zero.
 */
export function clampDailyShockPct(sym, pct, cap = MAX_DAILY_SHOCK_PCT) {
  const key = String(sym || '').toUpperCase();
  const raw = Number(pct) || 0;
  if (!key || !Number.isFinite(raw) || raw === 0) return 0;
  const limit = Number.isFinite(cap) && cap > 0 ? cap : MAX_DAILY_SHOCK_PCT;
  const used = dailyShockAccum.get(key) || 0;
  const next = used + raw;
  const capped = Math.max(-limit, Math.min(limit, next));
  const allowed = capped - used;
  if (Math.abs(allowed) < 1e-12) return 0;
  dailyShockAccum.set(key, used + allowed);
  return allowed;
}

/** How strongly each sector inherits the broad market move (idiosyncratic still applies). */
export const SECTOR_MARKET_BETA = {
  etf: 1.0,
  finance: 0.85,
  tech: 0.8,
  growth: 0.75,
  energy: 0.7,
  healthcare: 0.55,
  consumer: 0.6,
  industrial: 0.65,
  materials: 0.6,
  telecom: 0.55,
  reit: 0.5,
  midcap: 0.65,
  sp500extra: 0.7,
  automotive: 0.7,
  auto: 0.7,
  apparel: 0.55,
  space: 0.65,
  penny: 0.4,
  international: 0.5,
  food: 0.5,
  cannabis: 0.45,
};

export const MARKET_BETA_MEAN_REVERSION = 0.04;
export const MARKET_BETA_SHOCK_SCALE = 0.08;

const listeners = new Set();

export function onMarketTick(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getMarketBeta() {
  return marketBeta;
}

export function getTapeRegime(day = dayCount) {
  const d = Math.max(1, Math.floor(Number(day) || 1));
  let h = Math.imul(d ^ 0x9e3779b9, 2654435761) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
  return (h % 10) < 4 ? 'chop' : 'trend';
}

function currentMinuteOfDay() {
  return marketDate.getHours() * 60 + marketDate.getMinutes();
}

export function resetSessionAnchors() {
  sessionOpen.clear();
  halts.clear();
}

export function getHaltInfo(sym) {
  const key = String(sym || '').toUpperCase();
  const h = halts.get(key);
  if (!h) return null;
  if (h.day !== dayCount) {
    halts.delete(key);
    return null;
  }
  if (currentMinuteOfDay() >= h.untilMinute) {
    halts.delete(key);
    return null;
  }
  return { ...h, sym: key };
}

export function isSymbolHalted(sym) {
  return !!getHaltInfo(sym);
}

/**
 * Pure: whether a move from session open should trip a circuit breaker.
 */
export function shouldTripCircuit(openPrice, lastPrice, threshold = CIRCUIT_BREAK_PCT) {
  const o = Number(openPrice);
  const p = Number(lastPrice);
  if (!(o > 0) || !(p > 0)) return { trip: false, movePct: 0 };
  const movePct = (p - o) / o;
  return { trip: Math.abs(movePct) >= threshold, movePct };
}

export function checkCircuitBreaker(sym, price) {
  const key = String(sym || '').toUpperCase();
  if (!key || isSymbolHalted(key)) return false;
  const px = Number(price);
  if (!(px > 0)) return false;
  if (!sessionOpen.has(key)) {
    sessionOpen.set(key, px);
    return false;
  }
  const open = sessionOpen.get(key);
  const { trip, movePct } = shouldTripCircuit(open, px);
  // Seed→live / candle rebase: reset anchor instead of inventing a 1000% halt
  if (Math.abs(movePct) >= SESSION_OPEN_REBASE_PCT) {
    sessionOpen.set(key, px);
    return false;
  }
  if (!trip) return false;
  const until = currentMinuteOfDay() + CIRCUIT_HALT_MINUTES;
  const info = {
    day: dayCount,
    untilMinute: until,
    reason: movePct > 0 ? 'limit-up' : 'limit-down',
    movePct,
  };
  halts.set(key, info);
  emit('halt', { sym: key, ...info });
  return true;
}

/**
 * Pure: one step of mean-reverting market beta.
 * shock in roughly [-1,1] (caller supplies RNG); result clamped to [-1,1].
 */
export function stepMarketBeta(current, shock = 0, {
  meanReversion = MARKET_BETA_MEAN_REVERSION,
  shockScale = MARKET_BETA_SHOCK_SCALE,
} = {}) {
  const next = current * (1 - meanReversion) + Number(shock) * shockScale;
  if (!Number.isFinite(next)) return 0;
  return Math.max(-1, Math.min(1, next));
}

/**
 * Pure: combine broad beta + sector weight + idiosyncratic noise into a per-minute drift.
 */
export function computeSymbolDrift({
  marketBeta: beta = 0,
  sector = 'tech',
  idiosyncratic = 0,
  sectorVol,
} = {}) {
  const weight = SECTOR_MARKET_BETA[sector] ?? 0.6;
  const vol = sectorVol ?? (sector === 'growth' || sector === 'tech' ? 0.0007
    : sector === 'etf' ? 0.00025 : 0.0005);
  // Broad move: beta ∈ [-1,1] maps to about ±vol at full weight
  const common = beta * weight * vol;
  const idio = Number(idiosyncratic) || 0;
  return common + idio;
}

function emit(type, data) {
  listeners.forEach(fn => fn(type, data));
}

export function getMarketTime() {
  return new Date(marketDate);
}

export function getDayCount() {
  return dayCount;
}

export function isMarketOpen() {
  const h = marketDate.getHours();
  const m = marketDate.getMinutes();
  const openM = CONFIG.MARKET_OPEN.hour * 60 + CONFIG.MARKET_OPEN.minute;
  const closeM = CONFIG.MARKET_CLOSE.hour * 60 + CONFIG.MARKET_CLOSE.minute;
  const cur = h * 60 + m;
  return cur >= openM && cur < closeM;
}

/** Day phase labels for the market clock */
export function getDayPhase() {
  const h = marketDate.getHours();
  const m = marketDate.getMinutes();
  const cur = h * 60 + m;
  const openM = CONFIG.MARKET_OPEN.hour * 60 + CONFIG.MARKET_OPEN.minute;
  const closeM = CONFIG.MARKET_CLOSE.hour * 60 + CONFIG.MARKET_CLOSE.minute;
  if (cur < openM) return 'Pre-Market';
  if (cur < 12 * 60) return 'Morning';
  if (cur < closeM) return 'Afternoon';
  return 'Evening';
}

/**
 * Liquidity / spread regime for the current phase.
 * Pre-Market & Evening: thinner book, wider effective spreads.
 */
export function phaseLiquidityFactor(phase = getDayPhase()) {
  if (phase === 'Pre-Market' || phase === 'Evening') {
    return { advMult: 0.28, slipMult: 2.4, volMult: 0.55, spreadPad: 0.0004 };
  }
  return { advMult: 1, slipMult: 1, volMult: 1, spreadPad: 0 };
}

export function isThinSession(phase = getDayPhase()) {
  return phase === 'Pre-Market' || phase === 'Evening';
}

/** Progress through current phase (0–1) */
export function getPhaseProgress() {
  const h = marketDate.getHours();
  const m = marketDate.getMinutes();
  const cur = h * 60 + m;
  const openM = CONFIG.MARKET_OPEN.hour * 60 + CONFIG.MARKET_OPEN.minute;
  const closeM = CONFIG.MARKET_CLOSE.hour * 60 + CONFIG.MARKET_CLOSE.minute;
  const noon = 12 * 60;

  if (cur < openM) return Math.min(1, cur / openM);
  if (cur < noon) return (cur - openM) / (noon - openM);
  if (cur < closeM) return (cur - noon) / (closeM - noon);
  return Math.min(1, (cur - closeM) / (4 * 60));
}

export function formatMarketClock() {
  const d = marketDate;
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  const status = isMarketOpen() ? 'OPEN' : 'CLOSED';
  const phase = getDayPhase();
  return {
    time: `${h12}:${m} ${ampm}`,
    status,
    day: dayCount,
    phase,
    progress: getPhaseProgress(),
  };
}

export function snapshotDayStart(equity, cash, debt = 0) {
  dayStartEquity = equity;
  dayStartCash = cash;
  dayStartDebt = Number(debt) || 0;
  dayTrades = 0;
  dayRealized = 0;
}

export function recordDayTrade(realized = 0) {
  dayTrades++;
  dayRealized += realized;
}

/**
 * Pass net equity (cash+positions−debt). cashDelta uses net cash (cash−debt)
 * so borrowing cannot complete cash/equity challenges.
 */
export function getDayStats(currentEquity, currentCash, currentDebt = 0) {
  const debt = Number(currentDebt) || 0;
  const startNetCash = dayStartCash - dayStartDebt;
  const endNetCash = currentCash - debt;
  return {
    day: dayCount,
    startEquity: dayStartEquity,
    endEquity: currentEquity,
    equityDelta: currentEquity - dayStartEquity,
    startCash: dayStartCash,
    endCash: currentCash,
    cashDelta: endNetCash - startNetCash,
    startDebt: dayStartDebt,
    endDebt: debt,
    trades: dayTrades,
    realized: dayRealized,
  };
}

function advanceMarket(minutes) {
  marketDate = new Date(marketDate.getTime() + minutes * 60000);
  const closeM = CONFIG.MARKET_CLOSE.hour * 60 + CONFIG.MARKET_CLOSE.minute;
  const cur = marketDate.getHours() * 60 + marketDate.getMinutes();

  if (cur >= closeM + (CONFIG.EVENING_MINUTES ?? 60)) {
    // Evening wraps into next trading day (land in pre-market)
    const summaryDay = dayCount;
    marketDate.setDate(marketDate.getDate() + 1);
    const pre = CONFIG.PREMARKET_MINUTES ?? 30;
    marketDate.setHours(CONFIG.MARKET_OPEN.hour, CONFIG.MARKET_OPEN.minute, 0, 0);
    marketDate = new Date(marketDate.getTime() - pre * 60000);
    dayCount++;
    tapeRegime = getTapeRegime(dayCount);
    resetSessionAnchors();
    rollQuotesForNewDay();
    stepMacroTowardNeutral(0.03);
    emit('dayEnd', { day: summaryDay });
    emit('newDay', { day: dayCount });
  }
  emit('tick', formatMarketClock());
}

let staffTickCounter = 0;

/**
 * At game-day open: lock yesterday's sim close as prevClose so watchlist %
 * is "today vs last close", not vs a frozen live baseline from Day 0.
 */
export function rollQuotesForNewDay() {
  resetDailyShockAccum();
  const cache = getQuoteCache();
  cache.forEach((q, sym) => {
    if (!(q?.price > 0)) return;
    const px = Number(q.price);
    cache.set(sym, {
      ...q,
      prevClose: px,
      open: px,
      sessionOpen: px,
      high: px,
      low: px,
      change: 0,
      changePct: 0,
      baselinePrice: px,
      updated: Date.now(),
      simulated: true,
    });
  });
}

export function applyPriceShock(sym, pct, { skipCircuit = false, maxPct = MAX_SHOCK_PCT, countDaily = false } = {}) {
  const key = String(sym || '').toUpperCase();
  if (isSymbolHalted(key)) return;
  const cache = getQuoteCache();
  const q = cache.get(key) || cache.get(sym);
  if (!q) return;
  const cap = Number.isFinite(maxPct) && maxPct > 0 ? maxPct : MAX_SHOCK_PCT;
  let raw = Number(pct) || 0;
  let clamped = Math.max(-cap, Math.min(cap, raw));
  if (countDaily) {
    clamped = clampDailyShockPct(key, clamped);
  }
  if (Math.abs(clamped) < 1e-12) return;
  const newPrice = Math.max(0.01, q.price * (1 + clamped));
  const ref = (q.prevClose > 0 ? q.prevClose : null)
    ?? (q.baselinePrice > 0 ? q.baselinePrice : null)
    ?? newPrice;
  const next = {
    ...q,
    price: parseFloat(newPrice.toFixed(2)),
    high: Math.max(q.high ?? newPrice, newPrice),
    low: Math.min(q.low ?? newPrice, newPrice),
    change: newPrice - ref,
    changePct: ((newPrice / ref) - 1) * 100,
    updated: Date.now(),
    simulated: true,
  };
  cache.set(key, next);
  if (!skipCircuit) checkCircuitBreaker(key, next.price);
}

export function applySectorShock(sector, symbols, getSector, pct) {
  symbols.filter(s => getSector(s) === sector).forEach(sym => applyPriceShock(sym, pct));
}

function simulateMarketMinute() {
  if (!isSimulationMode()) return;
  const cache = getQuoteCache();
  const tickSeed = marketDate.getHours() * 60 + marketDate.getMinutes() + dayCount * 1000;
  const liq = phaseLiquidityFactor();

  // Slow mean-reverting broad market — shared by every symbol this minute
  const shock = Math.sin(tickSeed * 0.031) * 0.55 + (Math.random() - 0.5) * 0.9;
  marketBeta = stepMarketBeta(marketBeta, shock);

  cache.forEach((q, sym) => {
    if (!q?.price) return;
    if (isSymbolHalted(sym)) return;
    // Session open anchors only during the regular session
    if (isMarketOpen() && !sessionOpen.has(sym)) sessionOpen.set(sym, q.price);
    const sector = getSymbolSector(sym);
    const baseVol = sector === 'growth' || sector === 'tech' ? 0.0007
      : sector === 'etf' ? 0.00025 : 0.0005;
    const vol = baseVol * liq.volMult;
    const hash = sym.charCodeAt(0) + sym.charCodeAt(sym.length - 1) + tickSeed;
    const deterministic = Math.sin(hash * 0.17) * vol * 0.5;
    const random = (Math.random() - 0.5) * vol;
    const idiosyncratic = deterministic + random;
    let drift = computeSymbolDrift({
      marketBeta,
      sector,
      idiosyncratic,
      sectorVol: vol,
    });
    if (tapeRegime === 'chop') {
      drift += idiosyncratic * 0.35;
      if (Math.floor(tickSeed / 17) % 2 === 1) drift *= -0.65;
    }
    // Thin sessions: small random spread pad (wider effective prints)
    if (liq.spreadPad) drift += (Math.random() - 0.5) * 2 * liq.spreadPad;
    drift = Math.max(-MAX_DRIFT_PER_MINUTE, Math.min(MAX_DRIFT_PER_MINUTE, drift));
    if (Math.abs(drift) > 0.00001) applyPriceShock(sym, drift, { maxPct: MAX_DRIFT_PER_MINUTE });
  });
}

/** Ticks in one game day: pre-market + open + evening wrap */
export function getTicksPerGameDay() {
  const openM = CONFIG.MARKET_OPEN.hour * 60 + CONFIG.MARKET_OPEN.minute;
  const closeM = CONFIG.MARKET_CLOSE.hour * 60 + CONFIG.MARKET_CLOSE.minute;
  const openMinutes = Math.max(0, closeM - openM);
  const pre = CONFIG.PREMARKET_MINUTES ?? 30;
  const evening = CONFIG.EVENING_MINUTES ?? 60;
  const step = CONFIG.CLOSED_ADVANCE_MINUTES ?? 5;
  const eveningTicks = Math.ceil(evening / step);
  return pre + openMinutes + eveningTicks;
}

/** Real ms between ticks at 1x so REAL_MINUTES_PER_GAME_DAY covers a full day */
export function getBaseMsPerTick() {
  const realMin = CONFIG.REAL_MINUTES_PER_GAME_DAY ?? 30;
  const ticks = getTicksPerGameDay();
  return (realMin * 60 * 1000) / Math.max(1, ticks);
}

export function startMarket() {
  if (tickInterval) clearInterval(tickInterval);
  const closedStep = CONFIG.CLOSED_ADVANCE_MINUTES ?? 5;
  const baseMs = getBaseMsPerTick();
  const msPerTick = Math.max(50, baseMs / Math.max(1, speedMultiplier));
  tickInterval = setInterval(() => {
    if (!marketRunning) return;
    const phase = getDayPhase();
    if (isMarketOpen()) {
      advanceMarket(1);
      simulateMarketMinute();
      staffTickCounter++;
      if (staffTickCounter % 8 === 0) emit('staffTick', {});
    } else if (phase === 'Pre-Market') {
      // 1-minute pre-market tape with thin liquidity
      advanceMarket(1);
      simulateMarketMinute();
    } else {
      // Evening wrap — coarser clock, still a thin simulated tape
      advanceMarket(closedStep);
      if (getDayPhase() === 'Evening') simulateMarketMinute();
    }
  }, msPerTick);
}

export function setMarketSpeed(mult) {
  speedMultiplier = Math.max(1, Math.min(10, Number(mult) || 1));
  if (tickInterval) startMarket();
  return speedMultiplier;
}

export function getMarketSpeed() {
  return speedMultiplier;
}

export function pauseMarket() {
  marketRunning = !marketRunning;
  pausedByUser = !marketRunning;
  return marketRunning;
}

export function resumeMarket() {
  marketRunning = true;
  pausedByUser = false;
  pausedByBackground = false;
  return marketRunning;
}

export function stopMarketClock() {
  marketRunning = false;
  return marketRunning;
}

export function bindVisibilityAutoPause(onChange) {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (marketRunning) {
        pausedByBackground = true;
        marketRunning = false;
      }
    } else if (pausedByBackground && !pausedByUser) {
      pausedByBackground = false;
      marketRunning = true;
    } else if (pausedByBackground) {
      pausedByBackground = false;
    }
    onChange?.(marketRunning);
  });
}

export function isMarketRunning() {
  return marketRunning;
}

/**
 * Test / smoke helper — jump to the next game day without waiting on the clock.
 * Mirrors the evening-wrap path in advanceMarket.
 */
export function forceAdvanceGameDay() {
  const summaryDay = dayCount;
  marketDate.setDate(marketDate.getDate() + 1);
  const pre = CONFIG.PREMARKET_MINUTES ?? 30;
  marketDate.setHours(CONFIG.MARKET_OPEN.hour, CONFIG.MARKET_OPEN.minute, 0, 0);
  marketDate = new Date(marketDate.getTime() - pre * 60000);
  dayCount++;
  tapeRegime = getTapeRegime(dayCount);
  resetSessionAnchors();
  stepMacroTowardNeutral(0.03);
  emit('dayEnd', { day: summaryDay });
  emit('newDay', { day: dayCount });
  emit('tick', formatMarketClock());
  return { from: summaryDay, to: dayCount };
}

/** Full desk restart — Day 1, pre-market clock, neutral beta, baseline Fed. */
export function resetMarketForNewRun() {
  dayCount = 1;
  dayStartEquity = CONFIG.STARTING_CASH;
  dayStartCash = CONFIG.STARTING_CASH;
  dayStartDebt = 0;
  dayTrades = 0;
  dayRealized = 0;
  speedMultiplier = 1;
  marketBeta = 0;
  tapeRegime = getTapeRegime(dayCount);
  pausedByUser = false;
  pausedByBackground = false;
  marketRunning = true;
  resetSessionAnchors();
  resetDailyShockAccum();
  resetMacro();
  marketDate = new Date();
  const pre = CONFIG.PREMARKET_MINUTES ?? 30;
  marketDate.setHours(CONFIG.MARKET_OPEN.hour, CONFIG.MARKET_OPEN.minute, 0, 0);
  marketDate = new Date(marketDate.getTime() - pre * 60000);
  return serializeMarket();
}

export function serializeMarket() {
  const haltList = [];
  for (const [sym, h] of halts.entries()) {
    if (!h || h.day !== dayCount) continue;
    haltList.push({
      sym,
      day: h.day,
      untilMinute: h.untilMinute,
      reason: h.reason,
      movePct: h.movePct,
    });
  }
  const openList = [];
  for (const [sym, px] of sessionOpen.entries()) {
    if (Number.isFinite(px) && px > 0) openList.push({ sym, price: px });
  }
  return {
    marketDate: marketDate.toISOString(),
    dayCount,
    dayStartEquity,
    dayStartCash,
    dayStartDebt,
    dayTrades,
    dayRealized,
    speedMultiplier,
    marketBeta,
    tapeRegime,
    macro: serializeMacro(),
    halts: haltList,
    sessionOpen: openList,
  };
}

export function loadMarket(data) {
  if (data?.marketDate) marketDate = new Date(data.marketDate);
  if (data?.dayCount) dayCount = data.dayCount;
  if (data?.dayStartEquity != null) dayStartEquity = data.dayStartEquity;
  if (data?.dayStartCash != null) dayStartCash = data.dayStartCash;
  if (data?.dayStartDebt != null) dayStartDebt = data.dayStartDebt;
  if (data?.dayTrades != null) dayTrades = data.dayTrades;
  if (data?.dayRealized != null) dayRealized = data.dayRealized;
  if (data?.speedMultiplier) {
    speedMultiplier = Math.max(1, Math.min(10, Number(data.speedMultiplier) || 1));
  }
  // Migration: older saves omit marketBeta → start neutral
  const beta = Number(data?.marketBeta);
  marketBeta = Number.isFinite(beta) ? Math.max(-1, Math.min(1, beta)) : 0;
  // Migration: older saves omit tapeRegime → derive from current day
  tapeRegime = data?.tapeRegime === 'chop' || data?.tapeRegime === 'trend'
    ? data.tapeRegime
    : getTapeRegime(dayCount);
  // Migration: older saves omit macro → baseline Fed/10Y
  loadMacro(data?.macro);

  halts.clear();
  sessionOpen.clear();
  if (Array.isArray(data?.halts)) {
    for (const h of data.halts) {
      const sym = String(h?.sym || '').toUpperCase();
      if (!sym || h.day !== dayCount) continue;
      const until = Number(h.untilMinute);
      if (!Number.isFinite(until)) continue;
      halts.set(sym, {
        day: dayCount,
        untilMinute: until,
        reason: h.reason || 'circuit',
        movePct: Number(h.movePct) || 0,
      });
    }
  }
  if (Array.isArray(data?.sessionOpen)) {
    for (const row of data.sessionOpen) {
      const sym = String(row?.sym || '').toUpperCase();
      const px = Number(row?.price);
      if (sym && px > 0) sessionOpen.set(sym, px);
    }
  }
}
