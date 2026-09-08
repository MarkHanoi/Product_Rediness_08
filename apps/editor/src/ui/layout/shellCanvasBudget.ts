/**
 * shellCanvasBudget — §SHELL-FLOAT-BUDGET (L-4010..L-4016 · L-4030..L-4035)
 *
 * THE ONE WRITER of the shell's layout budget. Contract: **C06 §15**.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHAT THE BUDGET IS
 * ═════════════════════════════════════════════════════════════════════════════
 * Two custom properties on `<body>`, declared with defaults in `tokens.ts`:
 *
 *   --shell-canvas-cx   horizontal centre of the region the 3-D canvas occupies
 *   --shell-canvas-w    width of that region
 *
 * Every canvas-anchored floating bar in the shell declares
 * `left: var(--shell-canvas-cx, 50%)` instead of `left: 50%`. That is the whole
 * mechanism: fifteen bars, one number.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ IT IS MEASURED, NOT ENUMERATED — AND THAT IS THE POINT
 * ═════════════════════════════════════════════════════════════════════════════
 * The first version of this computed the region from the mode registry alone:
 * `def?.canvas === 'half' ? '25%' : '50%'`. That was correct for the two
 * half-canvas modes and **wrong for everything else that narrows the canvas**,
 * which is exactly the failure this whole lane exists to stop repeating.
 *
 * **Measured 2026-08-22**, from the founder's second screenshot. `#container`
 * also narrows when the split divides the view region (2026-09-06: ONE owner,
 * `layout/viewRegionGeometry.ts` — the `.svp-active` stylesheet rule and the six
 * rival inline writers it names are gone, L-13030 / C59 §2.10), and the rest of
 * the region is `.svp-pane` — a fixed panel with its own header bar. A
 * mode-derived budget left the centred shell row at 50 % of the VIEWPORT, i.e.
 * inside the split pane, painting its opaque self over that pane's header. What
 * the founder photographed as *"an orphan chevron with no label"* is
 * `.svp-view-select` with its left half under that bar: the select is
 * `appearance: none` and draws its chevron as a `background-image` pinned to its
 * right edge, so **the affordance survives an occlusion its label does not.**
 *
 * So the region is read from `#container`'s ACTUAL rect. Split view, half-canvas
 * modes, pinned docks and anything added later are all handled by one
 * measurement, because none of them is enumerated. **An enumerated cause list is
 * a census, and this lane's finding is that censuses rot** (C01 §6 rule 6).
 *
 * ⛔ ONE WRITER. `WorkspaceController._applyLayout()` calls this AFTER setting
 * the canvas width, and `DockingLayout`'s `ResizeObserver` on `#container` calls
 * it on every subsequent geometry change. Both call the same function; neither
 * computes a value. Two writers computing "the same" number two ways is the
 * defect shape this file was extracted to avoid.
 */

import {
    VIEW_REGION_REGISTRY,
    listViewRegions,
} from '../../engine/views/viewRegionSwitcher';

/** Fallbacks when there is no measurable canvas — see `NO CANVAS` below. */
const VIEWPORT_CENTRE = '50%';
const VIEWPORT_WIDTH = '100vw';

/**
 * Re-publish `--shell-canvas-cx` / `--shell-canvas-w` from the live geometry of
 * `#container`. Idempotent and cheap; safe to call from a ResizeObserver.
 *
 * **NO CANVAS.** Data mode is `canvas: 'hidden'`, so `#container` is
 * `display: none` and its rect is 0×0. The budget then falls back to the
 * viewport centre **deliberately**: there is nothing to centre on, and the mode
 * bar MUST stay reachable over the full-width workbench or the mode cannot be
 * left. That is a decision, not a default — C06 §15.5 records it.
 */
export function publishShellCanvasRegion(): void {
    // ⛔ TOTAL, AND THAT IS A REQUIREMENT RATHER THAN CAUTION.
    // `WorkspaceController._applyLayout()` calls this in the middle of a mode
    // change. If it could throw, a LAYOUT BUDGET would be able to abort the
    // mode switch that follows it — chrome cosmetics taking down a workspace.
    // C06 §14.2's obligation ("a control whose host is absent must degrade,
    // never unmount") is the same rule one layer down. The fallbacks below are
    // the degraded answer; there is no path out of here that is not a publish.
    try {
        if (typeof document === 'undefined') return;
        const body = document.body;
        if (!body) return;

        const vw = typeof window === 'undefined' ? 0 : window.innerWidth || 0;

        let cx = VIEWPORT_CENTRE;
        let w = VIEWPORT_WIDTH;

        // ══════════════════════════════════════════════════════════════════
        // §SHELL-CX-IS-THE-WHOLE-REGION (founder 2026-09-08 · L-13259 · C59 §2.10)
        //
        // *"please center on the view the full scope under the green rectangle"* — his
        // green box is the mode bar, sitting over the LEFT HALF of a 3D + plan split
        // instead of over the pair.
        //
        // ⛔ THE CAUSE: this function measured `#container` ALONE. `#container` is the
        // BIM canvas, and under a split `SplitViewManager` sizes it to the split ratio —
        // so the bar centred on 60% of the region and drifted left by design. That is
        // right for a whole-screen canvas and wrong for every split, which is why it
        // looked correct until the founder opened one.
        //
        // ⭐ THE VIEW REGION IS THE UNION OF THE VISIBLE VIEW REGIONS, and C59 §2.10
        // already says so: the mode SIZES the region, the split DIVIDES it. A bar that
        // centres on one pane is centring on a DIVISION, one level too low.
        //
        // ⛔ AND THE SET IS READ FROM `VIEW_REGION_REGISTRY`, NOT LISTED HERE. A second
        // hardcoded list of pane selectors is the census this file's own header calls the
        // defect shape (C01 §6 rule 6) — and the region census exists precisely so a new
        // region joins every consumer at once.
        // ══════════════════════════════════════════════════════════════════
        const selectors = listViewRegions().map((id) => VIEW_REGION_REGISTRY[id].anchorSelector);
        let left = Number.POSITIVE_INFINITY;
        let right = Number.NEGATIVE_INFINITY;
        for (const sel of selectors) {
            let el: Element | null = null;
            try { el = document.querySelector(sel); } catch { el = null; }
            if (!el || typeof el.getBoundingClientRect !== 'function') continue;
            const r = el.getBoundingClientRect();
            // A hidden or not-yet-laid-out region measures 0 and must NOT widen the union
            // to the left edge — an absent region is an ABSENCE, not a rectangle at x=0.
            if (!(r.width > 0)) continue;
            if (r.left < left) left = r.left;
            if (r.right > right) right = r.right;
        }

        if (vw > 0 && right > left) {
            const width = right - left;
            cx = `${(((left + width / 2) / vw) * 100).toFixed(3)}%`;
            w = `${((width / vw) * 100).toFixed(3)}vw`;
        }

        body.style.setProperty('--shell-canvas-cx', cx);
        body.style.setProperty('--shell-canvas-w', w);
    } catch {
        // Swallowed on purpose. A budget that cannot be computed leaves the
        // declared defaults in `tokens.ts` in force, which is the pre-budget
        // behaviour — never a broken mode switch.
    }
}
