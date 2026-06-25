// ============================================================================
// stapel.js – Logik der Stapelübersichtsseite (stapel.html)
// ============================================================================

(function () {
  "use strict";

  let zustand = Storage.ladeZustand();
  Storage.speichereZustand(zustand);

  const $statGesamt = document.getElementById("stat-gesamt");
  const $statGemeistert = document.getElementById("stat-gemeistert");
  const $statOffen = document.getElementById("stat-offen");
  const $statSchwierig = document.getElementById("stat-schwierig");
  const $ringFuellung = document.getElementById("ring-fuellung");
  const $ringLabel = document.getElementById("ring-label");
  const $stapelGrid = document.getElementById("stapel-grid");
  const $toast = document.getElementById("toast");

  const $btnExport = document.getElementById("btn-export");
  const $btnImportTrigger = document.getElementById("btn-import-trigger");
  const $inputImportZustand = document.getElementById("input-import-zustand");

  const $importZone = document.getElementById("import-zone");
  const $btnCsvWaehlen = document.getElementById("btn-csv-waehlen");
  const $inputCsv = document.getElementById("input-csv");

  const STAPEL_BESCHREIBUNG = {
    unbearbeitet: "Neue Karten, die du noch kein einziges Mal beantwortet hast.",
    "1x-falsch": "Einmal falsch beantwortet. Bei richtiger Antwort geht's zu „1× richtig“.",
    "2x-falsch": "Zweimal in Folge falsch. Noch nicht im Sorgenkinder-Stapel.",
    "3x-falsch": "Mehrfach falsch beantwortet – diese Karten lohnen sich besonders.",
    "1x-richtig": "Einmal richtig beantwortet, seit dem letzten Fehler oder ganz neu.",
    "2x-richtig": "Zweimal in Folge richtig. Noch eine Wiederholung bis „gemeistert“.",
    "3x-richtig": "Dreimal in Folge richtig beantwortet – diese Karten sitzen.",
  };

  const STAPEL_TYP = {
    unbearbeitet: "unbearbeitet",
    "1x-falsch": "falsch",
    "2x-falsch": "falsch",
    "3x-falsch": "falsch",
    "1x-richtig": "richtig",
    "2x-richtig": "richtig",
    "3x-richtig": "richtig",
  };

  function zeigeToast(text, istFehler) {
    $toast.textContent = text;
    $toast.classList.toggle("toast--fehler", !!istFehler);
    $toast.classList.add("toast--sichtbar");
    clearTimeout($toast._timeout);
    $toast._timeout = setTimeout(() => $toast.classList.remove("toast--sichtbar"), 2600);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  function renderAlles() {
    renderStatistik();
    renderStapelGrid();
  }

  function renderStatistik() {
    const karten = zustand.karten;
    const gesamt = karten.length;
    const gemeistert = karten.filter((k) => k.status === "3x-richtig").length;
    const offen = karten.filter((k) => k.status === "unbearbeitet").length;
    const schwierig = karten.filter((k) => k.status === "3x-falsch").length;

    $statGesamt.textContent = gesamt;
    $statGemeistert.textContent = gemeistert;
    $statOffen.textContent = offen;
    $statSchwierig.textContent = schwierig;

    const prozent = gesamt > 0 ? Math.round((gemeistert / gesamt) * 100) : 0;
    const umfang = 2 * Math.PI * 40;
    $ringFuellung.style.strokeDasharray = `${umfang}`;
    $ringFuellung.style.strokeDashoffset = `${umfang - (umfang * prozent) / 100}`;
    $ringLabel.textContent = `${prozent}%`;
  }

  function renderStapelGrid() {
    const gruppen = Storage.gruppiereNachStapel(zustand.karten);
    $stapelGrid.innerHTML = "";

    STAPEL_REIHENFOLGE.forEach((key) => {
      const karten = gruppen[key] || [];
      const istLeer = karten.length === 0;

      const el = document.createElement("div");
      el.className = "stapel-karte" + (istLeer ? " stapel-karte--leer" : "");
      el.setAttribute("data-typ", STAPEL_TYP[key]);
      el.setAttribute("tabindex", istLeer ? "-1" : "0");
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", `Stapel ${STAPEL_LABELS[key]} öffnen, ${karten.length} Karten`);

      el.innerHTML = `
        <div class="stapel-karte__kopf">
          <span class="stapel-karte__titel">${escapeHtml(STAPEL_LABELS[key])}</span>
          <span class="stapel-karte__zahl">${karten.length}</span>
        </div>
        <p class="stapel-karte__beschreibung">${escapeHtml(STAPEL_BESCHREIBUNG[key])}</p>
        ${!istLeer ? `<span class="stapel-karte__cta">Diesen Stapel lernen →</span>` : ""}
      `;

      if (!istLeer) {
        el.addEventListener("click", () => {
          window.location.href = `index.html?stapel=${encodeURIComponent(key)}`;
        });
        el.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            window.location.href = `index.html?stapel=${encodeURIComponent(key)}`;
          }
        });
      }

      $stapelGrid.appendChild(el);
    });
  }

  // ---- JSON Export / Import (gesamter Fortschritt) ----

  $btnExport.addEventListener("click", () => {
    Storage.exportiereAlsDatei(zustand);
    zeigeToast("Fortschritt wurde als Datei heruntergeladen.");
  });

  $btnImportTrigger.addEventListener("click", () => $inputImportZustand.click());

  $inputImportZustand.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const neuerZustand = await Storage.importiereAusDatei(file);
      zustand = neuerZustand;
      Storage.speichereZustand(zustand);
      renderAlles();
      zeigeToast(`Fortschritt aus „${file.name}“ wurde geladen.`);
    } catch (err) {
      console.error(err);
      zeigeToast("Diese Datei konnte nicht gelesen werden.", true);
    } finally {
      $inputImportZustand.value = "";
    }
  });

  // ---- CSV-Import neuer Karteikarten ----

  function importiereCsvDateien(fileList) {
    const dateien = Array.from(fileList).filter((f) =>
      f.name.toLowerCase().endsWith(".csv")
    );
    if (dateien.length === 0) {
      zeigeToast("Keine CSV-Datei erkannt. Bitte eine .csv-Datei auswählen.", true);
      return;
    }

    let gesamtNeu = 0;
    let verbleibend = dateien.length;

    dateien.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const neueKarten = Storage.parseCSV(e.target.result, file.name);
          zustand.karten = zustand.karten.concat(neueKarten);
          gesamtNeu += neueKarten.length;
        } catch (err) {
          console.error("Fehler beim Parsen von", file.name, err);
          zeigeToast(`„${file.name}“ konnte nicht gelesen werden.`, true);
        } finally {
          verbleibend -= 1;
          if (verbleibend === 0) {
            Storage.speichereZustand(zustand);
            renderAlles();
            zeigeToast(
              gesamtNeu > 0
                ? `${gesamtNeu} neue Karteikarte(n) importiert und in „Unbearbeitete Karteikarten“ abgelegt.`
                : "Es wurden keine neuen Karten in der Datei gefunden."
            );
          }
        }
      };
      reader.onerror = () => {
        verbleibend -= 1;
        zeigeToast(`„${file.name}“ konnte nicht gelesen werden.`, true);
      };
      reader.readAsText(file, "utf-8");
    });
  }

  // ---- Alle Karteikarten löschen ----

  const $btnAlleLoeschen = document.getElementById("btn-alle-loeschen");
  const $loeschenBestaetigung = document.getElementById("loeschen-bestaetigung");
  const $btnLoeschenJa = document.getElementById("btn-loeschen-ja");
  const $btnLoeschenNein = document.getElementById("btn-loeschen-nein");

  $btnAlleLoeschen.addEventListener("click", () => {
    $loeschenBestaetigung.hidden = false;
    $btnAlleLoeschen.hidden = true;
  });

  $btnLoeschenNein.addEventListener("click", () => {
    $loeschenBestaetigung.hidden = true;
    $btnAlleLoeschen.hidden = false;
  });

  $btnLoeschenJa.addEventListener("click", () => {
    zustand.karten = [];
    Storage.speichereZustand(zustand);
    $loeschenBestaetigung.hidden = true;
    $btnAlleLoeschen.hidden = false;
    renderAlles();
    zeigeToast("Alle Karteikarten wurden unwiderruflich gelöscht.");
  });

  $btnCsvWaehlen.addEventListener("click", () => $inputCsv.click());

  $inputCsv.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
      importiereCsvDateien(e.target.files);
    }
    $inputCsv.value = "";
  });

  ["dragenter", "dragover"].forEach((evt) => {
    $importZone.addEventListener(evt, (e) => {
      e.preventDefault();
      $importZone.classList.add("import-zone--dragover");
    });
  });
  ["dragleave", "drop"].forEach((evt) => {
    $importZone.addEventListener(evt, (e) => {
      e.preventDefault();
      $importZone.classList.remove("import-zone--dragover");
    });
  });
  $importZone.addEventListener("drop", (e) => {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      importiereCsvDateien(e.dataTransfer.files);
    }
  });

  // ---- Start ----
  renderAlles();
})();
