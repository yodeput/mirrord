/**
 * Quality Presets for video streaming
 */

export interface QualitySettings {
  bitrate: number;      // bps
  maxSize: number;      // max dimension: >1=pixels, <=1=percentage (0=original)
  maxFps: number;       // frames per second
  forceBaseline: boolean;
  decoderName?: string; // 'jmuxer' | 'webcodec'
}

export const QualityPresets = {
  low: {
    bitrate: 1_000_000,    // 1 Mbps (Stable)
    maxSize: 0.3,          // Low = 30%
    maxFps: 30,
    forceBaseline: false,
    decoderName: 'jmuxer',
  } as QualitySettings,
  
  medium: {
    bitrate: 4_000_000,    // 4 Mbps (Balanced)
    maxSize: 0.5,          // Mid = 50%
    maxFps: 30,
    forceBaseline: false,
    decoderName: 'jmuxer',
  } as QualitySettings,
  
  high: {
    bitrate: 12_000_000,   // 12 Mbps
    maxSize: 0.8,          // High = 80%
    maxFps: 60,
    forceBaseline: false,
    decoderName: 'webcodec',
  } as QualitySettings,
  
  max: {
    bitrate: 24_000_000,   // 24 Mbps
    maxSize: 0,            // Best = 100% (Original)
    maxFps: 80,
    forceBaseline: false,
    decoderName: 'webcodec',
  } as QualitySettings,
};

/**
 * Get preset closest to current settings
 */
export function getPresetName(settings: QualitySettings): keyof typeof QualityPresets | null {
  for (const [name, preset] of Object.entries(QualityPresets)) {
    // Exact match on all visible fields
    if (
        preset.bitrate === settings.bitrate && 
        preset.maxSize === settings.maxSize &&
        preset.forceBaseline === settings.forceBaseline &&
        preset.decoderName === settings.decoderName
    ) {
      return name as keyof typeof QualityPresets;
    }
  }
  return null;
}
