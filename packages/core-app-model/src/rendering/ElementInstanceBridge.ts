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
 * Feature flag for ADR-0076 Axis 3 element instancing.
 *
 * DEFAULT-OFF (mirrors the inverse of isWallPipelineV2Enabled): instancing is
 * enabled ONLY when `globalThis.__pryzmElementInstancingV1 === true`. Any other
 * value (undefined / false) keeps every element on its current fragment path, so
 * shipping this code changes nothing until the flag is explicitly switched on.
 *
 * P8: `pryzm.element-instance.flag` span.
 */
export function isElementInstancingEnabled(): boolean {
    return withBridgeSpan('flag', {}, () =>
        (globalThis as { __pryzmElementInstancingV1?: boolean }).__pryzmElementInstancingV1 === true,
    );
}
