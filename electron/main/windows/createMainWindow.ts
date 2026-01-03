import { BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// ESM compatibility
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

export function createMainWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 600,
    height: 800,
    minWidth: 600,
    minHeight: 800,
    maxWidth: 600,
    maxHeight: 800,
    resizable: false,
    title: '.mirrord',
    backgroundColor: '#f8fafc',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    icon: path.join(__dirname, '../../resources/icon.png'),
  })

  mainWindow.setMenu(null)

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  return mainWindow
}
