// Boot: load saved state, render, register the service worker, start sync.
import { html, render, toast } from './ui/h.js';
import * as store from './core/store.js';
import { App } from './ui/app.js';
import { primeAudio } from './core/sfx.js';
import { startAutoSync } from './core/sync.js';

async function boot() {
  await store.load();
  render(html`<${App}/>`, document.getElementById('app'));
  primeAudio();
  startAutoSync();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            toast('A new version is ready — it will load next time you open the app.');
            nw.postMessage('skipWaiting');
          }
        });
      });
    } catch (e) { console.warn('service worker', e); }
  }
  window.addEventListener('beforeunload', () => store.save());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') store.save(); });
}

boot().catch((e) => {
  document.getElementById('app').innerHTML = `<div class="boot"><div class="boot-logo">Grand Tour</div><div class="boot-sub">Something went wrong: ${String(e && e.message || e)}</div></div>`;
  console.error(e);
});
