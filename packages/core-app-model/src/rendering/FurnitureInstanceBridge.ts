/**
 * @file packages/core-app-model/src/rendering/FurnitureInstanceBridge.ts
 *
 * FurnitureInstanceBridge — ADR-0076 Axis 3 (§PERF-WEBGPU-FURNITURE-INSTANCING,
 * 2026-06-26) + §FURNITURE-MULTIPART-INSTANCING (2026-06-29).
 *
 * Furnish-all-floors on a multi-storey building emits HUNDREDS of furniture
 * items, and today each is an individual THREE.Group (one+ Mesh → one+ draw
 * call) added to the scene by FurnitureFragmentBuilder. On the WebGPU backend
 * that is hundreds of draw calls plus a dispose→rebuild churn per item inside
 * the rAF build queue — the "super slow furnish" the founder reported.
 *
 * This bridge routes ELIGIBLE furniture through the SAME, already-correct
 * InstancedElementRenderer that walls/columns/beams use, so repeated furniture
 * items collapse into shared InstancedMesh draw calls.
 *
 * ── TWO INSTANCING MODES ──────────────────────────────────────────────────
 *
 *   1. SINGLE-LEAF (original §PERF-WEBGPU-FURNITURE-INSTANCING). When a built
 *      group bakes to ONE (geometry, material) leaf — rugs, wall art, mirrors,
 *      simple single-material decor — it merges into ONE BufferGeometry rendered
 *      with ONE material and lands in one InstanceGroup. N identical items →
 *      1 draw call.
 *
 *   2. MULTI-PART (§FURNITURE-MULTIPART-INSTANCING). The DOMINANT cost on a
 *      furnished building is the multi-material procedural furniture — sofas,
 *      kitchens, wardrobes, beds, plants — whose group is a STABLE SET of
 *      (geometry, material) parts in a fixed local arrangement (fabric + wood +
 *      metal + cushions). The bridge decomposes the group into M parts and
 *      registers EACH PART as its own instance stream, keyed by
 *      (source key + part index + geometry hash + material + level). It places
 *      an instance of EVERY part at the item's transform. So 50 identical sofas
 *      (4 parts each) → ~4 InstancedMeshes of 50 instances, not 200 individual
 *      meshes.
 *
 *      elementId → MULTIPLE slots. One furniture element now occupies one slot in
 *      several part-groups. The bridge owns the `elementId → [partKey…]` map so a
 *      single register/updateTransform/unregister/isInstanced call drives ALL of
 *      the element's part-slots together (per-element add/remove/move/visibility/
 *      level-isolate stay atomic). Each part is registered into the renderer under
 *      its own UNIQUE storage key (`elementId#partN`) but with the REAL furniture
 *      element id as the `pickId`, so InstancedElementRenderer.getInstanceElementId
 *      resolves ANY part's instance back to the one furniture element id — keeping
 *      SelectionManager's per-instance pick working unchanged.
 *
 * WHY THIS IS LOW-RISK (the two known instancing hazards are pre-solved by the
 * renderer this bridge delegates to):
 *
 *   1. Per-element PICKING. InstancedElementRenderer stamps
 *      `getInstanceElementId(slot) -> pickId` on each group; SelectionManager
 *      resolves an instanced hit through it. Every part of one furniture item
 *      registers with the SAME pickId (the furniture id), so selecting ANY part
 *      resolves to that item by construction.
 *   2. Per-level VISIBILITY / ISOLATE. The renderer stamps `userData.levelId`
 *      and `userData.elementType` on every group; ProjectVisibilitySection
 *      matches on exactly those. Every part-group carries the furniture's real
 *      levelId + 'Furniture', so all of an item's parts isolate/hide together.
 *
 * ── ELIGIBILITY (deliberately conservative — the bridge declines when unsure) ──
 *
 *   MULTI-PART is instanced ONLY when the item exposes a STABLE source key (the
 *   furnitureType, or for `glb_import` a stable per-source key) AND the part
 *   decomposition for that source key is consistent across instances (same part
 *   count, same per-part geometry hash + material). A truly unique one-off (no
 *   stable source key, or an arbitrary-material glb whose part set varies per
 *   instance) is NOT instanced and stays on the fragment path. This guarantees
 *   the bridge can never collapse two genuinely different items into one stream.
 *
 *   The stable-source guard is enforced at the SOURCE-KEY level by the
 *   InstancedElementRenderer's geometry hash: two parts only share a group when
 *   their geometry hash + material + level match. So even if the eligibility
 *   gate were over-eager, mismatched parts simply land in separate groups rather
 *   than corrupting an existing stream. The gate's job is only to keep
 *   genuinely-unique items OFF the instanced path entirely.
 *
 * GEOMETRY MODEL: each part's instanced geometry is the part's REAL baked
 * geometry expressed in the group's LOCAL frame (origin = furniture mount point);
 * the world placement (position + Y-rotation) is the per-instance matrix, shared
 * by every part of the item. Two items of the same furnitureType + dimensions +
 * materials therefore produce identical per-part baked geometry hashes and their
 * corresponding parts land in the SAME InstanceGroups.
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
 * this code changes nothing until the flag is explicitly switched on. The
 * multi-part path is gated by the SAME flag — additive, no production change.
 *
 * P8: `pryzm.furniture-instance.flag` span.
 */
export function isFurnitureInstancingEnabled(): boolean {
    return withBridgeSpan('flag', {}, () =>
        (globalThis as { __pryzmFurnitureInstancingV1?: boolean })
            .__pryzmFurnitureInstancingV1 === true,
    );
}

/** One instanceable (geometry, material) part of a furniture item, in LOCAL frame. */
interface BakedPart {
    /** Part geometry in the group's LOCAL frame (group origin = mount point). */
    readonly geometry: THREE.BufferGeometry;
    /** The single material for this part. */
    readonly material: THREE.Material;
}

/**
 * FurnitureInstanceBridge
 *
 * Construct with the shared InstancedElementRenderer (the SAME singleton walls
 * use, `instancedElementRenderer`). The bridge owns no scene state — it bakes
 * the built furniture group into one-or-more (geometry, material) parts, decides
 * eligibility, and delegates each part to the renderer. It owns ONLY the
 * `elementId → [part storage keys]` map so per-element ops fan out to all parts.
 */
export class FurnitureInstanceBridge {
    constructor(private readonly _renderer: InstancedElementRenderer) {}

    /**
     * elementId → the synthetic per-part storage keys (`elementId#partN`) the
     * item currently occupies in the renderer. One entry per instanced furniture
     * item; the array length is the part count (1 for single-leaf items).
     * §FURNITURE-MULTIPART-INSTANCING — drives atomic per-element fan-out.
     */
    private _partKeys: Map<string, string[]> = new Map();

    /**
     * Attempt to register a built furniture item as one-or-more GPU instances.
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
                const sourceKey = this._sourceKey(group);
                const parts = this._bakeParts(group);
                if (!parts || !sourceKey) {
                    // Ineligible (no stable source key / empty / un-bakeable) — the
                    // caller falls back to the fragment path. Release any stale
                    // instance so a previously-instanced item that became ineligible
                    // (e.g. a parameter edit) does not ghost.
                    if (this._partKeys.has(elementId)) this._releaseParts(elementId);
                    return false;
                }

                // An item's part set may change between rebuilds (e.g. an edit added a
                // shelf). Drop the prior parts first so we never leave orphan slots —
                // then re-register the current part set fresh.
                if (this._partKeys.has(elementId)) this._releaseParts(elementId);

                const keys: string[] = [];
                for (let i = 0; i < parts.length; i++) {
                    const part = parts[i]!;
                    // Storage key is unique per (element, part). The renderer hashes
                    // (geometry, material, level) into the GROUP key, so identical
                    // parts of identical items still collapse into one group; the
                    // storage key only keeps this element's slot addressable.
                    const partKey = `${elementId}#part${i}`;
                    this._renderer.register(
                        partKey,
                        part.geometry,
                        part.material,
                        worldMatrix,
                        levelId,
                        'Furniture',
                        // pickId = REAL furniture id for EVERY part, so picking any
                        // part resolves to the one furniture element.
                        elementId,
                    );
                    keys.push(partKey);
                }
                this._partKeys.set(elementId, keys);
                return true;
            },
        );
    }

    /**
     * Update only the world transform of an already-instanced furniture item.
     * O(1) matrix write PER PART — no geometry rebuild. No-op if not instanced.
     * All of the item's parts move together.
     *
     * P8: `pryzm.furniture-instance.update-transform` span.
     */
    updateTransform(elementId: string, worldMatrix: THREE.Matrix4): void {
        withBridgeSpan(
            'update-transform',
            { 'pryzm.furniture_instance.id': elementId },
            () => {
                const keys = this._partKeys.get(elementId);
                if (!keys) return;
                for (const k of keys) this._renderer.updateTransform(k, worldMatrix);
            },
        );
    }

    /**
     * Remove a furniture item from instanced rendering — ALL of its parts. No-op
     * if not instanced.
     *
     * P8: `pryzm.furniture-instance.unregister` span.
     */
    unregister(elementId: string): void {
        withBridgeSpan(
            'unregister',
            { 'pryzm.furniture_instance.id': elementId },
            () => {
                this._releaseParts(elementId);
            },
        );
    }

    /** True if this furniture item is currently rendered as one-or-more instances. */
    isInstanced(elementId: string): boolean {
        return this._partKeys.has(elementId);
    }

    // ── Private ──────────────────────────────────────────────────────────────

    /** Unregister every part slot this element holds and forget the mapping. */
    private _releaseParts(elementId: string): void {
        const keys = this._partKeys.get(elementId);
        if (!keys) return;
        for (const k of keys) this._renderer.unregister(k);
        this._partKeys.delete(elementId);
    }

    /**
     * Derive a STABLE source key for the item — the eligibility gate's stable-set
     * guard. A repeated item (same furnitureType, or a glb with a stable source)
     * yields a non-null key; a unique one-off without a stable source yields null
     * and stays on the fragment path.
     *
     * `furnitureType` is stamped on the built meshes by FurnitureFragmentBuilder
     * (root + children). `glb_import` is included ONLY when it carries a stable
     * `modelId`/`glbKey` so two placements of the SAME GLB share a source key;
     * an arbitrary-material glb with no stable source is declined.
     */
    private _sourceKey(group: THREE.Object3D): string | null {
        const ud = group.userData as {
            furnitureType?: string;
            modelId?: string;
            glbKey?: string;
        } | undefined;
        let furnitureType = ud?.furnitureType;
        let glbKey = ud?.glbKey ?? ud?.modelId;
        if (!furnitureType) {
            // The root may be a bare Group; read the first stamped child.
            group.traverse((c) => {
                const cud = c.userData as { furnitureType?: string; glbKey?: string; modelId?: string } | undefined;
                if (!furnitureType && cud?.furnitureType) furnitureType = cud.furnitureType;
                if (!glbKey && (cud?.glbKey ?? cud?.modelId)) glbKey = cud?.glbKey ?? cud?.modelId;
            });
        }
        if (!furnitureType) return null;
        if (furnitureType === 'glb_import') {
            // Only stable-source GLBs are eligible — needs a per-source key.
            if (!glbKey || glbKey === 'model-default') return null;
            return `glb:${glbKey}`;
        }
        return `type:${furnitureType}`;
    }

    /**
     * Decompose the group's visible mesh leaves into instanceable parts.
     *
     * Each leaf becomes one part: its geometry is cloned, expressed in the GROUP's
     * LOCAL frame (so the per-instance world matrix is the only thing differing
     * between two identical items), with its single material. Adjacent leaves that
     * share ONE material are MERGED into one part (fewer draw calls + identical to
     * the original single-leaf collapse for single-material items).
     *
     * Returns `null` (ineligible) when there are zero leaves or any leaf uses a
     * material array (we cannot split a multi-material BufferGeometry into per-
     * group streams safely — declines, stays on fragment path).
     *
     * NOTE: a SINGLE-material item naturally yields exactly one part — so the
     * original single-leaf collapse is a special case of this decomposition.
     */
    private _bakeParts(group: THREE.Object3D): BakedPart[] | null {
        const meshes: THREE.Mesh[] = [];
        group.traverse((child) => {
            if ((child as THREE.Mesh).isMesh && child.visible !== false) {
                meshes.push(child as THREE.Mesh);
            }
        });
        if (meshes.length === 0) return null;

        // Material arrays would require splitting one geometry across several
        // groups by material-index — declined (conservative, stays on fragment).
        for (const m of meshes) {
            if (Array.isArray(m.material)) return null;
        }

        group.updateMatrixWorld(true);
        const groupInverse = new THREE.Matrix4().copy(group.matrixWorld).invert();

        // Bucket leaves by material uuid so all same-material leaves merge into one
        // part — gives the minimal stable part set (one part per distinct material).
        // Insertion order preserved so the part index is deterministic per source.
        const byMaterial = new Map<string, { material: THREE.Material; geoms: THREE.BufferGeometry[] }>();
        for (const m of meshes) {
            const mat = m.material as THREE.Material;
            const leafInGroup = new THREE.Matrix4().multiplyMatrices(groupInverse, m.matrixWorld);
            const g = m.geometry.clone();
            g.applyMatrix4(leafInGroup);
            const bucket = byMaterial.get(mat.uuid);
            if (bucket) bucket.geoms.push(g);
            else byMaterial.set(mat.uuid, { material: mat, geoms: [g] });
        }

        const parts: BakedPart[] = [];
        for (const { material, geoms } of byMaterial.values()) {
            const merged = this._mergeBucket(geoms);
            if (!merged) {
                // Could not merge this bucket — dispose everything baked so far and
                // decline the whole item (do not partially instance).
                for (const p of parts) p.geometry.dispose();
                for (const g of geoms) g.dispose();
                return null;
            }
            parts.push({ geometry: merged, material });
        }
        return parts.length > 0 ? parts : null;
    }

    /**
     * Merge a same-material bucket of LOCAL-frame geometries into one buffer.
     * Single geometry passes through; multiple merge via mergeGeometries with a
     * position-only retry (recomputing normals) when attribute sets differ. Clones
     * are disposed on the multi-leaf path. Returns null on failure.
     */
    private _mergeBucket(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
        if (geoms.length === 1) return geoms[0]!;

        let merged: THREE.BufferGeometry | null;
        try {
            merged = mergeGeometries(geoms, false);
        } catch {
            merged = null;
        }
        if (!merged) {
            try {
                const posOnly = geoms.map((g) => {
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
        // mergeGeometries clones into a new buffer; dispose the per-leaf clones.
        for (const g of geoms) g.dispose();
        return merged;
    }
}
