// @ts-check
/**
 * Achievements view render — extracted from ui.js (Phase 2).
 * Domain logic stays in ../achievements.js; this is DOM only.
 */

import {
  ACHIEVEMENTS, ACHIEVEMENT_TIERS, getAchievementProgress, getUnclaimedTotal,
  achievementBadgeSvg, achievementCategory,
} from '../achievements.js';

export function renderAchievements(state) {
  const ach = state.achievements || { unlocked: {}, claimed: {} };
  const prog = getAchievementProgress(ach);
  const unclaimed = getUnclaimedTotal(ach);

  const badge = document.getElementById('ach-badge');
  if (badge) {
    const n = ACHIEVEMENTS.filter(a => ach.unlocked[a.id] && !ach.claimed[a.id]).length;
    badge.textContent = n ? String(n) : '';
  }

  const progEl = document.getElementById('ach-progress');
  if (progEl) {
    progEl.textContent = `${prog.unlocked} / ${prog.total} unlocked${unclaimed ? ` · $${unclaimed.toLocaleString()} unclaimed` : ''}`;
  }

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
    const list = ACHIEVEMENTS.filter(a => a.tier === tier);
    if (!list.length) return '';
    const unlockedCount = list.filter(a => ach.unlocked[a.id]).length;
    return `
      <div class="ach-tier-block tier-${tier}">
        <div class="ach-tier-head">
          <div class="ach-tier-badge" aria-hidden="true">${achievementBadgeSvg(tier, { unlocked: true, category: 'trade' })}</div>
          <div>
            <div class="ach-tier-title">${tierMeta.label}</div>
            <div class="ach-tier-blurb">${tierMeta.blurb} · ${unlockedCount} / ${list.length}</div>
          </div>
        </div>
        <div class="ach-cards">
          ${list.map(a => {
            const unlocked = !!ach.unlocked[a.id];
            const claimed = !!ach.claimed[a.id];
            const prestige = ['gold', 'platinum', 'diamond', 'master'].includes(tier) ? ' prestige' : '';
            const category = achievementCategory(a);
            return `
              <div class="ach-card ${unlocked ? 'unlocked' : 'locked'} ${claimed ? 'claimed' : ''} tier-${tier}${prestige}">
                <div class="ach-icon">${achievementBadgeSvg(tier, { unlocked, category })}</div>
                <div class="ach-body">
                  <div class="ach-name">${a.name}</div>
                  <div class="ach-desc">${a.desc}</div>
                  <div class="ach-reward">Reward: $${a.reward.toLocaleString()}</div>
                </div>
                <div class="ach-status">
                  <span class="ach-tier-label">${tierMeta.label}${unlocked ? '' : ' LOCKED'}</span>
                  ${claimed ? '<span class="ach-claimed">✓ CLAIMED</span>'
                    : unlocked ? `<button type="button" class="btn btn-accent btn-sm claim-btn" data-ach="${a.id}">Claim $${a.reward.toLocaleString()}</button>`
                    : '<span class="ach-locked">LOCKED</span>'}
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }).join('');

  grid.querySelectorAll('.claim-btn').forEach(btn => {
    btn.onclick = () => state.onClaimAchievement?.(btn.dataset.ach);
  });
}
