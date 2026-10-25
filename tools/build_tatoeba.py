"""Join Tatoeba exports into target-language/English sentence pairs.

Inputs (build/raw/, from https://downloads.tatoeba.org/exports/):
  {deu,ita}_sentences_detailed.tsv.bz2, {deu,ita}-eng_links.tsv.bz2,
  eng_sentences.tsv.bz2, user_languages.tar.bz2
Output: build/tatoeba/<lang>_pairs.tsv  (id, text, english variants joined by ' | ', native 0/1, user)

Tatoeba content is CC BY 2.0 FR; credit is shown in the app's About screen.
Usage: python3 tools/build_tatoeba.py
"""
import bz2
import csv
import io
import sys
import tarfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "build/raw"
OUT = ROOT / "build/tatoeba"
LANGS = {"de": "deu", "it": "ita"}
csv.field_size_limit(10**7)


def natives():
    nat = defaultdict(set)
    with tarfile.open(RAW / "user_languages.tar.bz2") as tf:
        member = next(m for m in tf.getmembers() if m.name.endswith(".csv"))
        for line in io.TextIOWrapper(tf.extractfile(member), encoding="utf-8"):
            parts = line.rstrip("\n").split("\t")
            if len(parts) >= 3 and parts[1] == "5":
                nat[parts[0]].add(parts[2])
    return nat


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    nat = natives()
    links = {}
    for lang, code in LANGS.items():
        lk = defaultdict(list)
        with bz2.open(RAW / f"{code}-eng_links.tsv.bz2", "rt", encoding="utf-8") as fh:
            for line in fh:
                a, b = line.split("\t")[:2]
                lk[a].append(b.strip())
        links[lang] = lk
    need = {e for lk in links.values() for v in lk.values() for e in v}
    eng = {}
    with bz2.open(RAW / "eng_sentences.tsv.bz2", "rt", encoding="utf-8") as fh:
        for line in fh:
            parts = line.rstrip("\n").split("\t")
            if len(parts) >= 3 and parts[0] in need:
                eng[parts[0]] = parts[2]
    for lang, code in LANGS.items():
        n = 0
        with bz2.open(RAW / f"{code}_sentences_detailed.tsv.bz2", "rt", encoding="utf-8") as fh, \
                open(OUT / f"{lang}_pairs.tsv", "w", encoding="utf-8") as out:
            for line in fh:
                parts = line.rstrip("\n").split("\t")
                if len(parts) < 4:
                    continue
                sid, _, text, user = parts[:4]
                ens = [eng[e] for e in links[lang].get(sid, []) if e in eng]
                if not ens:
                    continue
                native = 1 if user in nat.get(code, ()) else 0
                text = text.replace("\t", " ")
                out.write(f"{sid}\t{text}\t{' | '.join(x.replace('|', '/') for x in ens)}\t{native}\t{user}\n")
                n += 1
        print(f"{lang}: {n} pairs", file=sys.stderr)


if __name__ == "__main__":
    main()
