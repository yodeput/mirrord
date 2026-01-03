import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle2, AlertCircle, Settings } from 'lucide-react'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}


export default function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [adbPath, setAdbPath] = useState('')
  const [autoPath, setAutoPath] = useState('')
  const [status, setStatus] = useState<'checking' | 'valid' | 'invalid' | null>(null)
  
  useEffect(() => {
    if (open) {
      window.mirrorControl.getAdbPath().then(setAdbPath)
      window.mirrorControl.findAutoAdbPath().then(setAutoPath)
      setStatus(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    
    const timer = setTimeout(() => {
      // Check path if not empty, otherwise check generic
      if (adbPath) {
        checkStatus(adbPath)
      } else {
        checkStatus('')
      }
    }, 500)

    // Initial check
    if (!adbPath) {
       window.mirrorControl.checkAdbStatus('').then(valid => {
         if (valid && status !== 'valid') setStatus('valid')
       })
    }

    return () => clearTimeout(timer)
  }, [adbPath, open])

  const checkStatus = async (path: string) => {
    setStatus('checking')
    try {
      const valid = await window.mirrorControl.checkAdbStatus(path)
      setStatus(valid ? 'valid' : 'invalid')
    } catch {
      setStatus('invalid')
    }
  }

  const handleSave = async () => {
    await window.mirrorControl.setAdbPath(adbPath)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex gap-2">
              <Settings className="w-5 h-5 text-primary" />
              Settings
            </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>ADB Path</Label>
            <div className="flex gap-2">
              <Input 
                value={adbPath} 
                onChange={e => setAdbPath(e.target.value)}
                placeholder={autoPath ? `Path to adb executable (auto: ${autoPath})` : 'Path to adb executable'}
              />
            </div>
            <p className="text-xs text-muted-foreground break-all">
              {autoPath ? (
                 <>Detected at: <span className="font-mono bg-muted px-1 rounded cursor-pointer hover:text-primary" onClick={() => setAdbPath(autoPath)}>{autoPath}</span></>
              ) : (
                 "We'll look for ADB in common SDK locations if this is empty."
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 text-sm h-6">
             {status === 'valid' && (
                <span className="text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> ADB Detected
                </span>
             )}
             {status === 'invalid' && (
                <span className="text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" /> ADB Not Found
                </span>
             )}
             {status === 'checking' && <span className="text-muted-foreground animate-pulse">Checking...</span>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={status !== 'valid'}>Save Path</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
