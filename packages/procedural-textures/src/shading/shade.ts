// §PROCEDURAL-PATTERNS — turn a PieceField into a FULL PBR SET.
//
// ⭐ Colour alone is not a material. A parquet with an albedo map and no normal map
// reads as printed vinyl at every camera angle, because what the eye uses to say
// "that is a laid floor" is the chamfer highlight at every board edge — a normal-map
// feature, not a colour one. So this pass builds a HEIGHT field first and derives
// the normal from it, and emits roughness because grout is not as shiny as glaze.
//
// ⚠ The normal is derived by TOROIDAL central differences, so the relief wraps for
// the same reason the pattern does. A normal map computed with clamped edges is the
// classic way a "seamless" texture grows a visible ridge along one edge only.

import { fbm2D, rand01, randSigned } from '../core/rng.js';
import type { PieceField } from '../raster/PieceField.js';
import { parseHex, type SurfaceProfile } from './SurfaceProfile.js';

export interface TextureMap {
  readonly width: number;
  readonly height: number;
  /** RGBA8, length `width * height * 4`. */
  readonly data: Uint8ClampedArray;
}

export interface ShadedMaps {
  readonly albedo: TextureMap;
  readonly normal: TextureMap;
  readonly roughness: TextureMap;
  /** Fraction of pixels that are joint rather than laid face. */
  readonly jointCoverage: number;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

function makeMap(width: number, height: number): TextureMap {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

export function shadeField(field: PieceField, profile: SurfaceProfile, seed: number): ShadedMaps {
  const { width, height, pxPerMmX, pxPerMmY, pieceIndex, alongMm, acrossMm, edgeMm } = field;
  const n = width * height;
  const albedo = makeMap(width, height);
  const normal = makeMap(width, height);
  const roughness = makeMap(width, height);
  const heightMm = new Float32Array(n);

  const [fr, fg, fb] = parseHex(profile.faceColor);
  const [jr, jg, jb] = parseHex(profile.jointColor);
  // One pixel expressed in mm — the width over which a joint edge is resolved.
  const halfPxMm = 0.5 / Math.min(pxPerMmX, pxPerMmY);
  // ⭐ The joint fraction is an AREA, integrated from the sub-pixel coverage —
  // NOT a count of pixels whose centre landed in the gap. A 2 mm grout line on a
  // 2.35 mm pixel pitch can miss EVERY pixel centre, and a counting metric then
  // reports "this floor has no grout" about a floor that visibly has grout. The
  // integral of (1 − face) recovers the true width to within sampling noise.
  let jointArea = 0;

  for (let i = 0; i < n; i++) {
    const e = edgeMm[i] as number;
    const pi = pieceIndex[i] as number;
    // Sub-pixel joint coverage. 1 = fully laid face, 0 = fully joint.
    const face = clamp01(e / (2 * halfPxMm) + 0.5);
    jointArea += 1 - face;

    let r = jr;
    let g = jg;
    let b = jb;
    let rough = profile.jointRoughness;
    let h = -profile.jointDepthMm - profile.bevelMm * 0.15;

    if (pi >= 0) {
      // ── Per-piece variation. Seeded, order-independent (L-1804). ──
      const tone = 1 + profile.toneJitter * randSigned(seed, pi, 11);
      const warm = profile.hueJitter * randSigned(seed, pi, 23);
      const phase = rand01(seed, pi, 37) * 4096;

      // ── Grain / mottle. Piece-LOCAL coordinates, which is why it wraps: a piece
      //    split by the seam computes identical local coordinates in both halves. ──
      const u = (alongMm[i] as number) / profile.grainLongMm + phase;
      const v = (acrossMm[i] as number) / profile.grainAcrossMm + phase * 0.37;
      const grain = fbm2D(u, v, 64, 64, seed + pi * 7919, 4);
      let shade = 1 + profile.grainStrength * (grain - 0.5) * 2;
      if (profile.latewoodStrength > 0) {
        // Latewood: the dark, hard bands. A sharpened ridge of the same noise, so
        // the bands follow the grain instead of crossing it.
        const ridge = Math.abs(grain - 0.5) * 2;
        shade *= 1 - profile.latewoodStrength * Math.pow(1 - ridge, 6);
      }
      const k = tone * shade;
      r = fr * k * (1 + warm);
      g = fg * k;
      b = fb * k * (1 - warm);
      rough = profile.faceRoughness * (1 - 0.12 * (grain - 0.5) * 2);

      // ── Height: flat face, chamfer over `bevelMm`, plus grain micro-relief. ──
      const t = clamp01(e / Math.max(1e-6, profile.bevelMm));
      h = (t - 1) * (profile.jointDepthMm + profile.bevelMm * 0.5) + profile.grainReliefMm * (grain - 0.5) * 2;

      // ── Contact shadow in the joint. This is the cheap half of ambient occlusion
      //    and it does most of the work of making the joint read. ──
      const ao = 1 - profile.edgeAoStrength * (1 - clamp01(e / Math.max(1e-6, profile.bevelMm * 2.5)));
      r *= ao;
      g *= ao;
      b *= ao;
    }

    const o = i * 4;
    albedo.data[o] = r * face + jr * (1 - face);
    albedo.data[o + 1] = g * face + jg * (1 - face);
    albedo.data[o + 2] = b * face + jb * (1 - face);
    albedo.data[o + 3] = 255;

    const rr = clamp01(rough * face + profile.jointRoughness * (1 - face));
    roughness.data[o] = rr * 255;
    roughness.data[o + 1] = rr * 255;
    roughness.data[o + 2] = rr * 255;
    roughness.data[o + 3] = 255;

    heightMm[i] = h;
  }

  // ── Normals from the height field, toroidal central differences. ──
  const dxMm = 1 / pxPerMmX;
  const dyMm = 1 / pxPerMmY;
  for (let y = 0; y < height; y++) {
    const yUp = ((y + 1) % height) * width;
    const yDn = ((y - 1 + height) % height) * width;
    const yc = y * width;
    for (let x = 0; x < width; x++) {
      const xR = (x + 1) % width;
      const xL = (x - 1 + width) % width;
      const hL = heightMm[yc + xL] as number;
      const hR = heightMm[yc + xR] as number;
      const hD = heightMm[yDn + x] as number;
      const hU = heightMm[yUp + x] as number;
      const nx = -(hR - hL) / (2 * dxMm);
      const ny = -(hU - hD) / (2 * dyMm);
      const len = Math.hypot(nx, ny, 1);
      const o = (yc + x) * 4;
      // Tangent-space, OpenGL convention (+Y up) — what three.js expects.
      normal.data[o] = (nx / len) * 0.5 * 255 + 127.5;
      normal.data[o + 1] = (ny / len) * 0.5 * 255 + 127.5;
      normal.data[o + 2] = (1 / len) * 0.5 * 255 + 127.5;
      normal.data[o + 3] = 255;
    }
  }

  return { albedo, normal, roughness, jointCoverage: jointArea / n };
}
