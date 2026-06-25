// ============================================================================
// app.js – Logik der Lernseite (index.html)
// ============================================================================

(function () {
  "use strict";

  let zustand = Storage.ladeZustand();
  Storage.speichereZustand(zustand); // direkt persistieren, falls neu initialisiert

  // Welcher Stapel ist aktuell zum Lernen ausgewählt? "alle" = kompletter Kasten
  // (alles außer den bereits 3x gemeisterten Karten, die gelten als "fertig").
  let aktiverFilter = leseFilterAusURL() || "alle";
  let lernKarten = []; // aktuell gefilterte, zu lernende Karten (Reihenfolge fix für die Session)
  let aktuellerIndex = 0;
  let istUmgedreht = false;
  let gesperrt = false; // verhindert Doppelklicks während der Flip-Animation

  // DOM-Referenzen
  const $stapelleiste = document.getElementById("stapelleiste");
  const $karte = document.getElementById("karte");
  const $karteVorder = document.getElementById("karte-vorderseite");
  const $karteRueck = document.getElementById("karte-rueckseite");
  const $antwortButtons = document.getElementById("antwort-buttons");
  const $btnFalsch = document.getElementById("btn-falsch");
  const $btnRichtig = document.getElementById("btn-richtig");
  const $fortschrittszeile = document.getElementById("fortschrittszeile");
  const $fortschrittText = document.getElementById("fortschritt-text");
  const $fortschrittFuellung = document.getElementById("fortschrittsbalken-fuellung");
  const $btnExport = document.getElementById("btn-export");
  const $toast = document.getElementById("toast");

  function leseFilterAusURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get("stapel");
  }

  function zeigeToast(text, istFehler) {
    $toast.textContent = text;
    $toast.classList.toggle("toast--fehler", !!istFehler);
    $toast.classList.add("toast--sichtbar");
    clearTimeout($toast._timeout);
    $toast._timeout = setTimeout(() => {
      $toast.classList.remove("toast--sichtbar");
    }, 2400);
  }

  /**
   * Liefert die Liste der Karten für den aktuell gewählten Filter.
   * "alle" zeigt alle Karten, die noch nicht 3x gemeistert wurden, zuerst
   * die unbearbeiteten, danach die zur Wiederholung anstehenden – plus die
   * fertig gemeisterten ganz am Schluss, falls man sie auffrischen möchte.
   */
  function ermittleKartenFuerFilter(filter) {
    const alle = zustand.karten;
    if (filter === "alle") {
      // Sinnvolle Lernreihenfolge: unbearbeitet -> die mit Fehlern (absteigend
      // nach Dringlichkeit) -> die mit wenig Richtig-Treffern -> gemeisterte
      const reihenfolge = {
        unbearbeitet: 0,
        "3x-falsch": 1,
        "2x-falsch": 2,
        "1x-falsch": 3,
        "1x-richtig": 4,
        "2x-richtig": 5,
        "3x-richtig": 6,
      };
      return alle
        .slice()
        .sort((a, b) => (reihenfolge[a.status] ?? 9) - (reihenfolge[b.status] ?? 9));
    }
    return alle.filter((k) => k.status === filter);
  }

  function baueStapelleiste() {
    const gruppen = Storage.gruppiereNachStapel(zustand.karten);
    const gesamt = zustand.karten.length;

    const chips = [];
    chips.push({ key: "alle", label: "Alle Karten", anzahl: gesamt });
    STAPEL_REIHENFOLGE.forEach((s) => {
      chips.push({ key: s, label: STAPEL_LABELS[s], anzahl: gruppen[s].length });
    });

    $stapelleiste.innerHTML = "";
    chips.forEach((chip) => {
      const el = document.createElement("button");
      el.className = "stapel-chip" + (chip.key === aktiverFilter ? " stapel-chip--aktiv" : "");
      el.setAttribute("role", "tab");
      el.setAttribute("aria-selected", chip.key === aktiverFilter ? "true" : "false");
      el.innerHTML = `${escapeHtml(chip.label)} <span class="stapel-chip__zahl">${chip.anzahl}</span>`;
      el.addEventListener("click", () => waehleFilter(chip.key));
      $stapelleiste.appendChild(el);
    });
  }

  function waehleFilter(filter) {
    aktiverFilter = filter;
    const url = new URL(window.location.href);
    if (filter === "alle") {
      url.searchParams.delete("stapel");
    } else {
      url.searchParams.set("stapel", filter);
    }
    window.history.replaceState({}, "", url);
    starteSession();
    baueStapelleiste();
  }

  function starteSession() {
    lernKarten = ermittleKartenFuerFilter(aktiverFilter);
    aktuellerIndex = 0;
    istUmgedreht = false;
    zeigeAktuelleKarte();
  }

  function aktualisiereFortschrittsanzeige() {
    if (lernKarten.length === 0) {
      $fortschrittszeile.hidden = true;
      return;
    }
    $fortschrittszeile.hidden = false;
    const aktuelleNr = Math.min(aktuellerIndex + 1, lernKarten.length);
    $fortschrittText.textContent = `${aktuelleNr} / ${lernKarten.length}`;
    const prozent = (aktuellerIndex / lernKarten.length) * 100;
    $fortschrittFuellung.style.width = `${prozent}%`;
  }

  function zeigeAktuelleKarte() {
    istUmgedreht = false;
    $karte.classList.remove("karte--umgedreht");
    $antwortButtons.classList.remove("antwort-buttons--sichtbar");
    aktualisiereFortschrittsanzeige();

    if (lernKarten.length === 0) {
      $karte.classList.add("karte--leer");
      $karte.setAttribute("tabindex", "-1");
      const meldung = aktiverFilter === "alle"
        ? "Dein Karteikasten ist leer. Füge im Bereich „Stapelübersicht“ neue Karteikarten hinzu."
        : "Dieser Stapel ist gerade leer. Wechsle zu einem anderen Stapel oder zur Stapelübersicht.";
      $karteVorder.innerHTML = `<div class="karte__text">${escapeHtml(meldung)}</div>`;
      $karteRueck.innerHTML = "";
      return;
    }

    if (aktuellerIndex >= lernKarten.length) {
      $karte.classList.add("karte--leer");
      $karte.setAttribute("tabindex", "-1");
      $karteVorder.innerHTML = `<div class="karte__text">🎉 Geschafft! Du hast diesen Stapel komplett durchgearbeitet.<br><br>Wähle oben einen Stapel, um weiterzumachen.</div>`;
      $karteRueck.innerHTML = "";
      return;
    }

    $karte.classList.remove("karte--leer");
    $karte.setAttribute("tabindex", "0");

    const karteDaten = lernKarten[aktuellerIndex];
    $karteVorder.innerHTML = `
      <div class="karte__thema">${escapeHtml(karteDaten.themencluster)}</div>
      <div class="karte__kicker">Frage</div>
      <div class="karte__text">${escapeHtml(karteDaten.frage)}</div>
      <div class="karte__hinweis">Tippen oder Leertaste zum Umdrehen</div>
    `;
    $karteRueck.innerHTML = `
      <div class="karte__thema">${escapeHtml(karteDaten.themencluster)}</div>
      <div class="karte__kicker">Antwort</div>
      <div class="karte__text">${escapeHtml(karteDaten.antwort)}</div>
      <div class="karte__hinweis">Wie hast du abgeschnitten?</div>
    `;
  }

  function dreheKarteUm() {
    if (gesperrt) return;
    if (lernKarten.length === 0 || aktuellerIndex >= lernKarten.length) return;
    istUmgedreht = !istUmgedreht;
    $karte.classList.toggle("karte--umgedreht", istUmgedreht);
    $antwortButtons.classList.toggle("antwort-buttons--sichtbar", istUmgedreht);
  }

  function beantworte(warRichtig) {
    if (gesperrt) return;
    if (lernKarten.length === 0 || aktuellerIndex >= lernKarten.length) return;
    if (!istUmgedreht) return; // erst umdrehen, dann bewerten

    gesperrt = true;
    const karteDaten = lernKarten[aktuellerIndex];

    // Im globalen Zustand die echte Karte (per id) aktualisieren
    const echteKarte = zustand.karten.find((k) => k.id === karteDaten.id);
    if (echteKarte) {
      Storage.wertePantwortAus(echteKarte, warRichtig);
    }
    Storage.speichereZustand(zustand);
    baueStapelleiste();

    zeigeToast(warRichtig ? "Richtig! Weiter so." : "Kein Problem – kommt nochmal dran.", false);

    setTimeout(() => {
      aktuellerIndex += 1;
      gesperrt = false;
      zeigeAktuelleKarte();
    }, 260);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  // ---- Event-Listener ----

  $karte.addEventListener("click", dreheKarteUm);
  $karte.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      dreheKarteUm();
    }
  });

  $btnFalsch.addEventListener("click", () => beantworte(false));
  $btnRichtig.addEventListener("click", () => beantworte(true));

  document.addEventListener("keydown", (e) => {
    const aktiv = document.activeElement;
    const inEingabefeld = aktiv && (aktiv.tagName === "INPUT" || aktiv.tagName === "TEXTAREA");
    if (inEingabefeld) return;

    if (e.code === "Space") {
      e.preventDefault();
      dreheKarteUm();
    } else if (e.key.toLowerCase() === "f") {
      beantworte(false);
    } else if (e.key.toLowerCase() === "r") {
      beantworte(true);
    }
  });

  $btnExport.addEventListener("click", () => {
    Storage.exportiereAlsDatei(zustand);
    zeigeToast("Fortschritt wurde als Datei heruntergeladen.");
  });

  // ---- Start ----
  baueStapelleiste();
  starteSession();
})();
