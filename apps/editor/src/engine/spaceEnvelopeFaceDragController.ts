/**
 * spaceEnvelopeFaceDragController — THE THREE/WebGPU ENTRY POINT for the face-drag gesture.
 * §FEAT-SPACE-ENVELOPE (L-12900) · §ENVELOPE-DRAG-PORTS (L-13045) · C114 §10 ·
 * ADR-0380 D4 · C16 §8.6 · C83 §1.2 · P2 · P6 · C84 EI-9.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ THE FOUNDER'S §2.4, AT THE POINTER: grab ONE face, it moves along ITS OWN
 *    perpendicular, the connected faces adapt, and a move that would destroy the
 *    solid REFUSES with both numbers instead of clamping.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ─── WHAT THIS FILE IS, SINCE §ENVELOPE-DRAG-PORTS ──────────────────────────────
 * It is the wiring, and nothing else. The GESTURE lives once, renderer-free, in
 * `spaceEnvelopeDragSurface.ts`; the THREE-specific half — the raycaster, the screen→NDC
 * arithmetic, the pick set and the camera-controls hook — lives in
 * `spaceEnvelopeDragSurfaceThree.ts`. This function builds the second and hands it to the
 * first, so `attachSpaceEnvelopeRender` and every existing test keep calling exactly what
 * they called before.
 *
 * ⭐ WHY THE SPLIT HAPPENED BEFORE ANY SECOND SURFACE, AND NOT AFTER. The same gesture is
 * wanted on the 3-D Site (Cesium) and the 2-D Site map (MapLibre). This controller was 474
 * lines and touched THREE on SIX of them; copy-porting it twice would have minted THREE
 * implementations of ONE gesture — with three copies of the `maximumBuildable` refusal,
 * three copies of the 1e-3 m no-op rule and three copies of the undo economy — to move six
 * lines. That is the C84 EI-9 hazard this repo has paid for repeatedly, and it is invisible
 * once it happens, because each copy passes its own tests. Extraction first; adapters after.
 *
 * ⛔ THE PREVIEW IS NOT A COMMIT AND MUST NEVER BECOME ONE (P6), exactly ONE
 * `spaceEnvelope.moveFace` is dispatched per gesture, a drag that ended where it started
 * dispatches nothing, and `role: 'maximumBuildable'` is refused by name — all of it is
 * stated and enforced in `spaceEnvelopeDragSurface.ts`, which is the file to read for the
 * behaviour. Nothing in this one decides anything.
 *
 * ─── WHY THIS IS NOT `TransformControls` (still true, and still the reason) ──────
 * The gizmo in `initTransformControllers.ts` translates an OBJECT along a WORLD axis and is
 * exactly right for a door, a column or a whole envelope. It cannot express this gesture:
 *
 *   1. Its subject is an `Object3D`, so its finest granularity is "the envelope". This
 *      gesture's subject is ONE FACE of `n + 2`, which is why `SpaceEnvelopeMeshBuilder`
 *      draws the prism as per-face meshes carrying `userData.spaceEnvelopeFace` — the
 *      solver's own `SpaceEnvelopeFaceRef`.
 *   2. Its axes are X / Y / Z. A side face's axis is the OUTWARD NORMAL OF ITS RING EDGE,
 *      which for a non-orthogonal storey outline is neither. Dragging such a wall along
 *      world-X would SKEW the footprint rather than offset that wall — and the result would
 *      still look plausible, which is the class of defect that survives review.
 */

import {
    installSpaceEnvelopeFaceDragOnSurface,
    type SpaceEnvelopeFaceDragCoreDeps,
} from './spaceEnvelopeDragSurface';
import {
    createThreeSpaceEnvelopeDragSurface,
    type ThreeSpaceEnvelopeDragSurfaceDeps,
} from './spaceEnvelopeDragSurfaceThree';

// ⭐ RE-EXPORTED, NOT RE-DECLARED. Both were defined here before the split and both are
// imported from here by `attachSpaceEnvelopeRender` and the specs; a second declaration
// would be a second shape to keep in step (C84 EI-9).
export {
    contextEntryOfDraggable,
    type DraggableSpaceEnvelope,
} from './spaceEnvelopeDragSurface';

/**
 * The THREE-facing dependency bag. UNCHANGED across §ENVELOPE-DRAG-PORTS — it is the union
 * of what the adapter needs (canvas, camera, builder, gizmo, camera-controls hook) and what
 * the gesture needs (the store reads, the dispatch, the optional callbacks), which is
 * exactly what it always was.
 */
export interface SpaceEnvelopeFaceDragDeps
    extends ThreeSpaceEnvelopeDragSurfaceDeps,
        Omit<SpaceEnvelopeFaceDragCoreDeps, 'surface'> {}

/**
 * Install the face-drag interaction on the THREE/WebGPU viewport. Returns a disposer — call
 * it on teardown, or the listeners outlive the scene and the next runtime gets two of them.
 *
 * A non-THREE surface does NOT call this. It builds its own `SpaceEnvelopeDragSurface` and
 * calls `installSpaceEnvelopeFaceDragOnSurface` directly — which is the whole point of the
 * split, and the reason a site adapter is ~150–250 lines instead of a fork.
 */
export function installSpaceEnvelopeFaceDrag(deps: SpaceEnvelopeFaceDragDeps): () => void {
    return installSpaceEnvelopeFaceDragOnSurface({
        domElement: deps.domElement,
        surface: createThreeSpaceEnvelopeDragSurface(deps),
        getRecord: deps.getRecord,
        dispatch: deps.dispatch,
        ...(deps.onRefusal ? { onRefusal: deps.onRefusal } : {}),
        ...(deps.onPreview ? { onPreview: deps.onPreview } : {}),
        ...(deps.getWorld ? { getWorld: deps.getWorld } : {}),
        ...(deps.onProfileEdit ? { onProfileEdit: deps.onProfileEdit } : {}),
    });
}
