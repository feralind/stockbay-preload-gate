// @ts-check
import {
  VAULT_ITEMS, VAULT_CATEGORIES, VAULT_CATEGORY_LABELS, VAULT_EQUIP_SLOT_LABELS,
  canPurchaseVaultItem, isMasterworkVaultItem,
  getVaultBookValue, getVaultDeskAura, getVaultItem, getVaultSlotForItem,
  getVaultPledgedAppraisal, loanLocksVaultPledge,
} from '../vault.js';
import {
  getActiveSalonListing, canPurchaseSalonItem, PRIVATE_SALON_POOL, collectExpiredSalonIds,
  SALON_LISTING_TTL_DAYS,
} from '../private-salon.js';
import { getSpendableCash } from '../portfolio.js';
import { getProfile } from '../profile.js';
import { formatMarketClock } from '../market.js';
import { escapeHtml, fmt } from './shared.js';

let activeVaultFilter = 'all';

const ITEM_GLYPH = {
  goldTerminal: '▣',
  tungstenDial: '◎',
  obsidianTicker: '▤',
  yachtBackground: '≈',
  penthouseNight: '⌂',
  bullMarble: '▲',
  crashDayTape: '≡',
  apexBadge: '✦',
  halcyonPin: '⌖',
  floorLegendTitle: 'A',
  volatilityWhisperer: '~',
  closingBellRoyalty: '♪',
  bronzeBullBust: '◆',
  glassTickerWall: '⧉',
  auroraDeck: '∿',
  deskSovereign: '♔',
  imperialTriptych: '▤',
  augustusLaurel: '✦',
  gutenbergFolio: '§',
  rothkoField: '▣',
  diademProvenance: '♛',
  vermeerAttribution: '⌂',
  fabergeImperial: '◈',
};

function gid(item, style, variant = '') {
  return `vg-${style}-${item.id}${variant ? `-${variant}` : ''}`;
}

/**
 * Authenticity motifs on the shared foil plate (Trophy Vault + Collection Log).
 * Motif templates cover all 16 ids — painting / coin / instrument / vessel / relic / seal.
 */
const VAULT_MOTIF_BY_ID = {
  goldTerminal: 'instrument',
  tungstenDial: 'instrument',
  obsidianTicker: 'vessel',
  glassTickerWall: 'vessel',
  yachtBackground: 'painting',
  penthouseNight: 'painting',
  bullMarble: 'painting',
  auroraDeck: 'painting',
  crashDayTape: 'relic',
  apexBadge: 'relic',
  halcyonPin: 'coin',
  bronzeBullBust: 'relic',
  floorLegendTitle: 'seal',
  volatilityWhisperer: 'seal',
  closingBellRoyalty: 'seal',
  deskSovereign: 'seal',
  imperialTriptych: 'painting',
  augustusLaurel: 'relic',
  gutenbergFolio: 'instrument',
  rothkoField: 'painting',
  diademProvenance: 'seal',
  vermeerAttribution: 'painting',
  fabergeImperial: 'relic',
};

export { VAULT_MOTIF_BY_ID };

function motifPainting(id) {
  return `
    <rect x="26" y="14" width="68" height="48" rx="2" fill="#0b1220" opacity="0.45"/>
    <rect x="26" y="14" width="68" height="48" rx="2" fill="none" stroke="#fff" stroke-width="2" opacity="0.75" filter="url(#${id}-glow)"/>
    <rect x="30" y="18" width="60" height="40" rx="1" fill="none" stroke="#fff" stroke-width="0.7" opacity="0.35"/>
    <path d="M34 48 Q42 30 50 36 Q58 44 66 28 Q72 22 86 40" fill="none" stroke="#fff" stroke-width="1.8" opacity="0.85" filter="url(#${id}-glow)"/>
    <path d="M36 50 Q48 42 60 46 Q74 50 84 44" fill="none" stroke="#fff" stroke-width="1" opacity="0.4"/>`;
}

function motifCoin(id) {
  return `
    <circle cx="60" cy="38" r="22" fill="#0b1220" opacity="0.45"/>
    <circle cx="60" cy="38" r="22" fill="none" stroke="#fff" stroke-width="2" opacity="0.8" filter="url(#${id}-glow)"/>
    <circle cx="60" cy="38" r="16" fill="none" stroke="#fff" stroke-width="0.8" opacity="0.4"/>
    <path d="M60 20 v36 M42 38 h36 M48 26 L72 50 M72 26 L48 50" stroke="#fff" stroke-width="1.2" opacity="0.55"/>
    <circle cx="60" cy="38" r="4" fill="#fff" opacity="0.55"/>`;
}

function motifInstrument(id) {
  return `
    <circle cx="60" cy="38" r="20" fill="#0b1220" opacity="0.4"/>
    <circle cx="60" cy="38" r="20" fill="none" stroke="#fff" stroke-width="1.8" opacity="0.8" filter="url(#${id}-glow)"/>
    <circle cx="60" cy="38" r="12" fill="none" stroke="#fff" stroke-width="0.8" opacity="0.4"/>
    <path d="M60 18 L60 38 L74 46" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.85"/>
    <path d="M48 22 L60 38 L72 22 M44 38 h32 M48 54 L60 38 L72 54" stroke="#fff" stroke-width="0.9" opacity="0.45"/>
    <circle cx="60" cy="38" r="2.5" fill="#fff" opacity="0.9"/>`;
}

function motifVessel(id) {
  return `
    <ellipse cx="60" cy="40" rx="28" ry="18" fill="#0b1220" opacity="0.45"/>
    <ellipse cx="60" cy="40" rx="28" ry="18" fill="none" stroke="#fff" stroke-width="1.8" opacity="0.75" filter="url(#${id}-glow)"/>
    <ellipse cx="60" cy="40" rx="18" ry="10" fill="none" stroke="#fff" stroke-width="0.8" opacity="0.4"/>
    <path d="M40 34 Q60 28 80 34" fill="none" stroke="#fff" stroke-width="1.2" opacity="0.55"/>
    <rect x="34" y="54" width="52" height="6" rx="2" fill="#0b1220" opacity="0.35"/>
    <rect x="34" y="54" width="52" height="6" rx="2" fill="none" stroke="#fff" stroke-width="0.8" opacity="0.45"/>`;
}

function motifRelic(id) {
  return `
    <ellipse cx="60" cy="42" rx="16" ry="10" fill="#0b1220" opacity="0.4"/>
    <path d="M48 40 Q50 28 60 24 Q70 28 72 40 Q70 50 60 54 Q50 50 48 40Z" fill="#0b1220" opacity="0.5"/>
    <path d="M48 40 Q50 28 60 24 Q70 28 72 40 Q70 50 60 54 Q50 50 48 40Z" fill="none" stroke="#fff" stroke-width="1.8" opacity="0.8" filter="url(#${id}-glow)"/>
    <circle cx="60" cy="36" r="3" fill="#fff" opacity="0.7"/>
    <path d="M52 44 h16" stroke="#fff" stroke-width="1" opacity="0.45"/>
    <rect x="44" y="56" width="32" height="4" rx="1" fill="#fff" opacity="0.2"/>`;
}

function motifSeal(id) {
  return `
    <circle cx="60" cy="36" r="18" fill="#0b1220" opacity="0.5"/>
    <circle cx="60" cy="36" r="18" fill="none" stroke="#fff" stroke-width="2" opacity="0.8" filter="url(#${id}-glow)"/>
    <circle cx="60" cy="36" r="12" fill="none" stroke="#fff" stroke-width="0.9" opacity="0.45"/>
    <path d="M60 24 L64 34 L74 34 L66 40 L69 50 L60 44 L51 50 L54 40 L46 34 L56 34 Z" fill="#fff" opacity="0.55"/>
    <path d="M52 56 Q60 62 68 56" fill="none" stroke="#fff" stroke-width="1.4" opacity="0.5"/>
    <path d="M56 58 v8 M64 58 v8" stroke="#fff" stroke-width="1.2" opacity="0.45"/>`;
}

const MOTIF_RENDERERS = {
  painting: motifPainting,
  coin: motifCoin,
  instrument: motifInstrument,
  vessel: motifVessel,
  relic: motifRelic,
  seal: motifSeal,
};

function foilMotif(item, id) {
  const key = VAULT_MOTIF_BY_ID[item?.id] || 'relic';
  const render = MOTIF_RENDERERS[key] || motifRelic;
  return render(id);
}

function artFoil(item, variant = '') {
  const id = gid(item, 'foil', variant);
  const foilDefs = `
    <linearGradient id="${id}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#67e8f9"><animate attributeName="stop-color" values="#67e8f9;#c4b5fd;#fda4af;#fde68a;#86efac;#67e8f9" dur="4s" repeatCount="indefinite"/></stop>
      <stop offset="35%" stop-color="#c4b5fd"><animate attributeName="stop-color" values="#c4b5fd;#fda4af;#fde68a;#86efac;#7dd3fc;#c4b5fd" dur="4s" repeatCount="indefinite"/></stop>
      <stop offset="70%" stop-color="#fda4af"><animate attributeName="stop-color" values="#fda4af;#fde68a;#86efac;#67e8f9;#c4b5fd;#fda4af" dur="4s" repeatCount="indefinite"/></stop>
      <stop offset="100%" stop-color="#fde68a"><animate attributeName="stop-color" values="#fde68a;#86efac;#67e8f9;#c4b5fd;#fda4af;#fde68a" dur="4s" repeatCount="indefinite"/></stop>
    </linearGradient>
    <linearGradient id="${id}-shine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#fff" stop-opacity="0"/>
      <stop offset="45%" stop-color="#fff" stop-opacity="0"/>
      <stop offset="50%" stop-color="#fff" stop-opacity="0.9"/>
      <stop offset="55%" stop-color="#fff" stop-opacity="0"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="${id}-clip"><rect x="8" y="8" width="104" height="60" rx="10"/></clipPath>
    <filter id="${id}-glow"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  `;
  const foilBase = `
    <rect width="120" height="76" fill="#0a0c12"/>
    <rect x="8" y="8" width="104" height="60" rx="10" fill="url(#${id})" opacity="0.94" class="vault-foil-plate"/>
    <g clip-path="url(#${id}-clip)">
      <rect x="-70" y="8" width="48" height="60" fill="url(#${id}-shine)" class="vault-foil-sheen" opacity="0.95">
        <animate attributeName="x" values="-70;140" dur="2.3s" repeatCount="indefinite"/>
      </rect>
    </g>
  `;
  const motif = foilMotif(item, id);
  return `
    <svg class="vault-art-svg vault-art-svg--foil" viewBox="0 0 120 76" aria-hidden="true">
      <defs>${foilDefs}</defs>
      ${foilBase}
      ${motif}
    </svg>`;
}


function vaultItemArtHtml(item, variant = '') {
  return artFoil(item, variant);
}

/** Shared foil plate art for Vault + Collection Log cards. */
export function renderVaultFoilArt(item, variant = '') {
  if (!item?.id) return '';
  return artFoil(item, variant);
}

function prestigeBonusChip(item) {
  const bonus = item?.prestigeBonus;
  if (!bonus) return '';
  const bits = [];
  if (bonus.repPerClose > 0) bits.push(`+${bonus.repPerClose} REP/close`);
  if (bonus.dailyCap > 0) bits.push(`+${bonus.dailyCap} daily cap`);
  if (!bits.length) return '';
  return `<span class="vault-chip vault-chip-bonus">${escapeHtml(bits.join(' · '))}</span>`;
}

function rarityClass(item) {
  const r = String(item?.rarity || '').toLowerCase();
  if (r === 'masterwork' || r === 'crown') return ` rarity-${r}`;
  return '';
}

function renderVaultCard(item, {
  ownedSet, pledgedSet, pledgeLocked, cosmetics, cash, ownedIds, rep, state,
}) {
  const owned = ownedSet.has(item.id);
  const gate = canPurchaseVaultItem(item, { cash, vaultOwned: ownedIds, reputation: rep });
  const slot = getVaultSlotForItem(item);
  const equipped = !!slot && cosmetics?.[slot] === item.id;
  const canEquip = owned && slot && !equipped;
  const pledged = pledgedSet.has(item.id);
  const buyDisabled = !gate.ok ? 'disabled' : '';
  const repText = item.repRequired ? `${item.repRequired} REP` : 'No REP gate';
  const rarityLabel = item.rarity ? String(item.rarity).charAt(0).toUpperCase() + String(item.rarity).slice(1) : '';
  return `
    <article class="vault-card${rarityClass(item)} ${owned ? 'owned' : ''} ${equipped ? 'equipped' : ''} ${pledged ? 'pledged' : ''}">
      <div class="vault-art ${owned ? 'owned' : 'locked'} ${equipped ? 'lit' : ''}">
        ${vaultItemArtHtml(item, `card-${item.id}`)}
      </div>
      <div class="vault-card-top">
        <div>
          <h3>${escapeHtml(item.name)}</h3>
          <p>${escapeHtml(item.desc)}</p>
        </div>
        ${cardStatusHtml({ owned, equipped, gate })}
      </div>
      <div class="vault-meta">
        <span class="vault-chip">${escapeHtml(VAULT_CATEGORY_LABELS[item.category] || item.category)}</span>
        ${rarityLabel ? `<span class="vault-chip">${escapeHtml(rarityLabel)}</span>` : ''}
        <span class="vault-chip">${escapeHtml(repText)}</span>
        <span class="vault-chip">${fmt(item.cost)}</span>
        <span class="vault-chip">Appraisal ${fmt(item.cost)}</span>
        ${prestigeBonusChip(item)}
        ${pledged ? '<span class="vault-chip">Pledged</span>' : ''}
      </div>
      <div class="vault-actions">
        ${owned
          ? `<button type="button" class="btn ${canEquip ? 'btn-accent' : ''} vault-equip-btn" data-vault-equip="${item.id}" ${canEquip ? '' : 'disabled'}>${equipped ? 'Equipped' : 'Equip'}</button>
             <button type="button" class="btn vault-pledge-btn" data-vault-pledge="${item.id}" ${pledgeLocked ? 'disabled' : ''}>${pledged ? (pledgeLocked ? 'Pledged (loan)' : 'Unpledge') : 'Pledge'}</button>`
          : `<button type="button" class="btn btn-accent vault-buy-btn" data-vault-buy="${item.id}" ${buyDisabled}>Buy</button>`
        }
        <span class="vault-hint">${owned
          ? (pledgeLocked
            ? 'Backing an active loan — pay it off to unpledge.'
            : pledged
              ? 'Pledged — raises Financing borrowing ceiling (50% LTV). Late default can repossess.'
              : (equipped ? 'Active prestige slot + booked into Net Worth.' : 'Owned — equip for Desk Prestige or pledge as collateral.'))
          : escapeHtml(gate.ok ? 'Purchases book into Net Worth immediately.' : gate.reason)}</span>
      </div>
    </article>
  `;
}

function salonSectionHtml(state, { day, ownedIds, rep, cash }) {
  const listing = getActiveSalonListing(day, { ownedIds });
  const item = listing.item;
  const seenExpired = Array.isArray(state.salonSeenExpired) ? state.salonSeenExpired : [];
  const missed = collectExpiredSalonIds(day, { ownedIds })
    .filter((id) => !ownedIds.includes(id) && !seenExpired.includes(id));
  const daysLeft = item ? Math.max(0, listing.expiresDay - day) : 0;

  let listingHtml = '<p class="vault-salon-empty">No crown jewel active today. Windows are extremely rare — check back as your desk grows.</p>';
  if (item) {
    const owned = ownedIds.includes(item.id);
    const gate = canPurchaseSalonItem(item, {
      cash,
      vaultOwned: ownedIds,
      reputation: rep,
      listingActive: true,
    });
    const profile = getProfile();
    const slot = getVaultSlotForItem(item);
    const equipped = !!slot && profile?.cosmetics?.[slot] === item.id;
    const pledged = (state.vaultPledged || []).includes(item.id);
    listingHtml = `
      <article class="vault-card salon-card rarity-crown ${owned ? 'owned' : ''}">
        <div class="vault-card-top">
          <div>
            <h3>${escapeHtml(item.name)}</h3>
            <p>${escapeHtml(item.desc)}</p>
          </div>
          <span class="vault-status ${owned ? 'owned' : (gate.ok ? 'buy' : 'locked')}">${owned ? 'Owned' : (gate.ok ? 'Active window' : escapeHtml(gate.reason || 'Locked'))}</span>
        </div>
        <div class="vault-meta">
          <span class="vault-chip">Crown</span>
          <span class="vault-chip">${item.repRequired} REP</span>
          <span class="vault-chip">${fmt(item.cost)}</span>
          ${prestigeBonusChip(item)}
          <span class="vault-chip">${daysLeft}d left</span>
        </div>
        <div class="vault-art ${owned ? 'owned' : 'locked'} ${equipped ? 'lit' : ''}">
          ${vaultItemArtHtml(item, `salon-${item.id}`)}
        </div>
        <div class="vault-actions">
          ${owned
            ? `<button type="button" class="btn vault-equip-btn" data-vault-equip="${item.id}" ${equipped ? 'disabled' : ''}>${equipped ? 'Equipped' : 'Equip'}</button>`
            : `<button type="button" class="btn btn-accent" data-salon-buy="${item.id}" ${gate.ok ? '' : 'disabled'}>Acquire crown</button>`
          }
          <span class="vault-hint">${owned ? 'Crown booked into Net Worth — equip for flagship Desk Prestige.' : 'Miss this window and it may not return for a long time.'}</span>
        </div>
      </article>
    `;
  }

  const missedHtml = missed.length
    ? `<div class="vault-salon-missed"><span>Recently missed:</span> ${missed.map((id) => escapeHtml(getVaultItem(id)?.name || id)).join(' · ')}</div>`
    : '';

  return `
    <section class="vault-salon-panel">
      <header class="vault-salon-head">
        <div>
          <p class="vault-eyebrow">Ultra-rare rotation</p>
          <h3>Private Salon</h3>
          <p class="vault-sub">Crown jewels ($2.5M–$5M) appear on scarce windows (${SALON_LISTING_TTL_DAYS}-day TTL). Acquire → books into vault ownership &amp; collateral.</p>
        </div>
        <div class="vault-salon-timer">Day ${day}${item ? ` · expires day ${listing.expiresDay}` : ''}</div>
      </header>
      ${listingHtml}
      ${missedHtml}
    </section>
  `;
}

function categoryFilterRow(ownedCount, totalCount, spentTotal, bookValue) {
  const pills = ['all', 'masterworks', ...VAULT_CATEGORIES].map((cat) => {
    let label = cat === 'all' ? 'All' : (cat === 'masterworks' ? 'Masterworks' : (VAULT_CATEGORY_LABELS[cat] || cat));
    const active = activeVaultFilter === cat ? 'active' : '';
    return `<button type="button" class="vault-filter ${active}" data-vault-filter="${cat}">${escapeHtml(label)}</button>`;
  }).join('');
  return `
    <div class="vault-toolbar">
      <div class="vault-kpis">
        <div class="vault-kpi"><span>Owned</span><strong>${ownedCount} / ${totalCount}</strong></div>
        <div class="vault-kpi"><span>Spent</span><strong>${fmt(spentTotal)}</strong></div>
        <div class="vault-kpi"><span>Book value</span><strong>${fmt(bookValue)}</strong></div>
      </div>
      <div class="vault-filters">${pills}</div>
    </div>
  `;
}

function cardStatusHtml({ owned, equipped, gate }) {
  if (owned && equipped) return '<span class="vault-status equipped">Equipped</span>';
  if (owned) return '<span class="vault-status owned">Owned</span>';
  if (gate.ok) return '<span class="vault-status buy">Available</span>';
  if (gate.code === 'rep') return `<span class="vault-status locked">${escapeHtml(gate.reason)}</span>`;
  if (gate.code === 'cash') return '<span class="vault-status locked">Need cash</span>';
  return `<span class="vault-status locked">${escapeHtml(gate.reason || 'Locked')}</span>`;
}

export function renderVault(state) {
  const root = document.getElementById('vault-root');
  if (!root) return;
  const day = formatMarketClock()?.day || 1;
  const rep = state.meta?.reputation || 0;
  const cash = getSpendableCash(state.portfolio || { cash: 0 });
  const ownedIds = Array.isArray(state.vaultOwned) ? state.vaultOwned : [];
  const ownedSet = new Set(ownedIds);
  const pledgedSet = new Set(Array.isArray(state.vaultPledged) ? state.vaultPledged : []);
  const pledgedValue = getVaultPledgedAppraisal(state);
  const spentTotal = Math.max(0, Number(state.vaultSpentTotal) || 0);
  const bookValue = getVaultBookValue(state);
  const profile = getProfile();
  const cosmetics = profile?.cosmetics || {};
  const ownedSetForEquip = new Set(ownedIds);
  const aura = getVaultDeskAura({ cosmetics, vaultOwned: ownedIds, perks: state.perks });
  const auraUsed = Math.max(0, Math.floor(Number(state.meta?.vaultAuraRepToday) || 0));
  const equippedSummary = [
    { slot: 'dashboard', label: VAULT_EQUIP_SLOT_LABELS.dashboard },
    { slot: 'background', label: VAULT_EQUIP_SLOT_LABELS.background },
    { slot: 'badge', label: VAULT_EQUIP_SLOT_LABELS.badge },
    { slot: 'title', label: VAULT_EQUIP_SLOT_LABELS.title },
  ].map((entry) => {
    const id = cosmetics[entry.slot];
    const item = (typeof id === 'string' && ownedSetForEquip.has(id)) ? getVaultItem(id) : null;
    return { ...entry, item };
  });

  const allItems = Object.values(VAULT_ITEMS).slice().sort((a, b) => {
    const aStarter = (a.repRequired || 0) === 0 ? 0 : 1;
    const bStarter = (b.repRequired || 0) === 0 ? 0 : 1;
    if (aStarter !== bStarter) return aStarter - bStarter;
    const repDiff = (a.repRequired || 0) - (b.repRequired || 0);
    if (repDiff !== 0) return repDiff;
    return (a.cost || 0) - (b.cost || 0);
  });
  const coreItems = allItems.filter((item) => !isMasterworkVaultItem(item));
  const masterworkItems = allItems.filter((item) => isMasterworkVaultItem(item));

  const filterItems = (items) => items.filter((item) => {
    if (activeVaultFilter === 'all' || activeVaultFilter === 'masterworks') return true;
    return item.category === activeVaultFilter;
  });

  const shownCore = activeVaultFilter === 'masterworks' ? [] : filterItems(coreItems);
  const shownMasterworks = (activeVaultFilter === 'all' || activeVaultFilter === 'masterworks')
    ? filterItems(masterworkItems)
    : [];

  const cardCtx = {
    ownedSet,
    pledgedSet,
    cosmetics,
    cash,
    ownedIds,
    rep,
    state,
  };
  const pledgeLockedFor = (itemId) => pledgedSet.has(itemId) && loanLocksVaultPledge(state.finance, itemId);

  const canBuyAny = [...shownCore, ...shownMasterworks].some((item) => {
    if (ownedSet.has(item.id)) return false;
    return canPurchaseVaultItem(item, { cash, vaultOwned: ownedIds, reputation: rep }).ok;
  });
  const starterItems = coreItems.filter((item) => (item.repRequired || 0) === 0);
  const roadmapHtml = (!canBuyAny && ownedSet.size === 0)
    ? `<div class="vault-roadmap" role="note">
        <strong>Build toward your first piece</strong>
        <p>Starter vault items need cash, not REP —
          ${starterItems.map((i) => `${escapeHtml(i.name)} (${fmt(i.cost)})`).join(' · ') || 'check the grid below'}.
          Trade on the desk, then come back to book them into Net Worth.</p>
      </div>`
    : '';

  const ownedMasterworks = masterworkItems.filter((i) => ownedSet.has(i.id));
  const flagshipHtml = ownedMasterworks.length
    ? `<div class="vault-flagship-strip" role="note">
        <strong>Masterworks owned:</strong>
        ${ownedMasterworks.map((i) => `${escapeHtml(i.name)} (${fmt(i.cost)})`).join(' · ')}
      </div>`
    : '';

  const salonHtml = activeVaultFilter === 'all' ? salonSectionHtml(state, { day, ownedIds, rep, cash }) : '';
  const masterworksSection = shownMasterworks.length
    ? `<div class="vault-section-head"><h3>Masterworks</h3><span>$150K–$1.2M · always available once gates are met</span></div>
       <div class="vault-grid vault-grid-masterworks">${shownMasterworks.map((item) => renderVaultCard(item, { ...cardCtx, pledgeLocked: pledgeLockedFor(item.id) })).join('')}</div>`
    : '';
  const coreSection = shownCore.length
    ? `${activeVaultFilter === 'all' ? '<div class="vault-section-head"><h3>Desk Collection</h3><span>Core Trophy Vault</span></div>' : ''}
       <div class="vault-grid">${shownCore.map((item) => renderVaultCard(item, { ...cardCtx, pledgeLocked: pledgeLockedFor(item.id) })).join('')}</div>`
    : '';

  root.innerHTML = `
    <div class="vault-shell">
      <header class="vault-hero">
        <div>
          <p class="vault-eyebrow">Collectible desk wealth</p>
          <h2>Trophy Vault</h2>
          <p class="vault-sub">Buy pieces that appraise into Net Worth. Equip for Desk Prestige. Pledge owned pieces as loan collateral (50% LTV) at Financing.</p>
        </div>
        <div class="vault-hero-side">
          <div class="vault-cash-pill">Cash ${fmt(cash)}</div>
          <div class="vault-book-pill">Vault book ${fmt(bookValue)}</div>
          <div class="vault-book-pill">Pledged ${fmt(pledgedValue)}</div>
        </div>
      </header>
      ${roadmapHtml}
      ${flagshipHtml}
      <div class="vault-aura-panel tier-${aura.tier}">
        <div>
          <strong>${escapeHtml(aura.label)}</strong>
          <span>${aura.equipped}/4 slots · ${escapeHtml(aura.summary)}</span>
        </div>
        <div class="vault-aura-meter">${aura.tier > 0 ? `${auraUsed}/${aura.dailyCap} REP today` : 'Equip to activate'}</div>
      </div>
      <div class="vault-equipped-strip">
        ${equippedSummary.map((entry) => `
          <div class="vault-equipped-chip ${entry.item ? 'filled' : ''}">
            <span>${entry.label}</span>
            <strong>${escapeHtml(entry.item?.name || 'None')}</strong>
          </div>
        `).join('')}
      </div>
      ${categoryFilterRow(ownedSet.size, allItems.length + PRIVATE_SALON_POOL.length, spentTotal, bookValue)}
      ${salonHtml}
      ${masterworksSection}
      ${coreSection}
    </div>
  `;

  root.querySelectorAll('[data-vault-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeVaultFilter = btn.getAttribute('data-vault-filter') || 'all';
      renderVault(state);
    });
  });
  root.querySelectorAll('[data-vault-buy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const itemId = btn.getAttribute('data-vault-buy');
      if (itemId) state.onBuyVaultItem?.(itemId);
    });
  });
  root.querySelectorAll('[data-salon-buy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const itemId = btn.getAttribute('data-salon-buy');
      if (itemId) state.onBuySalonItem?.(itemId);
    });
  });
  root.querySelectorAll('[data-vault-equip]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const itemId = btn.getAttribute('data-vault-equip');
      if (itemId) state.onEquipVaultItem?.(itemId);
    });
  });
  root.querySelectorAll('[data-vault-pledge]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const itemId = btn.getAttribute('data-vault-pledge');
      if (itemId) state.onToggleVaultPledge?.(itemId);
    });
  });
}
