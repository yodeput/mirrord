/**
 * Protocol types and utilities for the binary packet protocol
 */

export const MAGIC = new Uint8Array([0x4D, 0x43]); // "MC"
export const HEADER_SIZE = 8;

export enum PacketType {
  VIDEO_FRAME = 0x01,
  TOUCH_EVENT = 0x02,
  KEY_EVENT = 0x03,
  CONTROL_CMD = 0x04,
  NAV_BUTTON = 0x05,
}

export enum ControlType {
  DEVICE_INFO = 0x01,
  QUALITY_CHANGE = 0x02,
  REQUEST_KEYFRAME = 0x03,
  ROTATE_SCREEN = 0x04,
  SCREEN_OFF = 0x05,
}

export enum TouchAction {
  DOWN = 0,
  UP = 1,
  MOVE = 2,
}

export enum KeyAction {
  DOWN = 0,
  UP = 1,
}

export enum NavButton {
  BACK = 0,
  HOME = 1,
  RECENTS = 2,
}

export interface DeviceInfoPacket {
  width: number;
  height: number;
  density: number;
  rotation: number;
}

export interface VideoFramePacket {
  flags: number;
  pts: bigint;
  data: Uint8Array;
  isKeyframe: boolean;
  isConfig: boolean;
}

export interface TouchEventPacket {
  action: TouchAction;
  x: number;
  y: number;
  pressure: number;
  pointerId: number;
}

export interface KeyEventPacket {
  action: KeyAction;
  keyCode: number;
  metaState: number;
}

export interface QualitySettings {
  bitrate: number;
  maxSize: number;
  maxFps: number;
  forceBaseline: boolean;
}
