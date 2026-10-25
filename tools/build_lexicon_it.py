"""Build app/data/it/lexicon.json from content/it/words_*.txt + Wiktionary (kaikki) data.

The curated list is authoritative for lemma, part of speech, gender and English; Wiktionary supplies
plurals, conjugation tables, auxiliaries, IPA, native audio links and detailed senses.
Disagreements are written to build/report_it.txt for review.

Usage: python3 tools/build_lexicon_it.py
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import it_plain, it_plain_word  # noqa: E402
from lexicon_common import (ROOT, WIKT_POS, assign_ids, best_audio, best_ipa, first_sense_glosses,  # noqa: E402
                            load_scores, load_wikt, person_index, read_wordlists, write_json)

TENSES = {  # key: (required tags, forbidden tags)
    "pres": ({"indicative", "present"}, set()),
    "impf": ({"indicative", "imperfect"}, set()),
    "rem": ({"indicative", "historic", "past"}, set()),
    "fut": ({"indicative", "future"}, set()),
    "cond": ({"conditional"}, set()),
    "cong": ({"subjunctive", "present"}, set()),
    "congi": ({"subjunctive", "imperfect"}, set()),
}
IMP_SLOTS = [  # tu, Lei, noi, voi, Loro
    lambda t: "second-person" in t and "singular" in t and "formal" not in t,
    lambda t: "formal" in t and "singular" in t,
    lambda t: "first-person" in t and "plural" in t,
    lambda t: "second-person" in t and "plural" in t and "formal" not in t,
    lambda t: "formal" in t and "plural" in t,
]
VOWEL = "aeiouàèéìòùAEIOU"


def gender_of(pos):
    return {"n.m": "m", "n.f": "f", "n.mf": "mf", "n.mpl": "mpl", "n.fpl": "fpl"}.get(pos)


def wikt_gender(rec):
    g = (rec.get("hargs") or {}).get("1", "")
    head = rec.get("head", "")
    if "mfbysense" in g or "mf" in g or " m or f" in head:
        return "mf"
    if g.startswith("m-p") or re.search(r"\bm pl\b", head):
        return "mpl"
    if g.startswith("f-p") or re.search(r"\bf pl\b", head):
        return "fpl"
    if g.startswith("m") or re.search(r"^\S+ m\b", head):
        return "m"
    if g.startswith("f") or re.search(r"^\S+ f\b", head):
        return "f"
    return None


def pick(recs, pred=None):
    for r in recs:
        if pred is None or pred(r):
            return r
    return recs[0] if recs else None


def build_noun(e, recs, report):
    g = gender_of(e["pos"])
    out = {"g": g}
    rec = pick(recs, lambda r: wikt_gender(r) == g) if recs else None
    if rec is None and recs:
        rec = recs[0]
    if rec:
        wg = wikt_gender(rec)
        if wg and wg != g and not (g == "mf" and wg in ("m", "f")):
            report.append(f"GENDER {e['lemma']}: list={g} wikt={wg} ({rec.get('head','')[:60]})")
    kv = e["kv"]
    if "pl" in kv:
        pls = [x.strip() for x in kv["pl"].split(",")]
        out["pl"] = pls[0]
        if pls[0] == e["lemma"]:
            out["inv"] = 1
    elif g in ("mpl", "fpl"):
        out["pl"] = e["lemma"]
    elif rec:
        hargs = rec.get("hargs") or {}
        head = rec.get("head", "")
        if hargs.get("2") == "#" or "invariable" in head:
            out["pl"] = e["lemma"]
            out["inv"] = 1
        else:
            pf = [(f, t) for f, t in rec.get("f", []) if re.fullmatch(r"(masculine |feminine )?plural", t)]
            if g == "mf":
                m = [f for f, t in pf if t in ("plural", "masculine plural")]
                fm = [f for f, t in pf if t == "feminine plural"]
                if m:
                    out["pl"] = it_plain(m[0])
                if fm and fm[0] != (m[0] if m else None):
                    out["plf"] = it_plain(fm[0])
            elif pf:
                out["pl"] = it_plain(pf[0][0])
                if pf[0][1] == "feminine plural" and g == "m":
                    out["plg"] = "f"
                elif pf[0][1] == "masculine plural" and g == "f":
                    out["plg"] = "m"
            if "pl" not in out:
                l = e["lemma"]
                if re.search(r"([^aeiou]|[àèéìòù]|[^aeiou]i|ie)$", l) or "uncountable" not in head:
                    out["pl"] = l
                    out["inv"] = 1
                    if not re.search(r"([^aeiou]|[àèéìòù]|i|ie)$", l):
                        report.append(f"NOPLURAL-ASSUMED-INV {l} ({head[:70]})")
                else:
                    out["unc"] = 1
    if "pl" in kv and rec:
        pf = [it_plain(f) for f, t in rec.get("f", []) if "plural" in t]
        if pf and out["pl"] not in pf:
            report.append(f"PLURAL-OVERRIDE {e['lemma']}: list={out['pl']} wikt={pf}")
        if "feminine plural" in " ".join(t for f, t in rec.get("f", []) if it_plain(f) == out["pl"]) and g == "m":
            out["plg"] = "f"
    if "f" in kv:
        out["fem"] = kv["f"]
    elif rec:
        fem = [f for f, t in rec.get("f", []) if t == "feminine"]
        if fem:
            out["fem"] = it_plain(fem[0])
    return out


def conj_tables(rec, report, lemma):
    t = {k: [None] * 6 for k in TENSES}
    t["imp"] = [None] * 5
    st = {k: [None] * 6 for k in TENSES}
    st["imp"] = [None] * 5
    aux, pp, ger, inf = set(), None, None, None
    for form, tags in rec.get("f", []):
        ts = set(tags.split())
        plain = it_plain(form)
        if "auxiliary" in ts:
            aux.add(plain)
            continue
        if ts == {"participle", "past"} and not pp:
            pp = plain
            continue
        if ts == {"gerund"} and not ger:
            ger = plain
            continue
        if ts == {"infinitive"} and not inf:
            inf = plain
            continue
        if "imperative" in ts:
            if "negative" in ts:
                continue
            for i, f in enumerate(IMP_SLOTS):
                if f(ts) and t["imp"][i] is None:
                    t["imp"][i] = plain
                    st["imp"][i] = form
                    break
            continue
        for k, (req, forb) in TENSES.items():
            if req <= ts and not (forb & ts):
                if k == "pres" and "subjunctive" in ts:
                    continue
                if k in ("impf",) and "subjunctive" in ts:
                    continue
                pi = person_index(ts)
                if pi is not None and t[k][pi] is None:
                    t[k][pi] = plain
                    st[k][pi] = form
                break
    missing = [k for k, v in t.items() if k != "imp" and any(x is None for x in v)]
    if missing:
        report.append(f"CONJ-GAPS {lemma}: {missing}")
    return t, st, aux, pp, ger, inf


def strip_enclitic(word):
    for cl in ("sene", "sela", "selo", "si", "ci", "vi", "mi", "ti", "ne"):
        if word.endswith(cl) and len(word) > len(cl) + 3:
            return word[: -len(cl)]
    return word


REFL = ["mi", "ti", "si", "ci", "vi", "si"]
# Wiktionary lists every attested auxiliary; learners need the normal one.
AUX_E = {"morire", "arrivare", "tornare", "piacere", "fuggire", "crollare", "esplodere", "atterrare",
         "scivolare", "durare", "mancare", "servire", "piovere", "nevicare", "appartenere", "valere"}
AUX_A = {"pulire", "insegnare", "prendere", "usare", "buttare", "riposare", "alzare", "muovere", "incontrare",
         "riprendere", "rischiare", "rovinare", "gonfiare", "rischiarare", "asciugare", "ripassare", "scaricare",
         "accorciare", "riscaldare", "raffreddare", "pesare", "suonare", "interessare", "seguire", "sapere",
         "procedere", "assomigliare", "somigliare", "rallentare", "proseguire", "inciampare", "potere", "volere",
         "dovere"}
MODALS = {"potere", "volere", "dovere"}

# Determiners and pronouns that agree like adjectives: lemma (m. sg.) -> (f. sg., m. pl., f. pl.); "-" = no such form
FUNC_FORMS = {
    "mio": ("mia", "miei", "mie"), "tuo": ("tua", "tuoi", "tue"), "suo": ("sua", "suoi", "sue"),
    "nostro": ("nostra", "nostri", "nostre"), "vostro": ("vostra", "vostri", "vostre"),
    "questo": ("questa", "questi", "queste"), "quello": ("quella", "quelli", "quelle"),
    "codesto": ("codesta", "codesti", "codeste"), "stesso": ("stessa", "stessi", "stesse"),
    "tutto": ("tutta", "tutti", "tutte"), "alcuno": ("alcuna", "alcuni", "alcune"),
    "altro": ("altra", "altri", "altre"), "certo": ("certa", "certi", "certe"),
    "tanto": ("tanta", "tanti", "tante"), "molto": ("molta", "molti", "molte"),
    "poco": ("poca", "pochi", "poche"), "troppo": ("troppa", "troppi", "troppe"),
    "parecchio": ("parecchia", "parecchi", "parecchie"), "quanto": ("quanta", "quanti", "quante"),
    "quale": ("quale", "quali", "quali"), "tale": ("tale", "tali", "tali"),
    "qualcuno": ("qualcuna", "-", "-"), "nessuno": ("nessuna", "-", "-"),
    "ognuno": ("ognuna", "-", "-"), "ciascuno": ("ciascuna", "-", "-"),
    "esso": ("essa", "essi", "esse"), "colui": ("colei", "coloro", "coloro"), "costui": ("costei", "costoro", "costoro"),
    "glielo": ("gliela", "glieli", "gliele"),
}


def reflexivize(t):
    """Tables of a non-reflexive verb -> reflexive (ricordo -> mi ricordo, ricorda! -> ricordati!)."""
    out = {}
    for k, forms in t.items():
        if k == "imp":
            tu, lei, noi, voi, loro = forms
            out[k] = [tu and tu + "ti", lei and "si " + lei, noi and noi + "ci", voi and voi + "vi", loro and "si " + loro]
        else:
            out[k] = [f and f"{REFL[i]} {f}" for i, f in enumerate(forms)]
    return out


def build_verb(e, recs, all_recs, report):
    lemma = e["lemma"]
    rec = pick(recs, lambda r: len(r.get("f", [])) > 30)
    refl = lemma.endswith(("arsi", "ersi", "irsi", "rsene", "rcela"))
    base_rec = None
    if refl and (not rec or len(rec.get("f", [])) < 30):
        base = re.sub(r"(si|sene|cela)$", "e", lemma)
        if lemma.endswith("rsi"):
            base = lemma[:-3] + "re"
        base_rec = pick(all_recs.get((base, "verb"), []), lambda r: len(r.get("f", [])) > 30)
        if base_rec:
            report.append(f"REFL-FROM-BASE {lemma} <- {base}")
    src = rec if rec and len(rec.get("f", [])) > 30 else base_rec
    out = {}
    if refl:
        out["refl"] = 1
    if not src:
        report.append(f"NOCONJ {lemma}")
        return out
    t, st, aux, pp, ger, inf = conj_tables(src, report, lemma)
    if base_rec and src is base_rec:
        t = reflexivize(t)

    out["t"] = t
    stressed = {}
    for k in st:
        if any(a and b and a != b for a, b in zip(st[k], t[k])):
            stressed[k] = st[k]
    if stressed:
        out["st"] = stressed
    if inf and inf != lemma and it_plain(inf) != lemma:
        out["inf"] = inf
    hargs = src.get("hargs") or {}
    if "+isc" in hargs.get("1", "") or (t["pres"][0] or "").endswith("isco"):
        out["isc"] = 1
    a = sorted(aux)
    if refl:
        out["aux"] = "e"
    elif a == ["avere"]:
        out["aux"] = "a"
    elif a == ["essere"]:
        out["aux"] = "e"
    elif a:
        out["aux"] = "a/e"
    else:
        report.append(f"NOAUX {lemma}")
    if lemma in AUX_E:
        out["aux"] = "e"
    elif lemma in AUX_A:
        out["aux"] = "a"
    if lemma in MODALS:
        out["modal"] = 1
    if "aux" in e["kv"]:
        out["aux"] = e["kv"]["aux"]
    if pp:
        out["pp"] = strip_enclitic(pp) if refl else pp
    if ger:
        out["ger"] = ger
    stress_inf = next((f for f, tg in src.get("f", []) if tg == "infinitive"), None)
    if stress_inf:
        out["sinf"] = stress_inf
    return out


def build_adj(e, recs, report):
    rec = pick(recs)
    out = {}
    if not rec:
        return out
    head = rec.get("head", "")
    hargs = rec.get("hargs") or {}
    forms = rec.get("f", [])
    fd = {}
    for f, t in forms:
        t = t.replace("error-unrecognized-form ", "")
        fd.setdefault(t, it_plain(f))
    if "feminine singular" in fd:
        fd.setdefault("feminine", fd["feminine singular"])
    l = e["lemma"]
    if "invariable" in head:
        out["inv"] = 1
    elif "feminine" in fd or "masculine plural" in fd:
        out["f"] = fd.get("feminine", l)
        out["mp"] = fd.get("masculine plural")
        out["fp"] = fd.get("feminine plural")
        if fd.get("masculine singular") and e["lemma"] in ("bello", "buono", "quello"):
            out["special"] = 1
    elif "plural" in fd:
        out["f"] = l
        out["mp"] = out["fp"] = fd["plural"]
    elif re.search(r"m or f by sense \(plural (\S+?)[,)]", head):
        pl = re.search(r"m or f by sense \(plural (\S+?)[,)]", head).group(1)
        out["f"] = l
        out["mp"] = out["fp"] = it_plain(pl)
    elif l.endswith("o") and " " not in l:
        report.append(f"ADJ-RULE {l}")
        out.update({"f": l[:-1] + "a", "mp": l[:-1] + "i", "fp": l[:-1] + "e"})
    elif l.endswith("e") and " " not in l:
        out.update({"f": l, "mp": l[:-1] + "i", "fp": l[:-1] + "i"})
    if hargs.get("comp"):
        out["cmp"] = [it_plain(x.split("<")[0]) for x in hargs["comp"].split(",")]
    if hargs.get("sup"):
        out["sup"] = [it_plain(x.split("<")[0]) for x in hargs["sup"].split(",")]
    if not out:
        report.append(f"ADJ-NOFORMS {e['lemma']} ({head[:60]})")
    return out


def main():
    entries = read_wordlists("it")
    assign_ids(entries)
    wikt = load_wikt("it", [e["lemma"] for e in entries] +
                     [re.sub(r"rsi$", "re", e["lemma"]) for e in entries if e["pos"] == "v"])
    scores = load_scores("it")
    report = []
    out = []
    for e in entries:
        kpos = "noun" if e["pos"].startswith("n.") else WIKT_POS.get(e["pos"])
        if kpos is None:
            report.append(f"BADPOS {e['lemma']} {e['pos']} ({e['src']})")
            continue
        recs = wikt.get((e["lemma"], kpos), [])
        if not recs and e["pos"] not in ("phr",):
            alt = [r for (w, p), rs in wikt.items() if w == e["lemma"] for r in rs]
            if alt:
                recs = alt
                report.append(f"POS-FALLBACK {e['lemma']} {e['pos']} -> {alt[0]['pos']}")
            elif " " not in e["lemma"]:
                report.append(f"NOTFOUND {e['lemma']} {e['pos']} ({e['src']})")
        item = {"id": e["id"], "l": e["lemma"], "p": e["pos"].split(".")[0], "en": e["en"], "th": e["th"]}
        kv = e["kv"]
        for k in ("note", "reg", "gov"):
            if k in kv:
                item[{"note": "n"}.get(k, k)] = kv[k]
        if e["pos"].startswith("n."):
            item.update(build_noun(e, recs, report))
        elif e["pos"] == "v":
            item["v"] = build_verb(e, recs, wikt, report)
        elif e["pos"] == "a":
            a = build_adj(e, recs, report)
            if a:
                item["a"] = a
        elif e["lemma"] in FUNC_FORMS and item["p"] in ("det", "pron", "adv"):
            f, mp, fp = FUNC_FORMS[e["lemma"]]
            item["a"] = {"f": f, "mp": mp, "fp": fp}
        ipa, aud = best_ipa(recs), best_audio(recs)
        if ipa:
            item["ipa"] = ipa
        if aud:
            item["au"] = aud
        wk = first_sense_glosses(recs, 8)
        if wk:
            item["wk"] = wk
        sc = scores.get((e["lemma"], kpos)) or max((v for (w, p), v in scores.items() if w == e["lemma"]), default=0)
        item["_score"] = sc
        out.append(item)
    # phrases: rank by their rarest word
    word_score = {}
    for it in out:
        word_score[it["l"]] = max(word_score.get(it["l"], 0), it["_score"])
    for it in out:
        if it["_score"] == 0 and " " in it["l"]:
            parts = [word_score.get(w.strip("'"), 0) for w in re.split(r"[ ']", it["l"]) if w]
            it["_score"] = min(parts) * 0.5 if parts and min(parts) else 0
    # greetings and set phrases have no single-word frequency: rank them with common words
    nonzero = sorted((x["_score"] for x in out if x["_score"] > 0), reverse=True)
    for it in out:
        if it["_score"] == 0:
            it["_score"] = nonzero[300] if "greet" in it["th"] else nonzero[len(nonzero) * 2 // 3]
    ranked = sorted(out, key=lambda x: -x["_score"])
    for i, it in enumerate(ranked, 1):
        it["r"] = i
    for it in out:
        del it["_score"]
    # names: tap lookups only (x = not taught)
    for line in (ROOT / "content/it/names.txt").read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        l, kind, en = line.split("|")[:3]
        out.append({"id": f"{l}~name", "l": l, "p": "name", "en": en, "th": ["name"], "x": 1, "kind": kind, "r": 99999})
    write_json(ROOT / "app/data/it/lexicon.json", {"lang": "it", "v": 1, "entries": out})
    (ROOT / "build/report_it.txt").write_text("\n".join(report) + "\n", encoding="utf-8")
    kinds = {}
    for r in report:
        kinds[r.split()[0]] = kinds.get(r.split()[0], 0) + 1
    print(f"it: {len(out)} entries; report: {kinds}")


if __name__ == "__main__":
    main()
