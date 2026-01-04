
import * as fs from 'fs';
import { app } from 'electron';
import { spawn, ChildProcess } from 'child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AdbManager } from './AdbManager'
import { adbManager } from './instance'

// ESM compatibility
const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * scrcpy-server launcher
 * 
 * Runs scrcpy-server JAR on device via app_process (no APK installation needed)
 */

// Server options
interface ServerOptions {
  bitrate?: number;
  maxSize?: number;
  maxFps?: number;
  tunnelForward?: boolean;
  sendDeviceMeta?: boolean;
  sendCodecMeta?: boolean;
  sendFrameMeta?: boolean;
  audio?: boolean;
  audioCodec?: 'aac' | 'opus' | 'raw';
}

// Default options matching scrcpy defaults
const DEFAULT_OPTIONS: Required<ServerOptions> = {
  bitrate: 8_000_000,
  maxSize: 0,        // 0 = no limit (use device resolution)
  maxFps: 60,
  tunnelForward: true,
  sendDeviceMeta: true,
  sendCodecMeta: true,
  sendFrameMeta: true,
  audio: true,         // Enable audio by default (Android 11+ required)
  audioCodec: 'raw',   // Raw PCM - can play directly without decoding
};

// Active servers
const activeServers = new Map<string, { port: number; process?: any }>();

export class DeviceServer {
  private static readonly SCRCPY_SERVER_VERSION = '3.3.4';
  private static readonly DEVICE_PATH = '/data/local/tmp/scrcpy-server.jar';
  private static readonly SOCKET_NAME = 'scrcpy';

  /**
   * Get path to bundled scrcpy-server
   */
  private static getServerPath(): string {
    // Try process.cwd() first (reliable for dev mode)
    const cwdPath = path.join(process.cwd(), 'resources/scrcpy-server');
    if (fs.existsSync(cwdPath)) return cwdPath;

    const cwdPathJar = path.join(process.cwd(), 'resources/scrcpy-server.jar');
    if (fs.existsSync(cwdPathJar)) return cwdPathJar;

    // Fallback logic
    const possiblePaths = [
      path.join(__dirname, '../../resources/scrcpy-server'), 
      path.join(__dirname, '../../../resources/scrcpy-server'),
      path.join(process.resourcesPath || app.getAppPath(), 'scrcpy-server.jar'),
      path.join(process.resourcesPath || app.getAppPath(), 'scrcpy-server'),
      path.join(process.resourcesPath || app.getAppPath(), 'resources/scrcpy-server')
    ];


    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        // Ensure it is a file, not a directory
        const stat = fs.statSync(p);
        if (stat.isFile()) {
           return p;
        }
      }
    }

    throw new Error(`scrcpy-server not found (checked: ${cwdPath}, ${possiblePaths.join(', ')})`);
  }

  /**
   * Push scrcpy-server to device if needed
   */
  private static async pushServerIfNeeded(serial: string): Promise<void> {
    // Check if already pushed (check file exists)
    try {
      const result = await adbManager.shell(serial, `ls -l ${this.DEVICE_PATH} 2>/dev/null`);
      if (result.includes('scrcpy-server.jar')) {
        console.log(`[DeviceServer] Server already on device ${serial}`);
        return;
      }
    } catch (e) {
      // File doesn't exist, need to push
    }

    console.log(`[DeviceServer] Pushing scrcpy-server to ${serial}...`);
    const serverPath = this.getServerPath();
    await adbManager.push(serial, serverPath, this.DEVICE_PATH);
    console.log(`[DeviceServer] Server pushed to ${serial}`);
  }

  /**
   * Build the server launch command
   */
  private static buildCommand(options: Required<ServerOptions>, scid: number): string {
    const args = [
      `CLASSPATH=${this.DEVICE_PATH}`,
      'app_process',
      '/',
      'com.genymobile.scrcpy.Server',
      this.SCRCPY_SERVER_VERSION,      // version
      `scid=${scid.toString(16).padStart(8, '0')}`,
      'log_level=info',
      'video=true',
      `audio=${options.audio}`,
      `audio_codec=${options.audioCodec}`,
      'control=true',
      `max_size=${options.maxSize}`,
      `max_fps=${options.maxFps}`,
      `video_bit_rate=${options.bitrate}`,
      'video_codec=h264',
      'video_encoder=',               // Use default encoder
      `tunnel_forward=${options.tunnelForward}`,
      `send_device_meta=${options.sendDeviceMeta}`,
      `send_codec_meta=${options.sendCodecMeta}`,
      `send_frame_meta=${options.sendFrameMeta}`,
      'send_dummy_byte=true',
      'raw_stream=false',
    ];
    
    return args.join(' ');
  }

  /**
   * Start scrcpy server on device
   */
  static async start(serial: string, options?: ServerOptions): Promise<number> {
    // Merge with defaults
    const opts: Required<ServerOptions> = { ...DEFAULT_OPTIONS, ...options };
    
    // Generate unique SCID (session ID)
    const scid = Math.floor(Math.random() * 0x7FFFFFFF);
    
    // Allocate port (start from 27183, scrcpy default)
    const port = 27183 + activeServers.size;

    // Push server if needed
    await this.pushServerIfNeeded(serial);

    // Hide soft keyboard when using hardware keyboard (desktop input)
    try {
      await adbManager.shell(serial, 'settings put secure show_ime_with_hard_keyboard 0');
      console.log(`[DeviceServer] Soft keyboard hidden for ${serial}`);
    } catch (e) {
      console.warn('[DeviceServer] Could not hide soft keyboard:', e);
    }

    // Setup port forwarding (tunnel_forward mode)
    // adb forward tcp:PORT localabstract:scrcpy_SCID
    const socketName = `${this.SOCKET_NAME}_${scid.toString(16).padStart(8, '0')}`;
    await adbManager.exec(['forward', `tcp:${port}`, `localabstract:${socketName}`], serial);
    console.log(`[DeviceServer] Port forward: localhost:${port} -> localabstract:${socketName}`);

    // Build and execute command
    const command = this.buildCommand(opts, scid);
    console.log(`[DeviceServer] Starting scrcpy server for ${serial}:`, command);

    // Start server process (runs in background)
    const shellProcess = adbManager.spawnShell(serial, command);
    
    shellProcess.stdout?.on('data', (data: Buffer) => {
      console.log(`[scrcpy-server] ${data.toString().trim()}`);
    });
    
    shellProcess.stderr?.on('data', (data: Buffer) => {
      console.error(`[scrcpy-server] ${data.toString().trim()}`);
    });

    shellProcess.on('close', (code: number) => {
      console.log(`[scrcpy-server] Process exited with code ${code}`);
      activeServers.delete(serial);
    });

    // Store active server info
    activeServers.set(serial, { port, process: shellProcess });

    // Give server time to start and create socket
    await new Promise(resolve => setTimeout(resolve, 1000));

    return port;
  }

  /**
   * Stop server on device
   */
  static async stop(serial: string): Promise<void> {
    const server = activeServers.get(serial);
    if (!server) {
      return;
    }

    // Kill the shell process
    if (server.process) {
      server.process.kill('SIGTERM');
    }

    // Remove port forwarding
    try {
      await adbManager.exec(['forward', '--remove', `tcp:${server.port}`], serial);
    } catch (e) {
      // Ignore errors
    }

    // Kill any remaining scrcpy processes on device
    try {
      await adbManager.shell(serial, 'pkill -f scrcpy-server');
    } catch (e) {
      // Ignore errors
    }

    activeServers.delete(serial);
    console.log(`[DeviceServer] Stopped on ${serial}`);
  }

  /**
   * Stop all active servers
   */
  static async stopAll(): Promise<void> {
    const serials = Array.from(activeServers.keys());
    await Promise.all(serials.map(serial => this.stop(serial)));
  }

  /**
   * Get port for active server
   */
  static getPort(serial: string): number | undefined {
    return activeServers.get(serial)?.port;
  }

  /**
   * Check if server is active
   */
  static isActive(serial: string): boolean {
    return activeServers.has(serial);
  }
}
