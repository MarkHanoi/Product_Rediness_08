/**
 * @file Step5SummaryView.ts
 * Step 5: Review summary of detected elements.
 * Extracted from FloorPlanImportPanel.ts (Wave 14 FILE 4).
 */

import type { FPState } from './FPTypes';
import type { CommandProposal } from '@pryzm/command-registry';

export function renderSummary(state: FPState, proposals: CommandProposal[]): void {
    const container = document.getElementById('fp-summary-list');
    if (!container) return;

    const groups: Record<string, CommandProposal[]> = {};
    proposals.forEach(p => {
        const grp = p.intentType.replace('PDF_IMPORT_', '').toLowerCase();
        if (!groups[grp]) groups[grp] = [];
        groups[grp].push(p);
    });

    container.innerHTML = '';
    Object.entries(groups).forEach(([grp, items]) => {
        const badge = document.createElement('div');
        badge.className = 'fp-summary-group';
        badge.innerHTML = `<strong class="fp-summary-label">${grp.charAt(0).toUpperCase() + grp.slice(1)}</strong> <span class="fp-summary-count">${items.length}</span>`;
        container.appendChild(badge);

        items.forEach(p => {
            const row = document.createElement('div');
            row.className = 'fp-summary-row';
            const conf = p.confidence >= 0.9 ? 'high' : p.confidence >= 0.7 ? 'medium' : 'low';
            const confColor = conf === 'high' ? '#28a745' : conf === 'medium' ? '#fd7e14' : '#dc3545';
            row.innerHTML = `
                <span class="fp-summary-rationale">${p.rationale.replace('[PDF Import] ', '')}</span>
                <span class="fp-summary-conf" style="color:${confColor}">● ${conf}</span>
            `;
            container.appendChild(row);
        });
    });

    const summaryEl = document.getElementById('fp-summary-text');
    if (summaryEl) summaryEl.textContent = state.summaryText;
}
