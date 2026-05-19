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

    // ── D-2 DependencyResolver monitoring layer ───────────────────────────────
    // Subscribes to StoreEventBus and uses SemanticGraph to compute which elements
    // are transitively affected by each change. Phase D: logs only (monitoring mode).
    dependencyResolver.init();
    console.log('[initDataPlatform] DependencyResolver initialised — semantic graph monitoring active');

    // ── G-1 TemporalGraph — append-only mutation log ──────────────────────────
    // Subscribes to StoreEventBus to auto-record NodeMutationRecords for every
    // create/update/delete event. sessionId is generated once at init time and
    // stable for the entire browser session.
    temporalGraphManager.init();
    console.log(`[initDataPlatform] TemporalGraph initialised — sessionId=${temporalGraphManager.sessionId}`);

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

    // ── C-2: Auto-run ConstraintEngine after any store mutation ──────────────
    // Subscribe to StoreEventBus. Debounce with 800ms so rapid sequences of
    // commands (e.g. auto-setup hierarchy creation) only trigger one run.
    // This is the architectural hook that makes the Compliance Panel live.
    //
    // PERF-FIX (Apr 2026): Suppress auto-run during the project-load window.
    // Loading a project replays dozens of commands (one per element) and each
    // would otherwise schedule a ~600ms full validation pass, blocking the
    // main thread for 1–2 s right when the user is waiting for first paint.
    // We mute auto-runs until 2 s after `pryzm-project-loaded`, then trigger
    // a single coalesced run for the whole loaded model.
    let _constraintDebounce: ReturnType<typeof setTimeout> | null = null;
    let _constraintQuietUntil = Number.POSITIVE_INFINITY;
    window.runtime?.events?.on('pryzm-project-loaded', () => { // F.events.9
        _constraintQuietUntil = Date.now() + 2000;
        // Schedule the post-load coalesced run on idle.
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
    console.log('[initDataPlatform] ConstraintEngine auto-run wired to StoreEventBus (800ms debounce, load-quiet window)');

    // ── G-3: IntentPrompt — wire to ConstraintEngine results ─────────────────
    // When ConstraintEngine fires pryzm-constraints-updated, check for NEW
    // violations that weren't present in the previous run. For each new violation
    // on a capturable rule, show the intent prompt to capture architect rationale.
    window.addEventListener('pryzm-constraints-updated', (e: Event) => {
        const { results } = (e as CustomEvent).detail ?? {};
        if (Array.isArray(results)) {
            handleConstraintResults(results);
        }
    });
    console.log('[initDataPlatform] G-3: IntentPrompt wired to pryzm-constraints-updated');

    // ── H-1: PhysicsEngine — start RAF-batched queue ──────────────────────────
    physicsEngine.init();
    console.log('[initDataPlatform] H-1: PhysicsEngine RAF-queue started');

    // ── H-2: PhysicsOverlayRenderer — wire to Three.js scene ─────────────────
    // Must run after the world scene is available on ctx.world.scene.three.
    try {
        initPhysicsOverlayRenderer(ctx.world.scene.three as THREE.Scene);
        console.log('[initDataPlatform] H-2: PhysicsOverlayRenderer initialised');
    } catch (e) {
        console.warn('[initDataPlatform] PhysicsOverlayRenderer init deferred:', e);
    }

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

    // ── H-1: Enqueue rooms for physics when rooms are created or updated ───────
    storeEventBus.subscribe((event) => {
        if (event.elementType === 'room' && (event.operation === 'create' || event.operation === 'update')) {
            physicsEngine.enqueueRoom(event.elementId);
        }
    });
    // Also enqueue all rooms on project load.
    // PERF-FIX (Apr 2026): Push to requestIdleCallback so the heavy physics
    // batch (acoustics + daylight + thermal) runs after the user can interact
    // with the model, not during the first paint window.
    window.runtime?.events?.on('pryzm-project-loaded', () => { // F.events.9
        const _enqueue = () => {
            physicsEngine.enqueueAll();
            console.log('[initDataPlatform] H-1: Physics compute enqueued for all rooms after project load (idle)');
        };
        const ric = window.requestIdleCallback as
            | ((cb: () => void, opts?: { timeout: number }) => number) | undefined;
        if (typeof ric === 'function') ric(_enqueue, { timeout: 3000 });
        else setTimeout(_enqueue, 1500);
    });
    console.log('[initDataPlatform] H-1: PhysicsEngine room-create/update wiring active');

    // ── DataWorkbench toolbar button injection ────────────────────────────────
    // Inject a "Data" button into the platform toolbar (.plat-toolbar).
    // The DataWorkbench instance already listens to pryzm-toggle-workbench.
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
            // Keep in sync when PhysicsPanel changes the mode
            window.runtime?.events?.on('pryzm-physics-mode-changed', (p: { mode: string }) => { // F.events.15
                if (p.mode) physSelect.value = p.mode;
            });
            platToolbar.appendChild(physSelect);
            console.log('[initDataPlatform] DataWorkbench toolbar button + physics overlay dropdown injected');
        }
    }, 1000);

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

    // ── K-1: VoiceCommandIndicator — mic button in toolbar ────────────────────
    // Injects the mic (or text fallback) button into the platform toolbar.
    // Web Speech API availability detected at runtime.
    new VoiceCommandIndicator();
    console.log('[initDataPlatform] K-1: VoiceCommandIndicator mounted');

    // ── K-2: ConsequencePreviewOverlay — pre-action consequence warnings ───────
    // Global overlay that listens for pryzm-consequence-preview events fired
    // by destructive tool handlers. 300ms hover debounce before display.
    new ConsequencePreviewOverlay();
    console.log('[initDataPlatform] K-2: ConsequencePreviewOverlay initialised');

    // ── K-3: AmbientIndicator + AmbientIntelligence ───────────────────────────
    // AmbientIndicator subscribes to ambientIntelligence and renders the
    // single-line advisory at the bottom of the canvas.
    new AmbientIndicator();
    console.log('[initDataPlatform] K-3: AmbientIndicator mounted');

    // Wire AmbientIntelligence to ConstraintEngine results (deterministic checks)
    window.addEventListener('pryzm-constraints-updated', (e: Event) => {
        const { results } = (e as CustomEvent).detail ?? {};
        if (Array.isArray(results)) {
            ambientIntelligence.onConstraintsUpdated(results);
        }
    });

    // Wire AmbientIntelligence to StoreEventBus to detect semantic commands
    storeEventBus.subscribe((event) => {
        const commandType = (event as any).commandType ?? (event as any).source ?? '';
        if (commandType) {
            ambientIntelligence.onSemanticCommand(commandType);
        }
    });
    console.log('[initDataPlatform] K-3: AmbientIntelligence wired to constraints + StoreEventBus');

    console.log('[initDataPlatform] Data Platform subsystem fully initialised.');
}
