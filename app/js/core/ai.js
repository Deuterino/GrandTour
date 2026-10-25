// Optional Claude features (the user's own Anthropic API key, stored only on this device).
// Uses the official Anthropic TypeScript SDK, vendored as ES modules and loaded on first use.
import * as store from './store.js';
import * as db from './db.js';
import { hash } from './text.js';

export const MODELS = [
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', note: 'best explanations (default)' },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', note: 'faster, about half the price' },
  { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', note: 'fastest and cheapest' },
];
// Server-side refusal fallbacks are available on these models (not on Haiku).
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5']);
const LANG = { de: 'German', it: 'Italian' };

export const available = () => !!store.get()?.settings?.aiKey;

let sdk = null;
async function getClient() {
  const key = store.get()?.settings?.aiKey;
  if (!key) throw new Error('Add your Anthropic API key in Settings first.');
  if (!sdk) {
    try {
      sdk = (await import('../vendor/anthropic/sdk.mjs')).default;
    } catch (e) {
      throw new Error('This browser is too old for the AI features (use Chrome, or Safari on iOS 16.4 or later).');
    }
  }
  return { Anthropic: sdk, client: new sdk({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 2, timeout: 90_000 }) };
}

function model() { return store.get()?.settings?.aiModel || 'claude-opus-5-5'; }

async function call({ system, user, schema = null, effort = 'low' }) {
  const { Anthropic, client } = await getClient();
  const m = model();
  const params = {
    model: m,
    max_tokens: 16000,
    system,
    messages: [{ role: 'user', content: user }],
    output_config: { effort, ...(schema ? { format: { type: 'json_schema', schema } } : {}) },
  };
  let res;
  try {
    res = FALLBACK_MODELS.has(m)
      ? await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : await client.messages.create(params);
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error('The API key was rejected. Check it in Settings.');
    if (e instanceof Anthropic.PermissionDeniedError) throw new Error('This API key is not allowed to use that model.');
    if (e instanceof Anthropic.RateLimitError) throw new Error('Rate limited — try again in a minute.');
    if (e instanceof Anthropic.APIConnectionError) throw new Error('No connection to the Claude API (are you offline?).');
    if (e instanceof Anthropic.APIError) throw new Error(`Claude API error ${e.status ?? ''}: ${e.message}`);
    throw e;
  }
  if (res.stop_reason === 'refusal') throw new Error('Claude declined this request.');
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  if (!schema) return text;
  return JSON.parse(text);
}

async function cached(kind, key, fn) {
  const k = `ai:${kind}:${model()}:${hash(key)}`;
  const hit = await db.get(k);
  if (hit) return hit;
  const v = await fn();
  await db.set(k, v);
  return v;
}

const S = (props, extra = {}) => ({ type: 'object', additionalProperties: false, required: Object.keys(props), properties: props, ...extra });
const str = { type: 'string' };

const EXPLAIN_SCHEMA = S({
  translation: str,
  literal: str,
  words: { type: 'array', items: S({ form: str, lemma: str, pos: str, grammar: str, meaning: str }) },
  notes: { type: 'array', items: str },
});

function tutor(lang) {
  return `You are a patient, precise ${LANG[lang]} teacher for an English speaker at A1–B1 level who is learning conversational ${LANG[lang]}. ` +
    'Be accurate about grammar: case, gender, number, tense, mood, person, separable prefixes, reflexives, clitics and agreement. ' +
    'Use plain English with grammar terms the learner can look up (e.g. "dative", "passato prossimo"). Keep explanations short.';
}

// Word-by-word explanation of one sentence (reader popups).
export async function explainSentence(sentence, focus, lang) {
  const r = await cached('explain', `${lang}|${sentence}`, () => call({
    system: tutor(lang),
    user: `Explain this ${LANG[lang]} sentence word by word. The learner tapped "${focus}".\n\nSentence: ${sentence}\n\n` +
      'For each word give its dictionary form (nouns with their article), part of speech, its grammatical form here, and its meaning in this sentence. ' +
      'Then give a natural English translation, a word-for-word literal translation, and up to three short notes on the grammar or idioms that matter most.',
    schema: EXPLAIN_SCHEMA,
  }));
  return formatExplanation(r);
}

export function formatExplanation(r) {
  const lines = [`“${r.translation}”`, r.literal ? `literally: ${r.literal}` : '', ''];
  for (const w of r.words || []) lines.push(`• ${w.form} — ${w.lemma} (${w.pos}${w.grammar ? ', ' + w.grammar : ''}): ${w.meaning}`);
  if (r.notes?.length) lines.push('', ...r.notes.map((n) => `💡 ${n}`));
  return lines.filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n');
}

const GRADE_SCHEMA = S({ acceptable: { type: 'boolean' }, feedback: str, corrected: str });

// Grade a free translation the built-in checker could not match.
export async function gradeTranslation({ prompt, accepted, answer, toLang, lang }) {
  return cached('grade', `${lang}|${prompt}|${answer}`, () => call({
    system: tutor(lang),
    user: `A learner translated a sentence ${toLang === 'en' ? `from ${LANG[lang]} into English` : `from English into ${LANG[lang]}`}.\n` +
      `Original: ${prompt}\nReference answers: ${accepted.join(' | ')}\nLearner's answer: ${answer}\n\n` +
      'Is the learner\'s answer a correct, natural translation (small spelling slips are fine, grammar mistakes are not)? ' +
      'Give one or two sentences of feedback naming any mistake, and the corrected version of the learner\'s own answer.',
    schema: GRADE_SCHEMA,
  }));
}

// Free question about a grammar topic (grammar pages).
export async function askGrammar(question, topic, lang) {
  return call({
    system: tutor(lang) + ' Answer with a short explanation and two or three example sentences with English translations.',
    user: `Topic: ${topic}\nQuestion: ${question}`,
    effort: 'medium',
  });
}

const WORD_SCHEMA = S({ lemma: str, pos: str, gender: str, plural: str, meaning: str, form: str });

// A word missing from both dictionaries (books): what is it?
export async function analyzeWord(word, sentence, lang) {
  return cached('word', `${lang}|${word}|${sentence}`, () => call({
    system: tutor(lang),
    user: `In the ${LANG[lang]} sentence "${sentence}", what is the word "${word}"? Give its dictionary form, part of speech, ` +
      'gender and plural if it is a noun (else empty strings), its meaning here, and its grammatical form in this sentence. ' +
      'If it is an archaic or regional form, say so in "form".',
    schema: WORD_SCHEMA,
  }));
}
