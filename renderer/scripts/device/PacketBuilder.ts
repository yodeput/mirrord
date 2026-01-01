/**
 * PacketBuilder - Constructs binary packets for the .mirrord protocol
 */

const MAGIC = new Uint8Array([0x4D, 0x43]); // "MC"
const HEADER_SIZE = 8;

enum PacketType {
  VIDEO_FRAME = 0x01,
  TOUCH_EVENT = 0x02,
  KEY_EVENT = 0x03,
  CONTROL_CMD = 0x04,
  NAV_BUTTON = 0x05,
}

export class PacketBuilder {
  /**
   * Build packet header
   */
  private static buildHeader(type: PacketType, payloadLength: number): Uint8Array {
    const header = new Uint8Array(HEADER_SIZE);
    const view = new DataView(header.buffer);
    
    header[0] = MAGIC[0]; // 'M'
    header[1] = MAGIC[1]; // 'C'
    header[2] = type;
    view.setUint32(3, payloadLength, true); // Little endian
    header[7] = 0; // Reserved
    
    return header;
  }

  /**
   * Build a complete packet
   */
  private static buildPacket(type: PacketType, payload: Uint8Array): Uint8Array {
    const header = this.buildHeader(type, payload.length);
    const packet = new Uint8Array(HEADER_SIZE + payload.length);
    packet.set(header, 0);
    packet.set(payload, HEADER_SIZE);
    return packet;
  }

  /**
   * Build touch event packet
   * 
   * Format: action(1B) + x(4B float) + y(4B float) + pressure(4B float) + pointerId(1B)
   */
  static touchEvent(action: number, x: number, y: number, pressure: number = 1.0, pointerId: number = 0): Uint8Array {
    const payload = new Uint8Array(14);
    const view = new DataView(payload.buffer);
    
    payload[0] = action;
    view.setFloat32(1, x, true);
    view.setFloat32(5, y, true);
    view.setFloat32(9, pressure, true);
    payload[13] = pointerId;
    
    return this.buildPacket(PacketType.TOUCH_EVENT, payload);
  }

  /**
   * Build key event packet
   * 
   * Format: action(1B) + keyCode(4B) + metaState(4B)
   */
  static keyEvent(action: number, keyCode: number, metaState: number = 0): Uint8Array {
    const payload = new Uint8Array(9);
    const view = new DataView(payload.buffer);
    
    payload[0] = action;
    view.setInt32(1, keyCode, true);
    view.setInt32(5, metaState, true);
    
    return this.buildPacket(PacketType.KEY_EVENT, payload);
  }

  /**
   * Build navigation button packet
   * 
   * Format: button(1B)
   */
  static navButton(button: number): Uint8Array {
    const payload = new Uint8Array([button]);
    return this.buildPacket(PacketType.NAV_BUTTON, payload);
  }

  /**
   * Build control command packet
   * 
   * Format: cmdType(1B) + data(variable)
   */
  static controlCommand(cmdType: number, data: Uint8Array = new Uint8Array()): Uint8Array {
    const payload = new Uint8Array(1 + data.length);
    payload[0] = cmdType;
    payload.set(data, 1);
    
    return this.buildPacket(PacketType.CONTROL_CMD, payload);
  }
}
