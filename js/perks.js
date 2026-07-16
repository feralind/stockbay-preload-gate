// @ts-check
/**
 * Perk shop purchase — gate lives in config.js; mutation lives here.
 */
import { PERKS, canPurchasePerk } from './config.js';

/**
 * Unlock a perk: debit cash, append to state.perks.
 * Pure of UI — no toast/confirm/save/render.
 * @returns {{ ok: boolean, perk?: object, msg?: string, code?: string }}
 */
export function purchasePerk(state, perkId) {
  const perk = PERKS[perkId];
  if (!perk) return { ok: false, msg: 'Unknown perk', code: 'unknown' };
  if (!state?.portfolio) return { ok: false, msg: 'Portfolio not ready.', code: 'portfolio' };
  if (!Array.isArray(state.perks)) state.perks = [];

  const gate = canPurchasePerk(perk, {
    cash: state.portfolio.cash,
    perks: state.perks,
    licenses: state.licenses,
  });
  if (!gate.ok) {
    return { ok: false, msg: gate.reason, code: gate.code || 'locked' };
  }

  state.portfolio.cash -= perk.cost;
  state.perks.push(perk.id);
  return { ok: true, perk };
}
