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
 * @param {object} state
 * @param {number} [baseMinutes]
 */
export function getDeskMarginGraceMinutes(state, baseMinutes = MARGIN_CALL_GRACE_MINUTES) {
  let grace = getRelicMarginGraceMinutes(getEquippedRelicIds(state), baseMinutes);
  if (state?.perks?.includes('primeBroker')) grace += 8;
  grace += getEstateGraceBonus(state);
  return grace;
}
