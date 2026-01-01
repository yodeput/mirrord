"use strict";
(() => {
  // renderer/scripts/device/JMuxerDecoder.ts
  var JMuxerDecoder = class {
    jmuxer = null;
    video;
    isInitialized = false;
    pendingFrames = [];
    constructor(videoElement) {
      this.video = videoElement;
      this.init();
    }
    init() {
      console.log("[JMuxerDecoder] Initializing...");
      if (typeof JMuxer === "undefined") {
        console.log("[JMuxerDecoder] Loading JMuxer script...");
        const script = document.createElement("script");
        script.src = "lib/jmuxer.min.js";
        script.onload = () => this.createJMuxer();
        script.onerror = (e) => console.error("[JMuxerDecoder] Failed to load JMuxer:", e);
        document.head.appendChild(script);
      } else {
        this.createJMuxer();
      }
    }
    createJMuxer() {
      try {
        this.jmuxer = new JMuxer({
          node: this.video,
          mode: "video",
          flushingTime: 0,
          // Immediate flushing for low latency
          fps: 60,
          debug: false,
          onReady: () => {
            console.log("[JMuxerDecoder] Ready");
          },
          onError: (error) => {
            console.error("[JMuxerDecoder] Error:", error);
          }
        });
        this.isInitialized = true;
        console.log("[JMuxerDecoder] JMuxer created successfully");
        this.processPendingFrames();
      } catch (error) {
        console.error("[JMuxerDecoder] Failed to create JMuxer:", error);
      }
    }
    processPendingFrames() {
      console.log(`[JMuxerDecoder] Processing ${this.pendingFrames.length} pending frames`);
      for (const frame of this.pendingFrames) {
        this.feedData(frame);
      }
      this.pendingFrames = [];
    }
    /**
     * Feed H.264 NAL data to the decoder
     */
    feed(nalData) {
      if (!this.isInitialized) {
        this.pendingFrames.push(nalData);
        return;
      }
      this.feedData(nalData);
    }
    feedData(nalData) {
      if (!this.jmuxer) return;
      try {
        this.jmuxer.feed({
          video: nalData
        });
      } catch (error) {
        console.error("[JMuxerDecoder] Feed error:", error);
      }
    }
    /**
     * Destroy the decoder
     */
    destroy() {
      if (this.jmuxer) {
        this.jmuxer.destroy();
        this.jmuxer = null;
      }
      this.isInitialized = false;
    }
  };

  // renderer/scripts/device/InputHandler.ts
  var InputHandler = class {
    element;
    deviceWidth;
    deviceHeight;
    onTouch;
    // State
    isPointerDown = false;
    lastMoveTime = 0;
    moveThrottleMs = 8;
    // ~120Hz
    // Bound event handlers
    boundMouseDown;
    boundMouseUp;
    boundMouseMove;
    boundMouseLeave;
    boundWheel;
    boundTouchStart;
    boundTouchEnd;
    boundTouchMove;
    boundContextMenu;
    constructor(element, deviceWidth, deviceHeight, onTouch) {
      this.element = element;
      this.deviceWidth = deviceWidth;
      this.deviceHeight = deviceHeight;
      this.onTouch = onTouch;
      this.boundMouseDown = this.handleMouseDown.bind(this);
      this.boundMouseUp = this.handleMouseUp.bind(this);
      this.boundMouseMove = this.handleMouseMove.bind(this);
      this.boundMouseLeave = this.handleMouseLeave.bind(this);
      this.boundWheel = this.handleWheel.bind(this);
      this.boundTouchStart = this.handleTouchStart.bind(this);
      this.boundTouchEnd = this.handleTouchEnd.bind(this);
      this.boundTouchMove = this.handleTouchMove.bind(this);
      this.boundContextMenu = (e) => e.preventDefault();
      this.attachEventListeners();
    }
    /**
     * Attach mouse and keyboard event listeners
     */
    attachEventListeners() {
      this.element.addEventListener("mousedown", this.boundMouseDown);
      this.element.addEventListener("mouseup", this.boundMouseUp);
      this.element.addEventListener("mousemove", this.boundMouseMove);
      this.element.addEventListener("mouseleave", this.boundMouseLeave);
      this.element.addEventListener("wheel", this.boundWheel, { passive: false });
      this.element.addEventListener("contextmenu", this.boundContextMenu);
      this.element.addEventListener("touchstart", this.boundTouchStart, { passive: false });
      this.element.addEventListener("touchend", this.boundTouchEnd);
      this.element.addEventListener("touchmove", this.boundTouchMove, { passive: false });
    }
    /**
     * Convert element coordinates to device coordinates
     */
    canvasToDevice(clientX, clientY) {
      const rect = this.element.getBoundingClientRect();
      const relX = (clientX - rect.left) / rect.width;
      const relY = (clientY - rect.top) / rect.height;
      return {
        x: Math.round(relX * this.deviceWidth),
        y: Math.round(relY * this.deviceHeight)
      };
    }
    // Mouse handlers
    handleMouseDown(e) {
      if (e.button !== 0) return;
      this.isPointerDown = true;
      const { x, y } = this.canvasToDevice(e.clientX, e.clientY);
      this.onTouch({ action: 0, x, y });
    }
    handleMouseUp(e) {
      if (e.button !== 0) return;
      this.isPointerDown = false;
      const { x, y } = this.canvasToDevice(e.clientX, e.clientY);
      this.onTouch({ action: 1, x, y });
    }
    handleMouseMove(e) {
      if (!this.isPointerDown) return;
      const now = performance.now();
      if (now - this.lastMoveTime < this.moveThrottleMs) {
        return;
      }
      this.lastMoveTime = now;
      const { x, y } = this.canvasToDevice(e.clientX, e.clientY);
      this.onTouch({ action: 2, x, y });
    }
    handleMouseLeave(e) {
      if (this.isPointerDown) {
        this.isPointerDown = false;
        const { x, y } = this.canvasToDevice(e.clientX, e.clientY);
        this.onTouch({ action: 1, x, y });
      }
    }
    handleWheel(e) {
      e.preventDefault();
    }
    // Touch handlers
    handleTouchStart(e) {
      e.preventDefault();
      const touch = e.touches[0];
      if (!touch) return;
      this.isPointerDown = true;
      const { x, y } = this.canvasToDevice(touch.clientX, touch.clientY);
      this.onTouch({ action: 0, x, y });
    }
    handleTouchEnd(e) {
      this.isPointerDown = false;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const { x, y } = this.canvasToDevice(touch.clientX, touch.clientY);
      this.onTouch({ action: 1, x, y });
    }
    handleTouchMove(e) {
      e.preventDefault();
      const touch = e.touches[0];
      if (!touch) return;
      const now = performance.now();
      if (now - this.lastMoveTime < this.moveThrottleMs) {
        return;
      }
      this.lastMoveTime = now;
      const { x, y } = this.canvasToDevice(touch.clientX, touch.clientY);
      this.onTouch({ action: 2, x, y });
    }
    /**
     * Update device dimensions (on rotation)
     */
    setDeviceSize(width, height) {
      this.deviceWidth = width;
      this.deviceHeight = height;
    }
    /**
     * Clean up event listeners
     */
    destroy() {
      this.element.removeEventListener("mousedown", this.boundMouseDown);
      this.element.removeEventListener("mouseup", this.boundMouseUp);
      this.element.removeEventListener("mousemove", this.boundMouseMove);
      this.element.removeEventListener("mouseleave", this.boundMouseLeave);
      this.element.removeEventListener("wheel", this.boundWheel);
      this.element.removeEventListener("contextmenu", this.boundContextMenu);
      this.element.removeEventListener("touchstart", this.boundTouchStart);
      this.element.removeEventListener("touchend", this.boundTouchEnd);
      this.element.removeEventListener("touchmove", this.boundTouchMove);
    }
  };

  // renderer/scripts/device/ScrcpyControl.ts
  var POINTER_ID_MOUSE = 0xFFFFFFFFFFFFFFFEn;
  var ScrcpyControl = class {
    deviceWidth;
    deviceHeight;
    sendFn;
    nextPointerId = 0n;
    constructor(deviceWidth, deviceHeight, sendFn) {
      this.deviceWidth = deviceWidth;
      this.deviceHeight = deviceHeight;
      this.sendFn = sendFn;
    }
    /**
     * Send key event
     */
    sendKey(keycode, action = 0 /* DOWN */, repeat = 0, metaState = 0) {
      this.sendKeyInternal(keycode, 0 /* DOWN */, repeat, metaState);
      this.sendKeyInternal(keycode, 1 /* UP */, repeat, metaState);
    }
    sendKeyInternal(keycode, action, repeat, metaState) {
      const buffer = new ArrayBuffer(14);
      const view = new DataView(buffer);
      view.setUint8(0, 0 /* INJECT_KEYCODE */);
      view.setUint8(1, action);
      view.setUint32(2, keycode, false);
      view.setUint32(6, repeat, false);
      view.setUint32(10, metaState, false);
      this.sendFn(new Uint8Array(buffer));
    }
    /**
     * Send touch event
     */
    sendTouch(event) {
      const action = event.action;
      const pointerId = event.pointerId ?? POINTER_ID_MOUSE;
      const x = Math.round(event.x);
      const y = Math.round(event.y);
      const pressure = action === 1 /* UP */ ? 0 : 65535;
      this.sendTouchInternal(action, pointerId, x, y, pressure);
    }
    sendTouchInternal(action, pointerId, x, y, pressure = 65535, actionButton = 0, buttons = 0) {
      const buffer = new ArrayBuffer(32);
      const view = new DataView(buffer);
      const arr = new Uint8Array(buffer);
      view.setUint8(0, 2 /* INJECT_TOUCH_EVENT */);
      view.setUint8(1, action);
      view.setBigUint64(2, pointerId, false);
      view.setInt32(10, x, false);
      view.setInt32(14, y, false);
      view.setUint16(18, this.deviceWidth, false);
      view.setUint16(20, this.deviceHeight, false);
      view.setUint16(22, pressure, false);
      view.setUint32(24, actionButton, false);
      view.setUint32(28, buttons, false);
      this.sendFn(arr);
    }
    /**
     * Send scroll event
     */
    sendScroll(x, y, hscroll, vscroll) {
      const buffer = new ArrayBuffer(21);
      const view = new DataView(buffer);
      view.setUint8(0, 3 /* INJECT_SCROLL_EVENT */);
      view.setInt32(1, Math.round(x), false);
      view.setInt32(5, Math.round(y), false);
      view.setUint16(9, this.deviceWidth, false);
      view.setUint16(11, this.deviceHeight, false);
      const hscrollFixed = Math.round(hscroll * 32767) & 65535;
      const vscrollFixed = Math.round(vscroll * 32767) & 65535;
      view.setInt16(13, hscrollFixed, false);
      view.setInt16(15, vscrollFixed, false);
      view.setUint32(17, 0, false);
      this.sendFn(new Uint8Array(buffer));
    }
    /**
     * Send back or screen on
     */
    backOrScreenOn(action = 0 /* DOWN */) {
      const buffer = new Uint8Array(2);
      buffer[0] = 4 /* BACK_OR_SCREEN_ON */;
      buffer[1] = action;
      this.sendFn(buffer);
    }
    /**
     * Rotate device
     */
    rotateDevice() {
      const buffer = new Uint8Array(1);
      buffer[0] = 11 /* ROTATE_DEVICE */;
      this.sendFn(buffer);
    }
    /**
     * Set display power
     */
    setDisplayPower(on) {
      const buffer = new Uint8Array(2);
      buffer[0] = 10 /* SET_DISPLAY_POWER */;
      buffer[1] = on ? 1 : 0;
      this.sendFn(buffer);
    }
    /**
     * Expand notification panel
     */
    expandNotificationPanel() {
      const buffer = new Uint8Array(1);
      buffer[0] = 5 /* EXPAND_NOTIFICATION_PANEL */;
      this.sendFn(buffer);
    }
    /**
     * Expand settings panel
     */
    expandSettingsPanel() {
      const buffer = new Uint8Array(1);
      buffer[0] = 6 /* EXPAND_SETTINGS_PANEL */;
      this.sendFn(buffer);
    }
    /**
     * Collapse panels
     */
    collapsePanels() {
      const buffer = new Uint8Array(1);
      buffer[0] = 7 /* COLLAPSE_PANELS */;
      this.sendFn(buffer);
    }
    /**
     * Set device clipboard
     */
    async setClipboard(text, paste = false) {
      if (!text) return;
      const textData = new TextEncoder().encode(text);
      const length = 1 + 8 + 1 + 4 + textData.length;
      const buffer = new ArrayBuffer(length);
      const view = new DataView(buffer);
      const arr = new Uint8Array(buffer);
      let offset = 0;
      view.setUint8(offset++, 9 /* SET_CLIPBOARD */);
      view.setBigUint64(offset, 0n, false);
      offset += 8;
      view.setUint8(offset++, paste ? 1 : 0);
      view.setUint32(offset, textData.length, false);
      offset += 4;
      arr.set(textData, offset);
      this.sendFn(arr);
    }
    /**
     * Inject text
     */
    injectText(text) {
      const textBytes = new TextEncoder().encode(text);
      const buffer = new Uint8Array(1 + 4 + textBytes.length);
      const view = new DataView(buffer.buffer);
      buffer[0] = 1 /* INJECT_TEXT */;
      view.setUint32(1, textBytes.length, false);
      buffer.set(textBytes, 5);
      this.sendFn(buffer);
    }
    /**
     * Open hard keyboard settings on device
     * This opens the Android settings page for hardware keyboard
     */
    openHardKeyboardSettings() {
      const buffer = new Uint8Array(1);
      buffer[0] = 15 /* OPEN_HARD_KEYBOARD_SETTINGS */;
      this.sendFn(buffer);
    }
    /**
     * Reset video stream
     */
    resetVideo() {
      const buffer = new Uint8Array(1);
      buffer[0] = 17 /* RESET_VIDEO */;
      this.sendFn(buffer);
    }
    /**
     * Update device dimensions
     */
    updateDimensions(width, height) {
      this.deviceWidth = width;
      this.deviceHeight = height;
    }
  };

  // renderer/scripts/shared/QualityPresets.ts
  var QualityPresets = {
    low: {
      bitrate: 1e6,
      // 1 Mbps (Stable)
      maxSize: 0.3,
      // Low = 30%
      maxFps: 30,
      forceBaseline: false,
      decoderName: "jmuxer"
    },
    medium: {
      bitrate: 4e6,
      // 4 Mbps (Balanced)
      maxSize: 0.5,
      // Mid = 50%
      maxFps: 30,
      forceBaseline: false,
      decoderName: "jmuxer"
    },
    high: {
      bitrate: 12e6,
      // 12 Mbps
      maxSize: 0.8,
      // High = 80%
      maxFps: 60,
      forceBaseline: false,
      decoderName: "webcodec"
    },
    max: {
      bitrate: 24e6,
      // 24 Mbps
      maxSize: 0,
      // Best = 100% (Original)
      maxFps: 80,
      forceBaseline: false,
      decoderName: "webcodec"
    }
  };
  function getPresetName(settings) {
    for (const [name, preset] of Object.entries(QualityPresets)) {
      if (preset.bitrate === settings.bitrate && preset.maxSize === settings.maxSize && preset.forceBaseline === settings.forceBaseline && preset.decoderName === settings.decoderName) {
        return name;
      }
    }
    return null;
  }

  // renderer/scripts/device/KeyMapper.ts
  var KeyMapper = class _KeyMapper {
    control;
    width;
    height;
    profile;
    enabled = false;
    // State
    pressedKeys = /* @__PURE__ */ new Set();
    joystickPointerId = BigInt(0);
    // Reserved for joystick
    joystickActive = false;
    // Default Profile (PUBG/Mobile FPS style - Bottom Left Joystick)
    static DEFAULT_PROFILE = {
      name: "Default FPS",
      joystick: {
        up: "KeyW",
        down: "KeyS",
        left: "KeyA",
        right: "KeyD",
        centerX: 0.2,
        // 20% from left
        centerY: 0.75,
        // 75% from top
        radius: 0.1
        // 10% screen width
      },
      taps: {
        "Space": { x: 0.9, y: 0.8 },
        // Jump (Bottom Right)
        "KeyR": { x: 0.8, y: 0.3 },
        // Reload (Top Right)
        "KeyF": { x: 0.7, y: 0.5 }
        // Interact
      }
    };
    constructor(control, width, height) {
      this.control = control;
      this.width = width;
      this.height = height;
      this.profile = _KeyMapper.DEFAULT_PROFILE;
    }
    setEnabled(enabled) {
      this.enabled = enabled;
      if (!enabled) {
        this.reset();
      }
    }
    isEnabled() {
      return this.enabled;
    }
    setDimensions(width, height) {
      this.width = width;
      this.height = height;
    }
    handleKeyDown(code) {
      if (!this.enabled) return false;
      if (this.pressedKeys.has(code)) return true;
      this.pressedKeys.add(code);
      return this.processInput();
    }
    handleKeyUp(code) {
      if (!this.enabled) return false;
      if (!this.pressedKeys.has(code)) return false;
      this.pressedKeys.delete(code);
      return this.processInput();
    }
    reset() {
      this.pressedKeys.clear();
      if (this.joystickActive) {
        this.sendJoystickEvent(0, 0, 1);
        this.joystickActive = false;
      }
    }
    processInput() {
      let handled = false;
      if (this.profile.joystick) {
        const joy = this.profile.joystick;
        const up = this.pressedKeys.has(joy.up);
        const down = this.pressedKeys.has(joy.down);
        const left = this.pressedKeys.has(joy.left);
        const right = this.pressedKeys.has(joy.right);
        if (up || down || left || right) {
          let dx = 0;
          let dy = 0;
          if (up) dy -= 1;
          if (down) dy += 1;
          if (left) dx -= 1;
          if (right) dx += 1;
          if (dx !== 0 || dy !== 0) {
            const len = Math.sqrt(dx * dx + dy * dy);
            dx /= len;
            dy /= len;
          }
          this.sendJoystickEvent(dx, dy, 2);
          if (!this.joystickActive) {
            this.sendJoystickEvent(0, 0, 0);
            this.sendJoystickEvent(dx, dy, 2);
            this.joystickActive = true;
          } else {
            this.sendJoystickEvent(dx, dy, 2);
          }
          handled = true;
        } else if (this.joystickActive) {
          this.sendJoystickEvent(0, 0, 1);
          this.joystickActive = false;
          handled = true;
        }
      }
      return handled;
    }
    // Joystick Helper
    sendJoystickEvent(vecX, vecY, action) {
      if (!this.profile.joystick) return;
      const { centerX, centerY, radius } = this.profile.joystick;
      const absCX = this.width * centerX;
      const absCY = this.height * centerY;
      const absRadius = this.width * radius;
      const targetX = absCX + vecX * absRadius;
      const targetY = absCY + vecY * absRadius;
      this.control.sendTouch({
        action,
        // 0=DOWN, 1=UP, 2=MOVE
        x: targetX,
        y: targetY,
        pointerId: this.joystickPointerId
      });
    }
    // Explicit method for simple taps to avoid state complexity
    processTap(code, isDown) {
      if (!this.enabled || !this.profile.taps) return false;
      const tap = this.profile.taps[code];
      if (tap) {
        const x = this.width * tap.x;
        const y = this.height * tap.y;
        const pointerId = BigInt(10 + code.charCodeAt(code.length - 1) % 10);
        this.control.sendTouch({
          action: isDown ? 0 : 1,
          // DOWN/UP
          x,
          y,
          pointerId
        });
        return true;
      }
      return false;
    }
  };

  // renderer/scripts/device/app.ts
  var SC_CODEC_ID_H264 = 1748121140;
  var SC_CODEC_ID_H265 = 1748121141;
  var SC_CODEC_ID_AV1 = 6387249;
  var AK_ENTER = 66;
  var AK_DEL = 67;
  var AK_TAB = 61;
  var AK_ESCAPE = 111;
  var AK_UP = 19;
  var AK_DOWN = 20;
  var AK_LEFT = 21;
  var AK_RIGHT = 22;
  var AK_PAGE_UP = 92;
  var AK_PAGE_DOWN = 93;
  var AK_MOVE_HOME = 122;
  var AK_MOVE_END = 123;
  var AK_FORWARD_DEL = 112;
  var AMETA_ALT_ON = 2;
  var AMETA_SHIFT_ON = 1;
  var AMETA_CTRL_ON = 4096;
  var KEY_MAP = {
    "Enter": AK_ENTER,
    "Backspace": AK_DEL,
    "Delete": AK_FORWARD_DEL,
    "Tab": AK_TAB,
    "Escape": AK_ESCAPE,
    "ArrowUp": AK_UP,
    "ArrowDown": AK_DOWN,
    "ArrowLeft": AK_LEFT,
    "ArrowRight": AK_RIGHT,
    "Home": AK_MOVE_HOME,
    "End": AK_MOVE_END,
    "PageUp": AK_PAGE_UP,
    "PageDown": AK_PAGE_DOWN
  };
  var DeviceApp = class {
    serial;
    model;
    // Components
    jmuxer = null;
    inputHandler = null;
    control = null;
    keyMapper = null;
    // DOM Elements
    videoElement;
    loadingOverlay;
    settingsPanel;
    actionMenu;
    settingsModal;
    // State
    deviceInfo = null;
    currentQuality;
    isConnected = false;
    isRestarting = false;
    hasReceivedVideo = false;
    lastVideoWidth = 0;
    lastVideoHeight = 0;
    cleanupFunctions = [];
    port = 27183;
    boundKeyDown;
    boundKeyUp;
    // Video packet buffer
    packetBuffer = new Uint8Array(0);
    // Keyboard State
    savedIme = null;
    constructor() {
      const params = new URLSearchParams(window.location.search);
      this.serial = params.get("serial") || "Unknown";
      this.model = params.get("model") || "Unknown";
      this.port = parseInt(params.get("port") || "27183");
      this.videoElement = document.getElementById("video-player");
      this.loadingOverlay = document.getElementById("loading-overlay");
      this.settingsPanel = document.getElementById("settings-panel");
      this.actionMenu = document.getElementById("action-menu");
      this.settingsModal = document.getElementById("settings-modal");
      const isWireless = this.serial.includes(":") || this.serial.includes(".");
      const usbIcon = document.getElementById("icon-usb");
      const wifiIcon = document.getElementById("icon-wifi");
      if (isWireless) {
        this.currentQuality = QualityPresets.medium;
        if (wifiIcon) wifiIcon.style.display = "block";
        console.log("[DeviceApp] Wireless mode detected, applying Mid preset:", this.currentQuality);
      } else {
        this.currentQuality = QualityPresets.max;
        if (usbIcon) usbIcon.style.display = "block";
      }
      this.boundKeyDown = this.handleKeyDown.bind(this);
      this.boundKeyUp = this.handleKeyUp.bind(this);
      this.init();
    }
    async init() {
      const serialEl = document.getElementById("device-serial");
      serialEl.textContent = this.serial;
      const showSerial = localStorage.getItem("show_device_serial") !== "false";
      if (!showSerial) {
        serialEl.style.display = "none";
      }
      document.title = `${this.model} - .mirrord`;
      this.setupEventListeners();
      this.setupSettings();
      this.setupSidebarControl();
      this.setupJMuxer();
      this.setupDataListeners();
      try {
        const sizeOut = await window.mirrorControl.shell(this.serial, "wm size");
        const match = sizeOut.match(/Physical size: (\d+)x(\d+)/);
        if (match) {
          this.deviceInfo = { width: parseInt(match[1]), height: parseInt(match[2]) };
        }
      } catch (e) {
        console.warn("Failed to get device size, assuming default", e);
      }
      this.startResolutionWatcher();
      await this.connect();
    }
    setupDataListeners() {
      const unsubMetadata = window.mirrorControl.onMetadata((metadata) => {
        console.log("[DeviceApp] Metadata received:", metadata);
        this.handleMetadata(metadata);
      });
      this.cleanupFunctions.push(unsubMetadata);
      const unsubData = window.mirrorControl.onData((data) => {
        this.hasReceivedVideo = true;
        if (this.loadingOverlay.style.display !== "none") {
          console.log("[DeviceApp] Video data received, forcing loading overlay hide");
          this.showLoading(false);
        }
        this.handleVideoData(new Uint8Array(data));
      });
      this.cleanupFunctions.push(unsubData);
      const unsubConnected = window.mirrorControl.onConnected(() => {
        console.log("[DeviceApp] Connected to device");
        this.isConnected = true;
      });
      this.cleanupFunctions.push(unsubConnected);
      const unsubDisconnected = window.mirrorControl.onDisconnected(() => {
        console.log("[DeviceApp] Disconnected");
        this.isConnected = false;
        this.showLoading(true);
      });
      this.cleanupFunctions.push(unsubDisconnected);
      const unsubError = window.mirrorControl.onError((error) => {
        console.error("[DeviceApp] Socket error:", error);
      });
      this.cleanupFunctions.push(unsubError);
    }
    handleMetadata(metadata) {
      const codecName = this.getCodecName(metadata.codecId);
      console.log(`[DeviceApp] Video: ${codecName} ${metadata.width}x${metadata.height}`);
      this.deviceInfo = {
        width: metadata.width,
        height: metadata.height
      };
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
        this.keyMapper = new KeyMapper(
          this.control,
          metadata.width,
          metadata.height
        );
      }
      if (this.keyMapper) {
        this.keyMapper.setDimensions(metadata.width, metadata.height);
      }
      this.adjustWindowSize(metadata.width, metadata.height);
      document.title = metadata.deviceName || this.model;
      this.showLoading(false);
    }
    getCodecName(codecId) {
      switch (codecId) {
        case SC_CODEC_ID_H264:
          return "H.264";
        case SC_CODEC_ID_H265:
          return "H.265";
        case SC_CODEC_ID_AV1:
          return "AV1";
        default:
          return `Unknown (0x${codecId.toString(16)})`;
      }
    }
    handleVideoData(data) {
      const newBuffer = new Uint8Array(this.packetBuffer.length + data.length);
      newBuffer.set(this.packetBuffer);
      newBuffer.set(data, this.packetBuffer.length);
      this.packetBuffer = newBuffer;
      this.processVideoPackets();
    }
    processVideoPackets() {
      while (this.packetBuffer.length >= 12) {
        const view = new DataView(this.packetBuffer.buffer, this.packetBuffer.byteOffset, this.packetBuffer.byteLength);
        const ptsHigh = view.getUint32(0, false);
        const ptsLow = view.getUint32(4, false);
        const isConfig = ptsHigh === 4294967295 && ptsLow === 4294967295;
        const packetSize = view.getUint32(8, false);
        if (this.packetBuffer.length < 12 + packetSize) {
          break;
        }
        const packetData = this.packetBuffer.slice(12, 12 + packetSize);
        this.packetBuffer = this.packetBuffer.slice(12 + packetSize);
        const isKeyframe = this.isKeyframe(packetData);
        if (this.jmuxer) {
          this.jmuxer.feed(packetData);
        } else {
          console.warn("[DeviceApp] JMuxer not initialized!");
        }
      }
    }
    isKeyframe(data) {
      for (let i = 0; i < data.length - 4; i++) {
        if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0 && data[i + 3] === 1) {
          const nalType = data[i + 4] & 31;
          if (nalType === 5) return true;
        }
        if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 1) {
          const nalType = data[i + 3] & 31;
          if (nalType === 5) return true;
        }
      }
      return false;
    }
    setupEventListeners() {
      document.getElementById("btn-back")?.addEventListener("click", () => this.sendKeyEvent(4));
      document.getElementById("btn-home")?.addEventListener("click", () => this.sendKeyEvent(3));
      document.getElementById("btn-recents")?.addEventListener("click", () => this.sendKeyEvent(187));
      document.getElementById("btn-wireless-side")?.addEventListener("click", () => this.enableWireless());
      document.getElementById("btn-rotate-side")?.addEventListener("click", () => this.rotateScreen());
      document.getElementById("btn-power-side")?.addEventListener("click", () => this.toggleScreen());
      document.getElementById("btn-vol-up")?.addEventListener("click", () => this.volumeUp());
      document.getElementById("btn-vol-down")?.addEventListener("click", () => this.volumeDown());
      document.getElementById("btn-logcat-side")?.addEventListener("click", () => this.copyLogcat());
      document.addEventListener("click", (e) => {
        const target = e.target;
      });
      window.mirrorControl.onSendNavButton((button) => {
        this.sendNavButton(button);
      });
      window.addEventListener("keydown", this.boundKeyDown);
      window.addEventListener("keyup", this.boundKeyUp);
      this.videoElement.addEventListener("resize", () => {
        if (this.videoElement.videoWidth > 0 && this.videoElement.videoHeight > 0) {
          console.log(`[DeviceApp] Video resized: ${this.videoElement.videoWidth}x${this.videoElement.videoHeight}`);
          this.adjustWindowSize(this.videoElement.videoWidth, this.videoElement.videoHeight);
        }
      });
    }
    setupJMuxer() {
      console.log("[DeviceApp] Setting up JMuxer decoder");
      this.jmuxer = new JMuxerDecoder(this.videoElement);
      console.log("[DeviceApp] JMuxer created");
    }
    async connect() {
      try {
        console.log(`[DeviceApp] Connecting to ${this.serial} on port ${this.port}...`);
        const success = await window.mirrorControl.connect(this.serial, this.port);
        if (!success) {
          console.error("[DeviceApp] Failed to connect");
          setTimeout(() => this.connect(), 2e3);
        }
      } catch (error) {
        console.error("[DeviceApp] Connection failed:", error);
        this.showLoading(true);
        setTimeout(() => this.connect(), 2e3);
      }
    }
    sendData(data) {
      if (this.isConnected) {
        window.mirrorControl.send(this.serial, data);
      }
    }
    sendKeyEvent(keycode) {
      this.control?.sendKey(keycode);
    }
    sendNavButton(button) {
      const keycodes = [4, 3, 187];
      if (button >= 0 && button < keycodes.length) {
        this.sendKeyEvent(keycodes[button]);
      }
    }
    async handleKeyDown(e) {
      console.log(`[DeviceApp] KeyDown: code=${e.code} key=${e.key} connected=${this.isConnected} control=${!!this.control}`);
      if (!this.control || !this.isConnected) return;
      const target = e.target;
      if (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA") return;
      if (!this.settingsPanel.hidden && this.settingsPanel.offsetParent !== null) return;
      if (this.keyMapper && this.keyMapper.isEnabled()) {
        if (this.keyMapper.handleKeyDown(e.code) || this.keyMapper.processTap(e.code, true)) {
          e.preventDefault();
          return;
        }
      }
      e.preventDefault();
      const code = e.code;
      if (KEY_MAP[code] !== void 0) {
        console.log(`[DeviceApp] Mapping special key: ${code} -> ${KEY_MAP[code]}`);
        const androidKey = KEY_MAP[code];
        let metaState = 0;
        if (e.shiftKey) metaState |= AMETA_SHIFT_ON;
        if (e.ctrlKey) metaState |= AMETA_CTRL_ON;
        if (e.altKey) metaState |= AMETA_ALT_ON;
        this.control.sendKey(androidKey, 0, 0, metaState);
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        console.log(`[DeviceApp] Injecting text: "${e.key}"`);
        this.control.injectText(e.key);
        return;
      }
    }
    handleKeyUp(e) {
      if (this.keyMapper && this.keyMapper.isEnabled()) {
        if (this.keyMapper.handleKeyUp(e.code) || this.keyMapper.processTap(e.code, false)) {
          e.preventDefault();
        }
      }
    }
    applyQualityPreset(preset) {
      this.currentQuality = { ...QualityPresets[preset] };
    }
    resolveMaxSize(val) {
      if (val === 0) return 0;
      if (val > 1) return Math.floor(val);
      if (this.deviceInfo) {
        const maxDim = Math.max(this.deviceInfo.width, this.deviceInfo.height);
        return Math.floor(maxDim * val) & ~7;
      }
      return 0;
    }
    showLoading(show) {
      if (typeof show === "string") {
        const p = this.loadingOverlay.querySelector("p");
        if (p) p.textContent = show;
        this.loadingOverlay.style.display = "flex";
      } else {
        this.loadingOverlay.style.display = show ? "flex" : "none";
        if (show) {
          const p = this.loadingOverlay.querySelector("p");
          if (p) p.textContent = "Loading...";
        }
      }
    }
    async volumeUp() {
      try {
        await window.mirrorControl.shell(this.serial, "input keyevent 24");
      } catch (e) {
        console.error("VolUp failed", e);
      }
    }
    async volumeDown() {
      try {
        await window.mirrorControl.shell(this.serial, "input keyevent 25");
      } catch (e) {
        console.error("VolDown failed", e);
      }
    }
    // Device control actions
    async enableWireless() {
      try {
        await window.mirrorControl.shell(this.serial, "setprop service.adb.tcp.port 5555");
        await window.mirrorControl.shell(this.serial, "stop adbd && start adbd");
        const ip = await window.mirrorControl.shell(this.serial, "ip addr show wlan0 | grep 'inet ' | awk '{print $2}' | cut -d/ -f1");
        alert(`Wireless mode enabled!
Connect to: ${ip.trim()}:5555`);
      } catch (error) {
        alert(`Failed to enable wireless mode: ${error}`);
      }
    }
    async rotateScreen() {
      this.control?.rotateDevice();
    }
    async toggleScreen() {
      try {
        await window.mirrorControl.shell(this.serial, "input keyevent 26");
      } catch (error) {
        console.error("Failed to toggle screen:", error);
      }
    }
    async copyLogcat() {
      try {
        const logcat = await window.mirrorControl.copyLogcat(this.serial);
        await navigator.clipboard.writeText(logcat);
        alert("Logcat copied to clipboard!");
      } catch (error) {
        console.error("Failed to copy logcat:", error);
        alert(`Failed to copy logcat: ${error}`);
      }
    }
    toggleGameMode() {
      if (this.keyMapper) {
        const enabled = !this.keyMapper.isEnabled();
        this.keyMapper.setEnabled(enabled);
        alert(`Game Mode: ${enabled ? "ON (WASD=Move, Space=Jump, R=Reload)" : "OFF"}`);
      }
    }
    setupSettings() {
      const btnSettings = document.getElementById("btn-settings");
      const btnCancel = document.getElementById("btn-cancel-settings");
      const btnSave = document.getElementById("btn-save-settings");
      btnSettings?.addEventListener("click", () => {
        this.updateSettingsUI();
        this.settingsModal.showModal();
      });
      btnCancel?.addEventListener("click", () => {
        this.settingsModal.close();
      });
      btnSave?.addEventListener("click", () => {
        this.saveSettings();
      });
      document.querySelectorAll(".btn-preset").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const presetName = e.currentTarget.dataset.preset;
          if (presetName && QualityPresets[presetName]) {
            const preset = QualityPresets[presetName];
            document.getElementById("setting-bitrate").value = preset.bitrate.toString();
            document.getElementById("setting-max-size").value = preset.maxSize.toString();
            const decoderEl = document.getElementById("setting-decoder");
            if (decoderEl && preset.decoderName) decoderEl.value = preset.decoderName;
            const forceEl = document.getElementById("setting-force-baseline");
            if (forceEl) forceEl.checked = !!preset.forceBaseline;
            document.querySelectorAll(".btn-preset").forEach((b) => b.classList.remove("active"));
            e.currentTarget.classList.add("active");
          }
        });
      });
      const inputs = ["setting-bitrate", "setting-max-size", "setting-decoder", "setting-force-baseline"];
      inputs.forEach((id) => {
        document.getElementById(id)?.addEventListener("change", () => {
          document.querySelectorAll(".btn-preset").forEach((b) => b.classList.remove("active"));
        });
      });
    }
    setupSidebarControl() {
      const sidebar = document.getElementById("sidebar-controls");
      const btnToggle = document.getElementById("btn-toggle-sidebar");
      btnToggle?.addEventListener("click", () => {
        if (sidebar) {
          const isHidden = sidebar.classList.contains("translate-x-full");
          if (isHidden) {
            sidebar.classList.remove("translate-x-full");
            sidebar.classList.add("translate-x-0");
            btnToggle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevrons-left-icon lucide-chevrons-left"><path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/></svg>';
          } else {
            sidebar.classList.add("translate-x-full");
            sidebar.classList.remove("translate-x-0");
            btnToggle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevrons-right-icon lucide-chevrons-right"><path d="m6 17 5-5-5-5"/><path d="m13 17 5-5-5-5"/></svg>';
          }
          if (this.videoElement.videoWidth > 0 && this.videoElement.videoHeight > 0) {
            this.adjustWindowSize(this.videoElement.videoWidth, this.videoElement.videoHeight);
          }
        }
      });
      const savedImeVal = localStorage.getItem("saved_keyboard_ime");
      if (savedImeVal) this.savedIme = savedImeVal;
      window.mirrorControl.onClipboard((text) => {
        console.log("[DeviceApp] Clipboard received from device");
        navigator.clipboard.writeText(text).catch((e) => console.warn("Clipboard write failed", e));
      });
      window.addEventListener("focus", () => {
        navigator.clipboard.readText().then((text) => {
          if (text && this.control) {
            this.control.setClipboard(text, false);
            console.log("[DeviceApp] Clipboard synced to device");
          }
        }).catch(() => {
        });
      });
      const iconKeyboardOn = document.getElementById("icon-keyboard-on");
      const iconKeyboardOff = document.getElementById("icon-keyboard-off");
      let softKeyboardHidden = localStorage.getItem("soft_keyboard_hidden") === "true";
      if (iconKeyboardOn && iconKeyboardOff) {
        iconKeyboardOn.style.display = softKeyboardHidden ? "none" : "block";
        iconKeyboardOff.style.display = softKeyboardHidden ? "block" : "none";
        console.log(`[DeviceApp] Restored keyboard state: ${softKeyboardHidden ? "Disabled" : "Enabled"} (IME: ${this.savedIme})`);
      }
      document.getElementById("btn-keyboard-toggle")?.addEventListener("click", async () => {
        try {
          softKeyboardHidden = !softKeyboardHidden;
          localStorage.setItem("soft_keyboard_hidden", String(softKeyboardHidden));
          if (softKeyboardHidden) {
            let currentIme = await window.mirrorControl.shell(this.serial, "settings get secure default_input_method");
            currentIme = currentIme ? currentIme.trim() : "";
            if (currentIme && currentIme.length > 0) {
              this.savedIme = currentIme;
              if (this.savedIme) {
                localStorage.setItem("saved_keyboard_ime", this.savedIme);
              }
              console.log(`[DeviceApp] Disabling IME: ${this.savedIme}`);
              await window.mirrorControl.shell(this.serial, `ime disable ${this.savedIme}`);
            } else {
              console.warn("[DeviceApp] Could not detect current IME to disable");
            }
          } else {
            if (!this.savedIme) {
              console.warn("[DeviceApp] No saved IME found. Attempting to recover a keyboard...");
              const allImesRaw = await window.mirrorControl.shell(this.serial, "ime list -a -s");
              const allImes = allImesRaw.split(/\r?\n/).map((s) => s.trim()).filter((s) => s.length > 0);
              const keywords = ["google", "gboard", "samsung", "xiaomi", "miui", "swiftkey", "latin"];
              for (const keyword of keywords) {
                const match = allImes.find((ime) => ime.toLowerCase().includes(keyword));
                if (match) {
                  this.savedIme = match;
                  break;
                }
              }
              if (!this.savedIme && allImes.length > 0) this.savedIme = allImes[0];
            }
            if (this.savedIme) {
              console.log(`[DeviceApp] Enabling IME: ${this.savedIme}`);
              await window.mirrorControl.shell(this.serial, `ime enable ${this.savedIme}`);
              await window.mirrorControl.shell(this.serial, `ime set ${this.savedIme}`);
              try {
                await window.mirrorControl.shell(this.serial, `cmd input_method set-method-enabled ${this.savedIme} true`);
              } catch (ignore) {
              }
              localStorage.removeItem("saved_keyboard_ime");
              this.savedIme = null;
            } else {
              console.error("[DeviceApp] Failed to find any IME to enable!");
            }
          }
          if (iconKeyboardOn && iconKeyboardOff) {
            iconKeyboardOn.style.display = softKeyboardHidden ? "none" : "block";
            iconKeyboardOff.style.display = softKeyboardHidden ? "block" : "none";
          }
          console.log(`[DeviceApp] Soft keyboard permanently ${softKeyboardHidden ? "disabled" : "enabled"}`);
        } catch (e) {
          console.error("Keyboard toggle failed", e);
          softKeyboardHidden = !softKeyboardHidden;
        }
      });
      localStorage.removeItem("saved_keyboard_ime");
      this.savedIme = null;
    }
    updateSettingsUI() {
      const bitrateSelect = document.getElementById("setting-bitrate");
      bitrateSelect.value = this.currentQuality.bitrate.toString();
      const sizeSelect = document.getElementById("setting-max-size");
      sizeSelect.value = this.currentQuality.maxSize.toString();
      const decoderSelect = document.getElementById("setting-decoder");
      if (decoderSelect && this.currentQuality.decoderName) {
        decoderSelect.value = this.currentQuality.decoderName;
      }
      const forceBaseline = document.getElementById("setting-force-baseline");
      if (forceBaseline) forceBaseline.checked = !!this.currentQuality.forceBaseline;
      const matchedPreset = getPresetName(this.currentQuality);
      document.querySelectorAll(".btn-preset").forEach((btn) => {
        const el = btn;
        if (matchedPreset && el.dataset.preset === matchedPreset) {
          el.classList.add("active");
        } else {
          el.classList.remove("active");
        }
      });
    }
    async saveSettings() {
      const bitrate = parseInt(document.getElementById("setting-bitrate").value);
      const maxSizeStr = document.getElementById("setting-max-size").value;
      const maxSize = parseFloat(maxSizeStr);
      const decoderName = document.getElementById("setting-decoder").value;
      const forceBaselineEl = document.getElementById("setting-force-baseline");
      const forceBaseline = forceBaselineEl ? forceBaselineEl.checked : false;
      const newQuality = {
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
    async restartStream(quality) {
      if (this.isRestarting) return;
      this.isRestarting = true;
      this.hasReceivedVideo = false;
      this.showLoading("Optimizing stream configuration...");
      try {
        await window.mirrorControl.stopMirror(this.serial, { keepWindowOpen: true });
        this.cleanupFunctions.forEach((fn) => fn());
        this.cleanupFunctions = [];
        if (this.jmuxer) {
          this.jmuxer.destroy();
          this.jmuxer = null;
        }
        if (this.inputHandler) {
          this.inputHandler.destroy();
          this.inputHandler = null;
        }
        this.control = null;
        this.packetBuffer = new Uint8Array(0);
        const realMaxSize = this.resolveMaxSize(quality.maxSize);
        const { port } = await window.mirrorControl.startMirror(this.serial, {
          bitrate: quality.bitrate,
          maxSize: realMaxSize,
          maxFps: quality.maxFps,
          forceBaseline: quality.forceBaseline,
          openWindow: false
        });
        this.port = port;
        this.setupDataListeners();
        if (quality.decoderName !== "jmuxer") {
          console.warn("Selected decoder not implemented, falling back to JMuxer");
        }
        this.setupJMuxer();
        await new Promise((r) => setTimeout(r, 500));
        await this.connect();
        try {
          await window.mirrorControl.shell(this.serial, "settings put system user_rotation 1");
          console.log("[DeviceApp] Services reset: Rotation forced to Landscape");
        } catch (e) {
          console.warn("[DeviceApp] Failed to set rotation:", e);
        }
        setTimeout(() => {
          if (!this.hasReceivedVideo && this.isConnected) {
            console.error("Video stream stale/blank after restart. Reverting to Safe Mode.");
            this.showLoading("Stream unstable. Reverting to Safe Mode...");
            setTimeout(() => {
              this.isRestarting = false;
              this.revertToSafeMode();
            }, 1e3);
          }
        }, 5e3);
      } catch (err) {
        console.error("Failed to restart:", err);
        this.showLoading(`Error: ${err}`);
        this.isRestarting = false;
      } finally {
        setTimeout(() => {
          if (!this.isRestarting) return;
          this.isRestarting = false;
          this.showLoading(false);
        }, 1500);
      }
    }
    async revertToSafeMode() {
      const safeQuality = {
        ...QualityPresets.low,
        bitrate: 1e6,
        // 1 Mbps (Super safe)
        maxSize: 0.25,
        // 25% scale
        forceBaseline: true,
        // Baseline for compatibility
        decoderName: "jmuxer"
      };
      console.log("Applying Safe Mode:", safeQuality);
      this.currentQuality = safeQuality;
      this.updateSettingsUI();
      await this.restartStream(safeQuality);
    }
    adjustWindowSize(videoWidth, videoHeight) {
      const header = document.querySelector("header");
      const nav = document.querySelector("nav");
      const sidebar = document.getElementById("sidebar-controls");
      const videoContainer = document.getElementById("video-container");
      const chromeHeight = (header?.clientHeight || 44) + (nav?.clientHeight || 48);
      let chromeWidth = 0;
      if (sidebar && !sidebar.classList.contains("translate-x-full")) {
        chromeWidth = sidebar.offsetWidth || 48;
        videoContainer?.classList.add("pr-12");
      } else {
        videoContainer?.classList.remove("pr-12");
      }
      console.log(`[DeviceApp] Adjusting window for ${videoWidth}x${videoHeight} + ${chromeWidth}x${chromeHeight} chrome`);
      window.mirrorControl.resizeWindow(videoWidth, videoHeight, chromeHeight, chromeWidth);
    }
    startResolutionWatcher() {
      setInterval(() => {
        if (!this.videoElement) return;
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
        if (!this.videoElement.paused && this.videoElement.buffered.length > 0) {
          const end = this.videoElement.buffered.end(this.videoElement.buffered.length - 1);
          const current = this.videoElement.currentTime;
          const latency = end - current;
          if (latency > 0.3) {
            this.videoElement.currentTime = end - 0.01;
          }
        }
      }, 500);
    }
  };
  document.addEventListener("DOMContentLoaded", () => {
    new DeviceApp();
  });
})();
