#!/usr/bin/env python3
"""
Value Finder – Scanner
======================
Läuft automatisch auf GitHub (siehe .github/workflows/scanner.yml) und

  1. holt die Aktienliste (S&P 500 + DAX + deine Zusatz-Ticker),
  2. lädt 1 Jahr Kurshistorie und die Kennzahlen von Yahoo Finance,
  3. berechnet für jede Aktie einen Chancen-Score (0–100),
  4. sucht auffällige Kursrückgänge und prüft, ob es dafür News oder Quartalszahlen gibt,
  5. schreibt alles in web/data.json (die liest die Website),
  6. schickt optional Telegram-Nachrichten.

Lokal testen ohne Internet:   python scanner.py --demo
"""

import argparse
import io
import json
import math
import os
import random
import sys
import time
import traceback
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(ROOT, "web")
STATE_DIR = os.path.join(ROOT, "state")
DATA_FILE = os.path.join(WEB_DIR, "data.json")
UNIVERSE_FILE = os.path.join(STATE_DIR, "universe.json")
FUND_FILE = os.path.join(STATE_DIR, "fundamentals.json")
ALERTS_FILE = os.path.join(STATE_DIR, "alerts.json")
CONFIG_FILE = os.path.join(ROOT, "config.json")

NOW = datetime.now(timezone.utc)
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"}

# ---------------------------------------------------------------- Branchen auf Deutsch
SEKTOR_DE = {
    # Yahoo-Namen
    "Technology": "Technologie", "Healthcare": "Gesundheit", "Financial Services": "Finanzen",
    "Consumer Cyclical": "Zyklischer Konsum", "Consumer Defensive": "Basiskonsum",
    "Industrials": "Industrie", "Energy": "Energie", "Basic Materials": "Rohstoffe",
    "Communication Services": "Kommunikation", "Utilities": "Versorger", "Real Estate": "Immobilien",
    # GICS-Namen (Wikipedia)
    "Information Technology": "Technologie", "Health Care": "Gesundheit", "Financials": "Finanzen",
    "Consumer Discretionary": "Zyklischer Konsum", "Consumer Staples": "Basiskonsum",
    "Materials": "Rohstoffe",
}

# Fallback, falls Wikipedia nicht erreichbar ist (Stand 2026, kann veralten -> config.json zusatz_ticker)
DAX_FALLBACK = {
    "ADS.DE": "Adidas", "AIR.DE": "Airbus", "ALV.DE": "Allianz", "BAS.DE": "BASF", "BAYN.DE": "Bayer",
    "BEI.DE": "Beiersdorf", "BMW.DE": "BMW", "BNR.DE": "Brenntag", "CBK.DE": "Commerzbank",
    "CON.DE": "Continental", "DTG.DE": "Daimler Truck", "DBK.DE": "Deutsche Bank", "DB1.DE": "Deutsche Börse",
    "DHL.DE": "DHL Group", "DTE.DE": "Deutsche Telekom", "EOAN.DE": "E.ON", "FRE.DE": "Fresenius",
    "FME.DE": "Fresenius Medical Care", "G1A.DE": "GEA", "HNR1.DE": "Hannover Rück", "HEI.DE": "Heidelberg Materials",
    "HEN3.DE": "Henkel", "IFX.DE": "Infineon", "MBG.DE": "Mercedes-Benz", "MRK.DE": "Merck KGaA",
    "MTX.DE": "MTU Aero Engines", "MUV2.DE": "Munich Re", "P911.DE": "Porsche AG", "PAH3.DE": "Porsche SE",
    "QIA.DE": "Qiagen", "RHM.DE": "Rheinmetall", "RWE.DE": "RWE", "SAP.DE": "SAP", "G24.DE": "Scout24",
    "SIE.DE": "Siemens", "ENR.DE": "Siemens Energy", "SHL.DE": "Siemens Healthineers", "SY1.DE": "Symrise",
    "VOW3.DE": "Volkswagen", "VNA.DE": "Vonovia", "ZAL.DE": "Zalando",
}

MARKT_SUFFIX = {".DE": "DE", ".PA": "FR", ".AS": "NL", ".CO": "DK", ".L": "UK", ".SW": "CH",
                ".MI": "IT", ".MC": "ES", ".ST": "SE", ".HE": "FI", ".BR": "BE", ".VI": "AT", ".TO": "CA"}


def log(*a):
    print(f"[{datetime.now().strftime('%H:%M:%S')}]", *a, flush=True)


def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def save_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(clean(obj), f, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    os.replace(tmp, path)


def clean(o):
    """NaN/Inf -> None, numpy -> python, damit JSON gültig bleibt."""
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


def num(x):
    """Sicher in float umwandeln (Yahoo liefert manchmal Strings wie 'Infinity')."""
    try:
        f = float(x)
        return None if (math.isnan(f) or math.isinf(f)) else f
    except Exception:
        return None


def markt_von(ticker):
    for suf, m in MARKT_SUFFIX.items():
        if ticker.endswith(suf):
            return m
    return "US"


def rnd(x, n=4):
    x = num(x)
    return None if x is None else round(x, n)


# ================================================================ 1. Aktienliste
def wiki_tables(url):
    import requests
    r = requests.get(url, headers=UA, timeout=30)
    r.raise_for_status()
    return pd.read_html(io.StringIO(r.text))


def lade_universum(cfg):
    alt = load_json(UNIVERSE_FILE, {})
    # Liste nur einmal pro Woche neu laden
    if alt.get("stand") and alt.get("aktien"):
        alter = NOW - datetime.fromisoformat(alt["stand"])
        if alter < timedelta(days=7):
            uni = alt["aktien"]
            return ergaenze_zusatz(uni, cfg)

    uni = {}
    if cfg["maerkte"].get("sp500", True):
        try:
            for t in wiki_tables("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"):
                if "Symbol" in t.columns and "Security" in t.columns:
                    for _, row in t.iterrows():
                        sym = str(row["Symbol"]).strip().replace(".", "-")
                        uni[sym] = {
                            "name": str(row["Security"]),
                            "sektor_gics": str(row.get("GICS Sector", "")),
                            "branche_gics": str(row.get("GICS Sub-Industry", "")),
                            "index": "S&P 500",
                        }
                    break
            log(f"S&P 500 von Wikipedia: {sum(1 for v in uni.values() if v['index']=='S&P 500')} Werte")
        except Exception as e:
            log("WARNUNG: S&P-500-Liste nicht ladbar:", e)
            for k, v in (alt.get("aktien") or {}).items():
                if v.get("index") == "S&P 500":
                    uni[k] = v

    if cfg["maerkte"].get("dax", True):
        dax = {}
        try:
            for t in wiki_tables("https://en.wikipedia.org/wiki/DAX"):
                cols = [str(c) for c in t.columns]
                tcol = next((c for c in cols if "ticker" in c.lower()), None)
                ccol = next((c for c in cols if c.lower() in ("company", "name")), None)
                if tcol and ccol and 30 <= len(t) <= 45:
                    for _, row in t.iterrows():
                        sym = str(row[tcol]).strip().upper().split(".")[0].split(" ")[0]
                        if sym and sym != "NAN":
                            dax[sym + ".DE"] = str(row[ccol])
                    break
        except Exception as e:
            log("WARNUNG: DAX-Liste nicht ladbar:", e)
        if len(dax) < 30:
            dax = DAX_FALLBACK
        for k, name in dax.items():
            uni[k] = {"name": name, "sektor_gics": "", "branche_gics": "", "index": "DAX"}
        log(f"DAX: {len(dax)} Werte")

    if len(uni) < 20 and alt.get("aktien"):
        uni = alt["aktien"]
    save_json(UNIVERSE_FILE, {"stand": NOW.isoformat(), "aktien": uni})
    return ergaenze_zusatz(uni, cfg)


def ergaenze_zusatz(uni, cfg):
    uni = dict(uni)
    for t in cfg.get("zusatz_ticker", []):
        t = t.strip().upper()
        if t and t not in uni:
            uni[t] = {"name": t, "sektor_gics": "", "branche_gics": "", "index": "Zusatz"}
    return uni


# ================================================================ 2. Kurse
def lade_kurse(tickers):
    import yfinance as yf
    closes = {}
    chunk = 100
    for i in range(0, len(tickers), chunk):
        teil = tickers[i:i + chunk]
        for versuch in range(3):
            try:
                df = yf.download(teil, period="1y", interval="1d", auto_adjust=True,
                                 group_by="ticker", threads=True, progress=False)
                break
            except Exception as e:
                log(f"Kursabruf Fehler (Versuch {versuch+1}):", e)
                time.sleep(5 * (versuch + 1))
                df = None
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
                if len(s) >= 30:
                    closes[t] = s
            except Exception:
                pass
        log(f"Kurse: {min(i+chunk, len(tickers))}/{len(tickers)} abgefragt, {len(closes)} ok")
    return closes


# ================================================================ 3. Kennzahlen (1x pro Tag je Aktie)
FUND_FELDER = {
    "longName": "name", "shortName": "kurzname", "sector": "sektor", "industry": "branche",
    "currency": "waehrung", "marketCap": "mcap", "trailingPE": "kgv", "forwardPE": "kgv_fwd",
    "priceToBook": "kbv", "profitMargins": "marge", "revenueGrowth": "umsatzwachstum",
    "earningsGrowth": "gewinnwachstum", "returnOnEquity": "ek_rendite", "debtToEquity": "verschuldung",
    "dividendYield": "div_rendite", "targetMeanPrice": "kursziel", "numberOfAnalystOpinions": "analysten",
    "recommendationMean": "empfehlung", "earningsTimestamp": "zahlen_ts",
    "earningsTimestampStart": "zahlen_ts_start", "exDividendDate": "ex_div_ts",
}


def lade_kennzahlen(tickers, max_minuten):
    import yfinance as yf
    fund = load_json(FUND_FILE, {})
    def alter(t):
        ts = (fund.get(t) or {}).get("_stand")
        return (NOW - datetime.fromisoformat(ts)).total_seconds() if ts else 1e12
    faellig = sorted([t for t in tickers if alter(t) > 20 * 3600], key=alter, reverse=True)
    log(f"Kennzahlen: {len(faellig)} fällig, Zeitbudget {max_minuten} Min.")
    start = time.time()
    n_ok = 0
    for t in faellig:
        if time.time() - start > max_minuten * 60:
            break
        try:
            info = yf.Ticker(t).info or {}
            eintrag = {neu: info.get(alt) for alt, neu in FUND_FELDER.items()}
            eintrag["_stand"] = NOW.isoformat()
            fund[t] = eintrag
            n_ok += 1
        except Exception as e:
            if "Too Many Requests" in str(e) or "Rate" in str(e):
                log("Rate-Limit erreicht – Rest beim nächsten Lauf.")
                break
        time.sleep(0.15)
    log(f"Kennzahlen aktualisiert: {n_ok}")
    save_json(FUND_FILE, fund)
    return fund


# ================================================================ 4. Kennzahlen berechnen + Score
def ret(s, n):
    if len(s) <= n:
        return None
    return float(s.iloc[-1] / s.iloc[-1 - n] - 1)


def rsi14(s, n=14):
    """Relative-Stärke-Index (Wilder, 14 Tage): unter 30 = überverkauft, über 70 = überkauft."""
    d = s.diff().dropna()
    if len(d) < n + 1:
        return None
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    down = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    if float(down.iloc[-1]) == 0:
        return 100.0
    return float(100 - 100 / (1 + float(up.iloc[-1]) / float(down.iloc[-1])))


def kreuz_signal(s, tage=10):
    """Golden Cross (50-Tage-Linie steigt über 200-Tage-Linie) bzw. Death Cross in den letzten Tagen."""
    if len(s) < 210:
        return None
    diff = (s.rolling(50).mean() - s.rolling(200).mean()).dropna().iloc[-(tage + 1):]
    if len(diff) < 2:
        return None
    if diff.iloc[0] < 0 < diff.iloc[-1]:
        return "golden"
    if diff.iloc[0] > 0 > diff.iloc[-1]:
        return "death"
    return None


def naechster_termin(f):
    ts = [num(f.get("zahlen_ts_start")), num(f.get("zahlen_ts"))]
    ts = [x for x in ts if x and x > NOW.timestamp() - 86400]
    return min(ts) if ts else None


def berechne(uni, closes, fund, cfg):
    rows = []
    for t, s in closes.items():
        u = uni.get(t, {})
        f = fund.get(t, {}) or {}
        p = float(s.iloc[-1])
        tagesrend = s.pct_change().dropna()
        vol_d = float(tagesrend.iloc[-120:].std()) if len(tagesrend) > 20 else None
        r1d = ret(s, 1)
        weekly = s.resample("W").last().dropna().iloc[-52:]
        sektor_en = f.get("sektor") or u.get("sektor_gics") or ""
        rows.append({
            "t": t,
            "n": f.get("name") or f.get("kurzname") or u.get("name") or t,
            "m": markt_von(t),
            "idx": u.get("index", ""),
            "s": SEKTOR_DE.get(sektor_en, sektor_en or "Sonstige"),
            "i": f.get("branche") or u.get("branche_gics") or "",
            "cur": f.get("waehrung") or ("EUR" if t.endswith(".DE") else "USD"),
            "p": p,
            "datum": s.index[-1].strftime("%Y-%m-%d"),
            "r1d": r1d, "r5d": ret(s, 5), "r1m": ret(s, 21), "r3m": ret(s, 63),
            "r6m": ret(s, 126), "r1y": float(s.iloc[-1] / s.iloc[0] - 1) if len(s) >= 240 else None,
            "hist_tage": len(s), "rsi": rsi14(s),
            "sma50": float(s.iloc[-50:].mean()) if len(s) >= 50 else None,
            "sma200": float(s.iloc[-200:].mean()) if len(s) >= 200 else None,
            "kreuz": kreuz_signal(s),
            "dd": float(p / s.max() - 1),
            "vol": vol_d * math.sqrt(252) if vol_d else None,
            "z1d": (r1d / vol_d) if (r1d is not None and vol_d) else None,
            "spark": [round(float(x), 2) for x in weekly.values],
            # Kennzahlen
            "kgv": num(f.get("kgv")), "kgv_fwd": num(f.get("kgv_fwd")), "kbv": num(f.get("kbv")),
            "marge": num(f.get("marge")), "uw": num(f.get("umsatzwachstum")),
            "gw": num(f.get("gewinnwachstum")), "roe": num(f.get("ek_rendite")),
            "div": num(f.get("div_rendite")), "mcap": num(f.get("mcap")),
            "ziel": num(f.get("kursziel")), "na": num(f.get("analysten")), "rec": num(f.get("empfehlung")),
            "zahlen_ts": num(f.get("zahlen_ts")) or num(f.get("zahlen_ts_start")),
            "ex_div_ts": num(f.get("ex_div_ts")),
            "er": naechster_termin(f),
        })
    df = pd.DataFrame(rows)
    if df.empty:
        return df

    # Dividendenrendite: Yahoo liefert je nach Version 0.012 oder 1.2 -> auf Anteil normieren
    df["div"] = df["div"].where(df["div"].isna() | (df["div"] < 0.3), df["div"] / 100)

    # Vergleichsgruppe: feine Branche (wenn >= 5 Aktien), sonst Sektor
    cnt = df.groupby("i")["t"].transform("count")
    df["grp"] = np.where((df["i"] != "") & (cnt >= 5), df["i"], df["s"])
    g = df.groupby("grp")
    df["grp_r6m"] = g["r6m"].transform("median")
    df["grp_r1y"] = g["r1y"].transform("median")
    df["grp_n"] = g["t"].transform("count")
    pe_pos = df["kgv_fwd"].where(df["kgv_fwd"] > 0)
    df["grp_kgv"] = pe_pos.groupby(df["grp"]).transform("median")

    # Einzelfaktoren
    df["upside"] = np.where((df["na"].fillna(0) >= 3) & (df["ziel"] > 0), df["ziel"] / df["p"] - 1, np.nan)
    df["gap6"] = df["grp_r6m"] - df["r6m"]
    df["rel_kgv"] = pe_pos / df["grp_kgv"]

    def pct(col, hoch_gut=True):
        return df[col].rank(pct=True, ascending=hoch_gut)

    comp = pd.DataFrame(index=df.index)
    comp["kursziel"] = pct("upside")
    # Aufholen: Lücke zur Branche, aber extreme Abstürze (> 60 % unter Hoch) werden gedeckelt
    comp["aufholen"] = pct("gap6").where(df["dd"] > -0.6, 0.3)
    comp["branchentrend"] = pct("grp_r1y")
    comp["bewertung"] = pct("rel_kgv", hoch_gut=False)
    q = pd.concat([pct("marge"), pct("uw"), df["roe"].clip(-1, 1).rank(pct=True)], axis=1)
    comp["qualitaet"] = q.mean(axis=1, skipna=True).where(q.notna().sum(axis=1) >= 2)
    # Verlustbringer / schrumpfende Firmen abstrafen
    comp.loc[df["marge"] < 0, "qualitaet"] = comp.loc[df["marge"] < 0, "qualitaet"].fillna(0.2) * 0.5

    w = cfg["score_gewichte"]
    wsum = pd.Series(0.0, index=df.index)
    acc = pd.Series(0.0, index=df.index)
    for k, gewicht in w.items():
        if k in comp:
            ok = comp[k].notna()
            acc[ok] += comp.loc[ok, k] * gewicht
            wsum[ok] += gewicht
    vollstaendig = wsum / sum(w.values())
    df["score"] = np.where(vollstaendig >= 0.5, acc / wsum.replace(0, np.nan) * 100, np.nan)
    df["vollst"] = vollstaendig
    df["comp"] = [{k: rnd(comp.loc[i, k], 3) for k in comp.columns} for i in df.index]
    df["why"] = [gruende(r) for r in df.to_dict("records")]
    df["warn"] = [warnungen(r) for r in df.to_dict("records")]
    return df


def pc(x, d=0):
    return f"{x*100:+.{d}f} %".replace(".", ",")


def de(x, d=1, vorzeichen=False):
    return (f"{x:+.{d}f}" if vorzeichen else f"{x:.{d}f}").replace(".", ",")


def gruende(r):
    out = []
    if r.get("upside") is not None and not pd.isna(r["upside"]) and r["upside"] >= 0.15:
        out.append(f"Analysten-Kursziel {pc(r['upside'])} ({int(r['na'])} Analysten)")
    if not pd.isna(r.get("gap6")) and r["gap6"] >= 0.10:
        out.append(f"Hinkt Branche „{r['grp']}“ um {r['gap6']*100:.0f} Pp. hinterher (6 Mon.)")
    if not pd.isna(r.get("grp_r1y")) and r["grp_r1y"] >= 0.20:
        out.append(f"Branche „{r['grp']}“ {pc(r['grp_r1y'])} in 12 Mon.")
    if not pd.isna(r.get("rel_kgv")) and r["rel_kgv"] <= 0.8:
        out.append(f"KGV (erwartet) {r['kgv_fwd']:.1f} – {(1-r['rel_kgv'])*100:.0f} % unter Branche".replace(".", ","))
    if r.get("marge") is not None and not pd.isna(r["marge"]) and r["marge"] >= 0.2:
        out.append(f"Hohe Gewinnmarge {r['marge']*100:.0f} %")
    if not pd.isna(r.get("dd")) and r["dd"] <= -0.25:
        out.append(f"{abs(r['dd'])*100:.0f} % unter 52-Wochen-Hoch")
    return out[:4]


def warnungen(r):
    out = []
    if r.get("marge") is not None and not pd.isna(r["marge"]) and r["marge"] < 0:
        out.append("Macht Verlust")
    if r.get("uw") is not None and not pd.isna(r["uw"]) and r["uw"] < -0.05:
        out.append(f"Umsatz schrumpft ({pc(r['uw'])})")
    if not pd.isna(r.get("dd")) and r["dd"] <= -0.6:
        out.append("Über 60 % eingebrochen – mögliche Value-Falle")
    return out


# ================================================================ 5. Auffällige Kursrückgänge
def news_holen(t, stunden):
    import yfinance as yf
    try:
        items = yf.Ticker(t).get_news(count=15)
    except Exception:
        return []
    out = []
    grenze = NOW - timedelta(hours=stunden)
    for it in items or []:
        c = it.get("content", it) or {}
        titel = c.get("title")
        zeit = c.get("pubDate") or c.get("displayTime") or c.get("providerPublishTime")
        try:
            if isinstance(zeit, (int, float)):
                dtz = datetime.fromtimestamp(zeit, tz=timezone.utc)
            else:
                dtz = datetime.fromisoformat(str(zeit).replace("Z", "+00:00"))
        except Exception:
            continue
        if dtz < grenze or not titel:
            continue
        prov = c.get("provider") or {}
        url = (c.get("canonicalUrl") or {}).get("url") or (c.get("clickThroughUrl") or {}).get("url") or c.get("link")
        out.append({"titel": titel, "url": url,
                    "quelle": prov.get("displayName") if isinstance(prov, dict) else c.get("publisher"),
                    "zeit": dtz.isoformat()})
    return out[:5]


def zahlen_termine(t):
    import yfinance as yf
    try:
        df = yf.Ticker(t).get_earnings_dates(limit=8)
        if df is None or df.empty:
            return []
        return [pd.Timestamp(x).tz_convert("UTC") if pd.Timestamp(x).tzinfo else pd.Timestamp(x).tz_localize("UTC")
                for x in df.index]
    except Exception:
        return []


def finde_alarme(df, cfg, demo=False):
    a = cfg["alarm"]
    alt = load_json(ALERTS_FILE, [])
    df = df.copy()
    # Vergleich mit gleichem Markt + Sektor (sonst ganzer Markt)
    df["ref1d"] = df.groupby(["m", "s"])["r1d"].transform("median")
    df["ref5d"] = df.groupby(["m", "s"])["r5d"].transform("median")
    n_ms = df.groupby(["m", "s"])["t"].transform("count")
    klein = n_ms < 4
    df.loc[klein, "ref1d"] = df.groupby("m")["r1d"].transform("median")[klein]
    df.loc[klein, "ref5d"] = df.groupby("m")["r5d"].transform("median")[klein]

    kandidaten = []
    for r in df.to_dict("records"):
        r1d, r5d, z1d = num(r["r1d"]), num(r["r5d"]), num(r["z1d"])
        rel1 = (r1d or 0) - (num(r["ref1d"]) or 0)
        rel5 = (r5d or 0) - (num(r["ref5d"]) or 0)
        min_rel = -a["mindestens_schlechter_als_branche_pp"] / 100
        if r1d is not None and (r1d <= a["tagesverlust_prozent"] / 100 or
                                (z1d or 0) <= -a["ungewoehnlich_sigma"]) and rel1 <= min_rel:
            kandidaten.append((r, "1d", rel1))
        elif r5d is not None and r5d <= a["wochenverlust_prozent"] / 100 and rel5 <= min_rel * 1.5:
            kandidaten.append((r, "5d", rel5))

    neue = []
    for r, art, rel in kandidaten:
        aid = f"{r['t']}|{art}|{r['datum']}"
        if any(x["id"] == aid for x in alt):
            continue
        if art == "5d" and any(x["t"] == r["t"] and x["art"] == "5d" and
                               NOW - datetime.fromisoformat(x["zeit"]) < timedelta(days=5) for x in alt):
            continue
        if art == "1d" and any(x["t"] == r["t"] and x["datum"] == r["datum"] for x in alt):
            continue

        # Gibt es einen erkennbaren Grund?
        if demo:
            news = [] if random.random() < 0.5 else [{"titel": f"{r['n']}: Analyst senkt Kursziel", "url": "https://finance.yahoo.com", "quelle": "Demo", "zeit": NOW.isoformat()}]
            termine = []
        else:
            news = news_holen(r["t"], a["news_stunden"])
            termine = zahlen_termine(r["t"])
            time.sleep(0.3)
        zts, exts = num(r.get("zahlen_ts")), num(r.get("ex_div_ts"))
        ts = [pd.Timestamp(zts, unit="s", tz="UTC")] if zts else []
        nahe = [d for d in termine + ts
                if abs((d - pd.Timestamp(NOW)).total_seconds()) <= a["quartalszahlen_tage"] * 86400]
        exdiv = bool(exts) and abs(NOW.timestamp() - exts) < 3 * 86400

        if nahe:
            grund, typ = f"Quartalszahlen am {nahe[0].strftime('%d.%m.%Y')}", "zahlen"
        elif exdiv:
            grund, typ = "Ex-Dividenden-Tag (Kurs sinkt um die Dividende)", "dividende"
        elif news:
            grund, typ = f"{len(news)} Nachricht(en) in den letzten {a['news_stunden']} Std.", "news"
        else:
            grund, typ = "Kein erkennbarer Grund gefunden (keine News, keine Zahlen)", "ohne_grund"

        neue.append({
            "id": aid, "t": r["t"], "n": r["n"], "m": r["m"], "s": r["s"], "art": art, "typ": typ,
            "datum": r["datum"], "zeit": NOW.isoformat(), "p": rnd(r["p"], 2), "cur": r["cur"],
            "r1d": rnd(r["r1d"]), "r5d": rnd(r["r5d"]), "rel": rnd(rel), "grund": grund, "news": news,
            "score": rnd(r["score"], 1),
        })

    alle = (neue + alt)[:150]
    save_json(ALERTS_FILE, alle)
    log(f"Alarme: {len(kandidaten)} Kandidaten, {len(neue)} neu")
    return alle, neue


# ================================================================ 6. Telegram
def telegram(neue, cfg, site_url):
    token, chat = os.environ.get("TELEGRAM_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat or not neue:
        return
    import requests
    tg = cfg.get("telegram", {})
    liste = [x for x in neue if x["typ"] == "ohne_grund"] if tg.get("nur_ohne_grund", True) else neue
    for x in liste[: tg.get("max_meldungen_pro_lauf", 8)]:
        bewegung = pc(x["r1d"], 1) + " heute" if x["art"] == "1d" else pc(x["r5d"], 1) + " in 5 Tagen"
        text = (f"⚠️ <b>{x['n']}</b> ({x['t']})\n"
                f"{bewegung} · {de(x['rel']*100, 1, True)} Pp. vs. Branche\n"
                f"Kurs: {de(x['p'], 2)} {x['cur']}\n"
                f"{x['grund']}")
        if x.get("score") is not None:
            text += f"\nChancen-Score: {x['score']:.0f}/100"
        if site_url:
            text += f"\n\n<a href=\"{site_url}#alarme\">Zur Übersicht</a>"
        try:
            requests.post(f"https://api.telegram.org/bot{token}/sendMessage",
                          data={"chat_id": chat, "text": text, "parse_mode": "HTML",
                                "disable_web_page_preview": "true"}, timeout=15)
        except Exception as e:
            log("Telegram-Fehler:", e)
        time.sleep(0.5)


# ================================================================ 7. Ausgabe
def ausgabe(df, alarme, fund_stand):
    stocks = []
    for r in df.to_dict("records"):
        stocks.append({
            "t": r["t"], "n": r["n"], "m": r["m"], "idx": r["idx"], "s": r["s"], "i": r["i"], "grp": r["grp"],
            "cur": r["cur"], "p": rnd(r["p"], 2), "datum": r["datum"],
            "r1d": rnd(r["r1d"]), "r5d": rnd(r["r5d"]), "r1m": rnd(r["r1m"]), "r3m": rnd(r["r3m"]),
            "r6m": rnd(r["r6m"]), "r1y": rnd(r["r1y"]), "dd": rnd(r["dd"]), "vol": rnd(r["vol"], 3),
            "grp_r6m": rnd(r["grp_r6m"]), "grp_r1y": rnd(r["grp_r1y"]), "grp_n": int(r["grp_n"]),
            "kgv": rnd(r["kgv"], 1), "kgv_fwd": rnd(r["kgv_fwd"], 1), "grp_kgv": rnd(r["grp_kgv"], 1),
            "kbv": rnd(r["kbv"], 2), "marge": rnd(r["marge"]), "uw": rnd(r["uw"]), "roe": rnd(r["roe"]),
            "div": rnd(r["div"]), "mcap": r["mcap"], "ziel": rnd(r["ziel"], 2), "na": r["na"],
            "rec": rnd(r["rec"], 2), "upside": rnd(r["upside"]),
            "score": rnd(r["score"], 1), "vollst": rnd(r["vollst"], 2),
            "comp": r["comp"], "why": r["why"], "warn": r["warn"], "spark": r["spark"],
            "er": rnd(r["er"], 0), "exd": rnd(r["ex_div_ts"], 0),
            "rsi": rnd(r["rsi"], 1), "sma50": rnd(r["sma50"], 2), "sma200": rnd(r["sma200"], 2),
            "kreuz": r["kreuz"] if isinstance(r["kreuz"], str) else None, "hist": int(r["hist_tage"]),
        })
    sektoren = []
    for s, g in df.groupby("s"):
        sektoren.append({
            "s": s, "n": int(len(g)),
            "r1d": rnd(g["r1d"].median()), "r1m": rnd(g["r1m"].median()),
            "r6m": rnd(g["r6m"].median()), "r1y": rnd(g["r1y"].median()),
            "score": rnd(g["score"].mean(), 1),
        })
    save_json(DATA_FILE, {
        "stand": NOW.isoformat(), "stand_kennzahlen": fund_stand,
        "anzahl": len(stocks), "stocks": stocks, "sektoren": sektoren, "alarme": alarme,
    })
    log(f"Gespeichert: {DATA_FILE} ({os.path.getsize(DATA_FILE)//1024} KB, {len(stocks)} Aktien)")


# ================================================================ Demo-Daten (ohne Internet)
def demo_daten(n=180):
    rng = np.random.default_rng(7)
    sektoren = {
        "Technology": ["Semiconductors", "Software - Infrastructure", "Software - Application"],
        "Healthcare": ["Drug Manufacturers - General", "Medical Devices"],
        "Financial Services": ["Banks - Diversified", "Insurance - Diversified", "Capital Markets"],
        "Industrials": ["Aerospace & Defense", "Specialty Industrial Machinery"],
        "Consumer Cyclical": ["Auto Manufacturers", "Internet Retail"],
        "Consumer Defensive": ["Household & Personal Products"],
        "Energy": ["Oil & Gas Integrated"], "Utilities": ["Utilities - Regulated Electric"],
        "Basic Materials": ["Specialty Chemicals"], "Communication Services": ["Telecom Services"],
        "Real Estate": ["REIT - Residential"],
    }
    namen = ["Nordwind", "Alpenstahl", "Quanta", "Helix", "Brightline", "Meridian", "Polaris", "Vektor",
             "Orion", "Kestrel", "Atlas", "Cobalt", "Falkenberg", "Isar", "Lumen", "Rheinwerk", "Saturn", "Tessera"]
    uni, closes, fund = {}, {}, {}
    idx = pd.bdate_range(end=pd.Timestamp.today().normalize(), periods=252)
    trend = {s: rng.normal(0.0006, 0.0006) for s in sektoren}
    for k in range(n):
        sek = list(sektoren)[k % len(sektoren)]
        ind = sektoren[sek][k % len(sektoren[sek])]
        de = k % 5 == 0
        t = f"D{k:03d}" + (".DE" if de else "")
        name = f"{namen[k % len(namen)]} {['AG','Corp','SE','Inc','Holding'][k % 5]} {k}"
        drift = trend[sek] + rng.normal(0, 0.0007)
        r = rng.normal(drift, rng.uniform(0.01, 0.025), len(idx))
        if k % 23 == 0:
            r[-1] = -0.09
        if k % 31 == 0:
            r[-5:] = -0.035
        s = pd.Series(50 * np.exp(np.cumsum(r)) * rng.uniform(0.5, 6), index=idx)
        closes[t] = s
        uni[t] = {"name": name, "sektor_gics": "", "branche_gics": "", "index": "DAX" if de else "S&P 500"}
        p = float(s.iloc[-1])
        fund[t] = {"name": name, "sektor": sek, "branche": ind, "waehrung": "EUR" if de else "USD",
                   "mcap": float(rng.uniform(5e9, 3e11)), "kgv": float(rng.uniform(8, 45)),
                   "kgv_fwd": float(rng.uniform(7, 40)) if k % 17 else -5.0, "kbv": float(rng.uniform(0.8, 12)),
                   "marge": float(rng.uniform(-0.1, 0.4)), "umsatzwachstum": float(rng.uniform(-0.1, 0.3)),
                   "ek_rendite": float(rng.uniform(-0.05, 0.45)), "div_rendite": float(rng.uniform(0, 0.05)),
                   "kursziel": p * float(rng.uniform(0.85, 1.5)), "analysten": int(rng.integers(0, 40)),
                   "empfehlung": float(rng.uniform(1.4, 3.2)),
                   "zahlen_ts": (NOW + timedelta(days=1)).timestamp() if k % 46 == 0 else None}
    return uni, closes, fund


# ================================================================ Hauptprogramm
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--demo", action="store_true", help="Mit erfundenen Daten testen (kein Internet nötig)")
    args = ap.parse_args()
    cfg = load_json(CONFIG_FILE, {})
    os.makedirs(STATE_DIR, exist_ok=True)

    if args.demo:
        random.seed(1)
        for f in (ALERTS_FILE,):
            if os.path.exists(f):
                os.remove(f)
        uni, closes, fund = demo_daten()
    else:
        uni = lade_universum(cfg)
        log(f"Universum: {len(uni)} Aktien")
        closes = lade_kurse(sorted(uni))
        fund = lade_kennzahlen(sorted(closes), cfg.get("kennzahlen_max_minuten_pro_lauf", 8))

    df = berechne(uni, closes, fund, cfg)
    if df.empty:
        log("FEHLER: keine Kursdaten – Abbruch, alte Daten bleiben online.")
        sys.exit(1)
    alarme, neue = finde_alarme(df, cfg, demo=args.demo)
    stände = [v.get("_stand") for v in fund.values() if isinstance(v, dict) and v.get("_stand")]
    ausgabe(df, alarme, min(stände) if stände else (NOW.isoformat() if args.demo else None))
    try:
        d = load_json(DATA_FILE, {})
        d["check"] = {"universum": len(uni), "mit_kursen": len(closes), "mit_kennzahlen": sum(1 for t in closes if (fund.get(t) or {}).get("_stand")),
                      "ohne_kurs": sorted(set(uni) - set(closes))[:40]}
        save_json(DATA_FILE, d)
    except Exception:
        traceback.print_exc()
    if not args.demo:
        try:
            import depot
            depot.run(df, closes, fund, neue, cfg, news_holen, os.environ.get("SITE_URL", ""))
        except Exception:
            traceback.print_exc()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
        sys.exit(1)
