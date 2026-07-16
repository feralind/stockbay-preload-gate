// @ts-check
/**
 * Trade chart â€” clean broker-style Apache ECharts candlesticks.
 * Public API kept stable for app.js / chart-panel / quality tests.
 */
import {
  syncQuoteToPrice, shouldRejectLiveCandleTick, LIVE_CANDLE_MAX_JUMP_PCT,
  candleBarVolFraction, isSimulationMode, getCachedQuote, synthTickVolume,
} from './api.js';
import { getMarketTime } from './market.js';

/** @type {any} */
let chart = null;
/** @type {HTMLElement | null} */
let chartHost = null;
let currentSym = null;
let themeColors = null;
let resizeObserver = null;
let lastBarCount = 0;
let lastRange = '1D';
/** @type {Array<{time:number,open:number,high:number,low:number,close:number,volume?:number}>} */
let lastBars = [];
let lastCandle = null;
let lastLiveUpdateAt = 0;
let userZoomed = false;
let lastUserZoom = { start: 0, end: 100 };
/** @type {'candle' | 'wave'} */
let chartStyle = 'candle';
let showMa = true;
let showSr = false;
let fitRetryTimer = null;
let fitRaf = 0;
let pendingPaint = false;
let pendingPaintResetZoom = true;

const LIVE_UPDATE_MS = 100;
const LIVE_MAX_JUMP_PCT = LIVE_CANDLE_MAX_JUMP_PCT;
const MIN_VISIBLE_BARS = 40;
const MAX_VISIBLE_BARS = 120;
/** Single-session clock ranges â€” time-only axis labels + tight spear defense. */
const SESSION_RANGES = new Set(['1D', '1', '5', '15', '60']);
/** Multi-bar ranges that still use intraday Yahoo intervals (need date+time labels). */
const INTRADAY_RANGES = new Set(['1D', '1M', '1', '5', '15', '60']);
const LONG_RANGES = new Set(['1W', '5D', '6M', 'YTD', '1Y', '5Y', 'MAX', 'D']);
const CHART_STYLE_KEY = 'stockway_chart_style_v1';

/** Locked Y window — live ticks must not re-center the pane every quote. */
let cachedAxisMin = NaN;
let cachedAxisMax = NaN;
/** @type {string | null} */
let lastCalculatedSymbol = null;
/** @type {string | null} */
let lastCalculatedRange = null;

function clearPriceAxisCache() {
  cachedAxisMin = NaN;
  cachedAxisMax = NaN;
  lastCalculatedSymbol = null;
  lastCalculatedRange = null;
}

function hasPriceAxisCache() {
  return Number.isFinite(cachedAxisMin) && Number.isFinite(cachedAxisMax) && cachedAxisMax > cachedAxisMin;
}

function storePriceAxisCache(min, max, symbol, range) {
  cachedAxisMin = min;
  cachedAxisMax = max;
  lastCalculatedSymbol = symbol != null ? String(symbol).toUpperCase() : null;
  lastCalculatedRange = range != null ? String(range).toUpperCase() : null;
}

function rangeBarMinutes(range) {
  const key = String(range || '1D').toUpperCase();
  if (key === '1D' || key === '5') return 5;
  if (key === '15') return 15;
  if (key === '1M' || key === '60') return 60;
  if (key === '1W' || key === '5D') return 1440;
  if (key === 'MAX') return 1440 * 21;
  if (key === '5Y' || key === '1Y' || key === '6M' || key === 'YTD' || key === 'D') return 1440;
  return 1440;
}

export function maxLiveBarRangePct(range) {
  return candleBarVolFraction(rangeBarMinutes(range), 1) * 2.6;
}

function maxHistoricalBarRangePct(range) {
  const key = String(range || '1D').toUpperCase();
  if (key === 'MAX') return 0.45;
  if (LONG_RANGES.has(key)) return 0.28;
  return candleBarVolFraction(rangeBarMinutes(range), 1) * 5.5;
}

export function peerMedianRange(bars) {
  if (!Array.isArray(bars) || bars.length < 3) return 0;
  const ranges = bars
    .slice(0, -1)
    .map((b) => Math.max(0, Number(b.high) - Number(b.low)))
    .filter((r) => r > 0)
    .sort((a, b) => a - b);
  if (!ranges.length) return 0;
  return ranges[Math.floor(ranges.length / 2)] || 0;
}

/** Cap a forming bar so Yahoo spears can't dominate peers. */
export function clampBarToPeers(bar, peerRange, mid) {
  if (!bar || !(peerRange > 0) || !(mid > 0)) return bar;
  const maxR = Math.max(peerRange * 2.2, mid * 0.0025);
  let open = Number(bar.open);
  let close = Number(bar.close);
  let high = Number(bar.high);
  let low = Number(bar.low);
  if (![open, close, high, low].every((v) => Number.isFinite(v) && v > 0)) return bar;

  const maxCloseDev = maxR * 2;
  if (Math.abs(close - mid) > maxCloseDev) {
    close = mid + Math.sign(close - mid || 1) * maxCloseDev;
  }
  if (Math.abs(close - open) > maxR) {
    open = close > open ? close - maxR * 0.85 : close + maxR * 0.85;
  }
  const bodyHi = Math.max(open, close);
  const bodyLo = Math.min(open, close);
  const half = maxR / 2;
  const center = (bodyHi + bodyLo) / 2;
  high = Math.max(bodyHi, Math.min(high, center + half));
  low = Math.min(bodyLo, Math.max(low, center - half));
  if (high - low > maxR) {
    high = Math.max(bodyHi, center + half);
    low = Math.min(bodyLo, center - half);
    if (high - low > maxR) {
      high = center + half;
      low = center - half;
    }
  }
  return { ...bar, open, high, low, close };
}

/**
 * Broker-style Y window for the bars in view.
 * - Always keep the last close on-screen (live HUD tape).
 * - 1D: ignore forming-bar spear high/low so one bad wick doesn't own the pane.
 * - Multi-day / long: fit real H/L — never re-center with a hard maxSpan that clips ATH.
 * - 1D: fit true completed-bar extent (spikes stay visible); ignore forming-bar spear only.
 * - Live ticks: return a locked cache when price is inside the window (axis hysteresis).
 * - Mouse-wheel / slider zoom refits Y to whatever bars are in the visible time window.
 *
 * @param {Array<{high?:number,low?:number,close?:number}>} bars
 * @param {string} [range]
 * @param {string | null} [symbol]
 * @param {boolean} [isLiveTick] when true, reuse locked bounds unless price breaks out
 */
export function computePriceAxisRange(bars, range = '1D', symbol = null, isLiveTick = false) {
  if (!Array.isArray(bars) || !bars.length) return null;
  const key = String(range || '1D').toUpperCase();
  const symKey = symbol != null && String(symbol) ? String(symbol).toUpperCase() : null;
  const last = bars[bars.length - 1];
  const lastClose = Number(last?.close) || 0;

  const cacheHit = hasPriceAxisCache()
    && lastCalculatedRange === key
    && lastCalculatedSymbol === symKey;
  const session = isSessionRange(key);

  // Live hysteresis: freeze the pane while price stays inside the locked window.
  // Expand-only on breakout (never re-center). Session ignores forming spear H/L.
  if (isLiveTick && cacheHit) {
    let min = cachedAxisMin;
    let max = cachedAxisMax;
    const span = Math.max(0.01, max - min);
    const pad = span * 0.02;
    const lastHigh = Number(last?.high);
    const lastLow = Number(last?.low);
    let grew = false;
    if (lastClose > max) {
      max = lastClose + pad;
      grew = true;
    }
    if (lastClose > 0 && lastClose < min) {
      min = Math.max(0.01, lastClose - pad);
      grew = true;
    }
    if (!session) {
      if (Number.isFinite(lastHigh) && lastHigh > max) {
        max = lastHigh + pad;
        grew = true;
      }
      if (Number.isFinite(lastLow) && lastLow > 0 && lastLow < min) {
        min = Math.max(0.01, lastLow - pad);
        grew = true;
      }
    }
    if (!grew && lastClose > 0 && lastClose >= cachedAxisMin && lastClose <= cachedAxisMax) {
      return { min: cachedAxisMin, max: cachedAxisMax };
    }
    storePriceAxisCache(min, max, symKey, key);
    return { min, max };
  }

  // Symbol / TF change, refresh, zoom, or first paint — recompute from bars in view.
  const longRange = LONG_RANGES.has(key);

  const completed = bars.length > 1 ? bars.slice(0, -1) : bars;
  const highs = completed.map((b) => Number(b.high)).filter((v) => Number.isFinite(v) && v > 0);
  const lows = completed.map((b) => Number(b.low)).filter((v) => Number.isFinite(v) && v > 0);
  if (!highs.length || !lows.length) return null;

  // True extent of completed bars — never percentile-trim or maxSpan-recenter.
  // That was clipping real intraday spikes (line flat against the ceiling).
  let minV = Math.min(...lows);
  let maxV = Math.max(...highs);
  for (const b of completed) {
    const o = Number(b.open);
    const c = Number(b.close);
    if (Number.isFinite(o) && o > 0) {
      minV = Math.min(minV, o);
      maxV = Math.max(maxV, o);
    }
    if (Number.isFinite(c) && c > 0) {
      minV = Math.min(minV, c);
      maxV = Math.max(maxV, c);
    }
  }

  const sessionMid = (minV + maxV) / 2 || 1;

  // Live close is the HUD quote — must stay visible or the chart looks "displaced" over time.
  if (lastClose > 0) {
    minV = Math.min(minV, lastClose);
    maxV = Math.max(maxV, lastClose);
  }

  // Non-session: also include last bar H/L. Session: ignore spear wicks on the forming bar.
  if (!session && last) {
    const lastHigh = Number(last.high);
    const lastLow = Number(last.low);
    if (Number.isFinite(lastHigh) && lastHigh > 0) maxV = Math.max(maxV, lastHigh);
    if (Number.isFinite(lastLow) && lastLow > 0) minV = Math.min(minV, lastLow);
  }

  const mid = (minV + maxV) / 2 || sessionMid;
  let span = Math.max(maxV - minV, mid * 0.001);

  // Floor the Y window so flat / cents-level days don't over-zoom into cliffs.
  const baseline = (lastClose > 0 ? lastClose : mid) || 1;
  const minSpan = Math.max(
    baseline * 0.025,
    5.0,
    mid * (session ? 0.018 : longRange ? 0.06 : 0.028),
  );
  if (span < minSpan) {
    const extra = (minSpan - span) / 2;
    minV -= extra;
    maxV += extra;
    span = maxV - minV;
  }

  const padRatio = session ? 0.1 : longRange ? 0.1 : 0.12;
  const pad = Math.max((maxV - minV) * padRatio, mid * 0.003);
  const result = {
    min: Math.max(0.01, minV - pad),
    max: maxV + pad,
  };
  storePriceAxisCache(result.min, result.max, symKey, key);
  return result;
}

function sanitizeLastBarInPlace() {
  if (!lastBars.length) return;
  const i = lastBars.length - 1;
  const mid = Number(lastBars[Math.max(0, i - 1)]?.close) || Number(lastBars[i]?.close) || 0;
  const peer = peerMedianRange(lastBars);
  const clamped = clampBarToPeers(lastBars[i], peer, mid);
  lastBars[i] = clamped;
  if (lastCandle) {
    lastCandle.open = clamped.open;
    lastCandle.high = clamped.high;
    lastCandle.low = clamped.low;
    lastCandle.close = clamped.close;
  }
}

/**
 * Live forming bar must track the HUD quote.
 * Keep display wicks glued to the open/close body so micro ticks don't thrash the last candle.
 */
export function applyLiveCandleTick(bar, price, maxRangePct) {
  if (!bar) return null;
  const px = Number(price);
  if (!(px > 0)) return null;
  let open = Number(bar.open);
  if (!(open > 0)) open = px;
  // Keep the bar's session open — rewriting open made candles fight the tape.
  const bodyHi = Math.max(open, px);
  const bodyLo = Math.min(open, px);
  const mid = (open + px) / 2 || px;
  // Tiny wick only — ignore historical ratcheted high/low on the forming bar.
  const bodySpan = bodyHi - bodyLo;
  const wickPad = Math.min(
    mid * Math.max(0.00035, Number(maxRangePct) > 0 ? Number(maxRangePct) * 0.08 : 0.0008),
    Math.max(mid * 0.00035, bodySpan * 0.12, 0.01),
  );
  return {
    time: bar.time,
    open,
    close: px,
    high: bodyHi + wickPad,
    low: Math.max(0.01, bodyLo - wickPad),
  };
}

/** Display OHLC — forming bar wicks stay near the body so live ticks don't flicker. */
function clampFormingBarForDisplay(bar) {
  if (!bar) return bar;
  const open = Number(bar.open);
  const close = Number(bar.close);
  if (!(open > 0) || !(close > 0)) return bar;
  const bodyHi = Math.max(open, close);
  const bodyLo = Math.min(open, close);
  const mid = (open + close) / 2 || close;
  const wickPad = Math.max(mid * 0.00035, (bodyHi - bodyLo) * 0.12, 0.01);
  return {
    ...bar,
    high: bodyHi + wickPad,
    low: Math.max(0.01, bodyLo - wickPad),
  };
}

/** After wick hygiene, force last close back to the live quote (HUD â†” candle lock). */
function pinLastBarClose(price) {
  const px = Number(price);
  if (!(px > 0) || !lastBars.length) return;
  const i = lastBars.length - 1;
  const bar = lastBars[i];
  const open = Number(bar.open) > 0 ? Number(bar.open) : px;
  const clamped = clampFormingBarForDisplay({ ...bar, open, close: px });
  lastBars[i] = { ...bar, open, high: clamped.high, low: clamped.low, close: px };
  if (lastCandle) {
    lastCandle.open = open;
    lastCandle.high = clamped.high;
    lastCandle.low = clamped.low;
    lastCandle.close = px;
  }
}

/**
 * Advance the forming bar when game-clock crosses the next 5m/15m/60m bucket.
 * Without this, hours of sim drift get smashed into one candle and the pane looks wrecked.
 * @returns {boolean} true when a new bar was appended
 */
export function maybeRollFormingBar(price) {
  const px = Number(price);
  if (!(px > 0)) return false;
  const key = String(lastRange || '1D').toUpperCase();
  // Only roll intraday buckets â€” daily+ history is refreshed via loadChart / TF change.
  if (!INTRADAY_RANGES.has(key)) return false;

  const bucketSec = Math.max(60, rangeBarMinutes(key) * 60);
  let ts;
  try {
    ts = Math.floor(getMarketTime().getTime() / 1000);
  } catch {
    ts = Math.floor(Date.now() / 1000);
  }
  if (!Number.isFinite(ts) || ts <= 0) return false;
  const bucketStart = Math.floor(ts / bucketSec) * bucketSec;

  if (!lastBars.length) {
    const v0 = synthTickVolume(currentSym || 'X', px, bucketStart);
    lastBars = [{ time: bucketStart, open: px, high: px, low: px, close: px, volume: v0 }];
    lastBarCount = 1;
    lastCandle = { ...lastBars[0] };
    return true;
  }

  const last = lastBars[lastBars.length - 1];
  const lastT = Number(last.time) || 0;
  // Never append a bar that would walk the clock backward (timeline crush / overlapping labels).
  if (bucketStart <= lastT) return false;

  lastBars.push({
    time: bucketStart,
    open: px,
    high: px,
    low: px,
    close: px,
    volume: synthTickVolume(currentSym || 'X', px, bucketStart),
  });
  const maxKeep = key === '1D' ? 130 : key === '1W' || key === '5D' ? 14 : 200;
  if (lastBars.length > maxKeep) lastBars = lastBars.slice(-maxKeep);
  lastBarCount = lastBars.length;
  lastCandle = { ...lastBars[lastBarCount - 1] };
  return true;
}

export function sanitizeOhlcBar(open, high, low, close, maxRangePct = 0.08) {
  let o = Number(open);
  let h = Number(high);
  let l = Number(low);
  let c = Number(close);
  if (![o, h, l, c].every((v) => Number.isFinite(v) && v > 0)) return null;

  const bodyCap = Math.max(0.0001, Number(maxRangePct) || 0.08);
  if (Math.abs(o - c) / c > bodyCap) {
    o = c + Math.sign(o - c) * c * bodyCap * 0.9;
  }

  h = Math.max(o, c, h);
  l = Math.min(o, c, l);
  if (!(l > 0)) l = Math.min(o, c);

  const mid = (o + c) / 2 || c;
  const maxSpan = mid * bodyCap;
  if (h - l > maxSpan) {
    const bodyHigh = Math.max(o, c);
    const bodyLow = Math.min(o, c);
    const bodySpan = bodyHigh - bodyLow;
    const room = Math.max(0, maxSpan - bodySpan);
    h = bodyHigh + room * 0.55;
    l = Math.max(0.01, bodyLow - room * 0.45);
  }
  return { open: o, high: h, low: l, close: c };
}

export function normalizeChartCandles(candles, range = '1D') {
  if (!Array.isArray(candles) || !candles.length) return [];
  const rangeKey = String(range || '1D').toUpperCase();
  const maxRangePct = maxHistoricalBarRangePct(rangeKey);
  const byTime = new Map();
  for (const c of candles) {
    let t = Number(c?.time);
    if (!Number.isFinite(t) || t <= 0) continue;
    if (t > 1e12) t = Math.floor(t / 1000);
    const fixed = sanitizeOhlcBar(c.open, c.high, c.low, c.close, maxRangePct);
    if (!fixed) continue;
    byTime.set(t, {
      time: t,
      open: fixed.open,
      high: fixed.high,
      low: fixed.low,
      close: fixed.close,
      volume: Number(c.volume) || 0,
    });
  }
  const sorted = [...byTime.values()].sort((a, b) => a.time - b.time);
  if (LONG_RANGES.has(rangeKey) || sorted.length < 3) return sorted;
  const maxDev = Math.max(0.06, maxRangePct * 1.35);
  return sorted.map((b, i) => {
    const from = Math.max(0, i - 4);
    const to = Math.min(sorted.length, i + 5);
    const sample = sorted.slice(from, to).map((x) => x.close).sort((a, c) => a - c);
    const mid = sample[Math.floor(sample.length / 2)] || b.close;
    if (!(mid > 0)) return b;
    if (Math.abs(b.close - mid) / mid <= maxDev
      && (b.high - b.low) / mid <= maxRangePct * 1.15) {
      return b;
    }
    const fixed = sanitizeOhlcBar(
      Math.max(mid * (1 - maxDev), Math.min(mid * (1 + maxDev), b.open)),
      b.high,
      b.low,
      Math.max(mid * (1 - maxDev), Math.min(mid * (1 + maxDev), b.close)),
      maxRangePct,
    );
    return fixed ? { ...b, ...fixed } : b;
  });
}

export function findSupportResistance(bars = []) {
  if (!Array.isArray(bars) || bars.length < 20) {
    return { support: null, resistance: null };
  }
  const window = bars.slice(-Math.min(80, bars.length));
  const lastClose = Number(window[window.length - 1]?.close);
  if (!(lastClose > 0)) return { support: null, resistance: null };

  const localLows = [];
  const localHighs = [];
  for (let i = 2; i < window.length - 2; i++) {
    const l = Number(window[i].low);
    const h = Number(window[i].high);
    if (!(l > 0) || !(h > 0)) continue;
    if (
      l <= Number(window[i - 1].low) && l <= Number(window[i - 2].low)
      && l <= Number(window[i + 1].low) && l <= Number(window[i + 2].low)
    ) {
      localLows.push(l);
    }
    if (
      h >= Number(window[i - 1].high) && h >= Number(window[i - 2].high)
      && h >= Number(window[i + 1].high) && h >= Number(window[i + 2].high)
    ) {
      localHighs.push(h);
    }
  }

  const supportCands = localLows.filter((v) => v < lastClose).sort((a, b) => b - a);
  const resistCands = localHighs.filter((v) => v > lastClose).sort((a, b) => a - b);
  const lows = window.map((b) => Number(b.low)).filter((v) => v > 0);
  const highs = window.map((b) => Number(b.high)).filter((v) => v > 0);
  return {
    support: supportCands[0] ?? (lows.length ? Math.min(...lows) : null),
    resistance: resistCands[0] ?? (highs.length ? Math.max(...highs) : null),
  };
}

function getCss(name) {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  } catch {
    return '';
  }
}

function isSessionRange(range) {
  return SESSION_RANGES.has(String(range || '1D').toUpperCase());
}

function isIntradayRange(range) {
  return INTRADAY_RANGES.has(String(range || '1D').toUpperCase());
}

function theme() {
  return {
    up: themeColors?.green || getCss('--accent-trade') || getCss('--green') || '#22c55e',
    down: themeColors?.red || getCss('--rose') || getCss('--red') || '#ef4444',
    muted: themeColors?.muted || getCss('--muted') || '#94a3b8',
    border: themeColors?.border || getCss('--glass-stroke') || 'rgba(255,255,255,0.12)',
    blue: themeColors?.blue || getCss('--blue') || '#60a5fa',
    orange: '#f59e0b',
    // Thin glass split lines (not theme.chartGrid — that token is a solid panel bg).
    grid: 'rgba(255,255,255,0.05)',
    cross: 'rgba(148,163,184,0.35)',
  };
}

/** Window polarity for Wave underfill — last close vs first close in view. */
function waveWindowUp(bars) {
  if (!Array.isArray(bars) || bars.length < 2) return true;
  const first = Number(bars[0]?.close);
  const last = Number(bars[bars.length - 1]?.close);
  if (!Number.isFinite(first) || !Number.isFinite(last)) return true;
  return last >= first;
}

/** Glass area fill under Wave stroke (ECharts linear gradient). */
function waveAreaStyle(up) {
  return {
    color: {
      type: 'linear',
      x: 0,
      y: 0,
      x2: 0,
      y2: 1,
      colorStops: up
        ? [
          { offset: 0, color: 'rgba(16, 185, 129, 0.15)' },
          { offset: 1, color: 'rgba(16, 185, 129, 0.0)' },
        ]
        : [
          { offset: 0, color: 'rgba(239, 104, 104, 0.15)' },
          { offset: 1, color: 'rgba(239, 104, 104, 0.0)' },
        ],
    },
  };
}

/** Stroke + underfill for the visible Wave window. */
function wavePaintStyle(bars, startPct = 0, endPct = 100) {
  const t = theme();
  const slice = sliceBarsForAxis(bars, startPct, endPct);
  const up = waveWindowUp(slice.length ? slice : bars);
  return {
    lineStyle: { width: 2, color: up ? (t.up || '#10b981') : (t.down || '#ef6868') },
    areaStyle: waveAreaStyle(up),
  };
}

function formatAxisLabel(ts, range = lastRange) {
  const d = new Date(Number(ts) * 1000);
  if (!Number.isFinite(d.getTime())) return '';
  const key = String(range || '1D').toUpperCase();
  if (isSessionRange(key)) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  // 1M: date + time so day boundaries don't look like the clock jumped backward
  if (key === '1M') {
    return d.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  if (key === 'MAX' || key === '5Y') {
    return d.toLocaleDateString([], { month: 'short', year: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * Static category-label stride so live bar appends don't crush right-edge timestamps
 * (Before: 12:35 PM then overlapping 10:55 / 11:25). Targets ~12–15 labels.
 */
export function xLabelInterval(barCount) {
  const n = Math.max(0, Math.floor(Number(barCount) || 0));
  const want = 14;
  if (n <= want) return 0;
  return Math.max(1, Math.floor((n - 1) / (want - 1)));
}

function formatPrice(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 'â€”';
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (Math.abs(n) >= 100) return n.toFixed(2);
  if (Math.abs(n) >= 1) return n.toFixed(3);
  return n.toFixed(4);
}

function formatVolume(v) {
  const n = Number(v) || 0;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

function formatTooltipTime(ts, intraday) {
  const d = new Date(Number(ts) * 1000);
  if (!Number.isFinite(d.getTime())) return '';
  if (intraday) {
    return d.toLocaleString([], {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  }
  return d.toLocaleDateString([], {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function calcMA(data, period) {
  const out = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      out.push('-');
      continue;
    }
    let sum = 0;
    for (let j = 0; j < period; j++) sum += data[i - j].close;
    out.push(+(sum / period).toFixed(4));
  }
  return out;
}

function targetVisibleBars() {
  const width = chartHost?.clientWidth || 400;
  const byWidth = Math.floor(width / 7);
  const base = Math.min(MAX_VISIBLE_BARS, Math.max(MIN_VISIBLE_BARS, byWidth || MIN_VISIBLE_BARS));
  // Long history: show more of the recent window so candles aren't a single-pixel scribble
  if (lastRange === 'MAX') return Math.min(96, Math.max(48, Math.floor(base * 0.85)));
  if (lastRange === '5Y') return Math.min(110, Math.max(56, base));
  if (lastRange === '1Y' || lastRange === '6M' || lastRange === 'YTD') {
    return Math.min(MAX_VISIBLE_BARS, Math.max(64, base));
  }
  return base;
}

function defaultDataZoom() {
  const n = lastBarCount;
  const shared = {
    xAxisIndex: [0, 1],
    filterMode: 'none',
    zoomLock: false,
    preventDefaultMouseMove: false,
  };
  if (n <= 0) {
    return [
      {
        type: 'inside',
        ...shared,
        start: 0,
        end: 100,
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        moveOnMouseWheel: false,
      },
      { type: 'slider', ...shared, show: true, height: 18, bottom: 4, start: 0, end: 100 },
    ];
  }
  const want = targetVisibleBars();
  const start = n <= want ? 0 : Math.max(0, ((n - want) / n) * 100);
  return [
    {
      type: 'inside',
      ...shared,
      start,
      end: 100,
      zoomOnMouseWheel: true,
      moveOnMouseMove: true,
      moveOnMouseWheel: false,
    },
    {
      type: 'slider',
      ...shared,
      show: true,
      height: 18,
      bottom: 4,
      start,
      end: 100,
      brushSelect: false,
    },
  ];
}

/** Bars in the current (or default) zoom window — Y-axis must fit these, not all history. */
export function sliceBarsForAxis(bars, startPct = 0, endPct = 100) {
  if (!Array.isArray(bars) || !bars.length) return [];
  const n = bars.length;
  const lo = Math.min(100, Math.max(0, Number(startPct) || 0));
  const hi = Math.min(100, Math.max(lo, Number(endPct) || 100));
  const i0 = Math.max(0, Math.floor((lo / 100) * n));
  const i1 = Math.min(n, Math.max(i0 + 1, Math.ceil((hi / 100) * n)));
  return bars.slice(i0, i1);
}

function zoomNum(v, fallback = 0) {
  if (Array.isArray(v)) v = v[0];
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function readZoomPercents() {
  if (!userZoomed) {
    const dz = defaultDataZoom()[0];
    return { start: zoomNum(dz.start, 0), end: zoomNum(dz.end, 100) };
  }
  try {
    const opt = chart?.getOption?.();
    const dz = opt?.dataZoom?.[0];
    const start = zoomNum(dz?.start, NaN);
    const end = zoomNum(dz?.end, NaN);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      lastUserZoom = { start, end };
      return { start, end };
    }
  } catch { /* ignore */ }
  return { start: lastUserZoom.start, end: lastUserZoom.end };
}

function axisRangeForPercents(startPct, endPct, { isLiveTick = false } = {}) {
  const slice = sliceBarsForAxis(lastBars, startPct, endPct);
  return computePriceAxisRange(
    slice.length ? slice : lastBars,
    lastRange,
    currentSym,
    isLiveTick,
  );
}

function axisRangeForView({ isLiveTick = false } = {}) {
  const { start, end } = readZoomPercents();
  return axisRangeForPercents(start, end, { isLiveTick });
}

/** Apply a zoom window and re-fit price (+ volume) to the visible bars in one paint. */
function applyViewWindow(startPct, endPct, { markUserZoom = true, updateDataZoom = true } = {}) {
  if (!chart || !lastBars.length) return;
  let nextStart = Math.max(0, Math.min(100, Number(startPct) || 0));
  let nextEnd = Math.max(0, Math.min(100, Number(endPct) || 100));
  if (nextEnd - nextStart < 2) {
    const mid = (nextStart + nextEnd) / 2;
    nextStart = Math.max(0, mid - 1);
    nextEnd = Math.min(100, mid + 1);
  }
  if (markUserZoom) userZoomed = true;

  // Wheel / slider zoom must unlock any live hysteresis lock so Y can grow to show spikes.
  clearPriceAxisCache();
  const axis = axisRangeForPercents(nextStart, nextEnd);
  const slice = sliceBarsForAxis(lastBars, nextStart, nextEnd);
  let volMax = 0;
  for (const b of slice) volMax = Math.max(volMax, Number(b.volume) || 0);

  if (markUserZoom || updateDataZoom) {
    lastUserZoom = { start: nextStart, end: nextEnd };
  }

  const opt = {
    yAxis: [
      {
        min: axis?.min,
        max: axis?.max,
        scale: true,
      },
      {
        min: 0,
        max: volMax > 0 ? volMax * 1.2 : undefined,
        scale: false,
      },
    ],
  };
  if (updateDataZoom) {
    opt.dataZoom = [
      { start: nextStart, end: nextEnd },
      { start: nextStart, end: nextEnd },
    ];
  }
  if (chartStyle === 'wave') {
    const ws = wavePaintStyle(lastBars, nextStart, nextEnd);
    opt.series = [{ id: 'wave', lineStyle: ws.lineStyle, areaStyle: ws.areaStyle }];
  }

  try {
    chart.setOption(opt);
  } catch { /* ignore */ }
}

function syncPriceAxisFromView() {
  if (!chart || !lastBars.length) return;
  const { start, end } = readZoomPercents();
  applyViewWindow(start, end, { markUserZoom: userZoomed });
}

function buildTooltipHtml(barIndex) {
  const bar = lastBars[barIndex];
  if (!bar) return '';
  const t = theme();
  const up = bar.close >= bar.open;
  const tone = up ? t.up : t.down;
  const chg = bar.open > 0 ? ((bar.close - bar.open) / bar.open) * 100 : 0;
  const chgStr = `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`;
  const when = formatTooltipTime(bar.time, isIntradayRange(lastRange));
  const sym = String(currentSym || '').toUpperCase() || 'â€”';
  return `
    <div style="min-width:128px;max-width:160px;line-height:1.35">
      <div style="font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${t.muted};margin-bottom:3px">${sym}</div>
      <div style="font-size:11px;color:#e8eaed;margin-bottom:6px">${when}</div>
      <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:11px;font-variant-numeric:tabular-nums">
        <span style="color:${t.muted}">O</span><span style="text-align:right">${formatPrice(bar.open)}</span>
        <span style="color:${t.muted}">H</span><span style="text-align:right">${formatPrice(bar.high)}</span>
        <span style="color:${t.muted}">L</span><span style="text-align:right">${formatPrice(bar.low)}</span>
        <span style="color:${t.muted}">C</span><span style="text-align:right;color:${tone};font-weight:700">${formatPrice(bar.close)}</span>
        <span style="color:${t.muted}">Chg</span><span style="text-align:right;color:${tone}">${chgStr}</span>
        <span style="color:${t.muted}">Vol</span><span style="text-align:right">${formatVolume(bar.volume)}</span>
      </div>
    </div>`;
}

/** ECharts candle datum: [open, close, low, high] — forming bar wicks clamped to body. */
function toOhlc(bars) {
  if (!Array.isArray(bars) || !bars.length) return [];
  const last = bars.length - 1;
  return bars.map((b, i) => {
    const bar = i === last ? clampFormingBarForDisplay(b) : b;
    return [bar.open, bar.close, bar.low, bar.high];
  });
}

function buildOption() {
  const t = theme();
  const isWave = chartStyle === 'wave';
  // Index categories stay unique; clock labels are formatting only.
  const cats = lastBars.map((_, i) => String(i));
  const axis = axisRangeForView();
  const ohlc = toOhlc(lastBars);
  const closes = lastBars.map((b) => b.close);
  const vols = lastBars.map((b) => ({
    value: b.volume || 0,
    itemStyle: {
      color: b.close >= b.open ? `${t.up}55` : `${t.down}55`,
    },
  }));
  const ma20 = showMa && !isWave && lastBars.length >= 20 ? calcMA(lastBars, 20) : [];
  const ma50 = showMa && !isWave && lastBars.length >= 50 ? calcMA(lastBars, 50) : [];
  const zoomPct = readZoomPercents();
  const waveStyle = isWave ? wavePaintStyle(lastBars, zoomPct.start, zoomPct.end) : null;

  /** @type {any[]} */
  const markLineData = [];
  if (showSr && !isWave && lastBars.length >= 20) {
    const { support, resistance } = findSupportResistance(lastBars);
    if (support > 0) {
      markLineData.push({
        yAxis: support,
        name: 'S',
        lineStyle: { color: t.up, type: 'dashed', width: 1, opacity: 0.7 },
        label: { formatter: 'S', color: t.up, fontSize: 10 },
      });
    }
    if (resistance > 0) {
      markLineData.push({
        yAxis: resistance,
        name: 'R',
        lineStyle: { color: t.down, type: 'dashed', width: 1, opacity: 0.7 },
        label: { formatter: 'R', color: t.down, fontSize: 10 },
      });
    }
  }

  // Preserve the user's slider/window on repaints; only reset when paint(true).
  let zoomOpt;
  if (userZoomed) {
    const { start, end } = readZoomPercents();
    zoomOpt = [
      {
        type: 'inside',
        xAxisIndex: [0, 1],
        filterMode: 'none',
        start,
        end,
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        moveOnMouseWheel: false,
      },
      {
        type: 'slider',
        xAxisIndex: [0, 1],
        filterMode: 'none',
        show: true,
        height: 18,
        bottom: 4,
        start,
        end,
        brushSelect: false,
      },
    ];
  } else {
    zoomOpt = defaultDataZoom();
  }
  const labelFmt = (value) => {
    const bar = lastBars[Number(value)];
    return bar ? formatAxisLabel(bar.time, lastRange) : '';
  };

  return {
    animation: true,
    animationDuration: 650,
    animationEasing: 'cubicOut',
    animationDurationUpdate: 0,
    backgroundColor: 'transparent',
    textStyle: { color: t.muted, fontFamily: 'Inter, system-ui, sans-serif' },
    legend: { show: false },
    tooltip: {
      trigger: 'axis',
      triggerOn: 'mousemove',
      confine: true,
      enterable: false,
      appendToBody: true,
      renderMode: 'html',
      className: 'sw-chart-tooltip',
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: 'rgba(10,12,16,0.96)',
      padding: [7, 9],
      extraCssText: [
        'width:auto!important',
        'height:auto!important',
        'max-width:160px!important',
        'border-radius:8px',
        'box-shadow:0 8px 24px rgba(0,0,0,0.45)',
        'pointer-events:none',
        'z-index:40',
      ].join(';'),
      textStyle: { color: '#e8eaed', fontSize: 11 },
      axisPointer: {
        type: 'cross',
        snap: true,
        label: { show: false },
        lineStyle: { color: t.cross, width: 1, type: 'dashed' },
        crossStyle: { color: t.cross, width: 1, type: 'dashed' },
      },
      formatter: (params) => {
        const list = Array.isArray(params) ? params : [params];
        const idx = list.find((p) => Number.isFinite(p?.dataIndex))?.dataIndex;
        if (!Number.isFinite(idx)) return '';
        return buildTooltipHtml(idx);
      },
    },
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    grid: [
      { left: 8, right: 58, top: 12, bottom: '28%', containLabel: false },
      { left: 8, right: 58, top: '80%', bottom: 36, containLabel: false },
    ],
    xAxis: [
      {
        type: 'category',
        data: cats,
        boundaryGap: true,
        axisLine: { lineStyle: { color: t.border } },
        axisTick: { show: false },
        axisLabel: {
          color: t.muted,
          // Fixed stride — hideOverlap alone crushed live right-edge labels into cliffs.
          interval: xLabelInterval(cats.length),
          hideOverlap: true,
          showMinLabel: true,
          showMaxLabel: true,
          fontSize: 10,
          margin: 8,
          formatter: labelFmt,
        },
        splitLine: { show: false },
      },
      {
        type: 'category',
        gridIndex: 1,
        data: cats,
        boundaryGap: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        splitLine: { show: false },
      },
    ],
    yAxis: [
      {
        scale: true,
        position: 'right',
        min: axis?.min,
        max: axis?.max,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: t.muted,
          fontSize: 10,
          margin: 6,
          formatter: (v) => formatPrice(v),
        },
        splitLine: {
          show: true,
          lineStyle: { color: t.grid, width: 1 },
        },
        splitNumber: 5,
      },
      {
        scale: true,
        gridIndex: 1,
        splitNumber: 2,
        axisLabel: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
      },
    ],
    dataZoom: zoomOpt,
    series: [
      {
        id: 'candles',
        name: 'Price',
        type: 'candlestick',
        data: isWave ? [] : ohlc,
        barMaxWidth: 10,
        itemStyle: {
          color: t.up,
          color0: t.down,
          borderColor: t.up,
          borderColor0: t.down,
          borderWidth: 1,
        },
        markLine: markLineData.length ? {
          symbol: 'none',
          silent: true,
          animation: false,
          data: markLineData,
        } : undefined,
      },
      {
        id: 'wave',
        name: 'Wave',
        type: 'line',
        data: isWave ? closes : [],
        showSymbol: false,
        smooth: 0.12,
        connectNulls: false,
        lineStyle: waveStyle?.lineStyle || { width: 2, color: t.up },
        areaStyle: isWave ? waveStyle?.areaStyle : undefined,
      },
      {
        id: 'ma20',
        name: 'MA20',
        type: 'line',
        data: ma20,
        showSymbol: false,
        lineStyle: { width: 1.25, color: t.blue, opacity: 0.85 },
        z: 3,
      },
      {
        id: 'ma50',
        name: 'MA50',
        type: 'line',
        data: ma50,
        showSymbol: false,
        lineStyle: { width: 1.25, color: t.orange, opacity: 0.85 },
        z: 3,
      },
      {
        id: 'volume',
        name: 'Volume',
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: vols,
        barMaxWidth: 8,
        large: true,
        tooltip: { show: false },
      },
    ],
  };
}

/** True once the host box has a real, laid-out size we can trust for bar-count / axis math. */
function hostHasRealSize() {
  return !!chartHost && chartHost.clientWidth > 8 && chartHost.clientHeight > 8;
}

function paintNow(resetZoom) {
  if (resetZoom) userZoomed = false;
  try {
    chart.setOption(buildOption(), { notMerge: true });
  } catch (err) {
    console.warn('chart paint failed', err);
  }
}

function paint(resetZoom = true) {
  if (!chart || !lastBars.length) return;
  if (!hostHasRealSize()) {
    // Container is display:none (e.g. Trade tab not open yet) or not laid out.
    // Painting now would compute bar count / Y-axis range off a guessed width
    // and visibly "snap" once the real size shows up â€” so wait for it instead.
    pendingPaint = true;
    pendingPaintResetZoom = resetZoom;
    return;
  }
  pendingPaint = false;
  paintNow(resetZoom);
}

/** Run a deferred paint now that the host has a real size. Returns true if it painted. */
function flushPendingPaint() {
  if (!pendingPaint || !chart || !lastBars.length) return false;
  if (!hostHasRealSize()) return false;
  pendingPaint = false;
  try {
    const size = hostSize();
    chart.resize({ width: size.w, height: size.h });
  } catch { /* ignore */ }
  paintNow(pendingPaintResetZoom);
  return true;
}

export async function waitForChartLib(maxMs = 10000) {
  const start = Date.now();
  while (typeof echarts === 'undefined' && Date.now() - start < maxMs) {
    await new Promise((r) => setTimeout(r, 150));
  }
  return typeof echarts !== 'undefined';
}

function hostSize() {
  const w = Math.max(chartHost?.clientWidth || 0, 320);
  const h = Math.max(chartHost?.clientHeight || 0, 320);
  return { w, h };
}

function rebuildChart(container) {
  if (!container || typeof echarts === 'undefined') return;

  if (fitRetryTimer) {
    clearTimeout(fitRetryTimer);
    fitRetryTimer = null;
  }
  if (fitRaf) {
    cancelAnimationFrame(fitRaf);
    fitRaf = 0;
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (chart) {
    try { chart.dispose(); } catch { /* ignore */ }
    chart = null;
  }

  chartHost = container;
  container.innerHTML = '';
  lastCandle = null;
  lastLiveUpdateAt = 0;
  userZoomed = false;

  try {
    const saved = localStorage.getItem(CHART_STYLE_KEY);
    if (saved === 'wave' || saved === 'candle') chartStyle = saved;
  } catch { /* ignore */ }

  const { w, h } = hostSize();
  chart = echarts.init(container, null, {
    renderer: 'canvas',
    width: w,
    height: h,
  });

  chart.on('datazoom', (evt) => {
    userZoomed = true;
    const batch = Array.isArray(evt?.batch) && evt.batch[0] ? evt.batch[0] : evt;
    const start = zoomNum(batch?.start, NaN);
    const end = zoomNum(batch?.end, NaN);
    if (Number.isFinite(start) && Number.isFinite(end)) {
      applyViewWindow(start, end, { markUserZoom: true, updateDataZoom: false });
    } else {
      const z = readZoomPercents();
      applyViewWindow(z.start, z.end, { markUserZoom: true, updateDataZoom: false });
    }
  });

  resizeObserver = new ResizeObserver(() => {
    if (!chart || !chartHost) return;
    if (chartHost.clientWidth <= 0 || chartHost.clientHeight <= 0) return;
    try {
      const size = hostSize();
      chart.resize({ width: size.w, height: size.h });
    } catch { /* ignore */ }
    // Container just went from hidden/0-size to a real size — paint against real dims.
    if (flushPendingPaint()) return;
    try {
      if (!userZoomed) fitChartToData();
    } catch { /* ignore */ }
  });
  resizeObserver.observe(container);

  if (lastBars.length) paint(true);
}

export async function initChart(container) {
  if (!container) return false;
  const ok = await waitForChartLib();
  if (!ok) {
    container.innerHTML = '<div class="chart-error">Chart library loadingâ€¦ refresh if this persists.</div>';
    return false;
  }
  rebuildChart(container);
  return true;
}

export function getChartStyle() {
  return chartStyle;
}

/** @param {'candle' | 'wave'} style */
export function setChartStyle(style) {
  const next = style === 'wave' ? 'wave' : 'candle';
  chartStyle = next;
  try { localStorage.setItem(CHART_STYLE_KEY, next); } catch { /* ignore */ }
  try {
    document.querySelectorAll('.chart-style-btn').forEach((btn) => {
      const want = btn.getAttribute('data-chart-style') === 'wave' ? 'wave' : 'candle';
      btn.classList.toggle('active', want === next);
    });
  } catch { /* ignore */ }
  paint(false);
}

export function scheduleFitChart() {
  if (fitRetryTimer) clearTimeout(fitRetryTimer);
  if (fitRaf) cancelAnimationFrame(fitRaf);
  fitRaf = requestAnimationFrame(() => {
    fitRaf = 0;
    if (flushPendingPaint()) return;
    resizeChart();
    if (!userZoomed) fitChartToData();
    fitRetryTimer = setTimeout(() => {
      fitRetryTimer = null;
      if (flushPendingPaint()) return;
      resizeChart();
      if (!userZoomed) fitChartToData();
    }, 120);
  });
}

export function fitChartToData() {
  if (!chart || lastBarCount <= 0) return;
  if (flushPendingPaint()) return;
  if (!chartHost || chartHost.clientWidth <= 8) return;
  userZoomed = false;
  try {
    const dz = defaultDataZoom()[0];
    applyViewWindow(zoomNum(dz.start, 0), zoomNum(dz.end, 100), { markUserZoom: false });
  } catch { /* ignore */ }
}

export function zoomChart(direction) {
  if (!chart || lastBarCount <= 0) return;
  try {
    const { start, end } = readZoomPercents();
    const span = Math.max(3, end - start);
    // Zoom in = smaller window; zoom out = larger window (more history).
    const factor = direction > 0 ? 0.72 : 1.45;
    let newSpan = Math.min(100, Math.max(4, span * factor));
    // One more click past near-full should snap to full history.
    if (direction < 0 && span >= 70) newSpan = 100;
    const center = (start + end) / 2;
    let nextStart = center - newSpan / 2;
    let nextEnd = center + newSpan / 2;
    if (nextStart < 0) {
      nextEnd -= nextStart;
      nextStart = 0;
    }
    if (nextEnd > 100) {
      nextStart -= (nextEnd - 100);
      nextEnd = 100;
    }
    nextStart = Math.max(0, nextStart);
    nextEnd = Math.min(100, nextEnd);
    applyViewWindow(nextStart, nextEnd, { markUserZoom: true });
  } catch { /* ignore */ }
}

export function resetChartZoom() {
  userZoomed = false;
  fitChartToData();
}

export function applyChartTheme(colors) {
  themeColors = colors || null;
  if (lastBars.length) paint(false);
}

export function setChartData(candles, showMA = true, range = '1D', showSR = false) {
  lastRange = String(range || '1D').toUpperCase();
  showMa = !!showMA;
  showSr = !!showSR;
  clearPriceAxisCache();
  const sanitized = normalizeChartCandles(candles, lastRange);
  if (!sanitized.length) return;

  const formatted = sanitized.map((c) => {
    const vol = Number(c.volume) || 0;
    const px = Number(c.close) || Number(c.open) || 1;
    return {
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      // Sim session bars often arrive with volume 0 — fill so the bottom pane isn't empty.
      volume: vol > 0 ? vol : synthTickVolume(currentSym || 'X', px, c.time),
    };
  });

  const lastIdx = formatted.length - 1;
  const liveQuotePx = currentSym ? Number(getCachedQuote(currentSym)?.price) : 0;
  if (lastIdx >= 0 && liveQuotePx > 0) {
    const bar = formatted[lastIdx];
    // Prefer pinning the forming bar to the HUD quote. Large gaps rebase via loadChart path.
    if (bar?.close > 0 && !shouldRejectLiveCandleTick(bar.close, liveQuotePx, 0.12)) {
      const capped = applyLiveCandleTick(bar, liveQuotePx, maxLiveBarRangePct(lastRange));
      if (capped) {
        formatted[lastIdx] = {
          time: bar.time,
          open: capped.open,
          high: capped.high,
          low: capped.low,
          close: liveQuotePx,
          volume: bar.volume || 0,
        };
      }
    }
  }

  if (lastIdx >= 1 && !(liveQuotePx > 0)) {
    // Historical hygiene only when we don't have a live quote to pin to
    const mid = Number(formatted[lastIdx - 1]?.close) || Number(formatted[lastIdx]?.close) || 0;
    formatted[lastIdx] = clampBarToPeers(formatted[lastIdx], peerMedianRange(formatted), mid);
  } else if (lastIdx >= 0 && liveQuotePx > 0) {
    // Wick trim vs peers is fine â€” close must stay on the quote
    const mid = Number(formatted[Math.max(0, lastIdx - 1)]?.close) || liveQuotePx;
    const clamped = clampBarToPeers(formatted[lastIdx], peerMedianRange(formatted), mid);
    formatted[lastIdx] = {
      ...clamped,
      close: liveQuotePx,
      high: Math.max(clamped.high, clamped.open, liveQuotePx),
      low: Math.min(clamped.low, clamped.open, liveQuotePx),
    };
  }

  lastBars = formatted;
  lastBarCount = formatted.length;
  lastCandle = formatted[lastIdx] ? { ...formatted[lastIdx] } : null;
  lastLiveUpdateAt = 0;
  userZoomed = false;
  paint(true);
  scheduleFitChart();
}

export function updateLastCandleFromQuote(sym, price, opts = {}) {
  if (!chart || !lastCandle || !lastBars.length) return false;
  const want = String(sym || '').toUpperCase();
  const have = String(currentSym || '').toUpperCase();
  if (!want || !have || want !== have) return false;
  const px = Number(price);
  if (!Number.isFinite(px) || px <= 0) return false;

  // New game-time bucket â†’ append a real bar instead of growing one forever.
  if (maybeRollFormingBar(px)) {
    lastLiveUpdateAt = Date.now();
    try {
      paint(!userZoomed);
    } catch { return false; }
    return true;
  }

  const anchor = Number(lastCandle.close);
  if (anchor > 0) {
    const maxJump = opts.maxJumpPct ?? (isSimulationMode() ? 0.15 : LIVE_MAX_JUMP_PCT);
    if (shouldRejectLiveCandleTick(anchor, px, maxJump)) {
      if (isSimulationMode()) {
        // Sim tape is authoritative â€” snap the forming bar instead of freezing the chart.
        pinLastBarClose(px);
        lastLiveUpdateAt = Date.now();
        // Host not visible/sized yet â€” data above is still updated, just skip the
        // partial render (a full correct paint runs once the container is shown).
        if (pendingPaint || !hostHasRealSize()) return true;
        try {
          const axis = axisRangeForView({ isLiveTick: true });
          const isWave = chartStyle === 'wave';
          const z = readZoomPercents();
          const ws = isWave ? wavePaintStyle(lastBars, z.start, z.end) : null;
          chart.setOption({
            yAxis: [{ min: axis?.min, max: axis?.max, scale: true }],
            series: [
              { id: 'candles', data: isWave ? [] : toOhlc(lastBars) },
              {
                id: 'wave',
                data: isWave ? lastBars.map((b) => b.close) : [],
                ...(ws || {}),
              },
            ],
          });
        } catch { return false; }
        return true;
      }
      try { syncQuoteToPrice(want, anchor, { source: 'candle' }); } catch { /* ignore */ }
      return false;
    }
  }

  const now = Date.now();
  const minMs = opts.throttleMs ?? LIVE_UPDATE_MS;
  if (minMs > 0 && now - lastLiveUpdateAt < minMs) return false;
  lastLiveUpdateAt = now;

  const maxRange = opts.maxBarRangePct ?? maxLiveBarRangePct(lastRange);
  const next = applyLiveCandleTick(lastCandle, px, maxRange);
  if (!next) return false;

  lastCandle.open = next.open;
  lastCandle.high = next.high;
  lastCandle.low = next.low;
  lastCandle.close = px;

  const i = lastBars.length - 1;
  const prevVol = Number(lastBars[i]?.volume) || 0;
  const bump = Math.max(25, Math.round(synthTickVolume(want, px, lastBars[i]?.time || 0) * 0.06));
  lastBars[i] = {
    ...lastBars[i],
    open: next.open,
    high: next.high,
    low: next.low,
    close: px,
    volume: prevVol + bump,
  };
  lastCandle.volume = lastBars[i].volume;
  // Do NOT peer-clamp close here â€” that was desyncing the chart from the HUD price.

  // Host not visible/sized yet â€” data above is still updated, just skip the
  // partial render (a full correct paint runs once the container is shown).
  if (pendingPaint || !hostHasRealSize()) return true;

  try {
    const axis = axisRangeForView({ isLiveTick: true });
    const isWave = chartStyle === 'wave';
    const z = readZoomPercents();
    const ws = isWave ? wavePaintStyle(lastBars, z.start, z.end) : null;
    const t = theme();
    const vols = lastBars.map((b) => ({
      value: b.volume || 0,
      itemStyle: { color: b.close >= b.open ? `${t.up}55` : `${t.down}55` },
    }));
    let volMax = 0;
    for (const b of lastBars) volMax = Math.max(volMax, Number(b.volume) || 0);
    chart.setOption({
      yAxis: [
        { min: axis?.min, max: axis?.max, scale: true },
        { min: 0, max: volMax > 0 ? volMax * 1.2 : undefined, scale: false },
      ],
      series: [
        { id: 'candles', data: isWave ? [] : toOhlc(lastBars) },
        {
          id: 'wave',
          data: isWave ? lastBars.map((b) => b.close) : [],
          ...(ws || {}),
        },
        { id: 'volume', data: vols },
      ],
    });
  } catch {
    return false;
  }
  return true;
}

export function resizeChart() {
  if (!chart || !chartHost) return;
  if (chartHost.clientWidth <= 0) return;
  try {
    const { w, h } = hostSize();
    chart.resize({ width: w, height: h });
  } catch { /* ignore */ }
}

export function getCurrentSym() { return currentSym; }

export function setCurrentSym(sym) {
  const next = sym ? String(sym).toUpperCase() : null;
  if (next !== currentSym) clearPriceAxisCache();
  currentSym = next;
}

export function destroyChart() {
  if (fitRetryTimer) {
    clearTimeout(fitRetryTimer);
    fitRetryTimer = null;
  }
  if (fitRaf) {
    cancelAnimationFrame(fitRaf);
    fitRaf = 0;
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (chart) {
    try { chart.dispose(); } catch { /* ignore */ }
    chart = null;
  }
  chartHost = null;
  lastBars = [];
  lastBarCount = 0;
  lastCandle = null;
  clearPriceAxisCache();
}
