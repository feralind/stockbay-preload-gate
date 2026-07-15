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
    id: 'local',
    name: 'Navy Federal Credit Union',
    short: 'NFCU',
    domain: 'navyfederal.org',
    category: 'Credit union',
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
    desc: 'Credit-union rates. Needs good credit.',
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
  };
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

/** Personal term loans stay short; company facilities get a longer amort window. */
export const PERSONAL_LOAN_TERM_DAYS = 30;
export const COMPANY_LOAN_TERM_DAYS = 90;

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
  const bankMax = Math.floor(
    (isPersonal ? bank.maxPersonal : bank.maxCompany) * tier.limitMult * strengthMult,
  );
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

function bankRelationshipCount(finance, bankId) {
  return (finance.loans || []).filter(l => l.bankId === bankId).length;
}

function hasCreditMix(finance) {
  return !!(finance.typesUsed?.personal && finance.typesUsed?.business);
}

/**
 * Personalized APR from bank base ± credit tier, relationship, utilization,
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

  const rel = bankRelationshipCount(finance, bank.id);
  if (rel >= 1) apr -= 0.35;
  if (rel >= 2) apr -= 0.25;

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
  const apr = priceApr(bank, type, finance, gameDay, opts);
  const dailyRate = apr / 100 / 365;
  const termDays = isPersonal ? PERSONAL_LOAN_TERM_DAYS : COMPANY_LOAN_TERM_DAYS;
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
    return {
      ok: true,
      paid: pay,
      remaining: loan.balance,
      earlyPayoff: early,
      creditDelta,
      creditSkipped: !qualifies,
    };
  }

  let creditDelta = 0;
  // Partial: aged loan + meaningful size + once per game day per loan
  const minAmt = Math.max(MIN_PARTIAL_CREDIT_ABS, balanceBefore * MIN_PARTIAL_CREDIT_PCT);
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
  }

  return {
    ok: true,
    paid: pay,
    remaining: loan.balance,
    creditDelta,
    creditSkipped: !qualifies,
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
      events.push({
        type: 'payment',
        msg: `${loan.bankName}: auto-paid $${due.toFixed(2)} (interest $${interest.toFixed(2)})`,
        creditDelta: payCredit,
      });
      if (loan.balance <= 0.5) {
        loan.balance = 0;
        loan.status = 'paid';
        const want = loan.type === 'personal' ? 8 : 6;
        const creditDelta = applyCreditGain(finance, loan.type, want, gameDay);
        events.push({
          type: 'paid_off',
          msg: `Paid off ${loan.type} loan at ${loan.bankName}`,
          creditDelta,
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
      events.push({
        type: 'late',
        loanId: loan.id,
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
