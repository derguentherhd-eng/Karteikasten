# Digitaler Karteikasten

Eine reine HTML/CSS/JS-Webanwendung zum Lernen mit Karteikarten – inspiriert vom klassischen Karteikasten-Lernsystem (Leitner-Prinzip).

## Starten

Einfach `index.html` im Browser öffnen (Doppelklick reicht) – kein Server, kein Build-Schritt nötig.

> **Hinweis für CSV-Import per Drag & Drop:** Der Import per Auswahl-Button funktioniert in jedem Browser direkt per Doppelklick auf `index.html`. Wenn du die App stattdessen über einen lokalen Server öffnest (z. B. `python3 -m http.server`), funktioniert zusätzlich auch Drag & Drop von CSV-Dateien zuverlässiger – das ist aber optional.

## Seiten

- **`index.html` – Lernen:** Zeigt die Karteikarten des aktuell gewählten Stapels. Karte anklicken oder Leertaste drücken, um sie umzudrehen. Danach mit „Richtig“ (Taste `R`) oder „Falsch“ (Taste `F`) bewerten.
- **`stapel.html` – Stapelübersicht:** Zeigt alle Stapel mit Kartenanzahl, Gesamtfortschritt und den Import-Bereich für neue CSV-Dateien.

## Stapel-Logik

Jede Karte hat einen Status, der sich nach jeder Antwort ändert:

- **Falsch beantwortet** → Richtig-Zähler wird auf 0 gesetzt, Falsch-Zähler erhöht sich (max. 3) → Stapel „1×/2×/3× falsch beantwortet“
- **Richtig beantwortet** → Falsch-Zähler wird auf 0 gesetzt, Richtig-Zähler erhöht sich (max. 3) → Stapel „1×/2×/3× richtig beantwortet“

Das bedeutet: Eine Karte, die beliebig oft (auch 8× oder mehr) hintereinander falsch beantwortet wird, bleibt ab dem dritten Mal dauerhaft im Stapel „3× falsch beantwortet“. Wird sie danach einmal richtig beantwortet, wandert sie sofort in „1× richtig beantwortet“. Jeder Stapel lässt sich auf der Übersichtsseite anklicken, um genau diese Karten gezielt zu wiederholen.

## Neue Karteikarten hinzufügen

Lege neue CSV-Dateien in den Ordner `karteikarten-csvs/` ab (nur zur Organisation/Ablage – Browser können Ordner nicht automatisch einlesen). Importiere sie anschließend auf der Stapelübersicht über den Button **„CSV-Datei(en) auswählen“** oder per Drag & Drop auf die gestrichelte Fläche. Die Karten landen direkt im Stapel **„Unbearbeitete Karteikarten“**.

**CSV-Format** (Komma-getrennt, mit Kopfzeile):

```csv
Themencluster,Frage,Antwort
Mein Thema,Meine Frage?,Meine Antwort.
```

## Fortschritt speichern

Der Fortschritt wird automatisch im Browser gespeichert (localStorage) – er bleibt auch nach dem Schließen und erneuten Öffnen der Seite erhalten, solange du denselben Browser auf demselben Gerät nutzt.

Für ein Backup oder zum Übertragen auf ein anderes Gerät:

- **„⬇ Sichern“** lädt den gesamten Fortschritt als JSON-Datei herunter.
- **„⬆ Laden“** (auf der Stapelübersicht) lädt eine zuvor gesicherte JSON-Datei wieder ein und ersetzt den aktuellen Stand.

## Technik

- Reines HTML, CSS und Vanilla JavaScript, kein Framework, keine Abhängigkeiten außer Google Fonts.
- Responsives Layout, optimiert für Desktop, funktioniert aber auch auf Tablet und Smartphone.
- Tastatursteuerung: `Leertaste` (Karte umdrehen), `R` (richtig), `F` (falsch).
