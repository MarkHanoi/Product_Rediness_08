// §26.6.7 (L-13085, FOUNDER RULING 2026-09-07) — THE BUILDABLE-ENVELOPE CARD'S HEADLINE:
// THE FOUR NAMED CEILINGS, AS CONTROLS.
//
// Asked whether to lift `Maximum levels` · `Maximum height` · `Maximum implantation area` ·
// `Maximum buildable area` out of the card's *Full site & massing data* fold and into the card's
// HEADLINE, or leave them in the fold, the founder ruled: **LIFT THEM.** `c8c62c51` did that.
//
// ⛔ WHY THIS IS A MODULE AND NOT TWENTY MORE LINES INSIDE `GISAreaLayout.ts`. The lift moved four
// figures that §26.6.0 **rule 2** makes CONTROLS — *"EVERY FIGURE IS A HYPERLINK, AND FOLLOWING IT
// HIGHLIGHTS THE THING ON WHICHEVER VIEW IS OPEN"*. A figure that quietly became plain text on the
// way up would still LOOK right and would silently stop painting on the BIM 3D, 3D Site and 2D map
// views — the class of defect this card has produced before, and one that no reading of a diff
// reliably catches. `c8c62c51`'s own message said so: *"NOT VERIFIED HERE: that the lifted figures
// keep their rule-2 behaviour."* The behaviour was correct; it was UNPINNED, and it lived inside
// `mountGISArea`, a ~5,500-line closure with no seam a spec can render. This module is that seam:
// the headline is now produced HERE, so `ceilingHeadline.spec.ts` mounts the REAL markup, counts
// each figure in a REAL DOM, clicks the REAL buttons and reads the REAL store — instead of
// grepping the card's source for the shape of a call, which is the strongest check the closure
// previously allowed and is not the same thing.
//
// ⛔ ONE ROW MARKUP, NOT TWO. `buildEnvelopeCardRowHtml` is the card's row — moved here verbatim
// from `buildSiteDataBlock`'s local `row`, which now delegates to it. The headline and the fold
// therefore keep ONE spelling of a read-out row: had the headline grown its own, the two halves of
// one card could drift in padding, in ink, and — the part that matters — in whether the label is a
// control at all.
//
// ⛔ ONE HEADLINE FOR ALL THREE HOSTS — the GIS rail PARCEL panel, the floating GIS card and the
// Parcel Law tab's question 2. The card is a re-homed singleton and C19 §5.7 forbids a host branch
// inside its renderer, so there is none here.
//
// C08 §3.1 — this file owns an HTML sink (the card is an `innerHTML` template), so it declares its
// own escaper and escapes every runtime string. The label cell itself is NOT built here: it is
// `buildSiteHighlightLabelHtml`, the ONE control builder, whose DOM serialiser does the escaping.

import { trace } from '@opentelemetry/api';
import { CEILING_LABEL } from './intentAgainstCeilingModel';
import type {
    SiteHighlightAvailability,
    SiteHighlightFixedSubject,
    SiteHighlightSubject,
} from './siteGeometryHighlight';
import { buildSiteHighlightLabelHtml } from './siteHighlightRowControl';

const _tracer = trace.getTracer('pryzm.site.ceilingHeadlineSection');

/** Local HTML escaper — the guard this file declares for itself (C08 §3.1). */
function escHtml(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, (c) => (
        c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
    ));
}

/** `data-testid` on the headline's root element. */
export const CEILING_HEADLINE_TESTID = 'envelope-ceiling-headline';

/**
 * Attribute carried by each of the four headline rows, naming WHICH ceiling it is. A spec asserts
 * the KEY, never a label string, so renaming one of the founder's four figures cannot silently
 * turn a rule-1 count into a count of nothing.
 */
export const CEILING_ROW_ATTR = 'data-ceiling';

/**
 * Attribute carried by each headline row saying whether the rule pack DERIVED that ceiling.
 * ⛔ `not-derived` IS A RENDERED ROW, NEVER A DROPPED ONE (C58 §1.13 · L-13048): the absence is a
 * card, not a deletion, so a headline missing one of the four would state three ceilings for a
 * parcel that has four, which reads as "unbounded" rather than as "we did not look it up".
 */
export const CEILING_DERIVED_ATTR = 'data-derived';

/** The four keys, in the order the headline prints them. */
export const CEILING_KEYS = Object.freeze(['levels', 'height', 'implantation', 'buildable'] as const);

/** One of the founder's four named ceilings. */
export type CeilingKey = (typeof CEILING_KEYS)[number];

/**
 * ⭐ WHICH GEOMETRY EACH CEILING POINTS AT — the rule-2 binding, in one table.
 *
 * ⛔ `levels` CARRIES NO SUBJECT, DELIBERATELY. There is no geometry for "storeys" to light, and
 * §26.6.0's own honesty rule (`siteGeometryHighlight.ts`) is that a row whose geometry does not
 * exist must NOT render as a control: a dead click is indistinguishable from a broken product AND
 * from *"we looked and there is nothing there"*. Minting a subject for it to make the headline look
 * uniform would be the §CONTEXT-DATA-HONESTY conflation wearing an affordance.
 */
export const CEILING_SUBJECT: Readonly<Record<CeilingKey, SiteHighlightFixedSubject | null>> =
    Object.freeze({
        levels: null,
        height: 'height',
        implantation: 'footprint',
        buildable: 'gfa',
    });

/**
 * §PARCEL-LAW-UNRESOLVED (L-616 / C58 §1.4) — the sentence REFUSES THE COMPLETION the reader would
 * otherwise make. *"not derived"* alone is read as *"unbounded"*, and an unbounded constraint drawn
 * on real land is an overstatement, not a blank. It also names where the empty slot is accounted
 * for, because the fold keeps a row for it instead of dropping it.
 *
 * ⛔ MOVED HERE, NOT COPIED. `GISAreaLayout.ts`'s `NOT_DERIVED` is now an alias of this constant, so
 * the headline and the fold cannot come to spell one absence two ways.
 */
export const CARD_NOT_DERIVED_HTML =
    '<span style="color:#a49dbb;font-style:italic;" title="The rule pack did not derive this for this zone, and PRYZM does not infer it — an inferred value would be indistinguishable from a derived one. This is a MISSING LOOKUP, NOT a finding that the zone sets no limit. The row keeps its slot in &quot;Why these numbers?&quot; below.">not derived</span>';

/** The card's number formatter. Moved out of `buildSiteDataBlock` with the row it serves. */
export function formatCardMeasure(v: number, unit: string, dp = 1): string {
    return `${v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })} ${unit}`;
}

/** Everything one read-out row needs. `highlight` opts it into §26.6.0 rule 2's binding. */
export interface EnvelopeCardRowInput {
    readonly label: string;
    /** Already-safe markup (a formatted number, or `CARD_NOT_DERIVED_HTML`). */
    readonly value: string;
    readonly hint?: string;
    readonly highlight?: SiteHighlightFixedSubject | null;
    /** The availability DECISION for `highlight`, computed once per render by the pure rule. */
    readonly avail?: SiteHighlightAvailability | null;
    readonly isOn?: boolean;
    /** Extra attributes for the row element, pre-escaped by the caller (test hooks only). */
    readonly attrs?: string;
}

/**
 * ONE read-out row of the buildable-envelope card — headline and fold alike.
 *
 * ⛔ THREE VISUAL STATES, NEVER TWO. A row whose geometry exists renders as a real, focusable
 * control; a row whose geometry does NOT exist renders as ordinary text with a dimmed ◎ carrying the
 * REASON in its title — never as a control that swallows a click. A dead click is indistinguishable
 * from a broken product AND from "we looked and found nothing", which is the §CONTEXT-DATA-HONESTY
 * conflation wearing an affordance.
 */
export function buildEnvelopeCardRowHtml(input: EnvelopeCardRowInput): string {
    const span = _tracer.startSpan('pryzm.site.buildEnvelopeCardRowHtml');
    try {
        const { label, value, hint, highlight, avail, isOn = false, attrs } = input;
        // The label is a button, or text-with-reason, or plain text — and the first two are
        // rendered by the module the spec clicks, never by a copy kept here.
        const labelHtml = highlight && avail
            ? buildSiteHighlightLabelHtml(label, highlight, avail, isOn)
            : `<span style="color:#6b6480;">${escHtml(label)}</span>`;
        span.setAttribute('pryzm.card.row.control', Boolean(highlight && avail));
        return `<div${attrs ? ` ${attrs}` : ''} style="display:flex;justify-content:space-between;gap:10px;padding:2.5px 0;">
               <span>${labelHtml}${hint ? `<span title="${escHtml(hint)}" style="color:#c3bdd6;cursor:help;"> ⓘ</span>` : ''}</span>
               <span style="font-weight:600;text-align:right;">${value}</span>
             </div>`;
    } finally {
        span.end();
    }
}

/** The four ceilings as the rule pack left them. `null` means the pack did not derive it. */
export interface CeilingHeadlineInput {
    /** `maxFloors` — storeys. */
    readonly maxFloors: number | null;
    /** `maxHeight_m`. */
    readonly maxHeightM: number | null;
    /**
     * The buildable FOOTPRINT in plan. ⛔ `0` IS AN ABSENCE, NOT A CEILING: `permittedStudyFigures`
     * returns `0` when there is no inset ring to measure, and printing `0 m²` under
     * *"Maximum implantation area"* would state that no storey may cover any ground — a claim about
     * the user's land that nothing derived (C58 §1.4). Non-positive therefore reads `not derived`.
     */
    readonly footprintM2: number | null;
    /**
     * GFA across all floors, read from the ONE model (`law.massing.gfaM2`), which is `null` whenever
     * the storey count was not derived — a guessed storey count would become a guessed sellable area.
     */
    readonly gfaM2: number | null;
    /** The availability decisions for the fixed subjects, computed once per render. */
    readonly avail: Readonly<Record<SiteHighlightFixedSubject, SiteHighlightAvailability>>;
    /** The subject currently emphasised, straight off the ONE highlight store. */
    readonly active: SiteHighlightSubject | null;
}

/** The hint each ceiling carries. Sentences, not decorations — each one refuses an inference. */
const CEILING_HINT: Readonly<Record<CeilingKey, string | undefined>> = Object.freeze({
    levels: 'Storeys. Shown only when the rule pack derived it. We do NOT back-compute storeys from height ÷ a floor-to-floor guess.',
    height: undefined,
    implantation: 'The buildable footprint — the most any single storey may cover, in plan.',
    buildable: 'Footprint × storeys. Deliberately blank when the storey count was not derived — a guessed storey count would become a guessed sellable area.',
});

/**
 * ⭐ THE CARD'S HEADLINE — the founder's four named ceilings, each in ONE place.
 *
 * §26.6.0 **rule 1** is *"ONE FIGURE, ONE PLACE"*. The lift DELETED these four from the fold rather
 * than copying them up; a figure in both places would re-create the exact duplication rule 1 exists
 * to end, one edit after applying the rule. This function is therefore the ONLY producer of the
 * four, and its spec counts each `CEILING_ROW_ATTR` in the rendered DOM and requires exactly one.
 *
 * §26.6.0 **rule 2** is *"EVERY FIGURE IS A HYPERLINK"*. Three of the four carry a subject and come
 * back as buttons from the ONE control builder; the card wires them with
 * `wireSiteHighlightRows(panel)` (which takes the whole panel — the headline is inside it) and the
 * Parcel Law tab re-wires and re-paints them from the same store, so a click here lights the
 * geometry on whichever of the three views is open.
 *
 * ⛔ EVERY ABSENCE ARM SURVIVES. A ceiling the pack did not derive prints `CARD_NOT_DERIVED_HTML` —
 * never a blank, never a zero, and never silently dropped so the headline shows three of four.
 */
export function buildCeilingHeadlineHtml(input: CeilingHeadlineInput): string {
    const span = _tracer.startSpan('pryzm.site.buildCeilingHeadlineHtml');
    try {
        // ⛔ THE VALUE ARM PER CEILING, ALL FOUR IN ONE PLACE so no arm can be quietly dropped.
        const value: Readonly<Record<CeilingKey, string | null>> = {
            levels: input.maxFloors !== null ? String(input.maxFloors) : null,
            height: input.maxHeightM !== null ? formatCardMeasure(input.maxHeightM, 'm') : null,
            implantation: input.footprintM2 !== null && input.footprintM2 > 0
                ? formatCardMeasure(input.footprintM2, 'm²', 0)
                : null,
            buildable: input.gfaM2 !== null ? formatCardMeasure(input.gfaM2, 'm²', 0) : null,
        };
        let derived = 0;
        const rows = CEILING_KEYS.map((key) => {
            const v = value[key];
            if (v !== null) derived += 1;
            const subject = CEILING_SUBJECT[key];
            return buildEnvelopeCardRowHtml({
                label: CEILING_LABEL[key],
                value: v ?? CARD_NOT_DERIVED_HTML,
                hint: CEILING_HINT[key],
                highlight: subject,
                avail: subject ? input.avail[subject] : null,
                isOn: subject !== null && input.active === subject,
                attrs: `${CEILING_ROW_ATTR}="${key}" ${CEILING_DERIVED_ATTR}="${v !== null ? 'yes' : 'not-derived'}"`,
            });
        }).join('');
        span.setAttribute('pryzm.card.ceilings.derived', derived);
        return `<div data-testid="${CEILING_HEADLINE_TESTID}">${rows}</div>`;
    } finally {
        span.end();
    }
}
