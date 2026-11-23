"""Value Finder – Zusatzauswertungen fürs Depot:
Insider-Käufe, Quartalszahlen-Check, Analysten-Kursziele, Dividenden-Erhöhungen/-Kürzungen,
Wirtschaftskalender, Währungs-Check, ETF-Kosten, Was-wäre-wenn (5 Jahre), Rebalancing-,
Klumpen-, Steuer- und Tagebuch-Erinnerungen.

Alles ist fehlertolerant: Fällt eine Quelle aus, fehlt nur dieser Teil."""
import os
import re
import time
from urllib.parse import quote
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

import depot as D

EXTRA_FILE = os.path.join(D.STATE_DIR, "extras.json")
ZIEL_FILE = os.path.join(D.STATE_DIR, "kursziele.json")
WIRT_FILE = os.path.join(D.STATE_DIR, "wirtschaft.json")
HIST_FILE = os.path.join(D.STATE_DIR, "historie.json")

WIRT_DE = [
    (r"^core cpi", "US-Kerninflation"), (r"^cpi", "Inflation"), (r"core pce", "PCE-Kerninflation (Lieblingsmaß der Fed)"),
    (r"non-farm|nonfarm", "US-Arbeitsmarktbericht"), (r"unemployment rate", "Arbeitslosenquote"),
    (r"unemployment claims", "Erstanträge Arbeitslosenhilfe"), (r"federal funds rate", "Fed-Zinsentscheid"),
    (r"fomc.*minutes", "Fed-Protokoll"), (r"fomc.*statement|fomc press", "Fed-Pressekonferenz"),
    (r"main refinancing|ecb.*rate|monetary policy statement", "EZB-Zinsentscheid"),
    (r"ecb press conference", "EZB-Pressekonferenz"), (r"advance gdp|prelim gdp|final gdp|^gdp", "Wirtschaftswachstum (BIP)"),
    (r"retail sales", "Einzelhandelsumsätze"), (r"ism manufacturing", "Industrie-Stimmung (ISM)"),
    (r"ism services", "Dienstleister-Stimmung (ISM)"), (r"^ppi|core ppi", "Erzeugerpreise"),
    (r"flash manufacturing pmi", "Einkaufsmanager Industrie"), (r"flash services pmi", "Einkaufsmanager Dienstleister"),
    (r"german ifo|ifo business", "ifo-Geschäftsklima"), (r"zew", "ZEW-Konjunkturerwartungen"),
    (r"powell speaks", "Rede von Fed-Chef Powell"), (r"lagarde speaks", "Rede von EZB-Chefin Lagarde"),
    (r"jolts", "Offene Stellen (JOLTS)"), (r"consumer confidence|consumer sentiment", "Verbraucherstimmung"),
]
LAND = {"USD": "🇺🇸", "EUR": "🇪🇺"}


def _de_titel(t):
    tl = (t or "").lower()
    for rx, de in WIRT_DE:
        if re.search(rx, tl):
            return de
    return t


def _ts(x):
    try:
        t = pd.Timestamp(x)
        if t.tzinfo is None:
            t = t.tz_localize("UTC")
        return t.tz_convert("UTC")
    except Exception:
        return None


# ---------------------------------------------------------------- je Aktie: Insider, Analysten, Quartalszahlen
def _je_aktie(t):
    import yfinance as yf
    tk = yf.Ticker(t)
    out = {"_stand": D.NOW.isoformat(), "insider": [], "analysten": [], "quartal": []}
    if not t.endswith((".DE", ".PA", ".AS", ".SW", ".CO", ".L", ".MI", ".MC")) and "-" not in t:
        try:
            it = tk.insider_transactions
            if it is not None and len(it):
                for _, r in it.head(25).iterrows():
                    txt = str(r.get("Text") or r.get("Transaction") or "")
                    art = "Kauf" if re.search(r"purchase|buy", txt, re.I) else "Verkauf" if re.search(r"sale|sell", txt, re.I) else None
                    if not art:
                        continue
                    dt_ = _ts(r.get("Start Date"))
                    out["insider"].append({"datum": dt_.strftime("%Y-%m-%d") if dt_ is not None else None, "wer": str(r.get("Insider") or ""),
                                           "position": str(r.get("Position") or ""), "art": art, "aktien": D.num(r.get("Shares")),
                                           "wert": D.num(r.get("Value"))})
        except Exception as e:
            D.log("Insider-Fehler", t, e)
        try:
            ud = tk.upgrades_downgrades
            if ud is not None and len(ud):
                ud = ud.sort_index(ascending=False).head(12)
                for idx, r in ud.iterrows():
                    dt_ = _ts(idx)
                    out["analysten"].append({"datum": dt_.strftime("%Y-%m-%d") if dt_ is not None else None, "firma": str(r.get("Firm") or ""),
                                             "aktion": str(r.get("Action") or ""), "von": str(r.get("FromGrade") or ""), "zu": str(r.get("ToGrade") or ""),
                                             "ziel_alt": D.num(r.get("priorPriceTarget")), "ziel_neu": D.num(r.get("currentPriceTarget"))})
        except Exception as e:
            D.log("Analysten-Fehler", t, e)
    try:
        ed = tk.get_earnings_dates(limit=8)
        if ed is not None and len(ed):
            for idx, r in ed.iterrows():
                ist = D.num(r.get("Reported EPS"))
                if ist is None:
                    continue
                dt_ = _ts(idx)
                out["quartal"].append({"datum": dt_.strftime("%Y-%m-%d") if dt_ is not None else None, "eps_erw": D.num(r.get("EPS Estimate")),
                                       "eps_ist": ist, "ueberraschung": D.num(r.get("Surprise(%)"))})
            out["quartal"] = out["quartal"][:4]
            # nächster Termin: danach wird früher neu geladen, damit die Zahlen schnell ankommen
            kommend = [_ts(i) for i, r in ed.iterrows() if D.num(r.get("Reported EPS")) is None]
            kommend = [x for x in kommend if x is not None and x > pd.Timestamp(D.NOW) - pd.Timedelta(days=3)]
            if kommend:
                out["naechste"] = min(kommend).isoformat()
    except Exception as e:
        D.log("Quartalszahlen-Fehler", t, e)
    # frische Zahlen: Umsatz und Gewinn gegenüber dem Vorjahresquartal (nur wenn gerade berichtet wurde)
    q0 = (out["quartal"] or [{}])[0]
    if q0.get("datum") and (D.NOW.date() - datetime.strptime(q0["datum"], "%Y-%m-%d").date()).days <= 6:
        try:
            qi = tk.quarterly_income_stmt
            if qi is not None and len(qi.columns) >= 5:
                sp = sorted(qi.columns, reverse=True)
                q_ende = pd.Timestamp(sp[0])
                if 0 <= (pd.Timestamp(q0["datum"]) - q_ende).days <= 100:
                    def yoy(zeile):
                        if zeile not in qi.index:
                            return None
                        a, b = D.num(qi.at[zeile, sp[0]]), D.num(qi.at[zeile, sp[4]])
                        return a / b - 1 if a is not None and b and b > 0 else None
                    q0["umsatz_yoy"] = yoy("Total Revenue")
                    q0["gewinn_yoy"] = yoy("Net Income")
        except Exception as e:
            D.log("Quartals-GuV-Fehler", t, e)
    return out


def _reaktion(s, datum):
    """Kursreaktion: Schluss vor dem Termin -> Schluss am ersten Tag nach dem Termin (Zahlen kommen oft nachbörslich)."""
    try:
        s = s.dropna()
        idx = s.index.tz_localize(None) if getattr(s.index, "tz", None) is not None else s.index
        s = pd.Series(s.values, index=pd.DatetimeIndex(idx).normalize())
        d = pd.Timestamp(datum)
        vor = s[s.index < d]
        nach = s[s.index > d]
        if len(vor) and len(nach):
            return float(nach.iloc[0] / vor.iloc[-1] - 1)
    except Exception:
        pass
    return None


# ---------------------------------------------------------------- Wirtschaftskalender
# Feste Termine der Notenbanken und Statistikämter (EZB-Ratskalender, Federal Reserve, US Bureau of Labor Statistics),
# damit der Kalender auch über die laufende Woche hinaus und ohne Live-Quelle funktioniert. Zeiten in UTC.
OFFIZIELL = [
    ("2026-12-04T13:30:00+00:00", "US-Arbeitsmarktbericht", "USD"),
    ("2026-12-09T19:00:00+00:00", "Fed-Zinsentscheid", "USD"),
    ("2026-12-10T13:30:00+00:00", "Inflation", "USD"),
    ("2026-12-17T13:15:00+00:00", "EZB-Zinsentscheid", "EUR"),
    ("2027-01-08T13:30:00+00:00", "US-Arbeitsmarktbericht", "USD"),
    ("2027-01-13T13:30:00+00:00", "Inflation", "USD"),
    ("2027-01-27T19:00:00+00:00", "Fed-Zinsentscheid", "USD"),
    ("2027-02-04T13:15:00+00:00", "EZB-Zinsentscheid", "EUR"),
    ("2027-02-05T13:30:00+00:00", "US-Arbeitsmarktbericht", "USD"),
    ("2027-02-11T13:30:00+00:00", "Inflation", "USD"),
    ("2027-03-05T13:30:00+00:00", "US-Arbeitsmarktbericht", "USD"),
    ("2027-03-10T13:30:00+00:00", "Inflation", "USD"),
    ("2027-03-17T18:00:00+00:00", "Fed-Zinsentscheid", "USD"),
    ("2027-03-18T13:15:00+00:00", "EZB-Zinsentscheid", "EUR"),
    ("2027-04-02T12:30:00+00:00", "US-Arbeitsmarktbericht", "USD"),
    ("2027-04-13T12:30:00+00:00", "Inflation", "USD"),
    ("2027-04-28T18:00:00+00:00", "Fed-Zinsentscheid", "USD"),
    ("2027-04-29T12:15:00+00:00", "EZB-Zinsentscheid", "EUR"),
    ("2027-05-07T12:30:00+00:00", "US-Arbeitsmarktbericht", "USD"),
    ("2027-05-12T12:30:00+00:00", "Inflation", "USD"),
    ("2027-06-04T12:30:00+00:00", "US-Arbeitsmarktbericht", "USD"),
    ("2027-06-09T18:00:00+00:00", "Fed-Zinsentscheid", "USD"),
    ("2027-06-10T12:15:00+00:00", "EZB-Zinsentscheid", "EUR"),
    ("2027-06-10T12:30:00+00:00", "Inflation", "USD"),
    ("2027-07-02T12:30:00+00:00", "US-Arbeitsmarktbericht", "USD"),
    ("2027-07-14T12:30:00+00:00", "Inflation", "USD"),
    ("2027-07-22T12:15:00+00:00", "EZB-Zinsentscheid", "EUR"),
    ("2027-07-28T18:00:00+00:00", "Fed-Zinsentscheid", "USD"),
    ("2027-08-06T12:30:00+00:00", "US-Arbeitsmarktbericht", "USD"),
    ("2027-08-11T12:30:00+00:00", "Inflation", "USD"),
    ("2027-09-03T12:30:00+00:00", "US-Arbeitsmarktbericht", "USD"),
    ("2027-09-09T12:15:00+00:00", "EZB-Zinsentscheid", "EUR"),
    ("2027-09-14T12:30:00+00:00", "Inflation", "USD"),
    ("2027-09-15T18:00:00+00:00", "Fed-Zinsentscheid", "USD"),
    ("2027-10-08T12:30:00+00:00", "US-Arbeitsmarktbericht", "USD"),
    ("2027-10-14T12:30:00+00:00", "Inflation", "USD"),
    ("2027-10-28T12:15:00+00:00", "EZB-Zinsentscheid", "EUR"),
    ("2027-11-05T12:30:00+00:00", "US-Arbeitsmarktbericht", "USD"),
    ("2027-11-10T13:30:00+00:00", "Inflation", "USD"),
    ("2027-11-17T19:00:00+00:00", "Fed-Zinsentscheid", "USD"),
    ("2027-12-03T13:30:00+00:00", "US-Arbeitsmarktbericht", "USD"),
    ("2027-12-10T13:30:00+00:00", "Inflation", "USD"),
    ("2027-12-16T13:15:00+00:00", "EZB-Zinsentscheid", "EUR")
]


def _offizielle(items):
    """Ergänzt die Live-Termine um die festen Termine der nächsten 120 Tage (ohne doppelte Einträge)."""
    bis = D.NOW + timedelta(days=120)
    belegt = {(i["zeit"][:10], i["titel"]) for i in items}
    for z, titel, land in OFFIZIELL:
        t = datetime.fromisoformat(z)
        if D.NOW - timedelta(hours=3) <= t <= bis and (z[:10], titel) not in belegt:
            items.append({"zeit": z, "titel": titel, "orig": "", "land": land, "wichtig": True, "prognose": None, "vorher": None, "fest": True})
    items.sort(key=lambda x: x["zeit"])
    return items


def wirtschaftskalender():
    cache = D.load(WIRT_FILE, {})
    if cache.get("_stand") and D.NOW - datetime.fromisoformat(cache["_stand"]) < timedelta(hours=3):
        return _offizielle([i for i in cache.get("items", []) if not i.get("fest")])
    import requests
    items = cache.get("items", [])
    try:
        r = requests.get("https://nfs.faireconomy.media/ff_calendar_thisweek.json", timeout=20,
                         headers={"User-Agent": "Mozilla/5.0 value-finder"})
        if r.status_code == 200:
            items = []
            for e in r.json():
                if e.get("country") not in ("USD", "EUR") or e.get("impact") not in ("High", "Medium"):
                    continue
                t = _ts(e.get("date"))
                if t is None:
                    continue
                items.append({"zeit": t.isoformat(), "titel": _de_titel(e.get("title")), "orig": e.get("title"), "land": e.get("country"),
                              "wichtig": e.get("impact") == "High", "prognose": e.get("forecast") or None, "vorher": e.get("previous") or None})
            items.sort(key=lambda x: x["zeit"])
        else:
            D.log("Wirtschaftskalender: HTTP", r.status_code)
    except Exception as e:
        D.log("Wirtschaftskalender-Fehler:", e)
    items = [i for i in items if not i.get("fest")]
    D.save(WIRT_FILE, {"_stand": D.NOW.isoformat(), "items": items})
    return _offizielle(items)


# ---------------------------------------------------------------- Was wäre wenn (5 Jahre)
def was_waere(zeilen, cur_of):
    alt = D.load(HIST_FILE, {})
    sig = "|".join(sorted(f"{z['t']}:{round(z.get('stk') or 0, 3)}" for z in zeilen if z.get("t") and not z.get("manuell")))
    if alt.get("_tag") == D.NOW.strftime("%Y-%m-%d") and alt.get("_sig") == sig:
        return alt.get("daten")
    tickers = sorted({z["t"] for z in zeilen if z.get("t") and not z.get("manuell") and z.get("stk")})
    if not tickers:
        return None
    serien = D.download(tickers + ["URTH"], period="5y")
    fx5 = {}
    for c in {cur_of.get(t, "USD") for t in tickers} | {"USD"}:
        if c in ("EUR",):
            continue
        paar = "EURGBP=X" if c in ("GBp", "GBX", "GBP") else f"EUR{c}=X"
        s = D.download([paar], period="5y").get(paar)
        if s is not None:
            fx5[c] = s * (100 if c in ("GBp", "GBX") else 1)
    def eur_w(s, c):
        e = D.zu_eur(s, c, fx5) if c != "EUR" else s
        if e is None:
            return None
        idx = e.index.tz_localize(None) if getattr(e.index, "tz", None) is not None else e.index
        e = pd.Series(e.values, index=pd.DatetimeIndex(idx))
        return e.resample("W-FRI").last().ffill()
    wochen = {}
    for z in zeilen:
        t = z.get("t")
        if not t or z.get("manuell") or not z.get("stk") or t not in serien:
            continue
        w = eur_w(serien[t], cur_of.get(t, "USD"))
        if w is not None and len(w) > 10:
            wochen[t] = w * z["stk"] + wochen.get(t, 0)
    if not wochen:
        return None
    df = pd.concat(wochen, axis=1)
    start = df.index[0]
    voll = [t for t in df.columns if df[t].first_valid_index() is not None and df[t].first_valid_index() <= start + pd.Timedelta(days=14)]
    spaeter = [t for t in df.columns if t not in voll]
    dep = df[voll].ffill().sum(axis=1).dropna() if voll else pd.Series(dtype=float)
    world = eur_w(serien["URTH"], "USD") if "URTH" in serien else None
    out = {"daten": [d.strftime("%Y-%m-%d") for d in dep.index], "depot": [round(float(v), 2) for v in dep.values],
           "spaeter": [next((z["name"] for z in zeilen if z.get("t") == t), t) for t in spaeter]}
    if world is not None and len(dep):
        w = world.reindex(dep.index).ffill().bfill()
        out["world"] = [round(float(dep.iloc[0] * v / w.iloc[0]), 2) for v in w.values]
    # Beta je Aktie (Wochenrenditen gegen MSCI World) -> Crash-Szenarien
    betas = {}
    if world is not None:
        wr = world.pct_change().dropna()
        for t in df.columns:
            r = (df[t] / df[t].shift(1) - 1).replace([np.inf, -np.inf], np.nan).dropna()
            j = pd.concat([r, wr], axis=1, join="inner").dropna()
            if len(j) >= 40 and j.iloc[:, 1].var() > 0:
                betas[t] = float(np.cov(j.iloc[:, 0], j.iloc[:, 1])[0, 1] / j.iloc[:, 1].var())
    wert = {z["t"]: 0.0 for z in zeilen if z.get("t")}
    for z in zeilen:
        if z.get("t") and not z.get("manuell"):
            wert[z["t"]] += z.get("wert") or 0.0
    ges = sum(z.get("wert") or 0.0 for z in zeilen) or 1.0
    beta_dep = sum(wert.get(t, 0) * b for t, b in betas.items()) / ges
    out["beta"] = round(beta_dep, 2)
    out["betas"] = {t: round(b, 2) for t, b in betas.items()}
    # Bei sehr kurzer oder untypischer Historie ist das Beta nicht aussagekräftig -> wie der Markt rechnen
    beta_s = beta_dep if beta_dep >= 0.2 else 1.0
    out["beta_hinweis"] = beta_dep < 0.2
    out["szenarien"] = [{"name": n, "markt": m, "depot": round(m * beta_s, 4)} for n, m in
                        (("Korrektur", -0.10), ("Bärenmarkt", -0.20), ("Crash wie 2020", -0.34), ("Finanzkrise 2008", -0.50))]
    if len(dep) > 5:
        hoch = dep.cummax()
        dd = dep / hoch - 1
        out["max_dd"] = round(float(dd.min()), 4)
        out["max_dd_datum"] = dd.idxmin().strftime("%Y-%m-%d")
        j22 = dep[(dep.index >= "2022-01-01") & (dep.index <= "2022-12-31")]
        if len(j22) > 10:
            out["jahr_2022"] = round(float((j22 / j22.cummax() - 1).min()), 4)
    D.save(HIST_FILE, {"_tag": D.NOW.strftime("%Y-%m-%d"), "_sig": sig, "daten": out})
    return out


# ---------------------------------------------------------------- Gruppen fürs Rebalancing (wie auf der Website)
def _gruppe(z, zi):
    g = (zi.get("gruppe") or {}).get(z.get("id"))
    if g:
        return g
    if z.get("manuell"):
        return "Sonstiges"
    art = z.get("art") or ""
    return "ETFs" if art in ("ETF", "MUTUALFUND") else "Krypto" if art == "CRYPTOCURRENCY" else "Einzelaktien"


# ---------------------------------------------------------------- Hauptfunktion
def run(ctx):
    """ctx: post, eins, klick, pf, zeilen, serien, cur_of, fx, fx_jetzt, df, watch, div_termine, durchblick, summe"""
    post, eins, klick, pf = ctx["post"], ctx["eins"], ctx["klick"], ctx["pf"]
    zeilen, serien, df = ctx["zeilen"], ctx["serien"], ctx["df"]
    heute = D.NOW.date()
    woche = D.NOW.strftime("%G-%V")
    k = lambda h: (klick + h) if klick else None
    an = lambda key, d=True: eins.get(key, d)
    namen = {z["t"]: z["name"] for z in zeilen if z.get("t")}
    out = {}
    eq = [z for z in zeilen if z.get("t") and not z.get("manuell") and (z.get("art") or "EQUITY") == "EQUITY"]

    # --- je Aktie (Depot + Merkliste), höchstens 1x pro Tag, mit Zeitbudget
    cache = D.load(EXTRA_FILE, {})
    # Einführung: In den ersten 3 Stunden nur merken, nicht alles Alte auf einmal als Push schicken
    seit = cache.setdefault("_seit", D.NOW.isoformat())
    still = D.NOW - datetime.fromisoformat(seit) < timedelta(hours=3)
    erst_vorher = post.erstlauf
    if still:
        post.erstlauf = True
    ziele_t = list(dict.fromkeys([z["t"] for z in eq] + sorted(ctx["watch"])))[:70]
    start = time.time()
    for t in sorted(ziele_t, key=lambda t: (cache.get(t) or {}).get("_stand", "") if isinstance(cache.get(t), dict) else ""):
        e = cache.get(t)
        alter = D.NOW - datetime.fromisoformat(e["_stand"]) if e else None
        # Zahlen-Termin vorbei (bis 3 Tage), aber noch keine Zahlen geladen -> nach 2 Stunden erneut statt nach 20
        frisch = bool(e and e.get("naechste") and datetime.fromisoformat(e["naechste"]) <= D.NOW
                      and alter > timedelta(hours=2))
        if e and alter < timedelta(hours=20) and not frisch:
            continue
        if time.time() - start > 75:
            break
        try:
            cache[t] = _je_aktie(t)
        except Exception as ex:
            D.log("Zusatzdaten-Fehler", t, ex)
        time.sleep(0.3)
    D.save(EXTRA_FILE, cache)

    insider, quartal, analysten = [], [], []
    grenze_neu = (heute - timedelta(days=14)).isoformat()
    for t in ziele_t:
        e = cache.get(t) or {}
        nm = namen.get(t) or t
        if df is not None and not df.empty and t not in namen:
            m = df[df["t"] == t]
            nm = m["n"].iloc[0] if len(m) else t
        imdepot = t in namen
        for i in e.get("insider") or []:
            i = dict(i, t=t, name=nm, depot=imdepot)
            insider.append(i)
            if i["art"] == "Kauf" and (i.get("datum") or "") >= grenze_neu and (i.get("wert") or 0) >= 50000 and an("insider"):
                post.raus(f"ins|{t}|{i['datum']}|{i['wer']}", f"🕵️ Insider-Kauf: {nm}",
                          f"{i['wer']} ({i['position']}) hat für {D.de((i.get('wert') or 0) / 1e3, 0)} Tsd. $ eigene Aktien gekauft ({D.de(i.get('aktien') or 0, 0)} Stück). Manager kaufen meist nur, wenn sie an die Firma glauben.",
                          prio=3, tags=["detective"], klick=k("#depot"), art="insider", t=t)
        for a in e.get("analysten") or []:
            a = dict(a, t=t, name=nm, depot=imdepot)
            analysten.append(a)
        for q in e.get("quartal") or []:
            q = dict(q, t=t, name=nm, depot=imdepot)
            if t in serien and q.get("datum"):
                q["reaktion"] = _reaktion(serien[t], q["datum"])
            quartal.append(q)
            alt_tage = (heute - datetime.strptime(q["datum"], "%Y-%m-%d").date()).days if q.get("datum") else 99
            merk = (not imdepot) and t in ctx["watch"]
            # erst schicken, wenn die Kursreaktion feststeht (oder spätestens nach 2 Tagen)
            if (imdepot or merk) and alt_tage <= 4 and (q.get("reaktion") is not None or alt_tage >= 2) \
                    and an("quartal") and (imdepot or an("quartal_merkliste")):
                u = q.get("ueberraschung")
                urteil = "über den Erwartungen ✅" if (u or 0) > 2 else "unter den Erwartungen ❌" if (u or 0) < -2 else "im Rahmen der Erwartungen"
                txt = f"Gewinn je Aktie {D.de(q['eps_ist'])} statt erwartet {D.de(q['eps_erw']) if q.get('eps_erw') is not None else '–'}"
                if u is not None:
                    txt += f" ({D.de(u, 1, True)} %)"
                vj = [f"{w} {D.pc(q[k])}" for k, w in (("umsatz_yoy", "Umsatz"), ("gewinn_yoy", "Gewinn")) if q.get(k) is not None]
                if vj:
                    txt += ". Zum Vorjahresquartal: " + ", ".join(vj)
                if q.get("reaktion") is not None:
                    txt += f". Kursreaktion: {D.pc(q['reaktion'])}"
                post.raus(f"q|{t}|{q['datum']}", f"📑 {nm}: Zahlen {urteil}" + (" · Merkliste" if merk else ""), txt + ".", prio=3,
                          tags=["page_facing_up"], klick=k("#terminal-" + quote(f"{t} DES")) if merk else k("#depot"), art="quartal_mk" if merk else "quartal", t=t)
    insider.sort(key=lambda x: x.get("datum") or "", reverse=True)
    analysten.sort(key=lambda x: x.get("datum") or "", reverse=True)
    quartal.sort(key=lambda x: x.get("datum") or "", reverse=True)
    out["insider"] = insider[:60]
    out["analysten"] = analysten[:60]
    out["quartal"] = quartal[:80]

    # --- Analysten-Kursziel (Durchschnitt) deutlich geändert – auch für deutsche Aktien
    zk = D.load(ZIEL_FILE, {})
    aenderungen = []
    for z in eq:
        t, ziel = z["t"], D.num(z.get("ziel"))
        if not ziel:
            continue
        b = zk.get(t)
        if not b:
            zk[t] = {"wert": ziel, "datum": heute.isoformat()}
            continue
        ch = ziel / b["wert"] - 1
        if abs(ch) >= 0.07:
            aenderungen.append({"t": t, "name": z["name"], "alt": b["wert"], "neu": ziel, "pct": ch, "seit": b["datum"], "cur": z.get("cur")})
            if an("analysten"):
                post.raus(f"ziel|{t}|{heute.isoformat()}", f"🎯 Kursziel {'angehoben' if ch > 0 else 'gesenkt'}: {z['name']}",
                          f"Das durchschnittliche Analysten-Kursziel ist von {D.de(b['wert'])} auf {D.de(ziel)} {z.get('cur') or ''} gestiegen ({D.pc(ch)})."
                          if ch > 0 else f"Das durchschnittliche Analysten-Kursziel ist von {D.de(b['wert'])} auf {D.de(ziel)} {z.get('cur') or ''} gefallen ({D.pc(ch)}).",
                          prio=3, tags=["dart"], klick=k("#depot"), art="analysten", t=t)
            zk[t] = {"wert": ziel, "datum": heute.isoformat()}
        elif (heute - datetime.strptime(b["datum"], "%Y-%m-%d").date()).days > 45:
            zk[t] = {"wert": ziel, "datum": heute.isoformat()}
    D.save(ZIEL_FILE, zk)
    out["ziel_aenderungen"] = aenderungen

    # --- Dividenden-Erhöhungen und -Kürzungen (letzte Zahlung vs. vorige)
    divc = D.load(D.DIV_FILE, {})
    div_ae = []
    for z in zeilen:
        t = z.get("t")
        e = divc.get(t) if t else None
        if not e or len(e.get("z") or []) < 2:
            continue
        zahl = sorted(e["z"])
        (d1, b1), (d0, b0) = zahl[-1], zahl[-2]
        if not b0 or (heute - datetime.strptime(d1, "%Y-%m-%d").date()).days > 75:
            continue
        ch = b1 / b0 - 1
        if abs(ch) < 0.02:
            continue
        div_ae.append({"t": t, "name": z["name"], "datum": d1, "alt": b0, "neu": b1, "pct": ch, "cur": z.get("cur")})
        if an("div_aenderung"):
            post.raus(f"div|{t}|{d1}", f"{'📈 Dividende erhöht' if ch > 0 else '⚠️ Dividende gesenkt'}: {z['name']}",
                      f"{D.de(b0, 3)} → {D.de(b1, 3)} {z.get('cur') or ''} je Aktie ({D.pc(ch)}). Ex-Tag {datetime.strptime(d1, '%Y-%m-%d').strftime('%d.%m.%Y')}."
                      + (" Kann auch eine Sonderdividende sein." if abs(ch) > 0.5 else ""),
                      prio=3 if ch < 0 else 2, tags=["moneybag"], klick=k("#dividenden"), art="dividende", t=t)
    out["div_aenderungen"] = div_ae

    # --- Wirtschaftskalender (+ Erinnerung am Vorabend)
    try:
        wk = wirtschaftskalender()
    except Exception as ex:
        D.log("Wirtschaftskalender-Fehler:", ex)
        wk = []
    out["wirtschaft"] = wk
    if an("wirtschaft") and D.NOW.hour >= 16:
        berlin = timezone(timedelta(hours=1 if not _sommerzeit(D.NOW) else 2))
        morgen = (D.NOW.astimezone(berlin) + timedelta(days=1)).date()
        mo = [w for w in wk if w["wichtig"] and datetime.fromisoformat(w["zeit"]).astimezone(berlin).date() == morgen]
        if mo:
            post.raus(f"wirt|{morgen.isoformat()}", "📆 Morgen wichtig für die Börse",
                      "\n".join(f"{datetime.fromisoformat(w['zeit']).astimezone(berlin).strftime('%H:%M')} {LAND.get(w['land'], w['land'])} {w['titel']}"
                                + (f" (Prognose {w['prognose']})" if w.get("prognose") else "") for w in mo[:6]),
                      prio=2, tags=["calendar"], klick=k("#wirtschaft"), art="wirtschaft")

    # --- Klumpen über ETFs
    db = ctx.get("durchblick") or {}
    schwelle = (eins.get("klumpen_schwelle") or 10) / 100
    kl = [x for x in (db.get("top") or []) if x.get("anteil", 0) >= schwelle]
    out["klumpen"] = [{"name": x["name"], "anteil": x["anteil"], "wert": x["wert"], "direkt": x.get("direkt", 0)} for x in kl]
    if kl and an("klumpen"):
        for x in kl[:3]:
            post.raus(f"kl|{x['name']}|{woche}", f"🧱 Klumpenrisiko: {x['name']}",
                      f"{x['name']} macht direkt und über deine ETFs zusammen {D.de(x['anteil'] * 100, 1)} % deines Depots aus ({D.eur(x['wert'])}).",
                      prio=2, tags=["warning"], klick=k("#durchblick"), art="klumpen")

    # --- Rebalancing-Erinnerung
    zi = pf.get("ziele") or {}
    if zi.get("ziel") and not zi.get("_neu"):
        gesamt = sum(z.get("wert") or 0 for z in zeilen if (z.get("wert") or 0) > 0) or 1
        ist = {}
        for z in zeilen:
            if (z.get("wert") or 0) > 0:
                g = _gruppe(z, zi)
                ist[g] = ist.get(g, 0) + z["wert"]
        T = sum(float(v or 0) for v in zi["ziel"].values()) or 100
        sw = float(zi.get("schwelle") or 5)
        abw = []
        for g in set(ist) | set(zi["ziel"]):
            d = ist.get(g, 0) / gesamt * 100 - float(zi["ziel"].get(g) or 0) / T * 100
            abw.append({"gruppe": g, "ist": ist.get(g, 0) / gesamt, "ziel": float(zi["ziel"].get(g) or 0) / T, "pp": d})
        out["rebalancing"] = sorted(abw, key=lambda x: -abs(x["pp"]))
        gross = [a for a in abw if abs(a["pp"]) >= sw]
        if gross and an("rebalancing"):
            post.raus(f"reb|{woche}", "⚖️ Dein Depot weicht von deinen Zielen ab",
                      ", ".join(f"{a['gruppe']} {D.de(a['ist'] * 100, 0)} % statt {D.de(a['ziel'] * 100, 0)} %" for a in gross[:4])
                      + ". In der App siehst du, wohin die nächsten Euros sollten.", prio=2, tags=["scales"], klick=k("#umschichten"), art="rebalancing")

    # --- Steuer-Erinnerung im Dezember: Freibetrag noch nicht ausgeschöpft?
    st = pf.get("steuer") or {}
    frei = 2000 if st.get("verheiratet") else 1000
    genutzt = 0.0
    for z in zeilen:
        tf = 0.7 if (z.get("art") or "") in ("ETF", "MUTUALFUND") else 1.0
        genutzt += (z.get("div_bisher") or 0) * tf
    for td in ctx.get("div_termine") or []:
        if td["datum"][:4] == str(heute.year) and td["datum"] > heute.isoformat():
            zz = next((z for z in zeilen if z.get("id") == td.get("id")), None)
            genutzt += td["betrag"] * (0.7 if zz and (zz.get("art") or "") in ("ETF", "MUTUALFUND") else 1.0)
    genutzt += sum(D.num(v) or 0 for v in (st.get("gewinne") or {}).values())
    out["steuer_rest"] = {"frei": frei, "genutzt": genutzt, "rest": max(0.0, frei - genutzt)}
    if heute.month == 12 and heute.day <= 20 and frei - genutzt >= 50 and an("steuer_erinnerung"):
        post.raus(f"steuer|{heute.year}", f"🧾 Noch {D.eur(frei - genutzt)} steuerfrei in {heute.year}",
                  f"Dein Sparerpauschbetrag ist dieses Jahr erst zu etwa {D.de(genutzt / frei * 100, 0)} % genutzt. Den Rest kannst du bis 31.12. nutzen, z. B. "
                  "indem du Gewinne realisierst und die Anteile direkt wieder kaufst. Achte darauf, dass der Freistellungsauftrag beim jeweiligen Broker reicht.",
                  prio=3, tags=["receipt"], klick=k("#steuer"), art="steuer")

    # --- Börsen-Tagebuch: nach 3 Monaten und nach 1 Jahr nachfragen
    for e in pf.get("tagebuch") or []:
        try:
            d = datetime.strptime(e.get("datum"), "%Y-%m-%d").date()
        except Exception:
            continue
        alter = (heute - d).days
        for tage, wann in ((365, "einem Jahr"), (90, "drei Monaten")):
            if tage <= alter < tage + 21 and an("tagebuch"):
                t = e.get("t")
                s = serien.get(t) if t else None
                jetzt = float(s.dropna().iloc[-1]) if s is not None and len(s.dropna()) else None
                damals = D.num(e.get("kurs"))
                entw = f" Kurs damals {D.de(damals)}, heute {D.de(jetzt)} ({D.pc(jetzt / damals - 1)})." if jetzt and damals else ""
                post.raus(f"tb|{e.get('id')}|{tage}", f"📓 Vor {wann}: {e.get('name') or t}",
                          f"Deine These: „{(e.get('these') or '')[:180]}“.{entw} Stimmt sie noch?", prio=2, tags=["notebook"],
                          klick=k("#tagebuch"), art="tagebuch", t=t)
                break

    post.erstlauf = erst_vorher

    # --- Was wäre wenn (einmal am Tag neu)
    try:
        out["was_waere"] = was_waere(zeilen, ctx["cur_of"])
    except Exception as ex:
        D.log("Was-wäre-wenn-Fehler:", ex)
        out["was_waere"] = None
    return out


def _sommerzeit(n):
    """Mitteleuropäische Sommerzeit: letzter Sonntag im März bis letzter Sonntag im Oktober (je 01:00 UTC)."""
    def letzter_sonntag(j, m):
        d = datetime(j, m + 1, 1, tzinfo=timezone.utc) - timedelta(days=1) if m < 12 else datetime(j, 12, 31, tzinfo=timezone.utc)
        return (d - timedelta(days=(d.weekday() + 1) % 7)).replace(hour=1)
    return letzter_sonntag(n.year, 3) <= n < letzter_sonntag(n.year, 10)
