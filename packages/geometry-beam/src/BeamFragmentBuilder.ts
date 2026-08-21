/**
 * BeamFragmentBuilder
 *
 * Builds THREE.js geometry for structural beams.
 *
 * Supports two geometry modes:
 *   Concrete / generic:  BoxGeometry oriented along the beam path
 *   Steel UB / UC:       Parametric I/H-section via ISectionGenerator + THREE.LOD
 *
 * Steel I-section beams:
 *   - D (total depth) is vertical (world Y)
 *   - B (flange width) is horizontal, perpendicular to beam axis
 *   - Extrusion follows the beam direction from startPoint to endPoint
 *
 * Contract compliance:
 *   §D.3  — builders receive frozen data, compute geometry, register bounds.
 *   §3.5  — no store mutations; store events wire the builder externally.
 *
 * C11 §2 step 3 (Task 1.2) — geometry builds are deferred via FrameScheduler
 *   adaptive drain. `updateBeam()` enqueues the data; `_drainBuildQueue()`
 *   processes up to `_buildsPerFrame` items per pre-render tick.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { getFrameScheduler, type TickListenerDisposer } from '@pryzm/frame-scheduler';
import { BeamData } from '@pryzm/core-app-model/stores';
// ⭐ C100 §9.6.a — THE resolution authority, the same one `resolveDoorFinishColour`,
// `resolveWindowFrameColour` and `HandrailFragmentBuilder.resolveColour` call. NOT
// re-implemented here: a private T2+T1 chain is how C100 §1.1 traces four of the
// eight rival material vocabularies in this repository.
import { resolveMaterialColour } from '@pryzm/core-app-model';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { SteelProfileLibrary } from '@pryzm/plugin-structural';
import { createBeamLOD } from '@pryzm/plugin-structural';
// ADR-0076 Axis 3 (§PERF-WEBGPU-FRAGMENT / §PERF-BEAM-INSTANCING) — optional
// GPU-instancing bridge. Mirrors ColumnFragmentBuilder exactly: when injected
// AND the `__pryzmElementInstancingV1` flag is on AND the beam is a SIMPLE
// concrete rectangular box (not a steel I/H-section LOD, not inclined), the
// beam is registered as a GPU instance instead of an individual mesh.
import {
    ElementInstanceBridge,
    isElementInstancingEnabled,
} from '@pryzm/core-app-model/rendering';

// §BEAM-AUDIT-2026-C3: shared materials are MODULE-SCOPED singletons reused
// across every beam in the scene. `_disposeMesh` MUST NOT call `.dispose()`
// on these — doing so destroys the material for ALL OTHER beams of the same
// type, leaving them rendered as black until a full scene rebuild. The shared
// references are tracked in `_SHARED_MATERIALS` and skipped during disposal.
const _steelMat = new THREE.MeshStandardMaterial({
    color: 0x2a5080,
    metalness: 0.7,
    roughness: 0.3,
});

const _concreteMat = new THREE.MeshStandardMaterial({
    color: 0x2196f3,
    metalness: 0.5,
    roughness: 0.2,
});

const _SHARED_MATERIALS = new WeakSet<THREE.Material>();
_SHARED_MATERIALS.add(_steelMat);
_SHARED_MATERIALS.add(_concreteMat);

/**
 * Painted when a beam names a material that resolves to nothing. The same magenta
 * every S16/S17 family uses — C100 §5: visibly wrong on purpose, because a
 * believable structural grey would render "your material was deleted" as "this
 * beam is steel", which is a claim about the STRUCTURE.
 */
const BEAM_UNRESOLVED_MATERIAL_COLOR = '#ff00ff';

/**
 * ⭐ C100 §2.1 — per-COLOUR shared beam materials, and the "per colour" is the
 * whole point.
 *
 * ⛔ WHAT WAS WRONG. Every beam in the product got one of exactly TWO
 * module-scoped singletons, chosen from `sectionType` and nothing else:
 * `_steelMat` (0x2a5080) or `_concreteMat` (**0x2196f3 — Material Design Blue
 * 500**). A concrete beam is not bright blue, no beam could ever be anything
 * else, and `BeamData` carried no material field for one to be read from. The
 * master's 205 rows were unreachable to the single most structural family there
 * is.
 *
 * ⭐ AND THE FIX MUST NOT MINT ONE MATERIAL PER BEAM. Beams register through
 * `ElementInstanceBridge`, and `InstancedElementRenderer`'s group key ends in
 * `materialUuid` — so a per-beam material would give a size-1 instance group per
 * beam and silently destroy instancing for the family. This cache is keyed by
 * (colour, metalness, roughness), exactly as `WindowBuilder._sharedFrameMaterial`
 * is, so the material count tracks DISTINCT COLOURS and never the beam count.
 * Entries join `_SHARED_MATERIALS` so `_disposeMesh` never disposes one out from
 * under its siblings (§BEAM-AUDIT-2026-C3).
 */
const _sharedBeamMats = new Map<string, THREE.MeshStandardMaterial>();

function _sharedBeamMaterial(color: string, metalness: number, roughness: number): THREE.MeshStandardMaterial {
    const key = `${new THREE.Color(color).getHexString()}|m${metalness}|r${roughness}`;
    let mat = _sharedBeamMats.get(key);
    if (!mat) {
        mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), metalness, roughness });
        _sharedBeamMats.set(key, mat);
        _SHARED_MATERIALS.add(mat);
    }
    return mat;
}

/** Beams whose unresolved id has already been reported — see `resolveBeamMaterial`. */
const _unresolvedBeamReported = new Set<string>();

/**
 * ⭐ C100 §2.1's ladder for a beam, and it is ADDITIVE (§9.6.b).
 *
 *   1. `materialId` resolved through the ONE authority -> the MASTER's colour;
 *   2. an id that names nothing -> MAGENTA, named out loud (§5);
 *   3. no id at all -> the EXISTING `_steelMat` / `_concreteMat` singleton for the
 *      section type, byte-identically.
 *
 * Rung 3 is every beam in every existing project — `BeamData.materialId` did not
 * exist until this commit — so nothing can repaint unless a beam names a master
 * material. §9.6.b met by construction rather than by hope.
 *
 * The section type still chooses the SCALARS (a steel beam stays metallic, a
 * concrete one matte) because those describe the section, not the colour; only
 * the COLOUR moves to the master.
 */
function resolveBeamMaterial(beam: BeamData): THREE.MeshStandardMaterial {
    const isSteel = beam.sectionType === 'UB' || beam.sectionType === 'UC';
    const fallback = isSteel ? _steelMat : _concreteMat;

    const id = beam.materialId?.trim();
    if (!id) return fallback;

    const metalness = isSteel ? 0.7 : 0.5;
    const roughness = isSteel ? 0.3 : 0.2;

    const r = resolveMaterialColour(id, undefined);
    if (r.state === 'unresolved') {
        // ⚠ Once per beam+id, never once per build: a beam rebuilds on every
        // support cascade, and an undeduplicated warn across a full frame is the
        // L-1157 defect where the warning announcing a flood WAS the flood.
        const k = `${beam.id}|${id}`;
        if (!_unresolvedBeamReported.has(k)) {
            _unresolvedBeamReported.add(k);
            console.warn(
                `[BeamFragmentBuilder] C100 §5 — beam ${beam.id} names material '${id}' ` +
                `which resolves to nothing; painting magenta rather than a plausible ` +
                `structural colour. ${r.reason}`,
            );
        }
        return _sharedBeamMaterial(BEAM_UNRESOLVED_MATERIAL_COLOR, metalness, roughness);
    }
    return _sharedBeamMaterial(r.hex, metalness, roughness);
}

// Local Z axis constant
const _localZ = new THREE.Vector3(0, 0, 1);

export class BeamFragmentBuilder {
    private scene: THREE.Scene;
    private meshes: Map<string, THREE.Object3D> = new Map();
    /**
     * ADR-0076 Axis 3 (§PERF-WEBGPU-FRAGMENT / §PERF-BEAM-INSTANCING) — optional
     * GPU-instancing bridge. When injected AND the `__pryzmElementInstancingV1`
     * flag is on AND a beam is a SIMPLE concrete rectangular box (not a steel-LOD
     * I/H-section, not inclined), the beam is registered as a GPU instance instead
     * of an individual mesh. Default-off: null bridge OR flag-off keeps every beam
     * on the fragment path. Mirrors ColumnFragmentBuilder._instanceBridge.
     */
    private _instanceBridge: ElementInstanceBridge | null = null;

    // ── C11 §2 step 3: FrameScheduler adaptive drain ──────────────────────────
    /** Pending beam builds keyed by id — later update wins (dedup). */
    private _pendingBuilds = new Map<string, BeamData>();
    /** FrameScheduler disposer for the drain loop — null when idle. */
    private _rafHandle: TickListenerDisposer | null = null;
    /** Adaptive per-frame budget, starts at 5, adjusts by ±1 each frame. */
    private _buildsPerFrame = 5;
    private static readonly _MAX_BUILDS = 12;
    private static readonly _MIN_BUILDS = 2;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
    }

    /**
     * ADR-0076 Axis 3 — inject the GPU-instancing bridge (the SAME one walls +
     * columns use, constructed over the shared `instancedElementRenderer`). Until
     * this is injected AND `globalThis.__pryzmElementInstancingV1 === true`, beams
     * build exactly as before. Mirrors ColumnFragmentBuilder.setInstanceBridge.
     */
    setInstanceBridge(bridge: ElementInstanceBridge): void {
        this._instanceBridge = bridge;
        console.log('[BeamFragmentBuilder] §PERF-BEAM-INSTANCING ElementInstanceBridge injected (gated by __pryzmElementInstancingV1).');
    }

    /**
     * Eligibility: a beam may use the instanced path only when the bridge is
     * present, the flag is on, and the geometry is a SINGLE unit box — i.e. a
     * simple concrete RECTANGULAR beam. Returns 'box' for that case, null
     * otherwise (→ fragment path). Mirrors ColumnFragmentBuilder._instanceKindFor.
     *
     * Excluded from the instanced path (all return null):
     *   - bridge null / flag off,
     *   - steel UB/UC I-section profiles (multi-mesh THREE.LOD — the fragment
     *     path's _buildSteelBeam),
     *   - INCLINED beams: the bridge can only express a single rotateY (the box
     *     stays axis-vertical). A beam whose start→end has a non-trivial vertical
     *     component would render mis-tilted as an instance, so it MUST stay on the
     *     fragment path (which orients via a full quaternion). Horizontal beams
     *     (|Δy| ≈ 0) are the only safe box case.
     */
    private _instanceKindFor(beam: BeamData): 'box' | null {
        // §NAV-SMOOTHNESS (L-1781) — eligibility now NAMES the family, so the
        // per-family table in `ElementInstanceBridge._FAMILY_DEFAULTS` is REACHABLE
        // from here. It was not before: this read `isElementInstancingEnabled()` with
        // NO argument, the LEGACY master-only contract (`__pryzmElementInstancingV1
        // === true`, default off), so the `beam` entry in that table was
        // authored-but-unwired and setting `__pryzmElementInstancing.beam = true`
        // changed the draw-call count by ZERO (measured: NavigationDrawCallCensus.spec.ts,
        // "THE GATE ITSELF"). Naming the family is behaviour-NEUTRAL under the master
        // flag — the resolver honours `__pryzmElementInstancingV1` in BOTH directions
        // before falling through to the default — so `= true` still turns everything on
        // and `= false` is still a true kill switch.
        if (!this._instanceBridge || !isElementInstancingEnabled('beam')) return null;
        const isSteel = (beam.sectionType === 'UB' || beam.sectionType === 'UC') && !!beam.steelProfileName;
        if (isSteel) return null;
        // Only horizontal beams map cleanly to a rotateY-only instance matrix.
        const dy = beam.endPoint.y - beam.startPoint.y;
        const dx = beam.endPoint.x - beam.startPoint.x;
        const dz = beam.endPoint.z - beam.startPoint.z;
        const horizontalSpan = Math.hypot(dx, dz);
        // Tolerance: vertical drop must be a negligible fraction of the run (and
        // sub-mm absolute). A flat structural beam has dy == 0 by construction.
        if (Math.abs(dy) > 1e-4 && Math.abs(dy) > 1e-3 * horizontalSpan) return null;
        return 'box';
    }

    /**
     * C11 §2 step 3 — enqueue a beam build; drain fires on the next
     * pre-render tick so geometry is never built synchronously in an event
     * handler. Later calls for the same id overwrite earlier ones (dedup).
     */
    updateBeam(beam: BeamData): void {
        this._pendingBuilds.set(beam.id, beam);
        if (this._rafHandle === null) {
            this._rafHandle = getFrameScheduler().schedule('pre-render', () => this._drainBuildQueue());
        }
    }

    remove(id: string): void {
        this._pendingBuilds.delete(id);
        // ADR-0076 Axis 3 — release the GPU instance slot if this beam was on the
        // instanced path (no-op otherwise). Mirrors ColumnFragmentBuilder.remove.
        if (this._instanceBridge?.isInstanced(id)) {
            this._instanceBridge.unregister(id);
        }
        const mesh = this.meshes.get(id);
        if (mesh) {
            this.scene.remove(mesh);
            this._disposeMesh(mesh);
            this.meshes.delete(id);
            elementRegistry.unregisterRoot(id);
        }
    }

    /**
     * §C13-BUILDER-SCENE-CLEAR — detach EVERY root this builder owns from the scene,
     * without tearing the builder down.
     *
     * C13 §3.8/§3.10: the scene graph is project-scoped state and needs a named owner.
     * `dispose()` is the wrong verb at a project switch — the SAME builder instance
     * serves the next project, so a teardown that also drops subscriptions/disposers
     * leaves the INCOMING project unrendered (the L-224 dead-listener class of bug).
     * This is the non-terminal sibling: geometry only, idempotent, re-buildable.
     * Invoked by the C13 `bim-project-cleared` sweep in `initBuilders.ts`.
     */
    clearProjectGeometry(): void {
        this._pendingBuilds.clear();
        for (const id of [...this.meshes.keys()]) this.remove(id);
    }

    /**
     * C11 §2 step 3 — adaptive drain: processes up to `_buildsPerFrame`
     * beams per pre-render tick. Budget auto-adjusts ±1 based on
     * observed frame cost (target: 8–20 ms per drain pass).
     */
    private _drainBuildQueue(): void {
        this._rafHandle = null;
        const t0 = performance.now();

        const ids = [...this._pendingBuilds.keys()].slice(0, this._buildsPerFrame);
        for (const id of ids) {
            const beam = this._pendingBuilds.get(id)!;
            this._pendingBuilds.delete(id);
            try {
                this.build(beam);
            } catch (err) {
                console.error('[BeamFragmentBuilder] build error:', err);
            }
        }

        const frameMs = performance.now() - t0;
        if (frameMs < 8 && this._buildsPerFrame < BeamFragmentBuilder._MAX_BUILDS) {
            this._buildsPerFrame++;
        } else if (frameMs > 20 && this._buildsPerFrame > BeamFragmentBuilder._MIN_BUILDS) {
            this._buildsPerFrame--;
        }

        if (this._pendingBuilds.size > 0) {
            this._rafHandle = getFrameScheduler().schedule('pre-render', () => this._drainBuildQueue());
        }
    }

    build(beam: BeamData): THREE.Object3D {
        // §57 Day 4 (DAILY-USE 2026-05-21, Round 32) — capture _priorVersion
        // BEFORE the dispose path nukes the meshes-map entry, so we can bump
        // it monotonically on the new root.userData below. Same pattern Round
        // 19 established for columns. Defaults to 0 for first build.
        const _priorVersion: number =
            (this.meshes.get(beam.id)?.userData?.version as number | undefined) ?? 0;

        // Remove existing mesh
        if (this.meshes.has(beam.id)) {
            const old = this.meshes.get(beam.id)!;
            this.scene.remove(old);
            this._disposeMesh(old);
            this.meshes.delete(beam.id);
            elementRegistry.unregisterRoot(beam.id);
        }

        const start = new THREE.Vector3(beam.startPoint.x, beam.startPoint.y, beam.startPoint.z);
        const end   = new THREE.Vector3(beam.endPoint.x,   beam.endPoint.y,   beam.endPoint.z);
        const dir   = new THREE.Vector3().subVectors(end, start);
        const length = dir.length();

        if (length < 0.001) {
            const dummy = new THREE.Object3D();
            this.scene.add(dummy);
            this.meshes.set(beam.id, dummy);
            elementRegistry.registerRoot(beam.id, dummy);
            return dummy;
        }

        // ── ADR-0076 Axis 3 (§PERF-BEAM-INSTANCING) — GPU-instanced path ──────
        // Default-off (bridge null OR flag off OR steel-LOD OR inclined →
        // kind === null), in which case we fall straight through to the fragment
        // path below. Mirrors ColumnFragmentBuilder.build().
        const instanceKind = this._instanceKindFor(beam);
        if (instanceKind) {
            return this._buildInstanced(beam, start, end, length, _priorVersion);
        }
        // A beam that was previously instanced but is no longer eligible (e.g.
        // changed to a steel profile or became inclined) must release its slot.
        if (this._instanceBridge?.isInstanced(beam.id)) {
            this._instanceBridge.unregister(beam.id);
        }

        const isSteelSection = (beam.sectionType === 'UB' || beam.sectionType === 'UC') && !!beam.steelProfileName;

        let root: THREE.Object3D;

        if (isSteelSection) {
            root = this._buildSteelBeam(beam, start, end, length);
        } else {
            root = this._buildConcreteBeam(beam, start, end, length);
        }

        // ── Metadata ────────────────────────────────────────────────────────
        // §BEAM-AUDIT-2026-M4: elementType is now lowercase 'beam' (was 'Beam')
        // so it matches the convention used by every other element builder
        // (column/wall/slab/roof) and selection-traversal helpers like
        // deleteSelected and MovePlanToolHandler._readSelection — which look
        // for `userData.elementType` case-sensitively — work for beam roots.
        // §BEAM-AUDIT-2026-M5: expanded userData surface so selection-model
        // consumers can read support assignments + load-bearing flag without
        // round-tripping to the store.
        root.userData = {
            id:               beam.id,
            elementType:      'beam',
            modelId:          'model-default',
            selectable:       true,
            levelId:          beam.levelId,
            steelProfileName: beam.steelProfileName,
            sectionType:      beam.sectionType,
            width:            beam.width,
            depth:            beam.depth,
            length,
            startSupportId:   beam.startSupportId,
            endSupportId:     beam.endSupportId,
            startSupportType: beam.startSupportType,
            endSupportType:   beam.endSupportType,
            material:         beam.material,
            loadBearing:      beam.loadBearing,
            fireRating:       beam.fireRating,
            // §57 Day 4 (Round 32) — monotonic per-build counter. Mirrors
            // ColumnFragmentBuilder.ts:249. Enables NMEexporter proxy-cache
            // invalidation on every rebuild — precondition for promotion to
            // EdgeProjectorService.CACHEABLE_ELEMENT_TYPES.
            version:          _priorVersion + 1,
        };

        Object.defineProperty(root.userData, 'id',          { writable: false });
        Object.defineProperty(root.userData, 'elementType', { writable: false });

        this.scene.add(root);
        this.meshes.set(beam.id, root);
        elementRegistry.registerRoot(beam.id, root);

        return root;
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    /**
     * ADR-0076 Axis 3 (§PERF-BEAM-INSTANCING) — build a simple concrete
     * rectangular beam as a GPU instance.
     *
     * AXIS / ROTATION MAPPING (the subtle part — verified against the fragment
     * path `_buildConcreteBeam`):
     *
     *   Fragment path: `BoxGeometry(width, depth, length)` centred at the beam
     *   midpoint, then oriented by `quaternion.setFromUnitVectors(localZ, dir)`
     *   where `localZ = (0,0,1)` and `dir = normalize(end - start)`. So the box's
     *   LOCAL axes are X = width (horizontal, across), Y = depth (vertical),
     *   Z = length (along the beam axis), and local +Z is rotated to point along
     *   the beam.
     *
     *   Instanced path: the bridge builds `translate(centre) × rotateY(θ) ×
     *   scale(size)` on a unit box. `makeRotationY(θ)` maps local +Z = (0,0,1) to
     *   world (sinθ, 0, cosθ). To make local +Z point along the (horizontal) beam
     *   direction (dx, 0, dz) we need (sinθ, cosθ) ∝ (dx, dz), i.e.
     *       θ = atan2(dx, dz).
     *   With `size = (width, depth, length)` the unit box scales to exactly the
     *   same extents as the fragment BoxGeometry. Centre is the same midpoint.
     *   For a horizontal beam this rotateY-only transform is IDENTICAL to the
     *   fragment quaternion (which, for a horizontal dir, is a pure Y rotation) —
     *   same position, size and orientation. Inclined beams are excluded upstream
     *   by `_instanceKindFor` (they'd need the full quaternion).
     *
     * Mirrors ColumnFragmentBuilder._buildInstanced: the rendered geometry lives
     * in the shared InstancedMesh (per-instance pick + per-level isolate carried
     * by InstancedElementRenderer); we still create a Group root + invisible
     * hit-proxy mesh so SelectionManager raycasting, elementRegistry and cleanup
     * all work unchanged.
     */
    private _buildInstanced(
        beam: BeamData,
        start: THREE.Vector3,
        end: THREE.Vector3,
        length: number,
        priorVersion: number,
    ): THREE.Object3D {
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        // Bearing of the (horizontal) beam axis — see the axis-mapping note above.
        const rotationY = Math.atan2(dx, dz);
        const centre = {
            x: (start.x + end.x) * 0.5,
            y: (start.y + end.y) * 0.5,
            z: (start.z + end.z) * 0.5,
        };

        // §PERF-BEAM-INSTANCING — register on the shared instanced renderer.
        // elementType MUST be lowercase 'beam' (matches the fragment-path
        // userData.elementType so Project Browser isolate/hide-by-type resolves
        // the aggregate group, §INSTANCED-ISOLATE-FIX).
        this._instanceBridge!.register(
            beam.id,
            beam.levelId,
            'beam',
            {
                centre,
                rotationY,
                // Local X = width (across), Y = depth (vertical), Z = length
                // (along axis) — identical to BoxGeometry(width, depth, length).
                size: { x: beam.width, y: beam.depth, z: length },
            },
            // ⭐ C100 §2.1 — the MASTER's material, SHARED per colour. This argument
            // is what lands in `InstancedElementRenderer`'s group key as
            // `materialUuid`, so it must be the shared instance and never a
            // per-beam clone, or every beam becomes its own size-1 group.
            //
            // ⚠ It was `_concreteMat` UNCONDITIONALLY here — so an instanced STEEL
            // beam took the concrete blue while the non-instanced path gave it
            // `_steelMat`. The two paths disagreed, and `resolveBeamMaterial`
            // (which reads `sectionType` for its fallback) closes that too.
            resolveBeamMaterial(beam),
            'box',
        );

        // Root group + identity userData (same shape as the fragment path).
        const root = new THREE.Group();
        root.userData = {
            id:               beam.id,
            elementType:      'beam',
            modelId:          'model-default',
            selectable:       true,
            levelId:          beam.levelId,
            steelProfileName: beam.steelProfileName,
            sectionType:      beam.sectionType,
            width:            beam.width,
            depth:            beam.depth,
            length,
            startSupportId:   beam.startSupportId,
            endSupportId:     beam.endSupportId,
            startSupportType: beam.startSupportType,
            endSupportType:   beam.endSupportType,
            material:         beam.material,
            loadBearing:      beam.loadBearing,
            fireRating:       beam.fireRating,
            version:          priorVersion + 1,
            isInstancedProxy: true,
        };
        Object.defineProperty(root.userData, 'id',          { writable: false });
        Object.defineProperty(root.userData, 'elementType', { writable: false });

        // Position + orient the root exactly like the rendered instance so the
        // invisible hit-proxy (added in local space) lands on the real beam.
        root.position.set(centre.x, centre.y, centre.z);
        root.rotation.y = rotationY;

        // Invisible hit-proxy so intersectObjects() can still select the beam.
        // colorWrite/depthWrite false → imperceptible but raycastable. Box is
        // centred at the origin (BoxGeometry default), matching the instance.
        const proxyGeo = new THREE.BoxGeometry(beam.width, beam.depth, length);
        const proxyMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
        const proxyMesh = new THREE.Mesh(proxyGeo, proxyMat);
        proxyMesh.userData = { role: 'hit-proxy' };
        root.add(proxyMesh);

        this.scene.add(root);
        this.meshes.set(beam.id, root);
        elementRegistry.registerRoot(beam.id, root);

        return root;
    }

    /**
     * Build parametric steel I-section beam with THREE.LOD.
     *
     * The I-section shape is extruded along Z in local space, then the group
     * is oriented so Z aligns with the beam direction.
     * D (depth) is vertical — we apply a correction rotation when the beam is horizontal
     * to keep the web vertical.
     */
    private _buildSteelBeam(
        beam: BeamData,
        start: THREE.Vector3,
        end: THREE.Vector3,
        length: number,
    ): THREE.Object3D {
        const profile = SteelProfileLibrary.get(beam.steelProfileName!);
        if (!profile) {
            console.warn(`[BeamFragmentBuilder] Steel profile "${beam.steelProfileName}" not found — falling back to box`);
            return this._buildConcreteBeam(beam, start, end, length);
        }

        // ⭐ C100 §2.1 — the MASTER when the beam names one, `_steelMat` when it does not.
        const lod = createBeamLOD(profile, length, resolveBeamMaterial(beam));

        lod.traverse(obj => {
            if ((obj as THREE.Mesh).isMesh) {
                obj.castShadow    = true;
                obj.receiveShadow = true;
            }
        });

        // Position at midpoint
        const center = start.clone().add(end).multiplyScalar(0.5);
        lod.position.copy(center);

        // Orient: rotate local Z to align with beam direction
        const beamDir = new THREE.Vector3().subVectors(end, start).normalize();
        const quaternion = new THREE.Quaternion().setFromUnitVectors(_localZ, beamDir);
        lod.quaternion.copy(quaternion);

        // For a horizontal beam, the above quaternion rotates around the Y axis,
        // keeping the section's Y axis (depth D) pointing up — correct.
        // For inclined beams the section will tilt with the inclination, which is
        // the physically correct behaviour for a beam following its own axis.

        return lod;
    }

    /** Build a concrete / generic rectangular beam oriented along the beam path. */
    private _buildConcreteBeam(
        beam: BeamData,
        start: THREE.Vector3,
        end: THREE.Vector3,
        length: number,
    ): THREE.Object3D {
        const geometry = new THREE.BoxGeometry(beam.width, beam.depth, length);
        // ⭐ C100 §2.1 — the MASTER when the beam names one, `_concreteMat` when it does not.
        const mesh = new THREE.Mesh(geometry, resolveBeamMaterial(beam));

        const center = start.clone().add(end).multiplyScalar(0.5);
        mesh.position.copy(center);

        // Align to beam direction — Three.js lookAt points -Z toward target
        // so we use the reversed approach via setFromUnitVectors
        const beamDir = new THREE.Vector3().subVectors(end, start).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(_localZ, beamDir);
        mesh.quaternion.copy(q);

        mesh.castShadow    = true;
        mesh.receiveShadow = true;

        return mesh;
    }

    /**
     * §BEAM-AUDIT-2026-C3: dispose of geometry (which is per-mesh and
     * uniquely owned), but skip materials registered in `_SHARED_MATERIALS`
     * — disposing them destroys rendering for every other beam of the same
     * type. Per-mesh non-shared materials are still disposed.
     */
    private _disposeMesh(obj: THREE.Object3D): void {
        obj.traverse(child => {
            const m = child as THREE.Mesh;
            if (m.isMesh) {
                m.geometry?.dispose();
                if (Array.isArray(m.material)) {
                    m.material.forEach(mat => {
                        if (mat && !_SHARED_MATERIALS.has(mat)) mat.dispose();
                    });
                } else {
                    const mat = m.material as THREE.Material | undefined;
                    if (mat && !_SHARED_MATERIALS.has(mat)) mat.dispose();
                }
            }
        });
    }
}
