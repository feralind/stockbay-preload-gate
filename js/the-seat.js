// @ts-check
import { getSpendableCash } from './portfolio.js';
import { requiredLicenseForRep, hasLicense } from './licenses.js';

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

/** License tier that unlocks Seat listings/purchase (from legacy repRequired). */
export function seatLicense() {
  return requiredLicenseForRep(THE_SEAT.repRequired);
}

export const SEAT_LISTING_RATE = 1 / 150;

function seededSeatRoll(day) {
  const d = Math.max(1, Math.floor(Number(day) || 1));
  const x = Math.sin((d + 37) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function isSeatListingActive(seedDay, ctx = {}) {
  if (!hasLicense(ctx?.licenses, seatLicense().id)) return false;
  if (ctx?.seatOwned) return false;
  return seededSeatRoll(seedDay) < SEAT_LISTING_RATE;
}

export function canPurchaseSeat({ cash = 0, licenses = ['retail'], seatOwned = false, seatListingActive = false } = {}) {
  if (seatOwned) return { ok: false, reason: 'Already owned', code: 'owned' };
  const licNeed = seatLicense();
  if (!hasLicense(licenses, licNeed.id)) {
    return { ok: false, reason: `Requires the ${licNeed.name} license`, code: 'license' };
  }
  if (!seatListingActive) return { ok: false, reason: 'Seat listing not active today', code: 'window' };
  if (Number(cash) < THE_SEAT.cost) {
    return { ok: false, reason: 'Insufficient cash', code: 'cash' };
  }
  return { ok: true };
}

export function purchaseSeat(state, currentDay) {
  const listingActive = isSeatListingActive(currentDay, {
    licenses: state.licenses,
    seatOwned: state.seatOwned,
  });
  const gate = canPurchaseSeat({
    cash: getSpendableCash(state.portfolio),
    licenses: state.licenses,
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
