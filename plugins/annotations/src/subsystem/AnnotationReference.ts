/**
 * §ANN-A1 — Stable Reference System
 *
 * A StableReference identifies a specific geometric point or sub-element on a
 * BIM element using semantic keys — NOT Three.js mesh indices (which change on
 * geometry rebuild). The stableKey survives:
 *   - Wall height / type changes (geometry rebuild)
 *   - Undo/redo cycles
 *   - Serialisation / deserialisation
 *
 * Contract compliance:
 *   §05 §7.8 — No bim-* / @thatopen/ui elements
 *   §01 §5   — Pure data types; no DOM, no Three.js imports
 */

import * as THREE from '@pryzm/renderer-three/three';

// ─────────────────────────────────────────────────────────────────────────────
// Sub-element semantic descriptors
// ─────────────────────────────────────────────────────────────────────────────

export type SubElementType =
    | 'start'           // baseLine[0] for linear elements (wall, beam, grid)
    | 'end'             // baseLine[1]
    | 'midpoint'        // lerp(0.5) along baseLine
    | 'param'           // arbitrary lerp param along baseLine (0→1)
    | 'face:exterior'   // finish exterior face at ref.index param (0→1)
    | 'face:interior'   // finish interior face at ref.index param (0→1)
    | 'core:exterior'   // §DIM-I1 — core exterior boundary at ref.index param
    | 'core:interior'   // §DIM-I1 — core interior boundary at ref.index param
    | 'wall:centerline' // §DIM-I1 — wall baseline / location line at ref.index param
    | 'core:centerline' // §DIM-I1 — midplane of core assembly at ref.index param
    | 'edge'            // specific edge index on a polygon element (slab, roof)
    | 'centroid'        // geometric centre
    | 'axis'            // column/beam axis point
    | 'level'           // elevation of a level object
    | 'point'           // free world-space point (not tied to an element)
    ;

// ─────────────────────────────────────────────────────────────────────────────
// StableReference — the core data structure
// ─────────────────────────────────────────────────────────────────────────────

export interface StableReference {
    elementId: string;
    elementType: 'wall' | 'slab' | 'column' | 'beam' | 'grid' | 'level' | 'point' | string;
    subElement: SubElementType;
    /** For 'edge' → edge index; for 'param' → value 0→1; ignored for most types */
    index?: number;
    /** Serialisable, stable key built from the above — used for dependency lookup */
    stableKey: string;
    /** Cached world-space position — refreshed by AnnotationDependencyGraph */
    cachedPosition?: { x: number; y: number; z: number };
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory helpers
// ─────────────────────────────────────────────────────────────────────────────

export function makeStableKey(
    elementType: string,
    elementId: string,
    subElement: SubElementType,
    index?: number
): string {
    const idx = index !== undefined ? `:${index}` : '';
    return `${elementType}-${elementId}:${subElement}${idx}`;
}

export function makeRef(
    elementType: string,
    elementId: string,
    subElement: SubElementType,
    index?: number
): StableReference {
    return {
        elementId,
        elementType,
        subElement,
        index,
        stableKey: makeStableKey(elementType, elementId, subElement, index),
    };
}

export function makePointRef(worldPosition: THREE.Vector3): StableReference {
    // ANNOTATION-SYSTEM-AUDIT-2026 B7 — previously the elementId encoded the
    // exact world coordinates ("point:0.0000,0.0000,0.0000"), which produced
    // collisions for any two free-floating annotations placed at the origin
    // and made the dependency graph treat them as the same element. We now
    // mint a unique randomUUID for the elementId and stableKey, and store the
    // position only in `cachedPosition` (which is what every resolver reads).
    const id = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
        ? crypto.randomUUID()
        : `point-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    return {
        elementId: id,
        elementType: 'point',
        subElement: 'point',
        stableKey: `point:${id}`,
        cachedPosition: { x: worldPosition.x, y: worldPosition.y, z: worldPosition.z },
    };
}

/**
 * makeWallFaceRef — §DIM-I3
 *
 * Factory helper for wall face references produced by the Revit-grade
 * LinearDimensionAnnotationTool. Encodes the semantic face type and the
 * position along the baseline (param 0→1) into a StableReference that
 * survives geometry rebuilds.
 *
 * The `index` field carries the `param` value — consistent with the
 * existing convention for 'param' and 'edge' sub-element types.
 *
 * @param wallId   - WallData.id from WallStore
 * @param faceType - Semantic face (e.g. 'face:exterior', 'core:interior')
 * @param param    - 0→1 position along the wall baseline
 */
export function makeWallFaceRef(
    wallId: string,
    faceType: 'face:exterior' | 'face:interior' | 'wall:centerline' | 'core:exterior' | 'core:interior' | 'core:centerline',
    param: number
): StableReference {
    const clampedParam = Math.max(0, Math.min(1, param));
    return {
        elementId:   wallId,
        elementType: 'wall',
        subElement:  faceType,
        index:       clampedParam,
        stableKey:   makeStableKey('wall', wallId, faceType, clampedParam),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reference resolver — maps a StableReference to a THREE.Vector3
// using the appropriate store from the store bag.
// Returns null if the element cannot be resolved.
// ─────────────────────────────────────────────────────────────────────────────

export interface ResolverStores {
    wallStore?: any;
    slabStore?: any;
    columnStore?: any;
    beamStore?: any;
    gridStore?: any;
    windowStore?: any;
    doorStore?: any;
    curtainWallStore?: any;
    curtainPanelStore?: any;
    bimManager?: any;
}

export function resolveReferenceToPoint(
    ref: StableReference,
    stores: ResolverStores
): THREE.Vector3 | null {
    if (ref.elementType === 'point') {
        if (ref.cachedPosition) {
            return new THREE.Vector3(ref.cachedPosition.x, ref.cachedPosition.y, ref.cachedPosition.z);
        }
        return null;
    }

    if (ref.elementType === 'wall') {
        const wall = stores.wallStore?.getById?.(ref.elementId);
        if (!wall) return null;
        return resolveWallPoint(wall, ref);
    }

    if (ref.elementType === 'window') {
        const win = stores.windowStore?.getById?.(ref.elementId);
        if (!win) return null;
        const wall = stores.wallStore?.getById?.(win.wallId);
        if (!wall) return null;
        return resolveHostedOpeningPoint(win, wall, ref);
    }

    if (ref.elementType === 'door') {
        const door = stores.doorStore?.getById?.(ref.elementId);
        if (!door) return null;
        const wall = stores.wallStore?.getById?.(door.wallId);
        if (!wall) return null;
        return resolveHostedOpeningPoint(door, wall, ref);
    }

    if (ref.elementType === 'curtain-wall') {
        const cw = stores.curtainWallStore?.getById?.(ref.elementId)
            ?? stores.curtainWallStore?.get?.(ref.elementId);
        if (!cw) return null;
        return resolveCurtainWallPoint(cw, ref);
    }

    if (ref.elementType === 'curtain-panel') {
        const panel = stores.curtainPanelStore?.get?.(ref.elementId)
            ?? stores.curtainPanelStore?.getById?.(ref.elementId);
        if (!panel) return null;
        const cw = stores.curtainWallStore?.getById?.(panel.curtainWallId)
            ?? stores.curtainWallStore?.get?.(panel.curtainWallId);
        if (!cw) return null;
        return resolveCurtainPanelPoint(cw, panel, ref);
    }

    if (ref.elementType === 'slab') {
        const slab = stores.slabStore?.getById?.(ref.elementId);
        if (!slab) return null;
        return resolveSlabPoint(slab, ref);
    }

    if (ref.elementType === 'column') {
        const col = stores.columnStore?.getById?.(ref.elementId);
        if (!col) return null;
        return resolveColumnPoint(col, ref);
    }

    if (ref.elementType === 'beam') {
        const beam = stores.beamStore?.getById?.(ref.elementId);
        if (!beam) return null;
        return resolveBeamPoint(beam, ref);
    }

    if (ref.elementType === 'grid') {
        const grid = stores.gridStore?.getById?.(ref.elementId);
        if (!grid) return null;
        return resolveGridPoint(grid, ref);
    }

    if (ref.elementType === 'level') {
        const levels = stores.bimManager?.getLevels?.() as any[] | undefined;
        const lvl = levels?.find((l: any) => l.id === ref.elementId);
        if (!lvl) return null;
        return new THREE.Vector3(0, lvl.elevation ?? 0, 0);
    }

    // Use cached position as fallback for unknown element types
    if (ref.cachedPosition) {
        return new THREE.Vector3(ref.cachedPosition.x, ref.cachedPosition.y, ref.cachedPosition.z);
    }

    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// §DIM-I2 — Private wall-face geometry helpers
//
// These are intentionally private to this module (not re-exported) to keep
// AnnotationReference self-contained with no cross-module dependency on the
// WallFaceDetector utility.  The logic mirrors WallFaceDetector exactly; if
// the core-offset algorithm changes, update both files together.
// ─────────────────────────────────────────────────────────────────────────────

/** Returns finish-layer cladding thickness on each side of a wall. */
function _annWallCoreOffsets(layers: { function: string; thickness: number }[] | undefined): {
    exteriorFinish: number;
    interiorFinish: number;
} {
    if (!layers || layers.length === 0) return { exteriorFinish: 0, interiorFinish: 0 };

    const firstStructIdx = layers.findIndex(l => l.function === 'structure');
    if (firstStructIdx === -1) return { exteriorFinish: 0, interiorFinish: 0 };

    let lastStructIdx = firstStructIdx;
    for (let i = layers.length - 1; i > firstStructIdx; i--) {
        if (layers[i]!.function === 'structure') { lastStructIdx = i; break; }
    }

    const exteriorFinish = layers.slice(0, firstStructIdx).reduce((s, l) => s + l.thickness, 0);
    const interiorFinish = layers.slice(lastStructIdx + 1).reduce((s, l) => s + l.thickness, 0);
    return { exteriorFinish, interiorFinish };
}

/**
 * Signed perpendicular offset from the wall centreline to a face plane (metres).
 * +perp = exterior side, −perp = interior side.
 */
function _annWallFaceSignedOffset(
    subElement: SubElementType,
    halfThick: number,
    exteriorFinish: number,
    interiorFinish: number
): number {
    switch (subElement) {
        case 'face:exterior':   return  halfThick;
        case 'face:interior':   return -halfThick;
        case 'wall:centerline': return  0;
        case 'core:exterior':   return  halfThick - exteriorFinish;
        case 'core:interior':   return -(halfThick - interiorFinish);
        case 'core:centerline': {
            const coreExt = halfThick - exteriorFinish;
            const coreInt = -(halfThick - interiorFinish);
            return (coreExt + coreInt) * 0.5;
        }
        default: return 0;
    }
}

// ─── Per-element-type point resolvers ────────────────────────────────────────

function resolveWallPoint(wall: any, ref: StableReference): THREE.Vector3 | null {
    const bl = wall.baseLine;
    if (!bl || bl.length < 2) return null;
    const s = new THREE.Vector3(bl[0].x, bl[0].y, bl[0].z);
    const e = new THREE.Vector3(bl[1].x, bl[1].y, bl[1].z);

    switch (ref.subElement) {
        case 'start': return s;
        case 'end':   return e;
        case 'midpoint': return new THREE.Vector3().lerpVectors(s, e, 0.5);
        case 'param': {
            const t = Math.max(0, Math.min(1, ref.index ?? 0.5));
            return new THREE.Vector3().lerpVectors(s, e, t);
        }
        // §DIM-I2 — Fixed: use ref.index as the baseline param (was hardcoded 0.5).
        // All six face sub-types share the same resolution pattern:
        //   1. lerp along baseline at param = ref.index
        //   2. offset perpendicularly by the face's signed distance from centreline
        case 'face:exterior':
        case 'face:interior':
        case 'wall:centerline':
        case 'core:exterior':
        case 'core:interior':
        case 'core:centerline': {
            const dir  = new THREE.Vector3().subVectors(e, s).normalize();
            const perp = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
            // Use ref.index as the param along the baseline (0→1).
            // Falls back to 0.5 only for legacy refs that pre-date §DIM-I3.
            const t         = Math.max(0, Math.min(1, ref.index ?? 0.5));
            const basePoint = new THREE.Vector3().lerpVectors(s, e, t);
            const halfThick = (wall.thickness ?? 0.2) * 0.5;
            const { exteriorFinish, interiorFinish } = _annWallCoreOffsets(wall.layers);
            const offset = _annWallFaceSignedOffset(ref.subElement, halfThick, exteriorFinish, interiorFinish);
            return basePoint.addScaledVector(perp, offset);
        }
        default: return new THREE.Vector3().lerpVectors(s, e, 0.5);
    }
}

function openingCodeToAxis(code: number | undefined): { h: number; v: 'base' | 'sill' | 'top' | 'mid' } {
    const n = Math.max(0, Math.round(code ?? 0));
    const h = n % 3;
    const vCode = Math.floor(n / 3);
    const v = vCode === 1 ? 'sill' : vCode === 2 ? 'top' : vCode === 3 ? 'mid' : 'base';
    return { h: h === 0 ? -0.5 : h === 2 ? 0.5 : 0, v };
}

function resolveHostedOpeningPoint(opening: any, wall: any, ref: StableReference): THREE.Vector3 | null {
    const bl = wall.baseLine;
    if (!bl || bl.length < 2) return null;
    const s = new THREE.Vector3(bl[0].x, bl[0].y, bl[0].z);
    const e = new THREE.Vector3(bl[1].x, bl[1].y, bl[1].z);
    const dir = new THREE.Vector3().subVectors(e, s);
    const len = dir.length();
    if (len < 0.001) return null;
    dir.divideScalar(len);

    const axis = openingCodeToAxis(ref.index);
    const along = (opening.offset ?? len * 0.5) + (opening.width ?? 0) * axis.h;
    const y = axis.v === 'top'
        ? s.y + (opening.sillHeight ?? 0) + (opening.height ?? 0)
        : axis.v === 'sill'
            ? s.y + (opening.sillHeight ?? 0)
            : axis.v === 'mid'
                ? s.y + (opening.sillHeight ?? 0) + (opening.height ?? 0) * 0.5
                : s.y;

    return s.clone().addScaledVector(dir, along).setY(y);
}

function resolveCurtainWallPoint(cw: any, ref: StableReference): THREE.Vector3 | null {
    const bl = cw.baseLine;
    if (!bl || bl.length < 2) return null;
    const s = new THREE.Vector3(bl[0].x, bl[0].y, bl[0].z);
    const e = new THREE.Vector3(bl[1].x, bl[1].y, bl[1].z);
    const t = ref.subElement === 'start' ? 0 : ref.subElement === 'end' ? 1 : Math.max(0, Math.min(1, ref.index ?? 0.5));
    return new THREE.Vector3().lerpVectors(s, e, t);
}

function resolveCurtainPanelPoint(cw: any, panel: any, ref: StableReference): THREE.Vector3 | null {
    const bl = cw.baseLine;
    if (!bl || bl.length < 2) return null;
    const s = new THREE.Vector3(bl[0].x, bl[0].y, bl[0].z);
    const e = new THREE.Vector3(bl[1].x, bl[1].y, bl[1].z);
    const dir = new THREE.Vector3().subVectors(e, s);
    const len = dir.length();
    if (len < 0.001) return null;
    dir.divideScalar(len);

    const fallbackColumns = Math.max(1, Math.floor(len / Math.max(0.001, Number(cw.gridXSpacing ?? len))));
    const fallbackRows = Math.max(1, Math.floor(Number(cw.height ?? 3) / Math.max(0.001, Number(cw.gridYSpacing ?? cw.height ?? 3))));
    const uLines = (cw.gridSystem?.uLines ?? []).map((l: any) => Number(l.t)).filter(Number.isFinite).sort((a: number, b: number) => a - b);
    const vLines = (cw.gridSystem?.vLines ?? []).map((l: any) => Number(l.t)).filter(Number.isFinite).sort((a: number, b: number) => a - b);
    const columns = Math.max(1, uLines.length >= 2 ? uLines.length - 1 : fallbackColumns);
    const rows = Math.max(1, vLines.length >= 2 ? vLines.length - 1 : fallbackRows);
    const i = Math.max(0, Math.min(columns - 1, Number(panel.cellIndex?.[0] ?? 0)));
    const j = Math.max(0, Math.min(rows - 1, Number(panel.cellIndex?.[1] ?? 0)));
    const code = Math.max(0, Math.round(ref.index ?? 0));
    const h = code % 3;
    const v = Math.floor(code / 3);
    const u0 = uLines.length >= 2 ? uLines[i] : i / columns;
    const u1 = uLines.length >= 2 ? uLines[i + 1] : (i + 1) / columns;
    const v0 = vLines.length >= 2 ? vLines[j] : j / rows;
    const v1 = vLines.length >= 2 ? vLines[j + 1] : (j + 1) / rows;
    const u = h === 0 ? u0 : h === 2 ? u1 : (u0 + u1) * 0.5;
    const vt = v === 2 ? v1 : v === 1 ? (v0 + v1) * 0.5 : v0;
    const y = s.y + Number(cw.baseOffset ?? 0) + Number(cw.height ?? 3) * vt;
    return s.clone().addScaledVector(dir, len * u).setY(y);
}

function resolveSlabPoint(slab: any, ref: StableReference): THREE.Vector3 | null {
    const pts: THREE.Vector3[] = [];
    (slab.boundary ?? slab.points ?? []).forEach((p: any) => {
        pts.push(new THREE.Vector3(p.x, p.y ?? slab.elevation ?? 0, p.z ?? p.y ?? 0));
    });
    if (pts.length === 0) return null;

    switch (ref.subElement) {
        case 'centroid': {
            const c = new THREE.Vector3();
            pts.forEach(p => c.add(p));
            return c.divideScalar(pts.length);
        }
        case 'edge': {
            const i = (ref.index ?? 0) % pts.length;
            const j = (i + 1) % pts.length;
            return new THREE.Vector3().lerpVectors(pts[i]!, pts[j]!, 0.5);
        }
        default: {
            const c = new THREE.Vector3();
            pts.forEach(p => c.add(p));
            return c.divideScalar(pts.length);
        }
    }
}

function resolveColumnPoint(col: any, ref: StableReference): THREE.Vector3 | null {
    if (!col.position) return null;
    const { x = 0, y = 0, z = 0 } = col.position;
    const height = col.height ?? 3;
    switch (ref.subElement) {
        case 'start': return new THREE.Vector3(x, y, z);
        case 'end':   return new THREE.Vector3(x, y + height, z);
        default:      return new THREE.Vector3(x, y + height * 0.5, z);
    }
}

function resolveBeamPoint(beam: any, ref: StableReference): THREE.Vector3 | null {
    const bl = beam.baseLine ?? (beam.start && [beam.start, beam.end]);
    if (!bl || bl.length < 2) return null;
    const s = new THREE.Vector3(bl[0].x, bl[0].y, bl[0].z);
    const e = new THREE.Vector3(bl[1].x, bl[1].y, bl[1].z);
    switch (ref.subElement) {
        case 'start': return s;
        case 'end':   return e;
        default:      return new THREE.Vector3().lerpVectors(s, e, 0.5);
    }
}

function resolveGridPoint(grid: any, ref: StableReference): THREE.Vector3 | null {
    if (!grid.start || !grid.end) return null;
    const s = new THREE.Vector3(grid.start.x, 0, grid.start.z ?? grid.start.y);
    const e = new THREE.Vector3(grid.end.x, 0, grid.end.z ?? grid.end.y);
    switch (ref.subElement) {
        case 'start': return s;
        case 'end':   return e;
        default:      return new THREE.Vector3().lerpVectors(s, e, 0.5);
    }
}
