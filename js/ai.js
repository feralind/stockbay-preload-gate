// @ts-check
import { getCachedQuote, getLastNews, fetchCandles } from './api.js';
import { getSymbolName, getSymbolSector, ALL_SYMBOLS } from './symbols.js';
import { getQuoteCache } from './api.js';

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const rs = losses === 0 ? 100 : gains / losses;
  return 100 - 100 / (1 + rs);
}

function calcSMA(closes, period) {
  if (closes.length < period) return null;
  return closes.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function findRelevantNews(sym, news, limit = 3) {
  const name = getSymbolName(sym).toLowerCase();
  const sector = getSymbolSector(sym);
  const sectorWords = {
    tech: ['tech', 'ai', 'chip', 'software', 'nvidia', 'apple', 'microsoft'],
    finance: ['fed', 'rate', 'bank', 'inflation', 'cpi', 'jobs'],
    energy: ['oil', 'opec', 'energy', 'gas'],
    healthcare: ['fda', 'drug', 'pharma', 'health'],
  }[sector] || [];

  const scored = (news || []).map((n, i) => {
    const h = (n.headline || '').toLowerCase();
    let score = 0;
    if (h.includes(sym.toLowerCase())) score += 10;
    if (h.includes(name.split(' ')[0])) score += 5;
    sectorWords.forEach(w => { if (h.includes(w)) score += 2; });
    return { ...n, idx: i + 1, score };
  }).filter(n => n.score > 0).sort((a, b) => b.score - a.score);

  if (scored.length) return scored.slice(0, limit);
  return (news || []).slice(0, limit).map((n, i) => ({ ...n, idx: i + 1, score: 1 }));
}

async function analyzeSymbol(sym) {
  const q = getCachedQuote(sym);
  if (!q) return null;

  const candles = await fetchCandles(sym, 'D', 60);
  const closes = candles.map(c => c.close);
  const rsi = calcRSI(closes);
  const ma20 = calcSMA(closes, 20);
  const ma50 = calcSMA(closes, 50);
  const price = q.price;
  const chg = q.changePct || 0;

  let signal = 'HOLD';
  let confidence = 55;
  const reasons = [];
  let trendSignal = null;
  let rsiSignal = null;
  let conflictedIndicators = false;

  if (ma20 && ma50) {
    if (price > ma20 && ma20 > ma50) { reasons.push('Price above MA20 & MA50 — bullish trend'); trendSignal = 'BUY'; confidence += 8; }
    else if (price < ma20 && ma20 < ma50) { reasons.push('Price below MA20 & MA50 — bearish trend'); trendSignal = 'SHORT'; confidence += 8; }
    if (price > ma20 * 1.05) reasons.push('Extended above MA20 — watch for pullback');
    if (price < ma20 * 0.95) reasons.push('Oversold vs MA20 — potential bounce zone');
  }

  if (rsi > 70) { reasons.push(`RSI ${rsi.toFixed(0)} overbought — avoid chasing longs`); signal = chg > 0 ? 'HOLD' : 'SHORT'; rsiSignal = signal === 'SHORT' ? 'SHORT' : null; confidence += 7; }
  else if (rsi < 30) { reasons.push(`RSI ${rsi.toFixed(0)} oversold — dip-buy setup possible`); signal = 'BUY'; rsiSignal = 'BUY'; confidence += 7; }
  else if (rsi >= 45 && rsi <= 55) reasons.push(`RSI ${rsi.toFixed(0)} neutral — wait for confirmation`);

  if (trendSignal && rsiSignal && trendSignal !== rsiSignal) {
    signal = 'HOLD';
    conflictedIndicators = true;
    confidence -= 10;
    reasons.push('MA trend and RSI disagree — prefer HOLD until the setup confirms');
  }

  if (chg > 2) { reasons.push(`Up ${chg.toFixed(2)}% today on momentum`); if (signal === 'HOLD' && !conflictedIndicators) signal = 'BUY'; confidence += 5; }
  else if (chg < -2) { reasons.push(`Down ${Math.abs(chg).toFixed(2)}% — selling pressure`); if (signal === 'HOLD' && !conflictedIndicators) signal = 'SHORT'; confidence += 5; }

  const news = findRelevantNews(sym, getLastNews());
  news.forEach(n => {
    const h = (n.headline || '').toLowerCase();
    if (/beat|surge|raise|upgrade|buy|record|strong/.test(h)) { confidence += 4; if (signal === 'HOLD' && !conflictedIndicators) signal = 'BUY'; }
    if (/miss|cut|downgrade|sell|weak|probe|investigation|tariff|war/.test(h)) { confidence += 4; if (signal === 'HOLD' && !conflictedIndicators) signal = 'SHORT'; }
  });

  reasons.push('Confidence is advisory, not an answer key');
  confidence = Math.min(78, Math.max(45, confidence));

  const citations = news.map(n => ({
    idx: n.idx,
    source: n.source || 'Market',
    headline: (n.headline || '').slice(0, 80),
    ago: n.datetime ? timeAgo(n.datetime * 1000) : 'recent',
  }));

  const summaryParts = [];
  summaryParts.push(`**${sym}** ${chg >= 0 ? 'up' : 'down'} **${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%**`);
  if (news[0]) summaryParts.push(`on ${news[0].source || 'market'} headline: "${(news[0].headline || '').slice(0, 70)}…" [${news[0].idx}]`);
  if (ma20) summaryParts.push(`Trading ${price > ma20 ? 'above' : 'below'} 20-day MA ($${ma20.toFixed(2)}).`);
  if (rsi < 35) summaryParts.push('Oversold conditions — mean-reversion longs favored.');
  else if (rsi > 65) summaryParts.push('Momentum stretched — consider taking profits or hedging.');

  return {
    sym,
    name: getSymbolName(sym),
    sector: getSymbolSector(sym),
    price,
    changePct: chg,
    signal,
    confidence,
    rsi: rsi.toFixed(0),
    ma20,
    ma50,
    reasons,
    summary: summaryParts.join(' '),
    citations,
    action: signal === 'BUY' ? 'Buy Long' : signal === 'SHORT' ? 'Open Short' : signal === 'SELL' ? 'Take Profit' : 'Wait / Hold',
  };
}

function timeAgo(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export async function generateSymbolSummary(sym) {
  return analyzeSymbol(sym);
}

export async function generateDailyPicks(count = 5) {
  const cache = getQuoteCache();
  const candidates = ALL_SYMBOLS.filter(s => cache.has(s))
    .sort(() => Math.random() - 0.5)
    .slice(0, 40);

  const analyses = [];
  for (const sym of candidates.slice(0, 20)) {
    const a = await analyzeSymbol(sym);
    if (a && (a.signal === 'BUY' || a.signal === 'SHORT')) analyses.push(a);
  }

  analyses.sort((a, b) => b.confidence - a.confidence);
  return analyses.slice(0, count);
}

export async function askAdvisor(question, sym) {
  const q = question.toLowerCase().trim();
  const target = sym || extractSymbol(q);

  if (/what.*buy|pick|recommend|should i buy|best stock|top/.test(q)) {
    const picks = await generateDailyPicks(3);
    if (!picks.length) return { text: 'Market data still loading — refresh in a moment and ask again.', picks: [] };
    const lines = picks.map((p, i) =>
      `${i + 1}. **${p.sym}** — ${p.signal} (${p.confidence}% confidence): ${p.summary.slice(0, 120)}…`
    );
    return { text: `Today's AI picks based on momentum, RSI & live news:\n\n${lines.join('\n\n')}`, picks };
  }

  if (/compare|vs|versus/.test(q) && target) {
    const other = extractSymbol(q.replace(target, ''));
    if (other) {
      const [a, b] = await Promise.all([analyzeSymbol(target), analyzeSymbol(other)]);
      return {
        text: `**${target}** → ${a?.signal} (${a?.confidence}%) · RSI ${a?.rsi}\n**${other}** → ${b?.signal} (${b?.confidence}%) · RSI ${b?.rsi}\n\n${a?.confidence >= b?.confidence ? target : other} has the stronger setup right now.`,
      };
    }
  }

  if (/short|bear|put|sell/.test(q) && target) {
    const a = await analyzeSymbol(target);
    if (!a) return { text: `No data for ${target} yet.` };
    const shortOk = Number(a.rsi) > 55 || Number(a.changePct) < -1;
    return {
      text: shortOk
        ? `**${target}** short setup: ${a.summary}\n\nSignal: **${a.signal}** · Confidence ${a.confidence}%\n${a.reasons.slice(0, 2).join('. ')}.`
        : `**${target}** — weak short setup. RSI ${a.rsi}, trend may not support shorts yet. Wait for breakdown below MA20 ($${a.ma20?.toFixed(2) || '—'}).`,
    };
  }

  if (target || /should|buy|long|analysis|summary|think about/.test(q)) {
    const s = target || sym || 'AAPL';
    const a = await analyzeSymbol(s);
    if (!a) return { text: `Loading data for ${s}… try again shortly.` };
    const citeStr = a.citations.map(c => `[${c.idx}] ${c.source}`).join(' · ');
    return {
      text: `${a.summary}\n\n**Signal: ${a.signal}** (${a.confidence}% confidence) → ${a.action}\nRSI ${a.rsi} · Sector: ${a.sector}\n\n${a.reasons.join('. ')}.\n\nSources: ${citeStr || 'Live market data'}`,
      analysis: a,
    };
  }

  if (/portfolio|position|pnl|p&l|how am i/.test(q)) {
    return { text: 'Check your Portfolio tab for live P&L. AI tip: cut losers at -8%, let winners run with a trailing stop at MA20.' };
  }

  if (/event|news|world|fed|market/.test(q)) {
    const news = getLastNews().slice(0, 3);
    const headlines = news.map((n, i) => `[${i + 1}] ${n.headline} (${n.source})`).join('\n');
    return { text: `Latest market drivers:\n${headlines || 'Fetching live news…'}\n\nWatch the World Events feed for price impacts.` };
  }

  return {
    text: `Ask me things like:\n• "Should I buy NVDA?"\n• "What should I buy today?"\n• "Short TSLA?"\n• "Compare AAPL vs MSFT"\n• "What's moving the market?"`,
  };
}

function extractSymbol(text) {
  const upper = text.toUpperCase();
  for (const sym of ALL_SYMBOLS) {
    if (upper.includes(sym)) return sym;
  }
  const m = text.match(/\b([A-Z]{1,5})\b/);
  return m ? m[1] : null;
}

export function renderAiSummaryHtml(analysis) {
  if (!analysis) return '<div class="ai-empty">Select a symbol for AI analysis</div>';

  const sigClass = analysis.signal.toLowerCase();
  const cites = analysis.citations.map(c =>
    `<span class="cite">[${c.idx}] ${c.source} · ${c.ago}</span>`
  ).join('');

  let summaryHtml = analysis.summary.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  analysis.citations.forEach(c => {
    summaryHtml = summaryHtml.replace(`[${c.idx}]`, `<sup class="cite-ref">${c.idx}</sup>`);
  });

  return `
    <div class="ai-summary-card">
      <div class="ai-summary-head">
        <span class="ai-badge">AI summary</span>
        <span class="ai-sources">${analysis.citations.length} sources · cited</span>
      </div>
      <p class="ai-summary-text">${summaryHtml}</p>
      <div class="ai-signal-row">
        <span class="signal-pill ${sigClass}">${analysis.signal}</span>
        <span class="signal-conf">${analysis.confidence}% confidence</span>
        <span class="signal-action">→ ${analysis.action}</span>
      </div>
      <div class="ai-metrics">
        <span>RSI ${analysis.rsi}</span>
        ${analysis.ma20 ? `<span>MA20 $${analysis.ma20.toFixed(2)}</span>` : ''}
        ${analysis.ma50 ? `<span>MA50 $${analysis.ma50.toFixed(2)}</span>` : ''}
      </div>
      ${cites ? `<div class="ai-cites">${cites}</div>` : ''}
    </div>`;
}

export function renderPicksHtml(picks) {
  if (!picks?.length) return '<div class="ai-empty">Scanning market for setups…</div>';
  return picks.map(p => `
    <div class="ai-pick" data-sym="${p.sym}">
      <div class="pick-top">
        <span class="pick-sym">${p.sym}</span>
        <span class="signal-pill ${p.signal.toLowerCase()}">${p.signal}</span>
      </div>
      <div class="pick-meta">${p.confidence}% · $${p.price.toFixed(2)} · ${p.changePct >= 0 ? '+' : ''}${p.changePct.toFixed(2)}%</div>
      <div class="pick-reason">${p.reasons[0] || ''}</div>
    </div>
  `).join('');
}
