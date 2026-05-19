// @pryzm/input-host — SelectionBoundsRegistry
//
// Sprint F-2.0 §E2: extracts element-type-specific highlight geometry from
// `SelectionManager.applyHighlight()` into a pluggable registry.
//
// Motivation
// ──────────
// The former `applyHighlight` contained a 550-line if/else chain for 9
// element types.  Plugins that add custom element types (e.g. curtain-wall
// sub-elements, structural beams, MEP ducts) had no way to register a
// custom highlight shape without forking SelectionManager.
//
// This registry maps element-type strings → builder functions.
// `SelectionManager.applyHighlight()` calls `_boundsRegistry.build()` and
// then applies the result — keeping all Three.js scene-management side
// effects (transformControls, levelPlaneConstraint, highlightMesh) inside
// SelectionManager where they belong.
//
// Built-in builders for all 9 production element types are registered by
// `buildDefaultSelectionBoundsRegistry()` which is called once from the
// SelectionManager constructor.

import * as THREE from '@pryzm/renderer-three/three';

// ── Result types ─────────────────────────────────────────────────────────────

/** The builder should return this when the element fits in an oriented
 *  bounding box.  `SelectionManager` renders the OBB with the shared
 *  MeshBasicMaterial + EdgesGeometry helper. */
export type OBBResult = {
    readonly kind:       'obb';
    readonly center:     THREE.Vector3;
    readonly size:       THREE.Vector3;
    /** If absent, the box is axis-aligned. */
    readonly quaternion?: THREE.Quaternion;
};

/** The builder should return this when the element has a custom polygon
 *  footprint (slab, floor, ceiling, room).  The mesh is already positioned
 *  and has edge LineSegments added as a child; `SelectionManager` will set
 *  `userData.isHelper = true`, add it to the scene, and handle controls. */
export type MeshResult = {
    readonly kind: 'mesh';
    readonly mesh: THREE.Mesh;
    /** When `true`, TransformControls and LevelPlaneConstraint will NOT be
     *  attached to the object — used for spatial-context elements like rooms
     *  that the user cannot drag in the normal sense. */
    readonly skipTransformControls?: boolean;
};

export type HighlightResult = OBBResult | MeshResult;

/** A highlight builder function.  Receives the Three.js root object and
 *  returns a `HighlightResult`, or `null` to fall back to AABB. */
export type HighlightBuilderFn = (obj: THREE.Object3D) => HighlightResult | null;

// ── Internal helpers ──────────────────────────────────────────────────────────

const HIGHLIGHT_COLOR = 0x6600ff;
const POLY_PADDING    = 0.06;

/** World-space AABB fallback. */
function aabbFallback(obj: THREE.Object3D): OBBResult {
    const box    = new THREE.Box3().setFromObject(obj);
    return {
        kind:   'obb',
        center: box.getCenter(new THREE.Vector3()),
        size:   box.getSize(new THREE.Vector3()),
    };
}

/** Create a mesh with a shared highlight material and EdgesGeometry outline
 *  already added as a child.  The caller sets `mesh.position`. */
function makeEdgedMesh(geo: THREE.BufferGeometry): THREE.Mesh {
    const mat = new THREE.MeshBasicMaterial({
        color:       HIGHLIGHT_COLOR,
        transparent: true,
        opacity:     0.15,
        depthWrite:  false,
        side:        THREE.DoubleSide,
    });
    const mesh     = new THREE.Mesh(geo, mat);
    const edgesGeo = new THREE.EdgesGeometry(geo);
    const edgesMat = new THREE.LineBasicMaterial({ color: HIGHLIGHT_COLOR, linewidth: 2 });
    mesh.add(new THREE.LineSegments(edgesGeo, edgesMat));
    return mesh;
}

// ── Built-in element-type builders ───────────────────────────────────────────

function buildDoorWindow(obj: THREE.Object3D): OBBResult {
    // §03-CONTRACT: OBB aligned with the wall direction using semantic dims.
    // The frame group is centred at its local origin so getWorldPosition()
    // gives the exact OBB centre.
    const w = (obj.userData['width']  as number | undefined) ?? 1;
    const h = (obj.userData['height'] as number | undefined) ?? 1;
    const d = (obj.userData['depth']  as number | undefined) ?? 0.2;
    return {
        kind:       'obb',
        center:     obj.getWorldPosition(new THREE.Vector3()),
        size:       new THREE.Vector3(w, h, d),
        quaternion: obj.getWorldQuaternion(new THREE.Quaternion()),
    };
}

function buildWall(obj: THREE.Object3D): OBBResult {
    // §03-CONTRACT: OBB oriented along the wall baseline direction.
    const bl = obj.userData['baseLine'] as
        | [{ x: number; y: number; z: number }, { x: number; y: number; z: number }]
        | undefined;
    const wallHeight    = (obj.userData['height']    as number | undefined) ?? 3;
    const wallThickness = (obj.userData['thickness'] as number | undefined) ?? 0.2;

    if (bl && bl.length === 2) {
        const s = bl[0]!;
        const e = bl[1]!;
        const dx = e.x - s.x;
        const dz = e.z - s.z;
        const wallLength = Math.sqrt(dx * dx + dz * dz);
        const dir = wallLength > 0
            ? new THREE.Vector3(dx / wallLength, 0, dz / wallLength)
            : new THREE.Vector3(1, 0, 0);
        return {
            kind:       'obb',
            center:     new THREE.Vector3((s.x + e.x) / 2, s.y + wallHeight / 2, (s.z + e.z) / 2),
            size:       new THREE.Vector3(wallLength, wallHeight, wallThickness),
            quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir),
        };
    }
    return aabbFallback(obj);
}

function buildCurtainWall(obj: THREE.Object3D): OBBResult {
    // §03-CONTRACT: OBB along curtain-wall facing direction.
    // CurtainWallBuilder sets group.rotation.y = angle + π/2; extract yaw only.
    const cwLength = (obj.userData['length'] as number | undefined) ?? 5;
    const cwHeight = (obj.userData['height'] as number | undefined) ?? 3;
    const CW_DEPTH = 0.18;
    const cwPos  = obj.getWorldPosition(new THREE.Vector3());
    const rawQ   = obj.getWorldQuaternion(new THREE.Quaternion());
    const euler  = new THREE.Euler().setFromQuaternion(rawQ, 'YXZ');
    return {
        kind:       'obb',
        center:     new THREE.Vector3(cwPos.x, cwPos.y + cwHeight / 2, cwPos.z),
        size:       new THREE.Vector3(cwLength, cwHeight, CW_DEPTH),
        quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, euler.y, 0, 'YXZ')),
    };
}

function buildColumn(obj: THREE.Object3D): OBBResult {
    // §16 §3.7: yaw-aligned OBB, group sits at column BASE → shift centre up by h/2.
    const cw    = (obj.userData['width']  as number | undefined) ?? 0.4;
    const ch    = (obj.userData['height'] as number | undefined) ?? 3;
    const cdRaw = (obj.userData['depth']  as number | undefined);
    const cd    = (cdRaw && cdRaw > 0) ? cdRaw : cw;
    const wPos  = obj.getWorldPosition(new THREE.Vector3());
    const rawQ  = obj.getWorldQuaternion(new THREE.Quaternion());
    const euler = new THREE.Euler().setFromQuaternion(rawQ, 'YXZ');
    return {
        kind:       'obb',
        center:     new THREE.Vector3(wPos.x, wPos.y + ch / 2, wPos.z),
        size:       new THREE.Vector3(cw, ch, cd),
        quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, euler.y, 0, 'YXZ')),
    };
}

function buildSlab(obj: THREE.Object3D): HighlightResult {
    // §01 §2.12: Polygon footprint in XZ (stored as {x,y} where y=worldZ).
    // Root group at (centroidX, worldY, centroidZ) → polygon is in world XZ,
    // local coords = (p.x − worldX, p.y − worldZ).
    const polyPts = obj.userData['polygon'] as Array<{ x: number; y: number }> | undefined;
    const thickness = (obj.userData['thickness'] as number | undefined) ?? 0.25;
    const worldPos  = obj.getWorldPosition(new THREE.Vector3());

    if (polyPts && polyPts.length >= 3) {
        let signedArea = 0;
        for (let i = 0; i < polyPts.length; i++) {
            const a = polyPts[i]!;
            const b = polyPts[(i + 1) % polyPts.length]!;
            signedArea += (a.x * b.y - b.x * a.y);
        }
        let localPts = polyPts.map(p => ({ lx: p.x - worldPos.x, lz: p.y - worldPos.z }));
        if (signedArea < 0) localPts = localPts.reverse();

        const shape  = new THREE.Shape(localPts.map(p => new THREE.Vector2(p.lx, p.lz)));
        const depth  = thickness + POLY_PADDING;
        const extGeo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
        extGeo.rotateX(Math.PI / 2);
        extGeo.translate(0, depth, 0);

        const mesh = makeEdgedMesh(extGeo);
        mesh.position.copy(worldPos);
        return { kind: 'mesh', mesh };
    }
    return aabbFallback(obj);
}

function buildFloorCeiling(obj: THREE.Object3D): HighlightResult {
    // §01 §2.12: Polygon in world XZ ({x, z}); root at world origin.
    // Y extent from Box3; mesh placed at (0, yMin − padding, 0).
    const polyPts = obj.userData['polygon'] as Array<{ x: number; z: number }> | undefined;
    const b3      = new THREE.Box3().setFromObject(obj);
    const yMin    = b3.min.y;
    const yMax    = b3.max.y;
    const depth   = (yMax - yMin) + 2 * POLY_PADDING;

    if (polyPts && polyPts.length >= 3 && depth > 0) {
        let pts = polyPts.slice();
        let signedArea = 0;
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i]!;
            const b = pts[(i + 1) % pts.length]!;
            signedArea += (a.x * b.z - b.x * a.z);
        }
        if (signedArea < 0) pts = pts.slice().reverse();

        const shape  = new THREE.Shape(pts.map(p => new THREE.Vector2(p.x, p.z)));
        const extGeo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
        extGeo.rotateX(Math.PI / 2);
        extGeo.translate(0, depth, 0);

        const mesh = makeEdgedMesh(extGeo);
        mesh.position.set(0, yMin - POLY_PADDING, 0);
        return { kind: 'mesh', mesh };
    }
    return aabbFallback(obj);
}

function buildRoom(obj: THREE.Object3D): HighlightResult {
    // §01 §2.12: Room polygon extruded to clear height.
    // Rooms are spatial-context elements — no TransformControls.
    const polyPts   = obj.userData['polygon'] as Array<{ x: number; z: number }> | undefined;
    const roomH     = (obj.userData['height'] as number | undefined) ?? 3.0;
    const roomB3    = new THREE.Box3().setFromObject(obj);
    const roomYMin  = roomB3.min.y;
    const roomDepth = roomH + 2 * POLY_PADDING;

    if (polyPts && polyPts.length >= 3) {
        let rPts = polyPts.slice();
        let rSignedArea = 0;
        for (let i = 0; i < rPts.length; i++) {
            const a = rPts[i]!;
            const b = rPts[(i + 1) % rPts.length]!;
            rSignedArea += (a.x * b.z - b.x * a.z);
        }
        if (rSignedArea < 0) rPts = rPts.slice().reverse();

        const rShape  = new THREE.Shape(rPts.map(p => new THREE.Vector2(p.x, p.z)));
        const rExtGeo = new THREE.ExtrudeGeometry(rShape, { depth: roomDepth, bevelEnabled: false });
        rExtGeo.rotateX(Math.PI / 2);
        rExtGeo.translate(0, roomDepth, 0);

        const mesh = makeEdgedMesh(rExtGeo);
        mesh.position.set(0, roomYMin - POLY_PADDING, 0);
        return { kind: 'mesh', mesh, skipTransformControls: true };
    }
    return aabbFallback(obj);
}

function buildFurniture(obj: THREE.Object3D): OBBResult {
    // §16 §2.4: run OBB along start→end, or yaw-aligned semantic OBB.
    // Carpets use geometric AABB (their userData.height is clamped to ~4 mm).
    const fType    = String(obj.userData['furnitureType'] ?? '');
    const isCarpet = fType.includes('carpet') || fType.includes('rug');
    if (isCarpet) return aabbFallback(obj);

    const fHeight = (obj.userData['height'] as number | undefined) ?? 1;
    const fWidth  = (obj.userData['width']  as number | undefined) ?? 0.6;
    const fLength = (obj.userData['length'] as number | undefined) ?? 0.6;

    const sp = obj.userData['startPoint'] as { x: number; y: number; z: number } | undefined;
    const ep = obj.userData['endPoint']   as { x: number; y: number; z: number } | undefined;

    if (sp && ep && (sp.x !== ep.x || sp.z !== ep.z)) {
        const dx        = ep.x - sp.x;
        const dz        = ep.z - sp.z;
        const runLength = Math.sqrt(dx * dx + dz * dz);
        const dir       = new THREE.Vector3(dx / runLength, 0, dz / runLength);
        return {
            kind:       'obb',
            center:     new THREE.Vector3(
                (sp.x + ep.x) / 2,
                (sp.y + ep.y) / 2 + fHeight / 2,
                (sp.z + ep.z) / 2,
            ),
            size:       new THREE.Vector3(runLength, fHeight, fWidth),
            quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir),
        };
    }

    // §16 §2.4: corner-origin sofa families anchor at back-left corner;
    // shift OBB centre by (+w/2, +h/2, +d/2) in local frame.
    const sofaCorner =
        fType === 'corner_sofa'       || fType === 'white_corner_sofa' ||
        fType === 'sofa'              ||
        fType.startsWith('sofa_')     || fType.startsWith('white_sofa_');

    const wPos  = obj.getWorldPosition(new THREE.Vector3());
    const rawQ  = obj.getWorldQuaternion(new THREE.Quaternion());
    const euler = new THREE.Euler().setFromQuaternion(rawQ, 'YXZ');
    const yawQ  = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, euler.y, 0, 'YXZ'));

    let center: THREE.Vector3;
    if (sofaCorner) {
        const localOffset = new THREE.Vector3(fWidth / 2, fHeight / 2, fLength / 2);
        localOffset.applyQuaternion(yawQ);
        center = new THREE.Vector3(
            wPos.x + localOffset.x,
            wPos.y + localOffset.y,
            wPos.z + localOffset.z,
        );
    } else {
        center = new THREE.Vector3(wPos.x, wPos.y + fHeight / 2, wPos.z);
    }
    return { kind: 'obb', center, size: new THREE.Vector3(fWidth, fHeight, fLength), quaternion: yawQ };
}

function buildBimGrid(obj: THREE.Object3D): OBBResult {
    // §16 §3: thin OBB hugging the grid line span at active level elevation.
    const gridStore = (window as unknown as { gridStore?: { get(id: string): unknown } }).gridStore;
    const gridId    = obj.userData?.['id'] as string | undefined;
    const grid      = gridId ? gridStore?.get(gridId) : undefined;

    if (grid) {
        const g    = grid as Record<string, unknown>;
        const HW   = 0.18;
        const HH   = 0.06;
        const yPos = (obj as THREE.Object3D).position.y;

        const isLinear =
            g['mode'] === 'linear' &&
            typeof g['startX'] === 'number' && typeof g['startZ'] === 'number' &&
            typeof g['endX']   === 'number' && typeof g['endZ']   === 'number';

        if (isLinear) {
            const sx    = g['startX'] as number;
            const sz    = g['startZ'] as number;
            const ex    = g['endX']   as number;
            const ez    = g['endZ']   as number;
            const dx    = ex - sx;
            const dz    = ez - sz;
            const len   = Math.max(0.5, Math.hypot(dx, dz));
            const angleY = Math.atan2(-dz, dx);
            return {
                kind:       'obb',
                center:     new THREE.Vector3((sx + ex) / 2, yPos, (sz + ez) / 2),
                size:       new THREE.Vector3(len, HH * 2, HW * 2),
                quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angleY, 0, 'YXZ')),
            };
        }

        const min = (g['extentMin'] as number | undefined) ?? -100;
        const max = (g['extentMax'] as number | undefined) ?? 100;
        const len = Math.max(0.5, max - min);
        const mid = (min + max) / 2;

        if (g['axis'] === 'X') {
            return {
                kind:       'obb',
                center:     new THREE.Vector3(g['position'] as number, yPos, mid),
                size:       new THREE.Vector3(len, HH * 2, HW * 2),
                quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0, 'YXZ')),
            };
        }
        return {
            kind:   'obb',
            center: new THREE.Vector3(mid, yPos, g['position'] as number),
            size:   new THREE.Vector3(len, HH * 2, HW * 2),
        };
    }
    return aabbFallback(obj);
}

// ── Registry class ────────────────────────────────────────────────────────────

/**
 * A pluggable registry that maps element-type strings to highlight builder
 * functions.  `SelectionManager` holds a single instance and calls
 * `.build(elementType, obj)` from `applyHighlight()`.
 *
 * Plugins register custom builders at startup:
 * ```ts
 * selectionManager.boundsRegistry.register('my-beam', buildMyBeamHighlight);
 * ```
 */
export class SelectionBoundsRegistry {
    private readonly _builders = new Map<string, HighlightBuilderFn>();

    /** Register (or replace) a highlight builder for a given element type.
     *  The `elementType` string is normalised to lower-case. */
    register(elementType: string, fn: HighlightBuilderFn): void {
        this._builders.set(elementType.toLowerCase(), fn);
    }

    /** Run the builder for `elementType`.  Returns `null` if no builder is
     *  registered OR if the builder throws (with a console.warn). */
    build(elementType: string, obj: THREE.Object3D): HighlightResult | null {
        const fn = this._builders.get(elementType.toLowerCase());
        if (!fn) return null;
        try {
            return fn(obj);
        } catch (err) {
            console.warn(`[SelectionBoundsRegistry] builder for '${elementType}' threw:`, err);
            return null;
        }
    }

    has(elementType: string): boolean {
        return this._builders.has(elementType.toLowerCase());
    }
}

// ── Default registry factory ──────────────────────────────────────────────────

/**
 * Create and return a `SelectionBoundsRegistry` pre-loaded with all
 * production element-type builders.  Called once from the
 * `SelectionManager` constructor.
 */
export function buildDefaultSelectionBoundsRegistry(): SelectionBoundsRegistry {
    const reg = new SelectionBoundsRegistry();
    reg.register('door',        buildDoorWindow);
    reg.register('window',      buildDoorWindow);
    reg.register('wall',        buildWall);
    reg.register('curtainwall', buildCurtainWall);
    reg.register('column',      buildColumn);
    reg.register('slab',        buildSlab);
    reg.register('floor',       buildFloorCeiling);
    reg.register('ceiling',     buildFloorCeiling);
    reg.register('room',        buildRoom);
    reg.register('furniture',   buildFurniture);
    reg.register('bimgrid',     buildBimGrid);
    return reg;
}
