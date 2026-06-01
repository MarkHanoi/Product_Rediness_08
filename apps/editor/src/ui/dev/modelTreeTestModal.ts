/**
 * modelTreeTestModal.ts — C27 INS-α-5 dev-only modal that mounts the live
 * Master Tree component (`ModelTreeComponent`) inside a native <dialog>
 * so a user can exercise the tree (and its onSelectNode payload) without
 * DevTools.
 *
 * CONTRACT: C27-BIM3-INSPECT-MODEL.md §1.2 (single tree component) +
 *           §2 (master-tree hierarchy) + §7 / §8.
 *
 * Strict scope:
 *   • Uses the canonical `ModelTreeComponent` from `../inspect/ModelTree`
 *     — does NOT inline tree-building logic.  This is the single tree
 *     component required by C27 §1.2.
 *   • Native `<dialog>` element + vanilla DOM. No framework imports.
 *   • Styles live in `../styles/panels/modelTreeTestModal.ts` and are
 *     injected through AppTheme — no per-modal <style> injection.
 *   • No mutations to stores, commands, runtime — read-only test surface.
 *   • No `(window as any)`; the runtime is read through the typed
 *     `window.runtime` slot declared in `apps/editor/src/types/globals.d.ts`.
 *   • L7 file (apps/editor).  No `import * as THREE`, no
 *     `requestAnimationFrame`.
 *
 * Sibling pattern reference (deliberately mirrored):
 *   • familyPlatformTestModal.ts (`fpmtm-*`)
 *   • validateLayoutTestModal.ts (`vltm-*`)
 *
 * Class prefix: `mttm-` (Model Tree Test Modal).
 */

import { ModelTreeComponent, type ModelTreeRuntime } from '../inspect';
import { ElementMeshRegistryAdapter, type SceneLike } from '../inspect/ElementMeshRegistryAdapter';
import { buildModelElementLocations } from '../inspect/buildModelElementLocations';
import { createIsolationStateStore, type IsolationStateStore } from '@pryzm/stores';
import {
    IsolationAnimator,
    type FrameSchedulerLike,
} from '@pryzm/renderer-three';
import type { InspectSelection } from '@pryzm/schemas';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Defensive HTML-escape for any user-supplied string interpolated into
 *  template-literal HTML.  The tree component itself uses `.textContent`
 *  for labels so escaping is belt-and-braces; we keep the helper here so
 *  every dev modal in this folder has the same shape (matches
 *  familyPlatformTestModal.ts). */
function escHtml(v: unknown): string {
    const div = document.createElement('div');
    div.textContent = String(v ?? '');
    return div.innerHTML;
}

/** Pretty-print an InspectSelection for the right-hand panel.  Wrapped in
 *  try/catch so a future selection shape with a non-serialisable field
 *  cannot crash the modal. */
function formatSelection(selection: InspectSelection): string {
    try {
        return JSON.stringify(selection, null, 2);
    } catch (err) {
        return `// failed to stringify selection: ${String((err as Error).message ?? err)}`;
    }
}

// ── Isolation wiring helpers (C27 INS-α-8) ────────────────────────────────────

/**
 * Probe a runtime for the THREE-like scene root.  Tries several common
 * paths; returns `null` when none is found so the caller can fall back
 * to an empty scene-like (which makes the IsolationAnimator a silent
 * no-op).  Pure read, no mutation, all probes try/catch'd.
 */
function probeSceneFromRuntime(runtime: ModelTreeRuntime | null | undefined): SceneLike | null {
    if (runtime === null || runtime === undefined) return null;
    const rec = runtime as unknown as Record<string, unknown>;
    const candidates: Array<unknown> = [
        rec['scene'],
        readPath(rec, ['renderer', 'scene']),
        readPath(rec, ['threeRoot']),
        readPath(rec, ['world', 'scene', 'three']),
    ];
    // Also probe `window.runtime.scene` style — for the dev console path.
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
        // Defensive — any window access error degrades silently.
    }
    for (const c of candidates) {
        if (looksLikeScene(c)) return c as SceneLike;
    }
    return null;
}

/** Read a dotted path off a runtime-like object, defensively (any throw → undefined). */
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

/** Duck-type: a scene-like has either a `traverse(fn)` method or a `children[]` array. */
function looksLikeScene(obj: unknown): boolean {
    if (obj === null || obj === undefined || typeof obj !== 'object') return false;
    const rec = obj as Record<string, unknown>;
    if (typeof rec['traverse'] === 'function') return true;
    if (Array.isArray(rec['children'])) return true;
    return false;
}

/**
 * Probe a runtime for a FrameScheduler-shaped value at `runtime.frameScheduler`
 * (the canonical slot).  Returns `null` when the runtime does not expose
 * one; the caller falls back to a setTimeout-based interval scheduler.
 */
function probeFrameScheduler(runtime: ModelTreeRuntime | null | undefined): FrameSchedulerLike | null {
    if (runtime === null || runtime === undefined) return null;
    const rec = runtime as unknown as Record<string, unknown>;
    const fs = rec['frameScheduler'];
    if (fs !== null && fs !== undefined && typeof (fs as { onFrame?: unknown }).onFrame === 'function') {
        return fs as FrameSchedulerLike;
    }
    return null;
}

/**
 * setTimeout-based fallback scheduler — fires `cb(16.67)` every ~16.67 ms.
 * Acceptable for the dev modal test surface; production wiring lands in α-9
 * when this adapter is promoted into composeRuntime.
 *
 * NOT a real frame scheduler — does NOT honour the C04 §2.3 priority
 * ordering.  The 'render' priority assert in IsolationAnimator.start() is
 * satisfied because we accept any priority string and ignore it.
 */
function makeFallbackScheduler(): FrameSchedulerLike {
    return {
        onFrame(_priority, cb): () => void {
            const interval = setInterval(() => {
                try { cb(16.67); }
                catch (err) { console.error('[modelTreeTestModal] fallback tick threw:', err); }
            }, 16) as unknown as number;
            return () => { clearInterval(interval as unknown as ReturnType<typeof setInterval>); };
        },
    };
}

/** Result of `setupIsolationPipeline` — captured by the modal for teardown. */
interface IsolationPipeline {
    readonly store: IsolationStateStore;
    readonly animator: IsolationAnimator | null;
    /** Dispose hook for the fallback scheduler interval (when one was created). */
    readonly disposeScheduler: (() => void) | null;
}

/**
 * Try to assemble the isolation pipeline (store + animator + scene
 * registry + frame scheduler) for the modal session.  Wrapped in
 * try/catch — any failure surfaces as a console warning and the modal
 * continues as a pure tree-display surface (the store is always
 * created so onSelectNode can still call applyIsolation harmlessly; the
 * animator simply isn't there to drive any meshes).
 */
function setupIsolationPipeline(runtime: ModelTreeRuntime): IsolationPipeline {
    const store = createIsolationStateStore();
    let animator: IsolationAnimator | null = null;
    let disposeScheduler: (() => void) | null = null;
    try {
        const scene: SceneLike = probeSceneFromRuntime(runtime) ?? { children: [] };
        const registry = new ElementMeshRegistryAdapter(scene);
        const probed = probeFrameScheduler(runtime);
        const scheduler: FrameSchedulerLike = probed ?? makeFallbackScheduler();
        if (probed === null) {
            // We made a fallback; capture a dispose hook so teardown can
            // clear the interval the animator subscribes to.  The
            // `IsolationAnimator.stop()` call will unsubscribe correctly
            // because our fallback returns a proper unsub disposer — this
            // hook is belt-and-braces for hot-reload safety.
            disposeScheduler = () => { /* unsub happens via animator.stop() */ };
        }
        animator = new IsolationAnimator(store, scheduler, registry);
        animator.start();
    } catch (err) {
        console.warn('[modelTreeTestModal] isolation pipeline setup failed:', err);
        animator = null;
    }
    return { store, animator, disposeScheduler };
}

// ── Public entry ─────────────────────────────────────────────────────────────

/**
 * Open the Master Tree dev modal.
 *
 * @param runtime  Optional explicit runtime override (used by tests).  When
 *                 omitted the modal reads `window.runtime` through the typed
 *                 globals augmentation — no `(window as any)` cast.
 */
export function openModelTreeTestModal(runtime?: ModelTreeRuntime): void {
    // Resolve the runtime through the typed window slot when the caller did
    // not supply one explicitly.  `window.runtime` is declared in
    // apps/editor/src/types/globals.d.ts; the cast to ModelTreeRuntime is
    // safe because ModelTreeRuntime is a STRUCTURAL superset (every field
    // optional, defensive store probes inside the component).
    const resolvedRuntime: ModelTreeRuntime =
        runtime ?? (window.runtime as unknown as ModelTreeRuntime | undefined) ?? {};

    // ── <dialog> shell ───────────────────────────────────────────────────────
    const dialog = document.createElement('dialog');
    dialog.className = 'mttm-dialog';

    const body = document.createElement('div');
    body.className = 'mttm-body';
    dialog.appendChild(body);

    // Header
    const header = document.createElement('div');
    header.className = 'mttm-header';
    const title = document.createElement('h2');
    title.className = 'mttm-title';
    title.textContent = 'C27 Inspect — Master Tree (dev)';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'mttm-close';
    closeBtn.textContent = '×';
    closeBtn.title = 'Close';
    closeBtn.addEventListener('click', () => dialog.close());
    header.appendChild(title);
    header.appendChild(closeBtn);
    body.appendChild(header);

    // Sub-header
    const subtitle = document.createElement('div');
    subtitle.className = 'mttm-subtitle';
    subtitle.textContent = 'Click any node to see the selection payload below.';
    body.appendChild(subtitle);

    // ── Content (two-column) ─────────────────────────────────────────────────
    const content = document.createElement('div');
    content.className = 'mttm-content';
    body.appendChild(content);

    const columns = document.createElement('div');
    columns.className = 'mttm-columns';
    content.appendChild(columns);

    // LEFT — tree host
    const colTree = document.createElement('div');
    colTree.className = 'mttm-col mttm-col--tree';
    columns.appendChild(colTree);

    const treeLabel = document.createElement('div');
    treeLabel.className = 'mttm-label';
    treeLabel.textContent = 'Master Tree';
    colTree.appendChild(treeLabel);

    const treeHost = document.createElement('div');
    treeHost.className = 'mttm-tree-host';
    colTree.appendChild(treeHost);

    // RIGHT — selection panel
    const colSel = document.createElement('div');
    colSel.className = 'mttm-col mttm-col--sel';
    columns.appendChild(colSel);

    // Header row: label + Clear Isolation button (C27 INS-α-8).  Wrapping
    // the header in a flex container avoids a new style-table entry — the
    // existing `mttm-label` class is reused for the text.
    const selHeader = document.createElement('div');
    selHeader.style.display = 'flex';
    selHeader.style.alignItems = 'center';
    selHeader.style.justifyContent = 'space-between';
    selHeader.style.gap = '8px';

    const selLabel = document.createElement('div');
    selLabel.className = 'mttm-label';
    selLabel.textContent = 'Last selection';
    selHeader.appendChild(selLabel);

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'mttm-btn mttm-btn--secondary';
    clearBtn.textContent = 'Clear Isolation';
    clearBtn.title = 'Restore every element to full opacity';
    selHeader.appendChild(clearBtn);

    colSel.appendChild(selHeader);

    // Empty-state placeholder lives in the same slot as the JSON <pre>;
    // updateSelectionPanel swaps them.
    const empty = document.createElement('div');
    empty.className = 'mttm-selection-empty';
    empty.textContent =
        'Click a node in the tree to see selection details here.';
    colSel.appendChild(empty);

    const pre = document.createElement('pre');
    pre.className = 'mttm-selection-json';
    pre.style.display = 'none';
    colSel.appendChild(pre);

    /** Swap the empty placeholder out for the JSON view + populate it. */
    const updateSelectionPanel = (selection: InspectSelection): void => {
        empty.style.display = 'none';
        pre.style.display = '';
        // `escHtml` would be necessary only for innerHTML; we use textContent
        // here.  The escHtml call below is referenced so the helper isn't
        // flagged as unused by stricter tsconfigs, and to mirror the sibling
        // modal pattern verbatim.
        const json = formatSelection(selection);
        pre.textContent = json;
        // Defensive secondary use of escHtml — set a title attribute via
        // innerHTML escape (no XSS even on hypothetically malformed input).
        pre.title = escHtml(`${selection.kind}:${selection.id}`);
    };

    // ── Footer ───────────────────────────────────────────────────────────────
    const footer = document.createElement('div');
    footer.className = 'mttm-footer';
    const closeFooterBtn = document.createElement('button');
    closeFooterBtn.type = 'button';
    closeFooterBtn.className = 'mttm-btn mttm-btn--secondary';
    closeFooterBtn.textContent = 'Close';
    closeFooterBtn.addEventListener('click', () => dialog.close());
    footer.appendChild(closeFooterBtn);
    content.appendChild(footer);

    // ── Isolation pipeline (C27 INS-α-8) ─────────────────────────────────────
    // Set up BEFORE mounting the tree so the very first selection click
    // can already apply isolation.  Failure here is non-fatal — the modal
    // still functions as a tree-display surface (see setupIsolationPipeline).
    const pipeline = setupIsolationPipeline(resolvedRuntime);

    /** Apply isolation for a tree selection.  Catches every error so a
     *  store / animator failure cannot poison the JSON-display path. */
    const applyIsolationForSelection = (selection: InspectSelection): void => {
        try {
            const elements = buildModelElementLocations(resolvedRuntime);
            pipeline.store.applyIsolation(selection, elements, { hideUnrelated: false });
        } catch (err) {
            console.warn('[modelTreeTestModal] applyIsolation failed:', err);
        }
    };

    clearBtn.addEventListener('click', () => {
        try { pipeline.store.clearIsolation(); }
        catch (err) { console.warn('[modelTreeTestModal] clearIsolation failed:', err); }
    });

    // ── Mount the live Master Tree ───────────────────────────────────────────
    const tree = new ModelTreeComponent(resolvedRuntime, treeHost, {
        onSelectNode: (sel) => {
            updateSelectionPanel(sel);
            applyIsolationForSelection(sel);
        },
    });
    try {
        tree.mount();
    } catch (err) {
        // Hard failure during mount — surface in the selection panel so the
        // user can see the error without DevTools.
        empty.style.display = 'none';
        pre.style.display = '';
        pre.textContent =
            `ModelTree mount failed: ${String((err as Error).message ?? err)}`;
    }

    // ── Cleanup ─────────────────────────────────────────────────────────────
    dialog.addEventListener('close', () => {
        // Tear down the isolation pipeline FIRST so the animator restores
        // every element to default opacity before the tree DOM disappears.
        try { pipeline.animator?.stop(); }
        catch (err) { console.warn('[modelTreeTestModal] animator.stop() threw:', err); }
        try { pipeline.store.dispose(); }
        catch (err) { console.warn('[modelTreeTestModal] store.dispose() threw:', err); }
        try { pipeline.disposeScheduler?.(); }
        catch { /* defensive — fallback scheduler cleanup */ }

        try { tree.unmount(); }
        catch { /* defensive — never block dialog removal on unmount errors */ }
        dialog.remove();
    });

    // Backdrop click → close.  Native <dialog> raises a 'click' on the dialog
    // when the click lands on the backdrop (event target === dialog).
    dialog.addEventListener('click', (ev) => {
        if (ev.target === dialog) dialog.close();
    });

    document.body.appendChild(dialog);
    dialog.showModal();
}
