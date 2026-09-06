/**
 * viewSwitcherOnView.ts — §VIEW-SWITCHER-ON-THE-VIEW (founder 2026-09-06 · L-12985)
 *
 * Layer Affected:  UI — site / shell chrome (L7)
 * File:            apps/editor/src/ui/site/viewSwitcherOnView.ts
 * Strategy:        STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §24.1 item 2 · §25.0
 * Contracts:       C06 §15 (float budget) · C06 §6.1 (one chrome language) ·
 *                  C19 §5.6 (a panel is a HOST; the action is the AUTHORITY) ·
 *                  C59 §1.3 / §2 (the pane shell owns pane layout)
 * Issue log:       L-12985
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
 * §SHELL-SPLIT-DRAG handle (L-12983) resizes the two together. The founder's
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
// §AFTER-LOCATION-LAND-ON-THE-PASTEL-MAP (L-13001) — the SPLIT control's label,
// enabled-ness and refusal are now ONE pure decision, shared with the site phase's
// bottom-left pill. Two hosts, one answer: a copy would drift, and a split toggle that
// disagrees with itself about whether it can act is worse than one that cannot.
import {
    describeSplitToggle,
    SPLIT_TOGGLE_UNAVAILABLE_TEXT,
} from '../../engine/views/siteAuthoringPaneDecisions';

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
    pryzmMountSiteAuthoringPanes?: (opts?: { readonly layout?: SplitLayoutPreset }) => void;
    pryzmUnmountSiteAuthoringPanes?: () => void;
}

/**
 * §PANE-DEFAULT-IS-PLAN-LEFT (L-12988) — WHICH declared opening this bar's SPLIT asks for.
 * Mirrors `PaneLayoutPreset` in the pure pane model; spelled as a string union here for the
 * same reason it is one there — it crosses the `window` boundary, and a layout object shipped
 * through a global would be a second place for a default to live.
 */
export type SplitLayoutPreset = 'site-authoring' | 'parcel-law';

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
    /**
     * §PANE-DEFAULT-IS-PLAN-LEFT (L-12988, founder 2026-09-06: *"it should initially the plan
     * view to the left and 3d site to right"*) — the opening SPLIT asks for.
     *
     * ⭐ THE HOST DECIDES, NOT THIS BAR. The founder's sentence is about the tab he was on: a
     * host that opens on an ALREADY-DRAWN plot, where the plan is the useful left-hand
     * companion to the 3D Site. Onboarding's host opens on a plot that does not exist yet, and
     * its left pane must be the 2D map the guided flow makes you draw on
     * (§ONBOARDING-STEP-PINS-ITS-SURFACE pins it for exactly that reason). One control, two
     * hosts, two declared openings — and the default here is the onboarding one, so a caller
     * that says nothing gets the behaviour that shipped.
     *
     * It seeds the OPENING only. Both panes keep their own picker, so the user re-assigns
     * either one immediately afterwards — which is the other half of what he asked for.
     */
    readonly splitLayout?: SplitLayoutPreset;
}

export interface ViewSwitcherOnViewHandle {
    readonly element: HTMLElement;
    /** Re-derive the six segments AND the split state. Cheap; call on every activation. */
    repaint(): void;
    dispose(): void;
}

/**
 * The sentence on a SPLIT control that cannot dispatch. Named, never a silent no-op.
 *
 * ⚠ RE-EXPORT, NOT A DEFINITION (L-13001). It lives beside the decision that chooses it
 * so the on-view bar and the site phase's bottom-left pill refuse in the SAME words; this
 * name is kept because it is what the specs and the callers already import.
 */
export const SPLIT_UNAVAILABLE_TEXT = SPLIT_TOGGLE_UNAVAILABLE_TEXT;

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
    const splitLayout: SplitLayoutPreset = opts.splitLayout ?? 'site-authoring';

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
        // L-13001 — the shared decision answers label / enabled / pressed / refusal. The
        // two richer ENABLED titles below stay here because they are about THIS host's
        // layout ("with this panel on the right"), which the pure model cannot know.
        const shown = describeSplitToggle({
            open,
            canOpen: typeof opts.host.pryzmMountSiteAuthoringPanes === 'function',
            canClose: typeof opts.host.pryzmUnmountSiteAuthoringPanes === 'function',
        });
        const live = shown.enabled;

        // ⭐ §ONE-PANEL-PER-PANE-AND-MAKE-IT-A-DROPDOWN (L-13015) — WHILE THE PANES ARE UP,
        // THIS BAR IS A SPLIT CONTROL AND NOTHING ELSE.
        //
        // Founder 2026-09-06, on three switchers stacked over one pane: *"the left hand side
        // have double panels with the view — keep the one, the formal and more robust only,
        // and keep it DROP DOWN only. But when in split view, on the left hand side only,
        // please keep TWO dropdown panels."* Switcher count == visible pane count. When the
        // shell is up, every pane carries its own dropdown over the SAME six rows, so these
        // segments are the duplicate he photographed.
        //
        // ⛔ AND WHEN THE SHELL IS DOWN THEY STAY, because then there are no panes and no
        // dropdowns: hiding them there would leave the surface with no way to change the
        // view at all — the L-942 shape, a gate whose "yes" branch is unreachable. This is
        // also the ONLY host of the honest *"current view is not reported…"* line, which
        // exists precisely because a paneless surface has no authoritative reading; a pane
        // dropdown reads `PaneLayoutStore` and needs no such sentence.
        //
        // ⚠ A MEASUREMENT OF THE DOCUMENT, NOT AN ENUMERATION OF STATES (C01 §6 rule 6):
        // `isSplitOpen` observes the shell's own root id, the same reading the split button
        // itself is painted from — so the two can never disagree about whether panes exist.
        if (switcher) {
            const seg = switcher.element;
            if (open && seg.parentElement === root) root.removeChild(seg);
            else if (!open && seg.parentElement !== root) root.insertBefore(seg, split);
        }

        split.textContent = shown.label;
        split.disabled = !live;
        split.setAttribute('aria-pressed', shown.pressed ? 'true' : 'false');
        split.toggleAttribute('data-split-open', open);
        if (!live) {
            split.setAttribute('data-view-segment-unavailable', 'true');
            split.title = shown.title;
        } else {
            split.removeAttribute('data-view-segment-unavailable');
            split.title = open
                ? 'Close the split and go back to a single view.\n\n'
                + 'Read from the document (the split shell\'s own root element), not from '
                + 'pryzmGetSiteViewState — that snapshot carries no field for pane layout.'
                : (splitLayout === 'parcel-law'
                    ? 'Show two views side by side on the left, with this panel on the right. '
                    + 'It opens as the plan on the left and the 3D Site on the right; each pane '
                    + 'keeps its own view picker, so you choose what goes in each.'
                    : 'Show two views side by side on the left, with this panel on the right. '
                    + 'Each pane keeps its own view picker, so you choose what goes in each.');
        }
    };

    split.addEventListener('click', () => {
        if (split.disabled || disposed) return;
        try {
            if (isSplitOpen()) opts.host.pryzmUnmountSiteAuthoringPanes?.();
            else opts.host.pryzmMountSiteAuthoringPanes?.({ layout: splitLayout });
        } catch (e) {
            console.warn('[view-switcher-on-view] split dispatch failed (non-fatal):', e);
        }
        // Re-observe rather than assume: the shell mounts synchronously today, but a
        // control that PAINTED its own click would be asserting a layout it never checked.
        paintSplit();
        placeBelowBandOccupants();
    });

    /**
     * ⚠ SEVERAL CONTROLS CAN OCCUPY THIS BAND, AND THIS FUNCTION IS THE ONLY THING THAT
     * KEEPS THEM APART. The band is `top: calc(6px + var(--shell-topbar-h) + 8px)` at
     * `left: var(--shell-canvas-cx)` — this bar's own sheet rule, and it is not this bar's
     * alone. So this bar MEASURES what is up there and sits under the lowest of them. A
     * measurement, not an enumeration of the states in which the others exist (C01 §6 rule
     * 6: censuses rot).
     *
     * ⭐ CORRECTED 2026-09-06 (L-13004 / L-13015) — this routine measured ONE selector,
     * `.svq-bar`, and both halves of that were wrong:
     *
     *   · IT MEASURED THE WRONG ELEMENT. `document.querySelector('.svq-bar')` also matches
     *     the PANE-SCOPED `.svq-bar--pane`, which is `position: absolute` inside a pane —
     *     so a pane bar's viewport rect was being fed into a `position: fixed` element's
     *     `top`. Right by luck when the pane happened to be flush with the viewport top,
     *     wrong the moment it was not. The selector now excludes it explicitly.
     *
     *   · IT NEVER MEASURED THE THING THAT ACTUALLY OCCLUDES. The onboarding COMPACT PILL
     *     (`.os-onboarding-overlay--compact`) is declared at the IDENTICAL top and left in
     *     `onboardingStyles.ts`, and at `z-index: 2147483000` — above everything. It, not
     *     the top bar (which this band already clears by ~8px), is what hides the switcher
     *     during the guided flow. The honest fix is to make one MEASURE the other rather
     *     than to nudge a constant that leaves the coupling unmeasured.
     *     ⚠ The pill's OVERLAY root is `background: transparent; pointer-events: none` with
     *     `width: auto` — measuring it would over-measure whitespace — so the visible
     *     `.os-compact-row` inside it is preferred, and the overlay is only the fallback.
     */
    const OCCUPANTS_OF_THE_BAND: readonly string[] = [
        // ⚠ NOT `.svq-bar` — that also matches the pane-scoped `.svq-bar--pane`, which is
        // absolutely positioned inside a pane and whose rect means nothing to a fixed bar.
        '.svq-bar:not(.svq-bar--pane)',
        '.os-onboarding-overlay--compact .os-compact-row',
        '.os-onboarding-overlay--compact',
    ];

    const placeBelowBandOccupants = (): void => {
        if (disposed) return;
        try {
            let lowest = 0;
            for (const sel of OCCUPANTS_OF_THE_BAND) {
                const el = document.querySelector<HTMLElement>(sel);
                if (!el || el === root || root.contains(el)) continue;
                const rect = el.getBoundingClientRect?.();
                if (!rect || rect.height <= 0) continue;
                if (rect.bottom > lowest) lowest = rect.bottom;
                // The pill's own row was found, so its overlay fallback adds nothing.
                if (sel.endsWith('.os-compact-row')) break;
            }
            // Back to the sheet's own derived value (it clears the shell's top band).
            root.style.top = lowest > 0 ? `${Math.round(lowest + 8)}px` : '';
        } catch { /* an unmeasurable sibling leaves the sheet's value in force */ }
    };

    try {
        const mount = opts.mountSwitcher ?? mountViewSegmentSwitcher;
        switcher = mount(opts.host);
        root.appendChild(switcher.element);
        root.appendChild(split);
        parent.appendChild(root);
        paintSplit();
        placeBelowBandOccupants();
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
            placeBelowBandOccupants();
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
