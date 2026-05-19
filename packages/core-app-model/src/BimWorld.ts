import * as OBC from '@thatopen/components';
import * as OBCF from '@thatopen/components-front';
import * as THREE from '@pryzm/renderer-three/three';
import { SceneTheme } from './SceneTheme';
import { InfiniteGrid3D } from './InfiniteGrid3D';

export function createBimWorld(container: HTMLElement) {
    const components = new OBC.Components();
    const worlds = components.get(OBC.Worlds);

    const world = worlds.create<
        OBC.ShadowedScene,
        OBC.OrthoPerspectiveCamera,
        OBCF.PostproductionRenderer
    >();
    world.name = 'main';

    const viewport = document.createElement('bim-viewport');
    viewport.style.pointerEvents = 'auto';
    container.appendChild(viewport);

    world.renderer = new OBCF.PostproductionRenderer(components, viewport);
    world.renderer.three.autoClear = false;

    world.camera = new OBC.OrthoPerspectiveCamera(components);

    // ── Camera Anti-Clip: Constraint 3 — Near Plane ─────────────────────────
    // Pascal viewer-camera.tsx: near={0.1}
    // OBC default is typically 0.5–1 m which clips objects within 1 m of the
    // camera. 0.1 m (10 cm) matches real-world metric BIM inspection distances.
    // Must be set BEFORE components.init() triggers the first render.
    {
        const perspCam = world.camera.three as THREE.PerspectiveCamera;
        if (perspCam.isPerspectiveCamera) {
            perspCam.near = 0.1;
            perspCam.updateProjectionMatrix();
        }
    }

    world.renderer.three.shadowMap.enabled = true;
    // Doc 22 fix: PCFSoftShadowMap is deprecated in Three.js WebGPU/modern builds.
    // On first shadow render, Three.js mutates the type to PCFShadowMap internally
    // and emits a warning. This mutation can trigger shadow render target recreation
    // mid-frame, contributing to the "Destroyed texture [ShadowDepthTexture]" error.
    // Using PCFShadowMap directly prevents the mutation and eliminates this cascade.
    world.renderer.three.shadowMap.type = THREE.PCFShadowMap;

    const sceneComponent = new OBC.ShadowedScene(components);
    world.scene = sceneComponent;

    sceneComponent.setup({
        shadows: {
            cascade: 3,
            resolution: 2048,
        },
    });

    // ── Shadow state contradiction — DOCUMENTED, NOT A BUG ─────────────────
    //
    // 3D-VIEW-AUDIT-2026 §F16 calls out the apparent contradiction between
    // the lines above and the line below.  The two flags configure DIFFERENT
    // layers of the shadow pipeline; both settings are correct as written.
    //
    //  ┌───────────────────────────────────────────────────────────────────┐
    //  │ Layer           │ Flag                          │ Value │ Owner    │
    //  ├─────────────────┼───────────────────────────────┼───────┼──────────┤
    //  │ GPU resources   │ renderer.shadowMap.enabled    │ true  │ Three.js │
    //  │ GPU shadow type │ renderer.shadowMap.type       │ PCF   │ Three.js │
    //  │ Cascade config  │ ShadowedScene.setup{cascade}  │ 3     │ OBC      │
    //  │ Scene policy    │ scene.shadowsEnabled          │ FALSE │ OBC      │
    //  └───────────────────────────────────────────────────────────────────┘
    //
    //   • `renderer.shadowMap.enabled = true`  reserves the GPU shadow-map
    //     texture allocation (3 cascades × 2048² × 4 B = ~50 MB).  Setting it
    //     to false would prevent OBC from EVER turning shadows on at runtime,
    //     because the texture would not exist.
    //
    //   • `scene.shadowsEnabled = false`  is OBC's per-scene render policy
    //     and is the user-visible "shadows off by default" setting.  The sun
    //     panel toggles THIS flag (not the renderer flag) when the user
    //     enables/disables shadows.
    //
    // Net effect: the GPU is ready to render shadows on demand, and OBC
    // chooses not to render them until the user opts in.  Setting either
    // flag to its opposite would break the runtime toggle.
    //
    // The proper long-term fix (a `ShadowAuthority` service that owns both
    // flags behind a single `shadowsEnabled` property) is tracked under
    // 3D-VIEW-AUDIT §F16 → SPRINT R2.
    world.scene.shadowsEnabled = false;
    // Apply scene background — sets CSS, THREE.Color, and clear color
    SceneTheme.applyBackground(world, viewport);

    // 🔥 CRITICAL: Ensure scene starts clean for manual matrix control later
    world.scene.three.matrixAutoUpdate = true;
    world.scene.three.position.set(0, 0, 0);
    world.scene.three.rotation.set(0, 0, 0, 'XYZ');
    world.scene.three.scale.set(1, 1, 1);
    world.scene.three.updateMatrix();
    world.scene.three.updateMatrixWorld(true);

    const grids = components.get(OBC.Grids);
    const grid = grids.create(world);
    // Use theme-compliant grid color for the light background
    SceneTheme.applyGridColor(grid);

    world.scene.three.add(grid.three);
    world.scene.distanceRenderer.excludedObjects.add(grid.three);

    // ── Custom infinite-grid shader plane ────────────────────────────────
    // A single PlaneGeometry with a fragment-shader cell + section grid
    // that fades with distance. Sits at the active level's elevation and
    // shares the user-facing "Grid" toggle with the 2D plan view so the
    // two views stay in sync. See src/core/InfiniteGrid3D.ts for the
    // visual contract (cell every 1 m, section every 10 m, fade 30→120 m).
    const infiniteGrid = new InfiniteGrid3D();
    infiniteGrid.setVisible(false); // GridToggleService owns the on/off state
    world.scene.three.add(infiniteGrid.mesh);
    world.scene.distanceRenderer.excludedObjects.add(infiniteGrid.mesh);

    // Hide the OBC infinite grid — the custom InfiniteGrid3D supersedes it
    // and matches the 2D plan grid 1-to-1.  We keep the OBC `grid` instance
    // around because GridToggleService and ViewController already reference
    // it; setting `visible=false` here makes it a no-op visually while leaving
    // the toggle wiring untouched.
    grid.three.visible = false;

    // Pascal-matched lighting setup (viewer/lights.tsx):
    //   Ambient intensity 0.5 in light mode (was 0.8).
    //   Two fill directionals that soften shadow-side faces.
    //   OBC ShadowedScene.config.directionalLight is the shadow-casting key light
    //   (controlled via sun panel) — no duplicate shadow caster added here.
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    world.scene.three.add(ambientLight);

    // Fill 1 — back-left fill (Pascal: position [-10, 10, -10], intensity 0.75)
    const fillLight1 = new THREE.DirectionalLight(0xffffff, 0.75);
    fillLight1.position.set(-10, 10, -10);
    fillLight1.name = 'pryzm-fill-1';
    world.scene.three.add(fillLight1);

    // Fill 2 — back-right fill (Pascal: position [-10, 10, 10], intensity 1.0)
    const fillLight2 = new THREE.DirectionalLight(0xffffff, 1.0);
    fillLight2.position.set(-10, 10, 10);
    fillLight2.name = 'pryzm-fill-2';
    world.scene.three.add(fillLight2);

    components.init();

    // ── Camera Anti-Clip: Constraints — minDistance, maxDistance, polar angles ──
    // Contract: docs/00_Contracts/10-CAMERA-ZOOM-CONSTRAINTS-CONTRACT.md
    //
    // Exact Pascal parity — matches custom-camera-controls.tsx props 1-to-1:
    //   minDistance={10}           → 10 m
    //   maxDistance={100}          → 100 m  (hard cap, not dynamic)
    //   maxPolarAngle={π/2 − 0.1} → π/2 − 0.1  (≈84.3°)
    //   minPolarAngle={0}          → 0  (top-down view allowed)
    //
    // ⚠️  ROOT CAUSE FIX: OBC's OrbitMode.activateOrbitControls() hard-codes
    //   controls.minDistance = 1 and controls.maxDistance = 300 on every
    //   navigation mode switch (Orbit ↔ FirstPerson ↔ Plan). The initial
    //   setupControls() also sets controls.infinityDolly = true, which lets the
    //   camera dolly past minDistance entirely when dollyToCursor is active.
    //
    //   Fix: (a) disable infinityDolly, (b) patch world.camera.set() to
    //   re-enforce our constraints after every OBC mode switch, (c) expose
    //   _reapplyCameraConstraints so EngineBootstrap can call it after any
    //   camera position animation settles.
    {
        const CAM_MIN_DIST = 1;    // metres — zoom-in guard
        const CAM_MAX_DIST = 100;  // metres — exact Pascal maxDistance={100} hard cap

        const reapplyConstraints = () => {
            const c = world.camera.controls;
            // infinityDolly=true (OBC default) lets the camera dolly through surfaces
            // even when minDistance is set. Disabling it makes minDistance actually work.
            c.infinityDolly = false;
            c.minDistance   = CAM_MIN_DIST;
            c.maxDistance   = CAM_MAX_DIST;
            c.minPolarAngle = 0;
            c.maxPolarAngle = Math.PI / 2 - 0.1;
        };

        // Apply once immediately after init
        reapplyConstraints();

        // Patch world.camera.set() so our constraints survive every OBC mode switch.
        // OrbitMode.activateOrbitControls() runs synchronously inside set(), so
        // calling reapplyConstraints() right after is sufficient.
        const _origCameraSet = world.camera.set.bind(world.camera);
        (world.camera as any).set = function(mode: string) {
            _origCameraSet(mode);
            reapplyConstraints();
            console.log(`[Camera] Constraints re-applied after OBC mode → ${mode} (minDist=${world.camera.controls.minDistance} maxDist=${world.camera.controls.maxDistance.toFixed(1)} infinityDolly=${world.camera.controls.infinityDolly})`);
        };

        // Expose so EngineBootstrap can call it after camera animation settles
        (world as any)._reapplyCameraConstraints = reapplyConstraints;

        console.log('[BimWorld] Camera constraints armed: minDist=1 m, maxDist=100 m, maxPolarAngle=π/2−0.1, infinityDolly=false, mode-patch active.');
    }

    // ── Camera Anti-Clip: Projection Change Listener ─────────────────────────
    // When OBC switches projection, it resets camera near/far internally.
    // Re-apply the correct near/far each time the projection changes so
    // orthographic plan/section views never get clipping artefacts.
    world.camera.projection.onChanged.add(() => {
        const cam = world.camera.three;
        if (cam instanceof THREE.OrthographicCamera) {
            // Orthographic: exact Pascal viewer-camera.tsx near={-1000} far={1000}
            cam.near = -1000;
            cam.far  =  1000;
            cam.updateProjectionMatrix();
        } else if ((cam as THREE.PerspectiveCamera).isPerspectiveCamera) {
            (cam as THREE.PerspectiveCamera).near = 0.1;
            cam.updateProjectionMatrix();
        }
    });

    // ✅ EXPOSE FOR DEBUGGING
    window.world = world;
    window.threeScene = world.scene.three;
    window.threeCamera = world.camera.three;
    // FIX 1: Also expose components so ViewPropertiesPanel.updateCutFillStyle()
    // can reach OBC.Clipper via `window.components`.
    window.components = components;

    console.log("🌍 WORLD EXPOSED TO WINDOW", world);

    // §WALL-AUDIT-2026-C1 (move-restore) — guard message corrected.
    //
    // The previous wording ("Attempted write to readonly userData.type detected")
    // was misleading: this scan only detects the *presence* of a frozen
    // descriptor, not an actual write attempt.  A non-writable descriptor on
    // userData.type is the *correct* state for any element built through
    // WallFragmentBuilder / DoorFragmentBuilder / WindowFragmentBuilder — see
    // CONTRACT 03 §1.5 (identity triple is locked once, never re-asserted).
    //
    // The genuinely dangerous scenario (a strict-mode TypeError thrown while
    // assigning to that frozen descriptor) is caught by the V8 runtime itself,
    // not by this passive scan.  This dev-only sweep is therefore demoted to a
    // structural audit: it logs the *count* of locked groups so we can confirm
    // the lock-once invariant is in force, without flooding the console with
    // false-positive "attempted write" noise on every pointerdown.
    // 3D-VIEW-AUDIT-2026 §F35 — install dev-only identity-lock audit through a
    // disposable wrapper.  The previous inline implementation:
    //   (1) NEVER removed the `pointerdown` listener, so HMR-driven re-execution
    //       of createBimWorld() accumulated handlers indefinitely (each holding
    //       its own `world` reference).  After 5 hot-reloads, a single click
    //       traversed the entire scene 6 times.
    //   (2) Ran a synchronous `scene.traverse` on the click hot-path — 5–15 ms
    //       on a 50 k-element IFC scene.  Pascal-style benchmarks were polluted
    //       by this.
    //   (3) Ran on EVERY pointerdown — most clicks reveal nothing new.
    //
    // The replacement (a) returns a disposer the consumer can call, (b) throttles
    // to one audit per 5 s, (c) defers the traversal to `requestIdleCallback` so
    // the click hot-path is freed up, and (d) is exposed on `world` so HMR teardown
    // (or a future EngineContext.shutdown()) can call it.
    const disposeIdentityAudit =
        process.env.NODE_ENV === 'development'
            ? installIdentityLockAudit(world)
            : () => {};
    (world as any)._disposeIdentityLockAudit = disposeIdentityAudit;

    return { components, world, grid, infiniteGrid };
}

/**
 * 3D-VIEW-AUDIT-2026 §F35 — extracted dev-only identity-lock audit.
 *
 * Counts scene objects whose `userData.type` descriptor is non-writable
 * (CONTRACT 03 §1.5 — locked by WallFragmentBuilder / DoorFragmentBuilder /
 * WindowFragmentBuilder).  Logs only when the count changes, throttles to
 * one audit every 5 s, and defers the scene traversal to `requestIdleCallback`
 * so the click hot-path is not blocked.
 *
 * Returns a disposer that removes the listener.
 */
function installIdentityLockAudit(world: { scene: { three: THREE.Object3D } }): () => void {
    const THROTTLE_MS = 5_000;
    let lastLoggedCount = -1;
    let lastRunAt       = 0;

    const ric: (cb: () => void) => void =
        (typeof window !== 'undefined' && window.requestIdleCallback)
            ? (cb) => window.requestIdleCallback(cb, { timeout: 250 })
            : (cb) => setTimeout(cb, 0);

    const handler = () => {
        const now = performance.now();
        if (now - lastRunAt < THROTTLE_MS) return;
        lastRunAt = now;
        ric(() => {
            const scene = world.scene.three;
            let lockedCount = 0;
            scene.traverse(obj => {
                if (
                    obj.userData &&
                    Object.getOwnPropertyDescriptor(obj.userData, 'type')?.writable === false
                ) {
                    lockedCount++;
                }
            });
            if (lockedCount !== lastLoggedCount) {
                console.debug(
                    `[IDENTITY-LOCK AUDIT] ${lockedCount} scene object(s) carry a frozen userData.type descriptor (expected for walls/doors/windows).`
                );
                lastLoggedCount = lockedCount;
            }
        });
    };

    window.addEventListener('pointerdown', handler, { passive: true });
    return () => window.removeEventListener('pointerdown', handler);
}
