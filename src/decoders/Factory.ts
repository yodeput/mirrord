import { IVideoDecoder } from './types'
import { WasmDecoder } from './WasmDecoder'
import { WebCodecDecoder } from './WebCodecDecoder'
import { NativeDecoder } from './NativeDecoder'

export type DecoderType = 'wasm' | 'webcodec-sw' | 'webcodec-hw' | 'native-sw' | 'native-hw'

export class DecoderFactory {
  static create(type: DecoderType): IVideoDecoder {
    switch (type) {
      case 'wasm':
        return new WasmDecoder()
      case 'webcodec-sw':
      case 'webcodec-hw':
        // For now, map both to the same WebCodec class
        return new WebCodecDecoder()
      case 'native-sw':
      case 'native-hw':
        return new NativeDecoder()
      default:
        console.warn(`[DecoderFactory] Unknown type ${type}, falling back to Wasm`)
        return new WasmDecoder()
    }
  }
}
