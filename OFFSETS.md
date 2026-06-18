# Phasmophobia-Journal auslesen — Offsets finden

> ⚠️ **Risiko:** Phasmophobia läuft mit Easy Anti-Cheat (EAC). Den Spielprozess auszulesen kann
> als Cheat gewertet werden → **Bann-Risiko für deinen Account**. Außerdem kann EAC den
> Lese-Zugriff komplett verweigern; dann funktioniert das Auslesen gar nicht und das Overlay
> nutzt automatisch die manuelle Eingabe. Aktivierung nur auf eigene Verantwortung.

Das Overlay liest **nichts** aus dem Spiel, solange in `phasmo-offsets.json` nur Platzhalter
(`base: "0x0"`) stehen. Damit Geistername & aktive Ziele automatisch erscheinen, musst du die
versionsspezifischen Pointer-Pfade einmalig selbst ermitteln und eintragen. Sie ändern sich bei
**jedem Spiel-Patch**.

## Wo liegt die Datei?
- Mitgeliefert: `phasmo-offsets.json` im App-Ordner.
- Bevorzugt (überlebt Updates): Kopie im App-Datenordner. Der genaue Pfad steht im Log
  (⚙ Einstellungen → „Logs"), Zeile `Offsets geladen aus …` bzw. `Offsets-Datei gesucht in …`.

## Werkzeuge
- **Cheat Engine** (Pointer-Scan) — zum Finden stabiler Pointer-Pfade.
- **Il2CppDumper** (optional) — dumpt die IL2CPP-Klassen/Feld-Offsets von `GameAssembly.dll`,
  damit du Feldnamen statt blindem Raten hast.

## Konvention der Pointer-Pfade
Das Overlay folgt einer klassischen Cheat-Engine-Kette relativ zu `GameAssembly.dll`:

```
addr = ModulBasis(GameAssembly.dll) + base
für jeden offset in offsets:  addr = [addr] + offset
```

`addr` ist am Ende die **Feldadresse**. Für String-Felder liegt dort ein **Pointer auf das
.NET-String-Objekt**; das Overlay dekodiert es selbst (Länge @ +0x10, UTF-16 @ +0x14).

## Schritt für Schritt
1. Phasmophobia starten, eine Runde laden (Geist + Vertragsziele existieren erst dann).
2. In Cheat Engine an `Phasmophobia.exe` anhängen.
3. **Geistername:** Nach dem im Truck/Journal gezeigten Namen (z.B. „Harold Martin") als
   `UTF-16 String` suchen → Pointer-Scan, bis ein stabiler Pfad über `GameAssembly.dll` bleibt
   (Spiel/Runde neu starten und gegenprüfen).
4. `base` = Modul-relativer Startoffset, `offsets` = die Pointer-Kette bis zum **Feld**, das den
   String-Pointer hält.
5. **Ziele:** Analog die Objective-Liste/-Array finden. Trage ein:
   - `objectives.base` / `objectives.offsets` → Listen-/Array-Objekt
   - `count.offset` → int32 mit der Anzahl (bei `List<T>` meist `0x18`, beim Array `0x18`)
   - `items.first` → Offset zum ersten Element-Pointer (Array-Daten beginnen oft bei `0x20`)
   - `items.stride` → Abstand der Element-Pointer (`0x8`)
   - `item.text` → Offset des Beschreibungs-Strings im Objective-Objekt
   - `item.done` → Offset des „erledigt"-Bool im Objective-Objekt (weglassen, wenn unbekannt)
6. `gameVersion` auf die aktuelle Spielversion setzen (nur Doku, damit du nach einem Patch weißt,
   dass die Werte neu ermittelt werden müssen).

## Beispiel (ausgefüllt — Werte sind FIKTIV, ersetzen!)
```json
{
  "gameVersion": "0.x.y",
  "exe": "Phasmophobia.exe",
  "module": "GameAssembly.dll",
  "ghostName": { "base": "0x03ABly1234", "offsets": ["0xB8", "0x28", "0x10"] },
  "objectives": {
    "base": "0x03ABCDE0", "offsets": ["0xB8", "0x40"],
    "count": { "offset": "0x18" },
    "items": { "first": "0x20", "stride": "0x8" },
    "item": { "text": "0x10", "done": "0x20" }
  }
}
```

## Wenn nichts erscheint
- Toggle „Spiel-Journal auslesen" in den Einstellungen an? Spiel läuft + Runde geladen?
- Log prüfen (⚙ → Logs). Häufige Ursachen: EAC verweigert das Handle (dann ist nur der manuelle
  Modus möglich), falsche/veraltete Offsets, oder die Werte stammen aus einer anderen Spielversion.
