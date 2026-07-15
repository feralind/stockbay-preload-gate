// @ts-check
import { getSymbolName, getSymbolSector, getSymbolMeta, ALL_SYMBOLS } from './symbols.js';
import { logoMarkHtml, installLogoErrorHandler } from './logos.js';
import {
  getCachedQuote, isApiConfigured, getLastNews,
  fillMissingQuotes, isNetworkOnline, getLastFetchAt, getConnectionLabel,
  isLiveAnchoredQuote,
} from './api.js';
import { formatMarketClock } from './market.js';
import { getMacroState } from './macro.js';
import { evaluateMarginHealth } from './margin-call.js';
import {
  getFirmNetWorth, getUnrealizedPnL, getBuyingPower, getEquityBreakdown,
} from './portfolio.js';
import { resizeChart } from './chart.js';
import { renderStaff, showStaffHistory } from './ui/staff.js';
import {
  configureListingsUi, getWatchlist, renderListingsViews, renderTriggeredAlerts, renderWatchlist,
} from './ui/listings.js';
export {
  addToWatchlist, advanceHotListingRotation, buildHotListingPool, checkWatchlistAlerts,
  configureListingsUi, generateListings, getAlertHistory, getFullListingsTotal,
  getHotListingPool, getHotListingPoolSymbols, getHotListingPrefetchCandidates,
  getHotListingVisible, getHotRotationOffset, getListingsSort, getListingsViewportSymbols,
  getVisibleListingSymbols, getWatchlist, getWatchlistAlerts, hotPoolAllLiveAnchored,
  isHotListingRotationPaused, listingDealEdge, loadAlertHistory, loadWatchlistAlerts,
  makeMarketListing, nextHotRotationOffset, openPriceAlert, pauseHotListingRotation,
  recordAlertTrigger, removeFromWatchlist, renderListingSearchResults, renderListingsViews,
  renderTriggeredAlerts, renderWatchlist, resetHotListingRotationForTests, resetListingsPage,
  reseedHotListingRotation, scheduleHotListingResume, setListingsSort, setWatchlistAlert,
  showMoreListings, slideHotListingWindow, startHotListingsRotation, stopHotListingsRotation,
  syncListingsFromQuotes,
} from './ui/listings.js';
export { showStaffHistory };
import { renderAchievements } from './ui/achievements.js';
import { renderFinance, setLoanDraftAmount } from './ui/finance.js';
import { renderPerks } from './ui/perks.js';
import { renderVault } from './ui/vault.js';
import { renderEstates } from './ui/estates.js';
import { renderCollectionLog } from './ui/collection-log.js';
import { renderBlackMarket } from './ui/blackmarket.js';
import {
  bindAiChat, configureAiAdvisor, getAiChatHistory, loadAiChatHistory,
  refreshAiAnalysis, renderAi, renderAiChatLog, sendAiChat,
} from './ui/ai-advisor.js';
export {
  bindAiChat, getAiChatHistory, loadAiChatHistory, refreshAiAnalysis, sendAiChat,
};
import { configurePortfolioUi, renderPortfolio } from './ui/portfolio.js';
import {
  closeModal, closeOrderConfirm, getModalShares, getSelectedListing, openOrderConfirm,
  refreshOpenOptionsPanel, renderPendingOrders, renderTradePanel, updateTradeEstValue,
} from './ui/trade.js';
import { configureEventsUi, eventSourceUrl, renderEvents } from './ui/events.js';
import { configureDashboardUi, renderDashboard } from './ui/dashboard.js';
export {
  cashDeltaForOrder, clampOrderShares, closeModal, closeOrderConfirm, getModalShares,
  getSelectedListing, openOrderConfirm, openTradeModal, orderShareLimits, orderVerb,
  refreshOpenOptionsPanel, renderOrderConfirm, renderPendingOrders, renderPositionSummary,
  renderRecentTradesStrip, renderTradePanel, riskText, showOptionsPanel, updateModalTotal,
  updateTradeEstValue,
} from './ui/trade.js';
import { getSelectedSym, setSelectedSym } from './ui/selection.js';
export { getSelectedSym } from './ui/selection.js';
import {
  configureChartPanelUi, getChartResolution, loadChart, setChartResolution, showChartTab,
} from './ui/chart-panel.js';
export { getChartResolution, setChartResolution, showChartTab, loadChart };
import {
  escapeAttr, escapeHtml, fmt, fmtPnL, fmtSignedMoney, quoteForDisplay, setText,
} from './ui/shared.js';
export { fmt, fmtPnL } from './ui/shared.js';
import { getFirmDebt } from './finance.js';
import { getVaultItem, getVaultBookValue } from './vault.js';
import { syncEstateDerived, getHighestOwnedEstate } from './estates.js';
import { getPlayerStanding } from './meta.js';
import { toast, showAlert } from './notify.js';
import { sfxError } from './sfx.js';
import { CONFIG, REP_RANKS, getRepRank, getNextRepRank } from './config.js';
import { trapFocus } from './overlays.js';
import {
  loadProfile, getProfile, saveProfile, clearAvatar, profileInitials, fileToAvatarDataUrl,
} from './profile.js';
import { BLACKMARKET_ITEM_POOL } from './blackmarket.js';
import { PRIVATE_SALON_POOL } from './private-salon.js';
import { THE_SEAT } from './the-seat.js';
import { getEffectiveOfficeTier } from './office.js';
import { getHighestOwnedLuxury } from './luxury.js';
import { resyncGlossaryHover } from './glossary-tooltips.js';

installLogoErrorHandler();
configurePortfolioUi({ switchView, openOrderConfirm });
configureAiAdvisor({ renderAll, switchView });
configureChartPanelUi({ renderNews });
configureListingsUi({ onOpenTrade: null, switchView, renderAll, showChartTab, resizeChart });
configureEventsUi({ switchView });
configureDashboardUi({ switchView });

function brandMarkSvg() {
  return `<svg viewBox="0 0 64 64" role="img" focusable="false">
    <rect class="brand-tile" x="4" y="4" width="56" height="56" rx="14"/>
    <g class="brand-candles" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round">
      <path d="M20 18v8M20 38v8"/>
      <rect x="16" y="26" width="8" height="12" rx="1.5" fill="#fff" stroke="none"/>
      <path d="M32 14v10M32 36v14"/>
      <rect x="28" y="24" width="8" height="12" rx="1.5" fill="#fff" stroke="none" opacity="0.92"/>
      <path d="M44 22v6M44 40v6"/>
      <rect x="40" y="28" width="8" height="12" rx="1.5" fill="#fff" stroke="none" opacity="0.85"/>
    </g>
  </svg>`;
}

export function renderAll(state) {
  try {
  renderHeader(state);
  renderMarketClock();
  renderWatchlist(state);
  renderTriggeredAlerts();
  renderListingsViews(state);
  renderPortfolio(state, 'portfolio');
  renderPortfolio(state, 'portfolio-full');
  renderEvents(state, 'events-feed');
  renderEvents(state, 'events-full');
  renderPerks(state, 'perks-shop');
  renderPerks(state, 'perks-full');
  renderStaff(state);
  renderAchievements(state);
  renderDashboard(state);
  renderFinance(state);
  renderVault(state);
  syncEstateDerived(state);
  {
    const debt = state.finance
      ? getFirmDebt(state.finance, state.estateCreditUsed)
      : Math.max(0, Number(state.estateCreditUsed) || 0);
    const netWorth = getFirmNetWorth(state.portfolio, {
      debt,
      vaultBook: getVaultBookValue(state),
      estateEquity: state.estateEquity,
    });
    renderEstates(state, { netWorth });
  }
  renderCollectionLog(state);
  renderBlackMarket(state);
  renderTradePanel(state);
  renderTicker(state);
  renderLog(state);
  renderPendingOrders(state);
  renderStats(state);
  renderNews();
  renderProfileUI(state);
  renderAi(state);
  } catch (err) {
    console.error('renderAll failed:', err);
  }
  // Portfolio/header rebuilds kill native hover events — keep glossary dwell alive.
  try {
    resyncGlossaryHover();
  } catch (_) { /* tip layer optional */ }
}

const STAT_POPOVER_HIDE_MS = 160;
let statPopoverState = null;
let activeStatPopover = null;
let statPopoverHideTimer = null;
let statPopoversBound = false;

function ensureStatPopover(id) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.className = 'stat-popover';
    el.setAttribute('role', 'tooltip');
    el.hidden = true;
    document.body.appendChild(el);
  }
  return el;
}

function positionStatPopover(anchor, popover) {
  const gap = 8;
  const pad = 8;
  popover.hidden = false;
  popover.style.visibility = 'hidden';
  popover.classList.add('is-open');
  const rect = anchor.getBoundingClientRect();
  const pw = popover.offsetWidth || 260;
  const ph = popover.offsetHeight || 180;
  let left = rect.left;
  let top = rect.bottom + gap;
  if (left + pw > window.innerWidth - pad) left = window.innerWidth - pw - pad;
  if (left < pad) left = pad;
  if (top + ph > window.innerHeight - pad) top = Math.max(pad, rect.top - ph - gap);
  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
  popover.style.visibility = '';
}

function showStatPopover(kind) {
  clearTimeout(statPopoverHideTimer);
  const anchor = document.getElementById(kind === 'equity' ? 'equity-stat-cell' : 'rep-stat-cell');
  const popover = ensureStatPopover(kind === 'equity' ? 'equity-popover' : 'rep-popover');
  if (!anchor || !popover) return;
  if (activeStatPopover && activeStatPopover !== popover) {
    activeStatPopover.classList.remove('is-open');
    activeStatPopover.hidden = true;
  }
  if (statPopoverState) fillStatPopover(kind, popover, statPopoverState);
  positionStatPopover(anchor, popover);
  activeStatPopover = popover;
}

function scheduleHideStatPopover() {
  clearTimeout(statPopoverHideTimer);
  statPopoverHideTimer = setTimeout(() => {
    if (!activeStatPopover) return;
    activeStatPopover.classList.remove('is-open');
    activeStatPopover.hidden = true;
    activeStatPopover = null;
  }, STAT_POPOVER_HIDE_MS);
}

function fillEquityPopover(el, state) {
  syncEstateDerived(state);
  const debt = state.finance ? getFirmDebt(state.finance, state.estateCreditUsed) : Math.max(0, Number(state.estateCreditUsed) || 0);
  const b = getEquityBreakdown(state.portfolio, debt);
  const vaultBook = getVaultBookValue(state);
  const estateEquity = Math.max(0, Number(state.estateEquity) || 0);
  const displayTotal = getFirmNetWorth(state.portfolio, { debt, vaultBook, estateEquity });
  const debtCls = b.debt ? 'down' : '';
  const shortCls = b.shortUnrealized >= 0 ? 'up' : 'down';
  const uCls = b.unrealized >= 0 ? 'up' : 'down';
  const totalCls = displayTotal >= 0 ? 'up' : 'down';
  el.innerHTML = `
    <div class="stat-popover-title">Net Equity</div>
    <div class="stat-popover-row"><span>Cash</span><span>${fmt(b.cash)}</span></div>
    <div class="stat-popover-row"><span>Long positions</span><span>${fmt(b.longMv)}</span></div>
    <div class="stat-popover-row"><span>Margin held</span><span>${fmt(b.marginHeld)}</span></div>
    <div class="stat-popover-row"><span>Short P&amp;L</span><span class="${shortCls}">${fmtSignedMoney(b.shortUnrealized)}</span></div>
    <div class="stat-popover-row"><span>Options</span><span>${fmt(b.options)}</span></div>
    <div class="stat-popover-row"><span>Trophy Vault</span><span>${fmt(vaultBook)}</span></div>
    <div class="stat-popover-row"><span>Estate equity</span><span>${fmt(estateEquity)}</span></div>
    <div class="stat-popover-row"><span>Loans / credit</span><span class="${debtCls}">${b.debt ? fmtSignedMoney(-b.debt) : '$0'}</span></div>
    <div class="stat-popover-sep"></div>
    <div class="stat-popover-row stat-popover-total"><span>Total</span><span class="${totalCls}">${fmt(displayTotal)}</span></div>
    <div class="stat-popover-note">Trading equity = cash + positions − debt. Total includes Vault + Estate equity. Unrealized P&amp;L <span class="${uCls}">${fmtPnL(b.unrealized)}</span></div>
  `;
}

function fillRepPopover(el, state) {
  const rep = state.meta?.reputation ?? 0;
  const current = getRepRank(rep);
  const next = getNextRepRank(rep);
  const ranks = REP_RANKS.map((rank) => {
    const unlocked = rep >= rank.minRep;
    return `<div class="stat-popover-rank ${unlocked ? 'unlocked' : 'locked'}">
      <span class="stat-popover-rank-mark">${unlocked ? '✓' : ''}</span>
      <span class="stat-popover-rank-name">${rank.name}</span>
      <span class="stat-popover-rank-meta">${rank.minRep}+ · ${unlocked ? 'Unlocked' : 'Locked'}</span>
    </div>`;
  }).join('');
  const progress = next
    ? `${rep} / ${next.minRep} to ${next.name}`
    : 'Max rank';
  el.innerHTML = `
    <div class="stat-popover-title">Reputation</div>
    <p class="stat-popover-blurb">Earned from trades, day performance, achievements, challenges, hiring/training, and on-time credit. Lost on losses, late debt, and firings. Ranks gate desk perk tiers.</p>
    <div class="stat-popover-current">${current.name} · ${rep} REP</div>
    <div class="stat-popover-ranks">${ranks}</div>
    <div class="stat-popover-sep"></div>
    <div class="stat-popover-footer">${progress}</div>
  `;
}

function fillStatPopover(kind, el, state) {
  if (kind === 'equity') fillEquityPopover(el, state);
  else fillRepPopover(el, state);
}

function updateStatPopovers(state) {
  statPopoverState = state;
  syncEstateDerived(state);
  const debt = state.finance ? getFirmDebt(state.finance, state.estateCreditUsed) : Math.max(0, Number(state.estateCreditUsed) || 0);
  const net = getFirmNetWorth(state.portfolio, {
    debt,
    vaultBook: getVaultBookValue(state),
    estateEquity: state.estateEquity,
  });
  const rep = state.meta?.reputation ?? 0;
  const rank = getRepRank(rep);
  const next = getNextRepRank(rep);
  const equityCell = document.getElementById('equity-stat-cell');
  const repCell = document.getElementById('rep-stat-cell');
  if (equityCell) {
    equityCell.title = `Net worth ${fmt(net)} (vault + estates) — hover for breakdown`;
  }
  if (repCell) {
    const tip = next
      ? `${rank.name} · ${rep} REP · ${next.minRep - rep} to ${next.name}`
      : `${rank.name} · ${rep} REP · Max rank`;
    repCell.title = tip;
  }
  if (activeStatPopover?.id === 'equity-popover') {
    fillEquityPopover(activeStatPopover, state);
    const anchor = document.getElementById('equity-stat-cell');
    if (anchor) positionStatPopover(anchor, activeStatPopover);
  } else if (activeStatPopover?.id === 'rep-popover') {
    fillRepPopover(activeStatPopover, state);
    const anchor = document.getElementById('rep-stat-cell');
    if (anchor) positionStatPopover(anchor, activeStatPopover);
  }
}

export function bindStatPopovers() {
  if (statPopoversBound) return;
  statPopoversBound = true;
  const pairs = [
    { cellId: 'equity-stat-cell', kind: 'equity', popId: 'equity-popover' },
    { cellId: 'rep-stat-cell', kind: 'rep', popId: 'rep-popover' },
  ];
  pairs.forEach(({ cellId, kind, popId }) => {
    const cell = document.getElementById(cellId);
    if (!cell) return;
    const popover = ensureStatPopover(popId);
    const show = () => showStatPopover(kind);
    cell.addEventListener('mouseenter', show);
    cell.addEventListener('focus', show);
    cell.addEventListener('mouseleave', scheduleHideStatPopover);
    cell.addEventListener('blur', scheduleHideStatPopover);
    popover.addEventListener('mouseenter', () => clearTimeout(statPopoverHideTimer));
    popover.addEventListener('mouseleave', scheduleHideStatPopover);
  });
  window.addEventListener('resize', () => {
    if (!activeStatPopover || activeStatPopover.hidden) return;
    const kind = activeStatPopover.id === 'equity-popover' ? 'equity' : 'rep';
    const anchor = document.getElementById(kind === 'equity' ? 'equity-stat-cell' : 'rep-stat-cell');
    if (anchor) positionStatPopover(anchor, activeStatPopover);
  });
}

function renderHeader(state) {
  const { portfolio, perks, apiStatus, meta, finance } = state;
  syncEstateDerived(state);
  const debt = finance ? getFirmDebt(finance, state.estateCreditUsed) : Math.max(0, Number(state.estateCreditUsed) || 0);
  const vaultBook = getVaultBookValue(state);
  const estateEquity = Math.max(0, Number(state.estateEquity) || 0);
  const cash = Number(portfolio.cash) || 0;
  const firm = getFirmNetWorth(portfolio, { debt, vaultBook, estateEquity });
  setText('cash', fmt(cash));
  setText('equity', fmt(firm));
  setText('pnl', fmtPnL(getUnrealizedPnL(portfolio)));
  setText('buying-power', fmt(getBuyingPower(portfolio, perks)));
  const rep = meta?.reputation ?? 0;
  setText('reputation', String(rep));
  const rankEl = document.getElementById('rep-rank');
  if (rankEl) rankEl.textContent = getRepRank(rep).name;
  updateStatPopovers(state);
  renderFeedStatus(apiStatus);
  const marginBanner = document.getElementById('margin-stress-banner');
  if (marginBanner) {
    const health = evaluateMarginHealth(portfolio);
    const mc = portfolio.marginCall;
    if (state.marginBanner) {
      marginBanner.classList.remove('hidden');
      marginBanner.textContent = state.marginBanner;
      const pct = health.worstRatio != null ? `${(health.worstRatio * 100).toFixed(0)}%` : null;
      marginBanner.title = pct
        ? `Margin cushion ${pct} — equity ÷ position risk. Brokers demand a minimum so a losing short cannot owe more than the account holds. Cover or sell to restore it.`
        : 'Equity cushion = your equity ÷ position risk. Cover shorts or sell longs to restore the cushion before liquidation.';
    } else if (mc?.level === 'call' || health.level === 'call') {
      marginBanner.classList.remove('hidden');
      marginBanner.textContent = '⚠ MARGIN CALL — cover shorts or sell to restore cushion';
      marginBanner.title = 'Margin call: cushion below maintenance. Cover or sell — or the desk liquidates. Brokers do this so one bad short cannot wipe the account.';
    } else if (mc?.level === 'warn' || health.level === 'warn') {
      marginBanner.classList.remove('hidden');
      const pct = health.worstRatio != null ? `${(health.worstRatio * 100).toFixed(0)}%` : 'low';
      marginBanner.textContent = `⚠ Margin warning — cushion ${pct}. Cover or add cash before liquidation.`;
      marginBanner.title = `Margin cushion ${pct} — equity ÷ position risk vs maintenance. Cover shorts or add cash before a full margin call.`;
    } else {
      let shortLoss = 0;
      Object.entries(portfolio.shorts || {}).forEach(([sym, p]) => {
        const q = getCachedQuote(sym);
        if (q && q.price > p.avgPrice) shortLoss += (q.price - p.avgPrice) * p.shares;
      });
      const stressed = shortLoss > 0 && shortLoss >= portfolio.cash * 0.35;
      marginBanner.classList.toggle('hidden', !stressed);
      if (stressed) {
        marginBanner.textContent = `⚠ Short losses (~$${Math.round(shortLoss).toLocaleString()}) are eating buying power — consider covering`;
      }
    }
  }
}

function renderFeedStatus(apiStatus) {
  const mode = apiStatus?.mode || 'offline';
  const label = apiStatus?.label || getConnectionLabel();
  const pill = document.getElementById('feed-live-pill');
  const liveLbl = document.getElementById('feed-live-label');
  const detail = document.getElementById('feed-status-detail');
  const wrap = document.getElementById('feed-status');

  // Pill reflects connectivity for baseline fetches — never "Live" (that reads as streaming tape)
  const connected = isNetworkOnline();
  let pillMode = 'offline';
  let pillText = 'Offline';
  if (mode === 'loading') { pillMode = 'loading'; pillText = 'Sync'; }
  else if (connected) { pillMode = 'online'; pillText = 'Online'; }

  if (pill) pill.className = `feed-live-pill ${pillMode}`;
  if (liveLbl) liveLbl.textContent = pillText;

  const lastFetch = getLastFetchAt();
  const tip = label || getConnectionLabel();
  if (wrap) {
    wrap.title = lastFetch
      ? `${tip}\nLast base fetch: ${new Date(lastFetch).toLocaleString()}`
      : tip;
  }

  if (detail) {
    let short = '';
    const progress = label.match(/(\d+)\s*\/\s*(\d+)/);
    const m = label.match(/(\d+)\s*(?:quotes|baselines)/i);
    // Background climb toward full universe — reuse this badge, no second progress UI.
    if (progress) short = `${progress[1]}/${progress[2]} bases`;
    else if (m) short = `${m[1]} bases`;
    else if (/yahoo/i.test(label)) short = 'Yahoo';
    else if (/re-?anchor|reconnect|fetching|sync|loading quotes|anchoring/i.test(label)) short = 'Updating';
    else if (/offline|seed|cached|recover/i.test(label) || !connected) short = lastFetch ? 'Cached' : 'Seeds';
    else if (mode === 'loading') short = 'Connecting';
    else if (connected) short = 'Connected';
    detail.textContent = short;
  }

  const badge = document.getElementById('api-badge');
  if (badge) {
    badge.textContent = tip;
    badge.className = `status-chip ${pillMode}`;
  }
}

function renderMarketClock() {
  const { time, status, day, phase, progress } = formatMarketClock();
  setText('market-clock', time);
  const st = document.getElementById('market-status');
  if (st) { st.textContent = status; st.className = `market-badge ${status.toLowerCase()}`; }
  setText('market-day', `DAY ${day}`);
  setText('market-phase', phase || 'Morning');
  const macro = getMacroState();
  const fedEl = document.getElementById('macro-fed');
  if (fedEl) {
    fedEl.textContent = `Fed ${macro.fedFundsRate.toFixed(2)}%`;
    fedEl.title = `Simulated Fed funds ${macro.fedFundsRate.toFixed(2)}% · 10Y ${macro.yield10Y.toFixed(2)}% — moves bank APRs and Fed event size`;
  }
  const fill = document.getElementById('phase-bar-fill');
  if (fill) fill.style.width = `${Math.round((progress || 0) * 100)}%`;
}

let activeViewId = 'dashboard';
const viewChangeListeners = new Set();

export function getActiveView() {
  return activeViewId;
}

export function onViewChange(fn) {
  if (typeof fn !== 'function') return () => {};
  viewChangeListeners.add(fn);
  return () => viewChangeListeners.delete(fn);
}

const RIGHT_SIDEBAR_W_KEY = 'stockway-right-sidebar-w';
const RIGHT_SIDEBAR_W_DEFAULT = 320;
const RIGHT_SIDEBAR_W_MIN = 260;
const RIGHT_SIDEBAR_W_MAX = 520;

const LEFT_SIDEBAR_W_KEY = 'stockway-left-sidebar-w';
const LEFT_SIDEBAR_W_DEFAULT = 240;
const LEFT_SIDEBAR_W_MIN = 200;
const LEFT_SIDEBAR_W_MAX = 360;

export function renderTicker(state) {
  const track = document.getElementById('ticker-track');
  if (!track) return;
  const syms = CONFIG.TICKER_SYMBOLS || getWatchlist();
  fillMissingQuotes(syms);

  const existing = [...track.querySelectorAll('.ticker-item')].map((n) => n.dataset.sym);
  // Track is duplicated for seamless loop — expect 2× symbol list
  const expected = [...syms, ...syms];
  const sameStructure = existing.length === expected.length && expected.every((s, i) => existing[i] === s);

  const paintItem = (item, sym) => {
    const q = quoteForDisplay(sym);
    const up = (q.changePct || 0) >= 0;
    const priceEl = item.querySelector('.ticker-price');
    const chgEl = item.querySelector('.ticker-chg');
    if (priceEl) priceEl.textContent = Number(q.price).toFixed(2);
    if (chgEl) {
      chgEl.textContent = `${up ? '▲' : '▼'} ${Math.abs(q.changePct || 0).toFixed(2)}%`;
      chgEl.className = `ticker-chg ${up ? 'up' : 'down'}`;
    }
  };

  if (sameStructure && existing.length) {
    const nodes = track.querySelectorAll('.ticker-item');
    expected.forEach((sym, i) => {
      const item = nodes[i];
      if (!item) return;
      paintItem(item, sym);
    });
  } else {
    const items = syms.map(sym => {
      const q = quoteForDisplay(sym);
      const meta = getSymbolMeta(sym);
      const up = (q.changePct || 0) >= 0;
      const idx = meta.indices[0] || meta.exchange;
      return `<span class="ticker-item" data-sym="${sym}" role="button" tabindex="0" title="Open ${sym} in Trade">
      ${logoMarkHtml(sym, { color: meta.color, letter: meta.letter, size: 'sm' })}
      <b>${sym}</b>
      <span class="ticker-idx">${idx}</span>
      <span class="ticker-price">${Number(q.price).toFixed(2)}</span>
      <span class="ticker-chg ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(q.changePct || 0).toFixed(2)}%</span>
    </span>`;
    }).join('');
    // Duplicate for seamless loop — CSS animates translate; items stay clickable
    track.innerHTML = items + items;
  }

  if (state && !track.dataset.tickerBound) {
    track.dataset.tickerBound = '1';
    track.addEventListener('click', (e) => {
      const item = e.target.closest?.('.ticker-item');
      const sym = item?.dataset?.sym;
      if (!sym) return;
      setSelectedSym(sym);
      state.onSelectSymbol?.(sym);
      switchView('trade');
      showChartTab('chart');
      renderAll(state);
      setTimeout(() => resizeChart(), 100);
    });
  }
}

function renderStats(state) {
  const grid = document.getElementById('stats-grid');
  if (!grid) return;
  const selectedSym = getSelectedSym();
  const q = quoteForDisplay(selectedSym);
  if (!q) return;
  const stats = [
    { lbl: 'Open', val: `$${(q.open || q.price).toFixed(2)}` },
    { lbl: 'High', val: `$${(q.high || q.price).toFixed(2)}` },
    { lbl: 'Low', val: `$${(q.low || q.price).toFixed(2)}` },
    { lbl: 'Prev Close', val: `$${(q.prevClose || q.price).toFixed(2)}` },
    { lbl: 'Change', val: `${q.changePct >= 0 ? '+' : ''}${(q.changePct || 0).toFixed(2)}%` },
    { lbl: 'Sector', val: getSymbolSector(selectedSym) },
    { lbl: 'Data', val: q.simulated
      ? (isLiveAnchoredQuote(q) ? 'Sim · live-seeded' : 'Simulated')
      : (isLiveAnchoredQuote(q) ? 'Baseline (live-seeded)' : 'Baseline') },
    { lbl: 'Trades', val: state.portfolio.totalTrades },
    { lbl: 'Realized P&L', val: fmtPnL(state.portfolio.realizedPnL) },
  ];
  grid.innerHTML = stats.map(s => `
    <div class="stat-card"><div class="stat-card-lbl">${s.lbl}</div><div class="stat-card-val">${s.val}</div></div>
    <div class="stat-kv-row"><span class="stat-kv-lbl">${s.lbl}</span><span class="stat-kv-val">${s.val}</span></div>
  `).join('');
}

export function renderNews() {
  const panel = document.getElementById('news-panel');
  if (!panel) return;
  const news = getLastNews();
  if (!news?.length) {
    panel.innerHTML = '<div class="empty">No live headlines yet. Add a Finnhub API key for real news, or watch World Events for simulated desk briefs.</div>';
    return;
  }
  panel.innerHTML = news.slice(0, 15).map(n => {
    const related = relatedSymbolFromHeadline(n.headline || '');
    const summary = (n.summary || '').trim();
    const href = eventSourceUrl(n);
    const teaser = summary && summary !== (n.headline || '').trim()
      ? `<div class="news-teaser">${escapeHtml(summary.slice(0, 160))}</div>`
      : '';
    const title = href
      ? `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(n.headline)}</a>`
      : escapeHtml(n.headline || '');
    return `<div class="news-item">
      <div>${related ? `<span class="news-sym-tag">${escapeHtml(related)}</span>` : ''}${title}</div>
      ${teaser}
      <div class="news-src">${escapeHtml(n.source || 'Market')} · ${n.datetime ? new Date(n.datetime * 1000).toLocaleString() : ''}${href ? ' · source link' : ''}</div>
    </div>
  `; }).join('');
}

function relatedSymbolFromHeadline(headline) {
  const upper = headline.toUpperCase();
  return ALL_SYMBOLS.find(sym => upper.includes(sym) || upper.includes(getSymbolName(sym).split(' ')[0].toUpperCase())) || '';
}

function paintAvatarEl(el, profile) {
  if (!el) return;
  const initials = profileInitials(profile.name);
  if (profile.avatar) {
    el.classList.add('has-photo');
    el.style.backgroundImage = `url("${profile.avatar}")`;
    el.textContent = '';
  } else {
    el.classList.remove('has-photo');
    el.style.backgroundImage = '';
    el.textContent = initials;
  }
}

function getProfileCosmeticItem(profile, slot) {
  const id = profile?.cosmetics?.[slot];
  if (!id) return null;
  return getVaultItem(id);
}

function applyProfileCosmetics(profile) {
  const body = document.body;
  const bg = getProfileCosmeticItem(profile, 'background');
  const dashboard = getProfileCosmeticItem(profile, 'dashboard');
  if (body) {
    if (bg?.id) body.setAttribute('data-vault-bg', bg.id);
    else body.removeAttribute('data-vault-bg');
    if (dashboard?.id) body.setAttribute('data-vault-dashboard', dashboard.id);
    else body.removeAttribute('data-vault-dashboard');
  }
  const badgeEl = document.getElementById('user-cosmetic-badge');
  const badge = getProfileCosmeticItem(profile, 'badge');
  if (badgeEl) {
    if (badge) {
      badgeEl.textContent = badge.name;
      badgeEl.classList.remove('hidden');
    } else {
      badgeEl.textContent = '';
      badgeEl.classList.add('hidden');
    }
  }
}

/** Apply purchased office tier to body for CSS ambient (sibling to vault cosmetics). */
function applyOfficeTierAttribute(state) {
  const body = document.body;
  if (!body) return;
  const tier = getEffectiveOfficeTier(state);
  if (tier?.id) body.setAttribute('data-office-tier', tier.id);
  else body.removeAttribute('data-office-tier');
}

/** Quiet luxury ambient — highest owned prestige sink (not Net Worth). */
function applyLuxuryAttribute(state) {
  const body = document.body;
  if (!body) return;
  const lux = getHighestOwnedLuxury(state);
  if (lux?.id) body.setAttribute('data-luxury', lux.id);
  else body.removeAttribute('data-luxury');
}

/** Estate ambient — highest owned lifestyle asset. */
function applyEstateAttribute(state) {
  const body = document.body;
  if (!body) return;
  const estate = getHighestOwnedEstate(state);
  if (estate?.id) body.setAttribute('data-estate', estate.id);
  else body.removeAttribute('data-estate');
}

export function renderProfileUI(state) {
  const profile = getProfile();
  const nameEl = document.getElementById('user-name');
  if (nameEl) nameEl.textContent = profile.name;
  paintAvatarEl(document.getElementById('user-avatar'), profile);
  paintAvatarEl(document.getElementById('settings-avatar-preview'), profile);

  const previewName = document.getElementById('settings-preview-name');
  if (previewName) previewName.textContent = profile.name;

  const nameInput = document.getElementById('settings-trader-name');
  if (nameInput && document.activeElement !== nameInput) {
    nameInput.value = profile.name;
  }

  applyProfileCosmetics(profile);
  applyOfficeTierAttribute(state);
  applyLuxuryAttribute(state);
  applyEstateAttribute(state);
  updatePlayerTier(state, profile);
}

function updatePlayerTier(state, profile = getProfile()) {
  const el = document.getElementById('player-tier');
  if (!el) return;
  const standing = getPlayerStanding(state, {
    cosmetics: profile?.cosmetics || {},
    blackMarketPool: BLACKMARKET_ITEM_POOL,
    seatItem: THE_SEAT,
    salonPool: PRIVATE_SALON_POOL,
  });
  const main = `${standing.rankName} · REP ${standing.rep}`;
  const secondary = [];
  secondary.push(`Collection ${standing.collectionScore}`);
  if (standing.deskLabel) secondary.push(standing.deskLabel);
  if (standing.flair) secondary.push(standing.flair);
  else if (standing.titleName) secondary.push(standing.titleName);
  if (standing.seatOwned && !secondary.some((s) => s.includes('Seat'))) {
    secondary.push(THE_SEAT.name);
  }
  el.innerHTML = `<span class="user-tier-main">${escapeHtml(main)}</span>`
    + `<span class="user-tier-standing">${escapeHtml(secondary.join(' · '))}</span>`;
}

export function bindProfileSettings(state) {
  if (bindProfileSettings._bound) return;
  bindProfileSettings._bound = true;

  loadProfile();
  renderProfileUI(state);

  const nameInput = document.getElementById('settings-trader-name');
  nameInput?.addEventListener('input', () => {
    saveProfile({ name: nameInput.value });
    renderProfileUI(state);
  });
  nameInput?.addEventListener('change', () => {
    saveProfile({ name: nameInput.value });
    renderProfileUI(state);
    toast('Profile name saved', { type: 'success' });
  });

  const fileInput = document.getElementById('settings-avatar-input');
  document.getElementById('settings-avatar-pick')?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      saveProfile({ avatar: dataUrl });
      renderProfileUI(state);
      toast('Photo updated', { type: 'success' });
    } catch (e) {
      sfxError();
      showAlert(e.message || 'Could not use that image.', { title: 'Photo', label: 'PROFILE' });
    }
  });

  document.getElementById('settings-avatar-clear')?.addEventListener('click', () => {
    clearAvatar();
    renderProfileUI(state);
    toast('Photo removed', { type: 'success' });
  });

  document.getElementById('user-chip')?.addEventListener('click', () => {
    switchView('settings');
    document.querySelector('[data-settings-tab="profile"]')?.click();
  });
}

export function showDaySummary(stats) {
  const overlay = document.getElementById('day-summary-overlay');
  const title = document.getElementById('day-summary-title');
  const body = document.getElementById('day-summary-body');
  const extra = document.getElementById('day-summary-extra');
  const flavor = document.getElementById('day-summary-flavor');
  if (!overlay || !body) return;

  const cashDelta = stats.cashDelta || 0;
  const equityDelta = stats.equityDelta || 0;
  const best = stats.bestTrade || 0;
  const worst = stats.worstTrade || 0;
  const fees = Math.round((stats.payroll || 0) + (stats.fees || 0));
  const eqUp = equityDelta >= 0;
  const cashUp = cashDelta >= 0;
  const fmtDelta = (n, forcePlus = true) => {
    const sign = n > 0 ? '+' : n < 0 ? '−' : (forcePlus ? '+' : '');
    return `${sign}$${Math.abs(Math.round(n)).toLocaleString()}`;
  };

  title.textContent = `Day ${stats.day} wrap-up`;
  if (flavor) {
    flavor.textContent = eqUp
      ? 'The floor quieted down. Time to count the haul.'
      : 'Rough session. Review the damage and come back sharper.';
  }

  body.innerHTML = `
    <div class="eod-hero ${eqUp ? 'up' : 'down'}">
      <div class="eod-hero-copy">
        <span class="eod-hero-lbl">Net equity change</span>
        <span class="eod-hero-val">${fmtDelta(equityDelta)}</span>
      </div>
      <div class="eod-hero-side">
        <span class="eod-hero-side-lbl">Cash</span>
        <span class="eod-hero-side-val ${cashUp ? 'up' : 'down'}">${fmtDelta(cashDelta)}</span>
      </div>
    </div>
    <div class="eod-section-lbl">Session activity</div>
    <div class="eod-metrics">
      <div class="eod-metric">
        <span class="eod-metric-lbl">Bought</span>
        <span class="eod-metric-val">${stats.buys || 0}</span>
      </div>
      <div class="eod-metric">
        <span class="eod-metric-lbl">Sold / covered</span>
        <span class="eod-metric-val">${stats.sells || 0}</span>
      </div>
      <div class="eod-metric">
        <span class="eod-metric-lbl">Staff actions</span>
        <span class="eod-metric-val">${stats.staffActions || 0}</span>
      </div>
      <div class="eod-metric">
        <span class="eod-metric-lbl">Payroll &amp; fees</span>
        <span class="eod-metric-val down">−$${fees.toLocaleString()}</span>
      </div>
    </div>
    <div class="eod-section-lbl">Trade extremes</div>
    <div class="eod-extremes">
      <div class="eod-extreme up">
        <span class="eod-extreme-lbl">Best trade</span>
        <span class="eod-extreme-val">+$${Math.round(Math.max(0, best)).toLocaleString()}</span>
      </div>
      <div class="eod-extreme ${worst < 0 ? 'down' : ''}">
        <span class="eod-extreme-lbl">Worst trade</span>
        <span class="eod-extreme-val">${worst < 0 ? '−' : ''}$${Math.abs(Math.round(worst)).toLocaleString()}</span>
      </div>
    </div>`;

  if (extra) {
    const chips = [];
    if (stats.challengeDone) {
      chips.push(`<span class="eod-chip challenge">Challenge cleared · +$${stats.challengeReward?.toLocaleString() || 0}</span>`);
    }
    if (stats.repDelta) {
      chips.push(`<span class="eod-chip rep">${stats.repDelta > 0 ? '+' : ''}${stats.repDelta} REP</span>`);
    }
    if (stats.optionsExpired) {
      chips.push(`<span class="eod-chip warn">${stats.optionsExpired} option(s) expired</span>`);
    }
    const processWins = Array.isArray(stats.processWins) ? stats.processWins : [];
    for (const win of processWins) {
      if (!win?.text) continue;
      chips.push(`<span class="eod-chip process">${escapeHtml(win.text)}</span>`);
    }
    extra.innerHTML = chips.length ? `<div class="eod-chips">${chips.join('')}</div>` : '';
  }

  const btn = document.getElementById('day-summary-continue');
  if (btn) btn.textContent = `Start day ${(stats.day || 1) + 1}`;
  overlay.classList.remove('hidden');
  trapFocus(overlay);
}

export function hideDaySummary() {
  document.getElementById('day-summary-overlay')?.classList.add('hidden');
}

function renderLog(state) {
  const log = document.getElementById('trade-log');
  if (!log) return;
  log.innerHTML = state.portfolio.history.slice(0, 25).map(h => {
    const t = new Date(h.time).toLocaleTimeString();
    const pnl = h.pnl != null ? ` · P&L ${fmtPnL(h.pnl)}` : '';
    return `<div class="log-entry"><span class="log-time">${t}</span> ${h.action} ${h.sym || ''} ${h.shares || h.qty || ''} @ $${(h.price || 0).toFixed?.(2) || h.price}${pnl}</div>`;
  }).join('') || '<div class="empty">No trades yet</div>';
}

export function renderCheckpointList(slots = []) {
  const el = document.getElementById('checkpoint-list');
  if (!el) return;
  if (!slots.length) {
    el.innerHTML = '<div class="empty">No day checkpoints yet — play through a day to create one.</div>';
    return;
  }
  el.innerHTML = slots.map((s, i) => {
    const when = s.at ? new Date(s.at).toLocaleString() : '—';
    const equity = s.data?.portfolio ? null : null;
    return `
      <div class="checkpoint-row">
        <div>
          <strong>Day ${s.day ?? '?'}</strong>
          <div class="muted-text">${when}</div>
        </div>
        <button type="button" class="btn" data-restore-slot="${i}">Restore</button>
      </div>
    `;
  }).join('');
}

export function switchView(viewId) {
  const next = viewId || 'dashboard';
  const prev = activeViewId;
  activeViewId = next;
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`view-${next}`)?.classList.add('active');
  document.querySelector(`.nav-item[data-view="${next}"]`)?.classList.add('active');
  document.getElementById('btn-settings')?.classList.toggle('active', next === 'settings');
  closeMobileNav();
  if (next === 'ai') renderAiChatLog();
  // Estates / Achievements skip work while hidden — force a paint when entering.
  if (next === 'estates' && prev !== 'estates') {
    try {
      const root = document.getElementById('estates-root');
      if (root) root.dataset.estatesForce = '1';
    } catch (_) { /* ignore */ }
  }
  if (next === 'achievements' && prev !== 'achievements') {
    try {
      const grid = document.getElementById('achievements-grid');
      if (grid) grid.dataset.achForce = '1';
    } catch (_) { /* ignore */ }
  }
  if (next === 'collection' && prev !== 'collection') {
    try {
      const root = document.getElementById('collection-log-root');
      if (root) root.dataset.collectionForce = '1';
    } catch (_) { /* ignore */ }
  }
  if (next === 'vault' && prev !== 'vault') {
    try {
      const root = document.getElementById('vault-root');
      if (root) root.dataset.vaultForce = '1';
    } catch (_) { /* ignore */ }
  }
  if (prev === 'achievements' && next !== 'achievements') {
    const tip = document.getElementById('ach-cursor-tip');
    if (tip) {
      tip.hidden = true;
      tip.classList.remove('is-on');
    }
  }
  if (prev !== next) {
    viewChangeListeners.forEach((fn) => {
      try { fn(next, prev); } catch { /* ignore listener errors */ }
    });
  }
}

export function bindSettingsNav() {
  if (bindSettingsNav._bound) return;
  bindSettingsNav._bound = true;
  const nav = document.querySelector('.settings-nav');
  if (!nav) return;
  nav.querySelectorAll('[data-settings-tab]').forEach((btn) => {
    btn.onclick = () => {
      const tab = btn.dataset.settingsTab;
      nav.querySelectorAll('[data-settings-tab]').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('[data-settings-panel]').forEach((panel) => {
        panel.classList.toggle('active', panel.dataset.settingsPanel === tab);
      });
    };
  });
}

export function bindRightSidebarResize() {
  if (bindRightSidebarResize._bound) return;
  bindRightSidebarResize._bound = true;

  const shell = document.querySelector('.app-shell');
  const handle = document.getElementById('sidebar-right-resize');
  if (!shell || !handle) return;

  const clamp = (w) => Math.round(Math.min(RIGHT_SIDEBAR_W_MAX, Math.max(RIGHT_SIDEBAR_W_MIN, w)));

  const applyWidth = (w, persist = false) => {
    const width = clamp(w);
    shell.style.setProperty('--right-sidebar-w', `${width}px`);
    if (persist) {
      try { localStorage.setItem(RIGHT_SIDEBAR_W_KEY, String(width)); } catch { /* ignore */ }
    }
    return width;
  };

  try {
    const saved = Number(localStorage.getItem(RIGHT_SIDEBAR_W_KEY));
    if (saved) applyWidth(saved);
  } catch { /* ignore */ }

  let dragging = false;
  let startX = 0;
  let startW = RIGHT_SIDEBAR_W_DEFAULT;

  const onMove = (e) => {
    if (!dragging) return;
    const dx = startX - e.clientX;
    applyWidth(startW + dx);
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('is-dragging');
    document.body.classList.remove('is-resizing-right');
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    const raw = getComputedStyle(shell).getPropertyValue('--right-sidebar-w').trim();
    const w = parseInt(raw, 10) || RIGHT_SIDEBAR_W_DEFAULT;
    applyWidth(w, true);
    requestAnimationFrame(() => resizeChart());
  };

  handle.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    dragging = true;
    startX = e.clientX;
    const raw = getComputedStyle(shell).getPropertyValue('--right-sidebar-w').trim();
    startW = parseInt(raw, 10) || RIGHT_SIDEBAR_W_DEFAULT;
    handle.classList.add('is-dragging');
    document.body.classList.add('is-resizing-right');
    handle.setPointerCapture?.(e.pointerId);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  handle.addEventListener('dblclick', () => {
    applyWidth(RIGHT_SIDEBAR_W_DEFAULT, true);
    requestAnimationFrame(() => resizeChart());
  });
}

export function bindLeftSidebarResize() {
  if (bindLeftSidebarResize._bound) return;
  bindLeftSidebarResize._bound = true;

  const shell = document.querySelector('.app-shell');
  const handle = document.getElementById('sidebar-left-resize');
  if (!shell || !handle) return;

  const clamp = (w) => Math.round(Math.min(LEFT_SIDEBAR_W_MAX, Math.max(LEFT_SIDEBAR_W_MIN, w)));

  const applyWidth = (w, persist = false) => {
    const width = clamp(w);
    shell.style.setProperty('--left-sidebar-w', `${width}px`);
    if (persist) {
      try { localStorage.setItem(LEFT_SIDEBAR_W_KEY, String(width)); } catch { /* ignore */ }
    }
    return width;
  };

  try {
    const saved = Number(localStorage.getItem(LEFT_SIDEBAR_W_KEY));
    if (saved) applyWidth(saved);
  } catch { /* ignore */ }

  let dragging = false;
  let startX = 0;
  let startW = LEFT_SIDEBAR_W_DEFAULT;

  const onMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    applyWidth(startW + dx);
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('is-dragging');
    document.body.classList.remove('is-resizing-left');
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    const raw = getComputedStyle(shell).getPropertyValue('--left-sidebar-w').trim();
    const w = parseInt(raw, 10) || LEFT_SIDEBAR_W_DEFAULT;
    applyWidth(w, true);
    requestAnimationFrame(() => resizeChart());
  };

  handle.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    dragging = true;
    startX = e.clientX;
    const raw = getComputedStyle(shell).getPropertyValue('--left-sidebar-w').trim();
    startW = parseInt(raw, 10) || LEFT_SIDEBAR_W_DEFAULT;
    handle.classList.add('is-dragging');
    document.body.classList.add('is-resizing-left');
    handle.setPointerCapture?.(e.pointerId);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  handle.addEventListener('dblclick', () => {
    applyWidth(LEFT_SIDEBAR_W_DEFAULT, true);
    requestAnimationFrame(() => resizeChart());
  });
}

export function bindMobileNav() {
  if (bindMobileNav._bound) return;
  bindMobileNav._bound = true;
  const toggle = document.getElementById('nav-toggle');
  const overlay = document.getElementById('nav-drawer-overlay');
  if (!toggle || !overlay) return;

  const close = () => closeMobileNav();
  const open = () => {
    document.body.classList.add('nav-open');
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    toggle.setAttribute('aria-label', 'Close menu');
  };

  toggle.onclick = () => {
    document.body.classList.contains('nav-open') ? close() : open();
  };
  overlay.onclick = close;
  document.querySelectorAll('.sidebar-left .nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      if (window.matchMedia('(max-width: 768px)').matches) close();
    });
  });
}

export function closeMobileNav() {
  document.body.classList.remove('nav-open');
  const overlay = document.getElementById('nav-drawer-overlay');
  overlay?.classList.add('hidden');
  overlay?.setAttribute('aria-hidden', 'true');
  document.getElementById('nav-toggle')?.setAttribute('aria-label', 'Open menu');
}

function numberWheelStep(input) {
  const stepAttr = parseFloat(input.step);
  if (Number.isFinite(stepAttr) && stepAttr > 0) return stepAttr;
  if (input.id?.includes('shares') || input.classList.contains('loan-amt') || input.classList.contains('pay-amt')) return 1;
  return 0.01;
}

function formatWheelValue(val, step) {
  if (step >= 1 && Number.isInteger(step)) return String(Math.round(val));
  return val.toFixed(2);
}

export function installNumberWheelScroll() {
  if (installNumberWheelScroll._bound) return;
  installNumberWheelScroll._bound = true;

  document.addEventListener('wheel', (e) => {
    let input = e.target.closest?.('input[type=number]');
    if (!input && document.activeElement?.matches?.('input[type=number]:not([disabled]):not([readonly])')) {
      input = document.activeElement;
    }
    if (!input || input.disabled || input.readOnly) return;
    if (document.activeElement !== input && !input.matches(':hover')) return;

    e.preventDefault();
    const step = numberWheelStep(input);
    const min = input.min !== '' ? parseFloat(input.min) : null;
    const max = input.max !== '' ? parseFloat(input.max) : null;
    const dir = e.deltaY < 0 ? 1 : -1;
    const raw = input.value.trim();
    const hasVal = raw !== '' && Number.isFinite(parseFloat(raw));

    if (!hasVal) {
      if (dir > 0) {
        const start = min ?? step;
        input.value = formatWheelValue(start, step);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return;
    }

    let val = parseFloat(raw) + dir * step;
    if (min != null) val = Math.max(min, val);
    if (max != null) val = Math.min(max, val);
    // Loan amounts: never scroll past what the bank will approve
    if (input.classList.contains('loan-amt') && max != null && dir > 0 && parseFloat(raw) >= max) {
      return;
    }
    input.value = formatWheelValue(val, step);
    if (input.classList.contains('loan-amt') && input.dataset.bank) {
      setLoanDraftAmount(input.dataset.bank, parseFloat(input.value));
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, { passive: false });
}
