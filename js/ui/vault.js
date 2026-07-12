// @ts-check
import {
  VAULT_ITEMS, VAULT_CATEGORIES, VAULT_CATEGORY_LABELS, canPurchaseVaultItem,
  getVaultBookValue, getVaultDeskAura, getVaultItem, getVaultSlotForItem,
} from '../vault.js';
import { getProfile } from '../profile.js';
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
};

function gid(item, style, variant = '') {
  return `vg-${style}-${item.id}${variant ? `-${variant}` : ''}`;
}

function foilMotif(item, id) {
  switch (item.id) {
    case 'goldTerminal':
      return `
        <rect x="28" y="16" width="64" height="40" rx="4" fill="#0b1220" opacity="0.5"/>
        <rect x="32" y="20" width="56" height="32" rx="2" fill="none" stroke="#fff" stroke-width="1.2" opacity="0.7" filter="url(#${id}-glow)"/>
        <path d="M36 36 L44 30 L52 34 L60 24 L68 32 L76 26 L84 30" fill="none" stroke="#fff" stroke-width="1.8" opacity="0.9" filter="url(#${id}-glow)"/>
        <rect x="36" y="40" width="18" height="3" rx="1" fill="#fff" opacity="0.5"/>
        <rect x="36" y="45" width="12" height="2" rx="1" fill="#fff" opacity="0.35"/>
        <rect x="52" y="56" width="16" height="4" rx="2" fill="#fff" opacity="0.3"/>`;
    case 'tungstenDial':
      return `
        <circle cx="60" cy="36" r="22" fill="#0b1220" opacity="0.45"/>
        <circle cx="60" cy="36" r="20" fill="none" stroke="#fff" stroke-width="2" opacity="0.8" filter="url(#${id}-glow)"/>
        <circle cx="60" cy="36" r="15" fill="none" stroke="#fff" stroke-width="0.8" opacity="0.4"/>
        <path d="M60 36 L60 20" stroke="#fff" stroke-width="2.5" opacity="0.9" stroke-linecap="round"/>
        <path d="M60 36 L72 40" stroke="#fff" stroke-width="1.8" opacity="0.7" stroke-linecap="round"/>
        <circle cx="60" cy="36" r="3" fill="#fff" opacity="0.9"/>
        <path d="M42 56 h36" stroke="#fff" stroke-width="1" opacity="0.3"/>`;
    case 'obsidianTicker':
      return `
        <rect x="24" y="22" width="72" height="32" rx="6" fill="#0b1220" opacity="0.5"/>
        <rect x="28" y="26" width="64" height="24" rx="3" fill="none" stroke="#fff" stroke-width="1" opacity="0.6"/>
        <path d="M28 38 h64" stroke="#fff" stroke-width="0.6" opacity="0.3"/>
        <rect x="32" y="30" width="8" height="14" rx="1" fill="#fff" opacity="0.2"/>
        <rect x="42" y="32" width="6" height="10" rx="1" fill="#fff" opacity="0.3"/>
        <rect x="50" y="28" width="6" height="16" rx="1" fill="#fff" opacity="0.25"/>
        <rect x="58" y="31" width="6" height="11" rx="1" fill="#fff" opacity="0.35"/>
        <rect x="66" y="29" width="6" height="14" rx="1" fill="#fff" opacity="0.2"/>
        <rect x="74" y="33" width="6" height="9" rx="1" fill="#fff" opacity="0.3"/>
        <rect x="82" y="30" width="6" height="12" rx="1" fill="#fff" opacity="0.22"/>
        <circle cx="34" cy="56" r="3" fill="none" stroke="#fff" stroke-width="1" opacity="0.5"/>
        <circle cx="86" cy="56" r="3" fill="none" stroke="#fff" stroke-width="1" opacity="0.5"/>`;
    case 'glassTickerWall':
      return `
        <rect x="20" y="14" width="18" height="48" rx="3" fill="#0b1220" opacity="0.4"/>
        <rect x="42" y="14" width="18" height="48" rx="3" fill="#0b1220" opacity="0.4"/>
        <rect x="64" y="14" width="18" height="48" rx="3" fill="#0b1220" opacity="0.4"/>
        <rect x="86" y="14" width="14" height="48" rx="3" fill="#0b1220" opacity="0.4"/>
        <path d="M24 50 L28 42 L32 46 L36 34" stroke="#fff" stroke-width="1.4" fill="none" opacity="0.85" filter="url(#${id}-glow)"/>
        <path d="M46 48 L50 38 L54 44 L58 30" stroke="#fff" stroke-width="1.4" fill="none" opacity="0.85" filter="url(#${id}-glow)"/>
        <path d="M68 46 L72 36 L76 42 L80 28" stroke="#fff" stroke-width="1.4" fill="none" opacity="0.85" filter="url(#${id}-glow)"/>
        <rect x="20" y="14" width="18" height="48" rx="3" fill="none" stroke="#fff" stroke-width="0.8" opacity="0.5"/>`;
    case 'yachtBackground':
      return `
        <path d="M20 50 Q40 42 60 44 Q80 46 100 50 L96 54 Q60 48 24 54 Z" fill="#fff" opacity="0.7" filter="url(#${id}-glow)"/>
        <path d="M60 44 L60 22" stroke="#fff" stroke-width="1.8" opacity="0.8"/>
        <path d="M60 22 L80 34 L60 38" fill="#fff" opacity="0.35"/>
        <path d="M30 54 Q45 52 60 53 Q75 54 90 56" fill="none" stroke="#fff" stroke-width="0.8" opacity="0.4"/>
        <path d="M26 58 Q50 55 74 57 Q90 58 100 60" fill="none" stroke="#fff" stroke-width="0.6" opacity="0.25"/>
        <circle cx="42" cy="48" r="1.5" fill="#fff" opacity="0.5"/>
        <circle cx="78" cy="48" r="1.5" fill="#fff" opacity="0.5"/>`;
    case 'penthouseNight':
      return `
        <rect x="22" y="32" width="12" height="30" rx="1" fill="#0b1220" opacity="0.5"/>
        <rect x="36" y="24" width="14" height="38" rx="1" fill="#0b1220" opacity="0.5"/>
        <rect x="52" y="18" width="16" height="44" rx="1" fill="#0b1220" opacity="0.55"/>
        <rect x="70" y="28" width="12" height="34" rx="1" fill="#0b1220" opacity="0.5"/>
        <rect x="84" y="34" width="14" height="28" rx="1" fill="#0b1220" opacity="0.5"/>
        <rect x="25" y="36" width="3" height="3" fill="#fff" opacity="0.7"/>
        <rect x="25" y="42" width="3" height="3" fill="#fff" opacity="0.5"/>
        <rect x="30" y="38" width="3" height="3" fill="#fff" opacity="0.6"/>
        <rect x="39" y="28" width="3" height="3" fill="#fff" opacity="0.8"/>
        <rect x="44" y="28" width="3" height="3" fill="#fff" opacity="0.5"/>
        <rect x="39" y="34" width="3" height="3" fill="#fff" opacity="0.6"/>
        <rect x="44" y="40" width="3" height="3" fill="#fff" opacity="0.7"/>
        <rect x="55" y="22" width="4" height="4" fill="#fff" opacity="0.9" filter="url(#${id}-glow)"/>
        <rect x="62" y="22" width="4" height="4" fill="#fff" opacity="0.7"/>
        <rect x="55" y="30" width="4" height="4" fill="#fff" opacity="0.6"/>
        <rect x="62" y="36" width="4" height="4" fill="#fff" opacity="0.8"/>
        <rect x="73" y="32" width="3" height="3" fill="#fff" opacity="0.6"/>
        <rect x="87" y="38" width="3" height="3" fill="#fff" opacity="0.5"/>
        <path d="M18 62 h84" stroke="#fff" stroke-width="0.6" opacity="0.3"/>`;
    case 'bullMarble':
      return `
        <rect x="18" y="54" width="84" height="10" rx="1" fill="#fff" opacity="0.15"/>
        <rect x="24" y="18" width="6" height="36" rx="2" fill="#fff" opacity="0.25"/>
        <rect x="90" y="18" width="6" height="36" rx="2" fill="#fff" opacity="0.25"/>
        <rect x="22" y="16" width="10" height="4" rx="1" fill="#fff" opacity="0.3"/>
        <rect x="88" y="16" width="10" height="4" rx="1" fill="#fff" opacity="0.3"/>
        <path d="M50 50 Q52 40 56 38 Q60 36 64 38 Q68 40 70 50" fill="#fff" opacity="0.55"/>
        <path d="M52 38 L48 32 M68 38 L72 32" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity="0.7"/>
        <ellipse cx="60" cy="42" rx="6" ry="4" fill="#fff" opacity="0.3"/>
        <circle cx="56" cy="40" r="1.2" fill="#fff" opacity="0.8"/>
        <circle cx="64" cy="40" r="1.2" fill="#fff" opacity="0.8"/>
        <path d="M30 54 h60" stroke="#fff" stroke-width="0.5" opacity="0.2" stroke-dasharray="2 2"/>`;
    case 'auroraDeck':
      return `
        <path d="M10 40 Q30 28 50 34 Q70 40 90 30 Q105 24 115 28" fill="none" stroke="#fff" stroke-width="2.5" opacity="0.7" filter="url(#${id}-glow)"/>
        <path d="M10 46 Q35 36 55 42 Q75 48 95 38 Q108 32 115 36" fill="none" stroke="#fff" stroke-width="1.8" opacity="0.5" filter="url(#${id}-glow)"/>
        <path d="M10 52 Q40 44 60 50 Q80 56 100 46 Q112 40 115 44" fill="none" stroke="#fff" stroke-width="1.2" opacity="0.35"/>
        <rect x="40" y="56" width="40" height="6" rx="2" fill="#0b1220" opacity="0.4"/>
        <path d="M42 58 h36" stroke="#fff" stroke-width="0.6" opacity="0.4"/>
        <circle cx="60" cy="24" r="2" fill="#fff" opacity="0.6"/>`;
    case 'crashDayTape':
      return `
        <rect x="28" y="14" width="64" height="48" rx="3" fill="#0b1220" opacity="0.45"/>
        <rect x="28" y="14" width="64" height="48" rx="3" fill="none" stroke="#fff" stroke-width="2" opacity="0.7"/>
        <rect x="30" y="16" width="60" height="44" rx="2" fill="none" stroke="#fff" stroke-width="0.8" opacity="0.35"/>
        <circle cx="48" cy="38" r="8" fill="none" stroke="#fff" stroke-width="1.4" opacity="0.7" filter="url(#${id}-glow)"/>
        <circle cx="72" cy="38" r="8" fill="none" stroke="#fff" stroke-width="1.4" opacity="0.7" filter="url(#${id}-glow)"/>
        <circle cx="48" cy="38" r="3" fill="#fff" opacity="0.4"/>
        <circle cx="72" cy="38" r="3" fill="#fff" opacity="0.4"/>
        <path d="M56 38 h8" stroke="#fff" stroke-width="1" opacity="0.5"/>
        <rect x="38" y="22" width="44" height="3" rx="1" fill="#fff" opacity="0.25"/>`;
    case 'apexBadge':
      return `
        <path d="M60 16 L82 24 L82 42 Q82 56 60 62 Q38 56 38 42 L38 24 Z" fill="#0b1220" opacity="0.45"/>
        <path d="M60 16 L82 24 L82 42 Q82 56 60 62 Q38 56 38 42 L38 24 Z" fill="none" stroke="#fff" stroke-width="2" opacity="0.8" filter="url(#${id}-glow)"/>
        <path d="M60 22 L74 28 L74 40 Q74 50 60 55 Q46 50 46 40 L46 28 Z" fill="none" stroke="#fff" stroke-width="0.8" opacity="0.4"/>
        <text x="60" y="43" text-anchor="middle" font-size="14" fill="#fff" opacity="0.85" font-weight="700">A</text>`;
    case 'halcyonPin':
      return `
        <circle cx="60" cy="36" r="20" fill="#0b1220" opacity="0.45"/>
        <circle cx="60" cy="36" r="20" fill="none" stroke="#fff" stroke-width="2" opacity="0.75" filter="url(#${id}-glow)"/>
        <circle cx="60" cy="36" r="14" fill="none" stroke="#fff" stroke-width="0.8" opacity="0.4"/>
        <path d="M60 18 v36 M42 36 h36" stroke="#fff" stroke-width="1" opacity="0.5"/>
        <circle cx="60" cy="36" r="4" fill="#fff" opacity="0.6"/>
        <path d="M48 56 L52 52 M72 56 L68 52" stroke="#fff" stroke-width="1.4" opacity="0.5"/>
        <rect x="50" y="58" width="20" height="3" rx="1" fill="#fff" opacity="0.3"/>`;
    case 'bronzeBullBust':
      return `
        <ellipse cx="60" cy="58" rx="18" ry="4" fill="#fff" opacity="0.12"/>
        <path d="M46 32 Q48 22 54 20 Q60 18 66 20 Q72 22 74 32 Q74 42 68 48 Q64 52 60 52 Q56 52 52 48 Q46 42 46 32Z" fill="#0b1220" opacity="0.5"/>
        <path d="M46 32 Q48 22 54 20 Q60 18 66 20 Q72 22 74 32 Q74 42 68 48 Q64 52 60 52 Q56 52 52 48 Q46 42 46 32Z" fill="none" stroke="#fff" stroke-width="1.8" opacity="0.75" filter="url(#${id}-glow)"/>
        <path d="M46 28 L38 20 M74 28 L82 20" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity="0.8"/>
        <circle cx="54" cy="34" r="2" fill="#fff" opacity="0.7"/>
        <circle cx="66" cy="34" r="2" fill="#fff" opacity="0.7"/>
        <ellipse cx="60" cy="42" rx="5" ry="3" fill="none" stroke="#fff" stroke-width="1" opacity="0.5"/>
        <circle cx="58" cy="42" r="1" fill="#fff" opacity="0.5"/>
        <circle cx="62" cy="42" r="1" fill="#fff" opacity="0.5"/>`;
    case 'floorLegendTitle':
      return `
        <path d="M40 42 Q42 28 50 24 Q56 20 60 18 Q64 20 70 24 Q78 28 80 42" fill="none" stroke="#fff" stroke-width="1.8" opacity="0.7" filter="url(#${id}-glow)"/>
        <path d="M44 40 Q46 32 52 28 L60 24 L68 28 Q74 32 76 40" fill="#0b1220" opacity="0.4"/>
        <circle cx="50" cy="24" r="2" fill="#fff" opacity="0.8"/>
        <circle cx="60" cy="18" r="2.5" fill="#fff" opacity="0.9" filter="url(#${id}-glow)"/>
        <circle cx="70" cy="24" r="2" fill="#fff" opacity="0.8"/>
        <path d="M36 46 Q48 42 60 44 Q72 46 84 44" fill="none" stroke="#fff" stroke-width="1" opacity="0.5"/>
        <rect x="42" y="50" width="36" height="6" rx="2" fill="#0b1220" opacity="0.4"/>`;
    case 'volatilityWhisperer':
      return `
        <rect x="24" y="24" width="72" height="28" rx="4" fill="#0b1220" opacity="0.4"/>
        <path d="M28 38 L36 38 L40 26 L44 50 L48 30 L52 46 L56 34 L60 42 L64 28 L68 48 L72 32 L76 44 L80 36 L84 38 L92 38" fill="none" stroke="#fff" stroke-width="1.6" opacity="0.85" filter="url(#${id}-glow)"/>
        <path d="M28 38 h64" stroke="#fff" stroke-width="0.5" opacity="0.25" stroke-dasharray="2 1"/>
        <rect x="40" y="54" width="40" height="5" rx="2" fill="#0b1220" opacity="0.4"/>`;
    case 'closingBellRoyalty':
      return `
        <path d="M60 14 L60 18" stroke="#fff" stroke-width="1.5" opacity="0.7"/>
        <circle cx="60" cy="14" r="2" fill="#fff" opacity="0.8"/>
        <path d="M42 44 Q42 24 60 20 Q78 24 78 44 L80 48 L40 48 Z" fill="#0b1220" opacity="0.5"/>
        <path d="M42 44 Q42 24 60 20 Q78 24 78 44 L80 48 L40 48 Z" fill="none" stroke="#fff" stroke-width="1.8" opacity="0.75" filter="url(#${id}-glow)"/>
        <ellipse cx="60" cy="48" rx="22" ry="3" fill="#fff" opacity="0.3"/>
        <path d="M54 48 Q56 54 60 54 Q64 54 66 48" fill="#fff" opacity="0.5"/>
        <rect x="44" y="58" width="32" height="4" rx="2" fill="#0b1220" opacity="0.4"/>`;
    case 'deskSovereign':
      return `
        <path d="M36 46 L40 26 L48 36 L54 22 L60 16 L66 22 L72 36 L80 26 L84 46 Z" fill="#0b1220" opacity="0.5"/>
        <path d="M36 46 L40 26 L48 36 L54 22 L60 16 L66 22 L72 36 L80 26 L84 46 Z" fill="none" stroke="#fff" stroke-width="2" opacity="0.85" filter="url(#${id}-glow)"/>
        <circle cx="40" cy="26" r="2.5" fill="#fff" opacity="0.8"/>
        <circle cx="60" cy="16" r="3" fill="#fff" opacity="0.95" filter="url(#${id}-glow)"/>
        <circle cx="80" cy="26" r="2.5" fill="#fff" opacity="0.8"/>
        <rect x="34" y="46" width="52" height="6" rx="2" fill="#0b1220" opacity="0.4"/>
        <rect x="34" y="46" width="52" height="6" rx="2" fill="none" stroke="#fff" stroke-width="1.2" opacity="0.6"/>
        <rect x="38" y="54" width="44" height="5" rx="2" fill="#0b1220" opacity="0.35"/>`;
    default: {
      const mark = escapeHtml(ITEM_GLYPH[item.id] || '◆');
      return `
        <path d="M60 14 L84 34 L60 62 L36 34 Z" fill="#0b1220" opacity="0.45"/>
        <path d="M60 14 L84 34 L60 62 L36 34 Z" fill="none" stroke="#fff" stroke-width="1.8" opacity="0.75" filter="url(#${id}-glow)"/>
        <path d="M42 34 h36 M60 14 L48 34 M60 14 L72 34 M48 34 L60 62 M72 34 L60 62" stroke="#fff" stroke-width="0.7" opacity="0.35"/>
        <text x="60" y="38" text-anchor="middle" font-size="10" fill="#fff" opacity="0.8">${mark}</text>`;
    }
  }
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

function categoryFilterRow(ownedCount, totalCount, spentTotal, bookValue) {
  const pills = ['all', ...VAULT_CATEGORIES].map((cat) => {
    const label = cat === 'all' ? 'All' : (VAULT_CATEGORY_LABELS[cat] || cat);
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
  const rep = state.meta?.reputation || 0;
  const cash = state.portfolio?.cash || 0;
  const ownedIds = Array.isArray(state.vaultOwned) ? state.vaultOwned : [];
  const ownedSet = new Set(ownedIds);
  const spentTotal = Math.max(0, Number(state.vaultSpentTotal) || 0);
  const bookValue = getVaultBookValue(state);
  const profile = getProfile();
  const cosmetics = profile?.cosmetics || {};
  const aura = getVaultDeskAura({ cosmetics, vaultOwned: ownedIds, perks: state.perks });
  const auraUsed = Math.max(0, Math.floor(Number(state.meta?.vaultAuraRepToday) || 0));
  const equippedSummary = [
    { slot: 'dashboard', label: 'Dashboard' },
    { slot: 'background', label: 'Background' },
    { slot: 'badge', label: 'Badge' },
    { slot: 'title', label: 'Title' },
  ].map((entry) => ({
    ...entry,
    item: getVaultItem(cosmetics[entry.slot]),
  }));

  const allItems = Object.values(VAULT_ITEMS).slice().sort((a, b) => {
    // Starter no-REP pieces first so Day-1 desks see a path, not a wall of locks.
    const aStarter = (a.repRequired || 0) === 0 ? 0 : 1;
    const bStarter = (b.repRequired || 0) === 0 ? 0 : 1;
    if (aStarter !== bStarter) return aStarter - bStarter;
    const repDiff = (a.repRequired || 0) - (b.repRequired || 0);
    if (repDiff !== 0) return repDiff;
    return (a.cost || 0) - (b.cost || 0);
  });
  const shownItems = allItems.filter((item) => {
    if (activeVaultFilter === 'all') return true;
    return item.category === activeVaultFilter;
  });

  const canBuyAny = shownItems.some((item) => {
    if (ownedSet.has(item.id)) return false;
    return canPurchaseVaultItem(item, { cash, vaultOwned: ownedIds, reputation: rep }).ok;
  });
  const starterItems = allItems.filter((item) => (item.repRequired || 0) === 0);
  const roadmapHtml = (!canBuyAny && ownedSet.size === 0)
    ? `<div class="vault-roadmap" role="note">
        <strong>Build toward your first piece</strong>
        <p>Starter vault items need cash, not REP —
          ${starterItems.map((i) => `${escapeHtml(i.name)} (${fmt(i.cost)})`).join(' · ') || 'check the grid below'}.
          Trade on the desk, then come back to book them into Net Worth.</p>
      </div>`
    : '';

  root.innerHTML = `
    <div class="vault-shell">
      <header class="vault-hero">
        <div>
          <p class="vault-eyebrow">Collectible desk wealth</p>
          <h2>Trophy Vault</h2>
          <p class="vault-sub">Buy pieces that appraise into Net Worth. Equip them to activate Desk Prestige — capped reputation on profitable closes.</p>
        </div>
        <div class="vault-hero-side">
          <div class="vault-cash-pill">Cash ${fmt(cash)}</div>
          <div class="vault-book-pill">Vault book ${fmt(bookValue)}</div>
        </div>
      </header>
      ${roadmapHtml}
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
      ${categoryFilterRow(ownedSet.size, allItems.length, spentTotal, bookValue)}
      <div class="vault-grid">
        ${shownItems.map((item) => {
          const owned = ownedSet.has(item.id);
          const gate = canPurchaseVaultItem(item, {
            cash,
            vaultOwned: ownedIds,
            reputation: rep,
          });
          const slot = getVaultSlotForItem(item);
          const equipped = !!slot && cosmetics?.[slot] === item.id;
          const canEquip = owned && slot && !equipped;
          const buyDisabled = !gate.ok ? 'disabled' : '';
          const repText = item.repRequired ? `${item.repRequired} REP` : 'No REP gate';
          return `
            <article class="vault-card ${owned ? 'owned' : ''} ${equipped ? 'equipped' : ''}">
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
                <span class="vault-chip">${escapeHtml(repText)}</span>
                <span class="vault-chip">${fmt(item.cost)}</span>
                <span class="vault-chip">Appraisal ${fmt(item.cost)}</span>
              </div>
              <div class="vault-actions">
                ${owned
                  ? `<button type="button" class="btn ${canEquip ? 'btn-accent' : ''} vault-equip-btn" data-vault-equip="${item.id}" ${canEquip ? '' : 'disabled'}>${equipped ? 'Equipped' : 'Equip'}</button>`
                  : `<button type="button" class="btn btn-accent vault-buy-btn" data-vault-buy="${item.id}" ${buyDisabled}>Buy</button>`
                }
                <span class="vault-hint">${owned
                  ? (equipped ? 'Active prestige slot + booked into Net Worth.' : 'Owned — equip to feed Desk Prestige.')
                  : escapeHtml(gate.ok ? 'Purchases book into Net Worth immediately.' : gate.reason)}</span>
              </div>
            </article>
          `;
        }).join('')}
      </div>
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
  root.querySelectorAll('[data-vault-equip]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const itemId = btn.getAttribute('data-vault-equip');
      if (itemId) state.onEquipVaultItem?.(itemId);
    });
  });
}
