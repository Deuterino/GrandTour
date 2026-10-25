// Text where every word can be tapped for its dictionary entry and grammatical analysis.
import { html, useMemo, useState, useEffect, cx, openSheet, closeSheet, toast } from './h.js';
import * as store from '../core/store.js';
import * as game from '../core/game.js';
import { analyzeText, explain, lookupWord } from '../lang/analyzer.js';
import { Speak, Art, Mastery } from './components.js';
import { posLine, dictLine } from './word.js';
import { go } from './router.js';
import * as ai from '../core/ai.js';

export function TappableText({ text, L, highlight = null, colorKnown = false, onWord = null, className = '', sentence = null }) {
  const tokens = useMemo(() => analyzeText(text, L), [text, L, L.ext]);
  const c = store.course(L.lang);
  return html`<span class=${className}>${tokens.map((t, i) => {
    if (t.k !== 'w') return t.t;
    const best = t.cands?.[0]?.entry;
    let k = '';
    if (colorKnown) {
      if (!t.cands?.length) k = 'k-unknown';
      else if (best && !best.syn && !c.seen[best.id]) k = 'k-new';
      else if (best && game.mastery(c, best.id) < 3) k = 'k-learning';
    }
    const hl = highlight && best && highlight.has(best.id);
    return html`<span class=${cx('w', k, hl && 'hl')} onClick=${(e) => {
      e.stopPropagation();
      if (onWord) onWord(t, tokens);
      openSheet(() => html`<${WordPopup} token=${t} L=${L} sentence=${sentence || text}/>`);
    }}>${t.t}</span>`;
  })}</span>`;
}

function Candidate({ c, L, primary }) {
  const e = c.entry;
  const ex = explain(c, L.lang);
  const course = store.course(L.lang);
  const stage = game.mastery(course, e.id);
  return html`<div class="pop-cand">
    <div class="row between">
      <div class="grow"><div class="pop-word"><${Art} entry=${e} lang=${L.lang}/></div>
        <div class="pop-analysis">${posLine(e, L.lang)}${dictLine(e, L.lang) ? ' · ' + dictLine(e, L.lang) : ''}</div></div>
      <${Speak} entry=${e} lang=${L.lang}/>
    </div>
    ${ex.labels.length > 0 && html`<div class="tip rule" style="margin:.5rem 0">${ex.labels.map((l) => html`<div>• ${l}</div>`)}</div>`}
    ${ex.notes.map((n) => html`<div class="tip">${n}</div>`)}
    <div style="font-size:1.05rem;font-weight:600;margin:.4rem 0">${e.en}</div>
    ${e.n && primary && html`<div class="small muted" style="margin-bottom:.4rem">${e.n}</div>`}
    ${!e.syn && html`<div class="row between">
      <span class="small muted">${course.seen[e.id] ? html`<${Mastery} stage=${stage}/> your mastery` : 'not learned yet'}</span>
      <button class="btn small ghost" onClick=${() => { closeSheet(); go(`/${L.lang}/word/${encodeURIComponent(e.id)}`); }}>Full entry →</button>
    </div>`}
  </div>`;
}

export function WordPopup({ token, L, sentence }) {
  const [ext, setExt] = useState(null);
  const [aiText, setAi] = useState(null);
  const cands = token.cands || lookupWord(token.t, L);
  useEffect(() => {
    if (cands.length) return;
    L.loadExtended().then((d) => setExt(d.lookup(token.t)));
  }, [token.t]);
  const askAI = async () => {
    setAi({ loading: true });
    try { setAi({ text: await ai.explainSentence(sentence, token.t, L.lang) }); } catch (e) { setAi({ error: e.message }); }
  };
  const hasAI = ai.available();
  return html`<div>
    <div class="row between"><div class="muted small">in the text: <b class="book" style="font-size:1.1rem">${token.t}</b></div>
      <${Speak} text=${token.t} lang=${L.lang}/></div>
    ${cands.slice(0, 3).map((c, i) => html`<${Candidate} c=${c} L=${L} primary=${i === 0}/>`)}
    ${!cands.length && ext && ext.length > 0 && ext.slice(0, 3).map((x) => html`<div class="pop-cand">
      <div class="pop-word book">${x.e.a ? html`<span class="art">${x.e.a}</span> ` : ''}${x.e.l}</div>
      <div class="pop-analysis">${x.e.p}${x.tag && x.tag !== 'lemma' ? ' · ' + x.tag : ''}</div>
      <div style="font-weight:600;margin:.3rem 0">${x.e.g}</div>
      <div class="small muted">From the extended dictionary (not one of the 3,000 course words).</div></div>`)}
    ${!cands.length && (!ext || !ext.length) && html`<div class="pop-cand"><div class="muted">${ext ? 'Not in the dictionary.' : 'Looking it up…'}</div>
      <a class="small" href=${`https://en.wiktionary.org/wiki/${encodeURIComponent(token.t.toLowerCase())}#${L.lang === 'de' ? 'German' : 'Italian'}`} target="_blank" rel="noopener">Look it up on Wiktionary ↗</a></div>`}
    ${sentence && html`<div class="divider"></div>
      ${hasAI ? html`<button class="btn small ghost block" onClick=${askAI} disabled=${aiText?.loading}>${aiText?.loading ? 'Asking Claude…' : '✨ Explain this sentence (AI)'}</button>`
        : html`<div class="tiny muted">Add an Anthropic API key in Settings to get AI explanations of whole sentences.</div>`}
      ${aiText?.text && html`<div class="tip" style="white-space:pre-wrap">${aiText.text}</div>`}
      ${aiText?.error && html`<div class="tip">Couldn't reach Claude: ${aiText.error}</div>`}`}
  </div>`;
}

export function showWord(entry, L) {
  openSheet(() => html`<div><${Candidate} c=${{ entry, tags: [], notes: [] }} L=${L} primary=${true}/></div>`);
}

export { toast };
