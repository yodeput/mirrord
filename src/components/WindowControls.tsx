import { Minus, Square, Copy, X } from 'lucide-react'
import { useEffect, useState } from 'react'

export function WindowControls({ showMaximize = true }: { showMaximize?: boolean }) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const unsubscribe = window.mirrorControl.onFullscreenChange((fullscreen) => {
      setIsFullscreen(fullscreen)
    })
    return () => unsubscribe()
  }, [])

  return (
    <div className="flex items-center h-full titlebar-no-drag">
      <button 
        onClick={() => window.mirrorControl.minimize()}
        className="h-10 w-12 flex items-center justify-center hover:bg-zinc-800/50 text-zinc-600 hover:text-white transition-colors"
        title="Minimize"
      >
        <Minus className="w-4 h-4" />
      </button>
      {showMaximize && (
        <button 
          onClick={() => window.mirrorControl.toggleMaximize()}
          className="h-10 w-12 flex items-center justify-center hover:bg-zinc-800/50 text-zinc-600 hover:text-white transition-colors"
          title={isFullscreen ? "Restore" : "Maximize"}
        >
          {isFullscreen ? (
            <Copy className="w-3.5 h-3.5 rotate-180" />
          ) : (
            <Square className="w-3.5 h-3.5" />
          )}
        </button>
      )}
      <button 
        onClick={() => window.mirrorControl.close()}
        className="h-10 w-12 flex items-center justify-center bg-red-600/30 hover:bg-red-600 text-zinc-600 hover:text-white transition-colors"
        title="Close"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
