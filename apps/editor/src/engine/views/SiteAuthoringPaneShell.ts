// §FEAT-MULTI-PANE-VIEW-SYSTEM (L-412, C59 Phase 1b) — the DOM geometry for the
// site-authoring split: a LEFT pane + a draggable divider + a RIGHT pane, tiled
// inside a host element (default `#container`). This is the renderer-agnostic pane
// GEOMETRY the founder default layout (2D map LEFT · 3D Site RIGHT) lives in.
//
// The geometry (ratio + draggable divider + resize fan-out) MIRRORS the proven
// `SplitViewManager` split (`_buildDOM` / `_positionDivider` / `_onDividerMove`,
// SplitViewManager.ts:350–516) — but SplitViewManager's pane is hard-wired to a
// Canvas2D plan surface, so it cannot host Cesium/MapLibre. Rather than destabilise
// that legacy owner (its consolidation is C59 Phase 4), Phase 1b builds this minimal
// self-contained shell that hosts ARBITRARY renderers via the `PaneHost` abstraction.
// The panes TILE (no overlap, C59 §1.3): each renderer surface is a positioned child
// that fills its pane. No `requestAnimationFrame` here (P3) — divider drag only
// re-sizes; the renderers reflow via their `PaneHost.resize()`.

import { EMPTY_LR_LAYOUT, LEFT_PANE, RIGHT_PANE, type PaneId } from './paneViewModel';
import { PaneHost, MultiPaneController } from './PaneHost';
import { PaneLayoutStore } from './paneLayoutStore';
import { mountPaneViewPicker, type PaneViewPickerHandle } from './PaneViewPicker';

/** The shell handle: pane elements, the store (the ONE write path), and disposal. */
export interface SiteAuthoringPaneShell {
    readonly root: HTMLElement;
    readonly controller: MultiPaneController;
    /**
     * §C59 Phase 2 — the view-state store. EVERY layout change (including a caller
     * applying a model-derived default) must go through `store.dispatch(...)`, not
     * `controller.applyLayout(...)`: the controller is the imperative shell the store
     * drives, and a caller that writes to it directly leaves the store — and therefore
     * every pane picker — stale (C59 §2 invariant 3).
     */
    readonly store: PaneLayoutStore;
    /** The pane element for `left` / `right` (for pane-scoped chrome, e.g. the facts card). */
    getPaneElement(paneId: PaneId): HTMLElement | null;
    /** Tear the shell down (removes the DOM + listeners). Idempotent. */
    dispose(): void;
    /** True once disposed. */
    readonly isDisposed: boolean;
}

export interface SiteAuthoringPaneShellOptions {
    /** Where to mount the split (defaults to `#container`). */
    parent?: HTMLElement;
    /** Initial LEFT-pane fraction of the width (0.2–0.8). Defaults to 0.5. */
    initialLeftFraction?: number;
    /** z-index for the shell root (defaults to just under Cesium's CESIUM_Z=15). */
    zIndex?: number;
    /** Called on every divider drag / resize so the controller can reflow renderers. */
    onResize?: () => void;
    /**
     * §C59 Phase 2 — mount the per-pane view picker on every pane (default true).
     * Off only for tests that want bare geometry.
     */
    viewPicker?: boolean;
}

const MIN_FRACTION = 0.2;
const MAX_FRACTION = 0.8;

/**
 * Build the two-pane site-authoring shell. Returns the pane elements wrapped in a
 * `MultiPaneController` (with `left` + `right` `PaneHost`s) — the caller registers
 * the renderer mounters and applies the founder default layout via the pure model
 * (`siteAuthoringDefaultLayout()`).
 */
export function mountSiteAuthoringPaneShell(
    opts: SiteAuthoringPaneShellOptions = {},
): SiteAuthoringPaneShell {
    const parent = opts.parent ?? document.getElementById('container') ?? document.body;
    const zIndex = opts.zIndex ?? 14; // below Cesium's own container z (15) — it fills its pane.
    let leftFraction = clampFraction(opts.initialLeftFraction ?? 0.5);

    // ── Root (tiles the parent viewport) ────────────────────────────────────────
    const root = document.createElement('div');
    root.id = 'pryzm-site-authoring-panes';
    root.setAttribute('data-testid', 'site-authoring-panes');
    Object.assign(root.style, {
        position: 'absolute',
        inset: '0',
        display: 'flex',
        flexDirection: 'row',
        zIndex: String(zIndex),
        background: '#0b0b12',
    } satisfies Partial<CSSStyleDeclaration>);

    // Ensure the parent is a positioning context so `inset:0` fills it.
    if (parent instanceof HTMLElement && !parent.style.position) {
        parent.style.position = 'relative';
    }

    const leftPaneEl = document.createElement('div');
    leftPaneEl.id = 'pryzm-pane-left';
    leftPaneEl.setAttribute('data-pane', LEFT_PANE);
    Object.assign(leftPaneEl.style, {
        position: 'relative',
        overflow: 'hidden',
        flex: `0 0 ${(leftFraction * 100).toFixed(3)}%`,
        minWidth: '0',
        height: '100%',
    } satisfies Partial<CSSStyleDeclaration>);

    const divider = document.createElement('div');
    divider.id = 'pryzm-pane-divider';
    divider.setAttribute('data-testid', 'pane-divider');
    Object.assign(divider.style, {
        position: 'relative',
        flex: '0 0 6px',
        cursor: 'col-resize',
        background: 'linear-gradient(180deg,#2a2340,#6600FF)',
        zIndex: '2',
        userSelect: 'none',
    } satisfies Partial<CSSStyleDeclaration>);

    const rightPaneEl = document.createElement('div');
    rightPaneEl.id = 'pryzm-pane-right';
    rightPaneEl.setAttribute('data-pane', RIGHT_PANE);
    Object.assign(rightPaneEl.style, {
        position: 'relative',
        overflow: 'hidden',
        flex: '1 1 0',
        minWidth: '0',
        height: '100%',
    } satisfies Partial<CSSStyleDeclaration>);

    root.appendChild(leftPaneEl);
    root.appendChild(divider);
    root.appendChild(rightPaneEl);
    parent.appendChild(root);

    const leftHost = new PaneHost(LEFT_PANE, leftPaneEl);
    const rightHost = new PaneHost(RIGHT_PANE, rightPaneEl);
    const controller = new MultiPaneController([leftHost, rightHost]);

    // ── §C59 Phase 2 — the view-state store (the ONE write path) + per-pane pickers ──
    // The store owns the layout and drives the controller; the pickers only dispatch
    // intents into it (C59 §2 invariant 3). The shell itself never assigns a view.
    const store = new PaneLayoutStore(EMPTY_LR_LAYOUT, { applier: controller });

    // ── Divider drag (mirrors SplitViewManager._onDividerMove) ──────────────────
    let dragging = false;
    const applyFraction = (): void => {
        // §C59 Phase 2 — FULL SCREEN is a LAYOUT fact, not a second mechanism: when
        // exactly one pane holds a view (the `solo` / "empty this pane" intents), the
        // vacated pane and the divider collapse and the surviving pane fills the shell —
        // carrying its picker with it, which is how the founder's "in each view, split
        // OR complete, change to another view" holds in full screen too.
        const layout = store.getLayout();
        const leftEmpty = layout[LEFT_PANE] == null;
        const rightEmpty = layout[RIGHT_PANE] == null;
        const solo = leftEmpty !== rightEmpty; // exactly one occupied → full screen.

        divider.style.display = solo ? 'none' : '';
        if (solo && leftEmpty) {
            leftPaneEl.style.display = 'none';
            rightPaneEl.style.display = '';
            rightPaneEl.style.flex = '1 1 0';
        } else if (solo && rightEmpty) {
            rightPaneEl.style.display = 'none';
            leftPaneEl.style.display = '';
            leftPaneEl.style.flex = '1 1 100%';
        } else {
            leftPaneEl.style.display = '';
            rightPaneEl.style.display = '';
            rightPaneEl.style.flex = '1 1 0';
            leftPaneEl.style.flex = `0 0 ${(leftFraction * 100).toFixed(3)}%`;
        }
    };
    const onDown = (e: MouseEvent): void => {
        dragging = true;
        e.preventDefault();
        document.body.style.userSelect = 'none';
    };
    const onMove = (e: MouseEvent): void => {
        if (!dragging) return;
        const rect = root.getBoundingClientRect();
        if (rect.width <= 0) return;
        leftFraction = clampFraction((e.clientX - rect.left) / rect.width);
        applyFraction();
        // Reflow the hosted renderers to the new pane sizes (no re-fly — C59 §3.4).
        controller.resize();
        opts.onResize?.();
    };
    const onUp = (): void => {
        if (!dragging) return;
        dragging = false;
        document.body.style.userSelect = '';
        controller.resize();
        opts.onResize?.();
    };
    divider.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    // ── Window resize → reflow both renderers ────────────────────────────────────
    const onWindowResize = (): void => {
        controller.resize();
        opts.onResize?.();
    };
    window.addEventListener('resize', onWindowResize);

    // ── Layout changes → re-tile (split ⇄ full screen) + reflow the renderers ────
    // The store notifies AFTER the controller has mounted/unmounted, so the renderer
    // that just moved is reflowed to the box it actually ended up in. No rAF (P3): a
    // flex change is synchronous and each mounter's `resize()` is its own reflow
    // primitive (Cesium's one-shot settle lives inside `reflowContainer()`).
    const unsubscribeLayout = store.subscribe(() => {
        applyFraction();
        controller.resize();
        opts.onResize?.();
    });

    // ── §C59 Phase 2 — the per-pane view picker, on EVERY pane ──────────────────
    // ONE component, mounted per pane, content derived from VIEW_TYPE_REGISTRY. This is
    // the standardised switcher the founder asked for; it replaces per-surface bespoke
    // toggles for pane views (C59 §4 Phase 2, absorbing L-405).
    const pickers: PaneViewPickerHandle[] = [];
    if (opts.viewPicker !== false) {
        pickers.push(
            mountPaneViewPicker({ paneId: LEFT_PANE, paneEl: leftPaneEl, store, corner: 'top-left' }),
            mountPaneViewPicker({ paneId: RIGHT_PANE, paneEl: rightPaneEl, store, corner: 'top-right' }),
        );
    }

    let disposed = false;
    const dispose = (): void => {
        if (disposed) return;
        disposed = true;
        divider.removeEventListener('mousedown', onDown);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        window.removeEventListener('resize', onWindowResize);
        unsubscribeLayout();
        for (const p of pickers) {
            try { p.dispose(); } catch { /* chrome already gone */ }
        }
        // Detach both hosted renderers before removing the DOM (the mounters re-home
        // their singleton — e.g. Cesium back to #container — on unmount).
        leftHost.unmount();
        rightHost.unmount();
        if (root.parentElement) root.parentElement.removeChild(root);
    };

    return {
        root,
        controller,
        store,
        getPaneElement: (paneId) => controller.getPaneElement(paneId),
        dispose,
        get isDisposed() {
            return disposed;
        },
    };
}

function clampFraction(f: number): number {
    if (!Number.isFinite(f)) return 0.5;
    return Math.max(MIN_FRACTION, Math.min(MAX_FRACTION, f));
}
