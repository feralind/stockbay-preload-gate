/**
 * 500-day economy / balance simulation (Node, no Electron).
 * Run: node scripts/balance-500-day.cjs
 *
 * Models three playstyles with the live finance/staff/day-end modules.
 * Trading P&L is synthetic (careful / aggressive / AFK) so we can stress
 * payroll, loans, tenure, and firm-strength underwriting over a long run.
 */
const { pathToFileURL } = require('url');
const path = require('path');

// Browser APIs used by leaderboard / profile during day-end
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => store.clear(),
};

function pct(n, d) {
  if (!d) return '0%';
  return `${((n / d) * 100).toFixed(1)}%`;
}

function money(n) {
  const v = Math.round(Number(n) || 0);
  return `$${v.toLocaleString()}`;
}

async function loadMods() {
  const root = path.join(__dirname, '..');
  const u = (p) => pathToFileURL(path.join(root, p)).href;
  const [
    portfolio, finance, staff, dayEnd, meta, market, perksCfg,
  ] = await Promise.all([
    import(u('js/portfolio.js')),
    import(u('js/finance.js')),
    import(u('js/staff.js')),
    import(u('js/day-end.js')),
    import(u('js/meta.js')),
    import(u('js/market.js')),
    import(u('js/config.js')),
  ]);
  return { portfolio, finance, staff, dayEnd, meta, market, perksCfg };
}

function makeState(mods) {
  const { portfolio, finance, meta } = mods;
  return {
    portfolio: portfolio.createPortfolio(500),
    finance: finance.createFinanceState(),
    meta: meta.createMetaState(),
    perks: [],
    staff: [],
    staffLog: [],
    stats: {},
    vaultOwned: [],
    vaultPledged: [],
    estateOwned: [],
    estateEquity: 0,
    estateCreditUsed: 0,
    estateCreditMax: 0,
    listings: [],
    achievements: {},
  };
}

function firmNw(mods, state) {
  const debt = mods.finance.getFirmDebt(state.finance, state.estateCreditUsed);
  return mods.portfolio.getFirmNetWorth(state.portfolio, {
    debt,
    vaultBook: 0,
    estateEquity: state.estateEquity || 0,
  });
}

function tryBuyPerk(state, id, cost, repNeed = 0) {
  if (state.perks.includes(id)) return false;
  if ((state.meta.reputation || 0) < repNeed) return false;
  if (state.portfolio.cash < cost) return false;
  state.portfolio.cash -= cost;
  state.perks.push(id);
  state.meta.reputation = (state.meta.reputation || 0) + 15;
  return true;
}

function tryHire(mods, state, roleId) {
  const r = mods.staff.hireStaff(roleId, state);
  return !!r.ok;
}

function tryTrainAll(mods, state) {
  let n = 0;
  for (const m of [...(state.staff || [])]) {
    const check = mods.staff.canTrain(m.id, state);
    if (check.ok) {
      const r = mods.staff.trainStaff(m.id, state);
      if (r.ok) n += 1;
    }
  }
  return n;
}

function tryAutopilot(mods, state) {
  let n = 0;
  for (const m of state.staff || []) {
    if (m.autopilot) continue;
    const check = mods.staff.canEnableAutopilot(m);
    if (check.ok) {
      mods.staff.setStaffAutopilot(m.id, true, state);
      n += 1;
    }
  }
  return n;
}

/**
 * @param {'careful'|'aggressive'|'afk'} style
 */
function dayTradingPnl(style, day, cash, hasMargin) {
  // Synthetic desk P&L — not full market tick sim.
  // Careful: steady positive edge, small variance
  // Aggressive: higher mean, fat left tail
  // AFK: weak edge, relies on staff/perks later
  const scale = Math.min(1.8, 0.55 + day / 400);
  const marginBoost = hasMargin ? 1.25 : 1;
  let mean;
  let vol;
  if (style === 'careful') {
    mean = (55 + day * 1.15) * scale * marginBoost;
    vol = 35 + day * 0.35;
  } else if (style === 'aggressive') {
    mean = (90 + day * 1.8) * scale * marginBoost;
    vol = 120 + day * 1.1;
  } else {
    mean = (18 + day * 0.45) * scale;
    vol = 40 + day * 0.5;
  }
  // Box-Muller-ish
  const u = Math.max(1e-9, Math.random());
  const v = Math.random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  let pnl = mean + z * vol;
  // Rare wipeout risk for aggressive / late AFK underleverage
  if (style === 'aggressive' && Math.random() < 0.04) pnl -= 400 + day * 2;
  if (style === 'afk' && Math.random() < 0.03) pnl -= 120 + day * 0.8;
  // Can't lose more cash than you have (soft floor for sim)
  if (pnl < 0 && cash + pnl < 50) pnl = Math.max(pnl, 50 - cash);
  return Math.round(pnl);
}

function maybeBorrow(mods, state, day, style) {
  const cash = state.portfolio.cash;
  const debt = mods.finance.getTotalDebt(state.finance);
  const nw = firmNw(mods, state);
  if (style === 'careful' && (cash > 800 || debt > nw * 0.35)) return null;
  if (style === 'afk' && cash > 400) return null;
  if (style === 'aggressive' && cash > 2500 && debt < nw * 0.6) return null;
  if (cash >= 600 && style !== 'aggressive') return null;

  const need = style === 'aggressive' ? 2500 : 800;
  const opts = { firmStrength: nw };
  const q = mods.finance.quoteLoan('chase', 'company', need, state.finance, day, opts);
  if (!q.ok) {
    const p = mods.finance.quoteLoan('chase', 'personal', Math.min(500, need), state.finance, day, opts);
    if (!p.ok) return null;
    return mods.finance.takeLoan('chase', 'personal', p.amount, state.finance, state.portfolio, day, opts);
  }
  return mods.finance.takeLoan('chase', 'company', need, state.finance, state.portfolio, day, opts);
}

function progressDesk(mods, state, day, style) {
  // Perk ladder
  tryBuyPerk(state, 'scanner', 250, 0);
  tryBuyPerk(state, 'hrDept', 400, 0);
  if (style !== 'afk' || day > 20) tryBuyPerk(state, 'margin', 950, 40);
  if (day > 40) tryBuyPerk(state, 'analyst', 700, 40);
  if (day > 80) tryBuyPerk(state, 'tradingFloor', 2800, 120);
  if (day > 120) tryBuyPerk(state, 'aiAdvisor', 18500, 280);
  if (day > 180) tryBuyPerk(state, 'hedgeFund', 28000, 500);

  if (!state.perks.includes('hrDept')) return;

  // Hire order: seller + buyer first (small firm)
  const roles = state.staff.map((s) => s.roleId);
  if (!roles.includes('exitSpec') && state.perks.includes('scanner')) tryHire(mods, state, 'exitSpec');
  if (!roles.includes('scout') && state.perks.includes('scanner')) tryHire(mods, state, 'scout');
  if (day > 30 && !roles.includes('intern')) tryHire(mods, state, 'intern');
  if (day > 60 && !roles.includes('compliance')) tryHire(mods, state, 'compliance');
  if (day > 100 && state.perks.includes('margin') && !roles.includes('risk')) tryHire(mods, state, 'risk');
  if (day > 150 && state.perks.includes('aiAdvisor') && !roles.includes('trader')) tryHire(mods, state, 'trader');
  if (style === 'aggressive' && day > 200 && state.perks.includes('hedgeFund') && !roles.includes('partner')) {
    tryHire(mods, state, 'partner');
  }

  if (day % 15 === 0) tryTrainAll(mods, state);
  if (day % 10 === 0) tryAutopilot(mods, state);
}

function snapshot(mods, state, day) {
  const debt = mods.finance.getTotalDebt(state.finance);
  const nw = firmNw(mods, state);
  const payroll = mods.staff.getDailySalary(state.staff);
  const strength = mods.finance.firmStrengthBoostPct(nw);
  const companyMax = mods.finance.maxBorrowableAmount(
    'chase', 'company', state.finance, 50, day, { firmStrength: nw },
  );
  const companyBase = mods.finance.maxBorrowableAmount(
    'chase', 'company', state.finance, 50, day, { firmStrength: 0 },
  );
  const tiers = {};
  let autopilot = 0;
  let xpSum = 0;
  for (const m of state.staff || []) {
    tiers[m.tier] = (tiers[m.tier] || 0) + 1;
    if (m.autopilot) autopilot += 1;
    xpSum += mods.staff.staffXp(m);
  }
  return {
    day,
    cash: Math.round(state.portfolio.cash),
    debt: Math.round(debt),
    nw: Math.round(nw),
    rep: Math.round(state.meta.reputation || 0),
    payroll: Math.round(payroll),
    staff: (state.staff || []).length,
    tiers,
    autopilot,
    xpSum,
    perks: state.perks.length,
    strengthPct: strength,
    companyMax,
    companyBase,
    creditP: state.finance.personalCredit,
    creditB: state.finance.businessCredit,
    late: state.finance.latePayments || 0,
  };
}

async function runScenario(mods, style, days = 500) {
  store.clear();
  const state = makeState(mods);
  const hist = [];
  const checkpoints = [1, 10, 30, 60, 100, 200, 300, 400, 500];
  let totalPnl = 0;
  let totalPayroll = 0;
  let green = 0;
  let red = 0;
  let borrowCount = 0;
  let minNw = 500;
  let maxNw = 500;
  let bankrupt = false;

  for (let day = 1; day <= days; day++) {
    const hasMargin = state.perks.includes('margin');
    const pnl = dayTradingPnl(style, day, state.portfolio.cash, hasMargin);
    state.portfolio.cash += pnl;
    totalPnl += pnl;

    // Book day-start equity for green/red REP
    const debt0 = mods.finance.getFirmDebt(state.finance, state.estateCreditUsed);
    const eq0 = mods.portfolio.getNetEquity(state.portfolio, debt0) - pnl; // approx pre-pnl
    mods.market.snapshotDayStart(eq0, state.portfolio.cash - pnl, debt0);

    progressDesk(mods, state, day, style);
    const borrowed = maybeBorrow(mods, state, day, style);
    if (borrowed?.ok) borrowCount += 1;

    // Staff "work" signal for tenure XP
    for (const m of state.staff || []) {
      m.actionsToday = m.autopilot ? 6 + Math.floor(Math.random() * 5) : 2 + Math.floor(Math.random() * 4);
      if (style === 'afk') m.actionsToday += 2;
    }

    state.meta.dayBuys = style === 'afk' ? 1 : 2 + Math.floor(Math.random() * 3);
    state.meta.daySells = style === 'afk' ? 1 : 1 + Math.floor(Math.random() * 2);

    let settlement;
    try {
      settlement = mods.dayEnd.runDayEndSettlement(state, day);
    } catch (err) {
      return { style, error: String(err?.message || err), day };
    }

    totalPayroll += settlement.payroll || 0;
    if ((settlement.stats?.equityDelta || 0) >= 100) green += 1;
    else if ((settlement.stats?.equityDelta || 0) < -100) red += 1;

    const nw = firmNw(mods, state);
    minNw = Math.min(minNw, nw);
    maxNw = Math.max(maxNw, nw);
    if (state.portfolio.cash < 0 && mods.finance.getTotalDebt(state.finance) > nw + 5000) {
      bankrupt = true;
    }

    if (checkpoints.includes(day)) hist.push(snapshot(mods, state, day));

    // Reset daily counters like a new day
    for (const m of state.staff || []) m.actionsToday = 0;
    state.meta.dayBuys = 0;
    state.meta.daySells = 0;
    state.meta.dayFees = 0;
    state.meta.dayBestTrade = 0;
    state.meta.dayWorstTrade = 0;
  }

  const final = snapshot(mods, state, days);
  return {
    style,
    days,
    final,
    hist,
    totalPnl: Math.round(totalPnl),
    totalPayroll: Math.round(totalPayroll),
    green,
    red,
    borrowCount,
    minNw: Math.round(minNw),
    maxNw: Math.round(maxNw),
    bankrupt,
    staffDetail: (state.staff || []).map((m) => ({
      role: m.roleId,
      tier: m.tier,
      xp: mods.staff.staffXp(m),
      days: mods.staff.staffTenureDays(m),
      autopilot: !!m.autopilot,
      profit: Math.round(m.profitGenerated || 0),
      mistakes: m.mistakes || 0,
    })),
  };
}

function printScenario(r) {
  console.log(`\n======== ${r.style.toUpperCase()} · ${r.days} days ========`);
  if (r.error) {
    console.log('ERROR at day', r.day, r.error);
    return;
  }
  console.log(`Final NW ${money(r.final.nw)} · cash ${money(r.final.cash)} · debt ${money(r.final.debt)}`);
  console.log(`REP ${r.final.rep} · perks ${r.final.perks} · staff ${r.final.staff} · autopilot ${r.final.autopilot}`);
  console.log(`Payroll/day ${money(r.final.payroll)} · lifetime payroll ${money(r.totalPayroll)} · trading P&L ${money(r.totalPnl)}`);
  console.log(`Green/red days ${r.green}/${r.red} · borrows ${r.borrowCount} · late pays ${r.final.late}`);
  console.log(`NW range ${money(r.minNw)} → ${money(r.maxNw)} · bankruptFlag=${r.bankrupt}`);
  console.log(`Firm strength +${r.final.strengthPct}% · Chase company max ${money(r.final.companyBase)} → ${money(r.final.companyMax)}`);
  console.log(`Credit P/B ${r.final.creditP}/${r.final.creditB} · tiers ${JSON.stringify(r.final.tiers)}`);
  console.log('Checkpoints:');
  for (const h of r.hist) {
    console.log(
      `  D${String(h.day).padStart(3)}  NW ${money(h.nw).padStart(10)}  cash ${money(h.cash).padStart(10)}  debt ${money(h.debt).padStart(8)}  staff ${h.staff}  pay/d ${money(h.payroll).padStart(6)}  str +${h.strengthPct}%  coMax ${money(h.companyMax)}`,
    );
  }
  if (r.staffDetail?.length) {
    console.log('Staff roster:');
    for (const s of r.staffDetail) {
      console.log(
        `  ${s.role.padEnd(10)} ${s.tier.padEnd(8)} XP ${String(s.xp).padStart(4)}  tenure ${String(s.days).padStart(3)}d  auto=${s.autopilot}  bookPnl ${money(s.profit)}  errs ${s.mistakes}`,
      );
    }
  }
  const burnShare = r.totalPnl > 0 ? pct(r.totalPayroll, r.totalPnl) : 'n/a';
  console.log(`Payroll as share of trading P&L: ${burnShare}`);
}

function balanceVerdict(results) {
  console.log('\n======== BALANCE VERDICT ========');
  const careful = results.find((r) => r.style === 'careful');
  const agg = results.find((r) => r.style === 'aggressive');
  const afk = results.find((r) => r.style === 'afk');

  const lines = [];
  if (careful && careful.final.nw > 5000) {
    lines.push(`PASS growth: careful ends at ${money(careful.final.nw)} (> $5k after 500d)`);
  } else {
    lines.push(`FAIL growth: careful NW ${money(careful?.final?.nw)} too weak`);
  }

  if (careful && careful.final.nw > (afk?.final?.nw || 0) * 1.15) {
    lines.push('PASS skill gap: careful beats AFK by >15% NW');
  } else {
    lines.push(`SOFT skill gap: careful ${money(careful?.final?.nw)} vs AFK ${money(afk?.final?.nw)}`);
  }

  if (agg && careful && agg.final.nw > careful.final.nw * 0.7) {
    lines.push('PASS risk premium: aggressive still competitive (not forced-broke)');
  } else {
    lines.push(`WARN aggressive: NW ${money(agg?.final?.nw)} vs careful ${money(careful?.final?.nw)}`);
  }

  if (careful && careful.final.companyMax > careful.hist[0]?.companyMax) {
    lines.push(`PASS bank strength: company facility grew (${money(careful.hist.find((h) => h.day === 1)?.companyMax)} → ${money(careful.final.companyMax)})`);
  } else {
    lines.push('FAIL bank strength: facility did not expand with NW');
  }

  const veterans = (careful?.staffDetail || []).filter((s) => s.tier !== 'newbie').length;
  if (veterans > 0) {
    lines.push(`PASS staff tenure: ${veterans} non-newbie seats; autopilot ${careful.final.autopilot}`);
  } else {
    lines.push('FAIL staff tenure: nobody promoted over 500 days');
  }

  const payShare = careful && careful.totalPnl > 0 ? careful.totalPayroll / careful.totalPnl : 0;
  if (payShare > 0.05 && payShare < 0.55) {
    lines.push(`PASS payroll bite: ${pct(careful.totalPayroll, careful.totalPnl)} of trading P&L (meaningful, not lethal)`);
  } else {
    lines.push(`WARN payroll bite: ${pct(careful?.totalPayroll, careful?.totalPnl)} of trading P&L`);
  }

  if (careful && careful.final.late === 0 && careful.borrowCount > 0) {
    lines.push('PASS loan servicing: borrowed and stayed current');
  } else if (careful?.borrowCount === 0) {
    lines.push('SOFT loans: careful never needed to borrow');
  } else {
    lines.push(`WARN loans: latePayments=${careful?.final?.late}`);
  }

  for (const line of lines) console.log(line);
}

async function main() {
  const days = Number(process.env.BALANCE_DAYS) || 500;
  console.log(`StockWay balance run · ${days} game days · 3 playstyles`);
  const mods = await loadMods();
  const styles = ['careful', 'aggressive', 'afk'];
  const results = [];
  for (const style of styles) {
    const r = await runScenario(mods, style, days);
    results.push(r);
    printScenario(r);
  }
  balanceVerdict(results);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
