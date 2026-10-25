"""Build app/data/<lang>/grammar.json from content/<lang>/grammar.txt.

Format (one chapter per "===" header):

=== g-id | Title | Level | icon
summary: one line
--- section: Heading            (body: paragraphs, "- " list items, **bold**, *italic*, `code`)
table:                          (pipe rows follow; first row is the header)
| | masculine | feminine |
| nom. | **der** | **die** |
ex: German/Italian sentence | English | optional note
--- tip: Title                  (short card shown inside grammar lessons; same body syntax)
--- mistakes                    ("- " lines)
drill: <type> <n> key=value ...  types: case conj adj gender plural artprep choice order
  q: question with ___ | right | wrong | wrong | en: English | why: explanation      (choice items)
  t: words in the right order | en: English | why: ... | extra: distractor words   (order items)

Usage: python3 tools/build_grammar.py de|it
"""
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def inline(s):
    s = html.escape(s, quote=False)
    s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<i>\1</i>", s)
    s = re.sub(r"`(.+?)`", r"<code>\1</code>", s)
    s = re.sub(r"\[\[(.+?)\]\]", r'<span class="hl-ex">\1</span>', s)
    return s


def body_html(lines):
    out, para, items = [], [], []
    def flush():
        nonlocal para, items
        if para:
            out.append("<p>" + inline(" ".join(para)) + "</p>")
            para = []
        if items:
            out.append("<ul>" + "".join(f"<li>{inline(i)}</li>" for i in items) + "</ul>")
            items = []
    for ln in lines:
        if not ln.strip():
            flush()
        elif ln.lstrip().startswith("- "):
            if para:
                out.append("<p>" + inline(" ".join(para)) + "</p>")
                para = []
            items.append(ln.lstrip()[2:])
        else:
            if items:
                flush()
            para.append(ln.strip())
    flush()
    return "".join(out)


def parse_kv_tail(parts):
    out = {}
    rest = []
    for p in parts:
        m = re.match(r"\s*(en|why|extra|hint):\s*(.*)$", p)
        if m:
            out[m.group(1)] = m.group(2).strip()
        else:
            rest.append(p.strip())
    return rest, out


def main(lang):
    src = []
    for f in sorted((ROOT / f"content/{lang}").glob("grammar*.txt")):
        src += f.read_text(encoding="utf-8").splitlines()
    chapters, ch, block = [], None, None

    def close_block():
        nonlocal block
        if not block:
            return
        b = block
        block = None
        html_body = body_html(b["lines"])
        if b["kind"] == "section":
            sec = {"h": b["title"], "html": html_body}
            if b["table"]:
                sec["table"] = b["table"]
            if b["ex"]:
                sec["examples"] = b["ex"]
            ch["sections"].append(sec)
        elif b["kind"] == "tip":
            tip = {"title": b["title"], "html": html_body}
            if b["table"]:
                rows = b["table"]
                tip["html"] += '<table class="ctable"><thead><tr>' + "".join(f"<th>{c}</th>" for c in rows[0]) + "</tr></thead><tbody>" + \
                    "".join("<tr>" + "".join(f'<td class="{"f" if i else "p"}">{c}</td>' for i, c in enumerate(r)) + "</tr>" for r in rows[1:]) + "</tbody></table>"
            if b["ex"]:
                tip["examples"] = b["ex"]
            ch["tips"].append(tip)
        elif b["kind"] == "mistakes":
            ch["mistakes"] = [inline(l.lstrip()[2:]) for l in b["lines"] if l.lstrip().startswith("- ")]

    for n, raw in enumerate(src, 1):
        line = raw.rstrip()
        if line.startswith("#") and not line.startswith("###"):
            continue
        if line.startswith("=== "):
            close_block()
            parts = [p.strip() for p in line[4:].split("|")]
            ch = {"id": parts[0], "title": parts[1], "level": parts[2], "icon": parts[3] if len(parts) > 3 else "📘",
                  "summary": "", "sections": [], "tips": [], "drills": []}
            chapters.append(ch)
            continue
        if ch is None:
            continue
        if line.startswith("summary:"):
            ch["summary"] = line[8:].strip()
            continue
        if line.startswith("--- "):
            close_block()
            head = line[4:]
            if head.startswith("section:"):
                block = {"kind": "section", "title": head[8:].strip(), "lines": [], "table": None, "ex": []}
            elif head.startswith("tip:"):
                block = {"kind": "tip", "title": head[4:].strip(), "lines": [], "table": None, "ex": []}
            elif head.startswith("mistakes"):
                block = {"kind": "mistakes", "lines": [], "table": None, "ex": []}
            else:
                raise SystemExit(f"grammar.txt:{n}: unknown block {head}")
            continue
        if line.startswith("drill:"):
            close_block()
            parts = line[6:].split()
            d = {"type": parts[0], "n": int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 4}
            for kv in parts[2:]:
                if "=" in kv:
                    k, v = kv.split("=", 1)
                    d[k] = v.split(",") if k in ("cases", "dets", "tenses", "verbs") else v.replace("_", " ")
            if d["type"] in ("choice", "order"):
                d["items"] = []
            ch["drills"].append(d)
            continue
        if line.startswith("  q:") and ch["drills"] and ch["drills"][-1]["type"] == "choice":
            rest, kv = parse_kv_tail(line[4:].split("|"))
            item = {"q": rest[0], "o": rest[1:], **kv}
            if len(item["o"]) < 2:
                raise SystemExit(f"grammar.txt:{n}: choice needs at least 2 options")
            ch["drills"][-1]["items"].append(item)
            continue
        if line.startswith("  t:") and ch["drills"] and ch["drills"][-1]["type"] == "order":
            rest, kv = parse_kv_tail(line[4:].split("|"))
            item = {"t": rest[0], **kv}
            if "extra" in item:
                item["extra"] = item["extra"].split()
            ch["drills"][-1]["items"].append(item)
            continue
        if block is None:
            if line.strip():
                raise SystemExit(f"grammar.txt:{n}: text outside a block: {line[:60]}")
            continue
        if line.startswith("table:"):
            block["table"] = []
            continue
        if line.startswith("|") and block["table"] is not None:
            cells = [inline(c.strip()) for c in line.strip().strip("|").split("|")]
            block["table"].append(cells)
            continue
        if line.startswith("ex:"):
            parts = [p.strip() for p in line[3:].split("|")]
            block["ex"].append(parts[:3] if len(parts) > 2 and parts[2] else parts[:2])
            continue
        block["lines"].append(line)
    close_block()
    out = {"lang": lang, "chapters": chapters}
    (ROOT / f"app/data/{lang}/grammar.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{lang}: {len(chapters)} chapters, {sum(len(c['drills']) for c in chapters)} drill specs, {sum(len(c['tips']) for c in chapters)} tips", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1])
