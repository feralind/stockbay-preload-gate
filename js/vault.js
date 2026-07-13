// @ts-check
import { getSpendableCash } from './portfolio.js';
import { PRIVATE_SALON_ITEMS } from './private-salon.js';

/**
 * Trophy Vault catalog — display names/descs are collectible-themed (Phase A).
 * Ids, cost, repRequired, and category are save/economy keys — do not rename ids.
 * Art is foil SVG in ui/vault.js (no per-item icon string keys).
 */
export const VAULT_ITEMS = {
  goldTerminal: {
    id: 'goldTerminal',
    name: 'Gilded Astrolabe',
    desc: 'Antique navigational instrument. Appraises at cost into Net Worth. Equipping feeds Desk Prestige.',
    cost: 5000,
    category: 'dashboard',
    repRequired: 0,
  },
  tungstenDial: {
    id: 'tungstenDial',
    name: 'Sundial Fragment, Weathered',
    desc: 'Ancient timekeeping fragment. Book-value wealth + Aura progress when equipped.',
    cost: 7200,
    category: 'dashboard',
    repRequired: 40,
  },
  obsidianTicker: {
    id: 'obsidianTicker',
    name: 'Obsidian Mirror',
    desc: 'Polished volcanic-glass mirror. Appraised collectible that powers Desk Prestige.',
    cost: 9800,
    category: 'dashboard',
    repRequired: 90,
  },
  yachtBackground: {
    id: 'yachtBackground',
    name: 'Study of the Tide',
    desc: 'Impressionist seascape, oil on canvas. Counts as vault wealth and an Aura slot when equipped.',
    cost: 15000,
    category: 'background',
    repRequired: 100,
  },
  penthouseNight: {
    id: 'penthouseNight',
    name: 'Nocturne No. 7',
    desc: 'Moody nocturne painting with real desk presence. Appraises into Net Worth.',
    cost: 22000,
    category: 'background',
    repRequired: 160,
  },
  bullMarble: {
    id: 'bullMarble',
    name: 'The Gilded Bull, Attributed',
    desc: 'A bronze-and-marble piece of disputed origin. High appraisal; equips into Desk Prestige.',
    cost: 28000,
    category: 'background',
    repRequired: 220,
  },
  crashDayTape: {
    id: 'crashDayTape',
    name: 'First Edition Ticker Tape, 1929',
    desc: 'Framed financial-history artifact. Collectible book value and Aura fuel when equipped.',
    cost: 8000,
    category: 'trophy',
    repRequired: 0,
  },
  apexBadge: {
    id: 'apexBadge',
    name: 'Signet Ring, Unknown House',
    desc: 'Antique engraved ring, provenance unclear. Visible flex with appraisal weight and Aura progress.',
    cost: 12000,
    category: 'trophy',
    repRequired: 80,
  },
  halcyonPin: {
    id: 'halcyonPin',
    name: 'Gold Coin, Byzantine Mint',
    desc: 'Ancient coin from a disputed mint. Appraises high; equips into Aura.',
    cost: 17500,
    category: 'trophy',
    repRequired: 180,
  },
  floorLegendTitle: {
    id: 'floorLegendTitle',
    name: 'Recognized Collector',
    desc: 'Provenance-world recognition with Desk Prestige contribution when equipped.',
    cost: 9000,
    category: 'title',
    repRequired: 60,
  },
  volatilityWhisperer: {
    id: 'volatilityWhisperer',
    name: 'Provenance: Verified',
    desc: 'Recognition for authenticated holdings. Book value plus Aura when worn.',
    cost: 14500,
    category: 'title',
    repRequired: 140,
  },
  closingBellRoyalty: {
    id: 'closingBellRoyalty',
    name: 'Honorary Curator',
    desc: 'Recognition for a serious collection. Heavy appraisal and full-set Aura fuel.',
    cost: 26000,
    category: 'title',
    repRequired: 260,
  },
  bronzeBullBust: {
    id: 'bronzeBullBust',
    name: 'Bronze Figurine, Bronze Age',
    desc: 'Small antiquity bronze. Entry-tier collectible that still books into Net Worth.',
    cost: 6400,
    category: 'trophy',
    repRequired: 20,
  },
  glassTickerWall: {
    id: 'glassTickerWall',
    name: 'Murano Glass Cabinet',
    desc: 'Ornate blown-glass display piece. Top-tier appraisal and Aura slot.',
    cost: 31000,
    category: 'dashboard',
    repRequired: 300,
  },
  auroraDeck: {
    id: 'auroraDeck',
    name: 'Aurora Study',
    desc: 'Abstract expressionist painting. Collectible wealth with Aura when equipped.',
    cost: 19500,
    category: 'background',
    repRequired: 130,
  },
  deskSovereign: {
    id: 'deskSovereign',
    name: 'Master Collector',
    desc: 'Endgame recognition for a complete collection. Highest vault appraisal and Desk Prestige III when the set is complete.',
    cost: 36000,
    category: 'title',
    repRequired: 340,
  },
  imperialTriptych: {
    id: 'imperialTriptych',
    name: 'Imperial Triptych, Attributed',
    desc: 'Museum-grade panel painting. Masterwork appraisal with extra Desk Prestige daily cap when equipped.',
    cost: 150000,
    category: 'background',
    repRequired: 400,
    rarity: 'masterwork',
    prestigeBonus: { repPerClose: 0, dailyCap: 1 },
  },
  augustusLaurel: {
    id: 'augustusLaurel',
    name: 'Laurel Wreath, Roman Imperial',
    desc: 'Imperial laurel bronze. Masterwork flex that adds REP per profitable close when equipped.',
    cost: 280000,
    category: 'trophy',
    repRequired: 500,
    rarity: 'masterwork',
    prestigeBonus: { repPerClose: 1, dailyCap: 0 },
  },
  gutenbergFolio: {
    id: 'gutenbergFolio',
    name: 'Gutenberg Folio Leaf',
    desc: 'Incunable folio leaf. Books major Net Worth and raises your prestige daily cap.',
    cost: 450000,
    category: 'dashboard',
    repRequired: 650,
    rarity: 'masterwork',
    prestigeBonus: { repPerClose: 0, dailyCap: 2 },
  },
  rothkoField: {
    id: 'rothkoField',
    name: 'Color Field No. 12',
    desc: 'Abstract expressionist masterwork. Flagship gallery piece with stacked prestige bonuses.',
    cost: 750000,
    category: 'background',
    repRequired: 900,
    rarity: 'masterwork',
    prestigeBonus: { repPerClose: 1, dailyCap: 1 },
  },
  diademProvenance: {
    id: 'diademProvenance',
    name: 'Diadem of Verified Lineage',
    desc: 'Crown-jewel recognition title. The top always-available masterwork — heavy REP per close when worn.',
    cost: 1200000,
    category: 'title',
    repRequired: 1200,
    rarity: 'masterwork',
    prestigeBonus: { repPerClose: 2, dailyCap: 0 },
  },
};

/** Hard caps on per-item prestige bonuses (masterwork + crown) before auraAmp perk. */
export const MASTERWORK_ITEM_BONUS_CAPS = {
  repPerClose: 4,
  dailyCap: 8,
};

export const VAULT_CATEGORIES = ['dashboard', 'background', 'trophy', 'title'];

/** Player-facing labels for vault (and shared collection) category keys. */
export const VAULT_CATEGORY_LABELS = {
  dashboard: 'Desk Curio',
  background: 'Gallery',
  trophy: 'Relic',
  title: 'Recognition',
};

/** Cosmetic profile slot → strip label (slot keys stay dashboard/background/badge/title). */
export const VAULT_EQUIP_SLOT_LABELS = {
  dashboard: 'Desk Curio',
  background: 'Gallery',
  badge: 'Relic',
  title: 'Recognition',
};

/**
 * Display label for Collection Log / filters (vault cats + seat + BM fallbacks).
 * @param {string} category
 */
export function getCategoryDisplayLabel(category) {
  const key = String(category || '');
  if (VAULT_CATEGORY_LABELS[key]) return VAULT_CATEGORY_LABELS[key];
  if (key === 'seat') return 'The Seat';
  if (key === 'blackmarket') return 'Black Market';
  if (!key) return '';
  return key.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export const KNOWN_VAULT_IDS = new Set([
  ...Object.keys(VAULT_ITEMS),
  ...Object.keys(PRIVATE_SALON_ITEMS),
]);
export const VAULT_COST_BY_ID = new Map(
  [...Object.values(VAULT_ITEMS), ...Object.values(PRIVATE_SALON_ITEMS)]
    .map((item) => [item.id, Number(item.cost) || 0]),
);

const COSMETIC_SLOT_BY_CATEGORY = {
  dashboard: 'dashboard',
  background: 'background',
  trophy: 'badge',
  title: 'title',
};

export function getVaultItem(itemId) {
  if (!itemId) return null;
  return VAULT_ITEMS[itemId] || PRIVATE_SALON_ITEMS[itemId] || null;
}

/** True for salon-only crown listings (not in standard vault shop grid). */
export function isSalonOnlyVaultItem(item) {
  return !!(item && item.salonOnly);
}

/** True for masterwork-tier vault catalog entries. */
export function isMasterworkVaultItem(item) {
  return String(item?.rarity || '').toLowerCase() === 'masterwork';
}

function sumEquippedItemBonuses(cosmetics, owned) {
  const slots = ['dashboard', 'background', 'badge', 'title'];
  let repPerClose = 0;
  let dailyCap = 0;
  const items = [];
  for (const slot of slots) {
    const id = cosmetics?.[slot];
    if (!id || !owned.has(id)) continue;
    const item = getVaultItem(id);
    if (!item || getVaultSlotForItem(item) !== slot) continue;
    const bonus = item.prestigeBonus;
    if (!bonus) continue;
    const rpc = Math.max(0, Math.floor(Number(bonus.repPerClose) || 0));
    const cap = Math.max(0, Math.floor(Number(bonus.dailyCap) || 0));
    if (!rpc && !cap) continue;
    repPerClose += rpc;
    dailyCap += cap;
    items.push({ id, name: item.name, repPerClose: rpc, dailyCap: cap });
  }
  return {
    repPerClose: Math.min(MASTERWORK_ITEM_BONUS_CAPS.repPerClose, repPerClose),
    dailyCap: Math.min(MASTERWORK_ITEM_BONUS_CAPS.dailyCap, dailyCap),
    items,
  };
}

export function getVaultSlotForItem(item) {
  if (!item) return null;
  return COSMETIC_SLOT_BY_CATEGORY[item.category] || null;
}

export function getVaultSlotForCategory(category) {
  return COSMETIC_SLOT_BY_CATEGORY[category] || null;
}

/** Appraised collectible value of owned vault items (display wealth only). */
export function getVaultBookValue(state = {}) {
  const owned = Array.isArray(state.vaultOwned) ? state.vaultOwned : [];
  let total = 0;
  for (const id of owned) {
    const cost = Number(VAULT_COST_BY_ID.get(id) || getVaultItem(id)?.cost || 0);
    if (Number.isFinite(cost) && cost > 0) total += cost;
  }
  return Math.max(0, Math.round(total));
}

/**
 * Desk Prestige from equipped vault collectibles.
 * Narrow power: profitable closes grant bonus REP (daily capped).
 * Never touches buying power / margin / slippage.
 */
export function getVaultDeskAura({ cosmetics = {}, vaultOwned = [], perks = [] } = {}) {
  const owned = new Set(Array.isArray(vaultOwned) ? vaultOwned : []);
  const slots = ['dashboard', 'background', 'badge', 'title'];
  let equipped = 0;
  for (const slot of slots) {
    const id = cosmetics?.[slot];
    if (id && owned.has(id) && getVaultSlotForItem(getVaultItem(id)) === slot) equipped += 1;
  }
  /** @type {{ tier: number, equipped: number, label: string, repPerClose: number, dailyCap: number, summary: string }} */
  let aura;
  if (equipped <= 0) {
    aura = {
      tier: 0,
      equipped,
      label: 'No Prestige',
      repPerClose: 0,
      dailyCap: 0,
      summary: 'Equip vault collectibles to activate Desk Prestige.',
    };
  } else if (equipped <= 2) {
    aura = {
      tier: 1,
      equipped,
      label: 'Desk Prestige I',
      repPerClose: 1,
      dailyCap: 3,
      summary: 'Profitable closes grant +1 REP (max +3 / day).',
    };
  } else if (equipped === 3) {
    aura = {
      tier: 2,
      equipped,
      label: 'Desk Prestige II',
      repPerClose: 2,
      dailyCap: 6,
      summary: 'Profitable closes grant +2 REP (max +6 / day).',
    };
  } else {
    aura = {
      tier: 3,
      equipped,
      label: 'Desk Prestige III',
      repPerClose: 3,
      dailyCap: 9,
      summary: 'Full set: profitable closes grant +3 REP (max +9 / day).',
    };
  }

  // Vault Prestige perk: stronger close bonus + higher daily cap (never touches BP/margin).
  if (aura.tier > 0 && Array.isArray(perks) && perks.includes('auraAmp')) {
    aura.repPerClose += 1;
    aura.dailyCap = Math.round(aura.dailyCap * 1.5) + 3;
    aura.label = `${aura.label} + Prestige`;
    aura.summary = `Vault Prestige: profitable closes grant +${aura.repPerClose} REP (max +${aura.dailyCap} / day).`;
  }

  const itemBonuses = sumEquippedItemBonuses(cosmetics, owned);
  aura.itemBonuses = itemBonuses;
  if (aura.tier > 0 && (itemBonuses.repPerClose > 0 || itemBonuses.dailyCap > 0)) {
    aura.repPerClose += itemBonuses.repPerClose;
    aura.dailyCap += itemBonuses.dailyCap;
    const bonusBits = [];
    if (itemBonuses.repPerClose > 0) bonusBits.push(`+${itemBonuses.repPerClose} REP/close from masterworks`);
    if (itemBonuses.dailyCap > 0) bonusBits.push(`+${itemBonuses.dailyCap} daily cap from masterworks`);
    aura.summary = `${aura.summary} ${bonusBits.join('; ')}.`.trim();
  }

  return aura;
}

/** Apply capped Desk Prestige REP on a profitable close. Mutates meta. */
export function applyVaultDeskAuraOnClose(meta, pnl, aura) {
  if (!meta || !aura || aura.tier <= 0) return { applied: 0 };
  if (!(Number(pnl) > 0)) return { applied: 0 };
  const used = Math.max(0, Math.floor(Number(meta.vaultAuraRepToday) || 0));
  const room = Math.max(0, (aura.dailyCap || 0) - used);
  const grant = Math.min(aura.repPerClose || 0, room);
  if (grant <= 0) return { applied: 0, capped: true };
  meta.vaultAuraRepToday = used + grant;
  return { applied: grant, capped: false };
}

export function canPurchaseVaultItem(item, { cash = 0, vaultOwned = [], reputation = 0 } = {}) {
  if (!item?.id) return { ok: false, reason: 'Unknown item', code: 'unknown' };
  if (item.salonOnly) return { ok: false, reason: 'Private Salon listing only', code: 'salon' };
  if (Array.isArray(vaultOwned) && vaultOwned.includes(item.id)) {
    return { ok: false, reason: 'Already owned', code: 'owned' };
  }
  const repNeed = Number(item.repRequired) || 0;
  if (Number(reputation) < repNeed) {
    return { ok: false, reason: `Requires ${repNeed} REP`, code: 'rep' };
  }
  if (Number(cash) < Number(item.cost || 0)) {
    return { ok: false, reason: 'Insufficient cash', code: 'cash' };
  }
  return { ok: true };
}

export function purchaseVaultItem(state, itemId) {
  const item = getVaultItem(itemId);
  if (!item) return { ok: false, msg: 'Unknown vault item.' };
  if (!Array.isArray(state?.vaultOwned)) state.vaultOwned = [];
  if (!state?.portfolio) return { ok: false, msg: 'Portfolio not ready.' };
  if (!state?.meta) state.meta = { reputation: 0 };
  const gate = canPurchaseVaultItem(item, {
    cash: getSpendableCash(state.portfolio),
    vaultOwned: state.vaultOwned,
    reputation: state.meta.reputation || 0,
  });
  if (!gate.ok) {
    return { ok: false, msg: gate.reason, code: gate.code };
  }
  state.portfolio.cash -= item.cost;
  state.vaultOwned.push(item.id);
  state.vaultSpentTotal = Math.max(0, Number(state.vaultSpentTotal) || 0) + item.cost;
  return {
    ok: true,
    item,
    cashLeft: state.portfolio.cash,
    spentTotal: state.vaultSpentTotal,
  };
}

/** Art-lending style LTV on pledged vault appraisal (additive ceiling only). */
export const VAULT_COLLATERAL_LTV = 0.5;

/** Sanitize pledged ids: known + owned, unique. */
export function sanitizeVaultPledged(pledged, vaultOwned = []) {
  const owned = new Set(Array.isArray(vaultOwned) ? vaultOwned : []);
  const out = [];
  for (const id of Array.isArray(pledged) ? pledged : []) {
    if (!KNOWN_VAULT_IDS.has(id) || !owned.has(id) || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

/** Sum appraisal (cost) of pledged vault ids. */
export function getVaultPledgedAppraisal(state = {}) {
  const pledged = sanitizeVaultPledged(state.vaultPledged, state.vaultOwned);
  let total = 0;
  for (const id of pledged) {
    const cost = Number(VAULT_COST_BY_ID.get(id) || 0);
    if (cost > 0) total += cost;
  }
  return Math.max(0, Math.round(total));
}

/** True when an active loan still lists this vault id as collateral. */
export function loanLocksVaultPledge(finance, itemId) {
  if (!itemId) return false;
  return (finance?.loans || []).some((loan) => (
    loan
    && loan.balance > 0
    && loan.status !== 'paid'
    && Array.isArray(loan.collateralIds)
    && loan.collateralIds.includes(itemId)
  ));
}

/**
 * Pledge / unpledge a vault item for loan collateral.
 * @returns {{ ok: boolean, pledged?: boolean, msg?: string, code?: string, vaultPledged?: string[] }}
 */
export function togglePledgedVaultItem(state, itemId) {
  if (!KNOWN_VAULT_IDS.has(itemId)) {
    return { ok: false, msg: 'Unknown vault item.', code: 'unknown' };
  }
  if (!Array.isArray(state.vaultOwned)) state.vaultOwned = [];
  if (!state.vaultOwned.includes(itemId)) {
    return { ok: false, msg: 'Own this collectible before pledging it.', code: 'unowned' };
  }
  state.vaultPledged = sanitizeVaultPledged(state.vaultPledged, state.vaultOwned);
  if (state.vaultPledged.includes(itemId)) {
    if (loanLocksVaultPledge(state.finance, itemId)) {
      return {
        ok: false,
        msg: 'This piece backs an active loan. Pay it off before unpledging.',
        code: 'loan_lock',
        pledged: true,
      };
    }
    state.vaultPledged = state.vaultPledged.filter((id) => id !== itemId);
    return { ok: true, pledged: false, vaultPledged: state.vaultPledged };
  }
  state.vaultPledged = [...state.vaultPledged, itemId];
  return { ok: true, pledged: true, vaultPledged: state.vaultPledged };
}

/**
 * On late default, seize cheapest pledged items backing that loan until balance covered.
 * Clears matching equipped cosmetic slots on `state.cosmetics` when present;
 * day-end still calls setProfileCosmetic for persisted profile cosmetics.
 * @returns {{ seized: string[], covered: number, loanId: string|null }}
 */
export function repossessVaultForLoan(state, loan) {
  if (!state || !loan) return { seized: [], covered: 0, loanId: null };
  if (!Array.isArray(state.vaultOwned)) state.vaultOwned = [];
  state.vaultPledged = sanitizeVaultPledged(state.vaultPledged, state.vaultOwned);

  const candidates = (Array.isArray(loan.collateralIds) ? loan.collateralIds : [])
    .filter((id) => state.vaultOwned.includes(id) && KNOWN_VAULT_IDS.has(id))
    .slice()
    .sort((a, b) => (Number(VAULT_COST_BY_ID.get(a) || 0) - Number(VAULT_COST_BY_ID.get(b) || 0)));

  const need = Math.max(0, Number(loan.balance) || 0);
  let covered = 0;
  const seized = [];
  for (const id of candidates) {
    if (covered >= need) break;
    const cost = Number(VAULT_COST_BY_ID.get(id) || 0);
    seized.push(id);
    covered += cost;
    state.vaultOwned = state.vaultOwned.filter((x) => x !== id);
    state.vaultPledged = state.vaultPledged.filter((x) => x !== id);
  }
  if (Array.isArray(loan.collateralIds) && seized.length) {
    loan.collateralIds = loan.collateralIds.filter((id) => !seized.includes(id));
  }
  if (state.cosmetics && typeof state.cosmetics === 'object') {
    for (const id of seized) {
      const slot = getVaultSlotForItem(getVaultItem(id));
      if (slot && state.cosmetics[slot] === id) state.cosmetics[slot] = null;
    }
  }
  state.vaultPledged = sanitizeVaultPledged(state.vaultPledged, state.vaultOwned);
  return { seized, covered, loanId: loan.id || null };
}

/**
 * Apply repossession for every late event from processDailyLoans.
 * @returns {Array<{ seized: string[], covered: number, loanId: string|null, names: string[] }>}
 */
export function repossessVaultForLateLoans(state, loanEvents = []) {
  const out = [];
  for (const ev of Array.isArray(loanEvents) ? loanEvents : []) {
    if (ev?.type !== 'late' || !ev.loanId) continue;
    const loan = (state.finance?.loans || []).find((l) => l.id === ev.loanId);
    if (!loan) continue;
    const result = repossessVaultForLoan(state, loan);
    if (!result.seized.length) continue;
    out.push({
      ...result,
      names: result.seized.map((id) => getVaultItem(id)?.name || id),
    });
  }
  return out;
}
