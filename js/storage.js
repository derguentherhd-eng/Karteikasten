// ============================================================================
// storage.js – Zentrale Datenhaltung für den digitalen Karteikasten
// ============================================================================
// Verantwortlich für:
//   - Laden/Speichern des gesamten Fortschritts in localStorage
//   - Status-Übergänge (richtig/falsch beantwortet) nach der Leitner-Logik
//   - Import neuer CSV-Dateien in den "unbearbeitet"-Stapel
//   - Export/Import des kompletten Zustands als JSON-Datei
// ============================================================================

const STORAGE_KEY = "karteikasten_v1_zustand";

// Reihenfolge der Stapel, in der sie auf der Übersichtsseite erscheinen sollen
const STAPEL_REIHENFOLGE = [
  "unbearbeitet",
  "1x-falsch",
  "2x-falsch",
  "3x-falsch",
  "1x-richtig",
  "2x-richtig",
  "3x-richtig",
];

const STAPEL_LABELS = {
  unbearbeitet: "Unbearbeitete Karteikarten",
  "1x-falsch": "1× falsch beantwortet",
  "2x-falsch": "2× falsch beantwortet",
  "3x-falsch": "3× falsch beantwortet",
  "1x-richtig": "1× richtig beantwortet",
  "2x-richtig": "2× richtig beantwortet",
  "3x-richtig": "3× richtig beantwortet",
};

const Storage = {
  /**
   * Lädt den gesamten Zustand aus localStorage. Falls noch nichts gespeichert
   * ist, wird der Zustand aus den eingebetteten SEED_CARDS initialisiert.
   */
  ladeZustand() {
    const roh = localStorage.getItem(STORAGE_KEY);
    if (roh) {
      try {
        const parsed = JSON.parse(roh);
        if (parsed && Array.isArray(parsed.karten)) {
          return parsed;
        }
      } catch (e) {
        console.error("Konnte gespeicherten Zustand nicht lesen, initialisiere neu.", e);
      }
    }
    return this.erzeugeInitialenZustand();
  },

  erzeugeInitialenZustand() {
    const karten = (typeof SEED_CARDS !== "undefined" ? SEED_CARDS : []).map((k) =>
      this.normalisiereKarte(k)
    );
    return {
      version: 1,
      erstelltAm: new Date().toISOString(),
      karten,
    };
  },

  normalisiereKarte(roh) {
    return {
      id: roh.id,
      themencluster: roh.themencluster || "Ohne Thema",
      frage: roh.frage || "",
      antwort: roh.antwort || "",
      quelle: roh.quelle || "unbekannt",
      richtig: roh.richtig || 0,
      falsch: roh.falsch || 0,
      status: roh.status || "unbearbeitet",
      hinzugefuegtAm: roh.hinzugefuegtAm || new Date().toISOString(),
    };
  },

  speichereZustand(zustand) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(zustand));
  },

  /**
   * Berechnet den Folgestatus einer Karte nach einer Antwort.
   * Regel: Eine richtige Antwort setzt den Falsch-Zähler zurück und erhöht
   * den Richtig-Zähler (max. 3). Eine falsche Antwort setzt den Richtig-Zähler
   * zurück und erhöht den Falsch-Zähler (max. 3). So bleibt eine Karte, die
   * beliebig oft falsch beantwortet wird, ab dem dritten Mal dauerhaft im
   * Stapel "3x-falsch" – unabhängig davon, ob es das 3. oder das 8. Mal ist.
   */
  wertePantwortAus(karte, warRichtig) {
    if (warRichtig) {
      karte.falsch = 0;
      karte.richtig = Math.min(3, karte.richtig + 1);
      karte.status = `${karte.richtig}x-richtig`;
    } else {
      karte.richtig = 0;
      karte.falsch = Math.min(3, karte.falsch + 1);
      karte.status = `${karte.falsch}x-falsch`;
    }
    return karte;
  },

  /**
   * Gruppiert alle Karten nach ihrem aktuellen Stapel-Status.
   */
  gruppiereNachStapel(karten) {
    const gruppen = {};
    STAPEL_REIHENFOLGE.forEach((s) => (gruppen[s] = []));
    karten.forEach((k) => {
      if (!gruppen[k.status]) gruppen[k.status] = [];
      gruppen[k.status].push(k);
    });
    return gruppen;
  },

  /**
   * Parst CSV-Text (Format: Themencluster,Frage,Antwort) robust, auch wenn
   * Antwort-Felder ungequotete Kommata enthalten. Nutzt einen einfachen
   * State-Machine-Parser, der Anführungszeichen korrekt behandelt und danach
   * überschüssige Felder wieder der Antwort-Spalte zuschlägt.
   */
  parseCSV(text, dateiname) {
    // BOM entfernen, Windows-Zeilenenden normalisieren
    text = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    const zeilen = this._parseCSVZeilen(text);
    if (zeilen.length === 0) return [];

    // Header überspringen
    const datenZeilen = zeilen.slice(1);
    const karten = [];

    datenZeilen.forEach((felder) => {
      if (felder.length < 2) return; // leere/kaputte Zeile überspringen
      const themencluster = (felder[0] || "").trim();
      const frage = (felder[1] || "").trim();
      // Alle übrigen Felder gehören zur Antwort (falls ein ungequotetes Komma
      // die Antwort versehentlich aufgespalten hat, fügen wir sie wieder zusammen)
      const antwort = felder.slice(2).join(",").trim();
      if (!frage && !antwort) return;

      karten.push(
        this.normalisiereKarte({
          id: this._erzeugeId(),
          themencluster: themencluster || "Ohne Thema",
          frage,
          antwort,
          quelle: dateiname,
          status: "unbearbeitet",
        })
      );
    });

    return karten;
  },

  /**
   * Minimaler, aber RFC4180-tauglicher CSV-Zeilen-Parser (State Machine).
   * Behandelt gequotete Felder mit Kommata, Zeilenumbrüchen und "" als
   * escapetes Anführungszeichen.
   */
  _parseCSVZeilen(text) {
    const zeilen = [];
    let feld = "";
    let zeile = [];
    let inAnfuehrung = false;
    let i = 0;
    const len = text.length;

    while (i < len) {
      const zeichen = text[i];

      if (inAnfuehrung) {
        if (zeichen === '"') {
          if (text[i + 1] === '"') {
            feld += '"';
            i += 2;
            continue;
          } else {
            inAnfuehrung = false;
            i += 1;
            continue;
          }
        } else {
          feld += zeichen;
          i += 1;
          continue;
        }
      } else {
        if (zeichen === '"') {
          inAnfuehrung = true;
          i += 1;
          continue;
        } else if (zeichen === ",") {
          zeile.push(feld);
          feld = "";
          i += 1;
          continue;
        } else if (zeichen === "\n") {
          zeile.push(feld);
          zeilen.push(zeile);
          zeile = [];
          feld = "";
          i += 1;
          continue;
        } else {
          feld += zeichen;
          i += 1;
          continue;
        }
      }
    }
    // letztes Feld/letzte Zeile abschließen, falls Datei nicht mit \n endet
    if (feld.length > 0 || zeile.length > 0) {
      zeile.push(feld);
      zeilen.push(zeile);
    }
    // leere Zeilen am Ende entfernen
    return zeilen.filter((z) => !(z.length === 1 && z[0].trim() === ""));
  },

  _erzeugeId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "id-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
  },

  /**
   * Exportiert den aktuellen Zustand als herunterladbare JSON-Datei.
   */
  exportiereAlsDatei(zustand) {
    const datenStr = JSON.stringify(zustand, null, 2);
    const blob = new Blob([datenStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const zeitstempel = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.href = url;
    a.download = `karteikasten-fortschritt_${zeitstempel}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * Importiert eine zuvor exportierte JSON-Fortschrittsdatei und ersetzt den
   * aktuellen Zustand vollständig.
   */
  importiereAusDatei(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target.result);
          if (!parsed || !Array.isArray(parsed.karten)) {
            reject(new Error("Die Datei enthält keinen gültigen Karteikasten-Fortschritt."));
            return;
          }
          parsed.karten = parsed.karten.map((k) => this.normalisiereKarte(k));
          resolve(parsed);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file, "utf-8");
    });
  },
};
