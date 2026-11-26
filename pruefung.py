"""Plausibilitäts-Check nach jedem Scanner-Lauf -> web/pruefung.json (klein, öffentlich).

Prüft, ob die Werte der App passen: Kurse vorhanden und aktuell, keine kaputten Zahlen,
keine unrealistischen Sprünge, Kennzahlen frisch, Indizes da, Zusatzdaten vorhanden.
Fürs Depot stehen hier nur Ja/Nein-Hinweise (nie Namen, Ticker, Anzahlen oder Beträge) –
die Details sieht nur Jannis in der verschlüsselten App.
"""
import json
import math
import os
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(ROOT, "web")
OUT = os.path.join(WEB, "pruefung.json")
NOW = datetime.now(timezone.utc)


def _json(p, d=None):
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return d


def _zahl(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def _alter_h(iso):
    try:
        t = datetime.fromisoformat(iso)
        if t.tzinfo is None:
            t = t.replace(tzinfo=timezone.utc)
        return round((NOW - t).total_seconds() / 3600, 1)
    except Exception:
        return None


def run(depot_info=None):
    probleme, hinweise = [], []
    roh = ""
    try:
        with open(os.path.join(WEB, "data.json"), encoding="utf-8") as f:
            roh = f.read()
        d = json.loads(roh)
    except Exception as ex:
        d = {}
        probleme.append(f"data.json nicht lesbar ({type(ex).__name__})")
    st = d.get("stocks") or []
    chk = d.get("check") or {}
    werktag = NOW.weekday() < 5

    # ---------------- Scanner-Aktien
    ohne_preis, veraltet, sprung, score_bad, ohne_wae = [], [], [], [], []
    grenze = (NOW - timedelta(days=5)).strftime("%Y-%m-%d")
    for s in st:
        t = s.get("t")
        if not _zahl(s.get("p")) or s["p"] <= 0:
            ohne_preis.append(t)
        if (s.get("datum") or "0") < grenze:
            veraltet.append(t)
        if _zahl(s.get("r1d")) and abs(s["r1d"]) > 0.4:
            sprung.append(t)
        sc = s.get("score")
        if sc is not None and (not _zahl(sc) or sc < 0 or sc > 100):
            score_bad.append(t)
        if not s.get("cur"):
            ohne_wae.append(t)
    ticker = [s.get("t") for s in st]
    doppelt = sorted({t for t in ticker if ticker.count(t) > 1})
    kaputt = sum(roh.count(w) for w in ("NaN", "Infinity"))
    n = len(st)
    if n < 300:
        probleme.append(f"nur {n} Aktien in den Daten (sonst rund 970)")
    if chk.get("universum") and chk.get("mit_kursen") is not None and chk["mit_kursen"] < 0.9 * chk["universum"]:
        probleme.append(f"nur {chk['mit_kursen']} von {chk['universum']} Kursen geladen")
    if ohne_preis:
        (probleme if len(ohne_preis) > max(3, 0.01 * n) else hinweise).append(f"{len(ohne_preis)} Aktien ohne gültigen Kurs")
    if veraltet:
        (probleme if len(veraltet) > 0.05 * n else hinweise).append(f"{len(veraltet)} Aktien mit Kurs älter als 5 Tage")
    if sprung:
        hinweise.append(f"{len(sprung)} Aktien mit über 40 % Tagesbewegung (prüfen: {', '.join(sprung[:6])})")
    # Ganzer Börsenplatz einen Handelstag hinten? (z. B. 25.11.2026: Yahoo lieferte für Europa keinen Schlusskurs)
    # Erwarteter letzter Handelstag: heute nach Börsenschluss, sonst der Werktag davor. Feiertage -> nur Hinweis.
    def _erwartet(schluss_utc_h):
        t = NOW if NOW.hour + NOW.minute / 60 >= schluss_utc_h + 1 else NOW - timedelta(days=1)
        while t.weekday() >= 5:
            t -= timedelta(days=1)
        return t.strftime("%Y-%m-%d")
    plaetze = {"Europa": ({"DE", "PA", "AS", "L", "CO", "ST", "SW", "MC", "MI", "HE", "BR"}, 16.5), "USA": ({"US"}, 21.0)}
    for name, (endungen, schluss) in plaetze.items():
        daten = [s.get("datum") for s in st if s.get("datum") and
                 ((s["t"].rsplit(".", 1)[1] if "." in s["t"] and len(s["t"].rsplit(".", 1)[1]) <= 2 else "US") in endungen)]
        if len(daten) >= 20:
            soll = _erwartet(schluss)
            hinten = sum(1 for x in daten if x < soll)
            if hinten > 0.5 * len(daten):
                hinweise.append(f"{name}: {hinten} von {len(daten)} Kursen noch nicht vom {soll[8:10]}.{soll[5:7]}. (Feiertag oder Yahoo-Lücke)")
    if score_bad:
        probleme.append(f"{len(score_bad)} Scores außerhalb 0–100")
    if ohne_wae:
        hinweise.append(f"{len(ohne_wae)} Aktien ohne Währung")
    if doppelt:
        hinweise.append(f"doppelte Ticker: {', '.join(doppelt[:6])}")
    if kaputt:
        probleme.append(f"{kaputt}× kaputte Zahl (NaN/Infinity) in den Daten")
    mk = chk.get("mit_kennzahlen")
    if mk is not None and chk.get("mit_kursen"):
        anteil = mk / chk["mit_kursen"]
        if anteil < 0.7:
            probleme.append(f"Kennzahlen nur für {round(anteil * 100)} % der Aktien")
    ak = _alter_h(d.get("stand_kennzahlen"))
    if ak is not None and ak > 72:
        probleme.append(f"Kennzahlen {round(ak / 24, 1)} Tage alt")

    # ---------------- Indizes (DAX, S&P 500 …)
    markt = d.get("markt") or []
    m_bad = [m.get("n") for m in markt if not _zahl(m.get("p")) or m["p"] <= 0 or
             (_zahl(m.get("r1d")) and abs(m["r1d"]) > 0.15)]
    if not markt:
        hinweise.append("keine Index-Kurse")
    elif m_bad:
        probleme.append(f"Index-Werte unplausibel: {', '.join(str(x) for x in m_bad[:5])}")

    # ---------------- Zusatzdaten
    lg = _json(os.path.join(WEB, "logos", "index.json"), None)
    logos = ({"p": len(lg.get("p") or []), "f": len(lg.get("f") or [])} if isinstance(lg, dict)
             else {"f": len(lg)} if isinstance(lg, list) else None)
    if logos is None:
        hinweise.append("Logo-Liste fehlt")
    ti = _json(os.path.join(WEB, "terminal", "index.json"), None)
    terminal_n = len(ti.get("aktien") or {}) if isinstance(ti, dict) else None
    if terminal_n is None:
        hinweise.append("Terminal-Daten fehlen")
    # Superinvestoren (13F): die SEC sperrt GitHub, die Daten kommen aus sec_13f_seed.json.gz und müssen
    # nach jeder Meldesaison (Mitte Feb/Mai/Aug/Nov) von Claude über einen Browser erneuert werden
    gu = _json(os.path.join(WEB, "terminal", "guru.json"), None)
    q = max([f.get("quartal") or "" for f in (gu or {}).get("fonds") or []] or [""])
    if not q:
        hinweise.append("Superinvestoren-Daten fehlen")
    else:
        alter = (NOW.date() - datetime.strptime(q, "%Y-%m-%d").date()).days
        if alter > 140:
            hinweise.append(f"Superinvestoren-Daten veraltet (Stand Quartal {q}) – Claude bitten: „Superinvestoren aktualisieren“")

    # ---------------- Depot (nur Ja/Nein)
    dep = depot_info if isinstance(depot_info, dict) else {"gelaufen": False}
    if not dep.get("gelaufen"):
        probleme.append("Depot-Auswertung lief nicht durch" + (f" ({dep['fehler']})" if dep.get("fehler") else ""))
    for k, txt in (("kein_kurs", "Depot: mindestens eine Position ohne Börsenkurs"),
                   ("veraltet", "Depot: mindestens ein Kurs älter als 5 Tage"),
                   ("ls_abweichung", "Depot: L&S-Kurs weicht stark ab, Yahoo-Kurs genutzt"),
                   ("luecke", "Depot: Kurslücke bei mindestens einer Position"),
                   ("sprung", "Depot: über 25 % Tagesbewegung bei einer Position (prüfen)"),
                   ("anleihe", "Depot: Anleihenkurs passt nicht zum eingetragenen Wert"),
                   ("summe", "Depot: Gesamtwert unplausibel"),
                   ("push", "Push: Zustellung an mindestens ein Gerät fehlgeschlagen")):
        if dep.get(k):
            (probleme if k in ("kein_kurs", "summe") else hinweise).append(txt)

    out = {
        "stand": NOW.isoformat(), "ok": not probleme, "werktag": werktag,
        "probleme": probleme, "hinweise": hinweise,
        "scanner": {"aktien": n, "universum": chk.get("universum"), "mit_kursen": chk.get("mit_kursen"),
                    "mit_kennzahlen": mk, "kennzahlen_alter_h": ak, "datenstand": d.get("stand")},
        "logos": logos, "terminal": terminal_n,
        "depot": {"gelaufen": bool(dep.get("gelaufen"))},
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Prüfung: {'ok' if out['ok'] else str(len(probleme)) + ' Problem(e)'}, {len(hinweise)} Hinweis(e)", flush=True)
    return out
