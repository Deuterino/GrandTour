"""Print a compact, junk-filtered view of the ranked lemma list for manual curation.

Usage: python3 tools/candidates.py de|it START END
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JUNK_GLOSS = re.compile(r"^(The name of the Latin|Only used in|Alternative|alternative|obsolete|archaic|"
                        r"Abbreviation of|abbreviation of|initialism|Initialism|clipping|misspelling|"
                        r"Misspelling|nonstandard|Nonstandard|plural of|feminine of|eye dialect|"
                        r"\(musical note|Synonym of the|apocopic form|elided form|apheretic)")
POS_SHORT = {"noun": "n", "verb": "v", "adj": "a", "adv": "adv", "pron": "pron", "prep": "prep",
             "conj": "conj", "article": "art", "det": "det", "num": "num", "intj": "intj",
             "particle": "part", "contraction": "contr", "phrase": "phr", "prep_phrase": "pphr"}


def short_head(lang, head):
    h = head
    if lang == "de":
        m = re.search(r"\b([mfn](?: or [mfn])?|m pl|f pl|n pl|pl)\b(?: \(([^)]*)\))?", h)
        return (m.group(0)[:50] if m else "")
    m = re.search(r"\b([mf](?: or [mf])?(?: pl)?|by sense|invariable)\b(?: \(([^)]*)\))?", h)
    return m.group(0)[:50] if m else ""


def main(lang, start, end):
    n = 0
    for line in open(ROOT / f"build/rank/{lang}_ranked.tsv", encoding="utf-8"):
        rank, lemma, pos, sc, head, gl, flags = line.rstrip("\n").split("\t")
        first = gl.split(" / ")[0]
        if JUNK_GLOSS.search(first) and " / " not in gl:
            continue
        if JUNK_GLOSS.search(first):
            gl = " / ".join(x for x in gl.split(" / ") if not JUNK_GLOSS.search(x))
        n += 1
        if n < start:
            continue
        if n > end:
            break
        hd = short_head(lang, head) if pos == "noun" else ""
        print(f"{n}|{lemma}|{POS_SHORT.get(pos, pos)}|{hd}|{gl[:70]}|{flags}")


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]), int(sys.argv[3]))
