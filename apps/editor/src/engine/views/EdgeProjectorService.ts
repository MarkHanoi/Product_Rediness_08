/**
 * EdgeProjectorService — DOC-1.3
 *
 * Wraps OBC EdgeProjector to produce TechnicalDrawing instances from both
 * IFC Fragment models and PRYZM native element mesh groups.
 *
 * Contract compliance:
 *   §01 §5  — No THREE.js objects stored in any PRYZM store; returned
 *              TechnicalDrawing is owned and cached by the caller (DOC-1.5).
 *   §02 §1.2 — Level elevation and height always resolved from BimManager on every call;
 *               never cached inside this service.
 *   §02 §4.3 — Native mesh groups are cleared (geometry released) after projection.
 *   §05      — Pure service; no DOM, no BIM-UI components.
 */

import * as OBC from '@thatopen/components';
import * as THREE from '@pryzm/renderer-three/three';
import { getFrameScheduler } from '@pryzm/frame-scheduler';
import { mergeGeometries } from '@pryzm/renderer-three';
// A-1: DrawingSelectionIndex — per-element UUID tagging for plan-view hitTest
import { registerSegmentUUID } from '@pryzm/core-app-model';
// Contract 23 §9 — HLR pass: remove occluded projection segments before cache write
// §FEAT-REVIT-LINE-TYPE-SEMANTICS (L-277) / C09 §4.6.5 — ONE occlusion engine for plan,
// section AND elevation. `VIEW_DEPTH_KEY` is the userData key this projector stamps with each
// element's nearest depth along the view direction so the engine can order occluders.
import { applyOcclusion, VIEW_DEPTH_KEY } from '@pryzm/core-app-model';
// §FIX-PLAN-PROJECT-INCREMENTAL (L-65) — P8 span for the incremental graft path.
import { emitPlanViewMotionEvent } from '@pryzm/core-app-model';
import type * as FRAGS from '@thatopen/fragments';
import { ViewDefinition, VIEW_PROJECTION_DIRECTIONS } from '@pryzm/core-app-model';
// §FIX-ELEVATION-POCHE (L-119) — unified per-view-type drawing scope. An
// elevation has cut:false → emit :proj/:beyond ONLY (no :cut → no black poché).
import { resolveViewScope } from '@pryzm/core-app-model';
import { BimManager } from '@pryzm/core-app-model';
// Wave 11 / Stage S7 — per-IFC-type visibility veto.
import { resolveBoundIntentWithInheritance } from '@pryzm/core-app-model';
import {
    isElementTypeFullyHidden,
    normaliseIfcUserDataType,
} from '@pryzm/core-app-model/presentation';
// DOC-2.5a: door swing arc injection
import { doorPlanSymbolBuilder } from '@pryzm/geometry-door';
import { sofaPlanSymbolBuilder } from '@pryzm/geometry-furniture';
import { bedPlanSymbolBuilder } from '@pryzm/geometry-furniture';
// §36-KITCHEN-CABINET-ELEMENT-CONTRACT — kitchens use the same symbol-injection
// pattern as wardrobes/sofas/beds.  KitchenCabinetEngine tags meshes with
// skipInPlan so the dense panel/door/handle dump is suppressed in plan view,
// and this builder injects the clean architectural footprint instead.
import { kitchenPlanSymbolBuilder } from '@pryzm/geometry-furniture';
import { wardrobePlanSymbolBuilder } from '@pryzm/geometry-furniture';

import { chairPlanSymbolBuilder } from '@pryzm/geometry-furniture';

import { treePlanSymbolBuilder } from '@pryzm/geometry-furniture';

// DOC-2.5c: stair walking line / arrow / break line injection
import { stairSymbolTechnicalDrawingBridge } from '@pryzm/geometry-stair';
// DOC-2.5f: roof slope arrow injection for plan views
import { RoofSlopeSymbolBuilder } from '@pryzm/geometry-roof';
// DOC-2.5g: column crosshair center marks for plan views
import { columnPlanSymbolBuilder } from '@pryzm/geometry-column';
// Phase 6: window frame symbol injection for plan-view selection
import { windowPlanSymbolBuilder } from '@pryzm/geometry-window';
// §FIX-PLAN-LAYERED-WALL-SYMBOL (L-62) — internal layer-boundary lines for LAYERED walls in
// plan (the wall's OUTER footprint is already projected; this adds the core+finish lines).
import { wallLayerPlanSymbolBuilder } from '@pryzm/geometry-wall';
// §FEAT-PLUMBING-PLAN-ELEV-SYMBOLS (L-221) — plumbing fixtures (toilet/sink/bath/shower/
// bidet/urinal/accessory) carry `skipInPlan`+`skipInElevation` on their meshes so the dense
// LOD400 edge-dump is suppressed in the 2D views; these builders inject the clean AEC symbol
// (plan footprint + elevation silhouette/profile) onto A-PLMB with UUID registration.
import { plumbingPlanSymbolBuilder, plumbingElevationSymbolBuilder } from '@pryzm/geometry-plumbing';
import { annotationStore } from '@pryzm/plugin-annotations';

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Default AEC cut height above floor — 1 200 mm (standard door/window cut).
 * DOC-1.5d: nearOffset is metres FROM THE LEVEL FLOOR ELEVATION (not below the cut plane).
 */
const DEFAULT_NEAR_OFFSET = 1.2;

/**
 * §EPS-VERBOSE (OI-054 (a) perf, 2026-05-24) — master gate for the per-mesh /
 * per-element projection diagnostics (§DIAG-EPS-01..04, §PERF-CACHE-HIT/MISS).
 *
 * These were temporarily wired to fire for EVERY edge mesh whenever ANY curtain
 * wall is present (`_hasCWElements`). With N curtain walls × ~25 parts × M views
 * that is THOUSANDS of `console.log` calls inside the hot projection loop — a real
 * perf hit (console I/O + DevTools rendering) and the log "storm" the architect saw.
 * Default OFF. Genuine slow-op alerts (>2 ms edge alloc, >5 ms toDrawingSpace) and
 * the once-per-projection summaries (§PERF-CACHE-STATS, §PERF-EDGEPROJECTOR-CHUNK)
 * are KEPT regardless so real regressions still surface. Flip to `true` (or wire to
 * a debug query param) when profiling edge projection.
 */
const EPS_VERBOSE = false;

/**
 * DOC-1.13 — Projection layer names per ISO 13567.
 *
 * Maps each native-element userData.elementType to the DXF layer name used
 * in the TechnicalDrawing.  The layer must be created on the drawing before
 * calling addProjectionLines() — otherwise OBC logs a warning and falls back
 * to layer "0".  Any element type not in this map falls back to the generic
 * 'projection-visible' layer so nothing is silently dropped.
 *
 * Keep in sync with CATEGORY_TO_DXF_LAYER in VGSceneApplicator.ts.
 */
const ELEMENT_TYPE_TO_PROJECTION_LAYER: Readonly<Record<string, string>> = {
    // Walls
    Wall: 'A-WALL', WallPart: 'A-WALL', LayeredWall: 'A-WALL',
    WallLayer: 'A-WALL', WallEdges: 'A-WALL',
    CurtainWall: 'A-WALL',
    // Slabs / Floors
    Slab: 'A-FLOR', SlabPart: 'A-FLOR', SlabLayer: 'A-FLOR', SlabEdges: 'A-FLOR',
    floor: 'A-FLOR', Floor: 'A-FLOR', FloorPart: 'A-FLOR',
    ceiling: 'A-CEIL', Ceiling: 'A-CEIL', CeilingPart: 'A-CEIL',
    // Columns & Beams
    Column: 'A-COLS', Beam: 'A-BEAM',
    // Doors
    Door: 'A-DOOR', DoorFrame: 'A-DOOR', DoorLeaf: 'A-DOOR', DoorPanel: 'A-DOOR',
    door: 'A-DOOR', 'door-part': 'A-DOOR',
    // Glazing (Windows + Curtain Panels)
    Window: 'A-GLAZ', WindowFrame: 'A-GLAZ', WindowGlass: 'A-GLAZ',
    window: 'A-GLAZ', 'window-part': 'A-GLAZ',
    CurtainPanel: 'A-GLAZ', CurtainPanelFill: 'A-GLAZ',
    // Stairs & Handrails
    Stair: 'A-STRS', StairMesh: 'A-STRS', StairStep: 'A-STRS',
    StairLanding: 'A-STRS', stairs: 'A-STRS', Handrail: 'A-STRS',
    HandrailPart: 'A-STRS', 'stair-railing': 'A-STRS', stairRailing: 'A-STRS',
    // Roofs
    Roof: 'A-ROOF', RoofMesh: 'A-ROOF', RoofPart: 'A-ROOF',
    // Furniture (generic / FFE)
    Furniture: 'A-FURN', FurniturePart: 'A-FURN', GenericComponent: 'A-FURN',
    KitchenCabinetPart: 'A-FURN', KitchenCabinetUnit: 'A-FURN',
    KitchenCountertop: 'A-FURN', kitchen_unit: 'A-FURN',
    // Plumbing / MEP fixtures
    PlumbingFixture: 'A-PLMB',
} as const;

/** Layer name used for element types not covered by ELEMENT_TYPE_TO_PROJECTION_LAYER. */
const FALLBACK_NATIVE_LAYER = 'projection-visible';

/**
 * §FIX-PLAN-WALL-LAYER-CASE (L-275) — RESOLVE THE ISO LAYER BY *CANONICAL* ELEMENT TYPE.
 *
 * ## The bug this kills, and it was a good one
 *
 * The founder: *"ONLY when I placed a door does the wall render as it should."* Two
 * screenshots, same wall, same view: **no door → a hollow outline; door → a properly
 * filled poché.** He isolated the variable himself, and his own log corroborated it:
 *
 *     no door :  1 edge geometries across 1 ISO layer(s)     applied= 6/14 layers
 *     door    :  9 edge geometries across 2 ISO layer(s)     applied=12/14 layers
 *
 * The `:cut` layer never materialised for a plain wall. **Why:** `ELEMENT_TYPE_TO_PROJECTION_LAYER`
 * keys walls as `Wall` / `WallPart` / `LayeredWall` / `WallLayer` / `WallEdges` /
 * `CurtainWall` — every one CAPITALISED — while it keys floors, ceilings, doors and
 * windows in lowercase (`floor`, `ceiling`, `door`, `window`). **The map mixes two naming
 * conventions.** A plain wall mesh stamps `elementType = 'wall'` (his log:
 * `§DIAG-EPS-01 … elemType=wall`), which matches NOTHING, so it fell through to
 * `FALLBACK_NATIVE_LAYER` (`projection-visible`) — outside `A-WALL`, outside the pen
 * table, and outside the cut gate. **No `A-WALL` ⇒ no cut section ⇒ no poché.**
 *
 * Place a door and the wall is rebuilt through the opening/CSG path, which stamps a
 * CAPITALISED type. It lands on `A-WALL`, the cut section builds, and the wall fills.
 * **That is exactly the two images.**
 *
 * ## Why this is a normaliser and not one more alias
 *
 * Adding `wall: 'A-WALL'` would have fixed the screenshot and LEFT THE LANDMINE ARMED
 * for the next element type someone stamps in the other convention. This is the THIRD
 * time a layer-stamp mismatch has silently dropped geometry out of the pen table
 * (L-257: layered walls drawn on layer 0; L-261: opening-hosting wall layers with no
 * `elementType` at all). **A map that is case- and separator-sensitive is a bug
 * generator, so the LOOKUP is fixed, not the map.**
 *
 * `wall`, `Wall`, `WALL`, `wall-part`, `WallPart` and `wall_part` now all resolve to
 * `A-WALL`. The canonical key is lowercase with `-`/`_`/spaces stripped.
 *
 * Collisions are impossible by construction: every key in the source map canonicalises
 * uniquely (verified by the guard in `planWallLayerCase.test.ts`, which fails if a
 * future edit introduces two keys that collapse onto one canonical form).
 */
function _canonicalTypeKey(elementType: string): string {
    return elementType.toLowerCase().replace(/[-_\s]/g, '');
}

/** Canonical-key index built once from the authoring map above. */
const _CANONICAL_TYPE_TO_LAYER: ReadonlyMap<string, string> = (() => {
    const m = new Map<string, string>();
    for (const [type, layer] of Object.entries(ELEMENT_TYPE_TO_PROJECTION_LAYER)) {
        m.set(_canonicalTypeKey(type), layer);
    }
    return m;
})();

/**
 * The ONE way to resolve an element type to its ISO projection layer.
 *
 * Exported for the guard test — a projection layer that silently falls back to
 * `projection-visible` is how geometry disappears from the pen table, the cut gate and
 * the poché, all at once and with no error.
 */
export function resolveProjectionLayer(elementType: string | undefined): string {
    if (!elementType) return FALLBACK_NATIVE_LAYER;
    return _CANONICAL_TYPE_TO_LAYER.get(_canonicalTypeKey(elementType)) ?? FALLBACK_NATIVE_LAYER;
}

/**
 * §FEAT-WALL-POCHE-FILL-BY-INTENT (L-261) — one CUT-zone section of ONE solid mesh,
 * carrying the construction-layer identity of the mesh it was cut from.
 *
 * A layered wall is built as N separate layer meshes (WallFragmentBuilder /
 * LayeredWallOpeningBuilder, each stamped `layerIndex` / `layerFunction` /
 * `layerName` from the wall's STORED `layers` array). Cutting each mesh at the view
 * plane therefore yields, for free, the N closed regions of the wall's build-up —
 * one ring per layer, tiling the wall body, voided at every opening BY CONSTRUCTION
 * (L-246). The ONLY thing that was missing is that the identity of each ring was
 * being thrown away at the merge, so the poché pass could not tone them apart.
 *
 * `pocheLayer` is that identity, and it is the ONLY thing the renderer needs: the
 * COLOUR is still resolved from the view intent (C09/P7) for (wall × cut); the layer
 * function merely spreads that one colour into the grey-scale (see
 * `resolveWallLayerPocheFill` in the pen/graphics table). L-127 dimensional truth:
 * regions and tones derive from the wall's real stored layers — never a literal.
 */
/**
 * One cached drawing-space projection emission.
 *
 * §FEAT-WALL-POCHE-FILL-BY-INTENT (L-261) — the cache used to be keyed by layer name
 * alone (`Map<layerName, BufferGeometry>`). A layered wall now emits ONE `:cut`
 * LineSegments PER CONSTRUCTION LAYER, so several emissions share a target layer
 * name: keyed by name, the last ring would evict its siblings and a cache HIT would
 * draw a DIFFERENT wall from a cache MISS (fewer poché regions). The key is now the
 * emission; the layer name and the poché identity travel in the value, so a replayed
 * element is byte-identical to a freshly projected one.
 */
interface CachedProjectionLayer {
    readonly layerName: string;
    readonly geo: THREE.BufferGeometry;
    readonly userData?: Readonly<Record<string, unknown>>;
}

interface CutSectionPart {
    readonly geo: THREE.BufferGeometry;
    readonly pocheLayer?: {
        readonly layerIndex: number;
        readonly layerFunction?: string;
        readonly layerName?: string;
    };
}

/**
 * The construction-layer identity of a mesh, read from the userData every layered-wall
 * builder already stamps. Returns undefined for a plain (single-volume) solid — which
 * is exactly the "ONE uniform fill" case.
 */
function readMeshPocheLayer(mesh: THREE.Mesh): CutSectionPart['pocheLayer'] | undefined {
    const ud = mesh.userData ?? {};
    const idx = typeof ud.layerIndex === 'number'
        ? ud.layerIndex as number
        : (Array.isArray(ud.layerIndices) && typeof ud.layerIndices[0] === 'number'
            ? ud.layerIndices[0] as number     // §PERF-PHASE2 same-colour merged layers
            : undefined);
    if (idx === undefined) return undefined;
    return {
        layerIndex: idx,
        layerFunction: typeof ud.layerFunction === 'string' ? ud.layerFunction as string : undefined,
        layerName: typeof ud.layerName === 'string' ? ud.layerName as string : undefined,
    };
}

// ── §C.6 — Pre-interned layer sublayer name strings ──────────────────────────
//
// Replaces `${layerName}:cut` / `:proj` / `:beyond` template literals in the
// hot projection path.  All known ISO 13567 layer names (plus the fallback)
// are pre-populated at module load so no string allocation occurs for
// well-known layer types during projection.
//
// For unknown (third-party plugin) layer names the helpers fall back to a
// live Map insertion, keeping allocations bounded to first-use per new name.
const _LAYER_CUT_NAME    = new Map<string, string>();
const _LAYER_PROJ_NAME   = new Map<string, string>();
const _LAYER_BEYOND_NAME = new Map<string, string>();

/**
 * §FEAT-POCHE-ALL-SOLIDS (L-261 residual, ADR-121 §5.2(3)) — WHICH ELEMENTS CAN THE
 * PLAN CUT PLANE PASS *THROUGH*?
 *
 * Poché shipped WALL-ONLY: the cut-section gate read `layerName === 'A-WALL'`, so a
 * COLUMN or a STAIR standing squarely in the 1.2 m cut plane still drew as a HOLLOW
 * OUTLINE next to a properly filled wall. That is not a missing feature — it is the
 * SOLIDITY RULE (C09 §4.6) applied to one element type and no other, which is the
 * exact habit ADR-121 was written to name: *PRYZM's documentation layer is built for
 * ONE case and never carried across.*
 *
 * THE RULE, RESTATED: an element is a SOLID. A view either CUTS it (→ heavy outline +
 * poché fill) or PROJECTS it. **GEOMETRY decides which — not a layer name.** So this
 * is deliberately a set of SOLID ELEMENT LAYERS, not a whitelist of the ones we
 * happened to fix. A layer-name whitelist that names only walls IS the bug.
 *
 * Widening the gate is SAFE BY CONSTRUCTION: `buildPlanCutSectionGeometry()` returns
 * `null` when the mesh does not intersect the plane, so an element that is BELOW the
 * cut (a ground slab) or ABOVE it (a ceiling beam) contributes nothing and costs one
 * bbox rejection. A mezzanine slab that genuinely crosses the plane, on the other
 * hand, IS cut — and should be poché'd. That is the rule doing its job.
 *
 * EXCLUDED, AND WHY — these are NOT "solids we forgot":
 *   A-DOOR / A-GLAZ  a door/window in the cut plane is drawn as a SYMBOL (swing arc,
 *                    frame profile), and the wall's own cut section already carries
 *                    the VOID at the opening by construction (L-246). Poché-ing the
 *                    leaf would fill the hole the opening exists to make.
 *   A-FURN / A-PLMB  furniture and fittings are symbols in plan, never poché.
 *   A-CEIL           above the cut plane by definition; it is a reflected-ceiling
 *                    concept, not a cut one.
 */
const CUT_ELIGIBLE_PLAN_LAYERS: ReadonlySet<string> = new Set([
    'A-WALL',  // walls + curtain walls (shipped in L-261)
    'A-COLS',  // a column in the cut plane is as cut as a wall is
    'A-STRS',  // a stair flight crossing the plane is cut — Revit draws it cut + break-line
    'A-BEAM',  // usually above the plane (→ null, free); cut when it genuinely crosses
    'A-FLOR',  // ground slabs sit below (→ null); a MEZZANINE slab crossing IS cut
    'A-ROOF',  // a roof crossing the cut plane (a low eaves, a dormer cheek) is cut
]);

(function _preinternLayerNames() {
    const known = [
        'A-WALL', 'A-FLOR', 'A-CEIL', 'A-COLS', 'A-BEAM',
        'A-DOOR', 'A-GLAZ', 'A-STRS', 'A-ROOF', 'A-FURN',
        'A-PLMB', 'projection-visible',
    ];
    for (const ln of known) {
        _LAYER_CUT_NAME.set(ln,    `${ln}:cut`);
        _LAYER_PROJ_NAME.set(ln,   `${ln}:proj`);
        _LAYER_BEYOND_NAME.set(ln, `${ln}:beyond`);
    }
})();

function _layerCut(ln: string): string {
    let v = _LAYER_CUT_NAME.get(ln);
    if (!v) { v = `${ln}:cut`;    _LAYER_CUT_NAME.set(ln, v); }
    return v;
}
function _layerProj(ln: string): string {
    let v = _LAYER_PROJ_NAME.get(ln);
    if (!v) { v = `${ln}:proj`;   _LAYER_PROJ_NAME.set(ln, v); }
    return v;
}
function _layerBeyond(ln: string): string {
    let v = _LAYER_BEYOND_NAME.get(ln);
    if (!v) { v = `${ln}:beyond`; _LAYER_BEYOND_NAME.set(ln, v); }
    return v;
}

// ── §C.5 — Float32Array pool for EdgeProjectorService geometry builders ───────
//
// Reduces GC pressure from the ~52 typed-array allocations per CW element
// (2,080 per 40-element batch) in the EPS hot path.
//
// Size-bucketed pool with a max of 32 arrays per bucket.  Arrays are released
// back to the pool via a `dispose` event listener on each BufferGeometry;
// they are NOT released manually — the geometry owns the array until disposed.
//
// Thread safety: EPS runs on the main thread only; no locking needed.
class Float32Pool {
    private readonly _buckets = new Map<number, Float32Array[]>();

    acquire(size: number): Float32Array {
        const bucket = this._buckets.get(size);
        return bucket?.pop() ?? new Float32Array(size);
    }

    release(arr: Float32Array): void {
        const size = arr.length;
        let bucket = this._buckets.get(size);
        if (!bucket) { bucket = []; this._buckets.set(size, bucket); }
        if (bucket.length < 32) bucket.push(arr);
    }

    /** Debug helper — returns count of pooled arrays per size. */
    get debugBucketSizes(): Record<number, number> {
        const out: Record<number, number> = {};
        this._buckets.forEach((arr, size) => { out[size] = arr.length; });
        return out;
    }
}

/** §C.5 — Module-level pool shared across all classifyByVertexY / makeGeoFromPositions calls. */
export const edgeFloat32Pool = new Float32Pool();

/**
 * DOC-4.2 — Vertex Y tolerance (metres) used when classifying edge segments
 * as "cut" (intersected by the section plane) vs. "projection" (above it).
 * 15 cm is generous enough to capture wall top/bottom edge artefacts while
 * remaining smaller than standard storey heights.
 */
const CUT_LINE_EPSILON = 0.15;

const DEFAULT_SECTION_PROJECTION_DEPTH = 12.0;
const TRIANGLE_PLANE_EPSILON = 1e-5;

function _openingControlPointToDrawingHV(
    drawing: OBC.TechnicalDrawing,
    point: THREE.Vector3,
): { h: number; v: number } | null {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([
        point.x, point.y, point.z,
        point.x, point.y + 0.01, point.z,
    ], 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial());
    lines.updateWorldMatrix(true, false);
    try {
        const projected = OBC.TechnicalDrawing.toDrawingSpace(lines, drawing);
        const pos = projected.geometry?.getAttribute('position') as THREE.BufferAttribute | undefined;
        if (!pos || pos.count < 1) return null;
        return { h: pos.getX(0), v: -pos.getZ(0) };
    } finally {
        geo.dispose();
        (lines.material as THREE.Material).dispose();
    }
}

/**
 * Plan-view door/window opening line suppressor — DOC-PLAN-OPENING-CLIP
 *
 * In plan view the wall outline geometry (BoxGeometry spanning the full wall length)
 * produces along-wall edge lines that cross through door and window openings.
 * This function clips those lines at the opening boundaries so that only the
 * portions outside the openings are drawn — producing the correct AEC plan-view
 * representation where wall lines stop cleanly at door/window jambs.
 *
 * Algorithm:
 *   1. Resolve each opening's along-wall extent [alongMin, alongMax] from
 *      group.userData.openings (offset ± width/2 in metres from wall start).
 *      Only openings whose world-Y range intersects the cut plane are included.
 *   2. For each projected line segment, classify it as "along-wall" (parallel to
 *      the wall direction) vs "cross-wall" (perpendicular, i.e. jamb lines).
 *   3. Along-wall segments are clipped — portions falling within an opening zone
 *      are removed; the remaining pieces are kept.
 *   4. Cross-wall segments (jamb lines, wall ends) are kept intact.
 *
 * Called only for plan-view A-WALL layers (both :cut and :proj).
 * Does NOT affect section or elevation views.
 */
export function _suppressPlanViewOpeningLines(
    projected: THREE.LineSegments,
    _drawing: OBC.TechnicalDrawing,
    group: THREE.Group,
    cutPlaneY: number,
): void {
    const openings = group.userData?.openings as Array<{
        offset?: number;
        width?: number;
        sillHeight?: number;
        height?: number;
    }> | undefined;
    const baseLine = group.userData?.baseLine as Array<{ x: number; y?: number; z: number }> | undefined;
    if (!openings?.length || !Array.isArray(baseLine) || baseLine.length < 2) return;

    const posAttr = projected.geometry?.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!posAttr || posAttr.count < 2) return;

    const startPt = new THREE.Vector3(baseLine[0].x, baseLine[0].y ?? 0, baseLine[0].z);
    const endPt   = new THREE.Vector3(baseLine[1].x, baseLine[1].y ?? startPt.y, baseLine[1].z);
    const wallDir = new THREE.Vector3().subVectors(endPt, startPt);
    wallDir.y = 0;
    if (wallDir.lengthSq() < 1e-8) return;
    wallDir.normalize();

    // World Y of the wall's bottom face.
    // baseLine[0].y carries the level elevation in world space (already absolute).
    // rootWorldY is a legacy key that may not be set; fall back to startPt.y.
    const wallBaseY =
        (Number(group.userData?.rootWorldY) || startPt.y) +
        (Number(group.userData?.baseOffset) || 0);

    // Build opening zones — only for openings whose height range contains cutPlaneY.
    // Stored as [alongMin, alongMax] metres from wall start along wallDir.
    const zones: Array<{ min: number; max: number }> = [];
    for (const op of openings) {
        const width  = Number(op.width);
        const offset = Number(op.offset);
        const sill   = Number(op.sillHeight) || 0;
        const height = Number(op.height);
        if (!Number.isFinite(width)  || !Number.isFinite(offset) ||
            !Number.isFinite(height) || width <= 0 || height <= 0) continue;

        const worldBottom = wallBaseY + sill;
        const worldTop    = wallBaseY + sill + height;
        // The cut plane must be strictly inside the opening (with 5 cm tolerance).
        if (cutPlaneY <= worldBottom + 0.05 || cutPlaneY >= worldTop - 0.05) continue;

        // §OPENING-OFFSET-LEFTEDGE-UNIFY (2026-06-24): offset is the LEFT EDGE;
        // span = [offset, offset+width].
        zones.push({ min: offset, max: offset + width });
    }
    if (zones.length === 0) return;

    // After OBC.TechnicalDrawing.toDrawingSpace() the position attribute contains
    // world XZ coordinates (Y is flattened to 0):
    //   posAttr.getX(i) = worldX
    //   posAttr.getZ(i) = worldZ
    const getAlong = (wx: number, wz: number): number =>
        (wx - startPt.x) * wallDir.x + (wz - startPt.z) * wallDir.z;

    const getPerpSq = (wx: number, wz: number, wx2: number, wz2: number): number => {
        // Squared perpendicular-to-wall span between two drawing-space points.
        const perpX = -wallDir.z;
        const perpZ =  wallDir.x;
        const dp = (wx2 - wx) * perpX + (wz2 - wz) * perpZ;
        return dp * dp;
    };

    // §FIX-PLAN-DOOR-JAMB-SEAM (2026-07-02) — DETECT_TOL is used only to DECIDE
    // whether an along-wall line crosses an opening (a small over-reach so a
    // projection-float sliver just inside the opening is still recognised and
    // removed). The kept remainder, however, is reconstructed to terminate at the
    // TRUE void edge (zone.min / zone.max, = offset / offset+width per C15 §2), NOT
    // at zone.min − TOL. Previously the kept wall line stopped 35 mm SHORT of the
    // jamb, so it did not close onto the door/window frame-cut tick (which sits on
    // the void edge) — the reported "wall lines don't meet the frame" plan gap.
    // INVARIANT: wall face line terminus === opening void edge === frame jamb tick.
    const DETECT_TOL = 0.035;  // 35 mm — opening-crossing detection over-reach only
    const MIN_SEG = 0.008;     // discard sub-8mm output fragments

    const kept: number[] = [];

    for (let i = 0; i + 1 < posAttr.count; i += 2) {
        const x0 = posAttr.getX(i),     y0 = posAttr.getY(i),     z0 = posAttr.getZ(i);
        const x1 = posAttr.getX(i + 1), y1 = posAttr.getY(i + 1), z1 = posAttr.getZ(i + 1);

        const a0 = getAlong(x0, z0);
        const a1 = getAlong(x1, z1);
        const alongSpan = Math.abs(a1 - a0);

        // Cross-wall discrimination: the segment is "along-wall" only if its projection
        // onto the wall direction is significantly longer than its cross-wall extent.
        const perpSq    = getPerpSq(x0, z0, x1, z1);
        const alongSqSq = alongSpan * alongSpan;

        // Keep cross-wall segments (jamb lines, wall ends) unchanged.
        // Threshold: along-span must be > 2× perpendicular span AND > 5 cm minimum length.
        const isAlongWall = alongSpan > 0.05 && alongSqSq > perpSq * 4.0;

        if (!isAlongWall) {
            kept.push(x0, y0, z0, x1, y1, z1);
            continue;
        }

        // Clip this along-wall segment against all opening zones.
        const segMin = Math.min(a0, a1);
        const segMax = Math.max(a0, a1);

        let intervals: Array<[number, number]> = [[segMin, segMax]];

        for (const zone of zones) {
            // Detection boundary (over-reaches by DETECT_TOL so slivers just inside
            // the opening are still recognised as crossing).
            const detMin = zone.min - DETECT_TOL;
            const detMax = zone.max + DETECT_TOL;
            // §FIX-PLAN-DOOR-JAMB-SEAM: the kept remainder terminates at the TRUE
            // void edge (zone.min / zone.max) so the wall face line closes exactly
            // onto the frame jamb tick — no 35 mm short-fall.
            const cutMin = zone.min;
            const cutMax = zone.max;
            const next: Array<[number, number]> = [];
            for (const [lo, hi] of intervals) {
                if (hi <= detMin || lo >= detMax) {
                    next.push([lo, hi]);              // Entirely outside zone — keep
                } else {
                    if (lo < cutMin) next.push([lo, Math.max(lo, cutMin)]); // Left remainder → void edge
                    if (hi > cutMax) next.push([Math.min(hi, cutMax), hi]); // Right remainder → void edge
                    // Portion [cutMin..cutMax] is within the opening — suppressed
                }
            }
            intervals = next;
            if (intervals.length === 0) break;
        }

        if (intervals.length === 0) continue; // Whole segment suppressed

        // Reconstruct geometry: linearly interpolate each kept interval back to 3-D.
        const totalAlong = a1 - a0; // signed; used for t-parameterisation
        for (const [lo, hi] of intervals) {
            if (hi - lo < MIN_SEG) continue;

            let t0: number, t1: number;
            if (Math.abs(totalAlong) > 1e-6) {
                t0 = (lo - a0) / totalAlong;
                t1 = (hi - a0) / totalAlong;
                if (t0 > t1) [t0, t1] = [t1, t0];
            } else {
                t0 = 0; t1 = 1;
            }
            t0 = Math.max(0, Math.min(1, t0));
            t1 = Math.max(0, Math.min(1, t1));

            kept.push(
                x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0, z0 + (z1 - z0) * t0,
                x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1, z0 + (z1 - z0) * t1,
            );
        }
    }

    if (kept.length >= posAttr.count * 3) return; // Nothing changed — avoid realloc
    projected.geometry.dispose();
    projected.geometry = new THREE.BufferGeometry();
    projected.geometry.setAttribute('position', new THREE.Float32BufferAttribute(kept, 3));
}

function _suppressWallOpeningSeams(
    projected: THREE.LineSegments,
    drawing: OBC.TechnicalDrawing,
    group: THREE.Group,
): void {
    const openings = group.userData?.openings as Array<{
        offset?: number;
        width?: number;
        sillHeight?: number;
        height?: number;
    }> | undefined;
    const baseLine = group.userData?.baseLine as Array<{ x: number; y?: number; z: number }> | undefined;
    if (!openings?.length || !Array.isArray(baseLine) || baseLine.length < 2) return;

    const posAttr = projected.geometry?.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!posAttr || posAttr.count < 2) return;

    const start = new THREE.Vector3(baseLine[0].x, baseLine[0].y ?? 0, baseLine[0].z);
    const end = new THREE.Vector3(baseLine[1].x, baseLine[1].y ?? start.y, baseLine[1].z);
    const dir = end.clone().sub(start);
    dir.y = 0;
    if (dir.lengthSq() < 1e-8) return;
    dir.normalize();

    const wallBaseY = (Number(group.userData?.rootWorldY) || 0) + (Number(group.userData?.baseOffset) || 0);
    const seamWindows: Array<{ h: number; hMin: number; hMax: number; low: number; high: number }> = [];
    const seamRows: Array<{ v: number; left: number; right: number }> = [];
    const wallThickness = Number(group.userData?.thickness);
    const halfThickness = Number.isFinite(wallThickness) && wallThickness > 0 ? wallThickness / 2 : 0;
    const hTol = Math.max(0.06, Math.min(0.18, halfThickness + 0.035));
    const vTol = 0.035;
    const wallHeight = Number(group.userData?.height);
    const wallNormal = new THREE.Vector3(-dir.z, 0, dir.x).normalize();

    for (const op of openings) {
        const width = Number(op.width);
        const offset = Number(op.offset);
        const height = Number(op.height);
        if (!Number.isFinite(width) || !Number.isFinite(offset) || !Number.isFinite(height) || width <= 0 || height <= 0) continue;

        const sill = Number(op.sillHeight) || 0;
        const head = sill + height;
        // §OPENING-OFFSET-LEFTEDGE-UNIFY: offset is the LEFT EDGE; span = [offset, offset+width].
        const leftBase = start.clone().addScaledVector(dir, offset);
        const rightBase = start.clone().addScaledVector(dir, offset + width);
        const leftSillPt = new THREE.Vector3(leftBase.x, wallBaseY + sill, leftBase.z);
        const rightSillPt = new THREE.Vector3(rightBase.x, wallBaseY + sill, rightBase.z);
        const leftHeadPt = new THREE.Vector3(leftBase.x, wallBaseY + head, leftBase.z);
        const rightHeadPt = new THREE.Vector3(rightBase.x, wallBaseY + head, rightBase.z);
        const leftSillHV = _openingControlPointToDrawingHV(drawing, leftSillPt);
        const rightSillHV = _openingControlPointToDrawingHV(drawing, rightSillPt);
        const leftHeadHV = _openingControlPointToDrawingHV(drawing, leftHeadPt);
        const rightHeadHV = _openingControlPointToDrawingHV(drawing, rightHeadPt);

        if (leftHeadHV && rightHeadHV && (!Number.isFinite(wallHeight) || head < wallHeight - vTol)) {
            seamRows.push({
                v: (leftHeadHV.v + rightHeadHV.v) / 2,
                left: Math.min(leftHeadHV.h, rightHeadHV.h),
                right: Math.max(leftHeadHV.h, rightHeadHV.h),
            });
        }

        if (sill > vTol && leftSillHV && rightSillHV) {
            seamRows.push({
                v: (leftSillHV.v + rightSillHV.v) / 2,
                left: Math.min(leftSillHV.h, rightSillHV.h),
                right: Math.max(leftSillHV.h, rightSillHV.h),
            });
        }

        // §OPENING-OFFSET-LEFTEDGE-UNIFY: offset is the LEFT EDGE; jambs at offset and offset+width.
        for (const edgeOffset of [offset, offset + width]) {
            const base = start.clone().addScaledVector(dir, edgeOffset);
            const sillPt = new THREE.Vector3(base.x, wallBaseY + sill, base.z);
            const headPt = new THREE.Vector3(base.x, wallBaseY + head, base.z);
            const sillHV = _openingControlPointToDrawingHV(drawing, sillPt);
            const headHV = _openingControlPointToDrawingHV(drawing, headPt);
            if (!sillHV || !headHV) continue;
            const hSamples = [sillHV.h, headHV.h];
            if (halfThickness > 0) {
                for (const side of [-1, 1]) {
                    const sideOffset = wallNormal.clone().multiplyScalar(side * halfThickness);
                    const sideSillHV = _openingControlPointToDrawingHV(drawing, sillPt.clone().add(sideOffset));
                    const sideHeadHV = _openingControlPointToDrawingHV(drawing, headPt.clone().add(sideOffset));
                    if (sideSillHV) hSamples.push(sideSillHV.h);
                    if (sideHeadHV) hSamples.push(sideHeadHV.h);
                }
            }
            const hMin = Math.min(...hSamples);
            const hMax = Math.max(...hSamples);
            seamWindows.push({
                h: (sillHV.h + headHV.h) / 2,
                hMin,
                hMax,
                low: Math.min(sillHV.v, headHV.v),
                high: Math.max(sillHV.v, headHV.v),
            });
        }
    }

    if (seamWindows.length === 0 && seamRows.length === 0) return;

    const kept: number[] = [];
    for (let i = 0; i + 1 < posAttr.count; i += 2) {
        const h0 = posAttr.getX(i);
        const h1 = posAttr.getX(i + 1);
        const v0 = -posAttr.getZ(i);
        const v1 = -posAttr.getZ(i + 1);
        const isVertical = Math.abs(h0 - h1) <= hTol;
        const isHorizontal = Math.abs(v0 - v1) <= vTol;
        const low = Math.min(v0, v1);
        const high = Math.max(v0, v1);
        let suppress = false;

        if (isVertical) {
            const h = (h0 + h1) / 2;
            suppress = seamWindows.some((win) => {
                if (h < win.hMin - hTol || h > win.hMax + hTol) return false;
                const containedInOpening = low >= win.low - vTol && high <= win.high + vTol;
                return !containedInOpening;
            });
        }

        if (!suppress && isHorizontal) {
            const v = (v0 + v1) / 2;
            const left = Math.min(h0, h1);
            const right = Math.max(h0, h1);
            const matchingRows = seamRows.filter((row) => Math.abs(v - row.v) <= vTol);
            if (matchingRows.length > 0) {
                const containedInOpening = matchingRows.some((row) => (
                    left >= row.left - hTol && right <= row.right + hTol
                ));
                suppress = !containedInOpening;
            }
        }

        if (!suppress) {
            kept.push(
                posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i),
                posAttr.getX(i + 1), posAttr.getY(i + 1), posAttr.getZ(i + 1),
            );
        }
    }

    if (kept.length === posAttr.count * 3) return;
    projected.geometry.dispose();
    projected.geometry = new THREE.BufferGeometry();
    projected.geometry.setAttribute('position', new THREE.Float32BufferAttribute(kept, 3));
}

/**
 * DOC-4.2 — Splits a THREE.BufferGeometry (LineSegments, world-space Y) into
 * two geometries: segments whose vertices straddle the cut plane elevation, and
 * segments that lie entirely above it (projection lines).
 *
 * @param srcGeo     World-space EdgesGeometry with baked matrixWorld.
 * @param cutPlaneY  World-space Y elevation of the section cut plane.
 * @param epsilon    Tolerance in metres (default: CUT_LINE_EPSILON).
 */
export function classifyByVertexY(
    srcGeo:     THREE.BufferGeometry,
    cutPlaneY:  number,
    floorY:     number | null = null,
    epsilon:    number = CUT_LINE_EPSILON,
    belowY:     number | null = null,
): { cutGeo: THREE.BufferGeometry | null; projGeo: THREE.BufferGeometry | null; beyondGeo: THREE.BufferGeometry | null } {
    const posAttr = srcGeo.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!posAttr) return { cutGeo: null, projGeo: null, beyondGeo: null };

    const count           = posAttr.count;
    const cutPositions    : number[] = [];
    const projPositions   : number[] = [];
    const beyondPositions : number[] = [];

    for (let i = 0; i + 1 < count; i += 2) {
        const y0 = posAttr.getY(i);
        const y1 = posAttr.getY(i + 1);
        const avgY = (y0 + y1) / 2;
        const isCut =
            Math.abs(y0 - cutPlaneY) <= epsilon ||
            Math.abs(y1 - cutPlaneY) <= epsilon;
        // A segment whose average Y sits below the level floor is storey-below
        // reference linework. It belongs on the :beyond layer ONLY when an active
        // beyond zone exists (belowY = floorY − belowLevelDepth). §VIEW-RANGE-BELOW
        // (founder 2026-06-11, ADR/ViewRangeIntentResolver contract): when the active
        // VISIBILITY INTENT's `belowLevelDepth = 0` the renderer receives belowY=null
        // (no beyond zone) → the storey below must NOT be shown, so DROP those edges
        // instead of mis-tagging every below-floor segment as :beyond (the prior bug:
        // `isBeyond = avgY < floorY` had no lower bound, so belowLevelDepth=0 still
        // leaked the whole storey below as ghost linework). When belowY is set the
        // beyond zone is [belowY, floorY) — segments below belowY are also dropped, so
        // the depth value is honoured rather than reaching the hardcoded `near − 2.5`.
        const belowFloor = floorY !== null && !isCut && avgY < floorY - epsilon;
        const isBeyond = belowFloor && belowY !== null && avgY >= belowY - epsilon;
        if (belowFloor && !isBeyond) continue;   // storey below, outside the beyond zone → suppress
        const target = isCut ? cutPositions : isBeyond ? beyondPositions : projPositions;
        target.push(
            posAttr.getX(i), y0, posAttr.getZ(i),
            posAttr.getX(i + 1), y1, posAttr.getZ(i + 1),
        );
    }

    const makeGeo = (positions: number[]): THREE.BufferGeometry | null => {
        if (positions.length === 0) return null;
        const arr = edgeFloat32Pool.acquire(positions.length);
        arr.set(positions);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
        geo.addEventListener('dispose', () => edgeFloat32Pool.release(arr));
        return geo;
    };

    return { cutGeo: makeGeo(cutPositions), projGeo: makeGeo(projPositions), beyondGeo: makeGeo(beyondPositions) };
}

function makeGeoFromPositions(positions: number[]): THREE.BufferGeometry | null {
    if (positions.length === 0) return null;
    const arr = edgeFloat32Pool.acquire(positions.length);
    arr.set(positions);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    geo.addEventListener('dispose', () => edgeFloat32Pool.release(arr));
    return geo;
}

function concatLineGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
    const positions: number[] = [];
    for (const geo of geos) {
        const posAttr = geo.getAttribute('position') as THREE.BufferAttribute | undefined;
        if (!posAttr) continue;
        for (let i = 0; i < posAttr.count; i++) {
            positions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
        }
    }
    return makeGeoFromPositions(positions);
}

function resolveSectionDepthPlane(
    viewDef: ViewDefinition,
    projectionDirection: THREE.Vector3,
): { normal: THREE.Vector3; constant: number } {
    if (viewDef.spatial.sectionPlane?.normal) {
        return {
            normal: new THREE.Vector3(
                viewDef.spatial.sectionPlane.normal[0],
                viewDef.spatial.sectionPlane.normal[1],
                viewDef.spatial.sectionPlane.normal[2],
            ).normalize(),
            constant: viewDef.spatial.sectionPlane.constant,
        };
    }

    const linkedAnn = annotationStore.getAll().find(ann =>
        (ann.type === 'elevation-mark' || ann.type === 'section-mark') &&
        ann.parameters.linkedViewId === viewDef.id
    );
    const anchor = linkedAnn?.geometry2D.modelPoints?.[0];
    if (anchor) {
        const rawDir = linkedAnn.type === 'elevation-mark'
            ? ((linkedAnn.parameters.facingDirection as { x?: number; z?: number } | undefined) ?? {
                x: projectionDirection.x,
                z: projectionDirection.z,
            })
            : ((linkedAnn.parameters.tailDirection as { x?: number; z?: number } | undefined) ?? {
                x: projectionDirection.x,
                z: projectionDirection.z,
            });
        const normal = new THREE.Vector3(rawDir.x ?? 0, 0, rawDir.z ?? 0);
        if (normal.lengthSq() > 1e-8) {
            normal.normalize();
            return {
                normal,
                constant: -(normal.x * anchor.x + normal.z * anchor.z),
            };
        }
    }

    return {
        normal: projectionDirection.clone().normalize(),
        constant: 0,
    };
}

function resolveSectionVolumeBox(
    viewDef: ViewDefinition,
    projectionDirection: THREE.Vector3,
    farClipDepth: number,
    bimManager?: BimManager,
): SectionVolumeBox | null {
    if (viewDef.viewType !== 'section' && viewDef.viewType !== 'elevation') return null;
    const explicit = viewDef.spatial.sectionVolume;
    if (explicit) {
        const origin = new THREE.Vector3(explicit.origin[0], explicit.origin[1], explicit.origin[2]);
        const forward = new THREE.Vector3(explicit.direction[0], 0, explicit.direction[2]);
        if (forward.lengthSq() <= 1e-8) forward.copy(projectionDirection).setY(0);
        if (forward.lengthSq() <= 1e-8) forward.set(0, 0, -1);
        forward.normalize();
        const right = new THREE.Vector3(-forward.z, 0, forward.x).normalize();
        const width = Math.max(0.01, Number(explicit.width) || 0.01);
        const height = Math.max(0.01, Number(explicit.height) || 0.01);
        const near = Math.max(0, Number(explicit.near) || 0);
        const far = Math.max(near, Number(explicit.far) || farClipDepth);
        return {
            origin,
            direction: forward.clone(),
            right,
            forward,
            width,
            height,
            near,
            far,
            minRight: -width / 2,
            maxRight: width / 2,
            minDepth: near,
            maxDepth: far,
            minY: origin.y,
            maxY: origin.y + height,
        };
    }

    const linkedAnn = annotationStore.getAll().find(ann =>
        (ann.type === 'elevation-mark' || ann.type === 'section-mark') &&
        ann.parameters.linkedViewId === viewDef.id
    );
    if (!linkedAnn) return null;

    const cropMinY = viewDef.crop?.region?.min?.[1];
    const cropMaxY = viewDef.crop?.region?.max?.[1];
    const boundsMinY = viewDef.spatial.boundingBox?.min?.[1];
    const boundsMaxY = viewDef.spatial.boundingBox?.max?.[1];
    const level = viewDef.spatial.levelId && bimManager ? bimManager.getLevelById(viewDef.spatial.levelId) : undefined;
    const levelMinY = level?.elevation;
    const levelMaxY = level ? level.elevation + (level.height ?? DEFAULT_FAR_OFFSET) : undefined;
    let minY = Number.isFinite(cropMinY) ? cropMinY! : Number.isFinite(boundsMinY) ? boundsMinY! : Number.isFinite(levelMinY) ? levelMinY! : -Infinity;
    let maxY = Number.isFinite(cropMaxY) ? cropMaxY! : Number.isFinite(boundsMaxY) ? boundsMaxY! : Number.isFinite(levelMaxY) ? levelMaxY! : Infinity;
    if (minY > maxY) [minY, maxY] = [maxY, minY];

    const fallbackForward = projectionDirection.clone().setY(0);
    if (fallbackForward.lengthSq() <= 1e-8) fallbackForward.set(0, 0, -1);
    fallbackForward.normalize();

    if (linkedAnn.type === 'section-mark') {
        const pts = linkedAnn.geometry2D.modelPoints;
        if (!pts || pts.length < 2) return null;
        const a = new THREE.Vector3(pts[0].x, 0, pts[0].z);
        const b = new THREE.Vector3(pts[1].x, 0, pts[1].z);
        const right = b.clone().sub(a);
        const width = right.length();
        if (width <= 1e-6) return null;
        right.normalize();
        const rawForward = linkedAnn.parameters.tailDirection as { x?: number; z?: number } | undefined;
        const forward = new THREE.Vector3(rawForward?.x ?? fallbackForward.x, 0, rawForward?.z ?? fallbackForward.z);
        if (forward.lengthSq() <= 1e-8) forward.copy(fallbackForward);
        forward.normalize();
        return {
            origin: a.clone().add(b).multiplyScalar(0.5),
            direction: forward.clone(),
            right,
            forward,
            width,
            height: Math.max(0.01, maxY - minY),
            near: 0,
            far: Math.max(0, farClipDepth),
            minRight: -width / 2,
            maxRight: width / 2,
            minDepth: 0,
            maxDepth: Math.max(0, farClipDepth),
            minY,
            maxY,
        };
    }

    const anchor = linkedAnn.geometry2D.modelPoints?.[0];
    if (!anchor) return null;
    const rawForward = linkedAnn.parameters.facingDirection as { x?: number; z?: number } | undefined;
    const forward = new THREE.Vector3(rawForward?.x ?? fallbackForward.x, 0, rawForward?.z ?? fallbackForward.z);
    if (forward.lengthSq() <= 1e-8) forward.copy(fallbackForward);
    forward.normalize();
    const right = new THREE.Vector3(-forward.z, 0, forward.x).normalize();
    let minRight = viewDef.crop?.region?.min?.[0] ?? -3;
    let maxRight = viewDef.crop?.region?.max?.[0] ?? 3;
    if (minRight > maxRight) [minRight, maxRight] = [maxRight, minRight];
    return {
        origin: new THREE.Vector3(anchor.x, 0, anchor.z),
        direction: forward.clone(),
        right,
        forward,
        width: Math.max(0.01, maxRight - minRight),
        height: Math.max(0.01, maxY - minY),
        near: 0,
        far: Math.max(0, farClipDepth),
        minRight,
        maxRight,
        minDepth: 0,
        maxDepth: Math.max(0, farClipDepth),
        minY,
        maxY,
    };
}

function pointSectionBoxCoords(point: THREE.Vector3, box: SectionVolumeBox): { right: number; depth: number; y: number } {
    const rel = point.clone().sub(box.origin);
    return {
        right: rel.dot(box.right),
        depth: rel.dot(box.forward),
        y: point.y,
    };
}

function isInsideSectionBox(point: THREE.Vector3, box: SectionVolumeBox, epsilon = 1e-5): boolean {
    const c = pointSectionBoxCoords(point, box);
    return c.right >= box.minRight - epsilon &&
        c.right <= box.maxRight + epsilon &&
        c.depth >= box.minDepth - epsilon &&
        c.depth <= box.maxDepth + epsilon &&
        c.y >= box.minY - epsilon &&
        c.y <= box.maxY + epsilon;
}

function clipSegmentToSectionBox(
    a: THREE.Vector3,
    b: THREE.Vector3,
    box: SectionVolumeBox,
    epsilon = 1e-5,
): [THREE.Vector3, THREE.Vector3] | null {
    const ca = pointSectionBoxCoords(a, box);
    const cb = pointSectionBoxCoords(b, box);
    let t0 = 0;
    let t1 = 1;
    const axes: Array<[number, number, number, number]> = [
        [ca.right, cb.right - ca.right, box.minRight, box.maxRight],
        [ca.depth, cb.depth - ca.depth, box.minDepth, box.maxDepth],
        [ca.y, cb.y - ca.y, box.minY, box.maxY],
    ];
    for (const [start, delta, min, max] of axes) {
        if (Math.abs(delta) <= epsilon) {
            if (start < min - epsilon || start > max + epsilon) return null;
            continue;
        }
        const ta = (min - start) / delta;
        const tb = (max - start) / delta;
        const enter = Math.min(ta, tb);
        const exit = Math.max(ta, tb);
        t0 = Math.max(t0, enter);
        t1 = Math.min(t1, exit);
        if (t0 > t1 + epsilon) return null;
    }
    return [a.clone().lerp(b, t0), a.clone().lerp(b, t1)];
}

function triangleIntersectsSectionBox(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    box: SectionVolumeBox,
    epsilon = 1e-5,
): boolean {
    return isInsideSectionBox(a, box, epsilon) ||
        isInsideSectionBox(b, box, epsilon) ||
        isInsideSectionBox(c, box, epsilon) ||
        clipSegmentToSectionBox(a, b, box, epsilon) !== null ||
        clipSegmentToSectionBox(b, c, box, epsilon) !== null ||
        clipSegmentToSectionBox(c, a, box, epsilon) !== null;
}

function sectionBoxIntersectsWorldAABB(box: SectionVolumeBox, aabb: THREE.Box3, epsilon = 1e-5): boolean {
    if (aabb.isEmpty()) return false;
    let minRight = Infinity;
    let maxRight = -Infinity;
    let minDepth = Infinity;
    let maxDepth = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const x of [aabb.min.x, aabb.max.x]) {
        for (const y of [aabb.min.y, aabb.max.y]) {
            for (const z of [aabb.min.z, aabb.max.z]) {
                const c = pointSectionBoxCoords(new THREE.Vector3(x, y, z), box);
                minRight = Math.min(minRight, c.right);
                maxRight = Math.max(maxRight, c.right);
                minDepth = Math.min(minDepth, c.depth);
                maxDepth = Math.max(maxDepth, c.depth);
                minY = Math.min(minY, c.y);
                maxY = Math.max(maxY, c.y);
            }
        }
    }
    return maxRight >= box.minRight - epsilon &&
        minRight <= box.maxRight + epsilon &&
        maxDepth >= box.minDepth - epsilon &&
        minDepth <= box.maxDepth + epsilon &&
        maxY >= box.minY - epsilon &&
        minY <= box.maxY + epsilon;
}

function worldAABBIntersectsDepthPlane(
    aabb: THREE.Box3,
    planeNormal: THREE.Vector3,
    planeConstant: number,
    signedDepthFactor: number,
    nearDepth: number,
    epsilon = 1e-5,
): boolean {
    if (aabb.isEmpty()) return false;
    let min = Infinity;
    let max = -Infinity;
    for (const x of [aabb.min.x, aabb.max.x]) {
        for (const y of [aabb.min.y, aabb.max.y]) {
            for (const z of [aabb.min.z, aabb.max.z]) {
                const d = (planeNormal.x * x + planeNormal.y * y + planeNormal.z * z + planeConstant) * signedDepthFactor - nearDepth;
                min = Math.min(min, d);
                max = Math.max(max, d);
            }
        }
    }
    return min <= epsilon && max >= -epsilon;
}

function getMeshWorldAABB(mesh: THREE.Mesh): THREE.Box3 | null {
    const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
    if (!geometry) return null;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const localBox = geometry.boundingBox;
    if (!localBox || localBox.isEmpty()) return null;
    return localBox.clone().applyMatrix4(mesh.matrixWorld);
}

function classifyByProjectionDepth(
    srcGeo: THREE.BufferGeometry,
    viewDef: ViewDefinition,
    projectionDirection: THREE.Vector3,
    projectionDepth: number,
    farClipDepth: number,
    nearDepth: number = 0,
    sectionBox: SectionVolumeBox | null = null,
    epsilon: number = CUT_LINE_EPSILON,
): {
    cutGeo: THREE.BufferGeometry | null;
    projGeo: THREE.BufferGeometry | null;
    beyondGeo: THREE.BufferGeometry | null;
} {
    const posAttr = srcGeo.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!posAttr) return { cutGeo: null, projGeo: null, beyondGeo: null };

    const { normal: planeNormal, constant: planeConstant } = resolveSectionDepthPlane(viewDef, projectionDirection);
    const signedDepthFactor = planeNormal.dot(projectionDirection) >= 0 ? 1 : -1;

    const depthForPoint = (p: THREE.Vector3) => {
        return (planeNormal.dot(p) + planeConstant) * signedDepthFactor;
    };

    const cutPositions: number[] = [];
    const projPositions: number[] = [];
    const beyondPositions: number[] = [];
    const count = posAttr.count;
    const p0 = new THREE.Vector3();
    const p1 = new THREE.Vector3();

    for (let i = 0; i + 1 < count; i += 2) {
        p0.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
        p1.set(posAttr.getX(i + 1), posAttr.getY(i + 1), posAttr.getZ(i + 1));
        const clipped = sectionBox ? clipSegmentToSectionBox(p0, p1, sectionBox, epsilon) : [p0, p1] as [THREE.Vector3, THREE.Vector3];
        if (!clipped) continue;
        const d0 = depthForPoint(clipped[0]);
        const d1 = depthForPoint(clipped[1]);
        const avgDepth = (d0 + d1) / 2;
        if (avgDepth < nearDepth - epsilon || avgDepth > farClipDepth + epsilon) continue;

        const crossesCutPlane =
            Math.abs(d0 - nearDepth) <= epsilon ||
            Math.abs(d1 - nearDepth) <= epsilon ||
            ((d0 - nearDepth) * (d1 - nearDepth) < 0);
        const target = crossesCutPlane
            ? cutPositions
            : avgDepth > projectionDepth
            ? beyondPositions
            : projPositions;
        target.push(
            clipped[0].x, clipped[0].y, clipped[0].z,
            clipped[1].x, clipped[1].y, clipped[1].z,
        );
    }

    return {
        cutGeo: makeGeoFromPositions(cutPositions),
        projGeo: makeGeoFromPositions(projPositions),
        beyondGeo: makeGeoFromPositions(beyondPositions),
    };
}

function buildMeshPlaneIntersectionGeometry(
    mesh: THREE.Mesh,
    viewDef: ViewDefinition,
    projectionDirection: THREE.Vector3,
    nearDepth: number = 0,
    sectionBox: SectionVolumeBox | null = null,
    epsilon: number = TRIANGLE_PLANE_EPSILON,
): THREE.BufferGeometry | null {
    const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
    const posAttr = geometry?.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!geometry || !posAttr || posAttr.count < 3) return null;

    const { normal: planeNormal, constant: planeConstant } = resolveSectionDepthPlane(viewDef, projectionDirection);
    const signedDepthFactor = planeNormal.dot(projectionDirection) >= 0 ? 1 : -1;
    const worldBox = getMeshWorldAABB(mesh);
    if (!worldBox) return null;
    if (sectionBox && !sectionBoxIntersectsWorldAABB(sectionBox, worldBox, epsilon)) return null;
    if (!worldAABBIntersectsDepthPlane(worldBox, planeNormal, planeConstant, signedDepthFactor, nearDepth, epsilon)) return null;
    const index = geometry.index;
    const positions: number[] = [];
    const v0 = new THREE.Vector3();
    const v1 = new THREE.Vector3();
    const v2 = new THREE.Vector3();

    const readVertex = (vertexIndex: number, target: THREE.Vector3): THREE.Vector3 => {
        target.set(posAttr.getX(vertexIndex), posAttr.getY(vertexIndex), posAttr.getZ(vertexIndex));
        return target.applyMatrix4(mesh.matrixWorld);
    };

    const depthOf = (point: THREE.Vector3): number => {
        return (planeNormal.dot(point) + planeConstant) * signedDepthFactor - nearDepth;
    };

    const addUniquePoint = (points: THREE.Vector3[], point: THREE.Vector3): void => {
        const tolSq = epsilon * epsilon;
        if (points.some(existing => existing.distanceToSquared(point) <= tolSq)) return;
        points.push(point.clone());
    };

    const addSegment = (a: THREE.Vector3, b: THREE.Vector3): void => {
        const clipped = sectionBox ? clipSegmentToSectionBox(a, b, sectionBox, epsilon) : [a, b] as [THREE.Vector3, THREE.Vector3];
        if (!clipped || clipped[0].distanceToSquared(clipped[1]) <= epsilon * epsilon) return;
        positions.push(clipped[0].x, clipped[0].y, clipped[0].z, clipped[1].x, clipped[1].y, clipped[1].z);
    };

    const intersectEdge = (
        a: THREE.Vector3,
        da: number,
        b: THREE.Vector3,
        db: number,
        points: THREE.Vector3[],
    ): void => {
        if (Math.abs(da) <= epsilon) addUniquePoint(points, a);
        if (Math.abs(db) <= epsilon) addUniquePoint(points, b);
        if (da * db >= 0) return;
        const t = da / (da - db);
        addUniquePoint(points, a.clone().lerp(b, t));
    };

    const triangleCount = index ? Math.floor(index.count / 3) : Math.floor(posAttr.count / 3);
    for (let tri = 0; tri < triangleCount; tri++) {
        const i0 = index ? index.getX(tri * 3) : tri * 3;
        const i1 = index ? index.getX(tri * 3 + 1) : tri * 3 + 1;
        const i2 = index ? index.getX(tri * 3 + 2) : tri * 3 + 2;
        readVertex(i0, v0);
        readVertex(i1, v1);
        readVertex(i2, v2);
        if (sectionBox && !triangleIntersectsSectionBox(v0, v1, v2, sectionBox, epsilon)) continue;

        const d0 = depthOf(v0);
        const d1 = depthOf(v1);
        const d2 = depthOf(v2);
        const allFront = d0 > epsilon && d1 > epsilon && d2 > epsilon;
        const allBack = d0 < -epsilon && d1 < -epsilon && d2 < -epsilon;
        if (allFront || allBack) continue;

        const points: THREE.Vector3[] = [];
        intersectEdge(v0, d0, v1, d1, points);
        intersectEdge(v1, d1, v2, d2, points);
        intersectEdge(v2, d2, v0, d0, points);

        if (points.length === 2) {
            addSegment(points[0], points[1]);
        } else if (points.length >= 3) {
            addSegment(points[0], points[1]);
            addSegment(points[1], points[2]);
            addSegment(points[2], points[0]);
        }
    }

    return makeGeoFromPositions(positions);
}

/**
 * §FIX-PLAN-DOOR-CUTS-WALL (L-246) — TRUE horizontal plan cut of a solid.
 *
 * THE OPENING-CLIP RULE, EXPRESSED AS GEOMETRY.
 *
 * Until now the plan `:cut` layer was populated ONLY by `classifyByVertexY()`, which
 * tags an EDGE as "cut" when one of its endpoints lies within `CUT_LINE_EPSILON`
 * (15 cm) of the cut plane. A wall box has NO edge anywhere near a 1.2 m cut plane
 * (its horizontal edges sit at the base and at the head; its vertical edges have
 * endpoints only at those two elevations) — so **A-WALL:cut was ALWAYS EMPTY in a
 * plan view**. Consequences, both reported by the founder:
 *
 *   • no wall POCHÉ (the `:cut` sub-layer is the only thing `_renderPocheFills`
 *     scans, so there was never a fill to paint) — "the cut wall is a thin outline,
 *     the drawing reads flat" (L-241);
 *   • no CUT lineweight hierarchy for walls — every wall line was `:proj`.
 *
 * This function intersects the mesh's triangles with the horizontal plane
 * `y = cutPlaneY` and returns the resulting section outline in world space. For a
 * wall carrying a door that means the outline of the pieces of solid that ACTUALLY
 * EXIST at the cut height — i.e. the wall left of the jamb and the wall right of the
 * jamb, **each closed on itself at the void edge**. The opening is voided BY
 * CONSTRUCTION: no line and no fill can cross it, on ANY wall render path (plain,
 * layered, opening-bearing, curved, CSG single-volume or V2), because the solid
 * simply is not there. This is the invariant of `_suppressPlanViewOpeningLines`
 * (`wall face line terminus === opening void edge === frame jamb tick`) obtained
 * from the geometry instead of asserted about the geometry.
 *
 * `_suppressPlanViewOpeningLines` remains the clip for the PROJECTION linework (the
 * base/head edges of the solid, which do span the opening and are NOT cut by this
 * plane). There is still exactly ONE opening-clip rule per zone — no third ladder.
 *
 * Scope: A-WALL in plan views only (C15 hosted openings live in walls). Slabs sit
 * below the cut plane; giving A-FLOR a section here would paint the whole plate.
 */
export function buildPlanCutSectionGeometry(
    mesh: THREE.Mesh,
    cutPlaneY: number,
    epsilon: number = TRIANGLE_PLANE_EPSILON,
): THREE.BufferGeometry | null {
    const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
    const posAttr = geometry?.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!geometry || !posAttr || posAttr.count < 3) return null;

    const worldBox = getMeshWorldAABB(mesh);
    if (!worldBox) return null;
    // Cheap reject: the solid must straddle the cut plane.
    if (worldBox.min.y > cutPlaneY - epsilon || worldBox.max.y < cutPlaneY + epsilon) return null;

    const index = geometry.index;
    const positions: number[] = [];
    const v0 = new THREE.Vector3();
    const v1 = new THREE.Vector3();
    const v2 = new THREE.Vector3();

    const readVertex = (vertexIndex: number, target: THREE.Vector3): THREE.Vector3 => {
        target.set(posAttr.getX(vertexIndex), posAttr.getY(vertexIndex), posAttr.getZ(vertexIndex));
        return target.applyMatrix4(mesh.matrixWorld);
    };

    const addUniquePoint = (points: THREE.Vector3[], point: THREE.Vector3): void => {
        const tolSq = epsilon * epsilon;
        if (points.some(existing => existing.distanceToSquared(point) <= tolSq)) return;
        points.push(point.clone());
    };

    const addSegment = (a: THREE.Vector3, b: THREE.Vector3): void => {
        if (a.distanceToSquared(b) <= epsilon * epsilon) return;
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    };

    const intersectEdge = (
        a: THREE.Vector3, da: number,
        b: THREE.Vector3, db: number,
        points: THREE.Vector3[],
    ): void => {
        if (Math.abs(da) <= epsilon) addUniquePoint(points, a);
        if (Math.abs(db) <= epsilon) addUniquePoint(points, b);
        if (da * db >= 0) return;
        const t = da / (da - db);
        addUniquePoint(points, a.clone().lerp(b, t));
    };

    const triangleCount = index ? Math.floor(index.count / 3) : Math.floor(posAttr.count / 3);
    for (let tri = 0; tri < triangleCount; tri++) {
        const i0 = index ? index.getX(tri * 3)     : tri * 3;
        const i1 = index ? index.getX(tri * 3 + 1) : tri * 3 + 1;
        const i2 = index ? index.getX(tri * 3 + 2) : tri * 3 + 2;
        readVertex(i0, v0);
        readVertex(i1, v1);
        readVertex(i2, v2);

        const d0 = v0.y - cutPlaneY;
        const d1 = v1.y - cutPlaneY;
        const d2 = v2.y - cutPlaneY;
        if ((d0 > epsilon && d1 > epsilon && d2 > epsilon) ||
            (d0 < -epsilon && d1 < -epsilon && d2 < -epsilon)) continue;

        const points: THREE.Vector3[] = [];
        intersectEdge(v0, d0, v1, d1, points);
        intersectEdge(v1, d1, v2, d2, points);
        intersectEdge(v2, d2, v0, d0, points);

        // A triangle lying IN the plane contributes its 3 edges; a crossing triangle
        // contributes the single chord. (A coplanar triangle only occurs for a solid
        // whose face sits exactly at the cut height — the base/head of a wall whose
        // top or bottom coincides with the cut plane; its outline is still correct.)
        if (points.length === 2) {
            addSegment(points[0], points[1]);
        } else if (points.length >= 3) {
            addSegment(points[0], points[1]);
            addSegment(points[1], points[2]);
            addSegment(points[2], points[0]);
        }
    }

    return makeGeoFromPositions(positions);
}

function resolveSectionDepthBands(viewDef: ViewDefinition, farClipDepth: number): {
    projectionDepth: number;
    farClipDepth: number;
} {
    const explicitProjectionDepth = viewDef.viewRange?.depth?.offset ?? viewDef.spatial.viewRange?.farOffset;
    const projectionDepth = Math.max(
        0,
        Math.min(
            Number.isFinite(explicitProjectionDepth) ? explicitProjectionDepth! : DEFAULT_SECTION_PROJECTION_DEPTH,
            farClipDepth,
        ),
    );
    return { projectionDepth, farClipDepth };
}

/** Default full-storey capture depth (plan views — world-Y above floor). */
const DEFAULT_FAR_OFFSET  = 3.0;

/**
 * Default CAPTURE depth for elevation/section views (metres along the projection
 * direction). This is how DEEP the elevation reaches from the view origin — the
 * EdgeProjector clips any geometry beyond this depth. It is INDEPENDENT of the
 * proj→beyond classification boundary (`DEFAULT_SECTION_PROJECTION_DEPTH`, ~12 m):
 * increasing the capture depth only pulls MORE receding geometry into the drawing
 * (as `:beyond` linework), it does not move where projection flips to beyond.
 *
 * §FIX-ELEV-LIVE-CROP-REPROJECT-AND-4X-DEFAULT (L-202) — raised 4× (50 → 200 m)
 * so a default elevation captures the full depth of large/deep buildings the
 * founder was losing beyond the old 50 m cut. DOC-22 §7.
 */
const DEFAULT_ELEVATION_FAR_DEPTH = 200.0;

/** Fallback cut elevation when no level reference is available. */
const FALLBACK_CUT_ELEVATION = 0;

// ── Types ────────────────────────────────────────────────────────────────────

export interface ClipRange {
    /** Near clipping plane in world-Y space (upper boundary, closer to viewer). */
    near: number;
    /** Far clipping plane in world-Y space (lower boundary, farther from viewer). */
    far:  number;
}

interface SectionVolumeBox {
    origin: THREE.Vector3;
    direction: THREE.Vector3;
    right: THREE.Vector3;
    forward: THREE.Vector3;
    width: number;
    height: number;
    near: number;
    far: number;
    minRight: number;
    maxRight: number;
    minDepth: number;
    maxDepth: number;
    minY: number;
    maxY: number;
}

/** §FIX-ELEV-LIVE-CROP-REPROJECT (L-202) — inputs the per-element cache signature depends on. */
export interface ClipSignatureInput {
    viewType: string;
    direction: THREE.Vector3;
    near: number;
    far: number;
    planBelowDepthOffset: number;
    cutPlaneY: number | null;
    planFloorY: number | null;
    planBelowY: number | null;
    sectionDepthBands: { projectionDepth: number; farClipDepth: number } | null;
    sectionVolumeBox: SectionVolumeBox | null;
}

/**
 * §FIX-ELEV-LIVE-CROP-REPROJECT-AND-4X-DEFAULT (L-202) — Per-view CLIP SIGNATURE.
 *
 * The per-element projection cache (`_cwProjectionCache`) stores drawing-space
 * geometry AFTER crop-dependent classification: elevation/section depth banding
 * (`classifyByProjectionDepth` with the crop-derived `sectionVolumeBox` +
 * `farClipDepth`) and plan cut/beyond banding (`classifyByVertexY` with the
 * clip-derived `cutPlaneY` / `planFloorY` / `planBelowY`). That cached geometry
 * is therefore ONLY valid for the exact clip/crop configuration it was projected
 * under. The cache is keyed on (elementId, viewId, version) where `version`
 * tracks ELEMENT GEOMETRY only — it does NOT encode the view's crop.
 *
 * Without this signature a live crop change (view.setCrop → `_onViewUpdated`
 * full reproject) cache-HITS every unchanged element and replays geometry
 * clipped/classified under the OLD crop: elements newly captured as the scope
 * grows render against a stale reference while the originals (fully inside the
 * old crop, so their clipped geometry is unchanged) stay sound — exactly the
 * founder-reported defect. `invalidateCwView()` exists to clear this cache on a
 * view-definition change but is never wired to the crop-change path (dead code),
 * and `ViewTechnicalDrawingCache.invalidate()` disposes only the DRAWING cache.
 *
 * Folding every clip input the cached geometry depends on into a signature makes
 * the cache SELF-INVALIDATE on any crop / clip / direction change: same crop →
 * identical signature → cache still hits (normal element edits keep the perf
 * win); changed crop → signature mismatch → full re-classify from scratch,
 * identical to a from-scratch projection at the new crop.
 */
export function computeClipSignature(input: ClipSignatureInput): string {
    const n = (v: number | null | undefined): string =>
        (v === null || v === undefined || !Number.isFinite(v)) ? 'x' : v.toFixed(4);
    const d   = input.direction;
    const sdb = input.sectionDepthBands;
    const box = input.sectionVolumeBox;
    const parts: string[] = [
        input.viewType,
        n(d.x), n(d.y), n(d.z),
        n(input.near), n(input.far),
        n(input.planBelowDepthOffset),
        n(input.cutPlaneY), n(input.planFloorY), n(input.planBelowY),
        sdb ? `${n(sdb.projectionDepth)}/${n(sdb.farClipDepth)}` : 'x',
    ];
    if (box) {
        parts.push(
            n(box.origin.x),  n(box.origin.y),  n(box.origin.z),
            n(box.forward.x), n(box.forward.y), n(box.forward.z),
            n(box.minRight),  n(box.maxRight),
            n(box.minDepth),  n(box.maxDepth),
            n(box.minY),      n(box.maxY),
        );
    } else {
        parts.push('x');
    }
    return parts.join('|');
}

// ── Service ──────────────────────────────────────────────────────────────────

export class EdgeProjectorService {

    private readonly _edgeProjector:    OBC.EdgeProjector;
    private readonly _technicalDrawings: OBC.TechnicalDrawings;
    private readonly _world:            OBC.World;
    private readonly _bimManager:       BimManager;

    /**
     * §ROOF-SYSTEM-AUDIT-2026 §5.4 — RoofSlopeSymbolBuilder is constructor-DI.
     * Wired post-bootstrap from EngineBootstrap once roofStore + commandManager
     * are constructed. Until injected, slope arrows are silently skipped.
     */
    private _roofSlopeSymbolBuilder: RoofSlopeSymbolBuilder | null = null;

    // ── §C.2 — Projection geometry cache ────────────────────────────────────
    //
    // Stores post-toDrawingSpace, post-suppressor geometry per (elementId, viewId)
    // pair for CurtainWall elements only.  These are the dominant projection cost
    // (~250ms per CW group) and benefit the most from caching.
    //
    // Cache ownership: EPS owns all cached BufferGeometries.  They are disposed
    // on invalidation (element rebuilt), view invalidation, and full cache clear
    // (project switch).  GPU buffer leak on undo/redo is therefore bounded at
    // exactly 0 extra allocations per rebuild cycle once the cache is warm.
    //
    // Contract compliance:
    //   C01 P2  — BufferGeometry in L7.5 transitional layer (this file). ✓
    //   C01 §3.5 — EPS is not a store; it may hold geometry as projection cache. ✓
    //   I-2 — invalidation is driven by CurtainWallBuilder.remove() calling
    //          invalidateCwElement(), never by direct store access. ✓
    /**
     * §I-3 (Sprint 2): Two-level Map keyed by [elementId][viewId].
     * Previously a flat Map<"elementId:viewId", entry> — invalidateCwElement()
     * required a full O(W×V) scan to find all keys for one element.
     * New structure makes invalidateCwElement() O(V) (delete inner Map by key)
     * and invalidateCwView() O(W) (one outer pass, one inner delete per wall).
     * Total worst-case for a 294-wall undo drops from ~86 K iterations to ~294.
     */
    private readonly _cwProjectionCache = new Map<string, Map<string, {
        readonly version:      number;
        // §FIX-ELEV-LIVE-CROP-REPROJECT (L-202) — clip/crop signature the cached
        // drawing-space geometry was classified under. A crop change (same element
        // version) flips this, invalidating the entry so newly-captured elements
        // re-classify from scratch instead of replaying stale clipped geometry.
        readonly clipSignature: string;
        readonly layers:       ReadonlyMap<string, CachedProjectionLayer>;
        readonly projectedAt:  number;
    }>>();

    /**
     * §C.2.2 — Total number of (elementId, viewId) entries across all inner Maps.
     * Maintained by _putCwCache(), invalidateCwElement(), invalidateCwView(),
     * and clearCwProjectionCache() so the LRU eviction path is O(1) in the
     * common case (count < MAX) and O(W×V) only when the cap is hit.
     */
    private _cwCacheEntryCount = 0;

    /** §C.2.2 — Safety cap: never store more than this many (element, view) pairs. */
    private static readonly MAX_CW_PROJECTION_CACHE = 5_000;

    /**
     * §PLAN-VIEW-INCREMENTAL-PROJECTION §4.1 (Day 1, 2026-05-20) — Element-type
     * allow-list for the projection cache.  Membership means "the corresponding
     * fragment builder reliably bumps `root.userData.version` on every geometric
     * rebuild" — that is the cache key's invalidation signal, so any element
     * without that contract must NOT enter the cache or it would serve stale
     * line geometry forever.
     *
     * Verified to bump version per rebuild (grep history `userData.version =`):
     *   - curtainwall   — CurtainWallBuilder.ts:1306, 1838 (`this._nextVersion`)
     *   - wall          — WallFragmentBuilder.ts:668  (every buildWall())
     *   - slab          — SlabFragmentBuilder.ts:368
     *   - roof          — RoofFragmentBuilder.ts:244
     *   - room          — RoomBoundingLineBuilder.ts:114
     *   - column        — ColumnFragmentBuilder.ts:249 (§COLUMN-MOVE-PLAN-STALE
     *     Round 19, 2026-05-21 — Now reliably stamps `_priorVersion + 1` on
     *     every build, captured BEFORE the dispose path so the counter survives
     *     mesh replacement. Promoted to CACHEABLE list in Day 2.
     *
     * Day 2 audit (2026-05-21) — NOT YET on the list:
     *   - door, window, stair, beam, ceiling, floor, handrail, plumbing,
     *     furniture, lighting, opening, stair-railing.
     *   - DoorBuilder, WindowBuilder, StairMeshBuilder: NO `userData.version`
     *     stamp found.  Adding them to the cache would serve stale line
     *     geometry after every property edit (frameColor change, leafColor
     *     change, dimension update, etc.).  Day 3 of #57 will sweep these
     *     builders, add the version-stamp via the same _priorVersion + 1
     *     pattern Round 19 established for columns, then promote to the set.
     *
     * Stored lowercase — the gate normalises `elementType` via `.toLowerCase()`
     * to defend against future casing drift (CurtainWallBuilder stamps
     * 'CurtainWall', WallFragmentBuilder stamps 'wall', etc.).
     */
    private static readonly CACHEABLE_ELEMENT_TYPES: ReadonlySet<string> = new Set([
        'curtainwall',
        'wall',
        'slab',
        'roof',
        'room',
        'column',  // §57 Day 2 — promoted after Round 19 §COLUMN-MOVE-PLAN-STALE
        // §57 Day 3 (Round 31, 2026-05-21) — door + window already stamp
        // `userData.version = Date.now()` on every build (DoorBuilder.ts:291
        // + WindowBuilder.ts:309 — added by §DOOR-AUDIT-2026 W6 / §WINDOW-
        // AUDIT-2026 W6 for stale-detection). Date.now() is strictly
        // monotonic for the NMEexporter's proxy-cache key purposes, so the
        // cache invalidates correctly on every rebuild (no staleness risk).
        // Promoting both is a one-line config change with immediate perf
        // benefit: every plan view with doors/windows now hits cache HIT
        // on the second + subsequent projections instead of re-running the
        // full traverse + EdgesGeometry + toDrawingSpace pipeline.
        'door',
        'window',
        // §57 Day 4 (Round 32, 2026-05-21) — stair + beam now stamp
        // `userData.version = _priorVersion + 1` on every build (Round 32
        // applied the Round 19 capture-then-stamp pattern uniformly).
        // Both promoted to the cache after the source-builder change.
        // 'Stair' (PascalCase, StairMeshBuilder.ts:147) and 'beam' (lower,
        // BeamFragmentBuilder.ts:172) both normalise via .toLowerCase() at
        // the gate check (EdgeProjectorService.ts:1530), so casing drift
        // is handled.
        'stair',
        'beam',
        // §57 Day 5 (Round 33-34, 2026-05-21) — furniture, plumbing,
        // lighting, handrail now version-stamp on every build (Round 33
        // FurnitureFragmentBuilder; Round 34 PlumbingFragmentBuilder +
        // LightingFragmentBuilder + HandrailFragmentBuilder). All four
        // promoted to the cache. Builder elementType strings normalise
        // via .toLowerCase() — Furniture → 'furniture',
        // PlumbingFixture → 'plumbingfixture', Lighting → 'lighting',
        // Handrail → 'handrail'.
        'furniture',
        'plumbingfixture',
        'lighting',
        'handrail',
        // §57 Day 5 absolute close (Round 37, 2026-05-21) — ceiling +
        // floor now version-stamp on every build (Round 36 added the
        // capture-then-stamp pattern to CeilingPanelBuilder.ts:181 and
        // FloorPanelBuilder.ts:96). Both use the reusable-root pattern
        // (root preserved across rebuilds; only children cleared). The
        // version bump happens unconditionally at the end of each build,
        // so the NMEexporter proxy cache invalidates correctly after
        // every architect edit. The verification that slope handling +
        // hole geometry refresh both reach the userData write was done
        // by reading both builders end-to-end (no early-return paths
        // bypass the version stamp — both methods write userData as the
        // final step before returning).
        'ceiling',
        'floor',
        // §89 (2026-05-23) — stair-railing now version-stamps on every build
        // (StairRailingBuilder.buildRailing captures the prior version + 1; single
        // clean exit, no early-return bypass). Promoting it extends the per-element
        // projection cache to railings — the last common projectable stair part.
        'stair-railing',
    ]);

    /**
     * @param components  OBC components container (shared with engine).
     * @param world       OBC World used for visibility culling and scene placement.
     * @param bimManager  PRYZM BimManager — spatial authority for level elevations (§02).
     */
    constructor(
        components:  OBC.Components,
        world:       OBC.World,
        bimManager:  BimManager,
    ) {
        this._edgeProjector     = components.get(OBC.EdgeProjector);
        this._technicalDrawings = components.get(OBC.TechnicalDrawings);
        this._world             = world;
        this._bimManager        = bimManager;
    }

    /**
     * §ROOF-SYSTEM-AUDIT-2026 §5.4 — Setter for the constructor-DI
     * RoofSlopeSymbolBuilder. Wired post-bootstrap from EngineBootstrap once
     * roofStore + commandManager are constructed.
     */
    setRoofSlopeSymbolBuilder(builder: RoofSlopeSymbolBuilder): void {
        this._roofSlopeSymbolBuilder = builder;
    }

    // ── §C.2 Cache helpers ────────────────────────────────────────────────────

    private _cwCacheIsValid(
        elementId: string,
        viewId: string,
        currentVersion: number,
        clipSignature: string,
    ): boolean {
        const entry = this._cwProjectionCache.get(elementId)?.get(viewId);
        // §FIX-ELEV-LIVE-CROP-REPROJECT (L-202) — both the element geometry version
        // AND the view's clip/crop signature must match; a live crop change flips
        // the signature so stale, differently-clipped geometry is never replayed.
        return entry?.version === currentVersion && entry?.clipSignature === clipSignature;
    }

    private _getCwCached(elementId: string, viewId: string): ReadonlyMap<string, CachedProjectionLayer> | null {
        return this._cwProjectionCache.get(elementId)?.get(viewId)?.layers ?? null;
    }

    /**
     * §C.2.2 — LRU eviction: scan all entries, dispose GPU buffers of the entry
     * with the oldest `projectedAt` timestamp, then remove it.  Called only when
     * `_cwCacheEntryCount >= MAX_CW_PROJECTION_CACHE` before a new insertion.
     * Complexity: O(W×V) — acceptable because this path fires at most once per
     * _putCwCache() call and only when the 5,000-entry cap is actually reached.
     */
    private _evictLruCwEntry(): void {
        let oldestElementId: string | null = null;
        let oldestViewId:    string | null = null;
        let oldestTime = Infinity;

        for (const [elementId, inner] of this._cwProjectionCache) {
            for (const [viewId, entry] of inner) {
                if (entry.projectedAt < oldestTime) {
                    oldestTime      = entry.projectedAt;
                    oldestElementId = elementId;
                    oldestViewId    = viewId;
                }
            }
        }

        if (oldestElementId !== null && oldestViewId !== null) {
            const inner = this._cwProjectionCache.get(oldestElementId)!;
            const entry = inner.get(oldestViewId)!;
            entry.layers.forEach(l => l.geo.dispose());
            inner.delete(oldestViewId);
            if (inner.size === 0) this._cwProjectionCache.delete(oldestElementId);
            this._cwCacheEntryCount--;
        }
    }

    private _putCwCache(
        elementId: string,
        viewId: string,
        version: number,
        layers: Map<string, CachedProjectionLayer>,
        clipSignature: string,
    ): void {
        let inner = this._cwProjectionCache.get(elementId);
        if (!inner) {
            inner = new Map();
            this._cwProjectionCache.set(elementId, inner);
        }
        const existing = inner.get(viewId);
        if (existing) {
            existing.layers.forEach(l => l.geo.dispose());
        } else {
            // §C.2.2 — New entry: enforce LRU cap before inserting.
            if (this._cwCacheEntryCount >= EdgeProjectorService.MAX_CW_PROJECTION_CACHE) {
                this._evictLruCwEntry();
            }
            this._cwCacheEntryCount++;
        }
        inner.set(viewId, {
            version,
            clipSignature,  // §FIX-ELEV-LIVE-CROP-REPROJECT (L-202)
            layers: new Map(layers),
            projectedAt: performance.now(),
        });
    }

    /**
     * §C.2.6 — Invalidate all cached projections for a single curtain-wall element.
     * Called by CurtainWallBuilder.remove() so that the next plan-view refresh
     * re-projects the new geometry rather than replaying stale drawing-space data.
     * All BufferGeometry GPU buffers are disposed immediately (no leak).
     *
     * §I-3 (Sprint 2): O(V) — deletes the inner Map by elementId key directly,
     * rather than scanning all W×V entries. For a 294-wall undo this reduces
     * 294 × (294 × V) ≈ 86 K iterations to 294 × V (typically 294 × 1 = 294).
     */
    invalidateCwElement(elementId: string): void {
        const inner = this._cwProjectionCache.get(elementId);
        if (inner) {
            this._cwCacheEntryCount -= inner.size;
            inner.forEach(entry => entry.layers.forEach(l => l.geo.dispose()));
            this._cwProjectionCache.delete(elementId);
        }
    }

    /**
     * §C.2.7 — Invalidate all cached projections for a single view.
     * Called when a view's definition (clip range, projection direction) changes.
     *
     * §I-3 (Sprint 2): O(W) — one outer pass; for each element deletes only the
     * matching viewId inner entry (no full inner scan needed).
     */
    invalidateCwView(viewId: string): void {
        for (const inner of this._cwProjectionCache.values()) {
            const entry = inner.get(viewId);
            if (entry) {
                entry.layers.forEach(l => l.geo.dispose());
                inner.delete(viewId);
                this._cwCacheEntryCount--;
            }
        }
    }

    /**
     * §C.2.8 — Dispose all cached projections and clear the map.
     * Called on project switch (pryzm-project-switch) so stale Project A
     * geometries are not replayed into Project B plan views.
     */
    clearCwProjectionCache(): void {
        for (const inner of this._cwProjectionCache.values()) {
            inner.forEach(entry => entry.layers.forEach(l => l.geo.dispose()));
        }
        this._cwProjectionCache.clear();
        this._cwCacheEntryCount = 0;
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Projects all geometry for a view into a new TechnicalDrawing.
     *
     * - IFC models: uses OBC EdgeProjector via ModelIdMap.
     * - Native meshes: projected via TechnicalDrawing.toDrawingSpace (DOC-1.6 will
     *   extend this once NativeElementMeshExporter is available).
     *
     * Both the `EdgeProjector.get()` call and the resulting TechnicalDrawing run in
     * the OBC WebWorker pipeline; do NOT call this without `await`.
     *
     * §02 §1.2 — Level elevation is resolved from BimManager on every invocation.
     * §01 §5   — The returned TechnicalDrawing must never be stored in a PRYZM store;
     *             the caller (ViewTechnicalDrawingCache, DOC-1.5) owns it.
     *
     * @param viewDef           The view definition driving the projection.
     * @param models            Loaded FragmentsModel instances (IFC source).
     * @param nativeMeshGroups  THREE.Group[] from NativeElementMeshExporter (native source).
     * @param ifcSceneGroups    THREE.Group[] with userData.source==='ifc-import' from the live
     *                          Three.js scene (Contract 28 §3.1). These bypass Source A because
     *                          PRYZM's custom IfcGeometryRenderer does NOT register models in
     *                          OBC FragmentsManager. Passed by PlanViewManager when IFC is enabled.
     *                          MUST NOT be cleared after projection — they are live scene objects.
     * @returns                 A populated TechnicalDrawing.
     */
    async project(
        viewDef:              ViewDefinition,
        models:               FRAGS.FragmentsModel[],
        nativeMeshGroups:     THREE.Group[],
        ifcSceneGroups:       THREE.Group[] = [],
        planBelowDepthOffset: number = 0,
    ): Promise<OBC.TechnicalDrawing> {

        const direction               = this.getDirectionForView(viewDef);
        const { near, far, floorY }   = this.resolveClipRange(viewDef);  // §02 §1.2 — no cache

        // DOC-4.2 — Cut plane world-Y for cut-vs-projection classification (plan views only).
        const isPlanView = viewDef.viewType === 'plan' || viewDef.viewType === 'structural-plan';
        const isSectionDepthView = viewDef.viewType === 'section' || viewDef.viewType === 'elevation';
        const cutPlaneY  = isPlanView ? near : null;

        // Plan-view beyond zone: world-Y below which segments are classified as :beyond.
        // Requires floorY (level elevation) and a non-zero belowDepthOffset.
        const planFloorY    = isPlanView && floorY !== undefined ? floorY : null;
        const planBelowY    = planFloorY !== null && planBelowDepthOffset > 0
            ? planFloorY - planBelowDepthOffset
            : null;

        const sectionDepthBands = isSectionDepthView ? resolveSectionDepthBands(viewDef, far) : null;
        const sectionVolumeBox = isSectionDepthView ? resolveSectionVolumeBox(viewDef, direction, far, this._bimManager) : null;

        // §FIX-ELEV-LIVE-CROP-REPROJECT (L-202) — clip/crop signature for the
        // per-element projection cache. Encodes every clip input the cached
        // drawing-space geometry is classified against, so a live crop change
        // (view.setCrop → full reproject) invalidates every stale entry and
        // newly-captured elements re-classify identically to a from-scratch
        // projection at the new crop.
        const clipSignature = computeClipSignature({
            viewType: viewDef.viewType,
            direction,
            near,
            far,
            planBelowDepthOffset,
            cutPlaneY,
            planFloorY,
            planBelowY,
            sectionDepthBands,
            sectionVolumeBox,
        });

        // §FIX-ELEVATION-POCHE (L-119) — unified drawing scope for this view. Drives
        // whether depth-classified geometry is routed to a `:cut` layer (section) or
        // to `:proj`/`:beyond` only (elevation — no cut, no poché). Replaces the prior
        // ad-hoc `viewType === 'elevation' && layerName === 'A-WALL'` special case.
        const viewScope = resolveViewScope(viewDef.viewType);

        // §FEAT-REVIT-LINE-TYPE-SEMANTICS (L-277) — per-element NEAREST depth along the VIEW
        // DIRECTION, stamped on every projected LineSegments so `applyOcclusion()` can order
        // occluders front-to-back.
        //
        // THIS USED TO BE `elevDepthOfBox`, COMPUTED FOR ELEVATIONS ONLY, AND THAT NAME WAS
        // THE BUG'S HIDING PLACE. Depth along the view direction is a property of ANY view.
        // Because only elevation had it, only elevation could depth-order occluders — so plan
        // and section built their occluder sets from `:cut` linework alone and a PROJECTED
        // solid occluded NOTHING. A section showed you the far wall straight through the near
        // one (ADR-121 §2.2 / §5.2(2)). Stamping every view type is what turns three occluder
        // regimes back into ONE engine (C09 §4.6.5).
        //
        //   • elevation / section — signed distance from the view's depth plane (as before).
        //   • plan                — metres BELOW the cut plane of the element's TOPMOST point.
        //     The viewer of a plan stands ON the cut plane looking down, so "nearest" is
        //     "highest". Geometry ABOVE the cut plane yields a NEGATIVE depth and is rejected
        //     as an occluder by `minProjectionOccluderDepth: 0` — without that clip a roof
        //     (the nearest solid in the drawing, silhouette covering the whole plate) would
        //     occlude the ENTIRE PLAN.
        const isElevationView = viewDef.viewType === 'elevation';
        let viewDepthOfBox: ((box: THREE.Box3) => number) | null = null;
        if (isSectionDepthView) {
            const { normal: depthNormal, constant: depthConstant } = resolveSectionDepthPlane(viewDef, direction);
            const depthSign = depthNormal.dot(direction) >= 0 ? 1 : -1;
            viewDepthOfBox = (box: THREE.Box3): number => {
                let min = Infinity;
                for (const x of [box.min.x, box.max.x]) {
                    for (const y of [box.min.y, box.max.y]) {
                        for (const z of [box.min.z, box.max.z]) {
                            const d = (depthNormal.x * x + depthNormal.y * y + depthNormal.z * z + depthConstant) * depthSign;
                            if (d < min) min = d;
                        }
                    }
                }
                return min;
            };
        } else if (isPlanView && cutPlaneY !== null) {
            const planeY = cutPlaneY;
            viewDepthOfBox = (box: THREE.Box3): number => planeY - box.max.y;
        }

        // DOC-4.4 — Log crop region when active (culling is performed by NativeElementMeshExporter).
        const cropRegion = viewDef.spatial?.cropRegion;
        // §C.3 — viewId is used as the cache partition key (each view has its own projected geometry).
        const viewId = viewDef.id;

        console.log(
            `[EdgeProjectorService] project() batchId=${window.__activeBatchId ?? 'none'} ` +
            `viewId=${viewId} ` +
            `dir=(${direction.x},${direction.y},${direction.z}) ` +
            `near=${near.toFixed(3)} far=${far.toFixed(3)}` +
            (planBelowY !== null ? ` belowY=${planBelowY.toFixed(3)}` : '') +
            (cropRegion
                ? ` cropRegion=[${cropRegion.minX.toFixed(2)},${cropRegion.minZ.toFixed(2)} → ${cropRegion.maxX.toFixed(2)},${cropRegion.maxZ.toFixed(2)}]`
                : ''),
        );

        // Create a fresh TechnicalDrawing owned by the caller.
        const drawing = this._technicalDrawings.create(this._world);
        drawing.orientTo(direction);

        // ── Base projection layers ────────────────────────────────────────────
        // DOC-1.13: Create named layers BEFORE calling addProjectionLines().
        // OBC warns and falls back to layer "0" if the target layer doesn't exist.
        // These two are the IFC fallback layers; ISO 13567 layers are created per
        // native-element category in Source B below.
        drawing.layers.create('projection-visible');
        drawing.layers.create('projection-hidden');

        // ── Source A: IFC / Fragment models ──────────────────────────────────
        if (models.length > 0) {
            const modelIdMap = await this._buildModelIdMap(models);

            if (Object.keys(modelIdMap).length > 0) {
                // Configure EdgeProjector for this view.
                this._edgeProjector.projectionDirection.set(direction.x, direction.y, direction.z);
                this._edgeProjector.nearPlane = near;
                this._edgeProjector.farPlane  = far;

                const result = await this._edgeProjector.get(modelIdMap, this._world);

                const visibleLines = new THREE.LineSegments(
                    result.visible,
                    new THREE.LineBasicMaterial({ color: 0x000000 }),
                );
                const hiddenLines = new THREE.LineSegments(
                    result.hidden,
                    new THREE.LineDashedMaterial({ color: 0x888888, dashSize: 0.1, gapSize: 0.08 }),
                );
                visibleLines.name = 'projection-visible';
                hiddenLines.name = 'projection-hidden';
                visibleLines.userData.layerName = 'projection-visible';
                hiddenLines.userData.layerName = 'projection-hidden';

                // Layers were already created above — addProjectionLines will not warn.
                drawing.addProjectionLines(visibleLines, 'projection-visible');
                drawing.addProjectionLines(hiddenLines,  'projection-hidden');

                console.log(`[EdgeProjectorService] IFC projection done — ${models.length} model(s)`);
            }
        }

        // ── Source B: PRYZM native elements — DOC-1.8 + DOC-1.13 ────────────
        // Projects native THREE.Group meshes into the drawing using EdgesGeometry
        // + TechnicalDrawing.toDrawingSpace(). EdgeProjector.get() only supports
        // IFC ModelIdMap, so native geometry goes through the static project path.
        //
        // A-1 (Contract 19 Phase 3): Each group corresponds to exactly one PRYZM
        // element (NativeElementMeshExporter stamps wrapper.userData.elementUUID).
        // We project per-element, per-layer so each resulting LineSegments can be
        // tagged with its element UUID — enabling plan-view hitTest to resolve
        // clicks back to specific elements without per-frame scene traversal.
        //
        // DOC-1.13: Each mesh's userData.elementType is mapped to an ISO 13567
        // DXF layer name (ELEMENT_TYPE_TO_PROJECTION_LAYER). drawing.layers.create()
        // is idempotent — safe to call once per element per layer.
        //
        // §02 §4.3 — groups are cleared after projection; underlying builder
        //             geometry is NOT disposed (owned by builders, not this service).
        if (nativeMeshGroups.length > 0) {

            let totalLayerCount = 0;
            let totalGeoCount   = 0;
            // §D.5 — cache hit/miss counters for §PERF-CACHE-STATS log at end of loop.
            let cacheHits   = 0;
            let cacheMisses = 0;

            // §PERF-EDGEPROJECTOR-CHUNK (2026-05-05):
            // The native mesh loop is synchronous. For a 110-wall / 6-level session
            // this processes ~595 groups with ~11–12 ms of CPU work each, totalling a
            // single 7,046 ms LONGTASK that freezes the main thread after the batch
            // overlay dismisses. By yielding every CHUNK_SIZE groups we break the
            // work into ≤50 ms tasks, keeping the main thread responsive throughout
            // the plan-view reprojection.
            //
            // §PERF-EDGEPROJECTOR-CHUNK-ADAPTIVE (2026-05-05):
            // CHUNK_SIZE is calibrated to the geometry type in the batch:
            //
            //   Wall groups   (~12ms/group): CHUNK_SIZE=4 → ~48ms/chunk  (< 50ms LONGTASK)
            //   CW groups    (~250ms/group): CHUNK_SIZE=1 → ~250ms/chunk (unavoidable per-group
            //                                cost, but 4-5× smaller than the previous ~950ms chunk)
            //
            // Detection: CurtainWallBuilder is the only native builder that produces
            // THREE.InstancedMesh children (mullion racks, panel pools). All other
            // builders (Wall, Slab, Column, Beam, Door, Window, Furniture …) use
            // plain THREE.Mesh. Probing the first ≤5 groups is O(small constant)
            // and reliably separates CW-heavy batches from wall/element batches.
            //
            // Why CHUNK_SIZE=1 still leaves ≤250ms chunks for CW:
            //   Each CW group contains InstancedMesh with complex cell geometry (mullions
            //   + glass panels). EdgesGeometry + matrixWorld transforms on 20-40 instanced
            //   submeshes per group dominate the per-group CPU budget. This cost cannot be
            //   reduced further without parallelising the projection itself (Web Worker).
            //   CHUNK_SIZE=1 limits the LONGTASK from ~950ms (4 groups × 250ms) to ~250ms.
            // §PERF-EDGEPROJECTOR-CHUNK-ADAPTIVE — detection correction (2026-05-05):
            // InstancedMesh probe does NOT work here. NativeElementMeshExporter converts every
            // InstancedMesh → N plain THREE.Mesh proxy objects (one per instance) before
            // returning the wrapper groups — see NativeElementMeshExporter.ts lines 141-162.
            // Therefore nativeMeshGroups never contain InstancedMesh; the previous probe
            // always returned false and CHUNK_SIZE remained 4 for CW batches.
            //
            // Correct discriminator: wrapper.userData.elementType stamped by
            // NativeElementMeshExporter from the element root's userData.
            // CurtainWallBuilder stamps the THREE.Group root with elementType: 'CurtainWall'
            // (CurtainWallBuilder.ts §11 line ~878). Case-insensitive comparison handles
            // any future normalisation of the casing without a silent regression.
            // One O(n) scan with early-exit is O(1) amortised for any non-empty batch.
            const _hasCWElements = nativeMeshGroups.some(g =>
                (g.userData?.elementType as string | undefined)?.toLowerCase() === 'curtainwall'
            );
            // CHUNK_SIZE = 4 for wall/element groups (~12ms/group → ~48ms/chunk ≤50ms).
            //              = 1 for CW groups — overridden by §PERF-EDGEPROJECTOR-SUBLAYER-YIELD
            //                which yields inside the layer loop for CW, making CHUNK_SIZE moot.
            const CHUNK_SIZE = _hasCWElements ? 1 : 4;
            let _chunkGroupIdx = 0;

            let __diag_group_idx = 0;
            for (const group of nativeMeshGroups) {
                // A-1: element UUID stamped by NativeElementMeshExporter.exportForView()
                const elementUUID = group.userData.elementUUID as string | undefined;

                // §C.3 — Cache gate: skip the expensive traverse + EdgesGeometry +
                // toDrawingSpace pipeline when the element hasn't changed since the
                // last projection.  Cache key: (elementUUID, viewId, version,
                // clipSignature) — the `version` is stamped by every fragment builder
                // on every rebuild (so a version miss equals "geometry actually
                // changed"), and `clipSignature` (§FIX-ELEV-LIVE-CROP-REPROJECT, L-202)
                // captures the view's crop/clip reference so a live crop change
                // invalidates entries whose cached geometry was clipped/classified
                // under the OLD crop.
                //
                // §PLAN-VIEW-INCREMENTAL-PROJECTION §4.1 (Day 1, 2026-05-20):
                //   The cache used to gate only on `elementType === 'curtainwall'`
                //   even though the underlying storage is element-type-agnostic.
                //   Widening it to every element type that has a stable per-rebuild
                //   `userData.version` (walls, slabs, ceilings, floors, columns,
                //   roofs, stairs, stair-railings, beams, doors, windows, openings)
                //   gives every drawing edit the same skip-projection benefit that
                //   curtain walls already enjoyed.  CACHEABLE_ELEMENT_TYPES is the
                //   single source of truth for "the builder bumps version on
                //   rebuild" — adding a new element type to the editor needs a
                //   one-line addition here (or it silently falls back to the
                //   no-cache pipeline, which is the safe default).
                const elemTypeLower = (group.userData?.elementType as string | undefined)?.toLowerCase();
                const isCacheableElement = elemTypeLower !== undefined
                    && EdgeProjectorService.CACHEABLE_ELEMENT_TYPES.has(elemTypeLower);
                const currentVer  = typeof group.userData?.version === 'number'
                    ? (group.userData.version as number)
                    : undefined;

                if (isCacheableElement && elementUUID !== undefined && currentVer !== undefined) {
                    if (this._cwCacheIsValid(elementUUID, viewId, currentVer, clipSignature)) {
                        // §C.3.2 — CACHE HIT: replay stored drawing-space geometries directly.
                        // Skips: group.traverse(), N×EdgesGeometry, N×matrixWorld, mergeGeometries,
                        //        OBC.TechnicalDrawing.toDrawingSpace(), and opening suppressors.
                        const cachedLayers = this._getCwCached(elementUUID, viewId)!;
                        for (const cached of cachedLayers.values()) {
                            const sublayerName = cached.layerName;
                            drawing.layers.create(sublayerName);
                            // Clone the cached geometry so the drawing owns its copy and
                            // OBC disposal cannot corrupt the cache on drawing teardown.
                            const hitLines = new THREE.LineSegments(
                                cached.geo.clone(),
                                new THREE.LineBasicMaterial({ color: 0x000000 }),
                            );
                            hitLines.name = sublayerName;
                            hitLines.userData.layerName = sublayerName;
                            // §FEAT-WALL-POCHE-FILL-BY-INTENT (L-261) — replay the poché identity
                            // too, or a cached layered wall would lose its per-layer tones.
                            if (cached.userData) Object.assign(hitLines.userData, cached.userData);
                            if (elementUUID) {
                                hitLines.userData.elementUUID = elementUUID;
                                registerSegmentUUID(drawing, hitLines, elementUUID);
                            }
                            drawing.addProjectionLines(hitLines, sublayerName);
                        }
                        if (EPS_VERBOSE) console.log(
                            `[EdgeProjectorService] §PERF-CACHE-HIT ` +
                            `elementId=${elementUUID} version=${currentVer} ` +
                            `layers=${cachedLayers.size} viewId=${viewId}`,
                        );
                        cacheHits++;
                        __diag_group_idx++;
                        continue;
                    }
                }

                // §C.3.3 — CACHE MISS or non-cacheable element: run full pipeline.
                // For cacheable elements, freshLayersCollector accumulates the
                // projected geometry from each addProjectedLayer() call so it can
                // be stored in the cache after all layers for this element are
                // complete.
                // §PLAN-VIEW-INCREMENTAL-PROJECTION §4.1 — gate widened to all
                // cacheable element types (was: isCWElement only).
                const freshLayersCollector: Map<string, CachedProjectionLayer> | null =
                    (isCacheableElement && elementUUID !== undefined && currentVer !== undefined)
                        ? new Map()
                        : null;

                const __t_group_start = performance.now();
                let __diag_edge_count = 0;
                let __diag_mesh_count = 0;

                // Collect EdgesGeometry instances per ISO layer for this element only.
                const perElemLayerGeos = new Map<string, THREE.BufferGeometry[]>();
                const perElemLayerCutGeos = new Map<string, CutSectionPart[]>();

                // §FEAT-REVIT-LINE-TYPE-SEMANTICS (L-277) — nearest depth of this element along
                // the view direction, across the meshes that survive the view filter. Stamped on
                // every projected LineSegments so the ONE occlusion engine can order occluders
                // front-to-back in plan, section AND elevation.
                let elemViewDepth = Infinity;

                group.traverse((child) => {
                    if ((child as THREE.Mesh).isMesh) {
                        const mesh = child as THREE.Mesh;

                        // DOOR-LEAF-PLAN: hide the real 3D leaf in plan view by default.
                        // The DoorPlanSymbolBuilder injects a precise 2D leaf rectangle +
                        // swing arc symbol, so the extruded leaf mesh is redundant noise.
                        // Only suppress when leafVisibleInPlan is explicitly false (the default).
                        if (isPlanView && mesh.userData.role === 'doorLeaf' && !mesh.userData.leafVisibleInPlan) {
                            return;
                        }
                        // DOOR-HANDLE-PLAN: handles are never shown in plan view — they are
                        // 3D hardware elements with no 2D plan symbol counterpart.
                        if (isPlanView && mesh.userData.role === 'doorHandle') {
                            return;
                        }
                        // LEGACY-DOOR-FRAME-PLAN: WallFragmentBuilder embeds a legacy 3D door
                        // frame inside the wallGroup for 3D rendering. In plan view, skip these
                        // meshes entirely — DoorBuilder's group + DoorPlanSymbolBuilder already
                        // provide the correct 2D door representation (frame rectangle + swing arc).
                        // Without this skip, the 3D frame posts and door panel create extra
                        // horizontal lines crossing through the opening in the plan drawing.
                        if (isPlanView && mesh.userData.role === 'legacyDoorFrame') {
                            return;
                        }
                        // LEGACY-WINDOW-FRAME-PLAN: same rationale as legacyDoorFrame — the
                        // wall-embedded window frame geometry is 3D-only. WindowBuilder +
                        // its plan symbol builder own the plan-view representation.
                        if (isPlanView && mesh.userData.role === 'legacyWindowFrame') {
                            return;
                        }
                        // FURNITURE-PLAN-MINIMAL: builders may opt out individual meshes
                        // (e.g. seat cushions, capsule rolls, legs) from the plan-view
                        // projection so the 2D symbol reads as a clean outline rather
                        // than a dense mesh dump. Builder sets userData.skipInPlan=true.
                        if (isPlanView && mesh.userData.skipInPlan === true) {
                            return;
                        }
                        // §FEAT-PLUMBING-PLAN-ELEV-SYMBOLS (L-221 P2/P3) — elevation sibling of
                        // skipInPlan. Meshes with a dedicated ELEVATION symbol (plumbing fixtures)
                        // opt out of the generic true-edge projection in elevation views so the
                        // LOD400 mesh edge-dump is replaced by the clean silhouette symbol below.
                        // Section views are unaffected (a section legitimately cuts the fixture).
                        if (isElevationView && mesh.userData.skipInElevation === true) {
                            return;
                        }

                        // §FEAT-WALL-POCHE-FILL-BY-INTENT (L-261) — WALL-LAYER MESHES THAT
                        // CARRY NO `elementType` STILL BELONG ON A-WALL.
                        //
                        // WallFragmentBuilder stamps `elementType: 'WallLayer'` on each layer
                        // mesh; LayeredWallOpeningBuilder (the path taken by every layered wall
                        // that HOSTS AN OPENING) stamps `wallId` + `layerIndex` + `layerFunction`
                        // but NO `elementType`. Those meshes therefore fell through to
                        // FALLBACK_NATIVE_LAYER ('projection-visible') — a layer that carries no
                        // ISO zone, no pen weight, no VG override and no poché association. Same
                        // silent-drop family as L-257 (layered walls dumped on layer "0"): the
                        // wall was drawn, but OUTSIDE the drawing system.
                        //
                        // Resolve the wall identity from the userData the builders DO stamp, so
                        // no builder can opt out of the layer system by omission.
                        const rawElementType = mesh.userData?.elementType as string | undefined;
                        const elementType = rawElementType
                            ?? (mesh.userData?.wallId !== undefined && mesh.userData?.layerIndex !== undefined
                                ? 'WallLayer'
                                : undefined);
                        // §FIX-PLAN-WALL-LAYER-CASE (L-275) — resolve by CANONICAL type.
                        // A plain wall stamps 'wall' (lowercase); the map keys it 'Wall'.
                        // The old direct index missed it, dropped the wall onto
                        // 'projection-visible', and so the wall got NO :cut layer and NO
                        // poché — until a door forced a rebuild that stamped 'Wall'.
                        const layerName   = resolveProjectionLayer(elementType);

                        mesh.updateWorldMatrix(true, false);
                        try {
                            const meshWorldBox = getMeshWorldAABB(mesh);
                            if (sectionVolumeBox && (!meshWorldBox || !sectionBoxIntersectsWorldAABB(sectionVolumeBox, meshWorldBox))) return;
                            // §FEAT-REVIT-LINE-TYPE-SEMANTICS (L-277) — track this element's
                            // nearest depth along the view direction, from the meshes that pass
                            // the view filter. Every view type, not just elevation.
                            if (viewDepthOfBox && meshWorldBox) {
                                const d = viewDepthOfBox(meshWorldBox);
                                if (d < elemViewDepth) elemViewDepth = d;
                            }
                            // Plan-view Y-range filter: skip meshes whose AABB lies entirely
                            // outside [planBelowY, far + 0.5]. planBelowY = levelFloor − belowDepth
                            // so below-floor geometry up to belowDepthOffset is included, while
                            // geometry from completely different storeys is rejected cheaply.
                            if (isPlanView && meshWorldBox && planBelowY !== null) {
                                const planMaxY = far + 0.5;
                                if (meshWorldBox.max.y < planBelowY || meshWorldBox.min.y > planMaxY) return;
                            }
                            // Per-mesh edge-angle threshold (Contract 48 §3.5):
                            // meshes built from rounded boxes / extruded bevels can tag
                            // userData.edgeAngleDeg to collapse soft creases below that
                            // angle, producing clean elevation silhouettes. Default 1°
                            // matches THREE.EdgesGeometry's historical behaviour.
                            const angleDeg = typeof mesh.userData?.edgeAngleDeg === 'number'
                                ? mesh.userData.edgeAngleDeg
                                : 1;
                            // §DIAG-EPS-01: EdgesGeometry alloc — dominant per-mesh cost.
                            // For CW proxy meshes (InstancedMesh expanded to N plain Mesh),
                            // each call is O(F log F) where F = face count of the source geometry.
                            const __t_edge = performance.now();
                            const edgesGeo = new THREE.EdgesGeometry(mesh.geometry, angleDeg);
                            const __edge_ms = performance.now() - __t_edge;
                            const __edge_verts = edgesGeo.getAttribute('position')?.count ?? 0;
                            if (EPS_VERBOSE || __edge_ms > 2) {
                                console.log(
                                    `[EdgeProjectorService] §DIAG-EPS-01 edgesGeo ` +
                                    `group=${__diag_group_idx} mesh#${__diag_mesh_count} ` +
                                    `elemType=${mesh.userData?.elementType ?? '?'} ` +
                                    `faceCount=${(mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position')?.count ?? 0) / 3 | 0} ` +
                                    `edgeVertices=${__edge_verts} allocMs=${__edge_ms.toFixed(2)}ms`
                                );
                            }
                            __diag_mesh_count++;
                            __diag_edge_count += __edge_verts;
                            edgesGeo.applyMatrix4(mesh.matrixWorld);
                            if (!perElemLayerGeos.has(layerName)) perElemLayerGeos.set(layerName, []);
                            perElemLayerGeos.get(layerName)!.push(edgesGeo);
                            // §FIX-PLAN-DOOR-CUTS-WALL (L-246) — TRUE plan cut for walls.
                            // The wall's section AT the cut plane, so the `:cut` layer (and
                            // therefore the poché fill stitched from it) contains only the
                            // solid that actually exists at that height: it terminates on the
                            // void edges of every door/window opening BY CONSTRUCTION, on every
                            // wall render path. See buildPlanCutSectionGeometry().
                            if (isPlanView && cutPlaneY !== null && CUT_ELIGIBLE_PLAN_LAYERS.has(layerName)) {
                                const planCutGeo = buildPlanCutSectionGeometry(mesh, cutPlaneY);
                                if (planCutGeo) {
                                    if (!perElemLayerCutGeos.has(layerName)) perElemLayerCutGeos.set(layerName, []);
                                    perElemLayerCutGeos.get(layerName)!.push({
                                        geo: planCutGeo,
                                        pocheLayer: readMeshPocheLayer(mesh),
                                    });
                                }
                            }
                            if (sectionDepthBands) {
                                const meshCutGeo = buildMeshPlaneIntersectionGeometry(mesh, viewDef, direction, near, sectionVolumeBox);
                                if (meshCutGeo) {
                                    if (!perElemLayerCutGeos.has(layerName)) perElemLayerCutGeos.set(layerName, []);
                                    // §FEAT-SOLID-OCCLUSION-AND-POCHE-ACROSS-ALL-VIEW-TYPES (L-264) —
                                    // a cut wall in a SECTION is exactly as cut as a cut wall in a
                                    // plan. The section's mesh∩plane parts carry the same layer
                                    // identity, so a layered wall pochés per layer in section too.
                                    perElemLayerCutGeos.get(layerName)!.push({
                                        geo: meshCutGeo,
                                        pocheLayer: readMeshPocheLayer(mesh),
                                    });
                                }
                            }
                        } catch {
                            // Skip meshes with degenerate geometry.
                        }
                    }
                });

                // §DIAG-EPS-02: per-group traverse summary — total proxies processed and edge vertices.
                const __t_traverse_done = performance.now();
                if (EPS_VERBOSE) console.log(
                    `[EdgeProjectorService] §DIAG-EPS-02 group#${__diag_group_idx} ` +
                    `elemId=${elementUUID ?? 'n/a'} elemType=${group.userData?.elementType ?? '?'} ` +
                    `meshesProcessed=${__diag_mesh_count} totalEdgeVerts=${__diag_edge_count} ` +
                    `layers=${perElemLayerGeos.size} traverseMs=${(__t_traverse_done - __t_group_start).toFixed(1)}ms`
                );
                __diag_group_idx++;

                if (perElemLayerGeos.size === 0 && perElemLayerCutGeos.size === 0) continue;

                // §G1-T6 — declared OUTSIDE the try block so the finally clause can
                // access it.  The array accumulates every EdgesGeometry and merged
                // geometry created for this element during per-layer projection.
                const tempGeosToDispose: THREE.BufferGeometry[] = [];

                const layerNames = new Set<string>([
                    ...perElemLayerGeos.keys(),
                    ...perElemLayerCutGeos.keys(),
                ]);

                // §G1-T6 — Source C disposal guard.
                //
                // Wrap the per-element projection body in try/finally so that
                // tempGeosToDispose is always cleaned up even when a FrameScheduler
                // rAF yield is interrupted mid-flight by a superseded projectionGen
                // (i.e., a second `project()` call races the first while it is
                // suspended at an `await scheduleOnce()` point).  Without this guard,
                // any EdgesGeometry allocated before the first yield and after the
                // last successful push to `tempGeosToDispose` leaks to the GPU heap
                // (Source C from doc-50 §1.2).
                //
                // The chunk yield (below, after the finally) is intentionally kept
                // OUTSIDE this block — it yields BETWEEN elements, not within one.
                try {

                for (const layerName of layerNames) {
                    const geos = perElemLayerGeos.get(layerName) ?? [];
                    const meshCutGeos = perElemLayerCutGeos.get(layerName) ?? [];
                    if (geos.length === 0 && meshCutGeos.length === 0) continue;

                    // Merge all EdgesGeometries for this (element, layer) pair.
                    // §DIAG-EPS-03: mergeGeometries cost — O(total vertices) across all geos.
                    let mergedGeo: THREE.BufferGeometry | null = null;
                    const __t_merge_start = performance.now();
                    if (geos.length === 1) {
                        mergedGeo = geos[0];
                        tempGeosToDispose.push(geos[0]);
                    } else if (geos.length > 1) {
                        const m = mergeGeometries(geos, false);
                        mergedGeo = m ?? geos[0];
                        for (const g of geos) tempGeosToDispose.push(g);
                        if (m) tempGeosToDispose.push(m);
                    }
                    const __t_merge_done = performance.now();
                    const __merged_verts = mergedGeo?.getAttribute('position')?.count ?? 0;
                    if (EPS_VERBOSE) {
                        console.log(
                            `[EdgeProjectorService] §DIAG-EPS-03 mergeGeometries ` +
                            `layer=${layerName} geoCount=${geos.length} ` +
                            `mergedVerts=${__merged_verts} mergeMs=${(__t_merge_done - __t_merge_start).toFixed(1)}ms`
                        );
                    }
                    for (const p of meshCutGeos) tempGeosToDispose.push(p.geo);

                    // §FEAT-WALL-POCHE-FILL-BY-INTENT (L-261) — the wall's REAL layer count,
                    // and each layer's ordinal among the layers that share its `function`.
                    // Both derive from the stored `layers` (via the meshes built from them):
                    // never a magic literal, never a hardcoded count (L-127).
                    const _distinctLayerIdx = [...new Set(
                        meshCutGeos.map(p => p.pocheLayer?.layerIndex).filter((i): i is number => i !== undefined),
                    )].sort((a, b) => a - b);
                    const _pocheLayerCount = _distinctLayerIdx.length;
                    const _tieOrdinal = new Map<number, number>();   // layerIndex → ordinal within its function group
                    {
                        const seen = new Map<string, number>();
                        for (const idx of _distinctLayerIdx) {
                            const fn = meshCutGeos.find(p => p.pocheLayer?.layerIndex === idx)?.pocheLayer?.layerFunction ?? '';
                            const n = seen.get(fn) ?? 0;
                            _tieOrdinal.set(idx, n);
                            seen.set(fn, n + 1);
                        }
                    }

                    // DOC-1.13: Create the ISO 13567 layer on the drawing so
                    // addProjectionLines() can assign the material properly.
                    // DrawingLayers.create() is idempotent — returns existing layer if present.
                    drawing.layers.create(layerName);

                    const addProjectedLayer = (
                        geo: THREE.BufferGeometry,
                        targetLayerName: string,
                        extraUserData?: Record<string, unknown>,
                        isTrueSection = false,
                    ): void => {
                        const lines = new THREE.LineSegments(
                            geo,
                            new THREE.LineBasicMaterial({ color: 0x000000 }),
                        );
                        lines.updateWorldMatrix(true, false);
                        drawing.layers.create(targetLayerName);
                        // §DIAG-EPS-04: toDrawingSpace — dominant per-layer cost (~50ms for CW).
                        // Transforms every vertex in the merged geometry from world space to
                        // 2D drawing space. For CW: ~20-40 proxies merged → 1000+ line segments.
                        const __t_tds_start = performance.now();
                        const projected = OBC.TechnicalDrawing.toDrawingSpace(lines, drawing);
                        const __tds_ms = performance.now() - __t_tds_start;
                        if (EPS_VERBOSE || __tds_ms > 5) {
                            const __tds_verts = (projected.geometry as THREE.BufferGeometry | undefined)
                                ?.getAttribute?.('position')?.count ?? '?';
                            console.log(
                                `[EdgeProjectorService] §DIAG-EPS-04 toDrawingSpace ` +
                                `layer=${targetLayerName} inVerts=${geo.getAttribute('position')?.count ?? '?'} ` +
                                `outVerts=${__tds_verts} tdsMs=${__tds_ms.toFixed(1)}ms`
                            );
                        }
                        projected.name = targetLayerName;
                        projected.userData.layerName = targetLayerName;
                        // §FEAT-WALL-POCHE-FILL-BY-INTENT (L-261) — construction-layer identity
                        // of a CUT section ring, consumed by the poché pass to tone it.
                        if (extraUserData) Object.assign(projected.userData, extraUserData);
                        // §FEAT-REVIT-LINE-TYPE-SEMANTICS (L-277) — stamp the element's nearest
                        // depth along the view direction so `applyOcclusion()` can order
                        // occluders front-to-back. EVERY view type: an unstamped `:proj` layer is
                        // silently disqualified as a depth-ordered occluder (it cannot be
                        // ordered), and that disqualification — under the old name
                        // `elevationDepth` — is exactly why plan and section had no projection
                        // occluders at all.
                        if (Number.isFinite(elemViewDepth)) {
                            projected.userData[VIEW_DEPTH_KEY] = elemViewDepth;
                        }
                        if (!isPlanView && layerName === 'A-WALL' && !/:cut$/i.test(targetLayerName)) {
                            _suppressWallOpeningSeams(projected, drawing, group);
                        }
                        // Plan-view: clip A-WALL lines at door/window opening zones so that
                        // no wall layer edges cross through the opening gap. Both :cut and
                        // :proj sub-layers are processed — the outline box geometry (which
                        // spans the full wall length) produces both kinds of along-wall edges.
                        // §FEAT-WALL-POCHE-FILL-BY-INTENT (L-261) — the TRUE section (L-246) is
                        // ALREADY voided at every opening BY CONSTRUCTION (the solid is not there
                        // at the cut height). Running the line-clip over it would cut its
                        // void-edge closing segments — which lie exactly ON the opening boundary
                        // — and an open ring cannot be stitched into a poché region. The clip
                        // stays where it belongs: on the PROJECTION linework (the base/head edges
                        // that DO span the opening). One opening-clip rule per zone, as L-246 set.
                        if (isPlanView && layerName === 'A-WALL' && cutPlaneY !== null && !isTrueSection) {
                            _suppressPlanViewOpeningLines(projected, drawing, group, cutPlaneY);
                        }
                        if (elementUUID) {
                            projected.userData.elementUUID = elementUUID;
                            registerSegmentUUID(drawing, projected, elementUUID);
                        }
                        // §C.3.4 — Capture projected geometry into cache collector AFTER
                        // all suppressors run (so stale un-suppressed geometry is never cached).
                        // Clone so the cache owns an independent copy; the drawing may dispose
                        // its copy when the TechnicalDrawing is destroyed.
                        if (freshLayersCollector) {
                            const projGeo = projected.geometry as THREE.BufferGeometry | undefined;
                            if (projGeo) {
                                // §FEAT-WALL-POCHE-FILL-BY-INTENT (L-261) — a layered wall emits
                                // ONE `:cut` LineSegments PER CONSTRUCTION LAYER, so the collector
                                // can no longer be keyed by layer name alone (the last ring would
                                // evict its siblings and a cache HIT would silently draw a wall
                                // with fewer layers than a cache MISS). Key by emission; the
                                // target layer name and the poché identity travel in the value.
                                const key = freshLayersCollector.has(targetLayerName)
                                    ? `${targetLayerName}#${freshLayersCollector.size}`
                                    : targetLayerName;
                                freshLayersCollector.set(key, {
                                    layerName: targetLayerName,
                                    geo: projGeo.clone(),
                                    userData: extraUserData,
                                });
                            }
                        }
                        drawing.addProjectionLines(projected, targetLayerName);
                    };

                    /**
                     * §FEAT-WALL-POCHE-FILL-BY-INTENT (L-261) / §FEAT-SOLID-OCCLUSION-AND-POCHE-
                     * ACROSS-ALL-VIEW-TYPES (L-264) — EMIT THE TRUE SECTION OF THE SOLID.
                     *
                     * THE BUG THIS CLOSES: L-246 built `buildPlanCutSectionGeometry()` and pushed
                     * its result into `perElemLayerCutGeos` — but the PLAN branch below never read
                     * that map. It is read ONLY inside `else if (sectionDepthBands)`, which a plan
                     * view never enters (plan takes the `cutPlaneY !== null` branch). So the true
                     * plan section was computed, per wall, on every projection — and thrown away.
                     * `A-WALL:cut` stayed EMPTY in plan, exactly as it had been before L-246, and
                     * with it went the poché (L-241/L-261), the CUT lineweight (L-260 C) and every
                     * HLR occluder (L-260 B: "2 occluder(s), 0/1532 segments removed"). Three
                     * founder-visible defects, one dropped array.
                     *
                     * Each part is emitted as its OWN `:cut` LineSegments so a layered wall keeps
                     * one closed ring per construction layer (HiddenLineRemoval groups occluders by
                     * `elementUUID`, so N rings still make ONE solid occluder — and the rings TILE
                     * the wall body, so the polygon parity test is unaffected).
                     */
                    const emitCutSections = (parts: CutSectionPart[]): void => {
                        for (const part of parts) {
                            const pl = part.pocheLayer;
                            const extra: Record<string, unknown> | undefined = pl
                                ? {
                                    pocheLayer: {
                                        layerIndex: pl.layerIndex,
                                        layerFunction: pl.layerFunction,
                                        layerName: pl.layerName,
                                        layerCount: _pocheLayerCount,
                                        tieOrdinal: _tieOrdinal.get(pl.layerIndex) ?? 0,
                                    },
                                }
                                : undefined;
                            addProjectedLayer(part.geo, _layerCut(layerName), extra, true);
                        }
                    };

                    if (cutPlaneY !== null) {
                        emitCutSections(meshCutGeos);
                        const { cutGeo, projGeo, beyondGeo } = mergedGeo
                            ? classifyByVertexY(mergedGeo, cutPlaneY, planFloorY, CUT_LINE_EPSILON, planBelowY)
                            : { cutGeo: null, projGeo: null, beyondGeo: null };
                        if (cutGeo) {
                            addProjectedLayer(cutGeo, _layerCut(layerName));
                            tempGeosToDispose.push(cutGeo);
                        }
                        if (projGeo) {
                            addProjectedLayer(projGeo, _layerProj(layerName));
                            tempGeosToDispose.push(projGeo);
                        }
                        if (beyondGeo) {
                            drawing.layers.create(_layerBeyond(layerName));
                            addProjectedLayer(beyondGeo, _layerBeyond(layerName));
                            tempGeosToDispose.push(beyondGeo);
                        }
                    } else if (sectionDepthBands) {
                        // §FIX-ELEVATION-POCHE (L-119) — UNIFIED section/elevation depth
                        // classification, keyed on ViewScope instead of the old
                        // `viewType === 'elevation' && layerName === 'A-WALL'` special case.
                        //
                        // Every element (not just A-WALL) is classified along view depth into
                        // cut / projection / beyond bands. ViewScope.cut then decides routing:
                        //   • SECTION  (cut:true)  — the mesh-plane intersection + near-band
                        //                            edges are the CUT → `:cut` (heavy + poché),
                        //                            with `:proj` / `:beyond` behind it.
                        //   • ELEVATION(cut:false) — there is NO cut. The silhouette + near
                        //                            edges are PROJECTION linework → `:proj`;
                        //                            depth-cued far edges stay `:beyond`. Emitting
                        //                            a `:cut` layer here is what made the plan
                        //                            poché pass paint the whole façade solid
                        //                            black (L-119) and mis-count the layers.
                        const cutParts: CutSectionPart[] = [...meshCutGeos];
                        let projGeo: THREE.BufferGeometry | null = null;
                        let beyondGeo: THREE.BufferGeometry | null = null;
                        if (mergedGeo) {
                            const classified = classifyByProjectionDepth(
                                mergedGeo,
                                viewDef,
                                direction,
                                sectionDepthBands.projectionDepth,
                                sectionDepthBands.farClipDepth,
                                near,
                                sectionVolumeBox,
                            );
                            if (classified.cutGeo) {
                                cutParts.push({ geo: classified.cutGeo });
                                tempGeosToDispose.push(classified.cutGeo);
                            }
                            projGeo = classified.projGeo;
                            beyondGeo = classified.beyondGeo;
                        }

                        if (viewScope.cut) {
                            // SECTION — route the cut band to `:cut`.
                            // §FEAT-SOLID-OCCLUSION-AND-POCHE-ACROSS-ALL-VIEW-TYPES (L-264) — the
                            // parts are emitted individually (not concatenated) so a layered wall
                            // pochés PER LAYER in a section exactly as it does in a plan. Same
                            // intent chain, same table, same tones: a cut wall is a cut wall.
                            emitCutSections(cutParts);
                            if (projGeo) {
                                addProjectedLayer(projGeo, _layerProj(layerName));
                                tempGeosToDispose.push(projGeo);
                            }
                            if (beyondGeo) {
                                addProjectedLayer(beyondGeo, _layerBeyond(layerName));
                                tempGeosToDispose.push(beyondGeo);
                            }
                        } else {
                            // ELEVATION — §ELEV-LINEWEIGHT (L-182).
                            //
                            // Route the depth-classified `cut` band to `:cut` so a wall the
                            // elevation plane is drawn THROUGH renders at the heavy CUT pen
                            // weight — establishing the cut > projection > beyond line-weight
                            // hierarchy the founder reported missing. The façade proper is
                            // classified as `:proj` (medium) and receding geometry as
                            // `:beyond` (thin/dashed), so a correctly-placed elevation mark
                            // (outside the building → near plane crosses no geometry) yields
                            // an empty cut band and reads as pure `:proj` — only geometry the
                            // plane actually slices becomes `:cut`.
                            //
                            // This does NOT reintroduce the L-119 black-façade poché: solid
                            // cut fills are gated on ViewScope.poche (false for elevation) in
                            // PlanViewCanvas, wholly independent of whether a `:cut` linework
                            // layer exists. `_renderPocheFills` — the only consumer that scans
                            // `:cut` sub-layers — is never invoked for an elevation.
                            const mergedCutGeo = concatLineGeometries(cutParts.map(p => p.geo));
                            if (mergedCutGeo) {
                                addProjectedLayer(mergedCutGeo, _layerCut(layerName));
                                tempGeosToDispose.push(mergedCutGeo);
                            }
                            if (projGeo) {
                                addProjectedLayer(projGeo, _layerProj(layerName));
                                tempGeosToDispose.push(projGeo);
                            }
                            if (beyondGeo) {
                                addProjectedLayer(beyondGeo, _layerBeyond(layerName));
                                tempGeosToDispose.push(beyondGeo);
                            }
                        }
                    } else if (mergedGeo) {
                        addProjectedLayer(mergedGeo, layerName);
                    }

                    totalLayerCount++;
                    totalGeoCount += geos.length + meshCutGeos.length;

                    // §PERF-EDGEPROJECTOR-SUBLAYER-YIELD (2026-05-06):
                    //
                    // Root cause (§BN-03 / attachment §LAYER-2):
                    //   CW groups contain ~34 submeshes. Even with CHUNK_SIZE=1 (one group per
                    //   chunk), each group's work takes 160-220ms because:
                    //     34× EdgesGeometry + matrixWorld ≈ 68ms
                    //     mergeGeometries(34 geos)        ≈ 20ms
                    //     toDrawingSpace(merged)           ≈ 50ms per layer
                    //   With 2-4 layers per CW group → 160-220ms per chunk (4× over 50ms LONGTASK
                    //   threshold), causing the "pseudo-frozen" scene immediately after overlay
                    //   dismissal.
                    //
                    // Fix: For CW batches, yield after EVERY layer's toDrawingSpace() call
                    //   (i.e., at the end of each iteration of the layer loop). This splits
                    //   the 160-220ms per-group LONGTASK into per-layer slices of ~50ms each:
                    //     Layer 1: traverse + EdgesGeometry + merge + toDrawingSpace ≈ 50ms
                    //     rAF yield (16ms) → layer 2: ~50ms → rAF yield → ...
                    //
                    //   For non-CW batches (walls, slabs, furniture …), the per-group cost is
                    //   ≤12ms so the existing per-group yield (every CHUNK_SIZE=4 groups) is
                    //   sufficient and this inner yield is skipped.
                    //
                    // Calendar cost: +16ms per layer per CW group. For 17 CW groups × 3 layers
                    //   avg = 51 extra rAF ticks ≈ +816ms of elapsed time. Acceptable tradeoff
                    //   for eliminating 17× 200ms LONGTASKs that block navigation/interaction.
                    if (_hasCWElements) {
                        // §FIX-EDGEPROJECTOR-RAF-YIELD-P3 (Task 1.2) — migrated from raw rAF
                        // to FrameScheduler.scheduleOnce() to maintain P3 single-rAF-owner invariant.
                        // Semantics are identical: scheduleOnce fires on the next pre-render tick
                        // (VSYNC-synchronized via the FrameScheduler's single rAF owner in RafAdapter.ts).
                        await new Promise<void>(resolve =>
                            getFrameScheduler().scheduleOnce('eps-cw-layer-yield', () => resolve(), 'pre-render'),
                        );
                    }
                }

                // §C.3.4 — Store completed projection in cache for this CW element.
                // freshLayersCollector is non-null only when all conditions are met:
                //   isCWElement=true, elementUUID defined, currentVer defined (MISS path).
                if (freshLayersCollector !== null && freshLayersCollector.size > 0
                    && elementUUID !== undefined && currentVer !== undefined) {
                    this._putCwCache(elementUUID, viewId, currentVer, freshLayersCollector, clipSignature);
                    cacheMisses++;
                    if (EPS_VERBOSE) console.log(
                        `[EdgeProjectorService] §PERF-CACHE-MISS ` +
                        `elementId=${elementUUID} version=${currentVer} ` +
                        `layers=${freshLayersCollector.size} viewId=${viewId}`,
                    );
                }

                } finally {
                    // §G1-T6 — Source C: always dispose temp geometries for this
                    // element, even if the try body was interrupted by an async yield
                    // or an exception.  Using a Set prevents double-dispose when the
                    // single-geo case pushes the same geometry twice (geos[0] + merge).
                    const uniqueGeos = new Set(tempGeosToDispose);
                    for (const g of uniqueGeos) g.dispose();
                }

                // §PERF-EDGEPROJECTOR-CHUNK: yield to the browser event loop every
                // CHUNK_SIZE groups so the main thread is never blocked for more than
                // ~50 ms at a time. For CW batches, per-layer yields (above) are used
                // instead and this per-group yield is a no-op (CHUNK_SIZE=1, but
                // _hasCWElements guard below skips the wait for non-first-layer groups).
                //
                // §FIX-EDGEPROJECTOR-RAF-YIELD (2026-05-05): Changed from setTimeout(resolve, 0)
                // to a VSYNC-synchronized yield. WHY: setTimeout yields the current macrotask
                // but the browser is NOT guaranteed to paint before the next callback fires.
                // A VSYNC-synchronized yield fires exactly once per display frame (~16.7ms at
                // 60Hz), AFTER the browser has composited and displayed the current frame.
                // This guarantees full FPS between chunks — the user sees fresh scene geometry
                // on every display frame throughout the EdgeProjector reprojection pass.
                //
                // §FIX-EDGEPROJECTOR-RAF-YIELD-P3 (Task 1.2): Migrated from raw browser API
                // to FrameScheduler.scheduleOnce() to maintain P3 single-rAF-owner invariant.
                // Semantics are identical (VSYNC-synchronized via RafAdapter.ts).
                //
                // COST: Adds ~16ms × (chunks−1) of calendar time vs setTimeout(0).
                _chunkGroupIdx++;
                if (!_hasCWElements && _chunkGroupIdx % CHUNK_SIZE === 0) {
                    await new Promise<void>(resolve =>
                        getFrameScheduler().scheduleOnce('eps-chunk-yield', () => resolve(), 'pre-render'),
                    );
                }
            }

            if (totalGeoCount > 0) {
                console.log(
                    `[EdgeProjectorService] §PERF-EDGEPROJECTOR-CHUNK Native projection done — ` +
                    `${nativeMeshGroups.length} group(s) in ${Math.ceil(nativeMeshGroups.length / CHUNK_SIZE)} chunk(s), ` +
                    `${totalGeoCount} edge geometries across ${totalLayerCount} ISO layer(s) ` +
                    `(per-element UUID tagging active)`,
                );
            }
            // §D.5 — Cache statistics per projection run.
            // hitRate=100% on second run with no changes; hitRate=0% on first run.
            //
            // §PLAN-VIEW-INCREMENTAL-PROJECTION §4.1 (Day 1, 2026-05-20) —
            // The stats now fire whenever ANY cache hit or miss occurred, not
            // just when the batch contains CW elements. `cwGroups` retained
            // as an alias for cacheable groups so existing log scrapers don't
            // break; the new `cacheableGroups` field is the canonical name.
            const _totalCacheableGroups = cacheHits + cacheMisses;
            if (_totalCacheableGroups > 0) {
                console.log(
                    `[EdgeProjectorService] §PERF-CACHE-STATS ` +
                    `batchId=${window.__activeBatchId ?? 'none'} ` +
                    `viewId=${viewId} groups=${nativeMeshGroups.length} ` +
                    `cwGroups=${_totalCacheableGroups} cacheableGroups=${_totalCacheableGroups} ` +
                    `cacheHits=${cacheHits} cacheMisses=${cacheMisses} ` +
                    `hitRate=${((cacheHits / _totalCacheableGroups) * 100).toFixed(0)}% ` +
                    `cacheElements=${this._cwProjectionCache.size} cacheEntries=${this._cwCacheEntryCount}/${EdgeProjectorService.MAX_CW_PROJECTION_CACHE}`,
                );
            }

            // §G1-T2 — Group cleanup is now owned by callers via
            // nativeElementMeshExporter.releaseGroups(groups, { disposeProxies: true }).
            // Callers hold the NME reference; EPS only holds the group array.
            // Removing the redundant group.clear() here ensures that when the caller's
            // releaseGroups() runs, group.children is still populated and the
            // disposeProxies path can iterate children to check the sharedGeometry flag.
            // §02 §4.3 — builder geometry is never disposed here; the sharedGeometry flag
            // guards all IM-derived and Mesh-derived proxy geometries in NME (§G1-T1).
        }

        // ── Source C: IFC scene meshes (Contract 28 §3.1 / Contract 22 §4.1) ──
        //
        // IFC elements imported via PRYZM's IfcGeometryRenderer are raw THREE.Mesh
        // objects inside THREE.Group nodes with userData.source === 'ifc-import'.
        // They are NOT registered in OBC FragmentsManager, so they cannot go through
        // the Source A EdgeProjector.get() path.
        //
        // Each mesh represents one IFC geometry part.  The PRYZM-canonical element
        // type is stored in mesh.userData.type (§28 §3.1), and the element id is
        // stored in mesh.userData.id.  Both are mapped to the same ISO-13567 layer
        // scheme as native elements so VG styling applies uniformly.
        //
        // These groups MUST NOT be cleared after projection — they are live scene objects.
        //
        // ── Wave 11 / Stage S7 — per-IFC-type intent veto ─────────────────────
        //
        // Resolve the bound Visibility Intent for this view (with parent-chain
        // inheritance — Wave 9). For each IFC mesh, normalise its
        // `userData.type` to the canonical `'ifc-<lc>'` resolver key and skip
        // projection entirely when the bound intent's rule for that type is
        // fully hidden in all four states. The per-type cache keeps the
        // resolver call O(distinct-types) rather than O(meshes).
        if (ifcSceneGroups.length > 0) {
            let ifcTotalGeoCount = 0;
            let ifcSkippedByIntent = 0;

            const boundForView = resolveBoundIntentWithInheritance(viewDef.id);
            const intentVisibilityCache = new Map<string, boolean>(); // normalised type → fully-hidden?

            const isTypeHiddenByIntent = (rawType: string | undefined): boolean => {
                if (!boundForView) return false;
                const key = normaliseIfcUserDataType(rawType);
                let cached = intentVisibilityCache.get(key);
                if (cached === undefined) {
                    cached = isElementTypeFullyHidden(boundForView.intent, key);
                    intentVisibilityCache.set(key, cached);
                }
                return cached;
            };

            for (const ifcGroup of ifcSceneGroups) {
                ifcGroup.traverse((child) => {
                    if (!(child as THREE.Mesh).isMesh) return;
                    const mesh = child as THREE.Mesh;
                    if (!mesh.visible) return;

                    // §28 §3.1: IFC meshes carry 'type' (PRYZM-canonical) for layer mapping.
                    const elementType = (mesh.userData?.type ?? mesh.userData?.elementType) as string | undefined;
                    const elementId   = mesh.userData?.id as string | undefined;

                    // Wave 11 — early bail when the bound intent fully hides this IFC type.
                    if (isTypeHiddenByIntent(elementType)) {
                        ifcSkippedByIntent++;
                        return;
                    }

                    // §FIX-PLAN-WALL-LAYER-CASE (L-275) — canonical resolution. Both call
                    // sites MUST go through the one resolver; a second raw index lookup is
                    // how the case mismatch survived here in the first place.
                    const layerName   = resolveProjectionLayer(elementType);

                    mesh.updateWorldMatrix(true, false);
                    try {
                        const meshWorldBox = getMeshWorldAABB(mesh);

                        // Plan-view Y-range filter: skip meshes from other floors.
                        // Lower bound extends to planBelowY (beyond zone) when active,
                        // otherwise uses the standard near − 2.5 m heuristic so
                        // walls and slabs spanning the cut plane are always included.
                        if (isPlanView && meshWorldBox) {
                            const lowerBound = planBelowY !== null ? planBelowY : near - 2.5;
                            if (meshWorldBox.max.y < lowerBound || meshWorldBox.min.y > far + 0.5) return;
                        }

                        // Section/elevation spatial volume filter.
                        if (sectionVolumeBox && (!meshWorldBox || !sectionBoxIntersectsWorldAABB(sectionVolumeBox, meshWorldBox))) return;

                        const edgesGeo = new THREE.EdgesGeometry(mesh.geometry);
                        edgesGeo.applyMatrix4(mesh.matrixWorld);
                        drawing.layers.create(layerName);

                        const addIfcLayer = (geo: THREE.BufferGeometry, targetLayerName: string): void => {
                            const posAttr = geo.getAttribute('position');
                            if (!posAttr || posAttr.count < 2) return;
                            const lines = new THREE.LineSegments(
                                geo,
                                new THREE.LineBasicMaterial({ color: 0x000000 }),
                            );
                            lines.updateWorldMatrix(true, false);
                            drawing.layers.create(targetLayerName);
                            const projected = OBC.TechnicalDrawing.toDrawingSpace(lines, drawing);
                            projected.name = targetLayerName;
                            projected.userData.layerName = targetLayerName;
                            if (elementId) {
                                projected.userData.elementUUID = elementId;
                                registerSegmentUUID(drawing, projected, elementId);
                            }
                            drawing.addProjectionLines(projected, targetLayerName);
                        };

                        if (cutPlaneY !== null) {
                            // Plan view: classify edges as cut / proj / beyond.
                            // beyondGeo captures segments inside the beyond zone [planBelowY, floorY)
                            // when planFloorY is set; with belowLevelDepth=0 (planBelowY=null) the
                            // storey below is suppressed (§VIEW-RANGE-BELOW).
                            const { cutGeo, projGeo, beyondGeo } = classifyByVertexY(edgesGeo, cutPlaneY, planFloorY, CUT_LINE_EPSILON, planBelowY);
                            if (cutGeo) {
                                addIfcLayer(cutGeo, _layerCut(layerName));
                                cutGeo.dispose();
                            }
                            if (projGeo) {
                                addIfcLayer(projGeo, _layerProj(layerName));
                                projGeo.dispose();
                            }
                            if (beyondGeo) {
                                drawing.layers.create(_layerBeyond(layerName));
                                addIfcLayer(beyondGeo, _layerBeyond(layerName));
                                beyondGeo.dispose();
                            }
                        } else if (sectionDepthBands) {
                            // §FIX-ELEVATION-POCHE (L-119) — classify edges along view depth,
                            // then route by ViewScope: SECTION → `:cut` + `:proj`/`:beyond`;
                            // ELEVATION → `:proj`/`:beyond` ONLY (no cut, no poché black fill).
                            const meshCutGeo = buildMeshPlaneIntersectionGeometry(mesh, viewDef, direction, near, sectionVolumeBox);
                            const classified = classifyByProjectionDepth(
                                edgesGeo, viewDef, direction,
                                sectionDepthBands.projectionDepth,
                                sectionDepthBands.farClipDepth,
                                near, sectionVolumeBox,
                            );
                            const cutParts: THREE.BufferGeometry[] = [];
                            if (meshCutGeo) cutParts.push(meshCutGeo);
                            if (classified.cutGeo) cutParts.push(classified.cutGeo);
                            if (viewScope.cut) {
                                const mergedCut = concatLineGeometries(cutParts);
                                if (mergedCut) { addIfcLayer(mergedCut, _layerCut(layerName)); mergedCut.dispose(); }
                                if (classified.projGeo) { addIfcLayer(classified.projGeo, _layerProj(layerName)); classified.projGeo.dispose(); }
                            } else {
                                // Elevation — fold the cut silhouette into projection linework.
                                const projParts: THREE.BufferGeometry[] = [...cutParts];
                                if (classified.projGeo) projParts.push(classified.projGeo);
                                const mergedProj = concatLineGeometries(projParts);
                                if (mergedProj) { addIfcLayer(mergedProj, _layerProj(layerName)); mergedProj.dispose(); }
                                if (classified.projGeo) classified.projGeo.dispose();
                            }
                            if (classified.beyondGeo) { addIfcLayer(classified.beyondGeo, _layerBeyond(layerName)); classified.beyondGeo.dispose(); }
                            if (meshCutGeo) meshCutGeo.dispose();
                            if (classified.cutGeo) classified.cutGeo.dispose();
                        } else {
                            // Elevation or generic projection: no cut classification.
                            addIfcLayer(edgesGeo, layerName);
                        }

                        edgesGeo.dispose();
                        ifcTotalGeoCount++;
                    } catch {
                        // Skip meshes with degenerate geometry.
                    }
                });
            }

            if (ifcTotalGeoCount > 0 || ifcSkippedByIntent > 0) {
                console.log(
                    `[EdgeProjectorService] Source C — IFC scene mesh projection done: ` +
                    `${ifcTotalGeoCount} mesh(es) from ${ifcSceneGroups.length} group(s)` +
                    (ifcSkippedByIntent > 0
                        ? ` (Wave 11: ${ifcSkippedByIntent} skipped by bound-intent visibility)`
                        : ''),
                );
            }
            // DO NOT call group.clear() — IFC groups are live scene objects (§02 §4.3 exception).
        }

        // ── DOC-2.5a: Door swing arc injection ────────────────────────────────
        // Door swing arcs have no 3D mesh counterpart — they are a 2D AEC convention
        // symbol computed from DoorStore + WallStore geometry. Injected here, after the
        // base projection, so they appear on the A-DOOR layer alongside projected door edges.
        if (
            viewDef.viewType === 'plan' ||
            viewDef.viewType === 'detail' ||
            viewDef.viewType === 'structural-plan'
        ) {
            doorPlanSymbolBuilder.inject(drawing, viewDef);
            // Contract 48 §5: every sofa-part mesh tags userData.skipInPlan so its
            // beveled edges are excluded from the base projection above; this
            // injector replaces them with a clean architectural plan symbol on
            // the A-FURN layer (UUID-registered for selection).
            sofaPlanSymbolBuilder.inject(drawing, viewDef);
            // Contract 48 §5 (extended for beds): same pattern — every bed-part
            // mesh (BedBuilder + BedEngine variants) tags skipInPlan so its
            // dense mattress / pillow / headboard wireframe is suppressed,
            // then this builder injects the clean AEC plan symbol on A-FURN.
            bedPlanSymbolBuilder.inject(drawing, viewDef);
            // §07-WARDROBE-VIEW-CONTRACT — same pattern for wardrobes:
            // WardrobeEngine, WardrobeCabinetEngine and WardrobeGlassBuilder
            // all tag their meshes with skipInPlan so the dense panel/door/
            // interior dump is suppressed, and this builder injects the
            // clean architectural footprint (carcass + section dividers +
            // door swing symbols) onto A-FURN with UUID registration for
            // selection.  GLB wardrobes fall through to native projection.
            wardrobePlanSymbolBuilder.inject(drawing, viewDef);
            // Same pattern for chairs: every chair-part mesh built by
            // ChairBuilder (oak posts, three-leg splays, Cesca cantilever
            // frame, Barcelona tufts, etc.) tags `userData.skipInPlan = true`
            // so the dense leg/stretcher/cushion-seam projection is suppressed,
            // and this builder injects a clean minimalist plan symbol on
            // A-FURN — rounded seat outline + soft backrest arc + optional
            // armrest ticks — UUID-registered for selection.
            chairPlanSymbolBuilder.inject(drawing, viewDef);
            // §36-KITCHEN-CABINET-ELEMENT-CONTRACT §4 — kitchens get clean
            // architectural plan symbols (carcass per arm + section dividers
            // + per-unit door/drawer/glass/shelf/blank symbols + countertop
            // overhang line) injected onto A-FURN with UUID registration.
            kitchenPlanSymbolBuilder.inject(drawing, viewDef);
            // Parametric Outdoor Tree Library (25 species, Arbol T-01..T-25):
            // ParametricTreeEngine tags every mesh with skipInPlan so the
            // foliage cluster mesh-edge dump is suppressed, and this builder
            // injects the per-archetype architectural plan symbol (canopy
            // outline + ground-shadow offset + per-archetype crown pattern
            // + trunk dot) onto A-FURN with UUID registration for selection.
            treePlanSymbolBuilder.inject(drawing, viewDef);
            // §FEAT-PLUMBING-PLAN-ELEV-SYMBOLS (L-221 P1) — plumbing fixtures tag
            // skipInPlan so their LOD400 mesh edges are suppressed above; this injects
            // the clean architectural plan symbol (bowl outline + cistern rectangle for
            // toilets, basin/tray/tub outlines for the rest) onto A-PLMB, UUID-registered.
            plumbingPlanSymbolBuilder.inject(drawing, viewDef);
        }

        // ── Phase 6: Window frame symbol injection ─────────────────────────────
        // Window frames are embedded in wall meshes; selecting a window segment
        // would return the wall UUID.  This builder injects dedicated LineSegments
        // per window with UUID registration so hitTest resolves to the window id.
        if (
            viewDef.viewType === 'plan' ||
            viewDef.viewType === 'detail' ||
            viewDef.viewType === 'structural-plan'
        ) {
            windowPlanSymbolBuilder.inject(drawing, viewDef);
        }

        // ── DOC-2.5c: Stair symbol bridge ─────────────────────────────────────
        // THREE.Line (walking lines, break lines) and THREE.ArrowHelper (direction
        // arrows) are invisible to NativeElementMeshExporter which only traverses
        // THREE.Mesh. StairSymbolTechnicalDrawingBridge reads StairPlanSymbolRegistry
        // directly and injects these objects into the drawing on the A-STRS layer.
        // Applied to plan-like views only — not section/elevation/3D.
        if (
            viewDef.viewType === 'plan' ||
            viewDef.viewType === 'detail' ||
            viewDef.viewType === 'structural-plan'
        ) {
            stairSymbolTechnicalDrawingBridge.inject(drawing, viewDef);
        }

        // ── DOC-2.5f: Roof slope arrows ────────────────────────────────────────
        // Slope arrows are a plan-only AEC convention — not visible in section/elevation.
        // Injected after all other projection passes so they render on top of roof edges.
        if (
            viewDef.viewType === 'plan' ||
            viewDef.viewType === 'detail' ||
            viewDef.viewType === 'structural-plan'
        ) {
            this._roofSlopeSymbolBuilder?.inject(drawing, viewDef);
        }

        // ── DOC-2.5g: Column crosshair center marks ────────────────────────────
        // Crosshair ✛ at each column centroid — required for construction dimensioning.
        // Plan-only symbol; columns appear as projections in section/elevation without marks.
        if (
            viewDef.viewType === 'plan' ||
            viewDef.viewType === 'detail' ||
            viewDef.viewType === 'structural-plan'
        ) {
            columnPlanSymbolBuilder.inject(drawing, viewDef);
        }

        // §FIX-PLAN-LAYERED-WALL-SYMBOL (L-62) — a LAYERED system type (e.g. "Interior –
        // Partition 100 mm") renders as a proper layered wall in 3D (one mesh per layer) but
        // PLAN showed only the plain single-volume outline. The wall's outer footprint is
        // already projected above; this injects the N−1 INTERNAL layer-boundary lines
        // (matching the 3D `WallFragmentBuilder` offsets, clipped at openings) onto A-WALL.
        // Plain (single-volume) walls emit nothing → non-layered plan is byte-identical.
        if (
            viewDef.viewType === 'plan' ||
            viewDef.viewType === 'detail' ||
            viewDef.viewType === 'structural-plan'
        ) {
            wallLayerPlanSymbolBuilder.inject(drawing, viewDef);
        }

        // §FEAT-PLUMBING-PLAN-ELEV-SYMBOLS (L-221 P3) — elevation symbol injection.
        // The GENUINELY-NEW elevation seam: plumbing fixtures opt their meshes out of
        // the generic elevation edge-dump (skipInElevation, above) and this builder
        // injects a clean silhouette + family profile onto A-PLMB. Runs BEFORE the
        // occlusion + HLR passes so injected linework is occlusion-tested like any other.
        if (isElevationView) {
            plumbingElevationSymbolBuilder.inject(drawing, viewDef);
        }

        // §FEAT-REVIT-LINE-TYPE-SEMANTICS (L-277) — Contract 23 §9 / C09 §4.6.5.
        //
        // ONE OCCLUSION ENGINE, THREE CONSUMERS. This replaces the two passes that used to
        // stand here — `reclassifyOccludedElevationLines()` (elevation-only, verb = demote to
        // the DASHED `:beyond` pen) and `removeHiddenLines()` (verb = remove, occluders from
        // `:cut` only). They were two engines answering the same question with different
        // occluder sets, and their divergence WAS the defect:
        //
        //   • plan + section built occluders from `:cut` ONLY ⇒ a PROJECTED solid occluded
        //     nothing ⇒ a section showed the far wall straight through the near one;
        //   • elevation demoted OCCLUDED geometry onto `:beyond` — the same layer the DEPTH
        //     classifier fills with everything farther than ~12 m — and `:beyond` was dashed.
        //     So "far" and "behind something" rendered identically. That is L-277.
        //
        // Now: occluders are every element's CUT section AND its depth-ordered PROJECTION
        // silhouette; occluded spans are removed (plan/section) or demoted to `:hidden` — the
        // ONE zone that dashes. The disposition is VIEW INTENT (`ViewScope`), not a branch.
        //
        // Runs AFTER all symbol injections (so door swings and stair symbols are
        // occlusion-tested like any other linework) and BEFORE the drawing is written to
        // ViewTechnicalDrawingCache — this is the last mutation point.
        applyOcclusion(drawing, {
            disposition: viewScope.occlusionDisposition,
            // A plan looks DOWN FROM its cut plane: anything above the plane (roof, ceiling)
            // has a negative depth and must not occlude, or it would erase the whole drawing.
            // Elevation/section have no such degenerate case — every visible solid may occlude.
            minProjectionOccluderDepth: isPlanView ? 0 : -Infinity,
        });

        const drawingObject = (drawing as any).three as THREE.Object3D | undefined;
        drawingObject?.parent?.remove(drawingObject);
        return drawing;
    }

    /**
     * §FIX-PLAN-PROJECT-INCREMENTAL (L-65, C04 §3.3 / DOC-1.4 Re-projection) —
     * Incremental plan-view graft.
     *
     * Projects ONLY `dirtyGroups` and grafts their projection lines onto the caller's
     * already-warm `targetDrawing`, so a single element add re-projects O(dirty)
     * elements instead of the whole view (the L-65 ~0.5 s plan-view creation lag).
     * The caller is responsible for having dropped the dirty elements' stale lines
     * (`viewTechnicalDrawingCache.invalidateElement`) BEFORE calling this — for a fresh
     * create that is a no-op; for an update it removes the pre-move linework.
     *
     * Implementation notes:
     *   • A throwaway drawing is built via the SAME `project()` path (only the dirty
     *     groups as native input, no IFC), so the grafted lines are pixel-identical to
     *     a full reprojection — there is NO divergent projection code to drift.
     *   • Only lines tagged with a dirty element's UUID are transplanted; the
     *     whole-view symbol pass that `project()` runs (door swings, etc.) targets other
     *     elements' UUIDs and is discarded with the throwaway drawing. This is why the
     *     caller must restrict grafting to pure-projection element types
     *     (PLAN_INCREMENTAL_SAFE_TYPES) whose entire representation is their own base
     *     projection.
     *   • Transplanted geometry is CLONED, so disposing the throwaway drawing never
     *     frees geometry the target now owns.
     *
     * @returns number of element line-groups grafted. `0` signals the caller that
     *          nothing was grafted (fall back to a full projection).
     */
    async projectElementsInto(
        targetDrawing:        OBC.TechnicalDrawing,
        viewDef:              ViewDefinition,
        dirtyGroups:          THREE.Group[],
        dirtyIds:             ReadonlySet<string>,
        planBelowDepthOffset: number = 0,
    ): Promise<number> {
        if (dirtyGroups.length === 0) return 0;

        // Build a throwaway drawing containing ONLY the dirty elements.
        const fresh = await this.project(viewDef, [], dirtyGroups, [], planBelowDepthOffset);
        let moved = 0;
        try {
            moved = this._transplantElementLines(fresh, targetDrawing, dirtyIds);
        } finally {
            // Release the throwaway drawing (grafted lines were cloned into the target).
            try {
                const three = (fresh as unknown as { three?: THREE.Object3D }).three;
                three?.parent?.remove(three);
                fresh.onDisposed.trigger();
            } catch { /* best-effort dispose — must never crash the graft */ }
        }

        emitPlanViewMotionEvent('project-elements-incremental', {
            'pryzm.plan_view.view_id':                 viewDef.id,
            'pryzm.plan_view.dirty_element_count':     dirtyIds.size,
            'pryzm.plan_view.grafted_line_groups':     moved,
        });
        return moved;
    }

    /**
     * §FIX-PLAN-PROJECT-INCREMENTAL — graft the dirty elements' lines into `dst`.
     *
     * IDEMPOTENT by construction: first removes any EXISTING `dst` lines tagged with a
     * dirty id, then clones the matching `src` lines in. This makes the graft safe when
     * BOTH the active-canvas driver (PlanViewManager, 30 ms) and the DOC-1.4 driver
     * (ViewDependencyTracker flush, 300 ms) graft the same element — the second graft
     * removes-then-re-adds rather than duplicating linework.
     *
     * Uses the same OBC `layers.list` → `three.children` topology as
     * `ViewTechnicalDrawingCache.invalidateElement` (the proven layer traversal).
     */
    private _transplantElementLines(
        src: OBC.TechnicalDrawing,
        dst: OBC.TechnicalDrawing,
        ids: ReadonlySet<string>,
    ): number {
        // ── Pass 1: drop any stale dst lines for the dirty ids (idempotency). ──────
        const dstLayerList = (dst as unknown as { layers?: { list?: Map<string, unknown> } }).layers?.list;
        if (dstLayerList && typeof dstLayerList.forEach === 'function') {
            dstLayerList.forEach((layer: unknown) => {
                const group = (layer as { three?: { children?: unknown[]; remove?: (c: unknown) => void } })?.three;
                if (!group || !Array.isArray(group.children)) return;
                for (const child of [...group.children]) {
                    const cu = (child as { userData?: { elementUUID?: string } })?.userData;
                    if (!cu?.elementUUID || !ids.has(cu.elementUUID)) continue;
                    const mesh = child as { geometry?: { dispose?: () => void } };
                    try { mesh.geometry?.dispose?.(); } catch { /* best-effort */ }
                    try { group.remove?.(child); } catch { /* best-effort */ }
                }
            });
        }

        // ── Pass 2: clone src lines for the dirty ids into dst. ────────────────────
        let moved = 0;
        const srcLayerList = (src as unknown as { layers?: { list?: Map<string, unknown> } }).layers?.list;
        if (!srcLayerList || typeof srcLayerList.forEach !== 'function') return 0;
        srcLayerList.forEach((layer: unknown, layerName: string) => {
            const group = (layer as { three?: { children?: unknown[] } })?.three;
            if (!group || !Array.isArray(group.children)) return;
            // Snapshot children — we read (not mutate) src, but stay defensive.
            for (const child of [...group.children]) {
                const c = child as {
                    userData?: { elementUUID?: string };
                    geometry?: THREE.BufferGeometry;
                };
                const id = c?.userData?.elementUUID;
                if (!id || !ids.has(id)) continue;
                const geo = c.geometry?.clone?.();
                if (!geo) continue;
                dst.layers.create(layerName);
                const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x000000 }));
                lines.name = layerName;
                lines.userData.layerName = layerName;
                lines.userData.elementUUID = id;
                // Re-register per-element UUID on the target for plan-view hitTest (A-1).
                registerSegmentUUID(dst, lines, id);
                dst.addProjectionLines(lines, layerName);
                moved++;
            }
        });
        return moved;
    }

    /**
     * Returns the unit THREE.Vector3 projection direction for a given ViewDefinition.
     *
     * Priority:
     * 1. `viewDef.spatial.projectionDirection` — explicit override on the view (DOC-1.2 field).
     * 2. Derived from `viewDef.viewType`.
     * 3. Falls back to plan (downward, -Y) as the default.
     */
    getDirectionForView(viewDef: ViewDefinition): THREE.Vector3 {
        const explicit = viewDef.spatial.projectionDirection;
        if (explicit) {
            return new THREE.Vector3(explicit.x, explicit.y, explicit.z).normalize();
        }

        switch (viewDef.viewType) {
            case 'plan':
            case 'structural-plan':
                return this._vecFromPreset('plan');
            case 'ceiling-plan':
                return this._vecFromPreset('ceilingPlan');
            case 'elevation':
                return this._vecFromPreset('elevationFront');
            case 'section': {
                // If the view carries a sectionPlane normal, derive direction from it.
                const n = viewDef.spatial.sectionPlane?.normal;
                if (n) return new THREE.Vector3(n[0], n[1], n[2]).normalize();
                return this._vecFromPreset('elevationFront');
            }
            default:
                return this._vecFromPreset('plan');
        }
    }

    /**
     * Resolves the near/far clip planes for the EdgeProjector from the ViewDefinition.
     *
     * §02 §1.2 — Level elevation is read from BimManager.getLevelById() on every call.
     * This method MUST NOT cache elevation values.
     *
     * For plan views the cut elevation is:
     *   BimManager.getLevelById(levelId).elevation + (spatial.cutPlaneElevation ?? 0)
     * plus the nearOffset / farOffset from spatial.viewRange (DOC-1.2 field).
     *
     * For reflected ceiling plans the clip window is resolved at call-time from
     * BimManager level data:
     *   near = level.elevation + level.height
     *   far  = near + 0.5
     */
    resolveClipRange(viewDef: ViewDefinition): ClipRange & { floorY?: number } {
        // DOC-22 §7 — Elevation and section views use DEPTH-space clip ranges
        // (metres along the projection direction from the view origin), not
        // world-Y elevation values.  Use viewRange.nearOffset / farOffset as
        // explicit depth overrides; fall back to safe coverage defaults.
        if (viewDef.viewType === 'elevation' || viewDef.viewType === 'section') {
            const nearDepth = viewDef.spatial.viewRange?.nearOffset ?? 0;
            const farDepth  = viewDef.crop?.farClip?.offset ?? viewDef.spatial.viewRange?.farOffset ?? DEFAULT_ELEVATION_FAR_DEPTH;
            console.log(
                `[EdgeProjectorService] resolveClipRange() ${viewDef.viewType} depth ` +
                `near=${nearDepth.toFixed(3)} far=${farDepth.toFixed(3)}`,
            );
            return { near: nearDepth, far: farDepth };
        }

        const levelId = viewDef.spatial.levelId;

        // §02 §1.2 — Always call getLevelById; never cache.
        const level = levelId ? this._bimManager.getLevelById(levelId) : undefined;
        const levelElevation = level?.elevation ?? FALLBACK_CUT_ELEVATION;

        console.log(
            `[EdgeProjectorService] resolveClipRange() levelId=${levelId ?? 'none'} ` +
            `elevation=${levelElevation.toFixed(3)}`,
        );

        if (viewDef.viewType === 'ceiling-plan') {
            const levelHeight = level?.height ?? DEFAULT_FAR_OFFSET;
            const ceilingHeight = levelElevation + levelHeight;
            const near = ceilingHeight;
            const far = ceilingHeight + 0.5;

            console.log(
                `[EdgeProjectorService] resolveClipRange() RCP ` +
                `height=${levelHeight.toFixed(3)} near=${near.toFixed(3)} far=${far.toFixed(3)}`,
            );

            return { near, far };
        }

        // DOC-1.5d — DEFINITIVE REFERENCE FRAME CONTRACT:
        // Both nearOffset and farOffset are IN METRES FROM THE LEVEL FLOOR ELEVATION.
        //
        //   nearOffset = distance above floor of the cut plane (default: 1.2 m).
        //   farOffset  = distance above floor of the TOP of the view range (default: 3.0 m).
        //
        //   nearPlane (world-Y) = floorElevation + nearOffset  — cut plane elevation
        //   farPlane  (world-Y) = floorElevation + farOffset   — top of visible range
        //
        // Elements with geometry between [floorElevation, floorElevation + farOffset] are
        // projected. Elements above farOffset are excluded.
        // See ViewDefinitionTypes.ts §spatial.viewRange JSDoc for full contract.
        const nearOffset = viewDef.spatial.viewRange?.nearOffset ?? DEFAULT_NEAR_OFFSET;
        const farOffset  = viewDef.spatial.viewRange?.farOffset  ?? DEFAULT_FAR_OFFSET;

        const near = levelElevation + nearOffset;  // cut plane — upper clip boundary
        const far  = levelElevation + farOffset;   // top of view range — DOC-1.5d fix

        return { near, far, floorY: levelElevation };
    }

    dispose(): void {
        // EdgeProjector and TechnicalDrawings are OBC components — disposed by Components.dispose().
        // No local resources to release.
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /** Build a ModelIdMap from an array of FragmentsModel — all geometry items. */
    private async _buildModelIdMap(
        models: FRAGS.FragmentsModel[],
    ): Promise<OBC.ModelIdMap> {
        const map: OBC.ModelIdMap = {};
        for (const model of models) {
            const localIds = await model.getItemsIdsWithGeometry();
            if (localIds.length > 0) {
                map[model.modelId] = new Set(localIds);
            }
        }
        return map;
    }

    /** Convert a VIEW_PROJECTION_DIRECTIONS preset to a THREE.Vector3. */
    private _vecFromPreset(key: keyof typeof VIEW_PROJECTION_DIRECTIONS): THREE.Vector3 {
        const p = VIEW_PROJECTION_DIRECTIONS[key];
        return new THREE.Vector3(p.x, p.y, p.z);
    }
}
