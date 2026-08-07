import * as THREE from '@pryzm/renderer-three/three';
// §FIX-BUILDER-ISOLATION-LEAK (L-320) / §I2 — WebGPU-safe deep-dispose so the
// `usedTimes` device-loss throw (L-303 family) can never abort a handrail
// teardown mid-traverse and leak the root into the next project.
// §GPU-RESOURCE-LIFETIME (ADR-0297, INVARIANT L2) — DETACH now, RELEASE at the
// next frame boundary. The queue drains through `safeDisposeObject3D`, so §I2
// throw-tolerance and INVARIANT L1 ownership are preserved.
import { detachAndReleaseChildren } from '@pryzm/renderer-three';
import { HandrailData } from '@pryzm/core-app-model/stores';
import { BimManager } from '@pryzm/core-app-model';
import { elementRegistry, StoreType } from '@pryzm/core-app-model/element-registry';
// ADR-0076 Axis 3 (§PERF-WEBGPU-FRAGMENT / §PERF-RAIL-INSTANCING) — optional
// GPU-instancing bridge. Mirrors ColumnFragmentBuilder / BeamFragmentBuilder: when
// injected AND the `__pryzmElementInstancingV1` flag is on, the REPEATED vertical
// balusters + posts (the per-handrail mesh-count multiplier — the spike measured
// ~500-1000 baluster meshes in a real building, each its own draw call) are
// registered as GPU instances instead of N individual meshes. The single swept
// top-rail / glass infill stay on the fragment path. Default-off: null bridge OR
// flag-off keeps every sub-mesh on the fragment path (identical to before).
import {
    ElementInstanceBridge,
    isElementInstancingEnabled,
} from '@pryzm/core-app-model/rendering';

export class HandrailFragmentBuilder {
    private scene: THREE.Scene;
    private bimManager: BimManager;
    private handrailRoots: Map<string, THREE.Group> = new Map();
    /**
     * ADR-0076 Axis 3 (§PERF-RAIL-INSTANCING) — optional GPU-instancing bridge.
     * When injected AND `__pryzmElementInstancingV1` is on, the repeated balusters
     * + posts of a handrail are registered as GPU instances (one InstancedMesh per
     * geo×mat×level) instead of individual THREE.Mesh draw calls. Default-off.
     */
    private _instanceBridge: ElementInstanceBridge | null = null;
    /**
     * §PERF-RAIL-INSTANCING — per-handrail set of the synthetic instance ids
     * (`${handrailId}#bal-${i}` / `${handrailId}#post-${i}`) currently registered
     * on the bridge, so a rebuild/remove releases EVERY slot (a handrail is 1:N on
     * the bridge, unlike the 1:1 column/beam). Keyed by handrail id.
     */
    private _instanceIds: Map<string, string[]> = new Map();

    constructor(scene: THREE.Scene, bimManager: BimManager) {
        this.scene = scene;
        this.bimManager = bimManager;
    }

    /**
     * ADR-0076 Axis 3 — inject the GPU-instancing bridge (the SAME one walls +
     * columns + beams use, constructed over the shared `instancedElementRenderer`).
     * Until this is injected AND `globalThis.__pryzmElementInstancingV1 === true`,
     * handrails build exactly as before. Mirrors ColumnFragmentBuilder.setInstanceBridge.
     */
    setInstanceBridge(bridge: ElementInstanceBridge): void {
        this._instanceBridge = bridge;
        console.log('[HandrailFragmentBuilder] §PERF-RAIL-INSTANCING ElementInstanceBridge injected (gated by __pryzmElementInstancingV1).');
    }

    /**
     * Eligibility: the repeated baluster/post primitives may use the instanced path
     * only when the bridge is present AND the flag is on. The balusters/posts are
     * always simple vertical box/cylinder primitives, so there is no per-element
     * geometry exclusion (unlike steel-LOD columns). Returns true → instanced path
     * for the repeated members; false → fragment path. Bridge null / flag off → false.
     */
    private _instancingActive(): boolean {
        return !!this._instanceBridge && isElementInstancingEnabled();
    }

    /**
     * §PERF-RAIL-INSTANCING — release every instance slot this handrail registered
     * on the bridge (no-op when none / bridge absent). Called before each rebuild
     * and on removeHandrail.
     */
    private _unregisterInstances(handrailId: string): void {
        const ids = this._instanceIds.get(handrailId);
        if (ids && this._instanceBridge) {
            for (const id of ids) this._instanceBridge.unregister(id);
        }
        this._instanceIds.delete(handrailId);
    }

    updateHandrail(handrail: Readonly<HandrailData>): void {
        this.buildHandrail(handrail);
    }

    removeHandrail(id: string): void {
        // §PERF-RAIL-INSTANCING — release any GPU instance slots first (no-op when
        // the handrail was on the pure fragment path).
        this._unregisterInstances(id);
        const root = this.handrailRoots.get(id);
        if (root) {
            // §GPU-RESOURCE-LIFETIME (ADR-0297, L2 (a)) — DETACH before anything is
            // released. The previous order (disposeRoot then scene.remove) destroyed
            // the GPU buffers while the root was still a live descendant of the scene.
            this.scene.remove(root);
            root.parent = null;
            this.disposeRoot(root);
            this.handrailRoots.delete(id);
        }
        elementRegistry.unregisterRoot(id);
        elementRegistry.unregister(id);
    }

    /**
     * §FIX-BUILDER-ISOLATION-LEAK (L-320) — dispose EVERY handrail root this builder
     * owns and clear its registry, so a project switch cannot leave stale handrail
     * geometry in the scene. Called from the project-isolation teardown
     * (`bim-project-cleared` in initTools) alongside the WallFragmentBuilder.
     *
     * This is the C13 GEOMETRY-side isolation, complementing the data-side
     * ProjectIsolationAudit: the per-element `bim-handrail-removed` path can abort
     * mid-teardown on the WebGPU `usedTimes` device-loss throw (L-303 family),
     * leaving roots behind — this sweep cleans up whatever survived, WebGPU-safe
     * (disposeRoot routes through safeDisposeObject3D, so it never re-throws).
     */
    dispose(): void {
        for (const id of Array.from(this.handrailRoots.keys())) {
            this.removeHandrail(id);
        }
        this.handrailRoots.clear();
        this._instanceIds.clear();
    }

    private disposeRoot(root: THREE.Group): void {
        // §GPU-RESOURCE-LIFETIME (ADR-0297, INVARIANT L2) — L-691 migration.
        // WAS: `safeDisposeObject3D(root); root.clear();` — dispose BEFORE detach.
        // `removeHandrail()` compounded it by calling this BEFORE `scene.remove(root)`,
        // so the buffers were destroyed with the root still in the scene graph.
        // `detachAndReleaseChildren` detaches first and releases at the frame boundary.
        detachAndReleaseChildren(root);
    }

    private buildHandrail(handrail: Readonly<HandrailData>): void {
        const [start, end] = handrail.baseLine;
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const length = Math.sqrt(dx * dx + dz * dz);
        const angle = Math.atan2(dz, dx);

        const levelId = handrail.levelId;
        const level = this.bimManager.getLevelById(levelId);
        const elevation = level ? level.elevation : 0;
        const baseOffset = handrail.baseOffset ?? 0;
        const worldY = elevation + baseOffset;

        // §57 Day 5 (DAILY-USE 2026-05-21, Round 34) — capture _priorVersion
        // BEFORE the disposeRoot path nukes the userData. Mirrors Round 19
        // column pattern. Defaults to 0 for first build.
        let root = this.handrailRoots.get(handrail.id);
        const _priorVersion: number = (root?.userData?.version as number | undefined) ?? 0;

        // §PERF-RAIL-INSTANCING — a rebuild reallocates the sub-meshes/instances;
        // release any prior instance slots up-front so a shrinking handrail does not
        // leave stale balusters on the GPU. (disposeRoot below drops the fragment
        // sub-meshes; this drops the instanced ones.)
        this._unregisterInstances(handrail.id);

        if (!root) {
            root = new THREE.Group();
            this.scene.add(root);
            this.handrailRoots.set(handrail.id, root);
            // §3.5 FIX: elementRegistry.registerSemantic() moved here from HandrailStore.add().
            // Builders may register in ElementRegistry (§4.3). Stores may not.
            elementRegistry.registerSemantic(handrail.id, 'handrail' as StoreType);
        } else {
            this.disposeRoot(root);
        }
        elementRegistry.registerRoot(handrail.id, root);

        root.userData = {
            id: handrail.id,
            type: 'Handrail',
            elementType: 'Handrail',
            levelId: handrail.levelId,
            modelId: 'model-default',
            selectable: true,
            pathStart: { x: start.x, z: start.z },
            pathEnd:   { x: end.x,   z: end.z   },
            totalLength: length,
            height: handrail.height,
            // §57 Day 5 — monotonic per-build counter. Enables NMEexporter
            // proxy cache invalidation after every rebuild.
            version: _priorVersion + 1,
        };

        root.position.set(start.x, worldY, start.z);
        root.rotation.y = -angle;

        // §PERF-RAIL-INSTANCING — collect the synthetic instance ids registered for
        // this handrail (1:N). Instancing is active only when the bridge is injected
        // AND the flag is on; otherwise every member stays a real fragment mesh.
        const instancingActive = this._instancingActive();
        const registeredIds: string[] = [];

        // World-space transform of a LOCAL handrail-frame point (the root group is
        // at (start.x, worldY, start.z) rotated by -angle about Y). Used to express
        // each baluster/post CENTRE in world space for the bridge (which renders in
        // world space, not the parented group's local space).
        //
        //   root.rotation.y = -angle, so a local (lx, ly, lz) maps to world =
        //   pos + R_y(-angle)·local. R_y(-angle) on (x,0,z): x' = x·cosθ − z·sinθ,
        //   z' = x·sinθ + z·cosθ with θ = angle. (Verified against THREE.Group's
        //   matrixWorld to <1e-9 for all 8 baluster/post corners.) Every baluster/
        //   post has lz = 0, but the lz term is kept correct for generality.
        const toWorld = (lx: number, ly: number, lz: number): { x: number; y: number; z: number } => ({
            x: start.x + lx * Math.cos(angle) - lz * Math.sin(angle),
            y: worldY + ly,
            z: start.z + lx * Math.sin(angle) + lz * Math.cos(angle),
        });

        const railProfile = handrail.railProfile ?? 'rectangular';

        // ── Top rail (single swept body — stays a fragment) ───────────────────────
        if (railProfile === 'round') {
            const radius = (handrail.railDiameter ?? 0.04) / 2;
            const railGeo = new THREE.CylinderGeometry(radius, radius, length, 8);
            railGeo.rotateZ(Math.PI / 2);
            const railMat = new THREE.MeshStandardMaterial({ color: handrail.materialColor || '#cccccc' });
            const railMesh = new THREE.Mesh(railGeo, railMat);
            railMesh.position.set(length / 2, handrail.height, 0);
            railMesh.userData = { role: 'geometry', selectable: false };
            root.add(railMesh);
        } else {
            const geo = new THREE.BoxGeometry(length, 0.05, handrail.thickness);
            const mat = new THREE.MeshStandardMaterial({ color: handrail.materialColor || '#cccccc' });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(length / 2, handrail.height, 0);
            mesh.userData = { role: 'geometry', selectable: false };
            root.add(mesh);
        }

        // ── Infill ────────────────────────────────────────────────────────────────
        if (handrail.fillType === 'glass') {
            // Single swept glass panel — stays a fragment (not a repeated primitive).
            const glassGeo = new THREE.BoxGeometry(length, handrail.height - 0.1, 0.01);
            const glassMat = new THREE.MeshStandardMaterial({
                color: '#88ccff',
                transparent: true,
                opacity: 0.3,
                metalness: 0.1,
                roughness: 0.1
            });
            const glassMesh = new THREE.Mesh(glassGeo, glassMat);
            glassMesh.position.set(length / 2, handrail.height / 2, 0);
            glassMesh.userData = { role: 'geometry', selectable: false };
            root.add(glassMesh);
        } else if (handrail.fillType === 'baluster') {
            const balusterSpacing = handrail.balusterSpacing ?? handrail.postSpacing ?? 0.11;
            if (balusterSpacing > 0 && length > balusterSpacing) {
                const bHeight = handrail.height - 0.05;
                const bShape = handrail.balusterShape ?? 'rectangular';
                const bWidth = handrail.balusterWidth ?? 0.02;
                const bMat = new THREE.MeshStandardMaterial({ color: handrail.materialColor || '#888888' });
                const isRound = bShape === 'round';
                // Local extents → bridge size. Round baluster: X/Z = diameter (= bWidth),
                // matching CylinderGeometry(bWidth/2, bWidth/2, bHeight). Box baluster:
                // X = Z = bWidth, Y = bHeight, matching BoxGeometry(bWidth, bHeight, bWidth).
                const count = Math.floor(length / balusterSpacing) - 1;
                // Fragment-path geometry shared across this handrail's balusters.
                const bGeo = !instancingActive
                    ? (isRound
                        ? new THREE.CylinderGeometry(bWidth / 2, bWidth / 2, bHeight, 6)
                        : new THREE.BoxGeometry(bWidth, bHeight, bWidth))
                    : null;
                for (let i = 1; i <= count; i++) {
                    const lx = i * balusterSpacing;     // along the rail
                    const lyCentre = bHeight / 2;        // base at local y=0 → centre at half-height
                    if (instancingActive) {
                        const instId = `${handrail.id}#bal-${i}`;
                        this._instanceBridge!.register(
                            instId,
                            handrail.levelId,
                            'Handrail',
                            {
                                // CENTRE of the baluster in WORLD space.
                                centre: toWorld(lx, lyCentre, 0),
                                // Vertical member: rotateY = -angle keeps a SQUARE box
                                // baluster oriented identically to the parented fragment
                                // group (round cylinders are Y-symmetric → harmless).
                                rotationY: -angle,
                                size: { x: bWidth, y: bHeight, z: bWidth },
                            },
                            bMat,
                            isRound ? 'cylinder' : 'box',
                        );
                        registeredIds.push(instId);
                    } else {
                        const bMesh = new THREE.Mesh(bGeo!, bMat);
                        bMesh.position.set(lx, lyCentre, 0);
                        bMesh.userData = { role: 'geometry', selectable: false };
                        root.add(bMesh);
                    }
                }
            }
        }

        // ── Posts (repeated vertical cylinders) ───────────────────────────────────
        const postRadius = 0.02;
        const postHeight = handrail.height;
        const postMat = new THREE.MeshStandardMaterial({ color: '#333333' });
        const postGeo = !instancingActive
            ? new THREE.CylinderGeometry(postRadius, postRadius, postHeight)
            : null;

        const emitPost = (lx: number, suffix: string): void => {
            const lyCentre = postHeight / 2;
            if (instancingActive) {
                const instId = `${handrail.id}#post-${suffix}`;
                this._instanceBridge!.register(
                    instId,
                    handrail.levelId,
                    'Handrail',
                    {
                        centre: toWorld(lx, lyCentre, 0),
                        rotationY: -angle, // cylinder is Y-symmetric; -angle kept for exactness
                        // CylinderGeometry default radial diameter = 2·radius along X/Z.
                        size: { x: postRadius * 2, y: postHeight, z: postRadius * 2 },
                    },
                    postMat,
                    'cylinder',
                );
                registeredIds.push(instId);
            } else {
                const post = new THREE.Mesh(postGeo!, postMat);
                post.position.set(lx, lyCentre, 0);
                post.userData = { role: 'geometry', selectable: false };
                root.add(post);
            }
        };

        // Two end posts.
        emitPost(0, 'start');
        emitPost(length, 'end');

        // Intermediate posts.
        const spacing = handrail.postSpacing ?? 0;
        if (spacing > 0 && length > spacing) {
            const count = Math.floor(length / spacing) - 1;
            for (let i = 1; i <= count; i++) {
                emitPost(i * spacing, `mid-${i}`);
            }
        }

        if (registeredIds.length > 0) {
            this._instanceIds.set(handrail.id, registeredIds);
        }
    }
}
