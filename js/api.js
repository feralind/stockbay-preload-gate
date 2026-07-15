// @ts-check
import { CONFIG } from './config.js';
import { ALL_SYMBOLS } from './symbols.js';
import {
  fetchFromProviders, fetchCandlesFromProviders, getProviderLabel, isLocalServer,
} from './providers.js';
import {
  hasSimLedger,
  hasUsableSimIntraday,
  seedSimLedgerFromCandles,
  seedSimIntradayFromCandles,
  seedSimLaunchpadDaily,
  sliceSimCandlesForRange,
  clearSimCandleLedger,
  serializeSimCandleLedger,
  loadSimCandleLedger,
  setSimLedgerClockProviders,
  recordSimTick,
  foldAllSimDays,
  beginSimSessionFromQuotes,
  getSimLedgerNowSec,
  hasLaunchpadDaily,
  launchpadCoversRange,
  isSessionRangeKey,
  ensureCareerDailyCatchUp,
} from './sim-candle-ledger.js';

export {
  clearSimCandleLedger,
  serializeSimCandleLedger,
  loadSimCandleLedger,
  setSimLedgerClockProviders,
  recordSimTick,
  foldAllSimDays,
  beginSimSessionFromQuotes,
  hasSimLedger,
  hasUsableSimIntraday,
  seedSimLedgerFromCandles,
  seedSimIntradayFromCandles,
  seedSimLaunchpadDaily,
  sliceSimCandlesForRange,
  getSimLedgerNowSec,
  hasLaunchpadDaily,
  launchpadCoversRange,
  ensureCareerDailyCatchUp,
};

const quoteCache = new Map();
let batchIndex = 0;
let lastNews = [];
let refreshTimer = null;
let activeProvider = 'initializing';
let simulationMode = false;

/** Connectivity: online = can reach quote APIs; not tick-by-tick streaming */
let networkOnline = typeof navigator !== 'undefined' ? !!navigator.onLine : true;
let consecutiveFailures = 0;
let lastSuccessfulFetch = 0;
let connectivityBound = false;
let statusCallback = null;
let reconnectInFlight = false;

/** v3: drop v2 rows that kept pre-split mega seeds (e.g. NFLX~$890) as "live". */
const BASELINE_KEY = CONFIG.QUOTE_BASELINE_KEY || 'stockway_quote_baselines_v3';
const BASELINE_VERSION = 3;
const LEGACY_BASELINE_KEYS = [
  'stockway_quote_baselines_v1',
  'stockway_quote_baselines_v2',
];
/** Reject a quote vs reference if farther than this (seed vs live / candle mismatch). */
export const PRICE_OUTLIER_PCT = 0.12;
/** Live last-candle ticks larger than this vs series close are rejected (chart.js). */
export const LIVE_CANDLE_MAX_JUMP_PCT = 0.025;
/** Max relative scale when rebasing live candles onto the sim last price. */
export const CANDLE_REBASE_MAX_PCT = 0.18;
/** Persisted / cached price vs seed: reject if outside this multiple band. */
export const SEED_PLAUSIBLE_MAX_RATIO = 2.5;
export const SEED_PLAUSIBLE_MIN_RATIO = 0.2;

const CHART_RANGE_FALLBACKS = {
  '1D': { count: 78, minutes: 5 },
  '1W': { count: 7, minutes: 1440 },
  '5D': { count: 7, minutes: 1440 }, // legacy alias → 1W
  '1M': { count: 160, minutes: 60 },
  '6M': { count: 126, minutes: 1440 },
  YTD: { count: 260, minutes: 1440 },
  '1Y': { count: 252, minutes: 1440 },
  '5Y': { count: 1260, minutes: 1440 },
  MAX: { count: 3600, minutes: 10080 },
};

/** Lower realized vol for mega-caps / ETFs so synthetic bars look broker-like. */
const MEGA_CAP_SYMS = new Set([
  'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'META', 'NVDA', 'TSLA', 'BRK.B', 'JPM',
  'V', 'MA', 'UNH', 'XOM', 'JNJ', 'WMT', 'PG', 'HD', 'CVX', 'MRK', 'ABBV', 'AVGO',
  'COST', 'PEP', 'KO', 'AMD', 'NFLX', 'ADBE', 'CRM', 'ORCL', 'CSCO', 'ACN', 'LIN',
  'MCD', 'BAC', 'TMO', 'ABT', 'DHR', 'WFC', 'DIS', 'INTC', 'QCOM', 'TXN', 'AMAT',
  'SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'VTI',
]);


/** Offline / cold-start anchors — mid-2026 ballpark (post-split where applicable).
 * Keep common holdings here so login never flashes a hash seed ($8–$180) then snaps. */
const SEED_PRICES = {
  AAPL: 315, MSFT: 385, GOOGL: 185, NVDA: 210, TSLA: 400, AMZN: 220,
  META: 670, AMD: 400, NFLX: 75, SPY: 750, QQQ: 720, JPM: 280,
  XOM: 115, UNH: 520, COIN: 280, PLTR: 95, SOFI: 18, INTC: 28,
  DOCU: 49, HPQ: 35, NDSN: 240, CRM: 280, ORCL: 165, ADBE: 420,
  CSCO: 58, AVGO: 250, QCOM: 165, IBM: 230, NOW: 780, INTU: 620,
  SHOP: 95, UBER: 85, ABNB: 145, OKTA: 95, HUBS: 520, PATH: 14,
  DELL: 115, HPE: 22, SMCI: 45, ARM: 140, MU: 140, AMAT: 185,
  SEDG: 50, ENPH: 65, FSLR: 195, RUN: 12, PLUG: 2.5, BE: 18,
  BILL: 55, AI: 28, U: 25, NET: 95, DDOG: 130, ZS: 195,
  // Consumer staples / discretionary (CL = Colgate, not crude)
  CL: 90, PG: 165, KO: 70, PEP: 145, WMT: 100, COST: 920, MCD: 295,
  NKE: 75, SBUX: 95, TGT: 110, HD: 380, LOW: 240, KMB: 135, CLX: 145,
  KHC: 30, MDLZ: 70, HSY: 180, MNST: 55, KDP: 35, PM: 160, MO: 55,
  // REITs / healthcare names players often hold
  VTR: 65, O: 55, AMT: 210, PLD: 115, EQIX: 820, CCI: 105, SPG: 165,
  WELL: 155, DLR: 165, VICI: 32, PSA: 300, VRTX: 480, LLY: 850, JNJ: 160,
  PFE: 28, ABBV: 185, MRK: 115, BA: 185, CAT: 380, GS: 520, DIS: 115,
};

export function getQuoteCache() { return quoteCache; }
export function getCachedQuote(sym) { return quoteCache.get(sym?.toUpperCase?.() || sym); }
export function getActiveProvider() { return activeProvider; }
export function isSimulationMode() { return simulationMode; }
export function isNetworkOnline() { return networkOnline; }
export function getLastFetchAt() { return lastSuccessfulFetch; }

/** Listeners for seed→live (or any unanchored→anchored) quote transitions. */
const quoteTransitionListeners = new Set();

/** Subscribe to quote source transitions. Returns unsubscribe. */
export function onQuoteTransition(fn) {
  if (typeof fn !== 'function') return () => {};
  quoteTransitionListeners.add(fn);
  return () => quoteTransitionListeners.delete(fn);
}

function emitQuoteTransition(sym, prev, next) {
  if (!next || !sym) return;
  const wasSeed = !prev || prev.source === 'seed' || !isLiveAnchoredQuote(prev);
  const nowLive = isLiveAnchoredQuote(next);
  if (!wasSeed || !nowLive) return;
  // Skip no-op re-anchors of the same live source
  if (prev && isLiveAnchoredQuote(prev) && prev.source !== 'seed') return;
  const evt = { sym, prev: prev || null, next };
  quoteTransitionListeners.forEach((fn) => {
    try { fn(evt); } catch (e) { console.warn('onQuoteTransition handler failed', e); }
  });
}

/**
 * During simulationMode, only seed / unanchored / missing quotes need a live refresh.
 * Live-anchored desk tape stays untouched so the sim doesn't track the real market
 * (prevents buy-at-sim-low → refresh → sell-at-live-high).
 */
export function filterSymbolsForQuoteRefresh(symbols, { simulationMode: sim = simulationMode, getQuote = getCachedQuote } = {}) {
  const list = [...new Set((symbols || []).map((s) => String(s || '').toUpperCase()).filter(Boolean))];
  if (!sim) return list;
  return list.filter((sym) => {
    const q = getQuote(sym);
    return !q || !isLiveAnchoredQuote(q);
  });
}

/**
 * Mid-run desk refresh (toolbar Sync, Deal Desk refresh, viewport interval).
 * Seed / unanchored only, always force:false — never overwrites live-anchored sim tape.
 * force:true belongs only on cold-start / reset-desk boot paths (no drift to protect yet).
 */
export async function refreshQuotesMidRun(symbols) {
  const unique = [...new Set((symbols || []).map((s) => String(s || '').toUpperCase()).filter(Boolean))];
  const toFetch = filterSymbolsForQuoteRefresh(unique);
  const skipped = unique.filter((s) => !toFetch.includes(s));
  if (!toFetch.length) {
    return {
      ok: true,
      live: [...quoteCache.values()].filter((q) => q.anchored).length,
      total: quoteCache.size,
      fetched: 0,
      refreshed: [],
      skipped,
      offline: !networkOnline,
    };
  }
  const result = await refreshQuotes(toFetch, { force: false });
  return {
    ...result,
    fetched: toFetch.length,
    refreshed: toFetch,
    skipped,
  };
}

/** Top tape + mega names — included in launch / mid-run refresh symbol sets. */
export function getTickerSymbols() {
  return [...(CONFIG.TICKER_SYMBOLS || [])].map((s) => String(s).toUpperCase());
}

/** Merge watchlist / UI symbols with the ticker tape for live baseline fetches. */
export function mergeQuoteRefreshSymbols(...groups) {
  const out = [];
  const seen = new Set();
  for (const group of groups) {
    for (const raw of group || []) {
      const sym = String(raw || '').toUpperCase();
      if (!sym || seen.has(sym)) continue;
      seen.add(sym);
      out.push(sym);
    }
  }
  for (const sym of getTickerSymbols()) {
    if (seen.has(sym)) continue;
    seen.add(sym);
    out.push(sym);
  }
  return out;
}

export function getSeedPrice(sym) {
  const key = String(sym || '').toUpperCase();
  return SEED_PRICES[key] ?? null;
}

/** Pure: price is within a sane multiple of the known seed (catches pre-split poison). */
export function isPlausibleQuote(price, reference, {
  maxRatio = SEED_PLAUSIBLE_MAX_RATIO,
  minRatio = SEED_PLAUSIBLE_MIN_RATIO,
} = {}) {
  const px = Number(price);
  const ref = Number(reference);
  if (!(px > 0) || !(ref > 0)) return false;
  const ratio = px / ref;
  return ratio <= maxRatio && ratio >= minRatio;
}

/** Pure: known-symbol price looks sane vs SEED_PRICES (unknown syms always pass).
 * Uses a wide multiple band so normal market moves survive, while pre-split /
 * hash-seed poison (NFLX~$889, DOCU~$361) is rejected. */
export function isPlausibleAgainstSeed(sym, price) {
  const known = getSeedPrice(sym);
  if (known == null) return Number(price) > 0;
  return isPlausibleQuote(price, known);
}

/** Pure: whether cached quote should rebase to an authoritative price (candle/live). */
export function shouldRebaseQuote(existingPrice, authoritativePrice, pct = PRICE_OUTLIER_PCT * 0.5) {
  return pricesDiverge(existingPrice, authoritativePrice, pct);
}

/** Pure: prefer live/candle over seed or wildly divergent cache. */
export function shouldReplaceCachedWithLive(existing, livePrice, seedRef = null) {
  const live = Number(livePrice);
  if (!(live > 0)) return false;
  if (!existing || !(existing.price > 0)) return true;
  if (String(existing.source || '') === 'seed') return true;
  if (seedRef != null && !isPlausibleQuote(existing.price, seedRef)
    && isPlausibleQuote(live, seedRef)) return true;
  if (pricesDiverge(existing.price, live, 0.35)
    && (seedRef == null || isPlausibleQuote(live, seedRef))) return true;
  return false;
}

/** Pure: live candle tick is too far from series close — reject and rebase HUD. */
export function shouldRejectLiveCandleTick(anchorClose, tickPrice, maxJumpPct = LIVE_CANDLE_MAX_JUMP_PCT) {
  const anchor = Number(anchorClose);
  const px = Number(tickPrice);
  if (!(anchor > 0) || !(px > 0)) return true;
  return Math.abs(px - anchor) / anchor > maxJumpPct;
}

/**
 * Pure: scale a live OHLC series so the last close equals endPrice.
 * Preserves real wick/body shape while matching the sim tape.
 */
export function rebaseCandlesToPrice(candles, endPrice, maxPct = CANDLE_REBASE_MAX_PCT) {
  if (!Array.isArray(candles) || !candles.length) return null;
  const last = Number(candles[candles.length - 1]?.close);
  const target = Number(endPrice);
  if (!(last > 0) || !(target > 0)) return null;
  const factor = target / last;
  if (!Number.isFinite(factor) || factor <= 0) return null;
  if (Math.abs(factor - 1) > maxPct) return null;
  return candles.map((c) => {
    const open = Number(c.open) * factor;
    const high = Number(c.high) * factor;
    const low = Number(c.low) * factor;
    const close = Number(c.close) * factor;
    return {
      ...c,
      open: +open.toFixed(4),
      high: +Math.max(open, high, close).toFixed(4),
      low: +Math.max(0.01, Math.min(open, low, close)).toFixed(4),
      close: +close.toFixed(4),
      volume: c.volume,
      time: c.time,
    };
  });
}

/** Pure: typical bar range fraction for a timeframe (used by synthetic + live wick clamps). */
export function candleBarVolFraction(resMin, volScale = 1) {
  const minutes = Math.max(1, Number(resMin) || 5);
  const scale = Number.isFinite(volScale) && volScale > 0 ? volScale : 1;
  // ~1.0% typical daily range for a large-cap; sqrt-time for intraday bars
  const daily = 0.01 * scale;
  if (minutes >= 1440) return daily;
  return daily * Math.sqrt(minutes / 390);
}

export function symbolCandleVolScale(sym) {
  const key = String(sym || '').toUpperCase();
  if (MEGA_CAP_SYMS.has(key)) return 0.65;
  if (key.endsWith('ETF') || key === 'SPY' || key === 'QQQ') return 0.45;
  return 1;
}

/** Pure: only real provider / prior live cache rows may be written to localStorage. */
export function shouldPersistBaselineQuote(q) {
  if (!q || !(q.price > 0)) return false;
  if (String(q.source || '') === 'seed') return false;
  return isLiveAnchoredQuote(q);
}

/** Pure: whether a quote/news fetch should hit the network */
export function shouldAttemptNetworkFetch({
  force = false,
  networkOnline: online = true,
  navigatorOnline = true,
} = {}) {
  // Browser offline → never hit the network (avoids hanging Refresh)
  if (!navigatorOnline) return false;
  if (online) return true;
  // Soft-offline after failed fetches: only a manual force may retry
  return !!force;
}

/** Pure: connection state after a fetch attempt (hysteresis on soft failures) */
export function nextConnectionState({
  success = false,
  consecutiveFailures: fails = 0,
  navigatorOnline = true,
  force = false,
} = {}) {
  if (success) return { online: true, consecutiveFailures: 0 };
  const nextFails = fails + 1;
  // Forced refresh or browser offline → offline immediately; else need 2 strikes
  const goOffline = force || !navigatorOnline || nextFails >= 2;
  return { online: !goOffline, consecutiveFailures: nextFails };
}

/** Pure: serialize quote map entries into a persistable baseline snapshot */
export function buildBaselineSnapshot(entries, fetchedAt = Date.now()) {
  const quotes = {};
  for (const [sym, q] of entries) {
    if (!q || !(q.price > 0)) continue;
    const key = String(sym).toUpperCase();
    quotes[key] = {
      price: q.baselinePrice ?? q.price,
      open: q.sessionOpen ?? q.open ?? q.price,
      high: q.high ?? q.price,
      low: q.low ?? q.price,
      prevClose: q.prevClose ?? q.price,
      change: q.change ?? 0,
      changePct: q.changePct ?? 0,
      baselinePrice: q.baselinePrice ?? q.price,
      sessionOpen: q.sessionOpen ?? q.open ?? q.price,
      source: q.source || 'cached',
    };
  }
  return { version: BASELINE_VERSION, fetchedAt, quotes };
}

/** Pure: turn a snapshot into quote objects ready for the in-memory cache */
export function quotesFromBaselineSnapshot(snapshot) {
  if (!snapshot?.quotes || typeof snapshot.quotes !== 'object') return [];
  const fetchedAt = snapshot.fetchedAt || Date.now();
  return Object.entries(snapshot.quotes).map(([sym, q]) => {
    const price = q.baselinePrice ?? q.price;
    return {
      sym: String(sym).toUpperCase(),
      price,
      open: q.sessionOpen ?? q.open ?? price,
      high: q.high ?? price,
      low: q.low ?? price,
      prevClose: q.prevClose ?? price,
      change: q.change ?? 0,
      changePct: q.changePct ?? 0,
      baselinePrice: price,
      sessionOpen: q.sessionOpen ?? q.open ?? price,
      updated: fetchedAt,
      simulated: true,
      anchored: true,
      fromCache: true,
      source: q.source || 'cached',
    };
  });
}

function readNavigatorOnline() {
  // Missing navigator (SSR / some shells) → allow network attempts.
  if (typeof navigator === 'undefined') return true;
  // Only an explicit false means browser-offline. Incomplete navigator stubs
  // (Node exposing navigator without a boolean onLine) stay "offline" for
  // fetch gating so headless tests don't hit browser-only APIs.
  return navigator.onLine === true;
}

/** Soft connectivity for background preload — allows Node tests when networkOnline is forced on. */
function canAttemptBackgroundPreload() {
  if (!networkOnline) return false;
  if (typeof navigator === 'undefined') return true;
  if (typeof navigator.onLine !== 'boolean') return true; // incomplete stub (Node)
  return navigator.onLine;
}

function emitStatus(mode, label) {
  statusCallback?.(mode, label);
}

function setNetworkOnline(online) {
  networkOnline = !!online;
  if (online) consecutiveFailures = 0;
}

function noteFetchSuccess() {
  const prev = nextConnectionState({ success: true });
  setNetworkOnline(prev.online);
  consecutiveFailures = prev.consecutiveFailures;
  lastSuccessfulFetch = Date.now();
  persistQuoteBaselines();
}

function noteFetchFailure({ force = false } = {}) {
  // Per-quote failures use soft hysteresis; batch/refresh callers pass force only
  // when the whole attempt produced no usable data.
  const prev = nextConnectionState({
    success: false,
    consecutiveFailures,
    navigatorOnline: readNavigatorOnline(),
    force,
  });
  consecutiveFailures = prev.consecutiveFailures;
  setNetworkOnline(prev.online);
}

function formatFetchAge(ts) {
  if (!ts) return '';
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return new Date(ts).toLocaleDateString();
}

export function getConnectionLabel() {
  if (!networkOnline) {
    const age = formatFetchAge(lastSuccessfulFetch);
    return age ? `Offline · last fetch ${age}` : 'Offline · using cached / seed prices';
  }
  const age = formatFetchAge(lastSuccessfulFetch);
  return age ? `Connected · base ${age}` : 'Connected';
}

function anchorLiveQuote(sym, live) {
  return {
    ...live,
    sym,
    baselinePrice: live.price,
    sessionOpen: live.open ?? live.price,
    simulated: false,
    anchored: true,
    fromCache: false,
  };
}

/**
 * Install a live-anchored quote (tests + internal re-anchor path).
 * Emits onQuoteTransition when replacing a seed / unanchored row.
 */
export function applyLiveAnchor(sym, live) {
  sym = String(sym || '').toUpperCase();
  if (!sym || !(live?.price > 0)) return null;
  const prev = quoteCache.get(sym) || null;
  const anchored = anchorLiveQuote(sym, { ...live, sym, source: live.source || 'live' });
  if (simulationMode) anchored.simulated = true;
  quoteCache.set(sym, anchored);
  emitQuoteTransition(sym, prev, anchored);
  return anchored;
}

/** True if quote came from a real provider (or a prior live cache), not a hash seed. */
export function isLiveAnchoredQuote(q) {
  if (!q || !(q.price > 0)) return false;
  const src = String(q.source || '');
  if (src === 'seed') return false;
  if (src === 'yahoo' || src === 'finnhub' || src === 'proxy' || src === 'live') return true;
  // Persisted baselines from a prior live session
  if (q.fromCache && src && src !== 'seed' && src !== 'cached') return true;
  if (q.fromCache && q.anchored && src === 'cached') return true;
  return !!(q.anchored && !q.fromCache && src && src !== 'seed');
}

/** Count live-anchored rows currently in the quote cache (includes warm persisted baselines). */
export function countLiveAnchoredQuotes() {
  let n = 0;
  for (const q of quoteCache.values()) {
    if (isLiveAnchoredQuote(q)) n++;
  }
  return n;
}

/** Priority mega/tape names first, then the rest of ALL_SYMBOLS (deduped). */
export function buildPreloadSymbolOrder(prioritySymbols = []) {
  const bootPriority = mergeQuoteRefreshSymbols(prioritySymbols, [
    'AAPL', 'NVDA', 'TSLA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'AMD', 'SPY', 'QQQ', 'NFLX',
  ]);
  const mega = [...MEGA_CAP_SYMS];
  const out = [];
  const seen = new Set();
  for (const group of [bootPriority, mega, ALL_SYMBOLS]) {
    for (const raw of group || []) {
      const sym = String(raw || '').toUpperCase();
      if (!sym || seen.has(sym)) continue;
      seen.add(sym);
      out.push(sym);
    }
  }
  return out;
}

export function formatPreloadStatusLabel(loaded, target, { background = false } = {}) {
  const n = Math.max(0, Number(loaded) || 0);
  const t = Math.max(1, Number(target) || 500);
  return background
    ? `Anchoring baselines… ${n} / ${t}`
    : `Loading quotes… ${n} / ${t}`;
}

/** Parse preload progress from emitStatus labels (`Loading quotes… X / Y` or `Anchoring… X / Y`). */
export function parsePreloadProgress(label) {
  const m = String(label || '').match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return null;
  return { loaded: Number(m[1]), target: Number(m[2]) };
}

let backgroundPreloadInFlight = false;

export function isBackgroundPreloadActive() {
  return backgroundPreloadInFlight;
}

/**
 * Boot preload: count warm cache first, then throttled-fetch only the delta to `target`.
 * Aborts between/during batches when shouldAbort() is true (Continue anyway).
 * Uses existing emitStatus channel for progress — do not add a second status path.
 */
export async function preloadQuotesToTarget({
  target = CONFIG.QUOTE_PRELOAD_GATE_TARGET || 50,
  prioritySymbols = [],
  shouldAbort = () => /** @type {boolean} */ (false),
  batchSize = CONFIG.QUOTE_BATCH_SIZE || 30,
  force = true,
  /** Test hook: (sym) => Promise<liveQuote|null> — skips real providers when set. */
  fetchOne = null,
  /** Test hook: throttle gap (ms). Production keeps the normal batch gap. */
  gapMs = fetchOne ? 0 : 450,
  /** Background climb uses the same fetch path but a distinct status label for the badge. */
  background = false,
} = {}) {
  const goal = Math.min(Math.max(1, Number(target) || 50), ALL_SYMBOLS.length);
  let loaded = countLiveAnchoredQuotes();
  emitStatus('loading', formatPreloadStatusLabel(loaded, goal, { background }));
  if (loaded >= goal || shouldAbort()) {
    return {
      ok: loaded >= goal,
      loaded,
      target: goal,
      fetched: 0,
      aborted: shouldAbort() && loaded < goal,
    };
  }

  const pending = buildPreloadSymbolOrder(prioritySymbols)
    .filter((sym) => !isLiveAnchoredQuote(quoteCache.get(sym)));

  let fetched = 0;
  const concurrency = 2;

  async function fetchAbortable(sym) {
    if (shouldAbort()) return null;
    if (fetchOne) {
      const work = Promise.resolve().then(() => fetchOne(sym));
      let settled = false;
      work.finally(() => { settled = true; }).catch(() => {});
      while (!settled) {
        if (shouldAbort()) return null;
        await Promise.race([work.then(() => null, () => null), delay(50)]);
      }
      const live = await work.catch(() => null);
      if (live?.price > 0) applyLiveAnchor(sym, { ...live, source: live.source || 'live' });
      return live;
    }
    return fetchQuote(sym, { force });
  }

  for (let i = 0; i < pending.length && loaded < goal; ) {
    if (shouldAbort()) break;
    const remaining = goal - loaded;
    const slice = pending.slice(i, i + Math.min(batchSize, remaining));
    if (!slice.length) break;
    i += slice.length;

    for (let j = 0; j < slice.length; j += concurrency) {
      if (shouldAbort() || loaded >= goal) break;
      const chunk = slice.slice(j, j + concurrency);
      await Promise.all(chunk.map((sym) => fetchAbortable(sym)));
      fetched += chunk.length;
      loaded = countLiveAnchoredQuotes();
      emitStatus('loading', formatPreloadStatusLabel(Math.min(loaded, goal), goal, { background }));
      if (j + concurrency < slice.length && !shouldAbort() && loaded < goal && gapMs > 0) {
        await delay(gapMs);
      }
    }
  }

  loaded = countLiveAnchoredQuotes();
  const aborted = shouldAbort() && loaded < goal;
  emitStatus('loading', formatPreloadStatusLabel(Math.min(loaded, goal), goal, { background }));
  return {
    ok: loaded >= goal,
    loaded,
    target: goal,
    fetched,
    aborted,
  };
}

/**
 * Non-blocking climb toward the full baseline target after the small gate clears.
 * Emits progress on the existing status channel so the top-bar badge can show "N/500 bases".
 */
export function startBackgroundQuotePreload({
  target = CONFIG.QUOTE_PRELOAD_BACKGROUND_TARGET || 500,
  prioritySymbols = [],
  onDone = null,
  /** Test hooks — same as preloadQuotesToTarget */
  fetchOne = null,
  gapMs = undefined,
} = {}) {
  if (backgroundPreloadInFlight) return false;
  if (!canAttemptBackgroundPreload()) return false;
  const goal = Math.min(Math.max(1, Number(target) || 500), ALL_SYMBOLS.length);
  if (countLiveAnchoredQuotes() >= goal) return false;

  backgroundPreloadInFlight = true;
  (async () => {
    try {
      await preloadQuotesToTarget({
        target: goal,
        prioritySymbols,
        background: true,
        fetchOne,
        gapMs: gapMs ?? (fetchOne ? 0 : 450),
      });
      startSimulationMode();
      const live = countLiveAnchoredQuotes();
      const fresh = [...quoteCache.values()].filter(q => q.anchored && !q.fromCache).length;
      if (live > 0 && networkOnline) {
        let src = 'live';
        try { src = isLocalServer() ? 'Yahoo' : getProviderLabel(); } catch { /* node tests */ }
        emitStatus('online', `Connected · ${fresh || live} baselines (${src})`);
      }
      onDone?.({ loaded: live, target: goal });
    } catch (e) {
      console.warn('Background quote preload failed', e);
    } finally {
      backgroundPreloadInFlight = false;
    }
  })();
  return true;
}

/** Test helper — reset background preload latch between cases. */
export function __resetBackgroundPreloadForTests() {
  backgroundPreloadInFlight = false;
  setNetworkOnline(true);
  consecutiveFailures = 0;
}

/** Test helper — wire emitStatus without running initApi (avoids browser globals). */
export function __setStatusCallbackForTests(fn) {
  statusCallback = typeof fn === 'function' ? fn : null;
}

export function pricesDiverge(a, b, pct = PRICE_OUTLIER_PCT) {
  const x = Number(a);
  const y = Number(b);
  if (!(x > 0) || !(y > 0)) return true;
  return Math.abs(x - y) / Math.max(x, y) > pct;
}

/**
 * Rebase in-memory quote to an authoritative price (usually last candle close).
 * Keeps session open / prevClose ratios when possible so % change stays sane.
 */
export function syncQuoteToPrice(sym, price, { source = 'candle' } = {}) {
  sym = String(sym || '').toUpperCase();
  const px = Number(price);
  if (!sym || !(px > 0)) return null;
  const existing = quoteCache.get(sym);
  if (existing && !shouldRebaseQuote(existing.price, px)) {
    return existing;
  }
  // Sim tape is authoritative for fills — candles never mutate tradeable prices.
  if (simulationMode && existing?.simulated && existing.price > 0) {
    return existing;
  }
  const prevClose = existing?.prevClose > 0 && !pricesDiverge(existing.prevClose, px, 0.35)
    ? existing.prevClose
    : px * 0.995;
  const open = existing?.sessionOpen > 0 && !pricesDiverge(existing.sessionOpen, px, 0.35)
    ? existing.sessionOpen
    : px * 0.998;
  const q = {
    ...(existing || {}),
    sym,
    price: +px.toFixed(4),
    open,
    high: Math.max(existing?.high ?? px, px),
    low: Math.min(existing?.low ?? px, px),
    prevClose,
    change: px - prevClose,
    changePct: ((px / prevClose) - 1) * 100,
    baselinePrice: px,
    sessionOpen: open,
    updated: Date.now(),
    simulated: true,
    anchored: source !== 'seed',
    fromCache: false,
    source: source === 'seed' ? 'seed' : (existing?.source && existing.source !== 'seed' ? existing.source : source),
  };
  quoteCache.set(sym, q);
  return q;
}

function hashSymPrice(sym) {
  let h = 2166136261;
  const s = String(sym).toUpperCase();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** After live data loads, game time drives prices from real starting points */
export function startSimulationMode() {
  if (simulationMode) return;
  simulationMode = true;
  quoteCache.forEach((q, sym) => {
    if (!(q?.price > 0)) return;
    // Do NOT mark pure seeds as anchored — that poisoned localStorage baselines
    // (DOCU seed ~$361 persisted as if it were a live baseline).
    quoteCache.set(sym, {
      ...q,
      baselinePrice: q.baselinePrice ?? q.price,
      sessionOpen: q.sessionOpen ?? q.open ?? q.price,
      simulated: true,
      anchored: isLiveAnchoredQuote(q) ? true : !!q.anchored && q.source !== 'seed',
    });
  });
}

let cloudProxyReady = false;

/** Set when /api/config answers (local Electron proxy or hosted Worker). */
export function markCloudProxyConfigured(ready = true) {
  cloudProxyReady = !!ready;
}

export function isCloudProxyConfigured() {
  return cloudProxyReady;
}

export function isApiConfigured() {
  return isLocalServer()
    || cloudProxyReady
    || !!(CONFIG.FINNHUB_API_KEY && CONFIG.FINNHUB_API_KEY !== 'YOUR_FINNHUB_API_KEY');
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

/** Deterministic seed — same price every time for a symbol (no random jumping).
 * Unknown symbols hash into ~$8–$180 (not the old 30–430 charCode formula that
 * put DOCU at ~$361 and HPQ at ~$377). Prefer SEED_PRICES for known names.
 * Optional hintPrice (e.g. position avg) beats the hash when the name has no seed. */
export function seedQuote(sym, { hintPrice } = {}) {
  sym = sym.toUpperCase();
  if (quoteCache.has(sym)) {
    const existing = quoteCache.get(sym);
    if (existing?.price > 0 && isPlausibleAgainstSeed(sym, existing.price)) {
      return existing;
    }
    // Drop poisoned cache rows so cold-start seeds win until live arrives
    quoteCache.delete(sym);
  }

  const known = SEED_PRICES[sym];
  const hint = Number(hintPrice);
  const base = known
    || (hint > 0 ? hint : null)
    || (8 + (hashSymPrice(sym) % 173));
  const prev = base * 0.995;
  const q = {
    sym,
    price: base,
    open: base * 0.998,
    high: base * 1.008,
    low: base * 0.992,
    prevClose: prev,
    change: base - prev,
    changePct: ((base / prev) - 1) * 100,
    baselinePrice: base,
    sessionOpen: base * 0.998,
    updated: Date.now(),
    simulated: true,
    anchored: false,
    source: 'seed',
  };
  quoteCache.set(sym, q);
  return q;
}

export function fillMissingQuotes(symbols) {
  (symbols || ALL_SYMBOLS.slice(0, 80)).forEach(sym => {
    if (!quoteCache.has(sym)) seedQuote(sym);
  });
}

/** Symbols currently held (longs, shorts, option underlyings). */
export function getHeldSymbols(portfolio) {
  const out = [];
  const seen = new Set();
  const push = (raw) => {
    const sym = String(raw || '').toUpperCase();
    if (!sym || seen.has(sym)) return;
    seen.add(sym);
    out.push(sym);
  };
  Object.keys(portfolio?.longs || {}).forEach(push);
  Object.keys(portfolio?.shorts || {}).forEach(push);
  (portfolio?.options || []).forEach((opt) => push(opt?.sym));
  return out;
}

/** Seed any missing held quotes near avg cost so login never flashes a hash spike. */
export function seedQuotesForPositions(portfolio) {
  const seedPos = (sym, avg) => {
    const key = String(sym || '').toUpperCase();
    if (!key || quoteCache.has(key)) return;
    seedQuote(key, { hintPrice: avg });
  };
  Object.entries(portfolio?.longs || {}).forEach(([sym, p]) => seedPos(sym, p?.avgPrice));
  Object.entries(portfolio?.shorts || {}).forEach(([sym, p]) => seedPos(sym, p?.avgPrice));
  (portfolio?.options || []).forEach((opt) => {
    const spot = Number(opt?.spotAtBuy || opt?.strike);
    seedPos(opt?.sym, spot > 0 ? spot : undefined);
  });
}

export function persistQuoteBaselines() {
  if (typeof localStorage === 'undefined') return false;
  try {
    // Never persist pure seeds — they were the DOCU~$361 / HPQ~$388 poison path
    const entries = [...quoteCache.entries()].filter(([, q]) => shouldPersistBaselineQuote(q));
    if (!entries.length) return false;
    const snap = buildBaselineSnapshot(entries, lastSuccessfulFetch || Date.now());
    if (!Object.keys(snap.quotes).length) return false;
    localStorage.setItem(BASELINE_KEY, JSON.stringify(snap));
    return true;
  } catch {
    return false;
  }
}

function clearLegacyBaselines() {
  if (typeof localStorage === 'undefined') return;
  for (const key of LEGACY_BASELINE_KEYS) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }
}

export function loadPersistedBaselines() {
  if (typeof localStorage === 'undefined') return 0;
  try {
    clearLegacyBaselines();
    const raw = localStorage.getItem(BASELINE_KEY);
    if (!raw) return 0;
    const snap = JSON.parse(raw);
    if (snap?.version && snap.version < BASELINE_VERSION) {
      localStorage.removeItem(BASELINE_KEY);
      return 0;
    }
    const list = quotesFromBaselineSnapshot(snap).filter((q) => {
      if (!(q.price > 0)) return false;
      // Drop pre-split / hash-seed poison (NFLX~$889, DOCU~$361, etc.)
      if (!isPlausibleAgainstSeed(q.sym, q.price)) return false;
      // Also drop moderate seed retunes that still look like the old table
      const known = getSeedPrice(q.sym);
      if (known != null && pricesDiverge(q.price, known, 0.55)
        && String(q.source || '') === 'seed') return false;
      return true;
    });
    list.forEach((q) => {
      if (!quoteCache.has(q.sym)) quoteCache.set(q.sym, q);
    });
    if (snap.fetchedAt) lastSuccessfulFetch = snap.fetchedAt;
    return list.length;
  } catch {
    return 0;
  }
}

async function runThrottled(items, fn, concurrency = 2, gapMs = 400) {
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    await Promise.all(chunk.map(fn));
    if (i + concurrency < items.length) await delay(gapMs);
  }
}

/** Fetch live quote — during simulation keeps live-anchored desk tape unless forced.
 * Seed / unanchored quotes still re-anchor from the network when online so off-pool
 * symbols don't stay stuck at hash seeds for the whole session.
 * Implausible "live" anchors (pre-split NFLX etc.) never block a re-fetch. */
export async function fetchQuote(sym, { force = false } = {}) {
  sym = sym.toUpperCase();
  const existing = quoteCache.get(sym);
  const existingPlausible = existing && isPlausibleAgainstSeed(sym, existing.price);

  // Keep the desk tape during sim only for already live-anchored quotes.
  // Seeds (even known SEED_PRICES rows) must still re-anchor once when online.
  const keepSimulating = simulationMode && existing?.simulated && !force
    && existingPlausible
    && isLiveAnchoredQuote(existing);
  if (keepSimulating) return existing;

  const allowNet = shouldAttemptNetworkFetch({
    force,
    networkOnline,
    navigatorOnline: readNavigatorOnline(),
  });

  if (!allowNet) {
    if (existing && existingPlausible) return existing;
    if (existing && !existingPlausible) {
      quoteCache.delete(sym);
      return seedQuote(sym);
    }
    return seedQuote(sym);
  }

  const live = await fetchFromProviders(sym);
  if (live?.price > 0) {
    activeProvider = live.source || 'live';
    const seedRef = getSeedPrice(sym);
    if (!force && existing && isLiveAnchoredQuote(existing) && existingPlausible
      && !shouldReplaceCachedWithLive(existing, live.price, seedRef)
      && !pricesDiverge(existing.price, live.price, 0.35)) {
      // Already have a sane live-ish anchor close to the fresh print
      if (simulationMode && existing.simulated) return existing;
    }
    const prev = existing || null;
    const anchored = anchorLiveQuote(sym, live);
    if (simulationMode) anchored.simulated = true;
    quoteCache.set(sym, anchored);
    emitQuoteTransition(sym, prev, anchored);
    noteFetchSuccess();
    return anchored;
  }

  noteFetchFailure();
  if (existing && existingPlausible) return existing;
  if (existing && !existingPlausible) quoteCache.delete(sym);
  return seedQuote(sym);
}

/**
 * Resolve a spot for options / trade UI. When allowSeed is false, seed quotes
 * are reported as unanchored so callers can force a live fetch first.
 * When this path does fetch, force:true is intentional: the symbol is not yet
 * live-anchored (seed / missing) — re-anchor before a trade fill. Already
 * live-anchored quotes skip the network branch unless the caller passes force.
 * Mid-run Sync must NOT use this pattern on drifted sim tape — use refreshQuotesMidRun.
 */
export async function ensureLiveQuoteForDisplay(sym, {
  listingFallbackPrice = null,
  allowSeed = false,
  force = false,
} = {}) {
  sym = String(sym || '').toUpperCase();
  let q = getCachedQuote(sym);
  if ((!q || !isLiveAnchoredQuote(q) || force) && shouldAttemptNetworkFetch({
    // force:true on the network gate only so a single unanchored trade symbol can
    // re-anchor offline→online; never use this as a blanket mid-run Sync.
    force: true,
    networkOnline,
    navigatorOnline: readNavigatorOnline(),
  })) {
    q = await fetchQuote(sym, { force: true });
  }
  if (!q) q = getCachedQuote(sym);
  if (q && isLiveAnchoredQuote(q)) {
    return { price: q.price, anchored: true, source: q.source || 'live', quote: q };
  }
  if (allowSeed && q?.price > 0) {
    return { price: q.price, anchored: false, source: q.source || 'seed', quote: q };
  }
  const fallback = Number(listingFallbackPrice);
  if (allowSeed && fallback > 0) {
    return { price: fallback, anchored: false, source: 'listing', quote: q || null };
  }
  return {
    price: q?.price > 0 ? q.price : (fallback > 0 ? fallback : 0),
    anchored: false,
    source: q?.source || (fallback > 0 ? 'listing' : 'none'),
    quote: q || null,
  };
}

export async function fetchPriorityQuotes(symbols, { force = false } = {}) {
  const unique = [...new Set(symbols.map(s => s.toUpperCase()))];
  await runThrottled(unique, (sym) => fetchQuote(sym, { force }), 2, 450);
  return unique.filter(s => quoteCache.has(s)).length;
}

export async function fetchQuoteBatch(symbols, { force = false } = {}) {
  const batch = symbols || ALL_SYMBOLS.slice(
    batchIndex * CONFIG.QUOTE_BATCH_SIZE,
    (batchIndex + 1) * CONFIG.QUOTE_BATCH_SIZE,
  );
  if (!symbols) {
    batchIndex = (batchIndex + 1) % Math.max(1, Math.ceil(ALL_SYMBOLS.length / CONFIG.QUOTE_BATCH_SIZE));
  }
  await runThrottled(batch, (sym) => fetchQuote(sym, { force }), 2, 450);
  batch.forEach(sym => { if (!quoteCache.has(sym)) seedQuote(sym); });
  return batch.length;
}

/**
 * Refresh symbols from the network.
 * Mid-run callers must use refreshQuotesMidRun (force:false + seed filter).
 * force:true is for cold-start / reset-desk only — pre-simulation, no drift to protect yet.
 */
export async function refreshQuotes(symbols, { force = false } = {}) {
  const unique = [...new Set(symbols.map(s => s.toUpperCase()))];
  const beforeFetch = lastSuccessfulFetch;

  if (!shouldAttemptNetworkFetch({
    force,
    networkOnline,
    navigatorOnline: readNavigatorOnline(),
  })) {
    unique.forEach(sym => { if (!quoteCache.has(sym)) seedQuote(sym); });
    return { live: 0, total: quoteCache.size, ok: false, offline: true };
  }

  let freshCount = 0;
  await runThrottled(unique, async (sym) => {
    const before = quoteCache.get(sym);
    const q = await fetchQuote(sym, { force: force || !simulationMode });
    if (q && !q.fromCache && q.source && q.source !== 'seed' && q.updated >= beforeFetch) {
      // Count only quotes that look newly anchored from providers this pass
      if (!before || q.updated !== before.updated || q.baselinePrice !== before.baselinePrice) {
        freshCount++;
      }
    }
  }, 2, 400);

  const gotFresh = lastSuccessfulFetch > beforeFetch || freshCount > 0;
  if (gotFresh) {
    noteFetchSuccess();
  } else if (force) {
    noteFetchFailure({ force: true });
  }

  return {
    live: [...quoteCache.values()].filter(q => q.anchored).length,
    total: quoteCache.size,
    ok: networkOnline && gotFresh,
    offline: !networkOnline,
  };
}

export async function fetchCandles(sym, range = '1D', count = null) {
  const key = String(sym || '').toUpperCase();
  let rangeKey = String(range || '1D').toUpperCase();
  if (rangeKey === '5D') rangeKey = '1W';
  const fallback = getCandleFallback(rangeKey, count);
  const deskPx = quoteCache.get(key)?.price;
  const session = isSessionRangeKey(rangeKey);

  // Sim 1D: prefer real intraday ledger only (≥2 bars). A single morning stub
  // from beginSimSession must NOT block Yahoo/seed remap — that made only
  // heavily-watched names (often AAPL) look correct.
  if (simulationMode) {
    if (!session && deskPx > 0) ensureCareerDailyCatchUp(key, deskPx);
    if (session && hasUsableSimIntraday(key)) {
      const sliced = sliceSimCandlesForRange(key, rangeKey, deskPx > 0 ? deskPx : null);
      if (sliced?.length) return sliced;
    }
    if (!session && launchpadCoversRange(key, rangeKey)) {
      const sliced = sliceSimCandlesForRange(key, rangeKey, deskPx > 0 ? deskPx : null);
      if (sliced?.length) return sliced;
    }
  }

  const allowNet = shouldAttemptNetworkFetch({
    force: false,
    networkOnline,
    navigatorOnline: readNavigatorOnline(),
  });

  if (allowNet) {
    const live = await fetchCandlesFromProviders(sym, rangeKey, fallback.count);
    if (live?.length) {
      noteFetchSuccess();
      if (simulationMode) {
        const freshPx = quoteCache.get(key)?.price;
        let series = live;
        if (freshPx > 0) {
          const rebased = rebaseCandlesToPrice(live, freshPx);
          if (rebased?.length) series = rebased;
        }
        if (session) {
          seedSimIntradayFromCandles(key, series);
        } else {
          if (freshPx > 0) ensureCareerDailyCatchUp(key, freshPx);
          seedSimLaunchpadDaily(key, series, {
            force: !launchpadCoversRange(key, rangeKey),
            range: rangeKey,
          });
        }
        const sliced = sliceSimCandlesForRange(key, rangeKey, freshPx > 0 ? freshPx : null);
        if (sliced?.length) return sliced;
        if (freshPx > 0) {
          const rebased = rebaseCandlesToPrice(live, freshPx);
          if (rebased?.length) return rebased;
        }
        return generateStableCandles(sym, fallback.count, fallback.minutes);
      }
      const lastClose = live[live.length - 1]?.close;
      if (lastClose > 0) {
        syncQuoteToPrice(sym, lastClose, { source: 'candle' });
      }
      return live;
    }
    noteFetchFailure();
  }

  const synth = generateStableCandles(sym, fallback.count, fallback.minutes);
  if (simulationMode && synth?.length) {
    if (session) seedSimIntradayFromCandles(key, synth);
    else {
      if (deskPx > 0) ensureCareerDailyCatchUp(key, deskPx);
      seedSimLaunchpadDaily(key, synth, {
        force: !launchpadCoversRange(key, rangeKey),
        range: rangeKey,
      });
    }
    const sliced = sliceSimCandlesForRange(key, rangeKey, deskPx > 0 ? deskPx : null);
    if (sliced?.length) return sliced;
  }
  return synth;
}

function getCandleFallback(range, count) {
  if (count != null) {
    const resMin = range === 'D' ? 1440 : parseInt(range, 10) || 5;
    return { count: Math.max(1, Number(count) || 120), minutes: resMin };
  }
  const key = String(range || '1D').toUpperCase();
  if (key === 'YTD') {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const days = Math.max(1, Math.ceil((now.getTime() - start.getTime()) / 86400000));
    return { count: Math.min(260, Math.max(30, Math.ceil(days * 5 / 7))), minutes: 1440 };
  }
  return CHART_RANGE_FALLBACKS[key] || CHART_RANGE_FALLBACKS['1D'];
}

/**
 * Offline / far-from-live fallback — mean-reverting walk with capped wicks.
 * Exported for quality tests.
 */
export function generateStableCandles(sym, count, resMin = 5) {
  const q = quoteCache.get(String(sym || '').toUpperCase()) || seedQuote(sym);
  const endPrice = Math.max(0.5, Number(q.price) || 100);
  const n = Math.max(2, Math.floor(Number(count) || 78));
  const minutes = Math.max(1, Number(resMin) || 5);
  const volScale = symbolCandleVolScale(sym);
  const sigma = candleBarVolFraction(minutes, volScale);
  const maxRangePct = sigma * 3.2; // ~3σ high-low cap per bar
  const step = minutes * 60;
  let now = Math.floor(Date.now() / 1000);
  if (simulationMode) {
    try {
      const t = Number(getSimLedgerNowSec());
      if (Number.isFinite(t) && t > 0) now = Math.floor(t);
    } catch { /* ignore */ }
  }
  const seed = [...String(sym).toUpperCase()].reduce((a, c, i) => a + c.charCodeAt(0) * (i + 3), 17);
  const noise = (i) => {
    const x = Math.sin((i + 1) * 12.9898 + seed * 0.017) * 43758.5453;
    return (x - Math.floor(x)) * 2 - 1;
  };

  // Walk backward from endPrice with mild mean reversion (no openBias yank).
  const closes = new Array(n);
  closes[n - 1] = endPrice;
  for (let i = n - 2; i >= 0; i--) {
    const shock = noise(i) * sigma + noise(i + 11) * sigma * 0.35;
    const raw = closes[i + 1] * (1 - shock);
    // Pull gently toward end so the path doesn't wander into fantasy land
    closes[i] = Math.max(0.5, raw * 0.92 + endPrice * 0.08);
  }
  closes[n - 1] = endPrice;

  const candles = [];
  for (let i = 0; i < n; i++) {
    const close = closes[i];
    const open = i === 0 ? close * (1 + noise(200) * sigma * 0.4) : closes[i - 1];
    const body = close - open;
    // Wicks: fraction of body + small independent noise — never multi-% spears
    const wickUp = Math.abs(body) * (0.15 + Math.abs(noise(i + 3)) * 0.35)
      + endPrice * sigma * (0.12 + Math.abs(noise(i + 17)) * 0.25);
    const wickDn = Math.abs(body) * (0.15 + Math.abs(noise(i + 7)) * 0.35)
      + endPrice * sigma * (0.12 + Math.abs(noise(i + 23)) * 0.25);
    let high = Math.max(open, close) + wickUp;
    let low = Math.min(open, close) - wickDn;
    const mid = (open + close) / 2;
    const maxSpan = mid * maxRangePct;
    if (high - low > maxSpan) {
      const bodyHigh = Math.max(open, close);
      const bodyLow = Math.min(open, close);
      const bodySpan = bodyHigh - bodyLow;
      const room = Math.max(0, maxSpan - bodySpan);
      high = bodyHigh + room * 0.55;
      low = bodyLow - room * 0.45;
    }
    const volBase = minutes >= 1440 ? 2.8e7 : minutes >= 60 ? 4e6 : 1.2e6;
    candles.push({
      time: now - (n - 1 - i) * step,
      open: +open.toFixed(4),
      close: +close.toFixed(4),
      high: +high.toFixed(4),
      low: +Math.max(0.01, low).toFixed(4),
      volume: Math.round(volBase * volScale * (0.55 + Math.abs(noise(i + 5)) * 0.9)),
    });
  }
  return candles;
}

/** Pick the real article href from provider fields — never invent search URLs. */
export function pickNewsArticleUrl(item) {
  if (!item || typeof item !== 'object') return '';
  const candidates = [
    item.url,
    item.link,
    item.article_url,
    item.articleUrl,
    item.news_url,
    item.newsUrl,
    item.storyUrl,
    item.story_url,
  ];
  for (const raw of candidates) {
    const s = String(raw || '').trim();
    if (!s) continue;
    try {
      const u = new URL(s);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
      // Reject generic search placeholders from older builds / bad proxies
      if (/news\.google\.com\/search/i.test(u.href)) continue;
      return u.href;
    } catch { /* try next */ }
  }
  return '';
}

/** Normalize Finnhub (or proxy) news rows so World Events always gets url/summary/source. */
export function normalizeMarketNewsItem(item) {
  if (!item || typeof item !== 'object') return null;
  const headline = String(item.headline || item.title || item.summary || '').trim();
  if (!headline) return null;
  const summary = String(item.summary || item.description || '').trim();
  return {
    category: item.category || 'general',
    datetime: Number(item.datetime) || Math.floor(Date.now() / 1000),
    headline,
    id: item.id ?? item.uuid ?? undefined,
    image: item.image || item.imageUrl || '',
    related: item.related || '',
    source: String(item.source || item.publisher || 'Market wire').trim() || 'Market wire',
    summary: summary && summary !== headline ? summary : '',
    url: pickNewsArticleUrl(item),
  };
}

function normalizeMarketNewsList(list) {
  if (!Array.isArray(list)) return [];
  return list.map(normalizeMarketNewsItem).filter(Boolean).slice(0, 25);
}

async function finnhubNews() {
  if (!shouldAttemptNetworkFetch({
    force: false,
    networkOnline,
    navigatorOnline: readNavigatorOnline(),
  })) return null;

  if (isLocalServer()) {
    try {
      const res = await fetch('/api/news');
      if (res.ok) {
        const data = await res.json();
        const news = normalizeMarketNewsList(data.news);
        if (news.length) {
          noteFetchSuccess();
          return news;
        }
      }
    } catch { /* fall through */ }
  }
  if (!CONFIG.FINNHUB_API_KEY || CONFIG.FINNHUB_API_KEY === 'YOUR_FINNHUB_API_KEY') return null;
  try {
    const res = await fetch(`https://finnhub.io/api/v1/news?category=general&token=${CONFIG.FINNHUB_API_KEY}`);
    if (!res.ok) {
      noteFetchFailure();
      return null;
    }
    const data = await res.json();
    noteFetchSuccess();
    const news = normalizeMarketNewsList(data);
    return news.length ? news : null;
  } catch {
    noteFetchFailure();
    return null;
  }
}

export async function fetchMarketNews() {
  const data = await finnhubNews();
  if (data?.length) { lastNews = data; return lastNews; }
  if (!lastNews.length) {
    // Offline stubs only — no invented article/search URLs (titles stay unlinked).
    lastNews = normalizeMarketNewsList([
      {
        headline: 'Markets await Fed decision — traders cautious',
        source: 'Market Wire',
        datetime: Math.floor(Date.now() / 1000),
        summary: 'Simulated desk brief while the live wire is quiet. Tape still drifts off last baselines.',
      },
      {
        headline: 'Tech sector leads pre-market gains',
        source: 'Market Wire',
        datetime: Math.floor(Date.now() / 1000) - 3600,
        summary: 'Simulated desk brief — no live article feed this session. Watch the accelerated open for sector rotation.',
      },
    ]);
  }
  return lastNews;
}

export function getLastNews() { return lastNews; }

/** Opportunistic base fetch when connectivity returns */
export async function attemptReconnectFetch(prioritySymbols = []) {
  if (reconnectInFlight) return { ok: false, skipped: true };
  if (!readNavigatorOnline()) {
    setNetworkOnline(false);
    emitStatus('offline', getConnectionLabel());
    return { ok: false, offline: true };
  }
  reconnectInFlight = true;
  emitStatus('loading', 'Reconnecting…');
  try {
    const priority = mergeQuoteRefreshSymbols(prioritySymbols, [
      'AAPL', 'NVDA', 'TSLA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'AMD', 'SPY', 'QQQ', 'NFLX',
    ]);
    // Mid-run reconnect: same soft path as toolbar refresh — never yank live-anchored sim tape.
    // force:true stays on cold-start initApi only (pre-simulation, no drift to protect yet).
    const mid = await refreshQuotesMidRun(priority);
    startSimulationMode();
    // Nothing to re-anchor (all live) counts as healthy reconnect — do not force-yank.
    const ok = networkOnline && !mid.offline && (mid.fetched === 0 || mid.ok);
    if (ok) {
      const live = [...quoteCache.values()].filter(q => q.anchored).length;
      const src = isLocalServer() ? 'Yahoo' : getProviderLabel();
      emitStatus('online', `Connected · ${live} baselines (${src})`);
      return { ok: true, live };
    }
    emitStatus('offline', getConnectionLabel());
    return { ok: false };
  } catch {
    noteFetchFailure({ force: true });
    emitStatus('offline', getConnectionLabel());
    return { ok: false };
  } finally {
    reconnectInFlight = false;
  }
}

function bindConnectivity(getPrioritySymbols) {
  if (connectivityBound || typeof window === 'undefined') return;
  connectivityBound = true;
  window.addEventListener('offline', () => {
    setNetworkOnline(false);
    emitStatus('offline', getConnectionLabel());
  });
  window.addEventListener('online', () => {
    const syms = typeof getPrioritySymbols === 'function' ? getPrioritySymbols() : [];
    attemptReconnectFetch(syms);
  });
}

/**
 * @param {function} onStatus — existing emitStatus sink (mode, label)
 * @param {string[]} prioritySymbols
 * @param {{ preloadGate?: boolean, shouldAbort?: () => boolean, preloadTarget?: number }} [options]
 *   preloadGate: first-launch / Reset only — await until target live-anchored quotes (or abort).
 *   Offline boots skip the gate entirely (seed prices + existing offline messaging).
 */
export async function initApi(onStatus, prioritySymbols = [], options = {}) {
  statusCallback = onStatus;
  const cached = loadPersistedBaselines();
  const bootSyms = mergeQuoteRefreshSymbols(
    prioritySymbols,
    prioritySymbols.length ? [] : ALL_SYMBOLS.slice(0, 80),
  );
  fillMissingQuotes(bootSyms);
  startSimulationMode();

  const navOnline = readNavigatorOnline();
  if (!navOnline) setNetworkOnline(false);

  bindConnectivity(() => mergeQuoteRefreshSymbols(
    typeof prioritySymbols === 'function' ? prioritySymbols() : prioritySymbols,
  ));

  if (!networkOnline || !navOnline) {
    emitStatus('offline', cached
      ? `Offline · ${cached} cached baselines`
      : `Offline · seed prices (${quoteCache.size})`);
    return { ok: true, offline: true, preload: 'skipped' };
  }

  // First-launch / Reset: block until warm-cache + network delta reach the small gate.
  // Continue-from-save leaves preloadGate false so boot stays fast.
  if (options.preloadGate) {
    try {
      const gateTarget = options.preloadTarget
        ?? CONFIG.QUOTE_PRELOAD_GATE_TARGET
        ?? 50;
      const result = await preloadQuotesToTarget({
        target: gateTarget,
        prioritySymbols,
        shouldAbort: typeof options.shouldAbort === 'function' ? options.shouldAbort : () => false,
      });
      startSimulationMode();
      const live = countLiveAnchoredQuotes();
      const fresh = [...quoteCache.values()].filter(q => q.anchored && !q.fromCache).length;
      if (live > 0 && networkOnline) {
        const src = isLocalServer() ? 'Yahoo' : getProviderLabel();
        emitStatus('online', `Connected · ${fresh || live} baselines (${src})`);
      } else if (cached) {
        emitStatus('online', `Connected · ${cached} cached baselines`);
      } else {
        emitStatus('online', `Connected · ${quoteCache.size} quotes`);
      }

      // Non-blocking climb toward 500 — badge shows N/500 bases until settled.
      if (options.backgroundPreload !== false && canAttemptBackgroundPreload()) {
        startBackgroundQuotePreload({
          target: options.backgroundTarget ?? CONFIG.QUOTE_PRELOAD_BACKGROUND_TARGET ?? 500,
          prioritySymbols,
        });
      }

      return { ok: true, offline: false, preload: result };
    } catch (e) {
      console.warn('Preload gate failed', e);
      noteFetchFailure({ force: true });
      emitStatus('offline', cached
        ? `Offline · ${cached} cached baselines`
        : `Offline · ${quoteCache.size} quotes`);
      return { ok: false, offline: true, preload: 'failed' };
    }
  }

  emitStatus('loading', 'Fetching live baselines…');

  (async () => {
  try {
      const priority = mergeQuoteRefreshSymbols(prioritySymbols, [
        'AAPL', 'NVDA', 'TSLA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'AMD', 'SPY', 'QQQ', 'NFLX',
      ]);
      // force:true — cold start only. Pre-simulation: no mid-run sim drift to protect yet.
      // Do NOT copy this into toolbar / Deal Desk / viewport mid-run refresh (use refreshQuotesMidRun).
      const before = lastSuccessfulFetch;
      await fetchPriorityQuotes(priority, { force: true });
      await fetchQuoteBatch(priority, { force: true });
      startSimulationMode();
      const live = [...quoteCache.values()].filter(q => q.anchored && !q.fromCache).length;
      const gotFresh = lastSuccessfulFetch > before || live > 0;
      if (gotFresh && networkOnline) {
        const src = isLocalServer() ? 'Yahoo' : getProviderLabel();
        emitStatus('online', `Connected · ${live || quoteCache.size} baselines (${src})`);
      } else {
        setNetworkOnline(false);
        emitStatus('offline', cached
          ? `Offline · ${cached} cached baselines`
          : `Offline · seed prices (${quoteCache.size})`);
      }
    } catch (e) {
      console.warn('API fetch failed', e);
      noteFetchFailure({ force: true });
      emitStatus('offline', cached
        ? `Offline · ${cached} cached baselines`
        : `Offline · ${quoteCache.size} quotes`);
    }
  })();

  return { ok: true, offline: false, preload: 'skipped' };
}

/**
 * Modest base-quote refresh while online only.
 * Offline: silent (no network). During simulationMode, live-anchored desk tape is
 * left alone — but seed / unanchored symbols in the refresh set still re-anchor.
 */
export function startQuoteRefresh(onRefresh, getSymbols) {
  if (refreshTimer) clearInterval(refreshTimer);
  const interval = CONFIG.ONLINE_BASE_REFRESH_MS || Math.max(CONFIG.QUOTE_REFRESH_MS * 20, 300000);
  refreshTimer = setInterval(async () => {
    if (!networkOnline || !readNavigatorOnline()) return;
    const syms = getSymbols?.() || ['AAPL', 'NVDA', 'TSLA'];
    // Skip live-anchored quotes mid-sim (avoids yanking the desk tape to the real market).
    // Seed / unanchored / missing symbols still fetch so off-pool listings stay honest.
    const result = await refreshQuotesMidRun(syms);
    if (!result.fetched && !result.ok && result.offline) return;
    if (result.ok || result.fetched > 0) {
      startSimulationMode();
      onRefresh?.();
    } else if (!networkOnline) {
      emitStatus('offline', getConnectionLabel());
      onRefresh?.();
    }
  }, interval);
}
