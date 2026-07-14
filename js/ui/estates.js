// @ts-check
/**
 * Estates panel — image-first bento categories → option submenus.
 * Important: do NOT rewrite innerHTML on every renderAll tick (causes hover flash).
 */

import {
  ESTATE_ASSETS,
  ESTATE_CATEGORIES,
  canPurchaseEstate,
  getEstateCategory,
  getEstateCreditAvailable,
  getEstateCashOutQuote,
  getEstateNetIncomePerDay,
  getEstatePrestigeAura,
  getEstatesByCategory,
  getOwnedEstates,
  ownsEstateCategory,
  syncEstateDerived,
  ESTATE_CASHOUT_COOLDOWN_DAYS,
} from '../estates.js';
import { getDayCount } from '../market.js';
import { escapeAttr, escapeHtml, fmt } from './shared.js';

/** @type {string | null} */
let activeCategoryId = null;
/** @type {string | null} */
let selectedAssetId = null;
let ledgerOpen = false;
/** Last full DOM fingerprint — skip rebuild while hovering / ticking. */
let estatesSnap = '';
/** @type {string | null} */
let lastAnimatedCategory = null;
/** @type {number} */
let lastNetWorth = 0;

/**
 * @param {{ imagePlaceholder: string, imageFuturePath: string, imageAlt: string }} media
 * @param {string} [className]
 */
function mediaHtml(media, className = 'estate-media-img') {
  // Eager load: Chromium often never fires lazy loads for imgs inside
  // overflow:auto grids (Garage option tiles below the fold stay blank).
  // Local packaged files only (assets/estates/*) — offline-safe.
  const src = media.imagePlaceholder || media.imageFuturePath || '';
  return `<img class="${escapeAttr(className)}" src="${escapeAttr(src)}" alt="${escapeAttr(media.imageAlt)}" loading="eager" decoding="async">`;
}

/**
 * Structure fingerprint — ownership / gates / selection. Not live quote NW churn.
 * @param {object} state
 * @param {number} netWorth
 */
function estatesStructureKey(state, netWorth) {
  const owned = Array.isArray(state.estateOwned) ? state.estateOwned.join(',') : '';
  const spent = Number(state.estateSpentTotal) || 0;
  const credit = Number(state.estateCreditUsed) || 0;
  const extracted = Number(state.estateEquityExtracted) || 0;
  const cashOutN = Number(state.estateCashOutCount) || 0;
  // Bucket NW so tiny quote noise doesn't rebuild the catalog.
  const nwBucket = Math.floor(Math.max(0, Number(netWorth) || 0) / 1000);
  const rep = Math.floor(Number(state.meta?.reputation) || 0);
  const cashBucket = Math.floor(Math.max(0, Number(state.portfolio?.cash) || 0) / 100);
  // Day matters for cash-out cooldown UI; only changes at day-end (not every tick).
  const day = getDayCount();
  return [
    activeCategoryId || 'home',
    selectedAssetId || '',
    ledgerOpen ? '1' : '0',
    owned,
    spent,
    credit,
    extracted,
    cashOutN,
    nwBucket,
    rep,
    cashBucket,
    day,
  ].join('|');
}

/**
 * @param {object} state
 * @param {number} netWorth
 * @param {import('../estates.js').EstateCategory} cat
 */
function categoryTileHtml(state, netWorth, cat) {
  const options = getEstatesByCategory(cat.id);
  const ownedCount = options.filter((a) => (state.estateOwned || []).includes(a.id)).length;
  const unlocked = !cat.requiresCategory || ownsEstateCategory(state, cat.requiresCategory);
  const ready = unlocked && options.some((a) => canPurchaseEstate(state, a.id, { netWorth }).ok);
  const lockHint = !unlocked
    ? `Requires ${getEstateCategory(cat.requiresCategory)?.name || cat.requiresCategory}`
    : '';
  const status = !unlocked ? 'Locked' : ownedCount ? `${ownedCount}/${options.length}` : ready ? 'Ready' : 'Browse';

  return `
    <button type="button"
      class="estate-bento-tile estate-bento-${escapeAttr(cat.layout)}${unlocked ? '' : ' is-locked'}${ready ? ' is-ready' : ''}"
      data-estate-category="${escapeAttr(cat.id)}"
      ${unlocked ? '' : `aria-disabled="true" title="${escapeAttr(lockHint)}"`}
      aria-label="${escapeAttr(cat.name)} — ${options.length} options">
      <div class="estate-bento-media">${mediaHtml(cat)}</div>
      <div class="estate-bento-shade"></div>
      <div class="estate-bento-copy">
        <span class="estate-bento-title">${escapeHtml(cat.name)}</span>
        <span class="estate-bento-sub">${escapeHtml(cat.subtitle)} · ${options.length} options</span>
      </div>
      <span class="estate-bento-status">${escapeHtml(status)}</span>
      <span class="estate-bento-arrow" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12h12M13 6l6 6-6 6"/>
        </svg>
      </span>
    </button>
  `;
}

/**
 * Short living / category specs for option tiles and detail panels.
 * Prefer beds/baths/sqft(/built); else asset.specs.
 * @param {import('../estates.js').EstateAsset} asset
 * @param {{ includeBuilt?: boolean }} [opts]
 * @returns {string[]}
 */
function assetSpecParts(asset, opts = {}) {
  /** @type {string[]} */
  const parts = [];
  if (asset.beds != null) parts.push(`${asset.beds} bed`);
  if (asset.baths != null) {
    const baths = Number(asset.baths);
    parts.push(`${Number.isInteger(baths) ? String(baths) : String(baths)} bath`);
  }
  if (asset.sqft != null) parts.push(`${asset.sqft.toLocaleString()} sqft`);
  if (opts.includeBuilt && asset.built != null) parts.push(`built ${asset.built}`);
  if (parts.length) return parts;
  if (Array.isArray(asset.specs) && asset.specs.length) {
    return asset.specs.map((s) => String(s));
  }
  return [];
}

/**
 * @param {object} state
 * @param {number} netWorth
 * @param {import('../estates.js').EstateAsset} asset
 */
function optionTileHtml(state, netWorth, asset) {
  const owned = (state.estateOwned || []).includes(asset.id);
  const gate = owned ? { ok: false, reason: 'Owned', code: 'owned' } : canPurchaseEstate(state, asset.id, { netWorth });
  const selected = selectedAssetId === asset.id;
  const status = owned ? 'Owned' : gate.ok ? 'Ready' : gate.code === 'cash' ? 'Cash short' : 'Locked';
  const specParts = assetSpecParts(asset);
  const specsLine = specParts.length ? specParts.join(' · ') : asset.tierLabel;

  return `
    <button type="button"
      class="estate-option-tile${owned ? ' is-owned' : ''}${selected ? ' is-selected' : ''}${gate.ok ? ' is-ready' : ''}"
      data-estate-select="${escapeAttr(asset.id)}">
      <div class="estate-option-media">${mediaHtml(asset, 'estate-option-img')}</div>
      <div class="estate-option-shade"></div>
      <div class="estate-option-foot">
        <span class="estate-option-name">${escapeHtml(asset.name)}</span>
        <span class="estate-option-meta">${escapeHtml(status)} · ${fmt(asset.price)}</span>
        <span class="estate-option-specs">${escapeHtml(specsLine)}</span>
      </div>
    </button>
  `;
}

/**
 * @param {import('../estates.js').EstateAsset} asset
 */
function livingSpecsHtml(asset) {
  const specs = assetSpecParts(asset, { includeBuilt: true });
  if (!specs.length) return '';
  return `<ul class="estate-living-specs">${specs.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>`;
}

/**
 * @param {import('../estates.js').EstateAsset} asset
 */
function financialsHtml(asset) {
  const cells = [
    { label: 'Credit LTV', value: `${(asset.creditLtv * 100).toFixed(0)}%` },
    { label: 'Resilience', value: `+${asset.resilience}` },
    { label: 'Income / day', value: asset.incomePerDay > 0 ? fmt(asset.incomePerDay) : '—' },
    { label: 'Upkeep / day', value: fmt(asset.upkeepPerDay) },
  ];
  if (asset.vaultPrestige) {
    cells.push({
      label: 'Prestige',
      value: `+${asset.vaultPrestige.repPerClose} REP/close`,
    });
  }
  return `
    <div class="estate-financials">
      <p class="estate-financials-label">Financials</p>
      <div class="estate-financials-grid">
        ${cells.map((c) => `
          <div class="estate-fin-cell">
            <span>${escapeHtml(c.label)}</span>
            <strong>${escapeHtml(c.value)}</strong>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * @param {object} state
 * @param {number} netWorth
 * @param {import('../estates.js').EstateAsset} asset
 */
function detailPanelHtml(state, netWorth, asset) {
  const owned = (state.estateOwned || []).includes(asset.id);
  const gate = owned ? { ok: false, reason: 'Already owned', code: 'owned' } : canPurchaseEstate(state, asset.id, { netWorth });

  let cta = '';
  if (owned) {
    cta = `<span class="estate-owned-badge">In portfolio</span>`;
  } else if (gate.ok) {
    cta = `<button type="button" class="btn btn-accent btn-estate-buy" data-estate-id="${escapeAttr(asset.id)}">Acquire — ${fmt(asset.price)}</button>`;
  } else {
    cta = `<button type="button" class="btn btn-estate-buy" data-estate-id="${escapeAttr(asset.id)}" disabled title="${escapeAttr(gate.reason || '')}">${escapeHtml(gate.reason || 'Locked')} · ${fmt(asset.price)}</button>`;
  }

  return `
    <aside class="estate-detail-panel estate-glass">
      <div class="estate-detail-media">${mediaHtml(asset, 'estate-detail-img')}</div>
      <div class="estate-detail-body">
        <div class="estate-detail-top">
          <span class="estate-bento-kicker">Tier ${asset.tier} · ${escapeHtml(asset.tierLabel)}</span>
        </div>
        <h3 class="estate-detail-name">${escapeHtml(asset.name)}</h3>
        ${livingSpecsHtml(asset)}
        <p class="estate-detail-blurb">${escapeHtml(asset.blurb)}</p>
        ${financialsHtml(asset)}
        <div class="estate-detail-cta">${cta}</div>
      </div>
    </aside>
  `;
}

/**
 * @param {object} state
 */
function ledgerSnapshot(state) {
  syncEstateDerived(state);
  const creditMax = Math.max(0, Number(state.estateCreditMax) || 0);
  const creditUsed = Math.max(0, Number(state.estateCreditUsed) || 0);
  const creditAvail = getEstateCreditAvailable(state);
  const netIncome = getEstateNetIncomePerDay(state);
  const resilience = Math.max(0, Number(state.resilienceRating) || 0);
  const equity = Math.max(0, Number(state.estateEquity) || 0);
  const prestige = getEstatePrestigeAura(state);
  const cashOut = getEstateCashOutQuote(state);
  const day = getDayCount();
  let cooldownLeft = 0;
  if (cashOut.lastDay != null) {
    cooldownLeft = Math.max(0, ESTATE_CASHOUT_COOLDOWN_DAYS - (day - cashOut.lastDay));
  }
  return {
    ownedCount: getOwnedEstates(state).length,
    creditMax,
    creditUsed,
    creditAvail,
    netIncome,
    resilience,
    equity,
    prestige,
    cashOut,
    cooldownLeft,
  };
}

/**
 * Soft-update ledger pills without destroying the DOM (keeps hover stable).
 * @param {object} state
 */
function patchLedgerPills(state) {
  const snap = ledgerSnapshot(state);
  const pills = document.querySelectorAll('#estates-root .estate-ledger-pills em');
  if (pills.length >= 4) {
    pills[0].textContent = fmt(snap.equity);
    pills[1].textContent = `R${snap.resilience}`;
    pills[2].textContent = fmt(snap.creditAvail);
    pills[3].textContent = `${snap.netIncome >= 0 ? '+' : ''}${fmt(snap.netIncome)}/d`;
    pills[3].classList.toggle('up', snap.netIncome >= 0);
    pills[3].classList.toggle('down', snap.netIncome < 0);
  }
  const cashBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('btn-estate-cashout'));
  if (cashBtn) {
    const ready = !!(snap.cashOut.ok && snap.cooldownLeft <= 0);
    cashBtn.disabled = !ready;
    cashBtn.title = snap.cooldownLeft > 0 ? `Cooldown ${snap.cooldownLeft}d` : '';
    cashBtn.textContent = snap.cooldownLeft > 0 ? `Cooldown ${snap.cooldownLeft}d` : 'Cash out';
  }
}

/**
 * @param {object} state
 */
function ledgerHtml(state) {
  const snap = ledgerSnapshot(state);

  return `
    <div class="estate-ledger estate-glass${ledgerOpen ? ' is-open' : ''}">
      <button type="button" class="estate-ledger-toggle" id="btn-estate-ledger-toggle" aria-expanded="${ledgerOpen ? 'true' : 'false'}">
        <span>Wealth ledger</span>
        <span class="estate-ledger-pills">
          <em>${fmt(snap.equity)}</em>
          <em>R${snap.resilience}</em>
          <em>${fmt(snap.creditAvail)}</em>
          <em class="${snap.netIncome >= 0 ? 'up' : 'down'}">${snap.netIncome >= 0 ? '+' : ''}${fmt(snap.netIncome)}/d</em>
        </span>
        <span class="estate-ledger-chevron" aria-hidden="true">${ledgerOpen ? '▴' : '▾'}</span>
      </button>
      <div class="estate-ledger-body"${ledgerOpen ? '' : ' hidden'}>
        <div class="estate-ledger-grid">
          <div class="estate-ledger-card">
            <div class="dash-card-head"><span>Overview</span><span class="dash-soft-tag">${snap.ownedCount} owned</span></div>
            <div class="estate-stat-rows">
              <div class="estate-stat-row"><span>Property equity</span><span>${fmt(snap.equity)}</span></div>
              <div class="estate-stat-row"><span>Credit drawn</span><span class="${snap.creditUsed > 0 ? 'down' : ''}">${fmt(snap.creditUsed)}</span></div>
              <div class="estate-stat-row"><span>Income / day</span><span>${fmt(state.estateIncomePerDay || 0)}</span></div>
              <div class="estate-stat-row"><span>Upkeep / day</span><span class="down">${fmt(state.estateUpkeepPerDay || 0)}</span></div>
              <div class="estate-stat-row"><span>Desk prestige</span><span>${escapeHtml(snap.prestige.summary)}</span></div>
            </div>
          </div>
          <div class="estate-ledger-card">
            <div class="dash-card-head"><span>Property credit</span></div>
            <p class="estate-panel-blurb">Draw trading capital against owned estates. Interest accrues while drawn.</p>
            <div class="estate-credit-actions">
              <label class="estate-amount-label">Amount
                <input type="number" id="estate-credit-amount" class="estate-amount-input" min="100" step="100" value="${Math.min(10000, Math.max(100, snap.creditAvail || 100))}">
              </label>
              <button type="button" class="btn btn-accent btn-sm" id="btn-estate-draw" ${snap.creditAvail > 0 ? '' : 'disabled'}>Draw</button>
              <button type="button" class="btn btn-sm" id="btn-estate-repay" ${snap.creditUsed > 0 ? '' : 'disabled'}>Repay</button>
            </div>
            <div class="estate-stat-row muted"><span>Available</span><span>${fmt(snap.creditAvail)} / ${fmt(snap.creditMax)}</span></div>
          </div>
          <div class="estate-ledger-card">
            <div class="dash-card-head"><span>Equity cash-out</span></div>
            <p class="estate-panel-blurb">Lump-sum extract. ${ESTATE_CASHOUT_COOLDOWN_DAYS}-day cooldown · diminishing returns.</p>
            <div class="estate-cashout-row">
              <span>${snap.cashOut.ok ? `~${fmt(snap.cashOut.amount)} (${Math.round((snap.cashOut.pct || 0) * 100)}%)` : escapeHtml(snap.cashOut.reason || 'Unavailable')}</span>
              <button type="button" class="btn btn-accent btn-sm" id="btn-estate-cashout" ${snap.cashOut.ok && snap.cooldownLeft <= 0 ? '' : 'disabled'} title="${snap.cooldownLeft > 0 ? `Cooldown ${snap.cooldownLeft}d` : ''}">
                ${snap.cooldownLeft > 0 ? `Cooldown ${snap.cooldownLeft}d` : 'Cash out'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * @param {object} state
 * @param {number} netWorth
 */
function homeHtml(state, netWorth) {
  return `
    <div class="estates-liquid" aria-hidden="true"></div>
    <header class="estates-brand-bar">
      <div>
        <p class="estates-brand-eyebrow">Lifestyle portfolio</p>
        <h2 class="estates-brand-title">StockWay Estates</h2>
      </div>
    </header>
    ${ledgerHtml(state)}
    <div class="estate-bento" id="estate-bento">
      ${ESTATE_CATEGORIES.map((c) => categoryTileHtml(state, netWorth, c)).join('')}
    </div>
  `;
}

/**
 * @param {object} state
 * @param {number} netWorth
 * @param {string} categoryId
 * @param {boolean} animateEnter
 */
function submenuHtml(state, netWorth, categoryId, animateEnter) {
  const cat = getEstateCategory(categoryId);
  if (!cat) return homeHtml(state, netWorth);
  const options = getEstatesByCategory(categoryId);
  if (!selectedAssetId || !options.some((a) => a.id === selectedAssetId)) {
    selectedAssetId = options[0]?.id || null;
  }
  const selected = options.find((a) => a.id === selectedAssetId) || options[0];
  const enterClass = animateEnter ? ' estate-submenu-enter' : '';

  return `
    <div class="estates-liquid" aria-hidden="true"></div>
    <header class="estates-brand-bar estates-submenu-bar">
      <button type="button" class="btn btn-sm estate-back-btn" id="btn-estate-back">← Categories</button>
      <div>
        <p class="estates-brand-eyebrow">Tier ${cat.tier} · ${escapeHtml(cat.tierLabel)}</p>
        <h2 class="estates-brand-title">${escapeHtml(cat.name)}</h2>
        <p class="estates-submenu-sub">${escapeHtml(cat.blurb)}</p>
      </div>
    </header>
    <div class="estate-submenu-layout${enterClass}">
      <div class="estate-option-grid">
        ${options.map((a) => optionTileHtml(state, netWorth, a)).join('')}
      </div>
      ${selected ? detailPanelHtml(state, netWorth, selected) : ''}
    </div>
  `;
}

/**
 * @param {HTMLElement} root
 * @param {object} state
 * @param {number} netWorth
 */
function bindEstatesUi(root, state, netWorth) {
  root.querySelectorAll('[data-estate-category]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('is-locked') || btn.getAttribute('aria-disabled') === 'true') return;
      const id = btn.getAttribute('data-estate-category');
      if (!id) return;
      activeCategoryId = id;
      selectedAssetId = getEstatesByCategory(id)[0]?.id || null;
      estatesSnap = '';
      renderEstates(state, { netWorth });
    });
  });

  root.querySelectorAll('[data-estate-select]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-estate-select');
      if (!id || id === selectedAssetId) return;
      selectedAssetId = id;
      estatesSnap = '';
      renderEstates(state, { netWorth });
    });
  });

  document.getElementById('btn-estate-back')?.addEventListener('click', () => {
    activeCategoryId = null;
    selectedAssetId = null;
    lastAnimatedCategory = null;
    estatesSnap = '';
    renderEstates(state, { netWorth });
  });

  document.getElementById('btn-estate-ledger-toggle')?.addEventListener('click', () => {
    ledgerOpen = !ledgerOpen;
    estatesSnap = '';
    renderEstates(state, { netWorth });
  });

  root.querySelectorAll('.btn-estate-buy:not([disabled])').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-estate-id');
      if (id) state.onPurchaseEstate?.(id);
    });
  });

  const amountEl = /** @type {HTMLInputElement | null} */ (document.getElementById('estate-credit-amount'));
  document.getElementById('btn-estate-draw')?.addEventListener('click', () => {
    state.onDrawEstateCredit?.(Number(amountEl?.value) || 0);
  });
  document.getElementById('btn-estate-repay')?.addEventListener('click', () => {
    state.onRepayEstateCredit?.(Number(amountEl?.value) || 0);
  });
  document.getElementById('btn-estate-cashout')?.addEventListener('click', () => {
    state.onCashOutEstateEquity?.();
  });
}

/**
 * @param {object} state
 * @param {{ netWorth?: number }} [opts]
 */
export function renderEstates(state, { netWorth = 0 } = {}) {
  const root = document.getElementById('estates-root');
  if (!root) return;

  syncEstateDerived(state);
  lastNetWorth = Number(netWorth) || 0;

  // Soft-skip while another tab is active *and* we already painted once.
  const view = document.getElementById('view-estates');
  const force = root.dataset.estatesForce === '1';
  if (force) delete root.dataset.estatesForce;
  if (!force && view && !view.classList.contains('active') && root.childElementCount > 0) {
    return;
  }

  if (activeCategoryId && !getEstateCategory(activeCategoryId)) {
    activeCategoryId = null;
    selectedAssetId = null;
    lastAnimatedCategory = null;
  }

  if (force) estatesSnap = '';

  const key = estatesStructureKey(state, lastNetWorth);
  if (!force && key === estatesSnap && root.childElementCount > 0) {
    // Live numbers only — never blow away hover / selection DOM.
    patchLedgerPills(state);
    return;
  }

  const animateEnter = !!(activeCategoryId && activeCategoryId !== lastAnimatedCategory);
  if (activeCategoryId) lastAnimatedCategory = activeCategoryId;

  root.className = [
    'estates-view',
    activeCategoryId ? 'is-submenu' : 'is-home',
    // Ledger UI only mounts on home; keep open class scoped there.
    !activeCategoryId && ledgerOpen ? 'is-ledger-open' : '',
  ].filter(Boolean).join(' ');
  root.innerHTML = activeCategoryId
    ? submenuHtml(state, lastNetWorth, activeCategoryId, animateEnter)
    : homeHtml(state, lastNetWorth);

  estatesSnap = key;
  bindEstatesUi(root, state, lastNetWorth);

  // Enter animation is one-shot; strip class after it finishes so reflows don't re-trigger.
  if (animateEnter) {
    const enterEl = root.querySelector('.estate-submenu-enter');
    if (enterEl) {
      enterEl.addEventListener('animationend', () => {
        enterEl.classList.remove('estate-submenu-enter');
      }, { once: true });
    }
  }
}

/**
 * Compact Dashboard wealth strip for estates.
 * @param {object} state
 */
export function buildDashEstateHtml(state) {
  syncEstateDerived(state);
  const owned = getOwnedEstates(state);
  if (!owned.length) {
    return `<div class="dash-estate-line">`
      + `<div class="dash-office-next">Estates: unlock Residences at $100k NW · ${ESTATE_ASSETS.length} lifestyle options</div>`
      + `<button type="button" class="btn btn-sm" data-goto="estates">Browse Estates</button>`
      + `</div>`;
  }
  const top = owned[owned.length - 1];
  const net = getEstateNetIncomePerDay(state);
  const credit = getEstateCreditAvailable(state);
  return `<div class="dash-estate-line">`
    + `<div class="dash-office-next">Estates: ${escapeHtml(top.name)} · Resilience ${state.resilienceRating || 0} · Credit ${fmt(credit)} · Net/day ${net >= 0 ? '+' : ''}${fmt(net)}</div>`
    + `<button type="button" class="btn btn-sm" data-goto="estates">Manage Estates</button>`
    + `</div>`;
}
