/**
 * @file FPHelpers.ts
 * Shared DOM helpers: step navigation, status bar.
 * Extracted from FloorPlanImportPanel.ts (Wave 14 FILE 4).
 */

import type { FPState } from './FPTypes';

// ── Status bar ─────────────────────────────────────────────────────────────────

export function setStatus(msg: string, isError = false): void {
    const el = document.getElementById('fp-status');
    if (!el) return;
    el.textContent = msg;
    (el as HTMLElement).style.color = isError ? '#dc3545' : '#28a745';
}

// ── Step navigation ────────────────────────────────────────────────────────────

export function gotoStep(state: FPState, step: 1 | 2 | 3 | 4 | 5 | 6): void {
    state.step = step;
    // Always hide the debug preview panel when navigating to a numbered step
    const debugPanel = document.getElementById('fp-step-debug');
    if (debugPanel) debugPanel.style.display = 'none';
    // Restore normal panel width when leaving the debug preview
    const panelRoot = document.getElementById('fp-panel-root');
    if (panelRoot) panelRoot.classList.remove('fp-panel--debug-preview');
    const outerContainer = document.getElementById('fp-import-panel-container');
    if (outerContainer) {
        // Expand panel width for Step 2 (ruler calibration) to allow more precise clicking
        const isRulerStep = (step === 2);
        outerContainer.style.width = isRulerStep ? '480px' : '300px';
        outerContainer.style.maxHeight = '90vh';
        outerContainer.style.overflow = 'hidden';
        outerContainer.style.transition = 'width 0.2s ease';
    }
    // Update visibility for all step panels (keep 4-6 always hidden per 3-step flow)
    ([1, 2, 3, 4, 5, 6] as const).forEach(s => {
        const el = document.getElementById(`fp-step-${s}`);
        if (el) el.style.display = (s === step && s <= 3) ? 'flex' : 'none';
    });
    // Update 3-step indicator dots
    ([1, 2, 3] as const).forEach(s => {
        const ind = document.getElementById(`fp-ind-${s}`);
        if (!ind) return;
        if (s < step) { ind.style.background = '#28a745'; ind.style.color = '#fff'; }
        else if (s === step) { ind.style.background = '#6e8efb'; ind.style.color = '#fff'; }
        else { ind.style.background = '#e0e0e0'; ind.style.color = '#999'; }
    });
}

/** Show the intermediate detection-preview step (not part of numbered step indicators). */
export function showDebugStep(): void {
    ([1, 2, 3, 4, 5, 6] as const).forEach(s => {
        const el = document.getElementById(`fp-step-${s}`);
        if (el) el.style.display = 'none';
    });
    const debugPanel = document.getElementById('fp-step-debug');
    if (debugPanel) debugPanel.style.display = 'flex';
    const panelRoot = document.getElementById('fp-panel-root');
    if (panelRoot) panelRoot.classList.add('fp-panel--debug-preview');
    const outerContainer = document.getElementById('fp-import-panel-container');
    if (outerContainer) {
        outerContainer.style.width = '680px';
        outerContainer.style.maxHeight = '90vh';
        outerContainer.style.overflow = 'visible';
        outerContainer.style.transition = 'width 0.25s ease';
    }
}
