"""Shared pieces of the lexicon builders: reading the curated word lists, Wiktionary lookup, ranking."""
import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# curated pos code -> kaikki pos
WIKT_POS = {"n": "noun", "v": "verb", "a": "adj", "adv": "adv", "pron": "pron", "prep": "prep",
            "conj": "conj", "art": "article", "det": "det", "num": "num", "intj": "intj", "phr": "phrase",
            "part": "particle"}
PERSONS = [("first-person", "singular"), ("second-person", "singular"), ("third-person", "singular"),
           ("first-person", "plural"), ("second-person", "plural"), ("third-person", "plural")]


def read_wordlists(lang):
    """Parse content/<lang>/words_*.txt. Returns ordered entries; repeated (lemma, pos) lines merge themes."""
    entries = {}
    order = []
    for path in sorted((ROOT / f"content/{lang}").glob("words_*.txt")):
        theme = None
        for ln, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            line = line.strip()
            if not line:
                continue
            if line.startswith("#"):
                m = re.match(r"#\s*([a-z]+)\s*$", line)
                if m:
                    theme = m.group(1)
                continue
            parts = line.split("|")
            if len(parts) < 3:
                raise SystemExit(f"{path.name}:{ln}: bad line: {line}")
            lemma, pos, en = parts[0].strip(), parts[1].strip(), parts[2].strip()
            extra = parts[3].strip() if len(parts) > 3 else ""
            kv = parse_extra(extra)
            key = (lemma, pos)
            if key in entries:
                e = entries[key]
                if theme and theme not in e["th"]:
                    e["th"].append(theme)
                for k, v in kv.items():
                    e["kv"].setdefault(k, v)
                continue
            entries[key] = {"lemma": lemma, "pos": pos, "en": en, "th": [theme] if theme else [], "kv": kv,
                            "src": f"{path.name}:{ln}"}
            order.append(key)
    return [entries[k] for k in order]


def parse_extra(extra):
    out = {}
    if not extra:
        return out
    if "note=" in extra:
        head, note = extra.split("note=", 1)
        out["note"] = note.strip()
        extra = head
    for part in extra.split(";"):
        part = part.strip()
        if "=" in part:
            k, v = part.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def load_wikt(lang, wanted_lemmas):
    """All Wiktionary lemma records whose headword is wanted, grouped by (word, pos)."""
    recs = defaultdict(list)
    wl = set(wanted_lemmas) | {w.lower() for w in wanted_lemmas}
    with open(ROOT / f"build/wikt/{lang}_lemmas.jsonl", encoding="utf-8") as fh:
        for line in fh:
            # cheap prefilter on the headword before full JSON parse
            m = re.match(r'\{"w": "((?:[^"\\]|\\.)*)"', line)
            if m:
                w = json.loads(f'"{m.group(1)}"')
                if w not in wl and w.lower() not in wl:
                    continue
            r = json.loads(line)
            recs[(r["w"], r["pos"])].append(r)
    return recs


def load_scores(lang):
    sc = {}
    with open(ROOT / f"build/rank/{lang}_ranked.tsv", encoding="utf-8") as fh:
        for line in fh:
            parts = line.rstrip("\n").split("\t")
            sc.setdefault((parts[1], parts[2]), float(parts[3]))
    return sc


def person_index(tags):
    for i, (p, n) in enumerate(PERSONS):
        if p in tags and n in tags:
            return i
    return None


def first_sense_glosses(recs, limit=8):
    out = []
    for r in recs:
        for s in r["s"]:
            g = s["g"]
            if any(g == x[0] for x in out):
                continue
            item = [g]
            if s.get("t"):
                item.append(s["t"])
            out.append(item)
            if len(out) >= limit:
                return out
    return out


def best_audio(recs):
    for r in recs:
        if r.get("audio"):
            return r["audio"][0]
    return None


def best_ipa(recs):
    for r in recs:
        if r.get("ipa"):
            return r["ipa"][0]
    return None


def assign_ids(entries):
    """id = lemma, or lemma~pos when the same lemma appears with several pos codes."""
    count = defaultdict(int)
    for e in entries:
        count[e["lemma"]] += 1
    seen = set()
    for e in entries:
        base = e["lemma"]
        eid = base if count[base] == 1 else f"{base}~{e['pos']}"
        if eid in seen:
            raise SystemExit(f"duplicate id {eid}")
        seen.add(eid)
        e["id"] = eid


def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, ensure_ascii=False, separators=(",", ":"))
