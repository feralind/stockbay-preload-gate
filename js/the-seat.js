// @ts-check
import { getSpendableCash } from './portfolio.js';

export const THE_SEAT = {
  id: 'theSeat',
  name: 'A Seat on the Trading Floor',
  desc: 'A once-in-a-career seat that marks your desk as untouchable. Prestige-only in this phase.',
  cost: 500000,
  repRequired: 500,
  category: 'seat',
  rarity: 'legendary',
  icon: 'seat-floor',
};

export const SEAT_LISTING_RATE = 1 / 150;

function seededSeatRoll(day) {
  const d = Math.max(1, Math.floor(Number(day) || 1));
  const x = Math.sin((d + 37) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function isSeatListingActive(seedDay, meta = {}) {
  const rep = Number(meta?.reputation) || 0;
  if (rep < THE_SEAT.repRequired) return false;
  if (meta?.seatOwned) return false;
  return seededSeatRoll(seedDay) < SEAT_LISTING_RATE;
}

export function canPurchaseSeat({ cash = 0, reputation = 0, seatOwned = false, seatListingActive = false } = {}) {
  if (seatOwned) return { ok: false, reason: 'Already owned', code: 'owned' };
  if (Number(reputation) < THE_SEAT.repRequired) {
    return { ok: false, reason: `Requires ${THE_SEAT.repRequired} REP`, code: 'rep' };
  }
  if (!seatListingActive) return { ok: false, reason: 'Seat listing not active today', code: 'window' };
  if (Number(cash) < THE_SEAT.cost) {
    return { ok: false, reason: 'Insufficient cash', code: 'cash' };
  }
  return { ok: true };
}

export function purchaseSeat(state, currentDay) {
  const listingActive = isSeatListingActive(currentDay, {
    reputation: state.meta?.reputation || 0,
    seatOwned: state.seatOwned,
  });
  const gate = canPurchaseSeat({
    cash: getSpendableCash(state.portfolio),
    reputation: state.meta?.reputation || 0,
    seatOwned: !!state.seatOwned,
    seatListingActive: listingActive,
  });
  if (!gate.ok) return { ok: false, msg: gate.reason, code: gate.code };
  state.portfolio.cash -= THE_SEAT.cost;
  state.seatOwned = true;
  state.seatPurchaseDay = Math.max(1, Math.floor(Number(currentDay) || 1));
  state.seatSpentTotal = THE_SEAT.cost;
  return { ok: true, seat: THE_SEAT };
}
