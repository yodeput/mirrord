import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

export default function DevicePage() {
  const [searchParams] = useSearchParams()
  const serial = searchParams.get('serial') || ''
  const model = searchParams.get('model') || 'Unknown'
  
  const videoRef = useRef<HTMLVideoElement>(null)
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!serial) return

    // TODO: Implement video streaming with JMuxer
    // This is a placeholder - full implementation requires migrating
    // JMuxerDecoder, InputHandler, ScrcpyControl from old-code

    const setupConnection = async () => {
      try {
        // Connect to device
        const port = 27183 // Default scrcpy port
        const success = await window.mirrorControl.connect(serial, port)
        setConnected(success)
        setLoading(false)
      } catch (error) {
        console.error('Connection failed:', error)
        setLoading(false)
      }
    }

    setupConnection()

    return () => {
      // Cleanup
      window.mirrorControl.stopMirror(serial)
    }
  }, [serial])

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Title Bar */}
      <div className="h-10 bg-green-600 titlebar-drag flex items-center justify-center text-white text-sm">
        <span className="font-mono">{serial}</span>
      </div>

      {/* Video Container */}
      <div className="flex-1 flex items-center justify-center relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p>Connecting to {model}...</p>
            </div>
          </div>
        )}
        
        <video
          ref={videoRef}
          className="max-w-full max-h-full object-contain"
          autoPlay
          playsInline
          muted
        />
      </div>

      {/* Navigation Bar */}
      <div className="h-12 bg-green-600 flex items-center justify-center gap-8">
        <button 
          className="text-white p-2 hover:bg-white/20 rounded"
          onClick={() => window.mirrorControl.shell(serial, 'input keyevent 4')}
        >
          ←
        </button>
        <button 
          className="text-white p-2 hover:bg-white/20 rounded"
          onClick={() => window.mirrorControl.shell(serial, 'input keyevent 3')}
        >
          ○
        </button>
        <button 
          className="text-white p-2 hover:bg-white/20 rounded"
          onClick={() => window.mirrorControl.shell(serial, 'input keyevent 187')}
        >
          □
        </button>
      </div>
    </div>
  )
}
