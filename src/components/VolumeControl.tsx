import React, { useEffect, useState, useRef } from 'react'
import * as Popover from '@radix-ui/react-popover'
import * as Slider from '@radix-ui/react-slider'
import { Volume2Icon, VolumeXIcon, Volume1Icon } from 'lucide-react'

interface VolumeControlProps {
  serial: string
  audioMuted: boolean
  onMuteToggle: () => void
}

export function VolumeControl({ serial, audioMuted, onMuteToggle }: VolumeControlProps) {
  const [volume, setVolume] = useState(50)
  const [isSyncing, setIsSyncing] = useState(false)
  const syncTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Initial volume fetch
  useEffect(() => {
    const fetchVolume = async () => {
      try {
        const vol = await window.mirrorControl.getVolume(serial)
        setVolume(vol.percent)
      } catch (e) {
        console.error('[VolumeControl] Failed to fetch initial volume:', e)
      }
    }
    fetchVolume()
    
    // Poll every 5 seconds to stay in sync with physical buttons
    const interval = setInterval(fetchVolume, 5000)
    return () => clearInterval(interval)
  }, [serial])

  const handleVolumeChange = async (values: number[]) => {
    const newVol = values[0]
    setVolume(newVol)
    
    // Debounce ADB calls
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(async () => {
      setIsSyncing(true)
      try {
        await window.mirrorControl.setVolume(serial, newVol)
      } finally {
        setIsSyncing(false)
      }
    }, 100)
  }

  const VolumeIcon = audioMuted || volume === 0 
    ? VolumeXIcon 
    : volume < 50 ? Volume1Icon : Volume2Icon

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button 
          title="Volume Control"
          className={`p-2 hover:bg-zinc-800 rounded-lg transition-colors ${audioMuted ? 'text-red-500' : 'text-zinc-400 hover:text-white'}`}
        >
          <VolumeIcon className="w-5 h-5" />
        </button>
      </Popover.Trigger>
      
      <Popover.Portal>
        <Popover.Content 
          side="right" 
          sideOffset={12} 
          align="start"
          className="bg-zinc-900 border border-white/10 p-4 rounded-xl shadow-2xl w-64 animate-in fade-in zoom-in-95 duration-200 z-50"
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Media Volume</span>
              <span className="text-xs font-bold text-white bg-zinc-800 px-2 py-0.5 rounded-full">{volume}%</span>
            </div>
            
            <div className="flex items-center gap-3">
              <button 
                onClick={onMuteToggle}
                className={`p-1.5 rounded-md transition-colors ${audioMuted ? 'bg-red-500/20 text-red-500' : 'hover:bg-zinc-800 text-zinc-400 hover:text-white'}`}
              >
                {audioMuted ? <VolumeXIcon size={18} /> : <Volume1Icon size={18} />}
              </button>
              
              <Slider.Root
                className="relative flex items-center select-none touch-none w-full h-5"
                value={[volume]}
                max={100}
                step={1}
                onValueChange={handleVolumeChange}
              >
                <Slider.Track className="bg-zinc-800 relative grow rounded-full h-[4px]">
                  <Slider.Range className="absolute bg-primary rounded-full h-full" />
                </Slider.Track>
                <Slider.Thumb
                  className="block w-4 h-4 bg-white shadow-lg rounded-full hover:scale-110 transition-transform focus:outline-none focus:ring-2 focus:ring-primary"
                  aria-label="Volume"
                />
              </Slider.Root>
            </div>
          </div>
          <Popover.Arrow className="fill-zinc-900 stroke-white/10" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
