// §PROCEDURAL-PATTERNS (L-1801/L-1802/L-1804) — the SHADING half.
//
// ⭐ THE SEPARATION THIS PACKAGE IS BUILT ON: a pattern is a LAYOUT (exact,
// parametric, in millimetres) and a material is a CHARACTER (grain, veining, colour
// variation). Herringbone laid in oak and herringbone laid in ceramic are one
// layout and two profiles. Keeping them apart is what made "herringbone tile" cost
// nothing, and it is the seam a photographic character map plugs into later:
// ⚠ this package deliberately does the PATTERN well and the CHARACTER plausibly.
// Photography beats a shader at wood grain and stone veining, and when the CC0
// library lands, `characterMap` is where it goes. Nothing here needs to change for
// that — which is the point of the split.

/** '#rrggbb' → [r, g, b] in 0..255. */
export function parseHex(hex: string): [number, number, number] {
  const h = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) {
    throw new RangeError(`parseHex: expected '#rrggbb', got '${hex}'`);
  }
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export interface SurfaceProfile {
  /** Face colour, '#rrggbb'. */
  readonly faceColor: string;
  /** Joint / grout colour, '#rrggbb'. */
  readonly jointColor: string;
  /** PBR roughness of the laid face, 0..1. */
  readonly faceRoughness: number;
  /** PBR roughness of the joint. Grout is nearly always rougher than the tile. */
  readonly jointRoughness: number;
  /**
   * Chamfer width at the piece edge, mm. ⭐ This is what makes a floor read as a
   * floor: a colour map with no edge relief reads as printed vinyl, whatever the
   * pattern. Ceramic bevels are ~1 mm; a sanded parquet edge is ~0.3 mm.
   */
  readonly bevelMm: number;
  /** How far the joint sits below the laid face, mm. */
  readonly jointDepthMm: number;
  /** Per-piece brightness jitter amplitude, 0..1. Real boards are not one colour. */
  readonly toneJitter: number;
  /** Per-piece warm/cool jitter amplitude, 0..1. */
  readonly hueJitter: number;
  /** Grain / mottle contrast, 0..1. */
  readonly grainStrength: number;
  /** Grain wavelength ALONG the piece axis, mm. Long for wood, short for stone. */
  readonly grainLongMm: number;
  /** Grain wavelength ACROSS the piece axis, mm. */
  readonly grainAcrossMm: number;
  /** Micro-relief the grain contributes to the height field, mm. */
  readonly grainReliefMm: number;
  /** Darkening in the joint's shadow, 0..1. */
  readonly edgeAoStrength: number;
  /** Extra dark latewood lines, wood only. 0 disables. */
  readonly latewoodStrength: number;
}

export const OAK: SurfaceProfile = {
  faceColor: '#c8a96e',
  jointColor: '#6b563a',
  faceRoughness: 0.55,
  jointRoughness: 0.75,
  bevelMm: 0.6,
  jointDepthMm: 0.4,
  toneJitter: 0.09,
  hueJitter: 0.05,
  grainStrength: 0.34,
  grainLongMm: 260,
  grainAcrossMm: 7,
  grainReliefMm: 0.05,
  edgeAoStrength: 0.4,
  latewoodStrength: 0.35,
};

export const WALNUT: SurfaceProfile = {
  ...OAK,
  faceColor: '#5a3a28',
  jointColor: '#2e1d14',
  faceRoughness: 0.5,
  toneJitter: 0.11,
  grainStrength: 0.3,
  grainAcrossMm: 9,
  latewoodStrength: 0.28,
};

export const ASH: SurfaceProfile = {
  ...OAK,
  faceColor: '#d9c9a4',
  jointColor: '#8a7a5c',
  faceRoughness: 0.58,
  toneJitter: 0.07,
  grainStrength: 0.26,
  latewoodStrength: 0.22,
};

export const SMOKED_OAK: SurfaceProfile = {
  ...OAK,
  faceColor: '#7a5c3e',
  jointColor: '#3d2c1c',
  toneJitter: 0.12,
  grainStrength: 0.38,
  latewoodStrength: 0.4,
};

/** A glazed ceramic / porcelain face. Grout is the loud part of a tile floor. */
export const PORCELAIN_WHITE: SurfaceProfile = {
  faceColor: '#eeece6',
  jointColor: '#b9b5ac',
  faceRoughness: 0.22,
  jointRoughness: 0.88,
  bevelMm: 1.0,
  jointDepthMm: 0.9,
  toneJitter: 0.012,
  hueJitter: 0.008,
  grainStrength: 0.05,
  grainLongMm: 90,
  grainAcrossMm: 90,
  grainReliefMm: 0.01,
  edgeAoStrength: 0.5,
  latewoodStrength: 0,
};

export const TERRACOTTA: SurfaceProfile = {
  ...PORCELAIN_WHITE,
  faceColor: '#b56a4a',
  jointColor: '#c9bda8',
  faceRoughness: 0.72,
  bevelMm: 1.6,
  toneJitter: 0.07,
  hueJitter: 0.03,
  grainStrength: 0.16,
  grainLongMm: 55,
  grainAcrossMm: 55,
  grainReliefMm: 0.05,
};

export const MARBLE_WHITE: SurfaceProfile = {
  ...PORCELAIN_WHITE,
  faceColor: '#e9e8e4',
  jointColor: '#cfcbc3',
  faceRoughness: 0.16,
  toneJitter: 0.02,
  grainStrength: 0.2,
  grainLongMm: 200,
  grainAcrossMm: 70,
  latewoodStrength: 0,
};

export const SLATE_DARK: SurfaceProfile = {
  ...PORCELAIN_WHITE,
  faceColor: '#3b3f42',
  jointColor: '#5a5e60',
  faceRoughness: 0.62,
  bevelMm: 1.2,
  toneJitter: 0.05,
  grainStrength: 0.18,
  grainLongMm: 120,
  grainAcrossMm: 40,
  grainReliefMm: 0.08,
};

export const CEMENT_GREY: SurfaceProfile = {
  ...PORCELAIN_WHITE,
  faceColor: '#b7b4ae',
  jointColor: '#8f8c86',
  faceRoughness: 0.68,
  bevelMm: 0.8,
  toneJitter: 0.03,
  grainStrength: 0.12,
  grainLongMm: 70,
  grainAcrossMm: 70,
  grainReliefMm: 0.03,
};
