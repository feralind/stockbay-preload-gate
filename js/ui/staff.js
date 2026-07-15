// @ts-check
/**
 * Staff / HR Compact Console — Overview · Roster · Hire · Payroll
 * Roster is a list; click opens a glass employee dossier (profile + activity + log).
 * Important: do NOT remount Staff panels on every renderAll tick (hover/focus thrash).
 */

import {
  STAFF_ROLES, STAFF_TIERS, STAFF_DEFAULT_MAX_POSITION_PCT,
  STAFF_BUY_LANES, STAFF_SELL_LANES, STAFF_HIRE_AMORT_DAYS,
  getDailySalary, getMemberDailySalary, getHireSunk, getStaffCoverage, getNextHireRecommendation,
  canHire, getMaxStaff, getTier, canTrain, staffWinRate,
  staffXp, staffTenureDays, staffTenureLevel,
  staffAuthorityPct, canEnableAutopilot, STAFF_AUTOPILOT_MIN_XP,
} from '../staff.js';
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
let rosterBound = false;
let dossierBound = false;
/** @type {any} */
let lastStaffState = null;
let rosterStructureKey = '';
/** @type {string | null} */
let openStaffId = null;
/** Skip remount when HTML identical (dashboard pattern). */
const staffSnap = /** @type {Record<string, string>} */ ({});
let hireCatalogKey = '';

/**
 * @param {HTMLElement | null} el
 * @param {string} key
 * @param {string} html
 * @returns {boolean} true if DOM was rewritten
 */
function setHtmlIfChanged(el, key, html) {
  if (!el) return false;
  if (staffSnap[key] === html) return false;
  staffSnap[key] = html;
  el.innerHTML = html;
  return true;
}

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
  return getMemberDailySalary(member);
}

/** Display-only desk email from name (not persisted). */
function staffEmail(member) {
  const parts = String(member?.name || 'desk.hand')
    .toLowerCase()
    .replace(/[^a-z0-9\s.-]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first = parts[0] || 'desk';
  const last = parts[1] || parts[0] || 'hand';
  return `${first}.${last}@stockway.com`;
}

function staffJoinedLine(member, state) {
  const days = staffTenureDays(member);
  const gameDay = Math.max(1, Math.floor(Number(state?.day) || 1));
  const hireDay = Math.max(1, gameDay - days);
  if (days <= 0) return `Joined Day ${gameDay} · today`;
  return `Joined Day ${hireDay} · ${days}d tenure`;
}

/** Thin activity sparkline — seeded from progress + actions. */
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

/** Semi-circle activity gauge driven by real progress (0–100). */
function activityGauge(progress, actionsToday) {
  const p = Math.max(0, Math.min(100, Number(progress) || 0));
  const a = Math.max(0, Number(actionsToday) || 0);
  const r = 52;
  const c = Math.PI * r;
  const dash = (p / 100) * c;
  return `
    <div class="hr-gauge" role="img" aria-label="${p}% weekly activity">
      <svg class="hr-gauge-svg" viewBox="0 0 140 84" aria-hidden="true">
        <path class="hr-gauge-track" d="M18 72 A52 52 0 0 1 122 72" fill="none" stroke-width="10" stroke-linecap="round"/>
        <path class="hr-gauge-fill" d="M18 72 A52 52 0 0 1 122 72" fill="none" stroke-width="10" stroke-linecap="round"
          stroke-dasharray="${dash.toFixed(1)} ${c.toFixed(1)}"/>
      </svg>
      <div class="hr-gauge-center">
        <strong data-live="act-pct">${p}%</strong>
        <span>Activity</span>
        <em data-live="act-count">${a} act${a === 1 ? '' : 's'} today</em>
      </div>
    </div>`;
}

function coveragePctForMember(member, coverage) {
  const lane = STAFF_ROLES[member.roleId]?.lane;
  if (STAFF_BUY_LANES.has(lane)) return coverage.buy.pct;
  if (STAFF_SELL_LANES.has(lane)) return coverage.sell.pct;
  return Math.round((coverage.buy.pct + coverage.sell.pct) / 2);
}

function setStaffTab(tab) {
  if (tab !== 'roster' && openStaffId) {
    openStaffId = null;
    setRosterProfileMode(false);
  }
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

let hireBound = false;

function bindRosterOnce() {
  if (rosterBound) return;
  const root = document.getElementById('view-staff');
  if (!root) return;
  rosterBound = true;
  root.addEventListener('click', (e) => {
    const state = lastStaffState;
    if (!state) return;

    const back = e.target?.closest?.('[data-staff-back]');
    if (back) {
      e.preventDefault();
      closeStaffDossier();
      return;
    }

    const actBtn = e.target?.closest?.('[data-dossier-act]');
    if (actBtn) {
      const act = actBtn.getAttribute('data-dossier-act');
      const id = actBtn.getAttribute('data-staff-id');
      if (!id) return;
      if (act === 'fire') state.onFireStaff?.(id);
      else if (act === 'train') state.onTrainStaff?.(id);
      else if (act === 'autopilot') state.onToggleStaffAutopilot?.(id, actBtn.getAttribute('data-on') === '1');
      else if (act === 'rename') {
        const m = state.staff?.find((x) => x.id === id);
        const name = prompt('Rename employee:', m?.name || '');
        if (name) state.onRenameStaff?.(id, name);
      }
      return;
    }

    const open = e.target?.closest?.('[data-staff-open]');
    if (!open) return;
    // Ignore hire / unrelated controls; roster rows themselves are open targets.
    if (e.target?.closest?.('.hire-btn, a, input, [data-dossier-act]')) return;
    e.preventDefault();
    showStaffDossier(open.getAttribute('data-staff-open'), state);
  });
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const open = e.target?.closest?.('[data-staff-open].roster-row-btn');
    if (!open || !lastStaffState) return;
    e.preventDefault();
    showStaffDossier(open.getAttribute('data-staff-open'), lastStaffState);
  });
}

function bindHireOnce() {
  if (hireBound) return;
  const hireList = document.getElementById('staff-hire-list');
  if (!hireList) return;
  hireBound = true;
  hireList.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('.hire-btn[data-role]');
    if (!btn) return;
    lastStaffState?.onHireStaff?.(btn.getAttribute('data-role'));
  });
}

function bindDossierOnce() {
  // Actions are handled on #view-staff in bindRosterOnce (inline profile + legacy modal).
  dossierBound = true;
}

function setRosterProfileMode(on) {
  const list = document.getElementById('staff-roster-list-wrap');
  const profile = document.getElementById('staff-roster-profile');
  if (list) {
    list.classList.toggle('hidden', !!on);
    if (on) list.setAttribute('hidden', '');
    else list.removeAttribute('hidden');
  }
  if (profile) {
    profile.classList.toggle('hidden', !on);
    if (on) profile.removeAttribute('hidden');
    else {
      profile.setAttribute('hidden', '');
      profile.innerHTML = '';
    }
  }
}

export function closeStaffDossier() {
  openStaffId = null;
  setRosterProfileMode(false);
  const overlay = document.getElementById('staff-history-overlay');
  overlay?.classList.add('hidden');
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

  setHtmlIfChanged(cards, 'overview', `
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
          <button type="button" class="hr-glass-btn hr-view-role" data-staff-goto="hire" data-focus-role="${escapeHtml(role.id)}">View Role</button>
        </div>
      ` : `<p class="hr-card-foot">No recommendation — desk is full or balanced.</p>`}
    </article>`);
}

function renderRosterTable(state, coverage, { targetId, limit }) {
  const el = document.getElementById(targetId);
  if (!el) return;
  const staff = state.staff || [];
  const structKey = `preview-struct:${targetId}`;
  if (!staff.length) {
    staffSnap[structKey] = '';
    const hasHr = state.perks.includes('hrDept');
    setHtmlIfChanged(el, `preview:${targetId}`, `
      <div class="roster-empty">
        <div class="roster-empty-title">Empty team board</div>
        <p class="roster-empty-copy">${hasHr
          ? 'Hire a buyer and a seller so the firm both enters and exits.'
          : 'Unlock <strong>HR Department</strong> in Perks, then hire your first seat.'}</p>
      </div>`);
    return;
  }

  const nextStruct = `${rosterStructureFingerprint(staff)}|lim:${limit || 0}`;
  if (staffSnap[structKey] === nextStruct && el.querySelector('tbody')) {
    const slice = limit ? staff.slice(0, limit) : staff;
    for (const s of slice) {
      const row = el.querySelector(`[data-staff-open="${String(s.id).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`);
      if (!row) continue;
      const prog = Math.round(s.progress || 0);
      const pay = memberDayPay(s);
      const cov = coveragePctForMember(s, coverage);
      const act = row.querySelector('[data-live="act"]');
      const spark = row.querySelector('[data-live="spark"]');
      const covEl = row.querySelector('[data-live="cov"]');
      const payEl = row.querySelector('[data-live="pay"]');
      if (act) act.textContent = `${prog}%`;
      if (spark) spark.innerHTML = activitySpark(prog, s.actionsToday);
      if (covEl) covEl.textContent = `${cov}%`;
      if (payEl) payEl.textContent = `$${pay.toLocaleString()}`;
    }
    return;
  }
  staffSnap[structKey] = nextStruct;
  delete staffSnap[`preview:${targetId}`];

  const rows = (limit ? staff.slice(0, limit) : staff).map((s) => {
    const role = STAFF_ROLES[s.roleId];
    const prog = Math.round(s.progress || 0);
    const pay = memberDayPay(s);
    const cov = coveragePctForMember(s, coverage);
    return `
      <tr class="hr-tr hr-tr-open" data-staff-open="${escapeHtml(s.id)}" style="--role-color:${role?.color || '#58a6ff'}" title="Open profile">
        <td class="hr-td-emp">
          <span class="role-mark sm" style="background:${role?.color || '#58a6ff'}">${role?.mark || 'ST'}</span>
          <span class="hr-emp-name">${escapeHtml(s.name)}</span>
        </td>
        <td>${escapeHtml(role?.name || s.roleId)}</td>
        <td>${escapeHtml(deskLabel(role?.lane))}</td>
        <td class="hr-td-act">
          <span class="hr-act-pct" data-live="act">${prog}%</span>
          <span data-live="spark">${activitySpark(prog, s.actionsToday)}</span>
        </td>
        <td data-live="cov">${cov}%</td>
        <td class="hr-td-num" data-live="pay">$${pay.toLocaleString()}</td>
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

function rosterStructureFingerprint(staff) {
  return (staff || []).map((s) => [
    s.id,
    s.name,
    s.roleId,
    s.tier,
    s.autopilot ? 1 : 0,
    staffTenureLevel(s),
  ].join(':')).join('|');
}

function patchRosterLive(roster, staff) {
  for (const s of staff) {
    const row = roster.querySelector(`[data-staff-id="${String(s.id).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`);
    if (!row) continue;
    const prog = Math.round(s.progress || 0);
    const pay = memberDayPay(s);
    const pl = s.profitGenerated || 0;
    const wr = staffWinRate(s);
    const wrTxt = wr != null ? `${Math.round(wr * 100)}% win` : 'no closes yet';
    const status = row.querySelector('[data-live="status"]');
    const act = row.querySelector('[data-live="act"]');
    const spark = row.querySelector('[data-live="spark"]');
    const pnl = row.querySelector('[data-live="pnl"]');
    const meta = row.querySelector('[data-live="meta"]');
    if (status) status.textContent = `${s.status || 'Ready'} · $${pay}/day`;
    if (act) act.textContent = `${prog}%`;
    if (spark) spark.innerHTML = activitySpark(prog, s.actionsToday);
    if (pnl) {
      pnl.textContent = `${pl >= 0 ? '+' : ''}$${Math.round(pl).toLocaleString()}`;
      pnl.classList.toggle('up', pl >= 0);
      pnl.classList.toggle('down', pl < 0);
    }
    if (meta) meta.textContent = `${wrTxt} · ${s.actionsToday || 0} acts · ${s.mistakes || 0} errs`;
  }
}

function renderFullRoster(state, coverage) {
  const roster = document.getElementById('staff-roster');
  if (!roster) return;
  const staff = state.staff || [];
  const countEl = document.getElementById('roster-count-full');
  if (countEl) countEl.textContent = staff.length ? `(${staff.length})` : '';

  if (!staff.length) {
    rosterStructureKey = '';
    const hasHr = state.perks.includes('hrDept');
    setHtmlIfChanged(roster, 'rosterEmpty', `
      <div class="roster-empty">
        <div class="roster-empty-title">Empty team board</div>
        <p class="roster-empty-copy">${hasHr
          ? 'Hire a buyer (Scout / Trader) and a seller (Exit Specialist / Risk Manager).'
          : 'Unlock <strong>HR Department</strong> in Perks ($400 · Newcomer), then hire.'}</p>
      </div>`);
    return;
  }

  const nextKey = rosterStructureFingerprint(staff);
  if (nextKey === rosterStructureKey && roster.querySelector('.roster-row')) {
    patchRosterLive(roster, staff);
    return;
  }
  rosterStructureKey = nextKey;
  delete staffSnap.rosterEmpty;

  roster.innerHTML = staff.map((s) => {
    const role = STAFF_ROLES[s.roleId];
    const tier = getTier(s);
    const pl = s.profitGenerated || 0;
    const wr = staffWinRate(s);
    const wrTxt = wr != null ? `${Math.round(wr * 100)}% win` : 'no closes yet';
    const prog = Math.round(s.progress || 0);
    const pay = memberDayPay(s);
    const lvl = staffTenureLevel(s);
    const days = staffTenureDays(s);
    return `
      <div class="roster-row roster-row-btn" role="button" tabindex="0" data-staff-open="${escapeHtml(s.id)}" data-staff-id="${escapeHtml(s.id)}"
        style="--role-color:${role?.color || '#58a6ff'}">
        <div class="role-mark" style="background:${role?.color || '#58a6ff'}">${role?.mark || 'ST'}</div>
        <div class="roster-main">
          <div class="roster-name-row">
            <strong class="roster-name">${escapeHtml(s.name)}</strong>
            <span class="tier-badge tier-${s.tier || 'newbie'}">${escapeHtml(tier.name)}</span>
            ${role?.lane ? laneChip(role.lane) : ''}
            ${s.autopilot ? '<span class="hr-auto-badge">Autopilot</span>' : ''}
          </div>
          <div class="roster-role">${escapeHtml(role?.title || role?.name || s.roleId)}</div>
          <div class="roster-status" data-live="status">${escapeHtml(s.status || 'Ready')} · $${pay}/day</div>
          <div class="roster-tenure">Tenure L${lvl} · ${days}d</div>
          <div class="roster-act-row">
            <span class="hr-act-pct" data-live="act">${prog}%</span>
            <span data-live="spark">${activitySpark(prog, s.actionsToday)}</span>
            <span class="roster-meta">activity</span>
          </div>
        </div>
        <div class="roster-side">
          <div class="roster-pnl ${pl >= 0 ? 'up' : 'down'}" data-live="pnl">${pl >= 0 ? '+' : ''}$${Math.round(pl).toLocaleString()}</div>
          <div class="roster-meta" data-live="meta">${wrTxt} · ${s.actionsToday || 0} acts · ${s.mistakes || 0} errs</div>
          <span class="roster-open-hint">Open profile →</span>
        </div>
      </div>`;
  }).join('');
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
    setHtmlIfChanged(el, 'hireQueue', '<div class="empty">No open hire priorities.</div>');
    return;
  }

  setHtmlIfChanged(el, 'hireQueue', `
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
    </table>`);
}

function hireCatalogFingerprint(state) {
  const staff = state.staff || [];
  const owned = Object.keys(STAFF_ROLES)
    .map((id) => `${id}:${staff.filter((s) => s.roleId === id).length}`)
    .join('|');
  const perks = (state.perks || []).slice().sort().join(',');
  return [
    state.perks?.includes('hrDept') ? 1 : 0,
    getMaxStaff(state),
    staff.length,
    owned,
    perks,
  ].join('·');
}

function hireFooterHtml(role, state, hasHr) {
  const check = canHire(role.id, { ...state, staff: state.staff || [] });
  const owned = (state.staff || []).filter((s) => s.roleId === role.id).length;
  const lockReason = !hasHr ? 'Requires HR Department' : (check.ok ? '' : check.msg);
  return {
    ok: check.ok,
    html: `
      <div class="hire-cost-row">
        <span class="hire-cost">$${role.hireCost.toLocaleString()} hire</span>
        <span class="hire-salary">$${role.salary}/day</span>
        ${owned ? `<span class="hire-owned">${owned} on roster</span>` : ''}
      </div>
      ${check.ok
        ? `<button type="button" class="hr-glass-btn hr-glass-primary hire-btn" data-role="${role.id}">Hire</button>`
        : `<span class="hire-lock-pill" title="${escapeHtml(lockReason)}">${escapeHtml(lockReason || 'Locked')}</span>`}`,
  };
}

function patchHireAffordability(hireList, state) {
  const hasHr = state.perks.includes('hrDept');
  for (const role of Object.values(STAFF_ROLES)) {
    const card = hireList.querySelector(`[data-role-card="${role.id}"]`);
    if (!card) continue;
    const check = canHire(role.id, { ...state, staff: state.staff || [] });
    const owned = (state.staff || []).filter((s) => s.roleId === role.id).length;
    const lockReason = !hasHr ? 'Requires HR Department' : (check.ok ? '' : check.msg);
    const footKey = `${check.ok ? 1 : 0}|${owned}|${lockReason}`;
    if (card.dataset.footKey === footKey) continue;
    card.dataset.footKey = footKey;
    card.classList.toggle('available', check.ok);
    card.classList.toggle('locked', !check.ok);
    const footer = card.querySelector('.hire-footer');
    if (footer) {
      footer.innerHTML = hireFooterHtml(role, state, hasHr).html;
    }
  }
}

function renderHireList(state) {
  const hireList = document.getElementById('staff-hire-list');
  if (!hireList) return;
  bindHireOnce();
  const hasHr = state.perks.includes('hrDept');
  const nextKey = hireCatalogFingerprint(state);
  if (nextKey === hireCatalogKey && hireList.querySelector('.hire-card')) {
    patchHireAffordability(hireList, state);
    return;
  }
  hireCatalogKey = nextKey;

  hireList.innerHTML = Object.values(STAFF_ROLES).map((role) => {
    const foot = hireFooterHtml(role, state, hasHr);
    return `
      <article class="hire-card ${foot.ok ? 'available' : 'locked'}" data-role-card="${role.id}" style="--role-color:${role.color}">
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
        <div class="hire-footer">${foot.html}</div>
      </article>`;
  }).join('');
}

function renderPayroll(state, salary, hireSunk, amort) {
  const el = document.getElementById('staff-payroll');
  if (!el) return;
  const staff = (state.staff || []).filter((s) => s.active);
  const net = effectiveDailyCost(state, salary);
  const sizePct = Math.round(STAFF_DEFAULT_MAX_POSITION_PCT * 100);

  setHtmlIfChanged(el, 'payroll', `
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
              return `<tr class="hr-tr-open" data-staff-open="${escapeHtml(s.id)}" title="Open profile">
                <td>${escapeHtml(s.name)}</td>
                <td>${escapeHtml(role?.name || s.roleId)}</td>
                <td>${escapeHtml(tier.name)}</td>
                <td class="hr-td-num">$${memberDayPay(s).toLocaleString()}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>` : '<div class="empty">No active staff on payroll.</div>'}
    </div>`);
}

function renderLog(state) {
  const logEl = document.getElementById('staff-log');
  if (!logEl) return;
  const logs = state.staffLog || [];
  setHtmlIfChanged(logEl, 'staffLog', logs.length
    ? logs.slice(0, 20).map((l) => `
        <div class="staff-log-entry">
          <span class="log-time">${new Date(l.time).toLocaleTimeString()}</span>
          <strong>${escapeHtml(l.staff || 'System')}</strong>: ${escapeHtml(l.action || l.msg || '')}
        </div>`).join('')
    : '<div class="empty">Staff activity will appear here…</div>');
}

function dossierHistoryHtml(member) {
  const hist = member.history || [];
  if (!hist.length) return '<div class="empty">No buys, sells, or desk actions logged yet.</div>';
  return hist.map((h) => `
    <div class="staff-log-entry">
      <span class="log-time">${new Date(h.time).toLocaleTimeString()}</span>
      ${escapeHtml(h.action || '')}
    </div>`).join('');
}

function renderDossierBody(member, state) {
  const role = STAFF_ROLES[member.roleId];
  const tier = getTier(member);
  const prog = Math.round(member.progress || 0);
  const pay = memberDayPay(member);
  const pl = member.profitGenerated || 0;
  const wr = staffWinRate(member);
  const wrTxt = wr != null ? `${Math.round(wr * 100)}%` : '—';
  const train = canTrain(member.id, state);
  const autoCheck = canEnableAutopilot(member);
  const tradingSeat = STAFF_BUY_LANES.has(role?.lane) || STAFF_SELL_LANES.has(role?.lane);
  const auth = staffAuthorityPct(member, role);
  const authTxt = auth != null ? `${(auth * 100).toFixed(1)}%` : '—';
  const email = staffEmail(member);
  const joined = staffJoinedLine(member, state);

  return `
    <div class="staff-dossier staff-dossier-inline" style="--role-color:${role?.color || '#58a6ff'}">
      <div class="staff-dossier-top">
        <button type="button" class="hr-glass-btn" data-staff-back="1">← Back to roster</button>
        <div class="staff-dossier-top-title">Employee profile</div>
      </div>
      <div class="staff-dossier-grid">
        <article class="hr-card staff-dossier-profile">
          <div class="staff-dossier-avatar" style="background:${role?.color || '#58a6ff'}">${role?.mark || 'ST'}</div>
          <div class="staff-dossier-id">
            <strong class="staff-dossier-name">${escapeHtml(member.name)}</strong>
            <div class="staff-dossier-title">${escapeHtml(role?.title || role?.name || member.roleId)}</div>
            <div class="staff-dossier-meta-line"><span>Email</span><em>${escapeHtml(email)}</em></div>
            <div class="staff-dossier-meta-line"><span>Joined</span><em>${escapeHtml(joined)}</em></div>
            <div class="staff-dossier-chips">
              <span class="tier-badge tier-${member.tier || 'newbie'}">${escapeHtml(tier.name)}</span>
              ${role?.lane ? laneChip(role.lane) : ''}
              ${member.autopilot ? '<span class="hr-auto-badge">Autopilot</span>' : ''}
            </div>
          </div>
          <div class="staff-dossier-metrics">
            <div class="staff-metric staff-metric-pay"><em>Salary</em><strong data-live="dossier-pay">$${pay.toLocaleString()}/d</strong></div>
            <div class="staff-metric staff-metric-pnl"><em>Attributed P&amp;L</em><strong class="${pl >= 0 ? 'up' : 'down'}" data-live="dossier-pnl">${pl >= 0 ? '+' : ''}$${Math.round(pl).toLocaleString()}</strong></div>
            <div class="staff-metric staff-metric-win"><em>Win rate</em><strong>${wrTxt}</strong></div>
            <div class="staff-metric staff-metric-size"><em>Size auth</em><strong>${authTxt}</strong></div>
          </div>
        </article>
        <article class="hr-card staff-dossier-activity">
          <div class="hr-card-lbl">Desk activity</div>
          ${activityGauge(prog, member.actionsToday)}
          <p class="hr-card-foot" data-live="dossier-status">${escapeHtml(member.status || 'Ready')}</p>
        </article>
      </div>
      <article class="hr-card staff-dossier-log">
        <div class="hr-table-head">
          <h4>What they did</h4>
          <span class="staff-section-hint">Buys · sells · desk work</span>
        </div>
        <div class="staff-dossier-log-list" data-live="dossier-log">${dossierHistoryHtml(member)}</div>
      </article>
      <div class="staff-dossier-actions">
        <button type="button" class="hr-glass-btn hr-glass-icon" data-dossier-act="rename" data-staff-id="${escapeHtml(member.id)}" title="Rename">✎ Rename</button>
        ${train.ok
          ? `<button type="button" class="hr-glass-btn hr-glass-primary" data-dossier-act="train" data-staff-id="${escapeHtml(member.id)}">Train $${train.cost} → ${STAFF_TIERS[train.next].name}</button>`
          : (tier.next
            ? `<span class="hire-lock">${escapeHtml(train.msg)}</span>`
            : `<span class="tier-max">MAX tier</span>`)}
        ${tradingSeat ? `
          <button type="button" class="hr-glass-btn hr-glass-toggle ${member.autopilot ? 'is-on' : ''}"
            data-dossier-act="autopilot" data-staff-id="${escapeHtml(member.id)}" data-on="${member.autopilot ? '0' : '1'}"
            title="${member.autopilot ? 'Turn autopilot off' : (autoCheck.ok ? 'Enable self-management' : autoCheck.msg)}">
            ${member.autopilot ? 'Auto ON' : (autoCheck.ok ? 'Autopilot' : `Auto ${staffXp(member)}/${STAFF_AUTOPILOT_MIN_XP}`)}
          </button>` : ''}
        <button type="button" class="hr-glass-btn hr-glass-danger" data-dossier-act="fire" data-staff-id="${escapeHtml(member.id)}">Fire</button>
      </div>
    </div>`;
}

function patchOpenDossier(state) {
  if (!openStaffId) return;
  const m = state.staff?.find((s) => s.id === openStaffId);
  const host = document.getElementById('staff-roster-profile');
  if (!m) {
    closeStaffDossier();
    return;
  }
  if (!host) return;

  if (activeStaffTab !== 'roster') setStaffTab('roster');
  setRosterProfileMode(true);

  const gaugePct = host.querySelector('[data-live="act-pct"]');
  const gaugeActs = host.querySelector('[data-live="act-count"]');
  const status = host.querySelector('[data-live="dossier-status"]');
  const log = host.querySelector('[data-live="dossier-log"]');
  const pnl = host.querySelector('[data-live="dossier-pnl"]');
  const payEl = host.querySelector('[data-live="dossier-pay"]');
  const prog = Math.round(m.progress || 0);
  const a = m.actionsToday || 0;
  const pl = m.profitGenerated || 0;
  const pay = memberDayPay(m);

  if (gaugePct && gaugeActs && status && log && host.querySelector('.staff-dossier')) {
    gaugePct.textContent = `${prog}%`;
    gaugeActs.textContent = `${a} act${a === 1 ? '' : 's'} today`;
    status.textContent = m.status || 'Ready';
    if (payEl) payEl.textContent = `$${pay.toLocaleString()}/d`;
    if (pnl) {
      pnl.textContent = `${pl >= 0 ? '+' : ''}$${Math.round(pl).toLocaleString()}`;
      pnl.classList.toggle('up', pl >= 0);
      pnl.classList.toggle('down', pl < 0);
    }
    const fill = host.querySelector('.hr-gauge-fill');
    if (fill) {
      const c = Math.PI * 52;
      fill.setAttribute('stroke-dasharray', `${((prog / 100) * c).toFixed(1)} ${c.toFixed(1)}`);
    }
    log.innerHTML = dossierHistoryHtml(m);
  } else {
    host.innerHTML = renderDossierBody(m, state);
  }
}

export function renderStaff(state) {
  lastStaffState = state;
  bindStaffTabsOnce();
  bindRosterOnce();
  bindHireOnce();
  bindDossierOnce();
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
    // Time chip alone would remount every minute — keep structure stable; only refresh clock text.
    if (!meta.querySelector('.hr-meta-chip')) {
      meta.innerHTML = `
        <span class="hr-meta-chip ${hasHr ? 'ok' : 'warn'}">${hasHr ? `${count}/${maxSlots} seats` : 'HR locked'}</span>
        <span class="hr-meta-time">Last updated: ${now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>`;
    } else {
      const chip = meta.querySelector('.hr-meta-chip');
      const time = meta.querySelector('.hr-meta-time');
      if (chip) {
        chip.className = `hr-meta-chip ${hasHr ? 'ok' : 'warn'}`;
        chip.textContent = hasHr ? `${count}/${maxSlots} seats` : 'HR locked';
      }
      if (time) time.textContent = `Last updated: ${now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    }
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
  patchOpenDossier(state);
}

/** @deprecated alias — opens the employee dossier */
export function showStaffHistory(staffId, state) {
  return showStaffDossier(staffId, state);
}

export function showStaffDossier(staffId, state) {
  const m = state?.staff?.find((s) => s.id === staffId);
  const host = document.getElementById('staff-roster-profile');
  if (!m || !host) return;
  openStaffId = staffId;
  lastStaffState = state;
  setStaffTab('roster');
  setRosterProfileMode(true);
  host.innerHTML = renderDossierBody(m, state);
  host.classList.remove('staff-roster-profile-enter');
  void host.offsetWidth;
  host.classList.add('staff-roster-profile-enter');
  host.addEventListener('animationend', () => {
    host.classList.remove('staff-roster-profile-enter');
  }, { once: true });
}
