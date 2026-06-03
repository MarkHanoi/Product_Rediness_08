// D.4.3 POINTER HEADER ────────────────────────────────────────────────────────
//
// This file STARTS the RAF-batched physics queue (`physicsEngine.start()`
// at the bottom of `initDataPlatform()`).  That rAF ownership violates P3
// and will move to `packages/physics-host/src/Stepper.ts` in Phase 1D when
// the `FrameSlot` (`runtime.frame`) is wired.
//
// The typed CONTRACT for the physics-host boundary now lives at:
//   `packages/physics-host/src/bootstrap.ts` — `bootstrapPhysics()` /
//   `bootstrapPhysicsIdle()`, OTel span `pryzm.bootstrap.physics`.
//
// Do NOT add new `requestAnimationFrame` calls here.  Drive all future
// frame work through `runtime.frame.subscribe` (P3).
//
// ─────────────────────────────────────────────────────────────────────────────

/**
 * initDataPlatform — Phase F-1 subsystem initializer.
 *
 * Wires together:
 *   §6.3  ElementCode auto-assignment via StoreEventBus
 *   §6.4  SyncStateEngine startup (paused until project load)
 *   D-2   DependencyResolver monitoring layer
 *   §6.7  Data Platform stores + SemanticGraph exposed on window
 *   B-2   DataWorkbench toolbar button injection
 *   B-2   DataWorkbench tree → 3D selection bridge
 *
 * Extracted from EngineBootstrap.ts (Phase F-1).
 * Corresponds to lines 3043–3152 of the original monolithic bootstrap.
 *
 * Contract:
 *   §01-BIM-ENGINE-CORE-CONTRACT §3 — reads stores via singletons; never
 *     calls store mutators directly; all mutations go via StoreEventBus.
 *   §03-BIM-SEMANTIC-MODEL-CONTRACT — SemanticGraph singleton used read-only.
 *   §09-DATABASE-PERSISTENCE-ARCHITECTURE §6 — caller (EngineBootstrap) owns
 *     the project save/load lifecycle; this module only subscribes to events.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { storeEventBus }           from '@pryzm/core-app-model';
import { elementCodeStore }        from '@pryzm/core-app-model';
import { syncStateEngine }         from '@pryzm/core-app-model';
import { RoomColourSystem }        from '@pryzm/room-topology';
import { dependencyResolver }      from '@pryzm/core-app-model';
import { hierarchyStore }          from '@pryzm/core-app-model';
import { templateStore }           from '@pryzm/core-app-model';
import { templateAssignmentStore } from '@pryzm/core-app-model';
import { semanticGraphManager }    from '@pryzm/core-app-model';
import { temporalGraphManager }   from '@pryzm/core-app-model';
import { constraintEngine }        from '@pryzm/constraint-solver/compliance';
import { decisionRecordStore }        from '@pryzm/core-app-model';
import { handleConstraintResults, wireRuntime as wireIntentPromptRuntime } from '@app/ui/canvas/IntentPrompt';
import { physicsEngine }              from '@pryzm/physics-host';
import { initPhysicsOverlayRenderer, setPhysicsOverlayMode } from '@pryzm/physics-host';
import type { PhysicsOverlayMode }    from '@pryzm/physics-host';
import { selectionBus }               from '@pryzm/core-app-model';
import { VoiceCommandIndicator }       from '@app/ui/canvas/VoiceCommandIndicator';
import { ConsequencePreviewOverlay }   from '@app/ui/canvas/ConsequencePreviewOverlay';
import { AmbientIndicator }            from '@app/ui/canvas/AmbientIndicator';
import { ambientIntelligence }         from '@pryzm/ai-host';
// S70 D8 — lifecycleStateManager + maintenanceRecordStore imports deleted with
// src/lifecycle/ per SPEC-27 §4.3 + ADR-030 Part D + ADR-0052 §B.7.  The
// window-global bindings these enabled were a `?pryzm1=1`-only legacy path.
import type { EngineContext } from './EngineContext';

// ── O.8 (PERF 2026-06-03): deferred-subsystem idempotency guard ──────────────
// The monitoring / advisory subsystems below (physics compute, temporal-graph
// auto-recording, dependency-cascade monitoring, constraint auto-run, ambient
// intelligence + canvas advisory overlays, the DataWorkbench toolbar button)
// are NOT needed for the onboarding location→draw→generate path. They only
// matter for interactive editing AFTER the project is open and the user starts
// mutating the model. Running them inside the synchronous boot path adds
// several hundred ms of LONGTASK before "Set up your project" can paint.
//
// We move them into `runDeferredDataPlatform()`, scheduled on `requestIdleCallback`
// after first paint (and guaranteed to run via the post-load idle hook below,
// well before the user reaches the GENERATE step). All of them are subscribe-
// only or fire-and-forget AND idempotent (init() guards re-entry), so:
//   • A mutation that slips through before idle fires is harmless — these layers
//     only RECORD / ADVISE; none feed geometry or the generate command path.
//   • `ensureDeferredDataPlatform()` can be called by any code that hard-depends
//     on a deferred subsystem to force-init it early (defensive — the generate
//     path does not).
let _deferredRan = false;
let _deferredCtx:
    | { ctx: Pick<EngineContext, 'world' | 'selectionManager' | 'updateInspector'>;
        runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null }
    | null = null;

/**
 * Force the deferred (non-essential) Data Platform subsystems to initialise NOW
 * if they have not already. Idempotent — safe to call any number of times.
 * Exposed on `window.__pryzmEnsureDataPlatform` so the GENERATE path (or any
 * future caller) can guarantee physics/temporal/etc. are live before relying on
 * them, without waiting for the idle callback.
 */
export function ensureDeferredDataPlatform(): void {
    if (_deferredRan || !_deferredCtx) return;
    runDeferredDataPlatform(_deferredCtx.ctx, _deferredCtx.runtime);
}

/**
 * Wire all Data Platform services and expose stores on window.
 * Must be called after all element stores have been instantiated and
 * after selectionManager + updateInspector are available on ctx.
 */
export function initDataPlatform(ctx: Pick<EngineContext,
    'world' | 'selectionManager' | 'updateInspector'>,
    runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime initDataPlatform */,
): void {

    // Phase B.39 (S73-WIRE) — wire the IntentPrompt module-load singleton with
    // the composed runtime so subsequent show()/handleConstraintResults() calls
    // can route through runtime.intent.recordDecision once C.3.x lands without
    // re-touching call sites.
    wireIntentPromptRuntime(runtime);

    // ── §6.3 ElementCode auto-assignment ─────────────────────────────────────
    // Subscribe to StoreEventBus to auto-assign codes when elements are created
    // and release them when deleted. Skips DP meta-types that don't need codes.
    storeEventBus.subscribe((event) => {
        const DP_META_TYPES = new Set([
            'element-code', 'template', 'template-assignment',
            'site', 'building', 'level', 'unit',
        ]);
        if (event.operation === 'create' && !DP_META_TYPES.has(event.elementType)) {
            elementCodeStore.assignCode(event.elementId, event.elementType);
        }
        if (event.operation === 'delete') {
            elementCodeStore.releaseCode(event.elementId);
        }
    });
    console.log('[initDataPlatform] ElementCode auto-assignment wired to StoreEventBus');

    // ── §6.4 SyncStateEngine ──────────────────────────────────────────────────
    // start() subscribes the engine to StoreEventBus; engine is still paused
    // and will not process recomputes until resume() is called after project load.
    syncStateEngine.start();
    console.log('[initDataPlatform] SyncStateEngine started (paused until project load)');

    // §13 / M4 fix (Apr 2026): explicit static-DI for RoomColourSystem.  The
    // 'sync-state' colour mode previously reached for window.syncStateEngine
    // at every paint; now the binding is established once at boot via a typed
    // injection point.  Window fallback remains for soft-migration compatibility.
    RoomColourSystem.setSyncStateEngine(syncStateEngine as any);
    console.log('[initDataPlatform] RoomColourSystem.setSyncStateEngine wired');

    // ── D-2 DependencyResolver + G-1 TemporalGraph — DEFERRED (O.8) ───────────
    // Both are subscribe-only MONITORING layers (cascade-rebuild logging /
    // append-only mutation history). They only matter for mutations that happen
    // AFTER subscription, and onboarding's location→draw step produces none that
    // these layers need. Moved to runDeferredDataPlatform() (idle, post-paint).
    // Their init() is idempotent, so an early ensure-call is also safe.

    // ── §6.7 Expose DP stores on window ──────────────────────────────────────
    window.hierarchyStore          = hierarchyStore; // TODO(TASK-08)
    window.templateStore           = templateStore; // TODO(TASK-08)
    window.templateAssignmentStore = templateAssignmentStore; // TODO(TASK-08)
    window.elementCodeStore        = elementCodeStore; // TODO(TASK-08)
    window.syncStateEngine         = syncStateEngine;
    // D-1: SemanticGraph singleton exposed for Commands and panels
    window.semanticGraphManager    = semanticGraphManager;
    // C-1/C-2: ConstraintEngine singleton exposed for CompliancePanel
    window.constraintEngine        = constraintEngine;
    // G-1: TemporalGraph singleton exposed for DesignHistoryPanel (G-2)
    window.temporalGraphManager    = temporalGraphManager;
    // G-3: DecisionRecordStore singleton exposed for RationaleExporter and panels
    window.decisionRecordStore     = decisionRecordStore; // TODO(TASK-08)
    // H-1: PhysicsEngine singleton exposed for ConstraintEngine rules and panels
    window.physicsEngine           = physicsEngine;
    // G-0.3: SelectionBus — bidirectional selection event bus
    window.selectionBus = selectionBus;
    console.log('[initDataPlatform] Data Platform stores + SemanticGraph + TemporalGraph + ConstraintEngine + DecisionRecordStore + PhysicsEngine exposed on window');
    console.log('[initDataPlatform] G-0.3: SelectionBus exposed on window');

    // ── G-0.1: BuiltinTemplates — seed on startup and after every project load ─
    // seedBuiltins() is idempotent (skips ids already present), so calling it
    // unconditionally after load is safe and ensures the library is always visible.
    templateStore.seedBuiltins();
    window.runtime?.events?.on('pryzm-project-loaded', () => { // F.events.9
        templateStore.seedBuiltins();
    });
    console.log('[initDataPlatform] G-0.1: BuiltinTemplates seeded into TemplateStore');

    // ── G-0.3: SelectionBus — route 3D canvas selection events through bus ────
    // When SelectionManager fires pryzm-element-selected, push to selectionBus
    // so the DataWorkbench (and any future subscriber) receives it typed.
    runtime?.events?.on('pryzm-element-selected', ({ elementId }) => {
        if (!elementId) return;
        selectionBus.dispatch({
            type: 'select',
            source: '3d-canvas',
            elementIds: [elementId],
        });
    });
    console.log('[initDataPlatform] G-0.3: SelectionBus subscribed to pryzm-element-selected via runtime.events');

    // ── H-1 physics room-enqueue + DataWorkbench toolbar button — DEFERRED (O.8)
    // Both moved to runDeferredDataPlatform(). The physics queue cannot drain
    // until physicsEngine.init() runs (also deferred), so wiring enqueue here
    // gained nothing on the critical path; the toolbar button + physics-overlay
    // dropdown are interactive-editing affordances irrelevant to onboarding.

    // ── B-2: DataWorkbench tree → 3D selection bridge ────────────────────────
    // When the user clicks a node in HierarchyTreePanel, find the matching mesh
    // in the Three.js scene and highlight it via SelectionManager.
    // F.events.7 — pryzm-workbench-select migrated to runtime.events typed bus.
    window.runtime?.events?.on('pryzm-workbench-select', (payload: unknown) => {
        const p = payload as { nodeId?: string; id?: string; elementId?: string; nodeType?: string; type?: string; elementType?: string } | undefined;
        const nodeId   = p?.nodeId ?? p?.id ?? p?.elementId;
        const nodeType = p?.nodeType ?? p?.type ?? p?.elementType;
        if (!nodeId) return;

        // Only 3D-visible element types: rooms, walls, slabs, doors, windows, etc.
        // Hierarchy nodes (site/building/level/unit) have no 3D mesh to select.
        const selectable3D = ['room', 'wall', 'slab', 'door', 'window', 'column', 'beam',
            'stair', 'furniture', 'ceiling', 'roof', 'curtainwall', 'handrail', 'plumbing'];
        if (!nodeType || !selectable3D.includes(nodeType)) return;

        let targetMesh: THREE.Object3D | null = null;
        ctx.world.scene.three.traverse((obj: THREE.Object3D) => {
            if (!targetMesh && obj.userData?.id === nodeId) {
                targetMesh = obj;
            }
        });

        if (targetMesh) {
            ctx.selectionManager.applyHighlight(targetMesh);
            ctx.updateInspector(targetMesh);
            console.log('[initDataPlatform] DataWorkbench→3D: highlighted', nodeType, nodeId);
        }
    });

    // ── L-1/L-2: Lifecycle state — DELETED at S70 D8 ──────────────────────────
    // The window.lifecycleStateManager + maintenanceRecordStore
    // bindings were removed alongside the deletion of src/lifecycle/.
    // Per ADR-030 §A row 2 + Part D, per-family handlers in plugins/* are the
    // new owners; the global-on-window pattern is dead per ADR-030 anti-patterns.

    // ── K-1/K-2/K-3 advisory overlays + constraint auto-run + physics/temporal/
    //    dependency monitoring — DEFERRED (O.8). See runDeferredDataPlatform().
    // None of these are needed for onboarding location→draw→generate.

    console.log('[initDataPlatform] Data Platform ESSENTIAL subsystem initialised (deferring monitoring/advisory to idle).');

    // ── O.8: schedule the non-essential subsystems on idle, after first paint ──
    // Stash the context so ensureDeferredDataPlatform() can force-init early if
    // anything ends up hard-depending on a deferred subsystem.
    _deferredCtx = { ctx, runtime };
    // Expose the force-init guard so the GENERATE path (or dev console) can
    // ensure the deferred monitoring layers are live before relying on them.
    (window as unknown as { __pryzmEnsureDataPlatform?: () => void })
        .__pryzmEnsureDataPlatform = ensureDeferredDataPlatform;
    const _scheduleDeferred = () => ensureDeferredDataPlatform();
    const ric = window.requestIdleCallback as
        | ((cb: () => void, opts?: { timeout: number }) => number) | undefined;
    if (typeof ric === 'function') ric(_scheduleDeferred, { timeout: 4000 });
    else setTimeout(_scheduleDeferred, 1500);
    // Belt-and-braces: also (re-)schedule after the first project load, so even
    // if the browser never fires an idle callback (rare), the monitoring layers
    // are live well before the user reaches GENERATE. Idempotent — no double-init.
    window.runtime?.events?.on('pryzm-project-loaded', () => { // F.events.9
        if (typeof ric === 'function') ric(_scheduleDeferred, { timeout: 3000 });
        else setTimeout(_scheduleDeferred, 800);
    });
}

/**
 * O.8 — the NON-ESSENTIAL Data Platform subsystems, run on idle after first
 * paint (NOT on the project-open critical path). Each is subscribe-only or
 * fire-and-forget, idempotent, and irrelevant to onboarding location→draw→
 * generate. Guarded by `_deferredRan` so it runs exactly once.
 */
function runDeferredDataPlatform(
    ctx: Pick<EngineContext, 'world' | 'selectionManager' | 'updateInspector'>,
    _runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null,
): void {
    if (_deferredRan) return;
    _deferredRan = true;
    const _t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());

    // ── D-2 DependencyResolver — cascade monitoring (subscribe-only) ──────────
    dependencyResolver.init();
    console.log('[initDataPlatform/deferred] DependencyResolver initialised — semantic graph monitoring active');

    // ── G-1 TemporalGraph — append-only mutation log (subscribe-only) ─────────
    temporalGraphManager.init();
    console.log(`[initDataPlatform/deferred] TemporalGraph initialised — sessionId=${temporalGraphManager.sessionId}`);

    // ── C-2: Auto-run ConstraintEngine after any store mutation ──────────────
    // Debounced (800ms) with a load-quiet window so the loaded model only
    // triggers a single coalesced validation pass.
    let _constraintDebounce: ReturnType<typeof setTimeout> | null = null;
    let _constraintQuietUntil = Number.POSITIVE_INFINITY;
    window.runtime?.events?.on('pryzm-project-loaded', () => { // F.events.9
        _constraintQuietUntil = Date.now() + 2000;
        const _run = () => constraintEngine.run();
        const ric = window.requestIdleCallback as
            | ((cb: () => void, opts?: { timeout: number }) => number) | undefined;
        if (typeof ric === 'function') ric(_run, { timeout: 3500 });
        else setTimeout(_run, 2200);
    });
    storeEventBus.subscribe(() => {
        if (Date.now() < _constraintQuietUntil) return; // suppressed during load
        if (_constraintDebounce) clearTimeout(_constraintDebounce);
        _constraintDebounce = setTimeout(() => {
            _constraintDebounce = null;
            constraintEngine.run();
        }, 800);
    });
    console.log('[initDataPlatform/deferred] ConstraintEngine auto-run wired to StoreEventBus (800ms debounce, load-quiet window)');

    // ── G-3: IntentPrompt — wire to ConstraintEngine results ─────────────────
    window.addEventListener('pryzm-constraints-updated', (e: Event) => {
        const { results } = (e as CustomEvent).detail ?? {};
        if (Array.isArray(results)) {
            handleConstraintResults(results);
        }
    });
    console.log('[initDataPlatform/deferred] G-3: IntentPrompt wired to pryzm-constraints-updated');

    // ── H-1: PhysicsEngine — start RAF-batched queue ──────────────────────────
    physicsEngine.init();
    console.log('[initDataPlatform/deferred] H-1: PhysicsEngine RAF-queue started');

    // ── H-2: PhysicsOverlayRenderer — wire to Three.js scene ─────────────────
    try {
        initPhysicsOverlayRenderer(ctx.world.scene.three as THREE.Scene);
        console.log('[initDataPlatform/deferred] H-2: PhysicsOverlayRenderer initialised');
    } catch (e) {
        console.warn('[initDataPlatform/deferred] PhysicsOverlayRenderer init deferred:', e);
    }

    // ── H-1: Enqueue rooms for physics when rooms are created or updated ───────
    storeEventBus.subscribe((event) => {
        if (event.elementType === 'room' && (event.operation === 'create' || event.operation === 'update')) {
            physicsEngine.enqueueRoom(event.elementId);
        }
    });
    window.runtime?.events?.on('pryzm-project-loaded', () => { // F.events.9
        const _enqueue = () => {
            physicsEngine.enqueueAll();
            console.log('[initDataPlatform/deferred] H-1: Physics compute enqueued for all rooms after project load (idle)');
        };
        const ric = window.requestIdleCallback as
            | ((cb: () => void, opts?: { timeout: number }) => number) | undefined;
        if (typeof ric === 'function') ric(_enqueue, { timeout: 3000 });
        else setTimeout(_enqueue, 1500);
    });
    // If a project was already loaded before this deferred init ran, enqueue now.
    physicsEngine.enqueueAll();
    console.log('[initDataPlatform/deferred] H-1: PhysicsEngine room-create/update wiring active');

    // ── DataWorkbench toolbar button injection ────────────────────────────────
    setTimeout(() => {
        const platToolbar = document.querySelector('.plat-toolbar') as HTMLElement | null;
        if (platToolbar && !document.getElementById('dw-toolbar-btn')) {
            const sep = document.createElement('div');
            sep.className = 'plat-divider';
            platToolbar.appendChild(sep);

            const btn = document.createElement('button');
            btn.id = 'dw-toolbar-btn';
            btn.title = 'Data Workbench — Hierarchy, Templates, Data Sheet';
            btn.style.cssText = `
                display: inline-flex; align-items: center; gap: 5px;
                padding: 5px 10px; font-size: 12px; font-weight: 600;
                border: 1px solid rgba(102,0,255,0.3); border-radius: 6px;
                background: rgba(102,0,255,0.08); color: #6600FF;
                cursor: pointer; white-space: nowrap;
                font-family: var(--app-font, -apple-system, sans-serif);
                transition: background 0.12s, border-color 0.12s;
            `;
            btn.innerHTML = '🏗 Data';
            btn.addEventListener('click', () => {
                window.runtime?.events?.emit('pryzm-toggle-workbench', {}); // F.events.10
            });
            btn.addEventListener('mouseenter', () => {
                btn.style.background = 'rgba(102,0,255,0.15)';
                btn.style.borderColor = 'rgba(102,0,255,0.5)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.background = 'rgba(102,0,255,0.08)';
                btn.style.borderColor = 'rgba(102,0,255,0.3)';
            });
            platToolbar.appendChild(btn);

            // H-2: Physics overlay mode dropdown in canvas toolbar
            const physSep = document.createElement('div');
            physSep.className = 'plat-divider';
            platToolbar.appendChild(physSep);

            const physSelect = document.createElement('select');
            physSelect.id    = 'plat-physics-select';
            physSelect.title = 'Physics overlay mode';
            physSelect.style.cssText = [
                'font-size:11px;padding:3px 7px;border-radius:6px;',
                'border:1px solid rgba(5,150,105,0.3);background:rgba(5,150,105,0.08);',
                'color:#059669;cursor:pointer;font-weight:600;',
                'font-family:var(--app-font,-apple-system,sans-serif);',
            ].join('');
            ([
                { value: 'off',      label: '⚡ Physics: Off' },
                { value: 'thermal',  label: '🌡 Thermal' },
                { value: 'acoustic', label: '🔊 Acoustic' },
                { value: 'daylight', label: '☀ Daylight' },
            ] as Array<{ value: PhysicsOverlayMode; label: string }>).forEach(({ value, label }) => {
                const opt = document.createElement('option');
                opt.value = value;
                opt.textContent = label;
                physSelect.appendChild(opt);
            });
            physSelect.addEventListener('change', () => {
                setPhysicsOverlayMode(physSelect.value as PhysicsOverlayMode);
                physicsEngine.enqueueAll();
            });
            window.runtime?.events?.on('pryzm-physics-mode-changed', (p: { mode: string }) => { // F.events.15
                if (p.mode) physSelect.value = p.mode;
            });
            platToolbar.appendChild(physSelect);
            console.log('[initDataPlatform/deferred] DataWorkbench toolbar button + physics overlay dropdown injected');
        }
    }, 0);

    // ── K-1: VoiceCommandIndicator — mic button in toolbar ────────────────────
    new VoiceCommandIndicator();
    console.log('[initDataPlatform/deferred] K-1: VoiceCommandIndicator mounted');

    // ── K-2: ConsequencePreviewOverlay — pre-action consequence warnings ───────
    new ConsequencePreviewOverlay();
    console.log('[initDataPlatform/deferred] K-2: ConsequencePreviewOverlay initialised');

    // ── K-3: AmbientIndicator + AmbientIntelligence ───────────────────────────
    new AmbientIndicator();
    console.log('[initDataPlatform/deferred] K-3: AmbientIndicator mounted');

    window.addEventListener('pryzm-constraints-updated', (e: Event) => {
        const { results } = (e as CustomEvent).detail ?? {};
        if (Array.isArray(results)) {
            ambientIntelligence.onConstraintsUpdated(results);
        }
    });
    storeEventBus.subscribe((event) => {
        const commandType = (event as any).commandType ?? (event as any).source ?? '';
        if (commandType) {
            ambientIntelligence.onSemanticCommand(commandType);
        }
    });
    console.log('[initDataPlatform/deferred] K-3: AmbientIntelligence wired to constraints + StoreEventBus');

    const _t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    console.log(`[initDataPlatform/deferred] Non-essential Data Platform subsystems initialised in ${Math.round(_t1 - _t0)}ms (off the project-open critical path).`);
}
