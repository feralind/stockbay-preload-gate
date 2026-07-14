// @ts-check
import { CONFIG } from './config.js';

/** Map our symbols to Yahoo Finance tickers */
export function toYahooSymbol(sym) {
  return sym.replace('.', '-');
}

export function isLocalServer() {
  const h = String(location.hostname || '').toLowerCase();
  if (h === '127.0.0.1' || h === 'localhost' || h === '[::1]' || h === '::1') return true;
  // Private LAN / link-local so friends on the same Wi‑Fi still use /api Yahoo proxy
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (h.endsWith('.local')) return true;
  return false;
}

const YAHOO_CANDLE_RANGES = {
  '1D': { interval: '5m', range: '1d' },
  '5D': { interval: '15m', range: '5d' },
  '1M': { interval: '60m', range: '1mo' },
  '6M': { interval: '1d', range: '6mo' },
  YTD: { interval: '1d', range: 'ytd' },
  '1Y': { interval: '1d', range: '1y' },
  '5Y': { interval: '1d', range: '5y' },
  MAX: { interval: '1mo', range: 'max' },
  '1': { interval: '1m', range: '1d' },
  '5': { interval: '5m', range: '5d' },
  '15': { interval: '15m', range: '5d' },
  '60': { interval: '1h', range: '1mo' },
  D: { interval: '1d', range: '6mo' },
};

const FINNHUB_CANDLE_RANGES = {
  '1D': { resolution: '5', seconds: 86400 },
  '5D': { resolution: '15', seconds: 5 * 86400 },
  '1M': { resolution: '60', seconds: 32 * 86400 },
  '6M': { resolution: 'D', seconds: 190 * 86400 },
  YTD: { resolution: 'D', ytd: true },
  '1Y': { resolution: 'D', seconds: 370 * 86400 },
  '5Y': { resolution: 'D', seconds: 5 * 370 * 86400 },
  MAX: { resolution: 'W', seconds: 25 * 370 * 86400 },
  '1': { resolution: '1', seconds: 86400 },
  '5': { resolution: '5', seconds: 5 * 86400 },
  '15': { resolution: '15', seconds: 5 * 86400 },
  '60': { resolution: '60', seconds: 32 * 86400 },
  D: { resolution: 'D', seconds: 190 * 86400 },
};

export async function proxyQuote(sym) {
  if (!isLocalServer()) return null;
  try {
    const res = await fetch(`/api/quote?symbol=${encodeURIComponent(sym)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export async function proxyCandles(sym, range = '1D', count = 120) {
  if (!isLocalServer()) return null;
  try {
    const res = await fetch(`/api/candles?symbol=${encodeURIComponent(sym)}&range=${encodeURIComponent(range)}&resolution=${encodeURIComponent(range)}&count=${count}`);
    if (!res.ok) return null;
    const data = await res.json();
    const candles = data.candles || null;
    // Stale/buggy local proxies used to return 5m bars for every TF — reject those.
    if (!candlesLookPlausibleForRange(candles, range)) return null;
    return candles;
  } catch { return null; }
}

/**
 * Reject candle payloads that clearly don't span the requested range
 * (e.g. 2 days of 5m bars labeled as 6M / MAX).
 */
export function candlesLookPlausibleForRange(candles, range) {
  if (!Array.isArray(candles) || candles.length < 2) return false;
  const times = candles.map((c) => Number(c?.time)).filter((t) => Number.isFinite(t) && t > 0);
  if (times.length < 2) return false;
  const first = Math.min(...times);
  const last = Math.max(...times);
  const span = last - first;
  const key = String(range || '1D').toUpperCase();
  /** Minimum acceptable span (seconds) per UI range key. */
  const minSpan = {
    '1D': 30 * 60,
    '5D': 1.5 * 86400,
    '1M': 10 * 86400,
    '6M': 60 * 86400,
    YTD: 14 * 86400,
    '1Y': 180 * 86400,
    '5Y': 600 * 86400,
    MAX: 365 * 86400,
    '1': 20 * 60,
    '5': 1 * 86400,
    '15': 1 * 86400,
    '60': 5 * 86400,
    D: 60 * 86400,
  }[key];
  if (minSpan != null && span < minSpan) return false;
  return true;
}

async function fetchYahooCandlesDirect(sym, range = '1D', count = 120) {
  const cfg = YAHOO_CANDLE_RANGES[String(range || '1D').toUpperCase()] || YAHOO_CANDLE_RANGES['1D'];
  const ysym = toYahooSymbol(sym);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ysym}?interval=${cfg.interval}&range=${cfg.range}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const r = data?.chart?.result?.[0];
    const q = r?.indicators?.quote?.[0];
    if (!r?.timestamp?.length || !q) return null;
    const candles = r.timestamp.map((t, i) => ({
      time: t,
      open: q.open?.[i],
      high: q.high?.[i],
      low: q.low?.[i],
      close: q.close?.[i],
      volume: q.volume?.[i] || 0,
    })).filter(isValidCandle);
    return count > 0 ? candles.slice(-count) : candles;
  } catch { return null; }
}

function isValidCandle(c) {
  return [c.open, c.high, c.low, c.close].every(Number.isFinite);
}

export async function fetchYahooDirect(sym) {
  const ysym = toYahooSymbol(sym);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ysym}?interval=1d&range=5d`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const r = data?.chart?.result?.[0];
    const m = r?.meta;
    if (!m?.regularMarketPrice) return null;
    return {
      sym: sym.toUpperCase(),
      price: m.regularMarketPrice,
      open: m.regularMarketOpen ?? m.regularMarketPrice,
      high: m.regularMarketDayHigh ?? m.regularMarketPrice,
      low: m.regularMarketDayLow ?? m.regularMarketPrice,
      prevClose: m.chartPreviousClose ?? m.previousClose ?? m.regularMarketPrice,
      change: m.regularMarketPrice - (m.chartPreviousClose ?? m.previousClose ?? m.regularMarketPrice),
      changePct: ((m.regularMarketPrice / (m.chartPreviousClose ?? m.previousClose ?? m.regularMarketPrice)) - 1) * 100,
      updated: Date.now(),
      simulated: false,
      source: 'yahoo',
    };
  } catch { return null; }
}

async function finnhubQuote(sym) {
  if (!CONFIG.FINNHUB_API_KEY || CONFIG.FINNHUB_API_KEY === 'YOUR_FINNHUB_API_KEY') return null;
  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${sym}&token=${CONFIG.FINNHUB_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.c || data.c <= 0) return null;
    return {
      sym: sym.toUpperCase(),
      price: data.c,
      open: data.o || data.c,
      high: data.h || data.c,
      low: data.l || data.c,
      prevClose: data.pc || data.c,
      change: data.d ?? 0,
      changePct: data.dp ?? 0,
      updated: Date.now(),
      simulated: false,
      source: 'finnhub',
    };
  } catch { return null; }
}

/** Try local proxy → Yahoo direct → Finnhub */
export async function fetchFromProviders(sym) {
  sym = sym.toUpperCase();

  const proxy = await proxyQuote(sym);
  if (proxy?.price > 0) return { ...proxy, sym, simulated: false };

  const yahoo = await fetchYahooDirect(sym);
  if (yahoo?.price > 0) return yahoo;

  const finnhub = await finnhubQuote(sym);
  if (finnhub?.price > 0) return finnhub;

  return null;
}

export async function fetchCandlesFromProviders(sym, range = '1D', count = 120) {
  const proxy = await proxyCandles(sym, range, count);
  if (proxy?.length) return proxy;

  const yahoo = await fetchYahooCandlesDirect(sym, range, count);
  if (yahoo?.length && candlesLookPlausibleForRange(yahoo, range)) return yahoo;

  // Finnhub candles fallback
  if (CONFIG.FINNHUB_API_KEY && CONFIG.FINNHUB_API_KEY !== 'YOUR_FINNHUB_API_KEY') {
    const to = Math.floor(Date.now() / 1000);
    const cfg = FINNHUB_CANDLE_RANGES[String(range || '1D').toUpperCase()] || FINNHUB_CANDLE_RANGES['1D'];
    const from = cfg.ytd
      ? Math.floor(new Date(new Date().getFullYear(), 0, 1).getTime() / 1000)
      : to - cfg.seconds;
    try {
      const url = `https://finnhub.io/api/v1/stock/candle?symbol=${sym}&resolution=${cfg.resolution}&from=${from}&to=${to}&token=${CONFIG.FINNHUB_API_KEY}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data?.s === 'ok' && data.t?.length) {
          const candles = data.t.map((t, i) => ({
            time: t, open: data.o[i], high: data.h[i], low: data.l[i], close: data.c[i], volume: data.v[i],
          })).filter(isValidCandle);
          const sliced = count > 0 ? candles.slice(-count) : candles;
          if (candlesLookPlausibleForRange(sliced, range)) return sliced;
        }
      }
    } catch { /* fall through */ }
  }
  return null;
}

export function getProviderLabel() {
  if (isLocalServer()) return 'Yahoo Finance (via local server)';
  return 'Yahoo + Finnhub';
}
