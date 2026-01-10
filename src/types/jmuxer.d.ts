declare module 'jmuxer' {
  interface JMuxerOptions {
    node: HTMLVideoElement | string;
    mode?: 'video' | 'audio' | 'both';
    flushingTime?: number;
    fps?: number;
    debug?: boolean;
    onReady?: () => void;
    onError?: (error: any) => void;
  }

  interface FeedOptions {
    video?: Uint8Array;
    audio?: Uint8Array;
    duration?: number;
  }

  class JMuxer {
    constructor(options: JMuxerOptions);
    feed(data: FeedOptions): void;
    reset(): void;
    destroy(): void;
  }

  export default JMuxer;
}
