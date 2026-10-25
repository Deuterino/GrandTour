"""Vendor the official Anthropic TypeScript SDK as browser ES modules (no build step in this app).

Downloads jsDelivr's ESM build of @anthropic-ai/sdk and every module it imports, rewrites the
absolute "/npm/..." specifiers to relative files, and writes them to app/js/vendor/anthropic/.
The app loads it lazily (only when an AI feature is used).

Usage: python3 tools/vendor_anthropic.py [version]
"""
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "app/js/vendor/anthropic"
CDN = "https://cdn.jsdelivr.net"
SPEC = re.compile(r'''((?:from|import)\s*\(?\s*)"(/npm/[^"]+)"''')


def local_name(path):
    # /npm/@opentelemetry/api@1.10.0/+esm -> opentelemetry__api@1.10.0.mjs
    p = path[len("/npm/"):].replace("/+esm", "").replace(".mjs", "").lstrip("@").replace("@", "-")
    return re.sub(r"[^A-Za-z0-9._-]+", "_", p).strip("_") + ".mjs"


def fetch(path):
    req = urllib.request.Request(CDN + path, headers={"User-Agent": "grand-tour-vendor/1.0"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.read().decode("utf-8")


def main(version):
    OUT.mkdir(parents=True, exist_ok=True)
    entry = f"/npm/@anthropic-ai/sdk@{version}/+esm"
    todo, done = [entry], {}
    while todo:
        path = todo.pop()
        if path in done:
            continue
        src = fetch(path)
        for m in SPEC.finditer(src):
            dep = m.group(2)
            if not dep.endswith("/+esm"):
                dep = dep + "/+esm"
            if dep not in done:
                todo.append(dep)
        done[path] = src
    for path, src in done.items():
        def rewrite(m):
            dep = m.group(2) if m.group(2).endswith("/+esm") else m.group(2) + "/+esm"
            return f'{m.group(1)}"./{local_name(dep)}"'
        name = "sdk.mjs" if path == entry else local_name(path)
        (OUT / name).write_text(SPEC.sub(rewrite, src), encoding="utf-8")
        print(f"{name}: {len(src)} bytes", file=sys.stderr)
    (OUT / "VERSION").write_text(f"@anthropic-ai/sdk {version} (jsDelivr ESM build, Apache-2.0 / MIT)\n", encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "1.2.0")
