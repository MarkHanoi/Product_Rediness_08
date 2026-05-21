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
import { removeHiddenLines } from '@pryzm/core-app-model';
import type * as FRAGS from '@thatopen/fragments';
import { ViewDefinition, VIEW_PROJECTION_DIRECTIONS } from '@pryzm/core-app-model';
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
import { annotationStore } from '@pryzm/plugin-annotations';

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Default AEC cut height above floor — 1 200 mm (standard door/window cut).
 * DOC-1.5d: nearOffset is metres FROM THE LEVEL FLOOR ELEVATION (not below the cut plane).
 */
const DEFAULT_NEAR_OFFSET = 1.2;

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
function _suppressPlanViewOpeningLines(
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

        zones.push({ min: offset - width / 2, max: offset + width / 2 });
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

    const TOL = 0.035;         // 35 mm gap tolerance at jamb edges
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
            const zMin = zone.min - TOL;
            const zMax = zone.max + TOL;
            const next: Array<[number, number]> = [];
            for (const [lo, hi] of intervals) {
                if (hi <= zMin || lo >= zMax) {
                    next.push([lo, hi]);           // Entirely outside zone — keep
                } else {
                    if (lo < zMin) next.push([lo, zMin]); // Left remainder
                    if (hi > zMax) next.push([zMax, hi]); // Right remainder
                    // Portion [zMin..zMax] is within the opening — suppressed
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
        const leftBase = start.clone().addScaledVector(dir, offset - width / 2);
        const rightBase = start.clone().addScaledVector(dir, offset + width / 2);
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

        for (const edgeOffset of [offset - width / 2, offset + width / 2]) {
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
function classifyByVertexY(
    srcGeo:     THREE.BufferGeometry,
    cutPlaneY:  number,
    floorY:     number | null = null,
    epsilon:    number = CUT_LINE_EPSILON,
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
        // Segments with average Y below the level floor → beyond reference linework.
        const isBeyond = floorY !== null && !isCut && avgY < floorY - epsilon;
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
 * Default depth range for elevation/section views (metres along projection direction).
 * Must cover the full depth of a typical building floor-plate.
 * DOC-22 §7: 50 m is a safe conservative maximum; the EdgeProjector clips
 * any geometry beyond this depth from the view origin.
 */
const DEFAULT_ELEVATION_FAR_DEPTH = 50.0;

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
        readonly layers:       ReadonlyMap<string, THREE.BufferGeometry>;
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

    private _cwCacheIsValid(elementId: string, viewId: string, currentVersion: number): boolean {
        return this._cwProjectionCache.get(elementId)?.get(viewId)?.version === currentVersion;
    }

    private _getCwCached(elementId: string, viewId: string): ReadonlyMap<string, THREE.BufferGeometry> | null {
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
            entry.layers.forEach(geo => geo.dispose());
            inner.delete(oldestViewId);
            if (inner.size === 0) this._cwProjectionCache.delete(oldestElementId);
            this._cwCacheEntryCount--;
        }
    }

    private _putCwCache(
        elementId: string,
        viewId: string,
        version: number,
        layers: Map<string, THREE.BufferGeometry>,
    ): void {
        let inner = this._cwProjectionCache.get(elementId);
        if (!inner) {
            inner = new Map();
            this._cwProjectionCache.set(elementId, inner);
        }
        const existing = inner.get(viewId);
        if (existing) {
            existing.layers.forEach(geo => geo.dispose());
        } else {
            // §C.2.2 — New entry: enforce LRU cap before inserting.
            if (this._cwCacheEntryCount >= EdgeProjectorService.MAX_CW_PROJECTION_CACHE) {
                this._evictLruCwEntry();
            }
            this._cwCacheEntryCount++;
        }
        inner.set(viewId, {
            version,
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
            inner.forEach(entry => entry.layers.forEach(geo => geo.dispose()));
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
                entry.layers.forEach(geo => geo.dispose());
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
            inner.forEach(entry => entry.layers.forEach(geo => geo.dispose()));
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
                // last projection.  Cache key: (elementUUID, viewId, version) — the
                // `version` is stamped by every fragment builder on every rebuild,
                // so a cache miss equals "geometry actually changed".
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
                    if (this._cwCacheIsValid(elementUUID, viewId, currentVer)) {
                        // §C.3.2 — CACHE HIT: replay stored drawing-space geometries directly.
                        // Skips: group.traverse(), N×EdgesGeometry, N×matrixWorld, mergeGeometries,
                        //        OBC.TechnicalDrawing.toDrawingSpace(), and opening suppressors.
                        const cachedLayers = this._getCwCached(elementUUID, viewId)!;
                        for (const [sublayerName, cachedGeo] of cachedLayers) {
                            drawing.layers.create(sublayerName);
                            // Clone the cached geometry so the drawing owns its copy and
                            // OBC disposal cannot corrupt the cache on drawing teardown.
                            const hitLines = new THREE.LineSegments(
                                (cachedGeo as THREE.BufferGeometry).clone(),
                                new THREE.LineBasicMaterial({ color: 0x000000 }),
                            );
                            hitLines.name = sublayerName;
                            hitLines.userData.layerName = sublayerName;
                            if (elementUUID) {
                                hitLines.userData.elementUUID = elementUUID;
                                registerSegmentUUID(drawing, hitLines, elementUUID);
                            }
                            drawing.addProjectionLines(hitLines, sublayerName);
                        }
                        console.log(
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
                const freshLayersCollector: Map<string, THREE.BufferGeometry> | null =
                    (isCacheableElement && elementUUID !== undefined && currentVer !== undefined)
                        ? new Map()
                        : null;

                const __t_group_start = performance.now();
                let __diag_edge_count = 0;
                let __diag_mesh_count = 0;

                // Collect EdgesGeometry instances per ISO layer for this element only.
                const perElemLayerGeos = new Map<string, THREE.BufferGeometry[]>();
                const perElemLayerCutGeos = new Map<string, THREE.BufferGeometry[]>();

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

                        const elementType = mesh.userData?.elementType as string | undefined;
                        const layerName   = (elementType
                            ? (ELEMENT_TYPE_TO_PROJECTION_LAYER[elementType] ?? FALLBACK_NATIVE_LAYER)
                            : FALLBACK_NATIVE_LAYER);

                        mesh.updateWorldMatrix(true, false);
                        try {
                            const meshWorldBox = getMeshWorldAABB(mesh);
                            if (sectionVolumeBox && (!meshWorldBox || !sectionBoxIntersectsWorldAABB(sectionVolumeBox, meshWorldBox))) return;
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
                            if (__edge_ms > 2 || _hasCWElements) {
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
                            if (sectionDepthBands) {
                                const meshCutGeo = buildMeshPlaneIntersectionGeometry(mesh, viewDef, direction, near, sectionVolumeBox);
                                if (meshCutGeo) {
                                    if (!perElemLayerCutGeos.has(layerName)) perElemLayerCutGeos.set(layerName, []);
                                    perElemLayerCutGeos.get(layerName)!.push(meshCutGeo);
                                }
                            }
                        } catch {
                            // Skip meshes with degenerate geometry.
                        }
                    }
                });

                // §DIAG-EPS-02: per-group traverse summary — total proxies processed and edge vertices.
                const __t_traverse_done = performance.now();
                console.log(
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
                    if (_hasCWElements || geos.length > 1) {
                        console.log(
                            `[EdgeProjectorService] §DIAG-EPS-03 mergeGeometries ` +
                            `layer=${layerName} geoCount=${geos.length} ` +
                            `mergedVerts=${__merged_verts} mergeMs=${(__t_merge_done - __t_merge_start).toFixed(1)}ms`
                        );
                    }
                    for (const g of meshCutGeos) tempGeosToDispose.push(g);

                    // DOC-1.13: Create the ISO 13567 layer on the drawing so
                    // addProjectionLines() can assign the material properly.
                    // DrawingLayers.create() is idempotent — returns existing layer if present.
                    drawing.layers.create(layerName);

                    const addProjectedLayer = (geo: THREE.BufferGeometry, targetLayerName: string): void => {
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
                        if (__tds_ms > 5 || _hasCWElements) {
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
                        if (!isPlanView && layerName === 'A-WALL' && !/:cut$/i.test(targetLayerName)) {
                            _suppressWallOpeningSeams(projected, drawing, group);
                        }
                        // Plan-view: clip A-WALL lines at door/window opening zones so that
                        // no wall layer edges cross through the opening gap. Both :cut and
                        // :proj sub-layers are processed — the outline box geometry (which
                        // spans the full wall length) produces both kinds of along-wall edges.
                        if (isPlanView && layerName === 'A-WALL' && cutPlaneY !== null) {
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
                                freshLayersCollector.set(targetLayerName, projGeo.clone());
                            }
                        }
                        drawing.addProjectionLines(projected, targetLayerName);
                    };

                    if (cutPlaneY !== null && mergedGeo) {
                        const { cutGeo, projGeo, beyondGeo } = classifyByVertexY(mergedGeo, cutPlaneY, planFloorY);
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
                    } else if (
                        sectionDepthBands &&
                        viewDef.viewType === 'elevation' &&
                        layerName === 'A-WALL' &&
                        mergedGeo
                    ) {
                        const cutParts = [...meshCutGeos];
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
                            cutParts.push(classified.cutGeo);
                            tempGeosToDispose.push(classified.cutGeo);
                        }
                        if (classified.projGeo) tempGeosToDispose.push(classified.projGeo);
                        if (classified.beyondGeo) tempGeosToDispose.push(classified.beyondGeo);
                        const mergedCutGeo = concatLineGeometries(cutParts);
                        if (mergedCutGeo) {
                            addProjectedLayer(mergedCutGeo, _layerCut(layerName));
                            tempGeosToDispose.push(mergedCutGeo);
                        }
                        const wallProjectionParts = [classified.projGeo, classified.beyondGeo]
                            .filter((geo): geo is THREE.BufferGeometry => !!geo);
                        const clippedWallProjectionGeo = concatLineGeometries(wallProjectionParts);
                        if (clippedWallProjectionGeo) {
                            addProjectedLayer(clippedWallProjectionGeo, _layerProj(layerName));
                            tempGeosToDispose.push(clippedWallProjectionGeo);
                        }
                    } else if (sectionDepthBands) {
                        const cutParts = [...meshCutGeos];
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
                                cutParts.push(classified.cutGeo);
                                tempGeosToDispose.push(classified.cutGeo);
                            }
                            projGeo = classified.projGeo;
                            beyondGeo = classified.beyondGeo;
                        }
                        const mergedCutGeo = concatLineGeometries(cutParts);
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
                    this._putCwCache(elementUUID, viewId, currentVer, freshLayersCollector);
                    cacheMisses++;
                    console.log(
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

                    const layerName   = elementType
                        ? (ELEMENT_TYPE_TO_PROJECTION_LAYER[elementType] ?? FALLBACK_NATIVE_LAYER)
                        : FALLBACK_NATIVE_LAYER;

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
                            // beyondGeo captures segments below the level floor when planFloorY is set.
                            const { cutGeo, projGeo, beyondGeo } = classifyByVertexY(edgesGeo, cutPlaneY, planFloorY);
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
                            // Section/elevation: classify edges as cut / proj / beyond along view depth.
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
                            const mergedCut = concatLineGeometries(cutParts);
                            if (mergedCut) { addIfcLayer(mergedCut, _layerCut(layerName)); mergedCut.dispose(); }
                            if (classified.projGeo) { addIfcLayer(classified.projGeo, _layerProj(layerName)); classified.projGeo.dispose(); }
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

        // Contract 23 §9 — HLR pass (v1: depth-bucket / AABB approach).
        // Must run AFTER all symbol injections so that injected linework (door
        // swings, stair symbols, etc.) is also tested against occluders.
        // Must run BEFORE the drawing is written to ViewTechnicalDrawingCache
        // (the caller does that — this is the last mutation point).
        removeHiddenLines(drawing);

        const drawingObject = (drawing as any).three as THREE.Object3D | undefined;
        drawingObject?.parent?.remove(drawingObject);
        return drawing;
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
