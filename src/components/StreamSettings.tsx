import { useState, useEffect } from 'react'
import { Settings, ChevronDown } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from './ui/button'

// Types for settings
export type VideoCodec = 'h264' | 'h265' | 'av1'
export type VideoResolution = '720p' | '1080p' | 'max'
export type VideoMaxBitrate = '2M' | '4M' | '8M' | '10M' | '16M' | '20M'
export type VideoDecoder =
  | 'wasm' // WebAssembly (JMuxer/TinyH264)
  | 'native-sw' // Native Software
  | 'native-hw' // Native Hardware
  | 'webcodec-sw' // WebCodec Software
  | 'webcodec-hw' // WebCodec Hardware

export type AudioCodec = 'raw' | 'aac' | 'opus'

interface StreamSettingsProps {
  initialBitrate?: VideoMaxBitrate
  initialResolution?: VideoResolution
  initialDecoder?: VideoDecoder
  initialAudioCodec?: AudioCodec
  onSettingsChange: (settings: {
    bitrate: VideoMaxBitrate
    resolution: VideoResolution
    decoder: VideoDecoder
    audioCodec: AudioCodec
  }) => void
}

export function StreamSettings({
  initialBitrate = '10M',
  initialResolution = '1080p',
  initialDecoder = 'wasm',
  initialAudioCodec = 'raw',
  onSettingsChange
}: StreamSettingsProps) {
  const [open, setOpen] = useState(false)
  const [bitrate, setBitrate] = useState<VideoMaxBitrate>(initialBitrate)
  const [resolution, setResolution] = useState<VideoResolution>(initialResolution)
  const [decoder, setDecoder] = useState<VideoDecoder>(initialDecoder)
  const [audioCodec, setAudioCodec] = useState<AudioCodec>(initialAudioCodec)

  // Sync state with props when dialog opens or when props change externally
  useEffect(() => {
    if (open) {
      setBitrate(initialBitrate)
      setResolution(initialResolution)
      setDecoder(initialDecoder)
      setAudioCodec(initialAudioCodec)
    }
  }, [open, initialBitrate, initialResolution, initialDecoder, initialAudioCodec])

  const handleApply = () => {
    onSettingsChange({ bitrate, resolution, decoder, audioCodec })
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
          title="Stream Settings"
        >
          <Settings className="w-5 h-5" />
        </button>
      </DialogTrigger>
      <DialogContent className="rounded-lg max-w-[90%] bg-zinc-950 border-zinc-800 text-zinc-100 gap-6">
        <DialogHeader>
          <DialogTitle className="text-base font-medium">Stream Quality</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Bitrate */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Bitrate</label>
            <div className="relative">
              <select
                value={bitrate}
                onChange={(e) => setBitrate(e.target.value as VideoMaxBitrate)}
                className="w-full bg-zinc-900 hover:bg-zinc-800 transition-colors text-zinc-100 text-sm rounded-lg pl-3 pr-8 py-2.5 appearance-none border border-zinc-800 focus:border-zinc-700 focus:ring-1 focus:ring-zinc-700 outline-none"
              >
                <option value="2M">2 Mbit (Low Latency)</option>
                <option value="4M">4 Mbit</option>
                <option value="8M">8 Mbit</option>
                <option value="10M">10 Mbit (Recommended)</option>
                <option value="16M">16 Mbit</option>
                <option value="20M">20 Mbit (High Quality)</option>
              </select>
              <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-zinc-500 pointer-events-none" />
            </div>
          </div>

          {/* Resolution */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Resolution</label>
            <div className="relative">
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value as VideoResolution)}
                className="w-full bg-zinc-900 hover:bg-zinc-800 transition-colors text-zinc-100 text-sm rounded-lg pl-3 pr-8 py-2.5 appearance-none border border-zinc-800 focus:border-zinc-700 focus:ring-1 focus:ring-zinc-700 outline-none"
              >
                <option value="720p">720p (Fast)</option>
                <option value="1080p">1080p (Balanced)</option>
                <option value="max">Original (Max Quality)</option>
              </select>
              <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-zinc-500 pointer-events-none" />
            </div>
          </div>

          {/* Video Decoder */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Video Decoder</label>
            <div className="relative">
              <select
                value={decoder}
                onChange={(e) => setDecoder(e.target.value as VideoDecoder)}
                className="w-full bg-zinc-900 hover:bg-zinc-800 transition-colors text-zinc-100 text-sm rounded-lg pl-3 pr-8 py-2.5 appearance-none border border-zinc-800 focus:border-zinc-700 focus:ring-1 focus:ring-zinc-700 outline-none"
              >
                <option value="wasm">WebAssembly (Stable)</option>
                <option value="webcodec-sw">WebCodec Software</option>
                <option value="webcodec-hw">WebCodec Hardware</option>
              </select>
              <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-zinc-500 pointer-events-none" />
            </div>
          </div>

          {/* Audio Decoder (Codec) */}
          {/* s */}
        </div>

        <Button
          className="w-full bg-white hover:bg-zinc-200 text-black text-sm font-medium rounded-lg transition-colors mt-2"
          onClick={handleApply}
        >
          Apply Changes
        </Button>

      </DialogContent>
    </Dialog>
  )
}
