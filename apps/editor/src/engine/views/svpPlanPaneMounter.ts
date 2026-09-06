// §FEAT-MULTI-PANE-VIEW-SYSTEM (L-412 / L-405, C59 Phase 2) — the `canvas2d` pane
// mounter: it hosts the EXISTING Canvas2D plan renderer (SplitViewManager's secondary
// pane) inside an arbitrary PaneHost element, so `bim-plan-2d` becomes assignable to
// either pane — the founder's "3D Site available from plan view and vice versa".
//
// WHY A RE-PARENT AND NOT A NEW PLAN SURFACE: C59 §0's whole thesis is that a FOURTH
// view mechanism would be the worst possible outcome. `SplitViewManager` owns the plan
// renderer (PlanViewCanvas + the tool overlay + the interaction layer + the VG/level
// chrome); constructing a second Canvas2D plan for panes would fork all of it. So this
// mounter drives the EXISTING owner and RE-PARENTS its `#svp-secondary-pane` node into
// the pane element — exactly the Phase-1b idiom that re-targets the single Cesium
// container. C59 §3 sanctions precisely this: "Its Canvas2D renderer becomes the
// `canvas2d` mounter; literal reuse/consolidation of the legacy class is deferred to
// Phase 4." This file therefore ADAPTS the legacy owner; it does not consolidate it and
// it does not modify it.
//
// WHAT IT MUST UNDO WHILE PANED (and why):
//   • `SplitViewManager._buildDOM()` SHRINKS `#container` to (1 - splitRatio) and mounts
//     its pane `position:fixed` at the screen's right edge. Inside a pane that geometry
//     is wrong twice over: the shell lives INSIDE `#container` (so shrinking it shrinks
//     the panes too, leaving dead space), and a fixed node ignores the pane box. The
//     mounter therefore restores `#container`'s sizing and pins the pane node to
//     `inset:0` within its host — with `!important`, since `.svp-pane`'s fixed geometry
//     comes from a stylesheet rule that would otherwise win over inline styles.
//   • Its own `#svp-divider` (a second, body-level divider) is hidden: the pane shell
//     already owns the split geometry.
// Both are reverted for free on unmount, because `deactivate()` → `_teardownDOM()`
// removes the pane + divider nodes (from WHEREVER they were re-parented to) and clears
// `#container`'s inline sizing. That is why unmount is a plain `deactivate()`.
//
// P3 (single rAF): no frame loop here — SplitViewManager already paints on the shared
// scheduler's tick and reflows through its own `ResizeObserver` on the pane node, which
// keeps working after the re-parent (it observes the node, not the position).
// P4: no `window as any` — the caller injects a typed resolver.

import type { PaneRendererMounter } from './PaneHost';

/** The minimal SplitViewManager surface this mounter drives (structural typing). */
export interface SplitViewManagerLike {
    readonly isActive: boolean;
    activate(): void;
    deactivate(): void;
}

const SVP_PANE_ID = 'svp-secondary-pane';
const SVP_DIVIDER_ID = 'svp-divider';

/** Force a style through a stylesheet rule that would otherwise win. */
function pin(el: HTMLElement, prop: string, value: string): void {
    el.style.setProperty(prop, value, 'important');
}

/**
 * Pin the legacy pane node to fill whatever pane element it now lives in. ONE function so
 * `mount` and `relocate` cannot drift into two spellings of the same geometry — a plan pane
 * that filled its box on first mount and not on a move would look like a rendering bug.
 */
function pinPaneNode(paneNode: HTMLElement): void {
    pin(paneNode, 'position', 'absolute');
    pin(paneNode, 'top', '0');
    pin(paneNode, 'right', '0');
    pin(paneNode, 'bottom', '0');
    pin(paneNode, 'left', '0');
    pin(paneNode, 'width', '100%');
    pin(paneNode, 'height', '100%');
}

/**
 * Build the `canvas2d` mounter for a pane shell. `resolve` hands back the ONE
 * SplitViewManager instance (there is only ever one — it owns the single plan renderer).
 */
export function createSvpPlanPaneMounter(
    resolve: () => SplitViewManagerLike | null,
): PaneRendererMounter {
    const mountInto = (paneEl: HTMLElement): void => {
            const svp = resolve();
            if (!svp) {
                console.warn('[pane][plan] no SplitViewManager available — plan pane left empty.');
                return;
            }
            // Rebuild from a known state: an already-open legacy pane carries the body-level
            // fixed geometry we are about to override, and `activate()` is a no-op while
            // active, so its DOM would never be re-created for THIS pane.
            try {
                if (svp.isActive) svp.deactivate();
                svp.activate();
            } catch (e) {
                console.error('[pane][plan] SplitViewManager.activate threw:', e);
                return;
            }

            const paneNode = document.getElementById(SVP_PANE_ID);
            if (!paneNode) {
                console.warn(`[pane][plan] #${SVP_PANE_ID} not found after activate — plan pane empty.`);
                return;
            }

            // Undo the legacy shrink of #container: the pane shell lives inside it.
            const container = document.getElementById('container');
            if (container) {
                container.classList.remove('svp-active');
                container.style.width = '';
                container.style.maxWidth = '';
                container.style.flexGrow = '';
                container.style.flexShrink = '';
                container.style.flexBasis = '';
            }

            // The legacy body-level divider is redundant — the shell owns the split.
            const legacyDivider = document.getElementById(SVP_DIVIDER_ID);
            if (legacyDivider instanceof HTMLElement) legacyDivider.style.display = 'none';

            // Re-parent + fill the pane box (the seam: a pane element, not #container).
            paneEl.appendChild(paneNode);
            pinPaneNode(paneNode);
            console.log('[pane][plan] Canvas2D plan re-parented into its pane (C59 Phase 2).');
    };

    return {
        rendererKind: 'canvas2d',

        mount: mountInto,

        // §PANE-PLACEMENT-AFTER-MODE-SWITCH (L-12988 / L-12992) — MOVE the ONE plan node into
        // another pane without a deactivate/activate cycle. `mount` above rebuilds the legacy
        // DOM from scratch (deactivate → activate), which for a pane-to-pane move throws away
        // a live Canvas2D surface to get the same one back. There is exactly ONE
        // `#svp-secondary-pane` node and a DOM node has one parent, so moving it IS the move.
        relocate: (paneEl: HTMLElement): void => {
            const paneNode = document.getElementById(SVP_PANE_ID);
            if (!paneNode) {
                // Never built (or torn down since) — fall back to the full mount.
                console.log('[pane][plan] relocate: no live plan node — mounting instead.');
                mountInto(paneEl);
                return;
            }
            if (paneNode.parentElement !== paneEl) paneEl.appendChild(paneNode);
            pinPaneNode(paneNode);
            console.log('[pane][plan] §L-12988 plan node re-targeted into its pane (no rebuild).');
        },

        /** A READING off the document — where the ONE plan node actually is. */
        isPlacedIn: (paneEl: HTMLElement): boolean => {
            const paneNode = document.getElementById(SVP_PANE_ID);
            return paneNode != null && paneNode.parentElement === paneEl;
        },

        unmount: (): void => {
            // `deactivate()` → `_teardownDOM()` removes the pane + divider nodes wherever
            // they now live and clears #container's inline sizing, so the legacy owner is
            // left exactly as it was before the pane borrowed it. Nothing to restore here.
            try {
                resolve()?.deactivate();
            } catch (e) {
                console.warn('[pane][plan] SplitViewManager.deactivate threw:', e);
            }
        },

        // SplitViewManager observes its own pane node with a ResizeObserver, which keeps
        // firing after the re-parent — so the plan reflows to the pane with no extra call.
        resize: (): void => { /* auto (SplitViewManager ResizeObserver on the pane node) */ },
    };
}
