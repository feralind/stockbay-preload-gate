// @ts-check
/**
 * Dashboard view render — extracted from ui.js (Stage C1).
 * Section 2–4: Standing, office ladder, mega goals, luxury sinks.
 * Perf: fingerprint sections and skip identical DOM writes.
 */

import { getBlackMarketItem, BLACKMARKET_ITEM_POOL } from '../blackmarket.js';
import { getFlagshipEquippedVaultItem } from '../collection-log.js';
import { getCollectionSetSummary } from '../collection-flavor.js';
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

/** Last-written fingerprints — skip unchanged section HTML/text. */
/** @type {Record<string, string>} */
const dashSnap = {};

let dashGotoBound = false;

/**
 * @param {HTMLElement | null} el
 * @param {string} key
 * @param {string} html
 * @returns {boolean} true when DOM was written
 */
function setHtmlIfChanged(el, key, html) {
  if (!el) return false;
  if (dashSnap[key] === html) return false;
  dashSnap[key] = html;
  el.innerHTML = html;
  return true;
}

/**
 * @param {HTMLElement | null} el
 * @param {string} key
 * @param {string} text
 * @returns {boolean}
 */
function setTextIfChanged(el, key, text) {
  if (!el) return false;
  if (dashSnap[key] === text) return false;
  dashSnap[key] = text;
  el.textContent = text;
  return true;
}

function ensureDashGotoDelegation() {
  if (dashGotoBound) return;
  if (typeof document === 'undefined') return;
  const root = document.getElementById('view-dashboard');
  if (!root) return;
  dashGotoBound = true;
  root.addEventListener('click', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const btn = t?.closest?.('[data-goto]');
    if (!(btn instanceof HTMLElement)) return;
    const viewId = btn.getAttribute('data-goto') || btn.dataset?.goto;
    if (viewId) switchView(viewId);
  });
}

/** @param {{ switchView?: (viewId: string) => void }} [opts] */
export function configureDashboardUi({ switchView: nextSwitchView } = {}) {
  if (typeof nextSwitchView === 'function') switchView = nextSwitchView;
  ensureDashGotoDelegation();
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
  setTextIfChanged(eyeEl, 'heroEye', office.current.name);
  setTextIfChanged(titleEl, 'heroTitle', name);
  if (blurbEl) {
    const bits = [
      standing.rankName,
      `REP ${standing.rep}`,
      `Net Worth ${fmt(net)}`,
    ];
    if (standing.deskLabel) bits.push(standing.deskLabel);
    setTextIfChanged(blurbEl, 'heroBlurb', `${bits.join(' · ')}. ${office.current.blurb}`);
  }
}

function renderDashStanding(standing, state) {
  const el = document.getElementById('dash-standing');
  if (!el) return;
  const setSummary = getCollectionSetSummary(state || {});
  const chips = [
    `<span class="dash-standing-chip"><em>Rank</em> ${escapeHtml(standing.rankName)} · REP ${standing.rep}</span>`,
    `<span class="dash-standing-chip" data-gloss="diversification"><em>Collection</em> ${standing.collectionScore}</span>`,
    `<span class="dash-standing-chip" title="Immersion sets — flair only"><em>Sets</em> ${setSummary.complete}/${setSummary.total}</span>`,
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
  if (setSummary.claimable > 0) {
    chips.push(`<span class="dash-standing-chip dash-standing-ready"><em>Set flair</em> ${setSummary.claimable} ready</span>`);
  }
  setHtmlIfChanged(el, 'standing', chips.join(''));
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
  let tag = 'Owned';
  let nextLine = 'Peak office secured — Investment Empire owned.';
  let ctaHtml = '';
  if (next) {
    const gate = canPurchaseOfficeUpgrade(state, { netWorth: net, reputation: rep });
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
  const luxHtml = buildLuxuryCtaHtml(state);
  const html = `
    <div class="dash-card-head" data-gloss="office-progress"><span>Office</span><span class="dash-soft-tag">${tag}</span></div>
    <div class="dash-office-name" data-gloss="office-progress">${escapeHtml(office.name)}</div>
    <p class="dash-office-blurb">${escapeHtml(office.blurb)}</p>
    <div class="dash-office-next">${nextLine}</div>
    ${ctaHtml}
    ${luxHtml}
  `;
  if (setHtmlIfChanged(el, 'office', html)) {
    const btn = el.querySelector('.btn-office-upgrade');
    if (btn && !btn.disabled) {
      btn.onclick = () => state.onPurchaseOfficeUpgrade?.();
    }
    const luxBtn = el.querySelector('.btn-luxury-buy');
    if (luxBtn && !luxBtn.disabled) {
      const id = luxBtn.getAttribute('data-luxury-id');
      luxBtn.onclick = () => { if (id) state.onPurchaseLuxury?.(id); };
    }
  }
}

/**
 * @param {object} state
 * @returns {string}
 */
function buildLuxuryCtaHtml(state) {
  const next = getNextLuxuryPurchase(state);
  if (!next) {
    return `<div class="dash-luxury-line dash-luxury-done">`
      + `<div class="dash-office-next">Dynasty complete — every luxury owned.</div>`
      + `<p class="dash-empty-hint">Prestige sinks only. No trading edge, no Net Worth book.</p>`
      + `</div>`;
  }
  const gate = canPurchaseLuxury(state, next.id);
  const disabled = gate.ok ? '' : ' disabled';
  const title = gate.ok ? '' : ` title="${escapeAttr(gate.reason || '')}"`;
  const label = gate.ok ? `Acquire — ${fmt(next.price)}` : `Luxury — ${fmt(next.price)}`;
  return `<div class="dash-luxury-line">`
    + `<div class="dash-office-next">Luxury: ${escapeHtml(next.name)} · ${fmt(next.price)}</div>`
    + `<button type="button" class="btn btn-sm btn-luxury-buy${gate.ok ? ' btn-accent' : ''}" data-luxury-id="${escapeAttr(next.id)}"${disabled}${title}>${label}</button>`
    + `</div>`;
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
  let html;
  if (active.allDone || !active.goal) {
    html = `
      <div class="dash-card-head"><span>Mega goal</span><span class="dash-soft-tag">Cleared</span></div>
      <div class="dash-goal-label">Empire ledger clear</div>
      <p class="dash-office-blurb">Every mega goal claimed. Flair is yours — late cash still has luxury sinks on the office card.</p>
      <p class="dash-empty-hint">No more claim buttons here. Keep compounding Net Worth and Standing.</p>
    `;
  } else {
    const { goal, progress, claimable } = active;
    const pct = progress?.pct ?? 0;
    const tag = claimable ? 'Ready' : `${pct}%`;
    const claimBtn = claimable
      ? `<button type="button" class="btn btn-sm btn-accent btn-claim-mega" data-mega-id="${escapeAttr(goal.id)}">Claim flair — ${escapeHtml(goal.flair || goal.label)}</button>`
      : '';
    html = `
      <div class="dash-card-head"><span>Mega goal</span><span class="dash-soft-tag">${escapeHtml(tag)}</span></div>
      <div class="dash-goal-label">${escapeHtml(goal.label)}</div>
      <p class="dash-office-blurb">${escapeHtml(goal.blurb)}</p>
      <div class="dash-goal-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${escapeAttr(goal.label)}">
        <div class="dash-goal-bar-fill" style="width:${pct}%"></div>
      </div>
      <div class="dash-goal-meta">${escapeHtml(formatMegaProgressMeta(goal, progress))}</div>
      ${claimBtn}
    `;
  }
  if (setHtmlIfChanged(el, 'mega', html)) {
    const btn = el.querySelector('.btn-claim-mega');
    if (btn) {
      btn.onclick = () => {
        state.onClaimMegaGoal?.(btn.getAttribute('data-mega-id'));
      };
    }
  }
}

function ensureDashStatsShell(stats) {
  if (!stats) return false;
  const nums = stats.querySelectorAll('.dash-stat-card .stat-num');
  const wired = stats.querySelector('[data-gloss="net-worth"]') && stats.querySelector('[data-gloss="credit-score"]');
  if (nums.length === 4 && wired) return true;
  stats.innerHTML = `
    <div class="dash-stat-card interactive-card" data-gloss="cash"><span class="stat-lbl">Cash</span><span class="stat-num"></span></div>
    <div class="dash-stat-card interactive-card" data-gloss="net-worth"><span class="stat-lbl">Net Worth</span><span class="stat-num"></span></div>
    <div class="dash-stat-card interactive-card" data-gloss="credit-score"><span class="stat-lbl">Debt</span><span class="stat-num"></span></div>
    <div class="dash-stat-card interactive-card"><span class="stat-lbl">REP</span><span class="stat-num"></span></div>
  `;
  dashSnap.statsShell = '2';
  dashSnap.statCash = '';
  dashSnap.statNw = '';
  dashSnap.statDebt = '';
  dashSnap.statRep = '';
  return true;
}

function renderDashStats(state, net, debt, meta) {
  const stats = document.getElementById('dash-stats');
  if (!stats) return;
  ensureDashStatsShell(stats);
  const nums = stats.querySelectorAll('.dash-stat-card .stat-num');
  if (nums.length !== 4) return;
  const cash = fmt(state.portfolio.cash);
  const nw = fmt(net);
  const debtTxt = fmt(debt);
  const rep = String(meta.reputation ?? 0);
  if (dashSnap.statCash !== cash) { dashSnap.statCash = cash; nums[0].textContent = cash; }
  if (dashSnap.statNw !== nw) { dashSnap.statNw = nw; nums[1].textContent = nw; }
  if (dashSnap.statDebt !== debtTxt) {
    dashSnap.statDebt = debtTxt;
    nums[2].textContent = debtTxt;
    nums[2].classList.toggle('down', !!debt);
  }
  if (dashSnap.statRep !== rep) { dashSnap.statRep = rep; nums[3].textContent = rep; }
}

export function renderDashboard(state) {
  ensureDashGotoDelegation();

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
  renderDashStanding(standing, state);
  renderOfficeStageCard(state, office, net, standing.rep);
  renderMegaGoalCard(state, activeMega);
  renderDashStats(state, net, debt, meta);

  const deltaEl = document.getElementById('dash-equity-delta');
  if (deltaEl) {
    const deltaTxt = `${delta >= 0 ? '+' : ''}$${Math.round(delta).toLocaleString()}`;
    if (setTextIfChanged(deltaEl, 'deltaTxt', deltaTxt)) {
      deltaEl.className = delta >= 0 ? 'up' : 'down';
    }
  }

  const chartNote = document.querySelector('.dash-chart-note');
  if (chartNote instanceof HTMLElement && !chartNote.hasAttribute('data-gloss')) {
    chartNote.setAttribute('data-gloss', 'net-worth');
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
  if (setHtmlIfChanged(chDetail, 'challenge', chHtml)) {
    chDetail?.querySelectorAll('.btn-claim-challenge').forEach((btn) => {
      btn.onclick = () => state.onClaimChallenge?.();
    });
  }

  drawEquityChart(hist, tradingEquity);

  const recent = document.getElementById('dash-recent');
  if (recent) {
    const trades = (state.portfolio.history || []).slice(0, 6);
    const recentHtml = trades.length
      ? trades.map((t) => `<div class="dash-row"><span>${escapeHtml(t.action)} ${escapeHtml(t.sym)}</span><span>×${t.shares} @ $${Number(t.price).toFixed(2)}</span></div>`).join('')
      : '<div class="empty">No flips yet — open the Trade Desk and make your first move.</div>';
    setHtmlIfChanged(recent, 'recent', recentHtml);
  }

  const firm = document.getElementById('dash-firm');
  if (firm) {
    const staffN = state.staff?.length || 0;
    const perksN = state.perks?.length || 0;
    const flagship = getFlagshipEquippedVaultItem(profile?.cosmetics, state.vaultOwned);
    const pCredit = state.finance?.personalCredit ?? 680;
    const bCredit = state.finance?.businessCredit ?? 700;
    const firmHtml = `
      <div class="dash-row"><span>Office</span><span>${escapeHtml(office.name)}</span></div>
      <div class="dash-row"><span>Staff</span><span>${staffN}</span></div>
      <div class="dash-row"><span>Perks</span><span>${perksN}</span></div>
      ${buildFirmRelicRowHtml(state)}
      ${flagship ? `<div class="dash-row" title="Highest-appraisal equipped collectible"><span>Flagship</span><span>${escapeHtml(flagship.name)} · ${fmt(flagship.cost)}</span></div>` : ''}
      <div class="dash-row" data-gloss="credit-score"><span>Personal credit</span><span>${pCredit}</span></div>
      <div class="dash-row" data-gloss="credit-score"><span>Business credit</span><span>${bCredit}</span></div>
      <div class="dash-row"><span>Rank</span><span>${escapeHtml(standing.rankName)}</span></div>
      ${standing.deskLabel ? `<div class="dash-row" title="${escapeAttr(aura.summary || '')}"><span>Desk</span><span>${escapeHtml(standing.deskLabel)}</span></div>` : ''}
      ${standing.flair ? `<div class="dash-row"><span>Flair</span><span>${escapeHtml(standing.flair)}</span></div>` : ''}
    `;
    setHtmlIfChanged(firm, 'firm', firmHtml);
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
    const lbHtml = runs.length
      ? identity + runs.slice(0, 5).map((r, i) => `
        <div class="dash-row ${i === 0 ? 'lb-best' : ''}">
          <span>#${i + 1} Day ${r.day} · REP ${r.rep ?? 0}</span>
          <span>$${r.equity.toLocaleString()}</span>
        </div>`).join('')
      : identity + '<div class="empty">Your best runs appear here — grow equity to set a record.</div>';
    setHtmlIfChanged(lb, 'leaderboard', lbHtml);
  }
}

export function drawEquityChart(hist, current) {
  const canvas = document.getElementById('equity-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const pts = hist.length ? hist.map((p) => p.equity) : [current];
  if (pts.length === 1) pts.push(pts[0]);
  const sig = `${pts.length}:${pts[0]}:${pts[pts.length - 1]}:${Math.round(pts.reduce((a, b) => a + b, 0))}`;
  if (dashSnap.chartSig === sig) return;
  dashSnap.chartSig = sig;
  ctx.clearRect(0, 0, w, h);
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
