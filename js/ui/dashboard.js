// @ts-check
/**
 * Dashboard view render — extracted from ui.js (Stage C1).
 * Section 2–4: Standing, office ladder, mega goals, luxury sinks.
 */

import { getBlackMarketItem, BLACKMARKET_ITEM_POOL } from '../blackmarket.js';
import { getFlagshipEquippedVaultItem } from '../collection-log.js';
import {
  canPurchaseOfficeUpgrade,
  getEffectiveOfficeTier,
  getEligibleOfficeTier,
  getNextOfficeUpgrade,
} from '../office.js';
import {
  canPurchaseLuxury,
  getNextLuxuryPurchase,
} from '../luxury.js';
import {
  getActiveMegaGoal,
  getNextNetWorthMilestone,
} from '../mega-goals.js';
import { PRIVATE_SALON_POOL } from '../private-salon.js';
import { getTotalDebt } from '../finance.js';
import { getLeaderboard } from '../leaderboard.js';
import { getPlayerStanding } from '../meta.js';
import { getEquity } from '../portfolio.js';
import { getProfile } from '../profile.js';
import { getRelicEffect, getRelicSlotLimit } from '../relics.js';
import { THE_SEAT } from '../the-seat.js';
import { getVaultBookValue, getVaultDeskAura } from '../vault.js';
import { escapeAttr, escapeHtml, fmt } from './shared.js';

/** @type {(viewId: string) => void} */
let switchView = () => {};

/** Soft eligibility helper — re-export for tests / feature audit (visuals use purchased tier). */
export const getSoftOfficeStage = getEligibleOfficeTier;

/** Re-export for existing quality tests. */
export { getNextNetWorthMilestone };

/** @param {{ switchView?: (viewId: string) => void }} [opts] */
export function configureDashboardUi({ switchView: nextSwitchView } = {}) {
  if (typeof nextSwitchView === 'function') switchView = nextSwitchView;
}

/**
 * Firm Snapshot relic row — read-only display of equipped Black Market relics.
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

function renderDashHero(profile, standing, office, net) {
  const titleEl = document.getElementById('dash-hero-title');
  const blurbEl = document.getElementById('dash-hero-blurb');
  const eyeEl = document.getElementById('dash-hero-eyebrow');
  const name = profile?.name || 'Paper Trader';
  if (eyeEl) eyeEl.textContent = office.current.name;
  if (titleEl) titleEl.textContent = name;
  if (blurbEl) {
    const bits = [
      standing.rankName,
      `REP ${standing.rep}`,
      `Net Worth ${fmt(net)}`,
    ];
    if (standing.deskLabel) bits.push(standing.deskLabel);
    blurbEl.textContent = `${bits.join(' · ')}. ${office.current.blurb}`;
  }
}

function renderDashStanding(standing) {
  const el = document.getElementById('dash-standing');
  if (!el) return;
  const chips = [
    `<span class="dash-standing-chip"><em>Rank</em> ${escapeHtml(standing.rankName)} · REP ${standing.rep}</span>`,
    `<span class="dash-standing-chip"><em>Collection</em> ${standing.collectionScore}</span>`,
  ];
  if (standing.deskLabel) {
    chips.push(`<span class="dash-standing-chip"><em>Desk</em> ${escapeHtml(standing.deskLabel)}</span>`);
  }
  if (standing.flair) {
    chips.push(`<span class="dash-standing-chip"><em>Flair</em> ${escapeHtml(standing.flair)}</span>`);
  } else if (standing.titleName) {
    chips.push(`<span class="dash-standing-chip"><em>Title</em> ${escapeHtml(standing.titleName)}</span>`);
  }
  if (standing.seatOwned) {
    chips.push(`<span class="dash-standing-chip"><em>Seat</em> Secured</span>`);
  }
  el.innerHTML = chips.join('');
}

/**
 * @param {object} state
 * @param {{ id: string, name: string, blurb: string }} office
 * @param {number} net
 * @param {number} rep
 */
function renderOfficeStageCard(state, office, net, rep) {
  const el = document.getElementById('dash-office-stage');
  if (!el) return;
  const next = getNextOfficeUpgrade(state);
  const gate = canPurchaseOfficeUpgrade(state, { netWorth: net, reputation: rep });
  let tag = 'Owned';
  let nextLine = 'Peak office secured.';
  let ctaHtml = '';
  if (next) {
    const gateBits = `${fmt(next.minNet)} NW · ${next.minRep} REP · ${fmt(next.price)}`;
    if (gate.ok) {
      tag = 'Ready';
      nextLine = `Next: ${escapeHtml(next.name)} · Ready to upgrade`;
      ctaHtml = `<button type="button" class="btn btn-accent btn-sm btn-office-upgrade">Upgrade — ${fmt(next.price)}</button>`;
    } else if (gate.code === 'cash') {
      tag = 'Eligible';
      nextLine = `Next: ${escapeHtml(next.name)} · ${gateBits} · Need more cash`;
      ctaHtml = `<button type="button" class="btn btn-sm btn-office-upgrade" disabled title="${escapeAttr(gate.reason)}">Upgrade — ${fmt(next.price)}</button>`;
    } else {
      tag = 'Locked';
      nextLine = `Next: ${escapeHtml(next.name)} · ${gateBits}`;
    }
  } else {
    tag = 'Max';
  }
  el.innerHTML = `
    <div class="dash-card-head"><span>Office</span><span class="dash-soft-tag">${tag}</span></div>
    <div class="dash-office-name">${escapeHtml(office.name)}</div>
    <p class="dash-office-blurb">${escapeHtml(office.blurb)}</p>
    <div class="dash-office-next">${nextLine}</div>
    ${ctaHtml}
  `;
  const btn = el.querySelector('.btn-office-upgrade');
  if (btn && !btn.disabled) {
    btn.onclick = () => state.onPurchaseOfficeUpgrade?.();
  }
  renderLuxuryCta(state, el);
}

function formatMegaProgressMeta(goal, progress) {
  if (!progress) return '';
  if (progress.unit === 'nw') return `${fmt(progress.current)} / ${fmt(progress.target)} · Vault book counts`;
  if (progress.unit === 'rep') return `${progress.current} / ${progress.target} REP`;
  if (progress.unit === 'office') return progress.complete ? 'Empire office owned' : 'Purchase Investment Empire';
  if (progress.unit === 'pct') return `${progress.current}% / ${progress.target}% collection`;
  if (progress.unit === 'count') return `${progress.current} / ${progress.target} legendaries`;
  return '';
}

/**
 * @param {object} state
 * @param {{ goal: any, progress: any, claimable: boolean, allDone: boolean }} active
 */
function renderMegaGoalCard(state, active) {
  const el = document.getElementById('dash-mega-goal');
  if (!el) return;
  if (active.allDone || !active.goal) {
    el.innerHTML = `
      <div class="dash-card-head"><span>Mega goal</span><span class="dash-soft-tag">Cleared</span></div>
      <div class="dash-goal-label">All dreams claimed</div>
      <p class="dash-office-blurb">Late cash still has luxury sinks below.</p>
    `;
    return;
  }
  const { goal, progress, claimable } = active;
  const pct = progress?.pct ?? 0;
  const tag = claimable ? 'Ready' : `${pct}%`;
  const claimBtn = claimable
    ? `<button type="button" class="btn btn-sm btn-claim-mega" data-mega-id="${escapeAttr(goal.id)}">Claim flair</button>`
    : '';
  el.innerHTML = `
    <div class="dash-card-head"><span>Mega goal</span><span class="dash-soft-tag">${escapeHtml(tag)}</span></div>
    <div class="dash-goal-label">${escapeHtml(goal.label)}</div>
    <p class="dash-office-blurb">${escapeHtml(goal.blurb)}</p>
    <div class="dash-goal-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${escapeAttr(goal.label)}">
      <div class="dash-goal-bar-fill" style="width:${pct}%"></div>
    </div>
    <div class="dash-goal-meta">${escapeHtml(formatMegaProgressMeta(goal, progress))}</div>
    ${claimBtn}
  `;
  const btn = el.querySelector('.btn-claim-mega');
  if (btn) btn.onclick = () => state.onClaimMegaGoal?.(btn.getAttribute('data-mega-id'));
}

/**
 * Compact next-luxury CTA under the office card (prestige sink only).
 * @param {object} state
 * @param {HTMLElement | null} officeEl
 */
function renderLuxuryCta(state, officeEl) {
  if (!officeEl) return;
  const next = getNextLuxuryPurchase(state);
  if (!next) {
    const done = document.createElement('div');
    done.className = 'dash-luxury-line';
    done.textContent = 'All luxuries owned.';
    officeEl.appendChild(done);
    return;
  }
  const gate = canPurchaseLuxury(state, next.id);
  const wrap = document.createElement('div');
  wrap.className = 'dash-luxury-line';
  const label = document.createElement('div');
  label.className = 'dash-office-next';
  label.textContent = `Luxury: ${next.name} · ${fmt(next.price)}`;
  wrap.appendChild(label);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-sm btn-luxury-buy';
  btn.textContent = gate.ok ? `Buy — ${fmt(next.price)}` : `Luxury — ${fmt(next.price)}`;
  btn.disabled = !gate.ok;
  if (!gate.ok) btn.title = gate.reason || '';
  else btn.onclick = () => state.onPurchaseLuxury?.(next.id);
  wrap.appendChild(btn);
  officeEl.appendChild(wrap);
}

export function renderDashboard(state) {
  const meta = state.meta || {};
  const equity = getEquity(state.portfolio);
  const debt = state.finance ? getTotalDebt(state.finance) : 0;
  const vaultBook = getVaultBookValue(state);
  const net = equity - debt + vaultBook;
  const tradingEquity = equity - debt;
  const hist = meta.equityHistory || [];
  const startEq = hist[0]?.equity ?? tradingEquity;
  const delta = tradingEquity - startEq;

  const profile = getProfile();
  const standing = getPlayerStanding(state, {
    cosmetics: profile?.cosmetics || {},
    blackMarketPool: BLACKMARKET_ITEM_POOL,
    seatItem: THE_SEAT,
    salonPool: PRIVATE_SALON_POOL,
  });
  const office = getEffectiveOfficeTier(state);
  const officeView = { current: office };
  const megaCtx = {
    netWorth: net,
    blackMarketPool: BLACKMARKET_ITEM_POOL,
    seatItem: THE_SEAT,
    salonPool: PRIVATE_SALON_POOL,
  };
  const activeMega = getActiveMegaGoal(state, megaCtx);
  const aura = getVaultDeskAura({
    cosmetics: profile?.cosmetics || {},
    vaultOwned: state.vaultOwned,
    perks: state.perks,
  });

  renderDashHero(profile, standing, officeView, net);
  renderDashStanding(standing);
  renderOfficeStageCard(state, office, net, standing.rep);
  renderMegaGoalCard(state, activeMega);

  const deltaEl = document.getElementById('dash-equity-delta');
  if (deltaEl) {
    deltaEl.textContent = `${delta >= 0 ? '+' : ''}$${Math.round(delta).toLocaleString()}`;
    deltaEl.className = delta >= 0 ? 'up' : 'down';
  }

  const stats = document.getElementById('dash-stats');
  if (stats) {
    const nums = stats.querySelectorAll('.dash-stat-card .stat-num');
    if (nums.length === 4) {
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
  if (chBox) {
    chBox.innerHTML = '';
    chBox.setAttribute('hidden', '');
    chBox.setAttribute('aria-hidden', 'true');
  }
  const chHtml = ch ? `
    <div class="challenge-card interactive-card ${ch.completed ? 'done' : ''}">
      <div class="challenge-name">${ch.completed ? '✓ ' : ''}${escapeHtml(ch.name)}</div>
      <div class="challenge-desc">${escapeHtml(ch.desc)}</div>
      <div class="challenge-meta">Progress: ${Math.round(ch.progress || 0)} / ${ch.target} · Reward $${ch.reward.toLocaleString()} +${ch.rep} REP</div>
      ${ch.completed && !ch.claimed ? '<button type="button" class="btn btn-accent btn-claim-challenge">Claim reward</button>' : ''}
      ${ch.claimed ? '<span class="ach-claimed">CLAIMED</span>' : ''}
    </div>` : '<div class="empty">Challenge loads at day start — keep trading until then.</div>';
  if (chDetail) chDetail.innerHTML = chHtml;
  document.querySelectorAll('.btn-claim-challenge').forEach((btn) => {
    btn.onclick = () => state.onClaimChallenge?.();
  });

  drawEquityChart(hist, tradingEquity);

  const recent = document.getElementById('dash-recent');
  if (recent) {
    const trades = (state.portfolio.history || []).slice(0, 6);
    recent.innerHTML = trades.length
      ? trades.map(t => `<div class="dash-row"><span>${t.action} ${t.sym}</span><span>×${t.shares} @ $${Number(t.price).toFixed(2)}</span></div>`).join('')
      : '<div class="empty">No flips yet — open the Trade Desk and make your first move.</div>';
  }

  const firm = document.getElementById('dash-firm');
  if (firm) {
    const staffN = state.staff?.length || 0;
    const perksN = state.perks?.length || 0;
    const flagship = getFlagshipEquippedVaultItem(profile?.cosmetics, state.vaultOwned);
    firm.innerHTML = `
      <div class="dash-row"><span>Office</span><span>${escapeHtml(office.name)}</span></div>
      <div class="dash-row"><span>Staff</span><span>${staffN}</span></div>
      <div class="dash-row"><span>Perks</span><span>${perksN}</span></div>
      ${buildFirmRelicRowHtml(state)}
      ${flagship ? `<div class="dash-row" title="Highest-appraisal equipped collectible"><span>Flagship</span><span>${escapeHtml(flagship.name)} · ${fmt(flagship.cost)}</span></div>` : ''}
      <div class="dash-row"><span>Personal credit</span><span>${state.finance?.personalCredit ?? 680}</span></div>
      <div class="dash-row"><span>Business credit</span><span>${state.finance?.businessCredit ?? 700}</span></div>
      <div class="dash-row"><span>Rank</span><span>${escapeHtml(standing.rankName)}</span></div>
      ${standing.deskLabel ? `<div class="dash-row" title="${escapeAttr(aura.summary || '')}"><span>Desk</span><span>${escapeHtml(standing.deskLabel)}</span></div>` : ''}
      ${standing.flair ? `<div class="dash-row"><span>Flair</span><span>${escapeHtml(standing.flair)}</span></div>` : ''}
    `;
  }

  const lb = document.getElementById('dash-leaderboard');
  if (lb) {
    const runs = getLeaderboard();
    const flairBits = [];
    if (standing.titleName) flairBits.push(standing.titleName);
    if (standing.flair) flairBits.push(standing.flair);
    if (standing.seatOwned) flairBits.push(THE_SEAT.name);
    flairBits.push(`Collection ${standing.collectionScore}`);
    const identity = `<div class="dash-player-identity"><strong>${escapeHtml(profile.name)}</strong>${flairBits.length ? `<span>${escapeHtml(flairBits.join(' · '))}</span>` : ''}</div>`;
    lb.innerHTML = runs.length
      ? identity + runs.slice(0, 5).map((r, i) => `
        <div class="dash-row ${i === 0 ? 'lb-best' : ''}">
          <span>#${i + 1} Day ${r.day} · REP ${r.rep ?? 0}</span>
          <span>$${r.equity.toLocaleString()}</span>
        </div>`).join('')
      : identity + '<div class="empty">Your best runs appear here — grow equity to set a record.</div>';
  }

  document.querySelectorAll('[data-goto]').forEach((btn) => {
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
  const pts = hist.length ? hist.map((p) => p.equity) : [current];
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
