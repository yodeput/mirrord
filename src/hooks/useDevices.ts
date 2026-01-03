import { useState, useEffect, useCallback } from 'react'

export interface DeviceInfo {
  serial: string
  state: 'device' | 'offline' | 'unauthorized' | 'no permissions'
  model?: string
  product?: string
  transport_id?: string
}

export function useDevices() {
  const [devices, setDevices] = useState<DeviceInfo[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async (restart: boolean = false) => {
    setLoading(true)
    try {
      if (restart) {
        await window.mirrorControl.restartAdb()
      }
      const list = await window.mirrorControl.getDevices()
      setDevices(list)
    } catch (error) {
      console.error('Failed to get devices:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Initial fetch
    refresh()

    // Subscribe to device events
    const unsubConnect = window.mirrorControl.onDeviceConnected((device: DeviceInfo) => {
      setDevices(prev => {
        const exists = prev.find(d => d.serial === device.serial)
        if (exists) {
          return prev.map(d => d.serial === device.serial ? device : d)
        }
        return [...prev, device]
      })
    })

    const unsubDisconnect = window.mirrorControl.onDeviceDisconnected((serial: string) => {
      setDevices(prev => prev.filter(d => d.serial !== serial))
    })

    return () => {
      unsubConnect()
      unsubDisconnect()
    }
  }, [refresh])

  return { devices, loading, refresh }
}
