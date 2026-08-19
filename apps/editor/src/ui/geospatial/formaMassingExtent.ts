/**
 * §FIX-FORMA-MASSING-FOOTPRINT-IS-PARCEL (L-1204) + §FIX-FORMA-HEIGHT-SPHERE-IS-NOT-A-HEIGHT
 * (L-1205) — the two PURE decisions that fix the extent of the Forma / 3D-Site massing:
 * **how WIDE it is** (which ring is extruded) and **how TALL it is** (which signal sets the
 * full building height).
 *
 * THE DEFECT, in one sentence: on a founder project with **7 authored levels topping out at
 * 20.9 m**, the 3D Site drew **14 storeys of a 42.4 m tower over the PARCEL RING** — a
 * building twice as tall as the model, the size of the land it stands on, capped by an
 * opaque near-white plate that the founder reported as a broken roof.
 *
 * Both halves were the SAME KIND of error — an unknown or unrelated quantity substituted for
 * a known one, then drawn as if measured:
 *
 *   · WIDTH. `renderFormaMassing` branched `if (footprint) {…parcel…} else {…wall-loop…}`,
 *     where `footprint` is the **drawn parcel boundary**. Because the onboarding flow is
 *     *location → DRAW THE SITE BOUNDARY → generate*, the parcel is present in the NORMAL
 *     case, so the wall-loop branch was effectively dead and the massing silhouette was the
 *     PLOT. `renderFacadeAnalysis` had already been corrected for exactly this (its comment
 *     calls parcel-first "catastrophically wrong", L-272 / §FORMA-FACADE-FOOTPRINT-FIX); the
 *     massing renderer twenty lines away kept the defect. This module states the ONE
 *     precedence both surfaces use, so they cannot drift apart again.
 *
 *   · HEIGHT. `resolveFullBuildingHeight` MAX-ed the authored signals with the placed GLB's
 *     **bounding-SPHERE diameter**. A sphere radius is `√(planHalfDiagonal² + halfHeight²)`,
 *     so on any building wider than it is tall the number reports the DIAGONAL, not the
 *     height. That leg is deleted, not re-approximated: Cesium's `Model` exposes no
 *     local-frame bounding box, so the model's vertical extent is genuinely UNKNOWN at that
 *     seam, and an unknown height must not be drawn as a known one. If the authored geometry
 *     says 20.9 m, we draw 20.9 m.
 *
 * Pure + framework-free (no Cesium, no THREE, no DOM) so both decisions are assertable —
 * `CesiumViewport` cannot be collected under the unit config (cesium at module scope), which
 * is the same reason `formaOpeningsDetermination.ts` and `facadeStudySubject.ts` live here.
 */

// ---------------------------------------------------------------------------
// WIDTH — which ring is extruded
// ---------------------------------------------------------------------------

/** Where a storey band's extrusion outline came from, most-reliable first. */
export type MassingRingSource =
  /** The band's exterior wall loop — the building's own silhouette. Preferred. */
  | 'wall-loop'
  /** The storey's floor-plate outer ring — equals the shell footprint on generated buildings. */
  | 'floor-slab'
  /** ⚠ The DRAWN PARCEL ring. The plot, not the building — a last-ditch placeholder. */
  | 'parcel-boundary'
  /** Nothing usable — the caller falls back to per-wall boxes. */
  | 'per-wall-boxes';

export interface MassingRingDecision {
  readonly source: MassingRingSource;
  /**
   * TRUE only for `'parcel-boundary'`. The rendered silhouette is then the SITE, not the
   * building, and the caller must say so rather than presenting it as the building's shape.
   */
  readonly isPlotNotBuilding: boolean;
}

/**
 * Decide which ring a storey band is extruded over.
 *
 * ⭐ THE PRECEDENCE IS THE WHOLE POINT. The building's own geometry ALWAYS wins over the
 * parcel; the parcel is reachable only when the building has no ring at all (a massing-only
 * preview with no authored walls and no floor plate). Inverting these two is the L-1204
 * defect, and it is the second time this exact inversion has been found in this file.
 */
export function decideMassingRing(input: {
  readonly hasWallLoopRing: boolean;
  readonly hasFloorSlabRing: boolean;
  readonly hasParcelRing: boolean;
}): MassingRingDecision {
  if (input.hasWallLoopRing) return { source: 'wall-loop', isPlotNotBuilding: false };
  if (input.hasFloorSlabRing) return { source: 'floor-slab', isPlotNotBuilding: false };
  if (input.hasParcelRing) return { source: 'parcel-boundary', isPlotNotBuilding: true };
  return { source: 'per-wall-boxes', isPlotNotBuilding: false };
}

// ---------------------------------------------------------------------------
// HEIGHT — which signal sets the full building height
// ---------------------------------------------------------------------------

/** The signal that produced the resolved full building height. */
export type FullHeightSource =
  | 'authored storey bands'
  | 'caller override (fullBuildingHeightM)'
  | 'slab topElevation'
  | 'roof top';

export interface FullHeightDecision {
  readonly heightM: number;
  /** Which signal won. Printed, so a surprising height is attributable, never re-theorised. */
  readonly source: FullHeightSource;
  /** The tallest AUTHORED storey band top — the height the model actually contains. */
  readonly authoredTopM: number;
}

/**
 * Resolve the full building height as the MAX over the AUTHORED signals only.
 *
 * ⛔ There is deliberately no "placed model" argument. See the module header: the GLB's
 * bounding-sphere diameter was the fifth source and it measured the building's diagonal.
 * Do not reintroduce a geometric upper bound as a height — add a real vertical extent or
 * add nothing.
 */
export function resolveFullBuildingHeightM(input: {
  readonly bands: ReadonlyArray<{ baseElevation?: number; heightM?: number }>;
  readonly fullBuildingHeightM?: number;
  readonly slabs?: ReadonlyArray<{ topElevation?: number }>;
  readonly roofs?: ReadonlyArray<{ baseElevation?: number; thickness?: number }>;
}): FullHeightDecision {
  let authoredTopM = 0;
  for (const b of input.bands) {
    const top = (b.baseElevation || 0) + (b.heightM || 0);
    if (top > authoredTopM) authoredTopM = top;
  }

  let heightM = authoredTopM;
  let source: FullHeightSource = 'authored storey bands';
  const bump = (h: number | undefined, why: FullHeightSource): void => {
    if (typeof h === 'number' && Number.isFinite(h) && h > heightM) {
      heightM = h;
      source = why;
    }
  };

  bump(input.fullBuildingHeightM, 'caller override (fullBuildingHeightM)');
  for (const s of input.slabs ?? []) bump(s.topElevation || 0, 'slab topElevation');
  for (const r of input.roofs ?? []) bump((r.baseElevation || 0) + (r.thickness || 0), 'roof top');

  return { heightM: heightM > 0 ? heightM : authoredTopM, source, authoredTopM };
}

/**
 * §FIX-FORMA-HEIGHT-SPHERE-IS-NOT-A-HEIGHT (L-1205) — the bounding-sphere leg, preserved as
 * an executable statement of WHY it was removed rather than as a comment nobody can run.
 *
 * Returns the height the deleted leg WOULD have reported for a model of the given plan
 * extent and true height. The test asserts that for the founder's building it returns ~42 m
 * for a 20.9 m tower — i.e. that the leg was not merely imprecise but structurally incapable
 * of measuring a height. If someone proposes reinstating it, run this.
 */
export function boundingSphereDiameterAsHeight(input: {
  readonly planWidthM: number;
  readonly planDepthM: number;
  readonly trueHeightM: number;
}): number {
  const halfDiagonal = Math.hypot(input.planWidthM / 2, input.planDepthM / 2);
  const radius = Math.hypot(halfDiagonal, input.trueHeightM / 2);
  return radius * 2;
}
