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
  CONFIRM_NOTIONAL_USD: 500,
  CONFIRM_PERK_COST: 600,
  TICKER_SYMBOLS: ['AAPL','MSFT','NVDA','TSLA','GOOGL','META','AMZN','AMD','NFLX','SPY','QQQ','JPM','XOM','UNH','COIN'],
};

/**
 * Named REP ranks — gate stronger desk perks and show progress in UI.
 * Tuned for Day 1–3 early unlocks; OP tools need sustained trading / challenges.
 */
export const REP_RANKS = [
  { id: 'newcomer', name: 'Newcomer', minRep: 0, blurb: 'Open the desk — Scanner & HR' },
  { id: 'deskHand', name: 'Desk Hand', minRep: 40, blurb: 'News, charts, margin & compliance' },
  { id: 'trusted', name: 'Trusted Trader', minRep: 120, blurb: 'Floor scale, options & routing' },
  { id: 'veteran', name: 'Market Veteran', minRep: 250, blurb: 'Insider network, AI desk & vault prestige' },
  { id: 'elite', name: 'Elite Desk', minRep: 500, blurb: 'Hedge fund status & prime brokerage' },
  { id: 'legend', name: 'Market Legend', minRep: 1800, blurb: 'Legend Desk — maximum floor scale' },
];

/** Resolve current REP rank (highest whose minRep ≤ rep). */
export function getRepRank(rep = 0) {
  const r = Math.max(0, Number(rep) || 0);
  let current = REP_RANKS[0];
  for (const rank of REP_RANKS) {
    if (r >= rank.minRep) current = rank;
  }
  return current;
}

/** Next rank above current, or null at the top. */
export function getNextRepRank(rep = 0) {
  const current = getRepRank(rep);
  const idx = REP_RANKS.findIndex((r) => r.id === current.id);
  return idx >= 0 && idx < REP_RANKS.length - 1 ? REP_RANKS[idx + 1] : null;
}

/**
 * Desk perks — tier bands map to REP_RANKS.
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
    tierLabel: 'Newcomer',
    repRequired: 0,
  },
  hrDept: {
    id: 'hrDept',
    name: 'HR Department',
    desc: 'Opens hiring. Staff handle listings, risk, research, and execution.',
    cost: 400,
    icon: 'hr',
    tier: 1,
    tierLabel: 'Newcomer',
    repRequired: 0,
    requires: ['scanner'],
  },
  newsWire: {
    id: 'newsWire',
    name: 'News Wire',
    desc: 'Full simulated desk briefs, plus live headlines about two minutes before price impact.',
    cost: 650,
    icon: 'news',
    tier: 2,
    tierLabel: 'Desk Hand',
    repRequired: 40,
    requires: ['scanner'],
  },
  analyst: {
    id: 'analyst',
    name: 'Analyst Reports',
    desc: 'Moving averages and support/resistance on the chart. Unlocks Research Analyst.',
    cost: 700,
    icon: 'chart',
    tier: 2,
    tierLabel: 'Desk Hand',
    repRequired: 40,
    requires: ['scanner'],
  },
  margin: {
    id: 'margin',
    name: 'Margin Account',
    desc: 'Enables short selling and doubles long buying power.',
    cost: 950,
    icon: 'margin',
    tier: 2,
    tierLabel: 'Desk Hand',
    repRequired: 40,
    requires: ['scanner'],
  },
  complianceSuite: {
    id: 'complianceSuite',
    name: 'Compliance Suite',
    desc: 'Cuts firm-wide staff mistake rate by about 40%. Stacks with a Compliance Officer.',
    cost: 900,
    icon: 'compliance',
    tier: 2,
    tierLabel: 'Desk Hand',
    repRequired: 45,
    requires: ['hrDept'],
  },
  tradingFloor: {
    id: 'tradingFloor',
    name: 'Trading Floor',
    desc: 'Raises staff capacity to 8 seats and speeds automation by 25%.',
    cost: 2800,
    icon: 'floor',
    tier: 3,
    tierLabel: 'Trusted Trader',
    repRequired: 120,
    requires: ['hrDept'],
  },
  options: {
    id: 'options',
    name: 'Options Desk',
    desc: 'Trade calls and puts with Black–Scholes pricing on listed symbols.',
    cost: 4800,
    icon: 'options',
    tier: 3,
    tierLabel: 'Trusted Trader',
    repRequired: 150,
    requires: ['margin'],
  },
  smartRouting: {
    id: 'smartRouting',
    name: 'Smart Routing',
    desc: 'Reduces fill slippage by about 35% on market orders and staff trades.',
    cost: 3600,
    icon: 'routing',
    tier: 3,
    tierLabel: 'Trusted Trader',
    repRequired: 130,
    requires: ['scanner'],
  },
  insider: {
    id: 'insider',
    name: 'Insider Network',
    desc: 'Improves listing estimates and can reveal simulated events early. Not always correct.',
    cost: 16500,
    icon: 'eye',
    tier: 4,
    tierLabel: 'Market Veteran',
    repRequired: 250,
    requires: ['scanner'],
  },
  aiAdvisor: {
    id: 'aiAdvisor',
    name: 'AI Trading Advisor',
    desc: 'Signals, daily picks, and desk chat. Unlocks the Junior Trader hire.',
    cost: 18500,
    icon: 'ai',
    tier: 4,
    tierLabel: 'Market Veteran',
    repRequired: 280,
    requires: ['scanner', 'analyst'],
  },
  auraAmp: {
    id: 'auraAmp',
    name: 'Vault Prestige',
    desc: 'Raises reputation from equipped Vault cosmetics on profitable closes; higher daily cap.',
    cost: 12500,
    icon: 'prestige',
    tier: 4,
    tierLabel: 'Market Veteran',
    repRequired: 300,
    requires: ['scanner'],
  },
  hedgeFund: {
    id: 'hedgeFund',
    name: 'Hedge Fund Status',
    desc: 'Covers 50% of staff salaries and unlocks the Managing Partner hire.',
    cost: 28000,
    icon: 'fund',
    tier: 5,
    tierLabel: 'Elite Desk',
    repRequired: 500,
    requires: ['tradingFloor', 'margin'],
  },
  primeBroker: {
    id: 'primeBroker',
    name: 'Prime Broker',
    desc: 'Adds eight minutes of margin-call grace before forced liquidation.',
    cost: 22000,
    icon: 'prime',
    tier: 5,
    tierLabel: 'Elite Desk',
    repRequired: 550,
    requires: ['margin', 'tradingFloor'],
  },
  legendDesk: {
    id: 'legendDesk',
    name: 'Legend Desk',
    desc: 'Staff capacity to 10 seats, plus a further 10% payroll subsidy atop Hedge Fund Status.',
    cost: 50000,
    icon: 'legend',
    tier: 6,
    tierLabel: 'Market Legend',
    repRequired: 1800,
    requires: ['hedgeFund'],
  },
};

/** Shared purchase gate — cash, perk prereqs, and REP. Owned = always ok for effect checks. */
export function canPurchasePerk(perk, { cash = 0, perks = [], reputation = 0 } = {}) {
  if (!perk) return { ok: false, reason: 'Unknown perk' };
  if (perks.includes(perk.id)) return { ok: false, reason: 'Already owned' };
  const repNeed = perk.repRequired || 0;
  if (reputation < repNeed) {
    const rank = getRepRank(repNeed);
    return {
      ok: false,
      reason: `Requires ${perk.tierLabel || rank.name} · ${repNeed} REP`,
      code: 'rep',
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
