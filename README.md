# Phasmo Overlay

Ein Always-on-Top-Overlay für **Phasmophobia** mit der vollen Geister-/Beweis-Logik
des Cheat-Sheets (inspiriert von tybayn's Phasmo Cheat Sheet). Du klickst die
gefundenen Beweise an, das Overlay filtert die passenden Geister und zeigt dir
Tempo, Jagd-Schwelle, Verhalten und Tipps.

> **Hinweis zur Journal-Sync:** Eine automatische Verbindung mit dem In-Game-Journal
> ist nicht enthalten – Phasmophobia bietet dafür keine offizielle Schnittstelle,
> und das Auslesen des Spielspeichers wäre unzuverlässig und könnte (Anti-Cheat) zum
> Bann führen. Du trägst die Beweise stattdessen ins Overlay ein.

## Starten

1. **Doppelklick auf `start.bat`** – beim ersten Mal wird Electron automatisch
   installiert (einmalig, ein paar hundert MB), danach startet das Overlay.

   Alternativ im Terminal:
   ```
   npm install
   npm start
   ```

## Wichtig: Spiel im Borderless-Modus

Damit das Overlay über dem Spiel sichtbar ist, stelle Phasmophobia in den
**Optionen → Anzeige** auf **Borderless** (Rahmenloses Fenster) oder **Windowed**.
Über echtem Vollbild (Exclusive Fullscreen) können sich keine Overlays legen.

## Bedienung

- **Linksklick** auf einen Beweis = *gefunden* (grün ✔)
- **Rechtsklick** auf einen Beweis = *ausschließen* (rot ✕)
- Erneuter Klick hebt den Zustand wieder auf.
- Geist anklicken = Details ein-/ausklappen.
- Titelleiste ziehen = Overlay verschieben.

### Tastenkürzel (global, auch während des Spiels)

| Kürzel | Funktion |
|---|---|
| `Strg + Shift + O` | Overlay ein-/ausblenden |
| `Strg + Shift + C` | Klick-durch ein/aus (Maus geht ans Spiel, Overlay bleibt sichtbar) |
| `Strg + Shift + R` | Alle Beweise zurücksetzen |

### Einstellungen (⚙)

- **Sichtbare Beweise**: 3 (Amateur–Profi), 2 (Albtraum), 1 (Wahnsinn), 0 (Apokalypse).
  Bei weniger Beweisen schließt das Filtern entsprechend vorsichtiger aus.
- **Deckkraft**, **unmögliche Geister anzeigen**, **Verhalten/Tipps anzeigen**.

## Eigene Beweis-Icons (echte Spielgrafiken)

Die Beweis-Symbole sind eingebaute Vektor-Grafiken. Wenn du stattdessen die
**echten Spielgrafiken** möchtest, lege einfach passende PNGs (am besten mit
transparentem Hintergrund) in den Ordner `renderer/icons/` – sie werden beim
nächsten Start automatisch verwendet:

| Datei | ersetzt |
|---|---|
| `renderer/icons/emf.png` | EMF-Reader-Symbol |
| `renderer/icons/spiritbox.png` | Spirit-Box-Symbol |

Fehlt eine Datei, wird automatisch das eingebaute Vektor-Icon angezeigt.
(Weitere Beweise lassen sich in `renderer/data.js` per `png:`-Eintrag genauso umstellen.)

## Aufbau

| Datei | Zweck |
|---|---|
| `main.js` | Electron-Hauptprozess: transparentes Always-on-Top-Fenster, globale Hotkeys |
| `preload.js` | sichere Brücke zwischen Fenster und Hauptprozess |
| `renderer/data.js` | Geister-Daten (Beweise, Tempo, Jagd, Verhalten) |
| `renderer/app.js` | Filter-Logik + Oberfläche |
| `renderer/index.html`, `styles.css` | Layout & Design |
