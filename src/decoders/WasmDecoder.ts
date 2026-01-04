import JMuxer from 'jmuxerJs'
import { IVideoDecoder } from './types'

export class WasmDecoder implements IVideoDecoder {
  private jmuxer: any | null = null

  init(videoElement: HTMLVideoElement): void {
    try {
      this.jmuxer = new JMuxer({
        node: videoElement,
        mode: 'video',
        flushingTime: 0,
        fps: 60,
        debug: false,
        onError: (err: any) => {
          console.error('[WasmDecoder] JMuxer error:', err)
        }
      })
    } catch (e) {
      console.error('[WasmDecoder] Failed to init JMuxer:', e)
    }
  }

  feed(data: Uint8Array, pts?: number): void {
    if (this.jmuxer) {
        // JMuxer expects an object with 'video' key
      this.jmuxer.feed({
        video: data
      })
    }
  }

  destroy(): void {
    if (this.jmuxer) {
      this.jmuxer.destroy()
      this.jmuxer = null
    }
  }
}
