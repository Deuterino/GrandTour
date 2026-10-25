// Tap-a-word analysis: tokenize, look up every word form, then use context to rank the readings.
import { tokenize } from '../core/text.js';
import * as DE from './de.js';
import * as IT from './it.js';

const POS_NAMES = { n: 'noun', v: 'verb', a: 'adjective', adv: 'adverb', pron: 'pronoun', prep: 'preposition', conj: 'conjunction',
  art: 'article', det: 'determiner', num: 'number', intj: 'interjection', part: 'particle', phr: 'phrase' };
const PERSON_EN = ['1st person singular', '2nd person singular', '3rd person singular', '1st person plural', '2nd person plural', '3rd person plural'];
const DE_PERSON = ['ich', 'du', 'er/sie/es', 'wir', 'ihr', 'sie/Sie'];
const IT_PERSON = ['io', 'tu', 'lui/lei', 'noi', 'voi', 'loro'];
const DE_TENSE = { pres: 'present (Präsens)', pret: 'simple past (Präteritum)', k1: 'subjunctive I (Konjunktiv I)', k2: 'subjunctive II (Konjunktiv II): would / were' };
const IT_TENSE = { pres: 'presente (present)', impf: 'imperfetto (was …ing / used to)', rem: 'passato remoto (historic past)',
  fut: 'futuro (future)', cond: 'condizionale (would)', cong: 'congiuntivo presente (subjunctive)', congi: 'congiuntivo imperfetto (past subjunctive)' };
const CASE_EN = { nom: 'nominative', akk: 'accusative', dat: 'dative', gen: 'genitive' };
const G_EN = { m: 'masculine', f: 'feminine', n: 'neuter', pl: 'plural' };
const DE_PREP_CASE = {
  durch: ['akk'], für: ['akk'], gegen: ['akk'], ohne: ['akk'], um: ['akk'], bis: ['akk'], entlang: ['akk'],
  aus: ['dat'], bei: ['dat'], mit: ['dat'], nach: ['dat'], seit: ['dat'], von: ['dat'], zu: ['dat'], gegenüber: ['dat'], außer: ['dat'],
  wegen: ['gen'], trotz: ['gen'], während: ['gen'], statt: ['gen'], innerhalb: ['gen'], außerhalb: ['gen'],
  an: ['dat', 'akk'], auf: ['dat', 'akk'], hinter: ['dat', 'akk'], in: ['dat', 'akk'], neben: ['dat', 'akk'], über: ['dat', 'akk'],
  unter: ['dat', 'akk'], vor: ['dat', 'akk'], zwischen: ['dat', 'akk'],
};

export function posName(p) { return POS_NAMES[p] || p; }

export function describeTag(tag, lang) {
  const [kind, rest = ''] = tag.split(':');
  const parts = rest.split('.');
  if (kind === 'X' && rest === 'number') return 'cardinal number';
  if (kind === 'X' && rest === 'phrase') return 'set phrase: learn it as a whole';
  if (kind === 'X' && rest === 'ordinal') return 'ordinal number (takes adjective endings)';
  if (lang === 'de') {
    if (kind === 'N') {
      if (parts[0] === 'adjn') return 'adjectival noun (declines like an adjective)';
      if (parts[0] === 'dim') return 'diminutive (-chen / -lein): always das, plural unchanged';
      if (parts[0] === 'fem') return parts[1] === 'pl' ? 'feminine plural (die …innen)' : 'feminine form of this noun (die …in)';
      if (parts[0] === 'pl') return 'plural';
      return `${CASE_EN[parts[0]] || parts[0]} ${parts[1] === 'pl' ? 'plural' : 'singular'}`;
    }
    if (kind === 'V') {
      const [t, p, sep] = parts;
      if (t === 'inf') return 'infinitive';
      if (t === 'pp') return { adj: 'past participle used as an adjective', passive: 'passive participle of werden: ist … worden = has been …' }[p] || 'past participle (Perfekt: hat/ist + participle)';
      if (t === 'p1') return 'present participle (-ing form)';
      if (t === 'zu') return 'zu-infinitive';
      if (t === 'imp') return `imperative (${p === '0' ? 'du' : 'ihr'})${sep === 'sep' ? ', separable prefix goes to the end' : ''}`;
      const base = `${PERSON_EN[+p]} (${DE_PERSON[+p]}) · ${DE_TENSE[t] || t}`;
      if (sep === 'sep') return `${base} · main clause: the separable prefix stands at the end`;
      if (sep === 'sub') return `${base} · subordinate clause: prefix attached`;
      return base;
    }
    if (kind === 'A') {
      return { pos: 'adjective (no ending: after sein/werden or as an adverb)', 'pos.decl': 'adjective with case ending', cmp: 'comparative',
        'cmp.decl': 'comparative with case ending', sup: 'superlative' }[rest] || 'adjective';
    }
    if (kind === 'D') return `${CASE_EN[parts[0]]} ${G_EN[parts[1]]}${parts[1] === 'pl' ? '' : ' singular'}`;
    if (kind === 'P') return `${rest.replace('akk', 'accusative').replace('dat', 'dative').replace('nom', 'nominative').replace('gen', 'genitive')}`;
    if (kind === 'C') { const [p, a] = rest.split('+'); return `contraction of ${p} + ${a}`; }
    return '';
  }
  if (kind === 'V') {
    const [t, p] = parts;
    if (t === 'inf') return 'infinitive';
    if (t === 'pp') return p ? `past participle (${{ a: 'feminine singular', i: 'masculine plural', e: 'feminine plural' }[p]})` : 'past participle (ho/sono + participle)';
    if (t === 'ger') return 'gerund (-ing form; sto + gerund = I am …ing)';
    if (t === 'imp') return `imperative (${IT.IMP_PERSONS[+p]})`;
    return `${PERSON_EN[+p]} (${IT_PERSON[+p]}) · ${IT_TENSE[t] || t}`;
  }
  if (kind === 'N') return { sg: 'singular', pl: 'plural', 'pl.f': 'feminine plural' }[rest] || '';
  if (kind === 'P' && rest === 'comb') return 'form of mi / ti / ci / vi / si before lo, la, li, le, ne (me lo, te la, ce ne…)';
  if (kind === 'A') {
    const G = { ms: 'masculine singular', fs: 'feminine singular', mp: 'masculine plural', fp: 'feminine plural',
      s: 'singular (masculine and feminine)', p: 'plural (masculine and feminine)' };
    if (parts[0] === 'sup') return `absolute superlative (-issimo = very …)${parts[1] ? ', ' + G[parts[1]] : ''}`;
    if (rest === 'adv') return 'adverb made from this adjective with -mente (≈ English -ly)';
    if (rest === 'alt') return 'altered form (-ino, -etto, -one, -accio…)';
    return G[rest] || '';
  }
  if (kind === 'D') return `article: ${rest}`;
  if (kind === 'C') { const [p, a] = rest.split('+'); return `${p} + ${a} (preposition joined with the article)`; }
  if (kind === 'X' && rest === 'short') return 'shortened / elided form';
  return '';
}

// Group raw form hits by entry: [{ entry, tags: [...], labels: [...] }]
function group(L, hits) {
  const by = new Map();
  for (const h of hits) {
    const e = L.get(h.id);
    if (!e) continue;
    if (!by.has(e.id)) by.set(e.id, { entry: e, tags: [], score: 0, notes: [] });
    by.get(e.id).tags.push(h.tag);
  }
  return [...by.values()];
}

function isNounCand(c) { return c.entry.p === 'n'; }

// Analyse a whole text once; returns tokens with .cands (sorted best first).
export function analyzeText(text, L) {
  const tokens = tokenize(text, L.lang);
  const words = tokens.map((t, i) => ({ ...t, i })).filter((t) => t.k === 'w');
  for (const w of words) w.cands = lookupWord(w.t, L);
  markPhrases(words, L);
  if (L.lang === 'de') contextDE(tokens, words, L);
  else contextIT(tokens, words, L);
  for (const w of words) w.cands.sort((a, b) => b.score - a.score);
  return tokens.map((t, i) => words.find((w) => w.i === i) || t);
}

// Multi-word entries (guten Tag, auf Wiedersehen, per favore, d'accordo) indexed by their first word.
function phraseIndex(L) {
  if (L._phrases) return L._phrases;
  const idx = new Map();
  for (const e of L.entries) {
    if (e.x || e.l.startsWith('sich ')) continue;
    const ws = tokenize(e.l, L.lang).filter((t) => t.k === 'w').map((t) => t.t.toLowerCase());
    if (ws.length < 2) continue;
    if (!idx.has(ws[0])) idx.set(ws[0], []);
    idx.get(ws[0]).push({ ws, e });
  }
  for (const list of idx.values()) list.sort((a, b) => b.ws.length - a.ws.length);
  L._phrases = idx;
  return idx;
}

// Every word inside a known phrase also gets the phrase itself as its first reading.
function markPhrases(words, L) {
  const idx = phraseIndex(L);
  for (let i = 0; i < words.length; i++) {
    const ph = (idx.get(words[i].t.toLowerCase()) || []).find((p) => p.ws.every((w, j) => words[i + j]?.t.toLowerCase() === w));
    if (!ph) continue;
    for (let j = 0; j < ph.ws.length; j++) {
      words[i + j].cands.unshift({ entry: ph.e, tags: ['X:phrase'], score: 2, notes: [`Part of the phrase “${ph.e.l}”.`] });
    }
    i += ph.ws.length - 1;
  }
}

// All readings of one word, without context.
export function lookupWord(word, L) {
  let cands = group(L, L.lookupForm(word));
  if (L.lang === 'it') {
    if (!cands.length) cands = cliticReadings(word, L);
    // Alzati! = alza + ti, besides the participle alzati
    else if (/(mi|ti|si|ci|vi|lo|la|li|le|gli|ne)$/i.test(word)) cands.push(...cliticReadings(word, L, true));
  }
  if (!cands.length && L.lang === 'it') cands = superlativeReadings(word, L);
  if (!cands.length) {
    for (const alt of L.engine.spellingCandidates(word)) {
      const c = group(L, L.lookupForm(alt));
      if (c.length) {
        c.forEach((x) => x.notes.push(`Old spelling of “${alt}”.`));
        cands = c;
        break;
      }
    }
  }
  const archaic = L.engine.ARCHAIC[word] || L.engine.ARCHAIC[word.toLowerCase()];
  if (!cands.length && archaic) {
    const [lemma, note] = archaic;
    const e = L.lemma(lemma, 'v') || L.lemma(lemma);
    if (e) cands = [{ entry: e, tags: [], score: 0, notes: [note] }];
  }
  // geht's, gibt's, hab's: colloquial verb + es
  if (!cands.length && L.lang === 'de' && /['’]s$/.test(word)) {
    const base = word.slice(0, -2);
    cands = group(L, L.lookupForm(base));
    cands.forEach((x) => x.notes.push(`${word} = ${base} es (colloquial).`));
  }
  // educated guesses below give way to the extended dictionary when it knows the word (marina is not "little sea")
  const guess = !cands.length && !(L.ext && L.ext.lookup(word).length);
  if (guess && L.lang === 'it') cands = shortenedReadings(word, L);
  if (guess && !cands.length && L.lang === 'it') cands = adverbReadings(word, L);
  if (guess && !cands.length && L.lang === 'it') cands = alteratoReadings(word, L);
  if (guess && !cands.length && L.lang === 'de') cands = diminutiveReadings(word, L);
  if (!cands.length && L.lang === 'de' && /^[A-ZÄÖÜ]/.test(word) && word.length > 6) {
    const comp = DE.splitCompound(word, (w, any) => {
      const list = L.byLemma.get(w) || [];
      return any ? list[0] : list.find((x) => x.p === 'n');
    });
    if (comp) cands = [{ entry: comp.head, tags: ['N:compound'], score: 0, notes: [`Compound: ${comp.parts.join(' + ')} → ${DE.DEF[comp.head.g === 'pl' ? 'pl' : comp.head.g][0]} ${word}`], compound: comp }];
  }
  if (!cands.length) {
    const num = L.engine.parseNumber(word);
    if (num) cands = [numberReading(word, num, L.lang)];
  }
  for (const c of cands) c.score = c.score || 0;
  return cands;
}

// Büchlein, Kätzchen: a synthetic neuter entry pointing back to the base noun
function diminutiveReadings(word, L) {
  for (const base of DE.diminutiveBases(word)) {
    const noun = (L.byLemma.get(base.toLowerCase()) || []).find((x) => x.p === 'n' && x.l === base && x.g !== 'pl');
    if (!noun) continue;
    const entry = { id: `#dim:${word}`, l: word, p: 'n', g: 'n', pl: word, en: `little ${noun.en.split(/[;,(]/)[0].trim()}`, syn: 1,
      n: `Diminutive of ${DE.DEF[noun.g][0]} ${noun.l}. -chen and -lein make things small (or dear), often add an umlaut, and are always neuter: das ${word}, die ${word}.` };
    return [{ entry, tags: ['N:dim'], score: 0, notes: [] }];
  }
  return [];
}

// vien → viene, far → fare, pover' → povero
function shortenedReadings(word, L) {
  for (const alt of IT.truncationCandidates(word)) {
    const c = group(L, L.lookupForm(alt));
    if (c.length) {
      c.forEach((x) => x.notes.push(`Shortened form of “${alt}”.`));
      return c;
    }
  }
  return [];
}

// lentamente → lento + -mente
function adverbReadings(word, L) {
  for (const base of IT.menteBases(word)) {
    const hits = L.lookupForm(base).filter((h) => L.get(h.id)?.p === 'a');
    if (hits.length) {
      const e = L.get(hits[0].id);
      return [{ entry: e, tags: ['A:adv'], score: 0, notes: [`${word.toLowerCase()} = ${base} + -mente.`] }];
    }
  }
  return [];
}

// gattini → gatto + -ino; adjectives (piccolino) point straight at the base adjective
function alteratoReadings(word, L) {
  for (const { base, label, sense, en, g, plural, sg } of IT.alteratoBases(word)) {
    const e = (L.byLemma.get(base) || []).find((x) => (x.p === 'n' || x.p === 'a') && x.l === base);
    if (!e) continue;
    const note = `Looks like ${base} + ${label} (${sense}). Many such words also have a meaning of their own.`;
    if (e.p === 'a') return [{ entry: e, tags: ['A:alt'], score: 0, notes: [note] }];
    const entry = { id: `#alt:${sg}`, l: sg, p: 'n', g, en: `${en} ${e.en.split(/[;,(]/)[0].trim()}`, syn: 1, n: note };
    if (plural) entry.pl = word.toLowerCase();
    return [{ entry, tags: [plural ? 'N:pl' : 'N:sg'], score: 0, notes: [] }];
  }
  return [];
}

function superlativeReadings(word, L) {
  for (const { base, g } of IT.superlativeBases(word)) {
    const e = (L.byLemma.get(base) || []).find((x) => x.p === 'a' || x.p === 'adv' || x.a);
    if (e) return [{ entry: e, tags: [e.p === 'adv' ? 'A:sup' : `A:sup.${g}`], score: 0, notes: [`${word.toLowerCase()} = ${base} + -issimo (“very …”, “extremely …”).`] }];
  }
  return [];
}

const ordinalEn = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n.toLocaleString('en-US') + (s[(v - 20) % 10] || s[v] || s[0]); };

// Compound numbers are written as one word and are not in the lexicon: build a reading on the fly (entry.syn = synthetic).
function numberReading(word, { value, ordinal }, lang) {
  const n = ordinal ? ordinalEn(value) : value.toLocaleString('en-US');
  const note = lang === 'de'
    ? (ordinal ? 'Ordinals take adjective endings: der zwanzigste Mai, am einundzwanzigsten Juni.' : 'German says the units first: einundzwanzig = “one-and-twenty”. Numbers below a million are one word.')
    : (ordinal ? 'Ordinals agree like adjectives: il ventesimo secolo, la ventesima volta.' : 'Compound numbers are one word: venti + uno → ventuno, venti + tre → ventitré, due + mila → duemila.');
  const entry = { id: `#num:${word.toLowerCase()}`, l: word.toLowerCase(), p: 'num', en: ordinal ? `${n} (ordinal)` : n, n: note, syn: 1 };
  return { entry, tags: [ordinal ? 'X:ordinal' : 'X:number'], score: 0, notes: [] };
}

// Verb + attached pronouns. nonFinite: only imperative / infinitive / gerund bases (for words that also have a direct reading: alzati).
function cliticReadings(word, L, nonFinite = false) {
  for (const { base, clitics } of IT.splitClitics(word)) {
    if (nonFinite && (base.length < 4 || base.endsWith("'"))) continue;
    let hits = L.lookupForm(base).filter((h) => L.get(h.id)?.p === 'v' || L.get(h.id)?.l === 'ecco'); // eccolo, eccomi
    if (nonFinite) hits = hits.filter((h) => /^V:(imp|inf|ger)/.test(h.tag));
    if (!hits.length) continue;
    const c = group(L, hits);
    c.forEach((x) => {
      x.notes.push(`${base} + ${clitics.join(' + ')}: ${clitics.map((k) => `${k} = ${IT.CLITIC_MEANING[k] || k}`).join('; ')}`);
      // disselo, vedesi: old writers attached pronouns to conjugated verbs too
      if (x.tags.every((t) => /^V:(pres|impf|rem|fut|cond|cong|congi)\.\d/.test(t))) {
        x.notes.push(`Old literary style: pronoun attached to a conjugated verb. Today: ${clitics.join(' ')} ${base}.`);
      }
    });
    return c;
  }
  return [];
}

function contextDE(tokens, words, L) {
  // sentence starts: first word after . ! ? or at text start
  let sentStart = true;
  for (const t of tokens) {
    if (t.k === 'w') { t.sentStart = sentStart; sentStart = false; }
    else if (t.k === 'p' && /[.!?:]/.test(t.t)) sentStart = true;
  }
  words.forEach((w, wi) => {
    const next = words[wi + 1], prev = words[wi - 1];
    const prevTok = tokens[w.i - 1]?.k === 's' ? tokens[w.i - 2] : tokens[w.i - 1];
    for (const c of w.cands) {
      if (/^[A-ZÄÖÜ]/.test(w.t) && !w.sentStart) c.score += isNounCand(c) ? 3 : (c.entry.l === 'Sie' ? 3 : -1);
      if (/^[a-zäöüß]/.test(w.t) && isNounCand(c)) c.score -= 3;
    }
    // articles and der-words: narrow case/gender from the noun and a governing preposition
    const art = w.cands.find((c) => ['art', 'det'].includes(c.entry.p) && c.tags.some((t) => t.startsWith('D:')));
    if (art) {
      const noun = [next, words[wi + 2]].find((x) => x && x.cands.some(isNounCand));
      const nounCand = noun?.cands.find(isNounCand);
      const prep = prev && DE_PREP_CASE[prev.t.toLowerCase()];
      const allTags = art.tags.filter((t) => t.startsWith('D:'));
      art.tags = allTags.filter((t) => {
        const [c, g] = t.slice(2).split('.');
        if (nounCand) {
          const ng = nounCand.entry.g;
          const plural = nounCand.tags.every((x) => x.includes('.pl') || x === 'N:pl') || ng === 'pl';
          if (plural ? g !== 'pl' : g !== ng) return false;
        }
        if (prep && !prep.includes(c)) return false;
        return true;
      });
      if (!art.tags.length) art.tags = allTags;
      art.score += 2;
      if (prep?.length === 2) art.notes.push(`After “${prev.t}” (two-way preposition): dative for location (where?), accusative for direction (where to?).`);
      else if (prep) art.notes.push(`“${prev.t}” always takes the ${CASE_EN[prep[0]]}.`);
      // relative pronoun: comma before, no noun right after
      if (prevTok?.t === ',' && !(next && next.cands.some(isNounCand))) {
        art.notes.push('Here probably a relative pronoun (who / which / that): it sends the verb to the end of the clause.');
      }
    }
    // sein: possessive before a noun, verb otherwise
    if (w.t.toLowerCase() === 'sein' && next?.cands.some(isNounCand)) for (const c of w.cands) if (c.entry.p === 'det') c.score += 3;
  });
  // separable verbs: prefix at the end of a clause
  let clause = [];
  const flush = () => {
    if (clause.length < 2) { clause = []; return; }
    const last = clause[clause.length - 1];
    const pre = last.t.toLowerCase();
    const byWord = DE.SEP_PREFIXES.includes(pre) && L.sepIndex().get(pre);
    if (byWord) {
      for (const w of clause.slice(0, -1)) {
        for (const e of byWord.get(w.t) || []) {
          let c = w.cands.find((x) => x.entry.id === e.id);
          if (!c) { c = { entry: e, tags: [], score: 0, notes: [] }; w.cands.push(c); }
          c.score += 6;
          c.notes.push(`Separable verb ${DE.infinitive(e)}: “${w.t} … ${last.t}”.`);
          const tags = L.lookupForm(w.t).filter((h) => h.id === e.id).map((h) => h.tag);
          if (tags.length) c.tags = tags;
          last.cands = last.cands || [];
          last.cands.unshift({ entry: e, tags: [], score: 10, notes: [`Separable prefix of ${DE.infinitive(e)} (${w.t} … ${last.t}).`] });
        }
      }
    }
    clause = [];
  };
  const wordAt = new Map(words.map((w) => [w.i, w]));
  tokens.forEach((t, i) => {
    if (t.k === 'w') clause.push(wordAt.get(i));
    else if (t.k === 'p' && /[.,;:!?–—()]/.test(t.t)) flush();
  });
  flush();
  // a separable verb's finite form without its prefix in the clause is an unlikely reading (ging ≠ ausgehen)
  for (const w of words) for (const c of w.cands) {
    if (c.tags.length && c.tags.every((t) => t.endsWith('.sep')) && !c.notes.some((n) => n.startsWith('Separable verb'))) c.score -= 5;
  }
}

function contextIT(tokens, words, L) {
  words.forEach((w, wi) => {
    const next = words[wi + 1];
    const low = w.t.toLowerCase();
    // la / lo / le / li / gli: article before a noun or adjective, pronoun before a verb
    if (['la', 'lo', 'le', 'li', 'gli', "l'"].includes(low) && next) {
      const nextIsVerb = next.cands.length && next.cands.every((c) => c.entry.p === 'v');
      for (const c of w.cands) {
        if (c.entry.p === 'art') c.score += nextIsVerb ? -3 : 3;
        if (c.entry.p === 'pron') c.score += nextIsVerb ? 4 : -1;
      }
      if (!nextIsVerb && low === "l'") {
        const noun = next.cands.find(isNounCand);
        if (noun) for (const c of w.cands) if (c.entry.p === 'art') c.notes.push(`Elided article before a vowel: ${IT.GENDER_NAMES[noun.entry.g] || ''} (${noun.entry.l}).`);
      }
    }
    // me lo, te la, ce ne: mi/ti/ci/vi before lo, la, li, le, ne (se lo is ambiguous with "if", so "se" only gets a second reading)
    if (['me', 'te', 'ce', 've', 'se'].includes(low)) {
      const pair = next && ['lo', 'la', 'li', 'le', 'ne', "l'"].includes(next.t.toLowerCase());
      for (const c of w.cands) if (c.tags.includes('P:comb')) c.score += pair ? (low === 'se' ? -0.5 : 3) : -3;
    }
    // Alzati! Fermati! — the imperative + pronoun reading wins in exclamations
    const bang = tokens.slice(w.i + 1).find((t) => t.k === 'p' && /[.!?]/.test(t.t));
    if (bang?.t.includes('!')) for (const c of w.cands) if (c.tags.some((t) => t.startsWith('V:imp'))) c.score += 1;
    if (low === 'si' && next?.cands.some((c) => c.entry.p === 'v')) {
      for (const c of w.cands) c.notes.push('si + verb: reflexive (himself/herself), reciprocal (each other) or impersonal (one, people).');
    }
    // capitalized Lei mid-sentence = formal you
    if (w.t === 'Lei' && wi > 0) for (const c of w.cands) if (c.entry.l === 'lei') c.notes.push('Capital Lei = formal “you” (verb in the 3rd person).');
    for (const c of w.cands) if (c.entry.p === 'v' && next && next.cands.some((x) => x.entry.p === 'v' && x.tags.some((t) => t.startsWith('V:pp')))) {
      if (['essere', 'avere'].includes(c.entry.l)) c.notes.push('Auxiliary verb: forms a compound tense with the participle that follows.');
    }
  });
}

// Plain-English summary used in popups.
export function explain(c, lang) {
  const e = c.entry;
  const labels = [...new Set((c.tags || []).map((t) => describeTag(t, lang)).filter(Boolean))];
  return { pos: posName(e.p), labels, notes: c.notes || [] };
}
