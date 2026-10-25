// Shared UI pieces.
import { html, useState, useEffect, useRef, cx } from './h.js';
import * as speech from '../core/speech.js';
import { headword, genderClass } from './word.js';

export const Icon = {
  heart: (p = {}) => html`<svg viewBox="0 0 24 24" fill="currentColor" ...${p}><path d="M12 21s-7.5-4.6-10-9.3C.4 8.4 2.3 4.5 6 4.5c2 0 3.3 1 4 2.1.7-1.1 2-2.1 4-2.1 3.7 0 5.6 3.9 4 7.2C19.5 16.4 12 21 12 21z"/></svg>`,
  flame: (p = {}) => html`<svg viewBox="0 0 24 24" fill="currentColor" ...${p}><path d="M12 2c1 3.5 5 5.5 5 10.5A5 5 0 0 1 12 18a5 5 0 0 1-5-5.5c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-6 1-9z"/><path d="M12 22c-3.9 0-7-2.7-7-6.5 0-1.2.3-2.3.8-3.3.4 3.3 3 5.3 6.2 5.3s5.8-2 6.2-5.3c.5 1 .8 2.1.8 3.3 0 3.8-3.1 6.5-7 6.5z" opacity=".55"/></svg>`,
  coin: (p = {}) => html`<svg viewBox="0 0 24 24" ...${p}><circle cx="12" cy="12" r="9" fill="currentColor"/><circle cx="12" cy="12" r="6.2" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.4"/><path d="M10 9.2h3.2a1.6 1.6 0 0 1 0 3.2H10v-3.2zm0 3.2h3.6a1.6 1.6 0 0 1 0 3.2H10" fill="none" stroke="#fff" stroke-width="1.4"/></svg>`,
  bolt: (p = {}) => html`<svg viewBox="0 0 24 24" fill="currentColor" ...${p}><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/></svg>`,
  close: (p = {}) => html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" ...${p}><path d="M6 6l12 12M18 6 6 18"/></svg>`,
  back: (p = {}) => html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" ...${p}><path d="M15 5l-7 7 7 7"/></svg>`,
  speaker: (p = {}) => html`<svg viewBox="0 0 24 24" fill="currentColor" ...${p}><path d="M4 9h3l5-4v14l-5-4H4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  turtle: (p = {}) => html`<svg viewBox="0 0 24 24" fill="currentColor" ...${p}><ellipse cx="11" cy="13" rx="7" ry="5"/><circle cx="19.5" cy="12" r="2"/><path d="M6 17l-1 3M15 17l1 3M6 9l-1-2M15 9l1-2" stroke="currentColor" stroke-width="2"/></svg>`,
  mic: (p = {}) => html`<svg viewBox="0 0 24 24" fill="currentColor" ...${p}><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  star: (p = {}) => html`<svg viewBox="0 0 24 24" fill="currentColor" ...${p}><path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.6L12 17.2 6.1 20.4l1.3-6.6L2.5 9.3l6.6-.8z"/></svg>`,
};

export function Bar({ value = 0, kind = '' }) {
  return html`<div class=${cx('bar', kind)}><i style=${`width:${Math.max(0, Math.min(1, value)) * 100}%`}></i></div>`;
}

export function Ring({ value = 0, size = 56, stroke = 7, label = '', color = 'var(--accent)' }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return html`<span class="ring" style=${`width:${size}px;height:${size}px`}>
    <svg width=${size} height=${size}>
      <circle cx=${size / 2} cy=${size / 2} r=${r} fill="none" stroke="var(--bg2)" stroke-width=${stroke}/>
      <circle cx=${size / 2} cy=${size / 2} r=${r} fill="none" stroke=${color} stroke-width=${stroke} stroke-linecap="round"
        stroke-dasharray=${c} stroke-dashoffset=${c * (1 - Math.min(1, value))} style="transition:stroke-dashoffset .6s"/>
    </svg><span class="lbl">${label}</span></span>`;
}

// Play button: word (native recording if available) or sentence (TTS). Long-press / turtle for slow.
export function Speak({ text, entry = null, lang, big = false, slow = false, auto = false, label = '' }) {
  const [playing, setPlaying] = useState(false);
  const play = async (e, slowly = slow) => {
    e?.stopPropagation?.();
    setPlaying(true);
    if (entry && !text) await speech.sayWord(entry, lang);
    else await speech.speak(text, lang, slowly ? { rate: 0.6 } : {});
    setPlaying(false);
  };
  useEffect(() => { if (auto) play(null); }, [auto, text, entry?.id]);
  return html`<button class=${cx('speak', big && 'big', playing && 'playing')} aria-label=${label || 'Play audio'} onClick=${(e) => play(e)}>
    ${slow ? Icon.turtle({ width: big ? 30 : 18 }) : Icon.speaker({ width: big ? 30 : 18 })}</button>`;
}

export function Art({ entry, lang, plural = false, big = false }) {
  if (!entry) return null;
  const { art, word } = headword(entry, lang);
  const gc = plural ? 'g-pl' : genderClass(entry);
  if (!art) return html`<span class=${cx('book', big && 'big')}>${word}</span>`;
  const join = art.endsWith("'") ? '' : ' ';
  return html`<span class=${cx('book', big && 'big')}><span class=${cx('art', gc)}>${art}</span>${join}${word}</span>`;
}

export function Mastery({ stage = 0, max = 5 }) {
  return html`<span class="mastery" title=${`mastery ${stage}/${max}`}>${Array.from({ length: max }, (_, i) => html`<i class=${i < stage ? 'on' : ''}></i>`)}</span>`;
}

export function Confetti({ run }) {
  const ref = useRef();
  useEffect(() => {
    if (!run) return;
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const W = (cv.width = innerWidth * devicePixelRatio), H = (cv.height = innerHeight * devicePixelRatio);
    const colors = ['#c99a1c', '#9d2a22', '#1f6b45', '#2c67c9', '#cf3065', '#f3cf62'];
    const ps = Array.from({ length: 140 }, () => ({ x: W / 2, y: H * 0.35, vx: (Math.random() - 0.5) * 22, vy: -Math.random() * 22 - 6,
      s: 6 + Math.random() * 8, c: colors[(Math.random() * colors.length) | 0], r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3 }));
    let t = 0, raf;
    const tick = () => {
      ctx.clearRect(0, 0, W, H);
      for (const p of ps) {
        p.vy += 0.6; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
      }
      if (++t < 160) raf = requestAnimationFrame(tick); else ctx.clearRect(0, 0, W, H);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [run]);
  return html`<canvas class="confetti" ref=${ref}></canvas>`;
}

export function Empty({ icon = '🧳', title, children }) {
  return html`<div class="card center" style="padding:2rem 1rem"><div style="font-size:2.4rem">${icon}</div><h3>${title}</h3><div class="muted">${children}</div></div>`;
}

export function BackBar({ title, onBack, right = null }) {
  return html`<div class="row" style="margin-bottom:.8rem">
    <button class="iconbtn" aria-label="Back" onClick=${onBack || (() => history.back())}>${Icon.back({ width: 24 })}</button>
    <h2 class="grow" style="margin:0">${title}</h2>${right}</div>`;
}

export const CHARS = { de: ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'], it: ['à', 'è', 'é', 'ì', 'ò', 'ù', "'"] };

// Special-character buttons under answer inputs (for keyboards without umlauts/accents).
export function CharBar({ lang, inputRef, onInsert }) {
  const ins = (ch) => {
    const el = inputRef?.current;
    if (!el) return onInsert?.(ch);
    const s = el.selectionStart ?? el.value.length, e = el.selectionEnd ?? el.value.length;
    const v = el.value.slice(0, s) + ch + el.value.slice(e);
    onInsert?.(v, s + ch.length);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + ch.length, s + ch.length); });
  };
  return html`<div class="charbar">${CHARS[lang].map((c) => html`<button type="button" onPointerDown=${(e) => { e.preventDefault(); ins(c); }}>${c}</button>`)}</div>`;
}
