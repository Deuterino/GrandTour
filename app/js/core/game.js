// Game layer: XP, levels and titles, streaks, hearts, coins, achievements.
import * as store from './store.js';
import * as SRS from './srs.js';

export const COIN = { de: { name: 'Taler', icon: '🪙' }, it: { name: 'Fiorini', icon: '🪙' } };

const TITLES = {
  de: [[1, 'Lehrling'], [4, 'Geselle'], [8, 'Wandergeselle'], [13, 'Altgeselle'], [19, 'Meister'], [26, 'Obermeister'], [36, 'Großmeister']],
  it: [[1, 'Apprendista'], [4, 'Garzone di bottega'], [8, 'Artigiano'], [13, "Maestro d'arte"], [19, 'Maestro'], [26, 'Gran Maestro'], [36, 'Umanista']],
};
const TITLE_EN = { Lehrling: 'apprentice', Geselle: 'journeyman', Wandergeselle: 'traveling journeyman', Altgeselle: 'senior journeyman',
  Meister: 'master craftsman', Obermeister: 'guild master', Großmeister: 'grand master', Apprendista: 'apprentice',
  'Garzone di bottega': 'workshop boy', Artigiano: 'craftsman', "Maestro d'arte": 'master of the art', Maestro: 'master',
  'Gran Maestro': 'grand master', Umanista: 'humanist scholar' };

export const xpForLevel = (n) => 25 * n * (n - 1); // level 1: 0, 2: 50, 3: 150, 4: 300 ...

export function totalXP(c) {
  let s = 0;
  for (const dev of Object.values(c.xp || {})) for (const v of Object.values(dev)) s += v;
  return s;
}

export function xpOn(c, day) {
  let s = 0;
  for (const dev of Object.values(c.xp || {})) s += dev[day] || 0;
  return s;
}

export function level(c) {
  const xp = totalXP(c);
  let n = 1;
  while (xpForLevel(n + 1) <= xp) n++;
  return { n, xp, from: xpForLevel(n), to: xpForLevel(n + 1), frac: (xp - xpForLevel(n)) / (xpForLevel(n + 1) - xpForLevel(n)) };
}

export function title(lang, n) {
  let t = TITLES[lang][0][1];
  for (const [lv, name] of TITLES[lang]) if (n >= lv) t = name;
  return { name: t, en: TITLE_EN[t] };
}

export function addXP(lang, n) {
  store.update((s) => {
    const c = store.course(lang);
    const d = store.today();
    c.xp[s.device] = c.xp[s.device] || {};
    c.xp[s.device][d] = (c.xp[s.device][d] || 0) + n;
  });
}

// ---- streak ----
const DAY = 86400000;
function dayStr(t) { return store.today(new Date(t)); }

export function activeDays(c) {
  const days = new Set();
  for (const dev of Object.values(c.xp || {})) for (const [d, v] of Object.entries(dev)) if (v >= 10) days.add(d);
  for (const d of Object.keys(c.freezeDays || {})) days.add(d);
  return days;
}

export function streak(c, now = Date.now()) {
  const days = activeDays(c);
  let n = 0;
  let t = now;
  if (!days.has(dayStr(t))) t -= DAY; // today not done yet: streak still alive from yesterday
  while (days.has(dayStr(t))) { n++; t -= DAY; }
  return { n, today: days.has(dayStr(now)) };
}

// Called on app start: spend streak freezes to cover missed days since the last active day.
export function applyFreezes(lang) {
  const c = store.course(lang);
  const days = activeDays(c);
  if (!days.size) return 0;
  const yesterday = dayStr(Date.now() - DAY);
  if (days.has(yesterday) || days.has(store.today())) return 0;
  let used = 0;
  store.update(() => {
    for (let t = Date.now() - DAY; t > Date.now() - 4 * DAY; t -= DAY) {
      const d = dayStr(t);
      if (days.has(d)) break;
      if (freezes(c) <= 0) break;
      c.freezeDays[d] = 1;
      store.bump(c, 'freezes', 'used');
      used++;
    }
  });
  return used;
}

export function freezes(c) { return store.total(c, 'freezes', 'earned') - store.total(c, 'freezes', 'used'); }

// ---- hearts: lost on mistakes in new lessons, refilled by review; they never block review or reading ----
export function hearts(c, now = Date.now()) {
  const h = c.hearts || { n: store.MAX_HEARTS, ts: now };
  if (h.n >= store.MAX_HEARTS) return { n: store.MAX_HEARTS, next: null };
  const regen = Math.floor((now - h.ts) / store.HEART_REGEN_MS);
  const n = Math.min(store.MAX_HEARTS, h.n + regen);
  return { n, next: n >= store.MAX_HEARTS ? null : h.ts + (regen + 1) * store.HEART_REGEN_MS };
}

export function loseHeart(lang) {
  store.update(() => {
    const c = store.course(lang);
    const cur = hearts(c);
    c.hearts = { n: Math.max(0, cur.n - 1), ts: Date.now() };
  });
}

export function refillHearts(lang, n = store.MAX_HEARTS) {
  store.update(() => {
    const c = store.course(lang);
    const cur = hearts(c);
    c.hearts = { n: Math.min(store.MAX_HEARTS, cur.n + n), ts: Date.now() };
  });
}

// ---- coins ----
export function coins(c) { return store.total(c, 'wallet', 'earned') - store.total(c, 'wallet', 'spent'); }
export function earn(lang, n) { store.update(() => store.bump(store.course(lang), 'wallet', 'earned', n)); }
export function spend(lang, n) {
  const c = store.course(lang);
  if (coins(c) < n) return false;
  store.update(() => store.bump(c, 'wallet', 'spent', n));
  return true;
}
export const FREEZE_PRICE = 50;
export function buyFreeze(lang) {
  if (!spend(lang, FREEZE_PRICE)) return false;
  store.update(() => store.bump(store.course(lang), 'freezes', 'earned'));
  return true;
}

// ---- stats ----
export function stat(c, key) { return store.total(c, 'stats', key); }
export function addStat(lang, key, n = 1) { store.update(() => store.bump(store.course(lang), 'stats', key, n)); }

export function wordsLearned(c) { return Object.keys(c.seen || {}).length; }

export function mastery(c, wordId, facets = null) {
  const cards = Object.entries(c.cards || {}).filter(([k]) => k.startsWith(wordId + '|') && (!facets || facets.includes(k.split('|')[1])));
  if (!cards.length) return 0;
  return Math.min(...cards.map(([, v]) => SRS.stage(v)));
}

export function masteredCount(c, minStage = 4) {
  const by = {};
  for (const [k, v] of Object.entries(c.cards || {})) {
    const id = k.split('|')[0];
    by[id] = Math.min(by[id] ?? 9, SRS.stage(v));
  }
  return Object.values(by).filter((x) => x >= minStage).length;
}

// ---- achievements ----
export const ACHIEVEMENTS = [
  { id: 'first', icon: '🎒', name: 'First steps', desc: 'Finish your first lesson', test: (c) => lessonsDone(c) >= 1 },
  { id: 'l10', icon: '🥾', name: 'On the road', desc: 'Finish 10 lessons', test: (c) => lessonsDone(c) >= 10 },
  { id: 'l50', icon: '🧭', name: 'Pathfinder', desc: 'Finish 50 lessons', test: (c) => lessonsDone(c) >= 50 },
  { id: 'l150', icon: '🗺️', name: 'Cartographer', desc: 'Finish 150 lessons', test: (c) => lessonsDone(c) >= 150 },
  { id: 'l400', icon: '🏛️', name: 'Grand tourist', desc: 'Finish 400 lessons', test: (c) => lessonsDone(c) >= 400 },
  { id: 's3', icon: '🔥', name: 'Kindling', desc: '3-day streak', test: (c) => streak(c).n >= 3 },
  { id: 's7', icon: '🔥', name: 'A full week', desc: '7-day streak', test: (c) => streak(c).n >= 7 },
  { id: 's30', icon: '🌋', name: 'Unstoppable', desc: '30-day streak', test: (c) => streak(c).n >= 30 },
  { id: 's100', icon: '☄️', name: 'Centurion', desc: '100-day streak', test: (c) => streak(c).n >= 100 },
  { id: 'w50', icon: '📗', name: 'Fifty words', desc: 'Learn 50 words', test: (c) => wordsLearned(c) >= 50 },
  { id: 'w250', icon: '📘', name: 'Word hoard', desc: 'Learn 250 words', test: (c) => wordsLearned(c) >= 250 },
  { id: 'w1000', icon: '📚', name: 'A thousand words', desc: 'Learn 1,000 words', test: (c) => wordsLearned(c) >= 1000 },
  { id: 'w3000', icon: '🏆', name: 'The whole treasure', desc: 'Learn all 3,000 core words', test: (c) => wordsLearned(c) >= 3000 },
  { id: 'm100', icon: '🥇', name: 'Gold standard', desc: 'Master 100 words', test: (c) => masteredCount(c) >= 100 },
  { id: 'm500', icon: '👑', name: 'Treasure keeper', desc: 'Master 500 words', test: (c) => masteredCount(c) >= 500 },
  { id: 'perfect', icon: '💎', name: 'Flawless', desc: 'A lesson with no mistakes', test: (c) => stat(c, 'perfect') >= 1 },
  { id: 'perfect10', icon: '💠', name: 'Perfectionist', desc: '10 flawless lessons', test: (c) => stat(c, 'perfect') >= 10 },
  { id: 'gender', icon: '⚖️', name: 'Article champion', desc: '100 correct articles / genders', test: (c) => stat(c, 'gender') >= 100 },
  { id: 'conj', icon: '🐎', name: 'Verb tamer', desc: '200 correct verb forms', test: (c) => stat(c, 'conj') >= 200 },
  { id: 'cases', icon: '🧩', name: 'Case cracker', desc: '100 correct case endings', test: (c) => stat(c, 'cases') >= 100 },
  { id: 'speak', icon: '🎙️', name: 'Silver tongue', desc: 'Pass 50 speaking exercises', test: (c) => stat(c, 'spoken') >= 50 },
  { id: 'listen', icon: '👂', name: 'Good ears', desc: '100 listening exercises', test: (c) => stat(c, 'listened') >= 100 },
  { id: 'read1k', icon: '🐛', name: 'Bookworm', desc: 'Read 1,000 words in the library', test: (c) => stat(c, 'readWords') >= 1000 },
  { id: 'read20k', icon: '🦉', name: 'Scholar', desc: 'Read 20,000 words in the library', test: (c) => stat(c, 'readWords') >= 20000 },
  { id: 'book', icon: '📖', name: 'The End', desc: 'Finish a book', test: (c) => stat(c, 'books') >= 1 },
  { id: 'grammar10', icon: '🎓', name: 'Grammarian', desc: 'Study 10 grammar chapters', test: (c) => Object.keys(c.grammarRead || {}).length >= 10 },
  { id: 'review100', icon: '🔁', name: 'Faithful reviewer', desc: '100 review answers', test: (c) => stat(c, 'reviews') >= 100 },
  { id: 'combo20', icon: '⚡', name: 'Lightning', desc: '20 correct answers in a row', test: (c) => stat(c, 'bestCombo') >= 20 },
  { id: 'owl', icon: '🌙', name: 'Night owl', desc: 'Finish a lesson after 11 pm', test: (c) => stat(c, 'owl') >= 1 },
  { id: 'lark', icon: '🌅', name: 'Early bird', desc: 'Finish a lesson before 7 am', test: (c) => stat(c, 'lark') >= 1 },
  { id: 'region1', icon: '🗺️', name: 'First region', desc: 'Complete a whole region of the map', test: (c) => stat(c, 'regions') >= 1 },
];

export function lessonsDone(c) { return Object.keys(c.lessons || {}).length; }

// Award newly earned achievements; returns them so the UI can celebrate.
export function checkAchievements(lang) {
  const c = store.course(lang);
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (!c.ach[a.id] && a.test(c)) fresh.push(a);
  }
  if (fresh.length) {
    store.update(() => { for (const a of fresh) c.ach[a.id] = Date.now(); });
    earn(lang, fresh.length * 15);
  }
  return fresh;
}

// stat counters where only the maximum matters
export function recordBest(lang, key, value) {
  const c = store.course(lang);
  const cur = store.get().courses[lang]?.stats?.[store.get().device]?.[key] || 0;
  if (value > cur) store.update(() => { store.bump(c, 'stats', key, value - cur); });
}
