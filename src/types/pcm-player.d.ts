declare module 'pcm-player' {
  interface PCMPlayerOptions {
    inputCodec?: 'Int8' | 'Int16' | 'Int32' | 'Float32';
    channels?: number;
    sampleRate?: number;
    flushTime?: number;
    fftSize?: number;
  }

  class PCMPlayer {
    constructor(options: PCMPlayerOptions);
    feed(data: ArrayBuffer | Uint8Array | Int16Array | Float32Array): void;
    volume(value: number): void;
    destroy(): void;
    pause(): void;
    continue(): void;
  }

  export default PCMPlayer;
}
