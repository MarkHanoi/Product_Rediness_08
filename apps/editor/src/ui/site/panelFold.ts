/**
 * panelFold — §ENVELOPE-CARD-FOLDS (L-13249) — the ONE disclosure used by the floating
 * Site-view panels (the Envelope tool and anything that grows the same way).
 *
 * Layer Affected:  UI — Site surface (L7). No THREE (P2), no rAF (P3), no
 *                  `(window as any)` (P4), no store writes (P6).
 * Contracts:       C08 §3.1 (createElement + textContent only, never an HTML sink) ·
 *                  C115 §11 `C115-91` (do NOT add a rival disclosure mechanism) ·
 *                  C58 §1.2 (a collapsed section must not hide a figure's confidence).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ WHY THIS EXISTS AND WHY IT IS NOT A NEW MECHANISM
 * ─────────────────────────────────────────────────────────────────────────────
 * Founder, on the Envelope tool card: *"we need to make is 20% of the space with drop down
 * menus that the usser opens on deman and the card expands - it is too large"*.
 *
 * `C115-91` measured FIVE rival disclosure mechanisms on the Parcel Law surface and forbids
 * fixing that by adding a sixth. So this file does NOT own a memory: it reads and writes
 * `questionGroupFoldIsOpen` / `setQuestionGroupFoldOpen` — the SAME session-scoped map the six
 * Parcel Law question groups and the parcel-card fold already share, keyed by `data-testid`.
 * What this file owns is only the CHROME, because the floating white/violet panel is a
 * different visual surface from the Parcel Law tab and `buildQuestionGroup`'s summary row is
 * styled for that tab's type scale, not for a 300 px floating card.
 *
 * ⛔ NOT PERSISTED — deliberately, and for the same reason the map itself is not: a new session
 * gets the DESIGNED defaults back. A panel that reopened with every section expanded because the
 * user once opened them all would be the "too large" complaint again, arriving by memory.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ WHAT A COLLAPSED FOLD MAY NOT DO
 * ─────────────────────────────────────────────────────────────────────────────
 * It may hide EXPLANATION. It may not hide a REFUSAL, a WARNING, or a figure's confidence
 * (C58 §1.2 — confidence is part of the figure, not an annotation on it). Callers therefore fold
 * prose and ledgers; they must leave refusals, advisories and the create/draw controls on the
 * face of the card. `summaryNote` exists so a fold can carry the one fact that must survive
 * collapsing — it is rendered in the summary row itself, always visible.
 */

import { trace } from '@opentelemetry/api';
import {
    questionGroupFoldIsOpen,
    setQuestionGroupFoldOpen,
} from '../analysis/parcelLawQuestionGroup';

const _tracer = trace.getTracer('pryzm.site.panelFold');

/** PRYZM purple — white + violet only ([[preview-color-unified-pryzm-purple]]). */
const VIOLET = '#6600FF';

export interface PanelFoldSpec {
    /** Stable id. Becomes `data-testid` AND the key in the shared session fold memory. */
    readonly id: string;
    /** The always-visible label. Plain text (C08 §3.1). */
    readonly summary: string;
    /**
     * Default when this session has no remembered state for `id`.
     * ⛔ Default to `false` for anything that made the card too large; the founder's ask is that
     * the card is small on ARRIVAL and grows only when he opens something.
     */
    readonly open?: boolean;
}

export interface PanelFoldHandle {
    /** The `<details>` to place in the panel. */
    readonly el: HTMLDetailsElement;
    /** The mount slot. The caller puts content here; this module places none of its own. */
    readonly body: HTMLElement;
    /** Write the one fact that must stay readable while collapsed. `''` clears it. */
    readonly setSummaryNote: (text: string) => void;
}

/**
 * Build one fold.
 *
 * Places NO content beyond the summary row and computes nothing — the caller owns the body,
 * exactly as `buildQuestionGroup` does for the Parcel Law tab.
 */
export function buildPanelFold(spec: PanelFoldSpec): PanelFoldHandle {
    const span = _tracer.startSpan('pryzm.site.buildPanelFold');
    try {
        const el = document.createElement('details');
        el.setAttribute('data-testid', spec.id);
        el.open = questionGroupFoldIsOpen(spec.id, spec.open ?? false);
        el.style.cssText = 'margin-top:6px;border-top:1px solid #efecf7;padding-top:5px;';

        const summary = document.createElement('summary');
        summary.style.cssText = [
            'cursor:pointer', 'list-style:none', 'display:flex', 'align-items:baseline',
            'gap:6px', 'font-weight:600', 'font-size:10.5px', `color:${VIOLET}`,
            'user-select:none', 'outline:none',
        ].join(';');

        // ⚠ The marker is drawn by US, not by the UA. Chrome and Safari disagree about the
        // default triangle's box, and a `list-style:none` summary drops it entirely in WebKit —
        // so a caller-visible affordance must not depend on it.
        const marker = document.createElement('span');
        marker.setAttribute('aria-hidden', 'true');
        marker.style.cssText = `flex:none;font-size:9px;color:${VIOLET};transition:none;`;
        const paintMarker = (): void => { marker.textContent = el.open ? '▾' : '▸'; };
        paintMarker();

        const label = document.createElement('span');
        label.style.cssText = 'flex:1;min-width:0;';
        label.textContent = spec.summary;

        /** The one fact that survives collapsing (C58 §1.2). Empty until a caller writes it. */
        const note = document.createElement('span');
        note.setAttribute('data-testid', `${spec.id}-note`);
        note.style.cssText = 'flex:none;font-weight:600;font-size:9.5px;color:#8a83a0;';

        summary.append(marker, label, note);

        const body = document.createElement('div');
        body.setAttribute('data-testid', `${spec.id}-body`);
        body.style.cssText = 'margin-top:4px;';

        el.append(summary, body);

        // ⭐ THE MEMORY IS THE SHARED ONE. `toggle` fires for both directions and for a
        // programmatic `el.open = …`, so this is the only writer needed.
        el.addEventListener('toggle', () => {
            paintMarker();
            setQuestionGroupFoldOpen(spec.id, el.open);
        });

        span.setAttribute('pryzm.panelFold.id', spec.id);
        span.setAttribute('pryzm.panelFold.open', el.open);

        return {
            el,
            body,
            setSummaryNote: (text: string): void => { note.textContent = text; },
        };
    } finally {
        span.end();
    }
}
