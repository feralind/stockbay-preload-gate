// @ts-check
/**
 * Dashboard view render — extracted from ui.js (Stage C1).
 * Section 2–4: Standing, office ladder, mega goals, luxury sinks.
 * Market overview chrome: index KPIs, movers ribbon, dual-line equity chart, discover grid.
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
import { getSymbolName, getSymbolSector } from '../symbols.js';
import { THE_SEAT } from '../the-seat.js';
import { getVaultBookValue, getVaultDeskAura } from '../vault.js';
import { setSelectedSym } from './selection.js';
import { escapeAttr, escapeHtml, fmt, quoteForDisplay } from './shared.js';

/** @type {(viewId: string) => void} */
let switchView = () => {};
/** @type {(sym: string) => void} */
let selectSymbol = () => {};

/** Soft eligibility helper — re-export for tests / feature audit (visuals use purchased tier). */
export const getSoftOfficeStage = getEligibleOfficeTier;

/** Re-export for existing quality tests. */
export { getNextNetWorthMilestone };

/** Last-written fingerprints — skip unchanged section HTML/text. */
/** @type {Record<string, string>} */
const dashSnap = {};

let dashGotoBound = false;
/** @type {'1D'|'5D'|'1M'|'YTD'|'6M'|'1Y'|'5Y'|'MAX'} */
let equityTf = 'MAX';
/** @type {Array<{ t?: number, equity: number, day?: number }> } */
let lastEquityHist = [];
/** @type {number} */
let lastTradingEquity = 0;
/** @type {{ pts: number[], sma: number[], labels: string[], min: number, max: number } | null} */
let chartGeom = null;
let chartHoverBound = false;

const DASH_TEAL = '#2dd4bf';
const DASH_GOLD = '#eab308';
const INDEX_SYMS = ['SPY', 'QQQ', 'DIA', 'IWM', 'GLD'];
const RIBBON_FALLBACK = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'META', 'AMD', 'SLV', 'USO', 'TLT'];

/** Fine-grained category overrides for the Discover grid's ambient theming — sits on top of getSymbolSector(). */
const DISCOVER_CATEGORY_OVERRIDES = {
  SPY: 'index', QQQ: 'index', DIA: 'index', IWM: 'index', VTI: 'index', VOO: 'index', VEA: 'index', VWO: 'index', EFA: 'index', EEM: 'index',
  GLD: 'metals', SLV: 'metals',
  USO: 'energy', UNG: 'energy',
  TLT: 'bonds', HYG: 'bonds', LQD: 'bonds',
  NVDA: 'ai', AMD: 'ai', AVGO: 'ai', SMCI: 'ai', MU: 'ai', ARM: 'ai', MRVL: 'ai', ON: 'ai', LRCX: 'ai', KLAC: 'ai', AMAT: 'ai', PLTR: 'ai',
  COIN: 'crypto', MSTR: 'crypto', MARA: 'crypto', RIOT: 'crypto', CAN: 'crypto', HOOD: 'crypto',
};

/** Ambient corner-glow theme per category — color reflects the category's real-world "vibe", corner keeps the grid varied. */
const DISCOVER_THEMES = {
  index: { color: '#38bdf8', corner: 'tr' },
  metals: { color: '#facc15', corner: 'tl' },
  bonds: { color: '#a1a1aa', corner: 'br' },
  ai: { color: '#a855f7', corner: 'br' },
  crypto: { color: '#22d3ee', corner: 'bl' },
  tech: { color: '#3b82f6', corner: 'tr' },
  finance: { color: '#10b981', corner: 'tl' },
  healthcare: { color: '#f43f5e', corner: 'br' },
  consumer: { color: '#f97316', corner: 'bl' },
  energy: { color: '#fb923c', corner: 'tr' },
  industrial: { color: '#94a3b8', corner: 'tl' },
  materials: { color: '#84cc16', corner: 'br' },
  telecom: { color: '#ec4899', corner: 'bl' },
  reit: { color: '#14b8a6', corner: 'tr' },
  growth: { color: '#facc15', corner: 'bl' },
  midcap: { color: '#8b5cf6', corner: 'tl' },
  sp500extra: { color: '#3b82f6', corner: 'tr' },
  etf: { color: '#38bdf8', corner: 'tr' },
};

function discoverTheme(sym) {
  const cat = DISCOVER_CATEGORY_OVERRIDES[sym] || getSymbolSector(sym) || 'tech';
  return DISCOVER_THEMES[cat] || DISCOVER_THEMES.tech;
}

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
    const tfBtn = t?.closest?.('[data-eq-tf]');
    if (tfBtn instanceof HTMLElement) {
      const next = /** @type {typeof equityTf} */ (tfBtn.getAttribute('data-eq-tf') || 'MAX');
      if (next !== equityTf) {
        equityTf = next;
        root.querySelectorAll('[data-eq-tf]').forEach((btn) => {
          btn.classList.toggle('active', btn.getAttribute('data-eq-tf') === equityTf);
        });
        dashSnap.chartSig = '';
        drawEquityChart(lastEquityHist, lastTradingEquity);
      }
      return;
    }
    const disc = t?.closest?.('[data-dash-sym]');
    if (disc instanceof HTMLElement) {
      const sym = disc.getAttribute('data-dash-sym');
      if (sym) {
        const key = setSelectedSym(sym);
        switchView('trade');
        selectSymbol(key || sym);
      }
      return;
    }
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
  const cards = stats.querySelectorAll('.dash-index-card');
  const wired = stats.querySelector('[data-gloss="net-worth"]') && stats.querySelector('[data-gloss="credit-score"]');
  if (cards.length === 5 && wired && dashSnap.statsShell === '3') return true;
  stats.innerHTML = `
    <div class="dash-stat-card dash-index-card interactive-card" data-gloss="cash">
      <span class="stat-lbl">Cash</span>
      <span class="stat-num" data-stat="cash"></span>
      <span class="dash-index-delta muted" data-stat-delta="cash">Buying power</span>
    </div>
    <div class="dash-stat-card dash-index-card interactive-card" data-gloss="net-worth">
      <span class="stat-lbl">Net Worth</span>
      <span class="stat-num" data-stat="nw"></span>
      <span class="dash-index-delta" data-stat-delta="nw"></span>
    </div>
    <div class="dash-stat-card dash-index-card interactive-card" data-index-sym="SPY">
      <span class="stat-lbl">S&amp;P 500</span>
      <span class="stat-num" data-stat="spy"></span>
      <span class="dash-index-delta" data-stat-delta="spy"></span>
    </div>
    <div class="dash-stat-card dash-index-card interactive-card" data-gloss="credit-score">
      <span class="stat-lbl">Debt</span>
      <span class="stat-num" data-stat="debt"></span>
      <span class="dash-index-delta muted" data-stat-delta="debt">Outstanding</span>
    </div>
    <div class="dash-stat-card dash-index-card interactive-card">
      <span class="stat-lbl">REP</span>
      <span class="stat-num" data-stat="rep"></span>
      <span class="dash-index-delta muted" data-stat-delta="rep">Standing</span>
    </div>
  `;
  dashSnap.statsShell = '3';
  dashSnap.statCash = '';
  dashSnap.statNw = '';
  dashSnap.statSpy = '';
  dashSnap.statDebt = '';
  dashSnap.statRep = '';
  return true;
}

function renderDashStats(state, net, debt, meta, delta) {
  const stats = document.getElementById('dash-stats');
  if (!stats) return;
  ensureDashStatsShell(stats);

  const cash = fmt(state.portfolio.cash);
  const nw = fmt(net);
  const debtTxt = fmt(debt);
  const rep = String(meta.reputation ?? 0);
  const spyQ = quoteForDisplay('SPY');
  const spyPx = spyQ?.price > 0
    ? spyQ.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';
  const spyChg = spyQ?.change ?? 0;
  const spyPct = spyQ?.changePct ?? 0;

  const cashEl = stats.querySelector('[data-stat="cash"]');
  const nwEl = stats.querySelector('[data-stat="nw"]');
  const spyEl = stats.querySelector('[data-stat="spy"]');
  const debtEl = stats.querySelector('[data-stat="debt"]');
  const repEl = stats.querySelector('[data-stat="rep"]');
  const nwDelta = stats.querySelector('[data-stat-delta="nw"]');
  const spyDelta = stats.querySelector('[data-stat-delta="spy"]');

  if (cashEl && dashSnap.statCash !== cash) { dashSnap.statCash = cash; cashEl.textContent = cash; }
  if (nwEl && dashSnap.statNw !== nw) { dashSnap.statNw = nw; nwEl.textContent = nw; }
  if (spyEl && dashSnap.statSpy !== spyPx) { dashSnap.statSpy = spyPx; spyEl.textContent = spyPx; }
  if (debtEl && dashSnap.statDebt !== debtTxt) {
    dashSnap.statDebt = debtTxt;
    debtEl.textContent = debtTxt;
    debtEl.classList.toggle('down', !!debt);
  }
  if (repEl && dashSnap.statRep !== rep) { dashSnap.statRep = rep; repEl.textContent = rep; }

  if (nwDelta) {
    const dTxt = `${delta >= 0 ? '+' : ''}$${Math.round(delta).toLocaleString()}`;
    const pct = net ? (delta / Math.max(Math.abs(net - delta), 1)) * 100 : 0;
    const html = `${delta >= 0 ? '▲' : '▼'} ${dTxt} <em>${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</em>`;
    if (dashSnap.statNwDelta !== html) {
      dashSnap.statNwDelta = html;
      nwDelta.className = `dash-index-delta ${delta >= 0 ? 'up' : 'down'}`;
      nwDelta.innerHTML = html;
    }
  }
  if (spyDelta && spyQ?.price > 0) {
    const html = `${spyChg >= 0 ? '▲' : '▼'} ${spyChg >= 0 ? '+' : ''}${Number(spyChg).toFixed(2)} <em>${spyPct >= 0 ? '+' : ''}${Number(spyPct).toFixed(2)}%</em>`;
    if (dashSnap.statSpyDelta !== html) {
      dashSnap.statSpyDelta = html;
      spyDelta.className = `dash-index-delta ${spyPct >= 0 ? 'up' : 'down'}`;
      spyDelta.innerHTML = html;
    }
  }
}


/**
 * @param {object} state
 * @returns {{ sym: string, name: string, price: number, changePct: number }[]}
 */
function collectMovers(state) {
  /** @type {Map<string, { sym: string, name: string, price: number, changePct: number }>} */
  const map = new Map();
  const push = (sym, name, price, changePct) => {
    const key = String(sym || '').toUpperCase();
    if (!key || !(price > 0) || map.has(key)) return;
    map.set(key, { sym: key, name: name || getSymbolName(key) || key, price, changePct: Number(changePct) || 0 });
  };
  (state.listings || []).forEach((l) => {
    const q = quoteForDisplay(l.sym);
    push(l.sym, l.name || getSymbolName(l.sym), q?.price || l.marketPrice || l.price, q?.changePct ?? l.changePct);
  });
  INDEX_SYMS.concat(RIBBON_FALLBACK).forEach((sym) => {
    const q = quoteForDisplay(sym);
    if (q?.price > 0) push(sym, getSymbolName(sym), q.price, q.changePct);
  });
  (state.watchlist || []).forEach((sym) => {
    const q = quoteForDisplay(sym);
    if (q?.price > 0) push(sym, getSymbolName(sym), q.price, q.changePct);
  });
  return [...map.values()].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
}

/** Catmull-Rom -> cubic-bezier smoothing so mini-charts read as a fluid line instead of jagged segments. */
export function smoothSparkPath(coords) {
  if (coords.length < 3) {
    return coords.map((c, i) => `${i ? 'L' : 'M'}${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(' ');
  }
  let d = `M${coords[0][0].toFixed(1)},${coords[0][1].toFixed(1)}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i === 0 ? 0 : i - 1];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2 < coords.length ? i + 2 : i + 1];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

function sparkSvg(sym, price, changePct) {
  const up = (changePct ?? 0) >= 0;
  const n = 14;
  const w = 100;
  const h = 34;
  const pad = 3;
  const seed = [...String(sym)].reduce((a, c) => a + c.charCodeAt(0), 0);
  const pts = [];
  let v = price > 0 ? price * (1 - (changePct || 0) / 180) : 100;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const wobble = Math.sin((seed + i * 17) * 0.37) * 0.011 + Math.cos((seed + i * 5) * 0.21) * 0.007;
    v = Math.max(0.01, v * (1 + wobble + ((changePct || 0) / 100) * 0.018 * t));
    pts.push(v);
  }
  pts[pts.length - 1] = price > 0 ? price : pts[pts.length - 1];
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const coords = pts.map((p, i) => {
    const x = (i / (n - 1)) * (w - pad * 2) + pad;
    const y = h - pad - ((p - min) / span) * (h - pad * 2);
    return [x, y];
  });
  const linePath = smoothSparkPath(coords);
  const first = coords[0];
  const last = coords[coords.length - 1];
  const areaPath = `${linePath} L${last[0].toFixed(1)},${h} L${first[0].toFixed(1)},${h} Z`;
  const uid = `spk${seed.toString(36)}${n}`;
  return `<svg class="dash-mini-spark ${up ? 'up' : 'down'}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="${uid}f" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="currentColor" stop-opacity="0.4"></stop>
        <stop offset="100%" stop-color="currentColor" stop-opacity="0"></stop>
      </linearGradient>
      <linearGradient id="${uid}l" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="currentColor" stop-opacity="0.5"></stop>
        <stop offset="100%" stop-color="currentColor" stop-opacity="1"></stop>
      </linearGradient>
    </defs>
    <path class="spark-area" d="${areaPath}" fill="url(#${uid}f)"></path>
    <path class="spark-line" d="${linePath}" stroke="url(#${uid}l)"></path>
    <circle class="dash-spark-dot" cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.4"></circle>
  </svg>`;
}

function renderTickerRibbon(state) {
  const el = document.getElementById('dash-ticker-ribbon');
  if (!el) return;
  const movers = collectMovers(state).slice(0, 8);
  if (!movers.length) {
    setHtmlIfChanged(el, 'ribbon', '<div class="empty">Market tape warms up as quotes load.</div>');
    return;
  }
  const html = movers.map((m) => {
    const up = m.changePct >= 0;
    const cls = up ? 'up' : 'down';
    const arrow = up ? '▲' : '▼';
    return `<button type="button" class="dash-ticker-card" data-dash-sym="${escapeAttr(m.sym)}" title="Open ${escapeAttr(m.sym)}">
      <span class="dash-ticker-trend ${cls}">${arrow}</span>
      <span class="dash-ticker-name">${escapeHtml(m.name)}</span>
      <span class="dash-ticker-price">${m.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      <span class="dash-ticker-pct ${cls}">${up ? '+' : ''}${m.changePct.toFixed(2)}%</span>
    </button>`;
  }).join('');
  setHtmlIfChanged(el, 'ribbon', html);
}

function renderDiscover(state) {
  const el = document.getElementById('dash-discover');
  if (!el) return;
  const watch = Array.isArray(state.watchlist) ? state.watchlist : [];
  const pool = collectMovers(state);
  const prefer = [...new Set([...watch, ...INDEX_SYMS, ...pool.map((m) => m.sym)])];
  const cards = prefer.slice(0, 8).map((sym) => {
    const q = quoteForDisplay(sym);
    const price = q?.price || 0;
    const pct = q?.changePct || 0;
    const name = getSymbolName(sym) || sym;
    if (!(price > 0)) return '';
    const theme = discoverTheme(sym);
    return `<button type="button" class="dash-discover-card dash-glow-${theme.corner}" style="--cat-glow:${theme.color}" data-dash-sym="${escapeAttr(sym)}">
      <div class="dash-discover-top">
        <span class="dash-discover-name">${escapeHtml(name)}</span>
        <span class="dash-discover-ticker">${escapeHtml(sym)}</span>
      </div>
      <div class="dash-discover-price">${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
      ${sparkSvg(sym, price, pct)}
    </button>`;
  }).filter(Boolean).join('');
  setHtmlIfChanged(el, 'discover', cards || '<div class="empty">Add names to your watchlist to fill Discover.</div>');
}

function renderAssetTable(state) {
  const recent = document.getElementById('dash-recent');
  if (!recent) return;
  const trades = (state.portfolio.history || []).slice(0, 8);
  const movers = collectMovers(state).slice(0, 6);
  let rows = '';
  if (trades.length) {
    rows = trades.map((t) => {
      const q = quoteForDisplay(t.sym);
      const pct = q?.changePct || 0;
      const up = pct >= 0;
      const px = Number(t.price) || q?.price || 0;
      return `<tr class="dash-asset-row" data-dash-sym="${escapeAttr(t.sym)}">
        <td class="dash-asset-check"><span class="dash-check" aria-hidden="true"></span></td>
        <td><strong>${escapeHtml(t.action)} ${escapeHtml(t.sym)}</strong><div class="muted-text">${escapeHtml(getSymbolName(t.sym) || '')}</div></td>
        <td class="num">${px.toFixed(2)}</td>
        <td class="num ${up ? 'up' : 'down'}">${up ? '+' : ''}${(q?.change || 0).toFixed(2)}</td>
        <td><span class="dash-pct-pill ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${up ? '+' : ''}${pct.toFixed(2)}%</span></td>
        <td class="num muted-text">×${t.shares}</td>
      </tr>`;
    }).join('');
  } else if (movers.length) {
    rows = movers.map((m) => {
      const up = m.changePct >= 0;
      const chg = m.price * (m.changePct / 100);
      return `<tr class="dash-asset-row" data-dash-sym="${escapeAttr(m.sym)}">
        <td class="dash-asset-check"><span class="dash-check" aria-hidden="true"></span></td>
        <td><strong>${escapeHtml(m.name)}</strong><div class="muted-text">${escapeHtml(m.sym)}</div></td>
        <td class="num">${m.price.toFixed(2)}</td>
        <td class="num ${up ? 'up' : 'down'}">${up ? '+' : ''}${chg.toFixed(2)}</td>
        <td><span class="dash-pct-pill ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${up ? '+' : ''}${m.changePct.toFixed(2)}%</span></td>
        <td class="num muted-text">Tape</td>
      </tr>`;
    }).join('');
  }
  const html = rows
    ? `<table class="dash-tape-table"><thead><tr>
        <th></th><th>Name</th><th>Price</th><th>Change</th><th>%</th><th></th>
      </tr></thead><tbody>${rows}</tbody></table>`
    : '<div class="empty">No flips yet — open the Trade Desk and make your first move.</div>';
  setHtmlIfChanged(recent, 'recent', html);
}

/**
 * @param {Array<{ t?: number, equity: number, day?: number, phase?: string }>} hist
 * @param {string} tf
 */
function filterEquityHist(hist, tf) {
  if (!hist?.length) return [];
  if (tf === 'MAX') return hist.slice();
  const maxDay = Math.max(...hist.map((p) => Number(p.day) || 0));
  const dayWindow = {
    '1D': 1,
    '5D': 5,
    '1M': 22,
    YTD: Math.max(1, maxDay),
    '6M': 130,
    '1Y': 260,
    '5Y': 9999,
  }[tf] ?? Infinity;
  if (Number.isFinite(dayWindow) && maxDay > 0) {
    const minDay = maxDay - dayWindow + 1;
    const byDay = hist.filter((p) => (Number(p.day) || 0) >= minDay);
    if (byDay.length >= 2) return byDay;
  }
  const now = hist[hist.length - 1]?.t || Date.now();
  const msWindow = {
    '1D': 1,
    '5D': 5,
    '1M': 30,
    YTD: 365,
    '6M': 180,
    '1Y': 365,
    '5Y': 365 * 5,
  }[tf];
  if (!msWindow) return hist.slice();
  const cut = now - msWindow * 86400000;
  const byTime = hist.filter((p) => (p.t || 0) >= cut);
  return byTime.length >= 2 ? byTime : hist.slice(-Math.max(2, Math.min(hist.length, msWindow + 1)));
}

function smaSeries(pts, window = 5) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const from = Math.max(0, i - window + 1);
    const slice = pts.slice(from, i + 1);
    out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return out;
}

function ensureChartHover() {
  if (chartHoverBound) return;
  const canvas = document.getElementById('equity-chart');
  if (!(canvas instanceof HTMLCanvasElement)) return;
  chartHoverBound = true;
  canvas.addEventListener('mousemove', (e) => {
    if (!chartGeom?.pts?.length) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const padL = 44;
    const padR = 12;
    const plotW = canvas.width - padL - padR;
    const i = Math.round(((x - padL) / plotW) * (chartGeom.pts.length - 1));
    const idx = Math.max(0, Math.min(chartGeom.pts.length - 1, i));
    paintEquityChart(canvas, chartGeom, idx);
  });
  canvas.addEventListener('mouseleave', () => {
    if (!chartGeom) return;
    paintEquityChart(canvas, chartGeom, -1);
  });
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ pts: number[], sma: number[], labels: string[], min: number, max: number }} geom
 * @param {number} hoverIdx
 */
function paintEquityChart(canvas, geom, hoverIdx = -1) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const padL = 44;
  const padR = 12;
  const padT = 12;
  const padB = 22;
  const { pts, sma, min, max } = geom;
  const span = max - min || 1;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const xAt = (i) => padL + (i / Math.max(pts.length - 1, 1)) * plotW;
  const yAt = (v) => padT + plotH - ((v - min) / span) * plotH;

  ctx.clearRect(0, 0, w, h);

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  ctx.fillStyle = '#71717a';
  for (let g = 0; g <= 4; g++) {
    const y = padT + (plotH * g) / 4;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
    const val = max - (span * g) / 4;
    ctx.fillText(`$${Math.round(val).toLocaleString()}`, 4, y + 3);
  }

  // Gold SMA
  if (sma.length > 1) {
    ctx.strokeStyle = DASH_GOLD;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    sma.forEach((v, i) => {
      const x = xAt(i);
      const y = yAt(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  // Teal equity
  ctx.strokeStyle = DASH_TEAL;
  ctx.lineWidth = 2;
  ctx.beginPath();
  pts.forEach((v, i) => {
    const x = xAt(i);
    const y = yAt(v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  if (hoverIdx >= 0 && hoverIdx < pts.length) {
    const x = xAt(hoverIdx);
    const y = yAt(pts[hoverIdx]);
    // Hatch band
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 10, padT, 20, plotH);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let hx = x - 14; hx < x + 14; hx += 3) {
      ctx.beginPath();
      ctx.moveTo(hx, padT);
      ctx.lineTo(hx + 8, padT + plotH);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = 'rgba(250,250,250,0.35)';
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + plotH);
    ctx.stroke();
    ctx.fillStyle = DASH_TEAL;
    ctx.beginPath();
    ctx.arc(x, y, 3.2, 0, Math.PI * 2);
    ctx.fill();
    const label = geom.labels[hoverIdx] || '';
    const tip = `${label}  $${Math.round(pts[hoverIdx]).toLocaleString()}`;
    ctx.fillStyle = 'rgba(15,15,18,0.92)';
    const tw = ctx.measureText(tip).width + 12;
    const tx = Math.min(Math.max(padL, x - tw / 2), w - padR - tw);
    ctx.fillRect(tx, 2, tw, 16);
    ctx.fillStyle = '#e4e4e7';
    ctx.fillText(tip, tx + 6, 13);
  }
}

export function drawEquityChart(hist, current) {
  const canvas = document.getElementById('equity-chart');
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const filtered = filterEquityHist(hist || [], equityTf);
  let pts = filtered.length ? filtered.map((p) => p.equity) : [current];
  if (pts.length === 1) pts = [pts[0], pts[0]];
  const sma = smaSeries(pts, Math.max(3, Math.min(8, Math.floor(pts.length / 4) || 3)));
  const labels = filtered.length
    ? filtered.map((p) => (p.day != null ? `Day ${p.day}` : ''))
    : ['Now', 'Now'];
  while (labels.length < pts.length) labels.push('');
  const min = Math.min(...pts, ...sma) * 0.998;
  const max = Math.max(...pts, ...sma) * 1.002 || min + 1;
  const sig = `${equityTf}:${pts.length}:${pts[0]}:${pts[pts.length - 1]}:${Math.round(pts.reduce((a, b) => a + b, 0))}`;
  if (dashSnap.chartSig === sig && chartGeom) return;
  dashSnap.chartSig = sig;
  chartGeom = { pts, sma, labels, min, max };
  ensureChartHover();
  paintEquityChart(canvas, chartGeom, -1);
}

export function renderDashboard(state) {
  ensureDashGotoDelegation();
  if (typeof state?.onSelectSymbol === 'function') {
    selectSymbol = (sym) => { state.onSelectSymbol?.(sym); };
  }

  const meta = state.meta || {};
  const equity = getEquity(state.portfolio);
  const debt = state.finance ? getTotalDebt(state.finance) : 0;
  const vaultBook = getVaultBookValue(state);
  const net = equity - debt + vaultBook;
  const tradingEquity = equity - debt;
  const hist = meta.equityHistory || [];
  lastEquityHist = hist;
  const startEq = hist[0]?.equity ?? tradingEquity;
  const delta = tradingEquity - startEq;
  lastTradingEquity = tradingEquity;

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
  renderDashStats(state, net, debt, meta, delta);
  renderTickerRibbon(state);
  renderDiscover(state);
  renderAssetTable(state);

  const priceEl = document.getElementById('dash-chart-price');
  if (priceEl) setTextIfChanged(priceEl, 'chartPrice', fmt(tradingEquity));

  const crumbs = document.getElementById('dash-chart-crumbs');
  if (crumbs) setTextIfChanged(crumbs, 'crumbs', 'HOME › TRADING EQUITY');

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

  // Sync TF active state
  document.querySelectorAll('#dash-equity-tfs [data-eq-tf]').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-eq-tf') === equityTf);
  });

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
