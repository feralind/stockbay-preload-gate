// @ts-check
import {
  buyLong,
  sellLong,
  openShort,
  coverShort,
  buyOption,
  sellOption,
  estimateOptionValue,
  placeLimitOrder,
  ensurePendingOrders,
  tryFillPendingOrder,
  markOrderTicketFilled,
  cancelPendingOrder,
  markOrderTicketCancelled,
  generateOptionChain,
} from './portfolio.js';
import { updateOpenPositionMae, normalizeExitReason } from './process-wins.js';

function fallbackSlippage({ quotePrice }) {
  return { fillPrice: quotePrice };
}

function getQuotePrice(getCachedQuote, sym) {
  const q = typeof getCachedQuote === 'function' ? getCachedQuote(sym) : null;
  return q?.price;
}

/** Marketable fill with injected volume-aware slippage. */
function slippedFillPrice(sym, side, shares, mid, deps) {
  const q = typeof deps.getCachedQuote === 'function' ? deps.getCachedQuote(sym) : null;
  const quotePrice = Number(mid) || q?.price;
  const apply = typeof deps.applySlippage === 'function' ? deps.applySlippage : fallbackSlippage;
  const slip = apply({
    sym,
    side,
    shares,
    quotePrice,
    quote: q,
  });
  return slip.fillPrice;
}

function alertResult(msg, title, extra = {}) {
  return {
    ok: false,
    msg,
    alert: { title, label: 'TRADE', ...extra },
  };
}

/**
 * Execute the non-DOM order confirmation core.
 *
 * This mutates portfolio state via portfolio.js and returns UI/save/render hints
 * for app.js to apply.
 */
export function confirmOrder(state, draft, deps = {}) {
  const order = draft || {};
  const listing = order.listing || {
    sym: order.sym,
    price: order.price,
    isDeal: false,
  };
  const side = order.action;
  const orderShares = Math.max(1, Number(order.shares) || 1);
  const sym = order.sym || listing.sym;
  const resolvedPrice = Number(order.resolvedPrice);

  // Market orders always fill off the live tape at submit; listing/deal orders
  // keep the confirmed ask unless explicitly marketish.
  const isMarketish = !!listing.isMarket
    || String(order.orderType || '').toLowerCase() === 'market'
    || side === 'sell'
    || side === 'cover';
  const live = (resolvedPrice > 0 ? resolvedPrice : null)
    ?? getQuotePrice(deps.getCachedQuote, sym);
  const price = (isMarketish && live > 0)
    ? live
    : (order.price || listing.price);
  const risk = { stopLoss: order.stopLoss || null, takeProfit: order.takeProfit || null };
  const isLimit = String(order.orderType || '').toLowerCase() === 'limit';

  if (isLimit && ['long', 'short', 'sell', 'cover'].includes(side)) {
    const limitPrice = order.price || listing.price || price;
    const placed = placeLimitOrder(state.portfolio, {
      sym,
      action: side,
      shares: orderShares,
      limitPrice,
      stopLoss: risk.stopLoss,
      takeProfit: risk.takeProfit,
    }, { perks: state.perks, personalCredit: state.finance?.personalCredit });
    if (!placed.ok) {
      return {
        ...alertResult(placed.msg, 'Limit order'),
        sound: 'error',
        kind: 'limit',
      };
    }
    return {
      ok: true,
      kind: 'limit',
      order: placed.order,
      toast: {
        msg: `Limit ${side} ${sym} @ $${Number(limitPrice).toFixed(2)} working`,
        type: 'info',
      },
      closeModal: true,
      save: { immediate: true },
      render: true,
    };
  }

  if (side === 'sell') {
    const p = state.portfolio.longs[sym];
    if (!p) return alertResult(`No long position in ${sym}.`, 'No position');
    const shares = Math.min(orderShares, p.shares);
    const fillPx = slippedFillPrice(sym, 'sell', shares, price, deps);
    const exitReason = normalizeExitReason(order.exitReason);
    const result = sellLong(state.portfolio, sym, shares, fillPx, { exitReason });
    return result.ok
      ? {
        ok: true,
        kind: 'close',
        action: 'sell',
        result,
        pnl: result.pnl || 0,
        sound: 'sell',
        closeOrderConfirm: true,
        closeModal: true,
        checkAchievements: true,
        save: {},
        render: true,
        checkPerkCallouts: true,
      }
      : {
        ...alertResult(result.msg, 'Close failed', { force: true }),
        sound: 'error',
        kind: 'close',
      };
  }

  if (side === 'cover') {
    const p = state.portfolio.shorts[sym];
    if (!p) return alertResult(`No short position in ${sym}.`, 'No position');
    const shares = Math.min(orderShares, p.shares);
    const fillPx = slippedFillPrice(sym, 'cover', shares, price, deps);
    const exitReason = normalizeExitReason(order.exitReason);
    const result = coverShort(state.portfolio, sym, shares, fillPx, { exitReason });
    return result.ok
      ? {
        ok: true,
        kind: 'close',
        action: 'cover',
        result,
        pnl: result.pnl || 0,
        sound: 'cover',
        closeOrderConfirm: true,
        closeModal: true,
        checkAchievements: true,
        save: {},
        render: true,
        checkPerkCallouts: true,
      }
      : {
        ...alertResult(result.msg, 'Close failed', { force: true }),
        sound: 'error',
        kind: 'close',
      };
  }

  const fillPx = slippedFillPrice(
    listing.sym || sym,
    side === 'long' ? 'buy' : 'short',
    orderShares,
    listing.isDeal ? (order.price || listing.price) : price,
    deps,
  );
  const result = side === 'long'
    ? buyLong(state.portfolio, listing.sym, orderShares, fillPx, risk, state.perks, state.finance?.personalCredit)
    : openShort(
      state.portfolio,
      listing.sym,
      orderShares,
      fillPx,
      state.perks.includes('margin'),
      risk,
      state.finance?.personalCredit,
    );
  if (!result.ok) {
    return {
      ...alertResult(result.msg, 'Trade failed', { force: true }),
      sound: 'error',
      kind: 'open',
    };
  }

  return {
    ok: true,
    kind: 'open',
    action: side,
    result,
    isDeal: !!listing.isDeal,
    incrementShortsOpened: side === 'short',
    updateChallengeProgress: true,
    regenerateListings: true,
    closeModal: true,
    sound: side === 'long' ? 'buy' : 'sell',
    checkAchievements: true,
    save: {},
    render: true,
    checkPerkCallouts: true,
  };
}

/**
 * Resolve display/live quote prerequisites, then run confirmOrder core.
 */
export async function confirmOrderFlow(state, draft, deps = {}) {
  const order = draft || {};
  const listing = order.listing || {
    sym: order.sym,
    price: order.price,
    isDeal: false,
  };
  const sym = order.sym || listing.sym;

  const needsLive = !deps.isLiveAnchoredQuote?.(deps.getCachedQuote?.(sym));
  const resolved = await deps.ensureLiveQuoteForDisplay?.(sym, {
    listingFallbackPrice: listing.marketPrice || listing.price || order.price,
    allowSeed: true,
    force: needsLive,
  });

  return confirmOrder(state, {
    ...order,
    listing,
    resolvedPrice: resolved?.price,
  }, {
    applySlippage: deps.applySlippage,
    getCachedQuote: deps.getCachedQuote,
  });
}

/**
 * Core pending-order fill loop.
 * Mutates portfolio/order state and returns side-effect hints for app wiring.
 */
export function processPendingOrders(state, deps = {}) {
  ensurePendingOrders(state.portfolio);
  const fillFns = {
    buyLong,
    sellLong,
    openShort,
    coverShort,
    hasMargin: state.perks.includes('margin'),
    perks: state.perks,
    personalCredit: state.finance?.personalCredit,
    applySlippage: deps.applySlippage,
  };

  let anyFilled = false;
  const remaining = [];
  const toasts = [];
  const sounds = [];

  for (const order of state.portfolio.pendingOrders) {
    const attempt = tryFillPendingOrder(state.portfolio, order, fillFns);
    if (!attempt.filled) {
      remaining.push(order);
      continue;
    }

    anyFilled = true;
    markOrderTicketFilled(state.portfolio, order, attempt.fillPrice);
    const side = order.side;

    if (side === 'long' || side === 'short') {
      if (side === 'short') state.stats.shortsOpened = (state.stats.shortsOpened || 0) + 1;
      deps.noteBuy?.(false);
      deps.recordDayTrade?.();
    } else {
      const pnl = attempt.result?.pnl || 0;
      deps.noteSell?.(pnl);
      if (side === 'cover') deps.noteProfitableShort?.(pnl);
      deps.recordDayTrade?.(pnl);
    }

    toasts.push({
      msg: `Limit filled: ${side.toUpperCase()} ${order.sym} ×${order.shares} @ $${Number(attempt.fillPrice).toFixed(2)}`,
      type: 'success',
    });
    sounds.push(side === 'long' || side === 'cover' ? 'buy' : 'sell');
  }

  state.portfolio.pendingOrders = remaining;
  return {
    anyFilled,
    toasts,
    sounds,
    checkAchievements: anyFilled,
    save: anyFilled,
    render: anyFilled,
  };
}

/**
 * Margin / pending-order / stop-target risk loop.
 * Returns actions for app.js to apply (toast/sfx/save/close callbacks).
 */
export function evaluateRiskFlow(state, deps = {}) {
  const mt = deps.getMarketTime?.();
  const minuteOfDay = mt ? (mt.getHours() * 60 + mt.getMinutes()) : 0;
  const margin = deps.processMarginCallTick?.(state.portfolio, {
    day: deps.getDayCount?.(),
    minuteOfDay,
    paused: !!state.daySummaryPending,
  }) || { toasts: [], banner: null, liquidated: false, health: null };
  state.marginBanner = margin.banner;

  const pending = processPendingOrders(state, deps);
  let trigger = null;

  updateOpenPositionMae(state.portfolio, (sym) => deps.getCachedQuote?.(sym)?.price);

  for (const [sym, p] of Object.entries(state.portfolio.longs || {})) {
    const q = deps.getCachedQuote?.(sym);
    if (!q) continue;
    if (p.stopLoss && q.price <= p.stopLoss) {
      trigger = {
        action: 'closeLong',
        sym,
        exitReason: 'stop_loss',
        msg: `${sym} stop loss hit at $${q.price.toFixed(2)}`,
        type: 'warn',
      };
      break;
    }
    if (p.takeProfit && q.price >= p.takeProfit) {
      trigger = {
        action: 'closeLong',
        sym,
        exitReason: 'take_profit',
        msg: `${sym} take profit hit at $${q.price.toFixed(2)}`,
        type: 'success',
      };
      break;
    }
  }

  if (!trigger) {
    for (const [sym, p] of Object.entries(state.portfolio.shorts || {})) {
      const q = deps.getCachedQuote?.(sym);
      if (!q) continue;
      if (p.stopLoss && q.price >= p.stopLoss) {
        trigger = {
          action: 'coverShort',
          sym,
          exitReason: 'stop_loss',
          msg: `${sym} short stop hit at $${q.price.toFixed(2)}`,
          type: 'warn',
        };
        break;
      }
      if (p.takeProfit && q.price <= p.takeProfit) {
        trigger = {
          action: 'coverShort',
          sym,
          exitReason: 'take_profit',
          msg: `${sym} short target hit at $${q.price.toFixed(2)}`,
          type: 'success',
        };
        break;
      }
    }
  }

  return {
    margin,
    pending,
    trigger,
  };
}

/**
 * Cancel a working pending order and ticket.
 */
export function cancelPendingOrderFlow(state, orderId) {
  const result = cancelPendingOrder(state.portfolio, orderId);
  if (!result.ok) {
    return {
      ok: false,
      msg: result.msg,
      alert: { title: 'Cancel failed', label: 'TRADE' },
    };
  }

  markOrderTicketCancelled(state.portfolio, orderId);
  return {
    ok: true,
    toast: { msg: `Cancelled limit ${result.order.sym}`, type: 'info' },
    save: { immediate: true },
    render: true,
  };
}

/**
 * Handle sell-to-close orchestration for an open long by symbol.
 * Returns either a confirm draft, a confirm-order-like success payload, or null.
 */
export function closeLongFlow(state, sym, deps = {}) {
  const position = state?.portfolio?.longs?.[sym];
  if (!position) return null;

  const quote = deps.getCachedQuote?.(sym);
  const price = quote?.price || position.avgPrice;
  const notional = position.shares * price;
  const confirmNotional = Number(deps.confirmNotional) || 0;
  const exitReason = normalizeExitReason(deps.exitReason);

  if (notional >= confirmNotional) {
    return {
      needsConfirm: true,
      confirmDraft: {
        action: 'sell',
        sym,
        shares: position.shares,
        price,
        orderType: 'market',
        exitReason,
      },
    };
  }

  const fillPx = slippedFillPrice(sym, 'sell', position.shares, price, deps);
  const result = sellLong(state.portfolio, sym, position.shares, fillPx, { exitReason });
  if (!result.ok) return null;

  return {
    ok: true,
    kind: 'close',
    action: 'sell',
    result,
    pnl: result.pnl || 0,
    sound: 'sell',
    checkAchievements: true,
    save: {},
    render: true,
  };
}

/**
 * Handle buy-to-cover orchestration for an open short by symbol.
 * Returns either a confirm draft, a confirm-order-like success payload, or null.
 */
export function coverShortFlow(state, sym, deps = {}) {
  const position = state?.portfolio?.shorts?.[sym];
  if (!position) return null;

  const quote = deps.getCachedQuote?.(sym);
  const price = quote?.price || position.avgPrice;
  const notional = position.shares * price;
  const confirmNotional = Number(deps.confirmNotional) || 0;
  const exitReason = normalizeExitReason(deps.exitReason);

  if (notional >= confirmNotional) {
    return {
      needsConfirm: true,
      confirmDraft: {
        action: 'cover',
        sym,
        shares: position.shares,
        price,
        orderType: 'market',
        exitReason,
      },
    };
  }

  const fillPx = slippedFillPrice(sym, 'cover', position.shares, price, deps);
  const result = coverShort(state.portfolio, sym, position.shares, fillPx, { exitReason });
  if (!result.ok) return null;

  return {
    ok: true,
    kind: 'close',
    action: 'cover',
    result,
    pnl: result.pnl || 0,
    sound: 'cover',
    checkAchievements: true,
    save: {},
    render: true,
  };
}

/**
 * Handle option ticket purchase flow (quote resolve + chain reprice + buy).
 */
export async function buyOptionFlow(state, opt, deps = {}) {
  const resolved = await deps.ensureLiveQuoteForDisplay?.(opt.sym, {
    allowSeed: true,
    force: !deps.isLiveAnchoredQuote?.(deps.getCachedQuote?.(opt.sym)),
  });
  const spot = resolved?.price > 0
    ? resolved.price
    : deps.getCachedQuote?.(opt.sym)?.price;

  let ticket = opt;
  if (spot > 0) {
    const chain = generateOptionChain(opt.sym, spot);
    const match = chain.find((contract) => (
      contract.type === opt.type
      && Number(contract.strike) === Number(opt.strike)
      && Number(contract.expiryDays) === Number(opt.expiryDays)
    ));
    if (match) {
      ticket = {
        ...opt,
        premium: match.premium,
        vol: match.vol,
        expiry: match.expiry,
      };
    }
  }

  if (!(spot > 0)) {
    return {
      ok: false,
      sound: 'error',
      msg: 'No quote available for options on this symbol.',
      alert: { title: 'Options', label: 'QUOTE' },
    };
  }

  const result = buyOption(state.portfolio, ticket, state.perks.includes('options'));
  if (!result.ok) {
    return {
      ok: false,
      sound: 'error',
      msg: result.msg,
      alert: { title: 'Options', label: 'TRADE' },
    };
  }

  return {
    ok: true,
    closeModal: true,
    noteBuy: true,
    recordDayTrade: true,
    sound: 'buy',
    checkAchievements: true,
    save: { immediate: true },
    render: true,
  };
}

/**
 * Build a quick-exit market order draft for the current symbol.
 */
export function buildQuickExitOrder(state, sym, deps = {}) {
  const quote = deps.getCachedQuote?.(sym);
  const longPos = state?.portfolio?.longs?.[sym];
  if (longPos) {
    return {
      ok: true,
      draft: {
        action: 'sell',
        sym,
        shares: longPos.shares,
        price: quote?.price || longPos.avgPrice,
        orderType: 'market',
      },
    };
  }

  const shortPos = state?.portfolio?.shorts?.[sym];
  if (shortPos) {
    return {
      ok: true,
      draft: {
        action: 'cover',
        sym,
        shares: shortPos.shares,
        price: quote?.price || shortPos.avgPrice,
        orderType: 'market',
      },
    };
  }

  return {
    ok: false,
    msg: `No open position in ${sym}.`,
    alert: { title: 'No position', label: 'TRADE' },
  };
}

/**
 * Build a standard trade draft from listing card intent.
 */
export function buildTradeDraft(side, listing, shares) {
  return {
    action: side,
    sym: listing.sym,
    price: listing.price,
    shares,
    orderType: listing.isMarket ? 'market' : 'listing',
    listing,
  };
}

/**
 * Close an existing option ticket by id.
 */
export function closeOptionFlow(state, id) {
  const option = state?.portfolio?.options?.find((entry) => entry.id === id);
  if (!option) return null;

  const premium = estimateOptionValue(option) / (option.qty * 100);
  const result = sellOption(state.portfolio, id, premium);
  if (!result.ok) return null;

  return {
    ok: true,
    pnl: result.pnl || 0,
    noteSell: true,
    recordDayTrade: true,
    checkAchievements: true,
    save: { immediate: true },
    render: true,
  };
}
