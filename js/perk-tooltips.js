// @ts-check
/**
 * Desk perk hover dossiers — short, concrete effect sheets (PoE-style density, institutional tone).
 */
import { PERKS } from './config.js';

const PERK_NAMES = Object.fromEntries(
  Object.values(PERKS).map((p) => [p.id, p.name]),
);

/**
 * @typedef {{ point: string, effects: string[], notes?: string[] }} PerkDossier
 */

/** @type {Record<string, PerkDossier>} */
export const PERK_DOSSIERS = {
  scanner: {
    point: 'First upgrade on the board. Improves Deal Desk pricing so you find underpriced asks sooner.',
    effects: [
      'Stronger listing discounts',
      'More GREAT DEAL tags in the feed',
      'Prerequisite for most later perks',
    ],
  },
  hrDept: {
    point: 'Opens the hiring desk. Staff automate listings, risk, research, and execution.',
    effects: [
      'Unlocks Staff / HR panel',
      'Base roster cap: 6 seats',
      'Requires Pro Scanner',
    ],
  },
  newsWire: {
    point: 'Information arrives before the tape fully reacts — useful for timing, not a guarantee.',
    effects: [
      'Full simulated desk briefs',
      'Live headlines ~2 minutes before impact',
      'Simulated events may tip early (~45% when Insider is absent)',
    ],
  },
  analyst: {
    point: 'Chart tools for levels and trend. Also unlocks the Research Analyst role.',
    effects: [
      'MA20 and MA50 overlays on the chart',
      'Support and resistance guide lines',
      'Unlocks Research Analyst hire',
    ],
  },
  margin: {
    point: 'Leverage and short selling. Shorts can lose more than the cash you put up.',
    effects: [
      'Unlocks short selling',
      '2× buying power on longs',
      'Required for Options Desk and several staff roles',
    ],
    notes: [
      'Maintenance margin still applies; a call can force liquidation.',
    ],
  },
  complianceSuite: {
    point: 'Firm controls that cut automation errors. Stacks with a Compliance Officer on payroll.',
    effects: [
      '~40% further cut to staff mistake rate',
      'Stacks with Compliance Officer (~45% base cut)',
      'Does not change buying power or fill prices',
    ],
  },
  tradingFloor: {
    point: 'Scale the floor: more seats and faster desk automation.',
    effects: [
      'Staff cap 6 → 8',
      '+25% automation speed',
      'Required for Hedge Fund Status',
    ],
  },
  options: {
    point: 'Derivatives desk for directional or hedged exposure with limited premium risk.',
    effects: [
      'Trade calls and puts on listed symbols',
      'Black–Scholes pricing model',
      'Requires Margin Account',
    ],
  },
  smartRouting: {
    point: 'Execution quality. Your fills — and staff fills — stay closer to the mid.',
    effects: [
      '~35% less adverse slippage vs mid',
      'Applies to market orders and staff trades',
      'Stacks after any equipped relic slippage effect',
    ],
  },
  insider: {
    point: 'Informational edge on listings and events. Often helpful; never certain.',
    effects: [
      'Noisier but better listing value estimates',
      'Simulated events tip early more often (~60%)',
      'Does not alter fill math or buying power',
    ],
  },
  aiAdvisor: {
    point: 'Desk research and signals so you are not flying blind. You still place the trade.',
    effects: [
      'Buy / sell / short signals and daily picks',
      'Advisor chat on the desk',
      'Unlocks Junior Trader hire',
    ],
  },
  auraAmp: {
    point: 'Raises reputation earned from equipped Vault cosmetics when you close a profitable trade.',
    effects: [
      '+1 REP per profitable close (on top of Desk Prestige tier)',
      'Daily prestige REP cap: ×1.5, then +3',
      'Requires cosmetics equipped in Vault slots',
    ],
    notes: [
      'Does not change cash, buying power, margin, or slippage.',
      'No effect until at least one Vault piece is equipped.',
    ],
  },
  hedgeFund: {
    point: 'Institutional scale: payroll relief and a Managing Partner seat.',
    effects: [
      '50% of daily staff salaries covered',
      'Unlocks Managing Partner hire',
      'Requires Trading Floor and Margin Account',
    ],
  },
  primeBroker: {
    point: 'Extra time under a margin call before the desk is forced out.',
    effects: [
      '+8 minutes margin-call grace',
      'Stacks with equipped grace relics (capped)',
      'Does not lower maintenance requirements',
    ],
  },
  legendDesk: {
    point: 'Ceiling of floor scale — maximum seats and further payroll cover.',
    effects: [
      'Staff cap → 10 seats',
      '+10% payroll subsidy (60% total with Hedge Fund)',
      'Requires Hedge Fund Status · Market Legend REP',
    ],
  },
};

/**
 * @param {string} perkId
 * @param {{ owned?: boolean, canBuy?: boolean, statusLabel?: string }} [ctx]
 */
export function buildPerkTooltipHtml(perkId, ctx = {}) {
  const perk = PERKS[perkId];
  const dossier = PERK_DOSSIERS[perkId];
  if (!perk || !dossier) return '';

  const reqs = [];
  if (perk.cost > 0) reqs.push(`Cost $${Number(perk.cost).toLocaleString()}`);
  if (perk.repRequired > 0) reqs.push(`${perk.repRequired} REP`);
  else reqs.push('No REP gate');
  const prereqs = (perk.requires || [])
    .map((id) => PERK_NAMES[id] || id)
    .filter(Boolean);
  if (prereqs.length) reqs.push(`Requires ${prereqs.join(', ')}`);

  const effects = dossier.effects
    .map((line) => `<li><span class="perk-tip-stat">${escapeTip(line)}</span></li>`)
    .join('');
  const notes = (dossier.notes || [])
    .map((line) => `<p class="perk-tip-note">${escapeTip(line)}</p>`)
    .join('');

  const status = ctx.statusLabel
    ? `<span class="perk-tip-status">${escapeTip(ctx.statusLabel)}</span>`
    : '';

  return `
    <div class="perk-tip-card perk-tip-t${perk.tier || 1}" role="tooltip">
      <header class="perk-tip-head">
        <div class="perk-tip-name">${escapeTip(perk.name)}</div>
        <div class="perk-tip-meta">Tier ${perk.tier} · ${escapeTip(perk.tierLabel || '')}${status ? ` · ${status}` : ''}</div>
      </header>
      <section class="perk-tip-block">
        <div class="perk-tip-label">Purpose</div>
        <p class="perk-tip-point">${escapeTip(dossier.point)}</p>
      </section>
      <section class="perk-tip-block">
        <div class="perk-tip-label">Effects</div>
        <ul class="perk-tip-effects">${effects}</ul>
      </section>
      <section class="perk-tip-block">
        <div class="perk-tip-label">Requirements</div>
        <p class="perk-tip-reqs">${escapeTip(reqs.join(' · '))}</p>
      </section>
      ${notes ? `<section class="perk-tip-block perk-tip-notes">${notes}</section>` : ''}
    </div>`;
}

function escapeTip(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const HOVER_MS = 500;
/** Grace so DOM re-renders (market ticks) don't flash the tip off. */
const HIDE_GRACE_MS = 180;

let tipEl = null;
let tipTimer = null;
let hideTimer = null;
/** @type {HTMLElement | null} */
let tipAnchor = null;
/** Survives card re-render when the live DOM node is replaced. */
let tipOpenPerkId = null;
/** @type {WeakMap<HTMLElement, AbortController>} */
const containerAborts = new WeakMap();
/** @type {((id: string) => string) | null} */
let statusGetter = null;
let lastPointerX = 0;
let lastPointerY = 0;
let globalGuardsBound = false;

function ensureTipEl() {
  if (tipEl && tipEl.isConnected) return tipEl;
  const existing = document.getElementById('perk-tooltip-root');
  if (existing) {
    tipEl = /** @type {HTMLElement} */ (existing);
    return tipEl;
  }
  tipEl = document.createElement('div');
  tipEl.id = 'perk-tooltip-root';
  tipEl.className = 'perk-tooltip-root hidden';
  tipEl.setAttribute('aria-hidden', 'true');
  document.body.appendChild(tipEl);
  return tipEl;
}

function clearShowTimer() {
  if (tipTimer) {
    clearTimeout(tipTimer);
    tipTimer = null;
  }
}

function clearHideTimer() {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

function hidePerkTooltip() {
  clearShowTimer();
  clearHideTimer();
  tipAnchor = null;
  tipOpenPerkId = null;
  const el = tipEl || document.getElementById('perk-tooltip-root');
  if (el) {
    el.classList.add('hidden');
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '';
  }
}

/**
 * True when the pointer is still on the open perk card or the tip itself.
 * Scroll often moves the card away without firing pointerleave.
 */
function tipStillUnderPointer() {
  if (!tipOpenPerkId) return false;
  const root = tipEl || document.getElementById('perk-tooltip-root');
  const under = typeof document.elementFromPoint === 'function'
    ? document.elementFromPoint(lastPointerX, lastPointerY)
    : null;
  if (under instanceof Element) {
    if (root?.contains(under)) return true;
    const card = under.closest?.('.perk[data-perk]');
    if (card instanceof HTMLElement && card.getAttribute('data-perk') === tipOpenPerkId) {
      return true;
    }
  }
  if (tipAnchor?.isConnected && tipAnchor.matches(':hover')) return true;
  return false;
}

/** Drop tip immediately when scroll/wheel leaves the card under a still cursor. */
function dismissUnlessStillHovered() {
  clearShowTimer();
  if (!tipOpenPerkId) return;
  if (tipStillUnderPointer()) {
    if (tipAnchor?.isConnected) placeTip(tipAnchor);
    return;
  }
  hidePerkTooltip();
}

function ensureGlobalGuards() {
  if (globalGuardsBound || typeof document === 'undefined') return;
  globalGuardsBound = true;

  document.addEventListener('pointermove', (e) => {
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
  }, { passive: true });

  // Capture: #perks-full scroll doesn't bubble reliably to window in all layouts.
  document.addEventListener('scroll', () => {
    if (!tipOpenPerkId && !tipTimer) return;
    requestAnimationFrame(dismissUnlessStillHovered);
  }, { capture: true, passive: true });

  document.addEventListener('wheel', () => {
    if (!tipOpenPerkId && !tipTimer) return;
    requestAnimationFrame(dismissUnlessStillHovered);
  }, { capture: true, passive: true });
}

/**
 * Position the floating tip near the anchor, keeping it in viewport.
 * Prefer beside the card; never cover the hovered card center (avoids pointer thrash).
 * @param {HTMLElement} anchor
 */
function placeTip(anchor) {
  const root = ensureTipEl();
  const tip = root.firstElementChild;
  if (!tip || !anchor) return;
  const rect = anchor.getBoundingClientRect();
  const pad = 12;
  const tw = tip.offsetWidth || 280;
  const th = tip.offsetHeight || 200;
  let left = rect.right + pad;
  let top = rect.top;
  if (left + tw > window.innerWidth - 8) {
    left = rect.left - tw - pad;
  }
  if (left < 8) left = 8;
  if (top + th > window.innerHeight - 8) top = Math.max(8, window.innerHeight - th - 8);
  if (top < 8) top = 8;
  root.style.left = `${Math.round(left)}px`;
  root.style.top = `${Math.round(top)}px`;
}

/**
 * @param {HTMLElement} el
 * @param {string} perkId
 */
function showTipFor(el, perkId) {
  clearHideTimer();
  tipAnchor = el;
  tipOpenPerkId = perkId;
  const root = ensureTipEl();
  const statusLabel = statusGetter?.(perkId) || '';
  // Avoid full wipe/rebuild if same perk already visible (stops visual flicker).
  if (root.dataset.perkId !== perkId || root.classList.contains('hidden')) {
    root.innerHTML = buildPerkTooltipHtml(perkId, { statusLabel });
    root.dataset.perkId = perkId;
  }
  root.classList.remove('hidden');
  root.setAttribute('aria-hidden', 'false');
  placeTip(el);
  requestAnimationFrame(() => {
    if (tipOpenPerkId === perkId) placeTip(el);
  });
}

/**
 * Schedule hide only if the pointer truly left (survives brief DOM replacement).
 * @param {string} perkId
 */
function scheduleHide(perkId) {
  clearHideTimer();
  // Keep dwell timer — card rebuilds fire pointerleave while the cursor never moved.
  hideTimer = setTimeout(() => {
    hideTimer = null;
    if (tipOpenPerkId !== perkId) return;
    if (tipStillUnderPointer()) {
      const live = document.querySelector(`.perk[data-perk="${CSS.escape(perkId)}"]:hover`)
        || tipAnchor;
      if (live instanceof HTMLElement) {
        tipAnchor = live;
        placeTip(live);
      }
      return;
    }
    hidePerkTooltip();
  }, HIDE_GRACE_MS);
}

/**
 * After perks DOM is rebuilt, re-attach an open tip to the new card node.
 */
function restoreOpenTip(container) {
  if (!tipOpenPerkId) return;
  const root = tipEl || document.getElementById('perk-tooltip-root');
  if (!root || root.classList.contains('hidden')) return;

  const neo = (container?.querySelector?.(`.perk[data-perk="${CSS.escape(tipOpenPerkId)}"]`)
    || document.querySelector(`.perk[data-perk="${CSS.escape(tipOpenPerkId)}"]:hover`)
    || document.querySelector(`.perk[data-perk="${CSS.escape(tipOpenPerkId)}"]`));

  if (neo instanceof HTMLElement) {
    tipAnchor = neo;
    if (tipStillUnderPointer() || hideTimer) {
      placeTip(neo);
    } else {
      hidePerkTooltip();
    }
  }
}

/**
 * Bind 0.5s dwell tooltips to perk cards inside a container.
 * Safe across frequent renderAll rebuilds — does not flash-hide on rebind.
 * @param {HTMLElement | null} container
 * @param {{ getStatus?: (perkId: string) => string, rebind?: boolean }} [opts]
 */
export function bindPerkTooltips(container, opts = {}) {
  if (!container) return;
  if (typeof opts.getStatus === 'function') statusGetter = opts.getStatus;
  ensureGlobalGuards();
  if (opts.rebind === false) return;

  // Drop prior listeners for this container (innerHTML recreates cards each render).
  const prev = containerAborts.get(container);
  if (prev) prev.abort();
  const ac = new AbortController();
  containerAborts.set(container, ac);
  const { signal } = ac;

  container.querySelectorAll('.perk[data-perk]').forEach((el) => {
    const perkId = el.getAttribute('data-perk');
    if (!perkId || !PERK_DOSSIERS[perkId]) return;

    el.addEventListener('pointerenter', (e) => {
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
      clearHideTimer();
      clearShowTimer();
      // Already open for this perk (e.g. after re-render) — just re-anchor.
      if (tipOpenPerkId === perkId && tipEl && !tipEl.classList.contains('hidden')) {
        showTipFor(el, perkId);
        return;
      }
      tipTimer = setTimeout(() => showTipFor(el, perkId), HOVER_MS);
    }, { signal });

    el.addEventListener('pointerleave', () => {
      scheduleHide(perkId);
    }, { signal });

    el.addEventListener('pointerdown', () => {
      hidePerkTooltip();
    }, { signal });

    el.addEventListener('focus', () => {
      clearHideTimer();
      clearShowTimer();
      tipTimer = setTimeout(() => showTipFor(el, perkId), HOVER_MS);
    }, { signal });

    el.addEventListener('blur', () => {
      scheduleHide(perkId);
    }, { signal });
  });

  restoreOpenTip(container);
}

export function teardownPerkTooltips() {
  hidePerkTooltip();
}
