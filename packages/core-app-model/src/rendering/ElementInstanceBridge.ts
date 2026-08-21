/**
 * @file packages/core-app-model/src/rendering/ElementInstanceBridge.ts
 *
 * ElementInstanceBridge — ADR-0076 Axis 3 (§PERF-WEBGPU-FRAGMENT, 2026-06-25).
 *
 * An element-AGNOSTIC GPU-instancing bridge, generalising the wall-only
 * WallInstanceBridge (packages/geometry-wall/src/WallInstanceBridge.ts) so that
 * repeated single-geometry elements (simple box/cylinder columns + beams, and
 * later repeated furniture leaf shapes) route through the SAME, already-correct
 * InstancedElementRenderer that walls use.
 *
 * WHY THIS IS LOW-RISK (the two known instancing hazards are pre-solved here):
 *
 *   1. Per-element PICKING. InstancedElementRenderer.register() stamps
 *      `mesh.userData.getInstanceElementId(slot) -> elementId` on every group
 *      (InstancedElementRenderer.ts:154-161). SelectionManager already resolves
 *      a BVH hit on an `isInstancedGroup` mesh via that function
 *      (SelectionManager.ts:1198-1206). Routing an element through this bridge
 *      therefore preserves per-element selection BY CONSTRUCTION — the bridge
 *      adds no new pick path.
 *
 *   2. Per-level VISIBILITY / ISOLATE. register() stamps `userData.levelId`
 *      (§INSTANCED-LEVEL-VIS) and `userData.elementType` (§INSTANCED-ISOLATE-FIX)
 *      on the group. ProjectVisibilitySection.applyLevelVisibility() matches on
 *      exactly those keys and special-cases `isInstancedGroup`
 *      (ProjectVisibilitySection.ts:33-45,127). Passing the element's REAL
 *      levelId + elementType therefore preserves floor isolate/hide.
 *
 * GEOMETRY MODEL (mirrors WallInstanceBridge): a unit primitive (BoxGeometry(1,1,1)
 * or a unit CylinderGeometry) is shared across ALL instances of the same
 * (kind, material, level); the element's real dimensions are encoded entirely in
 * the per-instance matrix via makeScale(). So every simple box column of any size
 * collapses into ONE InstancedMesh per (kind, material, level).
 *
 * SCOPE GUARD: only call this for elements whose geometry is a single unit
 * primitive (a simple box/cylinder). Multi-mesh elements (steel-LOD columns,
 * kitchens, wardrobes) MUST stay on their fragment path — the caller decides
 * eligibility, exactly as WallFragmentBuilder gates the wall instanced path.
 *
 * Contract compliance:
 *   P2 — THREE only via '@pryzm/renderer-three/three'.
 *   P3 — no requestAnimationFrame.
 *   P8 — every exported method carries an OpenTelemetry span.
 *   §01-BIM-ENGINE-CORE §5 — projection-layer only; no store reads/mutations.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { trace, SpanStatusCode, type Attributes } from '@opentelemetry/api';
import type { InstancedElementRenderer } from './InstancedElementRenderer.js';

const TRACER = trace.getTracer('@pryzm/core-app-model/element-instance-bridge', '0.1.0');

function withBridgeSpan<T>(verb: string, attrs: Attributes, fn: () => T): T {
    const span = TRACER.startSpan(`pryzm.element-instance.${verb}`, { attributes: attrs });
    try {
        const out = fn();
        span.setStatus({ code: SpanStatusCode.OK });
        return out;
    } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        span.setAttribute('error', true);
        throw err;
    } finally {
        span.end();
    }
}

/** The unit primitive a simple element collapses onto. */
export type InstanceGeometryKind = 'box' | 'cylinder';

/**
 * The transform of one instance in WORLD space, expressed as the position of the
 * element's CENTRE, a Y-rotation, and the element's full extents (width/height/
 * depth). The bridge builds `translate(centre) × rotateY × scale(extents)` so a
 * unit primitive renders at the right place + size — identical maths to
 * WallInstanceBridge.register().
 */
export interface ElementInstanceTransform {
    /** World-space centre of the element's bounding box. */
    readonly centre: { x: number; y: number; z: number };
    /** Rotation about the world Y axis, radians. */
    readonly rotationY: number;
    /** Full extents along local X / Y / Z (NOT half-extents). */
    readonly size: { x: number; y: number; z: number };
}

/**
 * One shared unit BoxGeometry, reused for EVERY box instance so they all land in
 * one InstanceGroup. (CylinderGeometry is per-radial-segments, built on demand
 * and cached.) These are template geometries — InstancedElementRenderer copies
 * the hash, not the buffer, and InstanceGroup owns the GPU buffer.
 */
const _unitBox = new THREE.BoxGeometry(1, 1, 1);
const _unitCylinderCache = new Map<number, THREE.CylinderGeometry>();

function unitGeometry(kind: InstanceGeometryKind, radialSegments = 32): THREE.BufferGeometry {
    if (kind === 'box') return _unitBox;
    let cyl = _unitCylinderCache.get(radialSegments);
    if (!cyl) {
        // Unit cylinder: radius 0.5 (so X/Z scale = diameter), height 1.
        cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, radialSegments);
        _unitCylinderCache.set(radialSegments, cyl);
    }
    return cyl;
}

/**
 * ElementInstanceBridge
 *
 * Construct with the shared InstancedElementRenderer (the same singleton walls
 * use, `instancedElementRenderer`). The bridge owns no scene state — it is a thin
 * matrix-builder + delegator.
 */
export class ElementInstanceBridge {
    constructor(private readonly _renderer: InstancedElementRenderer) {}

    /**
     * Register (or update) a simple single-primitive element as a GPU instance.
     *
     * Per-element pick (getInstanceElementId) and per-level isolate
     * (userData.levelId + elementType) are preserved by InstancedElementRenderer
     * — see the file header. `elementType` MUST be the real element type (e.g.
     * 'Column', 'Beam') so the Project Browser isolate/hide-by-type traverses
     * resolve the aggregate group.
     *
     * P8: `pryzm.element-instance.register` span.
     */
    register(
        elementId: string,
        levelId: string,
        elementType: string,
        transform: ElementInstanceTransform,
        material: THREE.Material,
        kind: InstanceGeometryKind = 'box',
    ): void {
        withBridgeSpan(
            'register',
            {
                'pryzm.element_instance.id': elementId,
                'pryzm.element_instance.type': elementType,
                'pryzm.element_instance.level_id': levelId,
                'pryzm.element_instance.kind': kind,
            },
            () => {
                const matrix = this._buildMatrix(transform);
                const geo = unitGeometry(kind);
                // Verbatim delegation to the SAME renderer walls use — this is
                // what carries per-instance pick + per-level visibility.
                this._renderer.register(elementId, geo, material, matrix, levelId, elementType);
            },
        );
    }

    /**
     * Update only the world transform of an already-registered instance.
     * O(1) matrix write — no geometry rebuild. No-op if not registered.
     *
     * P8: `pryzm.element-instance.update-transform` span.
     */
    updateTransform(elementId: string, transform: ElementInstanceTransform): void {
        withBridgeSpan(
            'update-transform',
            { 'pryzm.element_instance.id': elementId },
            () => {
                this._renderer.updateTransform(elementId, this._buildMatrix(transform));
            },
        );
    }

    /**
     * Remove an element from instanced rendering. No-op if not registered.
     *
     * P8: `pryzm.element-instance.unregister` span.
     */
    unregister(elementId: string): void {
        withBridgeSpan(
            'unregister',
            { 'pryzm.element_instance.id': elementId },
            () => {
                this._renderer.unregister(elementId);
            },
        );
    }

    /**
     * True if this element is currently rendered as an instance. Lets a caller
     * unregister an element that has become ineligible (e.g. a column that
     * changed to a steel LOD profile) before falling back to the fragment path.
     */
    isInstanced(elementId: string): boolean {
        return this._renderer.isRegistered(elementId);
    }

    // ── Private ──────────────────────────────────────────────────────────────

    /** Build `translate(centre) × rotateY × scale(size)` — WallInstanceBridge maths. */
    private _buildMatrix(t: ElementInstanceTransform): THREE.Matrix4 {
        return new THREE.Matrix4()
            .makeTranslation(t.centre.x, t.centre.y, t.centre.z)
            .multiply(new THREE.Matrix4().makeRotationY(t.rotationY))
            .multiply(new THREE.Matrix4().makeScale(
                // Guard against zero scale (degenerate instance → invisible slot).
                t.size.x || 1e-6,
                t.size.y || 1e-6,
                t.size.z || 1e-6,
            ));
    }
}

/**
 * Element families that can be instanced through this bridge. A family is named
 * so it can be enabled INDEPENDENTLY — `isElementInstancingEnabled()` is one
 * function shared by six builders, and before §INSTANCE-WINDOWS-DEFAULT-ON there
 * was no way to switch one of them on without switching on all six.
 */
export type InstancedElementFamily =
    | 'window' | 'column' | 'beam' | 'handrail' | 'stairRailing';

/**
 * Per-family DEFAULTS — §INSTANCE-WINDOWS-DEFAULT-ON (L-1180),
 * §NAV-SMOOTHNESS (L-1781).
 *
 * A family is ON here only once it has been made SAFE, which means both halves of
 * ADR-0297: L1 (nothing frees a material the InstanceGroup still draws with) and
 * L2 (nothing releases a GPU buffer still reachable from the render graph), AND a
 * test that exercises the instanced delete path — the one that crashes.
 *
 * ⚠ AND UNTIL L-1781 THIS TABLE WAS LARGELY UNREACHABLE. Four of the five builders
 * called `isElementInstancingEnabled()` with NO ARGUMENT, which is the legacy
 * master-only contract — so only `window` ever consulted its row here. Setting
 * `__pryzmElementInstancing.handrail = true` moved the draw-call count by ZERO.
 * All five call sites now name their family; see `NavigationDrawCallCensus.spec.ts`
 * ("THE GATE ITSELF"), which asserts that symptom so it cannot silently return.
 *
 *   window       ON  — L1 closed at the SharedMaterialCache chokepoint, L2 closed
 *                      in WindowBuilder.dispose() (was live: it disposed while the
 *                      group was still parented), covered by
 *                      WindowInstancedLifetime.test.ts. 12 meshes → 1 per window,
 *                      and windows are 85% of the founder's scene.
 *   handrail     ON  — L-1781. L2 clean (`detachAndReleaseChildren`), instanced
 *                      tests exist (HandrailInstancing.spec, 8-corner placement +
 *                      slot release on remove/rebuild) and the isolation-dispose
 *                      guard covers project switch. It was previously marked "a
 *                      genuine candidate, but not measured yet" — IT IS NOW
 *                      MEASURED: with stair railings, 240 railing elements go
 *                      4920 → 250 draw calls (19.7x), 2520 → 242 geometries.
 *   stairRailing ON  — L-1781, and the recorded blocker was RETIRED BY
 *                      MEASUREMENT rather than by assertion. This row read: "hands
 *                      the SAME material object to both register() and a surviving
 *                      fragment mesh, so with the L1 stamp on, the top rail's
 *                      material is permanently skipped rather than freed. Safe, but
 *                      it leaks; fix the builder before flipping."
 *
 *                      That is true, and "safe but it leaks" was the right worry —
 *                      but it is not a MAGNITUDE, and the only thing that decides
 *                      whether it blocks is whether the surviving set grows with
 *                      ELEMENT COUNT or with distinct APPEARANCE.
 *                      §NAV-LEAK-IS-BOUNDED measures it after deleting every
 *                      railing: 5 railings → 1 material retained; 50 railings → 1
 *                      material retained. CONSTANT, not linear, and handed back at
 *                      `resetSharedMaterialCache()` on project close. One material
 *                      held for a session is not a reason to keep 19.7x on the
 *                      floor. StairRailingInstancing.spec covers the delete path.
 *   column       OFF — L2 already compliant, but ZERO instanced tests exist. Now
 *                      REACHABLE per-family, so it can be switched on for a session
 *                      with `__pryzmElementInstancing.column = true` — but a column
 *                      is 1 mesh, so the win is one draw call per column rather than
 *                      the ~20 a railing gives, and it should be flipped by the lane
 *                      that writes its delete-path test, not by this one.
 *   beam         OFF — `_disposeMesh` still frees in place on the mutation tick
 *                      (ADR-0297 L2 (b) OPEN). That is a real hazard, it is unfixed,
 *                      and it is unrelated to reachability. Fix the builder first.
 *
 * ⛔ Do NOT flip a family here without the test that proves its delete path, and do
 * not flip one on a reason — flip it on a number.
 */
/**
 * ⭐ RESTORED 2026-08-21 (§NAV-PICK-QUADRATIC, L-2150, lane PERF1) — `handrail` and
 * `stairRailing` are back **ON**, which is the exit condition `89dacf75` wrote for
 * its own mitigation and the one ADR-0338 records under "Consequences / Good".
 *
 * ── THE HISTORY, SO THIS ROW IS NOT FLIPPED AGAIN ON A REASON ────────────────
 * `f80ed827` flipped both ON at 09:09 UK and the founder's demo froze. `89dacf75`
 * flipped them back OFF at 11:08 as a MITIGATION. The freeze was never caused by
 * instancing: `_createGroup` installed two pick closures that each answered a
 * question about ONE group by walking the WHOLE of the module-level singleton's
 * `_elements`, and `gpu-pick.ts _syncInstancedGroup` calls one per group and the
 * other per occupied slot on the HOVER rAF — so a pass cost `G·N + N²` per
 * pointermove. Instancing 240 railings adds ~4920 ROWS to `_elements`, so the
 * flip multiplied N by ten and squared the cost. `50df40a5` cured it structurally
 * with `_membersByGroup` (a write-time reverse index, not a cache).
 *
 * ── WHY IT IS SAFE NOW, RE-MEASURED ON THIS TREE, NOT TRANSCRIBED ────────────
 * Driving the PRODUCTION closures in the PRODUCTION call pattern (the exact
 * membership-signature loop from `gpu-pick.ts`), one full `syncPickScene()` pass:
 *
 *     N=  500 → 0.060 ms      N= 1000 → 0.139 ms      N= 2000 → 0.264 ms
 *     N= 4000 → 0.173 ms      N= 6000 → 0.132 ms      N=12000 → 0.523 ms
 *
 * Against the BEFORE column ADR-0338 tabulates (N=6000 → 550 ms), that is the
 * amplifier gone, not reduced: the curve is FLAT in N, and it stays flat at
 * N=12000 — double the worst case the railing flip can reach. A 60 Hz frame is
 * 16.7 ms; the pass is now ~1% of one frame at twice the load that broke the demo.
 * Grep-verified alongside the timing: no `_elements` ITERATION remains in
 * `InstancedElementRenderer` at all — only `get`/`set`/`delete`/`has`/`size`/
 * `clear`. The quadratic cannot be reached from the pick path any more.
 *
 * ── WHAT TURNING THESE ON BUYS, RE-MEASURED ON THIS TREE ─────────────────────
 * `NavigationDrawCallCensus.spec.ts`, real builders → real `InstancedElementRenderer`
 * → real `THREE.Scene`, 240 railing elements:
 *
 *     OFF: 4920 draw calls · 4920 meshes · 480 materials · 2520 geometries
 *     ON :  250 draw calls ·  250 meshes · 242 materials ·  242 geometries
 *
 * 19.7x fewer draw calls AND 10.4x fewer geometries — the second half matters
 * because the founder asked about RAM, not only about frame rate.
 *
 * ⚠ THE RATIO IS NOT THE ABSOLUTE WIN. 19.7x is measured on a 240-railing census.
 * A project's actual saving is bounded by how many railings it HAS, and that is
 * per-project and unmeasured here. Do not quote 19.7x as a frame-rate promise.
 *
 * ── BACKING OUT COSTS NO REDEPLOY ────────────────────────────────────────────
 * Per-family overrides beat this table (see `isElementInstancingEnabled`), so if
 * a scene regresses, one console line and a reload restores the mitigation:
 *
 *     __pryzmElementInstancing.handrail = false
 *     __pryzmElementInstancing.stairRailing = false
 *
 * ⛔ Do NOT flip a family here without the test that proves its delete path, and
 * do not flip one on a reason — flip it on a number.
 */
const _FAMILY_DEFAULTS: Readonly<Record<InstancedElementFamily, boolean>> = Object.freeze({
    window: true,
    column: false,
    beam: false,
    handrail: true,
    stairRailing: true,
});

/**
 * Feature flag for ADR-0076 Axis 3 element instancing.
 *
 * ── Resolution order, most specific first ───────────────────────────────────
 *   1. `globalThis.__pryzmElementInstancing[family]`  — per-family override
 *   2. `globalThis.__pryzmElementInstancingV1`        — master override
 *   3. `_FAMILY_DEFAULTS[family]`                     — the shipped default
 *
 * ── Calling it with NO family is the LEGACY contract, unchanged ─────────────
 * `isElementInstancingEnabled()` still means exactly what it always meant:
 * `__pryzmElementInstancingV1 === true`, default OFF. Every existing caller and
 * every existing test keeps its current behaviour bit-for-bit. Only a caller that
 * NAMES a family opts into the per-family defaults above. This is deliberate: it
 * makes the blast radius of the window flip exactly one builder.
 *
 * ── The kill switch (why the master override is checked before the default) ──
 * `__pryzmElementInstancingV1 = false` turns EVERYTHING off, windows included,
 * from the browser console with no redeploy. A default the user cannot back out
 * of on their own machine is a bad trade, so the master flag is honoured as an
 * explicit BOOLEAN (both directions), not merely as `=== true`.
 *
 * P8: `pryzm.element-instance.flag` span.
 */
export function isElementInstancingEnabled(family?: InstancedElementFamily): boolean {
    return withBridgeSpan('flag', family ? { 'pryzm.instance.family': family } : {}, () => {
        const g = globalThis as {
            __pryzmElementInstancingV1?: boolean;
            __pryzmElementInstancing?: Partial<Record<InstancedElementFamily, boolean>>;
        };

        // Legacy/master-only contract — preserved exactly.
        if (!family) return g.__pryzmElementInstancingV1 === true;

        // 1. Per-family override wins over everything.
        const perFamily = g.__pryzmElementInstancing?.[family];
        if (typeof perFamily === 'boolean') return perFamily;

        // 2. Master override, honoured in BOTH directions so `= false` is a true
        //    kill switch and `= true` still turns the whole fleet on as before.
        if (typeof g.__pryzmElementInstancingV1 === 'boolean') {
            return g.__pryzmElementInstancingV1;
        }

        // 3. Shipped per-family default.
        return _FAMILY_DEFAULTS[family] === true;
    });
}
