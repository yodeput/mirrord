/**
 * Interface for video decoders
 */
export interface IVideoDecoder {
  /**
   * Initialize the decoder with the target video element
   */
  init(videoElement: HTMLVideoElement): void

  /**
   * Feed raw H.264 data to the decoder
   */
  feed(data: Uint8Array, pts?: number): void

  /**
   * configure decoder parameters (optional)
   */
  configure?(config: any): void

  /**
   * Clean up resources
   */
  destroy(): void
}

/**
 * Decoder Factory types
 */
export type DecoderType = 'wasm' | 'webcodec' | 'native'
