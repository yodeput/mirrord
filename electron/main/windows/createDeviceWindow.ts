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

export function createDeviceWindow(
  device: DeviceInfo, 
  port: number = 27183,
  options?: {
    bitrateValue?: string
    resolution?: string
    decoder?: string
  }
): BrowserWindow {
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
    trafficLightPosition: { x: 15, y: 12 },
    icon: path.join(__dirname, '../../resources/icon.png'),
  })

  deviceWindow.setMenu(null)

  // Load device page with search params (including port)
  let params = `serial=${encodeURIComponent(device.serial)}&model=${encodeURIComponent(device.model || 'Unknown')}&port=${port}`
  
  if (options?.bitrateValue) params += `&bitrate=${encodeURIComponent(options.bitrateValue)}`
  if (options?.resolution) params += `&resolution=${encodeURIComponent(options.resolution)}`
  if (options?.decoder) params += `&decoder=${encodeURIComponent(options.decoder)}`
  
  if (VITE_DEV_SERVER_URL) {
    const url = new URL(VITE_DEV_SERVER_URL)
    url.hash = `/device?${params}`
    console.log('[createDeviceWindow] Loading URL:', url.toString())
    deviceWindow.loadURL(url.toString())
    deviceWindow.webContents.openDevTools()
  } else {
    const indexPath = path.join(__dirname, '../../dist/index.html')
    const url = new URL(`file://${indexPath}`)
    url.hash = `/device?${params}`
    console.log('[createDeviceWindow] Loading file:', url.toString())
    deviceWindow.loadURL(url.toString())
  }

  deviceWindow.on('ready-to-show', () => {
    console.log('[createDeviceWindow] Window ready to show')
    deviceWindow.show()
  })

  // Fullscreen events
  deviceWindow.on('enter-full-screen', () => {
    deviceWindow.webContents.send('window:fullscreen-change', true)
  })

  deviceWindow.on('leave-full-screen', () => {
    deviceWindow.webContents.send('window:fullscreen-change', false)
  })

  deviceWindow.webContents.on('did-finish-load', () => {
    console.log('[createDeviceWindow] Content finished loading')
  })

  deviceWindow.webContents.on('did-fail-load', (e, code, desc) => {
    console.error('[createDeviceWindow] Failed to load:', code, desc)
  })

  deviceWindow.webContents.on('render-process-gone', (e, details) => {
    console.error('[createDeviceWindow] Renderer process gone:', details)
  })

  deviceWindow.webContents.on('unresponsive', () => {
    console.error('[createDeviceWindow] Window unresponsive')
  })

  deviceWindow.on('closed', () => {
    console.log('[createDeviceWindow] Window closed (event trigger)')
    deviceWindows.delete(device.serial)
    disconnectDevice(device.serial)
    DeviceServer.stop(device.serial)
  })

  deviceWindows.set(device.serial, deviceWindow)
  return deviceWindow
}
