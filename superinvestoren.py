"""
Value Finder – Superinvestoren-Radar
====================================
Was haben bekannte Langfrist-Investoren im letzten Quartal gekauft, aufgestockt, reduziert oder verkauft?
Quelle: Pflichtmeldungen 13F an die US-Börsenaufsicht SEC (öffentlich, frei nutzbar). Gemeldet werden nur
US-Aktien, 45 Tage nach Quartalsende – das ist also immer ein Blick zurück, kein Echtzeit-Signal.

Einmal am Tag wird geprüft, ob ein Fonds eine neue Meldung abgegeben hat; nur dann wird sie geladen.
Ausgabe: web/terminal/guru.json (keine Depotdaten – nur öffentliche SEC-Meldungen).
"""

import json
import os
import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(ROOT, "state", "guru.json")
OUT = os.path.join(ROOT, "web", "terminal", "guru.json")
NOW = datetime.now(timezone.utc)

# Langfrist- und Qualitätsinvestoren (CIK = Nummer bei der SEC, Namensprüfung schützt vor Verwechslung)
FONDS = [
    ("brk", 1067983, "Berkshire Hathaway", "Warren Buffett", "BERKSHIRE"),
    ("fundsmith", 1569205, "Fundsmith", "Terry Smith", "FUNDSMITH"),
    ("akre", 1112520, "Akre Capital", "Chuck Akre", "AKRE"),
    ("markel", 1096343, "Markel Group", "Tom Gayner", "MARKEL"),
    ("gates", 1166559, "Gates Foundation Trust", "Bill & Melinda Gates Stiftung", "GATES"),
    ("pershing", 1336528, "Pershing Square", "Bill Ackman", "PERSHING"),
    ("himalaya", 1709323, "Himalaya Capital", "Li Lu", "HIMALAYA"),
    ("baupost", 1061768, "Baupost Group", "Seth Klarman", "BAUPOST"),
    ("polen", 1034524, "Polen Capital", "Polen Focus Growth", "POLEN"),
    ("giverny", 1641864, "Giverny Capital", "François Rochon", "GIVERNY"),
    ("lindsell", 1484150, "Lindsell Train", "Nick Train", "LINDSELL"),
    ("russo", 860643, "Gardner Russo & Quinn", "Tom Russo", "RUSSO"),
    ("djco", 783412, "Daily Journal", "Charlie Mungers frühere Firma", "DAILY JOURNAL"),
]
POS_MAX = 40          # so viele Positionen je Fonds veröffentlichen (die größten + alle neuen)
SCHWELLE = 0.05       # ab ±5 % Stückzahl gilt eine Position als aufgestockt/reduziert

STOP = {"INC", "INCORPORATED", "CORP", "CORPORATION", "CO", "COMPANY", "COS", "LTD", "LIMITED", "PLC", "NV", "N", "V",
        "SA", "AG", "SE", "LP", "LLC", "HLDGS", "HLDG", "HOLDINGS", "HOLDING", "GROUP", "GRP", "DEL", "NEW", "THE",
        "OF", "CL", "CLASS", "A", "B", "C", "COM", "ORD", "SHS", "ADR", "SPONSORED", "SPON", "DE", "MD", "NY", "NJ",
        "PA", "TX", "VA", "NV", "OH", "MN", "WA", "MA", "CA", "IL", "FL", "AND", "LTEE", "AB", "ASA", "OYJ", "SPA", "BHD"}
ABK = {"INTL": "INTERNATIONAL", "FINL": "FINANCIAL", "SVCS": "SERVICES", "SVC": "SERVICE", "PETE": "PETROLEUM",
       "MTRS": "MOTORS", "CHEM": "CHEMICAL", "SYS": "SYSTEMS", "ENTMT": "ENTERTAINMENT", "NATL": "NATIONAL",
       "COMMUNICATIONS": "COMMUNICATIONS", "TECHNOLOGIES": "TECHNOLOGIES", "PPTYS": "PROPERTIES", "MGMT": "MANAGEMENT",
       "INDS": "INDUSTRIES", "LABS": "LABORATORIES", "PHARMACEUTICALS": "PHARMACEUTICALS", "BANCORPORATION": "BANCORP",
       "ELEC": "ELECTRIC", "HOTELS": "HOTELS", "RES": "RESOURCES", "MFG": "MANUFACTURING", "INVT": "INVESTMENT"}


def log(*a):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] [Superinvestoren]", *a, flush=True)


def _load(p, d):
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return d


def _save(p, o):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(o, f, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    os.replace(tmp, p)


def woerter(name):
    s = re.sub(r"/[A-Z]{2,3}/?", " ", str(name or "").upper()).replace("&", " AND ")
    s = re.sub(r"[^A-Z0-9]+", " ", s.replace("'", ""))
    return [ABK.get(w, w) for w in s.split() if w not in STOP]


def _passt(a, b):
    """13F-Kurzname a gegen SEC-Firmenname b: gleiche Wortzahl, jedes Wort Anfang des anderen."""
    return len(a) == len(b) and all(x.startswith(y) or y.startswith(x) for x, y in zip(b, a))


class Sec:
    def __init__(self, requests):
        import fundamental
        self.r = requests
        self.ua = (_load(fundamental.CIK_FILE, {}) or {}).get("ua") or fundamental.UAS[0]
        self.letzt = 0.0

    def get(self, url, json_=True):
        warte = 0.15 - (time.time() - self.letzt)   # SEC erlaubt 10 Anfragen/Sekunde
        if warte > 0:
            time.sleep(warte)
        self.letzt = time.time()
        r = self.r.get(url, headers={"User-Agent": self.ua, "Accept-Encoding": "gzip, deflate"}, timeout=40)
        if r.status_code != 200:
            raise RuntimeError(f"HTTP {r.status_code}")
        return r.json() if json_ else r.text


def _tabelle(text):
    """Informationstabelle aus der kompletten Einreichung (.txt) lesen -> {schluessel: {...}}"""
    m = re.search(r"<(?:\w+:)?informationTable[\s\S]*?</(?:\w+:)?informationTable>", text)
    if not m:
        raise RuntimeError("keine Informationstabelle")
    x = re.sub(r"""\s[\w:]+=("[^"]*"|'[^']*')""", "", m.group(0))   # Attribute (Namensräume, Schema) entfernen
    root = ET.fromstring(re.sub(r"(</?)\w+:", r"\1", x))
    pos = {}
    for it in root.iter("infoTable"):
        g = lambda k: (it.findtext(k) or "").strip()
        if g("putCall"):               # Optionen auslassen – nur echte Aktienbestände
            continue
        sh = it.find("shrsOrPrnAmt")
        if sh is not None and (sh.findtext("sshPrnamtType") or "SH").strip() != "SH":
            continue
        try:
            wert = float(g("value") or 0)
            stk = float((sh.findtext("sshPrnamt") if sh is not None else 0) or 0)
        except ValueError:
            continue
        cusip = g("cusip").upper()
        e = pos.setdefault(cusip, {"name": g("nameOfIssuer"), "klasse": g("titleOfClass"), "wert": 0.0, "stk": 0.0})
        e["wert"] += wert
        e["stk"] += stk
    return pos


def _meldungen(sec, cik):
    """Die letzten beiden 13F-HR (verschiedene Quartale) -> [(accession, quartal, eingereicht)], Name"""
    j = sec.get(f"https://data.sec.gov/submissions/CIK{cik:010d}.json")
    r = (j.get("filings") or {}).get("recent") or {}
    L, gesehen = [], set()
    for form, acc, fd, rd in zip(r.get("form", []), r.get("accessionNumber", []), r.get("filingDate", []), r.get("reportDate", [])):
        if form != "13F-HR" or not rd or rd in gesehen:
            continue
        gesehen.add(rd)
        L.append((acc, rd, fd))
        if len(L) == 2:
            break
    return L, j.get("name") or ""


def _sec_titel(sec, st):
    c = st.get("titel") or {}
    if c.get("stand") and NOW - datetime.fromisoformat(c["stand"]) < timedelta(days=14):
        return c["L"]
    j = sec.get("https://www.sec.gov/files/company_tickers.json")
    L = [[v["ticker"].upper(), int(v["cik_str"]), v["title"]] for v in j.values()]
    st["titel"] = {"stand": NOW.isoformat(), "L": L}
    return L


def _zuordnen(st, sec, requests, universum):
    """CUSIP -> Ticker: erst über den Firmennamen (SEC-Liste), Rest über OpenFIGI (frei, ohne Schlüssel)."""
    cmap = st.setdefault("cusip", {})
    offen = {}
    for f in (st.get("fonds") or {}).values():
        for m in f.get("meldungen") or []:
            for cu, p in m["pos"].items():
                if cu not in cmap or (cmap[cu] is None and cu not in offen):
                    offen[cu] = p["name"]
    if not offen:
        return
    try:
        titel = _sec_titel(sec, st)
    except Exception as e:
        log("SEC-Firmenliste nicht geladen:", e)
        titel = []
    nach_wort = {}
    for tk, cik, ti in titel:
        w = woerter(ti)
        if w:
            nach_wort.setdefault(w[0][:4], []).append((tk, cik, w))
    figi = []
    for cu, name in offen.items():
        w = woerter(name)
        kand = [k for k in nach_wort.get(w[0][:4], []) if _passt(w, k[2])] if w else []
        ciks = {k[1] for k in kand}
        if len(ciks) == 1:
            tks = [k[0] for k in kand]
            bevorzugt = [t for t in tks if t in universum]
            cmap[cu] = {"t": (bevorzugt or tks)[0], "cik": kand[0][1]}
        elif cmap.get(cu) is None and not (st.get("figi_fehl") or {}).get(cu):
            figi.append(cu)
    # OpenFIGI: ohne Schlüssel 25 Anfragen/Minute, 10 Wertpapiere je Anfrage
    fehl = st.setdefault("figi_fehl", {})
    for i in range(0, min(len(figi), 200), 10):
        teil = figi[i:i + 10]
        try:
            r = requests.post("https://api.openfigi.com/v3/mapping", timeout=30,
                              json=[{"idType": "ID_CUSIP", "idValue": c, "exchCode": "US"} for c in teil])
            if r.status_code == 429:
                break
            for c, z in zip(teil, r.json()):
                d = (z.get("data") or [{}])[0]
                if d.get("ticker"):
                    cmap[c] = {"t": d["ticker"].replace("/", "-").upper(), "cik": None}
                else:
                    fehl[c] = NOW.date().isoformat()
        except Exception as e:
            log("OpenFIGI-Fehler:", e)
            break
        time.sleep(2.6)
    for cu in offen:
        cmap.setdefault(cu, None)


def _ausgabe(st, namen):
    cmap = st.get("cusip") or {}
    fonds = []
    for fid, cik, name, wer, _ in FONDS:
        f = (st.get("fonds") or {}).get(fid)
        if not f or not f.get("meldungen"):
            continue
        jetzt = f["meldungen"][0]
        vorher = f["meldungen"][1]["pos"] if len(f["meldungen"]) > 1 else None

        def firmen(pos):
            o = {}
            for cu, p in pos.items():
                z = cmap.get(cu) or {}
                key = z.get("t") or ("?" + " ".join(woerter(p["name"])))
                e = o.setdefault(key, {"t": z.get("t"), "n": p["name"], "wert": 0.0, "stk": 0.0})
                e["wert"] += p["wert"]
                e["stk"] += p["stk"]
            return o
        A = firmen(jetzt["pos"])
        V = firmen(vorher) if vorher is not None else None
        summe = sum(x["wert"] for x in A.values()) or 1.0
        L = []
        for k, x in A.items():
            if V is None:
                art, d = None, None
            elif k not in V or V[k]["stk"] <= 0:
                art, d = "neu", None
            else:
                d = x["stk"] / V[k]["stk"] - 1
                art = "plus" if d > SCHWELLE else "minus" if d < -SCHWELLE else "="
            L.append({"t": x["t"], "n": namen.get(x["t"]) or x["n"].title(), "w": round(x["wert"] / summe, 5),
                      "v": round(x["wert"]), "a": art, "d": round(d, 4) if d is not None else None})
        L.sort(key=lambda x: -x["w"])
        zeigen = L[:POS_MAX] + [x for x in L[POS_MAX:] if x["a"] == "neu"]
        raus = []
        if V is not None:
            vsum = sum(x["wert"] for x in V.values()) or 1.0
            raus = sorted(({"t": x["t"], "n": namen.get(x["t"]) or x["n"].title(), "w_alt": round(x["wert"] / vsum, 5)}
                           for k, x in V.items() if k not in A), key=lambda x: -x["w_alt"])[:25]
        fonds.append({"id": fid, "name": name, "wer": wer, "quartal": jetzt["quartal"], "eingereicht": jetzt["eingereicht"],
                      "vorquartal": f["meldungen"][1]["quartal"] if vorher is not None else None,
                      "wert": round(summe), "n": len(A), "pos": zeigen, "raus": raus})
    return {"stand": st.get("stand"), "fonds": fonds}


def run(cfg=None):
    import requests
    st = _load(STATE, {})
    try:
        with open(os.path.join(ROOT, "web", "data.json"), encoding="utf-8") as f:
            daten = json.load(f)
        namen = {s["t"]: s.get("n") or s["t"] for s in daten.get("stocks") or [] if s.get("t")}
    except Exception:
        namen = {}
    faellig = not st.get("geprueft") or NOW - datetime.fromisoformat(st["geprueft"]) > timedelta(hours=20)
    if faellig:
        sec = Sec(requests)
        F = st.setdefault("fonds", {})
        neu = fehler = 0
        t0 = time.time()
        abgebrochen = False
        for fid, cik, name, wer, pruef in FONDS:
            if time.time() - t0 > 90:     # Rest im nächsten Lauf
                abgebrochen = True
                break
            try:
                L, sec_name = _meldungen(sec, cik)
                if pruef not in sec_name.upper():
                    log(f"{name}: SEC-Name passt nicht ({sec_name}) – übersprungen")
                    continue
                alt = {m["acc"]: m for m in (F.get(fid) or {}).get("meldungen") or []}
                M = []
                for acc, quartal, eingereicht in L:
                    if acc in alt:
                        M.append(alt[acc])
                        continue
                    txt = sec.get(f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc.replace('-', '')}/{acc}.txt", json_=False)
                    M.append({"acc": acc, "quartal": quartal, "eingereicht": eingereicht, "pos": _tabelle(txt)})
                    neu += 1
                if M:
                    F[fid] = {"meldungen": M}
            except Exception as e:
                fehler += 1
                log(f"{name}: {e}")
        try:
            _zuordnen(st, sec, requests, set(namen))
        except Exception as e:
            log("Zuordnung fehlgeschlagen:", e)
        if not abgebrochen:
            st["geprueft"] = NOW.isoformat()
        if neu or not st.get("stand"):
            st["stand"] = NOW.isoformat()
        log(f"{len(F)} Fonds, {neu} neue Meldungen geladen, {fehler} Fehler")
        _save(STATE, st)
    if st.get("fonds"):
        _save(OUT, _ausgabe(st, namen))
