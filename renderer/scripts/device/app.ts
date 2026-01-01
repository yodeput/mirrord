/**
 * Device Window Application - scrcpy Protocol
 * 
 * Handles video streaming and input control via scrcpy protocol
 */

import { JMuxerDecoder } from './JMuxerDecoder';
import { InputHandler } from './InputHandler';
import { ScrcpyControl } from './ScrcpyControl';
import { QualityPresets, type QualitySettings, getPresetName } from '../shared/QualityPresets';
import { KeyMapper } from './KeyMapper';

declare global {
  interface Window {
    mirrorControl: any;
  }
}

// scrcpy codec IDs

// scrcpy codec IDs
const SC_CODEC_ID_H264 = 0x68323634; // "h264"
const SC_CODEC_ID_H265 = 0x68323635; // "h265"
const SC_CODEC_ID_AV1 = 0x00617631; // "av1"

// Android Keycodes
const AK_UNKNOWN = 0;
const AK_HOME = 3;
const AK_BACK = 4;
const AK_ENTER = 66;
const AK_DEL = 67;
const AK_TAB = 61;
const AK_SPACE = 62;
const AK_ESCAPE = 111;
const AK_UP = 19;
const AK_DOWN = 20;
const AK_LEFT = 21;
const AK_RIGHT = 22;
const AK_PAGE_UP = 92;
const AK_PAGE_DOWN = 93;
const AK_MOVE_HOME = 122;
const AK_MOVE_END = 123;
const AK_FORWARD_DEL = 112;
const AK_CTRL_LEFT = 113;
const AK_CTRL_RIGHT = 114;
const AK_SHIFT_LEFT = 59;
const AK_SHIFT_RIGHT = 60;
const AK_ALT_LEFT = 57;
const AK_ALT_RIGHT = 58;

// Meta states
const AMETA_ALT_ON = 0x02;
const AMETA_SHIFT_ON = 0x01;
const AMETA_CTRL_ON = 0x1000;

// Mapping
const KEY_MAP: Record<string, number> = {
  'Enter': AK_ENTER,
  'Backspace': AK_DEL,
  'Delete': AK_FORWARD_DEL,
  'Tab': AK_TAB,
  'Escape': AK_ESCAPE,
  'ArrowUp': AK_UP,
  'ArrowDown': AK_DOWN,
  'ArrowLeft': AK_LEFT,
  'ArrowRight': AK_RIGHT,
  'Home': AK_MOVE_HOME,
  'End': AK_MOVE_END,
  'PageUp': AK_PAGE_UP,
  'PageDown': AK_PAGE_DOWN,
};

interface ScrcpyMetadata {
  deviceName: string;
  codecId: number;
  width: number;
  height: number;
}

class DeviceApp {
  private serial: string;
  private model: string;
  
  // Components
  private jmuxer: JMuxerDecoder | null = null;
  private inputHandler: InputHandler | null = null;
  private control: ScrcpyControl | null = null;
  private keyMapper: KeyMapper | null = null;
  
  // DOM Elements
  private videoElement: HTMLVideoElement;
  private loadingOverlay: HTMLElement;
  private settingsPanel: HTMLElement;
  private actionMenu: HTMLElement;
  private settingsModal: HTMLDialogElement;
  
  // State
  private deviceInfo: { width: number; height: number } | null = null;
  private currentQuality: QualitySettings;
  private isConnected = false;
  private isRestarting = false;
  private hasReceivedVideo = false;
  private lastVideoWidth = 0;
  private lastVideoHeight = 0;
  private cleanupFunctions: (() => void)[] = [];
  private port: number = 27183;
  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundKeyUp: (e: KeyboardEvent) => void;
  
  // Video packet buffer
  private packetBuffer: Uint8Array = new Uint8Array(0);
  
  // Keyboard State
  private savedIme: string | null = null;

  constructor() {
    // Parse URL params
    const params = new URLSearchParams(window.location.search);
    this.serial = params.get('serial') || 'Unknown';
    this.model = params.get('model') || 'Unknown';
    this.port = parseInt(params.get('port') || '27183');
    
    // Get DOM elements
    this.videoElement = document.getElementById('video-player') as HTMLVideoElement;
    this.loadingOverlay = document.getElementById('loading-overlay')!;
    this.settingsPanel = document.getElementById('settings-panel')!;
    this.actionMenu = document.getElementById('action-menu')!;
    this.settingsModal = document.getElementById('settings-modal') as HTMLDialogElement;
    
    // Default quality
    // Use lower quality for wireless connections to avoid lag
    const isWireless = this.serial.includes(':') || this.serial.includes('.');
    
    const usbIcon = document.getElementById('icon-usb');
    const wifiIcon = document.getElementById('icon-wifi');
    
    if (isWireless) {
      // Wireless default: Mid (50%)
      this.currentQuality = QualityPresets.medium;
      if (wifiIcon) wifiIcon.style.display = 'block';
      console.log('[DeviceApp] Wireless mode detected, applying Mid preset:', this.currentQuality);
    } else {
      // Wired default: Best (Max)
      this.currentQuality = QualityPresets.max;
      if (usbIcon) usbIcon.style.display = 'block';
    }
    
    
    // Bind key handlers BEFORE init (setupEventListeners uses these)
    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundKeyUp = this.handleKeyUp.bind(this);
    
    this.init();
  }

  private async init(): Promise<void> {
    // Update UI
    const serialEl = document.getElementById('device-serial')!;
    serialEl.textContent = this.serial;
    
    // Respect preference
    const showSerial = localStorage.getItem('show_device_serial') !== 'false';
    if (!showSerial) {
        serialEl.style.display = 'none';
    }

    document.title = `${this.model} - .mirrord`;
    
    // Setup event listeners
    this.setupEventListeners();
    this.setupSettings();
    this.setupSidebarControl();
    
    // Setup JMuxer decoder
    this.setupJMuxer();
    
    // Setup IPC event listeners
    this.setupDataListeners();
    
    // Connect to device
    // First, try to get device size for percentage calculation
    try {
        const sizeOut = await window.mirrorControl.shell(this.serial, 'wm size');
        const match = sizeOut.match(/Physical size: (\d+)x(\d+)/);
        if (match) {
            this.deviceInfo = { width: parseInt(match[1]), height: parseInt(match[2]) };
        }
    } catch (e) {
        console.warn('Failed to get device size, assuming default', e);
    }

    this.startResolutionWatcher();
    await this.connect();
  }

  private setupDataListeners(): void {
    // Listen for scrcpy metadata (handshake complete)
    const unsubMetadata = window.mirrorControl.onMetadata((metadata: ScrcpyMetadata) => {
      console.log('[DeviceApp] Metadata received:', metadata);
      this.handleMetadata(metadata);
    });
    this.cleanupFunctions.push(unsubMetadata);

    // Listen for video data
    const unsubData = window.mirrorControl.onData((data: Uint8Array) => {
      // console.log(`[DeviceApp] Data received: ${data.length} bytes`);
      this.hasReceivedVideo = true; // Mark as alive
      
      // Force hide loading if we are receiving data (fallback for missing metadata)
      if (this.loadingOverlay.style.display !== 'none') {
        console.log('[DeviceApp] Video data received, forcing loading overlay hide');
        this.showLoading(false);
      }

      this.handleVideoData(new Uint8Array(data));
    });
    this.cleanupFunctions.push(unsubData);

    const unsubConnected = window.mirrorControl.onConnected(() => {
      console.log('[DeviceApp] Connected to device');
      this.isConnected = true;
    });
    this.cleanupFunctions.push(unsubConnected);

    const unsubDisconnected = window.mirrorControl.onDisconnected(() => {
      console.log('[DeviceApp] Disconnected');
      this.isConnected = false;
      this.showLoading(true);
    });
    this.cleanupFunctions.push(unsubDisconnected);

    const unsubError = window.mirrorControl.onError((error: string) => {
      console.error('[DeviceApp] Socket error:', error);
    });
    this.cleanupFunctions.push(unsubError);
  }

  private handleMetadata(metadata: ScrcpyMetadata): void {
    const codecName = this.getCodecName(metadata.codecId);
    console.log(`[DeviceApp] Video: ${codecName} ${metadata.width}x${metadata.height}`);
    
    this.deviceInfo = {
      width: metadata.width,
      height: metadata.height,
    };
    
    // Setup input handler
    if (!this.inputHandler) {
      this.control = new ScrcpyControl(
        metadata.width,
        metadata.height,
        (data) => this.sendData(data)
      );
      this.inputHandler = new InputHandler(
        this.videoElement,
        metadata.width,
        metadata.height,
        (packet) => this.control?.sendTouch(packet)
      );
      
      // Initialize KeyMapper
      this.keyMapper = new KeyMapper(
          this.control,
          metadata.width,
          metadata.height
      );
    }
    
    // Update dimensions if already exists
    if (this.keyMapper) {
        this.keyMapper.setDimensions(metadata.width, metadata.height);
    }
    
    // No need to resize - video element auto-sizes
    
    // Resize window to fit video dimensions + chrome
    this.adjustWindowSize(metadata.width, metadata.height);
    
    // Update window title to show device name
    document.title = metadata.deviceName || this.model;
    
    // Hide loading
    this.showLoading(false);
  }

  private getCodecName(codecId: number): string {
    switch (codecId) {
      case SC_CODEC_ID_H264: return 'H.264';
      case SC_CODEC_ID_H265: return 'H.265';
      case SC_CODEC_ID_AV1: return 'AV1';
      default: return `Unknown (0x${codecId.toString(16)})`;
    }
  }

  private handleVideoData(data: Uint8Array): void {
    // Append to buffer
    const newBuffer = new Uint8Array(this.packetBuffer.length + data.length);
    newBuffer.set(this.packetBuffer);
    newBuffer.set(data, this.packetBuffer.length);
    this.packetBuffer = newBuffer;
    
    // Process packets from buffer
    this.processVideoPackets();
  }

  private processVideoPackets(): void {
    // scrcpy frame format (with send_frame_meta=true):
    // - PTS (8 bytes, big-endian, microseconds, or NO_PTS=0xFFFFFFFFFFFFFFFF for config)
    // - size (4 bytes, big-endian)
    // - data (size bytes)
    
    while (this.packetBuffer.length >= 12) {
      const view = new DataView(this.packetBuffer.buffer, this.packetBuffer.byteOffset, this.packetBuffer.byteLength);
      
      // Read PTS (8 bytes)
      const ptsHigh = view.getUint32(0, false);
      const ptsLow = view.getUint32(4, false);
      const isConfig = (ptsHigh === 0xFFFFFFFF && ptsLow === 0xFFFFFFFF);
      
      // Read size (4 bytes)
      const packetSize = view.getUint32(8, false);
      
      // Check if we have the full packet
      if (this.packetBuffer.length < 12 + packetSize) {
        // Wait for more data
        break;
      }
      
      // Extract packet data
      const packetData = this.packetBuffer.slice(12, 12 + packetSize);
      
      // Remove processed packet from buffer
      this.packetBuffer = this.packetBuffer.slice(12 + packetSize);
      
      // Log packet info
      const isKeyframe = this.isKeyframe(packetData);
      // console.log(`[DeviceApp] Video packet: size=${packetSize}, isConfig=${isConfig}, isKeyframe=${isKeyframe}`);
      
      // Feed data to JMuxer
      if (this.jmuxer) {
        this.jmuxer.feed(packetData);
      } else {
        console.warn('[DeviceApp] JMuxer not initialized!');
      }
    }
  }

  private isKeyframe(data: Uint8Array): boolean {
    // Check for H.264 IDR NAL unit (type 5)
    // NAL unit type is in the lower 5 bits of the first byte after start code
    for (let i = 0; i < data.length - 4; i++) {
      if (data[i] === 0 && data[i+1] === 0 && data[i+2] === 0 && data[i+3] === 1) {
        const nalType = data[i+4] & 0x1F;
        if (nalType === 5) return true; // IDR frame
      }
      if (data[i] === 0 && data[i+1] === 0 && data[i+2] === 1) {
        const nalType = data[i+3] & 0x1F;
        if (nalType === 5) return true; // IDR frame
      }
    }
    return false;
  }

  private setupEventListeners(): void {
    // Navigation buttons
    document.getElementById('btn-back')?.addEventListener('click', () => this.sendKeyEvent(4)); // KEYCODE_BACK
    document.getElementById('btn-home')?.addEventListener('click', () => this.sendKeyEvent(3)); // KEYCODE_HOME
    document.getElementById('btn-recents')?.addEventListener('click', () => this.sendKeyEvent(187)); // KEYCODE_APP_SWITCH
    
    // Sidebar additional buttons
    document.getElementById('btn-wireless-side')?.addEventListener('click', () => this.enableWireless());
    document.getElementById('btn-rotate-side')?.addEventListener('click', () => this.rotateScreen());
    document.getElementById('btn-power-side')?.addEventListener('click', () => this.toggleScreen());
    document.getElementById('btn-vol-up')?.addEventListener('click', () => this.volumeUp());
    document.getElementById('btn-vol-down')?.addEventListener('click', () => this.volumeDown());
    document.getElementById('btn-logcat-side')?.addEventListener('click', () => this.copyLogcat());
    
    // Close menus when clicking outside
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      // No action menu anymore, so this might be redundant but safe
    });
    
    // IPC events
    window.mirrorControl.onSendNavButton((button: number) => {
      this.sendNavButton(button);
    });

    // Keyboard
    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);

    // Resize on video dimension change (Rotation)
    this.videoElement.addEventListener('resize', () => {
        if (this.videoElement.videoWidth > 0 && this.videoElement.videoHeight > 0) {
            console.log(`[DeviceApp] Video resized: ${this.videoElement.videoWidth}x${this.videoElement.videoHeight}`);
            this.adjustWindowSize(this.videoElement.videoWidth, this.videoElement.videoHeight);
        }
    });
  }

  private setupJMuxer(): void {
    console.log('[DeviceApp] Setting up JMuxer decoder');
    this.jmuxer = new JMuxerDecoder(this.videoElement);
    console.log('[DeviceApp] JMuxer created');
  }

  private async connect(): Promise<void> {
    try {
      console.log(`[DeviceApp] Connecting to ${this.serial} on port ${this.port}...`);
      
      const success = await window.mirrorControl.connect(this.serial, this.port);
      
      if (!success) {
        console.error('[DeviceApp] Failed to connect');
        setTimeout(() => this.connect(), 2000);
      }
      
    } catch (error) {
      console.error('[DeviceApp] Connection failed:', error);
      this.showLoading(true);
      setTimeout(() => this.connect(), 2000);
    }
  }

  private sendData(data: Uint8Array): void {
    if (this.isConnected) {
      window.mirrorControl.send(this.serial, data);
    }
  }

  private sendKeyEvent(keycode: number): void {
    this.control?.sendKey(keycode);
  }

  private sendNavButton(button: number): void {
    const keycodes = [4, 3, 187]; // BACK, HOME, APP_SWITCH
    if (button >= 0 && button < keycodes.length) {
      this.sendKeyEvent(keycodes[button]);
    }
  }

  private async handleKeyDown(e: KeyboardEvent): Promise<void> {
    console.log(`[DeviceApp] KeyDown: code=${e.code} key=${e.key} connected=${this.isConnected} control=${!!this.control}`);
    
    if (!this.control || !this.isConnected) return;
    
    // Ignore input if filling forms or settings open
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return;
    if (!this.settingsPanel.hidden && this.settingsPanel.offsetParent !== null) return;
    
    // Game Mode Input
    if (this.keyMapper && this.keyMapper.isEnabled()) {
        if (this.keyMapper.handleKeyDown(e.code) || this.keyMapper.processTap(e.code, true)) {
            e.preventDefault();
            return;
        }
    }

    e.preventDefault();

    const code = e.code;

    // 1. Check special keys map
    if (KEY_MAP[code] !== undefined) {
      console.log(`[DeviceApp] Mapping special key: ${code} -> ${KEY_MAP[code]}`);
      const androidKey = KEY_MAP[code];
      let metaState = 0;
      if (e.shiftKey) metaState |= AMETA_SHIFT_ON;
      if (e.ctrlKey) metaState |= AMETA_CTRL_ON;
      if (e.altKey) metaState |= AMETA_ALT_ON;
      
      this.control.sendKey(androidKey, 0, 0, metaState); // 0=DOWN
      return;
    }

    // 2. Printable characters (A-Z, 0-9, symbols)
    // Avoid sending Control keys (like Ctrl+C) as text
    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        console.log(`[DeviceApp] Injecting text: "${e.key}"`);
        this.control.injectText(e.key);
        return;
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
     if (this.keyMapper && this.keyMapper.isEnabled()) {
         if (this.keyMapper.handleKeyUp(e.code) || this.keyMapper.processTap(e.code, false)) {
             e.preventDefault();
         }
     }
  }

  private applyQualityPreset(preset: keyof typeof QualityPresets): void {
    // Legacy method, maybe unused now but kept for compatibility
    this.currentQuality = { ...QualityPresets[preset] };
  }

  private resolveMaxSize(val: number): number {
    if (val === 0) return 0; // Original
    if (val > 1) return Math.floor(val); // Absolute
    
    // Percentage
    if (this.deviceInfo) {
        const maxDim = Math.max(this.deviceInfo.width, this.deviceInfo.height);
        // Round to nearest multiple of 8 for encoding safety?
        // Scrcpy handles alignment usually.
        return Math.floor(maxDim * val) & ~7; // Align to 8
    }
    return 0; // Fallback to original if unknown
  }

  private showLoading(show: boolean | string): void {
    if (typeof show === 'string') {
        const p = this.loadingOverlay.querySelector('p');
        if (p) p.textContent = show;
        this.loadingOverlay.style.display = 'flex';
    } else {
        this.loadingOverlay.style.display = show ? 'flex' : 'none';
        if (show) {
             const p = this.loadingOverlay.querySelector('p');
             if (p) p.textContent = 'Loading...';
        }
    }
  }

  private async volumeUp(): Promise<void> {
    try {
      await window.mirrorControl.shell(this.serial, 'input keyevent 24');
    } catch (e) {
      console.error('VolUp failed', e);
    }
  }

  private async volumeDown(): Promise<void> {
    try {
      await window.mirrorControl.shell(this.serial, 'input keyevent 25');
    } catch (e) {
      console.error('VolDown failed', e);
    }
  }

  // Device control actions
  private async enableWireless(): Promise<void> {
    try {
      await window.mirrorControl.shell(this.serial, 'setprop service.adb.tcp.port 5555');
      await window.mirrorControl.shell(this.serial, 'stop adbd && start adbd');
      const ip = await window.mirrorControl.shell(this.serial, "ip addr show wlan0 | grep 'inet ' | awk '{print $2}' | cut -d/ -f1");
      alert(`Wireless mode enabled!\nConnect to: ${ip.trim()}:5555`);
    } catch (error) {
      alert(`Failed to enable wireless mode: ${error}`);
    }
    
  }

  private async rotateScreen(): Promise<void> {
    this.control?.rotateDevice();
    
  }

  private async toggleScreen(): Promise<void> {
    try {
      await window.mirrorControl.shell(this.serial, 'input keyevent 26');
    } catch (error) {
      console.error('Failed to toggle screen:', error);
    }
    
  }

  private async copyLogcat(): Promise<void> {
    try {
      const logcat = await window.mirrorControl.copyLogcat(this.serial);
      await navigator.clipboard.writeText(logcat);
      alert('Logcat copied to clipboard!');
    } catch (error) {
      console.error('Failed to copy logcat:', error);
      alert(`Failed to copy logcat: ${error}`);
    }
    
  }

  private toggleGameMode(): void {
      if (this.keyMapper) {
          const enabled = !this.keyMapper.isEnabled();
          this.keyMapper.setEnabled(enabled);
          alert(`Game Mode: ${enabled ? 'ON (WASD=Move, Space=Jump, R=Reload)' : 'OFF'}`);
      }
      
  }

  private setupSettings(): void {
    const btnSettings = document.getElementById('btn-settings');
    const btnCancel = document.getElementById('btn-cancel-settings');
    const btnSave = document.getElementById('btn-save-settings');
    
    // Open modal
    btnSettings?.addEventListener('click', () => {
      this.updateSettingsUI();
      this.settingsModal.showModal();
    });
    
    // Close modal
    btnCancel?.addEventListener('click', () => {
      this.settingsModal.close();
    });
    
    // Save settings
    btnSave?.addEventListener('click', () => {
      this.saveSettings();
    });
    
    // Presets
    document.querySelectorAll('.btn-preset').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const presetName = (e.currentTarget as HTMLElement).dataset.preset;
        if (presetName && (QualityPresets as any)[presetName]) {
          const preset = (QualityPresets as any)[presetName];
          // Update inputs
          (document.getElementById('setting-bitrate') as HTMLSelectElement).value = preset.bitrate.toString();
          (document.getElementById('setting-max-size') as HTMLSelectElement).value = preset.maxSize.toString();
          
          const decoderEl = document.getElementById('setting-decoder') as HTMLSelectElement;
          if (decoderEl && preset.decoderName) decoderEl.value = preset.decoderName;
          
          const forceEl = document.getElementById('setting-force-baseline') as HTMLInputElement;
          if (forceEl) forceEl.checked = !!preset.forceBaseline;

          document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
          (e.currentTarget as HTMLElement).classList.add('active');
        }
      });
    });

    // Manual changes should release preset highlight
    const inputs = ['setting-bitrate', 'setting-max-size', 'setting-decoder', 'setting-force-baseline'];
    inputs.forEach(id => {
        document.getElementById(id)?.addEventListener('change', () => {
             document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
        });
    });
  }

  private setupSidebarControl(): void {
    const sidebar = document.getElementById('sidebar-controls');
    const btnToggle = document.getElementById('btn-toggle-sidebar');
    
    // Toggle Button
    btnToggle?.addEventListener('click', () => {
       if (sidebar) {
           const isHidden = sidebar.classList.contains('translate-x-full');
           
           if (isHidden) {
               sidebar.classList.remove('translate-x-full');
               sidebar.classList.add('translate-x-0');
               // Show "<<" to collapse
               btnToggle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevrons-left-icon lucide-chevrons-left"><path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/></svg>';
           } else {
               sidebar.classList.add('translate-x-full');
               sidebar.classList.remove('translate-x-0');
               // Show ">>" to expand
               btnToggle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevrons-right-icon lucide-chevrons-right"><path d="m6 17 5-5-5-5"/><path d="m13 17 5-5-5-5"/></svg>';
           }

           // Trigger resize to account for sidebar width
           if (this.videoElement.videoWidth > 0 && this.videoElement.videoHeight > 0) {
               this.adjustWindowSize(this.videoElement.videoWidth, this.videoElement.videoHeight);
           }
       }
    });

        // Initialize savedIme from storage only if not null
        const savedImeVal = localStorage.getItem('saved_keyboard_ime');
        if (savedImeVal) this.savedIme = savedImeVal;

        // Clipboard Synchronization
        // 1. Device -> Mac
        window.mirrorControl.onClipboard((text: string) => {
            console.log('[DeviceApp] Clipboard received from device');
            navigator.clipboard.writeText(text).catch(e => console.warn('Clipboard write failed', e));
        });

        // 2. Mac -> Device (Sync on Focus)
        window.addEventListener('focus', () => {
            navigator.clipboard.readText().then(text => {
                if (text && this.control) {
                    // Sync to device clipboard (without pasting)
                    this.control.setClipboard(text, false);
                    console.log('[DeviceApp] Clipboard synced to device');
                }
            }).catch(() => {
                // Ignore errors (user didn't grant permission or document not focused)
            });
        });

        // Keyboard Toggle - Permanently hide/show soft keyboard
    const iconKeyboardOn = document.getElementById('icon-keyboard-on');
    const iconKeyboardOff = document.getElementById('icon-keyboard-off');
    
    // Load saved state from storage if available (persists across reloads)
    let softKeyboardHidden = localStorage.getItem('soft_keyboard_hidden') === 'true';
    // savedIme is now a class property (this.savedIme)
    
    // Initialize icons based on saved state
    if (iconKeyboardOn && iconKeyboardOff) {
        iconKeyboardOn.style.display = softKeyboardHidden ? 'none' : 'block';
        iconKeyboardOff.style.display = softKeyboardHidden ? 'block' : 'none';
        console.log(`[DeviceApp] Restored keyboard state: ${softKeyboardHidden ? 'Disabled' : 'Enabled'} (IME: ${this.savedIme})`);
    }
    
    document.getElementById('btn-keyboard-toggle')?.addEventListener('click', async () => {
        try {
            softKeyboardHidden = !softKeyboardHidden;
            localStorage.setItem('soft_keyboard_hidden', String(softKeyboardHidden));
            
            if (softKeyboardHidden) {
                // HIDE: Get current IME and disable it
                // 1. Get current default IME
                let currentIme = await window.mirrorControl.shell(this.serial, 'settings get secure default_input_method');
                currentIme = currentIme ? currentIme.trim() : '';
                
                if (currentIme && currentIme.length > 0) {
                    this.savedIme = currentIme;
                    if (this.savedIme) {
                        localStorage.setItem('saved_keyboard_ime', this.savedIme);
                    }
                    
                    // 2. Disable it
                    console.log(`[DeviceApp] Disabling IME: ${this.savedIme}`);
                    await window.mirrorControl.shell(this.serial, `ime disable ${this.savedIme}`);
                } else {
                    console.warn('[DeviceApp] Could not detect current IME to disable');
                    // Fallback to purely visual toggle if we can't find IME
                }
            } else {
                // SHOW: Re-enable the saved IME or try availability heuristics
                if (!this.savedIme) {
                    // Start recovery mode: Find any valid keyboard
                    console.warn('[DeviceApp] No saved IME found. Attempting to recover a keyboard...');
                    const allImesRaw = await window.mirrorControl.shell(this.serial, 'ime list -a -s');
                    const allImes = allImesRaw.split(/\r?\n/).map((s: string) => s.trim()).filter((s: string) => s.length > 0);
                    
                    // Priority list of common keyboards
                    const keywords = ['google', 'gboard', 'samsung', 'xiaomi', 'miui', 'swiftkey', 'latin'];
                    
                    for (const keyword of keywords) {
                         const match = allImes.find((ime: string) => ime.toLowerCase().includes(keyword));
                         if (match) {
                             this.savedIme = match;
                             break;
                         }
                    }
                    
                    // Last resort: just pick the first one
                    if (!this.savedIme && allImes.length > 0) this.savedIme = allImes[0];
                }
                
                if (this.savedIme) {
                    console.log(`[DeviceApp] Enabling IME: ${this.savedIme}`);
                    // 1. Enable it
                    await window.mirrorControl.shell(this.serial, `ime enable ${this.savedIme}`);
                    // 2. Set as default
                    await window.mirrorControl.shell(this.serial, `ime set ${this.savedIme}`);
                    // 3. Just in case, try cmd (Android 11+)
                    try {
                        await window.mirrorControl.shell(this.serial, `cmd input_method set-method-enabled ${this.savedIme} true`);
                    } catch (ignore) {}
                    
                    // Clear saved state
                    localStorage.removeItem('saved_keyboard_ime');
                    this.savedIme = null; 
                } else {
                    console.error('[DeviceApp] Failed to find any IME to enable!');
                }
            }
            
            // Update icons
            if (iconKeyboardOn && iconKeyboardOff) {
                iconKeyboardOn.style.display = softKeyboardHidden ? 'none' : 'block';
                iconKeyboardOff.style.display = softKeyboardHidden ? 'block' : 'none';
            }
            
            console.log(`[DeviceApp] Soft keyboard permanently ${softKeyboardHidden ? 'disabled' : 'enabled'}`);
        } catch (e) {
            console.error('Keyboard toggle failed', e);
            // Revert state on error
            softKeyboardHidden = !softKeyboardHidden;
        }
    });

    // Volume Up (KEYCODE_VOLUME_UP = 24)
    // Clear saved state
    localStorage.removeItem('saved_keyboard_ime');
    this.savedIme = null;
  }

  private updateSettingsUI(): void {
    const bitrateSelect = document.getElementById('setting-bitrate') as HTMLSelectElement;
    bitrateSelect.value = this.currentQuality.bitrate.toString();
    
    const sizeSelect = document.getElementById('setting-max-size') as HTMLSelectElement;
    sizeSelect.value = this.currentQuality.maxSize.toString();
    
    const decoderSelect = document.getElementById('setting-decoder') as HTMLSelectElement;
    if (decoderSelect && this.currentQuality.decoderName) {
        decoderSelect.value = this.currentQuality.decoderName;
    }
    
    const forceBaseline = document.getElementById('setting-force-baseline') as HTMLInputElement;
    if (forceBaseline) forceBaseline.checked = !!this.currentQuality.forceBaseline;

    // Highlight matching preset
    const matchedPreset = getPresetName(this.currentQuality);
    document.querySelectorAll('.btn-preset').forEach(btn => {
        const el = btn as HTMLElement;
        if (matchedPreset && el.dataset.preset === matchedPreset) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });
  }

  private async saveSettings(): Promise<void> {
    const bitrate = parseInt((document.getElementById('setting-bitrate') as HTMLSelectElement).value);
    const maxSizeStr = (document.getElementById('setting-max-size') as HTMLSelectElement).value;
    const maxSize = parseFloat(maxSizeStr); // Float for percentage
    const decoderName = (document.getElementById('setting-decoder') as HTMLSelectElement).value;
    const forceBaselineEl = document.getElementById('setting-force-baseline') as HTMLInputElement;
    const forceBaseline = forceBaselineEl ? forceBaselineEl.checked : false;
    
    const newQuality: QualitySettings = {
      bitrate,
      maxSize,
      maxFps: this.currentQuality.maxFps,
      forceBaseline,
      decoderName
    };
    
    this.currentQuality = newQuality;
    this.settingsModal.close();
    
    await this.restartStream(newQuality);
  }

  private async restartStream(quality: QualitySettings): Promise<void> {
    if (this.isRestarting) return;
    this.isRestarting = true;
    this.hasReceivedVideo = false; // Reset flag
    
    this.showLoading('Optimizing stream configuration...');
    
    try {
      // 1. Stop current
      await window.mirrorControl.stopMirror(this.serial, { keepWindowOpen: true });
      
      // Clean up OLD listeners to prevent duplicate data feed
      this.cleanupFunctions.forEach(fn => fn());
      this.cleanupFunctions = [];
      
      // Cleanup JMuxer to prevent stale state
      if (this.jmuxer) {
        this.jmuxer.destroy();
        this.jmuxer = null; 
      }
      
      // Cleanup InputHandler
      if (this.inputHandler) {
        this.inputHandler.destroy();
        this.inputHandler = null;
      }
      this.control = null;

      this.packetBuffer = new Uint8Array(0);
      
      // Calculate real keys
      const realMaxSize = this.resolveMaxSize(quality.maxSize);
      
      // 2. Start new
      const { port } = await window.mirrorControl.startMirror(this.serial, {
        bitrate: quality.bitrate,
        maxSize: realMaxSize,
        maxFps: quality.maxFps,
        forceBaseline: quality.forceBaseline,
        openWindow: false
      });
      
      this.port = port;
      
      // 3. Setup listeners
      this.setupDataListeners();
      
      // Re-init JMuxer
      if (quality.decoderName !== 'jmuxer') {
          console.warn('Selected decoder not implemented, falling back to JMuxer');
      }
      this.setupJMuxer();
      
      // 4. Reconnect
      await new Promise(r => setTimeout(r, 500));
      await this.connect();
      
      // Force Landscape Rotation (User Request)
      try {
          // Reset services: Force rotation to landscape
          await window.mirrorControl.shell(this.serial, 'settings put system user_rotation 1');
          console.log('[DeviceApp] Services reset: Rotation forced to Landscape');
      } catch (e) {
          console.warn('[DeviceApp] Failed to set rotation:', e);
      }

      // 5. Watchdog for blank screen / freeze
      setTimeout(() => {
        if (!this.hasReceivedVideo && this.isConnected) {
            console.error('Video stream stale/blank after restart. Reverting to Safe Mode.');
            this.showLoading('Stream unstable. Reverting to Safe Mode...');
            setTimeout(() => {
                this.isRestarting = false; // Allow restart
                this.revertToSafeMode();
            }, 1000);
        }
      }, 5000); // 5 seconds timeout
      
    } catch (err) {
      console.error('Failed to restart:', err);
      this.showLoading(`Error: ${err}`);
      this.isRestarting = false;
    } finally {
      // Don't disable isRestarting immediately if we are waiting for watchdog?
      // But we need to allow interactions? No, "Restarting..." overlay blocks.
      // If we succeed, we hide overlay in onConnected/onData?
      // Wait, showLoading is manual.
      // onConnected doesn't hide loading. onData doesn't hide loading.
      // Where is loading hidden?
      // It WAS hidden in `onConnected` in typical flow?
      // Let's check `setupDataListeners`.
      // `unsubConnected` -> `this.isConnected = true;`. It does NOT call `this.showLoading(false)`.
      // `handleMetadata`?
      
      // I should hide loading when connected or first frame received.
      setTimeout(() => {
        if (!this.isRestarting) return; // Already finished?
        // If we are here, we finished synchronous setup.
        // We are waiting for data.
        // We should probably rely on `hasReceivedVideo` to hide loading?
        this.isRestarting = false; // Allow further restarts
        this.showLoading(false); // Hide loading after 1s?
        // If blank, watchdog triggers and shows loading again.
      }, 1500);
    }
  }

  private async revertToSafeMode(): Promise<void> {
    const safeQuality: QualitySettings = {
        ...QualityPresets.low,
        bitrate: 1_000_000, // 1 Mbps (Super safe)
        maxSize: 0.25,      // 25% scale
        forceBaseline: true, // Baseline for compatibility
        decoderName: 'jmuxer'
    };
    console.log('Applying Safe Mode:', safeQuality);
    this.currentQuality = safeQuality;
    this.updateSettingsUI(); // Update UI to reflect Safe Mode
    await this.restartStream(safeQuality);
  }


  private adjustWindowSize(videoWidth: number, videoHeight: number): void {
      // Debounce slightly or just check if changed significantly
      const header = document.querySelector('header');
      const nav = document.querySelector('nav');
      const sidebar = document.getElementById('sidebar-controls');
      const videoContainer = document.getElementById('video-container');
      
      // Default to 88 if elements not found/rendered yet
      const chromeHeight = (header?.clientHeight || 44) + (nav?.clientHeight || 48); // 44px header, 48px nav
      
      // Determine chrome width (sidebar)
      let chromeWidth = 0;
      if (sidebar && !sidebar.classList.contains('translate-x-full')) {
          chromeWidth = sidebar.offsetWidth || 48; // Sidebar usually 48px
          videoContainer?.classList.add('pr-12'); // Add padding for absolute sidebar
      } else {
          videoContainer?.classList.remove('pr-12');
      }
      
      console.log(`[DeviceApp] Adjusting window for ${videoWidth}x${videoHeight} + ${chromeWidth}x${chromeHeight} chrome`);
      window.mirrorControl.resizeWindow(videoWidth, videoHeight, chromeHeight, chromeWidth);
  }

  private startResolutionWatcher(): void {
      // Combined Watchdog: Resolution + Latency
      setInterval(() => {
          if (!this.videoElement) return;
          
          // 1. Resolution Check
          const w = this.videoElement.videoWidth;
          const h = this.videoElement.videoHeight;
          
          if (w > 0 && h > 0) {
              if (w !== this.lastVideoWidth || h !== this.lastVideoHeight) {
                  console.log(`[DeviceApp] Resolution changed detected (polling): ${w}x${h}`);
                  this.lastVideoWidth = w;
                  this.lastVideoHeight = h;
                  this.adjustWindowSize(w, h);
              }
          }
          
          // 2. Latency Check (Jump to Live)
          // If playback falls behind by > 300ms, jump to end
          if (!this.videoElement.paused && this.videoElement.buffered.length > 0) {
              const end = this.videoElement.buffered.end(this.videoElement.buffered.length - 1);
              const current = this.videoElement.currentTime;
              const latency = end - current;
              
              if (latency > 0.3) {
                   // console.log(`[DeviceApp] Latency high (${latency.toFixed(3)}s). Jumping to live.`);
                   this.videoElement.currentTime = end - 0.01;
              }
          }
          
      }, 500); // Check every 500ms
  }

}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  new DeviceApp();
});

export {};
