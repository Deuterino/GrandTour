"""Drive headless Chrome over the DevTools protocol to exercise the app like a phone user.

Usage (server running on :8765):  python3 tests/cdp.py tests/flows/smoke.json  [--out DIR]
A flow is a JSON list of steps:
  ["goto", "/#/de"]  ["wait", 1500]  ["click", "css selector" | "text:Visible text"]  ["type", "selector", "text"]
  ["eval", "js expression"]  ["shot", "name"]  ["key", "Enter"]
Console errors and uncaught exceptions are printed at the end (exit code 1 if any).
"""
import base64
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request

import websocket

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BASE = "http://localhost:8765"
PORT = 9333


class Page:
    def __init__(self, ws):
        self.ws = ws
        self.n = 0
        self.events = []

    def send(self, method, params=None, timeout=30):
        self.n += 1
        mid = self.n
        self.ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
        end = time.time() + timeout
        while time.time() < end:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == mid:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get("result", {})
            self.events.append(msg)
        raise TimeoutError(method)

    def drain(self, seconds):
        self.ws.settimeout(0.2)
        end = time.time() + seconds
        while time.time() < end:
            try:
                self.events.append(json.loads(self.ws.recv()))
            except websocket.WebSocketTimeoutException:
                pass
        self.ws.settimeout(30)

    def eval(self, expr):
        r = self.send("Runtime.evaluate", {"expression": expr, "awaitPromise": True, "returnByValue": True}, timeout=120)
        if "exceptionDetails" in r:
            return {"error": r["exceptionDetails"].get("exception", {}).get("description", str(r["exceptionDetails"]))}
        return r.get("result", {}).get("value")


CLICK_JS = """(sel => {
  let el;
  if (sel.startsWith('text:')) {
    const t = sel.slice(5);
    el = [...document.querySelectorAll('button, a, .choice, .tile, .stop-btn, .chip, .word-row, [onclick], .w, .row')]
      .filter(e => e.offsetParent !== null && e.textContent.trim().includes(t)).sort((a, b) => a.textContent.length - b.textContent.length)[0];
  } else el = document.querySelector(sel);
  if (!el) return 'NOT FOUND: ' + sel;
  el.scrollIntoView({block: 'center'});
  el.click();
  return 'clicked: ' + (el.textContent || '').trim().slice(0, 60);
})(%s)"""


def run(flow, out):
    prof = tempfile.mkdtemp(prefix="gt-chrome-")
    proc = subprocess.Popen([CHROME, "--headless=new", "--disable-gpu", "--no-first-run", f"--user-data-dir={prof}",
                             f"--remote-debugging-port={PORT}", "--window-size=390,844", "about:blank"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(50):
            try:
                targets = json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json"))
                break
            except Exception:
                time.sleep(0.2)
        page_t = next(t for t in targets if t["type"] == "page")
        p = Page(websocket.create_connection(page_t["webSocketDebuggerUrl"], timeout=30, suppress_origin=True))
        for m in ("Runtime.enable", "Log.enable", "Page.enable"):
            p.send(m)
        p.send("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})
        p.send("Emulation.setTouchEmulationEnabled", {"enabled": True})
        for step in flow:
            kind = step[0]
            if kind == "goto":
                p.send("Page.navigate", {"url": BASE + step[1]})
                p.drain(2.5)
            elif kind == "wait":
                p.drain(step[1] / 1000)
            elif kind == "click":
                print(" ", p.eval(CLICK_JS % json.dumps(step[1])))
                p.drain(0.6)
            elif kind == "type":
                js = f"""(() => {{ const el = document.querySelector({json.dumps(step[1])}); if (!el) return 'no input';
                  const setter = Object.getOwnPropertyDescriptor(el.__proto__, 'value').set; setter.call(el, {json.dumps(step[2])});
                  el.dispatchEvent(new Event('input', {{bubbles: true}})); return 'typed'; }})()"""
                print(" ", p.eval(js))
                p.drain(0.4)
            elif kind == "key":
                p.send("Input.dispatchKeyEvent", {"type": "keyDown", "key": step[1], "code": step[1], "windowsVirtualKeyCode": 13})
                p.send("Input.dispatchKeyEvent", {"type": "keyUp", "key": step[1], "code": step[1], "windowsVirtualKeyCode": 13})
                p.drain(0.6)
            elif kind == "eval":
                expr = step[1]
                if expr == "AUTOPLAY":
                    expr = open(os.path.join(os.path.dirname(__file__), "autoplay.js")).read()
                print("  eval →", json.dumps(p.eval(expr), ensure_ascii=False)[:1500])
            elif kind == "shot":
                data = p.send("Page.captureScreenshot", {"format": "png"})["data"]
                path = os.path.join(out, step[1] + ".png")
                with open(path, "wb") as fh:
                    fh.write(base64.b64decode(data))
                print("  shot →", path)
        p.drain(0.5)
        bad = 0
        for ev in p.events:
            m, prm = ev.get("method"), ev.get("params", {})
            if m == "Runtime.exceptionThrown":
                d = prm["exceptionDetails"]
                print("EXCEPTION:", d.get("exception", {}).get("description", d.get("text"))[:800])
                bad += 1
            elif m == "Runtime.consoleAPICalled" and prm.get("type") in ("error", "warning", "assert"):
                print(f"CONSOLE.{prm['type'].upper()}:", " ".join(str(a.get("value", a.get("description", ""))) for a in prm["args"])[:800])
                bad += prm.get("type") == "error"
            elif m == "Log.entryAdded" and prm["entry"]["level"] == "error":
                print("LOG.ERROR:", prm["entry"]["text"][:300], prm["entry"].get("url", ""))
        return bad
    finally:
        proc.terminate()


if __name__ == "__main__":
    flow = json.load(open(sys.argv[1]))
    out = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else tempfile.mkdtemp(prefix="gt-shots-")
    os.makedirs(out, exist_ok=True)
    sys.exit(1 if run(flow, out) else 0)
