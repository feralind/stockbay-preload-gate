// @ts-check
/**
 * Deal Desk — dynamic "edge vs market" visual scoring shared by the unified
 * Listings card grid (js/ui/listings.js renders every card; this module only
 * owns the pure edge-percentage math, glow scaling, and the decorative wave SVG).
 *
 * Glow intensity / EDGE-badge visibility is NEVER hardcoded per symbol.
 * computeEdgeGlowScale() derives a fresh min/max/badge cutoff from the *actual*
 * edge% distribution across whatever deal set is currently loaded, so only
 * genuine statistical outliers in today's listings glow — if every listed deal
 * is mediocre, nothing glows by default.
 */

import { smoothSparkPath } from './dashboard.js';

/** Absolute floor — below this edge%, a card never glows, no matter how it ranks percentile-wise. */
const EDGE_GLOW_FLOOR_PCT = 4;
/** Absolute floor — below this edge%, the EDGE badge never shows, no matter how it ranks. */
const EDGE_BADGE_FLOOR_PCT = 6;
/** Glow starts ramping up around this percentile of the current dataset's edge% distribution. */
const EDGE_GLOW_PERCENTILE = 0.75;
/** Full glow saturation / the EDGE badge is reserved for roughly this percentile — real outliers. */
const EDGE_BADGE_PERCENTILE = 0.95;

/**
 * "Edge" = how much cheaper a listing's ask is than its live market price right now.
 * Positive = a genuine discount (a real deal, glows). Negative = ask priced above
 * market (not a deal — never glows). Market/directory rows (ask === market price,
 * `isMarket: true`) always score exactly 0.
 * @param {{ price?: number, marketPrice?: number, isMarket?: boolean }} listing
 */
export function computeListingEdgePct(listing) {
  if (!listing || listing.isMarket) return 0;
  const price = Number(listing.price) || 0;
  const marketPrice = Number(listing.marketPrice) || 0;
  if (!(marketPrice > 0)) return 0;
  return ((marketPrice - price) / marketPrice) * 100;
}

function percentileOf(sortedAsc, p) {
  if (!sortedAsc.length) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.round((sortedAsc.length - 1) * p)));
  return sortedAsc[idx];
}

/**
 * Derives a glow scale from the *current* full deal set — never a fixed constant.
 * Two floors keep it honest either direction: `EDGE_GLOW_FLOOR_PCT`/`EDGE_BADGE_FLOOR_PCT`
 * mean a batch of universally-mediocre deals still renders flat (percentile alone can't
 * force a glow onto a bad deal just because it's the "best of a bad lot"); the percentile
 * ramp on top means the cutoff still tightens automatically once genuinely great deals
 * are in the mix, instead of a fixed bar that would light up half the grid on a lucky batch.
 * @param {Array<{ price?: number, marketPrice?: number, isMarket?: boolean }>} listings
 */
export function computeEdgeGlowScale(listings) {
  const edges = (Array.isArray(listings) ? listings : [])
    .filter((l) => l && !l.isMarket)
    .map((l) => computeListingEdgePct(l))
    .filter((v) => Number.isFinite(v));
  if (!edges.length) {
    return { min: EDGE_GLOW_FLOOR_PCT, max: EDGE_GLOW_FLOOR_PCT + 1, badgeCutoff: Infinity };
  }
  const sorted = [...edges].sort((a, b) => a - b);
  const median = percentileOf(sorted, EDGE_GLOW_PERCENTILE);
  const p90 = percentileOf(sorted, EDGE_BADGE_PERCENTILE);
  const min = Math.max(EDGE_GLOW_FLOOR_PCT, median);
  const max = Math.max(min + 0.5, p90);
  const badgeCutoff = Math.max(EDGE_BADGE_FLOOR_PCT, p90);
  return { min, max, badgeCutoff };
}

function edgeGlowIntensity(edgePct, scale) {
  const span = Math.max(0.01, scale.max - scale.min);
  return Math.max(0, Math.min(1, (edgePct - scale.min) / span));
}

/**
 * Every visual knob (border tint, ambient glow, wave-line glow, EDGE badge) is
 * derived from `glow` — one number, itself derived from where `edgePct` lands in
 * `scale` (see computeEdgeGlowScale) — so intensity tracks the real current
 * dataset instead of a hand-tuned per-card class.
 * @param {number} edgePct
 * @param {{ min: number, max: number, badgeCutoff: number }} scale
 */
export function edgeVisualTokens(edgePct, scale) {
  const glow = edgeGlowIntensity(edgePct, scale);
  const showBadge = edgePct >= scale.badgeCutoff;
  const style = [
    `--edge-border:${(glow * 34).toFixed(0)}%`,
    `--edge-glow-op:${(glow * 0.18).toFixed(2)}`,
    `--edge-shadow-pct:${(glow * 36).toFixed(0)}%`,
    `--edge-shadow-blur:${(glow * 18).toFixed(0)}px`,
    `--edge-wave-op:${(0.12 + glow * 0.28).toFixed(2)}`,
    `--edge-wave-glow:${(1 + glow * 5).toFixed(0)}px`,
    `--edge-wave-pct:${(18 + glow * 34).toFixed(0)}%`,
  ].join(';');
  return { glow, showBadge, style };
}

/** Deterministic per-symbol wobble so every card's wave line reads as unique, not a shared sine. */
function symbolSeed(sym) {
  return [...String(sym || '')].reduce((a, c) => a + c.charCodeAt(0), 0);
}

/**
 * Thin glowing SVG waveform for a card's bottom edge — reuses the dashboard
 * sparkline's Catmull-Rom smoothing + gradient-fill technique, sized for decorative
 * ambient motion rather than a literal price series.
 * @param {string} sym
 * @param {number} glow 0..1
 */
export function dealWaveSvg(sym, glow) {
  const w = 300;
  const h = 40;
  const pad = 4;
  const n = 18;
  const seed = symbolSeed(sym);
  const amp = 0.30 + glow * 0.22;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const wobble = Math.sin((seed + i * 15) * 0.34) * 0.55 + Math.cos((seed + i * 6) * 0.21) * 0.35;
    pts.push(0.5 + wobble * amp);
  }
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const coords = pts.map((v, i) => {
    const x = (i / (n - 1)) * (w - pad * 2) + pad;
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return [x, y];
  });
  const linePath = smoothSparkPath(coords);
  const first = coords[0];
  const last = coords[coords.length - 1];
  const areaPath = `${linePath} L${last[0].toFixed(1)},${h} L${first[0].toFixed(1)},${h} Z`;
  const uid = `dw${seed.toString(36)}`;
  return `<svg class="deal-wave-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="${uid}f" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--green)" stop-opacity="0.32"></stop>
        <stop offset="100%" stop-color="var(--green)" stop-opacity="0"></stop>
      </linearGradient>
    </defs>
    <path class="deal-wave-area" d="${areaPath}" fill="url(#${uid}f)"></path>
    <path class="deal-wave-line" d="${linePath}"></path>
  </svg>`;
}

/** Truncate (not round) to 1 decimal — a conservative, non-inflated edge estimate. */
export function truncate1(n) {
  return (Math.trunc(n * 10) / 10).toFixed(1);
}
