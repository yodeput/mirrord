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
      // Connect video socket first
      console.log(`[DeviceConnection] Connecting video socket to port ${this.port}...`);
      this.videoSocket = await this.createSocket('video');
      
      // Wait a bit for scrcpy to prepare the next socket
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Connect control socket
      console.log(`[DeviceConnection] Connecting control socket to port ${this.port}...`);
      this.controlSocket = await this.createSocket('control');
      
      this.isConnected = true;
      console.log(`[DeviceConnection] Both sockets connected to ${this.serial}`);
      
    } catch (error) {
      console.error(`[DeviceConnection] Connection failed:`, error);
      this.handleConnectionFailed(error as Error);
    }
  }

  private createSocket(type: 'video' | 'control'): Promise<net.Socket> {
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
        } else {
          this.setupControlSocket(socket);
        }
        
        resolve(socket);
      });

      socket.on('error', (error) => {
        clearTimeout(connectTimeout);
        console.error(`[DeviceConnection] ${type} socket error:`, error.message);
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
    this.deviceName = nameBuffer.subarray(0, nullIndex > 0 ? nullIndex : 64).toString('utf8');
    console.log(`[DeviceConnection] Device name: ${this.deviceName}`);
    
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
    this.retryCount++;
    
    if (this.retryCount >= this.maxRetries) {
      console.error(`[DeviceConnection] Max retries (${this.maxRetries}) reached, giving up`);
      this.emit('error', new Error('Max connection retries reached'));
      return;
    }

    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect || this.reconnectTimer) {
      return;
    }

    const delay = 2000;
    
    console.log(`[DeviceConnection] Retrying connection in ${delay}ms (attempt ${this.retryCount + 1}/${this.maxRetries})...`);
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldReconnect) {
        this.connect().catch(() => {});
      }
    }, delay);
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
