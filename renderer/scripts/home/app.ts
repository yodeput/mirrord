/**
 * Home Page Application
 */

import { DeviceInfo } from '../../../main/adb/AdbManager';

declare global {
  interface Window {
    mirrorControl: any;
  }
}

class HomeApp {
  private deviceList: HTMLElement;
  private noDevicesEl: HTMLElement;
  private loadingDevicesEl: HTMLElement;
  private devices: Map<string, DeviceInfo> = new Map();
  private activeMirrors: Set<string> = new Set();
  private isFirstLoad = true;

  constructor() {
    this.deviceList = document.getElementById('device-list')!;
    this.noDevicesEl = document.getElementById('no-devices')!;
    this.loadingDevicesEl = document.getElementById('loading-devices')!;
    
    this.init();
  }

  private async init(): Promise<void> {
    console.log('[.mirrord] HomeApp initialized');
    console.log('[HomeApp] mirrorControl API keys:', Object.keys(window.mirrorControl || {}));
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Listen for device changes (REACTIVE)
    window.mirrorControl.onDeviceConnected((device: DeviceInfo) => {
      console.log('[HomeApp] Device connected event:', device);
      this.handleDeviceUpdate(device);
    });
    
    window.mirrorControl.onDeviceDisconnected((serial: string) => {
      console.log('[HomeApp] Device disconnected event:', serial);
      this.devices.delete(serial);
      this.renderDeviceList();
      this.updateNoDevicesVisibility();
    });
    
    // Listen for mirror state changes
    window.mirrorControl.onMirrorStarted((serial: string) => {
      this.activeMirrors.add(serial);
      this.updateDeviceCardUI(serial);
    });
    
    window.mirrorControl.onMirrorStopped((serial: string) => {
      this.activeMirrors.delete(serial);
      this.updateDeviceCardUI(serial);
    });

    // Initial load
    await this.refreshDevices();

    // Check ADB Status
    const isAdbValid = await window.mirrorControl.checkAdbStatus();
    if (!isAdbValid) {
        console.warn('[HomeApp] ADB not detected, showing settings');
        this.openSettingsModal();
    }
  }

  private setupEventListeners(): void {
    // Restart ADB button
    document.getElementById('btn-restart-adb')?.addEventListener('click', async () => {
      try {
        // Clear UI and show searching state
        this.isFirstLoad = true;
        this.devices.clear();
        this.deviceList.innerHTML = '';
        this.loadingDevicesEl.classList.remove('hidden');
        this.noDevicesEl.classList.add('hidden');
        
        await window.mirrorControl.restartAdb();
        // Reload devices after restart
        setTimeout(() => this.refreshDevices(), 2000);
      } catch (error) {
        console.error('Failed to restart ADB:', error);
        this.updateNoDevicesVisibility();
      }
    });

    // Modals
    this.setupAddDeviceModal();
    this.setupSettingsModal();

    // Settings toggles
    this.setupSettingsToggle('setting-show-serial', 'showSerial', true);
    this.setupSettingsToggle('setting-auto-connect', 'autoConnect', false);
  }

  private setupSettingsToggle(id: string, key: string, defaultValue: boolean): void {
    const checkbox = document.getElementById(id) as HTMLInputElement;
    if (!checkbox) return;

    // Load saved value
    window.mirrorControl.getSetting(key).then((value: any) => {
      checkbox.checked = value ?? defaultValue;
    });

    // Save on change
    checkbox.addEventListener('change', () => {
      window.mirrorControl.setSetting(key, checkbox.checked).then(async () => {
          if (key === 'showSerial') {
              await this.renderDeviceList();
          }
      });
    });
  }

  private async refreshDevices(): Promise<void> {
    try {
      const devices = await window.mirrorControl.getDevices();
      console.log(`[HomeApp] Found ${devices.length} devices from main process`);
      
      this.devices.clear();
      for (const device of devices) {
        this.devices.set(device.serial, device);
      }
      
      await this.renderDeviceList();
    } catch (error) {
      console.error('[HomeApp] Failed to refresh devices:', error);
    } finally {
      if (this.isFirstLoad) {
        this.isFirstLoad = false;
        console.log('[HomeApp] First load sequence complete');
      }
      this.updateNoDevicesVisibility();
    }
    
    // Poll every 2s for fallback
    setTimeout(() => this.refreshDevices(), 2000);
  }

  private setupAddDeviceModal(): void {
    const btnAdd = document.getElementById('btn-add-device');
    const modal = document.getElementById('modal-connect');
    const btnCancel = document.getElementById('btn-cancel-connect');
    const btnConfirm = document.getElementById('btn-confirm-connect');
    const inputIp = document.getElementById('input-ip') as HTMLInputElement;
    const inputPort = document.getElementById('input-port') as HTMLInputElement;

    if (btnAdd && modal) {
        btnAdd.addEventListener('click', () => {
             modal.classList.remove('opacity-0', 'pointer-events-none');
             const content = modal.querySelector('div');
             content?.classList.remove('scale-95', 'translate-y-4');
             if (inputIp) inputIp.focus();
        });
    }
    
    if (btnCancel && modal) {
        btnCancel.addEventListener('click', () => {
             modal.classList.add('opacity-0', 'pointer-events-none');
             const content = modal.querySelector('div');
             content?.classList.add('scale-95', 'translate-y-4');
        });
    }
    
    if (btnConfirm && inputIp && modal) {
        btnConfirm.addEventListener('click', async () => {
           const ip = inputIp.value.trim();
           const port = parseInt(inputPort?.value || '5555');
           
           if (!ip) {
              alert('Please enter an IP address');
              return;
           }
           
            const originalText = btnConfirm.textContent || 'Connect';
            if (btnConfirm instanceof HTMLButtonElement) {
                btnConfirm.disabled = true;
                btnConfirm.textContent = 'Connecting...';
            }
           
           try {
              await window.mirrorControl.connectWireless(ip, port);
              modal.classList.add('opacity-0', 'pointer-events-none');
              const content = modal.querySelector('div');
              content?.classList.add('scale-95', 'translate-y-4');
              inputIp.value = ''; // clear
              
              // Immediate refresh
              this.refreshDevices();
           } catch (err) {
              alert('Failed to connect: ' + err);
              console.error(err);
           } finally {
              if (btnConfirm instanceof HTMLButtonElement) {
                  btnConfirm.disabled = false;
                  btnConfirm.textContent = originalText;
              }
           }
        });
    }

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('opacity-0', 'pointer-events-none');
                const content = modal.querySelector('div');
                content?.classList.add('scale-95', 'translate-y-4');
            }
        });
    }
  }

  private setupSettingsModal(): void {
    const btnSettings = document.getElementById('btn-settings');
    const modal = document.getElementById('modal-settings');
    const btnClose = document.getElementById('btn-close-settings');
    const btnSave = document.getElementById('btn-save-settings');
    const inputPath = document.getElementById('input-adb-path') as HTMLInputElement;

    if (btnSettings && modal) {
      btnSettings.addEventListener('click', () => {
        this.openSettingsModal();
      });
    }

    if (btnClose && modal) {
      btnClose.addEventListener('click', () => {
        this.closeSettingsModal();
      });
    }

    if (btnSave && inputPath) {
      btnSave.addEventListener('click', async () => {
        const path = inputPath.value.trim();
        
        // Disable button during validation
        const btn = btnSave as HTMLButtonElement;
        const originalText = btn.innerText;
        btn.innerText = 'Verifying...';
        btn.disabled = true;

        try {
          const isValid = await window.mirrorControl.checkAdbStatus(path);
          if (isValid) {
            const success = await window.mirrorControl.setAdbPath(path);
            if (success) {
              this.updateAdbStatusIndicator(true, 'ADB Detected & Saved');
              setTimeout(() => this.closeSettingsModal(), 1000);
              this.refreshDevices();
            } else {
              this.updateAdbStatusIndicator(false, 'Failed to save settings');
            }
          } else {
            this.updateAdbStatusIndicator(false, 'Invalid ADB Path. Not detected.');
            // Shake effect for feedback
            modal?.querySelector('.modal-content')?.classList.add('animate-shake');
            setTimeout(() => modal?.querySelector('.modal-content')?.classList.remove('animate-shake'), 500);
          }
        } finally {
          btn.innerText = originalText;
          btn.disabled = false;
        }
      });
    }

    // Live status check on input
    if (inputPath) {
      inputPath.addEventListener('input', async () => {
        const path = inputPath.value.trim();
        if (!path) {
          this.updateAdbStatusIndicator(null, 'Checking... (Auto Mode)');
          return;
        }
        
        const isValid = await window.mirrorControl.checkAdbStatus(path);
        if (isValid) {
          this.updateAdbStatusIndicator(true, 'Valid ADB Path');
        } else {
          this.updateAdbStatusIndicator(false, 'Invalid Path');
        }
      });
    }

    // Close on overlay click
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.closeSettingsModal();
      }
    });
  }

  private async openSettingsModal(): Promise<void> {
    const modal = document.getElementById('modal-settings');
    const inputPath = document.getElementById('input-adb-path') as HTMLInputElement;
    
    if (modal && inputPath) {
      // Load current path
      const currentPath = await window.mirrorControl.getAdbPath();
      // Only show value if it's NOT the default 'adb' - otherwise keep it empty for placeholder hint
      inputPath.value = (currentPath === 'adb' || !currentPath) ? '' : currentPath;
      
      // Initial status check
      const isValid = await window.mirrorControl.checkAdbStatus();
      this.updateAdbStatusIndicator(isValid, isValid ? 'ADB Detected' : 'ADB Not Found');
      
      modal.classList.add('open');
      inputPath.focus();
    }
  }

  private closeSettingsModal(): void {
    document.getElementById('modal-settings')?.classList.remove('open');
  }

  private updateAdbStatusIndicator(valid: boolean | null, message: string): void {
    const dot = document.getElementById('adb-status-dot');
    const text = document.getElementById('adb-status-text');
    
    if (dot && text) {
      dot.className = 'w-2 h-2 rounded-full transition-colors';
      if (valid === true) {
        dot.classList.add('bg-green-500', 'shadow-[0_0_8px_rgba(34,197,94,0.5)]');
        text.className = 'text-green-600 font-medium';
      } else if (valid === false) {
        dot.classList.add('bg-red-500', 'shadow-[0_0_8px_rgba(239,68,68,0.5)]');
        text.className = 'text-red-600 font-medium';
      } else {
        dot.classList.add('bg-gray-300');
        text.className = 'text-gray-500';
      }
      text.innerText = message;
    }
  }

  private async handleDeviceUpdate(device: DeviceInfo): Promise<void> {
    console.log(`[HomeApp] Reactive update for ${device.serial}`);
    
    const isNew = !this.devices.has(device.serial);
    this.devices.set(device.serial, device);
    await this.renderDeviceList();
    this.updateNoDevicesVisibility();

    // Auto-connect wireless logic
    if (isNew && device.state === 'device' && !device.serial.includes(':')) {
        const autoConnect = await window.mirrorControl.getSetting('autoConnect');
        if (autoConnect) {
            console.log(`[HomeApp] Auto-connecting ${device.serial} to wireless...`);
            try {
                const ip = await window.mirrorControl.getDeviceIp(device.serial);
                if (ip) {
                    await window.mirrorControl.enableWireless(device.serial);
                    await window.mirrorControl.connectWireless(ip);
                }
            } catch (err) {
                console.error('[HomeApp] Auto-connect failed', err);
            }
        }
    }
  }

  private async renderDeviceList(): Promise<void> {
    this.deviceList.innerHTML = '';
    
    if (this.devices.size === 0) return;

    const showSerialRaw = await window.mirrorControl.getSetting('showSerial');
    const showSerial = showSerialRaw ?? true;

    for (const device of this.devices.values()) {
        const card = this.createDeviceCard(device);
        
        // Handle show serial visibility
        const serialEl = card.querySelector('.device-serial') as HTMLElement;
        if (serialEl) {
            serialEl.style.display = showSerial ? 'block' : 'none';
        }

        this.deviceList.appendChild(card);
    }
  }

  private createDeviceCard(device: DeviceInfo): HTMLElement {
    const card = document.createElement('div');
    // device-card class replacement
    card.className = 'grid grid-cols-[auto_1fr_auto] items-center gap-4 p-5 bg-white rounded-xl shadow-sm border border-gray-200 cursor-pointer transition-all hover:shadow-md hover:border-blue-300 hover:-translate-y-0.5';
    card.id = `device-${device.serial}`;
    
    // Check if wireless (serial is IP:PORT)
    const isWireless = device.serial.includes(':');
    
    card.innerHTML = `
      <div class="w-12 h-12 flex items-center justify-center bg-blue-50 text-blue-600 rounded-xl">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" class="injected-svg" data-src="https://cdn.hugeicons.com/icons/smart-phone-01-duotone-rounded.svg?v=1.0.1" xmlns:xlink="http://www.w3.org/1999/xlink" role="img" color="#000000">
<path opacity="0.4" d="M13.5 2H10.5C8.14298 2 6.96447 2 6.23223 2.73223C5.5 3.46447 5.5 4.64298 5.5 7V17C5.5 19.357 5.5 20.5355 6.23223 21.2678C6.96447 22 8.14298 22 10.5 22H13.5C15.857 22 17.0355 22 17.7678 21.2678C18.5 20.5355 18.5 19.357 18.5 17V7C18.5 4.64298 18.5 3.46447 17.7678 2.73223C17.0355 2 15.857 2 13.5 2Z" fill="#000000"></path>
<path d="M12 19H12.01" stroke="#000000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
<path d="M13.5 2H10.5C8.14298 2 6.96447 2 6.23223 2.73223C5.5 3.46447 5.5 4.64298 5.5 7V17C5.5 19.357 5.5 20.5355 6.23223 21.2678C6.96447 22 8.14298 22 10.5 22H13.5C15.857 22 17.0355 22 17.7678 21.2678C18.5 20.5355 18.5 19.357 18.5 17V7C18.5 4.64298 18.5 3.46447 17.7678 2.73223C17.0355 2 15.857 2 13.5 2Z" stroke="#000000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
</svg>
      </div>
      <div class="flex flex-col gap-1">
        <div class="text-base font-semibold text-gray-900 device-model">${device.model || 'Android Device'}</div>
        <div class="text-xs font-mono text-gray-400 device-serial">${device.serial}</div>
      </div>
      <div class="flex gap-2">
        ${!isWireless ? `
        <button class="wifi-btn w-10 h-10 flex items-center justify-center bg-gray-100 rounded-lg text-gray-500 hover:bg-blue-100 hover:text-blue-600 transition-colors" title="Switch to Wireless">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/>
          </svg>
        </button>
        ` : `
        <button class="disconnect-btn w-10 h-10 flex items-center justify-center bg-red-50 rounded-lg text-red-500 hover:bg-red-100 transition-colors" title="Disconnect Wireless">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
             <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z" transform="rotate(45, 12, 12)"/>
          </svg>
        </button>
        `}
        <button class="play-btn w-10 h-10 flex items-center justify-center bg-blue-600 rounded-lg text-white hover:bg-blue-700 hover:scale-105 shadow-sm transition-all" title="${this.activeMirrors.has(device.serial) ? 'Stop Mirroring' : 'Start Mirroring'}" data-action="play">
          ${this.activeMirrors.has(device.serial) ? `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2"/>
          </svg>
          ` : `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
          `}
        </button>
      </div>
    `;
    
    // Wireless Toggle Logic
    const wifiBtn = card.querySelector('.wifi-btn') as HTMLButtonElement;
    if (wifiBtn) {
      wifiBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        
        // Confirmation dialog
        if (!confirm('Are you want to connect with Wireless Connection?')) {
          return;
        }

        wifiBtn.disabled = true;
        try {
           const ip = await window.mirrorControl.getDeviceIp(device.serial);
           if (!ip) throw new Error('Could not get device IP. Make sure device is connected to same Wi-Fi.');
           
           await window.mirrorControl.enableWireless(device.serial);
           await window.mirrorControl.connectWireless(ip);
        } catch (err) {
           console.error('Wireless switch failed', err);
           alert('Failed to switch to wireless: ' + err);
        } finally {
           wifiBtn.disabled = false;
        }
      });
    }

    // Disconnect Logic
    const disconnectBtn = card.querySelector('.disconnect-btn') as HTMLButtonElement;
    if (disconnectBtn) {
      disconnectBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('Disconnect wireless connection?')) {
          await window.mirrorControl.disconnectWireless(device.serial);
        }
      });
    }

    // Play button click
    const playBtn = card.querySelector('[data-action="play"]');
    playBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.activeMirrors.has(device.serial)) {
        this.stopMirroring(device);
      } else {
        this.startMirroring(device);
      }
    });
    
    // Card click
    card.addEventListener('click', (e) => {
      // Don't trigger if clicking buttons
      if ((e.target as HTMLElement).closest('button')) return;
      this.startMirroring(device);
    });
    
    return card;
  }

  private async startMirroring(device: DeviceInfo): Promise<void> {
    try {
      console.log(`Starting mirroring for ${device.serial}`);
      
      const showSerialValue = await window.mirrorControl.getSetting('showSerial');
      const showSerial = showSerialValue ?? true;
      
      await window.mirrorControl.startMirror(device.serial, {
        bitrate: 8_000_000,
        maxFps: 60,
        // Pass other relevant settings if the backend API supports them
      });
      
      // Store showSerial setting for device window to use
      localStorage.setItem('show_device_serial', showSerial ? 'true' : 'false');
      
    } catch (error) {
      console.error('Failed to start mirroring:', error);
      alert(`Failed to start mirroring: ${error}`);
    }
  }

  private async connectNetworkDevice(ip: string): Promise<void> {
    try {
      const port = 5555;
      await window.mirrorControl.shell('', `connect ${ip}:${port}`);
      // Reload devices
      setTimeout(() => this.refreshDevices(), 1000);
    } catch (error) {
      console.error('Failed to connect:', error);
      alert(`Failed to connect to ${ip}`);
    }
  }

  private updateNoDevicesVisibility(): void {
    const hasDevices = this.devices.size > 0;
    console.log(`[HomeApp] Updating visibility. devices=${this.devices.size}, isFirstLoad=${this.isFirstLoad}`);
    
    // Spinner logic: hide if we have devices OR first load is finished
    if (hasDevices || !this.isFirstLoad) {
      this.loadingDevicesEl.classList.add('hidden');
    } else {
      this.loadingDevicesEl.classList.remove('hidden');
    }
    
    // Empty state logic: show ONLY if first load is finished AND no devices
    if (!this.isFirstLoad && !hasDevices) {
      this.noDevicesEl.classList.remove('hidden');
    } else {
      this.noDevicesEl.classList.add('hidden');
    }
  }

  private updateDeviceCardUI(serial: string): void {
    const device = this.devices.get(serial);
    const card = document.getElementById(`device-${serial}`);
    if (!card || !device) return;
    
    // Update Model Name
    const modelEl = card.querySelector('.device-model');
    if (modelEl) modelEl.textContent = device.model || 'Android Device';
    
    // Update State / Opacity
    const isOffline = device.state !== 'device';
    card.style.opacity = isOffline ? '0.5' : '1';
    card.style.pointerEvents = isOffline ? 'none' : 'auto';

    // Update Play Button
    const playBtn = card.querySelector('[data-action="play"]');
    if (playBtn) {
      const isRunning = this.activeMirrors.has(serial);
      playBtn.setAttribute('title', isRunning ? 'Stop Mirroring' : 'Start Mirroring');
      playBtn.innerHTML = isRunning ? `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2"/>
          </svg>
      ` : `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
      `;
      (playBtn as HTMLButtonElement).disabled = isOffline;
    }
  }

  private async stopMirroring(device: DeviceInfo): Promise<void> {
    try {
        await window.mirrorControl.stopMirror(device.serial);
    } catch (e) {
        console.error('Failed to stop mirror', e);
    }
  }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  new HomeApp();
});
