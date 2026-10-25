// Ollendorff-style drills: chains of questions and answers built from the unit's own words, so the
// learner answers in full sentences and every answer exercises articles, cases and verb forms.
// The frames unlock with the course's grammar (accusative, dative, two-way prepositions, perfect...).
import * as DE from '../lang/de.js';
import * as IT from '../lang/it.js';
import { shuffle, sample } from '../core/text.js';
import { shortEn } from '../ui/word.js';
import * as G from './generate.js';

const cap = (s) => s[0].toUpperCase() + s.slice(1);

function concreteNouns(ctx, unit) {
  const unitNouns = unit.words.map((i) => ctx.get(i)).filter((e) => e?.p === 'n' && !e.adjn && e.g !== 'pl' && e.g !== 'mpl' && e.g !== 'fpl' && e.g !== 'mf' && !e.th.includes('abs'));
  const known = ctx.L.entries.filter((e) => e.p === 'n' && !e.adjn && ['m', 'f', 'n'].includes(e.g) && ctx.known(e.id) && !e.th.includes('abs') &&
    e.th.some((t) => ['home', 'food', 'clothes', 'city', 'travel', 'nature', 'school', 'money', 'tech', 'story', 'body'].includes(t)));
  return { unitNouns, known };
}

// The first answer is the right one; identical distractors (die Lampe is nominative and accusative) are dropped.
function q(question, answers, en, why, words) {
  const uniq = answers.filter((a, i) => answers.indexOf(a) === i);
  if (uniq.length < 2) return null;
  return { kind: 'cloze', scored: true, xp: 10, words, strict: true, label: 'Answer the question', explain: why,
    prompt: { text: question, en, qa: true }, options: shuffle(uniq.map((a, i) => ({ text: a, ok: i === 0 }))) };
}

// ---------- German ----------
function deDrills(ctx, unit) {
  const { unitNouns, known } = concreteNouns(ctx, unit);
  const pool = unitNouns.length >= 2 ? unitNouns : known;
  if (pool.length < 2) return [];
  const level = ctx.unitIndex;
  const out = [];
  const nouns = sample(pool, Math.min(6, pool.length), ctx.rnd);
  const other = (e) => sample(known.filter((x) => x.id !== e.id), 1, ctx.rnd)[0] || nouns.find((x) => x.id !== e.id);
  const NP = (e, c, det = 'def') => DE.nounPhrase(e, { c, det }).text;
  for (const e of nouns) {
    const o = other(e);
    // nominative identification (from the first unit)
    out.push(q(`Ist das ${NP(e, 'nom', 'indef')}?`, [`Ja, das ist ${NP(e, 'nom', 'indef')}.`, `Ja, das ist ${NP(e, 'akk', 'indef')}.`, `Ja, das ist ${NP(e, 'dat', 'indef')}.`],
      `Is that a ${shortEn(e)}? — Yes, that is a ${shortEn(e)}.`, `After "sein" (to be) the noun stays in the nominative: ${NP(e, 'nom', 'indef')}.`, [e.id]));
    if (level >= 8) { // accusative: haben + object, kein
      out.push(q(`Hast du ${NP(e, 'akk')}?`, [`Ja, ich habe ${NP(e, 'akk')}.`, `Ja, ich habe ${NP(e, 'nom')}.`, `Ja, ich habe ${NP(e, 'dat')}.`],
        `Do you have the ${shortEn(e)}? — Yes, I have the ${shortEn(e)}.`, `"haben" takes an accusative object: ${NP(e, 'akk')}.`, [e.id]));
      out.push(q(`Hast du ${NP(e, 'akk', 'indef')}?`, [`Nein, ich habe ${DE.nounPhrase(e, { c: 'akk', det: 'kein' }).text}.`, `Nein, ich habe nicht ${NP(e, 'akk', 'indef')}.`,
        `Nein, ich habe ${DE.nounPhrase(e, { c: 'nom', det: 'kein' }).text}.`], `Do you have a ${shortEn(e)}? — No, I don't have a ${shortEn(e)}.`,
      `A noun with "ein" is negated with "kein", which declines like "ein": ${DE.nounPhrase(e, { c: 'akk', det: 'kein' }).text}.`, [e.id]));
      if (o) out.push(q(`Hast du ${NP(e, 'akk')} oder ${NP(o, 'akk')}?`, [`Ich habe ${NP(o, 'akk')}.`, `Ich habe ${NP(o, 'nom')}.`, `Ich habe ${NP(o, 'dat')}.`],
        `Do you have the ${shortEn(e)} or the ${shortEn(o)}? — I have the ${shortEn(o)}.`, 'Ollendorff\'s classic either/or question: answer with the accusative.', [e.id, o.id]));
    }
    if (level >= 15) { // dative: giving to someone
      const people = ['Mann', 'Frau', 'Kind', 'Freund', 'Lehrer', 'Bruder', 'Schwester', 'Mutter', 'Vater'].map((l) => ctx.L.lemma(l, 'n')).filter(Boolean);
      const p = sample(people, 1, ctx.rnd)[0];
      if (p) out.push(q(`Wem gibst du ${NP(e, 'akk')}?`, [`Ich gebe ${NP(p, 'dat')} ${NP(e, 'akk')}.`, `Ich gebe ${NP(p, 'akk')} ${NP(e, 'akk')}.`, `Ich gebe ${NP(p, 'nom')} ${NP(e, 'akk')}.`],
        `Whom are you giving the ${shortEn(e)} to? — I'm giving the ${shortEn(p)} the ${shortEn(e)}.`, `The receiver (indirect object) is dative: ${NP(p, 'dat')}; the thing given is accusative.`, [e.id, p.id]));
    }
    if (level >= 17) { // two-way prepositions: wo? (dat) / wohin? (akk)
      const places = ['Tisch', 'Stuhl', 'Bett', 'Schrank', 'Boden', 'Regal', 'Sofa'].map((l) => ctx.L.lemma(l, 'n')).filter(Boolean);
      const pl = sample(places, 1, ctx.rnd)[0];
      if (pl && pl.id !== e.id) {
        out.push(q(`Wo ist ${NP(e, 'nom')}?`, [`${cap(NP(e, 'nom'))} ist auf ${NP(pl, 'dat')}.`, `${cap(NP(e, 'nom'))} ist auf ${NP(pl, 'akk')}.`, `${cap(NP(e, 'nom'))} ist auf ${NP(pl, 'nom')}.`],
          `Where is the ${shortEn(e)}? — It is on the ${shortEn(pl)}.`, '"Wo?" (where — location) → two-way prepositions take the dative.', [e.id, pl.id]));
        out.push(q(`Wohin legst du ${NP(e, 'akk')}?`, [`Ich lege ${NP(e, 'akk')} auf ${NP(pl, 'akk')}.`, `Ich lege ${NP(e, 'akk')} auf ${NP(pl, 'dat')}.`, `Ich lege ${NP(e, 'akk')} auf ${NP(pl, 'nom')}.`],
          `Where are you putting the ${shortEn(e)}? — I'm putting it on the ${shortEn(pl)}.`, '"Wohin?" (where to — movement) → two-way prepositions take the accusative.', [e.id, pl.id]));
      }
    }
    if (level >= 20) { // Perfekt
      const sehen = ctx.L.lemma('sehen', 'v');
      if (sehen) out.push(q(`Hast du ${NP(e, 'akk')} gesehen?`, [`Ja, ich habe ${NP(e, 'akk')} gesehen.`, `Ja, ich habe gesehen ${NP(e, 'akk')}.`, `Ja, ich bin ${NP(e, 'akk')} gesehen.`],
        `Have you seen the ${shortEn(e)}? — Yes, I have seen the ${shortEn(e)}.`, 'Perfekt: haben + past participle, and the participle goes to the END of the clause.', [e.id, sehen.id]));
    }
  }
  return sample(out.filter(Boolean), Math.min(12, out.filter(Boolean).length), ctx.rnd);
}

// ---------- Italian ----------
function itDrills(ctx, unit) {
  const { unitNouns, known } = concreteNouns(ctx, unit);
  const pool = unitNouns.length >= 2 ? unitNouns : known;
  if (pool.length < 2) return [];
  const level = ctx.unitIndex;
  const out = [];
  const nouns = sample(pool, Math.min(6, pool.length), ctx.rnd);
  const A = (e, n = 'sg') => IT.withArticle(e, n);
  const I = (e) => IT.joinArticle(IT.indefArticle(e.l, e.g), e.l);
  for (const e of nouns) {
    const o = sample(known.filter((x) => x.id !== e.id), 1, ctx.rnd)[0];
    const wrongArt = e.g === 'm' ? IT.joinArticle('la', e.l) : IT.joinArticle(IT.startsLo(e.l) ? 'lo' : 'il', e.l);
    out.push(q(`È ${I(e)}?`, [`Sì, è ${I(e)}.`, `Sì, è ${IT.joinArticle(e.g === 'm' ? (IT.startsVowel(e.l) ? "un'" : 'una') : 'un', e.l)}.`, `Sì, è ${wrongArt}.`],
      `Is it a ${shortEn(e)}? — Yes, it is a ${shortEn(e)}.`, `${cap(IT.genderHint(e).text)} So: ${I(e)}.`, [e.id]));
    out.push(q(`Hai ${A(e)}?`, [`Sì, ho ${A(e)}.`, `Sì, hai ${A(e)}.`, `Sì, ha ${A(e)}.`],
      `Do you have the ${shortEn(e)}? — Yes, I have the ${shortEn(e)}.`, '"Hai?" (do you have?) is answered with "ho" (I have). The h is silent.', [e.id]));
    out.push(q(`Hai ${A(e)}?`, [`No, non ho ${A(e)}.`, `No, ho non ${A(e)}.`, `Non, ho ${A(e)}.`],
      `Do you have the ${shortEn(e)}? — No, I don't have the ${shortEn(e)}.`, '"non" always goes directly before the verb.', [e.id]));
    if (o) out.push(q(`Hai ${A(e)} o ${A(o)}?`, [`Ho ${A(o)}.`, `Ho ${IT.joinArticle(o.g === 'm' ? 'la' : 'il', o.l)}.`, `Hai ${A(o)}.`],
      `Do you have the ${shortEn(e)} or the ${shortEn(o)}? — I have the ${shortEn(o)}.`, "Ollendorff's either/or question.", [e.id, o.id]));
    if (level >= 12 && e.pl && !e.inv) {
      out.push(q(`Dove sono ${A(e, 'pl')}?`, [`${cap(A(e, 'pl'))} sono sul tavolo.`, `${cap(A(e, 'pl'))} è sul tavolo.`, `${cap(A(e, 'pl'))} sono sulla tavolo.`],
        `Where are the ${shortEn(e)}s? — They are on the table.`, 'Plural subject → "sono"; su + il = sul (il tavolo is masculine).', [e.id]));
    }
    if (level >= 12) {
      out.push(q(`Di chi è ${A(e)}?`, [`È ${A(e)} di mio fratello.`, `È ${A(e)} del mio fratello.`, `Sono ${A(e)} di mio fratello.`],
        `Whose is the ${shortEn(e)}? — It's my brother's.`, 'Family members in the singular take no article after a possessive: mio fratello (not il mio fratello).', [e.id]));
    }
    if (level >= 17) {
      const pp = e.g === 'f' ? 'comprata' : 'comprato';
      out.push(q(`Hai comprato ${A(e)}?`, [`Sì, l'ho ${pp}.`, `Sì, ho ${A(e)} comprato.`, `Sì, sono comprato ${A(e)}.`],
        `Did you buy the ${shortEn(e)}? — Yes, I bought it.`, `Passato prossimo with avere; with lo/la before "ho" the pronoun elides (l'ho) and the participle agrees: ${pp}.`, [e.id]));
    }
  }
  return sample(out.filter(Boolean), Math.min(12, out.filter(Boolean).length), ctx.rnd);
}

export function buildDrill(ctx, unit, opts = {}) {
  const qa = ctx.lang === 'de' ? deDrills(ctx, unit) : itDrills(ctx, unit);
  const out = [{ kind: 'tip', scored: false, chapterTitle: 'Question and answer', title: ctx.lang === 'de' ? 'Frage und Antwort' : 'Domanda e risposta',
    html: '<p>In the 1830s, H. G. Ollendorff taught languages through chains of simple questions answered in full sentences — the learner reuses each new word at once in a grammatical frame.</p><p>Answer each question in a whole sentence. Watch the article and the case.</p>' }];
  out.push(...qa);
  // a few engine drills on the unit's verbs and nouns
  const verbs = unit.words.map((i) => ctx.get(i)).filter((e) => e?.p === 'v' && e.v?.t);
  for (const v of sample(verbs, 3, ctx.rnd)) out.push(G.verbForm(ctx, v));
  const nouns = unit.words.map((i) => ctx.get(i)).filter((e) => e?.p === 'n');
  for (const n of sample(nouns, 2, ctx.rnd)) out.push(ctx.lang === 'de' ? G.caseEnding(ctx, n, { cases: ctx.unitIndex >= 15 ? ['akk', 'dat'] : ['nom', 'akk'] }) : G.artPrepEx(ctx, n));
  return out.filter(Boolean);
}
