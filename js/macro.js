// @ts-check
/**
 * Persistent macro regime — Fed funds + 10Y yield.
 * Drives fed event shock scale (events.js) and bank APR quotes (finance.js).
 */

export const MACRO_BASE_FED = 4.5;
export const MACRO_BASE_10Y = 4.2;
export const FED_STEP = 0.25;

let fedFundsRate = MACRO_BASE_FED;
let yield10Y = MACRO_BASE_10Y;

export function getFedFundsRate() {
  return fedFundsRate;
}

export function getYield10Y() {
  return yield10Y;
}

export function getMacroStance() {
  if (fedFundsRate >= 5.25) return 'hawkish';
  if (fedFundsRate <= 3.75) return 'dovish';
  return 'neutral';
}

export function getMacroState() {
  return {
    fedFundsRate,
    yield10Y,
    stance: getMacroStance(),
  };
}

/** Apply a discrete FOMC move. */
export function applyFedPolicy(direction) {
  if (direction === 'hike') {
    fedFundsRate = Math.min(8, +(fedFundsRate + FED_STEP).toFixed(2));
    yield10Y = Math.min(8.5, +(yield10Y + FED_STEP * 0.7).toFixed(2));
  } else if (direction === 'cut') {
    fedFundsRate = Math.max(0.25, +(fedFundsRate - FED_STEP).toFixed(2));
    yield10Y = Math.max(0.5, +(yield10Y - FED_STEP * 0.65).toFixed(2));
  }
  return getMacroState();
}

/** Slow mean-reversion toward baseline (call on new game day). */
export function stepMacroTowardNeutral(strength = 0.03) {
  const s = Math.max(0, Math.min(1, Number(strength) || 0));
  fedFundsRate = +(fedFundsRate + (MACRO_BASE_FED - fedFundsRate) * s).toFixed(4);
  yield10Y = +(yield10Y + (MACRO_BASE_10Y - yield10Y) * s).toFixed(4);
  return getMacroState();
}

/**
 * Equity shock multiplier for fed_hike / fed_cut templates.
 * Moves that push further into an extreme regime hit harder.
 */
export function fedShockMultiplier(templateId) {
  const id = String(templateId || '');
  if (id === 'fed_hike') {
    return +(0.85 + Math.min(0.55, Math.max(0, fedFundsRate - MACRO_BASE_FED) * 0.14)).toFixed(3);
  }
  if (id === 'fed_cut') {
    return +(0.85 + Math.min(0.55, Math.max(0, MACRO_BASE_FED - fedFundsRate) * 0.14)).toFixed(3);
  }
  return 1;
}

/**
 * Shared magnitude scale for scripted events.
 * Fed hike/cut: directional distance (existing). Housing/dollar: absolute distance from 4.5%.
 * Macro-blind templates return 1.
 */
export function macroEventScale(templateId, macroScale = false) {
  const id = String(templateId || '');
  if (id === 'fed_hike' || id === 'fed_cut') return fedShockMultiplier(id);
  if (macroScale) {
    const dist = Math.abs(fedFundsRate - MACRO_BASE_FED);
    return +(0.85 + Math.min(0.55, dist * 0.14)).toFixed(3);
  }
  return 1;
}

/** APR add-on in percentage points vs policy baseline. */
export function macroAprAdjustment() {
  return Math.round((fedFundsRate - MACRO_BASE_FED) * 0.65 * 100) / 100;
}

export function serializeMacro() {
  return { fedFundsRate, yield10Y };
}

export function loadMacro(data) {
  if (!data || typeof data !== 'object') {
    fedFundsRate = MACRO_BASE_FED;
    yield10Y = MACRO_BASE_10Y;
    return getMacroState();
  }
  const fed = Number(data.fedFundsRate);
  const y = Number(data.yield10Y);
  fedFundsRate = Number.isFinite(fed) ? Math.max(0.25, Math.min(8, fed)) : MACRO_BASE_FED;
  yield10Y = Number.isFinite(y) ? Math.max(0.5, Math.min(8.5, y)) : MACRO_BASE_10Y;
  return getMacroState();
}

export function resetMacroForTests(fed = MACRO_BASE_FED, y10 = MACRO_BASE_10Y) {
  fedFundsRate = fed;
  yield10Y = y10;
}

/** Fresh-desk reset — back to baseline policy rates. */
export function resetMacro() {
  return resetMacroForTests(MACRO_BASE_FED, MACRO_BASE_10Y);
}
