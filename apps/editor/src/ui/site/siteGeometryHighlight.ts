// §RESI-ORCH-HIGHLIGHT (lane RESI-ORCHESTRATOR, 2026-09-03) — CLICK A NUMBER, LIGHT THE GEOMETRY.
//
// STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §3 states the requirement as a table:
//
//     Area            → the parcel
//     Perimeter       → the boundary
//     Street frontage → the relevant edges
//     Max footprint   → the buildable envelope
//     Max height      → the vertical limit
//     Max GFA         → the resulting potential
//
//     *"The user must ALWAYS understand — what does this number mean physically?"*
//
// ⭐ THIS IS A BINDING, NOT A FEATURE, AND THE INVENTORY SAID SO. Every part already exists: the
// envelope card renders the six values, `envelopeToMassing` emits the solids, and
// `ParcelBoundarySceneRenderer` draws the ring, the fill and the volume. What was missing was a
// SUBJECT VOCABULARY shared between the panel that names a number and the scene that owns the
// geometry — so this module is that vocabulary, its availability rule, and one tiny store. It
// draws nothing and knows nothing about THREE, Cesium or the DOM.
//
// ── WHY A NEW SUBJECT UNION RATHER THAN `pryzm-highlight-elements` ──────────────────────────
// The plan nominated the dead `pryzm-highlight-elements` bus event as *"the natural carrier"*.
// It is not, and the reason is worth recording rather than re-litigating: that event's payload is
// `{ elementIds: readonly string[] }` — BIM ELEMENT IDS. None of the six subjects above is an
// element. The parcel ring is C19 site state, the envelope is a C58 determination, and the
// vertical limit is not an object at all — it is a NUMBER whose physical meaning has to be
// CONSTRUCTED to be shown. Forcing them through an element-id channel would have required minting
// fake element ids for site geometry, which is the *"fake more capable than real"* defect: the
// subscriber could not then tell a real element from a synthesised one. A six-member closed union
// says exactly what it means and cannot be widened by accident.
//
// ── THE HONESTY RULE THIS MODULE ENFORCES, AND IT IS THE WHOLE DESIGN ───────────────────────
// ⛔ **A ROW WITH NO GEOMETRY TO POINT AT MUST RENDER AS UN-CLICKABLE, WITH ITS REASON — NEVER
// AS A CLICK THAT DOES NOTHING.** A dead click is indistinguishable from a broken product, and
// worse, it is indistinguishable from *"we looked and there is nothing there"*. That is the
// §CONTEXT-DATA-HONESTY family (failure and emptiness rendering as one value) transposed onto an
// affordance. So availability is a DECISION with a stated reason, computed here, pinned by tests
// — the same shape `SiteEntryPanel` already uses for its greyed actions (*"an unavailable action
// renders greyed WITH its reason printed"*), copied rather than reinvented.
//
// Street frontage is the sharpest case and gets THREE arms, never two:
//   · nobody classified this parcel's edges → unavailable, "not recorded"
//   · classified, and none faces a street   → unavailable, "landlocked" — a real FINDING
//   · classified, n > 0 face a street       → available
// Collapsing the first two is exactly the lie `parcelEdgeClassificationDetermination.ts` exists
// to prevent, and this module reuses that module's answer rather than re-deriving it.
//
// ── WHAT THE RENDERER MAY DO WITH A SUBJECT, STATED HERE BECAUSE IT IS AN HONESTY RULE ─────
// ⛔ **EMPHASIS MAY NEVER STRENGTHEN A CLAIM.** The envelope's hue and fill alpha ARE its
// honesty signal (`envelopeRenderStyle.ts`: confident violet · provisional grey · suggested amber
// · study teal; near-wireframe for an upper bound; open-top for an indicative posture). Boosting
// the opacity of a provisional solid to "highlight" it would make an estimate read as a
// determination — the §L-616 overstatement, introduced by a UI affordance. So the rule for every
// subscriber is: **DIM WHAT IS NOT THE SUBJECT; NEVER BRIGHTEN THE SUBJECT, AND NEVER CHANGE ITS
// HUE.** Contrast carries the emphasis and no solid ever renders stronger than it has earned.
//
// PURE except for one module-local `let` + a listener set — the same shape, and the same
// push-not-poll contract, as `envelopeVisibility.ts` next door (a control WRITES, surfaces
// SUBSCRIBE and repaint themselves, so "the panel changed the flag but the scene never heard" is
// structurally impossible rather than a branch someone remembered to write). NOT persisted: an
// emphasis is a momentary act of reading, not a preference, and restoring a highlight on next
// load would light geometry nobody asked about.

import { trace } from '@opentelemetry/api';
import { frontEdgeCount } from './parcelEdgeClassificationDetermination';

const _tracer = trace.getTracer('pryzm.site.siteGeometryHighlight');

/**
 * The six things a card row can point at. Closed on purpose: a seventh must be added HERE, with
 * its availability arm and its renderer arm, and the type error at every `switch` is the feature.
 */
export type SiteHighlightSubject =
    | 'parcel'
    | 'boundary'
    | 'frontage'
    | 'footprint'
    | 'height'
    | 'gfa';

/** Iteration order for tests and for any future legend. */
export const SITE_HIGHLIGHT_SUBJECTS: readonly SiteHighlightSubject[] = Object.freeze([
    'parcel', 'boundary', 'frontage', 'footprint', 'height', 'gfa',
] as const);

/** The DOM attribute a clickable card row carries. One name, so the panel and its wiring agree. */
export const SITE_HIGHLIGHT_ATTR = 'data-site-highlight';

/** What the user is told will light up. Answers §3's *"what does this number mean physically?"* */
export const SITE_HIGHLIGHT_MEANING: Readonly<Record<SiteHighlightSubject, string>> = Object.freeze({
    parcel: 'Lights the parcel — the whole plot this area is measured over.',
    boundary: 'Lights the boundary — the closed ring this perimeter is measured along.',
    frontage: 'Lights the edges classified as street frontage — the ones buildable depth insets from.',
    footprint: 'Lights the buildable footprint — the inset ring this area is measured inside.',
    height: 'Lights the vertical limit — a plane drawn at this height over the buildable footprint.',
    gfa: 'Lights the resulting potential — the study volume this floor area is derived from.',
});

/** Whether a subject can be shown, and — when it cannot — why not, in the user's words. */
export interface SiteHighlightAvailability {
    readonly available: boolean;
    /** Non-empty on BOTH arms. An available subject states what will light up; an unavailable one
     *  states what is missing. An empty string here would re-create the dead-click ambiguity. */
    readonly reason: string;
}

/**
 * Everything the availability rule needs, and nothing else — so it is decidable without a store,
 * a runtime or a scene.
 *
 * @param parcelRingLength     vertex count of the committed C19 ring (`< 3` ⇒ no parcel geometry)
 * @param edgeClassifications  the RAW `boundary.edgeClassifications` value, passed through
 *                             untouched so `frontEdgeCount` can tell "absent" from "wrong length"
 *                             from "all unclassified". ⛔ Do NOT pre-default it to `[]` here.
 * @param footprintRingLength  vertex count of `env.insetPolygon`
 * @param maxHeightM           `env.maxHeight_m` — `null` when the rule pack did not derive one
 * @param gfaM2                the card's `footprint × storeys`, already `null` when storeys were
 *                             not derived. Never recomputed here; one producer (C06 §13.3).
 */
export interface SiteHighlightInputs {
    readonly parcelRingLength: number;
    readonly edgeClassifications: unknown;
    readonly footprintRingLength: number;
    readonly maxHeightM: number | null;
    readonly gfaM2: number | null;
}

const NO_PARCEL = 'PRYZM could not read a committed parcel outline for this project, so there is no plot geometry to light.';
const NO_FOOTPRINT = 'No buildable footprint was solved for this parcel, so there is no inset ring to light.';

/**
 * THE availability decision, for all six subjects at once. Pure; total; never throws.
 *
 * ⚠ Each arm states a DIFFERENT fact. Read the frontage block in particular before simplifying
 * it: the three arms are the whole reason `parcelEdgeClassificationDetermination.ts` exists.
 */
export function describeSiteHighlightAvailability(
    inputs: SiteHighlightInputs,
): Readonly<Record<SiteHighlightSubject, SiteHighlightAvailability>> {
    const span = _tracer.startSpan('pryzm.site.describeSiteHighlightAvailability');
    try {
        const hasParcel = inputs.parcelRingLength >= 3;
        const hasFootprint = inputs.footprintRingLength >= 3;

        // ── FRONTAGE — three arms, and the middle one is a FINDING, not a gap. ──
        const fronts = frontEdgeCount(inputs.edgeClassifications, inputs.parcelRingLength);
        const frontage: SiteHighlightAvailability = !hasParcel
            ? { available: false, reason: NO_PARCEL }
            : fronts === null
                ? {
                    available: false,
                    reason:
                        'Nobody has classified this parcel’s edges, so PRYZM cannot say which one faces '
                        + 'the street. This is a missing measurement — NOT a finding that the plot has no frontage.',
                }
                : fronts === 0
                    ? {
                        available: false,
                        reason:
                            'This parcel’s edges WERE classified and none of them faces a street — a real '
                            + 'finding about a landlocked plot, not a gap in the data. There is no frontage edge to light.',
                    }
                    : { available: true, reason: SITE_HIGHLIGHT_MEANING.frontage };

        const result: Record<SiteHighlightSubject, SiteHighlightAvailability> = {
            parcel: hasParcel
                ? { available: true, reason: SITE_HIGHLIGHT_MEANING.parcel }
                : { available: false, reason: NO_PARCEL },
            boundary: hasParcel
                ? { available: true, reason: SITE_HIGHLIGHT_MEANING.boundary }
                : { available: false, reason: NO_PARCEL },
            frontage,
            footprint: hasFootprint
                ? { available: true, reason: SITE_HIGHLIGHT_MEANING.footprint }
                : { available: false, reason: NO_FOOTPRINT },
            // ⛔ THE HEIGHT PLANE IS DRAWN ONLY FROM A DERIVED HEIGHT. There is no `height ÷ 3 m`
            // fallback and there must not be one: a plane drawn at an invented height would look
            // identical to one drawn at a published limit, which is the §ENVELOPE-SITE-DATA rule
            // ("never synthesise a missing value") escaping into geometry, where it is worse —
            // a number the reader can at least see is a number becomes a SOLID they believe.
            height: !hasFootprint
                ? { available: false, reason: NO_FOOTPRINT }
                : inputs.maxHeightM !== null && inputs.maxHeightM > 0
                    ? { available: true, reason: SITE_HIGHLIGHT_MEANING.height }
                    : {
                        available: false,
                        reason:
                            'The rule pack derived no maximum height for this zone. PRYZM will not draw a '
                            + 'limit plane at a guessed height — it would look exactly like a published one.',
                    },
            gfa: !hasFootprint
                ? { available: false, reason: NO_FOOTPRINT }
                : inputs.gfaM2 !== null && inputs.gfaM2 > 0
                    ? { available: true, reason: SITE_HIGHLIGHT_MEANING.gfa }
                    : {
                        available: false,
                        reason:
                            'No maximum floor area was derived (the storey count is not known), so there is '
                            + 'no study volume that this figure describes.',
                    },
        };
        span.setAttribute(
            'pryzm.siteHighlight.availableCount',
            SITE_HIGHLIGHT_SUBJECTS.filter((s) => result[s].available).length,
        );
        return Object.freeze(result);
    } finally {
        span.end();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// The store — session-only, push-not-poll (the `envelopeVisibility.ts` contract)
// ─────────────────────────────────────────────────────────────────────────────

type Listener = () => void;

const listeners = new Set<Listener>();

/** `null` ⇒ nothing is emphasised and every surface renders at its authored weight. */
let active: SiteHighlightSubject | null = null;

function notify(): void {
    for (const fn of [...listeners]) {
        try {
            fn();
        } catch (e) {
            console.warn('[site][highlight] §RESI-ORCH-HIGHLIGHT listener threw (non-fatal):', e);
        }
    }
}

/** THE ONE READ. `null` means "no emphasis", which is the resting state. */
export function getSiteHighlight(): SiteHighlightSubject | null {
    return active;
}

/**
 * THE ONE WRITE. The card's row handler calls this and does nothing else — it does not reach into
 * a scene and does not decide which renderer to poke. No-ops when unchanged, so an idempotent
 * re-assert cannot cost a repaint.
 */
export function setSiteHighlight(next: SiteHighlightSubject | null): void {
    if (active === next) return;
    active = next;
    notify();
}

/** Click-the-same-row-again clears it. Returns the value now in force. */
export function toggleSiteHighlight(subject: SiteHighlightSubject): SiteHighlightSubject | null {
    setSiteHighlight(active === subject ? null : subject);
    return active;
}

/** Subscribe a surface. Returns its own unsubscribe. */
export function subscribeSiteHighlight(fn: Listener): () => void {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

/** Test-only reset — clears the subject and drops every subscriber. */
export function __resetSiteHighlightForTests(): void {
    active = null;
    listeners.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// THE EMPHASIS RULE — what a SUBSCRIBER is allowed to do once a subject is set
// ─────────────────────────────────────────────────────────────────────────────
//
// ⛔ EMPHASIS MAY NEVER STRENGTHEN A CLAIM (the header's rule, now executable).
// This half exists because the rule above was, until this commit, PROSE — and a
// prose rule inside a 780-line THREE renderer is a rule nobody can falsify. The
// decision is extracted here for the same reason
// `parcelEdgeClassificationDetermination.ts` was extracted: the interesting arms
// are unreachable from a test while they live inline in a DOM/scene builder.
//
// Two things are decided here and nowhere else:
//   1. WHICH ROLE IS THE SUBJECT — so "click Perimeter, the FILL lights up too"
//      is a type-checked table rather than an `if` chain in a scene builder;
//   2. WHAT HAPPENS TO EVERYTHING ELSE — it RECEDES. Never the converse.

/**
 * The kinds of geometry a site surface owns. Deliberately COARSER than the
 * subject union: a renderer tags what it drew, it does not decide what a number
 * means. `cue` is geometry that exists ONLY to answer a highlight (the frontage
 * edges, the inset ring, the limit plane) and is therefore always the subject.
 */
export type SiteHighlightRole =
    | 'parcel-line'
    | 'parcel-fill'
    | 'envelope-volume'
    | 'study-volume'
    | 'cue';

/** `subject` renders at its AUTHORED weight; `recede` renders weaker. Never stronger. */
export type SiteHighlightEmphasis = 'subject' | 'recede';

/**
 * The factor a receding surface's ALREADY-AUTHORED opacity is multiplied by.
 *
 * ⛔ A MULTIPLIER, NOT A TARGET. Setting a receding surface to a fixed alpha
 * would let a near-wireframe upper-bound shell (`UPPER_BOUND_FILL_ALPHA`) come
 * out DENSER while receding than it was authored — an honesty regression
 * introduced by a UI affordance, which is exactly §L-616's shape. Multiplying
 * can only ever lower it.
 */
export const SITE_HIGHLIGHT_RECEDE_FACTOR = 0.22;

/**
 * The extra geometry a subject needs before it can be pointed at, or `null` when
 * the subject is already on screen and emphasis alone answers the question.
 *
 * ⚠ THREE OF THE SIX SUBJECTS HAVE NO GEOMETRY IN ANY SCENE TODAY, and that is
 * the substance of this binding rather than an oversight to route around:
 *   · `frontage` — the classified front edges are a LABEL on the ring, never drawn;
 *   · `footprint` — the inset ring is only ever seen as the BASE of a solid;
 *   · `height`   — a limit is a NUMBER; its physical meaning must be constructed.
 * A renderer that cannot build the named cue MUST leave the row's click inert
 * rather than falling back to lighting something else — pointing at the wrong
 * geometry is worse than pointing at none, because the user cannot tell.
 */
export type SiteHighlightCue = 'front-edges' | 'inset-ring' | 'limit-plane';

/** See `SiteHighlightCue`. Total; pure. */
export function siteHighlightCue(subject: SiteHighlightSubject): SiteHighlightCue | null {
    switch (subject) {
        case 'frontage': return 'front-edges';
        case 'footprint': return 'inset-ring';
        case 'height': return 'limit-plane';
        // Area → the parcel, Perimeter → the boundary, GFA → the study volume: all three
        // are ALREADY DRAWN. Emphasis alone answers them, and inventing a second copy of
        // geometry that is already on screen would double-draw the plot.
        case 'parcel':
        case 'boundary':
        case 'gfa':
            return null;
    }
}

/**
 * THE emphasis decision. Pure; total; never throws.
 *
 * ⭐ Read the table as STR §3's own table, because it is:
 *   Area            → the parcel     ⇒ the fill AND its ring (the plot as one thing)
 *   Perimeter       → the boundary   ⇒ the ring ALONE (a length is measured along a line)
 *   Street frontage → those edges    ⇒ the cue only; the rest of the ring recedes so the
 *                                      classified edges are legible AS a subset of it
 *   Max footprint   → the inset ring ⇒ the cue only
 *   Max height      → the limit      ⇒ the cue only
 *   Max GFA         → the potential  ⇒ whichever massing is drawn (plan-backed OR study —
 *                                      never both; they are mutually exclusive by
 *                                      construction, see `buildContextStudyVolume`)
 */
export function siteHighlightEmphasis(
    subject: SiteHighlightSubject,
    role: SiteHighlightRole,
): SiteHighlightEmphasis {
    if (role === 'cue') return 'subject';
    switch (subject) {
        case 'parcel':
            return role === 'parcel-fill' || role === 'parcel-line' ? 'subject' : 'recede';
        case 'boundary':
            return role === 'parcel-line' ? 'subject' : 'recede';
        case 'gfa':
            return role === 'envelope-volume' || role === 'study-volume' ? 'subject' : 'recede';
        case 'frontage':
        case 'footprint':
        case 'height':
            // Every authored surface recedes; only the constructed cue carries the answer.
            return 'recede';
    }
}
