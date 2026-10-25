// Engine tests against the real lexicons. Run with:
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc -m tests/engine_test.mjs
// (from the repository root; jsc's read() loads the JSON files)
import { LangData } from '../app/js/core/data.js';
import * as DE from '../app/js/lang/de.js';
import * as IT from '../app/js/lang/it.js';
import { analyzeText, explain } from '../app/js/lang/analyzer.js';
import { checkAnswer, scoreSpeech, tokenize } from '../app/js/core/text.js';
import * as SRS from '../app/js/core/srs.js';

const de = new LangData('de', JSON.parse(read('app/data/de/lexicon.json')));
const it = new LangData('it', JSON.parse(read('app/data/it/lexicon.json')));

let pass = 0, fail = 0;
function eq(got, want, label) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; print(`FAIL ${label}\n   got:  ${JSON.stringify(got)}\n   want: ${JSON.stringify(want)}`); }
}
const D = (id) => de.get(id) || (() => { throw new Error('no de ' + id); })();
const I = (id) => it.get(id) || (() => { throw new Error('no it ' + id); })();

// ---- German noun phrases ----
eq(DE.nounPhrase(D('Mann'), { c: 'akk', det: 'def', adj: D('alt') }).text, 'den alten Mann', 'akk def adj');
eq(DE.nounPhrase(D('Kind'), { c: 'dat', det: 'indef', adj: D('klein') }).text, 'einem kleinen Kind', 'dat indef');
eq(DE.nounPhrase(D('Wasser'), { c: 'nom', det: 'none', adj: D('kalt') }).text, 'kaltes Wasser', 'strong n');
eq(DE.nounPhrase(D('Schuh'), { c: 'nom', number: 'pl', det: 'mein', adj: D('neu') }).text, 'meine neuen Schuhe', 'poss pl');
eq(DE.nounPhrase(D('Haus'), { c: 'dat', number: 'pl', det: 'def' }).text, 'den Häusern', 'dat pl -n');
eq(DE.nounPhrase(D('Mensch'), { c: 'akk', det: 'def' }).text, 'den Menschen', 'weak noun');
eq(DE.nounPhrase(D('Berg'), { c: 'nom', det: 'indef', adj: D('hoch') }).text, 'ein hoher Berg', 'hoch → hoh');
eq(DE.nounPhrase(D('Auto'), { c: 'nom', det: 'indef', adj: D('teuer') }).text, 'ein teures Auto', 'teuer → teur');
eq(DE.nounPhrase(D('Frau'), { c: 'gen', det: 'dieser', adj: D('jung') }).text, 'dieser jungen Frau', 'der-word gen');
eq(DE.nounPhrase(D('Eltern'), { c: 'dat', det: 'euer' }).text, 'euren Eltern', 'euer → eur');
eq(DE.article('def', 'n', 'gen'), 'des', 'des');

// ---- German verbs ----
eq(DE.conjugate(D('fahren'), 'pres', 2), 'fährt', 'fährt');
eq(DE.conjugate(D('fahren'), 'perf', 0), 'habe gefahren / bin gefahren', 'fahren h/s');
eq(DE.conjugate(D('gehen'), 'perf', 3), 'sind gegangen', 'sind gegangen');
eq(DE.conjugate(D('anrufen'), 'pres', 0), 'rufe an', 'rufe an');
eq(DE.finite(D('anrufen'), 'pres', 0, 'sub'), 'anrufe', 'sub clause');
eq(DE.conjugate(D('anrufen'), 'perf', 1), 'hast angerufen', 'hast angerufen');
eq(DE.conjugate(D('sich freuen'), 'pres', 0), 'freue mich', 'freue mich');
eq(DE.conjugate(D('sich freuen'), 'perf', 2), 'hat sich gefreut', 'hat sich gefreut');
eq(DE.conjugate(D('sich anziehen'), 'pres', 1), 'ziehst dich an', 'ziehst dich an');
eq(DE.conjugate(D('gehen'), 'fut1', 1), 'wirst gehen', 'future');
eq(DE.conjugate(D('gehen'), 'k2past', 0), 'wäre gegangen', 'k2 past');
eq(DE.conjugate(D('machen'), 'wuerde', 4), 'würdet machen', 'würde');
eq(DE.conjugate(D('helfen'), 'imp', 1), 'hilf!', 'imp du');
eq(DE.conjugate(D('anrufen'), 'imp', 5), 'rufen Sie an!', 'imp Sie sep');
eq(DE.principalParts(D('gehen')).text, 'gehen – geht – ging – ist gegangen', 'principal parts');
eq(DE.irregularCells(D('fahren'), 'pres'), [false, true, true, false, false, false], 'fahren irregular cells');
eq(DE.irregularCells(D('machen'), 'pres'), [false, false, false, false, false, false], 'machen regular');
eq(DE.irregularCells(D('arbeiten'), 'pres'), [false, false, false, false, false, false], 'arbeiten e-insertion');

// ---- German gender hints / plurals ----
const findNoun = (w, any) => { const l = de.byLemma.get(w) || []; return any ? l[0] : l.find((x) => x.p === 'n'); };
eq(DE.genderHint(D('Zeitung'), findNoun).follows, true, 'Zeitung rule');
eq(DE.genderHint(D('Mädchen'), findNoun).follows, true, 'Mädchen -chen');
eq(DE.pluralClass(D('Haus')), '¨-er', 'Häuser');
eq(DE.pluralClass(D('Tag')), '-e', 'Tage');
eq(DE.pluralClass(D('Frau')), '-en', 'Frauen');
eq(DE.pluralClass(D('Lehrer')), '– (no change)', 'Lehrer');
eq(DE.pluralClass(D('Apfel')), '¨ (umlaut only)', 'Äpfel');
const comp = DE.splitCompound('Haustür', findNoun);
eq(comp && comp.parts, ['das Haus', 'die Tür'], 'compound');

// ---- Italian ----
eq(IT.withArticle(I('libro')), 'il libro', 'il libro');
eq(IT.withArticle(I('zio')), 'lo zio', 'lo zio');
eq(IT.withArticle(I('amico')), "l'amico", "l'amico");
eq(IT.withArticle(I('amico'), 'pl'), 'gli amici', 'gli amici');
eq(IT.withArticle(I('studente'), 'pl'), 'gli studenti', 'gli studenti');
eq(IT.withArticle(I('uovo'), 'pl'), 'le uova', 'le uova');
eq(IT.withArticle(I('yogurt')), 'lo yogurt', 'lo yogurt');
eq(IT.withArticle(I('acqua')), "l'acqua", "l'acqua");
eq(IT.withArticle(I('città'), 'pl'), 'le città', 'le città');
eq(IT.withArticle(I('problema'), 'pl'), 'i problemi', 'i problemi');
eq(IT.artPrep('di', 'il'), 'del', 'del');
eq(IT.artPrep('in', "l'"), "nell'", "nell'");
eq(IT.artPrep('su', 'gli'), 'sugli', 'sugli');
eq(IT.artPrep('a', 'le'), 'alle', 'alle');
eq(IT.prenominal(I('bello'), 'ragazzo', 'm'), 'bel', 'bel ragazzo');
eq(IT.prenominal(I('bello'), 'occhi', 'm', 'pl'), 'begli', 'begli occhi');
eq(IT.prenominal(I('buono'), 'amica', 'f'), "buon'", "buon'amica");
eq(IT.conjugate(I('andare'), 'pp', 0), 'sono andato/a', 'sono andato/a');
eq(IT.conjugate(I('mangiare'), 'pp', 3), 'abbiamo mangiato', 'abbiamo mangiato');
eq(IT.conjugate(I('alzarsi'), 'pp', 0), 'mi sono alzato/a', 'mi sono alzato/a');
eq(IT.conjugate(I('alzarsi'), 'ger', 0), 'mi sto alzando', 'mi sto alzando');
eq(IT.conjugate(I('finire'), 'pres', 5), 'finiscono', 'finiscono');
eq(IT.conjugate(I('essere'), 'impf', 2), 'era', 'era');
eq(IT.principalParts(I('andare')).text, 'andare – vado – andai – sono andato/a', 'it principal parts');
eq(IT.irregularCells(I('parlare'), 'pres'), [false, false, false, false, false, false], 'parlare regular');
eq(IT.irregularCells(I('cercare'), 'pres'), [false, false, false, false, false, false], 'cercare cerchi regular');
eq(IT.irregularCells(I('mangiare'), 'fut'), [false, false, false, false, false, false], 'mangerò regular');
eq(IT.irregularCells(I('andare'), 'pres'), [true, true, true, false, false, true], 'andare irregular');
eq(IT.genderHint(I('mano')).follows, false, 'mano exception');
eq(IT.pluralRule(I('amico')).startsWith('-co → -ci'), true, 'amici rule');

// ---- text utils ----
eq(tokenize("dell'acqua", 'it').map((t) => t.t), ["dell'", 'acqua'], 'it elision');
eq(tokenize("un po' di pane", 'it').filter((t) => t.k === 'w').map((t) => t.t), ['un', "po'", 'di', 'pane'], "po'");
eq(checkAnswer('den Mann', ['den Mann'], 'de', { strict: true }).correct, true, 'exact');
eq(checkAnswer('dem Mann', ['den Mann'], 'de', { strict: true }).correct, false, 'den/dem strict');
eq(checkAnswer('Ich bin muede', ['Ich bin müde'], 'de').correct, true, 'ue for ü');
eq(checkAnswer('ich habe das Hause gesehen', ['Ich habe das Haus gesehen'], 'de').correct, true, 'typo lenient');
eq(checkAnswer('perche', ['perché'], 'it').correct, true, 'accent lenient');
eq(scoreSpeech(['ich habe 3 Hunde'], 'Ich habe drei Hunde.', 'de').score, 1, 'speech number');

// ---- analyzer ----
function best(text, word, L) {
  const toks = analyzeText(text, L).filter((t) => t.k === 'w');
  const w = toks.find((t) => t.t === word);
  const c = w?.cands?.[0];
  return c ? { l: c.entry.l, ...explain(c, L.lang) } : null;
}
eq(best('Ich rufe dich morgen an.', 'rufe', de)?.l, 'anrufen', 'separable detection');
eq(best('Ich rufe dich morgen an.', 'an', de)?.l, 'anrufen', 'separable prefix');
eq(best('Ich fahre mit dem Bus.', 'dem', de)?.labels, ['dative masculine singular'], 'mit + dem');
eq(best('Die Kinder spielen im Garten.', 'Kinder', de)?.labels, ['nominative plural', 'accusative plural', 'genitive plural'], 'Kinder');
eq(best('Er ging nach Hause.', 'ging', de)?.labels, ['1st person singular (ich) · simple past (Präteritum)', '3rd person singular (er/sie/es) · simple past (Präteritum)'], 'ging');
eq(best('Das ist meine Haustür.', 'Haustür', de)?.l, 'Tür', 'compound in text');
eq(best("Vado a casa dell'amico.", "dell'", it)?.l, 'di', "dell'");
eq(best('Lo vedo domani.', 'Lo', it)?.pos, 'pronoun', 'lo pronoun');
eq(best('Voglio vederlo.', 'vederlo', it)?.l, 'vedere', 'vederlo');
eq(best('Andavano a scuola.', 'Andavano', it)?.labels, ['3rd person plural (loro) · imperfetto (was …ing / used to)'], 'andavano');
eq(best('Il gatto e la volpe.', 'la', it)?.pos, 'article', 'la article');

// ---- SRS ----
let card = SRS.review(null, SRS.GOOD, 0);
eq(Math.round(card.s * 10) / 10, 3.7, 'initial S good');
const later = SRS.review(card, SRS.GOOD, card.due);
eq(later.s > card.s * 2, true, 'stability grows');
eq(SRS.stage(later) >= 2, true, 'stage');

print(`\n${pass} passed, ${fail} failed`);
