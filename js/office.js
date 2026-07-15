// @ts-check
/**
 * Office progression ladder — purchase + CSS tier attribute.
 * Cosmetic / money-sink only. No margin, BP, slippage, or APR changes.
 */

import { getSpendableCash } from './portfolio.js';
import { requiredLicenseForRep, hasLicense } from './licenses.js';

/** @typedef {{ id: string, name: string, minNet: number, minRep: number, price: number, blurb: string }} OfficeTier */

/** @type {OfficeTier[]} */
export const OFFICE_TIERS = [
  { id: 'bedroom', name: 'Bedroom Desk', minNet: 0, minRep: 0, price: 0, blurb: 'Paper and grit. Trade your way out of the bedroom.' },
  { id: 'studio', name: 'Studio', minNet: 2500, minRep: 20, price: 2000, blurb: 'A real desk appears. Keep compounding.' },
  { id: 'apartment', name: 'Apartment Office', minNet: 10000, minRep: 40, price: 8000, blurb: 'Room to think. Staff and perks start to matter.' },
  { id: 'smallOffice', name: 'Small Office', minNet: 40000, minRep: 120, price: 25000, blurb: 'A proper firm footprint. Financing and floor scale unlock.' },
  { id: 'professional', name: 'Professional Office', minNet: 120000, minRep: 250, price: 75000, blurb: 'Clients notice. Collectibles and prestige start to stack.' },
  { id: 'tradingFloor', name: 'Trading Floor', minNet: 350000, minRep: 400, price: 200000, blurb: 'Noise, screens, and pace. Own the session.' },
  { id: 'executive', name: 'Executive Suite', minNet: 1000000, minRep: 500, price: 600000, blurb: 'Quiet power. Net Worth is a statement.' },
  { id: 'wallStreet', name: 'Wall Street Office', minNet: 5000000, minRep: 900, price: 2000000, blurb: 'Street-level respect. Masterworks belong here.' },
  { id: 'hedgeHq', name: 'Hedge Fund HQ', minNet: 15000000, minRep: 1400, price: 8000000, blurb: 'Institutional air. Crown jewels and legend ranks.' },
  { id: 'empire', name: 'Investment Empire', minNet: 50000000, minRep: 1800, price: 25000000, blurb: 'The desk is a legend. Keep the empire sharp.' },
];

const OFFICE_TIER_BY_ID = new Map(OFFICE_TIERS.map((t) => [t.id, t]));
export const KNOWN_OFFICE_TIER_IDS = new Set(OFFICE_TIERS.map((t) => t.id));
const DEFAULT_OFFICE_TIER_ID = 'bedroom';

/**
 * @param {string} [id]
 * @returns {OfficeTier}
 */
export function getOfficeTier(id) {
  return OFFICE_TIER_BY_ID.get(id) || OFFICE_TIERS[0];
}

/**
 * @param {string} [id]
 * @returns {number}
 */
export function getOfficeTierIndex(id) {
  const idx = OFFICE_TIERS.findIndex((t) => t.id === id);
  return idx >= 0 ? idx : 0;
}

/**
 * Cumulative cash required to own `tierId` (sum of prices from studio up through that tier).
 * @param {string} [tierId]
 * @returns {number}
 */
export function getCumulativeOfficeSpend(tierId) {
  const idx = getOfficeTierIndex(tierId);
  let sum = 0;
  for (let i = 1; i <= idx; i++) sum += OFFICE_TIERS[i].price;
  return sum;
}

/**
 * Highest purchased office tier (visual source of truth).
 * @param {{ officeTierId?: string }} [state]
 * @returns {OfficeTier}
 */
export function getEffectiveOfficeTier(state = {}) {
  return getOfficeTier(state.officeTierId || DEFAULT_OFFICE_TIER_ID);
}

/** License tier gating an office stage (legacy minRep mapped to license). */
export function officeTierLicense(tier) {
  return requiredLicenseForRep(tier?.minRep);
}

/**
 * Soft eligibility from NW + license (gates the next purchase; does not drive visuals).
 * @param {number} netWorth
 * @param {string[]} [licenses]
 */
export function getEligibleOfficeTier(netWorth = 0, licenses = ['retail']) {
  const nw = Math.max(0, Number(netWorth) || 0);
  let current = OFFICE_TIERS[0];
  for (const stage of OFFICE_TIERS) {
    if (nw >= stage.minNet && hasLicense(licenses, officeTierLicense(stage).id)) current = stage;
  }
  const idx = OFFICE_TIERS.findIndex((s) => s.id === current.id);
  const next = idx >= 0 && idx < OFFICE_TIERS.length - 1 ? OFFICE_TIERS[idx + 1] : null;
  return { current, next, index: Math.max(0, idx) };
}

/**
 * Next ladder step after the purchased tier (ordered one-step upgrades).
 * @param {{ officeTierId?: string }} [state]
 * @returns {OfficeTier | null}
 */
export function getNextOfficeUpgrade(state = {}) {
  const idx = getOfficeTierIndex(state.officeTierId || DEFAULT_OFFICE_TIER_ID);
  return idx < OFFICE_TIERS.length - 1 ? OFFICE_TIERS[idx + 1] : null;
}

/**
 * @param {{ portfolio?: object, officeTierId?: string, officeSpentTotal?: number }} state
 * @param {{ netWorth?: number, licenses?: string[] }} [opts]
 */
export function canPurchaseOfficeUpgrade(state, opts = {}) {
  const next = getNextOfficeUpgrade(state);
  if (!next) return { ok: false, reason: 'Peak office already owned', code: 'max' };

  const nw = Math.max(0, Number(opts.netWorth) || 0);
  if (nw < next.minNet) {
    return { ok: false, reason: `Requires ${next.minNet.toLocaleString()} Net Worth`, code: 'net' };
  }
  const licNeed = officeTierLicense(next);
  if (!hasLicense(opts.licenses, licNeed.id)) {
    return { ok: false, reason: `Requires the ${licNeed.name} license`, code: 'license' };
  }

  const cash = getSpendableCash(state.portfolio || { cash: 0 });
  if (cash < next.price) {
    return { ok: false, reason: 'Insufficient cash', code: 'cash' };
  }
  return { ok: true, next };
}

/**
 * Buy the next office tier. Cosmetic cash sink only.
 * @param {{ portfolio: { cash: number }, officeTierId?: string, officeSpentTotal?: number }} state
 * @param {{ netWorth?: number, licenses?: string[] }} [opts]
 */
export function purchaseOfficeUpgrade(state, opts = {}) {
  const gate = canPurchaseOfficeUpgrade(state, opts);
  if (!gate.ok) return { ok: false, msg: gate.reason, code: gate.code };
  const next = gate.next;
  state.portfolio.cash -= next.price;
  state.officeTierId = next.id;
  state.officeSpentTotal = Math.max(0, Number(state.officeSpentTotal) || 0) + next.price;
  return { ok: true, tier: next, spent: next.price };
}

/**
 * Clamp officeTierId to what officeSpentTotal can justify (save-edit hardening).
 * @param {{ officeTierId?: string, officeSpentTotal?: number }} raw
 * @returns {{ officeTierId: string, officeSpentTotal: number }}
 */
export function sanitizeOfficeProgress(raw = {}) {
  const MAX_CASH = 1e12;
  let spent = Number(raw.officeSpentTotal);
  if (!Number.isFinite(spent) || spent < 0) spent = 0;
  spent = Math.min(MAX_CASH, spent);

  let id = typeof raw.officeTierId === 'string' ? raw.officeTierId : DEFAULT_OFFICE_TIER_ID;
  if (!KNOWN_OFFICE_TIER_IDS.has(id)) id = DEFAULT_OFFICE_TIER_ID;

  // Walk down until spend covers cumulative cost (forging a high tier without ledger fails).
  let idx = getOfficeTierIndex(id);
  while (idx > 0 && getCumulativeOfficeSpend(OFFICE_TIERS[idx].id) > spent + 0.001) {
    idx -= 1;
  }
  return { officeTierId: OFFICE_TIERS[idx].id, officeSpentTotal: spent };
}
