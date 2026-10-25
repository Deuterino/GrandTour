// Small synthesized sound effects (no audio files to download).
import * as store from './store.js';

let ctx = null;
function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, start, dur, type = 'sine', gain = 0.12) {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime + start);
  g.gain.setValueAtTime(0, c.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + start);
  o.stop(c.currentTime + start + dur + 0.05);
}

const on = () => store.get()?.settings?.sound !== false;

export const sfx = {
  right() { if (on()) { tone(660, 0, 0.12, 'triangle'); tone(990, 0.08, 0.18, 'triangle'); } },
  wrong() { if (on()) { tone(220, 0, 0.18, 'sawtooth', 0.06); tone(180, 0.1, 0.25, 'sawtooth', 0.05); } },
  tap() { if (on()) tone(520, 0, 0.05, 'sine', 0.05); },
  combo(n) { if (on()) tone(523 + Math.min(n, 12) * 40, 0, 0.1, 'triangle', 0.08); },
  heart() { if (on()) { tone(300, 0, 0.12, 'square', 0.04); tone(240, 0.1, 0.2, 'square', 0.04); } },
  fanfare() {
    if (!on()) return;
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.3, 'triangle', 0.1));
    tone(1319, 0.5, 0.5, 'triangle', 0.08);
  },
  coin() { if (on()) { tone(988, 0, 0.08, 'square', 0.04); tone(1319, 0.07, 0.25, 'square', 0.04); } },
  unlock() { if (on()) [392, 523, 659].forEach((f, i) => tone(f, i * 0.09, 0.25, 'sine', 0.1)); },
};

// Unlock audio on the first user gesture (iOS needs this).
export function primeAudio() {
  const go = () => { ac(); window.removeEventListener('pointerdown', go); };
  window.addEventListener('pointerdown', go, { once: true });
}
