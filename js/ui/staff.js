// @ts-check
/**
 * Staff view render — extracted from ui.js (Phase 2).
 */

import {
  STAFF_ROLES, STAFF_TIERS, getDailySalary, canHire, getMaxStaff, getTier, canTrain, staffWinRate,
} from '../staff.js';
import { trapFocus } from '../overlays.js';
import { escapeHtml } from './shared.js';

export function renderStaff(state) {
  const maxSlots = getMaxStaff(state);
  const hasHr = state.perks.includes('hrDept');
  const salary = getDailySalary(state.staff || []);
  const count = (state.staff || []).length;

  const badge = document.getElementById('staff-badge');
  if (badge) badge.textContent = count ? String(count) : '';

  const hrChip = document.getElementById('staff-hr-status');
  if (hrChip) {
    hrChip.className = `staff-hr-chip ${hasHr ? 'is-active' : 'is-locked'}`;
    hrChip.innerHTML = `
      <span class="staff-hr-lbl">HR Department</span>
      <span class="staff-hr-val">${hasHr ? 'Unlocked' : 'Locked'}</span>
      <span class="staff-kpi-hint">${hasHr ? `${count}/${maxSlots} seats filled` : 'Buy perk in Perks · $400 · Newcomer'}</span>`;
  }

  const statsEl = document.getElementById('staff-stats');
  if (statsEl) {
    const profit = (state.staff || []).reduce((s, m) => s + (m.profitGenerated || 0), 0);
    const mistakes = (state.staff || []).reduce((s, m) => s + (m.mistakes || 0), 0);
    const plCls = profit >= 0 ? 'up' : 'down';
    statsEl.className = 'staff-kpi-strip';
    statsEl.innerHTML = `
      <div class="staff-kpi">
        <span class="staff-kpi-lbl">Headcount</span>
        <span class="staff-kpi-val">${count}<span style="font-size:13px;color:var(--muted);font-weight:600"> / ${maxSlots}</span></span>
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
        <span class="staff-kpi-lbl">Mistakes</span>
        <span class="staff-kpi-val">${mistakes}</span>
        <span class="staff-kpi-hint">${(state.staff || []).some(s => s.roleId === 'compliance' && s.active) ? 'Compliance active' : 'Train or hire Compliance'}</span>
      </div>`;
  }

  const rosterCount = document.getElementById('roster-count');
  if (rosterCount) rosterCount.textContent = count ? `(${count})` : '';

  const roster = document.getElementById('staff-roster');
  if (roster) {
    if (!state.staff?.length) {
      const emptyHint = hasHr
        ? 'Open roles below — start with an Intern or Listing Scout, then specialize.'
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
      const reqHint = !hasHr
        ? 'Unlock HR Department perk first'
        : (check.ok ? '' : check.msg);
      return `
        <div class="hire-card ${check.ok ? 'available' : 'locked'}" style="--role-color:${role.color}">
          <span class="role-mark" style="background:${role.color}">${role.mark}</span>
          <div class="hire-body">
            <div class="hire-name">${role.name}</div>
            <div class="hire-title">${role.title}</div>
            <div class="hire-desc">${role.desc}</div>
            <div class="hire-automates">${role.automates || 'Desk support'}</div>
            <div class="hire-cost-row">
              <span class="hire-cost">$${role.hireCost.toLocaleString()} hire</span>
              <span class="hire-salary">$${role.salary}/day</span>
              ${owned ? `<span class="hire-owned">${owned} on roster</span>` : ''}
            </div>
          </div>
          <div class="hire-actions">
            ${check.ok
              ? `<button type="button" class="btn btn-accent btn-sm hire-btn" data-role="${role.id}">Hire</button>`
              : `<span class="hire-lock">${reqHint}</span>`}
          </div>
        </div>`;
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
