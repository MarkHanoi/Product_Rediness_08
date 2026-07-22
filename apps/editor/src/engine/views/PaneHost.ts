// §FEAT-MULTI-PANE-VIEW-SYSTEM (L-412, C59 Phase 1b) — the LIVE renderer-agnostic
// pane host, built ON TOP of the Phase-1a pure model (`paneViewModel.ts`).
//
// WHAT THIS IS: a `PaneHost` is a DOM pane element + a lifecycle (`mount` /
// `unmount` / `resize`) that delegates to a **renderer mounter** — an object that
// knows how to attach ONE renderer's surface into a pane element. A
// `MultiPaneController` holds the pure `PaneLayout` (the reducer from Phase 1a) and
// drives the hosts: `assignView` / `swapPanes` compute the next layout via the pure
// algebra, then `applyLayout` diffs it against the live hosts and mounts / unmounts
// the affected mounters. This is the seam that dissolves the three founder-found
// incompatibilities (SVP owns the right pane / Cesium hard-targets `#container` /
// MapLibre `inset:0` overlay): every renderer is handed a PANE element to mount into
// (C59 §1.3 / §3).
//
// INVARIANTS honoured here (C59 §2):
//   • ONE instance per singleton renderer. A mounter RE-TARGETS the existing single
//     Cesium viewer / WebGPU device into the pane (it never constructs a second one).
//     `validatePaneLayout` is ASSERTED before every (re)mount — a conflicting layout
//     (two panes claiming `cesium`) is a programmer error and throws.
//   • Single rAF (P3). No `PaneHost` calls `requestAnimationFrame`. Renderers keep
//     using the ONE composition-root frame loop / their own request-render mode; the
//     host only re-parents + reflows.
//   • Command-driven layout (P6). The layout mutates ONLY through the pure reducer
//     (`assignViewToPane` / `swapPanes`); `applyLayout` is the imperative shell.
//
// This module is renderer-agnostic: it imports ZERO Cesium / MapLibre / THREE. The
// concrete mounters (which DO touch those singletons) are registered by the caller
// (GISAreaLayout builds the Cesium + MapLibre mounters and hands them in). That keeps
// PaneHost unit-testable in happy-dom with fake mounters (PaneHost.spec.ts).

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

/**
 * Attaches ONE renderer's surface into a pane element. A mounter owns a single
 * heavyweight/lightweight renderer instance and RE-TARGETS it — it must NEVER
 * construct a second instance of a singleton renderer (C59 §2.1).
 */
export interface PaneRendererMounter {
    /** The renderer this mounter drives (must match the hosted view's descriptor). */
    readonly rendererKind: RendererKind;
    /** Attach / re-parent the renderer surface into `paneEl`. May be async (Cesium mounts lazily). */
    mount(paneEl: HTMLElement): void | Promise<void>;
    /** Detach the renderer from its pane (hide / re-parent away). Not a dispose. */
    unmount(): void;
    /** Reflow the renderer to its pane's current size (divider drag / window resize). */
    resize(): void;
}

/**
 * A single pane: a DOM element + the view it currently hosts. The host does not
 * know HOW to draw — it delegates to the `PaneRendererMounter` resolved for the
 * assigned view's `RendererKind`.
 */
export class PaneHost {
    private _viewType: ViewType | null = null;
    private _mounter: PaneRendererMounter | null = null;

    constructor(
        readonly paneId: PaneId,
        private readonly el: HTMLElement,
    ) {
        // A pane element must be a positioned box so a re-parented `inset:0` renderer
        // surface (Cesium container, MapLibre overlay) fills it — never the whole page.
        if (!this.el.style.position) this.el.style.position = 'relative';
        this.el.style.overflow = 'hidden';
    }

    /** The pane's DOM element (renderers mount into this). */
    get element(): HTMLElement {
        return this.el;
    }

    /** The view currently hosted, or `null` when the pane is empty. */
    get viewType(): ViewType | null {
        return this._viewType;
    }

    /**
     * Mount `viewType` (via `mounter`) into this pane. Idempotent for the same
     * view+mounter (re-mounting the same singleton just resizes it). Unmounts the
     * previous view first when it differs. Returns the (possibly async) mount result.
     */
    mount(viewType: ViewType, mounter: PaneRendererMounter): void | Promise<void> {
        if (this._viewType === viewType && this._mounter === mounter) {
            mounter.resize();
            return;
        }
        this.unmount();
        this._viewType = viewType;
        this._mounter = mounter;
        return mounter.mount(this.el);
    }

    /** Detach the current view (no-op when empty). Leaves the pane element in place. */
    unmount(): void {
        if (this._mounter) {
            try {
                this._mounter.unmount();
            } catch (e) {
                console.warn(`[pane-host][${this.paneId}] unmount threw:`, e);
            }
        }
        this._mounter = null;
        this._viewType = null;
    }

    /** Reflow the hosted renderer to the pane's current size. */
    resize(): void {
        try {
            this._mounter?.resize();
        } catch (e) {
            console.warn(`[pane-host][${this.paneId}] resize threw:`, e);
        }
    }
}

/**
 * Drives a set of `PaneHost`s from the pure `PaneLayout` model. `assignView` /
 * `swapPanes` compute the next layout with the Phase-1a pure algebra (which MOVES a
 * singleton rather than cloning it), then `applyLayout` reconciles the live hosts.
 */
export class MultiPaneController {
    private _layout: PaneLayout;
    private readonly hosts = new Map<PaneId, PaneHost>();
    private readonly mounters = new Map<RendererKind, PaneRendererMounter>();

    constructor(
        hosts: PaneHost[],
        private readonly registry: Readonly<Record<ViewType, ViewTypeDescriptor>> = VIEW_TYPE_REGISTRY,
    ) {
        const layout: Record<PaneId, ViewType | null> = {};
        for (const h of hosts) {
            this.hosts.set(h.paneId, h);
            layout[h.paneId] = null;
        }
        this._layout = layout;
    }

    /** The current pane→view assignment (immutable snapshot of the pure state). */
    getLayout(): PaneLayout {
        return this._layout;
    }

    /** The pane element for `paneId` (for chrome that scopes itself to a pane). */
    getPaneElement(paneId: PaneId): HTMLElement | null {
        return this.hosts.get(paneId)?.element ?? null;
    }

    /** True when `viewType` is currently assigned to some pane (the live-host predicate). */
    hostsView(viewType: ViewType): boolean {
        return Object.values(this._layout).includes(viewType);
    }

    /** The pane currently hosting `viewType`, or null. */
    paneHosting(viewType: ViewType): PaneId | null {
        for (const [paneId, vt] of Object.entries(this._layout)) {
            if (vt === viewType) return paneId;
        }
        return null;
    }

    /**
     * Register the mounter for a `RendererKind`. There is exactly ONE mounter per
     * renderer (it owns the single instance); registering twice replaces it.
     */
    registerMounter(mounter: PaneRendererMounter): void {
        this.mounters.set(mounter.rendererKind, mounter);
    }

    /**
     * §C59 Phase 2 — the renderer kinds that actually have a mounter in THIS workspace.
     * The per-pane view picker asks for this so a view whose renderer is not wired here
     * is shown DISABLED WITH A REASON, instead of being offered and then failing at
     * mount with a console warning and an empty pane (C59 §4 Phase 2: disable-or-explain).
     */
    registeredKinds(): ReadonlySet<RendererKind> {
        return new Set(this.mounters.keys());
    }

    /**
     * Assign `viewType` (or `null` to clear) to `paneId` through the pure reducer,
     * then reconcile the live hosts. Because the reducer MOVES a singleton out of any
     * other pane, this is the safe "swap the 3D Site into either pane" primitive.
     */
    assignView(paneId: PaneId, viewType: ViewType | null): void | Promise<void> {
        const next = assignViewToPane(this._layout, paneId, viewType, this.registry);
        return this.applyLayout(next);
    }

    /** Swap the two panes' views (pure reducer) + reconcile. */
    swap(a: PaneId, b: PaneId): void | Promise<void> {
        return this.applyLayout(swapPanes(this._layout, a, b));
    }

    /**
     * Reconcile the live hosts to `next`. Asserts the singleton invariant FIRST
     * (`validatePaneLayout`) — a double-mount layout is a programmer error and throws
     * before any renderer is touched. Then, for every pane whose view changed, mount
     * / unmount the affected mounter. Returns a Promise when any mounter is async.
     */
    applyLayout(next: PaneLayout): void | Promise<void> {
        const check = validatePaneLayout(next, this.registry);
        if (!check.ok) {
            throw new Error(
                `[pane-host] refusing to apply a layout that double-mounts a singleton renderer: ` +
                check.conflicts
                    .map((c) => `${c.rendererKind} in [${c.panes.join(', ')}]`)
                    .join('; '),
            );
        }

        // TWO-PASS reconcile. Pass 1 UNMOUNTS every pane whose view changed — BEFORE
        // Pass 2 mounts the new views. This ordering is load-bearing for a MOVING
        // SINGLETON: when the 3D Site moves right→left, the ONE Cesium mounter is shared
        // by both hosts, so the vacated (right) pane's `unmount` MUST run before the
        // (left) pane's `mount` — otherwise the mount re-targets Cesium into the left
        // pane and then the right pane's late unmount re-homes it to #container + hides
        // it (the exact clobber a single-pass reconcile caused). Unmount-then-mount is
        // the correct order for re-targeting a shared instance.
        for (const host of this.hosts.values()) {
            const prev = this._layout[host.paneId] ?? null;
            const want = next[host.paneId] ?? null;
            if (prev !== want && prev != null) host.unmount();
        }

        const pending: Array<Promise<void>> = [];
        for (const host of this.hosts.values()) {
            const prev = this._layout[host.paneId] ?? null;
            const want = next[host.paneId] ?? null;
            if (prev === want || want == null) continue;

            const mounter = this.mounters.get(this.registry[want].rendererKind);
            if (!mounter) {
                console.warn(
                    `[pane-host][${host.paneId}] no mounter registered for '${want}' ` +
                    `(${this.registry[want].rendererKind}) — pane left empty.`,
                );
                continue;
            }
            const r = host.mount(want, mounter);
            if (r instanceof Promise) pending.push(r);
        }
        // Commit the new pure state only after the (sync part of the) reconcile.
        this._layout = next;
        return pending.length > 0 ? Promise.all(pending).then(() => undefined) : undefined;
    }

    /** Reflow one pane (or all) to their current size — divider drag / window resize. */
    resize(paneId?: PaneId): void {
        if (paneId) {
            this.hosts.get(paneId)?.resize();
            return;
        }
        for (const host of this.hosts.values()) host.resize();
    }
}
