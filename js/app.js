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
  getNetEquity, getFirmNetWorth,
  ensurePendingOrders, ensureOrderTickets,
  markPriceCorrectedNotices,
  armBuySuspend, shouldArmRevengeCooloff, isBuySuspended,
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
import { initChart, applyChartTheme, resizeChart, zoomChart, resetChartZoom, updateLastCandleFromQuote, setChartStyle, getChartStyle, scheduleFitChart } from './chart.js';
import { initThemePanel } from './theme.js';
import {
  tickStaff, hireStaff, fireStaff, trainStaff, renameStaff, setStaffAutopilot, STAFF_ROLES,
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
  maybeShowSimStatusCoach, maybeShowGraduationCoach, showCoachmark, hideCoachmark,
} from './onboarding-walkthrough.js';
import {
  createFinanceState, takeLoan, makeLoanPayment, quoteLoan, getFirmDebt,
  BANKS, bankDebt, otherBanksDebt, typeDebt,
} from './finance.js';
import {
  createMetaState, recordEquityPoint, rollDailyChallenge,
  updateChallengeProgress, claimChallenge, resetDayCounters, recordClosedTrade,
} from './meta.js';
import {
  LICENSES, sanitizeLicenses, licenseSnapshot, canTakeLicenseExam, purchaseLicense, getHighestLicense,
} from './licenses.js';
import {
  TEACH_MOMENTS, teachIdForLicense, markTeachMoment, pendingLoanTeachMoments,
  teachMomentShown,
} from './teach-moments.js';
import { getVaultItem, getVaultSlotForItem, purchaseVaultItem, getVaultBookValue, togglePledgedVaultItem, getVaultPledgedAppraisal, sanitizeVaultPledged } from './vault.js';
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
import {
  purchaseEstate, sanitizeEstateProgress, syncEstateDerived, drawEstateCredit, repayEstateCredit,
  cashOutEstateEquity, getEstateLiquidationScale,
} from './estates.js';
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
  updateTradeEstValue,
  startHotListingsRotation, stopHotListingsRotation, getHotListingPoolSymbols,
  getHotListingPool, reseedHotListingRotation, advanceHotListingRotation, getHotRotationOffset,
  pauseHotListingRotation, scheduleHotListingResume, isHotListingRotationPaused,
} from './ui.js';
import { patchBuySuspendControls } from './ui/trade.js';
import { initGlossaryTooltips } from './glossary-tooltips.js';
import { archiveRun } from './leaderboard.js';
import { toast, clearToasts, showAlert, showConfirm, bindDialogUI, deferDaySummary, isCoachQuiet, clearDeferredNotifications } from './notify.js';
import { bindSaveIO } from './save-io.js';
import {
  DESK_WIPE_FLAG_KEY,
  markDeskWipe,
  clearDeskWipeFlags,
  consumeDeskWipeOnBoot,
  shouldBlockSaveAfterForeignWipe,
  wipeRunSaveKeys,
  isDeskWipePending,
} from './save-wipe.js';
import { sanitizeRunData } from './save-sanitize.js';
import { bindOverlayStack, registerOverlayClosers } from './overlays.js';
import { bindHotkeys } from './hotkeys.js';
import { installUiSounds, sfxBuy, sfxSell, sfxSuccess, sfxError, sfxToggle } from './sfx.js';
import { resolveTickerInput, searchSymbols } from './symbols.js';
import { getProfile, setProfileCosmetic, clearProfileCosmetics, sanitizeProfileCosmeticsAgainstOwned } from './profile.js';
import {
  detectAndArmGmMode,
  isGmMode,
  tryUnlockWithCode,
  applyGmAction,
  buildGmWelcomeHtml,
  buildGmPanelHtml,
} from './gm-mode.js';

const state = {
  portfolio: createPortfolio(),
  perks: [],
  licenses: ['retail'],
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
    tradesClosed: 0,
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
  estateOwned: [],
  estateSpentTotal: 0,
  estateEquity: 0,
  estateEquityExtracted: 0,
  estateCreditUsed: 0,
  estateCreditMax: 0,
  resilienceRating: 0,
  estateIncomePerDay: 0,
  estateUpkeepPerDay: 0,
  estateCashOutCount: 0,
  estateLastCashOutDay: null,
  collectionClaims: [],
  collectionRewardCashTotal: 0,
  daySummaryPending: null,
};

/** Bank loans + drawn estate credit. */
function firmDebt() {
  return getFirmDebt(state.finance, state.estateCreditUsed);
}

/** Trading equity − firm debt + vault book + estate equity. */
function firmNetWorth() {
  syncEstateDerived(state);
  return getFirmNetWorth(state.portfolio, {
    debt: firmDebt(),
    vaultBook: getVaultBookValue(state),
    estateEquity: state.estateEquity,
  });
}

function achievementContext() {
  const debt = firmDebt();
  return {
    ...state,
    equity: getNetEquity(state.portfolio, debt),
    dayCount: getDayCount(),
  };
}

function setGmPanelOpen(open) {
  const panel = document.getElementById('gm-panel');
  if (!panel || !isGmMode()) return;
  panel.classList.toggle('hidden', !open);
}

function toggleGmPanel() {
  const panel = document.getElementById('gm-panel');
  if (!panel || !isGmMode()) return;
  setGmPanelOpen(panel.classList.contains('hidden'));
}

function runGmAction(actionId) {
  if (!isGmMode()) return;
  const r = applyGmAction(state, actionId);
  if (r.ok) {
    saveGame({ immediate: true });
    renderAll(state);
    checkAchievements(false);
    toast(r.msg, { type: 'success' });
  } else {
    toast(r.msg || 'GM action failed', { type: 'error' });
  }
}

function bindGmPlaytesterUi() {
  if (!isGmMode()) return;
  document.body.classList.add('gm-mode');
  document.body.dataset.gm = '1';
  document.documentElement.dataset.gm = '1';

  const welcome = document.getElementById('gm-welcome-body');
  if (welcome) welcome.innerHTML = buildGmWelcomeHtml();
  const panel = document.getElementById('gm-panel');
  if (panel) panel.innerHTML = buildGmPanelHtml();

  const fab = document.getElementById('gm-fab');
  if (fab) {
    fab.classList.remove('hidden');
    fab.onclick = () => {
      const overlay = document.getElementById('gm-overlay');
      if (overlay && overlay.classList.contains('hidden')) toggleGmPanel();
      else toggleGmPanel();
    };
  }

  panel?.querySelector('#gm-panel-close')?.addEventListener('click', () => setGmPanelOpen(false));
  panel?.querySelectorAll('[data-gm-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-gm-action');
      if (id) runGmAction(id);
    });
  });
  panel?.querySelectorAll('[data-gm-goto]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-gm-goto');
      if (view) switchView(view);
    });
  });

  if (!window.__stockwayGmKeysBound) {
    window.__stockwayGmKeysBound = true;
    document.addEventListener('keydown', (e) => {
      if (!isGmMode()) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) return;
      const chord = (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'g' || e.key === 'G');
      const tick = e.key === '`' || e.code === 'Backquote';
      if (chord || tick) {
        e.preventDefault();
        toggleGmPanel();
      }
    });
  }

  toast('Desk support unlocked — click ··· (bottom-right) or Ctrl+Shift+G', { type: 'success' });
}

/**
 * @returns {Promise<'applied' | 'plain' | 'skip'>}
 */
function showGmWelcomeModal() {
  return new Promise((resolve) => {
    const overlay = document.getElementById('gm-overlay');
    const body = document.getElementById('gm-welcome-body');
    if (!overlay || !isGmMode()) {
      resolve('skip');
      return;
    }
    if (body && !body.innerHTML.trim()) body.innerHTML = buildGmWelcomeHtml();

    const finish = (mode) => {
      overlay.classList.add('hidden');
      resolve(mode);
    };
    overlay.classList.remove('hidden');

    const applyBtn = document.getElementById('gm-apply-enter');
    const plainBtn = document.getElementById('gm-enter-plain');
    if (!applyBtn || !plainBtn) {
      setGmPanelOpen(true);
      finish('plain');
      return;
    }
    applyBtn.addEventListener('click', () => {
      runGmAction('fullLoadout');
      setGmPanelOpen(true);
      finish('applied');
    }, { once: true });
    plainBtn.addEventListener('click', () => {
      setGmPanelOpen(true);
      finish('plain');
    }, { once: true });
  });
}

async function submitDeskAccessCode() {
  const input = document.getElementById('settings-desk-code');
  const msg = document.getElementById('settings-desk-code-msg');
  const raw = input instanceof HTMLInputElement ? input.value : '';
  const result = await tryUnlockWithCode(raw);
  if (msg) {
    msg.classList.remove('hidden');
    msg.textContent = result.msg;
  }
  if (!result.ok) {
    toast(result.msg, { type: 'error' });
    return;
  }
  if (input instanceof HTMLInputElement) input.value = '';
  bindGmPlaytesterUi();
  await showGmWelcomeModal();
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
    licenses: state.licenses,
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
    estateOwned: state.estateOwned,
    estateSpentTotal: state.estateSpentTotal,
    estateEquity: state.estateEquity,
    estateEquityExtracted: state.estateEquityExtracted,
    estateCreditUsed: state.estateCreditUsed,
    estateCreditMax: state.estateCreditMax,
    resilienceRating: state.resilienceRating,
    estateIncomePerDay: state.estateIncomePerDay,
    estateUpkeepPerDay: state.estateUpkeepPerDay,
    estateCashOutCount: state.estateCashOutCount,
    estateLastCashOutDay: state.estateLastCashOutDay,
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
  // Another tab archived & reset — never push this tab's stale run back.
  if (shouldBlockSaveAfterForeignWipe()) return false;
  const key = CONFIG.SAVE_KEY;
  const tmpKey = `${key}__tmp`;
  let stagedTmp = false;
  try {
    const data = buildSaveData();
    const payload = JSON.stringify(data);
    // Stage first so a crash mid-primary write leaves __tmp recoverable.
    localStorage.setItem(tmpKey, payload);
    stagedTmp = true;
    localStorage.setItem(key, payload);
    localStorage.removeItem(tmpKey);

    try {
      const day = data?.market?.dayCount ?? data?.meta?.dayCount ?? 0;
      const slotKey = `${key}_slot`;
      const slots = JSON.parse(localStorage.getItem(slotKey) || '[]');
      const entry = { at: data.savedAt, day, data };
      const next = [entry, ...slots.filter((s) => s.day !== day)].slice(0, 3);
      localStorage.setItem(slotKey, JSON.stringify(next));
    } catch (_) { /* slots are best-effort */ }

    saveDirty = false;
    // Fresh boot after reset: first successful write clears the wipe sentinel.
    try {
      if (isDeskWipePending()) clearDeskWipeFlags();
    } catch (_) { /* ignore */ }
    return true;
  } catch (e) {
    console.warn('Save failed', e);
    // Leave __tmp in place if primary never landed — loadGame can recover it.
    if (!stagedTmp) {
      try { localStorage.removeItem(tmpKey); } catch (_) { /* ignore */ }
    }
    return false;
  }
}

/** Wipe run keys so Day 1 / $500 starts fresh. Keeps profile + theme + sidebar width. */
function clearAllSaveData({ archive = true, keepQuoteBaseline = false } = {}) {
  if (archive) {
    try {
      archiveRun({
        equity: getNetEquity(state.portfolio, firmDebt()),
        day: getDayCount(),
        label: 'Reset desk',
      });
    } catch (_) { /* best-effort */ }
  }
  // Flag first so boot + other tabs honor the wipe even if reload is slow.
  try { markDeskWipe(); } catch (_) { /* ignore */ }
  window.__stockwayDisableSave = true;
  saveDirty = false;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (autosaveInterval) {
    clearInterval(autosaveInterval);
    autosaveInterval = null;
  }
  try { stopMarketClock(); } catch (_) { /* ignore */ }
  const extra = ['stockway_onboarded_v1', 'stockway_alert_history_v1'];
  if (!keepQuoteBaseline) extra.push(CONFIG.QUOTE_BASELINE_KEY);
  wipeRunSaveKeys({ also: extra });
  // Profile name/photo persist; vault equip slots must not survive a wiped inventory.
  try { clearProfileCosmetics(); } catch (_) { /* ignore */ }
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
    if (viewId === 'trade') {
      const activeTab = document.querySelector('.chart-tab.active');
      const key = activeTab?.dataset?.tradeTab
        || (activeTab?.id === 'tab-news' ? 'news' : activeTab?.id === 'tab-stats' ? 'stats' : 'chart');
      showChartTab(key);
      scheduleFitChart();
    }
    maybeStartPortfolioTour(viewId, {
      state,
      saveGame,
      renderAll,
    });
  });
  if (getActiveView() === 'listings') startListingsViewportRefresh();
}

function bindSaveLifecycle() {
  // Electron close awaits this (sync flush wrapped for executeJavaScript Promise).
  window.__stockwayFlushSave = () => {
    try {
      return Promise.resolve(flushSave());
    } catch {
      return Promise.resolve(false);
    }
  };

  const onLeave = () => { flushSave(); };
  window.addEventListener('pagehide', onLeave);
  window.addEventListener('beforeunload', onLeave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
  });
  // Another tab hit Archive & reset — drop stale in-memory run; don't rewrite it.
  window.addEventListener('storage', (e) => {
    if (e.key !== DESK_WIPE_FLAG_KEY || !e.newValue) return;
    window.__stockwayDisableSave = true;
    saveDirty = false;
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (autosaveInterval) {
      clearInterval(autosaveInterval);
      autosaveInterval = null;
    }
    try { stopMarketClock(); } catch (_) { /* ignore */ }
    try { location.reload(); } catch (_) { /* ignore */ }
  });
}

function loadGame() {
  try {
    // Intentional reset: re-wipe run keys and skip slot recovery so an old
    // checkpoint cannot undo Archive & reset across a slow reload.
    if (consumeDeskWipeOnBoot()) return false;

    const key = CONFIG.SAVE_KEY;
    /** @returns {object|null} */
    function tryParseSave(raw) {
      if (!raw) return null;
      try {
        return sanitizeRunData(JSON.parse(raw));
      } catch {
        return null;
      }
    }

    // Ordered recovery: primary → staged __tmp → rotating _slot checkpoint
    let data = tryParseSave(localStorage.getItem(key));
    if (!data) {
      data = tryParseSave(localStorage.getItem(`${key}__tmp`));
    }
    if (!data) {
      try {
        const slots = JSON.parse(localStorage.getItem(`${key}_slot`) || '[]');
        if (slots[0]?.data) data = sanitizeRunData(slots[0].data);
      } catch (_) { /* ignore */ }
    }
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
    state.licenses = sanitizeLicenses(data.licenses);
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
    try { sanitizeProfileCosmeticsAgainstOwned(state.vaultOwned); } catch (_) { /* ignore */ }
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
    {
      const estate = sanitizeEstateProgress({
        estateOwned: data.estateOwned,
        estateSpentTotal: data.estateSpentTotal,
        estateEquityExtracted: data.estateEquityExtracted,
        estateCreditUsed: data.estateCreditUsed,
        estateCashOutCount: data.estateCashOutCount,
        estateLastCashOutDay: data.estateLastCashOutDay,
      });
      Object.assign(state, estate);
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
  state.stats.tradesClosed = (state.stats.tradesClosed || 0) + 1;
  recordClosedTrade(state.meta, pnl);
}

function noteProfitableShort(pnl) {
  if (pnl > 0) state.stats.profitableShorts = (state.stats.profitableShorts || 0) + 1;
}

/**
 * One-shot teach moment: mark + show as a quiet coachmark (toast fallback).
 * Quiet walkthrough/tour modes never mark it, so it can fire later.
 */
function fireTeachMoment(id, text, targetId = null) {
  if (!text || isCoachQuiet()) return false;
  const overlay = document.getElementById('onboard-overlay');
  if (overlay && !overlay.classList.contains('hidden')) return false;
  if (!markTeachMoment(state.meta, id)) return false;
  saveGame({ immediate: true });
  const target = (targetId && document.getElementById(targetId)) || 'body';
  showCoachmark({
    target,
    text,
    showNext: true,
    onNext: () => hideCoachmark(),
    onSkip: () => hideCoachmark(),
  });
  return true;
}

/** First realized losing close — losses are tuition, keep them small. */
function maybeShowFirstLossTeach(pnl) {
  if (!(pnl < 0)) return;
  fireTeachMoment('firstLoss', TEACH_MOMENTS.firstLoss.text, 'realized');
}

/**
 * Blowup close → wall-clock open-side cool-down.
 * First time: teach moment. Later: muted toast only.
 */
function maybeArmRevengeCooloff(pnl) {
  const debt = state.finance
    ? getFirmDebt(state.finance, state.estateCreditUsed)
    : Math.max(0, Number(state.estateCreditUsed) || 0);
  const nw = getFirmNetWorth(state.portfolio, {
    debt,
    vaultBook: getVaultBookValue(state),
    estateEquity: Math.max(0, Number(state.estateEquity) || 0),
  });
  if (!shouldArmRevengeCooloff(pnl, nw)) return;

  armBuySuspend(state.portfolio);
  const first = !teachMomentShown(state.meta, 'firstRevengeCooloff');
  if (first) {
    fireTeachMoment('firstRevengeCooloff', TEACH_MOMENTS.firstRevengeCooloff.text, 'btn-quick-long');
  } else {
    toast('Desk cool-down: new opens locked 30s after a heavy loss', { type: 'warn' });
  }
  try { patchBuySuspendControls(state); } catch (_) { /* ignore */ }
}

/** First position over half of equity in one name — sizing lesson. */
function maybeShowOversizedTeach() {
  if (state.meta?.teachMomentsShown?.firstOversized) return;
  const equity = getNetEquity(state.portfolio, firmDebt());
  if (equity <= 0) return;
  const positions = [
    ...Object.values(state.portfolio?.longs || {}),
    ...Object.values(state.portfolio?.shorts || {}),
  ];
  const oversized = positions.some((p) => (Number(p?.shares) || 0) * (Number(p?.avgPrice) || 0) > equity * 0.5);
  if (oversized) fireTeachMoment('firstOversized', TEACH_MOMENTS.firstOversized.text);
}

function applyConfirmOrderResult(result) {
  if (!result?.ok) {
    if (result?.sound === 'error') sfxError();
    if (result?.alert) showAlert(result.msg, result.alert);
    return;
  }

  let graduationShown = false;
  if (result.toast) toast(result.toast.msg, { type: result.toast.type });

  if (result.kind === 'close') {
    noteSell(result.pnl || 0);
    if (result.action === 'cover') noteProfitableShort(result.pnl || 0);
    recordDayTrade(result.pnl || 0);
    maybeShowFirstLossTeach(result.pnl || 0);
    maybeArmRevengeCooloff(result.pnl || 0);
    graduationShown = maybeShowGraduationCoach(state, { saveGame });
  } else if (result.kind === 'open') {
    if (result.incrementShortsOpened) state.stats.shortsOpened = (state.stats.shortsOpened || 0) + 1;
    noteBuy(!!result.isDeal);
    recordDayTrade();
    maybeShowOversizedTeach();
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
  if (result.checkPerkCallouts && !graduationShown) checkAndShowPerkCallouts(state, { saveGame });
}

function applyCloseOptionResult(result) {
  if (!result?.ok) return;
  if (result.noteSell) {
    noteSell(result.pnl || 0);
    maybeShowFirstLossTeach(result.pnl || 0);
    maybeShowGraduationCoach(state, { saveGame });
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

  state.onCloseLong = (sym, opts = {}) => {
    const result = closeLongFlow(state, sym, {
      getCachedQuote,
      applySlippage: (args) => applyRelicAwareSlippage(state, args),
      confirmNotional: CONFIG.CONFIRM_NOTIONAL_USD,
      exitReason: opts.exitReason,
    });
    if (result?.needsConfirm) {
      openOrderConfirm(result.confirmDraft, state);
      return;
    }
    applyConfirmOrderResult(result);
  };

  state.onCoverShort = (sym, opts = {}) => {
    const result = coverShortFlow(state, sym, {
      getCachedQuote,
      applySlippage: (args) => applyRelicAwareSlippage(state, args),
      confirmNotional: CONFIG.CONFIRM_NOTIONAL_USD,
      exitReason: opts.exitReason,
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
      licenses: state.licenses,
    });
    if (!gate.ok) {
      sfxError();
      showAlert(gate.reason, {
        title: gate.code === 'license' ? 'License required' : 'Locked perk',
        label: 'SHOP',
      });
      return;
    }
    if (perk.cost >= CONFIG.CONFIRM_PERK_COST) {
      const licNote = perk.licenseRequired && perk.licenseRequired !== 'retail'
        ? `<br><span style="color:var(--muted);font-size:12px">${LICENSES[perk.licenseRequired]?.short || ''} license held</span>`
        : '';
      const ok = await showConfirm(
        `Unlock <strong>${perk.name}</strong> for <strong>$${perk.cost.toLocaleString()}</strong>?${licNote}`,
        { title: 'Confirm perk purchase', label: 'SHOP', okText: `Buy $${perk.cost.toLocaleString()}`, cancelText: 'Cancel' },
      );
      if (!ok) return;
    }
    const result = purchasePerk(state, id);
    if (!result.ok) {
      sfxError();
      showAlert(result.msg || 'Cannot unlock perk.', {
        title: result.code === 'license' ? 'License required' : 'Locked perk',
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

  state.onTakeLicenseExam = async (licenseId) => {
    const lic = LICENSES[licenseId];
    if (!lic || (state.licenses || []).includes(licenseId)) return;
    const snap = licenseSnapshot(state, {
      netWorth: getNetEquity(state.portfolio, firmDebt()),
      day: getDayCount(),
    });
    const gate = canTakeLicenseExam(licenseId, snap);
    if (!gate.ok) {
      sfxError();
      showAlert(gate.reason, { title: `${lic.short} exam`, label: 'LICENSE' });
      return;
    }
    const ok = await showConfirm(
      `Sit the <strong>${lic.name}</strong> exam for <strong>$${lic.fee.toLocaleString()}</strong>?<br><span style="color:var(--muted);font-size:12px">Unlocks: ${lic.unlocks}</span>`,
      { title: 'Confirm license exam', label: 'LICENSE', okText: `Pay $${lic.fee.toLocaleString()}`, cancelText: 'Not yet' },
    );
    if (!ok) return;
    const result = purchaseLicense(state, licenseId, {
      netWorth: getNetEquity(state.portfolio, firmDebt()),
      day: getDayCount(),
    });
    if (!result.ok) {
      sfxError();
      showAlert(result.msg || 'Exam not available.', { title: `${lic.short} exam`, label: 'LICENSE' });
      return;
    }
    sfxSuccess();
    toast(`Licensed: ${lic.name}`, { type: 'success' });
    const gradShown = maybeShowGraduationCoach(state, { saveGame });
    if (!gradShown && lic.teaches) {
      fireTeachMoment(teachIdForLicense(licenseId), `${lic.name} earned. ${lic.teaches}`, 'rep-stat-cell');
    }
    checkAchievements();
    saveGame();
    renderAll(state);
  };

  state.onBuyVaultItem = async (itemId) => {
    const item = getVaultItem(itemId);
    if (!item || state.vaultOwned.includes(item.id)) return;
    const isMasterwork = String(item.rarity || '').toLowerCase() === 'masterwork';
    const confirmNote = isMasterwork
      ? 'Masterwork collectible — books into Net Worth with extra Desk Prestige when equipped. Not buying power.'
      : 'Collectible appraisal books into Net Worth. Equip for Desk Prestige display. Not buying power.';
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
    sfxSuccess();
    const bits = [result.milestone.label];
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
      licenses: state.licenses,
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
      sfxSuccess();
      toast(`Hired ${r.member.name}`, { type: 'success' });
      checkAchievements();
      saveGame();
      renderAll(state);
    } else { sfxError(); showAlert(r.msg, { title: 'Hiring', label: 'STAFF' }); }
  };

  state.onFireStaff = async (staffId) => {
    const ok = await showConfirm('Let this employee go? One day of pay is due as severance.', {
      title: 'Fire employee', label: 'STAFF', okText: 'Fire', cancelText: 'Keep',
    });
    if (!ok) return;
    fireStaff(staffId, state);
    toast('Employee released · severance paid if cash allowed', { type: 'warn' });
    document.getElementById('staff-history-overlay')?.classList.add('hidden');
    const profile = document.getElementById('staff-roster-profile');
    if (profile) {
      profile.classList.add('hidden');
      profile.setAttribute('hidden', '');
      profile.innerHTML = '';
    }
    const listWrap = document.getElementById('staff-roster-list-wrap');
    if (listWrap) {
      listWrap.classList.remove('hidden');
      listWrap.removeAttribute('hidden');
    }
    checkAchievements();
    saveGame();
    renderAll(state);
  };

  state.onTrainStaff = (staffId) => {
    const r = trainStaff(staffId, state);
    if (r.ok) {
      sfxSuccess();
      checkAchievements();
      saveGame();
      renderAll(state);
    } else { sfxError(); showAlert(r.msg, { title: 'Training', label: 'STAFF' }); }
  };

  state.onToggleStaffAutopilot = (staffId, enabled) => {
    const r = setStaffAutopilot(staffId, !!enabled, state);
    if (r.ok) {
      sfxSuccess();
      toast(r.member.autopilot ? `${r.member.name} on autopilot` : `${r.member.name} back under desk watch`, {
        type: r.member.autopilot ? 'success' : 'info',
      });
      saveGame();
      renderAll(state);
    } else {
      sfxError();
      showAlert(r.msg, { title: 'Autopilot', label: 'STAFF' });
    }
  };

  state.onRenameStaff = (staffId, name) => {
    const r = renameStaff(staffId, name, state);
    if (r.ok) { saveGame(); renderAll(state); }
    else showAlert(r.msg, { title: 'Rename', label: 'STAFF' });
  };

  state.onClaimAchievement = (id) => {
    const r = claimAchievement(id, state.achievements, state.portfolio);
    if (r.ok) {
      state.apiStatus = { mode: 'online', label: `Claimed ${r.name} (+$${r.reward.toLocaleString()})` };
      toast(`Claimed ${r.name} (+$${r.reward.toLocaleString()})`, { type: 'success' });
      saveGame();
      renderAll(state);
    } else {
      toast('Cannot claim that achievement', { type: 'error' });
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
    const net = firmNetWorth();
    const r = purchaseOfficeUpgrade(state, {
      netWorth: net,
      licenses: state.licenses,
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
    const net = firmNetWorth();
    const r = claimMegaGoal(state, goalId, {
      netWorth: net,
      blackMarketPool: BLACKMARKET_ITEM_POOL,
      seatItem: THE_SEAT,
      salonPool: PRIVATE_SALON_POOL,
    });
    if (r.ok) {
      if (r.flair) toast(`Flair unlocked: ${r.flair}`, { type: 'success' });
      else toast(`Mega goal claimed: ${r.goal.label}`, { type: 'success' });
      saveGame();
      renderAll(state);
      // Subtle card + standing pulse after Standing chips refresh via renderAll.
      requestAnimationFrame(() => {
        const card = document.getElementById('dash-mega-goal');
        if (card) {
          card.classList.remove('dash-mega-claim-flash');
          void card.offsetWidth;
          card.classList.add('dash-mega-claim-flash');
        }
        const standing = document.getElementById('dash-standing');
        if (standing) {
          standing.classList.remove('dash-standing-claim-flash');
          void standing.offsetWidth;
          standing.classList.add('dash-standing-claim-flash');
        }
        const tier = document.getElementById('player-tier');
        if (tier && r.flair) {
          tier.classList.remove('dash-standing-claim-flash');
          void tier.offsetWidth;
          tier.classList.add('dash-standing-claim-flash');
        }
      });
    } else {
      toast(r.msg || 'Cannot claim goal', { type: 'error' });
    }
  };

  state.onClaimCollectionSet = (setId) => {
    const r = claimSetFlair(state, setId);
    if (r.ok) {
      if (r.flair) toast(`Flair unlocked: ${r.flair}`, { type: 'success' });
      else toast(`Set claimed: ${r.set.name}`, { type: 'success' });
      saveGame();
      renderAll(state);
    } else {
      toast(r.msg || 'Cannot claim set', { type: 'error' });
    }
  };

  state.onPurchaseLuxury = (itemId) => {
    const r = purchaseLuxury(state, itemId);
    if (r.ok) {
      const flairNote = r.item.flair ? ` · flair “${r.item.flair}”` : '';
      toast(`Luxury acquired: ${r.item.name}${flairNote}`, { type: 'success' });
      state.apiStatus = { mode: 'online', label: `Luxury → ${r.item.name}` };
      saveGame();
      renderAll(state);
    } else {
      toast(r.msg || 'Cannot buy luxury', { type: 'error' });
    }
  };

  state.onPurchaseEstate = (assetId) => {
    const r = purchaseEstate(state, assetId, { netWorth: firmNetWorth() });
    if (r.ok) {
      const flairNote = r.asset.flair ? ` · flair “${r.asset.flair}”` : '';
      const closeNote = r.closingFee > 0 ? ` · $${r.closingFee.toLocaleString()} closing` : '';
      toast(`Estate acquired: ${r.asset.name}${flairNote}${closeNote}`, { type: 'success' });
      state.apiStatus = { mode: 'online', label: `Estate → ${r.asset.name}` };
      checkAchievements();
      saveGame();
      renderAll(state);
    } else {
      toast(r.msg || 'Cannot buy estate', { type: 'error' });
    }
  };

  state.onDrawEstateCredit = (amount) => {
    const r = drawEstateCredit(state, amount);
    if (r.ok) {
      toast(`Drew $${r.drawn.toLocaleString()} from property credit`, { type: 'success' });
      saveGame();
      renderAll(state);
    } else {
      toast(r.msg || 'Cannot draw credit', { type: 'error' });
    }
  };

  state.onRepayEstateCredit = (amount) => {
    const r = repayEstateCredit(state, amount);
    if (r.ok) {
      toast(`Repaid $${r.paid.toLocaleString()} property credit`, { type: 'success' });
      saveGame();
      renderAll(state);
    } else {
      toast(r.msg || 'Cannot repay credit', { type: 'error' });
    }
  };

  state.onCashOutEstateEquity = () => {
    const r = cashOutEstateEquity(state, getDayCount());
    if (r.ok) {
      toast(`Equity cash-out: +$${r.amount.toLocaleString()} freed`, { type: 'success' });
      state.apiStatus = { mode: 'online', label: `Cash-out +$${Math.round(r.amount).toLocaleString()}` };
      checkAchievements();
      saveGame();
      renderAll(state);
    } else {
      toast(r.msg || 'Cannot cash out', { type: 'error' });
    }
  };

  state.onBorrow = async (bankId, type, amount) => {
    const day = getDayCount();
    const bank = BANKS.find((b) => b.id === bankId);
    const amt = Math.max(0, Math.round(Number(amount) || 0));
    state.vaultPledged = sanitizeVaultPledged(state.vaultPledged, state.vaultOwned);
    const collateralValue = getVaultPledgedAppraisal(state);
    const firmStrength = firmNetWorth();
    const collateralOpts = {
      collateralValue,
      collateralIds: state.vaultPledged.slice(),
      firmStrength,
    };
    const preview = quoteLoan(bankId, type, amt, state.finance, day, collateralOpts);
    const debtHere = preview.debtHere ?? bankDebt(state.finance, bankId, type);
    const debtElsewhere = preview.debtElsewhere ?? otherBanksDebt(state.finance, bankId, type);
    const totalType = preview.totalTypeDebt ?? typeDebt(state.finance, type);
    const bankLabel = preview.bank?.name || bank?.name || 'Bank';
    const strengthPct = preview.strengthPct ?? 0;

    const debtLine = `
      <br><span style="color:var(--muted);font-size:12px">
        Your ${type} debt — here: <strong>$${Math.round(debtHere).toLocaleString()}</strong>
        · other banks: <strong>$${Math.round(debtElsewhere).toLocaleString()}</strong>
        · total: <strong>$${Math.round(totalType).toLocaleString()}</strong>
      </span>`;

    const strengthLine = strengthPct > 0
      ? `<br><span style="color:var(--muted);font-size:12px">Firm strength (net worth): <strong>+${strengthPct}%</strong> facility room</span>`
      : `<br><span style="color:var(--muted);font-size:12px">Firm strength: base facility (grow net worth to unlock larger lines)</span>`;

    const body = preview.ok
      ? `<strong>${bankLabel} — ${type} loan</strong><br>
         Amount: <strong>$${amt.toLocaleString()}</strong><br>
         Your APR: <strong>${preview.apr}%</strong> (${preview.tier}, credit ${preview.credit})<br>
         Term: <strong>${preview.termDays} game days</strong>
         · est. interest ~$${Math.round(preview.estimatedInterest).toLocaleString()}
         · min auto-pay ~$${Number(preview.minDailyPayment || 0).toFixed(2)}/day
         ${strengthLine}
         ${collateralValue > 0 ? `<br><span style="color:var(--muted);font-size:12px">Vault collateral bonus: +$${Math.round(preview.collateralBonus || 0).toLocaleString()} ceiling (50% LTV)</span>` : ''}
         ${debtLine}<br>
         <span style="color:var(--muted);font-size:12px">Underwriting uses credit score, utilization, firm strength, and collateral — like a small-business loan review.</span>`
      : `<strong>${bankLabel} — ${type} application</strong><br>
         Amount requested: <strong>$${amt.toLocaleString()}</strong>
         ${strengthLine}
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
          ${(decision.strengthPct || 0) > 0 ? ` · firm strength +${decision.strengthPct}%` : ''}
        </span>`;
      await showAlert(`${decision.msg}${denyDebt}`, { title: 'Loan denied', label: 'FINANCE' });
      return;
    }

    const r = takeLoan(bankId, type, amt, state.finance, state.portfolio, day, collateralOpts);
    if (r.ok) {
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
      liquidationScale: getEstateLiquidationScale(state),
    }),
    getCachedQuote,
    applySlippage: (args) => applyRelicAwareSlippage(state, args),
    noteBuy,
    noteSell,
    noteProfitableShort,
    recordDayTrade,
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
    const exitOpts = { exitReason: risk.trigger.exitReason };
    if (risk.trigger.action === 'closeLong') {
      state.onCloseLong(risk.trigger.sym, exitOpts);
    } else {
      state.onCoverShort(risk.trigger.sym, exitOpts);
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

/** Loan-lesson teach ids queued at day end; fired after the summary closes. */
let queuedLoanTeachIds = [];

function handleDayEnd(day) {
  const result = runDayEndSettlement(state, day);
  queuedLoanTeachIds = pendingLoanTeachMoments(result.loanEvents, state.meta);

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

  for (const ev of result.estateEvents || []) {
    if (!ev?.msg) continue;
    toast(ev.msg, { type: ev.amount >= 0 ? 'info' : 'warn' });
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
  maybeShowGraduationCoach(state, { saveGame });
  saveGame({ immediate: true });
}

function continueNextDay() {
  hideDaySummary();
  state.staff.forEach(s => { s.actionsToday = 0; s.progress = 0; s.status = 'Ready'; });
  resetDayCounters(state.meta);
  const debt = firmDebt();
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
  const teachId = queuedLoanTeachIds.shift();
  if (teachId && TEACH_MOMENTS[teachId]) {
    fireTeachMoment(teachId, TEACH_MOMENTS[teachId].text);
  }
  saveGame({ immediate: true });
  renderAll(state);
}

async function init() {
  window.__STOCKWAY_INIT = true;
  detectAndArmGmMode();
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
      gmWelcome: () => document.getElementById('gm-overlay')?.classList.add('hidden'),
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
      const debt = firmDebt();
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
    setTimeout(() => scheduleFitChart(), 400);

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
        processEarningsForDay(day);
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
        recordEquityPoint(state.meta, getNetEquity(state.portfolio, firmDebt()), clock.day, clock.phase);
        if (isMarketOpen() || isThinSession()) {
          syncListingsFromQuotes(state);
          checkRiskOrders();
        }
        // Live last-candle update for the selected trade symbol (no full loadChart)
        const chartSym = getSelectedSym();
        if (chartSym) {
          const q = getCachedQuote(chartSym);
          if (q?.price) {
            updateLastCandleFromQuote(chartSym, q.price);
            // Keep Trade header print locked to the same tape the candle tracks
            const priceEl = document.getElementById('chart-price');
            if (priceEl && document.getElementById('view-trade')?.classList.contains('active')) {
              priceEl.textContent = `$${Number(q.price).toFixed(2)}`;
            }
          }
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
          // Must match HUD firm NW (vault + estates) — not trading-only getNetEquity,
          // or the label stutters between ~cash book and full net worth between paints.
          if (eq) eq.textContent = `$${Math.round(firmNetWorth()).toLocaleString()}`;
        }
      }
    });

    onEvent(() => renderAll(state));

    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.onclick = () => {
        switchView(btn.dataset.view);
        renderAll(state);
        if (btn.dataset.view === 'trade') setTimeout(() => scheduleFitChart(), 100);
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

    document.querySelectorAll('.chart-tab').forEach((tab) => {
      tab.onclick = () => {
        const key = tab.dataset.tradeTab
          || (tab.id === 'tab-news' ? 'news' : tab.id === 'tab-stats' ? 'stats' : 'chart');
        showChartTab(key);
        if (key === 'chart') setTimeout(() => scheduleFitChart(), 100);
      };
    });

    const syncTradeEst = () => updateTradeEstValue();
    document.getElementById('quick-shares')?.addEventListener('input', syncTradeEst);
    document.getElementById('limit-price')?.addEventListener('input', syncTradeEst);
    document.getElementById('order-type')?.addEventListener('change', syncTradeEst);
    document.getElementById('quick-shares-minus')?.addEventListener('click', () => {
      const input = document.getElementById('quick-shares');
      if (!input) return;
      input.value = String(Math.max(1, (parseInt(input.value, 10) || 1) - 1));
      syncTradeEst();
    });
    document.getElementById('quick-shares-plus')?.addEventListener('click', () => {
      const input = document.getElementById('quick-shares');
      if (!input) return;
      input.value = String(Math.max(1, (parseInt(input.value, 10) || 1) + 1));
      syncTradeEst();
    });

    window.addEventListener('resize', () => {
      if (!document.getElementById('view-trade')?.classList.contains('active')) return;
      const activeTab = document.querySelector('.chart-tab.active');
      const key = activeTab?.dataset?.tradeTab
        || (activeTab?.id === 'tab-news' ? 'news' : activeTab?.id === 'tab-stats' ? 'stats' : 'chart');
      showChartTab(key);
      requestAnimationFrame(() => scheduleFitChart());
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
    document.getElementById('settings-desk-code-submit')?.addEventListener('click', () => {
      void submitDeskAccessCode();
    });
    document.getElementById('settings-desk-code')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void submitDeskAccessCode();
      }
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
    document.getElementById('staff-history-overlay')?.addEventListener('click', (e) => {
      if (e.target?.id === 'staff-history-overlay') {
        e.currentTarget.classList.add('hidden');
      }
    });

    document.getElementById('btn-claim-all')?.addEventListener('click', () => {
      const r = claimAllAchievements(state.achievements, state.portfolio);
      if (r.total) {
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

    document.querySelectorAll('.chart-style-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        setChartStyle(btn.dataset.chartStyle === 'wave' ? 'wave' : 'candle');
      });
    });
    setChartStyle(getChartStyle());

    document.getElementById('chart-zoom-out')?.addEventListener('click', () => zoomChart(-1));
    document.getElementById('chart-zoom-in')?.addEventListener('click', () => zoomChart(1));
    document.getElementById('chart-zoom-reset')?.addEventListener('click', () => resetChartZoom());

    document.getElementById('order-type').onchange = (e) => {
      const type = e.target.value;
      document.getElementById('limit-price').classList.toggle('hidden', type !== 'limit');
      e.target.setAttribute('data-gloss', type === 'limit' ? 'limit-order' : 'market-order');
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

    document.getElementById('btn-trade-add-watch')?.addEventListener('click', () => {
      addToWatchlist(getSelectedSym());
      toast(`${getSelectedSym()} added to watchlist`, { type: 'success' });
      renderAll(state);
      saveGame();
    });

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
      renderListingSearchResults(e.target.value, state);
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

    bindGmPlaytesterUi();
    if (isGmMode()) {
      // Already unlocked this session — tools only; no forced modal on every boot
      checkAndShowPerkCallouts(state, { saveGame });
      maybeShowSimStatusCoach(state, { saveGame });
    } else if (!hadSave && needsOnboarding()) {
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
    try {
      if (isGmMode()) bindGmPlaytesterUi();
    } catch (_) { /* ignore */ }
  }

  window.__stockwayIsGm = () => isGmMode();

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
      const r = buyLong(state.portfolio, sym, shares, price, {}, state.perks, state.finance?.personalCredit);
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
    /** Arm revenge cool-down + first-time coachmark (QA / screenshot). */
    forceRevengeCooloff: (pnl = -1e9) => {
      if (state.meta?.teachMomentsShown?.firstRevengeCooloff) {
        delete state.meta.teachMomentsShown.firstRevengeCooloff;
      }
      maybeArmRevengeCooloff(Number(pnl) || -1e9);
      renderAll(state);
      return {
        until: state.portfolio?.buySuspendUntilMs ?? null,
        suspended: isBuySuspended(state.portfolio),
      };
    },
    /** Unlock intern hire path for UI smoke without grinding cash. */
    ensureSmokeStaffUnlock: () => {
      if (!state.perks.includes('scanner')) state.perks.push('scanner');
      if (!state.perks.includes('hrDept')) state.perks.push('hrDept');
      // Cheapest seat is currently $550 hire — keep a cushion for smoke.
      state.portfolio.cash = Math.max(Number(state.portfolio.cash) || 0, 3500);
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
