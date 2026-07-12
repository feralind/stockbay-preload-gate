// @ts-check
/** Black-Scholes option pricing + greeks (game-calendar days) */

function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x >= 0 ? 1 - p : p;
}

function normPdf(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function d1d2(spot, strike, t, vol, rate) {
  const sqrtT = Math.sqrt(Math.max(t, 1 / 365));
  const v = Math.max(vol, 0.05);
  const d1 = (Math.log(spot / strike) + (rate + 0.5 * v * v) * t) / (v * sqrtT);
  const d2 = d1 - v * sqrtT;
  return { d1, d2, sqrtT };
}

/** Annualized vol guess from symbol price tier (+ optional earnings IV mult). */
export function defaultVol(sym, spot, changePct = 0, earningsMult = 1) {
  const s = (sym || '').toUpperCase();
  let base = spot < 5 ? 0.85 : spot < 25 ? 0.55 : spot < 100 ? 0.35 : 0.28;
  if (['GME', 'AMC', 'SNDL', 'COIN', 'MARA', 'RIOT', 'TSLA', 'NVDA'].includes(s)) base += 0.12;
  base += Math.min(0.15, Math.abs(changePct || 0) / 100);
  const mult = Number(earningsMult);
  if (Number.isFinite(mult) && mult > 0) base *= mult;
  return Math.min(1.2, Math.max(0.15, base));
}

export function blackScholesPremium({ spot, strike, daysToExpiry, vol, rate = 0.045, type = 'call' }) {
  if (spot <= 0 || strike <= 0) return 0.01;
  // Caller should pass daysToExpiry >= 1 for live contracts; expiry-day valuation is intrinsic in portfolio.
  const t = Math.max(daysToExpiry, 1) / 365;
  const { d1, d2 } = d1d2(spot, strike, t, vol, rate);
  const disc = Math.exp(-rate * t);
  if (type === 'call') {
    return Math.max(0.01, spot * normCdf(d1) - strike * disc * normCdf(d2));
  }
  return Math.max(0.01, strike * disc * normCdf(-d2) - spot * normCdf(-d1));
}

export function optionGreeks({ spot, strike, daysToExpiry, vol, rate = 0.045, type = 'call' }) {
  const t = Math.max(daysToExpiry, 1) / 365;
  const v = Math.max(vol, 0.05);
  const { d1, d2, sqrtT } = d1d2(spot, strike, t, v, rate);
  const disc = Math.exp(-rate * t);
  const pdf = normPdf(d1);
  const sign = type === 'call' ? 1 : -1;
  const delta = sign * normCdf(sign * d1);
  const gamma = pdf / (spot * v * sqrtT);
  const vega = (spot * pdf * sqrtT) / 100;
  const theta = (
    -(spot * pdf * v) / (2 * sqrtT)
    - sign * rate * strike * disc * normCdf(sign * d2)
  ) / 365;
  const intrinsic = type === 'call' ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
  const premium = blackScholesPremium({ spot, strike, daysToExpiry, vol, rate, type });
  const iv = vol;
  return { delta, gamma, theta, vega, premium, intrinsic, iv };
}
