/**
 * InputHandler - Captures mouse and keyboard events for scrcpy control
 */

type TouchEventCallback = (event: { action: number; x: number; y: number }) => void;

export class InputHandler {
  private element: HTMLElement;
  private deviceWidth: number;
  private deviceHeight: number;
  private onTouch: TouchEventCallback;
  
  // State
  private isPointerDown = false;
  private lastMoveTime = 0;
  private moveThrottleMs = 8; // ~120Hz

  // Bound event handlers
  private boundMouseDown: (e: MouseEvent) => void;
  private boundMouseUp: (e: MouseEvent) => void;
  private boundMouseMove: (e: MouseEvent) => void;
  private boundMouseLeave: (e: MouseEvent) => void;
  private boundWheel: (e: WheelEvent) => void;
  private boundTouchStart: (e: TouchEvent) => void;
  private boundTouchEnd: (e: TouchEvent) => void;
  private boundTouchMove: (e: TouchEvent) => void;
  private boundContextMenu: (e: MouseEvent) => void;

  constructor(
    element: HTMLElement,
    deviceWidth: number,
    deviceHeight: number,
    onTouch: TouchEventCallback
  ) {
    this.element = element;
    this.deviceWidth = deviceWidth;
    this.deviceHeight = deviceHeight;
    this.onTouch = onTouch;

    // Bind handlers once
    this.boundMouseDown = this.handleMouseDown.bind(this);
    this.boundMouseUp = this.handleMouseUp.bind(this);
    this.boundMouseMove = this.handleMouseMove.bind(this);
    this.boundMouseLeave = this.handleMouseLeave.bind(this);
    this.boundWheel = this.handleWheel.bind(this);
    this.boundTouchStart = this.handleTouchStart.bind(this);
    this.boundTouchEnd = this.handleTouchEnd.bind(this);
    this.boundTouchMove = this.handleTouchMove.bind(this);
    this.boundContextMenu = (e: MouseEvent) => e.preventDefault();
    
    this.attachEventListeners();
  }

  /**
   * Attach mouse and keyboard event listeners
   */
  private attachEventListeners(): void {
    // Mouse events
    this.element.addEventListener('mousedown', this.boundMouseDown);
    this.element.addEventListener('mouseup', this.boundMouseUp);
    this.element.addEventListener('mousemove', this.boundMouseMove);
    this.element.addEventListener('mouseleave', this.boundMouseLeave);
    this.element.addEventListener('wheel', this.boundWheel, { passive: false });
    
    // Prevent context menu
    this.element.addEventListener('contextmenu', this.boundContextMenu);
    
    // Touch events
    this.element.addEventListener('touchstart', this.boundTouchStart, { passive: false });
    this.element.addEventListener('touchend', this.boundTouchEnd);
    this.element.addEventListener('touchmove', this.boundTouchMove, { passive: false });
  }

  /**
   * Convert element coordinates to device coordinates
   */
  private canvasToDevice(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.element.getBoundingClientRect();
    
    // Get relative position in element
    const relX = (clientX - rect.left) / rect.width;
    const relY = (clientY - rect.top) / rect.height;
    
    // Scale to device coordinates
    return {
      x: Math.round(relX * this.deviceWidth),
      y: Math.round(relY * this.deviceHeight),
    };
  }

  // Mouse handlers
  private handleMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return; // Only left click
    
    this.isPointerDown = true;
    const { x, y } = this.canvasToDevice(e.clientX, e.clientY);
    
    this.onTouch({ action: 0, x, y }); // ACTION_DOWN
  }

  private handleMouseUp(e: MouseEvent): void {
    if (e.button !== 0) return;
    
    this.isPointerDown = false;
    const { x, y } = this.canvasToDevice(e.clientX, e.clientY);
    
    this.onTouch({ action: 1, x, y }); // ACTION_UP
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.isPointerDown) return;
    
    // Throttle move events
    const now = performance.now();
    if (now - this.lastMoveTime < this.moveThrottleMs) {
      return;
    }
    this.lastMoveTime = now;
    
    const { x, y } = this.canvasToDevice(e.clientX, e.clientY);
    
    this.onTouch({ action: 2, x, y }); // ACTION_MOVE
  }

  private handleMouseLeave(e: MouseEvent): void {
    if (this.isPointerDown) {
      this.isPointerDown = false;
      const { x, y } = this.canvasToDevice(e.clientX, e.clientY);
      
      this.onTouch({ action: 1, x, y }); // ACTION_UP
    }
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    // Scroll handled by ScrcpyControl if needed
  }

  // Touch handlers
  private handleTouchStart(e: TouchEvent): void {
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;
    
    this.isPointerDown = true;
    const { x, y } = this.canvasToDevice(touch.clientX, touch.clientY);
    
    this.onTouch({ action: 0, x, y }); // ACTION_DOWN
  }

  private handleTouchEnd(e: TouchEvent): void {
    this.isPointerDown = false;
    const touch = e.changedTouches[0];
    if (!touch) return;
    
    const { x, y } = this.canvasToDevice(touch.clientX, touch.clientY);
    
    this.onTouch({ action: 1, x, y }); // ACTION_UP
  }

  private handleTouchMove(e: TouchEvent): void {
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;
    
    const now = performance.now();
    if (now - this.lastMoveTime < this.moveThrottleMs) {
      return;
    }
    this.lastMoveTime = now;
    
    const { x, y } = this.canvasToDevice(touch.clientX, touch.clientY);
    
    this.onTouch({ action: 2, x, y }); // ACTION_MOVE
  }

  /**
   * Update device dimensions (on rotation)
   */
  setDeviceSize(width: number, height: number): void {
    this.deviceWidth = width;
    this.deviceHeight = height;
  }

  /**
   * Clean up event listeners
   */
  destroy(): void {
    this.element.removeEventListener('mousedown', this.boundMouseDown);
    this.element.removeEventListener('mouseup', this.boundMouseUp);
    this.element.removeEventListener('mousemove', this.boundMouseMove);
    this.element.removeEventListener('mouseleave', this.boundMouseLeave);
    this.element.removeEventListener('wheel', this.boundWheel);
    this.element.removeEventListener('contextmenu', this.boundContextMenu);
    this.element.removeEventListener('touchstart', this.boundTouchStart);
    this.element.removeEventListener('touchend', this.boundTouchEnd);
    this.element.removeEventListener('touchmove', this.boundTouchMove);
  }
}
