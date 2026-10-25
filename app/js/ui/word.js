// How words are displayed: always with their article, gender color and key forms.
import * as DE from '../lang/de.js';
import * as IT from '../lang/it.js';

export function genderClass(entry) {
  if (!entry || entry.p !== 'n') return '';
  const g = entry.g;
  if (g === 'pl' || g === 'mpl' || g === 'fpl') return 'g-pl';
  if (g === 'mf') return 'g-m';
  return `g-${g}`;
}

// Article + noun for the headword: "der Tisch", "die Eltern", "l'amico", "il/la turista".
export function headword(entry, lang) {
  if (!entry) return { art: '', word: '' };
  if (entry.p !== 'n') return { art: '', word: entry.l };
  if (lang === 'de') {
    if (entry.adjn) return { art: entry.g === 'f' ? 'die' : 'der', word: entry.l, alt: `ein ${entry.stem}er / die ${entry.l}` };
    const art = entry.g === 'pl' ? 'die' : DE.DEF[entry.g]?.[0] || '';
    return { art, word: entry.l };
  }
  if (entry.g === 'mf') return { art: `${IT.defArticle(entry.l, 'm')}/${IT.defArticle(entry.l, 'f')}`.replace("l'/l'", "l'"), word: entry.l };
  const art = IT.defArticle(entry.l, entry.g === 'mpl' ? 'm' : entry.g === 'fpl' ? 'f' : entry.g, entry.g?.endsWith('pl') ? 'pl' : 'sg');
  return { art, word: entry.l };
}

export function headText(entry, lang) {
  const { art, word } = headword(entry, lang);
  if (!art) return word;
  return art.endsWith("'") ? art + word : `${art} ${word}`;
}

// Plural with article: "die Tische", "i tavoli", "le uova"
export function pluralText(entry, lang) {
  if (entry.p !== 'n') return '';
  if (lang === 'de') {
    if (entry.g === 'pl') return '';
    if (entry.adjn) return `die ${entry.pl}`;
    if (!entry.pl) return entry.unc ? 'no plural' : '';
    return `die ${entry.pl}`;
  }
  if (entry.g === 'mpl' || entry.g === 'fpl') return '';
  if (entry.unc) return 'no plural';
  if (!entry.pl) return '';
  return IT.withArticle(entry, 'pl') + (entry.plf ? ` / le ${entry.plf}` : '');
}

// Compact dictionary line: "der Tisch, -e" style for German; "il tavolo, pl. i tavoli" for Italian.
export function dictLine(entry, lang) {
  const parts = [];
  if (entry.p === 'n') {
    if (lang === 'de' && entry.gen && entry.gen !== entry.l) parts.push(`gen. ${DE.DEF[entry.g === 'pl' ? 'pl' : entry.g]?.[3] || ''} ${entry.gen}`.trim());
    const pl = pluralText(entry, lang);
    if (pl) parts.push(`pl. ${pl}`);
    if (entry.fem) parts.push(`f. ${entry.fem}`);
  } else if (entry.p === 'v') {
    const pp = (lang === 'de' ? DE : IT).principalParts(entry);
    if (pp) parts.push(pp.text);
  } else if (entry.p === 'a' && entry.a) {
    if (lang === 'de' && entry.a.cmp) parts.push(`${entry.a.cmp}, ${entry.a.sup || ''}`.replace(/, $/, ''));
    if (lang === 'it' && !entry.a.inv && entry.a.f && entry.a.f !== entry.l) parts.push(`${entry.a.f}, ${entry.a.mp}, ${entry.a.fp}`);
    if (lang === 'it' && entry.a.inv) parts.push('invariable');
  }
  return parts.join(' · ');
}

export const POS_LABEL = { n: 'noun', v: 'verb', a: 'adjective', adv: 'adverb', pron: 'pronoun', prep: 'preposition',
  conj: 'conjunction', art: 'article', det: 'determiner', num: 'number', intj: 'interjection', part: 'particle', phr: 'phrase' };

export function posLine(entry, lang) {
  const p = POS_LABEL[entry.p] || entry.p;
  if (entry.p === 'n') {
    const g = lang === 'de' ? DE.GENDER_NAMES[entry.g] : IT.GENDER_NAMES[entry.g];
    return `${p}, ${g || ''}`;
  }
  if (entry.p === 'v' && lang === 'de') {
    const bits = [];
    if (entry.v?.refl) bits.push(entry.v.refl === 'd' ? 'reflexive (dative)' : 'reflexive');
    if (entry.v?.sep) bits.push(`separable (${entry.v.sep}-)`);
    if (entry.v?.cls) bits.push(entry.v.cls.replace(/class \d+ /, ''));
    return [p, ...bits].join(', ');
  }
  if (entry.p === 'v' && lang === 'it') {
    const bits = [];
    if (entry.v?.refl) bits.push('reflexive');
    if (entry.v?.isc) bits.push('-isc-');
    bits.push(`aux. ${IT.auxLabel(entry)}`);
    return [p, ...bits].join(', ');
  }
  return p;
}

// Short English gloss for exercises: first sense group.
export function shortEn(entry) {
  return entry.en.split(';')[0].replace(/\s*\(.*?\)\s*/g, ' ').trim();
}

// Accepted English answers for recognition typing: every comma/semicolon-separated sense.
export function enAnswers(entry) {
  const out = new Set();
  for (const sense of entry.en.split(';')) {
    for (const a of sense.split(',')) {
      const t = a.replace(/\(.*?\)/g, '').replace(/^\s*(to|a|an|the)\s+/i, '').trim();
      if (t) { out.add(t); out.add(a.replace(/\(.*?\)/g, '').trim()); }
    }
  }
  return [...out].filter(Boolean);
}

// The text a learner must produce for a word: German nouns with article, verbs as infinitive.
export function targetText(entry, lang) {
  if (entry.p === 'n') return headText(entry, lang);
  return entry.l;
}

// A simple emoji picture for concrete words (Orbis Pictus style), when we have one.
const EMOJI = {
  Haus: '🏠', casa: '🏠', Hund: '🐕', cane: '🐕', Katze: '🐈', gatto: '🐈', Apfel: '🍎', mela: '🍎', Brot: '🍞', pane: '🍞',
  Wasser: '💧', acqua: '💧', Sonne: '☀️', sole: '☀️', Mond: '🌙', luna: '🌙', Baum: '🌳', albero: '🌳', Blume: '🌸', fiore: '🌸',
  Auto: '🚗', macchina: '🚗', Zug: '🚆', treno: '🚆', Buch: '📖', libro: '📖', Kaffee: '☕', caffè: '☕', Bier: '🍺', birra: '🍺',
  Wein: '🍷', vino: '🍷', Käse: '🧀', formaggio: '🧀', Fisch: '🐟', pesce: '🐟', Pferd: '🐎', cavallo: '🐎', Vogel: '🐦', uccello: '🐦',
  Herz: '❤️', cuore: '❤️', Schuh: '👞', scarpa: '👞', Hut: '🎩', cappello: '🎩', Uhr: '⌚', orologio: '⌚', Schlüssel: '🔑', chiave: '🔑',
  Kind: '🧒', bambino: '🧒', Mann: '👨', uomo: '👨', Frau: '👩', donna: '👩', Baby: '👶', König: '🤴', re: '🤴', Königin: '👸', regina: '👸',
  Schiff: '🚢', nave: '🚢', Flugzeug: '✈️', aereo: '✈️', Fahrrad: '🚲', bicicletta: '🚲', Bus: '🚌', autobus: '🚌',
  Tisch: '🪑', tavolo: '🪑', Bett: '🛏️', letto: '🛏️', Telefon: '☎️', telefono: '☎️', Handy: '📱', cellulare: '📱',
  Regen: '🌧️', pioggia: '🌧️', Schnee: '❄️', neve: '❄️', Berg: '⛰️', montagna: '⛰️', Meer: '🌊', mare: '🌊',
  Ei: '🥚', uovo: '🥚', Milch: '🥛', latte: '🥛', Kuchen: '🍰', torta: '🍰', Eis: '🍨', gelato: '🍨', Pizza: '🍕', pizza: '🍕',
  Hand: '✋', mano: '✋', Auge: '👁️', occhio: '👁️', Ohr: '👂', orecchio: '👂', Nase: '👃', naso: '👃', Mund: '👄', bocca: '👄',
  Geld: '💶', soldi: '💶', Geschenk: '🎁', regalo: '🎁', Stern: '⭐', stella: '⭐', Feuer: '🔥', fuoco: '🔥', Wolf: '🐺', lupo: '🐺',
  Frosch: '🐸', rana: '🐸', Maus: '🐭', topo: '🐭', Bär: '🐻', orso: '🐻', Fuchs: '🦊', volpe: '🦊', Hexe: '🧙‍♀️', strega: '🧙‍♀️',
  Schloss: '🏰', castello: '🏰', Krone: '👑', corona: '👑', Schwert: '⚔️', spada: '⚔️', Kirche: '⛪', chiesa: '⛪',
  Tomate: '🍅', pomodoro: '🍅', Kartoffel: '🥔', patata: '🥔', Zitrone: '🍋', limone: '🍋', Banane: '🍌', banana: '🍌',
  Brief: '✉️', lettera: '✉️', Zeitung: '📰', giornale: '📰', Musik: '🎵', musica: '🎵', Ball: '⚽', palla: '⚽',
  Burattino: '🤥', burattino: '🤥', Drache: '🐉', drago: '🐉', Riese: '🧌', gigante: '🧌', Fee: '🧚', fata: '🧚',
  Löwe: '🦁', leone: '🦁', Kuh: '🐄', mucca: '🐄', Schwein: '🐖', maiale: '🐖', Schaf: '🐑', pecora: '🐑', Huhn: '🐔', gallina: '🐔',
};
export function emoji(entry) { return EMOJI[entry?.l] || ''; }
