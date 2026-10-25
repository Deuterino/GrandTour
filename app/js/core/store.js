// Persistent app state. One object, saved to IndexedDB (debounced) and merged across devices by sync.js.
import * as db from './db.js';
import { mergeCards } from './srs.js';

const KEY = 'state-v1';
export const MAX_HEARTS = 5;
export const HEART_REGEN_MS = 4 * 3600 * 1000;

const listeners = new Set();
let state = null;
let saveTimer = null;

export const DEFAULT_SETTINGS = {
  theme: 'auto', sound: true, autoplay: true, speaking: true, listening: true,
  rate: 0.95, voice: { de: null, it: null }, nativeAudio: true,
  dailyGoal: 50, readerSize: 1.22, interlinear: false, highlightKnown: true,
  aiKey: '', aiModel: 'claude-opus-5-5', gistToken: '', gistId: '', autoSync: true,
  reviewGate: 0, typing: 'mixed',
};

export function newCourseState() {
  return {
    started: Date.now(), xp: {}, lessons: {}, units: {}, cards: {}, seen: {},
    hearts: { n: MAX_HEARTS, ts: Date.now() }, wallet: {}, freezes: {}, ach: {}, stats: {},
    reading: {}, mistakes: [], grammarRead: {}, custom: {}, freezeDays: {},
  };
}

function fresh() {
  return { v: 1, device: 'd' + Math.random().toString(36).slice(2, 10), active: null, settings: { ...DEFAULT_SETTINGS },
    courses: {}, updated: Date.now() };
}

export async function load() {
  const saved = await db.get(KEY);
  state = saved && saved.v === 1 ? saved : fresh();
  state.settings = { ...DEFAULT_SETTINGS, ...state.settings, voice: { ...DEFAULT_SETTINGS.voice, ...(state.settings?.voice || {}) } };
  for (const c of Object.values(state.courses)) for (const [k, v] of Object.entries(newCourseState())) if (c[k] === undefined) c[k] = v;
  db.persist();
  return state;
}

export function get() { return state; }
export function course(lang = state.active) {
  if (!lang) return null;
  if (!state.courses[lang]) state.courses[lang] = newCourseState();
  return state.courses[lang];
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// Mutate through update() so listeners re-render and the change is saved.
export function update(fn) {
  fn(state);
  state.updated = Date.now();
  for (const l of listeners) l(state);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 400);
}

export async function save() { clearTimeout(saveTimer); await db.set(KEY, state); }

export function replace(next) {
  state = next;
  for (const l of listeners) l(state);
  return save();
}

export function today(d = new Date()) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

// ---- per-device counters (sum across devices, merge by max) ----
export function bump(c, field, key, n = 1) {
  c[field][state.device] = c[field][state.device] || {};
  c[field][state.device][key] = (c[field][state.device][key] || 0) + n;
}
export function total(c, field, key) {
  let s = 0;
  for (const dev of Object.values(c[field] || {})) s += dev[key] || 0;
  return s;
}

// ---- merging two states (sync) ----
function maxMap(a = {}, b = {}) {
  const out = { ...a };
  for (const k in b) {
    if (typeof b[k] === 'number') out[k] = Math.max(out[k] || 0, b[k]);
    else if (b[k] && typeof b[k] === 'object') out[k] = maxMap(out[k], b[k]);
  }
  return out;
}

function mergeCourse(a, b) {
  if (!a) return b;
  if (!b) return a;
  const out = { ...a };
  out.started = Math.min(a.started || Infinity, b.started || Infinity);
  out.xp = maxMap(a.xp, b.xp);
  out.wallet = maxMap(a.wallet, b.wallet);
  out.freezes = maxMap(a.freezes, b.freezes);
  out.stats = maxMap(a.stats, b.stats);
  out.cards = mergeCards(a.cards, b.cards);
  out.lessons = { ...a.lessons };
  for (const [k, v] of Object.entries(b.lessons || {})) {
    const o = out.lessons[k];
    out.lessons[k] = !o ? v : { done: Math.min(o.done, v.done), best: Math.max(o.best || 0, v.best || 0), n: Math.max(o.n || 0, v.n || 0) };
  }
  for (const f of ['seen', 'ach', 'grammarRead', 'units', 'freezeDays']) {
    out[f] = { ...(a[f] || {}) };
    for (const [k, v] of Object.entries(b[f] || {})) {
      if (typeof v === 'number') out[f][k] = out[f][k] ? Math.min(out[f][k], v) : v;
      else out[f][k] = out[f][k] || v;
    }
  }
  out.hearts = (b.hearts?.ts || 0) > (a.hearts?.ts || 0) ? b.hearts : a.hearts;
  out.reading = { ...a.reading };
  for (const [k, v] of Object.entries(b.reading || {})) if (!out.reading[k] || (v.ts || 0) > (out.reading[k].ts || 0)) out.reading[k] = v;
  const seenM = new Map();
  for (const m of [...(a.mistakes || []), ...(b.mistakes || [])]) if (!seenM.has(m.key) || seenM.get(m.key).ts < m.ts) seenM.set(m.key, m);
  out.mistakes = [...seenM.values()].sort((x, y) => y.ts - x.ts).slice(0, 150);
  out.custom = { ...(a.custom || {}), ...(b.custom || {}) };
  return out;
}

// Merge a remote snapshot into local state; local device id and secrets are kept.
export function merge(local, remote) {
  const out = { ...local, courses: { ...local.courses } };
  for (const lang of new Set([...Object.keys(local.courses), ...Object.keys(remote.courses || {})])) {
    out.courses[lang] = mergeCourse(local.courses[lang], remote.courses?.[lang]);
  }
  if (!local.active && remote.active) out.active = remote.active;
  const keep = { aiKey: local.settings.aiKey, gistToken: local.settings.gistToken, gistId: local.settings.gistId || remote.settings?.gistId };
  if ((remote.updated || 0) > (local.settingsUpdated || 0) && remote.settings) {
    out.settings = { ...local.settings, dailyGoal: remote.settings.dailyGoal ?? local.settings.dailyGoal };
  }
  Object.assign(out.settings, keep);
  out.updated = Math.max(local.updated || 0, remote.updated || 0);
  return out;
}

// What gets uploaded: everything except secrets and per-device preferences.
export function exportable(s = state) {
  const { aiKey, gistToken, voice, ...shared } = s.settings;
  return { ...s, settings: shared };
}
