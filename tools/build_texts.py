"""Build app/data/<lang>/texts.json (unit stories) from content/<lang>/texts_*.txt.

Format (one text per "===" header; a unit may have several):

=== u1 | dialogue | Title          type: dialogue | reading | gouin
intro: one line of English scene-setting
Tom: Moin! Ich heiße Tom. | Hi! My name is Tom.          (dialogue line: "Speaker: text | English")
- Ich stehe auf. | I get up.                              (line without a speaker: readings and Gouin series)
q: Lena wohnt in ___. | Hamburg | Berlin | Kiel | en: Lena lives in Hamburg. | why: "Ich wohne in Hamburg."
                                                          (comprehension: the first option is right)

Usage: python3 tools/build_texts.py de|it
"""
import json
import re
import sys
from pathlib import Path

from lexicon_common import write_json

ROOT = Path(__file__).resolve().parent.parent
TYPES = {"dialogue", "reading", "gouin"}


def parse_kv(parts):
    kv, rest = {}, []
    for p in parts:
        m = re.match(r"\s*(en|why):\s*(.*)$", p)
        if m:
            kv[m.group(1)] = m.group(2).strip()
        else:
            rest.append(p.strip())
    return rest, kv


def parse(path, units, errors):
    cur = None
    for n, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.rstrip()
        where = f"{path.name}:{n}"
        if not line.strip() or line.startswith("#"):
            continue
        if line.startswith("=== "):
            uid, typ, title = [x.strip() for x in line[4:].split("|")]
            if typ not in TYPES:
                errors.append(f"{where}: unknown type {typ}")
            cur = {"type": typ, "title": title, "lines": [], "questions": []}
            units.setdefault(uid, []).append(cur)
            continue
        if cur is None:
            errors.append(f"{where}: text before the first === header")
            continue
        if line.startswith("intro:"):
            cur["intro"] = line[6:].strip()
        elif line.startswith("q:"):
            rest, kv = parse_kv(line[2:].split("|"))
            q, opts = rest[0], rest[1:]
            if "___" not in q or len(opts) < 2:
                errors.append(f"{where}: a question needs ___ and at least two options")
            cur["questions"].append({"q": q, "o": opts, **kv})
        else:
            sp = None
            if line.startswith("- "):
                body = line[2:]
            else:
                m = re.match(r"([^:|]{1,24}): (.+)$", line)
                if not m:
                    errors.append(f"{where}: expected 'Speaker: text | English' or '- text | English'")
                    continue
                sp, body = m.group(1).strip(), m.group(2)
            if "|" not in body:
                errors.append(f"{where}: missing English translation")
                continue
            t, e = [x.strip() for x in body.split("|", 1)]
            cur["lines"].append({"sp": sp, "t": t, "e": e} if sp else {"t": t, "e": e})


def main():
    lang = sys.argv[1]
    units, errors = {}, []
    for path in sorted((ROOT / "content" / lang).glob("texts_*.txt")):
        parse(path, units, errors)
    course = json.loads((ROOT / f"app/data/{lang}/course.json").read_text(encoding="utf-8"))
    known = {u["id"] for u in course["units"]}
    for uid, texts in units.items():
        if uid not in known:
            errors.append(f"unknown unit {uid}")
        for t in texts:
            if t["type"] == "gouin" and len(t["lines"]) < 4:
                errors.append(f"{uid} {t['title']}: a Gouin series needs at least 4 steps")
            if t["type"] == "dialogue" and any("sp" not in l for l in t["lines"]):
                errors.append(f"{uid} {t['title']}: every dialogue line needs a speaker")
    if errors:
        print("\n".join(errors))
        sys.exit(1)
    order = {u["id"]: i for i, u in enumerate(course["units"])}
    units = dict(sorted(units.items(), key=lambda kv: order.get(kv[0], 999)))
    write_json(ROOT / f"app/data/{lang}/texts.json", {"units": units})
    n = sum(len(v) for v in units.values())
    print(f"{lang}: {n} texts in {len(units)} units, {sum(len(t['lines']) for v in units.values() for t in v)} lines")


if __name__ == "__main__":
    main()
