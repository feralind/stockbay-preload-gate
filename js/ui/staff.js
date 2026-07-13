// @ts-check
/**
 * Staff view render — extracted from ui.js (Phase 2).
 */

import {
  STAFF_ROLES, STAFF_TIERS, STAFF_DEFAULT_MAX_POSITION_PCT,
  getDailySalary, canHire, getMaxStaff, getTier, canTrain, staffWinRate,
} from '../staff.js';
import { trapFocus } from '../overlays.js';
import { escapeHtml } from './shared.js';

const LANE_LABEL = {
  ops: 'Ops',
  insight: 'Insight',
  buy: 'Buy',
  sell: 'Sell',
  short: 'Short',
  lead: 'Lead',
};

function laneChip(lane) {
  const label = LANE_LABEL[lane] || 'Desk';
  return `<span class="hire-lane hire-lane-${escapeHtml(lane || 'ops')}">${escapeHtml(label)}</span>`;
}

export function renderStaff(state) {
  const maxSlots = getMaxStaff(state);
  const hasHr = state.perks.includes('hrDept');
  const salary = getDailySalary(state.staff || []);
  const count = (state.staff || []).length;
  const sizePct = Math.round(STAFF_DEFAULT_MAX_POSITION_PCT * 100);

  const badge = document.getElementById('staff-badge');
  if (badge) badge.textContent = count ? String(count) : '';

  const hrChip = document.getElementById('staff-hr-status');
  if (hrChip) {
    hrChip.className = `staff-hr-chip ${hasHr ? 'is-active' : 'is-locked'}`;
    hrChip.innerHTML = `
      <span class="staff-hr-lbl">HR Department</span>
      <span class="staff-hr-val">${hasHr ? 'Unlocked' : 'Locked'}</span>
      <span class="staff-kpi-hint">${hasHr ? `${count}/${maxSlots} seats filled` : 'Perks · $400 · Newcomer'}</span>`;
  }

  const statsEl = document.getElementById('staff-stats');
  if (statsEl) {
    const profit = (state.staff || []).reduce((s, m) => s + (m.profitGenerated || 0), 0);
    const mistakes = (state.staff || []).reduce((s, m) => s + (m.mistakes || 0), 0);
    const plCls = profit >= 0 ? 'up' : 'down';
    const sellers = (state.staff || []).filter((s) => {
      const lane = STAFF_ROLES[s.roleId]?.lane;
      return s.active && (lane === 'sell' || s.roleId === 'risk' || s.roleId === 'exitSpec');
    }).length;
    statsEl.className = 'staff-kpi-strip';
    statsEl.innerHTML = `
      <div class="staff-kpi">
        <span class="staff-kpi-lbl">Headcount</span>
        <span class="staff-kpi-val">${count}<span class="staff-kpi-den"> / ${maxSlots}</span></span>
        <span class="staff-kpi-hint">${state.perks.includes('tradingFloor') ? 'Trading Floor cap' : 'Base cap · Floor → 8'}</span>
      </div>
      <div class="staff-kpi">
        <span class="staff-kpi-lbl">Payroll</span>
        <span class="staff-kpi-val">$${salary.toLocaleString()}</span>
        <span class="staff-kpi-hint">per game day${state.perks.includes('hedgeFund') ? ' · HF covers 50%' : ''}</span>
      </div>
      <div class="staff-kpi">
        <span class="staff-kpi-lbl">Staff P&amp;L</span>
        <span class="staff-kpi-val ${plCls}">${profit >= 0 ? '+' : ''}$${Math.round(profit).toLocaleString()}</span>
        <span class="staff-kpi-hint">Lifetime from desk actions</span>
      </div>
      <div class="staff-kpi">
        <span class="staff-kpi-lbl">Discipline</span>
        <span class="staff-kpi-val">${sizePct}%</span>
        <span class="staff-kpi-hint">${sellers ? `${sellers} exit seat${sellers === 1 ? '' : 's'} · ` : ''}max equity / name</span>
      </div>`;
  }

  const rosterCount = document.getElementById('roster-count');
  if (rosterCount) rosterCount.textContent = count ? `(${count})` : '';

  const roster = document.getElementById('staff-roster');
  if (roster) {
    if (!state.staff?.length) {
      const emptyHint = hasHr
        ? 'Hire a buyer (Scout / Trader) and a seller (Exit Specialist / Risk Manager) so the firm both enters and exits.'
        : 'Unlock <strong>HR Department</strong> in Perks ($400 · Newcomer, needs Pro Scanner), then hire your first seat.';
      roster.innerHTML = `
        <div class="roster-empty">
          <div class="roster-empty-title">Empty team board</div>
          <p class="roster-empty-copy">${emptyHint}</p>
          <div class="roster-empty-slots" aria-hidden="true">
            <div class="roster-slot-ghost"></div>
            <div class="roster-slot-ghost"></div>
            <div class="roster-slot-ghost"></div>
          </div>
        </div>`;
    } else {
      roster.innerHTML = state.staff.map(s => {
        const role = STAFF_ROLES[s.roleId];
        const tier = getTier(s);
        const train = canTrain(s.id, state);
        const pl = s.profitGenerated || 0;
        const wr = staffWinRate(s);
        const wrTxt = wr != null ? `${Math.round(wr * 100)}% win` : 'no closes yet';
        const prog = Math.round(s.progress || 0);
        return `
          <div class="roster-row" style="--role-color:${role?.color || '#58a6ff'}">
            <div class="role-mark" style="background:${role?.color || '#58a6ff'}">${role?.mark || 'ST'}</div>
            <div class="roster-main">
              <div class="roster-name-row">
                <strong class="roster-name">${escapeHtml(s.name)}</strong>
                <button class="btn-icon-tiny rename-btn" data-rename="${s.id}" title="Rename">✎</button>
                <span class="tier-badge tier-${s.tier || 'newbie'}">${escapeHtml(tier.name)}</span>
                ${role?.lane ? laneChip(role.lane) : ''}
              </div>
              <div class="roster-role">${escapeHtml(role?.name || s.roleId)}${role?.automates ? ` · ${escapeHtml(role.automates)}` : ''}</div>
              <div class="roster-status">${escapeHtml(s.status || 'Ready')}</div>
              <div class="roster-bar"><div class="roster-bar-fill" style="width:${prog}%"></div></div>
            </div>
            <div class="roster-side">
              <div class="roster-pnl ${pl >= 0 ? 'up' : 'down'}">${pl >= 0 ? '+' : ''}$${Math.round(pl).toLocaleString()}</div>
              <div class="roster-meta">${wrTxt} · ${s.actionsToday || 0} acts · ${s.mistakes || 0} errs</div>
              ${train.ok
                ? `<button type="button" class="btn btn-accent btn-sm train-btn" data-train="${s.id}">Train $${train.cost} → ${STAFF_TIERS[train.next].name}</button>`
                : (tier.next
                  ? `<span class="hire-lock">${train.msg}</span>`
                  : `<span class="tier-max">MAX</span>`)}
              <div class="roster-actions">
                <button class="btn-sm history-btn" data-history="${s.id}" title="History">Log</button>
                <button class="btn-sm btn-fire" data-fire="${s.id}" title="Fire">Fire</button>
              </div>
            </div>
          </div>`;
      }).join('');

      roster.querySelectorAll('.btn-fire').forEach(btn => {
        btn.onclick = () => state.onFireStaff?.(btn.dataset.fire);
      });
      roster.querySelectorAll('.train-btn').forEach(btn => {
        btn.onclick = () => state.onTrainStaff?.(btn.dataset.train);
      });
      roster.querySelectorAll('.history-btn').forEach(btn => {
        btn.onclick = () => showStaffHistory(btn.dataset.history, state);
      });
      roster.querySelectorAll('.rename-btn').forEach(btn => {
        btn.onclick = () => {
          const m = state.staff.find(x => x.id === btn.dataset.rename);
          const name = prompt('Rename employee:', m?.name || '');
          if (name) state.onRenameStaff?.(btn.dataset.rename, name);
        };
      });
    }
  }

  const hireList = document.getElementById('staff-hire-list');
  if (hireList) {
    hireList.innerHTML = Object.values(STAFF_ROLES).map(role => {
      const check = canHire(role.id, { ...state, staff: state.staff || [] });
      const owned = (state.staff || []).filter(s => s.roleId === role.id).length;
      const lockReason = !hasHr
        ? 'Requires HR Department'
        : (check.ok ? '' : check.msg);
      return `
        <article class="hire-card ${check.ok ? 'available' : 'locked'}" style="--role-color:${role.color}">
          <header class="hire-card-head">
            <span class="role-mark" style="background:${role.color}">${role.mark}</span>
            <div class="hire-head-text">
              <div class="hire-name-row">
                <div class="hire-name">${escapeHtml(role.name)}</div>
                ${laneChip(role.lane)}
              </div>
              <div class="hire-title">${escapeHtml(role.title)}</div>
            </div>
          </header>
          <p class="hire-desc">${escapeHtml(role.desc)}</p>
          <dl class="hire-brief">
            <div><dt>Does</dt><dd>${escapeHtml(role.does || role.automates || '—')}</dd></div>
            <div><dt>Never</dt><dd>${escapeHtml(role.never || '—')}</dd></div>
            <div><dt>Rules</dt><dd>${escapeHtml(role.rules || '—')}</dd></div>
          </dl>
          <div class="hire-footer">
            <div class="hire-cost-row">
              <span class="hire-cost">$${role.hireCost.toLocaleString()} hire</span>
              <span class="hire-salary">$${role.salary}/day</span>
              ${owned ? `<span class="hire-owned">${owned} on roster</span>` : ''}
            </div>
            ${check.ok
              ? `<button type="button" class="btn btn-accent btn-sm hire-btn" data-role="${role.id}">Hire</button>`
              : `<span class="hire-lock-pill" title="${escapeHtml(lockReason)}">${escapeHtml(lockReason || 'Locked')}</span>`}
          </div>
        </article>`;
    }).join('');
    hireList.querySelectorAll('.hire-btn').forEach(btn => {
      btn.onclick = () => state.onHireStaff?.(btn.dataset.role);
    });
  }

  const logEl = document.getElementById('staff-log');
  if (logEl) {
    const logs = state.staffLog || [];
    logEl.innerHTML = logs.length
      ? logs.slice(0, 20).map(l => `
          <div class="staff-log-entry">
            <span class="log-time">${new Date(l.time).toLocaleTimeString()}</span>
            <strong>${escapeHtml(l.staff || 'System')}</strong>: ${escapeHtml(l.action || l.msg || '')}
          </div>`).join('')
      : '<div class="empty">Staff activity will appear here…</div>';
  }
}

export function showStaffHistory(staffId, state) {
  const m = state.staff.find(s => s.id === staffId);
  const overlay = document.getElementById('staff-history-overlay');
  const title = document.getElementById('staff-history-title');
  const body = document.getElementById('staff-history-body');
  if (!m || !overlay) return;
  title.textContent = `${m.name} — action log`;
  const hist = m.history || [];
  body.innerHTML = hist.length
    ? hist.map(h => `<div class="staff-log-entry"><span class="log-time">${new Date(h.time).toLocaleTimeString()}</span>${escapeHtml(h.action || '')}</div>`).join('')
    : '<div class="empty">No actions logged yet.</div>';
  overlay.classList.remove('hidden');
  trapFocus(overlay);
}
