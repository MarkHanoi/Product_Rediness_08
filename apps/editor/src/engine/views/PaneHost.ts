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
    /**
     * §PANE-PLACEMENT-AFTER-MODE-SWITCH (L-12988 / L-12992) — MOVE the ONE live surface this
     * mounter owns into `paneEl`, keeping it alive. Optional.
     *
     * ⭐ WHY THIS IS NOT `unmount()` + `mount()`. The two-pass reconcile below unmounts a
     * vacated pane BEFORE mounting the new one, which is correct for a re-targeting mounter
     * and WRONG for one whose `unmount` is a teardown. `GISAreaLayout`'s MapLibre mounter
     * disposes the 2D map on unmount — by design, that is how the map goes away at
     * generate-time — so a pane-to-pane MOVE destroyed the map, refetched every tile, and
     * dropped `window.pryzmBoundaryDrawSurfaceReadyAt` (L-12992: *"map2d: disposed"* followed
     * by 47 `draw idle tick — waiting (surface-not-ready)` retries). `relocate` lets the
     * controller say MOVING rather than LEAVING, so departure and relocation stop sharing one
     * verb. When absent, a move falls back to unmount + mount exactly as before.
     */
    relocate?(paneEl: HTMLElement): void | Promise<void>;
    /**
     * §PANE-PLACEMENT-AFTER-MODE-SWITCH (L-12988) — is this mounter's surface ACTUALLY inside
     * `paneEl` right now? Optional, and it is a READING off the document, never a memory of the
     * last call: the whole defect this answers is a container that ended up parented to one
     * pane while the layout said another.
     *
     * A mounter that cannot answer is left alone by {@link MultiPaneController.reassertPlacement}
     * — deliberately. Re-mounting "just in case" is only safe for a mounter that re-targets,
     * and the controller cannot tell which those are.
     *
     * ⛔ `undefined` means NOT-YET-KNOWN, and it is a THIRD answer, not a falsy `false`
     * (§UNKNOWN-IS-NOT-MISPLACED, L-13053). `GISAreaLayout`'s MapLibre mounter used to answer
     * `map2dHandle?.isPlacedIn(paneEl) ?? false`, so a surface still inside its dynamic
     * `import()` reported itself POSITIVELY MISPLACED — and the correction branch below then
     * started a SECOND mount of the one map, racing the first (§L-412's second-map risk) and
     * printing `'site-map-2d' (maplibre) is NOT in the pane the layout gives it` on every
     * settle pass until the import landed. A mounter that cannot answer yet must say so.
     */
    isPlacedIn?(paneEl: HTMLElement): boolean | undefined;
}

/** What one pane's placement re-assertion did. Returned so a caller (and a spec) can see it. */
export interface PanePlacementCheck {
    readonly paneId: PaneId;
    readonly viewType: ViewType | null;
    /** The mounter could not report where its surface is — nothing was asserted. */
    readonly unknown: boolean;
    /** The surface was somewhere else and has been put back. */
    readonly corrected: boolean;
}

/**
 * A single pane: a DOM element + the view it currently hosts. The host does not
 * know HOW to draw — it delegates to the `PaneRendererMounter` resolved for the
 * assigned view's `RendererKind`.
 */
export class PaneHost {
    private _viewType: ViewType | null = null;
    private _mounter: PaneRendererMounter | null = null;
    /**
     * §PANE-PLACEMENT-AFTER-MODE-SWITCH (L-12988) — which mount attempt is CURRENT.
     * Bumped by every mount / unmount / release, so an ASYNC mount that resolves after the
     * layout has moved on can recognise that it is stale. Without it, the Cesium mounter's
     * `await awaitCesiumReady()` could resolve into a pane the layout had already vacated
     * and re-parent the single container there — permanently, because nothing looked again.
     */
    private _mountToken = 0;
    /** Installed by `MultiPaneController` — "this mounter finished mounting too late". */
    onSupersededMount: ((mounter: PaneRendererMounter) => void) | null = null;

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
    mount(
        viewType: ViewType,
        mounter: PaneRendererMounter,
        opts: { readonly relocate?: boolean } = {},
    ): void | Promise<void> {
        if (this._viewType === viewType && this._mounter === mounter) {
            mounter.resize();
            return;
        }
        this.unmount();
        this._viewType = viewType;
        this._mounter = mounter;
        const token = ++this._mountToken;

        // §PANE-PLACEMENT-AFTER-MODE-SWITCH — a MOVE of a live singleton surface. The
        // controller has already decided this is a relocation (the same mounter is wanted
        // here and was just released by another pane), so the surface is alive and only its
        // parent changes. Synchronous by contract: there is nothing to construct.
        if (opts.relocate && typeof mounter.relocate === 'function') {
            try {
                // §UNKNOWN-IS-NOT-MISPLACED (L-13053) — a relocation that has to BUILD its
                // surface (the map was disposed, so `relocate` falls back to opening it) is
                // async, and its promise is returned so `applyLayout` waits for it before the
                // authoritative placement pass. Dropping it is what made that pass run against
                // a surface that did not exist yet.
                const r = mounter.relocate(this.el);
                return r instanceof Promise ? r : undefined;
            } catch (e) {
                console.warn(`[pane-host][${this.paneId}] relocate threw — falling back to mount:`, e);
            }
        }
        return this._startMount(token, mounter);
    }

    private _startMount(token: number, mounter: PaneRendererMounter): void | Promise<void> {
        const r = mounter.mount(this.el);
        if (!(r instanceof Promise)) return r;
        // ⭐ THE ONE PLACEMENT PASS, AFTER THE MOUNT HAS SETTLED — not a race against it.
        return r.then(() => {
            if (token === this._mountToken && this._mounter === mounter) {
                // Still ours. The pane box may have settled DURING the await (a mode switch
                // rewrites `#container`'s width while Cesium is still constructing), so make
                // the renderer measure the box it actually landed in rather than the one it
                // was handed. One reflow, at the end — which is also what stops the caller
                // needing to guess when it is safe to look.
                this.resize();
                return;
            }
            console.warn(
                `[pane-host][${this.paneId}] §PANE-PLACEMENT-AFTER-MODE-SWITCH: a mount ` +
                `resolved AFTER the layout moved on (${mounter.rendererKind}). Its surface is ` +
                'in a pane that no longer owns it; re-asserting placement from the committed ' +
                'layout rather than leaving the two disagreeing.',
            );
            this.onSupersededMount?.(mounter);
        });
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
        this._mountToken++;
    }

    /**
     * §PANE-PLACEMENT-AFTER-MODE-SWITCH — give the view up WITHOUT tearing its surface down,
     * because it is about to be relocated into another pane by the same mounter. The pane
     * becomes empty in the host's bookkeeping; the surface stays alive and moves.
     */
    releaseForMove(): void {
        this._mounter = null;
        this._viewType = null;
        this._mountToken++;
    }

    /**
     * §PANE-PLACEMENT-AFTER-MODE-SWITCH — invalidate any mount still in flight WITHOUT
     * changing what this pane hosts. Called by `MultiPaneController.dispose()`: the pane
     * elements are about to be detached, so a mount that resolves afterwards must recognise
     * itself as stale and send its surface home rather than parking it in a node no longer
     * in the document — where it would be invisible for the rest of the session, with the
     * viewport's mount-parent reference pointing at it.
     */
    markSuperseded(): void {
        this._mountToken++;
    }

    /**
     * §PANE-PLACEMENT-AFTER-MODE-SWITCH — assert that the hosted renderer's surface is
     * ACTUALLY in this pane, and put it back if it is not. Idempotent, and cheap in the
     * normal case (one DOM parent comparison, then a reflow).
     *
     * ⛔ It only acts on a POSITIVE report of misplacement. A mounter with no `isPlacedIn`
     * is reflowed and left alone: `mount()` is not universally idempotent (the MapLibre
     * mounter's opens a map), so re-mounting on a hunch is how you get two of something.
     */
    reassertPlacement(): PanePlacementCheck {
        const viewType = this._viewType;
        const mounter = this._mounter;
        if (!mounter || viewType == null) {
            return { paneId: this.paneId, viewType: null, unknown: false, corrected: false };
        }
        if (typeof mounter.isPlacedIn !== 'function') {
            this.resize();
            return { paneId: this.paneId, viewType, unknown: true, corrected: false };
        }
        let placed: boolean | undefined = true;
        try {
            placed = mounter.isPlacedIn(this.el);
        } catch (e) {
            console.warn(`[pane-host][${this.paneId}] isPlacedIn threw — treating as unknown:`, e);
            this.resize();
            return { paneId: this.paneId, viewType, unknown: true, corrected: false };
        }
        // §UNKNOWN-IS-NOT-MISPLACED (L-13053) — the mounter's surface is still being built, so
        // it can say neither "here" nor "elsewhere". That is the SAME case as a mounter with no
        // predicate at all: reflow, correct nothing. Reading it as `false` is what turned one
        // in-flight mount into a second one.
        if (placed === undefined) {
            this.resize();
            return { paneId: this.paneId, viewType, unknown: true, corrected: false };
        }
        if (placed) {
            this.resize();
            return { paneId: this.paneId, viewType, unknown: false, corrected: false };
        }
        console.warn(
            `[pane-host][${this.paneId}] §PANE-PLACEMENT-AFTER-MODE-SWITCH: '${viewType}' ` +
            `(${mounter.rendererKind}) is NOT in the pane the layout gives it — putting it back.`,
        );
        try {
            if (typeof mounter.relocate === 'function') void mounter.relocate(this.el);
            else void mounter.mount(this.el);
        } catch (e) {
            console.warn(`[pane-host][${this.paneId}] placement correction threw:`, e);
            return { paneId: this.paneId, viewType, unknown: false, corrected: false };
        }
        this.resize();
        return { paneId: this.paneId, viewType, unknown: false, corrected: true };
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

    /** §PANE-PLACEMENT-AFTER-MODE-SWITCH — true once the shell that owns these panes is gone. */
    private _disposed = false;

    constructor(
        hosts: PaneHost[],
        private readonly registry: Readonly<Record<ViewType, ViewTypeDescriptor>> = VIEW_TYPE_REGISTRY,
    ) {
        const layout: Record<PaneId, ViewType | null> = {};
        for (const h of hosts) {
            this.hosts.set(h.paneId, h);
            layout[h.paneId] = null;
            // A late-resolving mount reports here rather than to the pane it landed in: only
            // the controller can see the COMMITTED layout and every other pane, which is what
            // deciding between "put it where it belongs" and "it belongs nowhere" needs.
            h.onSupersededMount = (mounter) => this.reconcileSupersededMount(mounter);
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
        //
        // ⭐ §PANE-PLACEMENT-AFTER-MODE-SWITCH (L-12992) — A MOVE IS NOT A DEPARTURE. The
        // ordering above is right and the VERB was wrong: a mounter whose `unmount` is a
        // teardown (the MapLibre one disposes the 2D map — deliberately, that is how the
        // map goes away at generate-time) had its surface destroyed by a pane-to-pane move,
        // then rebuilt from scratch in the other pane. The founder measured the cost:
        // `map2d: disposed` with nothing replacing it, a black pane, and a draw watchdog
        // spinning on a readiness stamp the disposer had cleared. So when the SAME renderer
        // kind is still wanted somewhere in `next` and its mounter can `relocate`, pass 1
        // RELEASES the pane without unmounting and pass 2 relocates the live surface in.
        const keptKinds = new Set<RendererKind>();
        for (const paneId of Object.keys(next)) {
            const vt = next[paneId] ?? null;
            if (vt != null) keptKinds.add(this.registry[vt].rendererKind);
        }
        const relocating = new Set<RendererKind>();

        for (const host of this.hosts.values()) {
            const prev = this._layout[host.paneId] ?? null;
            const want = next[host.paneId] ?? null;
            if (prev === want || prev == null) continue;
            const prevKind = this.registry[prev].rendererKind;
            const prevMounter = this.mounters.get(prevKind);
            if (prevMounter && keptKinds.has(prevKind) && typeof prevMounter.relocate === 'function') {
                relocating.add(prevKind);
                host.releaseForMove();
                continue;
            }
            host.unmount();
        }

        const pending: Array<Promise<void>> = [];
        for (const host of this.hosts.values()) {
            const prev = this._layout[host.paneId] ?? null;
            const want = next[host.paneId] ?? null;
            if (prev === want || want == null) continue;

            const kind = this.registry[want].rendererKind;
            const mounter = this.mounters.get(kind);
            if (!mounter) {
                console.warn(
                    `[pane-host][${host.paneId}] no mounter registered for '${want}' ` +
                    `(${kind}) — pane left empty.`,
                );
                continue;
            }
            const r = host.mount(want, mounter, { relocate: relocating.has(kind) });
            if (r instanceof Promise) pending.push(r);
        }
        // Commit the new pure state only after the (sync part of the) reconcile.
        this._layout = next;
        if (pending.length === 0) return undefined;
        // ⭐ ONE AUTHORITATIVE PLACEMENT PASS once every async mounter has settled. This is
        // the half the founder's report turns on: an async mount that resolves into a pane
        // the layout has since changed used to leave placement and layout disagreeing with
        // nothing to look again. Now the LAST thing a layout change does is assert, from the
        // committed layout, that each surface is where that layout puts it.
        return Promise.all(pending).then(() => {
            this.reassertPlacement();
        });
    }

    /**
     * §PANE-PLACEMENT-AFTER-MODE-SWITCH (L-12988) — ⭐ THE ONE AUTHORITATIVE PLACEMENT PASS.
     *
     * For every pane, assert that the renderer the COMMITTED layout gives it is actually in
     * that pane's element, and put it back when it is not. Call this after any transition
     * that can re-write the shell's geometry underneath a mount that was already in flight —
     * a workspace mode switch is the measured case (L-12988: `reparentContainerTo
     * #pryzm-pane-right` landing while the picture was in the other half of the screen).
     *
     * ⛔ It is NOT a re-mount. Every correction goes through `relocate` where the mounter has
     * one, and a mounter that cannot report its own placement is only reflowed — so this can
     * never mint a second Cesium viewer or a second MapLibre map, which is the constraint
     * §L-412 exists to hold.
     */
    reassertPlacement(): PanePlacementCheck[] {
        if (this._disposed) return [];
        const out: PanePlacementCheck[] = [];
        for (const host of this.hosts.values()) out.push(host.reassertPlacement());
        return out;
    }

    /**
     * §PANE-PLACEMENT-AFTER-MODE-SWITCH — a mounter finished mounting into a pane that had
     * already moved on. Decide from the COMMITTED layout, never from where it landed.
     */
    private reconcileSupersededMount(mounter: PaneRendererMounter): void {
        // The shell is gone: the surface is now parented into a DETACHED pane element and
        // would be invisible for the rest of the session. Send it home.
        if (this._disposed) {
            try { mounter.unmount(); } catch (e) {
                console.warn('[pane-host] late unmount after dispose threw:', e);
            }
            return;
        }
        // Still wanted somewhere? Put it in the pane the layout names.
        for (const host of this.hosts.values()) {
            const want = this._layout[host.paneId] ?? null;
            if (want == null) continue;
            if (this.mounters.get(this.registry[want].rendererKind) !== mounter) continue;
            host.reassertPlacement();
            return;
        }
        // Wanted nowhere — the layout vacated it while it was constructing.
        try { mounter.unmount(); } catch (e) {
            console.warn('[pane-host] late unmount threw:', e);
        }
    }

    /**
     * Tear the controller down with the shell that owns it. After this a late-resolving
     * mount re-homes its surface instead of parking it in a detached pane element, and
     * `reassertPlacement()` is a no-op. Idempotent; does NOT unmount the hosts (the shell's
     * own dispose does that, in its own order).
     */
    dispose(): void {
        this._disposed = true;
        // ⛔ The reporting hooks stay INSTALLED on purpose. Clearing them here is what a
        // teardown normally does and it would be exactly wrong: the only thing that can still
        // happen after this point is a mount resolving late, and that is precisely the case
        // that needs to be heard — `reconcileSupersededMount` re-homes it. Invalidating each
        // host's token is what makes such a mount announce itself.
        for (const host of this.hosts.values()) host.markSuperseded();
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
