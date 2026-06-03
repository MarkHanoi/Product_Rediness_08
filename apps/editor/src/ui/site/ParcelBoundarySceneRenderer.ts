// A.8.x (IP-A2) — render the committed parcel boundary as an in-scene ground
// outline.
//
// WHY THIS EXISTS
// ---------------
// The GIS boundary-draw tool (A.8.c) projects the drawn lat/lon ring → scene-XZ
// and commits it to the C19 SiteModelStore via `site.setParcelBoundary`
// (siteDispatch.ts → `site.parcel-boundary-set`). Until now that polygon lived
// ONLY in the store: after authoring a plot the user saw nothing on the ground.
// The founder asked for the boundary to STAY visible as site context — a subtle
// footprint distinct from generated walls.
//
// WHAT IT DRAWS
// -------------
// A closed violet (#6600FF, the unified PRYZM preview colour — see
// preview-color-unified-pryzm-purple) `LineLoop` along the parcel vertices at
// y ≈ 0 (slight +y offset to avoid z-fighting with the ground grid), plus a very
// faint translucent fill so the lot reads as a footprint. It uses the SAME
// scene-XZ projection the apartment generator consumes (it reads the polygon
// straight from `runtime.siteModelStore.getParcelBoundary()` — already in
// scene-XZ metres, NOT lat/lon — so the outline aligns with generated walls).
//
// P2 (single THREE owner) — HOW WE STAY COMPLIANT
// -----------------------------------------------
// `THREE` is imported from the `@pryzm/renderer-three/three` re-export facade,
// NOT bare `'three'`. The P2 tripwire (`tools/ga-gate/check-three-imports.ts`
// §15-17) explicitly allows the `@pryzm/renderer-three/three` sub-path as a
// "P2-compliant path through the owner" — 67 editor files already use it. We
// add NO new THREE primitive to renderer-three; the LineLoop / mesh are built
// from the namespace the owner re-exports.
//
// NON-PICKABLE OVERLAY MECHANISM (reused, not invented)
// -----------------------------------------------------
// The outline group is placed on `EDITOR_LAYER` (scene-committer SceneLayers
// §14/§67) — the SAME mechanism the OBC SimpleGrid + tool-preview ghosts use.
// The SelectionManager raycaster targets only `BIM_LAYER` (0), so the boundary
// is rendered by the camera (which enables all layers) but is never selectable
// or intercepted by modelling tools. We also set `raycast = () => {}` on the
// objects as belt-and-braces.
//
// LIFECYCLE + PROJECT-SCOPING
// ---------------------------
// - Created once per engine init (`initScene`), subscribes to
//   `runtime.events.on('site.parcel-boundary-set')` and redraws.
// - `refresh()` reads the current store snapshot and rebuilds, so it is also
//   called once at init (project-load with a pre-existing boundary) and after a
//   project switch.
// - Registered with `projectScopeRegistry` so the C13 project-switch reset
//   (alongside the stores) clears the outline — a Project A parcel never lingers
//   into Project B. `dispose()` is idempotent and frees geometry/material.

import * as THREE from '@pryzm/renderer-three/three';
import { EDITOR_LAYER } from '@pryzm/scene-committer';
import { projectScopeRegistry } from '@pryzm/core-app-model';
import type { PryzmRuntime } from '@pryzm/runtime-composer';

/** The unified PRYZM preview / site-context violet. */
const PRYZM_VIOLET = 0x6600ff;

/** Slight +y lift (metres) so the outline never z-fights the ground grid. */
const GROUND_Y_OFFSET = 0.02;

/** A 2D point on the scene ground plane (metres). Matches C19 `Pt`. */
interface XZPoint {
    readonly x: number;
    readonly z: number;
}

/**
 * Draws (and keeps in sync) the committed C19 parcel boundary as a subtle
 * ground outline. One instance per engine session; wired from `initScene`.
 */
export class ParcelBoundarySceneRenderer {
    private readonly scene: THREE.Scene;
    private readonly runtime: PryzmRuntime;

    /** The live overlay group (line loop + faint fill), or null when none. */
    private group: THREE.Group | null = null;

    private readonly disposers: Array<() => void> = [];
    private disposed = false;

    constructor(scene: THREE.Scene, runtime: PryzmRuntime) {
        this.scene = scene;
        this.runtime = runtime;

        // Redraw whenever a boundary is committed (one-shot per C19 §1.4, but a
        // project switch + re-author can fire it again on a fresh Site).
        const sub = runtime.events.on('site.parcel-boundary-set', () => {
            this.refresh();
        });
        // `EventSubscription` is callable as its own unsubscribe.
        this.disposers.push(() => sub());

        // Project-switch reset — clear the outline alongside the stores so a
        // Project A parcel never renders against Project B (C19 §1.13).
        projectScopeRegistry.register({
            scopeName: 'parcelBoundaryOutline',
            clear: () => this.clear(),
        });

        // Initial paint — covers project-load when a boundary already exists.
        this.refresh();
    }

    /**
     * Read the current parcel polygon from the SiteModelStore and rebuild the
     * outline. No-op (and clears any stale outline) when there is no boundary
     * or the polygon is degenerate (< 3 vertices).
     */
    refresh(): void {
        if (this.disposed) return;

        const store = this.runtime.siteModelStore;
        const boundary = store?.getParcelBoundary?.() ?? null;
        const polygon = (boundary?.polygon ?? []) as XZPoint[];

        // Guard — no boundary or degenerate ring ⇒ no outline.
        if (polygon.length < 3) {
            this.clear();
            return;
        }

        this.clear();
        this.group = this.buildOutline(polygon);
        this.scene.add(this.group);
    }

    /** Remove + dispose the current outline group (idempotent). */
    private clear(): void {
        if (!this.group) return;
        this.scene.remove(this.group);
        this.disposeGroup(this.group);
        this.group = null;
    }

    /**
     * Build the overlay group: a closed violet LineLoop along the vertices plus
     * a faint translucent fill, both on EDITOR_LAYER + non-pickable.
     */
    private buildOutline(polygon: XZPoint[]): THREE.Group {
        const group = new THREE.Group();
        group.name = 'pryzm-parcel-boundary-outline';

        // ── Closed violet line ───────────────────────────────────────────────
        // §LINELOOP-WEBGPU-FIX (2026-06-03): THREE.LineLoop is NOT supported by the
        // WebGPU renderer — it spammed "Objects of type THREE.LineLoop are not
        // supported" errors EVERY frame (A.8.x regression). Use THREE.Line and close
        // the ring explicitly by repeating the first vertex at the end.
        const ringLen = polygon.length + 1;
        const positions = new Float32Array(ringLen * 3);
        for (let i = 0; i < polygon.length; i++) {
            const p = polygon[i]!;
            positions[i * 3 + 0] = p.x;
            positions[i * 3 + 1] = GROUND_Y_OFFSET;
            positions[i * 3 + 2] = p.z;
        }
        const first = polygon[0]!;
        positions[polygon.length * 3 + 0] = first.x;
        positions[polygon.length * 3 + 1] = GROUND_Y_OFFSET;
        positions[polygon.length * 3 + 2] = first.z;
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const lineMat = new THREE.LineBasicMaterial({
            color: PRYZM_VIOLET,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
        });
        const loop = new THREE.Line(lineGeo, lineMat);
        loop.name = 'pryzm-parcel-boundary-loop';
        group.add(loop);

        // ── Faint translucent fill ───────────────────────────────────────────
        // Triangulate the ring via ShapeGeometry (the parcel polygon is simple).
        const fillMesh = this.buildFill(polygon);
        if (fillMesh) group.add(fillMesh);

        // EDITOR_LAYER + non-pickable for the whole group.
        group.traverse((obj) => {
            obj.layers.set(EDITOR_LAYER);
            // Belt-and-braces: even if a raycaster enables EDITOR_LAYER, these
            // objects never report an intersection.
            (obj as unknown as { raycast: () => void }).raycast = () => {};
            obj.renderOrder = 0;
        });

        return group;
    }

    /**
     * Faint flat fill so the lot reads as a footprint. Uses a Shape triangulated
     * by THREE.ShapeGeometry (handles convex + simple-concave parcels) laid flat
     * on the XZ plane at the ground offset. Returns null if triangulation fails.
     */
    private buildFill(polygon: XZPoint[]): THREE.Mesh | null {
        try {
            const shape = new THREE.Shape();
            // Build the 2D shape in (x, -z): ShapeGeometry lives in XY, we rotate
            // it onto XZ below, mapping shape-Y → scene-(-Z) so winding is kept.
            shape.moveTo(polygon[0]!.x, -polygon[0]!.z);
            for (let i = 1; i < polygon.length; i++) {
                shape.lineTo(polygon[i]!.x, -polygon[i]!.z);
            }
            shape.closePath();

            const geo = new THREE.ShapeGeometry(shape);
            // Rotate the XY shape flat onto the XZ ground plane (+X stays, the
            // shape's +Y maps to scene -Z), then lift to the ground offset.
            geo.rotateX(Math.PI / 2);
            geo.translate(0, GROUND_Y_OFFSET, 0);

            const mat = new THREE.MeshBasicMaterial({
                color: PRYZM_VIOLET,
                transparent: true,
                opacity: 0.06,
                depthWrite: false,
                side: THREE.DoubleSide,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.name = 'pryzm-parcel-boundary-fill';
            return mesh;
        } catch (e) {
            console.warn('[ParcelBoundarySceneRenderer] fill triangulation failed:', e);
            return null;
        }
    }

    /** Dispose every geometry + material under a group. */
    private disposeGroup(group: THREE.Group): void {
        group.traverse((obj) => {
            const withGeo = obj as { geometry?: { dispose?: () => void } };
            withGeo.geometry?.dispose?.();
            const withMat = obj as { material?: { dispose?: () => void } | Array<{ dispose?: () => void }> };
            const mat = withMat.material;
            if (Array.isArray(mat)) mat.forEach((m) => m?.dispose?.());
            else mat?.dispose?.();
        });
    }

    /** Idempotent teardown — removes the outline + releases subscriptions. */
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.clear();
        for (const d of this.disposers) {
            try {
                d();
            } catch (e) {
                console.warn('[ParcelBoundarySceneRenderer] disposer threw:', e);
            }
        }
        this.disposers.length = 0;
    }
}

/**
 * Wire the parcel-boundary outline into the live scene. Called once from
 * `initScene` after the world + runtime are ready. No-ops (and warns soft) when
 * the scene or runtime is missing so a half-initialised engine never throws.
 *
 * @returns the renderer instance (for HMR disposal) or null if preconditions
 *          were unmet.
 */
export function initParcelBoundarySceneRenderer(
    scene: THREE.Scene | null | undefined,
    runtime: PryzmRuntime | null | undefined,
): ParcelBoundarySceneRenderer | null {
    if (!scene) {
        console.warn('[ParcelBoundarySceneRenderer] no scene — skipping boundary overlay.');
        return null;
    }
    if (!runtime) {
        console.warn('[ParcelBoundarySceneRenderer] no runtime — skipping boundary overlay.');
        return null;
    }
    return new ParcelBoundarySceneRenderer(scene, runtime);
}
