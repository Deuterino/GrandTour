// The word treasury: every core word, searchable, with full entries, tables and examples.
import { html, useState, useMemo, useCourse, useStore, cx, toast } from '../h.js';
import * as store from '../../core/store.js';
import * as game from '../../core/game.js';
import * as SRS from '../../core/srs.js';
import * as DE from '../../lang/de.js';
import * as IT from '../../lang/it.js';
import { Art, Speak, Mastery, BackBar } from '../components.js';
import { ConjTables, DeclTable, AdjTable, ItAdjTable } from '../tables.js';
import { TappableText } from '../tappable.js';
import { headText, dictLine, posLine, emoji, pluralText } from '../word.js';
import { facetsFor, cardKey, FACETS } from '../../exercises/generate.js';
import { stripDiacritics } from '../../core/text.js';
import { go } from '../router.js';

const FILTERS = [['all', 'All'], ['learned', 'Learned'], ['new', 'Not yet'], ['weak', 'Needs work'], ['n', 'Nouns'], ['v', 'Verbs'], ['a', 'Adjectives'], ['other', 'Other']];

export function Words() {
  const L = useCourse();
  useStore();
  const c = store.course(L.lang);
  const [q, setQ] = useState('');
  const [f, setF] = useState('all');
  const [limit, setLimit] = useState(80);
  const unitOf = useMemo(() => { const m = new Map(); L.course.units.forEach((u) => u.words.forEach((w) => m.set(w, u))); return m; }, [L]);
  const list = useMemo(() => {
    const norm = (s) => stripDiacritics(s.toLowerCase());
    const qq = norm(q.trim());
    let items = L.entries;
    if (qq) items = items.filter((e) => norm(e.l).includes(qq) || norm(e.en).includes(qq) || (e.pl && norm(e.pl).includes(qq)));
    items = items.filter((e) => {
      if (f === 'learned') return !!c.seen[e.id];
      if (f === 'new') return !c.seen[e.id];
      if (f === 'weak') return c.seen[e.id] && game.mastery(c, e.id) <= 2;
      if (['n', 'v', 'a'].includes(f)) return e.p === f;
      if (f === 'other') return !['n', 'v', 'a'].includes(e.p);
      return true;
    });
    if (qq) items = [...items].sort((a, b) => (norm(a.l).startsWith(qq) ? 0 : 1) - (norm(b.l).startsWith(qq) ? 0 : 1) || a.r - b.r);
    else items = [...items].sort((a, b) => (unitOf.get(a.id)?.n || 99) - (unitOf.get(b.id)?.n || 99) || a.r - b.r);
    return items;
  }, [q, f, L, c.seen]);
  const learned = Object.keys(c.seen).length;
  return html`<div>
    <h1>${L.lang === 'de' ? 'Wortschatz' : 'Il tesoro di parole'}</h1>
    <div class="small muted" style="margin-bottom:.7rem">${learned} of ${L.entries.length} words learned · ${game.masteredCount(c)} mastered (★ gold = stable for months)</div>
    <input class="search" type="search" placeholder="Search German/Italian or English…" value=${q} onInput=${(e) => { setQ(e.target.value); setLimit(80); }}/>
    <div class="chips" style="margin:.6rem 0">${FILTERS.map(([k, label]) => html`<button class=${cx('chip', f === k && 'on')} onClick=${() => { setF(k); setLimit(80); }}>${label}</button>`)}</div>
    <div class="card" style="padding:.2rem .8rem"><div class="list">${list.slice(0, limit).map((e) => html`
      <div class="word-row" onClick=${() => go(`/${L.lang}/word/${encodeURIComponent(e.id)}`)}>
        <div class="grow"><div class="w"><${Art} entry=${e} lang=${L.lang}/></div><div class="e">${e.en}</div></div>
        <div style="text-align:right"><${Mastery} stage=${c.seen[e.id] ? game.mastery(c, e.id) : 0}/><div class="tiny muted">${unitOf.get(e.id)?.city || ''}</div></div>
      </div>`)}</div></div>
    ${list.length > limit && html`<button class="btn ghost block" style="margin-top:.8rem" onClick=${() => setLimit(limit + 200)}>Show more (${list.length - limit})</button>`}
    ${!list.length && html`<div class="muted center" style="padding:1rem">No words match.</div>`}
  </div>`;
}

export function WordPage({ id }) {
  const L = useCourse();
  useStore();
  const e = L.get(id);
  const [quiz, setQuiz] = useState(false);
  const [wkOpen, setWkOpen] = useState(false);
  if (!e) return html`<${BackBar} title="Not found"/>`;
  const lang = L.lang;
  const c = store.course(lang);
  const unit = L.course.units.find((u) => u.words.includes(e.id));
  const examples = L.examples(e.id, 6);
  const findNoun = (w, any) => { const l = L.byLemma.get(w) || []; return any ? l[0] : l.find((x) => x.p === 'n'); };
  const hint = e.p === 'n' ? (lang === 'de' ? DE.genderHint(e, findNoun) : IT.genderHint(e)) : null;
  const plRule = e.p === 'n' ? (lang === 'de' ? DE.pluralClass(e) : IT.pluralRule(e)) : '';
  const decl = lang === 'de' && e.p === 'n' ? DE.declensionLabel(e) : '';
  const facets = facetsFor(e, lang);
  const related = L.entries.filter((x) => x.id !== e.id && x.p === e.p && e.l.length >= 4 && (x.l.toLowerCase().includes(e.l.toLowerCase()))).slice(0, 8);
  const learnNow = () => {
    const now = Date.now();
    store.update(() => {
      c.seen[e.id] = c.seen[e.id] || now;
      for (const f of facets) { const k = cardKey(e.id, f); if (!c.cards[k]) c.cards[k] = SRS.review(null, SRS.HARD, now); }
    });
    toast('Added to your reviews');
  };
  return html`<div>
    <${BackBar} title="" right=${html`<${Speak} entry=${e} lang=${lang}/>`}/>
    <div class="entry-head">
      ${emoji(e) && html`<div class="emoji-pic">${emoji(e)}</div>`}
      <div class="lemma"><${Art} entry=${e} lang=${lang}/></div>
      ${e.ipa && html`<div class="muted">${e.ipa}</div>`}
      <div class="small muted" style="margin:.3rem 0">${posLine(e, lang)}</div>
      ${dictLine(e, lang) && html`<div class="parts">${dictLine(e, lang)}</div>`}
    </div>
    <div class="card"><div style="font-size:1.15rem;font-weight:700">${e.en}</div>
      ${e.n && html`<div class="tip">${e.n}</div>`}
      ${e.gov && html`<div class="tip">Takes: <b>${e.gov}</b></div>`}
      ${e.reg && html`<div class="pill" style="margin-top:.4rem">${{ coll: 'colloquial', vulg: 'vulgar', lit: 'literary', form: 'formal', reg: 'regional' }[e.reg] || e.reg}</div>`}
      ${e.wk?.length > 0 && html`<div style="margin-top:.7rem"><button class="linkbtn small" onClick=${() => setWkOpen(!wkOpen)}>${wkOpen ? '▾' : '▸'} Detailed meanings (Wiktionary)</button>
        ${wkOpen && html`<div>${e.wk.map((s, i) => html`<div class="sense"><span class="n">${i + 1}.</span>${s[0]}${s[1] ? html` <span class="tiny muted">(${s[1].join(', ')})</span>` : ''}</div>`)}</div>`}</div>`}
    </div>
    ${hint && html`<div class=${cx('tip', hint.follows === false ? '' : 'rule')}>${hint.text}</div>`}
    ${e.p === 'n' && (plRule || decl) && html`<div class="small muted" style="margin:.3rem 0 .8rem">${plRule && `Plural: ${pluralText(e, lang) || '—'} (${plRule})`}${decl ? ' · ' + decl : ''}</div>`}

    <div class="section-title">Your mastery</div>
    <div class="card tight">${facets.map((f) => {
      const card = c.cards[cardKey(e.id, f)];
      return html`<div class="row between small" style="padding:.25rem 0"><span>${FACETS[f]}</span>
        <span>${card ? html`<${Mastery} stage=${SRS.stage(card)}/> <span class="tiny muted">next ${new Date(card.due).toLocaleDateString()}</span>` : html`<span class="muted">not started</span>`}</span></div>`;
    })}
      ${!c.seen[e.id] && html`<button class="btn small ghost" style="margin-top:.5rem" onClick=${learnNow}>Add to my reviews</button>`}
      ${unit && html`<div class="tiny muted" style="margin-top:.4rem">Taught at stop ${unit.n}: ${unit.city} — ${unit.title}</div>`}
    </div>

    ${e.p === 'n' && lang === 'de' && !e.adjn && html`<div class="section-title">Declension</div><div class="card tight"><${DeclTable} entry=${e}/></div>`}
    ${e.p === 'n' && lang === 'it' && html`<div class="section-title">Articles</div><div class="card tight book" style="font-size:1.1rem">
      ${IT.articleLabel(e)}${pluralText(e, 'it') ? ` → ${pluralText(e, 'it')}` : ''}
      <div class="tiny muted" style="font-family:var(--ui)">${IT.pluralRule(e)}</div></div>`}
    ${e.p === 'a' && lang === 'de' && !e.a?.inv && html`<div class="section-title">Endings</div>
      ${['weak', 'mixed', 'strong'].map((d) => html`<div class="card tight"><div class="small muted" style="margin-bottom:.3rem">${DE.ADJ_DECL_NAMES[d]}</div><${AdjTable} entry=${e} decl=${d} L=${L}/></div>`)}`}
    ${e.p === 'a' && lang === 'it' && html`<div class="section-title">Forms</div><div class="card tight"><${ItAdjTable} entry=${e}/></div>`}
    ${e.p === 'v' && e.v?.t && html`<div class="section-title row between"><span>Conjugation</span>
      <button class=${cx('chip', quiz && 'on')} onClick=${() => setQuiz(!quiz)}>${quiz ? 'Showing quiz' : 'Quiz me'}</button></div>
      <div class="tiny muted" style="margin-bottom:.5rem">Red = irregular (differs from the regular pattern). ${lang === 'de' && e.v.aux === 'h/s' ? 'haben with an object, sein for movement.' : ''}${lang === 'it' ? IT.auxLabel(e) : ''}</div>
      <${ConjTables} entry=${e} lang=${lang} quiz=${quiz} key=${quiz ? 'q' : 'n'}/>`}

    ${examples.length > 0 && html`<div class="section-title">Examples</div>
      ${examples.map((s) => html`<div class="card tight"><div class="row"><div class="grow target" style="font-size:1.15rem">
        <${TappableText} text=${s.t} L=${L} highlight=${new Set([e.id])}/></div><${Speak} text=${s.t} lang=${lang}/></div>
        <div class="small muted">${s.e[0]}</div></div>`)}
      <div class="tiny muted">Sentences from Tatoeba (CC BY 2.0 FR).</div>`}
    ${related.length > 0 && html`<div class="section-title">Related words</div><div class="chips">${related.map((x) => html`<button class="chip" onClick=${() => go(`/${lang}/word/${encodeURIComponent(x.id)}`)}>${headText(x, lang)}</button>`)}</div>`}
  </div>`;
}
