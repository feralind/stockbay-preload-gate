// @ts-check

import { getCachedQuote, isPlausibleAgainstSeed, seedQuote } from '../api.js';

/** Prefer live/candle-anchored quotes; re-seed if cache still holds pre-split poison. */
export function quoteForDisplay(sym) {
  const key = String(sym || '').toUpperCase();
  const q = getCachedQuote(key);
  if (q?.price > 0 && isPlausibleAgainstSeed(key, q.price)) return q;
  return seedQuote(key);
}

export function fmtSignedMoney(n) {
  const v = Math.round(Number(n) || 0);
  if (v > 0) return `+$${v.toLocaleString()}`;
  if (v < 0) return `-$${Math.abs(v).toLocaleString()}`;
  return '$0';
}

export function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

export function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function escapeHtml(s) {
  return escapeAttr(s).replace(/'/g, '&#39;');
}

export function fmt(n) { return '$' + Math.round(Number(n) || 0).toLocaleString(); }
export function fmtPnL(n) {
  const v = Math.round(Number(n) || 0);
  if (v === 0) return '+$0';
  return (v > 0 ? '+' : '-') + '$' + Math.abs(v).toLocaleString();
}
