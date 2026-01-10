import { IVideoDecoder } from './types'

export class NativeDecoder implements IVideoDecoder {
  init(videoElement: HTMLVideoElement): void {
     // Native decoding would likely use a different mechanism (e.g. streaming URL)
     // rather than feeding bytes to JS.
     console.log('[NativeDecoder] Initialized (Placeholder)')
  }

  feed(data: Uint8Array, pts?: number): void {
    // No-op for now
  }

  destroy(): void {
    console.log('[NativeDecoder] Destroyed')
  }
}
