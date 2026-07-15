// @ts-check
/**
 * Achievements view render — extracted from ui.js (Phase 2).
 * Domain logic stays in ../achievements.js; this is DOM only.
 *
 * Important: do NOT rewrite the card grid on every renderAll tick
 * (hover stutter + Claim buttons that never stay clickable).
 */

import {
  ACHIEVEMENTS, ACHIEVEMENT_TIERS, getAchievementProgress, getUnclaimedTotal,
  achievementBadgeSvg, achievementCategory,
} from '../achievements.js';
import { getHighestLicense } from '../licenses.js';
import { escapeAttr, escapeHtml } from './shared.js';

const RING_R = 52;
const RING_C = 2 * Math.PI * RING_R;

const TIER_ROMAN = {
  bronze: 'I',
  silver: 'II',
  gold: 'III',
  platinum: 'IV',
  diamond: 'V',
  master: 'VI',
};

/** @type {string} */
let achievementsSnap = '';
/** @type {object | null} */
let achUiState = null;
/** @type {number} */
let tipRaf = 0;
/** @type {number} */
let tipX = 0;
/** @type {number} */
let tipY = 0;
/** @type {boolean} */
let tipVisible = false;

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

/**
 * @param {object} state
 * @param {{ unlocked: number, total: number }} prog
 * @param {number} unclaimed
 */
function updateProgressPanel(state, prog, unclaimed) {
  const pct = prog.total > 0 ? Math.round((prog.unlocked / prog.total) * 100) : 0;
  const rank = getHighestLicense(state.licenses);
  const nextClaim = ACHIEVEMENTS.find((a) => {
    const ach = state.achievements || { unlocked: {}, claimed: {} };
    return ach.unlocked?.[a.id] && !ach.claimed?.[a.id];
  });
  const nextReward = unclaimed > 0
    ? (nextClaim ? `$${nextClaim.reward.toLocaleString()}` : `$${unclaimed.toLocaleString()}`)
    : '—';

  setText('ach-progress-pct', `${pct}%`);
  setText('ach-kpi-unlocked', String(prog.unlocked));
  setText('ach-kpi-reward', nextReward);
  setText('ach-kpi-tier', rank.name);
  setText('ach-progress', `${prog.unlocked} / ${prog.total} unlocked${unclaimed ? ` · $${unclaimed.toLocaleString()} unclaimed` : ''}`);

  const arc = document.getElementById('ach-progress-arc');
  if (arc) {
    const offset = RING_C * (1 - Math.max(0, Math.min(1, pct / 100)));
    arc.style.strokeDasharray = `${RING_C}`;
    arc.style.strokeDashoffset = `${offset}`;
  }
}

/**
 * Ownership fingerprint — rebuild only when unlock/claim sets change.
 * @param {object} ach
 */
function achievementsStructureKey(ach) {
  const unlocked = Object.keys(ach.unlocked || {}).sort().join(',');
  const claimed = Object.keys(ach.claimed || {}).sort().join(',');
  return `${unlocked}|${claimed}|${ACHIEVEMENTS.length}`;
}

/**
 * @returns {HTMLElement}
 */
function ensureAchTip() {
  let tip = document.getElementById('ach-cursor-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'ach-cursor-tip';
    tip.className = 'ach-cursor-tip';
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
    document.body.appendChild(tip);
  }
  return tip;
}

function hideAchTip() {
  tipVisible = false;
  const tip = document.getElementById('ach-cursor-tip');
  if (tip) {
    tip.hidden = true;
    tip.classList.remove('is-on');
    delete tip.dataset.forId;
  }
}

function scheduleTipMove() {
  if (tipRaf) return;
  tipRaf = requestAnimationFrame(() => {
    tipRaf = 0;
    const tip = document.getElementById('ach-cursor-tip');
    if (!tip || !tipVisible) return;
    const pad = 14;
    const tw = tip.offsetWidth || 220;
    const th = tip.offsetHeight || 80;
    let x = tipX + pad;
    let y = tipY + pad;
    if (x + tw > window.innerWidth - 8) x = tipX - tw - pad;
    if (y + th > window.innerHeight - 8) y = tipY - th - pad;
    tip.style.transform = `translate3d(${Math.max(8, x)}px, ${Math.max(8, y)}px, 0)`;
  });
}

/**
 * @param {HTMLElement} grid
 */
function ensureAchGridInteractions(grid) {
  if (grid.dataset.achBound === '1') return;
  grid.dataset.achBound = '1';

  grid.addEventListener('click', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const btn = t.closest?.('.claim-btn');
    if (!btn || !grid.contains(btn)) return;
    e.preventDefault();
    e.stopPropagation();
    const id = btn.getAttribute('data-ach');
    if (id) achUiState?.onClaimAchievement?.(id);
  });

  grid.addEventListener('pointerover', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const card = t.closest?.('.ach-card');
    if (!card || !grid.contains(card)) return;
    const tip = ensureAchTip();
    const id = card.getAttribute('data-ach-id') || '';
    // Avoid rewriting tip HTML on every child enter (icon → name → foot).
    if (tip.dataset.forId !== id) {
      tip.dataset.forId = id;
      const name = card.getAttribute('data-ach-name') || '';
      const desc = card.getAttribute('data-ach-desc') || '';
      const reward = card.getAttribute('data-ach-reward') || '';
      tip.innerHTML = `
        <strong class="ach-cursor-tip-name">${escapeHtml(name)}</strong>
        <span class="ach-cursor-tip-desc">${escapeHtml(desc)}</span>
        ${reward ? `<span class="ach-cursor-tip-reward">${escapeHtml(reward)}</span>` : ''}
      `;
    }
    tipVisible = true;
    tip.hidden = false;
    tip.classList.add('is-on');
    tipX = e.clientX;
    tipY = e.clientY;
    scheduleTipMove();
  });

  grid.addEventListener('pointermove', (e) => {
    if (!tipVisible) return;
    const t = /** @type {HTMLElement} */ (e.target);
    if (!t.closest?.('.ach-card')) return;
    tipX = e.clientX;
    tipY = e.clientY;
    scheduleTipMove();
  });

  grid.addEventListener('pointerout', (e) => {
    const related = /** @type {HTMLElement | null} */ (e.relatedTarget);
    if (related && grid.contains(related) && related.closest?.('.ach-card')) return;
    hideAchTip();
  });

  grid.addEventListener('pointerleave', () => hideAchTip());
}

/**
 * @param {object} ach
 * @param {{ id: string, name: string, desc: string, reward: number, tier: string }} a
 * @param {string} tier
 */
function cardHtml(ach, a, tier) {
  const unlocked = !!ach.unlocked[a.id];
  const claimed = !!ach.claimed[a.id];
  const prestige = ['gold', 'platinum', 'diamond', 'master'].includes(tier) ? ' prestige' : '';
  const category = achievementCategory(a);
  const reward = `$${a.reward.toLocaleString()}`;
  return `
    <article class="ach-card ${unlocked ? 'unlocked' : 'locked'} ${claimed ? 'claimed' : ''} tier-${tier}${prestige}"
      data-ach-id="${escapeAttr(a.id)}"
      data-ach-name="${escapeAttr(a.name)}"
      data-ach-desc="${escapeAttr(a.desc)}"
      data-ach-reward="${escapeAttr(reward)}">
      <div class="ach-icon">${achievementBadgeSvg(tier, { unlocked, category })}</div>
      <div class="ach-name">${escapeHtml(a.name)}</div>
      <div class="ach-card-foot">
        <span class="ach-reward">${reward}</span>
        ${claimed ? '<span class="ach-claimed">Claimed</span>'
          : unlocked ? `<button type="button" class="btn btn-accent btn-sm claim-btn" data-ach="${escapeAttr(a.id)}">Claim</button>`
          : '<span class="ach-locked">Locked</span>'}
      </div>
    </article>`;
}

/**
 * @param {object} state
 */
export function renderAchievements(state) {
  achUiState = state;
  const ach = state.achievements || { unlocked: {}, claimed: {} };
  const prog = getAchievementProgress(ach);
  const unclaimed = getUnclaimedTotal(ach);

  const badge = document.getElementById('ach-badge');
  if (badge) {
    const n = ACHIEVEMENTS.filter((a) => ach.unlocked[a.id] && !ach.claimed[a.id]).length;
    badge.textContent = n ? String(n) : '';
  }

  updateProgressPanel(state, prog, unclaimed);

  const claimAll = document.getElementById('btn-claim-all');
  if (claimAll) {
    claimAll.textContent = unclaimed ? `Claim all ($${unclaimed.toLocaleString()})` : 'Claim all';
    claimAll.disabled = !unclaimed;
  }

  const grid = document.getElementById('achievements-grid');
  if (!grid) return;

  ensureAchGridInteractions(grid);

  const view = document.getElementById('view-achievements');
  const force = grid.dataset.achForce === '1';
  if (force) delete grid.dataset.achForce;
  if (!force && view && !view.classList.contains('active') && grid.childElementCount > 0) {
    return;
  }

  const key = achievementsStructureKey(ach);
  if (!force && key === achievementsSnap && grid.childElementCount > 0) {
    return;
  }

  const emptyBanner = prog.unlocked === 0
    ? '<div class="empty-state-banner">No achievements yet — trade, hire staff, and grow equity to climb Bronze → Master.</div>'
    : '';

  grid.innerHTML = emptyBanner + ACHIEVEMENT_TIERS.map((tierMeta) => {
    const tier = tierMeta.id;
    const list = ACHIEVEMENTS.filter((a) => a.tier === tier);
    if (!list.length) return '';
    const unlockedCount = list.filter((a) => ach.unlocked[a.id]).length;
    const roman = TIER_ROMAN[tier] || '';
    return `
      <section class="ach-tier-block tier-${tier}">
        <div class="ach-tier-head">
          <div class="ach-tier-rule" aria-hidden="true"></div>
          <div class="ach-tier-label-wrap">
            <span class="ach-tier-roman">Tier ${roman}</span>
            <div class="ach-tier-title">${escapeHtml(tierMeta.label)}</div>
            <div class="ach-tier-blurb">${escapeHtml(tierMeta.blurb)} · ${unlockedCount} / ${list.length}</div>
          </div>
          <div class="ach-tier-rule" aria-hidden="true"></div>
        </div>
        <div class="ach-cards">
          ${list.map((a) => cardHtml(ach, a, tier)).join('')}
        </div>
      </section>`;
  }).join('');

  achievementsSnap = key;
  hideAchTip();
}
