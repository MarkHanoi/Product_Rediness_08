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

    function convertToPxPosition() {
        const rect         = panel.getBoundingClientRect();
        panel.style.left      = rect.left + 'px';
        panel.style.top       = rect.top  + 'px';
        // §DRAG-SHIFT-FIX (2026-06-03): neutralise centring shorthands so the
        // pinned left/top take FULL effect. Panels centred via `inset:0; margin:auto`
        // (the onboarding overlays) otherwise JUMP to a side on grab because the
        // leftover right/bottom/margin keep fighting the new left/top. Harmless for
        // panels already positioned by left/top (right/bottom were already auto).
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

        if (!panel.style.transform || panel.style.transform !== 'none') {
            convertToPxPosition();
        }

        const rect  = panel.getBoundingClientRect();
        offsetX     = e.clientX - rect.left;
        offsetY     = e.clientY - rect.top;
        dragging    = true;
        panel.classList.add('vg-panel--dragging');
        e.preventDefault();
    }

    function onMouseMove(e: MouseEvent) {
        if (!dragging) return;
        const x = e.clientX - offsetX;
        const y = e.clientY - offsetY;
        panel.style.left = Math.max(0, x) + 'px';
        panel.style.top  = Math.max(0, y) + 'px';
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
