const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlay', {
  // Fenster / Klick-durch
  setClickThrough: (value) => ipcRenderer.invoke('set-clickthrough', value),
  toggleClickThrough: () => ipcRenderer.invoke('toggle-clickthrough'),
  setOpacity: (value) => ipcRenderer.invoke('set-opacity', value),
  quit: () => ipcRenderer.invoke('quit'),
  minimize: () => ipcRenderer.invoke('minimize'),

  // Einstellungen
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (patch) => ipcRenderer.invoke('set-config', patch),

  // Hotkey neu belegen
  startHotkeyCapture: () => ipcRenderer.invoke('start-hotkey-capture'),
  cancelHotkeyCapture: () => ipcRenderer.invoke('cancel-hotkey-capture'),
  onHotkeyCaptured: (cb) => ipcRenderer.on('hotkey-captured', (_e, binding) => cb(binding)),

  // Events aus dem Hauptprozess
  onClickThroughChanged: (cb) => ipcRenderer.on('clickthrough-changed', (_e, v) => cb(v)),
  onReset: (cb) => ipcRenderer.on('reset-evidence', () => cb()),
  onUpdateStatus: (cb) => ipcRenderer.on('update-status', (_e, info) => cb(info)),
});
