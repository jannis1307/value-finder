"""Kurs-Verläufe für die Aktien-Detailansicht: 1 Tag bis Max.

Je Aktie eine kleine Datei web/k/<TICKER>.json, die die Website erst beim Öffnen lädt:
  d1  5-Minuten-Kurse des letzten Handelstags      (jeder Lauf an Werktagen)
  w1  30-Minuten-Kurse der letzten 5 Handelstage    (alle 30 Minuten)
  y1  Tageskurse 1 Jahr                             (kommen schon aus dem Scan)
  y5  Wochenkurse 5 Jahre, mx Monatskurse seit Börsengang   (einmal am Tag, in Portionen)
  vc  Schlusskurs des Vortags (für „heute +x %“)
Nur Aktien aus dem öffentlichen Universum – nie Depot-Werte (die würden sonst sichtbar).
Format kompakt: Minuten-Reihen [t0_minuten, [abstände], [werte]], Tages-Reihen ["JJJJ-MM-TT", [tage], [werte]].
"""
import json
import os
import re
import time
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(ROOT, "state", "kurse")
WEB_K = os.path.join(ROOT, "web", "k")
META = os.path.join(STATE, "_meta.json")


def log(*a):
    print(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] [Kurse]", *a, flush=True)


def datei(t):
    return re.sub(r"[^A-Za-z0-9._-]", "_", t) + ".json"


def rund(v):
    v = float(v)
    a = abs(v)
    return round(v, 2 if a >= 100 else 3 if a >= 1 else 5)


def _lesen(p, d):
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return d


def _schreiben(p, o):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(o, f, separators=(",", ":"), ensure_ascii=False)
    os.replace(tmp, p)


def minuten_reihe(s):
    """pandas-Serie mit Zeitstempeln -> [t0, [abstände], [werte]] in UTC-Minuten."""
    import pandas as pd
    s = pd.to_numeric(s, errors="coerce").dropna()
    s = s[s > 0]
    if len(s) < 2:
        return None
    idx = s.index
    if getattr(idx, "tz", None) is None:
        idx = idx.tz_localize("UTC")
    m = [int(ts.timestamp() // 60) for ts in idx.tz_convert("UTC")]
    t0 = m[0]
    return [t0, [x - t0 for x in m], [rund(v) for v in s.values]]


def tage_reihe(s):
    """pandas-Serie mit Datumsindex -> ["JJJJ-MM-TT", [tage seit start], [werte]]."""
    import pandas as pd
    s = pd.to_numeric(s, errors="coerce").dropna()
    s = s[s > 0]
    if len(s) < 2:
        return None
    tage = [ts.date() if hasattr(ts, "date") else ts for ts in s.index]
    d0 = tage[0]
    return [d0.isoformat(), [(d - d0).days for d in tage], [rund(v) for v in s.values]]


def vortag_schluss(tag_s, d1):
    """Letzter Tagesschluss vor dem Handelstag der 5-Minuten-Kurse."""
    if tag_s is None or d1 is None or len(tag_s) < 2:
        return None
    import pandas as pd
    start = datetime.fromtimestamp(d1[0] * 60, tz=timezone.utc).date()
    s = pd.to_numeric(tag_s, errors="coerce").dropna()
    frueher = [v for ts, v in zip(s.index, s.values) if (ts.date() if hasattr(ts, "date") else ts) < start]
    return rund(frueher[-1]) if frueher else None


def _laden(tickers, period, interval):
    """Mehrere Ticker auf einmal; {ticker: Close-Serie}. Fehlende einzeln nachholen (yfinance verliert manchmal welche)."""
    import pandas as pd
    import yfinance as yf
    out = {}

    def holen(teil, threads):
        try:
            df = yf.download(teil, period=period, interval=interval, auto_adjust=True, group_by="ticker",
                             threads=threads, progress=False, prepost=False)
        except Exception:
            return
        if df is None or df.empty:
            return
        for t in teil:
            try:
                s = df[t]["Close"] if isinstance(df.columns, pd.MultiIndex) else df["Close"]
                s = pd.to_numeric(s, errors="coerce").dropna()
                if len(s) >= 2:
                    out[t] = s
            except Exception:
                pass

    for i in range(0, len(tickers), 100):
        holen(tickers[i:i + 100], True)
    fehlt = [t for t in tickers if t not in out]
    if 0 < len(fehlt) <= 30:
        holen(fehlt, False)
    return out


def run(uni, closes, budget_s=60, demo=None):
    """uni: Liste der Universum-Ticker, closes: {ticker: Tageskurse 1 Jahr} aus dem Scan.
    demo: optional {"d1": {...}, "w1": {...}, "y5": {...}, "mx": {...}} statt Yahoo (für Tests)."""
    t_start = time.time()
    jetzt = datetime.now(timezone.utc)
    meta = _lesen(META, {})
    uni = sorted(set(uni))
    werktag = jetzt.weekday() < 5 or (jetzt.weekday() == 6 and jetzt.hour >= 22)   # Asien startet Sonntagabend (UTC)

    def faellig(schluessel, minuten):
        alt = meta.get(schluessel)
        return not alt or (jetzt - datetime.fromisoformat(alt)) > timedelta(minutes=minuten)

    neu = {"d1": {}, "w1": {}, "y5": {}, "mx": {}}
    if demo is not None:
        for k in neu:
            neu[k] = demo.get(k, {})
    else:
        try:
            if werktag and faellig("d1", 3) or not meta.get("d1"):
                neu["d1"] = _laden(uni, "1d", "5m")
                meta["d1"] = jetzt.isoformat()
            if time.time() - t_start < budget_s and (werktag and faellig("w1", 30) or not meta.get("w1")):
                neu["w1"] = _laden(uni, "5d", "30m")
                meta["w1"] = jetzt.isoformat()
            # lange Reihen: einmal am Tag je Aktie, in Portionen, solange Zeit ist
            lang = meta.setdefault("lang", {})
            heute = jetzt.date().isoformat()
            offen = [t for t in uni if lang.get(t) != heute]
            for i in range(0, len(offen), 100):
                if time.time() - t_start > budget_s:
                    break
                teil = offen[i:i + 100]
                neu["y5"].update(_laden(teil, "5y", "1wk"))
                neu["mx"].update(_laden(teil, "max", "1mo"))
                for t in teil:
                    lang[t] = heute
        except Exception as e:
            log("Abruf-Fehler:", type(e).__name__)

    os.makedirs(WEB_K, exist_ok=True)
    erlaubt = {datei(t) for t in uni}
    n = 0
    for t in uni:
        p = os.path.join(STATE, datei(t))
        alt = _lesen(p, {})
        K = dict(alt)
        try:
            if t in neu["d1"]:
                K["d1"] = minuten_reihe(neu["d1"][t])
            if t in neu["w1"]:
                K["w1"] = minuten_reihe(neu["w1"][t])
            if t in neu["y5"]:
                K["y5"] = tage_reihe(neu["y5"][t])
            if t in neu["mx"]:
                K["mx"] = tage_reihe(neu["mx"][t])
            if closes.get(t) is not None:
                K["y1"] = tage_reihe(closes[t])
                K["vc"] = vortag_schluss(closes[t], K.get("d1"))
        except Exception:
            continue
        K = {k: v for k, v in K.items() if v is not None}
        if not K:
            continue
        K["s"] = jetzt.isoformat(timespec="seconds")
        if K != alt:
            _schreiben(p, K)
        _schreiben(os.path.join(WEB_K, datei(t)), K)
        n += 1
    # nichts außerhalb des Universums veröffentlichen
    for f in os.listdir(WEB_K):
        if f.endswith(".json") and f not in erlaubt:
            os.remove(os.path.join(WEB_K, f))
    _schreiben(META, meta)
    log(f"{n} Aktien mit Kurs-Verläufen · {len(neu['d1'])} heute, {len(neu['w1'])} Woche, {len(neu['y5'])} lang · {time.time() - t_start:.0f} s")
