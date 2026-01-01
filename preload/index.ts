import { contextBridge, ipcRenderer } from 'electron';

/**
 * Exposed API for renderer process
 */
const api = {
  // Device management
  getDevices: () => ipcRenderer.invoke('adb:get-devices'),
  
  startMirror: (serial: string, options?: {
    bitrate?: number;
    maxSize?: number;
    maxFps?: number;
    forceBaseline?: boolean;
  }) => ipcRenderer.invoke('device:start-mirror', serial, options),
  
  stopMirror: (serial: string) => ipcRenderer.invoke('device:stop-mirror', serial),
  
  getDeviceInfo: (serial: string) => ipcRenderer.invoke('device:get-info', serial),
  
  // TCP Connection (replaces WebSocket)
  connect: (serial: string, port: number) => ipcRenderer.invoke('device:connect', serial, port),
  
  send: (serial: string, data: Uint8Array) => ipcRenderer.invoke('device:send', serial, data),
  
  onData: (callback: (data: Uint8Array) => void) => {
    const listener = (_event: any, data: Uint8Array) => callback(data);
    ipcRenderer.on('device:data', listener);
    return () => ipcRenderer.removeListener('device:data', listener);
  },
  
  onConnected: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('device:connected', listener);
    return () => ipcRenderer.removeListener('device:connected', listener);
  },
  
  onDisconnected: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('device:disconnected', listener);
    return () => ipcRenderer.removeListener('device:disconnected', listener);
  },
  
  onError: (callback: (error: string) => void) => {
    const listener = (_event: any, error: string) => callback(error);
    ipcRenderer.on('device:error', listener);
    return () => ipcRenderer.removeListener('device:error', listener);
  },
  
  onMetadata: (callback: (metadata: { deviceName: string; codecId: number; width: number; height: number }) => void) => {
    const listener = (_event: any, metadata: any) => callback(metadata);
    ipcRenderer.on('device:metadata', listener);
    return () => ipcRenderer.removeListener('device:metadata', listener);
  },
  
  // Screen control
  screenPower: (serial: string, on: boolean) => ipcRenderer.invoke('device:screen-power', serial, on),
  
  // Resize window to fit video dimensions
  resizeWindow: (width: number, height: number, chromeHeight?: number, chromeWidth?: number) => 
    ipcRenderer.invoke('device:resize-window', width, height, chromeHeight, chromeWidth),
  
  rotate: (serial: string) => ipcRenderer.invoke('device:rotate', serial),
  
  copyLogcat: (serial: string) => ipcRenderer.invoke('device:copy-logcat', serial),
  
  // ADB
  restartAdb: () => ipcRenderer.invoke('adb:restart'),
  
  getAdbPath: () => ipcRenderer.invoke('adb:get-path'),
  
  setAdbPath: (newPath: string) => ipcRenderer.invoke('adb:set-path', newPath),
  
  checkAdbStatus: (pathToCheck?: string) => ipcRenderer.invoke('adb:check-status', pathToCheck),
  
  shell: (serial: string, command: string) => ipcRenderer.invoke('adb:shell', serial, command),
  
  // Wireless Connection
  getDeviceIp: (serial: string) => ipcRenderer.invoke('device:get-ip', serial),
  
  enableWireless: (serial: string) => ipcRenderer.invoke('device:enable-wireless', serial),
  
  connectWireless: (ip: string, port?: number) => ipcRenderer.invoke('device:connect-wireless', ip, port),
  
  disconnectWireless: (serialOrIp: string) => ipcRenderer.invoke('device:disconnect-wireless', serialOrIp),
  
  // Event listeners
  onDeviceConnected: (callback: (device: any) => void) => {
    const listener = (_event: any, device: any) => {
      console.log('[Preload] IPC: device-connected', device.serial);
      callback(device);
    };
    ipcRenderer.on('device-connected', listener);
    return () => ipcRenderer.removeListener('device-connected', listener);
  },
  
  onDeviceDisconnected: (callback: (serial: string) => void) => {
    const listener = (_event: any, serial: string) => {
      console.log('[Preload] IPC: device-disconnected', serial);
      callback(serial);
    };
    ipcRenderer.on('device-disconnected', listener);
    return () => ipcRenderer.removeListener('device-disconnected', listener);
  },
  
  onSendNavButton: (callback: (button: number) => void) => {
    const listener = (_event: any, button: number) => callback(button);
    ipcRenderer.on('send-nav-button', listener);
    return () => ipcRenderer.removeListener('send-nav-button', listener);
  },

  onMirrorStarted: (callback: (serial: string) => void) => {
    const listener = (_event: any, serial: string) => callback(serial);
    ipcRenderer.on('device:mirror-started', listener);
    return () => ipcRenderer.removeListener('device:mirror-started', listener);
  },
  
  onMirrorStopped: (callback: (serial: string) => void) => {
    const listener = (_event: any, serial: string) => callback(serial);
    ipcRenderer.on('device:mirror-stopped', listener);
    return () => ipcRenderer.removeListener('device:mirror-stopped', listener);
  },

  onClipboard: (callback: (text: string) => void) => {
    const listener = (_event: any, text: string) => callback(text);
    ipcRenderer.on('device:clipboard', listener);
    return () => ipcRenderer.removeListener('device:clipboard', listener);
  },
  
  // Settings
  getSetting: (key: string) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key: string, value: any) => ipcRenderer.invoke('settings:set', key, value),
};

// Expose API to renderer
contextBridge.exposeInMainWorld('mirrorControl', api);

// Type declaration for window
declare global {
  interface Window {
    mirrorControl: typeof api;
  }
}
