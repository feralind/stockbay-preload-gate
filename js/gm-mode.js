// @ts-check
/**
 * Desk support toolkit — unlocked only via Settings access code.
 * Loadouts write justified spend ledgers (sanitize-safe). No boot flags / URL arms.
 */

import { PERKS } from './config.js';
import { VAULT_ITEMS, VAULT_COST_BY_ID, KNOWN_VAULT_IDS } from './vault.js';
import { PRIVATE_SALON_ITEMS } from './private-salon.js';
import { BLACKMARKET_ITEM_POOL, BLACKMARKET_COST_BY_ID } from './blackmarket.js';
import { THE_SEAT } from './the-seat.js';
import { OFFICE_TIERS, getCumulativeOfficeSpend } from './office.js';
import { LUXURY_ITEMS } from './luxury.js';
import { ESTATE_ASSETS, syncEstateDerived } from './estates.js';
import { COLLECTION_MILESTONES, getCollectionClaimedCashTotal } from './collection-log.js';
import { COLLECTION_SETS } from './collection-flavor.js';
import { createMetaState } from './meta.js';
import { getDayCount } from './market.js';
import { LICENSE_ORDER } from './licenses.js';

export const GM_SESSION_KEY = 'stockway_desk_support_v1';
export const GM_CASH = 250_000_000;

/** @type {boolean | null} */
let gmActiveCache = null;

/**
 * Access digest parts (SHA-256 hex) — assembled at runtime; plaintext code is not stored.
 * Peppered input format is fixed in verifyAccessCode (not greppable as the digits alone).
 */
const _H = [
  'e9c1354d', 'c4f28413', '1c1603f4', 'ef26f471',
  '6826b824', 'f5f5b791', 'c093afe9', 'a0adf28d',
];

function expectedDigest() {
  return _H.join('');
}

async function digestUtf8(text) {
  const data = new TextEncoder().encode(text);
  if (globalThis.crypto?.subtle?.digest) {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Node / test fallback
  try {
    const { createHash } = await import('node:crypto');
    return createHash('sha256').update(text, 'utf8').digest('hex');
  } catch (_) {
    return '';
  }
}

/**
 * @param {string} raw
 * @returns {Promise<boolean>}
 */
export async function verifyAccessCode(raw) {
  const code = String(raw ?? '').trim();
  if (!/^\d{4,12}$/.test(code)) return false;
  // Pepper hides digit strings from casual grep of the built bundle.
  const dig = await digestUtf8(`sw\u00B7desk\u00B7v1|${code}`);
  return dig === expectedDigest();
}

function writeUnlocked() {
  try { sessionStorage.setItem(GM_SESSION_KEY, '1'); } catch (_) { /* ignore */ }
  gmActiveCache = true;
}

/** Restore unlock for this browser session only (no URL / bat arms). */
export function detectAndArmGmMode() {
  try {
    if (sessionStorage.getItem(GM_SESSION_KEY) === '1') {
      gmActiveCache = true;
      return true;
    }
  } catch (_) { /* ignore */ }
  gmActiveCache = false;
  return false;
}

export function isGmMode() {
  if (gmActiveCache != null) return gmActiveCache;
  try {
    gmActiveCache = sessionStorage.getItem(GM_SESSION_KEY) === '1';
  } catch (_) {
    gmActiveCache = false;
  }
  return !!gmActiveCache;
}

/**
 * @param {string} raw
 * @returns {Promise<{ ok: boolean, msg: string }>}
 */
export async function tryUnlockWithCode(raw) {
  const ok = await verifyAccessCode(raw);
  if (!ok) return { ok: false, msg: 'Code not recognized' };
  writeUnlocked();
  return { ok: true, msg: 'Support tools unlocked' };
}

export function clearGmSession() {
  try { sessionStorage.removeItem(GM_SESSION_KEY); } catch (_) { /* ignore */ }
  gmActiveCache = false;
}

export const GM_SHORTCUTS = [
  { keys: 'Ctrl+Shift+G', action: 'Toggle support panel' },
  { keys: '` (backtick)', action: 'Toggle support panel' },
  { keys: '[ / ]', action: 'Cycle views' },
  { keys: 'Space', action: 'Pause / resume market' },
  { keys: 'Ctrl+S', action: 'Force save' },
];

/** @type {{ id: string, label: string, hint: string }[]} */
export const GM_PANEL_ACTIONS = [
  { id: 'fullLoadout', label: 'Full playtest loadout', hint: 'Cash, licenses, perks, vault, BM, seat, office, luxury, collections' },
  { id: 'cashRep', label: 'Cash + licenses only', hint: `$${GM_CASH.toLocaleString()} cash · all licenses · max credit` },
  { id: 'allPerks', label: 'Unlock all perks', hint: 'Every perk id owned' },
  { id: 'allCollectibles', label: 'All collectibles', hint: 'Vault + salon + Seat (ledgers justified)' },
  { id: 'maxOfficeLuxury', label: 'Max office + luxury', hint: 'Investment Empire + all luxury sinks' },
  { id: 'claimCollections', label: 'Claim collection prestige', hint: 'Milestones + set flair (sanitize-safe)' },
  { id: 'skipCoaches', label: 'Skip coaches / tours', hint: 'Mark onboarded one-shots so UI stays clear' },
];

/**
 * @param {object} state
 * @param {string} actionId
 */
export function applyGmAction(state, actionId) {
  if (!state || typeof state !== 'object') return { ok: false, msg: 'No state' };
  switch (actionId) {
    case 'fullLoadout':
      applyFullGmLoadout(state);
      return { ok: true, msg: 'Full playtest loadout applied' };
    case 'cashRep':
      applyGmCashRep(state);
      return { ok: true, msg: 'Cash, licenses, and credit boosted' };
    case 'allPerks':
      applyGmAllPerks(state);
      return { ok: true, msg: 'All perks unlocked' };
    case 'allCollectibles':
      applyGmAllCollectibles(state);
      return { ok: true, msg: 'Collectibles unlocked' };
    case 'maxOfficeLuxury':
      applyGmMaxOfficeLuxury(state);
      return { ok: true, msg: 'Office + luxury maxed' };
    case 'claimCollections':
      applyGmCollectionClaims(state);
      return { ok: true, msg: 'Collection milestones + sets claimed' };
    case 'skipCoaches':
      applyGmSkipCoaches(state);
      return { ok: true, msg: 'Coaches / tours marked done' };
    default:
      return { ok: false, msg: `Unknown action: ${actionId}` };
  }
}

/** @param {object} state */
export function applyGmCashRep(state) {
  if (!state.portfolio || typeof state.portfolio !== 'object') {
    state.portfolio = { cash: GM_CASH, longs: {}, shorts: {}, options: [], pendingOrders: [], orderTickets: [] };
  } else {
    state.portfolio.cash = GM_CASH;
  }
  if (!state.meta || typeof state.meta !== 'object') state.meta = createMetaState();
  state.licenses = LICENSE_ORDER.slice();
  if (!state.finance || typeof state.finance !== 'object') {
    state.finance = { personalCredit: 850, businessCredit: 850, loans: [] };
  } else {
    state.finance.personalCredit = 850;
    state.finance.businessCredit = 850;
  }
}

/** @param {object} state */
export function applyGmAllPerks(state) {
  state.perks = Object.keys(PERKS);
}

/** @param {object} state */
export function applyGmAllCollectibles(state) {
  const vaultIds = [
    ...Object.keys(VAULT_ITEMS),
    ...Object.keys(PRIVATE_SALON_ITEMS),
  ].filter((id) => KNOWN_VAULT_IDS.has(id));
  state.vaultOwned = [...new Set(vaultIds)];
  let vaultSpend = 0;
  for (const id of state.vaultOwned) vaultSpend += Number(VAULT_COST_BY_ID.get(id) || 0);
  state.vaultSpentTotal = vaultSpend;
  state.salonSpentTotal = Object.values(PRIVATE_SALON_ITEMS).reduce((s, i) => s + (Number(i.cost) || 0), 0);

  const bmIds = BLACKMARKET_ITEM_POOL.map((i) => i.id);
  state.blackMarketOwned = [...new Set(bmIds)];
  let bmSpend = 0;
  for (const id of state.blackMarketOwned) bmSpend += Number(BLACKMARKET_COST_BY_ID.get(id) || 0);
  state.blackMarketSpentTotal = bmSpend;

  state.seatOwned = true;
  let day = 1;
  try {
    day = Math.max(1, Math.floor(Number(getDayCount()) || 1));
  } catch (_) { /* market not ready */ }
  state.seatPurchaseDay = day;
  state.seatSpentTotal = THE_SEAT.cost;
}

/** @param {object} state */
export function applyGmMaxOfficeLuxury(state) {
  const top = OFFICE_TIERS[OFFICE_TIERS.length - 1];
  state.officeTierId = top.id;
  state.officeSpentTotal = getCumulativeOfficeSpend(top.id);
  state.luxuryOwned = LUXURY_ITEMS.map((i) => i.id);
  state.luxurySpentTotal = LUXURY_ITEMS.reduce((s, i) => s + (Number(i.price) || 0), 0);
  if (!state.meta) state.meta = createMetaState();
  const lastLux = LUXURY_ITEMS[LUXURY_ITEMS.length - 1];
  if (lastLux?.flair) state.meta.luxuryFlair = lastLux.flair;

  state.estateOwned = ESTATE_ASSETS.map((a) => a.id);
  state.estateSpentTotal = ESTATE_ASSETS.reduce((s, a) => s + (Number(a.price) || 0), 0);
  state.estateEquityExtracted = 0;
  state.estateCreditUsed = 0;
  state.estateCashOutCount = 0;
  state.estateLastCashOutDay = null;
  const lastEstate = ESTATE_ASSETS[ESTATE_ASSETS.length - 1];
  if (lastEstate?.flair) state.meta.estateFlair = lastEstate.flair;
  syncEstateDerived(state);
}

/** @param {object} state */
export function applyGmCollectionClaims(state) {
  if (!state.meta) state.meta = createMetaState();
  state.collectionClaims = COLLECTION_MILESTONES.map((m) => m.id);
  state.collectionRewardCashTotal = getCollectionClaimedCashTotal(state.collectionClaims);
  const archivist = COLLECTION_MILESTONES.find((m) => m.flair)?.flair || null;
  if (archivist) state.meta.collectionFlair = archivist;

  const completeIds = COLLECTION_SETS
    .filter((set) => set.memberIds.every((id) => {
      if (id === 'theSeat') return !!state.seatOwned;
      if ((state.vaultOwned || []).includes(id)) return true;
      if ((state.blackMarketOwned || []).includes(id)) return true;
      return false;
    }))
    .map((s) => s.id);
  state.meta.setClaims = completeIds;
  const lastSet = COLLECTION_SETS.find((s) => completeIds.includes(s.id) && s.flair);
  if (lastSet?.flair) state.meta.setFlair = lastSet.flair;
}

/** @param {object} state */
export function applyGmSkipCoaches(state) {
  if (!state.meta) state.meta = createMetaState();
  const m = state.meta;
  m.portfolioTourShown = true;
  m.marginCallCoachShown = true;
  m.circuitHaltCoachShown = true;
  m.simStatusCoachShown = true;
  m.graduationCoachShown = true;
  m.blackMarketLegendCoachShown = true;
  m.perkCalloutsShown = Object.fromEntries(Object.keys(PERKS).map((id) => [id, true]));
}

export function applyFullGmLoadout(state) {
  applyGmCashRep(state);
  applyGmAllPerks(state);
  applyGmAllCollectibles(state);
  applyGmMaxOfficeLuxury(state);
  applyGmCollectionClaims(state);
  applyGmSkipCoaches(state);
}

export function buildGmWelcomeHtml() {
  const shortcuts = GM_SHORTCUTS.map((row) => (
    `<div class="gm-shortcut-row"><kbd>${escapeHtml(row.keys)}</kbd><span>${escapeHtml(row.action)}</span></div>`
  )).join('');
  const actions = GM_PANEL_ACTIONS.map((a) => (
    `<li><strong>${escapeHtml(a.label)}</strong> — ${escapeHtml(a.hint)}</li>`
  )).join('');
  return `
    <div class="help-section-label">DESK SUPPORT</div>
    <h2 id="gm-welcome-title">Tools unlocked</h2>
    <p class="muted-text">Session-only QA tools. Use the panel for loadouts — ledgers stay sanitize-safe.</p>
    <div class="gm-welcome-grid">
      <section>
        <h3>Shortcuts</h3>
        <div class="gm-shortcut-list">${shortcuts}</div>
      </section>
      <section>
        <h3>Panel actions</h3>
        <ul class="gm-action-list">${actions}</ul>
      </section>
    </div>
    <div class="gm-welcome-actions">
      <button type="button" class="btn btn-accent btn-block" id="gm-apply-enter">Apply full loadout</button>
      <button type="button" class="btn btn-block" id="gm-enter-plain">Keep current save</button>
    </div>
  `;
}

export function buildGmPanelHtml() {
  const btns = GM_PANEL_ACTIONS.map((a) => (
    `<button type="button" class="btn btn-sm gm-panel-btn" data-gm-action="${escapeAttr(a.id)}" title="${escapeAttr(a.hint)}">${escapeHtml(a.label)}</button>`
  )).join('');
  return `
    <div class="gm-panel-head">
      <strong>Desk support</strong>
      <button type="button" class="btn-icon gm-panel-x" id="gm-panel-close" aria-label="Close">✕</button>
    </div>
    <p class="gm-panel-sub">Session tools. Ledgers stay sanitize-safe.</p>
    <div class="gm-panel-actions">${btns}</div>
    <div class="gm-panel-foot">
      <button type="button" class="btn btn-sm" data-gm-goto="dashboard">Dashboard</button>
      <button type="button" class="btn btn-sm" data-gm-goto="vault">Vault</button>
      <button type="button" class="btn btn-sm" data-gm-goto="collection">Collection</button>
      <button type="button" class="btn btn-sm" data-gm-goto="finance">Finance</button>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;');
}
