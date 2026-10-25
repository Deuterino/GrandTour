// Run every example/dialogue sentence through the app's analyzer and list words it cannot explain.
// Usage (repo root): jsc -m tools/check_text.mjs -- de
import { LangData } from '../app/js/core/data.js';
import { analyzeText } from '../app/js/lang/analyzer.js';

const args = typeof scriptArgs !== 'undefined' ? scriptArgs : (typeof arguments !== 'undefined' ? arguments : []);
const lang = args[0];
const L = new LangData(lang, JSON.parse(read(`app/data/${lang}/lexicon.json`)));
const texts = [];
try {
  const g = JSON.parse(read(`app/data/${lang}/grammar.json`));
  for (const ch of g.chapters) {
    for (const s of ch.sections || []) for (const e of s.examples || []) texts.push([ch.id, e[0]]);
    for (const t of ch.tips || []) for (const e of t.examples || []) texts.push([ch.id, e[0]]);
  }
} catch (e) { /* no grammar yet */ }
try {
  const t = JSON.parse(read(`app/data/${lang}/texts.json`));
  for (const [uid, list] of Object.entries(t.units)) for (const x of list) for (const l of x.lines) texts.push([`${uid}:${x.title}`, l.t]);
} catch (e) { /* no texts yet */ }
const unknown = new Map();
for (const [where, text] of texts) {
  for (const tok of analyzeText(text, L)) {
    if (tok.k !== 'w' || tok.cands?.length || /^\d+$/.test(tok.t)) continue;
    const k = tok.t;
    if (!unknown.has(k)) unknown.set(k, []);
    unknown.get(k).push(where);
  }
}
print(`${texts.length} sentences checked; ${unknown.size} unknown words`);
for (const [w, where] of [...unknown.entries()].sort((a, b) => b[1].length - a[1].length)) print(`${w}\t${where.length}\t${[...new Set(where)].slice(0, 3).join(', ')}`);
