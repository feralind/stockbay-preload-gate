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
 * Inline dossier for perk cards (no floating tooltip).
 * @param {string} perkId
 */
export function buildPerkInlineHtml(perkId) {
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
    .map((line) => `<li>${escapeTip(line)}</li>`)
    .join('');
  const notes = (dossier.notes || [])
    .map((line) => `<p class="perk-inline-note">${escapeTip(line)}</p>`)
    .join('');

  return `
    <div class="perk-inline-dossier">
      <div class="perk-inline-block">
        <div class="perk-inline-label">Purpose</div>
        <p class="perk-inline-point">${escapeTip(dossier.point)}</p>
      </div>
      <div class="perk-inline-block">
        <div class="perk-inline-label">Effects</div>
        <ul class="perk-inline-effects">${effects}</ul>
      </div>
      <div class="perk-inline-block">
        <div class="perk-inline-label">Requirements</div>
        <p class="perk-inline-reqs">${escapeTip(reqs.join(' · '))}</p>
      </div>
      ${notes ? `<div class="perk-inline-block perk-inline-notes">${notes}</div>` : ''}
    </div>`;
}

/**
 * @param {string} perkId
 * @param {{ owned?: boolean, canBuy?: boolean, statusLabel?: string }} [ctx]
 * @deprecated Floating tooltips removed — use buildPerkInlineHtml.
 */
export function buildPerkTooltipHtml(perkId, ctx = {}) {
  const perk = PERKS[perkId];
  const inner = buildPerkInlineHtml(perkId);
  if (!perk || !inner) return '';
  return `<div class="perk-tip-card"><div class="perk-tip-name">${escapeTip(perk.name)}</div>${inner}</div>`;
}

function escapeTip(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** No-op: tooltips removed; stats live on the card. */
export function bindPerkTooltips() {}

export function teardownPerkTooltips() {
  const el = document.getElementById('perk-tooltip-root');
  if (el) {
    el.classList.add('hidden');
    el.innerHTML = '';
  }
}
