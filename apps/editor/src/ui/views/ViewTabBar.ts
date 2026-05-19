/**
 * ViewTabBar — DOC-1.5e: Dual-layer compositing status indicator
 *
 * CSS prefix: vtb- (claimed in §05 §3)
 *
 * Displays a subtle floating chip inside the 3D viewport when a
 * TechnicalDrawing re-projection is in flight (viewDependencyTracker.isReprojecting).
 *
 * DOC-1.5e compositing rule:
 *   Layer 1 (3D mesh) is ALWAYS visible as the live underlay.
 *   Layer 2 (TechnicalDrawing) overlays when available.
 *   This chip signals that the vector overlay is updating — NOT that content is missing.
 *
 * Contract compliance:
 *   §05 §3   — vtb- CSS prefix claimed here
 *   §05 §6   — zero bim-* / @thatopen/ui elements; pure native HTML
 *   §05 §7.6 — styles exported as VTB_STYLES, injected via AppTheme.ts
 *   §01 §2   — read-only; no store mutations
 */

import { viewDependencyTracker } from '@pryzm/core-app-model';

// ── Styles ────────────────────────────────────────────────────────────────────

export const VTB_STYLES = `
/* ── View Tab Bar — re-projection status chip (vtb-) ─────────────────────── */
.vtb-chip {
    position: absolute;
    bottom: 40px;
    left: 50%;
    transform: translateX(-50%);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    pointer-events: none;
    background: rgba(10, 10, 20, 0.62);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    color: rgba(255, 255, 255, 0.92);
    border-radius: 20px;
    padding: 5px 12px 5px 9px;
    font-size: 11px;
    font-family: var(--app-font, system-ui, sans-serif);
    letter-spacing: 0.02em;
    user-select: none;
    white-space: nowrap;
    z-index: 45;
    opacity: 0;
    transition: opacity 0.18s ease;
    box-shadow: 0 2px 8px rgba(0,0,0,0.28);
}

.vtb-chip.vtb-chip--visible {
    opacity: 1;
}

.vtb-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--app-accent, #6600FF);
    flex-shrink: 0;
    animation: vtb-pulse 1.1s ease-in-out infinite;
}

@keyframes vtb-pulse {
    0%, 100% { opacity: 1;   transform: scale(1);   }
    50%       { opacity: 0.3; transform: scale(0.6); }
}
`;

// ── Class ─────────────────────────────────────────────────────────────────────

/**
 * ViewTabBar — mounts a small floating chip into a container element.
 * The chip becomes visible whenever `viewDependencyTracker.isReprojecting` is true.
 *
 * Usage:
 *   viewTabBar.mount(viewportContainer); // call once after DOM is ready
 */
export class ViewTabBar {
    /** The root DOM element. Mount this into your viewport container. */
    readonly element: HTMLElement;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        const chip = document.createElement('div');
        chip.className = 'vtb-chip';
        chip.setAttribute('role', 'status');
        chip.setAttribute('aria-label', 'Updating vector overlay');
        chip.setAttribute('aria-live', 'polite');

        const dot = document.createElement('span');
        dot.className = 'vtb-dot';
        dot.setAttribute('aria-hidden', 'true');

        const label = document.createElement('span');
        label.textContent = 'Updating…';

        chip.appendChild(dot);
        chip.appendChild(label);

        this.element = chip;

        this._wireTracker();
    }

    /**
     * Append the chip into `container`.
     * The container must have `position: relative` (or any non-static position)
     * for the absolute-positioned chip to render correctly.
     */
    mount(container: HTMLElement): void {
        container.appendChild(this.element);
    }

    /** Remove the chip from the DOM and disconnect from the tracker. */
    dispose(): void {
        viewDependencyTracker.onReprojectionStateChange = null;
        this.element.remove();
    }

    // ── Private ───────────────────────────────────────────────────────────────

    private _wireTracker(): void {
        // DOC-1.5e: subscribe to reprojection state changes.
        // The callback fires on every 0→1 and N→0 transition.
        viewDependencyTracker.onReprojectionStateChange = (reprojecting: boolean) => {
            this._setVisible(reprojecting);
        };

        // Sync with current state in case tracker is already active at mount time.
        this._setVisible(viewDependencyTracker.isReprojecting);
    }

    private _setVisible(visible: boolean): void {
        this.element.classList.toggle('vtb-chip--visible', visible);
        // Keep screen-readers informed: hide when idle.
        this.element.setAttribute('aria-hidden', String(!visible));
    }
}

// ── Singleton ─────────────────────────────────────────────────────────────────
/** Shared instance. Call `viewTabBar.mount(container)` once after DOM is ready. */
export const viewTabBar = new ViewTabBar();
