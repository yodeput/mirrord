import { useEffect, RefObject } from 'react'

interface InputHandlerOptions {
  videoRef: RefObject<HTMLVideoElement>
  deviceWidth: number
  deviceHeight: number
  rotation?: number
  onTouch: (event: { action: number; x: number; y: number }) => void
}

export function useInputHandler({
  videoRef,
  deviceWidth,
  deviceHeight,
  rotation = 0,
  onTouch,
}: InputHandlerOptions) {
  useEffect(() => {
    const video = videoRef.current
    if (!video || !deviceWidth || !deviceHeight) return

    let isPointerDown = false
    let lastMoveTime = 0
    const moveThrottleMs = 8

    const canvasToDevice = (clientX: number, clientY: number) => {
      const rect = video.getBoundingClientRect()

      // Calculate actual video render area
      const videoAspect = deviceWidth / deviceHeight
      const rectAspect = rect.width / rect.height

      let renderWidth = rect.width
      let renderHeight = rect.height
      let offsetX = 0
      let offsetY = 0

      // Check object-fit computed style
      const objectFit = window.getComputedStyle(video).objectFit

      if (objectFit === 'contain') {
        if (rectAspect > videoAspect) {
          // Pillarbox (black bars on sides)
          renderWidth = rect.height * videoAspect
          offsetX = (rect.width - renderWidth) / 2
        } else {
          // Letterbox (black bars on top/bottom)
          renderHeight = rect.width / videoAspect
          offsetY = (rect.height - renderHeight) / 2
        }
      }

      // Calculate relative position within the rendered video area
      // Adjust click coordinates by offset
      const clickX = clientX - rect.left - offsetX
      const clickY = clientY - rect.top - offsetY

      // Check if click is outside video area
      if (clickX < 0 || clickX > renderWidth || clickY < 0 || clickY > renderHeight) {
        return null
      }

      // Scale to device coordinates
      const relX = clickX / renderWidth
      const relY = clickY / renderHeight

      let finalX = 0
      let finalY = 0

      // Adjust for local rotation
      if (rotation === 0) {
        finalX = relX * deviceWidth
        finalY = relY * deviceHeight
      } else if (rotation === 90) {
        finalX = relY * deviceWidth
        finalY = (1 - relX) * deviceHeight
      } else if (rotation === 180) {
        finalX = (1 - relX) * deviceWidth
        finalY = (1 - relY) * deviceHeight
      } else if (rotation === 270) {
        finalX = (1 - relY) * deviceWidth
        finalY = relX * deviceHeight
      }

      return {
        x: Math.round(finalX),
        y: Math.round(finalY),
      }
    }

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      isPointerDown = true
      const coords = canvasToDevice(e.clientX, e.clientY)
      if (!coords) return
      onTouch({ action: 0, x: coords.x, y: coords.y }) // ACTION_DOWN
    }

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button !== 0) return
      isPointerDown = false
      const coords = canvasToDevice(e.clientX, e.clientY)
      if (!coords) return
      onTouch({ action: 1, x: coords.x, y: coords.y }) // ACTION_UP
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!isPointerDown) return

      const now = performance.now()
      if (now - lastMoveTime < moveThrottleMs) return
      lastMoveTime = now

      const coords = canvasToDevice(e.clientX, e.clientY)
      if (!coords) return
      onTouch({ action: 2, x: coords.x, y: coords.y }) // ACTION_MOVE
    }

    const handleMouseLeave = (e: MouseEvent) => {
      if (isPointerDown) {
        isPointerDown = false
        const coords = canvasToDevice(e.clientX, e.clientY)
        if (coords) {
          onTouch({ action: 1, x: coords.x, y: coords.y }) // ACTION_UP
        }
      }
    }

    const handleTouchStart = (e: TouchEvent) => {
      // e.preventDefault() // Might break scrolling if not careful
      const touch = e.touches[0]
      if (!touch) return

      isPointerDown = true
      const coords = canvasToDevice(touch.clientX, touch.clientY)
      if (!coords) return
      onTouch({ action: 0, x: coords.x, y: coords.y })
    }

    const handleTouchEnd = (e: TouchEvent) => {
      isPointerDown = false
      const touch = e.changedTouches[0]
      if (!touch) return

      const coords = canvasToDevice(touch.clientX, touch.clientY)
      if (!coords) return
      onTouch({ action: 1, x: coords.x, y: coords.y })
    }

    const handleTouchMove = (e: TouchEvent) => {
      // e.preventDefault()
      const touch = e.touches[0]
      if (!touch) return

      const now = performance.now()
      if (now - lastMoveTime < moveThrottleMs) return
      lastMoveTime = now

      const coords = canvasToDevice(touch.clientX, touch.clientY)
      if (!coords) return
      onTouch({ action: 2, x: coords.x, y: coords.y })
    }

    // Attach listeners
    video.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mouseup', handleMouseUp)
    video.addEventListener('mousemove', handleMouseMove)
    video.addEventListener('mouseleave', handleMouseLeave)

    video.addEventListener('touchstart', handleTouchStart, { passive: false })
    window.addEventListener('touchend', handleTouchEnd)
    video.addEventListener('touchmove', handleTouchMove, { passive: false })

    // Prevent context menu on video
    const handleContextMenu = (e: MouseEvent) => e.preventDefault()
    video.addEventListener('contextmenu', handleContextMenu)

    return () => {
      video.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mouseup', handleMouseUp)
      video.removeEventListener('mousemove', handleMouseMove)
      video.removeEventListener('mouseleave', handleMouseLeave)

      video.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchend', handleTouchEnd)
      video.removeEventListener('touchmove', handleTouchMove)
      video.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [videoRef, deviceWidth, deviceHeight, rotation, onTouch])
}
