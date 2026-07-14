// @ts-check
/**
 * Trade chart — clean broker-style Apache ECharts candlesticks.
 * Public API kept stable for app.js / chart-panel / quality tests.
 */
import {
  syncQuoteToPrice, shouldRejectLiveCandleTick, LIVE_CANDLE_MAX_JUMP_PCT,
  candleBarVolFraction, isSimulationMode, getCachedQuote,
} from './api.js';

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
/** @type {'candle' | 'wave'} */
let chartStyle = 'candle';
let showMa = true;
let showSr = false;
let fitRetryTimer = null;
let fitRaf = 0;

const LIVE_UPDATE_MS = 100;
const LIVE_MAX_JUMP_PCT = LIVE_CANDLE_MAX_JUMP_PCT;
const MIN_VISIBLE_BARS = 40;
const MAX_VISIBLE_BARS = 120;
/** Single-session clock ranges — time-only axis labels + tight spear defense. */
const SESSION_RANGES = new Set(['1D', '1', '5', '15', '60']);
/** Multi-bar ranges that still use intraday Yahoo intervals (need date+time labels). */
const INTRADAY_RANGES = new Set(['1D', '5D', '1M', '1', '5', '15', '60']);
const LONG_RANGES = new Set(['6M', 'YTD', '1Y', '5Y', 'MAX', 'D']);
const CHART_STYLE_KEY = 'stockway_chart_style_v1';

function rangeBarMinutes(range) {
  const key = String(range || '1D').toUpperCase();
  if (key === '1D' || key === '5') return 5;
  if (key === '5D' || key === '15') return 15;
  if (key === '1M' || key === '60') return 60;
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
 * - 1D: soft-pin last close (ignore forming spears), modest floor/ceiling
 * - Multi-day / long: fit real H/L + last close — never re-center with a hard maxSpan
 *   (that was clipping ATH on MAX / 1Y and making 5D look disjoint)
 */
export function computePriceAxisRange(bars, range = '1D') {
  if (!Array.isArray(bars) || !bars.length) return null;
  const key = String(range || '1D').toUpperCase();
  const session = isSessionRange(key);
  const longRange = LONG_RANGES.has(key);

  const completed = bars.length > 1 ? bars.slice(0, -1) : bars;
  const highs = completed.map((b) => Number(b.high)).filter((v) => Number.isFinite(v) && v > 0);
  const lows = completed.map((b) => Number(b.low)).filter((v) => Number.isFinite(v) && v > 0);
  if (!highs.length || !lows.length) return null;

  const sortedHigh = [...highs].sort((a, b) => a - b);
  const sortedLow = [...lows].sort((a, b) => a - b);
  const pick = (arr, p) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor((arr.length - 1) * p)))];

  let minV;
  let maxV;
  if (session && completed.length >= 16) {
    // Light winsorize so one bad completed wick doesn't own the pane
    minV = pick(sortedLow, 0.05);
    maxV = pick(sortedHigh, 0.95);
  } else if (longRange && completed.length >= 40) {
    // Tiny trim for a single corrupt Yahoo wick — keep real multi-year range
    minV = pick(sortedLow, 0.01);
    maxV = pick(sortedHigh, 0.99);
  } else {
    minV = sortedLow[0];
    maxV = sortedHigh[sortedHigh.length - 1];
  }

  const sessionMid = (minV + maxV) / 2 || 1;
  const last = bars[bars.length - 1];
  const lastClose = Number(last?.close) || 0;
  if (lastClose > 0) {
    if (session) {
      const soft = Math.max((maxV - minV) * 0.15, sessionMid * 0.002);
      const pinned = Math.min(maxV + soft, Math.max(minV - soft, lastClose));
      minV = Math.min(minV, pinned);
      maxV = Math.max(maxV, pinned);
    } else {
      // Hard-include last print so current price never sits off-screen
      const lastHigh = Number(last?.high);
      const lastLow = Number(last?.low);
      minV = Math.min(minV, lastClose, Number.isFinite(lastLow) && lastLow > 0 ? lastLow : lastClose);
      maxV = Math.max(maxV, lastClose, Number.isFinite(lastHigh) && lastHigh > 0 ? lastHigh : lastClose);
    }
  }

  const mid = (minV + maxV) / 2 || sessionMid;
  let span = Math.max(maxV - minV, mid * 0.001);

  const minSpan = mid * (session ? 0.018 : longRange ? 0.06 : 0.028);
  if (span < minSpan) {
    const extra = (minSpan - span) / 2;
    minV -= extra;
    maxV += extra;
    span = maxV - minV;
  }

  // Hard ceiling only on single-session charts (leftover spear defense).
  // Never clamp 5D/1M/6M/1Y/MAX — that recenters mid and clips real highs/lows.
  if (session) {
    const maxSpan = mid * 0.08;
    if (span > maxSpan) {
      minV = mid - maxSpan / 2;
      maxV = mid + maxSpan / 2;
    }
  }

  const padRatio = session ? 0.1 : longRange ? 0.1 : 0.12;
  const pad = Math.max((maxV - minV) * padRatio, mid * 0.003);
  return {
    min: Math.max(0.01, minV - pad),
    max: maxV + pad,
  };
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
 * Live forming bar must track the HUD quote. Cap absurd wicks, but never move close off `price`.
 */
export function applyLiveCandleTick(bar, price, maxRangePct) {
  if (!bar) return null;
  const px = Number(price);
  if (!(px > 0)) return null;
  let open = Number(bar.open);
  if (!(open > 0)) open = px;
  // Keep the bar's session open — rewriting open made candles fight the tape.
  const next = {
    time: bar.time,
    open,
    close: px,
    high: Math.max(Number(bar.high) || px, open, px),
    low: Math.min(Number(bar.low) || px, open, px),
  };
  const mid = (open + px) / 2 || px;
  const cap = mid * Math.max(0.004, Number(maxRangePct) > 0 ? Number(maxRangePct) : 0.02);
  // Trim only extreme leftover spears; close stays glued to the quote.
  if (next.high - next.low > cap * 2.5) {
    const bodyHigh = Math.max(open, px);
    const bodyLow = Math.min(open, px);
    const bodySpan = bodyHigh - bodyLow;
    const room = Math.max(cap * 1.2 - bodySpan, mid * 0.001);
    next.high = bodyHigh + room * 0.55;
    next.low = Math.max(0.01, bodyLow - room * 0.45);
    next.high = Math.max(next.high, open, px);
    next.low = Math.min(next.low, open, px);
  }
  return next;
}

/** After wick hygiene, force last close back to the live quote (HUD ↔ candle lock). */
function pinLastBarClose(price) {
  const px = Number(price);
  if (!(px > 0) || !lastBars.length) return;
  const i = lastBars.length - 1;
  const bar = lastBars[i];
  const open = Number(bar.open) > 0 ? Number(bar.open) : px;
  const high = Math.max(Number(bar.high) || px, open, px);
  const low = Math.min(Number(bar.low) || px, open, px);
  lastBars[i] = { ...bar, open, high, low, close: px };
  if (lastCandle) {
    lastCandle.open = open;
    lastCandle.high = high;
    lastCandle.low = low;
    lastCandle.close = px;
  }
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
    grid: themeColors?.chartGrid || getCss('--chart-grid') || 'rgba(148,163,184,0.08)',
    cross: 'rgba(148,163,184,0.35)',
  };
}

function formatAxisLabel(ts, range = lastRange) {
  const d = new Date(Number(ts) * 1000);
  if (!Number.isFinite(d.getTime())) return '';
  const key = String(range || '1D').toUpperCase();
  if (isSessionRange(key)) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  // 5D / 1M: date + time so day boundaries don't look like the clock jumped backward
  if (key === '5D' || key === '1M') {
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

function formatPrice(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
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
  const shared = { xAxisIndex: [0, 1], filterMode: 'none' };
  if (n <= 0) {
    return [
      { type: 'inside', ...shared, start: 0, end: 100, zoomOnMouseWheel: true, moveOnMouseMove: true },
      { type: 'slider', ...shared, show: false, start: 0, end: 100 },
    ];
  }
  const want = targetVisibleBars();
  const start = n <= want ? 0 : Math.max(0, ((n - want) / n) * 100);
  return [
    { type: 'inside', ...shared, start, end: 100, zoomOnMouseWheel: true, moveOnMouseMove: true },
    { type: 'slider', ...shared, show: false, start, end: 100 },
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

function readZoomPercents() {
  if (!userZoomed) {
    const dz = defaultDataZoom()[0];
    return { start: Number(dz.start) || 0, end: Number(dz.end) || 100 };
  }
  try {
    const opt = chart?.getOption?.();
    const dz = opt?.dataZoom?.[0];
    return {
      start: Number(dz?.start ?? 0) || 0,
      end: Number(dz?.end ?? 100) || 100,
    };
  } catch {
    return { start: 0, end: 100 };
  }
}

function axisRangeForView() {
  const { start, end } = readZoomPercents();
  const slice = sliceBarsForAxis(lastBars, start, end);
  return computePriceAxisRange(slice.length ? slice : lastBars, lastRange);
}

function syncPriceAxisFromView() {
  if (!chart || !lastBars.length) return;
  const axis = axisRangeForView();
  if (!axis) return;
  try {
    chart.setOption({
      yAxis: [{ min: axis.min, max: axis.max, scale: true }],
    });
  } catch { /* ignore */ }
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
  const sym = String(currentSym || '').toUpperCase() || '—';
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

/** ECharts candle datum: [open, close, low, high] — raw sanitized OHLC, no visual smash. */
function toOhlc(bars) {
  return bars.map((b) => [b.open, b.close, b.low, b.high]);
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

  const zoom = userZoomed ? undefined : defaultDataZoom();
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
      { left: 8, right: 58, top: 12, bottom: '24%', containLabel: false },
      { left: 8, right: 58, top: '80%', bottom: 26, containLabel: false },
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
          hideOverlap: true,
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
    dataZoom: zoom || defaultDataZoom(),
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
        lineStyle: { width: 2, color: t.up },
        areaStyle: isWave ? {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: `${t.up}40` },
              { offset: 1, color: `${t.up}00` },
            ],
          },
        } : undefined,
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

function paint(resetZoom = true) {
  if (!chart || !lastBars.length) return;
  if (resetZoom) userZoomed = false;
  try {
    chart.setOption(buildOption(), { notMerge: true });
  } catch (err) {
    console.warn('chart paint failed', err);
  }
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

  chart.on('datazoom', () => {
    userZoomed = true;
    syncPriceAxisFromView();
  });

  resizeObserver = new ResizeObserver(() => {
    if (!chart || !chartHost) return;
    if (chartHost.clientWidth <= 0 || chartHost.clientHeight <= 0) return;
    try {
      const size = hostSize();
      chart.resize({ width: size.w, height: size.h });
    } catch { /* ignore */ }
  });
  resizeObserver.observe(container);

  if (lastBars.length) paint(true);
}

export async function initChart(container) {
  if (!container) return false;
  const ok = await waitForChartLib();
  if (!ok) {
    container.innerHTML = '<div class="chart-error">Chart library loading… refresh if this persists.</div>';
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
    resizeChart();
    if (!userZoomed) fitChartToData();
    fitRetryTimer = setTimeout(() => {
      fitRetryTimer = null;
      resizeChart();
      if (!userZoomed) fitChartToData();
    }, 120);
  });
}

export function fitChartToData() {
  if (!chart || lastBarCount <= 0) return;
  if (!chartHost || chartHost.clientWidth <= 8) return;
  userZoomed = false;
  try {
    chart.setOption({ dataZoom: defaultDataZoom() });
    syncPriceAxisFromView();
  } catch { /* ignore */ }
}

export function zoomChart(direction) {
  if (!chart || lastBarCount <= 0) return;
  userZoomed = true;
  try {
    const opt = chart.getOption();
    const dz = opt?.dataZoom?.[0];
    const start = Number(dz?.start ?? 0);
    const end = Number(dz?.end ?? 100);
    const span = Math.max(5, end - start);
    const factor = direction > 0 ? 0.82 : 1.22;
    const newSpan = Math.min(100, Math.max(8, span * factor));
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
    chart.setOption({
      dataZoom: [
        { start: Math.max(0, nextStart), end: Math.min(100, nextEnd) },
        { start: Math.max(0, nextStart), end: Math.min(100, nextEnd) },
      ],
    });
    syncPriceAxisFromView();
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
  const sanitized = normalizeChartCandles(candles, lastRange);
  if (!sanitized.length) return;

  const formatted = sanitized.map((c) => ({
    time: c.time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume || 0,
  }));

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
    // Wick trim vs peers is fine — close must stay on the quote
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

  const anchor = Number(lastCandle.close);
  if (anchor > 0) {
    const maxJump = opts.maxJumpPct ?? (isSimulationMode() ? 0.15 : LIVE_MAX_JUMP_PCT);
    if (shouldRejectLiveCandleTick(anchor, px, maxJump)) {
      if (isSimulationMode()) {
        // Sim tape is authoritative — snap the forming bar instead of freezing the chart.
        pinLastBarClose(px);
        lastLiveUpdateAt = Date.now();
        try {
          const axis = axisRangeForView();
          const isWave = chartStyle === 'wave';
          chart.setOption({
            yAxis: [{ min: axis?.min, max: axis?.max, scale: true }],
            series: [
              { id: 'candles', data: isWave ? [] : toOhlc(lastBars) },
              { id: 'wave', data: isWave ? lastBars.map((b) => b.close) : [] },
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
  lastBars[i] = {
    ...lastBars[i],
    open: next.open,
    high: next.high,
    low: next.low,
    close: px,
  };
  // Do NOT peer-clamp close here — that was desyncing the chart from the HUD price.

  try {
    const axis = axisRangeForView();
    const isWave = chartStyle === 'wave';
    chart.setOption({
      yAxis: [{ min: axis?.min, max: axis?.max, scale: true }],
      series: [
        { id: 'candles', data: isWave ? [] : toOhlc(lastBars) },
        { id: 'wave', data: isWave ? lastBars.map((b) => b.close) : [] },
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
  currentSym = sym ? String(sym).toUpperCase() : null;
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
}
