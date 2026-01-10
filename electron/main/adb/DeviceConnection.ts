import * as net from 'net';
import { EventEmitter } from 'events';

/**
 * ScrcpyConnection - Manages TCP connection to scrcpy-server
 * 
 * scrcpy uses multiple socket connections in tunnel_forward mode:
 * 1. Video socket - receives video stream
 * 2. Control socket - sends control messages (if control=true)
 * 
 * Each socket receives:
 * - Dummy byte (1 byte) - connection confirmation
 * - Device name (64 bytes) - only on first socket if send_device_meta=true
 * - Codec info (12 bytes) - only on video socket if send_codec_meta=true
 */

export interface ScrcpyMetadata {
  deviceName: string;
  codecId: number;
  width: number;
  height: number;
}

export class DeviceConnection extends EventEmitter {
  private videoSocket: net.Socket | null = null;
  private controlSocket: net.Socket | null = null;
  private audioSocket: net.Socket | null = null;
  private isConnected = false;
  private serial: string;
  private port: number;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private shouldReconnect = true;
  private retryCount = 0;
  private maxRetries = 30;
  
  // Buffer for accumulating video data
  private videoBuffer: Buffer = Buffer.alloc(0);
  private handshakeComplete = false;
  private deviceName: string = '';
  private codecId: number = 0;
  private videoWidth: number = 0;
  private videoHeight: number = 0;

  constructor(serial: string, port: number = 27183) {
    super();
    this.serial = serial;
    this.port = port;
  }

  /**
   * Connect to scrcpy-server (video + control sockets)
   */
  async connect(): Promise<void> {
    this.shouldReconnect = true;
    this.retryCount = 0;
    this.handshakeComplete = false;
    this.videoBuffer = Buffer.alloc(0);
    
    try {
      // scrcpy socket connection order: Video → Audio → Control
      // (when audio is disabled, socket order is: Video → Control)

      // 1. Connect video socket first
      console.log(`[DeviceConnection] Connecting video socket to port ${this.port}...`);
      this.videoSocket = await this.createSocket('video');
      
      // Wait for scrcpy to prepare the next socket
      await new Promise(resolve => setTimeout(resolve, 300));

      // 2. Connect audio socket (if enabled - comes BEFORE control)
      // Note: Audio will only work if server has audio=true
      // Skipped if audio disabled or device doesn't support it
      console.log(`[DeviceConnection] Attempting audio socket to port ${this.port}...`);
      try {
        this.audioSocket = await this.createSocket('audio');
        this.setupAudioSocket(this.audioSocket);
        console.log(`[DeviceConnection] Audio socket connected`);
      } catch (audioErr) {
        console.warn(`[DeviceConnection] Audio socket unavailable (disabled or unsupported)`);
        this.audioSocket = null;
      }

      // Wait for scrcpy to prepare control socket
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // 3. Connect control socket (always last)
      console.log(`[DeviceConnection] Connecting control socket to port ${this.port}...`);
      this.controlSocket = await this.createSocket('control');
      
      this.isConnected = true;
      console.log(`[DeviceConnection] Connected to ${this.serial} (audio: ${!!this.audioSocket})`);
      
    } catch (error) {
      console.error(`[DeviceConnection] Connection failed:`, error);
      // Clean up partial connection
      if (this.videoSocket) {
        this.videoSocket.destroy();
        this.videoSocket = null;
      }
      if (this.controlSocket) {
        this.controlSocket.destroy();
        this.controlSocket = null;
      }
      if (this.audioSocket) {
        this.audioSocket.destroy();
        this.audioSocket = null;
      }
      this.handleConnectionFailed(error as Error);
    }
  }

  private createSocket(type: 'video' | 'control' | 'audio'): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      socket.setNoDelay(true);

      const connectTimeout = setTimeout(() => {
        socket.destroy();
        reject(new Error(`${type} socket connection timeout`));
      }, 5000);

      socket.connect(this.port, '127.0.0.1', () => {
        clearTimeout(connectTimeout);
        console.log(`[DeviceConnection] ${type} socket connected`);
        
        if (type === 'video') {
          this.setupVideoSocket(socket);
        } else if (type === 'control') {
          this.setupControlSocket(socket);
        }
        // Note: audio socket setup is done separately in connect()
        
        resolve(socket);
      });

      socket.on('error', (error) => {
        clearTimeout(connectTimeout);
        reject(error);
      });
    });
  }

  private setupVideoSocket(socket: net.Socket): void {
    socket.on('data', (data: Buffer) => {
      this.handleVideoData(data);
    });

    socket.on('close', () => {
      console.log(`[DeviceConnection] Video socket closed`);
      this.handleDisconnect();
    });
  }

  private setupControlSocket(socket: net.Socket): void {
    socket.on('data', (data: Buffer) => {
      // Handle control responses (clipboard, rotation changes, etc.)
      this.handleControlData(data);
    });

    socket.on('close', () => {
      console.log(`[DeviceConnection] Control socket closed`);
    });
  }

  private audioBuffer: Buffer = Buffer.alloc(0);
  private audioHandshakeComplete = false;
  private audioPacketCount: number = 0;

  private setupAudioSocket(socket: net.Socket): void {
    socket.on('data', (data: Buffer) => {
      this.handleAudioData(data);
    });

    socket.on('close', () => {
      console.log(`[DeviceConnection] Audio socket closed`);
    });
  }

  private handleAudioData(data: Buffer): void {
    this.audioBuffer = Buffer.concat([this.audioBuffer, data]);

    // Robust handshake: find codec signature ('raw ', 'aac ', or 'opus')
    // scrcpy metadata can be tricky (dummy byte, device name, then codec)
    if (!this.audioHandshakeComplete) {
      const signatures = ['raw', 'aac', 'opu']; // Use 3-char prefixes to be safe
      let foundIdx = -1;
      let signature = '';

      // Look deeper into the buffer (up to 256 bytes) to find the codec ID
      for (const sig of signatures) {
        const idx = this.audioBuffer.indexOf(sig);
        if (idx >= 0 && idx < 256) {
          foundIdx = idx;
          signature = sig;
          break;
        }
      }

      if (foundIdx !== -1) {
        console.log(`[DeviceConnection] Audio handshake complete. Detected: "${signature}" at index ${foundIdx}`);
        // Codec field is 4 bytes. Skip everything up to and including the 4-byte codec field.
        this.audioBuffer = this.audioBuffer.subarray(foundIdx + 4);
        this.audioHandshakeComplete = true;
      } else if (this.audioBuffer.length > 256) {
        // Safety: if we have lots of data but no handshake, we might be misaligned
        console.warn('[DeviceConnection] Audio handshake not found in 256 bytes.');
        console.log('[DeviceConnection] Buffer (hex):', this.audioBuffer.subarray(0, 64).toString('hex'));
        console.log('[DeviceConnection] Buffer (string):', this.audioBuffer.subarray(0, 64).toString('ascii').replace(/[^\x20-\x7E]/g, '.'));
        console.warn('[DeviceConnection] Emergency skip...');
        this.audioHandshakeComplete = true;
      } else {
        return; // Wait for more data
      }
    }

    // Process packets (Header is 12 bytes: 8 bytes PTS + 4 bytes size)
    while (this.audioBuffer.length >= 12) {
      const packetSize = this.audioBuffer.readUint32BE(8);

      if (this.audioBuffer.length < 12 + packetSize) {
        break; // Wait for more data
      }

      // Extract raw payload (standardize to Buffer)
      const payload = Buffer.from(this.audioBuffer.subarray(12, 12 + packetSize));

      if (payload.length > 0) {
        this.audioPacketCount++;
        this.emit('audio-data', payload);
      }

      // Move buffer forward
      this.audioBuffer = this.audioBuffer.subarray(12 + packetSize);
    }
  }

  private handleVideoData(data: Buffer): void {
    this.videoBuffer = Buffer.concat([this.videoBuffer, data]);

    if (!this.handshakeComplete) {
      this.processHandshake();
    } else {
      // Forward video data to renderer
      if (this.videoBuffer.length > 0) {
        // console.log(`[DeviceConnection] Forwarding video data: ${this.videoBuffer.length} bytes`);
        this.emit('data', this.videoBuffer);
        this.videoBuffer = Buffer.alloc(0);
      }
    }
  }

  private controlBuffer: Buffer = Buffer.alloc(0);

  private handleControlData(data: Buffer): void {
    this.controlBuffer = Buffer.concat([this.controlBuffer, data]);
    this.processControlMessage();
  }

  private processControlMessage(): void {
    while (this.controlBuffer.length > 0) {
      const type = this.controlBuffer[0];
      
      switch (type) {
        case 0: // TYPE_CLIPBOARD
          if (this.controlBuffer.length < 5) return; // Need type + length
          const len = this.controlBuffer.readUInt32BE(1);
          if (this.controlBuffer.length < 5 + len) return; // Wait for full text
          
          const text = this.controlBuffer.subarray(5, 5 + len).toString('utf8');
          // console.log(`[DeviceConnection] Clipboard received: "${text}"`);
          this.emit('clipboard', text);
          
          this.controlBuffer = this.controlBuffer.subarray(5 + len);
          break;
          
        case 1: // TYPE_ACK_CLIPBOARD
          if (this.controlBuffer.length < 9) return; // type + sequence(8)
          // We don't use sequence for now
          this.controlBuffer = this.controlBuffer.subarray(9);
          break;
          
        case 2: // TYPE_UHID_OUTPUT
          if (this.controlBuffer.length < 5) return; // type + id(2) + len(2)
          const dataLen = this.controlBuffer.readUInt16BE(3);
          if (this.controlBuffer.length < 5 + dataLen) return;
          this.controlBuffer = this.controlBuffer.subarray(5 + dataLen);
          break;
          
        default:
          console.warn(`[DeviceConnection] Unknown control message type: ${type}`);
          // Should not happen if protocol is correct. 
          // If we get desynced, clear buffer to avoid infinite loop
          this.controlBuffer = Buffer.alloc(0);
          return;
      }
    }
  }

  /**
   * Process scrcpy handshake sequence on video socket
   */
  private processHandshake(): void {
    // Step 1: Dummy byte (1 byte)
    if (this.videoBuffer.length < 1) return;
    
    const dummyByte = this.videoBuffer[0];
    console.log(`[DeviceConnection] Dummy byte: ${dummyByte}`);
    
    // Step 2: Device name (64 bytes)
    if (this.videoBuffer.length < 1 + 64) return;
    
    const nameBuffer = this.videoBuffer.subarray(1, 65);
    const nullIndex = nameBuffer.indexOf(0);
    const name = nameBuffer.subarray(0, nullIndex >= 0 ? nullIndex : 64).toString('utf8');
    if (!this.deviceName) {
      this.deviceName = name;
      console.log(`[DeviceConnection] Device name: ${this.deviceName}`);
    }
    
    // Step 3: Codec info (12 bytes: codec_id u32, width u32, height u32)
    if (this.videoBuffer.length < 1 + 64 + 12) return;
    
    this.codecId = this.videoBuffer.readUInt32BE(65);
    this.videoWidth = this.videoBuffer.readUInt32BE(69);
    this.videoHeight = this.videoBuffer.readUInt32BE(73);
    
    console.log(`[DeviceConnection] Video: codec=0x${this.codecId.toString(16)}, ${this.videoWidth}x${this.videoHeight}`);
    
    // Handshake complete
    this.handshakeComplete = true;
    
    // Emit metadata
    const metadata: ScrcpyMetadata = {
      deviceName: this.deviceName,
      codecId: this.codecId,
      width: this.videoWidth,
      height: this.videoHeight,
    };
    this.emit('connected');
    this.emit('metadata', metadata);
    
    // Remove handshake bytes from buffer, keep remaining video data
    this.videoBuffer = this.videoBuffer.subarray(77);
    
    // Emit any remaining data as video
    if (this.videoBuffer.length > 0) {
      this.emit('data', this.videoBuffer);
      this.videoBuffer = Buffer.alloc(0);
    }
  }

  private handleDisconnect(): void {
    this.isConnected = false;
    this.handshakeComplete = false;
    this.emit('disconnected');
    console.log(`[DeviceConnection] Disconnected from ${this.serial}`);
    this.scheduleReconnect();
  }

  private handleConnectionFailed(error: Error): void {
    console.error(`[DeviceConnection] Connection failed:`, error.message);
    this.isConnected = false;
    this.shouldReconnect = false;
    
    // Emit error so UI can show it, but don't close window immediately
    // unless the UI logic decides to.
    // However, the previous behavior was "infinite retry".
    // The user wants "device windows closed on Connection failed".
    // Wait, the user said "always making device windows closed on ... ECONNREFUSED"
    // and asked to "change this".
    // This implies they usually WANT the window to CLOSE on this error?
    // OR they want to STOP it from closing?
    // "always making device windows closed ... change this" -> "Change the fact that it always closes".
    // So they want the window to STAY OPEN.

    // To keep the window open, we must NOT emit a fatal 'error' that might be caught
    // by a listener that closes the window.
    // AND we should probably stop the infinite retry loop if it's pointless,
    // or keep it running but quietly.

    // If I look at createDeviceWindow.ts, it closes on 'closed' event.
    // The previous loop was: Connection Failed -> scheduleReconnect -> ...
    // The user said "the device windows instanly closed but looping ... in the log".
    // This means the BACKEND loop is running, but the FRONTEND window closed.

    // If the frontend window closes, it's likely because of a crash or an emitted IPC message.
    // But here, let's just emit 'error' (non-fatal) and maybe 'disconnected'.

    this.emit('error', error);
  }

  // Removing scheduleReconnect from automatic usage
  private scheduleReconnect(): void {
     // ...
  }

  /**
   * Send control message to device
   */
  send(data: Buffer | Uint8Array): boolean {
    if (!this.isConnected || !this.controlSocket || !this.handshakeComplete) {
      return false;
    }

    try {
      this.controlSocket.write(data instanceof Buffer ? data : Buffer.from(data));
      return true;
    } catch (error) {
      console.error('[DeviceConnection] Send error:', error);
      return false;
    }
  }

  /**
   * Disconnect from device
   */
  disconnect(): void {
    this.shouldReconnect = false;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.videoSocket) {
      this.videoSocket.destroy();
      this.videoSocket = null;
    }
    
    if (this.controlSocket) {
      this.controlSocket.destroy();
      this.controlSocket = null;
    }
    
    this.isConnected = false;
    this.handshakeComplete = false;
  }

  /**
   * Check if connected
   */
  get connected(): boolean {
    return this.isConnected && this.handshakeComplete;
  }

  /**
   * Get video dimensions
   */
  getVideoDimensions(): { width: number; height: number } {
    return { width: this.videoWidth, height: this.videoHeight };
  }
}
