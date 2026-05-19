// LODManager — Wave A18-T14
// Distance-based Level-of-Detail for scene-committer.
//
// CONTRACT (C04 §4-LOD): The scene MUST provide ≥ 3 distance tiers:
//   Tier 0: full detail   — camera distance < 100 m
//   Tier 1: simplified    — 100 m ≤ distance < 500 m
//   Tier 2: bounding box  — distance ≥ 500 m
//
// Used by CommitterHost.commit() to decide which geometry representation
// to hand to a PrimitiveCommitter.  Wave A18 initial implementation uses
// distance alone; Wave A19+ may add screen-coverage heuristics.
//
// P2: this module imports NOTHING from 'three'; all geometry decisions
// are delegated to the PrimitiveCommitter that owns the THREE objects.

import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('pryzm.scene-committer.lod');

export type LODTier = 0 | 1 | 2;

export interface LODThresholds {
  /** Upper distance (metres) for Tier 0 (full detail). Default: 100 */
  tier0MaxDistance: number;
  /** Upper distance (metres) for Tier 1 (simplified). Default: 500 */
  tier1MaxDistance: number;
}

const DEFAULT_THRESHOLDS: LODThresholds = {
  tier0MaxDistance: 100,
  tier1MaxDistance: 500,
};

/**
 * LODManager — stateless utility that maps camera-to-object distance to a LOD tier.
 *
 * Usage:
 * ```ts
 * const lod = new LODManager();
 * const tier = lod.computeLOD(distanceMetres); // 0 | 1 | 2
 * if (tier === 2) return; // skip — bounding-box-only at this distance
 * ```
 */
export class LODManager {
  private readonly thresholds: Readonly<LODThresholds>;

  constructor(thresholds: Partial<LODThresholds> = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  /**
   * computeLOD — maps camera-to-element distance to a LOD tier.
   *
   * @param distance  Camera-to-element centroid distance in metres (≥ 0).
   * @returns         0 = full detail · 1 = simplified · 2 = bounding-box / culled
   */
  computeLOD(distance: number): LODTier {
    const span = tracer.startSpan('pryzm.scene-committer.lod.compute');
    try {
      if (distance < this.thresholds.tier0MaxDistance) return 0;
      if (distance < this.thresholds.tier1MaxDistance) return 1;
      return 2;
    } finally {
      span.end();
    }
  }

  /**
   * shouldSkip — convenience predicate: true when the element is beyond the
   * tier-2 threshold and MUST be culled from the render call entirely.
   *
   * Wave A18: tier-2 objects are still submitted to the committer as a bounding
   * box; the committer decides whether to render them at all.  This helper lets
   * callers opt into hard-cull for very large scenes (> 500 k elements) where
   * bounding-box rendering still exceeds the 60 FPS budget.
   */
  shouldSkip(distance: number, hardCullDistance: number = 1_000): boolean {
    return distance >= hardCullDistance;
  }

  get tierThresholds(): Readonly<LODThresholds> {
    return this.thresholds;
  }
}
