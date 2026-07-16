/**
 * StockWay long-run balance harness (Node only, no Electron).
 *
 * Defaults to BALANCE_DAYS=500; calibrated for BALANCE_DAYS=1000
 * (CONFIG.REAL_MINUTES_PER_GAME_DAY = 30 → 1000 game days ≈ 500 real hours).
 * Checkpoints include 750/1000; runs remain headless-safe when credit collapses.
 *
 * Findings from 2026-07-15 BALANCE_DAYS=1000 re-run (post license framework):
 * - careful: earns all licenses (Series 7 D66, Research D523, Reg D D728); NW trough ~D200–500,
 *   ends ~$663k; 0 late pays; business credit 850; facility $12.1k → $40.5k; 1 estate.
 * - aggressive: Series 7 D5, Research D412; credit 300 (1259 late pays) permanently blocks Reg D,
 *   so hedgeFund/primeBroker/legendDesk stay locked — earned licenses persist. Still ~$2.13M NW
 *   via synthetic P&L; facility $0. Subprime personal credit (<580) shrinks Available Buying Power
 *   to 1.0× even with Margin — harness dampens synthetic size accordingly (no crash).
 * - AFK: never qualifies for any exam (retail only); ends ~−$1.8k; payroll ~115% of P&L.
 *
 * Architectural laws (quiet, no tick thrash):
 * - Available Buying Power: Margin + personal credit ≥670 → 2×; Fair 580–669 → 1.5×; Poor <580 → 1×.
 * - Revenge cool-down: wall-clock 30s open lock after |pnl|/NW ≥15% and |pnl|≥$40 (engine gate).
 * - E2 mechanical: HELOC needs 580+ business credit; Poor credit −5m margin grace; estate closing 2%.
 */
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const STARTING_CASH = 500;
const DAYS = Number(process.env.BALANCE_DAYS || 500);
/**
 * Styles: careful / aggressive / afk are the standing trio.
 * 'optimal' = best-case careful — identical trading edge and discipline
 * (same P&L mean/vol, 0 late pays), but perfect desk decisions: credit built
 * from day 2, Series 7 as soon as qualified (margin boost early), no payroll
 * drag, cash left to compound. Opt in via BALANCE_STYLES=optimal,careful.
 */
const STYLES = (process.env.BALANCE_STYLES || 'careful,aggressive,afk')
  .split(',').map((s) => s.trim()).filter(Boolean);
const CHECKPOINT_DAYS = [1, 10, 30, 60, 100, 200, 300, 400, 500, 750, 1000];

const localStorageStore = new Map();
globalThis.localStorage = {
  getItem(key) {
    return localStorageStore.has(key) ? localStorageStore.get(key) : null;
  },
  setItem(key, value) {
    localStorageStore.set(key, String(value));
  },
  removeItem(key) {
    localStorageStore.delete(key);
  },
  clear() {
    localStorageStore.clear();
  },
};

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function normal(rand) {
  const u = Math.max(1e-9, rand());
  const v = Math.max(1e-9, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function money(value) {
  const rounded = Math.round(Number(value) || 0);
  const sign = rounded < 0 ? '-' : '';
  return `${sign}$${Math.abs(rounded).toLocaleString()}`;
}

function pct(numerator, denominator) {
  if (!(Number(denominator) > 0)) return 'n/a';
  return `${((Number(numerator) / Number(denominator)) * 100).toFixed(1)}%`;
}

function pad(value, width) {
  return String(value).padStart(width);
}

async function importLiveModules() {
  const root = path.resolve(__dirname, '..');
  const url = (relativePath) => pathToFileURL(path.join(root, relativePath)).href;
  const [
    portfolio,
    finance,
    staff,
    dayEnd,
    meta,
    market,
    config,
    estates,
    licenses,
  ] = await Promise.all([
    import(url('js/portfolio.js')),
    import(url('js/finance.js')),
    import(url('js/staff.js')),
    import(url('js/day-end.js')),
    import(url('js/meta.js')),
    import(url('js/market.js')),
    import(url('js/config.js')),
    import(url('js/estates.js')),
    import(url('js/licenses.js')),
  ]);
  return { portfolio, finance, staff, dayEnd, meta, market, config, estates, licenses };
}

function makeState(mods) {
  return {
    portfolio: mods.portfolio.createPortfolio(STARTING_CASH),
    finance: mods.finance.createFinanceState(),
    meta: mods.meta.createMetaState(),
    perks: [],
    licenses: ['retail'],
    staff: [],
    staffLog: [],
    stats: { tradesClosed: 0, greenDays: 0, greenStreak: 0 },
    vaultOwned: [],
    vaultPledged: [],
    estateOwned: [],
    estateCreditUsed: 0,
    estateCreditMax: 0,
    estateEquity: 0,
    estateEquityExtracted: 0,
    estateSpentTotal: 0,
    estateCashOutCount: 0,
    listings: [],
    achievements: {},
  };
}

function firmDebt(mods, state) {
  return mods.finance.getFirmDebt(state.finance, state.estateCreditUsed);
}

function firmNetWorth(mods, state) {
  mods.estates.syncEstateDerived(state);
  return mods.portfolio.getFirmNetWorth(state.portfolio, {
    debt: firmDebt(mods, state),
    vaultBook: 0,
    estateEquity: state.estateEquity || 0,
    bankDeposits: mods.finance.getTotalBankDeposits(state.finance),
  });
}

function activeDebt(mods, state) {
  return mods.finance.getTotalDebt(state.finance) + Math.max(0, Number(state.estateCreditUsed) || 0);
}

function buyPerk(mods, state, perkId, reserve, track) {
  if (state.perks.includes(perkId)) return false;
  const perk = mods.config.PERKS?.[perkId];
  if (!perk) return false;
  const missing = (perk.requires || []).filter((id) => !state.perks.includes(id));
  if (missing.length) return false;
  if (!mods.licenses.hasLicense(state.licenses, perk.licenseRequired || 'retail')) return false;
  if (state.portfolio.cash < perk.cost + reserve) return false;
  state.portfolio.cash -= perk.cost;
  state.perks.push(perkId);
  if (track) {
    track.perkSpendTotal += perk.cost;
    if (track.perkUnlockDay[perkId] == null) track.perkUnlockDay[perkId] = track.day;
  }
  return true;
}

/**
 * Sit the next license exam when qualified. Careful keeps a cash reserve,
 * aggressive buys the moment the gate opens, AFK only stumbles into it.
 */
function maybeBuyLicense(mods, state, style, day, track) {
  const next = mods.licenses.getNextLicense(state.licenses);
  if (!next) return false;
  const reserve = (style === 'careful' || style === 'optimal') ? 1200 : style === 'aggressive' ? 100 : 800;
  const netWorth = firmNetWorth(mods, state);
  const snap = mods.licenses.licenseSnapshot(state, { day, netWorth });
  if (!mods.licenses.canTakeLicenseExam(next.id, snap).ok) return false;
  if (state.portfolio.cash < next.fee + reserve) return false;
  const result = mods.licenses.purchaseLicense(state, next.id, { day, netWorth });
  if (result.ok && track && track.licenseDay[next.id] == null) {
    track.licenseDay[next.id] = day;
    track.licenseSpendTotal += next.fee;
  }
  return !!result.ok;
}

/**
 * Skillful personal-credit building (careful/aggressive, pre-Series 7):
 * carry one small personal loan, let it age past an interest tick, then pay it
 * off on time. Mirrors what the Series 7 "background check" teaches — the
 * Day-1 Fair file (600) has to be built up to the Good band (670+).
 */
function buildPersonalCredit(mods, state, style, day) {
  if (style === 'afk') return;
  if (mods.licenses.hasLicense(state.licenses, 'series7')) return;
  const need = mods.licenses.LICENSES.series7.reqs.personalCredit || 670;
  if ((state.finance.personalCredit || 0) >= need + 10) return;

  const active = (state.finance.loans || []).filter((l) => l.type === 'personal' && l.balance > 0);
  if (!active.length) {
    if (state.portfolio.cash < 450) return;
    const max = mods.finance.maxBorrowableAmount('capitalone', 'personal', state.finance, 50, day, { firmStrength: 0 });
    if (max >= 100) {
      mods.finance.takeLoan('capitalone', 'personal', Math.min(300, max), state.finance, state.portfolio, day);
    }
    return;
  }
  for (const loan of active) {
    if ((loan.interestTicks || 0) >= 2 && state.portfolio.cash > loan.balance + 300) {
      mods.finance.makeLoanPayment(loan.id, loan.balance, state.finance, state.portfolio, day);
    }
  }
}

function trainEligibleStaff(mods, state, reserve = 0) {
  let trained = 0;
  for (const member of [...(state.staff || [])]) {
    const check = mods.staff.canTrain(member.id, state);
    if (!check.ok) continue;
    if (state.portfolio.cash < (check.cost || 0) + reserve) continue;
    const result = mods.staff.trainStaff(member.id, state);
    if (result.ok) trained += 1;
  }
  return trained;
}

function enableEligibleAutopilot(mods, state) {
  let enabled = 0;
  for (const member of state.staff || []) {
    if (member.autopilot) continue;
    if (!mods.staff.canEnableAutopilot(member).ok) continue;
    const result = mods.staff.setStaffAutopilot(member.id, true, state);
    if (result.ok) enabled += 1;
  }
  return enabled;
}

function hireIfOpen(mods, state, roleId, reserve = 0) {
  if (state.staff.some((member) => member.roleId === roleId)) return false;
  const role = mods.staff.STAFF_ROLES?.[roleId];
  if (role && state.portfolio.cash < role.hireCost + reserve) return false;
  const result = mods.staff.hireStaff(roleId, state);
  return !!result.ok;
}

function progressDesk(mods, state, style, day, track) {
  if (style === 'optimal') {
    // Lean desk: only perks that pay for themselves in-model (margin boost).
    // No staff — payroll is the silent killer of careful's mid-game.
    buyPerk(mods, state, 'scanner', 200, track);
    buyPerk(mods, state, 'margin', 600, track);
    return;
  }
  const reserve = style === 'careful' ? 1400 : style === 'aggressive' ? 250 : 350;
  const hireReserve = style === 'careful' ? 1800 : style === 'aggressive' ? 150 : 600;
  const trainReserve = style === 'careful' ? 2200 : style === 'aggressive' ? 250 : 900;
  track.day = day;

  buyPerk(mods, state, 'scanner', style === 'careful' ? 250 : 0, track);
  buyPerk(mods, state, 'hrDept', reserve, track);
  if (style !== 'afk' || day >= 25) buyPerk(mods, state, 'margin', reserve, track);
  if (day >= 35) buyPerk(mods, state, 'analyst', reserve, track);
  if (style !== 'afk' && day >= 70) buyPerk(mods, state, 'tradingFloor', reserve, track);
  if (style === 'aggressive' && day >= 85) buyPerk(mods, state, 'smartRouting', reserve, track);
  if (day >= 120) buyPerk(mods, state, 'aiAdvisor', reserve, track);
  if (style === 'aggressive' && day >= 170) buyPerk(mods, state, 'hedgeFund', reserve, track);
  if (style === 'aggressive' && day >= 260) buyPerk(mods, state, 'primeBroker', reserve, track);
  if (style === 'aggressive' && day >= 340) buyPerk(mods, state, 'legendDesk', reserve, track);

  if (!state.perks.includes('hrDept')) return;

  hireIfOpen(mods, state, 'exitSpec', hireReserve);
  hireIfOpen(mods, state, 'scout', hireReserve);
  if (day >= 20) hireIfOpen(mods, state, 'intern', hireReserve);
  if (day >= 45) hireIfOpen(mods, state, 'compliance', hireReserve);
  if (day >= 80) hireIfOpen(mods, state, 'research', hireReserve);
  if (state.perks.includes('margin') && day >= 110) hireIfOpen(mods, state, 'risk', hireReserve);
  if (state.perks.includes('aiAdvisor') && day >= 145) hireIfOpen(mods, state, 'trader', hireReserve);
  if (style === 'aggressive' && state.perks.includes('hedgeFund') && day >= 190) hireIfOpen(mods, state, 'partner', hireReserve);
  if (style === 'aggressive' && state.perks.includes('primeBroker') && day >= 280) hireIfOpen(mods, state, 'shortSpec', hireReserve);

  if (day % 15 === 0) trainEligibleStaff(mods, state, trainReserve);
  if (day % 10 === 0) enableEligibleAutopilot(mods, state);
}

function syntheticTradingPnl(style, day, state, rand) {
  const cash = Number(state.portfolio.cash) || 0;
  const hasMargin = state.perks.includes('margin');
  const staffCount = (state.staff || []).length;
  const autoCount = (state.staff || []).filter((member) => member.autopilot).length;
  const scale = 0.55 + Math.min(1.35, day / 430);
  // Credit-scaled Available Buying Power: dampen synthetic size when personal
  // credit falls below Good (670). Fair (580–669) → 1.5×; Poor (<580) → 0.70×
  // (mirrors marginBuyingPowerMultiplier × personalCreditOpenScale).
  const personalCredit = Number(state.finance?.personalCredit);
  let bpMult = 1;
  const openScale = (Number.isFinite(personalCredit) && personalCredit < 580) ? 0.7 : 1;
  if (hasMargin) {
    if (Number.isFinite(personalCredit) && personalCredit >= 670) bpMult = 2;
    else if (Number.isFinite(personalCredit) && personalCredit >= 580) bpMult = 1.5;
    else bpMult = 1;
  }
  bpMult *= openScale;
  // Relative to classic Good 2× baseline so Good play keeps prior feel.
  const bpScale = hasMargin ? (bpMult / 2) : openScale;
  const marginBoost = hasMargin ? (1 + 0.18 * bpScale) : 1;
  const staffBoost = 1 + Math.min(0.28, staffCount * 0.025 + autoCount * 0.02);
  const cashDampen = Math.max(0.65, Math.min(1.4, Math.sqrt(Math.max(250, cash) / 1800)));

  let mean = 0;
  let volatility = 0;
  if (style === 'careful' || style === 'optimal') {
    // 'optimal' uses the exact careful edge — only desk decisions differ.
    mean = (92 + day * 0.88) * scale * marginBoost * staffBoost * cashDampen * bpScale;
    volatility = 34 + day * 0.18;
  } else if (style === 'aggressive') {
    const aggMargin = hasMargin ? (1 + 0.36 * bpScale) : 1.05;
    mean = (128 + day * 1.42) * scale * aggMargin * staffBoost * cashDampen * bpScale;
    volatility = (145 + day * 0.88) * Math.max(0.55, bpScale);
  } else {
    mean = (10 + day * 0.12) * scale * (1 + autoCount * 0.04);
    volatility = 44 + day * 0.23;
  }

  let pnl = mean + normal(rand) * volatility;
  if (style === 'aggressive' && rand() < 0.055) pnl -= 525 + day * 2.35;
  if (style === 'afk' && rand() < 0.04) pnl -= 140 + day * 0.8;
  if ((style === 'careful' || style === 'optimal') && rand() < 0.012) pnl -= 140 + day * 0.45;

  if (pnl < 0 && cash + pnl < 35) pnl = 35 - cash;
  return Math.round(pnl);
}

function borrowIfNeeded(mods, state, style, day) {
  const cash = Number(state.portfolio.cash) || 0;
  const debt = activeDebt(mods, state);
  const netWorth = firmNetWorth(mods, state);
  const maxDebtPct = (style === 'careful' || style === 'optimal') ? 0.28 : style === 'aggressive' ? 1.2 : 0.55;
  const trigger = (style === 'careful' || style === 'optimal') ? 650 : style === 'aggressive' ? 1650 : 300;
  if (cash >= trigger) return null;
  if (netWorth > 0 && debt > Math.max(1000, netWorth * maxDebtPct)) return null;

  const firmStrength = Math.max(0, netWorth);
  const companyMax = mods.finance.maxBorrowableAmount('chase', 'company', state.finance, 50, day, { firmStrength });
  const personalMax = mods.finance.maxBorrowableAmount('chase', 'personal', state.finance, 50, day, { firmStrength });
  const target = style === 'aggressive' ? 3200 : (style === 'careful' || style === 'optimal') ? 900 : 600;

  if (companyMax >= 100) {
    const amount = Math.max(100, Math.min(target, companyMax));
    return mods.finance.takeLoan('chase', 'company', amount, state.finance, state.portfolio, day, { firmStrength });
  }
  if (personalMax >= 100) {
    const amount = Math.max(100, Math.min(Math.floor(target * 0.5), personalMax));
    return mods.finance.takeLoan('chase', 'personal', amount, state.finance, state.portfolio, day, { firmStrength });
  }
  return null;
}

function maybeBuyEstate(mods, state, style, day) {
  // 'optimal' skips estates — roughly NW-neutral in-model, and closing costs drag.
  if (style === 'afk' || style === 'optimal' || day < 250) return null;
  const netWorth = firmNetWorth(mods, state);
  const candidates = style === 'aggressive'
    ? ['coastalResidence', 'harborVilla']
    : ['coastalResidence'];
  for (const assetId of candidates) {
    const result = mods.estates.purchaseEstate(state, assetId, { netWorth });
    if (result.ok) return result.asset.id;
  }
  return null;
}

function maybeUseEstateCredit(mods, state, style) {
  if (style !== 'aggressive') return null;
  if (!state.estateOwned?.length) return null;
  if (state.portfolio.cash > 1800) return null;
  const available = mods.estates.getEstateCreditAvailable(state);
  if (available < 500) return null;
  return mods.estates.drawEstateCredit(state, Math.min(2000, available));
}

/** Careful desks park a little excess cash in house/Chase savings (BP leaves desk). */
function maybeParkSavings(mods, state, style, day) {
  if (style !== 'careful' || day < 400) return null;
  const cash = Number(state.portfolio.cash) || 0;
  if (cash < 8000) return null;
  const house = mods.finance.getHouseBankId(state.finance) || 'chase';
  const park = Math.min(1500, Math.floor(cash - 5000));
  if (park < 250) return null;
  return mods.finance.depositToBank(state.finance, state.portfolio, house, 'savings', park, day);
}

function setSyntheticDayCounters(mods, state, style, pnl, rand) {
  const trades = style === 'afk'
    ? 1 + Math.floor(rand() * 2)
    : style === 'aggressive'
      ? 5 + Math.floor(rand() * 5)
      : 3 + Math.floor(rand() * 3);
  state.meta.dayBuys = Math.ceil(trades / 2);
  state.meta.daySells = Math.floor(trades / 2);
  state.stats.tradesClosed = (state.stats.tradesClosed || 0) + trades;
  mods.meta.recordClosedTrade(state.meta, pnl);
  if (pnl > 0) state.meta.dayBestTrade = Math.max(state.meta.dayBestTrade || 0, Math.round(pnl * 0.55));
  else state.meta.dayWorstTrade = Math.min(state.meta.dayWorstTrade || 0, pnl);

  for (const member of state.staff || []) {
    const base = member.autopilot ? 6 : 3;
    const afkBonus = style === 'afk' ? 2 : 0;
    member.actionsToday = base + afkBonus + Math.floor(rand() * 4);
  }
}

function snapshot(mods, state, day, startFacility = null, track = null) {
  const netWorth = firmNetWorth(mods, state);
  const companyMax = mods.finance.maxBorrowableAmount('chase', 'company', state.finance, 50, day, {
    firmStrength: Math.max(0, netWorth),
  });
  const companyBase = mods.finance.maxBorrowableAmount('chase', 'company', state.finance, 50, day, {
    firmStrength: 0,
  });
  const tiers = {};
  let autopilot = 0;
  for (const member of state.staff || []) {
    tiers[member.tier] = (tiers[member.tier] || 0) + 1;
    if (member.autopilot) autopilot += 1;
  }
  const license = mods.licenses.getHighestLicense(state.licenses);
  return {
    day,
    netWorth: Math.round(netWorth),
    cash: Math.round(state.portfolio.cash),
    debt: Math.round(activeDebt(mods, state)),
    staff: (state.staff || []).length,
    payrollDaily: Math.round(mods.staff.getDailySalary(state.staff || [])),
    latePays: state.finance.latePayments || 0,
    personalCredit: Math.round(state.finance.personalCredit || 0),
    businessCredit: Math.round(state.finance.businessCredit || 0),
    license: license?.id || 'retail',
    licenses: [...(state.licenses || [])],
    companyMax,
    companyBase,
    startFacility,
    facilityGrowth: startFacility == null ? 0 : companyMax - startFacility,
    estateEquity: Math.round(state.estateEquity || 0),
    estateCreditMax: Math.round(state.estateCreditMax || 0),
    estateOwned: (state.estateOwned || []).length,
    autopilot,
    tiers,
    perkCount: (state.perks || []).length,
    perkSpendTotal: track ? Math.round(track.perkSpendTotal) : 0,
    perks: [...(state.perks || [])],
  };
}

function activeCheckpoints(days) {
  return new Set(CHECKPOINT_DAYS.filter((d) => d <= days).concat(days === 1 ? [] : [days]));
}

async function runScenario(mods, style) {
  localStorage.clear();
  // 'optimal' shares careful's seed: same market luck, different desk decisions.
  const seed = { careful: 49217, optimal: 49217, aggressive: 91873, afk: 30091 }[style];
  const rand = seededRandom(seed);
  const previousRandom = Math.random;
  Math.random = rand;

  try {
    const state = makeState(mods);
    const checkpoints = activeCheckpoints(DAYS);
    const history = [];
    const track = {
      day: 1, perkSpendTotal: 0, perkUnlockDay: {}, licenseDay: {}, licenseSpendTotal: 0,
    };
    let totalPnl = 0;
    let payrollLifetime = 0;
    let greenDays = 0;
    let redDays = 0;
    let loanEvents = 0;
    let borrows = 0;
    let estatePurchases = 0;
    let startFacility = null;
    let poorPersonalDays = 0;
    let licensesWhilePoor = null;
    const licensesAtStart = [...(state.licenses || [])];

    for (let day = 1; day <= DAYS; day += 1) {
      const debtBefore = firmDebt(mods, state);
      const equityBefore = mods.portfolio.getNetEquity(state.portfolio, debtBefore);
      mods.market.snapshotDayStart(equityBefore, state.portfolio.cash, debtBefore);
      state.meta.challenge = mods.meta.rollDailyChallenge(day);

      const pnl = syntheticTradingPnl(style, day, state, rand);
      state.portfolio.cash += pnl;
      totalPnl += pnl;

      buildPersonalCredit(mods, state, style, day);
      maybeBuyLicense(mods, state, style, day, track);
      progressDesk(mods, state, style, day, track);
      const borrowed = borrowIfNeeded(mods, state, style, day);
      if (borrowed?.ok) borrows += 1;
      if (maybeBuyEstate(mods, state, style, day)) estatePurchases += 1;
      maybeUseEstateCredit(mods, state, style);
      maybeParkSavings(mods, state, style, day);
      setSyntheticDayCounters(mods, state, style, pnl, rand);

      // Subprime personal credit: track restriction; held licenses must persist (no crash).
      const pc = Number(state.finance.personalCredit) || 0;
      if (pc < 580) {
        poorPersonalDays += 1;
        if (!licensesWhilePoor) licensesWhilePoor = [...(state.licenses || [])];
        // Re-qualification for higher exams stays blocked; already-held ids remain.
        for (const id of licensesWhilePoor) {
          if (!state.licenses.includes(id)) {
            throw new Error(`License ${id} stripped while personal credit ${pc} < 580`);
          }
        }
      }

      const settlement = mods.dayEnd.runDayEndSettlement(state, day);
      payrollLifetime += settlement.payroll || 0;
      loanEvents += (settlement.loanEvents || []).length;
      if ((settlement.stats?.equityDelta || 0) >= 100) greenDays += 1;
      if ((settlement.stats?.equityDelta || 0) < -100) redDays += 1;

      if (day === 1) startFacility = snapshot(mods, state, day, null, track).companyMax;
      if (checkpoints.has(day)) history.push(snapshot(mods, state, day, startFacility, track));

      mods.meta.resetDayCounters(state.meta);
      for (const member of state.staff || []) member.actionsToday = 0;
    }

    const final = snapshot(mods, state, DAYS, startFacility, track);
    const at500 = history.find((h) => h.day === 500) || null;
    return {
      style,
      days: DAYS,
      seed,
      final,
      at500,
      history,
      totalPnl: Math.round(totalPnl),
      payrollLifetime: Math.round(payrollLifetime),
      payrollPctOfPnl: totalPnl > 0 ? Number(((payrollLifetime / totalPnl) * 100).toFixed(1)) : null,
      greenDays,
      redDays,
      loanEvents,
      borrows,
      estatePurchases,
      poorPersonalDays,
      licensesWhilePoor,
      licensesAtStart,
      perkUnlockDay: track.perkUnlockDay,
      perkSpendTotal: Math.round(track.perkSpendTotal),
      licenseDay: track.licenseDay,
      licenseSpendTotal: Math.round(track.licenseSpendTotal),
      milestones: {
        series7Day: track.licenseDay.series7 ?? null,
        researchDay: track.licenseDay.research ?? null,
        regdDay: track.licenseDay.regd ?? null,
      },
      staffDetail: (state.staff || []).map((member) => ({
        role: member.roleId,
        tier: member.tier,
        xp: mods.staff.staffXp(member),
        tenureDays: mods.staff.staffTenureDays(member),
        autopilot: !!member.autopilot,
      })),
    };
  } finally {
    Math.random = previousRandom;
  }
}

function staffSummary(result) {
  if (!result.staffDetail.length) return '0';
  const tiers = result.staffDetail.reduce((acc, member) => {
    acc[member.tier] = (acc[member.tier] || 0) + 1;
    return acc;
  }, {});
  const parts = ['expert', 'veteran', 'newbie']
    .filter((tier) => tiers[tier])
    .map((tier) => `${tiers[tier]} ${tier}`);
  if (result.final.autopilot) parts.push(`${result.final.autopilot} autopilot`);
  return parts.join(', ');
}

function facilitySummary(result) {
  const start = result.final.startFacility ?? 0;
  const end = result.final.companyMax;
  const delta = end - start;
  const sign = delta >= 0 ? '+' : '';
  return `${money(start)} -> ${money(end)} (${sign}${money(delta)})`;
}

function printSummaryTable(results) {
  const label = `Day-${DAYS} summary`;
  const rows = results.map((result) => ({
    Style: result.style,
    [`Day-${DAYS} NW`]: money(result.final.netWorth),
    Cash: money(result.final.cash),
    Debt: money(result.final.debt),
    Staff: staffSummary(result),
    'Payroll lifetime': money(result.payrollLifetime),
    'Late pays': result.final.latePays,
    'Facility growth': facilitySummary(result),
  }));
  const columns = Object.keys(rows[0]);
  const widths = columns.map((column) => Math.max(column.length, ...rows.map((row) => String(row[column]).length)));

  console.log(`\n${label}`);
  console.log(columns.map((column, index) => String(column).padEnd(widths[index])).join(' | '));
  console.log(widths.map((width) => '-'.repeat(width)).join('-|-'));
  for (const row of rows) {
    console.log(columns.map((column, index) => String(row[column]).padEnd(widths[index])).join(' | '));
  }
}

function printDetails(result) {
  console.log(`\n${result.style.toUpperCase()}`);
  console.log(`Trading P&L ${money(result.totalPnl)}; payroll ${money(result.payrollLifetime)} (${pct(result.payrollLifetime, result.totalPnl)} of P&L)`);
  console.log(`Green/red days ${result.greenDays}/${result.redDays}; borrows ${result.borrows}; loan events ${result.loanEvents}; estate purchases ${result.estatePurchases}`);
  console.log(`Poor personal-credit days (<580): ${result.poorPersonalDays}; licenses while poor: ${JSON.stringify(result.licensesWhilePoor || [])}`);
  console.log(`Perk spend ${money(result.perkSpendTotal)}; unlocks ${JSON.stringify(result.perkUnlockDay)}`);
  console.log(`License days ${JSON.stringify(result.licenseDay)}; license spend ${money(result.licenseSpendTotal)}`);
  console.log(`Credit personal ${result.final.personalCredit} / business ${result.final.businessCredit}; license ${result.final.license} [${result.final.licenses.join(', ')}]`);
  console.log('Checkpoints:');
  for (const point of result.history) {
    console.log(
      `  D${pad(point.day, 4)} NW ${pad(money(point.netWorth), 10)} cash ${pad(money(point.cash), 10)} debt ${pad(money(point.debt), 9)} staff ${point.staff} payroll/day ${pad(money(point.payrollDaily), 7)} facility ${pad(money(point.companyMax), 9)} estates ${point.estateOwned} late ${point.latePays}`,
    );
  }
}

function writeReportJson(results) {
  const outDir = path.join(__dirname, '..', '.tmp-balance');
  fs.mkdirSync(outDir, { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    balanceDays: DAYS,
    realHoursApprox: Number(((DAYS * 30) / 60).toFixed(1)),
    startingCash: STARTING_CASH,
    note: 'Trading P&L is synthetic by style; loans/payroll/perks/staff/day-end use live modules.',
    styles: results,
  };
  const outPath = path.join(outDir, '500h-report.json');
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`\nWrote ${outPath}`);
  return outPath;
}

async function main() {
  console.log(`StockWay balance harness (${DAYS} game days ≈ ${((DAYS * 30) / 60).toFixed(0)} real hours, Node only)`);
  const mods = await importLiveModules();
  const results = [];
  for (const style of STYLES) {
    results.push(await runScenario(mods, style));
  }
  printSummaryTable(results);
  for (const result of results) printDetails(result);
  writeReportJson(results);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
