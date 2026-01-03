import { ipcMain, BrowserWindow, app, shell, dialog, screen } from 'electron'
import { AdbManager, DeviceInfo } from '../adb/AdbManager'
import { DeviceServer } from '../adb/DeviceServer'
import { DeviceConnection } from '../adb/DeviceConnection'
import { createDeviceWindow } from '../windows'
import { SettingsManager } from '../utils/SettingsManager'
import { UpdateChecker } from '../utils/UpdateChecker'
import { UpdateDownloader } from '../utils/UpdateDownloader'

const settingsManager = new SettingsManager()

// Map of active connections by device serial
const connections = new Map<string, DeviceConnection>()
// Map of window IDs to device serials
const windowSerials = new Map<number, string>()

/**
 * Broadcast event to all windows
 */
function broadcast(channel: string, ...args: any[]): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    try {
      win.webContents.send(channel, ...args)
    } catch (e) {
      /* ignore */
    }
  })
}

/**
 * Disconnect a device (called when window closes)
 */
export function disconnectDevice(serial: string): void {
  const connection = connections.get(serial)
  if (connection) {
    connection.disconnect()
    connections.delete(serial)
    console.log(`[IPC] Disconnected ${serial}`)
    broadcast('device:mirror-stopped', serial)
  }
}

/**
 * Register all IPC handlers
 */
export function registerIpcHandlers(
  adbManager: AdbManager,
  deviceWindows: Map<string, BrowserWindow>
): void {
  // Initialize ADB path from settings
  const savedAdbPath = settingsManager.get('adbPath')
  if (savedAdbPath) {
    adbManager.setAdbPath(savedAdbPath)
  }

  // Get app version
  ipcMain.handle('app:get-version', () => {
    return app.getVersion();
  });

  // Check for updates
  ipcMain.handle('app:check-for-updates', async () => {
    return UpdateChecker.checkForUpdates();
  });

  // Download Update
  ipcMain.handle('app:download-update', async (event, url: string) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      try {
          const filePath = await UpdateDownloader.downloadUpdate(url, (progress) => {
              if (!win?.isDestroyed()) {
                  win?.webContents.send('app:update-download-progress', progress);
              }
          });
          return { success: true, filePath };
      } catch (error: any) {
          console.error('Download failed:', error);
          return { success: false, error: error.message };
      }
  });

  // Install Update
  ipcMain.handle('app:install-update', async (event, filePath: string) => {
      return await UpdateDownloader.installUpdate(filePath);
  });

  // Open external URL
  ipcMain.handle('app:open-external', async (_event, url: string) => {
    return shell.openExternal(url);
  });

  // Get list of devices
  ipcMain.handle('adb:get-devices', async (): Promise<DeviceInfo[]> => {
    return adbManager.getDevices()
  })

  // Start mirroring a device
  ipcMain.handle(
    'device:start-mirror',
    async (
      event,
      serial: string,
      options?: {
        bitrate?: number
        maxSize?: number
        maxFps?: number
        forceBaseline?: boolean
        openWindow?: boolean
      }
    ): Promise<{ port: number }> => {
      const device = adbManager.getDevice(serial)
      if (!device) {
        throw new Error(`Device ${serial} not found`)
      }

      // Detect wireless connection (IP:PORT format)
      const isWireless = serial.includes(':') || serial.includes('.')

      // User requested 75% resolution
      let defaultMaxSize = 0
      if (isWireless) {
        try {
          // Fetch device size to calculate 75%
          const sizeOut = await adbManager.shell(serial, 'wm size')
          const match = sizeOut.match(/Physical size: (\d+)x(\d+)/)
          if (match) {
            const width = parseInt(match[1])
            const height = parseInt(match[2])
            const maxDim = Math.max(width, height)
            defaultMaxSize = Math.floor(maxDim * 0.5) & ~7 // Mid = 50%
            console.log(
              `[IPC] Wireless detected. Calculated 50% size: ${defaultMaxSize} (from ${width}x${height})`
            )
          } else {
            defaultMaxSize = 600 // Fallback
          }
        } catch (e) {
          console.warn(
            '[IPC] Failed to get device size for wireless default, using 600px',
            e
          )
          defaultMaxSize = 600
        }
      }

      const defaultBitrate = isWireless ? 4_000_000 : 24_000_000 // Wireless 4M (Mid), Wired 24M (Best)
      const defaultMaxFps = isWireless ? 30 : 60

      const finalOptions = {
        maxSize: defaultMaxSize,
        maxFps: defaultMaxFps,
        ...options,
        bitrate: options?.bitrate || defaultBitrate,
      }

      console.log(
        `[IPC] Starting mirror for ${serial} (Wireless: ${isWireless}, Bitrate: ${finalOptions.bitrate})`
      )

      // Start server on device
      const port = await DeviceServer.start(serial, finalOptions)

      // Create device window only if requested (default: true)
      if (options?.openWindow !== false) {
        const win = createDeviceWindow(device, port)
        windowSerials.set(win.id, serial)
      }

      broadcast('device:mirror-started', serial)

      return { port }
    }
  )

  // Stop mirroring a device
  ipcMain.handle(
    'device:stop-mirror',
    async (
      event,
      serial: string,
      options?: { keepWindowOpen?: boolean }
    ): Promise<void> => {
      // 1. Find and optionally close the device window
      const win = deviceWindows.get(serial)
      if (win && !options?.keepWindowOpen) {
        console.log(`[IPC] Closing window for ${serial} on stop-mirror request`)
        win.close()
        return
      }

      // 2. Fallback or Manual Cleanup: If window doesn't exist or we are keeping it open
      const connection = connections.get(serial)
      if (connection) {
        connection.disconnect()
        connections.delete(serial)
      }

      await DeviceServer.stop(serial)
      broadcast('device:mirror-stopped', serial)
    }
  )

  // Restart mirroring (Close window -> Start -> Open Window)
  ipcMain.handle(
    'device:restart-mirror',
    async (
      event,
      serial: string, 
      options?: {
        bitrate?: number
        maxSize?: number
        maxFps?: number
        forceBaseline?: boolean
        bitrateValue?: string
        resolution?: string
        decoder?: string
      }
    ) => {
      console.log(`[IPC] Restarting mirror for ${serial} with options:`, options)
      
      const win = deviceWindows.get(serial)
      if (win) {
         await new Promise<void>(resolve => {
           win.once('closed', () => resolve())
           win.close()
         })
      }
      
      // Wait a bit for cleanup propagation
      await new Promise(r => setTimeout(r, 500))

      const device = adbManager.getDevice(serial)
      if (!device) throw new Error(`Device ${serial} not found`)
      
      // Merge defaults similar to start-mirror (simplified)
      const isWireless = serial.includes(':') || serial.includes('.')
      const defaultBitrate = isWireless ? 4_000_000 : 24_000_000
      const defaultMaxFps = isWireless ? 30 : 60
      
      const finalOptions = {
        maxSize: 0,
        maxFps: defaultMaxFps,
        ...options,
        bitrate: options?.bitrate || defaultBitrate,
      }
      
      // Start server
      const port = await DeviceServer.start(serial, finalOptions)

      // Create new window
      const newWin = createDeviceWindow(device, port, options)
      windowSerials.set(newWin.id, serial)

      broadcast('device:mirror-started', serial)
      return { port }
    }
  )

  // Connect to device TCP socket
  ipcMain.handle(
    'device:connect',
    async (event, serial: string, port: number): Promise<boolean> => {
      try {
        // Create connection
        const connection = new DeviceConnection(serial, port)

        // Store window reference for this serial
        const win = BrowserWindow.fromWebContents(event.sender)
        if (win) {
          windowSerials.set(win.id, serial)
        }

        // Handle incoming data
        connection.on('data', (data: Buffer) => {
          try {
            event.sender.send('device:data', data)
          } catch (e) {
            // Window might be closed
          }
        })

        // Handle connection status
        connection.on('connected', () => {
          try {
            event.sender.send('device:connected')
          } catch (e) {}
        })

        connection.on('disconnected', () => {
          try {
            event.sender.send('device:disconnected')
          } catch (e) {}
        })

        connection.on('error', (error: Error) => {
          try {
            event.sender.send('device:error', error.message)
          } catch (e) {}
        })

        // Handle metadata (scrcpy handshake complete)
        connection.on('metadata', (metadata: any) => {
          try {
            event.sender.send('device:metadata', metadata)
          } catch (e) {}
        })

        // Handle clipboard events
        connection.on('clipboard', (text: string) => {
          try {
            event.sender.send('device:clipboard', text)
          } catch (e) {}
        })

        // Connect
        await connection.connect()
        connections.set(serial, connection)

        return true
      } catch (error) {
        console.error(`[IPC] Failed to connect to ${serial}:`, error)
        return false
      }
    }
  )

  // Send data to device
  ipcMain.handle(
    'device:send',
    async (event, serial: string, data: Uint8Array): Promise<boolean> => {
      const connection = connections.get(serial)
      if (!connection) {
        console.error(`[IPC] No connection for ${serial}`)
        return false
      }
      return connection.send(Buffer.from(data))
    }
  )

  // Get device info
  ipcMain.handle(
    'device:get-info',
    async (event, serial: string): Promise<DeviceInfo | null> => {
      return adbManager.getDevice(serial) || null
    }
  )

  // Restart ADB server
  ipcMain.handle('adb:restart', async (): Promise<void> => {
    await adbManager.restart()
  })

  // Get current ADB path
  ipcMain.handle('adb:get-path', async (): Promise<string> => {
    return adbManager.getAdbPath()
  })

  // Set manual ADB path
  ipcMain.handle(
    'adb:set-path',
    async (event, newPath: string): Promise<boolean> => {
      const success = adbManager.setAdbPath(newPath)
      if (success) {
        settingsManager.set('adbPath', newPath)
      }
      return success
    }
  )

  // Check if ADB is detected/valid
  ipcMain.handle(
    'adb:check-status',
    async (event, pathToCheck?: string): Promise<boolean> => {
      if (pathToCheck) {
        return adbManager.isValidPath(pathToCheck)
      }
      return adbManager.isAdbValid()
    }
  )

  // Find auto-detected ADB path
  ipcMain.handle('adb:find-auto-path', async (): Promise<string> => {
    return adbManager.findAdbPath()
  })

  // Download platform tools
  ipcMain.handle('adb:download-tools', async (event): Promise<boolean> => {
    return adbManager.downloadPlatformTools((status, progress) => {
        if (!event.sender.isDestroyed()) {
            event.sender.send('adb:download-progress', { status, progress });
        }
    })
  })

  // Execute ADB shell command
  ipcMain.handle(
    'adb:shell',
    async (event, serial: string, command: string): Promise<string> => {
      return adbManager.shell(serial, command)
    }
  )

  // Device window actions
  ipcMain.on(
    'device:nav-button',
    async (event, serial: string, button: number) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win) {
        win.webContents.send('send-nav-button', button)
      }
    }
  )

  // Screen control
  ipcMain.handle(
    'device:screen-power',
    async (event, serial: string, on: boolean): Promise<void> => {
      const keycode = on ? 224 : 223
      await adbManager.shell(serial, `input keyevent ${keycode}`)
    }
  )

  // Rotate screen
  ipcMain.handle(
    'device:rotate',
    async (event, serial: string): Promise<void> => {
      const current = await adbManager.shell(
        serial,
        'settings get system user_rotation'
      )
      const rotation = ((parseInt(current.trim()) || 0) + 1) % 4
      await adbManager.shell(
        serial,
        `settings put system user_rotation ${rotation}`
      )
    }
  )

  // Copy logcat
  ipcMain.handle(
    'device:copy-logcat',
    async (event, serial: string): Promise<string> => {
      return adbManager.shell(serial, 'logcat -d -t 100')
    }
  )

  ipcMain.handle('settings:get', async (event, key: string): Promise<any> => {
    return settingsManager.get(key)
  })

  ipcMain.handle(
    'settings:set',
    async (event, key: string, value: any): Promise<void> => {
      settingsManager.set(key, value)
    }
  )

  // Resize window based on video dimensions
  ipcMain.handle(
    'device:resize-window',
    async (
      event,
      width: number,
      height: number,
      chromeHeight: number = 0,
      chromeWidth: number = 0
    ): Promise<void> => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win) {
        // Calculate window size to fit screen while maintaining aspect ratio of VIDEO
        const primaryDisplay = screen.getPrimaryDisplay()
        const workArea = primaryDisplay.workArea

        // Max window limits
        const maxHeight = workArea.height * 0.9
        const maxWidth = workArea.width * 0.9

        const availableHeight = maxHeight - chromeHeight
        const availableWidth = maxWidth - chromeWidth

        let scale = 1

        // Check height
        if (height > availableHeight) {
          scale = Math.min(scale, availableHeight / height)
        }

        // Check width
        if (width > availableWidth) {
          scale = Math.min(scale, availableWidth / width)
        }

        // Calculate final dimensions
        const finalVideoWidth = Math.round(width * scale)
        const finalVideoHeight = Math.round(height * scale)

        const newWidth = finalVideoWidth + chromeWidth
        const newHeight = finalVideoHeight + chromeHeight

        // Minimum size
        const resultWidth = Math.max(300, newWidth)
        const resultHeight = Math.max(500, newHeight)

        console.log(
          `[IPC] Resizing window. Video: ${width}x${height}, Chrome: ${chromeWidth}x${chromeHeight}, Scale: ${scale.toFixed(
            2
          )} -> Window: ${resultWidth}x${resultHeight}`
        )

        win.setSize(resultWidth, resultHeight)
        
        // Lock aspect ratio for manual resizing
        win.setAspectRatio(resultWidth / resultHeight)
      }
    }
  )

  // Adjust window width by delta (for sidebar toggle)
  ipcMain.handle(
    'device:adjust-width',
    async (event, delta: number): Promise<void> => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win) {
        const [currentWidth, currentHeight] = win.getSize()
        const newWidth = Math.max(300, currentWidth + delta)
        win.setSize(newWidth, currentHeight)
        // Update aspect ratio for new dimensions
        win.setAspectRatio(newWidth / currentHeight)
        console.log(`[IPC] Adjusted window width by ${delta}px: ${currentWidth} -> ${newWidth}`)
      }
    }
  )

  // Get device IP
  ipcMain.handle(
    'device:get-ip',
    async (event, serial: string): Promise<string | null> => {
      return adbManager.getDeviceIp(serial)
    }
  )

  // Enable wireless (TCPIP) + Auto-Connect
  ipcMain.handle(
    'device:enable-wireless',
    async (event, serial: string): Promise<{ success: boolean; ip?: string; error?: string }> => {
      try {
        // 1. Enable TCP/IP mode on device
        await adbManager.enableTcpIp(serial)
        
        // Wait for connection to stabilize after TCP/IP switch
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        // 2. Get device IP address
        const ip = await adbManager.getDeviceIp(serial)
        if (!ip) {
          return { success: false, error: 'Could not get device IP. Ensure device is connected to WiFi.' }
        }
        
        // 3. Connect to the wireless device
        await adbManager.connect(ip, 5555)
        
        // 4. Trigger device rescan
        await adbManager.scanDevices()
        
        return { success: true, ip }
      } catch (error: any) {
        console.error('[IPC] enableWireless failed:', error)
        return { success: false, error: error.message || 'Unknown error' }
      }
    }
  )


  // Connect wireless
  ipcMain.handle(
    'device:connect-wireless',
    async (event, ip: string, port: number = 5555): Promise<string> => {
      return adbManager.connect(ip, port)
    }
  )

  // Disconnect wireless
  ipcMain.handle(
    'device:disconnect-wireless',
    async (event, serialOrIp: string): Promise<void> => {
      return adbManager.disconnect(serialOrIp)
    }
  )

  // Native Confirm Dialog
  ipcMain.handle('dialog:show-confirm', async (event, options: any) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    
    // Default buttons: Cancel (0), Confirm (1)
    const buttons = options.buttons || ['Cancel', 'Confirm']
    const confirmId = options.confirmId ?? 1
    const cancelId = options.cancelId ?? 0
    
    const result = await dialog.showMessageBox(win, {
      type: 'question',
      title: options.title,
      message: options.message,
      buttons: buttons,
      defaultId: confirmId,
      cancelId: cancelId,
    })
    
    return result.response === confirmId
  })
}
