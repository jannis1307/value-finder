"""Value Finder – Fundamental-Charts (ähnlich Qualtrim).

US-Firmen: Jahreszahlen direkt aus den Pflichtveröffentlichungen bei der US-Börsenaufsicht SEC
(XBRL "companyfacts", kostenlos, meist ab ca. 2009). Alle anderen: Yahoo Finance (ca. 4–5 Jahre).
Dazu für alle: Monatskurse über 15 Jahre und Dividenden je Aktie pro Jahr.

Ergebnis: je Aktie eine kleine Datei web/f/<TICKER>.json, die die Website erst beim Öffnen lädt.
Jede Aktie wird höchstens alle 30 Tage neu geholt; pro Lauf gibt es ein Zeitbudget."""
import json
import os
import re
import shutil
import time
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.abspath(__file__))
STATE_DIR = os.path.join(ROOT, "state")
CACHE_DIR = os.path.join(STATE_DIR, "fin")
WEB_F = os.path.join(ROOT, "web", "f")
CIK_FILE = os.path.join(STATE_DIR, "sec_cik.json")
PRIO_FILE = os.path.join(STATE_DIR, "prio.json")
SEED_FILE = os.path.join(ROOT, "sec_seed.json")  # einmalig von der SEC geholte Jahreswerte (US-Aktien, ~15 Jahre)
NOW = datetime.now(timezone.utc)
# Die SEC verlangt einen User-Agent der Form "Name E-Mail"; mehrere Varianten, die erste funktionierende bleibt.
UAS = ["Jannis ValueFinder jannis1307@users.noreply.github.com",
       "Jannis jannis1307@users.noreply.github.com",
       "Mozilla/5.0 (compatible; ValueFinder/1.0; +https://jannis1307.github.io/value-finder) jannis1307@users.noreply.github.com"]
UA = {"User-Agent": UAS[0], "Accept-Encoding": "gzip, deflate", "Accept": "application/json"}

# XBRL-Begriffe (US-GAAP) je Kennzahl, in der Reihenfolge der Bevorzugung
TAGS = {
    "umsatz": ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet",
               "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueGoodsNet", "RevenuesNetOfInterestExpense"],
    "brutto": ["GrossProfit"],
    "operativ": ["OperatingIncomeLoss"],
    "gewinn": ["NetIncomeLoss", "ProfitLoss", "NetIncomeLossAvailableToCommonStockholdersBasic"],
    "eps": ["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted", "EarningsPerShareBasic"],
    "aktien": ["WeightedAverageNumberOfDilutedSharesOutstanding", "WeightedAverageNumberOfSharesOutstandingBasicAndDiluted",
               "WeightedAverageNumberOfSharesOutstandingBasic"],
    "ocf": ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"],
    "capex": ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"],
    "dps": ["CommonStockDividendsPerShareDeclared", "CommonStockDividendsPerShareCashPaid"],
    "dividenden": ["PaymentsOfDividendsCommonStock", "PaymentsOfDividends"],
    "rueckkauf": ["PaymentsForRepurchaseOfCommonStock"],
    "schulden": ["LongTermDebt", "LongTermDebtNoncurrent", "LongTermDebtAndCapitalLeaseObligations"],
    "cash": ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
    "eigenkapital": ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
}
STICHTAG = {"schulden", "cash", "eigenkapital"}  # Bilanzwerte (Zeitpunkt statt Zeitraum)


def log(*a):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] [Fundamental]", *a, flush=True)


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


def _datei(t):
    return re.sub(r"[^A-Za-z0-9._-]", "_", t) + ".json"


def _r(x, n=4):
    try:
        x = float(x)
        if not np.isfinite(x):
            return None
        return round(x, n) if abs(x) < 1e6 else round(x)
    except Exception:
        return None


# ---------------------------------------------------------------- SEC
def cik_liste(requests):
    c = _load(CIK_FILE, {})
    if c.get("_stand") and NOW - datetime.fromisoformat(c["_stand"]) < timedelta(days=7):
        return c.get("m", {})
    if c.get("_fehler") and NOW - datetime.fromisoformat(c["_fehler"]) < timedelta(hours=3):
        return c.get("m", {})
    for ua in UAS:
        try:
            h = dict(UA, **{"User-Agent": ua})
            r = requests.get("https://www.sec.gov/files/company_tickers.json", headers=h, timeout=30)
            if r.status_code == 200:
                m = {v["ticker"].upper(): int(v["cik_str"]) for v in r.json().values()}
                UA["User-Agent"] = ua
                _save(CIK_FILE, {"_stand": NOW.isoformat(), "m": m, "ua": ua})
                log(f"SEC-Tickerliste geladen ({len(m)} Firmen) mit UA-Variante {UAS.index(ua) + 1}")
                return m
            log("SEC-Tickerliste: HTTP", r.status_code, "UA", UAS.index(ua) + 1, "·", r.text[:120].replace("\n", " "))
        except Exception as e:
            log("SEC-Tickerliste-Fehler:", e)
    c["_fehler"] = NOW.isoformat()
    _save(CIK_FILE, c)
    return c.get("m", {})


def _jahreswerte(einheiten, stichtag):
    """Aus allen XBRL-Einträgen die Werte der Geschäftsjahre (10-K, ~12 Monate) je Jahr des Stichtags."""
    best = {}
    for unit, rows in einheiten.items():
        for e in rows:
            if not str(e.get("form", "")).startswith(("10-K", "20-F", "40-F")):
                continue
            end = e.get("end")
            if not end:
                continue
            if not stichtag:
                st = e.get("start")
                if not st:
                    continue
                tage = (datetime.fromisoformat(end) - datetime.fromisoformat(st)).days
                if not 340 <= tage <= 380:
                    continue
            elif e.get("fp") not in (None, "FY"):
                continue
            jahr = int(end[:4]) if int(end[5:7]) > 3 else int(end[:4]) - 1  # Geschäftsjahr bis März zählt zum Vorjahr
            alt = best.get(jahr)
            # bevorzugt: der zuletzt eingereichte Wert für genau dieses Periodenende
            if alt is None or (end, e.get("filed", "")) > (alt[0], alt[1]):
                best[jahr] = (end, e.get("filed", ""), e.get("val"))
    return {j: v[2] for j, v in best.items()}


def aus_sec(t, cik, requests):
    r = requests.get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json", headers=UA, timeout=40)
    if r.status_code != 200:
        raise RuntimeError(f"SEC HTTP {r.status_code}")
    facts = (r.json().get("facts") or {}).get("us-gaap") or {}
    reihen = {}
    for k, tags in TAGS.items():
        werte = {}
        for tag in tags:  # spätere Tags füllen nur Lücken (z. B. Umbenennung des Umsatz-Begriffs 2018)
            f = facts.get(tag)
            if not f:
                continue
            for j, v in _jahreswerte(f.get("units") or {}, k in STICHTAG).items():
                werte.setdefault(j, v)
        reihen[k] = werte
    return reihen


def lade_seed():
    try:
        with open(SEED_FILE) as f:
            d = json.load(f)
        return {t: {k: {int(j): v for j, v in r.items()} for k, r in reihen.items()} for t, reihen in (d.get("daten") or {}).items()}
    except Exception:
        return {}


def split_bereinigen(reihen, splits):
    """SEC-Altwerte stehen in der Aktienbasis ihres Berichtsjahres. Aktiensplits (Verhältnis aus Yahoo) werden am Sprung
    der Aktienanzahl erkannt; alle Jahre davor werden umgerechnet (Aktien × r, Gewinn/Dividende je Aktie ÷ r)."""
    r_ = {k: dict(v) for k, v in reihen.items()}
    for r in splits:
        if not r or r <= 0 or abs(r - 1) < 0.05:
            continue
        a = r_.get("aktien") or {}
        jahre = sorted(j for j in a if a[j])
        for y0, y1 in zip(jahre, jahre[1:]):
            q = a[y1] / a[y0]
            if 0.8 * r <= q <= 1.25 * r:
                for k, f in (("aktien", r), ("eps", 1 / r), ("dps", 1 / r)):
                    for j in list((r_.get(k) or {})):
                        if j <= y0 and r_[k][j] is not None:
                            r_[k][j] = r_[k][j] * f
                break
    return r_


def mischen(alt, neu):
    """SEC-Historie (alt) + aktuelle Yahoo-Jahre (neu): Yahoo füllt nur Jahre, die in der SEC-Reihe fehlen."""
    out = {}
    for k in set(TAGS) | set(alt) | set(neu):
        r = dict(alt.get(k) or {})
        for j, v in (neu.get(k) or {}).items():
            if j not in r and v is not None:
                r[j] = v
        out[k] = r
    return out


# ---------------------------------------------------------------- Yahoo (Ausweichquelle)
YF_ZEILEN = {
    "umsatz": ("income_stmt", ["Total Revenue", "Operating Revenue"]), "brutto": ("income_stmt", ["Gross Profit"]),
    "operativ": ("income_stmt", ["Operating Income"]), "gewinn": ("income_stmt", ["Net Income", "Net Income Common Stockholders"]),
    "eps": ("income_stmt", ["Diluted EPS", "Basic EPS"]), "aktien": ("income_stmt", ["Diluted Average Shares", "Basic Average Shares"]),
    "ocf": ("cashflow", ["Operating Cash Flow"]), "capex": ("cashflow", ["Capital Expenditure"]),
    "dividenden": ("cashflow", ["Cash Dividends Paid", "Common Stock Dividend Paid"]),
    "rueckkauf": ("cashflow", ["Repurchase Of Capital Stock", "Common Stock Payments"]),
    "schulden": ("balance_sheet", ["Long Term Debt", "Total Debt"]), "cash": ("balance_sheet", ["Cash And Cash Equivalents"]),
    "eigenkapital": ("balance_sheet", ["Stockholders Equity", "Common Stock Equity"]),
}


def aus_yahoo(tk):
    reihen = {k: {} for k in TAGS}
    tabellen = {}
    for name in ("income_stmt", "cashflow", "balance_sheet"):
        try:
            tabellen[name] = getattr(tk, name)
        except Exception:
            tabellen[name] = None
    for k, (tab, zeilen) in YF_ZEILEN.items():
        df = tabellen.get(tab)
        if df is None or df.empty:
            continue
        for z in zeilen:
            if z in df.index:
                for col in df.columns:
                    v = df.at[z, col]
                    if v is not None and not pd.isna(v):
                        d = pd.Timestamp(col)
                        jahr = d.year if d.month > 3 else d.year - 1
                        wert = float(v)
                        if k in ("capex", "dividenden", "rueckkauf"):
                            wert = abs(wert)
                        reihen[k].setdefault(jahr, wert)
                break
    return reihen


# ---------------------------------------------------------------- Kurse + Dividenden (für alle)
def kurse_dividenden(tk):
    kurs, dps = [], {}
    try:
        h = tk.history(period="15y", interval="1mo", auto_adjust=False)
        if h is not None and len(h):
            s = h["Close"].dropna()
            kurs = [[d.strftime("%Y-%m"), _r(v, 2)] for d, v in s.items()]
    except Exception as e:
        log("Kurs-Fehler:", e)
    try:
        d = tk.dividends
        if d is not None and len(d):
            for i, v in d.items():
                dps[i.year] = dps.get(i.year, 0.0) + float(v)
    except Exception:
        pass
    return kurs, dps


def aufbereiten(t, reihen, quelle, kurs, dps_yf, waehrung):
    jahre = sorted({j for r in reihen.values() for j in r} | set())
    jahre = [j for j in jahre if j >= NOW.year - 16 and j <= NOW.year]
    # nur Jahre, für die es Umsatz oder Gewinn gibt
    jahre = [j for j in jahre if j in reihen.get("umsatz", {}) or j in reihen.get("gewinn", {})]
    out = {"t": t, "quelle": quelle, "stand": NOW.strftime("%Y-%m-%d"), "cur": waehrung, "jahre": jahre}
    for k in TAGS:
        out[k] = [_r(reihen.get(k, {}).get(j)) for j in jahre]
    # abgeleitete Reihen
    out["fcf"] = [_r(o - abs(c)) if o is not None and c is not None else None for o, c in zip(out["ocf"], out["capex"])]
    out["fcf_ps"] = [_r(f / a, 4) if f is not None and a else None for f, a in zip(out["fcf"], out["aktien"])]
    for k, basis in (("bm", "brutto"), ("om", "operativ"), ("nm", "gewinn"), ("fcfm", "fcf")):
        out[k] = [_r(b / u, 4) if b is not None and u else None for b, u in zip(out[basis], out["umsatz"])]
    # Dividende je Aktie: aus den tatsächlichen Zahlungen (Yahoo, splitbereinigt) – das ist die Sicht des Anlegers
    dps_jahre = sorted(j for j in dps_yf if NOW.year - 16 <= j < NOW.year)
    out["dps_jahre"] = dps_jahre
    out["dps_yf"] = [_r(dps_yf[j], 4) for j in dps_jahre]
    out["dps_lfd"] = _r(dps_yf.get(NOW.year), 4)
    out["payout_fcf"] = [_r(d / f, 3) if d is not None and f and f > 0 else None for d, f in zip(out["dividenden"], out["fcf"])]
    out["payout_eps"] = [_r(d / e, 3) if d is not None and e and e > 0 else None for d, e in
                         zip([dps_yf.get(j) for j in jahre], out["eps"])]
    out["kurs"] = kurs[-181:]
    # KGV-Verlauf: Monatskurs / Gewinn je Aktie des letzten abgeschlossenen Geschäftsjahres
    eps_j = {j: e for j, e in zip(jahre, out["eps"]) if e}
    kgv = []
    for m, p in out["kurs"]:
        y = int(m[:4]) - 1
        e = eps_j.get(y)
        kgv.append([m, _r(p / e, 1) if e and e > 0 and p else None])
    out["kgv"] = kgv
    return out


# ---------------------------------------------------------------- Hauptfunktion
def run(df, budget_s=50):
    import requests
    import yfinance as yf
    os.makedirs(CACHE_DIR, exist_ok=True)
    prio = _load(PRIO_FILE, [])
    alle = []
    if df is not None and not df.empty:
        x = df[["t", "mcap"]].copy() if "mcap" in df.columns else df[["t"]].assign(mcap=0)
        alle = x.sort_values("mcap", ascending=False)["t"].tolist()
    reihenfolge = list(dict.fromkeys([t for t in prio if t] + alle))
    waehrung = dict(zip(df["t"], df["cur"])) if df is not None and not df.empty and "cur" in df.columns else {}

    def alter(t):
        p = os.path.join(CACHE_DIR, _datei(t))
        try:
            return (time.time() - os.path.getmtime(p)) / 86400
        except OSError:
            return 1e9
    ciks = cik_liste(requests)
    _c = _load(CIK_FILE, {})
    if _c.get("ua"):
        UA["User-Agent"] = _c["ua"]

    seed = lade_seed()

    def quelle_alt(t):
        return (_load(os.path.join(CACHE_DIR, _datei(t)), {}) or {}).get("quelle")
    # fällig: älter als 30 Tage – oder US-Aktie bisher nur aus Yahoo, obwohl SEC-Historie (15 J.) vorliegt
    faellig = [t for t in reihenfolge if alter(t) > 30 or
               (("." not in t) and (t.upper() in ciks or t in seed) and quelle_alt(t) == "Yahoo")]
    start, n_sec, n_yf = time.time(), 0, 0
    for t in faellig:
        if time.time() - start > budget_s:
            break
        if re.search(r"-(EUR|USD|USDT|BTC)$", t) or t.startswith("^") or "=" in t:  # Krypto, Indizes, Währungen
            continue
        try:
            tk = yf.Ticker(t)
            kurs, dps = kurse_dividenden(tk)
            reihen, quelle = None, "Yahoo"
            cik = ciks.get(t.upper()) if "." not in t else None
            if cik:
                try:
                    reihen = aus_sec(t, cik, requests)
                    if sum(len(v) for v in reihen.values()) < 5:
                        reihen = None
                    else:
                        quelle = "SEC"
                except Exception as e:
                    log("SEC-Fehler", t, e)
                time.sleep(0.15)  # SEC erlaubt höchstens 10 Anfragen pro Sekunde
            if reihen is None and t in seed:
                try:
                    splits = [float(x) for x in tk.splits.values]
                except Exception:
                    splits = []
                reihen, quelle = mischen(split_bereinigen(seed[t], splits), aus_yahoo(tk)), "SEC"
            if reihen is None:
                reihen = aus_yahoo(tk)
            out = aufbereiten(t, reihen, quelle, kurs, dps, waehrung.get(t) or ("EUR" if t.endswith(".DE") else "USD"))
            if not out["jahre"] and not out["kurs"]:
                out["leer"] = True
            _save(os.path.join(CACHE_DIR, _datei(t)), out)
            n_sec += quelle == "SEC"
            n_yf += quelle == "Yahoo"
        except Exception as e:
            if "Too Many Requests" in str(e) or "Rate" in str(e):
                log("Rate-Limit – Rest beim nächsten Lauf.")
                break
            log("Fehler", t, e)
    # alles Vorhandene auf die Website legen
    os.makedirs(WEB_F, exist_ok=True)
    n = 0
    for f in os.listdir(CACHE_DIR):
        if f.endswith(".json"):
            shutil.copy(os.path.join(CACHE_DIR, f), os.path.join(WEB_F, f))
            n += 1
    log(f"{n_sec} aus SEC, {n_yf} aus Yahoo neu geladen · {n} Aktien mit Fundamental-Charts · noch {max(0, len(faellig) - n_sec - n_yf)} offen")
