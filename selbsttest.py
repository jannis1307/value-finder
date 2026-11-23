"""
Value Finder – Selbsttest vor dem Veröffentlichen
=================================================
Läuft in GitHub Actions direkt vor dem Hochladen der Website. Schlägt ein Test fehl, wird diesmal nichts
veröffentlicht: Die alte, funktionierende Version bleibt online, und der fehlgeschlagene Lauf ist auf GitHub
(und im Morgen-Check) sichtbar. Geprüft wird nur, ob etwas kaputt ist – nie Depotdaten (die sind verschlüsselt).

Aufruf: python selbsttest.py
"""
import glob
import json
import os
import py_compile
import re
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(ROOT, "web")
fehler, hinweise = [], []


def pruefe(bedingung, text):
    if not bedingung:
        fehler.append(text)
    return bedingung


# 1) Programmcode: JavaScript und Python ohne Syntaxfehler
node = shutil.which("node")
for js in sorted(glob.glob(os.path.join(WEB, "*.js"))):
    if os.path.getsize(js) == 0:
        continue
    if node:
        r = subprocess.run([node, "--check", js], capture_output=True, text=True)
        zeile = next((z.strip() for z in (r.stderr or "").splitlines() if "Error" in z), "")
        pruefe(r.returncode == 0, f"{os.path.basename(js)}: Syntaxfehler – {zeile}")
if not node:
    hinweise.append("node fehlt – JavaScript nicht geprüft")
for py in sorted(glob.glob(os.path.join(ROOT, "*.py"))):
    try:
        py_compile.compile(py, doraise=True)
    except py_compile.PyCompileError as e:
        fehler.append(f"{os.path.basename(py)}: {str(e).splitlines()[-1]}")

# 2) index.html: alle eingebundenen Dateien vorhanden, Sicherheitsregeln (CSP) noch drin
try:
    html = open(os.path.join(WEB, "index.html"), encoding="utf-8").read()
    for src in re.findall(r'<script[^>]+src="([^"?#]+)', html):
        if not src.startswith("http"):
            pruefe(os.path.exists(os.path.join(WEB, src)), f"index.html bindet {src} ein, die Datei fehlt")
    pruefe("Content-Security-Policy" in html, "index.html: Content-Security-Policy fehlt")
    pruefe(html.count("<script") == html.count("</script>"), "index.html: <script>-Tags nicht geschlossen")
except OSError:
    fehler.append("index.html fehlt")

# 3) Alle Datendateien sind gültiges JSON
kaputt = []
for p in glob.glob(os.path.join(WEB, "**", "*.json"), recursive=True):
    try:
        with open(p, encoding="utf-8") as f:
            json.load(f)
    except Exception:
        kaputt.append(os.path.relpath(p, WEB))
pruefe(not kaputt, f"{len(kaputt)} kaputte JSON-Dateien, z. B. {', '.join(kaputt[:3])}")
try:
    json.load(open(os.path.join(WEB, "manifest.webmanifest"), encoding="utf-8"))
except Exception:
    fehler.append("manifest.webmanifest ist kein gültiges JSON")

# 4) Scanner-Daten plausibel (sonst lieber die alten Daten online lassen)
try:
    d = json.load(open(os.path.join(WEB, "data.json"), encoding="utf-8"))
    st = d.get("stocks") or []
    pruefe(len(st) >= 100, f"data.json: nur {len(st)} Aktien")
    pruefe(bool(d.get("stand")), "data.json: kein Zeitstempel")
    if st:
        mit_kurs = sum(1 for s in st if isinstance(s.get("p"), (int, float)) and s["p"] > 0)
        pruefe(mit_kurs >= 0.8 * len(st), f"data.json: nur {mit_kurs} von {len(st)} Aktien mit Kurs")
except Exception as e:
    fehler.append(f"data.json nicht lesbar ({type(e).__name__})")

# 5) Keine Klartext-Depotdaten auf der Website (die dürfen nur verschlüsselt dort liegen)
for name in ("portfolio.json", "depot.json", "zugang.json"):
    pruefe(not glob.glob(os.path.join(WEB, "**", name), recursive=True), f"{name} liegt unverschlüsselt in web/")

for h in hinweise:
    print("Hinweis:", h)
if fehler:
    print("::error::Selbsttest fehlgeschlagen – die Website wird diesmal NICHT aktualisiert, die alte Version bleibt online.")
    for f in fehler:
        print("  ✗", f)
    sys.exit(1)
print("Selbsttest bestanden ✓")
