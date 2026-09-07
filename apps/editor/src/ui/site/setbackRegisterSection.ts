// §26.6.2 (L-13046) — THE SETBACK REGISTER'S RENDERER. A `<details>` — *"THIS SHOULD BE DROPDOWN
// AS IT CAN GET A LOT OF DATA"* — collapsed by default, one row per edge, each row's label the
// highlight control that lights THAT edge (§26.6 rule 2).
//
// ⛔ RENDERS A DECISION, DECIDES NOTHING. Every sentence, every class and every availability is on
// the `SetbackRegister` it is handed (`setbackRegisterModel.ts`); this file adds typography and the
// ONE control it is licensed to place — `buildSiteHighlightLabelEl`, the same builder the cadastral
// card and the envelope card use, so a click here writes the same store the views paint from.
//
// C08 §3.1 — `createElement` + `textContent` only; no HTML sink. Citations and refusal headlines are
// provider strings and reach the DOM as text. ⛔ NO COLOUR LITERAL — structural layout only; the
// ink is inherited from the Analysis surface (the L-1361 rule `parcelLawFacts.ts` keeps).

import { trace } from '@opentelemetry/api';
import { getSiteHighlight } from './siteGeometryHighlight';
import { buildSiteHighlightLabelEl } from './siteHighlightRowControl';
import { SETBACK_CLASS_UNKNOWN_NOTE, type SetbackRegister } from './setbackRegisterModel';

const _tracer = trace.getTracer('pryzm.site.setbackRegisterSection');

/** `data-testid` on the `<details>` root. */
export const SETBACK_REGISTER_TESTID = 'parcel-law-setback-register';
/** `data-testid` prefix on each edge row: `parcel-law-setback-edge-<index>`. */
export const SETBACK_REGISTER_ROW_PREFIX = 'parcel-law-setback-edge-';
/** Attribute on each row carrying the verdict arm, so a spec asserts the ARM and not a sentence. */
export const SETBACK_REGISTER_ARM_ATTR = 'data-setback-arm';
/** Attribute on each row carrying the edge class as the register knows it. */
export const SETBACK_REGISTER_CLASS_ATTR = 'data-edge-class';
/** `data-testid` on the sentence rendered when no parcel could be read. */
export const SETBACK_REGISTER_ABSENT_TESTID = 'parcel-law-setback-register-absent';
/** `data-testid` on the C19 §10.1 note, rendered only when at least one edge's class is unknown. */
export const SETBACK_REGISTER_UNKNOWN_NOTE_TESTID = 'parcel-law-setback-register-unknown-note';
/** The `<summary>` heading. */
export const SETBACK_REGISTER_TITLE = 'Setbacks per edge';

function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    cls: string,
    text?: string,
): HTMLElementTagNameMap[K] {
    const n = document.createElement(tag);
    n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
}

/**
 * Build the register. `open` lets a host preserve the reader's disclosure state across its own
 * re-renders — a fold that snaps shut on every store notification is an obstacle, not a dropdown.
 */
export function buildSetbackRegisterSection(
    register: SetbackRegister,
    opts?: { readonly open?: boolean },
): HTMLDetailsElement {
    const span = _tracer.startSpan('pryzm.site.buildSetbackRegisterSection');
    try {
        const root = document.createElement('details');
        root.className = 'anl-plaw-setback-register';
        root.setAttribute('data-testid', SETBACK_REGISTER_TESTID);
        root.setAttribute('data-register-kind', register.kind);
        root.open = opts?.open === true;
        root.style.marginTop = '9px';

        const summary = document.createElement('summary');
        summary.className = 'anl-plaw-setback-summary';
        summary.style.cssText = 'cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:8px;align-items:baseline;';
        const title = el('span', 'anl-plaw-group-name', SETBACK_REGISTER_TITLE);
        title.style.cssText = 'font-weight:700;font-size:10px;letter-spacing:.04em;text-transform:uppercase;';
        summary.appendChild(title);
        const digest = el('span', 'anl-plaw-setback-digest', register.kind === 'rows' ? register.summary : 'no parcel outline');
        digest.style.cssText = 'font-size:9.5px;opacity:0.75;text-align:right;';
        summary.appendChild(digest);
        root.appendChild(summary);

        const body = el('div', 'anl-plaw-setback-body');
        body.style.marginTop = '4px';
        root.appendChild(body);

        if (register.kind === 'no-parcel') {
            const miss = el('div', 'anl-plaw-absent', register.sentence);
            miss.setAttribute('data-testid', SETBACK_REGISTER_ABSENT_TESTID);
            miss.style.cssText = 'font-size:10px;line-height:1.5;';
            body.appendChild(miss);
            span.setAttribute('pryzm.setbackRegister.rows', 0);
            return root;
        }

        const lede = el('div', 'anl-plaw-group-lede', register.lede);
        lede.style.cssText = 'font-size:10px;line-height:1.45;margin:2px 0 5px;opacity:0.85;';
        body.appendChild(lede);

        const on = getSiteHighlight();
        for (const r of register.rows) {
            const row = el('div', 'anl-plaw-setback-row');
            row.setAttribute('data-testid', `${SETBACK_REGISTER_ROW_PREFIX}${r.index}`);
            row.setAttribute(SETBACK_REGISTER_ARM_ATTR, r.verdict.kind);
            row.setAttribute(SETBACK_REGISTER_CLASS_ATTR, r.edgeClass);
            row.style.cssText = 'padding:4px 0;border-top:1px solid rgba(0,0,0,0.06);';

            const head = el('div', 'anl-plaw-setback-head');
            head.style.cssText = 'display:flex;justify-content:space-between;gap:10px;align-items:baseline;';
            const key = el('span', 'anl-plaw-key');
            // §26.6 rule 2 — the label IS the link. One builder, one store.
            key.appendChild(buildSiteHighlightLabelEl(r.label, r.highlightSubject, r.availability, on === r.highlightSubject));
            head.appendChild(key);
            const meta = el('span', 'anl-plaw-val', `${r.lengthM.toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m · ${r.classText}`);
            meta.style.cssText = 'font-weight:500;text-align:right;font-size:10px;opacity:0.85;';
            head.appendChild(meta);
            row.appendChild(head);

            const verdict = el('div', 'anl-plaw-setback-verdict', r.verdict.sentence);
            verdict.style.cssText = 'font-size:10px;line-height:1.45;margin-top:2px;';
            if (r.verdict.kind === 'applied') {
                // A stated number carries the weight of one; every other arm is a sentence.
                verdict.style.fontWeight = '600';
            } else if (r.verdict.kind === 'class-unknown' || r.verdict.kind === 'not-derived') {
                verdict.style.fontStyle = 'italic';
            }
            row.appendChild(verdict);
            body.appendChild(row);
        }

        if (register.anyClassUnknown) {
            const note = el('div', 'anl-plaw-setback-unknown-note', SETBACK_CLASS_UNKNOWN_NOTE);
            note.setAttribute('data-testid', SETBACK_REGISTER_UNKNOWN_NOTE_TESTID);
            note.style.cssText = 'margin-top:6px;font-size:9.5px;line-height:1.45;opacity:0.8;';
            body.appendChild(note);
        }

        span.setAttribute('pryzm.setbackRegister.rows', register.rows.length);
        return root;
    } finally {
        span.end();
    }
}
