/**
 * StrategizeBucket — STRATEGIZE lifecycle bucket setup.
 *
 * Layer Affected:    UI — Data Workbench › Strategize Bucket
 * File:             src/ui/dataworkbench/buckets/StrategizeBucket.ts
 *
 * Owns: Generative panel DOM layout + sub-panel wiring.
 */

import { BriefInputPanel }    from '../../generative/BriefInputPanel';
import { VariantBrowserPanel } from '../../generative/VariantBrowserPanel';

export interface StrategizePanels {
    briefInputPanel:    BriefInputPanel;
    variantBrowserPanel: VariantBrowserPanel;
}

/**
 * Build the Generative sub-panel layout inside the given container.
 * Returns the instantiated panel objects so the shell can store them for refresh().
 *
 * Phase B.32 (S73-WIRE) — runtime forwarded for future F.6.x briefStore /
 * variantStore migration.
 */
export function mountGenerativePanel(
    genContainer: HTMLElement,
    runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null,
): StrategizePanels {
    const genWrapper = document.createElement('div');
    genWrapper.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;';
    genContainer.appendChild(genWrapper);

    const briefContainer = document.createElement('div');
    briefContainer.style.cssText = 'flex:0 0 55%;overflow-y:auto;border-bottom:2px solid var(--dw-border,#e5e7eb);';
    const variantContainer = document.createElement('div');
    variantContainer.style.cssText = 'flex:1;overflow:hidden;display:flex;flex-direction:column;';

    genWrapper.appendChild(briefContainer);
    genWrapper.appendChild(variantContainer);

    const briefInputPanel    = new BriefInputPanel(briefContainer, runtime);
    const variantBrowserPanel = new VariantBrowserPanel(variantContainer, runtime);
    variantBrowserPanel.setBriefPanel(briefInputPanel);

    return { briefInputPanel, variantBrowserPanel };
}
