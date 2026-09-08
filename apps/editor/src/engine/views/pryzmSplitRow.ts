/**
 * pryzmSplitRow.ts — §ONE-REGION-SWITCHER (founder 2026-09-08 · L-13257 · C59 §1.5)
 *
 * Layer Affected:  engine — view chrome (DOM only; no renderer, no store, no THREE)
 * File:            apps/editor/src/engine/views/pryzmSplitRow.ts
 * Contracts:       C59 §1.5.2 (every region carries the same switcher) · C59 §1.4 (full screen
 *                  is a LAYOUT fact, not a second mechanism) · STR §26.1.1 (a refusal SPEAKS) ·
 *                  C06 §6.1 (one chrome language) · C08 §3.1 (textContent, never an HTML sink)
 * Issue log:       L-13257
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ASK
 * ─────────────────────────────────────────────────────────────────────────────
 * *"I want to have two options - no matter whether the user is in Site / Author / Inspect /
 * Analyse - the user could have the views split ... or not split - single view."*
 *
 * ⛔ MEASURED: on a PRYZM view there was NO split control. `.vsw-split` lives on the Analysis
 * on-view bar and reasons about the SITE-AUTHORING pane shell; the site panes carry their own
 * layout actions inside `PaneViewPicker`. The 3D+plan split could be OPENED only by the
 * post-generate landing, and CLOSED only from the plan pane's own header × button. That is the
 * one workspace where the founder's second option did not exist.
 *
 * ⭐ THIS FILE IS THE ROW, NOT THE DECISION. `describePryzmSplitToggle` decides; this renders,
 * and BOTH PRYZM pills mount this same function — so the model half and the plan half cannot
 * drift into two different-looking split buttons, which is the defect one level up.
 *
 * ⚠ IT READS `window.splitViewManager` THROUGH AN INJECTED PORT, never directly, so the row is
 * headless-testable and P4 holds. The host supplies the port; a host that cannot gets a
 * DISABLED row carrying the reason, not a hidden one — a control that vanishes when it cannot
 * act teaches the user it does not exist (STR §26.1.1).
 */

import { trace } from '@opentelemetry/api';
import { describePryzmSplitToggle } from './viewRegionSwitcher';

const _tracer = trace.getTracer('pryzm.views.pryzmSplitRow');

/** PRYZM purple — white + violet only ([[preview-color-unified-pryzm-purple]]). */
const BRAND = '#6600FF';

export const PRYZM_SPLIT_ROW_TESTID = 'pryzm-split-row';

/**
 * The split owner, as this row is allowed to see it.
 *
 * ⛔ DELIBERATELY NOT `SplitViewManager` ITSELF. Typing the port to the class would drag the
 * THREE-importing module into every host of this row and make the row untestable without a
 * GPU. Three methods are the whole surface it needs.
 */
export interface PryzmSplitPort {
    /** Is the plan pane on screen right now? A READING, never a remembered command. */
    readonly isOpen: () => boolean;
    readonly open: () => void;
    readonly close: () => void;
}

export interface PryzmSplitRowHandle {
    readonly element: HTMLElement;
    /** Re-read the port and repaint. Cheap; call whenever the popup opens. */
    readonly repaint: () => void;
}

/**
 * Build the split/single row for a PRYZM region's pill popup.
 *
 * @param port `null` ⇒ this session has no split owner. The row still renders, DISABLED, with
 *             the reason on it — see the header.
 */
export function buildPryzmSplitRow(port: PryzmSplitPort | null): PryzmSplitRowHandle {
    const span = _tracer.startSpan('pryzm.views.buildPryzmSplitRow');
    try {
        const wrap = document.createElement('div');
        wrap.setAttribute('data-testid', PRYZM_SPLIT_ROW_TESTID);
        wrap.style.cssText =
            'margin-top:8px;padding-top:8px;border-top:1px solid #efecf7;'
            + 'display:flex;flex-direction:column;gap:5px;';

        const cap = document.createElement('div');
        // ⛔ NO px FONT SIZE — §ONE-TYPE-BASE. The pill's root sets the base and C43 / WCAG 2.2
        // AA already puts a 10 px floor under it; a literal here is how `panelFold.ts` shipped
        // a real 9 px accessibility regression. Hierarchy is carried by weight and colour.
        cap.style.cssText = `font-weight:600;color:${BRAND};`;
        cap.textContent = 'Layout';
        wrap.appendChild(cap);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('data-testid', `${PRYZM_SPLIT_ROW_TESTID}-toggle`);
        btn.style.cssText = [
            'appearance:none', 'text-align:left', 'display:block', 'width:100%',
            'padding:6px 9px', 'border-radius:8px',
            `border:1px solid ${BRAND}`, 'background:#ffffff', `color:${BRAND}`,
            'font:inherit', 'font-weight:600', 'cursor:pointer',
        ].join(';');

        const paint = (): void => {
            const open = (() => {
                try { return port?.isOpen() === true; } catch { return false; }
            })();
            const shown = describePryzmSplitToggle({ open, canToggle: port !== null });
            btn.textContent = shown.label;
            btn.disabled = !shown.enabled;
            btn.title = shown.title;
            btn.setAttribute('aria-pressed', shown.pressed ? 'true' : 'false');
            // Published so a spec asserts the STATE rather than inferring it from a label.
            btn.setAttribute('data-split-open', open ? 'true' : 'false');
            btn.style.opacity = shown.enabled ? '1' : '0.5';
            btn.style.cursor = shown.enabled ? 'pointer' : 'not-allowed';
        };
        paint();

        btn.addEventListener('click', () => {
            if (btn.disabled || !port) return;
            try {
                // ⚠ The PORT is re-read, not a captured boolean: the pane can have been closed
                // from its own header since this popup was painted.
                if (port.isOpen()) port.close(); else port.open();
            } catch (e) {
                console.warn('[views] §ONE-REGION-SWITCHER split toggle failed (non-fatal):', e);
            }
            paint();
        });

        wrap.appendChild(btn);
        span.setAttribute('pryzm.pryzmSplitRow.wired', port !== null);
        return { element: wrap, repaint: paint };
    } finally {
        span.end();
    }
}

/**
 * The port over `window.splitViewManager`, or `null` when this session has none.
 *
 * ⚠ PROBED, NEVER ASSUMED. `window.splitViewManager` is typed but is populated by the editor
 * shell at runtime; a headless or alternate shell has none, and reaching for `.activate` on
 * `undefined` would take the whole popup down with it. Both methods are probed because a
 * partially-wired manager is a real state ([[context-data-honesty-family]] — failure and
 * empty must not read as the same value).
 */
export function resolvePryzmSplitPort(): PryzmSplitPort | null {
    // ⚠ `window.splitViewManager` IS declared in `globals.d.ts` — as `unknown`, deliberately,
    // because typing it to the class would import a THREE-owning module into the global shim.
    // So this narrows the declared global; it is NOT a `(window as any)` reach-through (P4).
    const svm = window.splitViewManager as {
        isActive?: boolean;
        activate?: () => void;
        deactivate?: () => void;
    } | undefined;
    if (!svm || typeof svm.activate !== 'function' || typeof svm.deactivate !== 'function') {
        return null;
    }
    return {
        isOpen: () => svm.isActive === true,
        open: () => svm.activate?.(),
        close: () => svm.deactivate?.(),
    };
}
