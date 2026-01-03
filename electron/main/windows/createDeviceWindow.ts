import { BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DeviceInfo } from '../adb/AdbManager'
import { deviceWindows } from './state'
import { disconnectDevice } from '../ipc'
import { DeviceServer } from '../adb/DeviceServer'

// ESM compatibility
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

export function createDeviceWindow(device: DeviceInfo): BrowserWindow {
  if (deviceWindows.has(device.serial)) {
    const existingWin = deviceWindows.get(device.serial)!
    existingWin.focus()
    return existingWin
  }

  const deviceWindow = new BrowserWindow({
    width: 360,
    height: 720,
    minWidth: 280,
    minHeight: 500,
    title: device.model || device.serial,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 17 },
    icon: path.join(__dirname, '../../resources/icon.png'),
  })

  deviceWindow.setMenu(null)

  // Load device page with search params
  if (VITE_DEV_SERVER_URL) {
    const url = new URL(VITE_DEV_SERVER_URL)
    // HashRouter requires proper encoding of search params within the hash
    url.hash = `/device?serial=${encodeURIComponent(device.serial)}&model=${encodeURIComponent(device.model || 'Unknown')}`
    deviceWindow.loadURL(url.toString())
    deviceWindow.webContents.openDevTools()
  } else {
    const indexPath = path.join(__dirname, '../../dist/index.html')
    const url = new URL(`file://${indexPath}`)
    url.hash = `/device?serial=${encodeURIComponent(device.serial)}&model=${encodeURIComponent(device.model || 'Unknown')}`
    deviceWindow.loadURL(url.toString())
  }

  deviceWindow.on('closed', () => {
    deviceWindows.delete(device.serial)
    disconnectDevice(device.serial)
    DeviceServer.stop(device.serial)
  })

  deviceWindows.set(device.serial, deviceWindow)
  return deviceWindow
}
