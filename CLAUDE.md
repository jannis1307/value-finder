# CLAUDE.md – Übergabe für Claude Code (Value Finder)

Diese Datei ist die Übergabe aus dem bisherigen Chat (Nov 2026). Lies sie ganz, bevor du etwas änderst.
Das Repository ist **öffentlich** – in diese Datei, in Commits und in Logs gehört nichts Persönliches.

## 1. Wer, was, wie reden
- Besitzer: **Jannis** (Schüler, kein Programmierer, sehr interessiert an Aktien/Langfrist-Investieren).
  Er schreibt oft per Sprache, kurz und mit Tippfehlern – gemeint ist meist das Naheliegende.
- **Antworte immer auf Deutsch**, kurz und verständlich, ohne Fachchinesisch. Fakten aus dem Web mit Quelle.
- Er will, dass alles **automatisch und kostenlos** läuft; er öffnet die App nur noch und schaut.
- Ziel: „Finanz-Super-App“ – Aktien-Scanner + eigenes Depot + Push-Nachrichten + Bloomberg-ähnliches Terminal.
- Du (Claude) baust und pflegst **alles** selbst. Er testet am Handy (iPhone, als Web-App installiert) und schickt Screenshots.
- Nach jeder Änderung: selbst prüfen (Tests/Mock, danach live), dann in 2–5 Sätzen sagen, was jetzt anders ist.

## 2. Sicherheitsregeln (nicht verhandelbar)
1. **Commit-Nachricht immer exakt „Depot aktualisiert“** (+ die üblichen Co-Authored-By-Zeilen). Kein Hinweis auf
   Inhalte – auch die App selbst committet so, damit man an der Historie nichts ablesen kann.
2. **Keine Depot-Daten im Klartext** – nirgends: nicht in Dateien, Commits, Logs, Actions-Ausgaben, Issues, dieser Datei.
   Dazu zählen Ticker/ISINs/Stückzahlen/Beträge/Einstandskurse seiner Positionen und seine Merkliste.
   Depot-Ticker nie öffentlich veröffentlichen, auch nicht indirekt (z. B. über Reihenfolge, Zeitstempel,
   „zuerst laden“-Listen, eigene Dateien je Depot-Wert). Öffentliche Prüfungen nur als Ja/Nein.
3. Depotdaten liegen nur verschlüsselt im Repo: `depot/portfolio.enc`, `depot/zugang.enc` (AES-GCM).
   Schlüssel: GitHub-Secret `PORTFOLIO_KEY` (+ `PORTFOLIO_KEY_NEU` beim Schlüsselwechsel) und auf seinen Geräten
   (Face ID/PIN-geschützt). Ausgabe für die App: `web/depot.enc` (verschlüsselt).
4. **Nie Passwörter eingeben, nie 2FA/Logins für ihn erledigen.** Keys/Tokens nie im Chat ausgeben (höchstens Länge).
   Tokens/Keys nie unverschlüsselt ins Repo.
5. **Vor Änderungen an seinen Depotdaten fragen** (Positionen, Einstandskurse, Käufe).
6. Daten von Lang & Schwarz (L&S, `ls_*` in depot.py) nur für sein verschlüsseltes Depot nutzen, nie im öffentlichen Scanner.
7. Endgültiges Löschen nur nach ausdrücklichem Ja. Sperren von Klassifizierern/WAF/SEC nicht umgehen.

## 3. Aufbau
**Website (GitHub Pages):** https://jannis1307.github.io/value-finder/ – wird bei jedem Scanner-Lauf komplett neu gebaut
(`web/` + erzeugte Daten). Pages-Quelle ist „GitHub Actions“, nicht ein Branch.

**Workflow `.github/workflows/scanner.yml`** (Job `scan`):
Pakete → Zwischenspeicher `state/` laden (actions/cache, Schlüssel je Lauf) → `scanner.py` → Cache sichern →
Cache-Version in index.html/sw.js hochzählen → **`selbsttest.py`** → Pages hochladen → veröffentlichen
(**mit 2 Wiederholungen**, weil GitHub das Paket manchmal nicht sofort findet: „No artifacts named github-pages“).
Job `weiter` startet direkt den nächsten Lauf (Kette): werktags ca. alle 3–4 Min., nachts ~30 Min., Wochenende ~stündlich.
Job `lebenszeichen` (Mo 4:41 UTC) hält die Zeitpläne (Scanner + Wächter) aktiv. Secrets: `PORTFOLIO_KEY(_NEU)`, `TELEGRAM_TOKEN`,
`TELEGRAM_CHAT_ID`, `NTFY_TOPIC`, `VAPID_PRIVATE`.

**Python (läuft in Actions):**
| Datei | Aufgabe |
|---|---|
| `scanner.py` | Hauptlauf: Universum (S&P 500, DAX/MDAX, Euro Stoxx 50, CAC 40, AEX, FTSE 100, SMI, Stockholm, Kopenhagen, Hang Seng, große Japaner + `config.json → zusatz_ticker`), Kurse/Kennzahlen via yfinance, Chancen-Score, Alarme, schreibt `web/data.json`; ruft die Module unten auf |
| `config.json` | Märkte, `zusatz_ticker` (z. B. 2222.SR Aramco, TSM, 005930.KS, 000660.KS, RELIANCE.NS, ARM, ASML, NOVO-B.CO, MC.PA, NESN.SW), Score-Gewichte, Alarm-Schwellen, Depot-Optionen |
| `depot.py` | entschlüsselt Depot, bewertet in EUR, Push (Web-Push/ntfy/Telegram), Kursalarme, Tagesbericht, Steuer-/Transaktions-Analysen, Anleihen, schreibt `web/depot.enc` |
| `fundamental.py` | 10-Jahres-Finanzdaten je Aktie → `web/f/<Ticker>.json` (für Terminal FA) |
| `kurse.py` | Intraday-/Tagesreihen → `web/k/…` |
| `extras.py` | Quartalszahlen-Termine + Reaktion (Push nach Zahlen, auch für Merkliste: Schalter `quartal_merkliste`), Wirtschaftskalender, „Was wäre wenn“ |
| `terminal.py` | Terminal-Daten je Aktie → `web/terminal/<Ticker>.json` + `index.json` (Profil, Aktionäre, Netz aus Wikidata: Kunden/Lieferanten über Produkte, `netz2` Version v=3; GLEIF-Register; Logos) |
| `superinvestoren.py` | 13F-Daten (Buffett, Fundsmith, Akre, Markel, Gates, Himalaya, Baupost, Polen, Giverny, Lindsell, Russo, DJCO …) → `web/terminal/guru.json` |
| `ipo.py` | Börsengänge → `web/ipos*.json` |
| `pruefung.py` | Gesundheitscheck/Hinweise in der App (z. B. „Superinvestoren-Daten veraltet“ ab 140 Tagen) |
| `selbsttest.py` | bricht den Lauf ab, bevor eine kaputte Website live geht (JS-Syntax, JSON, CSP, ≥100 Aktien, ≥80 % mit Kurs, keine Klartext-Depotdateien) |
| `webpush.py` | Web-Push (VAPID) ohne Fremddienst |
| `waechter.py` | **Wächter** (eigener Workflow `waechter.yml`, alle 20 Min.): bricht hängende Läufe ab, startet den Scanner bei veralteten Daten neu (tags > 20 Min., nachts > 70, WE > 90), Push nur wenn das nicht hilft (je Störung 1×) oder `pruefung.json` echte `probleme` meldet. Zustand per actions/cache |
| `kurs_reparatur.py` | füllt fehlende Yahoo-Schlusskurse aus Stundenkursen auf (Scanner + Depot) |

**Web-App (`web/`, reines JS ohne Build):** `index.html` (CSP!), `app.js` (Grundgerüst, `BY` = Aktien nach Ticker),
`plus.js` (Depot: Entschlüsseln, Face ID/PIN, GitHub-Speichern), `plus2.js`–`plus5.js` (Charts, Alarme, Termine,
Einstellungen, Fundamentaldaten), **`plus6.js` = Terminal** (globales Objekt `PLUS7`), `sw.js` (Service Worker),
`lieferketten.json` (handgepflegte Lieferbeziehungen).

**Cloudflare-Worker `vf-kurse`** (https://vf-kurse.jannis1307.workers.dev): Live-Kurs-Proxy für die App. Code liegt
nicht im Repo, sondern bei Cloudflare (nur mit Cloudflare-Zugang änderbar). Offener Punkt: CPU-Zeit im Blick behalten.

## 4. Das Terminal (plus6.js)
- Aufruf in der App über den Bereich „Mehr“ oder Link `#terminal-<Befehl>` (z. B. `#terminal-AAPL%20DES`).
- Aktien-Funktionen `FN` (Tasten 1–8): **DES** Überblick, **FA** 10-Jahres-Finanzen, **GP** Chart, **HDS** Aktionäre,
  **REL** Verflechtungen, **SPLC** Lieferkette, **RV** Branchenvergleich, **GURU** Superinvestoren in der Aktie.
- Markt-Funktionen: **TOP**, **EQS** (Screener mit Vorlagen, z. B. `EQS MOAT>70 MONO>60`), **COMP**, **KETTE**
  (Tabelle aller Lieferketten, Filter, „+N weitere anzeigen“ klappt auf), **WHO** (wer hält was), **MEIN** (eigenes Depot),
  **HILFE**, **GURU** ohne Ticker = Fonds-Übersicht (`GURU MAR` = Fonds Markel, `MAR GURU` = Aktie Marriott).
- Namenssuche `finde()`: Ticker → Spitznamen-Tabelle `SPITZ` (TSMC, Google, Aramco, VW, Telekom …) → Wörter →
  kompakter Vergleich (AT&T, 3M, L'Oréal). `namePasst()` verhindert Fehltreffer („Space“ ≠ Extra Space Storage).
  Nicht gefunden → private Firma über Wikidata (z. B. SpaceX, Bosch).
- Lieferketten = `web/lieferketten.json` (zuerst, kuratiert, ohne Umsatzanteile) + Wikidata (nur Einträge mit n ≥ 2).
  Händler (Walmart, Target, Home Depot …) haben bei Wikidata nichts → dort von Hand ergänzen. Fehlt Jannis eine Firma
  oder Beziehung: in `lieferketten.json` ergänzen (`[Lieferant, "TICKER|TICKER2", Kunde, Ticker, "was"]`).
- **Burggraben-Verlauf** (oben in **FA**, Funktion `burgVerlauf`): Bruttomarge, Op. Marge, FCF-Marge, Kapitalrendite
  (≈ operativer Gewinn × 0,79 / (EK + Schulden − Cash); Banken: EK-Rendite) – Ø erste 3 vs. letzte 3 Jahre (bei nur
  4–7 Jahren je 2, Hinweis „kurzer Zeitraum“). Urteil: stabil / wird breiter / hält größtenteils / gemischt / bröckelt.
  Nicht die EK-Rendite für Nicht-Banken nehmen (Rückkäufe blähen sie auf). Nicht-US-Aktien haben meist nur 4 Jahre (Yahoo).
- **`SELBSTTEST`** (Befehl im Terminal): ruft jede Funktion für jede Aktie auf und listet Auffälligkeiten.
  Stand 24.11.2026 live: 977 Aktien × 8 Funktionen, 0 echte Fehler. Firmenbeschreibungen (`.txt`-Blöcke) werden
  ignoriert (sonst Fehlalarm, weil „Infinity“ ein Markenname ist).
- Fehler in einer Funktion zeigen „Da ist etwas schiefgegangen bei …“ statt ewig „lädt …“.

## 5. Abläufe
**Ändern & veröffentlichen:** Änderung committen (Nachricht „Depot aktualisiert“) und auf `main` pushen. Der nächste
Scanner-Lauf (≤ 4 Min.) baut die Website; nach ca. 4–8 Min. live. Prüfen: Actions-Lauf grün, dann die Datei auf
github.io abrufen (z. B. `plus6.js?x=<zeit>` enthält die Änderung). Die App-Cache-Version zählt der Workflow selbst hoch.
Achtung: Die App committet selbst (Depot-Änderungen vom Handy) – vor dem Push immer `git pull --rebase`.

**Erfahrungen beim Hochladen (24.11.2026):**
- `git push` kann kurz mit HTTP 403 „Claude doesn't have GitHub access“ scheitern, obwohl alles stimmt – einige Minuten
  später erneut versuchen, dann klappt es meist. Notlösung GitHub-MCP `push_files`: nur für kleine Dateien, und immer die
  **komplette** Datei schicken (das Werkzeug ersetzt die ganze Datei – ein „Test“ mit Teilinhalt überschreibt sie gekürzt).
  Große Dateien wie `plus6.js` (~260 KB) nur per `git push`.
- `python -m py_compile` legt `__pycache__/` an – steht in `.gitignore`, trotzdem vor dem Commit `git diff --stat` prüfen.
- Prüfen, ob eine Änderung live ist: `curl -s "https://jannis1307.github.io/value-finder/plus6.js?x=$(date +%s)" | grep …`;
  `data.json` → Feld `stand` zeigt den letzten Lauf, `anzahl` die Zahl der Aktien.

**iPhone-Layout (24.11.2026):** Ist irgendein Inhalt breiter als der Bildschirm, zoomt iOS die ganze Seite heraus – dann
„schwebt“ die untere Tab-Leiste mitten im Bild und rechts ist alles leer. Schutz: `#main{overflow-x:clip}` und
`viewport-fit=cover` in index.html – nicht entfernen. Bei Flex-Zeilen mit langen Namen `min-width:0` setzen.
Prüfen: `document.documentElement.scrollWidth` muss auf jeder Seite = 390 sein.

**Morgen-Check (geplante Aufgabe „Value Finder Morgencheck“, 7:34 Uhr):** liest nur. Am 26.11. meldete er fälschlich
„Scanner hängt seit 23.11.“ – sein Abruf-Werkzeug lieferte alte Zwischenstände. Seitdem: URLs immer mit `?x=<Zeit>`,
widersprüchliche Angaben erneut abrufen, Wächter-Läufe mitprüfen.

**Yahoo-Kurslücken (26.11.2026):** Yahoo liefert manchmal Tageszeilen mit Volumen, aber ohne Schlusskurs – z. B. am
25.11.2026 für fast alle europäischen Börsen, und Sandisk (SNDK) nach dem Split am 20.11. tagelang. Folge: App bleibt auf
altem Kurs. Lösung `kurs_reparatur.py` (von `scanner.lade_kurse` und `depot.download` genutzt): erkennt Lücken
(Volumen > 0, Kurs fehlt) und Rückstände ≥ 3 Tage gegenüber demselben Börsenplatz, füllt aus Stundenkursen
(Abweichung zum echten Schluss meist < 0,5 %). Liefert Yahoo später nach, gilt wieder der echte Schlusskurs.
`yf.download(repair=True)` bräuchte scipy+sklearn – nicht genutzt. Prüfen: in `data.json` je Börsenplatz das Feld `datum`.
Ticker-Fehler aus Wikipedia-Listen: `TICKER_KORREKTUR` / `NICHT_MEHR_GEHANDELT` in scanner.py (dann `UNI_VERSION` erhöhen).

**Vor jedem Push lokal testen:** `node --check web/*.js`, `python -m py_compile *.py`, JSON-Dateien parsen.
Für UI-Änderungen: Mock-Seite mit Testdaten (data.json, terminal/*.json, f/*.json) lokal per `python3 -m http.server`
und Playwright laden, Handy-Breite 390 px prüfen (nichts breiter als der Bildschirm, kein „undefined/NaN/null“).

**Superinvestoren aktualisieren** (Jannis sagt „Superinvestoren aktualisieren“; nächster Termin ab ca. 17. Feb. 2027,
13F-Frist 45 Tage nach Quartalsende): Die SEC sperrt GitHub-Actions-IPs (HTTP 403) – `superinvestoren.py` bricht dann
sauber ab und nutzt `sec_13f_seed.json.gz`. Den Seed baut man außerhalb von Actions: EDGAR-Atom-Feed je Fonds
(`count=10`), die zwei neuesten 13F-HR-`.txt`-Meldungen (InfoTable-XML; Attribute/Namespaces vor dem Parsen entfernen),
`company_tickers.json` für die Ticker-Zuordnung; SEC verlangt einen User-Agent mit Kontakt. Ergebnis als
`{"fonds":…, "titel":…}` gzip-JSON committen. Pershing Square ist ausgeschlossen (meldet nicht mehr aktuell).

**Neue Aktie aufnehmen:** Yahoo-Ticker in `config.json → zusatz_ticker`. Kennzahlen/FA/Terminal füllen sich in den
nächsten Läufen nach und nach.

## 6. Offene Punkte (Stand 24.11.2026)
- iPhone-Push-Abo prüfen/einrichten (Web-Push).
- Bei einigen Depot-Positionen fehlen Einstandskurse – **Jannis fragen**, nicht raten.
- Ziele für die „Umlenker“-Funktion mit Jannis klären.
- Superinvestoren-Seed jährlich bzw. quartalsweise erneuern (siehe oben).
- Cloudflare-Worker `vf-kurse`: CPU-Zeit beobachten.

## 7. Was er bisher wollte (Richtung)
- Langfrist-Investor („langweilige Monopole“ mit Burggraben, Halten über Jahrzehnte) – Funktionen eher in diese Richtung
  (Qualität, Burggraben, Monopol-Score, Superinvestoren, Lieferketten) als Daytrading.
- Verlässliche Daten (Tagesveränderung soll zu getquin passen), Kurse auch nachts regelmäßig.
- Keine Anlageberatung in der App: Score ist ein Filter, kein Kaufsignal.
