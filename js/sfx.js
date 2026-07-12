// @ts-check
/** Soft UI sounds via Web Audio — no asset files */

let ctx = null;
let enabled = true;

function audio() {
  if (!enabled) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone({ freq = 440, dur = 0.05, type = 'sine', gain = 0.04, slide = 0 } = {}) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export function sfxClick() {
  tone({ freq: 620, dur: 0.035, type: 'triangle', gain: 0.03 });
}

export function sfxSelect() {
  tone({ freq: 520, dur: 0.04, type: 'sine', gain: 0.028, slide: 80 });
}

export function sfxBuy() {
  tone({ freq: 480, dur: 0.06, type: 'sine', gain: 0.045, slide: 160 });
  setTimeout(() => tone({ freq: 720, dur: 0.05, type: 'triangle', gain: 0.03 }), 40);
}

export function sfxSell() {
  tone({ freq: 400, dur: 0.06, type: 'sine', gain: 0.04, slide: -120 });
}

export function sfxSuccess() {
  tone({ freq: 523, dur: 0.05, type: 'sine', gain: 0.035 });
  setTimeout(() => tone({ freq: 659, dur: 0.07, type: 'sine', gain: 0.03 }), 55);
}

export function sfxError() {
  tone({ freq: 180, dur: 0.09, type: 'square', gain: 0.025, slide: -40 });
}

export function sfxToggle() {
  tone({ freq: 700, dur: 0.03, type: 'triangle', gain: 0.025 });
}

/** Soft click on interactive UI (delegated) */
export function installUiSounds() {
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const t = e.target.closest(
      'button, .nav-item, .watch-item, .listing, .perk.available, .hire-card.available, .tf-btn, .chart-tab, .speed-btn, .tb-btn, a.btn'
    );
    if (!t || t.disabled) return;
    if (t.classList.contains('btn-long') || t.id?.includes('buy') || t.id?.includes('long')) return;
    if (t.classList.contains('btn-short') || t.id?.includes('sell') || t.id?.includes('cover') || t.id?.includes('short')) return;
    sfxClick();
  }, true);
}

export function setSfxEnabled(on) {
  enabled = !!on;
}
