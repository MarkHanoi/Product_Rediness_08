/**
 * parcelLawQuestionGroup — the Parcel Law tab's INFORMATION ARCHITECTURE primitive.
 *
 * Layer Affected:  UI — Analysis surface (L7)
 * File:            apps/editor/src/ui/analysis/parcelLawQuestionGroup.ts
 * Strategy:        STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §26.2 · §26.3 · §26.5
 * Contracts:       C57 §1.9 (attribution travels with the figure) ·
 *                  C58 §1.2 (a figure's confidence is part of the figure) ·
 *                  C19 §5.6 clause 1 (nothing is re-derived by a host) · C08 §3.1 (no HTML sink)
 * Issue log:       L-12998
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THIS FILE ADDS NO FACT. IT IS A CONTAINER AND A MIRROR.
 * ─────────────────────────────────────────────────────────────────────────────
 * Founder 2026-09-06: *"honestly a lot is done — i can see most of the pieces working and i am
 * impressed — is just that is not well organize."* The capability gap is closed; the
 * information-architecture gap is open. §26.3 states the fix precisely: the tab is ordered the
 * way the MODEL is ordered — parcel facts, then ordinance, then massing, then authoring, then
 * quantities, then cost — which is the order a PROGRAMMER discovers them in. An architect or a
 * land developer arrives with six QUESTIONS, in a fixed order, and this module is the six.
 *
 * ⛔ A GROUP MAY NOT COMPUTE. Every number on this tab is produced by a module the tab already
 * depends on (C19 §5.6 clause 1 — these are setbacks, heights and FAR cited to ordinance
 * articles, and two surfaces that can disagree about a setback is a defect that reaches the
 * user's land). This primitive therefore holds sections; it never builds one.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THE DIGEST IS A MIRROR OF THE BODY, NEVER A SECOND DERIVATION
 * ─────────────────────────────────────────────────────────────────────────────
 * Progressive disclosure has one failure mode that this tab cannot afford: a collapsed group
 * that hides whether the figure inside it is SOLVED, ESTIMATED or an UNREVIEWED SUGGESTION.
 * C58 §1.2 makes confidence part of the figure, not an annotation on it, so a disclosure that
 * shows a number without its confidence has broken the contract even though it deleted nothing.
 *
 * So a collapsed group still states BOTH: its headline figure and that figure's confidence.
 * And it obtains them the only way that cannot drift — by READING THE TEXT ALREADY RENDERED
 * INSIDE ITS OWN BODY through a declared selector. If the row is not there, the digest is
 * silent; it never substitutes a value of its own. A mirror cannot disagree with the thing it
 * reflects, which is exactly the property C19 §5.7 clause 1 asks for and which a second
 * computation could not give us at any price.
 *
 * P4 — no `(window as any)`; this module touches no global. P6 — it writes no store; a group is
 * a `<details>` and its open/closed state is view state, not domain state (P7). P8 — one span
 * per exported function. C08 §3.1 — `createElement` + `textContent` only, no HTML sink.
 */

import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm.analysis.parcelLawQuestionGroup');

/** PRYZM purple. White + purple, never black ([[preview-color-unified-pryzm-purple]]). */
export const PLAW_PURPLE = '#6600FF';
/** The tab's ink — a deep violet-grey, and deliberately NOT `#000`. */
export const PLAW_INK = '#2b2740';
/** The tab's muted text, used for every source and hint line already on this surface. */
export const PLAW_MUTED = '#8a83a0';
/** The tab's hairline. */
export const PLAW_RULE = '#efecf7';

/** `data-testid` on every question group. Suffixed with the group id. */
export const QUESTION_GROUP_TESTID_PREFIX = 'parcel-law-q-';
/** `data-testid` on the digest a COLLAPSED group still states. */
export const QUESTION_GROUP_DIGEST_TESTID_PREFIX = 'parcel-law-q-digest-';
/** Attribute carrying the group's ordinal, so a spec can assert the ORDER without reading text. */
export const QUESTION_GROUP_ORDINAL_ATTR = 'data-question-ordinal';
/** Attribute carrying the confidence the digest mirrored, or `none` when the body stated one. */
export const QUESTION_GROUP_CONFIDENCE_ATTR = 'data-question-confidence';

/**
 * One probe into the group's ALREADY-RENDERED body.
 *
 * ⛔ `selector` is queried inside the group body and nowhere else. A probe that reached outside
 * the group could mirror a figure the reader cannot see by opening this group, which is the
 * disclosure defect inverted.
 */
export interface DigestProbe {
    /** Queried within the group body. First match wins. */
    readonly selector: string;
    /** Read this attribute rather than the node's text. Used for `data-state` / `data-arm`. */
    readonly attr?: string;
    /** Prepended to the mirrored text, e.g. `'≈ '`. Never replaces it. */
    readonly prefix?: string;
}

/** The six persona questions of STR §26.3, as data. */
export interface QuestionGroupSpec {
    /** Stable id — the testid suffix and the open/closed memory key. */
    readonly id: string;
    /** 1..6. Rendered as the chip and asserted by the ordering spec. */
    readonly ordinal: number;
    /** The question, in the persona's words (STR §26.3). */
    readonly question: string;
    /** One line naming what is inside, so a collapsed group is still navigable. */
    readonly hint: string;
    /** Whether this group opens expanded on a cold mount. */
    readonly open: boolean;
    /** Probed in order; the first that resolves supplies the collapsed headline. */
    readonly headlineProbes: readonly DigestProbe[];
    /** Probed in order; the first that resolves supplies the collapsed confidence. */
    readonly confidenceProbes: readonly DigestProbe[];
    /** Stated when NO probe resolves. An honest absence, never a zero. */
    readonly emptyDigest: string;
}

export interface QuestionGroupHandle {
    readonly element: HTMLDetailsElement;
    /** The slot sections are mounted into. */
    readonly body: HTMLElement;
    /** Re-read the digest from what is ALREADY in the body. Derives nothing; never throws. */
    refreshDigest(): void;
    dispose(): void;
}

/**
 * ⭐ THE SIX QUESTIONS — STR §26.3, verbatim in order.
 *
 * *"An architect or land developer arrives with a QUESTION, and the questions have a natural
 * sequence: 1. What is this plot? 2. What may I build here, and who says so? 3. What do I want
 * to build? 4. How much of my allowance have I used, and what is left? 5. What does it cost?
 * 6. Take me into BIM."*
 *
 * ⭐ Question 2 was RENAMED by the founder on 2026-09-07 (§26.6.2, L-13046): *"What CAN I build
 * here?"*. The §26.3 wording above is kept as the record of where the sequence came from.
 *
 * ⭐ WHY ONLY THE FIRST TWO OPEN COLD. §26.5 asks what is above the fold and why. A cold arrival
 * has no envelope, so groups 3–6 have nothing of their own to say yet — their digests say so in
 * words. The two that ALWAYS have an answer (what this plot is, and what the law permits on it)
 * are the two the reader came for, and they are the two that open. Once an envelope exists, the
 * user has opened 3 themselves and its state is remembered for the session.
 */
export const PARCEL_LAW_QUESTION_GROUPS: readonly QuestionGroupSpec[] = Object.freeze([
    Object.freeze({
        id: 'plot',
        ordinal: 1,
        question: 'What is this plot?',
        hint: 'Reference, address, area, source and when it was retrieved.',
        open: true,
        headlineProbes: Object.freeze([
            { selector: '[data-testid="parcel-law-fact-parcel-area"] .anl-plaw-val' },
            { selector: '[data-testid="parcel-law-geometry-absent"]' },
        ]),
        confidenceProbes: Object.freeze([
            { selector: '[data-testid="parcel-source-attribution"]' },
            { selector: '[data-testid="parcel-law-geometry-absent"]', attr: 'data-absence' },
        ]),
        emptyDigest: 'no plot committed',
    }),
    Object.freeze({
        id: 'law',
        ordinal: 2,
        // §26.6.2 (L-13046, founder 2026-09-07): *"RENAME from 'What may I build here?' to 'What
        // CAN I build here?'"* — his words, verbatim. "Who says so" moves into the hint: it is
        // still the question's substance (the citations are C58 §1.3), it is no longer its title.
        question: 'What can I build here?',
        hint: 'The buildable envelope, the setback per edge, its ordinance citations (who says so) and its confidence.',
        open: true,
        headlineProbes: Object.freeze([
            { selector: '[data-testid="parcel-law-fact-footprint"] .anl-plaw-val' },
            { selector: '[data-testid="parcel-law-fact-max-height"] .anl-plaw-val' },
            { selector: '.anl-plaw-refusal-headline' },
            { selector: '[data-testid="parcel-law-envelope-absent"]' },
        ]),
        confidenceProbes: Object.freeze([
            { selector: '.anl-plaw-refusal', attr: 'data-refusal-code' },
            { selector: '.anl-plaw-group-source' },
            { selector: '[data-testid="parcel-law-determined-at"]' },
        ]),
        emptyDigest: 'no determination held',
    }),
    Object.freeze({
        id: 'intent',
        ordinal: 3,
        question: 'What do I want to build?',
        hint: 'Create the envelope, choose its storeys, edit the perimeter you drew.',
        open: false,
        headlineProbes: Object.freeze([
            { selector: '[data-testid="parcel-law-authoring-status"]' },
            { selector: '[data-testid="parcel-law-authoring-source"]' },
        ]),
        confidenceProbes: Object.freeze([
            { selector: '[data-testid="parcel-law-authoring-status"]', attr: 'data-state' },
        ]),
        emptyDigest: 'nothing authored yet',
    }),
    Object.freeze({
        id: 'allowance',
        ordinal: 4,
        question: 'How much of my allowance have I used?',
        hint: 'The BRUT/NET ledger per storey, and what is left.',
        open: false,
        headlineProbes: Object.freeze([
            { selector: '[data-testid="envelope-brut-allocation-headline"]' },
            { selector: '[data-testid="live-quantities-total"]' },
            { selector: '[data-testid="live-quantities-unreadable"]' },
        ]),
        confidenceProbes: Object.freeze([
            { selector: '[data-testid="envelope-brut-allocation-headline"]', attr: 'data-state' },
            { selector: '[data-testid="live-quantities-none-declared"]', attr: 'data-testid' },
        ]),
        emptyDigest: 'no allowance ledger yet',
    }),
    Object.freeze({
        id: 'cost',
        ordinal: 5,
        question: 'What does it cost?',
        hint: 'Your cost per m², and the indicative total it produces.',
        open: false,
        headlineProbes: Object.freeze([
            { selector: '[data-testid="live-quantities-cost-amount"]', prefix: '≈ ' },
            { selector: '[data-testid="live-quantities-cost"]' },
        ]),
        confidenceProbes: Object.freeze([
            { selector: '[data-testid="live-quantities-cost"]', attr: 'data-arm' },
        ]),
        emptyDigest: 'no rate set',
    }),
    Object.freeze({
        id: 'bim',
        ordinal: 6,
        question: 'Take me into BIM.',
        hint: 'Build the house this envelope describes — and what that will and will not create.',
        open: false,
        headlineProbes: Object.freeze([
            { selector: '[data-testid="create-house-status"]' },
            { selector: '[data-testid="create-house-refusal"]' },
            { selector: '[data-testid="create-house-plan"]' },
        ]),
        confidenceProbes: Object.freeze([
            { selector: '[data-testid="analysis-parcel-law-create-house"]', attr: 'data-arm' },
        ]),
        emptyDigest: 'not ready to build',
    }),
]);

/**
 * Open/closed state, per group id, for THIS page session.
 *
 * ⭐ NOT `localStorage`, and not a store. The tab body is torn out of the DOM on every tab
 * change and rebuilt on the way back (see `parcelLawTab.ts`'s header — that teardown is what
 * stops the singleton card being stranded on a hidden surface). Without a memory, every return
 * to the tab would re-collapse a group the reader had deliberately opened, which turns
 * progressive disclosure into an obstacle. A module-level map is the smallest thing that fixes
 * that; it is view state (P7 — visibility intent is a domain concept, this is not one) and it
 * is deliberately NOT persisted, so a new session gets the designed defaults back.
 */
const openState = new Map<string, boolean>();

/** Forget every remembered disclosure state. Exported for the spec; never called in production. */
export function resetQuestionGroupOpenState(): void {
    openState.clear();
}

/** Truncate for the digest line without ever changing the value's meaning. */
function clip(text: string, max: number): string {
    const t = text.replace(/\s+/g, ' ').trim();
    return t.length <= max ? t : `${t.slice(0, Math.max(0, max - 1))}…`;
}

/** Resolve the first probe that finds something REAL in the body. Never derives. */
function probe(body: ParentNode, probes: readonly DigestProbe[]): string {
    for (const p of probes) {
        let node: Element | null = null;
        try {
            node = body.querySelector(p.selector);
        } catch {
            // A malformed selector is a bug in the spec above, not a finding about the parcel.
            continue;
        }
        if (!node) continue;
        const raw = p.attr ? (node.getAttribute(p.attr) ?? '') : (node.textContent ?? '');
        const text = raw.replace(/\s+/g, ' ').trim();
        if (text.length === 0) continue;
        return p.prefix ? `${p.prefix}${text}` : text;
    }
    return '';
}

/**
 * Build one question group.
 *
 * The returned `body` is the mount slot. The caller places SECTIONS in it; this function places
 * no content of its own beyond the summary row, and computes nothing.
 */
export function buildQuestionGroup(spec: QuestionGroupSpec): QuestionGroupHandle {
    const span = _tracer.startSpan('pryzm.analysis.buildQuestionGroup');
    const el = document.createElement('details');
    el.className = 'anl-plaw-q';
    el.setAttribute('data-testid', `${QUESTION_GROUP_TESTID_PREFIX}${spec.id}`);
    el.setAttribute(QUESTION_GROUP_ORDINAL_ATTR, String(spec.ordinal));
    el.open = openState.get(spec.id) ?? spec.open;
    el.style.cssText =
        'margin-top:8px;border:1px solid #e7e2f5;border-radius:10px;background:#ffffff;'
        + 'overflow:hidden;min-width:0;max-width:100%;';

    const summary = document.createElement('summary');
    summary.className = 'anl-plaw-q-summary';
    summary.style.cssText =
        'display:flex;align-items:center;gap:8px;cursor:pointer;list-style:none;'
        + 'padding:7px 9px;user-select:none;';

    // The ordinal chip. Purple on white — the tab's whole palette, stated once here.
    const chip = document.createElement('span');
    chip.className = 'anl-plaw-q-chip';
    chip.textContent = String(spec.ordinal);
    chip.style.cssText =
        `flex:none;display:inline-flex;align-items:center;justify-content:center;width:16px;`
        + `height:16px;border-radius:50%;background:${PLAW_PURPLE};color:#ffffff;`
        + `font:700 9.5px system-ui;`;
    summary.appendChild(chip);

    const titleCol = document.createElement('span');
    titleCol.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;';
    const q = document.createElement('span');
    q.className = 'anl-plaw-q-title';
    q.textContent = spec.question;
    q.style.cssText = `font:600 11.5px system-ui;color:${PLAW_INK};`;
    titleCol.appendChild(q);
    const hint = document.createElement('span');
    hint.className = 'anl-plaw-q-hint';
    hint.textContent = spec.hint;
    hint.style.cssText =
        `font:400 9px system-ui;color:${PLAW_MUTED};overflow:hidden;text-overflow:ellipsis;`
        + `white-space:nowrap;`;
    titleCol.appendChild(hint);
    summary.appendChild(titleCol);

    // ⭐ THE DIGEST — C58 §1.2. Headline AND confidence, both mirrored from the body below.
    const digest = document.createElement('span');
    digest.className = 'anl-plaw-q-digest';
    digest.setAttribute('data-testid', `${QUESTION_GROUP_DIGEST_TESTID_PREFIX}${spec.id}`);
    digest.style.cssText =
        'flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:1px;'
        + 'max-width:46%;text-align:right;';
    const digestValue = document.createElement('span');
    digestValue.className = 'anl-plaw-q-digest-value';
    digestValue.style.cssText = `font:600 10px system-ui;color:${PLAW_INK};`;
    const digestConfidence = document.createElement('span');
    digestConfidence.className = 'anl-plaw-q-digest-confidence';
    digestConfidence.style.cssText =
        `font:500 8.5px system-ui;color:${PLAW_PURPLE};letter-spacing:.02em;`;
    digest.appendChild(digestValue);
    digest.appendChild(digestConfidence);
    summary.appendChild(digest);

    el.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'anl-plaw-q-body';
    body.style.cssText =
        `padding:2px 9px 9px;border-top:1px solid ${PLAW_RULE};min-width:0;max-width:100%;`;
    el.appendChild(body);

    const refreshDigest = (): void => {
        try {
            const headline = probe(body, spec.headlineProbes);
            const confidence = probe(body, spec.confidenceProbes);
            digestValue.textContent = headline.length > 0 ? clip(headline, 34) : spec.emptyDigest;
            // ⛔ A headline with no confidence beside it is the C58 §1.2 breach this digest
            // exists to avoid, so the absence is STATED rather than left blank.
            digestConfidence.textContent = confidence.length > 0
                ? clip(confidence, 30)
                : (headline.length > 0 ? 'confidence not stated' : '');
            el.setAttribute(QUESTION_GROUP_CONFIDENCE_ATTR, confidence.length > 0 ? confidence : 'none');
        } catch (e) {
            // A digest that throws must not take the group with it — the sections inside are
            // the answer, and the digest is only their summary.
            console.warn('[analysis][parcel-law] digest refresh failed (non-fatal):', e);
        }
    };

    const onToggle = (): void => { openState.set(spec.id, el.open); };
    el.addEventListener('toggle', onToggle);

    // ─────────────────────────────────────────────────────────────────────────────────────
    // ⭐ THE MIRROR KEEPS ITSELF TRUE, AND IT WATCHES THE ONLY THING IT CAN TRUST
    // ─────────────────────────────────────────────────────────────────────────────────────
    // Every section in a group repaints on its OWN channel — the space-envelope dirty channel,
    // the site store, the indicative-rate channel — and no one of those is a signal this file
    // could subscribe to without becoming a fourth update path (RESI-ORCHESTRATOR-PLAN §3:
    // honour the existing synchronisation contract, do not invent another one).
    //
    // So the digest observes the DOM it mirrors. That is not a shortcut: the digest's entire
    // claim is *"this is what the body says"*, and the body is precisely the thing that changed.
    // Any refresh keyed on anything else could be right about the store and wrong about the
    // screen, which is the stale-figure defect in miniature.
    //
    // ⛔ THE SUMMARY IS NOT OBSERVED, only the body — the digest writes into the summary, so
    // observing the whole group would make this loop on its own output.
    let pending = false;
    const observer = typeof MutationObserver === 'function'
        ? new MutationObserver(() => {
            if (pending) return;
            pending = true;
            queueMicrotask(() => { pending = false; refreshDigest(); });
        })
        : null;
    try {
        observer?.observe(body, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['data-state', 'data-arm', 'data-refusal-code', 'data-absence', 'data-derived'],
        });
    } catch (e) {
        // Without an observer the digest still refreshes on the tab's own repaint path; it is a
        // degraded refresh rate, never a wrong value.
        console.warn('[analysis][parcel-law] digest observer failed (non-fatal):', e);
    }

    refreshDigest();
    span.setAttribute('pryzm.analysis.questionGroup.id', spec.id);
    span.end();

    return {
        element: el,
        body,
        refreshDigest,
        dispose(): void {
            try { observer?.disconnect(); } catch { /* teardown is best-effort */ }
            try { el.removeEventListener('toggle', onToggle); } catch { /* best effort */ }
            el.remove();
        },
    };
}
