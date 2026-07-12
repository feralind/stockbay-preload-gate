// @ts-check
import { CONFIG } from './config.js';
import { getCachedQuote } from './api.js';
import { buyLong, sellLong, openShort, coverShort } from './portfolio.js';
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

export const STAFF_TIERS = {
  newbie: { id: 'newbie', name: 'Newbie', efficiency: 0.7, mistakeRate: 0.22, next: 'veteran', trainCost: 150 },
  veteran: { id: 'veteran', name: 'Veteran', efficiency: 1.0, mistakeRate: 0.10, next: 'expert', trainCost: 400 },
  expert: { id: 'expert', name: 'Expert', efficiency: 1.35, mistakeRate: 0.03, next: null, trainCost: 0 },
};

export const STAFF_ROLES = {
  intern: {
    id: 'intern',
    name: 'Intern',
    title: 'Operations Intern',
    mark: 'IN',
    color: '#8b949e',
    salary: 8,
    hireCost: 120,
    desc: 'Auto-refreshes listings & keeps the desk organized',
    automates: 'Listing refresh',
    requires: [],
  },
  scout: {
    id: 'scout',
    name: 'Listing Scout',
    title: 'Deal Hunter',
    mark: 'SC',
    color: '#58a6ff',
    salary: 18,
    hireCost: 350,
    desc: 'Auto-snipes GREAT DEAL listings when you have cash',
    automates: 'Deal sniping',
    requires: ['scanner'],
  },
  compliance: {
    id: 'compliance',
    name: 'Compliance Officer',
    title: 'Risk Auditor',
    mark: 'CO',
    color: '#79c0ff',
    salary: 22,
    hireCost: 450,
    desc: 'Cuts firm-wide mistake rate and flags stretched positions',
    automates: 'Mistake control',
    requires: [],
  },
  research: {
    id: 'research',
    name: 'Research Analyst',
    title: 'Equity Research',
    mark: 'RA',
    color: '#56d4dd',
    salary: 32,
    hireCost: 600,
    desc: 'Surfaces near-deals and boosts scout / AI trader hit rate',
    automates: 'Deal insight',
    requires: ['analyst'],
  },
  trader: {
    id: 'trader',
    name: 'Junior Trader',
    title: 'Execution Desk',
    mark: 'TR',
    color: '#3fb950',
    salary: 28,
    hireCost: 550,
    desc: 'Auto-buys top AI picks (needs AI Advisor perk)',
    automates: 'AI pick buys',
    requires: ['aiAdvisor'],
  },
  risk: {
    id: 'risk',
    name: 'Risk Manager',
    title: 'Risk Desk',
    mark: 'RK',
    color: '#f0883e',
    salary: 35,
    hireCost: 700,
    desc: 'Auto-sells longs at +12% profit or -7% stop loss',
    automates: 'TP / stop exits',
    requires: ['margin'],
  },
  shortSpec: {
    id: 'shortSpec',
    name: 'Short Specialist',
    title: 'Short Desk',
    mark: 'SH',
    color: '#f85149',
    salary: 40,
    hireCost: 850,
    desc: 'Auto-shorts overbought stocks',
    automates: 'Overbought shorts',
    requires: ['margin'],
  },
  quant: {
    id: 'quant',
    name: 'Quant Analyst',
    title: 'Algorithmic Trading',
    mark: 'QT',
    color: '#a371f7',
    salary: 55,
    hireCost: 1200,
    desc: 'Runs momentum algo — buys breakouts, covers losing shorts',
    automates: 'Momentum algo',
    requires: ['analyst', 'margin'],
  },
  partner: {
    id: 'partner',
    name: 'Managing Partner',
    title: 'Firm Leadership',
    mark: 'MP',
    color: '#e3b341',
    salary: 90,
    hireCost: 2500,
    desc: 'Boosts all staff efficiency + daily firm bonus',
    automates: 'Floor boost + bonus',
    requires: ['hrDept', 'hedgeFund'],
  },
};

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
  return staff.filter(s => s.active).reduce((sum, s) => {
    const role = STAFF_ROLES[s.roleId];
    const tierMult = s.tier === 'expert' ? 1.25 : s.tier === 'veteran' ? 1.1 : 1;
    return sum + Math.round((role?.salary || 0) * tierMult);
  }, 0);
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
  const rate = Math.max(0.01, tier.mistakeRate * mistakeScale);
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
    const eff = tier.efficiency * partnerBoost * staffEfficiencyMultiplier(member) * floorBoost;

    member.progress = Math.min(100, (member.progress || 0) + 8 + Math.random() * 12 * eff);
    if (member.progress < 100) {
      member.status = member.status?.startsWith('Mistake') ? member.status : 'Working…';
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
        if (Math.random() < 0.55 * eff * researchBoost) {
          const deal = state.listings?.find(l => l.isDeal && !pf.longs[l.sym]);
          if (deal && pf.cash > deal.price * 10) {
            const shares = Math.min(10, Math.floor(pf.cash * 0.05 / deal.price));
            if (shares >= 1) {
              const r = buyLong(pf, deal.sym, shares, staffFill(deal.sym, 'buy', shares, deal.price, perks));
              if (r.ok) {
                member.profitGenerated = (member.profitGenerated || 0); // tracked on sell
                member.status = `Sniping ${deal.sym}`;
                actions.push({ staff: member.name, action: `Sniped ${shares} ${deal.sym} @ $${deal.price.toFixed(2)}` });
                member.actionsToday++;
              }
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
        if (Math.random() < 0.5 * eff) {
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

      case 'trader':
        if (hasAi && Math.random() < 0.4 * eff * researchBoost && state.aiTopPick?.signal === 'BUY') {
          const sym = state.aiTopPick.sym;
          const q = getCachedQuote(sym);
          if (q && pf.cash > q.price * 5 && !pf.longs[sym]) {
            const shares = Math.min(5, Math.floor(pf.cash * 0.03 / q.price));
            if (shares >= 1) {
              const r = buyLong(pf, sym, shares, staffFill(sym, 'buy', shares, q.price, perks));
              if (r.ok) {
                member.status = `Buying ${sym}`;
                actions.push({ staff: member.name, action: `Bought ${shares} ${sym} (AI signal)` });
                member.actionsToday++;
              }
            }
          }
        } else {
          member.status = hasAi ? 'Watching AI signals' : 'Idle — needs AI Advisor';
        }
        break;

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

      case 'shortSpec':
        if (hasMargin && Math.random() < 0.45 * eff) {
          const candidates = ['TSLA', 'NVDA', 'AMD', 'COIN', 'PLTR', 'SOFI'].filter(s => {
            const q = getCachedQuote(s);
            return q && q.changePct > 3 && !pf.shorts[s] && !pf.longs[s];
          });
          if (candidates.length) {
            const sym = candidates[Math.floor(Math.random() * candidates.length)];
            const q = getCachedQuote(sym);
            const shares = Math.min(5, Math.floor(pf.cash * 0.02 / q.price));
            if (shares >= 1) {
              const r = openShort(pf, sym, shares, staffFill(sym, 'short', shares, q.price, perks), true);
              if (r.ok) {
                state.stats = state.stats || {};
                state.stats.shortsOpened = (state.stats.shortsOpened || 0) + 1;
                member.status = `Shorting ${sym}`;
                actions.push({ staff: member.name, action: `Shorted ${shares} ${sym} (overbought)` });
                member.actionsToday++;
              }
            }
          } else member.status = 'Hunting shorts';
        } else member.status = hasMargin ? 'On short desk' : 'Idle — needs Margin';
        break;

      case 'quant':
        if (hasMargin && Math.random() < 0.5 * eff) {
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
              return q && q.changePct > 1.5 && !pf.longs[s] && pf.cash > q.price * 3;
            });
            if (breakout) {
              const q = getCachedQuote(breakout);
              const shares = Math.min(3, Math.floor(pf.cash * 0.02 / q.price));
              if (shares >= 1) {
                const r = buyLong(pf, breakout, shares, staffFill(breakout, 'buy', shares, q.price, perks));
                if (r.ok) {
                  member.status = `Momentum ${breakout}`;
                  actions.push({ staff: member.name, action: `Momentum buy ${shares} ${breakout}` });
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
        if (Math.random() < 0.35 * eff) {
          member.status = 'Refreshing desk';
          actions.push({ staff: member.name, action: 'Refreshed market listings' });
          member.actionsToday++;
        } else member.status = 'Filing reports';
        break;

      case 'partner':
        if (Math.random() < 0.25 * eff) {
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
    state.staffLog?.unshift({ time: Date.now(), staff: 'HR', action: `Fired ${m.name}` });
  }
  return { ok: true };
}
