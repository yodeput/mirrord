import { useEffect, useRef, useState, useCallback } from 'react'
import PCMPlayer from 'pcm-player'

/**
 * useAudioStream - Hook for playing device audio stream
 *
 * Uses 'pcm-player' library to handle buffering and playback of raw PCM data.
 * Solves jitter/crackle issues by managing a playback buffer.
 *
 * scrcpy raw audio format: 16-bit signed PCM, stereo, 48kHz
 */
export function useAudioStream(options: {
  enabled?: boolean
  volume?: number
  audioCodec?: 'raw' | 'aac' | 'opus'
}) {
  const { enabled = true, volume = 1.0, audioCodec = 'raw' } = options

  const playerRef = useRef<PCMPlayer | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const recordingDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      if (playerRef.current) {
        playerRef.current.destroy()
        playerRef.current = null
      }
      audioContextRef.current = null
      recordingDestinationRef.current = null
      setIsPlaying(false)
      return
    }

    // Initialize PCM Player
    try {
      console.log(`[useAudioStream] Initializing player for codec: ${audioCodec}...`)

      // For now, pcm-player is only for 'raw' (S16 PCM)
      playerRef.current = new PCMPlayer({
        inputCodec: 'Int16',
        channels: 2,
        sampleRate: 48000,
        flushTime: 200,
        fftSize: 1024
      })

      // Set initial volume
      playerRef.current.volume(volume)

      // Store AudioContext reference for recording
      if ((playerRef.current as any).audioCtx) {
        audioContextRef.current = (playerRef.current as any).audioCtx

        // Create a MediaStreamDestination for recording
        recordingDestinationRef.current = audioContextRef.current!.createMediaStreamDestination()

        // Connect the gainNode to the recording destination as well
        if ((playerRef.current as any).gainNode) {
          (playerRef.current as any).gainNode.connect(recordingDestinationRef.current)
        }
      }

      // EXTREMELY IMPORTANT: Resume AudioContext after a short delay
      // Browsers often suspend it until a user gesture or mirror start
      const resumeContext = async () => {
        if (playerRef.current && (playerRef.current as any).audioCtx) {
          const ctx = (playerRef.current as any).audioCtx as AudioContext
          if (ctx.state === 'suspended') {
            console.log('[useAudioStream] AudioContext is suspended, resuming...')
            await ctx.resume()
          }
          console.log('[useAudioStream] AudioContext state:', ctx.state)
        }
      }

      // Attempt resume immediately and again after 500ms
      resumeContext()
      setTimeout(resumeContext, 500)

    } catch (e) {
      setError('Failed to initialize audio player')
      console.error('[useAudioStream] Player init error:', e)
      return
    }

    // Subscribe to audio data from device
    const unsubscribe = window.mirrorControl.onAudioData((data: Buffer) => {
      if (!playerRef.current) return

      // Check for codec mismatch (future proofing)
      if (audioCodec !== 'raw') {
        // console.warn(`[useAudioStream] Received data for ${audioCodec}, but only 'raw' is supported via pcm-player currently.`);
        return;
      }

      // Convert Buffer to Int16Array for the Int16 player
      // data is a Buffer/Uint8Array from IPC
      try {
        const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
        const samples = new Int16Array(buffer)

        if (!(playerRef.current as any)['_firstData']) {
          console.log(`[useAudioStream] First ${audioCodec} data received (${data.byteLength} bytes), feeding player`);
          (playerRef.current as any)['_firstData'] = true;
          // One more attempt to resume on first data
          if ((playerRef.current as any).audioCtx?.state === 'suspended') {
             (playerRef.current as any).audioCtx.resume();
          }
        }

        playerRef.current.feed(samples as any)
      } catch (e) {
        console.error('[useAudioStream] Error feeding audio samples:', e)
      }
    })

    setIsPlaying(true)

    return () => {
      unsubscribe()
      if (playerRef.current) {
        playerRef.current.destroy()
        playerRef.current = null
      }
      audioContextRef.current = null
      recordingDestinationRef.current = null
      setIsPlaying(false)
    }
  }, [enabled, audioCodec])

  // Update volume when changed
  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.volume(volume)
    }
  }, [volume])

  // Get audio stream for recording
  const getRecordingStream = useCallback(() => {
    if (recordingDestinationRef.current) {
      return recordingDestinationRef.current.stream
    }
    return null
  }, [])

  return {
    isPlaying,
    error,
    setVolume: (v: number) => {
      if (playerRef.current) {
        playerRef.current.volume(v)
      }
    },
    getRecordingStream
  }
}
