// @ts-check
/**
 * Portfolio view render — extracted from ui.js (Phase 2).
 */

import { logoMarkHtml } from '../logos.js';
import {
  getFirmNetWorth, getPositionValue, getUnrealizedPnL, estimateOptionValue,
} from '../portfolio.js';
import { getFirmDebt } from '../finance.js';
import { getEstateCategoryBookValues, syncEstateDerived } from '../estates.js';
import { getVaultBookValue } from '../vault.js';
import { getSymbolMeta, getSymbolName } from '../symbols.js';
import { escapeHtml, fmt, fmtPnL, quoteForDisplay } from './shared.js';

/** Estates / cash cake colors — StockWay blues/teals/ambers (not purple-on-white AI default). */
const FIRM_ALLOC_COLORS = {
  cash: '#10b981',
  residences: '#f59e0b',
  penthouses: '#60a5fa',
  yachts: '#14b8a6',
  cars: '#94a3b8',
  islands: '#22c55e',
};

let portfolioSort = { key: 'value', dir: 'desc' };
/** Selected holding on the full portfolio page (for the detail panel). */
let portfolioFocusSym = null;

let portfolioUiActions = {
  switchView: (_viewId) => {},
  openOrderConfirm: (_draft, _state) => {},
};

export function configurePortfolioUi(actions = {}) {
  portfolioUiActions = { ...portfolioUiActions, ...actions };
}

function positionHtml(r, state) {
  const dayPct = Number(r.dayPct) || 0;
  const dayCls = dayPct >= 0 ? 'up' : 'down';
  const dayStr = `${dayPct >= 0 ? '+' : ''}${dayPct.toFixed(2)}% today`;
  const correctedBadge = r.priceCorrectedAck
    ? '<span class="pos-corrected" title="Quote was corrected from a seed price to live. Your average cost was kept.">corrected</span>'
    : '';
  return `
    <div class="position ${r.side.toLowerCase().includes('short') ? 'short-pos' : ''}" data-sym="${r.sym}">
      <div>
        <span class="pos-sym">${r.sym}${r.simulated !== undefined ? `<span class="feed-dot ${r.simulated ? 'sim' : 'live'}" title="${r.simulated ? 'Simulated drift' : 'Live-anchored'}"></span>` : ''}${correctedBadge}</span>
        <span class="pos-side">${r.side}</span> ×${r.shares}
        <div class="pos-day ${dayCls}">${dayStr}</div>
      </div>
      <div class="pos-right">
        <div>${fmt(r.val)}</div>
        <div class="${r.pl >= 0 ? 'up' : 'down'}">${fmtPnL(r.pl)}${r.plPct != null ? ` · ${r.plPct >= 0 ? '+' : ''}${r.plPct.toFixed(1)}%` : ''}</div>
        <div class="pos-actions">
          ${r.optId ? `<button class="btn-sm sell-opt" data-id="${r.optId}">Close</button>` :
            r.side === 'LONG' ? `<button class="btn-sm sell-long" data-sym="${r.sym}">Sell</button>` :
            `<button class="btn-sm cover-short" data-sym="${r.sym}">Cover</button>`}
        </div>
      </div>
    </div>`;
}

function getPositionRows(portfolio) {
  const rows = [];
  Object.entries(portfolio.longs).forEach(([sym, p]) => {
    const q = quoteForDisplay(sym);
    const price = q?.price || p.avgPrice;
    const cost = p.shares * p.avgPrice;
    const pl = (price - p.avgPrice) * p.shares;
    const dayPct = Number(q?.changePct) || 0;
    const dayChg = q?.change != null ? Number(q.change) : price * dayPct / 100;
    rows.push({
      sym,
      name: getSymbolName(sym) || sym,
      side: 'LONG',
      shares: p.shares,
      price,
      val: p.shares * price,
      cost,
      pl,
      plPct: cost > 0 ? (pl / cost) * 100 : 0,
      avg: p.avgPrice,
      dayPct,
      dayChg: dayChg * p.shares,
      stopLoss: p.stopLoss,
      takeProfit: p.takeProfit,
      simulated: q?.simulated !== false,
      priceCorrectedAck: !!p.priceCorrectedAck,
    });
  });
  Object.entries(portfolio.shorts).forEach(([sym, p]) => {
    const q = quoteForDisplay(sym);
    const price = q?.price || p.avgPrice;
    const notional = p.shares * p.avgPrice;
    const pl = (p.avgPrice - price) * p.shares;
    const dayPct = Number(q?.changePct) || 0;
    const dayChg = q?.change != null ? Number(q.change) : price * dayPct / 100;
    rows.push({
      sym,
      name: getSymbolName(sym) || sym,
      side: 'SHORT',
      shares: p.shares,
      price,
      val: p.shares * price,
      cost: notional,
      pl,
      plPct: notional > 0 ? (pl / notional) * 100 : 0,
      avg: p.avgPrice,
      dayPct,
      // Short benefits when the name is down today
      dayChg: -dayChg * p.shares,
      stopLoss: p.stopLoss,
      takeProfit: p.takeProfit,
      simulated: q?.simulated !== false,
      priceCorrectedAck: !!p.priceCorrectedAck,
    });
  });
  portfolio.options.forEach(opt => {
    const val = estimateOptionValue(opt);
    const cost = opt.premium * opt.qty * 100;
    const pl = val - cost;
    const q = quoteForDisplay(opt.sym);
    const dayPct = Number(q?.changePct) || 0;
    rows.push({
      sym: opt.sym,
      name: getSymbolName(opt.sym) || opt.sym,
      side: `${opt.type.toUpperCase()} $${opt.strike}`,
      shares: opt.qty,
      price: opt.premium,
      val,
      cost,
      pl,
      plPct: cost > 0 ? (pl / cost) * 100 : 0,
      avg: opt.premium,
      dayPct,
      dayChg: 0,
      optId: opt.id,
      expiryDays: opt.expiryDays,
      simulated: q?.simulated !== false,
    });
  });
  return rows;
}

export function renderPortfolio(state, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const rows = getPositionRows(state.portfolio);
  if (containerId === 'portfolio-full') {
    renderPortfolioFull(container, rows, state);
    return;
  }
  if (!rows.length) {
    container.innerHTML = '<div class="empty">No positions. Snipe a listing or trade from the chart.</div>';
    return;
  }
  container.innerHTML = rows.map(r => positionHtml(r, state)).join('');
  bindPositionActions(container, state);
}

function firmNetWorthFromState(state) {
  syncEstateDerived(state);
  const debt = state.finance
    ? getFirmDebt(state.finance, state.estateCreditUsed)
    : Math.max(0, Number(state.estateCreditUsed) || 0);
  const estateEquity = Math.max(0, Number(state.estateEquity) || 0);
  return {
    debt,
    estateEquity,
    equity: getFirmNetWorth(state.portfolio, {
      debt,
      vaultBook: getVaultBookValue(state),
      estateEquity,
    }),
  };
}

/**
 * Firm / estates allocation slices: liquid cash (ready to deploy) + estate category book values.
 * Trading book / open positions are a separate stock allocation — never mixed in here.
 * @param {object} state
 * @returns {{ id: string, label: string, value: number, color: string }[]}
 */
export function buildFirmAllocationSlices(state) {
  const cash = Math.max(0, Number(state.portfolio?.cash) || 0);
  /** @type {{ id: string, label: string, value: number, color: string }[]} */
  const slices = [];
  if (cash > 0) {
    slices.push({
      id: 'cash',
      label: 'Cash',
      value: cash,
      color: FIRM_ALLOC_COLORS.cash,
    });
  }
  for (const cat of getEstateCategoryBookValues(state)) {
    if (cat.value <= 0) continue;
    slices.push({
      id: cat.id,
      label: cat.name,
      value: cat.value,
      color: FIRM_ALLOC_COLORS[cat.id] || '#8b949e',
    });
  }
  return slices;
}

function renderPortfolioFull(container, rows, state) {
  const portfolio = state.portfolio;
  const tradingBook = Math.max(0, getPositionValue(portfolio));
  const { equity: firmEquity, estateEquity } = firmNetWorthFromState(state);
  const equity = Math.max(1, firmEquity);
  const cash = portfolio.cash || 0;
  const realized = portfolio.realizedPnL || 0;
  const unrealized = getUnrealizedPnL(portfolio);
  const hist = state.meta?.equityHistory || [];
  const wins = (portfolio.history || []).filter(t => (t.pnl || 0) > 0).length;
  const closed = (portfolio.history || []).filter(t => t.pnl != null).length;
  const winRate = closed ? Math.round((wins / closed) * 100) : 0;
  const maxDrawdown = calcMaxDrawdown(hist);
  const dayMove = rows.reduce((s, r) => s + (Number(r.dayChg) || 0), 0);
  const firmSlices = buildFirmAllocationSlices(state);
  const sorted = [...rows].sort((a, b) => {
    const dir = portfolioSort.dir === 'asc' ? 1 : -1;
    const key = portfolioSort.key;
    const av = key === 'sym' || key === 'name' ? a[key] : Number(a[key] ?? 0);
    const bv = key === 'sym' || key === 'name' ? b[key] : Number(b[key] ?? 0);
    return av > bv ? dir : av < bv ? -dir : 0;
  });

  if (portfolioFocusSym) {
    const stillThere = rows.some((r) => (r.optId ? `OPT:${r.optId}` : r.sym) === portfolioFocusSym);
    if (!stillThere) {
      const first = sorted[0];
      portfolioFocusSym = first ? (first.optId ? `OPT:${first.optId}` : first.sym) : null;
    }
  } else if (sorted.length) {
    const first = sorted[0];
    portfolioFocusSym = first.optId ? `OPT:${first.optId}` : first.sym;
  }

  const focusRow = sorted.find((r) => (
    (r.optId ? `OPT:${r.optId}` : r.sym) === portfolioFocusSym
  )) || sorted[0] || null;

  const recent = (portfolio.history || []).slice(0, 8);
  const estateMetric = estateEquity > 0
    ? `<div class="metric-card" data-tour="estates" data-gloss="estate-equity"><span class="stat-lbl">Estates</span><span class="stat-num">${fmt(estateEquity)}</span></div>`
    : '';
  const allocHead = rows.length
    ? `${rows.length} holding${rows.length === 1 ? '' : 's'}`
    : 'No positions';
  const stockBlockBody = focusRow
    ? portfolioDetailHtml(focusRow, {
      equity,
      holdingsTotal: rows.reduce((s, r) => s + Math.max(0, Number(r.val) || 0), 0),
    })
    : portfolioStockEmptyHtml({ tradingBook, cash });

  container.innerHTML = `
    <div class="portfolio-page">
      <div class="portfolio-hero">
        <div>
          <div class="help-section-label">PORTFOLIO</div>
          <h3>Holdings &amp; performance</h3>
          <p class="muted-text">See day moves, unrealized P&amp;L, and sell or cover right from here.</p>
        </div>
        <div class="portfolio-total" data-tour="equity" data-gloss="total-equity">
          <span>Total equity</span>
          <strong>${fmt(equity)}</strong>
          <small class="${unrealized >= 0 ? 'up' : 'down'}">Open P&amp;L ${fmtPnL(unrealized)}</small>
          <small class="${dayMove >= 0 ? 'up' : 'down'}">Day on holdings ${fmtPnL(dayMove)}</small>
        </div>
      </div>
      <div class="portfolio-metrics">
        <div class="metric-card" data-tour="cash" data-gloss="cash"><span class="stat-lbl">Cash</span><span class="stat-num">${fmt(cash)}</span></div>
        ${estateMetric}
        <div class="metric-card" data-tour="openPnl" data-gloss="open-pnl"><span class="stat-lbl">Open P&amp;L</span><span class="stat-num ${unrealized >= 0 ? 'up' : 'down'}">${fmtPnL(unrealized)}</span></div>
        <div class="metric-card" data-tour="realized" data-gloss="realized"><span class="stat-lbl">Realized</span><span class="stat-num ${realized >= 0 ? 'up' : 'down'}">${fmtPnL(realized)}</span></div>
        <div class="metric-card" data-tour="winRate" data-gloss="win-rate"><span class="stat-lbl">Win rate</span><span class="stat-num">${closed ? `${winRate}%` : '—'}</span></div>
        <div class="metric-card" data-tour="positions" data-gloss="positions"><span class="stat-lbl">Positions</span><span class="stat-num">${rows.length}</span></div>
        <div class="metric-card" data-tour="drawdown" data-gloss="drawdown"><span class="stat-lbl">Max drawdown</span><span class="stat-num down">${maxDrawdown.toFixed(1)}%</span></div>
      </div>
      <div class="portfolio-layout">
        <div class="allocation-card">
          <div class="dash-card-head"><span>Allocation</span><span>${allocHead}</span></div>
          <div class="alloc-block alloc-block-stocks">
            <div class="alloc-block-label">Stocks</div>
            <canvas id="allocation-pie" width="280" height="180"></canvas>
            ${stockBlockBody}
          </div>
          <div class="alloc-block alloc-block-firm">
            <div class="alloc-block-label">Estates &amp; cash</div>
            <canvas id="firm-allocation-pie" width="280" height="150"></canvas>
            ${firmAllocLegendHtml(firmSlices)}
          </div>
        </div>
        <div class="holdings-card">
          <div class="dash-card-head">
            <span>Open positions</span>
            <button type="button" class="btn btn-accent port-goto-trade" id="port-goto-trade">Open Trade Desk</button>
          </div>
          ${rows.length
            ? holdingsTable(sorted, equity, focusRow)
            : portfolioEmptyHoldingsHtml(estateEquity)}
        </div>
      </div>
      <div class="portfolio-activity">
        <div class="dash-card-head"><span>Recent activity</span><span>${recent.length ? `${recent.length} latest` : 'None yet'}</span></div>
        ${recent.length ? `
          <div class="port-activity-list">
            ${recent.map((t) => {
              const pnl = t.pnl;
              const cls = pnl > 0 ? 'up' : pnl < 0 ? 'down' : '';
              return `<div class="port-activity-row">
                <span class="port-act-sym">${escapeHtml(t.sym || '—')}</span>
                <span class="port-act-action">${escapeHtml(t.action || '')}</span>
                <span class="port-act-meta">${t.shares || t.qty || ''} @ $${Number(t.price || 0).toFixed(2)}</span>
                <span class="port-act-pnl ${cls}">${pnl != null ? fmtPnL(pnl) : '—'}</span>
              </div>`;
            }).join('')}
          </div>
        ` : `<div class="port-activity-empty muted-text">Closed trades and fills will show up here.</div>`}
      </div>
    </div>`;

  container.querySelectorAll('[data-sort]').forEach((th) => {
    th.onclick = () => {
      const key = th.dataset.sort;
      portfolioSort = portfolioSort.key === key
        ? { key, dir: portfolioSort.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'sym' ? 'asc' : 'desc' };
      renderPortfolioFull(container, rows, state);
    };
  });
  drawStockAllocationPie(rows);
  drawFirmAllocationCake(firmSlices);
  bindPortfolioFullActions(container, rows, state);
}

function portfolioEmptyHoldingsHtml(estateEquity = 0) {
  const blurb = estateEquity > 0
    ? 'No open stock positions — estate equity still counts in Total Equity above. Open a long, short, or option from the trade desk when you are ready.'
    : 'Your book is cash-only right now. Open a long, short, or option from the trade desk — then sell or cover from this page.';
  return `
    <div class="port-empty">
      <div class="port-empty-title">No open positions</div>
      <p class="muted-text">${blurb}</p>
      <button type="button" class="btn btn-accent port-goto-trade">Open Trade Desk</button>
    </div>`;
}

function portfolioStockEmptyHtml({ tradingBook = 0, cash = 0 } = {}) {
  return `
    <div class="port-detail port-detail-empty port-detail-stock">
      <div class="port-detail-label">Trading book</div>
      <div class="port-detail-cash">${fmt(tradingBook)}</div>
      <p class="muted-text port-alloc-tip">No open positions — ${fmt(cash)} cash sits ready to deploy in Estates &amp; cash below. Trade from the desk to fill this book.</p>
    </div>`;
}

/**
 * @param {{ id: string, label: string, value: number, color: string }[]} slices
 */
function firmAllocLegendHtml(slices = []) {
  const total = slices.reduce((s, x) => s + Math.max(0, Number(x.value) || 0), 0);
  if (!slices.length || total <= 0) {
    return `<div class="port-detail port-detail-empty port-detail-alloc">
      <p class="muted-text port-alloc-tip">Cash and owned estate categories will show here once you have deployable cash or holdings in Estates.</p>
    </div>`;
  }
  return `
    <div class="port-detail port-detail-empty port-detail-alloc">
      <div class="port-alloc-legend" role="list">
        ${slices.map((s) => {
          const pct = total > 0 ? (s.value / total) * 100 : 0;
          const hint = s.id === 'cash' ? 'Ready to deploy' : 'Owned book value';
          return `<div class="port-alloc-row" role="listitem" data-alloc="${escapeHtml(s.id)}">
            <span class="port-alloc-swatch" style="background:${escapeHtml(s.color)}"></span>
            <div class="port-alloc-meta">
              <span class="port-alloc-name">${escapeHtml(s.label)}</span>
              <span class="port-alloc-hint muted-text">${hint}</span>
            </div>
            <div class="port-alloc-figures">
              <span class="port-alloc-val">${fmt(s.value)}</span>
              <span class="port-alloc-pct muted-text">${pct.toFixed(0)}%</span>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

function portfolioDetailHtml(r, { equity = 0, holdingsTotal = 0 } = {}) {
  // Match the allocation pie (share of open positions), not cash-inclusive equity.
  const ofHoldings = holdingsTotal > 0 ? (r.val / holdingsTotal) * 100 : 0;
  const ofEquity = equity > 0 ? (r.val / equity) * 100 : 0;
  const dayCls = (r.dayPct || 0) >= 0 ? 'up' : 'down';
  const plCls = r.pl >= 0 ? 'up' : 'down';
  const isOpt = !!r.optId;
  const isShort = r.side === 'SHORT';
  const actionLabel = isOpt ? 'Close option' : isShort ? 'Cover' : 'Sell';
  const actionClass = isOpt ? 'port-close-opt' : isShort ? 'port-cover' : 'port-sell';
  const meta = getSymbolMeta(r.sym);
  return `
    <div class="port-detail" data-focus="${isOpt ? `OPT:${r.optId}` : r.sym}">
      <div class="port-detail-head">
        ${logoMarkHtml(r.sym, { color: meta.color, letter: meta.letter, size: 'lg' })}
        <div>
          <div class="port-detail-sym">${r.sym} <span class="pos-side">${r.side}</span>${r.priceCorrectedAck ? '<span class="pos-corrected" title="Quote corrected from seed to live. Avg cost kept.">corrected</span>' : ''}</div>
          <div class="port-detail-name muted-text">${escapeHtml(r.name || '')}</div>
        </div>
      </div>
      <div class="port-detail-grid">
        <div><span class="stat-lbl">Last</span><span class="stat-num">$${Number(r.price).toFixed(2)}</span></div>
        <div><span class="stat-lbl">Day</span><span class="stat-num ${dayCls}">${(r.dayPct || 0) >= 0 ? '+' : ''}${(r.dayPct || 0).toFixed(2)}%</span></div>
        <div><span class="stat-lbl">Avg cost</span><span class="stat-num">$${Number(r.avg || 0).toFixed(2)}${r.priceCorrectedAck ? ' <span class="pos-corrected">kept</span>' : ''}</span></div>
        <div><span class="stat-lbl">Shares</span><span class="stat-num">${r.shares}</span></div>
        <div><span class="stat-lbl">Market value</span><span class="stat-num">${fmt(r.val)}</span></div>
        <div><span class="stat-lbl">Of holdings</span><span class="stat-num">${ofHoldings.toFixed(1)}%</span></div>
        <div><span class="stat-lbl">Of equity</span><span class="stat-num">${ofEquity.toFixed(1)}%</span></div>
        <div><span class="stat-lbl">Unrealized</span><span class="stat-num ${plCls}">${fmtPnL(r.pl)} · ${r.plPct >= 0 ? '+' : ''}${(r.plPct || 0).toFixed(1)}%</span></div>
        <div><span class="stat-lbl">Day on position</span><span class="stat-num ${(r.dayChg || 0) >= 0 ? 'up' : 'down'}">${fmtPnL(r.dayChg || 0)}</span></div>
      </div>
      ${r.stopLoss || r.takeProfit ? `<div class="port-detail-risk muted-text">${[
        r.stopLoss ? `Stop $${Number(r.stopLoss).toFixed(2)}` : '',
        r.takeProfit ? `Target $${Number(r.takeProfit).toFixed(2)}` : '',
      ].filter(Boolean).join(' · ')}</div>` : ''}
      <div class="port-detail-actions">
        <button type="button" class="btn btn-sm port-view" data-sym="${r.sym}">View chart</button>
        <button type="button" class="btn btn-sm ${isShort || isOpt ? 'btn-accent' : 'btn-short'} ${actionClass}"
          data-sym="${r.sym}" ${r.optId ? `data-id="${r.optId}"` : ''} data-shares="${r.shares}">
          ${actionLabel}
        </button>
      </div>
    </div>`;
}

function holdingsTable(rows, equity, focusRow) {
  const focusKey = focusRow?.optId ? `OPT:${focusRow.optId}` : focusRow?.sym;
  return `<table class="holdings-table">
    <thead><tr>
      <th class="port-h-sym" data-sort="sym">Symbol</th>
      <th class="port-h-num" data-sort="shares">Qty</th>
      <th class="port-h-num port-col-avg" data-sort="avg">Avg</th>
      <th class="port-h-num" data-sort="price">Last</th>
      <th class="port-h-num" data-sort="dayPct">Day</th>
      <th class="port-h-num" data-sort="pl">P&amp;L</th>
      <th class="port-h-num port-col-val" data-sort="val">Value</th>
      <th class="port-h-act" aria-hidden="true"></th>
    </tr></thead>
    <tbody>${rows.map((r) => {
      const key = r.optId ? `OPT:${r.optId}` : r.sym;
      const active = key === focusKey ? 'is-active' : '';
      const dayCls = (r.dayPct || 0) >= 0 ? 'up' : 'down';
      const plCls = r.pl >= 0 ? 'up' : 'down';
      const isOpt = !!r.optId;
      const isShort = r.side === 'SHORT';
      const sellLabel = isOpt ? 'Close' : isShort ? 'Cover' : 'Sell';
      const sellClass = isOpt ? 'port-close-opt' : isShort ? 'port-cover' : 'port-sell';
      return `<tr class="port-row ${active}" data-focus="${key}" data-sym="${r.sym}">
        <td class="port-c-sym">
          <div class="port-sym-cell">
            ${logoMarkHtml(r.sym, { color: getSymbolMeta(r.sym).color, letter: getSymbolMeta(r.sym).letter, size: 'sm' })}
            <div>
              <strong>${r.sym}</strong>
              <span class="pos-side">${r.side}</span>${r.priceCorrectedAck ? '<span class="pos-corrected" title="Quote corrected from seed to live. Avg cost kept.">corrected</span>' : ''}
              <div class="port-sym-name muted-text">${escapeHtml(r.name || '')}</div>
            </div>
          </div>
        </td>
        <td class="port-c-num">${r.shares}</td>
        <td class="port-c-num port-col-avg">$${Number(r.avg || 0).toFixed(2)}</td>
        <td class="port-c-num">$${Number(r.price).toFixed(2)}</td>
        <td class="port-c-num ${dayCls}">${(r.dayPct || 0) >= 0 ? '+' : ''}${(r.dayPct || 0).toFixed(2)}%</td>
        <td class="port-c-num port-c-pl ${plCls}">${fmtPnL(r.pl)}<div class="port-pl-pct">${r.plPct >= 0 ? '+' : ''}${(r.plPct || 0).toFixed(1)}%</div></td>
        <td class="port-c-num port-col-val">${fmt(r.val)}</td>
        <td class="port-c-act port-row-actions" onclick="event.stopPropagation()">
          <button type="button" class="btn btn-sm port-view" data-sym="${r.sym}" title="Open on trade desk">View</button>
          <button type="button" class="btn btn-sm ${isShort || isOpt ? 'btn-accent' : 'btn-short'} ${sellClass}" data-sym="${r.sym}" ${r.optId ? `data-id="${r.optId}"` : ''} data-shares="${r.shares}">${sellLabel}</button>
        </td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

function bindPortfolioFullActions(container, rows, state) {
  container.querySelectorAll('.port-row').forEach((tr) => {
    tr.onclick = () => {
      portfolioFocusSym = tr.dataset.focus;
      renderPortfolioFull(container, rows, state);
    };
  });

  container.querySelectorAll('.port-goto-trade').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      portfolioUiActions.switchView('trade');
    };
  });

  container.querySelectorAll('.port-view').forEach((btn) => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const sym = btn.dataset.sym;
      if (!sym) return;
      portfolioUiActions.switchView('trade');
      await state.onSelectSymbol?.(sym);
    };
  });

  const openExit = (r, action) => {
    const q = quoteForDisplay(r.sym);
    const price = q?.price || r.price || r.avg;
    portfolioUiActions.openOrderConfirm({
      action,
      sym: r.sym,
      shares: r.shares,
      price,
      orderType: 'market',
    }, state);
  };

  container.querySelectorAll('.port-sell').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const r = rows.find((x) => x.sym === btn.dataset.sym && x.side === 'LONG');
      if (r) openExit(r, 'sell');
    };
  });
  container.querySelectorAll('.port-cover').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const r = rows.find((x) => x.sym === btn.dataset.sym && x.side === 'SHORT');
      if (r) openExit(r, 'cover');
    };
  });
  container.querySelectorAll('.port-close-opt').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      state.onCloseOption?.(btn.dataset.id);
    };
  });
}

function drawStockAllocationPie(rows) {
  const canvas = document.getElementById('allocation-pie');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const total = rows.reduce((s, r) => s + Math.max(0, r.val), 0);
  if (!rows.length || !total) {
    const cx = w / 2;
    const cy = h / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 62, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(139, 148, 158, 0.35)';
    ctx.lineWidth = 14;
    ctx.stroke();
    ctx.fillStyle = '#8b949e';
    ctx.font = '600 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NO POSITIONS', cx, cy - 2);
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText('$0 invested', cx, cy + 14);
    ctx.textAlign = 'start';
    return;
  }

  const colors = ['#3b82f6', '#26a69a', '#f0883e', '#ef5350', '#a371f7', '#58a6ff', '#e3b341'];
  let start = -Math.PI / 2;
  const cx = 110;
  const cy = 90;
  rows.forEach((r, i) => {
    const slice = (Math.max(0, r.val) / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, 72, start, start + slice);
    ctx.closePath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();
    start += slice;
  });
  rows.slice(0, 5).forEach((r, i) => {
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(210, 28 + i * 22, 10, 10);
    ctx.fillStyle = '#c9d1d9';
    ctx.font = '11px Inter, sans-serif';
    ctx.fillText(`${r.sym} ${((r.val / total) * 100).toFixed(0)}%`, 226, 38 + i * 22);
  });
}

/**
 * Donut cake for estates & cash — legend lives in the HTML block below.
 * @param {{ id: string, label: string, value: number, color: string }[]} slices
 */
function drawFirmAllocationCake(slices = []) {
  const canvas = document.getElementById('firm-allocation-pie');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const total = (slices || []).reduce((s, x) => s + Math.max(0, Number(x.value) || 0), 0);
  const cx = w / 2;
  const cy = h / 2 + 2;
  const outer = 58;
  const inner = 34;
  if (!total) {
    ctx.fillStyle = '#8b949e';
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No estates yet', cx, cy + 4);
    ctx.textAlign = 'start';
    return;
  }
  let start = -Math.PI / 2;
  for (const s of slices) {
    const val = Math.max(0, Number(s.value) || 0);
    if (val <= 0) continue;
    const sweep = (val / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, outer, start, start + sweep);
    ctx.arc(cx, cy, inner, start + sweep, start, true);
    ctx.closePath();
    ctx.fillStyle = s.color;
    ctx.fill();
    start += sweep;
  }
  ctx.beginPath();
  ctx.arc(cx, cy, inner - 0.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(15, 15, 18, 0.92)';
  ctx.fill();
  ctx.fillStyle = '#c9d1d9';
  ctx.font = '600 10px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ESTATES', cx, cy - 4);
  ctx.fillStyle = '#8b949e';
  ctx.font = '9px Inter, sans-serif';
  ctx.fillText(`${slices.filter((s) => s.value > 0).length} slices`, cx, cy + 10);
  ctx.textAlign = 'start';
}

function calcMaxDrawdown(hist) {
  let peak = 0;
  let maxDd = 0;
  (hist || []).forEach(p => {
    const eq = Number(p.equity || 0);
    peak = Math.max(peak, eq);
    if (peak > 0) maxDd = Math.max(maxDd, ((peak - eq) / peak) * 100);
  });
  return maxDd;
}

function bindPositionActions(container, state) {
  container.querySelectorAll('.sell-long').forEach(btn => {
    btn.onclick = (e) => { e.stopPropagation(); state.onCloseLong?.(btn.dataset.sym); };
  });
  container.querySelectorAll('.cover-short').forEach(btn => {
    btn.onclick = (e) => { e.stopPropagation(); state.onCoverShort?.(btn.dataset.sym); };
  });
  container.querySelectorAll('.sell-opt').forEach(btn => {
    btn.onclick = (e) => { e.stopPropagation(); state.onCloseOption?.(btn.dataset.id); };
  });
}
