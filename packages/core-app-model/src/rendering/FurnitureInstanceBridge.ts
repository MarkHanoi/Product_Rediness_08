/**
 * @file packages/core-app-model/src/rendering/FurnitureInstanceBridge.ts
 *
 * FurnitureInstanceBridge — ADR-0076 Axis 3 (§PERF-WEBGPU-FURNITURE-INSTANCING,
 * 2026-06-26).
 *
 * Furnish-all-floors on a multi-storey building emits HUNDREDS of furniture
 * items, and today each is an individual THREE.Group (one+ Mesh → one+ draw
 * call) added to the scene by FurnitureFragmentBuilder. On the WebGPU backend
 * that is hundreds of draw calls plus a dispose→rebuild churn per item inside
 * the rAF build queue — the "super slow furnish" the founder reported.
 *
 * This bridge routes ELIGIBLE furniture through the SAME, already-correct
 * InstancedElementRenderer that walls/columns/beams use (the wall/element
 * instancing path), so every furniture item that shares one baked geometry +
 * material collapses into ONE InstancedMesh draw call. Repeated identical items
 * (the dominant case in a generated building: the same bed / rug / wall-art /
 * plant placed once per room across every floor) therefore cost ~1 draw call
 * for the whole building instead of N.
 *
 * WHY THIS IS LOW-RISK (the two known instancing hazards are pre-solved by the
 * renderer this bridge delegates to — identical reasoning to
 * ElementInstanceBridge):
 *
 *   1. Per-element PICKING. InstancedElementRenderer stamps
 *      `getInstanceElementId(slot) -> elementId` on the group; SelectionManager
 *      resolves an instanced hit through it. The element id registered here is
 *      the FURNITURE id, so selecting an instanced furniture item resolves to
 *      that item by construction.
 *   2. Per-level VISIBILITY / ISOLATE. The renderer stamps `userData.levelId`
 *      and `userData.elementType` on the group; ProjectVisibilitySection matches
 *      on exactly those. Passing the furniture's real levelId + 'Furniture'
 *      preserves floor isolate/hide.
 *
 * ELIGIBILITY (deliberately conservative — the caller gates, exactly as
 * WallFragmentBuilder gates the wall instanced path):
 *
 *   A furniture item is instanced ONLY when its built group bakes to a SINGLE
 *   (geometry, material) leaf — i.e. after flattening + applying each leaf's
 *   local transform, every visible Mesh shares ONE material, so the leaves merge
 *   into ONE BufferGeometry rendered with ONE material. This covers the
 *   high-count repeated single-material pieces (rugs, wall art/mirrors, simple
 *   panels, single-material plants/decor). Multi-material procedural furniture
 *   (sofas, kitchens, wardrobes — fabric + wood + metal in one group) is NOT
 *   eligible and stays on the fragment path; instancing those needs a
 *   multi-material instance store (a documented follow-up). `glb_import` items
 *   are also skipped — they are placed directly by the GLB loader, not built
 *   here. This guarantees the bridge can never regress a complex item: when it
 *   is unsure, it declines and the caller renders the normal group.
 *
 * GEOMETRY MODEL: the instanced geometry is the item's REAL baked geometry
 * expressed in the group's LOCAL frame (origin = furniture mount point); the
 * world placement (position + Y-rotation) is encoded in the per-instance matrix.
 * Two items of the same furnitureType + dimensions + colour therefore produce an
 * identical baked geometry hash and land in the SAME InstanceGroup.
 *
 * Contract compliance:
 *   P2 — THREE only via '@pryzm/renderer-three/three'.
 *   P3 — no requestAnimationFrame.
 *   P8 — every exported method carries an OpenTelemetry span.
 *   §01-BIM-ENGINE-CORE §5 — projection-layer only; no store reads/mutations.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { mergeGeometries } from '@pryzm/renderer-three';
import { trace, SpanStatusCode, type Attributes } from '@opentelemetry/api';
import type { InstancedElementRenderer } from './InstancedElementRenderer.js';

const TRACER = trace.getTracer('@pryzm/core-app-model/furniture-instance-bridge', '0.1.0');

function withBridgeSpan<T>(verb: string, attrs: Attributes, fn: () => T): T {
    const span = TRACER.startSpan(`pryzm.furniture-instance.${verb}`, { attributes: attrs });
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

/**
 * Feature flag for furniture GPU instancing.
 *
 * DEFAULT-OFF: instancing is enabled ONLY when
 * `globalThis.__pryzmFurnitureInstancingV1 === true`. A separate switch from
 * `__pryzmElementInstancingV1` (walls/columns/beams) so furniture instancing can
 * be enabled/disabled independently while it is verified in-browser. Any other
 * value keeps every furniture item on its current fragment path, so shipping
 * this code changes nothing until the flag is explicitly switched on.
 *
 * P8: `pryzm.furniture-instance.flag` span.
 */
export function isFurnitureInstancingEnabled(): boolean {
    return withBridgeSpan('flag', {}, () =>
        (globalThis as { __pryzmFurnitureInstancingV1?: boolean })
            .__pryzmFurnitureInstancingV1 === true,
    );
}

/** The result of attempting to bake a furniture group to a single instanceable leaf. */
interface BakedLeaf {
    /** Merged geometry in the group's LOCAL frame (group origin = mount point). */
    readonly geometry: THREE.BufferGeometry;
    /** The single shared material. */
    readonly material: THREE.Material;
}

/**
 * FurnitureInstanceBridge
 *
 * Construct with the shared InstancedElementRenderer (the SAME singleton walls
 * use, `instancedElementRenderer`). The bridge owns no scene state — it bakes
 * the built furniture group, decides eligibility, and delegates to the renderer.
 */
export class FurnitureInstanceBridge {
    constructor(private readonly _renderer: InstancedElementRenderer) {}

    /**
     * Attempt to register a built furniture item as a GPU instance.
     *
     * @param elementId   The furniture element id (becomes the per-instance pick id).
     * @param levelId     The furniture's level id (per-level isolate/hide).
     * @param group       The built, UN-PARENTED furniture group as produced by the
     *                    type builder (children + their local transforms intact).
     * @param worldMatrix The group's intended WORLD transform (position + rotation).
     *
     * @returns `true` when the item was instanced (the caller must then NOT add
     *          the group to the scene), or `false` when the item is ineligible
     *          (the caller renders the normal group — fragment fallback).
     *
     * P8: `pryzm.furniture-instance.register` span.
     */
    register(
        elementId: string,
        levelId: string,
        group: THREE.Object3D,
        worldMatrix: THREE.Matrix4,
    ): boolean {
        return withBridgeSpan(
            'register',
            {
                'pryzm.furniture_instance.id': elementId,
                'pryzm.furniture_instance.level_id': levelId,
            },
            () => {
                const baked = this._bakeSingleLeaf(group);
                if (!baked) {
                    // Ineligible (multi-material / empty / multi-mesh-mixed) — the
                    // caller falls back to the fragment path. Releasing any stale
                    // instance keeps a previously-instanced item from ghosting if it
                    // later became ineligible (e.g. a parameter edit added material).
                    if (this._renderer.isRegistered(elementId)) {
                        this._renderer.unregister(elementId);
                    }
                    return false;
                }
                // Real element type 'Furniture' so Project Browser isolate/hide-by-type
                // resolves the aggregate group (mirrors ElementInstanceBridge).
                this._renderer.register(
                    elementId,
                    baked.geometry,
                    baked.material,
                    worldMatrix,
                    levelId,
                    'Furniture',
                );
                return true;
            },
        );
    }

    /**
     * Update only the world transform of an already-instanced furniture item.
     * O(1) matrix write — no geometry rebuild. No-op if not instanced.
     *
     * P8: `pryzm.furniture-instance.update-transform` span.
     */
    updateTransform(elementId: string, worldMatrix: THREE.Matrix4): void {
        withBridgeSpan(
            'update-transform',
            { 'pryzm.furniture_instance.id': elementId },
            () => {
                this._renderer.updateTransform(elementId, worldMatrix);
            },
        );
    }

    /**
     * Remove a furniture item from instanced rendering. No-op if not instanced.
     *
     * P8: `pryzm.furniture-instance.unregister` span.
     */
    unregister(elementId: string): void {
        withBridgeSpan(
            'unregister',
            { 'pryzm.furniture_instance.id': elementId },
            () => {
                this._renderer.unregister(elementId);
            },
        );
    }

    /** True if this furniture item is currently rendered as an instance. */
    isInstanced(elementId: string): boolean {
        return this._renderer.isRegistered(elementId);
    }

    // ── Private ──────────────────────────────────────────────────────────────

    /**
     * Flatten the group's visible mesh leaves, apply each leaf's local transform
     * to a clone of its geometry, and — IF every leaf shares ONE material —
     * merge them into a single LOCAL-frame geometry. Returns `null` (ineligible)
     * when there are zero leaves, more than one distinct material, any leaf uses
     * a material array, or the merge fails. Conservative by design.
     */
    private _bakeSingleLeaf(group: THREE.Object3D): BakedLeaf | null {
        const meshes: THREE.Mesh[] = [];
        group.traverse((child) => {
            if ((child as THREE.Mesh).isMesh && child.visible !== false) {
                meshes.push(child as THREE.Mesh);
            }
        });
        if (meshes.length === 0) return null;

        // All leaves must share ONE non-array material to be single-leaf eligible.
        let material: THREE.Material | null = null;
        for (const m of meshes) {
            if (Array.isArray(m.material)) return null;
            const mat = m.material as THREE.Material;
            if (material === null) material = mat;
            else if (mat.uuid !== material.uuid) return null;
        }
        if (material === null) return null;

        // Ensure the group's local matrices are current, then express each leaf's
        // geometry in the GROUP's local frame (so the per-instance world matrix is
        // the only thing that differs between two identical items).
        group.updateMatrixWorld(true);
        const groupInverse = new THREE.Matrix4().copy(group.matrixWorld).invert();

        const baked: THREE.BufferGeometry[] = [];
        for (const m of meshes) {
            // leaf-in-group = inverse(groupWorld) · leafWorld
            const leafInGroup = new THREE.Matrix4().multiplyMatrices(groupInverse, m.matrixWorld);
            const g = m.geometry.clone();
            g.applyMatrix4(leafInGroup);
            // Strip non-position attributes that differ per buffer and would block
            // mergeGeometries (it requires identical attribute sets). Keep normal +
            // uv when ALL leaves have them; otherwise normals are recomputed below.
            baked.push(g);
        }

        let merged: THREE.BufferGeometry | null;
        try {
            merged = baked.length === 1 ? baked[0]! : mergeGeometries(baked, false);
        } catch {
            merged = null;
        }
        // mergeGeometries returns null when attribute sets differ across leaves.
        // Retry by normalising to position-only, which always merges; normals are
        // recomputed so lighting stays correct.
        if (!merged && baked.length > 1) {
            try {
                const posOnly = baked.map((g) => {
                    const ng = new THREE.BufferGeometry();
                    const pos = g.getAttribute('position');
                    if (!pos) return ng;
                    ng.setAttribute('position', pos.clone());
                    const idx = g.getIndex();
                    if (idx) ng.setIndex(idx.clone());
                    return ng;
                });
                merged = mergeGeometries(posOnly, false);
                merged?.computeVertexNormals();
            } catch {
                merged = null;
            }
        }
        if (!merged) {
            // Dispose the clones we created before bailing (merge consumed none).
            for (const g of baked) g.dispose();
            return null;
        }
        // mergeGeometries clones into a new buffer; dispose the per-leaf clones
        // when more than one leaf was merged (the single-leaf path returns the
        // clone itself as `merged`, so do not dispose it there).
        if (baked.length > 1) for (const g of baked) g.dispose();

        return { geometry: merged, material };
    }
}
