/**
 * KeyMapper.ts - Handles Game Key Mapping (WASD -> Touch, Keys -> Taps)
 */
import { ScrcpyControl } from './ScrcpyControl';

export interface KeyMapProfile {
    name: string;
    joystick?: {
        up: string;
        down: string;
        left: string;
        right: string;
        centerX: number; // 0-1 relative
        centerY: number; // 0-1 relative
        radius: number;  // 0-1 relative
    };
    taps?: Record<string, { x: number; y: number }>; // Key -> Relative Coords
}

export class KeyMapper {
    private control: ScrcpyControl;
    private width: number;
    private height: number;
    private profile: KeyMapProfile;
    private enabled: boolean = false;

    // State
    private pressedKeys: Set<string> = new Set();
    private joystickPointerId = BigInt(0); // Reserved for joystick
    private joystickActive = false;

    // Default Profile (PUBG/Mobile FPS style - Bottom Left Joystick)
    private static DEFAULT_PROFILE: KeyMapProfile = {
        name: 'Default FPS',
        joystick: {
            up: 'KeyW',
            down: 'KeyS',
            left: 'KeyA',
            right: 'KeyD',
            centerX: 0.2, // 20% from left
            centerY: 0.75, // 75% from top
            radius: 0.1   // 10% screen width
        },
        taps: {
            'Space': { x: 0.9, y: 0.8 }, // Jump (Bottom Right)
            'KeyR': { x: 0.8, y: 0.3 },   // Reload (Top Right)
            'KeyF': { x: 0.7, y: 0.5 },   // Interact
        }
    };

    constructor(control: ScrcpyControl, width: number, height: number) {
        this.control = control;
        this.width = width;
        this.height = height;
        this.profile = KeyMapper.DEFAULT_PROFILE;
    }

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        if (!enabled) {
            this.reset();
        }
    }

    isEnabled(): boolean {
        return this.enabled;
    }

    setDimensions(width: number, height: number): void {
        this.width = width;
        this.height = height;
    }

    handleKeyDown(code: string): boolean {
        if (!this.enabled) return false;
        if (this.pressedKeys.has(code)) return true; // Ignore repeat

        this.pressedKeys.add(code);
        return this.processInput();
    }

    handleKeyUp(code: string): boolean {
        if (!this.enabled) return false;
        if (!this.pressedKeys.has(code)) return false;

        this.pressedKeys.delete(code);
        return this.processInput();
    }

    reset(): void {
        this.pressedKeys.clear();
        if (this.joystickActive) {
            this.sendJoystickEvent(0, 0, 1); // UP event
            this.joystickActive = false;
        }
    }

    private processInput(): boolean {
        let handled = false;

        // 1. Joystick Processing
        if (this.profile.joystick) {
            const joy = this.profile.joystick;
            const up = this.pressedKeys.has(joy.up);
            const down = this.pressedKeys.has(joy.down);
            const left = this.pressedKeys.has(joy.left);
            const right = this.pressedKeys.has(joy.right);

            if (up || down || left || right) {
                // Calculate vector
                let dx = 0;
                let dy = 0;
                if (up) dy -= 1;
                if (down) dy += 1;
                if (left) dx -= 1;
                if (right) dx += 1;

                // Normalize
                if (dx !== 0 || dy !== 0) {
                    const len = Math.sqrt(dx * dx + dy * dy);
                    dx /= len;
                    dy /= len;
                }

                // Send Touch Move
                this.sendJoystickEvent(dx, dy, 2); // 2 = MOVE
                if (!this.joystickActive) {
                     // Need to send DOWN first!
                     // But strictly speaking, if we jump from nothing to moving, 
                     // we should send DOWN at center, then MOVE.
                     // But simpler: Send DOWN at calculated position? 
                     // No, joystick usually drags from center.
                     
                     // Sequence: DOWN at Center -> MOVE to Target.
                     this.sendJoystickEvent(0, 0, 0); // DOWN at Center
                     this.sendJoystickEvent(dx, dy, 2); // MOVE to Target
                     this.joystickActive = true;
                } else {
                     this.sendJoystickEvent(dx, dy, 2);
                }
                handled = true;
            } else if (this.joystickActive) {
                // All keys released -> UP
                this.sendJoystickEvent(0, 0, 1); // UP
                this.joystickActive = false;
                handled = true;
            }
        }

        // 2. Tap Processing (Simple key -> Touch)
        // Note: This logic triggers on every state change, which might spam Taps if we aren't careful.
        // Taps should only trigger on Key DOWN.
        // But handleKeyDown calls us.
        // We need to differentiate per key.
        // Refactor: handleKeyDown determines if it's a tap.
        
        return handled;
    }
    
    // Joystick Helper
    private sendJoystickEvent(vecX: number, vecY: number, action: number): void {
        if (!this.profile.joystick) return;
        
        const { centerX, centerY, radius } = this.profile.joystick;
        
        // Calculate absolute center
        const absCX = this.width * centerX;
        const absCY = this.height * centerY;
        const absRadius = this.width * radius;
        
        // Target position
        const targetX = absCX + (vecX * absRadius);
        const targetY = absCY + (vecY * absRadius);
        
        this.control.sendTouch({
            action: action, // 0=DOWN, 1=UP, 2=MOVE
            x: targetX,
            y: targetY,
            pointerId: this.joystickPointerId
        });
    }

    // Explicit method for simple taps to avoid state complexity
    processTap(code: string, isDown: boolean): boolean {
        if (!this.enabled || !this.profile.taps) return false;
        
        const tap = this.profile.taps[code];
        if (tap) {
            const x = this.width * tap.x;
            const y = this.height * tap.y;
            
            // Allow multiple fingers? 
            // We need unique pointer IDs for each key?
            // Hashing code to pointerID (10 to 20)?
            const pointerId = BigInt(10 + (code.charCodeAt(code.length-1) % 10)); 
            
            this.control.sendTouch({
                action: isDown ? 0 : 1, // DOWN/UP
                x: x,
                y: y,
                pointerId: pointerId
            });
            return true;
        }
        return false;
    }
}
