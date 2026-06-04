/**
 * makeDraggable — reusable drag utility for floating panels.
 *
 * Uses event delegation on the `panel` element so that the drag handle
 * selector is re-evaluated on every mousedown — safe to use with panels
 * that replace their innerHTML on each render (e.g. VGGovernancePanel).
 *
 * Contract compliance:
 *   §05 §4 — UI-layer only; no store reads or writes
 *   §05 §7 — No independent <style> injection; cursor class goes via AppTheme
 *
 * Usage:
 *   const disposeDrag = makeDraggable(panelEl, '.vg-header', ['.vg-close-btn']);
 *   // later:
 *   disposeDrag();
 *
 * @param panel               The floating panel root element (position:fixed).
 * @param dragHandleSelector  CSS selector for the drag grip relative to `panel`
 *                            (e.g. '.vg-header'). Re-evaluated on each mousedown.
 * @param excludeSelectors    CSS selectors for children that must NOT start a drag
 *                            (e.g. ['.vg-close-btn']). Checked against the target.
 * @param runtime             Phase B.4 (S73-WIRE) — optional PryzmRuntime handle
 *                            threaded by the calling panel.  Reserved for future
 *                            Phase F drag-persistence (last-position store write);
 *                            currently unused.  `null` permitted — the drag
 *                            behaviour is identical with or without a runtime.
 *                            TODO(F.6.5): wire drag-end position to
 *                            runtime.persistence.panelLayout when F.6.5 lands.
 * @returns                   A dispose function that removes all drag listeners.
 */
export function makeDraggable(
    panel: HTMLElement,
    dragHandleSelector: string,
    excludeSelectors: string[] = [],
    // Phase B.4 (S73-WIRE) — runtime threaded for future F.6.5 panel-layout persistence.
    _runtime?: import('@pryzm/runtime-composer/types').PryzmRuntime | null,
): () => void {
    let dragging = false;
    let offsetX  = 0;
    let offsetY  = 0;
    let panelW   = 0;
    let panelH   = 0;

    /**
     * §DRAG-SHIFT-FIX (O.9, 2026-06-04): pin the panel to absolute left/top derived
     * from its CURRENT visual rect, then strip EVERY centring mechanism so the pinned
     * left/top take full effect with no leftover offset to fight.
     *
     * The jump-to-side regression had two compounding causes, both fixed here:
     *  1. Transform-centring. The onboarding overlays centre via a STYLESHEET rule
     *     `left:50%; top:50%; transform:translate(-50%,-50%)`. `getBoundingClientRect()`
     *     already accounts for that translate, so pinning `left=rect.left` and then
     *     clearing the transform keeps the panel exactly where it was — PROVIDED the
     *     offset is captured from the SAME rect. The old code did its own
     *     getBoundingClientRect() inside convertToPxPosition AND a second one for the
     *     offset, with the panel already mutated between them → the offset was taken
     *     against a moved rect, so the first mousemove snapped the panel sideways.
     *  2. Centring shorthands (`right/bottom/margin/inset`). Left in place, they keep
     *     fighting the new left/top and snap the panel to a side.
     *
     * Fix: take ONE rect, pin from it, neutralise transform+shorthands, and capture the
     * cursor↔origin offset from that SAME rect — no second, post-mutation read to
     * disagree with.
     */
    function pinToAbsolute(rect: DOMRect) {
        panel.style.left      = rect.left + 'px';
        panel.style.top       = rect.top  + 'px';
        panel.style.right     = 'auto';
        panel.style.bottom    = 'auto';
        panel.style.margin    = '0';
        panel.style.transform = 'none';
    }

    function onMouseDown(e: MouseEvent) {
        const target  = e.target as HTMLElement;
        const handle  = panel.querySelector(dragHandleSelector) as HTMLElement | null;
        if (!handle || !handle.contains(target)) return;

        const excluded = excludeSelectors.some(sel => target.closest(sel));
        if (excluded) return;

        // Single rect read: the panel's true on-screen box (already accounts for any
        // translate centring). Both the absolute-pin AND the grab offset derive from
        // THIS rect, so the panel cannot jump on the first move.
        const rect  = panel.getBoundingClientRect();
        offsetX     = e.clientX - rect.left;
        offsetY     = e.clientY - rect.top;
        panelW      = rect.width;
        panelH      = rect.height;

        pinToAbsolute(rect);

        dragging    = true;
        panel.classList.add('vg-panel--dragging');
        e.preventDefault();
    }

    function onMouseMove(e: MouseEvent) {
        if (!dragging) return;
        // left = cursor - grabOffset preserves the exact point the user grabbed.
        const x = e.clientX - offsetX;
        const y = e.clientY - offsetY;
        // Clamp so the panel can't be dragged fully off-screen.
        const maxX = Math.max(0, window.innerWidth  - panelW);
        const maxY = Math.max(0, window.innerHeight - panelH);
        panel.style.left = Math.min(maxX, Math.max(0, x)) + 'px';
        panel.style.top  = Math.min(maxY, Math.max(0, y)) + 'px';
    }

    function onMouseUp() {
        if (!dragging) return;
        dragging = false;
        panel.classList.remove('vg-panel--dragging');
    }

    panel.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup',   onMouseUp);

    return () => {
        panel.removeEventListener('mousedown', onMouseDown);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup',   onMouseUp);
    };
}
