// Builds lessons (lists of exercises) from the course data. Every exercise names the SRS facet it
// trains, so one word is practised through several linked skills: meaning, article/gender, plural,
// verb forms, case endings, sentences, listening and speaking.
import * as DE from '../lang/de.js';
import * as IT from '../lang/it.js';
import * as SRS from '../core/srs.js';
import { shuffle, sample, words as splitWords } from '../core/text.js';
import { headText, targetText, shortEn, enAnswers, pluralText } from '../ui/word.js';

export const FACETS = { m: 'meaning', g: 'article & gender', p: 'plural', f: 'verb forms' };

// Grammar chapter that unlocks each tense in drills (reference tables always show everything).
const TENSE_UNLOCK = {
  de: { pres: 'g-present', imp: 'g-imperative', perf: 'g-perfekt', pret: 'g-praeteritum', fut1: 'g-future',
    wuerde: 'g-konjunktiv2', k2: 'g-konjunktiv2', plup: 'g-plusquamperfekt', pass: 'g-passive', k2past: 'g-konjunktiv2',
    fut2: 'g-future', k1: 'g-konjunktiv1' },
  it: { pres: 'g-present-are', pp: 'g-passato-prossimo', impf: 'g-imperfetto', imp: 'g-imperativo', fut: 'g-futuro',
    cond: 'g-condizionale', trap: 'g-trapassato', cong: 'g-congiuntivo-presente', congi: 'g-congiuntivo-passato',
    congp: 'g-congiuntivo-passato', condp: 'g-condizionale', futa: 'g-futuro', rem: 'g-passato-remoto', ger: 'g-gerundio',
    congt: 'g-congiuntivo-passato' },
};

export function facetsFor(entry, lang) {
  if (entry.p === 'n') {
    const f = ['m', 'g'];
    if (entry.g !== 'pl' && entry.g !== 'mpl' && entry.g !== 'fpl' && entry.pl && !entry.unc) {
      if (lang === 'de' && entry.pl !== entry.l) f.push('p');
      if (lang === 'it' && (entry.inv || entry.plg || IT.pluralRule(entry).startsWith('irregular') || /co$|go$|cia$|gia$/.test(entry.l))) f.push('p');
    }
    return f;
  }
  if (entry.p === 'v' && entry.v?.t) return ['m', 'f'];
  return ['m'];
}

export const cardKey = (id, facet) => `${id}|${facet}`;

// ---------- context helpers ----------

function answersOf(e) {
  if (!e._ans) e._ans = new Set(enAnswers(e).map((a) => a.toLowerCase()));
  return e._ans;
}

export class Ctx {
  constructor(L, course, unitIndex = 0) {
    this.L = L;
    this.lang = L.lang;
    this.c = course;
    this.units = L.course?.units || [];
    this.unitIndex = unitIndex;
    this.unitOf = new Map();
    this.units.forEach((u, i) => u.words.forEach((w) => this.unitOf.set(w, i)));
    this.chapterUnit = new Map();
    this.units.forEach((u, i) => (u.grammar || []).forEach((g) => { if (!this.chapterUnit.has(g)) this.chapterUnit.set(g, i); }));
    this.rnd = Math.random;
  }
  E() { return this.lang === 'de' ? DE : IT; }
  get(id) { return this.L.get(id); }
  tenses() {
    const map = TENSE_UNLOCK[this.lang];
    const out = Object.keys(map).filter((t) => (this.chapterUnit.get(map[t]) ?? 99) <= this.unitIndex);
    return out.length ? out : ['pres'];
  }
  known(id) { return !!this.c.seen[id] || (this.unitOf.get(id) ?? 99) <= this.unitIndex; }
  // Words for distractors: same part of speech, introduced up to a few units ahead, and sharing no
  // English sense with the answer (otherwise "hello" vs "hello, hi" would both be right).
  pool(entry, n = 3, filter = null) {
    const ans = answersOf(entry);
    const ok = (e) => e.id !== entry.id && e.p === entry.p && ![...answersOf(e)].some((a) => ans.has(a));
    const near = this.L.entries.filter((e) => ok(e) && (this.unitOf.get(e.id) ?? 99) <= this.unitIndex + 3 && (!filter || filter(e)));
    const pool = near.length >= n ? near : this.L.entries.filter(ok);
    const out = [];
    const seenEn = new Set([shortEn(entry)]);
    for (const e of shuffle(pool, this.rnd)) {
      if (seenEn.has(shortEn(e))) continue;
      seenEn.add(shortEn(e));
      out.push(e);
      if (out.length >= n) break;
    }
    return out;
  }
  // Example sentences mostly made of words the learner knows.
  sentencesFor(id, n = 3, maxWords = 12) {
    const list = this.L.examples(id, 12).filter((s) => splitWords(s.t, this.lang).length <= maxWords);
    const easy = list.filter((s) => (s.u || 0) - 1 <= this.unitIndex + 1);
    return (easy.length ? easy : list).slice(0, n);
  }
}

// ---------- single exercises ----------

const ex = (kind, props) => ({ kind, scored: true, xp: 10, ...props });

export function intro(ctx, e) {
  return { kind: 'intro', scored: false, word: e.id, words: [e.id], example: ctx.sentencesFor(e.id, 1)[0] || null, tenses: ctx.tenses() };
}

export function meaningRecognition(ctx, e) {
  const opts = shuffle([e, ...ctx.pool(e, 3)], ctx.rnd);
  return ex('mcq', { facet: cardKey(e.id, 'm'), words: [e.id], mode: 'rec', prompt: { word: e.id, audio: true },
    options: opts.map((o) => ({ text: shortEn(o), ok: o.id === e.id })), label: 'What does this mean?' });
}

export function meaningProduction(ctx, e) {
  const opts = shuffle([e, ...ctx.pool(e, 3, e.p === 'n' ? (o) => o.g !== e.g || ctx.rnd() < 0.5 : null)], ctx.rnd);
  return ex('mcq', { facet: cardKey(e.id, 'm'), words: [e.id], mode: 'prod', prompt: { text: e.en.split(';')[0] },
    options: opts.map((o) => ({ text: targetText(o, ctx.lang), entry: o.id, ok: o.id === e.id })), label: `Choose the ${ctx.lang === 'de' ? 'German' : 'Italian'}` });
}

export function listenPick(ctx, e) {
  const opts = shuffle([e, ...ctx.pool(e, 3)], ctx.rnd);
  return ex('mcq', { facet: cardKey(e.id, 'm'), words: [e.id], mode: 'listen', prompt: { audioWord: e.id },
    options: opts.map((o) => ({ text: targetText(o, ctx.lang), entry: o.id, ok: o.id === e.id })), label: 'What do you hear?' });
}

export function typeWord(ctx, e) {
  const accepted = [targetText(e, ctx.lang)];
  if (ctx.lang === 'de' && e.p === 'v' && e.v?.refl) accepted.push(e.l.replace(/^sich /, ''));
  return ex('type', { facet: cardKey(e.id, 'm'), words: [e.id], prompt: { text: e.en.split(';')[0], pos: e.p }, accepted,
    noun: e.p === 'n' ? e.id : null, label: `Write it in ${ctx.lang === 'de' ? 'German' : 'Italian'}${e.p === 'n' ? ' (with the article)' : ''}` });
}

export function typeMeaning(ctx, e) {
  return ex('type', { facet: cardKey(e.id, 'm'), words: [e.id], toEnglish: true, prompt: { word: e.id, audio: true },
    accepted: enAnswers(e), label: 'Write it in English' });
}

const IT_ARTS = ['il', 'lo', "l'", 'la', 'i', 'gli', 'le'];
export function gender(ctx, e) {
  if (ctx.lang === 'de') {
    if (e.g === 'pl' || e.adjn) return null;
    const hint = DE.genderHint(e, (w, any) => { const l = ctx.L.byLemma.get(w) || []; return any ? l[0] : l.find((x) => x.p === 'n'); });
    return ex('gender', { facet: cardKey(e.id, 'g'), words: [e.id], noun: e.l, en: shortEn(e),
      options: ['der', 'die', 'das'].map((a, i) => ({ text: a, ok: ['m', 'f', 'n'][i] === e.g, g: ['m', 'f', 'n'][i] })),
      explain: hint.text, label: 'der, die or das?' });
  }
  if (e.g === 'mf') return null;
  const full = IT.withArticle(e);
  const correct = full.startsWith("l'") ? "l'" : full.split(' ')[0];
  const pl = e.g === 'mpl' || e.g === 'fpl';
  const opts = (pl ? ['i', 'gli', 'le'] : ['il', 'lo', "l'", 'la']).filter((a) => a !== correct);
  const choices = shuffle([correct, ...sample(opts, 2, ctx.rnd)], ctx.rnd);
  return ex('gender', { facet: cardKey(e.id, 'g'), words: [e.id], noun: e.l, en: shortEn(e),
    options: choices.map((a) => ({ text: a, ok: a === correct, g: ['il', 'lo', 'i', 'gli'].includes(a) ? 'm' : a === "l'" ? (e.g === 'f' ? 'f' : 'm') : 'f' })),
    explain: `${IT.genderHint(e).text} ${IT.articleInfo(correct)}.`, label: 'Which article?' });
}

export function plural(ctx, e) {
  if (!e.pl || e.pl === e.l && ctx.lang === 'de') return null;
  if (ctx.lang === 'de') {
    const fake = new Set();
    const stem = e.l;
    const uml = (s) => s.replace(/(au|a|o|u)(?=[^aou]*$)/, (m) => ({ au: 'äu', a: 'ä', o: 'ö', u: 'ü' }[m]));
    for (const cand of [stem + 'e', stem + 'en', stem + 'n', stem + 'er', stem + 's', uml(stem) + 'e', uml(stem) + 'er', stem]) {
      if (cand !== e.pl) fake.add(cand);
    }
    const opts = shuffle([e.pl, ...sample([...fake], 3, ctx.rnd)], ctx.rnd);
    return ex('mcq', { facet: cardKey(e.id, 'p'), words: [e.id], mode: 'plural', prompt: { word: e.id, text: `${headText(e, 'de')} → die …` },
      options: opts.map((o) => ({ text: `die ${o}`, ok: o === e.pl })), explain: `Plural class: ${DE.pluralClass(e)}`, label: 'Choose the plural' });
  }
  const correct = pluralText(e, 'it');
  const s = e.l;
  const wrong = new Set([s.replace(/o$/, 'i'), s.replace(/a$/, 'e'), s.replace(/e$/, 'i'), s, s.replace(/co$/, 'chi'), s.replace(/co$/, 'ci'),
    s.replace(/a$/, 'i'), s.replace(/io$/, 'ii')].map((x) => IT.withArticle({ ...e, pl: x, inv: 0 }, 'pl')).filter((x) => x !== correct));
  const opts = shuffle([correct, ...sample([...wrong], 3, ctx.rnd)], ctx.rnd);
  return ex('mcq', { facet: cardKey(e.id, 'p'), words: [e.id], mode: 'plural', prompt: { word: e.id, text: `${headText(e, 'it')} → …` },
    options: opts.map((o) => ({ text: o, ok: o === correct })), explain: IT.pluralRule(e), label: 'Choose the plural' });
}

// Verb forms: German principal parts / stem changes; Italian present & participle.
export function verbForm(ctx, e) {
  const v = e.v;
  if (!v?.t) return null;
  const E = ctx.E();
  const tenses = ctx.tenses().filter((t) => ['pres', 'perf', 'pp', 'pret', 'impf', 'fut', 'fut1', 'rem'].includes(t));
  const irregularFirst = (t) => (E.irregularCells(e, t) || []).map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
  const tense = tenses[Math.floor(ctx.rnd() * tenses.length)] || 'pres';
  const persons = irregularFirst(tense);
  const p = persons.length && ctx.rnd() < 0.7 ? persons[Math.floor(ctx.rnd() * persons.length)] : Math.floor(ctx.rnd() * 6);
  const answer = E.conjugate(e, tense, p);
  if (!answer) return null;
  const others = [...new Set([0, 1, 2, 3, 4, 5].map((q) => E.conjugate(e, tense, q)).filter((f) => f && f !== answer))];
  const tname = E.TENSES.find((t) => t.k === tense);
  const who = E.PERSONS[p];
  const fakes = ctx.lang === 'de' ? deFakes(e, tense, p, answer) : itFakes(e, tense, p, answer);
  const opts = shuffle([answer, ...sample([...new Set([...fakes, ...others])].filter((x) => x !== answer), 3, ctx.rnd)], ctx.rnd);
  return ex('conj', { facet: cardKey(e.id, 'f'), words: [e.id], verb: e.id, tense, person: p,
    prompt: { who, tense: tname?.name, en: tname?.en }, options: opts.map((o) => ({ text: o, ok: o === answer })), answer,
    explain: E.principalParts(e)?.text, strict: true, label: 'Choose the right form' });
}

function deFakes(e, tense, p, answer) {
  const { base, sep } = DE.splitSep(e);
  const stem = base.replace(/e?n$/, '');
  const tail = sep ? ' ' + sep : '';
  const out = [];
  if (tense === 'pres') out.push(stem + ['e', 'st', 't', 'en', 't', 'en'][p] + tail);
  if (tense === 'pret') out.push(stem + ['te', 'test', 'te', 'ten', 'tet', 'ten'][p] + tail);
  if (tense === 'perf') {
    const aux = (e.v.aux || 'h') === 's' ? ['habe', 'hast', 'hat', 'haben', 'habt', 'haben'] : ['bin', 'bist', 'ist', 'sind', 'seid', 'sind'];
    out.push(`${aux[p]} ${e.v.pp}`);
    out.push(answer.replace(e.v.pp, `${sep || ''}ge${stem}t`));
  }
  return out;
}

function itFakes(e, tense, p, answer) {
  const out = [];
  const cls = IT.conjClass(e);
  const stem = e.l.replace(/(are|ere|ire|rsi)$/, '');
  if (tense === 'pres' && cls) out.push(stem + { are: ['o', 'i', 'a', 'iamo', 'ate', 'ano'], ere: ['o', 'i', 'e', 'iamo', 'ete', 'ono'], ire: ['o', 'i', 'e', 'iamo', 'ite', 'ono'] }[cls][p]);
  if (tense === 'pp') {
    out.push(answer.includes('sono') || answer.includes('siamo') ? answer.replace(/^(\S+ )?(sono|sei|è|siamo|siete) /, (m) => m.replace(/sono|sei|è|siamo|siete/, (x) => ({ sono: 'ho', sei: 'hai', è: 'ha', siamo: 'abbiamo', siete: 'avete' }[x])))
      : answer.replace(/^(ho|hai|ha|abbiamo|avete|hanno)/, (x) => ({ ho: 'sono', hai: 'sei', ha: 'è', abbiamo: 'siamo', avete: 'siete', hanno: 'sono' }[x])));
    if (cls) out.push(answer.replace(e.v.pp, stem + { are: 'ato', ere: 'uto', ire: 'ito' }[cls]));
  }
  return out.filter((x) => x && x !== answer);
}

// German case endings / Italian articulated prepositions in a frame sentence.
const DE_FRAMES = {
  nom: [['___ ist hier.', 'is here'], ['Wo ist ___?', 'Where is …?'], ['Das ist ___.', 'That is …']],
  akk: [['Ich sehe ___.', 'I see …'], ['Wir brauchen ___.', 'We need …'], ['Das ist für ___.', 'That is for …'], ['Hast du ___?', 'Do you have …?']],
  dat: [['Ich spreche mit ___.', 'I am talking with …'], ['Wir helfen ___.', 'We help …'], ['Das Geschenk ist von ___.', 'The present is from …'], ['Er wohnt bei ___.', 'He lives with …']],
  gen: [['Das ist das Haus ___.', 'That is the house of …'], ['wegen ___', 'because of …']],
};
export function caseEnding(ctx, noun, { cases = ['akk', 'dat'], dets = ['def', 'indef'], adj = null } = {}) {
  if (ctx.lang !== 'de' || noun.p !== 'n' || noun.adjn) return null;
  const c = cases[Math.floor(ctx.rnd() * cases.length)];
  let det = dets[Math.floor(ctx.rnd() * dets.length)];
  const number = noun.g === 'pl' ? 'pl' : 'sg';
  if (number === 'pl' && det === 'indef') det = 'kein';
  const [frame, en] = DE_FRAMES[c][Math.floor(ctx.rnd() * DE_FRAMES[c].length)];
  const np = DE.nounPhrase(noun, { c, number, det, adj });
  const [art, ...rest] = np.text.split(' ');
  if (!np.art) return null;
  const others = DE.GENDERS.map((g) => DE.CASES.map((cc) => det === 'def' ? DE.DEF[g][DE.CASES.indexOf(cc)] : DE.einWord(det === 'indef' ? 'ein' : det, g, cc)))
    .flat().filter((x) => x && x !== art);
  const opts = shuffle([art, ...sample([...new Set(others)], 3, ctx.rnd)], ctx.rnd);
  const gname = DE.GENDER_NAMES[noun.g === 'pl' ? 'pl' : noun.g];
  return ex('cloze', { facet: cardKey(noun.id, 'g'), words: [noun.id], stat: 'cases', strict: true,
    prompt: { text: frame.replace('___', `___ ${rest.join(' ')}`), en, hint: `${DE.CASE_NAMES[c]}, ${gname}` },
    options: opts.map((o) => ({ text: o, ok: o === art })),
    explain: `${DE.CASE_NAMES[c][0].toUpperCase() + DE.CASE_NAMES[c].slice(1)} ${gname}: ${np.text}.`, label: 'Fill in the article' });
}

export function adjEnding(ctx, noun, adjE, { cases = ['nom', 'akk', 'dat'], dets = ['def', 'indef', 'none'] } = {}) {
  if (ctx.lang !== 'de' || !noun || !adjE || noun.adjn || adjE.a?.inv) return null;
  const c = cases[Math.floor(ctx.rnd() * cases.length)];
  const det = dets[Math.floor(ctx.rnd() * dets.length)];
  const number = noun.g === 'pl' ? 'pl' : 'sg';
  const np = DE.nounPhrase(noun, { c, number, det: number === 'pl' && det === 'indef' ? 'none' : det, adj: adjE });
  const parts = np.text.split(' ');
  const i = np.art ? 1 : 0;
  const stem = DE.adjStem(adjE);
  const end = parts[i].slice(stem.length);
  const opts = ['e', 'en', 'er', 'es', 'em'];
  const [frame, en] = DE_FRAMES[c][0];
  const shown = [...parts];
  shown[i] = `${stem}___`;
  return ex('cloze', { facet: cardKey(adjE.id, 'm'), words: [noun.id, adjE.id], stat: 'cases', strict: true,
    prompt: { text: frame.replace('___', shown.join(' ')), en, hint: `${DE.CASE_NAMES[c]} · ${np.decl} declension` },
    options: opts.map((o) => ({ text: '-' + o, ok: o === end })), explain: `${np.text} — ${DE.ADJ_DECL_NAMES[np.decl]}.`, label: 'Choose the ending' });
}

const IT_PREP_FRAMES = [
  ['di', 'Il libro ___ {n}.', "…'s book (of the …)"], ['a', 'Penso ___ {n}.', 'I am thinking about the …'],
  ['da', 'Vengo ___ {n}.', 'I am coming from the …'], ['in', "C'è qualcosa ___ {n}.", 'There is something in the …'], ['su', 'È ___ {n}.', 'It is on the …'],
];
export function artPrepEx(ctx, noun) {
  if (ctx.lang !== 'it' || noun.p !== 'n' || noun.g === 'mf') return null;
  const [prep, frame, en] = IT_PREP_FRAMES[Math.floor(ctx.rnd() * IT_PREP_FRAMES.length)];
  const plural = ctx.rnd() < 0.3 && noun.pl;
  const word = plural ? noun.pl : noun.l;
  const g = noun.g.startsWith('m') ? 'm' : 'f';
  const art = IT.defArticle(word, plural ? (noun.plg || g) : g, plural ? 'pl' : 'sg');
  const answer = IT.artPrep(prep, art);
  const others = ['il', 'lo', "l'", 'la', 'i', 'gli', 'le'].map((a) => IT.artPrep(prep, a)).filter((x) => x !== answer);
  const opts = shuffle([answer, ...sample(others, 3, ctx.rnd)], ctx.rnd);
  const tail = answer.endsWith("'") ? `___${word}` : `___ ${word}`;
  return ex('cloze', { facet: cardKey(noun.id, 'g'), words: [noun.id], stat: 'cases', strict: true,
    prompt: { text: frame.replace('___ {n}', tail), en: en.replace('…', shortEn(noun)), hint: `${prep} + ${art}` },
    options: opts.map((o) => ({ text: o, ok: o === answer })), explain: `${prep} + ${art} = ${answer} (${IT.articleInfo(art)}).`, label: 'Join preposition and article' });
}

export function agreementEx(ctx, noun, adjE) {
  if (ctx.lang !== 'it' || !noun || !adjE || noun.g === 'mf') return null;
  const plural = ctx.rnd() < 0.45 && noun.pl;
  const g = noun.g.startsWith('m') ? 'm' : 'f';
  const pg = plural ? (noun.plg || g) : g;
  const form = IT.agree(adjE, pg, plural ? 'pl' : 'sg');
  const f = IT.adjForms(adjE);
  const opts = shuffle([...new Set([f.ms, f.fs, f.mp, f.fp])], ctx.rnd);
  if (opts.length < 2) return null;
  const subj = IT.withArticle(noun, plural ? 'pl' : 'sg');
  const verb = plural ? 'sono' : 'è';
  return ex('cloze', { facet: cardKey(adjE.id, 'm'), words: [noun.id, adjE.id], stat: 'cases', strict: true,
    prompt: { text: `${subj[0].toUpperCase() + subj.slice(1)} ${verb} ___.`, en: `The ${shortEn(noun)} ${plural ? 'are' : 'is'} ${shortEn(adjE)}.`, hint: `${pg === 'm' ? 'masculine' : 'feminine'} ${plural ? 'plural' : 'singular'}` },
    options: opts.map((o) => ({ text: o, ok: o === form })), explain: `The adjective agrees with ${subj}: ${form}.`, label: 'Make the adjective agree' });
}

// Sentence with the target word blanked out.
export function clozeSentence(ctx, e, s) {
  const toks = s.t.split(/(\s+)/);
  const forms = ctx.L.formsOf(e.id);
  const idx = toks.findIndex((t) => forms.has(t.replace(/[.,!?;:«»„“"]/g, '')) || forms.has(t.replace(/[.,!?;:«»„“"]/g, '').toLowerCase()));
  if (idx < 0) return null;
  const raw = toks[idx];
  const word = raw.replace(/[.,!?;:«»„“"]/g, '');
  const others = ctx.pool(e, 3).map((o) => o.l);
  const opts = shuffle([word, ...others], ctx.rnd);
  const shown = [...toks];
  shown[idx] = raw.replace(word, '___');
  return ex('cloze', { facet: cardKey(e.id, 'm'), words: [e.id], sentence: s.id,
    prompt: { text: shown.join(''), en: s.e[0] }, options: opts.map((o) => ({ text: o, ok: o === word })), label: 'Complete the sentence' });
}

export function tilesSentence(ctx, s, facetWord = null) {
  const ws = splitWords(s.t, ctx.lang);
  if (ws.length < 3 || ws.length > 10) return null;
  const distract = sample(ctx.L.entries.filter((e) => ctx.known(e.id) && e.p !== 'phr' && !ws.includes(e.l)), 3, ctx.rnd).map((e) => e.l);
  return ex('tiles', { facet: facetWord ? cardKey(facetWord, 'm') : null, words: s.w || [], sentence: s.id,
    prompt: { en: s.e[0] }, tiles: shuffle([...ws, ...distract], ctx.rnd), answer: ws, accepted: [s.t, ...(s.alt || [])], label: 'Build the sentence' });
}

export function translateSentence(ctx, s, facetWord = null, toEnglish = false) {
  return ex('type', { facet: facetWord ? cardKey(facetWord, 'm') : null, words: s.w || [], sentence: s.id, long: true,
    toEnglish, prompt: toEnglish ? { sentenceText: s.t, audio: true } : { text: s.e[0] },
    accepted: toEnglish ? s.e : [s.t, ...(s.alt || [])], label: toEnglish ? 'Translate into English' : `Translate into ${ctx.lang === 'de' ? 'German' : 'Italian'}` });
}

export function dictation(ctx, s, facetWord = null) {
  return ex('type', { facet: facetWord ? cardKey(facetWord, 'm') : null, words: s.w || [], sentence: s.id, long: true, stat: 'listened',
    prompt: { audioText: s.t }, accepted: [s.t], label: 'Diktat — write what you hear' });
}

export function speakSentence(ctx, s) {
  return ex('speak', { words: s.w || [], sentence: s.id, prompt: { text: s.t, en: s.e[0] }, stat: 'spoken', label: 'Read aloud' });
}

export function speakWord(ctx, e) {
  return ex('speak', { words: [e.id], prompt: { text: targetText(e, ctx.lang), en: shortEn(e), entry: e.id }, stat: 'spoken', label: 'Say it' });
}

export function matchPairs(ctx, list) {
  const pairs = list.slice(0, 5).map((e) => ({ id: e.id, a: targetText(e, ctx.lang), b: shortEn(e) }));
  if (pairs.length < 3) return null;
  return { kind: 'match', scored: true, xp: 10, words: pairs.map((p) => p.id), pairs, label: 'Match the pairs' };
}

// ---------- lessons ----------

export function learnLesson(ctx, ids, { speaking = true, listening = true } = {}) {
  const entries = ids.map((id) => ctx.get(id)).filter(Boolean);
  const out = [];
  // introduce two at a time, check each right away
  for (let i = 0; i < entries.length; i += 2) {
    const pair = entries.slice(i, i + 2);
    for (const e of pair) out.push(intro(ctx, e));
    for (const e of pair) out.push(meaningRecognition(ctx, e));
  }
  const phase2 = [];
  for (const e of entries) {
    phase2.push(e.p === 'phr' || e.p === 'intj' || ctx.rnd() < 0.5 ? meaningProduction(ctx, e) : typeWord(ctx, e));
    if (e.p === 'n') { phase2.push(gender(ctx, e)); if (ctx.rnd() < 0.5) phase2.push(plural(ctx, e)); }
    if (e.p === 'v') phase2.push(verbForm(ctx, e));
    if (listening && ctx.rnd() < 0.35) phase2.push(listenPick(ctx, e));
  }
  out.push(...shuffle(phase2.filter(Boolean), ctx.rnd));
  out.push(matchPairs(ctx, shuffle(entries, ctx.rnd)));
  const sents = [];
  for (const e of shuffle(entries, ctx.rnd)) {
    const s = ctx.sentencesFor(e.id, 2)[0];
    if (s && !sents.some((x) => x.s.id === s.id)) sents.push({ s, e });
    if (sents.length >= 3) break;
  }
  sents.forEach(({ s, e }, i) => {
    if (i === 0) out.push(clozeSentence(ctx, e, s) || tilesSentence(ctx, s, e.id));
    else if (i === 1) out.push(tilesSentence(ctx, s, e.id));
    else if (speaking) out.push(speakSentence(ctx, s));
  });
  for (const e of entries) if (e.p === 'n' || e.p === 'v' || e.p === 'a') out.push(typeWord(ctx, e));
  return out.filter(Boolean);
}

// Exercises for one due card (reviews, practice).
export function forCard(ctx, key) {
  const [id, facet] = key.split('|');
  const e = ctx.get(id);
  if (!e) return null;
  if (facet === 'g') return ctx.lang === 'de' && ctx.rnd() < 0.4 ? caseEnding(ctx, e, { cases: ['nom', 'akk', 'dat'] }) || gender(ctx, e) : gender(ctx, e);
  if (facet === 'p') return plural(ctx, e);
  if (facet === 'f') return verbForm(ctx, e);
  const r = ctx.rnd();
  const s = ctx.sentencesFor(id, 2)[0];
  if (s && r < 0.2) return clozeSentence(ctx, e, s) || meaningRecognition(ctx, e);
  if (r < 0.45) return meaningRecognition(ctx, e);
  if (r < 0.65) return meaningProduction(ctx, e);
  if (r < 0.8) return typeWord(ctx, e);
  if (r < 0.9) return listenPick(ctx, e);
  return typeMeaning(ctx, e);
}

export function reviewLesson(ctx, keys) {
  return keys.map((k) => forCard(ctx, k)).filter(Boolean);
}

export function practiceLesson(ctx, ids, n = 16) {
  const keys = ids.flatMap((id) => { const e = ctx.get(id); return e ? facetsFor(e, ctx.lang).map((f) => cardKey(id, f)) : []; });
  const pick = sample(keys, n, ctx.rnd);
  const out = reviewLesson(ctx, pick);
  const words = sample(ids.map((i) => ctx.get(i)).filter(Boolean), 5, ctx.rnd);
  out.splice(Math.min(out.length, 6), 0, matchPairs(ctx, words));
  const s = ctx.sentencesFor(sample(ids, 1, ctx.rnd)[0], 2);
  if (s[0]) out.push(dictation(ctx, s[0]));
  if (s[1]) out.push(translateSentence(ctx, s[1]));
  return out.filter(Boolean);
}

// Words the learner has introduced and that are due, most-forgotten first.
export function dueCards(c, limit = 20, now = Date.now()) {
  return SRS.dueKeys(c.cards, now, limit);
}

// Grammar drills generated from a chapter's drill specs.
export function grammarDrills(ctx, chapter, unitWords) {
  const out = [];
  const nouns = unitWords.map((i) => ctx.get(i)).filter((e) => e?.p === 'n');
  const knownNouns = ctx.L.entries.filter((e) => e.p === 'n' && !e.adjn && ctx.known(e.id) && e.d);
  const verbs = ctx.L.entries.filter((e) => e.p === 'v' && e.v?.t && ctx.known(e.id));
  const adjs = ctx.L.entries.filter((e) => e.p === 'a' && ctx.known(e.id) && !e.a?.inv);
  const unitVerbs = unitWords.map((i) => ctx.get(i)).filter((e) => e?.p === 'v' && e.v?.t);
  for (const d of chapter.drills || []) {
    const n = d.n || 4;
    for (let k = 0; k < n; k++) {
      let x = null;
      if (d.type === 'conj') {
        const vlist = (d.verbs ? d.verbs.map((v) => ctx.L.get(v) || ctx.L.lemma(v, 'v')).filter(Boolean) : null) || (unitVerbs.length ? unitVerbs : verbs);
        const e = vlist[Math.floor(ctx.rnd() * vlist.length)];
        if (e) x = conjDrill(ctx, e, d.tenses || ['pres']);
      } else if (d.type === 'case') {
        const pool = nouns.length && ctx.rnd() < 0.6 ? nouns : knownNouns;
        const e = pool[Math.floor(ctx.rnd() * pool.length)];
        if (e) x = caseEnding(ctx, e, { cases: d.cases, dets: d.dets || ['def', 'indef'] });
      } else if (d.type === 'adj') {
        const e = knownNouns[Math.floor(ctx.rnd() * knownNouns.length)];
        const a = adjs[Math.floor(ctx.rnd() * adjs.length)];
        x = ctx.lang === 'de' ? adjEnding(ctx, e, a, { cases: d.cases, dets: d.dets }) : agreementEx(ctx, ctx.L.entries.filter((q) => q.p === 'n' && ctx.known(q.id))[Math.floor(ctx.rnd() * 200)], a);
      } else if (d.type === 'gender') {
        const pool = nouns.length ? nouns : knownNouns;
        const e = pool[Math.floor(ctx.rnd() * pool.length)];
        if (e) x = gender(ctx, e);
      } else if (d.type === 'plural') {
        const pool = (nouns.length ? nouns : knownNouns).filter((e) => e.pl && e.pl !== e.l);
        const e = pool[Math.floor(ctx.rnd() * pool.length)];
        if (e) x = plural(ctx, e);
      } else if (d.type === 'artprep') {
        const pool = ctx.L.entries.filter((e) => e.p === 'n' && ctx.known(e.id) && e.g !== 'mf');
        const e = pool[Math.floor(ctx.rnd() * pool.length)];
        if (e) x = artPrepEx(ctx, e);
      } else if (d.type === 'choice' && d.items?.length) {
        const it = d.items[(k + Math.floor(ctx.rnd() * d.items.length)) % d.items.length];
        x = ex('cloze', { prompt: { text: it.q, en: it.en, hint: it.hint }, options: shuffle(it.o.map((o, i) => ({ text: o, ok: i === 0 })), ctx.rnd),
          explain: it.why, strict: true, label: d.label || 'Choose' });
      } else if (d.type === 'order' && d.items?.length) {
        const it = d.items[(k + Math.floor(ctx.rnd() * d.items.length)) % d.items.length];
        const ws = it.t.split(' ');
        x = ex('tiles', { prompt: { en: it.en }, tiles: shuffle([...ws, ...(it.extra || [])], ctx.rnd), answer: ws, accepted: [it.t, ...(it.alt || [])],
          explain: it.why, label: d.label || 'Put the words in order' });
      }
      if (x) out.push(x);
    }
  }
  return out;
}

function conjDrill(ctx, e, tenses) {
  const E = ctx.E();
  const tense = tenses[Math.floor(ctx.rnd() * tenses.length)];
  const p = Math.floor(ctx.rnd() * 6);
  const answer = E.conjugate(e, tense, p);
  if (!answer) return null;
  const tname = E.TENSES.find((t) => t.k === tense);
  const accepted = answer.split(' / ');
  return ex('type', { facet: cardKey(e.id, 'f'), words: [e.id], strict: true, stat: 'conj',
    prompt: { conj: { verb: e.l, who: E.PERSONS[p], tense: tname?.name, en: tname?.en } }, accepted, label: 'Conjugate' });
}
