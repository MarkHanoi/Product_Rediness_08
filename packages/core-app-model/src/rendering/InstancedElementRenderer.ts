/**
 * @file src/core/rendering/InstancedElementRenderer.ts
 *
 * InstancedElementRenderer — Phase 7 GPU Instancing coordinator.
 *
 * Groups elements by a geometry hash so that elements sharing the same
 * geometry (e.g. curtain wall panels of the same size, repeated structural
 * columns) are rendered as a single THREE.InstancedMesh draw call instead of
 * N individual draw calls.
 *
 * ## Usage lifecycle
 *
 *   1.  After a builder computes geometry for an element, call register().
 *       If a compatible InstanceGroup exists, the element is added as an
 *       instance (matrix update only — no new Mesh).
 *       If not, a new InstanceGroup + InstancedMesh is created and added to
 *       the scene.
 *
 *   2.  When an element's transform changes (but geometry is unchanged),
 *       call updateTransform() — O(1) matrix write, no GPU geometry rebuild.
 *
 *   3.  When an element is removed, call unregister() — the instance slot is
 *       zeroed and returned to the free list.
 *
 *   4.  When the scene is cleared (project close), call clear().
 *
 * ## Geometry hash
 *
 * The hash is a lightweight fingerprint:
 *   `{indexCount}_{vertexCount}_{x0}_{y0}_{z0}`
 *
 * Two geometries with the same vertex count, index count, and first vertex
 * position are assumed identical.  This covers the common case (same box
 * dimensions → same geometry) without a full buffer comparison.  Builders
 * that produce intentionally distinct geometries must ensure the first vertex
 * differs (which is automatic for differently-sized boxes).
 *
 * ## SelectionManager integration
 *
 * InstancedMesh does not support per-instance userData.  The standard pattern
 * (used by CurtainWallInstanceManager) is to store `instanceElementIds:
 * string[]` on the mesh's `userData`, keyed by slot index.  SelectionManager
 * can resolve `hit.instanceId` → element ID via that array.  This renderer
 * follows the same pattern: every InstancedMesh created here sets
 *   `mesh.userData.instanceElementIds = instanceGroup._idToSlot` (derived on
 *   each frame from the InstanceGroup's internal map via the exported helper).
 *
 * ## Contract compliance
 *   §01-BIM-ENGINE-CORE-CONTRACT §5 — no store reads or mutations.
 *   §02-BIM-SPATIAL-PROJECTION §8  — projection-layer helper; no semantic state.
 *   §03-BIM-SEMANTIC-MODEL         — geometry only, never read back into stores.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { InstanceGroup, INSTANCE_GROUP_MAX } from './InstanceGroup';
import { dedupInstanceMaterial, resetSharedMaterialCache } from './SharedMaterialCache';

/**
 * A record stored for each registered element so we can find its group on
 * update/remove without a full Map scan.
 */
interface ElementRecord {
    /**
     * The EFFECTIVE group key — i.e. the shard this element actually lives in.
     * §INSTANCE-GROUP-SPILL (L-1400): equals `baseKey` for shard 0 and
     * `${baseKey}~s{n}` for the n-th spill shard.
     */
    groupKey: string;
    /**
     * §INSTANCE-GROUP-SPILL (L-1400) — the shard-independent
     * (level × geometry × material) identity. Re-registration compares THIS, not
     * `groupKey`: an element that spilled into shard 3 and is rebuilt unchanged
     * must update in place, not be treated as having changed groups.
     */
    baseKey: string;
    slot: number;
    /**
     * §FURNITURE-MULTIPART-INSTANCING — the id surfaced to selection/pick for this
     * slot. For single-element registrations this equals the storage key
     * (`elementId`). For a multi-material furniture PART the storage key is a
     * synthetic per-part key (`elementId#partN`) while `pickId` is the REAL
     * furniture element id, so picking any part resolves to the one furniture
     * element. Defaults to the storage key when the caller does not override it,
     * preserving the wall/column behaviour exactly.
     */
    pickId: string;
}

/**
 * §SELECT-INSTANCED-PICK (FIX #5) — world-space oriented bounding box for one
 * instance.  `center` + `quaternion` come from the per-instance world matrix;
 * `size` is the shared local geometry's bounding-box extents scaled by the
 * matrix's per-axis scale.  Used to build a real selection highlight for
 * instanced-only elements (e.g. structural columns/beams) instead of the faint
 * AABB fallback box.
 */
export interface InstanceObb {
    readonly center: { x: number; y: number; z: number };
    readonly size: { x: number; y: number; z: number };
    readonly quaternion: { x: number; y: number; z: number; w: number };
}

export class InstancedElementRenderer {

    private _scene: THREE.Scene | null = null;

    /**
     * geometry-hash → InstanceGroup.
     * One entry per unique geometry shape.
     */
    private _groups: Map<string, InstanceGroup> = new Map();

    /**
     * elementId → { groupKey, slot }
     * Allows O(1) lookup during updateTransform / unregister.
     */
    private _elements: Map<string, ElementRecord> = new Map();

    /**
     * §SELECT-INSTANCED-PICK (FIX #5) — groupKey → (slot → instance OBB).
     * Captured at register() time so the selection highlight for an
     * instanced-only element (column/beam) can be the element's real oriented
     * box, not a faint axis-aligned fallback.
     */
    private _obbByGroup: Map<string, Map<number, InstanceObb>> = new Map();

    /**
     * §INSTANCE-GROUP-SPILL (L-1400) — baseKey → ordered list of EFFECTIVE group
     * keys (its shards). A key with a single shard has a one-entry chain whose only
     * member IS the base key, so the single-group case is byte-identical to the
     * pre-spill behaviour.
     */
    private _shards: Map<string, string[]> = new Map();

    /**
     * §INSTANCE-GROUP-SPILL (L-1400) — baseKey → next shard ordinal to mint.
     * MONOTONIC while any shard for the key survives, so a shard removed from the
     * middle of a chain can never have its name reissued to a different mesh.
     * Reset only when the chain empties completely.
     */
    private _nextShardIndex: Map<string, number> = new Map();

    /**
     * §INSTANCE-GROUP-SPILL (L-1400) — baseKey → highest shard COUNT reported to
     * the console, so the report is emitted once per NEW shard rather than once per
     * element. The founder's load log carried 488 `[InstanceGroup] Group full` lines
     * for a single 100-window storey (measured); this replaces the whole flood with
     * one line per spill event, and the count is the finding.
     */
    private _reportedShardCount: Map<string, number> = new Map();

    // ── Scene injection ───────────────────────────────────────────────────────

    /**
     * Inject the Three.js scene.  Must be called once before register().
     */
    setScene(scene: THREE.Scene): void {
        this._scene = scene;
    }

    // ── Core API ──────────────────────────────────────────────────────────────

    /**
     * Register (or update) an element for instanced rendering.
     *
     * If a group for the geometry's hash already exists, the element is added
     * as a new instance (or its matrix updated if already registered).
     * If no group exists, a new InstanceGroup + InstancedMesh is created and
     * added to the scene.
     *
     * @param elementId  Unique storage key for this registration. For a single
     *                   element this is the BIM element id. For a multi-material
     *                   furniture PART it is a synthetic per-part key
     *                   (`elementId#partN`) — see `pickId`.
     * @param geometry   The element's THREE.BufferGeometry.
     * @param material   The element's THREE.Material.
     * @param matrix     World-space transform matrix for this instance.
     * @param pickId     §FURNITURE-MULTIPART-INSTANCING — the id surfaced to
     *                   selection (getInstanceElementId). Defaults to `elementId`.
     *                   A multi-material furniture item passes the REAL furniture
     *                   element id here for EVERY part so picking any part resolves
     *                   to the one furniture element.
     */
    register(
        elementId: string,
        geometry: THREE.BufferGeometry,
        material: THREE.Material,
        matrix: THREE.Matrix4,
        levelId?: string,
        elementType?: string,
        pickId?: string,
    ): void {
        // §PERF-INSTANCE-MATERIAL-DEDUP (L-131 P6) — swap a fresh-but-look-alike
        // material for the canonical shared instance for its VISUAL signature
        // BEFORE the group key is computed. Because _hashGeometry keys on
        // material.uuid, builders that mint one material per element (columns,
        // beams, handrails, rails, furniture leaves) otherwise force one
        // InstanceGroup of size 1 each — instancing collapses nothing. With
        // dedup, all same-look elements share one canonical material → one group →
        // one draw call per (geometry × look × level). No-op when the material is
        // already canonical, is not dedup-eligible, or the flag
        // `__pryzmInstanceMaterialDedup === false` (→ exact pre-P6 behaviour).
        // Selection/highlight is a separate OBB overlay, so sharing the base
        // material is imperceptible; a per-element colour change re-signatures and
        // re-keys the element out WITHOUT recolouring the others it shared with.
        const sharedMaterial = dedupInstanceMaterial(material);

        // §NAV-TYPE-IN-GROUP-KEY (L-1781) — elementType is part of the group
        // IDENTITY, not merely a label stamped on it. See _createGroup's stamp for
        // the measurement that forced this: `geometry × material × levelId` does
        // NOT imply one element type, and the aggregate carries no per-element
        // userData.id for the visibility traverses to fall back on.
        const baseKey = this._hashGeometry(geometry, sharedMaterial, levelId, elementType);

        // §WALL-AUDIT-2026-W7 (move-revert root cause):
        //
        //   _hashGeometry includes `material.uuid` in the group key. Builders
        //   that allocate a fresh THREE.Material on every rebuild (e.g.
        //   WallFragmentBuilder.buildWall -> new MeshStandardMaterial) therefore
        //   produce a DIFFERENT key on every call - even when the wall has not
        //   moved. Without this guard the element is appended to a NEW group
        //   on the new key while the OLD slot in the OLD group is left in place
        //   at the old transform: a phantom wall persists at the pre-move
        //   position.
        //
        //   Fix: if this element is already registered under a DIFFERENT key,
        //   release its old slot first so the move actually reaches the GPU.
        //
        //   §INSTANCE-GROUP-SPILL (L-1400) - the comparison is on `baseKey`, NOT on
        //   the effective (sharded) key. An element sitting in shard 3 whose geometry
        //   and material are unchanged has NOT changed groups, and evicting it would
        //   reintroduce exactly the phantom this guard exists to prevent.
        const prev = this._elements.get(elementId);
        if (prev && prev.baseKey !== baseKey) {
            const prevGroup = this._groups.get(prev.groupKey);
            if (prevGroup) {
                prevGroup.removeInstance(elementId);
                // §SELECT-INSTANCED-PICK (FIX #5) - release the old slot's OBB too.
                this._obbByGroup.get(prev.groupKey)?.delete(prev.slot);
                if (prevGroup.activeCount === 0) {
                    this._removeGroup(prev.groupKey, prevGroup);
                }
            }
            this._elements.delete(elementId);
        }

        // -- §INSTANCE-GROUP-SPILL (L-1400) - SPILL, DO NOT REFUSE --------------
        //
        // MEASURED, on the founder's own shape (a storey of single-pane windows -
        // see `packages/geometry-window/__tests__/WindowInstanceCapSpill.test.ts`):
        // ONE window registers 12 sub-boxes - 10 frame members, 1 glazing pane,
        // 1 sill board - and the ten frame members all share one material, so they
        // all land in ONE group. 512 / 10 = 51.2, and the 52nd window
        // (`w-51#2`) was the first refusal. Past that point EVERY further frame
        // member was dropped: 488 of them at 100 windows.
        //
        // "Dropped" is literal, and is what made this a CORRECTNESS bug rather than
        // a performance one. `WindowBuilder._convertGroupToInstances` strips the real
        // sub-meshes unconditionally after registering them, so a refused instance
        // does NOT fall back to a mesh - it is not drawn at all. Windows 52+ rendered
        // as glazing and a sill with NO FRAME. The founder saw a broken scene; the
        // log said "will not be instanced".
        //
        // The fix is to give the key MORE SHARDS, not a bigger literal. N shards of
        // 512 cost N draw calls; the alternative the old code chose cost the element.
        // See INSTANCE_GROUP_MAX's doc comment for why 512 is arbitrary.
        let chain = this._shards.get(baseKey);
        if (!chain) {
            chain = [];
            this._shards.set(baseKey, chain);
        }

        let targetKey = '';
        let group: InstanceGroup | null = null;
        let slot = -1;

        // (a) Already in a shard of this key -> idempotent in-place matrix update.
        if (prev && prev.baseKey === baseKey) {
            const own = this._groups.get(prev.groupKey);
            if (own) {
                slot = own.addInstance(elementId, matrix);
                if (slot >= 0) {
                    targetKey = prev.groupKey;
                    group = own;
                }
            }
        }

        // (b) First shard with room.
        if (slot < 0) {
            for (const shardKey of chain) {
                const candidate = this._groups.get(shardKey);
                if (!candidate || candidate.isFull) continue;
                const s = candidate.addInstance(elementId, matrix);
                if (s >= 0) {
                    targetKey = shardKey;
                    group = candidate;
                    slot = s;
                    break;
                }
            }
        }

        // (c) Every shard full (or none exists yet) -> mint another one.
        if (slot < 0) {
            const ordinal = this._nextShardIndex.get(baseKey) ?? 0;
            const shardKey = ordinal === 0 ? baseKey : baseKey + '~s' + ordinal;
            this._nextShardIndex.set(baseKey, ordinal + 1);
            const fresh = this._createGroup(shardKey, geometry, sharedMaterial, levelId, elementType);
            chain.push(shardKey);
            if (ordinal > 0) this._reportSpill(baseKey, chain.length);
            targetKey = shardKey;
            group = fresh;
            slot = fresh.addInstance(elementId, matrix);
        }

        if (slot >= 0 && group) {
            this._elements.set(elementId, {
                groupKey: targetKey,
                baseKey,
                slot,
                pickId: pickId ?? elementId,
            });

            // §SELECT-INSTANCED-PICK (FIX #5) - store the instance's world-space OBB
            // so SelectionManager._buildGeometryHighlight can build a REAL purple fill
            // for instanced-only elements (columns/beams) instead of falling through
            // to the faint AABB box.
            const obbStore = this._obbByGroup.get(targetKey);
            if (obbStore) {
                obbStore.set(slot, this._computeInstanceObb(group.mesh.geometry, matrix));
            }
        }
    }

    /**
     * §INSTANCE-GROUP-SPILL (L-1400) - create ONE InstancedMesh-backed shard under
     * `key` and parent it into the scene. Extracted verbatim from register() so a
     * spill shard is constructed by exactly the same code as shard 0; every
     * userData hook (pick id, occupied slots, OBB accessor, element type, level id)
     * is per-shard and closes over that shard's own key.
     */
    private _createGroup(
        key: string,
        geometry: THREE.BufferGeometry,
        material: THREE.Material,
        levelId: string | undefined,
        elementType: string | undefined,
    ): InstanceGroup {
        const group = new InstanceGroup(geometry, material, INSTANCE_GROUP_MAX);
        group.mesh.name = `instanced-group-${key}`;

        // Store instanceElementIds on userData so SelectionManager can
        // map instanceId → elementId via:
        //   mesh.userData.instanceElementIds[hit.instanceId]
        // We expose a live reference; the InstanceGroup._idToSlot map is
        // private, so we provide a slot→id array rebuilt on demand.
        // We use a lazy getter so the array stays in sync.
        group.mesh.userData.getInstanceElementId = (slotIndex: number): string | undefined => {
            for (const [, record] of this._elements.entries()) {
                if (record.groupKey === key && record.slot === slotIndex) {
                    // §FURNITURE-MULTIPART-INSTANCING — return the pick id, NOT the
                    // storage key. For walls/columns pickId === storage key; for a
                    // multi-material furniture part it is the real furniture id, so
                    // selecting any part resolves to the one furniture element.
                    return record.pickId;
                }
            }
            return undefined;
        };
        // §SELECT-INSTANCED-PICK (FIX #1) — enumerate every OCCUPIED instance
        // slot in this group so the GPU pick strategy can paint a DISTINCT pick
        // colour per instance. The group itself carries a single synthetic
        // userData.id (stamped below) ONLY so the ElementRegistry includes it;
        // the FINAL resolved selection is always the per-instance element id
        // returned by getInstanceElementId(slot) — never the group id.
        group.mesh.userData.getOccupiedInstanceSlots = (): readonly number[] => {
            const slots: number[] = [];
            for (const [, record] of this._elements.entries()) {
                if (record.groupKey === key) slots.push(record.slot);
            }
            return slots;
        };
        // §SELECT-INSTANCED-PICK (FIX #5) — per-instance OBB store + accessor.
        const obbStore = new Map<number, InstanceObb>();
        this._obbByGroup.set(key, obbStore);
        group.mesh.userData.getInstanceObb = (slotIndex: number): InstanceObb | undefined =>
            obbStore.get(slotIndex);
        // §INSTANCED-ISOLATE-FIX (2026-05-25) — stamp the REAL element type (e.g.
        // 'wall') rather than the generic placeholder so the Project Browser's
        // isolate/hide-by-type traverses (ProjectVisibilitySection) can resolve this
        // per-level aggregate group. Falls back to the generic label when the caller
        // does not supply a type.
        //
        // ⚠ CORRECTED 2026-08-21 (§NAV-TYPE-IN-GROUP-KEY, L-1781). This comment used
        // to end: "The group key includes geometry+material+levelId, so every instance
        // in a group shares one element type." THAT IMPLICATION IS FALSE, and it was
        // MEASURED false — `NavigationDrawCallCensus.spec.ts` §NAV-TYPE-COLLAPSE
        // registered six handrail balusters and six stair-railing balusters at the same
        // level, same unit box, same look, and got ONE group reported as
        //     handrail[handrail+stair-railing]
        // because SharedMaterialCache correctly deduplicates two look-alike materials
        // to one canonical uuid — which is its job — and the key then cannot tell the
        // families apart. The stamp below was therefore a claim about the group's
        // contents that the key did not establish.
        //
        // This matters because an InstancedMesh exposes NO per-element userData.id, so
        // ProjectVisibilitySection's §INSTANCED-ISOLATE-FIX helpers address aggregates
        // by `(levelId, elementType)` and have no other handle. A group holding two
        // families under one stamp is a group where "hide stair railings" hides the
        // handrails too, or neither. `elementType` is consequently part of the group
        // KEY now (see register()), so the stamp is true by construction. The cost is
        // at most one extra group per (geometry × material × level × TYPE) — measured
        // at 10 groups for 240 railing elements, i.e. nothing — and the alternative was
        // trading a 19.7x draw-call win for a visibility regression.
        group.mesh.userData.elementType = elementType ?? 'InstancedElement';
        group.mesh.userData.isInstancedGroup = true;
        // §SELECT-INSTANCED-PICK (FIX #1) — stamp a STABLE synthetic group id so
        // GpuPickStrategy._buildElementRegistry (which keys by userData.id) maps
        // this InstancedMesh under a defined id and syncPickScene renders it into
        // the id buffer. Without an id the group fell out of the registry → the
        // group was never drawn into the GPU id buffer → instanced walls/columns/
        // beams were UNCLICKABLE on the default (GPU) pick path (the BVH path
        // worked via hit.instanceId → getInstanceElementId). CRITICAL: this id is
        // a hosting handle only — the resolved selection is the per-instance
        // element id, recovered in gpu-pick.ts via per-instance slot colours.
        group.mesh.userData.id = `instanced-group-${key}`;
        // §INSTANCED-LEVEL-VIS (2026-05-25) — stamp the group's levelId so the
        // Project Browser's hide-by-level (ProjectVisibilitySection.applyLevelVisibility,
        // which matches `obj.userData.levelId === levelId`) can hide instanced elements.
        // Without this, walls that qualify for GPU instancing (plain: no openings, not
        // curved, no joins) rendered via this InstancedMesh stayed visible when their
        // level was hidden — while curtain walls + non-instanced walls (which stamp
        // levelId on their group) hid correctly. SAFE: the group key
        // (`_hashGeometry(geometry, material, levelId)`) includes levelId, so EVERY
        // instance in this group is on the same level.
        if (levelId !== undefined) group.mesh.userData.levelId = levelId;

        if (this._scene) {
            this._scene.add(group.mesh);
        }
        this._groups.set(key, group);
        return group;
    }

    /**
     * §INSTANCE-GROUP-SPILL (L-1400) - ONE line per spill event.
     *
     * The message has to SURVIVE, because "this key needed more than 512 slots" is a
     * real fact about the model and the founder should be able to see it. What must
     * not survive is 488 copies of it, one per element, each carrying a stack frame,
     * during load - that volume is what hid the finding in the first place. So:
     * aggregated on the REASON (the key), carrying the COUNT.
     */
    private _reportSpill(baseKey: string, shardCount: number): void {
        if ((this._reportedShardCount.get(baseKey) ?? 0) >= shardCount) return;
        this._reportedShardCount.set(baseKey, shardCount);
        console.info(
            '[InstancedElementRenderer] instance group "' + baseKey + '" exceeded ' +
            INSTANCE_GROUP_MAX + ' slots and spilled to ' + shardCount + ' shards (~' +
            shardCount * INSTANCE_GROUP_MAX + ' slots, ' + shardCount +
            ' draw calls). 0 elements dropped.'
        );
    }

    /**
     * Update the world-space transform of a single instance.
     * Does NOT require a geometry rebuild — the GPU receives only the new
     * matrix, which costs ~4 floats × 16 = 64 bytes of bandwidth.
     *
     * No-op if elementId is not registered.
     */
    updateTransform(elementId: string, matrix: THREE.Matrix4): void {
        const record = this._elements.get(elementId);
        if (!record) return;
        const group = this._groups.get(record.groupKey);
        group?.setMatrix(elementId, matrix);
        // §SELECT-INSTANCED-PICK (FIX #5) — keep the highlight OBB in sync on move.
        if (group) {
            this._obbByGroup.get(record.groupKey)
                ?.set(record.slot, this._computeInstanceObb(group.mesh.geometry, matrix));
        }
    }

    /**
     * Remove an element from instanced rendering.
     * The instance slot is zeroed (invisible) and returned to the free list.
     *
     * No-op if elementId is not registered.
     */
    unregister(elementId: string): void {
        const record = this._elements.get(elementId);
        if (!record) return;
        const group = this._groups.get(record.groupKey);
        group?.removeInstance(elementId);
        this._elements.delete(elementId);
        // §SELECT-INSTANCED-PICK (FIX #5) — drop the freed slot's OBB.
        this._obbByGroup.get(record.groupKey)?.delete(record.slot);

        // Remove empty groups to free GPU memory.
        if (group && group.activeCount === 0) {
            this._removeGroup(record.groupKey, group);
        }
    }

    // ── Query ─────────────────────────────────────────────────────────────────

    /** Returns true if elementId is currently registered for instanced rendering. */
    isRegistered(elementId: string): boolean {
        return this._elements.has(elementId);
    }

    /** Total number of elements registered across all groups. */
    get totalInstances(): number {
        return this._elements.size;
    }

    /** Number of InstanceGroups (= distinct geometry types). */
    get groupCount(): number {
        return this._groups.size;
    }

    /**
     * §PRYZM-PERF (INSTR1) — per-group breakdown, for `window.pryzmPerf.report()`.
     *
     * `groupCount` vs `totalInstances` is the single most decisive number in a batch
     * freeze — 367 walls collapsing to 1-2 groups means instancing worked, 367 groups
     * means it collapsed nothing — but the RATIO alone cannot say WHY a bad ratio
     * happened. Two very different defects produce "many groups":
     *
     *   • many groups each holding ONE instance  → the geometry hash is not colliding
     *     (per-element unique material is the known offender — see the instancing
     *     memory note: "instancing defeated by per-element unique materials"), or
     *   • a few fat groups plus a long tail      → a level/material split, which is
     *     legitimate and means the cost is elsewhere.
     *
     * The hash key itself distinguishes them, because it is BUILT from the axes that
     * can split a group: `levelId_indexCount_vertexCount_x0_y0_z0_materialUuid`
     * (`_hashGeometry` below). Reading the keys shows whether 367 groups differ by
     * LEVEL, by VERTEX COUNT, or by MATERIAL UUID — three different bugs.
     *
     * READ-ONLY: returns a fresh array of plain records; nothing here can mutate a
     * group. Sorted densest-first so a truncated print still shows what matters.
     */
    get groupSummary(): { key: string; active: number; allocated: number }[] {
        const out: { key: string; active: number; allocated: number }[] = [];
        for (const [key, group] of this._groups) {
            out.push({ key, active: group.activeCount, allocated: group.allocatedSlots });
        }
        out.sort((a, b) => b.active - a.active);
        return out;
    }

    /**
     * §INSTANCE-GROUP-SPILL (L-1400) — per-BASE-key shard breakdown, for
     * `window.pryzmPerf.report()`.
     *
     * `groupSummary` above counts SHARDS, so after a spill it reports three entries
     * where the model has one (geometry × material × level) identity, and the
     * collapse ratio it feeds silently worsens even though nothing regressed. This
     * getter is the honest denominator: one row per real identity, carrying how many
     * shards it needed. `shards > 1` is the visible, countable statement that this
     * key exceeded 512 — the fact the old per-element `console.warn` was trying to
     * make, made once.
     *
     * READ-ONLY. Sorted by shard count then instance count, so anything that spilled
     * sorts to the top of a truncated print.
     */
    get spillSummary(): { baseKey: string; shards: number; instances: number; capacity: number }[] {
        const out: { baseKey: string; shards: number; instances: number; capacity: number }[] = [];
        for (const [baseKey, chain] of this._shards) {
            let instances = 0;
            let capacity = 0;
            let shards = 0;
            for (const shardKey of chain) {
                const group = this._groups.get(shardKey);
                if (!group) continue;
                shards++;
                instances += group.activeCount;
                capacity += group.capacity;
            }
            if (shards > 0) out.push({ baseKey, shards, instances, capacity });
        }
        out.sort((a, b) => (b.shards - a.shards) || (b.instances - a.instances));
        return out;
    }

    /**
     * §INSTANCE-GROUP-SPILL (L-1400) — how many instances the renderer FAILED to
     * place, summed across every live shard.
     *
     * ⭐ With spill wired this must be 0, and 0 is the whole claim: an instance that
     * a full group refuses is now handed to a sibling shard rather than dropped. It
     * is exposed rather than asserted internally because "we never drop an element"
     * is precisely the sort of statement that should be READ OFF the running system,
     * not trusted from a comment. A non-zero reading here means an element is in the
     * model and not on the screen.
     */
    get droppedInstanceCount(): number {
        let dropped = 0;
        for (const [, group] of this._groups) dropped += group.refusedCount;
        return dropped;
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /**
     * Remove all groups and dispose all GPU resources.
     * Call on project close to prevent memory leaks.
     */
    clear(): void {
        for (const [key, group] of this._groups.entries()) {
            this._removeGroup(key, group);
        }
        this._elements.clear();
        // §INSTANCE-GROUP-SPILL (L-1400) — shard chains, ordinals and the
        // report-once ledger are all scene-scoped; a new project starts at shard 0
        // and is entitled to its own spill report.
        this._shards.clear();
        this._nextShardIndex.clear();
        this._reportedShardCount.clear();
        // §PERF-INSTANCE-MATERIAL-DEDUP (L-131 P6) — drop canonical-material
        // references so a canonical cannot outlive the scene and be served after
        // its builder disposes it on the next project. Materials themselves are
        // disposed by their builders/groups exactly as before (flag-off parity).
        resetSharedMaterialCache();
        console.log('[InstancedElementRenderer] cleared');
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    /**
     * Remove a single group from the scene and dispose it.
     */
    private _removeGroup(key: string, group: InstanceGroup): void {
        if (this._scene) {
            this._scene.remove(group.mesh);
        }
        group.dispose();
        this._groups.delete(key);
        // §SELECT-INSTANCED-PICK (FIX #5) — drop the whole group's OBB store.
        this._obbByGroup.delete(key);

        // §INSTANCE-GROUP-SPILL (L-1400) — take the dead shard out of its chain so
        // the shard walk in register() does not keep probing a key with no group.
        //
        // ⚠ The ORDINAL counter is deliberately NOT decremented. If shard 1 of
        // [base, base~s1, base~s2] empties and is removed, a length-derived next
        // ordinal would reissue `base~s2` — a name a LIVE mesh already answers to,
        // and both `userData.id` (GPU pick registry) and `_obbByGroup` are keyed by
        // it. Monotonic ordinals make that collision unrepresentable; the counter is
        // reset only in clear(), when no shard of any key survives.
        const baseKey = this._baseKeyOf(key);
        const chain = this._shards.get(baseKey);
        if (chain) {
            const at = chain.indexOf(key);
            if (at >= 0) chain.splice(at, 1);
            if (chain.length === 0) {
                this._shards.delete(baseKey);
                this._nextShardIndex.delete(baseKey);
                this._reportedShardCount.delete(baseKey);
            }
        }
    }

    /**
     * §INSTANCE-GROUP-SPILL (L-1400) — effective shard key → base key.
     *
     * Safe as a plain suffix strip because a base key always ends in the material's
     * UUID (`_hashGeometry` below), and a UUID contains no `~`.
     */
    private _baseKeyOf(key: string): string {
        return key.replace(/~s\d+$/, '');
    }

    /**
     * Compute a lightweight geometry+material fingerprint.
     *
     * Key format: `{indexCount}_{vertexCount}_{x0.3f}_{y0.3f}_{z0.3f}_{materialUuid}`
     *
     * Two geometries are assumed identical when they share the same vertex count,
     * index count, and first-vertex position — this is correct for all standard
     * box / cylinder / extrusion primitives of the same dimensions.
     *
     * Including the material UUID prevents cross-type collisions (e.g. a 1×1×1
     * glass box and a 1×1×1 frame box with different materials get separate groups).
     */
    /**
     * §SELECT-INSTANCED-PICK (FIX #5) — derive the world-space OBB for one
     * instance from the shared local geometry box + the instance world matrix.
     *
     * `center`    = local box centre transformed by the matrix.
     * `size`      = local box extents scaled by the matrix's per-axis scale.
     * `quaternion`= the matrix rotation (no shear assumed — BIM instance matrices
     *               are TRS).
     */
    private _computeInstanceObb(
        geometry: THREE.BufferGeometry,
        matrix: THREE.Matrix4,
    ): InstanceObb {
        if (geometry.boundingBox === null) geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        const localCenter = new THREE.Vector3();
        const localSize = new THREE.Vector3(1, 1, 1);
        if (box) {
            box.getCenter(localCenter);
            box.getSize(localSize);
        }

        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        matrix.decompose(position, quaternion, scale);

        // World centre = matrix · localCenter.
        const worldCenter = localCenter.clone().applyMatrix4(matrix);
        // World extents = local extents × |per-axis scale| (rotation captured by quaternion).
        const worldSize = new THREE.Vector3(
            localSize.x * Math.abs(scale.x),
            localSize.y * Math.abs(scale.y),
            localSize.z * Math.abs(scale.z),
        );

        return {
            center: { x: worldCenter.x, y: worldCenter.y, z: worldCenter.z },
            size: { x: worldSize.x, y: worldSize.y, z: worldSize.z },
            quaternion: { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w },
        };
    }

    private _hashGeometry(
        geometry: THREE.BufferGeometry,
        material: THREE.Material,
        levelId = 'default',
        elementType = 'InstancedElement',
    ): string {
        const pos   = geometry.attributes.position;
        const idxCt = geometry.index?.count ?? 0;
        const vtxCt = pos?.count ?? 0;
        const x0    = pos ? pos.getX(0).toFixed(3) : '0';
        const y0    = pos ? pos.getY(0).toFixed(3) : '0';
        const z0    = pos ? pos.getZ(0).toFixed(3) : '0';
        return `${elementType}_${levelId}_${idxCt}_${vtxCt}_${x0}_${y0}_${z0}_${material.uuid}`;
    }
}

/** Module-level singleton — injected into EngineBootstrap and available as window.__instancedElementRenderer. */
export const instancedElementRenderer = new InstancedElementRenderer();
