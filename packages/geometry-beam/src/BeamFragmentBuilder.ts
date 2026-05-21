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
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { SteelProfileLibrary } from '@pryzm/plugin-structural';
import { createBeamLOD } from '@pryzm/plugin-structural';

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

// Local Z axis constant
const _localZ = new THREE.Vector3(0, 0, 1);

export class BeamFragmentBuilder {
    private scene: THREE.Scene;
    private meshes: Map<string, THREE.Object3D> = new Map();

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
        const mesh = this.meshes.get(id);
        if (mesh) {
            this.scene.remove(mesh);
            this._disposeMesh(mesh);
            this.meshes.delete(id);
            elementRegistry.unregisterRoot(id);
        }
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

        const lod = createBeamLOD(profile, length, _steelMat);

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
        const mesh = new THREE.Mesh(geometry, _concreteMat);

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
