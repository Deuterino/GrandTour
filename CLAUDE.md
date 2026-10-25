# Grand Tour — notes for working on this repo

A German and Italian language-learning PWA, written in vanilla ES modules with vendored Preact and htm. There is no build step for the app itself. `app/` is the deployable site; `content/` holds the hand-written course material; `tools/` turns content plus downloaded data into `app/data/<lang>/*.json`.

## Layout

- `app/js/core/` — store (IndexedDB), FSRS (`srs.js`), gamification (`game.js`), data loading and form indexes (`data.js`), speech, gist sync, books, Claude API (`ai.js`; vendored SDK in `app/js/vendor/anthropic/`).
- `app/js/lang/`
  - `de.js`, `it.js` — inflection engines, archaic and spelling rules, number parsing.
  - `analyzer.js` — the tap-a-word analyzer: form lookup, then fallbacks, then context ranking.
- `app/js/exercises/` — exercise generators (`generate.js`), Ollendorff drills, exercise views.
- `app/js/ui/` — screens, the tappable text, and tables.

## Content formats (see the header of each builder)

- `content/<lang>/words_*.txt` — `lemma|pos|English|key=val;…;note=…`.
  - pos is one of n.m, n.f, n.n, n.mf, n.pl/n.mpl/n.fpl, v, a, adv, pron, prep, conj, art, det, num, intj, phr.
  - Useful keys: `pl=`, `gov=`, `reg=`, `pret=` (German: picks the Wiktionary conjugation whose preterite matches, e.g. weak *schaffte*), and `x=1` (lookup-only: explained in the reader, never taught).
- `content/<lang>/names.txt` — `Name|kind|English`. Lookup-only. A `name` that duplicates a word is skipped.
- `content/<lang>/course.txt` — sections and units.
  - Explicit word lists claim words for a unit: the first unit to list a word gets it.
  - Use this to move core words earlier.
- `content/<lang>/grammar_*.txt` — chapters with sections, tips, tables, `ex:` lines and drills.
- `content/<lang>/texts_*.txt` — unit stories (`=== uN | dialogue|reading|gouin | Title`, `Speaker: text | English`, `- text | English`, `q: … ___ … | right | wrong | wrong | en: … | why: …`).

## Pipeline order, per language

1. `build_lexicon_<lang>.py`
2. `build_course.py`
3. `jsc dump_forms.mjs > build/forms_<lang>.json`
4. `build_sentences.py`
5. Independent of each other: `build_grammar.py`, `build_texts.py`, `build_books.py` (Wikisource; cached in `build/books_cache`), `build_dict_ext.py`
6. `build_app.py` (regenerates `sw.js`; do this last; `--icons` redraws the icons)

## Checks before committing content

- `jsc -m tools/check_text.mjs -- <lang> grade`
  - The unknown-word list must be empty; for German, the three English drill prompts in g-old-spelling are expected.
  - The per-unit percentage is the share of words already taught by that unit; aim for 85% or more.
- `jsc -m tests/engine_test.mjs` must pass.
- UI flows: `python3 tests/cdp.py tests/flows/<flow>.json --out DIR`, with `python3 -m http.server 8765 --directory app` running.

## Gotchas

- **No regex lookbehind in app code.** Safari 15.4 on macOS 12 doesn't support it. The vendored Anthropic SDK uses it, so AI features need Chrome or iOS 16.4+. Python tools may use lookbehind.
- **`jsc` quirks.** `scriptArgs` can be undefined, so fall back to `arguments`.
- **Accents and apostrophes.**
  - Italian forms from Wiktionary carry stress marks; `common.it_plain` keeps only final accents.
  - An *i* between vowels is a glide (*sdraiò* keeps its accent).
  - Books use typographic apostrophes; `lookupForm` and `lookupWord` normalize them.
- **Analyzer readings.**
  - Synthetic readings (numbers, diminutives, altered nouns) have `entry.syn = 1` and no word page.
  - The extended dictionary is consulted when nothing matches, and it vetoes heuristic guesses when it knows the word.
- **Privacy.** The API key and gist token never leave the device and are excluded from sync and exports.
