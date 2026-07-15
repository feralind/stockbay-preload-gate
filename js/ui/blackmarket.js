// @ts-check
import {
  BLACKMARKET_ITEM_POOL, canPurchaseBlackMarketItem, getTodaysBlackMarketListing,
} from '../blackmarket.js';
import { formatMarketClock } from '../market.js';
import { getProfile } from '../profile.js';
import { getRelicEffect, getRelicSlotLimit } from '../relics.js';
import { canPurchaseSeat, isSeatListingActive, THE_SEAT } from '../the-seat.js';
import { getVaultSlotForItem } from '../vault.js';
import { requiredLicenseForRep, hasLicense } from '../licenses.js';
import { escapeHtml, fmt } from './shared.js';

const ITEM_BY_ID = new Map(BLACKMARKET_ITEM_POOL.map((item) => [item.id, item]));

function rarityLabel(rarity = 'common') {
  return String(rarity).slice(0, 1).toUpperCase() + String(rarity).slice(1);
}

export function renderBlackMarket(state) {
  const root = document.getElementById('blackmarket-root');
  if (!root) return;
  const day = formatMarketClock()?.day || 1;
  const ownedIds = Array.isArray(state.blackMarketOwned) ? state.blackMarketOwned : [];
  const ownedSet = new Set(ownedIds);
  const licenses = Array.isArray(state.licenses) ? state.licenses : ['retail'];
  const cash = state.portfolio?.cash || 0;
  const profile = getProfile();
  const equippedRelics = Array.isArray(state.blackMarketEquippedRelics) ? state.blackMarketEquippedRelics : [];
  const equippedRelicSet = new Set(equippedRelics);
  const relicSlotLimit = getRelicSlotLimit({ seatOwned: !!state.seatOwned });
  const listing = getTodaysBlackMarketListing(day, { ownedIds });
  const daysLeft = Math.max(0, listing.expiresDay - day);
  const seatActive = isSeatListingActive(day, { licenses, seatOwned: state.seatOwned });
  const seatGate = canPurchaseSeat({
    cash,
    licenses,
    seatOwned: !!state.seatOwned,
    seatListingActive: seatActive,
  });
  const seenExpired = Array.isArray(state.blackMarketSeenExpired) ? state.blackMarketSeenExpired : [];
  const affordableNow = listing.items.filter((item) => canPurchaseBlackMarketItem(item, {
    cash,
    blackMarketOwned: ownedIds,
    licenses,
  }).ok);
  const lockedByLicense = listing.items.some((item) => !hasLicense(licenses, requiredLicenseForRep(item.repRequired).id));
  const showRoadmap = listing.items.length < 2 || affordableNow.length === 0;
  const roadmapHtml = showRoadmap
    ? `<div class="blackmarket-roadmap" role="note">
        <strong>Black Market roadmap</strong>
        <p>${lockedByLicense
    ? `Some listings need a higher <strong>license</strong>. Pass exams on the Perks view, then come back for the rotation.`
    : `Today's window is out of reach on your current cash/license. Keep trading — the rotation refreshes by in-game day.`}</p>
      </div>`
    : '';

  root.innerHTML = `
    <div class="blackmarket-shell">
      <header class="blackmarket-hero">
        <div>
          <p class="blackmarket-eyebrow">Scarcity rotation</p>
          <h2>Black Market</h2>
          <p class="blackmarket-sub">Listings rotate by in-game day. Miss the window and it can disappear for a long time.</p>
        </div>
        <div class="blackmarket-timer">
          <strong>Day ${day}</strong>
          <span>${daysLeft} day${daysLeft === 1 ? '' : 's'} until this window cycles</span>
          <span>Relic slots ${equippedRelics.length}/${relicSlotLimit}</span>
        </div>
      </header>
      ${roadmapHtml}
      <div class="blackmarket-relic-bar">
        <strong>Active relics:</strong>
        <span>${equippedRelics.length
    ? equippedRelics.map((id) => escapeHtml(ITEM_BY_ID.get(id)?.name || id)).join(' · ')
    : 'None equipped'}</span>
      </div>
      <div class="blackmarket-list">
        ${listing.items.map((item) => {
          const owned = ownedSet.has(item.id);
          const slot = getVaultSlotForItem(item);
          const equipped = !!slot && profile?.cosmetics?.[slot] === item.id;
          const relic = getRelicEffect(item.id);
          const relicEquipped = !!relic && equippedRelicSet.has(item.id);
          const gate = canPurchaseBlackMarketItem(item, {
            cash,
            blackMarketOwned: ownedIds,
            licenses,
          });
          const disabled = !gate.ok ? 'disabled' : '';
          return `
            <article class="blackmarket-card rarity-${escapeHtml(item.rarity)} ${owned ? 'owned' : ''} ${relic ? 'relic' : ''}">
              <div class="blackmarket-card-head">
                <h3>${escapeHtml(item.name)}</h3>
                <span class="blackmarket-rarity">${escapeHtml(rarityLabel(item.rarity))}</span>
              </div>
              <p>${escapeHtml(item.desc)}</p>
              <div class="blackmarket-meta">
                <span class="blackmarket-chip">${fmt(item.cost)}</span>
                <span class="blackmarket-chip">${escapeHtml(requiredLicenseForRep(item.repRequired).short)} license</span>
                <span class="blackmarket-chip">${escapeHtml(item.category)}</span>
              </div>
              <div class="blackmarket-actions">
                ${owned
    ? (relic
      ? `<button type="button" class="btn ${relicEquipped ? '' : 'btn-accent'}" data-blackmarket-relic-toggle="${item.id}">${relicEquipped ? 'Relic Equipped' : 'Equip Relic'}</button>`
      : `<button type="button" class="btn ${equipped ? '' : 'btn-accent'}" data-blackmarket-equip="${item.id}" ${equipped ? 'disabled' : ''}>${equipped ? 'Equipped' : 'Equip'}</button>`)
    : `<button type="button" class="btn btn-accent" data-blackmarket-buy="${item.id}" ${disabled}>Buy</button>`
  }
                <span class="blackmarket-hint">${owned
    ? (relic
      ? escapeHtml(relic.summary)
      : (equipped ? 'Active cosmetic.' : 'Owned on this save.'))
    : escapeHtml(gate.ok ? (relic ? `Relic power: ${relic.summary}` : 'Available now.') : gate.reason)}</span>
              </div>
            </article>
          `;
        }).join('')}
      </div>
      <div class="blackmarket-seat ${state.seatOwned ? 'owned' : ''}">
        <div class="blackmarket-seat-head">
          <h3>${escapeHtml(THE_SEAT.name)}</h3>
          <span class="blackmarket-rarity">Seat</span>
        </div>
        <p>${escapeHtml(THE_SEAT.desc)}</p>
        <div class="blackmarket-meta">
          <span class="blackmarket-chip">${fmt(THE_SEAT.cost)}</span>
          <span class="blackmarket-chip">${escapeHtml(requiredLicenseForRep(THE_SEAT.repRequired).short)} license</span>
          <span class="blackmarket-chip">${seatActive ? 'Active window' : 'Inactive'}</span>
        </div>
        <div class="blackmarket-actions">
          ${state.seatOwned
            ? '<button type="button" class="btn" disabled>Claimed</button>'
            : `<button type="button" class="btn btn-accent" data-seat-buy ${seatGate.ok ? '' : 'disabled'}>Buy Seat</button>`
          }
          <span class="blackmarket-hint">${state.seatOwned ? 'Owned on this save.' : escapeHtml(seatGate.ok ? 'Extremely rare listing window.' : seatGate.reason)}</span>
        </div>
      </div>
      <div class="blackmarket-missed">
        <div class="blackmarket-missed-title">Missed listings</div>
        <div class="blackmarket-missed-list">
          ${seenExpired.length
            ? seenExpired.slice(-8).map((id) => escapeHtml(ITEM_BY_ID.get(id)?.name || id)).join(' · ')
            : 'None yet'}
        </div>
      </div>
    </div>
  `;

  root.querySelectorAll('[data-blackmarket-buy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-blackmarket-buy');
      if (id) state.onBuyBlackMarketItem?.(id);
    });
  });
  root.querySelectorAll('[data-blackmarket-equip]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-blackmarket-equip');
      if (id) state.onEquipCosmeticItem?.(id);
    });
  });
  root.querySelectorAll('[data-seat-buy]').forEach((btn) => {
    btn.addEventListener('click', () => state.onBuySeat?.());
  });
  root.querySelectorAll('[data-blackmarket-relic-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-blackmarket-relic-toggle');
      if (id) state.onToggleBlackMarketRelic?.(id);
    });
  });
}
