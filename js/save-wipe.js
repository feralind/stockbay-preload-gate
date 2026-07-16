// @ts-check
/**
 * Desk reset / wipe helpers.
 *
 * Reset used to clear `stockway_save_v1` then reload — but rotating `_slot`
 * recovery, a late autosave, or another open tab could rewrite the old run
 * before the fresh boot stuck. A short-lived wipe flag blocks that.
 */
import { CONFIG } from './config.js';

export const DESK_WIPE_FLAG_KEY = 'stockway_desk_wipe_v1';
export const DESK_WIPE_SESSION_KEY = 'stockway_desk_wipe_session';

/** Primary run keys that must not survive Archive & reset. */
export function runSaveKeys(saveKey = CONFIG.SAVE_KEY) {
  return [saveKey, `${saveKey}__tmp`, `${saveKey}_slot`];
}

export function markDeskWipe(storage = localStorage, session = sessionStorage) {
  const token = String(Date.now());
  try { storage.setItem(DESK_WIPE_FLAG_KEY, token); } catch (_) { /* ignore */ }
  try { session?.setItem?.(DESK_WIPE_SESSION_KEY, token); } catch (_) { /* ignore */ }
  return token;
}

export function isDeskWipePending(storage = localStorage, session = sessionStorage) {
  try {
    if (session?.getItem?.(DESK_WIPE_SESSION_KEY)) return true;
  } catch (_) { /* ignore */ }
  try {
    if (storage.getItem(DESK_WIPE_FLAG_KEY)) return true;
  } catch (_) { /* ignore */ }
  return false;
}

/**
 * True when another tab wiped the desk (persistent flag, no session flag here).
 * This tab must not flush its in-memory run back over the wipe.
 */
export function shouldBlockSaveAfterForeignWipe(storage = localStorage, session = sessionStorage) {
  try {
    const persist = storage.getItem(DESK_WIPE_FLAG_KEY);
    if (!persist) return false;
    const mine = session?.getItem?.(DESK_WIPE_SESSION_KEY);
    return !mine;
  } catch (_) {
    return false;
  }
}

export function clearDeskWipeFlags(storage = localStorage, session = sessionStorage) {
  try { storage.removeItem(DESK_WIPE_FLAG_KEY); } catch (_) { /* ignore */ }
  try { session?.removeItem?.(DESK_WIPE_SESSION_KEY); } catch (_) { /* ignore */ }
}

export function wipeRunSaveKeys({
  storage = localStorage,
  saveKey = CONFIG.SAVE_KEY,
  also = [],
} = {}) {
  const keys = [...runSaveKeys(saveKey), ...also];
  for (const k of keys) {
    try { storage.removeItem(k); } catch (_) { /* ignore */ }
  }
  return keys;
}

/**
 * Boot-time: if wipe was requested, re-clear run keys and skip load / slot recovery.
 * Flags stay until the fresh Day-1 save is written (see clear after first flush).
 */
export function consumeDeskWipeOnBoot({
  storage = localStorage,
  session = sessionStorage,
  saveKey = CONFIG.SAVE_KEY,
  extraKeys = ['stockway_alert_history_v1'],
} = {}) {
  if (!isDeskWipePending(storage, session)) return false;
  wipeRunSaveKeys({ storage, saveKey, also: extraKeys });
  return true;
}
