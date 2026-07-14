// @ts-check
/**
 * Desk glossary tips — 0.5s dwell, equity-popover visual language, anti-flicker across re-renders.
 * One-shot coachmarks / equity+REP rich popovers stay separate; this covers ongoing “what is this?” help.
 */
import { getHaltInfo, CIRCUIT_BREAK_PCT, CIRCUIT_HALT_MINUTES } from './market.js';

const HOVER_MS = 500;
/** Grace so DOM re-renders (market ticks) don't flash the tip off. */
const HIDE_GRACE_MS = 220;

/**
 * @typedef {{
 *   title: string,
 *   blurb: string,
 *   rows?: Array<{ label: string, value: string }>,
 *   bullets?: string[],
 *   note?: string,
 *   arcane?: string,
 * }} GlossTip
 */

/** Static tip sheets keyed by data-gloss id. */
export const GLOSS_TIPS = {
  'buying-power': {
    title: 'Buying Power',
    blurb: 'Cash you can still put into new trades right now.',
    rows: [
      { label: 'Without Margin', value: 'Equals spendable cash' },
      { label: 'With Margin perk', value: 'About 2× cash on longs' },
      { label: 'Shorts', value: 'Lock margin separately — not free BP' },
    ],
    note: 'Vault book value does not add buying power. Thin cushion + shorts can trigger margin stress.',
    arcane: 'Pros size risk from buying power first — cash is oxygen; leverage is borrowed breath.',
  },
  'net-worth': {
    title: 'Net Worth vs Trading Equity',
    blurb: 'Two ledgers: the trading book vs the firm statement.',
    rows: [
      { label: 'Trading equity', value: 'Cash + positions − debt' },
      { label: 'Net Worth', value: 'Trading equity + Vault book' },
      { label: 'Buying power', value: 'Spendable cash — not NW' },
    ],
    note: 'Vault appraisal books into NW; it does not fund trades.',
    arcane: 'Equity trades. Net Worth states.',
  },
  'credit-score': {
    title: 'Credit Score',
    blurb: 'Personal & business scores (300–850) set APR, limits, and underwriting.',
    rows: [
      { label: 'Builds', value: 'Hold through day-end interest, then repay' },
      { label: 'Hurts', value: 'Lates, high utilization, spam inquiries' },
      { label: 'Hold rule', value: 'Same-day borrow→repay does not farm score' },
    ],
    note: 'Utilization = open debt ÷ available limits.',
    arcane: 'Credit is rented trust.',
  },
  'office-progress': {
    title: 'Office Progression',
    blurb: 'Cosmetic cash ladder for firm status — no fill, margin, or APR changes.',
    rows: [
      { label: 'Gates', value: 'Net Worth + REP + cash for next tier' },
      { label: 'Owned tier', value: 'Purchased look (ambient)' },
      { label: 'Peak', value: 'Investment Empire' },
    ],
    note: 'Dashboard: Ready = can buy; Eligible = gates met, need cash.',
    arcane: 'Buy the room when the book earns the address.',
  },
  cash: {
    title: 'Cash',
    blurb: 'Money not tied up in open positions — free to spend on the next trade, hire, or perk.',
    bullets: [
      'Rises when you sell/cover or claim rewards',
      'Falls when you buy, hire, train, or unlock perks',
    ],
  },
  pnl: {
    title: 'P&L',
    blurb: 'Profit and loss on positions you still hold. It moves with the market and is not locked in yet.',
    rows: [
      { label: 'Open / unrealized', value: 'Still paper until you close' },
      { label: 'Realized', value: 'Banked after sell / cover' },
    ],
    arcane: 'Open P&L is rumor; Realized is ledger. Desks that confuse the two bleed quietly.',
  },
  'open-pnl': {
    title: 'Open P&L',
    blurb: 'Unrealized profit or loss on holdings you have not closed. Changes as quotes move.',
    note: 'Closing the position turns this into realized P&L.',
  },
  realized: {
    title: 'Realized P&L',
    blurb: 'Profit or loss already locked in from closed trades. It will not change again.',
    note: 'Open P&L is still paper; Realized is done.',
  },
  'win-rate': {
    title: 'Win Rate',
    blurb: 'Percent of closed trades that finished profitable.',
    note: 'Needs closed trades to show a percentage.',
  },
  positions: {
    title: 'Positions',
    blurb: 'How many distinct holdings you have open right now (longs, shorts, and options).',
  },
  drawdown: {
    title: 'Max Drawdown',
    blurb: 'Largest drop from a peak in equity during this run. Measures the worst stretch, not where you sit today.',
    arcane: 'Drawdown is the scar chart. Survivors size so one scar never ends the career.',
  },
  'total-equity': {
    title: 'Total Equity',
    blurb: 'Cash plus positions mark-to-market, plus Vault and Estate equity, net of loans and estate credit.',
    note: 'Hover Equity in the top bar for a full breakdown. Buying an estate converts cash into estate equity — Total Equity stays whole.',
  },
  'estate-equity': {
    title: 'Estate Equity',
    blurb: 'Book value of owned lifestyle assets (residences, cars, yachts, islands), minus any equity you have cashed out.',
    note: 'Drawn property credit is debt — it does not shrink this line; it reduces Total Equity via loans/credit.',
  },
  'trading-halted': {
    title: 'Trading Halted',
    blurb: 'This symbol moved too far from the session open, so new buys and shorts are paused.',
    bullets: [
      `Trip threshold: about ${(CIRCUIT_BREAK_PCT * 100).toFixed(0)}% from session open`,
      `Typical pause: ~${CIRCUIT_HALT_MINUTES} game minutes`,
      'You can still sell longs or cover shorts to cut risk',
    ],
    note: 'Real exchanges halt names the same way — to slow cascading panic.',
    arcane: 'Halts are circuit breakers for panic — the desk that waits often keeps its capital.',
  },
  'margin-stress': {
    title: 'Margin Stress',
    blurb: 'Your equity cushion vs position risk is thin. Brokers require a minimum so a losing short cannot wipe the book before you cover.',
    bullets: [
      'Warning: raise cushion soon',
      'Margin call: restore cushion or face liquidation',
    ],
    note: 'Cover shorts or sell longs to raise the cushion.',
    arcane: 'Margin is rented courage. When the cushion thins, the desk that covers first keeps the seat.',
  },
  'feed-status': {
    title: 'Quote Feed',
    blurb: 'How the desk is getting prices — not a brokerage connection.',
    rows: [
      { label: 'Live / Connected', value: 'Can fetch base quotes' },
      { label: 'Simulation', value: 'Clock, events & halts drive the tape' },
      { label: 'Offline', value: 'Cached baselines or seeds' },
    ],
    note: 'Paper money only. Nothing leaves the browser except quote lookups.',
  },
  'market-status': {
    title: 'Session Status',
    blurb: 'Whether the simulated exchange is open for normal trading right now.',
    rows: [
      { label: 'OPEN', value: 'Regular session' },
      { label: 'PRE / AFTER', value: 'Thin liquidity windows' },
      { label: 'CLOSED', value: 'Evening wrap / next day' },
    ],
  },
  'game-speed': {
    title: 'Game Speed',
    blurb: 'How fast the desk clock runs versus real time.',
    rows: [
      { label: '1x', value: '~30 real minutes per game day' },
      { label: '2x–10x', value: 'Faster days for grinding' },
    ],
  },
  'day-phase': {
    title: 'Day & Phase',
    blurb: 'Current game day and session phase (pre-market, open, evening).',
    note: 'The bar fills as the phase progresses.',
  },
  'fed-rate': {
    title: 'Fed Funds (Sim)',
    blurb: 'Simulated policy rate. It nudges bank loan APRs and how hard Fed hike/cut events hit the tape.',
    note: 'Not the live Federal Reserve quote — desk simulation only.',
  },
  'great-deal': {
    title: 'Great Deal',
    blurb: 'A listing ask priced meaningfully under estimated fair value — better chance of edge if you buy.',
    note: 'Pro Scanner deepens discounts and tags more great deals.',
    arcane: 'Edge is paying less than worth. Crowds chase price; desks hunt mispricing.',
  },
  'stop-loss': {
    title: 'Stop Loss (SL)',
    blurb: 'Auto-exit level if price moves against your position. Limits the damage on a bad move.',
    arcane: 'A stop is a written confession that you can be wrong — and still stay solvent.',
  },
  'take-profit': {
    title: 'Take Profit (TP)',
    blurb: 'Auto-exit level when price hits your target. Locks in gains without watching every tick.',
  },
  'limit-order': {
    title: 'Limit Order',
    blurb: 'Rests until the market reaches your limit price or better, then fills (with slippage on fill).',
  },
  'market-order': {
    title: 'Market Order',
    blurb: 'Fill now near the current quote. Faster, but more slippage on larger size.',
  },
  short: {
    title: 'Short',
    blurb: 'Bet the price falls: borrow and sell now, buy back later to close (cover). Losses are uncapped if price rises.',
    note: 'Needs the Margin Account perk.',
  },
  long: {
    title: 'Long',
    blurb: 'Own shares betting the price rises. Risk is limited to what you paid (plus fees).',
  },
  cover: {
    title: 'Cover',
    blurb: 'Buy back shares to close a short. Ends the short risk and realizes P&L.',
  },
  slippage: {
    title: 'Slippage',
    blurb: 'Fill price can differ from mid — larger orders and thin sessions slip more. Smart Routing reduces it.',
  },
  challenge: {
    title: 'Daily Challenge',
    blurb: 'A day goal with cash and REP if you finish it before the day ends.',
  },
  payroll: {
    title: 'Payroll',
    blurb: 'Staff salaries deduct at the start of each new game day. Hedge Fund Status covers half; Legend Desk adds more.',
  },
  beta: {
    title: 'Beta',
    blurb: 'How much a name tends to move with the broader market. Higher beta usually means louder swings when the tape is hot or cold.',
    rows: [
      { label: 'Beta ~1', value: 'Moves roughly with the market' },
      { label: 'Beta > 1', value: 'Amplifies market moves' },
      { label: 'Beta < 1', value: 'Usually calmer than the tape' },
    ],
    note: 'On this desk, sector correlation and market beta help prices move together — not a live broker beta quote.',
    arcane: 'Beta is how tightly a name dances with the room. Size the waltz, not just the song.',
  },
  'position-size': {
    title: 'Position Size',
    blurb: 'Capital in one idea. Size sets how hard a miss hits equity — not just whether you are right.',
    bullets: [
      'Smaller size → smaller max loss',
      'One-name concentration raises path risk',
      'Start at 1 share; scale when the book can absorb a miss',
    ],
    arcane: 'Ask “how much can I lose?” before “how much can I make?”',
  },
  delta: {
    title: 'Delta (Greeks)',
    blurb: 'For options, delta estimates how much the contract’s value tends to move when the underlying moves $1. Calls have positive delta; puts have negative.',
    rows: [
      { label: 'Call delta', value: 'Rises toward 1 as it goes deep in the money' },
      { label: 'Put delta', value: 'Falls toward −1 when deep in the money' },
      { label: 'Near 0', value: 'Far out of the money — cheaper, less responsive' },
    ],
    note: 'Other Greeks (gamma, theta, vega) refine that story. Start with delta as directional sensitivity.',
    arcane: 'Delta is the option’s shadow of the stock — how much of the tape it feels.',
  },
  diversification: {
    title: 'Diversification',
    blurb: 'Spread capital across ideas that do not all move together.',
    bullets: [
      'Same-sector stacks often crash together',
      'Idle cash is dry powder — also a position',
      'Diversify after you understand each line',
    ],
    arcane: 'Legends run many small risks — not one heroic all-in.',
  },
  'implied-volatility': {
    title: 'Implied Volatility (IV)',
    blurb: 'The market’s priced-in expectation of how wild moves might be. Higher IV usually means richer option premiums; after big events, IV often “crushes.”',
    rows: [
      { label: 'High IV', value: 'Options cost more; bigger expected swings' },
      { label: 'Low IV', value: 'Cheaper premiums; quieter expected tape' },
      { label: 'IV crush', value: 'Premium can fall after an event even if you were directionally right' },
    ],
    note: 'On this desk, earnings and events can change vol — read IV as the option market’s fear/greed dial.',
    arcane: 'IV is the tape whispering how expensive uncertainty is today.',
  },
  liquidity: {
    title: 'Liquidity',
    blurb: 'How easily you can enter or exit near a fair price. Thin sessions and large size widen the gap between mid and fill (slippage).',
    bullets: [
      'Pre-market / evening can be thinner than the open',
      'Bigger orders slip more',
      'Smart Routing shrinks adverse fill here',
    ],
    arcane: 'Liquidity is the door’s width. Force a crowd through a crack and you pay the jamb.',
  },
  'risk-reward': {
    title: 'Risk / Reward',
    blurb: 'Downside if wrong vs upside if right. SL / TP make the ratio explicit.',
    rows: [
      { label: 'Risk', value: 'Distance to stop (or full loss)' },
      { label: 'Reward', value: 'Distance to target' },
      { label: 'Edge', value: 'Prefer reward > risk for similar odds' },
    ],
    note: 'High win rate with bad payoff ratios can still shrink equity.',
    arcane: 'Know the downside before the click.',
  },
};

/**
 * Build tip payload for a live element (supports dynamic halt details).
 * @param {string} id
 * @param {HTMLElement} [el]
 * @returns {GlossTip | null}
 */
export function resolveGlossTip(id, el) {
  if (id === 'trading-halted') {
    const sym = (el?.getAttribute('data-gloss-sym') || el?.dataset?.glossSym || '').toUpperCase();
    const info = sym ? getHaltInfo(sym) : null;
    const base = GLOSS_TIPS['trading-halted'];
    if (!info) return base;
    const dir = info.reason === 'limit-up' ? 'limit-up (spike)' : 'limit-down (drop)';
    const move = Number.isFinite(info.movePct)
      ? `${(info.movePct * 100).toFixed(1)}% from session open`
      : 'large move from session open';
    return {
      title: `${sym || 'Symbol'} Halted`,
      blurb: base.blurb,
      rows: [
        { label: 'Reason', value: dir },
        { label: 'Move', value: move },
        { label: 'Pause', value: `~${CIRCUIT_HALT_MINUTES} game minutes` },
      ],
      bullets: [
        'New buys and shorts blocked while halted',
        'Sell / cover still allowed to reduce risk',
      ],
      note: base.note,
      arcane: base.arcane,
    };
  }
  return GLOSS_TIPS[id] || null;
}

/**
 * @param {GlossTip} tip
 */
export function buildGlossTipHtml(tip) {
  if (!tip?.title) return '';
  const rows = (tip.rows || [])
    .map((r) => `<div class="stat-popover-row"><span>${escapeHtml(r.label)}</span><span>${escapeHtml(r.value)}</span></div>`)
    .join('');
  const bullets = (tip.bullets || []).length
    ? `<ul class="gloss-tip-bullets">${tip.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`
    : '';
  const note = tip.note
    ? `<div class="stat-popover-note">${escapeHtml(tip.note)}</div>`
    : '';
  const arcane = tip.arcane
    ? `<div class="gloss-tip-arcane"><span class="gloss-tip-arcane-label">Desk Lore</span><p>${escapeHtml(tip.arcane)}</p></div>`
    : '';
  const hasBody = !!(rows || bullets || note || arcane);
  return `
    <div class="stat-popover-title">${escapeHtml(tip.title)}</div>
    <p class="stat-popover-blurb">${escapeHtml(tip.blurb)}</p>
    ${rows}
    ${bullets}
    ${hasBody ? '<div class="stat-popover-sep"></div>' : ''}
    ${note}
    ${arcane}`;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let tipEl = null;
let tipTimer = null;
let hideTimer = null;
/** @type {HTMLElement | null} */
let tipAnchor = null;
let tipOpenId = null;
let initialized = false;
/** Dwell tracking survives portfolio/header re-renders under a still cursor. */
let pendingId = null;
let pendingSince = 0;
let lastPointerX = 0;
let lastPointerY = 0;

function ensureTipEl() {
  if (tipEl?.isConnected) return tipEl;
  tipEl = document.getElementById('gloss-tooltip-root');
  if (tipEl) return tipEl;
  tipEl = document.createElement('div');
  tipEl.id = 'gloss-tooltip-root';
  tipEl.className = 'stat-popover gloss-tip-root hidden';
  tipEl.setAttribute('role', 'tooltip');
  tipEl.setAttribute('aria-hidden', 'true');
  tipEl.hidden = true;
  document.body.appendChild(tipEl);

  tipEl.addEventListener('pointerenter', () => {
    clearHideTimer();
  });
  tipEl.addEventListener('pointerleave', () => {
    if (tipOpenId) scheduleHide(tipOpenId);
  });
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

/**
 * @param {number} x
 * @param {number} y
 * @returns {HTMLElement | null}
 */
function glossAtPoint(x, y) {
  if (typeof document === 'undefined' || !document.elementFromPoint) return null;
  const under = document.elementFromPoint(x, y);
  const el = under?.closest?.('[data-gloss]');
  if (!(el instanceof HTMLElement)) return null;
  if (el.classList.contains('has-stat-popover')) return null;
  const id = el.getAttribute('data-gloss');
  if (!id || !resolveGlossTip(id, el)) return null;
  return el;
}

/**
 * @param {HTMLElement} el
 * @param {string} id
 * @param {{ restart?: boolean }} [opts]
 */
function armDwell(el, id, opts = {}) {
  clearHideTimer();
  if (tipOpenId === id && tipEl && !tipEl.hidden) {
    showTip(el, id);
    return;
  }
  if (opts.restart || pendingId !== id) {
    pendingId = id;
    pendingSince = Date.now();
  }
  const elapsed = Date.now() - pendingSince;
  const wait = Math.max(0, HOVER_MS - elapsed);
  clearShowTimer();
  tipTimer = setTimeout(() => {
    tipTimer = null;
    const live = glossAtPoint(lastPointerX, lastPointerY)
      || (el.isConnected ? el : document.querySelector(`[data-gloss="${cssEscape(id)}"]`));
    if (!(live instanceof HTMLElement)) return;
    if (live.getAttribute('data-gloss') !== id) return;
    showTip(live, id);
  }, wait);
}

export function hideGlossTip() {
  clearShowTimer();
  clearHideTimer();
  tipAnchor = null;
  tipOpenId = null;
  pendingId = null;
  pendingSince = 0;
  const el = tipEl || document.getElementById('gloss-tooltip-root');
  if (el) {
    el.classList.add('hidden');
    el.classList.remove('is-open');
    el.hidden = true;
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '';
    delete el.dataset.glossId;
  }
}

/**
 * @param {HTMLElement} anchor
 * @param {HTMLElement} popover
 */
function placeTip(anchor, popover) {
  const gap = 8;
  const pad = 8;
  popover.style.visibility = 'hidden';
  popover.hidden = false;
  popover.classList.add('is-open');
  popover.classList.remove('hidden');
  const rect = anchor.getBoundingClientRect();
  const pw = popover.offsetWidth || 280;
  const ph = popover.offsetHeight || 160;
  let left = rect.left;
  let top = rect.bottom + gap;
  if (left + pw > window.innerWidth - pad) left = window.innerWidth - pw - pad;
  if (left < pad) left = pad;
  if (top + ph > window.innerHeight - pad) top = Math.max(pad, rect.top - ph - gap);
  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
  popover.style.visibility = '';
}

/**
 * @param {HTMLElement} el
 * @param {string} id
 */
function showTip(el, id) {
  clearHideTimer();
  clearShowTimer();
  const tip = resolveGlossTip(id, el);
  if (!tip) return;
  tipAnchor = el;
  tipOpenId = id;
  pendingId = id;
  const root = ensureTipEl();
  if (root.dataset.glossId !== id || root.hidden) {
    root.innerHTML = buildGlossTipHtml(tip);
    root.dataset.glossId = id;
  } else if (id === 'trading-halted') {
    root.innerHTML = buildGlossTipHtml(tip);
  }
  root.setAttribute('aria-hidden', 'false');
  placeTip(el, root);
  requestAnimationFrame(() => {
    if (tipOpenId === id && tipAnchor) placeTip(tipAnchor, root);
  });
}

/**
 * @param {string} id
 */
function scheduleHide(id) {
  clearHideTimer();
  // Keep dwell timer — portfolio re-renders fire pointerout while the cursor never moved.
  hideTimer = setTimeout(() => {
    hideTimer = null;
    const live = glossAtPoint(lastPointerX, lastPointerY);
    if (live instanceof HTMLElement) {
      const liveId = live.getAttribute('data-gloss');
      if (liveId === id || liveId === tipOpenId || liveId === pendingId) {
        armDwell(live, liveId, { restart: false });
        return;
      }
    }
    if (tipEl?.matches?.(':hover')) return;
    hideGlossTip();
  }, HIDE_GRACE_MS);
}

function cssEscape(id) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(id);
  return String(id).replace(/"/g, '\\"');
}

/**
 * Call after renderAll / portfolio rebuild so a still cursor keeps its dwell.
 */
export function resyncGlossaryHover() {
  if (!initialized) return;
  const live = glossAtPoint(lastPointerX, lastPointerY);
  if (!(live instanceof HTMLElement)) {
    if (tipOpenId && tipEl && !tipEl.hidden && tipEl.matches?.(':hover')) return;
    return;
  }
  const id = live.getAttribute('data-gloss');
  if (!id) return;
  if (tipOpenId === id) {
    showTip(live, id);
    return;
  }
  armDwell(live, id, { restart: false });
}

/**
 * One-time delegated binder — survives renderAll without flashing tips off.
 */
export function initGlossaryTooltips() {
  if (initialized || typeof document === 'undefined') return;
  initialized = true;
  ensureTipEl();

  document.addEventListener('pointermove', (e) => {
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
  }, { passive: true });

  document.addEventListener('pointerover', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const el = t?.closest?.('[data-gloss]');
    if (!(el instanceof HTMLElement)) return;
    const from = /** @type {Node | null} */ (e.relatedTarget);
    if (from && el.contains(from)) return;
    if (el.classList.contains('has-stat-popover')) return;
    const id = el.getAttribute('data-gloss');
    if (!id || !resolveGlossTip(id, el)) return;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    armDwell(el, id, { restart: pendingId !== id });
  });

  document.addEventListener('pointerout', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const el = t?.closest?.('[data-gloss]');
    if (!(el instanceof HTMLElement)) return;
    const to = /** @type {Node | null} */ (e.relatedTarget);
    if (to && el.contains(to)) return;
    const id = el.getAttribute('data-gloss');
    if (!id) return;
    scheduleHide(id);
    // Node removal (re-render): immediately try to re-bind under the cursor.
    if (!to) {
      queueMicrotask(() => resyncGlossaryHover());
    }
  });

  document.addEventListener('pointerdown', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t?.closest?.('#gloss-tooltip-root')) return;
    if (t?.closest?.('[data-gloss]')) {
      hideGlossTip();
    }
  });

  window.addEventListener('resize', () => {
    if (!tipOpenId || !tipAnchor || !tipEl || tipEl.hidden) return;
    placeTip(tipAnchor, tipEl);
  });
}

/** @returns {string[]} */
export function listGlossTipIds() {
  return Object.keys(GLOSS_TIPS);
}

/** Exposed for tests. */
export function getGlossHoverMs() {
  return HOVER_MS;
}
