import * as THREE from '@pryzm/renderer-three/three';

/**
 * WallEdgeOverlayBuilder
 *
 * Produces a THREE.LineSegments edge overlay for any wall geometry.
 *
 * ── Migration note (Doc 20 — Edge Line Flicker Fix) ────────────────────────
 * Previously used LineSegments2 + LineMaterial (three/examples/jsm/lines/).
 * LineMaterial is a GLSL ShaderMaterial incompatible with the WebGPU TSL
 * renderer; the renderer failed to compile its shader on every frame, producing
 * the "LineMaterial is not compatible" error and continuous flicker.
 *
 * Replacement: THREE.LineSegments + THREE.LineBasicMaterial.
 * THREE.LineBasicMaterial has a built-in TSL fallback in the WebGPU renderer —
 * no GLSL is involved, no per-frame compilation attempt, no flicker.
 *
 * Accepted tradeoff: LineBasicMaterial does not support variable line width
 * (hardware caps linewidth at 1px on most WebGL/WebGPU drivers). Edge lines
 * render at 1px in the 3D viewport. Documentation view line weights are handled
 * by the sheet/view rendering subsystem, not by this builder.
 *
 * Design principles (per Contract §01 / §05 / §09):
 *  - Pure projection function: no store access, no side-effects.
 *  - Returns THREE.Object3D so callers (WallFragmentBuilder) do not need to
 *    know the concrete line object type.
 *  - userData.role = 'edges', userData.elementType = 'WallEdges' preserved
 *    exactly — consumed by WallEdgeVisibilityService and VGSceneApplicator.
 *  - renderOrder = 1 + depthWrite = false prevent Z-fighting against the wall face (Doc 22).
 *  - Threshold angle of 15° means only true face-transition edges are drawn.
 *
 * ── B2: renderMode parameter ────────────────────────────────────────────────
 * renderMode controls the visual treatment of the edge overlay:
 *  - '3d'  (default): subtle dark-grey lines for 3D perspective views.
 *            depthTest=true, depthWrite=false, renderOrder=1.
 *            Edges are hidden by default in 3D view (WallEdgeVisibilityService).
 *  - 'plan': crisp black lines for plan-view white-background legibility.
 *            depthTest=false, depthWrite=false, renderOrder=999.
 *            The white B1 background (#ffffff) requires maximum contrast (0x000000).
 *
 * To switch an existing edge overlay between modes at runtime, use
 * applyWallEdgeRenderMode(). WallEdgeVisibilityService.applyRenderMode() calls
 * this on the full scene when the view-activated event fires.
 */

/**
 * Render-mode descriptor for wall edge overlays.
 * '3d'  — default, subtle grey, depth-tested, renderOrder=1.
 * 'plan' — sharp black, no depth-test, renderOrder=999 (always on top in plan view).
 */
export type WallEdgeRenderMode = 'plan' | '3d';

/**
 * Material settings per render mode.
 * Centralised here so WallEdgeVisibilityService.applyRenderMode()
 * and the builder itself always use the same values.
 */
export const WALL_EDGE_MODE_SETTINGS: Record<WallEdgeRenderMode, {
    color:      number;
    depthTest:  boolean;
    depthWrite: boolean;
    renderOrder: number;
}> = {
    '3d': {
        color:       0x333333,
        depthTest:   true,
        depthWrite:  false,
        renderOrder: 1,
    },
    'plan': {
        color:       0x000000,
        depthTest:   false,
        depthWrite:  false,
        renderOrder: 999,
    },
};

/**
 * Apply a render mode to a single existing wall-edge LineSegments object.
 * Only operates on objects tagged with userData.elementType === 'WallEdges'.
 * Safe to call on any arbitrary Object3D — no-ops if the tag is missing.
 *
 * Called by WallEdgeVisibilityService.applyRenderMode() during view switches.
 */
export function applyWallEdgeRenderMode(
    obj: THREE.Object3D,
    mode: WallEdgeRenderMode
): void {
    if (
        obj.userData?.elementType !== 'WallEdges' ||
        obj.userData?.role !== 'edges'
    ) return;

    const settings = WALL_EDGE_MODE_SETTINGS[mode];
    const line = obj as THREE.LineSegments;
    const mat = line.material as THREE.LineBasicMaterial;
    if (!mat || !mat.isLineBasicMaterial) return;

    mat.color.setHex(settings.color);
    mat.depthTest  = settings.depthTest;
    mat.depthWrite = settings.depthWrite;
    mat.needsUpdate = true;
    line.renderOrder = settings.renderOrder;
}

export function buildWallEdgeOverlay(
    geometry: THREE.BufferGeometry,
    wallId: string,
    options: {
        thresholdAngle?: number;
        color?: number;
        renderMode?: WallEdgeRenderMode;
    } = {}
): THREE.Object3D {
    const thresholdAngle = options.thresholdAngle ?? 15;
    const mode           = options.renderMode ?? '3d';
    const settings       = WALL_EDGE_MODE_SETTINGS[mode];
    const colorHex       = options.color ?? settings.color;

    const edgesGeo = new THREE.EdgesGeometry(geometry, thresholdAngle);

    // Doc 22 fix: polygonOffset on LineBasicMaterial sets depthBias in the WebGPU
    // pipeline descriptor. The WebGPU spec forbids non-zero depthBias for
    // PrimitiveTopology::LineList — device.createRenderPipeline() rejects it on
    // every frame that a wall edge overlay is present, causing continuous flicker.
    // Solution: depthWrite:false is WebGPU-safe and prevents Z-fighting by
    // ensuring edge lines never compete with face geometry in the depth buffer.
    // renderOrder=1 (below) provides additional draw-order protection.
    //
    // B2: In 'plan' mode, depthTest is set to false and renderOrder=999 so that
    // edge lines always draw on top of slab and wall face geometry in the
    // top-down orthographic projection (no depth ambiguity in plan view).
    const lineMat = new THREE.LineBasicMaterial({
        color:      colorHex,
        depthTest:  settings.depthTest,
        depthWrite: settings.depthWrite,
    });

    const edgesLine = new THREE.LineSegments(edgesGeo, lineMat);
    edgesLine.renderOrder = settings.renderOrder;
    // Edges are hidden by default in 3D view.
    // WallEdgeVisibilityService (via view-activated) enables them for plan views.
    edgesLine.visible = false;

    edgesLine.userData = {
        id: wallId,
        parentId: wallId,
        elementType: 'WallEdges',
        role: 'edges',
        selectable: false,
    };

    return edgesLine;
}

// ─────────────────────────────────────────────────────────────────────────────
// §WALL-EDGE-OVERLAY-FRAME — L-7101. THE OVERLAY MUST STAND WHERE ITS SOLID DOES.
// ─────────────────────────────────────────────────────────────────────────────
//
// `buildWallEdgeOverlay` returns a LineSegments **in the frame of the geometry it was
// handed**, and nothing about the returned object records which frame that was. Every
// caller therefore has to place it, and the placement is different per arm:
//
//   • the prism / band / curved arms hand it geometry ALREADY in the group's frame
//     (those builders take `worldStart = (0,0,0)` relative to the group origin), so the
//     overlay is correct at identity;
//   • the box-outline arms hand it an AXIS-ALIGNED `BoxGeometry` and must therefore set
//     `rotation.y = −wallAngle` themselves (`WallFragmentBuilder.ts:2969-2971`, and
//     again at `:1725-1727`).
//
// ⛔ **L-7101 — THE PROFILE ARM DID NEITHER, AND THAT IS THE FOUNDER'S BUG.** It hands
//    over the wall-LOCAL extruded body (local-x along the baseline) and added the
//    overlay to the GROUP at identity while the body mesh carried `rotation.y = −angle`.
//    Measured, one wall, one ring, three baselines:
//
//      baseline (0,0)→(6,0)   body bb x∈[0,6]        z∈[−0.1,0.1]   overlay IDENTICAL  ✅
//      baseline (0,0)→(0,6)   body bb x∈[−0.1,0.1]   z∈[0,6]        overlay x∈[0,6]    ⛔
//      baseline (0,0)→(4,3)   body bb x∈[−0.06,4.06] z∈[−0.08,3.08] overlay x∈[0,5]    ⛔
//
//    So on every wall that does not happen to run due EAST the linework was drawn along
//    world +X: a closed elevation silhouette floating clear of the building, plus the
//    long thin crossings where it passes over the real geometry. That is the screenshot.
//    The +X case passing is why the defect could ship — the first wall anyone draws in a
//    test is axis-aligned, and on that one wall the two frames coincide exactly.
//
// ⭐ THE FIX IS A CHOKEPOINT, NOT A THIRD COPY OF `rotation.y = −angle`. Three arms
//   answering "where does the linework go?" three ways is precisely the C84 EI-9 defect
//   (one quantity, several derivations), and the third answer was "nowhere, silently".
//   `attachWallEdgeOverlay` asks the question once — the overlay RIDES ITS SOURCE MESH,
//   the same commitment `§GHOST-EDGES-RIDE-THEIR-MESH` (L-3510,
//   `DiagnosticMaterialManager.ts:533`) makes for the diagnostic ghost overlay, reached
//   there by the same defect from the other direction.
//
//   ⚠ IT COPIES THE LOCAL TRANSFORM RATHER THAN RE-PARENTING UNDER THE MESH, and the
//   reason is not taste. `WallEdgeVisibilityService` and `VGSceneApplicator` find
//   overlays by tag, and `_applyRakeShearToChildren` iterates `wallGroup.children`
//   SHALLOWLY. A sibling standing at the source's transform composes identically under
//   that shear — both children end at `S·R` — and keeps every existing consumer's
//   structural assumption intact. Re-parenting would change the depth at which four
//   unrelated systems find the object in order to fix an orientation. Copy the frame;
//   do not move the node.

/**
 * Build the edge overlay for `source` and add it to `parent` **standing exactly where
 * `source` stands**.
 *
 * `geometry` is the source mesh's own geometry (or a proxy outline in the SAME frame).
 * The overlay inherits `source`'s local position / rotation / scale, so a body built in
 * a wall-local frame and rotated into place carries its linework with it by
 * construction rather than by a line the next arm can forget to write.
 *
 * ⚠ PRECONDITION, CHECKED LOUDLY: `source` must be a child of `parent`, or not yet
 * parented. Copying a local transform across two different parents would place the
 * overlay by an unrelated frame — the same bug in a new costume — so it is reported
 * rather than silently produced.
 */
export function attachWallEdgeOverlay(
    parent: THREE.Object3D,
    source: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    wallId: string,
    options: {
        thresholdAngle?: number;
        color?: number;
        renderMode?: WallEdgeRenderMode;
    } = {},
): THREE.Object3D {
    const overlay = buildWallEdgeOverlay(geometry, wallId, options);
    if (source.parent !== null && source.parent !== parent) {
        reportStrayEdgeOverlay(
            `[WallEdges] §WALL-EDGE-OVERLAY-FRAME wall ${wallId}: the source mesh is parented ` +
            'elsewhere, so its LOCAL transform does not describe a position under `parent`. ' +
            'The overlay was attached anyway (SPEC §4 — never an empty wall) but its frame ' +
            'is unproven.',
        );
    }
    overlay.position.copy(source.position);
    overlay.quaternion.copy(source.quaternion);
    overlay.scale.copy(source.scale);
    overlay.updateMatrix();
    parent.add(overlay);
    return overlay;
}

/**
 * How far an overlay may REACH outside the union of the wall's solid bodies before it
 * is called STRAY, metres.
 *
 * ⚠ THE MEASURE IS THE FURTHEST CORNER, NOT THE CENTRE, AND THAT CORRECTION WAS EARNED
 *   THE HARD WAY. The first version of this audit measured the overlay's CENTRE against
 *   the solid, and it was watched **failing to fire on the founder's own case**: a
 *   profiled wall on a (0,0)→(4,3) baseline has its stray outline running along world
 *   +X with its centre at (2.5, 1.5, 0) — which is still comfortably INSIDE the solid's
 *   axis-aligned box, so the centre distance was 0.00 m and the wall reported clean while
 *   its linework crossed the building. A rotation about a point near the wall's middle
 *   barely moves a centre; it throws the ENDS metres out, and the ends are what the
 *   founder can see. Measure the reach.
 *
 * Sized to be unreachable by any legitimate cause and trivially reachable by the real
 * defect. The largest honest overhang in this subsystem is a mitred outline reaching past
 * its own body's box by `(t/2)·cot(θ/2)` at an acute join — ~0.37 m at 30° on a 0.2 m
 * wall, and even that is bounded because the BODY at a mitred end is built by the same
 * `buildMiterPrism` call the outline is. The real defect on the shortest wall a project
 * contains is metres. Nothing an author can draw lands between.
 */
export const WALL_EDGE_STRAY_TOL_M = 0.5;

/** Console budget — a corrupted level must not cost the founder his console. */
const STRAY_LOG_BUDGET = 12;
let _strayLogsEmitted = 0;

function reportStrayEdgeOverlay(message: string): void {
    if (_strayLogsEmitted >= STRAY_LOG_BUDGET) return;
    _strayLogsEmitted += 1;
    // eslint-disable-next-line no-console
    console.error(message);
    if (_strayLogsEmitted === STRAY_LOG_BUDGET) {
        // eslint-disable-next-line no-console
        console.error(
            `[WallEdges] §WALL-EDGE-OVERLAY-FRAME — ${STRAY_LOG_BUDGET} reports emitted; ` +
            'further occurrences this session are suppressed. Read ' +
            '`wallGroup.userData.strayEdgeOverlays` on each wall root for the live count.',
        );
    }
}

/** TEST SEAM — reset the console budget so a suite can assert the message more than once. */
export function __resetWallEdgeStrayLogBudget(): void {
    _strayLogsEmitted = 0;
}

const _auditBox = new THREE.Box3();
const _auditCentre = new THREE.Vector3();
const _auditClamped = new THREE.Vector3();

/** World-space AABB of `o`'s own geometry under its world matrix, or null. */
function worldBoxOf(o: THREE.Object3D, into: THREE.Box3): THREE.Box3 | null {
    const geo = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (!geo || typeof geo.getAttribute !== 'function') return null;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    if (!bb || !Number.isFinite(bb.min.x) || !Number.isFinite(bb.max.x)) return null;
    into.copy(bb).applyMatrix4(o.matrixWorld);
    return into;
}

/**
 * §WALL-EDGE-OVERLAY-FRAME — SAY IT OUT LOUD. Report every `WallEdges` overlay in
 * `group` whose centre has left the union of that group's own solid bodies.
 *
 * ⭐ THIS IS THE HALF THAT WAS MISSING, AND IT IS THE HALF THE FOUNDER NEEDED. The
 *   linework had flown metres off the building and his console printed *"3 groups, 3
 *   occluders"* — no error, no warning. Every gate this subsystem owns is a gate on the
 *   MODEL: `profileAuthorability`, `WallOccupancyStore.canPlace`,
 *   `WallTopologyIntegrity`. The model was never wrong here. What was wrong was the
 *   SCENE GRAPH, and nothing in the repo looked at it. A wall whose linework and whose
 *   solid disagree is a statement the renderer can make and had no way to make.
 *
 * Cheap by construction: eight transformed corners per child off `geometry.boundingBox`,
 * which THREE caches on the geometry, and it is skipped entirely for a group holding no
 * overlay or no body.
 *
 * ⛔ IT IS DELIBERATELY **NOT** BEHIND THE PERF FLAG. `bumpPerf` is a no-op unless armed
 *   (`PerfCounters.ts:146`), so a counter here would have been invisible in exactly the
 *   session that needed it. The whole finding is that this failure was silent.
 *
 * @returns the number of stray overlays found. Also stamped on
 *          `group.userData.strayEdgeOverlays`, so a scene reader — or the founder in a
 *          console — can see it without re-running the audit.
 */
export function auditWallEdgeOverlayFrames(
    group: THREE.Object3D,
    wallId: string,
    tolM: number = WALL_EDGE_STRAY_TOL_M,
): number {
    const overlays: THREE.Object3D[] = [];
    const bodies: THREE.Object3D[] = [];
    group.traverse((o: THREE.Object3D) => {
        const ud = o.userData as { elementType?: string; role?: string } | undefined;
        if (ud?.elementType === 'WallEdges' && ud?.role === 'edges') { overlays.push(o); return; }
        if ((o as unknown as { isMesh?: boolean }).isMesh === true && ud?.role === 'geometry') {
            bodies.push(o);
        }
    });
    const stamp = group.userData as { strayEdgeOverlays?: number };
    if (overlays.length === 0 || bodies.length === 0) {
        stamp.strayEdgeOverlays = 0;
        return 0;
    }

    group.updateMatrixWorld(true);

    const solid = new THREE.Box3().makeEmpty();
    for (const b of bodies) {
        const bb = worldBoxOf(b, _auditBox);
        if (bb) solid.union(bb);
    }
    if (solid.isEmpty()) {
        stamp.strayEdgeOverlays = 0;
        return 0;
    }

    let stray = 0;
    for (const ov of overlays) {
        const bb = worldBoxOf(ov, _auditBox);
        if (!bb) continue;
        // THE REACH: the furthest any corner of the overlay's box gets from the solid.
        // Eight corners, closed form, no allocation in the loop.
        let d = 0;
        for (let c = 0; c < 8; c++) {
            _auditCentre.set(
                (c & 1) ? bb.max.x : bb.min.x,
                (c & 2) ? bb.max.y : bb.min.y,
                (c & 4) ? bb.max.z : bb.min.z,
            );
            solid.clampPoint(_auditCentre, _auditClamped);
            const dc = _auditCentre.distanceTo(_auditClamped);
            if (dc > d) d = dc;
        }
        if (d <= tolM) continue;
        stray += 1;
        reportStrayEdgeOverlay(
            `[WallEdges] §WALL-EDGE-OVERLAY-FRAME (L-7101) — wall ${wallId}: an edge overlay ` +
            `reaches ${d.toFixed(2)} m OUTSIDE the wall's own solid. The linework occupies ` +
            `[${bb.min.x.toFixed(2)}, ${bb.min.y.toFixed(2)}, ${bb.min.z.toFixed(2)}] .. ` +
            `[${bb.max.x.toFixed(2)}, ${bb.max.y.toFixed(2)}, ${bb.max.z.toFixed(2)}] ` +
            `while the body occupies [${solid.min.x.toFixed(2)}, ${solid.min.y.toFixed(2)}, ` +
            `${solid.min.z.toFixed(2)}] .. [${solid.max.x.toFixed(2)}, ${solid.max.y.toFixed(2)}, ` +
            `${solid.max.z.toFixed(2)}]. The linework is being drawn in a DIFFERENT FRAME from ` +
            'the solid it describes — this is what stray black outlines flying off the building ' +
            'look like. Attach it with `attachWallEdgeOverlay(group, sourceMesh, geo, wallId)` ' +
            'so the overlay rides its mesh.',
        );
    }
    stamp.strayEdgeOverlays = stray;
    return stray;
}
