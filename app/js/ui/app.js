// App root: course loading, router, top bar, tab bar, sheets and toasts.
import { html, useState, useEffect, CourseCtx, useStore, onBus, closeSheet, cx } from './h.js';
import { useRoute, go } from './router.js';
import * as store from '../core/store.js';
import * as game from '../core/game.js';
import { loadCourse } from '../core/data.js';
import { Icon } from './components.js';
import { Home, CoursePicker } from './screens/home.js';
import { Lesson, findLesson } from './screens/lesson.js';
import { Practice } from './screens/practice.js';
import { Words, WordPage } from './screens/words.js';
import { Grammar, Chapter } from './screens/grammar.js';
import { Library, Reader } from './screens/library.js';
import { Profile, Settings } from './screens/profile.js';

const FLAG = { de: '🇩🇪', it: '🇮🇹' };
export const COURSE_NAME = { de: 'German', it: 'Italian' };

function Toasts() {
  const [list, setList] = useState([]);
  useEffect(() => onBus('toast', (t) => {
    setList((l) => [...l, t]);
    setTimeout(() => setList((l) => l.filter((x) => x.id !== t.id)), 3200);
  }), []);
  return html`<div class="toast-wrap">${list.map((t) => html`<div class=${cx('toast', t.kind)}>${t.text}</div>`)}</div>`;
}

function SheetHost() {
  const [render, setRender] = useState(null);
  useEffect(() => onBus('sheet', (r) => setRender(() => r)), []);
  useEffect(() => { // a sheet belongs to the page it was opened on
    const close = () => setRender(null);
    window.addEventListener('hashchange', close);
    return () => window.removeEventListener('hashchange', close);
  }, []);
  useEffect(() => {
    if (!render) return;
    const onKey = (e) => e.key === 'Escape' && closeSheet();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [render]);
  if (!render) return null;
  return html`<div><div class="scrim" onClick=${closeSheet}></div><div class="sheet" role="dialog">${render()}</div></div>`;
}

function TopBar({ lang }) {
  const s = useStore();
  const c = store.course(lang);
  const st = game.streak(c);
  const h = game.hearts(c);
  const lv = game.level(c);
  const goal = s.settings.dailyGoal;
  const todayXP = game.xpOn(c, store.today());
  return html`<header class="topbar">
    <button class="flag" title="Switch course" onClick=${() => go('/courses')}>${FLAG[lang]}</button>
    <span class=${cx('stat streak', !st.today && 'off')} title=${`${st.n}-day streak`}>${Icon.flame({ width: 20 })}${st.n}</span>
    <span class=${cx('stat hearts', h.n === 0 && 'off')} title="Hearts — refilled by reviewing">${Icon.heart({ width: 20 })}${h.n}</span>
    <span class="stat coins" title=${game.COIN[lang].name}>${Icon.coin({ width: 20 })}${game.coins(c)}</span>
    <span class="grow"></span>
    <button class="stat xp" style="background:none;border:0;cursor:pointer" title=${`Level ${lv.n} · today ${todayXP}/${goal} XP`} onClick=${() => go(`/${lang}/me`)}>
      <span class="pill accent">Lv ${lv.n}</span></button>
  </header>`;
}

const TABS = [
  ['path', '🗺️', 'Journey'], ['practice', '🏋️', 'Practice'], ['words', '📖', 'Words'], ['grammar', '🎓', 'Grammar'], ['library', '📚', 'Library'],
];

function TabBar({ lang, active }) {
  return html`<nav class="tabbar">${TABS.map(([k, ico, label]) => html`<a class=${cx('tab', active === k && 'on')} href=${`#/${lang}${k === 'path' ? '' : '/' + k}`}>
    <span class="ico">${ico}</span>${label}</a>`)}</nav>`;
}

export function App() {
  const route = useRoute();
  const s = useStore();
  const [L, setL] = useState(null);
  const [err, setErr] = useState(null);
  const p = route.parts;
  const lang = p[0] === 'de' || p[0] === 'it' ? p[0] : s.active;

  useEffect(() => {
    document.documentElement.dataset.theme = s.settings.theme === 'auto' ? '' : s.settings.theme;
    if (s.settings.theme === 'auto') delete document.documentElement.dataset.theme;
  }, [s.settings.theme]);

  useEffect(() => {
    if (!lang) return;
    document.documentElement.dataset.course = lang;
    document.documentElement.lang = lang;
    if (s.active !== lang) store.update((st) => { st.active = lang; store.course(lang); });
    if (L?.lang === lang) return;
    setL(null);
    loadCourse(lang).then((d) => { setL(d); game.applyFreezes(lang); }, (e) => setErr(e));
  }, [lang]);

  if (p[0] === 'courses' || !lang) return html`<div class="app"><main class="main"><${CoursePicker}/></main><${Toasts}/></div>`;
  if (err) return html`<div class="boot"><div class="boot-logo">Grand Tour</div><div class="boot-sub">Couldn't load the course: ${String(err.message || err)}</div></div>`;
  if (!L) return html`<div class="boot"><div class="boot-logo">${FLAG[lang]}</div><div class="boot-sub">Loading ${COURSE_NAME[lang]}…</div></div>`;

  const view = p[1] || 'path';
  let body = null, full = false, active = view;
  if (view === 'lesson') {
    const found = findLesson(L, p[2]);
    if (found) { body = html`<${Lesson} key=${p[2] + route.query.t} spec=${{ key: p[2] + route.query.t, type: found.lesson.type, lesson: found.lesson, unitId: found.unit.id, testOut: route.query.test === '1' }}/>`; full = true; }
  } else if (view === 'review') {
    body = html`<${Lesson} key=${'review' + route.query.t} spec=${{ key: 'review' + route.query.t, type: route.query.mode || 'review', n: +(route.query.n || 20) }}/>`; full = true;
  } else if (view === 'drill') {
    body = html`<${Practice} key=${p[2] + route.query.t} mode=${p[2]} run=${true}/>`; full = true;
  } else if (view === 'practice') body = html`<${Practice}/>`;
  else if (view === 'words') body = html`<${Words}/>`;
  else if (view === 'word') { body = html`<${WordPage} id=${p[2]}/>`; active = 'words'; }
  else if (view === 'grammar') body = p[2] ? html`<${Chapter} id=${p[2]}/>` : html`<${Grammar}/>`;
  else if (view === 'library') body = html`<${Library}/>`;
  else if (view === 'read') { body = html`<${Reader} bookId=${p[2]} chapter=${+(p[3] || 0)}/>`; active = 'library'; }
  else if (view === 'me') body = html`<${Profile}/>`;
  else if (view === 'settings') body = html`<${Settings}/>`;
  else body = html`<${Home}/>`;

  return html`<${CourseCtx.Provider} value=${L}>
    ${full ? body : html`<div class="app"><${TopBar} lang=${lang}/><main class="main">${body}</main><${TabBar} lang=${lang} active=${active}/></div>`}
    <${SheetHost}/><${Toasts}/>
  </${CourseCtx.Provider}>`;
}
