// @ts-check
import { CONFIG } from './config.js';
import { toast, showAlert, showConfirm } from './notify.js';
import { sanitizeRunData } from './save-sanitize.js';

const EXTRA_KEYS = [
  'stockway_profile_v1',
  'stockway_theme_v1',
  'stockway-right-sidebar-w',
  'stockway-left-sidebar-w',
  'stockway_leaderboard_v1',
];

export function buildSavePayload() {
  const raw = localStorage.getItem(CONFIG.SAVE_KEY);
  if (!raw) return null;
  let run;
  try {
    run = JSON.parse(raw);
  } catch {
    return raw;
  }
  const extras = {};
  for (const key of EXTRA_KEYS) {
    const val = localStorage.getItem(key);
    if (val != null) extras[key] = val;
  }
  return JSON.stringify({
    __stockwayBundle: true,
    version: 2,
    exportedAt: Date.now(),
    run,
    extras,
  }, null, 2);
}

export function exportSave() {
  const raw = buildSavePayload();
  if (!raw) {
    showAlert('No save data found yet — play a bit first, then export.', { title: 'Export save', label: 'SAVE' });
    return;
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([raw], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `stockway-save-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Save exported (run + profile/theme/leaderboard)', { type: 'success' });
}

export async function importSaveFromFile(file) {
  if (!file) return;
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    showAlert('That file is not valid JSON.', { title: 'Import failed', label: 'SAVE' });
    return;
  }

  let run = data;
  let extras = null;
  if (data?.__stockwayBundle && data.run) {
    run = data.run;
    extras = data.extras || {};
  }

  if (!run?.portfolio || typeof run.portfolio.cash !== 'number') {
    showAlert('This doesn’t look like a StockWay save file.', { title: 'Import failed', label: 'SAVE' });
    return;
  }

  const sanitized = sanitizeRunData(run);
  if (!sanitized) {
    showAlert('Save file failed validation — check portfolio data.', { title: 'Import failed', label: 'SAVE' });
    return;
  }
  run = sanitized;

  const ok = await showConfirm(
    'Replace your current save with this file? Run data will be overwritten. Profile/theme/leaderboard restore if present in the file.',
    { title: 'Import save', label: 'SAVE', okText: 'Import & reload', cancelText: 'Cancel' },
  );
  if (!ok) return;

  localStorage.setItem(CONFIG.SAVE_KEY, JSON.stringify(run));
  if (extras && typeof extras === 'object') {
    for (const [key, val] of Object.entries(extras)) {
      if (EXTRA_KEYS.includes(key) && typeof val === 'string') {
        localStorage.setItem(key, val);
      }
    }
  }
  toast('Save imported — reloading…', { type: 'success' });
  setTimeout(() => location.reload(), 400);
}

export function bindSaveIO() {
  document.getElementById('btn-export-save')?.addEventListener('click', exportSave);
  const input = document.getElementById('save-import-input');
  document.getElementById('btn-import-save')?.addEventListener('click', () => input?.click());
  input?.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = '';
    importSaveFromFile(file);
  });
}
