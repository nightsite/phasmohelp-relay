// Einfache Settings-Persistenz als JSON unter dem userData-Ordner.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const defaults = {
  hotkey: null,            // {type:'key'|'mouse', code, label} – null => Default (H) in main.js
  opacity: 1,
  scale: 1,                // Zoomfaktor des Overlays
  contentProtection: false,// Stream-sicher (nicht in OBS/Aufnahmen)
  updateUrl: '',           // optionale URL zu version.json für Auto-Update-Check
  sync: { serverUrl: 'wss://phasmohelp-relay.onrender.com', room: '', name: '', color: '' },
};

let configPath = null;
let cache = null;

function ensurePath() {
  if (!configPath) configPath = path.join(app.getPath('userData'), 'config.json');
  return configPath;
}

function load() {
  if (cache) return cache;
  try {
    const raw = JSON.parse(fs.readFileSync(ensurePath(), 'utf8'));
    cache = { ...defaults, ...raw, sync: { ...defaults.sync, ...(raw.sync || {}) } };
  } catch (_) {
    cache = { ...defaults, sync: { ...defaults.sync } };
  }
  return cache;
}

function save(patch) {
  const cur = load();
  const next = { ...cur, ...patch };
  if (patch && patch.sync) next.sync = { ...cur.sync, ...patch.sync };
  cache = next;
  try {
    fs.writeFileSync(ensurePath(), JSON.stringify(next, null, 2));
  } catch (e) {
    console.error('Config speichern fehlgeschlagen:', e && e.message);
  }
  return cache;
}

module.exports = { load, save, defaults };
