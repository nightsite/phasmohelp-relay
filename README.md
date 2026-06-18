# Phasmo Overlay

Always-on-top-Hilfe für **Phasmophobia**: Beweise filtern, Geister-Tipps, Online-Sync.

## Ordnerstruktur

```
phasmohelp/
├── PhasmoOverlay.bat      ← App starten (gebaut)
├── start-dev.bat          ← Entwicklung (npm start)
├── main.js, renderer/     ← App-Quellcode
├── build/icon.png         ← App-Icon
├── server/                ← Online-Relay (Cloud)
├── dist/
│   ├── PhasmoOverlay/PhasmoOverlay.exe
│   └── PhasmoOverlay-Setup-x.x.x.exe   ← Windows-Installer
└── .github/workflows/     ← Release-Build bei Git-Tag v*
```

## Freunden teilen (eine Datei reicht)

**Nicht** den ganzen `dist/PhasmoOverlay/`-Ordner schicken — das sind viele DLLs.

| Datei | Für wen |
|-------|---------|
| **`PhasmoOverlay-Portable-1.0.0.exe`** | Einfachste Option: eine Datei, Doppelklick, fertig (kein Install) |
| **`PhasmoOverlay-Setup-1.0.0.exe`** | Mit Installer + Desktop-Verknüpfung |

Beide liegen nach einem Release auf GitHub unter **Releases**:
https://github.com/nightsite/phasmohelp-relay/releases

Link an Freunde schicken → Portable oder Setup runterladen → starten. Sync-Relay läuft online, nichts extra installieren.

Lokal bauen: `npm run dist:release` → Dateien in `dist/`

## App starten

### Gebaut (empfohlen)
1. `npm run dist` (Ordner) oder `npm run dist:installer` (Installer + Ordner)
2. **`PhasmoOverlay.bat`** oder `dist\PhasmoOverlay\PhasmoOverlay.exe`

### Entwicklung
`start-dev.bat` oder `npm start`

## Features (Polish)

| Feature | Beschreibung |
|---------|--------------|
| Fenster merken | Position & Größe werden gespeichert |
| System Tray | Minimieren → Tray, Rechtsklick-Menü |
| Kompakt-Modus | Nur Beweise + Status (⚙) |
| Themes | Standard / Midnight / Ember + Akzentfarbe |
| Sync-Status | Dot: grau/gelb/grün/rot + Raum & Ping |
| Auto-Update | Über GitHub Releases (gebaute .exe) |
| Erststart-Assistent | Willkommen, Hotkey, Schwierigkeit |

## Online-Sync

Relay: `wss://phasmohelp-relay.onrender.com` + gleicher Raumcode im 🔗-Panel.

## Spiel-Einstellungen

Phasmophobia: **Borderless** oder **Windowed**.

## Bedienung

| Aktion | Funktion |
|---|---|
| Linksklick Beweis | gefunden ✔ |
| Rechtsklick Beweis | ausgeschlossen ✕ |
| `1`–`7` (Haupttastatur/NumPad) | Beweis zyklisch ✔/✕/neutral (nur wenn Overlay sichtbar) |
| `H` (änderbar) | Overlay ein/aus |
| `Strg+Z` | Letzten Beweis rückgängig |
| `Strg+Shift+C` | Klick-durch |
| `Strg+Shift+R` | Beweise zurücksetzen |

Navigation oben in der Titelleiste: 🖐 Hauptseite · 🔗 Sync · ⚙ Einstellungen · ⟳ Reset.
Schließen/Minimieren laufen über das **System-Tray** (Rechtsklick aufs Tray-Icon).

## Releases

Tag `v1.0.1` pushen → GitHub Action baut Installer und lädt Assets hoch.
