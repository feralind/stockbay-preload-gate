// @ts-check
/**
 * Volume-aware slippage — larger orders vs simulated ADV get worse fills.
 * Pre-market / evening sessions thin the book further via phaseLiquidityFactor.
 */
import { phaseLiquidityFactor } from './market.js';

/** Deterministic ADV (shares/day) when quote.volume is missing. */
export function estimateAdvShares(sym, price = 100) {
  const s = String(sym || '').toUpperCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  const px = Math.max(0.5, Number(price) || 100);
  // Mega / ETF-ish tickers: higher ADV; penny names: thinner
  let base = 1_200_000 + (Math.abs(h) % 4_500_000);
  if (['SPY', 'QQQ', 'IWM', 'DIA', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL', 'META'].includes(s)) {
    base = 8_000_000 + (Math.abs(h) % 12_000_000);
  } else if (px < 5) {
    base = 400_000 + (Math.abs(h) % 900_000);
  } else if (px > 400) {
    base = 600_000 + (Math.abs(h) % 1_500_000);
  }
  return base;
}

export function resolveAdvShares(sym, quote) {
  const fromQuote = Number(quote?.volume);
  if (Number.isFinite(fromQuote) && fromQuote > 1000) return fromQuote;
  return estimateAdvShares(sym, quote?.price);
}

/**
 * Pure: slip fraction from participation rate (order shares / ADV).
 * Caps at 2% base — phase multiplier may push effective fill further (hard cap 4%).
 */
export function slipFractionFromParticipation(participation) {
  const p = Math.max(0, Number(participation) || 0);
  if (!(p > 0)) return 0;
  // ~0.1% at 0.01% of ADV, ~1% near 0.5% of ADV, soft-cap 2%
  const raw = 0.0008 + 0.12 * Math.sqrt(p);
  return Math.min(0.02, raw);
}

/**
 * Adverse fill vs mid for a marketable order.
 * buy/cover → pay up; sell/short → sell down.
 */
export function applySlippage({
  sym,
  side,
  shares,
  quotePrice,
  quote = null,
  phaseFactor = null,
} = {}) {
  const mid = Number(quotePrice);
  const qty = Math.floor(Number(shares) || 0);
  if (!(mid > 0) || qty < 1) {
    return { fillPrice: mid, slipPct: 0, slipPerShare: 0, participation: 0, adv: 0 };
  }
  const liq = phaseFactor || phaseLiquidityFactor();
  const rawAdv = resolveAdvShares(sym, quote || { price: mid });
  const adv = Math.max(1, rawAdv * (liq.advMult ?? 1));
  const participation = qty / adv;
  let slipPct = slipFractionFromParticipation(participation) * (liq.slipMult ?? 1);
  slipPct = Math.min(0.04, slipPct);
  const adverse = ['buy', 'long', 'cover'].includes(String(side || '').toLowerCase()) ? 1 : -1;
  const fillPrice = Math.max(0.01, +(mid * (1 + adverse * slipPct)).toFixed(4));
  return {
    fillPrice,
    slipPct,
    slipPerShare: +(fillPrice - mid).toFixed(4),
    participation,
    adv,
  };
}
