// @ts-check
/**
 * Collection flavor — lore + sets + flair claims.
 * Cosmetic / immersion only. No REP, cash, Desk Prestige, BP, margin, or buy-path changes.
 */

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   blurb: string,
 *   flair: string,
 *   memberIds: string[],
 * }} CollectionSet
 */

/** Short lore blurbs keyed by save id (1–2 sentences). Missing id → null. */
export const LORE_BY_ID = {
  goldTerminal: 'A brass astrolabe that once steered a coastal ledger house. Collectors swear the vernier still ticks in quiet rooms.',
  tungstenDial: 'Weathered sundial shard from a trading courtyard. Timekeeping for men who measured fortune in shadows.',
  obsidianTicker: 'Volcanic glass polished into a desk mirror. Floor legends used it to watch the tape without looking soft.',
  glassTickerWall: 'Murano cabinet glass cut for a private counting room. Light fractures across foil like late-session greens.',
  gutenbergFolio: 'A single folio leaf from an early press. Provenance papers thicker than the leaf itself.',
  yachtBackground: 'Oil study of a tide that never quite settles. Hung behind desks that outgrew the bedroom.',
  penthouseNight: 'Nocturne in seven tones of city dark. Painted for a buyer who closed positions after midnight.',
  bullMarble: 'Attributed bronze-and-marble bull. Half the experts call it studio work; the other half call it luck.',
  auroraDeck: 'Abstract aurora over a cold harbor. Dealers sell the mood, not the coordinates.',
  imperialTriptych: 'Three panels, one disputed imperial workshop. Museum lighting optional; desk lighting mandatory.',
  rothkoField: 'Color field that swallows chatter. Serious galleries keep the lights low around it.',
  mageOfTheDesk: 'Relic of a night session that should not have worked. The floor still argues about the fill.',
  liquidityCrown: 'A crown that never sat on a head — only on a blotter when the book needed calm.',
  orbitalFloorBackdrop: 'Backdrop from an orbital trading fantasy. Prestige paint for desks that refuse to stay small.',
  obsidianMonolithDesk: 'Monolith skin for a desk that wants silence. Collectors buy the weight, not the code.',
  vermeerAttribution: 'Dutch interior with a name too clean to trust. Crown provenance is the sport.',
  fabergeImperial: 'Imperial workshop egg, papers included. The rarest salon window — blink and it is gone.',
  diademProvenance: 'Diadem with a chain of custody longer than most careers. Masterwork flex without apology.',
  theSeat: 'A seat on the trading floor that marks the desk as untouchable. Prestige ownership, not a better fill.',
  deskSovereign: 'Endgame recognition plate. Worn by collectors who finished the vault the hard way.',
  closingBellRoyalty: 'Honorary curator title from a quieter century of desks. Looks expensive because it is.',
};

/**
 * Immersion sets over existing owned ids. Claim = flair only.
 * @type {CollectionSet[]}
 */
export const COLLECTION_SETS = [
  {
    id: 'deskInstruments',
    name: 'Desk Instruments',
    blurb: 'Tools of the counting room — dials, glass, and folio leaf.',
    flair: 'Instrument Desk',
    memberIds: ['goldTerminal', 'tungstenDial', 'obsidianTicker', 'glassTickerWall', 'gutenbergFolio'],
  },
  {
    id: 'paintedHorizons',
    name: 'Painted Horizons',
    blurb: 'Walls that remember tide, night, marble, and color field.',
    flair: 'Horizon Gallery',
    memberIds: [
      'yachtBackground', 'penthouseNight', 'bullMarble', 'auroraDeck', 'imperialTriptych', 'rothkoField',
    ],
  },
  {
    id: 'floorRelics',
    name: 'Floor Relics',
    blurb: 'Black Market legendaries that still hum after close.',
    flair: 'Relic Floor',
    memberIds: ['mageOfTheDesk', 'liquidityCrown', 'orbitalFloorBackdrop', 'obsidianMonolithDesk'],
  },
  {
    id: 'crownWing',
    name: 'Crown Wing',
    blurb: 'Salon crowns and the diadem that bridges vault to provenance.',
    flair: 'Crown Wing',
    memberIds: ['vermeerAttribution', 'fabergeImperial', 'diademProvenance'],
  },
  {
    id: 'seatOfPower',
    name: 'Seat of Power',
    blurb: 'The Seat plus the titles that say the collection is finished.',
    flair: 'Seat of Power',
    memberIds: ['theSeat', 'deskSovereign', 'closingBellRoyalty'],
  },
];

export const KNOWN_SET_IDS = new Set(COLLECTION_SETS.map((s) => s.id));
const SET_BY_ID = new Map(COLLECTION_SETS.map((s) => [s.id, s]));
const SET_ID_BY_MEMBER = new Map();
for (const set of COLLECTION_SETS) {
  for (const id of set.memberIds) {
    if (!SET_ID_BY_MEMBER.has(id)) SET_ID_BY_MEMBER.set(id, set.id);
  }
}

/**
 * @param {string} [id]
 * @returns {string | null}
 */
export function getItemLore(id) {
  if (!id) return null;
  const lore = LORE_BY_ID[id];
  return typeof lore === 'string' && lore.trim() ? lore.trim() : null;
}

/**
 * @param {string} [id]
 * @returns {CollectionSet | null}
 */
export function getSetById(id) {
  return SET_BY_ID.get(id) || null;
}

/** @returns {CollectionSet[]} */
export function listCollectionSets() {
  return COLLECTION_SETS.slice();
}

/**
 * @param {string} [itemId]
 * @returns {CollectionSet | null}
 */
export function getSetForItemId(itemId) {
  const setId = SET_ID_BY_MEMBER.get(itemId);
  return setId ? getSetById(setId) : null;
}

/**
 * Ownership across vault/salon (vaultOwned), BM, and Seat.
 * @param {object} state
 * @param {string} itemId
 */
export function isSetMemberOwned(state, itemId) {
  if (!itemId) return false;
  if (itemId === 'theSeat') return !!state.seatOwned;
  const vault = new Set(Array.isArray(state.vaultOwned) ? state.vaultOwned : []);
  if (vault.has(itemId)) return true;
  const bm = new Set(Array.isArray(state.blackMarketOwned) ? state.blackMarketOwned : []);
  return bm.has(itemId);
}

/**
 * @param {object} state
 * @param {string} setId
 */
export function getSetProgress(state, setId) {
  const set = getSetById(setId);
  if (!set) {
    return { set: null, owned: 0, total: 0, complete: false, members: [] };
  }
  const members = set.memberIds.map((id) => ({
    id,
    owned: isSetMemberOwned(state, id),
  }));
  const owned = members.filter((m) => m.owned).length;
  const total = members.length;
  return {
    set,
    owned,
    total,
    complete: total > 0 && owned >= total,
    members,
  };
}

/**
 * @param {object} state
 * @returns {Array<object>}
 */
export function listSetProgress(state) {
  return COLLECTION_SETS.map((set) => getSetProgress(state, set.id));
}

function claimedSetIds(state) {
  const raw = state.meta?.setClaims;
  return new Set(Array.isArray(raw) ? raw.filter(Boolean) : []);
}

/**
 * @param {object} state
 * @param {string} setId
 */
export function canClaimSet(state, setId) {
  const set = getSetById(setId);
  if (!set) return { ok: false, reason: 'Unknown set', code: 'unknown' };
  if (claimedSetIds(state).has(set.id)) return { ok: false, reason: 'Already claimed', code: 'claimed' };
  const progress = getSetProgress(state, set.id);
  if (!progress.complete) return { ok: false, reason: 'Set incomplete', code: 'incomplete' };
  return { ok: true, set, progress };
}

/**
 * Claim = flair only (no REP, no cash, no Desk Prestige).
 * @param {object} state
 * @param {string} setId
 */
export function claimSetFlair(state, setId) {
  const gate = canClaimSet(state, setId);
  if (!gate.ok) return { ok: false, msg: gate.reason, code: gate.code };
  if (!state.meta || typeof state.meta !== 'object') state.meta = {};
  if (!Array.isArray(state.meta.setClaims)) state.meta.setClaims = [];
  state.meta.setClaims.push(gate.set.id);
  if (gate.set.flair) {
    state.meta.setFlair = String(gate.set.flair).slice(0, 40);
  }
  return { ok: true, set: gate.set, flair: gate.set.flair || null };
}

/**
 * Drop forged set claims that are not actually complete.
 * @param {string[]} claims
 * @param {object} state
 * @returns {string[]}
 */
export function sanitizeSetClaims(claims, state = {}) {
  if (!Array.isArray(claims)) return [];
  const seen = new Set();
  const out = [];
  for (const id of claims) {
    if (!KNOWN_SET_IDS.has(id) || seen.has(id)) continue;
    if (!getSetProgress(state, id).complete) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
