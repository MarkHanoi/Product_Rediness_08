/**
 * viewSwitcherOnView.ts — §VIEW-SWITCHER-ON-THE-VIEW (founder 2026-09-06 · L-12982)
 *
 * Layer Affected:  UI — site / shell chrome (L7)
 * File:            apps/editor/src/ui/site/viewSwitcherOnView.ts
 * Strategy:        STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §24.1 item 2 · §25.0
 * Contracts:       C06 §15 (float budget) · C06 §6.1 (one chrome language) ·
 *                  C19 §5.6 (a panel is a HOST; the action is the AUTHORITY) ·
 *                  C59 §1.3 / §2 (the pane shell owns pane layout)
 * Issue log:       L-12982
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ASK, VERBATIM
 * ─────────────────────────────────────────────────────────────────────────────
 * *"we DON'T need the plan view / 3D view etc. on the panel — that can be in the
 * panel with buttons and SHOULD BE CENTRED ON THE VIEW — and the user can decide
 * to have only the 2D Site Plan view, 2D Satellite, 3D Site, 3D PRYZM, or 3D Globe
 * — OR SPLIT — in this case THE SPLIT SHALL BE HORIZONTAL, keeping the split views
 * on the LEFT and the panel on the RIGHT."*
 *
 * with a screenshot boxing, in blue, the four full-width buttons stacked INSIDE the
 * right-hand Parcel Law panel.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ THIS FILE ADDS NO SEVENTH VIEW AND NO SECOND SWITCHER
 * ─────────────────────────────────────────────────────────────────────────────
 * The six view options are NOT defined here. They come from `viewPanelOptions()`
 * (lane VIEW-PANEL-PER-PANE, `engine/views/viewPanelOptions.ts`) via the control
 * that already renders them — `mountViewSegmentSwitcher`, which is a HOST of
 * `GIS_ACTIONS` and contributes no handler of its own. This file MOVES that
 * control from the panel to the view and adds ONE thing the view definition
 * deliberately does not carry:
 *
 *   ⭐ SPLIT IS A LAYOUT CHOICE, NOT A VIEW. `viewPanelOptions.ts` says so in its
 *   own header — its six rows answer "WHICH view", and the founder's split answer
 *   is "BOTH, side by side". There is no `ViewType` for it and there must not be:
 *   C59's `PaneLayoutStore` owns which view is in which pane, and the shell that
 *   realises the two-pane geometry is `SiteAuthoringPaneShell`. So SPLIT here is a
 *   dispatch of the DECLARED global `pryzmMountSiteAuthoringPanes`, the same entry
 *   point onboarding uses, and nothing about pane layout is re-implemented.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ WHY "HORIZONTAL, VIEWS LEFT, PANEL RIGHT" NEEDS NO NEW GEOMETRY
 * ─────────────────────────────────────────────────────────────────────────────
 * Measured rather than assumed:
 *   · `SiteAuthoringPaneShell` builds `display: flex; flex-direction: row` — two
 *     panes side by side, which is the founder's "horizontal".
 *   · `GISAreaLayout` mounts it with `{ parent: container }` — INSIDE `#container`,
 *     as `position: absolute; inset: 0`.
 *   · In the Analysis workspace `#container` IS the left region: the mode registry
 *     row says `canvas: 'half'`, `WorkspaceController._applyLayout` writes
 *     `#container.style.width`, and `#anl-surface` is `position: fixed; right: 0`.
 * So the split lands in the left region with the panel beside it, and the
 * §SHELL-SPLIT-DRAG handle (L-12980) resizes the two together. The founder's
 * layout sentence is satisfied by the composition, not by a new container.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠ WHAT THIS CANNOT READ, AND SAYS SO
 * ─────────────────────────────────────────────────────────────────────────────
 * There is no declared reader for "is the split up?". `pryzmGetSiteViewState`
 * carries `segment` / `formaMode` / `buildingFidelity` (+ `basemap`) and none of
 * them reports pane layout. Rather than invent a predicate over fields that do not
 * mean that — the C84 EI-1b failure this repo pays for most — the SPLIT control
 * OBSERVES the shell's own committed root id (`#pryzm-site-authoring-panes`). That
 * is a fact about the document, stated as one; the button's title says it is read
 * from the DOM and not from a snapshot, and the missing snapshot field is named in
 * this lane's report as a seam owned by `GISAreaLayout`.
 *
 * P4 — no `(window as any)`: the capability host is a typed parameter. P6 — no
 * store writes; SPLIT dispatches a declared entry point that owns the store.
 * P3 — no `requestAnimationFrame`. P8 — one span per exported function.
 */

import { trace } from '@opentelemetry/api';
import type { GisCapabilityHost } from '../gis/gisActionRegistry';
import {
    mountViewSegmentSwitcher,
    type ViewSegmentSwitcherHandle,
} from './viewSegmentSwitcher';

const _tracer = trace.getTracer('pryzm.site.viewSwitcherOnView');

/** `data-testid` on the on-view bar root. */
export const VIEW_SWITCHER_ON_VIEW_TESTID = 'view-switcher-on-view';
/** `data-testid` on the SPLIT control. */
export const VIEW_SWITCHER_SPLIT_TESTID = 'view-switcher-split';
/** The id of the site-authoring split shell's root — `SiteAuthoringPaneShell` mints it. */
export const SITE_AUTHORING_PANES_ROOT_ID = 'pryzm-site-authoring-panes';

/**
 * The layout capabilities this bar dispatches. Both are DECLARED typed globals
 * (`types/globals.d.ts`), registered by `GISAreaLayout`; onboarding drives the same pair.
 */
export interface SplitLayoutHost {
    pryzmMountSiteAuthoringPanes?: () => void;
    pryzmUnmountSiteAuthoringPanes?: () => void;
}

/** The whole host this bar reads: the GIS view actions PLUS the two split entry points. */
export type ViewSwitcherOnViewHost = GisCapabilityHost & SplitLayoutHost;

export interface ViewSwitcherOnViewOptions {
    /** Production: `window`. Injected so a spec drives real behaviour with recorders. */
    readonly host: ViewSwitcherOnViewHost;
    /** Where the bar is appended. Defaults to `document.body` — it is fixed shell chrome. */
    readonly parent?: HTMLElement;
    /** Production: `mountViewSegmentSwitcher` — the ONE renderer of the six options. */
    readonly mountSwitcher?: (host: GisCapabilityHost) => ViewSegmentSwitcherHandle;
    /**
     * Is the site-authoring split on screen? Defaults to observing the shell's own root id.
     * A reading, never a memory — see the header.
     */
    readonly isSplitOpen?: () => boolean;
}

export interface ViewSwitcherOnViewHandle {
    readonly element: HTMLElement;
    /** Re-derive the six segments AND the split state. Cheap; call on every activation. */
    repaint(): void;
    dispose(): void;
}

/** The sentence on a SPLIT control that cannot dispatch. Named, never a silent no-op. */
export const SPLIT_UNAVAILABLE_TEXT =
    'Split is not available from here in this session: the site views have not registered '
    + 'pryzmMountSiteAuthoringPanes. Open the site once from the GIS panel, then return.';

/** Observe the split shell. `SiteAuthoringPaneShell` removes its root on dispose. */
function splitShellIsMounted(): boolean {
    if (typeof document === 'undefined') return false;
    return document.getElementById(SITE_AUTHORING_PANES_ROOT_ID) !== null;
}

/**
 * Mount the centred-on-the-view switcher.
 *
 * Never throws into its caller: the Parcel Law tab mounts this while building its body, and
 * a bar that could throw would be able to take the tab down with it (L-12915 is exactly the
 * founder not being able to open the tab at all).
 */
export function mountViewSwitcherOnView(
    opts: ViewSwitcherOnViewOptions,
): ViewSwitcherOnViewHandle {
    const span = _tracer.startSpan('pryzm.site.mountViewSwitcherOnView');
    const parent = opts.parent ?? document.body;
    const isSplitOpen = opts.isSplitOpen ?? splitShellIsMounted;

    // Idempotent per document: a re-mount after a tab rebuild must never leave two bars
    // centred on the same pixels. Same rule `mountSiteViewQuickToggle` states for itself.
    parent.querySelector(`[data-testid="${VIEW_SWITCHER_ON_VIEW_TESTID}"]`)?.remove();

    const root = document.createElement('div');
    root.className = 'vsw-onview';
    root.setAttribute('data-testid', VIEW_SWITCHER_ON_VIEW_TESTID);
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'View');

    let switcher: ViewSegmentSwitcherHandle | null = null;
    let disposed = false;

    // ── The SPLIT control — the one thing this file owns ─────────────────────────
    const split = document.createElement('button');
    split.type = 'button';
    split.className = 'vsw-split';
    split.setAttribute('data-testid', VIEW_SWITCHER_SPLIT_TESTID);

    const paintSplit = (): void => {
        if (disposed) return;
        const open = (() => {
            try { return isSplitOpen(); } catch { return false; }
        })();
        const canOpen = typeof opts.host.pryzmMountSiteAuthoringPanes === 'function';
        const canClose = typeof opts.host.pryzmUnmountSiteAuthoringPanes === 'function';
        const live = open ? canClose : canOpen;

        split.textContent = open ? '◧ Split — on' : '◧ Split';
        split.disabled = !live;
        split.setAttribute('aria-pressed', open ? 'true' : 'false');
        split.toggleAttribute('data-split-open', open);
        if (!live) {
            split.setAttribute('data-view-segment-unavailable', 'true');
            split.title = SPLIT_UNAVAILABLE_TEXT;
        } else {
            split.removeAttribute('data-view-segment-unavailable');
            split.title = open
                ? 'Close the split and go back to a single view.\n\n'
                + 'Read from the document (the split shell\'s own root element), not from '
                + 'pryzmGetSiteViewState — that snapshot carries no field for pane layout.'
                : 'Show two views side by side on the left, with this panel on the right. '
                + 'Each pane keeps its own view picker, so you choose what goes in each.';
        }
    };

    split.addEventListener('click', () => {
        if (split.disabled || disposed) return;
        try {
            if (isSplitOpen()) opts.host.pryzmUnmountSiteAuthoringPanes?.();
            else opts.host.pryzmMountSiteAuthoringPanes?.();
        } catch (e) {
            console.warn('[view-switcher-on-view] split dispatch failed (non-fatal):', e);
        }
        // Re-observe rather than assume: the shell mounts synchronously today, but a
        // control that PAINTED its own click would be asserting a layout it never checked.
        paintSplit();
        placeBelowQuickToggle();
    });

    /**
     * ⚠ TWO CENTRED BARS ARE POSSIBLE, AND THIS IS THE ONLY REASON THIS FUNCTION EXISTS.
     *
     * `SiteAuthoringPaneShell` mounts its OWN top-centre bar (`.svq-bar`,
     * §SITE-VIEW-QUICK-TOGGLE) whenever the split is up, and that bar takes the SAME
     * `left: var(--shell-canvas-cx)` this one does. In the founder's split case they would
     * land on top of each other.
     *
     * ⛔ The fix is NOT to hide one of them: they are different controls (that one is
     * PER-PANE, this one is WHOLE-SCREEN + the split toggle), and hiding the whole-screen
     * one would take the way OUT of split with it. So this bar MEASURES the other and sits
     * under it. A measurement, not an enumeration of the states in which the other exists —
     * C01 §6 rule 6: censuses rot.
     */
    const placeBelowQuickToggle = (): void => {
        if (disposed) return;
        try {
            const other = document.querySelector<HTMLElement>('.svq-bar');
            const rect = other?.getBoundingClientRect?.();
            if (other && rect && rect.height > 0) {
                root.style.top = `${Math.round(rect.bottom + 8)}px`;
            } else {
                // Back to the sheet's own derived value (it clears the shell's top band).
                root.style.top = '';
            }
        } catch { /* an unmeasurable sibling leaves the sheet's value in force */ }
    };

    try {
        const mount = opts.mountSwitcher ?? mountViewSegmentSwitcher;
        switcher = mount(opts.host);
        root.appendChild(switcher.element);
        root.appendChild(split);
        parent.appendChild(root);
        paintSplit();
        placeBelowQuickToggle();
        span.setAttribute('pryzm.viewSwitcherOnView.mounted', true);
    } catch (e) {
        span.setAttribute('pryzm.viewSwitcherOnView.mounted', false);
        console.warn('[view-switcher-on-view] build failed (non-fatal):', e);
        if (!root.isConnected) parent.appendChild(root);
    } finally {
        span.end();
    }

    return {
        element: root,
        repaint(): void {
            if (disposed) return;
            try { switcher?.repaint(); } catch { /* a repaint that throws is one we do not have */ }
            paintSplit();
            placeBelowQuickToggle();
        },
        dispose(): void {
            if (disposed) return;
            disposed = true;
            try { switcher?.dispose(); } catch { /* teardown is best-effort */ }
            switcher = null;
            root.remove();
        },
    };
}
