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

    def draw(size, maskable=False):
        img = Image.new("RGBA", (size, size), (246, 239, 226, 255))
        d = ImageDraw.Draw(img)
        pad = int(size * (0.18 if maskable else 0.06))
        r = int(size * 0.22)
        d.rounded_rectangle([pad, pad, size - pad, size - pad], radius=r, fill=(157, 42, 34, 255))
        # compass rose / road: a gold arc and two flag stripes
        cx = cy = size // 2
        rr = int((size - 2 * pad) * 0.34)
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=(201, 154, 28, 255), width=max(3, size // 40))
        w = max(4, size // 28)
        d.polygon([(cx, cy - rr - w), (cx + w * 1.6, cy), (cx, cy + rr + w), (cx - w * 1.6, cy)], fill=(246, 239, 226, 255))
        d.polygon([(cx - rr - w, cy), (cx, cy + w * 1.6), (cx + rr + w, cy), (cx, cy - w * 1.6)], fill=(201, 154, 28, 255))
        # tri-color ribbons (German black-red-gold, Italian green-white-red) at the bottom corners
        bw = int((size - 2 * pad) * 0.11)
        y0 = size - pad - int(bw * 2.2)
        for i, col in enumerate([(30, 30, 30), (221, 0, 0), (255, 206, 0)]):
            d.rectangle([pad + int(bw * 0.9) + i * bw // 1, y0, pad + int(bw * 0.9) + (i + 1) * bw // 1 - 1, y0 + bw], fill=col)
        for i, col in enumerate([(0, 146, 70), (255, 255, 255), (206, 43, 55)]):
            x = size - pad - int(bw * 0.9) - (3 - i) * bw
            d.rectangle([x, y0, x + bw - 1, y0 + bw], fill=col)
        return img

    for sz, name in [(192, "icon-192.png"), (512, "icon-512.png"), (180, "apple-touch-icon.png")]:
        draw(sz).save(out / name)
    draw(512, maskable=True).save(out / "icon-maskable-512.png")


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
