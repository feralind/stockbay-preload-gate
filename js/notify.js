// @ts-check
/** In-app notifications — never use window.alert / confirm */

import { isCoachQuietFlags } from './coach-flags.js';

let toastHost = null;
let dialogResolve = null;
/** Queued while coach quiet mode (first-trade walkthrough / portfolio tour). */
const deferredNotifications = [];

function ensureToastHost() {
  if (toastHost) return toastHost;
  toastHost = document.getElementById('toast-host');
  if (!toastHost) {
    toastHost = document.createElement('div');
    toastHost.id = 'toast-host';
    toastHost.className = 'toast-host';
    document.body.appendChild(toastHost);
  }
  toastHost.setAttribute('aria-live', 'polite');
  toastHost.setAttribute('aria-atomic', 'true');
  toastHost.setAttribute('role', 'status');
  return toastHost;
}

const MAX_VISIBLE_TOASTS = 4;

/** True during first-trade walkthrough or portfolio tour — suppress interruptive UI. */
export function isCoachQuiet() {
  return isCoachQuietFlags();
}

function emitToast(message, { type = 'info', ms = 2800 } = {}) {
  const host = ensureToastHost();
  while (host.children.length >= MAX_VISIBLE_TOASTS) {
    host.firstElementChild?.remove();
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `<span class="toast-msg">${message}</span>`;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 280);
  }, ms);
  return el;
}

/**
 * @param {string} message
 * @param {{ type?: string, ms?: number, force?: boolean }} [opts]
 * force:true bypasses coach quiet deferral (rare — prefer deferring).
 */
export function toast(message, opts = {}) {
  const { force = false, ...rest } = opts;
  if (isCoachQuiet() && !force) {
    deferredNotifications.push({ kind: 'toast', message, opts: rest });
    return null;
  }
  return emitToast(message, rest);
}

/** Drop every on-screen toast (e.g. after a full desk reset). */
export function clearToasts() {
  const host = document.getElementById('toast-host') || toastHost;
  if (!host) return;
  host.replaceChildren();
}

/** Clear deferred queue without showing (e.g. desk wipe). */
export function clearDeferredNotifications() {
  deferredNotifications.length = 0;
}

/** Flush anything deferred while coach quiet was on. Returns count flushed. */
export function flushDeferredNotifications() {
  const queue = deferredNotifications.splice(0);
  for (const item of queue) {
    if (item.kind === 'toast') {
      emitToast(item.message, item.opts || {});
    } else if (item.kind === 'alert') {
      // Fire-and-forget — walkthrough already ended
      void showAlertNow(item.message, item.opts || {});
    } else if (item.kind === 'daySummary' && typeof item.show === 'function') {
      try { item.show(); } catch (_) { /* ignore */ }
    }
  }
  return queue.length;
}

/** Test / introspection helper. */
export function getDeferredNotificationCount() {
  return deferredNotifications.length;
}

export function deferDaySummary(showFn) {
  if (typeof showFn !== 'function') return;
  deferredNotifications.push({ kind: 'daySummary', show: showFn });
}

function getDialogEls() {
  return {
    overlay: document.getElementById('app-dialog-overlay'),
    title: document.getElementById('app-dialog-title'),
    body: document.getElementById('app-dialog-body'),
    ok: document.getElementById('app-dialog-ok'),
    cancel: document.getElementById('app-dialog-cancel'),
    label: document.getElementById('app-dialog-label'),
  };
}

export function closeDialog(result) {
  const { overlay } = getDialogEls();
  overlay?.classList.add('hidden');
  overlay?.removeAttribute('aria-modal');
  const resolve = dialogResolve;
  dialogResolve = null;
  resolve?.(result);
}

export function isDialogOpen() {
  return !!dialogResolve;
}

function showAlertNow(message, { title = 'Notice', label = 'SYSTEM' } = {}) {
  return new Promise((resolve) => {
    const els = getDialogEls();
    if (!els.overlay) {
      emitToast(message, { type: 'warn' });
      resolve(true);
      return;
    }
    dialogResolve = resolve;
    els.label.textContent = label;
    els.title.textContent = title;
    els.body.innerHTML = message;
    els.cancel.classList.add('hidden');
    els.ok.textContent = 'Got it';
    els.overlay.classList.remove('hidden');
    els.overlay.setAttribute('role', 'dialog');
    els.overlay.setAttribute('aria-modal', 'true');
    els.ok.focus();
  });
}

/**
 * @param {string} message
 * @param {{ title?: string, label?: string, force?: boolean }} [opts]
 * Non-force alerts defer during coach quiet (trade errors should pass force:true).
 */
export function showAlert(message, opts = {}) {
  const { force = false, ...rest } = opts;
  if (isCoachQuiet() && !force) {
    deferredNotifications.push({ kind: 'alert', message, opts: rest });
    return Promise.resolve(true);
  }
  return showAlertNow(message, rest);
}

export function showConfirm(message, { title = 'Confirm', label = 'CONFIRM', okText = 'Confirm', cancelText = 'Cancel' } = {}) {
  return new Promise((resolve) => {
    // Confirm dialogs are user-initiated (perk buy, reset) — allow during quiet
    // so we never soft-lock; walkthrough itself does not open these.
    const els = getDialogEls();
    if (!els.overlay) {
      resolve(window.confirm(message));
      return;
    }
    dialogResolve = resolve;
    els.label.textContent = label;
    els.title.textContent = title;
    els.body.innerHTML = message;
    els.cancel.classList.remove('hidden');
    els.cancel.textContent = cancelText;
    els.ok.textContent = okText;
    els.overlay.classList.remove('hidden');
    els.overlay.setAttribute('role', 'dialog');
    els.overlay.setAttribute('aria-modal', 'true');
    els.ok.focus();
  });
}

export function bindDialogUI() {
  const els = getDialogEls();
  if (!els.overlay) return;
  els.ok.onclick = () => closeDialog(true);
  els.cancel.onclick = () => closeDialog(false);
  els.overlay.addEventListener('click', (e) => {
    if (e.target === els.overlay) closeDialog(false);
  });
  document.addEventListener('keydown', (e) => {
    if (els.overlay.classList.contains('hidden')) return;
    if (e.key === 'Escape') closeDialog(false);
    if (e.key === 'Enter' && document.activeElement?.tagName !== 'TEXTAREA') {
      e.preventDefault();
      closeDialog(true);
    }
  });
}
