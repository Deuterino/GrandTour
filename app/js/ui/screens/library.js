// Library (course stories, public-domain books, imports) and the reader.
import { html, useState, useEffect, useMemo, useRef, useCourse, useStore, useAsync, cx, toast } from '../h.js';
import * as store from '../../core/store.js';
import * as game from '../../core/game.js';
import * as books from '../../core/books.js';
import * as speech from '../../core/speech.js';
import { Speak, BackBar, Bar, Empty } from '../components.js';
import { TappableText } from '../tappable.js';
import { analyzeText } from '../../lang/analyzer.js';
import { shortEn } from '../word.js';
import { go } from '../router.js';
import { words as splitWords } from '../../core/text.js';

const PAGE = 8;

export function Library() {
  const L = useCourse();
  useStore();
  const lang = L.lang;
  const c = store.course(lang);
  const [tick, setTick] = useState(0);
  const cat = useAsync(() => books.catalog(lang), [lang]);
  const mine = useAsync(() => books.localBooks(lang), [lang, tick]);
  const [ws, setWs] = useState({ q: '', results: null, busy: false });
  const [paste, setPaste] = useState(null);
  const fileRef = useRef();
  const stories = Object.entries(L.texts?.units || {});
  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try { const meta = await books.importFile(lang, f); toast(`Imported “${meta.title}”`); setTick(tick + 1); } catch (err) { toast(err.message); }
    e.target.value = '';
  };
  const search = async () => {
    if (!ws.q.trim()) return;
    setWs({ ...ws, busy: true });
    try { setWs({ ...ws, busy: false, results: await books.searchWikisource(lang, ws.q) }); } catch (e) { setWs({ ...ws, busy: false }); toast(e.message); }
  };
  const importWs = async (title) => {
    toast('Importing from Wikisource…');
    try {
      const meta = await books.importWikisource(lang, title, (i, n) => i % 5 === 0 && toast(`Chapter ${i} of ${n}…`));
      toast(`Imported “${meta.title}”`); setTick(tick + 1);
    } catch (e) { toast(`Import failed: ${e.message}`); }
  };
  const progress = (id) => c.reading[id];
  const catIds = new Set((mine.value || []).map((b) => b.id));
  return html`<div>
    <h1>${lang === 'de' ? 'Bibliothek' : 'Biblioteca'}</h1>
    <p class="small muted">Tap any word for its meaning and grammar. Words you haven't learned are underlined, words you're still learning are shaded.</p>
    ${stories.length > 0 && html`<div class="section-title">Stories from your journey</div>
      <div class="card" style="padding:.2rem .9rem"><div class="list">${stories.slice(0, 200).map(([uid, texts]) => {
        const u = L.course.units.find((x) => x.id === uid);
        return texts.map((t, i) => html`<div class="row" style="cursor:pointer" onClick=${() => go(`/${lang}/read/story-${uid}-${i}`)}>
          <span style="font-size:1.3rem">${t.type === 'dialogue' ? '💬' : t.type === 'gouin' ? '🔗' : '📜'}</span>
          <div class="grow"><b>${t.title}</b><div class="tiny muted">${u?.city || ''} · ${t.lines.length} lines</div></div></div>`);
      })}</div></div>`}
    <div class="section-title">Public-domain children's books</div>
    ${cat.loading ? html`<div class="muted">Loading…</div>` : !(cat.value || []).length ? html`<${Empty} icon="📚" title="No books yet">The shelf is being stocked.</${Empty}>`
      : html`<div class="col">${cat.value.map((b) => {
        const pr = progress(b.id);
        return html`<div class="card row" style="cursor:pointer" onClick=${() => go(`/${lang}/read/${b.id}/${pr?.ch || 0}`)}>
          <span class="book-cover">${b.emoji || '📗'}</span>
          <div class="grow"><b class="book" style="font-size:1.1rem">${b.title}</b><div class="small muted">${b.author}${b.year ? ` · ${b.year}` : ''} · ${b.level || ''}</div>
            <div class="tiny muted">${b.desc || ''}</div>
            <div class="tiny muted">${b.chapters} chapters · ${b.words?.toLocaleString?.() || b.words} words ${catIds.has(b.id) ? '· ✓ on this device' : '· tap to download'}</div>
            ${pr && html`<div style="margin-top:.3rem"><${Bar} value=${(pr.ch + 1) / b.chapters} kind="gold"/></div>`}</div></div>`;
      })}</div>`}
    ${(mine.value || []).filter((b) => b.imported).length > 0 && html`<div class="section-title">Your imports</div>
      <div class="col">${mine.value.filter((b) => b.imported).map((b) => html`<div class="card row">
        <span class="book-cover" style="width:48px;height:64px;font-size:1.4rem">${b.emoji}</span>
        <div class="grow" style="cursor:pointer" onClick=${() => go(`/${lang}/read/${b.id}/${progress(b.id)?.ch || 0}`)}><b>${b.title}</b>
          <div class="tiny muted">${b.chapters} chapters · ${b.words} words</div></div>
        <button class="iconbtn" title="Delete" onClick=${async () => { if (confirm(`Delete “${b.title}”?`)) { await books.deleteBook(lang, b.id); setTick(tick + 1); } }}>🗑️</button></div>`)}</div>`}
    <div class="section-title">Add more</div>
    <div class="card">
      <b>Search Wikisource</b><div class="small muted" style="margin-bottom:.5rem">Free public-domain texts: try ${lang === 'de' ? '“Grimm Märchen”, “Struwwelpeter”, “Max und Moritz”' : '“Pinocchio”, “Cuore”, “Capuana fiabe”'}.</div>
      <div class="row"><input class="search grow" placeholder="Title or author" value=${ws.q} onInput=${(e) => setWs({ ...ws, q: e.target.value })} onKeyDown=${(e) => e.key === 'Enter' && search()}/>
        <button class="btn small" onClick=${search} disabled=${ws.busy}>${ws.busy ? '…' : 'Search'}</button></div>
      ${ws.results && html`<div class="list" style="margin-top:.5rem">${ws.results.map((r) => html`<div class="row"><div class="grow"><b class="small">${r.title}</b>
        <div class="tiny muted">${r.snippet.slice(0, 90)}…</div></div><button class="btn small ghost" onClick=${() => importWs(r.title)}>Import</button></div>`)}
        ${!ws.results.length && html`<div class="small muted">Nothing found.</div>`}</div>`}
      <div class="divider"></div>
      <b>Import a file</b><div class="small muted" style="margin-bottom:.5rem">.txt, .epub or .html — e.g. a book downloaded from Project Gutenberg.</div>
      <input ref=${fileRef} type="file" accept=".txt,.epub,.html,.htm,text/plain,application/epub+zip,text/html" onChange=${onFile} style="display:none"/>
      <div class="row"><button class="btn small ghost" onClick=${() => fileRef.current.click()}>Choose file…</button>
        <button class="btn small ghost" onClick=${() => setPaste(paste === null ? '' : null)}>Paste text</button></div>
      ${paste !== null && html`<textarea class="answer-input" style="margin-top:.5rem;font-size:1rem" placeholder="Paste German or Italian text here" value=${paste} onInput=${(e) => setPaste(e.target.value)}></textarea>
        <button class="btn small" style="margin-top:.4rem" onClick=${async () => { if (paste.trim()) { await books.importPasted(lang, paste); setPaste(null); setTick(tick + 1); toast('Saved to your imports'); } }}>Save</button>`}
    </div>
    <p class="tiny muted" style="margin-top:1rem">Books are public domain (Project Gutenberg, Wikisource). Dictionary: Wiktionary (CC BY-SA). Example sentences: Tatoeba (CC BY 2.0 FR).</p>
  </div>`;
}

function useBook(lang, bookId, L) {
  return useAsync(async () => {
    if (bookId.startsWith('story-')) {
      const [, uid, i] = bookId.match(/^story-(u\d+)-(\d+)$/) || [];
      const t = L.texts?.units?.[uid]?.[+i];
      if (!t) throw new Error('Story not found');
      return { id: bookId, title: t.title, author: L.course.units.find((u) => u.id === uid)?.city, chapters: [{ title: t.title, paras: t.lines.map((l) => (l.sp ? `${l.sp}: ${l.t}` : l.t)), en: t.lines.map((l) => l.e) }] };
    }
    return books.getBook(lang, bookId);
  }, [lang, bookId]);
}

function knownShare(text, L, c) {
  const toks = analyzeText(text, L).filter((t) => t.k === 'w');
  if (!toks.length) return 1;
  return toks.filter((t) => t.cands?.[0] && c.seen[t.cands[0].entry.id]).length / toks.length;
}

function Interlinear({ text, L }) {
  const toks = useMemo(() => analyzeText(text, L), [text]);
  return html`<p class="interlinear">${toks.filter((t) => t.k !== 's').map((t) => t.k === 'w'
    ? html`<span class="seg"><${TappableText} text=${t.t} L=${L}/><span class="gloss">${t.cands?.[0] ? shortEn(t.cands[0].entry).split(',')[0].slice(0, 18) : '·'}</span></span>`
    : html`<span class="seg">${t.t}<span class="gloss"> </span></span>`)}</p>`;
}

export function Reader({ bookId, chapter = 0 }) {
  const L = useCourse();
  const s = useStore();
  const lang = L.lang;
  const c = store.course(lang);
  const book = useBook(lang, bookId, L);
  const saved = c.reading[bookId];
  const [page, setPage] = useState(saved && saved.ch === chapter ? saved.page || 0 : 0);
  const [inter, setInter] = useState(s.settings.interlinear);
  const [showEn, setShowEn] = useState(false);
  const [playing, setPlaying] = useState(-1);
  const counted = useRef(new Set());
  useEffect(() => () => speech.stop(), []);
  if (book.loading) return html`<div class="muted center" style="padding:2rem">Opening the book…</div>`;
  if (book.error) return html`<div><${BackBar} title="Library"/><div class="tip">${book.error.message}</div></div>`;
  const b = book.value;
  const ch = b.chapters[Math.min(chapter, b.chapters.length - 1)];
  const pages = Math.max(1, Math.ceil(ch.paras.length / PAGE));
  const paras = ch.paras.slice(page * PAGE, page * PAGE + PAGE);
  const size = s.settings.readerSize;
  const turn = (d) => {
    const key = `${chapter}:${page}`;
    if (!counted.current.has(key)) {
      counted.current.add(key);
      const n = paras.reduce((m, p) => m + splitWords(p, lang).length, 0);
      game.addStat(lang, 'readWords', n);
      game.addXP(lang, Math.min(10, Math.round(n / 30)));
    }
    let np = page + d, nc = chapter;
    if (np >= pages) {
      if (chapter + 1 >= b.chapters.length) { game.addStat(lang, 'books'); toast('🎉 You finished the book!', 'gold'); game.checkAchievements(lang); return; }
      nc = chapter + 1; np = 0;
    }
    if (np < 0) { if (chapter === 0) return; nc = chapter - 1; np = 0; }
    store.update(() => { c.reading[bookId] = { ch: nc, page: np, ts: Date.now() }; });
    window.scrollTo(0, 0);
    if (nc !== chapter) go(`/${lang}/read/${bookId}/${nc}`, true);
    setPage(np);
  };
  const readAll = async () => {
    for (let i = 0; i < paras.length; i++) {
      setPlaying(i);
      if (!(await speech.speak(paras[i].replace(/^[^:]{1,20}: /, ''), lang))) break;
    }
    setPlaying(-1);
  };
  const share = Math.round(knownShare(paras.join(' '), L, c) * 100);
  return html`<div>
    <${BackBar} title=${b.title} onBack=${() => go(`/${lang}/library`)}/>
    <div class="small muted" style="margin:-.5rem 0 .6rem 2.6rem">${b.author || ''} · chapter ${chapter + 1}/${b.chapters.length} · page ${page + 1}/${pages} · you know ${share}% of these words</div>
    <div class="row wrap" style="margin-bottom:.8rem">
      <button class="btn small ghost" onClick=${() => (playing >= 0 ? (speech.stop(), setPlaying(-1)) : readAll())}>${playing >= 0 ? '■ Stop' : '▶ Read aloud'}</button>
      <button class=${cx('chip', inter && 'on')} onClick=${() => setInter(!inter)}>Interlinear</button>
      ${ch.en && html`<button class=${cx('chip', showEn && 'on')} onClick=${() => setShowEn(!showEn)}>English</button>`}
      <span class="grow"></span>
      <button class="chip" onClick=${() => store.update((st) => { st.settings.readerSize = Math.max(0.9, size - 0.08); })}>A−</button>
      <button class="chip" onClick=${() => store.update((st) => { st.settings.readerSize = Math.min(2, size + 0.08); })}>A+</button>
    </div>
    <h2 class="book" style="font-weight:600">${ch.title}</h2>
    <div class="reader" style=${`--reader-size:${size}rem`}>
      ${paras.map((p, i) => html`<div style=${playing === i ? 'background:var(--gold-soft);border-radius:8px' : ''}>
        ${inter ? html`<${Interlinear} text=${p} L=${L}/>` : html`<p><${TappableText} text=${p} L=${L} colorKnown=${s.settings.highlightKnown}/></p>`}
        ${showEn && ch.en && html`<div class="line-en">${ch.en[page * PAGE + i]}</div>`}
      </div>`)}
    </div>
    <div class="row" style="margin:1.2rem 0 2rem">
      <button class="btn ghost" disabled=${chapter === 0 && page === 0} onClick=${() => turn(-1)}>← Back</button>
      <span class="grow"></span>
      <button class="btn" onClick=${() => turn(1)}>${page + 1 >= pages ? (chapter + 1 >= b.chapters.length ? 'Finish' : 'Next chapter →') : 'Next page →'}</button>
    </div>
  </div>`;
}
