// @ts-check
/**
 * Staff / HR Compact Console — Overview · Roster · Hire · Payroll
 */

import {
  STAFF_ROLES, STAFF_TIERS, STAFF_DEFAULT_MAX_POSITION_PCT,
  STAFF_BUY_LANES, STAFF_SELL_LANES, STAFF_HIRE_AMORT_DAYS,
  getDailySalary, getHireSunk, getStaffCoverage, getNextHireRecommendation,
  canHire, getMaxStaff, getTier, canTrain, staffWinRate,
} from '../staff.js';
import { trapFocus } from '../overlays.js';
import { escapeHtml } from './shared.js';

const LANE_LABEL = {
  ops: 'Ops',
  insight: 'Insight',
  buy: 'Buy Side',
  sell: 'Sell Side',
  short: 'Short Desk',
  lead: 'Lead',
};

/** @type {'overview' | 'roster' | 'hire' | 'payroll'} */
let activeStaffTab = 'overview';
let tabsBound = false;

function laneChip(lane) {
  const label = LANE_LABEL[lane] || 'Desk';
  const key = lane || 'ops';
  return `<span class="hire-lane hire-lane-${escapeHtml(key)}">${escapeHtml(label)}</span>`;
}

function deskLabel(lane) {
  if (STAFF_BUY_LANES.has(lane)) return 'Buy Side';
  if (STAFF_SELL_LANES.has(lane)) return 'Sell Side';
  return LANE_LABEL[lane] || 'Desk';
}

function memberDayPay(member) {
  const role = STAFF_ROLES[member.roleId];
  const tierMult = member.tier === 'expert' ? 1.25 : member.tier === 'veteran' ? 1.1 : 1;
  return Math.round((role?.salary || 0) * tierMult);
}

/** Thin activity sparkline — seeded from progress + actions, not a chunky bar. */
function activitySpark(progress, actionsToday) {
  const p = Math.max(0, Math.min(100, Number(progress) || 0));
  const a = Math.min(8, Number(actionsToday) || 0);
  const pts = [];
  for (let i = 0; i < 7; i++) {
    const wobble = ((p + a * 11 + i * 17) % 23) - 11;
    const y = 14 - Math.max(2, Math.min(12, (p / 100) * 10 + wobble * 0.15 + a * 0.4));
    pts.push(`${2 + i * 6},${y.toFixed(1)}`);
  }
  return `<svg class="hr-spark" viewBox="0 0 40 16" width="40" height="16" aria-hidden="true"><polyline fill="none" stroke="currentColor" stroke-width="1.5" points="${pts.join(' ')}"/></svg>`;
}

function coveragePctForMember(member, coverage) {
  const lane = STAFF_ROLES[member.roleId]?.lane;
  if (STAFF_BUY_LANES.has(lane)) return coverage.buy.pct;
  if (STAFF_SELL_LANES.has(lane)) return coverage.sell.pct;
  return Math.round((coverage.buy.pct + coverage.sell.pct) / 2);
}

function setStaffTab(tab) {
  activeStaffTab = tab;
  document.querySelectorAll('.hr-tab').forEach((btn) => {
    const on = btn.getAttribute('data-staff-tab') === tab;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('[data-staff-panel]').forEach((panel) => {
    const on = panel.getAttribute('data-staff-panel') === tab;
    panel.classList.toggle('hidden', !on);
    if (on) panel.removeAttribute('hidden');
    else panel.setAttribute('hidden', '');
  });
}

function bindStaffTabsOnce() {
  if (tabsBound) return;
  const tabs = document.getElementById('staff-tabs');
  if (!tabs) return;
  tabsBound = true;
  tabs.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('[data-staff-tab]');
    if (!btn) return;
    setStaffTab(btn.getAttribute('data-staff-tab'));
  });
  document.getElementById('view-staff')?.addEventListener('click', (e) => {
    const goto = e.target?.closest?.('[data-staff-goto]');
    if (!goto) return;
    setStaffTab(goto.getAttribute('data-staff-goto'));
  });
}

function payrollSubsidyNote(state, gross) {
  if (!gross) return 'No active payroll';
  const parts = [];
  if (state.perks.includes('hedgeFund')) parts.push('HF 50%');
  if (state.perks.includes('legendDesk')) parts.push('Legend +10%');
  return parts.length ? `Subsidies: ${parts.join(' · ')}` : 'No payroll subsidy';
}

function effectiveDailyCost(state, gross) {
  if (gross <= 0) return 0;
  let subsidy = 0;
  if (state.perks?.includes('hedgeFund')) subsidy = Math.floor(gross * 0.5);
  if (state.perks?.includes('legendDesk')) subsidy = Math.min(gross, subsidy + Math.floor(gross * 0.1));
  return gross - subsidy;
}

function renderOverviewCards(state, coverage, salary, hireSunk, amort) {
  const cards = document.getElementById('staff-overview-cards');
  if (!cards) return;
  const burn = salary + amort;
  const rec = getNextHireRecommendation(state);
  const role = rec ? STAFF_ROLES[rec.roleId] : null;

  cards.innerHTML = `
    <article class="hr-card hr-card-burn">
      <div class="hr-card-lbl">Burn (Payroll / Day)</div>
      <div class="hr-card-val">$${burn.toLocaleString()}</div>
      <div class="hr-burn-rows">
        <div class="hr-burn-row">
          <span>Hire sunk (one-time)</span>
          <strong>$${hireSunk.toLocaleString()}</strong>
        </div>
        <div class="hr-burn-row muted">
          <span>Amortized / ${STAFF_HIRE_AMORT_DAYS}d</span>
          <span>$${amort.toLocaleString()}/day</span>
        </div>
        <div class="hr-burn-row">
          <span>Daily payroll (recurring)</span>
          <strong>$${salary.toLocaleString()}/day</strong>
        </div>
      </div>
    </article>
    <article class="hr-card hr-card-coverage">
      <div class="hr-card-lbl">Coverage</div>
      <div class="hr-cov-block">
        <div class="hr-cov-head"><span>Buy Coverage</span><span>${coverage.buy.pct}% · ${coverage.buy.active}/${coverage.buy.required}</span></div>
        <div class="hr-cov-track"><div class="hr-cov-fill" style="width:${coverage.buy.pct}%"></div></div>
      </div>
      <div class="hr-cov-block">
        <div class="hr-cov-head"><span>Sell Coverage</span><span>${coverage.sell.pct}% · ${coverage.sell.active}/${coverage.sell.required}</span></div>
        <div class="hr-cov-track"><div class="hr-cov-fill" style="width:${coverage.sell.pct}%"></div></div>
      </div>
      <p class="hr-card-foot">Coverage = Active staff / Required staff</p>
    </article>
    <article class="hr-card hr-card-next">
      <div class="hr-card-lbl">Next Hire Recommendation</div>
      ${role ? `
        <div class="hr-next-role">${escapeHtml(role.name)} <span class="hr-next-lane">(${escapeHtml(deskLabel(role.lane))})</span></div>
        <div class="hr-next-line"><span class="hr-next-k">Reason</span> ${escapeHtml(rec.reason)}</div>
        <div class="hr-next-line"><span class="hr-next-k">Impact</span> ${escapeHtml(rec.impact)}</div>
        <div class="hr-next-actions">
          <button type="button" class="btn btn-sm hr-view-role" data-staff-goto="hire" data-focus-role="${escapeHtml(role.id)}">View Role</button>
        </div>
      ` : `<p class="hr-card-foot">No recommendation — desk is full or balanced.</p>`}
    </article>`;
}

function renderRosterTable(state, coverage, { targetId, limit }) {
  const el = document.getElementById(targetId);
  if (!el) return;
  const staff = state.staff || [];
  if (!staff.length) {
    const hasHr = state.perks.includes('hrDept');
    el.innerHTML = `
      <div class="roster-empty">
        <div class="roster-empty-title">Empty team board</div>
        <p class="roster-empty-copy">${hasHr
          ? 'Hire a buyer and a seller so the firm both enters and exits.'
          : 'Unlock <strong>HR Department</strong> in Perks, then hire your first seat.'}</p>
      </div>`;
    return;
  }
  const rows = (limit ? staff.slice(0, limit) : staff).map((s) => {
    const role = STAFF_ROLES[s.roleId];
    const prog = Math.round(s.progress || 0);
    const pay = memberDayPay(s);
    const cov = coveragePctForMember(s, coverage);
    return `
      <tr class="hr-tr" style="--role-color:${role?.color || '#58a6ff'}">
        <td class="hr-td-emp">
          <span class="role-mark sm" style="background:${role?.color || '#58a6ff'}">${role?.mark || 'ST'}</span>
          <span class="hr-emp-name">${escapeHtml(s.name)}</span>
        </td>
        <td>${escapeHtml(role?.name || s.roleId)}</td>
        <td>${escapeHtml(deskLabel(role?.lane))}</td>
        <td class="hr-td-act">
          <span class="hr-act-pct">${prog}%</span>
          ${activitySpark(prog, s.actionsToday)}
        </td>
        <td>${cov}%</td>
        <td class="hr-td-num">$${pay.toLocaleString()}</td>
      </tr>`;
  }).join('');

  el.innerHTML = `
    <table class="hr-table">
      <thead>
        <tr>
          <th>Employee</th><th>Role</th><th>Desk</th><th>Activity</th><th>Coverage</th><th>Payroll / Day</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${limit && staff.length > limit
      ? `<div class="hr-table-foot">${Math.min(limit, staff.length)} of ${staff.length}</div>`
      : ''}`;
}

function renderFullRoster(state, coverage) {
  const roster = document.getElementById('staff-roster');
  if (!roster) return;
  const staff = state.staff || [];
  const countEl = document.getElementById('roster-count-full');
  if (countEl) countEl.textContent = staff.length ? `(${staff.length})` : '';

  if (!staff.length) {
    const hasHr = state.perks.includes('hrDept');
    roster.innerHTML = `
      <div class="roster-empty">
        <div class="roster-empty-title">Empty team board</div>
        <p class="roster-empty-copy">${hasHr
          ? 'Hire a buyer (Scout / Trader) and a seller (Exit Specialist / Risk Manager).'
          : 'Unlock <strong>HR Department</strong> in Perks ($400 · Newcomer), then hire.'}</p>
      </div>`;
    return;
  }

  roster.innerHTML = staff.map((s) => {
    const role = STAFF_ROLES[s.roleId];
    const tier = getTier(s);
    const train = canTrain(s.id, state);
    const pl = s.profitGenerated || 0;
    const wr = staffWinRate(s);
    const wrTxt = wr != null ? `${Math.round(wr * 100)}% win` : 'no closes yet';
    const prog = Math.round(s.progress || 0);
    const pay = memberDayPay(s);
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
          <div class="roster-role">${escapeHtml(role?.name || s.roleId)} · ${escapeHtml(deskLabel(role?.lane))}</div>
          <div class="roster-status">${escapeHtml(s.status || 'Ready')} · $${pay}/day</div>
          <div class="roster-act-row">
            <span class="hr-act-pct">${prog}%</span>
            ${activitySpark(prog, s.actionsToday)}
            <span class="roster-meta">activity</span>
          </div>
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

  roster.querySelectorAll('.btn-fire').forEach((btn) => {
    btn.onclick = () => state.onFireStaff?.(btn.dataset.fire);
  });
  roster.querySelectorAll('.train-btn').forEach((btn) => {
    btn.onclick = () => state.onTrainStaff?.(btn.dataset.train);
  });
  roster.querySelectorAll('.history-btn').forEach((btn) => {
    btn.onclick = () => showStaffHistory(btn.dataset.history, state);
  });
  roster.querySelectorAll('.rename-btn').forEach((btn) => {
    btn.onclick = () => {
      const m = state.staff.find((x) => x.id === btn.dataset.rename);
      const name = prompt('Rename employee:', m?.name || '');
      if (name) state.onRenameStaff?.(btn.dataset.rename, name);
    };
  });
}

function hireQueueItems(state) {
  const coverage = getStaffCoverage(state);
  const items = [];
  const push = (roleId, priority, status) => {
    if (items.some((i) => i.roleId === roleId)) return;
    const role = STAFF_ROLES[roleId];
    if (!role) return;
    const check = canHire(roleId, { ...state, staff: state.staff || [] });
    items.push({
      roleId,
      role,
      priority,
      status: !state.perks.includes('hrDept')
        ? 'Locked'
        : check.ok
          ? status
          : (check.msg?.startsWith('Needs') ? 'Needs perk' : check.msg === 'Not enough cash' ? 'Funding' : 'Blocked'),
    });
  };

  if (coverage.sell.active === 0) push('exitSpec', 'High', 'Shortlisted');
  else if (coverage.sell.pct < 50) push('risk', 'High', 'Interview');
  if (coverage.buy.active === 0) push('scout', 'High', 'Screening');
  else if (coverage.buy.pct < 50) push('trader', 'Med', 'Sourcing');
  if (!state.staff?.some((s) => s.roleId === 'compliance')) push('compliance', 'Med', 'Sourcing');
  push('intern', 'Low', 'Sourcing');

  return items.slice(0, 5);
}

function renderHireQueue(state) {
  const el = document.getElementById('staff-hire-queue');
  const countEl = document.getElementById('hire-queue-count');
  if (!el) return;
  const items = hireQueueItems(state);
  if (countEl) countEl.textContent = items.length ? `(${items.length})` : '';

  if (!items.length) {
    el.innerHTML = '<div class="empty">No open hire priorities.</div>';
    return;
  }

  el.innerHTML = `
    <table class="hr-table">
      <thead>
        <tr>
          <th>Role</th><th>Desk</th><th>Priority</th><th>Status</th><th>Hire cost</th><th>Day pay</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((it) => `
          <tr>
            <td>${escapeHtml(it.role.name)}</td>
            <td>${escapeHtml(deskLabel(it.role.lane))}</td>
            <td class="hr-pri hr-pri-${it.priority.toLowerCase()}">${escapeHtml(it.priority)}</td>
            <td>${escapeHtml(it.status)}</td>
            <td class="hr-td-num">$${it.role.hireCost.toLocaleString()}</td>
            <td class="hr-td-num">$${it.role.salary.toLocaleString()}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderHireList(state) {
  const hireList = document.getElementById('staff-hire-list');
  if (!hireList) return;
  const hasHr = state.perks.includes('hrDept');
  hireList.innerHTML = Object.values(STAFF_ROLES).map((role) => {
    const check = canHire(role.id, { ...state, staff: state.staff || [] });
    const owned = (state.staff || []).filter((s) => s.roleId === role.id).length;
    const lockReason = !hasHr ? 'Requires HR Department' : (check.ok ? '' : check.msg);
    return `
      <article class="hire-card ${check.ok ? 'available' : 'locked'}" data-role-card="${role.id}" style="--role-color:${role.color}">
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
  hireList.querySelectorAll('.hire-btn').forEach((btn) => {
    btn.onclick = () => state.onHireStaff?.(btn.dataset.role);
  });
}

function renderPayroll(state, salary, hireSunk, amort) {
  const el = document.getElementById('staff-payroll');
  if (!el) return;
  const staff = (state.staff || []).filter((s) => s.active);
  const net = effectiveDailyCost(state, salary);
  const sizePct = Math.round(STAFF_DEFAULT_MAX_POSITION_PCT * 100);

  el.innerHTML = `
    <div class="hr-payroll-kpis">
      <div class="hr-card">
        <div class="hr-card-lbl">Gross payroll / day</div>
        <div class="hr-card-val">$${salary.toLocaleString()}</div>
        <p class="hr-card-foot">${payrollSubsidyNote(state, salary)}</p>
      </div>
      <div class="hr-card">
        <div class="hr-card-lbl">You pay / day</div>
        <div class="hr-card-val">$${net.toLocaleString()}</div>
        <p class="hr-card-foot">After desk subsidies</p>
      </div>
      <div class="hr-card">
        <div class="hr-card-lbl">Hire sunk</div>
        <div class="hr-card-val">$${hireSunk.toLocaleString()}</div>
        <p class="hr-card-foot">~$${amort.toLocaleString()}/day over ${STAFF_HIRE_AMORT_DAYS}d · ${sizePct}% equity size rule</p>
      </div>
    </div>
    <div class="hr-table-card">
      <div class="hr-table-head"><h4>Line items</h4></div>
      ${staff.length ? `
        <table class="hr-table">
          <thead><tr><th>Employee</th><th>Role</th><th>Tier</th><th>Payroll / Day</th></tr></thead>
          <tbody>
            ${staff.map((s) => {
              const role = STAFF_ROLES[s.roleId];
              const tier = getTier(s);
              return `<tr>
                <td>${escapeHtml(s.name)}</td>
                <td>${escapeHtml(role?.name || s.roleId)}</td>
                <td>${escapeHtml(tier.name)}</td>
                <td class="hr-td-num">$${memberDayPay(s).toLocaleString()}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>` : '<div class="empty">No active staff on payroll.</div>'}
    </div>`;
}

function renderLog(state) {
  const logEl = document.getElementById('staff-log');
  if (!logEl) return;
  const logs = state.staffLog || [];
  logEl.innerHTML = logs.length
    ? logs.slice(0, 20).map((l) => `
        <div class="staff-log-entry">
          <span class="log-time">${new Date(l.time).toLocaleTimeString()}</span>
          <strong>${escapeHtml(l.staff || 'System')}</strong>: ${escapeHtml(l.action || l.msg || '')}
        </div>`).join('')
    : '<div class="empty">Staff activity will appear here…</div>';
}

export function renderStaff(state) {
  bindStaffTabsOnce();
  setStaffTab(activeStaffTab);

  const maxSlots = getMaxStaff(state);
  const hasHr = state.perks.includes('hrDept');
  const staff = state.staff || [];
  const salary = getDailySalary(staff);
  const hireSunk = getHireSunk(staff);
  const amort = hireSunk > 0 ? Math.round(hireSunk / STAFF_HIRE_AMORT_DAYS) : 0;
  const coverage = getStaffCoverage(state);
  const count = staff.length;

  const badge = document.getElementById('staff-badge');
  if (badge) badge.textContent = count ? String(count) : '';

  const meta = document.getElementById('staff-hr-meta');
  if (meta) {
    const now = new Date();
    meta.innerHTML = `
      <span class="hr-meta-chip ${hasHr ? 'ok' : 'warn'}">${hasHr ? `${count}/${maxSlots} seats` : 'HR locked'}</span>
      <span class="hr-meta-time">Last updated: ${now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>`;
  }

  const hrStatus = document.getElementById('staff-hr-status');
  if (hrStatus) {
    hrStatus.textContent = hasHr
      ? `HR active · ${count}/${maxSlots} seats · $${salary.toLocaleString()}/day payroll`
      : 'Unlock HR Department in Perks ($400 · Newcomer)';
  }

  const rosterCount = document.getElementById('roster-count');
  if (rosterCount) rosterCount.textContent = count ? `(${count})` : '';

  renderOverviewCards(state, coverage, salary, hireSunk, amort);
  renderRosterTable(state, coverage, { targetId: 'staff-roster-preview', limit: 8 });
  renderHireQueue(state);
  renderFullRoster(state, coverage);
  renderHireList(state);
  renderPayroll(state, salary, hireSunk, amort);
  renderLog(state);
}

export function showStaffHistory(staffId, state) {
  const m = state.staff.find((s) => s.id === staffId);
  const overlay = document.getElementById('staff-history-overlay');
  const title = document.getElementById('staff-history-title');
  const body = document.getElementById('staff-history-body');
  if (!m || !overlay) return;
  title.textContent = `${m.name} — action log`;
  const hist = m.history || [];
  body.innerHTML = hist.length
    ? hist.map((h) => `<div class="staff-log-entry"><span class="log-time">${new Date(h.time).toLocaleTimeString()}</span>${escapeHtml(h.action || '')}</div>`).join('')
    : '<div class="empty">No actions logged yet.</div>';
  overlay.classList.remove('hidden');
  trapFocus(overlay);
}
