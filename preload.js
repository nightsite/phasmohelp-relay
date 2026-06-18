const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlay', {
  setClickThrough: (value) => ipcRenderer.invoke('set-clickthrough', value),
  toggleClickThrough: () => ipcRenderer.invoke('toggle-clickthrough'),
  setOpacity: (value) => ipcRenderer.invoke('set-opacity', value),
  quit: () => ipcRenderer.invoke('quit'),
  minimize: () => ipcRenderer.invoke('minimize'),
  showWindow: () => ipcRenderer.invoke('show-window'),

  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (patch) => ipcRenderer.invoke('set-config', patch),
  exportConfig: () => ipcRenderer.invoke('export-config'),
  importConfig: () => ipcRenderer.invoke('import-config'),
  openLogs: () => ipcRenderer.invoke('open-logs'),

  startHotkeyCapture: () => ipcRenderer.invoke('start-hotkey-capture'),
  cancelHotkeyCapture: () => ipcRenderer.invoke('cancel-hotkey-capture'),
  onHotkeyCaptured: (cb) => ipcRenderer.on('hotkey-captured', (_e, binding) => cb(binding)),

  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),

  onClickThroughChanged: (cb) => ipcRenderer.on('clickthrough-changed', (_e, v) => cb(v)),
  onReset: (cb) => ipcRenderer.on('reset-evidence', () => cb()),
  onUpdateStatus: (cb) => ipcRenderer.on('update-status', (_e, info) => cb(info)),
  onConfigImported: (cb) => ipcRenderer.on('config-imported', (_e, cfg) => cb(cfg)),
  onGameStarted: (cb) => ipcRenderer.on('game-started', () => cb()),
  onGameStopped: (cb) => ipcRenderer.on('game-stopped', () => cb()),
});
