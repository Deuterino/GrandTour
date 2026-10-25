"""Generate app/sw.js (precache list + version) and the app icons.

Usage: python3 tools/build_app.py
"""
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "app"


def make_icons():
    from PIL import Image, ImageDraw, ImageFont
    out = APP / "icons"
    out.mkdir(exist_ok=True)

    red, gold, cream = (157, 42, 34, 255), (201, 154, 28, 255), (246, 239, 226, 255)

    def draw(size, bleed=False):
        """bleed: a square filled to the edges (iOS rounds it itself; maskable icons are cropped to a circle),
        with the artwork inside the central safe zone. Otherwise a rounded tile on a transparent background."""
        if bleed:
            img = Image.new("RGBA", (size, size), red)
            box = size * 0.72
        else:
            img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
            pad = int(size * 0.04)
            ImageDraw.Draw(img).rounded_rectangle([pad, pad, size - pad, size - pad], radius=int(size * 0.22), fill=red)
            box = size * 0.82
        d = ImageDraw.Draw(img)
        # compass rose above two flags (German black-red-gold, Italian green-white-red)
        cx, cy = size / 2, size / 2 - box * 0.07
        rr = box * 0.36
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=gold, width=max(3, size // 40))
        w = max(4, size / 28)
        d.polygon([(cx, cy - rr - w), (cx + w * 1.6, cy), (cx, cy + rr + w), (cx - w * 1.6, cy)], fill=cream)
        d.polygon([(cx - rr - w, cy), (cx, cy + w * 1.6), (cx + rr + w, cy), (cx, cy - w * 1.6)], fill=gold)
        bw, y0 = box * 0.10, size / 2 + box * 0.33
        for flag, x0 in (([(30, 30, 30), (221, 0, 0), (255, 206, 0)], size / 2 - box * 0.46),
                         ([(0, 146, 70), (255, 255, 255), (206, 43, 55)], size / 2 + box * 0.16)):
            for i, col in enumerate(flag):
                d.rectangle([x0 + i * bw, y0, x0 + (i + 1) * bw - 1, y0 + bw * 0.9], fill=col)
        return img

    for sz, name in [(192, "icon-192.png"), (512, "icon-512.png")]:
        draw(sz).save(out / name)
    draw(180, bleed=True).convert("RGB").save(out / "apple-touch-icon.png")
    draw(512, bleed=True).save(out / "icon-maskable-512.png")


def build_sw():
    shell, data = [], []
    for p in sorted(APP.rglob("*")):
        if p.is_dir() or p.name in ("sw.js", ".DS_Store") or p.suffix in (".map",):
            continue
        rel = p.relative_to(APP).as_posix()
        if rel.startswith("data/") and "/books/" in rel and not rel.endswith("catalog.json"):
            continue  # books are downloaded on demand
        if rel.startswith("data/"):
            if rel.endswith("dict-ext.json"):
                continue
            data.append("./" + rel)
        else:
            shell.append("./" + rel)
    shell.insert(0, "./")
    h = hashlib.sha256()
    for rel in shell + data:
        if rel == "./":
            continue
        h.update((APP / rel[2:]).read_bytes())
    version = h.hexdigest()[:12]
    tpl = (ROOT / "tools/sw_template.js").read_text(encoding="utf-8")
    sw = tpl.replace("__VERSION__", version).replace("__SHELL__", json.dumps(shell, indent=1)).replace("__DATA__", json.dumps(data, indent=1))
    (APP / "sw.js").write_text(sw, encoding="utf-8")
    print(f"sw.js: version {version}, {len(shell)} shell files, {len(data)} data files", file=sys.stderr)


if __name__ == "__main__":
    if not (APP / "icons/icon-192.png").exists() or "--icons" in sys.argv:
        make_icons()
    build_sw()
