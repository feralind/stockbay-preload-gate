// @ts-check
/**
 * Desk trade composition — relic + perk stacking for fills and margin grace.
 * Order matters: relic effects apply first, then perk adjustments.
 */
import { applySlippage } from './slippage.js';
import { MARGIN_CALL_GRACE_MINUTES } from './margin-call.js';
import {
  applyRelicSlippageEffect,
  getEquippedRelicIds,
  getRelicMarginGraceMinutes,
} from './relics.js';
import { getEstateGraceBonus } from './estates.js';

/**
 * Volume slip → relic shrink → smartRouting (~35% less adverse vs mid).
 * @param {object} state
 * @param {object} args — same shape as applySlippage(...)
 */
export function applyRelicAwareSlippage(state, args) {
  let slip = applySlippage(args);
  slip = applyRelicSlippageEffect(slip, {
    quotePrice: args?.quotePrice,
    equippedRelics: getEquippedRelicIds(state),
  });
  // Smart Routing perk: ~35% less adverse fill vs mid (stacks after relic shrink).
  if (state?.perks?.includes('smartRouting')) {
    const mid = Number(args?.quotePrice);
    const fill = Number(slip?.fillPrice);
    if (mid > 0 && fill > 0) {
      const delta = fill - mid;
      slip = {
        ...slip,
        fillPrice: Math.max(0.01, +(mid + delta * 0.65).toFixed(4)),
        smartRouting: true,
      };
    }
  }
  return slip;
}

/**
 * Relic grace bonus first, then primeBroker +8, then estate resilience.
 * Quiet Poor-credit friction: when the weaker of personal/business credit is
 * below Fair (580), shave 5 minutes — no new toasts.
 * @param {object} state
 * @param {number} [baseMinutes]
 */
export function getDeskMarginGraceMinutes(state, baseMinutes = MARGIN_CALL_GRACE_MINUTES) {
  let grace = getRelicMarginGraceMinutes(getEquippedRelicIds(state), baseMinutes);
  if (state?.perks?.includes('primeBroker')) grace += 8;
  grace += getEstateGraceBonus(state);

  const finance = state?.finance;
  if (finance && typeof finance === 'object') {
    const pc = Number(finance.personalCredit);
    const bc = Number(finance.businessCredit);
    const worst = Math.min(
      Number.isFinite(pc) ? pc : 850,
      Number.isFinite(bc) ? bc : 850,
    );
    if (worst < 580) grace = Math.max(8, grace - 5);
  }
  return grace;
}

/**
 * Quiet margin buying-power multiplier from personal credit (Series 7 spine).
 * Good+ keeps classic 2×; Fair haircuts; Poor removes leverage.
 * @param {number} [personalCredit]
 * @returns {number}
 */
export function marginBuyingPowerMultiplier(personalCredit) {
  const score = Number(personalCredit);
  // Missing score → Good band (preserve classic 2× for callers/tests that omit finance).
  if (!Number.isFinite(score)) return 2;
  if (score >= 670) return 2;
  if (score >= 580) return 1.5;
  return 1;
}

/** Poor personal credit open-risk scale (Fair+ stays 1.0). */
export const POOR_OPEN_RISK_SCALE = 0.7;

/**
 * Quiet open-risk scale on deployable desk capital.
 * Fair+ (and missing score) → 1.0; Poor (&lt;580) → 0.70.
 * Stacks with marginBuyingPowerMultiplier — Poor Margin is 1.0× × 0.70, not leverage.
 * @param {number} [personalCredit]
 * @returns {number}
 */
export function personalCreditOpenScale(personalCredit) {
  const score = Number(personalCredit);
  if (!Number.isFinite(score)) return 1;
  if (score < 580) return POOR_OPEN_RISK_SCALE;
  return 1;
}
