/**
 * main.ts — Platform entry point.
 *
 * Responsibilities (in order of execution):
 *   1. Start the platform shell (landing page, auth, project hub).
 *   2. Begin prefetching the heavy BIM engine bundle in the background.
 *   3. When the user opens a project, resolve the engine module and run bootstrap().
 *
 * Contract compliance:
 *   §06 §9  — Only platform-layer imports here. The engine bundle (Three.js,
 *             @thatopen, web-ifc, Cesium, …) is deferred via dynamic import.
 *   §01 §1.1 — bootstrap() is called exclusively through PlatformRouter.start().
 */

import { getFrameScheduler } from '@pryzm/frame-scheduler';
import { PlatformRouter } from '@app/ui/platform/PlatformRouter';
// Phase B.4 (S73-WIRE) — panelManager import for post-compose runtime wiring.
import { panelManager } from '@app/ui/PanelManager';
// §H11 (audit) — wire the crash reporter's global handlers. Previously dead
// code: every uncaught error / unhandled rejection in the browser was
// silently swallowed (only ViewportCrashGuard caught render-keyword-filtered
// errors). installGlobalHandlers() funnels uncaught errors + rejections into
// the lazy CrashReporter so telemetry actually sees them.
import { installGlobalHandlers } from '@pryzm/crash-reporter';
// O.14 (perf/boot) — shared engine-module warm promise.  This module does ONLY a
// dynamic `import('@app/engine/engineLauncher')` internally, so this static
// import adds no engine bytes to the platform critical-path chunk.  `loadEngine()`
// delegates to `warmEngineModule()` so the onboarding pre-warm and the real boot
// reuse a SINGLE chunk download (see the comment on `loadEngine`).
import { warmEngineModule } from '@app/engine/engineWarmup';

// ── PRYZM 1 SUNSET FLAG (S61 D1, additive) ────────────────────────────────────
// `?pryzm1=1` is the *opt-in* test route for the upcoming D5 default flip.
// Per `docs/architecture/adr/0031-s61-staged-legacy-deletion.md`:
//   • D1 (this commit): the URL flag is parsed and stashed on `window`
//     for the banner module to consume below; default behaviour is
//     UNCHANGED (PRYZM 1 boots without the flag).
//   • D5 (later this sprint): the polarity flips — un-flagged URLs go
//     to `apps/editor/src/main.ts`; only `?pryzm1=1` lands here.
// The banner painter is dynamically imported so this file gains zero
// new bytes on the cold-boot critical path until the flag fires.
const __pryzm1SunsetOptIn =
    new URLSearchParams(location.search).get('pryzm1') === '1';
if (__pryzm1SunsetOptIn) {
    void import('../apps/editor/src/sunset/Pryzm1SunsetBanner').then(({ paintSunsetBanner }) => {
        paintSunsetBanner({ mode: 'banner' });
    }).catch(err => {
        // Loud-fail-soft: banner failure must not block PRYZM 1 boot.
        console.error('[pryzm1-sunset] banner painter failed:', err);
    });
}

// ── PHASE D.2 (S77-WIRE) — KILL-SWITCH DELETED ───────────────────────────────
// The `?pryzm2=1` opt-in kill-switch (bootHub / bootProject / bootPryzm2 /
// mountMinimumChrome, ~370 LOC) has been removed.  Phase D.1 broke the
// PlatformShell → EngineBootstrap chicken-and-egg (early shell + deferred
// delegates + injectDelegates), so the white-UI path now works without
// the dark-editor scaffold.  Only `bootPlatform()` remains.
// See: PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md §16.4 D.2.


// ── PRYZM PERFORMANCE PROBES ──────────────────────────────────────────────────
// Phase 5a (§18.4 hotfix) — these probes (longtask observer + per-second FPS
// log + the `__PRYZM_PERF_ENABLED` global) are dev-only diagnostic overhead.
// Each [LONGTASK] / [FPS] line cost main-thread time on the very frames they
// were trying to measure, and they fired hundreds of warnings per minute in
// production builds (visible in the browser console of every deployed user).
// Gated to:
//   • `import.meta.env.DEV` — local `npm run dev` always sees them.
//   • `?perf=1` (or any `?perf` query string) — production override for
//     temporary measurement on a deployed build without a code change.
// Production normal-load: zero observers, zero rAF callbacks, zero console
// noise, freeing up the main thread for the actual application.
const __perfEnabled =
    import.meta.env.DEV ||
    new URLSearchParams(location.search).has('perf');

window.__PRYZM_PERF_ENABLED = __perfEnabled;

if (__perfEnabled) {
    // ── LONGTASK observer — C10 §2 observability ──────────────────────────
    // Logs every browser long-task (> 50 ms) with duration, start offset,
    // and attribution container so the source can be identified without a
    // full Performance panel recording.
    // Attribution: the `longtask` PerformanceEntry carries an `attribution`
    // array of TaskAttributionTiming objects.  For main-frame tasks the
    // most useful field is `containerName` (or `containerSrc` for iframes).
    // We also emit a `performance.mark` so each LONGTASK appears as a
    // labelled marker on the DevTools Performance timeline.
    const __perfObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
            // `attribution` is defined in the Long Tasks spec but typed as
            // `PerformanceEntryList` on the base interface — cast to access it.
            const attrs = (entry as PerformanceEntry & {
                attribution?: Array<{ containerType?: string; containerName?: string; containerSrc?: string }>;
            }).attribution;
            const attrParts: string[] = [];
            if (attrs && attrs.length > 0) {
                const a = attrs[0];
                if (a.containerType && a.containerType !== 'window') {
                    attrParts.push(`type=${a.containerType}`);
                }
                if (a.containerSrc) attrParts.push(`src=${a.containerSrc}`);
                if (a.containerName) attrParts.push(`name=${a.containerName}`);
            }
            const attrStr = attrParts.length > 0 ? ` [${attrParts.join(' ')}]` : '';
            console.warn(
                `[LONGTASK] duration=${entry.duration.toFixed(1)}ms ` +
                `start=${entry.startTime.toFixed(1)}ms${attrStr}`
            );
            // DevTools Performance timeline marker — appears as a named
            // vertical line so long tasks are visible alongside
            // pryzm:bootstrap:* measures without requiring a full profile.
            try {
                performance.mark(
                    `pryzm:longtask:${entry.startTime.toFixed(0)}ms`,
                    { startTime: entry.startTime + entry.duration },
                );
            } catch { /* mark() may throw if startTime > performance.now() on buffered replay */ }
        }
    });
    __perfObserver.observe({ type: 'longtask', buffered: true });

    let __frameCount = 0;
    let __lastFpsLog = performance.now();
    // D.7.5 batch #5: FPS probe driven by FrameScheduler instead of raw rAF.
    // The scheduler invokes the callback once per browser frame, so the
    // counter measures effective frames-per-second of the unified loop —
    // which is the meaningful metric for renderer/scheduler perf debugging.
    getFrameScheduler().addTickListener('main-fps-probe', () => {
        __frameCount++;
        const now = performance.now();
        if (now - __lastFpsLog >= 1000) {
            console.log(`[FPS] ${__frameCount}fps`);
            __frameCount = 0;
            __lastFpsLog = now;
        }
    }, 'overlay');
}

// ── Engine module loader ──────────────────────────────────────────────────────
// S86-WIRE (Wave 7, 2026-04-30 evening): redirected from `./engine/EngineBootstrap`
// (now a ≤35 LOC type-alias shim) to `./engine/engineLauncher` (the full
// orchestration body).  Boolean #5 (`EngineBootstrap_LOC == 0`) closes here.
//
// A single cached promise so the module is downloaded at most once per session.
// Repeated calls (e.g. user re-opens a project) resolve from the browser cache.
//
// Next (S87-WIRE): once all ~122 comment-only "EngineBootstrap" references are
// batch-rewritten and src/engine/EngineBootstrap.ts is deleted, this will also
// redirect; src/engine/ folder is then deleted entirely (Boolean #1 advances).

type EngineModule = typeof import('@app/engine/engineLauncher');

// O.14 (perf/boot) — the engine MODULE download is now shared with the
// onboarding pre-warm.  `warmEngineModule()` holds a single cached promise: the
// onboarding flow calls `ensureEngineWarm()` (which delegates to the same
// promise) as soon as the RAC/brief/location/draw steps begin, so the 2.6 MB
// chunk downloads + evaluates DURING the conversation.  By the time the user hits
// "Generate" and `ensure()` → `loadEngine()` runs, the module resolves from the
// shared cache instead of starting a cold download — the "Downloading BIM
// engine…" overlay stage is short.  Both paths share ONE download; on rejection
// the shared cache is cleared so the next call retries cold (unchanged
// semantics).  See `apps/editor/src/engine/engineWarmup.ts`.
function loadEngine(): Promise<EngineModule> {
    return warmEngineModule();
}

// ── Engine initialiser callback ───────────────────────────────────────────────
// Called when the user clicks "Open Project" (via workspaceMount.ensure()).
// _bootstrapped guards against re-running bootstrap() on subsequent project
// opens — the engine and its panels are singletons; only project context changes.
//
// S86-WIRE: `loadEngine()` now resolves engineLauncher (not EngineBootstrap).
// The `bootstrap()` export is identical — no call-site change needed here.

let _bootstrapped = false;

async function startEngine(runtime: import('@pryzm/runtime-composer').PryzmRuntime | null = null): Promise<void> {
    const mod = await loadEngine();
    if (!_bootstrapped) {
        // §H12 (audit) — set _bootstrapped = true ONLY after bootstrap() resolves.
        // Previously the flag latched true before `await mod.bootstrap(runtime)`,
        // so a bootstrap rejection (e.g. an initXxx throw) left a permanently
        // half-initialised engine: the toolbar existed but the scene didn't,
        // and retrying "Open Project" never re-ran bootstrap because the flag
        // said it had already succeeded. Now a failed bootstrap remains
        // retryable from the user's next action.
        try {
            // Pass the composed PryzmRuntime through to `bootstrap()` so initUI
            // can route toasts via `runtime.toasts.show(...)`.
            await mod.bootstrap(runtime);
            _bootstrapped = true;
        } catch (err) {
            console.error('[main] bootstrap() failed — engine NOT marked bootstrapped, retry possible:', err);
            throw err;
        }
    }
    // Project context is updated by workspaceMount.show() via
    // window.platformShell.setProjectContext() after this function returns.
}

// ── Startup ───────────────────────────────────────────────────────────────────
// Phase D.1/D.2 (S77-WIRE) — single composition root.
//
// `composeRuntime()` builds the L1 stores + L2 bus + 13 plugin handlers +
// view-registry (data half), constructs the cross-cutting singletons, and
// returns a typed `PryzmRuntime` handle.  After the runtime is ready:
//
//   • Phase D.1: an early PlatformShell is created with deferred save/load
//     stubs.  `initPersistence.ts` replaces the stubs with real adapters
//     once the engine boots (via `injectDelegates()`).  This breaks the
//     PlatformShell → EngineBootstrap chicken-and-egg.
//
//   • The workspace bridge (D.4) (`workspaceMount`) still bridges
//     `runtime.persistence.openProject(id)` to the legacy EngineBootstrap +
//     PlatformShell.setProjectContext pair.  DELETE in D.4.
async function bootPlatform(): Promise<void> {
    const { composeRuntime } = await import('@pryzm/runtime-composer');
    // Phase A.6 close (2026-04-29) — the AppToast DOM helper now lives
    // in `@pryzm/runtime-composer/showAppToast` and is the default
    // backing of `runtime.toasts.show(...)`; no injection needed.
    const clientId =
        globalThis.crypto?.randomUUID?.() ??
        `client-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    // PHASE-BRIDGE per §16.3 C.3.01 + §16.4 D.1/D.2/D.4 — DELETE in S77 D.4.
    //
    //   • `ensure()` lazy-boots EngineBootstrap.  `startEngine` is idempotent.
    //   • `show()` calls window.platformShell.setProjectContext() — the early
    //     shell (created below) satisfies this even before the engine boots.
    //
    // Phase A.6 close — `runtimeRef` is a forward-declared mutable holder
    // so `workspaceMount.ensure()` (built BEFORE `composeRuntime` runs)
    // can read the composed runtime and forward it to `startEngine`.
    const runtimeRef: { current: import('@pryzm/runtime-composer').PryzmRuntime | null } = { current: null };

    // ── BOOT-ORDER CORRECTION (Wave 1.5, 2026-04-30) ──────────────────────────
    // §01 §1.1 contract: "BIM engine init is deferred until user explicitly
    // opens a project."  Historically this clause was honored at the engine-
    // bundle level (legacy EngineBootstrap is a dynamic import behind
    // `loadEngine()`), but VIOLATED at the runtime-composition level: four
    // module-load singleton hand-offs (UiPreferences, gridDrawingHUD,
    // dataCommandCenter, syncStateDetailDrawer) and the 2,433 LOC
    // `PlatformShell` constructor all ran on the synchronous boot path BEFORE
    // PlatformRouter.start() got a chance to mount the landing DOM.  None of
    // those four singletons or the PlatformShell are touched by the landing,
    // auth modal, or project-hub flows; the earliest possible consumer is
    // `workspaceMount.show()` on the (much later) project-open click.
    //
    // Refactor: split `bootPlatform()` into two phases.  Phase A runs the
    // smallest set of awaits needed for `PlatformRouter.start(runtime)` to
    // mount the landing UI; Phase B (`_heavyWiringDone`) does the four
    // hand-offs + PlatformShell construction in the background.  The
    // workspace-mount bridge gates on `_heavyWiringDone` so a fast user click
    // cannot land before `window.platformShell` exists.  Records as Wave 1.5
    // in `03-CURRENT-STATE.md §10`; explicitly NOT a D.4 preemption (D.4 is
    // about splitting EngineBootstrap.ts, not main.ts ordering).
    let _heavyWiringDone: Promise<void> | null = null;

    const workspaceMount = {
        ensure: async (): Promise<void> => {
            // Wave 1.5: gate engine boot on the deferred PlatformShell + singleton
            // hand-offs. `initPersistence.ts` calls `injectDelegates()` on
            // `window.platformShell` once the engine boots; that must exist first.
            if (_heavyWiringDone !== null) await _heavyWiringDone;
            // Phase A.6 close — forward the composed runtime so initUI
            // can route toasts via `runtime.toasts.show(...)`.
            await startEngine(runtimeRef.current);
        },
        show: async (
            projectId: string,
            projectName: string,
            opts?: { isNewProject?: boolean },
        ): Promise<void> => {
            // Wave 1.5: same gate as ensure() — the runtime must be composed
            // and `_heavyWiringDone` must have attached the early PlatformShell
            // to `runtime.workspace.surface` (PR 4.A.4) before
            // `setProjectContext()` can be delegated.
            if (_heavyWiringDone !== null) await _heavyWiringDone;
            // PR 4.A.4 (Wave 4 Track A) — typed surface call REPLACES the
            // legacy `(window as unknown as { platformShell?: ... })
            // .platformShell.setProjectContext(...)` cast (the last
            // window.platformShell reach in this file's
            // critical project-open path).  `runtime.workspace.surface`
            // is the typed lifecycle handle introduced in
            // `04-PLAN-FORWARD/08-WAVE-4-SLOT-TYPING-ROUTING.md §2`
            // row 4.A.4; its `setProjectContext()` throws the typed
            // `WorkspaceSurfaceNotMountedError` when the early shell
            // attach (in `_heavyWiringDone`) has not yet completed.
            const runtime = runtimeRef.current;
            if (runtime === null) {
                throw new Error(
                    '[bootPlatform/workspaceMount.show] runtimeRef.current is null — composeRuntime() did not run.',
                );
            }
            // Flow 9 (S81 close-out): forward the `{ isNewProject }` hint
            // captured at the Hub-click site so `PlatformShell.setProjectContext`
            // takes the explicit-empty branch (PlatformShell.ts:289) and
            // skips the redundant `loadLatestVersionFromServer` round-trip
            // for a project we KNOW was just created.
            await runtime.workspace.surface.setProjectContext(projectId, projectName, opts);
        },
    };

    // F-launch.1 (S81 F.1.01) — gather every plugin's UI / toolbar
    // contributions before composing the runtime so the PluginHost
    // ships them in its boot-time bucket map (no register() calls
    // needed at first paint).  Imported via the dedicated subpath so
    // the deprecated `mountEditor` JSDoc in `apps/editor/src/main.ts`
    // is not pulled into the type-check graph (D.3 is removing it).
    const {
      gatherAllContributions,
      wireAllPluginSubscriptions,
      registerAllPluginToolActivators,
    } = await import('@pryzm/editor/plugin-registry');

    // C-6: bootstrapFn is now injected so @pryzm/runtime-composer has no
    // static dep on @pryzm/editor (headless constraint per C02 §5).
    const { bootstrapWithEverything } = await import('@pryzm/editor/bootstrap.everything');

    const runtime = await composeRuntime({
        audit: {
            actorId: 'platform-shell',
            projectId: 'platform-shell-bootstrap',
            clientId,
        },
        // No canvas in the white-UI boot path — `scene.renderer` slot stays
        // null until Phase D.3 consolidates the renderer mount.
        canvas: null,
        // D.4.2 Day-8: `workspaceMount` is no longer a `composeRuntime` opt.
        // We attach it post-compose below so the composition root contract
        // stays at "14 typed slots, no workspace bridge (D.4)" per
        // `02-ARCHITECTURE.md §3`.
        pluginContributions: gatherAllContributions(),
        bootstrapFn: bootstrapWithEverything,
    });

    // Phase A.6 close — populate the forward-declared holder so
    // `workspaceMount.ensure()` can pass the composed runtime through
    // to `startEngine` → `bootstrap(runtime)` → `initUI({runtime, …})`.
    runtimeRef.current = runtime;

    // Task 1.3 (C11 §6.3) — wire event-driven room redetection subscriptions.
    // `wireAllPluginSubscriptions` calls each plugin's `wireSubscriptions`
    // callback (currently only rooms: wall.created → rooms.redetect).
    // The returned disposer is intentionally not stored here — runtime
    // tear-down is handled by the platform shell on process exit.
    wireAllPluginSubscriptions(runtime);
    console.debug('[main] Task 1.3: plugin event subscriptions wired (rooms.redetect active).');

    // C06 §4 (Task 3.1) — Register all plugin tool activators with runtime.tools.
    // Must be called AFTER wireAllPluginSubscriptions so the bus is ready.
    registerAllPluginToolActivators(runtime);

    // Wave 7 (2026-05-01) — workspace bridge (D.4) deleted.  The project-open
    // chain now uses two typed runtime legs:
    //   • runtime.persistence.tier.streamLoad(id)  — typed server fetch
    //   • runtime.workspace.surface.setProjectContext() — typed surface call
    //     (wired from composeRuntime() automatically — no attachment needed here)
    //
    // The only residual bridge responsibility is engine boot: `ensure()` lazy-
    // starts the legacy EngineBootstrap on first project-open (idempotent).
    // DELETE when the renderer is mounted from boot (Phase D.3).
    runtime.persistence.attachEngineBootstrap({ ensure: () => workspaceMount.ensure() });

    // Phase B.4 (S73-WIRE) — wire the composed runtime into PanelManager so
    // dynamically-opened panels (ExportStudio, VideoExport, etc.) receive the
    // typed handle without a window-global reach.  Lightweight; stays on the
    // critical path because PanelManager is the singleton ProjectHub may
    // dispatch to even before workspace mount.
    // TODO(D.4): make `runtime` non-null once EngineBootstrap is split.
    panelManager.wireRuntime(runtime);

    // Wave 17 (2026-05-02): stash removed. runtime is now passed as a direct param
    // to initPersistence() via engineLauncher.ts:bootstrap(runtime).
    // window.__pryzm2RuntimeComposed = runtime;  ← DELETED

    // ── PHASE A: paint-fast — mount the landing/hub UI now ────────────────────
    // Per the Wave 1.5 boot-order correction declared above, the four
    // module-load singleton hand-offs (UiPreferences, gridDrawingHUD,
    // dataCommandCenter, syncStateDetailDrawer) and the 2,433 LOC PlatformShell
    // constructor are deferred to Phase B.  None of them are reachable from
    // the landing, auth modal, or project-hub flows; the earliest possible
    // consumer is `workspaceMount.{ensure,show}()` on the project-open click,
    // and both gate on `_heavyWiringDone`.
    PlatformRouter.start(runtime);

    // ── PHASE B: deferred heavy wiring (background) ───────────────────────────
    // Yield two animation frames so the browser commits a paint of the landing
    // DOM before we burn another ~hundred ms doing the four module-load singleton
    // hand-offs and the PlatformShell constructor.  `_heavyWiringDone` is the
    // promise `workspaceMount.{ensure,show}()` awaits before invoking the
    // engine bootstrap or `setProjectContext()`.
    _heavyWiringDone = (async () => {
        // D.7.5 batch #5 FIX (Wave 1.5b — deadlock repair):
        //
        // The prior implementation used two nested getFrameScheduler().scheduleOnce()
        // calls to yield two browser frames before Phase B wiring.  This introduced
        // a circular deadlock:
        //
        //   ensure()  →  awaits _heavyWiringDone
        //   _heavyWiringDone  →  awaits scheduleOnce tick
        //   scheduleOnce only fires  →  after FrameScheduler.start()
        //   FrameScheduler.start()  →  called inside bootstrap()
        //   bootstrap()  →  called inside ensure()   ← never reached
        //
        // FrameScheduler.wakeIfStopped() guards on `adapter !== null`; when
        // start() has never been called the adapter is null, the wake is a
        // no-op, and _heavyWiringDone never resolves.
        //
        // Fix: two nested setTimeout(0) macrotask yields.  The P3 principle
        // ("single rAF owner") governs requestAnimationFrame exclusively —
        // setTimeout is a different scheduling primitive and is explicitly
        // allowed for boot-time orchestration that runs before the engine starts.
        await new Promise<void>((resolve) => {
            setTimeout(() => { setTimeout(() => resolve(), 0); }, 0);
        });

        // Phase B.13-UP (S73-WIRE) — UiPreferences is a module-load singleton and
        // therefore cannot receive the runtime through its constructor. Inject it
        // here so consumers (PlatformShell, RoomDetectionEngine, RoomBoundaryBuilder,
        // IntentPrompt, ProjectBrowserPanel) can read `uiPreferences.runtime`
        // instead of falling back to `window` reads in Phase D.4 / E.5.x.
        {
            const { UiPreferences } = await import('@app/ui/UiPreferences');
            UiPreferences.wireRuntime(runtime);
        }

        // Phase B.15-GD (S73-WIRE) — GridDrawingHUD is a module-load singleton
        // (`gridDrawingHUD`) consumed by `GridPlanToolHandler`; it cannot receive
        // the runtime through its constructor because the singleton is built at
        // module-load time, before `composeRuntime()` runs. Inject the runtime
        // here using the same lazy-set pattern as the B.13-UP `UiPreferences`
        // and B.4 `PanelManager` hand-offs so the HUD's future reach (e.g.
        // `runtime.tools.activate('grid', mode)` in E.grids.T) is one wireup away.
        {
            const { gridDrawingHUD } = await import('@app/ui/GridDrawingHUD');
            gridDrawingHUD.wireRuntime(runtime);
        }

        // Phase B.18-DCC (S73-WIRE) — `dataCommandCenter` is a module-load
        // singleton (4 buckets + PIPRenderer instantiated in its constructor).
        // It is constructed BEFORE composeRuntime() runs, so we hand the runtime
        // off here using the same lazy-set pattern as B.13-UP UiPreferences and
        // B.15-GD GridDrawingHUD. wireRuntime() re-buckets so all 4 child buckets
        // (StrategizeBucket, AuditBucket, ValidateBucket, LifecycleBucket) and
        // any subsequently-created PIPRenderer receive the typed handle.
        {
            const { dataCommandCenter } = await import('@app/ui/data/DataCommandCenter');
            dataCommandCenter.wireRuntime(runtime);
        }

        // Phase B.30-SD (S73-WIRE) — `syncStateDetailDrawer` is a module-load
        // singleton consumed by `HierarchyTreePanel`.  Same lazy-set pattern as
        // dataCommandCenter / gridDrawingHUD / UiPreferences / panelManager.
        {
            const { syncStateDetailDrawer } = await import('@app/ui/dataworkbench/SyncStateDetailDrawer');
            syncStateDetailDrawer.wireRuntime(runtime);
        }
        // Wave 19 (Phase 2D + 3A) — boot-time confirmation that runtime.sync
        // and runtime.visibility are wired into the composed runtime.
        console.debug('[main] runtime.sync.client wired:', runtime.sync.client !== null);
        console.debug('[main] runtime.visibility.evaluate wired:', typeof runtime.visibility.evaluate === 'function');

        // Phase D.1 (S77-WIRE) — Create PlatformShell early with deferred stubs.
        // `initPersistence.ts` replaces the stubs with real ProjectSerializer /
        // ProjectLoader adapters via `injectDelegates()` once the engine boots.
        // The shell is registered as `window.platformShell` so that
        // `workspaceMount.show()` can call `setProjectContext()` immediately.
        // DELETE in D.4 (EngineBootstrap removed; full-runtime delegates active).
        {
            const { PlatformShell } = await import('@app/ui/platform/PlatformShell');
            const deferredSave = {
                serialize(_opts: unknown): never {
                    throw new Error('[PlatformShell/D.1] saveDelegate not yet injected');
                },
                stringify(_snap: unknown): never {
                    throw new Error('[PlatformShell/D.1] saveDelegate not yet injected');
                },
                parse(_text: string): never {
                    throw new Error('[PlatformShell/D.1] saveDelegate not yet injected');
                },
                captureThumbnail(): null { return null; },
            };
            const deferredLoad = {
                load(_snap: unknown): never {
                    throw new Error('[PlatformShell/D.1] loadDelegate not yet injected — call injectDelegates first');
                },
            };
            const earlyShell = new PlatformShell(
                deferredSave as any,
                deferredLoad as any,
                runtime,
            );
            window.platformShell = earlyShell;

            // PR 4.A.4 (Wave 4 Track A) — attach the typed host to
            // `runtime.workspace.surface` so `workspaceMount.show()`
            // can call `runtime.workspace.surface.setProjectContext()`
            // without the legacy window.platformShell cast.
            // The window.platformShell = earlyShell
            // assignment above is intentionally LEFT IN PLACE for
            // this PR — sibling readers (HierarchyTreePanel,
            // DesignHistoryPanel, initPersistence's `injectDelegates`
            // hand-off) still reach `window.platformShell` directly;
            // their migration is out of scope for 4.A.4 (subsequent
            // wave-4 PRs route them through `runtime.workspace.surface`
            // and similar typed handles).  The composer guarantees
            // `runtimeRef.current` is non-null here: it was assigned
            // on the synchronous path before this IIFE was kicked off
            // (search `runtimeRef.current = runtime` above).
            const _runtimeForSurface = runtimeRef.current;
            if (_runtimeForSurface !== null) {
                _runtimeForSurface.workspace.surface.mount(earlyShell);
            }
            console.log('[bootPlatform] D.1 — early PlatformShell created (delegates: deferred, post-paint, surface mounted)');
        }

        // ── RENDERER PRE-WARM (NFT-2 optimisation) ────────────────────────────
        // Fire-and-forget: start WebGPU renderer init on a detached canvas so
        // the 2,401 ms LONGTASK is absorbed during landing-page display instead
        // of blocking project open.  `consumePrewarmedRenderer()` in
        // `initScene.ts Phase 5` reclaims the result in O(1).
        // Does NOT delay `_heavyWiringDone` resolution — intentionally void.
        // NFT alignment: NFT-2 (project-load < 6 s p95) — 01-VISION.md §5.
        void import('@app/rendering/rendererPrewarm').then(({ prewarmRenderer }) => {
            prewarmRenderer();
        }).catch(() => { /* pre-warm is best-effort; fallback in initScene.ts */ });
    })();
}

// ── PWA service-worker registration (Wave A20-T18) ───────────────────────────
// Registers /sw.js for offline-capable caching of the app shell + assets.
// Only active in production (isProd) or when explicitly requested via
// ?sw=1 in development.  In development, the SW would intercept HMR
// WebSocket frames and break hot reload.
//
// CONTRACT (C07 §7 — PWA): SW must be at /sw.js (same origin, top scope).
if ('serviceWorker' in navigator) {
    const shouldRegisterSW =
        !import.meta.env.DEV ||
        new URLSearchParams(window.location.search).get('sw') === '1';

    if (shouldRegisterSW) {
        // §SW-AUTO-UPDATE (2026-06-05) — auto-reload ONCE when a new service
        // worker takes control, so a fresh deploy applies itself instead of
        // leaving the user on a stale cached build (the recurring "prod shows
        // old code" pain). The new sw.js calls skipWaiting() on install, so it
        // activates + claims clients immediately → `controllerchange` fires →
        // we reload into the fresh chunk graph. Guards:
        //   • only when a controller ALREADY exists (a returning visitor with an
        //     old SW) — a first-ever install has nothing stale to replace, so we
        //     must NOT reload then (it would loop the very first load);
        //   • `hasRefreshed` flag prevents any reload loop.
        if (navigator.serviceWorker.controller) {
            let hasRefreshed = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (hasRefreshed) return;
                hasRefreshed = true;
                console.info('[sw] new version activated — reloading to apply.');
                window.location.reload();
            });
        }

        navigator.serviceWorker
            .register('/sw.js', { scope: '/' })
            .then((registration) => {
                console.info('[sw] registered, scope:', registration.scope);

                // Proactively check for a new SW on every load so a deploy is
                // picked up promptly (the browser also revalidates /sw.js, but an
                // explicit update() removes the one-extra-navigation lag).
                registration.update?.();

                // Informational: log when a new worker has installed in the
                // background (the controllerchange handler above does the reload).
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    if (!newWorker) return;
                    newWorker.addEventListener('statechange', () => {
                        if (
                            newWorker.state === 'installed' &&
                            navigator.serviceWorker.controller
                        ) {
                            console.info('[sw] update installed — applying on controllerchange.');
                        }
                    });
                });
            })
            .catch((err) => {
                console.warn('[sw] registration failed (non-critical):', err);
            });
    }
}

// ── BOOT IIFE (Phase D.2 — S77-WIRE) ─────────────────────────────────────────
// Single-entry async boot.  The `?pryzm2=1` kill-switch path has been
// removed (D.2); only `bootPlatform()` runs.
// §H11 (audit) — install global error / rejection handlers BEFORE bootPlatform,
// so even a boot-time crash is captured by telemetry. Idempotent per the
// CrashReporter contract; safe to call once at boot.
try {
    installGlobalHandlers({ scope: 'browser' });
} catch (err) {
    console.warn('[main] installGlobalHandlers failed (non-fatal):', err);
}

void (async () => {
    try {
        await bootPlatform();
    } catch (err) {
        const e = err as Error;
        console.error(
            '[main] bootPlatform() failed — white UI cannot mount:',
            e?.message ?? String(err),
            '\n', e?.stack ?? '(no stack)',
        );
        // §H10 (audit) — render a minimal DOM fallback so the user sees something
        // and has a recovery path. Uses only document API + inline styles — no
        // module imports — because the failure may be in module loading itself.
        try {
            const fallback = document.createElement('div');
            fallback.id = 'pryzm-boot-fallback';
            fallback.style.cssText = [
                'position:fixed', 'inset:0', 'z-index:2147483647',
                'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
                'background:#0f0f12', 'color:#e6e6ea',
                'font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
                'padding:24px', 'text-align:center',
            ].join(';');
            const detail = (e?.message ?? String(err)).slice(0, 240).replace(/[<>&]/g, '');
            fallback.innerHTML = [
                '<div style="font-size:18px;font-weight:600;margin-bottom:8px;">PRYZM failed to start</div>',
                '<div style="font-size:13px;opacity:0.7;max-width:520px;margin-bottom:20px;">An error prevented the editor from initialising. Reloading the page usually fixes transient issues.</div>',
                '<div style="font-size:11px;font-family:ui-monospace,Consolas,monospace;opacity:0.5;max-width:520px;margin-bottom:20px;word-break:break-word;">' + detail + '</div>',
                '<button id="pryzm-boot-fallback-reload" style="padding:10px 24px;background:linear-gradient(135deg,#8B5CF6 0%,#6600FF 100%);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">Reload</button>',
            ].join('');
            document.body.appendChild(fallback);
            const btn = document.getElementById('pryzm-boot-fallback-reload');
            btn?.addEventListener('click', () => location.reload());
        } catch (_fbErr) {
            // Last-resort: even DOM fallback failed. Nothing more we can do.
        }
    }

    // Engine bundle is loaded on-demand when the user first opens a project
    // (via workspaceMount.ensure() → startEngine()).  Eager prefetch was
    // removed because it blocked the main thread for 300-800 ms right during
    // the login flow — Three.js + web-ifc parse/evaluate fires at T+1.5s.
    // DELETE in D.4 (EngineBootstrap.ts removed).
})();
