/**
 * ScrcpyControl - Implements scrcpy control protocol for input injection
 * 
 * Message format: type (1 byte) + payload (varies)
 */

// Control message types
const enum ControlMsgType {
  INJECT_KEYCODE = 0,
  INJECT_TEXT = 1,
  INJECT_TOUCH_EVENT = 2,
  INJECT_SCROLL_EVENT = 3,
  BACK_OR_SCREEN_ON = 4,
  EXPAND_NOTIFICATION_PANEL = 5,
  EXPAND_SETTINGS_PANEL = 6,
  COLLAPSE_PANELS = 7,
  GET_CLIPBOARD = 8,
  SET_CLIPBOARD = 9,
  SET_DISPLAY_POWER = 10,
  ROTATE_DEVICE = 11,
  UHID_CREATE = 12,
  UHID_INPUT = 13,
  UHID_DESTROY = 14,
  OPEN_HARD_KEYBOARD_SETTINGS = 15,
  START_APP = 16,
  RESET_VIDEO = 17,
}

// Key event actions
const enum KeyEventAction {
  DOWN = 0,
  UP = 1,
}

// Motion event actions
const enum MotionEventAction {
  DOWN = 0,
  UP = 1,
  MOVE = 2,
}

// Pointer IDs
const POINTER_ID_MOUSE = 0xFFFFFFFFFFFFFFFEn;
const POINTER_ID_VIRTUAL = 0xFFFFFFFFFFFFFFFFn;

export class ScrcpyControl {
  private deviceWidth: number;
  private deviceHeight: number;
  private sendFn: (data: Uint8Array) => void;
  private nextPointerId = 0n;

  constructor(
    deviceWidth: number,
    deviceHeight: number,
    sendFn: (data: Uint8Array) => void
  ) {
    this.deviceWidth = deviceWidth;
    this.deviceHeight = deviceHeight;
    this.sendFn = sendFn;
  }

  /**
   * Send key event
   */
  sendKey(keycode: number, action: KeyEventAction = KeyEventAction.DOWN, repeat: number = 0, metaState: number = 0): void {
    // Also send UP after DOWN for single press
    this.sendKeyInternal(keycode, KeyEventAction.DOWN, repeat, metaState);
    this.sendKeyInternal(keycode, KeyEventAction.UP, repeat, metaState);
  }

  private sendKeyInternal(keycode: number, action: KeyEventAction, repeat: number, metaState: number): void {
    // INJECT_KEYCODE: 1 + 1 + 4 + 4 + 4 = 14 bytes
    const buffer = new ArrayBuffer(14);
    const view = new DataView(buffer);
    
    view.setUint8(0, ControlMsgType.INJECT_KEYCODE);
    view.setUint8(1, action);
    view.setUint32(2, keycode, false); // big-endian
    view.setUint32(6, repeat, false);
    view.setUint32(10, metaState, false);
    
    this.sendFn(new Uint8Array(buffer));
  }

  /**
   * Send touch event
   */
  sendTouch(event: { action: number; x: number; y: number; pointerId?: bigint }): void {
    const action = event.action as MotionEventAction;
    const pointerId = event.pointerId ?? POINTER_ID_MOUSE;
    const x = Math.round(event.x);
    const y = Math.round(event.y);
    const pressure = action === MotionEventAction.UP ? 0 : 0xFFFF;
    
    this.sendTouchInternal(action, pointerId, x, y, pressure);
  }

  private sendTouchInternal(
    action: MotionEventAction,
    pointerId: bigint,
    x: number,
    y: number,
    pressure: number = 0xFFFF,
    actionButton: number = 0,
    buttons: number = 0
  ): void {
    // INJECT_TOUCH_EVENT: 1 + 1 + 8 + 4 + 4 + 2 + 2 + 2 + 4 + 4 = 32 bytes
    const buffer = new ArrayBuffer(32);
    const view = new DataView(buffer);
    const arr = new Uint8Array(buffer);
    
    view.setUint8(0, ControlMsgType.INJECT_TOUCH_EVENT);
    view.setUint8(1, action);
    
    // Pointer ID (8 bytes, big-endian)
    view.setBigUint64(2, pointerId, false);
    
    // Position (4 bytes x, 4 bytes y)
    view.setInt32(10, x, false);
    view.setInt32(14, y, false);
    
    // Screen size (2 bytes w, 2 bytes h)
    view.setUint16(18, this.deviceWidth, false);
    view.setUint16(20, this.deviceHeight, false);
    
    // Pressure (2 bytes, 0xFFFF = full pressure)
    view.setUint16(22, pressure, false);
    
    // Action button (4 bytes)
    view.setUint32(24, actionButton, false);
    
    // Buttons (4 bytes)
    view.setUint32(28, buttons, false);
    
    this.sendFn(arr);
  }

  /**
   * Send scroll event
   */
  sendScroll(x: number, y: number, hscroll: number, vscroll: number): void {
    // INJECT_SCROLL_EVENT: 1 + 4 + 4 + 2 + 2 + 2 + 2 + 4 = 21 bytes
    const buffer = new ArrayBuffer(21);
    const view = new DataView(buffer);
    
    view.setUint8(0, ControlMsgType.INJECT_SCROLL_EVENT);
    view.setInt32(1, Math.round(x), false);
    view.setInt32(5, Math.round(y), false);
    view.setUint16(9, this.deviceWidth, false);
    view.setUint16(11, this.deviceHeight, false);
    
    // Scroll amounts as signed 16-bit (convert from float to fixed point)
    const hscrollFixed = Math.round(hscroll * 0x7FFF) & 0xFFFF;
    const vscrollFixed = Math.round(vscroll * 0x7FFF) & 0xFFFF;
    view.setInt16(13, hscrollFixed, false);
    view.setInt16(15, vscrollFixed, false);
    
    // Buttons (4 bytes)
    view.setUint32(17, 0, false);
    
    this.sendFn(new Uint8Array(buffer));
  }

  /**
   * Send back or screen on
   */
  backOrScreenOn(action: KeyEventAction = KeyEventAction.DOWN): void {
    const buffer = new Uint8Array(2);
    buffer[0] = ControlMsgType.BACK_OR_SCREEN_ON;
    buffer[1] = action;
    this.sendFn(buffer);
  }

  /**
   * Rotate device
   */
  rotateDevice(): void {
    const buffer = new Uint8Array(1);
    buffer[0] = ControlMsgType.ROTATE_DEVICE;
    this.sendFn(buffer);
  }

  /**
   * Set display power
   */
  setDisplayPower(on: boolean): void {
    const buffer = new Uint8Array(2);
    buffer[0] = ControlMsgType.SET_DISPLAY_POWER;
    buffer[1] = on ? 1 : 0;
    this.sendFn(buffer);
  }

  /**
   * Expand notification panel
   */
  expandNotificationPanel(): void {
    const buffer = new Uint8Array(1);
    buffer[0] = ControlMsgType.EXPAND_NOTIFICATION_PANEL;
    this.sendFn(buffer);
  }

  /**
   * Expand settings panel
   */
  expandSettingsPanel(): void {
    const buffer = new Uint8Array(1);
    buffer[0] = ControlMsgType.EXPAND_SETTINGS_PANEL;
    this.sendFn(buffer);
  }

  /**
   * Collapse panels
   */
  collapsePanels(): void {
    const buffer = new Uint8Array(1);
    buffer[0] = ControlMsgType.COLLAPSE_PANELS;
    this.sendFn(buffer);
  }

  /**
   * Set device clipboard
   */
  public async setClipboard(text: string, paste: boolean = false): Promise<void> {
    if (!text) return;
    
    const textData = new TextEncoder().encode(text);
    // Type(1) + Sequence(8) + Paste(1) + Length(4) + Text(N)
    const length = 1 + 8 + 1 + 4 + textData.length;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    const arr = new Uint8Array(buffer);
    
    let offset = 0;
    
    // Type
    view.setUint8(offset++, ControlMsgType.SET_CLIPBOARD);
    
    // Sequence (use 0)
    view.setBigUint64(offset, 0n, false);
    offset += 8;
    
    // Paste flag
    view.setUint8(offset++, paste ? 1 : 0);
    
    // Text Length (4 bytes)
    view.setUint32(offset, textData.length, false);
    offset += 4;
    
    // Text
    arr.set(textData, offset);
    
    this.sendFn(arr);
  }

  /**
   * Inject text
   */
  injectText(text: string): void {
    const textBytes = new TextEncoder().encode(text);
    const buffer = new Uint8Array(1 + 4 + textBytes.length);
    const view = new DataView(buffer.buffer);
    
    buffer[0] = ControlMsgType.INJECT_TEXT;
    view.setUint32(1, textBytes.length, false);
    buffer.set(textBytes, 5);
    
    this.sendFn(buffer);
  }

  /**
   * Open hard keyboard settings on device
   * This opens the Android settings page for hardware keyboard
   */
  openHardKeyboardSettings(): void {
    const buffer = new Uint8Array(1);
    buffer[0] = ControlMsgType.OPEN_HARD_KEYBOARD_SETTINGS;
    this.sendFn(buffer);
  }

  /**
   * Reset video stream
   */
  resetVideo(): void {
    const buffer = new Uint8Array(1);
    buffer[0] = ControlMsgType.RESET_VIDEO;
    this.sendFn(buffer);
  }

  /**
   * Update device dimensions
   */
  updateDimensions(width: number, height: number): void {
    this.deviceWidth = width;
    this.deviceHeight = height;
  }
}
