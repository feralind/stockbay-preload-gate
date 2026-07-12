// @ts-check
import { syncQuoteToPrice, shouldRejectLiveCandleTick, LIVE_CANDLE_MAX_JUMP_PCT, candleBarVolFraction, isSimulationMode } from './api.js';

let chart = null;
let candleSeries = null;
let volumeSeries = null;
let ma20Series = null;
let ma50Series = null;
/** Analyst Reports support/resistance price lines on the candle series. */
let srPriceLines = [];
let currentSym = null;
let themeColors = null;
let resizeObserver = null;
let lastBarCount = 0;
let lastRange = '1D';
let wheelAbort = null;
/** Last OHLC bar kept for live tick updates (same time, mutating H/L/C). */
let lastCandle = null;
let lastLiveUpdateAt = 0;
/** After −/+/wheel zoom, skip auto-fit until Reset or new symbol/TF data. */
let userZoomed = false;
const LIVE_UPDATE_MS = 100;
/** Skip a live tick that would move the last bar by more than this fraction. */
const LIVE_MAX_JUMP_PCT = LIVE_CANDLE_MAX_JUMP_PCT;

/** Empty slots past the last bar for the last-price label (not double-counted with rightOffset). */
const RIGHT_PAD_BARS = 2;
/** Target / clamp for default visible bar window (broker-like density). */
const MIN_VISIBLE_BARS = 36;
const MAX_VISIBLE_BARS = 120;
const TARGET_BAR_PX = 7;
const INTRADAY_RANGES = new Set(['1D', '5D', '1M', '1', '5', '15', '60']);

function rangeBarMinutes(range) {
  const key = String(range || '1D').toUpperCase();
  if (key === '1D' || key === '5') return 5;
  if (key === '5D' || key === '15') return 15;
  if (key === '1M' || key === '60') return 60;
  return 1440;
}

/** Max high-low span for the live-updating last bar (stops spear wicks). */
export function maxLiveBarRangePct(range) {
  return candleBarVolFraction(rangeBarMinutes(range), 1) * 3.5;
}

/**
 * Pure: expand OHLC with a new close, but clamp total bar range.
 */
export function applyLiveCandleTick(bar, price, maxRangePct) {
  if (!bar) return null;
  const px = Number(price);
  if (!(px > 0)) return null;
  const open = Number(bar.open);
  const next = {
    time: bar.time,
    open,
    close: px,
    high: Math.max(Number(bar.high) || px, open, px),
    low: Math.min(Number(bar.low) || px, open, px),
  };
  const mid = (open + px) / 2 || px;
  const cap = mid * (Number(maxRangePct) > 0 ? maxRangePct : 0.02);
  if (next.high - next.low > cap) {
    const bodyHigh = Math.max(open, px);
    const bodyLow = Math.min(open, px);
    const bodySpan = bodyHigh - bodyLow;
    const room = Math.max(0, cap - bodySpan);
    next.high = bodyHigh + room * 0.55;
    next.low = Math.max(0.01, bodyLow - room * 0.45);
  }
  return next;
}

export async function waitForChartLib(maxMs = 10000) {
  const start = Date.now();
  while (typeof LightweightCharts === 'undefined' && Date.now() - start < maxMs) {
    await new Promise(r => setTimeout(r, 150));
  }
  return typeof LightweightCharts !== 'undefined';
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

function rebuildChart(container) {
  if (!container || typeof LightweightCharts === 'undefined') return;

  if (chart) {
    chart.remove();
    chart = null;
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (wheelAbort) {
    wheelAbort.abort();
    wheelAbort = null;
  }

  lastCandle = null;
  lastLiveUpdateAt = 0;
  lastBarCount = 0;
  userZoomed = false;
  srPriceLines = [];

  const bg = themeColors?.chartBg || getCss('--chart-bg') || '#09090b';
  const grid = themeColors?.chartGrid || getCss('--chart-grid') || '#1a1a1f';
  const green = themeColors?.green || getCss('--green') || '#00c805';
  const red = themeColors?.red || getCss('--red') || '#ef4444';
  const muted = themeColors?.muted || getCss('--muted') || '#a1a1aa';
  const border = themeColors?.border || getCss('--border') || '#27272a';
  const blue = themeColors?.blue || getCss('--blue') || '#60a5fa';
  const orange = '#f59e0b';

  const w = container.clientWidth || 400;
  const h = container.clientHeight || 280;

  chart = LightweightCharts.createChart(container, {
    width: w,
    height: h,
    layout: { background: { color: bg }, textColor: muted },
    grid: { vertLines: { color: grid }, horzLines: { color: grid } },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
      vertLine: { color: `${blue}55`, width: 1, style: 2 },
      horzLine: { color: `${blue}55`, width: 1, style: 2 },
    },
    rightPriceScale: {
      borderColor: border,
      scaleMargins: { top: 0.08, bottom: 0.22 },
      entireTextOnly: true,
    },
    timeScale: {
      borderColor: border,
      timeVisible: true,
      secondsVisible: false,
      rightOffset: RIGHT_PAD_BARS,
      barSpacing: TARGET_BAR_PX,
      minBarSpacing: 3,
      maxBarSpacing: 18,
      // false so sparse series can keep empty left logical space (no giant candles)
      fixLeftEdge: false,
      lockVisibleTimeRangeOnResize: true,
    },
    handleScale: {
      mouseWheel: false, // custom wheel handler below (matches ± buttons)
      pinch: true,
      axisPressedMouseMove: { time: true, price: true },
    },
    handleScroll: {
      mouseWheel: false,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: true,
    },
  });

  candleSeries = chart.addCandlestickSeries({
    upColor: green,
    downColor: red,
    borderUpColor: green,
    borderDownColor: red,
    wickUpColor: green,
    wickDownColor: red,
  });

  volumeSeries = chart.addHistogramSeries({
    priceFormat: { type: 'volume' },
    priceScaleId: 'volume',
  });
  chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

  ma20Series = chart.addLineSeries({ color: blue, lineWidth: 2, title: 'MA20', priceLineVisible: false, lastValueVisible: true });
  ma50Series = chart.addLineSeries({ color: orange, lineWidth: 2, title: 'MA50', priceLineVisible: false, lastValueVisible: true });

  resizeObserver = new ResizeObserver(() => {
    if (chart && container.clientWidth > 0 && container.clientHeight > 0) {
      chart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
    }
  });
  resizeObserver.observe(container);

  wheelAbort = new AbortController();
  container.addEventListener('wheel', onChartWheel, { passive: false, signal: wheelAbort.signal });
}

function onChartWheel(e) {
  if (!chart || lastBarCount <= 0) return;
  e.preventDefault();
  zoomChart(e.deltaY < 0 ? 1 : -1);
}

function getCss(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function isIntradayRange(range) {
  return INTRADAY_RANGES.has(String(range || '1D').toUpperCase());
}

function toChartTime(ts, useBusinessDay) {
  if (!useBusinessDay) return ts;
  const d = new Date(ts * 1000);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

/** Visible bar count for a sensible default density (width-aware, clamped). */
function targetVisibleBars() {
  const container = document.getElementById('chart-container');
  const width = container?.clientWidth || 400;
  const byWidth = Math.floor(width / TARGET_BAR_PX);
  return Math.min(MAX_VISIBLE_BARS, Math.max(MIN_VISIBLE_BARS, byWidth || MIN_VISIBLE_BARS));
}

/**
 * Default view: last N bars + small right pad.
 * Always uses at least N logical slots so few bars stay normal-sized (empty left),
 * and never packs thousands of bars into one pane (microscopic).
 */
export function fitChartToData() {
  if (!chart || lastBarCount <= 0) return;
  const ts = chart.timeScale();
  const last = lastBarCount - 1;
  const want = targetVisibleBars();
  // Reserve `want` slots even when lastBarCount < want → empty left, stable bar width
  const from = last - want + 1;
  const to = last + RIGHT_PAD_BARS;
  ts.setVisibleLogicalRange({ from, to });
  userZoomed = false;
}

export function zoomChart(direction) {
  if (!chart || lastBarCount <= 0) return;
  const ts = chart.timeScale();
  const lr = ts.getVisibleLogicalRange();
  if (!lr) return;
  userZoomed = true;
  const span = lr.to - lr.from;
  const factor = direction > 0 ? 0.82 : 1.22;
  const maxSpan = Math.max(lastBarCount + RIGHT_PAD_BARS + 8, MAX_VISIBLE_BARS * 2);
  const newSpan = Math.min(maxSpan, Math.max(12, span * factor));
  const center = (lr.from + lr.to) / 2;
  let from = center - newSpan / 2;
  let to = center + newSpan / 2;
  const rightLimit = lastBarCount - 1 + RIGHT_PAD_BARS + 2;
  if (to > rightLimit) {
    const shift = to - rightLimit;
    from -= shift;
    to -= shift;
  }
  ts.setVisibleLogicalRange({ from, to });
}

export function resetChartZoom() {
  userZoomed = false;
  fitChartToData();
}

export function applyChartTheme(colors) {
  themeColors = colors;
  const container = document.getElementById('chart-container');
  if (container) rebuildChart(container);
}

/** Clear Analyst S/R price lines from the candle series. */
function clearSrPriceLines() {
  if (!candleSeries) {
    srPriceLines = [];
    return;
  }
  for (const line of srPriceLines) {
    try { candleSeries.removePriceLine(line); } catch (_) { /* series rebuilt */ }
  }
  srPriceLines = [];
}

/**
 * Pure: recent swing support (below last close) and resistance (above).
 * Falls back to window min/max when no local pivots qualify.
 */
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

function applySrPriceLines(formatted, showSR) {
  clearSrPriceLines();
  if (!showSR || !candleSeries || !formatted?.length) return;
  const { support, resistance } = findSupportResistance(formatted);
  const green = themeColors?.green || getCss('--green') || '#00c805';
  const red = themeColors?.red || getCss('--red') || '#ef4444';
  const dashed = typeof LightweightCharts !== 'undefined' && LightweightCharts.LineStyle
    ? LightweightCharts.LineStyle.Dashed
    : 2;
  if (support > 0) {
    srPriceLines.push(candleSeries.createPriceLine({
      price: +support.toFixed(4),
      color: green,
      lineWidth: 1,
      lineStyle: dashed,
      axisLabelVisible: true,
      title: 'S',
    }));
  }
  if (resistance > 0) {
    srPriceLines.push(candleSeries.createPriceLine({
      price: +resistance.toFixed(4),
      color: red,
      lineWidth: 1,
      lineStyle: dashed,
      axisLabelVisible: true,
      title: 'R',
    }));
  }
}

export function setChartData(candles, showMA = true, range = '1D', showSR = false) {
  if (!candleSeries || !candles?.length) return;

  lastRange = String(range || '1D').toUpperCase();
  const intraday = isIntradayRange(lastRange);
  const useBusinessDay = !intraday;

  const formatted = candles.map(c => ({
    time: toChartTime(c.time, useBusinessDay),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }));
  lastBarCount = formatted.length;
  const last = formatted[formatted.length - 1];
  lastCandle = last ? { ...last } : null;
  lastLiveUpdateAt = 0;
  userZoomed = false;

  candleSeries.setData(formatted);
  const green = themeColors?.green || getCss('--green');
  const red = themeColors?.red || getCss('--red');
  volumeSeries.setData(candles.map((c, i) => ({
    time: formatted[i].time,
    value: c.volume || 0,
    color: c.close >= c.open ? `${green}66` : `${red}66`,
  })));

  if (showMA && formatted.length >= 20) {
    ma20Series.setData(calcMA(formatted, 20));
    ma50Series.setData(calcMA(formatted, Math.min(50, formatted.length - 1)));
  } else {
    ma20Series.setData([]);
    ma50Series.setData([]);
  }

  applySrPriceLines(formatted, !!showSR);

  chart?.timeScale().applyOptions({
    timeVisible: intraday,
    secondsVisible: false,
    rightOffset: RIGHT_PAD_BARS,
    fixLeftEdge: false,
    lockVisibleTimeRangeOnResize: true,
    barSpacing: TARGET_BAR_PX,
    minBarSpacing: 3,
    maxBarSpacing: 18,
  });

  // One fit after layout — do not re-fit on ticks, resize, or live quote updates.
  requestAnimationFrame(() => {
    resizeChart();
    if (!userZoomed) fitChartToData();
  });
}

/**
 * Live-update the last candle from a quote tick (MSN-style last-point feel).
 * Same bar time; open unchanged; high/low expand; close = price.
 * Rejects outlier quotes that disagree with the loaded series (e.g. seed $361
 * vs candle close ~$49) so the last bar never jumps vertically.
 * No-ops if no chart data, wrong symbol, or invalid price. Does not refit/zoom.
 */
export function updateLastCandleFromQuote(sym, price, opts = {}) {
  if (!candleSeries || !lastCandle) return false;
  const want = String(sym || '').toUpperCase();
  const have = String(currentSym || '').toUpperCase();
  if (!want || !have || want !== have) return false;
  const px = Number(price);
  if (!Number.isFinite(px) || px <= 0) return false;

  const anchor = Number(lastCandle.close);
  if (anchor > 0) {
    const maxJump = opts.maxJumpPct ?? LIVE_MAX_JUMP_PCT;
    if (shouldRejectLiveCandleTick(anchor, px, maxJump)) {
      // Pre-sim only: pull poisoned seed quotes back to the candle series.
      // During sim the tape is authoritative — never rewind tradeable prices to a stale bar
      // (that was a 2.5–3% free-entry exploit after shocks).
      if (!isSimulationMode()) {
        try { syncQuoteToPrice(want, anchor, { source: 'candle' }); } catch { /* ignore */ }
      }
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
  lastCandle.close = next.close;

  try {
    candleSeries.update({
      time: lastCandle.time,
      open: lastCandle.open,
      high: lastCandle.high,
      low: lastCandle.low,
      close: lastCandle.close,
    });
  } catch {
    return false;
  }
  return true;
}

export function resizeChart() {
  const container = document.getElementById('chart-container');
  if (chart && container?.clientWidth > 0) {
    chart.applyOptions({
      width: container.clientWidth,
      height: container.clientHeight || 280,
    });
  }
}

function calcMA(data, period) {
  const out = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += data[i - j].close;
    out.push({ time: data[i].time, value: sum / period });
  }
  return out;
}

export function getCurrentSym() { return currentSym; }
export function setCurrentSym(sym) {
  const next = sym || null;
  if (String(currentSym || '').toUpperCase() !== String(next || '').toUpperCase()) {
    lastCandle = null;
    lastLiveUpdateAt = 0;
  }
  currentSym = next;
}

export function destroyChart() {
  if (wheelAbort) {
    wheelAbort.abort();
    wheelAbort = null;
  }
  if (resizeObserver) resizeObserver.disconnect();
  if (chart) { chart.remove(); chart = null; }
  candleSeries = null;
  volumeSeries = null;
  ma20Series = null;
  ma50Series = null;
  lastBarCount = 0;
  lastCandle = null;
  lastLiveUpdateAt = 0;
  userZoomed = false;
}
