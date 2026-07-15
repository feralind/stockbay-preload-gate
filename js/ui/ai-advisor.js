// @ts-check
/**
 * AI advisor view/chat render — extracted from ui.js (Phase 2).
 */

import {
  askAdvisor, generateDailyPicks, generateSymbolSummary,
  renderAiSummaryHtml, renderPicksHtml,
} from '../ai.js';
import { PERKS } from '../config.js';
import { showAlert } from '../notify.js';
import { sfxError } from '../sfx.js';
import { getSelectedSym, setSelectedSym } from './selection.js';
import { fmt } from './shared.js';

let aiPicksCache = [];
let aiChatHistory = [];

let aiAdvisorActions = {
  renderAll: (_state) => {},
  switchView: (_view) => {},
};

export function configureAiAdvisor(actions = {}) {
  aiAdvisorActions = { ...aiAdvisorActions, ...actions };
}

/**
 * Shared locked-state card for AI Advisor (sidebar + full page).
 * Keep ~compact so empty states don't dominate the layout.
 */
export function buildAiLockedCardHtml() {
  const perk = PERKS.aiAdvisor;
  const cost = perk?.cost ?? 18500;
  const tier = perk?.tierLabel || 'Research';
  return `<div class="ai-locked-card" data-ai-locked-card>
    <div class="ai-locked-card-copy">
      <strong>AI Trading Advisor</strong>
      <p>Signals, daily picks, and desk chat — unlock for <span class="ai-locked-price">${fmt(cost)}</span> · ${tier} license tier.</p>
    </div>
    <button type="button" class="btn btn-sm btn-accent" data-goto="perks">Unlock in Perks →</button>
  </div>`;
}

function bindAiLockedGoto(root) {
  root?.querySelectorAll?.('[data-ai-locked-card] [data-goto]')?.forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-goto');
      if (view) aiAdvisorActions.switchView?.(view);
    });
  });
}

export async function refreshAiAnalysis(state) {
  const hasAi = state.perks.includes('aiAdvisor');
  if (!hasAi) return;

  const analysis = await generateSymbolSummary(getSelectedSym());
  const summaryPanel = document.getElementById('ai-summary-panel');
  const sidebar = document.getElementById('ai-summary-sidebar');
  const html = renderAiSummaryHtml(analysis);

  if (summaryPanel) {
    summaryPanel.innerHTML = html;
    summaryPanel.classList.remove('hidden');
  }
  if (sidebar) sidebar.innerHTML = html;

  if (!aiPicksCache.length || Math.random() < 0.15) {
    aiPicksCache = await generateDailyPicks(4);
  }
  const picksHtml = renderPicksHtml(aiPicksCache);
  document.getElementById('ai-picks-sidebar')?.replaceChildren();
  const picksSide = document.getElementById('ai-picks-sidebar');
  if (picksSide) picksSide.innerHTML = picksHtml;
  const picksFull = document.getElementById('ai-picks-full');
  if (picksFull) picksFull.innerHTML = picksHtml;

  document.querySelectorAll('.ai-pick').forEach(el => {
    el.onclick = () => {
      const sym = setSelectedSym(el.dataset.sym);
      state.onSelectSymbol?.(sym);
      aiAdvisorActions.renderAll(state);
    };
  });
}

export function renderAi(state) {
  const hasAi = state.perks.includes('aiAdvisor');
  const lock = document.getElementById('ai-lock-label');
  if (lock) {
    lock.textContent = hasAi ? '● LIVE' : 'LOCKED';
    lock.className = `ai-lock-label ${hasAi ? 'unlocked' : ''}`;
  }

  const lockedHost = document.getElementById('ai-locked-host');
  const liveView = document.getElementById('ai-view-live');

  if (!hasAi) {
    document.getElementById('ai-summary-panel')?.classList.add('hidden');
    const card = buildAiLockedCardHtml();
    if (lockedHost) {
      lockedHost.innerHTML = card;
      lockedHost.classList.remove('hidden');
      bindAiLockedGoto(lockedHost);
    }
    if (liveView) liveView.classList.add('hidden');
    // Sidebar: one compact card only (do not spam every AI panel).
    const side = document.getElementById('ai-chat-log-side');
    if (side) {
      side.innerHTML = card;
      bindAiLockedGoto(side);
    }
    document.getElementById('ai-summary-sidebar')?.replaceChildren();
    document.getElementById('ai-picks-sidebar')?.replaceChildren();
    return;
  }

  if (lockedHost) {
    lockedHost.classList.add('hidden');
    lockedHost.innerHTML = '';
  }
  if (liveView) liveView.classList.remove('hidden');

  const picksEmpty = '<div class="empty">No signals yet — scanning headlines and price action…</div>';
  if (!aiPicksCache.length) {
    const picksSide = document.getElementById('ai-picks-sidebar');
    if (picksSide) picksSide.innerHTML = picksEmpty;
    const picksFull = document.getElementById('ai-picks-full');
    if (picksFull) picksFull.innerHTML = picksEmpty;
  }

  renderAiChatLog();
  refreshAiAnalysis(state);
}

export function getAiChatHistory() {
  return aiChatHistory.slice();
}

export function loadAiChatHistory(messages) {
  aiChatHistory = Array.isArray(messages) ? messages.slice(-40) : [];
  renderAiChatLog();
}

export async function sendAiChat(question, state) {
  const hasAi = state.perks.includes('aiAdvisor');
  if (!hasAi) {
    sfxError();
    showAlert(`Unlock <strong>AI Trading Advisor</strong> in Perks first (${fmt(PERKS.aiAdvisor?.cost ?? 18500)} · ${PERKS.aiAdvisor?.tierLabel || 'Research'} license tier).`, {
      title: 'AI locked', label: 'PERKS',
    });
    return;
  }
  if (!question?.trim()) return;

  aiChatHistory.push({ role: 'user', text: question });
  if (aiChatHistory.length > 40) aiChatHistory = aiChatHistory.slice(-40);
  renderAiChatLog();
  const reply = await askAdvisor(question, getSelectedSym());
  aiChatHistory.push({ role: 'bot', text: reply.text });
  if (aiChatHistory.length > 40) aiChatHistory = aiChatHistory.slice(-40);
  if (reply.picks?.length) aiPicksCache = reply.picks;

  renderAiChatLog();
  renderAi(state);
  state.onAiChatPersist?.();
}

export function renderAiChatLog() {
  const html = aiChatHistory.length
    ? aiChatHistory.slice(-20).map(m =>
      `<div class="ai-msg ${m.role}">${m.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')}</div>`
    ).join('')
    : '<div class="empty">Ask anything — picks, news, or a ticker call.</div>';

  ['ai-chat-log', 'ai-chat-log-side'].forEach((id) => {
    const log = document.getElementById(id);
    if (!log) return;
    log.innerHTML = html;
    log.scrollTop = log.scrollHeight;
  });
}

export function bindAiChat(state) {
  if (bindAiChat._bound) return;
  bindAiChat._bound = true;

  const send = (inputId) => {
    const inp = document.getElementById(inputId);
    if (!state.perks.includes('aiAdvisor')) {
      sendAiChat('', state);
      return;
    }
    if (!inp?.value.trim()) return;
    sendAiChat(inp.value, state);
    inp.value = '';
  };

  document.getElementById('ai-chat-send')?.addEventListener('click', () => send('ai-chat-input'));
  document.getElementById('ai-chat-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') send('ai-chat-input');
  });
  document.getElementById('ai-chat-side-send')?.addEventListener('click', () => send('ai-chat-side'));
  document.getElementById('ai-chat-side')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') send('ai-chat-side');
  });
  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.('.ai-suggest');
    if (!btn?.dataset?.q) return;
    sendAiChat(btn.dataset.q, state);
  });
}
