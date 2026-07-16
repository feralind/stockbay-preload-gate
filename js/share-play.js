// @ts-check
/**
 * Settings → Share play link — host a temporary public URL via Electron /api/share/*.
 */

import { toast } from './notify.js';

/**
 * @param {{ active?: boolean, url?: string|null, status?: string, error?: string|null, detail?: string|null }} s
 */
function paintShareUi(s) {
  const statusEl = document.getElementById('settings-share-status');
  const urlEl = /** @type {HTMLInputElement|null} */ (document.getElementById('settings-share-url'));
  const startBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('settings-share-start'));
  const copyBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('settings-share-copy'));
  const stopBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('settings-share-stop'));
  if (!statusEl || !urlEl || !startBtn || !copyBtn || !stopBtn) return;

  const active = !!s.active && !!s.url;
  const starting = s.status === 'starting';

  startBtn.disabled = starting || active;
  stopBtn.disabled = !active && !starting;
  copyBtn.disabled = !active;

  if (active && s.url) {
    urlEl.value = s.url;
    urlEl.classList.remove('hidden');
    statusEl.textContent = 'Live — friends open this link in their browser (no install). Each person gets their own save. Keep StockWay open.';
  } else if (starting) {
    urlEl.classList.add('hidden');
    urlEl.value = '';
    statusEl.textContent = s.detail || 'Creating public link…';
  } else if (s.status === 'error' && s.error) {
    urlEl.classList.add('hidden');
    urlEl.value = '';
    statusEl.textContent = s.error;
  } else {
    urlEl.classList.add('hidden');
    urlEl.value = '';
    statusEl.textContent = 'Not sharing. Create a link while this desk is running.';
  }
}

async function fetchShareStatus() {
  const res = await fetch('/api/share/status');
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Share status unavailable');
  return res.json();
}

async function refreshShareUi() {
  try {
    const s = await fetchShareStatus();
    if (!s) {
      paintShareUnavailable();
      return;
    }
    paintShareUi(s);
  } catch {
    paintShareUnavailable();
  }
}

function paintShareUnavailable() {
  const statusEl = document.getElementById('settings-share-status');
  const startBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('settings-share-start'));
  const copyBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('settings-share-copy'));
  const stopBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('settings-share-stop'));
  const urlEl = document.getElementById('settings-share-url');
  if (statusEl) {
    statusEl.textContent = 'Share play link is available in the desktop app (START HERE / Electron).';
  }
  if (startBtn) startBtn.disabled = true;
  if (copyBtn) copyBtn.disabled = true;
  if (stopBtn) stopBtn.disabled = true;
  urlEl?.classList.add('hidden');
}

async function copyShareUrl() {
  const urlEl = /** @type {HTMLInputElement|null} */ (document.getElementById('settings-share-url'));
  const url = String(urlEl?.value || '').trim();
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    toast('Play link copied', { type: 'success' });
  } catch {
    try {
      urlEl?.select();
      document.execCommand('copy');
      toast('Play link copied', { type: 'success' });
    } catch {
      toast('Could not copy — select the link manually', { type: 'warn' });
    }
  }
}

export function bindSharePlay() {
  const startBtn = document.getElementById('settings-share-start');
  const copyBtn = document.getElementById('settings-share-copy');
  const stopBtn = document.getElementById('settings-share-stop');
  if (!startBtn || startBtn.dataset.bound === '1') return;
  startBtn.dataset.bound = '1';

  void refreshShareUi();

  startBtn.addEventListener('click', async () => {
    paintShareUi({ active: false, status: 'starting', detail: 'Creating public link…' });
    try {
      const res = await fetch('/api/share/start', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.status === 'error') {
        paintShareUi({
          active: false,
          status: 'error',
          error: data.error || 'Could not create share link',
        });
        toast(data.error || 'Could not create share link', { type: 'warn' });
        return;
      }
      paintShareUi(data);
      if (data.url) {
        toast('Play link ready — copy and send to friends', { type: 'success' });
        void copyShareUrl();
      }
    } catch {
      paintShareUnavailable();
      toast('Share play link needs the desktop app', { type: 'warn' });
    }
  });

  copyBtn?.addEventListener('click', () => { void copyShareUrl(); });

  stopBtn?.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/share/stop', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      paintShareUi(data?.status ? data : { active: false, status: 'idle' });
      toast('Sharing stopped', { type: 'info' });
    } catch {
      paintShareUnavailable();
    }
  });
}
