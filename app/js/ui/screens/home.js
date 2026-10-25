// Course picker and the journey map.
import { html, useCourse, useStore, openSheet, closeSheet, toast, cx } from '../h.js';
import * as store from '../../core/store.js';
import * as game from '../../core/game.js';
import * as SRS from '../../core/srs.js';
import { Bar, Ring, Icon } from '../components.js';
import { go } from '../router.js';
import { dueCards, facetsFor, cardKey } from '../../exercises/generate.js';

const COURSES = [
  { lang: 'de', flag: '🇩🇪', name: 'German', title: 'Die Wanderjahre', sub: 'A journeyman\'s travels from Hamburg to Vienna and Zürich' },
  { lang: 'it', flag: '🇮🇹', name: 'Italian', title: 'Il Grand Tour', sub: 'From the Alps to Sicily, in the footsteps of Goethe' },
];

export function CoursePicker() {
  const s = useStore();
  return html`<div style="padding-top:calc(var(--safe-t) + 1.5rem)">
    <div class="center" style="margin-bottom:1.5rem"><div class="boot-logo">Grand Tour</div>
      <div class="muted">Choose your journey. Each language keeps its own progress.</div></div>
    ${COURSES.map((c) => {
      const cs = s.courses[c.lang];
      const lv = cs ? game.level(cs) : null;
      return html`<button class="card" style="display:flex;gap:1rem;align-items:center;width:100%;text-align:left;cursor:pointer;margin-bottom:.9rem"
        onClick=${() => go(`/${c.lang}`)}>
        <span style="font-size:3rem">${c.flag}</span>
        <span class="grow"><b style="font-size:1.15rem">${c.name}</b> · <span class="book">${c.title}</span>
          <div class="small muted">${c.sub}</div>
          ${lv && html`<div class="small" style="margin-top:.3rem">Level ${lv.n} · ${game.title(c.lang, lv.n).name} · ${game.wordsLearned(cs)} words</div>`}</span>
      </button>`;
    })}
  </div>`;
}

export function unitState(L, c, ui) {
  const units = L.course.units;
  const u = units[ui];
  const done = u.lessons.filter((l) => c.lessons[l.id]).length;
  const complete = done >= u.lessons.filter((l) => l.type !== 'boss').length;
  const prev = ui === 0 ? null : units[ui - 1];
  const prevComplete = !prev || prev.lessons.filter((l) => l.type !== 'boss').every((l) => c.lessons[l.id]) || c.units[prev.id]?.tested;
  const open = complete || prevComplete || c.units[u.id]?.tested || done > 0;
  const stars = done ? Math.round(u.lessons.reduce((s, l) => s + (c.lessons[l.id]?.best || 0), 0) / u.lessons.length) : 0;
  return { done, total: u.lessons.length, complete: complete || !!c.units[u.id]?.tested, open, stars };
}

export function nextLesson(L, c) {
  for (let i = 0; i < L.course.units.length; i++) {
    const st = unitState(L, c, i);
    if (!st.open) break;
    const u = L.course.units[i];
    const l = u.lessons.find((x) => !c.lessons[x.id] && x.type !== 'boss');
    if (l) return { unit: u, lesson: l, index: i };
  }
  return null;
}

const LESSON_ICON = { learn: '🆕', grammar: '🎓', story: '📜', drill: '❓', practice: '🔁', boss: '🏰' };
const LESSON_NAME = { learn: 'New words', grammar: 'Grammar', story: 'Story & dialogue', drill: 'Question & answer', practice: 'Practice', boss: 'Checkpoint' };

export function startLesson(L, lesson) {
  const c = store.course(L.lang);
  const isNew = ['learn', 'grammar', 'story', 'drill'].includes(lesson.type);
  const h = game.hearts(c);
  const due = dueCards(c, 200).length;
  const gate = store.get().settings.reviewGate;
  if (isNew && h.n === 0) {
    openSheet(() => html`<div class="center"><div style="font-size:3rem">💔</div><h2>Out of hearts</h2>
      <p class="muted">Mistakes in new lessons cost a heart. A quick review refills them all — the words you missed are waiting there.</p>
      ${h.next && html`<p class="small muted">Or wait: one heart returns at ${new Date(h.next).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.</p>`}
      <button class="btn block good" onClick=${() => { closeSheet(); go(`/${L.lang}/review?mode=${c.mistakes.length ? 'mistakes' : 'review'}&t=${Date.now()}`); }}>
        ${c.mistakes.length ? 'Fix my mistakes' : 'Review now'}</button>
      <div style="height:.6rem"></div><button class="btn block ghost" onClick=${() => { closeSheet(); go(`/${L.lang}/library`); }}>Read something instead</button></div>`);
    return;
  }
  if (isNew && gate && due > gate) {
    openSheet(() => html`<div class="center"><div style="font-size:3rem">🗃️</div><h2>${due} words are waiting</h2>
      <p class="muted">Your review pile is above your limit (${gate}). Clear some before learning more — it's what makes the words stick.</p>
      <button class="btn block good" onClick=${() => { closeSheet(); go(`/${L.lang}/review?t=${Date.now()}`); }}>Review now</button></div>`);
    return;
  }
  go(`/${L.lang}/lesson/${lesson.id}?t=${Date.now()}`);
}

function UnitSheet({ L, ui }) {
  const c = store.course(L.lang);
  const u = L.course.units[ui];
  const st = unitState(L, c, ui);
  const learned = u.words.filter((w) => c.seen[w]).length;
  const chapters = (u.grammar || []).map((g) => L.grammar?.chapters?.find((x) => x.id === g)).filter(Boolean);
  const testOut = () => {
    closeSheet();
    const boss = u.lessons.find((l) => l.type === 'boss') || u.lessons.find((l) => l.type === 'practice');
    go(`/${L.lang}/lesson/${boss.id}?t=${Date.now()}&test=1`);
  };
  return html`<div class="unit-sheet">
    <div class="row"><span style="font-size:2.4rem">${u.emoji}</span><div class="grow"><h2 style="margin:0">${u.city}</h2>
      <div class="muted small">Stop ${u.n} · ${u.title}</div></div></div>
    <div class="tip" style="margin:.8rem 0">${u.fact}</div>
    ${chapters.length > 0 && html`<div class="small" style="margin-bottom:.4rem">Grammar: ${chapters.map((ch, i) => html`${i ? ', ' : ''}<a href=${`#/${L.lang}/grammar/${ch.id}`} onClick=${closeSheet}>${ch.title}</a>`)}</div>`}
    <div class="small muted" style="margin-bottom:.6rem">${learned}/${u.words.length} words learned · ${st.done}/${st.total} lessons</div>
    ${!st.open && html`<div class="tip">This stop is still ahead of you. Finish the previous stop — or prove you know it already:</div>
      <button class="btn block gold" onClick=${testOut}>🏰 Take the test to jump here</button>`}
    ${st.open && u.lessons.map((l, i) => {
      const done = c.lessons[l.id];
      const isNext = !done && u.lessons.slice(0, i).every((x) => c.lessons[x.id] || x.type === 'boss');
      return html`<div class=${cx('lesson-row', done && 'done', isNext && 'next')}>
        <span class="lesson-ico">${LESSON_ICON[l.type]}</span>
        <div class="grow"><b>${LESSON_NAME[l.type]}</b>${l.type === 'learn' && html`<div class="tiny muted">${l.words.slice(0, 5).map((w) => L.get(w)?.l).join(', ')}${l.words.length > 5 ? '…' : ''}</div>`}</div>
        ${done ? html`<span class="small" title="best">${'★'.repeat(done.best)}${'☆'.repeat(3 - done.best)}</span>` : ''}
        <button class=${cx('btn small', !isNext && 'ghost')} onClick=${() => { closeSheet(); startLesson(L, l); }}>${done ? 'Redo' : 'Start'}</button>
      </div>`;
    })}
  </div>`;
}

export function Home() {
  const L = useCourse();
  const s = useStore();
  const c = store.course(L.lang);
  const lv = game.level(c);
  const t = game.title(L.lang, lv.n);
  const goal = s.settings.dailyGoal;
  const todayXP = game.xpOn(c, store.today());
  const st = game.streak(c);
  const nxt = nextLesson(L, c);
  const due = dueCards(c, 500).length;
  const hearts = game.hearts(c);
  return html`<div>
    <div class="card">
      <div class="row between"><div><div class="small muted">${L.course.title}</div>
        <h2 style="margin:.1rem 0" class="book">${t.name} <span class="small muted" style="font-family:var(--ui)">(${t.en})</span></h2>
        <div class="small muted">Level ${lv.n} · ${game.wordsLearned(c)} words · ${game.masteredCount(c)} mastered</div></div>
        <${Ring} value=${todayXP / goal} label=${`${Math.min(100, Math.round((todayXP / goal) * 100))}%`} size=${62}/></div>
      <div style="margin:.7rem 0 .2rem"><${Bar} value=${lv.frac}/></div>
      <div class="tiny muted row between"><span>${lv.xp - lv.from} / ${lv.to - lv.from} XP to level ${lv.n + 1}</span><span>🔥 ${st.n} day${st.n === 1 ? '' : 's'}${st.today ? ' ✓ today' : ''}</span></div>
      ${nxt ? html`<button class="btn block" style="margin-top:.9rem" onClick=${() => startLesson(L, nxt.lesson)}>
        ${c.lessons && Object.keys(c.lessons).length ? 'Continue' : 'Start'}: ${nxt.unit.city} · ${LESSON_NAME[nxt.lesson.type]}</button>`
      : html`<div class="tip" style="margin-top:.9rem">You've reached the end of the road. Keep reviewing and reading!</div>`}
    </div>
    ${(due > 0 || hearts.n < 5) && html`<div class="card row">
      <span style="font-size:2rem">🔁</span><div class="grow"><b>${due ? `${due} card${due === 1 ? '' : 's'} to review` : 'Refill your hearts'}</b>
        <div class="small muted">${hearts.n < 5 ? `${hearts.n}/5 hearts — reviewing refills them` : 'Spaced repetition: review just before you forget'}</div></div>
      <button class="btn small good" onClick=${() => go(`/${L.lang}/review?t=${Date.now()}`)}>Review</button></div>`}
    ${L.course.sections.map((sec) => html`<${Region} sec=${sec} L=${L} c=${c} next=${nxt}/>`)}
  </div>`;
}

function Region({ sec, L, c, next }) {
  const units = sec.units.map((id) => L.course.units.findIndex((u) => u.id === id));
  const doneCount = units.filter((ui) => unitState(L, c, ui).complete).length;
  return html`<div>
    <div class="region"><div class="cartouche"><h2>${sec.emoji} ${sec.region}</h2>
      <div class="sub">${sec.title} · ${sec.cefr} · ${doneCount}/${units.length}</div></div></div>
    <div class="path">${units.map((ui, k) => {
      const u = L.course.units[ui];
      const st = unitState(L, c, ui);
      const cur = next && next.unit.id === u.id;
      const off = k % 4 === 1 ? 'offset-r' : k % 4 === 3 ? 'offset-l' : '';
      return html`${k > 0 && html`<div class="dots"></div>`}<div class=${cx('stop', off, st.complete ? 'done' : st.open ? 'open' : 'locked', cur && 'current')}>
        ${st.stars > 0 && html`<span class="stop-stars">${'★'.repeat(st.stars)}</span>`}
        <button class="stop-btn" aria-label=${u.city} onClick=${() => openSheet(() => html`<${UnitSheet} L=${L} ui=${ui}/>`)}>${st.open || st.complete ? u.emoji : '🔒'}</button>
        <div class="stop-name">${u.city}</div><div class="stop-theme">${u.title}</div></div>`;
    })}</div>
  </div>`;
}

// Passing a test from a locked stop marks every earlier stop as known (test-out).
export function testOutUpTo(L, unitId) {
  const c = store.course(L.lang);
  const ui = L.course.units.findIndex((u) => u.id === unitId);
  const now = Date.now();
  store.update(() => {
    for (const u of L.course.units.slice(0, ui)) {
      c.units[u.id] = { ...(c.units[u.id] || {}), tested: now };
      for (const w of u.words) {
        c.seen[w] = c.seen[w] || now;
        const e = L.get(w);
        for (const f of facetsFor(e, L.lang)) {
          const k = cardKey(w, f);
          if (!c.cards[k]) {
            const card = SRS.review(null, SRS.GOOD, now);
            card.due = now + (2 + Math.random() * 12) * 86400000; // spread the first reviews out
            c.cards[k] = card;
          }
        }
      }
    }
  });
  toast(`Jumped ahead to ${L.course.units[ui].city} — earlier words are now in your reviews.`, 'gold');
}
