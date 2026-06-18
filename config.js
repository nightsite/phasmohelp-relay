// Einfache Settings-Persistenz als JSON unter dem userData-Ordner.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const defaults = {
  hotkey: null,
  opacity: 1,
  scale: 1,
  contentProtection: false,
  updateUrl: '',
  sync: { serverUrl: 'wss://phasmohelp-relay.onrender.com', room: '', name: '', color: '' },
  bounds: null,
  ui: {
    compact: false,
    minimal: false,
    streamLayout: false,
    ghostCompact: false,
    ghostSearchOnlyPossible: true,
    page: 'main',
    accent: '#7c5cff',
    theme: 'default',
    animations: true,
  },
  firstRunComplete: false,
};

let configPath = null;
let cache = null;

function ensurePath() {
  if (!configPath) configPath = path.join(app.getPath('userData'), 'config.json');
  return configPath;
}

function mergeUi(raw) {
  const ui = { ...defaults.ui, ...(raw || {}) };
  if (!ui.page && ui.panels) {
    const { sync, settings } = ui.panels;
    if (settings) ui.page = 'settings';
    else if (sync) ui.page = 'sync';
    else ui.page = 'main';
  }
  if (!['main', 'sync', 'settings'].includes(ui.page)) ui.page = 'main';
  delete ui.panels;
  return ui;
}

function load() {
  if (cache) return cache;
  try {
    const raw = JSON.parse(fs.readFileSync(ensurePath(), 'utf8'));
    cache = {
      ...defaults,
      ...raw,
      sync: { ...defaults.sync, ...(raw.sync || {}) },
      ui: mergeUi(raw.ui),
    };
  } catch (_) {
    cache = { ...defaults, sync: { ...defaults.sync }, ui: { ...defaults.ui } };
  }
  return cache;
}

function save(patch) {
  const cur = load();
  const next = { ...cur, ...patch };
  if (patch && patch.sync) next.sync = { ...cur.sync, ...patch.sync };
  if (patch && patch.ui) {
    next.ui = { ...cur.ui, ...patch.ui };
    if (patch.ui.page) next.ui.page = patch.ui.page;
  }
  cache = next;
  try {
    fs.writeFileSync(ensurePath(), JSON.stringify(next, null, 2));
  } catch (e) {
    console.error('Config speichern fehlgeschlagen:', e && e.message);
  }
  return cache;
}

module.exports = { load, save, defaults };
