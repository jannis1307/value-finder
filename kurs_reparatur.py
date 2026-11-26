"""Lücken in Yahoo-Tagesreihen reparieren.

Yahoo liefert manchmal Tageszeilen mit Handelsvolumen, aber ohne Schlusskurs (NaN):
- 25.11.2026: bei fast allen europäischen Börsen fehlte der Schlusskurs des Tages,
- Sandisk nach dem Aktiensplit am 20.11.2026: Tagesreihe tagelang nur NaN.
Die App bliebe dann auf einem alten Kurs stehen. Die Stundenkurse sind in solchen Fällen meist vollständig;
der letzte Stundenkurs eines Tages liegt typischerweise innerhalb von ±0,5 % am offiziellen Schlusskurs
(Unterschied = Schlussauktion). Sobald Yahoo den echten Schlusskurs nachliefert, wird wieder dieser genutzt,
weil jeder Lauf die Tagesreihe neu lädt und nur echte Lücken aufgefüllt werden.
"""
import pandas as pd


def _tag(x):
    x = pd.Timestamp(x)
    return (x.tz_localize(None) if x.tzinfo else x).normalize()


def _platz(t):
    teil = t.rsplit(".", 1)
    return teil[1] if len(teil) == 2 and len(teil[1]) <= 2 else "US"


def luecke_am_ende(close_roh, volumen_roh):
    """True, wenn es nach dem letzten gültigen Schlusskurs noch einen Handelstag gibt (Volumen > 0, Kurs fehlt)."""
    try:
        c = pd.to_numeric(close_roh, errors="coerce")
        v = pd.to_numeric(volumen_roh, errors="coerce").reindex(c.index)
        gueltig = c.dropna()
        if gueltig.empty:   # gar kein Kurs, aber gehandelt (z. B. kurzer Zeitraum direkt nach einem Split)
            return bool((v > 0).any())
        nachher = (c.index > gueltig.index[-1])
        return bool(((v > 0) & c.isna() & nachher).any())
    except Exception:
        return False


def stunden_auffuellen(reihen, kandidaten=(), log=print, max_anzahl=700, min_rueckstand_tage=3, neue_reihen=False):
    """reihen: {ticker: pd.Series (Schlusskurse, Datum als Index)} – wird direkt ergänzt.
    kandidaten: Ticker mit erkannter Lücke (siehe luecke_am_ende). Zusätzlich werden Reihen geprüft, die
    mindestens `min_rueckstand_tage` hinter Aktien desselben Börsenplatzes zurückliegen.
    neue_reihen=True: Kandidaten ganz ohne Tageskurse bekommen eine Reihe nur aus Stundenkursen (fürs Depot).
    Gibt die Zahl der reparierten Reihen zurück (keine Ticker im Log: Depot-Werte bleiben privat)."""
    import yfinance as yf
    if not reihen:
        return 0
    neueste = {}
    for t, s in reihen.items():
        if len(s):
            p = _platz(t)
            neueste[p] = max(neueste.get(p, _tag(s.index[-1])), _tag(s.index[-1]))
    alt = {t for t, s in reihen.items() if len(s) and (neueste[_platz(t)] - _tag(s.index[-1])).days >= min_rueckstand_tage}
    pruefen = [t for t in dict.fromkeys(list(kandidaten) + sorted(alt))
               if (t in reihen and len(reihen[t])) or (neue_reihen and t not in reihen)]
    if not pruefen or len(pruefen) > max_anzahl:
        return 0
    repariert = 0
    for i in range(0, len(pruefen), 100):
        teil = pruefen[i:i + 100]
        try:
            df = yf.download(teil, period="1mo", interval="1h", auto_adjust=True, group_by="ticker",
                             threads=True, progress=False)
        except Exception:
            continue
        if df is None or df.empty:
            continue
        for t in teil:
            try:
                h = df[t]["Close"] if isinstance(df.columns, pd.MultiIndex) else df["Close"]
                h = pd.to_numeric(h, errors="coerce").dropna()
                if h.empty:
                    continue
                idx = h.index.tz_localize(None) if h.index.tz is not None else h.index
                taeglich = pd.Series(h.values, index=idx).groupby(idx.normalize()).last()
                if t not in reihen:
                    if len(taeglich) >= 2:
                        reihen[t] = taeglich.astype(float)
                        repariert += 1
                    continue
                s = reihen[t]
                letzte = _tag(s.index[-1])
                neu = taeglich[taeglich.index > letzte]
                if neu.empty:
                    continue
                # Sicherung: passen Stunden- und Tagesreihe am letzten gemeinsamen Tag nicht zusammen
                # (z. B. eine Reihe nicht split-bereinigt), lieber nichts anhängen als einen falschen Kurssprung
                gemeinsam = taeglich[taeglich.index <= letzte]
                if gemeinsam.empty or abs(float(gemeinsam.iloc[-1]) / float(s.iloc[-1]) - 1) > 0.05:
                    continue
                if s.index.tz is not None:
                    neu.index = neu.index.tz_localize(s.index.tz)
                reihen[t] = pd.concat([s, neu.astype(float)])
                repariert += 1
            except Exception:
                pass
    if repariert:
        log(f"Kurse: {repariert} Tagesreihe(n) mit fehlendem Schlusskurs aus Stundenkursen ergänzt")
    return repariert
