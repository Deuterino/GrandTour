// Tiny IndexedDB key-value store with a localStorage fallback (private mode, old browsers).
const DB_NAME = 'grand-tour';
const STORE = 'kv';
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
  return dbp;
}

function tx(db, mode) { return db.transaction(STORE, mode).objectStore(STORE); }

export async function get(key) {
  const db = await open();
  if (!db) {
    try { const v = localStorage.getItem(`gt:${key}`); return v ? JSON.parse(v) : undefined; } catch (e) { return undefined; }
  }
  return new Promise((resolve) => {
    const r = tx(db, 'readonly').get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => resolve(undefined);
  });
}

export async function set(key, value) {
  const db = await open();
  if (!db) {
    try { localStorage.setItem(`gt:${key}`, JSON.stringify(value)); } catch (e) { /* quota */ }
    return;
  }
  return new Promise((resolve) => {
    const r = tx(db, 'readwrite').put(value, key);
    r.onsuccess = () => resolve();
    r.onerror = () => resolve();
  });
}

export async function del(key) {
  const db = await open();
  if (!db) { try { localStorage.removeItem(`gt:${key}`); } catch (e) { /* ignore */ } return; }
  return new Promise((resolve) => {
    const r = tx(db, 'readwrite').delete(key);
    r.onsuccess = () => resolve();
    r.onerror = () => resolve();
  });
}

export async function keys(prefix = '') {
  const db = await open();
  if (!db) {
    const out = [];
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(`gt:${prefix}`)) out.push(k.slice(3)); } } catch (e) { /* ignore */ }
    return out;
  }
  return new Promise((resolve) => {
    const r = tx(db, 'readonly').getAllKeys();
    r.onsuccess = () => resolve(r.result.filter((k) => String(k).startsWith(prefix)));
    r.onerror = () => resolve([]);
  });
}

export async function persist() {
  try { if (navigator.storage?.persist) return await navigator.storage.persist(); } catch (e) { /* ignore */ }
  return false;
}
