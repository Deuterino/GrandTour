// Hash router: #/path/segments?query
import { useState, useEffect } from './h.js';

export function parse(hash = location.hash) {
  const raw = hash.replace(/^#\/?/, '');
  const [path, q = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const query = Object.fromEntries(new URLSearchParams(q));
  return { parts, query, path: '/' + parts.join('/') };
}

export function go(path, replace = false) {
  const h = '#' + (path.startsWith('/') ? path : '/' + path);
  if (replace) history.replaceState(null, '', h);
  else location.hash = h;
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function back(fallback = '/') {
  if (history.length > 1) history.back();
  else go(fallback);
}

export function useRoute() {
  const [r, setR] = useState(parse());
  useEffect(() => {
    const on = () => { setR(parse()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}
