// @ts-check
import {
  getCollectionCompletion,
  getCollectionHuntTargets,
  getCollectionLogEntries,
  getCollectionMilestones,
  getCollectionPrestigeScore,
} from '../collection-log.js';
import {
  canClaimSet,
  listSetProgress,
} from '../collection-flavor.js';
import { getActiveFlair } from '../meta.js';
import { BLACKMARKET_ITEM_POOL } from '../blackmarket.js';
import { PRIVATE_SALON_POOL } from '../private-salon.js';
import { THE_SEAT } from '../the-seat.js';
import { VAULT_ITEMS, getCategoryDisplayLabel, getVaultItem } from '../vault.js';
import { escapeAttr, escapeHtml, fmt } from './shared.js';
import { renderVaultFoilArt } from './vault.js';

/** @type {'log' | 'museum'} */
let collectionViewMode = 'log';
let collectionCategoryFilter = 'all';
let collectionOwnedFilter = 'all';

const RARITY_TIER_CLASS = {
  common: 'tier-bronze',
  rare: 'tier-gold',
  legendary: 'tier-diamond',
  masterwork: 'tier-masterwork',
  crown: 'tier-crown',
};

const RARITY_LABEL = {
  common: 'Common',
  rare: 'Rare',
  legendary: 'Legendary',
  masterwork: 'Masterwork',
  crown: 'Crown',
};

const SOURCE_LABEL = {
  vault: 'Trophy Vault',
  salon: 'Private Salon',
  blackmarket: 'Black Market',
  seat: 'The Seat',
};

const COLLECTION_OPTS = {
  blackMarketPool: BLACKMARKET_ITEM_POOL,
  seatItem: THE_SEAT,
  salonPool: PRIVATE_SALON_POOL,
};

function chipButtons(active, values, attr) {
  return values.map((value) => {
    let label = value;
    if (value === 'all') label = 'All';
    else if (value === 'owned') label = 'Owned';
    else if (value === 'missing') label = 'Missing';
    else if (attr === 'collection-category') label = getCategoryDisplayLabel(value);
    const cls = active === value ? 'active' : '';
    return `<button type="button" class="collection-filter ${cls}" data-${attr}="${value}">${escapeHtml(label)}</button>`;
  }).join('');
}

function modeToggleHtml() {
  return `
    <div class="collection-mode-toggle" role="tablist" aria-label="Collection view mode">
      <button type="button" class="collection-mode-btn ${collectionViewMode === 'log' ? 'active' : ''}" data-collection-mode="log" role="tab" aria-selected="${collectionViewMode === 'log'}">Log</button>
      <button type="button" class="collection-mode-btn ${collectionViewMode === 'museum' ? 'active' : ''}" data-collection-mode="museum" role="tab" aria-selected="${collectionViewMode === 'museum'}">Museum</button>
    </div>
  `;
}

function artForEntry(entry) {
  const item = entry.source === 'vault'
    ? VAULT_ITEMS[entry.id]
    : getVaultItem(entry.id);
  if (item) return renderVaultFoilArt(item, `col-${entry.id}`);
  return renderVaultFoilArt({
    id: entry.id,
    name: entry.name,
    category: entry.category,
  }, `col-${entry.id}`);
}

function rewardBlurb(milestone) {
  const bits = [];
  if (milestone.rep) bits.push(`+${milestone.rep} REP`);
  if (milestone.cash) bits.push(fmt(milestone.cash));
  if (milestone.flair) bits.push(`Title “${milestone.flair}”`);
  return bits.length ? bits.join(' · ') : 'Prestige mark';
}

function renderSetsStrip(state) {
  const rows = listSetProgress(state);
  if (!rows.length) return '';
  return `
    <section class="museum-sets" aria-label="Collection sets">
      <div class="museum-sets-head">
        <strong>Sets</strong>
        <span>Complete a set, claim flair only</span>
      </div>
      <div class="museum-sets-row">
        ${rows.map((row) => {
          const set = row.set;
          const claimGate = canClaimSet(state, set.id);
          const claimed = !claimGate.ok && claimGate.code === 'claimed';
          const claimable = claimGate.ok;
          const stateLabel = claimed ? 'Claimed' : claimable ? 'Complete' : `${row.owned}/${row.total}`;
          const claimBtn = claimable
            ? `<button type="button" class="btn btn-sm btn-accent museum-set-claim" data-set-claim="${escapeAttr(set.id)}">Claim ${escapeHtml(set.flair)}</button>`
            : '';
          return `
            <article class="museum-set-card ${row.complete ? 'complete' : ''} ${claimed ? 'claimed' : ''} ${claimable ? 'claimable' : ''}">
              <div class="museum-set-top">
                <h3>${escapeHtml(set.name)}</h3>
                <span class="museum-set-state">${escapeHtml(stateLabel)}</span>
              </div>
              <p>${escapeHtml(set.blurb)}</p>
              <div class="museum-set-progress" aria-hidden="true">
                <span style="width:${row.total ? Math.round((row.owned / row.total) * 100) : 0}%"></span>
              </div>
              ${claimBtn || (claimed && set.flair ? `<span class="museum-set-flair">${escapeHtml(set.flair)}</span>` : '')}
            </article>
          `;
        }).join('')}
      </div>
    </section>
  `;
}

function renderMuseumGallery(ownedEntries) {
  if (!ownedEntries.length) {
    return `<p class="museum-empty">No pieces owned yet. Acquire vault, salon, or Black Market works — then return here to read their lore.</p>`;
  }
  return `
    <div class="museum-gallery">
      ${ownedEntries.map((entry) => {
        const tierClass = RARITY_TIER_CLASS[entry.rarity] || 'tier-silver';
        const rarityLabel = RARITY_LABEL[entry.rarity] || entry.rarity;
        return `
          <article class="museum-plate ${tierClass}">
            <div class="museum-plate-art">
              ${artForEntry(entry)}
            </div>
            <div class="museum-plate-body">
              <div class="museum-plate-head">
                <h3>${escapeHtml(entry.name)}</h3>
                <span class="collection-owned-state">Owned</span>
              </div>
              <div class="collection-meta">
                <span class="collection-chip">${escapeHtml(SOURCE_LABEL[entry.source] || entry.source)}</span>
                <span class="collection-chip">${escapeHtml(rarityLabel)}</span>
                ${entry.setName ? `<span class="collection-chip museum-set-chip">${escapeHtml(entry.setName)}</span>` : ''}
              </div>
              ${entry.lore
                ? `<p class="museum-lore">${escapeHtml(entry.lore)}</p>`
                : '<p class="museum-lore museum-lore-muted">No dossier on file.</p>'}
            </div>
          </article>
        `;
      }).join('')}
    </div>
  `;
}

function renderLogBody(state, entries, milestones, hunt) {
  const categories = [...new Set(entries.map((entry) => entry.category).filter(Boolean))].sort();
  const filtered = entries.filter((entry) => {
    if (collectionCategoryFilter !== 'all' && entry.category !== collectionCategoryFilter) return false;
    if (collectionOwnedFilter === 'owned' && !entry.owned) return false;
    if (collectionOwnedFilter === 'missing' && entry.owned) return false;
    return true;
  });

  return `
    <section class="collection-hunt">
      <div class="collection-hunt-head">
        <strong>Next chase</strong>
        <span>Highest-value missing pieces</span>
      </div>
      <div class="collection-hunt-row">
        ${hunt.length ? hunt.map((entry) => `
          <div class="collection-hunt-card">
            <div class="collection-hunt-art">${artForEntry(entry)}</div>
            <div class="collection-hunt-meta">
              <strong>${escapeHtml(entry.name)}</strong>
              <span>${escapeHtml(SOURCE_LABEL[entry.source] || entry.source)} · ${escapeHtml(RARITY_LABEL[entry.rarity] || entry.rarity)}</span>
            </div>
          </div>
        `).join('') : '<p class="collection-hunt-empty">Catalog complete — nothing left to chase.</p>'}
      </div>
    </section>

    <section class="collection-milestones">
      <div class="collection-milestones-head">
        <strong>Milestones</strong>
        <span>Claim once when earned</span>
      </div>
      <div class="collection-milestone-grid">
        ${milestones.map((m) => `
          <article class="collection-milestone ${m.claimed ? 'claimed' : ''} ${m.claimable ? 'claimable' : ''} ${m.earned ? 'earned' : 'locked'}">
            <div class="collection-milestone-top">
              <h3>${escapeHtml(m.label)}</h3>
              <span class="collection-milestone-state">${m.claimed ? 'Claimed' : m.claimable ? 'Ready' : m.earned ? 'Ready' : 'Locked'}</span>
            </div>
            <p>${escapeHtml(m.blurb)}</p>
            <div class="collection-milestone-reward">${escapeHtml(rewardBlurb(m))}</div>
            <button
              type="button"
              class="btn ${m.claimable ? 'btn-accent' : ''} collection-claim-btn"
              data-collection-claim="${m.id}"
              ${m.claimable ? '' : 'disabled'}
            >${m.claimed ? 'Claimed' : m.claimable ? 'Claim' : 'Locked'}</button>
          </article>
        `).join('')}
      </div>
    </section>

    <div class="collection-filters-wrap">
      <div class="collection-filters">${chipButtons(collectionCategoryFilter, ['all', ...categories], 'collection-category')}</div>
      <div class="collection-filters">${chipButtons(collectionOwnedFilter, ['all', 'owned', 'missing'], 'collection-owned')}</div>
    </div>
    <div class="collection-grid">
      ${filtered.map((entry) => {
        const tierClass = RARITY_TIER_CLASS[entry.rarity] || 'tier-silver';
        const rarityLabel = RARITY_LABEL[entry.rarity] || entry.rarity;
        return `
          <article class="collection-card ${entry.owned ? 'owned' : 'missing'} ${tierClass}">
            <div class="collection-card-art ${entry.owned ? 'owned' : 'locked'}">
              ${artForEntry(entry)}
            </div>
            <div class="collection-card-head">
              <h3>${escapeHtml(entry.name)}</h3>
              <span class="collection-owned-state">${entry.owned ? 'Owned' : 'Missing'}</span>
            </div>
            <div class="collection-meta">
              <span class="collection-chip">${escapeHtml(SOURCE_LABEL[entry.source] || entry.source)}</span>
              <span class="collection-chip">${escapeHtml(getCategoryDisplayLabel(entry.category))}</span>
              <span class="collection-chip">${escapeHtml(rarityLabel)}</span>
            </div>
          </article>
        `;
      }).join('')}
    </div>
  `;
}

export function renderCollectionLog(state) {
  const root = document.getElementById('collection-log-root');
  if (!root) return;

  const entries = getCollectionLogEntries(state, COLLECTION_OPTS);
  const completion = getCollectionCompletion(state, COLLECTION_OPTS);
  const prestige = getCollectionPrestigeScore(state, COLLECTION_OPTS);
  const milestones = getCollectionMilestones(state, COLLECTION_OPTS);
  const hunt = getCollectionHuntTargets(state, { ...COLLECTION_OPTS, limit: 3 });
  const claimableCount = milestones.filter((m) => m.claimable).length;
  const flair = getActiveFlair(state.meta || {}) || '';
  const ownedEntries = entries.filter((entry) => entry.owned);
  const isMuseum = collectionViewMode === 'museum';

  root.innerHTML = `
    <div class="collection-shell ${isMuseum ? 'is-museum' : 'is-log'}">
      <header class="collection-hero">
        <div>
          <p class="collection-eyebrow">${isMuseum ? 'Immersion gallery' : 'Completion track'}</p>
          <h2>Collection Log</h2>
          <p class="collection-sub">${isMuseum
            ? 'Owned plates with short lore. Finish a set for cosmetic flair — nothing that changes how you trade.'
            : 'Chase missing pieces, clear milestones, claim REP and cash. Owned plates keep their foil art.'}</p>
          ${modeToggleHtml()}
        </div>
        <div class="collection-progress-pill">
          <strong>${completion.owned} / ${completion.total}</strong>
          <span>${completion.pct}% complete</span>
          <span>Collection ${prestige}</span>
          ${flair ? `<span class="collection-flair-pill">${escapeHtml(flair)}</span>` : ''}
          ${!isMuseum && claimableCount ? `<span class="collection-claim-ready">${claimableCount} ready to claim</span>` : ''}
        </div>
      </header>

      ${isMuseum
        ? `${renderSetsStrip(state)}${renderMuseumGallery(ownedEntries)}`
        : renderLogBody(state, entries, milestones, hunt)}
    </div>
  `;

  root.querySelectorAll('[data-collection-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-collection-mode');
      collectionViewMode = mode === 'museum' ? 'museum' : 'log';
      renderCollectionLog(state);
    });
  });
  root.querySelectorAll('[data-collection-category]').forEach((btn) => {
    btn.addEventListener('click', () => {
      collectionCategoryFilter = btn.getAttribute('data-collection-category') || 'all';
      renderCollectionLog(state);
    });
  });
  root.querySelectorAll('[data-collection-owned]').forEach((btn) => {
    btn.addEventListener('click', () => {
      collectionOwnedFilter = btn.getAttribute('data-collection-owned') || 'all';
      renderCollectionLog(state);
    });
  });
  root.querySelectorAll('[data-collection-claim]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-collection-claim');
      if (id) state.onClaimCollectionMilestone?.(id);
    });
  });
  root.querySelectorAll('[data-set-claim]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-set-claim');
      if (id) state.onClaimCollectionSet?.(id);
    });
  });
}
