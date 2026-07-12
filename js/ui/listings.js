// @ts-check
/**
 * Deal desk listings, watchlist, price alerts, and Hot listings rotation.
 */

import {
  getQuoteCache, getCachedQuote, fillMissingQuotes, seedQuote, isLiveAnchoredQuote,
} from '../api.js';
import { CONFIG } from '../config.js';
import { generateListingHint } from '../events.js';
import { logoMarkHtml } from '../logos.js';
import { toast } from '../notify.js';
import { trapFocus } from '../overlays.js';
import {
  getSymbolName, getSymbolSector, getRandomSymbols, searchSymbols, getSymbolMeta, ALL_SYMBOLS, getSymbolCount,
} from '../symbols.js';
import { getWalkthroughSuggestMeta } from '../onboarding-walkthrough.js';
import { getSelectedSym, setSelectedSym } from './selection.js';
import { escapeHtml, quoteForDisplay } from './shared.js';

let watchlist = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'AMD'];
let listingsVisibleCount = CONFIG.LISTING_PAGE_SIZE;
let listingsSort = 'deals';

/** Hot listings sliding-window rotation */
let hotRotationOffset = 0;
let hotRotationTimer = null;
let hotHoverPaused = false;
let hotResumeTimer = null;
let hotPoolCache = [];
let hotRotationGetState = null;
let hotRotationOnTick = null;
let hotHoverBound = false;

const listingsUi = {
  onOpenTrade: null,
  switchView: null,
  renderAll: null,
  showChartTab: null,
  resizeChart: null,
};

export function configureListingsUi({ onOpenTrade, switchView, renderAll, showChartTab, resizeChart } = {}) {
  listingsUi.onOpenTrade = typeof onOpenTrade === 'function' ? onOpenTrade : null;
  listingsUi.switchView = typeof switchView === 'function' ? switchView : null;
  listingsUi.renderAll = typeof renderAll === 'function' ? renderAll : null;
  listingsUi.showChartTab = typeof showChartTab === 'function' ? showChartTab : null;
  listingsUi.resizeChart = typeof resizeChart === 'function' ? resizeChart : null;
}

export function getWatchlist() { return watchlist; }

let watchlistAlerts = {};
const ALERT_HISTORY_KEY = 'stockway_alert_history_v1';
let alertHistory = [];

export function getWatchlistAlerts() { return watchlistAlerts; }
export function setWatchlistAlert(sym, alert) {
  sym = sym.toUpperCase();
  if (!alert?.above && !alert?.below) delete watchlistAlerts[sym];
  else watchlistAlerts[sym] = { above: alert.above || null, below: alert.below || null };
}
export function loadWatchlistAlerts(data) { watchlistAlerts = data || {}; }

export function getAlertHistory() { return alertHistory.slice(0, 30); }

export function loadAlertHistory(data) {
  if (!Array.isArray(data)) {
    try {
      const raw = localStorage.getItem(ALERT_HISTORY_KEY);
      data = raw ? JSON.parse(raw) : [];
    } catch {
      data = [];
    }
  }
  alertHistory = (data || []).filter((e) => e && typeof e.sym === 'string').slice(0, 30);
}

export function recordAlertTrigger({ sym, direction, level, price }) {
  const entry = {
    id: `al_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    sym: String(sym || '').toUpperCase(),
    direction: direction === 'below' ? 'below' : 'above',
    level: Number(level) || 0,
    price: Number(price) || 0,
    at: Date.now(),
  };
  alertHistory.unshift(entry);
  if (alertHistory.length > 30) alertHistory.length = 30;
  try { localStorage.setItem(ALERT_HISTORY_KEY, JSON.stringify(alertHistory)); } catch { /* ignore */ }
  return entry;
}

export function renderTriggeredAlerts() {
  const el = document.getElementById('triggered-alerts-list');
  if (!el) return;
  const rows = getAlertHistory();
  if (!rows.length) {
    el.innerHTML = '<div class="empty">No triggered alerts yet</div>';
    return;
  }
  el.innerHTML = rows.slice(0, 12).map((a) => {
    const when = a.at ? new Date(a.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    const dir = a.direction === 'below' ? '↓' : '↑';
    return `<div class="alert-history-row">
      <strong>${escapeHtml(a.sym)}</strong>
      <span class="muted-text">${dir} $${Number(a.level).toFixed(2)} → $${Number(a.price).toFixed(2)}</span>
      <span class="muted-text">${when}</span>
    </div>`;
  }).join('');
}

export function openPriceAlert(sym, state) {
  const overlay = document.getElementById('price-alert-overlay');
  if (!overlay) return;
  sym = sym.toUpperCase();
  const q = getCachedQuote(sym);
  const cur = watchlistAlerts[sym] || {};
  document.getElementById('price-alert-title').textContent = `Price alert · ${sym}`;
  document.getElementById('price-alert-sub').textContent = q
    ? `Last $${q.price.toFixed(2)} — notify when price crosses your levels`
    : 'Set notify-above / notify-below prices';
  const aboveInp = document.getElementById('price-alert-above');
  const belowInp = document.getElementById('price-alert-below');
  aboveInp.value = cur.above ?? '';
  belowInp.value = cur.below ?? '';
  overlay.classList.remove('hidden');
  trapFocus(overlay);
  aboveInp.focus();

  const close = () => overlay.classList.add('hidden');
  document.getElementById('price-alert-cancel').onclick = close;
  document.getElementById('price-alert-save').onclick = () => {
    const above = parseFloat(aboveInp.value);
    const below = parseFloat(belowInp.value);
    const alert = {
      above: Number.isFinite(above) && above > 0 ? above : null,
      below: Number.isFinite(below) && below > 0 ? below : null,
    };
    setWatchlistAlert(sym, alert);
    if (alert.above || alert.below) {
      state.stats = state.stats || {};
      state.stats.alertsSet = (state.stats.alertsSet || 0) + 1;
    }
    close();
    toast(`Alerts saved for ${sym}`, { type: 'success' });
    listingsUi.renderAll?.(state);
    state.onSaveGame?.();
  };
  document.getElementById('price-alert-clear').onclick = () => {
    setWatchlistAlert(sym, null);
    close();
    toast(`Alerts cleared for ${sym}`, { type: 'info' });
    listingsUi.renderAll?.(state);
    state.onSaveGame?.();
  };
}

export function checkWatchlistAlerts(onToast) {
  const fired = [];
  for (const [sym, a] of Object.entries(watchlistAlerts)) {
    const q = getCachedQuote(sym);
    if (!q) continue;
    if (a.above != null) {
      if (q.price >= a.above) {
        if (!a._firedAbove) {
          onToast?.(`${sym} crossed above $${a.above.toFixed(2)} (now $${q.price.toFixed(2)})`, 'success');
          recordAlertTrigger({ sym, direction: 'above', level: a.above, price: q.price });
          a._firedAbove = true;
          fired.push(sym);
        }
      } else a._firedAbove = false;
    }
    if (a.below != null) {
      if (q.price <= a.below) {
        if (!a._firedBelow) {
          onToast?.(`${sym} crossed below $${a.below.toFixed(2)} (now $${q.price.toFixed(2)})`, 'warn');
          recordAlertTrigger({ sym, direction: 'below', level: a.below, price: q.price });
          a._firedBelow = true;
          fired.push(sym);
        }
      } else a._firedBelow = false;
    }
  }
  if (fired.length) renderTriggeredAlerts();
  return fired;
}

export function addToWatchlist(sym) {
  sym = sym.toUpperCase();
  if (!watchlist.includes(sym)) watchlist.unshift(sym);
  if (watchlist.length > 12) watchlist.pop();
}

export function removeFromWatchlist(sym) {
  sym = sym.toUpperCase();
  watchlist = watchlist.filter((s) => s !== sym);
  if (watchlistAlerts[sym]) delete watchlistAlerts[sym];
}

function feedDot(q) {
  if (!q) return '';
  const live = q.simulated === false;
  return `<span class="feed-dot ${live ? 'live' : 'sim'}" title="${live ? 'Live-anchored' : 'Simulated drift'}"></span>`;
}

export function renderWatchlist(state) {
  fillMissingQuotes(watchlist);
  const el = document.getElementById('watchlist');
  if (!el) return;

  const existing = [...el.querySelectorAll('.watch-item')].map((n) => n.dataset.sym);
  const sameStructure = existing.length === watchlist.length && watchlist.every((s, i) => existing[i] === s);

  if (sameStructure && existing.length) {
    watchlist.forEach((sym) => {
      const item = el.querySelector(`.watch-item[data-sym="${sym}"]`);
      if (!item) return;
      const q = getCachedQuote(sym);
      const price = q?.price?.toFixed(2) || '—';
      const chg = q?.changePct || 0;
      const cls = chg >= 0 ? 'up' : 'down';
      item.classList.toggle('active', getSelectedSym() === sym);
      const chgEl = item.querySelector('.watch-chg');
      if (chgEl) {
        chgEl.textContent = `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`;
        chgEl.className = `watch-chg ${cls}`;
      }
      const priceEl = item.querySelector('.watch-price');
      if (priceEl) priceEl.textContent = `$${price}`;
      const feed = item.querySelector('.feed-dot');
      if (feed && q) {
        const live = q.simulated === false;
        feed.className = `feed-dot ${live ? 'live' : 'sim'}`;
        feed.title = live ? 'Live-anchored' : 'Simulated drift';
      }
    });
    return;
  }

  el.innerHTML = watchlist.map(sym => {
    const q = quoteForDisplay(sym);
    const meta = getSymbolMeta(sym);
    const price = q?.price?.toFixed(2) || '—';
    const chg = q?.changePct || 0;
    const cls = chg >= 0 ? 'up' : 'down';
    const alert = watchlistAlerts[sym];
    const alertDot = alert?.above || alert?.below ? '<span class="watch-alert-dot" title="Price alert set"></span>' : '';
    return `
      <div class="watch-item ${getSelectedSym() === sym ? 'active' : ''}" data-sym="${sym}">
        ${logoMarkHtml(sym, { color: meta.color, letter: meta.letter, size: 'sm' })}
        <div class="watch-meta">
          <div class="watch-sym">${sym}${feedDot(q)}${alertDot}</div>
          <div class="watch-chg ${cls}">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</div>
        </div>
        <div class="watch-price">$${price}</div>
        <div class="watch-actions">
          <button type="button" class="watch-alert-btn" data-sym="${sym}" title="Set price alert" aria-label="Alert ${sym}">⌁</button>
          <button type="button" class="watch-remove-btn" data-sym="${sym}" title="Remove from watchlist" aria-label="Remove ${sym}">×</button>
        </div>
      </div>`;
  }).join('') || '<div class="empty">Add symbols with +</div>';

  el.querySelectorAll('.watch-item').forEach(item => {
    item.onclick = () => {
      const sym = setSelectedSym(item.dataset.sym);
      state.onSelectSymbol?.(sym);
      listingsUi.switchView?.('trade');
      listingsUi.showChartTab?.('chart');
      listingsUi.renderAll?.(state);
      setTimeout(() => listingsUi.resizeChart?.(), 100);
    };
  });
  el.querySelectorAll('.watch-alert-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      openPriceAlert(btn.dataset.sym, state);
    };
  });
  el.querySelectorAll('.watch-remove-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      state.onRemoveWatchlist?.(btn.dataset.sym);
    };
  });
}

export function generateListings(state) {
  fillMissingQuotes();
  const cache = getQuoteCache();
  const hasScanner = state.perks.includes('scanner');
  const pool = hasScanner ? CONFIG.LISTING_POOL_SIZE : Math.max(40, Math.floor(CONFIG.LISTING_POOL_SIZE * 0.65));
  const syms = getRandomSymbols(pool);
  const hasInsider = state.perks.includes('insider');
  return syms.map((sym, i) => makeListing(sym, i, cache, hasInsider, hasScanner));
}

/** Re-sync listing market/ask display from quote cache without reshuffling the deal feed. */
export function syncListingsFromQuotes(state, symbols = null, { rescaleAsks = false } = {}) {
  const filter = symbols?.length
    ? new Set(symbols.map(s => String(s).toUpperCase()))
    : null;
  const apply = (l) => {
    if (!l?.sym) return;
    const sym = String(l.sym).toUpperCase();
    if (filter && !filter.has(sym)) return;
    const q = quoteForDisplay(sym);
    if (!(q?.price > 0)) return;
    const prevMkt = l.marketPrice > 0 ? l.marketPrice : q.price;
    const jumped = prevMkt > 0 && Math.abs(q.price - prevMkt) / Math.max(q.price, prevMkt) > 0.08;
    l.marketPrice = q.price;
    l.changePct = q.changePct || 0;
    if (l.isMarket) {
      l.price = q.price;
      l.trueValue = q.price;
      return;
    }
    // Only re-scale frozen asks on explicit refresh or a clear re-anchor jump
    if ((rescaleAsks || jumped) && prevMkt > 0 && l.price > 0) {
      const ratio = l.price / prevMkt;
      if (ratio > 0.5 && ratio < 1.25) {
        l.price = parseFloat((q.price * ratio).toFixed(2));
      }
      if (l.trueValue > 0) {
        const tvRatio = l.trueValue / prevMkt;
        if (tvRatio > 0.5 && tvRatio < 1.25) {
          l.trueValue = q.price * tvRatio;
        }
      }
      const hasScanner = state?.perks?.includes('scanner');
      const dealThreshold = hasScanner ? 0.06 : 0.09;
      if (l.trueValue > 0) {
        l.isDeal = (l.trueValue - l.price) / l.trueValue > dealThreshold;
      }
    }
  };
  (state.listings || []).forEach(apply);
}

/** Symbols currently shown on the Deal desk (visible page of deals or directory). */
export function getVisibleListingSymbols(state) {
  const sorted = sortListingRows(getFullListingRows(state), listingsSort);
  return [...new Set(sorted.slice(0, listingsVisibleCount).map(l => l.sym))];
}

/**
 * Viewport set for priority quote fetch: current Deal Desk page + hot pool + open search hits.
 * Hot pool (not just the visible 5) is included so incoming rotation cards are live before they appear.
 */
export function getListingsViewportSymbols(state) {
  const out = [];
  const seen = new Set();
  const push = (raw) => {
    const sym = String(raw || '').toUpperCase();
    if (!sym || seen.has(sym)) return;
    seen.add(sym);
    out.push(sym);
  };
  getVisibleListingSymbols(state).forEach(push);
  getHotListingPoolSymbols(state).forEach(push);
  const searchBox = document.getElementById('listing-search-results');
  if (searchBox && !searchBox.classList.contains('hidden')) {
    searchBox.querySelectorAll('[data-sym]').forEach((el) => push(el.dataset.sym));
  }
  return out;
}

/** Deal-worthiness: ask discount vs true value (same edge that drives GREAT DEAL tags). */
export function listingDealEdge(listing) {
  if (!listing) return 0;
  const tv = Number(listing.trueValue) || Number(listing.marketPrice) || 0;
  const ask = Number(listing.price) || 0;
  if (!(tv > 0) || !(ask > 0)) return listing.isDeal ? 0.01 : 0;
  return (tv - ask) / tv;
}

/** Top deal-score candidates for Hot listings rotation (~15–20). Ranking only — may include seeds. */
export function buildHotListingPool(listings, poolSize = CONFIG.HOT_LISTING_POOL_SIZE || 18) {
  const size = Math.max(CONFIG.MINI_LISTING_COUNT || 5, Number(poolSize) || 18);
  return [...(listings || [])]
    .filter((l) => l?.sym)
    .sort((a, b) => {
      const edge = listingDealEdge(b) - listingDealEdge(a);
      if (edge !== 0) return edge;
      const deal = (b.isDeal ? 1 : 0) - (a.isDeal ? 1 : 0);
      if (deal !== 0) return deal;
      return String(a.sym).localeCompare(String(b.sym));
    })
    .slice(0, size);
}

/**
 * Sliding window across the pool — advances by `offset`, does not reshuffle.
 * If `pinSym` is in the pool, it stays in the visible set even when outside the window.
 */
export function slideHotListingWindow(pool, offset = 0, visibleCount = CONFIG.MINI_LISTING_COUNT || 5, pinSym = null) {
  if (!pool?.length) return [];
  const n = pool.length;
  const count = Math.min(Math.max(1, visibleCount), n);
  const start = ((Number(offset) || 0) % n + n) % n;
  const window = [];
  for (let i = 0; i < count; i++) {
    window.push(pool[(start + i) % n]);
  }
  const pin = pinSym ? String(pinSym).toUpperCase() : null;
  if (!pin) return window;
  const pinListing = pool.find((l) => String(l.sym).toUpperCase() === pin);
  if (!pinListing) return window;
  if (window.some((l) => String(l.sym).toUpperCase() === pin)) return window;
  // Keep pin visible: replace the last window slot so the other seats keep sliding
  const out = window.slice(0, Math.max(0, count - 1));
  out.push(pinListing);
  return out;
}

export function nextHotRotationOffset(offset, poolSize, step = 1) {
  const n = Math.max(0, Number(poolSize) || 0);
  if (n <= 0) return 0;
  return (((Number(offset) || 0) + (Number(step) || 1)) % n + n) % n;
}

export function hotPoolAllLiveAnchored(pool, getQuote = getCachedQuote) {
  if (!pool?.length) return true;
  return pool.every((l) => isLiveAnchoredQuote(getQuote(l?.sym)));
}

/** Ranked prefetch set (may still be seed) — fed into viewport-priority quote refresh. */
export function getHotListingPrefetchCandidates(state) {
  const n = CONFIG.HOT_LISTING_PREFETCH_SIZE || CONFIG.HOT_LISTING_POOL_SIZE || 24;
  return buildHotListingPool(state?.listings, n);
}

/**
 * Live-anchored rotation pool only. Dead/unfetchable tickers (stuck on seed) are
 * dropped so one bad symbol cannot freeze Hot listings or flash a seed price.
 */
export function getHotListingPool(state, getQuote = getCachedQuote) {
  const ranked = getHotListingPrefetchCandidates(state);
  const live = ranked.filter((l) => isLiveAnchoredQuote(getQuote(l?.sym)));
  const size = CONFIG.HOT_LISTING_POOL_SIZE || 18;
  const mini = CONFIG.MINI_LISTING_COUNT || 5;
  // Hold an empty pool until we have at least a full visible window of live quotes
  const pool = live.length >= mini ? live.slice(0, size) : [];
  hotPoolCache = pool;
  return pool;
}

/** Prefetch symbols for viewport refresh (ranked candidates, not only live). */
export function getHotListingPoolSymbols(state) {
  return getHotListingPrefetchCandidates(state).map((l) => String(l.sym).toUpperCase());
}

export function getHotListingVisible(state) {
  const pool = getHotListingPool(state);
  return slideHotListingWindow(
    pool,
    hotRotationOffset,
    CONFIG.MINI_LISTING_COUNT || 5,
    getSelectedSym(),
  );
}

export function getHotRotationOffset() { return hotRotationOffset; }
export function isHotListingRotationPaused() { return hotHoverPaused; }

export function pauseHotListingRotation() {
  hotHoverPaused = true;
  if (hotResumeTimer) {
    clearTimeout(hotResumeTimer);
    hotResumeTimer = null;
  }
}

export function scheduleHotListingResume(delayMs = CONFIG.HOT_LISTING_RESUME_MS || 1750) {
  if (hotResumeTimer) clearTimeout(hotResumeTimer);
  hotResumeTimer = setTimeout(() => {
    hotResumeTimer = null;
    hotHoverPaused = false;
  }, Math.max(0, Number(delayMs) || 0));
}

export function advanceHotListingRotation(state = hotRotationGetState?.()) {
  if (hotHoverPaused) return { advanced: false, reason: 'paused' };
  const pool = getHotListingPool(state);
  const mini = CONFIG.MINI_LISTING_COUNT || 5;
  if (pool.length < mini) {
    return { advanced: false, reason: 'waiting-live', pool };
  }
  if (pool.length <= mini) {
    return { advanced: false, reason: 'pool-too-small', pool };
  }
  // Pool is live-only; still guard in case callers pass a mixed list into helpers.
  if (!hotPoolAllLiveAnchored(pool)) {
    return { advanced: false, reason: 'waiting-live', pool };
  }
  hotRotationOffset = nextHotRotationOffset(hotRotationOffset, pool.length, 1);
  return { advanced: true, offset: hotRotationOffset, pool };
}

function bindHotListingsHover() {
  if (hotHoverBound || typeof document === 'undefined') return;
  const panel = document.querySelector('.right-section.right-hot');
  if (!panel) return;
  hotHoverBound = true;
  panel.addEventListener('mouseenter', () => pauseHotListingRotation());
  panel.addEventListener('mouseleave', () => {
    scheduleHotListingResume(CONFIG.HOT_LISTING_RESUME_MS || 1750);
  });
}

export function stopHotListingsRotation() {
  if (hotRotationTimer) {
    clearInterval(hotRotationTimer);
    hotRotationTimer = null;
  }
  if (hotResumeTimer) {
    clearTimeout(hotResumeTimer);
    hotResumeTimer = null;
  }
  hotHoverPaused = false;
}

/**
 * Start / restart the 15s sliding-window rotator.
 * @param {() => object} getState
 * @param {() => void} onTick — usually renderAll after an advance
 */
export function startHotListingsRotation(getState, onTick) {
  stopHotListingsRotation();
  hotRotationGetState = typeof getState === 'function' ? getState : null;
  hotRotationOnTick = typeof onTick === 'function' ? onTick : null;
  bindHotListingsHover();
  const ms = CONFIG.HOT_LISTING_ROTATION_MS || 15000;
  hotRotationTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    const state = hotRotationGetState?.();
    if (!state) return;
    const result = advanceHotListingRotation(state);
    if (result.advanced) hotRotationOnTick?.();
    else if (result.reason === 'waiting-live' || result.reason === 'pool-too-small') {
      hotRotationOnTick?.({ prefetchOnly: true });
    }
  }, ms);
}

export function resetHotListingRotationForTests() {
  stopHotListingsRotation();
  hotRotationOffset = 0;
  hotHoverPaused = false;
  hotPoolCache = [];
  hotRotationGetState = null;
  hotRotationOnTick = null;
  hotHoverBound = false;
}

/** Call when Deal Desk listings are fully regenerated so the window starts at the top of the new pool. */
export function reseedHotListingRotation() {
  hotRotationOffset = 0;
  hotPoolCache = [];
}

function makeListing(sym, id, cache, hasInsider, hasScanner = false) {
  const q = quoteForDisplay(sym);
  // Scanner: deeper discounts → more GREAT DEAL tags. Without it, asks sit closer to market.
  const discount = hasScanner
    ? (0.85 + Math.random() * 0.22)
    : (0.93 + Math.random() * 0.18);
  const price = parseFloat((q.price * discount).toFixed(2));
  const trueValue = q.price * (0.97 + Math.random() * 0.06);
  const dealThreshold = hasScanner ? 0.06 : 0.09;
  const listing = {
    id, sym, name: getSymbolName(sym), sector: getSymbolSector(sym),
    price, trueValue, marketPrice: q.price, changePct: q.changePct || 0,
    desc: randomFlavor(),
  };
  listing.hint = generateListingHint(listing, hasInsider);
  listing.isDeal = (trueValue - price) / trueValue > dealThreshold;
  return listing;
}

/** Direct market buy listing at current quote (search results) */
export function makeMarketListing(sym) {
  sym = sym.toUpperCase();
  fillMissingQuotes([sym]);
  const q = quoteForDisplay(sym);
  return {
    id: `mkt_${sym}`, sym, name: getSymbolName(sym), sector: getSymbolSector(sym),
    price: q.price, trueValue: q.price, marketPrice: q.price, changePct: q.changePct || 0,
    desc: 'Trade at live market price',
    hint: null, isDeal: false, isMarket: true,
  };
}

export function resetListingsPage() {
  listingsVisibleCount = CONFIG.LISTING_PAGE_SIZE;
}

export function setListingsSort(sort) {
  listingsSort = sort || 'deals';
  listingsVisibleCount = CONFIG.LISTING_PAGE_SIZE;
}

export function getListingsSort() {
  return listingsSort;
}

function makeDirectoryListing(sym) {
  sym = sym.toUpperCase();
  const q = getCachedQuote(sym) || seedQuote(sym);
  return {
    id: `dir_${sym}`, sym, name: getSymbolName(sym), sector: getSymbolSector(sym),
    price: q.price, trueValue: q.price, marketPrice: q.price, changePct: q.changePct || 0,
    desc: `${getSymbolSector(sym)} · full directory`,
    hint: null, isDeal: false, isMarket: true,
  };
}

function sortListingRows(rows, sort) {
  const copy = [...rows];
  let sorted;
  switch (sort) {
    case 'az': sorted = copy.sort((a, b) => a.sym.localeCompare(b.sym)); break;
    case 'za': sorted = copy.sort((a, b) => b.sym.localeCompare(a.sym)); break;
    case 'price-desc': sorted = copy.sort((a, b) => (b.marketPrice || b.price) - (a.marketPrice || a.price)); break;
    case 'price-asc': sorted = copy.sort((a, b) => (a.marketPrice || a.price) - (b.marketPrice || b.price)); break;
    case 'change-desc': sorted = copy.sort((a, b) => (b.changePct || 0) - (a.changePct || 0)); break;
    case 'change-asc': sorted = copy.sort((a, b) => (a.changePct || 0) - (b.changePct || 0)); break;
    case 'sector': sorted = copy.sort((a, b) => (a.sector || '').localeCompare(b.sector || '') || a.sym.localeCompare(b.sym)); break;
    default: sorted = copy.sort((a, b) => (b.isDeal ? 1 : 0) - (a.isDeal ? 1 : 0)); break;
  }
  // Keep walkthrough suggested listing pinned to row 1 so the badge is visible
  const suggest = getWalkthroughSuggestMeta();
  if (suggest?.sym) {
    const idx = sorted.findIndex((l) => String(l.sym).toUpperCase() === suggest.sym);
    if (idx > 0) {
      const [row] = sorted.splice(idx, 1);
      sorted.unshift(row);
    }
  }
  return sorted;
}

function getFullListingRows(state) {
  if (listingsSort === 'deals') return [...state.listings];
  return ALL_SYMBOLS.map(sym => makeDirectoryListing(sym));
}

export function showMoreListings(total) {
  listingsVisibleCount = Math.min(total, listingsVisibleCount + CONFIG.LISTING_PAGE_SIZE);
  return listingsVisibleCount;
}

export function getFullListingsTotal(state) {
  return listingsSort === 'deals' ? (state.listings?.length || 0) : getSymbolCount();
}

function randomFlavor() {
  const flavors = [
    'Seller seems clueless about recent earnings…',
    'Urgent liquidation — must sell today',
    'Inherited portfolio, no idea what this is worth',
    'Divorce sale — priced to move',
    'Yolo trader blew up account',
    'Analyst downgrade ignored by seller',
    'Pre-market panic listing',
    'Whale unloading small lot',
    'Insider tip says this is mispriced…',
    'Earnings play gone wrong — fire sale',
  ];
  return flavors[Math.floor(Math.random() * flavors.length)];
}

function listingSpreadPct(l) {
  if (!l?.marketPrice || l.isMarket) return 0;
  return ((l.marketPrice - l.price) / l.marketPrice) * 100;
}

const sparkSeries = new Map();
function sparkHash(sym) {
  let h = 2166136261;
  const s = String(sym || '').toUpperCase();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Per-symbol deterministic walk — unique shape per ticker (not a shared sine). */
function seedSparkSeries(sym, price, n = 28) {
  const pts = [];
  const base = Math.max(0.01, price || 1);
  const h = sparkHash(sym);
  const bias = lChangeBias(sym);
  // Multi-frequency walk seeded by full symbol hash so HPQ ≠ SPY ≠ DOCU
  let v = base * (1 - bias * 0.02);
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    const n1 = Math.sin((i + 1) * 12.9898 + h * 0.00017) * 43758.5453;
    const n2 = Math.sin((i + 3) * 78.233 + (h >>> 8) * 0.00031) * 12345.678;
    const r1 = (n1 - Math.floor(n1)) * 2 - 1;
    const r2 = (n2 - Math.floor(n2)) * 2 - 1;
    const step = (r1 * 0.012 + r2 * 0.007) + bias * 0.0015;
    v = Math.max(0.01, v * (1 + step));
    // Mild pull toward end price so the last point lands on `price`
    v = v * (1 - t * 0.35) + base * (t * 0.35);
    pts.push(v);
  }
  pts[pts.length - 1] = base;
  return pts;
}

function lChangeBias(sym) {
  const q = getCachedQuote(sym);
  if (q?.changePct != null) return Math.max(-1, Math.min(1, q.changePct / 4));
  return ((sparkHash(sym) % 200) / 100) - 1;
}

function pushSparkPoint(sym, price) {
  if (!(price > 0)) return sparkSeries.get(sym) || seedSparkSeries(sym, 1);
  let series = sparkSeries.get(sym);
  if (!series) {
    series = seedSparkSeries(sym, price);
    sparkSeries.set(sym, series);
    return series;
  }
  const last = series[series.length - 1];
  // Ignore outlier ticks that would flatten/distort the spark (seed↔live mismatch)
  if (Math.abs(last - price) / Math.max(last, 0.01) > 0.08) {
    series = seedSparkSeries(sym, price);
    sparkSeries.set(sym, series);
    return series;
  }
  if (Math.abs(last - price) / Math.max(last, 0.01) > 0.00004) {
    series.push(price);
    if (series.length > 36) series.shift();
  }
  return series;
}

function sparkPath(pts, w = 72, h = 32) {
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const padX = 1;
  const padY = 3;
  const coords = pts.map((v, i) => {
    const x = padX + (i / Math.max(1, pts.length - 1)) * (w - padX * 2);
    const y = h - padY - ((v - min) / span) * (h - padY * 2);
    return [x, y];
  });
  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const last = coords[coords.length - 1];
  const first = coords[0];
  const area = `${line} L${last[0].toFixed(1)},${(h - 1).toFixed(1)} L${first[0].toFixed(1)},${(h - 1).toFixed(1)} Z`;
  return { line, area };
}

function sparklineHtml(sym, price, changePct) {
  const series = pushSparkPoint(sym, price);
  const up = (changePct ?? 0) >= 0;
  const { line, area } = sparkPath(series);
  return `
    <div class="listing-spark" aria-hidden="true" data-spark="${sym}">
      <svg class="sparkline ${up ? 'up' : 'down'}" viewBox="0 0 72 32" preserveAspectRatio="none">
        <path class="spark-area" d="${area}"></path>
        <path class="spark-line" d="${line}"></path>
      </svg>
    </div>`;
}

function patchSparkline(el, l) {
  const wrap = el.querySelector('.listing-spark');
  if (!wrap) return;
  const key = `${l.sym}:${Number(l.price).toFixed(2)}:${Number(l.changePct || 0).toFixed(2)}`;
  // Avoid SVG replace thrash on every tick (causes hover flicker on hot rows)
  if (wrap.dataset.sparkKey === key) return;
  const next = sparklineHtml(l.sym, l.price, l.changePct).trim();
  const tmp = document.createElement('div');
  tmp.innerHTML = next;
  const fresh = tmp.firstElementChild;
  if (fresh) {
    fresh.dataset.sparkKey = key;
    wrap.replaceWith(fresh);
  }
}

function sectorVectorSvg(sector) {
  switch (sector) {
    case 'tech':
      return `<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h6v6H9z"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>`;
    case 'finance':
      return `<svg viewBox="0 0 24 24"><path d="M4 19h16"/><path d="M6 19V9l6-4 6 4v10"/><path d="M9 19v-6h6v6"/></svg>`;
    case 'energy':
      return `<svg viewBox="0 0 24 24"><path d="M13 2 6 13h5l-1 9 8-12h-5l1-8z"/></svg>`;
    case 'healthcare':
      return `<svg viewBox="0 0 24 24"><path d="M9 4h6v5h5v6h-5v5H9v-5H4V9h5V4z"/></svg>`;
    case 'etf':
      return `<svg viewBox="0 0 24 24"><path d="M4 17 9 9l4 4 7-10"/><path d="M4 20h16"/></svg>`;
    case 'growth':
      return `<svg viewBox="0 0 24 24"><path d="M5 19V9"/><path d="M10 19V6"/><path d="M15 19v-8"/><path d="M20 19V4"/><path d="M3 14l5-5 4 3 8-8"/></svg>`;
    case 'consumer':
      return `<svg viewBox="0 0 24 24"><path d="M6 7h15l-1.5 9H8L6 7z"/><path d="M6 7 5 4H2"/><circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/></svg>`;
    case 'industrial':
      return `<svg viewBox="0 0 24 24"><path d="M3 20h18"/><path d="M5 20V10l5 3V8l5 3V6l4 2v12"/></svg>`;
    default:
      return `<svg viewBox="0 0 24 24"><path d="M4 16V8h3v8H4zm6.5 0V5h3v11h-3zM17 16v-6h3v6h-3z"/><path d="M3 20h18"/></svg>`;
  }
}

function vectorMarkHtml(meta, size = 'sm') {
  const sizeClass = size === 'sm' ? 'sym-mark-sm' : size === 'lg' ? 'sym-mark-lg' : '';
  const color = meta?.color || 'var(--accent)';
  const sector = meta?.sector || 'default';
  return `<div class="sym-mark sym-mark-vector ${sizeClass}" style="--mark:${color}" aria-hidden="true">${sectorVectorSvg(sector)}</div>`;
}

function hotListingHtml(l) {
  const meta = getSymbolMeta(l.sym);
  const up = (l.changePct || 0) >= 0;
  const chg = `${up ? '+' : ''}${(l.changePct || 0).toFixed(2)}%`;
  const spark = sparklineHtml(l.sym, l.price, l.changePct);
  return `
    <div class="hot-row ${l.isDeal ? 'deal' : ''} ${getSelectedSym() === l.sym ? 'selected' : ''}" data-sym="${l.sym}">
      <div class="hot-row-main">
        <div class="hot-id">
          <span class="hot-sym">${l.sym}</span>
          <span class="hot-name">${meta.name || l.name || l.sym}</span>
        </div>
        ${spark}
        <div class="hot-px">
          <span class="hot-price">$${l.price.toFixed(2)}</span>
          <span class="hot-chg ${up ? 'up' : 'down'}">${chg}</span>
        </div>
      </div>
    </div>`;
}

function patchHotRow(el, l) {
  el.classList.toggle('deal', !!l.isDeal);
  el.classList.toggle('selected', getSelectedSym() === l.sym);
  const priceEl = el.querySelector('.hot-price');
  if (priceEl) priceEl.textContent = `$${l.price.toFixed(2)}`;
  const chgEl = el.querySelector('.hot-chg');
  if (chgEl) {
    const up = (l.changePct || 0) >= 0;
    chgEl.textContent = `${up ? '+' : ''}${(l.changePct || 0).toFixed(2)}%`;
    chgEl.className = `hot-chg ${up ? 'up' : 'down'}`;
  }
  if (el.querySelector('.listing-spark')) patchSparkline(el, l);
}

function listingHtml(l, state, { withSpark = false, vectorIcon = false, hot = false } = {}) {
  if (hot) return hotListingHtml(l);
  const marketTag = l.isMarket ? '<span class="market-tag">MARKET</span>' : '';
  const meta = getSymbolMeta(l.sym);
  const spread = listingSpreadPct(l);
  const spreadHtml = !l.isMarket && Math.abs(spread) >= 0.05
    ? `<div class="listing-spread ${spread > 0 ? 'under' : 'over'}">${spread > 0 ? '−' : '+'}${Math.abs(spread).toFixed(1)}% vs mkt</div>`
    : '';
  const spark = withSpark ? sparklineHtml(l.sym, l.price, l.changePct) : '';
  const mark = vectorIcon
    ? vectorMarkHtml(meta, 'sm')
    : logoMarkHtml(l.sym, { color: meta.color, letter: meta.letter, size: 'sm' });
  const suggestMeta = getWalkthroughSuggestMeta();
  const isSuggest = !!(suggestMeta && suggestMeta.sym === String(l.sym).toUpperCase());
  const suggestBadge = isSuggest
    ? `<div class="suggest-badge" title="${escapeHtml(suggestMeta.reason || '')}">Suggested first trade</div>`
    : '';
  return `
    <div class="listing ${l.isDeal ? 'deal' : ''} ${getSelectedSym() === l.sym ? 'selected' : ''} ${l.isMarket ? 'market-row' : ''} ${isSuggest ? 'walkthrough-suggest' : ''}" data-sym="${l.sym}">
      <div class="listing-rail" aria-hidden="true"></div>
      <div class="listing-main">
        ${mark}
        <div class="listing-copy">
          <div class="listing-top">
            <span class="listing-sym">${l.sym}</span>
            ${marketTag}
            <span class="sector-tag">${meta.exchange}</span>
          </div>
          <div class="listing-name">${l.name}</div>
          <div class="listing-flavor">${l.desc}</div>
          ${l.hint ? `<div class="insider-hint">TIP · ${l.hint}</div>` : ''}
        </div>
        ${spark}
        <div class="listing-side">
          <div class="listing-ask-label">${l.isMarket ? 'Market' : 'Ask'}</div>
          <div class="listing-price">$${l.price.toFixed(2)}</div>
          <div class="listing-mkt">${l.isMarket ? 'Live quote' : `Mkt $${l.marketPrice.toFixed(2)}`} <span class="${l.changePct >= 0 ? 'up' : 'down'}">${l.changePct >= 0 ? '+' : ''}${(l.changePct || 0).toFixed(2)}%</span></div>
          ${spreadHtml}
          ${l.isDeal ? '<div class="deal-badge" data-gloss="great-deal">Great deal</div>' : ''}
          ${suggestBadge}
          <div class="listing-cta">Snipe<span aria-hidden="true"> →</span></div>
        </div>
      </div>
    </div>`;
}

function patchListingRow(el, l) {
  el.classList.toggle('deal', !!l.isDeal);
  el.classList.toggle('selected', getSelectedSym() === l.sym);
  el.classList.toggle('market-row', !!l.isMarket);
  const suggestMeta = getWalkthroughSuggestMeta();
  const isSuggest = !!(suggestMeta && suggestMeta.sym === String(l.sym).toUpperCase());
  el.classList.toggle('walkthrough-suggest', isSuggest);
  const priceEl = el.querySelector('.listing-price');
  if (priceEl) priceEl.textContent = `$${l.price.toFixed(2)}`;
  const askLbl = el.querySelector('.listing-ask-label');
  if (askLbl) askLbl.textContent = l.isMarket ? 'Market' : 'Ask';
  const mktEl = el.querySelector('.listing-mkt');
  if (mktEl) {
    const chg = `${l.changePct >= 0 ? '+' : ''}${(l.changePct || 0).toFixed(2)}%`;
    const next = `${l.isMarket ? 'Live quote' : `Mkt $${l.marketPrice.toFixed(2)}`} <span class="${l.changePct >= 0 ? 'up' : 'down'}">${chg}</span>`;
    if (mktEl.dataset.patch !== next) {
      mktEl.innerHTML = next;
      mktEl.dataset.patch = next;
    }
  }
  const spread = listingSpreadPct(l);
  let spreadEl = el.querySelector('.listing-spread');
  if (!l.isMarket && Math.abs(spread) >= 0.05) {
    const html = `${spread > 0 ? '−' : '+'}${Math.abs(spread).toFixed(1)}% vs mkt`;
    if (!spreadEl) {
      const side = el.querySelector('.listing-side');
      const mkt = el.querySelector('.listing-mkt');
      if (side && mkt) {
        mkt.insertAdjacentHTML('afterend', `<div class="listing-spread ${spread > 0 ? 'under' : 'over'}">${html}</div>`);
      }
    } else {
      spreadEl.textContent = html;
      spreadEl.className = `listing-spread ${spread > 0 ? 'under' : 'over'}`;
    }
  } else if (spreadEl) {
    spreadEl.remove();
  }
  let badge = el.querySelector('.deal-badge');
  if (l.isDeal && !badge) {
    const side = el.querySelector('.listing-side');
    const cta = el.querySelector('.listing-cta');
    if (side) {
      const html = '<div class="deal-badge" data-gloss="great-deal">Great deal</div>';
      if (cta) cta.insertAdjacentHTML('beforebegin', html);
      else side.insertAdjacentHTML('beforeend', html);
    }
  } else if (!l.isDeal && badge) {
    badge.remove();
  }
  let suggestBadge = el.querySelector('.suggest-badge');
  if (isSuggest && !suggestBadge) {
    const side = el.querySelector('.listing-side');
    const cta = el.querySelector('.listing-cta');
    if (side) {
      const html = `<div class="suggest-badge" title="${escapeHtml(suggestMeta.reason || '')}">Suggested first trade</div>`;
      if (cta) cta.insertAdjacentHTML('beforebegin', html);
      else side.insertAdjacentHTML('beforeend', html);
    }
  } else if (isSuggest && suggestBadge) {
    suggestBadge.title = suggestMeta.reason || '';
  } else if (!isSuggest && suggestBadge) {
    suggestBadge.remove();
  }
  if (el.querySelector('.listing-spark')) patchSparkline(el, l);
}

function listingRowNeedsRebuild(el, { withSpark = false, vectorIcon = false } = {}) {
  if (!el) return true;
  if (withSpark && !el.querySelector('.listing-spark')) return true;
  if (vectorIcon && !el.querySelector('.sym-mark-vector')) return true;
  if (!vectorIcon && el.querySelector('.sym-mark-vector')) return true;
  return false;
}

function tryPatchListings(container, rows, state, { withSpark = false, vectorIcon = false, hot = false } = {}) {
  const sel = hot ? ':scope > .hot-row' : ':scope > .listing';
  const existing = [...container.querySelectorAll(sel)];
  const sameOrder = existing.length === rows.length
    && rows.every((l, i) => existing[i]?.dataset.sym === String(l.sym));

  // Stable order: patch text/classes in place. Never reparent — reparenting
  // cancels :hover and makes listing cards flash/stutter under the cursor.
  if (sameOrder) {
    const needsRebuild = !hot && rows.some((_, i) => listingRowNeedsRebuild(existing[i], { withSpark, vectorIcon }));
    if (!needsRebuild) {
      rows.forEach((l, i) => {
        if (hot) patchHotRow(existing[i], l);
        else patchListingRow(existing[i], l);
      });
      return true;
    }
  }

  const pool = new Map();
  for (const n of existing) {
    const s = n.dataset.sym;
    if (!pool.has(s)) pool.set(s, []);
    pool.get(s).push(n);
  }

  const frag = document.createDocumentFragment();

  rows.forEach((l) => {
    const bucket = pool.get(l.sym);
    let el = bucket?.length ? bucket.shift() : null;
    if (hot) {
      if (el && el.classList.contains('hot-row')) {
        patchHotRow(el, l);
      } else {
        const tmp = document.createElement('div');
        tmp.innerHTML = hotListingHtml(l).trim();
        el = tmp.firstElementChild;
      }
    } else if (el && !listingRowNeedsRebuild(el, { withSpark, vectorIcon })) {
      patchListingRow(el, l);
    } else {
      const tmp = document.createElement('div');
      tmp.innerHTML = listingHtml(l, state, { withSpark, vectorIcon }).trim();
      el = tmp.firstElementChild;
    }
    frag.appendChild(el);
  });

  for (const bucket of pool.values()) {
    for (const n of bucket) n.remove();
  }

  container.replaceChildren(frag);
  return true;
}

function bindListingClicks(container, state, listings) {
  container.querySelectorAll('.listing, .hot-row').forEach(el => {
    el.onclick = () => {
      const sym = el.dataset.sym;
      setSelectedSym(sym);
      state.onSelectSymbol?.(sym);
      listingsUi.switchView?.('trade');
      listingsUi.renderAll?.(state);
    };
  });
}

function renderListings(state, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (listingsSort === 'deals' && !state.listings?.length) {
    container.innerHTML = '<div class="empty">Loading market listings…</div>';
    return;
  }

  if (containerId === 'listings') {
    const mini = getHotListingVisible(state);
    tryPatchListings(container, mini, state, { hot: true });
    bindListingClicks(container, state, mini);
    const countEl = document.getElementById('hot-listings-count');
    if (countEl) countEl.textContent = String(mini.length);
    bindHotListingsHover();
    return;
  }

  const sortEl = document.getElementById('listings-sort');
  if (sortEl && sortEl.value !== listingsSort) sortEl.value = listingsSort;

  const sorted = sortListingRows(getFullListingRows(state), listingsSort);
  const visible = sorted.slice(0, listingsVisibleCount);
  if (!visible.length) {
    container.innerHTML = '<div class="empty">Scanning for deals… check back in a moment.</div>';
    return;
  }
  fillMissingQuotes(visible.map(l => l.sym));
  tryPatchListings(container, visible, state);
  bindListingClicks(container, state, visible);

  const meta = document.getElementById('listings-meta');
  if (meta) {
    const total = sorted.length;
    const mode = listingsSort === 'deals' ? 'deal feed' : `${getSymbolCount()} symbols`;
    meta.textContent = `Showing ${visible.length} of ${total} · ${mode}`;
  }

  const moreBtn = document.getElementById('listings-show-more');
  if (moreBtn) {
    if (visible.length < sorted.length) {
      moreBtn.classList.remove('hidden');
      moreBtn.textContent = `Show ${Math.min(CONFIG.LISTING_PAGE_SIZE, sorted.length - visible.length)} more`;
    } else {
      moreBtn.classList.add('hidden');
    }
  }
}

export function renderListingSearchResults(query, state) {
  const box = document.getElementById('listing-search-results');
  if (!box) return;
  const q = (query || '').trim();
  if (!q) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }

  const matches = searchSymbols(q, 30);
  if (!matches.length) {
    box.classList.remove('hidden');
    box.innerHTML = `<div class="empty">No symbols match "${escapeHtml(q)}"</div>`;
    return;
  }

  const listings = matches.map(sym => makeMarketListing(sym));
  box.classList.remove('hidden');
  box.innerHTML = `
    <div class="search-results-header">${listings.length} result${listings.length === 1 ? '' : 's'} — click to open on the trade desk</div>
    ${listings.map(l => listingHtml(l, state)).join('')}
  `;
  bindListingClicks(box, state, listings);
}


export function renderListingsViews(state) {
  renderListings(state, 'listings');
  renderListings(state, 'listings-full');
}
