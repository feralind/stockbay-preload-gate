// @ts-check
/**
 * Margin call — maintenance check, grace period, forced liquidation.
 * Covers shorts below maintenance and leveraged longs (negative cash).
 */
import { getCachedQuote } from './api.js';
import {
  coverShort, sellLong, getLongMarketValue, getSpendableCash,
} from './portfolio.js';
import { CONFIG } from './config.js';
import { accrueTaxablePnL } from './tax.js';
import { getDayCount } from './market.js';

/** Equity / short-MV (or long-MV) below this → margin call. */
export const MAINTENANCE_MARGIN_PCT = 0.25;
/** Soft warning band above maintenance. */
export const MARGIN_WARN_PCT = 0.32;
/** Game minutes after call before auto-liquidation. */
export const MARGIN_CALL_GRACE_MINUTES = 20;

function absGameMinute(day, minuteOfDay) {
  return Math.max(1, Math.floor(Number(day) || 1)) * 1440 + Math.max(0, Math.floor(Number(minuteOfDay) || 0));
}

export function shortMarginSnapshot(sym, pos) {
  const q = getCachedQuote(sym);
  const px = q?.price ?? pos.avgPrice;
  const smv = (pos.shares || 0) * px;
  if (!(smv > 0)) {
    return { sym, ratio: Infinity, equity: 0, smv: 0, px, shares: pos.shares || 0 };
  }
  const equity = (pos.marginHeld || 0) + (pos.avgPrice - px) * pos.shares;
  return {
    sym,
    ratio: equity / smv,
    equity,
    smv,
    px,
    shares: pos.shares,
  };
}

/** Leveraged long book when cash is a debit (margin perk). */
export function longLeverageSnapshot(portfolio) {
  const cash = Number(portfolio?.cash) || 0;
  if (cash >= 0) return null;
  const longMv = getLongMarketValue(portfolio);
  const equity = cash + longMv;
  const ratio = longMv > 0 ? equity / longMv : (equity >= 0 ? Infinity : 0);
  return { cash, longMv, equity, ratio, deficit: -cash };
}

/**
 * Pure-ish health check (reads quotes).
 * level: 'ok' | 'warn' | 'call'
 */
export function evaluateMarginHealth(portfolio) {
  const shorts = [];
  let worstShort = Infinity;
  for (const [sym, pos] of Object.entries(portfolio?.shorts || {})) {
    if (!pos?.shares) continue;
    const snap = shortMarginSnapshot(sym, pos);
    shorts.push(snap);
    if (snap.ratio < worstShort) worstShort = snap.ratio;
  }
  const longLev = longLeverageSnapshot(portfolio);
  let worst = worstShort;
  if (longLev && longLev.ratio < worst) worst = longLev.ratio;

  let level = 'ok';
  if (Number.isFinite(worst)) {
    if (worst < MAINTENANCE_MARGIN_PCT) level = 'call';
    else if (worst < MARGIN_WARN_PCT) level = 'warn';
  }
  return {
    level,
    worstRatio: Number.isFinite(worst) ? worst : null,
    shorts: shorts.sort((a, b) => a.ratio - b.ratio),
    longLeverage: longLev,
  };
}

export function isMarginCallActive(portfolio) {
  return portfolio?.marginCall?.level === 'call';
}

/** Block risk-increasing opens while under an active call. */
export function blocksNewRisk(portfolio) {
  return isMarginCallActive(portfolio);
}

/**
 * Cover without the normal cash gate — used only for forced liquidation.
 * Mirrors coverShort math; cash may go further negative.
 */
export function forceCoverShort(portfolio, sym, shares, price) {
  const qty = Math.floor(Number(shares) || 0);
  const px = Number(price);
  const key = String(sym || '').toUpperCase();
  const p = portfolio?.shorts?.[key];
  if (!p || qty < 1 || !(px > 0) || p.shares < qty) {
    return { ok: false, msg: 'Cannot force-cover' };
  }
  const pnl = (p.avgPrice - px) * qty;
  const commission = CONFIG.COMMISSION;
  const marginHeld = Number(p.marginHeld) || 0;
  const marginRelease = p.shares > 0 ? (marginHeld / p.shares) * qty : 0;
  const cashDelta = pnl - commission + marginRelease;
  portfolio.cash += cashDelta;
  portfolio.realizedPnL = (portfolio.realizedPnL || 0) + pnl - commission;
  accrueTaxablePnL(portfolio, pnl - commission, {
    openedDay: p.openedDay ?? getDayCount(),
    sellDay: getDayCount(),
  });
  p.shares -= qty;
  p.marginHeld -= marginRelease;
  if (p.shares <= 0) delete portfolio.shorts[key];
  if (Array.isArray(portfolio.history)) {
    portfolio.history.unshift({
      action: 'MARGIN_COVER',
      sym: key,
      shares: qty,
      price: px,
      side: 'short',
      pnl: pnl - commission,
      time: Date.now(),
    });
    if (portfolio.history.length > 200) portfolio.history.pop();
  }
  portfolio.totalTrades = (portfolio.totalTrades || 0) + 1;
  return { ok: true, pnl: pnl - commission };
}

function raiseCashFromLongs(portfolio, need) {
  const actions = [];
  let raised = 0;
  const needAmt = Math.max(0, Number(need) || 0);
  if (!(needAmt > 0)) return { raised, actions };
  const longs = Object.entries(portfolio.longs || {})
    .map(([sym, pos]) => {
      const px = getCachedQuote(sym)?.price ?? pos.avgPrice;
      return { sym, pos, px, value: pos.shares * px };
    })
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
  for (const row of longs) {
    if (raised >= needAmt) break;
    const stillNeed = needAmt - raised;
    const shares = Math.min(row.pos.shares, Math.max(1, Math.ceil(stillNeed / row.px)));
    const r = sellLong(portfolio, row.sym, shares, row.px);
    if (r.ok) {
      raised += shares * row.px;
      actions.push({ type: 'sell', sym: row.sym, shares, price: row.px, pnl: r.pnl });
    }
  }
  return { raised, actions };
}

/**
 * Liquidate until health is ok or nothing left to cut.
 * Prefer covering worst shorts; sell longs if cover needs cash.
 * @param {object} portfolio
 * @param {{ liquidationScale?: number }} [opts] — estate resilience softens forced sells (1 = full).
 */
export function liquidateForMarginCall(portfolio, { liquidationScale = 1 } = {}) {
  const scale = Math.max(0.55, Math.min(1, Number(liquidationScale) || 1));
  const actions = [];
  for (let guard = 0; guard < 40; guard++) {
    const health = evaluateMarginHealth(portfolio);
    if (health.level !== 'call') break;

    const worst = health.shorts[0];
    if (worst && worst.shares > 0 && portfolio.shorts[worst.sym]) {
      const pos = portfolio.shorts[worst.sym];
      // Soften: cover a fraction of the worst short when resilience is high.
      const shares = Math.max(1, Math.ceil(pos.shares * scale));
      const px = worst.px;
      const pnl = (pos.avgPrice - px) * shares;
      const marginHeld = Number(pos.marginHeld) || 0;
      const marginRelease = pos.shares > 0 ? (marginHeld / pos.shares) * shares : 0;
      const cashDelta = pnl + marginRelease - CONFIG.COMMISSION;

      if (cashDelta < 0 && getSpendableCash(portfolio) < -cashDelta) {
        const need = -cashDelta - getSpendableCash(portfolio);
        const { actions: sold } = raiseCashFromLongs(portfolio, need);
        actions.push(...sold);
      }

      let covered = coverShort(portfolio, worst.sym, shares, px);
      let forced = false;
      if (!covered.ok) {
        covered = forceCoverShort(portfolio, worst.sym, shares, px);
        forced = covered.ok;
      }
      if (covered.ok) {
        actions.push({
          type: forced ? 'force_cover' : 'cover',
          sym: worst.sym,
          shares,
          price: px,
          pnl: covered.pnl,
        });
        continue;
      }
    }

    // Leveraged long: sell until ratio recovers or no longs
    if (health.longLeverage && Object.keys(portfolio.longs || {}).length) {
      const { actions: sold } = raiseCashFromLongs(
        portfolio,
        Math.max(50, health.longLeverage.deficit * 0.35 * scale),
      );
      if (sold.length) {
        actions.push(...sold);
        continue;
      }
    }
    break;
  }
  return { actions, health: evaluateMarginHealth(portfolio) };
}

/**
 * Tick handler — update warn/call state, grace, and maybe liquidate.
 * Grace uses remaining minutes (graceLeft) so day-summary pauses don't burn the window.
 * @returns {{ toasts: Array, liquidated: boolean, health: object, banner: string|null }}
 */
export function processMarginCallTick(portfolio, {
  day,
  minuteOfDay,
  paused = false,
  graceMinutes = MARGIN_CALL_GRACE_MINUTES,
  liquidationScale = 1,
} = {}) {
  const grace = Math.max(1, Math.floor(Number(graceMinutes) || MARGIN_CALL_GRACE_MINUTES));
  const health = evaluateMarginHealth(portfolio);
  const toasts = [];
  let liquidated = false;
  const nowAbs = absGameMinute(day, minuteOfDay);

  if (health.level === 'ok') {
    if (portfolio.marginCall) {
      toasts.push({ msg: 'Margin call cleared', type: 'success' });
      delete portfolio.marginCall;
    }
    return { toasts, liquidated, health, banner: null };
  }

  if (health.level === 'warn') {
    const prev = portfolio.marginCall;
    if (!prev || prev.level !== 'warn') {
      portfolio.marginCall = { level: 'warn', startedAbs: nowAbs, toasted: true };
      const pct = health.worstRatio != null ? `${(health.worstRatio * 100).toFixed(0)}%` : '—';
      toasts.push({ msg: `Margin warning — equity cushion ${pct} (maint. ${MAINTENANCE_MARGIN_PCT * 100}%)`, type: 'warn' });
    } else {
      portfolio.marginCall = { ...prev, level: 'warn' };
    }
    const lossSym = health.shorts[0]?.sym;
    return {
      toasts,
      liquidated,
      health,
      banner: `⚠ Margin warning${lossSym ? ` on ${lossSym}` : ''} — cushion ${(health.worstRatio * 100).toFixed(0)}%. Cover or add cash.`,
    };
  }

  // level === 'call'
  let state = portfolio.marginCall;
  if (!state || state.level !== 'call') {
    state = {
      level: 'call',
      startedAbs: nowAbs,
      lastTickAbs: nowAbs,
      graceLeft: grace,
      toasted: true,
    };
    portfolio.marginCall = state;
    toasts.push({
      msg: `MARGIN CALL — restore cushion within ${grace}m or positions liquidate`,
      type: 'warn',
    });
  } else {
    // Migrate old saves that only had startedAbs
    if (state.graceLeft == null && state.startedAbs != null) {
      const elapsed = Math.max(0, nowAbs - state.startedAbs);
      // Day wrap / long pause: don't instantly liquidate from abs-minute jump
      if (elapsed > grace + 60) {
        state.graceLeft = grace;
      } else {
        state.graceLeft = Math.max(0, grace - elapsed);
      }
    }
    if (state.graceLeft == null) state.graceLeft = grace;
    if (!paused && state.lastTickAbs != null && nowAbs > state.lastTickAbs) {
      state.graceLeft = Math.max(0, state.graceLeft - (nowAbs - state.lastTickAbs));
    } else if (!paused && state.lastTickAbs == null) {
      // After day-summary continue: start counting from this tick
      state.lastTickAbs = nowAbs;
    }
    if (!paused) state.lastTickAbs = nowAbs;
    portfolio.marginCall = state;
  }

  if (!paused && state.graceLeft <= 0) {
    const result = liquidateForMarginCall(portfolio, { liquidationScale });
    liquidated = result.actions.length > 0;
    if (liquidated) {
      toasts.push({
        msg: `Margin liquidation: ${result.actions.map((a) => `${a.type} ${a.sym}`).join(', ')}`,
        type: 'warn',
      });
    }
    const after = result.health;
    if (after.level === 'ok') {
      delete portfolio.marginCall;
      toasts.push({ msg: 'Margin call resolved after liquidation', type: 'success' });
    } else {
      portfolio.marginCall = {
        level: 'call',
        startedAbs: nowAbs,
        lastTickAbs: nowAbs,
        graceLeft: grace,
        toasted: true,
      };
    }
    return {
      toasts,
      liquidated,
      health: after,
      banner: after.level === 'ok'
        ? null
        : '⚠ MARGIN CALL — forced liquidation in progress',
    };
  }

  const left = Math.max(0, Math.ceil(Number(state.graceLeft) || 0));
  return {
    toasts,
    liquidated,
    health,
    banner: `⚠ MARGIN CALL — ${left}m to restore cushion or face liquidation`,
  };
}
