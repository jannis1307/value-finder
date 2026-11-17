# Value Finder

**Website:** https://jannis1307.github.io/value-finder/

Scannt automatisch alle S&P-500- und DAX-Aktien (plus Zusatz-Ticker), bewertet sie mit einem Chancen-Score und meldet auffällige Kursrückgänge, für die es keinen erkennbaren Grund gibt.
Läuft komplett kostenlos auf GitHub: werktags alle 30 Minuten von ca. 7 bis 22:30 Uhr.

## Bereiche der Website
- **Chancen:** alle Aktien nach Score (0–100). In der Detailansicht steht, warum.
- **Alarme:** Kursrückgänge ab −6 % am Tag oder −12 % in 5 Tagen, die deutlich schlechter sind als die eigene Branche. Danach wird geprüft, ob es News, Quartalszahlen oder einen Ex-Dividenden-Tag gab.
- **Branchen:** Performance je Branche.
- **Merkliste:** wird nur auf deinem Gerät gespeichert.

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
Alles steht in **config.json**. Datei auf GitHub öffnen, auf den Stift klicken, ändern und speichern. Ab dem nächsten Lauf gilt die Änderung.
- **zusatz_ticker:** weitere Aktien im Yahoo-Format, z. B. "ASML", "NOVO-B.CO", "MC.PA", "RR.L"
- **score_gewichte**, **alarm** (Schwellen), **telegram**

Manuell starten: Reiter **Actions → Scanner → Run workflow**.

## Wichtig
- Keine Anlageberatung. Der Score ist ein Filter, kein Kaufsignal.
- Daten: Yahoo Finance über yfinance (kostenlos, inoffiziell, teils ~15 Min. verzögert).
- „Kein Grund gefunden“ heißt nur: Yahoo hatte keine News oder Termine. Bei deutschen Aktien selbst nachschauen.
- GitHub pausiert geplante Läufe nach 60 Tagen ohne Änderungen im Repository und schickt vorher eine E-Mail. Dann unter Actions → Scanner auf „Enable workflow“ klicken.
