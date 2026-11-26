"""Wächter: prüft von außen, ob der Scanner läuft und frische Daten auf der Website ankommen – und repariert selbst.

Läuft als eigener GitHub-Workflow (.github/workflows/waechter.yml) alle 20 Minuten:
1. Hängende Scanner-Läufe abbrechen (Scan-Job > 40 Min. aktiv oder Lauf > 75 Min. in der Warteschlange).
2. Frische der Website prüfen (data.json, garantiert ohne Zwischenspeicher). Zu alt -> Scanner neu starten.
3. Push (ntfy/Telegram) nur, wenn die Selbstreparatur nicht hilft oder die Werte-Prüfung echte Probleme meldet –
   je Störung einmal, plus „läuft wieder“. Keine Depot-Inhalte in Nachrichten oder Log.
Zustand (was schon gemeldet wurde) liegt in waechter_state/zustand.json (über actions/cache weitergereicht).
Nur Standardbibliothek – braucht kein pip install.
"""
import json
import os
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

REPO = os.environ.get("GITHUB_REPOSITORY", "jannis1307/value-finder")
TOKEN = os.environ.get("GH_TOKEN", "")
SEITE = "https://jannis1307.github.io/value-finder/"
ZUSTAND = os.path.join("waechter_state", "zustand.json")
NOW = datetime.now(timezone.utc)
aktionen, befunde = [], []


def log(*a):
    print(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}]", *a, flush=True)


def api(pfad, methode="GET", daten=None):
    req = urllib.request.Request(f"https://api.github.com/repos/{REPO}{pfad}", method=methode,
                                 data=json.dumps(daten).encode() if daten is not None else None,
                                 headers={"Authorization": f"Bearer {TOKEN}", "Accept": "application/vnd.github+json",
                                          "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "value-finder-waechter"})
    with urllib.request.urlopen(req, timeout=30) as r:
        roh = r.read()
        return json.loads(roh) if roh else {}


def seite(datei):
    """Datei frisch von GitHub Pages holen – Zeitstempel-Parameter + no-cache, damit kein alter Stand zurückkommt."""
    req = urllib.request.Request(f"{SEITE}{datei}?waechter={int(time.time() * 1000)}",
                                 headers={"Cache-Control": "no-cache", "Pragma": "no-cache", "User-Agent": "value-finder-waechter"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def zeit(s):
    return datetime.fromisoformat(str(s).replace("Z", "+00:00")) if s else None


def grenze_minuten(t):
    """Wie alt dürfen die Daten sein? Passt zum Takt der Lauf-Kette (siehe scanner.yml, Job „weiter“)."""
    if t.weekday() < 5 and 6 <= t.hour <= 21:
        return 20          # werktags tagsüber: Lauf alle 3–4 Min.
    if t.weekday() >= 5 and 7 <= t.hour <= 21:
        return 90          # Wochenende tagsüber: etwa stündlich
    return 70              # nachts: etwa alle 30 Min.


def senden(titel, text, prio=4):
    ok = False
    topic = os.environ.get("NTFY_TOPIC", "").strip()
    if topic:
        try:
            body = json.dumps({"topic": topic, "title": titel, "message": text, "priority": prio,
                               "tags": ["warning"], "click": SEITE}).encode()
            urllib.request.urlopen(urllib.request.Request(os.environ.get("NTFY_SERVER", "https://ntfy.sh").rstrip("/"),
                                                          data=body, headers={"Content-Type": "application/json"}), timeout=15)
            ok = True
        except Exception as e:
            log("ntfy-Fehler:", type(e).__name__)
    tok, chat = os.environ.get("TELEGRAM_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
    if tok and chat:
        try:
            body = urllib.parse.urlencode({"chat_id": chat, "text": f"{titel}\n{text}"}).encode()
            urllib.request.urlopen(f"https://api.telegram.org/bot{tok}/sendMessage", data=body, timeout=15)
            ok = True
        except Exception as e:
            log("Telegram-Fehler:", type(e).__name__)
    log("Push gesendet:" if ok else "Push NICHT gesendet (kein Kanal erreichbar):", titel)
    return ok


def main():
    try:
        z = json.load(open(ZUSTAND))
    except Exception:
        z = {}
    z.setdefault("stoerung_seit", None)
    z.setdefault("gemeldet", False)
    z.setdefault("neustarts", 0)
    z.setdefault("probleme_gemeldet", [])

    # ---------- 1. Scanner-Läufe ansehen, Hängende abbrechen
    runs = api("/actions/workflows/scanner.yml/runs?per_page=25").get("workflow_runs", [])
    scan_aktiv, letzter_fertig = False, None
    for r in runs:
        if r["status"] == "completed":
            letzter_fertig = letzter_fertig or r
            continue
        erstellt = zeit(r.get("created_at"))
        if r["status"] in ("queued", "waiting", "pending", "requested"):
            if erstellt and NOW - erstellt > timedelta(minutes=75):   # Wochenende: Kette wartet bis ~55 Min.
                api(f"/actions/runs/{r['id']}/cancel", "POST")
                aktionen.append(f"Lauf #{r['run_number']} hing {int((NOW - erstellt).total_seconds() // 60)} Min. in der Warteschlange – abgebrochen")
            continue
        jobs = api(f"/actions/runs/{r['id']}/jobs").get("jobs", [])
        for j in jobs:
            if j["name"] == "scan" and j["status"] == "in_progress":
                start = zeit(j.get("started_at"))
                if start and NOW - start > timedelta(minutes=40):
                    try:
                        api(f"/actions/runs/{r['id']}/cancel", "POST")
                    except Exception:
                        api(f"/actions/runs/{r['id']}/force-cancel", "POST")
                    aktionen.append(f"Lauf #{r['run_number']}: Scan hing seit {int((NOW - start).total_seconds() // 60)} Min. – abgebrochen")
                else:
                    scan_aktiv = True

    # ---------- 2. Frische der Website
    try:
        d = seite("data.json")
        stand, anzahl = zeit(d.get("stand")), d.get("anzahl")
    except Exception as e:
        stand, anzahl = None, None
        befunde.append(f"data.json nicht abrufbar ({type(e).__name__})")
    try:
        pr = seite("pruefung.json")
    except Exception:
        pr = {}
    alter = int((NOW - stand).total_seconds() // 60) if stand else 10 ** 6
    grenze = grenze_minuten(NOW)
    log(f"Daten {alter} Min. alt (erlaubt {grenze}), {anzahl} Aktien, Scan aktiv: {scan_aktiv}")

    fehlschritt = ""
    if letzter_fertig and letzter_fertig.get("conclusion") == "failure":
        try:
            for j in api(f"/actions/runs/{letzter_fertig['id']}/jobs").get("jobs", []):
                for s in j.get("steps") or []:
                    if s.get("conclusion") == "failure":
                        fehlschritt = f"{j['name']} → „{s['name']}“"
        except Exception:
            pass

    if alter > grenze:
        z["stoerung_seit"] = z["stoerung_seit"] or NOW.isoformat()
        if not scan_aktiv:
            api("/actions/workflows/scanner.yml/dispatches", "POST", {"ref": "main"})
            z["neustarts"] += 1
            aktionen.append(f"Daten {alter} Min. alt – Scanner neu gestartet ({z['neustarts']}. Versuch)")
        if alter > 3 * grenze and not z["gemeldet"]:
            text = (f"Die Daten sind {alter // 60} Std. {alter % 60} Min. alt. Der Wächter hat den Scanner "
                    f"{z['neustarts']}× neu gestartet, ohne Erfolg."
                    + (f" Zuletzt fehlgeschlagen: {fehlschritt}." if fehlschritt else "")
                    + " Bitte Claude Bescheid sagen.")
            if senden("⚠️ Value Finder: Scanner steht", text, prio=4):
                z["gemeldet"] = True
    else:
        if z["gemeldet"]:
            senden("✅ Value Finder läuft wieder", f"Daten wieder aktuell ({alter} Min. alt).", prio=3)
        z.update(stoerung_seit=None, gemeldet=False, neustarts=0)

    # ---------- 3. Echte Probleme aus der Werte-Prüfung (Hinweise lösen keine Push aus)
    probleme = sorted(pr.get("probleme") or [])
    if probleme and probleme != z["probleme_gemeldet"]:
        if senden("⚠️ Value Finder: Werte-Prüfung", "\n".join("• " + p for p in probleme[:8]), prio=3):
            z["probleme_gemeldet"] = probleme
    elif not probleme:
        z["probleme_gemeldet"] = []

    # ---------- Ergebnis
    os.makedirs(os.path.dirname(ZUSTAND), exist_ok=True)
    z["letzter_check"] = NOW.isoformat()
    json.dump(z, open(ZUSTAND, "w"), ensure_ascii=False, indent=1)
    zeilen = [f"**Daten:** {alter} Min. alt (erlaubt {grenze}) · {anzahl} Aktien",
              f"**Werte-Prüfung:** {'ok' if pr.get('ok') else 'Probleme'} · {len(pr.get('hinweise') or [])} Hinweis(e)"]
    zeilen += [f"**Aktion:** {a}" for a in aktionen] or ["**Aktion:** keine nötig"]
    zeilen += [f"**Befund:** {b}" for b in befunde]
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        open(os.environ["GITHUB_STEP_SUMMARY"], "a").write("\n\n".join(zeilen) + "\n")
    for x in zeilen:
        log(x.replace("**", ""))


if __name__ == "__main__":
    main()
