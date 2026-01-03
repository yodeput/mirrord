import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AdbManager, DeviceInfo } from './adb/AdbManager'
import { DeviceServer } from './adb/DeviceServer'
import { registerIpcHandlers } from './ipc'
import { createMainWindow } from './windows'
import { deviceWindows } from './windows/state'

// ESM compatibility
const __dirname = path.dirname(fileURLToPath(import.meta.url))

import { adbManager } from './adb/instance'

// References
let mainWindow: BrowserWindow | null = null
// const adbManager = new AdbManager() // usage from import now

function setupAdbEvents(): void {
  adbManager.on('device-connected', (device: DeviceInfo) => {
    console.log(`[Main] Device connected: ${device.serial}`)
    // We can get the main window from the factory or reference
    const wins = BrowserWindow.getAllWindows()
    const mainWin = wins.find(w => w.title === '.mirrord')
    mainWin?.webContents.send('device-connected', device)
  })

  adbManager.on('device-disconnected', (serial: string) => {
    console.log(`[Main] Device disconnected: ${serial}`)
    const wins = BrowserWindow.getAllWindows()
    const mainWin = wins.find(w => w.title === '.mirrord')
    mainWin?.webContents.send('device-disconnected', serial)
    
    // Auto-close device window if open
    const deviceWin = deviceWindows.get(serial)
    if (deviceWin) deviceWin.close()
  })

  adbManager.on('error', (error: Error) => {
    console.error(`[Main] ADB error: ${error.message}`)
  })
}

app.whenReady().then(async () => {
  registerIpcHandlers(adbManager, deviceWindows)
  setupAdbEvents()
  
  console.log('[Main] Starting initial ADB scan...')
  adbManager.startWatching()
  
  mainWindow = createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  adbManager.stopWatching()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  DeviceServer.stopAll()
})

export { adbManager }

