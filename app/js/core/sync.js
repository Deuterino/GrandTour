// Sync progress between devices through a private GitHub Gist (user's own token, gist scope).
// Remote and local state are merged (never overwritten), then the merge is uploaded.
import * as store from './store.js';
import { gzipSync, gunzipSync, strToU8, strFromU8 } from '../vendor/fflate.mjs';

const API = 'https://api.github.com';
const FILE = 'grand-tour-progress.gz.b64';
const DESC = 'Grand Tour language app — progress sync (managed by the app)';

let running = null;
let lastResult = { ok: null, at: 0, msg: '' };
export const status = () => lastResult;

function headers(token) {
  return { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' };
}

function b64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(s) {
  const bin = atob(s.trim());
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
export const encode = (obj) => b64(gzipSync(strToU8(JSON.stringify(obj)), { level: 9 }));
export const decode = (text) => JSON.parse(strFromU8(gunzipSync(unb64(text))));

async function gh(path, token, opts = {}) {
  const res = await fetch(API + path, { ...opts, headers: { ...headers(token), ...(opts.headers || {}) } });
  if (res.status === 401) throw new Error('GitHub rejected the token (401). Check it in Settings.');
  if (res.status === 403) throw new Error('GitHub refused (403): the token needs the "gist" permission, or the rate limit was hit.');
  if (!res.ok && res.status !== 404) throw new Error(`GitHub error ${res.status}`);
  return res.status === 404 ? null : res.json();
}

async function findGist(token) {
  for (let page = 1; page <= 5; page++) {
    const list = await gh(`/gists?per_page=100&page=${page}`, token);
    if (!list?.length) return null;
    const g = list.find((x) => x.description === DESC && x.files?.[FILE]);
    if (g) return g.id;
  }
  return null;
}

async function readRemote(gist, token) {
  const f = gist?.files?.[FILE];
  if (!f) return null;
  let content = f.content;
  if (f.truncated || !content) {
    const res = await fetch(f.raw_url);
    content = await res.text();
  }
  return decode(content);
}

// One sync round. Returns { ok, msg }.
export async function syncNow({ quiet = false } = {}) {
  if (running) return running;
  running = (async () => {
    const s = store.get();
    const token = s.settings.gistToken;
    if (!token) return (lastResult = { ok: false, at: Date.now(), msg: 'No GitHub token set.' });
    if (!navigator.onLine) return (lastResult = { ok: false, at: Date.now(), msg: 'Offline — will sync later.' });
    try {
      let id = s.settings.gistId;
      let gist = id ? await gh(`/gists/${id}`, token) : null;
      if (!gist) {
        id = await findGist(token);
        gist = id ? await gh(`/gists/${id}`, token) : null;
      }
      const remote = gist ? await readRemote(gist, token) : null;
      const merged = remote ? store.merge(store.get(), remote) : store.get();
      merged.settings.gistId = id || merged.settings.gistId;
      await store.replace(merged);
      const body = JSON.stringify({ description: DESC, files: { [FILE]: { content: encode(store.exportable(merged)) } } });
      if (gist) await gh(`/gists/${id}`, token, { method: 'PATCH', body });
      else {
        const created = await gh('/gists', token, { method: 'POST', body: JSON.stringify({ ...JSON.parse(body), public: false }) });
        store.update((st) => { st.settings.gistId = created.id; });
      }
      lastResult = { ok: true, at: Date.now(), msg: remote ? 'Synced with your other devices.' : 'Progress uploaded — sign in on your other device to sync.' };
    } catch (e) {
      lastResult = { ok: false, at: Date.now(), msg: e.message || String(e) };
      if (!quiet) console.warn('sync failed', e);
    }
    return lastResult;
  })();
  try { return await running; } finally { running = null; }
}

let timer = null;
// Debounced background sync after changes (e.g. finishing a lesson).
export function scheduleSync(ms = 8000) {
  if (!store.get()?.settings?.gistToken || !store.get()?.settings?.autoSync) return;
  clearTimeout(timer);
  timer = setTimeout(() => syncNow({ quiet: true }), ms);
}

export function startAutoSync() {
  if (!store.get()?.settings?.gistToken) return;
  syncNow({ quiet: true });
  setInterval(() => { if (document.visibilityState === 'visible') syncNow({ quiet: true }); }, 10 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleSync(1500); });
}

// Manual backup file (works without GitHub): download / import.
export function exportFile() {
  const blob = new Blob([JSON.stringify(store.exportable())], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `grand-tour-backup-${store.today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function importFile(file) {
  const remote = JSON.parse(await file.text());
  if (!remote || remote.v !== 1 || !remote.courses) throw new Error('Not a Grand Tour backup file.');
  await store.replace(store.merge(store.get(), remote));
}
