// @ts-check
/**
 * Career chart ledger with hybrid live→sim windows for long TFs.
 * - 1D: sim intraday on game clock
 * - 1W/1M/6M/1Y/5Y/MAX: frozen Yahoo launchpadDaily + career sim daily;
 *   window = liveHead + simTail (live shrinks from the right as you play)
 *   ('5D' kept as alias for 1W)
 */

/** Soft cap ~5Y trading days. */
const MAX_DAILY_BARS = 1300;
const MAX_INTRADAY_BARS = 160;

/**
 * @typedef {{ time: number, open: number, high: number, low: number, close: number, volume?: number, day?: number }} SimBar
 * @typedef {{
 *   launchpadDaily: SimBar[],
 *   daily: SimBar[],
 *   intraday: SimBar[],
 *   seeded?: boolean,
 *   launchpadReady?: boolean,
 * }} SymLedger
 */

/** @type {Map<string, SymLedger>} */
const ledgers = new Map();

/** @type {() => Date} */
let getClock = () => new Date();
/** @type {() => number} */
let getDay = () => 1;

/** Wire game clock from app boot (avoids api↔market import cycles). */
export function setSimLedgerClockProviders({ getMarketTime, getDayCount } = {}) {
  getClock = typeof getMarketTime === 'function'
    ? () => {
      try {
        const d = getMarketTime();
        return d instanceof Date ? d : new Date();
      } catch {
        return new Date();
      }
    }
    : () => new Date();
  getDay = typeof getDayCount === 'function'
    ? () => {
      try {
        const n = Number(getDayCount());
        return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
      } catch {
        return 1;
      }
    }
    : () => 1;
}

export function clearSimCandleLedger() {
  ledgers.clear();
}

export function hasSimLedger(sym) {
  const L = ledgers.get(normSym(sym));
  if (!L) return false;
  return (L.daily?.length || 0) > 0
    || (L.intraday?.length || 0) > 0
    || (L.launchpadDaily?.length || 0) > 0;
}

/** True when 1D session has a real intraday series (not just a morning open stub). */
export function hasUsableSimIntraday(sym) {
  const L = ledgers.get(normSym(sym));
  return (L?.intraday?.length || 0) >= 2;
}

/** True when long TF can compose without another Yahoo fetch (unless upgrade needed). */
export function hasLaunchpadDaily(sym) {
  const L = ledgers.get(normSym(sym));
  return !!(L?.launchpadReady && (L.launchpadDaily?.length || 0) > 0);
}

export function getSimLedgerEntry(sym) {
  return ledgers.get(normSym(sym)) || null;
}

function normSym(sym) {
  return String(sym || '').toUpperCase();
}

function ensureLedger(sym) {
  const key = normSym(sym);
  let L = ledgers.get(key);
  if (!L) {
    L = {
      launchpadDaily: [],
      daily: [],
      intraday: [],
      seeded: false,
      launchpadReady: false,
      launchpadForRange: '',
    };
    ledgers.set(key, L);
  }
  if (!Array.isArray(L.launchpadDaily)) L.launchpadDaily = [];
  if (!Array.isArray(L.daily)) L.daily = [];
  if (!Array.isArray(L.intraday)) L.intraday = [];
  return L;
}

function sanitizeBar(bar, day) {
  const open = Number(bar?.open);
  const high = Number(bar?.high);
  const low = Number(bar?.low);
  const close = Number(bar?.close);
  const time = Number(bar?.time);
  if (![open, high, low, close].every((v) => Number.isFinite(v) && v > 0)) return null;
  if (!Number.isFinite(time) || time <= 0) return null;
  const hi = Math.max(open, high, close);
  const lo = Math.max(0.01, Math.min(open, low, close));
  return {
    time: Math.floor(time),
    open: +open.toFixed(4),
    high: +hi.toFixed(4),
    low: +lo.toFixed(4),
    close: +close.toFixed(4),
    volume: Math.max(0, Math.round(Number(bar?.volume) || 0)),
    day: day != null ? day : (Number(bar?.day) || getDay()),
  };
}

function gameNowSec() {
  return Math.floor(getClock().getTime() / 1000);
}

/** Deterministic per-tick share count so the volume pane isn't empty in sim. */
export function synthTickVolume(sym, price, salt = 0) {
  const px = Math.max(0.5, Number(price) || 1);
  const seed = [...String(sym || 'X').toUpperCase()].reduce(
    (a, c, i) => a + c.charCodeAt(0) * (i + 3),
    17 + Math.floor(Number(salt) || 0),
  );
  const n = Math.sin(seed * 0.017) * 43758.5453;
  const u = n - Math.floor(n);
  return Math.max(180, Math.round(px * (10 + u * 48) + (seed % 1100)));
}

export function getSimLedgerNowSec() {
  return gameNowSec();
}

function bucketStart(timeSec, barMinutes) {
  const step = Math.max(60, Math.floor(Number(barMinutes) || 5) * 60);
  const t = Math.floor(Number(timeSec) || gameNowSec());
  return Math.floor(t / step) * step;
}

export function isSessionRangeKey(range) {
  const key = String(range || '1D').toUpperCase();
  return key === '1D' || key === '1' || key === '5' || key === '15' || key === '60';
}

export function dailyWantedForRange(range) {
  const key = String(range || '1D').toUpperCase();
  if (key === '1W' || key === '5D') return 7; // 5D = legacy alias for 1W
  if (key === '1M') return 22;
  if (key === '6M') return 126;
  if (key === 'YTD') return Math.min(260, Math.max(22, getDay()));
  if (key === '1Y') return 252;
  if (key === '5Y') return 1260;
  if (key === 'MAX' || key === 'D') return MAX_DAILY_BARS;
  return 0;
}

/** Longer TF rank — used so a 1W pad never blocks a 1Y/MAX fetch. */
export function launchpadRangeRank(range) {
  const key = String(range || '').toUpperCase();
  if (key === '1W' || key === '5D') return 1;
  if (key === '1M') return 2;
  if (key === '6M' || key === 'YTD') return 3;
  if (key === '1Y') return 4;
  if (key === '5Y') return 5;
  if (key === 'MAX' || key === 'D') return 6;
  return 0;
}

/** Whether launchpad is long enough for this TF (else fetchCandles must upgrade). */
export function launchpadCoversRange(sym, range) {
  const L = ledgers.get(normSym(sym));
  if (!L?.launchpadReady) return false;
  const want = dailyWantedForRange(range);
  const n = L.launchpadDaily?.length || 0;
  if (want <= 0) return n > 0;
  // Require nearly the full TF window — a 1W pad must NEVER satisfy 1M / 1Y / MAX.
  const threshold = want <= 30
    ? want
    : Math.max(Math.floor(want * 0.9), want - 10);
  if (n >= threshold) return true;
  // Yahoo often returns fewer bars than MAX/5Y want — accept if we already fetched that tier+.
  const need = launchpadRangeRank(range);
  const have = launchpadRangeRank(L.launchpadForRange);
  if (have < need) return false;
  if (need >= 5) return n >= 180;
  if (need >= 4) return n >= 200;
  return false;
}

/**
 * Seed 1D session intraday only — does NOT satisfy long-TF launchpad.
 */
export function seedSimIntradayFromCandles(sym, candles) {
  const key = normSym(sym);
  if (!key || !Array.isArray(candles) || !candles.length) return false;
  const L = ensureLedger(key);
  const day = getDay();
  const bars = candles
    .map((c) => sanitizeBar(c, day))
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);
  if (!bars.length) return false;

  const endT = bucketStart(gameNowSec(), 5);
  const step = 5 * 60;
  L.intraday = bars.slice(-MAX_INTRADAY_BARS).map((b, i, arr) => ({
    ...b,
    time: endT - (arr.length - 1 - i) * step,
    day,
  }));
  L.seeded = true;
  ledgers.set(key, L);
  return true;
}

/**
 * Store / upgrade frozen Yahoo (or synth) daily launchpad for long TFs.
 * Does not wipe career `daily`. Replaces launchpad when new series is longer / higher TF.
 */
export function seedSimLaunchpadDaily(sym, candles, { force = false, range = '1M' } = {}) {
  const key = normSym(sym);
  if (!key || !Array.isArray(candles) || !candles.length) return false;
  const L = ensureLedger(key);
  const bars = candles
    .map((c) => sanitizeBar(c, c?.day))
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);
  if (!bars.length) return false;

  const rangeKey = String(range || '1M').toUpperCase() === '5D'
    ? '1W'
    : String(range || '1M').toUpperCase();
  const want = dailyWantedForRange(rangeKey);
  // Trim to this TF's window so a 1W Yahoo pull (often 1mo daily) can't fake a 1M pad.
  let dailyish = collapseToDailyBars(bars).slice(-MAX_DAILY_BARS);
  if (want > 0 && want < MAX_DAILY_BARS) dailyish = dailyish.slice(-want);
  const newRank = launchpadRangeRank(rangeKey);
  const oldRank = launchpadRangeRank(L.launchpadForRange);

  if (
    !force
    && L.launchpadReady
    && (L.launchpadDaily?.length || 0) >= dailyish.length
    && oldRank >= newRank
  ) {
    return false;
  }

  L.launchpadDaily = dailyish;
  L.launchpadReady = true;
  L.launchpadForRange = rangeKey;
  L.seeded = true;
  ledgers.set(key, L);
  return true;
}

/** Group bars into one OHLC per UTC day (or 1440m step). */
function collapseToDailyBars(bars) {
  if (!bars.length) return [];
  // If already sparse (≥18h apart), treat as daily
  let minGap = Infinity;
  for (let i = 1; i < bars.length; i++) {
    minGap = Math.min(minGap, bars[i].time - bars[i - 1].time);
  }
  if (minGap >= 20 * 3600) return bars.slice();

  /** @type {Map<number, SimBar>} */
  const byDay = new Map();
  for (const b of bars) {
    const dayKey = Math.floor(b.time / 86400);
    const prev = byDay.get(dayKey);
    if (!prev) {
      byDay.set(dayKey, { ...b });
      continue;
    }
    prev.high = Math.max(prev.high, b.high);
    prev.low = Math.min(prev.low, b.low);
    prev.close = b.close;
    prev.volume = (prev.volume || 0) + (b.volume || 0);
    prev.time = b.time;
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, bar]) => bar);
}

/**
 * @deprecated Use seedSimIntradayFromCandles / seedSimLaunchpadDaily
 * Kept for callers: routes by range.
 */
export function seedSimLedgerFromCandles(sym, candles, range = '1D') {
  if (isSessionRangeKey(range)) return seedSimIntradayFromCandles(sym, candles);
  return seedSimLaunchpadDaily(sym, candles, { force: false, range });
}

export function recordSimTick(sym, price, { barMinutes = 5, volume = 0 } = {}) {
  const px = Number(price);
  if (!(px > 0)) return false;
  const key = normSym(sym);
  if (!key) return false;
  const L = ensureLedger(key);
  const day = getDay();
  const t = bucketStart(gameNowSec(), barMinutes);
  const last = L.intraday[L.intraday.length - 1];
  const tickVol = volume > 0
    ? Math.round(volume)
    : Math.max(35, Math.round(synthTickVolume(key, px, t) * 0.09));

  if (last && Number(last.time) === t && Number(last.day) === day) {
    last.high = Math.max(last.high, px);
    last.low = Math.min(last.low, px);
    last.close = +px.toFixed(4);
    last.volume = (last.volume || 0) + tickVol;
    return true;
  }

  if (last && Number(last.day) === day && t < Number(last.time)) return false;

  L.intraday.push({
    time: t,
    open: +px.toFixed(4),
    high: +px.toFixed(4),
    low: +px.toFixed(4),
    close: +px.toFixed(4),
    volume: volume > 0 ? Math.round(volume) : synthTickVolume(key, px, t),
    day,
  });
  if (L.intraday.length > MAX_INTRADAY_BARS) {
    L.intraday = L.intraday.slice(-MAX_INTRADAY_BARS);
  }
  return true;
}

export function foldSimDayForSymbol(sym, { day, close, open, high, low, time } = {}) {
  const key = normSym(sym);
  if (!key) return false;
  const L = ensureLedger(key);
  const d = day != null ? day : Math.max(1, getDay() - 1);
  const px = Number(close);
  if (!(px > 0) && !L.intraday.length) return false;

  let o = Number(open);
  let h = Number(high);
  let l = Number(low);
  let c = Number(close);
  let vol = 0;
  let t = Number(time) || gameNowSec();

  if (L.intraday.length) {
    const sess = L.intraday.filter((b) => !b.day || b.day === d || b.day === getDay());
    const use = sess.length ? sess : L.intraday;
    o = Number.isFinite(o) && o > 0 ? o : use[0].open;
    c = Number.isFinite(c) && c > 0 ? c : use[use.length - 1].close;
    h = Math.max(o, c, ...use.map((b) => b.high), Number.isFinite(h) ? h : 0);
    l = Math.min(o, c, ...use.map((b) => b.low), Number.isFinite(l) && l > 0 ? l : Infinity);
    vol = use.reduce((a, b) => a + (b.volume || 0), 0);
    t = use[use.length - 1].time;
  } else if (!(c > 0)) {
    return false;
  } else {
    o = o > 0 ? o : c;
    h = h > 0 ? Math.max(o, c, h) : Math.max(o, c);
    l = l > 0 ? Math.min(o, c, l) : Math.min(o, c);
  }

  const bar = sanitizeBar({ time: t, open: o, high: h, low: l, close: c, volume: vol }, d);
  if (!bar) return false;

  // Career sim only — never mutate launchpadDaily
  const existing = L.daily.findIndex((b) => Number(b.day) === d);
  if (existing >= 0) L.daily[existing] = bar;
  else L.daily.push(bar);
  L.daily.sort((a, b) => (a.day - b.day) || (a.time - b.time));
  if (L.daily.length > MAX_DAILY_BARS) L.daily = L.daily.slice(-MAX_DAILY_BARS);

  L.intraday = [];
  return true;
}

export function foldAllSimDays(quoteEntries, { day } = {}) {
  const d = day != null ? day : Math.max(1, getDay() - 1);
  const seen = new Set();
  if (Array.isArray(quoteEntries)) {
    for (const { sym, price, open, high, low } of quoteEntries) {
      const key = normSym(sym);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      foldSimDayForSymbol(key, { day: d, close: price, open, high, low });
    }
  }
  for (const key of [...ledgers.keys()]) {
    if (seen.has(key)) continue;
    const L = ledgers.get(key);
    if (L?.intraday?.length) foldSimDayForSymbol(key, { day: d });
  }
}

export function beginSimSessionFromQuotes(quoteEntries) {
  const day = getDay();
  const t = bucketStart(gameNowSec(), 5);
  if (!Array.isArray(quoteEntries)) return;
  for (const { sym, price } of quoteEntries) {
    const px = Number(price);
    const key = normSym(sym);
    if (!key || !(px > 0)) continue;
    const L = ensureLedger(key);
    L.intraday = [{
      time: t,
      open: +px.toFixed(4),
      high: +px.toFixed(4),
      low: +px.toFixed(4),
      close: +px.toFixed(4),
      volume: 0,
      day,
    }];
  }
}

/**
 * Backfill missing career daily bars through (getDay()-1) so tickers you open
 * late still hybrid-slide like names that were on the desk all run.
 */
export function ensureCareerDailyCatchUp(sym, endPrice) {
  const key = normSym(sym);
  if (!key) return false;
  const L = ensureLedger(key);
  const curDay = Math.max(1, getDay());
  const lastDone = curDay - 1;
  if (lastDone < 1) return false;
  const px = Number(endPrice);
  if (!(px > 0)) return false;

  const have = new Set(
    (L.daily || []).map((b) => Number(b.day)).filter((d) => Number.isFinite(d) && d > 0),
  );
  const now = gameNowSec();
  const from = Math.max(1, lastDone - MAX_DAILY_BARS + 1);
  let added = 0;
  const seed = [...key].reduce((a, c, i) => a + c.charCodeAt(0) * (i + 3), 17);

  for (let d = from; d <= lastDone; d++) {
    if (have.has(d)) continue;
    const age = lastDone - d;
    const t = now - (age + 1) * 86400;
    const n = Math.sin(d * 12.9898 + seed * 0.017) * 43758.5453;
    const wobble = ((n - Math.floor(n)) * 2 - 1) * 0.012;
    const c = Math.max(0.01, +(px * (1 + wobble)).toFixed(4));
    const bar = sanitizeBar({
      time: t,
      open: c,
      high: +(c * 1.006).toFixed(4),
      low: +(c * 0.994).toFixed(4),
      close: c,
      volume: 0,
    }, d);
    if (!bar) continue;
    L.daily.push(bar);
    added += 1;
  }
  if (!added) return false;
  L.daily.sort((a, b) => (a.day - b.day) || (a.time - b.time));
  if (L.daily.length > MAX_DAILY_BARS) L.daily = L.daily.slice(-MAX_DAILY_BARS);
  ledgers.set(key, L);
  return true;
}

function stripDay(b) {
  return {
    time: b.time,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume || 0,
  };
}

function pinLastClose(bars, endPrice) {
  if (!bars?.length) return bars;
  const px = Number(endPrice);
  const out = bars.map(stripDay);
  if (!(px > 0)) return out;
  const last = { ...out[out.length - 1] };
  last.close = +px.toFixed(4);
  last.high = Math.max(last.high, last.open, last.close);
  last.low = Math.min(last.low, last.open, last.close);
  out[out.length - 1] = last;
  return out;
}

/**
 * Ensure live head times sit before sim tail (monotonic category axis).
 */
function stitchMonotonic(liveHead, simTail) {
  if (!liveHead.length) return simTail.map((b) => ({ ...b }));
  if (!simTail.length) return liveHead.map((b) => ({ ...b }));
  const outLive = liveHead.map((b) => ({ ...b }));
  const firstSim = Number(simTail[0].time);
  const lastLive = Number(outLive[outLive.length - 1].time);
  if (lastLive < firstSim) return outLive.concat(simTail.map((b) => ({ ...b })));

  // Shift live head so it ends one day before first sim bar
  const step = 86400;
  const targetLast = firstSim - step;
  const shift = targetLast - lastLive;
  for (const b of outLive) b.time = Math.floor(b.time + shift);
  return outLive.concat(simTail.map((b) => ({ ...b })));
}

/**
 * Build chart candles for a TF.
 * Long TF: liveHead (launchpad) + simTail (career). Returns null if nothing usable.
 */
export function sliceSimCandlesForRange(sym, range = '1D', endPrice = null) {
  const key = normSym(sym);
  const L = ledgers.get(key);
  if (!L) return null;

  if (isSessionRangeKey(range)) {
    if (L.intraday.length >= 2) return pinLastClose(L.intraday, endPrice);
    if (L.daily.length >= 2) return pinLastClose(L.daily.slice(-Math.min(5, L.daily.length)), endPrice);
    if (L.intraday.length === 1) return pinLastClose(L.intraday, endPrice);
    return null;
  }

  const want = Math.max(2, dailyWantedForRange(range));
  const simTail = (L.daily || []).slice(-Math.min((L.daily || []).length, want));
  const liveKeep = Math.max(0, want - simTail.length);
  const pad = L.launchpadDaily || [];

  if (!pad.length && !simTail.length) return null;
  if (!pad.length) return pinLastClose(simTail, endPrice);

  // Drop newest live first: keep oldest `liveKeep` of the last `want` launchpad bars
  const padWindow = pad.slice(-want);
  const liveHead = liveKeep > 0 ? padWindow.slice(0, liveKeep) : [];
  if (!liveHead.length && !simTail.length) return null;

  const stitched = stitchMonotonic(liveHead, simTail);
  if (stitched.length < 1) return null;
  return pinLastClose(stitched, endPrice);
}

export function serializeSimCandleLedger() {
  /** @type {Record<string, object>} */
  const out = {};
  for (const [sym, L] of ledgers.entries()) {
    out[sym] = {
      launchpadDaily: (L.launchpadDaily || []).map((b) => ({ ...b })),
      daily: (L.daily || []).map((b) => ({ ...b })),
      intraday: (L.intraday || []).map((b) => ({ ...b })),
      seeded: !!L.seeded,
      launchpadReady: !!L.launchpadReady,
      launchpadForRange: L.launchpadForRange || '',
    };
  }
  return out;
}

export function loadSimCandleLedger(data) {
  ledgers.clear();
  if (!data || typeof data !== 'object') return;
  for (const [sym, raw] of Object.entries(data)) {
    const key = normSym(sym);
    if (!key || !raw || typeof raw !== 'object') continue;
    const launchpadDaily = Array.isArray(raw.launchpadDaily)
      ? raw.launchpadDaily.map((b) => sanitizeBar(b, b?.day)).filter(Boolean).slice(-MAX_DAILY_BARS)
      : [];
    const daily = Array.isArray(raw.daily)
      ? raw.daily.map((b) => sanitizeBar(b, b?.day)).filter(Boolean).slice(-MAX_DAILY_BARS)
      : [];
    const intraday = Array.isArray(raw.intraday)
      ? raw.intraday.map((b) => sanitizeBar(b, b?.day)).filter(Boolean).slice(-MAX_INTRADAY_BARS)
      : [];
    // Migration: old saves put Yahoo into `daily` only — treat as launchpad if no launchpad field
    let pad = launchpadDaily;
    let career = daily;
    if (!pad.length && daily.length && raw.launchpadReady == null && raw.launchpadDaily == null) {
      pad = daily.slice();
      career = [];
    }
    if (!pad.length && !career.length && !intraday.length) continue;
    ledgers.set(key, {
      launchpadDaily: pad,
      daily: career,
      intraday,
      seeded: raw.seeded !== false,
      launchpadReady: raw.launchpadReady === true || pad.length > 0,
      launchpadForRange: String(
        raw.launchpadForRange === '5D'
          ? '1W'
          : (raw.launchpadForRange || (pad.length >= 200 ? '1Y' : pad.length >= 20 ? '1M' : '1W'))
      ).toUpperCase(),
    });
  }
}

/** Test helper */
export function _simLedgerSizeForTests(sym) {
  const L = ledgers.get(normSym(sym));
  if (!L) return { daily: 0, intraday: 0, launchpad: 0 };
  return {
    daily: L.daily.length,
    intraday: L.intraday.length,
    launchpad: L.launchpadDaily?.length || 0,
  };
}
