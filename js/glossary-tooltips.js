// @ts-check
/**
 * Desk glossary tips — Achievements-style cursor sheets.
 * First open keeps a short dwell; switching between gloss targets swaps immediately.
 * Force-hide on switchView (see .cursor/rules/stockway-cursor-tips.mdc).
 */
import { getHaltInfo, CIRCUIT_BREAK_PCT, CIRCUIT_HALT_MINUTES } from './market.js';
import {
  getActiveLoans, getFirmDebt, getNextLoanPaymentDue, minPaymentForLoan,
} from './finance.js';

/** First-open dwell only — retargets while a tip is already showing are instant. */
const HOVER_MS = 500;
/** Grace so DOM re-renders (market ticks) don't flash the tip off between siblings. */
const HIDE_GRACE_MS = 120;

/**
 * Live desk snapshot for dynamic tips (debt ledger, etc.).
 * @type {null | (() => { finance?: object, estateCreditUsed?: number, vaultPledgedValue?: number, firmStrengthPct?: number })}
 */
let glossLiveContext = null;

/**
 * @param {null | (() => { finance?: object, estateCreditUsed?: number, vaultPledgedValue?: number, firmStrengthPct?: number })} fn
 */
export function setGlossLiveContext(fn) {
  glossLiveContext = typeof fn === 'function' ? fn : null;
}

function fmtMoney(n) {
  const v = Math.round(Number(n) || 0);
  return `$${v.toLocaleString()}`;
}

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
    title: 'Available Buying Power',
    blurb: 'Desk cash you can still put into new long trades — scaled by personal credit. Bank deposits do not add buying power.',
    rows: [
      { label: 'Without Margin + Fair+', value: 'Equals desk cash' },
      { label: 'Margin + Good credit (670+)', value: '2× desk cash on longs' },
      { label: 'Margin + Fair (580–669)', value: '1.5× desk cash on longs' },
      { label: 'Poor (<580)', value: '0.70× desk cash (opens dampened)' },
      { label: 'Options', value: 'Cash-only premiums — not this BP line' },
    ],
    note: 'Vault book and bank checking/savings count toward net worth, not Available Buying Power.',
    arcane: 'Pros size risk from buying power first — cash is oxygen; leverage is borrowed breath.',
  },
  'net-worth': {
    title: 'Net Worth vs Trading Equity',
    blurb: 'Two ledgers: the trading book vs the firm statement.',
    rows: [
      { label: 'Trading equity', value: 'Desk cash + positions − debt' },
      { label: 'Net Worth', value: 'Trading equity + Vault + estates + bank deposits' },
      { label: 'Buying power', value: 'Desk cash only — not parked bank cash' },
    ],
    note: 'Vault appraisal and bank reserves book into NW; only desk cash funds trades.',
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
  'total-debt': {
    title: 'Total Debt',
    blurb: 'Who you owe, how much, and what auto-pay needs at day end.',
    rows: [
      { label: 'Sources', value: 'Bank loans + property credit' },
      { label: 'Minimum', value: 'Per-loan auto-pay each game day' },
      { label: 'Next payment', value: 'Sum of tonight’s minimums' },
    ],
    note: 'Missed auto-pay damages credit harder than on-time pays rebuild it.',
    arcane: 'Debt is a tool until it becomes the desk.',
  },
  'vault-pledged': {
    title: 'Vault Pledged',
    blurb: 'Collectibles marked as collateral — lenders count about 50% LTV toward borrow ceilings.',
    rows: [
      { label: 'LTV', value: '50% of pledged appraisal' },
      { label: 'Effect', value: 'Raises facility room at underwriting' },
      { label: 'Buying power', value: 'Does not fund trades' },
    ],
    note: 'Pledge from the Vault tab. Appraisal books into NW; cash still comes from the trading book.',
    arcane: 'Collateral is trust you can point at.',
  },
  'firm-strength': {
    title: 'Firm Strength',
    blurb: 'Net-worth facility boost — a stronger book unlocks larger underwriting lines.',
    rows: [
      { label: 'Source', value: 'Firm net worth (equity + vault − debt)' },
      { label: 'Effect', value: '+% to bank facility ceilings' },
      { label: 'Credit', value: 'Still gates approval — strength sizes the line' },
    ],
    note: 'Grow NW to expand how much each lender will underwrite.',
    arcane: 'Banks lend to the statement, not the story.',
  },
  'next-payment': {
    title: 'Next Payment',
    blurb: 'Cash auto-pulled at day end for every active loan — keep this much free or take a late hit.',
    rows: [
      { label: 'Cadence', value: 'Every game day (not monthly)' },
      { label: 'Minimum', value: 'About 2× daily interest or half of balance ÷ days left' },
      { label: 'Term', value: '30 / 60 / 90 game days — pick when you borrow' },
    ],
    note: 'Missed auto-pay damages credit harder than on-time pays rebuild it.',
    arcane: 'Liquidity is the real collateral.',
  },
  'office-progress': {
    title: 'Office Progression',
    blurb: 'Cosmetic cash ladder for firm status — no fill, margin, or APR changes.',
    rows: [
      { label: 'Gates', value: 'Net Worth + license + cash for next tier' },
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
      { label: 'Online', value: 'Can fetch base quotes' },
      { label: 'Simulated tape', value: 'Clock, events & halts drive prices' },
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
    blurb: 'A day goal with a cash reward if you finish it before the day ends.',
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

  if (id === 'total-debt') {
    const base = GLOSS_TIPS['total-debt'];
    const ctx = glossLiveContext?.() || {};
    const finance = ctx.finance || { loans: [] };
    const estateCredit = Math.max(0, Number(ctx.estateCreditUsed) || 0);
    const loans = getActiveLoans(finance);
    const total = getFirmDebt(finance, estateCredit);
    const next = getNextLoanPaymentDue(finance);

    if (!loans.length && estateCredit <= 0) {
      return {
        title: base.title,
        blurb: base.blurb,
        rows: [
          { label: 'Balance', value: '$0' },
          { label: 'Creditors', value: 'None — no open loans' },
          { label: 'Next payment', value: next.dueLabel },
        ],
        note: 'Borrow from Lenders to leverage the desk. Auto-pay runs every game day.',
        arcane: base.arcane,
      };
    }

    /** @type {Array<{ label: string, value: string }>} */
    const rows = loans.slice(0, 6).map((loan) => {
      const min = minPaymentForLoan(loan);
      const bank = loan.bankName || loan.bankId || 'Lender';
      const type = loan.type === 'company' ? 'company' : 'personal';
      return {
        label: `${bank} · ${type}`,
        value: `${fmtMoney(loan.balance)} · min $${min.toFixed(2)}/day · ${Math.max(0, Math.floor(Number(loan.daysLeft) || 0))}d left`,
      };
    });
    if (loans.length > 6) {
      rows.push({ label: 'More loans', value: `+${loans.length - 6} not shown` });
    }
    if (estateCredit > 0) {
      rows.push({ label: 'Property credit', value: fmtMoney(estateCredit) });
    }
    rows.push({ label: 'Total owed', value: fmtMoney(total) });
    rows.push({
      label: 'Next payment',
      value: next.loanCount
        ? `${fmtMoney(next.due)} · ${next.dueLabel}`
        : next.dueLabel,
    });

    return {
      title: base.title,
      blurb: base.blurb,
      rows,
      note: base.note,
      arcane: base.arcane,
    };
  }

  if (id === 'vault-pledged') {
    const base = GLOSS_TIPS['vault-pledged'];
    const ctx = glossLiveContext?.() || {};
    const pledged = Math.max(0, Number(ctx.vaultPledgedValue) || 0);
    return {
      ...base,
      rows: [
        { label: 'Pledged now', value: fmtMoney(pledged) },
        ...(base.rows || []),
      ],
    };
  }

  if (id === 'firm-strength') {
    const base = GLOSS_TIPS['firm-strength'];
    const ctx = glossLiveContext?.() || {};
    const pct = Math.max(0, Number(ctx.firmStrengthPct) || 0);
    return {
      ...base,
      rows: [
        { label: 'Boost now', value: `+${pct}% facility room` },
        ...(base.rows || []),
      ],
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
  return `
    <strong class="ach-cursor-tip-name">${escapeHtml(tip.title)}</strong>
    <span class="ach-cursor-tip-desc">${escapeHtml(tip.blurb || '')}</span>
    ${rows}
    ${bullets}
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
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.id = 'gloss-tooltip-root';
    document.body.appendChild(tipEl);
  }
  // Same shell as Achievements cursor tip — pointer-events none so tips never trap hover.
  tipEl.className = 'ach-cursor-tip gloss-tip-root';
  tipEl.setAttribute('role', 'tooltip');
  tipEl.setAttribute('aria-hidden', 'true');
  tipEl.hidden = true;
  tipEl.classList.remove('is-on', 'is-open', 'hidden');
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
function tipIsVisible() {
  return !!(tipOpenId && tipEl && !tipEl.hidden && tipEl.classList.contains('is-on'));
}

function armDwell(el, id, opts = {}) {
  clearHideTimer();
  // Same tip already up — refresh position/content only.
  if (tipOpenId === id && tipIsVisible()) {
    showTip(el, id);
    return;
  }
  // Tip already showing for another marker — swap immediately (Achievements handoff).
  if (tipIsVisible() && tipOpenId !== id) {
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
    // Only the live element under the cursor — never fall back to another view's
    // matching data-gloss (that resurrected Cash tips after navigate).
    const live = glossAtPoint(lastPointerX, lastPointerY);
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
    el.hidden = true;
    el.classList.remove('is-on', 'is-open', 'hidden');
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '';
    delete el.dataset.glossId;
  }
}

/**
 * Place like Achievements — follow cursor, flip near viewport edges.
 * @param {HTMLElement} popover
 */
function placeTipAtCursor(popover) {
  const pad = 14;
  popover.style.visibility = 'hidden';
  popover.hidden = false;
  popover.classList.add('is-on');
  const tw = popover.offsetWidth || 220;
  const th = popover.offsetHeight || 80;
  let left = lastPointerX + pad;
  let top = lastPointerY + pad;
  if (left + tw > window.innerWidth - 8) left = lastPointerX - tw - pad;
  if (top + th > window.innerHeight - 8) top = lastPointerY - th - pad;
  if (left < 8) left = 8;
  if (top < 8) top = 8;
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
  const html = buildGlossTipHtml(tip);
  const dynamic = id === 'total-debt' || id === 'vault-pledged' || id === 'firm-strength' || id === 'trading-halted';
  if (root.dataset.glossId !== id || root.hidden || dynamic) {
    root.innerHTML = html;
    root.dataset.glossId = id;
  }
  root.setAttribute('aria-hidden', 'false');
  placeTipAtCursor(root);
}

/**
 * @param {string} id
 */
function scheduleHide(id) {
  clearHideTimer();
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
    hideGlossTip();
  }, HIDE_GRACE_MS);
}

/**
 * Call after renderAll / portfolio rebuild so a still cursor keeps its dwell.
 */
export function resyncGlossaryHover() {
  if (!initialized) return;
  const live = glossAtPoint(lastPointerX, lastPointerY);
  if (!(live instanceof HTMLElement)) {
    // Cursor left the gloss target — do not keep a floating tip alive.
    if (tipOpenId) hideGlossTip();
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
    if (tipOpenId && tipEl && !tipEl.hidden) placeTipAtCursor(tipEl);
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
    const to = /** @type {HTMLElement | null} */ (e.relatedTarget);
    if (to && el.contains(to)) return;
    const id = el.getAttribute('data-gloss');
    if (!id) return;
    // Moving onto another gloss marker — don't hide/dwell; pointerover swaps instantly.
    const nextGloss = to?.closest?.('[data-gloss]');
    if (nextGloss instanceof HTMLElement && !nextGloss.classList.contains('has-stat-popover')) {
      clearHideTimer();
      return;
    }
    scheduleHide(id);
    if (!to) {
      queueMicrotask(() => resyncGlossaryHover());
    }
  });

  document.addEventListener('pointerdown', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t?.closest?.('[data-gloss]')) {
      hideGlossTip();
    }
  });

  window.addEventListener('blur', () => hideGlossTip());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hideGlossTip();
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
