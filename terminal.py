"""
Value Finder – Daten fürs Terminal
==================================
Je Aktie aus dem Scanner (öffentliche Firmendaten, keine Depotdaten):
  • Profil: Branche, Mitarbeiter, Sitz, Website, Geschäftsbeschreibung, Vorstand        (Yahoo)
  • Aktionäre: Anteil Insider/Institutionen, größte Fonds und Institutionen, Insider-Bestände (Yahoo)
  • Verflechtungen: Mutter- und Tochterfirmen, Beteiligungen, Großeigentümer, Gründer,
    Chef, Partnerschaften                                                                 (Wikidata, frei nutzbar)
Gesammelt wird in Häppchen (ein paar Dutzend Aktien pro Lauf), damit kein Lauf lange dauert:
Yahoo-Daten alle 14 Tage neu, Wikidata alle 30 Tage. Depot und Merkliste kommen zuerst dran.
Ausgabe: web/terminal/<Ticker>.json und web/terminal/index.json (wer was hat).
"""

import json
import os
import re
import time
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(ROOT, "web", "terminal")
CACHE = os.path.join(ROOT, "state", "terminal.json")   # web/ wird bei jedem Lauf neu aufgebaut
PRIO = os.path.join(ROOT, "state", "prio.json")         # Reihenfolge aus depot.py: erst Depot, dann Merkliste
NOW = datetime.now(timezone.utc)
YAHOO_TAGE, WIKI_TAGE, LOGO_TAGE = 14, 30, 60
LOGO_STATE = os.path.join(ROOT, "state", "logos")    # Logos bleiben im Zwischenspeicher, web/ wird neu gebaut
LOGO_OUT = os.path.join(ROOT, "web", "logos")
LOGO_JE_LAUF = 80
JE_LAUF = 25           # Aktien pro Lauf (Yahoo)
WIKI_JE_LAUF = 60      # Ticker pro Wikidata-Abfrage
UA = "ValueFinder/1.0 (privates Lernprojekt; https://github.com/jannis1307/value-finder)"


def log(*a):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] [Terminal]", *a, flush=True)


def datei(t):
    """Ticker -> sicherer Dateiname (z. B. NOVO-B.CO -> NOVO-B.CO, ^ und / ersetzt)."""
    return re.sub(r"[^A-Za-z0-9.\-]", "_", t) + ".json"


def _num(x):
    if isinstance(x, dict):
        x = x.get("raw")
    try:
        x = float(x)
        return x if x == x else None
    except (TypeError, ValueError):
        return None


def _datum(x):
    v = _num(x)
    if v is None:
        return None
    try:
        return datetime.fromtimestamp(v, tz=timezone.utc).strftime("%Y-%m-%d")
    except (OverflowError, OSError, ValueError):
        return None


def _alt(eintrag, tage):
    try:
        return (NOW - datetime.fromisoformat(eintrag)).days >= tage
    except Exception:
        return True


# ---------------------------------------------------------------- Yahoo: Profil + Aktionäre
def yahoo(t, yd):
    url = f"https://query2.finance.yahoo.com/v10/finance/quoteSummary/{t}"
    mods = "assetProfile,majorHoldersBreakdown,institutionOwnership,fundOwnership,insiderHolders"
    j = yd.get_raw_json(url, params={"modules": mods, "formatted": "false", "lang": "en-US", "region": "US"}, timeout=20)
    r = (((j or {}).get("quoteSummary") or {}).get("result") or [None])[0] or {}
    ap, mh = r.get("assetProfile") or {}, r.get("majorHoldersBreakdown") or {}
    profil = {
        "branche": ap.get("industry"), "sektor": ap.get("sector"), "mitarbeiter": _num(ap.get("fullTimeEmployees")),
        "land": ap.get("country"), "stadt": ap.get("city"), "web": ap.get("website"),
        "text": (ap.get("longBusinessSummary") or "")[:1800] or None,
        "vorstand": [{"name": o.get("name"), "titel": o.get("title"), "alter": _num(o.get("age")),
                      "gehalt": _num(o.get("totalPay"))} for o in (ap.get("companyOfficers") or [])[:8] if o.get("name")],
    }

    def liste(block):
        out = []
        for x in ((r.get(block) or {}).get("ownershipList") or [])[:10]:
            if not x.get("organization"):
                continue
            out.append({"name": x["organization"], "anteil": _num(x.get("pctHeld")), "stueck": _num(x.get("position")),
                        "wert": _num(x.get("value")), "veraenderung": _num(x.get("pctChange")), "stand": _datum(x.get("reportDate"))})
        return out

    aktionaere = {
        "insider_anteil": _num(mh.get("insidersPercentHeld")), "inst_anteil": _num(mh.get("institutionsPercentHeld")),
        "inst_streubesitz": _num(mh.get("institutionsFloatPercentHeld")), "inst_anzahl": _num(mh.get("institutionsCount")),
        "institutionen": liste("institutionOwnership"), "fonds": liste("fundOwnership"),
        "insider": [{"name": h.get("name"), "rolle": h.get("relation"), "stueck": _num(h.get("positionDirect")),
                     "letzte": h.get("transactionDescription"), "stand": _datum(h.get("latestTransDate"))}
                    for h in ((r.get("insiderHolders") or {}).get("holders") or [])[:10] if h.get("name")],
    }
    # Bei Aktien außerhalb der USA sieht Yahoo nur US-Fonds (Meldepflicht 13F): kleine Anteile, kein vollständiges Bild
    aktionaere["nur_us_meldungen"] = "." in t and not t.endswith(".TO")
    return profil, aktionaere


# ---------------------------------------------------------------- Wikidata: Verflechtungen
WD_PROPS = {"P749": "mutter", "P355": "toechter", "P1830": "beteiligungen", "P127": "eigentuemer",
            "P112": "gruender", "P169": "chef", "P2652": "partner", "P199": "sparten"}


_FUELL = {"inc", "corp", "the", "group", "holding", "holdings", "company", "limited", "plc", "ltd", "corporation", "publ", "co"}


def _woerter(x):
    import unicodedata
    x = unicodedata.normalize("NFD", x or "").encode("ascii", "ignore").decode().lower()
    return [w for w in re.split(r"[^a-z0-9]+", x) if w and w not in _FUELL]


def _passt(name, label):
    """Wie gut passt ein Wikidata-Treffer zum Namen aus dem Scanner? 0 = gar nicht
    (gleicher Ticker an anderer Börse ist oft eine ganz andere Firma)."""
    a, b = _woerter(name), _woerter(label)
    if not a or not b:
        return 0
    if "".join(a) == "".join(b):
        return 10
    if a[0] != b[0] and a[0][:5] != b[0][:5] and a[0] not in b and b[0] not in a:
        return 0
    return 1 + len(set(a) & set(b))


def wikidata(tickers, namen):
    """{Ticker: {wd, mutter:[..], toechter:[..], ...}} für eine Liste von Yahoo-Tickern."""
    import requests
    basis = {}
    for t in tickers:
        b = t.split(".")[0].split("-")[0] if "." in t else t.replace("-", ".")
        basis.setdefault(b, []).append(t)
    werte = " ".join(json.dumps(b) for b in basis)
    q = f"""SELECT ?firma ?firmaLabel ?tick ?prop ?ziel ?zielLabel WHERE {{
      VALUES ?tick {{ {werte} }}
      ?firma p:P414 ?b . ?b pq:P249 ?tick .
      VALUES ?prop {{ {" ".join("wdt:" + p for p in WD_PROPS)} }}
      OPTIONAL {{ ?firma ?prop ?ziel . }}
      SERVICE wikibase:label {{ bd:serviceParam wikibase:language "de,en". }}
    }}"""
    r = requests.get("https://query.wikidata.org/sparql", params={"query": q, "format": "json"},
                     headers={"User-Agent": UA, "Accept": "application/sparql-results+json"}, timeout=60)
    r.raise_for_status()
    zeilen = r.json()["results"]["bindings"]
    # erst je Aktie die am besten passende Firma wählen (mehrere Firmen können denselben Ticker haben)
    wahl = {}
    for b in zeilen:
        tick, label, wd = b["tick"]["value"], b.get("firmaLabel", {}).get("value", ""), b["firma"]["value"].rsplit("/", 1)[-1]
        for t in basis.get(tick, []):
            sc = _passt(namen.get(t, ""), label)
            if sc and sc > wahl.get(t, (None, None, 0))[2]:
                wahl[t] = (wd, label, sc)
    out = {}
    for b in zeilen:
        tick, wd = b["tick"]["value"], b["firma"]["value"].rsplit("/", 1)[-1]
        for t in basis.get(tick, []):
            if t not in wahl or wahl[t][0] != wd:
                continue
            e = out.setdefault(t, {"wd": wd, "name": wahl[t][1]})
            if "prop" not in b or "zielLabel" not in b:
                continue
            feld = WD_PROPS.get(b["prop"]["value"].rsplit("/", 1)[-1])
            ziel = b["zielLabel"]["value"]
            if not feld or re.fullmatch(r"Q\d+", ziel):   # ohne Namen (nur Nummer) weglassen
                continue
            L = e.setdefault(feld, [])
            if ziel not in L and len(L) < 25:
                L.append(ziel)
    return out


# ---------------------------------------------------------------- Logos
def _domain(web):
    m = re.match(r"^(?:https?://)?(?:www\.)?([^/:?#]+)", (web or "").strip().lower())
    return m.group(1) if m and "." in m.group(1) else None


def _png_breite(b):
    if len(b) > 24 and b[:8] == b"\x89PNG\r\n\x1a\n":
        return int.from_bytes(b[16:20], "big")
    return None


def logos(cache, reihe):
    """Firmenlogo (Website-Symbol, 128 px) einmal laden und im Zwischenspeicher behalten.
    Die App lädt nur unsere eigene Kopie – kein Dritt-Server sieht, welche Aktien du anschaust."""
    import requests
    os.makedirs(LOGO_STATE, exist_ok=True)
    neu = 0
    for t in reihe:
        if neu >= LOGO_JE_LAUF:
            break
        e = cache.get(t) or {}
        dom = _domain((e.get("profil") or {}).get("web"))
        lg = e.get("logo") or {}
        if not dom or (lg.get("dom") == dom and not _alt(lg.get("stand"), LOGO_TAGE)):
            continue
        ok = False
        try:
            r = requests.get("https://www.google.com/s2/favicons", params={"domain": dom, "sz": 128}, timeout=15,
                             headers={"User-Agent": UA})
            b = r.content
            w = _png_breite(b)
            # 404 = kein Symbol (Google liefert dann einen Globus); zu kleine Symbole sehen verwaschen aus
            if r.status_code == 200 and len(b) > 300 and (w is None or w >= 48):
                with open(os.path.join(LOGO_STATE, datei(t).replace(".json", ".png")), "wb") as f:
                    f.write(b)
                ok = True
        except Exception:
            pass
        e["logo"] = {"dom": dom, "ok": ok, "stand": NOW.isoformat()}
        cache[t] = e
        neu += 1
        time.sleep(0.15)
    # alle vorhandenen Logos veröffentlichen
    import shutil
    os.makedirs(LOGO_OUT, exist_ok=True)
    da = []
    for t, e in cache.items():
        if (e.get("logo") or {}).get("ok"):
            q = os.path.join(LOGO_STATE, datei(t).replace(".json", ".png"))
            if os.path.exists(q):
                shutil.copyfile(q, os.path.join(LOGO_OUT, os.path.basename(q)))
                da.append(t)
    with open(os.path.join(LOGO_OUT, "index.json"), "w", encoding="utf-8") as f:
        json.dump(sorted(da), f, separators=(",", ":"))
    return neu, len(da)


# ---------------------------------------------------------------- Hauptablauf
def run(cfg=None):
    from yfinance.data import YfData
    os.makedirs(OUT_DIR, exist_ok=True)
    try:
        with open(os.path.join(ROOT, "web", "data.json"), encoding="utf-8") as f:
            daten = json.load(f)
    except Exception:
        log("keine Scanner-Daten")
        return
    namen = {s["t"]: s.get("n") or s["t"] for s in daten.get("stocks") or [] if s.get("t")}
    try:
        with open(CACHE, encoding="utf-8") as f:
            cache = json.load(f)
    except Exception:
        cache = {}
    try:   # verschlüsselt im Zwischenspeicher – depot.load entschlüsselt mit dem Depot-Schlüssel
        import depot
        prio = [t for t in (depot.load(PRIO, []) or []) if t in namen]
    except Exception:
        prio = []
    reihe = prio + [t for t in namen if t not in set(prio)]

    # 1) Yahoo: die ältesten bzw. fehlenden zuerst (Depot/Merkliste vorne)
    faellig = [t for t in reihe if _alt((cache.get(t) or {}).get("y_stand"), YAHOO_TAGE)]
    yd, n_ok, fehler = YfData(), 0, 0
    for t in faellig[:JE_LAUF]:
        try:
            profil, akt = yahoo(t, yd)
            e = cache.setdefault(t, {})
            e.update({"profil": profil, "aktionaere": akt, "y_stand": NOW.isoformat()})
            n_ok += 1
        except Exception:
            fehler += 1
            (cache.setdefault(t, {}))["y_stand"] = (NOW - timedelta(days=YAHOO_TAGE - 1)).isoformat()   # morgen erneut
            if fehler >= 5:
                break
        time.sleep(0.6)
    # 2) Wikidata: ein Paket pro Lauf
    w_faellig = [t for t in reihe if _alt((cache.get(t) or {}).get("w_stand"), WIKI_TAGE)][:WIKI_JE_LAUF]
    if w_faellig:
        try:
            w = wikidata(w_faellig, namen)
            for t in w_faellig:
                e = cache.setdefault(t, {})
                e["netz"] = w.get(t) or {}
                e["w_stand"] = NOW.isoformat()
        except Exception as ex:
            log("Wikidata nicht erreichbar:", type(ex).__name__)
    # 3) Logos (nur Aktien aus dem öffentlichen Scanner – nie depot-eigene Werte)
    cache = {t: v for t, v in cache.items() if t in namen}
    try:
        n_logo, n_logos = logos(cache, reihe)
    except Exception as ex:
        n_logo, n_logos = 0, 0
        log("Logos nicht möglich:", type(ex).__name__)
    # 4) Schreiben
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    with open(CACHE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, separators=(",", ":"))
    index = {}
    for t, v in cache.items():
        with open(os.path.join(OUT_DIR, datei(t)), "w", encoding="utf-8") as f:
            json.dump({"t": t, **{k: v.get(k) for k in ("profil", "aktionaere", "netz", "y_stand", "w_stand")}},
                      f, ensure_ascii=False, separators=(",", ":"))
        index[t] = {"p": bool(v.get("profil")), "w": bool((v.get("netz") or {}).get("wd"))}
        # Großaktionäre für die Suche „wer hält was“ (nur Namen + Anteil)
        top = [[x["name"], x.get("anteil")] for x in ((v.get("aktionaere") or {}).get("institutionen") or [])[:5]]
        if top:
            index[t]["h"] = top
    with open(os.path.join(OUT_DIR, "index.json"), "w", encoding="utf-8") as f:
        json.dump({"stand": NOW.isoformat(), "aktien": index}, f, ensure_ascii=False, separators=(",", ":"))
    log(f"Yahoo {n_ok} neu, Wikidata {len(w_faellig)} geprüft, Logos {n_logo} geladen ({n_logos} vorhanden), gesamt {len(cache)} von {len(namen)}")


if __name__ == "__main__":
    run()
