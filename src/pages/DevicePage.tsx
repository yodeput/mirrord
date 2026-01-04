import { useEffect, useRef, useMemo, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useVideoStream } from '@/hooks/useVideoStream'
import { useInputHandler } from '@/hooks/useInputHandler'
import { useAudioStream } from '@/hooks/useAudioStream'
import { ScrcpyControl } from '@/scripts/ScrcpyControl'
import { StreamSettings, VideoResolution, AudioCodec, VideoMaxBitrate, VideoDecoder } from '@/components/StreamSettings'
import { ArrowLeft, Circle, Square, X, ChevronsLeft, ChevronsRight, Usb, Wifi } from 'lucide-react'
import { DecoderType } from '@/decoders/Factory'
import { DeviceSidebar } from '@/components/DeviceSidebar'


export default function DevicePage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const serial = searchParams.get('serial') || ''
  const model = searchParams.get('model') || 'Unknown'
  const portParam = searchParams.get('port')
  const bitrateParam = searchParams.get('bitrate')
  const resolutionParam = searchParams.get('resolution')
  const decoderParam = searchParams.get('decoder')
  
  const [currentPort, setCurrentPort] = useState(portParam ? parseInt(portParam, 10) : 27183)
  const [selectedDecoder, setSelectedDecoder] = useState<DecoderType>((decoderParam as DecoderType) || 'wasm')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [rotation, setRotation] = useState(0) // 0, 90, 180, 270
  const [screenOn, setScreenOn] = useState(true)
  const [showKeyboard, setShowKeyboard] = useState(true)
  const [screenshotFlash, setScreenshotFlash] = useState(false)
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null)
  const [screenshotFilePath, setScreenshotFilePath] = useState<string | null>(null)
  const [audioMuted, setAudioMuted] = useState(false)
  const [selectedAudioCodec, setSelectedAudioCodec] = useState<AudioCodec>((searchParams.get('audioCodec') as AudioCodec) || 'raw')
  
  // Recording state
  const [isRecording, setIsRecording] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  
  const videoRef = useRef<HTMLVideoElement>(null)
  
  const { connected, loading, error, dimensions, connect } = useVideoStream({
    serial,
    port: currentPort,
    videoRef,
    manual: true,
    decoderType: selectedDecoder
  })

  // Audio stream (Android 11+ required)
  const { isPlaying: audioPlaying } = useAudioStream({
    enabled: connected && !audioMuted,
    audioCodec: selectedAudioCodec,
    volume: audioMuted ? 0 : 1
  })
  
  const parseBitrate = (bitrate: string) => {
    return parseInt(bitrate.replace('M', '')) * 1_000_000
  }

  const parseResolution = (res: string) => {
    if (res === 'max') return 0
    if (res === '1080p') return 1080 
    if (res === '720p') return 720
    return 0
  }

  const handleSettingsChange = async (settings: { 
    bitrate: VideoMaxBitrate, 
    resolution: VideoResolution, 
    decoder: VideoDecoder,
    audioCodec: AudioCodec
  }) => {
    console.log('[DevicePage] Applying settings (via restart):', settings)
    setInitialLoading(true)
    
    try {
      await window.mirrorControl.restartMirror(serial, {
        bitrate: parseBitrate(settings.bitrate),
        maxSize: parseResolution(settings.resolution),
        resolution: settings.resolution,
        bitrateValue: settings.bitrate,
        decoder: settings.decoder,
        audioCodec: settings.audioCodec
      })
      
      // Update URL for persistence
      navigate(`?serial=${serial}&model=${model}&bitrate=${settings.bitrate}&resolution=${settings.resolution}&decoder=${settings.decoder}&audioCodec=${settings.audioCodec}`, { replace: true })
      
      setSelectedAudioCodec(settings.audioCodec as AudioCodec)
      
      setTimeout(() => {
        connect()
        setInitialLoading(false)
      }, 1000)
    } catch (e) {
      console.error('[DevicePage] Failed to apply settings:', e)
      setInitialLoading(false)
    }
  }

  // Detect fullscreen state changes
  useEffect(() => {
    const handleDomFullscreen = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handleDomFullscreen)
    const unsubscribe = window.mirrorControl.onFullscreenChange((fullscreen: boolean) => setIsFullscreen(fullscreen))
    setIsFullscreen(!!document.fullscreenElement)
    return () => {
      document.removeEventListener('fullscreenchange', handleDomFullscreen)
      unsubscribe()
    }
  }, [])

  // Auto-connect and Sync URL params after 1s
  useEffect(() => {
    // Populate missing URL params for persistence
    const params = new URLSearchParams(searchParams)
    let updated = false
    
    if (!params.has('bitrate')) { params.set('bitrate', '10M'); updated = true; }
    if (!params.has('resolution')) { params.set('resolution', '1080p'); updated = true; }
    if (!params.has('decoder')) { params.set('decoder', 'wasm'); updated = true; }
    if (!params.has('audioCodec')) { params.set('audioCodec', 'raw'); updated = true; }
    
    if (updated) {
      navigate(`?${params.toString()}`, { replace: true })
    }

    const timer = setTimeout(() => {
      setInitialLoading(false)
      connect()
    }, 1000)
    return () => clearTimeout(timer)
  }, [])

  const control = useMemo(() => {
    if (!dimensions) return null
    try {
      return new ScrcpyControl(
        dimensions.width,
        dimensions.height,
        (data) => window.mirrorControl.send(serial, data)
      )
    } catch (e) {
      return null
    }
  }, [dimensions, serial])

  useInputHandler({
    videoRef,
    deviceWidth: dimensions?.width || 0,
    deviceHeight: dimensions?.height || 0,
    rotation,
    onTouch: (event) => control?.sendTouch(event)
  })

  // Keyboard Input Handler
  useEffect(() => {
    if (!showKeyboard || !control) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent browser shortcuts
      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase()
        
        if (key === 'v') {
          // Sync clipboard to device on Paste
          navigator.clipboard.readText().then(text => {
            control.setClipboard(text, true)
          }).catch(err => console.error('Failed to read clipboard:', err))
          e.preventDefault()
        } else if (key === 'c') {
          // Copy Shortcut: Keycode C (31) + CTRL (0x1000)
          control.sendKey(31, undefined, undefined, 0x1000)
          e.preventDefault()
        } else if (key === 'x') {
          // Cut Shortcut: Keycode X (52) + CTRL (0x1000)
          control.sendKey(52, undefined, undefined, 0x1000)
          e.preventDefault()
        }
        return
      }

      // Special keys mapping
      const keyMap: Record<string, number> = {
        'Backspace': 67,
        'Enter': 66,
        'Escape': 111,
        'ArrowLeft': 21,
        'ArrowRight': 22,
        'ArrowUp': 19,
        'ArrowDown': 20,
        'Delete': 112,
        'Home': 122,
        'End': 123,
      }

      if (keyMap[e.key]) {
        e.preventDefault()
        control.sendKey(keyMap[e.key])
      } else if (e.key.length === 1) {
        // Normal character injection
        e.preventDefault()
        control.injectText(e.key)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showKeyboard, control])

  // Device -> Host Clipboard Sync
  useEffect(() => {
    const unsubscribe = window.mirrorControl.onClipboard((text: string) => {
      console.log('[DevicePage] Received clipboard:', text)
      navigator.clipboard.writeText(text).catch(err => {
        console.error('Failed to write host clipboard:', err)
      })
    })
    return () => unsubscribe()
  }, [])

  // Sync soft keyboard visibility
  useEffect(() => {
    if (serial) {
      // Hide soft keyboard (visible=false) when host input (showKeyboard) is ON
      window.mirrorControl.setSoftKeyboardVisible(serial, !showKeyboard)
        .then(() => {
          // If turning ON keyboard mode, try to dismiss any current keyboard with Escape
          if (showKeyboard && control) {
            setTimeout(() => {
              control.sendKey(111); // ESC
            }, 300);
          }
        })
        .catch(err => console.error('Failed to sync soft keyboard:', err))
    }
  }, [showKeyboard, serial, control])



  // Window Resize Management
  const initialResizeDone = useRef(false)
  useEffect(() => {
    if (dimensions) {
      const isRotated = rotation === 90 || rotation === 270
      const currentWidth = isRotated ? dimensions.height : dimensions.width
      const currentHeight = isRotated ? dimensions.width : dimensions.height
      const sidebarWidth = (sidebarCollapsed || loading || initialLoading) ? 0 : 48
      
      window.mirrorControl.resizeWindow(currentWidth, currentHeight, 96, sidebarWidth)
        .then(() => {
          initialResizeDone.current = true
        })
        .catch((e: Error) => console.error('[DevicePage] Resize failed:', e))
    }
  }, [dimensions, rotation])

  // Sidebar Toggle - Sync with Window Resize
  const prevSidebarCollapsed = useRef(sidebarCollapsed)
  useEffect(() => {
    if (prevSidebarCollapsed.current !== sidebarCollapsed && initialResizeDone.current) {
      const delta = sidebarCollapsed ? -48 : 48
      window.mirrorControl.adjustWidth(delta)
    }
    prevSidebarCollapsed.current = sidebarCollapsed
  }, [sidebarCollapsed])

  const sendKey = (keycode: number) => {
    control?.sendKey(keycode)
  }

  const handlePowerToggle = () => {
    const newState = !screenOn
    setScreenOn(newState)
    control?.setDisplayPower(newState)
  }

  const handleRecordToggle = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  const startRecording = () => {
    if (!videoRef.current) return
    
    try {
      const stream = (videoRef.current as any).captureStream()
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9'
      })
      
      recordedChunksRef.current = []
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordedChunksRef.current.push(e.data)
        }
      }
      
      mediaRecorder.onstop = () => {
        saveRecording()
      }
      
      mediaRecorder.start()
      mediaRecorderRef.current = mediaRecorder
      setIsRecording(true)
      console.log('[DevicePage] Recording started')
    } catch (e) {
      console.error('[DevicePage] Failed to start recording:', e)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      console.log('[DevicePage] Recording stopped')
    }
  }

  const saveRecording = () => {
    if (recordedChunksRef.current.length === 0) return
    
    const blob = new Blob(recordedChunksRef.current, {
      type: 'video/webm'
    })
    
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    a.href = url
    a.download = `recording-${model}-${timestamp}.webm`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    recordedChunksRef.current = []
    console.log('[DevicePage] Recording saved')
  }


  return (
    <div className="min-h-screen bg-black flex overflow-hidden">
      {/* Device Screen + Controls */}
      <div className="flex-1 flex flex-col relative overflow-hidden bg-black">
        {/* Title Bar */}
        {!isFullscreen && (
          <div className="h-10 bg-zinc-900 titlebar-drag flex items-center px-3 border-b border-white/5">
            <div className={`flex items-center gap-2 flex-1 ml-[70px] truncate ${sidebarCollapsed ? '' : 'mr-12'}`}>
              {(serial.includes('.') || serial.includes(':')) ? (
                <Wifi className="w-3.5 h-3.5 text-zinc-500" />
              ) : (
                <Usb className="w-3.5 h-3.5 text-zinc-500" />
              )}
              <span className="font-mono text-xs text-zinc-400 truncate">{model}</span>
            </div>
            {!loading && !initialLoading && (
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="titlebar-no-drag p-1.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white transition-colors"
              >
                {sidebarCollapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
              </button>
            )}
          </div>
        )}

        {/* Video Container */}
        <div className="flex-1 relative bg-black overflow-hidden select-none">
          {(loading || initialLoading) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black text-white z-10">
              <div className="w-10 h-10 border-4 border-white/10 border-t-white rounded-full animate-spin mb-4" />
              <p className="text-sm text-zinc-400">Connecting...</p>
            </div>
          )}
          <video
            ref={videoRef}
            className={`absolute inset-0 w-full h-full ${isFullscreen ? 'object-contain' : 'object-fill'} pointer-events-auto cursor-crosshair transition-opacity duration-300 ${loading || error ? 'opacity-0' : 'opacity-100'}`}
            style={{
              transform: `rotate(${rotation}deg)`,
              transformOrigin: 'center center',
            }}
            autoPlay playsInline muted
          />
          
          {/* Screenshot Flash Effect */}
          {screenshotFlash && (
            <div 
              className="absolute inset-0 bg-white z-50 animate-[fadeOut_0.2s_ease-out_forwards]"
              style={{ animationFillMode: 'forwards' }}
            />
          )}
          
          {/* Screenshot Thumbnail Preview */}
          {screenshotPreview && (
            <div 
              className="absolute bottom-4 right-4 z-40 animate-[slideIn_0.3s_ease-out]"
              onClick={() => {
                if (screenshotFilePath) {
                  window.mirrorControl.openExternal(`file://${screenshotFilePath}`)
                }
              }}
            >
              <div className="bg-zinc-800 rounded-lg shadow-2xl border border-white/10 p-1 hover:scale-105 transition-transform cursor-pointer">
                <img 
                  src={screenshotPreview} 
                  alt="Screenshot" 
                  className="w-20 h-auto rounded"
                />
              </div>
            </div>
          )}
        </div>

        {/* Bottom Nav */}
        <div className="h-14 bg-zinc-900 flex items-center justify-center border-t border-white/5">
          <div className="flex items-center justify-center gap-12 h-full w-full">
            <button className="text-zinc-400 hover:text-white p-3 hover:bg-white/5 rounded-full transition-all active:scale-90" onClick={() => sendKey(4)}><ArrowLeft className="w-6 h-6" /></button>
            <button className="text-zinc-400 hover:text-white p-3 hover:bg-white/5 rounded-full transition-all active:scale-90" onClick={() => sendKey(3)}><Circle className="w-6 h-6" /></button>
            <button className="text-zinc-400 hover:text-white p-3 hover:bg-white/5 rounded-full transition-all active:scale-90" onClick={() => sendKey(187)}><Square className="w-6 h-6" /></button>
          </div>
        </div>
      </div>

      {/* Sidebar */}
      {!sidebarCollapsed && !loading && !initialLoading && (
        <DeviceSidebar 
          serial={serial}
          isFullscreen={isFullscreen}
          initialBitrate={searchParams.get('bitrate') || '10M'}
          initialResolution={searchParams.get('resolution') || '1080p'}
          initialDecoder={selectedDecoder}
          initialAudioCodec={selectedAudioCodec}
          onSettingsChange={handleSettingsChange}
          onVolumeUp={() => sendKey(24)}
          onVolumeDown={() => sendKey(25)}
          onMute={() => setAudioMuted(!audioMuted)}
          audioMuted={audioMuted}
          onRotate={() => {
            setRotation(r => (r + 90) % 360)
            control?.rotateDevice()
          }}
          onKeyboardToggle={() => setShowKeyboard(!showKeyboard)}
          onPowerToggle={handlePowerToggle}
          screenOn={screenOn}
          showKeyboard={showKeyboard}
          onScreenshot={async () => {
            try {
              // Flash effect
              setScreenshotFlash(true)
              setTimeout(() => setScreenshotFlash(false), 200)
              
              const { filePath, dataUrl } = await window.mirrorControl.takeScreenshot(serial, model)
              console.log('[DevicePage] Screenshot saved:', filePath)
              
              // Show thumbnail preview using base64 data URL
              setScreenshotPreview(dataUrl)
              setScreenshotFilePath(filePath)
              setTimeout(() => {
                setScreenshotPreview(null)
                setScreenshotFilePath(null)
              }, 4000)
            } catch (e) {
              console.error('[DevicePage] Screenshot failed:', e)
            }
          }}
          onRecord={handleRecordToggle}
          isRecording={isRecording}
        />
      )}
    </div>
  )
}
