// @ts-check
import { switchView, getSelectedSym, addToWatchlist, setChartResolution } from './ui.js';

const VIEWS = [
  'dashboard', 'trade', 'portfolio', 'listings', 'events',
  'perks', 'staff', 'finance', 'achievements', 'ai', 'settings',
];

const RANGE_KEYS = {
  '1': '1D',
  '2': '1W',
  '3': '1M',
  '4': '6M',
  '5': '1Y',
  '6': 'MAX',
};

function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function activeView() {
  return document.querySelector('.view-panel.active')?.id?.replace('view-', '') || 'trade';
}

function cycleView(dir) {
  const cur = activeView();
  const i = VIEWS.indexOf(cur);
  const next = VIEWS[(i + dir + VIEWS.length) % VIEWS.length];
  switchView(next);
}

export function bindHotkeys(state, handlers = {}) {
  document.addEventListener('keydown', (e) => {
    if (isTypingTarget(document.activeElement)) return;

    if (e.key === '/') {
      e.preventDefault();
      switchView('listings');
      const inp = document.getElementById('listing-search');
      inp?.focus();
      return;
    }

    if (e.key === '[') {
      e.preventDefault();
      cycleView(-1);
      return;
    }
    if (e.key === ']') {
      e.preventDefault();
      cycleView(1);
      return;
    }

    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      handlers.onPause?.();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      handlers.onSave?.();
      return;
    }

    if (e.key === 'r' || e.key === 'R') {
      if (e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      handlers.onRefresh?.();
      return;
    }

    if (RANGE_KEYS[e.key] && activeView() === 'trade') {
      e.preventDefault();
      const res = RANGE_KEYS[e.key];
      setChartResolution(res);
      handlers.onChartRange?.(res);
      return;
    }

    const sym = getSelectedSym();
    const view = activeView();

    if ((e.key === 'b' || e.key === 'B') && view === 'trade') {
      e.preventDefault();
      handlers.onQuickBuy?.(sym);
      return;
    }
    if ((e.key === 's' || e.key === 'S') && view === 'trade') {
      e.preventDefault();
      handlers.onQuickSell?.(sym);
      return;
    }
    if (e.key === 'w' || e.key === 'W') {
      if (view !== 'trade') return;
      e.preventDefault();
      if (e.shiftKey) handlers.onRemoveWatch?.(sym);
      else addToWatchlist(sym);
      return;
    }
  });
}

export function getHotkeyHint() {
  return 'B buy · S sell · W watch · Shift+W remove · Space pause · R refresh · 1–8 ranges · [ ] tabs · / search · Esc close';
}
