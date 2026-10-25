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
  if (art === 'gli') return b + 'gli'; // degli, agli, dagli, negli, sugli
  return b + 'l' + art; // lo → dello, l' → dell', la → della, le → delle
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

const CLITICS = ['glielo', 'gliela', 'glieli', 'gliele', 'gliene',
  ...['me', 'te', 'se', 'ce', 've'].flatMap((p) => ['lo', 'la', 'li', 'le', 'ne'].map((d) => p + d)),
  'mi', 'ti', 'si', 'ci', 'vi', 'lo', 'la', 'li', 'le', 'gli', 'ne'];

// Every way to read a word as verb + attached pronouns, most plausible first:
// plain bases (alza + ti, disse + lo), then infinitives (veder → vedere + lo), then di'/fa'/da' + doubled clitic (dimmi, vattene).
export function splitClitics(word) {
  const tiers = [[], [], []];
  const walk = (w, after) => {
    for (const k of CLITICS) {
      if (!w.endsWith(k) || w.length - k.length < 2) continue;
      const b = w.slice(0, -k.length);
      const clitics = [k, ...after];
      tiers[0].push({ base: b, clitics });
      if (/r$/.test(b)) tiers[1].push({ base: b + 'e', clitics });
      if (!after.length && b.length <= 4 && b.slice(-1) === k[0] && k[0] !== 'g') tiers[2].push({ base: b.slice(0, -1) + "'", clitics });
      if (b.length <= 3 && /[aei]$/.test(b)) tiers[2].push({ base: b + "'", clitics }); // dagli → da' + gli
      if (!after.length) walk(b, clitics);
    }
  };
  walk(word.toLowerCase(), []);
  return tiers.flat();
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
  out.add(word.replace(/iuo/g, 'io').replace(/([^i])uo/, '$1o')); // giuoco → gioco, cuopre → copre
  out.add(word.replace(/([ei])a(no)?$/, '$1va$2')); // imperfetto without v: avea → aveva, sentiano → sentivano
  out.delete(word);
  return [...out];
}

// Old and literary forms in 19th-century books → [modern lemma, explanation]
export const ARCHAIC = {
  ei: ['egli', 'ei = egli, lui (he) — old and poetic'], "e'": ['egli', "e' = egli, lui (he) — Tuscan"], eglino: ['egli', 'eglino = loro (they) — old'],
  elleno: ['ella', 'elleno = loro (they, f.) — old'], fo: ['fare', 'fo = faccio (I do, I make) — old Tuscan'],
  vo: ['andare', 'vo = vado (I go) — old Tuscan'], debbo: ['dovere', 'debbo = devo (I must) — old'], debbono: ['dovere', 'debbono = devono (they must) — old'],
  deggio: ['dovere', 'deggio = devo (I must) — poetic'], dee: ['dovere', 'dee = deve (must) — old'], deono: ['dovere', 'deono = devono — old'],
  veggo: ['vedere', 'veggo = vedo (I see) — old'], puote: ['potere', 'puote = può (can) — poetic'], ponno: ['potere', 'ponno = possono — poetic'],
  "fe'": ['fare', "fe' = fece (did, made)"], "die'": ['dare', "die' = diede (gave)"], han: ['avere', 'han = hanno (they have)'],
  fan: ['fare', 'fan = fanno (they do)'], dan: ['dare', 'dan = danno (they give)'], stan: ['stare', 'stan = stanno (they are, stay)'],
  or: ['ora', 'or = ora (now)'], "mi'": ['mio', "mi' = mio / mia (my) — Tuscan"], "tu'": ['tuo', "tu' = tuo / tua (your) — Tuscan"],
  "su'": ['suo', "su' = suo / sua (his, her) — Tuscan"], core: ['cuore', 'core = cuore (heart) — poetic'],
  lagrima: ['lacrima', 'lagrima = lacrima (tear) — old spelling'], lagrime: ['lacrima', 'lagrime = lacrime (tears) — old spelling'],
  imperocché: ['perché', 'imperocché = perché (because) — old'], laonde: ['quindi', 'laonde = perciò, quindi (therefore) — old'],
  allorché: ['quando', 'allorché = quando (when) — literary'], sinché: ['finché', 'sinché = finché (until)'],
  ove: ['dove', 'ove = dove (where) — literary'], onde: ['dove', 'onde = da dove (whence), or per cui (so that) — literary'],
  niuno: ['nessuno', 'niuno = nessuno (nobody) — old'], cotesto: ['codesto', 'cotesto = codesto (that, near you) — Tuscan'],
  // the Canticle of the Creatures (St Francis, 1224) and other early texts
  laudato: ['lodare', 'laudato = lodato (praised) — old Umbrian, from Latin laudare'], cum: ['con', 'cum = con (with) — Latin'],
  tucte: ['tutto', 'tucte = tutte (all) — old spelling'], tucti: ['tutto', 'tucti = tutti (all) — old spelling'],
  spetialmente: ['specialmente', 'spetialmente = specialmente (especially) — old spelling'], messor: ['signore', 'messor = messere, signore (lord, sir) — old'],
  sora: ['sorella', 'sora = sorella (sister) — old, as in sora Luna'], iorno: ['giorno', 'iorno = giorno (day) — old Umbrian'],
  allumini: ['illuminare', 'allumini = illumini (you light up) — old'], et: ['e', 'et = e (and) — Latin spelling'],
  "si'": ['essere', "si' = sii (be!) — Laudato si' = be praised"],
  altissimu: ['alto', 'Altissimu = Altissimo (Most High: God) — old Umbrian'], bon: ['buono', 'bon = buono (good) — old'],
  onne: ['ogni', 'onne = ogni (every) — old Umbrian'], homo: ['uomo', 'homo = uomo (man) — Latin spelling'],
};

// Shortened forms: vien → viene, far → fare, son → sono, pover' → povero, quand' → quando
export function truncationCandidates(word) {
  const w = word.toLowerCase();
  if (w.length < 2) return [];
  if (/'$/.test(w)) { const b = w.slice(0, -1); return [b + 'o', b + 'e', b + 'a', b + 'i']; }
  if (/n$/.test(w)) return [w + 'o', w + 'e', w + 'a', w + 'i'];
  if (/[lr]$/.test(w)) return [w + 'e', w + 'o', w + 'a', w + 'i'];
  return [];
}

// lentamente → lenta (→ lento), facilmente → facile
export function menteBases(word) {
  const m = word.toLowerCase().match(/^(.{3,})mente$/);
  return m ? [...new Set([m[1], m[1] + 'e'])] : [];
}

// Altered nouns and adjectives: gattino (gatto + -ino), librone, tempaccio, casette, piccolino
// [pattern before the final vowel, suffix name, meaning, English prefix]
const ALTERATI = [['olin', '-olino', 'small or dear', 'little'], ['ellin', '-ellino', 'small or dear', 'little'], ['icin', '-icino', 'small', 'little'],
  ['in', '-ino', 'small or dear', 'little'], ['ett', '-etto', 'small', 'little'], ['ell', '-ello', 'small', 'little'],
  ['ucci', '-uccio', 'small and dear', 'dear little'], ['ucc', '-uccio', 'small and dear', 'dear little'], ['on', '-one', 'big', 'big'],
  ['acci', '-accio', 'bad or ugly', 'nasty'], ['acc', '-accio', 'bad or ugly', 'nasty'], ['ott', '-otto', 'sturdy, fairly big', 'sturdy']];
export function alteratoBases(word) {
  const w = word.toLowerCase();
  const out = [];
  for (const [pat, label, sense, en] of ALTERATI) {
    const m = w.match(new RegExp(`^(.{2,}?)${pat}([oaie])$`));
    if (!m) continue;
    const st = m[1], soft = st.replace(/([cg])h$/, '$1'); // barchetta → barca
    const end = m[2];
    const big = pat === 'on';
    const plural = big ? end === 'i' : end === 'i' || end === 'e';
    // -one nouns are mostly masculine even from feminine bases (la porta → il portone)
    const g = big ? (end === 'a' ? 'f' : 'm') : (end === 'a' || end === 'e' ? 'f' : 'm');
    const sg = !plural ? w : big ? w.replace(/i$/, 'e') : w.replace(/i$/, 'o').replace(/e$/, 'a');
    for (const base of new Set([st + 'o', st + 'a', st + 'e', soft + 'o', soft + 'a'])) out.push({ base, label, sense, en, g, plural, sg });
  }
  return out;
}

// "bellissime" → candidate lemmas (bello, belle…) of an absolute superlative, with the agreement it shows
export function superlativeBases(word) {
  const m = word.toLowerCase().match(/^(.{2,}?)issim([oaie])$/);
  if (!m) return [];
  const st = m[1], soft = st.replace(/([cg])h$/, '$1'); // ricchissimo → ricco, lunghissimo → lungo
  const g = { o: 'ms', a: 'fs', i: 'mp', e: 'fp' }[m[2]];
  return [...new Set([st + 'o', st + 'e', soft + 'o', soft + 'e', st + 'io'])].map((base) => ({ base, g }));
}

// ---------- numbers (reader): "ventitré" → 23, "duemilacinquecento" → 2500, "ventesimo" → 20th ----------

const NUM_SMALL = { uno: 1, un: 1, due: 2, tre: 3, 'tré': 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10,
  undici: 11, dodici: 12, tredici: 13, quattordici: 14, quindici: 15, sedici: 16, diciassette: 17, diciotto: 18, diciannove: 19 };
const NUM_TENS = { venti: 20, trenta: 30, quaranta: 40, cinquanta: 50, sessanta: 60, settanta: 70, ottanta: 80, novanta: 90 };

function below100(s) {
  if (s in NUM_SMALL) return NUM_SMALL[s];
  for (const [w, v] of Object.entries(NUM_TENS)) {
    if (s === w) return v;
    const u = s.startsWith(w) ? NUM_SMALL[s.slice(w.length)] : null;
    if (u && u > 1 && u < 10 && u !== 8) return v + u; // ventidue, trentatré
    const r = s.startsWith(w.slice(0, -1)) ? s.slice(w.length - 1) : null;
    if (r === 'uno' || r === 'un' || r === 'otto') return v + (r === 'otto' ? 8 : 1); // ventuno, ventotto
  }
  return null;
}

function below1000(s) {
  const i = s.indexOf('cent');
  if (i < 0) return below100(s);
  const pre = s.slice(0, i);
  const mult = pre === '' ? 1 : NUM_SMALL[pre];
  const rest = s.slice(i + 4);
  if (!mult || mult > 9 || (pre && mult === 1) || !rest) return null;
  for (const r of rest[0] === 'o' ? [rest.slice(1), rest] : [rest]) { // cento, centoventi, centotto, centuno
    if (r === '') return mult * 100;
    const v = below100(r);
    if (v != null) return mult * 100 + v;
  }
  return null;
}

function cardinal(s) {
  if (s.startsWith('mille')) {
    const r = s === 'mille' ? 0 : below1000(s.slice(5));
    return r != null ? 1000 + r : null;
  }
  const i = s.indexOf('mila');
  if (i <= 0) return below1000(s);
  const mult = below1000(s.slice(0, i));
  if (mult == null || mult < 2) return null;
  const rest = s.slice(i + 4);
  const r = rest ? below1000(rest) : 0;
  return r != null ? mult * 1000 + r : null;
}

export function parseNumber(word) {
  const s = word.toLowerCase();
  const v = cardinal(s);
  if (v != null) return { value: v };
  const m = s.match(/^(.+?)esim[oaie]$/); // ventesimo, ventitreesimo, centesimo
  if (m) for (const b of [m[1], m[1] + 'e', m[1] + 'i', m[1] + 'a', m[1] + 'o']) {
    const o = cardinal(b);
    if (o != null && o > 10) return { value: o, ordinal: true };
  }
  return null;
}
