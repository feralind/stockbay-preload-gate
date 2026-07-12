// @ts-check
/**
 * Interactive first-trade walkthrough, portfolio tour, + one-time perk unlock callouts.
 * HELP_SECTIONS / GLOSSARY stay the reference layer — this is the first-run spine.
 */

import { PERKS, canPurchasePerk, CONFIG } from './config.js';
import { openHelp } from './help.js';
import { flushDeferredNotifications, isCoachQuiet } from './notify.js';
import {
  isWalkthroughFlag,
  isPortfolioTourFlag,
  setWalkthroughActive,
  setPortfolioTourActive,
  clearCoachFlags,
} from './coach-flags.js';
import { isSymbolHalted } from './market.js';

/** Perks that get a one-time affordability callout (all desk perks). */
export const CALLOUT_PERK_IDS = [
  'scanner', 'hrDept', 'newsWire', 'analyst', 'margin', 'complianceSuite',
  'tradingFloor', 'options', 'smartRouting', 'insider', 'aiAdvisor', 'auraAmp',
  'hedgeFund', 'primeBroker', 'legendDesk',
];

/** Plain-language hooks on top of PERKS[*].desc — do not duplicate the desc itself. */
export const PERK_CALLOUT_HOOKS = {
  scanner: {
    why: 'A scanner finds mispriced inventory before the crowd — better deal tags mean underpriced offers surface sooner.',
    helpSec: 'listings',
  },
  hrDept: {
    why: 'Desks scale with people: scouts, traders, compliance. HR unlocks hiring so the firm can act while you focus.',
    helpSec: 'staff',
  },
  newsWire: {
    why: 'News moves prices. Early headlines are an information edge — live items arrive about two minutes before the tape reacts.',
    helpSec: 'news-events',
  },
  analyst: {
    why: 'Support and resistance are levels buyers and sellers historically defended — chart overlays show those zones clearly.',
    helpSec: 'perks',
  },
  margin: {
    why: 'Shorts can lose more than you deposit; longs risk what you paid. Margin also doubles long buying power.',
    helpSec: 'trading',
  },
  complianceSuite: {
    why: 'Automation still errs. Firm controls stack with a Compliance Officer so fewer bad fills hit the book.',
    helpSec: 'staff',
  },
  tradingFloor: {
    why: 'A larger floor means more concurrent capacity — extra seats and faster automation.',
    helpSec: 'staff',
  },
  options: {
    why: 'A call is the right, not the obligation, to buy at a strike; a put is the right to sell. You pay premium for that choice.',
    helpSec: 'perks',
  },
  smartRouting: {
    why: 'Desks route orders to reduce adverse fill. Here it shrinks slippage so market and staff trades stay closer to mid.',
    helpSec: 'trading',
  },
  insider: {
    why: 'An informational edge on listings and events: helpful more often than not, never a certainty.',
    helpSec: 'listings',
  },
  aiAdvisor: {
    why: 'Desk signals and chat so you are not staring at a blank chart — you still decide whether to trade.',
    helpSec: 'perks',
  },
  auraAmp: {
    why: 'Equipped Vault cosmetics already grant Desk Prestige reputation on profitable closes. This raises the per-close bonus and the daily cap.',
    helpSec: 'perks',
  },
  hedgeFund: {
    why: 'Covers half of staff payroll and unlocks the Managing Partner hire — institutional scale for a full desk.',
    helpSec: 'staff',
  },
  primeBroker: {
    why: 'Prime relationships buy time in a margin call — eight extra grace minutes before forced liquidation.',
    helpSec: 'trading',
  },
  legendDesk: {
    why: 'Maximum floor scale: ten seats and a further payroll subsidy so the desk can run at full capacity.',
    helpSec: 'staff',
  },
};

/** Portfolio tour coachmark steps (data-tour selectors on Portfolio view). */
export const PORTFOLIO_TOUR_STEPS = [
  {
    id: 'equity',
    target: '[data-tour="equity"]',
    text: 'Total Equity — cash plus the current value of everything you hold. Your net worth right now.',
  },
  {
    id: 'cash',
    target: '[data-tour="cash"]',
    text: 'Cash — money not tied up in a position. Free to spend on the next trade.',
  },
  {
    id: 'openPnl',
    target: '[data-tour="openPnl"]',
    text: 'Open P&L — profit or loss on positions you still hold. It moves with the market and is not locked in yet.',
  },
  {
    id: 'realized',
    target: '[data-tour="realized"]',
    text: 'Realized — profit or loss already banked from closed trades. Final — it will not change again. (Open P&L is still paper; Realized is done.)',
  },
  {
    id: 'winRate',
    target: '[data-tour="winRate"]',
    text: 'Win Rate — percent of closed trades that were profitable.',
  },
  {
    id: 'positions',
    target: '[data-tour="positions"]',
    text: 'Positions — how many distinct holdings you have open right now.',
  },
  {
    id: 'drawdown',
    target: '[data-tour="drawdown"]',
    text: 'Max Drawdown — biggest drop from a peak in equity. Measures the worst stretch, not where you are today.',
  },
];

/** Active suggested listing for the first-trade walkthrough (drives listing badge). */
let walkthroughSuggest = null;

/**
 * Prefer an affordable GREAT DEAL listing so the first buy feels the Deal Desk hook.
 * Falls back to any affordable listing, then null (caller uses current symbol).
 */
export function pickWalkthroughListing(listings = [], cash = CONFIG.STARTING_CASH) {
  const budget = Number(cash) > 0 ? Number(cash) : CONFIG.STARTING_CASH;
  const pool = Array.isArray(listings) ? listings : [];
  const affordable = pool.filter((l) => l
    && l.price > 0
    && l.price <= budget
    && !isSymbolHalted(l.sym));
  const deal = affordable.find((l) => l.isDeal);
  if (deal) return deal;
  return affordable.sort((a, b) => a.price - b.price)[0] || null;
}

/** One-line reason for the Suggested first trade badge. */
export function suggestedTradeReason(listing) {
  if (!listing) return '';
  if (listing.isDeal) {
    return 'starter-friendly price — currently a GREAT DEAL, below fair value';
  }
  return 'starter-friendly price — affordable with your starting cash';
}

export function setWalkthroughSuggest(listing) {
  if (!listing?.sym) {
    walkthroughSuggest = null;
    return null;
  }
  walkthroughSuggest = {
    sym: String(listing.sym).toUpperCase(),
    isDeal: !!listing.isDeal,
    reason: suggestedTradeReason(listing),
  };
  return walkthroughSuggest;
}

export function clearWalkthroughSuggest() {
  walkthroughSuggest = null;
}

/** Used by listingHtml to paint the badge across re-renders. */
export function getWalkthroughSuggestMeta() {
  return walkthroughSuggest;
}

/** True when perk is not owned, not yet callout-shown, and canPurchasePerk just became ok. */
export function shouldShowPerkCallout(perkId, { cash, perks, reputation, perkCalloutsShown } = {}) {
  if (!CALLOUT_PERK_IDS.includes(perkId)) return false;
  if ((perks || []).includes(perkId)) return false;
  if (perkCalloutsShown?.[perkId]) return false;
  const perk = PERKS[perkId];
  if (!perk) return false;
  return canPurchasePerk(perk, { cash, perks, reputation }).ok;
}

export function listPendingPerkCallouts(state) {
  const cash = state?.portfolio?.cash ?? 0;
  const perks = state?.perks || [];
  const reputation = state?.meta?.reputation ?? 0;
  const perkCalloutsShown = state?.meta?.perkCalloutsShown || {};
  return CALLOUT_PERK_IDS.filter((id) => shouldShowPerkCallout(id, {
    cash, perks, reputation, perkCalloutsShown,
  }));
}

export function markPerkCalloutShown(meta, perkId) {
  if (!meta || !perkId) return meta;
  if (!meta.perkCalloutsShown || typeof meta.perkCalloutsShown !== 'object') {
    meta.perkCalloutsShown = {};
  }
  meta.perkCalloutsShown[perkId] = true;
  return meta;
}

/** Ensure meta.perkCalloutsShown is a plain string→bool map (save sanitize helper). */
export function normalizePerkCalloutsShown(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const id of CALLOUT_PERK_IDS) {
    if (raw[id]) out[id] = true;
  }
  return out;
}

export function shouldShowPortfolioTour(meta) {
  return !meta?.portfolioTourShown;
}

export function markPortfolioTourShown(meta) {
  if (!meta) return meta;
  meta.portfolioTourShown = true;
  return meta;
}

/** Pure: first margin-call coachmark for this save. */
export function shouldShowMarginCallCoach(meta, level) {
  return level === 'call' && !meta?.marginCallCoachShown;
}

export function markMarginCallCoachShown(meta) {
  if (!meta) return meta;
  meta.marginCallCoachShown = true;
  return meta;
}

/** Pure: first circuit-halt coachmark for this save. */
export function shouldShowCircuitHaltCoach(meta) {
  return !meta?.circuitHaltCoachShown;
}

export function markCircuitHaltCoachShown(meta) {
  if (!meta) return meta;
  meta.circuitHaltCoachShown = true;
  return meta;
}

/** Pure: first Simulation / Live honesty coachmark for this save. */
export function shouldShowSimStatusCoach(meta) {
  return !meta?.simStatusCoachShown;
}

export function markSimStatusCoachShown(meta) {
  if (!meta) return meta;
  meta.simStatusCoachShown = true;
  return meta;
}

const MARGIN_CALL_COACH_TEXT =
  'Margin call: your equity cushion fell below what brokers require to keep leveraged bets open. '
  + 'Cover shorts or sell longs to raise the cushion — or the desk will liquidate for you. '
  'Real brokers do the same so one bad short cannot owe more than the account holds.';

const CIRCUIT_HALT_COACH_TEXT =
  'Trading halt: this symbol moved so fast from the session open that the “exchange” paused new buys/shorts. '
  + 'Exchanges halt names in real life to stop cascading panic — you can still sell or cover to reduce risk. '
  + 'The halt lifts after a few game minutes.';

const SIM_STATUS_COACH_TEXT =
  'Honesty check: Live/Connected means StockWay can fetch base quotes — not a brokerage and not tick-by-tick streaming. '
  + 'Once the accelerated clock runs, drift, events, and circuit breakers drive the tape (Simulation) — not the real market. '
  + 'Offline uses cached baselines or seeds; paper money never leaves the browser except quote lookups.';

function canShowDomCoachmark() {
  return typeof document !== 'undefined'
    && typeof document.getElementById === 'function'
    && typeof document.querySelector === 'function'
    && typeof document.createElement === 'function';
}

/**
 * One-shot coachmark when processMarginCallTick first returns level:'call'.
 * Marks shown immediately so a second call in the same save never re-fires.
 */
export function maybeShowMarginCallCoach(state, { saveGame, level } = {}) {
  if (!state?.meta || !shouldShowMarginCallCoach(state.meta, level)) return false;
  if (!canShowDomCoachmark()) {
    markMarginCallCoachShown(state.meta);
    saveGame?.({ immediate: true });
    return true;
  }
  if (isCoachQuiet()) return false;
  markMarginCallCoachShown(state.meta);
  saveGame?.({ immediate: true });
  const target = document.getElementById('margin-stress-banner') || document.getElementById('buying-power');
  showCoachmark({
    target: target || 'body',
    text: MARGIN_CALL_COACH_TEXT,
    showNext: true,
    onNext: () => hideCoachmark(),
    onSkip: () => hideCoachmark(),
  });
  return true;
}

/**
 * One-shot coachmark the first time any symbol trips a circuit halt this save.
 */
export function maybeShowCircuitHaltCoach(state, { saveGame, sym } = {}) {
  if (!state?.meta || !shouldShowCircuitHaltCoach(state.meta)) return false;
  if (!canShowDomCoachmark()) {
    markCircuitHaltCoachShown(state.meta);
    saveGame?.({ immediate: true });
    return true;
  }
  if (isCoachQuiet()) return false;
  markCircuitHaltCoachShown(state.meta);
  saveGame?.({ immediate: true });
  const name = sym ? String(sym).toUpperCase() : 'a symbol';
  const target = document.querySelector('.halt-chip')
    || document.getElementById('market-status')
    || document.getElementById('buying-power');
  showCoachmark({
    target: target || 'body',
    text: `${name} just halted. ${CIRCUIT_HALT_COACH_TEXT}`,
    showNext: true,
    onNext: () => hideCoachmark(),
    onSkip: () => hideCoachmark(),
  });
  return true;
}

/**
 * One-shot coachmark explaining Simulation vs Live/Offline (feed status badge).
 */
export function maybeShowSimStatusCoach(state, { saveGame } = {}) {
  if (!state?.meta || !shouldShowSimStatusCoach(state.meta)) return false;
  if (!canShowDomCoachmark()) {
    markSimStatusCoachShown(state.meta);
    saveGame?.({ immediate: true });
    return true;
  }
  if (isCoachQuiet()) return false;
  if (document.getElementById('onboard-overlay')
    && !document.getElementById('onboard-overlay').classList.contains('hidden')) {
    return false;
  }
  markSimStatusCoachShown(state.meta);
  saveGame?.({ immediate: true });
  const target = document.getElementById('feed-status') || document.getElementById('feed-live-pill');
  showCoachmark({
    target: target || 'body',
    text: SIM_STATUS_COACH_TEXT,
    showNext: true,
    onNext: () => hideCoachmark(),
    onSkip: () => hideCoachmark(),
  });
  return true;
}

/**
 * End-of-walkthrough / full-skip: wipe run without Best Runs archive, remount onboarded flag.
 * clearAllSaveData removes stockway_onboarded_v1 — markOnboarded must run after.
 */
export function completeWalkthroughReset({ clearAllSaveData, markOnboarded, reload = true } = {}) {
  if (typeof clearAllSaveData !== 'function' || typeof markOnboarded !== 'function') {
    throw new Error('completeWalkthroughReset requires clearAllSaveData and markOnboarded');
  }
  clearAllSaveData({ archive: false, keepQuoteBaseline: true });
  markOnboarded();
  if (reload && typeof location !== 'undefined' && location.reload) {
    location.reload();
  }
}

/* ─── Coachmark DOM ─── */

let activeCoach = null;
let resizeHandler = null;

function ensureCoachRoot() {
  let root = document.getElementById('coachmark-root');
  if (root) return root;
  root = document.createElement('div');
  root.id = 'coachmark-root';
  root.className = 'coachmark-root hidden';
  root.innerHTML = `
    <div class="coachmark-spotlight" id="coachmark-spotlight" aria-hidden="true"></div>
    <div class="coachmark-tip" id="coachmark-tip" role="dialog" aria-live="polite">
      <p class="coachmark-text" id="coachmark-text"></p>
      <div class="coachmark-actions">
        <button type="button" class="btn btn-sm" id="coachmark-skip">Skip</button>
        <button type="button" class="btn btn-accent btn-sm hidden" id="coachmark-next">Next</button>
      </div>
    </div>`;
  document.body.appendChild(root);
  return root;
}

function placeSpotlight(targetEl) {
  const spot = document.getElementById('coachmark-spotlight');
  const tip = document.getElementById('coachmark-tip');
  if (!spot || !tip || !targetEl) return;
  const pad = 8;
  const r = targetEl.getBoundingClientRect();
  spot.style.top = `${Math.max(0, r.top - pad)}px`;
  spot.style.left = `${Math.max(0, r.left - pad)}px`;
  spot.style.width = `${r.width + pad * 2}px`;
  spot.style.height = `${r.height + pad * 2}px`;

  const tipW = tip.offsetWidth || 280;
  const tipH = tip.offsetHeight || 100;
  let tipTop = r.bottom + pad + 10;
  let tipLeft = r.left;
  if (tipTop + tipH > window.innerHeight - 12) tipTop = Math.max(12, r.top - tipH - 10);
  if (tipLeft + tipW > window.innerWidth - 12) tipLeft = Math.max(12, window.innerWidth - tipW - 12);
  tip.style.top = `${tipTop}px`;
  tip.style.left = `${tipLeft}px`;
}

/**
 * @param {{ target?: Element|string, anchor?: Element|string, text: string, showNext?: boolean, onNext?: Function, onSkip?: Function }} opts
 */
export function showCoachmark(opts = {}) {
  const root = ensureCoachRoot();
  // `anchor` accepted as alias — older call sites used the wrong key and got stuck tips.
  const targetSpec = opts.target ?? opts.anchor;
  const target = typeof targetSpec === 'string'
    ? document.querySelector(targetSpec)
    : targetSpec;
  const textEl = document.getElementById('coachmark-text');
  const nextBtn = document.getElementById('coachmark-next');
  const skipBtn = document.getElementById('coachmark-skip');
  if (textEl) textEl.textContent = opts.text || '';
  nextBtn?.classList.toggle('hidden', !opts.showNext);
  if (nextBtn) nextBtn.textContent = opts.nextLabel || 'Next';
  root.classList.remove('hidden');

  const resolveTarget = () => {
    const el = typeof targetSpec === 'string'
      ? document.querySelector(targetSpec)
      : targetSpec;
    return el instanceof Element ? el : null;
  };

  const reposition = () => {
    const el = resolveTarget();
    if (el) placeSpotlight(el);
    else placeFallbackTip();
  };
  reposition();
  if (resizeHandler) window.removeEventListener('resize', resizeHandler);
  resizeHandler = reposition;
  window.addEventListener('resize', resizeHandler);

  const dismissSafely = () => {
    try {
      opts.onSkip?.();
    } finally {
      // Never leave a dimmed screen with a dead Skip (e.g. caller forgot onSkip → hide).
      const still = document.getElementById('coachmark-root');
      if (still && !still.classList.contains('hidden')) hideCoachmark();
    }
  };
  const onNext = () => { opts.onNext?.(); };
  if (skipBtn) skipBtn.onclick = dismissSafely;
  if (nextBtn) nextBtn.onclick = onNext;

  activeCoach = { target, reposition, onSkip: dismissSafely };
  requestAnimationFrame(reposition);
  setTimeout(reposition, 50);
  return activeCoach;
}

/** When the spotlight target is missing, keep the tip readable (not stuck at 0,0). */
function placeFallbackTip() {
  const tip = document.getElementById('coachmark-tip');
  const spot = document.getElementById('coachmark-spotlight');
  if (!tip) return;
  if (spot) {
    spot.style.top = '12px';
    spot.style.left = '12px';
    spot.style.width = '0px';
    spot.style.height = '0px';
  }
  tip.style.top = '72px';
  tip.style.left = '24px';
}

export function hideCoachmark() {
  document.getElementById('coachmark-root')?.classList.add('hidden');
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
  }
  activeCoach = null;
}

export function isWalkthroughActive() {
  return isWalkthroughFlag();
}

/**
 * End quiet mode and flush deferred toasts/alerts so nothing is lost.
 * @param {{ delayMs?: number, then?: Function }} [opts] - brief delay before callback so toasts paint
 */
export function endCoachQuietAndFlush({ delayMs = 0, then } = {}) {
  clearCoachFlags();
  const n = flushDeferredNotifications();
  if (typeof then === 'function') {
    if (delayMs > 0) setTimeout(then, delayMs);
    else then();
  }
  return n;
}

/* ─── First-trade walkthrough ─── */

/**
 * Detect whether the tracked long was closed (Sell/Cover fill).
 * Exported for tests.
 */
export function hasClosedWalkthroughPosition({ trackSym, sharesBefore, portfolio } = {}) {
  const longs = portfolio?.longs || {};
  if (trackSym) {
    const left = longs[trackSym]?.shares || 0;
    return left < (sharesBefore || 1);
  }
  // Fallback: any reduction / empty when we had shares
  const total = Object.values(longs).reduce((s, p) => s + (p?.shares || 0), 0);
  return total < (sharesBefore || 1);
}

/**
 * Forced first-boot walkthrough. Ends only after Sell/Cover (or skip).
 * onFinished runs after quiet ends + deferred notifications flush.
 */
export async function startFirstTradeWalkthrough({
  state,
  switchView,
  onSelectSymbol,
  openOrderConfirm,
  renderAll,
  onFinished,
  ensureSuggestVisible,
} = {}) {
  if (typeof onFinished !== 'function') return;

  let done = false;
  let pollTimer = null;
  let buyBtnOrig = null;
  let sellBtnOrig = null;
  const buyBtn = document.getElementById('btn-quick-long');
  const sellBtn = document.getElementById('btn-quick-sell');
  const promoteSuggestedListing = (nextListing) => {
    if (typeof ensureSuggestVisible === 'function') {
      ensureSuggestVisible(nextListing);
    } else if (nextListing && Array.isArray(state?.listings)) {
      state.listings = [nextListing, ...state.listings.filter((l) => l.sym !== nextListing.sym)];
    }
    return setWalkthroughSuggest(nextListing);
  };

  const finish = () => {
    if (done) return;
    done = true;
    if (pollTimer) clearInterval(pollTimer);
    if (buyBtn && buyBtnOrig !== null) buyBtn.onclick = buyBtnOrig;
    if (sellBtn && sellBtnOrig !== null) sellBtn.onclick = sellBtnOrig;
    hideCoachmark();
    clearWalkthroughSuggest();
    // Flush deferred achievement toasts etc., then reset after a short beat
    endCoachQuietAndFlush({
      delayMs: 1600,
      then: onFinished,
    });
  };

  setWalkthroughActive(true);

  let listing = pickWalkthroughListing(state?.listings, state?.portfolio?.cash);
  // Pin suggested listing to the front of the Deal Desk so the badge is visible (page 1)
  let suggest = promoteSuggestedListing(listing);
  let sym = listing?.sym || null;

  try {
    if (sym && typeof onSelectSymbol === 'function') {
      await onSelectSymbol(sym);
    }
  } catch (_) { /* continue */ }

  // Step 1 — suggested listing (surface pickWalkthroughListing)
  switchView?.('listings');
  renderAll?.(state);

  await new Promise((resolve) => {
    if (done) { resolve(); return; }
    const sel = sym
      ? `#listings-full .listing[data-sym="${sym}"]`
      : '#listings-full .listing';
    const reason = suggest?.reason || suggestedTradeReason(listing);
    showCoachmark({
      target: sel,
      text: reason
        ? `Suggested first trade: ${reason}`
        : 'Pick a listing to trade — Deal Desk asks can sit below fair value.',
      showNext: true,
      onNext: resolve,
      onSkip: () => { finish(); resolve(); },
    });
  });
  if (done) return;

  switchView?.('trade');
  const sharesInp = document.getElementById('quick-shares');
  if (sharesInp) sharesInp.value = '1';
  renderAll?.(state);

  // Step 2 — live price
  await new Promise((resolve) => {
    if (done) { resolve(); return; }
    showCoachmark({
      target: '#chart-price',
      text: 'This is the live price. It ticks as the market clock runs.',
      showNext: true,
      onNext: resolve,
      onSkip: () => { finish(); resolve(); },
    });
  });
  if (done) return;

  // Step 2.5 — if suggested symbol halted mid-flow, explain + swap before Buy step.
  if (listing?.sym && isSymbolHalted(listing.sym)) {
    await new Promise((resolve) => {
      if (done) { resolve(); return; }
      showCoachmark({
        target: '.halt-chip, #market-status, #buying-power',
        text: `${String(listing.sym).toUpperCase()} just halted. ${CIRCUIT_HALT_COACH_TEXT}`,
        showNext: true,
        onNext: resolve,
        onSkip: () => { finish(); resolve(); },
      });
    });
    if (done) return;

    const priorSym = String(listing.sym).toUpperCase();
    const fallbackListing = pickWalkthroughListing(state?.listings, state?.portfolio?.cash)
      || (Array.isArray(state?.listings)
        ? state.listings.find((l) => l && l.price > 0 && !isSymbolHalted(l.sym))
        : null);
    if (fallbackListing && String(fallbackListing.sym).toUpperCase() !== priorSym) {
      listing = fallbackListing;
      suggest = promoteSuggestedListing(listing);
      sym = listing?.sym || null;
      try {
        if (sym && typeof onSelectSymbol === 'function') {
          await onSelectSymbol(sym);
        }
      } catch (_) { /* continue */ }
      switchView?.('trade');
      const sharesInput = document.getElementById('quick-shares');
      if (sharesInput) sharesInput.value = '1';
      renderAll?.(state);
    }
  }

  if (buyBtn && listing && typeof openOrderConfirm === 'function') {
    buyBtnOrig = buyBtn.onclick;
    buyBtn.onclick = () => {
      openOrderConfirm({
        action: 'long',
        sym: listing.sym,
        shares: 1,
        price: listing.price,
        orderType: listing.isDeal ? 'listing' : 'market',
        listing,
      }, state);
    };
  }

  // Step 3 — Buy Long (wait for real fill)
  const trackSym = listing?.sym ? String(listing.sym).toUpperCase() : null;
  const beforeSyms = new Set(Object.keys(state?.portfolio?.longs || {}));

  await new Promise((resolve) => {
    if (done) { resolve(); return; }
    showCoachmark({
      target: '#btn-quick-long',
      text: 'Buy Long — purchase 1 share, then confirm the ticket. Use the real controls.',
      showNext: false,
      onSkip: () => { finish(); resolve(); },
    });

    pollTimer = setInterval(() => {
      if (done) return;
      const longs = state?.portfolio?.longs || {};
      const anyNew = Object.keys(longs).some((s) => {
        if (!beforeSyms.has(s)) return (longs[s]?.shares || 0) > 0;
        return false;
      }) || (trackSym && (longs[trackSym]?.shares || 0) > 0);
      if (anyNew) {
        clearInterval(pollTimer);
        pollTimer = null;
        resolve();
      }
    }, 200);
  });
  if (done) return;

  if (buyBtn && buyBtnOrig !== null) {
    buyBtn.onclick = buyBtnOrig;
    buyBtnOrig = null;
  }
  hideCoachmark();
  renderAll?.(state);

  const heldSym = trackSym
    || Object.keys(state?.portfolio?.longs || {}).find((s) => (state.portfolio.longs[s]?.shares || 0) > 0);
  const sharesAtHold = heldSym ? (state.portfolio.longs[heldSym]?.shares || 0) : 0;

  // Step 4 — position + live P&L (short beat)
  await new Promise((resolve) => {
    if (done) { resolve(); return; }
    const posEl = document.getElementById('position-summary');
    const target = posEl && posEl.textContent?.trim() ? '#position-summary' : '#pnl';
    showCoachmark({
      target,
      text: 'Filled. Watch your position and Open P&L update live as the price moves.',
      showNext: true,
      onNext: resolve,
      onSkip: () => { finish(); resolve(); },
    });
    setTimeout(() => { if (!done) resolve(); }, 3500);
  });
  if (done) return;

  // Step 5 — Sell/Cover to close the loop (wait for real close — no timer advance)
  await new Promise((resolve) => {
    if (done) { resolve(); return; }
    showCoachmark({
      target: '#btn-quick-sell',
      text: 'Sell / Cover to close the position — bank Realized P&L and finish the loop.',
      showNext: false,
      onSkip: () => { finish(); resolve(); },
    });

    pollTimer = setInterval(() => {
      if (done) return;
      if (hasClosedWalkthroughPosition({
        trackSym: heldSym,
        sharesBefore: sharesAtHold,
        portfolio: state?.portfolio,
      })) {
        clearInterval(pollTimer);
        pollTimer = null;
        resolve();
      }
    }, 200);
  });
  if (done) return;

  finish();
}

/* ─── Portfolio tour ─── */

let portfolioTourRunning = false;

/**
 * One-time Portfolio metrics tour. Call on first visit to Portfolio view.
 */
export async function startPortfolioTour({
  state,
  saveGame,
  renderAll,
  onFinished,
} = {}) {
  if (portfolioTourRunning) return;
  if (!shouldShowPortfolioTour(state?.meta)) return;
  if (isWalkthroughFlag()) return;

  portfolioTourRunning = true;
  setPortfolioTourActive(true);
  renderAll?.(state);

  let cancelled = false;
  const end = () => {
    if (cancelled) return;
    cancelled = true;
    hideCoachmark();
    markPortfolioTourShown(state.meta);
    saveGame?.({ immediate: true });
    endCoachQuietAndFlush();
    portfolioTourRunning = false;
    onFinished?.();
  };

  for (const step of PORTFOLIO_TOUR_STEPS) {
    if (cancelled) break;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => {
      if (cancelled) { resolve(); return; }
      const el = document.querySelector(step.target);
      if (!el) {
        resolve();
        return;
      }
      showCoachmark({
        target: step.target,
        text: step.text,
        showNext: true,
        onNext: resolve,
        onSkip: () => { end(); resolve(); },
      });
    });
  }

  if (!cancelled) end();
}

/**
 * Hook for view changes — starts portfolio tour once when Portfolio is first opened.
 */
export function maybeStartPortfolioTour(viewId, ctx) {
  if (viewId !== 'portfolio') return;
  if (isCoachQuiet() && !isPortfolioTourFlag()) return;
  void startPortfolioTour(ctx);
}

/* ─── Perk unlock callouts ─── */

let calloutQueueBusy = false;

function ensurePerkCalloutRoot() {
  let root = document.getElementById('perk-callout-root');
  if (root) return root;
  root = document.createElement('div');
  root.id = 'perk-callout-root';
  root.className = 'perk-callout-root hidden';
  root.innerHTML = `
    <div class="perk-callout" role="status">
      <div class="perk-callout-label">UNLOCK READY</div>
      <h3 class="perk-callout-title" id="perk-callout-title"></h3>
      <p class="perk-callout-desc" id="perk-callout-desc"></p>
      <p class="perk-callout-why" id="perk-callout-why"></p>
      <div class="perk-callout-actions">
        <button type="button" class="btn btn-sm" id="perk-callout-help">Learn more</button>
        <button type="button" class="btn btn-accent btn-sm" id="perk-callout-dismiss">Got it</button>
      </div>
    </div>`;
  document.body.appendChild(root);
  return root;
}

function showPerkCalloutUI(perkId, { onDismiss, onHelp } = {}) {
  const perk = PERKS[perkId];
  const hook = PERK_CALLOUT_HOOKS[perkId];
  if (!perk || !hook) {
    onDismiss?.();
    return;
  }
  const root = ensurePerkCalloutRoot();
  const title = document.getElementById('perk-callout-title');
  const desc = document.getElementById('perk-callout-desc');
  const why = document.getElementById('perk-callout-why');
  if (title) title.textContent = perk.name;
  if (desc) desc.textContent = perk.desc;
  if (why) why.textContent = hook.why;
  root.classList.remove('hidden');

  const dismiss = () => {
    root.classList.add('hidden');
    onDismiss?.();
  };
  document.getElementById('perk-callout-dismiss').onclick = dismiss;
  document.getElementById('perk-callout-help').onclick = () => {
    onHelp?.(hook.helpSec);
    dismiss();
  };
}

/**
 * Show at most one pending perk callout. Marks shown + persists via saveGame.
 */
export function checkAndShowPerkCallouts(state, { saveGame } = {}) {
  if (!state?.meta || calloutQueueBusy) return;
  if (isCoachQuiet()) return;
  if (document.getElementById('onboard-overlay')
    && !document.getElementById('onboard-overlay').classList.contains('hidden')) {
    return;
  }

  const pending = listPendingPerkCallouts(state);
  if (!pending.length) return;

  const perkId = pending[0];
  calloutQueueBusy = true;
  showPerkCalloutUI(perkId, {
    onHelp: (sec) => {
      openHelp('guide');
      requestAnimationFrame(() => {
        document.getElementById(`help-sec-${sec}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    },
    onDismiss: () => {
      markPerkCalloutShown(state.meta, perkId);
      saveGame?.({ immediate: true });
      calloutQueueBusy = false;
      setTimeout(() => checkAndShowPerkCallouts(state, { saveGame }), 400);
    },
  });
}
