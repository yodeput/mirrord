import { app } from 'electron';
import { EventEmitter } from 'events';
import { spawn, exec, execFile } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import { downloadPlatformTools } from '../utils/PlatformToolsDownloader';

/**
 * Device information
 */
export interface DeviceInfo {
  serial: string;
  state: 'device' | 'offline' | 'unauthorized' | 'no permissions';
  model?: string;
  product?: string;
  transport_id?: string;
}

/**
 * AdbManager - Manages ADB device detection and communication
 */
export class AdbManager extends EventEmitter {
  private devices: Map<string, DeviceInfo> = new Map();
  private watchInterval: ReturnType<typeof setInterval> | null = null;
  private adbPath: string;
  private scanning: boolean = false;
  private currentScanPromise: Promise<void> | null = null;
  private firstScanDone: boolean = false;

  constructor() {
    super();
    this.adbPath = this.findAdbPath();
    console.log(`[AdbManager] Using ADB: ${this.adbPath}`);
  }

  /**
   * Find ADB executable path
   */
  public findAdbPath(): string {
    const homedir = os.homedir();
    
    // Common ADB locations
    const possiblePaths = [
      // Environment ANDROID_HOME (most reliable if set)
      process.env.ANDROID_HOME ? path.join(process.env.ANDROID_HOME, 'platform-tools', os.platform() === 'win32' ? 'adb.exe' : 'adb') : '',

      // Bundled ADB (prod & dev)
      this.getBundledAdbPath(),
      
      // macOS - Homebrew (Intel & Apple Silicon)
      '/usr/local/bin/adb',
      '/opt/homebrew/bin/adb',
      // macOS - Default SDK location
      path.join(homedir, 'Library/Android/sdk/platform-tools/adb'),
      
      // Linux
      '/usr/bin/adb',
      '/usr/local/bin/adb',
      path.join(homedir, 'Android/Sdk/platform-tools/adb'),
      
      // Windows
      path.join(process.env.LOCALAPPDATA || '', 'Android/Sdk/platform-tools/adb.exe'),
      'C:/Android/sdk/platform-tools/adb.exe',
      
      // Fallback to system PATH
      'adb'
    ].filter(p => p !== '');

    for (const p of possiblePaths) {
      if (p === 'adb') return p; // Assume PATH works as last resort
      try {
        if (fs.existsSync(p)) {
          console.log(`[AdbManager] Found ADB at: ${p}`);
          return p;
        }
      } catch (e) {
        // Skip
      }
    }

    return 'adb';
  }

  /**
   * Get the path to the bundled ADB executable
   */
  private getBundledAdbPath(): string {
    const platform = os.platform();
    let platformDir = '';
    
    if (platform === 'win32') platformDir = 'win';
    else if (platform === 'darwin') platformDir = 'mac';
    else if (platform === 'linux') platformDir = 'linux';
    else return '';

    const adbBin = platform === 'win32' ? 'adb.exe' : 'adb';
    
    // In production/dev, we now download to userData
    const userDataPath = app.getPath('userData');
    
    // Path: <userData>/platform-tools/adb
    return path.join(userDataPath, 'platform-tools', adbBin); 
  }

  /**
   * Set manual ADB path
   */
  public setAdbPath(newPath: string): boolean {
    if (this.isValidPath(newPath)) {
        this.adbPath = newPath;
        console.log(`[AdbManager] ADB path updated to: ${this.adbPath}`);
        return true;
    }
    return false;
  }

  /**
   * Get current ADB path
   */
  public getAdbPath(): string {
    return this.adbPath;
  }

  /**
   * Check if ADB is detected/valid
   */
  public isAdbValid(): boolean {
    return this.isValidPath(this.adbPath);
  }

  /**
   * Verify if a path is a valid ADB executable
   */
  public isValidPath(p: string): boolean {
    if (!p) return false;
    if (p === 'adb') {
        try {
            const { execSync } = require('child_process');
            execSync('adb --version', { stdio: 'ignore' });
            return true;
        } catch (e) {
            return false;
        }
    }
    
    try {
      return fs.existsSync(p) && fs.statSync(p).isFile();
    } catch (e) {
      return false;
    }
  }

  /**
   * Execute ADB command
   */
  async exec(args: string[], serial?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const cmdArgs = serial ? ['-s', serial, ...args] : args;
      
      execFile(this.adbPath, cmdArgs, {
        timeout: 30000,
        encoding: 'utf8',
        windowsHide: true,
      }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          resolve(stdout);
        }
      });
    });
  }

  /**
   * Execute ADB shell command
   */
  async shell(serial: string, command: string): Promise<string> {
    return this.exec(['shell', command], serial);
  }

  /**
   * Start watching for device changes
   */
  startWatching(intervalMs: number = 2000): void {
    if (this.watchInterval) {
      return;
    }

    console.log('[AdbManager] Starting device watch');

    // Initial scan
    this.scanDevices();

    // Periodic scan
    this.watchInterval = setInterval(() => {
      this.scanDevices();
    }, intervalMs);
  }

  /**
   * Stop watching for devices
   */
  stopWatching(): void {
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
      console.log('[AdbManager] Stopped device watch');
    }
  }

  /**
   * Scan for connected devices
   */
  public async scanDevices(): Promise<void> {
    if (this.scanning) {
        return this.currentScanPromise!;
    }

    this.scanning = true;
    this.currentScanPromise = this.internalScan();
    
    try {
        await this.currentScanPromise;
    } finally {
        this.scanning = false;
        this.currentScanPromise = null;
        this.firstScanDone = true;
    }
  }

  private async internalScan(): Promise<void> {
    try {
      const output = await this.exec(['devices', '-l']);
      const lines = output.split('\n').slice(1); // Skip header

      const currentDevices = new Set<string>();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const device = this.parseDeviceLine(trimmed);
        if (device) {
          currentDevices.add(device.serial);

          // Check if new device
          if (!this.devices.has(device.serial)) {
            // Get additional info
            await this.enrichDeviceInfo(device);
            this.devices.set(device.serial, device);
            this.emit('device-connected', device);
          } else {
             // Update state if changed
             const existing = this.devices.get(device.serial)!;
             if (existing.state !== device.state) {
                 existing.state = device.state;
                 this.emit('device-connected', existing); // Re-emit to update UI
             }
          }
        }
      }

      // Check for disconnected devices
      for (const [serial, device] of this.devices) {
        if (!currentDevices.has(serial)) {
          this.devices.delete(serial);
          this.emit('device-disconnected', serial);
        }
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Parse a device line from 'adb devices -l'
   */
  private parseDeviceLine(line: string): DeviceInfo | null {
    // Format: SERIAL STATE [product:X device:Y model:Z transport_id:N]
    const match = line.match(/^(\S+)\s+(\S+)/);
    if (!match) return null;

    const [, serial, state] = match;
    
    // Skip 'List of devices attached' header
    if (serial === 'List') return null;

    const device: DeviceInfo = {
      serial,
      state: state as DeviceInfo['state'],
    };

    // Parse additional properties
    const modelMatch = line.match(/model:(\S+)/);
    if (modelMatch) device.model = modelMatch[1].replace(/_/g, ' ');

    const productMatch = line.match(/product:(\S+)/);
    if (productMatch) device.product = productMatch[1];

    const transportMatch = line.match(/transport_id:(\d+)/);
    if (transportMatch) device.transport_id = transportMatch[1];

    return device;
  }

  /**
   * Get additional device information
   */
  private async enrichDeviceInfo(device: DeviceInfo): Promise<void> {
    if (device.state !== 'device') return;

    try {
      // Get detailed device info via properties
      // This provides better names than 'adb devices -l' (e.g. "Pixel 6" vs "Pixel_6")
      const model = await this.shell(device.serial, 'getprop ro.product.model');
      const manufacturer = await this.shell(device.serial, 'getprop ro.product.manufacturer');
      
      if (model && model.trim()) {
        const cleanModel = model.trim();
        const cleanManuf = manufacturer ? manufacturer.trim() : '';
        
        // Combine if manufacturer not already in model
        if (cleanManuf && !cleanModel.toLowerCase().includes(cleanManuf.toLowerCase())) {
          device.model = `${cleanManuf} ${cleanModel}`;
        } else {
          device.model = cleanModel;
        }
      }
    } catch (error) {
      // Ignore errors - keep existing model from 'adb devices -l' if any
    }
  }

  /**
   * Get list of connected devices
   */
  async getDevices(): Promise<DeviceInfo[]> {
    // Ensure at least one scan has run
    if (!this.firstScanDone) {
      await this.scanDevices();
    }
    return Array.from(this.devices.values());
  }

  /**
   * Get device by serial
   */
  getDevice(serial: string): DeviceInfo | undefined {
    return this.devices.get(serial);
  }

  /**
   * Setup port forwarding
   */
  async forward(serial: string, localPort: number, remotePort: number): Promise<void> {
    await this.exec(['forward', `tcp:${localPort}`, `tcp:${remotePort}`], serial);
    console.log(`[AdbManager] Port forward: localhost:${localPort} -> device:${remotePort}`);
  }

  /**
   * Remove port forwarding
   */
  async unforward(serial: string, localPort: number): Promise<void> {
    try {
      await this.exec(['forward', '--remove', `tcp:${localPort}`], serial);
    } catch (error) {
      // Ignore - might not exist
    }
  }

  /**
   * Push file to device
   */
  async push(serial: string, localPath: string, remotePath: string): Promise<void> {
    await this.exec(['push', localPath, remotePath], serial);
    console.log(`[AdbManager] Pushed ${localPath} -> ${remotePath}`);
  }

  /**
   * Execute command on device via adb shell (streaming)
   */
  spawnShell(serial: string, command: string): ReturnType<typeof spawn> {
    return spawn(this.adbPath, ['-s', serial, 'shell', command], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }

  /**
   * Restart ADB server
   */
  async restart(): Promise<void> {
    console.log('[AdbManager] Restarting ADB server...');
    try {
      await this.exec(['kill-server']);
    } catch (e) {
      // Ignore
    }
    await this.exec(['start-server']);
    console.log('[AdbManager] ADB server restarted');
  }
  /**
   * Get device IP address (wlan0)
   */
  async getDeviceIp(serial: string): Promise<string | null> {
    try {
      // Try ip route first
      const routeOutput = await this.shell(serial, 'ip route');
      const wlanMatch = routeOutput.match(/dev wlan0.*src (\d+\.\d+\.\d+\.\d+)/);
      if (wlanMatch) return wlanMatch[1];
      
      // Fallback to ifconfig/ip addr
      const addrOutput = await this.shell(serial, 'ip addr show wlan0');
      const ipMatch = addrOutput.match(/inet (\d+\.\d+\.\d+\.\d+)/);
      if (ipMatch) return ipMatch[1];
      
      return null;
    } catch (error) {
      console.error(`[AdbManager] Failed to get IP for ${serial}:`, error);
      return null;
    }
  }

  /**
   * Enable ADB over TCP/IP
   */
  async enableTcpIp(serial: string, port: number = 5555): Promise<void> {
    await this.exec(['tcpip', port.toString()], serial);
    console.log(`[AdbManager] Enabled TCP/IP on port ${port} for ${serial}`);
  }

  /**
   * Connect to device over TCP/IP
   */
  async connect(ip: string, port: number = 5555): Promise<string> {
    const address = `${ip}:${port}`;
    const output = await this.exec(['connect', address]);
    console.log(`[AdbManager] Connected to ${address}: ${output}`);
    
    // Trigger a scan immediately to pick up the new device
    this.scanDevices();
    
    return output;
  }
  
  /**
   * Disconnect a device
   */
  async disconnect(serialOrIp: string): Promise<void> {
    await this.exec(['disconnect', serialOrIp]);
    this.scanDevices();
  }

  /**
   * Download and install platform tools
   */
  async downloadPlatformTools(onStatus?: (status: string, progress: number) => void): Promise<boolean> {
    try {
        const success = await downloadPlatformTools(onStatus);
        
        if (success) {
            // Update ADB path
            const newPath = this.getBundledAdbPath();
            this.setAdbPath(newPath);
            console.log(`[AdbManager] Setup complete. ADB Path: ${newPath}`);
        }
        
        return success;
    } catch (error) {
        console.error('[AdbManager] Failed to run downloader:', error);
        return false;
    }
  }
}
