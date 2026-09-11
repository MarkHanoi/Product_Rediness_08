// §ENVELOPE-SUMMARY-IN-QUESTION-1 (founder ruling 2026-09-11 — Site-panel restructure, Section 1 ·
// C115 §10 `C115-87`/`C115-88` · C58 §1.2 · C115-17 · L-13315)
//
// Founder 2026-09-11, the SITE panel mockup, Section 1 — *"What is this plot — and what can I build
// here?"*: *"Merged the original cadastral-facts card with the buildable envelope (max
// levels/height/implantation/GFA) and the setbacks-per-edge list, both moved here from the build step
// since they describe the plot rather than a design choice. Nothing from the original content was
// removed."*
//
// ═══════════════════════════════════════════════════════════════════════════════════════
// ⭐ WHAT MOVES, AND WHY IT IS A BLOCK AND NOT FOUR ROWS
// ═══════════════════════════════════════════════════════════════════════════════════════
// The four ceilings do not travel alone. C58 §1.2 makes a figure's confidence PART of the figure,
// and on the card the ceilings sit under the provenance badge (six arms, weakest-wins, C58 §5.4a)
// and above the source line (six arms, incl. *"Default rule pack — real DK/ES zoning coming"* and
// the citation's three-way fallback, PR-F-03). Moving the numbers without the badge would strip
// their standing on the way up. So the unit that moves is the card's SUMMARY: the badge · the
// stored-determination line · the four ceilings (or the degenerate refusal, or the alignment-zone
// depth/offset rows) · both upper-bound caveats · the source line — verbatim, on every arm.
//
// ⛔ ONE PRODUCER, ONE PASS, ONE MODEL READ — C115-88 clauses 2 and 7. The card (`GISAreaLayout`)
// still builds every byte of the summary in the SAME render pass, from the SAME `env` / `law` read,
// as the staged folds beneath it. This module never builds a figure. It owns three things only:
//   · the ELEMENT the summary is written into — a satellite that lives OUTSIDE the card's
//     `innerHTML`, so a card repaint can never destroy it (the C115-86 forbidden fix, avoided);
//   · the CLAIM that says which surface displays it (`envelopeCardJobHost.ts`, the ONE arbiter);
//   · the one-line pointer the satellite shows on the arms that have no summary to show.
//
// ⛔ NO HOST BRANCH INSIDE THE CARD'S RENDERER — C115-88 clause 1. The card asks *"is the summary
// job taken?"* (`envelopeSummaryClaimed()`), never *"which surface am I in?"*. Unclaimed, it renders
// the summary inline exactly as before — the GIS rail PARCEL panel and the floating card are
// byte-for-byte unchanged. Claimed, it renders the relocation stamp in its place (C115-17) and the
// summary is read here, in question 1.
//
// ⭐ ALL FOUR RENDER ARMS — C115-88 clause 3 / §3.B. Only the FULL arm carries a summary. The
// absence, refusal and reduced (legacy) arms keep their own bodies, whole, on the card in ②; the
// satellite then states — in one line, never as a blank — that there is no summary to show here and
// where the reason is. A blank slot in ① would conflate "no envelope" with "not rendered", the
// §CONTEXT-DATA-HONESTY collapse (C58 §1.20 clause 4: a null envelope is a STATE TO RENDER).
//
// C08 §3.1 — the ONE html sink here takes the card's already-escaped `safe*` markup (the card's own
// escaped-before-assignment convention) and nothing else; every sentence this module owns is set
// with `textContent`. P4 — no `(window as any)`. P6 — no store, no command. P7 — view chrome.

import { trace } from '@opentelemetry/api';
import {
    claimEnvelopeCardJob,
    envelopeCardJobClaimed,
    releaseEnvelopeCardJob,
} from './envelopeCardJobHost';
import { wireSiteHighlightRows } from './siteHighlightRowControl';

const _tracer = trace.getTracer('pryzm.site.envelopeSummaryHost');

/** `data-testid` on the satellite element the card writes its summary into. */
export const ENVELOPE_SUMMARY_TESTID = 'envelope-summary';
/**
 * Which card arm the satellite currently reflects. ⭐ `data-arm` DELIBERATELY — it is already one of
 * the five honesty attributes the question-group digest observer watches (PR-H-01), so a digest that
 * reads this satellite can never freeze on an arm change.
 */
export const ENVELOPE_SUMMARY_ARM_ATTR = 'data-arm';
/** `data-testid` on the wrapper around the provenance badge inside the satellite (a digest hook). */
export const ENVELOPE_SUMMARY_BADGE_TESTID = 'envelope-summary-badge';
/** `data-testid` on the one-line pointer the satellite shows on an arm with no summary. */
export const ENVELOPE_SUMMARY_NOTE_TESTID = 'envelope-summary-note';
/** `data-testid` on the stamp the card renders where the summary was, while the job is claimed. */
export const ENVELOPE_SUMMARY_RELOCATED_TESTID = 'envelope-summary-relocated';
/** C115-17 — the SAME attribute name the Parcel Law tab stamps (`PARCEL_LAW_RELOCATED_TO_ATTR`). */
export const ENVELOPE_SUMMARY_RELOCATED_TO_ATTR = 'data-relocated-to';

/** The card's render arms, from the summary's point of view, plus "the card did not render". */
export type EnvelopeSummaryArm = 'full' | 'absence' | 'refusal' | 'reduced' | 'not-rendered';

/**
 * ⭐ WHAT QUESTION 1 SAYS ON AN ARM WITH NO SUMMARY. Each names the reason's home (question 2, where
 * the card keeps that arm whole) — a pointer, never a restatement, so no refusal or absence sentence
 * gains a second spelling here.
 */
export const ENVELOPE_SUMMARY_ARM_TEXT: Readonly<Record<Exclude<EnvelopeSummaryArm, 'full'>, string>> = Object.freeze({
    absence:
        'No buildable envelope is determined for this plot yet. ② What can I build — and build it '
        + 'states why and what would supply one — and you can still draw your own massing there.',
    refusal:
        'PRYZM refused a buildable envelope for this plot. The reason and its citation are stated in '
        + '② What can I build — and build it; a refusal is an answer about this land, not a gap.',
    reduced:
        'Only a saved maximum height is held for this plot, from an older determination. ② What can I '
        + 'build — and build it shows it, with the route to recompute the full envelope.',
    'not-rendered':
        'The buildable envelope is not rendered on this panel right now. It appears here as soon as '
        + 'the envelope card renders for this plot.',
});

/**
 * C115-17 — the markup the CARD renders where its summary was, while question 1 holds the job.
 * Static, author-written, no runtime interpolation. It names the destination AND says nothing was
 * removed, because a stamp that only says "moved" makes the reader hunt.
 */
export const ENVELOPE_SUMMARY_RELOCATED_HTML =
    `<div data-testid="${ENVELOPE_SUMMARY_RELOCATED_TESTID}" ${ENVELOPE_SUMMARY_RELOCATED_TO_ATTR}="plot" `
    + 'style="margin:0 0 8px;padding:6px 8px;border-radius:7px;background:#f7f4fe;color:#6b6480;'
    + 'font-size:10.5px;line-height:1.5;">The buildable envelope — its confidence badge, the four '
    + 'ceilings, their caveats and their source — is stated in ① What is this plot — and what can I '
    + 'build here?, beside the plot it describes. Nothing was removed: every figure, citation and caveat '
    + 'is there, and each figure still lights its geometry on the view.</div>';

let satellite: HTMLDivElement | null = null;
let lastArm: EnvelopeSummaryArm = 'not-rendered';

function writeArmNote(el: HTMLDivElement, arm: Exclude<EnvelopeSummaryArm, 'full'>): void {
    const p = document.createElement('p');
    p.setAttribute('data-testid', ENVELOPE_SUMMARY_NOTE_TESTID);
    p.style.cssText = 'margin:2px 0 6px;font-size:10.5px;line-height:1.5;color:#8a83a0;';
    p.textContent = ENVELOPE_SUMMARY_ARM_TEXT[arm]; // textContent — no HTML sink for owned text
    el.replaceChildren(p);
    el.setAttribute(ENVELOPE_SUMMARY_ARM_ATTR, arm);
}

function ensureSatellite(): HTMLDivElement {
    if (satellite) return satellite;
    const el = document.createElement('div');
    el.className = 'pryzm-envelope-summary';
    el.setAttribute('data-testid', ENVELOPE_SUMMARY_TESTID);
    el.style.cssText = 'min-width:0;max-width:100%;overflow-wrap:break-word;margin:6px 0 2px;';
    writeArmNote(el, 'not-rendered');
    satellite = el;
    return el;
}

/** The satellite element (created on first use). Exported for the spec and the claimant host. */
export function getEnvelopeSummaryElement(): HTMLDivElement {
    const span = _tracer.startSpan('pryzm.site.getEnvelopeSummaryElement');
    try {
        return ensureSatellite();
    } finally {
        span.end();
    }
}

/** What the card last published — `full` or the arm that has no summary. */
export function envelopeSummaryArm(): EnvelopeSummaryArm {
    return lastArm;
}

/** One publication from one card render pass. */
export type EnvelopeSummaryPublication =
    | { readonly arm: 'full'; /** The card's escaped-before-assignment markup (C08 §3.1). */ readonly safeHtml: string }
    | { readonly arm: Exclude<EnvelopeSummaryArm, 'full'> };

/**
 * ⭐ THE CARD WRITES HERE, ON EVERY ARM, ON EVERY PASS — whether or not the job is claimed, so the
 * satellite is never a vintage behind the card that produced it. Idempotent; never throws.
 */
export function publishEnvelopeSummary(pub: EnvelopeSummaryPublication): void {
    const span = _tracer.startSpan('pryzm.site.publishEnvelopeSummary');
    try {
        const el = ensureSatellite();
        if (pub.arm === 'full') {
            // §XSS-SINK-SCAN (C08 §3.1) — `safeHtml` is the card's escaped-before-assignment markup:
            // static author-written chrome plus runtime strings the card escaped where it built them.
            const safeHtml = pub.safeHtml;
            el.innerHTML = safeHtml;
            el.setAttribute(ENVELOPE_SUMMARY_ARM_ATTR, 'full');
            // ⭐ RULE 2 (§26.6.0) — three of the four ceilings are CONTROLS. The card wires its own
            // panel; that pass cannot reach this element once it has left the card, so the satellite
            // is wired where it is written (idempotent: `onclick` is assigned, never stacked).
            wireSiteHighlightRows(el);
        } else {
            writeArmNote(el, pub.arm);
        }
        lastArm = pub.arm;
        span.setAttribute('pryzm.site.envelopeSummary.arm', pub.arm);
    } catch (e) {
        console.warn('[site][envelope-summary] publication failed (non-fatal):', e);
    } finally {
        span.end();
    }
}

/** ⭐ THE ONE READ the card makes: is the summary job taken by another surface? */
export function envelopeSummaryClaimed(): boolean {
    return envelopeCardJobClaimed('envelope-summary');
}

/**
 * Claim the summary for `host` and seat the satellite in it. Idempotent for the same element.
 * The claim notifies the card's host, whose repaint writes the current summary here.
 */
export function claimEnvelopeSummary(host: HTMLElement, label: string): void {
    const span = _tracer.startSpan('pryzm.site.claimEnvelopeSummary');
    try {
        const el = ensureSatellite();
        if (el.parentElement !== host) host.appendChild(el);
        claimEnvelopeCardJob('envelope-summary', host, label);
    } finally {
        span.end();
    }
}

/**
 * Release the job — ONLY if `host` holds it — and take the satellite out of `host`. A summary left in
 * a released slot would be a second rendering of the card's figures on a surface no longer claiming
 * them, and the card is about to render them inline again.
 */
export function releaseEnvelopeSummary(host: HTMLElement): void {
    const span = _tracer.startSpan('pryzm.site.releaseEnvelopeSummary');
    try {
        releaseEnvelopeCardJob('envelope-summary', host);
        if (satellite && satellite.parentElement === host) satellite.remove();
    } finally {
        span.end();
    }
}

/** Test-only reset of the satellite (the claim itself is reset through `envelopeCardJobHost`). */
export function __resetEnvelopeSummaryHostForTests(): void {
    satellite?.remove();
    satellite = null;
    lastArm = 'not-rendered';
}
