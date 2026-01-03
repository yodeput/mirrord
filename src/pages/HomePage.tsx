import { useState, useEffect, useRef } from 'react'
import { RefreshCw, Plus, Settings, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { useDevices, DeviceInfo } from '@/hooks/useDevices'
import { useSettings } from '@/hooks/useSettings'
import DeviceCard from '@/components/DeviceCard'
import WirelessDialog from '@/components/WirelessDialog'
import SettingsDialog from '@/components/SettingsDialog'
import { Skeleton } from '@/components/ui/skeleton'
// [Removed UpdateDialog import]

export default function HomePage() {
  const { devices, loading, refresh } = useDevices()
  const [showSerial, setShowSerial] = useSettings('show_device_serial', true)
  const [autoConnect, setAutoConnect] = useSettings('auto_connect_wireless', false)
  const [wirelessOpen, setWirelessOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [version, setVersion] = useState('')
  const [adbMissing, setAdbMissing] = useState(false)

  // Update State
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [downloadingUpdate, setDownloadingUpdate] = useState(false)
  const [updateProgress, setUpdateProgress] = useState(0)

  // ADB Download State
  const [adbDownloading, setAdbDownloading] = useState(false)
  const [adbProgress, setAdbProgress] = useState(0)
  const [adbStatus, setAdbStatus] = useState('')

  // Get app version
  useEffect(() => {
    window.mirrorControl.getAppVersion().then(setVersion)
  }, [])

  // ADB Download Logic
  const handleAdbDownload = async () => {
    setAdbDownloading(true)
    setAdbProgress(0)
    setAdbStatus('Preparing...')

    const unsub = window.mirrorControl.onDownloadProgress((status, progress) => {
        setAdbStatus(status)
        setAdbProgress(progress)
    })

    try {
        const success = await window.mirrorControl.downloadPlatformTools()
        if (success) {
            setAdbStatus('Verifying...')
            const valid = await window.mirrorControl.checkAdbStatus()
            if (valid) {
                setAdbMissing(false)
                refresh(true)
            } else {
                 setAdbStatus('Error: ADB still missing')
                 setTimeout(() => setAdbDownloading(false), 2000)
            }
        } else {
             setAdbStatus('Download failed')
             setTimeout(() => setAdbDownloading(false), 2000)
        }
    } catch (e) {
        console.error(e)
        setAdbStatus('Error downloading tools')
        setTimeout(() => setAdbDownloading(false), 2000)
    } finally {
        unsub()
        if (!adbMissing) setAdbDownloading(false)
    }
  }

  // Check ADB at Startup (with guard for StrictMode)
  const adbCheckRef = useRef(false)
  
  useEffect(() => {
     if (adbCheckRef.current) return
     adbCheckRef.current = true

     const checkAdb = async () => {
        const valid = await window.mirrorControl.checkAdbStatus()
        if (!valid) {
          setAdbMissing(true)
          const confirm = await window.mirrorControl.showConfirmDialog({
              title: 'ADB Missing',
              message: 'ADB is Missing.\n\nWe can download and configure the official Android Platform Tools for you automatically.',
              buttons: ['Download'],
              confirmId: 0,
          })

          if (confirm) {
              handleAdbDownload()
          }
        } else {
            setAdbMissing(false)
            // Only check updates if ADB is working
            setTimeout(() => handleCheckUpdate(true), 1500)
        }
     }
     
     checkAdb()
  }, [])


  // Update Check Logic
  const handleCheckUpdate = async (silent = false) => {
    if (!silent) setCheckingUpdate(true)
    try {
      const info = await window.mirrorControl.checkForUpdates()
      if (info?.available) {
        // Strip markdown & meta info
        let cleanNotes = (info.releaseNotes || '')
          .replace(/^### \*\*\[.*$/gm, '') // Remove version header like ### **[1.1.1]...
          .replace(/^.*Full Changelog.*$/gmi, '') // Remove Changelog line
          .replace(/[#*`]/g, '') // Remove markdown symbols
          .replace(/\[(.*?)\]/g, '$1') // Remove links/brackets
          .replace(/^\s*[\r\n]/gm, '') // Remove empty lines (created by deletions)
          .trim()

        // Native Dialog
        const confirm = await window.mirrorControl.showConfirmDialog({
            title: 'Update Available',
            message: `Version ${info.version} is available.\n\n${cleanNotes}\n\nDo you want to download and install it?`,
            buttons: ['Download & Install', 'Later'],
            confirmId: 0,
            cancelId: 1
        })

        if (confirm) {
           // Start Download
           setDownloadingUpdate(true)
           const unsubscribe = window.mirrorControl.onUpdateDownloadProgress((p) => {
               setUpdateProgress(p)
           })
           
           try {
             const result = await window.mirrorControl.downloadUpdate(info.downloadUrl)
             if (result.success) {
               await window.mirrorControl.installUpdate(result.filePath)
             }
           } catch(e) {
               console.error('Download failed', e)
           } finally {
               setDownloadingUpdate(false)
               unsubscribe()
           }
        }
      } else if (!silent) {
         // Maybe show "No updates available" alert?
        await window.mirrorControl.showConfirmDialog({
            title: 'No Updates',
            message: `You are on the latest version (v${version}).`,
            buttons: ['OK']
        })
      }
    } catch (error) {
       console.error('Update check failed:', error)
    } finally {
       if (!silent) setCheckingUpdate(false)
    }
  }


  // ... (rest of listeners)

  const handleStartMirror = async (device: DeviceInfo) => {
    try {
      await window.mirrorControl.startMirror(device.serial)
    } catch (error) {
      console.error('Failed to start mirror:', error)
    }
  }

  const handleEnableWireless = async (device: DeviceInfo) => {
    const confirmed = await window.mirrorControl.showConfirmDialog({
      title: 'Enable Wireless Mode',
      message: `Are you sure you want to enable wireless mode for ${device.model || 'this device'}?`,
      buttons: ['Cancel', 'Enable']
    })

    if (!confirmed) return

    try {
      await window.mirrorControl.enableWireless(device.serial)
      // Refresh to pick up changes
      setTimeout(() => refresh(false), 1000)
    } catch (error) {
      console.error('Failed to enable wireless:', error)
    }
  }

  // Reload handler - also re-checks ADB status if it was missing
  const handleReload = async () => {
    if (adbMissing) {
      const valid = await window.mirrorControl.checkAdbStatus()
      if (valid) {
        setAdbMissing(false)
        setSettingsOpen(false)
        refresh(true)
      } else {
        // Still missing, do nothing (keep settings open)
        // refresh(true) might fail
      }
    } else {
      refresh(true)
    }
  }

  const onlineDevices = devices.filter(d => d.state === 'device')

  return (
    <div className="min-h-screen flex flex-col">
      {/* Title Bar */}
      <div className="h-12 titlebar-drag flex items-center justify-center border-b bg-background/80 backdrop-blur-sm">
        <span className="font-semibold text-sm text-primary">.mirrord</span>
        <button 
          className="absolute right-4 p-2 hover:bg-muted rounded-md titlebar-no-drag"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-semibold">Android Devices</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={() => setWirelessOpen(true)}>
              <Plus className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={handleReload} disabled={loading} title="Restart ADB">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Device List */}
        <div className="space-y-3">
          {loading ? (
             // Loading Skeletons
             Array.from({ length: 3 }).map((_, i) => (
               <div key={i} className="flex items-center gap-4 rounded-xl border p-4 shadow-sm">
                 <Skeleton className="h-8 w-8 rounded-sm" />
                 <div className="space-y-2 flex-1">
                   <Skeleton className="h-4 w-[200px]" />
                   <Skeleton className="h-3 w-[150px]" />
                 </div>
                 <Skeleton className="h-9 w-9 rounded-md" />
               </div>
             ))
          ) : onlineDevices.length === 0 ? (
            <Card className="border-dashed shadow-sm">
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                   <Smartphone className="h-10 w-10 bg-muted/50 rounded mb-5" />
                <p className="font-medium">No devices connected</p>
                <p className="text-sm text-center">Connect an Android device via USB with debugging enabled</p>
              </CardContent>
            </Card>
          ) : (
            onlineDevices.map(device => (
              <DeviceCard
                key={device.serial}
                device={device}
                showSerial={showSerial}
                onStart={() => handleStartMirror(device)}
                onEnableWireless={() => handleEnableWireless(device)}
                onDisconnect={async () => {
                  try {
                    await window.mirrorControl.disconnectWireless(device.serial)
                    setTimeout(() => refresh(false), 1000)
                  } catch (e) {
                    console.error('Failed to disconnect:', e)
                  }
                }}
              />
            ))
          )}
        </div>
      </div>

      {/* Preferences */}
      <Card className="m-4 mt-0">
        <CardContent className="p-4 space-y-3">
          <h2 className="font-medium mb-2">Preferences</h2>
          <div className="flex items-center justify-between">
            <span className="text-sm">Auto-connect wireless</span>
            <Switch checked={autoConnect} onCheckedChange={setAutoConnect} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Show Device Serial</span>
            <Switch checked={showSerial} onCheckedChange={setShowSerial} />
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="p-4 pt-0 flex items-center justify-center gap-3 text-sm text-muted-foreground">
        <span>.mirrord v{version}</span>
        
        {downloadingUpdate ? (
           <span className="text-primary font-medium">Downloading... {updateProgress}%</span>
        ) : (
           <Button variant="outline" size="sm" onClick={() => handleCheckUpdate(false)} disabled={checkingUpdate}>
             {checkingUpdate ? 'Checking...' : 'Check for Updates'}
           </Button>
        )}
      </div>

      {/* Dialogs */}
      <WirelessDialog open={wirelessOpen} onOpenChange={setWirelessOpen} />
      <SettingsDialog 
        open={settingsOpen} 
        onOpenChange={setSettingsOpen} 
      />
      
      {/* ADB Download Overlay */}
      {adbDownloading && (
        <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-8">
            <div className="w-full max-w-md space-y-4 text-center">
                <h3 className="text-lg font-semibold">{adbStatus}</h3>
                <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                    <div 
                        className="bg-primary h-2 rounded-full transition-all duration-300" 
                        style={{ width: `${adbProgress}%` }}
                    />
                </div>
                <p className="text-sm text-muted-foreground">{adbProgress}%</p>
            </div>
        </div>
      )}
    </div>
  )
}
