/**
 * LifecycleBucket — LIFECYCLE lifecycle bucket setup.
 *
 * Layer Affected:    UI — Data Workbench › Lifecycle Bucket
 * File:             src/ui/dataworkbench/buckets/LifecycleBucket.ts
 *
 * Owns: PortfolioQueryPanel instantiation + deferred lifecycle slot warning.
 *
 * Phase B.27 (S73-WIRE) — runtime forwarded to PortfolioQueryPanel.
 * S70 D8 — PostOccupancyPanel deleted; lifecycle slot deferred to plugins/lifecycle/.
 */

import { PortfolioQueryPanel } from '../PortfolioQueryPanel';

export function mountLifecyclePanels(
    portfolioContainer: HTMLElement,
    lifecycleSlot: HTMLElement | undefined,
    runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null,
): void {
    new PortfolioQueryPanel(portfolioContainer, runtime);

    // S70 D8 — PostOccupancyPanel deleted with src/lifecycle/. The surface is
    // deferred to plugins/lifecycle/ (ADR-030 §B + §D, ADR-0052 §B.7).
    //
    // §FIX-EMPTY-OCCUPANCY-SLOT (L-1285) — SAY SO IN THE PANEL, not only in the
    // console. The `Occupancy` sub-tab is declared unconditionally in
    // `DataWorkbench._buckets` and every entry in `subTabs` is rendered as a
    // clickable pill (and counted in the bucket header's "N views"), so a user
    // who clicked it got a BLANK flex container and no explanation. A visible
    // control that does nothing and says nothing is worse than an absent one: it
    // reads as a broken feature rather than an unbuilt one, and the only
    // acknowledgement of the state was a `console.warn` the user never sees.
    //
    // The panel is left MOUNTED and labelled rather than removed from `subTabs`
    // because the deferral is real and dated: hiding the tab would erase the only
    // evidence in the product that the surface is owed.
    if (lifecycleSlot !== undefined) {
        lifecycleSlot.innerHTML = `
            <div class="dw-placeholder">
                <div class="dw-placeholder-icon">⊘</div>
                <div style="font-weight:600;font-size:13px;color:var(--app-text);margin-bottom:4px">Post-occupancy — not yet available</div>
                <div style="font-size:12px;max-width:260px;text-align:center;line-height:1.6;color:var(--app-text-muted)">
                    This surface is being ported to the lifecycle plugin (ADR-0052 §B.7).
                    Nothing is broken and no data is missing — the panel has not shipped yet.
                </div>
            </div>
        `;
    }
}
