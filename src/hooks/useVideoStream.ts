import { useEffect, useRef, useState, RefObject } from 'react'
import { DecoderFactory, DecoderType } from '../decoders/Factory'
import { IVideoDecoder } from '../decoders/types'

interface UseVideoStreamOptions {
  serial: string
  port: number
  videoRef: RefObject<HTMLVideoElement>
  decoderType?: DecoderType
  manual?: boolean
}

interface UseVideoStreamReturn {
  connected: boolean
  loading: boolean
  error: string | null
  dimensions: { width: number; height: number } | null
  connect: () => void
}

export function useVideoStream({ serial, port, videoRef, decoderType = 'wasm', manual = false }: UseVideoStreamOptions): UseVideoStreamReturn {
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(!manual)
  const [error, setError] = useState<string | null>(null)
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null)
  
  const decoderRef = useRef<IVideoDecoder | null>(null)
  const connectingRef = useRef(false)
  const currentDecoderType = useRef<DecoderType>(decoderType)

  const activeCleanupRef = useRef<(() => void) | null>(null)
  const initialPtsRef = useRef<number | null>(null)
  const lastPtsRef = useRef<number>(0)

  // Re-initialize if decoder type changes
  useEffect(() => {
    if (decoderType !== currentDecoderType.current) {
        console.log(`[useVideoStream] Decoder changed: ${currentDecoderType.current} -> ${decoderType}`)
        currentDecoderType.current = decoderType;
    }
  }, [decoderType])

  const connect = async () => {
      // 1. Cleanup previous connection if exists
      if (activeCleanupRef.current) {
          console.log('[useVideoStream] Cleaning up previous connection before reconnecting')
          activeCleanupRef.current()
          activeCleanupRef.current = null
      }

      if (!serial || !port || !videoRef.current || connectingRef.current) return
      
      let unsubData: (() => void) | null = null
      let unsubConnected: (() => void) | null = null
      let unsubDisconnected: (() => void) | null = null
      let unsubMetadata: (() => void) | null = null
      
      connectingRef.current = true
      setLoading(true)
      setError(null)
      
      // Reset timestamps for new connection
      initialPtsRef.current = null
      lastPtsRef.current = 0
      
      try {
        // Initialize Decoder Strategy
        console.log(`[useVideoStream] Initializing decoder: ${decoderType}`)
        decoderRef.current = DecoderFactory.create(decoderType)
        decoderRef.current.init(videoRef.current!)

        // Connect to device
        const success = await window.mirrorControl.connect(serial, port)
        if (!success) {
          throw new Error('Failed to connect to device')
        }
        
        // Packet buffer for manual scrcpy frame parsing
        let packetBuffer = new Uint8Array(0);

        // Subscribe to video data
        unsubData = window.mirrorControl.onData((data: Uint8Array) => {
          // Append new data to buffer
          const newBuffer = new Uint8Array(packetBuffer.length + data.length);
          newBuffer.set(packetBuffer);
          newBuffer.set(data, packetBuffer.length);
          packetBuffer = newBuffer;

          // Process packets (Header is 12 bytes: 8 bytes PTS + 4 bytes size)
          while (packetBuffer.length >= 12) {
            const view = new DataView(packetBuffer.buffer, packetBuffer.byteOffset, packetBuffer.byteLength);
            // scrcpy sends big-endian values
            const ptsHigh = view.getUint32(0, false);
            const ptsLow = view.getUint32(4, false);
            const packetSize = view.getUint32(8, false);

            if (packetBuffer.length < 12 + packetSize) {
              break; // Wait for more data
            }

            // Extract frame data (skipping the 12-byte header)
            const frameData = packetBuffer.slice(12, 12 + packetSize);
            packetBuffer = packetBuffer.slice(12 + packetSize);

            // Combine 64-bit PTS (microseconds)
            // Handle NO_PTS (-1 unsigned 64-bit) which is 0xFFFFFFFFFFFFFFFF
            // In our split uint32 view: ptsHigh = 0xFFFFFFFF, ptsLow = 0xFFFFFFFF
            let pts = 0;
            if (ptsHigh === 0xFFFFFFFF && ptsLow === 0xFFFFFFFF) {
               // Use last valid PTS or 0 if none
               pts = lastPtsRef.current;
            } else {
               const rawPts = (ptsHigh * 4294967296) + ptsLow;
               
               // Initialize baseline PTS
               if (initialPtsRef.current === null) {
                 initialPtsRef.current = rawPts;
               }
               
               // Normalize relative to start (guarantees small positive integer)
               pts = rawPts - initialPtsRef.current;
               lastPtsRef.current = pts;
            }

            // Feed to the active decoder
            if (decoderRef.current) {
              decoderRef.current.feed(frameData, pts);
            }
          }
        })
        
        // Subscribe to connection status
        unsubConnected = window.mirrorControl.onConnected(() => {
          console.log('[useVideoStream] Device connected event')
          setConnected(true)
          setLoading(false)
        })
        
        unsubDisconnected = window.mirrorControl.onDisconnected(() => {
          console.log('[useVideoStream] Device disconnected event')
          setConnected(false)
        })

        // Subscribe to metadata
        unsubMetadata = window.mirrorControl.onMetadata((meta: any) => {
          console.log('[useVideoStream] Metadata received:', meta)
          setDimensions({ width: meta.width, height: meta.height })
        })
        
      } catch (e: any) {
        console.error('[useVideoStream] Setup failed:', e)
        setError(e.message || 'Connection failed')
        setLoading(false)
      } finally {
        connectingRef.current = false
      }
      
      // Create cleanup function
      const cleanup = () => {
        unsubData?.()
        unsubConnected?.()
        unsubDisconnected?.()
        unsubMetadata?.()
        
        if (decoderRef.current) {
          decoderRef.current.destroy()
          decoderRef.current = null
        }
        
        window.mirrorControl.stopMirror(serial).catch(() => {})
      }
      
      // Store cleanup for future runs
      activeCleanupRef.current = cleanup
      
      return cleanup
  }

  useEffect(() => {
    if (manual) return

    let mounted = true
    let cleanup: (() => void) | undefined = undefined

    const startConnection = async () => {
      cleanup = await connect()
      
      // If unmounted during connect, run cleanup immediately
      if (!mounted && cleanup) {
        cleanup()
        cleanup = undefined
      }
    }

    startConnection()
    
    // Latency Watcher
    const latencyInterval = setInterval(() => {
      const video = videoRef.current;
      if (video && !video.paused && video.buffered.length > 0) {
        const end = video.buffered.end(video.buffered.length - 1);
        const current = video.currentTime;
        const latency = end - current;
        if (latency > 0.3) {
          video.currentTime = end - 0.01;
        }
      }
    }, 500);

    return () => {
      mounted = false
      clearInterval(latencyInterval)
      if (cleanup) {
        cleanup()
      }
    }
  }, [serial, port, manual])

  return { connected, loading, error, dimensions, connect }
}
