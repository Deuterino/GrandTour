"""Select example sentences for every core word from Tatoeba (CC BY 2.0 FR).

A sentence qualifies only if every word in it is in the core lexicon (so every word is tappable and
explainable). Its level is the latest course unit among its words; for each word we prefer sentences
at or below that word's own unit (comprehensible input: known words plus the new one), short, written
by native speakers, and not already used for many other words.

Output: app/data/<lang>/sentences.json  {items: [{id, t, e: [english...], alt: [same-meaning target
sentences], w: [word ids it illustrates], u: level unit, src}]}
Usage: python3 tools/build_sentences.py de|it
"""
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PER_WORD = 6
NAMES = {"de": {"Tom", "Maria", "Mary", "John", "Anna", "Peter", "Paul", "Ken", "Mike", "Jane"},
         "it": {"Tom", "Maria", "Mary", "John", "Marco", "Paolo", "Anna", "Luca", "Giulia", "Ken"}}
WORD_RE = re.compile(r"[^\W\d_]+(?:['’][^\W\d_]+)*['’]?|\d+", re.UNICODE)


def tokens(text, lang):
    out = []
    for m in WORD_RE.finditer(text):
        w = m.group(0).replace("’", "'")
        if lang == "it" and "'" in w[:-1]:
            # elision: l'amico -> l', amico ; dell'acqua -> dell', acqua
            head, tail = w.split("'", 1)
            out.append(head + "'")
            if tail:
                out.append(tail)
        else:
            out.append(w)
    return out


def main(lang):
    lex = json.loads((ROOT / f"app/data/{lang}/lexicon.json").read_text(encoding="utf-8"))["entries"]
    course = json.loads((ROOT / f"app/data/{lang}/course.json").read_text(encoding="utf-8"))
    forms = json.loads((ROOT / f"build/forms_{lang}.json").read_text(encoding="utf-8"))
    unit_of = {}
    for u in course["units"]:
        for w in u["words"]:
            unit_of[w] = u["n"]
    # phrases (multiword lemmas) are matched as substrings
    phrases = [(e["l"].lower(), e["id"]) for e in lex if " " in e["l"] and not e["l"].startswith("sich ")]

    def ids_for(tok, first):
        for t in (tok, tok.lower(), tok[:1].upper() + tok[1:]):
            if t in forms:
                return forms[t]
        return None

    pairs = []
    en_to_sents = defaultdict(list)
    for line in open(ROOT / f"build/tatoeba/{lang}_pairs.tsv", encoding="utf-8"):
        sid, text, ens, native, user = line.rstrip("\n").split("\t")
        if len(text) > 90 or any(c in text for c in '<>{}[]#@/\\'):
            continue
        toks = tokens(text, lang)
        if not 3 <= len(toks) <= 13:
            continue
        en_list = [e.strip() for e in ens.split(" | ") if e.strip()]
        for e in en_list[:4]:
            en_to_sents[e.lower()].append(text)
        word_ids, ok, names = [], True, 0
        for i, t in enumerate(toks):
            if t.isdigit():
                continue
            if t in NAMES[lang]:
                names += 1
                continue
            ids = ids_for(t, i == 0)
            if not ids:
                ok = False
                break
            word_ids.append(ids)
        if not ok or not word_ids:
            continue
        low = text.lower()
        phrase_ids = [pid for p, pid in phrases if p in low]
        level = max(min(unit_of.get(i, 99) for i in ids) for ids in word_ids)
        pairs.append({"sid": sid, "t": text, "e": en_list[:3], "native": native == "1", "names": names,
                      "ids": {i for ids in word_ids for i in ids} | set(phrase_ids), "level": level, "n": len(toks)})
    print(f"{lang}: {len(pairs)} fully-analyzable sentences", file=sys.stderr)

    by_word = defaultdict(list)
    for p in pairs:
        for i in p["ids"]:
            by_word[i].append(p)
    used = defaultdict(int)
    chosen = {}
    selected_for = defaultdict(list)
    order = sorted(lex, key=lambda e: e["r"])
    missing = []
    for e in order:
        wid = e["id"]
        u = unit_of.get(wid, 99)
        cands = by_word.get(wid, [])
        def score(p):
            s = 0.0
            over = p["level"] - u
            s -= max(0, over) * 3.0      # words from later units
            s -= abs(p["n"] - 7) * 0.6     # prefer ~7 words
            s += 2.0 if p["native"] else 0
            s -= p["names"] * 1.5
            s -= used[p["sid"]] * 2.5      # spread sentences across words
            s -= 0 if p["e"] else 10
            return s
        best = sorted(cands, key=score, reverse=True)
        picked, seen_starts = [], set()
        for p in best:
            start = " ".join(p["t"].split()[:2]).lower()
            if start in seen_starts and len(best) > PER_WORD * 2:
                continue
            if p["level"] - u > 6 and len(picked) >= 2:
                continue
            picked.append(p)
            seen_starts.add(start)
            if len(picked) >= PER_WORD:
                break
        if not picked:
            missing.append(e["l"])
        for p in picked:
            used[p["sid"]] += 1
            chosen[p["sid"]] = p
            selected_for[p["sid"]].append(wid)
    items = []
    for sid, p in chosen.items():
        alts = []
        for en in p["e"]:
            for t in en_to_sents.get(en.lower(), []):
                if t != p["t"] and t not in alts:
                    alts.append(t)
        items.append({"id": f"t{sid}", "t": p["t"], "e": p["e"], "alt": alts[:6], "w": selected_for[sid],
                      "u": p["level"], "src": f"tatoeba:{sid}"})
    items.sort(key=lambda x: (x["u"], x["id"]))
    out = {"lang": lang, "license": "Tatoeba (tatoeba.org), CC BY 2.0 FR", "items": items}
    (ROOT / f"app/data/{lang}/sentences.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    covered = len(lex) - len(missing)
    print(f"{lang}: {len(items)} sentences selected; {covered}/{len(lex)} words have examples", file=sys.stderr)
    (ROOT / f"build/no_examples_{lang}.txt").write_text("\n".join(missing), encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1])
