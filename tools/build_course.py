"""Build app/data/<lang>/course.json: sections, units (cities) and lessons, with every lexicon word
assigned to exactly one unit.

Allocation: explicit words from content/<lang>/course.txt first; then each unit is filled, in route
order, with the most frequent unassigned words that share one of its themes, limited by a frequency
ceiling that rises along the route (so unit 5 does not take a rare food word); remaining slots take
the most frequent words of any theme. Explicit entries that are not lexicon lemmas (fu, c'è, vorrei)
are kept as the unit's featured forms.

Usage: python3 tools/build_course.py de|it
"""
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEARN_SIZE = 7  # new words per vocabulary lesson
TOP_CAP = 22    # topical words per unit before a topic spills into later units
GENERIC = {"act", "desc", "abs", "adv", "func", "mind", "talk", "move", "feel", "daily", "q"}
POS_ORDER = {"n": 0, "v": 1, "a": 2}


def parse(lang):
    sections, units = [], []
    for ln, line in enumerate((ROOT / f"content/{lang}/course.txt").read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line or (line.startswith("#") and not line.startswith("##")):
            continue
        if line.startswith("## "):
            n, region, title, cefr, emoji = [x.strip() for x in line[3:].split("|")]
            sections.append({"n": int(n), "region": region, "title": title, "cefr": cefr, "emoji": emoji, "units": []})
            continue
        parts = [x.strip() for x in line.split("|")]
        if len(parts) < 7:
            raise SystemExit(f"course.txt:{ln}: expected 7-8 fields")
        n, city, emoji, title, themes, grammar, fact = parts[:7]
        words = [w.strip() for w in parts[7].split(",")] if len(parts) > 7 and parts[7] else []
        u = {"id": f"u{n}", "n": int(n), "city": city, "emoji": emoji, "title": title,
             "themes": [t for t in themes.split(",") if t], "grammar": [g for g in grammar.split(",") if g and g != "review"],
             "review": "review" in grammar, "fact": fact, "explicit": [w for w in words if w], "section": sections[-1]["n"]}
        sections[-1]["units"].append(u["id"])
        units.append(u)
    return sections, units


def main(lang):
    lex = json.loads((ROOT / f"app/data/{lang}/lexicon.json").read_text(encoding="utf-8"))
    entries = [e for e in lex["entries"] if not e.get("x")]
    by_id = {e["id"]: e for e in entries}
    by_lemma = {}
    for e in entries:
        by_lemma.setdefault(e["l"], []).append(e)
        by_lemma.setdefault(e["l"].lower(), []).append(e)
    sections, units = parse(lang)
    assigned = {}
    report = []
    for u in units:
        u["words"], u["forms"] = [], []
        for w in u["explicit"]:
            cands = [by_id[w]] if w in by_id else by_lemma.get(w) or by_lemma.get(w.lower()) or []
            if not cands:
                u["forms"].append(w)
                continue
            # prefer the reading not yet taken, verbs/nouns before function readings of the same lemma
            cands = sorted(cands, key=lambda e: (e["id"] in assigned, not set(e["th"]) & set(u["themes"]),
                                                 POS_ORDER.get(e["p"], 3)))
            e = cands[0]
            if e["id"] in assigned:
                continue  # already taught earlier: this unit revisits it
            assigned[e["id"]] = u["id"]
            u["words"].append(e["id"])
    n_units = len(units)
    unit_by_id = {u["id"]: u for u in units}
    avg = len(entries) / n_units
    ceiling = lambda i: 150 + (i + 1) * avg * 1.6
    # Topical words go to a unit that shares their topic; general words are spread by frequency.
    pending = [e for e in sorted(entries, key=lambda e: e["r"]) if e["id"] not in assigned]
    for u in units:
        u["_top"] = len(u["words"])  # explicit words count against the topical cap
    generic = []
    for e in pending:
        topics = set(e["th"]) - GENERIC
        cands = [(i, u) for i, u in enumerate(units) if topics & set(u["themes"])]
        if not topics or not cands:
            generic.append(e)
            continue
        fits = [(i, u) for i, u in cands if e["r"] <= ceiling(i) and u.setdefault("_top", 0) < TOP_CAP]
        if not fits:
            ok = [(i, u) for i, u in cands if e["r"] <= ceiling(i)]
            fits = [min(ok, key=lambda iu: iu[1].get("_top", 0))] if ok else [cands[0]]
        i, u = fits[0]
        u["_top"] = u.get("_top", 0) + 1
        assigned[e["id"]] = u["id"]
        u["words"].append(e["id"])
    for i, u in enumerate(units):
        rest = units[i:]
        left = len(generic)
        target = math.ceil((left + sum(len(x["words"]) for x in rest)) / len(rest))
        while generic and len(u["words"]) < target:
            e = generic.pop(0)
            assigned[e["id"]] = u["id"]
            u["words"].append(e["id"])
    for e in generic:  # rounding leftovers
        units[-1]["words"].append(e["id"])
        assigned[e["id"]] = units[-1]["id"]
    for u in units:
        u.pop("_top", None)
    assert len(assigned) == len(entries), "unassigned words"

    for u in units:
        ws = sorted(u["words"], key=lambda i: (by_id[i]["r"]))
        explicit_ids = [i for i in u["words"] if i in set(u["words"][: len(u["explicit"])])]
        ordered = explicit_ids + [i for i in ws if i not in explicit_ids]
        u["words"] = ordered
        lessons = []
        n_learn = max(1, math.ceil(len(ordered) / LEARN_SIZE))
        size = math.ceil(len(ordered) / n_learn)
        for k in range(n_learn):
            chunk = ordered[k * size:(k + 1) * size]
            if chunk:
                lessons.append({"id": f"{u['id']}l{len(lessons) + 1}", "type": "learn", "words": chunk})
            if k == 1 and u["grammar"]:
                lessons.append({"id": f"{u['id']}l{len(lessons) + 1}", "type": "grammar", "grammar": u["grammar"]})
        if u["grammar"] and not any(l["type"] == "grammar" for l in lessons):
            lessons.append({"id": f"{u['id']}l{len(lessons) + 1}", "type": "grammar", "grammar": u["grammar"]})
        lessons.append({"id": f"{u['id']}l{len(lessons) + 1}", "type": "story"})
        lessons.append({"id": f"{u['id']}l{len(lessons) + 1}", "type": "drill"})
        lessons.append({"id": f"{u['id']}l{len(lessons) + 1}", "type": "practice"})
        if u["review"] or u["n"] % 10 == 0:
            lessons.append({"id": f"{u['id']}l{len(lessons) + 1}", "type": "boss"})
        u["lessons"] = lessons
        del u["explicit"]
    out = {"lang": lang, "title": "Die Wanderjahre" if lang == "de" else "Il Grand Tour",
           "sections": sections, "units": units}
    (ROOT / f"app/data/{lang}/course.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    sizes = [len(u["words"]) for u in units]
    forms = {u["id"]: u["forms"] for u in units if u["forms"]}
    print(f"{lang}: {len(units)} units, words/unit min {min(sizes)} max {max(sizes)}, lessons {sum(len(u['lessons']) for u in units)}")
    print("  featured forms (not lemmas):", forms)
    for r in report:
        print("  ", r)


if __name__ == "__main__":
    main(sys.argv[1])
