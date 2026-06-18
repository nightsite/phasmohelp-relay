const {
  app, BrowserWindow, globalShortcut, ipcMain, screen, Tray, Menu, nativeImage, dialog, shell,
} = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const config = require('./config');
const logger = require('./logger');

const iconPath = path.join(__dirname, 'build', 'icon.png');
const GAME_EXE = 'Phasmophobia.exe';

let win = null;
let rendererReady = false;
let fullBoundsBeforeMini = null;
let pendingReveal = false;
let tray = null;
let clickThrough = false;
let overlayShown = true; // logisch sichtbar? (Toggle via Opacity, nicht hide/show)
let capturingHotkey = false;
let gameRunning = false;
let gamePollTimer = null;
let boundsSaveTimer = null;

let UiohookKey = null;
let keyName = {};

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win || win.isDestroyed()) return;
    revealWindow();
    win.focus();
  });
}

function clamp(v, lo, hi) {
  v = Number(v);
  if (Number.isNaN(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function getIcon() {
  try {
    if (fs.existsSync(iconPath)) return nativeImage.createFromPath(iconPath);
  } catch (err) {
    logger.warn('Icon laden fehlgeschlagen: ' + (err && err.message));
  }
  return nativeImage.createEmpty();
}

function defaultHotkey() {
  const code = UiohookKey ? UiohookKey.H : 35;
  return { type: 'key', code, label: 'H' };
}

function currentHotkey() {
  const cfg = config.load();
  return cfg.hotkey || defaultHotkey();
}

function defaultBounds() {
  const primary = screen.getPrimaryDisplay();
  const { width: sw, height: sh } = primary.workAreaSize;
  const w = 380;
  const h = Math.min(sh - 40, 900);
  return {
    x: primary.workArea.x + sw - w - 16,
    y: primary.workArea.y + 16,
    width: w,
    height: h,
  };
}

function clampBounds(bounds) {
  const w = clamp(bounds.width, 280, 2400);
  const h = clamp(bounds.height, 200, 2400);
  let x = Number(bounds.x) || 0;
  let y = Number(bounds.y) || 0;

  let onScreen = false;
  for (const d of screen.getAllDisplays()) {
    const wa = d.workArea;
    if (x + 80 > wa.x && x < wa.x + wa.width && y + 80 > wa.y && y < wa.y + wa.height) {
      onScreen = true;
      break;
    }
  }
  if (!onScreen) {
    const d = defaultBounds();
    return { ...d, width: w, height: h };
  }
  return { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) };
}

function resolveWindowBounds(cfg) {
  if (cfg.bounds && cfg.bounds.width && cfg.bounds.height) return clampBounds(cfg.bounds);
  return defaultBounds();
}

function saveBoundsDebounced() {
  if (!win || win.isDestroyed() || !overlayShown) return;
  clearTimeout(boundsSaveTimer);
  boundsSaveTimer = setTimeout(() => {
    const b = win.getBounds();
    config.save({ bounds: { x: b.x, y: b.y, width: b.width, height: b.height } });
  }, 400);
}

function isGameRunning(cb) {
  exec(`tasklist /FI "IMAGENAME eq ${GAME_EXE}" /NH`, { windowsHide: true }, (err, stdout) => {
    cb(!err && stdout.toLowerCase().includes(GAME_EXE.toLowerCase()));
  });
}

function notifyGameState(running) {
  if (!win || win.isDestroyed()) return;
  if (running) {
    revealWindow();
    win.webContents.send('game-started');
  } else {
    win.webContents.send('game-stopped');
  }
}

function pollGame() {
  isGameRunning((running) => {
    if (running && !gameRunning) {
      gameRunning = true;
      notifyGameState(true);
    } else if (!running && gameRunning) {
      gameRunning = false;
      notifyGameState(false);
    }
  });
}

function startGameWatcher() {
  pollGame();
  gamePollTimer = setInterval(pollGame, 4000);
}

function rebuildTrayMenu() {
  if (!tray) return;
  const visible = !!win && !win.isDestroyed() && overlayShown;
  const cfg = config.load();
  const items = [
    { label: visible ? 'Ausblenden' : 'Einblenden', click: toggleVisibility },
    { label: clickThrough ? 'Klick-durch aus' : 'Klick-durch an', click: () => setClickThrough(!clickThrough) },
  ];
  if (cfg.ui?.minimal) {
    items.push({
      label: 'Minimal-Modus aus',
      click: () => { if (win) win.webContents.send('set-minimal', false); },
    });
  }
  items.push({ type: 'separator' });
  items.push({ label: 'Beenden', click: () => app.quit() });
  tray.setContextMenu(Menu.buildFromTemplate(items));
}

// Zifferntasten 1–7 (Haupttastatur + NumPad) für Beweise.
const EVIDENCE_KEYCODES = new Set([2, 3, 4, 5, 6, 7, 8, 79, 80, 81, 82, 83, 84, 85]);

function evidenceIndexFromKeycode(code) {
  if (code >= 2 && code <= 8) return code - 2;
  if (code >= 79 && code <= 85) return code - 79;
  return -1;
}

function createTray() {
  const icon = getIcon();
  if (icon.isEmpty()) return;
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('Phasmo Overlay');
  rebuildTrayMenu();
  tray.on('double-click', () => {
    if (!win || win.isDestroyed()) return;
    setOverlayShown(true);
    win.focus();
  });
}

function revealWindow() {
  if (!win || win.isDestroyed()) return;
  if (!rendererReady) {
    pendingReveal = true;
    return;
  }
  setOverlayShown(true);
}

// Sichtbarkeit über Opacity statt hide/show – so bleibt das (transparente) Fenster
// dauerhaft gemappt und der Toggle ist sofort & ohne Neu-Zeichnen ("Ladebild").
function setOverlayShown(shown) {
  if (!win || win.isDestroyed()) return;
  overlayShown = shown;
  const cfg = config.load();
  if (!win.isVisible()) win.show();
  win.setOpacity(clamp(cfg.opacity, 0.2, 1));
  if (shown) {
    if (fullBoundsBeforeMini) {
      win.setBounds(fullBoundsBeforeMini);
      fullBoundsBeforeMini = null;
    }
    win.setMinimumSize(280, 200);
    win.setSkipTaskbar(false);
    win.setIgnoreMouseEvents(clickThrough, { forward: true });
  } else {
    if (!fullBoundsBeforeMini) fullBoundsBeforeMini = win.getBounds();
    win.setMinimumSize(32, 32);
    win.setSkipTaskbar(true);
    win.setIgnoreMouseEvents(true, { forward: true });
  }
  win.webContents.send('overlay-mode', shown ? 'full' : 'mini');
  rebuildTrayMenu();
}

function createWindow() {
  const cfg = config.load();
  const bounds = resolveWindowBounds(cfg);
  const icon = getIcon();
  rendererReady = false;
  pendingReveal = false;

  win = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    resizable: true,
    skipTaskbar: false,
    alwaysOnTop: true,
    hasShadow: false,
    fullscreenable: false,
    show: false,
    minWidth: 280,
    minHeight: 200,
    backgroundColor: '#00000000',
    icon: icon.isEmpty() ? undefined : icon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setOpacity(clamp(cfg.opacity, 0.2, 1));
  win.setContentProtection(!!cfg.contentProtection);

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomFactor(clamp(cfg.scale, 0.6, 2));
    checkForUpdates();
    isGameRunning((running) => {
      if (running) {
        gameRunning = true;
        win.webContents.send('game-started');
      }
    });
  });

  win.on('resize', saveBoundsDebounced);
  win.on('move', saveBoundsDebounced);
  win.on('show', rebuildTrayMenu);
  win.on('hide', rebuildTrayMenu);
  win.on('closed', () => { win = null; });
}

function toggleVisibility() {
  if (!win) return;
  setOverlayShown(!overlayShown);
}

function minimizeToTray() {
  if (!win) return;
  setOverlayShown(false);
}

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
      if (now - last < 250) return;
      last = now;
      toggleVisibility();
    };

    uIOhook.on('keydown', (e) => {
      if (capturingHotkey) {
        finishCapture({ type: 'key', code: e.keycode, label: keyName[e.keycode] || ('Taste ' + e.keycode) });
        return;
      }
      const hk = currentHotkey();
      if (hk.type === 'key' && e.keycode === hk.code) {
        fireToggle();
        return;
      }
      if (win && win.isVisible() && !clickThrough && EVIDENCE_KEYCODES.has(e.keycode)) {
        const idx = evidenceIndexFromKeycode(e.keycode);
        if (idx >= 0) win.webContents.send('evidence-key', idx);
      }
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
    logger.error('Input-Hook nicht verfügbar: ' + (err && err.message));
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
  if (overlayShown) win.setIgnoreMouseEvents(value, { forward: true });
  win.webContents.send('clickthrough-changed', value);
  rebuildTrayMenu();
}

function registerShortcuts() {
  globalShortcut.register('CommandOrControl+Shift+O', toggleVisibility);
  globalShortcut.register('CommandOrControl+Shift+C', () => setClickThrough(!clickThrough));
  globalShortcut.register('CommandOrControl+Shift+R', () => {
    if (win) win.webContents.send('reset-evidence');
  });
  globalShortcut.register('CommandOrControl+Z', () => {
    if (win) win.webContents.send('undo-evidence');
  });
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    logger.info('Update verfügbar: ' + info.version);
    if (win) {
      win.webContents.send('update-status', {
        available: true,
        version: info.version,
        downloading: false,
        downloaded: false,
      });
    }
  });

  autoUpdater.on('download-progress', (p) => {
    if (win) {
      win.webContents.send('update-status', {
        available: true,
        downloading: true,
        percent: Math.round(p.percent || 0),
        downloaded: false,
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    logger.info('Update heruntergeladen: ' + info.version);
    if (win) {
      win.webContents.send('update-status', {
        available: true,
        version: info.version,
        downloading: false,
        downloaded: true,
      });
    }
  });

  autoUpdater.on('error', (err) => {
    logger.warn('Updater-Fehler: ' + (err && err.message));
  });
}

function checkForUpdates() {
  if (!app.isPackaged) return;
  autoUpdater.checkForUpdates().catch((err) => {
    logger.warn('Update-Check fehlgeschlagen: ' + (err && err.message));
  });
}

function isNewerVersion(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

if (gotLock) {
  logger.installGlobalHandlers();

  app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('com.phasmo.overlay');

    createWindow();
    createTray();
    registerShortcuts();
    registerInputHook();
    startGameWatcher();
    setupAutoUpdater();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    if (gamePollTimer) clearInterval(gamePollTimer);
    if (boundsSaveTimer) clearTimeout(boundsSaveTimer);
  });

  app.on('window-all-closed', () => app.quit());
}

// --- IPC ---
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
  if (patch?.ui && 'minimal' in patch.ui) rebuildTrayMenu();
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
ipcMain.handle('minimize', () => minimizeToTray());
ipcMain.handle('show-window', () => revealWindow());
ipcMain.handle('renderer-ready', () => {
  rendererReady = true;
  revealWindow();
  win?.webContents.send('overlay-mode', overlayShown ? 'full' : 'mini');
});

ipcMain.handle('set-mini-bounds', (_e, { width, height }) => {
  if (!win || win.isDestroyed() || overlayShown) return;
  const b = win.getBounds();
  if (!width || !height) {
    win.setBounds({ x: b.x, y: b.y, width: 1, height: 1 }, false);
    return;
  }
  win.setBounds({
    x: b.x,
    y: b.y,
    width: Math.ceil(Math.max(36, width)),
    height: Math.ceil(Math.max(32, height)),
  }, false);
});

ipcMain.handle('download-update', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (err) {
    logger.error('Update-Download: ' + (err && err.message));
    return { ok: false, error: err && err.message };
  }
});

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle('check-update', async () => {
  if (!app.isPackaged) return { ok: false, reason: 'dev' };
  try {
    const res = await autoUpdater.checkForUpdates();
    const v = res && res.updateInfo && res.updateInfo.version;
    return { ok: true, available: !!(v && isNewerVersion(v, app.getVersion())), version: v };
  } catch (err) {
    logger.warn('Manueller Update-Check: ' + (err && err.message));
    return { ok: false, error: err && err.message };
  }
});

ipcMain.handle('export-config', async () => {
  const result = await dialog.showSaveDialog(win, {
    title: 'Einstellungen exportieren',
    defaultPath: 'phasmo-overlay-config.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return { ok: false };
  try {
    fs.writeFileSync(result.filePath, JSON.stringify(config.load(), null, 2));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err && err.message };
  }
});

ipcMain.handle('import-config', async () => {
  const result = await dialog.showOpenDialog(win, {
    title: 'Einstellungen importieren',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false };
  try {
    const raw = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
    const merged = config.save(raw);
    if (win) {
      if (merged.bounds) win.setBounds(clampBounds(merged.bounds));
      win.webContents.send('config-imported', merged);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err && err.message };
  }
});

ipcMain.handle('open-logs', () => shell.openPath(logger.getLogDir()));
