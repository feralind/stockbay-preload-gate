// @ts-check
/** Financing — personal & company loans scaled for $500 home-desk start */

import { macroAprAdjustment } from './macro.js';
import { VAULT_COLLATERAL_LTV } from './vault.js';

/**
 * Ambient card glow — `glow` is the bank's primary brand color (also drives the left
 * accent stripe + logo chip via `color`), `glow2` is a secondary brand tone blended in
 * for a two-tone corner light so each lender's card reads as distinct/premium instead
 * of a flat single-hue wash. Falls back to `color`/`glow` when a bank has no secondary.
 */
export const BANKS = [
  {
    id: 'chase',
    name: 'Chase Capital',
    short: 'Chase',
    domain: 'chase.com',
    category: 'National banks',
    color: '#117ACA',
    glow: '#117ACA',
    glow2: '#0A3161',
    personalApr: 11.99,
    companyApr: 8.49,
    maxPersonal: 2500,
    maxCompany: 12000,
    minCredit: 580,
    minPersonalCredit: 580,
    minCompanyCredit: 600,
    desc: 'Big-bank reliability. Competitive business rates.',
  },
  {
    id: 'boa',
    name: 'Bank of America Lending',
    short: 'BofA',
    domain: 'bankofamerica.com',
    category: 'National banks',
    color: '#E31837',
    glow: '#E31837',
    glow2: '#012169',
    personalApr: 12.49,
    companyApr: 8.99,
    maxPersonal: 2000,
    maxCompany: 10000,
    minCredit: 600,
    minPersonalCredit: 600,
    minCompanyCredit: 620,
    desc: 'Solid personal loans. Stricter credit floor.',
  },
  {
    id: 'wells',
    name: 'Wells Fargo Business',
    short: 'Wells',
    domain: 'wellsfargo.com',
    category: 'National banks',
    color: '#D71E28',
    glow: '#D71E28',
    glow2: '#FFC72C',
    personalApr: 13.25,
    companyApr: 7.99,
    maxPersonal: 1800,
    maxCompany: 15000,
    minCredit: 620,
    minPersonalCredit: 620,
    minCompanyCredit: 645,
    desc: 'Best company APR. Higher personal rates.',
  },
  {
    id: 'citi',
    name: 'Citi Flex Credit',
    short: 'Citi',
    domain: 'citi.com',
    category: 'National banks',
    color: '#003B70',
    glow: '#003B70',
    glow2: '#E32219',
    personalApr: 10.99,
    companyApr: 9.25,
    maxPersonal: 3000,
    maxCompany: 8000,
    minCredit: 640,
    minPersonalCredit: 640,
    minCompanyCredit: 660,
    desc: 'Lowest personal APR if your score is strong.',
  },
  {
    id: 'capitalone',
    name: 'Capital One Spark',
    short: 'CapOne',
    domain: 'capitalone.com',
    category: 'National banks',
    color: '#D03027',
    glow: '#D03027',
    glow2: '#003057',
    personalApr: 14.99,
    companyApr: 10.49,
    maxPersonal: 1200,
    maxCompany: 5000,
    minCredit: 560,
    minPersonalCredit: 560,
    minCompanyCredit: 575,
    desc: 'Easier approval for thinner credit files.',
  },
  {
    id: 'usbank',
    name: 'U.S. Bank Business',
    short: 'USB',
    domain: 'usbank.com',
    category: 'National banks',
    color: '#0C2074',
    glow: '#0C2074',
    glow2: '#C8102E',
    personalApr: 12.75,
    companyApr: 8.75,
    maxPersonal: 2200,
    maxCompany: 11000,
    minCredit: 600,
    minPersonalCredit: 600,
    minCompanyCredit: 625,
    desc: 'Midwest reliability. Balanced personal and business lines.',
  },
  {
    id: 'pnc',
    name: 'PNC Business Credit',
    short: 'PNC',
    domain: 'pnc.com',
    category: 'National banks',
    color: '#F58025',
    glow: '#F58025',
    glow2: '#1E3A5F',
    personalApr: 13.49,
    companyApr: 8.25,
    maxPersonal: 1900,
    maxCompany: 13000,
    minCredit: 610,
    minPersonalCredit: 610,
    minCompanyCredit: 635,
    desc: 'Strong business facilities. Personal desk is pricier.',
  },
  {
    id: 'td',
    name: 'TD Bank Ready Credit',
    short: 'TD',
    domain: 'td.com',
    category: 'National banks',
    color: '#34A853',
    glow: '#34A853',
    glow2: '#1A1A1A',
    personalApr: 12.99,
    companyApr: 9.15,
    maxPersonal: 2100,
    maxCompany: 9000,
    minCredit: 605,
    minPersonalCredit: 605,
    minCompanyCredit: 630,
    desc: 'Convenient branch network. Fair-to-Good credit welcome.',
  },
  {
    id: 'sofi',
    name: 'SoFi Personal Loans',
    short: 'SoFi',
    domain: 'sofi.com',
    category: 'Online lenders',
    color: '#0090FF',
    glow: '#0090FF',
    glow2: '#22D3EE',
    personalApr: 9.99,
    companyApr: 11.25,
    maxPersonal: 3500,
    maxCompany: 6000,
    minCredit: 680,
    minPersonalCredit: 680,
    minCompanyCredit: 700,
    desc: 'Fintech-fast funding. Best rates need excellent credit.',
  },
  {
    id: 'ally',
    name: 'Ally Lending',
    short: 'Ally',
    domain: 'ally.com',
    category: 'Online lenders',
    color: '#7700FF',
    glow: '#7700FF',
    glow2: '#00A862',
    personalApr: 10.49,
    companyApr: 10.75,
    maxPersonal: 2800,
    maxCompany: 5500,
    minCredit: 660,
    minPersonalCredit: 660,
    minCompanyCredit: 680,
    desc: 'Digital bank rates. Solid personal desk for Good credit.',
  },
  {
    id: 'marcus',
    name: 'Marcus by Goldman Sachs',
    short: 'Marcus',
    domain: 'marcus.com',
    category: 'Online lenders',
    color: '#7399C6',
    glow: '#7399C6',
    glow2: '#1E1E1E',
    personalApr: 10.25,
    companyApr: 11.49,
    maxPersonal: 3200,
    maxCompany: 4500,
    minCredit: 670,
    minPersonalCredit: 670,
    minCompanyCredit: 695,
    desc: 'No-fee personal focus. Company desk stays selective.',
  },
  {
    id: 'lightstream',
    name: 'LightStream',
    short: 'Light',
    domain: 'lightstream.com',
    category: 'Online lenders',
    color: '#00A3E0',
    glow: '#00A3E0',
    glow2: '#003A70',
    personalApr: 9.75,
    companyApr: 10.99,
    maxPersonal: 3000,
    maxCompany: 5000,
    minCredit: 675,
    minPersonalCredit: 675,
    minCompanyCredit: 700,
    desc: 'Truist-backed online loans. Autopay discount vibe.',
  },
  {
    id: 'lendingclub',
    name: 'LendingClub',
    short: 'LC',
    domain: 'lendingclub.com',
    category: 'Online lenders',
    color: '#3D8B40',
    glow: '#3D8B40',
    glow2: '#1B4332',
    personalApr: 13.99,
    companyApr: 12.25,
    maxPersonal: 1600,
    maxCompany: 4500,
    minCredit: 570,
    minPersonalCredit: 570,
    minCompanyCredit: 590,
    desc: 'Marketplace lender. Easier entry, pricier APR.',
  },
  {
    id: 'local',
    name: 'Navy Federal Credit Union',
    short: 'NFCU',
    domain: 'navyfederal.org',
    category: 'Credit unions',
    color: '#003057',
    glow: '#003057',
    glow2: '#FFB81C',
    personalApr: 9.49,
    companyApr: 7.25,
    maxPersonal: 1500,
    maxCompany: 4000,
    minCredit: 650,
    minPersonalCredit: 650,
    minCompanyCredit: 670,
    desc: 'Member-first rates. Needs good credit.',
  },
  {
    id: 'premieramerica',
    name: 'Premier America Credit Union',
    short: 'PACU',
    domain: 'premieramerica.com',
    category: 'Credit unions',
    color: '#0055A5',
    glow: '#0055A5',
    glow2: '#F15A29',
    personalApr: 9.25,
    companyApr: 7.49,
    maxPersonal: 1600,
    maxCompany: 4200,
    minCredit: 655,
    minPersonalCredit: 655,
    minCompanyCredit: 675,
    desc: 'SoCal credit union. Sharp personal rates for members.',
  },
  {
    id: 'penfed',
    name: 'PenFed Credit Union',
    short: 'PenFed',
    domain: 'penfed.org',
    category: 'Credit unions',
    color: '#002855',
    glow: '#002855',
    glow2: '#C8102E',
    personalApr: 9.75,
    companyApr: 7.75,
    maxPersonal: 1700,
    maxCompany: 4800,
    minCredit: 660,
    minPersonalCredit: 660,
    minCompanyCredit: 680,
    desc: 'Nationwide CU. Competitive auto-style personal APR.',
  },
  {
    id: 'alliant',
    name: 'Alliant Credit Union',
    short: 'Alliant',
    domain: 'alliantcreditunion.com',
    category: 'Credit unions',
    color: '#00A3E0',
    glow: '#00A3E0',
    glow2: '#003DA5',
    personalApr: 8.99,
    companyApr: 6.99,
    maxPersonal: 1400,
    maxCompany: 3800,
    minCredit: 670,
    minPersonalCredit: 670,
    minCompanyCredit: 690,
    desc: 'Low CU spreads. Smaller facilities — quality over size.',
  },
  {
    id: 'schoolsfirst',
    name: 'SchoolsFirst FCU',
    short: 'SFFCU',
    domain: 'schoolsfirstfcu.org',
    category: 'Credit unions',
    color: '#003366',
    glow: '#003366',
    glow2: '#FFCC00',
    personalApr: 9.15,
    companyApr: 7.35,
    maxPersonal: 1500,
    maxCompany: 3600,
    minCredit: 665,
    minPersonalCredit: 665,
    minCompanyCredit: 685,
    desc: 'Educator-rooted CU. Steady rates, membership vibe.',
  },
];

/**
 * Split approval floors: banks read personal and company files separately
 * (company underwriting runs slightly stricter, like real B2B lending).
 * Falls back to legacy `minCredit` for any bank without split fields.
 * @param {object} bank
 * @param {'personal'|'company'} type
 */
export function bankMinCredit(bank, type) {
  if (!bank) return 0;
  const split = type === 'personal' ? bank.minPersonalCredit : bank.minCompanyCredit;
  return Number.isFinite(Number(split)) ? Number(split) : (Number(bank.minCredit) || 0);
}

/**
 * Hold rule: positive credit from voluntary repay only after the loan has
 * accrued interest through at least one game day-end (interestTicks >= 1).
 * Same-morning borrow→repay never builds score.
 */
export const MIN_INTEREST_TICKS_FOR_CREDIT = 1;

/** Soft daily caps — easy to hurt credit, slower to rebuild. */
export const DAILY_CREDIT_GAIN_CAP = { personal: 14, business: 12 };

/** Partial repay must be at least this share of balance to earn credit. */
export const MIN_PARTIAL_CREDIT_PCT = 0.1;
export const MIN_PARTIAL_CREDIT_ABS = 25;

/** Credit-tier APR / limit multipliers (FICO-style bands). */
export const APR_CREDIT_TIERS = [
  { min: 800, aprAdj: -2.5, limitMult: 1.35, label: 'Exceptional' },
  { min: 740, aprAdj: -1.5, limitMult: 1.2, label: 'Very Good' },
  { min: 670, aprAdj: -0.5, limitMult: 1.0, label: 'Good' },
  { min: 580, aprAdj: 1.5, limitMult: 0.75, label: 'Fair' },
  { min: 0, aprAdj: 3.5, limitMult: 0.5, label: 'Poor' },
];

export function createFinanceState() {
  return {
    // Day-1 thin file: Fair personal / Fair+ new-firm business — license credit
    // gates sit in Good+ so Series 7 / Reg D never light up green on a fresh desk.
    personalCredit: 600,
    businessCredit: 630,
    loans: [],
    paymentHistory: [],
    totalBorrowed: 0,
    totalRepaid: 0,
    latePayments: 0,
    onTimePayments: 0,
    /** Game day of the most recent late auto-payment (null = never late). */
    lastLateDay: null,
    firstCreditDay: null,
    typesUsed: { personal: false, business: false },
    recentBorrowDays: [],
    creditGainDay: 0,
    creditGainsToday: { personal: 0, business: 0 },
    utilAdjDay: 0,
    reserveAdjDay: 0,
    /** @type {Record<string, { cycles: number, preferredSinceDay: number|null }>} */
    bankRelationships: {},
    /** Soft house lender id (earned; null until Preferred+ race settles). */
    houseBankId: null,
    /** @type {Record<string, { checking: number, savings: number, openedDay: number, lastLoyaltyDay: number|null, interestAccruedTotal: number, dayTransfer?: object }>} */
    bankAccounts: {},
    /** Game day stamp for ATM daily transfer caps. */
    bankTransferDay: 0,
  };
}

/** Relationship display tiers — soft loyalty, not exclusive lock-in. */
export const REL_TIER = {
  NONE: 0,
  KNOWN: 1,
  PREFERRED: 2,
  HOUSE: 3,
};

export const REL_TIER_LABEL = {
  0: '',
  1: 'Known',
  2: 'Preferred',
  3: 'House lender',
};

/** APR cut (pp) by relationship tier at that bank only. Replaces old loan-count kiss. */
export const REL_APR_EDGE = {
  0: 0,
  1: -0.25,
  2: -0.5,
  3: -0.75,
};

/** Limit boost vs that bank's bankMax only — never touches typeCreditLimit util denom. */
export const REL_LIMIT_EDGE = {
  0: 0,
  1: 0,
  2: 0.05,
  3: 0.1,
};

/** Mild surcharge when shopping a stranger bank while you already have a House. */
export const REL_STRANGER_APR_SURCHARGE = 0.15;

export function isCreditUnionBank(bank) {
  const cat = String(bank?.category || '');
  return cat === 'Credit unions' || cat === 'Credit union';
}

/** Short identity line for lender cards (category default if bank has no personality). */
export function bankPersonalityLine(bank) {
  if (!bank) return '';
  if (typeof bank.personality === 'string' && bank.personality.trim()) return bank.personality.trim();
  if (isCreditUnionBank(bank)) {
    return 'Member-first desk — loyalty advances faster here.';
  }
  if (String(bank.category || '').includes('Online')) {
    return 'Sharp personal rates once your file is strong; colder early.';
  }
  return 'Reliable national lines — steady company credit, mid personal.';
}

export function ensureBankRelationships(finance) {
  if (!finance.bankRelationships || typeof finance.bankRelationships !== 'object') {
    finance.bankRelationships = {};
  }
  return finance.bankRelationships;
}

/**
 * Sanitize loyalty fields on load. Unknown bank ids dropped; tiers derived from cycles.
 * @param {object} finance
 */
export function sanitizeBankRelationships(finance) {
  if (!finance || typeof finance !== 'object') return finance;
  const known = new Set(BANKS.map((b) => b.id));
  const raw = finance.bankRelationships && typeof finance.bankRelationships === 'object'
    ? finance.bankRelationships
    : {};
  /** @type {Record<string, { cycles: number, preferredSinceDay: number|null }>} */
  const clean = {};
  for (const [id, row] of Object.entries(raw)) {
    if (!known.has(id) || !row || typeof row !== 'object') continue;
    const cycles = Math.max(0, Math.min(99, Math.floor(Number(row.cycles) || 0)));
    const pref = Math.floor(Number(row.preferredSinceDay));
    clean[id] = {
      cycles,
      preferredSinceDay: Number.isFinite(pref) && pref >= 1 ? pref : (cycles >= 2 ? 1 : null),
    };
  }
  finance.bankRelationships = clean;
  recomputeHouseBank(finance);
  const house = finance.houseBankId;
  if (house && !known.has(house)) finance.houseBankId = null;
  sanitizeBankAccounts(finance);
  return finance;
}

/** Game trading days for savings APY day-rate (matches tax LT year). */
export const BANK_APY_YEAR_DAYS = 252;
/** Hard cap on savings APY (House CU still soft). */
export const SAVINGS_APY_CAP = 0.015;
/** Minimum savings balance to earn interest. */
export const SAVINGS_MIN_FOR_INTEREST = 50;
/** Combined deposits needed for a slow loyalty tick. */
export const DEPOSIT_LOYALTY_MIN = 250;
/** Days between deposit-loyalty awards at one bank. */
export const DEPOSIT_LOYALTY_INTERVAL_DAYS = 21;

/** Base annual savings APY by BANKS.category (game-scaled, not live HYSA). */
export const SAVINGS_BASE_APY_BY_CATEGORY = {
  'National banks': 0.004,
  'Online lenders': 0.007,
  'Credit unions': 0.009,
};

/** Additive APY bump by relationship tier at that bank. */
export const SAVINGS_LOYALTY_APY_BUMP = {
  0: 0,
  1: 0.0005,
  2: 0.0015,
  3: 0.003,
};

/** Soft daily ATM caps (desk↔checking moved, savings withdrawn) by loyalty tier. */
export const BANK_DAILY_CAPS = {
  checking: { 0: 2500, 1: 5000, 2: 15000, 3: 50000 },
  savingsWithdraw: { 0: 500, 1: 1000, 2: 3000, 3: 10000 },
};

/**
 * @param {object} finance
 */
export function ensureBankAccounts(finance) {
  if (!finance.bankAccounts || typeof finance.bankAccounts !== 'object') {
    finance.bankAccounts = {};
  }
  return finance.bankAccounts;
}

/**
 * Sanitize deposit ledgers on load.
 * @param {object} finance
 */
export function sanitizeBankAccounts(finance) {
  if (!finance || typeof finance !== 'object') return finance;
  const known = new Set(BANKS.map((b) => b.id));
  const raw = finance.bankAccounts && typeof finance.bankAccounts === 'object'
    ? finance.bankAccounts
    : {};
  /** @type {Record<string, object>} */
  const clean = {};
  for (const [id, row] of Object.entries(raw)) {
    if (!known.has(id) || !row || typeof row !== 'object') continue;
    const checking = Math.max(0, Math.round((Number(row.checking) || 0) * 100) / 100);
    const savings = Math.max(0, Math.round((Number(row.savings) || 0) * 100) / 100);
    if (checking <= 0 && savings <= 0 && !row.openedDay) continue;
    const opened = Math.max(1, Math.floor(Number(row.openedDay) || 1));
    const lastLoy = Math.floor(Number(row.lastLoyaltyDay));
    clean[id] = {
      checking,
      savings,
      openedDay: opened,
      lastLoyaltyDay: Number.isFinite(lastLoy) && lastLoy >= 1 ? lastLoy : null,
      interestAccruedTotal: Math.max(0, Math.round((Number(row.interestAccruedTotal) || 0) * 100) / 100),
    };
  }
  finance.bankAccounts = clean;
  finance.bankTransferDay = Math.max(0, Math.floor(Number(finance.bankTransferDay) || 0));
  return finance;
}

/**
 * @param {object} finance
 * @param {string} bankId
 */
export function getBankAccount(finance, bankId) {
  const id = String(bankId || '');
  const map = ensureBankAccounts(finance);
  const row = map[id];
  if (!row) {
    return {
      checking: 0,
      savings: 0,
      openedDay: null,
      lastLoyaltyDay: null,
      interestAccruedTotal: 0,
      open: false,
    };
  }
  return {
    checking: Math.max(0, Number(row.checking) || 0),
    savings: Math.max(0, Number(row.savings) || 0),
    openedDay: row.openedDay == null ? null : Number(row.openedDay),
    lastLoyaltyDay: row.lastLoyaltyDay == null ? null : Number(row.lastLoyaltyDay),
    interestAccruedTotal: Math.max(0, Number(row.interestAccruedTotal) || 0),
    open: true,
  };
}

/** Sum of all checking + savings across banks (firm NW, not BP). */
export function getTotalBankDeposits(finance) {
  if (!finance || typeof finance !== 'object') return 0;
  const map = ensureBankAccounts(finance);
  let total = 0;
  for (const row of Object.values(map)) {
    total += Math.max(0, Number(row?.checking) || 0);
    total += Math.max(0, Number(row?.savings) || 0);
  }
  return Math.round(total * 100) / 100;
}

/**
 * @param {object|string|null} bankOrCategory
 * @returns {number}
 */
export function savingsBaseApyForBank(bankOrCategory) {
  const cat = typeof bankOrCategory === 'string'
    ? bankOrCategory
    : String(bankOrCategory?.category || '');
  if (cat.includes('Credit union')) return SAVINGS_BASE_APY_BY_CATEGORY['Credit unions'];
  if (cat.includes('Online')) return SAVINGS_BASE_APY_BY_CATEGORY['Online lenders'];
  return SAVINGS_BASE_APY_BY_CATEGORY['National banks'];
}

/**
 * Current savings APY at a bank (base + loyalty, capped).
 * @param {object} finance
 * @param {string} bankId
 * @returns {number} annual fraction e.g. 0.012
 */
export function getSavingsApy(finance, bankId) {
  const bank = BANKS.find((b) => b.id === bankId);
  if (!bank) return 0;
  const tier = getBankRelationshipTier(finance, bankId);
  const bump = SAVINGS_LOYALTY_APY_BUMP[tier] ?? 0;
  const apy = savingsBaseApyForBank(bank) + bump;
  return Math.min(SAVINGS_APY_CAP, Math.max(0, apy));
}

function ensureBankTransferDay(finance, gameDay) {
  const day = Math.max(1, Math.floor(Number(gameDay) || 1));
  if (finance.bankTransferDay !== day) {
    finance.bankTransferDay = day;
    const map = ensureBankAccounts(finance);
    for (const row of Object.values(map)) {
      if (row && typeof row === 'object') {
        row.dayCheckingMoved = 0;
        row.daySavingsWithdrawn = 0;
      }
    }
  }
  return day;
}

function ensureOpenBankAccount(finance, bankId, gameDay) {
  const id = String(bankId || '');
  const map = ensureBankAccounts(finance);
  if (!map[id]) {
    map[id] = {
      checking: 0,
      savings: 0,
      openedDay: Math.max(1, Math.floor(Number(gameDay) || 1)),
      lastLoyaltyDay: null,
      interestAccruedTotal: 0,
      dayCheckingMoved: 0,
      daySavingsWithdrawn: 0,
    };
  }
  return map[id];
}

/**
 * Slow loyalty from holding deposits (same relationship store as loans).
 * @returns {{ awarded: boolean, tier: number, bankId: string|null }}
 */
export function maybeAwardDepositLoyalty(finance, bankId, gameDay = 1) {
  const id = String(bankId || '');
  if (!id || !BANKS.some((b) => b.id === id)) {
    return { awarded: false, tier: REL_TIER.NONE, bankId: null };
  }
  const acct = getBankAccount(finance, id);
  const bal = acct.checking + acct.savings;
  if (bal < DEPOSIT_LOYALTY_MIN) {
    return { awarded: false, tier: getBankRelationshipTier(finance, id), bankId: id };
  }
  const day = Math.max(1, Math.floor(Number(gameDay) || 1));
  const last = acct.lastLoyaltyDay == null ? 0 : acct.lastLoyaltyDay;
  if (last > 0 && day - last < DEPOSIT_LOYALTY_INTERVAL_DAYS) {
    return { awarded: false, tier: getBankRelationshipTier(finance, id), bankId: id };
  }
  const map = ensureBankAccounts(finance);
  const row = ensureOpenBankAccount(finance, id, day);
  const relMap = ensureBankRelationships(finance);
  const prev = getBankRelationship(finance, id);
  const nextCycles = prev.cycles + 1;
  const preferredSinceDay = nextCycles >= 2
    ? (prev.preferredSinceDay != null ? prev.preferredSinceDay : day)
    : null;
  relMap[id] = { cycles: nextCycles, preferredSinceDay };
  row.lastLoyaltyDay = day;
  map[id] = row;
  recomputeHouseBank(finance);
  return { awarded: true, tier: getBankRelationshipTier(finance, id), bankId: id };
}

/**
 * Desk → bank checking or savings.
 * @param {object} finance
 * @param {object} portfolio
 * @param {string} bankId
 * @param {'checking'|'savings'} bucket
 * @param {number} amount
 * @param {number} [gameDay]
 */
export function depositToBank(finance, portfolio, bankId, bucket, amount, gameDay = 1) {
  const id = String(bankId || '');
  if (!BANKS.some((b) => b.id === id)) return { ok: false, msg: 'Unknown bank' };
  const dest = bucket === 'savings' ? 'savings' : 'checking';
  const amt = Math.round((Number(amount) || 0) * 100) / 100;
  if (!(amt > 0)) return { ok: false, msg: 'Enter a deposit amount' };
  const cash = Math.max(0, Number(portfolio?.cash) || 0);
  if (cash < amt) return { ok: false, msg: 'Insufficient desk cash' };

  ensureBankTransferDay(finance, gameDay);
  const tier = getBankRelationshipTier(finance, id);
  const row = ensureOpenBankAccount(finance, id, gameDay);

  if (dest === 'checking') {
    const cap = BANK_DAILY_CAPS.checking[tier] ?? BANK_DAILY_CAPS.checking[0];
    const moved = Math.max(0, Number(row.dayCheckingMoved) || 0);
    if (moved + amt > cap + 0.001) {
      return { ok: false, msg: `Daily checking transfer cap $${cap.toLocaleString()} at this loyalty tier` };
    }
    row.dayCheckingMoved = Math.round((moved + amt) * 100) / 100;
  }

  portfolio.cash = cash - amt;
  row[dest] = Math.round(((Number(row[dest]) || 0) + amt) * 100) / 100;
  return {
    ok: true,
    bankId: id,
    bucket: dest,
    amount: amt,
    checking: row.checking,
    savings: row.savings,
    deskCash: portfolio.cash,
  };
}

/**
 * Bank → desk from checking or savings.
 * @param {object} finance
 * @param {object} portfolio
 * @param {string} bankId
 * @param {'checking'|'savings'} bucket
 * @param {number} amount
 * @param {number} [gameDay]
 */
export function withdrawFromBank(finance, portfolio, bankId, bucket, amount, gameDay = 1) {
  const id = String(bankId || '');
  if (!BANKS.some((b) => b.id === id)) return { ok: false, msg: 'Unknown bank' };
  const src = bucket === 'savings' ? 'savings' : 'checking';
  const amt = Math.round((Number(amount) || 0) * 100) / 100;
  if (!(amt > 0)) return { ok: false, msg: 'Enter a withdrawal amount' };

  ensureBankTransferDay(finance, gameDay);
  const tier = getBankRelationshipTier(finance, id);
  const map = ensureBankAccounts(finance);
  const row = map[id];
  if (!row) return { ok: false, msg: 'No account at this bank' };
  const bal = Math.max(0, Number(row[src]) || 0);
  if (bal < amt) return { ok: false, msg: `Insufficient ${src} balance` };

  if (src === 'checking') {
    const cap = BANK_DAILY_CAPS.checking[tier] ?? BANK_DAILY_CAPS.checking[0];
    const moved = Math.max(0, Number(row.dayCheckingMoved) || 0);
    if (moved + amt > cap + 0.001) {
      return { ok: false, msg: `Daily checking transfer cap $${cap.toLocaleString()} at this loyalty tier` };
    }
    row.dayCheckingMoved = Math.round((moved + amt) * 100) / 100;
  } else {
    const cap = BANK_DAILY_CAPS.savingsWithdraw[tier] ?? BANK_DAILY_CAPS.savingsWithdraw[0];
    const moved = Math.max(0, Number(row.daySavingsWithdrawn) || 0);
    if (moved + amt > cap + 0.001) {
      return { ok: false, msg: `Daily savings withdrawal cap $${cap.toLocaleString()} at this loyalty tier` };
    }
    row.daySavingsWithdrawn = Math.round((moved + amt) * 100) / 100;
  }

  row[src] = Math.round((bal - amt) * 100) / 100;
  portfolio.cash = (Number(portfolio.cash) || 0) + amt;
  return {
    ok: true,
    bankId: id,
    bucket: src,
    amount: amt,
    checking: row.checking,
    savings: row.savings,
    deskCash: portfolio.cash,
  };
}

/**
 * Move funds checking ↔ savings inside one bank (no desk, no tax).
 * @param {object} finance
 * @param {string} bankId
 * @param {'toSavings'|'toChecking'} direction
 * @param {number} amount
 */
export function transferBankInternal(finance, bankId, direction, amount) {
  const id = String(bankId || '');
  const map = ensureBankAccounts(finance);
  const row = map[id];
  if (!row) return { ok: false, msg: 'No account at this bank' };
  const amt = Math.round((Number(amount) || 0) * 100) / 100;
  if (!(amt > 0)) return { ok: false, msg: 'Enter an amount' };
  if (direction === 'toSavings') {
    if ((Number(row.checking) || 0) < amt) return { ok: false, msg: 'Insufficient checking' };
    row.checking = Math.round(((Number(row.checking) || 0) - amt) * 100) / 100;
    row.savings = Math.round(((Number(row.savings) || 0) + amt) * 100) / 100;
  } else {
    if ((Number(row.savings) || 0) < amt) return { ok: false, msg: 'Insufficient savings' };
    row.savings = Math.round(((Number(row.savings) || 0) - amt) * 100) / 100;
    row.checking = Math.round(((Number(row.checking) || 0) + amt) * 100) / 100;
  }
  return { ok: true, checking: row.checking, savings: row.savings, amount: amt };
}

/**
 * Day-end: credit savings interest + slow deposit loyalty.
 * Interest amount returned for Tax Day accrual by caller.
 * @param {object} finance
 * @param {object} portfolio
 * @param {number} gameDay
 * @returns {{ events: object[], interestTotal: number }}
 */
export function processDailyBankAccounts(finance, portfolio, gameDay = 1) {
  const events = [];
  let interestTotal = 0;
  ensureBankAccounts(finance);
  ensureBankTransferDay(finance, gameDay);
  const day = Math.max(1, Math.floor(Number(gameDay) || 1));

  for (const bank of BANKS) {
    const row = finance.bankAccounts[bank.id];
    if (!row) continue;
    const savings = Math.max(0, Number(row.savings) || 0);
    if (savings >= SAVINGS_MIN_FOR_INTEREST) {
      const apy = getSavingsApy(finance, bank.id);
      const interest = Math.round(savings * (apy / BANK_APY_YEAR_DAYS) * 100) / 100;
      if (interest > 0) {
        row.savings = Math.round((savings + interest) * 100) / 100;
        row.interestAccruedTotal = Math.round(
          ((Number(row.interestAccruedTotal) || 0) + interest) * 100,
        ) / 100;
        interestTotal = Math.round((interestTotal + interest) * 100) / 100;
        events.push({
          type: 'savings_interest',
          bankId: bank.id,
          msg: `${bank.name}: savings interest $${interest.toFixed(2)}`,
          amount: interest,
          apy,
        });
      }
    }
    const loy = maybeAwardDepositLoyalty(finance, bank.id, day);
    if (loy.awarded) {
      events.push({
        type: 'deposit_loyalty',
        bankId: bank.id,
        msg: `Deposit relationship deepened at ${bank.name}`,
        tier: loy.tier,
      });
    }
  }

  return { events, interestTotal };
}

export function getBankRelationship(finance, bankId) {
  const id = String(bankId || '');
  const map = ensureBankRelationships(finance);
  const row = map[id];
  if (!row) return { cycles: 0, preferredSinceDay: null };
  return {
    cycles: Math.max(0, Math.floor(Number(row.cycles) || 0)),
    preferredSinceDay: row.preferredSinceDay == null ? null : Number(row.preferredSinceDay),
  };
}

/**
 * Display tier 0–3. House (3) only for finance.houseBankId.
 * @returns {0|1|2|3}
 */
export function getBankRelationshipTier(finance, bankId) {
  const id = String(bankId || '');
  if (!id) return REL_TIER.NONE;
  if (finance?.houseBankId === id) return REL_TIER.HOUSE;
  const cycles = getBankRelationship(finance, id).cycles;
  if (cycles >= 2) return REL_TIER.PREFERRED;
  if (cycles >= 1) return REL_TIER.KNOWN;
  return REL_TIER.NONE;
}

export function getHouseBankId(finance) {
  return finance?.houseBankId || null;
}

/** Pick house: most cycles (≥3), ties → earliest preferredSinceDay. */
export function recomputeHouseBank(finance) {
  ensureBankRelationships(finance);
  let bestId = null;
  let bestCycles = 0;
  let bestPref = Infinity;
  for (const [id, row] of Object.entries(finance.bankRelationships)) {
    const cycles = Math.max(0, Math.floor(Number(row?.cycles) || 0));
    if (cycles < 3) continue;
    const pref = row?.preferredSinceDay == null ? 999999 : Number(row.preferredSinceDay);
    if (
      cycles > bestCycles
      || (cycles === bestCycles && pref < bestPref)
      || (cycles === bestCycles && pref === bestPref && (bestId == null || id < bestId))
    ) {
      bestCycles = cycles;
      bestPref = pref;
      bestId = id;
    }
  }
  finance.houseBankId = bestId;
  return bestId;
}

/**
 * Award one aged on-time relationship cycle for a loan (once per loan).
 * Credit unions: first cycle at that bank awards +2 (faster loyalty).
 * @returns {{ awarded: boolean, tier: number, reachedPreferred: boolean, bankId: string|null }}
 */
export function awardRelationshipCycle(finance, loan, gameDay = 1) {
  const bankId = loan?.bankId;
  if (!bankId || loan?.relCycleAwarded) {
    return { awarded: false, tier: getBankRelationshipTier(finance, bankId), reachedPreferred: false, bankId: bankId || null };
  }
  if (!loanQualifiesForCreditBuild(loan)) {
    return { awarded: false, tier: getBankRelationshipTier(finance, bankId), reachedPreferred: false, bankId };
  }
  const map = ensureBankRelationships(finance);
  const prev = getBankRelationship(finance, bankId);
  const bank = BANKS.find((b) => b.id === bankId);
  let add = 1;
  if (isCreditUnionBank(bank) && prev.cycles === 0) add = 2;
  const nextCycles = prev.cycles + add;
  const preferredSinceDay = nextCycles >= 2
    ? (prev.preferredSinceDay != null ? prev.preferredSinceDay : (Number(gameDay) || 1))
    : null;
  map[bankId] = { cycles: nextCycles, preferredSinceDay };
  loan.relCycleAwarded = true;
  recomputeHouseBank(finance);
  const tier = getBankRelationshipTier(finance, bankId);
  const reachedPreferred = prev.cycles < 2 && nextCycles >= 2;
  return { awarded: true, tier, reachedPreferred, bankId };
}

/** Quiet demote one cycle at bank after a late (loyalty is real). */
export function demoteBankRelationship(finance, bankId) {
  const id = String(bankId || '');
  if (!id) return getBankRelationshipTier(finance, id);
  const map = ensureBankRelationships(finance);
  const prev = getBankRelationship(finance, id);
  const nextCycles = Math.max(0, prev.cycles - 1);
  if (nextCycles <= 0) {
    delete map[id];
  } else {
    map[id] = {
      cycles: nextCycles,
      preferredSinceDay: nextCycles >= 2 ? (prev.preferredSinceDay || 1) : null,
    };
  }
  recomputeHouseBank(finance);
  return getBankRelationshipTier(finance, id);
}

export function relationshipAprEdge(finance, bankId) {
  const tier = getBankRelationshipTier(finance, bankId);
  return REL_APR_EDGE[tier] || 0;
}

export function relationshipLimitMult(finance, bankId) {
  const tier = getBankRelationshipTier(finance, bankId);
  return 1 + (REL_LIMIT_EDGE[tier] || 0);
}

export function creditTier(score) {
  if (score >= 800) return { label: 'Exceptional', color: '#3fb950' };
  if (score >= 740) return { label: 'Very Good', color: '#56d364' };
  if (score >= 670) return { label: 'Good', color: '#58a6ff' };
  if (score >= 580) return { label: 'Fair', color: '#e3b341' };
  return { label: 'Poor', color: '#f85149' };
}

export function aprTierForScore(score) {
  return APR_CREDIT_TIERS.find(t => score >= t.min) || APR_CREDIT_TIERS[APR_CREDIT_TIERS.length - 1];
}

function creditKey(type) {
  return type === 'personal' ? 'personal' : 'business';
}

export function typeDebt(finance, type) {
  return (finance.loans || [])
    .filter(l => l.type === type && l.balance > 0)
    .reduce((s, l) => s + l.balance, 0);
}

/** Outstanding balance at one bank (optionally filtered by loan type). */
export function bankDebt(finance, bankId, type = null) {
  return (finance.loans || [])
    .filter((l) => (
      l.bankId === bankId
      && l.balance > 0
      && (type == null || l.type === type)
    ))
    .reduce((s, l) => s + l.balance, 0);
}

/** Debt of this type at every bank except bankId. */
export function otherBanksDebt(finance, bankId, type) {
  return Math.max(0, typeDebt(finance, type) - bankDebt(finance, bankId, type));
}

/**
 * Firm balance-sheet strength → facility size (small-business style).
 * Mid five-figure K keeps $500 start nearly flat; ~$100k+ clearly expands lines.
 * Multiplier is capped so late wealth doesn't erase credit underwriting.
 */
export const FIRM_STRENGTH_K = 50000;
export const FIRM_STRENGTH_CAP_ADD = 1.5;

/** Personal default term; company default is longer. Players may pick 30 / 60 / 90. */
export const PERSONAL_LOAN_TERM_DAYS = 30;
export const COMPANY_LOAN_TERM_DAYS = 90;
/** Allowed installment windows (game days). */
export const LOAN_TERM_CHOICES = [30, 60, 90];

/** @param {'personal'|'company'} type */
export function defaultLoanTermDays(type) {
  return type === 'company' ? COMPANY_LOAN_TERM_DAYS : PERSONAL_LOAN_TERM_DAYS;
}

/**
 * Snap to 30 / 60 / 90; fall back to type default when missing/invalid.
 * @param {unknown} termDays
 * @param {'personal'|'company'} [type]
 */
export function normalizeLoanTermDays(termDays, type = 'personal') {
  const n = Math.floor(Number(termDays) || 0);
  if (LOAN_TERM_CHOICES.includes(n)) return n;
  return defaultLoanTermDays(type);
}

/** Mild APR premium so longer windows are not free leverage. */
export function loanTermAprBump(termDays) {
  const t = Math.floor(Number(termDays) || 0);
  if (t >= 90) return 1;
  if (t >= 60) return 0.5;
  return 0;
}

/**
 * @param {number} [firmStrength] firm net worth / equity used as underwriting strength
 * @returns {number} multiplier ≥ 1
 */
export function firmStrengthMultiplier(firmStrength = 0) {
  const v = Math.max(0, Number(firmStrength) || 0);
  return 1 + Math.min(FIRM_STRENGTH_CAP_ADD, v / FIRM_STRENGTH_K);
}

export function firmStrengthBoostPct(firmStrength = 0) {
  return Math.round((firmStrengthMultiplier(firmStrength) - 1) * 100);
}

/**
 * Max new principal this bank will underwrite right now (before step snap).
 * Optional vault collateral is a separate additive term (capped), never a multiplier
 * on tier.limitMult / util / credit math. Firm strength scales the bank ceiling.
 *
 * @param {string} bankId
 * @param {'personal'|'company'} type
 * @param {object} finance
 * @param {{ collateralValue?: number, firmStrength?: number }} [opts]
 */
export function underwriteMaxAmount(bankId, type, finance, { collateralValue = 0, firmStrength = 0 } = {}) {
  const bank = BANKS.find((b) => b.id === bankId);
  const strengthMult = firmStrengthMultiplier(firmStrength);
  const strengthPct = firmStrengthBoostPct(firmStrength);
  if (!bank || !finance) {
    return {
      max: 0, bankMax: 0, outstanding: 0, util: 0, collateralBonus: 0,
      strengthMult, strengthPct, reason: 'Unknown bank',
    };
  }
  const isPersonal = type === 'personal';
  const credit = isPersonal ? finance.personalCredit : finance.businessCredit;
  const minNeeded = bankMinCredit(bank, type);
  if (credit < minNeeded) {
    return {
      max: 0,
      bankMax: 0,
      outstanding: typeDebt(finance, type),
      util: utilizationRatio(finance, type, firmStrength),
      collateralBonus: 0,
      strengthMult,
      strengthPct,
      reason: `Need ${minNeeded}+ ${isPersonal ? 'personal' : 'business'} credit (you have ${credit})`,
    };
  }
  const tier = aprTierForScore(credit);
  const baseMax = Math.floor(
    (isPersonal ? bank.maxPersonal : bank.maxCompany) * tier.limitMult * strengthMult,
  );
  // Soft house loyalty: boost this bank's ceiling only — util denom stays catalog-sum.
  const bankMax = Math.floor(baseMax * relationshipLimitMult(finance, bankId));
  const outstanding = typeDebt(finance, type);
  const debtRoom = Math.max(0, bankMax * 1.5 - outstanding);
  let raw = Math.min(bankMax, debtRoom);
  const util = utilizationRatio(finance, type, firmStrength);
  if (util >= 0.8) raw *= 0.5;
  else if (util >= 0.6) raw *= 0.75;
  // 50% LTV on pledged appraisal, hard-capped so bonus never exceeds bankMax.
  const pledged = Math.max(0, Number(collateralValue) || 0);
  const collateralBonus = Math.floor(Math.min(pledged, bankMax) * VAULT_COLLATERAL_LTV);
  const max = Math.floor(raw) + collateralBonus;
  let reason = null;
  if (max < 100) {
    const elsewhere = otherBanksDebt(finance, bankId, type);
    if (elsewhere > 0) {
      reason = `Too much ${type} debt already ($${Math.round(elsewhere).toLocaleString()} at other banks · $${Math.round(bankDebt(finance, bankId, type)).toLocaleString()} here)`;
    } else if (util >= 0.6) {
      reason = `Utilization too high (${Math.round(util * 100)}%) — pay down debt before borrowing more`;
    } else {
      reason = `No ${type} room left at ${bank.short} right now`;
    }
  }
  return { max, bankMax, outstanding, util, collateralBonus, strengthMult, strengthPct, reason };
}

/** Aggregate bank ceilings for a loan type (utilization denominator). */
export function typeCreditLimit(finance, type, firmStrength = 0) {
  const isPersonal = type === 'personal';
  const credit = isPersonal ? finance.personalCredit : finance.businessCredit;
  const strengthMult = firmStrengthMultiplier(firmStrength);
  let sum = 0;
  for (const bank of BANKS) {
    if (credit < bankMinCredit(bank, isPersonal ? 'personal' : 'company')) continue;
    const base = isPersonal ? bank.maxPersonal : bank.maxCompany;
    const mult = aprTierForScore(credit).limitMult;
    sum += base * mult * strengthMult;
  }
  return Math.max(sum, 1);
}

export function utilizationRatio(finance, type, firmStrength = 0) {
  return typeDebt(finance, type) / typeCreditLimit(finance, type, firmStrength);
}

export function creditHistoryDays(finance, gameDay = 1) {
  if (finance.firstCreditDay == null) return 0;
  return Math.max(0, (Number(gameDay) || 1) - finance.firstCreditDay);
}

export function countRecentBorrows(finance, withinDays, gameDay = 1) {
  const day = Number(gameDay) || 1;
  const window = Math.max(1, withinDays);
  return (finance.recentBorrowDays || []).filter(d => day - d < window).length;
}

function hasCreditMix(finance) {
  return !!(finance.typesUsed?.personal && finance.typesUsed?.business);
}

/**
 * Personalized APR from bank base ± credit tier, house loyalty, utilization,
 * recent inquiries, and thin-file / mix adjustments.
 * @param {object} bank
 * @param {'personal'|'company'} type
 * @param {object} finance
 * @param {number} [gameDay]
 * @param {{ firmStrength?: number }} [opts]
 */
export function priceApr(bank, type, finance, gameDay = 1, opts = {}) {
  const isPersonal = type === 'personal';
  const credit = isPersonal ? finance.personalCredit : finance.businessCredit;
  const baseApr = isPersonal ? bank.personalApr : bank.companyApr;
  const tier = aprTierForScore(credit);
  const firmStrength = opts.firmStrength ?? 0;

  let apr = baseApr + tier.aprAdj;

  // Soft loyalty edge at this bank (replaces old loan-count APR kiss — do not stack).
  apr += relationshipAprEdge(finance, bank.id);
  // Mild stranger surcharge when you already have a House elsewhere.
  const houseId = getHouseBankId(finance);
  if (houseId && houseId !== bank.id && getBankRelationshipTier(finance, bank.id) === REL_TIER.NONE) {
    apr += REL_STRANGER_APR_SURCHARGE;
  }

  const util = utilizationRatio(finance, type, firmStrength);
  if (util >= 0.8) apr += 1.5;
  else if (util >= 0.5) apr += 0.75;
  else if (util > 0 && util < 0.3) apr -= 0.25;

  const inquiries = countRecentBorrows(finance, 7, gameDay);
  apr += Math.min(1.5, inquiries * 0.25);

  const age = creditHistoryDays(finance, gameDay);
  if (age <= 0) apr += 0.75; // thin file
  else if (age >= 30) apr -= 0.35;

  if (hasCreditMix(finance)) apr -= 0.2;

  apr += macroAprAdjustment();

  const floor = Math.max(4.99, baseApr - 3.5);
  const ceil = baseApr + 8;
  return Math.round(Math.min(ceil, Math.max(floor, apr)) * 100) / 100;
}

/** @deprecated internal name kept via export for tests — use priceApr */
export function effectiveApr(baseApr, creditScore, minCredit) {
  // Legacy gap formula retained only for compatibility; prefer priceApr.
  const gap = creditScore - minCredit;
  const adj = Math.max(-2.5, Math.min(4, -(gap / 40)));
  return Math.round((baseApr + adj) * 100) / 100;
}

/** Live personal + company quotes for UI chips (refreshes with finance render). */
export function quoteBankOffers(bankId, finance, gameDay = 1, opts = {}) {
  const bank = BANKS.find(b => b.id === bankId);
  if (!bank || !finance) return null;
  return {
    bank,
    personalApr: priceApr(bank, 'personal', finance, gameDay, opts),
    companyApr: priceApr(bank, 'company', finance, gameDay, opts),
    personalMax: maxBorrowableAmount(bankId, 'personal', finance, 50, gameDay, opts),
    companyMax: maxBorrowableAmount(bankId, 'company', finance, 50, gameDay, opts),
    personalOk: finance.personalCredit >= bankMinCredit(bank, 'personal'),
    companyOk: finance.businessCredit >= bankMinCredit(bank, 'company'),
    personalMinCredit: bankMinCredit(bank, 'personal'),
    companyMinCredit: bankMinCredit(bank, 'company'),
    strengthPct: firmStrengthBoostPct(opts.firmStrength || 0),
  };
}

export function quoteLoan(bankId, type, amount, finance, gameDay = 1, opts = {}) {
  const bank = BANKS.find(b => b.id === bankId);
  if (!bank) return { ok: false, msg: 'Unknown bank' };
  const isPersonal = type === 'personal';
  const credit = isPersonal ? finance.personalCredit : finance.businessCredit;
  const minCredit = bankMinCredit(bank, type);
  const baseApr = isPersonal ? bank.personalApr : bank.companyApr;
  const tier = aprTierForScore(credit);
  const firmStrength = opts.firmStrength ?? 0;

  if (credit < minCredit) {
    return {
      ok: false,
      msg: `Need ${minCredit}+ ${isPersonal ? 'personal' : 'business'} credit (you have ${credit})`,
      bank,
      type,
      amount,
      credit,
      debtHere: bankDebt(finance, bankId, type),
      debtElsewhere: otherBanksDebt(finance, bankId, type),
      totalTypeDebt: typeDebt(finance, type),
      strengthPct: firmStrengthBoostPct(firmStrength),
    };
  }
  if (amount < 100) {
    return {
      ok: false,
      msg: 'Minimum loan $100',
      bank,
      type,
      amount,
      credit,
      debtHere: bankDebt(finance, bankId, type),
      debtElsewhere: otherBanksDebt(finance, bankId, type),
      totalTypeDebt: typeDebt(finance, type),
      strengthPct: firmStrengthBoostPct(firmStrength),
    };
  }

  const uw = underwriteMaxAmount(bankId, type, finance, opts);
  if (amount > uw.max) {
    const elsewhere = otherBanksDebt(finance, bankId, type);
    let msg = uw.reason || `Max ${isPersonal ? 'personal' : 'company'} loan at ${bank.short} right now: $${Math.max(0, uw.max).toLocaleString()}`;
    if (uw.max >= 100 && elsewhere > 0) {
      msg = `Approved max $${uw.max.toLocaleString()} at ${bank.short} — you already owe $${Math.round(elsewhere).toLocaleString()} ${type} debt at other banks`;
    } else if (uw.max >= 100 && uw.util >= 0.6) {
      msg = `Approved max $${uw.max.toLocaleString()} at ${bank.short} — utilization is ${Math.round(uw.util * 100)}%`;
    } else if (uw.max >= 100) {
      msg = `Max ${isPersonal ? 'personal' : 'company'} loan at ${bank.short}: $${uw.max.toLocaleString()}`;
    }
    return {
      ok: false,
      msg,
      bank,
      type,
      amount,
      credit,
      maxApproved: uw.max,
      collateralBonus: uw.collateralBonus || 0,
      strengthMult: uw.strengthMult,
      strengthPct: uw.strengthPct,
      debtHere: bankDebt(finance, bankId, type),
      debtElsewhere: elsewhere,
      totalTypeDebt: uw.outstanding,
      utilization: Math.round(uw.util * 1000) / 10,
    };
  }

  const outstanding = uw.outstanding;
  const termDays = normalizeLoanTermDays(opts.termDays, type);
  const baseQuoted = priceApr(bank, type, finance, gameDay, opts);
  const apr = Math.round((baseQuoted + loanTermAprBump(termDays)) * 100) / 100;
  const dailyRate = apr / 100 / 365;
  const estimatedInterest = amount * dailyRate * termDays;
  const minDailyPayment = Math.round(
    Math.min(amount, Math.max(amount * dailyRate * 2, amount / Math.max(1, termDays) * 0.5)) * 100,
  ) / 100;
  const utilAfter = (outstanding + amount) / typeCreditLimit(finance, type, firmStrength);

  return {
    ok: true,
    bank,
    type,
    amount,
    apr,
    baseApr,
    dailyRate,
    termDays,
    termAprBump: loanTermAprBump(termDays),
    estimatedInterest,
    minDailyPayment,
    credit,
    tier: tier.label,
    utilization: Math.round(utilAfter * 1000) / 10,
    debtHere: bankDebt(finance, bankId, type),
    debtElsewhere: otherBanksDebt(finance, bankId, type),
    totalTypeDebt: outstanding,
    maxApproved: uw.max,
    collateralBonus: uw.collateralBonus || 0,
    strengthMult: uw.strengthMult,
    strengthPct: uw.strengthPct,
  };
}

/** Highest amount this bank will approve right now for a loan type (step-aligned). */
export function maxBorrowableAmount(bankId, type, finance, step = 50, gameDay = 1, opts = {}) {
  void gameDay; // reserved for future day-sensitive caps; underwrite uses live finance state
  const uw = underwriteMaxAmount(bankId, type, finance, opts);
  if (uw.max < 100) return 0;
  const snapped = Math.floor(uw.max / step) * step;
  return Math.max(0, snapped);
}

/** Shared amount field serves both Personal + Company — use the higher eligible ceiling. */
export function maxBorrowableForBank(bankId, finance, step = 50, gameDay = 1, opts = {}) {
  return Math.max(
    maxBorrowableAmount(bankId, 'personal', finance, step, gameDay, opts),
    maxBorrowableAmount(bankId, 'company', finance, step, gameDay, opts),
  );
}

/** Positive credit impact only after the loan has aged through a day-end interest tick. */
export function loanQualifiesForCreditBuild(loan) {
  return (loan?.interestTicks || 0) >= MIN_INTEREST_TICKS_FOR_CREDIT;
}

function ensureCreditDayBucket(finance, gameDay) {
  const day = Number(gameDay) || 0;
  if (!finance.creditGainsToday) finance.creditGainsToday = { personal: 0, business: 0 };
  if (finance.creditGainDay !== day) {
    finance.creditGainDay = day;
    finance.creditGainsToday = { personal: 0, business: 0 };
  }
}

/** Apply capped positive credit; returns points actually applied. */
export function applyCreditGain(finance, type, amount, gameDay) {
  if (!amount || amount <= 0) return 0;
  ensureCreditDayBucket(finance, gameDay);
  const key = creditKey(type);
  const cap = DAILY_CREDIT_GAIN_CAP[key];
  const used = finance.creditGainsToday[key] || 0;
  const room = Math.max(0, cap - used);
  const applied = Math.min(amount, room);
  if (applied <= 0) return 0;
  if (key === 'personal') finance.personalCredit = Math.min(850, finance.personalCredit + applied);
  else finance.businessCredit = Math.min(850, finance.businessCredit + applied);
  finance.creditGainsToday[key] = used + applied;
  return applied;
}

function applyCreditHit(finance, type, amount) {
  if (type === 'personal') finance.personalCredit = Math.max(300, finance.personalCredit - amount);
  else finance.businessCredit = Math.max(300, finance.businessCredit - amount);
}

function recordBorrowInquiry(finance, gameDay) {
  if (!finance.recentBorrowDays) finance.recentBorrowDays = [];
  finance.recentBorrowDays.push(Number(gameDay) || 1);
  // Keep ~14 days of history
  const day = Number(gameDay) || 1;
  finance.recentBorrowDays = finance.recentBorrowDays.filter(d => day - d < 14);
}

export function takeLoan(bankId, type, amount, finance, portfolio, gameDay = 1, opts = {}) {
  const q = quoteLoan(bankId, type, amount, finance, gameDay, opts);
  if (!q.ok) return q;

  const collateralIds = [...new Set(
    (Array.isArray(opts.collateralIds) ? opts.collateralIds : [])
      .filter((id) => typeof id === 'string' && id),
  )];

  const loan = {
    id: `loan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    bankId,
    bankName: q.bank.name,
    type,
    principal: amount,
    balance: amount,
    apr: q.apr,
    dailyRate: q.dailyRate,
    termDays: q.termDays,
    daysLeft: q.termDays,
    openedDay: gameDay,
    interestTicks: 0,
    lastPartialCreditDay: 0,
    status: 'active',
    /** Vault item ids pledged when this loan was underwritten (locks unpledge). */
    collateralIds,
  };

  finance.loans.push(loan);
  finance.totalBorrowed += amount;
  portfolio.cash += amount;

  if (finance.firstCreditDay == null) finance.firstCreditDay = gameDay;
  if (!finance.typesUsed) finance.typesUsed = { personal: false, business: false };
  if (type === 'personal') finance.typesUsed.personal = true;
  else finance.typesUsed.business = true;

  recordBorrowInquiry(finance, gameDay);

  // Hard-inquiry style hit — never a credit gain on borrow. Stacks if multiple same day.
  const sameDayBorrows = countRecentBorrows(finance, 1, gameDay);
  let hit = type === 'personal' ? 5 : 3;
  if (sameDayBorrows >= 2) hit += type === 'personal' ? 3 : 2;
  const util = utilizationRatio(finance, type);
  if (util >= 0.8) hit += 4;
  else if (util >= 0.5) hit += 2;
  applyCreditHit(finance, type, hit);

  return { ok: true, loan, inquiryHit: hit };
}

export function makeLoanPayment(loanId, amount, finance, portfolio, gameDay = 1) {
  const loan = finance.loans.find(l => l.id === loanId);
  if (!loan || loan.balance <= 0) return { ok: false, msg: 'Loan not found' };
  const pay = Math.min(amount, loan.balance);
  if (portfolio.cash < pay) return { ok: false, msg: 'Not enough cash' };

  const balanceBefore = loan.balance;
  portfolio.cash -= pay;
  loan.balance = Math.round((loan.balance - pay) * 100) / 100;
  finance.totalRepaid += pay;
  finance.paymentHistory.unshift({ time: Date.now(), loanId, amount: pay, bank: loan.bankName });

  const qualifies = loanQualifiesForCreditBuild(loan);
  const daysHeld = Math.max(0, (loan.termDays || 30) - (loan.daysLeft || 0));
  const mixBonus = hasCreditMix(finance) ? 1 : 0;

  if (loan.balance <= 0.5) {
    loan.balance = 0;
    loan.status = 'paid';
    const early = qualifies
      && daysHeld >= MIN_INTEREST_TICKS_FOR_CREDIT
      && (loan.daysLeft || 0) > Math.floor((loan.termDays || 30) * 0.5);

    let creditDelta = 0;
    if (qualifies) {
      // Full payoff after aging — meaningful but not overnight rocket
      const want = (loan.type === 'personal' ? 10 : 8) + mixBonus;
      creditDelta = applyCreditGain(finance, loan.type, want, gameDay);
      finance.onTimePayments = (finance.onTimePayments || 0) + 1;
    }
    const rel = qualifies
      ? awardRelationshipCycle(finance, loan, gameDay)
      : { awarded: false, reachedPreferred: false, bankId: loan.bankId, tier: 0 };
    return {
      ok: true,
      paid: pay,
      remaining: loan.balance,
      earlyPayoff: early,
      creditDelta,
      creditSkipped: !qualifies,
      relationship: rel,
      loanEvents: rel.reachedPreferred
        ? [{ type: 'relationship_preferred', bankId: loan.bankId }]
        : [],
    };
  }

  let creditDelta = 0;
  // Partial: aged loan + meaningful size + once per game day per loan
  const minAmt = Math.max(MIN_PARTIAL_CREDIT_ABS, balanceBefore * MIN_PARTIAL_CREDIT_PCT);
  let relationship = { awarded: false, reachedPreferred: false, bankId: loan.bankId, tier: 0 };
  if (qualifies && pay >= minAmt && (loan.lastPartialCreditDay || 0) !== (Number(gameDay) || 0)) {
    const util = utilizationRatio(finance, loan.type);
    // Paying down still-high utilization earns less
    const want = util >= 0.8 ? 0 : 1;
    if (want > 0) {
      creditDelta = applyCreditGain(finance, loan.type, want, gameDay);
      if (creditDelta > 0) {
        loan.lastPartialCreditDay = Number(gameDay) || 0;
        finance.onTimePayments = (finance.onTimePayments || 0) + 1;
      }
    }
    // Qualifying aged partial also earns loyalty cycle once per loan
    relationship = awardRelationshipCycle(finance, loan, gameDay);
  }

  return {
    ok: true,
    paid: pay,
    remaining: loan.balance,
    creditDelta,
    creditSkipped: !qualifies,
    relationship,
    loanEvents: relationship.reachedPreferred
      ? [{ type: 'relationship_preferred', bankId: loan.bankId }]
      : [],
  };
}

/** Accrue interest + due payment each new game day */
export function processDailyLoans(finance, portfolio, gameDay = 1) {
  const events = [];
  ensureCreditDayBucket(finance, gameDay);

  // Utilization pressure once per day (high debt load vs limits)
  if (finance.utilAdjDay !== gameDay) {
    finance.utilAdjDay = gameDay;
    for (const type of ['personal', 'company']) {
      const util = utilizationRatio(finance, type);
      if (util >= 0.9 && typeDebt(finance, type) > 0) {
        applyCreditHit(finance, type, 3);
        events.push({
          type: 'utilization',
          msg: `High ${type} credit utilization (${Math.round(util * 100)}%) — score pressure`,
        });
      }
    }
  }

  // Reserve pressure once per day: running the firm with more company debt
  // than cash on hand reads as thin reserves to lenders (teaching moment).
  if (finance.reserveAdjDay !== gameDay) {
    finance.reserveAdjDay = gameDay;
    const companyDebt = typeDebt(finance, 'company');
    const cashOnHand = Math.max(0, Number(portfolio?.cash) || 0);
    if (companyDebt > 0 && companyDebt > cashOnHand) {
      applyCreditHit(finance, 'business', 2);
      events.push({
        type: 'reserve',
        msg: `Reserves thin: company debt $${Math.round(companyDebt).toLocaleString()} exceeds cash — small business credit hit`,
      });
    }
  }

  for (const loan of finance.loans) {
    if (loan.status !== 'active' || loan.balance <= 0) continue;

    const interest = loan.balance * loan.dailyRate;
    loan.balance = Math.round((loan.balance + interest) * 100) / 100;
    loan.daysLeft = Math.max(0, (loan.daysLeft || 0) - 1);
    loan.interestTicks = (loan.interestTicks || 0) + 1;

    const minPay = Math.max(interest * 2, loan.balance / Math.max(1, loan.daysLeft || 1) * 0.5);
    const due = Math.min(loan.balance, Math.round(minPay * 100) / 100);

    if (portfolio.cash >= due) {
      portfolio.cash -= due;
      loan.balance = Math.round((loan.balance - due) * 100) / 100;
      finance.totalRepaid += due;
      finance.onTimePayments = (finance.onTimePayments || 0) + 1;
      // On-time auto-pay: payment history weight (small, capped)
      const payCredit = applyCreditGain(finance, loan.type, 1, gameDay);
      // First aged on-time auto-pay earns a loyalty cycle once per loan
      const rel = awardRelationshipCycle(finance, loan, gameDay);
      events.push({
        type: 'payment',
        bankId: loan.bankId,
        msg: `${loan.bankName}: auto-paid $${due.toFixed(2)} (interest $${interest.toFixed(2)})`,
        creditDelta: payCredit,
        relationship: rel,
      });
      if (rel.reachedPreferred) {
        events.push({
          type: 'relationship_preferred',
          bankId: loan.bankId,
          msg: `Preferred status at ${loan.bankName}`,
        });
      }
      if (loan.balance <= 0.5) {
        loan.balance = 0;
        loan.status = 'paid';
        const want = loan.type === 'personal' ? 8 : 6;
        const creditDelta = applyCreditGain(finance, loan.type, want, gameDay);
        events.push({
          type: 'paid_off',
          bankId: loan.bankId,
          msg: `Paid off ${loan.type} loan at ${loan.bankName}`,
          creditDelta,
        });
      }
      if (getHouseBankId(finance) === loan.bankId) {
        events.push({
          type: 'house_bank_used',
          bankId: loan.bankId,
          msg: `House lender activity at ${loan.bankName}`,
        });
      }
    } else {
      const fee = Math.min(5, loan.balance * 0.01);
      loan.balance += fee;
      finance.latePayments = (finance.latePayments || 0) + 1;
      finance.lastLateDay = gameDay;
      // Payment history is the heaviest real-life factor — asymmetric damage
      if (loan.type === 'personal') applyCreditHit(finance, 'personal', 28);
      else applyCreditHit(finance, 'business', 22);
      demoteBankRelationship(finance, loan.bankId);
      events.push({
        type: 'late',
        loanId: loan.id,
        bankId: loan.bankId,
        msg: `LATE: ${loan.bankName} — missed $${due.toFixed(2)}, fee $${fee.toFixed(2)}, credit hit`,
      });
    }

    if (loan.daysLeft <= 0 && loan.balance > 0) {
      loan.status = 'overdue';
      events.push({ type: 'overdue', msg: `${loan.bankName} loan matured — $${loan.balance.toFixed(2)} still owed` });
    }
  }
  return events;
}

export function getTotalDebt(finance) {
  return finance.loans.filter(l => l.balance > 0).reduce((s, l) => s + l.balance, 0);
}

/**
 * Firm-wide debt = bank loans + drawn property-backed credit (HELOC-style).
 * @param {object} finance
 * @param {number} [estateCreditUsed]
 */
export function getFirmDebt(finance, estateCreditUsed = 0) {
  return getTotalDebt(finance) + Math.max(0, Number(estateCreditUsed) || 0);
}

export function getActiveLoans(finance) {
  return finance.loans.filter(l => l.balance > 0);
}

/**
 * Same min auto-pay formula used at day-end for one loan.
 * @param {object} loan
 */
export function minPaymentForLoan(loan) {
  if (!loan || !(loan.balance > 0)) return 0;
  const interest = loan.balance * (Number(loan.dailyRate) || 0);
  const daysLeft = Math.max(1, Math.floor(Number(loan.daysLeft) || 1));
  const minPay = Math.max(interest * 2, loan.balance / daysLeft * 0.5);
  return Math.min(loan.balance, Math.round(minPay * 100) / 100);
}

/**
 * Dashboard / Finance: cash needed for tonight's auto-pay across active loans.
 * @param {object} finance
 * @returns {{ due: number, loanCount: number, dueLabel: string }}
 */
export function getNextLoanPaymentDue(finance) {
  const loans = getActiveLoans(finance || { loans: [] });
  let due = 0;
  for (const loan of loans) due += minPaymentForLoan(loan);
  due = Math.round(due * 100) / 100;
  return {
    due,
    loanCount: loans.length,
    dueLabel: loans.length ? 'Due today · day end' : 'No active loans',
  };
}

/** Project total interest under minimum auto-pay vs lump-sum payoff */
export function projectLoanPayoff(loan) {
  if (!loan || loan.balance <= 0) return null;
  const balance0 = loan.balance;
  const rate = loan.dailyRate;
  const daysLeft = Math.max(1, loan.daysLeft || 30);

  let bal = balance0;
  let minInterest = 0;
  for (let d = 0; d < daysLeft && bal > 0.5; d++) {
    const interest = bal * rate;
    minInterest += interest;
    bal += interest;
    const minPay = Math.max(interest * 2, bal / Math.max(1, daysLeft - d) * 0.5);
    bal -= Math.min(bal, minPay);
  }
  const minTotal = balance0 + minInterest;

  const lumpInterest = balance0 * rate;
  const lumpTotal = balance0 + lumpInterest;

  return {
    balance: balance0,
    apr: loan.apr,
    daysLeft,
    minimum: { totalCost: Math.round(minTotal * 100) / 100, interest: Math.round(minInterest * 100) / 100 },
    lumpSum: { totalCost: Math.round(lumpTotal * 100) / 100, interest: Math.round(lumpInterest * 100) / 100 },
    savings: Math.round((minTotal - lumpTotal) * 100) / 100,
  };
}
