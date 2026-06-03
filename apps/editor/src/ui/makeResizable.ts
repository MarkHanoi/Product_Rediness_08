/**
 * makeResizable — minimal companion to `makeDraggable` for floating panels.
 *
 * Adds a bottom-right corner resize grip to a `position:fixed` panel and
 * lets the user drag it to resize. Sibling to `makeDraggable.ts`; reused by
 * the onboarding panels (RAC chat + step controller). Founder feedback
 * 2026-06-03: panels must be repositionable AND resizable (MasterMiawW-style).
 *
 * Contract compliance:
 *   §05 §4 — UI-layer only; no store reads or writes
 *   §05 §7 — No independent <style> injection; the grip's visual styling lives
 *            in the panel's own stylesheet (`.os-resize-grip` / `.rac-resize-grip`
 *            in onboardingStyles.ts). This helper only sizes the panel.
 *
 * Behaviour notes:
 *   - The panel's CSS may use a `max-height`/`width: min(...)`; on the first
 *     resize we convert to explicit px so the grip drives the size from there.
 *   - We also drop any `margin: auto` centring + `max-height` cap on first
 *     resize so the explicit px size wins (same idiom makeDraggable uses for
 *     position via `transform: none`).
 *
 * Usage:
 *   const grip = document.createElement('div');
 *   grip.className = 'os-resize-grip';
 *   panel.appendChild(grip);
 *   const disposeResize = makeResizable(panel, grip, { minWidth: 300, minHeight: 220 });
 *   // later: disposeResize();
 *
 * @param panel   The floating panel root element (position:fixed).
 * @param grip    The corner grip element (already appended to `panel`).
 * @param opts    Minimum width/height in px (sensible floors).
 * @returns       A dispose function that removes all resize listeners.
 */
export function makeResizable(
    panel: HTMLElement,
    grip: HTMLElement,
    opts: { minWidth?: number; minHeight?: number } = {},
): () => void {
    const minWidth = opts.minWidth ?? 280;
    const minHeight = opts.minHeight ?? 180;

    let resizing = false;
    let startX = 0;
    let startY = 0;
    let startW = 0;
    let startH = 0;

    function onMouseDown(e: MouseEvent): void {
        const rect = panel.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        startW = rect.width;
        startH = rect.height;
        resizing = true;

        // Pin the panel to explicit px geometry so the resize drives it cleanly,
        // mirroring makeDraggable's convertToPxPosition. Drop auto-centring +
        // the responsive caps so the explicit width/height win.
        panel.style.left = rect.left + 'px';
        panel.style.top = rect.top + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.margin = '0';
        panel.style.maxWidth = 'none';
        panel.style.maxHeight = 'none';
        panel.style.transform = 'none';
        panel.style.width = startW + 'px';
        panel.style.height = startH + 'px';

        panel.classList.add('vg-panel--resizing');
        e.preventDefault();
        e.stopPropagation();
    }

    function onMouseMove(e: MouseEvent): void {
        if (!resizing) return;
        const w = Math.max(minWidth, startW + (e.clientX - startX));
        const h = Math.max(minHeight, startH + (e.clientY - startY));
        panel.style.width = w + 'px';
        panel.style.height = h + 'px';
    }

    function onMouseUp(): void {
        if (!resizing) return;
        resizing = false;
        panel.classList.remove('vg-panel--resizing');
    }

    grip.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    return () => {
        grip.removeEventListener('mousedown', onMouseDown);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };
}
