// @ts-check
import {
  fetchCandles, fillMissingQuotes, isSimulationMode, syncQuoteToPrice,
} from '../api.js';
import { setChartData, setCurrentSym, resizeChart } from '../chart.js';
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
  chartResolution = res;
  document.querySelectorAll('.tf-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.res === res);
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
  const waveStarted = Date.now();
  box?.classList.add('chart-loading');
  try {
    const candles = await fetchCandles(sym, chartResolution);
    // Brief wave even for instant offline/sim candles so symbol/range changes feel responsive
    const minWaveMs = 320;
    const elapsed = Date.now() - waveStarted;
    if (elapsed < minWaveMs) {
      await new Promise(r => setTimeout(r, minWaveMs - elapsed));
    }
    const lastClose = candles?.[candles.length - 1]?.close;
    // During sim the quote cache is the fill source of truth — never let chart load rewrite it
    if (lastClose > 0 && !isSimulationMode()) {
      syncQuoteToPrice(sym, lastClose, { source: 'candle' });
    }
    setChartData(candles, hasAnalyst, chartResolution, hasAnalyst);
    // Extra fit after Dual Pane layout (avoids empty-left until TF click)
    requestAnimationFrame(() => {
      resizeChart();
      setTimeout(() => resizeChart(), 100);
    });
  } finally {
    // Let the next frame paint candles under the wave, then fade the overlay out
    requestAnimationFrame(() => {
      box?.classList.remove('chart-loading');
    });
  }
}
