import { 
  Volume1Icon, 
  Volume2Icon, 
  VolumeXIcon, 
  KeyboardIcon, 
  RotateCcwIcon, 
  CameraIcon, 
  VideoIcon,
  PowerIcon
} from 'lucide-react'
import { StreamSettings, VideoMaxBitrate, VideoResolution, VideoDecoder } from './StreamSettings'

interface DeviceSidebarProps {
  isFullscreen: boolean
  initialBitrate?: string
  initialResolution?: string
  initialDecoder?: string
  onSettingsChange: (settings: {
    bitrate: VideoMaxBitrate
    resolution: VideoResolution
    decoder: VideoDecoder
  }) => void
  onVolumeDown?: () => void
  onVolumeUp?: () => void
  onMute?: () => void
  onKeyboardToggle?: () => void
  onRotate?: () => void
  onScreenshot?: () => void
  onRecord?: () => void
  onPowerToggle?: () => void
  screenOn?: boolean
  showKeyboard?: boolean
}

export function DeviceSidebar({
  isFullscreen,
  initialBitrate,
  initialResolution,
  initialDecoder,
  onSettingsChange,
  onVolumeDown,
  onVolumeUp,
  onMute,
  onKeyboardToggle,
  onRotate,
  onScreenshot,
  onRecord,
  onPowerToggle,
  screenOn = true,
  showKeyboard = false
}: DeviceSidebarProps) {
  return (
    <div className="w-[48px] bg-zinc-900 border-l border-white/5 flex flex-col items-center gap-3 justify-between shadow-xl">
      {/* Top Section */}
      <div className="pt-10 flex flex-col gap-3">
        <button 
          onClick={onVolumeDown}
          title="Volume Down"
          className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
        >
          <Volume1Icon className="w-5 h-5" />
        </button>
        <button 
          onClick={onVolumeUp}
          title="Volume Up"
          className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
        >
          <Volume2Icon className="w-5 h-5" />
        </button>
        <button 
          onClick={onMute}
          title="Mute"
          className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
        >
          <VolumeXIcon className="w-5 h-5" />
        </button>
        <button 
          onClick={onKeyboardToggle}
          title="Toggle Keyboard"
          className={`p-2 hover:bg-zinc-800 rounded-lg transition-colors ${showKeyboard ? 'text-primary' : 'text-zinc-400 hover:text-white'}`}
        >
          <KeyboardIcon className="w-5 h-5" />
        </button>
        <button 
          onClick={onRotate}
          title="Rotate Screen"
          className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
        >
          <RotateCcwIcon className="w-5 h-5" />
        </button>
        <button 
          onClick={onPowerToggle}
          title={screenOn ? 'Turn Screen Off' : 'Turn Screen On'}
          className={`p-2 hover:bg-zinc-800 rounded-lg transition-colors ${!screenOn ? 'text-red-500' : 'text-zinc-400 hover:text-white'}`}
        >
          <PowerIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Bottom Section */}
      <div className="pb-4 flex flex-col gap-3">
        <button 
          onClick={onScreenshot}
          title="Screenshot"
          className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
        >
          <CameraIcon className="w-5 h-5" />
        </button>
        <button 
          onClick={onRecord}
          title="Record Screen"
          className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
        >
          <VideoIcon className="w-5 h-5" />
        </button>

        <StreamSettings 
          initialBitrate={initialBitrate as VideoMaxBitrate || '10M'}
          initialResolution={initialResolution as VideoResolution || '1080p'}
          initialDecoder={initialDecoder as VideoDecoder || 'wasm'}
          onSettingsChange={onSettingsChange} 
        />
      </div>
    </div>
  )
}
