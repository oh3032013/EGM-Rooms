const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  quit: () => ipcRenderer.send('app-quit'),
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  applyDeltaPatch: (payload) => ipcRenderer.invoke('apply-delta-patch', payload),
  onPatchProgress: (cb) => {
    const handler = (_event, progress) => cb(progress);
    ipcRenderer.on('patch-progress', handler);
    return () => ipcRenderer.removeListener('patch-progress', handler);
  },
});
