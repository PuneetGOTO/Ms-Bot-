import type { AudioFilters, EffectPreset } from "./types";

const bassBoostEqualizer = [
  { band: 0, gain: 0.2 },
  { band: 1, gain: 0.18 },
  { band: 2, gain: 0.14 },
  { band: 3, gain: 0.08 }
] as const;

const trebleEqualizer = [
  { band: 10, gain: 0.14 },
  { band: 11, gain: 0.16 },
  { band: 12, gain: 0.18 },
  { band: 13, gain: 0.2 }
] as const;

/**
 * Maps user-facing audio effect presets to Lavalink filter payloads.
 */
export function filtersForPreset(preset: EffectPreset): AudioFilters {
  switch (preset) {
    case "off":
      return {};
    case "bassboost":
      return { equalizer: bassBoostEqualizer };
    case "treble":
      return { equalizer: trebleEqualizer };
    case "nightcore":
      return { timescale: { speed: 1.18, pitch: 1.18, rate: 1.0 } };
    case "vaporwave":
      return { timescale: { speed: 0.82, pitch: 0.82, rate: 1.0 } };
    case "karaoke":
      return { karaoke: { level: 1, monoLevel: 1, filterBand: 220, filterWidth: 100 } };
    case "rotation":
      return { rotation: { rotationHz: 0.16 } };
    case "echo":
      return {
        channelMix: { leftToLeft: 0.85, leftToRight: 0.15, rightToLeft: 0.15, rightToRight: 0.85 }
      };
    case "reverb":
      return { lowPass: { smoothing: 18.5 } };
  }
}
