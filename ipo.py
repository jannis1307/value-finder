"""
Value Finder – IPO-Kalender
===========================
Holt den öffentlichen IPO-Kalender von Nasdaq (anstehende Börsengänge, frisch gepreiste, neu angemeldete)
und schreibt ihn nach web/ipos.json. Für frisch gelistete Aktien kommt der aktuelle Kurs dazu.
Keine Depotdaten: deine Zeichnungen stehen nur verschlüsselt in depot/portfolio.enc und werden in der App gerechnet.
"""

import json
import os
import re
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "web", "ipos.json")
CACHE = os.path.join(ROOT, "state", "ipos.json")   # letzter guter Stand (web/ wird bei jedem Lauf neu aufgebaut)
NOW = datetime.now(timezone.utc)
KOPF = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
        "Accept": "application/json, text/plain, */*", "Origin": "https://www.nasdaq.com", "Referer": "https://www.nasdaq.com/"}

# Große Namen ohne eingereichten Börsenprospekt (Stand November 2026, laut Presseberichten) – in config.json änderbar
KANDIDATEN = [
    {"name": "OpenAI", "hinweis": "Börsengang laut Berichten eher 2027"},
    {"name": "Databricks", "hinweis": "Börsengang laut Berichten eher 2027"},
    {"name": "Kraken", "hinweis": "hatte Pläne im März 2026 auf Eis gelegt"},
    {"name": "Plaid", "hinweis": "Börsengang laut Berichten eher 2027"},
    {"name": "Monzo", "hinweis": "Börsengang laut Berichten eher 2027"},
]


def log(*a):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] [IPO]", *a, flush=True)


def _zahl(x):
    try:
        return float(re.sub(r"[^0-9.]", "", str(x))) if x not in (None, "") else None
    except ValueError:
        return None


def _datum(s):
    try:
        return datetime.strptime(str(s), "%m/%d/%Y").strftime("%Y-%m-%d")
    except Exception:
        return None


def _monate():
    erster = NOW.replace(day=1)
    vor = (erster - timedelta(days=1)).replace(day=1)
    nach = (erster + timedelta(days=32)).replace(day=1)
    return [d.strftime("%Y-%m") for d in (vor, erster, nach)]


def _laden(m, requests):
    r = requests.get("https://api.nasdaq.com/api/ipo/calendar", params={"date": m}, headers=KOPF, timeout=20)
    if r.status_code != 200:
        raise RuntimeError(f"HTTP {r.status_code}")
    return (r.json() or {}).get("data") or {}


def _zeilen(teil):
    if not teil:
        return []
    if "upcomingTable" in teil:
        return (teil.get("upcomingTable") or {}).get("rows") or []
    return teil.get("rows") or []


def _kurse(ticker):
    """Letzter Kurs und erster Handelstag-Schluss für frisch gelistete Aktien (Yahoo)."""
    out = {}
    if not ticker:
        return out
    try:
        import yfinance as yf
        df = yf.download(ticker, period="6mo", interval="1d", auto_adjust=False, group_by="ticker", threads=False, progress=False)
    except Exception:
        return out
    for t in ticker:
        try:
            try:
                s = df[t]["Close"]
            except Exception:
                s = df["Close"]
            s = s.dropna()
            if hasattr(s, "columns"):
                s = s.iloc[:, 0]
            if len(s):
                out[t] = {"kurs": round(float(s.iloc[-1]), 4), "kurs_datum": s.index[-1].strftime("%Y-%m-%d"),
                          "erster": round(float(s.iloc[0]), 4), "erster_datum": s.index[0].strftime("%Y-%m-%d")}
        except Exception:
            pass
    return out


def run(cfg=None):
    import requests
    import shutil
    cfg = cfg or {}
    # höchstens alle 30 Minuten bei Nasdaq nachfragen, sonst den letzten Stand weitergeben
    try:
        if (NOW.timestamp() - os.path.getmtime(CACHE)) < 30 * 60:
            os.makedirs(os.path.dirname(OUT), exist_ok=True)
            shutil.copy(CACHE, OUT)
            return
    except OSError:
        pass
    anst, gepreist, angemeldet, ok = {}, {}, {}, 0
    for m in _monate():
        try:
            d = _laden(m, requests)
            ok += 1
        except Exception as e:
            log("Nasdaq nicht erreichbar:", type(e).__name__)
            continue
        for z in _zeilen(d.get("upcoming")):
            anst[z.get("dealID")] = {"name": z.get("companyName"), "t": z.get("proposedTickerSymbol"), "boerse": z.get("proposedExchange"),
                                     "preis": z.get("proposedSharePrice"), "stk": _zahl(z.get("sharesOffered")),
                                     "volumen": _zahl(z.get("dollarValueOfSharesOffered")), "datum": _datum(z.get("expectedPriceDate"))}
        for z in _zeilen(d.get("priced")):
            gepreist[z.get("dealID")] = {"name": z.get("companyName"), "t": z.get("proposedTickerSymbol"), "boerse": z.get("proposedExchange"),
                                         "preis": _zahl(z.get("proposedSharePrice")), "stk": _zahl(z.get("sharesOffered")),
                                         "volumen": _zahl(z.get("dollarValueOfSharesOffered")), "datum": _datum(z.get("pricedDate"))}
        for z in _zeilen(d.get("filed")):
            angemeldet[z.get("dealID")] = {"name": z.get("companyName"), "t": z.get("proposedTickerSymbol"),
                                           "volumen": _zahl(z.get("dollarValueOfSharesOffered")), "datum": _datum(z.get("filedDate"))}
    if not ok:
        log("keine neuen IPO-Daten – alter Stand bleibt")
        if os.path.exists(CACHE):
            shutil.copy(CACHE, OUT)
        return
    for k in list(anst):   # schon gepreist -> nicht mehr „demnächst“
        if k in gepreist:
            del anst[k]
    grenze = (NOW - timedelta(days=90)).strftime("%Y-%m-%d")
    gp = sorted([x for x in gepreist.values() if x["datum"] and x["datum"] >= grenze], key=lambda x: x["datum"], reverse=True)
    k = _kurse(sorted({x["t"] for x in gp if x.get("t")}))
    for x in gp:
        x.update(k.get(x.get("t")) or {})
        if x.get("kurs") and x.get("preis"):
            x["perf"] = round(x["kurs"] / x["preis"] - 1, 4)
    an = sorted([x for x in anst.values() if x.get("name")], key=lambda x: x.get("datum") or "9999")
    fi = sorted([x for x in angemeldet.values() if x["datum"] and x["datum"] >= (NOW - timedelta(days=45)).strftime("%Y-%m-%d")],
                key=lambda x: x["datum"], reverse=True)
    out = {"stand": NOW.isoformat(), "quelle": "Nasdaq IPO-Kalender (USA)", "demnaechst": an, "gepreist": gp, "angemeldet": fi[:40],
           "kandidaten": cfg.get("ipo_kandidaten") or KANDIDATEN}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    shutil.copy(OUT, CACHE)
    log(f"{len(an)} demnächst, {len(gp)} gepreist (90 Tage), {len(fi)} angemeldet")


if __name__ == "__main__":
    run()
