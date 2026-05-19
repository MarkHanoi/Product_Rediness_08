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

    // S70 D8 — PostOccupancyPanel deleted with src/lifecycle/.
    // The 'lifecycle' panel slot is left empty until plugins/lifecycle/
    // ports the surface (per ADR-030 §B + §D + ADR-0052 §B.7).
    if (lifecycleSlot !== undefined) {
        console.warn(
            '[DataWorkbench] PostOccupancy surface deferred to plugins/lifecycle/ (S70 D8); ' +
            'panel slot is empty until the plugin ports it. See ADR-0052 §B.7.',
        );
    }
}
