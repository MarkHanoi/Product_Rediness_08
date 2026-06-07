/**
 * InspectPanel.ts — A.24 / A.31.e (Phase A) — first-class Inspect panel.
 *
 * Promotes the C27 Master Model Tree (`ModelTreeComponent`) + the C23
 * Provenance view (`ProvenanceTab`) out of the dev-only `modelTreeTestModal`
 * into a production editor panel.
 *
 * This file owns NO tree / provenance LOGIC — it is a thin shell that:
 *   1. mounts the canonical `ModelTreeComponent` (6-level
 *      project→building→level→apartment→room→elementType→elementInstance
 *      tree, lazy expand, count badges, selection dispatch);
 *   2. wires the same isolation pipeline the dev modal uses
 *      (createIsolationStateStore + IsolationAnimator + ElementMeshRegistry
 *      adapter) so selecting a node dims the rest of the scene;
 *   3. embeds a live `ProvenanceTab` section that updates whenever an
 *      `elementInstance` node is selected (left-click) — and keeps the
 *      `ProvenanceMenuOrchestrator` right-click → "Show AI provenance" menu
 *      for parity with the dev modal.
 *
 * The wiring is a near-verbatim re-use of `dev/modelTreeTestModal.ts` — see
 * that file for the deep comments on each probe. The differences:
 *   - returns panel CONTENT (an HTMLElement) for the rail body instead of a
 *     <dialog>, so it docks consistently with the other rail panels
 *     (ProjectBrowserPanel → RailPanelController);
 *   - provenance is a first-class embedded section, not just a right-click
 *     popover.
 *
 * STRICT SCOPE / CONTRACT:
 *   - C27 §1.2 (single tree component) — reuses `ModelTreeComponent`.
 *   - C23 §3.1/§4 — provenance is read-only; no commands dispatched here.
 *   - §05 §7.6 — styles live in AppTheme (`INSPECT_PANEL_STYLES`), never inline.
 *   - L7 file (apps/editor). No `import * as THREE` (P2), no
 *     `requestAnimationFrame` (P3), no `(window as any)` (P4).
 *   - Brand: white surface, #6600FF accent, no black (preview-colour memory).
 *
 * Class prefix: `insp-` (Inspect Panel).
 */

import { ModelTreeComponent, type ModelTreeRuntime } from './ModelTree';
import { ProvenanceTab } from './ProvenanceTab';
import { ProvenanceMenuOrchestrator } from './ProvenanceMenuOrchestrator';
import { ElementMeshRegistryAdapter, type SceneLike } from './ElementMeshRegistryAdapter';
import { buildModelElementLocations } from './buildModelElementLocations';
import { createIsolationStateStore, type IsolationStateStore } from '@pryzm/stores';
import { IsolationAnimator, type FrameSchedulerLike } from '@pryzm/renderer-three';
import type { InspectSelection } from '@pryzm/schemas';
import type { ProvenanceStore } from '@pryzm/stores';

type Runtime = import('@pryzm/runtime-composer/types').PryzmRuntime;

// ── Scene / scheduler probes (mirrors modelTreeTestModal.ts) ──────────────────

function readPath(host: Record<string, unknown>, path: ReadonlyArray<string>): unknown {
    try {
        let cur: unknown = host;
        for (const key of path) {
            if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
            cur = (cur as Record<string, unknown>)[key];
        }
        return cur;
    } catch {
        return undefined;
    }
}

function looksLikeScene(obj: unknown): boolean {
    if (obj === null || obj === undefined || typeof obj !== 'object') return false;
    const rec = obj as Record<string, unknown>;
    if (typeof rec['traverse'] === 'function') return true;
    if (Array.isArray(rec['children'])) return true;
    return false;
}

function probeSceneFromRuntime(runtime: ModelTreeRuntime | null | undefined): SceneLike | null {
    if (runtime === null || runtime === undefined) return null;
    const rec = runtime as unknown as Record<string, unknown>;
    const candidates: Array<unknown> = [
        rec['scene'],
        readPath(rec, ['renderer', 'scene']),
        readPath(rec, ['threeRoot']),
        readPath(rec, ['world', 'scene', 'three']),
    ];
    try {
        const w = (typeof window !== 'undefined' ? window : null) as unknown;
        if (w !== null) {
            const wrec = w as Record<string, unknown>;
            const wruntime = wrec['runtime'] as Record<string, unknown> | undefined;
            if (wruntime !== undefined) {
                candidates.push(wruntime['scene']);
                candidates.push(readPath(wruntime, ['renderer', 'scene']));
            }
            candidates.push(wrec['pryzmRenderer'] as unknown);
        }
    } catch {
        /* defensive */
    }
    for (const c of candidates) {
        if (looksLikeScene(c)) return c as SceneLike;
    }
    return null;
}

function probeFrameScheduler(runtime: ModelTreeRuntime | null | undefined): FrameSchedulerLike | null {
    if (runtime === null || runtime === undefined) return null;
    const rec = runtime as unknown as Record<string, unknown>;
    const fs = rec['frameScheduler'];
    if (fs !== null && fs !== undefined && typeof (fs as { onFrame?: unknown }).onFrame === 'function') {
        return fs as FrameSchedulerLike;
    }
    return null;
}

function makeFallbackScheduler(): FrameSchedulerLike {
    return {
        onFrame(_priority, cb): () => void {
            const interval = setInterval(() => {
                try { cb(16.67); }
                catch (err) { console.error('[InspectPanel] fallback tick threw:', err); }
            }, 16) as unknown as number;
            return () => { clearInterval(interval as unknown as ReturnType<typeof setInterval>); };
        },
    };
}

interface IsolationPipeline {
    readonly store: IsolationStateStore;
    readonly animator: IsolationAnimator | null;
}

function setupIsolationPipeline(runtime: ModelTreeRuntime): IsolationPipeline {
    const store = createIsolationStateStore();
    let animator: IsolationAnimator | null = null;
    try {
        const scene: SceneLike = probeSceneFromRuntime(runtime) ?? { children: [] };
        const registry = new ElementMeshRegistryAdapter(scene);
        const scheduler: FrameSchedulerLike = probeFrameScheduler(runtime) ?? makeFallbackScheduler();
        animator = new IsolationAnimator(store, scheduler, registry);
        animator.start();
    } catch (err) {
        console.warn('[InspectPanel] isolation pipeline setup failed:', err);
        animator = null;
    }
    return { store, animator };
}

// ── Handle returned to the caller for teardown ───────────────────────────────

export interface InspectPanelHandle {
    /** The panel content element to mount into the rail body. */
    readonly element: HTMLElement;
    /** Tear down the tree + isolation + provenance subscriptions. Idempotent. */
    dispose(): void;
}

/**
 * Build the first-class Inspect panel content.
 *
 * @param runtime  The composed runtime. Read defensively — when slots are
 *                 missing the panel degrades to a pure tree-display surface
 *                 (provenance shows an empty state; isolation no-ops).
 */
export function buildInspectPanel(runtime: Runtime | null = null): InspectPanelHandle {
    const resolvedRuntime: ModelTreeRuntime =
        (runtime as unknown as ModelTreeRuntime | null)
        ?? (window.runtime as unknown as ModelTreeRuntime | undefined)
        ?? {};

    // ── Shell ────────────────────────────────────────────────────────────────
    const root = document.createElement('div');
    root.className = 'insp-root';

    const subtitle = document.createElement('div');
    subtitle.className = 'insp-subtitle';
    subtitle.textContent =
        'Browse the model hierarchy. Click an element to isolate it and see its AI provenance below.';
    root.appendChild(subtitle);

    // ── Tree section ───────────────────────────────────────────────────────────
    const treeSection = document.createElement('div');
    treeSection.className = 'insp-section insp-section--tree';

    const treeLabel = document.createElement('div');
    treeLabel.className = 'insp-section-label';
    treeLabel.textContent = 'Model Tree';
    treeSection.appendChild(treeLabel);

    const treeHost = document.createElement('div');
    treeHost.className = 'insp-tree-host';
    treeSection.appendChild(treeHost);
    root.appendChild(treeSection);

    // ── Provenance section ─────────────────────────────────────────────────────
    const provSection = document.createElement('div');
    provSection.className = 'insp-section insp-section--prov';

    const provHeader = document.createElement('div');
    provHeader.className = 'insp-section-header';

    const provLabel = document.createElement('div');
    provLabel.className = 'insp-section-label';
    provLabel.textContent = 'Provenance';
    provHeader.appendChild(provLabel);

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'insp-clear-btn';
    clearBtn.textContent = 'Clear isolation';
    clearBtn.title = 'Restore every element to full opacity';
    provHeader.appendChild(clearBtn);

    provSection.appendChild(provHeader);

    const provHost = document.createElement('div');
    provHost.className = 'insp-prov-host';
    provSection.appendChild(provHost);
    root.appendChild(provSection);

    // ── Isolation pipeline (set up before the tree mounts) ─────────────────────
    const pipeline = setupIsolationPipeline(resolvedRuntime);

    const applyIsolationForSelection = (selection: InspectSelection): void => {
        try {
            const elements = buildModelElementLocations(resolvedRuntime);
            pipeline.store.applyIsolation(selection, elements, { hideUnrelated: false });
        } catch (err) {
            console.warn('[InspectPanel] applyIsolation failed:', err);
        }
    };

    clearBtn.addEventListener('click', () => {
        try { pipeline.store.clearIsolation(); }
        catch (err) { console.warn('[InspectPanel] clearIsolation failed:', err); }
    });

    // ── Provenance store + projectId (defensive probes) ────────────────────────
    const provenanceStore = (resolvedRuntime as unknown as {
        provenanceStore?: ProvenanceStore;
    }).provenanceStore;
    const projectId =
        (resolvedRuntime as unknown as { projectContext?: { projectId?: string | null } | null })
            .projectContext?.projectId ?? 'unknown';

    // Embedded provenance tab — first-class section that follows left-click
    // selection. Only built when the store slot exists; otherwise we render a
    // static empty state so the section is still visible (and documents why).
    let provTab: ProvenanceTab | null = null;
    if (provenanceStore !== undefined) {
        provTab = new ProvenanceTab({ store: provenanceStore, projectId });
        provHost.appendChild(provTab.build());
    } else {
        const empty = document.createElement('div');
        empty.className = 'insp-prov-empty';
        empty.textContent =
            'Provenance is unavailable — the provenance store is not wired into this runtime yet.';
        provHost.appendChild(empty);
    }

    // Right-click → "Show AI provenance" menu (parity with the dev modal). The
    // orchestrator mounts its own floating tab into document.body; harmless to
    // keep alongside the embedded section.
    const orchestrator =
        provenanceStore !== undefined
            ? new ProvenanceMenuOrchestrator({ store: provenanceStore, projectId })
            : null;

    // ── Mount the live Master Tree ─────────────────────────────────────────────
    const tree = new ModelTreeComponent(resolvedRuntime, treeHost, {
        onSelectNode: (sel) => {
            applyIsolationForSelection(sel);
            // Drive the embedded provenance tab from element selections.
            if (provTab) {
                provTab.setSelectedElement(sel.kind === 'elementInstance' ? sel.id : null);
            }
        },
        ...(orchestrator !== null
            ? { onContextMenu: (payload): void => orchestrator.openMenu(payload) }
            : {}),
    });
    try {
        tree.mount();
    } catch (err) {
        const errBox = document.createElement('div');
        errBox.className = 'insp-error';
        errBox.textContent =
            `Model tree failed to load: ${String((err as Error).message ?? err)}`;
        treeHost.appendChild(errBox);
    }

    // ── Teardown ───────────────────────────────────────────────────────────────
    let disposed = false;
    const dispose = (): void => {
        if (disposed) return;
        disposed = true;
        try { pipeline.animator?.stop(); }
        catch (err) { console.warn('[InspectPanel] animator.stop() threw:', err); }
        try { pipeline.store.dispose(); }
        catch (err) { console.warn('[InspectPanel] store.dispose() threw:', err); }
        try { tree.unmount(); } catch { /* defensive */ }
        try { provTab?.dispose(); } catch { /* defensive */ }
        try { orchestrator?.dispose(); } catch { /* defensive */ }
    };

    return { element: root, dispose };
}
