/**
 * ScrcpyControl - Implements scrcpy control protocol for input injection
 * 
 * Message format: type (1 byte) + payload (varies)
 */

// Control message types
export const enum ControlMsgType {
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
export const enum KeyEventAction {
  DOWN = 0,
  UP = 1,
}

// Motion event actions
export const enum MotionEventAction {
  DOWN = 0,
  UP = 1,
  MOVE = 2,
}

// Pointer IDs
const POINTER_ID_MOUSE = 0xFFFFFFFFFFFFFFFEn;

export class ScrcpyControl {
  private deviceWidth: number;
  private deviceHeight: number;
  private sendFn: (data: Uint8Array) => void;

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
   * Request device to rotate its screen
   */
  rotateDevice(): void {
    const buffer = new ArrayBuffer(1);
    const view = new DataView(buffer);
    view.setUint8(0, ControlMsgType.ROTATE_DEVICE);
    this.sendFn(new Uint8Array(buffer));
  }

  /**
   * Update device dimensions
   */
  updateDimensions(width: number, height: number): void {
    this.deviceWidth = width;
    this.deviceHeight = height;
  }
}
