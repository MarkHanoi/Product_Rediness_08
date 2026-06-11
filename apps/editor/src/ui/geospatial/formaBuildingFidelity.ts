/**
 * formaBuildingFidelity.ts — FORMA.6 pure helpers (SPEC-FORMA-SITE-VIEW.md §2/§10)
 *
 * The FORMA.6 feature renders the REAL, full-fidelity PRYZM building (the live BIM
 * THREE scene serialised to glTF) on the Forma flat-ground study view, replacing
 * the abstract pastel massing — "in Forma view the same as the 3D globe tiles view,
 * the building/elements coming from the PRYZM WebGPU scene" (founder).
 *
 * The Cesium-bound placement lives in `CesiumViewport.renderRealModelOnForma`; this
 * module holds the small PURE decisions it makes, extracted so they are unit-testable
 * WITHOUT a live Cesium viewer / WebGL context (mirrors `climateOverlayGeometry.ts`).
 *
 * No THREE, no Cesium, no DOM — pure functions only (P2/P5 clean).
 */

/** The two building-fidelity modes for the Forma study view. */
export type FormaBuildingFidelity = 'massing' | 'real';

/** Default fidelity — the founder explicitly chose FULL element fidelity. */
export const DEFAULT_FORMA_BUILDING_FIDELITY: FormaBuildingFidelity = 'real';

/**
 * Decide whether the monolithic real-model GLB should stay visible under the
 * current multi-floor visibility filter.
 *
 * The exported GLB is a SINGLE primitive (it carries no per-storey nodes that the
 * site view can slice), so a PARTIAL floor filter (some-but-not-all storeys) can't
 * be honoured by the model — in that case we hide it and fall back to the per-storey
 * massing (which IS sliceable). When the filter is "show all" (null / empty / covers
 * every storey) the real model is shown.
 *
 * @param visibleLevels the active 0-based storey filter, or null/[] = show all.
 * @param totalStoreys   the number of storey bands in the placed building.
 * @returns true → keep the real model visible; false → hide it (use the massing).
 */
export function realModelStaysVisible(
  visibleLevels: ReadonlyArray<number> | null | undefined,
  totalStoreys: number,
): boolean {
  if (!visibleLevels || visibleLevels.length === 0) return true;
  // A filter that names every storey is equivalent to "show all".
  if (totalStoreys > 0 && visibleLevels.length >= totalStoreys) return true;
  return false;
}

/**
 * A cheap, stable signature of the authored building's geometry, used to decide
 * whether the GLB must be RE-EXPORTED (geometry changed) or the already-placed model
 * can be reused (task #4 perf — don't re-serialise an unchanged scene on every
 * live-update re-place). Folds element counts + a coarse integer hash of the inputs;
 * any add/remove/move flips it. Pure + deterministic.
 */
export function buildingGeometrySignature(input: {
  walls: ReadonlyArray<{ a: { x: number; z: number }; b: { x: number; z: number }; height: number; thickness: number }>;
  openings: ReadonlyArray<{ a: { x: number; z: number }; height: number }>;
  slabCount: number;
  roofCount: number;
  stairCount: number;
  furnitureCount: number;
}): string {
  let h = 0;
  const mix = (n: number): void => {
    h = (Math.imul(h, 31) + (Number.isFinite(n) ? n | 0 : 0)) | 0;
  };
  for (const w of input.walls) {
    mix(w.a.x * 100); mix(w.a.z * 100); mix(w.b.x * 100); mix(w.b.z * 100);
    mix(w.height * 100); mix(w.thickness * 100);
  }
  for (const o of input.openings) {
    mix(o.a.x * 100); mix(o.a.z * 100); mix(o.height * 100);
  }
  return [
    input.walls.length,
    input.openings.length,
    input.slabCount,
    input.roofCount,
    input.stairCount,
    input.furnitureCount,
    h,
  ].join('|');
}
