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
import { projectScopeRegistry } from '@pryzm/core-app-model';
import { frontEdgeCount } from './parcelEdgeClassificationDetermination';

const _tracer = trace.getTracer('pryzm.site.siteGeometryHighlight');

/**
 * The FIXED things a card row can point at. Closed on purpose: an eighth must be added HERE, with
 * its availability arm and its renderer arm, and the type error at every `switch` is the feature.
 *
 * §26.6 rule 2 (L-13046, 2026-09-07) added `bbox` — *"the bounding box as a box"* — so the
 * `Bounding box` row on question 1 is a hyperlink like its neighbours instead of the one plain row
 * between three buttons.
 */
export type SiteHighlightFixedSubject =
    | 'parcel'
    | 'boundary'
    | 'bbox'
    | 'frontage'
    | 'footprint'
    | 'height'
    | 'gfa';

/**
 * ⭐ §26.6 rule 2 / §26.6.2 (L-13046) — ONE EDGE OF THE PARCEL RING, BY INDEX.
 *
 * Founder: *"I WANT TO KNOW FOR EVERY VECTOR OF THE PERIMETER THE SETBACK … IT SHOULD BE
 * SELECTABLE AND HYPERLINK"*. The setback register (`setbackRegisterModel.ts`) lists one row per
 * edge, and each row's link must light THAT EDGE — not the frontage set, not the ring. A ring has
 * as many edges as it has vertices, so this cannot be a fixed member; it is a PARAMETRISED subject
 * carried through the SAME store, the SAME attribute and the SAME subscribers as the fixed seven.
 *
 * ⛔ NOT A SECOND HIGHLIGHT MECHANISM (C58 §1.19 clause 2, §26.6.6). The value `edge:3` is written
 * by `setSiteHighlight`, read by `getSiteHighlight`, and answered by the renderers' `boundary-edge`
 * cue arm — one channel, one more kind of subject. `edgeHighlightSubject` is the ONE constructor
 * and `parseEdgeHighlightSubject` the ONE parser, so no renderer ever splits the string itself.
 */
export type SiteHighlightEdgeSubject = `edge:${number}`;

/** Every subject the store can hold: the fixed seven, or one ring edge by index. */
export type SiteHighlightSubject = SiteHighlightFixedSubject | SiteHighlightEdgeSubject;

/** Iteration order for tests and for any future legend. The FIXED subjects only — edges are
 *  as many as the ring has, and are enumerated from the ring, never from this table. */
export const SITE_HIGHLIGHT_SUBJECTS: readonly SiteHighlightFixedSubject[] = Object.freeze([
    'parcel', 'boundary', 'bbox', 'frontage', 'footprint', 'height', 'gfa',
] as const);

/** The prefix of an edge subject. One spelling, owned here. */
export const SITE_HIGHLIGHT_EDGE_PREFIX = 'edge:';

/** THE constructor of an edge subject. `index` is the ring vertex index the edge starts at. */
export function edgeHighlightSubject(index: number): SiteHighlightEdgeSubject {
    return `${SITE_HIGHLIGHT_EDGE_PREFIX}${Math.trunc(index)}` as SiteHighlightEdgeSubject;
}

/**
 * THE parser. `null` for anything that is not a well-formed edge subject — including the fixed
 * subjects, so a renderer can write `parseEdgeHighlightSubject(subject) ?? …` without a second
 * check. Never throws.
 */
export function parseEdgeHighlightSubject(subject: string | null | undefined): number | null {
    if (typeof subject !== 'string') return null;
    // Digits only after the prefix: `edge:` (empty), `edge:-1`, `edge:1.5` and `edge:x` are all
    // NOT an edge — `Number('')` is 0, which is why this is a pattern and not a cast.
    const m = /^edge:(\d+)$/.exec(subject);
    return m ? Number(m[1]) : null;
}

/** Type guard: is this string one of the subjects the store accepts? */
export function isSiteHighlightSubject(value: string | null | undefined): value is SiteHighlightSubject {
    if (typeof value !== 'string') return false;
    return (SITE_HIGHLIGHT_SUBJECTS as readonly string[]).includes(value)
        || parseEdgeHighlightSubject(value) !== null;
}

/** The DOM attribute a clickable card row carries. One name, so the panel and its wiring agree. */
export const SITE_HIGHLIGHT_ATTR = 'data-site-highlight';

/** What the user is told will light up. Answers §3's *"what does this number mean physically?"* */
export const SITE_HIGHLIGHT_MEANING: Readonly<Record<SiteHighlightFixedSubject, string>> = Object.freeze({
    parcel: 'Lights the parcel — the whole plot this area is measured over.',
    boundary: 'Lights the boundary — the closed ring this perimeter is measured along.',
    bbox: 'Lights the bounding box — the axis-aligned extent these two dimensions describe. A box, not the plot.',
    frontage: 'Lights the edges classified as street frontage — the ones buildable depth insets from.',
    footprint: 'Lights the buildable footprint — the inset ring this area is measured inside.',
    height: 'Lights the vertical limit — a plane drawn at this height over the buildable footprint.',
    gfa: 'Lights the resulting potential — the study volume this floor area is derived from.',
});

/** What the user is told an EDGE row will light. Same sentence shape as the fixed seven. */
export function edgeHighlightMeaning(index: number): string {
    return `Lights edge ${Math.trunc(index) + 1} of the parcel ring — the one vector this setback applies to.`;
}

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
): Readonly<Record<SiteHighlightFixedSubject, SiteHighlightAvailability>> {
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

        const result: Record<SiteHighlightFixedSubject, SiteHighlightAvailability> = {
            parcel: hasParcel
                ? { available: true, reason: SITE_HIGHLIGHT_MEANING.parcel }
                : { available: false, reason: NO_PARCEL },
            boundary: hasParcel
                ? { available: true, reason: SITE_HIGHLIGHT_MEANING.boundary }
                : { available: false, reason: NO_PARCEL },
            // A bounding box is a pure function of the ring, so it exists exactly when the ring does.
            bbox: hasParcel
                ? { available: true, reason: SITE_HIGHLIGHT_MEANING.bbox }
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

/**
 * §26.6 rule 2 — THE availability decision for ONE EDGE. Pure; total; never throws.
 *
 * An edge exists exactly when the ring exists and the index is inside it. There is no third arm:
 * an edge's CLASS may be unknown (C19 §10.1 is pending), but the edge itself is a segment of a
 * committed ring and can always be lit. The register says per row what is and is not known about
 * the edge; this function only answers *"is there a segment to point at?"*.
 */
export function describeEdgeHighlightAvailability(
    edgeIndex: number,
    parcelRingLength: number,
): SiteHighlightAvailability {
    const span = _tracer.startSpan('pryzm.site.describeEdgeHighlightAvailability');
    try {
        if (parcelRingLength < 3) return { available: false, reason: NO_PARCEL };
        if (!Number.isInteger(edgeIndex) || edgeIndex < 0 || edgeIndex >= parcelRingLength) {
            return {
                available: false,
                reason:
                    `Edge ${edgeIndex + 1} is outside this ${parcelRingLength}-edge ring, so there is no `
                    + 'segment to light. This is an indexing gap in PRYZM, not a finding about the plot.',
            };
        }
        return { available: true, reason: edgeHighlightMeaning(edgeIndex) };
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

// -----------------------------------------------------------------------------
// §SITE-HIGHLIGHT-REACH (STR §25.1 · RESI-ORCHESTRATOR-PLAN Stage C) — WHERE the
// emphasis actually lands, MEASURED rather than asserted
// -----------------------------------------------------------------------------
//
// ⛔ THE DEFECT THIS CLOSES, AND IT IS THIS MODULE'S OWN RULE FAILING ONE LEVEL UP.
// The header already forbids the dead click: "A ROW WITH NO GEOMETRY TO POINT AT MUST RENDER AS
// UN-CLICKABLE, WITH ITS REASON". `describeSiteHighlightAvailability` enforces that for the
// question *does the geometry exist?* — and answers nothing at all about the question the founder
// actually hits: *can the view I am looking at DRAW it?*
//
// MEASURED 2026-09-06: exactly ONE surface subscribes. `subscribeSiteHighlight` has three
// non-test callers' worth of reach and only `ParcelBoundarySceneRenderer` is a renderer; it is
// constructed exactly once (`apps/editor/src/engine/initScene.ts:4736`) into `world.scene.three`
// — the BIM scene. `CesiumViewport.ts` and `SiteBoundaryMap2D.ts` import this module ZERO times;
// Cesium receives the envelope as a plain render input and holds no subscription. The Parcel Law
// tab offers FOUR views (`viewSegmentSwitcher.ts`: Plan · BIM 3D · 3D Site · 3D Globe), so in
// THREE of them a click on "Area" repaints the row's ◉ and changes nothing on screen.
//
// A pressed button whose effect is invisible is worse than an un-pressable one: the row asserts
// that something happened. That is the same §CONTEXT-DATA-HONESTY conflation the header names,
// one level up — "not drawn in this view" and "broken" rendering as one value.
//
// ⭐ WHY A REGISTRY AND NOT A CONSTANT. A hard-coded sentence naming "the BIM 3D view" would be
// an ASSERTION, and it would rot the first time a lane wires Cesium — silently, because nothing
// would fail. So each renderer DECLARES itself as it subscribes, and the sentence is derived from
// who actually did. Wire a second surface and the affordance updates itself; wire none (the scene
// never initialised in this session) and the row says THAT instead of naming a view the user
// cannot reach. The claim can only ever be as true as the wiring.
//
// ⚠ AND AN EMPTY REGISTRY IS `unreported`, NEVER `none` — see `SiteHighlightReach.status`. A
// renderer can subscribe WITHOUT registering (that is the world that existed before this
// registry, and it is the state of any renderer a future lane has not yet declared), so an
// absence of declarations is a gap in PRYZM's reporting and not a finding that the click is
// dead. The two must not print the same sentence (C84 EI-1b).
//
// ⛔ THIS IS NOT A SECOND SUBSCRIBER LIST. `listeners` is the notification channel and stays
// anonymous — a card that repaints its own pressed state subscribes too and is NOT a surface that
// draws geometry. Counting `listeners` to answer "where will this show?" would report the panel
// as a viewport, which is the [[fake-more-capable-than-real]] shape.

/** Registered surfaces: opaque id -> the user's word for the view it draws into. */
const drawSurfaces = new Map<string, string>();

/**
 * A renderer DECLARES that it subscribes AND draws the emphasis. Call it beside the
 * `subscribeSiteHighlight` call it describes, and dispose the returned function with it — a
 * registration that outlives its subscription would name a view that no longer repaints.
 *
 * @param id        stable, unique per renderer (last registration for an id wins, so a
 *                  hot-reloaded renderer replaces its own row instead of duplicating it)
 * @param viewLabel THE USER'S word for the view, matching the view switcher's own label. Not a
 *                  class name: this string is shown to the founder.
 */
export function registerSiteHighlightSurface(id: string, viewLabel: string): () => void {
    drawSurfaces.set(id, viewLabel);
    return () => {
        drawSurfaces.delete(id);
    };
}

/** The view labels that can currently draw an emphasis, in registration order. */
export function getSiteHighlightSurfaces(): readonly string[] {
    return Object.freeze([...drawSurfaces.values()]);
}

/** Where a click will be visible, and the sentence that says so. */
export interface SiteHighlightReach {
    /** The user's word for each view that DECLARED it draws the emphasis. */
    readonly surfaces: readonly string[];
    /**
     * ⛔ `unreported` IS NOT `none`, AND CONFLATING THEM WOULD BE THIS MODULE'S OWN DEFECT.
     *
     * An empty registry means no renderer has DECLARED itself in this session. It does NOT
     * establish that nothing draws the emphasis — a renderer can subscribe without registering,
     * which is precisely the world that existed before this registry, and the scene may simply not
     * have initialised yet. Printing "nothing will happen" from an absence of reporting asserts a
     * fact about the product that the registry cannot support, and it would be WRONG the moment it
     * mattered most: on a card rendered a few frames before `initScene` runs.
     *
     * This is the rule `viewSegmentSwitcher.ts` already states for its own snapshot — *"UNREPORTED
     * ≠ NOT CURRENT … a gap in the AUTHORITY, not a judgement that the view is off, and the two
     * must not print the same thing (C84 EI-1b)"* — applied to the same class of question, and it
     * is copied rather than re-derived.
     */
    readonly status: 'named' | 'unreported';
    /**
     * Always a full sentence, on BOTH arms — the same rule
     * `SiteHighlightAvailability.reason` follows, for the same reason.
     */
    readonly sentence: string;
}

/**
 * THE reach decision. Pure over the registry; total; never throws.
 *
 * ⚠ Neither arm blames the parcel. The `unreported` sentence says the gap is in PRYZM's own
 * reporting; without that clause it reads as though the plot were the problem, which is the
 * overstatement this whole card is written against (L-616).
 */
export function describeSiteHighlightReach(): SiteHighlightReach {
    // P8 — the module's convention is a span on the DECISION functions (see
    // `describeSiteHighlightAvailability`), not on the trivial store accessors beside them. This is
    // a decision, and the attribute it records is the number the affordance prints.
    const span = _tracer.startSpan('pryzm.site.describeSiteHighlightReach');
    try {
        const surfaces = getSiteHighlightSurfaces();
        span.setAttribute('pryzm.siteHighlight.drawSurfaces', surfaces.length);
        if (surfaces.length === 0) {
            return Object.freeze({
                surfaces,
                status: 'unreported' as const,
                sentence:
                    'No view has declared that it draws this emphasis in this session, so PRYZM '
                    + 'cannot tell you which one to look at. That is a gap in PRYZM’s own '
                    + 'reporting — not a finding about this parcel — so if the click appears to do '
                    + 'nothing, try another view.',
            });
        }
        const named = surfaces.length === 1
            ? surfaces[0]!
            : `${surfaces.slice(0, -1).join(', ')} and ${surfaces[surfaces.length - 1]!}`;
        return Object.freeze({
            surfaces,
            status: 'named' as const,
            sentence:
                `Shown in the ${named} view${surfaces.length > 1 ? 's' : ''}. The other site views do `
                + 'not draw this emphasis yet, so switch views if nothing changes.',
        });
    } finally {
        span.end();
    }
}

/** Test-only reset for the surface registry. Separate from the subject reset on purpose:
 *  a spec about WHERE an emphasis lands must not have to clear WHICH one is active. */
export function __resetSiteHighlightSurfacesForTests(): void {
    drawSurfaces.clear();
}

// ── §C13-CANDIDATE-OWNERS (ADR-0298 §3, lane CI-GREEN/ISO) — project-switch owner ──
//
// The header already says an emphasis is "a momentary act of reading, not a preference"
// and refuses to persist one. A project switch is the same argument at a different
// boundary: `active` is written by a click on PROJECT A's envelope card and, with no
// owner, is still in force when project B's scene subscribes — so B opens with every
// surface RECEDED around a subject nobody in B asked about, and (by this module's own
// rule) the dimming is what carries the emphasis, so there is no bright thing on screen
// to explain it. Worse when the subject is unavailable in B: the row that would explain
// the state renders un-clickable, so the emphasis has no visible cause at all.
//
// ⛔ ONLY THE SUBJECT IS CLEARED — NEVER `listeners`. The test seam above drops both
// because a spec must not inherit the previous spec's subscribers; a project switch is
// the opposite case, since the scene and the panel that subscribed are the SAME live
// surfaces after the switch. Clearing the set on a switch would silently unsubscribe
// them and the next highlight would repaint nothing. This is the ISO45 rule ("the
// project-switch reset was SPLIT from the test reset so the switch does not clear the
// subscription latch") applied verbatim, and it is why this does not simply call
// `__resetSiteHighlightForTests()`.
//
// `setSiteHighlight(null)` rather than `active = null` on purpose: subscribers must be
// told, or a renderer keeps drawing project A's recede state until some unrelated event
// happens to repaint it — the poll-not-push defect this module's push contract exists to
// make structurally impossible. It no-ops when nothing was emphasised.
projectScopeRegistry.register({
    scopeName: 'site.geometryHighlight',
    clear: () => setSiteHighlight(null),
});

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
    // §RESI-ORCH-TARGET-AREA (STR §5) — the user's proposed ground-floor plate. Its own role,
    // because it is the one thing on the ground that PRYZM did not derive from anything: it is
    // what the USER asked for, fitted inside the permitted footprint.
    | 'proposal'
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
export type SiteHighlightCue =
    | 'front-edges'
    | 'inset-ring'
    | 'limit-plane'
    /** §26.6 rule 2 — the axis-aligned box the `Bounding box` row describes. Never on screen otherwise. */
    | 'bbox'
    /** §26.6 rule 2 — ONE segment of the ring, the edge a setback-register row names. */
    | 'boundary-edge';

/** See `SiteHighlightCue`. Total; pure. */
export function siteHighlightCue(subject: SiteHighlightSubject): SiteHighlightCue | null {
    // An edge is answered by ONE constructed segment; the rest of the ring recedes around it so
    // the edge is legible AS a part of the ring (the frontage rule, per edge).
    if (parseEdgeHighlightSubject(subject) !== null) return 'boundary-edge';
    switch (subject as SiteHighlightFixedSubject) {
        case 'frontage': return 'front-edges';
        case 'footprint': return 'inset-ring';
        case 'height': return 'limit-plane';
        case 'bbox': return 'bbox';
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
    // ⛔ A PROPOSAL IS NEVER THE SUBJECT OF ONE OF THESE SIX NUMBERS. Every one of them is a fact
    // about the PARCEL or the ORDINANCE — none of them describes what the user asked for. Lighting
    // the user's own plate when they click "Max footprint" would answer a question about the law
    // with a picture of a wish.
    if (role === 'proposal') return 'recede';
    // An edge is a CONSTRUCTED cue like frontage: the authored ring recedes so the one lit
    // segment reads as a part of it, never as a second outline.
    if (parseEdgeHighlightSubject(subject) !== null) return 'recede';
    switch (subject as SiteHighlightFixedSubject) {
        case 'parcel':
            return role === 'parcel-fill' || role === 'parcel-line' ? 'subject' : 'recede';
        case 'boundary':
            return role === 'parcel-line' ? 'subject' : 'recede';
        case 'gfa':
            return role === 'envelope-volume' || role === 'study-volume' ? 'subject' : 'recede';
        case 'bbox':
        case 'frontage':
        case 'footprint':
        case 'height':
            // Every authored surface recedes; only the constructed cue carries the answer.
            return 'recede';
    }
}

/**
 * §26.6 rule 2 — the axis-aligned bounding box of a ring, as a closed 4-vertex ring in the SAME
 * frame as its input (scene XZ). The ONE producer of the box every renderer's `bbox` cue draws, so
 * the box the `Bounding box` row lights is the box its two numbers were measured on
 * (`polygonBboxXZ` in `parcelLawModel.ts` measures the same extremes). Empty for a ring under
 * three vertices — a degenerate ring has no box worth pointing at.
 */
export function boundingBoxRingXZ(
    ring: ReadonlyArray<{ readonly x: number; readonly z: number }>,
): ReadonlyArray<{ readonly x: number; readonly z: number }> {
    if (ring.length < 3) return [];
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of ring) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
    }
    return Object.freeze([
        { x: minX, z: minZ }, { x: maxX, z: minZ }, { x: maxX, z: maxZ }, { x: minX, z: maxZ },
    ]);
}
