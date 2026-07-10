import * as OBC from '@thatopen/components';
import * as OBCF from '@thatopen/components-front';
import * as THREE from '@pryzm/renderer-three/three';
import { SceneTheme } from './SceneTheme';
import { InfiniteGrid3D } from './InfiniteGrid3D';
import { perfTraceOn, perfLog } from './rendering/perfTrace';
import { getFrameScheduler } from '@pryzm/frame-scheduler';

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

    // §FIX-SHADOWMAP-DUAL-RENDERER-CLAIM (L-205) — MUST stay false.
    //
    // `world.renderer` is the OBC PostproductionRenderer: a **WebGLRenderer**. PRYZM's LIVE
    // renderer is a separate WebGPURenderer (`window.pryzmRenderer`). Both draw the SAME scene,
    // so both see the SAME Pascal key light — and a THREE light has exactly ONE `shadow.map` slot.
    //
    // With `shadowMap.enabled = true`, `WebGLShadowMap.render()` runs every frame (it iterates
    // casting lights; it does NOT consult OBC's `scene.shadowsEnabled` policy below) and
    // ALLOCATES `keyLight.shadow.map` as a `WebGLRenderTarget`. The WebGPU renderer then finds
    // `shadow.map` already non-null, never creates or writes its own ShadowDepthTexture, and
    // `ShadowNode` compare-samples a texture WebGPU never rendered into. Every fragment reads
    // "occluded" ⇒ the L0 `ShadowMaterial` catcher paints a solid grey rectangle covering exactly
    // the shadow camera's footprint, and no sun shadow is projected. Swapping backend appeared to
    // "fix" it only because a fresh GPUDevice allocated a fresh map.
    //
    // `ViewController._restore3DRendererPresentation()` already sets this to false on every
    // 3D-view restore, with a comment naming this exact hazard ("OBC's WebGLShadowMap.render()
    // writes a new WebGLRenderTarget over the WebGPU depth handle"). It was never joined up with
    // this line, so between boot and the first view restore the WebGL renderer claimed the slot.
    //
    // Disabling it costs nothing: OBC never renders shadows (`scene.shadowsEnabled = false`
    // below), and PRYZM's WebGPU pipeline owns the shadow pass end-to-end. See C04 §SHADOW.
    world.renderer.three.shadowMap.enabled = false;

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

    // ── §WEBGL2-VIEW-UNSTICK (2026-07-01) — harden OBC's self-driving rAF loop ──
    //
    // OBC's `Components.update` (dist/index.mjs) is an arrow property that runs
    // its OWN requestAnimationFrame loop, started by `components.init()`. Each
    // frame it iterates every registered component and calls `component.update`,
    // and ONLY re-arms `requestAnimationFrame(this.update)` at the END. This loop
    // is what ticks `world.camera.controls.update(delta)` every frame (which in
    // turn fires the 'update'/'rest' camera events that wake PRYZM's
    // frame-scheduler via beginMotion). It is INDEPENDENT of PRYZM's scheduler.
    //
    // ROOT CAUSE of the "3D view stuck — cannot rotate/move the camera" symptom
    // seen when opening an old project: if ANY component's `update(delta)` throws
    // (e.g. a renderer/builder touching a half-restored element after a load with
    // failures), the exception escapes OBC's `update()` BEFORE the re-arm line is
    // reached → the rAF loop dies → camera-controls stop being ticked → the
    // camera freezes AND no more 'update' events fire → PRYZM's scheduler parks.
    // A single throwing component permanently freezes the entire viewport.
    //
    // Fix: wrap `components.update` so a throw is caught and the rAF loop is
    // ALWAYS re-armed. The original `update` reads `this.update` (now this
    // wrapper) when it re-arms on a clean frame, so the guard stays installed
    // across frames; on a throwing frame we re-arm here. One bad frame logs once
    // and is skipped — the camera keeps moving on the next frame instead of
    // freezing forever. No span: pure defensive wrapper around an existing loop.
    try {
        const raf: (cb: FrameRequestCallback) => number =
            typeof requestAnimationFrame === 'function'
                ? requestAnimationFrame
                : ((cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number);
        const originalUpdate = (components as unknown as { update: () => void }).update;
        if (typeof originalUpdate === 'function') {
            let loggedLoopError = false;
            // §PERF-L02-FRAME — sampled OBC component-update cost (gated). This is
            // the OBC half of the per-frame split; UnifiedFrameLoop times the PASCAL
            // submit half. Sampled 1-in-30 frames, only during camera motion AND
            // when globalThis.__pryzmPerfTrace === true, so production pays a single
            // boolean read per OBC frame. See rendering/perfTrace.ts.
            let __perfFrame = 0;
            const guardedUpdate = (): void => {
                const _perfSample = perfTraceOn()
                    && (++__perfFrame % 30 === 0)
                    && getFrameScheduler().isInMotion();
                const _t0 = _perfSample ? performance.now() : 0;
                try {
                    originalUpdate();
                    if (_perfSample) {
                        perfLog(
                            '§PERF-L02-FRAME',
                            `obcComponentsUpdateMs=${(performance.now() - _t0).toFixed(2)} frame=${__perfFrame}`,
                        );
                    }
                } catch (err) {
                    if (!loggedLoopError) {
                        loggedLoopError = true; // log once — never spam every frame
                        console.error(
                            '[BimWorld] §WEBGL2-VIEW-UNSTICK — an OBC component update() threw; ' +
                            'the frame loop was re-armed so the camera stays live. First error:',
                            err,
                        );
                    }
                    // Re-arm the loop the failed frame never reached.
                    raf(guardedUpdate);
                }
            };
            (components as unknown as { update: () => void }).update = guardedUpdate;
        }
    } catch (wrapErr) {
        console.warn('[BimWorld] §WEBGL2-VIEW-UNSTICK — could not install OBC update guard (non-fatal):', wrapErr);
    }

    // ── Camera Anti-Clip: Constraints — minDistance, maxDistance, polar angles ──
    // Contract: docs/02-decisions/contracts/10-CAMERA-ZOOM-CONSTRAINTS-CONTRACT.md
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
        // §C-B3 / §C-B4 (DAILY-USE-AUDIT) — the previous values (maxDist=100m,
        // maxPolar=π/2−0.1) inherited "Pascal demo parity" but were unworkable
        // for real BIM: a single 80m office building couldn't be framed from
        // a comfortable aerial view, and the polar clamp blocked true eye-level
        // elevations + looking up at soffits/ceilings (industry standard in
        // Revit/SketchUp/Blender). New values: 0.2m–10000m dolly range covers
        // both inside-room navigation and master-plan-scale sites; polar 0..π
        // with tiny epsilons allows full orbit (including below-horizon and
        // near-zenith) without gimbal flip.
        const CAM_MIN_DIST = 0.2;    // metres — close enough to inspect a doorknob
        const CAM_MAX_DIST = 10000;  // metres — site-scale + comfortable aerial
        const CAM_MIN_POLAR = 0.02;          // a hair below zenith
        const CAM_MAX_POLAR = Math.PI - 0.02; // a hair above nadir (full below-horizon)

        const reapplyConstraints = () => {
            const c = world.camera.controls;
            // infinityDolly=true (OBC default) lets the camera dolly through surfaces
            // even when minDistance is set. Disabling it makes minDistance actually work.
            c.infinityDolly = false;
            c.minDistance   = CAM_MIN_DIST;
            c.maxDistance   = CAM_MAX_DIST;
            c.minPolarAngle = CAM_MIN_POLAR;
            c.maxPolarAngle = CAM_MAX_POLAR;
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

        console.log(`[BimWorld] Camera constraints armed: minDist=${CAM_MIN_DIST} m, maxDist=${CAM_MAX_DIST} m, polarRange=[${CAM_MIN_POLAR.toFixed(2)},${CAM_MAX_POLAR.toFixed(2)}], infinityDolly=false, mode-patch active. §C-B3/§C-B4 audit fix.`);
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
