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
import re
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
EINZAHL_FILE = os.path.join(STATE_DIR, "depot_einzahl.json")  # Kaufwert (eingezahltes Geld) je Tag
DIV_FILE = os.path.join(STATE_DIR, "dividenden.json")
NEWS_FILE = os.path.join(STATE_DIR, "depot_news.json")

NOW = datetime.now(timezone.utc)

MARKT = [("^GDAXI", "DAX"), ("^GSPC", "S&P 500"), ("^NDX", "Nasdaq 100"), ("^STOXX50E", "Euro Stoxx 50"),
         ("URTH", "MSCI World"), ("EURUSD=X", "EUR/USD"), ("GC=F", "Gold"), ("BZ=F", "Öl (Brent)"),
         ("BTC-EUR", "Bitcoin")]

INFO_FELDER = ["longName", "shortName", "currency", "quoteType", "sector", "industry", "dividendRate",
               "dividendYield", "yield", "trailingAnnualDividendYield", "earningsTimestamp",
               "earningsTimestampStart", "exDividendDate", "targetMeanPrice", "numberOfAnalystOpinions"]


def log(*a):
    # Protokolle von GitHub Actions sind öffentlich lesbar: nur die feste Meldung ausgeben,
    # keine Ticker, ISINs, Beträge oder Fehlertexte (die Details stehen nie im Log).
    print(f"[{datetime.now().strftime('%H:%M:%S')}] [Depot]", str(a[0]) if a else "", flush=True)


def num(x):
    try:
        f = float(x)
        return None if (math.isnan(f) or math.isinf(f)) else f
    except Exception:
        return None


def _geheim(path):
    """Alles, was depot.py im Zwischenspeicher (state/) ablegt, verrät etwas über dein Depot -> verschlüsselt speichern."""
    return os.path.abspath(path).startswith(os.path.abspath(STATE_DIR) + os.sep)


def load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        if isinstance(d, dict) and d.get("v") == 1 and "ct" in d and "iv" in d and len(d) == 3:
            keys = schluessel_liste()
            if not keys:
                return default
            return _entschluesseln_mit(json.dumps(d), keys)
        return d
    except Exception:
        return default


def save(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    key = schluessel() if _geheim(path) else None
    with open(path, "w", encoding="utf-8") as f:
        if key:
            f.write(verschluesseln(key, obj))
        else:
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


def schluessel_liste():
    """Neuer Schlüssel (PORTFOLIO_KEY_NEU) zuerst, der alte nur noch zum Lesen alter Dateien."""
    out = []
    for name in ("PORTFOLIO_KEY_NEU", "PORTFOLIO_KEY"):
        k = os.environ.get(name, "").strip()
        if k:
            try:
                b = b64d(k)
                if len(b) == 32 and b not in out:
                    out.append(b)
            except Exception:
                pass
    return out


def schluessel():
    L = schluessel_liste()
    return L[0] if L else None


def _entschluesseln_mit(text, keys):
    letzter = None
    for k in keys:
        try:
            return entschluesseln(k, text)
        except Exception as e:
            letzter = e
    raise letzter or ValueError("kein Schlüssel")


def umschluesseln():
    """Nach einem Schlüsselwechsel: alle verschlüsselten Zwischenspeicher-Dateien mit dem neuen Schlüssel neu speichern."""
    L = schluessel_liste()
    if len(L) < 2:
        return 0
    n = 0
    for wurzel, _, dateien in os.walk(STATE_DIR):
        for f in dateien:
            if not f.endswith(".json"):
                continue
            p = os.path.join(wurzel, f)
            try:
                with open(p, encoding="utf-8") as fh:
                    roh = fh.read()
                d = json.loads(roh)
                if not (isinstance(d, dict) and d.get("v") == 1 and "ct" in d and "iv" in d and len(d) == 3):
                    continue
                try:
                    entschluesseln(L[0], roh)
                    continue          # schon mit dem neuen Schlüssel
                except Exception:
                    pass
                inhalt = _entschluesseln_mit(roh, L[1:])
                save(p, inhalt)
                n += 1
            except Exception:
                pass
    return n


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
        self.diskret = True   # Push zeigt nur „Neue Nachricht“, Details nur verschlüsselt in der App

    DISKRET_TITEL = {"alarm": "Kursalarm", "dividende": "Dividende", "termin": "Termin", "wochenbericht": "Wochenbericht",
                     "zusammenfassung": "Tagesbericht", "markt": "Markt", "steuer": "Steuer", "sparplan": "Sparplan"}

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
            if self.diskret:   # ntfy/Telegram sehen keinen Inhalt
                titel = "Value Finder · " + self.DISKRET_TITEL.get(art, "Neuigkeit")
                text, tags = "Neue Nachricht – tippe, um sie in der App zu sehen.", ["bell"]
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


# ---------------------------------------------------------------- Echter Verlauf aus Broker-Transaktionen
EUR_BOERSEN = (".DE", ".F", ".MU", ".BE", ".SG", ".DU", ".HM", ".HA", ".AS", ".PA", ".MI", ".MC", ".BR", ".VI", ".LS", ".HE", ".IR", "-EUR")
SC_KAUF = {"Buy", "Savings plan", "Reinvestment_Distribution"}


def _f(x):
    try:
        return float(x) if x not in (None, "") else 0.0
    except (TypeError, ValueError):
        return 0.0


def tx_normal(r):
    """Eine Buchung (Scalable oder Trade Republic) -> (Wertpapier, Stück-Änderung, investiert, Ertrag, Handelskurs).
    investiert: Geld, das in Wertpapiere fließt (+ Kauf inkl. Gebühr, − Verkaufserlös). Ertrag: Dividenden/Anleihezinsen netto."""
    br, typ = r.get("br"), r.get("typ")
    if br == "Scalable":
        if r.get("s", "Executed") != "Executed":
            return None
        if typ in SC_KAUF and r.get("isin"):
            return (r["isin"], abs(_f(r.get("stk"))), -_f(r.get("betrag")) + _f(r.get("gebuehr")), 0.0, _f(r.get("kurs")))
        if typ == "Sell" and r.get("isin"):
            return (r["isin"], -abs(_f(r.get("stk"))), -(_f(r.get("betrag")) - _f(r.get("gebuehr")) - _f(r.get("steuer"))), 0.0, _f(r.get("kurs")))
        if typ == "Distribution":
            return (None, 0.0, 0.0, _f(r.get("betrag")), 0.0)
        return None
    if br == "Trade Republic":
        kat, ac, sym = r.get("kat"), r.get("ac") or "", r.get("isin")
        if ac == "SYNTHETIC":
            return None
        wp = (sym + "-EUR") if (ac == "CRYPTO" and sym) else sym
        if kat == "TRADING" and typ in ("BUY", "SELL") and wp:
            stk, kurs = _f(r.get("stk")), _f(r.get("kurs"))
            betrag = _f(r.get("betrag")) if r.get("betrag") not in (None, "") else -stk * kurs
            netto = betrag + _f(r.get("gebuehr")) + _f(r.get("steuer"))   # Gebühr/Steuer sind negativ
            return (wp, stk, -netto, 0.0, kurs)
        if kat == "DELIVERY" and wp:   # z. B. Krypto-Gutschrift ohne Zahlung
            stk, kurs = _f(r.get("stk")), _f(r.get("kurs"))
            return (wp, stk, stk * kurs, 0.0, kurs)
        if typ in ("DIVIDEND", "INTEREST_PAYMENT") and (sym or typ == "DIVIDEND"):
            return (None, 0.0, 0.0, _f(r.get("betrag")) + _f(r.get("steuer")), 0.0)
        return None
    return None


def _kurse_roh(tickers, start):
    """Tägliche Schlusskurse OHNE Dividenden-Bereinigung (für historische Depotwerte)."""
    import yfinance as yf
    out = {}
    for t in tickers:
        try:
            h = yf.Ticker(t).history(start=start, interval="1d", auto_adjust=False)
            s = pd.to_numeric(h["Close"], errors="coerce").dropna()
            if len(s):
                idx = s.index.tz_localize(None) if getattr(s.index, "tz", None) is not None else s.index
                out[t] = pd.Series(s.values, index=pd.DatetimeIndex(idx).normalize())
        except Exception as e:
            log("Kursverlauf-Fehler", t, e)
    return out


def tx_verlauf(pf, rcache):
    """Rekonstruiert aus den importierten Transaktionen (Scalable, Trade Republic) den echten Wertpapier-Verlauf je Tag:
    Wert der Wertpapiere, netto investiertes Geld, erhaltene Dividenden, dieselben Geldflüsse im MSCI World
    und die zeitgewichtete Rendite (rechnet Käufe/Verkäufe heraus, zählt Dividenden mit)."""
    roh_rows = [r for r in (pf.get("transaktionen") or []) if r.get("d")]
    rows = []
    for r in roh_rows:
        n = tx_normal(r)
        if n:
            rows.append((r["d"], r.get("z", ""), n, r.get("br")))
    if not rows:
        return None
    rows.sort(key=lambda x: (x[0], x[1]))
    start = pd.Timestamp(rows[0][0])
    heute = pd.Timestamp(NOW.strftime("%Y-%m-%d"))
    tage = pd.bdate_range(start, heute)
    if heute not in tage:
        tage = tage.append(pd.DatetimeIndex([heute]))
    wps = sorted({n[0] for _, _, n, _ in rows if n[0]})
    tick = {w: (w if w.endswith("-EUR") else isin_aufloesen(w, rcache)) for w in wps}
    save(RESOLVE_FILE, rcache)
    roh = _kurse_roh([t for t in tick.values() if t] + ["EUNL.DE"], (start - pd.Timedelta(days=10)).strftime("%Y-%m-%d"))
    preise, quelle, serie = {}, {}, {}
    for w in wps:
        t = tick.get(w)
        s = roh.get(t) if t else None
        if s is not None and t and not t.endswith(EUR_BOERSEN):
            try:
                import yfinance as yf
                cur = yf.Ticker(t).fast_info.get("currency") or "USD"
                s = zu_eur(s, cur, fx_reihen({cur}))
            except Exception:
                s = None
        tp = {}
        for d, _, n, _ in rows:
            if n[0] == w and n[4] > 0:
                tp[pd.Timestamp(d)] = n[4]
        # Abgleich mit den echten Handelspreisen: falscher Börsenplatz/Einheit wird erkannt
        if s is not None and len(s) and tp:
            ver = [k / v for d, k in tp.items() if d >= s.index[0] and (v := s.asof(d)) and v > 0]
            if ver:
                f = float(np.median(ver))
                if 0.85 < f < 1.15:
                    pass
                elif 0.5 < f < 2:
                    s = s * f
                else:
                    s = None   # z. B. Anleihe in Prozent notiert -> lieber echte Handelspreise
            else:
                s = None       # nicht mit echten Käufen abgleichbar -> nicht vertrauen
        if s is None or not len(s):
            s = pd.Series(tp, dtype=float).sort_index() if tp else None
            quelle[w] = "Handelspreis"
        else:
            quelle[w] = t
        serie[w] = s if s is not None and len(s) else None
        preise[w] = s.reindex(s.index.union(tage)).ffill().bfill().reindex(tage) if s is not None and len(s) else None
    msci = roh.get("EUNL.DE")
    msci = msci.reindex(msci.index.union(tage)).ffill().bfill().reindex(tage) if msci is not None else None

    stk, inv, ertrag, m_anteile = {}, 0.0, 0.0, 0.0
    out_d, out_w, out_e, out_m, out_div = [], [], [], [], []
    twr, twr_m, w_vor, m_vor = 1.0, 1.0, None, None
    j = 0
    for tag in tage:
        fl_inv, fl_ert = 0.0, 0.0
        while j < len(rows) and pd.Timestamp(rows[j][0]) <= tag:
            w, dst, dinv, dert, _ = rows[j][2]; j += 1
            if w:
                stk[w] = stk.get(w, 0.0) + dst
            fl_inv += dinv
            fl_ert += dert
        inv += fl_inv
        ertrag += fl_ert
        wert = sum(n * float(preise[w].loc[tag]) for w, n in stk.items() if abs(n) > 1e-9 and preise.get(w) is not None)
        fluss = fl_inv - fl_ert   # Geld rein in Wertpapiere minus ausgeschüttete Erträge
        if w_vor and w_vor > 1:
            twr *= (wert - fluss) / w_vor
        if msci is not None:
            mp = float(msci.loc[tag])
            m_anteile += fluss / mp if mp else 0
            mw = m_anteile * mp
            if m_vor and m_vor > 1:
                twr_m *= (mw - fluss) / m_vor
            m_vor = mw
            out_m.append(round(mw, 2))
        w_vor = wert
        out_d.append(tag.strftime("%Y-%m-%d")); out_w.append(round(wert, 2)); out_e.append(round(inv, 2)); out_div.append(round(ertrag, 2))
    jetzt = {w: round(n, 6) for w, n in stk.items() if abs(n) > 1e-6}
    brs = sorted({b or "?" for _, _, _, b in rows})
    try:
        analysen = tx_analysen(roh_rows, serie, tick, quelle, out_d, out_w, out_e, out_div, out_m if msci is not None else None)
    except Exception as e:
        log("Transaktions-Auswertung-Fehler: " + type(e).__name__)
        analysen = None
    log(f"Transaktionen ({', '.join(brs)}): {len(rows)} Buchungen ausgewertet")  # keine Beträge: Protokolle sind öffentlich
    return {"a": analysen, "daten": out_d, "wert": out_w, "eingezahlt": out_e, "msci": out_m if msci is not None else None,
            "dividenden": out_div, "twr": round(twr - 1, 5), "twr_msci": round(twr_m - 1, 5) if msci is not None else None,
            "stuecke": jetzt, "ticker": tick, "quelle": quelle, "broker": brs, "seit": out_d[0], "n": len(rows)}


# ================================================================ Auswertungen aus den Transaktionen
BR_NAME = {"Scalable": "Scalable Capital"}
ETF_WORTE = re.compile(r"(\bETF\b|UCITS|iShares|Vanguard|Xtrackers|Amundi|SPDR|Invesco|Lyxor|WisdomTree|VanEck|\bMSCI\b|S&P 500|FTSE|Stoxx|\(Acc\)|\(Dist\))", re.I)
CRASH_FILE = os.path.join(STATE_DIR, "crash.json")
KRISEN = [("Finanzkrise 2008", "2007-10-09", "2009-03-09"), ("Corona-Crash 2020", "2020-02-19", "2020-03-23"),
          ("Zinsschock 2022", "2022-01-03", "2022-10-12")]


def _steuer_bezahlt(r):
    s = _f(r.get("steuer"))
    return -s if r.get("br") == "Trade Republic" else s


def tx_analysen(roh_rows, serie, tick, quelle, daten, wert, eing, divi, msci):
    """Gebühren, Erträge, FIFO-Gewinne, offene Kauf-Posten, Kaufzeitpunkte, Verkäufe und Jahresrückblicke."""
    from collections import defaultdict, deque
    eintr = []
    for r in roh_rows:
        if r.get("br") == "Scalable" and r.get("s", "Executed") != "Executed":
            continue
        eintr.append((r["d"], r.get("z", ""), r, tx_normal(r)))
    eintr.sort(key=lambda x: (x[0], x[1]))
    namen = {}
    for _, _, r, n in eintr:
        w = (n[0] if n and n[0] else None) or r.get("isin")
        if w and r.get("name"):
            namen[w] = r["name"]
    nm = lambda w: namen.get(w) or w
    krypto = lambda w: bool(w) and w.endswith("-EUR")
    etf = lambda w: bool(ETF_WORTE.search(nm(w) or ""))
    tf = lambda w: 0.7 if etf(w) else 1.0          # Teilfreistellung Aktien-ETF (Annahme: Aktienfonds)

    def kurs_heute(w):
        s = serie.get(w)
        return float(s.iloc[-1]) if s is not None and len(s) else None

    geb = defaultdict(lambda: defaultdict(lambda: {"geb": 0.0, "n": 0, "vol": 0.0, "extra": 0.0}))
    ert = defaultdict(lambda: defaultdict(lambda: {"div": 0.0, "div_stpfl": 0.0, "zins": 0.0, "real": 0.0, "real_stpfl": 0.0,
                                                   "krypto": 0.0, "steuer": 0.0}))
    trades, kaeufe, verk = [], [], []
    div_mon, div_wp = defaultdict(float), defaultdict(lambda: defaultdict(float))
    lots = defaultdict(deque)
    div_buch = []
    jahr_n = defaultdict(lambda: {"kaeufe": 0, "verkaeufe": 0, "div_n": 0, "inv": defaultdict(float)})

    for d, _, r, n in eintr:
        br = BR_NAME.get(r.get("br"), r.get("br") or "?")
        y = d[:4]
        typ = r.get("typ")
        g = ert[br][y]
        if r.get("br") == "Scalable" and typ == "Fee":
            geb[br][y]["extra"] += abs(_f(r.get("betrag")))
            continue
        if r.get("br") == "Scalable" and typ == "Taxes":
            g["steuer"] += -_f(r.get("betrag"))     # Abbuchung negativ = gezahlt
            continue
        if r.get("br") == "Scalable" and typ == "Interest":
            g["zins"] += _f(r.get("betrag"))
            continue
        if not n:
            continue
        w, dst, dinv, dert, kurs = n
        sb = _steuer_bezahlt(r)
        g["steuer"] += sb
        if w and dst:   # Handel
            fee = abs(_f(r.get("gebuehr")))
            vol = abs(dst) * kurs if kurs else abs(_f(r.get("betrag")))
            gg = geb[br][y]
            gg["geb"] += fee; gg["n"] += 1; gg["vol"] += vol
            trades.append({"d": d, "name": nm(w), "br": br, "art": "Kauf" if dst > 0 else "Verkauf", "vol": round(vol, 2),
                           "geb": round(fee, 2), "pct": round(fee / vol, 5) if vol > 0 else None,
                           "sp": typ in ("Savings plan", "Reinvestment_Distribution")})
            key = (br, w)
            if dst > 0:
                jahr_n[y]["kaeufe"] += 1
                jahr_n[y]["inv"][w] += max(dinv, 0)
                lots[key].append([dst, (dinv / dst) if dst else kurs, d])
                if kurs > 0:
                    kaeufe.append({"d": d, "w": w, "br": br, "kurs": kurs, "sp": typ in ("Savings plan", "Reinvestment_Distribution")})
            else:
                jahr_n[y]["verkaeufe"] += 1
                menge, kosten, alt_tage = -dst, 0.0, []
                while menge > 1e-9 and lots[key]:
                    lo = lots[key][0]
                    nimm = min(menge, lo[0])
                    kosten += nimm * lo[1]
                    alt_tage.append(((pd.Timestamp(d) - pd.Timestamp(lo[2])).days, nimm))
                    lo[0] -= nimm; menge -= nimm
                    if lo[0] <= 1e-9:
                        lots[key].popleft()
                erloes = -dinv + sb          # nach Gebühr, vor Steuer
                gew = erloes - kosten if menge <= 1e-6 else None
                if gew is not None:
                    if krypto(w):
                        # privates Veräußerungsgeschäft: nach über 1 Jahr Haltedauer steuerfrei
                        g["krypto"] += sum(gew * nimm / (-dst) for tage, nimm in alt_tage if tage <= 365)
                    else:
                        g["real"] += gew
                        g["real_stpfl"] += gew * tf(w)
                kh = kurs_heute(w)
                verk.append({"d": d, "name": nm(w), "br": br, "stk": round(-dst, 6), "erloes": round(erloes, 2),
                             "kosten": round(kosten, 2) if gew is not None else None, "gewinn": round(gew, 2) if gew is not None else None,
                             "heute": round(-dst * kh, 2) if kh else None, "kurs_verk": kurs, "kurs_heute": kh})
        elif dert:      # Dividende / Zins
            brutto = dert + max(sb, 0)
            w2 = w or r.get("isin")
            if r.get("typ") == "INTEREST_PAYMENT":
                g["zins"] += brutto
            else:
                g["div"] += brutto
                g["div_stpfl"] += brutto * tf(w2)
            div_mon[d[:7]] += dert
            div_wp[w2 or "?"][y] += dert
            div_buch.append([d, nm(w2), round(brutto, 2), round(dert, 2)])
            jahr_n[y]["div_n"] += 1

    # offene Kauf-Posten je Broker und Wertpapier (für den Steuerrechner)
    offen = []
    for (br, w), dq in lots.items():
        L = [[lo[2], round(lo[0], 6), round(lo[1], 4)] for lo in dq if lo[0] > 1e-9]
        if not L:
            continue
        offen.append({"w": w, "br": br, "name": nm(w), "etf": etf(w), "krypto": krypto(w), "t": tick.get(w),
                      "stk": round(sum(x[1] for x in L), 6), "kurs": kurs_heute(w), "lots": L[-80:]})
    offen.sort(key=lambda o: -((o["kurs"] or 0) * o["stk"]))

    # Kaufzeitpunkte: Kaufkurs gegen den Schnitt der 30 Tage davor
    kz = []
    for k in kaeufe:
        s = serie.get(k["w"])
        if s is None or quelle.get(k["w"]) == "Handelspreis":
            continue
        t = pd.Timestamp(k["d"])
        f = s[(s.index < t) & (s.index >= t - pd.Timedelta(days=30))]
        if len(f) < 10:
            continue
        avg, lo_, hi_ = float(f.mean()), float(f.min()), float(f.max())
        if avg <= 0:
            continue
        kz.append({"d": k["d"], "name": nm(k["w"]), "br": k["br"], "sp": k["sp"], "kurs": round(k["kurs"], 4),
                   "avg": round(avg, 4), "pct": round(k["kurs"] / avg - 1, 4),
                   "lage": round((k["kurs"] - lo_) / (hi_ - lo_), 3) if hi_ > lo_ else None})

    # Jahresrückblick („Wrapped“)
    wrapped = []
    jahre = sorted({d[:4] for d in daten})
    for y in jahre:
        idx = [i for i, d in enumerate(daten) if d[:4] == y]
        i1 = idx[-1]
        i0 = idx[0] - 1 if idx[0] > 0 else None
        w0, e0, d0 = (wert[i0], eing[i0], divi[i0]) if i0 is not None else (0.0, 0.0, 0.0)
        w1, e1, d1 = wert[i1], eing[i1], divi[i1]
        gew = (w1 - w0) - (e1 - e0) + (d1 - d0)
        basis = w0 + max(0.0, e1 - e0)
        m = None
        if msci:
            m0 = msci[i0] if i0 is not None else 0.0
            m = (msci[i1] - m0) - ((e1 - e0) - (d1 - d0))
        # beste/schlechteste Werte des Jahres (Kursentwicklung, ab Jahresanfang oder erstem Kauf)
        perf = []
        start_y, end_y = pd.Timestamp(f"{y}-01-01"), pd.Timestamp(daten[i1])
        for w, s in serie.items():
            if s is None or not len(s):
                continue
            kauf1 = min((pd.Timestamp(k["d"]) for k in kaeufe if k["w"] == w), default=None)
            if kauf1 is None or kauf1 > end_y:
                continue
            a = max(start_y, kauf1)
            try:
                pa, pe = float(s.asof(a)), float(s.asof(end_y))
            except Exception:
                continue
            if pa and pa > 0 and pe == pe and pa == pa:
                perf.append((pe / pa - 1, nm(w)))
        perf.sort()
        ij = max(idx, key=lambda i: wert[i])
        inv = jahr_n[y]["inv"]
        top = max(inv, key=inv.get) if inv else None
        gsum = sum(geb[b][y]["geb"] + geb[b][y]["extra"] for b in geb)
        wrapped.append({"jahr": y, "von": daten[idx[0]], "bis": daten[i1], "wert0": round(w0, 2), "wert1": round(w1, 2),
                        "investiert": round(e1 - e0, 2), "dividenden": round(d1 - d0, 2), "gewinn": round(gew, 2),
                        "pct": round(gew / basis, 4) if basis > 1 else None, "msci_gewinn": round(m, 2) if m is not None else None,
                        "msci_pct": round(m / basis, 4) if (m is not None and basis > 1) else None,
                        "gebuehren": round(gsum, 2), "kaeufe": jahr_n[y]["kaeufe"], "verkaeufe": jahr_n[y]["verkaeufe"],
                        "div_n": jahr_n[y]["div_n"], "hoch": round(wert[ij], 2), "hoch_d": daten[ij],
                        "best": [{"name": n_, "pct": round(p, 4)} for p, n_ in perf[::-1][:3]],
                        "worst": [{"name": n_, "pct": round(p, 4)} for p, n_ in perf[:3] if p < 0],
                        "top_kauf": {"name": nm(top), "betrag": round(inv[top], 2)} if top else None})

    rund = lambda dd: {b: {y: {k: round(v, 2) if isinstance(v, float) else v for k, v in x.items()} for y, x in yy.items()} for b, yy in dd.items()}
    trades_teuer = sorted([t for t in trades if t["geb"] > 0 and t["pct"]], key=lambda t: -t["pct"])[:10]
    return {"gebuehren": rund(geb), "ertraege": rund(ert), "teuer": trades_teuer,
            "n_trades": len(trades), "n_gratis": sum(1 for t in trades if not t["geb"]),
            "offen": offen, "kaufzeit": kz[-250:], "verkaeufe": verk[::-1][:100],
            "div_monate": {k: round(v, 2) for k, v in sorted(div_mon.items())},
            "div_buch": div_buch[-800:],
            "div_wp": [{"name": nm(w), "jahre": {y: round(v, 2) for y, v in sorted(yy.items())}} for w, yy in div_wp.items()],
            "wrapped": wrapped}


def crash_test(zeilen):
    """Wie wären deine heutigen Positionen durch echte Krisen gekommen? (Kurse in Handelswährung, ohne Dividenden)"""
    cache = load(CRASH_FILE, {})
    r_t = cache.get("r", {})
    tick = sorted({z["t"] for z in zeilen if z.get("t") and not z.get("manuell") and (z.get("wert") or 0) > 0})
    neu = [t for t in tick + ["URTH", "^GSPC"] if t not in r_t]
    if neu:
        roh = _kurse_roh(neu, "2007-09-01")
        for t in neu:
            s = roh.get(t)
            e = {}
            for name, a, b in KRISEN:
                ta, tb = pd.Timestamp(a), pd.Timestamp(b)
                if s is None or not len(s) or s.index[0] > ta + pd.Timedelta(days=7):
                    continue
                pa, pb = float(s.asof(ta)), float(s.asof(tb))
                if pa > 0 and pb > 0:
                    e[name] = round(pb / pa - 1, 4)
                    nach = s[s.index > tb]
                    erholt = nach[nach >= pa]
                    e[name + "|erholt"] = (erholt.index[0] - tb).days if len(erholt) else None
            r_t[t] = e
        save(CRASH_FILE, {"r": r_t})
    gesamt = sum((z.get("wert") or 0) for z in zeilen if (z.get("wert") or 0) > 0)
    if gesamt <= 0:
        return None
    out = []
    for name, a, b in KRISEN:
        bench_t = "URTH" if name in r_t.get("URTH", {}) else "^GSPC"
        bench = r_t.get(bench_t, {}).get(name)
        if bench is None:
            continue
        pos, verlust, echt = [], 0.0, 0.0
        for z in zeilen:
            wv = z.get("wert") or 0
            if wv <= 0:
                continue
            p = r_t.get(z.get("t"), {}).get(name) if z.get("t") and not z.get("manuell") else None
            ist = p is not None
            if p is None:
                p = 0.0 if (z.get("sektor") in ("Cash", "Tagesgeld") or "Overnight" in (z.get("name") or "")) else bench
            verlust += wv * p
            echt += wv if ist else 0
            pos.append({"name": z.get("name"), "pct": p, "eur": round(wv * p, 2), "echt": ist})
        pos.sort(key=lambda x: x["pct"])
        out.append({"name": name, "von": a, "bis": b, "depot_pct": round(verlust / gesamt, 4), "verlust": round(verlust, 2),
                    "markt": bench, "markt_name": "MSCI World" if bench_t == "URTH" else "S&P 500",
                    "markt_erholt_tage": r_t.get(bench_t, {}).get(name + "|erholt"), "abdeckung": round(echt / gesamt, 3),
                    "pos": pos[:6] + [x for x in pos[-3:] if x not in pos[:6]]})
    return {"wert": round(gesamt, 2), "szenarien": out}


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


# ================================================================ Merkliste & Gesamtmarkt
def markt_und_merkliste(post, neue, dcfg, klick, eins, watch, depot_t, df):
    """umfang: "depot" = nur eigenes Depot, "merkliste" = Depot + Merkliste, "markt" = zusätzlich ganzer Markt."""
    umfang = eins.get("umfang", "markt")
    ohne = [x for x in neue if x["typ"] == "ohne_grund" and x["t"] not in depot_t]

    def bew(a):
        return pc(a["r1d"]) + " heute" if a["art"] == "1d" else pc(a["r5d"]) + " in 5 Tagen"

    gemeldet = set()
    if umfang in ("merkliste", "markt"):
        for a in [x for x in ohne if x["t"] in watch]:
            gemeldet.add(a["t"])
            post.raus(f"markt|{a['id']}", f"👀 {a['n']} {bew(a)}",
                      f"Auf deiner Merkliste: kein erkennbarer Grund gefunden, {de(abs(a['rel'])*100, 1)} Pp. schlechter als die Branche.",
                      prio=4, tags=["eyes"], klick=(klick + "#alarme") if klick else None, art="merkliste", t=a["t"])
        if df is not None and not df.empty and watch:
            tm, tp = eins.get("tag_minus", -5) / 100, eins.get("tag_plus", 8) / 100
            for r in df[df["t"].isin(list(set(watch) - set(depot_t) - gemeldet))].to_dict("records"):
                r1 = num(r.get("r1d"))
                if r1 is None or not (r1 <= tm or r1 >= tp):
                    continue
                sc = num(r.get("score"))
                post.raus(f"wbew|{r['t']}|{r['datum']}|{'m' if r1 < 0 else 'p'}", f"👀 {r['n']} {pc(r1)}",
                          f"Auf deiner Merkliste. Kurs {de(r['p'])} {r['cur']}." + (f" Chancen-Score {sc:.0f}." if sc is not None else ""),
                          prio=3, tags=["eyes"], klick=klick, art="merkliste", t=r["t"])
    if umfang == "markt" and dcfg.get("markt_alarme", True):
        for a in [x for x in ohne if x["t"] not in watch][: dcfg.get("max_markt_alarme", 3)]:
            post.raus(f"markt|{a['id']}", f"⚠️ {a['n']} {bew(a)}",
                      f"Kein erkennbarer Grund gefunden. {de(abs(a['rel'])*100, 1)} Pp. schlechter als die Branche."
                      + (f" Chancen-Score {a['score']:.0f}." if a.get("score") is not None else ""),
                      prio=3, tags=["chart_with_downwards_trend"], klick=(klick + "#alarme") if klick else None,
                      art="markt", t=a["t"])


# ================================================================ Dividenden-Kalender
def dividenden_kalender(zeilen, fx_jetzt):
    """Dividenden der letzten 12 Monate je Position (Yahoo: Ex-Tag + Betrag je Aktie) und Hochrechnung
    der nächsten 12 Monate. Ein von Yahoo gemeldeter kommender Ex-Tag gilt als "bestätigt"."""
    import yfinance as yf
    cache = load(DIV_FILE, {})
    monate = [0.0] * 12
    termine, info = [], []
    heute = NOW.date()
    for z in zeilen:
        t = z.get("t")
        if not t or z.get("manuell") or not z.get("stk") or not z.get("wert") or (z.get("art") or "") == "CRYPTOCURRENCY":
            continue
        e = cache.get(t)
        if not e or NOW - datetime.fromisoformat(e["_stand"]) > timedelta(hours=20):
            try:
                d = yf.Ticker(t).dividends
                if d is not None and len(d):
                    idx = d.index.tz_convert("UTC") if d.index.tz is not None else d.index.tz_localize("UTC")
                    d = d[idx >= pd.Timestamp(NOW) - pd.Timedelta(days=760)]
                else:
                    d = pd.Series(dtype=float)
                e = {"_stand": NOW.isoformat(), "z": [[i.strftime("%Y-%m-%d"), float(v)] for i, v in d.items()]}
            except Exception as ex:
                log("Dividenden-Fehler", t, ex)
                e = {"_stand": NOW.isoformat(), "z": []}
            cache[t] = e
            time.sleep(0.2)
        cur = z.get("cur") or "EUR"
        fxn = fx_jetzt.get(cur, 1.0) if cur != "EUR" else 1.0
        faktor = z["stk"] / fxn  # fx für GBp enthält schon den Faktor 100 (Pence)
        zahl = [(datetime.strptime(dd, "%Y-%m-%d").date(), b) for dd, b in e["z"]]
        zahl = [(dd, b) for dd, b in zahl if dd > heute - timedelta(days=365)]
        exd = z.get("exd")
        exd = datetime.fromtimestamp(exd, tz=timezone.utc).date() if exd else None
        exd_offen = bool(exd and exd >= heute)
        jahr = 0.0
        z["div_bisher"] = sum(b * faktor for dd, b in zahl if dd.year == heute.year and dd <= heute)
        for dd, b in zahl:
            betrag = b * faktor
            jahr += betrag
            monate[dd.month - 1] += betrag
            try:
                naechst = dd.replace(year=dd.year + 1)
            except ValueError:
                naechst = dd + timedelta(days=365)
            bestaetigt = False
            if exd_offen and abs((exd - naechst).days) <= 25:
                naechst, bestaetigt, exd_offen = exd, True, False
            if naechst >= heute:
                termine.append({"t": t, "id": z.get("id"), "name": z["name"], "datum": naechst.isoformat(), "betrag": betrag,
                                "pro_aktie": b, "cur": cur, "bestaetigt": bestaetigt})
        if exd_offen and zahl:  # neuer Termin ohne Vorjahres-Gegenstück
            b = zahl[-1][1]
            termine.append({"t": t, "id": z.get("id"), "name": z["name"], "datum": exd.isoformat(), "betrag": b * faktor,
                            "pro_aktie": b, "cur": cur, "bestaetigt": True})
        if zahl:
            n = len(zahl)
            info.append({"t": t, "id": z.get("id"), "broker": z.get("broker"), "name": z["name"], "jahr": jahr, "bisher": z["div_bisher"], "anzahl": n, "cur": cur,
                         "pro_aktie_jahr": sum(b for _, b in zahl), "rendite": jahr / z["wert"] if z.get("wert") else None,
                         "rhythmus": "monatlich" if n >= 10 else "quartalsweise" if n >= 3 else "halbjährlich" if n == 2 else "jährlich",
                         "letzte": [zahl[-1][0].isoformat(), zahl[-1][1]], "naechste": exd.isoformat() if exd and exd >= heute else None})
    save(DIV_FILE, cache)
    termine.sort(key=lambda x: x["datum"])
    info.sort(key=lambda x: -x["jahr"])
    return monate, termine[:400], info


# ================================================================ Sparpläne
def _faellige_tage(sp, bis):
    """Alle Ausführungstage eines Sparplans nach gebucht_bis (bzw. ab Start) bis einschließlich 'bis'."""
    try:
        start = datetime.strptime(sp.get("start") or bis.isoformat(), "%Y-%m-%d").date()
    except ValueError:
        return []
    letzte = sp.get("gebucht_bis")
    letzte = datetime.strptime(letzte, "%Y-%m-%d").date() if letzte else None
    tage = sorted({min(28, max(1, int(x))) for x in (sp.get("tage") or [1]) if str(x).strip()})
    alle = max(1, int(sp.get("alle") or 1))
    out = []
    j, m = start.year, start.month
    grenze = max(start, bis - timedelta(days=370))
    while (j, m) <= (bis.year, bis.month):
        if ((j - start.year) * 12 + m - start.month) % alle == 0:
            for t in tage:
                d = datetime(j, m, t).date()
                if d >= start and d >= grenze and d <= bis and (letzte is None or d > letzte):
                    out.append(d)
        m += 1
        if m > 12:
            j, m = j + 1, 1
    return out


def sparplaene_buchen(pf, positionen, serien, cur_of, fx):
    """Rechnet fällige Sparplan-Ausführungen zum Schlusskurs des Ausführungstags (bzw. des nächsten
    Handelstags) in Euro aus und bucht sie vorläufig auf die Position. Die Website schreibt sie dann fest."""
    offen = []
    heute = NOW.date()
    by_id = {p.get("id"): p for p in positionen}
    for sp in pf.get("sparplaene") or []:
        if not sp.get("aktiv", True) or not num(sp.get("betrag")):
            continue
        p = by_id.get(sp.get("pos"))
        if p is None:
            continue
        betrag = float(num(sp.get("betrag")))
        se = None
        if p.get("manuell") is None and p.get("t") in serien:
            cur = cur_of.get(p["t"], "USD")
            se = zu_eur(serien[p["t"]], cur, fx)
            if se is None or se.dropna().empty:
                se = serien[p["t"]] if cur == "EUR" else None
            if se is not None:
                se = se.dropna()
                idx = se.index.tz_localize(None) if getattr(se.index, "tz", None) is not None else se.index
                se = pd.Series(se.values, index=pd.DatetimeIndex(idx).normalize())
        for d in _faellige_tage(sp, heute):
            if p.get("manuell") is not None:
                offen.append({"sp": sp.get("id"), "pos": p.get("id"), "datum": d.isoformat(), "betrag": betrag,
                              "kurs_eur": None, "stk": 0.0, "manuell": True})
                p["manuell"] = (num(p.get("manuell")) or 0.0) + betrag
                continue
            if se is None or se.empty:
                continue
            nach = se[se.index >= pd.Timestamp(d)]
            if nach.empty:  # noch kein Kurs für den Ausführungstag -> beim nächsten Lauf
                continue
            kurs = float(nach.iloc[0])
            if not kurs or kurs <= 0:
                continue
            stk_neu = betrag / kurs
            alt_stk = num(p.get("stk")) or 0.0
            ek = num(p.get("ek"))
            if ek is not None and alt_stk:
                p["ek"] = (ek * alt_stk + betrag) / (alt_stk + stk_neu)
            elif not alt_stk:
                p["ek"] = kurs
            p["stk"] = alt_stk + stk_neu
            offen.append({"sp": sp.get("id"), "pos": p.get("id"), "datum": d.isoformat(), "betrag": betrag,
                          "kurs_eur": kurs, "kurs_datum": nach.index[0].strftime("%Y-%m-%d"), "stk": stk_neu})
    offen.sort(key=lambda x: x["datum"])
    return offen


# ================================================================ ETF-Durchblick
ETF_FILE = os.path.join(STATE_DIR, "etf.json")
SEK_YF = {"technology": "Technologie", "healthcare": "Gesundheit", "financial_services": "Finanzen",
          "consumer_cyclical": "Zyklischer Konsum", "consumer_defensive": "Basiskonsum", "industrials": "Industrie",
          "energy": "Energie", "basic_materials": "Rohstoffe", "communication_services": "Kommunikation",
          "utilities": "Versorger", "realestate": "Immobilien", "real_estate": "Immobilien"}
_STOP = {"inc", "corp", "corporation", "co", "company", "the", "plc", "ag", "se", "nv", "sa", "ltd", "limited",
         "class", "a", "b", "c", "holdings", "holding", "group", "adr", "reg", "registered", "shs", "and"}


def name_key(n):
    w = [x for x in re.sub(r"[^a-z0-9 ]", " ", (n or "").lower().replace("&", " ")).split() if x not in _STOP]
    return " ".join(w[:2]) or (n or "").lower()


def etf_proxy(name):
    n = (name or "").lower()
    if "emerging" in n or re.search(r"\bem\b", n):
        return "EEM"
    if "s&p 500" in n or "sp 500" in n or "s&p500" in n:
        return "SPY"
    if "nasdaq" in n:
        return "QQQ"
    if re.search(r"\bdax\b", n):
        return "EWG"
    if "600" in n or "europe" in n:
        return "IEUR"
    if "high div" in n or "dividend" in n:
        return "VYM"
    if "all-world" in n or "all world" in n or "acwi" in n or "global" in n:
        return "ACWI"
    if "world" in n:
        return "URTH"
    return None


def _fondsdaten(t):
    import yfinance as yf
    fd = yf.Ticker(t).funds_data
    top = []
    th = fd.top_holdings
    if th is not None and len(th):
        for sym, r in th.iterrows():
            w = num(r.get("Holding Percent"))
            if w:
                top.append([str(sym), str(r.get("Name") or sym), float(w)])
    sek = {}
    for k, v in (fd.sector_weightings or {}).items():
        v = num(v)
        if v:
            sek[SEK_YF.get(k, k)] = sek.get(SEK_YF.get(k, k), 0.0) + float(v)
    ter = None
    try:
        fo = fd.fund_operations
        if fo is not None and len(fo):
            for idx in fo.index:
                if "expense" in str(idx).lower():
                    v = num(fo.loc[idx].iloc[0])
                    if v:
                        ter = v / 100 if v > 0.05 else v
                        break
    except Exception:
        pass
    return top, sek, ter


def etf_durchblick(zeilen):
    cache = load(ETF_FILE, {})
    exp, sek, etfs = {}, {}, []
    gesamt = sum(z["wert"] for z in zeilen) or 1.0
    start = time.time()

    def add(key, name, wert, quelle, direkt):
        e = exp.setdefault(key, {"name": name, "wert": 0.0, "direkt": 0.0, "quellen": {}})
        e["wert"] += wert
        if direkt:
            e["direkt"] += wert
            e["name"] = name
        e["quellen"][quelle] = e["quellen"].get(quelle, 0.0) + wert

    for z in zeilen:
        w = z.get("wert") or 0.0
        if not w:
            continue
        art = z.get("art") or ""
        if z.get("manuell") or art not in ("ETF", "MUTUALFUND"):
            sek[z.get("sektor") or "Sonstiges"] = sek.get(z.get("sektor") or "Sonstiges", 0.0) + w
            if not z.get("manuell") and art == "EQUITY":
                add(name_key(z["name"]), z["name"], w, "direkt", True)
            continue
        t = z["t"]
        e = cache.get(t)
        if not e or "ter" not in e or NOW - datetime.fromisoformat(e["_stand"]) > timedelta(days=7):
            e = {"_stand": NOW.isoformat(), "quelle": None, "top": [], "sek": {}, "ter": None}
            if time.time() - start < 120:
                for kand in [t, etf_proxy(z["name"])]:
                    if not kand:
                        continue
                    try:
                        top, sk, ter = _fondsdaten(kand)
                    except Exception as ex:
                        log("Fondsdaten-Fehler", kand, ex)
                        top, sk, ter = [], {}, None
                    if kand == t and ter:
                        e["ter"] = ter
                    if top or sk:
                        e.update({"quelle": kand, "top": top, "sek": sk})
                        break
                    time.sleep(0.3)
                cache[t] = e
        hebel = 2.0 if re.search(r"\b2x\b|leverag|lev\b|\bx2\b", (z["name"] or "").lower()) else 1.0
        abgedeckt = 0.0
        for sym, nm, gw in e.get("top") or []:
            add(name_key(nm), nm, w * gw * hebel, z["name"], False)
            abgedeckt += gw
        sk = e.get("sek") or {}
        s_sum = sum(sk.values())
        if s_sum:
            for k, v in sk.items():
                sek[k] = sek.get(k, 0.0) + w * v / s_sum
        else:
            sek["ETF ohne Daten"] = sek.get("ETF ohne Daten", 0.0) + w
        etfs.append({"name": z["name"], "t": t, "wert": w, "quelle": e.get("quelle"),
                     "naeherung": bool(e.get("quelle") and e.get("quelle") != t), "top_anteil": abgedeckt, "id": z.get("id"), "ter": e.get("ter"),
                     "hebel": hebel, "top": (e.get("top") or [])[:10]})
    save(ETF_FILE, cache)
    top = sorted(exp.values(), key=lambda x: -x["wert"])[:30]
    for x in top:
        x["anteil"] = x["wert"] / gesamt
        x["quellen"] = sorted(([k, v] for k, v in x["quellen"].items()), key=lambda q: -q[1])
    return {"top": top, "sektoren": sorted(([k, v, v / gesamt] for k, v in sek.items()), key=lambda x: -x[1]),
            "etfs": etfs}


# ================================================================ News zu Depot-Werten
def depot_news(zeilen, news_fn):
    cache = load(NEWS_FILE, {})
    if cache.get("_stand") and NOW - datetime.fromisoformat(cache["_stand"]) < timedelta(minutes=90):
        return cache.get("items", [])
    items = []
    for z in zeilen:
        if z.get("manuell") or not z.get("t") or (z.get("art") or "EQUITY") != "EQUITY":
            continue
        try:
            for n in (news_fn(z["t"], 72) or [])[:2]:
                n = dict(n)
                n.update({"t": z["t"], "name": z["name"]})
                items.append(n)
        except Exception:
            pass
        time.sleep(0.2)
    items.sort(key=lambda x: x.get("zeit") or "", reverse=True)
    save(NEWS_FILE, {"_stand": NOW.isoformat(), "items": items[:25]})
    return items[:25]


# ================================================================ Marktüberblick
_MARKT_SERIEN = {}


def marktueberblick():
    serien = download([t for t, _ in MARKT])
    _MARKT_SERIEN.update(serien)
    out = []
    for t, name in MARKT:
        s = serien.get(t)
        if s is None or len(s) < 3:
            continue
        woch = s.resample("W").last().dropna().iloc[-52:]
        out.append({"t": t, "n": name, "p": round(float(s.iloc[-1]), 4), "r1d": ret(s, 1), "r1m": ret(s, 21),
                    "r1y": float(s.iloc[-1] / s.iloc[0] - 1), "spark": [round(float(x), 4) for x in woch.values]})
    return out


# ================================================================ Wochenbericht (freitags nach US-Börsenschluss)
BASISZINS = {"2025": 0.0253, "2026": 0.0320}  # BMF-Schreiben vom 10.01.2025 und 13.01.2026


def wochenbericht(post, eins, zeilen, summe, echt, div_termine, df, klick, erzwingen=False):
    if not erzwingen and not (eins.get("wochenbericht", True) and NOW.weekday() == 4 and NOW.hour >= 21):
        return
    woche = NOW.strftime("%G-%V")
    vor = (NOW - timedelta(days=7)).strftime("%Y-%m-%d")
    alt = [v for k, v in sorted(echt.items()) if k <= vor]
    zeilen_txt = []
    if alt and alt[-1]:
        d = summe["wert"] - alt[-1]
        zeilen_txt.append(f"Depot diese Woche: {eur(d, True)} ({pc(d / alt[-1])}), Wert {eur(summe['wert'])}")
    else:
        zeilen_txt.append(f"Depotwert: {eur(summe['wert'])}")
    bew = [z for z in zeilen if z.get("r5d") is not None and not z.get("manuell")]
    if len(bew) >= 2:
        bew.sort(key=lambda z: z["r5d"])
        zeilen_txt.append("Top: " + ", ".join(f"{z['name']} {pc(z['r5d'])}" for z in bew[::-1][:2]))
        zeilen_txt.append("Flop: " + ", ".join(f"{z['name']} {pc(z['r5d'])}" for z in bew[:2]))
    bis = (NOW + timedelta(days=9)).strftime("%Y-%m-%d")
    heute = NOW.strftime("%Y-%m-%d")
    divs = [t for t in div_termine if heute < t["datum"] <= bis]
    if divs:
        zeilen_txt.append("Ex-Tage nächste Woche: " + ", ".join(f"{t['name']} ≈{eur(t['betrag'])}" for t in divs[:4]))
    er = [z for z in zeilen if z.get("er") and 0 < z["er"] - NOW.timestamp() <= 9 * 86400]
    if er:
        zeilen_txt.append("Quartalszahlen: " + ", ".join(
            f"{z['name']} ({datetime.fromtimestamp(z['er'], tz=timezone.utc).strftime('%d.%m.')})" for z in er[:4]))
    if df is not None and not df.empty and "score" in df.columns:
        top = df.dropna(subset=["score"]).sort_values("score", ascending=False).head(3)
        if len(top):
            zeilen_txt.append("Top-Chancen: " + ", ".join(f"{r['n']} ({r['score']:.0f})" for r in top.to_dict("records")))
    post.raus(f"woche|{woche}", "🗞 Dein Wochenbericht", "\n".join(zeilen_txt), prio=2, tags=["newspaper"],
              klick=(klick + "#depot") if klick else None, art="wochenbericht")


# ================================================================ Hauptfunktion
def run(df, closes, fund, neue_markt_alarme, cfg, news_fn, site_url=""):
    from scanner import SEKTOR_DE, markt_von, rsi14
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

    key = schluessel()
    if not key or not os.path.exists(PORTFOLIO_FILE):
        log("Kein Depot hinterlegt (PORTFOLIO_KEY oder depot/portfolio.enc fehlt).")
        markt_und_merkliste(post, neue_markt_alarme, dcfg, klick, {}, set(), set(), df)
        post.speichern()
        return
    try:
        with open(PORTFOLIO_FILE, encoding="utf-8") as f:
            pf = _entschluesseln_mit(f.read(), schluessel_liste())
        n_neu = umschluesseln()
        if n_neu:
            log(f"Schlüsselwechsel: {n_neu} Zwischenspeicher-Dateien neu verschlüsselt")
    except Exception as e:
        log("Depot konnte nicht entschlüsselt werden.")
        markt_und_merkliste(post, neue_markt_alarme, dcfg, klick, {}, set(), set(), df)
        post.speichern()
        return

    eins = {"tag_minus": -5, "tag_plus": 8, "zusammenfassung": True, "termine": True, "umfang": "markt", "rsi_alarm": False}
    eins.update(pf.get("einstellungen") or {})
    post.diskret = eins.get("diskret", True) is not False
    positionen = pf.get("positionen") or []
    alarme = pf.get("alarme") or []
    watch = {t for t in (pf.get("merkliste") or []) if t}

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
        cols = [c for c in ["t", "score", "s", "i", "r1d", "rsi", "sma200", "kreuz"] if c in df.columns]
        scores = {r["t"]: r for r in df[cols].to_dict("records")}

    # Kein Börsenkurs gefunden, aber ein bekannter Wert vorhanden -> wie manuelle Position zeigen
    for p in positionen:
        if p.get("manuell") is None and serien.get(p.get("t")) is None and num(p.get("wert_fallback")) is not None:
            p["manuell"] = num(p.get("wert_fallback"))
            p["typ"] = p.get("typ") or "Ohne Kurs"
            p["_ohne_kurs"] = True

    # Sparpläne: fällige Ausführungen vorläufig buchen (die Website schreibt sie fest)
    try:
        sparplan_offen = sparplaene_buchen(pf, positionen, serien, cur_of, fx)
    except Exception as e:
        log("Sparplan-Fehler:", e)
        sparplan_offen = []

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
                "rsi": num((scores.get(t) or {}).get("rsi")) if t in scores else rsi14(s),
                "er": er, "exd": num(i_(t, "exDividendDate")), "ziel": num(i_(t, "targetMeanPrice")),
                "datum": s.index[-1].strftime("%Y-%m-%d"), "art": qt or "EQUITY",
                "einstand": (ek * stk) if ek else None,
            })
            z["r1y_lokal"] = float(s.iloc[-1] / s.iloc[0] - 1)
            z["r1y_eur"] = float(se.iloc[-1] / se.iloc[0] - 1) if len(se) > 1 else None
            ja = se[se.index >= pd.Timestamp(NOW.year, 1, 1, tz=se.index.tz)] if len(se) else se
            z["p_eur_ja"] = float(ja.iloc[0]) if len(ja) else None
            z["r5d"] = ret(s, 5)
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
    # Vergleich: MSCI World (in Euro), auf denselben Startwert skaliert
    benchmark = []
    try:
        urth = _MARKT_SERIEN.get("URTH")
        if urth is None:
            urth = download(["URTH"]).get("URTH")
        if verlauf and urth is not None:
            fxu = fx if "USD" in fx else fx_reihen({"USD"})
            ue = zu_eur(urth, "USD", fxu)
            uw = ue.resample("W").last().dropna()
            uw = uw.reindex(uw.index.union(k.index)).ffill().reindex(k.index).bfill()
            benchmark = [round(float(verlauf[0][1] * v / uw.iloc[0]), 2) for v in uw.values]
    except Exception as e:
        log("Benchmark-Fehler:", e)

    # Echter Verlauf ab jetzt (tägliche Schnappschüsse)
    echt = load(VERLAUF_FILE, {})
    echt[NOW.strftime("%Y-%m-%d")] = round(summe["wert"], 2)
    echt = dict(sorted(echt.items())[-800:])
    save(VERLAUF_FILE, echt)
    # eingezahltes Geld = Kaufwert aller Positionen mit Kaufkurs (wächst mit Käufen und Sparplänen)
    einzahl = load(EINZAHL_FILE, {})
    # Positionen ohne Kaufkurs zählen mit ihrem aktuellen Wert (neutral), damit Wert − Eingezahlt = Gewinn/Verlust gesamt
    ohne_ek = sum(z.get("wert") or 0 for z in zeilen if not z.get("einstand"))
    eingezahlt = (summe["einstand"] or 0) + ohne_ek
    if eingezahlt:
        einzahl[NOW.strftime("%Y-%m-%d")] = round(eingezahlt, 2)
    einzahl = dict(sorted(einzahl.items())[-800:])
    save(EINZAHL_FILE, einzahl)

    tx = None
    try:
        tx = tx_verlauf(pf, rcache)
    except Exception as e:
        log("Transaktionsverlauf-Fehler:", e)

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
            if a.get("kaufzone"):
                r = (scores.get(t) or {})
                mo = None
                if df is not None and not df.empty and "moat" in df.columns:
                    m = df[df["t"] == t]
                    mo = num(m["moat"].iloc[0]) if len(m) else None
                post.raus(f"kz|{a.get('id')}|{preis}", f"🎯 Kaufzone erreicht: {a.get('name') or t}",
                          f"Kurs {de(p)} {cur} liegt in deiner Kaufzone (bis {de(preis)} {cur})."
                          + (f" Burggraben {mo:.0f}/100." if mo is not None else "")
                          + (f" Chancen-Score {r.get('score'):.0f}." if r.get("score") is not None else ""),
                          prio=4, tags=["dart"], klick=klick, art="kaufzone", t=t)
                continue
            post.raus(f"alarm|{a.get('id')}|{preis}", f"🔔 Kursalarm: {a.get('name') or t}",
                      f"Kurs {de(p)} {cur} ist {'unter' if a.get('art') == 'unter' else 'über'} deiner Marke {de(preis)} {cur}.",
                      prio=4, tags=["bell"], klick=(klick + "#depot") if klick else None, art="alarm", t=t)

    # Merkliste + Gesamtmarkt (je nach Einstellung)
    depot_t = {z["t"] for z in zeilen if z.get("t") and not z.get("manuell")}
    try:  # Reihenfolge für die Fundamental-Charts: erst Depot (Aktien), dann Merkliste
        save(os.path.join(STATE_DIR, "prio.json"), [z["t"] for z in sorted(zeilen, key=lambda z: -(z.get("wert") or 0))
                                                     if z.get("t") and not z.get("manuell") and (z.get("art") or "EQUITY") == "EQUITY"] + sorted(watch))
    except Exception:
        pass
    markt_und_merkliste(post, neue_markt_alarme, dcfg, klick, eins, watch, depot_t, df)

    # RSI-Alarm: überverkauft (unter 30) – Depot und Merkliste, höchstens 1x pro Woche je Aktie
    if eins.get("rsi_alarm"):
        woche = NOW.strftime("%G-%V")
        namen = {z["t"]: (z["name"], z.get("rsi")) for z in zeilen if z.get("t") and not z.get("manuell")}
        if eins.get("umfang", "markt") != "depot" and df is not None and not df.empty and "rsi" in df.columns:
            for r in df[df["t"].isin(list(watch))].to_dict("records"):
                namen.setdefault(r["t"], (r["n"], num(r.get("rsi"))))
        for t, (name, rv) in namen.items():
            if rv is not None and rv < 30:
                post.raus(f"rsi|{t}|{woche}", f"🔎 {name}: überverkauft (RSI {rv:.0f})",
                          "Die Aktie ist kurzfristig stark gefallen (RSI unter 30). Kein Kaufsignal, aber ein Blick lohnt sich.",
                          prio=2, tags=["mag"], klick=klick, art="rsi", t=t)

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

    try:
        div_monate, div_termine, div_info = dividenden_kalender(zeilen, fx_jetzt)
    except Exception as e:
        log("Dividenden-Kalender-Fehler:", e)
        div_monate, div_termine, div_info = [0.0] * 12, [], []
    try:
        durchblick = etf_durchblick(zeilen)
    except Exception as e:
        log("Durchblick-Fehler:", e)
        durchblick = None
    try:
        wochenbericht(post, eins, zeilen, summe, echt, div_termine, df, klick)
    except Exception as e:
        log("Wochenbericht-Fehler:", e)
    crash = None
    try:
        crash = crash_test(zeilen)
    except Exception as e:
        log("Crash-Test-Fehler: " + type(e).__name__)
    extra = {}
    try:
        import extras
        extra = extras.run({"post": post, "eins": eins, "klick": klick, "pf": pf, "zeilen": zeilen, "serien": serien,
                            "cur_of": cur_of, "fx": fx, "fx_jetzt": fx_jetzt, "df": df, "watch": watch,
                            "div_termine": div_termine, "durchblick": durchblick, "summe": summe})
    except Exception as e:
        log("Zusatz-Auswertungen-Fehler: " + type(e).__name__)
    neu_sp = [b for b in sparplan_offen if not post.schon(f"spar|{b['sp']}|{b['datum']}")]
    if neu_sp:
        txt = ", ".join(f"{next((z['name'] for z in zeilen if z.get('id') == b['pos']), '?')} {eur(b['betrag'])}" for b in neu_sp[:6])
        for b in neu_sp[1:]:
            post.sent[f"spar|{b['sp']}|{b['datum']}"] = NOW.isoformat()
        post.raus(f"spar|{neu_sp[0]['sp']}|{neu_sp[0]['datum']}", f"💶 Sparplan ausgeführt ({len(neu_sp)})",
                  txt, prio=1, tags=["moneybag"], klick=(klick + "#sparplaene") if klick else None, art="sparplan")
    post.speichern()
    try:
        news = depot_news(zeilen, news_fn)
    except Exception as e:
        log("News-Fehler:", e)
        news = []
    ausgabe = {
        "stand": NOW.isoformat(), "summe": summe, "positionen": zeilen, "verlauf": verlauf,
        "verlauf_echt": [[k, v] for k, v in echt.items()],
        "tx": tx,
        "crash": crash,
        "einzahl_echt": [einzahl.get(k) for k in echt],
        "einzahl": round(eingezahlt, 2) if eingezahlt else None,
        "verteilung": {"Branche": verteilung("sektor"), "Land": verteilung("land"), "Währung": verteilung("cur")},
        "fx": fx_jetzt, "alarme_ausgeloest": ausgeloest, "ereignisse": post.events[:40],
        "push_aktiv": post.aktiv, "benchmark": benchmark, "div_monate": div_monate,
        "div_termine": div_termine, "div_info": div_info, "news": news, "merkliste": sorted(watch),
        "sparplan_offen": sparplan_offen, "durchblick": durchblick, "basiszins": BASISZINS, **extra,
    }
    with open(DEPOT_OUT, "w", encoding="utf-8") as f:
        f.write(verschluesseln(key, ausgabe))
    log(f"Depot: {len(zeilen)} Positionen ausgewertet, {post.anzahl} Nachrichten gesendet"  # keine Beträge: Protokolle sind öffentlich
        + (" (Erstlauf: nur gemerkt)" if post.erstlauf else ""))
