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
  if (lang === 'de') {
    if (kind === 'N') {
      if (parts[0] === 'adjn') return 'adjectival noun (declines like an adjective)';
      if (parts[0] === 'pl') return 'plural';
      return `${CASE_EN[parts[0]] || parts[0]} ${parts[1] === 'pl' ? 'plural' : 'singular'}`;
    }
    if (kind === 'V') {
      const [t, p, sep] = parts;
      if (t === 'inf') return 'infinitive';
      if (t === 'pp') return p === 'adj' ? 'past participle used as an adjective' : 'past participle (Perfekt: hat/ist + participle)';
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
  if (kind === 'A') return { ms: 'masculine singular', fs: 'feminine singular', mp: 'masculine plural', fp: 'feminine plural', sup: 'absolute superlative (very …)' }[rest] || '';
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
  if (L.lang === 'de') contextDE(tokens, words, L);
  else contextIT(tokens, words, L);
  for (const w of words) w.cands.sort((a, b) => b.score - a.score);
  return tokens.map((t, i) => words.find((w) => w.i === i) || t);
}

// All readings of one word, without context.
export function lookupWord(word, L) {
  let cands = group(L, L.lookupForm(word));
  if (!cands.length && L.lang === 'it') cands = cliticReadings(word, L);
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
  if (!cands.length && L.lang === 'de' && DE.ARCHAIC[word]) {
    const [lemma, note] = DE.ARCHAIC[word];
    const e = L.lemma(lemma, 'v') || L.lemma(lemma);
    if (e) cands = [{ entry: e, tags: [], score: 0, notes: [note] }];
  }
  if (!cands.length && L.lang === 'de' && /^[A-ZÄÖÜ]/.test(word) && word.length > 6) {
    const comp = DE.splitCompound(word, (w, any) => {
      const list = L.byLemma.get(w) || [];
      return any ? list[0] : list.find((x) => x.p === 'n');
    });
    if (comp) cands = [{ entry: comp.head, tags: ['N:compound'], score: 0, notes: [`Compound: ${comp.parts.join(' + ')} → ${DE.DEF[comp.head.g === 'pl' ? 'pl' : comp.head.g][0]} ${word}`], compound: comp }];
  }
  for (const c of cands) c.score = c.score || 0;
  return cands;
}

function cliticReadings(word, L) {
  for (const { base, clitics } of IT.splitClitics(word)) {
    const hits = L.lookupForm(base);
    if (hits.length) {
      const c = group(L, hits).filter((x) => x.entry.p === 'v');
      if (c.length) {
        c.forEach((x) => x.notes.push(`${base} + ${clitics.join(' + ')}: ${clitics.map((k) => `${k} = ${IT.CLITIC_MEANING[k] || k}`).join('; ')}`));
        return c;
      }
    }
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
      const allTags = art.tags;
      art.tags = art.tags.filter((t) => {
        const [, rest] = t.split(':');
        const [c, g] = rest.split('.');
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
