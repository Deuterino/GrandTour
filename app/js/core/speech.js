// Speech: text-to-speech with the device's voices, native word recordings, and speech recognition.
import * as store from './store.js';

const LOCALE = { de: 'de-DE', it: 'it-IT' };
let voicesCache = [];

function loadVoices() {
  try { voicesCache = window.speechSynthesis?.getVoices() || []; } catch (e) { voicesCache = []; }
  return voicesCache;
}
if (typeof window !== 'undefined' && window.speechSynthesis) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

export function voices(lang) {
  const all = voicesCache.length ? voicesCache : loadVoices();
  return all.filter((v) => v.lang && v.lang.replace('_', '-').toLowerCase().startsWith(lang));
}

// Best available voice: user's choice, else an enhanced/premium local voice, else any.
export function pickVoice(lang) {
  const list = voices(lang);
  const chosen = store.get()?.settings?.voice?.[lang];
  if (chosen) {
    const v = list.find((x) => x.voiceURI === chosen);
    if (v) return v;
  }
  const score = (v) => (/premium|enhanced|neural|natural/i.test(v.name + v.voiceURI) ? 4 : 0) +
    (v.lang.replace('_', '-') === LOCALE[lang] ? 2 : 0) + (v.localService ? 1 : 0) +
    (/^(Anna|Petra|Markus|Yannick|Helena|Alice|Federica|Luca|Paola|Emma)/.test(v.name) ? 1 : 0);
  return [...list].sort((a, b) => score(b) - score(a))[0] || null;
}

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

let current = null;
export function stop() {
  try { window.speechSynthesis?.cancel(); } catch (e) { /* ignore */ }
  if (current?.audio) { current.audio.pause(); }
  current = null;
}

// Speak text; resolves when finished (or immediately if speech is unavailable).
export function speak(text, lang, { rate = null, onBoundary = null } = {}) {
  return new Promise((resolve) => {
    if (!canSpeak() || !text) return resolve(false);
    stop();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LOCALE[lang];
    const v = pickVoice(lang);
    if (v) u.voice = v;
    u.rate = rate ?? store.get()?.settings?.rate ?? 0.95;
    u.onend = () => resolve(true);
    u.onerror = () => resolve(false);
    if (onBoundary) u.onboundary = onBoundary;
    current = { u };
    window.speechSynthesis.speak(u);
  });
}

// A single word: prefer a native speaker's recording (Wikimedia Commons) when online.
export function sayWord(entry, lang, text = null) {
  const s = store.get()?.settings;
  if (entry?.au && s?.nativeAudio !== false && navigator.onLine && !text) {
    return new Promise((resolve) => {
      stop();
      const a = new Audio(entry.au);
      current = { audio: a };
      let done = false;
      const fallback = () => { if (!done) { done = true; speak(entry.l.replace(/^sich /, 'sich '), lang).then(resolve); } };
      a.onended = () => { done = true; resolve(true); };
      a.onerror = fallback;
      setTimeout(() => { if (a.readyState < 2) { a.pause(); fallback(); } }, 2500);
      a.play().catch(fallback);
    });
  }
  return speak(text || entry?.l || '', lang);
}

// ---- recognition ----
const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
export const canListen = () => !!SR;

// Listen once. Calls onInterim(text) while speaking; resolves {transcripts:[...], error}
export function listen(lang, { onInterim = null, timeout = 9000 } = {}) {
  return new Promise((resolve) => {
    if (!SR) return resolve({ transcripts: [], error: 'unsupported' });
    stop();
    let rec;
    try { rec = new SR(); } catch (e) { return resolve({ transcripts: [], error: 'unsupported' }); }
    rec.lang = LOCALE[lang];
    rec.interimResults = true;
    rec.maxAlternatives = 5;
    rec.continuous = false;
    const finals = [];
    let lastInterim = '';
    let finished = false;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { rec.stop(); } catch (e) { /* ignore */ }
      const transcripts = finals.length ? finals : (lastInterim ? [lastInterim] : []);
      resolve({ transcripts, error: transcripts.length ? null : error || 'no-speech' });
    };
    rec.onresult = (ev) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) for (let k = 0; k < r.length; k++) finals.push(r[k].transcript);
        else { lastInterim = r[0].transcript; onInterim?.(lastInterim); }
      }
      if (finals.length) finish();
    };
    rec.onerror = (ev) => finish(ev.error);
    rec.onend = () => finish();
    const timer = setTimeout(() => finish('timeout'), timeout);
    listen.abort = () => finish('aborted');
    try { rec.start(); } catch (e) { finish('start-failed'); }
  });
}

// Fallback when recognition is unavailable: record and play back for self-assessment.
export async function record(ms = 6000) {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return null;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const rec = new MediaRecorder(stream);
  const chunks = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  const done = new Promise((resolve) => { rec.onstop = () => resolve(); });
  rec.start();
  const stopIt = () => { if (rec.state !== 'inactive') rec.stop(); };
  const t = setTimeout(stopIt, ms);
  record.stop = () => { clearTimeout(t); stopIt(); };
  await done;
  stream.getTracks().forEach((tr) => tr.stop());
  return URL.createObjectURL(new Blob(chunks, { type: rec.mimeType || 'audio/mp4' }));
}
