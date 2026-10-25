// Conjugation and declension tables, with irregular forms highlighted and an optional quiz mode.
import { html, useState, cx } from './h.js';
import * as DE from '../lang/de.js';
import * as IT from '../lang/it.js';
import { Speak } from './components.js';

// German subject + form, with separable/reflexive handled by the engine.
function deCell(entry, tense, p) {
  const f = DE.conjugate(entry, tense, p);
  if (!f) return null;
  if (tense === 'imp') return f;
  return `${DE.PERSONS[p].split('/')[0] === 'sie' ? 'sie/Sie' : DE.PERSONS[p]} ${f}`;
}

export function ConjTables({ entry, lang, maxLevel = 9, quiz = false }) {
  const [hidden, setHidden] = useState(quiz ? new Set(['all']) : new Set());
  const E = lang === 'de' ? DE : IT;
  const tenses = E.TENSES.filter((t) => t.level <= maxLevel);
  const reveal = (k) => setHidden((h) => { const n = new Set(h); n.delete('all'); n.add('shown:' + k); return n; });
  return html`<div class="tense-grid">
    ${tenses.map((t) => {
      const irr = E.irregularCells(entry, t.k) || [];
      const persons = t.k === 'imp' ? (lang === 'de' ? [1, 4, 5, 3] : [0, 1, 2, 3, 4]) : [0, 1, 2, 3, 4, 5];
      const rows = persons.map((p) => {
        const form = lang === 'de' ? DE.conjugate(entry, t.k, p) : IT.conjugate(entry, t.k, p);
        if (!form) return null;
        const who = t.k === 'imp' ? (lang === 'de' ? ['', 'du', '', 'wir', 'ihr', 'Sie'][p] : IT.IMP_PERSONS[p]) : E.PERSONS[p];
        const key = `${t.k}${p}`;
        const isHidden = hidden.has('all') && !hidden.has('shown:' + key);
        return html`<tr>
          <td class="p">${who}</td>
          <td class=${cx('f', irr[p] && 'irr', isHidden && 'hid')} onClick=${() => isHidden && reveal(key)}>${isHidden ? '•••••' : form}</td>
          <td style="width:34px">${!isHidden && html`<${Speak} text=${t.k === 'imp' ? form : `${who.split('/')[0]} ${form}`} lang=${lang}/>`}</td>
        </tr>`;
      }).filter(Boolean);
      if (!rows.length) return null;
      return html`<div class="card tight tense-card">
        <h4>${t.name}</h4><div class="en">${t.en}</div>
        <table class="ctable"><tbody>${rows}</tbody></table>
      </div>`;
    })}
  </div>`;
}

export function DeclTable({ entry }) {
  if (!entry || entry.p !== 'n') return null;
  const g = entry.g === 'pl' ? 'pl' : entry.g;
  const rows = DE.CASES.map((c, i) => {
    const sg = g === 'pl' ? null : DE.nounPhrase(entry, { c, number: 'sg', det: 'def' }).text;
    const sgi = g === 'pl' ? null : DE.nounPhrase(entry, { c, number: 'sg', det: 'indef' }).text;
    const pl = entry.unc ? '—' : DE.nounPhrase(entry, { c, number: 'pl', det: 'def' }).text;
    return html`<tr><td class="c">${DE.CASE_NAMES[c].slice(0, 3)}.</td>
      ${g !== 'pl' && html`<td class="f"><span class=${`g-${g}`}>${sg.split(' ')[0]}</span> ${sg.split(' ').slice(1).join(' ')}<div class="tiny muted">${sgi}</div></td>`}
      <td class="f"><span class="g-pl">${pl.split(' ')[0]}</span> ${pl.split(' ').slice(1).join(' ')}</td></tr>`;
  });
  return html`<table class="ctable decl"><thead><tr><th></th>${g !== 'pl' && html`<th>singular</th>`}<th>plural</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// German adjective endings for one adjective with a sample noun of each gender.
const SAMPLE = { m: 'Mann', f: 'Frau', n: 'Kind', pl: 'Kinder' };
export function AdjTable({ entry, decl = 'weak', L }) {
  const nouns = { m: L.lemma('Mann', 'n'), f: L.lemma('Frau', 'n'), n: L.lemma('Kind', 'n') };
  const det = decl === 'weak' ? 'def' : decl === 'mixed' ? 'indef' : 'none';
  const head = ['m', 'f', 'n', 'pl'];
  return html`<table class="ctable decl"><thead><tr><th></th>${head.map((g) => html`<th class=${`g-${g}`}>${DE.GENDER_NAMES[g]}</th>`)}</tr></thead>
  <tbody>${DE.CASES.map((c) => html`<tr><td class="c">${c}</td>${head.map((g) => {
    const noun = g === 'pl' ? nouns.n : nouns[g];
    if (!noun) return html`<td></td>`;
    const d = g === 'pl' && det === 'indef' ? 'kein' : det;
    const np = DE.nounPhrase(noun, { c, number: g === 'pl' ? 'pl' : 'sg', det: d, adj: entry });
    const parts = np.text.split(' ');
    const adjWord = parts[np.art ? 1 : 0];
    const end = adjWord.slice(DE.adjStem(entry).length);
    return html`<td class="f small">${np.art ? np.art + ' ' : ''}${DE.adjStem(entry)}<b class="g-${g}">${end}</b></td>`;
  })}</tr>`)}</tbody></table>`;
}

export function ItAdjTable({ entry }) {
  const f = IT.adjForms(entry);
  return html`<table class="ctable"><thead><tr><th></th><th>singular</th><th>plural</th></tr></thead><tbody>
    <tr><td class="p g-m">masculine</td><td class="f">${f.ms}</td><td class="f">${f.mp}</td></tr>
    <tr><td class="p g-f">feminine</td><td class="f">${f.fs}</td><td class="f">${f.fp}</td></tr></tbody></table>`;
}

export { SAMPLE };
