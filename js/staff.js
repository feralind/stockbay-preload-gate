// @ts-check
import { getCachedQuote } from './api.js';
import { buyLong, sellLong, openShort, coverShort, getEquity, getSpendableCash } from './portfolio.js';
import { applySlippage } from './slippage.js';

function staffFill(sym, side, shares, mid, perks = []) {
  let fill = applySlippage({
    sym,
    side,
    shares,
    quotePrice: mid,
    quote: getCachedQuote(sym),
  }).fillPrice;
  if (Array.isArray(perks) && perks.includes('smartRouting') && mid > 0 && fill > 0) {
    fill = Math.max(0.01, +(mid + (fill - mid) * 0.65).toFixed(4));
  }
  return fill;
}

/** Default desk risk rule — most buy/sell automation respects this. */
export const STAFF_DEFAULT_MAX_POSITION_PCT = 0.05;
/** AI trader minimum confidence before buying. */
export const STAFF_AI_MIN_CONFIDENCE = 70;

/**
 * Max notional for a new/add buy under the desk sizing rule.
 * @param {object} portfolio
 * @param {number} [maxPct]
 */
export function staffPositionBudget(portfolio, maxPct = STAFF_DEFAULT_MAX_POSITION_PCT) {
  const equity = Math.max(0, Number(getEquity(portfolio)) || 0);
  const pct = Number(maxPct);
  const use = Number.isFinite(pct) && pct > 0 ? Math.min(0.25, pct) : STAFF_DEFAULT_MAX_POSITION_PCT;
  return equity * use;
}

/**
 * Shares that keep (existing + new) notional under maxPct of equity, and within cash.
 * @param {object} portfolio
 * @param {string} sym
 * @param {number} price
 * @param {{ maxPct?: number, hardCapShares?: number }} [opts]
 */
export function staffMaxBuyShares(portfolio, sym, price, opts = {}) {
  const px = Number(price);
  if (!(px > 0) || !portfolio) return 0;
  const maxPct = opts.maxPct ?? STAFF_DEFAULT_MAX_POSITION_PCT;
  const existing = Number(portfolio.longs?.[sym]?.shares) || 0;
  const existingNotional = existing * px;
  const room = Math.max(0, staffPositionBudget(portfolio, maxPct) - existingNotional);
  let shares = Math.floor(room / px);
  const cash = getSpendableCash(portfolio);
  shares = Math.min(shares, Math.floor(cash / px));
  if (opts.hardCapShares != null) shares = Math.min(shares, Math.floor(Number(opts.hardCapShares) || 0));
  return Math.max(0, shares);
}

/**
 * Listing conviction 0–100 from discount to insider true value (deals score higher).
 * @param {{ price?: number, trueValue?: number, isDeal?: boolean, researchFlag?: boolean }} listing
 */
export function listingConviction(listing) {
  const price = Number(listing?.price);
  const tv = Number(listing?.trueValue);
  if (!(price > 0) || !(tv > 0)) return listing?.isDeal ? 72 : 40;
  const edge = (tv - price) / tv;
  let score = 45 + edge * 220;
  if (listing.isDeal) score += 12;
  if (listing.researchFlag) score += 8;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export const STAFF_TIERS = {
  newbie: { id: 'newbie', name: 'Newbie', efficiency: 0.7, mistakeRate: 0.22, next: 'veteran', trainCost: 450 },
  veteran: { id: 'veteran', name: 'Veteran', efficiency: 1.0, mistakeRate: 0.10, next: 'expert', trainCost: 1200 },
  expert: { id: 'expert', name: 'Expert', efficiency: 1.35, mistakeRate: 0.03, next: null, trainCost: 0 },
};

/** Tenure XP — longer play makes the desk faster, cleaner, and more autonomous. */
export const STAFF_XP_PER_DAY = 10;
export const STAFF_XP_PER_ACTION = 3;
/** Auto-promote Newbie → Veteran after enough clean tenure (Expert still needs Train). */
export const STAFF_AUTO_VETERAN_XP = 140;
/** Autopilot unlock — Veteran+ with real desk time. */
export const STAFF_AUTOPILOT_MIN_XP = 200;
/** Max salary bump from tenure (keeps late desk from being free money). */
export const STAFF_TENURE_PAY_CAP = 0.18;

export function staffXp(member) {
  return Math.max(0, Math.floor(Number(member?.xp) || 0));
}

export function staffTenureDays(member) {
  return Math.max(0, Math.floor(Number(member?.tenureDays) || 0));
}

/** Soft levels 0–5 from accumulated XP. */
export function staffTenureLevel(member) {
  const xp = staffXp(member);
  if (xp >= 400) return 5;
  if (xp >= 280) return 4;
  if (xp >= 180) return 3;
  if (xp >= 100) return 2;
  if (xp >= 40) return 1;
  return 0;
}

export function staffTenureEfficiencyBoost(member) {
  return 1 + staffTenureLevel(member) * 0.04;
}

export function staffTenureMistakeScale(member) {
  return Math.max(0.55, 1 - staffTenureLevel(member) * 0.07);
}

export function staffActionChanceMult(member) {
  let m = 1 + staffTenureLevel(member) * 0.06;
  if (member?.autopilot) m *= 1.25;
  return m;
}

export function staffProgressGainMult(member) {
  let m = 1 + staffTenureLevel(member) * 0.08;
  if (member?.autopilot) m *= 1.35;
  return m;
}

/** Position authority scales with tenure/tier, hard-capped at 12% equity. */
export function staffAuthorityPct(member, role) {
  const base = role?.maxPositionPct;
  if (base == null) return null;
  const lvl = staffTenureLevel(member);
  const tierBoost = member?.tier === 'expert' ? 0.25 : member?.tier === 'veteran' ? 0.12 : 0;
  const mult = 1 + Math.min(0.45, lvl * 0.06 + tierBoost);
  return Math.min(0.12, base * mult);
}

export function staffHardCapShares(member, baseCap) {
  return Math.max(1, Math.floor((Number(baseCap) || 1) + staffTenureLevel(member) * 2));
}

export function staffConvictionFloor(member) {
  let floor = 70 - Math.min(12, staffTenureLevel(member) * 2);
  if (member?.autopilot) floor -= 3;
  return Math.max(55, floor);
}

export function staffAiConfidenceFloor(member) {
  let floor = STAFF_AI_MIN_CONFIDENCE - Math.min(10, staffTenureLevel(member) * 2);
  if (member?.autopilot) floor -= 3;
  return Math.max(55, floor);
}

export function staffTenurePayMult(member) {
  const fromDays = staffTenureDays(member) * 0.0015;
  const fromLevel = staffTenureLevel(member) * 0.02;
  return 1 + Math.min(STAFF_TENURE_PAY_CAP, fromDays + fromLevel);
}

/**
 * Day-end tenure tick — XP, days employed, optional Newbie→Veteran auto-promote.
 * Expert still requires paid Train so Train stays meaningful.
 */
export function tickStaffTenureDay(state) {
  const promotions = [];
  for (const m of state.staff || []) {
    if (!m.active) continue;
    m.tenureDays = staffTenureDays(m) + 1;
    const actionXp = Math.min(24, (m.actionsToday || 0) * STAFF_XP_PER_ACTION);
    m.xp = staffXp(m) + STAFF_XP_PER_DAY + actionXp;
    if (
      m.tier === 'newbie'
      && staffXp(m) >= STAFF_AUTO_VETERAN_XP
      && (m.mistakes || 0) <= Math.max(3, staffTenureDays(m) * 0.35)
    ) {
      m.tier = 'veteran';
      state.stats = state.stats || {};
      state.stats.trainedVeteran = (state.stats.trainedVeteran || 0) + 1;
      promotions.push(m.name);
      state.staffLog?.unshift({
        time: Date.now(),
        staff: m.name,
        action: `Promoted to Veteran (tenure ${staffTenureDays(m)}d · ${staffXp(m)} XP)`,
      });
    }
  }
  return promotions;
}

/** Lanes that count toward buy / sell coverage on the Overview desk. */
export const STAFF_BUY_LANES = new Set(['buy', 'short']);
export const STAFF_SELL_LANES = new Set(['sell']);

/**
 * Role catalog — save key is `roleId`. New fields are display/logic only.
 * lane: ops | insight | buy | sell | short | lead
 * Wages are game-day burn (not wall-clock hourly) — tuned to resist AFK spam.
 */
export const STAFF_ROLES = {
  intern: {
    id: 'intern',
    name: 'Intern',
    title: 'Operations Intern',
    mark: 'IN',
    color: '#8b949e',
    lane: 'ops',
    salary: 48,
    hireCost: 550,
    desc: 'Keeps listings fresh and the desk organized — no trading authority.',
    does: 'Refreshes market listings and files routine desk work.',
    never: 'Never buys, sells, shorts, or sizes positions.',
    rules: 'No portfolio risk · ops only',
    automates: 'Listing refresh',
    maxPositionPct: null,
    requires: [],
  },
  scout: {
    id: 'scout',
    name: 'Listing Scout',
    title: 'Deal Hunter',
    mark: 'SC',
    color: '#58a6ff',
    lane: 'buy',
    salary: 105,
    hireCost: 1500,
    desc: 'Snipes GREAT DEAL listings only when conviction and size rules clear.',
    does: 'Buys GREAT DEAL names when conviction ≥ 70 and cash is free.',
    never: 'Never chases non-deals, never adds past the size cap, never shorts.',
    rules: `Max ${(STAFF_DEFAULT_MAX_POSITION_PCT * 100).toFixed(0)}% equity per name · conviction ≥ 70`,
    automates: 'Deal sniping',
    maxPositionPct: STAFF_DEFAULT_MAX_POSITION_PCT,
    requires: ['scanner'],
  },
  compliance: {
    id: 'compliance',
    name: 'Compliance Officer',
    title: 'Risk Auditor',
    mark: 'CO',
    color: '#79c0ff',
    lane: 'ops',
    salary: 120,
    hireCost: 1700,
    desc: 'Suppresses firm mistake rate and flags underwater longs for review.',
    does: 'Audits the book and flags longs ≤ −5% vs cost.',
    never: 'Never places trades or changes position size.',
    rules: 'Advisory only · lowers desk mistake rate while active',
    automates: 'Mistake control',
    maxPositionPct: null,
    requires: [],
  },
  research: {
    id: 'research',
    name: 'Research Analyst',
    title: 'Equity Research',
    mark: 'RA',
    color: '#56d4dd',
    lane: 'insight',
    salary: 155,
    hireCost: 2200,
    desc: 'Promotes near-deals and lifts Scout / Junior Trader hit quality.',
    does: 'Marks undervalued listings as GREAT DEAL and writes AI pick notes.',
    never: 'Never executes orders or overrides the size rule for others.',
    rules: 'Insight only · boosts buy-role efficiency',
    automates: 'Deal insight',
    maxPositionPct: null,
    requires: ['analyst'],
  },
  trader: {
    id: 'trader',
    name: 'Junior Trader',
    title: 'Execution Desk',
    mark: 'TR',
    color: '#3fb950',
    lane: 'buy',
    salary: 145,
    hireCost: 2100,
    desc: 'Buys AI BUY picks only when confidence clears the desk bar.',
    does: `Buys AI BUY signals with confidence ≥ ${STAFF_AI_MIN_CONFIDENCE}.`,
    never: 'Never buys HOLD/SHORT, never averages into losers, never shorts.',
    rules: `Max ${(STAFF_DEFAULT_MAX_POSITION_PCT * 100).toFixed(0)}% equity · AI confidence ≥ ${STAFF_AI_MIN_CONFIDENCE}`,
    automates: 'AI pick buys',
    maxPositionPct: STAFF_DEFAULT_MAX_POSITION_PCT,
    requires: ['aiAdvisor'],
  },
  risk: {
    id: 'risk',
    name: 'Risk Manager',
    title: 'Risk Desk',
    mark: 'RK',
    color: '#f0883e',
    lane: 'sell',
    salary: 180,
    hireCost: 2600,
    desc: 'Hard exits on longs — full take-profit or stop, never opens risk.',
    does: 'Fully exits longs at +12% take-profit or −7% stop.',
    never: 'Never buys, never shorts, never adds size.',
    rules: 'Exit-only · full flat on trigger · no new risk',
    automates: 'TP / stop exits',
    maxPositionPct: STAFF_DEFAULT_MAX_POSITION_PCT,
    requires: ['margin'],
  },
  exitSpec: {
    id: 'exitSpec',
    name: 'Exit Specialist',
    title: 'Position Manager',
    mark: 'EX',
    color: '#d2a8ff',
    lane: 'sell',
    salary: 155,
    hireCost: 2300,
    desc: 'Trims winners and cuts early losers — the firm’s dedicated seller.',
    does: 'Sells ~half of a long at +8% trim or −5% early cut.',
    never: 'Never buys, never shorts, never opens new names.',
    rules: 'Sell-only · partial exits · respects book discipline',
    automates: 'Trim / early cut',
    maxPositionPct: STAFF_DEFAULT_MAX_POSITION_PCT,
    requires: ['scanner'],
  },
  shortSpec: {
    id: 'shortSpec',
    name: 'Short Specialist',
    title: 'Short Desk',
    mark: 'SH',
    color: '#f85149',
    lane: 'short',
    salary: 205,
    hireCost: 3200,
    desc: 'Opens small shorts only on extended upside prints.',
    does: 'Shorts overbought names (day change > +3%) with tight size.',
    never: 'Never longs, never stacks into existing shorts, never ignores margin.',
    rules: 'Max 3% equity per short · margin required',
    automates: 'Overbought shorts',
    maxPositionPct: 0.03,
    requires: ['margin'],
  },
  quant: {
    id: 'quant',
    name: 'Quant Analyst',
    title: 'Algorithmic Trading',
    mark: 'QT',
    color: '#a371f7',
    lane: 'buy',
    salary: 270,
    hireCost: 4200,
    desc: 'Momentum buys with size caps; covers shorts that blow through stops.',
    does: 'Buys mild breakouts; covers shorts ≤ −6% vs entry.',
    never: 'Never ignores the size cap, never averages losers, never chase >5%.',
    rules: `Max ${(STAFF_DEFAULT_MAX_POSITION_PCT * 100).toFixed(0)}% equity on buys · cover losing shorts first`,
    automates: 'Momentum algo',
    maxPositionPct: STAFF_DEFAULT_MAX_POSITION_PCT,
    requires: ['analyst', 'margin'],
  },
  partner: {
    id: 'partner',
    name: 'Managing Partner',
    title: 'Firm Leadership',
    mark: 'MP',
    color: '#e3b341',
    lane: 'lead',
    salary: 450,
    hireCost: 11000,
    desc: 'Raises floor efficiency and occasional firm cash bonuses.',
    does: 'Boosts all staff efficiency; small periodic firm bonuses.',
    never: 'Never personally snipes or overrides buy/sell risk rules.',
    rules: 'Leadership only · no direct position authority',
    automates: 'Floor boost + bonus',
    maxPositionPct: null,
    requires: ['hrDept', 'hedgeFund'],
  },
};

export function canEnableAutopilot(member) {
  if (!member) return { ok: false, msg: 'Not found' };
  const role = STAFF_ROLES[member.roleId];
  if (!role) return { ok: false, msg: 'Unknown role' };
  const trading = STAFF_BUY_LANES.has(role.lane) || STAFF_SELL_LANES.has(role.lane);
  if (!trading) return { ok: false, msg: 'Autopilot is for trading seats' };
  if (member.tier !== 'veteran' && member.tier !== 'expert') {
    return { ok: false, msg: 'Need Veteran+ for autopilot' };
  }
  if (staffXp(member) < STAFF_AUTOPILOT_MIN_XP) {
    return { ok: false, msg: `Need ${STAFF_AUTOPILOT_MIN_XP} XP (have ${staffXp(member)})` };
  }
  return { ok: true };
}

export function setStaffAutopilot(staffId, enabled, state) {
  const m = state.staff?.find((s) => s.id === staffId);
  if (!m) return { ok: false, msg: 'Not found' };
  if (enabled) {
    const check = canEnableAutopilot(m);
    if (!check.ok) return check;
  }
  m.autopilot = !!enabled;
  state.staffLog?.unshift({
    time: Date.now(),
    staff: m.name,
    action: m.autopilot ? 'Autopilot ON — self-managing within lane rules' : 'Autopilot OFF — desk supervision',
  });
  return { ok: true, member: m };
}

const PERK_LABELS = {
  scanner: 'Pro Scanner',
  insider: 'Insider Network',
  margin: 'Margin Account',
  options: 'Options Desk',
  analyst: 'Analyst Reports',
  newsWire: 'News Wire',
  aiAdvisor: 'AI Advisor',
  hrDept: 'HR Department',
  tradingFloor: 'Trading Floor',
  hedgeFund: 'Hedge Fund Status',
  complianceSuite: 'Compliance Suite',
  smartRouting: 'Smart Routing',
  auraAmp: 'Vault Prestige',
  primeBroker: 'Prime Broker',
  legendDesk: 'Legend Desk',
};

function formatPerkReqs(requires = []) {
  return requires
    .filter(r => r !== 'hrDept')
    .map(r => PERK_LABELS[r] || r)
    .join(', ');
}

export const MAX_STAFF = 6;

export function getMaxStaff(state) {
  if (state?.perks?.includes('legendDesk')) return 10;
  if (state?.perks?.includes('tradingFloor')) return 8;
  return MAX_STAFF;
}

export function createStaffMember(roleId) {
  const role = STAFF_ROLES[roleId];
  return {
    id: `${roleId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    roleId,
    name: randomName(),
    tier: 'newbie',
    hiredAt: Date.now(),
    active: true,
    actionsToday: 0,
    profitGenerated: 0,
    mistakes: 0,
    wins: 0,
    losses: 0,
    tradesClosed: 0,
    status: 'Ready',
    progress: 0,
    history: [],
    xp: 0,
    tenureDays: 0,
    autopilot: false,
  };
}

function randomName() {
  const first = ['Alex', 'Jordan', 'Sam', 'Riley', 'Morgan', 'Casey', 'Taylor', 'Quinn', 'Avery', 'Blake',
    'Cole', 'Sven', 'Nadia', 'Tamsin', 'Cleo', 'Dale', 'Imani', 'Priya', 'Suki', 'Wendell', 'Bex', 'Bart'];
  const last = ['Chen', 'Patel', 'Kim', 'Rivera', 'Brooks', 'Hayes', 'Nguyen', 'Foster', 'Shah', 'Wells',
    'Okada', 'Voss', 'Mercer', 'Diaz', 'Singh', 'Park', 'Rossi', 'Klein'];
  return `${first[Math.floor(Math.random() * first.length)]} ${last[Math.floor(Math.random() * last.length)]}`;
}

export function getTier(member) {
  return STAFF_TIERS[member.tier] || STAFF_TIERS.newbie;
}

export function getDailySalary(staff) {
  return staff.filter(s => s.active).reduce((sum, s) => sum + getMemberDailySalary(s), 0);
}

/** Single-seat day pay (tier + tenure multipliers). */
export function getMemberDailySalary(member) {
  if (!member) return 0;
  const role = STAFF_ROLES[member.roleId];
  const tierMult = member.tier === 'expert' ? 1.25 : member.tier === 'veteran' ? 1.1 : 1;
  return Math.round((role?.salary || 0) * tierMult * staffTenurePayMult(member));
}

/** One-time hire cash sunk into the current roster (catalog hireCost × headcount). */
export function getHireSunk(staff) {
  return (staff || []).reduce((sum, s) => sum + (STAFF_ROLES[s.roleId]?.hireCost || 0), 0);
}

/** Amortize hire sunk over this many game days for Overview burn. */
export const STAFF_HIRE_AMORT_DAYS = 30;

export function getStaffCoverage(state) {
  const staff = (state?.staff || []).filter((s) => s.active);
  const max = getMaxStaff(state);
  const buyRequired = Math.max(2, Math.ceil(max * 0.5));
  const sellRequired = Math.max(2, Math.ceil(max * 0.4));
  const buyActive = staff.filter((s) => STAFF_BUY_LANES.has(STAFF_ROLES[s.roleId]?.lane)).length;
  const sellActive = staff.filter((s) => STAFF_SELL_LANES.has(STAFF_ROLES[s.roleId]?.lane)).length;
  const pct = (active, required) =>
    required <= 0 ? 0 : Math.min(100, Math.round((100 * active) / required));
  return {
    buy: { active: buyActive, required: buyRequired, pct: pct(buyActive, buyRequired) },
    sell: { active: sellActive, required: sellRequired, pct: pct(sellActive, sellRequired) },
  };
}

/**
 * Next hire recommendation for Overview — prefer filling sell gap, then buy, then ops.
 * @returns {{ roleId: string, reason: string, impact: string } | null}
 */
export function getNextHireRecommendation(state) {
  const coverage = getStaffCoverage(state);
  const staff = state?.staff || [];
  const hasHr = state?.perks?.includes('hrDept');
  if (!hasHr) {
    return {
      roleId: 'intern',
      reason: 'HR Department locked',
      impact: 'Unlock HR in Perks, then hire your first seat.',
    };
  }

  const candidates = [
    {
      when: coverage.sell.active === 0,
      roleId: 'exitSpec',
      reason: 'No seller on desk.',
      impact: 'Improve sell coverage to at least 50%.',
    },
    {
      when: coverage.sell.pct < 50,
      roleId: 'risk',
      reason: 'Sell coverage below 50%.',
      impact: `Raise sell coverage toward ${coverage.sell.required} seats.`,
    },
    {
      when: coverage.buy.active === 0,
      roleId: 'scout',
      reason: 'No buyer on desk.',
      impact: 'Open a buy lane so the firm can enter names.',
    },
    {
      when: coverage.buy.pct < 50,
      roleId: 'trader',
      reason: 'Buy coverage below 50%.',
      impact: `Raise buy coverage toward ${coverage.buy.required} seats.`,
    },
    {
      when: !staff.some((s) => s.roleId === 'compliance'),
      roleId: 'compliance',
      reason: 'No compliance seat.',
      impact: 'Lower desk mistake rate while staff act.',
    },
  ];

  for (const c of candidates) {
    if (c.when) return { roleId: c.roleId, reason: c.reason, impact: c.impact };
  }

  const open = Object.values(STAFF_ROLES).find((role) => {
    const missing = (role.requires || []).filter((r) => r !== 'hrDept' && !state.perks?.includes(r));
    return missing.length === 0;
  });
  if (open) {
    return {
      roleId: open.id,
      reason: 'Desk balanced.',
      impact: `Optional deepen with ${open.name}.`,
    };
  }
  return null;
}

export function payDailySalaries(state) {
  const gross = getDailySalary(state.staff);
  if (gross <= 0) return 0;
  let cost = gross;
  let subsidy = 0;
  if (state.perks?.includes('hedgeFund')) {
    subsidy = Math.floor(gross * 0.5);
  }
  // Legend Desk stacks +10% payroll subsidy on top of Hedge Fund (60% total when both).
  if (state.perks?.includes('legendDesk')) {
    subsidy = Math.min(gross, subsidy + Math.floor(gross * 0.1));
  }
  cost = gross - subsidy;
  if (cost > 0 && state.portfolio.cash >= cost) {
    state.portfolio.cash -= cost;
    const msg = subsidy > 0
      ? `Payroll: -$${cost.toLocaleString()} (desk covered $${subsidy.toLocaleString()})`
      : `Payroll: -$${cost.toLocaleString()} (${state.staff.length} staff)`;
    state.staffLog?.unshift({ time: Date.now(), msg });
    return cost;
  }
  if (subsidy > 0 && cost === 0) {
    state.staffLog?.unshift({ time: Date.now(), msg: `Payroll fully covered by desk status ($${subsidy.toLocaleString()})` });
  }
  return 0;
}

export function renameStaff(staffId, newName, state) {
  const m = state.staff.find(s => s.id === staffId);
  if (!m) return { ok: false, msg: 'Not found' };
  const name = (newName || '').trim().replace(/[<>&"']/g, '').slice(0, 24);
  if (name.length < 2) return { ok: false, msg: 'Name too short' };
  m.name = name;
  return { ok: true };
}

export function canTrain(staffId, state) {
  const m = state.staff.find(s => s.id === staffId);
  if (!m) return { ok: false, msg: 'Not found' };
  const tier = getTier(m);
  if (!tier.next) return { ok: false, msg: 'Already Expert (MAX)' };
  if (state.portfolio.cash < tier.trainCost) {
    return { ok: false, msg: `Need $${tier.trainCost.toLocaleString()}`, cost: tier.trainCost };
  }
  return { ok: true, cost: tier.trainCost, next: tier.next, from: tier.name };
}

export function trainStaff(staffId, state) {
  const check = canTrain(staffId, state);
  if (!check.ok) return check;
  const m = state.staff.find(s => s.id === staffId);
  const tier = getTier(m);
  state.portfolio.cash -= tier.trainCost;
  m.tier = tier.next;
  state.stats = state.stats || {};
  if (m.tier === 'veteran') state.stats.trainedVeteran = (state.stats.trainedVeteran || 0) + 1;
  if (m.tier === 'expert') state.stats.trainedExpert = (state.stats.trainedExpert || 0) + 1;
  state.staffLog?.unshift({
    time: Date.now(),
    staff: m.name,
    action: `Trained to ${STAFF_TIERS[m.tier].name} (−$${tier.trainCost.toLocaleString()})`,
  });
  return { ok: true, member: m, tier: m.tier };
}

function maybeMistake(member, state, actions, mistakeScale = 1) {
  const tier = getTier(member);
  const rate = Math.max(0.01, tier.mistakeRate * mistakeScale * staffTenureMistakeScale(member));
  if (Math.random() > rate) return false;
  const loss = 5 + Math.floor(Math.random() * 25);
  if (state.portfolio.cash < loss) return false;
  state.portfolio.cash -= loss;
  member.mistakes = (member.mistakes || 0) + 1;
  member.profitGenerated = (member.profitGenerated || 0) - loss;
  member.status = 'Mistake!';
  actions.push({
    staff: member.name,
    action: `Blunder −$${loss} (${getTier(member).name} error)`,
  });
  state.stats = state.stats || {};
  state.stats.staffMistakes = (state.stats.staffMistakes || 0) + 1;
  return true;
}

export function staffWinRate(member) {
  const closed = (member.wins || 0) + (member.losses || 0);
  return closed ? (member.wins || 0) / closed : null;
}

export function staffEfficiencyMultiplier(member) {
  const wr = staffWinRate(member);
  if (wr == null) return 1;
  if (wr < 0.35) return 0.88;
  if (wr > 0.6) return Math.min(1.12, 1 + (wr - 0.55) * 0.25);
  return 1;
}

function recordStaffPnl(member, pnl) {
  member.tradesClosed = (member.tradesClosed || 0) + 1;
  if (pnl >= 0) member.wins = (member.wins || 0) + 1;
  else member.losses = (member.losses || 0) + 1;
  member.profitGenerated = (member.profitGenerated || 0) + pnl;
}

/** Staff automation — called each market tick */
export function tickStaff(state) {
  if (!state.staff?.length) return [];
  const actions = [];
  const perks = state.perks;
  const pf = state.portfolio;
  const hasMargin = perks.includes('margin');
  const hasAi = perks.includes('aiAdvisor');
  const hasPartner = state.staff.some(s => s.roleId === 'partner' && s.active);
  const hasCompliance = state.staff.some(s => s.roleId === 'compliance' && s.active);
  const researchStaff = state.staff.filter(s => s.roleId === 'research' && s.active);
  const researchBoost = researchStaff.length
    ? 1 + researchStaff.reduce((sum, s) => sum + getTier(s).efficiency * 0.12, 0)
    : 1;
  const partnerBoost = hasPartner ? 1.4 : 1;
  const floorBoost = perks.includes('tradingFloor') ? 1.25 : 1;
  let mistakeScale = hasCompliance ? 0.55 : 1;
  if (perks.includes('complianceSuite')) mistakeScale *= 0.6;
  state.researchBoost = researchBoost;

  for (const member of state.staff) {
    if (!member.active) continue;
    const role = STAFF_ROLES[member.roleId];
    if (!role) continue;
    const tier = getTier(member);
    const eff = tier.efficiency
      * partnerBoost
      * staffEfficiencyMultiplier(member)
      * floorBoost
      * staffTenureEfficiencyBoost(member);
    const actMult = staffActionChanceMult(member);
    const authPct = staffAuthorityPct(member, role);

    member.progress = Math.min(
      100,
      (member.progress || 0) + (8 + Math.random() * 12 * eff) * staffProgressGainMult(member),
    );
    if (member.progress < 100) {
      member.status = member.status?.startsWith('Mistake')
        ? member.status
        : (member.autopilot ? 'Autopilot…' : 'Working…');
      continue;
    }
    member.progress = 0;

    // Compliance officers don't blunder into cash losses — they audit instead
    if (member.roleId !== 'compliance' && maybeMistake(member, state, actions, mistakeScale)) {
      member.actionsToday++;
      continue;
    }

    switch (member.roleId) {
      case 'scout':
        if (Math.random() < 0.55 * eff * researchBoost * actMult) {
          const convFloor = staffConvictionFloor(member);
          const deal = state.listings?.find((l) => {
            if (!l?.isDeal || pf.longs[l.sym]) return false;
            return listingConviction(l) >= convFloor;
          });
          if (deal) {
            const shares = staffMaxBuyShares(pf, deal.sym, deal.price, {
              maxPct: authPct ?? role.maxPositionPct ?? STAFF_DEFAULT_MAX_POSITION_PCT,
              hardCapShares: staffHardCapShares(member, 12),
            });
            if (shares >= 1) {
              const conv = listingConviction(deal);
              const r = buyLong(pf, deal.sym, shares, staffFill(deal.sym, 'buy', shares, deal.price, perks));
              if (r.ok) {
                member.status = `Sniping ${deal.sym}`;
                actions.push({
                  staff: member.name,
                  action: `Sniped ${shares} ${deal.sym} @ $${deal.price.toFixed(2)} (conviction ${conv})`,
                });
                member.actionsToday++;
              }
            } else {
              member.status = 'Sized out — waiting';
            }
          } else {
            member.status = 'Scouting listings';
          }
        }
        break;

      case 'compliance': {
        let flagged = false;
        Object.entries(pf.longs).forEach(([sym, pos]) => {
          if (flagged) return;
          const q = getCachedQuote(sym);
          if (!q) return;
          const pct = (q.price - pos.avgPrice) / pos.avgPrice;
          if (pct <= -0.05) {
            member.status = `Flagged ${sym}`;
            actions.push({
              staff: member.name,
              action: `Risk flag: ${sym} ${(pct * 100).toFixed(1)}% vs cost — review stop`,
            });
            member.actionsToday++;
            flagged = true;
          }
        });
        if (!flagged && Math.random() < 0.4 * eff) {
          member.status = 'Audit complete';
          actions.push({
            staff: member.name,
            action: hasCompliance
              ? 'Desk audit passed — mistake rate suppressed'
              : 'Desk audit passed',
          });
          member.actionsToday++;
        } else if (!flagged) {
          member.status = 'Monitoring compliance';
        }
        break;
      }

      case 'research':
        if (Math.random() < 0.5 * eff * actMult) {
          const near = state.listings?.find(l =>
            !l.isDeal && !l.isMarket && l.trueValue > 0
            && (l.trueValue - l.price) / l.trueValue > 0.03
            && !pf.longs[l.sym]);
          if (near) {
            near.isDeal = true;
            near.researchFlag = true;
            member.status = `Insight ${near.sym}`;
            actions.push({
              staff: member.name,
              action: `Research upgrade: ${near.sym} marked GREAT DEAL`,
            });
            member.actionsToday++;
          } else if (state.aiTopPick?.sym) {
            member.status = `Covering ${state.aiTopPick.sym}`;
            actions.push({
              staff: member.name,
              action: `Research note on ${state.aiTopPick.sym} (${state.aiTopPick.signal || 'HOLD'})`,
            });
            member.actionsToday++;
          } else {
            member.status = 'Screening names';
          }
        } else {
          member.status = 'Building thesis';
        }
        break;

      case 'trader': {
        const pick = state.aiTopPick;
        const conf = Number(pick?.confidence) || 0;
        const confFloor = staffAiConfidenceFloor(member);
        if (
          hasAi
          && Math.random() < 0.4 * eff * researchBoost * actMult
          && pick?.signal === 'BUY'
          && conf >= confFloor
        ) {
          const sym = pick.sym;
          const q = getCachedQuote(sym);
          if (q && !pf.longs[sym]) {
            const shares = staffMaxBuyShares(pf, sym, q.price, {
              maxPct: authPct ?? role.maxPositionPct ?? STAFF_DEFAULT_MAX_POSITION_PCT,
              hardCapShares: staffHardCapShares(member, 8),
            });
            if (shares >= 1) {
              const r = buyLong(pf, sym, shares, staffFill(sym, 'buy', shares, q.price, perks));
              if (r.ok) {
                member.status = `Buying ${sym}`;
                actions.push({
                  staff: member.name,
                  action: `Bought ${shares} ${sym} (AI ${conf}% · under size cap)`,
                });
                member.actionsToday++;
              }
            } else {
              member.status = 'Sized out on AI pick';
            }
          }
        } else if (hasAi && pick?.signal === 'BUY' && conf < confFloor) {
          member.status = `Waiting — AI ${conf}% < ${confFloor}`;
        } else {
          member.status = hasAi ? 'Watching AI signals' : 'Idle — needs AI Advisor';
        }
        break;
      }

      case 'risk': {
        let acted = false;
        Object.entries(pf.longs).forEach(([sym, pos]) => {
          if (acted) return;
          const q = getCachedQuote(sym);
          if (!q) return;
          const pct = (q.price - pos.avgPrice) / pos.avgPrice;
          if (pct >= 0.12 || pct <= -0.07) {
            const r = sellLong(pf, sym, pos.shares, staffFill(sym, 'sell', pos.shares, q.price, perks));
            if (r.ok) {
              const pl = r.pnl ?? (q.price - pos.avgPrice) * pos.shares;
              recordStaffPnl(member, pl);
              member.status = pct >= 0 ? 'Taking profit' : 'Stop loss';
              actions.push({ staff: member.name, action: `Sold ${sym} ${pct >= 0 ? 'take profit' : 'stop loss'} (${(pct * 100).toFixed(1)}%)` });
              member.actionsToday++;
              acted = true;
            }
          }
        });
        if (!acted) member.status = 'Monitoring risk';
        break;
      }

      case 'exitSpec': {
        let acted = false;
        Object.entries(pf.longs).forEach(([sym, pos]) => {
          if (acted) return;
          const q = getCachedQuote(sym);
          if (!q || !(pos.shares >= 2)) return;
          const pct = (q.price - pos.avgPrice) / pos.avgPrice;
          const trim = pct >= 0.08 || pct <= -0.05;
          if (!trim) return;
          const sellShares = Math.max(1, Math.floor(pos.shares / 2));
          const r = sellLong(pf, sym, sellShares, staffFill(sym, 'sell', sellShares, q.price, perks));
          if (r.ok) {
            const pl = r.pnl ?? (q.price - pos.avgPrice) * sellShares;
            recordStaffPnl(member, pl);
            member.status = pct >= 0 ? `Trim ${sym}` : `Cut ${sym}`;
            actions.push({
              staff: member.name,
              action: `${pct >= 0 ? 'Trimmed' : 'Cut'} ${sellShares} ${sym} @ ${(pct * 100).toFixed(1)}% (exit desk)`,
            });
            member.actionsToday++;
            acted = true;
          }
        });
        if (!acted) member.status = 'Managing exits';
        break;
      }

      case 'shortSpec':
        if (hasMargin && Math.random() < 0.45 * eff * actMult) {
          const candidates = ['TSLA', 'NVDA', 'AMD', 'COIN', 'PLTR', 'SOFI'].filter(s => {
            const q = getCachedQuote(s);
            return q && q.changePct > 3 && !pf.shorts[s] && !pf.longs[s];
          });
          if (candidates.length) {
            const sym = candidates[Math.floor(Math.random() * candidates.length)];
            const q = getCachedQuote(sym);
            const shares = staffMaxBuyShares(pf, sym, q.price, {
              maxPct: authPct ?? role.maxPositionPct ?? 0.03,
              hardCapShares: staffHardCapShares(member, 5),
            });
            if (shares >= 1) {
              const r = openShort(pf, sym, shares, staffFill(sym, 'short', shares, q.price, perks), true);
              if (r.ok) {
                state.stats = state.stats || {};
                state.stats.shortsOpened = (state.stats.shortsOpened || 0) + 1;
                member.status = `Shorting ${sym}`;
                actions.push({ staff: member.name, action: `Shorted ${shares} ${sym} (overbought · sized)` });
                member.actionsToday++;
              }
            } else member.status = 'Sized out on shorts';
          } else member.status = 'Hunting shorts';
        } else member.status = hasMargin ? 'On short desk' : 'Idle — needs Margin';
        break;

      case 'quant':
        if (hasMargin && Math.random() < 0.5 * eff * actMult) {
          let acted = false;
          Object.entries(pf.shorts).forEach(([sym, pos]) => {
            if (acted) return;
            const q = getCachedQuote(sym);
            if (!q) return;
            const pct = (pos.avgPrice - q.price) / pos.avgPrice;
            if (pct <= -0.06) {
              const r = coverShort(pf, sym, pos.shares, staffFill(sym, 'cover', pos.shares, q.price, perks));
              if (r.ok) {
                recordStaffPnl(member, r.pnl ?? 0);
                member.status = `Covering ${sym}`;
                actions.push({ staff: member.name, action: `Covered ${sym} (algo stop)` });
                member.actionsToday++;
                acted = true;
              }
            }
          });
          if (!acted) {
            const breakout = ['NVDA', 'AAPL', 'MSFT', 'META'].find(s => {
              const q = getCachedQuote(s);
              return q && q.changePct > 1.5 && q.changePct <= 5 && !pf.longs[s] && pf.cash > q.price * 3;
            });
            if (breakout) {
              const q = getCachedQuote(breakout);
              const shares = staffMaxBuyShares(pf, breakout, q.price, {
                maxPct: authPct ?? role.maxPositionPct ?? STAFF_DEFAULT_MAX_POSITION_PCT,
                hardCapShares: staffHardCapShares(member, 4),
              });
              if (shares >= 1) {
                const r = buyLong(pf, breakout, shares, staffFill(breakout, 'buy', shares, q.price, perks));
                if (r.ok) {
                  member.status = `Momentum ${breakout}`;
                  actions.push({ staff: member.name, action: `Momentum buy ${shares} ${breakout} (size-capped)` });
                  member.actionsToday++;
                  acted = true;
                }
              }
            }
          }
          if (!acted) member.status = 'Running algos';
        } else member.status = 'Quant idle';
        break;

      case 'intern':
        if (Math.random() < 0.35 * eff * actMult) {
          member.status = 'Refreshing desk';
          actions.push({ staff: member.name, action: 'Refreshed market listings' });
          member.actionsToday++;
        } else member.status = 'Filing reports';
        break;

      case 'partner':
        if (Math.random() < 0.25 * eff * actMult) {
          const bonus = 15 + Math.floor(Math.random() * 40);
          state.portfolio.cash += bonus;
          member.profitGenerated = (member.profitGenerated || 0) + bonus;
          member.status = 'Closing deals';
          actions.push({ staff: member.name, action: `Firm bonus +$${bonus}` });
          member.actionsToday++;
        } else member.status = 'Leading the floor';
        break;
    }
  }

  if (actions.length) {
    state.staffLog = state.staffLog || [];
    actions.forEach(a => {
      state.staffLog.unshift({ time: Date.now(), ...a });
      const member = state.staff.find(s => s.name === a.staff);
      if (member) {
        member.history = member.history || [];
        member.history.unshift({ time: Date.now(), action: a.action });
        if (member.history.length > 25) member.history.length = 25;
      }
    });
    if (state.staffLog.length > 40) state.staffLog.length = 40;
  }
  return actions;
}

export function canHire(roleId, state) {
  const role = STAFF_ROLES[roleId];
  if (!role) return { ok: false, msg: 'Unknown role' };
  const staff = state.staff || [];
  if (!state.perks.includes('hrDept')) return { ok: false, msg: 'Unlock HR Department perk first' };
  if (staff.length >= getMaxStaff(state)) return { ok: false, msg: `Team full (${getMaxStaff(state)} cap)` };
  const missing = (role.requires || []).filter(r => r !== 'hrDept' && !state.perks.includes(r));
  if (missing.length) {
    return { ok: false, msg: `Needs: ${formatPerkReqs(missing)}` };
  }
  if (state.portfolio.cash < role.hireCost) return { ok: false, msg: 'Not enough cash' };
  return { ok: true };
}

export function hireStaff(roleId, state) {
  const check = canHire(roleId, state);
  if (!check.ok) return check;
  const role = STAFF_ROLES[roleId];
  state.portfolio.cash -= role.hireCost;
  const member = createStaffMember(roleId);
  state.staff.push(member);
  state.stats = state.stats || {};
  state.stats.hires = (state.stats.hires || 0) + 1;
  return { ok: true, member };
}

export function fireStaff(staffId, state) {
  const m = state.staff.find(s => s.id === staffId);
  state.staff = state.staff.filter(s => s.id !== staffId);
  state.stats = state.stats || {};
  state.stats.fires = (state.stats.fires || 0) + 1;
  if (m) {
    const severance = getMemberDailySalary(m);
    const paid = Math.min(Math.max(0, Number(state.portfolio?.cash) || 0), severance);
    if (paid > 0 && state.portfolio) state.portfolio.cash -= paid;
    const sevNote = paid > 0 ? ` · $${paid.toLocaleString()} severance` : '';
    state.staffLog?.unshift({
      time: Date.now(),
      staff: 'HR',
      action: `Fired ${m.name}${sevNote}`,
    });
  }
  return { ok: true, severance: m ? getMemberDailySalary(m) : 0 };
}
