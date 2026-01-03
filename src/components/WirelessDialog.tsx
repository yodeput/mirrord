import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Wifi, AlertCircle } from 'lucide-react'
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

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setIp('')
      setPort('5555')
      setError('')
      setLoading(false)
    }
  }, [open])

  const simplifyError = (err: string) => {
    // Remove "Error invoking remote method..." and "Error: Command failed..."
    let clean = err
    if (clean.includes('Error invoking remote method')) {
      const match = clean.match(/Error: (.*)/)
      if (match) clean = match[1]
    }
    if (clean.includes('Command failed:')) {
      const parts = clean.split('connect')
      if (parts.length > 1) {
        clean = `Failed to connect to ${parts[1].trim()}`
      }
    }
    // Specific ADB errors
    if (clean.toLowerCase().includes('connection refused')) return 'Connection refused (Is ADB over TCP enabled on the device?)'
    if (clean.toLowerCase().includes('timeout') || clean.toLowerCase().includes('timed out')) return 'Connection timed out. Check if the IP is correct and the device is on the same network.'
    if (clean.toLowerCase().includes('no route to host')) return 'No route to host. The device might be offline or unreachable.'
    
    return clean.trim()
  }

  const handleConnect = async () => {
    if (!ip.trim()) {
      setError('Please enter an IP address')
      return
    }

    setLoading(true)
    setError('')

    try {
      const result = await window.mirrorControl.connectWireless(ip.trim(), parseInt(port))
      
      const lowerResult = (result || '').toLowerCase()
      if (lowerResult.includes('failed') || lowerResult.includes('could not') || lowerResult.includes('unable')) {
        setError(simplifyError(result || 'Connection failed'))
        setLoading(false)
        return
      }

      onOpenChange(false)
      setIp('')
    } catch (err: any) {
      setError(simplifyError(err.message || 'Connection failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="sm:max-w-md rounded-2xl"
        onPointerDownOutside={(e) => { if (loading) e.preventDefault() }}
        onEscapeKeyDown={(e) => { if (loading) e.preventDefault() }}
      >
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
              disabled={loading}
            />
            <Input
              type="text"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              className="max-w-[100px]"
              disabled={loading}
            />
          </div>
          
          {error && (
            <div className="flex gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive animate-in fade-in slide-in-from-top-1">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="text-sm font-medium leading-tight">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
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
