// §RESI-ORCH-STAGE-PANEL (lane RESI-ORCH, 2026-09-04) — the DOM wire for the design-stage strip's
// "do this next" pill (STR §19: *"What can I do?"*).
//
// The strip is pure markup (`buildDesignStageStripHtml`). When a stage is `available` and its
// control is on this card (`DESIGN_STAGE_CARD_CONTROL[stage].onCard`), the pill renders as a
// `<button data-design-stage-jump="<stage>">`. This module attaches the click: it finds the
// control by `data-stage-control="<stage>"`, opens every `<details>` between the two so the
// control is actually visible, scrolls to it and focuses its first field.
//
// ⛔ A JUMP WITH NO TARGET PRINTS A SENTENCE, NEVER NOTHING. The target-area entry exists only on
// the full-determination card and the study-height entry only on the refusal card; a stage can be
// `available` on an arm that hosts neither. The status line then says where the control is,
// because a "next step" button whose click does nothing is the exact dead-click shape the whole
// strip was built to end.
//
// P4 — no globals. P6 — dispatches nothing, writes no store: this is a scroll and a focus.

import { trace } from '@opentelemetry/api';
import { DESIGN_STAGE_CARD_CONTROL, DESIGN_STAGE_CONTROL_ATTR } from './designStagePanel';
import type { DesignStage } from './designStageModel';

const _tracer = trace.getTracer('pryzm.site.designStageStripControl');

/** The attribute an available-and-on-card pill carries. */
export const DESIGN_STAGE_JUMP_ATTR = 'data-design-stage-jump';
/** The status line under the strip where a failed jump explains itself. */
export const DESIGN_STAGE_JUMP_STATUS_TESTID = 'envelope-design-stage-jump-status';

const KNOWN_STAGES: ReadonlySet<string> = new Set<DesignStage>([
    'massing', 'requirements', 'layout', 'bim', 'detail',
]);

/**
 * Attach the jump handlers under `root`. Returns the number of pills wired.
 *
 * `stopPropagation` because the strip sits inside the card whose header is a drag handle.
 */
export function wireDesignStageStrip(root: ParentNode): number {
    const span = _tracer.startSpan('pryzm.site.wireDesignStageStrip');
    try {
        let wired = 0;
        root.querySelectorAll<HTMLButtonElement>(`button[${DESIGN_STAGE_JUMP_ATTR}]`).forEach((btn) => {
            const raw = btn.getAttribute(DESIGN_STAGE_JUMP_ATTR);
            if (raw === null || !KNOWN_STAGES.has(raw)) return;
            const stage = raw as DesignStage;
            btn.onclick = (ev) => {
                ev.stopPropagation();
                ev.preventDefault();
                jumpToStageControl(root, stage);
            };
            wired++;
        });
        span.setAttribute('pryzm.designStage.wiredJumps', wired);
        return wired;
    } finally {
        span.end();
    }
}

/**
 * Perform the jump. Exported so a test can drive it without a click, and so the click handler
 * above is one line. Returns whether a control was found.
 */
export function jumpToStageControl(root: ParentNode, stage: DesignStage): boolean {
    const status = root.querySelector<HTMLElement>(`[data-testid="${DESIGN_STAGE_JUMP_STATUS_TESTID}"]`);
    const target = root.querySelector<HTMLElement>(`[${DESIGN_STAGE_CONTROL_ATTR}="${stage}"]`);
    if (!target) {
        if (status) {
            status.textContent = DESIGN_STAGE_CARD_CONTROL[stage].onCard
                ? 'That control is not on this arm of the card — it appears once a buildable footprint '
                  + '(or, failing that, the study-height entry) is available.'
                : DESIGN_STAGE_CARD_CONTROL[stage].hint;
        }
        return false;
    }
    // Open every fold between the strip and the control, or the scroll lands on a closed summary.
    let el: HTMLElement | null = target;
    while (el) {
        if (el.tagName === 'DETAILS') (el as HTMLDetailsElement).open = true;
        el = el.parentElement;
    }
    target.setAttribute('data-stage-jumped', '1');
    try {
        target.scrollIntoView?.({ block: 'nearest' });
    } catch {
        /* happy-dom / older engines: scrolling is a courtesy, not the contract */
    }
    const field = target.querySelector<HTMLElement>('input, select, textarea, button');
    try {
        field?.focus?.();
    } catch {
        /* focus is a courtesy too */
    }
    if (status) status.textContent = '';
    return true;
}
