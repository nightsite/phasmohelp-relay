const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlay', {
  setClickThrough: (value) => ipcRenderer.invoke('set-clickthrough', value),
  toggleClickThrough: () => ipcRenderer.invoke('toggle-clickthrough'),
  setOpacity: (value) => ipcRenderer.invoke('set-opacity', value),
  quit: () => ipcRenderer.invoke('quit'),
  minimize: () => ipcRenderer.invoke('minimize'),
  showWindow: () => ipcRenderer.invoke('show-window'),
  signalReady: () => ipcRenderer.invoke('renderer-ready'),

  getConfig: () => ipcRenderer.invoke('get-config'),
  getVersion: () => ipcRenderer.invoke('get-version'),
  setConfig: (patch) => ipcRenderer.invoke('set-config', patch),
  exportConfig: () => ipcRenderer.invoke('export-config'),
  importConfig: () => ipcRenderer.invoke('import-config'),
  openLogs: () => ipcRenderer.invoke('open-logs'),

  startHotkeyCapture: () => ipcRenderer.invoke('start-hotkey-capture'),
  cancelHotkeyCapture: () => ipcRenderer.invoke('cancel-hotkey-capture'),
  onHotkeyCaptured: (cb) => ipcRenderer.on('hotkey-captured', (_e, binding) => cb(binding)),

  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  checkUpdate: () => ipcRenderer.invoke('check-update'),

  onClickThroughChanged: (cb) => ipcRenderer.on('clickthrough-changed', (_e, v) => cb(v)),
  onReset: (cb) => ipcRenderer.on('reset-evidence', () => cb()),
  onUpdateStatus: (cb) => ipcRenderer.on('update-status', (_e, info) => cb(info)),
  onConfigImported: (cb) => ipcRenderer.on('config-imported', (_e, cfg) => cb(cfg)),
  onGameStarted: (cb) => ipcRenderer.on('game-started', () => cb()),
  onGameStopped: (cb) => ipcRenderer.on('game-stopped', () => cb()),
  onJournalUpdate: (cb) => ipcRenderer.on('journal-update', (_e, data) => cb(data)),
  onEvidenceKey: (cb) => ipcRenderer.on('evidence-key', (_e, index) => cb(index)),
  onUndoEvidence: (cb) => ipcRenderer.on('undo-evidence', () => cb()),
  onSetMinimal: (cb) => ipcRenderer.on('set-minimal', (_e, v) => cb(v)),
  onOverlayMode: (cb) => ipcRenderer.on('overlay-mode', (_e, mode) => cb(mode)),
  setMiniBounds: (width, height) => ipcRenderer.invoke('set-mini-bounds', { width, height }),
});
