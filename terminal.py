"""
Value Finder – Daten fürs Terminal
==================================
Je Aktie aus dem Scanner (öffentliche Firmendaten, keine Depotdaten):
  • Profil: Branche, Mitarbeiter, Sitz, Website, Geschäftsbeschreibung, Vorstand        (Yahoo)
  • Aktionäre: Anteil Insider/Institutionen, größte Fonds und Institutionen, Insider-Bestände (Yahoo)
  • Verflechtungen: Mutter- und Tochterfirmen, Beteiligungen, Großeigentümer, Gründer,
    Chef, Partnerschaften                                                                 (Wikidata, frei nutzbar)
  • Lieferkette: Kunden (wer betreibt ihre Produkte, z. B. Airlines bei Airbus), Lieferanten
    (wer baut Teile wie Triebwerke/Chips), Partner, Produkte, Großeigentümer mit Anteil,
    Sitz/Gründung/Mitarbeiter                                                              (Wikidata)
  • Rechtliche Konzernstruktur: direkte Töchter und oberste Mutter              (GLEIF – offizielles LEI-Register)
Gesammelt wird in Häppchen (ein paar Dutzend Aktien pro Lauf), damit kein Lauf lange dauert:
Yahoo-Daten alle 14 Tage neu, Wikidata alle 30 Tage. Depot und Merkliste kommen zuerst dran.
Ausgabe: web/terminal/<Ticker>.json und web/terminal/index.json (wer was hat).
"""

import json
from urllib.parse import quote
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
LOGO_JE_LAUF = 150
JE_LAUF = 25           # Aktien pro Lauf (Yahoo)
WIKI_JE_LAUF = 60      # Ticker pro Wikidata-Abfrage
NETZ_JE_LAUF = 12      # Lieferkette/Kunden/Eigentümer mit Anteil – aufwendigere Abfragen, daher kleinere Pakete
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


# ---------------------------------------------------------------- Wikidata: Lieferkette, Kunden, Anteile
def _sparql(q, timeout=55):
    import requests
    r = requests.post("https://query.wikidata.org/sparql", data={"query": q},
                      headers={"User-Agent": UA, "Accept": "application/sparql-results+json"}, timeout=timeout)
    r.raise_for_status()
    return [{k: v["value"].rsplit("/", 1)[-1] if v.get("type") == "uri" else v["value"] for k, v in b.items()}
            for b in r.json()["results"]["bindings"]]


def _ok_label(x):
    return x and not re.fullmatch(r"Q\d+", x)


def _rang(zeilen, schluessel, label, n=20):
    """[{firma, x, label, n, bek}] -> {firma: [{name, n}]} – meiste Produkte zuerst, dann die bekanntesten."""
    je = {}
    for z in zeilen:
        if _ok_label(z.get(label)):
            je.setdefault(z["firma"], {})[z[schluessel]] = z
    out = {}
    for f, d in je.items():
        L = sorted(d.values(), key=lambda z: (-int(float(z.get("n") or 0)), -int(float(z.get("bek") or 0))))
        out[f] = [{"q": z[schluessel], "name": z[label], "n": int(float(z.get("n") or 0))} for z in L[:n]]
    return out


def netz_mehr(ids):
    """ids = {Ticker: Q-Nummer}. Liefert {Ticker: {...}} mit Kunden, Lieferanten, Partnern, Produkten,
    Eigentümern/Beteiligungen mit Anteil und Basisdaten. Jede Abfrage einzeln abgesichert."""
    if not ids:
        return {}
    qs = sorted(set(ids.values()))
    F = " ".join("wd:" + q for q in qs)
    erg = {q: {} for q in qs}
    fehler = []

    def versuch(name, fn):
        try:
            fn()
        except Exception as ex:
            fehler.append(f"{name}:{type(ex).__name__}")

    # Basis: LEI, Sitz, Mitarbeiter, Gründung, Branche
    def basis():
        for z in _sparql(f"""SELECT ?firma ?lei ?hqLabel ?ma ?gr ?indLabel WHERE {{ VALUES ?firma {{ {F} }}
            OPTIONAL{{?firma wdt:P1278 ?lei}} OPTIONAL{{?firma wdt:P159 ?hq}} OPTIONAL{{?firma wdt:P1128 ?ma}}
            OPTIONAL{{?firma wdt:P571 ?gr}} OPTIONAL{{?firma wdt:P452 ?ind}}
            SERVICE wikibase:label {{ bd:serviceParam wikibase:language "de,en". }} }}"""):
            e = erg[z["firma"]]
            if z.get("lei"): e["lei"] = z["lei"]
            if _ok_label(z.get("hqLabel")): e["sitz"] = z["hqLabel"]
            if z.get("ma"):
                try: e["mitarbeiter"] = max(e.get("mitarbeiter") or 0, int(float(z["ma"])))
                except ValueError: pass
            if z.get("gr") and not e.get("gegruendet"): e["gegruendet"] = z["gr"][:4].lstrip("+")
            if _ok_label(z.get("indLabel")):
                L = e.setdefault("branchen", [])
                if z["indLabel"] not in L and len(L) < 5: L.append(z["indLabel"])
    versuch("basis", basis)

    # Töchter (für Produkte, die unter einer Tochter laufen – z. B. Airbus SE -> Airbus Commercial Aircraft)
    paare = [(q, q) for q in qs]
    def toechter():
        # beide Richtungen (Tochter nennt Mutter / Mutter nennt Tochter); aktive Töchter nach Bekanntheit sortiert,
        # mit Sitz und bekanntem Zweitnamen (z. B. „Unicredit Bank“ = HypoVereinsbank, München)
        je, info = {}, {}
        for z in _sparql(f"""SELECT DISTINCT ?firma ?h ?hLabel ?alias ?sitzLabel ?sl ?weg ?ende WHERE {{ VALUES ?firma {{ {F} }}
            {{ ?h p:P749 ?st . ?st ps:P749 ?firma . }} UNION {{ ?firma p:P355 ?st . ?st ps:P355 ?h . }}
            OPTIONAL {{ ?st pq:P582 ?ende }} OPTIONAL {{ ?h wdt:P576 ?weg }} OPTIONAL {{ ?h wikibase:sitelinks ?sl }}
            OPTIONAL {{ ?h wdt:P159 ?sitz }} OPTIONAL {{ ?h skos:altLabel ?alias . FILTER(LANG(?alias) IN ("de","en")) }}
            SERVICE wikibase:label {{ bd:serviceParam wikibase:language "de,en". }} }}"""):
            f, h = z["firma"], z["h"]
            if h == f:
                continue
            L = je.setdefault(f, [])
            if h not in L and len(L) < 80:
                L.append(h)
            i = info.setdefault((f, h), {"q": h, "name": z.get("hLabel"), "sl": int(float(z.get("sl") or 0)),
                                         "aktiv": True, "aliase": set(), "sitz": None})
            if z.get("weg") or z.get("ende"):
                i["aktiv"] = False
            if _ok_label(z.get("sitzLabel")):
                i["sitz"] = z["sitzLabel"]
            if z.get("alias"):
                i["aliase"].add(z["alias"])
        for f, L in je.items():
            paare.extend((f, h) for h in L)
        for f in je:
            aktiv = [i for (ff, _), i in info.items() if ff == f and i["aktiv"] and _ok_label(i["name"])]
            aktiv.sort(key=lambda i: -i["sl"])
            out = []
            for i in aktiv[:60]:
                n = i["name"].lower()
                al = sorted((a for a in i["aliase"] if len(a) >= 4 and a.lower() not in n and n not in a.lower()), key=len)
                out.append({"q": i["q"], "name": i["name"], "alias": al[0] if al else None, "sitz": i["sitz"]})
            erg[f]["toechter"] = out
    versuch("toechter", toechter)
    P = " ".join(f"(wd:{f} wd:{h})" for f, h in paare)
    eigene = {}
    for f, h in paare:
        eigene.setdefault(f, set()).add(h)

    def kunden():
        z = _sparql(f"""SELECT ?firma ?x ?xLabel (COUNT(DISTINCT ?prod) AS ?n) (SAMPLE(?sl) AS ?bek) WHERE {{
            VALUES (?firma ?h) {{ {P} }} ?prod wdt:P176 ?h . ?x p:P121 ?st . ?st ps:P121 ?prod .
            FILTER NOT EXISTS {{ ?st pq:P582 ?e }} FILTER NOT EXISTS {{ ?x wdt:P576 ?a }} FILTER NOT EXISTS {{ ?x wdt:P31 wd:Q5 }}
            ?x wikibase:sitelinks ?sl . FILTER(?sl >= 3) ?x rdfs:label ?xLabel . FILTER(LANG(?xLabel)="en") }} GROUP BY ?firma ?x ?xLabel""")
        z = [r for r in z if r["x"] not in eigene.get(r["firma"], set())]
        for f, L in _rang(z, "x", "xLabel").items():
            erg[f]["kunden"] = L
    versuch("kunden", kunden)

    def lieferanten():
        # a) wer baut Teile ihrer Produkte (Triebwerke, Chips …)  b) wessen Produkte betreibt die Firma selbst (z. B. Flotte einer Airline)
        z = _sparql(f"""SELECT ?firma ?x ?xLabel (COUNT(DISTINCT ?prod) AS ?n) (SAMPLE(?sl) AS ?bek) WHERE {{
            VALUES (?firma ?h) {{ {P} }} ?prod wdt:P176 ?h . ?prod wdt:P516|wdt:P527 ?teil . ?teil wdt:P176 ?x .
            ?x wikibase:sitelinks ?sl . ?x rdfs:label ?xLabel . FILTER(LANG(?xLabel)="en") }} GROUP BY ?firma ?x ?xLabel""")
        z += _sparql(f"""SELECT ?firma ?x ?xLabel (COUNT(DISTINCT ?prod) AS ?n) (SAMPLE(?sl) AS ?bek) WHERE {{
            VALUES ?firma {{ {F} }} ?firma p:P121 ?st . ?st ps:P121 ?prod . FILTER NOT EXISTS {{ ?st pq:P582 ?e }} ?prod wdt:P176 ?x .
            ?x wikibase:sitelinks ?sl . ?x rdfs:label ?xLabel . FILTER(LANG(?xLabel)="en") }} GROUP BY ?firma ?x ?xLabel""")
        z = [r for r in z if r["x"] not in eigene.get(r["firma"], set())]
        for f, L in _rang(z, "x", "xLabel").items():
            erg[f]["lieferanten"] = L
    versuch("lieferanten", lieferanten)

    def partner():
        for z in _sparql(f"""SELECT DISTINCT ?firma ?x ?xLabel WHERE {{ VALUES ?firma {{ {F} }}
            {{ ?firma wdt:P2652 ?x }} UNION {{ ?x wdt:P2652 ?firma }}
            SERVICE wikibase:label {{ bd:serviceParam wikibase:language "de,en". }} }}"""):
            if _ok_label(z.get("xLabel")):
                L = erg[z["firma"]].setdefault("partner", [])
                if z["xLabel"] not in L and len(L) < 30: L.append(z["xLabel"])
    versuch("partner", partner)

    def anteile():
        for z in _sparql(f"""SELECT ?firma ?art ?x ?xLabel ?anteil ?zeit WHERE {{ VALUES ?firma {{ {F} }}
            {{ ?firma p:P127 ?st . ?st ps:P127 ?x . BIND("eigentuemer" AS ?art) }} UNION {{ ?firma p:P1830 ?st . ?st ps:P1830 ?x . BIND("beteiligungen" AS ?art) }}
            FILTER NOT EXISTS {{ ?st pq:P582 ?e }} OPTIONAL {{ ?st pq:P1107 ?anteil }} OPTIONAL {{ ?st pq:P585 ?zeit }}
            SERVICE wikibase:label {{ bd:serviceParam wikibase:language "de,en". }} }}"""):
            if not _ok_label(z.get("xLabel")):
                continue
            a = None
            try:
                a = float(z["anteil"]) if z.get("anteil") else None
                if a is not None and a > 1: a = a / 100        # mal als 10,8 statt 0,108 eingetragen
                if a is not None and not (0 < a <= 1): a = None
            except ValueError:
                a = None
            L = erg[z["firma"]].setdefault(z["art"], [])
            alt = next((x for x in L if x["name"] == z["xLabel"]), None)
            if alt:
                if a is not None and (alt.get("anteil") is None or (z.get("zeit") or "") > (alt.get("stand") or "")):
                    alt.update({"anteil": a, "stand": (z.get("zeit") or "")[:10] or None})
            elif len(L) < 30:
                L.append({"q": z["x"], "name": z["xLabel"], "anteil": a, "stand": (z.get("zeit") or "")[:10] or None})
        for e in erg.values():
            for k in ("eigentuemer", "beteiligungen"):
                if e.get(k):
                    e[k].sort(key=lambda x: -(x.get("anteil") or 0))
    versuch("anteile", anteile)

    def produkte():
        z = _sparql(f"""SELECT DISTINCT ?firma ?prod ?prodLabel ?sl WHERE {{
            {{ VALUES (?firma ?h) {{ {P} }} ?prod wdt:P176 ?h . }} UNION {{ VALUES ?firma {{ {F} }} ?firma wdt:P1056 ?prod }}
            ?prod wikibase:sitelinks ?sl . FILTER(?sl > 12)
            SERVICE wikibase:label {{ bd:serviceParam wikibase:language "de,en". }} }}""")
        je = {}
        for r in z:
            if _ok_label(r.get("prodLabel")):
                d = je.setdefault(r["firma"], {})
                d[r["prodLabel"]] = max(d.get(r["prodLabel"], 0), int(float(r.get("sl") or 0)))
        for f, d in je.items():
            erg[f]["produkte"] = [k for k, _ in sorted(d.items(), key=lambda x: -x[1])[:18]]
    versuch("produkte", produkte)

    if fehler:
        log("Wikidata-Lieferkette teilweise nicht erreichbar:", ", ".join(fehler))
    return {t: erg.get(q) or {} for t, q in ids.items()}, fehler


def gleif(lei):
    """Offizielles LEI-Register: rechtliche Töchter (Anzahl + Auswahl) und oberste Mutter."""
    import requests
    out = {}
    basis = f"https://api.gleif.org/api/v1/lei-records/{lei}"
    h = {"User-Agent": UA, "Accept": "application/vnd.api+json"}
    r = requests.get(basis + "/direct-children", params={"page[size]": 40}, headers=h, timeout=20)
    if r.ok:
        j = r.json()
        out["toechter_anzahl"] = ((j.get("meta") or {}).get("pagination") or {}).get("total") or 0
        out["toechter"] = [{"name": ((d.get("attributes") or {}).get("entity") or {}).get("legalName", {}).get("name"),
                            "land": ((d.get("attributes") or {}).get("entity") or {}).get("legalAddress", {}).get("country")}
                           for d in (j.get("data") or [])][:40]
    r = requests.get(basis + "/ultimate-parent", headers=h, timeout=20)
    if r.ok:
        e = (((r.json().get("data") or {}).get("attributes") or {}).get("entity") or {})
        n = (e.get("legalName") or {}).get("name")
        if n:
            out["oberste_mutter"] = {"name": n, "land": (e.get("legalAddress") or {}).get("country")}
    return out


# ---------------------------------------------------------------- Logos
def _domain(web):
    m = re.match(r"^(?:https?://)?(?:www\.)?([^/:?#]+)", (web or "").strip().lower())
    return m.group(1) if m and "." in m.group(1) else None


def _png_breite(b):
    if len(b) > 24 and b[:8] == b"\x89PNG\r\n\x1a\n":
        return int.from_bytes(b[16:20], "big")
    return None


def _hol_png(url, params=None, min_breite=48):
    import requests
    try:
        r = requests.get(url, params=params, timeout=15, headers={"User-Agent": UA})
    except Exception:
        return None, None
    b = r.content
    w = _png_breite(b)
    if r.status_code == 200 and len(b) > 300 and (w is None or w >= min_breite):
        return b, r.status_code
    return None, r.status_code


def logos(cache, reihe):
    """Firmenlogo einmal laden und im Zwischenspeicher behalten.
    1. Wahl: Parqet-Logo-API (echte Markenlogos, 128 px; frei nutzbar mit sichtbarem Link auf parqet.com)
    2. Wahl: Website-Symbol der Firma. Sonst zeigt die App Initialen.
    Die App lädt nur unsere eigene Kopie – kein Dritt-Server sieht, welche Aktien du anschaust."""
    os.makedirs(LOGO_STATE, exist_ok=True)
    neu = 0
    start = time.time()
    for t in reihe:
        if neu >= LOGO_JE_LAUF or time.time() - start > 60:
            break
        e = cache.get(t) or {}
        lg = e.get("logo") or {}
        if lg.get("v") == 2 and not _alt(lg.get("stand"), LOGO_TAGE if lg.get("ok") else 21):
            continue
        dom = _domain((e.get("profil") or {}).get("web"))
        b, art = _hol_png("https://assets.parqet.com/logos/symbol/" + quote(t, safe=""),
                          {"format": "png", "size": 128}, 64)
        art = "p" if b else None
        if not b and dom:
            b, _ = _hol_png("https://www.google.com/s2/favicons", {"domain": dom, "sz": 128}, 48)
            art = "f" if b else None
        if b:
            with open(os.path.join(LOGO_STATE, datei(t).replace(".json", ".png")), "wb") as f:
                f.write(b)
        e["logo"] = {"v": 2, "art": art, "ok": bool(b), "stand": NOW.isoformat()}
        cache[t] = e
        neu += 1
        time.sleep(0.1)
    # alle vorhandenen Logos veröffentlichen
    import shutil
    os.makedirs(LOGO_OUT, exist_ok=True)
    da = {"p": [], "f": []}
    for t, e in cache.items():
        lg = e.get("logo") or {}
        if lg.get("ok"):
            q = os.path.join(LOGO_STATE, datei(t).replace(".json", ".png"))
            if os.path.exists(q):
                shutil.copyfile(q, os.path.join(LOGO_OUT, os.path.basename(q)))
                da["p" if lg.get("art", "f") == "p" else "f"].append(t)
    with open(os.path.join(LOGO_OUT, "index.json"), "w", encoding="utf-8") as f:
        json.dump({k: sorted(v) for k, v in da.items()}, f, separators=(",", ":"))
    return neu, len(da["p"]) + len(da["f"])


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
    # 2b) Lieferkette, Kunden, Anteile (Wikidata) + Konzernstruktur (GLEIF) – kleinere Pakete
    n2 = 0
    # alphabetisch statt Depot zuerst: sonst verriete die Reihenfolge, in der Daten auftauchen, welche Aktien im Depot sind
    n_faellig = [t for t in sorted(namen) if (cache.get(t) or {}).get("netz", {}).get("wd")
                 and (_alt((cache.get(t) or {}).get("n2_stand"), WIKI_TAGE)
                      or ((cache.get(t) or {}).get("netz2") or {}).get("v") != 3)][:NETZ_JE_LAUF]
    if n_faellig:
        start = time.time()
        try:
            m, n_fehler = netz_mehr({t: cache[t]["netz"]["wd"] for t in n_faellig})
            for t in n_faellig:
                e = cache[t]
                e["netz2"] = dict(m.get(t) or {}, v=3)
                lei = e["netz2"].get("lei")
                if lei and time.time() - start < 90:
                    try:
                        e["netz2"]["lei_register"] = gleif(lei)
                    except Exception:
                        pass
                    time.sleep(0.2)
                # Teilweise fehlgeschlagen (z. B. Zeitüberschreitung bei Wikidata): morgen nochmal versuchen
                e["n2_stand"] = (NOW - timedelta(days=WIKI_TAGE - 1)).isoformat() if n_fehler else NOW.isoformat()
                n2 += 1
        except Exception as ex:
            log("Lieferkette nicht möglich:", type(ex).__name__)
    # 3) Logos (nur Aktien aus dem öffentlichen Scanner – nie depot-eigene Werte)
    cache = {t: v for t, v in cache.items() if t in namen}
    try:
        n_logo, n_logos = logos(cache, reihe)
    except Exception as ex:
        n_logo, n_logos = 0, 0
        log("Logos nicht möglich:", type(ex).__name__)
    # 4) Schreiben
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    # alphabetisch speichern: Die Reihenfolge, in der Depot-Werte zuerst geholt werden, soll öffentlich nicht erkennbar sein
    cache = dict(sorted(cache.items()))
    with open(CACHE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, separators=(",", ":"))
    index = {}
    tag = lambda x: str(x)[:10] if x else None   # nur das Datum veröffentlichen (Uhrzeit verriete die Abruf-Reihenfolge)
    for t, v in cache.items():
        with open(os.path.join(OUT_DIR, datei(t)), "w", encoding="utf-8") as f:
            json.dump({"t": t, **{k: v.get(k) for k in ("profil", "aktionaere", "netz", "netz2")},
                       "y_stand": tag(v.get("y_stand")), "w_stand": tag(v.get("w_stand")), "n2_stand": tag(v.get("n2_stand"))},
                      f, ensure_ascii=False, separators=(",", ":"))
        index[t] = {"p": bool(v.get("profil")), "w": bool((v.get("netz") or {}).get("wd"))}
        # Großaktionäre für die Suche „wer hält was“ (nur Namen + Anteil)
        top = [[x["name"], x.get("anteil")] for x in ((v.get("aktionaere") or {}).get("institutionen") or [])[:5]]
        if not top:   # z. B. Airbus: Yahoo kennt keine Aktionäre, Wikidata die Staatsanteile
            top = [[x["name"], x.get("anteil")] for x in ((v.get("netz2") or {}).get("eigentuemer") or []) if x.get("anteil")][:5]
        if top:
            index[t]["h"] = top
        # Kunden/Lieferanten kompakt, damit „Mein Netz“ die Lieferketten nur aus dieser einen Datei rechnen kann
        nz = v.get("netz2") or {}
        for k, feld in (("l", "lieferanten"), ("k", "kunden")):
            L = [[x.get("q"), x.get("name")] for x in (nz.get(feld) or [])[:10] if x.get("name")]
            if L:
                index[t][k] = L
    with open(os.path.join(OUT_DIR, "index.json"), "w", encoding="utf-8") as f:
        json.dump({"stand": NOW.isoformat(), "aktien": index}, f, ensure_ascii=False, separators=(",", ":"))
    log(f"Yahoo {n_ok} neu, Wikidata {len(w_faellig)} geprüft, Lieferkette {n2}, Logos {n_logo} geladen ({n_logos} vorhanden), gesamt {len(cache)} von {len(namen)}")


if __name__ == "__main__":
    run()
