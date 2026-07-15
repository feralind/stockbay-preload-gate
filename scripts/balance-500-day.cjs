/**
 * StockWay long-run balance harness (Node only, no Electron).
 *
 * Defaults to BALANCE_DAYS=500; for ~500 real desk hours use BALANCE_DAYS=1000
 * (CONFIG.REAL_MINUTES_PER_GAME_DAY = 30 → 1000 game days ≈ 500 real hours).
 *
 * Findings from 2026-07-15 BALANCE_DAYS=1000 re-run (post Staff UI + E2):
 * - careful: mid-game NW trough (~D300–400 to ~−$10k), near-flat at D500 (−$983), recovery to ~$766k by D1000;
 *   0 late pays; business credit 850; facility $12.1k → $40.5k; 1 estate.
 * - aggressive: still high NW (~$2.24M) via cash + synthetic P&L, but credit 300 blocks property draws;
 *   989 late pays; facility $0; 2 cash estates.
 * - AFK: ends ~−$1.8k; payroll > synthetic P&L (~114%).
 *
 * E2 mechanical (no loud UI): HELOC needs 580+ business credit; Poor credit −5m margin grace;
 * estate closing 2%.
 */
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const STARTING_CASH = 500;
const DAYS = Number(process.env.BALANCE_DAYS || 500);
const STYLES = ['careful', 'aggressive', 'afk'];
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
  ] = await Promise.all([
    import(url('js/portfolio.js')),
    import(url('js/finance.js')),
    import(url('js/staff.js')),
    import(url('js/day-end.js')),
    import(url('js/meta.js')),
    import(url('js/market.js')),
    import(url('js/config.js')),
    import(url('js/estates.js')),
  ]);
  return { portfolio, finance, staff, dayEnd, meta, market, config, estates };
}

function makeState(mods) {
  return {
    portfolio: mods.portfolio.createPortfolio(STARTING_CASH),
    finance: mods.finance.createFinanceState(),
    meta: mods.meta.createMetaState(),
    perks: [],
    staff: [],
    staffLog: [],
    stats: {},
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
  if ((state.meta.reputation || 0) < (perk.repRequired || 0)) return false;
  if (state.portfolio.cash < perk.cost + reserve) return false;
  state.portfolio.cash -= perk.cost;
  state.perks.push(perkId);
  mods.meta.adjustReputation(state.meta, 15, `perk_${perkId}`);
  if (track) {
    track.perkSpendTotal += perk.cost;
    if (track.perkUnlockDay[perkId] == null) track.perkUnlockDay[perkId] = track.day;
  }
  return true;
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
  const marginBoost = hasMargin ? 1.18 : 1;
  const staffBoost = 1 + Math.min(0.28, staffCount * 0.025 + autoCount * 0.02);
  const cashDampen = Math.max(0.65, Math.min(1.4, Math.sqrt(Math.max(250, cash) / 1800)));

  let mean = 0;
  let volatility = 0;
  if (style === 'careful') {
    mean = (92 + day * 0.88) * scale * marginBoost * staffBoost * cashDampen;
    volatility = 34 + day * 0.18;
  } else if (style === 'aggressive') {
    mean = (128 + day * 1.42) * scale * (hasMargin ? 1.36 : 1.05) * staffBoost * cashDampen;
    volatility = 145 + day * 0.88;
  } else {
    mean = (10 + day * 0.12) * scale * (1 + autoCount * 0.04);
    volatility = 44 + day * 0.23;
  }

  let pnl = mean + normal(rand) * volatility;
  if (style === 'aggressive' && rand() < 0.055) pnl -= 525 + day * 2.35;
  if (style === 'afk' && rand() < 0.04) pnl -= 140 + day * 0.8;
  if (style === 'careful' && rand() < 0.012) pnl -= 140 + day * 0.45;

  if (pnl < 0 && cash + pnl < 35) pnl = 35 - cash;
  return Math.round(pnl);
}

function borrowIfNeeded(mods, state, style, day) {
  const cash = Number(state.portfolio.cash) || 0;
  const debt = activeDebt(mods, state);
  const netWorth = firmNetWorth(mods, state);
  const maxDebtPct = style === 'careful' ? 0.28 : style === 'aggressive' ? 1.2 : 0.55;
  const trigger = style === 'careful' ? 650 : style === 'aggressive' ? 1650 : 300;
  if (cash >= trigger) return null;
  if (netWorth > 0 && debt > Math.max(1000, netWorth * maxDebtPct)) return null;

  const firmStrength = Math.max(0, netWorth);
  const companyMax = mods.finance.maxBorrowableAmount('chase', 'company', state.finance, 50, day, { firmStrength });
  const personalMax = mods.finance.maxBorrowableAmount('chase', 'personal', state.finance, 50, day, { firmStrength });
  const target = style === 'aggressive' ? 3200 : style === 'careful' ? 900 : 600;

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
  if (style === 'afk' || day < 250) return null;
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

function setSyntheticDayCounters(mods, state, style, pnl, rand) {
  const trades = style === 'afk'
    ? 1 + Math.floor(rand() * 2)
    : style === 'aggressive'
      ? 5 + Math.floor(rand() * 5)
      : 3 + Math.floor(rand() * 3);
  state.meta.dayBuys = Math.ceil(trades / 2);
  state.meta.daySells = Math.floor(trades / 2);
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
  const rank = mods.config.getRepRank(state.meta.reputation || 0);
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
    rep: Math.round(state.meta.reputation || 0),
    repRank: rank?.id || 'newcomer',
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
  const seed = { careful: 49217, aggressive: 91873, afk: 30091 }[style];
  const rand = seededRandom(seed);
  const previousRandom = Math.random;
  Math.random = rand;

  try {
    const state = makeState(mods);
    const checkpoints = activeCheckpoints(DAYS);
    const history = [];
    const track = { day: 1, perkSpendTotal: 0, perkUnlockDay: {} };
    let totalPnl = 0;
    let payrollLifetime = 0;
    let greenDays = 0;
    let redDays = 0;
    let loanEvents = 0;
    let borrows = 0;
    let estatePurchases = 0;
    let startFacility = null;
    let dayHitTrusted = null;
    let dayHitVeteran = null;
    let dayHitElite = null;
    let dayHitLegend = null;

    for (let day = 1; day <= DAYS; day += 1) {
      const debtBefore = firmDebt(mods, state);
      const equityBefore = mods.portfolio.getNetEquity(state.portfolio, debtBefore);
      mods.market.snapshotDayStart(equityBefore, state.portfolio.cash, debtBefore);
      state.meta.challenge = mods.meta.rollDailyChallenge(day);

      const pnl = syntheticTradingPnl(style, day, state, rand);
      state.portfolio.cash += pnl;
      totalPnl += pnl;

      progressDesk(mods, state, style, day, track);
      const borrowed = borrowIfNeeded(mods, state, style, day);
      if (borrowed?.ok) borrows += 1;
      if (maybeBuyEstate(mods, state, style, day)) estatePurchases += 1;
      maybeUseEstateCredit(mods, state, style);
      setSyntheticDayCounters(mods, state, style, pnl, rand);

      const settlement = mods.dayEnd.runDayEndSettlement(state, day);
      payrollLifetime += settlement.payroll || 0;
      loanEvents += (settlement.loanEvents || []).length;
      if ((settlement.stats?.equityDelta || 0) >= 100) greenDays += 1;
      if ((settlement.stats?.equityDelta || 0) < -100) redDays += 1;

      const rep = state.meta.reputation || 0;
      if (dayHitTrusted == null && rep >= 120) dayHitTrusted = day;
      if (dayHitVeteran == null && rep >= 250) dayHitVeteran = day;
      if (dayHitElite == null && rep >= 500) dayHitElite = day;
      if (dayHitLegend == null && rep >= 1800) dayHitLegend = day;

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
      perkUnlockDay: track.perkUnlockDay,
      perkSpendTotal: Math.round(track.perkSpendTotal),
      milestones: {
        trustedTraderDay: dayHitTrusted,
        marketVeteranDay: dayHitVeteran,
        eliteDeskDay: dayHitElite,
        marketLegendDay: dayHitLegend,
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
  console.log(`Perk spend ${money(result.perkSpendTotal)}; unlocks ${JSON.stringify(result.perkUnlockDay)}`);
  console.log(`Milestones ${JSON.stringify(result.milestones)}`);
  console.log(`Credit personal ${result.final.personalCredit} / business ${result.final.businessCredit}; REP ${result.final.rep} (${result.final.repRank})`);
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
