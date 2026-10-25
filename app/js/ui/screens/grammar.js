// Grammar reference: chapters with explanations, tables, tappable examples, mistakes and drills.
import { html, useState, useEffect, useCourse, useStore, cx } from '../h.js';
import * as store from '../../core/store.js';
import { Speak, BackBar, Empty } from '../components.js';
import { TappableText } from '../tappable.js';
import { go } from '../router.js';
import * as ai from '../../core/ai.js';
import * as G from '../../exercises/generate.js';
import { Lesson } from './lesson.js';

export function Grammar() {
  const L = useCourse();
  useStore();
  const c = store.course(L.lang);
  const chapters = L.grammar?.chapters || [];
  if (!chapters.length) return html`<${Empty} icon="🎓" title="Grammar is on its way">The chapters are still being written.</${Empty}>`;
  const unitOfChapter = new Map();
  L.course.units.forEach((u) => (u.grammar || []).forEach((g) => { if (!unitOfChapter.has(g)) unitOfChapter.set(g, u); }));
  const levels = [...new Set(chapters.map((ch) => ch.level))];
  return html`<div>
    <h1>${L.lang === 'de' ? 'Grammatik' : 'Grammatica'}</h1>
    <div class="small muted" style="margin-bottom:.4rem">${Object.keys(c.grammarRead).length} of ${chapters.length} chapters studied</div>
    ${levels.map((lv) => html`<div class="section-title">${lv}</div>
      <div class="card" style="padding:.2rem .9rem"><div class="list">${chapters.filter((ch) => ch.level === lv).map((ch) => {
        const u = unitOfChapter.get(ch.id);
        return html`<div class="row" style="cursor:pointer" onClick=${() => go(`/${L.lang}/grammar/${ch.id}`)}>
          <span style="font-size:1.4rem;width:2rem">${ch.icon || '📘'}</span>
          <div class="grow"><b>${ch.title}</b><div class="small muted">${ch.summary}</div>${u && html`<div class="tiny muted">first met at ${u.city}</div>`}</div>
          ${c.grammarRead[ch.id] ? html`<span title="studied">✅</span>` : ''}</div>`;
      })}</div></div>`)}
  </div>`;
}

function Section({ s, L }) {
  return html`<div class="card">
    ${s.h && html`<h3>${s.h}</h3>`}
    ${s.html && html`<div class="tip-body" dangerouslySetInnerHTML=${{ __html: s.html }}></div>`}
    ${s.table && html`<div style="overflow-x:auto;margin:.6rem 0"><table class="ctable">
      <thead><tr>${s.table[0].map((h) => html`<th>${h}</th>`)}</tr></thead>
      <tbody>${s.table.slice(1).map((row) => html`<tr>${row.map((cell, i) => html`<td class=${i ? 'f' : 'p'} dangerouslySetInnerHTML=${{ __html: cell }}></td>`)}</tr>`)}</tbody></table></div>`}
    ${(s.examples || []).map((x) => html`<div class="row" style="padding:.35rem 0;border-top:1px solid var(--line)">
      <div class="grow"><div class="target" style="font-size:1.12rem"><${TappableText} text=${x[0]} L=${L}/></div>
        <div class="small muted">${x[1]}</div>${x[2] && html`<div class="tiny" style="color:var(--accent)">${x[2]}</div>`}</div><${Speak} text=${x[0]} lang=${L.lang}/></div>`)}
  </div>`;
}

export function Chapter({ id }) {
  const L = useCourse();
  const ch = (L.grammar?.chapters || []).find((x) => x.id === id);
  const [practice, setPractice] = useState(false);
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState(null);
  useEffect(() => {
    if (ch) store.update(() => { const c = store.course(L.lang); if (!c.grammarRead[id]) c.grammarRead[id] = Date.now(); });
  }, [id]);
  if (!ch) return html`<${BackBar} title="Chapter not found"/>`;
  if (practice) {
    const unit = L.course.units.find((u) => (u.grammar || []).includes(id)) || L.course.units[0];
    return html`<${Lesson} key=${'g' + id} spec=${{ key: 'g' + id, type: 'custom', title: ch.title, unitId: unit.id,
      build: (ctx) => [...(ch.tips || []).slice(0, 2).map((t) => ({ kind: 'tip', scored: false, chapterTitle: ch.title, ...t })), ...G.grammarDrills(ctx, ch, unit.words)] }}/>`;
  }
  const ask = async () => {
    if (!q.trim()) return;
    setAnswer({ loading: true });
    try { setAnswer({ text: await ai.askGrammar(q, ch.title, L.lang) }); } catch (e) { setAnswer({ error: e.message }); }
  };
  return html`<div>
    <${BackBar} title=${ch.title}/>
    <p class="muted">${ch.summary}</p>
    ${(ch.sections || []).map((s) => html`<${Section} s=${s} L=${L}/>`)}
    ${ch.mistakes?.length > 0 && html`<div class="card"><h3>Common mistakes</h3>${ch.mistakes.map((m) => html`<div class="tip" dangerouslySetInnerHTML=${{ __html: m }}></div>`)}</div>`}
    ${(ch.drills || []).length > 0 && html`<button class="btn block" style="margin:1rem 0" onClick=${() => setPractice(true)}>🏋️ Practice this topic</button>`}
    <div class="card"><h3>Ask about this topic</h3>
      ${ai.available() ? html`<textarea class="answer-input" style="font-family:var(--ui);font-size:1rem;min-height:70px" placeholder="e.g. Why is it 'dem Mann' here?"
          value=${q} onInput=${(e) => setQ(e.target.value)}></textarea>
        <button class="btn small" style="margin-top:.5rem" disabled=${answer?.loading} onClick=${ask}>${answer?.loading ? 'Asking Claude…' : 'Ask Claude'}</button>
        ${answer?.text && html`<div class="tip" style="white-space:pre-wrap">${answer.text}</div>`}
        ${answer?.error && html`<div class="tip">${answer.error}</div>`}`
      : html`<div class="small muted">Add an Anthropic API key in Settings to ask Claude questions about any grammar point.</div>`}
    </div>
  </div>`;
}
