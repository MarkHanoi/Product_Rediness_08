// §FEAT-MULTI-PANE-VIEW-SYSTEM (L-412 / L-405, C59 Phase 2) — the VIEW-STATE STORE +
// COMMAND layer for pane assignment. This is the P6 half of Phase 2.
//
// WHY THIS EXISTS (C59 §2 invariant 3, "command-driven layout"): "pane assignment/swap
// is a DOMAIN INTENT: it flows through a command / view-state store … not ad-hoc DOM
// toggles. The pure model in §1.2 is the reducer; the store/command wrapper is phased."
// This module IS that wrapper. The failure mode it exists to prevent is the obvious
// "just wire the dropdown" implementation, where a <select> reaches straight into
// `MultiPaneController.assignView()` (or worse, into DOM styles) and the layout ends up
// with several mutually-unaware owners — precisely the three-incompatible-mechanisms
// disease C59 §0 was written to cure.
//
// THE SHAPE:
//   intent  ──dispatch──▶  PURE REDUCER (paneViewModel: assignViewToPane / swapPanes)
//                          ──guard──▶ validatePaneLayout + registry availability
//                          ──apply──▶ the imperative shell (MultiPaneController)
//                          ──commit + notify──▶ subscribers (pickers repaint)
//
// A REJECTED intent mutates NOTHING: no layout change, no renderer touched, no
// subscriber notified — the caller gets a `rejected` reason it can show the user. The
// picker uses `describePaneViewOptions` to avoid ever dispatching a rejectable intent;
// this guard is the belt-and-braces behind it (and the thing that keeps a programmatic
// caller honest).
//
// P3 (single rAF): nothing here schedules a frame — the store is synchronous state; the
// applier re-parents/reflows and every renderer keeps subscribing to the ONE frame bus.
// P4: no `window as any` — the store touches no globals at all.
// P8: this is not a CommandBus handler (the OTel-span gate scopes to
// `plugins/*/src/handlers/`); it is the view-state store C59 §2.3 names. Its decisions
// are delegated to the pure, span-exempt reducer in `paneViewModel.ts`.

import {
    VIEW_TYPE_REGISTRY,
    assignViewToPane,
    swapPanes,
    validatePaneLayout,
    type PaneId,
    type PaneLayout,
    type RendererKind,
    type ViewType,
    type ViewTypeDescriptor,
} from './paneViewModel';

/** The domain intents a pane layout accepts. Named like commands (`view.pane.*`). */
export type PaneViewIntent =
    /** Put `viewType` (or `null` to empty) in `paneId`. A singleton MOVES here. */
    | { readonly type: 'view.pane.assign'; readonly paneId: PaneId; readonly viewType: ViewType | null }
    /** Exchange the views hosted by two panes. */
    | { readonly type: 'view.pane.swap'; readonly a: PaneId; readonly b: PaneId }
    /** Take `paneId` full screen: every other pane is vacated (the split is remembered). */
    | { readonly type: 'view.pane.solo'; readonly paneId: PaneId }
    /** Restore the split remembered by the last `solo`. */
    | { readonly type: 'view.pane.restore-split' }
    /**
     * Apply a whole model-derived layout (e.g. `siteAuthoringDefaultLayout()`). Still a
     * command — it is how a caller lands a default WITHOUT bypassing the store and
     * leaving it stale behind the controller.
     */
    | { readonly type: 'view.pane.set-layout'; readonly layout: PaneLayout };

/** The imperative shell the store drives. `MultiPaneController` satisfies this. */
export interface PaneLayoutApplier {
    applyLayout(next: PaneLayout): void | Promise<void>;
    /** Renderer kinds that actually have a mounter registered (runtime availability). */
    registeredKinds?(): ReadonlySet<RendererKind>;
}

export interface PaneLayoutDispatchResult {
    /** False ⇒ nothing changed; `rejected` explains why (show it to the user). */
    readonly ok: boolean;
    /** The layout AFTER the dispatch (unchanged when rejected). */
    readonly layout: PaneLayout;
    readonly rejected?: string;
    /** Resolves when an async mounter (Cesium) has finished attaching. */
    readonly pending?: Promise<void>;
}

export type PaneLayoutListener = (layout: PaneLayout) => void;

export interface PaneLayoutStoreOptions {
    readonly applier?: PaneLayoutApplier | null;
    readonly registry?: Readonly<Record<ViewType, ViewTypeDescriptor>>;
}

/**
 * The single source of truth for "which view is in which pane". One store per pane
 * shell. Readers subscribe; writers dispatch intents. Nothing else may move a view.
 */
export class PaneLayoutStore {
    private _layout: PaneLayout;
    private _splitMemory: PaneLayout | null = null;
    private readonly listeners = new Set<PaneLayoutListener>();
    private readonly registry: Readonly<Record<ViewType, ViewTypeDescriptor>>;
    private applier: PaneLayoutApplier | null;

    constructor(initial: PaneLayout, opts: PaneLayoutStoreOptions = {}) {
        this._layout = { ...initial };
        this.registry = opts.registry ?? VIEW_TYPE_REGISTRY;
        this.applier = opts.applier ?? null;
    }

    /** Immutable snapshot of the current pane→view assignment. */
    getLayout(): PaneLayout {
        return this._layout;
    }

    /** The registry this store adjudicates against (the picker renders from it). */
    getRegistry(): Readonly<Record<ViewType, ViewTypeDescriptor>> {
        return this.registry;
    }

    /** Renderer kinds with a live mounter, or null when the applier can't say. */
    mountableKinds(): ReadonlySet<RendererKind> | null {
        return this.applier?.registeredKinds?.() ?? null;
    }

    /** True when a `restore-split` would have something to restore. */
    canRestoreSplit(): boolean {
        return this._splitMemory != null;
    }

    /** Bind (or re-bind) the imperative shell. */
    setApplier(applier: PaneLayoutApplier | null): void {
        this.applier = applier;
    }

    /** Subscribe to layout changes. Returns the disposer. Fires only on real changes. */
    subscribe(listener: PaneLayoutListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    /**
     * THE only write path. Reduces the intent with the pure algebra, guards it, applies
     * it to the renderers, then commits + notifies. Returns `{ok:false, rejected}` — and
     * changes NOTHING — when the intent is invalid or the apply throws.
     */
    dispatch(intent: PaneViewIntent): PaneLayoutDispatchResult {
        const reduced = this.reduce(intent);
        if (typeof reduced === 'string') return this.reject(reduced);

        const { next, splitMemory } = reduced;

        // Nothing to do — report success without touching renderers or subscribers.
        if (sameLayout(this._layout, next)) {
            if (splitMemory !== undefined) this._splitMemory = splitMemory;
            return { ok: true, layout: this._layout };
        }

        const guard = this.guard(next);
        if (guard) return this.reject(guard);

        let pending: Promise<void> | undefined;
        if (this.applier) {
            try {
                const r = this.applier.applyLayout(next);
                if (r instanceof Promise) pending = r;
            } catch (e) {
                // The imperative shell refused (e.g. the mount-time singleton assert).
                // Leave the store EXACTLY as it was — a store that has moved on from the
                // renderers is how panes go blank with no way back.
                return this.reject(
                    `The view could not be mounted: ${String((e as Error)?.message ?? e)}`,
                );
            }
        }

        this._layout = next;
        if (splitMemory !== undefined) this._splitMemory = splitMemory;
        this.notify();
        return { ok: true, layout: next, pending };
    }

    // ── internals ────────────────────────────────────────────────────────────

    /** Pure reduction. Returns the next layout (+ split memory) or a rejection string. */
    private reduce(
        intent: PaneViewIntent,
    ): { next: PaneLayout; splitMemory?: PaneLayout | null } | string {
        switch (intent.type) {
            case 'view.pane.assign': {
                if (!(intent.paneId in this._layout)) return `Unknown pane "${intent.paneId}".`;
                if (intent.viewType != null) {
                    const unavailable = this.availabilityRejection(intent.viewType);
                    if (unavailable) return unavailable;
                }
                return {
                    next: assignViewToPane(this._layout, intent.paneId, intent.viewType, this.registry),
                    // An explicit assignment supersedes any remembered split.
                    splitMemory: null,
                };
            }
            case 'view.pane.swap': {
                if (!(intent.a in this._layout)) return `Unknown pane "${intent.a}".`;
                if (!(intent.b in this._layout)) return `Unknown pane "${intent.b}".`;
                return { next: swapPanes(this._layout, intent.a, intent.b), splitMemory: null };
            }
            case 'view.pane.solo': {
                if (!(intent.paneId in this._layout)) return `Unknown pane "${intent.paneId}".`;
                if (this._layout[intent.paneId] == null) {
                    return 'This pane is empty — choose a view before going full screen.';
                }
                const next: Record<PaneId, ViewType | null> = { ...this._layout };
                let vacated = false;
                for (const p of Object.keys(next)) {
                    if (p !== intent.paneId && next[p] != null) {
                        next[p] = null;
                        vacated = true;
                    }
                }
                if (!vacated) return 'Already full screen.';
                return { next, splitMemory: this._layout };
            }
            case 'view.pane.restore-split': {
                if (!this._splitMemory) return 'No previous split to restore.';
                return { next: this._splitMemory, splitMemory: null };
            }
            case 'view.pane.set-layout': {
                for (const [paneId, vt] of Object.entries(intent.layout)) {
                    if (!(paneId in this._layout)) return `Unknown pane "${paneId}".`;
                    if (vt != null) {
                        const unavailable = this.availabilityRejection(vt);
                        if (unavailable) return unavailable;
                    }
                }
                return { next: { ...this._layout, ...intent.layout }, splitMemory: null };
            }
        }
    }

    /** Static (contract) + runtime (mounter) availability, as ONE rejection reason. */
    private availabilityRejection(viewType: ViewType): string | null {
        const d = this.registry[viewType];
        if (!d) return `Unknown view type "${viewType}".`;
        if (!d.paneHostable) {
            return d.unavailableReason ?? `"${d.label}" cannot be hosted in a pane yet.`;
        }
        const kinds = this.mountableKinds();
        if (kinds && !kinds.has(d.rendererKind)) {
            return `No ${d.rendererKind} renderer is wired into this workspace, so "${d.label}" has nothing to mount.`;
        }
        return null;
    }

    /** The mount-time invariant, asserted BEFORE any renderer is touched (C59 §2.1). */
    private guard(next: PaneLayout): string | null {
        const check = validatePaneLayout(next, this.registry);
        if (check.ok) return null;
        const c = check.conflicts[0]!;
        return (
            `That layout would put two ${c.rendererKind} views in panes ` +
            `[${c.panes.join(', ')}] — there is only one ${c.rendererKind} instance app-wide.`
        );
    }

    private reject(reason: string): PaneLayoutDispatchResult {
        console.warn(`[pane-layout] intent rejected: ${reason}`);
        return { ok: false, layout: this._layout, rejected: reason };
    }

    private notify(): void {
        for (const l of [...this.listeners]) {
            try {
                l(this._layout);
            } catch (e) {
                console.warn('[pane-layout] listener threw:', e);
            }
        }
    }
}

function sameLayout(a: PaneLayout, b: PaneLayout): boolean {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
        if ((a[k] ?? null) !== (b[k] ?? null)) return false;
    }
    return true;
}
