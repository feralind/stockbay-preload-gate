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
import { escapeAttr, escapeHtml, fmt } from './shared.js';

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

const VAULT_PRESENTATION = {
  goldTerminal: {
    visual: 'astrolabe',
    provenance: 'Planispheric brass astrolabe in the Islamic scientific tradition.',
    period: '17th-18th c.',
    medium: 'Engraved brass',
  },
  tungstenDial: {
    visual: 'watch',
    provenance: 'Weathered gnomon fragment with late Renaissance dial markings.',
    period: 'c. 1600',
    medium: 'Patinated bronze',
  },
  obsidianTicker: {
    visual: 'mirror',
    provenance: 'Polished obsidian mirror inspired by Mesoamerican court objects.',
    period: 'Pre-Columbian',
    medium: 'Obsidian',
  },
  yachtBackground: {
    visual: 'seascape',
    provenance: 'Small marine oil study in the manner of 19th-century coastal ateliers.',
    period: 'c. 1880',
    medium: 'Oil on panel',
  },
  penthouseNight: {
    visual: 'nocturne',
    provenance: 'Tonal nocturne study, restrained palette, private gallery scale.',
    period: 'c. 1910',
    medium: 'Oil on canvas',
  },
  bullMarble: {
    visual: 'bronze',
    provenance: 'Market bull sculpture with a dark bronze body and marble plinth.',
    period: '20th c.',
    medium: 'Bronze + marble',
  },
  crashDayTape: {
    visual: 'ticker',
    provenance: 'Archived Wall Street ticker tape from the 1929 market break.',
    period: '1929',
    medium: 'Paper artifact',
  },
  apexBadge: {
    visual: 'signet',
    provenance: 'Gold signet ring with an unidentified European house crest.',
    period: '19th c.',
    medium: 'Gold signet',
  },
  halcyonPin: {
    visual: 'coin',
    provenance: 'Byzantine gold solidus reference with imperial obverse styling.',
    period: '6th-7th c.',
    medium: 'Gold coin',
  },
  floorLegendTitle: {
    visual: 'seal',
    provenance: 'Collector society seal marking early provenance recognition.',
    period: 'Modern',
    medium: 'Vellum + wax',
  },
  volatilityWhisperer: {
    visual: 'certificate',
    provenance: 'Authentication dossier with auction-house verification marks.',
    period: 'Modern',
    medium: 'Archival paper',
  },
  closingBellRoyalty: {
    visual: 'laurel',
    provenance: 'Honorary curator laurel, cast for a private museum board.',
    period: 'Modern',
    medium: 'Gilt bronze',
  },
  bronzeBullBust: {
    visual: 'bronze',
    provenance: 'Small antiquity-style bronze animal figurine on a museum plinth.',
    period: 'Bronze Age style',
    medium: 'Bronze',
  },
  glassTickerWall: {
    visual: 'vase',
    provenance: 'Murano-inspired cabinet vessel with blue glass cane work.',
    period: '20th c.',
    medium: 'Blown glass',
  },
  auroraDeck: {
    visual: 'colorfield',
    provenance: 'Abstract color-field study with restrained aurora bands.',
    period: 'Post-war',
    medium: 'Oil on canvas',
  },
  deskSovereign: {
    visual: 'diadem',
    provenance: 'Master collector insignia with a crown-jewel display language.',
    period: 'Modern',
    medium: 'Gold + enamel',
  },
  imperialTriptych: {
    visual: 'triptych',
    provenance: 'Attributed devotional panel triptych with imperial workshop cues.',
    period: '15th-16th c.',
    medium: 'Tempera panel',
  },
  augustusLaurel: {
    visual: 'laurel',
    provenance: 'Roman imperial laurel wreath reference, restrained archaeological mount.',
    period: '1st c. style',
    medium: 'Bronze',
  },
  gutenbergFolio: {
    visual: 'folio',
    provenance: 'Incunable folio leaf inspired by early Gutenberg Bible typography.',
    period: 'c. 1450s',
    medium: 'Vellum leaf',
  },
  rothkoField: {
    visual: 'colorfield',
    provenance: 'Large color-field composition referencing post-war American abstraction.',
    period: '1950s style',
    medium: 'Oil on canvas',
  },
  diademProvenance: {
    visual: 'diadem',
    provenance: 'Documented lineage diadem with formal crown-jewel presentation.',
    period: 'Belle Epoque style',
    medium: 'Platinum + stones',
  },
  vermeerAttribution: {
    visual: 'interior',
    provenance: 'Dutch Golden Age interior with disputed Vermeer-circle attribution.',
    period: 'c. 1660',
    medium: 'Oil on canvas',
  },
  fabergeImperial: {
    visual: 'egg',
    provenance: 'Imperial Faberge workshop Easter egg with guilloche enamel language.',
    period: 'c. 1900',
    medium: 'Gold + enamel',
  },
};

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

function presentationForItem(item) {
  return VAULT_PRESENTATION[item?.id] || {
    visual: VAULT_MOTIF_BY_ID[item?.id] || 'relic',
    provenance: item?.desc || 'Registered collectible with verified appraisal notes.',
    period: 'Catalogued',
    medium: VAULT_CATEGORY_LABELS[item?.category] || 'Collectible',
  };
}

function artifactSvg(visual, id) {
  switch (visual) {
    case 'egg':
      return `
        <ellipse cx="60" cy="122" rx="31" ry="8" fill="#05070b" opacity="0.7"/>
        <path d="M36 76 C36 42 48 24 60 24 C72 24 84 42 84 76 C84 105 72 119 60 119 C48 119 36 105 36 76Z" fill="url(#${id}-gold)" stroke="#f4d889" stroke-width="1.4"/>
        <path d="M43 66 C52 56 68 56 77 66 M43 84 C52 94 68 94 77 84" fill="none" stroke="#172136" stroke-width="4" opacity="0.8"/>
        <path d="M48 43 C56 52 64 52 72 43 M48 106 C56 96 64 96 72 106" fill="none" stroke="#e8c46e" stroke-width="2"/>
        <circle cx="60" cy="37" r="5" fill="#2f69bf" stroke="#f8e6a5" stroke-width="1.2"/>
        <circle cx="48" cy="76" r="4" fill="#2f69bf" stroke="#f8e6a5" stroke-width="1"/>
        <circle cx="72" cy="76" r="4" fill="#2f69bf" stroke="#f8e6a5" stroke-width="1"/>
        <rect x="45" y="118" width="30" height="5" rx="2" fill="#9b7132"/>`;
    case 'astrolabe':
      return `
        <ellipse cx="60" cy="121" rx="34" ry="7" fill="#05070b" opacity="0.65"/>
        <circle cx="60" cy="70" r="37" fill="url(#${id}-brass)" stroke="#e6c372" stroke-width="2"/>
        <circle cx="60" cy="70" r="27" fill="none" stroke="#5f431d" stroke-width="1.4"/>
        <circle cx="60" cy="70" r="14" fill="none" stroke="#f3db96" stroke-width="1"/>
        <path d="M60 33 v74 M23 70 h74 M34 44 L86 96 M86 44 L34 96" stroke="#5d421f" stroke-width="1.2" opacity="0.8"/>
        <path d="M40 88 Q58 34 82 55 Q57 72 78 97" fill="none" stroke="#fff0b8" stroke-width="2" opacity="0.9"/>
        <circle cx="60" cy="70" r="3" fill="#40290d"/>
        <path d="M54 31 Q60 19 66 31" fill="none" stroke="#e6c372" stroke-width="3"/>`;
    case 'watch':
      return `
        <ellipse cx="60" cy="121" rx="33" ry="7" fill="#05070b" opacity="0.65"/>
        <circle cx="60" cy="72" r="36" fill="#efe7d4" stroke="#bf9852" stroke-width="3"/>
        <circle cx="60" cy="72" r="29" fill="none" stroke="#2a2f38" stroke-width="1"/>
        <path d="M60 46 v7 M60 91 v7 M34 72 h7 M79 72 h7" stroke="#121821" stroke-width="1.5"/>
        <path d="M60 72 L60 53 M60 72 L75 79" stroke="#111827" stroke-width="2.4" stroke-linecap="round"/>
        <circle cx="60" cy="72" r="3" fill="#111827"/>
        <path d="M51 33 Q60 20 69 33" fill="none" stroke="#bf9852" stroke-width="4"/>`;
    case 'vase':
      return `
        <ellipse cx="60" cy="121" rx="34" ry="8" fill="#05070b" opacity="0.65"/>
        <path d="M45 35 Q60 47 75 35 L71 51 Q86 70 72 112 Q60 119 48 112 Q34 70 49 51Z" fill="#f3f7f2" stroke="#d8e0dc" stroke-width="1.6"/>
        <path d="M47 39 Q60 47 73 39" fill="none" stroke="#2b5caa" stroke-width="2"/>
        <path d="M45 64 C55 54 66 54 75 65 M43 82 C54 72 66 72 77 83" fill="none" stroke="#2b5caa" stroke-width="1.6"/>
        <path d="M55 58 C49 68 53 76 60 82 C67 76 71 68 65 58 C62 65 58 65 55 58Z" fill="#2b5caa" opacity="0.75"/>
        <path d="M52 96 C58 91 64 91 70 96" fill="none" stroke="#2b5caa" stroke-width="1.6"/>`;
    case 'bronze':
      return `
        <ellipse cx="60" cy="122" rx="38" ry="7" fill="#05070b" opacity="0.7"/>
        <rect x="31" y="108" width="58" height="9" rx="2" fill="#4b3524"/>
        <path d="M38 83 Q47 61 67 70 Q76 57 86 66 Q78 72 76 84 Q84 86 90 94 Q79 94 72 90 Q63 104 46 98 Q38 96 34 90 Q39 89 42 86Z" fill="#8a6338" stroke="#c29452" stroke-width="1.5"/>
        <path d="M70 69 Q76 49 90 48" fill="none" stroke="#c29452" stroke-width="2" stroke-linecap="round"/>
        <path d="M46 98 v12 M68 96 v14" stroke="#4b3524" stroke-width="5" stroke-linecap="round"/>`;
    case 'ticker':
      return `
        <ellipse cx="60" cy="121" rx="38" ry="7" fill="#05070b" opacity="0.65"/>
        <rect x="21" y="44" width="78" height="53" rx="4" fill="#ded0b0" stroke="#a8864a" stroke-width="1.5"/>
        <path d="M29 56 h62 M29 69 h62 M29 82 h62" stroke="#7a6750" stroke-width="1"/>
        <text x="32" y="65" fill="#2a241f" font-size="8" font-family="serif">NYSE 1929</text>
        <path d="M32 84 C45 74 54 91 67 80 S83 83 91 73" fill="none" stroke="#4c5f75" stroke-width="1.8"/>
        <rect x="27" y="101" width="66" height="5" rx="2" fill="#6a4b2c"/>`;
    case 'signet':
    case 'coin':
      return `
        <ellipse cx="60" cy="121" rx="32" ry="7" fill="#05070b" opacity="0.65"/>
        <circle cx="60" cy="72" r="34" fill="url(#${id}-gold)" stroke="#f0d48b" stroke-width="1.8"/>
        <circle cx="60" cy="72" r="25" fill="none" stroke="#6f4f1d" stroke-width="1.5"/>
        <path d="M60 49 L66 66 L84 66 L69 76 L74 94 L60 83 L46 94 L51 76 L36 66 L54 66Z" fill="#7f5a21" opacity="0.7"/>
        <path d="M47 53 Q60 43 73 53" fill="none" stroke="#fff0b8" stroke-width="1.2"/>`;
    case 'folio':
      return `
        <ellipse cx="60" cy="121" rx="38" ry="7" fill="#05070b" opacity="0.65"/>
        <path d="M24 47 Q43 37 60 50 V104 Q43 94 24 102Z" fill="#ded0aa" stroke="#9d7b47" stroke-width="1.2"/>
        <path d="M96 47 Q77 37 60 50 V104 Q77 94 96 102Z" fill="#e9ddb9" stroke="#9d7b47" stroke-width="1.2"/>
        <path d="M34 58 h16 M34 66 h18 M34 74 h14 M70 58 h16 M70 66 h18 M70 74 h14 M70 84 h16" stroke="#4f3d2b" stroke-width="1"/>
        <text x="31" y="91" fill="#4f3d2b" font-size="13" font-family="serif">G</text>`;
    case 'triptych':
      return `
        <ellipse cx="60" cy="122" rx="39" ry="7" fill="#05070b" opacity="0.65"/>
        <rect x="19" y="43" width="25" height="57" rx="2" fill="#25140c" stroke="#b9833f" stroke-width="2"/>
        <rect x="47" y="35" width="26" height="65" rx="2" fill="#2a170d" stroke="#d3a153" stroke-width="2"/>
        <rect x="76" y="43" width="25" height="57" rx="2" fill="#25140c" stroke="#b9833f" stroke-width="2"/>
        <path d="M57 58 Q60 47 63 58 v22 h-6Z" fill="#d7b463"/>
        <circle cx="60" cy="55" r="6" fill="#c39345"/>
        <path d="M27 66 h10 M83 66 h10 M25 82 h14 M81 82 h14" stroke="#dfc078" stroke-width="1.4"/>`;
    case 'interior':
      return `
        <ellipse cx="60" cy="122" rx="39" ry="7" fill="#05070b" opacity="0.65"/>
        <rect x="22" y="37" width="76" height="62" rx="2" fill="#1e2630" stroke="#9c6d3e" stroke-width="3"/>
        <rect x="32" y="47" width="23" height="34" fill="#b38b5f" opacity="0.7"/>
        <path d="M62 50 h22 v39 H62Z" fill="#111827"/>
        <path d="M66 57 h14 M66 66 h14 M66 75 h14" stroke="#d9c49d" stroke-width="1"/>
        <path d="M36 83 h49" stroke="#7c5531" stroke-width="6"/>
        <circle cx="45" cy="67" r="8" fill="#d8c6a1" opacity="0.8"/>`;
    case 'diadem':
    case 'laurel':
      return `
        <ellipse cx="60" cy="121" rx="34" ry="7" fill="#05070b" opacity="0.65"/>
        <path d="M30 83 Q60 35 90 83" fill="none" stroke="#d8ba69" stroke-width="5" stroke-linecap="round"/>
        <path d="M38 76 l-10 -6 M45 66 l-10 -8 M53 57 l-7 -10 M67 57 l7 -10 M75 66 l10 -8 M82 76 l10 -6" stroke="#f1d98c" stroke-width="3" stroke-linecap="round"/>
        <circle cx="60" cy="48" r="7" fill="#e6c46f" stroke="#fff0b8" stroke-width="1"/>
        <circle cx="47" cy="66" r="4" fill="#394f7c"/>
        <circle cx="73" cy="66" r="4" fill="#394f7c"/>`;
    case 'seal':
    case 'certificate':
      return `
        <ellipse cx="60" cy="121" rx="35" ry="7" fill="#05070b" opacity="0.65"/>
        <rect x="31" y="39" width="58" height="67" rx="4" fill="#dfd4bd" stroke="#9b8052" stroke-width="1.5"/>
        <path d="M42 55 h36 M42 65 h36 M42 75 h24" stroke="#4a3b2a" stroke-width="1"/>
        <circle cx="72" cy="88" r="11" fill="#8b1e2d"/>
        <path d="M66 88 h12 M72 82 v12" stroke="#e6c27b" stroke-width="1.4"/>`;
    case 'mirror':
      return `
        <ellipse cx="60" cy="121" rx="33" ry="7" fill="#05070b" opacity="0.65"/>
        <ellipse cx="60" cy="71" rx="31" ry="39" fill="#070b11" stroke="#39445c" stroke-width="3"/>
        <ellipse cx="60" cy="71" rx="21" ry="29" fill="#111827" stroke="#111827"/>
        <path d="M44 54 Q61 44 77 55 M44 82 Q61 94 77 82" fill="none" stroke="#64748b" stroke-width="1.2" opacity="0.6"/>
        <rect x="50" y="108" width="20" height="8" rx="2" fill="#273244"/>`;
    case 'seascape':
    case 'nocturne':
    case 'colorfield':
    default:
      return `
        <ellipse cx="60" cy="122" rx="39" ry="7" fill="#05070b" opacity="0.65"/>
        <rect x="20" y="38" width="80" height="57" rx="2" fill="#111827" stroke="#a0794a" stroke-width="3"/>
        <rect x="27" y="45" width="66" height="43" fill="url(#${id}-canvas)"/>
        <path d="M30 72 C41 58 49 76 59 64 S77 56 91 69" fill="none" stroke="#e9d9b5" stroke-width="1.8" opacity="0.55"/>
        <path d="M29 78 C45 82 64 75 92 82" fill="none" stroke="#5d8ca0" stroke-width="2" opacity="0.55"/>`;
  }
}

/** Local relic photos — black-backed museum plates that fill `.vault-art` edge-to-edge. */
const VAULT_ITEM_IMAGES = {
  // Masterworks / crown
  imperialTriptych: 'assets/vault/imperial-triptych.png',
  gutenbergFolio: 'assets/vault/gutenberg-folio.png',
  diademProvenance: 'assets/vault/diadem-provenance.png',
  augustusLaurel: 'assets/vault/augustus-laurel.png',
  rothkoField: 'assets/vault/rothko-field.png',
  vermeerAttribution: 'assets/vault/vermeer-attribution.png',
  fabergeImperial: 'assets/vault/faberge-imperial.png',
  theSeat: 'assets/vault/the-seat.png',
  // Desk collection
  goldTerminal: 'assets/vault/gilded-astrolabe.png',
  tungstenDial: 'assets/vault/sundial-fragment.png',
  obsidianTicker: 'assets/vault/obsidian-mirror.png',
  yachtBackground: 'assets/vault/study-of-the-tide.png',
  penthouseNight: 'assets/vault/nocturne-no-7.png',
  bullMarble: 'assets/vault/gilded-bull.png',
  auroraDeck: 'assets/vault/aurora-study.png',
  bronzeBullBust: 'assets/vault/bronze-figurine.png',
  apexBadge: 'assets/vault/signet-ring.png',
  halcyonPin: 'assets/vault/byzantine-gold-coin.png',
  floorLegendTitle: 'assets/vault/recognized-collector-seal.png',
  volatilityWhisperer: 'assets/vault/provenance-verified.png',
  closingBellRoyalty: 'assets/vault/honorary-curator.png',
  glassTickerWall: 'assets/vault/murano-glass-cabinet.png',
  deskSovereign: 'assets/vault/master-collector.png',
};

function artFoil(item, variant = '') {
  const id = gid(item, 'museum', variant);
  const presentation = presentationForItem(item);
  return `
    <svg class="vault-art-svg vault-art-svg--museum" viewBox="0 0 120 132" aria-hidden="true">
      <defs>
        <radialGradient id="${id}-stage" cx="50%" cy="35%" r="62%">
          <stop offset="0%" stop-color="#6b5a3a" stop-opacity="0.52"/>
          <stop offset="45%" stop-color="#182033" stop-opacity="0.82"/>
          <stop offset="100%" stop-color="#06080d"/>
        </radialGradient>
        <linearGradient id="${id}-gold" x1="24%" y1="8%" x2="86%" y2="96%">
          <stop offset="0%" stop-color="#fff1b8"/>
          <stop offset="42%" stop-color="#c7973a"/>
          <stop offset="100%" stop-color="#6e4718"/>
        </linearGradient>
        <linearGradient id="${id}-brass" x1="18%" y1="12%" x2="86%" y2="96%">
          <stop offset="0%" stop-color="#f4dda0"/>
          <stop offset="55%" stop-color="#b78737"/>
          <stop offset="100%" stop-color="#5f3a14"/>
        </linearGradient>
        <linearGradient id="${id}-canvas" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#233047"/>
          <stop offset="45%" stop-color="#5b4631"/>
          <stop offset="100%" stop-color="#111827"/>
        </linearGradient>
      </defs>
      <rect width="120" height="132" fill="#05070b"/>
      <rect x="0" y="0" width="120" height="132" fill="url(#${id}-stage)"/>
      <path d="M20 118 C38 107 82 107 100 118 L100 132 L20 132Z" fill="#0b0f17" opacity="0.88"/>
      ${artifactSvg(presentation.visual, id)}
    </svg>`;
}

function artPhoto(item) {
  const src = VAULT_ITEM_IMAGES[item?.id];
  if (!src) return '';
  return `
    <img
      class="vault-art-photo"
      src="${escapeAttr(src)}"
      alt=""
      loading="lazy"
      decoding="async"
      draggable="false"
    />
    <span class="vault-art-vignette" aria-hidden="true"></span>`;
}

function vaultItemArtHtml(item, variant = '') {
  return artPhoto(item) || artFoil(item, variant);
}

/** Shared plate art for Vault + Collection Log cards (unique photos when present, else foil). */
export function renderVaultFoilArt(item, variant = '') {
  if (!item?.id) return '';
  return vaultItemArtHtml(item, variant);
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
  const presentation = presentationForItem(item);
  return `
    <article class="vault-card${rarityClass(item)} ${owned ? 'owned' : ''} ${equipped ? 'equipped' : ''} ${pledged ? 'pledged' : ''}">
      <div class="vault-art ${owned ? 'owned' : 'locked'} ${equipped ? 'lit' : ''}" aria-hidden="true">
        ${vaultItemArtHtml(item, `card-${item.id}`)}
        <span>${escapeHtml(presentation.medium)}</span>
      </div>
      <div class="vault-card-top">
        <div>
          <h3>${escapeHtml(item.name)}</h3>
          <p class="vault-provenance">${escapeHtml(presentation.provenance)}</p>
        </div>
        ${cardStatusHtml({ owned, equipped, gate })}
      </div>
      <div class="vault-meta">
        <span class="vault-chip">${escapeHtml(VAULT_CATEGORY_LABELS[item.category] || item.category)}</span>
        ${rarityLabel ? `<span class="vault-chip">${escapeHtml(rarityLabel)}</span>` : ''}
        <span class="vault-chip">${escapeHtml(presentation.period)}</span>
        <span class="vault-chip">${escapeHtml(repText)}</span>
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
            ? 'Backing an active loan - pay it off to unpledge.'
            : pledged
              ? 'Pledged: raises Financing borrowing ceiling (50% LTV). Late default can repossess.'
              : (equipped ? 'Active prestige slot + booked into Net Worth.' : 'Owned: equip for Desk Prestige or pledge as collateral.'))
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
    const presentation = presentationForItem(item);
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
        <div class="vault-art ${owned ? 'owned' : 'locked'} ${equipped ? 'lit' : ''}" aria-hidden="true">
          ${vaultItemArtHtml(item, `salon-${item.id}`)}
          <span>${escapeHtml(presentation.medium)}</span>
        </div>
        <div class="vault-card-top">
          <div>
            <h3>${escapeHtml(item.name)}</h3>
            <p class="vault-provenance">${escapeHtml(presentation.provenance)}</p>
          </div>
          <span class="vault-status ${owned ? 'owned' : (gate.ok ? 'buy' : 'locked')}">${owned ? 'Owned' : (gate.ok ? 'Active window' : escapeHtml(gate.reason || 'Locked'))}</span>
        </div>
        <div class="vault-meta">
          <span class="vault-chip">Crown</span>
          <span class="vault-chip">${escapeHtml(presentation.period)}</span>
          <span class="vault-chip">${item.repRequired} REP</span>
          <span class="vault-chip">Appraisal ${fmt(item.cost)}</span>
          ${prestigeBonusChip(item)}
          <span class="vault-chip">${daysLeft}d left</span>
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
          <p class="vault-eyebrow">Ultra-rare / Private Salon</p>
          <h3>Private Salon</h3>
          <p class="vault-sub">Crown jewels ($2.5M-$5M) surface in scarce ${SALON_LISTING_TTL_DAYS}-day windows. Acquire to book ownership, Net Worth, and collateral.</p>
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
      <div>
        <p class="vault-eyebrow">Collection Floor</p>
        <h3>Browse the Vault</h3>
      </div>
      <div class="vault-kpis">
        <div class="vault-kpi"><span>Owned</span><strong>${ownedCount} / ${totalCount}</strong></div>
        <div class="vault-kpi"><span>Spent</span><strong>${fmt(spentTotal)}</strong></div>
        <div class="vault-kpi"><span>Book</span><strong>${fmt(bookValue)}</strong></div>
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
        <p>Starter vault items need cash, not REP -
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
    ? `<section class="vault-collection-section vault-collection-section--masterworks">
        <div class="vault-section-head">
          <div>
            <p class="vault-eyebrow">Masterworks</p>
            <h3>Gallery-Caliber Holdings</h3>
          </div>
          <span>$150K-$1.2M · always available once gates are met</span>
        </div>
        <div class="vault-grid vault-grid-masterworks">${shownMasterworks.map((item) => renderVaultCard(item, { ...cardCtx, pledgeLocked: pledgeLockedFor(item.id) })).join('')}</div>
      </section>`
    : '';
  const coreSection = shownCore.length
    ? `<section class="vault-collection-section">
        ${activeVaultFilter === 'all'
          ? `<div class="vault-section-head">
              <div>
                <p class="vault-eyebrow">Desk Collection</p>
                <h3>Collected Objects</h3>
              </div>
              <span>Core Trophy Vault</span>
            </div>`
          : ''}
        <div class="vault-grid">${shownCore.map((item) => renderVaultCard(item, { ...cardCtx, pledgeLocked: pledgeLockedFor(item.id) })).join('')}</div>
      </section>`
    : '';

  root.innerHTML = `
    <div class="vault-shell">
      <header class="vault-hero">
        <div>
          <p class="vault-eyebrow">Private collectible wealth</p>
          <h2>Trophy Vault</h2>
          <p class="vault-sub">A quiet collection of historically referenced objects for the trading desk. Buy pieces that appraise into Net Worth, equip them for Desk Prestige, or pledge owned works as 50% LTV collateral.</p>
        </div>
        <div class="vault-hero-stats">
          <div class="vault-hero-stat"><span>Cash</span><strong>${fmt(cash)}</strong></div>
          <div class="vault-hero-stat"><span>Vault Book</span><strong>${fmt(bookValue)}</strong></div>
          <div class="vault-hero-stat"><span>Pledged</span><strong>${fmt(pledgedValue)}</strong></div>
        </div>
      </header>
      ${roadmapHtml}
      ${flagshipHtml}
      <section class="vault-prestige-panel tier-${aura.tier}">
        <div class="vault-prestige-copy">
          <p class="vault-eyebrow">Prestige Summary</p>
          <div class="vault-prestige-main">
            <div>
              <h3>${escapeHtml(aura.label)}</h3>
              <p>${aura.equipped}/4 slots · ${escapeHtml(aura.summary)}</p>
            </div>
            <div class="vault-aura-meter">${aura.tier > 0 ? `${auraUsed}/${aura.dailyCap} REP today` : 'Equip to activate'}</div>
          </div>
        </div>
        <div class="vault-equipped-strip">
          ${equippedSummary.map((entry) => `
            <div class="vault-equipped-chip ${entry.item ? 'filled' : ''}">
              <span>${entry.label}</span>
              <strong>${escapeHtml(entry.item?.name || 'None')}</strong>
            </div>
          `).join('')}
        </div>
      </section>
      ${salonHtml}
      ${categoryFilterRow(ownedSet.size, allItems.length + PRIVATE_SALON_POOL.length, spentTotal, bookValue)}
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
