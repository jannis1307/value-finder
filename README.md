# Value Finder

**Website / App:** https://jannis1307.github.io/value-finder/ (am Handy über „Zum Home-Bildschirm“ als Web-App installierbar)

Eine kostenlose „Finanz-App“, die komplett automatisch auf GitHub läuft: Aktien-Scanner mit Chancen-Score,
Kursalarme, eigenes (verschlüsseltes) Depot mit Push-Nachrichten und ein Terminal mit Finanzdaten, Aktionären,
Lieferketten und Superinvestoren.

## Welche Aktien?
S&P 500, DAX und MDAX, Euro Stoxx 50, CAC 40, AEX, FTSE 100, SMI, Stockholm, Kopenhagen, Hang Seng, große
japanische Werte – plus einzelne Zusatz-Ticker aus `config.json` (z. B. Aramco, TSMC, Samsung, ASML, Novo Nordisk).
Insgesamt rund 1.000 Aktien.

## Wie oft wird aktualisiert?
Der Scanner läuft als Kette auf GitHub Actions – jeder Lauf startet den nächsten:
- werktags tagsüber etwa alle 3–4 Minuten,
- nachts etwa alle 30 Minuten,
- am Wochenende etwa stündlich.

Bei jedem Lauf wird die Website neu gebaut. Vor dem Veröffentlichen prüft `selbsttest.py` die Seite
(JavaScript, Daten, genug Aktien mit Kurs, keine unverschlüsselten Depotdaten) – ist etwas kaputt, bleibt die alte Version online.

## Bereiche der App
- **Chancen:** alle Aktien nach Score (0–100). In der Detailansicht steht, warum.
- **Alarme:** Kursrückgänge ab −6 % am Tag oder −12 % in 5 Tagen, die deutlich schlechter sind als die eigene Branche.
  Danach wird geprüft, ob es News, Quartalszahlen oder einen Ex-Dividenden-Tag gab.
- **Branchen:** Performance je Branche.
- **Merkliste & Depot:** Depot nur verschlüsselt gespeichert, Entsperren mit Face ID/PIN. Push-Nachrichten bei Kursalarmen,
  Quartalszahlen und als Tagesbericht.
- **Termine:** Quartalszahlen und Wirtschaftskalender, Börsengänge.
- **Terminal** (unter „Mehr“): Befehle wie `AAPL DES` (Überblick), `FA` (10 Jahre Finanzen), `GP` (Chart), `HDS` (Aktionäre),
  `REL` (Verflechtungen), `SPLC` (Lieferkette), `RV` (Branchenvergleich), `GURU` (Superinvestoren),
  sowie `TOP`, `EQS` (Screener), `COMP`, `KETTE`, `WHO`, `MEIN`, `HILFE`. `SELBSTTEST` prüft alle Funktionen für alle Aktien.

## Chancen-Score
| Faktor | Gewicht | Was gemessen wird |
|---|---|---|
| Kursziel-Potenzial | 30 | Abstand zum Ø Analysten-Kursziel (ab 3 Analysten) |
| Aufholpotenzial | 20 | Rückstand zur eigenen Branche in 6 Monaten |
| Branchen-Trend | 10 | Anstieg der Branche in 12 Monaten |
| Bewertung | 20 | Erwartetes KGV im Vergleich zur Branche |
| Qualität | 20 | Gewinnmarge, Umsatzwachstum, Eigenkapitalrendite |

Jeder Faktor ist ein Rang gegenüber allen gescannten Aktien.

## Anpassen
Alles Wichtige steht in **config.json** (auf GitHub öffnen, Stift, ändern, speichern – gilt ab dem nächsten Lauf):
- **zusatz_ticker:** weitere Aktien im Yahoo-Format, z. B. "ASML", "NOVO-B.CO", "MC.PA", "RR.L"
- **score_gewichte**, **alarm** (Schwellen), **telegram**, **depot**

Lieferbeziehungen für das Terminal lassen sich in `web/lieferketten.json` von Hand ergänzen.

Manuell starten: Reiter **Actions → Scanner → Run workflow**.

## Wichtig
- Keine Anlageberatung. Der Score ist ein Filter, kein Kaufsignal.
- Daten: Yahoo Finance über yfinance (kostenlos, inoffiziell, teils verzögert), dazu Wikidata, GLEIF und SEC-13F-Meldungen.
- „Kein Grund gefunden“ heißt nur: Yahoo hatte keine News oder Termine. Bei deutschen Aktien selbst nachschauen.
- Ein wöchentlicher „Lebenszeichen“-Lauf sorgt dafür, dass GitHub den Zeitplan nicht wegen Inaktivität pausiert.
