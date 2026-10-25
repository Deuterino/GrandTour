// Practice hub: reviews and focused gyms built from the words you already know.
import { html, useState, useCourse, useStore, cx } from '../h.js';
import * as store from '../../core/store.js';
import * as G from '../../exercises/generate.js';
import { Lesson } from './lesson.js';
import { go } from '../router.js';
import { sample, shuffle } from '../../core/text.js';
import * as DE from '../../lang/de.js';
import * as IT from '../../lang/it.js';

function knownEntries(ctx, pred) {
  const seen = ctx.L.entries.filter((e) => !e.x && ctx.c.seen[e.id] && pred(e));
  if (seen.length >= 8) return seen;
  return ctx.L.entries.filter((e) => !e.x && (ctx.unitOf.get(e.id) ?? 99) <= Math.max(ctx.unitIndex, 3) && pred(e));
}

const MODES = {
  gender: { icon: '⚖️', title: { de: 'der · die · das gym', it: 'il · lo · la gym' }, desc: 'Rapid-fire articles with the rule behind each one.',
    build: (ctx) => sample(knownEntries(ctx, (e) => e.p === 'n' && !['pl', 'mpl', 'fpl', 'mf'].includes(e.g) && !e.adjn), 20, ctx.rnd).map((e) => G.gender(ctx, e)) },
  conj: { icon: '🐎', title: { de: 'Conjugation gym', it: 'Conjugation gym' }, desc: 'Type verb forms in the tenses you choose.', tenses: true,
    build: (ctx, opt) => {
      const verbs = knownEntries(ctx, (e) => e.p === 'v' && e.v?.t && (!opt.irregular || (ctx.E().irregularCells(e, 'pres') || []).some(Boolean)));
      return G.grammarDrills(ctx, { drills: [{ type: 'conj', tenses: opt.tenses, n: 18, verbs: sample(verbs, 30, ctx.rnd).map((v) => v.id) }] }, []);
    } },
  cases: { icon: '🧩', title: { de: 'Case lab', it: 'Prepositions & agreement' }, desc: { de: 'Articles and adjective endings in nominative, accusative, dative, genitive.', it: 'del, nello, sulla… and adjectives that agree.' },
    build: (ctx) => {
      const nouns = knownEntries(ctx, (e) => e.p === 'n' && !e.adjn && e.g !== 'mf');
      const adjs = knownEntries(ctx, (e) => e.p === 'a' && !e.a?.inv);
      const out = [];
      for (let i = 0; i < 18; i++) {
        const n = nouns[Math.floor(ctx.rnd() * nouns.length)], a = adjs[Math.floor(ctx.rnd() * adjs.length)];
        if (ctx.lang === 'de') out.push(i % 3 === 2 ? G.adjEnding(ctx, n, a) : G.caseEnding(ctx, n, { cases: ['nom', 'akk', 'dat', 'gen'], dets: ['def', 'indef', 'mein'] }));
        else out.push(i % 2 ? G.agreementEx(ctx, n, a) : G.artPrepEx(ctx, n));
      }
      return out;
    } },
  parts: { icon: '🔔', title: { de: 'Stammformen chant', it: 'Principal parts' }, desc: { de: 'gehen – ging – ist gegangen: the forms old grammars made pupils chant.', it: 'andare – vado – andai – sono andato.' },
    build: (ctx) => sample(knownEntries(ctx, (e) => e.p === 'v' && e.v?.t), 16, ctx.rnd).map((e) => G.verbForm(ctx, e)) },
  plural: { icon: '👯', title: { de: 'Plurals', it: 'Plurals' }, desc: 'Choose the plural — German plural classes, Italian irregulars.',
    build: (ctx) => sample(knownEntries(ctx, (e) => e.p === 'n' && e.pl && e.pl !== e.l), 16, ctx.rnd).map((e) => G.plural(ctx, e)) },
  listen: { icon: '👂', title: { de: 'Diktat', it: 'Dettato' }, desc: 'Listen and write — the classic school dictation.',
    build: (ctx) => sample(knownEntries(ctx, () => true), 30, ctx.rnd).map((e) => ctx.sentencesFor(e.id, 1)[0]).filter(Boolean).slice(0, 8).map((s) => G.dictation(ctx, s)) },
  speak: { icon: '🎙️', title: { de: 'Speaking studio', it: 'Speaking studio' }, desc: 'Read sentences aloud; speech recognition scores every word.',
    build: (ctx) => sample(knownEntries(ctx, () => true), 30, ctx.rnd).map((e) => ctx.sentencesFor(e.id, 1, 9)[0]).filter(Boolean).slice(0, 10).map((s) => G.speakSentence(ctx, s)) },
  translate: { icon: '✍️', title: { de: 'Translation', it: 'Translation' }, desc: 'Write whole sentences in both directions (Claude can grade free answers).',
    build: (ctx) => sample(knownEntries(ctx, () => true), 30, ctx.rnd).map((e) => ctx.sentencesFor(e.id, 1, 9)[0]).filter(Boolean).slice(0, 8)
      .map((s, i) => G.translateSentence(ctx, s, null, i % 2 === 0)) },
  match: { icon: '🃏', title: { de: 'Match rush', it: 'Match rush' }, desc: 'Four rounds of pairs against the clock.',
    build: (ctx) => [0, 1, 2, 3].map(() => G.matchPairs(ctx, sample(knownEntries(ctx, (e) => e.p !== 'phr'), 5, ctx.rnd))) },
};

export function Practice({ mode = null, run = false }) {
  const L = useCourse();
  const s = useStore();
  const c = store.course(L.lang);
  const E = L.lang === 'de' ? DE : IT;
  const [tenses, setTenses] = useState(['pres']);
  const [irregular, setIrregular] = useState(false);
  if (run && MODES[mode]) {
    const q = new URLSearchParams(location.hash.split('?')[1] || '');
    const opt = { tenses: (q.get('tenses') || 'pres').split(','), irregular: q.get('irr') === '1' };
    const m = MODES[mode];
    return html`<${Lesson} key=${mode + q.get('t')} spec=${{ key: mode + q.get('t'), type: 'custom', title: m.title[L.lang] || m.title, build: (ctx) => m.build(ctx, opt) }}/>`;
  }
  const due = G.dueCards(c, 500).length;
  const mistakes = new Set(c.mistakes.map((m) => m.key)).size;
  const start = (k, extra = '') => go(`/${L.lang}/drill/${k}?t=${Date.now()}${extra}`);
  return html`<div>
    <h1>Practice</h1>
    <div class="grid2">
      <button class="card" style="text-align:left;cursor:pointer" onClick=${() => go(`/${L.lang}/review?t=${Date.now()}`)}>
        <div style="font-size:1.8rem">🔁</div><b>Review</b><div class="small muted">${due} due · refills hearts</div></button>
      <button class="card" style="text-align:left;cursor:pointer" disabled=${!mistakes} onClick=${() => go(`/${L.lang}/review?mode=mistakes&t=${Date.now()}`)}>
        <div style="font-size:1.8rem">🩹</div><b>Fix my mistakes</b><div class="small muted">${mistakes} recent</div></button>
    </div>
    <div class="section-title">Gyms</div>
    <div class="col">${Object.entries(MODES).map(([k, m]) => html`<div class="card row">
      <span style="font-size:1.9rem">${m.icon}</span>
      <div class="grow"><b>${m.title[L.lang] || m.title}</b><div class="small muted">${m.desc[L.lang] || m.desc}</div>
        ${m.tenses && html`<div class="chips" style="margin-top:.5rem">${E.TENSES.filter((t) => t.k !== 'ger').map((t) => html`<button class=${cx('chip', tenses.includes(t.k) && 'on')}
          onClick=${() => setTenses((x) => (x.includes(t.k) ? (x.length > 1 ? x.filter((y) => y !== t.k) : x) : [...x, t.k]))}>${t.name}</button>`)}</div>
          <label class="small row" style="margin-top:.4rem"><input type="checkbox" checked=${irregular} onChange=${(e) => setIrregular(e.target.checked)}/> irregular verbs only</label>`}
      </div>
      <button class="btn small" onClick=${() => start(k, m.tenses ? `&tenses=${tenses.join(',')}&irr=${irregular ? 1 : 0}` : '')}>Go</button>
    </div>`)}</div>
  </div>`;
}
