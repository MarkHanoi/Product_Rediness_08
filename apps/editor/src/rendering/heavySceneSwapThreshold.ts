/**
 * @file apps/editor/src/rendering/heavySceneSwapThreshold.ts
 *
 * §MESH110 (L-11564) — THE ONE OWNER of the heavy-scene backend-swap thresholds.
 *
 * The auto WebGPU→WebGL swap (`autoWebGLHeavyScene.ts`, ADR-0267 §Fix-1 / L-366)
 * fires when the live scene crosses EITHER arm:
 *
 *   • ≥ {@link SWAP_ELEMENT_THRESHOLD} top-level BIM elements — a whole building is
 *     several hundred+ elements; a single room / manual edit is < ~100, so trivial
 *     edits never trip it.
 *   • ≥ {@link SWAP_MESH_THRESHOLD} scene meshes — building geometry explodes to
 *     > 1000 sub-meshes (openings, finishes, frames) well before it reaches 400
 *     counted top-level roots, so this arm catches heavy scenes whose geometry
 *     arrives with sparse top-level userData ids (the resi/office path).
 *
 * WHY A LEAF MODULE WITH ZERO IMPORTS (L-11564): these numbers used to exist TWICE —
 * as `SWAP_*_THRESHOLD` inside `autoWebGLHeavyScene.ts` (the guard) and as a
 * hand-copied `HEAVY_SCENE_*_ARM` pair inside `pryzmPerfConsole.ts` (the census's
 * §NAV-BACKEND-SWAP-HEADROOM line). The census could not import the guard because
 * `autoWebGLHeavyScene` pulls in the renderer-creation graph via `createRenderer`,
 * and a DIAGNOSTIC must not change what it measures — so the copy was tolerated and
 * tracked as debt. This module is the resolution: it imports NOTHING, so both the
 * guard and the console read the SAME constants and a threshold change is one edit.
 *
 * ⛔ Deliberately DECOUPLED from `LevelScoped3DCullingService.isHeavyModel` (the
 * massing-LOD gate, ≥ 15 levels AND ≥ 1000 elems, OR ≥ 4000 elems): the swap must
 * fire far EARLIER — a normal ~6-storey / ~1,300-element / ~1,645-mesh generation
 * reliably TDRs the WebGPU device yet never trips isHeavyModel (L-361). C04 §1.4
 * names `isSwapWorthyHeavyScene` (in `autoWebGLHeavyScene.ts`, reading these
 * constants) as THE swap predicate.
 *
 * ⛔ THE FIX FOR CROSSING THESE ARMS IS FEWER MESHES PER ELEMENT, NOT A HIGHER
 * THRESHOLD (§NAV-BACKEND-SWAP-HEADROOM, L-11563/L-11567): the founder crossed the
 * mesh arm with ONE DOOR (978→1005 sceneMeshes) and the backend swapped MID-EDIT.
 * Raising the numbers moves the cliff; it does not remove it.
 */

/** ≥ this many top-level BIM element roots → the scene is backend-swap-worthy. */
export const SWAP_ELEMENT_THRESHOLD = 400;

/** ≥ this many scene meshes → the scene is backend-swap-worthy. */
export const SWAP_MESH_THRESHOLD = 1000;
