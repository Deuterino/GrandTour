"""Build the bundled public-domain library: app/data/<lang>/books/{catalog.json, <id>.json}.

Texts come from Wikisource (proofread public-domain editions). Each book lists its pages; a page whose
title is a table of contents can be expanded into its subpages with "toc". Fetched pages are cached in
build/books_cache/ so rebuilding is offline after the first run.

Usage: python3 tools/build_books.py [de|it]
"""
import hashlib
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

from lexicon_common import write_json

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "build" / "books_cache"
UA = "GrandTourLanguageApp/1.0 (offline reader build; personal use)"

GRIMM_1 = ["Der alte Großvater und der Enkel", "Strohhalm, Kohle und Bohne", "Rothkäppchen", "Die Wichtelmänner",
           "Der Wolf und die sieben jungen Geislein", "Die Bremer Stadtmusikanten", "Frau Holle",
           "Der Froschkönig oder der eiserne Heinrich", "Rumpelstilzchen", "Hänsel und Grethel", "Dornröschen",
           "Rapunzel", "Hans im Glück", "Die sieben Raben", "Aschenputtel", "Sneewittchen", "Die goldene Gans",
           "Das tapfere Schneiderlein", "König Drosselbart", "Tischchen deck dich, Goldesel, und Knüppel aus dem Sack"]
GRIMM_2 = ["Die Sternthaler", "Der süße Brei"]

BOOKS = {
    "de": [
        {"id": "grimm", "title": "Grimms Märchen", "author": "Jacob und Wilhelm Grimm", "year": 1857, "emoji": "🐺",
         "level": "A2–B1", "desc": "22 tales from the Kinder- und Hausmärchen (7th edition, 1857), shortest first. Old spelling: Thür, rothem, daß.",
         "pages": [f"{t} (1857)" for t in GRIMM_2[:1] + GRIMM_1[:2] + GRIMM_2[1:] + GRIMM_1[2:]]},
        {"id": "struwwelpeter", "title": "Der Struwwelpeter", "author": "Heinrich Hoffmann", "year": 1845, "emoji": "✂️",
         "level": "A2", "desc": "Funny, gruesome cautionary tales in rhyme: Zappel-Philipp, Suppen-Kaspar, Hans Guck-in-die-Luft.",
         "toc": "Der Struwwelpeter", "verse": True, "skip_chapters": ["Zur hundertsten Auflage"]},
        {"id": "max-und-moritz", "title": "Max und Moritz", "author": "Wilhelm Busch", "year": 1865, "emoji": "🐔",
         "level": "B1", "desc": "Seven pranks by two naughty boys, told in rhyming couplets.", "toc": "Max und Moritz", "verse": True,
         "preface": ("Vorwort", "Ach, was muß man oft von bösen\nKindern hören oder lesen!!\nWie zum Beispiel hier von diesen,\nWelche Max und Moritz hießen.\n"
                     "Die, anstatt durch weise Lehren\nSich zum Guten zu bekehren,\nOftmals noch darüber lachten\nUnd sich heimlich lustig machten.|"
                     "– Ja, zur Übeltätigkeit,\nJa, dazu ist man bereit!\n– Menschen necken, Tiere quälen,\nÄpfel, Birnen, Zwetschen stehlen –\n"
                     "Das ist freilich angenehmer\nUnd dazu auch viel bequemer,\nAls in Kirche oder Schule\nFestzusitzen auf dem Stuhle.|"
                     "– Aber wehe, wehe, wehe!\nWenn ich auf das Ende sehe!!\n– Ach, das war ein schlimmes Ding,\nWie es Max und Moritz ging.\n"
                     "– Drum ist hier, was sie getrieben,\nAbgemalt und aufgeschrieben.")},
        {"id": "hebel", "title": "Kalendergeschichten", "author": "Johann Peter Hebel", "year": 1811, "emoji": "📅",
         "level": "B1", "desc": "Short stories from the Schatzkästlein des rheinischen Hausfreundes, starting with Kannitverstan.",
         "pages": ["Kannitverstan", "Unverhoftes Wiedersehen", "Der kluge Richter", "Das wohlfeile Mittagessen", "Der Barbierjunge von Segringen", "Seltsamer Spazierritt"]},
        {"id": "kleiner-muck", "title": "Die Geschichte von dem kleinen Muck", "author": "Wilhelm Hauff", "year": 1826, "emoji": "👟",
         "level": "B1", "desc": "The little man with the magic slippers and the walking stick that finds gold.",
         "pages": ["Die Geschichte von dem kleinen Muck"]},
    ],
    "it": [
        {"id": "pinocchio", "title": "Le avventure di Pinocchio", "author": "Carlo Collodi", "year": 1883, "emoji": "🪵",
         "level": "A2–B1", "desc": "The wooden puppet whose nose grows when he lies, in Collodi's original Tuscan.",
         "toc": "Le avventure di Pinocchio"},
        {"id": "racconti-fate", "title": "I racconti delle fate", "author": "Charles Perrault, tradotto da Carlo Collodi", "year": 1876,
         "emoji": "🧚", "level": "A2–B1", "desc": "Cappuccetto Rosso, Cenerentola, Il gatto con gli stivali and more, in Collodi's Italian.",
         "pages": ["Cappuccetto Rosso", "Le fate", "Il gatto con gli stivali", "Cenerentola", "La bella addormentata nel bosco",
                   "Barba-blu", "Puccettino", "Enrichetto dal ciuffo", "Pelle d'asino", "La bella e la bestia"]},
        {"id": "capuana", "title": "C'era una volta... Fiabe", "author": "Luigi Capuana", "year": 1882, "emoji": "🏰",
         "level": "B1", "desc": "Sicilian-flavoured fairy tales by the master of Italian verismo.", "toc": "C'era una volta... Fiabe"},
        {"id": "cuore", "title": "Cuore: i racconti mensili", "author": "Edmondo De Amicis", "year": 1886, "emoji": "❤️",
         "level": "B1", "desc": "The 'monthly stories' read aloud in Enrico's school, from Il piccolo patriota padovano to Dagli Appennini alle Ande.",
         "toc": "Cuore (1889)", "toc_filter": r"(patriota|vedetta|scrivano|tamburino|infermiere|[Ss]angue romagnolo|[Vv]alor civile|Appennini|[Nn]aufragio)"},
    ],
}

SKIP_CLASSES = {"ws-noexport", "noprint", "textdaten", "PageNumber", "AndereVersion", "metadata", "numeropagina",
                "numeropaginaFile", "linkModifica", "mw-editsection", "reference", "references", "imgCaption", "mySpan1",
                "mySpan2", "newFreedImg", "ws-pagenum", "pagenum", "navbox", "barraCapitolo", "toccolours", "prettytable",
                "ws-data", "quality-ns0", "quality-msg", "mw-cite-backlink", "Seitenzahl", "SeitenzahlLinks", "SeitenzahlRechts",
                "zeilennummer", "hiddenStructure", "ws-header", "headertemplate", "plainlinks"}
SKIP_TAGS = {"style", "script", "sup", "math", "noscript", "figure"}  # tables are kept: verse often sits in layout tables
BLOCKS = {"p", "dd", "h2", "h3", "h4", "li"}
JUNK = re.compile(r"^(Andere Ausgaben unter diesem Titel|Siehe auch|Anmerkungen?\b|Fußnoten|Note\b|Fertig!|Dieser Text wurde"
                  r"|[*_\s]+$|\{\{\{.*\}\}\}$|Altri progetti$|Wikipedia$|Commons$|\(?Racconto mensile\)?$|\d+\.\s.{0,50}$)", re.I)
SPACED = re.compile(r"(?<!\w)((?:\w ){3,}\w)(?!\w)")  # letter-spaced emphasis: S t r u w w e l p e t e r


class Extract(HTMLParser):
    """Paragraph texts of a Wikisource page. Inside a poem, <p> and <br> are line breaks and the poem is one block."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skip = 0          # depth inside a skipped subtree
        self.poem = 0          # depth inside div.poem
        self.stack = []        # (tag, opened a poem?) for every open element
        self.cur = None
        self.out = []

    def handle_starttag(self, tag, attrs):
        if tag in ("br", "img", "hr", "wbr", "meta", "link", "input"):
            if tag == "br" and self.cur is not None and not self.skip:
                self.cur.append("\n")
            return
        cls = set((dict(attrs).get("class") or "").split())
        if self.skip or tag in SKIP_TAGS or cls & SKIP_CLASSES:
            self.skip += 1
            self.stack.append((tag, False))
            return
        is_poem = tag == "div" and bool(cls & {"poem", "verse"})
        self.stack.append((tag, is_poem))
        if is_poem:
            self.flush()
            self.poem += 1
            self.cur = []
        elif self.poem and tag in BLOCKS:
            if self.cur is not None:
                self.cur.append("\n")
        elif tag in BLOCKS:
            self.flush()
            self.cur = []

    def handle_endtag(self, tag):
        if not any(t == tag for t, _ in self.stack):
            return  # stray end tag
        while self.stack:
            t, was_poem = self.stack.pop()
            if self.skip:
                self.skip -= 1
            elif was_poem:
                self.poem -= 1
                self.flush()
            elif self.poem and t in BLOCKS:
                if self.cur is not None:
                    self.cur.append("\n")
            elif t in BLOCKS or t == "div":
                self.flush()
            if t == tag:
                break

    def handle_data(self, data):
        if self.skip:
            return
        if self.cur is None and data.strip():
            self.cur = []  # bare text outside any paragraph
        if self.cur is not None:
            self.cur.append(data)

    def flush(self):
        if self.cur:
            text = "".join(self.cur)
            lines = [re.sub(r"\s+", " ", l).strip() for l in text.split("\n")]
            lines = [l for l in lines if l]
            if lines:
                self.out.append("\n".join(lines))
        self.cur = None


def fetch(lang, title):
    CACHE.mkdir(parents=True, exist_ok=True)
    key = CACHE / f"{lang}-{hashlib.md5(title.encode()).hexdigest()}.json"
    if key.exists():
        return json.loads(key.read_text(encoding="utf-8"))
    url = (f"https://{lang}.wikisource.org/w/api.php?action=parse&page={urllib.parse.quote(title)}"
           "&prop=text|links&format=json&redirects=1")
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=40) as r:
                data = json.loads(r.read().decode("utf-8"))
            break
        except Exception as e:  # rate limits and timeouts: back off and retry
            time.sleep(3 * (attempt + 1))
    else:
        raise RuntimeError(f"could not fetch {title}")
    if "error" in data:
        raise RuntimeError(f"{title}: {data['error'].get('info')}")
    page = {"html": data["parse"]["text"]["*"], "links": [l["*"] for l in data["parse"].get("links", []) if l["ns"] == 0]}
    key.write_text(json.dumps(page, ensure_ascii=False), encoding="utf-8")
    time.sleep(1)
    return page


def paragraphs(html, verse=False):
    p = Extract()
    p.feed(html)
    p.flush()
    out = []
    for t in p.out:
        if re.fullmatch(r"[\[\]\dIVXLC.\s]+", t) or t.lower().startswith(("indice", "inhalt")):
            continue  # page numbers, chapter numerals, contents lines
        if not verse:
            out.append(t.replace("\n", " "))
            continue
        lines = t.split("\n")
        for i in range(0, len(lines), 8):  # long poems: pages of eight lines (four couplets)
            out.append("\n".join(lines[i:i + 8]))
    return out


def chapter_title(page_title, book):
    t = page_title.split("/")[-1] if "/" in page_title else page_title
    return re.sub(r"\s*\(\d{4}\)$", "", t).replace("_", " ")


def build(lang):
    out_dir = ROOT / "app" / "data" / lang / "books"
    catalog = []
    for b in BOOKS[lang]:
        pages = list(b.get("pages", []))
        if "toc" in b:
            toc = fetch(lang, b["toc"])
            subs = [l for l in toc["links"] if l.startswith(b["toc"] + "/")]
            # the API lists links alphabetically: restore the order in which the contents page shows them
            hrefs = [urllib.parse.unquote(h).replace("_", " ") for h in re.findall(r'href="/wiki/([^"#?]+)', toc["html"])]
            pos = {t: i for i, t in reversed(list(enumerate(hrefs)))}
            subs.sort(key=lambda t: pos.get(t, 10**6))
            if "toc_filter" in b:
                subs = [l for l in subs if re.search(b["toc_filter"], l)]
            pages = subs or [b["toc"]]
        chapters = []
        if "preface" in b:
            chapters.append({"title": b["preface"][0], "paras": b["preface"][1].split("|")})
        for title in pages:
            try:
                page = fetch(lang, title)
            except RuntimeError as e:
                print(f"  skip {title}: {e}")
                continue
            ct = chapter_title(title, b)
            if ct in b.get("skip_chapters", []):
                continue
            paras = [x for x in paragraphs(page["html"], b.get("verse", False)) if not JUNK.match(x)]
            norm = lambda t: re.sub(r"[^\w]+", " ", t).strip().lower()
            # numbered title lines (26. Rothkäppchen.) and title fragments at the top of a chapter
            paras = [x for x in paras if norm(re.sub(r"^\d+\.\s*", "", x)) != norm(ct)]
            while paras and len(paras[0]) < 60 and norm(paras[0]) and norm(paras[0]) in norm(ct):
                paras.pop(0)
            if b.get("verse"):
                while paras and "\n" not in paras[0]:
                    paras.pop(0)  # title-page lines before the first stanza
            paras = [SPACED.sub(lambda m: m.group(1).replace(" ", ""), x) for x in paras]
            if b.get("verse"):
                # layout tables break stanzas into odd pieces: re-flow the lines in groups of eight (four couplets)
                lines = [l for x in paras for l in x.split("\n")]
                paras = ["\n".join(lines[i:i + 8]) for i in range(0, len(lines), 8)]
            if sum(len(x) for x in paras) < 200:
                print(f"  skip {title}: too short ({len(paras)} paragraphs)")
                continue
            chapters.append({"title": chapter_title(title, b), "paras": paras})
        if not chapters:
            print(f"{b['id']}: nothing fetched")
            continue
        words = sum(len(re.findall(r"\w+", x)) for ch in chapters for x in ch["paras"])
        source = f"https://{lang}.wikisource.org/wiki/{urllib.parse.quote((b.get('toc') or pages[0]).replace(' ', '_'))}"
        book = {"id": b["id"], "title": b["title"], "author": b["author"], "year": b["year"], "emoji": b["emoji"],
                "chapters": chapters, "source": source, "words": words}
        write_json(out_dir / f"{b['id']}.json", book)
        catalog.append({k: b[k] for k in ("id", "title", "author", "year", "emoji", "level", "desc")} |
                       {"chapters": len(chapters), "words": words, "source": source})
        print(f"{lang}/{b['id']}: {len(chapters)} chapters, {words} words")
    write_json(out_dir / "catalog.json", catalog)


if __name__ == "__main__":
    for lang in sys.argv[1:] or ["de", "it"]:
        build(lang)
