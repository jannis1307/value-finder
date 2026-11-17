"""
Value Finder – Depot & Benachrichtigungen
=========================================
* liest dein verschlüsseltes Depot (depot/portfolio.enc, Schlüssel: GitHub-Secret PORTFOLIO_KEY)
* holt Kurse + Wechselkurse, rechnet alles in Euro um
* schreibt web/depot.enc (verschlüsselt, nur deine Geräte können es lesen)
* schickt Push-Nachrichten (ntfy und/oder Telegram):
    - starke Tagesbewegung einer Depot-Position (mit Grund-Prüfung)
    - ausgelöste Kursalarme
    - morgen Quartalszahlen / Ex-Dividende einer Position
    - Tageszusammenfassung nach US-Börsenschluss
    - auffällige Kursrückgänge ohne Grund im Gesamtmarkt
* schreibt den Marktüberblick (Indizes, Gold, Bitcoin …) in web/data.json
"""

import base64
import json
import math
import os
import time
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.abspath(__file__))
PORTFOLIO_FILE = os.path.join(ROOT, "depot", "portfolio.enc")
DEPOT_OUT = os.path.join(ROOT, "web", "depot.enc")
DATA_FILE = os.path.join(ROOT, "web", "data.json")
STATE_DIR = os.path.join(ROOT, "state")
RESOLVE_FILE = os.path.join(STATE_DIR, "isin.json")
INFO_FILE = os.path.join(STATE_DIR, "depot_info.json")
SENT_FILE = os.path.join(STATE_DIR, "gesendet.json")
EVENTS_FILE = os.path.join(STATE_DIR, "ereignisse.json")
VERLAUF_FILE = os.path.join(STATE_DIR, "depot_verlauf.json")

NOW = datetime.now(timezone.utc)

MARKT = [("^GDAXI", "DAX"), ("^GSPC", "S&P 500"), ("^NDX", "Nasdaq 100"), ("^STOXX50E", "Euro Stoxx 50"),
         ("URTH", "MSCI World"), ("EURUSD=X", "EUR/USD"), ("GC=F", "Gold"), ("BZ=F", "Öl (Brent)"),
         ("BTC-EUR", "Bitcoin")]

INFO_FELDER = ["longName", "shortName", "currency", "quoteType", "sector", "industry", "dividendRate",
               "dividendYield", "yield", "trailingAnnualDividendYield", "earningsTimestamp",
               "earningsTimestampStart", "exDividendDate", "targetMeanPrice", "numberOfAnalystOpinions"]


def log(*a):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] [Depot]", *a, flush=True)


def num(x):
    try:
        f = float(x)
        return None if (math.isnan(f) or math.isinf(f)) else f
    except Exception:
        return None


def load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def save(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(clean(obj), f, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def clean(o):
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, (np.floating, float)):
        f = float(o)
        return None if (math.isnan(f) or math.isinf(f)) else f
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, np.bool_):
        return bool(o)
    return o


def de(x, d=2, vz=False):
    s = f"{x:+,.{d}f}" if vz else f"{x:,.{d}f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def pc(x, d=1):
    return de(x * 100, d, True) + " %"


def eur(x, vz=False):
    return de(x, 0, vz) + " €"


# ================================================================ Verschlüsselung (AES-256-GCM, kompatibel zu WebCrypto)
def b64d(s):
    s = s.strip().replace("-", "+").replace("_", "/")
    return base64.b64decode(s + "=" * (-len(s) % 4))


def b64e(b):
    return base64.b64encode(b).decode()


def schluessel():
    k = os.environ.get("PORTFOLIO_KEY", "").strip()
    return b64d(k) if k else None


def entschluesseln(key, text):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    d = json.loads(text)
    return json.loads(AESGCM(key).decrypt(b64d(d["iv"]), b64d(d["ct"]), None).decode("utf-8"))


def verschluesseln(key, obj):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    iv = os.urandom(12)
    raw = json.dumps(clean(obj), ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    return json.dumps({"v": 1, "iv": b64e(iv), "ct": b64e(AESGCM(key).encrypt(iv, raw, None))})


# ================================================================ Push-Nachrichten
def senden(titel, text, prio=3, tags=None, klick=None):
    """Schickt eine Nachricht an ntfy (NTFY_TOPIC) und/oder Telegram (TELEGRAM_TOKEN + TELEGRAM_CHAT_ID)."""
    import requests
    ok = False
    topic = os.environ.get("NTFY_TOPIC", "").strip()
    if topic:
        server = os.environ.get("NTFY_SERVER", "https://ntfy.sh").rstrip("/")
        body = {"topic": topic, "title": titel, "message": text, "priority": prio, "tags": tags or []}
        if klick:
            body["click"] = klick
        try:
            r = requests.post(server, json=body, timeout=15)
            ok = r.status_code < 300
        except Exception as e:
            log("ntfy-Fehler:", e)
    token, chat = os.environ.get("TELEGRAM_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
    if token and chat:
        msg = f"<b>{titel}</b>\n{text}" + (f"\n\n<a href=\"{klick}\">Öffnen</a>" if klick else "")
        try:
            r = requests.post(f"https://api.telegram.org/bot{token}/sendMessage",
                              data={"chat_id": chat, "text": msg, "parse_mode": "HTML",
                                    "disable_web_page_preview": "true"}, timeout=15)
            ok = ok or r.status_code < 300
        except Exception as e:
            log("Telegram-Fehler:", e)
    time.sleep(0.4)
    return ok


class Postausgang:
    """Merkt sich, was schon geschickt wurde, damit nichts doppelt kommt."""

    def __init__(self):
        self.erstlauf = not os.path.exists(SENT_FILE)
        self.sent = load(SENT_FILE, {})
        grenze = (NOW - timedelta(days=40)).isoformat()
        self.sent = {k: v for k, v in self.sent.items() if v >= grenze}
        self.events = load(EVENTS_FILE, [])
        self.aktiv = bool(os.environ.get("NTFY_TOPIC") or (os.environ.get("TELEGRAM_TOKEN") and os.environ.get("TELEGRAM_CHAT_ID")))
        self.anzahl = 0

    def schon(self, key):
        return key in self.sent

    def raus(self, key, titel, text, prio=3, tags=None, klick=None, art="info", t=None):
        if key in self.sent:
            return
        self.sent[key] = NOW.isoformat()
        self.events.insert(0, {"zeit": NOW.isoformat(), "titel": titel, "text": text, "art": art, "t": t})
        if self.erstlauf:
            return  # beim allerersten Lauf nur merken, nicht alles auf einmal schicken
        if self.aktiv and self.anzahl < 15:
            senden(titel, text, prio, tags, klick)
            self.anzahl += 1

    def speichern(self):
        save(SENT_FILE, self.sent)
        save(EVENTS_FILE, self.events[:80])


# ================================================================ Kurse & Infos
def download(tickers, period="1y"):
    import yfinance as yf
    out = {}
    tickers = [t for t in dict.fromkeys(tickers) if t]
    for i in range(0, len(tickers), 60):
        teil = tickers[i:i + 60]
        try:
            df = yf.download(teil, period=period, interval="1d", auto_adjust=True,
                             group_by="ticker", threads=True, progress=False)
        except Exception as e:
            log("Download-Fehler:", e)
            continue
        if df is None or df.empty:
            continue
        for t in teil:
            try:
                if isinstance(df.columns, pd.MultiIndex):
                    if t in df.columns.get_level_values(0):
                        s = df[t]["Close"]
                    elif t in df.columns.get_level_values(1):
                        s = df["Close"][t]
                    else:
                        continue
                else:
                    s = df["Close"]
                s = pd.to_numeric(s, errors="coerce").dropna()
                if len(s) >= 2:
                    out[t] = s
            except Exception:
                pass
    return out


def isin_aufloesen(isin, cache):
    """Findet zu einer ISIN den Yahoo-Ticker (bevorzugt Xetra/Euro)."""
    if isin in cache:
        return cache[isin]
    import yfinance as yf
    ticker = None
    try:
        quotes = yf.Search(isin, max_results=10).quotes or []
        syms = [q.get("symbol") for q in quotes if q.get("symbol")]
        for pref in (".DE", ".F", ".AS", ".PA", ".MI", ".L", ".SW", ""):
            ticker = next((s for s in syms if (s.endswith(pref) if pref else "." not in s)), None)
            if ticker:
                break
        ticker = ticker or (syms[0] if syms else None)
    except Exception as e:
        log("ISIN-Suche fehlgeschlagen:", isin, e)
    cache[isin] = ticker
    time.sleep(0.3)
    return ticker


def infos(tickers, fund):
    """Kennzahlen für Depot-Werte (aus dem Scanner oder eigene Abfrage, 1x pro Tag)."""
    import yfinance as yf
    cache = load(INFO_FILE, {})
    for t in tickers:
        e = cache.get(t)
        if e and e.get("_stand") and NOW - datetime.fromisoformat(e["_stand"]) < timedelta(hours=20):
            continue
        try:
            info = yf.Ticker(t).info or {}
            cache[t] = {k: info.get(k) for k in INFO_FELDER}
            cache[t]["_stand"] = NOW.isoformat()
        except Exception as ex:
            log("Info-Fehler", t, ex)
        time.sleep(0.2)
    save(INFO_FILE, cache)
    return cache


def fx_reihen(waehrungen):
    """Wechselkurse: wie viele Einheiten Fremdwährung bekommt man für 1 Euro (Zeitreihe)."""
    paare = {}
    for c in waehrungen:
        c2 = "GBP" if c in ("GBp", "GBX") else c
        if c2 and c2 != "EUR":
            paare[c] = f"EUR{c2}=X"
    serien = download(list(paare.values()))
    out = {}
    for c, t in paare.items():
        s = serien.get(t)
        if s is None:
            continue
        s = s.copy()
        if c in ("GBp", "GBX"):
            s = s * 100
        out[c] = s
    return out


def zu_eur(serie, cur, fx):
    if not cur or cur == "EUR":
        return serie
    f = fx.get(cur)
    if f is None:
        return None
    idx = serie.index.tz_localize(None) if getattr(serie.index, "tz", None) is not None else serie.index
    s = pd.Series(serie.values, index=pd.DatetimeIndex(idx).normalize())
    fi = f.index.tz_localize(None) if getattr(f.index, "tz", None) is not None else f.index
    f = pd.Series(f.values, index=pd.DatetimeIndex(fi).normalize())
    f = f[~f.index.duplicated()].reindex(s.index.union(f.index)).ffill().bfill().reindex(s.index)
    return s / f


def ret(s, n):
    return float(s.iloc[-1] / s.iloc[-1 - n] - 1) if s is not None and len(s) > n else None


# ================================================================ Marktüberblick
def marktueberblick():
    serien = download([t for t, _ in MARKT])
    out = []
    for t, name in MARKT:
        s = serien.get(t)
        if s is None or len(s) < 3:
            continue
        woch = s.resample("W").last().dropna().iloc[-52:]
        out.append({"t": t, "n": name, "p": round(float(s.iloc[-1]), 4), "r1d": ret(s, 1), "r1m": ret(s, 21),
                    "r1y": float(s.iloc[-1] / s.iloc[0] - 1), "spark": [round(float(x), 4) for x in woch.values]})
    return out


# ================================================================ Hauptfunktion
def run(df, closes, fund, neue_markt_alarme, cfg, news_fn, site_url=""):
    from scanner import SEKTOR_DE, markt_von
    post = Postausgang()
    dcfg = cfg.get("depot", {})
    klick = (site_url.rstrip("/") + "/") if site_url else None

    # Marktüberblick in data.json ergänzen
    try:
        daten = load(DATA_FILE, None)
        if daten is not None:
            daten["markt"] = marktueberblick()
            save(DATA_FILE, daten)
    except Exception as e:
        log("Marktüberblick-Fehler:", e)

    # Gesamtmarkt-Alarme (ohne Grund)
    if dcfg.get("markt_alarme", True):
        for a in [x for x in neue_markt_alarme if x["typ"] == "ohne_grund"][: dcfg.get("max_markt_alarme", 3)]:
            bew = pc(a["r1d"]) + " heute" if a["art"] == "1d" else pc(a["r5d"]) + " in 5 Tagen"
            post.raus(f"markt|{a['id']}", f"⚠️ {a['n']} {bew}",
                      f"Kein erkennbarer Grund gefunden. {de(abs(a['rel'])*100, 1)} Pp. schlechter als die Branche."
                      + (f" Chancen-Score {a['score']:.0f}." if a.get("score") is not None else ""),
                      prio=3, tags=["chart_with_downwards_trend"], klick=(klick + "#alarme") if klick else None,
                      art="markt", t=a["t"])

    key = schluessel()
    if not key or not os.path.exists(PORTFOLIO_FILE):
        log("Kein Depot hinterlegt (PORTFOLIO_KEY oder depot/portfolio.enc fehlt).")
        post.speichern()
        return
    try:
        with open(PORTFOLIO_FILE, encoding="utf-8") as f:
            pf = entschluesseln(key, f.read())
    except Exception as e:
        log("Depot konnte nicht entschlüsselt werden:", e)
        post.speichern()
        return

    eins = {"tag_minus": -5, "tag_plus": 8, "zusammenfassung": True, "termine": True}
    eins.update(pf.get("einstellungen") or {})
    positionen = pf.get("positionen") or []
    alarme = pf.get("alarme") or []

    # Ticker auflösen
    rcache = load(RESOLVE_FILE, {})
    for p in positionen:
        if not p.get("t") and p.get("isin") and p.get("manuell") is None:
            p["t"] = isin_aufloesen(p["isin"].strip().upper(), rcache)
    save(RESOLVE_FILE, rcache)

    tickers = sorted({p["t"] for p in positionen if p.get("t") and p.get("manuell") is None} |
                     {a["t"] for a in alarme if a.get("t")})
    fehlend = [t for t in tickers if t not in closes]
    serien = dict(closes)
    serien.update(download(fehlend))
    info = infos([t for t in tickers if t not in fund], fund)

    def i_(t, k):
        f = fund.get(t) or {}
        m = {"currency": "waehrung", "longName": "name", "sector": "sektor", "dividendYield": "div_rendite",
             "earningsTimestampStart": "zahlen_ts_start", "earningsTimestamp": "zahlen_ts",
             "exDividendDate": "ex_div_ts", "targetMeanPrice": "kursziel"}
        if k in m and f.get(m[k]) is not None:
            return f.get(m[k])
        return (info.get(t) or {}).get(k)

    cur_of = {t: (i_(t, "currency") or ("EUR" if t.endswith(".DE") else "USD")) for t in tickers}
    fx = fx_reihen(set(cur_of.values()))
    fx_jetzt = {c: float(s.iloc[-1]) for c, s in fx.items()}

    scores = {}
    if df is not None and not df.empty:
        scores = {r["t"]: r for r in df[["t", "score", "s", "i", "r1d"]].to_dict("records")}

    # Kein Börsenkurs gefunden, aber ein bekannter Wert vorhanden -> wie manuelle Position zeigen
    for p in positionen:
        if p.get("manuell") is None and serien.get(p.get("t")) is None and num(p.get("wert_fallback")) is not None:
            p["manuell"] = num(p.get("wert_fallback"))
            p["typ"] = p.get("typ") or "Ohne Kurs"
            p["_ohne_kurs"] = True

    zeilen, kurven = [], []
    summe = {"wert": 0.0, "gestern": 0.0, "einstand": 0.0, "div_jahr": 0.0}
    for p in positionen:
        stk = num(p.get("stk")) or 0.0
        ek = num(p.get("ek"))
        z = {"id": p.get("id"), "name": p.get("name") or p.get("t") or p.get("isin"), "t": p.get("t"),
             "isin": p.get("isin"), "broker": p.get("broker"), "stk": stk, "ek": ek, "typ": p.get("typ")}
        if p.get("manuell") is not None:
            w = num(p.get("manuell")) or 0.0
            if p.get("_ohne_kurs"):
                z["fehler"] = "Kein Börsenkurs gefunden – letzter bekannter Wert"
            z.update({"wert": w, "wert_gestern": w, "sektor": p.get("typ") or "Sonstiges", "manuell": True,
                      "einstand": (ek * stk) if (ek and stk) else num(p.get("einstand"))})
        else:
            t = p.get("t")
            s = serien.get(t)
            if s is None:
                z.update({"fehler": "Keine Kurse gefunden – Ticker/ISIN prüfen", "wert": 0.0, "wert_gestern": 0.0})
                zeilen.append(z)
                continue
            cur = cur_of.get(t, "USD")
            se = zu_eur(s, cur, fx)
            if se is None or se.dropna().empty:
                se = s
            se = se.dropna()
            preis_eur = float(se.iloc[-1])
            gestern_eur = float(se.iloc[-2]) if len(se) > 1 else preis_eur
            qt = (i_(t, "quoteType") or "").upper()
            sek = (scores.get(t) or {}).get("s") or ({"ETF": "ETF / Fonds", "MUTUALFUND": "ETF / Fonds",
                                                       "CRYPTOCURRENCY": "Krypto"}.get(qt) or i_(t, "sector") or "Sonstiges")
            sek = SEKTOR_DE.get(sek, sek)
            # Dividende pro Jahr (geschätzt) in Euro
            rate = num(i_(t, "dividendRate"))
            dy = num(i_(t, "dividendYield")) or num(i_(t, "yield")) or num(i_(t, "trailingAnnualDividendYield"))
            if dy and dy > 0.3:
                dy = dy / 100
            if rate and rate > 0:
                fxn = fx_jetzt.get(cur, 1.0) if cur != "EUR" else 1.0
                div = stk * rate / fxn * (0.01 if cur in ("GBp", "GBX") else 1)
            elif dy:
                div = stk * preis_eur * dy
            else:
                div = 0.0
            er = [num(i_(t, "earningsTimestampStart")), num(i_(t, "earningsTimestamp"))]
            er = min([x for x in er if x and x > NOW.timestamp() - 86400] or [None], key=lambda x: x or 9e12)
            z.update({
                "cur": cur, "p": float(s.iloc[-1]), "p_eur": preis_eur, "wert": stk * preis_eur,
                "wert_gestern": stk * gestern_eur, "r1d": ret(s, 1), "r1d_eur": gestern_eur and preis_eur / gestern_eur - 1,
                "r1y": float(s.iloc[-1] / s.iloc[0] - 1), "sektor": sek, "land": markt_von(t) if qt not in ("ETF", "MUTUALFUND", "CRYPTOCURRENCY") else "–",
                "div_jahr": div, "score": (scores.get(t) or {}).get("score"), "im_scan": t in scores,
                "er": er, "exd": num(i_(t, "exDividendDate")), "ziel": num(i_(t, "targetMeanPrice")),
                "datum": s.index[-1].strftime("%Y-%m-%d"), "art": qt or "EQUITY",
                "einstand": (ek * stk) if ek else None,
            })
            woch = se.resample("W").last().dropna().iloc[-53:] * stk
            kurven.append(woch)
        z["gv"] = (z["wert"] - z["einstand"]) if z.get("einstand") else None
        z["gv_pct"] = (z["gv"] / z["einstand"]) if z.get("einstand") else None
        summe["wert"] += z["wert"]
        summe["gestern"] += z.get("wert_gestern") or z["wert"]
        summe["div_jahr"] += z.get("div_jahr") or 0.0
        if z.get("einstand"):
            summe["einstand"] += z["einstand"]
        zeilen.append(z)

    gesamt = summe["wert"] or 1.0
    for z in zeilen:
        z["anteil"] = z["wert"] / gesamt
    mit_einstand = [z for z in zeilen if z.get("einstand")]
    summe["gv"] = sum(z["wert"] - z["einstand"] for z in mit_einstand) if mit_einstand else None
    summe["gv_pct"] = (summe["gv"] / summe["einstand"]) if summe["einstand"] else None
    summe["heute"] = summe["wert"] - summe["gestern"]
    summe["heute_pct"] = (summe["heute"] / summe["gestern"]) if summe["gestern"] else None

    # Verlauf: so hätte sich das heutige Depot im letzten Jahr entwickelt (+ manuelle Werte konstant)
    verlauf = []
    if kurven:
        k = pd.concat(kurven, axis=1).ffill().fillna(0).sum(axis=1)
        manuell = sum(z["wert"] for z in zeilen if z.get("manuell"))
        daten = [d.strftime("%Y-%m-%d") for d in k.index]
        daten[-1] = NOW.strftime("%Y-%m-%d")  # letzte Woche = heute
        verlauf = [[d, round(float(v + manuell), 2)] for d, v in zip(daten, k.values)]
    # Echter Verlauf ab jetzt (tägliche Schnappschüsse)
    echt = load(VERLAUF_FILE, {})
    echt[NOW.strftime("%Y-%m-%d")] = round(summe["wert"], 2)
    echt = dict(sorted(echt.items())[-800:])
    save(VERLAUF_FILE, echt)

    def verteilung(feld):
        d = {}
        for z in zeilen:
            k = z.get(feld) or "Sonstiges"
            d[k] = d.get(k, 0.0) + z["wert"]
        return sorted(([k, v, v / gesamt] for k, v in d.items()), key=lambda x: -x[1])

    # ---------- Ereignisse / Push
    for z in zeilen:
        if z.get("manuell") or z.get("r1d") is None:
            continue
        t = z["t"]
        if z["r1d"] <= eins["tag_minus"] / 100 or z["r1d"] >= eins["tag_plus"] / 100:
            k = f"bew|{t}|{z['datum']}|{'m' if z['r1d'] < 0 else 'p'}"
            if not post.schon(k):
                grund = ""
                try:
                    news = news_fn(t, 36)
                    grund = ("News: " + news[0]["titel"]) if news else "Keine News gefunden."
                except Exception:
                    pass
                if z.get("er") and abs(z["er"] - NOW.timestamp()) < 2 * 86400:
                    grund = "Quartalszahlen. " + grund
                post.raus(k, f"{'📉' if z['r1d'] < 0 else '📈'} {z['name']} {pc(z['r1d'])}",
                          f"Deine Position: {eur(z['wert'] - z['wert_gestern'], True)} heute, Wert {eur(z['wert'])}. {grund}",
                          prio=4 if z["r1d"] < 0 else 3, tags=["moneybag"], klick=(klick + "#depot") if klick else None,
                          art="bewegung", t=t)
        if eins.get("termine", True) and NOW.hour >= 5:
            for feld, text in (("er", "Quartalszahlen"), ("exd", "Ex-Dividende")):
                ts = z.get(feld)
                if ts and 0 <= ts - NOW.timestamp() <= 36 * 3600:
                    tag = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%d.%m.")
                    post.raus(f"termin|{feld}|{t}|{tag}", f"📅 {text}: {z['name']} am {tag}",
                              f"Position im Depot: {eur(z['wert'])} ({de(z['anteil']*100, 1)} % vom Depot).",
                              prio=2, tags=["calendar"], klick=(klick + "#termine") if klick else None, art="termin", t=t)

    ausgeloest = []
    for a in alarme:
        t, preis = a.get("t"), num(a.get("preis"))
        s = serien.get(t)
        if not t or preis is None or s is None:
            continue
        p = float(s.iloc[-1])
        hit = (a.get("art") == "unter" and p <= preis) or (a.get("art") == "ueber" and p >= preis)
        if hit:
            ausgeloest.append(a.get("id"))
            cur = cur_of.get(t) or i_(t, "currency") or ""
            post.raus(f"alarm|{a.get('id')}|{preis}", f"🔔 Kursalarm: {a.get('name') or t}",
                      f"Kurs {de(p)} {cur} ist {'unter' if a.get('art') == 'unter' else 'über'} deiner Marke {de(preis)} {cur}.",
                      prio=4, tags=["bell"], klick=(klick + "#depot") if klick else None, art="alarm", t=t)

    heute = NOW.strftime("%Y-%m-%d")
    if eins.get("zusammenfassung", True) and NOW.hour >= 21 and NOW.weekday() < 5 and summe["heute_pct"] is not None:
        bew = [z for z in zeilen if z.get("r1d_eur") is not None and not z.get("manuell")]
        top = max(bew, key=lambda z: z["r1d_eur"]) if bew else None
        flop = min(bew, key=lambda z: z["r1d_eur"]) if bew else None
        text = f"Wert {eur(summe['wert'])}"
        if summe.get("gv") is not None:
            text += f" · gesamt {eur(summe['gv'], True)} ({pc(summe['gv_pct'])})"
        if top and flop:
            text += f"\nTop: {top['name']} {pc(top['r1d_eur'])} · Flop: {flop['name']} {pc(flop['r1d_eur'])}"
        post.raus(f"tag|{heute}", f"📊 Depot heute {pc(summe['heute_pct'])} ({eur(summe['heute'], True)})", text,
                  prio=2, tags=["bar_chart"], klick=(klick + "#depot") if klick else None, art="zusammenfassung")

    post.speichern()
    ausgabe = {
        "stand": NOW.isoformat(), "summe": summe, "positionen": zeilen, "verlauf": verlauf,
        "verlauf_echt": [[k, v] for k, v in echt.items()],
        "verteilung": {"Branche": verteilung("sektor"), "Land": verteilung("land"), "Währung": verteilung("cur")},
        "fx": fx_jetzt, "alarme_ausgeloest": ausgeloest, "ereignisse": post.events[:40],
        "push_aktiv": post.aktiv,
    }
    with open(DEPOT_OUT, "w", encoding="utf-8") as f:
        f.write(verschluesseln(key, ausgabe))
    log(f"Depot: {len(zeilen)} Positionen, Wert {eur(summe['wert'])}, {post.anzahl} Nachrichten gesendet"
        + (" (Erstlauf: nur gemerkt)" if post.erstlauf else ""))
