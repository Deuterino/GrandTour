"""Build app/data/de/lexicon.json from content/de/words_*.txt + Wiktionary (kaikki) data.

The curated list is authoritative for lemma, part of speech, gender and English; Wiktionary supplies
plural, genitive, case tables, principal parts and conjugation tables, auxiliaries, IPA and audio.
Disagreements go to build/report_de.txt.

Usage: python3 tools/build_lexicon_de.py
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lexicon_common import (ROOT, WIKT_POS, assign_ids, best_audio, best_ipa, first_sense_glosses,  # noqa: E402
                            load_scores, load_wikt, person_index, read_wordlists, write_json)

CASES = ["nominative", "accusative", "dative", "genitive"]
TENSES = {  # key: (required tags, forbidden tags)
    "pres": ({"indicative", "present"}, {"subordinate-clause"}),
    "pret": ({"indicative", "preterite"}, {"subordinate-clause"}),
    "k1": ({"subjunctive-i"}, {"subordinate-clause"}),
    "k2": ({"subjunctive-ii"}, {"subordinate-clause"}),
}
# Wiktionary lists every attested auxiliary; learners need the standard one.
AUX_S = {"abfahren", "auftauchen", "abhauen", "passieren", "rennen", "wandern", "aufstehen", "fliehen", "eilen", "landen", "stürzen", "einziehen",
         "umziehen", "eingehen", "schmelzen"}
AUX_H = {"anziehen", "setzen", "hängen", "anfangen", "schneien", "sitzen", "stehen", "liegen", "schießen", "tanzen",
         "frieren", "treiben", "umdrehen", "bekommen"}
SOUTHERN_SEIN = {"sitzen", "stehen", "liegen"}
DATIVE_REFLEXIVE = {"sich vorstellen", "sich merken", "sich wünschen", "sich leisten", "sich überlegen",
                    "sich ansehen", "sich anschauen", "sich denken", "sich holen", "sich nehmen"}


def gender_of(pos):
    return {"n.m": "m", "n.f": "f", "n.n": "n", "n.pl": "pl"}.get(pos)


def wikt_gender(rec):
    g = (rec.get("hargs") or {}).get("1", "")
    m = re.match(r"([mfnp])", g)
    if m:
        return {"p": "pl"}.get(m.group(1), m.group(1))
    m = re.match(r"^\S+ (m|f|n|pl)\b", rec.get("head", ""))
    return m.group(1) if m else None


def noun_table(rec):
    """{'sg': [nom, acc, dat, gen], 'pl': [...]} from the declension forms (first variant per cell)."""
    t = {"sg": [None] * 4, "pl": [None] * 4}
    alts = {}
    for form, tags in rec.get("f", []):
        ts = set(tags.split())
        if ts & {"rare", "archaic", "obsolete", "nonstandard", "uncommon", "dated", "poetic", "diminutive"}:
            continue
        num = "pl" if "plural" in ts else "sg" if "singular" in ts else None
        if not num:
            continue
        for i, c in enumerate(CASES):
            if c in ts:
                if t[num][i] is None:
                    t[num][i] = form
                elif form != t[num][i]:
                    alts.setdefault(f"{num}{i}", form)
    return t, alts


def build_noun(e, recs, report):
    g = gender_of(e["pos"])
    kv = e["kv"]
    cands = [r for r in recs if wikt_gender(r) == g] or recs
    if "pl" in kv and cands:
        want = kv["pl"]
        withpl = [r for r in cands if any(f == want and "plural" in t for f, t in r.get("f", []))]
        if withpl:
            cands = withpl
        else:
            report.append(f"PL-OVERRIDE-NOMATCH {e['lemma']}: {want}")
    rec = cands[0] if cands else None
    out = {"g": g}
    if rec and "(adjectival" in rec.get("head", ""):
        out["adjn"] = 1
        out["stem"] = e["lemma"][:-1] if e["lemma"].endswith("e") else e["lemma"]
        out["pl"] = e["lemma"] if e["lemma"].endswith("e") else e["lemma"] + "e"
        return out
    if rec:
        wg = wikt_gender(rec)
        if wg and wg != g and g != "pl":
            report.append(f"GENDER {e['lemma']}: list={g} wikt={wg} ({rec.get('head','')[:60]})")
        t, alts = noun_table(rec)
        if g == "pl":
            t["sg"] = [None] * 4
        if any(t["sg"]) or any(t["pl"]):
            out["d"] = t
        if alts:
            out["alt"] = alts
        out["pl"] = t["pl"][0]
        out["gen"] = t["sg"][3]
        head = rec.get("head", "")
        hargs = (rec.get("hargs") or {}).get("1", "")
        if "weak" in hargs or "(weak" in head:
            out["decl"] = "mixed" if re.search(r"genitive \S+ns\b", head) else "weak"
        elif "(mixed" in head:
            out["decl"] = "mixedpl"  # strong singular, weak plural (der See, des Sees, die Seen)
        if "no plural" in head or "uncountable" in head:
            out["unc"] = 1
        if g != "pl" and not out["pl"] and not out.get("unc"):
            m = re.search(r"plural ([A-ZÄÖÜ][a-zäöüß]+)", head)
            if m:
                out["pl"] = m.group(1)
            else:
                report.append(f"NOPLURAL {e['lemma']} ({head[:70]})")
        fem = next((f for f, t in rec.get("f", []) if t == "feminine"), None)
        if fem and g == "m":
            out["fem"] = fem  # der Lehrer → die Lehrerin
    if "pl" in kv:
        out["pl"] = kv["pl"]
    if "gen" in kv:
        out["gen"] = kv["gen"]
    return out


def conj_tables(rec, lemma, report):
    t = {k: [None] * 6 for k in TENSES}
    imp = [None, None]  # du, ihr
    aux, pp, p1, zu = [], None, None, None
    for form, tags in rec.get("f", []):
        ts = set(tags.split())
        if "auxiliary" in ts:
            for a in form.split(" or "):
                if a not in aux:
                    aux.append(a)
            continue
        if ts == {"participle", "past"}:
            pp = pp or form
            continue
        if ts == {"participle", "present"}:
            p1 = p1 or form
            continue
        if "infinitive-zu" in ts:
            zu = zu or form
            continue
        if "imperative" in ts:
            if "singular" in ts and imp[0] is None:
                imp[0] = form
            elif "plural" in ts and imp[1] is None:
                imp[1] = form
            continue
        for k, (req, forb) in TENSES.items():
            if req <= ts and not (forb & ts):
                pi = person_index(ts)
                if pi is not None and t[k][pi] is None:
                    t[k][pi] = form
                break
    missing = [k for k, v in t.items() if any(x is None for x in v)]
    if missing:
        report.append(f"CONJ-GAPS {lemma}: {missing}")
    t["imp"] = imp
    return t, aux, pp, p1, zu


def build_verb(e, recs, wikt, report):
    lemma = e["lemma"]
    out = {}
    base = lemma
    if lemma.startswith("sich "):
        base = lemma[5:]
        out["refl"] = "d" if lemma in DATIVE_REFLEXIVE or "Dat refl" in e["kv"].get("gov", "") else "a"
        recs = wikt.get((base, "verb"), [])
    if lemma == "möchten":
        mog = next((r for r in wikt.get(("mögen", "verb"), []) if len(r.get("f", [])) > 20), None)
        if mog:
            t, _, _, _, _ = conj_tables(mog, "mögen", report)
            return {"t": {"pres": t["k2"], "imp": ["-", "-"]}, "aux": "h", "cls": "irregular",
                    "note": "Past: wollte (no own past tense)."}
    full = [r for r in recs if len(r.get("f", [])) > 20]
    # pret=schaffte picks the weak schaffen (to manage) over the strong one (schuf: to create)
    want = e["kv"].get("pret")
    if want:
        full = [r for r in full if any(f == want for f, _ in r.get("f", []))] or full
        if not any(f == want for r in full for f, _ in r.get("f", [])):
            report.append(f"PRET-OVERRIDE-NOMATCH {lemma}: {want}")
    rec = full[0] if full else (recs[0] if recs else None)
    if not rec:
        report.append(f"NOCONJ {lemma}")
        return out
    t, aux, pp, p1, zu = conj_tables(rec, lemma, report)
    out["t"] = t
    head = rec.get("head", "")
    hargs = (rec.get("hargs") or {}).get("1", "")
    m = re.match(r"([a-zäöü]+)\.", hargs)
    if m and base.startswith(m.group(1)):
        out["sep"] = m.group(1)
    elif t["pres"][0] and " " in t["pres"][0]:
        out["sep"] = t["pres"][0].split(" ", 1)[1]
    m = re.search(r"\b(class \d+ strong|strong|weak|irregular|mixed|preterite-present)\b", head)
    if m:
        out["cls"] = m.group(1)
    if aux == ["haben"]:
        out["aux"] = "h"
    elif aux == ["sein"]:
        out["aux"] = "s"
    elif aux:
        out["aux"] = "h/s"
    else:
        report.append(f"NOAUX {lemma}")
    if base in AUX_S:
        out["aux"] = "s"
    elif base in AUX_H:
        out["aux"] = "h"
    if base in SOUTHERN_SEIN:
        out["auxn"] = "southern Germany/Austria: ist gesessen/gestanden/gelegen"
    if out.get("refl"):
        out["aux"] = "h"
    if "aux" in e["kv"]:
        out["aux"] = e["kv"]["aux"]
    if pp:
        out["pp"] = pp
    if p1:
        out["p1"] = p1
    if zu:
        out["zu"] = zu
    return out


def build_adj(e, recs, report):
    rec = next((r for r in recs if r.get("f")), recs[0] if recs else None)
    out = {}
    if not rec:
        return out
    fd = {}
    for f, t in rec.get("f", []):
        fd.setdefault(t, f)
    if "comparative" in fd:
        out["cmp"] = fd["comparative"]
    if "superlative" in fd:
        out["sup"] = fd["superlative"]
    strong = fd.get("masculine nominative singular strong") or fd.get("masculine nominative singular strong without-article")
    if strong and strong.endswith("er"):
        stem = strong[:-2]
        if stem != e["lemma"]:
            out["stem"] = stem
    head = rec.get("head", "")
    if "indeclinable" in head or "(indeclinable" in head or e["lemma"] in ("rosa", "lila", "prima", "super", "orange", "egal"):
        return {"inv": 1}
    elif not strong and "predicative" in head:
        out["pred"] = 1
    if "not comparable" in head:
        out["nocmp"] = 1
    return out


def main():
    entries = read_wordlists("de")
    assign_ids(entries)
    names = [e["lemma"] for e in entries] + [e["lemma"][5:] for e in entries if e["lemma"].startswith("sich ")]
    names += [e["lemma"] + "r" for e in entries if e["pos"].startswith("n.")]  # adjectival nouns
    wikt = load_wikt("de", names)
    scores = load_scores("de")
    report, out = [], []
    for e in entries:
        kpos = "noun" if e["pos"].startswith("n.") else WIKT_POS.get(e["pos"])
        if kpos is None:
            report.append(f"BADPOS {e['lemma']} {e['pos']} ({e['src']})")
            continue
        lookup = e["lemma"][5:] if e["lemma"].startswith("sich ") else e["lemma"]
        recs = wikt.get((lookup, kpos), [])
        item = {"id": e["id"], "l": e["lemma"], "p": e["pos"].split(".")[0], "en": e["en"], "th": e["th"]}
        if not recs and kpos == "noun" and wikt.get((lookup + "r", "noun")):
            recs = wikt[(lookup + "r", "noun")]
            item["adjn"] = 1  # adjectival noun: der Erwachsene, ein Erwachsener
        if not recs and kpos != "phrase":
            alt = [r for (w, p), rs in wikt.items() if w == lookup for r in rs]
            if alt:
                recs = alt
                report.append(f"POS-FALLBACK {e['lemma']} {e['pos']} -> {alt[0]['pos']}")
            elif " " not in e["lemma"] or e["lemma"].startswith("sich "):
                report.append(f"NOTFOUND {e['lemma']} {e['pos']} ({e['src']})")
        kv = e["kv"]
        for k in ("note", "reg", "gov"):
            if k in kv:
                item[{"note": "n"}.get(k, k)] = kv[k]
        if e["pos"].startswith("n."):
            if item.get("adjn"):
                item.update({"g": gender_of(e["pos"])})
            else:
                item.update(build_noun(e, recs, report))
        elif e["pos"] == "v":
            item["v"] = build_verb(e, recs, wikt, report)
        elif e["pos"] == "a":
            a = build_adj(e, recs, report)
            if a:
                item["a"] = a
        ipa, aud = best_ipa(recs), best_audio(recs)
        if ipa:
            item["ipa"] = ipa
        if aud:
            item["au"] = aud
        wk = first_sense_glosses(recs, 8)
        if wk:
            item["wk"] = wk
        sc = scores.get((lookup, kpos)) or max((v for (w, p), v in scores.items() if w == lookup), default=0)
        item["_score"] = sc
        out.append(item)
    word_score = {}
    for it in out:
        word_score[it["l"].lower()] = max(word_score.get(it["l"].lower(), 0), it["_score"])
    for it in out:
        if it["_score"] == 0 and " " in it["l"]:
            parts = [word_score.get(w.lower(), 0) for w in it["l"].split() if w != "sich"]
            it["_score"] = min(parts) * 0.5 if parts and min(parts) else 0
    # greetings and set phrases have no single-word frequency: rank them with common words
    nonzero = sorted((x["_score"] for x in out if x["_score"] > 0), reverse=True)
    for it in out:
        if it["_score"] == 0:
            it["_score"] = nonzero[300] if "greet" in it["th"] else nonzero[len(nonzero) * 2 // 3]
    for i, it in enumerate(sorted(out, key=lambda x: -x["_score"]), 1):
        it["r"] = i
    for it in out:
        del it["_score"]
    # names: tap lookups only (x = not taught)
    for line in (ROOT / "content/de/names.txt").read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        l, kind, en = line.split("|")[:3]
        out.append({"id": f"{l}~name", "l": l, "p": "name", "en": en, "th": ["name"], "x": 1, "kind": kind, "r": 99999})
    write_json(ROOT / "app/data/de/lexicon.json", {"lang": "de", "v": 1, "entries": out})
    (ROOT / "build/report_de.txt").write_text("\n".join(report) + "\n", encoding="utf-8")
    kinds = {}
    for r in report:
        kinds[r.split()[0]] = kinds.get(r.split()[0], 0) + 1
    print(f"de: {len(out)} entries; report: {kinds}")


if __name__ == "__main__":
    main()
