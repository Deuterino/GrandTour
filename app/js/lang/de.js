// German grammar engine: declension, adjective endings, verb tenses, gender and plural explanations.
// Lexicon entries come from tools/build_lexicon_de.py (see the field list there).

export const CASES = ['nom', 'akk', 'dat', 'gen'];
export const CASE_NAMES = { nom: 'nominative', akk: 'accusative', dat: 'dative', gen: 'genitive' };
export const GENDERS = ['m', 'f', 'n', 'pl'];
export const GENDER_NAMES = { m: 'masculine', f: 'feminine', n: 'neuter', pl: 'plural' };
export const PERSONS = ['ich', 'du', 'er/sie/es', 'wir', 'ihr', 'sie/Sie'];
const PERSON_SUBJ = ['ich', 'du', 'er', 'wir', 'ihr', 'sie'];

export const DEF = { m: ['der', 'den', 'dem', 'des'], f: ['die', 'die', 'der', 'der'], n: ['das', 'das', 'dem', 'des'], pl: ['die', 'die', 'den', 'der'] };
// ein-word endings (ein, kein, mein, dein, sein, ihr, unser, euer, Ihr)
const EIN_END = { m: ['', 'en', 'em', 'es'], f: ['e', 'e', 'er', 'er'], n: ['', '', 'em', 'es'], pl: ['e', 'e', 'en', 'er'] };
// der-word endings (dieser, jener, jeder, welcher, mancher, solcher, alle)
const DER_END = { m: ['er', 'en', 'em', 'es'], f: ['e', 'e', 'er', 'er'], n: ['es', 'es', 'em', 'es'], pl: ['e', 'e', 'en', 'er'] };

export const ADJ_END = {
  strong: { m: ['er', 'en', 'em', 'en'], f: ['e', 'e', 'er', 'er'], n: ['es', 'es', 'em', 'en'], pl: ['e', 'e', 'en', 'er'] },
  weak: { m: ['e', 'en', 'en', 'en'], f: ['e', 'e', 'en', 'en'], n: ['e', 'e', 'en', 'en'], pl: ['en', 'en', 'en', 'en'] },
  mixed: { m: ['er', 'en', 'en', 'en'], f: ['e', 'e', 'en', 'en'], n: ['es', 'es', 'en', 'en'], pl: ['en', 'en', 'en', 'en'] },
};
export const ADJ_DECL_NAMES = {
  strong: 'strong (no article): the adjective shows the case itself',
  weak: 'weak (after der/die/das, dieser, jeder...): the article already shows the case',
  mixed: 'mixed (after ein, kein, mein...): strong where ein has no ending, weak elsewhere',
};

const ci = (c) => (typeof c === 'number' ? c : CASES.indexOf(c));
const gkey = (g, number) => (number === 'pl' || g === 'pl' ? 'pl' : g);

export function article(kind, g, c, number = 'sg') {
  const k = gkey(g, number), i = ci(c);
  if (kind === 'def') return DEF[k][i];
  if (kind === 'indef') return k === 'pl' ? '' : 'ein' + EIN_END[k][i];
  return einWord(kind, k, i);
}

// Possessives and kein. euer drops its e before an ending (eure, eurem).
export function einWord(stem, g, c) {
  const k = g, i = ci(c);
  const end = EIN_END[k][i];
  if (stem === 'euer' && end) return 'eur' + end;
  return stem + end;
}

export function derWord(stem, g, c, number = 'sg') {
  const k = gkey(g, number);
  return stem.replace(/(er|e|es)$/, '') + DER_END[k][ci(c)];
}

export function adjStem(entry) {
  if (!entry) return '';
  return entry.a?.stem || entry.l;
}

export function adjForm(entry, decl, g, c, number = 'sg') {
  if (entry.a?.inv) return entry.l;
  const stem = adjStem(entry);
  const end = ADJ_END[decl][gkey(g, number)][ci(c)];
  return stem.endsWith('e') && end.startsWith('e') ? stem + end.slice(1) : stem + end;
}

export function nounForm(entry, c, number = 'sg') {
  const tab = entry.d?.[number];
  const i = ci(c);
  if (tab && tab[i]) return tab[i];
  if (number === 'pl') return entry.pl || entry.l;
  return entry.l;
}

// Which adjective declension follows a determiner kind.
export function declAfter(det) {
  if (det === 'def' || det === 'der') return 'weak';
  if (det === 'none') return 'strong';
  return 'mixed'; // ein, kein, possessives
}

// Full noun phrase: "den alten Mann", "einem kleinen Kind", "meine neuen Schuhe", "kaltes Wasser".
// det: 'def' | 'indef' | 'none' | 'kein' | 'mein' | 'dein' | ... | 'dieser' | 'jeder' ...
export function nounPhrase(noun, { c = 'nom', number = 'sg', det = 'def', adj = null } = {}) {
  const g = noun.g === 'pl' ? 'pl' : noun.g;
  const k = gkey(g, number);
  let art = '';
  let decl = 'strong';
  if (det === 'def') { art = DEF[k][ci(c)]; decl = 'weak'; }
  else if (det === 'indef') {
    if (k === 'pl') { art = ''; decl = 'strong'; } else { art = 'ein' + EIN_END[k][ci(c)]; decl = 'mixed'; }
  } else if (det === 'none') { art = ''; decl = 'strong'; }
  else if (/^(dies|jen|jed|welch|manch|solch|all)/.test(det)) { art = derWord(det, g, c, number); decl = 'weak'; }
  else { art = einWord(det, k, ci(c)); decl = k === 'pl' ? 'weak' : 'mixed'; }
  if (k === 'pl' && decl === 'mixed') decl = 'weak';
  const parts = [];
  if (art) parts.push(art);
  if (adj) parts.push(adjForm(adj, decl, g, c, number));
  parts.push(nounForm(noun, c, k === 'pl' ? 'pl' : 'sg'));
  return { text: parts.join(' '), art, decl };
}

// ---------- verbs ----------

export const TENSES = [
  { k: 'pres', name: 'Präsens', en: 'present', level: 1 },
  { k: 'perf', name: 'Perfekt', en: 'present perfect (spoken past)', level: 1 },
  { k: 'pret', name: 'Präteritum', en: 'simple past (written past)', level: 2 },
  { k: 'fut1', name: 'Futur I', en: 'future', level: 2 },
  { k: 'imp', name: 'Imperativ', en: 'imperative', level: 1 },
  { k: 'k2', name: 'Konjunktiv II', en: 'subjunctive II (would/could)', level: 3 },
  { k: 'wuerde', name: 'würde + Infinitiv', en: 'conditional (would + verb)', level: 2 },
  { k: 'plup', name: 'Plusquamperfekt', en: 'past perfect (had done)', level: 3 },
  { k: 'k2past', name: 'Konjunktiv II Vergangenheit', en: 'past conditional (would have done)', level: 4 },
  { k: 'fut2', name: 'Futur II', en: 'future perfect (will have done)', level: 4 },
  { k: 'k1', name: 'Konjunktiv I', en: 'subjunctive I (reported speech)', level: 4 },
  { k: 'pass', name: 'Passiv Präsens', en: 'passive (is being done)', level: 4 },
];

const REFL = { a: ['mich', 'dich', 'sich', 'uns', 'euch', 'sich'], d: ['mir', 'dir', 'sich', 'uns', 'euch', 'sich'] };

// Lexicon helper: the engine needs haben/sein/werden tables; pass a resolver (id -> entry).
let resolve = () => null;
export function setResolver(fn) { resolve = fn; }

function auxEntry(which) {
  return resolve(which === 's' ? 'sein~v' : which === 'w' ? 'werden' : 'haben') || resolve(which === 's' ? 'sein' : 'haben');
}

export function infinitive(entry) {
  return entry.l.replace(/^sich /, '');
}

export function splitSep(entry) {
  const sep = entry.v?.sep;
  const inf = infinitive(entry);
  return sep && inf.startsWith(sep) ? { sep, base: inf.slice(sep.length) } : { sep: '', base: inf };
}

// One finite form; clause 'main' keeps the separable prefix at the end ("rufe an"), 'sub' joins it ("anrufe").
export function finite(entry, tense, p, clause = 'main') {
  const f = entry.v?.t?.[tense]?.[p];
  if (!f || f === '-') return null;
  if (clause === 'sub' && entry.v.sep && f.includes(' ')) {
    const [verb, ...rest] = f.split(' ');
    return rest.join('') + verb;
  }
  return f;
}

function withRefl(entry, p, finiteForm, rest = '') {
  // "freue" + mich ; separable "ziehe an" -> "ziehe mich an"
  const r = entry.v?.refl ? REFL[entry.v.refl][p] : '';
  const [verb, ...tail] = finiteForm.split(' ');
  return [verb, r, rest, ...tail].filter(Boolean).join(' ');
}

function auxFor(entry) {
  const a = entry.v?.aux || 'h';
  return a === 'h/s' ? ['h', 's'] : [a];
}

// Conjugate one cell. Returns a display string (without the subject), or null if not used.
export function conjugate(entry, tense, p) {
  const v = entry.v;
  if (!v) return null;
  const pp = v.pp;
  const inf = infinitive(entry);
  const simple = (t) => {
    const f = finite(entry, t, p);
    return f ? withRefl(entry, p, f) : null;
  };
  const compound = (auxTense, auxKind, tail) => {
    const forms = auxFor(entry).map((a) => {
      const ae = auxEntry(auxKind || a);
      const af = ae?.v?.t?.[auxTense]?.[p];
      if (!af) return null;
      return withRefl(entry, p, af, typeof tail === 'function' ? tail(a) : tail);
    }).filter(Boolean);
    return forms.length ? forms.join(' / ') : null;
  };
  switch (tense) {
    case 'pres': case 'pret': case 'k1': case 'k2': return simple(tense);
    case 'imp': {
      if (p === 1) return impForm(entry, 0);
      if (p === 4) return impForm(entry, 1);
      if (p === 5) return impSie(entry);
      if (p === 3) return impWir(entry);
      return null;
    }
    case 'perf': return pp ? compound('pres', null, pp) : null;
    case 'plup': return pp ? compound('pret', null, pp) : null;
    case 'fut1': return compound('pres', 'w', inf);
    case 'fut2': return pp ? compound('pres', 'w', (a) => `${pp} ${a === 's' ? 'sein' : 'haben'}`) : null;
    case 'wuerde': return compound('k2', 'w', inf);
    case 'k2past': return pp ? compound('k2', null, pp) : null;
    case 'pass': return pp && !v.refl ? compound('pres', 'w', pp) : null;
    default: return null;
  }
}

function impForm(entry, i) {
  const f = entry.v?.t?.imp?.[i];
  if (!f || f === '-') return null;
  const r = entry.v?.refl ? REFL[entry.v.refl][i === 0 ? 1 : 4] : '';
  const [verb, ...tail] = f.split(' ');
  return [verb, r, ...tail].filter(Boolean).join(' ') + '!';
}

function impSie(entry) {
  const f = entry.v?.t?.pres?.[5];
  if (!f) return null;
  const [verb, ...tail] = f.split(' ');
  const r = entry.v?.refl ? 'sich' : '';
  return [verb, 'Sie', r, ...tail].filter(Boolean).join(' ') + '!';
}

function impWir(entry) {
  const f = entry.v?.t?.pres?.[3];
  if (!f) return null;
  const [verb, ...tail] = f.split(' ');
  const r = entry.v?.refl ? 'uns' : '';
  return [verb, 'wir', r, ...tail].filter(Boolean).join(' ') + '!';
}

export function subject(p, tense) {
  return tense === 'imp' ? '' : PERSON_SUBJ[p];
}

// Principal parts the old grammars made pupils chant: gehen – geht – ging – ist gegangen.
export function principalParts(entry) {
  const v = entry.v;
  if (!v?.t) return null;
  const aux = (v.aux || 'h').split('/').map((a) => (a === 's' ? 'ist' : 'hat')).join('/');
  return {
    inf: infinitive(entry),
    pres3: v.t.pres?.[2],
    pret3: v.t.pret?.[0],
    perf: v.pp ? `${aux} ${v.pp}` : null,
    text: [infinitive(entry), v.t.pres?.[2], v.t.pret?.[0], v.pp ? `${aux} ${v.pp}` : null].filter(Boolean).join(' – '),
  };
}

// Regular (weak) present-tense prediction, used to flag stem changes such as fahren → fährt.
export function irregularCells(entry, tense = 'pres') {
  const t = entry.v?.t?.[tense];
  if (!t) return [];
  const { base } = splitSep(entry);
  let stem = base.replace(/(e?n)$/, '');
  if (/eln$|ern$/.test(base)) stem = base.slice(0, -1);
  const eIns = /([dt]|[^aeiouälmnrh][mn])$/.test(stem);
  const presEnd = ['e', eIns ? 'est' : (/[sßxz]$/.test(stem) ? 't' : 'st'), eIns ? 'et' : 't', 'en', eIns ? 'et' : 't', 'en'];
  const pretEnd = eIns ? ['ete', 'etest', 'ete', 'eten', 'etet', 'eten'] : ['te', 'test', 'te', 'ten', 'tet', 'ten'];
  const ends = tense === 'pres' ? presEnd : tense === 'pret' ? pretEnd : null;
  if (!ends) return [];
  return t.map((f, i) => {
    if (!f) return false;
    const verb = f.split(' ')[0];
    let reg = stem + ends[i];
    if (tense === 'pres' && /eln$|ern$/.test(base) && (i === 3 || i === 5)) reg = base;
    if (tense === 'pres' && i === 0 && /eln$/.test(base)) reg = base.slice(0, -3) + 'le';
    return verb !== reg;
  });
}

// ---------- nouns: gender and plural explanations ----------

const GENDER_RULES = [
  [/ung$/, 'f', '-ung nouns are always feminine'],
  [/heit$|keit$/, 'f', '-heit / -keit nouns are always feminine'],
  [/schaft$/, 'f', '-schaft nouns are always feminine'],
  [/ion$/, 'f', '-ion nouns are feminine'],
  [/tät$/, 'f', '-tät nouns are feminine'],
  [/ei$/, 'f', '-ei nouns (Bäckerei, Polizei) are feminine'],
  [/[^e]ie$/, 'f', '-ie nouns are feminine'],
  [/ik$/, 'f', '-ik nouns (Musik, Politik) are feminine'],
  [/ur$/, 'f', '-ur nouns (Natur, Kultur) are usually feminine'],
  [/(anz|enz)$/, 'f', '-anz / -enz nouns are feminine'],
  [/in$/, 'f', '-in marks a female person or animal: always feminine', (l) => /[a-zäöü]{3,}in$/.test(l)],
  [/(chen|lein)$/, 'n', 'diminutives in -chen / -lein are always neuter (even das Mädchen)'],
  [/ment$/, 'n', '-ment nouns are usually neuter'],
  [/um$/, 'n', '-um nouns (Zentrum, Museum) are usually neuter'],
  [/tum$/, 'n', '-tum nouns are usually neuter (except der Irrtum, der Reichtum)'],
  [/ma$/, 'n', '-ma nouns of Greek origin (Thema, Klima) are neuter'],
  [/nis$/, 'n', '-nis nouns are mostly neuter (some feminine: die Erlaubnis)'],
  [/^Ge.+e$/, 'n', 'Ge-...-e collective nouns (Gebäude, Gemüse) are neuter'],
  [/ling$/, 'm', '-ling nouns are masculine'],
  [/ismus$/, 'm', '-ismus nouns are masculine'],
  [/ist$/, 'm', '-ist nouns (Polizist, Tourist) are masculine'],
  [/(ant|ent)$/, 'm', '-ant / -ent persons (Student, Präsident) are masculine'],
  [/(or|eur|ör)$/, 'm', '-or / -eur nouns are usually masculine'],
  [/ig$/, 'm', '-ig nouns (Honig, König) are masculine'],
  [/e$/, 'f', 'about 90% of nouns ending in -e are feminine'],
  [/er$/, 'm', 'nouns in -er are often masculine (especially people: Lehrer, Fahrer)'],
];
const MASC_GROUPS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag', 'Januar', 'Februar',
  'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember', 'Frühling', 'Sommer',
  'Herbst', 'Winter', 'Norden', 'Süden', 'Osten', 'Westen'];

// Explain a noun's gender. Returns { text, follows } or { compound } for compounds.
export function genderHint(entry, findNoun) {
  const l = entry.l, g = entry.g;
  if (g === 'pl') return { text: 'Used only in the plural (die).', follows: true };
  if (MASC_GROUPS.includes(l)) return { text: 'Days, months, seasons and compass points are masculine.', follows: g === 'm' };
  if (/en$/.test(l) && g === 'n' && entry.d && findNoun?.(l.toLowerCase(), 'v')) {
    return { text: 'A verb used as a noun (nominalized infinitive) is always neuter: das Essen, das Leben.', follows: true };
  }
  if (findNoun) {
    const c = splitCompound(l, findNoun, true);
    if (c) return { text: `Compound: ${c.parts.join(' + ')}. A compound takes the gender of its last part.`, follows: c.head.g === g, compound: c };
  }
  for (const [re, rg, text, extra] of GENDER_RULES) {
    if (re.test(l) && (!extra || extra(l))) {
      return { text: g === rg ? `Rule: ${text}.` : `Exception! Usually ${text}, but this one is ${GENDER_NAMES[g]}.`, follows: g === rg };
    }
  }
  return { text: 'No reliable rule: learn the article with the noun.', follows: null };
}

// Plural pattern label, the way German grammars classify plurals.
export function pluralClass(entry) {
  const s = entry.l, p = entry.pl;
  if (!p) return entry.unc ? 'no plural' : '';
  if (entry.g === 'pl') return 'plural only';
  const has = (base, end) => p === base + end;
  // umlaut the last full vowel: Apfel → Äpfel, Haus → Häus-, Buch → Büch-
  const umlauted = (base) => {
    const m = base.match(/^(.*?)(au|Au|a|A|o|O|u|U)([^aouAOU]*)$/);
    if (!m) return null;
    const rep = { au: 'äu', Au: 'Äu', a: 'ä', A: 'Ä', o: 'ö', O: 'Ö', u: 'ü', U: 'Ü' }[m[2]];
    return m[1] + rep + m[3];
  };
  if (p === s) return '– (no change)';
  const us = umlauted(s);
  if (us && p === us) return '¨ (umlaut only)';
  if (has(s, 'e')) return '-e';
  if (us && p === us + 'e') return '¨-e';
  if (has(s, 'er')) return '-er';
  if (us && p === us + 'er') return '¨-er';
  if (has(s, 'n')) return '-n';
  if (has(s, 'en')) return '-en';
  if (has(s, 'nen')) return '-nen';
  if (has(s, 's')) return '-s';
  if (/(um|on|a)$/.test(s) && p === s.replace(/(um|on|a)$/, 'en')) return '-um/-a → -en';
  return 'irregular';
}

export function declensionLabel(entry) {
  if (entry.adjn) return 'adjectival noun: declines like an adjective (der Erwachsene, ein Erwachsener)';
  if (entry.decl === 'weak') return 'weak noun (n-Deklination): -(e)n in every case except nominative singular';
  if (entry.decl === 'mixed') return 'mixed noun: genitive -ns, otherwise -n (der Name, des Namens)';
  return '';
}

// ---------- reading helpers ----------

export const SEP_PREFIXES = ['zurück', 'zusammen', 'weiter', 'vorbei', 'voran', 'voraus', 'heraus', 'herein', 'herum',
  'herunter', 'herauf', 'heran', 'hervor', 'hinaus', 'hinein', 'hinauf', 'hinunter', 'hinzu', 'entgegen', 'fort', 'statt',
  'teil', 'fest', 'fern', 'frei', 'kennen', 'los', 'nach', 'mit', 'weg', 'her', 'hin', 'vor', 'ein', 'aus', 'auf', 'an',
  'ab', 'bei', 'dar', 'um', 'durch', 'über', 'unter', 'wieder', 'zu', 'spazieren', 'kaputt', 'sauber'];

// Old (pre-1901 / pre-1996) spellings found in public-domain books → modern candidates.
const OLD_RULES = [
  [/ß/g, 'ss'], [/^Th/, 'T'], [/th/g, 't'], [/ieng/g, 'ing'], [/iebt/g, 'ibt'], [/ey/g, 'ei'], [/niß$/, 'nis'],
  [/^C(?=[aou])/, 'K'], [/^C(?=[ei])/, 'Z'], [/dt$/, 't'], [/Brod/, 'Brot'], [/ä/g, 'e'], [/ae/g, 'ä'], [/oe/g, 'ö'], [/ue/g, 'ü'],
];

export function spellingCandidates(word) {
  const out = new Set();
  let x = word;
  for (const [re, rep] of OLD_RULES) {
    const y = word.replace(re, rep);
    if (y !== word) out.add(y);
    x = x.replace(re, rep);
  }
  out.add(x);
  out.delete(word);
  return [...out];
}

// Archaic forms common in Grimm's tales that are not just spelling changes.
export const ARCHAIC = {
  ward: ['werden', 'wurde (archaic preterite: became / was)'],
  gieng: ['gehen', 'ging (old spelling)'], fieng: ['fangen', 'fing (old spelling)'], hieng: ['hängen', 'hing (old spelling)'],
  sprach: null, kam: null,
  seyn: ['sein', 'sein (old spelling)'], thun: ['tun', 'tun (old spelling)'], Mägdlein: ['Mädchen', 'girl, maiden (archaic diminutive)'],
  allhier: ['hier', 'allhier = hier (old, poetic)'],
};

// Split an unknown compound into known nouns: Haustür → Haus + Tür.
// findNoun(lowercaseLemma) returns a noun entry or null. Linking elements (Fugen-s, -n, -es, -er, -e) are allowed.
export function splitCompound(word, findNoun, skipWhole = false, findHead = findNoun) {
  const w = word.toLowerCase();
  for (let i = 3; i <= w.length - 3; i++) {
    const head = w.slice(i);
    const headEntry = findHead(head);
    if (!headEntry || (skipWhole && i === 0)) continue;
    const left = w.slice(0, i);
    for (const link of ['', 's', 'n', 'en', 'es', 'er', 'e']) {
      if (link && !left.endsWith(link)) continue;
      const base = link ? left.slice(0, -link.length) : left;
      const leftEntry = findNoun(base) || findNoun(base + 'e') || findNoun(base + 'en');
      if (leftEntry || base.length >= 3 && findNoun(base, 'any')) {
        const le = leftEntry || findNoun(base, 'any');
        return {
          parts: [le.p === 'n' ? `${DEF[le.g === 'pl' ? 'pl' : le.g]?.[0] || ''} ${le.l}`.trim() : le.l, `${DEF[headEntry.g === 'pl' ? 'pl' : headEntry.g][0]} ${headEntry.l}`],
          head: headEntry, headForm: head, left: le, link,
        };
      }
    }
  }
  return null;
}

// "Büchlein" → Buch, "Kätzchen" → Katze, "Vöglein" → Vogel: candidate base nouns of a diminutive
export function diminutiveBases(word) {
  const m = word.match(/^([A-ZÄÖÜ].+?)(chen|lein)$/);
  if (!m) return [];
  const st = m[1];
  const plain = st.replace(/äu/g, 'au').replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u');
  const out = [];
  for (const s of [st, plain]) out.push(s, s + 'e', s + 'en', s + 'el');
  return [...new Set(out)];
}

// ---------- numbers (reader): "einundzwanzig" → 21, "zweihundertdreiundvierzigste" → 243rd ----------

const NUM_UNIT = { ein: 1, eins: 1, eine: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9 };
const NUM_TEEN = { zehn: 10, elf: 11, zwölf: 12, dreizehn: 13, vierzehn: 14, fünfzehn: 15, sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19 };
const NUM_TENS = { zwanzig: 20, dreißig: 30, vierzig: 40, fünfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90 };

function below100(s) {
  if (s in NUM_UNIT) return NUM_UNIT[s];
  if (s in NUM_TEEN) return NUM_TEEN[s];
  if (s in NUM_TENS) return NUM_TENS[s];
  const m = s.match(/^(ein|zwei|drei|vier|fünf|sechs|sieben|acht|neun)und(.+)$/);
  return m && NUM_TENS[m[2]] ? NUM_UNIT[m[1]] + NUM_TENS[m[2]] : null;
}

function below1000(s) {
  const i = s.indexOf('hundert');
  if (i < 0) return below100(s);
  const pre = s.slice(0, i);
  const mult = pre === '' ? 1 : NUM_UNIT[pre] || NUM_TEEN[pre]; // neunzehnhundert (years)
  if (!mult || pre === 'eins' || pre === 'eine') return null;
  const rest = s.slice(i + 7).replace(/^und/, '');
  if (!rest) return mult * 100;
  const r = below100(rest);
  return r != null ? mult * 100 + r : null;
}

function cardinal(s) {
  const i = s.indexOf('tausend');
  if (i < 0) return below1000(s);
  const mult = i === 0 ? 1 : below1000(s.slice(0, i));
  if (!mult) return null;
  const rest = s.slice(i + 7).replace(/^und/, '');
  if (!rest) return mult * 1000;
  const r = below1000(rest);
  return r != null ? mult * 1000 + r : null;
}

export function parseNumber(word) {
  const s = word.toLowerCase();
  const v = cardinal(s);
  if (v != null) return { value: v };
  const m = s.match(/^(.+?)s?te[nrsm]?$/);
  const o = m && cardinal(m[1]);
  return o && o > 12 ? { value: o, ordinal: true } : null;
}
