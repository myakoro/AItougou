import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('syncAI', {
  sendMessage: (threadId, userText) => ipcRenderer.invoke('sendMessage', threadId, userText),
  getThreads: () => ipcRenderer.invoke('getThreads'),
  getThread: (threadId) => ipcRenderer.invoke('getThread', threadId),
  createThread: () => ipcRenderer.invoke('createThread'),
  deleteThread: (threadId) => ipcRenderer.invoke('deleteThread', threadId),
  saveApiKeys: (keys) => ipcRenderer.invoke('saveApiKeys', keys),
  getApiKeyStatus: () => ipcRenderer.invoke('getApiKeyStatus'),
})
