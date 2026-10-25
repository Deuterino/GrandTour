// Text utilities shared by exercises, the reader and speech scoring.

const LETTER = /[\p{L}\p{M}]/u;
const WORDCH = /[\p{L}\p{M}\p{N}]/u;

export const nfc = (s) => (s || '').normalize('NFC');
export const unifyApostrophes = (s) => s.replace(/[’ʼ`´]/g, "'");

export function stripDiacritics(s) {
  // Keep ß (handled separately); remove combining marks from everything else.
  return nfc(s).normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
}

// Tokenize running text. Returns [{t, k}] where k is 'w' (word), 'p' (punctuation) or 's' (space).
// Italian elision splits after the apostrophe (l'|amico, dell'|acqua, c'|è); a trailing apostrophe
// stays with its word (po', va', di'). German keeps "geht's" whole; the analyzer expands it.
export function tokenize(text, lang) {
  const s = nfc(text);
  const out = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      let j = i;
      while (j < s.length && /\s/.test(s[j])) j++;
      out.push({ t: s.slice(i, j), k: 's' });
      i = j;
    } else if (WORDCH.test(ch)) {
      let j = i;
      while (j < s.length) {
        const c = s[j];
        if (WORDCH.test(c)) { j++; continue; }
        if ((c === '-' || c === '‐') && WORDCH.test(s[j + 1] || '') && WORDCH.test(s[j - 1] || '')) { j++; continue; }
        if (c === "'" || c === '’') {
          const next = s[j + 1] || '';
          if (lang === 'it' && LETTER.test(next)) { j++; break; } // elision: split after apostrophe
          if (lang === 'de' && LETTER.test(next)) { j++; continue; } // geht's, wie's
          if (!LETTER.test(next)) { // truncation: po', va'
            if (lang === 'it' || lang === 'de') j++;
            break;
          }
        }
        break;
      }
      out.push({ t: s.slice(i, j), k: 'w' });
      i = j;
    } else {
      out.push({ t: ch, k: 'p' });
      i++;
    }
  }
  return out;
}

export const words = (text, lang) => tokenize(text, lang).filter((x) => x.k === 'w').map((x) => x.t);

export function splitSentences(text) {
  const out = [];
  const re = /[^.!?…]+(?:[.!?…]+["»“”’)]*|$)/g;
  let m;
  while ((m = re.exec(text))) {
    const t = m[0].trim();
    if (t) out.push(t);
  }
  return out;
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1), cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

// Lowercased, punctuation-free form used to compare answers.
export function simplify(s) {
  return unifyApostrophes(nfc(s))
    .replace(/[.,!?;:¡¿"«»„“”‚‘()\[\]…–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Ways a learner without a German/Italian keyboard writes special letters.
function keyboardFold(s, lang) {
  let x = s;
  if (lang === 'de') {
    x = x.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  } else if (lang === 'it') {
    x = x.replace(/([aeiou])'(?=\s|$)/g, '$1'); // e' for è
  }
  return stripDiacritics(x);
}

const SHORT = 3; // words this short must be exact: articles, pronouns, endings carry grammar

function wordStatus(inp, exp, lang, strict) {
  if (inp === exp) return 'ok';
  if (inp.toLowerCase() === exp.toLowerCase()) return 'case';
  const fi = keyboardFold(inp.toLowerCase(), lang), fe = keyboardFold(exp.toLowerCase(), lang);
  if (fi === fe) return 'accent';
  if (strict) return 'wrong';
  if (exp.length > SHORT && levenshtein(fi, fe) <= (exp.length >= 9 ? 2 : 1)) return 'typo';
  return 'wrong';
}

// Align two token lists (classic edit-distance DP) so feedback can mark each word.
export function alignWords(inputWords, expectedWords, lang, strict = false) {
  const m = inputWords.length, n = expectedWords.length;
  const cost = (i, j) => {
    const st = wordStatus(inputWords[i], expectedWords[j], lang, strict);
    return st === 'ok' || st === 'case' ? 0 : st === 'accent' ? 0.1 : st === 'typo' ? 0.4 : 1;
  };
  const D = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) D[i][0] = i;
  for (let j = 0; j <= n; j++) D[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + cost(i - 1, j - 1));
  const ops = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && D[i][j] === D[i - 1][j - 1] + cost(i - 1, j - 1)) {
      ops.push({ t: expectedWords[j - 1], got: inputWords[i - 1], s: wordStatus(inputWords[i - 1], expectedWords[j - 1], lang, strict) });
      i--; j--;
    } else if (j > 0 && (i === 0 || D[i][j] === D[i][j - 1] + 1)) {
      ops.push({ t: expectedWords[j - 1], s: 'missing' });
      j--;
    } else {
      ops.push({ got: inputWords[i - 1], s: 'extra' });
      i--;
    }
  }
  return { ops: ops.reverse(), dist: D[m][n] };
}

const NOTE = {
  case: 'Check capitalization (German nouns are always capitalized).',
  accent: 'Watch the special letters/accents.',
  typo: 'Small typo.',
};

// Compare a typed answer with the accepted answers.
// strict: grammar drills, where a one-letter difference is a different form (den/dem).
export function checkAnswer(input, accepted, lang, { strict = false } = {}) {
  const inpW = simplifyKeepCase(input, lang);
  let best = null;
  for (const a of accepted) {
    const expW = simplifyKeepCase(a, lang);
    const al = alignWords(inpW, expW, lang, strict);
    const bad = al.ops.filter((o) => o.s === 'wrong' || o.s === 'missing' || o.s === 'extra').length;
    const score = bad * 10 + al.dist;
    if (!best || score < best.score) best = { score, bad, al, expected: a };
  }
  if (!best) return { correct: false, expected: '', ops: [], notes: [] };
  const kinds = new Set(best.al.ops.map((o) => o.s));
  const notes = ['case', 'accent', 'typo'].filter((k) => kinds.has(k)).map((k) => NOTE[k]);
  return {
    correct: best.bad === 0,
    exact: best.bad === 0 && notes.length === 0,
    expected: best.expected,
    ops: best.al.ops,
    notes,
  };
}

function simplifyKeepCase(s, lang) {
  const t = unifyApostrophes(nfc(s)).replace(/[.,!?;:¡¿"«»„“”‚‘()\[\]…–—]/g, ' ').trim();
  return words(t, lang);
}

// Number words so "3" from speech recognition matches "drei"/"tre".
const NUM = {
  de: ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn',
    'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn', 'zwanzig'],
  it: ['zero', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci',
    'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove', 'venti'],
};

function speechWords(s, lang) {
  return simplify(s).split(' ').filter(Boolean).map((w) => {
    if (/^\d+$/.test(w) && +w <= 20) return NUM[lang][+w];
    return w;
  });
}

// Score a speech-recognition transcript against the target sentence.
// Returns { score 0..1, ops } where ops mark each target word ok/close/missed.
export function scoreSpeech(transcripts, target, lang) {
  const tw = speechWords(target, lang);
  let best = null;
  for (const tr of transcripts) {
    const al = alignWords(speechWords(tr, lang), tw, lang, false);
    let pts = 0;
    for (const o of al.ops) {
      if (o.s === 'ok' || o.s === 'case' || o.s === 'accent') pts += 1;
      else if (o.s === 'typo') pts += 0.6;
    }
    const score = tw.length ? pts / tw.length : 0;
    if (!best || score > best.score) best = { score, ops: al.ops.filter((o) => o.s !== 'extra'), heard: tr };
  }
  return best || { score: 0, ops: tw.map((t) => ({ t, s: 'missing' })), heard: '' };
}

export function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const sample = (arr, k, rnd) => shuffle(arr, rnd).slice(0, k);
export const pick = (arr, rnd = Math.random) => arr[Math.floor(rnd() * arr.length)];

export function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
