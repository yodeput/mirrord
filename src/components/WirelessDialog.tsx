import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Wifi } from 'lucide-react'
import { Input } from './ui/input'

interface WirelessDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function WirelessDialog({ open, onOpenChange }: WirelessDialogProps) {
  const [ip, setIp] = useState('')
  const [port, setPort] = useState('5555')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleConnect = async () => {
    if (!ip.trim()) {
      setError('Please enter an IP address')
      return
    }

    setLoading(true)
    setError('')

    try {
      await window.mirrorControl.connectWireless(ip.trim(), parseInt(port))
      onOpenChange(false)
      setIp('')
    } catch (err: any) {
      setError(err.message || 'Connection failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
         <DialogTitle className="flex gap-2">
              <Wifi className="w-5 h-5 text-primary" />
              Connect Wireless
            </DialogTitle>
         
        </DialogHeader>
        
        <div className="space-y-2 py-4">
          <p className='text-sm text-muted-foreground'>
              Enter the IP address of your Android device
          </p>
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="192.168.1.100"
              value={ip}
              onChange={(e) => setIp(e.target.value)}
            />
            <Input
              type="text"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              className="max-w-[100px]"
            />
          </div>
          
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConnect} disabled={loading}>
            {loading ? 'Connecting...' : 'Connect'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
