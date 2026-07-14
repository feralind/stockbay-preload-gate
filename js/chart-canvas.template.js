// @ts-check
/**
 * Trade chart — native Canvas engine (no ECharts / Lightweight Charts).
 * ECharts build kept as js/chart-echarts.template.js for reference.
 */
import {
  syncQuoteToPrice, shouldRejectLiveCandleTick, LIVE_CANDLE_MAX_JUMP_PCT,
  candleBarVolFraction, isSimulationMode, getCachedQuote,
} from './api.js';

/** @type {HTMLElement | null} */
let chartHost = null;
/** @type {HTMLCanvasElement | null} */
let canvas = null;
/** @type {CanvasRenderingContext2D | null} */
let ctx = null;
/** @type {HTMLDivElement | null} */
let tipEl = null;
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
/** Visible window into lastBars (inclusive start, exclusive end). */
let viewStart = 0;
let viewEnd = 0;
/** @type {'candle' | 'wave'} */
let chartStyle = 'candle';
let showMa = true;
let showSr = false;
let fitRetryTimer = null;
let fitRaf = 0;
let hoverIndex = -1;
let dpr = 1;
const LIVE_UPDATE_MS = 100;
const LIVE_MAX_JUMP_PCT = LIVE_CANDLE_MAX_JUMP_PCT;
const MIN_VISIBLE_BARS = 36;
const MAX_VISIBLE_BARS = 120;
const PAD = { top: 14, right: 56, bottom: 28, left: 10, vol: 0.2 };
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
  return candleBarVolFraction(rangeBarMinutes(range), 1) * 3.5;
}

function maxHistoricalBarRangePct(range) {
  const key = String(range || '1D').toUpperCase();
  if (key === 'MAX') return 0.45;
  if (LONG_RANGES.has(key)) return 0.28;
  return candleBarVolFraction(rangeBarMinutes(range), 1) * 5.5;
}

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
    ) localLows.push(l);
    if (
      h >= Number(window[i - 1].high) && h >= Number(window[i - 2].high)
      && h >= Number(window[i + 1].high) && h >= Number(window[i + 2].high)
    ) localHighs.push(h);
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
    text: themeColors?.text || getCss('--text') || '#e8eaed',
    border: themeColors?.border || getCss('--glass-stroke') || 'rgba(255,255,255,0.14)',
    blue: themeColors?.blue || getCss('--blue') || '#60a5fa',
    orange: '#f59e0b',
    grid: themeColors?.chartGrid || getCss('--chart-grid') || 'rgba(255,255,255,0.06)',
  };
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

function formatAxisLabel(ts, intraday) {
  const d = new Date(Number(ts) * 1000);
  if (!Number.isFinite(d.getTime())) return '';
  if (intraday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (lastRange === 'MAX' || lastRange === '5Y') {
    return d.toLocaleDateString([], { month: 'short', year: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatTipTime(ts) {
  const d = new Date(Number(ts) * 1000);
  if (!Number.isFinite(d.getTime())) return '';
  if (isIntradayRange(lastRange)) {
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function calcMA(data, period) {
  const out = new Array(data.length).fill(null);
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += data[i - j].close;
    out[i] = sum / period;
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

function clampView() {
  const n = lastBars.length;
  if (n <= 0) {
    viewStart = 0;
    viewEnd = 0;
    return;
  }
  if (viewEnd <= viewStart) {
    viewEnd = n;
    viewStart = Math.max(0, n - targetVisibleBars());
  }
  viewStart = Math.max(0, Math.min(viewStart, n - 1));
  viewEnd = Math.max(viewStart + 1, Math.min(n, viewEnd));
}

function visibleBars() {
  clampView();
  return lastBars.slice(viewStart, viewEnd);
}

function plotRect(w, h) {
  const priceBottom = h * (1 - PAD.vol);
  return {
    x: PAD.left,
    y: PAD.top,
    w: Math.max(10, w - PAD.left - PAD.right),
    h: Math.max(10, priceBottom - PAD.top),
    volY: priceBottom + 6,
    volH: Math.max(8, h - priceBottom - PAD.bottom - 6),
  };
}

function paint() {
  if (!canvas || !ctx || !chartHost) return;
  const cssW = Math.max(chartHost.clientWidth, 320);
  const cssH = Math.max(chartHost.clientHeight, 280);
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr)) {
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const bars = visibleBars();
  if (!bars.length) {
    hideTip();
    return;
  }

  const t = theme();
  const rect = plotRect(cssW, cssH);
  let minP = Infinity;
  let maxP = -Infinity;
  let maxVol = 1;
  for (const b of bars) {
    minP = Math.min(minP, b.low);
    maxP = Math.max(maxP, b.high);
    maxVol = Math.max(maxVol, b.volume || 0);
  }
  if (!(maxP > minP)) {
    minP *= 0.99;
    maxP *= 1.01;
  }
  const pad = (maxP - minP) * 0.04;
  minP = Math.max(0, minP - pad);
  maxP += pad;

  const yOf = (price) => rect.y + ((maxP - price) / (maxP - minP)) * rect.h;
  const slot = rect.w / bars.length;
  const bodyW = Math.max(1, Math.min(10, slot * 0.62));

  // Grid + price labels (right)
  ctx.strokeStyle = t.grid;
  ctx.fillStyle = t.muted;
  ctx.font = '10px Inter, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const price = maxP - ((maxP - minP) * i) / ticks;
    const y = yOf(price);
    ctx.beginPath();
    ctx.moveTo(rect.x, y);
    ctx.lineTo(rect.x + rect.w, y);
    ctx.stroke();
    ctx.fillText(formatPrice(price), rect.x + rect.w + 8, y);
  }

  // Volume
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const x = rect.x + i * slot + slot / 2;
    const vh = ((b.volume || 0) / maxVol) * rect.volH;
    ctx.fillStyle = b.close >= b.open ? `${t.green}55` : `${t.red}55`;
    ctx.fillRect(x - bodyW / 2, rect.volY + rect.volH - vh, bodyW, vh);
  }

  // MA / wave / candles
  const globalSlice = lastBars.slice(viewStart, viewEnd);
  if (chartStyle === 'wave') {
    const grad = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
    grad.addColorStop(0, `${t.green}55`);
    grad.addColorStop(1, `${t.green}05`);
    ctx.beginPath();
    for (let i = 0; i < bars.length; i++) {
      const x = rect.x + i * slot + slot / 2;
      const y = yOf(bars[i].close);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = t.green;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineTo(rect.x + (bars.length - 1) * slot + slot / 2, rect.y + rect.h);
    ctx.lineTo(rect.x + slot / 2, rect.y + rect.h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
  } else {
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      const x = rect.x + i * slot + slot / 2;
      const up = b.close >= b.open;
      const color = up ? t.green : t.red;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, yOf(b.high));
      ctx.lineTo(x, yOf(b.low));
      ctx.stroke();
      const y1 = yOf(Math.max(b.open, b.close));
      const y2 = yOf(Math.min(b.open, b.close));
      const bh = Math.max(1, y2 - y1);
      ctx.fillRect(x - bodyW / 2, y1, bodyW, bh);
    }

    if (showMa && lastBars.length >= 20) {
      const ma20 = calcMA(lastBars, 20).slice(viewStart, viewEnd);
      const ma50 = lastBars.length >= 50 ? calcMA(lastBars, 50).slice(viewStart, viewEnd) : null;
      drawLine(ma20, t.blue, rect, slot, yOf);
      if (ma50) drawLine(ma50, t.orange, rect, slot, yOf);
    }

    if (showSr) {
      const { support, resistance } = findSupportResistance(lastBars);
      ctx.setLineDash([5, 4]);
      if (support > 0) {
        const y = yOf(support);
        ctx.strokeStyle = t.green;
        ctx.beginPath();
        ctx.moveTo(rect.x, y);
        ctx.lineTo(rect.x + rect.w, y);
        ctx.stroke();
        ctx.fillStyle = t.green;
        ctx.fillText('S', rect.x + 4, y - 6);
      }
      if (resistance > 0) {
        const y = yOf(resistance);
        ctx.strokeStyle = t.red;
        ctx.beginPath();
        ctx.moveTo(rect.x, y);
        ctx.lineTo(rect.x + rect.w, y);
        ctx.stroke();
        ctx.fillStyle = t.red;
        ctx.fillText('R', rect.x + 4, y - 6);
      }
      ctx.setLineDash([]);
    }
  }

  // Time labels
  ctx.fillStyle = t.muted;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const step = Math.max(1, Math.floor(bars.length / 6));
  for (let i = 0; i < bars.length; i += step) {
    const x = rect.x + i * slot + slot / 2;
    ctx.fillText(formatAxisLabel(bars[i].time, isIntradayRange(lastRange)), x, cssH - 18);
  }

  // Hover crosshair
  if (hoverIndex >= viewStart && hoverIndex < viewEnd) {
    const i = hoverIndex - viewStart;
    const x = rect.x + i * slot + slot / 2;
    const b = globalSlice[i];
    ctx.strokeStyle = `${t.blue}66`;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, rect.y);
    ctx.lineTo(x, rect.y + rect.h + rect.volH + 6);
    ctx.stroke();
    ctx.setLineDash([]);
    const y = yOf(b.close);
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = b.close >= b.open ? t.green : t.red;
    ctx.fill();
  }

  void globalSlice;
}

function drawLine(values, color, rect, slot, yOf) {
  if (!ctx) return;
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!(v > 0)) {
      started = false;
      continue;
    }
    const x = rect.x + i * slot + slot / 2;
    const y = yOf(v);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function hideTip() {
  if (tipEl) tipEl.style.display = 'none';
}

function showTip(barIndex, clientX, clientY) {
  if (!tipEl || !chartHost || !lastBars[barIndex]) {
    hideTip();
    return;
  }
  const bar = lastBars[barIndex];
  const t = theme();
  const up = bar.close >= bar.open;
  const tone = up ? t.green : t.red;
  const chg = bar.open > 0 ? ((bar.close - bar.open) / bar.open) * 100 : 0;
  const sym = String(currentSym || '').toUpperCase() || '—';
  tipEl.innerHTML = `
    <div class="sw-tip-sym">${sym}</div>
    <div class="sw-tip-time">${formatTipTime(bar.time)}</div>
    <div class="sw-tip-grid">
      <span>O</span><b>${formatPrice(bar.open)}</b>
      <span>H</span><b>${formatPrice(bar.high)}</b>
      <span>L</span><b>${formatPrice(bar.low)}</b>
      <span>C</span><b style="color:${tone}">${formatPrice(bar.close)}</b>
      <span>Chg</span><b style="color:${tone}">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</b>
      <span>Vol</span><b>${formatVolume(bar.volume)}</b>
    </div>`;
  tipEl.style.display = 'block';
  const host = chartHost.getBoundingClientRect();
  const tipW = tipEl.offsetWidth || 150;
  const tipH = tipEl.offsetHeight || 120;
  let left = clientX - host.left + 14;
  let top = clientY - host.top + 14;
  if (left + tipW > host.width - 8) left = clientX - host.left - tipW - 14;
  if (top + tipH > host.height - 8) top = clientY - host.top - tipH - 10;
  tipEl.style.left = `${Math.max(8, left)}px`;
  tipEl.style.top = `${Math.max(8, top)}px`;
}

function indexFromEvent(ev) {
  if (!canvas || !chartHost || !lastBars.length) return -1;
  const rect = canvas.getBoundingClientRect();
  const x = ev.clientX - rect.left;
  const cssW = rect.width;
  const cssH = rect.height;
  const plot = plotRect(cssW, cssH);
  if (x < plot.x || x > plot.x + plot.w) return -1;
  const bars = visibleBars();
  if (!bars.length) return -1;
  const slot = plot.w / bars.length;
  const i = Math.max(0, Math.min(bars.length - 1, Math.floor((x - plot.x) / slot)));
  return viewStart + i;
}

function onPointerMove(ev) {
  const idx = indexFromEvent(ev);
  hoverIndex = idx;
  paint();
  if (idx >= 0) showTip(idx, ev.clientX, ev.clientY);
  else hideTip();
}

function onPointerLeave() {
  hoverIndex = -1;
  hideTip();
  paint();
}

function onWheel(ev) {
  if (!lastBars.length) return;
  ev.preventDefault();
  const n = lastBars.length;
  const span = Math.max(8, viewEnd - viewStart);
  const factor = ev.deltaY < 0 ? 0.82 : 1.22;
  const nextSpan = Math.min(n, Math.max(12, Math.round(span * factor)));
  const center = (viewStart + viewEnd) / 2;
  let from = Math.round(center - nextSpan / 2);
  let to = from + nextSpan;
  if (from < 0) {
    to -= from;
    from = 0;
  }
  if (to > n) {
    from -= to - n;
    to = n;
    from = Math.max(0, from);
  }
  viewStart = from;
  viewEnd = to;
  userZoomed = true;
  paint();
}

function mountShell(container) {
  container.innerHTML = '';
  container.classList.add('sw-canvas-chart');
  canvas = document.createElement('canvas');
  canvas.className = 'sw-chart-canvas';
  tipEl = document.createElement('div');
  tipEl.className = 'sw-chart-tooltip sw-canvas-tip';
  tipEl.style.display = 'none';
  container.appendChild(canvas);
  container.appendChild(tipEl);
  ctx = canvas.getContext('2d');
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });
}

export async function waitForChartLib() {
  return true;
}

export async function initChart(container) {
  if (!container) return false;
  destroyChart();
  chartHost = container;
  mountShell(container);
  try {
    const saved = localStorage.getItem(CHART_STYLE_KEY);
    if (saved === 'wave' || saved === 'candle') chartStyle = saved;
  } catch { /* ignore */ }

  resizeObserver = new ResizeObserver(() => {
    if (!chartHost || chartHost.clientWidth <= 0) return;
    paint();
  });
  resizeObserver.observe(container);
  paint();
  return true;
}

export function getChartStyle() {
  return chartStyle;
}

/** @param {'candle' | 'wave'} style */
export function setChartStyle(style) {
  chartStyle = style === 'wave' ? 'wave' : 'candle';
  try { localStorage.setItem(CHART_STYLE_KEY, chartStyle); } catch { /* ignore */ }
  document.querySelectorAll('.chart-style-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.chartStyle === chartStyle);
  });
  paint();
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
    }, 100);
  });
}

export function fitChartToData() {
  if (!lastBars.length) return;
  const want = targetVisibleBars();
  viewEnd = lastBars.length;
  viewStart = Math.max(0, viewEnd - want);
  userZoomed = false;
  paint();
}

export function zoomChart(direction) {
  if (!lastBars.length) return;
  const n = lastBars.length;
  const span = Math.max(8, viewEnd - viewStart);
  const nextSpan = Math.min(n, Math.max(12, Math.round(span * (direction > 0 ? 0.82 : 1.22))));
  const center = (viewStart + viewEnd) / 2;
  let from = Math.round(center - nextSpan / 2);
  let to = from + nextSpan;
  if (from < 0) { to -= from; from = 0; }
  if (to > n) { from = Math.max(0, n - nextSpan); to = n; }
  viewStart = from;
  viewEnd = to;
  userZoomed = true;
  paint();
}

export function resetChartZoom() {
  userZoomed = false;
  fitChartToData();
}

export function applyChartTheme(colors) {
  themeColors = colors;
  paint();
}

export function setChartData(candles, showMA = true, range = '1D', showSR = false) {
  if (!canvas || !candles?.length) return;
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
  hoverIndex = -1;
  hideTip();
  fitChartToData();
  scheduleFitChart();
}

export function updateLastCandleFromQuote(sym, price, opts = {}) {
  if (!canvas || !lastCandle || !lastBars.length) return false;
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

  const next = applyLiveCandleTick(lastCandle, px, opts.maxBarRangePct ?? maxLiveBarRangePct(lastRange));
  if (!next) return false;
  lastCandle.open = next.open;
  lastCandle.high = next.high;
  lastCandle.low = next.low;
  lastCandle.close = next.close;
  const i = lastBars.length - 1;
  lastBars[i] = { ...lastBars[i], ...next };
  paint();
  return true;
}

export function resizeChart() {
  paint();
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
  if (canvas) {
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerleave', onPointerLeave);
    canvas.removeEventListener('wheel', onWheel);
  }
  if (chartHost) {
    chartHost.classList.remove('sw-canvas-chart');
    chartHost.innerHTML = '';
  }
  canvas = null;
  ctx = null;
  tipEl = null;
  chartHost = null;
  lastBarCount = 0;
  lastBars = [];
  lastCandle = null;
  lastLiveUpdateAt = 0;
  userZoomed = false;
  hoverIndex = -1;
}
