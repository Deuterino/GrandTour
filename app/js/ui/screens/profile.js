// Profile (stats, passport, achievements, treasure) and Settings.
import { html, useState, useEffect, useCourse, useStore, cx, toast } from '../h.js';
import * as store from '../../core/store.js';
import * as game from '../../core/game.js';
import * as SRS from '../../core/srs.js';
import * as speech from '../../core/speech.js';
import * as sync from '../../core/sync.js';
import * as ai from '../../core/ai.js';
import { Bar, Icon, BackBar } from '../components.js';
import { unitState } from './home.js';
import { go } from '../router.js';

function XPChart({ c }) {
  const days = [...Array(14)].map((_, i) => { const d = new Date(Date.now() - (13 - i) * 86400000); return store.today(d); });
  const vals = days.map((d) => game.xpOn(c, d));
  const max = Math.max(50, ...vals);
  return html`<svg viewBox="0 0 280 90" width="100%" role="img" aria-label="XP in the last 14 days">
    ${vals.map((v, i) => html`<g><rect x=${i * 20 + 3} y=${80 - (v / max) * 70} width="14" height=${Math.max(1.5, (v / max) * 70)} rx="3" fill="var(--accent)" opacity=${i === 13 ? 1 : 0.65}/>
      <text x=${i * 20 + 10} y="89" font-size="7" text-anchor="middle" fill="var(--muted)">${days[i].slice(8)}</text></g>`)}</svg>`;
}

function Heat({ c }) {
  const days = game.activeDays(c);
  const cells = [...Array(84)].map((_, i) => { const d = store.today(new Date(Date.now() - (83 - i) * 86400000)); const xp = game.xpOn(c, d);
    return xp >= 100 ? 'l3' : xp >= 30 ? 'l2' : days.has(d) ? 'l1' : ''; });
  return html`<div class="heat">${cells.map((k) => html`<i class=${k}></i>`)}</div>`;
}

export function Profile() {
  const L = useCourse();
  useStore();
  const lang = L.lang;
  const c = store.course(lang);
  const lv = game.level(c);
  const t = game.title(lang, lv.n);
  const st = game.streak(c);
  const stages = [0, 0, 0, 0, 0, 0];
  const byWord = {};
  for (const [k, v] of Object.entries(c.cards)) { const id = k.split('|')[0]; byWord[id] = Math.min(byWord[id] ?? 9, SRS.stage(v)); }
  Object.values(byWord).forEach((x) => stages[x]++);
  stages[0] = L.entries.length - Object.keys(byWord).length;
  const stamps = L.course.units.filter((u, i) => unitState(L, c, i).complete);
  const freezes = game.freezes(c);
  return html`<div>
    <div class="row between"><h1 style="margin:0">${t.name}</h1><button class="btn small ghost" onClick=${() => go(`/${lang}/settings`)}>⚙️ Settings</button></div>
    <div class="muted" style="margin-bottom:.8rem">${t.en} · level ${lv.n} · ${lv.xp.toLocaleString()} XP</div>
    <${Bar} value=${lv.frac}/>
    <div class="grid3" style="margin-top:1rem">
      <div class="card tight center"><b style="font-size:1.4rem;color:#e8710a">🔥 ${st.n}</b><div class="tiny muted">day streak</div></div>
      <div class="card tight center"><b style="font-size:1.4rem">${game.wordsLearned(c)}</b><div class="tiny muted">words learned</div></div>
      <div class="card tight center"><b style="font-size:1.4rem;color:var(--gold)">${game.masteredCount(c)}</b><div class="tiny muted">mastered</div></div>
    </div>
    <div class="section-title">Last two weeks</div><div class="card tight"><${XPChart} c=${c}/></div>
    <div class="section-title">Your calendar</div><div class="card tight"><${Heat} c=${c}/></div>
    <div class="section-title">Your word treasure</div>
    <div class="card tight">${SRS.STAGE_NAMES.map((n, i) => html`<div class="row small" style="padding:.15rem 0"><span style="width:6.5rem">${n}</span>
      <div class="grow"><${Bar} value=${stages[i] / L.entries.length} kind=${i >= 4 ? 'gold' : ''}/></div><span style="width:3rem;text-align:right">${stages[i]}</span></div>`)}</div>
    <div class="section-title">${game.COIN[lang].name} & streak freezes</div>
    <div class="card row"><span style="font-size:2rem">${Icon.coin({ width: 34, style: 'color:var(--gold)' })}</span>
      <div class="grow"><b>${game.coins(c)} ${game.COIN[lang].name}</b><div class="small muted">${freezes} streak freeze${freezes === 1 ? '' : 's'} — used automatically if you miss a day</div></div>
      <button class="btn small gold" disabled=${game.coins(c) < game.FREEZE_PRICE} onClick=${() => { if (game.buyFreeze(lang)) toast('🧊 Streak freeze ready'); }}>Buy freeze · ${game.FREEZE_PRICE}</button></div>
    <div class="section-title">${lang === 'de' ? 'Reisepass' : 'Passaporto'} — ${stamps.length} of ${L.course.units.length} stops</div>
    <div class="row wrap" style="gap:.6rem">${stamps.length ? stamps.map((u) => html`<div class="stamp"><div><span class="s-ico">${u.emoji}</span>${u.city}</div></div>`)
      : html`<div class="small muted">Complete a stop to get its stamp.</div>`}</div>
    <div class="section-title">Achievements</div>
    <div class="grid3">${game.ACHIEVEMENTS.map((a) => html`<div class=${cx('badge', !c.ach[a.id] && 'locked')}><span class="b-ico">${a.icon}</span>
      <span class="b-name">${a.name}</span><span class="b-desc">${a.desc}</span></div>`)}</div>
  </div>`;
}

function Toggle({ label, desc, value, onChange }) {
  return html`<label class="switch"><span><b>${label}</b>${desc && html`<div class="small muted">${desc}</div>`}</span>
    <input type="checkbox" checked=${value} onChange=${(e) => onChange(e.target.checked)}/></label>`;
}

export function Settings() {
  const L = useCourse();
  const s = useStore();
  const lang = L.lang;
  const set = (k, v) => store.update((st) => { st.settings[k] = v; });
  const [voices, setVoices] = useState(speech.voices(lang));
  const [syncMsg, setSyncMsg] = useState(sync.status().msg);
  const [busy, setBusy] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVoices(speech.voices(lang)), 600); return () => clearTimeout(t); }, [lang]);
  const runSync = async () => { setBusy(true); const r = await sync.syncNow(); setSyncMsg(r.msg); setBusy(false); };
  const testAI = async () => {
    setBusy(true);
    try { const r = await ai.explainSentence(lang === 'de' ? 'Ich habe Hunger.' : 'Ho fame.', lang === 'de' ? 'Hunger' : 'fame', lang); toast('Claude is connected ✓'); console.log(r); }
    catch (e) { toast(e.message); }
    setBusy(false);
  };
  const st = s.settings;
  return html`<div>
    <${BackBar} title="Settings"/>
    <div class="card">
      <h3>Learning</h3>
      <label class="field">Daily goal<select value=${st.dailyGoal} onChange=${(e) => set('dailyGoal', +e.target.value)}>
        ${[[20, 'Casual · 20 XP'], [50, 'Regular · 50 XP'], [100, 'Serious · 100 XP'], [150, 'Intense · 150 XP']].map(([v, l]) => html`<option value=${v}>${l}</option>`)}</select></label>
      <${Toggle} label="Speaking exercises" desc="Read aloud with speech recognition" value=${st.speaking} onChange=${(v) => set('speaking', v)}/>
      <${Toggle} label="Listening exercises" desc="Pick or write what you hear" value=${st.listening} onChange=${(v) => set('listening', v)}/>
      <label class="field">Review limit before new lessons<select value=${st.reviewGate} onChange=${(e) => set('reviewGate', +e.target.value)}>
        ${[[0, 'Off — hearts only'], [30, '30 cards'], [60, '60 cards'], [120, '120 cards']].map(([v, l]) => html`<option value=${v}>${l}</option>`)}</select></label>
      <div class="small muted">Hearts are lost on first-try mistakes in new lessons and refilled by reviewing. Reviews, practice, reading and grammar are never blocked.</div>
    </div>
    <div class="card">
      <h3>Sound & voices</h3>
      <${Toggle} label="Sound effects" value=${st.sound} onChange=${(v) => set('sound', v)}/>
      <${Toggle} label="Play words automatically" value=${st.autoplay} onChange=${(v) => set('autoplay', v)}/>
      <${Toggle} label="Native recordings for words" desc="Wikimedia recordings by native speakers when online" value=${st.nativeAudio} onChange=${(v) => set('nativeAudio', v)}/>
      <label class="field">${lang === 'de' ? 'German' : 'Italian'} voice<select value=${st.voice[lang] || ''} onChange=${(e) => store.update((x) => { x.settings.voice[lang] = e.target.value || null; })}>
        <option value="">Best available</option>${voices.map((v) => html`<option value=${v.voiceURI}>${v.name} (${v.lang})${/enhanced|premium/i.test(v.name) ? ' ★' : ''}</option>`)}</select></label>
      <label class="field">Speed: ${st.rate.toFixed(2)}×<input type="range" min="0.5" max="1.2" step="0.05" value=${st.rate} onInput=${(e) => set('rate', +e.target.value)}/></label>
      <button class="btn small ghost" onClick=${() => speech.speak(lang === 'de' ? 'Guten Tag! Wie geht es Ihnen?' : 'Buongiorno! Come sta?', lang)}>▶ Test voice</button>
      <div class="tiny muted" style="margin-top:.5rem">Tip: on iPhone, download higher-quality voices in Settings → Accessibility → Spoken Content → Voices.</div>
    </div>
    <div class="card">
      <h3>Appearance</h3>
      <label class="field">Theme<select value=${st.theme} onChange=${(e) => set('theme', e.target.value)}>
        <option value="auto">Match system</option><option value="light">Light (paper)</option><option value="dark">Dark (lamplight)</option></select></label>
      <${Toggle} label="Mark unknown words in texts" value=${st.highlightKnown} onChange=${(v) => set('highlightKnown', v)}/>
      <${Toggle} label="Interlinear glosses by default" desc="Hamilton-style word-by-word English under the text" value=${st.interlinear} onChange=${(v) => set('interlinear', v)}/>
    </div>
    <div class="card">
      <h3>AI tutor (optional)</h3>
      <p class="small muted">With your own Anthropic API key, Claude can explain whole sentences in books, grade free translations and answer grammar questions. The key stays on this device and is sent only to api.anthropic.com. Everything else works without it.</p>
      <label class="field">Anthropic API key<input type="password" value=${st.aiKey} placeholder="sk-ant-…" onChange=${(e) => set('aiKey', e.target.value.trim())} autocomplete="off"/></label>
      <label class="field">Model<select value=${st.aiModel} onChange=${(e) => set('aiModel', e.target.value)}>${ai.MODELS.map((m) => html`<option value=${m.id}>${m.name} — ${m.note}</option>`)}</select></label>
      <button class="btn small ghost" disabled=${!st.aiKey || busy} onClick=${testAI}>Test connection</button>
    </div>
    <div class="card">
      <h3>Sync between devices</h3>
      <p class="small muted">Progress is merged through a private GitHub Gist. Create a token at github.com → Settings → Developer settings → Personal access tokens → Fine-grained token with <b>Gists: read and write</b> (or a classic token with the <b>gist</b> scope), and paste it here on each device.</p>
      <label class="field">GitHub token<input type="password" value=${st.gistToken} placeholder="github_pat_… or ghp_…" onChange=${(e) => set('gistToken', e.target.value.trim())} autocomplete="off"/></label>
      <${Toggle} label="Sync automatically" value=${st.autoSync} onChange=${(v) => set('autoSync', v)}/>
      <div class="row"><button class="btn small" disabled=${!st.gistToken || busy} onClick=${runSync}>${busy ? 'Syncing…' : 'Sync now'}</button><span class="small muted">${syncMsg}</span></div>
      <div class="divider"></div>
      <div class="row wrap"><button class="btn small ghost" onClick=${sync.exportFile}>Download backup</button>
        <label class="btn small ghost">Import backup<input type="file" accept="application/json,.json" style="display:none" onChange=${async (e) => {
          const f = e.target.files?.[0]; if (!f) return; try { await sync.importFile(f); toast('Backup merged'); } catch (err) { toast(err.message); } }}/></label></div>
    </div>
    <div class="card">
      <h3>About</h3>
      <p class="small">Grand Tour teaches with methods from old language books — Ollendorff's question-and-answer drills, Gouin's action series, Hamilton's interlinear readers, the principal parts and declension tables of 19th-century grammars — combined with spaced repetition (FSRS).</p>
      <p class="tiny muted">Vocabulary frequency: OpenSubtitles via FrequencyWords. Dictionary data, inflections and native recordings: Wiktionary & Wikimedia Commons (CC BY-SA). Example sentences: Tatoeba (CC BY 2.0 FR). Books: Project Gutenberg & Wikisource (public domain). Code: Preact (MIT), htm (Apache-2.0), fflate (MIT), Anthropic SDK (Apache-2.0).</p>
      <button class="btn small bad" onClick=${() => { if (confirm(`Reset ALL ${lang === 'de' ? 'German' : 'Italian'} progress on this device?`)) { store.update((x) => { x.courses[lang] = store.newCourseState(); }); toast('Progress reset'); } }}>Reset this course</button>
    </div>
  </div>`;
}
