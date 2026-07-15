// @ts-check
import { PERKS, canPurchasePerk } from '../config.js';
import {
  LICENSES, LICENSE_ORDER, hasLicense, getHighestLicense, getNextLicense,
  licenseSnapshot, getLicenseRequirements, canTakeLicenseExam,
} from '../licenses.js';
import { getDayCount } from '../market.js';
import { getNetEquity } from '../portfolio.js';
import { getFirmDebt } from '../finance.js';
import { buildPerkInlineHtml, teardownPerkTooltips } from '../perk-tooltips.js';
import { fmt } from './shared.js';

/**
 * Compact institutional marks — stroke icons, tier frame via CSS.
 * Keys match PERKS[*].id (legacy id auraAmp = Vault Prestige).
 */
const PERK_MARK_SVG = {
  scanner: `
    <circle cx="12" cy="12" r="2.4"/>
    <circle cx="12" cy="12" r="6.2" opacity="0.55"/>
    <path d="M12 3.8v1.8M12 18.4v1.8M3.8 12h1.8M18.4 12h1.8"/>
    <path d="M12 12 16.8 7.2" opacity="0.9"/>`,
  hrDept: `
    <circle cx="9" cy="8.2" r="2.2"/>
    <circle cx="15.4" cy="8.6" r="1.85"/>
    <path d="M4.6 18.2c.35-2.9 2.2-4.5 4.4-4.5s4 1.6 4.35 4.5"/>
    <path d="M13.1 18.2c.2-2 1.3-3.3 2.7-3.3 1.45 0 2.55 1.35 2.8 3.3"/>`,
  newsWire: `
    <circle cx="7.5" cy="12" r="1.9" fill="currentColor" stroke="none"/>
    <path d="M11.2 8.4a5 5 0 0 1 0 7.2"/>
    <path d="M14.1 6.2a8 8 0 0 1 0 11.6" opacity="0.72"/>
    <path d="M16.9 4.2a10.6 10.6 0 0 1 0 15.6" opacity="0.4"/>`,
  analyst: `
    <path d="M4 18.5h16"/>
    <path d="M7 18.5V11.2"/>
    <path d="M12 18.5V7.5"/>
    <path d="M17 18.5V13"/>
    <path d="M5.5 9.2 12 4.8l6.5 4.4" opacity="0.85"/>`,
  margin: `
    <path d="M5 17.5h14"/>
    <rect x="6.2" y="10.5" width="3.2" height="7" rx="0.5" fill="currentColor" stroke="none" opacity="0.9"/>
    <rect x="10.4" y="7.2" width="3.2" height="10.3" rx="0.5" fill="currentColor" stroke="none"/>
    <rect x="14.6" y="12" width="3.2" height="5.5" rx="0.5" fill="currentColor" stroke="none" opacity="0.85"/>`,
  complianceSuite: `
    <path d="M12 3.6 18.8 6.8v7.8c0 3.6-2.5 6.2-6.8 7.6-4.3-1.4-6.8-4-6.8-7.6V6.8L12 3.6z"/>
    <path d="M9.2 12.6 11.1 14.6l3.9-4.5"/>`,
  tradingFloor: `
    <rect x="4.2" y="4.2" width="15.6" height="15.6" rx="1.4"/>
    <path d="M4.2 10h15.6M4.2 14.2h15.6M10 4.2v15.6M14.2 4.2v15.6" opacity="0.65"/>`,
  options: `
    <path d="M12 4.8v6"/>
    <path d="M12 10.8 6.8 18.2"/>
    <path d="M12 10.8l5.2 7.4"/>
    <circle cx="12" cy="10.8" r="1.45" fill="currentColor" stroke="none"/>
    <path d="M5.5 18.2h2.4M16.1 18.2h2.4" stroke-width="1.9"/>`,
  smartRouting: `
    <path d="M4.2 12h6"/>
    <path d="M13.8 12h6"/>
    <path d="M10.2 12 7.8 9M10.2 12 7.8 15"/>
    <path d="M13.8 12 16.2 9M13.8 12 16.2 15"/>
    <circle cx="12" cy="12" r="1.35" fill="currentColor" stroke="none"/>`,
  insider: `
    <circle cx="6.4" cy="12" r="1.9"/>
    <circle cx="17.6" cy="7.4" r="1.9"/>
    <circle cx="17.6" cy="16.6" r="1.9"/>
    <path d="M8.3 11.2 15.5 8.1M8.3 12.8l7.2 2.9"/>
    <path d="M17.6 9.4v5.2" opacity="0.5"/>`,
  aiAdvisor: `
    <circle cx="12" cy="12" r="2.15"/>
    <circle cx="5.6" cy="7.1" r="1.5"/>
    <circle cx="18.4" cy="7.1" r="1.5"/>
    <circle cx="5.6" cy="16.9" r="1.5"/>
    <circle cx="18.4" cy="16.9" r="1.5"/>
    <path d="M7 8.2 10.1 10.5M17 8.2 13.9 10.5M7 15.8l3.1-2.3M17 15.8l-3.1-2.3"/>`,
  auraAmp: `
    <path d="M12 4.2 13.5 9.4 19 10l-4.1 3.4 1.2 5.2L12 15.8 7.9 18.6 9.1 13.4 5 10l5.5-.6z"/>
    <circle cx="12" cy="12" r="2.1" opacity="0.35"/>`,
  hedgeFund: `
    <path d="M12 3.5 18.8 6.9v5c0 4-2.8 6.9-6.8 8.3-4-1.4-6.8-4.3-6.8-8.3v-5L12 3.5z"/>
    <path d="M9.4 12.8 11.2 14.7l3.7-4.3"/>`,
  primeBroker: `
    <rect x="4.2" y="7.2" width="15.6" height="11.2" rx="1.2"/>
    <path d="M4.2 11h15.6"/>
    <path d="M8 7.2V5.8h8v1.4"/>
    <path d="M8.8 15.2h2.2M13 15.2h2.2" stroke-width="1.9"/>`,
  legendDesk: `
    <path d="M12 3.6 14.1 9.1 20 9.7 15.6 13.4 17 19 12 16.1 7 19 8.4 13.4 4 9.7 9.9 9.1z"/>`,
};

function perkMarkSvg(perkId) {
  const body = PERK_MARK_SVG[perkId];
  if (!body) return null;
  return `<svg class="perk-mark-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

function perkMarkHtml(perk) {
  const svg = perkMarkSvg(perk?.id);
  const inner = svg || `<span class="perk-mark-letter">${(perk?.name || '?').slice(0, 1)}</span>`;
  return `<div class="perk-mark" aria-hidden="true">${inner}</div>`;
}

function statusForPerk(p, state, licenses) {
  const owned = state.perks.includes(p.id);
  const gate = canPurchasePerk(p, {
    cash: state.portfolio.cash,
    perks: state.perks,
    licenses,
  });
  const canBuy = gate.ok;
  const lockedLicense = !owned && !hasLicense(licenses, p.licenseRequired || 'retail');
  const lockedPrereq = !owned && !lockedLicense && gate.code === 'prereq';
  const lockedCash = !owned && gate.code === 'cash';
  let status = 'Locked';
  let statusCls = 'locked';
  if (owned) { status = 'Owned'; statusCls = 'owned'; }
  else if (canBuy) { status = 'Available'; statusCls = 'buy'; }
  else if (lockedLicense) { status = LICENSES[p.licenseRequired]?.short || 'License'; statusCls = 'rep'; }
  else if (lockedPrereq) { status = 'Prerequisite'; statusCls = 'prereq'; }
  else if (lockedCash) { status = 'Insufficient cash'; statusCls = 'cash'; }
  return { owned, canBuy, status, statusCls, gate };
}

/** Skip identical rebuilds — market ticks were wiping #perks-full scroll every frame. */
/** @type {Map<string, string>} */
const lastPerksRenderSig = new Map();

/**
 * Structure signature — met flags + coarse buckets only. Never raw NW/cash
 * per tick (Estates lesson: fine-grained values in the snap remount every tick).
 * @param {Record<string, ReturnType<typeof statusForPerk>>} statusById
 * @param {boolean} isFull
 * @param {{ ownedCount: number, licenseKey: string, cashBucket: number }} header
 */
function perksRenderSignature(statusById, isFull, header) {
  const board = Object.values(PERKS).map((p) => {
    const s = statusById[p.id];
    return `${p.id}:${s.owned ? 1 : 0}:${s.canBuy ? 1 : 0}:${s.statusCls}:${s.status}`;
  }).join('|');
  if (!isFull) return `shop-v3|${board}|${header.licenseKey}`;
  return [
    'full-v3',
    board,
    header.licenseKey,
    header.ownedCount,
    header.cashBucket,
  ].join('|');
}

/** Requirement checklist rows for a license chapter card. */
function licenseReqListHtml(licId, snap) {
  const rows = getLicenseRequirements(licId, snap);
  if (!rows.length) return '';
  return `<ul class="license-req-list">${rows.map((r) => `
    <li class="license-req ${r.met ? 'met' : 'unmet'}">
      <span class="license-req-dot" aria-hidden="true">${r.met ? '&#10003;' : '&#9675;'}</span>
      <span class="license-req-lbl">${r.label}</span>
    </li>`).join('')}</ul>`;
}

/** License chapter cards — the exam UI. */
function licenseBoardHtml(snap) {
  return LICENSE_ORDER.map((id) => {
    const lic = LICENSES[id];
    const owned = hasLicense(snap.licenses, id);
    const gate = owned ? null : canTakeLicenseExam(id, snap);
    const canSit = !!gate?.ok;
    const stateCls = owned ? 'is-held' : canSit ? 'is-ready' : 'is-locked';
    const statusLbl = owned ? 'Licensed' : canSit ? 'Exam available' : 'Not yet qualified';
    const feeLine = lic.fee > 0 ? `Exam fee ${fmt(lic.fee)}` : 'Granted on day 1';
    return `
      <article class="license-card ${stateCls}" data-license="${id}">
        <header class="license-card-head">
          <span class="license-card-tier">Tier ${lic.order + 1}</span>
          <h4 class="license-card-name">${lic.name}</h4>
          <span class="license-card-status ${stateCls}">${statusLbl}</span>
        </header>
        <p class="license-card-blurb">${lic.blurb}</p>
        <p class="license-card-unlocks"><strong>Unlocks:</strong> ${lic.unlocks}</p>
        <p class="license-card-teaches">${lic.teaches}</p>
        ${owned ? '' : licenseReqListHtml(id, snap)}
        <footer class="license-card-foot">
          <span class="license-card-fee">${owned ? 'Held' : feeLine}</span>
          ${canSit ? `<button type="button" class="btn btn-accent btn-sm license-exam-btn" data-license="${id}">Sit exam · ${fmt(lic.fee)}</button>` : ''}
        </footer>
      </article>`;
  }).join('');
}

/**
 * @param {HTMLElement} container
 * @param {() => void} rebuild
 */
function rebuildPreservingScroll(container, rebuild) {
  const top = container.scrollTop;
  const left = container.scrollLeft;
  rebuild();
  container.scrollTop = top;
  container.scrollLeft = left;
}

const TIER_ACCENTS = {
  1: '#8b9cb3',
  2: 'var(--blue)',
  3: 'var(--accent)',
  4: '#d4a017',
};

export function renderPerks(state, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const licenses = Array.isArray(state.licenses) ? state.licenses : ['retail'];
  const ownedCount = state.perks?.length || 0;
  const isFull = containerId === 'perks-full';
  const cash = state.portfolio.cash;

  const debt = getFirmDebt(state.finance, state.estateCreditUsed);
  const snap = licenseSnapshot(state, {
    netWorth: getNetEquity(state.portfolio, debt),
    day: getDayCount(),
  });
  const held = getHighestLicense(licenses);
  const next = getNextLicense(licenses);

  const tiers = {};
  Object.values(PERKS).forEach((p) => {
    const t = p.tier || 1;
    if (!tiers[t]) tiers[t] = [];
    tiers[t].push(p);
  });

  const statusById = {};
  Object.values(PERKS).forEach((p) => {
    statusById[p.id] = statusForPerk(p, state, licenses);
  });

  // Coarse buckets so live cash/NW/credit drift can't remount the board every tick.
  const reqFlags = LICENSE_ORDER.map((id) => {
    if (hasLicense(licenses, id)) return `${id}:held`;
    return `${id}:${getLicenseRequirements(id, snap).map((r) => (r.met ? 1 : 0)).join('')}:${canTakeLicenseExam(id, snap).ok ? 1 : 0}`;
  }).join('|');
  const header = {
    ownedCount,
    licenseKey: `${held.id}|${reqFlags}|nw${Math.round(snap.netWorth / 5000)}|pc${Math.round(snap.personalCredit / 5)}|bc${Math.round(snap.businessCredit / 5)}|t${snap.tradesClosed}|g${snap.greenDays}|d${snap.day}`,
    cashBucket: Math.round(cash / 100),
  };
  const sig = perksRenderSignature(statusById, isFull, header);
  const hasDom = !!container.querySelector(isFull ? '.perks-view' : '.perk[data-perk]');
  if (hasDom && lastPerksRenderSig.get(containerId) === sig) {
    return;
  }

  const heroHtml = isFull ? `
    <div class="perks-hero">
      <div class="perks-hero-copy">
        <p class="perks-eyebrow">Institutional upgrades</p>
        <h3 class="perks-title">Licenses &amp; Desk Perks</h3>
        <p class="perks-sub">Progression works like a real trading career: qualify for a <strong>license</strong>, pay the exam fee, and its tier of perks opens up. Early Scanner and HR need no exam.</p>
      </div>
    </div>
    <div class="perks-summary">
      <div class="perks-summary-rank">
        <span class="perks-summary-lbl">Your license</span>
        <div class="perks-summary-rank-row">
          <span class="perks-summary-rank-val">${held.name}</span>
          <span class="perks-summary-rank-meta">${next ? `next: ${next.short}` : 'top accreditation held'}</span>
        </div>
      </div>
      <div class="perks-summary-stats">
        <div class="perks-stat">
          <span class="perks-stat-lbl">Owned</span>
          <span class="perks-stat-val">${ownedCount}<span class="perks-stat-of"> / ${Object.keys(PERKS).length}</span></span>
          <span class="perks-stat-hint">Permanent desk unlocks</span>
        </div>
        <div class="perks-stat">
          <span class="perks-stat-lbl">Cash</span>
          <span class="perks-stat-val">${fmt(cash)}</span>
          <span class="perks-stat-hint">Available to allocate</span>
        </div>
        <div class="perks-stat">
          <span class="perks-stat-lbl">Licenses</span>
          <span class="perks-stat-val">${licenses.length}<span class="perks-stat-of"> / ${LICENSE_ORDER.length}</span></span>
          <span class="perks-stat-hint">${held.blurb}</span>
        </div>
      </div>
    </div>
    <div class="license-board">${licenseBoardHtml(snap)}</div>` : '';

  const boardHtml = Object.keys(tiers).sort((a, b) => Number(a) - Number(b)).map((tierKey) => {
    const t = Number(tierKey);
    const tierPerks = tiers[tierKey];
    const licId = tierPerks[0]?.licenseRequired || 'retail';
    const lic = LICENSES[licId] || LICENSES.retail;
    const unlocked = hasLicense(licenses, licId);
    const rows = tierPerks.map((p) => {
      const { owned, canBuy, status, statusCls } = statusById[p.id];
      const licShort = p.licenseRequired && p.licenseRequired !== 'retail'
        ? LICENSES[p.licenseRequired]?.short
        : null;
      const costLine = owned
        ? 'OWNED'
        : `${fmt(p.cost)}${licShort ? ` · ${licShort}` : ''}`;

      return `
        <div class="perk perk-t${t} ${owned ? 'owned' : ''} ${canBuy ? 'available' : ''} ${!owned && !canBuy ? 'is-locked' : ''}"
             data-perk="${p.id}" role="${canBuy ? 'button' : 'group'}" ${canBuy ? 'tabindex="0"' : ''}>
          ${perkMarkHtml(p)}
          <div class="perk-body">
            <div class="perk-name-row">
              <div class="perk-name">${p.name}</div>
              <span class="perk-status ${statusCls}">${status}</span>
            </div>
            <div class="perk-desc">${p.desc}</div>
            ${buildPerkInlineHtml(p.id)}
            <div class="perk-buy-row">
              <div class="perk-cost-group">
                <span class="perk-cost-lbl">${owned ? 'Status' : 'Cost'}</span>
                <span class="perk-cost">${costLine}</span>
              </div>
              ${canBuy ? '<button type="button" class="btn btn-accent btn-sm perk-buy-btn">Unlock</button>' : ''}
            </div>
          </div>
        </div>`;
    }).join('');

    return `
      <section class="perk-tier-band ${unlocked ? 'is-open' : 'is-dimmed'}" style="--tier-accent:${TIER_ACCENTS[t] || 'var(--muted)'}">
        <header class="perk-tier-head">
          <div class="perk-tier-head-id">
            <span class="perk-tier-badge">Tier ${t}</span>
            <h4 class="perk-tier-title">${lic.short}</h4>
          </div>
          <span class="perk-tier-req">${unlocked
            ? 'Unlocked'
            : `Requires the ${lic.name} license`}</span>
        </header>
        <div class="perk-tier-list">${rows}</div>
      </section>`;
  }).join('');

  rebuildPreservingScroll(container, () => {
    if (isFull) {
      container.innerHTML = `
      <div class="perks-view">
        ${heroHtml}
        <div class="perks-board">${boardHtml}</div>
      </div>`;
    } else {
      container.innerHTML = Object.values(PERKS).map((p) => {
        const { owned, canBuy } = statusById[p.id];
        const licShort = p.licenseRequired && p.licenseRequired !== 'retail'
          ? LICENSES[p.licenseRequired]?.short
          : null;
        return `
        <div class="perk perk-t${p.tier || 1} ${owned ? 'owned' : ''} ${canBuy ? 'available' : ''} ${!owned && !canBuy ? 'is-locked' : ''}" data-perk="${p.id}">
          ${perkMarkHtml(p)}
          <div class="perk-body">
            <div class="perk-name">${p.name}</div>
            <div class="perk-desc">${p.desc}</div>
            ${buildPerkInlineHtml(p.id)}
            <div class="perk-cost">${owned ? 'OWNED' : `${fmt(p.cost)}${licShort ? ` · ${licShort}` : ''}`}</div>
          </div>
        </div>`;
      }).join('');
    }
  });

  container.querySelectorAll('.perk.available').forEach((el) => {
    el.onclick = () => state.onBuyPerk?.(el.dataset.perk);
    el.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        state.onBuyPerk?.(el.dataset.perk);
      }
    };
  });
  container.querySelectorAll('.license-exam-btn').forEach((el) => {
    el.onclick = (e) => {
      e.stopPropagation();
      state.onTakeLicenseExam?.(el.dataset.license);
    };
  });

  teardownPerkTooltips();
  lastPerksRenderSig.set(containerId, sig);
}
