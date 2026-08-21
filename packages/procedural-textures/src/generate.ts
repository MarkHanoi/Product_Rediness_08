// §PROCEDURAL-PATTERNS (L-1800) — the ONE entry point.
//
// ─── THE ARCHITECTURE DECISION, WRITTEN DOWN RATHER THAN DRIFTED INTO ──────────
// Three approaches were on the table for procedural pattern generation:
//   (a) CPU generation into a buffer, uploaded once as an ordinary texture;
//   (b) shader / material-node evaluation on the GPU;
//   (c) build-time generation, shipped as assets.
//
// ⭐ THIS PACKAGE IS (a), and the reason is not taste:
//
//  · (b) DOES NOT SURVIVE THIS REPO'S TWO BACKENDS. The editor runs BOTH WebGL and
//    WebGPU (the status bar reads `GPU: Auto | WebGPU | WebGL`), and a node-material
//    graph is not the same object on both. Worse, P2 confines `import * as THREE`
//    to `packages/renderer-three/`, so a GPU-side generator could not live in a
//    low-layer package at all — it would have to be written twice, inside the one
//    package that is already the repo's largest single-owner risk.
//  · (c) RE-INTRODUCES THE ASSET-HOSTING DEPENDENCY. C100 §10.6 names that as an
//    UNSOLVED blocker with no bucket, and §10.7 S28 is BLOCKED on it. The entire
//    value of doing pattern procedurally is that it does NOT wait for that bucket.
//    Choosing (c) would have handed the blocker straight back.
//  · (a) is asset-free, backend-agnostic, deterministic, generated ONCE per material
//    and cached, and costs nothing per frame. Its real weakness is honest and worth
//    stating: RESOLUTION IS BAKED, so a close-up can look soft. That is a texel
//    budget, not an architecture, and it is a knob (`resolution`).
//
// ⚠ And (a) is the option that COMPOSES with the photographic library later: a
// per-piece character map multiplies into the face colour here, it does not replace
// this file. The pattern stays exact; the character gets better.

import { rasterizeLayout, type PieceField } from './raster/PieceField.js';
import { shadeField, type TextureMap } from './shading/shade.js';
import type { SurfaceProfile } from './shading/SurfaceProfile.js';
import type { PatternLayout } from './core/Piece.js';
import { runningBondLayout, type RunningBondParams } from './layouts/runningBond.js';
import { herringboneLayout, type HerringboneParams } from './layouts/herringbone.js';
import { chevronLayout, type ChevronParams } from './layouts/chevron.js';
import { basketWeaveLayout, type BasketWeaveParams } from './layouts/basketWeave.js';
import { hexagonLayout, type HexagonParams } from './layouts/hexagon.js';
import { versaillesLayout, type VersaillesParams } from './layouts/versailles.js';

export type PatternSpec =
  | { readonly pattern: 'running-bond'; readonly params: RunningBondParams }
  | { readonly pattern: 'herringbone'; readonly params: HerringboneParams }
  | { readonly pattern: 'chevron'; readonly params: ChevronParams }
  | { readonly pattern: 'basket-weave'; readonly params: BasketWeaveParams }
  | { readonly pattern: 'hexagon'; readonly params: HexagonParams }
  | { readonly pattern: 'versailles'; readonly params: VersaillesParams };

/** A named, reproducible procedural material. Data only — no pixels until asked. */
export interface ProceduralTextureSpec {
  /** Stable generator id. THIS is what a material record references. */
  readonly id: string;
  readonly label: string;
  readonly family: 'parquet' | 'tile';
  readonly layout: PatternSpec;
  readonly surface: SurfaceProfile;
  /** ⛔ The ONLY source of randomness. `Math.random()` appears nowhere. */
  readonly seed: number;
  readonly defaultResolution?: number;
}

export interface GeneratedTextureSet {
  readonly id: string;
  readonly albedo: TextureMap;
  readonly normal: TextureMap;
  readonly roughness: TextureMap;
  /**
   * ⭐ The real-world size of ONE full texture tile, in metres.
   *
   * A map without this is wallpaper, not a material. A 700 mm herringbone repeat
   * stretched over a 6 m room shows staves 600 mm wide, and a wrongly-scaled parquet
   * looks worse than a flat colour — the eye knows how big a floorboard is. The
   * generator therefore DECLARES its size rather than leaving the consumer to guess,
   * and the consumer computes `repeat = surfaceExtentM / realWorldSizeM`.
   */
  readonly realWorldSizeM: { readonly x: number; readonly y: number };
  readonly patternPeriodMm: { readonly x: number; readonly y: number };
  readonly diagnostics: {
    readonly pieceCount: number;
    readonly faceCoverage: number;
    readonly jointCoverage: number;
    readonly overlapPx: number;
    readonly pxPerMm: number;
  };
}

export function buildLayout(spec: PatternSpec): PatternLayout {
  switch (spec.pattern) {
    case 'running-bond':
      return runningBondLayout(spec.params);
    case 'herringbone':
      return herringboneLayout(spec.params);
    case 'chevron':
      return chevronLayout(spec.params);
    case 'basket-weave':
      return basketWeaveLayout(spec.params);
    case 'hexagon':
      return hexagonLayout(spec.params);
    case 'versailles':
      return versaillesLayout(spec.params);
  }
}

/**
 * The real-world repeat of a spec, WITHOUT generating a single pixel.
 *
 * ⭐ A resolver has to fill `tiling.realWorldSizeM` on a material record long before
 * anything wants the bitmap — at catalogue load, in a schedule, in an exporter. If
 * the only way to learn the size were to rasterise, every one of those paths would
 * pay for pixels it never draws. The layout is pure arithmetic; this is the cheap door.
 */
export function proceduralRealWorldSizeM(spec: PatternSpec): { x: number; y: number } {
  const layout = buildLayout(spec);
  return { x: layout.cellWidthMm / 1000, y: layout.cellHeightMm / 1000 };
}

export function rasterizeSpec(spec: ProceduralTextureSpec, resolution?: number): PieceField {
  return rasterizeLayout(buildLayout(spec.layout), {
    resolution: resolution ?? spec.defaultResolution ?? 1024,
  });
}

export function generateProceduralTexture(
  spec: ProceduralTextureSpec,
  resolution?: number,
): GeneratedTextureSet {
  const layout = buildLayout(spec.layout);
  const res = resolution ?? spec.defaultResolution ?? 1024;
  const field = rasterizeLayout(layout, { resolution: res });
  const maps = shadeField(field, spec.surface, spec.seed);
  return {
    id: spec.id,
    albedo: maps.albedo,
    normal: maps.normal,
    roughness: maps.roughness,
    realWorldSizeM: { x: layout.cellWidthMm / 1000, y: layout.cellHeightMm / 1000 },
    patternPeriodMm: { x: layout.cellWidthMm, y: layout.cellHeightMm },
    diagnostics: {
      pieceCount: layout.pieces.length,
      faceCoverage: field.coveredPx / (field.width * field.height),
      jointCoverage: maps.jointCoverage,
      overlapPx: field.overlapPx,
      pxPerMm: field.pxPerMmX,
    },
  };
}
