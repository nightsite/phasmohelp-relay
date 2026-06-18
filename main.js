const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require('electron');
const path = require('path');
const https = require('https');
const config = require('./config');

let win = null;
let clickThrough = false;
let capturingHotkey = false;

// uiohook-Referenzen (werden in registerInputHook gesetzt)
let UiohookKey = null;
let keyName = {}; // keycode -> Name (für Labels)

function defaultHotkey() {
  const code = UiohookKey ? UiohookKey.H : 35;
  return { type: 'key', code, label: 'H' };
}

function currentHotkey() {
  const cfg = config.load();
  return cfg.hotkey || defaultHotkey();
}

function createWindow() {
  const primary = screen.getPrimaryDisplay();
  const { width: sw, height: sh } = primary.workAreaSize;
  const cfg = config.load();

  const winWidth = 380;
  const winHeight = Math.min(sh - 40, 900);

  win = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: sw - winWidth - 16, // dock to top-right by default
    y: 16,
    frame: false,
    transparent: true,
    resizable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    fullscreenable: false,
    minWidth: 280,
    minHeight: 200,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Float above borderless/windowed games.
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Gespeicherte Fenster-Einstellungen anwenden.
  win.setOpacity(clamp(cfg.opacity, 0.2, 1));
  win.setContentProtection(!!cfg.contentProtection);

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomFactor(clamp(cfg.scale, 0.6, 2));
    checkUpdate();
  });

  win.on('closed', () => {
    win = null;
  });
}

function clamp(v, lo, hi) {
  v = Number(v);
  if (Number.isNaN(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function toggleVisibility() {
  if (!win) return;
  if (win.isVisible()) win.hide();
  else win.show();
}

// Globaler, NICHT-blockierender Input-Hook (Tastatur + Maus) für den Toggle-Hotkey.
function registerInputHook() {
  try {
    const uio = require('uiohook-napi');
    const { uIOhook } = uio;
    UiohookKey = uio.UiohookKey;
    keyName = {};
    for (const [name, code] of Object.entries(UiohookKey || {})) keyName[code] = name;

    let last = 0;
    const fireToggle = () => {
      const now = Date.now();
      if (now - last < 250) return; // Entprellung
      last = now;
      toggleVisibility();
    };

    uIOhook.on('keydown', (e) => {
      if (capturingHotkey) {
        finishCapture({ type: 'key', code: e.keycode, label: keyName[e.keycode] || ('Taste ' + e.keycode) });
        return;
      }
      const hk = currentHotkey();
      if (hk.type === 'key' && e.keycode === hk.code) fireToggle();
    });

    uIOhook.on('mousedown', (e) => {
      if (capturingHotkey) {
        finishCapture({ type: 'mouse', code: e.button, label: 'Maus ' + e.button });
        return;
      }
      const hk = currentHotkey();
      if (hk.type === 'mouse' && e.button === hk.code) fireToggle();
    });

    uIOhook.start();
    app.on('will-quit', () => {
      try { uIOhook.stop(); } catch (_) {}
    });
  } catch (err) {
    console.error('Input-Hook nicht verfügbar:', err && err.message);
  }
}

function finishCapture(binding) {
  capturingHotkey = false;
  config.save({ hotkey: binding });
  if (win) win.webContents.send('hotkey-captured', binding);
}

function setClickThrough(value) {
  if (!win) return;
  clickThrough = value;
  win.setIgnoreMouseEvents(value, { forward: true });
  win.webContents.send('clickthrough-changed', value);
}

function registerShortcuts() {
  globalShortcut.register('CommandOrControl+Shift+O', toggleVisibility);
  globalShortcut.register('CommandOrControl+Shift+C', () => setClickThrough(!clickThrough));
  globalShortcut.register('CommandOrControl+Shift+R', () => {
    if (win) win.webContents.send('reset-evidence');
  });
}

// --- Auto-Update-Check (optional, nur wenn updateUrl gesetzt ist) ---
function checkUpdate() {
  const cfg = config.load();
  if (!cfg.updateUrl) return;
  https
    .get(cfg.updateUrl, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          const info = JSON.parse(data);
          if (info.version && isNewer(info.version, app.getVersion())) {
            if (win) win.webContents.send('update-status', { available: true, version: info.version, url: info.url || '' });
          }
        } catch (_) {}
      });
    })
    .on('error', () => {});
}

function isNewer(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

app.whenReady().then(() => {
  createWindow();
  registerShortcuts();
  registerInputHook();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());

// --- IPC from renderer ---
ipcMain.handle('get-config', () => {
  const cfg = config.load();
  return { ...cfg, hotkey: cfg.hotkey || defaultHotkey() };
});
ipcMain.handle('set-config', (_e, patch) => {
  const cfg = config.save(patch || {});
  if (win) {
    if (patch && 'opacity' in patch) win.setOpacity(clamp(cfg.opacity, 0.2, 1));
    if (patch && 'scale' in patch) win.webContents.setZoomFactor(clamp(cfg.scale, 0.6, 2));
    if (patch && 'contentProtection' in patch) win.setContentProtection(!!cfg.contentProtection);
  }
  return cfg;
});
ipcMain.handle('start-hotkey-capture', () => { capturingHotkey = true; });
ipcMain.handle('cancel-hotkey-capture', () => { capturingHotkey = false; });

ipcMain.handle('set-clickthrough', (_e, value) => setClickThrough(!!value));
ipcMain.handle('toggle-clickthrough', () => setClickThrough(!clickThrough));
ipcMain.handle('set-opacity', (_e, value) => {
  if (win) win.setOpacity(clamp(value, 0.2, 1));
});
ipcMain.handle('quit', () => app.quit());
ipcMain.handle('minimize', () => { if (win) win.minimize(); });
