/**
 * LogoRailPanel — Project overview panel (stub)
 *
 * Author / Inspect / Data mode switching is now handled by WorkspaceModeBar
 * (top-of-scene floating pill). Project name, saved status, level selector,
 * physics toggle, and voice button have been removed per UI-V2 layout contract.
 *
 * This file is retained for backward compatibility with the import in
 * ProjectBrowserPanel.ts. The logo button no longer opens this panel.
 *
 * Contract compliance:
 *   §05 §6  — Zero bim-* / @thatopen/ui elements; pure native HTML
 *   §01     — Read-only; no direct store mutations
 */

export class LogoRailPanel {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }

    build(): HTMLElement {
        const root = document.createElement('div');
        root.className = 'lrp-root';
        return root;
    }
}
