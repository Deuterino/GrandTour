"""Build app/data/<lang>/dict-ext.json: the reader's extended dictionary for words outside the core course.

Entries come from the Wiktionary extract (build/wikt/<lang>_lemmas.jsonl, <lang>_formof.tsv). To keep the file
small, only lemmas reachable from the most frequent word forms (build/raw/<lang>_full.txt) or from words in the
bundled books and unit stories are included, and only those forms are indexed. Lemmas the core lexicon already
covers are left out: the reader consults this dictionary only when the core analysis finds nothing.

Output: {"entries": [{"l": lemma, "p": pos, "g": English gloss, "a": article (nouns)}],
         "forms": {form: [[entry index, "tags"], ...]}}

Usage: python3 tools/build_dict_ext.py de|it [top_forms]
"""
import json
import re
import sys
from pathlib import Path

from lexicon_common import write_json

ROOT = Path(__file__).resolve().parent.parent
POS = {"noun": "n", "verb": "v", "adj": "a", "adv": "adv", "pron": "pron", "prep": "prep", "conj": "conj", "intj": "intj",
       "num": "num", "det": "det", "article": "art", "particle": "part", "name": "name", "phrase": "phr", "prep_phrase": "phr",
       "contraction": "contr", "postp": "prep", "proverb": "phr"}
WORD = re.compile(r"[^\W\d_]+(?:['’][^\W\d_]+)*['’]?", re.U)


def it_article(word, g):
    w = word.lower()
    vowel = w[:1] in "aeiouàèéìòù"
    if g == "f":
        return "l'" if vowel else "la"
    if g in ("m", "mf"):
        if vowel:
            return "l'"
        if re.match(r"(s[^aeiou]|z|gn|ps|pn|x|y|i[aeiou])", w):
            return "lo"
        return "il"
    return ""


def gender(rec, lang):
    hargs = rec.get("hargs") or {}
    head = rec.get("head", "")
    g = (hargs.get("1") or "").split(",")[0].split("-")[0].strip()
    if g not in ("m", "f", "n", "p", "mf"):
        m = re.match(r"^\S+(?: \S+)? (m|f|n|p)\b", head)
        g = m.group(1) if m else ""
    if " m or f" in head or g == "mf":
        g = "mf"
    return g


def article(rec, lang):
    g = gender(rec, lang)
    if lang == "de":
        return {"m": "der", "f": "die", "n": "das", "p": "die"}.get(g, "")
    return it_article(rec["w"], g)


def gloss(rec):
    """Up to three senses with their usage labels: "whore (dated, derogatory); girl; lass (archaic or regional)"."""
    senses = [s for s in rec.get("s", []) if s.get("g") and "of" not in s]
    parts = []
    for s in senses[:3]:
        g = re.sub(r"\s+", " ", s["g"]).strip()
        q = (s.get("q") or "").split(",")[0].strip()
        parts.append(f"{g} ({q})" if q and len(q) < 30 else g)
        if sum(len(x) for x in parts) > 90:
            break
    out = "; ".join(parts)
    return out if len(out) <= 150 else out[:147].rsplit(" ", 1)[0] + "…"


def text_words(lang):
    words = set()
    books = ROOT / "app" / "data" / lang / "books"
    for f in books.glob("*.json"):
        if f.name == "catalog.json":
            continue
        for ch in json.loads(f.read_text(encoding="utf-8"))["chapters"]:
            for p in ch["paras"]:
                words.update(w.replace("’", "'") for w in WORD.findall(p))
    texts = ROOT / "app" / "data" / lang / "texts.json"
    if texts.exists():
        for lst in json.loads(texts.read_text(encoding="utf-8"))["units"].values():
            for t in lst:
                for l in t["lines"]:
                    words.update(WORD.findall(l["t"]))
    return words


def main():
    lang = sys.argv[1]
    top = int(sys.argv[2]) if len(sys.argv) > 2 else 80000
    core = json.loads((ROOT / f"app/data/{lang}/lexicon.json").read_text(encoding="utf-8"))["entries"]
    core_keys = {(e["l"].lower(), e["p"]) for e in core}
    core_lemmas = {e["l"].lower() for e in core}

    wanted = set()
    with open(ROOT / f"build/raw/{lang}_full.txt", encoding="utf-8") as fh:
        for i, line in enumerate(fh):
            if i >= top:
                break
            wanted.add(line.split(" ")[0].lower())
    book_words = text_words(lang)
    wanted |= {w.lower() for w in book_words}

    lemmas = {}
    with open(ROOT / f"build/wikt/{lang}_lemmas.jsonl", encoding="utf-8") as fh:
        for line in fh:
            r = json.loads(line)
            p = POS.get(r.get("pos"))
            if not p or not gloss(r):
                continue
            lemmas.setdefault(r["w"].lower(), []).append((p, r))

    formof = {}
    with open(ROOT / f"build/wikt/{lang}_formof.tsv", encoding="utf-8") as fh:
        for line in fh:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 5:
                continue
            form, pos, lemma, kind, tags = parts[:5]
            if form.lower() in wanted:
                formof.setdefault(form.lower(), []).append((form, POS.get(pos), lemma, kind, tags))

    entries, index = [], {}

    def add_entry(p, r):
        key = (r["w"], p)
        if key in index:
            return index[key]
        if (r["w"].lower(), p) in core_keys:
            return None
        e = {"l": r["w"], "p": p, "g": gloss(r)}
        if p == "n":
            a = article(r, lang)
            if a:
                e["a"] = a
        index[key] = len(entries)
        entries.append(e)
        return index[key]

    forms = {}
    for w in sorted(wanted):
        for p, r in lemmas.get(w, []):
            add_entry(p, r)
        for form, p, lemma, kind, tags in formof.get(w, []):
            for lp, r in lemmas.get(lemma.lower(), []):
                if r["w"] != lemma or (p and lp != p):
                    continue
                i = add_entry(lp, r)
                if i is None:
                    continue
                tag = "variant" if kind == "A" else re.sub(r"\s+", " ", tags).strip()
                lst = forms.setdefault(form, [])
                if [i, tag] not in lst:
                    lst.append([i, tag[:60]])

    write_json(ROOT / f"app/data/{lang}/dict-ext.json", {"entries": entries, "forms": forms})
    size = (ROOT / f"app/data/{lang}/dict-ext.json").stat().st_size
    covered = sum(1 for w in book_words if w.lower() in lemmas or w.lower() in formof or w.lower() in core_lemmas)
    print(f"{lang}: {len(entries)} entries, {len(forms)} forms, {size / 1e6:.1f} MB; "
          f"{covered}/{len(book_words)} distinct book/story words have a lemma or form")


if __name__ == "__main__":
    main()
