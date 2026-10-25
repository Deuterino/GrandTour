// Preact + htm, vendored (no build step). Import UI helpers from here.
import { h, render, Fragment, createContext } from '../vendor/preact.mjs';
import { useState, useEffect, useMemo, useRef, useCallback, useContext, useReducer, useLayoutEffect } from '../vendor/hooks.mjs';
import htm from '../vendor/htm.mjs';
import * as store from '../core/store.js';

export const html = htm.bind(h);
export { h, render, Fragment, createContext, useState, useEffect, useMemo, useRef, useCallback, useContext, useReducer, useLayoutEffect };

export const cx = (...a) => a.filter(Boolean).join(' ');

// Re-render when the persistent store changes.
export function useStore() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => store.subscribe(() => force()), []);
  return store.get();
}

// Current course data (LangData) is provided by the app root.
export const CourseCtx = createContext(null);
export const useCourse = () => useContext(CourseCtx);

export function useAsync(fn, deps) {
  const [v, setV] = useState({ loading: true, value: null, error: null });
  useEffect(() => {
    let alive = true;
    setV((s) => ({ ...s, loading: true }));
    Promise.resolve().then(fn).then((value) => alive && setV({ loading: false, value, error: null }),
      (error) => alive && setV({ loading: false, value: null, error }));
    return () => { alive = false; };
  }, deps);
  return v;
}

// ---- toasts & sheets (simple global event bus) ----
const bus = new EventTarget();
export function toast(text, kind = '') { bus.dispatchEvent(new CustomEvent('toast', { detail: { text, kind, id: Math.random() } })); }
export function openSheet(render) { bus.dispatchEvent(new CustomEvent('sheet', { detail: render })); }
export function closeSheet() { bus.dispatchEvent(new CustomEvent('sheet', { detail: null })); }
export function onBus(name, fn) {
  const l = (e) => fn(e.detail);
  bus.addEventListener(name, l);
  return () => bus.removeEventListener(name, l);
}
