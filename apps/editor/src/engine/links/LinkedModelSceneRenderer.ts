/**
 * LinkedModelSceneRenderer — draws LINKED MODELS into the host scene (ADR-0346).
 *
 * ── ONE DRAW CALL PER LINK ───────────────────────────────────────────────────
 *
 * Every band of a link is an INSTANCE of one shared unit-box geometry inside one
 * `THREE.InstancedMesh` with one material. So a linked 5-storey building adds ONE
 * mesh and ONE draw call, not five and not the source project's mesh count. That
 * is the construction `LevelMassingRenderer` already uses for the host's own level
 * massing (`packages/core-app-model/src/rendering/LevelMassingRenderer.ts:282`),
 * and reusing the construction rather than the class keeps the two independent —
 * `LevelMassingRenderer` is driven by `LevelScoped3DCullingService` and hijacking
 * it would give one object two owners.
 *
 * The cost claim is pinned by `linkMassingCost()` in `linkMassing.ts`, which a
 * test asserts. It is arithmetic, not a browser reading — deliberately, because
 * L-2502 measured that the draw-call figure this repo quotes on WebGPU
 * (`info.render.calls`) is cumulative-since-start rather than per-frame.
 *
 * ── IT MUST LOOK BORROWED ────────────────────────────────────────────────────
 *
 * The entire point of a linked model is that it is NOT yours. A link that renders
 * like owned geometry is a trap: you would dimension to it, try to edit it, and
 * wonder why nothing happens. So it renders as a translucent PRYZM-violet volume
 * (#6600FF family) — present enough to coordinate against, obviously not authored
 * here. Brand rule: white + purple, never black.
 *
 * ── IT MUST NOT BE SELECTABLE, AT BOTH DOORS ─────────────────────────────────
 *
 * Four independent opt-outs, because there are four independent pick paths and no
 * single registry (C82 §1.2's "both doors or neither", applied to picking):
 *
 *   1. `userData.underlayActive = true` — the flag `SelectionManager`'s selectable
 *      cache already honours (`packages/input-host/src/SelectionManager.ts:3835`),
 *      alongside `ViewRangeZoneApplicator` and `initUI`. This is the mechanism
 *      `UnderlayRenderService` uses for read-only geometry; it is reused, not
 *      re-invented.
 *   2. No `userData.selectable`, and an `elementType` of `link:<id>` which is not
 *      a semantic type — so the cache's positive test never matches either.
 *   3. `raycast = () => {}` on every object — closes the BVH path, which calls
 *      `raycaster.intersectObject` directly (`packages/picking/src/bvh-pick.ts:196`).
 *   4. `layers.set(EDITOR_LAYER)` — `SelectionManager`'s raycaster is pinned to
 *      `BIM_LAYER` (`SelectionManager.ts:1209`), so an editor-layer object is
 *      never raycast at all.
 *
 * There is no fifth door to close at the command level, because there is nothing
 * to resolve: the linked elements are in no store, so a command naming one finds
 * nothing, exactly as it would for a deleted element (ADR-0346 D8).
 *
 * ── AND IT MUST NOT LOOK LIKE A BIM ELEMENT TO THE ISOLATION AUDIT ───────────
 *
 * The subtree carries NO `userData.id`, NO `userData.elementId`, NO `userData.type`,
 * and NO `isCoalesced`/`coalescedKey`. That is not an oversight and not an evasion:
 *
 *   · `ProjectIsolationAudit.sceneElementId` reads `ud.elementId ?? ud.id` and
 *     `sceneElementType` reads `ud.elementType ?? ud.type`
 *     (`ProjectIsolationAudit.ts:271-279`). Stamping either would make the link
 *     trip `scene.foreignElement` on every mesh — and the audit would be RIGHT to,
 *     because those keys MEAN "a BIM element of this project".
 *   · `coalescedLevelId` keys on `isCoalesced` + `coalescedKey`
 *     (`:516-522`); a link's bands name the SOURCE project's levels, which are
 *     legitimately absent from this project's expectation.
 *
 * Instead the subtree carries the disjoint `pryzmLink*` key space, and the audit
 * gained a `scene.linkedModel` arm that reads it (C13 §3.13 / §7.4). The audit
 * therefore GAINS coverage here and loses none: nothing in
 * `isExemptSceneSingleton` was touched.
 *
 * `userData.elementType = 'link:<linkId>'` IS stamped — on the mesh only — because
 * `pryzmPerfConsole`'s scene census buckets by that key
 * (`apps/editor/src/engine/pryzmPerfConsole.ts:352-422`), which is what makes a
 * link's cost measurable per link in `window.pryzmPerf.report()` instead of
 * landing in `(unattributed)`. It is not paired with an `id`, so it cannot form
 * the (id + type) pair the element arm requires.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { safeDisposeObject3D } from '@pryzm/renderer-three';
import { EDITOR_LAYER } from '@pryzm/scene-committer';
import type { LinkedModelRef } from '@pryzm/schemas';
import type { LinkMassingResult } from './linkMassing';
import { noteLinkMounted, noteLinkUnmounted, clearMountedLink } from './linkedModelScope';

/** PRYZM violet — the one brand accent (`styles/tokens.ts` `--app-accent`). */
const LINK_VIOLET = 0x6600ff;

/** Translucent enough to see your own model through, solid enough to read as mass. */
const LINK_OPACITY = 0.22;

/** Edge lines sit at full brand violet so the silhouette reads at any opacity. */
const LINK_EDGE_OPACITY = 0.55;

/** One live link's scene presence. */
interface MountedLink {
    readonly group: THREE.Group;
    readonly bandCount: number;
}

export class LinkedModelSceneRenderer {
    private readonly scene: THREE.Scene;
    private readonly mounted = new Map<string, MountedLink>();
    private disposed = false;

    /**
     * ONE unit box shared by every band of every link. Created lazily so a session
     * that never links anything allocates no GPU state at all.
     */
    private unitBox: THREE.BoxGeometry | null = null;
    private bodyMaterial: THREE.MeshStandardMaterial | null = null;
    private edgeMaterial: THREE.LineBasicMaterial | null = null;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
    }

    /**
     * Draw (or redraw) one link. Idempotent: an existing mount for the same link is
     * detached first, so a re-anchor or a display-mode change cannot strand a subtree.
     *
     * `display: 'hidden'` mounts NOTHING — not an invisible subtree. A hidden link
     * costs zero draw calls and zero GPU memory, which is the honest reading of
     * "hidden" and is why hiding is a real performance answer, not a cosmetic one.
     */
    mountLink(ref: LinkedModelRef, massing: LinkMassingResult): void {
        if (this.disposed) return;

        // Always tear the old one down first — `clearMountedLink` is idempotent and
        // detaches through the SAME owner the C13 teardown uses, so there is one
        // detach path rather than two that can disagree.
        this.unmountLink(ref.id);

        if (ref.display === 'hidden') return;
        if (massing.bands.length === 0) return;

        const group = this._buildMassingGroup(ref, massing);
        this.scene.add(group);
        this.mounted.set(ref.id, { group, bandCount: massing.bands.length });

        // Register with the C13 owner IMMEDIATELY after `scene.add`, exactly as
        // `ViewController._mountDrawing` does for `mountedDrawingScope`. Any gap
        // between the add and the registration is a window in which the scene holds
        // foreign geometry nobody owns.
        noteLinkMounted(ref.id, ref.sourceProjectId, () => this._detach(ref.id), massing.bands.length);
    }

    /** Remove one link's subtree. Idempotent. */
    unmountLink(linkId: string): void {
        if (!this.mounted.has(linkId)) {
            // Still tell the scope, in case it holds a record this renderer does not
            // (a hot reload, or a mount that failed after `noteLinkMounted`).
            noteLinkUnmounted(linkId);
            return;
        }
        clearMountedLink(linkId);   // → this._detach via the registered closure
    }

    /** Remove every link's subtree. Used on renderer disposal. */
    unmountAll(): void {
        for (const id of [...this.mounted.keys()]) this.unmountLink(id);
    }

    /** How many links are drawn right now. Diagnostics + tests. */
    get mountedCount(): number { return this.mounted.size; }

    /**
     * The detach half, called BY the scope owner so there is exactly one teardown
     * route (C13 §3.10 — one named owner).
     *
     * §L-676-B — detach first, dispose second, drop the handle in `finally`, so a
     * throwing dispose can never leave a foreign subtree parented to the next
     * project's scene.
     */
    private _detach(linkId: string): void {
        const rec = this.mounted.get(linkId);
        if (rec === undefined) return;
        try {
            this.scene.remove(rec.group);
            // Shared geometry/materials are NOT disposed here — they are owned by this
            // renderer and outlive any single link. `safeDisposeObject3D`'s second
            // argument is `disposeMaterials`; passing false keeps the shared material
            // alive for the other links still on screen.
            safeDisposeObject3D(rec.group, false);
        } finally {
            this.mounted.delete(linkId);
        }
    }

    private _ensureSharedResources(): void {
        if (this.unitBox === null) {
            this.unitBox = new THREE.BoxGeometry(1, 1, 1);
        }
        if (this.bodyMaterial === null) {
            this.bodyMaterial = new THREE.MeshStandardMaterial({
                color: LINK_VIOLET,
                transparent: true,
                opacity: LINK_OPACITY,
                // Flat shading reads as MASSING rather than as a modelled surface —
                // the visual grammar `LevelMassingRenderer` already uses for the
                // host's own massing, so the two are legible as the same kind of thing.
                flatShading: true,
                // Never write depth: a translucent link must not occlude the user's
                // OWN geometry behind it. Owned work always stays readable.
                depthWrite: false,
                name: 'pryzm-linked-model-massing',
            });
        }
        if (this.edgeMaterial === null) {
            this.edgeMaterial = new THREE.LineBasicMaterial({
                color: LINK_VIOLET,
                transparent: true,
                opacity: LINK_EDGE_OPACITY,
                name: 'pryzm-linked-model-edges',
            });
        }
    }

    /**
     * Build the subtree: one `InstancedMesh` of N band boxes, plus one merged edge
     * `LineSegments` so the silhouette reads at low opacity.
     *
     * The band extents arrive in the SOURCE project's scene frame; the ref's anchor
     * places the whole group in the HOST frame. The `z = -north` flip lives HERE and
     * only here — `enuOffset()` returns east/north and this is the single site that
     * converts it, matching `createSiteOverlayUnderlay.ts:124-125`.
     */
    private _buildMassingGroup(ref: LinkedModelRef, massing: LinkMassingResult): THREE.Group {
        this._ensureSharedResources();

        const group = new THREE.Group();
        group.name = `pryzm-linked-model-${ref.id}`;

        const t = ref.anchor.transform;
        group.position.set(t.east, t.elevation, -t.north);
        group.rotation.y = t.rotationY;

        const bands = massing.bands;
        const mesh = new THREE.InstancedMesh(this.unitBox!, this.bodyMaterial!, bands.length);
        mesh.name = `pryzm-linked-model-massing-${ref.id}`;

        const m = new THREE.Matrix4();
        const centre = new THREE.Vector3();
        const size = new THREE.Vector3();
        const noRotation = new THREE.Quaternion();

        // Edge positions for all bands, in ONE buffer → one extra draw call, not N.
        const edgePositions: number[] = [];

        for (let i = 0; i < bands.length; i++) {
            const b = bands[i]!;
            const sx = b.maxX - b.minX;
            const sz = b.maxZ - b.minZ;
            centre.set((b.minX + b.maxX) / 2, b.baseY + b.height / 2, (b.minZ + b.maxZ) / 2);
            size.set(sx, b.height, sz);
            m.compose(centre, noRotation, size);
            mesh.setMatrixAt(i, m);
            pushBoxEdges(edgePositions, b.minX, b.maxX, b.baseY, b.baseY + b.height, b.minZ, b.maxZ);
        }
        mesh.instanceMatrix.needsUpdate = true;

        // A linked model is reference geometry: it must not cast or receive shadows.
        // `InstanceGroup` defaults BOTH to true (`InstanceGroup.ts:87-88`), which would
        // silently re-inflate the shadow-caster budget the massing default exists to
        // protect. `LevelMassingRenderer.ts:287-288` disables both for the same reason.
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.frustumCulled = false;

        this._stampNonSelectable(mesh, ref, /* isRoot */ false);
        group.add(mesh);

        if (edgePositions.length > 0) {
            const edgeGeom = new THREE.BufferGeometry();
            edgeGeom.setAttribute(
                'position',
                new THREE.BufferAttribute(new Float32Array(edgePositions), 3),
            );
            const edges = new THREE.LineSegments(edgeGeom, this.edgeMaterial!);
            edges.name = `pryzm-linked-model-edges-${ref.id}`;
            edges.frustumCulled = false;
            this._stampNonSelectable(edges, ref, /* isRoot */ false);
            group.add(edges);
        }

        // ROOT stamp — §C13-LINKED-MODEL-ARM reads `pryzmLinkId` at the ROOT only
        // (C13 §7.4 rule 3), so this is the object the audit attributes.
        this._stampNonSelectable(group, ref, /* isRoot */ true);
        return group;
    }

    /**
     * The four picking opt-outs plus the C13 §3.13 tags, in one place so a new
     * object type in this subtree cannot accidentally be born selectable.
     *
     * ⛔ Do NOT add `id`, `elementId`, `type`, `isCoalesced` or `coalescedKey` here.
     *    Each of those is a key `ProjectIsolationAudit` reads as "a BIM element of
     *    this project", and stamping one would make the link a false positive on an
     *    arm that is working correctly. See this file's header.
     */
    private _stampNonSelectable(obj: THREE.Object3D, ref: LinkedModelRef, isRoot: boolean): void {
        obj.userData = {
            ...obj.userData,
            // C13 §3.13 attribution.
            pryzmLinkId: ref.id,
            pryzmLinkSourceProjectId: ref.sourceProjectId,
            pryzmLinkHostProjectId: ref.hostProjectId,
            // The already-honoured read-only marker (`SelectionManager.ts:3835`).
            underlayActive: true,
            // Cost attribution for `window.pryzmPerf.report()`. Never paired with an
            // `id`, so it cannot form the (id + type) pair the element arm requires.
            elementType: `link:${ref.id}`,
            // Documentation, not enforcement — `pickable:false` is stamped across this
            // codebase and read by no predicate. Recorded so nobody relies on it.
            pickable: false,
            isLinkedModelRoot: isRoot,
        };
        obj.raycast = () => { /* linked models are never raycast — see the header */ };
        obj.layers.set(EDITOR_LAYER);
    }

    /** Idempotent teardown of the renderer itself, including the shared GPU state. */
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.unmountAll();
        try {
            this.unitBox?.dispose();
            this.bodyMaterial?.dispose();
            this.edgeMaterial?.dispose();
        } catch (e) {
            console.warn('[LinkedModelSceneRenderer] shared-resource dispose threw (non-fatal):', e);
        } finally {
            this.unitBox = null;
            this.bodyMaterial = null;
            this.edgeMaterial = null;
        }
    }
}

/**
 * Append the 12 edges of an axis-aligned box as 24 line-segment vertices.
 *
 * Written out rather than derived from `EdgesGeometry` because that would build one
 * geometry per band — N geometries and N draw calls, which is the cost this whole
 * module exists to avoid.
 */
function pushBoxEdges(
    out: number[],
    x0: number, x1: number,
    y0: number, y1: number,
    z0: number, z1: number,
): void {
    const c: ReadonlyArray<readonly [number, number, number]> = [
        [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
        [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
    ];
    const pairs: ReadonlyArray<readonly [number, number]> = [
        [0, 1], [1, 2], [2, 3], [3, 0],   // base ring
        [4, 5], [5, 6], [6, 7], [7, 4],   // top ring
        [0, 4], [1, 5], [2, 6], [3, 7],   // verticals
    ];
    for (const [a, b] of pairs) {
        out.push(c[a]![0], c[a]![1], c[a]![2]);
        out.push(c[b]![0], c[b]![1], c[b]![2]);
    }
}
