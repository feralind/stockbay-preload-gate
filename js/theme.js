// @ts-check
export const THEME_PRESETS = {
  pink: {
    name: 'Pink Bloom',
    bg: '#140a10',
    bg2: '#221018',
    bg3: '#2e1522',
    surface: '#3a1c2e',
    border: '#5a2d45',
    text: '#fce8f0',
    muted: '#b89aaa',
    accent: '#ff6b9d',
    accent2: '#e84393',
    green: '#4ecca3',
    red: '#ff6b6b',
    blue: '#7eb8ff',
    chartBg: '#140a10',
    chartGrid: '#2e1522',
  },
  dark: {
    name: 'Stockbay',
    bg: '#09090b',
    bg2: '#0f0f12',
    bg3: '#16161a',
    surface: '#1c1c22',
    border: '#27272a',
    text: '#fafafa',
    muted: '#a1a1aa',
    accent: '#3b82f6',
    accent2: '#2563eb',
    green: '#00c805',
    red: '#ef4444',
    blue: '#60a5fa',
    chartBg: '#09090b',
    chartGrid: '#1a1a1f',
  },
  rose: {
    name: 'Rose Gold',
    bg: '#1c1014',
    bg2: '#2a1820',
    bg3: '#38242c',
    surface: '#4a3038',
    border: '#6b4555',
    text: '#fff0f3',
    muted: '#c9a8b0',
    accent: '#f4a0b5',
    accent2: '#d4738a',
    green: '#6dd5a0',
    red: '#f08080',
    blue: '#9ec5fe',
    chartBg: '#1c1014',
    chartGrid: '#38242c',
  },
  ocean: {
    name: 'Ocean',
    bg: '#0a1218',
    bg2: '#101c28',
    bg3: '#162636',
    surface: '#1e3348',
    border: '#2a4a66',
    text: '#e8f4fc',
    muted: '#8ab0c8',
    accent: '#3dd6d0',
    accent2: '#2ab8b2',
    green: '#3dd6d0',
    red: '#ff7b7b',
    blue: '#6eb5ff',
    chartBg: '#0a1218',
    chartGrid: '#162636',
  },
  light: {
    name: 'Clean Light',
    bg: '#fdf2f6',
    bg2: '#ffffff',
    bg3: '#f5e6ee',
    surface: '#ebe0e6',
    border: '#d4c0cc',
    text: '#2d1520',
    muted: '#7a5a68',
    accent: '#e84393',
    accent2: '#d63384',
    green: '#198754',
    red: '#dc3545',
    blue: '#0d6efd',
    chartBg: '#ffffff',
    chartGrid: '#f0e0e8',
  },
};

const SAVE_KEY = 'stockway_theme_v1';

export function getSavedTheme() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return { preset: 'dark', custom: null };
}

export function saveTheme(data) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

export function resolveColors(saved) {
  if (saved?.custom) return { ...THEME_PRESETS.dark, ...saved.custom };
  const preset = THEME_PRESETS[saved?.preset] || THEME_PRESETS.dark;
  return { ...preset };
}

export function applyTheme(colors) {
  const root = document.documentElement;
  const map = {
    '--bg': colors.bg,
    '--bg2': colors.bg2,
    '--bg3': colors.bg3,
    '--surface': colors.surface,
    '--border': colors.border,
    '--text': colors.text,
    '--muted': colors.muted,
    '--accent': colors.accent,
    '--accent2': colors.accent2,
    '--green': colors.green,
    '--red': colors.red,
    '--blue': colors.blue,
    '--chart-bg': colors.chartBg,
    '--chart-grid': colors.chartGrid,
  };
  Object.entries(map).forEach(([k, v]) => root.style.setProperty(k, v));
  return colors;
}

export function initThemePanel(onChange) {
  const saved = getSavedTheme();
  let current = applyTheme(resolveColors(saved));

  const panel = document.getElementById('theme-panel');
  if (!panel) return current;

  panel.innerHTML = `
    <div class="theme-panel-shell">
      <div class="help-section-label">HOW THIS WORKS</div>
      <p class="theme-helper">Choose a desk preset, then fine-tune the key colors. Changes save automatically for this StockWay preview.</p>
      <div class="theme-section-title">Presets</div>
      <div class="theme-presets">
        ${Object.entries(THEME_PRESETS).map(([id, t]) => `
          <button class="preset-btn ${saved.preset === id && !saved.custom ? 'active' : ''}" data-preset="${id}" title="${t.name}">
            <span class="preset-swatch" style="background:linear-gradient(135deg, ${t.bg} 0 45%, ${t.bg2} 45% 70%, ${t.accent} 70%);border-color:${t.border}"></span>
            <span class="preset-copy"><strong>${t.name}</strong><small>${t.accent}</small></span>
          </button>
        `).join('')}
      </div>
      <div class="theme-section-title">Fine tune</div>
      <div class="color-pickers">
        ${colorField('Background', 'bg', current.bg)}
        ${colorField('Panels', 'bg2', current.bg2)}
        ${colorField('Accent', 'accent', current.accent)}
        ${colorField('Text', 'text', current.text)}
        ${colorField('Bull green', 'green', current.green)}
        ${colorField('Bear red', 'red', current.red)}
      </div>
      <button class="btn btn-sm" id="reset-theme">Reset to Stockbay</button>
    </div>
  `;

  function colorField(label, key, val) {
    return `<label class="color-field"><span>${label}</span><div class="color-control"><code>${val}</code><input type="color" data-key="${key}" value="${val}"></div></label>`;
  }

  panel.querySelectorAll('.preset-btn').forEach(btn => {
    btn.onclick = () => {
      const preset = btn.dataset.preset;
      const data = { preset, custom: null };
      saveTheme(data);
      current = applyTheme(resolveColors(data));
      panel.querySelectorAll('.preset-btn').forEach(b => b.classList.toggle('active', b === btn));
      panel.querySelectorAll('input[type=color]').forEach(inp => {
        const k = inp.dataset.key;
        if (current[k]) inp.value = current[k];
      });
      onChange?.(current);
    };
  });

  panel.querySelectorAll('input[type=color]').forEach(inp => {
    inp.oninput = () => {
      const custom = { ...current, [inp.dataset.key]: inp.value };
      if (inp.dataset.key === 'bg') custom.chartBg = inp.value;
      if (inp.dataset.key === 'bg2') custom.chartGrid = inp.value;
      const data = { preset: 'custom', custom };
      saveTheme(data);
      current = applyTheme(custom);
      panel.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      inp.closest('.color-control')?.querySelector('code')?.replaceChildren(document.createTextNode(inp.value));
      onChange?.(current);
    };
  });

  document.getElementById('reset-theme').onclick = () => {
    saveTheme({ preset: 'dark', custom: null });
    current = applyTheme(THEME_PRESETS.dark);
    initThemePanel(onChange);
    onChange?.(current);
  };

  return current;
}
