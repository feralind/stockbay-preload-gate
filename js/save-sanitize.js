// @ts-check
/** Clamp and validate run data on load / import — blocks save-edit god-mode exploits. */
import { CONFIG, PERKS } from './config.js';
import { createFinanceState, getFirmDebt } from './finance.js';
import { createMetaState } from './meta.js';
import { normalizePerkCalloutsShown } from './onboarding-walkthrough.js';
import { KNOWN_VAULT_IDS, VAULT_COST_BY_ID, getVaultBookValue } from './vault.js';
import {
  BLACKMARKET_COST_BY_ID, BLACKMARKET_ITEM_POOL, BLACKMARKET_SEEN_EXPIRED_MAX, KNOWN_BLACKMARKET_IDS,
} from './blackmarket.js';
import { PRIVATE_SALON_POOL, SALON_SEEN_EXPIRED_MAX } from './private-salon.js';
import { sanitizeEquippedRelics } from './relics.js';
import { sanitizeOfficeProgress } from './office.js';
import { sanitizeLuxuryProgress, getLuxuryItem } from './luxury.js';
import { sanitizeEstateProgress, getEstateAsset } from './estates.js';
import { sanitizeMegaGoalsClaimed, MEGA_GOALS } from './mega-goals.js';
import { getFirmNetWorth } from './portfolio.js';
import { THE_SEAT } from './the-seat.js';
import {
  getCollectionClaimedCashTotal,
  sanitizeCollectionClaims,
  COLLECTION_MILESTONE_BY_ID,
} from './collection-log.js';
import { sanitizeSetClaims, getSetById } from './collection-flavor.js';

const MAX_CASH = 1e12;
const MAX_SHARES = 1_000_000;
const KNOWN_PERK_IDS = new Set(Object.keys(PERKS));

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function sanitizeShares(n) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v < 0 || v > MAX_SHARES) return 0;
  return v;
}

function sanitizePosition(pos, { isShort = false } = {}) {
  if (!pos || typeof pos !== 'object') return null;
  const shares = sanitizeShares(pos.shares);
  if (shares <= 0) return null;
  const avgPrice = Number(pos.avgPrice);
  if (!Number.isFinite(avgPrice) || avgPrice <= 0) return null;
  const out = { shares, avgPrice };
  if (isShort) {
    let mh = Number(pos.marginHeld);
    if (!Number.isFinite(mh) || mh < 0) {
      mh = shares * avgPrice * CONFIG.MARGIN_REQUIREMENT;
    }
    out.marginHeld = mh;
  } else if (pos.marginHeld != null) {
    const mh = Number(pos.marginHeld);
    if (Number.isFinite(mh) && mh >= 0) out.marginHeld = mh;
  }
  if (pos.openedDay != null) {
    const od = Math.floor(Number(pos.openedDay));
    if (Number.isFinite(od) && od >= 1) out.openedDay = od;
  }
  if (Array.isArray(pos.lots)) {
    out.lots = pos.lots.map((lot) => {
      if (!lot || typeof lot !== 'object') return null;
      const ls = sanitizeShares(lot.shares);
      const lp = Number(lot.avgPrice);
      const od = Math.floor(Number(lot.openedDay) || 1);
      if (ls <= 0 || !Number.isFinite(lp) || lp <= 0) return null;
      return { shares: ls, avgPrice: lp, openedDay: Math.max(1, od) };
    }).filter(Boolean).slice(0, 40);
  }
  if (pos.stopLoss != null && Number.isFinite(Number(pos.stopLoss))) out.stopLoss = Number(pos.stopLoss);
  if (pos.takeProfit != null && Number.isFinite(Number(pos.takeProfit))) out.takeProfit = Number(pos.takeProfit);
  if (pos.priceCorrectedAck) out.priceCorrectedAck = true;
  return out;
}

function sanitizePortfolio(portfolio) {
  if (!portfolio || typeof portfolio !== 'object') return null;
  const p = { ...portfolio };
  let cash = Number(p.cash);
  if (!Number.isFinite(cash)) cash = CONFIG.STARTING_CASH;
  // Negative cash is a margin debit (perk); still clamp god-mode magnitude
  p.cash = clamp(cash, -MAX_CASH, MAX_CASH);

  const longs = {};
  Object.entries(p.longs || {}).forEach(([sym, row]) => {
    const clean = sanitizePosition(row, { isShort: false });
    if (clean && /^[A-Z0-9.\-]{1,16}$/.test(String(sym).toUpperCase())) longs[sym.toUpperCase()] = clean;
  });
  p.longs = longs;

  const shorts = {};
  Object.entries(p.shorts || {}).forEach(([sym, row]) => {
    const clean = sanitizePosition(row, { isShort: true });
    if (clean && /^[A-Z0-9.\-]{1,16}$/.test(String(sym).toUpperCase())) shorts[sym.toUpperCase()] = clean;
  });
  p.shorts = shorts;

  p.options = Array.isArray(p.options)
    ? p.options.filter((opt) => {
      if (!opt || typeof opt !== 'object') return false;
      const qty = sanitizeShares(opt.qty);
      const premium = Number(opt.premium);
      const strike = Number(opt.strike);
      return qty > 0 && Number.isFinite(premium) && premium >= 0
        && Number.isFinite(strike) && strike > 0 && typeof opt.sym === 'string';
    }).map((opt) => ({ ...opt, qty: sanitizeShares(opt.qty) }))
    : [];

  p.pendingOrders = Array.isArray(p.pendingOrders) ? p.pendingOrders.filter((o) => {
    if (!o || typeof o !== 'object') return false;
    const shares = sanitizeShares(o.shares);
    const limitPrice = Number(o.limitPrice);
    return shares > 0 && Number.isFinite(limitPrice) && limitPrice > 0
      && ['long', 'short', 'sell', 'cover'].includes(o.side);
  }) : [];

  p.orderTickets = Array.isArray(p.orderTickets) ? p.orderTickets.filter((t) => {
    if (!t || typeof t !== 'object') return false;
    return typeof t.id === 'string' && typeof t.sym === 'string'
      && ['open', 'filled', 'cancelled'].includes(t.status);
  }).slice(0, 40) : [];

  p.realizedPnL = Number.isFinite(Number(p.realizedPnL)) ? Number(p.realizedPnL) : 0;
  p.totalTrades = Math.max(0, Math.floor(Number(p.totalTrades) || 0));
  p.history = Array.isArray(p.history) ? p.history.slice(0, 200) : [];

  if (p.marginCall && typeof p.marginCall === 'object') {
    const level = p.marginCall.level === 'call' || p.marginCall.level === 'warn' ? p.marginCall.level : null;
    if (level) {
      p.marginCall = {
        level,
        startedAbs: Math.max(0, Math.floor(Number(p.marginCall.startedAbs) || 0)),
        lastTickAbs: p.marginCall.lastTickAbs != null
          ? Math.max(0, Math.floor(Number(p.marginCall.lastTickAbs) || 0))
          : null,
        graceLeft: p.marginCall.graceLeft != null
          ? Math.max(0, Number(p.marginCall.graceLeft) || 0)
          : undefined,
        toasted: !!p.marginCall.toasted,
      };
    } else {
      delete p.marginCall;
    }
  } else {
    delete p.marginCall;
  }

  const ta = p.taxAccrual && typeof p.taxAccrual === 'object' ? p.taxAccrual : {};
  p.taxAccrual = {
    shortTermGain: Math.max(0, Number(ta.shortTermGain) || 0),
    longTermGain: Math.max(0, Number(ta.longTermGain) || 0),
    shortTermLoss: Math.max(0, Number(ta.shortTermLoss) || 0),
    longTermLoss: Math.max(0, Number(ta.longTermLoss) || 0),
  };
  p.taxOwed = Math.max(0, Number(p.taxOwed) || 0);

  return p;
}

/** Returns sanitized run object or null if unusable. */
export function sanitizeRunData(run) {
  if (!run || typeof run !== 'object') return null;
  if (!run.portfolio || typeof run.portfolio.cash !== 'number') return null;

  const out = { ...run };
  out.v = Math.max(1, Math.floor(Number(out.v) || 1));
  out.portfolio = sanitizePortfolio(out.portfolio);
  if (!out.portfolio) return null;

  if (Array.isArray(out.perks)) {
    out.perks = [...new Set(out.perks.filter((id) => KNOWN_PERK_IDS.has(id)))];
  } else {
    out.perks = [];
  }

  if (Array.isArray(out.vaultOwned)) {
    out.vaultOwned = [...new Set(out.vaultOwned.filter((id) => KNOWN_VAULT_IDS.has(id)))];
  } else {
    out.vaultOwned = [];
  }
  const rawVaultSpend = Number(out.vaultSpentTotal);
  out.vaultSpentTotal = Number.isFinite(rawVaultSpend) ? clamp(rawVaultSpend, 0, MAX_CASH) : 0;
  // Save-edit hardening: keep only as many owned IDs as the spend ledger can justify.
  if (out.vaultOwned.length) {
    let justifiedSpend = 0;
    out.vaultOwned = out.vaultOwned.filter((id) => {
      const cost = Number(VAULT_COST_BY_ID.get(id) || 0);
      if (justifiedSpend + cost <= out.vaultSpentTotal + 0.001) {
        justifiedSpend += cost;
        return true;
      }
      return false;
    });
  }

  if (Array.isArray(out.vaultPledged)) {
    out.vaultPledged = [...new Set(out.vaultPledged.filter((id) => (
      KNOWN_VAULT_IDS.has(id) && out.vaultOwned.includes(id)
    )))];
  } else {
    out.vaultPledged = [];
  }

  const rawSalonSpend = Number(out.salonSpentTotal);
  out.salonSpentTotal = Number.isFinite(rawSalonSpend) ? clamp(rawSalonSpend, 0, MAX_CASH) : 0;
  if (Array.isArray(out.salonSeenExpired)) {
    out.salonSeenExpired = out.salonSeenExpired
      .filter((id) => PRIVATE_SALON_POOL.some((item) => item.id === id))
      .slice(-SALON_SEEN_EXPIRED_MAX);
  } else {
    out.salonSeenExpired = [];
  }

  if (Array.isArray(out.blackMarketOwned)) {
    out.blackMarketOwned = [...new Set(out.blackMarketOwned.filter((id) => KNOWN_BLACKMARKET_IDS.has(id)))];
  } else {
    out.blackMarketOwned = [];
  }
  const rawBlackSpend = Number(out.blackMarketSpentTotal);
  out.blackMarketSpentTotal = Number.isFinite(rawBlackSpend) ? clamp(rawBlackSpend, 0, MAX_CASH) : 0;
  if (out.blackMarketOwned.length) {
    let justifiedSpend = 0;
    out.blackMarketOwned = out.blackMarketOwned.filter((id) => {
      const cost = Number(BLACKMARKET_COST_BY_ID.get(id) || 0);
      if (justifiedSpend + cost <= out.blackMarketSpentTotal + 0.001) {
        justifiedSpend += cost;
        return true;
      }
      return false;
    });
  }
  if (Array.isArray(out.blackMarketSeenExpired)) {
    out.blackMarketSeenExpired = out.blackMarketSeenExpired
      .filter((id) => KNOWN_BLACKMARKET_IDS.has(id))
      .slice(-BLACKMARKET_SEEN_EXPIRED_MAX);
  } else {
    out.blackMarketSeenExpired = [];
  }

  const seatPurchaseDay = Math.floor(Number(out.seatPurchaseDay) || 0);
  const seatSpentTotal = Number(out.seatSpentTotal);
  out.seatPurchaseDay = seatPurchaseDay >= 1 ? seatPurchaseDay : null;
  out.seatSpentTotal = Number.isFinite(seatSpentTotal) ? clamp(seatSpentTotal, 0, MAX_CASH) : 0;
  const seatProofValid = out.seatPurchaseDay != null && out.seatSpentTotal === THE_SEAT.cost;
  out.seatOwned = !!out.seatOwned && seatProofValid;
  if (!out.seatOwned) {
    out.seatPurchaseDay = null;
    if (out.seatSpentTotal < THE_SEAT.cost) out.seatSpentTotal = 0;
  }
  out.blackMarketEquippedRelics = sanitizeEquippedRelics(out.blackMarketEquippedRelics, {
    ownedRelics: out.blackMarketOwned,
    seatOwned: out.seatOwned,
  });

  const office = sanitizeOfficeProgress({
    officeTierId: out.officeTierId,
    officeSpentTotal: out.officeSpentTotal,
  });
  out.officeTierId = office.officeTierId;
  out.officeSpentTotal = office.officeSpentTotal;

  const luxury = sanitizeLuxuryProgress({
    luxuryOwned: out.luxuryOwned,
    luxurySpentTotal: out.luxurySpentTotal,
  });
  out.luxuryOwned = luxury.luxuryOwned;
  out.luxurySpentTotal = luxury.luxurySpentTotal;

  const estate = sanitizeEstateProgress({
    estateOwned: out.estateOwned,
    estateSpentTotal: out.estateSpentTotal,
    estateEquityExtracted: out.estateEquityExtracted,
    estateCreditUsed: out.estateCreditUsed,
    estateCashOutCount: out.estateCashOutCount,
    estateLastCashOutDay: out.estateLastCashOutDay,
  });
  out.estateOwned = estate.estateOwned;
  out.estateSpentTotal = estate.estateSpentTotal;
  out.estateEquity = estate.estateEquity;
  out.estateEquityExtracted = estate.estateEquityExtracted;
  out.estateCreditUsed = estate.estateCreditUsed;
  out.estateCreditMax = estate.estateCreditMax;
  out.resilienceRating = estate.resilienceRating;
  out.estateIncomePerDay = estate.estateIncomePerDay;
  out.estateUpkeepPerDay = estate.estateUpkeepPerDay;
  out.estateCashOutCount = estate.estateCashOutCount;
  out.estateLastCashOutDay = estate.estateLastCashOutDay;

  const collectionOpts = {
    blackMarketPool: BLACKMARKET_ITEM_POOL,
    seatItem: THE_SEAT,
    salonPool: PRIVATE_SALON_POOL,
  };
  out.collectionClaims = sanitizeCollectionClaims(out.collectionClaims, out, collectionOpts);
  out.collectionRewardCashTotal = getCollectionClaimedCashTotal(out.collectionClaims);

  if (out.meta && typeof out.meta === 'object') {
    const m = { ...createMetaState(), ...out.meta };
    m.reputation = clamp(Math.floor(Number(m.reputation) || 0), 0, 100_000);
    m.perkCalloutsShown = normalizePerkCalloutsShown(m.perkCalloutsShown);
    m.portfolioTourShown = !!m.portfolioTourShown;
    m.marginCallCoachShown = !!m.marginCallCoachShown;
    m.circuitHaltCoachShown = !!m.circuitHaltCoachShown;
    m.simStatusCoachShown = !!m.simStatusCoachShown;
    m.blackMarketLegendCoachShown = !!m.blackMarketLegendCoachShown;
    m.vaultAuraRepToday = Math.max(0, Math.floor(Number(m.vaultAuraRepToday) || 0));
    const claimedFlairs = new Set(
      out.collectionClaims
        .map((id) => COLLECTION_MILESTONE_BY_ID.get(id)?.flair)
        .filter(Boolean),
    );
    const flair = typeof m.collectionFlair === 'string' ? m.collectionFlair.trim().slice(0, 40) : '';
    m.collectionFlair = flair && claimedFlairs.has(flair) ? flair : null;

    const debt = out.finance ? getFirmDebt(out.finance, out.estateCreditUsed) : Math.max(0, Number(out.estateCreditUsed) || 0);
    const netWorth = getFirmNetWorth(out.portfolio, {
      debt,
      vaultBook: getVaultBookValue(out),
      estateEquity: out.estateEquity,
    });
    const megaCtx = { netWorth, ...collectionOpts };
    m.megaGoalsClaimed = sanitizeMegaGoalsClaimed(m.megaGoalsClaimed, out, megaCtx);
    const megaFlairSet = new Set(
      m.megaGoalsClaimed
        .map((id) => MEGA_GOALS.find((g) => g.id === id)?.flair)
        .filter(Boolean),
    );
    const megaFlair = typeof m.megaGoalFlair === 'string' ? m.megaGoalFlair.trim().slice(0, 40) : '';
    m.megaGoalFlair = megaFlair && megaFlairSet.has(megaFlair) ? megaFlair : null;

    const luxFlairSet = new Set(
      out.luxuryOwned.map((id) => getLuxuryItem(id)?.flair).filter(Boolean),
    );
    const luxFlair = typeof m.luxuryFlair === 'string' ? m.luxuryFlair.trim().slice(0, 40) : '';
    m.luxuryFlair = luxFlair && luxFlairSet.has(luxFlair) ? luxFlair : null;

    const estateFlairSet = new Set(
      (out.estateOwned || []).map((id) => getEstateAsset(id)?.flair).filter(Boolean),
    );
    const estateFlair = typeof m.estateFlair === 'string' ? m.estateFlair.trim().slice(0, 40) : '';
    m.estateFlair = estateFlair && estateFlairSet.has(estateFlair) ? estateFlair : null;

    m.setClaims = sanitizeSetClaims(m.setClaims, out);
    const setFlairSet = new Set(
      m.setClaims
        .map((id) => getSetById(id)?.flair)
        .filter(Boolean),
    );
    const setFlair = typeof m.setFlair === 'string' ? m.setFlair.trim().slice(0, 40) : '';
    m.setFlair = setFlair && setFlairSet.has(setFlair) ? setFlair : null;
    out.meta = m;
  }

  if (out.finance && typeof out.finance === 'object') {
    const f = { ...createFinanceState(), ...out.finance };
    f.personalCredit = clamp(Math.floor(Number(f.personalCredit) || 680), 300, 850);
    f.businessCredit = clamp(Math.floor(Number(f.businessCredit) || 700), 300, 850);
    if (!Array.isArray(f.loans)) f.loans = [];
    out.finance = f;
  }

  return out;
}
