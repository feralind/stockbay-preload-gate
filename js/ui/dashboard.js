// @ts-check
/**
 * Dashboard view render — extracted from ui.js (Stage C1).
 */

import { getBlackMarketItem, BLACKMARKET_ITEM_POOL } from '../blackmarket.js';
import { getCollectionPrestigeScore } from '../collection-log.js';
import { getTotalDebt } from '../finance.js';
import { getLeaderboard } from '../leaderboard.js';
import { repTitle } from '../meta.js';
import { getEquity } from '../portfolio.js';
import { getProfile } from '../profile.js';
import { getRelicEffect, getRelicSlotLimit } from '../relics.js';
import { THE_SEAT } from '../the-seat.js';
import { getVaultBookValue, getVaultItem } from '../vault.js';
import { escapeAttr, escapeHtml, fmt } from './shared.js';

/** @type {(viewId: string) => void} */
let switchView = () => {};

/** @param {{ switchView?: (viewId: string) => void }} [opts] */
export function configureDashboardUi({ switchView: nextSwitchView } = {}) {
  if (typeof nextSwitchView === 'function') switchView = nextSwitchView;
}

/**
 * Firm Snapshot relic row — read-only display of equipped Black Market relics.
 * Reuses getBlackMarketItem for names (same pool as Black Market UI).
 * @param {{ blackMarketEquippedRelics?: string[], seatOwned?: boolean }} state
 * @returns {string}
 */
export function buildFirmRelicRowHtml(state = {}) {
  const equipped = Array.isArray(state.blackMarketEquippedRelics)
    ? state.blackMarketEquippedRelics.filter(Boolean)
    : [];
  const slots = getRelicSlotLimit({ seatOwned: !!state.seatOwned });
  if (!equipped.length) {
    const slotLabel = `${slots} slot${slots === 1 ? '' : 's'}`;
    return `<div class="dash-row dash-row-goto" data-goto="blackmarket" title="Open Black Market to equip relics">`
      + `<span>Relics</span>`
      + `<span>None equipped (${slotLabel})</span>`
      + `</div>`;
  }
  const names = equipped.map((id) => getBlackMarketItem(id)?.name || id);
  const tip = equipped.map((id) => {
    const name = getBlackMarketItem(id)?.name || id;
    const summary = getRelicEffect(id)?.summary;
    return summary ? `${name}: ${summary}` : name;
  }).join(' · ');
  return `<div class="dash-row" title="${escapeAttr(tip)}">`
    + `<span>Relics</span>`
    + `<span>${escapeHtml(names.join(', '))}</span>`
    + `</div>`;
}

export function renderDashboard(state) {
  const meta = state.meta || {};
  const equity = getEquity(state.portfolio);
  const debt = state.finance ? getTotalDebt(state.finance) : 0;
  const vaultBook = getVaultBookValue(state);
  const net = equity - debt + vaultBook;
  const hist = meta.equityHistory || [];
  const startEq = hist[0]?.equity ?? (equity - debt);
  const delta = (equity - debt) - startEq;

  const deltaEl = document.getElementById('dash-equity-delta');
  if (deltaEl) {
    deltaEl.textContent = `${delta >= 0 ? '+' : ''}$${Math.round(delta).toLocaleString()}`;
    deltaEl.className = delta >= 0 ? 'up' : 'down';
  }

  const stats = document.getElementById('dash-stats');
  if (stats) {
    const nums = stats.querySelectorAll('.dash-stat-card .stat-num');
    if (nums.length === 4) {
      // In-place updates — wiping innerHTML every tick made dashboard cards flash on hover
      nums[0].textContent = fmt(state.portfolio.cash);
      nums[1].textContent = fmt(net);
      nums[2].textContent = fmt(debt);
      nums[2].classList.toggle('down', !!debt);
      nums[3].textContent = String(meta.reputation ?? 0);
    } else {
      stats.innerHTML = `
      <div class="dash-stat-card interactive-card"><span class="stat-lbl">Cash</span><span class="stat-num">${fmt(state.portfolio.cash)}</span></div>
      <div class="dash-stat-card interactive-card"><span class="stat-lbl">Net Worth</span><span class="stat-num">${fmt(net)}</span></div>
      <div class="dash-stat-card interactive-card"><span class="stat-lbl">Debt</span><span class="stat-num ${debt ? 'down' : ''}">${fmt(debt)}</span></div>
      <div class="dash-stat-card interactive-card"><span class="stat-lbl">REP</span><span class="stat-num">${meta.reputation ?? 0}</span></div>
    `;
    }
  }

  const ch = meta.challenge;
  const chBox = document.getElementById('dash-challenge');
  const chDetail = document.getElementById('dash-challenge-detail');
  const chHtml = ch ? `
    <div class="challenge-card interactive-card ${ch.completed ? 'done' : ''}">
      <div class="challenge-name">${ch.completed ? '✓ ' : ''}${escapeHtml(ch.name)}</div>
      <div class="challenge-desc">${escapeHtml(ch.desc)}</div>
      <div class="challenge-meta">Progress: ${Math.round(ch.progress || 0)} / ${ch.target} · Reward $${ch.reward.toLocaleString()} +${ch.rep} REP</div>
      ${ch.completed && !ch.claimed ? '<button type="button" class="btn btn-accent btn-claim-challenge">Claim reward</button>' : ''}
      ${ch.claimed ? '<span class="ach-claimed">CLAIMED</span>' : ''}
    </div>` : '<div class="empty">Challenge loads at day start</div>';
  if (chBox) chBox.innerHTML = chHtml;
  if (chDetail) chDetail.innerHTML = chHtml;
  document.querySelectorAll('.btn-claim-challenge').forEach((btn) => {
    btn.onclick = () => state.onClaimChallenge?.();
  });

  drawEquityChart(hist, net);

  const recent = document.getElementById('dash-recent');
  if (recent) {
    const trades = (state.portfolio.history || []).slice(0, 6);
    recent.innerHTML = trades.length
      ? trades.map(t => `<div class="dash-row"><span>${t.action} ${t.sym}</span><span>×${t.shares} @ $${Number(t.price).toFixed(2)}</span></div>`).join('')
      : '<div class="empty">No flips yet — make your first trade</div>';
  }

  const firm = document.getElementById('dash-firm');
  if (firm) {
    const staffN = state.staff?.length || 0;
    const perksN = state.perks?.length || 0;
    firm.innerHTML = `
      <div class="dash-row"><span>Staff</span><span>${staffN}</span></div>
      <div class="dash-row"><span>Perks</span><span>${perksN}</span></div>
      ${buildFirmRelicRowHtml(state)}
      <div class="dash-row"><span>Personal credit</span><span>${state.finance?.personalCredit ?? 680}</span></div>
      <div class="dash-row"><span>Business credit</span><span>${state.finance?.businessCredit ?? 700}</span></div>
      <div class="dash-row"><span>Title</span><span>${repTitle(meta.reputation ?? 0)}</span></div>
    `;
  }

  const lb = document.getElementById('dash-leaderboard');
  if (lb) {
    const runs = getLeaderboard();
    const profile = getProfile();
    const titleItem = getVaultItem(profile?.cosmetics?.title);
    const prestige = getCollectionPrestigeScore(state, { blackMarketPool: BLACKMARKET_ITEM_POOL, seatItem: THE_SEAT });
    const flair = [];
    if (titleItem) flair.push(titleItem.name);
    if (meta.collectionFlair) flair.push(String(meta.collectionFlair));
    if (state.seatOwned) flair.push(THE_SEAT.name);
    flair.push(`Prestige ${prestige}`);
    const identity = `<div class="dash-player-identity"><strong>${escapeHtml(profile.name)}</strong>${flair.length ? `<span>${escapeHtml(flair.join(' · '))}</span>` : ''}</div>`;
    lb.innerHTML = runs.length
      ? identity + runs.slice(0, 5).map((r, i) => `
        <div class="dash-row ${i === 0 ? 'lb-best' : ''}">
          <span>#${i + 1} Day ${r.day} · REP ${r.rep ?? 0}</span>
          <span>$${r.equity.toLocaleString()}</span>
        </div>`).join('')
      : identity + '<div class="empty">Your best runs appear here — grow equity to set a record</div>';
  }

  document.querySelectorAll('[data-goto]').forEach(btn => {
    btn.onclick = () => switchView(btn.dataset.goto);
  });
}

export function drawEquityChart(hist, current) {
  const canvas = document.getElementById('equity-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const pts = hist.length ? hist.map(p => p.equity) : [current];
  if (pts.length === 1) pts.push(pts[0]);
  const min = Math.min(...pts) * 0.998;
  const max = Math.max(...pts) * 1.002 || min + 1;
  ctx.strokeStyle = pts[pts.length - 1] >= pts[0] ? '#3fb950' : '#f85149';
  ctx.lineWidth = 2;
  ctx.beginPath();
  pts.forEach((v, i) => {
    const x = (i / (pts.length - 1)) * (w - 20) + 10;
    const y = h - 10 - ((v - min) / (max - min || 1)) * (h - 20);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}
