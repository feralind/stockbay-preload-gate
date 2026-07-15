// @ts-check
export const CONFIG = {
  FINNHUB_API_KEY: '',
  STARTING_CASH: 500,
  /** Real-world minutes for one full game day (open → evening wrap) at 1x */
  REAL_MINUTES_PER_GAME_DAY: 30,
  MARKET_OPEN: { hour: 9, minute: 30 },
  MARKET_CLOSE: { hour: 16, minute: 0 },
  /** Minutes advanced per tick while market is closed (evening wrap) */
  CLOSED_ADVANCE_MINUTES: 5,
  /** Evening lasts this many game minutes after close before next day */
  EVENING_MINUTES: 60,
  /** Minutes before official open treated as Pre-Market (thin liquidity) */
  PREMARKET_MINUTES: 30,
  QUOTE_BATCH_SIZE: 30,
  /** Legacy short interval — used only as a floor for ONLINE_BASE_REFRESH_MS */
  QUOTE_REFRESH_MS: 15000,
  /** Modest re-anchor of baselines while online (not tick streaming) */
  ONLINE_BASE_REFRESH_MS: 300000,
  /** While Deal Desk is open: re-anchor still-seed visible cards (not the full universe) */
  LISTINGS_VIEWPORT_REFRESH_MS: 12000,
  /** Persisted last-good quote baselines for offline / cold start (v3 drops pre-split NFLX etc.) */
  QUOTE_BASELINE_KEY: 'stockway_quote_baselines_v3',
  /** First-launch / Reset: block play until this many live-anchored quotes (or short timeout). */
  QUOTE_PRELOAD_GATE_TARGET: 50,
  /** After the gate: keep fetching in the background up to this many (non-blocking). */
  QUOTE_PRELOAD_BACKGROUND_TARGET: 500,
  /** Short fallback so a dead network cannot soft-lock even the small gate. */
  QUOTE_PRELOAD_TIMEOUT_MS: 15000,
  NEWS_REFRESH_MS: 120000,
  LISTING_POOL_SIZE: 100,
  LISTING_PAGE_SIZE: 30,
  MINI_LISTING_COUNT: 5,
  /** Hot listings rotate through this many top deal-score candidates (sliding window). */
  HOT_LISTING_POOL_SIZE: 18,
  /** Ranked candidates to prefetch ahead of rotation (includes symbols still waiting on live quotes). */
  HOT_LISTING_PREFETCH_SIZE: 24,
  /** Advance the hot-listings window on this interval (ms). */
  HOT_LISTING_ROTATION_MS: 15000,
  /** After mouse leaves Hot listings, wait this long before resuming rotation (ms). */
  HOT_LISTING_RESUME_MS: 1750,
  MARGIN_REQUIREMENT: 0.5,
  COMMISSION: 0,
  SAVE_KEY: 'stockway_save_v1',
  /** Progressive autosave — debounce bursts of ticks/trades */
  AUTOSAVE_DEBOUNCE_MS: 1500,
  /** Heartbeat while the desk is open (market drift, staff, clock) */
  AUTOSAVE_INTERVAL_MS: 30000,
  /** Soft lag catch-up cap — game minutes advanced after minimize/lag (no day-end) */
  MAX_CATCHUP_GAME_MINUTES: 240,
  CONFIRM_NOTIONAL_USD: 500,
  CONFIRM_PERK_COST: 600,
  TICKER_SYMBOLS: ['AAPL','MSFT','NVDA','TSLA','GOOGL','META','AMZN','AMD','NFLX','SPY','QQQ','JPM','XOM','UNH','COIN'],
};

import { LICENSES, hasLicense } from './licenses.js';

/**
 * Desk perks — gated by cash, perk prereqs, and institutional licenses
 * (Retail → Series 7 → Series 86/87 Research → Reg D).
 * Owned perks from old saves remain active even if new gates would block rebuy.
 */
export const PERKS = {
  scanner: {
    id: 'scanner',
    name: 'Pro Scanner',
    desc: 'Improves listing discounts and GREAT DEAL frequency. Required for most desk upgrades.',
    cost: 250,
    icon: 'scan',
    tier: 1,
    tierLabel: 'Retail',
    licenseRequired: 'retail',
  },
  hrDept: {
    id: 'hrDept',
    name: 'HR Department',
    desc: 'Opens hiring. Staff handle listings, risk, research, and execution.',
    cost: 400,
    icon: 'hr',
    tier: 1,
    tierLabel: 'Retail',
    licenseRequired: 'retail',
    requires: ['scanner'],
  },
  analyst: {
    id: 'analyst',
    name: 'Analyst Reports',
    desc: 'Moving averages and support/resistance on the chart. Unlocks Research Analyst.',
    cost: 700,
    icon: 'chart',
    tier: 1,
    tierLabel: 'Retail',
    licenseRequired: 'retail',
    requires: ['scanner'],
  },
  complianceSuite: {
    id: 'complianceSuite',
    name: 'Compliance Suite',
    desc: 'Cuts firm-wide staff mistake rate by about 40%. Stacks with a Compliance Officer.',
    cost: 900,
    icon: 'compliance',
    tier: 1,
    tierLabel: 'Retail',
    licenseRequired: 'retail',
    requires: ['hrDept'],
  },
  margin: {
    id: 'margin',
    name: 'Margin Account',
    desc: 'Enables short selling and doubles long buying power.',
    cost: 950,
    icon: 'margin',
    tier: 2,
    tierLabel: 'Series 7',
    licenseRequired: 'series7',
    requires: ['scanner'],
  },
  tradingFloor: {
    id: 'tradingFloor',
    name: 'Trading Floor',
    desc: 'Raises staff capacity to 8 seats and speeds automation by 25%.',
    cost: 2800,
    icon: 'floor',
    tier: 2,
    tierLabel: 'Series 7',
    licenseRequired: 'series7',
    requires: ['hrDept'],
  },
  options: {
    id: 'options',
    name: 'Options Desk',
    desc: 'Trade calls and puts with Black–Scholes pricing on listed symbols.',
    cost: 4800,
    icon: 'options',
    tier: 2,
    tierLabel: 'Series 7',
    licenseRequired: 'series7',
    requires: ['margin'],
  },
  smartRouting: {
    id: 'smartRouting',
    name: 'Smart Routing',
    desc: 'Reduces fill slippage by about 35% on market orders and staff trades.',
    cost: 3600,
    icon: 'routing',
    tier: 2,
    tierLabel: 'Series 7',
    licenseRequired: 'series7',
    requires: ['scanner'],
  },
  newsWire: {
    id: 'newsWire',
    name: 'News Wire',
    desc: 'Full simulated desk briefs, plus live headlines about two minutes before price impact.',
    cost: 650,
    icon: 'news',
    tier: 3,
    tierLabel: 'Series 86/87',
    licenseRequired: 'research',
    requires: ['scanner'],
  },
  insider: {
    id: 'insider',
    name: 'Insider Network',
    desc: 'Improves listing estimates and can reveal simulated events early. Not always correct.',
    cost: 16500,
    icon: 'eye',
    tier: 3,
    tierLabel: 'Series 86/87',
    licenseRequired: 'research',
    requires: ['scanner'],
  },
  aiAdvisor: {
    id: 'aiAdvisor',
    name: 'AI Trading Advisor',
    desc: 'Signals, daily picks, and desk chat. Unlocks the Junior Trader hire.',
    cost: 18500,
    icon: 'ai',
    tier: 3,
    tierLabel: 'Series 86/87',
    licenseRequired: 'research',
    requires: ['scanner', 'analyst'],
  },
  auraAmp: {
    id: 'auraAmp',
    name: 'Vault Prestige',
    desc: 'Boosts the Desk Prestige tier shown from equipped Vault cosmetics. Display flair only.',
    cost: 12500,
    icon: 'prestige',
    tier: 3,
    tierLabel: 'Series 86/87',
    licenseRequired: 'research',
    requires: ['scanner'],
  },
  hedgeFund: {
    id: 'hedgeFund',
    name: 'Hedge Fund Status',
    desc: 'Covers 50% of staff salaries and unlocks the Managing Partner hire.',
    cost: 28000,
    icon: 'fund',
    tier: 4,
    tierLabel: 'Reg D',
    licenseRequired: 'regd',
    requires: ['tradingFloor', 'margin'],
  },
  primeBroker: {
    id: 'primeBroker',
    name: 'Prime Broker',
    desc: 'Adds eight minutes of margin-call grace before forced liquidation.',
    cost: 22000,
    icon: 'prime',
    tier: 4,
    tierLabel: 'Reg D',
    licenseRequired: 'regd',
    requires: ['margin', 'tradingFloor'],
  },
  legendDesk: {
    id: 'legendDesk',
    name: 'Legend Desk',
    desc: 'Staff capacity to 10 seats, plus a further 10% payroll subsidy atop Hedge Fund Status.',
    cost: 50000,
    icon: 'legend',
    tier: 4,
    tierLabel: 'Reg D',
    licenseRequired: 'regd',
    requires: ['hedgeFund'],
  },
};

/** Shared purchase gate — cash, perk prereqs, and license. Owned = always ok for effect checks. */
export function canPurchasePerk(perk, { cash = 0, perks = [], licenses = ['retail'] } = {}) {
  if (!perk) return { ok: false, reason: 'Unknown perk' };
  if (perks.includes(perk.id)) return { ok: false, reason: 'Already owned' };
  const licNeed = perk.licenseRequired || 'retail';
  if (!hasLicense(licenses, licNeed)) {
    const lic = LICENSES[licNeed] || LICENSES.retail;
    return {
      ok: false,
      reason: `Requires the ${lic.name} license`,
      code: 'license',
    };
  }
  if (perk.requires?.length && !perk.requires.every((r) => perks.includes(r))) {
    return {
      ok: false,
      reason: 'Requires: ' + perk.requires.map((r) => PERKS[r]?.name || r).join(', '),
      code: 'prereq',
    };
  }
  if (cash < perk.cost) return { ok: false, reason: 'Not enough cash for this perk.', code: 'cash' };
  return { ok: true };
}
