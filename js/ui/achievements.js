// @ts-check
/**
 * Achievements view render — extracted from ui.js (Phase 2).
 * Domain logic stays in ../achievements.js; this is DOM only.
 */

import {
  ACHIEVEMENTS, ACHIEVEMENT_TIERS, getAchievementProgress, getUnclaimedTotal,
  achievementBadgeSvg, achievementCategory,
} from '../achievements.js';
import { getRepRank } from '../config.js';
import { escapeHtml } from './shared.js';

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

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function updateProgressPanel(state, prog, unclaimed) {
  const pct = prog.total > 0 ? Math.round((prog.unlocked / prog.total) * 100) : 0;
  const rank = getRepRank(state.meta?.reputation || 0);
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

export function renderAchievements(state) {
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
          ${list.map((a) => {
            const unlocked = !!ach.unlocked[a.id];
            const claimed = !!ach.claimed[a.id];
            const prestige = ['gold', 'platinum', 'diamond', 'master'].includes(tier) ? ' prestige' : '';
            const category = achievementCategory(a);
            return `
              <article class="ach-card ${unlocked ? 'unlocked' : 'locked'} ${claimed ? 'claimed' : ''} tier-${tier}${prestige}" title="${escapeHtml(a.desc)}">
                <div class="ach-icon">${achievementBadgeSvg(tier, { unlocked, category })}</div>
                <div class="ach-name">${escapeHtml(a.name)}</div>
                <div class="ach-card-foot">
                  <span class="ach-reward">$${a.reward.toLocaleString()}</span>
                  ${claimed ? '<span class="ach-claimed">Claimed</span>'
                    : unlocked ? `<button type="button" class="btn btn-accent btn-sm claim-btn" data-ach="${a.id}">Claim</button>`
                    : '<span class="ach-locked">Locked</span>'}
                </div>
              </article>`;
          }).join('')}
        </div>
      </section>`;
  }).join('');

  grid.querySelectorAll('.claim-btn').forEach((btn) => {
    btn.onclick = () => state.onClaimAchievement?.(btn.dataset.ach);
  });
}
