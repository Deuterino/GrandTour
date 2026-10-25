// Course data: loading, lookup maps and the inflected-form index used by the reader and exercises.
import * as DE from '../lang/de.js';
import * as IT from '../lang/it.js';

const loaded = {};

async function getJSON(path, optional = false) {
  try {
    const res = await fetch(new URL(`../../data/${path}`, import.meta.url));
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return await res.json();
  } catch (e) {
    if (optional) return null;
    throw e;
  }
}

export async function loadCourse(lang) {
  if (loaded[lang]) return loaded[lang];
  const [lex, course, grammar, sentences, texts] = await Promise.all([
    getJSON(`${lang}/lexicon.json`),
    getJSON(`${lang}/course.json`, true),
    getJSON(`${lang}/grammar.json`, true),
    getJSON(`${lang}/sentences.json`, true),
    getJSON(`${lang}/texts.json`, true),
  ]);
  const data = new LangData(lang, lex, { course, grammar, sentences, texts });
  loaded[lang] = data;
  return data;
}

export function engineFor(lang) { return lang === 'de' ? DE : IT; }

export class LangData {
  constructor(lang, lex, extra = {}) {
    this.lang = lang;
    this.entries = lex.entries;
    this.byId = new Map(this.entries.map((e) => [e.id, e]));
    this.byLemma = new Map();
    for (const e of this.entries) {
      const k = e.l.toLowerCase();
      if (!this.byLemma.has(k)) this.byLemma.set(k, []);
      this.byLemma.get(k).push(e);
    }
    this.engine = engineFor(lang);
    this.engine.setResolver((id) => this.byId.get(id));
    this.course = extra.course;
    this.grammar = extra.grammar;
    this.texts = extra.texts;
    this.sentences = extra.sentences?.items || [];
    this.sentById = new Map(this.sentences.map((s) => [s.id, s]));
    this.sentsByWord = new Map();
    for (const s of this.sentences) for (const w of s.w || []) {
      if (!this.sentsByWord.has(w)) this.sentsByWord.set(w, []);
      this.sentsByWord.get(w).push(s);
    }
    this._forms = null;
    this.ext = null; // extended dictionary (loaded on demand for books)
  }

  get(id) { return this.byId.get(id); }

  lemma(l, pos) {
    const list = this.byLemma.get(l.toLowerCase()) || [];
    return pos ? list.find((e) => e.p === pos) : list[0];
  }

  forms() {
    if (!this._forms) this._forms = this.lang === 'de' ? buildFormsDE(this) : buildFormsIT(this);
    return this._forms;
  }

  // Every inflected form of one entry (for blanking a word out of a sentence).
  formsOf(id) {
    if (!this._formsOf) {
      this._formsOf = new Map();
      for (const [form, list] of this.forms()) for (const a of list) {
        if (!this._formsOf.has(a.id)) this._formsOf.set(a.id, new Set());
        this._formsOf.get(a.id).add(form);
      }
    }
    return this._formsOf.get(id) || new Set();
  }

  // All analyses of an exact token (case-sensitive first, then lowercase).
  lookupForm(token) {
    const f = this.forms();
    const exact = f.get(token) || [];
    const lower = token.toLowerCase() !== token ? f.get(token.toLowerCase()) || [] : [];
    const capital = f.get(token[0].toUpperCase() + token.slice(1)) || [];
    const seen = new Set();
    const out = [];
    for (const a of [...exact, ...lower, ...capital]) {
      const k = a.id + '|' + a.tag;
      if (!seen.has(k)) { seen.add(k); out.push(a); }
    }
    return out;
  }

  async loadExtended() {
    if (this.ext) return this.ext;
    const ext = await getJSON(`${this.lang}/dict-ext.json`, true);
    this.ext = ext ? new ExtDict(ext) : new ExtDict({ entries: [], forms: {} });
    return this.ext;
  }

  examples(id, n = 5) { return (this.sentsByWord.get(id) || []).slice(0, n); }

  // German separable verbs: prefix -> finite verb word -> [entries] (rufe -> anrufen under 'an')
  sepIndex() {
    if (this._sep) return this._sep;
    const idx = new Map();
    for (const e of this.entries) {
      const sep = e.v?.sep;
      if (!sep) continue;
      if (!idx.has(sep)) idx.set(sep, new Map());
      const m = idx.get(sep);
      for (const k of ['pres', 'pret', 'k2', 'imp']) for (const f of e.v.t?.[k] || []) {
        if (!f || f === '-') continue;
        const w = f.split(' ')[0];
        if (!m.has(w)) m.set(w, []);
        if (!m.get(w).includes(e)) m.get(w).push(e);
      }
    }
    this._sep = idx;
    return idx;
  }
}

// Extended reader dictionary: lemma glosses plus a form → lemma map for words outside the core 3000.
class ExtDict {
  constructor(raw) {
    this.entries = raw.entries || [];
    this.byLemma = new Map();
    this.entries.forEach((e, i) => {
      e.i = i;
      const k = e.l.toLowerCase();
      if (!this.byLemma.has(k)) this.byLemma.set(k, []);
      this.byLemma.get(k).push(e);
    });
    this.forms = raw.forms || {};
  }
  lookup(token) {
    const out = [];
    for (const t of new Set([token, token.toLowerCase()])) {
      for (const e of this.byLemma.get(t.toLowerCase()) || []) if (e.l === t || e.l.toLowerCase() === t) out.push({ e, tag: 'lemma' });
      for (const [idx, tag] of this.forms[t] || []) out.push({ e: this.entries[idx], tag });
    }
    return out;
  }
}

function add(map, form, id, tag) {
  if (!form || form === '-') return;
  let list = map.get(form);
  if (!list) { list = []; map.set(form, list); }
  if (!list.some((x) => x.id === id && x.tag === tag)) list.push({ id, tag });
}

// ---------- German forms ----------

const ADJ_ENDINGS = ['e', 'er', 'es', 'en', 'em'];

function buildFormsDE(L) {
  const m = new Map();
  for (const e of L.entries) {
    const id = e.id;
    if (e.p === 'n') {
      if (e.adjn) {
        const stem = e.stem || e.l.replace(/e$/, '');
        for (const end of ADJ_ENDINGS) add(m, stem + end, id, 'N:adjn');
        continue;
      }
      add(m, e.l, id, e.g === 'pl' ? 'N:pl' : 'N:nom.sg');
      if (e.d) {
        DE.CASES.forEach((c, i) => {
          add(m, e.d.sg?.[i], id, `N:${c}.sg`);
          add(m, e.d.pl?.[i], id, `N:${c}.pl`);
        });
      } else if (e.pl) add(m, e.pl, id, 'N:pl');
      if (e.gen) add(m, e.gen, id, 'N:gen.sg');
      for (const [k, f] of Object.entries(e.alt || {})) add(m, f, id, `N:${DE.CASES[+k.slice(2)]}.${k.slice(0, 2)}`);
      if (e.fem) { // die Lehrerin, die Lehrerinnen
        add(m, e.fem, id, 'N:fem');
        add(m, e.fem + (e.fem.endsWith('in') ? 'nen' : 'n'), id, 'N:fem.pl');
      }
    } else if (e.p === 'v' && e.v) {
      const inf = DE.infinitive(e);
      add(m, inf, id, 'V:inf');
      const t = e.v.t || {};
      const sep = e.v.sep;
      for (const tense of ['pres', 'pret', 'k1', 'k2']) {
        (t[tense] || []).forEach((f, p) => {
          if (!f || f === '-') return;
          const word = f.split(' ')[0];
          add(m, word, id, sep ? `V:${tense}.${p}.sep` : `V:${tense}.${p}`);
          if (sep) add(m, sep + word, id, `V:${tense}.${p}.sub`);
        });
      }
      (t.imp || []).forEach((f, i) => { if (f && f !== '-') add(m, f.split(' ')[0], id, sep ? `V:imp.${i}.sep` : `V:imp.${i}`); });
      add(m, e.v.pp, id, 'V:pp');
      add(m, e.v.p1, id, 'V:p1');
      add(m, e.v.zu, id, 'V:zu');
      if (e.v.pp) for (const end of ADJ_ENDINGS) add(m, e.v.pp + end, id, 'V:pp.adj');
    } else if (e.p === 'a') {
      add(m, e.l, id, 'A:pos');
      if (e.a?.inv) continue;
      const stem = DE.adjStem(e);
      for (const end of ADJ_ENDINGS) add(m, stem.endsWith('e') ? stem + end.slice(1) : stem + end, id, 'A:pos.decl');
      if (e.a?.cmp) {
        add(m, e.a.cmp, id, 'A:cmp');
        for (const end of ADJ_ENDINGS) add(m, e.a.cmp + end, id, 'A:cmp.decl');
      }
      if (e.a?.sup) {
        const s = e.a.sup.replace(/^am /, '').replace(/en$/, '');
        for (const end of ADJ_ENDINGS) add(m, s + end, id, 'A:sup');
      }
    } else if (e.p === 'name') {
      add(m, e.l, id, 'X');
      add(m, e.l + 's', id, 'N:gen.sg');
    } else {
      add(m, e.l, id, 'X');
    }
  }
  addFunctionWordsDE(L, m);
  return m;
}

const DE_PRON = {
  ich: [['ich', 'nom'], ['mich', 'akk'], ['mir', 'dat'], ['meiner', 'gen']],
  du: [['du', 'nom'], ['dich', 'akk'], ['dir', 'dat'], ['deiner', 'gen']],
  er: [['er', 'nom'], ['ihn', 'akk'], ['ihm', 'dat'], ['seiner', 'gen']],
  es: [['es', 'nom/akk'], ['ihm', 'dat']],
  sie: [['sie', 'nom/akk'], ['ihr', 'dat (she)'], ['ihnen', 'dat (they)'], ['ihrer', 'gen']],
  wir: [['wir', 'nom'], ['uns', 'akk/dat'], ['unser', 'gen']],
  ihr: [['ihr', 'nom'], ['euch', 'akk/dat'], ['euer', 'gen']],
  Sie: [['Sie', 'nom/akk'], ['Ihnen', 'dat'], ['Ihrer', 'gen']],
  wer: [['wer', 'nom'], ['wen', 'akk'], ['wem', 'dat'], ['wessen', 'gen']],
};
const DE_CONTRACT = { am: ['an', 'dem'], im: ['in', 'dem'], ins: ['in', 'das'], ans: ['an', 'das'], zum: ['zu', 'dem'],
  zur: ['zu', 'der'], vom: ['von', 'dem'], beim: ['bei', 'dem'], aufs: ['auf', 'das'], durchs: ['durch', 'das'],
  fürs: ['für', 'das'], ums: ['um', 'das'], übers: ['über', 'das'], unters: ['unter', 'das'], vors: ['vor', 'das'],
  hinterm: ['hinter', 'dem'], überm: ['über', 'dem'], unterm: ['unter', 'dem'], vorm: ['vor', 'dem'] };

function addFunctionWordsDE(L, m) {
  const art = L.lemma('der', 'art');
  if (art) for (const g of DE.GENDERS) DE.CASES.forEach((c, i) => add(m, DE.DEF[g][i], art.id, `D:${c}.${g}`));
  const ein = L.lemma('ein', 'art');
  if (ein) for (const g of ['m', 'f', 'n']) DE.CASES.forEach((c) => add(m, DE.article('indef', g, c), ein.id, `D:${c}.${g}`));
  for (const stem of ['kein', 'mein', 'dein', 'sein', 'ihr', 'unser', 'euer']) {
    const e = (L.byLemma.get(stem) || []).find((x) => x.p === 'det');
    if (!e) continue;
    for (const g of DE.GENDERS) DE.CASES.forEach((c) => add(m, DE.einWord(stem, g, c), e.id, `D:${c}.${g}`));
  }
  const ihrFormal = (L.byLemma.get('ihr') || []).find((x) => x.p === 'det');
  if (ihrFormal) for (const g of DE.GENDERS) DE.CASES.forEach((c) => add(m, 'I' + DE.einWord('ihr', g, c).slice(1), ihrFormal.id, `D:${c}.${g}`));
  for (const stem of ['dieser', 'jener', 'jeder', 'welcher', 'mancher', 'solcher']) {
    const e = (L.byLemma.get(stem) || L.byLemma.get(stem.replace(/er$/, '')) || [])[0];
    if (!e) continue;
    for (const g of DE.GENDERS) DE.CASES.forEach((c) => add(m, DE.derWord(stem, g, c), e.id, `D:${c}.${g}`));
  }
  for (const [lemma, forms] of Object.entries(DE_PRON)) {
    const e = (L.byLemma.get(lemma.toLowerCase()) || []).find((x) => x.p === 'pron' && (lemma !== 'Sie' || x.l === 'Sie')) ||
      (L.byLemma.get(lemma.toLowerCase()) || [])[0];
    if (!e) continue;
    for (const [f, c] of forms) add(m, f, e.id, `P:${c}`);
  }
  for (const [form, [prep, article]] of Object.entries(DE_CONTRACT)) {
    const e = L.lemma(prep, 'prep');
    if (e) add(m, form, e.id, `C:${prep}+${article}`);
  }
  // jemand, niemand: jemanden (acc.), jemandem (dat.)
  for (const lemma of ['jemand', 'niemand']) {
    const e = L.lemma(lemma);
    if (e) for (const [end, c] of [['en', 'akk'], ['em', 'dat'], ['es', 'gen']]) add(m, lemma + end, e.id, `P:${c}`);
  }
  // meins, deins, unsers: possessives standing alone (Das ist meins.)
  for (const stem of ['mein', 'dein', 'sein', 'unser', 'euer']) {
    const e = (L.byLemma.get(stem) || []).find((x) => x.p === 'det');
    if (e) add(m, (stem === 'euer' ? 'eur' : stem) + 's', e.id, 'P:standing alone (meins = mine)');
  }
  const werden = L.lemma('werden', 'v');
  if (werden) add(m, 'worden', werden.id, 'V:pp.passive'); // Das Haus ist gebaut worden.
  // viel, wenig, beide, einige, alle…: endings like adjectives (viele Leute, mit vielen Freunden, beides)
  for (const lemma of ['viel', 'wenig', 'beide', 'einige', 'mehrere', 'manche', 'alle']) {
    const e = L.lemma(lemma, 'det');
    if (!e) continue;
    const stem = lemma.replace(/e$/, '');
    for (const end of ADJ_ENDINGS) add(m, stem + end, e.id, 'A:pos.decl');
  }
}

// ---------- Italian forms ----------

const IT_ART = { il: ['il', 'm.sg'], lo: ['il', 'm.sg (lo)'], "l'": ['il', 'sg (elided)'], i: ['il', 'm.pl'], gli: ['il', 'm.pl (gli)'],
  la: ['la', 'f.sg'], le: ['la', 'f.pl'], un: ['un', 'm'], uno: ['un', 'm (uno)'], una: ['un', 'f'], "un'": ['un', 'f (elided)'] };

function buildFormsIT(L) {
  const m = new Map();
  for (const e of L.entries) {
    const id = e.id;
    if (e.p === 'n') {
      add(m, e.l, id, e.g === 'mpl' || e.g === 'fpl' ? 'N:pl' : 'N:sg');
      if (e.pl && e.pl !== e.l) add(m, e.pl, id, 'N:pl');
      if (e.plf) add(m, e.plf, id, 'N:pl.f');
      if (e.inv) add(m, e.l, id, 'N:pl');
    } else if (e.p === 'v' && e.v?.t) {
      add(m, e.l, id, 'V:inf');
      if (e.v.refl) add(m, e.l.replace(/rsi$/, 're').replace(/rsene$/, 're'), id, 'V:inf');
      for (const [tense, forms] of Object.entries(e.v.t)) {
        forms.forEach((f, p) => {
          if (!f || f === '-') return;
          const word = f.split(' ').pop();
          add(m, word, id, `V:${tense}.${p}`);
        });
      }
      if (e.v.pp) {
        const st = e.v.pp.replace(/o$/, '');
        add(m, e.v.pp, id, 'V:pp');
        for (const end of ['a', 'i', 'e']) add(m, st + end, id, `V:pp.${end}`);
      }
      if (e.v.ger) add(m, e.v.ger, id, 'V:ger');
    } else if (e.p === 'a') {
      const f = IT.adjForms(e);
      add(m, f.ms, id, 'A:ms');
      add(m, f.fs, id, 'A:fs');
      add(m, f.mp, id, 'A:mp');
      add(m, f.fp, id, 'A:fp');
      for (const s of e.a?.sup || []) {
        const st = s.replace(/o$/, '');
        add(m, s, id, 'A:sup.ms');
        for (const [end, g] of [['a', 'fs'], ['i', 'mp'], ['e', 'fp']]) add(m, st + end, id, `A:sup.${g}`);
      }
    } else if (e.a) {
      // determiners that agree like adjectives (mio, molto, quanto…); '-' = no such form
      const f = IT.adjForms(e);
      add(m, f.ms, id, f.fs === f.ms ? 'A:s' : 'A:ms');
      if (f.fs !== f.ms) add(m, f.fs, id, 'A:fs');
      if (f.mp === f.fp) { if (f.mp !== '-') add(m, f.mp, id, 'A:p'); }
      else { add(m, f.mp, id, 'A:mp'); add(m, f.fp, id, 'A:fp'); }
    } else {
      add(m, e.l, id, 'X');
    }
  }
  const extra = { bel: 'bello', bei: 'bello', begli: 'bello', "bell'": 'bello', buon: 'buono', "buon'": 'buono', gran: 'grande',
    san: 'santo', "sant'": 'santo', quel: 'quello', quei: 'quello', quegli: 'quello', "quell'": 'quello', "quest'": 'questo',
    "po'": 'poco', "c'": 'ci', "v'": 'vi', "m'": 'mi', "t'": 'ti', "s'": 'si', "l'": 'lo', "d'": 'di', "dov'": 'dove', "com'": 'come',
    "nessun'": 'nessuno', nessun: 'nessuno', alcun: 'alcuno', ciascun: 'ciascuno', qualcun: 'qualcuno', tal: 'tale', qual: 'quale',
    ed: 'e', ad: 'a', od: 'o' };
  for (const [form, lemma] of Object.entries(extra)) {
    const e = (L.byLemma.get(lemma) || []).find((x) => x.p !== 'n') || (L.byLemma.get(lemma) || [])[0];
    if (e) add(m, form, e.id, 'X:short');
  }
  // one-syllable tu imperatives: va' (andare), fa', di', da', sta'
  for (const [form, lemma] of Object.entries({ "va'": 'andare', "fa'": 'fare', "di'": 'dire', "da'": 'dare', "sta'": 'stare' })) {
    const e = L.lemma(lemma, 'v');
    if (e) add(m, form, e.id, 'V:imp.0');
  }
  // older participles still in use: perduto (= perso), veduto (= visto)
  for (const [form, lemma] of [['perduto', 'perdere'], ['veduto', 'vedere']]) {
    const e = L.lemma(lemma, 'v');
    if (e) { add(m, form, e.id, 'V:pp'); for (const end of ['a', 'i', 'e']) add(m, form.slice(0, -1) + end, e.id, `V:pp.${end}`); }
  }
  const entrambi = L.lemma('entrambi');
  if (entrambi) add(m, 'entrambe', entrambi.id, 'A:fp');
  // me lo, te la, ce ne, ve li, se lo: mi/ti/ci/vi/si turn -e before lo, la, li, le, ne
  for (const [form, lemma] of [['me', 'mi'], ['te', 'ti'], ['ce', 'ci'], ['ve', 'vi'], ['se', 'si']]) {
    const e = L.lemma(lemma, 'pron');
    if (e) add(m, form, e.id, 'P:comb');
  }
  for (const [form, [lemma, tag]] of Object.entries(IT_ART)) {
    const e = L.lemma(lemma, 'art');
    if (e) add(m, form, e.id, `D:${tag}`);
  }
  for (const [form, { prep, art }] of Object.entries(IT.ART_PREP_TABLE)) {
    const e = L.lemma(prep, 'prep');
    if (e) add(m, form, e.id, `C:${prep}+${art}`);
  }
  return m;
}
