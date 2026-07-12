// @ts-check
import { getSpendableCash } from './portfolio.js';

export const VAULT_ITEMS = {
  goldTerminal: {
    id: 'goldTerminal',
    name: 'Gold-Plated Terminal',
    desc: 'Gold terminal skin. Appraises at cost into Net Worth. Equipping feeds Desk Prestige.',
    cost: 5000,
    category: 'dashboard',
    icon: 'terminal-gold',
    repRequired: 0,
  },
  tungstenDial: {
    id: 'tungstenDial',
    name: 'Tungsten Price Dial',
    desc: 'Heavy dial accent for the desk. Book-value wealth + Aura progress when equipped.',
    cost: 7200,
    category: 'dashboard',
    icon: 'dial-tungsten',
    repRequired: 40,
  },
  obsidianTicker: {
    id: 'obsidianTicker',
    name: 'Obsidian Ticker Tape',
    desc: 'Command-center ticker skin. Appraised collectible that powers Desk Prestige.',
    cost: 9800,
    category: 'dashboard',
    icon: 'ticker-obsidian',
    repRequired: 90,
  },
  yachtBackground: {
    id: 'yachtBackground',
    name: 'The Wake',
    desc: 'Yacht-deck backdrop. Counts as vault wealth and an Aura slot when equipped.',
    cost: 15000,
    category: 'background',
    icon: 'yacht',
    repRequired: 100,
  },
  penthouseNight: {
    id: 'penthouseNight',
    name: 'Penthouse at Night',
    desc: 'Skyline backdrop with real desk presence. Appraises into Net Worth.',
    cost: 22000,
    category: 'background',
    icon: 'penthouse',
    repRequired: 160,
  },
  bullMarble: {
    id: 'bullMarble',
    name: 'Bull and Marble',
    desc: 'Marble floor and bronze bull. High appraisal; equips into Desk Prestige.',
    cost: 28000,
    category: 'background',
    icon: 'bull-marble',
    repRequired: 220,
  },
  crashDayTape: {
    id: 'crashDayTape',
    name: 'Framed Tape - Black Monday Redux',
    desc: 'Framed halt-day tape. Collectible book value and Aura fuel when equipped.',
    cost: 8000,
    category: 'trophy',
    icon: 'tape-frame',
    repRequired: 0,
  },
  apexBadge: {
    id: 'apexBadge',
    name: 'Apex Desk Badge',
    desc: 'Enamel crest badge. Visible flex with appraisal weight and Aura progress.',
    cost: 12000,
    category: 'trophy',
    icon: 'badge-apex',
    repRequired: 80,
  },
  halcyonPin: {
    id: 'halcyonPin',
    name: 'Halcyon Trading Pin',
    desc: 'Survival pin for violent vol desks. Appraises high; equips into Aura.',
    cost: 17500,
    category: 'trophy',
    icon: 'pin-halcyon',
    repRequired: 180,
  },
  floorLegendTitle: {
    id: 'floorLegendTitle',
    name: 'Floor Legend',
    desc: 'Leaderboard title with Desk Prestige contribution when equipped.',
    cost: 9000,
    category: 'title',
    icon: 'title-legend',
    repRequired: 60,
  },
  volatilityWhisperer: {
    id: 'volatilityWhisperer',
    name: 'Volatility Whisperer',
    desc: 'Chaos-desk title. Book value plus Aura when worn.',
    cost: 14500,
    category: 'title',
    icon: 'title-vol',
    repRequired: 140,
  },
  closingBellRoyalty: {
    id: 'closingBellRoyalty',
    name: 'Closing Bell Royalty',
    desc: 'End-of-day royalty title. Heavy appraisal and full-set Aura fuel.',
    cost: 26000,
    category: 'title',
    icon: 'title-bell',
    repRequired: 260,
  },
  bronzeBullBust: {
    id: 'bronzeBullBust',
    name: 'Bronze Bull Bust',
    desc: 'Desk statue badge. Entry-tier collectible that still books into Net Worth.',
    cost: 6400,
    category: 'trophy',
    icon: 'bust-bull',
    repRequired: 20,
  },
  glassTickerWall: {
    id: 'glassTickerWall',
    name: 'Glass Ticker Wall',
    desc: 'Neon glass wall for the desk. Top-tier appraisal and Aura slot.',
    cost: 31000,
    category: 'dashboard',
    icon: 'wall-glass',
    repRequired: 300,
  },
  auroraDeck: {
    id: 'auroraDeck',
    name: 'Aurora Deck',
    desc: 'Blue-to-green aurora backdrop. Collectible wealth with Aura when equipped.',
    cost: 19500,
    category: 'background',
    icon: 'aurora',
    repRequired: 130,
  },
  deskSovereign: {
    id: 'deskSovereign',
    name: 'Desk Sovereign',
    desc: 'Endgame title. Highest vault appraisal and Desk Prestige III when the set is complete.',
    cost: 36000,
    category: 'title',
    icon: 'title-sovereign',
    repRequired: 340,
  },
};

export const VAULT_CATEGORIES = ['dashboard', 'background', 'trophy', 'title'];
export const VAULT_CATEGORY_LABELS = {
  dashboard: 'Dashboard',
  background: 'Background',
  trophy: 'Badge',
  title: 'Title',
};

export const KNOWN_VAULT_IDS = new Set(Object.keys(VAULT_ITEMS));
export const VAULT_COST_BY_ID = new Map(
  Object.values(VAULT_ITEMS).map((item) => [item.id, Number(item.cost) || 0]),
);

const COSMETIC_SLOT_BY_CATEGORY = {
  dashboard: 'dashboard',
  background: 'background',
  trophy: 'badge',
  title: 'title',
};

export function getVaultItem(itemId) {
  if (!itemId) return null;
  return VAULT_ITEMS[itemId] || null;
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
 * Desk Prestige from equipped vault cosmetics.
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
      summary: 'Equip vault cosmetics to activate Desk Prestige.',
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
