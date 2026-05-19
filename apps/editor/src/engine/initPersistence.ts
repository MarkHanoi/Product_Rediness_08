/**
 * initPersistence — Phase F-1 subsystem initializer.
 *
 * Creates the ProjectSerializer/ProjectLoader delegates and initialises
 * PlatformShell with the concrete save/load adapters.
 *
 * Extracted from EngineBootstrap.ts (Phase F-1).
 * Corresponds to lines 3636–3733 of the original monolithic bootstrap.
 *
 * ─── D.4.2 OWNERSHIP POINTER (2026-04-30 night, Wave 2 Day-7 STATUS) ────────
 * The L0 typed contract + OTel span (`pryzm.bootstrap.persistence`) + soft-fail
 * wrapper for this subsystem now live at:
 *
 *     packages/persistence-client/src/bootstrap.ts → bootstrapPersistence()
 *
 * That file is the SCALABLE composition root for the persistence half (mirrors
 * `packages/renderer/src/SceneBootstrap.ts` for the scene half — D.4.1 Day-2).
 * Future composeRuntime callers reach this body via lazy DI (the Day-8 work
 * deletes workspace bridge (D.4) from `composeRuntime.ts` + `buildPersistence.ts`
 * and routes through `bootstrapPersistence({ loadEnginePersistence })`).
 *
 * The 261 LOC body BELOW remains here at the engine layer until Wave 4
 * factors out the L4-L7 deps (BimManager, PlatformShell, ProjectSerializer,
 * ProjectLoader, SyncStateEngine).  Same gating as `initScene.ts` per the
 * `04-PLAN-FORWARD/03-WAVE-2-3-D4-EXECUTION.md` Day-2 + Day-4 STATUS rows.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Contracts:
 *   §09-DATABASE-PERSISTENCE-ARCHITECTURE — localStorage first, then server.
 *   §06 §1 FIX — PlatformShell must not import ProjectSerializer/ProjectLoader.
 *     Concrete adapters are created here (engine-layer) and injected via delegates.
 *   §01-BIM-ENGINE-CORE-CONTRACT §9 — engine-layer only; never imported by UI.
 */

import type * as OBC from '@thatopen/components';
import { syncStateEngine }         from '@pryzm/core-app-model';
import { ProjectSerializer }       from './persistence/ProjectSerializer';
import type { ProjectStores }      from './persistence/ProjectSerializer';
import { ProjectLoader }           from './persistence/ProjectLoader';
import { PlatformShell }           from '@app/ui/platform/PlatformShell';
import type {
    IProjectSaveDelegate,
    IProjectLoadDelegate,
    IProjectSnapshot,
} from '@pryzm/core-app-model';
import type { BimManager }         from '@pryzm/core-app-model';
import type { ToolManager }        from '@pryzm/input-host';

export interface PersistenceResult {
    platformShell: PlatformShell;
}

/**
 * Initialise project persistence (save/load delegates) and the PlatformShell.
 *
 * Must be called after ToolManager is available (toolManager.commandManager
 * needed for ProjectLoader) and after all element stores have been created.
 */
export function initPersistence(params: {
    world:        OBC.World;
    bimManager:   BimManager;
    toolManager:  ToolManager;
    unselectAll:  () => void;
    stores:       ProjectStores;
    /** Wave 17 (2026-05-02) — direct runtime param replaces window.__pryzm2RuntimeComposed stash.
     *  Optional for backward compat with pre-Wave-17 call sites (pre-D.4 isolated tests). */
    runtime?:     import('@pryzm/runtime-composer/types').PryzmRuntime | null;
}): PersistenceResult {
    const { world, bimManager, toolManager, unselectAll, stores } = params;

    // ── Save delegate ─────────────────────────────────────────────────────────
    // §06 §1 FIX: PlatformShell no longer imports ProjectSerializer/ProjectLoader.
    // Concrete adapters are created here (engine-layer) and injected via delegates.
    const saveDelegate: IProjectSaveDelegate = {
        serialize: (options) =>
            ProjectSerializer.serialize(stores, bimManager, options) as unknown as IProjectSnapshot,
        stringify: (snapshot) =>
            ProjectSerializer.stringify(snapshot as any),
        parse: (text) =>
            ProjectSerializer.parse(text) as unknown as IProjectSnapshot,

        /**
         * Project-hub improvement D — captures a WebP thumbnail from the main scene renderer.
         *
         * Bugs fixed:
         *
         * Bug 1 — Thumbnail too large for localStorage:
         *   Full-viewport toDataURL (e.g. 1920×1080 @ WebP 0.72) produces 100–500 KB.
         *   Stored raw in bim-projects-index, 3–5 projects can push the JSON over the
         *   5 MB localStorage limit → setItem silently throws → thumbnail write fails.
         *   Fix: resize to at most 400×225 px before encoding (~5–20 KB per thumbnail).
         *
         * Bug 2 — OBC PostproductionRenderer lacks preserveDrawingBuffer:
         *   OBC creates its WebGL context without preserveDrawingBuffer:true, so the
         *   drawing buffer is cleared after each frame swap.
         *   Fix: call world.renderer.update() synchronously, then fall back to a direct
         *   THREE.js render(scene, camera) call to guarantee the buffer is populated.
         *
         * Bug 3 — Blank detection sampled only the top-left 8×8 pixels:
         *   OBC creates its WebGL context with alpha:true, so background pixels have
         *   alpha=0. The 3D model is typically centred in the viewport, so corner pixels
         *   are transparent background. The old check (totalAlpha===0) treated any
         *   all-transparent corner as a blank frame and discarded valid thumbnails.
         *   Fix: sample a 32×32 patch from the CENTRE of the canvas. Also check all
         *   RGBA channels (not just alpha) so geometry that renders with premultiplied
         *   alpha=0 is still detected.
         */
        captureThumbnail(): string | null {
            try {
                // Phase 4/5 (WebGPU active): pryzmCanvas is the visible output.
                // OBC's WebGL canvas (world.renderer.three.domElement) is locked to
                // MANUAL mode and idle — reading from it yields a blank image.
                // Prefer pryzmCanvas when it exists; fall back to the OBC canvas for
                // Phase 1-3 (WebGL-only) environments.
                const pryzmCanvas = window.pryzmCanvas as HTMLCanvasElement | undefined;
                const src: HTMLCanvasElement | null | undefined =
                    pryzmCanvas ?? world.renderer?.three?.domElement;

                if (!src) {
                    console.warn('[captureThumbnail] No renderer canvas available — skipping');
                    return null;
                }

                // Bug 2 fix: force a render so the drawing buffer is populated.
                //
                // WebGPU mode (pryzmCanvas exists): The UnifiedFrameLoop drives the
                // WebGPU pipeline via requestAnimationFrame. When captureThumbnail is
                // called synchronously during autosave (which fires right after project
                // load), the rAF loop may not have rendered the new scene yet — the
                // pryzmCanvas still shows whatever it had before load (or blank on first
                // open). Fix: force one synchronous render via RenderPipelineManager
                // before reading the canvas. This is safe because RPM.render() only
                // touches the pryzmCanvas/WebGPU pipeline, never OBC's WebGL renderer.
                //
                // WebGL-only mode (no pryzmCanvas): Call OBC's update() to populate
                // the WebGL drawing buffer. Never call this in WebGPU mode — it would
                // trigger OBC's WebGLShadowMap.render(), destroying PRYZM's
                // ShadowDepthTexture and causing 500× GPU validation errors.
                if (pryzmCanvas) {
                    try {
                        const rpm = window.renderPipelineManager;
                        if (rpm) rpm.render();
                    } catch { /* best-effort */ }
                } else if (world.renderer) {
                    try {
                        (world.renderer as any).needsUpdate = true;
                        (world.renderer as any).update?.();
                    } catch { /* best-effort */ }
                }

                const srcW = src.width  || 0;
                const srcH = src.height || 0;
                if (!srcW || !srcH) {
                    console.warn('[captureThumbnail] Canvas has zero dimensions — skipping');
                    return null;
                }

                // Bug 1 fix: scale down to at most 400×225, preserving aspect ratio.
                const MAX_W = 400;
                const MAX_H = 225;
                const scale = Math.min(1, MAX_W / srcW, MAX_H / srcH);
                const dstW  = Math.max(1, Math.round(srcW * scale));
                const dstH  = Math.max(1, Math.round(srcH * scale));

                const thumb = document.createElement('canvas');
                thumb.width  = dstW;
                thumb.height = dstH;
                const ctx = thumb.getContext('2d');
                if (!ctx) {
                    console.warn('[captureThumbnail] Could not get 2D context — skipping');
                    return null;
                }

                ctx.drawImage(src, 0, 0, dstW, dstH);

                // Bug 3 fix: sample a 32×32 patch from the CENTRE of the canvas.
                // Background pixels have alpha=0 (OBC uses alpha:true WebGL context),
                // so geometry is typically only in the centre, not the corners.
                // Check all RGBA channels (not just alpha) for robustness against
                // premultiplied-alpha rendering where geometry may have alpha=0 but
                // non-zero RGB values.
                const sampleW = Math.min(32, dstW);
                const sampleH = Math.min(32, dstH);
                const sampleX = Math.max(0, Math.floor((dstW - sampleW) / 2));
                const sampleY = Math.max(0, Math.floor((dstH - sampleH) / 2));
                const { data } = ctx.getImageData(sampleX, sampleY, sampleW, sampleH);
                let totalSignal = 0;
                for (let i = 0; i < data.length; i++) totalSignal += data[i];
                if (totalSignal === 0) {
                    console.warn('[captureThumbnail] Captured blank/transparent frame — skipping (WebGL buffer may have been cleared)');
                    return null;
                }

                const dataUrl = thumb.toDataURL('image/webp', 0.72);
                console.log(`[captureThumbnail] Thumbnail captured: ${dstW}×${dstH}px, ~${Math.round(dataUrl.length / 1024)}KB`);
                return dataUrl;
            } catch (err) {
                console.error('[captureThumbnail] Unexpected error:', err);
                return null;
            }
        },

        /**
         * Flow 7 architectural fix (2026-04-30) — cheap O(stores) read used by
         * the Save modal to render the "X elements · Y walls · Z slabs · W
         * furniture" info line.  Reads `store.getAll().length` directly — does
         * NOT walk geometry, deepStrip, structuredClone, or build a snapshot.
         *
         * Contract: see PlatformShellTypes.IProjectSaveDelegate.getElementCounts.
         */
        getElementCounts() {
            const walls      = stores.wallStore.getAll().length;
            const slabs      = stores.slabStore.getAll().length;
            const furniture  = stores.furnitureStore.getAll().length;
            const total      =
                walls + slabs + furniture
                + stores.columnStore.getAll().length
                + stores.stairStore.getAll().length
                + stores.beamStore.getAll().length
                + stores.curtainWallStore.getAll().length
                + stores.roofStore.getAll().length
                + stores.handrailStore.getAll().length
                + stores.plumbingStore.getAll().length
                + (stores.roomStore?.getAll().length ?? 0)
                + (stores.ceilingStore?.getAll().length ?? 0)
                + (stores.floorStore?.getAll().length ?? 0);
            return { total, walls, slabs, furniture };
        },
    };

    // ── Load delegate ─────────────────────────────────────────────────────────
    // §5.2 — Cancellable async scene loading.
    // Holds the cancel function for the currently in-flight load.
    // When the user switches projects before the current load completes,
    // the PlatformShell calls load() again — which immediately sets the
    // previous load's cancelled flag to true, preventing stale state hydration.
    let _cancelCurrentLoad: (() => void) | null = null;

    const loadDelegate: IProjectLoadDelegate = {
        load: (snapshot) => {
            // Cancel any in-flight load from a previous project switch
            _cancelCurrentLoad?.();

            // Detach all gizmos and clear selection BEFORE the scene is rebuilt.
            // If a wall was selected when the project was last closed, the
            // WallTransformController proxy is still attached to TransformControls.
            // The scene clear that follows removes the proxy from the scene graph
            // without going through the normal deselect path, leaving TC pointing
            // at an orphaned object → "must be part of scene graph" on every render
            // frame → frozen/unresponsive scene. Calling unselectAll() first ensures
            // WallTransformController.deactivate() → TC.detach() is always invoked.
            unselectAll();

            let cancelled  = false;
            _cancelCurrentLoad = () => { cancelled = true; };

            // §R-8: Pause topology observer during hydration so wall load events
            // do not trigger redundant room re-detection before rooms are restored.
            window.roomTopologyObserver?.pause();

            // ── Data Platform Phase 6 §6.2: Pause SyncStateEngine during load ──
            // Prevents incomplete-state recomputes while stores are being hydrated.
            syncStateEngine.pause();

            const loader = new ProjectLoader(toolManager.commandManager);
            const result = loader.load(snapshot as any, () => cancelled);

            // Resume after load (synchronous — ProjectLoader.load is sync)
            window.roomTopologyObserver?.resume();

            // ── Data Platform Phase 6 §6.5: Resume SyncStateEngine after load ──
            // Flushes any pending recomputes accumulated during load hydration.
            syncStateEngine.resume();

            return result;
        },
    };

    // ── PlatformShell ─────────────────────────────────────────────────────────
    // Phase D.1 (S77-WIRE) — detect an early-created shell from bootPlatform().
    // If one exists, inject the real save/load delegates and reuse it.
    // This completes the chicken-and-egg break: the shell was constructed
    // before the engine with deferred stubs; the real adapters land here.
    //
    // Phase A.5 fallback: when no early shell exists (pre-D.1 boot path or
    // isolated tests), create a new PlatformShell as before.
    // Wave 17 (2026-05-02): direct param replaces window.__pryzm2RuntimeComposed stash.
    // Pre-Wave-17 call sites that don't pass runtime fall back to null (pre-D.4 boot path).
    const composedRuntime = params.runtime ?? null;

    const existingShell = window.platformShell as PlatformShell | undefined;

    let platformShell: PlatformShell;
    if (existingShell && typeof existingShell.injectDelegates === 'function') {
        // D.1 path: early shell from bootPlatform() — inject the real adapters.
        existingShell.injectDelegates(saveDelegate, loadDelegate);
        platformShell = existingShell;
        console.log('[initPersistence] D.1 — real delegates injected into early PlatformShell');
    } else {
        // Pre-D.1 / isolated-test fallback: create a new shell.
        platformShell = new PlatformShell(saveDelegate, loadDelegate, composedRuntime);
        window.platformShell = platformShell;
        console.log(
            '[initPersistence] PlatformShell initialized',
            composedRuntime !== null ? '(with composed runtime)' : '(legacy boot)',
        );
    }

    // Wave 7 (2026-05-01) — register the hydrator on runtime.stores so the
    // typed `runtime.stores.hydrate(snapshot)` leg is available for future
    // openProject() callers.  `loadDelegate.load()` is now captured here
    // (post-engine-boot) rather than being proxied through the deleted
    // workspace bridge (D.4).  Callers that already invoke setProjectContext()
    // directly (e.g. PlatformShell itself) are unaffected — this registration
    // purely enables the named typed leg for tooling / devtools / tests.
    if (composedRuntime !== null) {
        composedRuntime.stores.registerHydrator((snapshot: unknown) => void loadDelegate.load(snapshot as Parameters<typeof loadDelegate.load>[0]));
        console.log('[initPersistence] runtime.stores hydrator registered');
    }

    return { platformShell };
}
