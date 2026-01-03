import { create } from 'zustand'
import type { DeviceInfo } from '@/hooks/useDevices'

interface DeviceState {
  devices: DeviceInfo[]
  mirroringDevices: Set<string>
  setDevices: (devices: DeviceInfo[]) => void
  addDevice: (device: DeviceInfo) => void
  removeDevice: (serial: string) => void
  startMirroring: (serial: string) => void
  stopMirroring: (serial: string) => void
  isMirroring: (serial: string) => boolean
}

export const useDeviceStore = create<DeviceState>((set, get) => ({
  devices: [],
  mirroringDevices: new Set(),
  
  setDevices: (devices) => set({ devices }),
  
  addDevice: (device) => set((state) => ({
    devices: state.devices.some(d => d.serial === device.serial)
      ? state.devices.map(d => d.serial === device.serial ? device : d)
      : [...state.devices, device]
  })),
  
  removeDevice: (serial) => set((state) => ({
    devices: state.devices.filter(d => d.serial !== serial),
    mirroringDevices: new Set([...state.mirroringDevices].filter(s => s !== serial))
  })),
  
  startMirroring: (serial) => set((state) => ({
    mirroringDevices: new Set([...state.mirroringDevices, serial])
  })),
  
  stopMirroring: (serial) => set((state) => ({
    mirroringDevices: new Set([...state.mirroringDevices].filter(s => s !== serial))
  })),
  
  isMirroring: (serial) => get().mirroringDevices.has(serial),
}))
