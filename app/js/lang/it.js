// Italian grammar engine: articles, articulated prepositions, agreement, compound tenses, clitics,
// gender and plural explanations. Lexicon entries come from tools/build_lexicon_it.py.

export const PERSONS = ['io', 'tu', 'lui/lei', 'noi', 'voi', 'loro'];
export const IMP_PERSONS = ['tu', 'Lei', 'noi', 'voi', 'Loro'];
export const GENDER_NAMES = { m: 'masculine', f: 'feminine', mf: 'masculine or feminine', mpl: 'masculine plural', fpl: 'feminine plural' };

const VOWEL_START = /^[aeiouàèéìòùh]/i;
// lo/gli group: s + consonant, z, gn, ps, pn, x, y, semivowel i + vowel (lo iato, lo yogurt)
const LO_START = /^(s[^aeiouàèéìòù]|z|gn|ps|pn|x|y|i[aeiou])/i;

export function startsLo(word) { return LO_START.test(word); }
export function startsVowel(word) { return VOWEL_START.test(word) && !/^i[aeiou]/i.test(word); }

// Definite article for the word that follows it (noun or adjective).
export function defArticle(word, g, number = 'sg') {
  const masc = g === 'm' || g === 'mpl' || g === 'mf';
  if (number === 'pl' || g === 'mpl' || g === 'fpl') {
    if (!masc || g === 'fpl') return 'le';
    return startsLo(word) || startsVowel(word) ? 'gli' : 'i';
  }
  if (masc) return startsLo(word) ? 'lo' : startsVowel(word) ? "l'" : 'il';
  return startsVowel(word) ? "l'" : 'la';
}

export function indefArticle(word, g) {
  if (g === 'm' || g === 'mf') return startsLo(word) ? 'uno' : 'un';
  return startsVowel(word) ? "un'" : 'una';
}

export function joinArticle(art, word) {
  return art.endsWith("'") ? art + word : `${art} ${word}`;
}

// "il libro", "l'amico", "gli zii", "le uova"
export function withArticle(entry, number = 'sg', kind = 'def') {
  const g = entry.g === 'mf' ? 'm' : entry.g;
  if (number === 'pl') {
    const pl = entry.pl || entry.l;
    const pg = entry.plg || (g === 'mpl' ? 'm' : g === 'fpl' ? 'f' : g);
    if (entry.l === 'dio' || entry.l === 'Dio') return 'gli dei';
    return kind === 'def' ? joinArticle(defArticle(pl, pg, 'pl'), pl) : pl;
  }
  if (g === 'mpl' || g === 'fpl') return joinArticle(defArticle(entry.l, g, 'pl'), entry.l);
  return joinArticle(kind === 'def' ? defArticle(entry.l, g) : indefArticle(entry.l, g), entry.l);
}

// Both genders for nouns like il/la turista, il/la nipote.
export function articleLabel(entry) {
  if (entry.g === 'mf') return `${joinArticle(defArticle(entry.l, 'm'), entry.l)} / ${joinArticle(defArticle(entry.l, 'f'), entry.l)}`;
  return withArticle(entry);
}

const ART_FORMS = ['il', 'lo', "l'", 'la', 'i', 'gli', 'le'];
const PREP_BASE = { di: 'de', a: 'a', da: 'da', in: 'ne', su: 'su' };

// di + il = del, a + gli = agli, in + l' = nell'
export function artPrep(prep, art) {
  const b = PREP_BASE[prep];
  if (!b || !ART_FORMS.includes(art)) return null;
  if (art === 'il') return b + 'l';
  if (art === 'i') return b + 'i';
  return b + 'l' + art; // lo → dello, l' → dell', la → della, gli → degli, le → delle
}

// Reverse map for the reader: "dell'" → { prep: 'di', art: "l'" }
export const ART_PREP_TABLE = (() => {
  const out = {};
  for (const p of Object.keys(PREP_BASE)) for (const a of ART_FORMS) out[artPrep(p, a)] = { prep: p, art: a };
  out.col = { prep: 'con', art: 'il' };
  out.coi = { prep: 'con', art: 'i' };
  return out;
})();

export function articleInfo(art) {
  return {
    il: 'masculine singular, before most consonants',
    lo: 'masculine singular, before s+consonant, z, gn, ps, pn, x, y',
    "l'": 'singular before a vowel (masculine or feminine)',
    la: 'feminine singular before a consonant',
    i: 'masculine plural, before most consonants',
    gli: 'masculine plural, before vowels and lo-type consonants',
    le: 'feminine plural',
  }[art] || '';
}

// ---------- adjectives ----------

export function adjForms(entry) {
  const a = entry.a || {};
  const l = entry.l;
  if (a.inv) return { ms: l, fs: l, mp: l, fp: l };
  return { ms: l, fs: a.f || l, mp: a.mp || l, fp: a.fp || a.mp || l };
}

export function agree(entry, g, number = 'sg') {
  const f = adjForms(entry);
  const fem = g === 'f' || g === 'fpl';
  if (number === 'pl') return fem ? f.fp : f.mp;
  return fem ? f.fs : f.ms;
}

// bello, buono, quello, grande, santo change before a noun, like the article does.
export function prenominal(entry, nextWord, g, number = 'sg') {
  const l = entry.l;
  if (l === 'bello' || l === 'quello') {
    const stem = l === 'bello' ? 'be' : 'que';
    const art = defArticle(nextWord, g, number);
    const map = { il: 'l', lo: 'llo', "l'": "ll'", la: 'lla', i: 'i', gli: 'gli', le: 'lle' };
    return stem + map[art];
  }
  if (l === 'buono') {
    if (number === 'pl') return g === 'f' ? 'buone' : 'buoni';
    if (g === 'f') return startsVowel(nextWord) ? "buon'" : 'buona';
    return startsLo(nextWord) ? 'buono' : 'buon';
  }
  if (l === 'santo' && number === 'sg') {
    if (startsVowel(nextWord)) return "sant'";
    if (g === 'f') return 'santa';
    return /^s[^aeiou]/i.test(nextWord) ? 'santo' : 'san';
  }
  return agree(entry, g, number);
}

// ---------- verbs ----------

export const TENSES = [
  { k: 'pres', name: 'Presente', en: 'present', level: 1 },
  { k: 'pp', name: 'Passato prossimo', en: 'present perfect (spoken past)', level: 1 },
  { k: 'impf', name: 'Imperfetto', en: 'imperfect (was doing / used to)', level: 2 },
  { k: 'fut', name: 'Futuro semplice', en: 'future', level: 2 },
  { k: 'imp', name: 'Imperativo', en: 'imperative', level: 1 },
  { k: 'cond', name: 'Condizionale presente', en: 'conditional (would)', level: 2 },
  { k: 'cong', name: 'Congiuntivo presente', en: 'present subjunctive', level: 3 },
  { k: 'trap', name: 'Trapassato prossimo', en: 'past perfect (had done)', level: 3 },
  { k: 'congi', name: 'Congiuntivo imperfetto', en: 'imperfect subjunctive', level: 3 },
  { k: 'condp', name: 'Condizionale passato', en: 'past conditional (would have)', level: 3 },
  { k: 'congp', name: 'Congiuntivo passato', en: 'past subjunctive', level: 4 },
  { k: 'futa', name: 'Futuro anteriore', en: 'future perfect (will have)', level: 4 },
  { k: 'congt', name: 'Congiuntivo trapassato', en: 'pluperfect subjunctive', level: 4 },
  { k: 'rem', name: 'Passato remoto', en: 'historic past (stories, Pinocchio)', level: 3 },
  { k: 'ger', name: 'Gerundio / stare + gerundio', en: 'gerund / progressive (I am doing)', level: 2 },
];

const COMPOUND = { pp: 'pres', trap: 'impf', futa: 'fut', condp: 'cond', congp: 'cong', congt: 'congi', trem: 'rem' };
const REFL = ['mi', 'ti', 'si', 'ci', 'vi', 'si'];

let resolve = () => null;
export function setResolver(fn) { resolve = fn; }

export function isReflexive(entry) { return !!entry.v?.refl; }

// Participle agreement with essere: andato/a, andati/e.
export function ppAgree(pp, p) {
  if (!pp) return pp;
  const stem = pp.replace(/o$/, '');
  return p < 3 ? `${stem}o/a` : `${stem}i/e`;
}

export function conjugate(entry, tense, p) {
  const v = entry.v;
  if (!v?.t) return null;
  if (v.t[tense]) {
    const f = v.t[tense][p];
    if (tense === 'imp') return f && f !== '-' ? f + '!' : null;
    return f && f !== '-' ? f : null;
  }
  if (tense === 'ger') {
    const stare = resolve('stare');
    const ger = v.ger;
    if (!ger || !stare) return null;
    const plainGer = isReflexive(entry) ? ger.replace(/(si|sene)$/, '') : ger;
    const st = stare.v.t.pres[p];
    return isReflexive(entry) ? `${REFL[p]} ${st} ${plainGer}` : `${st} ${plainGer}`;
  }
  const auxTense = COMPOUND[tense];
  if (!auxTense || !v.pp) return null;
  const auxes = isReflexive(entry) ? ['e'] : (v.aux || 'a').split('/');
  const forms = auxes.map((a) => {
    const ae = resolve(a === 'e' ? 'essere' : 'avere');
    const af = ae?.v?.t?.[auxTense]?.[p];
    if (!af) return null;
    const part = a === 'e' ? ppAgree(v.pp, p) : v.pp;
    return isReflexive(entry) ? `${REFL[p]} ${af} ${part}` : `${af} ${part}`;
  }).filter(Boolean);
  return forms.join(' / ') || null;
}

export function auxLabel(entry) {
  const a = entry.v?.aux || 'a';
  if (isReflexive(entry)) return 'essere (all reflexive verbs)';
  if (a === 'a/e') return 'avere with a direct object, essere without';
  return a === 'e' ? 'essere' : 'avere';
}

// Principal parts in the old-grammar style: andare – vado – andai – sono andato.
export function principalParts(entry) {
  const v = entry.v;
  if (!v?.t) return null;
  const aux = isReflexive(entry) ? 'mi sono' : (v.aux || 'a').split('/').map((a) => (a === 'e' ? 'sono' : 'ho')).join('/');
  const pp = (v.aux === 'e' || isReflexive(entry)) ? ppAgree(v.pp, 0) : v.pp;
  const parts = [entry.l, v.t.pres?.[0], v.t.rem?.[0], v.pp ? `${aux} ${pp}` : null].filter(Boolean);
  return { text: parts.join(' – ') };
}

// Regular endings, to highlight what is irregular in a table.
const REG = {
  are: { pres: ['o', 'i', 'a', 'iamo', 'ate', 'ano'], impf: ['avo', 'avi', 'ava', 'avamo', 'avate', 'avano'],
    rem: ['ai', 'asti', 'ò', 'ammo', 'aste', 'arono'], fut: ['erò', 'erai', 'erà', 'eremo', 'erete', 'eranno'],
    cond: ['erei', 'eresti', 'erebbe', 'eremmo', 'ereste', 'erebbero'], cong: ['i', 'i', 'i', 'iamo', 'iate', 'ino'],
    congi: ['assi', 'assi', 'asse', 'assimo', 'aste', 'assero'] },
  ere: { pres: ['o', 'i', 'e', 'iamo', 'ete', 'ono'], impf: ['evo', 'evi', 'eva', 'evamo', 'evate', 'evano'],
    rem: ['ei', 'esti', 'é', 'emmo', 'este', 'erono'], fut: ['erò', 'erai', 'erà', 'eremo', 'erete', 'eranno'],
    cond: ['erei', 'eresti', 'erebbe', 'eremmo', 'ereste', 'erebbero'], cong: ['a', 'a', 'a', 'iamo', 'iate', 'ano'],
    congi: ['essi', 'essi', 'esse', 'essimo', 'este', 'essero'] },
  ire: { pres: ['o', 'i', 'e', 'iamo', 'ite', 'ono'], impf: ['ivo', 'ivi', 'iva', 'ivamo', 'ivate', 'ivano'],
    rem: ['ii', 'isti', 'ì', 'immo', 'iste', 'irono'], fut: ['irò', 'irai', 'irà', 'iremo', 'irete', 'iranno'],
    cond: ['irei', 'iresti', 'irebbe', 'iremmo', 'ireste', 'irebbero'], cong: ['a', 'a', 'a', 'iamo', 'iate', 'ano'],
    congi: ['issi', 'issi', 'isse', 'issimo', 'iste', 'issero'] },
};
const ISC = { pres: ['isco', 'isci', 'isce', 'iamo', 'ite', 'iscono'], cong: ['isca', 'isca', 'isca', 'iamo', 'iate', 'iscano'] };

export function conjClass(entry) {
  const inf = entry.l.replace(/(si|sene|cela)$/, 'e').replace(/rre$/, 'rre');
  if (/arre$|orre$|urre$/.test(inf)) return 'ere';
  const m = inf.match(/(are|ere|ire)$/);
  return m ? m[1] : null;
}

function regularForm(entry, tense, p) {
  const cls = conjClass(entry);
  if (!cls || !REG[cls][tense]) return null;
  const inf = entry.l.replace(/(rsi|rsene|rcela)$/, 're');
  let stem = inf.slice(0, -3);
  let end = (entry.v?.isc && ISC[tense]) ? ISC[tense][p] : REG[cls][tense][p];
  // spelling: cercare → cerchi, pagare → paghi; mangiare → mangi (no double i), mangerò
  if (cls === 'are' && /[cg]$/.test(stem) && /^[ie]/.test(end)) stem += 'h';
  if (cls === 'are' && /[cg]i$/.test(stem) && /^e/.test(end)) stem = stem.slice(0, -1);
  if (/i$/.test(stem) && /^i/.test(end)) end = end.slice(1);
  return stem + end;
}

// Boolean per cell: true where the real form differs from the regular pattern.
export function irregularCells(entry, tense) {
  const t = entry.v?.t?.[tense];
  if (!t || tense === 'imp') return [];
  return t.map((f, p) => {
    if (!f) return false;
    const real = f.split(' ').pop();
    const reg = regularForm(entry, tense, p);
    if (!reg) return false;
    if (tense === 'rem' && conjClass(entry) === 'ere') {
      const alt = reg.replace(/ei$/, 'etti').replace(/é$/, 'ette').replace(/erono$/, 'ettero');
      if (real === alt) return false;
    }
    return real !== reg;
  });
}

// ---------- clitics (reader) ----------

const CLITIC_RE = /(glie(?:lo|la|li|le|ne)|(?:me|te|se|ce|ve)(?:lo|la|li|le|ne)|mi|ti|si|ci|vi|lo|la|li|le|gli|ne)$/;

// "vederlo" → [{ base: 'veder', clitics: ['lo'] }], "dimmelo" → di' + me + lo, "alzati" → alza + ti
export function splitClitics(word) {
  const out = [];
  let w = word.toLowerCase();
  const clitics = [];
  for (let i = 0; i < 2; i++) {
    const m = w.match(CLITIC_RE);
    if (!m || w.length - m[0].length < 2) break;
    clitics.unshift(m[0]);
    w = w.slice(0, -m[0].length);
    const bases = [w];
    if (/(.)\1$/.test(w) && w.length <= 4) bases.push(w.slice(0, -1) + "'"); // dimmi → di', fammi → fa'
    if (/r$/.test(w)) bases.push(w + 'e'); // veder → vedere
    if (/rr$/.test(w)) bases.push(w + 'e');
    for (const b of bases) out.push({ base: b, clitics: [...clitics] });
  }
  return out;
}

export const CLITIC_MEANING = {
  mi: 'me / to me / myself', ti: 'you / to you / yourself', si: 'himself, herself, themselves / oneself',
  ci: 'us / to us / there', vi: 'you (pl.) / to you', lo: 'him / it', la: 'her / it', li: 'them (m.)', le: 'them (f.) / to her',
  gli: 'to him / to them', ne: 'of it / of them / some', glielo: 'it to him/her', gliela: 'it to him/her', glieli: 'them to him/her',
  gliele: 'them to him/her', gliene: 'some to him/her', melo: 'it to me', telo: 'it to you', celo: 'it to us', selo: 'it to himself',
};

// ---------- nouns: gender and plural explanations ----------

const GREEK_MA = /(ma)$/;
export function genderHint(entry) {
  const l = entry.l, g = entry.g;
  if (g === 'mf') return { text: 'Same form for both sexes; the article shows who is meant (il/la ...).', follows: true };
  if (g === 'mpl' || g === 'fpl') return { text: 'Used in the plural.', follows: true };
  if (/[àù]$/.test(l) && /t[àù]$/.test(l)) return { text: '-tà / -tù nouns are feminine and invariable (la città, le città).', follows: g === 'f' };
  if (/zione$|sione$/.test(l)) return { text: '-zione / -sione nouns are feminine.', follows: g === 'f' };
  if (/ice$/.test(l)) return { text: '-ice nouns (attrice, lavatrice) are usually feminine.', follows: g === 'f' };
  if (/ore$/.test(l)) return { text: '-ore nouns (il colore, il fiore) are usually masculine.', follows: g === 'm' };
  if (/ista$/.test(l)) return { text: '-ista nouns are masculine or feminine by sense: il/la turista.', follows: true };
  if (/[^aeiouàèéìòù]$/.test(l)) return { text: 'Words from other languages ending in a consonant are usually masculine and invariable.', follows: g === 'm' };
  if (/o$/.test(l)) return g === 'm' ? { text: 'Rule: nouns in -o are masculine.', follows: true }
    : { text: 'Exception! Nouns in -o are masculine, but this one is feminine (like la mano, la radio, la foto).', follows: false };
  if (/a$/.test(l)) {
    if (g === 'f') return { text: 'Rule: nouns in -a are feminine.', follows: true };
    return { text: GREEK_MA.test(l) ? 'Exception: -ma words of Greek origin are masculine (il problema, il sistema, il programma).'
      : 'Exception! Nouns in -a are feminine, but this one is masculine.', follows: false };
  }
  if (/e$/.test(l)) return { text: 'Nouns in -e can be masculine or feminine: learn the article with the noun.', follows: null };
  if (/i$/.test(l)) return { text: 'Nouns in -i (la crisi, l\'analisi) are usually feminine and invariable.', follows: g === 'f' };
  return { text: 'Learn the article with the noun.', follows: null };
}

export function pluralRule(entry) {
  const s = entry.l, p = entry.pl;
  if (!p) return entry.unc ? 'not usually plural' : '';
  if (entry.inv || p === s) {
    if (/[àèéìòù]$/.test(s)) return 'invariable: nouns with a final accent do not change (la città → le città)';
    if (/[^aeiou]$/.test(s)) return 'invariable: foreign words ending in a consonant do not change';
    if (/i$/.test(s)) return 'invariable: nouns in -i do not change (la crisi → le crisi)';
    return 'invariable (shortened words like foto, moto, auto, cinema do not change)';
  }
  if (entry.plg && entry.plg !== entry.g) return `irregular: masculine in the singular, feminine plural in -a (il ${s} → le ${p})`;
  if (/co$/.test(s) && /chi$/.test(p)) return '-co → -chi (the hard c sound stays)';
  if (/co$/.test(s) && /ci$/.test(p)) return '-co → -ci (usually when stressed on the third-last syllable: medico → medici; also amico → amici)';
  if (/go$/.test(s) && /ghi$/.test(p)) return '-go → -ghi (the hard g sound stays)';
  if (/ca$/.test(s)) return '-ca → -che (amica → amiche)';
  if (/ga$/.test(s)) return '-ga → -ghe';
  if (/[cg]ia$/.test(s)) return /[cg]ie$/.test(p) ? '-cia/-gia → -cie/-gie after a vowel or stressed i' : '-cia/-gia → -ce/-ge after a consonant';
  if (/io$/.test(s) && /ii$/.test(p)) return '-io → -ii when the i is stressed (zio → zii)';
  if (/io$/.test(s) && /i$/.test(p)) return '-io → -i (figlio → figli)';
  if (/o$/.test(s) && /i$/.test(p)) return '-o → -i';
  if (/a$/.test(s) && /e$/.test(p)) return '-a → -e';
  if (/a$/.test(s) && /i$/.test(p)) return '-a → -i (masculine nouns in -a: il problema → i problemi)';
  if (/e$/.test(s) && /i$/.test(p)) return '-e → -i';
  return 'irregular plural';
}

// Old typography in 19th-century texts → modern spelling candidates.
export function spellingCandidates(word) {
  const out = new Set();
  out.add(word.replace(/è$/, 'é').replace(/^(perch|poich|benché|affinch|sicch|finch)è$/, '$1é'));
  out.add(word.replace(/ú/g, 'ù').replace(/í/g, 'ì').replace(/ó/g, 'ò').replace(/á/g, 'à'));
  out.add(word.replace(/chè$/, 'ché'));
  out.add(word.replace(/j/g, 'i'));
  out.delete(word);
  return [...out];
}
