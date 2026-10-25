// Spaced repetition: FSRS-4.5 with the published default weights.
// Every learnable "facet" of a word (meaning, gender, plural, verb forms, ...) is one card.
// A card is a small plain object so it serializes and syncs cheaply:
//   { s: stability (days), d: difficulty (1-10), due: ms epoch, last: ms epoch, n: reviews, lapses }

const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474,
  0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
const DECAY = -0.5;
const FACTOR = 19 / 81; // makes retrievability exactly 0.9 when elapsed == stability
const DAY = 86400000;
export const RETENTION = 0.9;

export const AGAIN = 1, HARD = 2, GOOD = 3, EASY = 4;

const clampD = (d) => Math.min(10, Math.max(1, d));
const initD = (g) => clampD(W[4] - (g - 3) * W[5]);

export function retrievability(card, now = Date.now()) {
  if (!card || !card.last) return 0;
  const t = Math.max(0, (now - card.last) / DAY);
  return Math.pow(1 + FACTOR * t / card.s, DECAY);
}

function intervalDays(s, r = RETENTION) {
  return Math.max(0.5, (s / FACTOR) * (Math.pow(r, 1 / DECAY) - 1));
}

// Apply one rating. Ratings within the same lesson should be collapsed to one call
// (the first attempt), otherwise stability would be inflated by same-minute repeats.
export function review(card, grade, now = Date.now()) {
  let s, d;
  if (!card || !card.last) {
    s = W[grade - 1];
    d = initD(grade);
  } else {
    const r = retrievability(card, now);
    const d1 = card.d - W[6] * (grade - 3);
    d = clampD(W[7] * initD(4) + (1 - W[7]) * d1);
    if (grade === AGAIN) {
      s = W[11] * Math.pow(card.d, -W[12]) * (Math.pow(card.s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r));
      s = Math.min(s, card.s);
    } else {
      const hard = grade === HARD ? W[15] : 1;
      const easy = grade === EASY ? W[16] : 1;
      s = card.s * (Math.exp(W[8]) * (11 - card.d) * Math.pow(card.s, -W[9]) *
        (Math.exp(W[10] * (1 - r)) - 1) * hard * easy + 1);
    }
  }
  s = Math.max(0.1, s);
  return {
    s: +s.toFixed(4),
    d: +d.toFixed(4),
    last: now,
    due: now + Math.round(intervalDays(s) * DAY),
    n: (card?.n || 0) + 1,
    lapses: (card?.lapses || 0) + (grade === AGAIN && card?.last ? 1 : 0),
  };
}

// Mastery stage 0-5 shown as badges; 5 = "gold" (stable for two months or more).
export function stage(card) {
  if (!card || !card.last) return 0;
  const s = card.s;
  if (s < 2) return 1;
  if (s < 7) return 2;
  if (s < 21) return 3;
  if (s < 60) return 4;
  return 5;
}

export const STAGE_NAMES = ['new', 'seen', 'learning', 'familiar', 'strong', 'mastered'];

export function isDue(card, now = Date.now()) {
  return !!card && !!card.last && card.due <= now;
}

// Most-forgotten first, so a short review session does the most good.
export function dueKeys(cards, now = Date.now(), limit = Infinity) {
  const out = [];
  for (const k in cards) if (isDue(cards[k], now)) out.push([k, retrievability(cards[k], now)]);
  out.sort((a, b) => a[1] - b[1]);
  return out.slice(0, limit).map((x) => x[0]);
}

// Merge for sync: the card with the later review wins.
export function mergeCards(a = {}, b = {}) {
  const out = { ...a };
  for (const k in b) if (!out[k] || (b[k].last || 0) > (out[k].last || 0)) out[k] = b[k];
  return out;
}
