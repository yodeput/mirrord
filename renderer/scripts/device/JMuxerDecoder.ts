/**
 * JMuxer-based H.264 decoder
 * Uses Media Source Extensions for native browser H.264 decoding
 */

declare const JMuxer: any;

export class JMuxerDecoder {
  private jmuxer: any = null;
  private video: HTMLVideoElement;
  private isInitialized = false;
  private pendingFrames: Uint8Array[] = [];
  
  constructor(videoElement: HTMLVideoElement) {
    this.video = videoElement;
    this.init();
  }
  
  private init(): void {
    console.log('[JMuxerDecoder] Initializing...');
    
    // JMuxer is loaded via script tag, check if it exists
    if (typeof JMuxer === 'undefined') {
      console.log('[JMuxerDecoder] Loading JMuxer script...');
      const script = document.createElement('script');
      script.src = 'lib/jmuxer.min.js';
      script.onload = () => this.createJMuxer();
      script.onerror = (e) => console.error('[JMuxerDecoder] Failed to load JMuxer:', e);
      document.head.appendChild(script);
    } else {
      this.createJMuxer();
    }
  }
  
  private createJMuxer(): void {
    try {
      this.jmuxer = new JMuxer({
        node: this.video,
        mode: 'video',
        flushingTime: 0, // Immediate flushing for low latency
        fps: 60,
        debug: false,
        onReady: () => {
          console.log('[JMuxerDecoder] Ready');
        },
        onError: (error: any) => {
          console.error('[JMuxerDecoder] Error:', error);
        }
      });
      
      this.isInitialized = true;
      console.log('[JMuxerDecoder] JMuxer created successfully');
      
      // Process any pending frames
      this.processPendingFrames();
      
    } catch (error) {
      console.error('[JMuxerDecoder] Failed to create JMuxer:', error);
    }
  }
  
  private processPendingFrames(): void {
    console.log(`[JMuxerDecoder] Processing ${this.pendingFrames.length} pending frames`);
    for (const frame of this.pendingFrames) {
      this.feedData(frame);
    }
    this.pendingFrames = [];
  }
  
  /**
   * Feed H.264 NAL data to the decoder
   */
  feed(nalData: Uint8Array): void {
    if (!this.isInitialized) {
      this.pendingFrames.push(nalData);
      return;
    }
    
    this.feedData(nalData);
  }
  
  private feedData(nalData: Uint8Array): void {
    if (!this.jmuxer) return;
    
    try {
      // JMuxer expects video data with start codes
      this.jmuxer.feed({
        video: nalData
      });
    } catch (error) {
      console.error('[JMuxerDecoder] Feed error:', error);
    }
  }
  
  /**
   * Destroy the decoder
   */
  destroy(): void {
    if (this.jmuxer) {
      this.jmuxer.destroy();
      this.jmuxer = null;
    }
    this.isInitialized = false;
  }
}
