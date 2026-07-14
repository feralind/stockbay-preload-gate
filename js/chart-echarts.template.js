// @ts-check
/**
 * Trade chart — Apache ECharts candlestick engine.
 * Replaces TradingView Lightweight Charts (fit/resize/blank-chart bugs).
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
/** Last OHLC bar kept for live tick updates. */
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
const MIN_VISIBLE_BARS = 36;
const MAX_VISIBLE_BARS = 120;
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

/** Max high-low span for the live-updating last bar (stops spear wicks). */
export function maxLiveBarRangePct(range) {
  return candleBarVolFraction(rangeBarMinutes(range), 1) * 3.5;
}

function maxHistoricalBarRangePct(range) {
  const key = String(range || '1D').toUpperCase();
  if (key === 'MAX') return 0.45;
  if (LONG_RANGES.has(key)) return 0.28;
  return candleBarVolFraction(rangeBarMinutes(range), 1) * 5.5;
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

/**
 * Repair inverted / spear OHLC and cap high-low span.
 */
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

/**
 * Normalize OHLC: unix seconds, ascending, unique times, spear clamps.
 * @param {unknown[]} candles
 * @param {string} [range='1D']
 */
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

/** Pure: recent swing support / resistance. */
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
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function isIntradayRange(range) {
  return INTRADAY_RANGES.has(String(range || '1D').toUpperCase());
}

function theme() {
  return {
    green: themeColors?.green || getCss('--accent-trade') || getCss('--green') || '#3b82f6',
    red: themeColors?.red || getCss('--rose') || getCss('--red') || '#f43f5e',
    muted: themeColors?.muted || getCss('--muted') || '#a1a1aa',
    border: themeColors?.border || getCss('--glass-stroke') || 'rgba(255,255,255,0.14)',
    blue: themeColors?.blue || getCss('--blue') || '#60a5fa',
    orange: '#f59e0b',
    grid: themeColors?.chartGrid || getCss('--chart-grid') || 'rgba(255,255,255,0.06)',
  };
}

function formatAxisLabel(ts, intraday) {
  const d = new Date(Number(ts) * 1000);
  if (!Number.isFinite(d.getTime())) return '';
  if (intraday) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (lastRange === 'MAX' || lastRange === '5Y') {
    return d.toLocaleDateString([], { month: 'short', year: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
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
  if (lastRange === 'MAX') return Math.min(64, Math.max(40, Math.floor(base * 0.7)));
  if (lastRange === '5Y') return Math.min(90, Math.max(48, base));
  return base;
}

function defaultDataZoom() {
  const n = lastBarCount;
  if (n <= 0) return [{ start: 0, end: 100 }, { type: 'inside', start: 0, end: 100 }];
  const want = targetVisibleBars();
  if (n <= want) {
    return [
      { type: 'inside', start: 0, end: 100, zoomOnMouseWheel: true, moveOnMouseMove: true },
      { show: false, start: 0, end: 100 },
    ];
  }
  const start = Math.max(0, ((n - want) / n) * 100);
  return [
    { type: 'inside', start, end: 100, zoomOnMouseWheel: true, moveOnMouseMove: true },
    { show: false, start, end: 100 },
  ];
}

function formatPrice(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (Math.abs(n) >= 100) return n.toFixed(2);
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
      hour: '2-digit', minute: '2-digit',
    });
  }
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function buildTooltipHtml(barIndex) {
  const bar = lastBars[barIndex];
  if (!bar) return '';
  const t = theme();
  const up = bar.close >= bar.open;
  const tone = up ? t.green : t.red;
  const chg = bar.open > 0 ? ((bar.close - bar.open) / bar.open) * 100 : 0;
  const chgStr = `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`;
  const when = formatTooltipTime(bar.time, isIntradayRange(lastRange));
  const sym = String(currentSym || '').toUpperCase() || '—';
  return `
    <div style="min-width:132px;max-width:168px;line-height:1.35">
      <div style="font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${t.muted};margin-bottom:4px">${sym}</div>
      <div style="font-size:11px;color:#e8eaed;margin-bottom:6px">${when}</div>
      <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:11px">
        <span style="color:${t.muted}">O</span><span style="text-align:right;font-variant-numeric:tabular-nums">${formatPrice(bar.open)}</span>
        <span style="color:${t.muted}">H</span><span style="text-align:right;font-variant-numeric:tabular-nums">${formatPrice(bar.high)}</span>
        <span style="color:${t.muted}">L</span><span style="text-align:right;font-variant-numeric:tabular-nums">${formatPrice(bar.low)}</span>
        <span style="color:${t.muted}">C</span><span style="text-align:right;font-variant-numeric:tabular-nums;color:${tone};font-weight:700">${formatPrice(bar.close)}</span>
        <span style="color:${t.muted}">Chg</span><span style="text-align:right;font-variant-numeric:tabular-nums;color:${tone}">${chgStr}</span>
        <span style="color:${t.muted}">Vol</span><span style="text-align:right;font-variant-numeric:tabular-nums">${formatVolume(bar.volume)}</span>
      </div>
    </div>`;
}

function buildOption() {
  const t = theme();
  const intraday = isIntradayRange(lastRange);
  const isWave = chartStyle === 'wave';
  const cats = lastBars.map((b) => formatAxisLabel(b.time, intraday));
  // ECharts candle: [open, close, low, high]
  const ohlc = lastBars.map((b) => [b.open, b.close, b.low, b.high]);
  const vols = lastBars.map((b) => ({
    value: b.volume || 0,
    itemStyle: { color: b.close >= b.open ? `${t.green}66` : `${t.red}66` },
  }));
  const closes = lastBars.map((b) => b.close);
  const ma20 = showMa && lastBars.length >= 20 ? calcMA(lastBars, 20) : [];
  const ma50 = showMa && lastBars.length >= 50 ? calcMA(lastBars, 50) : [];

  /** @type {any[]} */
  const markLineData = [];
  if (showSr && lastBars.length >= 20) {
    const { support, resistance } = findSupportResistance(lastBars);
    if (support > 0) {
      markLineData.push({
        yAxis: support,
        name: 'S',
        lineStyle: { color: t.green, type: 'dashed', width: 1 },
        label: { formatter: 'S', color: t.green },
      });
    }
    if (resistance > 0) {
      markLineData.push({
        yAxis: resistance,
        name: 'R',
        lineStyle: { color: t.red, type: 'dashed', width: 1 },
        label: { formatter: 'R', color: t.red },
      });
    }
  }

  const zoom = userZoomed ? undefined : defaultDataZoom();

  return {
    animation: false,
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
      borderColor: colorMixSafe(t.border, 'rgba(255,255,255,0.18)'),
      backgroundColor: 'rgba(12,14,18,0.96)',
      padding: [7, 9],
      extraCssText: [
        'width:auto!important',
        'height:auto!important',
        'min-width:0!important',
        'max-width:170px!important',
        'box-shadow:0 8px 22px rgba(0,0,0,0.5)',
        'border-radius:9px',
        'pointer-events:none',
        'z-index:40',
      ].join(';'),
      textStyle: { color: '#e8eaed', fontSize: 11 },
      axisPointer: {
        type: 'line',
        snap: true,
        label: { show: false },
        lineStyle: { color: `${t.blue}55`, width: 1, type: 'dashed' },
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
      { left: 12, right: 56, top: 14, bottom: '22%', containLabel: false },
      { left: 12, right: 56, top: '82%', bottom: 28, containLabel: false },
    ],
    xAxis: [
      {
        type: 'category',
        data: cats,
        boundaryGap: true,
        axisLine: { lineStyle: { color: t.border } },
        axisLabel: {
          color: t.muted,
          hideOverlap: true,
          fontSize: 10,
          margin: 10,
        },
        splitLine: { show: false },
        min: 'dataMin',
        max: 'dataMax',
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
        min: 'dataMin',
        max: 'dataMax',
      },
    ],
    yAxis: [
      {
        scale: true,
        position: 'right',
        min: (val) => Math.max(0, val.min - (val.max - val.min) * 0.04),
        axisLine: { show: false },
        axisLabel: {
          color: t.muted,
          fontSize: 10,
          margin: 8,
          formatter: (v) => formatPrice(v),
        },
        splitLine: { lineStyle: { color: t.grid } },
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
    dataZoom: zoom || [
      { type: 'inside', xAxisIndex: [0, 1], zoomOnMouseWheel: true, moveOnMouseMove: true },
      { show: false, xAxisIndex: [0, 1] },
    ],
    series: [
      {
        id: 'candles',
        name: 'Price',
        type: 'candlestick',
        data: isWave ? [] : ohlc,
        itemStyle: {
          color: t.green,
          color0: t.red,
          borderColor: t.green,
          borderColor0: t.red,
        },
        markLine: !isWave && markLineData.length ? {
          symbol: 'none',
          silent: true,
          data: markLineData,
        } : undefined,
      },
      {
        id: 'wave',
        name: 'Wave',
        type: 'line',
        data: isWave ? closes : [],
        showSymbol: false,
        smooth: 0.15,
        lineStyle: { width: 2, color: t.green },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: `${t.green}55` },
              { offset: 1, color: `${t.green}05` },
            ],
          },
        },
      },
      {
        id: 'ma20',
        name: 'MA20',
        type: 'line',
        data: (showMa && !isWave && ma20.length) ? ma20 : [],
        showSymbol: false,
        lineStyle: { width: 1.5, color: t.blue },
      },
      {
        id: 'ma50',
        name: 'MA50',
        type: 'line',
        data: (showMa && !isWave && ma50.length) ? ma50 : [],
        showSymbol: false,
        lineStyle: { width: 1.5, color: t.orange },
      },
      {
        id: 'volume',
        name: 'Volume',
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: vols,
        large: true,
        tooltip: { show: false },
      },
    ],
  };
}

function colorMixSafe(preferred, fallback) {
  return preferred || fallback;
}

function applyVisibility() {
  paint(false);
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

  const w = Math.max(container.clientWidth || 0, 320);
  const h = Math.max(container.clientHeight || 0, 280);
  chart = echarts.init(container, null, {
    renderer: 'canvas',
    width: w,
    height: h,
  });

  chart.on('datazoom', () => { userZoomed = true; });

  resizeObserver = new ResizeObserver(() => {
    if (!chart || !chartHost) return;
    if (chartHost.clientWidth <= 0 || chartHost.clientHeight <= 0) return;
    try { chart.resize(); } catch { /* ignore */ }
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
  document.querySelectorAll('.chart-style-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.chartStyle === next);
  });
  paint(false);
}

export function scheduleFitChart() {
  if (fitRetryTimer) {
    clearTimeout(fitRetryTimer);
    fitRetryTimer = null;
  }
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
    const zoom = defaultDataZoom();
    chart.setOption({ dataZoom: zoom });
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
  } catch { /* ignore */ }
}

export function resetChartZoom() {
  userZoomed = false;
  fitChartToData();
}

export function applyChartTheme(colors) {
  themeColors = colors;
  if (chartHost) rebuildChart(chartHost);
}

export function setChartData(candles, showMA = true, range = '1D', showSR = false) {
  if (!chart || !candles?.length) return;

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

  // Align forming last bar to quote when they agree closely.
  const lastIdx = formatted.length - 1;
  if (lastIdx >= 0 && currentSym) {
    const q = getCachedQuote(currentSym);
    const px = Number(q?.price);
    const bar = formatted[lastIdx];
    if (px > 0 && bar?.close > 0 && !shouldRejectLiveCandleTick(bar.close, px)) {
      const capped = applyLiveCandleTick(bar, px, maxLiveBarRangePct(lastRange));
      if (capped) {
        formatted[lastIdx] = {
          time: bar.time,
          open: capped.open,
          high: capped.high,
          low: capped.low,
          close: capped.close,
          volume: bar.volume || 0,
        };
      }
    }
  }

  lastBars = formatted;
  lastBarCount = formatted.length;
  lastCandle = formatted[lastIdx] ? { ...formatted[lastIdx] } : null;
  lastLiveUpdateAt = 0;
  userZoomed = false;
  paint(true);
  scheduleFitChart();
}

/**
 * Live-update the last candle from a quote tick.
 */
export function updateLastCandleFromQuote(sym, price, opts = {}) {
  if (!chart || !lastCandle || !lastBars.length) return false;
  const want = String(sym || '').toUpperCase();
  const have = String(currentSym || '').toUpperCase();
  if (!want || !have || want !== have) return false;
  const px = Number(price);
  if (!Number.isFinite(px) || px <= 0) return false;

  const anchor = Number(lastCandle.close);
  if (anchor > 0) {
    const maxJump = opts.maxJumpPct ?? LIVE_MAX_JUMP_PCT;
    if (shouldRejectLiveCandleTick(anchor, px, maxJump)) {
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

  const i = lastBars.length - 1;
  lastBars[i] = {
    ...lastBars[i],
    open: next.open,
    high: next.high,
    low: next.low,
    close: next.close,
  };

  try {
    const isWave = chartStyle === 'wave';
    chart.setOption({
      series: [
        {
          id: 'candles',
          data: lastBars.map((b) => [b.open, b.close, b.low, b.high]),
        },
        {
          id: 'wave',
          data: lastBars.map((b) => b.close),
        },
      ],
    });
    if (isWave) applyVisibility();
  } catch {
    return false;
  }
  return true;
}

export function resizeChart() {
  if (!chart || !chartHost) return;
  if (chartHost.clientWidth <= 0) return;
  try {
    chart.resize({
      width: Math.max(chartHost.clientWidth, 320),
      height: Math.max(chartHost.clientHeight || 0, 280),
    });
  } catch { /* ignore */ }
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
  lastBarCount = 0;
  lastBars = [];
  lastCandle = null;
  lastLiveUpdateAt = 0;
  userZoomed = false;
}
