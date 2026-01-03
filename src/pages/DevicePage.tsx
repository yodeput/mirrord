import { useEffect, useRef, useMemo, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useVideoStream } from '@/hooks/useVideoStream'
import { useInputHandler } from '@/hooks/useInputHandler'
import { ScrcpyControl } from '@/scripts/ScrcpyControl'
import { StreamSettings } from '@/components/StreamSettings'
import { ArrowLeft, Circle, Square, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Usb, Wifi } from 'lucide-react'
import { DecoderType } from '@/decoders/Factory'
import { DeviceSidebar } from '@/components/DeviceSidebar'
import { Button } from '@/components/ui/button'

export default function DevicePage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const serial = searchParams.get('serial') || ''
  const model = searchParams.get('model') || 'Unknown'
  const portParam = searchParams.get('port')
  const bitrateParam = searchParams.get('bitrate')
  const resParam = searchParams.get('maxSize') // Use 'maxSize' to match IPC or 'resolution' string?
                                               // Let's use string params for URL: 'resolution' (e.g. '1080p')
  const resolutionParam = searchParams.get('resolution')
  const decoderParam = searchParams.get('decoder')
  
  const [currentPort, setCurrentPort] = useState(portParam ? parseInt(portParam, 10) : 27183)
  
  const [selectedDecoder, setSelectedDecoder] = useState<DecoderType>((decoderParam as DecoderType) || 'wasm')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [rotation, setRotation] = useState(0) // 0, 90, 180, 270
  
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  // Track container size for accurate rotation calculations
  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver((entries) => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect
        setContainerSize({ width, height })
      }
    })
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])
  
  const { connected, loading, error, dimensions, connect } = useVideoStream({
    serial,
    port: currentPort,
    videoRef,
    manual: true,
    decoderType: selectedDecoder
  })
  
  const parseBitrate = (bitrate: string) => {
    return parseInt(bitrate.replace('M', '')) * 1_000_000
  }

  const parseResolution = (res: string) => {
    if (res === 'max') return 0
    if (res === '1080p') return 1080 // Actually usually Scrcpy uses max dimension
    if (res === '720p') return 720
    return 0
  }

  const handleSettingsChange = async (settings: { bitrate: string, resolution: string, decoder: DecoderType }) => {
    console.log('[DevicePage] Applying settings (via restart):', settings)
    setInitialLoading(true)
    
    try {
      // Send restart request to Main Process
      // This will close the current window and open a new one
      await window.mirrorControl.restartMirror(serial, {
        bitrate: parseBitrate(settings.bitrate),
        maxSize: parseResolution(settings.resolution),
        // Pass raw values for URL persistence
        resolution: settings.resolution, // '1080p'
        bitrateValue: settings.bitrate, // '10M'
        decoder: settings.decoder
      })
      
      // 4. Reconnect video stream
      // We need a small delay for the server to start
      setTimeout(() => {
        connect()
        setInitialLoading(false)
      }, 1000)
      
    } catch (e) {
      console.error('[DevicePage] Failed to apply settings:', e)
      setInitialLoading(false)
    }
  }


  // Debug mounting
  useEffect(() => {
    console.log('[DevicePage] Mounted for', serial);
    return () => console.log('[DevicePage] Unmounted');
  }, [serial]);

  // Detect fullscreen state changes (Native + DOM)
  useEffect(() => {
    const handleDomFullscreen = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    
    document.addEventListener('fullscreenchange', handleDomFullscreen)
    
    // Listen for native window fullscreen events
    const unsubscribe = window.mirrorControl.onFullscreenChange((fullscreen: boolean) => {
      console.log('[DevicePage] Native fullscreen change:', fullscreen)
      setIsFullscreen(fullscreen)
    })
    
    // Initial check
    setIsFullscreen(!!document.fullscreenElement)
    
    return () => {
      document.removeEventListener('fullscreenchange', handleDomFullscreen)
      unsubscribe()
    }
  }, [])

  // Auto-connect after 1 second delay (simulates clicking Start button)
  useEffect(() => {
    const timer = setTimeout(() => {
      console.log('[DevicePage] Auto-connecting after 1s delay')
      setInitialLoading(false)
      connect()
    }, 1000)

    return () => clearTimeout(timer)
  }, []) // Run once on mount

  const handleConnect = () => {
      connect();
  }

  // Initialize scrcpy control
  const control = useMemo(() => {
    if (!dimensions) return null
    try {
      return new ScrcpyControl(
        dimensions.width,
        dimensions.height,
        (data) => window.mirrorControl.send(serial, data)
      )
    } catch (e) {
      console.error('Failed to create ScrcpyControl', e)
      return null
    }
  }, [dimensions, serial])

  // Attach input handler for mouse/touch interaction
  useInputHandler({
    videoRef,
    deviceWidth: dimensions?.width || 0,
    deviceHeight: dimensions?.height || 0,
    rotation,
    onTouch: (event) => control?.sendTouch(event)
  })

  // Resize window to fit device aspect ratio whenever dimensions or rotation change
  const initialResizeDone = useRef(false)
  useEffect(() => {
    if (dimensions) {
      const isRotated = rotation === 90 || rotation === 270
      const currentWidth = isRotated ? dimensions.height : dimensions.width
      const currentHeight = isRotated ? dimensions.width : dimensions.height
      
      // h-10 (40px) title bar + h-14 (56px) nav bar = 96px total chrome height
      // Sidebar width is 48px when expanded (default state)
      const sidebarWidth = sidebarCollapsed ? 0 : 48
      window.mirrorControl.resizeWindow(currentWidth, currentHeight, 96, sidebarWidth)
        .then(() => {
          console.log('[DevicePage] Window resized for dimensions:', currentWidth, 'x', currentHeight, 'rotation:', rotation)
          initialResizeDone.current = true
        })
        .catch((e: Error) => console.error('[DevicePage] Resize failed:', e))
    }
  }, [dimensions, rotation])

  // Handle sidebar toggle - adjust width by +/- 48px
  const prevSidebarCollapsed = useRef(sidebarCollapsed)
  useEffect(() => {
    if (prevSidebarCollapsed.current !== sidebarCollapsed && initialResizeDone.current) {
      const delta = sidebarCollapsed ? -48 : 48
      window.mirrorControl.adjustWidth(delta)
        .then(() => console.log('[DevicePage] Sidebar toggled, width adjusted by', delta))
        .catch((e: Error) => console.error('[DevicePage] Width adjust failed:', e))
    }
    prevSidebarCollapsed.current = sidebarCollapsed
  }, [sidebarCollapsed])

  const handleClose = async () => {
    try {
      await window.mirrorControl.stopMirror(serial)
    } catch (e) {
      console.error('Failed to stop mirror:', e)
    }
    window.close()
  }

  // Navigation commands
  const sendKey = (keycode: number) => {
    control?.sendKey(keycode)
  }

  return (
    <div className="min-h-screen bg-black flex">
      {/* Device Screen + Controls */}
      <div className="flex-1 flex flex-col">
        {/* Title Bar - hidden in fullscreen */}
        {!isFullscreen && (
          <div className="h-10 bg-zinc-900 titlebar-drag flex items-center px-3">
            <div className={`flex items-center gap-2 flex-1 ml-[70px] truncate ${sidebarCollapsed ? '' : 'mr-12'}`}>
              {(serial.includes('.') || serial.includes(':')) ? (
                <Wifi className="w-3.5 h-3.5 text-zinc-500" />
              ) : (
                <Usb className="w-3.5 h-3.5 text-zinc-500" />
              )}
              <span className="font-mono text-xs text-zinc-400 truncate">{model}</span>
            </div>
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="titlebar-no-drag p-1.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white transition-colors"
              title={sidebarCollapsed ? 'Show Menu' : 'Hide Menu'}
            >
              {sidebarCollapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
            </button>
          </div>
        )}

        {/* Video Container */}
        <div ref={containerRef} className="flex-1 relative bg-black overflow-hidden">

          {(loading || initialLoading) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black text-white z-10 transition-opacity">
              <div className="w-10 h-10 border-4 border-white/10 border-t-white rounded-full animate-spin mb-4" />
              <p className="text-sm text-zinc-400">Connecting to {model}...</p>
            </div>
          )}
          
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black text-red-400 z-10">
              <div className="text-center px-6">
                <p className="font-medium mb-2">Connection Failed</p>
                <p className="text-sm text-zinc-500 break-words">{error}</p>
                <button 
                  onClick={() => navigate('/')}
                  className="mt-4 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-white text-sm transition-colors"
                >
                  Return to Home
                </button>
              </div>
            </div>
          )}
          
          {/* Rotation Wrapper: This div is what we rotate. 
              When rotated 90/270, its width/height are swapped relative to the parent. */}
          <div 
            className="absolute transition-all duration-300 flex items-center justify-center"
            style={{
              width: (rotation % 180 !== 0) ? `${containerSize.height}px` : '100%',
              height: (rotation % 180 !== 0) ? `${containerSize.width}px` : '100%',
              left: '50%',
              top: '50%',
              transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
            }}
          >
            <video
              ref={videoRef}
              className={`w-full h-full ${isFullscreen ? 'object-contain' : 'object-fill'} pointer-events-auto cursor-crosshair ${loading || error ? 'opacity-0' : 'opacity-100'} transition-opacity`}
              autoPlay
              playsInline
              muted
            />
          </div>
        </div>

        {/* Bottom Nav Bar */}
        <div className="h-14 bg-zinc-900 flex items-center justify-center border-t border-white/5">
          <div 
            className="flex items-center justify-center gap-12 h-full transition-all duration-300"
            style={{
              width: isFullscreen && dimensions 
                ? `calc((100vh - 56px) * ${dimensions.width / dimensions.height})` 
                : '100%'
            }}
          >
            <button 
              className="text-zinc-400 hover:text-white p-3 hover:bg-white/5 rounded-full transition-all active:scale-90"
              onClick={() => sendKey(4)}
              title="Back"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <button 
              className="text-zinc-400 hover:text-white p-3 hover:bg-white/5 rounded-full transition-all active:scale-90"
              onClick={() => sendKey(3)}
              title="Home"
            >
              <Circle className="w-6 h-6" />
            </button>
            <button 
              className="text-zinc-400 hover:text-white p-3 hover:bg-white/5 rounded-full transition-all active:scale-90"
              onClick={() => sendKey(187)}
              title="Recent Apps"
            >
              <Square className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>

      {/* Vertical Menu Sidebar */}
      {!sidebarCollapsed && (
        <DeviceSidebar 
          isFullscreen={isFullscreen}
          initialBitrate={bitrateParam || undefined}
          initialResolution={resolutionParam || undefined}
          initialDecoder={decoderParam || undefined}
          onSettingsChange={handleSettingsChange}
          onVolumeUp={() => sendKey(24)}
          onVolumeDown={() => sendKey(25)}
          onMute={() => sendKey(164)}
          onRotate={() => {
            setRotation(r => (r + 90) % 360)
            control?.rotateDevice()
          }}
          onKeyboardToggle={() => console.log('Keyboard toggle TBD')}
          onScreenshot={() => console.log('Screenshot TBD')}
          onRecord={() => console.log('Record TBD')}
        />
      )}
    </div>
  )
}
