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
 * land developer arrives with QUESTIONS, in a fixed order, and this module is them.
 *
 * ⚠ IT WAS SIX AND IT IS NOW **SEVEN** (§STAGE-05-SECTION, 2026-09-07, L-13237). Founder:
 * *"THE ROOMS SHOULD BE THE NEW SECTION 4."* The room programme and `Rooms per level` were both
 * inside question 3 — the founder's Stage 03 and Stage 05 sharing one question — and `C115-06`
 * requires that to be fixed by SPLITTING group 3, which is what question 4 below is. Every
 * "six" left in this file is a verbatim quotation of STR §26.3 and is kept as history under
 * `C115-08`, annotated where it could be misread as the current count.
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

/**
 * The persona questions of STR §26.3, as data.
 *
 * ⚠ THE COUNT IS NO LONGER SIX. `C115-08` requires the count to move wherever it is written, in
 * the same PR that changes it. STR §26.3 states six; the ladder ships **seven** since
 * §STAGE-05-SECTION split the programme out of question 3 (`C115-06`). The six-question quotation
 * below is kept verbatim as the provenance record — it is history, annotated, not edited.
 */
export interface QuestionGroupSpec {
    /** Stable id — the testid suffix and the open/closed memory key. */
    readonly id: string;
    /** 1..7. Rendered as the chip and asserted by the ordering spec. */
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
 * ⭐ THE QUESTIONS — STR §26.3, verbatim in order, plus the one this session split out of 3.
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
 * has no envelope, so groups 3–7 have nothing of their own to say yet — their digests say so in
 * words. The two that ALWAYS have an answer (what this plot is, and what the law permits on it)
 * are the two the reader came for, and they are the two that open. Once an envelope exists, the
 * user has opened 3 themselves and its state is remembered for the session.
 *
 * ⭐ §STAGE-05-SECTION — question 4 (`rooms`) is the SEVENTH group and it too opens closed, for
 * the same stated reason: a cold arrival has declared no rooms. That is also the single biggest
 * answer to the founder's *"smaller and more discreet"* — an entire stage folds to one row, and
 * its digest still states what is inside it, so *"discreet"* never becomes *"gone"*.
 */
export const PARCEL_LAW_QUESTION_GROUPS: readonly QuestionGroupSpec[] = Object.freeze([
    Object.freeze({
        id: 'plot',
        ordinal: 1,
        question: 'What is this plot?',
        hint: 'Reference, address, area, source and when it was retrieved.',
        open: true,
        // ⭐ L-13139 / C115 §15 D-10 — FIXED HERE, AND THE MECHANISM IS WORTH STATING.
        //
        // The first probe below is the ONLY one this spec used to carry, and since the
        // §ONE-PARCEL-BLOCK merge (L-13005) it has resolved to nothing: in `plot` scope the fact
        // renderer emits no PARCEL rows at all when geometry exists — it hands them to the
        // cadastral card, which typesets `pryzm-parcel-card-val`, not `anl-plaw-val`. Both
        // classes missed, the digest fell through to `emptyDigest`, and a committed plot with a
        // full card beside it summarised itself as **"no plot committed"** — a positive false
        // claim, which is worse than a blank.
        //
        // ⛔ THE FIX IS A PROBE, NOT A SECOND DERIVATION. `C115-99`: a probe MUST move with the
        // rendering it mirrors. The card now carries `PARCEL_CARD_AREA_ROW_TESTID` on its
        // primary area row — registry where the source publishes one, ring where it does not,
        // and the honest `not determinable from this ring` arm — so the digest mirrors whichever
        // area the card actually printed, including the arm where the answer is that there is
        // none. The old selector is KEPT and probed FIRST because `all` scope still renders it,
        // and the scene-measured row still carries it when the two rings disagree.
        headlineProbes: Object.freeze([
            { selector: '[data-testid="parcel-law-fact-parcel-area"] .anl-plaw-val' },
            { selector: '[data-testid="parcel-card-area"] .pryzm-parcel-card-val' },
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
        // §ENVELOPE-CREATION-IS-A-STAGE-02-VERB (L-13202, founder 2026-09-07) — the hint names the
        // CREATE verb, because it is now in this question. See the note below.
        hint: 'The buildable envelope, the setback per edge, its ordinance citations (who says so), '
            + 'its confidence — and the controls that turn it into a massing envelope.',
        open: true,
        // ════════════════════════════════════════════════════════════════════════════════════════
        // ⭐⭐ §SECTION-2-MIRRORS-ITS-OWN-DETERMINATION (L-13202 · C115 §12.1 `C115-99`/`C115-100`)
        // ════════════════════════════════════════════════════════════════════════════════════════
        // Founder 2026-09-07, with a screenshot: this question's collapsed digest read
        // *"no determination held"* while its own body stated **6 storeys · 22.4 m · 452 m² ·
        // 2,711 m²**, cited to PGM Art. 242.2. **A section reporting EMPTY while holding real data.**
        //
        // ⭐ MECHANISM, MEASURED, NOT ASSUMED — and none of the three theories put to this lane was
        // the cause. It was not the authored envelope (C114) overwriting the solved determination
        // (C58), not a C06 §13.3 two-producer collision, and not a digest computed from a different
        // source than the body renders. **All SEVEN of this group's probes were unreachable, and
        // had been since `27d3c93b`.** Every one of them is emitted by `buildParcelLawFacts` on its
        // `wantLaw` arm only; that commit (§26.6 rules 1+2, L-13046) deleted
        // `factsLawSlot.replaceChildren(renderModel(model, { scope: 'law' }))` as a DUPLICATE of the
        // envelope card's own fold and left the probes pointing at it. The tab now has exactly one
        // production call and it passes `{ scope: 'plot' }`, into question 1.
        // ⛔ So the digest was not wrong about the parcel — it was reading a rendering that no longer
        // exists. It could not have mirrored anything, on any parcel, in any state. The founder's
        // *"after having created the massing envelope"* is a reporting artefact: the digest is only
        // VISIBLE when the group is collapsed, and he collapsed it once question 3 had grown.
        //
        // ⭐ WHY RE-POINTED RATHER THAN RESTORED. `C115-125` and L-13139 prescribe the fix as *"the
        // rendering coming back"*. ⛔ That collides with founder rule 1, which is what DELETED the
        // rendering as a duplicate — restoring it re-mints exactly the duplication he named, and
        // `C115-11` forbids fixing a duplication by adding a rendering back. The determination is
        // ALREADY in this question's body: the envelope card's ceiling headline is mounted here and
        // states the same four figures from the same model. So the mirror is pointed at the
        // rendering that survived. C115 §12.1 is amended in the same commit to say so.
        //
        // ⛔ THE ROW ORDER IS THE BODY'S, NOT A PREFERENCE. A mirror that re-ranks its source has
        // started choosing; these four are probed in the order `CEILING_KEYS` prints them.
        // `[data-derived="yes"]` is load-bearing: without it a `not derived` row resolves first and
        // the digest would state *"not derived"* for a parcel whose other three ceilings are known.
        headlineProbes: Object.freeze([
            { selector: '[data-ceiling="levels"][data-derived="yes"] .anl-card-row-val', prefix: 'max levels ' },
            { selector: '[data-ceiling="height"][data-derived="yes"] .anl-card-row-val', prefix: 'max height ' },
            { selector: '[data-ceiling="implantation"][data-derived="yes"] .anl-card-row-val', prefix: 'max footprint ' },
            { selector: '[data-ceiling="buildable"][data-derived="yes"] .anl-card-row-val', prefix: 'max GFA ' },
            // ⚠ THE FOUR BELOW ARE UNREACHABLE TODAY AND ARE KEPT DELIBERATELY, NOT BY OVERSIGHT.
            // They are the law-scope rendering's own hooks. §10's arbiter may yet restore that
            // rendering into this same slot (`C115-125`); if it does, these resolve and the digest
            // needs no further edit. They are listed AFTER the live probes so they can never
            // pre-empt one, and `parcelLawQuestionGroups.spec.ts` proves a live probe answers first.
            { selector: '[data-testid="parcel-law-fact-footprint"] .anl-plaw-val' },
            { selector: '[data-testid="parcel-law-fact-max-height"] .anl-plaw-val' },
            { selector: '.anl-plaw-refusal-headline' },
            { selector: '[data-testid="parcel-law-envelope-absent"]' },
        ]),
        // C58 §1.2 — a ceiling may not appear in this digest without what stands behind it.
        // `data-ceilings-derived` is the headline's OWN count (`"4 of 4 derived"`), published rather
        // than re-derived. ⚠ It deliberately UNDER-claims: the card's provenance badge (*"Real ·
        // constructed"* / *"Estimated"* / *"⚠ Unverified · machine-extracted"*) is the stronger
        // statement and is built inside `GISAreaLayout.ts` with no stable hook — L-13203 holds that
        // open. A fallback must fail towards under-claiming, never towards over-claiming.
        confidenceProbes: Object.freeze([
            { selector: '[data-testid="envelope-ceiling-headline"]', attr: 'data-ceilings-derived' },
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
        // ════════════════════════════════════════════════════════════════════════════════════════
        // ⭐⭐ §ENVELOPE-CREATION-IS-A-STAGE-02-VERB (L-13202) — THIS QUESTION IS NOW THE LEDGER ONLY
        // ════════════════════════════════════════════════════════════════════════════════════════
        // Founder 2026-09-07, twice, with two screenshots: *"REVIEW THIS SECTION — THIS HAS BEEN
        // DONE ALREADY ON SECTION 2 — AND KEEP THE SECTION 02 INTACT"*, and *"SECTION 3 SHALL HAVE
        // ONLY THIS SCOPE"* over a shot of the intent-vs-ceiling ledger and its two groups. So
        // `Create the envelope` moved into question 2 and this question keeps **3.1 Levels and
        // heights** and **3.2 Areas**.
        //
        // ⭐ IT IS A READ SURFACE. Question 2 is where you ACT on the parcel; this is the ledger of
        // what you declared against what you are allowed. That reading is now `C115-12`'s
        // canonical-home table, amended in the same commit so it is not re-litigated.
        //
        // ⛔ AND THE PROBES MOVED WITH THE RENDERING THEY MIRROR (`C115-100`). All three of this
        // group's old probes (`parcel-law-authoring-status` twice, plus its `data-state`) are built
        // inside the block that relocated; leaving them here would have re-created D-10 in question
        // 3 on the same day it was fixed in question 2. They now read the ledger's own verdicts.
        hint: 'Every intent you have declared, beside the ceiling it is measured against — '
            + '3.1 levels and heights, 3.2 areas.',
        open: false,
        // ⛔ THE REFUSAL IS PROBED FIRST, AND THAT ORDER IS THE CONTRACT, NOT A PREFERENCE. C115
        // §6.1 (`C115-50`) forbids silent clamping and requires BOTH numbers; a collapsed group that
        // hid an exceeded ceiling behind a "within" row would be that clamp wearing a disclosure.
        // `exceeds` therefore pre-empts every other verdict in this digest.
        headlineProbes: Object.freeze([
            { selector: '[data-verdict="exceeds"] .anl-plaw-intent-verdict' },
            { selector: '[data-testid="parcel-law-intent-ceiling-unreadable"]' },
            { selector: '[data-verdict] .anl-plaw-intent-verdict' },
        ]),
        confidenceProbes: Object.freeze([
            { selector: '[data-verdict="exceeds"]', attr: 'data-verdict' },
            { selector: '[data-testid="parcel-law-intent-ceiling-unreadable"]', attr: 'data-reason' },
            { selector: '[data-verdict]', attr: 'data-verdict' },
        ]),
        emptyDigest: 'nothing declared yet',
    }),
    // ═════════════════════════════════════════════════════════════════════════════════════
    // ⭐ QUESTION 4 — §STAGE-05-SECTION (C115 §8.1 `C115-170`…`C115-176`, L-13237)
    // ═════════════════════════════════════════════════════════════════════════════════════
    // Founder 2026-09-07: *"THE ROOMS SHOULD BE THE NEW SECTION 4 — BUT MAKE IT SMALLER AND
    // MORE DISCREET — BOTH THE ROOM GRAPH AND THE 'ROOMS PER LEVEL' SECTION."*
    //
    // ⭐ THIS IS THE SPLIT C115-06 ASKS FOR, NOT A NEW GROUP BUILT FROM NOTHING. The room
    // programme and `Rooms per level` were BOTH inside group 3's body, beneath the authoring
    // controls — the founder's Stage 03 and Stage 05 sharing one question. The slot moves; the
    // panel is the same instance, with the same producers, the same subscriptions and the same
    // sentences. `C115-07`: stage 05 had no question of its own and acquires one here.
    //
    // ⭐ THE QUESTION IS CONTRACT-GIVEN, NOT INVENTED. `C115-05`'s stage table names stage 05's
    // question verbatim: *"What can I fit inside it?"* — so the title is transcribed from the
    // contract rather than written to taste.
    //
    // ⚠ THE ORDINAL DIVERGES FROM `C115-05`'s STAGE ORDER, AND THAT IS RECORDED, NOT HIDDEN.
    // `C115-05` orders 04 FEASIBILITY then 05 PROGRAMME. The shipped group 4 (`allowance`) is a
    // PRECURSOR of stage 04 — §7 says the one feasibility table *"REPLACES the current
    // duplication between Designed vs permitted, How much allowance have I used?, Live
    // quantities"*, so it is not that table yet. The founder asked for rooms at **4**, which is
    // also the option that moves no content at all: the surface keeps the DOM position it
    // already occupied. `C115-170` records the divergence and L-13237 holds it open.
    Object.freeze({
        id: 'rooms',
        ordinal: 4,
        // `C115-05`, stage 05, verbatim.
        question: 'What can I fit inside it?',
        hint: 'Room library, the graph that drives the plan, the programme, and the rooms on each storey.',
        // §26.5's reason applies exactly: a cold arrival has declared no rooms, so this group has
        // nothing of its own to say yet and its digest says so in words. It is also the largest
        // single "smaller" available — the founder's screenshots are of the EXPANDED state.
        open: false,
        // ⭐ `C115-73` ASKS FOR A **PROGRAMME SUMMARY** FIRST, AND THE PANEL HAS NO SUMMARY BLOCK.
        // The digest supplies it — as a MIRROR of the programme headline the list already prints,
        // never as a second count. `C115-172`.
        headlineProbes: Object.freeze([
            { selector: '[data-testid="room-programme-summary"]' },
            { selector: '[data-testid="rooms-per-level-status"]' },
        ]),
        // ⚠ `C115-77` — the programme is SESSION-ONLY while the envelopes it places persist.
        // Putting it on the ladder presents it as project state, so the asymmetry is stated in
        // the one place C58 §1.2 already reserves for a figure's standing: its confidence.
        // Mirrored from an attribute the body carries, never composed here.
        confidenceProbes: Object.freeze([
            { selector: '[data-testid="room-programme-summary"]', attr: 'data-state' },
            { selector: '[data-testid="rooms-per-level-status"]', attr: 'data-state' },
        ]),
        emptyDigest: 'no rooms declared',
    }),
    Object.freeze({
        id: 'allowance',
        ordinal: 5,
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
        ordinal: 6,
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
        ordinal: 7,
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

/**
 * ⭐ §STAGE-01-DENSITY (C115 §11 `C115-90`/`C115-91`) — READ this session's remembered state for a
 * disclosure built OUTSIDE this file, so it can be an INSTANCE of the one primitive rather than a
 * sixth mechanism.
 *
 * C115 §11 measured FIVE rival disclosure mechanisms on this one surface and `C115-91` forbids
 * fixing that by adding another map. The *"View full parcel data"* fold in question 1 is produced
 * by `parcelCard.ts` — a DOM producer that deliberately holds no state — so it needs somewhere to
 * remember, and this is the map the six question groups already use: one key space (`data-testid`),
 * one session scope, deliberately NOT persisted so a new session gets the designed defaults back.
 *
 * `envelopeCardSections.ts` established exactly this shape (`envelopeCardFoldIsOpen`) for the
 * envelope card's string-built folds; this is the same accessor for the DOM-built ones.
 */
export function questionGroupFoldIsOpen(key: string, fallback = false): boolean {
    return openState.get(key) ?? fallback;
}

/** Write back what the reader did with such a fold. The other half of the accessor above. */
export function setQuestionGroupFoldOpen(key: string, open: boolean): void {
    openState.set(key, open);
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
            // ⛔ PR-H-01 / `C115-29` — A NEW HONESTY ATTRIBUTE MUST JOIN THIS FILTER IN THE SAME PR
            // THAT A DIGEST STARTS READING IT. A digest keyed on an unwatched attribute renders
            // once and then FREEZES: right on mount, silently stale for the rest of the session —
            // worse than an empty digest, because it looks answered.
            // ⭐ `data-verdict` (the intent-vs-ceiling row's arm) and `data-ceilings-derived` (the
            // card headline's derived count) are added by L-13202, with the two digests that read
            // them. `data-source-kind` and `data-intent` are the relocated authoring block's own
            // honesty attributes: no digest reads them TODAY, and they are listed so the next lane
            // to point a probe at one does not have to rediscover this trap.
            attributeFilter: [
                'data-state', 'data-arm', 'data-refusal-code', 'data-absence', 'data-derived',
                'data-verdict', 'data-ceilings-derived', 'data-source-kind', 'data-intent',
                'data-ceiling', 'data-reason',
            ],
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
