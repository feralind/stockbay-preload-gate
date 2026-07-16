// @ts-check
import {
  fetchCandles, fillMissingQuotes, isSimulationMode, syncQuoteToPrice,
} from '../api.js';
import { setChartData, setCurrentSym, scheduleFitChart } from '../chart.js';
import { setSelectedSym } from './selection.js';

let chartResolution = '1D';

const chartPanelUi = {
  renderNews: () => {},
};

/** @param {{ renderNews?: () => void }} [opts] */
export function configureChartPanelUi({ renderNews } = {}) {
  chartPanelUi.renderNews = typeof renderNews === 'function' ? renderNews : () => {};
}

export function getChartResolution() { return chartResolution; }

export function setChartResolution(res) {
  let next = String(res || '1D').toUpperCase();
  if (next === '5D') next = '1W';
  chartResolution = next;
  document.querySelectorAll('.tf-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.res === chartResolution);
  });
}

function isTradeDualPane() {
  const desk = document.querySelector('#view-trade .trade-desk');
  if (!desk) return false;
  return window.matchMedia('(min-width: 1100px)').matches;
}

export function showChartTab(tab) {
  const next = tab || 'chart';
  const chart = document.getElementById('chart-container');
  const news = document.getElementById('news-panel');
  const stats = document.getElementById('stats-panel');
  const dual = isTradeDualPane();

  document.querySelectorAll('.chart-tab').forEach((t) => {
    const key = t.dataset.tradeTab
      || (t.id === 'tab-news' ? 'news' : t.id === 'tab-stats' ? 'stats' : 'chart');
    t.classList.toggle('active', key === next);
  });

  document.querySelectorAll('#view-trade [data-side-section]').forEach((sec) => {
    sec.classList.toggle('is-focused', sec.dataset.sideSection === next);
  });

  if (dual) {
    // Dual Pane: chart stays center; news + stats stay visible in the right rail.
    chart?.classList.remove('hidden');
    news?.classList.remove('hidden');
    stats?.classList.remove('hidden');
    chartPanelUi.renderNews();
  } else {
    chart?.classList.toggle('hidden', next !== 'chart');
    news?.classList.toggle('hidden', next !== 'news');
    stats?.classList.toggle('hidden', next !== 'stats');
    if (next === 'news') chartPanelUi.renderNews();
  }
}

export async function loadChart(sym, hasAnalyst) {
  setSelectedSym(sym);
  setCurrentSym(sym);
  fillMissingQuotes([sym]);
  const box = document.getElementById('chart-container');
  if (box) {
    box.classList.remove('chart-reveal');
    box.classList.add('chart-loading');
  }
  try {
    const candles = await fetchCandles(sym, chartResolution);
    const lastClose = candles?.[candles.length - 1]?.close;
    // During sim the quote cache is the fill source of truth — never let chart load rewrite it
    if (lastClose > 0 && !isSimulationMode()) {
      syncQuoteToPrice(sym, lastClose, { source: 'candle' });
    }
    setChartData(candles, hasAnalyst, chartResolution, hasAnalyst);
    // Paint one frame while still clipped, then wipe L→R
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    setTimeout(() => scheduleFitChart(), 180);
  } finally {
    if (!box) return;
    box.classList.remove('chart-loading');
    // Force restart if reveal is re-triggered quickly
    void box.offsetWidth;
    box.classList.add('chart-reveal');
    const done = () => box.classList.remove('chart-reveal');
    box.addEventListener('animationend', done, { once: true });
    setTimeout(done, 1200);
  }
}
