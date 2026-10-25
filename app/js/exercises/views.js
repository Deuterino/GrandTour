// One view per exercise kind. Every view calls onResult({ correct, grade, notes, expected, ops }).
import { html, useState, useEffect, useRef, useMemo, cx } from '../ui/h.js';
import { Speak, Art, CharBar, Icon } from '../ui/components.js';
import { TappableText } from '../ui/tappable.js';
import { ConjTables, DeclTable } from '../ui/tables.js';
import { headText, dictLine, posLine, emoji, shortEn } from '../ui/word.js';
import * as DE from '../lang/de.js';
import * as IT from '../lang/it.js';
import * as speech from '../core/speech.js';
import * as store from '../core/store.js';
import * as SRS from '../core/srs.js';
import { checkAnswer, scoreSpeech, words as splitWords } from '../core/text.js';
import * as ai from '../core/ai.js';

const LANGNAME = { de: 'German', it: 'Italian' };

// ---------- intro card (Orbis Pictus style: picture, sound, forms, example) ----------
export function Intro({ ex, L, onResult }) {
  const e = L.get(ex.word);
  const lang = L.lang;
  const auto = store.get().settings.autoplay;
  const pic = emoji(e);
  const pp = e.p === 'v' ? (lang === 'de' ? DE.principalParts(e) : IT.principalParts(e)) : null;
  let hint = null;
  if (e.p === 'n') {
    hint = lang === 'de'
      ? DE.genderHint(e, (w, any) => { const l = L.byLemma.get(w) || []; return any ? l[0] : l.find((x) => x.p === 'n'); }).text
      : IT.genderHint(e).text;
  }
  const presRows = e.p === 'v' && e.v?.t ? [0, 1, 2, 3, 5].map((p) => [lang === 'de' ? DE.PERSONS[p] : IT.PERSONS[p], (lang === 'de' ? DE : IT).conjugate(e, 'pres', p)]) : [];
  const irr = e.p === 'v' ? ((lang === 'de' ? DE : IT).irregularCells(e, 'pres') || []) : [];
  return html`<div class="flash">
    <div class="prompt-kind">New word</div>
    ${pic && html`<div class="emoji-pic">${pic}</div>`}
    <div class="lemma"><${Art} entry=${e} lang=${lang}/></div>
    <div class="row" style="justify-content:center;gap:.8rem"><${Speak} entry=${e} lang=${lang} big=${true} auto=${auto}/>
      <${Speak} text=${e.p === 'n' ? headText(e, lang) : e.l} lang=${lang} slow=${true}/></div>
    ${e.ipa && html`<div class="ipa">${e.ipa}</div>`}
    <div class="en">${e.en}</div>
    <div class="small muted">${posLine(e, lang)}</div>
    ${dictLine(e, lang) && html`<div style="margin:.6rem 0"><span class="parts">${dictLine(e, lang)}</span></div>`}
    ${pp && presRows.length > 0 && html`<table class="ctable" style="max-width:340px;margin:.6rem auto;text-align:left"><tbody>
      ${presRows.map(([who, f], i) => f && html`<tr><td class="p">${who}</td><td class=${cx('f', irr[[0, 1, 2, 3, 5][i]] && 'irr')}>${f}</td></tr>`)}
    </tbody></table>`}
    ${hint && html`<div class="tip rule" style="text-align:left">${hint}</div>`}
    ${e.gov && html`<div class="tip" style="text-align:left">Takes: <b>${e.gov}</b></div>`}
    ${e.n && html`<div class="tip" style="text-align:left">${e.n}</div>`}
    ${ex.example && html`<div class="card flat tight" style="text-align:left;margin-top:.6rem">
      <div class="row"><div class="grow target" style="font-size:1.2rem"><${TappableText} text=${ex.example.t} L=${L} highlight=${new Set([e.id])}/></div>
      <${Speak} text=${ex.example.t} lang=${lang}/></div><div class="small muted">${ex.example.e[0]}</div></div>`}
    <div class="foot"><button class="btn block" onClick=${() => onResult({ correct: true, skip: true })}>Got it</button></div>
  </div>`;
}

// ---------- multiple choice ----------
export function MCQ({ ex, L, onResult, answered }) {
  const [picked, setPicked] = useState(null);
  const lang = L.lang;
  const e = ex.prompt.word ? L.get(ex.prompt.word) : null;
  const audioE = ex.prompt.audioWord ? L.get(ex.prompt.audioWord) : null;
  const auto = store.get().settings.autoplay;
  const choose = (o, i) => {
    if (picked !== null || answered) return;
    setPicked(i);
    const right = ex.options.find((x) => x.ok);
    onResult({ correct: o.ok, expected: right?.text });
  };
  useEffect(() => {
    const onKey = (ev) => { const n = +ev.key; if (n >= 1 && n <= ex.options.length) choose(ex.options[n - 1], n - 1); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return html`<div>
    <div class="prompt-kind">${ex.label}</div>
    ${e && html`<div class="row" style="margin:.4rem 0 1.2rem"><${Speak} entry=${e} lang=${lang} auto=${auto && ex.prompt.audio}/>
      <div class="target big"><${Art} entry=${e} lang=${lang}/></div></div>`}
    ${audioE && html`<div class="center" style="margin:1rem 0 1.4rem"><${Speak} entry=${audioE} lang=${lang} big=${true} auto=${true}/>
      <span style="margin-left:.6rem"><${Speak} text=${headText(audioE, lang)} lang=${lang} slow=${true}/></span></div>`}
    ${ex.prompt.text && !e && html`<div class="prompt">${ex.prompt.text}</div>`}
    ${ex.prompt.text && e && ex.mode === 'plural' && html`<div class="prompt book">${ex.prompt.text}</div>`}
    <div class="choices">
      ${ex.options.map((o, i) => html`<button class=${cx('choice', picked !== null && o.ok && 'right', picked === i && !o.ok && 'wrong', picked !== null && picked !== i && !o.ok && 'dim')}
        onClick=${() => choose(o, i)}><span class="key">${i + 1}</span><span class=${ex.mode === 'prod' || ex.mode === 'listen' || ex.mode === 'plural' ? 'book' : ''}>${o.text}</span></button>`)}
    </div>
  </div>`;
}

// der / die / das — colored article buttons
export function Gender({ ex, L, onResult, answered }) {
  const [picked, setPicked] = useState(null);
  const choose = (o, i) => {
    if (picked !== null || answered) return;
    setPicked(i);
    onResult({ correct: o.ok, expected: ex.options.find((x) => x.ok)?.text + (L.lang === 'de' ? ' ' : '') + ex.noun, stat: 'gender' });
  };
  return html`<div>
    <div class="prompt-kind">${ex.label}</div>
    <div class="target big center" style="margin:1rem 0 .3rem">${ex.noun}</div>
    <div class="center muted" style="margin-bottom:1.2rem">${ex.en}</div>
    <div class=${cx('choices', ex.options.length === 3 ? 'three' : 'two')}>
      ${ex.options.map((o, i) => html`<button class=${cx('choice center', `art-${o.g}`, picked !== null && o.ok && 'right', picked === i && !o.ok && 'wrong')}
        style="font-size:1.35rem;font-family:var(--book);font-weight:800" onClick=${() => choose(o, i)}>${o.text}</button>`)}
    </div>
  </div>`;
}

// Conjugation as multiple choice
export function Conj({ ex, L, onResult, answered }) {
  const [picked, setPicked] = useState(null);
  const e = L.get(ex.verb);
  const choose = (o, i) => {
    if (picked !== null || answered) return;
    setPicked(i);
    onResult({ correct: o.ok, expected: `${ex.prompt.who.split('/')[0]} ${ex.answer}`, stat: 'conj' });
  };
  return html`<div>
    <div class="prompt-kind">${ex.label}</div>
    <div class="prompt book" style="margin-bottom:.2rem">${e.l} <span class="muted small">(${shortEn(e)})</span></div>
    <div class="pill accent" style="margin-bottom:1rem">${ex.prompt.tense} · ${ex.prompt.en}</div>
    <div class="target" style="margin-bottom:1rem">${ex.prompt.who} …</div>
    <div class="choices">${ex.options.map((o, i) => html`<button class=${cx('choice book', picked !== null && o.ok && 'right', picked === i && !o.ok && 'wrong')}
      onClick=${() => choose(o, i)}><span class="key">${i + 1}</span>${o.text}</button>`)}</div>
  </div>`;
}

// Sentence frame with a blank and choices
export function Cloze({ ex, L, onResult, answered }) {
  const [picked, setPicked] = useState(null);
  const choose = (o, i) => {
    if (picked !== null || answered) return;
    setPicked(i);
    const right = ex.options.find((x) => x.ok)?.text;
    onResult({ correct: o.ok, expected: ex.prompt.text.replace('___', right.replace(/^-/, '')), stat: ex.stat });
  };
  const parts = ex.prompt.text.split('___');
  const fill = picked !== null ? ex.options.find((x) => x.ok)?.text.replace(/^-/, '') : '____';
  return html`<div>
    <div class="prompt-kind">${ex.label}</div>
    <div class="target" style="margin:.6rem 0">${parts[0]}<b class=${picked !== null ? 'g-n' : 'muted'}>${fill}</b>${parts[1] || ''}</div>
    ${ex.prompt.en && html`<div class="muted" style="margin-bottom:.4rem">${ex.prompt.en}</div>`}
    ${ex.prompt.hint && html`<div class="pill" style="margin-bottom:1rem">${ex.prompt.hint}</div>`}
    <div class="choices two">${ex.options.map((o, i) => html`<button class=${cx('choice center book', picked !== null && o.ok && 'right', picked === i && !o.ok && 'wrong')}
      onClick=${() => choose(o, i)}>${o.text}</button>`)}</div>
  </div>`;
}

// ---------- typing ----------
export function Type({ ex, L, onResult, answered }) {
  const [val, setVal] = useState('');
  const [state, setState] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const ref = useRef();
  const lang = L.lang;
  const e = ex.prompt.word ? L.get(ex.prompt.word) : null;
  const auto = store.get().settings.autoplay;
  useEffect(() => { setTimeout(() => ref.current?.focus(), 250); }, []);
  const check = async () => {
    if (!val.trim() || state) return;
    const targetLang = ex.toEnglish ? 'en' : lang;
    let r = checkAnswer(val, ex.accepted, targetLang === 'en' ? 'it' : lang, { strict: ex.strict });
    let notes = r.notes;
    // nouns: right word, missing article → accept with a warning (gender is graded separately)
    if (!r.correct && ex.noun && !ex.toEnglish) {
      const noun = L.get(ex.noun);
      const bare = checkAnswer(val, [noun.l], lang);
      if (bare.correct) { r = { ...bare, correct: true }; notes = [`Remember the article: ${headText(noun, lang)}`]; r.missingArticle = true; }
    }
    if (!r.correct && ex.long && ai.available()) {
      setAiBusy(true);
      try {
        const g = await ai.gradeTranslation({ prompt: ex.prompt.text || ex.prompt.sentenceText || ex.prompt.audioText, accepted: ex.accepted, answer: val,
          toLang: ex.toEnglish ? 'en' : lang, lang });
        if (g.acceptable) { r = { ...r, correct: true }; notes = [`Claude: ${g.feedback}`]; }
        else notes = [`Claude: ${g.feedback}`, g.corrected ? `Corrected: ${g.corrected}` : ''].filter(Boolean);
      } catch (err) { notes = [...notes, `(AI check unavailable: ${err.message})`]; }
      setAiBusy(false);
    }
    setState(r.correct ? 'right' : 'wrong');
    onResult({ correct: r.correct, grade: r.correct ? (r.exact ? SRS.GOOD : SRS.HARD) : SRS.AGAIN, notes, expected: r.expected, ops: r.ops,
      genderWrong: !!ex.noun && !r.correct && checkAnswer(val.replace(/^\S+\s/, ''), [L.get(ex.noun).l], lang).correct, stat: ex.stat });
  };
  const c = ex.prompt.conj;
  return html`<div>
    <div class="prompt-kind">${ex.label}</div>
    ${e && html`<div class="row" style="margin:.4rem 0 1rem"><${Speak} entry=${e} lang=${lang} auto=${auto}/><div class="target big"><${Art} entry=${e} lang=${lang}/></div></div>`}
    ${ex.prompt.text && html`<div class="prompt">${ex.prompt.text}</div>`}
    ${ex.prompt.sentenceText && html`<div class="row" style="margin-bottom:1rem"><${Speak} text=${ex.prompt.sentenceText} lang=${lang} auto=${auto}/>
      <div class="target"><${TappableText} text=${ex.prompt.sentenceText} L=${L}/></div></div>`}
    ${ex.prompt.audioText && html`<div class="center" style="margin:1rem 0"><${Speak} text=${ex.prompt.audioText} lang=${lang} big=${true} auto=${true}/>
      <span style="margin-left:.6rem"><${Speak} text=${ex.prompt.audioText} lang=${lang} slow=${true}/></span></div>`}
    ${c && html`<div style="margin-bottom:1rem"><div class="prompt book" style="margin:0">${c.verb}</div>
      <div class="pill accent">${c.tense} · ${c.en}</div><div class="target" style="margin-top:.8rem">${c.who} …</div></div>`}
    ${ex.long ? html`<textarea ref=${ref} class=${cx('answer-input', state)} value=${val} onInput=${(ev) => setVal(ev.target.value)} disabled=${!!state}
        placeholder=${ex.toEnglish ? 'Type in English' : `Type in ${LANGNAME[lang]}`} autocapitalize="sentences" autocorrect="off" spellcheck="false"></textarea>`
      : html`<input ref=${ref} class=${cx('answer-input', state)} value=${val} onInput=${(ev) => setVal(ev.target.value)} disabled=${!!state}
        onKeyDown=${(ev) => ev.key === 'Enter' && check()} placeholder=${ex.toEnglish ? 'English' : LANGNAME[lang]}
        autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="off"/>`}
    ${!ex.toEnglish && !state && html`<${CharBar} lang=${lang} inputRef=${ref} onInsert=${(v) => setVal(v)}/>`}
    ${!state && !answered && html`<div class="foot"><button class="btn block" disabled=${!val.trim() || aiBusy} onClick=${check}>${aiBusy ? 'Checking with Claude…' : 'Check'}</button></div>`}
  </div>`;
}

// ---------- tiles (sentence building) ----------
export function Tiles({ ex, L, onResult, answered }) {
  const [chosen, setChosen] = useState([]);
  const [done, setDone] = useState(false);
  const pick = (i) => { if (!done) setChosen((c) => [...c, i]); };
  const unpick = (k) => { if (!done) setChosen((c) => c.filter((_, j) => j !== k)); };
  const check = () => {
    const text = chosen.map((i) => ex.tiles[i]).join(' ');
    const r = checkAnswer(text, ex.accepted, L.lang, { strict: true });
    setDone(true);
    onResult({ correct: r.correct, expected: ex.accepted[0], ops: r.ops });
  };
  return html`<div>
    <div class="prompt-kind">${ex.label}</div>
    <div class="prompt">${ex.prompt.en}</div>
    <div class="tiles answer">${chosen.map((i, k) => html`<span class="tile" onClick=${() => unpick(k)}>${ex.tiles[i]}</span>`)}</div>
    <div class="tiles">${ex.tiles.map((t, i) => html`<span class=${cx('tile', chosen.includes(i) && 'used')} onClick=${() => !chosen.includes(i) && pick(i)}>${t}</span>`)}</div>
    ${!done && !answered && html`<div class="foot"><button class="btn block" disabled=${!chosen.length} onClick=${check}>Check</button></div>`}
  </div>`;
}

// ---------- speaking ----------
export function SpeakEx({ ex, L, onResult, answered, onSkipSpeaking }) {
  const [phase, setPhase] = useState('idle'); // idle | listening | scored | recording | playback
  const [heard, setHeard] = useState('');
  const [result, setResult] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const lang = L.lang;
  const entry = ex.prompt.entry ? L.get(ex.prompt.entry) : null;
  const go = async () => {
    setPhase('listening');
    setHeard('');
    const r = await speech.listen(lang, { onInterim: setHeard });
    if (!r.transcripts.length) {
      setPhase('idle');
      setHeard(r.error === 'not-allowed' ? 'Microphone permission was denied.' : r.error === 'unsupported' ? 'Speech recognition is not available here.' : "I didn't catch that — try again.");
      return;
    }
    const sc = scoreSpeech(r.transcripts, ex.prompt.text, lang);
    setHeard(sc.heard);
    setResult(sc);
    setPhase('scored');
    onResult({ correct: sc.score >= 0.7, expected: ex.prompt.text, notes: [`${Math.round(sc.score * 100)}% of the words recognized`], stat: sc.score >= 0.7 ? 'spoken' : null });
  };
  const recordSelf = async () => {
    setPhase('recording');
    try {
      const url = await speech.record(6000);
      setAudioUrl(url);
      setPhase('playback');
    } catch (e) { setPhase('idle'); setHeard('Could not use the microphone.'); }
  };
  const canListen = speech.canListen();
  return html`<div>
    <div class="prompt-kind">${ex.label}</div>
    <div class="row" style="margin:.4rem 0 .4rem"><${Speak} text=${ex.prompt.text} entry=${entry && !ex.prompt.text.includes(' ') ? entry : null} lang=${lang}/>
      <div class="target big">${ex.prompt.text}</div></div>
    <div class="muted" style="margin-bottom:1.4rem">${ex.prompt.en}</div>
    <div class="center">
      ${canListen ? html`<button class=${cx('mic', phase === 'listening' && 'on')} onClick=${() => phase !== 'listening' && go()} disabled=${answered && phase === 'scored'}>${Icon.mic({ width: 36 })}</button>
        <div class="small muted" style="margin-top:.5rem">${phase === 'listening' ? 'Listening… speak now' : 'Tap and read the sentence aloud'}</div>`
      : html`<button class=${cx('mic', phase === 'recording' && 'on')} onClick=${() => phase === 'recording' ? speech.record.stop?.() : recordSelf()}>${Icon.mic({ width: 36 })}</button>
        <div class="small muted" style="margin-top:.5rem">${phase === 'recording' ? 'Recording… tap to stop' : 'Record yourself, then compare with the model'}</div>`}
      <div class="heard" style="margin-top:.8rem">${result ? result.ops.map((o) => html`<span class=${cx('score-word', o.s === 'ok' || o.s === 'case' || o.s === 'accent' ? 'ok' : o.s === 'typo' ? 'close' : 'missing')}>${o.t} </span>`) : heard}</div>
      ${phase === 'playback' && audioUrl && html`<div class="col" style="align-items:center;margin-top:.6rem">
        <audio controls src=${audioUrl}></audio>
        <div class="row"><button class="btn small good" onClick=${() => { setPhase('scored'); onResult({ correct: true, notes: ['Self-assessed'], stat: 'spoken' }); }}>Sounded right</button>
        <button class="btn small ghost" onClick=${() => setPhase('idle')}>Try again</button></div></div>`}
    </div>
    ${!answered && phase !== 'scored' && html`<div class="foot"><button class="btn ghost block" onClick=${() => { onSkipSpeaking?.(); onResult({ correct: true, skip: true }); }}>Can't speak now</button></div>`}
  </div>`;
}

// ---------- matching pairs ----------
export function Match({ ex, L, onResult }) {
  const left = useMemo(() => ex.pairs.map((p, i) => ({ i, t: p.a })).sort(() => Math.random() - 0.5), [ex]);
  const right = useMemo(() => ex.pairs.map((p, i) => ({ i, t: p.b })).sort(() => Math.random() - 0.5), [ex]);
  const [selL, setSelL] = useState(null);
  const [selR, setSelR] = useState(null);
  const [gone, setGone] = useState(new Set());
  const [bad, setBad] = useState(null);
  const [mistakes, setMistakes] = useState(0);
  useEffect(() => {
    if (selL === null || selR === null) return;
    if (selL === selR) {
      const g = new Set(gone); g.add(selL); setGone(g);
      speech.speak(ex.pairs[selL].a, L.lang);
      if (g.size === ex.pairs.length) setTimeout(() => onResult({ correct: mistakes <= 1, notes: mistakes ? [`${mistakes} wrong match${mistakes > 1 ? 'es' : ''}`] : [] }), 300);
    } else { setBad([selL, selR]); setMistakes((m) => m + 1); setTimeout(() => setBad(null), 450); }
    setSelL(null); setSelR(null);
  }, [selL, selR]);
  return html`<div>
    <div class="prompt-kind">${ex.label}</div>
    <div class="match" style="margin-top:1rem">
      <div class="col">${left.map((x) => html`<button class=${cx('choice book', selL === x.i && 'sel', gone.has(x.i) && 'gone', bad && bad[0] === x.i && 'wrong')} onClick=${() => setSelL(x.i)}>${x.t}</button>`)}</div>
      <div class="col">${right.map((x) => html`<button class=${cx('choice', selR === x.i && 'sel', gone.has(x.i) && 'gone', bad && bad[1] === x.i && 'wrong')} onClick=${() => setSelR(x.i)}>${x.t}</button>`)}</div>
    </div>
  </div>`;
}

// ---------- grammar tip (not scored) ----------
export function Tip({ ex, L, onResult }) {
  return html`<div>
    <div class="prompt-kind">Grammar · ${ex.chapterTitle || ''}</div>
    <h2 class="book" style="font-weight:600">${ex.title}</h2>
    <div class="tip-body" dangerouslySetInnerHTML=${{ __html: ex.html }}></div>
    ${(ex.examples || []).map((x) => html`<div class="card flat tight" style="margin-top:.5rem">
      <div class="row"><div class="grow target" style="font-size:1.15rem"><${TappableText} text=${x[0]} L=${L}/></div><${Speak} text=${x[0]} lang=${L.lang}/></div>
      <div class="small muted">${x[1]}</div>${x[2] && html`<div class="tiny" style="color:var(--accent);margin-top:.2rem">${x[2]}</div>`}</div>`)}
    <div class="foot"><button class="btn block" onClick=${() => onResult({ correct: true, skip: true })}>Continue</button></div>
  </div>`;
}

// ---------- reading a text (dialogue, story, Gouin series) ----------
export function Read({ ex, L, onResult }) {
  const [inter, setInter] = useState(false);
  const [showEn, setShowEn] = useState(false);
  const [playing, setPlaying] = useState(-1);
  const playAll = async () => {
    for (let i = 0; i < ex.lines.length; i++) {
      setPlaying(i);
      const ok = await speech.speak(ex.lines[i].t, L.lang);
      if (!ok) break;
    }
    setPlaying(-1);
  };
  return html`<div>
    <div class="prompt-kind">${ex.label || 'Read'}</div>
    <h2 class="book" style="font-weight:600;margin-bottom:.2rem">${ex.title}</h2>
    ${ex.intro && html`<div class="small muted" style="margin-bottom:.8rem">${ex.intro}</div>`}
    <div class="row wrap" style="margin-bottom:.8rem">
      <button class="btn small ghost" onClick=${playAll}>▶ Listen to all</button>
      <button class=${cx('chip', showEn && 'on')} onClick=${() => setShowEn(!showEn)}>English</button>
    </div>
    <div class="reader">${ex.lines.map((ln, i) => html`<div style=${playing === i ? 'background:var(--gold-soft);border-radius:8px' : ''}>
      ${ln.sp && html`<div class="speaker">${ln.sp}</div>`}
      <p style="margin-bottom:.35em" class="row"><span class="grow"><${TappableText} text=${ln.t} L=${L} colorKnown=${true}/></span><${Speak} text=${ln.t} lang=${L.lang}/></p>
      ${showEn && html`<div class="line-en">${ln.e}</div>`}
    </div>`)}</div>
    <div class="foot"><button class="btn block" onClick=${() => onResult({ correct: true, skip: true, read: ex.lines.reduce((n, l) => n + splitWords(l.t, L.lang).length, 0) })}>Continue</button></div>
  </div>`;
}

// Put lines in order (Gouin series)
export function Order({ ex, L, onResult, answered }) {
  const [order, setOrder] = useState(() => ex.shuffled);
  const [done, setDone] = useState(false);
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= order.length || done) return;
    const n = [...order];
    [n[i], n[j]] = [n[j], n[i]];
    setOrder(n);
  };
  const check = () => {
    setDone(true);
    const ok = order.every((x, i) => x === i);
    onResult({ correct: ok, expected: ex.lines.map((l) => l.t).join(' → ') });
  };
  return html`<div>
    <div class="prompt-kind">${ex.label}</div>
    <div class="small muted" style="margin-bottom:.8rem">${ex.hint}</div>
    <div class="col">${order.map((k, i) => html`<div class=${cx('card tight row', done && (k === i ? 'right' : 'wrong'))} style=${done ? `border-color:var(--${k === i ? 'good' : 'bad'})` : ''}>
      <span class="grow book" style="font-size:1.08rem">${ex.lines[k].t}</span>
      <button class="iconbtn" onClick=${() => move(i, -1)}>▲</button><button class="iconbtn" onClick=${() => move(i, 1)}>▼</button></div>`)}</div>
    ${!done && !answered && html`<div class="foot"><button class="btn block" onClick=${check}>Check</button></div>`}
  </div>`;
}

export const VIEWS = { intro: Intro, mcq: MCQ, gender: Gender, conj: Conj, cloze: Cloze, type: Type, tiles: Tiles, speak: SpeakEx,
  match: Match, tip: Tip, read: Read, order: Order };
