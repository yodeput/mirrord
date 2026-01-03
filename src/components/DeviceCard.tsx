import { Wifi, Play, Phone, Smartphone, UsbIcon, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { DeviceInfo } from '@/hooks/useDevices'

interface DeviceCardProps {
  device: DeviceInfo
  showSerial?: boolean
  onStart: () => void
  onEnableWireless?: () => void
  onDisconnect?: () => void
}

export default function DeviceCard({ device, showSerial = true, onStart, onEnableWireless, onDisconnect }: DeviceCardProps) {
  const isWireless = device.serial.includes(':') || device.serial.includes('.')

  const handleWirelessAction = async () => {
    if (isWireless) {
      // Disconnect with confirmation
      const confirmed = await window.mirrorControl.showConfirmDialog({
        title: 'Disconnect Device',
        message: `Are you sure you want to disconnect ${device.model || 'this device'} from wireless?`,
        buttons: ['Cancel', 'Disconnect'],
      })
      if (confirmed) {
        onDisconnect?.()
      }
    } else {
      // Enable wireless
      onEnableWireless?.()
    }
  }

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4 flex items-center gap-4">
        {/* Device Icon */}
        <div className={`rounded-lg p-2 flex items-center justify-center ${isWireless ? "bg-green-300/50 text-green-800 dark:bg-green-500/50 dark:text-green-200" : "bg-blue-300/50 text-blue-800 dark:bg-blue-500/50 dark:text-blue-200"}`}   title={isWireless ? "Connected via Wireless" : "Connected via USB"} >
          {isWireless ? (
            <Wifi className="w-6"/>
          ) : (
            <UsbIcon className="w-6" />
          )}
        </div>

        {/* Device Info */}
        <div className="flex-1 min-w-0 align-start items-start">
          <p className="font-medium truncate">{device.model || 'Unknown Device'}</p>
          {showSerial && (
            <p className="text-xs text-muted-foreground truncate">{device.serial}</p>
          )}
        </div>

        {/* Status & Actions */}
        <div className="flex items-center gap-2">
          <Button size="icon" variant="ghost" onClick={handleWirelessAction} title={isWireless ? "Disconnect Wireless" : "Connect Wireless"}>
            {isWireless ? (
               <WifiOff className="w-5 h-5 text-red-500 hover:text-red-500/50" />
            ) : (
               <Wifi className="w-5 h-5 text-blue-500 hover:text-blue-500/50" />
            )}
          </Button>
          <Button size="icon" onClick={onStart}>
            <Play className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
