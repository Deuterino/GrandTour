"""Stream a kaikki.org (Wiktextract) language dump and keep only what Grand Tour needs.

The dumps are ~1 GB, so nothing is written to disk except the filtered output:

  build/wikt/<lang>_lemmas.jsonl   one compact record per lemma entry
  build/wikt/<lang>_formof.tsv     inflected/alternative form -> lemma mappings

Usage: curl -s <URL> | python3 tools/extract_wiktionary.py de|it   (URLs below)
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
URLS = {
    "de": "https://kaikki.org/dictionary/German/kaikki.org-dictionary-German.jsonl",
    "it": "https://kaikki.org/dictionary/Italian/kaikki.org-dictionary-Italian.jsonl",
}
SKIP_POS = {"name", "character", "symbol", "punct", "romanization", "prefix", "suffix",
            "infix", "interfix", "affix", "circumfix", "proverb"}
DROP_FORM_TAGS = {"table-tags", "inflection-template", "class"}
KEEP_SENSE_TAGS = {
    "colloquial", "informal", "formal", "vulgar", "derogatory", "slang", "dated", "archaic",
    "obsolete", "rare", "regional", "dialectal", "literary", "poetic", "humorous", "figuratively",
    "transitive", "intransitive", "reflexive", "impersonal", "with-dative", "with-genitive",
    "with-accusative", "auxiliary", "modal", "uncountable", "countable", "plural-only",
    "singular-only", "Austria", "Switzerland", "Southern-Germany", "Northern-Germany", "Tuscany",
    "Northern-Italy", "Southern-Italy", "childish", "euphemistic", "pejorative", "ironic",
}
CAT_RE = re.compile(r"(separable|inseparable|reflexive|strong|weak|irregular|class \d|auxiliary|"
                    r"plurale tantum|singulare tantum|uncountable|pronominal|-isc-|essere|avere|"
                    r"mixed|n-stem|countable)", re.I)


def load_interesting(lang, min_count=2):
    words = set()
    with open(ROOT / f"build/raw/{lang}_full.txt", encoding="utf-8") as fh:
        for line in fh:
            w, _, c = line.rstrip("\n").rpartition(" ")
            if not w:
                continue
            if int(c) < min_count:
                break
            words.add(w)
    return words


# A "form_of" sense with any of these tags is an inflection (Häuser, parlavano); without them it is a
# derived word that deserves its own entry (Lehrer = agent noun of lehren, Lehrerin, amica, Vertrauen).
INFLECTION_TAGS = {"nominative", "accusative", "dative", "genitive", "first-person", "second-person",
                   "third-person", "present", "past", "preterite", "imperfect", "future", "conditional",
                   "subjunctive", "subjunctive-i", "subjunctive-ii", "imperative", "participle", "gerund",
                   "comparative", "superlative", "plural", "infinitive", "historic", "inflection-of"}


def is_inflection(s):
    return bool(s.get("form_of")) and bool(INFLECTION_TAGS.intersection(s.get("tags", [])))


def compact_senses(senses):
    out = []
    for s in senses:
        if is_inflection(s) or s.get("alt_of"):
            continue
        gl = s.get("glosses") or []
        if not gl:
            continue
        g = gl[-1] if len(gl) > 1 and gl[0].endswith(":") else "; ".join(gl)
        rec = {"g": g[:300]}
        if s.get("form_of"):
            rec["of"] = s["form_of"][0].get("word", "")
        tags = [t for t in s.get("tags", []) if t in KEEP_SENSE_TAGS]
        if tags:
            rec["t"] = tags
        raw = (s.get("raw_glosses") or [None])[0]
        if raw and raw.startswith("(") and raw != g:
            rec["q"] = raw[1:raw.find(")")][:80] if ")" in raw else None
            if not rec["q"]:
                del rec["q"]
        for ex in s.get("examples", [])[:4]:
            txt, tr = ex.get("text"), ex.get("english") or ex.get("translation")
            if txt and tr and len(txt) < 140 and ex.get("type") != "quotation":
                rec["ex"] = [txt, tr]
                break
        out.append(rec)
        if len(out) >= 8:
            break
    return out


def main(lang):
    interesting = load_interesting(lang)
    print(f"interesting forms: {len(interesting)}", file=sys.stderr)
    outdir = ROOT / "build/wikt"
    outdir.mkdir(parents=True, exist_ok=True)
    f_lem = open(outdir / f"{lang}_lemmas.jsonl", "w", encoding="utf-8")
    f_form = open(outdir / f"{lang}_formof.tsv", "w", encoding="utf-8")
    n = n_lem = n_form = 0
    # urllib stalls against kaikki.org, so the dump is piped in: curl -s URL | python3 ... de
    with sys.stdin.buffer as resp:
        for raw in resp:
            n += 1
            try:
                e = json.loads(raw)
            except ValueError:
                continue
            pos = e.get("pos")
            if pos in SKIP_POS:
                continue
            word = e.get("word")
            if not word:
                continue
            senses = e.get("senses", [])
            for s in senses:
                for fo in s.get("form_of", []) or []:
                    tags = [t for t in s.get("tags", []) if t != "form-of"]
                    f_form.write(f"{word}\t{pos}\t{fo.get('word','')}\tF\t{' '.join(tags)}\n")
                    n_form += 1
                for ao in s.get("alt_of", []) or []:
                    tags = [t for t in s.get("tags", []) if t != "alt-of"]
                    f_form.write(f"{word}\t{pos}\t{ao.get('word','')}\tA\t{' '.join(tags)}\n")
                    n_form += 1
            cs = compact_senses(senses)
            if not cs:
                continue
            rec = {"w": word, "pos": pos, "s": cs}
            if e.get("etymology_number"):
                rec["ety"] = e["etymology_number"]
            ht = e.get("head_templates") or []
            if ht:
                rec["head"] = ht[0].get("expansion", "")[:400]
                rec["hargs"] = ht[0].get("args", {})
            ipas = [s["ipa"] for s in e.get("sounds", []) if s.get("ipa")][:2]
            if ipas:
                rec["ipa"] = ipas
            aud = [s["mp3_url"] for s in e.get("sounds", []) if s.get("mp3_url")][:2]
            if aud:
                rec["audio"] = aud
            cats = sorted({c["name"] for s in senses for c in s.get("categories", [])
                           if isinstance(c, dict) and CAT_RE.search(c.get("name", ""))})
            if cats:
                rec["cats"] = cats[:12]
            forms = []
            keep_forms = word.lower() in interesting or word in interesting
            seen = set()
            for f in e.get("forms", []):
                tags = f.get("tags", [])
                if DROP_FORM_TAGS.intersection(tags) or not f.get("form"):
                    continue
                if lang == "de" and "multiword-construction" in tags:
                    continue
                key = (f["form"], " ".join(tags))
                if key in seen:
                    continue
                seen.add(key)
                forms.append([f["form"], " ".join(tags)])
                if f["form"].lower() in interesting:
                    keep_forms = True
            if keep_forms and forms:
                rec["f"] = forms
            elif forms:
                rec["f"] = [x for x in forms if not re.search(r"\b(strong|weak|mixed)\b", x[1])][:20]
            for k in ("synonyms", "antonyms"):
                v = [x["word"] for x in e.get(k, []) if x.get("word")][:6]
                if v:
                    rec[k[:3]] = v
            f_lem.write(json.dumps(rec, ensure_ascii=False) + "\n")
            n_lem += 1
            if n % 200000 == 0:
                print(f"{lang}: {n} lines, {n_lem} lemmas, {n_form} form links", file=sys.stderr)
    f_lem.close()
    f_form.close()
    print(f"{lang} done: {n} lines, {n_lem} lemmas, {n_form} form links", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1])
