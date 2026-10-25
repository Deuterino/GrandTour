# Grand Tour — German & Italian

An installable app (iPhone and Mac) for learning **German** and **Italian** from A1 to B1, as two separate courses:

- **Die Wanderjahre** — a journeyman carpenter's travels through 90 towns from Hamburg to Switzerland.
- **Il Grand Tour** — 90 stops from Bolzano to Sicily and Sardinia, in Goethe's footsteps.

## What's inside

- **Vocabulary** — about 3,400 core words per language, ordered by frequency and theme. Nouns always come with their article and plural (*der Tisch, die Tische* · *il tavolo, i tavoli*). Verbs come with their principal parts and full tables in every tense (*gehen – ging – ist gegangen* · *andare – vado – andai – sono andato*). Spaced repetition (FSRS) reviews each word separately for meaning, gender, plural and verb forms.
- **Grammar** — 36 German and 37 Italian chapters with explanations, tables, examples, common mistakes and drills: cases and der/die/das, adjective endings, the Perfekt, separable verbs, Konjunktiv, the passato prossimo, object pronouns, the congiuntivo, the passato remoto, and more.
- **Stories** — every stop has its own dialogue or reading with comprehension questions, many with a Gouin series (an everyday action told step by step). Most stops also have a Diktat (dictation) and lines to read aloud.
- **Old methods**
  - Ollendorff-style question-and-answer drills.
  - Gouin series.
  - Hamilton-style interlinear reading.
  - Principal parts.
  - Picture cards in the manner of the Orbis Pictus.
- **Tap any word.** In every text and book, a tap shows the meaning, part of speech, gender, case, tense and person, plus notes on separable verbs, compounds, pronouns attached to verbs, and old spellings. Words beyond the course come from an extended Wiktionary dictionary of about 25,000 entries.
- **Library** — public-domain books, each with tap-to-translate.
  - German: Grimm's fairy tales (1857), Struwwelpeter, Max und Moritz, Hebel's Kalendergeschichten, Hauff's Kleiner Muck.
  - Italian: Pinocchio, Collodi's *I racconti delle fate*, Capuana's fairy tales, the stories from *Cuore*.
  - You can also import from Wikisource, or open your own .txt, .epub or .html files.
- **Speaking and listening** — speech recognition for reading aloud, text-to-speech everywhere, and native recordings (Wikimedia) for single words.
- **Game elements** — XP and levels, streaks with freezes, hearts, coins, achievements, passport stamps, checkpoints, and a test-out option.
  - Hearts are lost on first-try mistakes in new lessons.
  - Reviews, practice, reading and grammar are never blocked, and a review refills your hearts.
- **Optional AI help (Claude)** — explains a sentence, grades free translations, answers grammar questions.
  - Needs your own Anthropic API key, which is stored only on your device.
  - The default model is Claude Opus 5.5.
  - Server-side refusal fallbacks are enabled (`fallbacks: "default"`), so a request a model refuses can be retried by a fallback model.

Everything except AI help, Wikisource import and native recordings works offline after the first visit.

## Install

The app is a Progressive Web App served from GitHub Pages: **https://deuterino.github.io/grand-tour/**

**iPhone (Safari):**
1. Open the address in Safari.
2. Tap the Share button, then **Add to Home Screen**.

It then opens full-screen like any app, and works offline.

**Mac:**
1. Open the address in **Google Chrome** (or Edge).
2. Click the install icon in the address bar, or use ⋮ → *Cast, save and share* → *Install page as app*.

Safari on macOS 12 cannot install web apps and lacks a JavaScript feature the AI features need, so use Chrome on that system.

## Sync between Mac and iPhone

Progress syncs automatically through a private GitHub Gist:

1. On github.com go to Settings → Developer settings → Personal access tokens, and create either:
   - a fine-grained token with **Gists: read and write**, or
   - a classic token with only the **gist** scope.
2. In the app go to **Settings → Sync between devices**, paste the token on **both** devices, and tap *Sync now*.

The app creates one private gist called "Grand Tour language app — progress sync". Progress from the two devices is merged, keeping the best of each.

The token and your API key stay on the device: they are never part of a sync or an export. You can also save and restore your progress by hand with *Download backup* and *Import backup* in Settings.

## Development

Run locally:

```sh
python3 -m http.server 8765 --directory app
```

Then open `http://localhost:8765`.

Rebuild the data in this order. The Wiktionary and frequency downloads land in `build/`, which git ignores; see the header of each script for its inputs.

```sh
python3 tools/build_lexicon_de.py && python3 tools/build_course.py de
jsc -m tools/dump_forms.mjs -- de > build/forms_de.json && python3 tools/build_sentences.py de
python3 tools/build_grammar.py de && python3 tools/build_texts.py de
python3 tools/build_books.py de && python3 tools/build_dict_ext.py de
python3 tools/build_app.py          # service worker precache list (and --icons)
```

`jsc` is `/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc`. Replace `de` with `it` for Italian.

Tests:

```sh
jsc -m tests/engine_test.mjs                            # grammar engine, analyzer, SRS
jsc -m tools/check_text.mjs -- de grade                 # every story and grammar sentence analyzable; level per unit
python3 tests/cdp.py tests/flows/reader.json --out /tmp/shots   # headless Chrome UI flows (needs the local server)
```

Pushing to `main` deploys `app/` to GitHub Pages (`.github/workflows/pages.yml`).

## Sources and licences

- **Dictionary and inflection tables:** [Wiktionary](https://www.wiktionary.org/), via [kaikki.org](https://kaikki.org/) (CC BY-SA).
- **Example sentences:** [Tatoeba](https://tatoeba.org/) (CC BY 2.0 FR).
- **Word frequencies:** OpenSubtitles, via [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords).
- **Books:** public-domain texts from [Wikisource](https://wikisource.org/).
- **Software libraries:** Preact and htm (MIT), fflate (MIT), the Anthropic TypeScript SDK (Apache-2.0).
- **Course texts, grammar chapters and drills:** written for this app.
