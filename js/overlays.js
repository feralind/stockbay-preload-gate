// @ts-check
import { closeDialog, isDialogOpen } from './notify.js';
import { closeHelp } from './help.js';
import { isLoanConfirmOpen } from './ui/finance.js';

let lastFocus = null;
let closers = {};

export function registerOverlayClosers(map) {
  closers = { ...closers, ...map };
}

export function isOverlayOpen(id) {
  const el = document.getElementById(id);
  return el && !el.classList.contains('hidden');
}

export function closeTopOverlay() {
  if (document.body.classList.contains('nav-open')) {
    closers.mobileNav?.();
    return true;
  }
  const stack = [
    { id: 'loan-confirm-overlay', isOpen: () => isLoanConfirmOpen(), close: () => closers.loanConfirm?.() },
    { id: 'app-dialog-overlay', isOpen: () => isDialogOpen(), close: () => closeDialog(false) },
    { id: 'order-confirm-overlay', close: () => closers.orderConfirm?.() },
    { id: 'trade-modal', close: () => closers.tradeModal?.() },
    { id: 'price-alert-overlay', close: () => closers.priceAlert?.() },
    { id: 'help-overlay', close: () => closeHelp() },
    { id: 'coachmark-root', close: () => closers.coachmark?.() },
    { id: 'onboard-overlay', close: () => closers.onboard?.() },
    { id: 'gm-overlay', close: () => closers.gmWelcome?.() },
    { id: 'day-summary-overlay', close: () => closers.daySummary?.() },
    { id: 'staff-history-overlay', close: () => closers.staffHistory?.() },
  ];
  for (const o of stack) {
    if (o.isOpen ? o.isOpen() : isOverlayOpen(o.id)) {
      o.close?.();
      restoreFocus();
      return true;
    }
  }
  return false;
}

export function rememberFocus() {
  lastFocus = document.activeElement;
}

export function trapFocus(overlayEl) {
  if (!overlayEl) return;
  rememberFocus();
  overlayEl.setAttribute('role', 'dialog');
  overlayEl.setAttribute('aria-modal', 'true');
  const modal = overlayEl.querySelector('.modal');
  const focusable = modal?.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  (focusable || modal)?.focus?.();
}

export function restoreFocus() {
  if (lastFocus?.focus) {
    try { lastFocus.focus(); } catch (_) {}
  }
  lastFocus = null;
}

export function bindOverlayStack() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (closeTopOverlay()) e.preventDefault();
      return;
    }
    // Enter confirms the open order ticket (skip when typing in INPUT / TEXTAREA / SELECT)
    if (e.key === 'Enter' && isOverlayOpen('order-confirm-overlay')) {
      const tag = document.activeElement?.tagName || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        // Shares input: still confirm on Enter
        if (document.activeElement?.id !== 'order-confirm-shares') return;
      }
      e.preventDefault();
      document.getElementById('order-confirm-submit')?.click();
    }
  });

  const backdropClose = [
    ['order-confirm-overlay', () => closers.orderConfirm?.()],
    ['staff-history-overlay', () => closers.staffHistory?.()],
    ['price-alert-overlay', () => closers.priceAlert?.()],
    ['trade-modal', () => closers.tradeModal?.()],
  ];
  backdropClose.forEach(([id, close]) => {
    document.getElementById(id)?.addEventListener('click', (e) => {
      if (e.target.id === id) close();
    });
  });
}
