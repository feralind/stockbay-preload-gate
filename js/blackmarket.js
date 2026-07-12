// @ts-check
import { getSpendableCash } from './portfolio.js';

export const BLACKMARKET_ITEM_POOL = [
  {
    id: 'afterHoursMonogram',
    name: 'After-Hours Monogram',
    desc: 'A brushed-metal profile badge seen on old floor jackets.',
    cost: 42000,
    rarity: 'common',
    repRequired: 180,
    category: 'trophy',
    icon: 'monogram',
  },
  {
    id: 'nightWatchTitle',
    name: 'Night Watch',
    desc: 'Title for desks that thrive in pre-market chaos.',
    cost: 50000,
    rarity: 'common',
    repRequired: 200,
    category: 'title',
    icon: 'title-nightwatch',
  },
  {
    id: 'tickerVaultBackdrop',
    name: 'Ticker Vault Backdrop',
    desc: 'Dark vault-room background with suspended neon ticker bands.',
    cost: 56000,
    rarity: 'common',
    repRequired: 210,
    category: 'background',
    icon: 'bg-vault',
  },
  {
    id: 'clockworkDeskSkin',
    name: 'Clockwork Desk Skin',
    desc: 'Bronze and steel dashboard accent with analog dial motifs.',
    cost: 61000,
    rarity: 'common',
    repRequired: 220,
    category: 'dashboard',
    icon: 'dash-clockwork',
  },
  {
    id: 'pitPassLanyard',
    name: 'Pit Pass Lanyard',
    desc: 'Worn fabric pass from a forgotten night session. Cosmetic desk flair only.',
    cost: 47000,
    rarity: 'common',
    repRequired: 225,
    category: 'trophy',
    icon: 'lanyard-pit',
  },
  {
    id: 'amberTapeBackdrop',
    name: 'Amber Tape Room',
    desc: 'Warm amber ticker-room backdrop for late closes. Cosmetic only.',
    cost: 58000,
    rarity: 'common',
    repRequired: 235,
    category: 'background',
    icon: 'bg-amber-tape',
  },
  {
    id: 'ledgerLineTitle',
    name: 'Ledger Line',
    desc: 'A quiet floor title for desks that keep clean books. Cosmetic only.',
    cost: 66000,
    rarity: 'common',
    repRequired: 250,
    category: 'title',
    icon: 'title-ledger-line',
  },
  {
    id: 'floorMythTitle',
    name: 'Floor Myth',
    desc: 'A rare title whispered about on profitable desks.',
    cost: 78000,
    rarity: 'rare',
    repRequired: 260,
    category: 'title',
    icon: 'title-myth',
  },
  {
    id: 'dragonLedgerBadge',
    name: 'Dragon Ledger Badge',
    desc: 'Rare enamel badge featuring a dragon curled around a ledger book.',
    cost: 86000,
    rarity: 'rare',
    repRequired: 280,
    category: 'trophy',
    icon: 'badge-dragon-ledger',
  },
  {
    id: 'stormGlassBackdrop',
    name: 'Storm Glass',
    desc: 'Rare storm-cell skyline background with distant circuit flashes.',
    cost: 94000,
    rarity: 'rare',
    repRequired: 300,
    category: 'background',
    icon: 'bg-storm',
  },
  {
    id: 'midnightBloomDesk',
    name: 'Midnight Bloom Console',
    desc: 'Rare violet/cyan dashboard accent pass for night sessions.',
    cost: 99000,
    rarity: 'rare',
    repRequired: 320,
    category: 'dashboard',
    icon: 'dash-midnight',
  },
  {
    id: 'mageOfTheDesk',
    name: 'The Mage of the Desk',
    desc: 'Relic: execution sigil. While equipped, stock fills take 15% less slippage.',
    cost: 150000,
    rarity: 'legendary',
    repRequired: 300,
    category: 'relic',
    icon: 'title-mage',
  },
  {
    id: 'liquidityCrown',
    name: 'Liquidity Crown',
    desc: 'Relic: crisis lanyard. While equipped, margin-call liquidation grace is extended by 6 minutes.',
    cost: 165000,
    rarity: 'legendary',
    repRequired: 340,
    category: 'relic',
    icon: 'badge-crown',
  },
  {
    id: 'orbitalFloorBackdrop',
    name: 'Orbital Floor',
    desc: 'Legendary background with an orbital-ring market floor aesthetic.',
    cost: 185000,
    rarity: 'legendary',
    repRequired: 360,
    category: 'background',
    icon: 'bg-orbital',
  },
  {
    id: 'obsidianMonolithDesk',
    name: 'Obsidian Monolith Desk',
    desc: 'Legendary dashboard skin with polished obsidian contrast.',
    cost: 210000,
    rarity: 'legendary',
    repRequired: 400,
    category: 'dashboard',
    icon: 'dash-obsidian-monolith',
  },
];

export const KNOWN_BLACKMARKET_IDS = new Set(BLACKMARKET_ITEM_POOL.map((item) => item.id));
export const BLACKMARKET_COST_BY_ID = new Map(BLACKMARKET_ITEM_POOL.map((item) => [item.id, item.cost]));

export const BLACKMARKET_LISTING_TTL_DAYS = 3;
export const BLACKMARKET_SEEN_EXPIRED_MAX = 120;

export const LEGENDARY_BLACKMARKET_COACH_TEXT = 'Legendary Black Market listings are extremely rare and expire in a few in-game days. If you want it, buy it before the window closes.';

export function getBlackMarketItem(itemId) {
  if (!itemId) return null;
  return BLACKMARKET_ITEM_POOL.find((item) => item.id === itemId) || null;
}

function createSeededRng(seed) {
  let t = (Number(seed) || 1) >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function pickRarity(rng) {
  const roll = rng();
  if (roll < (1 / 30)) return 'legendary';
  if (roll < (1 / 30) + (1 / 8)) return 'rare';
  return 'common';
}

function pickFromPool(pool, rarity, usedIds, rng) {
  const candidates = pool.filter((item) => item.rarity === rarity && !usedIds.has(item.id));
  if (!candidates.length) return null;
  const idx = Math.floor(rng() * candidates.length);
  return candidates[idx] || null;
}

export function getTodaysBlackMarketListing(seedDay, { ownedIds = [] } = {}) {
  const day = Math.max(1, Math.floor(Number(seedDay) || 1));
  const owned = new Set(Array.isArray(ownedIds) ? ownedIds : []);
  // Owned items of every rarity stay out of the rotation (no dead "Owned" re-rolls).
  const pool = BLACKMARKET_ITEM_POOL.filter((item) => !owned.has(item.id));
  const rng = createSeededRng(9137 + day * 97);
  const slotCount = rng() < 0.42 ? 2 : 1;
  const used = new Set();
  const items = [];
  for (let i = 0; i < slotCount; i++) {
    const rarity = pickRarity(rng);
    let pick = pickFromPool(pool, rarity, used, rng);
    if (!pick) pick = pickFromPool(pool, 'rare', used, rng);
    if (!pick) pick = pickFromPool(pool, 'common', used, rng);
    if (!pick) pick = pool.find((item) => !used.has(item.id)) || null;
    if (!pick) break;
    used.add(pick.id);
    items.push(pick);
  }
  return {
    day,
    expiresDay: day + BLACKMARKET_LISTING_TTL_DAYS,
    items,
  };
}

export function isBlackMarketListingExpired(listing, currentDay) {
  if (!listing || typeof listing !== 'object') return false;
  const day = Math.floor(Number(currentDay) || 0);
  if (day <= 0) return false;
  const expiresDay = Math.floor(Number(listing.expiresDay) || (Number(listing.day) + BLACKMARKET_LISTING_TTL_DAYS));
  return day >= expiresDay;
}

export function canPurchaseBlackMarketItem(item, { cash = 0, blackMarketOwned = [], reputation = 0 } = {}) {
  if (!item?.id) return { ok: false, reason: 'Unknown listing', code: 'unknown' };
  if (Array.isArray(blackMarketOwned) && blackMarketOwned.includes(item.id)) {
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

export function purchaseBlackMarketItem(state, item) {
  if (!item?.id) return { ok: false, msg: 'Unknown listing.' };
  if (!Array.isArray(state.blackMarketOwned)) state.blackMarketOwned = [];
  const gate = canPurchaseBlackMarketItem(item, {
    cash: getSpendableCash(state.portfolio),
    blackMarketOwned: state.blackMarketOwned,
    reputation: state.meta?.reputation || 0,
  });
  if (!gate.ok) return { ok: false, msg: gate.reason, code: gate.code };
  state.portfolio.cash -= item.cost;
  state.blackMarketOwned.push(item.id);
  state.blackMarketSpentTotal = Math.max(0, Number(state.blackMarketSpentTotal) || 0) + item.cost;
  return { ok: true, item };
}

export function collectExpiredBlackMarketIds(currentDay, { ownedIds = [] } = {}) {
  const day = Math.floor(Number(currentDay) || 0);
  if (day <= BLACKMARKET_LISTING_TTL_DAYS) return [];
  const listingDay = day - BLACKMARKET_LISTING_TTL_DAYS;
  const listing = getTodaysBlackMarketListing(listingDay);
  if (!isBlackMarketListingExpired(listing, day)) return [];
  const owned = new Set(Array.isArray(ownedIds) ? ownedIds : []);
  return listing.items
    .filter((item) => item?.id && !owned.has(item.id))
    .map((item) => item.id);
}

export function recordExpiredBlackMarketSeen(state, currentDay) {
  if (!Array.isArray(state.blackMarketSeenExpired)) state.blackMarketSeenExpired = [];
  const expiredIds = collectExpiredBlackMarketIds(currentDay, { ownedIds: state.blackMarketOwned });
  if (!expiredIds.length) return 0;
  const seen = new Set(state.blackMarketSeenExpired);
  expiredIds.forEach((id) => seen.add(id));
  state.blackMarketSeenExpired = [...seen].slice(-BLACKMARKET_SEEN_EXPIRED_MAX);
  return expiredIds.length;
}

export function shouldShowBlackMarketLegendaryCoach(meta = {}, listing = null) {
  if (meta?.blackMarketLegendCoachShown) return false;
  const hasLegendary = Array.isArray(listing?.items) && listing.items.some((item) => item?.rarity === 'legendary');
  return hasLegendary;
}

export function maybeShowBlackMarketLegendaryCoach(state, listing, {
  showCoachmark, hideCoachmark, saveGame, switchView,
} = {}) {
  if (!shouldShowBlackMarketLegendaryCoach(state?.meta, listing)) return false;
  state.meta.blackMarketLegendCoachShown = true;
  if (typeof showCoachmark === 'function') {
    const dismiss = () => {
      if (typeof hideCoachmark === 'function') hideCoachmark();
    };
    showCoachmark({
      // Spotlight the Black Market nav — view panel is often display:none on Dashboard.
      target: '.nav-item[data-view="blackmarket"]',
      text: LEGENDARY_BLACKMARKET_COACH_TEXT,
      showNext: true,
      nextLabel: 'Open Black Market',
      onSkip: dismiss,
      onNext: () => {
        dismiss();
        if (typeof switchView === 'function') switchView('blackmarket');
      },
    });
  }
  if (typeof saveGame === 'function') saveGame({ immediate: true });
  return true;
}
