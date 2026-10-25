"""Rank lemmas by conversational frequency.

Word-form counts come from OpenSubtitles 2018 (hermitdave/FrequencyWords, lowercased forms).
Each form's count is shared among the Wiktionary lemmas it can belong to, then summed per lemma.

Output: build/rank/<lang>_ranked.tsv
  rank, lemma, pos, score, head (gender/plural/principal parts), first glosses, flags
Usage: python3 tools/rank_lemmas.py de|it [N_FORMS]
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from common import it_plain  # noqa: E402

FLAG_TAGS = {"vulgar", "derogatory", "slang", "archaic", "obsolete", "dated", "rare", "regional", "dialectal"}


def main(lang, n_forms=60000):
    freq = []
    with open(ROOT / f"build/raw/{lang}_full.txt", encoding="utf-8") as fh:
        for i, line in enumerate(fh):
            if i >= n_forms:
                break
            w, _, c = line.rstrip("\n").rpartition(" ")
            freq.append((w, int(c)))
    wanted = {w for w, _ in freq}

    lemmas = {}          # key (lemma, pos) -> record (first etymology wins, glosses merged)
    cand = defaultdict(set)  # lowercased form -> {(lemma, pos)}
    with open(ROOT / f"build/wikt/{lang}_lemmas.jsonl", encoding="utf-8") as fh:
        for line in fh:
            r = json.loads(line)
            key = (r["w"], r["pos"])
            if key in lemmas:
                lemmas[key]["s"].extend(r["s"])
                lemmas[key].setdefault("heads", []).append(r.get("head", ""))
            else:
                lemmas[key] = r
            lw = r["w"].lower()
            if lw in wanted:
                cand[lw].add(key)
            for form, tags in r.get("f", []):
                if " " in form:
                    continue
                fl = (it_plain(form) if lang == "it" else form).lower()
                if fl in wanted:
                    cand[fl].add(key)
    with open(ROOT / f"build/wikt/{lang}_formof.tsv", encoding="utf-8") as fh:
        for line in fh:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 4:
                continue
            form, pos, lemma, kind = parts[:4]
            fl = form.lower()
            if fl in wanted and (lemma, pos) in lemmas:
                cand[fl].add((lemma, pos))

    score = defaultdict(float)
    for w, c in freq:
        keys = cand.get(w)
        if not keys:
            continue
        # A form that *is* a headword is most likely that word (essen -> essen v. and Essen n.).
        heads = [k for k in keys if k[0].lower() == w]
        pool = heads or list(keys)
        share = c / len(pool)
        for k in pool:
            score[k] += share
        if heads and len(keys) > len(heads):
            for k in keys - set(heads):
                score[k] += c * 0.15 / (len(keys) - len(heads))

    ranked = sorted(score.items(), key=lambda kv: -kv[1])
    out = ROOT / f"build/rank/{lang}_ranked.tsv"
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        for i, ((lemma, pos), sc) in enumerate(ranked[:12000], 1):
            r = lemmas[(lemma, pos)]
            gl = " / ".join(dict.fromkeys(s["g"] for s in r["s"]))[:140]
            flags = sorted({t for s in r["s"] for t in s.get("t", []) if t in FLAG_TAGS})
            head = r.get("head", "").replace("\t", " ")[:160]
            fh.write(f"{i}\t{lemma}\t{pos}\t{sc:.0f}\t{head}\t{gl}\t{','.join(flags)}\n")
    print(f"{lang}: ranked {len(ranked)} lemmas -> {out}")


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 60000)
