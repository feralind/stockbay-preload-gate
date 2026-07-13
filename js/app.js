// @ts-check
import { CONFIG, PERKS, canPurchasePerk } from './config.js';
import { purchasePerk } from './perks.js';
import { runDayEndSettlement } from './day-end.js';
import {
  initApi, fetchQuote, getCachedQuote, isApiConfigured, fetchMarketNews, startQuoteRefresh,
  fillMissingQuotes, refreshQuotesMidRun, filterSymbolsForQuoteRefresh,
  startSimulationMode, isNetworkOnline, getConnectionLabel,
  persistQuoteBaselines, mergeQuoteRefreshSymbols, getTickerSymbols, isSimulationMode,
  getHeldSymbols, seedQuotesForPositions, onQuoteTransition, ensureLiveQuoteForDisplay,
  isLiveAnchoredQuote, seedQuote, applyLiveAnchor, markCloudProxyConfigured,
  parsePreloadProgress, countLiveAnchoredQuotes, loadPersistedBaselines,
  startBackgroundQuotePreload,
} from './api.js';
import {
  startMarket, onMarketTick, pauseMarket, resumeMarket, stopMarketClock, serializeMarket, loadMarket, isMarketOpen,
  snapshotDayStart, getDayCount, recordDayTrade, setMarketSpeed, getMarketSpeed, formatMarketClock,
  bindVisibilityAutoPause, isMarketRunning, getMarketTime, isThinSession, forceAdvanceGameDay, resetMarketForNewRun,
  checkCircuitBreaker, isSymbolHalted,
} from './market.js';
import { processEarningsForDay, processDividendsForDay } from './corporate-actions.js';
import {
  createPortfolio, buyLong, sellLong,
  getNetEquity,
  ensurePendingOrders, ensureOrderTickets,
  markPriceCorrectedNotices,
} from './portfolio.js';
import {
  confirmOrderFlow,
  evaluateRiskFlow,
  cancelPendingOrderFlow,
  closeLongFlow,
  coverShortFlow,
  buyOptionFlow,
  buildQuickExitOrder,
  buildTradeDraft,
  closeOptionFlow,
} from './trade-engine.js';
import { processMarginCallTick, MARGIN_CALL_GRACE_MINUTES } from './margin-call.js';
import { applyRelicAwareSlippage, getDeskMarginGraceMinutes } from './desk-rules.js';
import { getMacroState } from './macro.js';
import { isTaxDay, settleTaxDay } from './tax.js';
import { startEventEngine, onEvent } from './events.js';
import { initChart, applyChartTheme, resizeChart, zoomChart, resetChartZoom, updateLastCandleFromQuote } from './chart.js';
import { initThemePanel } from './theme.js';
import {
  tickStaff, hireStaff, fireStaff, trainStaff, renameStaff, STAFF_ROLES,
} from './staff.js';
import { generateDailyPicks } from './ai.js';
import {
  createAchievementState, evaluateAchievements, claimAchievement, claimAllAchievements,
} from './achievements.js';
import {
  needsOnboarding, showOnboarding, bindHelpUI, markOnboarded,
} from './help.js';
import {
  startFirstTradeWalkthrough, completeWalkthroughReset, checkAndShowPerkCallouts,
  maybeStartPortfolioTour, maybeShowMarginCallCoach, maybeShowCircuitHaltCoach,
  maybeShowSimStatusCoach, showCoachmark, hideCoachmark,
} from './onboarding-walkthrough.js';
import {
  createFinanceState, takeLoan, makeLoanPayment, quoteLoan, getTotalDebt,
  BANKS, bankDebt, otherBanksDebt, typeDebt,
} from './finance.js';
import {
  createMetaState, adjustReputation, recordEquityPoint, rollDailyChallenge,
  updateChallengeProgress, claimChallenge, resetDayCounters, recordClosedTrade, repTitle, repFromPnL,
} from './meta.js';
import { getVaultItem, getVaultSlotForItem, purchaseVaultItem, getVaultBookValue, getVaultDeskAura, applyVaultDeskAuraOnClose, togglePledgedVaultItem, getVaultPledgedAppraisal, sanitizeVaultPledged } from './vault.js';
import {
  getBlackMarketItem, getTodaysBlackMarketListing, maybeShowBlackMarketLegendaryCoach, purchaseBlackMarketItem,
  recordExpiredBlackMarketSeen, BLACKMARKET_ITEM_POOL,
} from './blackmarket.js';
import {
  sanitizeEquippedRelics,
  toggleEquippedRelic,
  tryAutoEquipRelic,
} from './relics.js';
import { isSeatListingActive, purchaseSeat, THE_SEAT } from './the-seat.js';
import { purchaseOfficeUpgrade, sanitizeOfficeProgress } from './office.js';
import { purchaseLuxury, sanitizeLuxuryProgress } from './luxury.js';
import { claimMegaGoal } from './mega-goals.js';
import {
  getActiveSalonListing, purchaseSalonItem, PRIVATE_SALON_POOL, collectExpiredSalonIds,
} from './private-salon.js';
import { claimCollectionMilestone } from './collection-log.js';
import { claimSetFlair } from './collection-flavor.js';
import {
  renderAll, generateListings, closeModal, getModalShares,
  renderListingSearchResults, showMoreListings, resetListingsPage,
  setListingsSort, getListingsSort, getFullListingsTotal,
  syncListingsFromQuotes, getVisibleListingSymbols, getListingsViewportSymbols,
  onViewChange, getActiveView,
  loadChart, setChartResolution, getSelectedSym,
  switchView, showChartTab, addToWatchlist, removeFromWatchlist, getWatchlist, renderNews,
  refreshAiAnalysis, bindAiChat, showDaySummary, hideDaySummary, openOrderConfirm,
  installNumberWheelScroll, bindMobileNav, bindSettingsNav, bindRightSidebarResize, bindLeftSidebarResize, bindProfileSettings, openPriceAlert, checkWatchlistAlerts, getWatchlistAlerts, loadWatchlistAlerts,
  closeOrderConfirm, closeMobileNav, getAiChatHistory, loadAiChatHistory, renderPendingOrders, renderCheckpointList, bindStatPopovers,
  getAlertHistory, loadAlertHistory, renderWatchlist, refreshOpenOptionsPanel, getSelectedListing,
  startHotListingsRotation, stopHotListingsRotation, getHotListingPoolSymbols,
  getHotListingPool, reseedHotListingRotation, advanceHotListingRotation, getHotRotationOffset,
  pauseHotListingRotation, scheduleHotListingResume, isHotListingRotationPaused,
} from './ui.js';
import { initGlossaryTooltips } from './glossary-tooltips.js';
import { archiveRun } from './leaderboard.js';
import { toast, clearToasts, showAlert, showConfirm, bindDialogUI, deferDaySummary, isCoachQuiet, clearDeferredNotifications } from './notify.js';
import { bindSaveIO } from './save-io.js';
import { sanitizeRunData } from './save-sanitize.js';
import { bindOverlayStack, registerOverlayClosers } from './overlays.js';
import { bindHotkeys } from './hotkeys.js';
import { installUiSounds, sfxBuy, sfxSell, sfxSuccess, sfxError, sfxToggle } from './sfx.js';
import { resolveTickerInput, searchSymbols } from './symbols.js';
import { getProfile, setProfileCosmetic } from './profile.js';

const state = {
  portfolio: createPortfolio(),
  perks: [],
  staff: [],
  staffLog: [],
  listings: [],
  aiTopPick: null,
  apiStatus: { mode: 'offline', label: 'Starting…' },
  log: [],
  achievements: createAchievementState(),
  stats: {
    hires: 0, fires: 0, shortsOpened: 0, greenDays: 0, greenStreak: 0,
    profitableShorts: 0, loansPaidEarly: 0, alertsSet: 0, staffMistakes: 0,
  },
  finance: createFinanceState(),
  meta: createMetaState(),
  vaultOwned: [],
  vaultSpentTotal: 0,
  vaultPledged: [],
  salonSpentTotal: 0,
  salonSeenExpired: [],
  blackMarketOwned: [],
  blackMarketEquippedRelics: [],
  blackMarketSeenExpired: [],
  blackMarketSpentTotal: 0,
  seatOwned: false,
  seatPurchaseDay: null,
  seatSpentTotal: 0,
  officeTierId: 'bedroom',
  officeSpentTotal: 0,
  luxuryOwned: [],
  luxurySpentTotal: 0,
  collectionClaims: [],
  collectionRewardCashTotal: 0,
  daySummaryPending: null,
};

function achievementContext() {
  const debt = getTotalDebt(state.finance);
  return {
    ...state,
    equity: getNetEquity(state.portfolio, debt),
    dayCount: getDayCount(),
  };
}

function checkAchievements(shouldNotify = true) {
  const newly = evaluateAchievements(achievementContext(), state.achievements);
  if (newly.length) {
    saveGame({ immediate: true });
    if (shouldNotify) {
      const label = `Unlocked: ${newly.map((a) => a.name).join(', ')}`;
      // Quiet mode: defer toast; skip status flash so the coachmark isn't interrupted
      if (!isCoachQuiet()) {
        state.apiStatus = { mode: 'online', label };
      }
      toast(label, { type: 'success' });
    }
  }
  return newly;
}

function buildSaveData() {
  ensurePendingOrders(state.portfolio);
  ensureOrderTickets(state.portfolio);
  return {
    v: 2,
    savedAt: Date.now(),
    portfolio: state.portfolio,
    perks: state.perks,
    staff: state.staff,
    staffLog: state.staffLog,
    market: serializeMarket(),
    watchlist: getWatchlist(),
    watchlistAlerts: getWatchlistAlerts(),
    alertHistory: getAlertHistory(),
    achievements: state.achievements,
    stats: state.stats,
    finance: state.finance,
    meta: state.meta,
    vaultOwned: state.vaultOwned,
    vaultSpentTotal: state.vaultSpentTotal,
    vaultPledged: state.vaultPledged,
    salonSpentTotal: state.salonSpentTotal,
    salonSeenExpired: state.salonSeenExpired,
    blackMarketOwned: state.blackMarketOwned,
    blackMarketEquippedRelics: state.blackMarketEquippedRelics,
    blackMarketSeenExpired: state.blackMarketSeenExpired,
    blackMarketSpentTotal: state.blackMarketSpentTotal,
    seatOwned: state.seatOwned,
    seatPurchaseDay: state.seatPurchaseDay,
    seatSpentTotal: state.seatSpentTotal,
    officeTierId: state.officeTierId,
    officeSpentTotal: state.officeSpentTotal,
    luxuryOwned: state.luxuryOwned,
    luxurySpentTotal: state.luxurySpentTotal,
    collectionClaims: state.collectionClaims,
    collectionRewardCashTotal: state.collectionRewardCashTotal,
    aiChat: getAiChatHistory(),
  };
}

let saveTimer = null;
let saveDirty = false;
let autosaveInterval = null;
let shutdownToken = '';

function writeSaveToDisk() {
  if (window.__stockwayDisableSave) return false;
  try {
    const data = buildSaveData();
    const payload = JSON.stringify(data);
    const key = CONFIG.SAVE_KEY;
    localStorage.setItem(`${key}__tmp`, payload);
    localStorage.setItem(key, payload);
    localStorage.removeItem(`${key}__tmp`);

    try {
      const day = data?.market?.dayCount ?? data?.meta?.dayCount ?? 0;
      const slotKey = `${key}_slot`;
      const slots = JSON.parse(localStorage.getItem(slotKey) || '[]');
      const entry = { at: data.savedAt, day, data };
      const next = [entry, ...slots.filter((s) => s.day !== day)].slice(0, 3);
      localStorage.setItem(slotKey, JSON.stringify(next));
    } catch (_) { /* slots are best-effort */ }

    saveDirty = false;
    return true;
  } catch (e) {
    console.warn('Save failed', e);
    return false;
  }
}

/** Wipe run keys so Day 1 / $500 starts fresh. Keeps profile + theme + sidebar width. */
function clearAllSaveData({ archive = true, keepQuoteBaseline = false } = {}) {
  if (archive) {
    try {
      archiveRun({
        equity: getNetEquity(state.portfolio, getTotalDebt(state.finance)),
        day: getDayCount(),
        rep: state.meta?.reputation || 0,
        label: 'Reset desk',
      });
    } catch (_) { /* best-effort */ }
  }
  window.__stockwayDisableSave = true;
  saveDirty = false;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const key = CONFIG.SAVE_KEY;
  const wipeKeys = [
    key,
    `${key}__tmp`,
    `${key}_slot`,
    'stockway_onboarded_v1',
    'stockway_alert_history_v1',
  ];
  if (!keepQuoteBaseline) wipeKeys.push(CONFIG.QUOTE_BASELINE_KEY);
  wipeKeys.forEach((k) => {
    try { localStorage.removeItem(k); } catch (_) {}
  });
  // Reset in-memory market + Fed before reload (Day 1, Pre-Market, Fed 4.50%)
  try { resetMarketForNewRun(); } catch (_) { /* ignore */ }
  try { clearDeferredNotifications(); } catch (_) { /* ignore */ }
  try { clearToasts(); } catch (_) { /* ignore */ }
}

/** First-launch / Reset boot gate — progress driven by initApi emitStatus labels. */
function updateQuotePreloadModal(label, target = CONFIG.QUOTE_PRELOAD_GATE_TARGET || 50) {
  const progress = parsePreloadProgress(label);
  const loaded = progress?.loaded ?? 0;
  const goal = progress?.target ?? target;
  const countEl = document.getElementById('quote-preload-count');
  const fillEl = document.getElementById('quote-preload-fill');
  if (countEl) countEl.textContent = `${loaded} / ${goal} tickers loaded`;
  if (fillEl) fillEl.style.width = `${Math.min(100, Math.round((loaded / Math.max(1, goal)) * 100))}%`;
}

function showQuotePreloadModal(target = CONFIG.QUOTE_PRELOAD_GATE_TARGET || 50) {
  const overlay = document.getElementById('quote-preload-overlay');
  if (!overlay) return;
  updateQuotePreloadModal(`Loading quotes… 0 / ${target}`, target);
  const skip = document.getElementById('quote-preload-skip');
  if (skip) {
    skip.classList.add('hidden');
    skip.disabled = false;
    skip.textContent = 'Continue anyway';
  }
  overlay.classList.remove('hidden');
}

function hideQuotePreloadModal() {
  document.getElementById('quote-preload-overlay')?.classList.add('hidden');
}

function listCheckpoints() {
  try {
    return JSON.parse(localStorage.getItem(`${CONFIG.SAVE_KEY}_slot`) || '[]');
  } catch {
    return [];
  }
}

function restoreCheckpoint(index) {
  const slots = listCheckpoints();
  const entry = slots[index];
  if (!entry?.data) return false;
  try {
    localStorage.setItem(CONFIG.SAVE_KEY, JSON.stringify(entry.data));
    return true;
  } catch {
    return false;
  }
}

/** Progressive save — debounced by default; pass { immediate: true } for trades / quit / manual. */
function saveGame(opts = {}) {
  const immediate = opts === true || opts?.immediate === true;
  saveDirty = true;
  if (immediate) {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    return writeSaveToDisk();
  }
  if (saveTimer) return false;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (saveDirty) writeSaveToDisk();
  }, CONFIG.AUTOSAVE_DEBOUNCE_MS || 1500);
  return false;
}

/** Force write now — used on close / hide / quit. */
function flushSave() {
  if (window.__stockwayDisableSave) return false;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  return writeSaveToDisk();
}

function startAutosaveHeartbeat() {
  if (autosaveInterval) clearInterval(autosaveInterval);
  const ms = CONFIG.AUTOSAVE_INTERVAL_MS || 30000;
  autosaveInterval = setInterval(() => {
    if (state.daySummaryPending) return;
    saveDirty = true;
    writeSaveToDisk();
  }, ms);
}

/** Deal Desk viewport-priority live refresh (page-sized, ahead of background rotation). */
let listingsViewportTimer = null;
let listingsViewportInFlight = false;
let listingsViewportSeq = 0;

function stopListingsViewportRefresh() {
  if (listingsViewportTimer) {
    clearInterval(listingsViewportTimer);
    listingsViewportTimer = null;
  }
}

/**
 * Live-fetch still-seed / unanchored symbols currently on the Deal Desk (and hot mini / search).
 * Uses refreshQuotesMidRun — force:false + seed-only filter; live-anchored sim tape stays put.
 */
async function refreshListingsViewportQuotes({ reason = 'viewport' } = {}) {
  const viewport = getListingsViewportSymbols(state);
  if (!viewport.length) return { ok: false, fetched: 0, viewport: [] };

  const seq = ++listingsViewportSeq;
  listingsViewportInFlight = true;
  try {
    if (!isNetworkOnline() || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      const toFill = filterSymbolsForQuoteRefresh(viewport);
      fillMissingQuotes(toFill.length ? toFill : viewport);
      syncListingsFromQuotes(state, viewport, { rescaleAsks: true });
      renderAll(state);
      return { ok: false, fetched: 0, viewport, reason, offline: true };
    }
    const mid = await refreshQuotesMidRun(viewport);
    // Drop stale completions if a newer viewport kick started
    if (seq !== listingsViewportSeq) {
      return { ok: true, fetched: mid.fetched, viewport, stale: true, reason, skipped: mid.skipped };
    }
    startSimulationMode();
    syncListingsFromQuotes(state, viewport, { rescaleAsks: mid.fetched > 0 });
    // Hot listings are always visible — paint even when Deal Desk isn't the active view.
    renderAll(state);
    return {
      ok: mid.ok || mid.fetched === 0,
      fetched: mid.fetched,
      viewport,
      reason,
      refreshed: mid.refreshed,
      skipped: mid.skipped,
    };
  } finally {
    if (seq === listingsViewportSeq) listingsViewportInFlight = false;
  }
}

function kickListingsViewportRefresh(reason = 'kick') {
  // Fire-and-forget; overlapping kicks bump seq so only the latest paint sticks
  refreshListingsViewportQuotes({ reason }).catch(() => {});
}

/** Prefetch full Hot listings pool so rotated-in cards never flash seed prices. */
function kickHotPoolPrefetch(reason = 'hot-pool') {
  const pool = getHotListingPoolSymbols(state);
  if (!pool.length) return;
  kickListingsViewportRefresh(reason);
}

function regenerateListingsFeed() {
  state.listings = generateListings(state);
  reseedHotListingRotation();
  kickHotPoolPrefetch('listings-reseed');
}

function startListingsViewportRefresh() {
  stopListingsViewportRefresh();
  kickListingsViewportRefresh('enter');
  const ms = CONFIG.LISTINGS_VIEWPORT_REFRESH_MS || 12000;
  listingsViewportTimer = setInterval(() => {
    if (document.visibilityState === 'hidden') return;
    if (getActiveView() !== 'listings') return;
    kickListingsViewportRefresh('interval');
  }, ms);
}

function bindHotListingsRotation() {
  startHotListingsRotation(
    () => state,
    (meta) => {
      if (meta?.prefetchOnly) {
        kickHotPoolPrefetch('hot-wait-live');
        return;
      }
      renderAll(state);
    },
  );
  kickHotPoolPrefetch('hot-start');
}

function bindListingsViewportRefresh() {
  onViewChange((viewId) => {
    if (viewId === 'listings') startListingsViewportRefresh();
    else stopListingsViewportRefresh();
    maybeStartPortfolioTour(viewId, {
      state,
      saveGame,
      renderAll,
    });
  });
  if (getActiveView() === 'listings') startListingsViewportRefresh();
}

function bindSaveLifecycle() {
  window.__stockwayFlushSave = () => {
    try { return flushSave(); } catch { return false; }
  };

  const onLeave = () => { flushSave(); };
  window.addEventListener('pagehide', onLeave);
  window.addEventListener('beforeunload', onLeave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
  });
}

function loadGame() {
  try {
    let raw = localStorage.getItem(CONFIG.SAVE_KEY);
    if (!raw) {
      // Recover from rotating slot if main key missing
      try {
        const slots = JSON.parse(localStorage.getItem(`${CONFIG.SAVE_KEY}_slot`) || '[]');
        if (slots[0]?.data) raw = JSON.stringify(slots[0].data);
      } catch (_) {}
    }
    if (!raw) return false;
    const data = sanitizeRunData(JSON.parse(raw));
    if (!data) return false;
    if (data.portfolio) {
      state.portfolio = data.portfolio;
      ensurePendingOrders(state.portfolio);
      ensureOrderTickets(state.portfolio);
      // v1 shorts credited sale proceeds into cash; v2 locks margin only.
      if ((data.v || 1) < 2) {
        Object.values(state.portfolio.shorts || {}).forEach((p) => {
          if (!p?.shares || !p.avgPrice) return;
          state.portfolio.cash -= p.shares * p.avgPrice;
        });
        if (state.portfolio.cash < 0) state.portfolio.cash = 0;
      }
    }
    if (data.perks) state.perks = data.perks;
    if (data.staff) {
      state.staff = data.staff.map(s => ({
        tier: 'newbie', profitGenerated: 0, mistakes: 0, status: 'Ready', progress: 0, history: [],
        ...s,
      }));
    }
    if (data.staffLog) state.staffLog = data.staffLog;
    if (data.market) loadMarket(data.market);
    // Backfill option days AFTER market load so dayCount is correct
    if (state.portfolio?.options?.length) {
      const day = getDayCount();
      state.portfolio.options.forEach((opt) => {
        if (opt.openedDay == null) opt.openedDay = day;
        if (opt.expiryDay == null) opt.expiryDay = opt.openedDay + (opt.expiryDays || 30);
      });
    }
    if (data.watchlist?.length) data.watchlist.forEach(s => addToWatchlist(s));
    if (data.watchlistAlerts) loadWatchlistAlerts(data.watchlistAlerts);
    if (data.alertHistory) loadAlertHistory(data.alertHistory);
    if (data.achievements) state.achievements = data.achievements;
    if (data.stats) state.stats = { ...state.stats, ...data.stats };
    if (data.finance) state.finance = { ...createFinanceState(), ...data.finance };
    if (data.meta) state.meta = { ...createMetaState(), ...data.meta };
    if (Array.isArray(data.vaultOwned)) state.vaultOwned = data.vaultOwned.slice();
    state.vaultSpentTotal = Math.max(0, Number(data.vaultSpentTotal) || 0);
    if (Array.isArray(data.vaultPledged)) state.vaultPledged = data.vaultPledged.slice();
    else state.vaultPledged = [];
    state.vaultPledged = sanitizeVaultPledged(state.vaultPledged, state.vaultOwned);
    state.salonSpentTotal = Math.max(0, Number(data.salonSpentTotal) || 0);
    if (Array.isArray(data.salonSeenExpired)) state.salonSeenExpired = data.salonSeenExpired.slice();
    else state.salonSeenExpired = [];
    if (Array.isArray(data.blackMarketOwned)) state.blackMarketOwned = data.blackMarketOwned.slice();
    if (Array.isArray(data.blackMarketEquippedRelics)) state.blackMarketEquippedRelics = data.blackMarketEquippedRelics.slice();
    if (Array.isArray(data.blackMarketSeenExpired)) state.blackMarketSeenExpired = data.blackMarketSeenExpired.slice();
    state.blackMarketSpentTotal = Math.max(0, Number(data.blackMarketSpentTotal) || 0);
    state.seatOwned = !!data.seatOwned;
    state.seatPurchaseDay = data.seatPurchaseDay != null ? Math.max(1, Math.floor(Number(data.seatPurchaseDay) || 1)) : null;
    state.seatSpentTotal = Math.max(0, Number(data.seatSpentTotal) || 0);
    {
      const office = sanitizeOfficeProgress({
        officeTierId: data.officeTierId,
        officeSpentTotal: data.officeSpentTotal,
      });
      state.officeTierId = office.officeTierId;
      state.officeSpentTotal = office.officeSpentTotal;
    }
    {
      const luxury = sanitizeLuxuryProgress({
        luxuryOwned: data.luxuryOwned,
        luxurySpentTotal: data.luxurySpentTotal,
      });
      state.luxuryOwned = luxury.luxuryOwned;
      state.luxurySpentTotal = luxury.luxurySpentTotal;
    }
    state.collectionClaims = Array.isArray(data.collectionClaims) ? data.collectionClaims.slice() : [];
    state.collectionRewardCashTotal = Math.max(0, Number(data.collectionRewardCashTotal) || 0);
    state.blackMarketEquippedRelics = sanitizeEquippedRelics(state.blackMarketEquippedRelics, {
      ownedRelics: state.blackMarketOwned,
      seatOwned: state.seatOwned,
    });
    if (data.aiChat) loadAiChatHistory(data.aiChat);
    return true;
  } catch (e) {
    console.warn('Save load failed', e);
    return false;
  }
}

function noteBuy(isDeal = false) {
  state.meta.dayBuys = (state.meta.dayBuys || 0) + 1;
  if (isDeal && state.meta.challenge) {
    state.meta.challenge.dealBuys = (state.meta.challenge.dealBuys || 0) + 1;
  }
}

function noteSell(pnl = 0) {
  state.meta.daySells = (state.meta.daySells || 0) + 1;
  recordClosedTrade(state.meta, pnl);
}

function maybeApplyVaultDeskAura(pnl = 0) {
  const profile = getProfile();
  const aura = getVaultDeskAura({
    cosmetics: profile?.cosmetics || {},
    vaultOwned: state.vaultOwned,
    perks: state.perks,
  });
  const result = applyVaultDeskAuraOnClose(state.meta, pnl, aura);
  if (result.applied > 0) {
    adjustReputation(state.meta, result.applied, 'vault_aura');
    toast(`Desk Prestige +${result.applied} REP`, { type: 'info' });
  }
  return result;
}

function noteProfitableShort(pnl) {
  if (pnl > 0) state.stats.profitableShorts = (state.stats.profitableShorts || 0) + 1;
}

function applyConfirmOrderResult(result) {
  if (!result?.ok) {
    if (result?.sound === 'error') sfxError();
    if (result?.alert) showAlert(result.msg, result.alert);
    return;
  }

  if (result.toast) toast(result.toast.msg, { type: result.toast.type });

  if (result.kind === 'close') {
    noteSell(result.pnl || 0);
    if (result.action === 'cover') noteProfitableShort(result.pnl || 0);
    recordDayTrade(result.pnl || 0);
    adjustReputation(state.meta, repFromPnL(result.pnl || 0), result.action === 'cover' ? 'cover' : 'close');
    maybeApplyVaultDeskAura(result.pnl || 0);
  } else if (result.kind === 'open') {
    if (result.incrementShortsOpened) state.stats.shortsOpened = (state.stats.shortsOpened || 0) + 1;
    noteBuy(!!result.isDeal);
    recordDayTrade();
    adjustReputation(state.meta, result.reputationDelta, result.reputationReason);
    if (result.updateChallengeProgress) {
      updateChallengeProgress(state.meta, {
        trades: (state.meta.dayBuys || 0) + (state.meta.daySells || 0),
        staffActions: state.meta.dayStaffActions || 0,
        equityDelta: 0,
        cashDelta: 0,
      });
    }
    if (result.regenerateListings) regenerateListingsFeed();
  }

  if (result.closeOrderConfirm) closeOrderConfirm();
  if (result.closeModal) closeModal();
  if (result.sound === 'buy' || result.sound === 'cover') sfxBuy();
  else if (result.sound === 'sell') sfxSell();
  if (result.checkAchievements) checkAchievements();
  if (result.save) saveGame(result.save);
  if (result.render) renderAll(state);
  if (result.checkPerkCallouts) checkAndShowPerkCallouts(state, { saveGame });
}

function applyCloseOptionResult(result) {
  if (!result?.ok) return;
  if (result.noteSell) {
    noteSell(result.pnl || 0);
    maybeApplyVaultDeskAura(result.pnl || 0);
  }
  if (result.recordDayTrade) recordDayTrade();
  if (result.checkAchievements) checkAchievements();
  if (result.save) saveGame(result.save);
  if (result.render) renderAll(state);
}

function syncBlackMarketForCurrentDay() {
  recordExpiredBlackMarketSeen(state, getDayCount());
  const listing = getTodaysBlackMarketListing(getDayCount(), { ownedIds: state.blackMarketOwned });
  maybeShowBlackMarketLegendaryCoach(state, listing, {
    showCoachmark,
    hideCoachmark,
    saveGame,
    switchView,
  });
}

function bindState() {
  state.onSaveGame = () => {
    saveGame({ immediate: true });
    checkAchievements(false);
  };
  state.onAiChatPersist = () => saveGame({ immediate: true });

  state.onSelectSymbol = async (sym) => {
    // Only force re-anchor before sim starts — mid-session force yanked prices to live market
    await fetchQuote(sym, { force: isNetworkOnline() && !isSimulationMode() });
    await loadChart(sym, state.perks.includes('analyst'));
    // Candle load syncs quote cache — push that into deal-desk cards for this symbol
    syncListingsFromQuotes(state, [sym], { rescaleAsks: true });
    if (state.perks.includes('aiAdvisor')) refreshAiAnalysis(state);
    renderAll(state);
  };

  state.onTrade = (side, listing) => {
    const shares = getModalShares();
    openOrderConfirm(buildTradeDraft(side, listing, shares), state);
  };

  state.onConfirmOrder = async (order) => {
    const result = await confirmOrderFlow(state, order, {
      isLiveAnchoredQuote,
      ensureLiveQuoteForDisplay,
      getCachedQuote,
      applySlippage: (args) => applyRelicAwareSlippage(state, args),
    });
    applyConfirmOrderResult(result);
  };

  state.onCancelPendingOrder = (orderId) => {
    const result = cancelPendingOrderFlow(state, orderId);
    if (!result.ok) {
      showAlert(result.msg, result.alert);
      return;
    }
    if (result.toast) toast(result.toast.msg, { type: result.toast.type || 'info' });
    if (result.save) saveGame(result.save);
    if (result.render) renderAll(state);
  };

  state.onRemoveWatchlist = (sym) => {
    removeFromWatchlist(sym);
    toast(`${sym} removed from watchlist`, { type: 'info' });
    saveGame();
    renderAll(state);
  };

  state.onCloseLong = (sym) => {
    const result = closeLongFlow(state, sym, {
      getCachedQuote,
      applySlippage: (args) => applyRelicAwareSlippage(state, args),
      confirmNotional: CONFIG.CONFIRM_NOTIONAL_USD,
    });
    if (result?.needsConfirm) {
      openOrderConfirm(result.confirmDraft, state);
      return;
    }
    applyConfirmOrderResult(result);
  };

  state.onCoverShort = (sym) => {
    const result = coverShortFlow(state, sym, {
      getCachedQuote,
      applySlippage: (args) => applyRelicAwareSlippage(state, args),
      confirmNotional: CONFIG.CONFIRM_NOTIONAL_USD,
    });
    if (result?.needsConfirm) {
      openOrderConfirm(result.confirmDraft, state);
      return;
    }
    applyConfirmOrderResult(result);
  };

  state.onCloseOption = (id) => {
    const result = closeOptionFlow(state, id);
    applyCloseOptionResult(result);
  };

  state.onBuyOption = async (opt) => {
    const result = await buyOptionFlow(state, opt, {
      ensureLiveQuoteForDisplay,
      isLiveAnchoredQuote,
      getCachedQuote,
    });
    if (!result.ok) {
      if (result.sound === 'error') sfxError();
      showAlert(result.msg, result.alert);
      return;
    }
    if (result.closeModal) closeModal();
    if (result.noteBuy) noteBuy();
    if (result.recordDayTrade) recordDayTrade();
    if (result.sound === 'buy') sfxBuy();
    if (result.checkAchievements) checkAchievements();
    if (result.save) saveGame(result.save);
    if (result.render) renderAll(state);
  };

  state.onBuyPerk = async (id) => {
    const perk = PERKS[id];
    if (!perk || state.perks.includes(id)) return;
    const gate = canPurchasePerk(perk, {
      cash: state.portfolio.cash,
      perks: state.perks,
      reputation: state.meta?.reputation ?? 0,
    });
    if (!gate.ok) {
      sfxError();
      showAlert(gate.reason, {
        title: gate.code === 'rep' ? 'REP required' : 'Locked perk',
        label: 'SHOP',
      });
      return;
    }
    if (perk.cost >= CONFIG.CONFIRM_PERK_COST) {
      const repNote = perk.repRequired
        ? `<br><span style="color:var(--muted);font-size:12px">${perk.tierLabel || 'Rank'} · ${perk.repRequired} REP met</span>`
        : '';
      const ok = await showConfirm(
        `Unlock <strong>${perk.name}</strong> for <strong>$${perk.cost.toLocaleString()}</strong>?${repNote}`,
        { title: 'Confirm perk purchase', label: 'SHOP', okText: `Buy $${perk.cost.toLocaleString()}`, cancelText: 'Cancel' },
      );
      if (!ok) return;
    }
    const result = purchasePerk(state, id);
    if (!result.ok) {
      sfxError();
      showAlert(result.msg || 'Cannot unlock perk.', {
        title: result.code === 'rep' ? 'REP required' : 'Locked perk',
        label: 'SHOP',
      });
      return;
    }
    sfxSuccess();
    toast(`Unlocked ${perk.name}`, { type: 'success' });
    regenerateListingsFeed();
    checkAchievements();
    saveGame();
    renderAll(state);
    checkAndShowPerkCallouts(state, { saveGame });
    restartEventEngine();
    if (id === 'analyst') loadChart(getSelectedSym(), true);
    if (id === 'aiAdvisor') refreshAiAnalysis(state);
  };

  state.onBuyVaultItem = async (itemId) => {
    const item = getVaultItem(itemId);
    if (!item || state.vaultOwned.includes(item.id)) return;
    const isMasterwork = String(item.rarity || '').toLowerCase() === 'masterwork';
    const confirmNote = isMasterwork
      ? 'Masterwork collectible — books into Net Worth with extra Desk Prestige when equipped. Not buying power.'
      : 'Collectible appraisal books into Net Worth. Equip for Desk Prestige (capped REP on profitable closes). Not buying power.';
    if (item.cost >= CONFIG.CONFIRM_NOTIONAL_USD) {
      const ok = await showConfirm(
        `Purchase <strong>${item.name}</strong> for <strong>$${item.cost.toLocaleString()}</strong>?<br><span style="color:var(--muted);font-size:12px">${confirmNote}</span>`,
        { title: isMasterwork ? 'Confirm masterwork purchase' : 'Confirm vault purchase', label: 'VAULT', okText: `Buy $${item.cost.toLocaleString()}`, cancelText: 'Cancel' },
      );
      if (!ok) return;
    }
    const result = purchaseVaultItem(state, itemId);
    if (!result.ok) {
      sfxError();
      showAlert(result.msg, { title: 'Vault', label: 'VAULT' });
      return;
    }
    sfxSuccess();
    toast(`Unlocked ${item.name}`, { type: 'success' });
    saveGame();
    renderAll(state);
  };

  state.onBuySalonItem = async (itemId) => {
    const listing = getActiveSalonListing(getDayCount(), { ownedIds: state.vaultOwned });
    const item = listing.item?.id === itemId ? listing.item : null;
    if (!item) {
      showAlert('This crown listing is no longer active.', { title: 'Private Salon', label: 'SALON' });
      return;
    }
    const ok = await showConfirm(
      `Acquire <strong>${item.name}</strong> for <strong>$${item.cost.toLocaleString()}</strong>?<br><span style="color:var(--muted);font-size:12px">Ultra-rare salon window — crown jewel books into Net Worth with flagship Desk Prestige. Not buying power. Late loan default can repossess pledged pieces.</span>`,
      { title: 'Confirm crown purchase', label: 'SALON', okText: `Acquire $${item.cost.toLocaleString()}`, cancelText: 'Cancel' },
    );
    if (!ok) return;
    const result = purchaseSalonItem(state, item, getDayCount());
    if (!result.ok) {
      sfxError();
      showAlert(result.msg, { title: 'Private Salon', label: 'SALON' });
      return;
    }
    sfxSuccess();
    toast(`Acquired crown jewel: ${item.name}`, { type: 'success' });
    saveGame({ immediate: true });
    renderAll(state);
  };

  state.onEquipCosmeticItem = (itemId) => {
    const vaultItem = getVaultItem(itemId);
    const blackItem = getBlackMarketItem(itemId);
    const item = vaultItem || blackItem;
    const owned = !!(vaultItem && state.vaultOwned.includes(vaultItem.id))
      || !!(blackItem && state.blackMarketOwned.includes(blackItem.id));
    if (!item || !owned) {
      showAlert('Buy this item first.', { title: 'Equip', label: 'VAULT' });
      return;
    }
    const slot = getVaultSlotForItem(item);
    if (!slot) return;
    const profile = getProfile();
    if (profile?.cosmetics?.[slot] === item.id) return;
    setProfileCosmetic(slot, item.id);
    toast(`Equipped ${item.name}`, { type: 'info' });
    renderAll(state);
  };
  state.onEquipVaultItem = state.onEquipCosmeticItem;

  state.onToggleVaultPledge = (itemId) => {
    const result = togglePledgedVaultItem(state, itemId);
    if (!result.ok) {
      sfxError();
      showAlert(result.msg || 'Cannot change pledge.', { title: 'Vault collateral', label: 'VAULT' });
      return;
    }
    const item = getVaultItem(itemId);
    toast(
      result.pledged
        ? `Pledged ${item?.name || itemId} as loan collateral`
        : `Unpledged ${item?.name || itemId}`,
      { type: result.pledged ? 'success' : 'info' },
    );
    saveGame();
    renderAll(state);
  };

  state.onClaimCollectionMilestone = (milestoneId) => {
    const result = claimCollectionMilestone(state, milestoneId, {
      blackMarketPool: BLACKMARKET_ITEM_POOL,
      seatItem: THE_SEAT,
      salonPool: PRIVATE_SALON_POOL,
    });
    if (!result.ok) {
      sfxError();
      showAlert(result.msg || 'Cannot claim.', { title: 'Collection Log', label: 'COLLECTION' });
      return;
    }
    if (result.rep > 0) adjustReputation(state.meta, result.rep, 'collection_milestone');
    sfxSuccess();
    const bits = [result.milestone.label];
    if (result.rep) bits.push(`+${result.rep} REP`);
    if (result.cash) bits.push(`$${result.cash.toLocaleString()}`);
    if (result.flair) bits.push(result.flair);
    toast(`Claimed ${bits.join(' · ')}`, { type: 'success' });
    saveGame();
    renderAll(state);
  };

  state.onBuyBlackMarketItem = async (itemId) => {
    const listing = getTodaysBlackMarketListing(getDayCount(), { ownedIds: state.blackMarketOwned });
    const item = listing.items.find((row) => row.id === itemId);
    if (!item) {
      showAlert('This listing is no longer active today.', { title: 'Black Market', label: 'BLACK MARKET' });
      return;
    }
    if (item.cost >= CONFIG.CONFIRM_NOTIONAL_USD) {
      const ok = await showConfirm(
        `Buy <strong>${item.name}</strong> for <strong>$${item.cost.toLocaleString()}</strong>?<br><span style="color:var(--muted);font-size:12px">Rare listing. Rotation windows do not wait.</span>`,
        { title: 'Confirm black market purchase', label: 'BLACK MARKET', okText: 'Buy listing', cancelText: 'Cancel' },
      );
      if (!ok) return;
    }
    const result = purchaseBlackMarketItem(state, item);
    if (!result.ok) {
      sfxError();
      showAlert(result.msg, { title: 'Black Market', label: 'BLACK MARKET' });
      return;
    }
    sfxSuccess();
    const auto = tryAutoEquipRelic(state, item.id);
    if (auto.equipped) {
      toast(`Acquired ${item.name} and equipped relic power`, { type: 'success' });
    } else {
      toast(`Acquired ${item.name}`, { type: 'success' });
    }
    saveGame();
    renderAll(state);
  };

  state.onToggleBlackMarketRelic = (itemId) => {
    const result = toggleEquippedRelic(state, itemId);
    if (!result.ok) {
      if (result.reason === 'not_relic') return;
      if (result.msg) showAlert(result.msg, { title: 'Relic slots', label: 'BLACK MARKET' });
      return;
    }
    if (result.equipped) {
      toast(`Equipped relic: ${result.relic?.name || itemId}`, { type: 'success' });
    } else {
      toast('Relic unequipped', { type: 'info' });
    }
    saveGame();
    renderAll(state);
  };

  state.onBuySeat = async () => {
    if (state.seatOwned) return;
    const listingActive = isSeatListingActive(getDayCount(), {
      reputation: state.meta?.reputation || 0,
      seatOwned: state.seatOwned,
    });
    if (!listingActive) {
      showAlert('The Seat is not active today. Keep checking rare windows.', { title: 'The Seat', label: 'THE SEAT' });
      return;
    }
    const ok = await showConfirm(
      `Purchase <strong>${THE_SEAT.name}</strong> for <strong>$${THE_SEAT.cost.toLocaleString()}</strong>?<br><span style="color:var(--muted);font-size:12px">Prestige-only in this release. No trading power bonus is applied.</span>`,
      { title: 'Confirm Seat purchase', label: 'THE SEAT', okText: 'Claim the Seat', cancelText: 'Cancel' },
    );
    if (!ok) return;
    const result = purchaseSeat(state, getDayCount());
    if (!result.ok) {
      sfxError();
      showAlert(result.msg, { title: 'The Seat', label: 'THE SEAT' });
      return;
    }
    sfxSuccess();
    toast(`Claimed ${THE_SEAT.name}`, { type: 'success' });
    toast('Relic slots expanded: 2 active slots unlocked', { type: 'info' });
    saveGame({ immediate: true });
    renderAll(state);
  };

  state.onHireStaff = async (roleId) => {
    const role = STAFF_ROLES[roleId];
    if (role?.hireCost >= CONFIG.CONFIRM_NOTIONAL_USD) {
      const ok = await showConfirm(
        `Hire a <strong>${role.name}</strong> for <strong>$${role.hireCost.toLocaleString()}</strong> + daily salary?`,
        { title: 'Confirm hire', label: 'STAFF', okText: 'Hire', cancelText: 'Cancel' },
      );
      if (!ok) return;
    }
    const r = hireStaff(roleId, state);
    if (r.ok) {
      state.staffLog.unshift({ time: Date.now(), staff: 'HR', action: `Hired ${r.member.name} as ${roleId}` });
      adjustReputation(state.meta, 10, 'hire');
      sfxSuccess();
      toast(`Hired ${r.member.name}`, { type: 'success' });
      checkAchievements();
      saveGame();
      renderAll(state);
    } else { sfxError(); showAlert(r.msg, { title: 'Hiring', label: 'STAFF' }); }
  };

  state.onFireStaff = async (staffId) => {
    const ok = await showConfirm('Let this employee go? Payroll stops tomorrow.', {
      title: 'Fire employee', label: 'STAFF', okText: 'Fire', cancelText: 'Keep',
    });
    if (!ok) return;
    fireStaff(staffId, state);
    adjustReputation(state.meta, -5, 'fire');
    toast('Employee released', { type: 'warn' });
    checkAchievements();
    saveGame();
    renderAll(state);
  };

  state.onTrainStaff = (staffId) => {
    const r = trainStaff(staffId, state);
    if (r.ok) {
      adjustReputation(state.meta, r.tier === 'expert' ? 25 : 12, 'train');
      sfxSuccess();
      checkAchievements();
      saveGame();
      renderAll(state);
    } else { sfxError(); showAlert(r.msg, { title: 'Training', label: 'STAFF' }); }
  };

  state.onRenameStaff = (staffId, name) => {
    const r = renameStaff(staffId, name, state);
    if (r.ok) { saveGame(); renderAll(state); }
    else showAlert(r.msg, { title: 'Rename', label: 'STAFF' });
  };

  state.onClaimAchievement = (id) => {
    const r = claimAchievement(id, state.achievements, state.portfolio);
    if (r.ok) {
      adjustReputation(state.meta, 8, 'achievement');
      state.apiStatus = { mode: 'online', label: `Claimed ${r.name} (+$${r.reward.toLocaleString()})` };
      saveGame();
      renderAll(state);
    }
  };

  state.onClaimChallenge = () => {
    const r = claimChallenge(state.meta, state.portfolio);
    if (r.ok) {
      state.apiStatus = { mode: 'online', label: `Challenge: ${r.name} +$${r.reward}` };
      saveGame();
      renderAll(state);
      checkAndShowPerkCallouts(state, { saveGame });
    }
  };

  state.onPurchaseOfficeUpgrade = () => {
    const debt = getTotalDebt(state.finance);
    const net = getNetEquity(state.portfolio, debt) + getVaultBookValue(state);
    const r = purchaseOfficeUpgrade(state, {
      netWorth: net,
      reputation: state.meta?.reputation || 0,
    });
    if (r.ok) {
      toast(`Office upgraded: ${r.tier.name}`, { type: 'success' });
      state.apiStatus = { mode: 'online', label: `Office → ${r.tier.name}` };
      saveGame();
      renderAll(state);
    } else {
      toast(r.msg || 'Cannot upgrade office', { type: 'error' });
    }
  };

  state.onClaimMegaGoal = (goalId) => {
    const debt = getTotalDebt(state.finance);
    const net = getNetEquity(state.portfolio, debt) + getVaultBookValue(state);
    const r = claimMegaGoal(state, goalId, {
      netWorth: net,
      blackMarketPool: BLACKMARKET_ITEM_POOL,
      seatItem: THE_SEAT,
      salonPool: PRIVATE_SALON_POOL,
    });
    if (r.ok) {
      const flairNote = r.flair ? ` · ${r.flair}` : '';
      toast(`Mega goal claimed: ${r.goal.label}${flairNote}`, { type: 'success' });
      saveGame();
      renderAll(state);
    } else {
      toast(r.msg || 'Cannot claim goal', { type: 'error' });
    }
  };

  state.onClaimCollectionSet = (setId) => {
    const r = claimSetFlair(state, setId);
    if (r.ok) {
      const flairNote = r.flair ? ` · ${r.flair}` : '';
      toast(`Set claimed: ${r.set.name}${flairNote}`, { type: 'success' });
      saveGame();
      renderAll(state);
    } else {
      toast(r.msg || 'Cannot claim set', { type: 'error' });
    }
  };

  state.onPurchaseLuxury = (itemId) => {
    const r = purchaseLuxury(state, itemId);
    if (r.ok) {
      toast(`Luxury acquired: ${r.item.name}`, { type: 'success' });
      state.apiStatus = { mode: 'online', label: `Luxury → ${r.item.name}` };
      saveGame();
      renderAll(state);
    } else {
      toast(r.msg || 'Cannot buy luxury', { type: 'error' });
    }
  };

  state.onBorrow = async (bankId, type, amount) => {
    const day = getDayCount();
    const bank = BANKS.find((b) => b.id === bankId);
    const amt = Math.max(0, Math.round(Number(amount) || 0));
    state.vaultPledged = sanitizeVaultPledged(state.vaultPledged, state.vaultOwned);
    const collateralValue = getVaultPledgedAppraisal(state);
    const collateralOpts = {
      collateralValue,
      collateralIds: state.vaultPledged.slice(),
    };
    const preview = quoteLoan(bankId, type, amt, state.finance, day, collateralOpts);
    const debtHere = preview.debtHere ?? bankDebt(state.finance, bankId, type);
    const debtElsewhere = preview.debtElsewhere ?? otherBanksDebt(state.finance, bankId, type);
    const totalType = preview.totalTypeDebt ?? typeDebt(state.finance, type);
    const bankLabel = preview.bank?.name || bank?.name || 'Bank';

    const debtLine = `
      <br><span style="color:var(--muted);font-size:12px">
        Your ${type} debt — here: <strong>$${Math.round(debtHere).toLocaleString()}</strong>
        · other banks: <strong>$${Math.round(debtElsewhere).toLocaleString()}</strong>
        · total: <strong>$${Math.round(totalType).toLocaleString()}</strong>
      </span>`;

    const body = preview.ok
      ? `<strong>${bankLabel} — ${type} loan</strong><br>
         Amount: <strong>$${amt.toLocaleString()}</strong><br>
         Your APR: <strong>${preview.apr}%</strong> (${preview.tier}, credit ${preview.credit})<br>
         Term: ${preview.termDays} game days · est. interest ~$${Math.round(preview.estimatedInterest).toLocaleString()}
         ${collateralValue > 0 ? `<br><span style="color:var(--muted);font-size:12px">Vault collateral bonus: +$${Math.round(preview.collateralBonus || 0).toLocaleString()} ceiling (50% LTV)</span>` : ''}
         ${debtLine}<br>
         <span style="color:var(--muted);font-size:12px">Confirm to submit. Banks review your total debt across lenders.</span>`
      : `<strong>${bankLabel} — ${type} application</strong><br>
         Amount requested: <strong>$${amt.toLocaleString()}</strong>
         ${debtLine}<br>
         <span style="color:var(--muted);font-size:12px">Submit to see if underwriting approves this loan.</span>`;

    const ok = await showConfirm(body, {
      title: 'Confirm loan application',
      label: 'FINANCE',
      okText: preview.ok ? 'Confirm borrow' : 'Submit application',
      cancelText: 'Cancel',
    });
    if (!ok) return;

    // Underwrite only after the player confirms — deny with a clear reason
    const decision = quoteLoan(bankId, type, amt, state.finance, day, collateralOpts);
    if (!decision.ok) {
      sfxError();
      const denyDebt = `
        <br><br><span style="color:var(--muted);font-size:12px">
          ${type} debt at other banks: $${Math.round(decision.debtElsewhere || 0).toLocaleString()}
          · at this bank: $${Math.round(decision.debtHere || 0).toLocaleString()}
        </span>`;
      await showAlert(`${decision.msg}${denyDebt}`, { title: 'Loan denied', label: 'FINANCE' });
      return;
    }

    const r = takeLoan(bankId, type, amt, state.finance, state.portfolio, day, collateralOpts);
    if (r.ok) {
      adjustReputation(state.meta, -3, 'loan_inquiry');
      sfxSuccess();
      toast(`Borrowed $${amt.toLocaleString()} @ ${r.loan.apr}%`, { type: 'success' });
      state.apiStatus = { mode: 'online', label: `Borrowed $${amt.toLocaleString()} @ ${r.loan.apr}% APR` };
      saveGame();
      renderAll(state);
    } else {
      sfxError();
      await showAlert(r.msg || 'Loan denied', { title: 'Loan denied', label: 'FINANCE' });
    }
  };

  state.onLoanPay = (loanId, amount) => {
    const r = makeLoanPayment(loanId, amount, state.finance, state.portfolio, getDayCount());
    if (r.ok) {
      if (r.earlyPayoff) state.stats.loansPaidEarly = (state.stats.loansPaidEarly || 0) + 1;
      if (r.rep) adjustReputation(state.meta, r.rep, 'loan_pay');
      sfxSuccess();
      const creditNote = r.creditSkipped
        ? ' · credit unchanged (need 1 day-end interest first)'
        : (r.creditDelta ? ` · credit +${r.creditDelta}` : '');
      toast(`Paid $${r.paid.toFixed(2)} · remaining $${r.remaining.toFixed(2)}${creditNote}`, { type: 'success' });
      state.apiStatus = { mode: 'online', label: `Paid $${r.paid.toFixed(2)} · remaining $${r.remaining.toFixed(2)}` };
      saveGame();
      checkAchievements();
      renderAll(state);
    } else { sfxError(); showAlert(r.msg, { title: 'Payment failed', label: 'FINANCE' }); }
  };
}

function restartEventEngine() {
  startEventEngine(state.perks.includes('insider'), state.perks.includes('newsWire'), true);
}

async function refreshAiTopPick() {
  if (!state.perks.includes('aiAdvisor')) return;
  const picks = await generateDailyPicks(1);
  state.aiTopPick = picks[0] || null;
}

function getTradePrice(sym, orderType) {
  fillMissingQuotes([sym]);
  const q = getCachedQuote(sym);
  if (!q) { showAlert('Price not available yet — try refresh.', { title: 'No quote', label: 'MARKET' }); return null; }
  if (orderType === 'limit') {
    const limit = parseFloat(document.getElementById('limit-price')?.value);
    if (!limit || limit <= 0) { showAlert('Enter a valid limit price.', { title: 'Limit order', label: 'TRADE' }); return null; }
    return limit;
  }
  return q.price;
}

function parseMaybePrice(id) {
  const value = parseFloat(document.getElementById(id)?.value);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function checkRiskOrders() {
  checkWatchlistAlerts((msg, type) => {
    toast(msg, { type: type || 'info' });
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('StockWay', { body: msg, silent: false });
      }
    } catch (_) { /* ignore */ }
  });

  const risk = evaluateRiskFlow(state, {
    getMarketTime,
    getDayCount,
    processMarginCallTick: (portfolio, opts) => processMarginCallTick(portfolio, {
      ...opts,
      graceMinutes: getDeskMarginGraceMinutes(state),
    }),
    getCachedQuote,
    applySlippage: (args) => applyRelicAwareSlippage(state, args),
    noteBuy,
    noteSell,
    noteProfitableShort,
    recordDayTrade,
    adjustReputation,
  });

  for (const t of risk.margin.toasts) toast(t.msg, { type: t.type || 'warn' });
  if (risk.margin.liquidated) {
    recordDayTrade();
    saveGame({ immediate: true });
  }
  if (risk.margin.health?.level === 'call') {
    maybeShowMarginCallCoach(state, { saveGame, level: 'call' });
  }

  risk.pending.toasts?.forEach((t) => toast(t.msg, { type: t.type || 'success' }));
  risk.pending.sounds?.forEach((s) => (s === 'buy' ? sfxBuy() : sfxSell()));
  if (risk.pending.anyFilled) {
    checkAchievements();
    saveGame();
    renderAll(state);
  }

  if (risk.trigger) {
    toast(risk.trigger.msg, { type: risk.trigger.type });
    if (risk.trigger.action === 'closeLong') {
      state.onCloseLong(risk.trigger.sym);
    } else {
      state.onCoverShort(risk.trigger.sym);
    }
  }
}

function quickSellOrCover(sym) {
  const result = buildQuickExitOrder(state, sym, { getCachedQuote });
  if (!result.ok) {
    showAlert(result.msg, result.alert);
    return;
  }
  openOrderConfirm(result.draft, state);
}

function setPauseButton(running) {
  const btn = document.getElementById('btn-pause');
  if (!btn) return;
  btn.classList.toggle('is-paused', !running);
  btn.title = running ? 'Pause' : 'Resume';
}

function handleDayEnd(day) {
  const result = runDayEndSettlement(state, day);

  if (result.bestRun?.isRecord) toast('New personal best equity!', { type: 'success' });

  for (const repo of result.repossessions || []) {
    const names = (repo.names || []).join(', ') || 'collectibles';
    showAlert(
      `Late on a collateralized loan — the bank repossessed: <strong>${names}</strong>.`,
      { title: 'Vault repossession', label: 'FINANCE' },
    );
    toast(`Repossessed: ${names}`, { type: 'warn' });
  }

  for (const ex of result.expiredOpts || []) {
    const label = ex.intrinsic > 0 ? `settled ITM +$${Math.round(ex.payout)}` : 'expired worthless';
    toast(`${ex.opt.sym} ${ex.opt.type.toUpperCase()} $${ex.opt.strike} ${label}`, {
      type: ex.pnl >= 0 ? 'success' : 'warn',
    });
  }

  state.daySummaryPending = result.daySummary;
  if (isCoachQuiet()) {
    deferDaySummary(() => {
      if (state.daySummaryPending) showDaySummary(state.daySummaryPending);
    });
  } else {
    showDaySummary(state.daySummaryPending);
  }
  stopMarketClock();
  setPauseButton(false);
  checkAchievements();
  saveGame({ immediate: true });
}

function continueNextDay() {
  hideDaySummary();
  state.staff.forEach(s => { s.actionsToday = 0; s.progress = 0; s.status = 'Ready'; });
  resetDayCounters(state.meta);
  const debt = getTotalDebt(state.finance);
  snapshotDayStart(getNetEquity(state.portfolio, debt), state.portfolio.cash, debt);
  // Keep remaining grace; clear lastTickAbs so countdown resumes from next live tick
  if (state.portfolio?.marginCall?.level === 'call') {
    const left = Number(state.portfolio.marginCall.graceLeft);
    state.portfolio.marginCall.graceLeft = Number.isFinite(left)
      ? left
      : MARGIN_CALL_GRACE_MINUTES;
    state.portfolio.marginCall.lastTickAbs = null;
  }
  state.meta.challenge = rollDailyChallenge(getDayCount());
  syncBlackMarketForCurrentDay();
  state.daySummaryPending = null;
  resumeMarket();
  setPauseButton(true);
  checkAchievements();
  saveGame({ immediate: true });
  renderAll(state);
}

async function init() {
  window.__STOCKWAY_INIT = true;
  if (/Electron/i.test(navigator.userAgent)) {
    document.documentElement.classList.add('electron');
    document.body?.classList.add('electron');
  }
  try {
    try {
      const cfgRes = await fetch('/api/config');
      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        if (cfg?.shutdownToken) shutdownToken = String(cfg.shutdownToken);
        // Cloud Worker / local proxy answered — quotes are configured; hide setup banner
        markCloudProxyConfigured(true);
        document.getElementById('api-notice')?.classList.add('hidden');
      }
    } catch { /* offline / file mode */ }
    const hadSave = loadGame();
    state.freshRun = !hadSave;
    if (!hadSave) loadAlertHistory();
    bindState();
    bindSaveLifecycle();
    bindHelpUI();
    bindDialogUI();
    bindOverlayStack();
    registerOverlayClosers({
      orderConfirm: closeOrderConfirm,
      tradeModal: closeModal,
      priceAlert: () => document.getElementById('price-alert-overlay')?.classList.add('hidden'),
      staffHistory: () => document.getElementById('staff-history-overlay')?.classList.add('hidden'),
      coachmark: () => document.getElementById('coachmark-skip')?.click(),
      onboard: () => document.getElementById('onboard-overlay')?.classList.add('hidden'),
      daySummary: () => document.getElementById('day-summary-continue')?.click(),
      mobileNav: closeMobileNav,
    });
    bindSaveIO();
    bindVisibilityAutoPause((running) => setPauseButton(running));
    installUiSounds();
    installNumberWheelScroll();
    bindMobileNav();
    bindSettingsNav();
    bindStatPopovers();
    initGlossaryTooltips();
    bindRightSidebarResize();
    bindLeftSidebarResize();
    bindProfileSettings(state);

    seedQuotesForPositions(state.portfolio);
    fillMissingQuotes(mergeQuoteRefreshSymbols(
      getHeldSymbols(state.portfolio),
      getWatchlist(),
    ));
    regenerateListingsFeed();
    // Fresh run only — loaded saves already restored dayStart* via loadMarket
    if (!hadSave) {
      const debt = getTotalDebt(state.finance);
      snapshotDayStart(getNetEquity(state.portfolio, debt), state.portfolio.cash, debt);
    }
    if (!state.meta.challenge) state.meta.challenge = rollDailyChallenge(getDayCount());
    syncBlackMarketForCurrentDay();

    const themeColors = initThemePanel((colors) => {
      applyChartTheme(colors);
      loadChart(getSelectedSym(), state.perks.includes('analyst'));
    });
    applyChartTheme(themeColors);

    renderAll(state);
    checkAchievements(false);
    startAutosaveHeartbeat();
    flushSave();

    // First launch / post-Reset only. Continue-from-save with a warm baseline cache skips the gate.
    const navOnline = typeof navigator === 'undefined' ? true : !!navigator.onLine;
    const preloadTarget = CONFIG.QUOTE_PRELOAD_GATE_TARGET || 50;
    const preloadTimeoutMs = CONFIG.QUOTE_PRELOAD_TIMEOUT_MS || 15000;
    let preloadSkipRequested = false;
    let preloadTimeoutId = null;
    const needsPreloadGate = !hadSave && navOnline;

    if (needsPreloadGate) {
      // Count warm cache early so a full baseline snapshot can finish near-instantly.
      loadPersistedBaselines();
      if (countLiveAnchoredQuotes() < preloadTarget) {
        showQuotePreloadModal(preloadTarget);
        const skipBtn = document.getElementById('quote-preload-skip');
        if (skipBtn) {
          skipBtn.onclick = () => {
            preloadSkipRequested = true;
            skipBtn.disabled = true;
            skipBtn.textContent = 'Continuing…';
          };
        }
        preloadTimeoutId = setTimeout(() => {
          if (skipBtn && !document.getElementById('quote-preload-overlay')?.classList.contains('hidden')) {
            skipBtn.classList.remove('hidden');
          }
        }, preloadTimeoutMs);
      }
    }

    await initApi((mode, label) => {
      state.apiStatus = { mode, label };
      const preloadOverlay = document.getElementById('quote-preload-overlay');
      if (needsPreloadGate && preloadOverlay && !preloadOverlay.classList.contains('hidden')) {
        updateQuotePreloadModal(label, preloadTarget);
      }
      // Update prices on existing listings — do NOT reshuffle (that rebuilds every logo).
      if ((/simulat|baseline|connected|cached|loading quotes|anchoring/i.test(label)) && state.listings?.length) {
        syncListingsFromQuotes(state, null, { rescaleAsks: true });
      }
      renderAll(state);
    }, mergeQuoteRefreshSymbols(
      getHeldSymbols(state.portfolio),
      getWatchlist(),
      getTickerSymbols(),
    ), {
      preloadGate: needsPreloadGate,
      shouldAbort: () => preloadSkipRequested,
      preloadTarget,
      backgroundPreload: true,
      backgroundTarget: CONFIG.QUOTE_PRELOAD_BACKGROUND_TARGET || 500,
    });

    if (preloadTimeoutId) clearTimeout(preloadTimeoutId);
    hideQuotePreloadModal();

    // Safety net if initApi's background kick didn't take (e.g. soft-offline race).
    if (needsPreloadGate && isNetworkOnline()) {
      startBackgroundQuotePreload({
        target: CONFIG.QUOTE_PRELOAD_BACKGROUND_TARGET || 500,
        prioritySymbols: mergeQuoteRefreshSymbols(
          getHeldSymbols(state.portfolio),
          getWatchlist(),
          getTickerSymbols(),
        ),
      });
    }

    if (isNetworkOnline()) {
      fetchMarketNews().then(() => renderAll(state));
    }

    await initChart(document.getElementById('chart-container'));
    await loadChart(getSelectedSym(), state.perks.includes('analyst'));
    setTimeout(() => resizeChart(), 400);

    if (state.meta.speed && state.meta.speed !== 1) setMarketSpeed(state.meta.speed);
    startMarket();
    // sync speed buttons
    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.speed) === getMarketSpeed());
    });

    restartEventEngine();
    startQuoteRefresh(() => {
      renderAll(state);
      const chartSym = getSelectedSym();
      if (chartSym) {
        const q = getCachedQuote(chartSym);
        if (q?.price) updateLastCandleFromQuote(chartSym, q.price, { throttleMs: 0 });
      }
    }, () => mergeQuoteRefreshSymbols(
      getHeldSymbols(state.portfolio),
      getWatchlist(),
      [getSelectedSym()],
      getListingsViewportSymbols(state),
    ));

    bindListingsViewportRefresh();
    bindHotListingsRotation();

    // Any seed→live correction must push into listings (main + hot), options, watchlist
    onQuoteTransition(({ sym, next }) => {
      if (!sym) return;
      syncListingsFromQuotes(state, [sym], { rescaleAsks: true });
      const open = getSelectedListing();
      if (open && String(open.sym).toUpperCase() === String(sym).toUpperCase()) {
        refreshOpenOptionsPanel(state);
        // Keep modal market print honest too
        const q = getCachedQuote(sym);
        if (q?.price > 0) {
          const mkt = document.getElementById('modal-mkt');
          if (mkt) mkt.textContent = `$${q.price.toFixed(2)}`;
        }
      }
      if (getWatchlist().includes(String(sym).toUpperCase()) || getWatchlist().includes(sym)) {
        renderWatchlist(state);
      }
      // Fix 3b: one-time notice for open positions — never rewrite avgPrice
      const notices = markPriceCorrectedNotices(sym, state.portfolio, {
        livePrice: next?.price,
      });
      for (const n of notices) {
        const avg = Number(n.avgPrice);
        const livePx = Number(n.livePrice);
        const avgStr = avg > 0 ? `$${avg.toFixed(2)}` : '—';
        const liveStr = livePx > 0 ? `$${livePx.toFixed(2)}` : 'live';
        toast(
          `${n.sym} price corrected → ${liveStr} (your avg ${avgStr} unchanged)`,
          { type: 'warn', ms: 4500 },
        );
      }
      if (notices.length) saveGame({ immediate: true });
      // syncListingsFromQuotes mutates state — paint both deal desk + hot sidebar
      renderAll(state);
    });

    let lastUiPaint = 0;
    onMarketTick((type, data) => {
      if (type === 'dayEnd') {
        handleDayEnd(data?.day || getDayCount());
        renderAll(state);
        return;
      }
      if (type === 'newDay') {
        const day = data?.day || getDayCount();
        const gaps = processEarningsForDay(day);
        for (const g of gaps.slice(0, 8)) {
          const sign = g.gapPct >= 0 ? '+' : '';
          toast(
            `${g.sym} earnings ${g.outcome}: ${sign}${(g.gapPct * 100).toFixed(1)}% gap`,
            { type: g.gapPct >= 0 ? 'success' : 'warn' },
          );
        }
        if (gaps.length > 8) toast(`${gaps.length - 8} more earnings gaps overnight`, { type: 'info' });
        const divs = processDividendsForDay(state.portfolio, day);
        for (const d of divs) {
          toast(`Dividend ${d.sym}: +$${d.amount.toFixed(2)}`, { type: 'success' });
        }
        if (divs.length) saveGame({ immediate: true });
        if (isTaxDay(day)) {
          const tax = settleTaxDay(state.portfolio, day);
          if (tax.paid > 0 || tax.owed > 0 || tax.bill.periodTax > 0) {
            const msg = tax.owed > 0
              ? `Tax Day: paid $${tax.paid.toFixed(2)} ($${tax.owed.toFixed(2)} still owed)`
              : `Tax Day: paid $${tax.paid.toFixed(2)} (ST ${Math.round(tax.bill.netST)} / LT ${Math.round(tax.bill.netLT)})`;
            toast(msg, { type: 'warn' });
            saveGame({ immediate: true });
          }
        }
        regenerateListingsFeed();
        resetListingsPage();
      }
      // First halt this save gets a one-time coachmark (toasts stay quiet — chip is enough).
      if (type === 'halt') {
        maybeShowCircuitHaltCoach(state, { saveGame, sym: data?.sym });
      }
      if (type === 'staffTick') {
        const actions = tickStaff(state);
        if (actions.length) state.meta.dayStaffActions = (state.meta.dayStaffActions || 0) + actions.length;
        if (actions.some(a => (a.action || '').includes('Refreshed'))) {
          regenerateListingsFeed();
          resetListingsPage();
        }
        checkAchievements(false);
        saveGame();
      }
      if (type === 'tick') {
        const clock = formatMarketClock();
        recordEquityPoint(state.meta, getNetEquity(state.portfolio, getTotalDebt(state.finance)), clock.day, clock.phase);
        if (isMarketOpen() || isThinSession()) {
          syncListingsFromQuotes(state);
          checkRiskOrders();
        }
        // Live last-candle update for the selected trade symbol (no full loadChart)
        const chartSym = getSelectedSym();
        if (chartSym) {
          const q = getCachedQuote(chartSym);
          if (q?.price) updateLastCandleFromQuote(chartSym, q.price);
        }
      }
      // Throttle full paints — rebinding every tick breaks buttons at 5x speed
      if (!state.daySummaryPending) {
        const now = Date.now();
        if (type === 'staffTick' || type === 'newDay' || now - lastUiPaint > 800) {
          lastUiPaint = now;
          renderAll(state);
        } else {
          // Lightweight clock/header only
          const { time, status, day, phase, progress } = formatMarketClock();
          const clockEl = document.getElementById('market-clock');
          if (clockEl) clockEl.textContent = time;
          const st = document.getElementById('market-status');
          if (st) { st.textContent = status; st.className = `market-badge ${status.toLowerCase()}`; }
          const dayEl = document.getElementById('market-day');
          if (dayEl) dayEl.textContent = `DAY ${day}`;
          const phaseEl = document.getElementById('market-phase');
          if (phaseEl) phaseEl.textContent = phase || 'Morning';
          const fedEl = document.getElementById('macro-fed');
          if (fedEl) {
            const macro = getMacroState();
            fedEl.textContent = `Fed ${macro.fedFundsRate.toFixed(2)}%`;
            fedEl.title = `Simulated Fed funds ${macro.fedFundsRate.toFixed(2)}% · 10Y ${macro.yield10Y.toFixed(2)}% — moves bank APRs and Fed event size`;
          }
          const fill = document.getElementById('phase-bar-fill');
          if (fill) fill.style.width = `${Math.round((progress || 0) * 100)}%`;
          const cash = document.getElementById('cash');
          if (cash) cash.textContent = `$${Math.round(state.portfolio.cash).toLocaleString()}`;
          const eq = document.getElementById('equity');
          if (eq) eq.textContent = `$${Math.round(getNetEquity(state.portfolio, getTotalDebt(state.finance))).toLocaleString()}`;
        }
      }
    });

    onEvent(() => renderAll(state));

    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.onclick = () => {
        switchView(btn.dataset.view);
        if (btn.dataset.view === 'trade') setTimeout(() => resizeChart(), 100);
      };
    });

    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.onclick = () => {
        const sp = Number(btn.dataset.speed) || 1;
        state.meta.speed = setMarketSpeed(sp);
        document.querySelectorAll('.speed-btn').forEach(b => b.classList.toggle('active', b === btn));
        saveGame();
      };
    });

    document.querySelectorAll('.chart-tab').forEach((tab, i) => {
      tab.onclick = () => {
        document.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        showChartTab(['chart', 'news', 'stats'][i] || 'chart');
        if (i === 0) setTimeout(() => resizeChart(), 100);
      };
    });

    document.getElementById('btn-refresh').onclick = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        state.apiStatus = { mode: 'offline', label: getConnectionLabel() };
        renderAll(state);
        toast('Offline — using last fetched prices', { type: 'info' });
        return;
      }
      state.apiStatus = { mode: 'loading', label: 'Refreshing missing baselines…' };
      renderAll(state);
      const syms = mergeQuoteRefreshSymbols(
        getWatchlist(),
        [getSelectedSym()],
        getVisibleListingSymbols(state),
        (state.listings || []).map((l) => l.sym),
      );
      // Mid-run Sync: force:false + seed-only (refreshQuotesMidRun). Never yank sim tape.
      const result = await refreshQuotesMidRun(syms);
      startSimulationMode();
      if (!result.offline) {
        if (result.fetched > 0) persistQuoteBaselines();
        syncListingsFromQuotes(state, result.refreshed?.length ? result.refreshed : syms, {
          rescaleAsks: result.fetched > 0,
        });
        state.apiStatus = {
          mode: 'online',
          label: result.fetched > 0
            ? `Connected · ${result.live} baselines · simulating`
            : 'Connected · simulating',
        };
        toast(
          result.fetched > 0
            ? `Simulating — refreshed missing baselines only (${result.fetched})`
            : 'Simulating — refreshed missing baselines only',
          { type: 'success' },
        );
      } else {
        state.apiStatus = { mode: 'offline', label: getConnectionLabel() };
        toast('Offline — using last fetched prices', { type: 'info' });
      }
      await loadChart(getSelectedSym(), state.perks.includes('analyst'));
      renderAll(state);
    };

    document.getElementById('btn-pause').onclick = () => {
      const running = pauseMarket();
      sfxToggle();
      setPauseButton(running);
    };

    document.getElementById('btn-save').onclick = () => {
      flushSave();
      sfxSuccess();
      toast('Game saved', { type: 'success' });
    };

    document.getElementById('btn-settings')?.addEventListener('click', () => switchView('settings'));
    document.getElementById('settings-quick-save')?.addEventListener('click', () => {
      flushSave();
      sfxSuccess();
      toast('Game saved', { type: 'success' });
    });
    document.getElementById('settings-goto-trade')?.addEventListener('click', () => switchView('trade'));
    document.getElementById('settings-reset-desk')?.addEventListener('click', () => {
      document.getElementById('btn-reset')?.click();
    });

    document.getElementById('btn-reset').onclick = async () => {
      const ok = await showConfirm(
        'This archives your run to Best Runs, then wipes the desk save (day, Fed rate, staff, loans, progress, quote cache). Profile and theme stay. Start over from Day 1 / Pre-Market / Fed 4.50% / $500?',
        { title: 'Reset desk', label: 'DANGER', okText: 'Archive & reset', cancelText: 'Cancel' },
      );
      if (!ok) return;
      clearAllSaveData({ archive: true });
      location.reload();
    };

    document.getElementById('btn-quit')?.addEventListener('click', async () => {
      flushSave();
      try {
        toast('Progress saved — shutting down…', { type: 'warn' });
        await fetch('/api/shutdown', {
          method: 'POST',
          headers: {
            'X-StockWay-Shutdown': shutdownToken,
          },
        });
      } catch (_) {
        toast('Progress saved. Close the window to finish.', { type: 'warn' });
      } finally {
        setTimeout(() => window.close(), 250);
      }
    });

    document.getElementById('modal-close').onclick = closeModal;
    document.getElementById('trade-modal').onclick = (e) => {
      if (e.target.id === 'trade-modal') closeModal();
    };
    document.getElementById('day-summary-continue')?.addEventListener('click', continueNextDay);
    document.getElementById('staff-history-close')?.addEventListener('click', () => {
      document.getElementById('staff-history-overlay')?.classList.add('hidden');
    });

    document.getElementById('btn-claim-all')?.addEventListener('click', () => {
      const r = claimAllAchievements(state.achievements, state.portfolio);
      if (r.total) {
        adjustReputation(state.meta, r.claimed.length * 8, 'claim_all');
        state.apiStatus = { mode: 'online', label: `Claimed $${r.total.toLocaleString()}` };
        saveGame();
        renderAll(state);
      }
    });

    document.querySelectorAll('.tf-btn').forEach(btn => {
      btn.onclick = async () => {
        setChartResolution(btn.dataset.res);
        await loadChart(getSelectedSym(), state.perks.includes('analyst'));
      };
    });

    document.getElementById('chart-zoom-out')?.addEventListener('click', () => zoomChart(-1));
    document.getElementById('chart-zoom-in')?.addEventListener('click', () => zoomChart(1));
    document.getElementById('chart-zoom-reset')?.addEventListener('click', () => resetChartZoom());

    document.getElementById('order-type').onchange = (e) => {
      document.getElementById('limit-price').classList.toggle('hidden', e.target.value !== 'limit');
    };

    document.getElementById('btn-quick-long').onclick = () => {
      const sym = getSelectedSym();
      const price = getTradePrice(sym, document.getElementById('order-type').value);
      if (!price) return;
      const shares = parseInt(document.getElementById('quick-shares').value) || 1;
      openOrderConfirm({
        action: 'long',
        sym,
        shares,
        price,
        orderType: document.getElementById('order-type').value,
        stopLoss: parseMaybePrice('stop-loss'),
        takeProfit: parseMaybePrice('take-profit'),
      }, state);
    };

    document.getElementById('btn-quick-short').onclick = () => {
      const sym = getSelectedSym();
      const price = getTradePrice(sym, document.getElementById('order-type').value);
      if (!price) return;
      const shares = parseInt(document.getElementById('quick-shares').value) || 1;
      openOrderConfirm({
        action: 'short',
        sym,
        shares,
        price,
        orderType: document.getElementById('order-type').value,
        stopLoss: parseMaybePrice('stop-loss'),
        takeProfit: parseMaybePrice('take-profit'),
      }, state);
    };

    document.getElementById('btn-quick-sell').onclick = () => quickSellOrCover(getSelectedSym());

    document.getElementById('btn-search').onclick = async () => {
      const raw = document.getElementById('symbol-search').value.trim();
      if (!raw) return;
      let sym = resolveTickerInput(raw);
      if (!sym) return;
      const hits = searchSymbols(raw, 1);
      if (hits[0]) sym = hits[0];
      document.getElementById('symbol-search').value = sym;
      await fetchQuote(sym);
      addToWatchlist(sym);
      await state.onSelectSymbol(sym);
    };

    document.getElementById('btn-add-watch').onclick = () => {
      addToWatchlist(getSelectedSym());
      renderAll(state);
      saveGame();
    };

    document.getElementById('btn-watch-symbol')?.addEventListener('click', () => {
      addToWatchlist(getSelectedSym());
      toast(`${getSelectedSym()} added to watchlist`, { type: 'success' });
      renderAll(state);
      saveGame();
    });

    document.getElementById('btn-price-alert')?.addEventListener('click', () => {
      addToWatchlist(getSelectedSym());
      openPriceAlert(getSelectedSym(), state);
    });

    const runListingSearch = async () => {
      const q = document.getElementById('listing-search')?.value || '';
      if (!q.trim()) { renderListingSearchResults('', state); return; }
      const hits = searchSymbols(q, 1);
      const sym = hits[0] || resolveTickerInput(q.trim().split(/\s+/)[0]);
      if (sym) await fetchQuote(sym);
      renderListingSearchResults(q, state);
      // Re-anchor any still-seed hits now shown in the search panel
      kickListingsViewportRefresh('search');
    };
    document.getElementById('listing-search-go')?.addEventListener('click', runListingSearch);
    document.getElementById('listing-search')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') runListingSearch();
    });
    document.getElementById('listing-search')?.addEventListener('input', (e) => {
      if (!e.target.value.trim()) renderListingSearchResults('', state);
    });
    document.getElementById('listings-show-more')?.addEventListener('click', () => {
      showMoreListings(getFullListingsTotal(state));
      renderAll(state);
      kickListingsViewportRefresh('more');
    });
    document.getElementById('listings-sort')?.addEventListener('change', (e) => {
      setListingsSort(e.target.value);
      resetListingsPage();
      renderAll(state);
      kickListingsViewportRefresh('sort');
    });

    document.getElementById('listings-refresh')?.addEventListener('click', async () => {
      const btn = document.getElementById('listings-refresh');
      if (btn?.disabled) return;
      const labelEl = btn?.querySelector('.listings-refresh-label');
      const setRefreshing = (on) => {
        if (!btn) return;
        btn.disabled = on;
        btn.classList.toggle('is-refreshing', on);
        if (labelEl) labelEl.textContent = on ? 'Refreshing…' : 'Refresh';
      };

      // Prefer visible deal-desk symbols; also cover ticker tape + watchlist
      const visible = getVisibleListingSymbols(state);
      const pool = (state.listings || []).map(l => l.sym);
      const syms = mergeQuoteRefreshSymbols(visible, pool, getWatchlist(), [getSelectedSym()]);
      if (!syms.length) {
        toast('No listings to refresh yet', { type: 'info' });
        return;
      }

      setRefreshing(true);
      try {
        if (!isNetworkOnline() || (typeof navigator !== 'undefined' && !navigator.onLine)) {
          fillMissingQuotes(syms);
          syncListingsFromQuotes(state, syms, { rescaleAsks: true });
          state.apiStatus = { mode: 'offline', label: getConnectionLabel() };
          toast('Offline — using cached / sim prices', { type: 'info' });
          renderAll(state);
          return;
        }

        state.apiStatus = { mode: 'loading', label: 'Refreshing missing baselines…' };
        renderAll(state);
        // Mid-run Deal Desk refresh: same soft path as toolbar (never yank sim tape).
        const result = await refreshQuotesMidRun(syms);
        startSimulationMode();
        syncListingsFromQuotes(state, result.refreshed?.length ? result.refreshed : syms, {
          rescaleAsks: result.fetched > 0,
        });
        if (!result.offline) {
          if (result.fetched > 0) persistQuoteBaselines();
          state.apiStatus = {
            mode: 'online',
            label: result.fetched > 0
              ? `Connected · ${result.live} baselines · simulating`
              : 'Connected · simulating',
          };
          toast(
            result.fetched > 0
              ? `Simulating — refreshed missing baselines only (${result.fetched})`
              : 'Simulating — refreshed missing baselines only',
            { type: 'success' },
          );
        } else {
          state.apiStatus = { mode: 'offline', label: getConnectionLabel() };
          toast('Offline — using cached / sim prices', { type: 'info' });
        }
        renderAll(state);
      } finally {
        setRefreshing(false);
      }
    });

    document.getElementById('api-notice')?.classList.toggle('hidden', isApiConfigured());

    // Fresh desk vs returning run — never say "welcome back" on day-1 first boot
    const welcomeEl = document.querySelector('.dash-welcome h2');
    if (welcomeEl) {
      welcomeEl.textContent = state.freshRun ? 'Welcome to the desk.' : 'Welcome back, trader';
    }
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    } catch (_) { /* ignore */ }

    document.getElementById('checkpoint-list')?.addEventListener('click', async (e) => {
      const btn = e.target.closest?.('[data-restore-slot]');
      if (!btn) return;
      const idx = Number(btn.dataset.restoreSlot);
      const ok = await showConfirm(
        `Restore checkpoint #${idx + 1}? Your current desk save will be replaced, then the app reloads.`,
        { title: 'Restore checkpoint', label: 'SAVE', okText: 'Restore & reload', cancelText: 'Cancel' },
      );
      if (!ok) return;
      if (!restoreCheckpoint(idx)) {
        showAlert('Could not restore that checkpoint.', { title: 'Restore failed', label: 'SAVE' });
        return;
      }
      toast('Checkpoint restored — reloading…', { type: 'success' });
      setTimeout(() => location.reload(), 400);
    });

    bindAiChat(state);
    bindHotkeys(state, {
      onQuickBuy: (sym) => document.getElementById('btn-quick-long')?.click(),
      onQuickSell: (sym) => quickSellOrCover(sym),
      onPause: () => document.getElementById('btn-pause')?.click(),
      onSave: () => {
        flushSave();
        sfxSuccess();
        toast('Game saved', { type: 'success' });
      },
      onRefresh: () => document.getElementById('btn-refresh')?.click(),
      onChartRange: (res) => {
        setChartResolution(res);
        loadChart(getSelectedSym(), state.perks.includes('analyst'));
      },
      onRemoveWatch: (sym) => state.onRemoveWatchlist?.(sym),
    });
    await refreshAiTopPick();
    renderAll(state);
    renderCheckpointList(listCheckpoints());

    // Default to dashboard
    switchView('dashboard');

    // After preload gate has already cleared — never stack onboarding in front of quotes.
    if (!hadSave && needsOnboarding()) {
      const finishFresh = () => completeWalkthroughReset({
        clearAllSaveData,
        markOnboarded,
      });
      showOnboarding(
        () => {
          void startFirstTradeWalkthrough({
            state,
            switchView,
            onSelectSymbol: (sym) => state.onSelectSymbol?.(sym),
            openOrderConfirm,
            renderAll,
            ensureSuggestVisible: (listing) => {
              if (listing && Array.isArray(state.listings)) {
                state.listings = [
                  listing,
                  ...state.listings.filter((l) => l.sym !== listing.sym),
                ];
              }
              setListingsSort('deals');
              resetListingsPage();
            },
            onFinished: finishFresh,
          });
        },
        finishFresh,
      );
    } else {
      checkAndShowPerkCallouts(state, { saveGame });
      // After gate + onboard skip path — explain Live vs Simulation once.
      maybeShowSimStatusCoach(state, { saveGame });
    }

    setInterval(async () => {
      await refreshAiTopPick();
      checkAchievements(false);
      if (!state.daySummaryPending) renderAll(state);
      checkAndShowPerkCallouts(state, { saveGame });
      saveGame();
    }, 12000);

  } catch (err) {
    console.error('Init failed:', err);
    fillMissingQuotes();
    regenerateListingsFeed();
    state.apiStatus = { mode: 'offline', label: 'Recovered · simulated data' };
    renderAll(state);
  }

  // Smoke / QA hooks (read-only-ish helpers + forced day advance)
  window.__stockwayTest = {
    getListings: () => (Array.isArray(state.listings)
      ? state.listings.map((l) => ({ ...l }))
      : []),
    getDay: () => getDayCount(),
    getCash: () => state.portfolio?.cash ?? 0,
    getStaffCount: () => (state.staff || []).length,
    getWatchCount: () => getWatchlist().length,
    getOpenLongSymbols: () => Object.entries(state.portfolio?.longs || {})
      .filter(([, p]) => (p?.shares || 0) > 0)
      .map(([sym]) => String(sym).toUpperCase()),
    selectSymbol: async (sym) => {
      const key = String(sym || '').toUpperCase();
      if (!key) return null;
      await state.onSelectSymbol?.(key);
      renderAll(state);
      return getSelectedSym();
    },
    getListingsViewport: () => getListingsViewportSymbols(state),
    kickListingsViewport: (reason = 'test') => refreshListingsViewportQuotes({ reason }),
    getLongAvg: (sym) => state.portfolio?.longs?.[String(sym || '').toUpperCase()]?.avgPrice ?? null,
    getLongAck: (sym) => !!state.portfolio?.longs?.[String(sym || '').toUpperCase()]?.priceCorrectedAck,
    /** Add shares to an existing long (exercises buyLong ack-clear). */
    buyMoreLong: (sym, shares, price) => {
      const r = buyLong(state.portfolio, sym, shares, price, {}, state.perks);
      renderAll(state);
      return r;
    },
    /** Partial sell without closing (should keep priceCorrectedAck). */
    sellPartialLong: (sym, shares, price) => {
      const r = sellLong(state.portfolio, sym, shares, price);
      renderAll(state);
      return r;
    },
    /** Plant a seed-priced long for Fix 3b smoke (does not rewrite existing avg). */
    plantSeedLong: (sym, shares = 2, price = null) => {
      const key = String(sym || 'SMOKE3').toUpperCase();
      const q = seedQuote(key);
      const px = Number(price) > 0 ? Number(price) : q.price;
      const qty = Math.max(1, Math.floor(Number(shares) || 2));
      state.portfolio.longs[key] = {
        shares: qty,
        avgPrice: px,
        lots: [{ shares: qty, avgPrice: px, openedDay: getDayCount() }],
      };
      delete state.portfolio.longs[key].priceCorrectedAck;
      renderAll(state);
      return { sym: key, avgPrice: px, shares: qty, source: getCachedQuote(key)?.source };
    },
    /** Force seed→live transition (fires onQuoteTransition → notice). */
    forceLiveAnchor: (sym, price) => {
      const key = String(sym || '').toUpperCase();
      const px = Number(price);
      if (!(px > 0)) return null;
      return applyLiveAnchor(key, {
        price: px, open: px, high: px, low: px,
        prevClose: px * 0.995, change: px * 0.005, changePct: 0.5,
        source: 'yahoo', updated: Date.now(),
      });
    },
    forceHalt: (sym, openPrice = null, haltedPrice = null) => {
      const key = String(sym || '').toUpperCase();
      if (!key) return null;
      const quote = getCachedQuote(key) || seedQuote(key);
      const openPx = Number(openPrice) > 0 ? Number(openPrice) : (quote?.price || 100);
      const haltPx = Number(haltedPrice) > 0 ? Number(haltedPrice) : (openPx * 1.08);
      checkCircuitBreaker(key, openPx);
      const tripped = checkCircuitBreaker(key, haltPx);
      return {
        sym: key,
        openPrice: openPx,
        haltedPrice: haltPx,
        tripped,
        halted: isSymbolHalted(key),
      };
    },
    forceAdvanceGameDay: () => {
      const r = forceAdvanceGameDay();
      renderAll(state);
      return r;
    },
    disableSave: () => { window.__stockwayDisableSave = true; },
    /** Unlock intern hire path for UI smoke without grinding REP. */
    ensureSmokeStaffUnlock: () => {
      if (!state.perks.includes('scanner')) state.perks.push('scanner');
      if (!state.perks.includes('hrDept')) state.perks.push('hrDept');
      state.portfolio.cash = Math.max(Number(state.portfolio.cash) || 0, 400);
      renderAll(state);
      return { perks: [...state.perks], cash: state.portfolio.cash };
    },
    getHotVisible: () => [...document.querySelectorAll('#listings .hot-row')].map((el) => el.dataset.sym),
    getHotPool: () => getHotListingPoolSymbols(state),
    getHotRotationPool: () => getHotListingPool(state).map((l) => String(l.sym).toUpperCase()),
    getHotOffset: () => getHotRotationOffset(),
    advanceHot: () => {
      const r = advanceHotListingRotation(state);
      if (r.advanced) renderAll(state);
      return {
        advanced: r.advanced,
        reason: r.reason,
        offset: getHotRotationOffset(),
        visible: [...document.querySelectorAll('#listings .hot-row')].map((el) => el.dataset.sym),
        poolSize: r.pool?.length ?? 0,
      };
    },
    pauseHot: () => { pauseHotListingRotation(); },
    resumeHotSoon: (ms = 40) => { scheduleHotListingResume(ms); },
    isHotPaused: () => isHotListingRotationPaused(),
  };
}

function boot() {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}

boot();
