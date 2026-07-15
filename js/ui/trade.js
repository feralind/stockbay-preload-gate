// @ts-check
/**
 * Trade view, ticket preview, and trade modal UI — extracted from ui.js (Phase 2).
 */

import {
  fillMissingQuotes, getCachedQuote, ensureLiveQuoteForDisplay, isLiveAnchoredQuote,
  isSimulationMode,
} from '../api.js';
import { CONFIG } from '../config.js';
import { estimateInsiderFairValue } from '../events.js';
import { logoMarkHtml } from '../logos.js';
import { getHaltInfo } from '../market.js';
import { showAlert } from '../notify.js';
import { trapFocus } from '../overlays.js';
import {
  getBuyingPower, getEquity, generateOptionChain, optionGreeks,
  isBuySuspended, clearExpiredBuySuspend,
} from '../portfolio.js';
import { getSymbolMeta } from '../symbols.js';
import { getSelectedSym } from './selection.js';
import { fmt, fmtPnL, quoteForDisplay, setText } from './shared.js';

let selectedListing = null;
let pendingOrder = null;
const lastRenderedPrices = new Map();
/** One-shot timer to re-enable open controls when cool-down ends (no countdown DOM). */
let buySuspendClearTimer = null;

const BUY_SUSPEND_TITLE = 'Trading Desk Suspended: 30s cool-down from risk management';
const BUY_OPEN_CONTROL_IDS = [
  'btn-buy-long', 'btn-short', 'btn-options',
  'btn-quick-long', 'btn-quick-short',
];

/**
 * In-place disable of open-side controls while buySuspendUntilMs is active.
 * No millisecond countdown in the DOM (avoids tick thrash).
 * @param {object} state
 */
export function patchBuySuspendControls(state) {
  clearExpiredBuySuspend(state?.portfolio);
  const suspended = isBuySuspended(state?.portfolio);
  for (const id of BUY_OPEN_CONTROL_IDS) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.disabled = suspended;
    if (suspended) el.title = BUY_SUSPEND_TITLE;
    else if (el.title === BUY_SUSPEND_TITLE) el.title = '';
  }
  if (buySuspendClearTimer) {
    clearTimeout(buySuspendClearTimer);
    buySuspendClearTimer = null;
  }
  if (suspended) {
    const until = Number(state.portfolio.buySuspendUntilMs);
    const remain = Math.max(50, until - Date.now());
    buySuspendClearTimer = setTimeout(() => {
      buySuspendClearTimer = null;
      clearExpiredBuySuspend(state.portfolio);
      patchBuySuspendControls(state);
    }, remain);
  }
}

/**
 * Chart honesty pill — tape is simulated after boot; "live-seeded" means baselines
 * came from a real quote fetch, not tick-by-tick brokerage streaming.
 * @param {object|null|undefined} q
 * @returns {{ cls: string, text: string }}
 */
export function tapeHonestyLabel(q) {
  const sim = isSimulationMode() || !!(q && q.simulated);
  if (!sim) {
    // Pre-boot / rare cold path only
    return { cls: 'on', text: 'Quote baselines' };
  }
  if (isLiveAnchoredQuote(q)) {
    return { cls: 'sim', text: 'Simulated tape · live-seeded' };
  }
  const src = String(q?.source || '');
  if (src === 'seed' || !q) {
    return { cls: 'sim', text: 'Simulated tape · seed' };
  }
  return { cls: 'sim', text: 'Simulated tape · cached' };
}
export function renderTradePanel(state) {
  const selectedSym = getSelectedSym();
  fillMissingQuotes([selectedSym]);
  const q = quoteForDisplay(selectedSym);
  const meta = getSymbolMeta(selectedSym);
  setText('chart-symbol', selectedSym);
  setText('chart-name', meta.name);

  const mark = document.getElementById('chart-mark');
  if (mark) {
    const sameMark = mark.dataset.sym === selectedSym && mark.id === 'chart-mark';
    if (!sameMark) {
      mark.outerHTML = logoMarkHtml(selectedSym, {
        color: meta.color,
        letter: meta.letter,
        size: 'lg',
        id: 'chart-mark',
      });
    }
  }

  const tags = document.getElementById('chart-tags');
  if (tags) {
    tags.innerHTML = meta.tags.map(t => `<span class="pill-tag">${t}</span>`).join('');
  }

  const metaRow = document.getElementById('chart-meta-row');
  if (metaRow) {
    const honesty = tapeHonestyLabel(q);
    const chips = meta.indices.filter(i => i !== meta.exchange && i !== 'ETF');
    const halt = getHaltInfo(selectedSym);
    metaRow.innerHTML = `
      <span class="live-pill ${honesty.cls}" title="Desk clock drives prices after baselines load — not a live brokerage feed"><span class="live-dot"></span>${honesty.text}</span>
      <span class="meta-strong">${meta.exchange}</span>
      ${halt ? `<span class="meta-chip halt-chip" data-gloss="trading-halted" data-gloss-sym="${selectedSym}">TRADING HALTED</span>` : ''}
      ${chips.map(i => `<span class="meta-chip">${i}</span>`).join('')}
    `;
  }

  if (!q) {
    setText('chart-price', 'Loading…');
    return;
  }
  const priceEl = document.getElementById('chart-price');
  if (priceEl) {
    const prev = lastRenderedPrices.get(selectedSym);
    priceEl.textContent = `$${q.price.toFixed(2)}`;
    if (prev != null && Math.abs(prev - q.price) > 0.001) {
      priceEl.classList.remove('price-pulse');
      void priceEl.offsetWidth;
      priceEl.classList.add('price-pulse');
    }
    lastRenderedPrices.set(selectedSym, q.price);
  }
  const chg = document.getElementById('chart-change');
  if (chg) {
    const abs = q.change != null ? q.change : (q.price * (q.changePct || 0) / 100);
    chg.textContent = `${abs >= 0 ? '+' : ''}${abs.toFixed(2)} · ${q.changePct >= 0 ? '+' : ''}${(q.changePct || 0).toFixed(2)}% today`;
    chg.className = `price-change ${q.changePct >= 0 ? 'up' : 'down'}`;
  }
  renderPositionSummary(state);
  renderRecentTradesStrip(state);
  updateTradeEstValue(q.price);
  patchBuySuspendControls(state);
  const sl = document.getElementById('stop-loss');
  const tp = document.getElementById('take-profit');
  const pos = state.portfolio.longs[selectedSym] || state.portfolio.shorts[selectedSym];
  if (sl) sl.value = pos?.stopLoss || '';
  if (tp) tp.value = pos?.takeProfit || '';
}

/** Presentation-only notional preview for the trade ticket. */
export function updateTradeEstValue(priceOverride) {
  const el = document.getElementById('trade-est-value');
  if (!el) return;
  const shares = Math.max(1, parseInt(document.getElementById('quick-shares')?.value, 10) || 1);
  let px = Number(priceOverride);
  if (!Number.isFinite(px) || px <= 0) {
    const ot = document.getElementById('order-type')?.value;
    const limit = parseFloat(document.getElementById('limit-price')?.value);
    if (ot === 'limit' && Number.isFinite(limit) && limit > 0) px = limit;
    else {
      const q = quoteForDisplay(getSelectedSym());
      px = q?.price || 0;
    }
  }
  el.textContent = px > 0 ? `$${(shares * px).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00';
}

export function renderPositionSummary(state) {
  const el = document.getElementById('position-summary');
  if (!el) return;
  const selectedSym = getSelectedSym();
  const long = state.portfolio.longs[selectedSym];
  const short = state.portfolio.shorts[selectedSym];
  if (long) {
    el.innerHTML = `You are long <strong>${long.shares}</strong> @ <strong>$${long.avgPrice.toFixed(2)}</strong>${riskText(long)}`;
  } else if (short) {
    el.innerHTML = `You are short <strong>${short.shares}</strong> @ <strong>$${short.avgPrice.toFixed(2)}</strong>${riskText(short)}`;
  } else {
    el.textContent = 'No open position in this symbol.';
  }
}

export function riskText(pos) {
  const bits = [];
  if (pos.stopLoss) bits.push(`SL $${Number(pos.stopLoss).toFixed(2)}`);
  if (pos.takeProfit) bits.push(`TP $${Number(pos.takeProfit).toFixed(2)}`);
  return bits.length ? ` · ${bits.join(' · ')}` : '';
}

export function renderRecentTradesStrip(state) {
  const el = document.getElementById('recent-trades-strip');
  if (!el) return;
  const selectedSym = getSelectedSym();
  const trades = (state.portfolio.history || []).filter(t => t.sym === selectedSym).slice(0, 5);
  el.innerHTML = trades.length
    ? `<span class="strip-label">Recent ${selectedSym}</span>${trades.map(t => `<span class="trade-chip ${t.pnl >= 0 ? 'up' : t.pnl < 0 ? 'down' : ''}">${t.action} ${t.shares || t.qty || ''} @ $${Number(t.price || 0).toFixed(2)}${t.pnl != null ? ` · ${fmtPnL(t.pnl)}` : ''}</span>`).join('')}`
    : `<span class="strip-label">Recent ${selectedSym}</span><span class="trade-chip">No trades yet</span>`;
}

export function renderPendingOrders(state) {
  const el = document.getElementById('pending-orders');
  if (!el) return;
  const orders = state.portfolio?.pendingOrders || [];
  const tickets = (state.portfolio?.orderTickets || []).filter((ticket) => ticket.status !== 'open').slice(0, 8);
  if (!orders.length && !tickets.length) {
    el.innerHTML = '<div class="empty">No working limit orders</div>';
    return;
  }
  const openHtml = orders.map((o) => `
    <div class="pending-order-row" data-id="${o.id}">
      <div class="pending-order-main">
        <strong>${o.side.toUpperCase()}</strong> ${o.sym} ×${o.shares}
        <span class="muted-text">limit $${Number(o.limitPrice).toFixed(2)}</span>
        <span class="pill-tag">open</span>
      </div>
      <button type="button" class="btn btn-tiny pending-cancel" data-id="${o.id}">Cancel</button>
    </div>
  `).join('');
  const histHtml = tickets.map((t) => `
    <div class="pending-order-row ticket-${t.status || 'done'}">
      <div class="pending-order-main">
        <strong>${String(t.side || '').toUpperCase()}</strong> ${t.sym} ×${t.shares}
        <span class="muted-text">${t.status === 'filled'
          ? `filled @ $${Number(t.fillPrice || t.limitPrice || 0).toFixed(2)}`
          : `cancelled · limit $${Number(t.limitPrice || 0).toFixed(2)}`}</span>
        <span class="pill-tag">${t.status}</span>
      </div>
    </div>
  `).join('');
  el.innerHTML = openHtml + (tickets.length ? `<div class="muted-text" style="margin:6px 0 4px">Recent tickets</div>${histHtml}` : '');
  el.querySelectorAll('.pending-cancel').forEach((btn) => {
    btn.onclick = () => state.onCancelPendingOrder?.(btn.dataset.id);
  });
}

export function openOrderConfirm(draft, state) {
  const px = Number(draft?.price);
  if (!Number.isFinite(px) || px <= 0) {
    showAlert('Missing or invalid price for this order.', { title: 'Trade', label: 'TRADE' });
    return;
  }
  const limits = orderShareLimits(draft, state);
  const shares = clampOrderShares(draft.shares, limits.min, limits.max);
  pendingOrder = { ...draft, price: px, shares, maxShares: limits.max, minShares: limits.min };
  const overlay = document.getElementById('order-confirm-overlay');
  if (!overlay) return;
  const title = document.getElementById('order-confirm-title');
  const sub = document.getElementById('order-confirm-sub');
  const sharesInput = document.getElementById('order-confirm-shares');
  const submit = document.getElementById('order-confirm-submit');
  const minusBtn = document.getElementById('order-shares-minus');
  const plusBtn = document.getElementById('order-shares-plus');

  if (title) title.textContent = `${orderVerb(pendingOrder)} ${pendingOrder.sym}`;
  if (sub) {
    const ot = String(pendingOrder.orderType || 'market').toLowerCase();
    sub.textContent = ot === 'limit'
      ? `Limit order — rests until price is marketable at $${px.toFixed(2)}`
      : `${pendingOrder.orderType || 'Market'} order preview at $${px.toFixed(2)}`;
  }
  if (sharesInput) {
    sharesInput.min = String(limits.min);
    sharesInput.max = String(limits.max);
    sharesInput.step = '1';
    sharesInput.value = String(pendingOrder.shares);
  }
  if (submit) submit.textContent = '';

  const applyShares = (raw) => {
    pendingOrder.shares = clampOrderShares(raw, pendingOrder.minShares, pendingOrder.maxShares);
    if (sharesInput) sharesInput.value = String(pendingOrder.shares);
    renderOrderConfirm(state);
  };

  renderOrderConfirm(state);
  overlay.classList.remove('hidden');
  trapFocus(overlay);

  if (sharesInput) {
    sharesInput.oninput = () => applyShares(sharesInput.value);
    sharesInput.onchange = () => applyShares(sharesInput.value);
  }
  if (minusBtn) {
    minusBtn.onclick = () => applyShares(pendingOrder.shares - 1);
  }
  if (plusBtn) {
    plusBtn.onclick = () => applyShares(pendingOrder.shares + 1);
  }
  document.getElementById('order-confirm-close').onclick = closeOrderConfirm;
  document.getElementById('order-confirm-cancel').onclick = closeOrderConfirm;
  document.getElementById('order-confirm-submit').onclick = () => {
    pendingOrder.shares = clampOrderShares(
      pendingOrder.shares,
      pendingOrder.minShares,
      pendingOrder.maxShares,
    );
    const finalOrder = { ...pendingOrder };
    closeOrderConfirm();
    void state.onConfirmOrder?.(finalOrder);
  };
}

/** Min/max whole shares allowed in the order preview stepper. */
export function orderShareLimits(order, state) {
  const min = 1;
  const sym = String(order?.sym || '').toUpperCase();
  const px = Number(order?.price) || 0;
  if (order?.action === 'sell') {
    const owned = Math.floor(Number(state.portfolio?.longs?.[sym]?.shares) || 0);
    return { min: owned > 0 ? 1 : 0, max: Math.max(0, owned) };
  }
  if (order?.action === 'cover') {
    const owned = Math.floor(Number(state.portfolio?.shorts?.[sym]?.shares) || 0);
    return { min: owned > 0 ? 1 : 0, max: Math.max(0, owned) };
  }
  if (order?.action === 'long' && px > 0) {
    const bp = getBuyingPower(state.portfolio, state.perks, state.finance?.personalCredit);
    return { min, max: Math.max(1, Math.floor(bp / px)) };
  }
  if (order?.action === 'short' && px > 0) {
    const bp = getBuyingPower(state.portfolio, state.perks, state.finance?.personalCredit);
    const marginPer = px * CONFIG.MARGIN_REQUIREMENT;
    return { min, max: Math.max(1, Math.floor(bp / Math.max(marginPer, 1e-9))) };
  }
  return { min, max: 1_000_000 };
}

export function clampOrderShares(shares, min, max) {
  const lo = Math.max(0, Math.floor(Number(min) || 0));
  const hi = Math.max(lo, Math.floor(Number(max) || 0));
  const n = Math.floor(Number(shares));
  if (!Number.isFinite(n)) return lo > 0 ? lo : Math.min(1, hi);
  return Math.min(hi, Math.max(lo, n));
}

export function renderOrderConfirm(state) {
  if (!pendingOrder) return;
  const grid = document.getElementById('order-confirm-grid');
  const note = document.getElementById('order-confirm-note');
  const submit = document.getElementById('order-confirm-submit');
  const sharesInput = document.getElementById('order-confirm-shares');
  const minusBtn = document.getElementById('order-shares-minus');
  const plusBtn = document.getElementById('order-shares-plus');
  const min = pendingOrder.minShares ?? 1;
  const max = pendingOrder.maxShares ?? 1_000_000;
  pendingOrder.shares = clampOrderShares(pendingOrder.shares, min, max);
  if (sharesInput) {
    sharesInput.min = String(min);
    sharesInput.max = String(max);
    sharesInput.value = String(pendingOrder.shares);
  }
  if (minusBtn) minusBtn.disabled = pendingOrder.shares <= min;
  if (plusBtn) plusBtn.disabled = pendingOrder.shares >= max;

  const cost = pendingOrder.shares * pendingOrder.price;
  const equity = Math.max(1, getEquity(state.portfolio));
  const buyingPower = getBuyingPower(state.portfolio, state.perks, state.finance?.personalCredit);
  const cashAfter = state.portfolio.cash + cashDeltaForOrder(pendingOrder, cost);
  const riskPerShare = pendingOrder.stopLoss
    ? Math.abs(pendingOrder.price - pendingOrder.stopLoss)
    : pendingOrder.price;
  const riskPct = ((riskPerShare * pendingOrder.shares) / equity) * 100;

  if (grid) {
    grid.innerHTML = `
      <div class="modal-row"><span>Estimated cost / notional</span><span>${fmt(cost)}</span></div>
      <div class="modal-row"><span>Available Buying Power</span><span>${fmt(buyingPower)} → ${fmt(Math.max(0, buyingPower + cashDeltaForOrder(pendingOrder, cost)))}</span></div>
      <div class="modal-row"><span>Cash impact</span><span class="${cashAfter >= 0 ? '' : 'down'}">${fmt(state.portfolio.cash)} → ${fmt(cashAfter)}</span></div>
      <div class="modal-row"><span>Risk of equity</span><span>${riskPct.toFixed(1)}%</span></div>
      ${pendingOrder.action === 'sell' || pendingOrder.action === 'cover'
        ? `<div class="modal-row"><span>Position size</span><span>${pendingOrder.shares} / ${max} shares</span></div>`
        : ''}
      ${pendingOrder.stopLoss ? `<div class="modal-row"><span>Stop loss</span><span>$${Number(pendingOrder.stopLoss).toFixed(2)}</span></div>` : ''}
      ${pendingOrder.takeProfit ? `<div class="modal-row"><span>Take profit</span><span>$${Number(pendingOrder.takeProfit).toFixed(2)}</span></div>` : ''}
    `;
  }
  if (note) {
    const ot = String(pendingOrder.orderType || '').toLowerCase();
    if (ot === 'limit') {
      note.textContent = pendingOrder.action === 'long' || pendingOrder.action === 'cover'
        ? `Limit buys/covers fill when the market trades at or below $${Number(pendingOrder.price).toFixed(2)}. Cancel anytime from Pending orders.`
        : `Limit sells/shorts fill when the market trades at or above $${Number(pendingOrder.price).toFixed(2)}. Cancel anytime from Pending orders.`;
    } else if (pendingOrder.action === 'sell' || pendingOrder.action === 'cover') {
      note.textContent = `You can close between ${min} and ${max} shares of this position.`;
    } else {
      note.textContent = pendingOrder.action === 'short'
        ? `Margin note: shorts lock ${Math.round(CONFIG.MARGIN_REQUIREMENT * 100)}% margin. Proceeds are not spendable cash. This trade risks ${riskPct.toFixed(1)}% of equity by your stop/default risk.`
        : `This trade risks ${riskPct.toFixed(1)}% of equity.`;
    }
  }
  if (submit) {
    submit.disabled = pendingOrder.shares < 1 || pendingOrder.shares > max;
    submit.textContent = `Confirm: This will ${pendingOrder.action === 'sell' || pendingOrder.action === 'cover' ? 'close' : 'cost'} ${fmt(cost)}`;
  }
}

export function cashDeltaForOrder(order, cost) {
  if (order.action === 'long') return -cost;
  // Shorts only lock margin — no cash credit from proceeds
  if (order.action === 'short') return -(cost * CONFIG.MARGIN_REQUIREMENT);
  if (order.action === 'sell') return cost;
  if (order.action === 'cover') {
    // Approximate: release margin + settle vs avg unknown here → show margin release estimate
    return cost * CONFIG.MARGIN_REQUIREMENT;
  }
  return 0;
}

export function orderVerb(order) {
  if (order.action === 'long') return 'Buy Long';
  if (order.action === 'short') return 'Short';
  if (order.action === 'cover') return 'Cover';
  return 'Sell';
}

export function closeOrderConfirm() {
  document.getElementById('order-confirm-overlay')?.classList.add('hidden');
  pendingOrder = null;
}

export function openTradeModal(listing, state) {
  const modal = document.getElementById('trade-modal');
  if (!modal) return;
  selectedListing = listing;
  setText('modal-sym', listing.sym);
  setText('modal-name', listing.name);
  setText('modal-price', `$${listing.price.toFixed(2)}`);
  setText('modal-mkt', `$${listing.marketPrice.toFixed(2)}`);
  const valRow = document.getElementById('modal-value-row');
  if (state.perks.includes('insider')) {
    const est = estimateInsiderFairValue(listing);
    setText('modal-value', `$${Number(est).toFixed(2)} (insider est.)`);
    valRow?.classList.remove('hidden');
  } else {
    valRow?.classList.add('hidden');
  }
  const sharesInp = document.getElementById('modal-shares');
  if (sharesInp) sharesInp.value = 10;
  updateModalTotal(listing.price);
  modal.classList.remove('hidden');

  sharesInp.oninput = () => updateModalTotal(listing.price);
  document.getElementById('btn-buy-long').onclick = () => state.onTrade?.('long', listing);
  document.getElementById('btn-short').onclick = () => state.onTrade?.('short', listing);
  document.getElementById('btn-options').onclick = () => { void showOptionsPanel(listing, state); };
  const shortBtn = document.getElementById('btn-short');
  const optBtn = document.getElementById('btn-options');
  if (shortBtn) shortBtn.style.display = state.perks.includes('margin') ? 'block' : 'none';
  if (optBtn) optBtn.style.display = state.perks.includes('options') ? 'block' : 'none';
}

export function updateModalTotal(price) {
  const shares = parseInt(document.getElementById('modal-shares')?.value) || 0;
  setText('modal-total', fmt(shares * price));
}

export async function showOptionsPanel(listing, state) {
  const panel = document.getElementById('options-panel');
  if (!panel) return;
  selectedListing = listing;
  panel.innerHTML = '<div class="opt-chain-meta">Fetching live spot…</div>';
  panel.classList.remove('hidden');

  const resolved = await ensureLiveQuoteForDisplay(listing.sym, {
    listingFallbackPrice: listing.marketPrice,
    allowSeed: false,
    force: !isLiveAnchoredQuote(getCachedQuote(listing.sym)),
  });
  // Prefer live-anchored; only fall back to listing/seed when network can't help
  const spot = resolved.anchored
    ? resolved.price
    : (getCachedQuote(listing.sym)?.price || listing.marketPrice);
  if (!(spot > 0)) {
    panel.innerHTML = '<div class="opt-chain-meta">No spot available for options</div>';
    return;
  }
  if (!resolved.anchored) {
    panel.innerHTML = `<div class="opt-chain-meta">Waiting for live quote (showing provisional $${spot.toFixed(2)})</div>`;
  }

  const chain = generateOptionChain(listing.sym, spot);
  const hasAnalyst = state.perks?.includes('analyst');
  let lastExpiry = '';
  const anchorNote = resolved.anchored
    ? ''
    : `<div class="opt-chain-meta warn">Unanchored seed spot — premiums are provisional until live quote arrives</div>`;
  const rows = chain.map(opt => {
    let head = '';
    if (opt.expiry !== lastExpiry) {
      lastExpiry = opt.expiry;
      head = `<div class="opt-expiry-label">${opt.expiryDays}d expiry · ${opt.expiry}</div>`;
    }
    const g = hasAnalyst ? optionGreeks({
      spot, strike: opt.strike, daysToExpiry: opt.expiryDays, vol: opt.vol, type: opt.type,
    }) : null;
    const greekLine = g
      ? `<span class="opt-greeks" title="IV (implied volatility): the market’s guess of how wild the stock may move — higher IV = richer option premiums. Δ/Γ/Θ are sensitivity greeks.">Δ ${g.delta.toFixed(2)} · Γ ${g.gamma.toFixed(3)} · Θ ${g.theta.toFixed(2)} · IV ${(g.iv * 100).toFixed(0)}%</span>`
      : '';
    return `${head}<div class="opt-row" data-type="${opt.type}" data-strike="${opt.strike}" data-premium="${opt.premium.toFixed(2)}" data-expiry="${opt.expiry}" data-expirydays="${opt.expiryDays}" data-vol="${opt.vol}">
      <div class="opt-row-main">
        <span>${opt.type.toUpperCase()} $${opt.strike}</span>
        <span>$${opt.premium.toFixed(2)}</span>
        ${greekLine}
      </div>
      <button class="btn-sm buy-opt">Buy 1</button>
    </div>`;
  }).join('');
  panel.innerHTML = `${anchorNote}<div class="opt-chain-meta">${chain.length} contracts · Black-Scholes${hasAnalyst ? ' · greeks shown' : ' · unlock Analyst for greeks'}${resolved.anchored ? '' : ' · provisional'}</div>${rows}`;
  panel.classList.remove('hidden');
  panel.querySelectorAll('.buy-opt').forEach(btn => {
    btn.onclick = () => {
      const row = btn.closest('.opt-row');
      state.onBuyOption?.({
        sym: listing.sym,
        type: row.dataset.type,
        strike: parseFloat(row.dataset.strike),
        premium: parseFloat(row.dataset.premium),
        expiry: row.dataset.expiry,
        expiryDays: parseInt(row.dataset.expirydays, 10),
        vol: parseFloat(row.dataset.vol),
        qty: 1,
      });
    };
  });
}

/** Re-generate an open options chain after a seed→live quote correction. */
export function refreshOpenOptionsPanel(state) {
  const panel = document.getElementById('options-panel');
  if (!panel || panel.classList.contains('hidden')) return;
  if (!selectedListing?.sym) return;
  void showOptionsPanel(selectedListing, state);
}

export function getSelectedListing() {
  return selectedListing;
}

export function closeModal() {
  document.getElementById('trade-modal')?.classList.add('hidden');
  document.getElementById('options-panel')?.classList.add('hidden');
  selectedListing = null;
}

export function getModalShares() {
  return parseInt(document.getElementById('modal-shares')?.value) || 1;
}
