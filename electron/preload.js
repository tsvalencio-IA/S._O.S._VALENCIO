// Interface mínima, somente leitura, para o template PMSP empacotado.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('thiaDesktopAsset', Object.freeze({
  readTemplate: assetPath => ipcRenderer.invoke('sos:template-pmsp', String(assetPath || ''))
}));
window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.setAttribute('data-runtime', 'electron');
});
