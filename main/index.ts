import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import { AdbManager, DeviceInfo } from './adb/AdbManager';
import { DeviceServer } from './adb/DeviceServer';
import { registerIpcHandlers, disconnectDevice } from './ipc/handlers';

// Enable live reload in development
if (process.env.NODE_ENV === 'development') {
  try {
    require('electron-reload')(path.join(__dirname, '../../renderer'), {
      electron: require(path.join(__dirname, '../../node_modules/electron'))
    });
  } catch (err) { }
}

// Keep references to windows
let mainWindow: BrowserWindow | null = null;
const deviceWindows = new Map<string, BrowserWindow>();

// ADB Manager instance
const adbManager = new AdbManager();

/**
 * Create the main window (device list)
 */
function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 800,
    minWidth: 600,
    minHeight: 800,
    maxWidth: 600,
    maxHeight: 800,
    resizable: false,
    title: '.mirrord',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    icon: path.join(__dirname, '../../resources/icon.png'),
  });

  mainWindow.setMenu(null);

  // Load main page
  mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));

  // Open devtools in development
  if (process.env.NODE_ENV === 'development' || true) { // Force enable for debugging
    // mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    // Close all device windows
    deviceWindows.forEach(win => win.close());
    deviceWindows.clear();
  });
}

/**
 * Create a device mirroring window
 */
export function createDeviceWindow(device: DeviceInfo): BrowserWindow {
  // Check if window already exists
  if (deviceWindows.has(device.serial)) {
    const existingWin = deviceWindows.get(device.serial)!;
    existingWin.focus();
    return existingWin;
  }

  const deviceWindow = new BrowserWindow({
    width: 360,
    height: 720,
    minWidth: 280,
    minHeight: 500,
    title: device.model || device.serial,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 17 },
    icon: path.join(__dirname, '../../resources/icon.png'),
  });

  deviceWindow.setMenu(null);

  // Pass device info to renderer via URL params
  const indexPath = path.join(__dirname, '../../renderer/device.html');
  const url = new URL(`file://${indexPath}`);
  url.searchParams.set('serial', device.serial);
  url.searchParams.set('model', device.model || 'Unknown');
  url.searchParams.set('appName', '.mirrord');
  deviceWindow.loadURL(url.toString());

  // Open devtools in development
  if (process.env.NODE_ENV === 'development') {
    deviceWindow.webContents.openDevTools();
  }

  deviceWindow.on('closed', () => {
    deviceWindows.delete(device.serial);
    // Disconnect socket first (stops retries)
    disconnectDevice(device.serial);
    // Stop device server
    DeviceServer.stop(device.serial);
  });

  deviceWindows.set(device.serial, deviceWindow);
  return deviceWindow;
}

/**
 * Handle ADB device events
 */
function setupAdbEvents(): void {
  adbManager.on('device-connected', (device: DeviceInfo) => {
    console.log(`[Main] Device connected: ${device.serial}`);
    // Notify main window
    mainWindow?.webContents.send('device-connected', device);
  });

  adbManager.on('device-disconnected', (serial: string) => {
    console.log(`[Main] Device disconnected: ${serial}`);
    // Notify main window
    mainWindow?.webContents.send('device-disconnected', serial);
    // Close device window if open
    const deviceWin = deviceWindows.get(serial);
    if (deviceWin) {
      deviceWin.close();
    }
  });

  adbManager.on('error', (error: Error) => {
    console.error(`[Main] ADB error: ${error.message}`);
  });
}

// App lifecycle
app.whenReady().then(async () => {
  // Register IPC handlers
  registerIpcHandlers(adbManager, deviceWindows);
  
  // Setup ADB events
  setupAdbEvents();
  
  // Start ADB scan immediately so data is ready when window loads
  console.log('[Main] Starting initial ADB scan...');
  adbManager.startWatching();
  
  // Create main window
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  adbManager.stopWatching();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // Clean up all device servers
  DeviceServer.stopAll();
});

// Export for IPC handlers
export { adbManager, deviceWindows, mainWindow };
