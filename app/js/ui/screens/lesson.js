// Lesson player: runs a queue of exercises, re-asks missed ones, keeps combos and hearts, then grades
// every facet into the spaced-repetition scheduler and celebrates.
import { html, useState, useEffect, useMemo, useRef, useCourse, cx, toast } from '../h.js';
import * as store from '../../core/store.js';
import * as game from '../../core/game.js';
import * as SRS from '../../core/srs.js';
import { sfx } from '../../core/sfx.js';
import { scheduleSync } from '../../core/sync.js';
import * as G from '../../exercises/generate.js';
import { buildDrill } from '../../exercises/drills.js';
import { VIEWS } from '../../exercises/views.js';
import { Bar, Icon, Confetti, Speak } from '../components.js';
import { go } from '../router.js';
import { shuffle } from '../../core/text.js';
import { testOutUpTo } from './home.js';

const RIGHT = { de: ['Richtig!', 'Sehr gut!', 'Genau!', 'Prima!', 'Super!', 'Toll!'], it: ['Esatto!', 'Bravo!', 'Perfetto!', 'Ottimo!', 'Giusto!', 'Benissimo!'] };
const NEW_LESSON_TYPES = new Set(['learn', 'grammar', 'story', 'drill']);

export function findLesson(L, lessonId) {
  for (const u of L.course?.units || []) for (const l of u.lessons) if (l.id === lessonId) return { unit: u, lesson: l };
  return null;
}

function unitIndexOf(L, unitId) { return Math.max(0, (L.course?.units || []).findIndex((u) => u.id === unitId)); }

function furthestUnit(L, c) {
  let best = 0;
  (L.course?.units || []).forEach((u, i) => { if (u.lessons.some((l) => c.lessons[l.id]) || c.units[u.id]?.tested) best = i; });
  return best;
}

// Turn a session spec into exercises.
export function buildSession(spec, L, c) {
  const unit = spec.unitId ? L.course.units.find((u) => u.id === spec.unitId) : null;
  const ui = unit ? unitIndexOf(L, unit.id) : furthestUnit(L, c);
  const ctx = new G.Ctx(L, c, Math.max(ui, furthestUnit(L, c)));
  const s = store.get().settings;
  const opts = { speaking: s.speaking, listening: s.listening };
  const lesson = spec.lesson;
  let list = [];
  let title = '';
  if (spec.type === 'learn') { list = G.learnLesson(ctx, lesson.words, opts); title = 'New words'; }
  else if (spec.type === 'grammar') {
    const chapters = (lesson.grammar || []).map((id) => L.grammar?.chapters?.find((ch) => ch.id === id)).filter(Boolean);
    for (const ch of chapters) {
      for (const t of ch.tips || []) list.push({ kind: 'tip', scored: false, chapterTitle: ch.title, ...t });
      list.push(...G.grammarDrills(ctx, ch, unit.words));
    }
    if (!list.length) list = G.practiceLesson(ctx, unit.words, 12);
    title = chapters.map((c) => c.title).join(' · ') || 'Grammar';
  } else if (spec.type === 'story') { list = storyExercises(L, ctx, unit, opts); title = 'Story'; }
  else if (spec.type === 'drill') { list = buildDrill(ctx, unit, opts); title = 'Drill'; }
  else if (spec.type === 'practice') { list = G.practiceLesson(ctx, unit.words, 16); title = `Practice: ${unit.city}`; }
  else if (spec.type === 'boss') {
    const sec = L.course.sections.find((x) => x.n === unit.section);
    const ids = sec.units.flatMap((uid) => L.course.units.find((u) => u.id === uid).words);
    list = G.practiceLesson(ctx, ids, 22).map((x) => ({ ...x, strict: true }));
    title = `Checkpoint: ${sec.region}`;
  } else if (spec.type === 'review') {
    const keys = G.dueCards(c, spec.n || 20);
    list = G.reviewLesson(ctx, keys);
    title = 'Review';
  } else if (spec.type === 'mistakes') {
    const keys = [...new Set(c.mistakes.map((m) => m.key))].slice(0, 20);
    list = G.reviewLesson(ctx, keys);
    title = 'Fix your mistakes';
  } else if (spec.type === 'custom') { list = spec.build(ctx); title = spec.title; }
  return { list: list.filter(Boolean), title, ctx };
}

function storyExercises(L, ctx, unit, opts) {
  const texts = (L.texts?.units?.[unit.id] || []);
  const out = [];
  for (const t of texts) {
    if (t.type === 'gouin') {
      out.push({ kind: 'read', scored: false, title: t.title, intro: t.intro || 'A Gouin series: a chain of everyday actions, told in order.', lines: t.lines, label: 'Series' });
      const idx = t.lines.map((_, i) => i);
      out.push({ kind: 'order', scored: true, xp: 15, lines: t.lines, shuffled: shuffle(idx), hint: 'Put the actions back in the order they happen.', label: 'Put the series in order' });
      continue;
    }
    out.push({ kind: 'read', scored: false, title: t.title, intro: t.intro, lines: t.lines, label: t.type === 'dialogue' ? 'Dialogue' : 'Reading' });
    for (const q of t.questions || []) {
      out.push({ kind: 'cloze', scored: true, xp: 10, prompt: { text: q.q, en: q.en }, options: shuffle(q.o.map((o, i) => ({ text: o, ok: i === 0 }))), label: 'Comprehension', explain: q.why });
    }
    const speakable = t.lines.filter((l) => l.t.split(' ').length <= 12);
    if (opts.speaking) for (const l of shuffle(speakable).slice(0, 2)) out.push({ kind: 'speak', scored: true, xp: 10, prompt: { text: l.t, en: l.e }, stat: 'spoken', label: 'Say your line' });
    const dict = speakable[Math.floor(Math.random() * speakable.length)];
    if (dict && opts.listening) out.push({ kind: 'type', scored: true, xp: 10, long: true, prompt: { audioText: dict.t }, accepted: [dict.t], stat: 'listened', label: 'Diktat — write what you hear' });
  }
  if (!out.length) {
    // no authored text yet: a mini-reader made of example sentences for this unit's words
    const lines = [];
    for (const id of unit.words) {
      const s = ctx.sentencesFor(id, 1)[0];
      if (s && !lines.some((l) => l.t === s.t)) lines.push({ t: s.t, e: s.e[0] });
      if (lines.length >= 8) break;
    }
    if (lines.length) {
      out.push({ kind: 'read', scored: false, title: `Sentences from ${unit.city}`, intro: 'Tap any word for its meaning and grammar.', lines, label: 'Reading' });
      for (const l of lines.slice(0, 3)) out.push(G.translateSentence(ctx, { id: 'x', t: l.t, e: [l.e], alt: [] }, null, true));
    }
  }
  return out;
}

export function Lesson({ spec }) {
  const L = useCourse();
  const lang = L.lang;
  const c = store.course(lang);
  const session = useMemo(() => buildSession(spec, L, c), [spec.key]);
  const [queue, setQueue] = useState(() => session.list.map((x, i) => ({ ...x, qid: i })));
  const [pos, setPos] = useState(0);
  const [fb, setFb] = useState(null); // feedback after an answer
  const [combo, setCombo] = useState(0);
  const [stats, setStats] = useState({ right: 0, wrong: 0, best: 0, xp: 0, read: 0 });
  const [finished, setFinished] = useState(false);
  const results = useRef(new Map()); // facet key -> first grade
  const firstTry = useRef(new Set());
  const counted = useRef(new Set());
  const started = useRef(Date.now());
  const isNew = NEW_LESSON_TYPES.has(spec.type);
  const total = session.list.filter((x) => x.scored).length || 1;
  const done = stats.right;
  const cur = queue[pos];

  useEffect(() => {
    if (!session.list.length) { toast('Nothing to practise here yet.'); history.back(); }
  }, []);

  const onResult = (r) => {
    if (fb) return;
    const ex = cur;
    if (r.skip || !ex.scored) { next(); if (r.read) setStats((s) => ({ ...s, read: s.read + r.read })); return; }
    const first = !firstTry.current.has(ex.qid);
    firstTry.current.add(ex.qid);
    const grade = r.correct ? (r.grade || SRS.GOOD) : SRS.AGAIN;
    if (ex.facet && first) results.current.set(ex.facet, Math.min(results.current.get(ex.facet) ?? 9, grade));
    if (r.genderWrong && ex.noun) results.current.set(G.cardKey(ex.noun, 'g'), SRS.AGAIN);
    if (r.stat && r.correct) game.addStat(lang, r.stat);
    if (r.correct) {
      sfx.right();
      const nc = combo + 1;
      setCombo(nc);
      if (nc >= 5 && nc % 5 === 0) sfx.combo(nc);
      const gain = first ? 1 + (nc >= 5 ? 1 : 0) : 0;
      setStats((s) => ({ ...s, right: s.right + (counted.current.has(ex.qid) ? 0 : 1), best: Math.max(s.best, nc), xp: s.xp + gain }));
      counted.current.add(ex.qid);
    } else {
      sfx.wrong();
      setCombo(0);
      setStats((s) => ({ ...s, wrong: s.wrong + 1 }));
      if (first && isNew) {
        game.loseHeart(lang);
        const h = game.hearts(store.course(lang)).n;
        if (h === 0) toast('Out of hearts 💔 Finish this lesson — then a review will refill them.');
      }
      if (first && ex.facet) store.update(() => { c.mistakes.unshift({ key: ex.facet, ts: Date.now() }); c.mistakes = c.mistakes.slice(0, 150); });
      // ask again a few exercises later (at most twice)
      if ((ex.retries || 0) < 2) {
        setQueue((q) => { const n = [...q]; n.splice(Math.min(n.length, pos + 3 + Math.floor(Math.random() * 2)), 0, { ...ex, retry: true, retries: (ex.retries || 0) + 1 }); return n; });
      }
    }
    setFb({ ...r, ex });
  };

  const next = () => {
    setFb(null);
    if (pos + 1 >= queue.length) finish();
    else setPos(pos + 1);
  };

  const finish = () => {
    if (finished) return;
    setFinished(true);
    const now = Date.now();
    const perfect = stats.wrong === 0;
    store.update(() => {
      for (const [key, grade] of results.current) c.cards[key] = SRS.review(c.cards[key], grade, now);
      for (const x of session.list) if (x.kind === 'intro') c.seen[x.word] = c.seen[x.word] || now;
      // introduced words get cards for every facet, even ones not drilled this time
      for (const x of session.list) if (x.kind === 'intro') {
        const e = L.get(x.word);
        for (const f of G.facetsFor(e, lang)) { const k = G.cardKey(e.id, f); if (!c.cards[k]) c.cards[k] = SRS.review(null, SRS.HARD, now); }
      }
      if (spec.lesson) {
        const prev = c.lessons[spec.lesson.id];
        const stars = perfect ? 3 : stats.wrong <= 2 ? 2 : 1;
        c.lessons[spec.lesson.id] = { done: prev?.done || now, best: Math.max(prev?.best || 0, stars), n: (prev?.n || 0) + 1 };
      }
    });
    const xp = stats.xp + 5 + (perfect ? 5 : 0) + Math.floor(stats.read / 30);
    game.addXP(lang, xp);
    game.earn(lang, 5 + (perfect ? 5 : 0));
    if (perfect) game.addStat(lang, 'perfect');
    if (stats.read) game.addStat(lang, 'readWords', stats.read);
    if (spec.type === 'review' || spec.type === 'mistakes') {
      game.addStat(lang, 'reviews', stats.right);
      game.refillHearts(lang);
      if (spec.type === 'mistakes') store.update(() => { c.mistakes = []; });
    }
    if (spec.type === 'practice' || spec.type === 'boss') game.refillHearts(lang, 2);
    game.recordBest(lang, 'bestCombo', stats.best);
    const h = new Date().getHours();
    if (h >= 23) game.addStat(lang, 'owl');
    if (h < 7) game.addStat(lang, 'lark');
    sfx.fanfare();
    scheduleSync();
    setStats((s) => ({ ...s, xp }));
  };

  if (!session.list.length) return null;
  if (finished) return html`<${Results} stats=${stats} spec=${spec} lang=${lang} title=${session.title} minutes=${Math.max(1, Math.round((Date.now() - started.current) / 60000))}/>`;
  const View = VIEWS[cur.kind];
  window.__gt = { ex: cur, pos, total: queue.length }; // test hook (tests/autoplay.js)
  const hearts = game.hearts(store.course(lang)).n;
  return html`<div class="player">
    <div class="player-top">
      <button class="iconbtn" aria-label="Quit" onClick=${() => (confirm('Leave this lesson? Progress in it will be lost.') ? history.back() : null)}>${Icon.close({ width: 24 })}</button>
      <${Bar} value=${done / total}/>
      ${combo >= 3 && html`<span class="combo">${Icon.bolt({ width: 14 })} ${combo}</span>`}
      ${isNew && html`<span class=${cx('stat hearts', hearts === 0 && 'off')}>${Icon.heart({ width: 20 })} ${hearts}</span>`}
    </div>
    <div class="player-body" key=${cur.qid + (cur.retry ? 'r' + pos : '')}>
      ${cur.retry && html`<div class="pill gold" style="align-self:flex-start;margin-bottom:.6rem">Let's try this one again</div>`}
      <${View} ex=${cur} L=${L} onResult=${onResult} answered=${!!fb}
        onSkipSpeaking=${() => store.update((s) => { s.settings.speaking = false; setTimeout(() => store.update((t) => { t.settings.speaking = true; }), 15 * 60000); })}/>
    </div>
    ${fb && html`<${Feedback} fb=${fb} lang=${lang} L=${L} onNext=${next}/>`}
  </div>`;
}

function Feedback({ fb, lang, L, onNext }) {
  const ref = useRef();
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e) => { if (e.key === 'Enter') onNext(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const ok = fb.correct;
  const word = fb.ex.words?.length === 1 ? L.get(fb.ex.words[0]) : null;
  return html`<div class=${cx('feedback', ok ? 'ok' : 'no')}>
    <h3>${ok ? RIGHT[lang][Math.floor(Math.random() * RIGHT[lang].length)] : 'Not quite'}</h3>
    ${(!ok || fb.notes?.length) && fb.expected && html`<div class="sol row"><span class="grow">${ok ? '' : 'Correct: '}<b>${fb.expected}</b></span>
      ${!/[a-z] = /.test(fb.expected) && html`<${Speak} text=${fb.expected.replace(/^die … |→.*$/, '')} lang=${lang}/>`}</div>`}
    ${fb.ops && !ok && html`<div class="diff small" style="margin-bottom:.4rem">${fb.ops.map((o) => html`<span class=${o.s}>${o.got || o.t} </span>`)}</div>`}
    ${(fb.notes || []).map((n) => html`<div class="small" style="margin-bottom:.3rem">${n}</div>`)}
    ${fb.ex.explain && html`<div class="tip rule small" style="margin:.3rem 0 .6rem">${fb.ex.explain}</div>`}
    ${word && !ok && word.en && html`<div class="small muted" style="margin-bottom:.4rem">${word.l}: ${word.en}</div>`}
    <button ref=${ref} class=${cx('btn block', ok ? 'good' : 'bad')} onClick=${onNext}>Continue</button>
  </div>`;
}

function Results({ stats, spec, lang, title, minutes }) {
  const L = useCourse();
  const [ach, setAch] = useState([]);
  const c = store.course(lang);
  const st = game.streak(c);
  const goal = store.get().settings.dailyGoal;
  const todayXP = game.xpOn(c, store.today());
  const accuracy = stats.right + stats.wrong ? Math.round((stats.right / (stats.right + stats.wrong)) * 100) : 100;
  useEffect(() => {
    if (spec.testOut) {
      if (accuracy >= 80) testOutUpTo(L, spec.unitId);
      else toast(`${accuracy}% — you need 80% to jump ahead. Keep travelling!`);
    }
    const a = game.checkAchievements(lang);
    if (a.length) { setAch(a); setTimeout(() => sfx.coin(), 700); }
  }, []);
  const unit = spec.unitId ? L.course.units.find((u) => u.id === spec.unitId) : null;
  return html`<div class="player"><${Confetti} run=${true}/>
    <div class="result">
      <div class="big">${stats.wrong === 0 ? '💎' : accuracy >= 80 ? '🏅' : '🎒'}</div>
      <h1 class="book">${stats.wrong === 0 ? (lang === 'de' ? 'Fehlerfrei!' : 'Senza errori!') : (lang === 'de' ? 'Geschafft!' : 'Fatto!')}</h1>
      <div class="muted">${title}${unit ? ` · ${unit.city}` : ''}</div>
      <div class="result-stats">
        <div class="card"><b style="color:var(--accent)">+${stats.xp}</b><span class="tiny muted">XP</span></div>
        <div class="card"><b style="color:var(--good)">${accuracy}%</b><span class="tiny muted">accuracy</span></div>
        <div class="card"><b style="color:#e8710a">🔥 ${st.n}</b><span class="tiny muted">day streak</span></div>
      </div>
      <div class="card tight" style="text-align:left"><div class="row between small"><span>Today's goal</span><span>${Math.min(todayXP, goal)} / ${goal} XP</span></div>
        <${Bar} value=${todayXP / goal} kind="gold"/></div>
      ${stats.best >= 5 && html`<div class="pill gold" style="margin-top:.8rem">${Icon.bolt({ width: 12 })} best combo ${stats.best}</div>`}
      ${ach.map((a) => html`<div class="card" style="margin-top:.8rem"><div class="row"><span style="font-size:2rem">${a.icon}</span>
        <div class="grow" style="text-align:left"><b>Achievement: ${a.name}</b><div class="small muted">${a.desc} · +15 ${game.COIN[lang].name}</div></div></div></div>`)}
    </div>
    <div class="foot"><button class="btn block" onClick=${() => go(`/${lang}`, true)}>Continue</button></div>
  </div>`;
}
