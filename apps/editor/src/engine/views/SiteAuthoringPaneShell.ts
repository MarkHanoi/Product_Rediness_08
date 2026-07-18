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

import { LEFT_PANE, RIGHT_PANE, type PaneId } from './paneViewModel';
import { PaneHost, MultiPaneController } from './PaneHost';

/** The shell handle: pane elements, the controller, and disposal. */
export interface SiteAuthoringPaneShell {
    readonly root: HTMLElement;
    readonly controller: MultiPaneController;
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

    // ── Divider drag (mirrors SplitViewManager._onDividerMove) ──────────────────
    let dragging = false;
    const applyFraction = (): void => {
        leftPaneEl.style.flex = `0 0 ${(leftFraction * 100).toFixed(3)}%`;
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

    let disposed = false;
    const dispose = (): void => {
        if (disposed) return;
        disposed = true;
        divider.removeEventListener('mousedown', onDown);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        window.removeEventListener('resize', onWindowResize);
        // Detach both hosted renderers before removing the DOM (the mounters re-home
        // their singleton — e.g. Cesium back to #container — on unmount).
        leftHost.unmount();
        rightHost.unmount();
        if (root.parentElement) root.parentElement.removeChild(root);
    };

    return {
        root,
        controller,
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
