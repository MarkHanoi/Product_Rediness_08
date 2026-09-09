// §PL-ENVELOPE-AUTHORING (lane PL-ENVELOPE-AUTHORING, 2026-09-06) — STR-RESIDENTIAL-DESIGN-
// ORCHESTRATOR §25.2 / §25.6 · C114 §6a / §12 · C83 §1.2 · C16 CA-2 · P6.
//
// THE FOUNDER'S ASK, verbatim and in order:
//   · *"I shall be able to CREATE THE ENVELOPE — using the new category for envelopes as defined
//      in the contract C114"*
//   · *"THE ENVELOPE ELEMENT SHOULD BE LIKE A ROOM — LIKE A SLAB IN 3D VIEW — the user can define
//      the perimeter … then it would EXTRUDE"*
//   · *"the user here can define the NUMBER OF FLOOR LEVELS — of course limited to the parcel law
//      and the surface — and check against the requirements of the parcel"*
//
// This module is the ARITHMETIC AND THE DECISION for that gesture, and nothing else: it decides
// which storeys are used, how tall each envelope is, what each is named, what is REFUSED and what
// is merely ADVISED. It draws nothing, it stores nothing and it dispatches nothing.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ N STOREYS = N `level` ENVELOPES = ONE `spaceEnvelope.batch.create` = ONE Ctrl+Z
// ══════════════════════════════════════════════════════════════════════════════════════════════
// C114 §6a: there is no singular `spaceEnvelope.create`, and the batch verb IS the create path
// *"even for ONE envelope … so no caller can reach for the wrong one and ship N undo entries for
// one gesture"*. "Extrude by a level count" is therefore not a taller prism — a space envelope is
// SEATED ON A STOREY and its height is measured from that storey's datum (C114 §10), so four
// floors are four records, each on its own `levelId`, minted in ONE batch.
//
// ⭐ `adoptProposalAsEnvelope.ts` IS THE PROVEN SIBLING AND IS REUSED, NOT RIVALLED. That module
// already turns ONE study plate into ONE ground-floor envelope; its level reader
// (`readLevelCandidates`), its candidate type and its height ladder (`resolveStoreyHeight`, which
// this lane EXTRACTED out of it rather than copying) are imported here. What is genuinely new is
// only: N storeys instead of one, an arbitrary ring instead of a solved plate, and the storey-count
// verdict below.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ THE STOREY-COUNT VERDICT IS AN ADVISORY, NOT A REFUSAL — AND THAT IS THE CONTRACT, NOT A GAP
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The lane brief asks for *"refuse or warn with BOTH numbers"*. C114 §12 decides WHICH, and calls
// the row *"⭐ the decisive one"*:
//
//   > "A **level envelope outside the maximum buildable volume** — INADVISABLE / ADVISORY —
//   >  reported, never refused. The maximum buildable volume is a **STUDY, not a permit**
//   >  (C58/C74/C75). Refusing an architect's edit on the authority of a study PRYZM computed
//   >  would tell a professional they may not draw something they may well be entitled to build."
//
// C114 §14c re-affirms that this row is UNCHANGED while `room ⊂ level` became enforcement. So
// asking for five storeys where PRYZM derived four is **ADVISED WITH BOTH NUMBERS AND BUILT** —
// never refused, and ⛔ never silently clamped to four, which would answer a question the user did
// not ask and hide the disagreement.
//
// What IS refused is different in kind: PRYZM will not INVENT A STOREY to hold an envelope. That
// is not a judgement about the user's design at all — it is an admission that the project has no
// such level to seat a record on, and it carries both numbers too (asked vs available).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ AN UNKNOWN ORDINANCE DOES NOT BLOCK AUTHORING
// ══════════════════════════════════════════════════════════════════════════════════════════════
// At the founder's own Córdoba parcel the card correctly reads *"PRYZM has not transcribed this
// Córdoba ordenanza's buildable rules … not an error"*. With `maxFloors: null` this planner emits
// NO advisory and NO refusal about storey count — the envelope is authorable and its compliance is
// reported as UNKNOWN by the surface, never fabricated as compliant (C58 §1.4 / L-616: *"an UNKNOWN
// constraint drawn as zero or unbounded is an overstatement on real land"*).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ §ENVELOPE-DRAW-ON-THE-SITE-VIEWS (lane ENVELOPE-DRAW, 2026-09-07) — PROVENANCE, AND REPLACE
// ══════════════════════════════════════════════════════════════════════════════════════════════
// TWO LIVE DEFECTS THIS COMMIT CLOSES ON THE PATH THAT ALREADY SHIPS (PLAN-ENVELOPE-DRAW §4):
//
//  1. ⛔ `AuthoredEnvelopeSpec` HAD NO `provenance`. C58 §1.19 clause 3 is unambiguous — *"an
//     authored envelope carries `confidence: 'authored'` and may never borrow a solved tier"* — yet
//     every envelope created from this planner landed on the schema's retrofit default,
//     `predates-provenance`. Two consequences were shipping: the founder's own envelopes did not
//     read as his, and `isReplaceableByGeneratedMassing` (null/unknown ⇒ block) made them silently
//     BLOCK the massing-option replace path — the L-13038 behaviour pointed the wrong way. Every
//     spec now carries `authoredProvenance(detail)`, the ONE constructor that may write `authored`
//     (C75 §2.2 — a system pass cannot reach it by type), with the detail naming the ring source.
//
//  2. ⛔ THE CONTROL ACCUMULATED (L-13047's tail): press Create twice and every storey carried two
//     level envelopes. The founder's L-13038 ruling — *"when I select another the previous shall be
//     removed"* — applies to his own authoring too. The planner now takes WHAT IS ALREADY ON EACH
//     STOREY (`existing`, the read RESULT, so *"could not read"* and *"empty"* never arrive as one
//     value), asks `resolveLevelEnvelopeSupersession` with `OWN_AUTHORING_RULE`, and returns the ids
//     to supersede in the SAME `spaceEnvelope.batch.create` — one produceCommand, one undo (C114
//     §6d). Only `authored` is replaced; a plate PRYZM fitted, or an origin PRYZM cannot establish,
//     REFUSES with the storey named and the way out. The outcome is stated BEFORE the click.
//
// PURE: no store, no DOM, no THREE, no bus, no clock, no RNG (ids are minted by the CALLER —
// C16 CA-2: `execute()` runs again on REDO, so an id minted near the handler would differ the
// second time). Never throws. Deterministic.

import { trace } from '@opentelemetry/api';
import type { Pt, SpaceEnvelopeGroup } from '@pryzm/schemas';
import { authoredProvenance, type ValueProvenance } from '@pryzm/schemas/provenance';
import {
    OWN_AUTHORING_RULE,
    describeLevelEnvelope,
    resolveLevelEnvelopeSupersession,
    type ExistingLevelEnvelope,
    type LevelEnvelopeReadResult,
} from './levelEnvelopeSupersession';
import {
    resolveStoreyHeight,
    type AdoptHeightSource,
    type AdoptLevelCandidate,
} from './adoptProposalAsEnvelope';

const _tracer = trace.getTracer('pryzm.site.envelopeAuthoringPlan');

/** A ring below this cannot bound an area — the same floor the L0 schema enforces. */
export const AUTHORING_MIN_RING_VERTICES = 3;

/** The most storeys one gesture may mint. A guard against a pasted `1e9`, not a design limit. */
export const AUTHORING_MAX_STOREYS = 40;

/** Why the gesture could not produce a plan. Closed — a new arm is a type error at every switch. */
export type EnvelopeAuthoringRefusalReason =
    /** No footprint ring to extrude: nothing solved, nothing drawn. */
    | 'no-footprint-ring'
    /** The storey field was empty or not a number. */
    | 'storeys-not-a-number'
    /** Zero, negative, or not a whole number of storeys. */
    | 'storeys-not-positive'
    /** More storeys than one gesture may mint. */
    | 'storeys-above-batch-limit'
    /** The project has no storeys at all. */
    | 'no-levels'
    /** Every storey sits below the datum — there is no ground floor to start from. */
    | 'no-ground-level'
    /** ⭐ Fewer storeys exist than were asked for. PRYZM does not create one to hold a number. */
    | 'not-enough-storeys'
    /** The caller minted fewer ids than storeys. A wiring fault, surfaced rather than swallowed. */
    | 'too-few-ids'
    /** §ENVELOPE-DRAW R8 — the space-envelope store could not be READ. Creating blind is how rivals accumulate. */
    | 'envelopes-unreadable'
    /** §ENVELOPE-DRAW R8 — a target storey carries a level envelope this control did not author. Refused, nothing deleted. */
    | 'rival-envelope-not-authored'
    /**
     * ⭐ §ENVELOPE-PER-LEVEL (lane FACE-DRAG-2, 2026-09-07) — the caller named a starting storey
     * that is not one of the seatable ones. ⛔ A NAMED start that does not resolve must REFUSE and
     * never fall back to the lowest: silently seating the envelope somewhere other than where the
     * user pointed is a confidently wrong answer about which floor they are designing.
     */
    | 'start-storey-not-seatable'
    /**
     * ⭐ §ENVELOPE-PER-LEVEL — there are enough seatable storeys in the project, but not enough
     * AT OR ABOVE the one the user chose. A different fact from `not-enough-storeys`, and it needs
     * a different sentence: the fix is to start lower, not to add levels.
     */
    | 'not-enough-storeys-above-start';

/**
 * ⭐ THE STOREY-COUNT DISAGREEMENT — REPORTED, BUILT ANYWAY. See the header: C114 §12 rules this
 * ADVISORY because the permitted storey count is a STUDY. Both numbers are carried as VALUES so
 * the surface renders them rather than parsing them back out of prose.
 */
export interface EnvelopeAuthoringAdvisory {
    readonly code: 'exceeds-permitted-storeys';
    readonly askedStoreys: number;
    readonly permittedStoreys: number;
    readonly statement: string;
}

/** The exact `spaceEnvelope.batch.create` spec shape (C114 §6), spelled locally so this module
 *  needs no import from the plugin it consumes — the bus is the boundary. */
export interface AuthoredEnvelopeSpec {
    readonly spaceEnvelopeId: string;
    readonly levelId: string;
    readonly footprint: readonly { readonly x: number; readonly y: 0; readonly z: number }[];
    /**
     * ⭐⭐ §ENVELOPE-STOREY-SEAT (lane ENVELOPE-DRAW-AND-STOREYS, 2026-09-07 · L-13146) —
     * WHERE THIS STOREY'S PRISM SITS, AND IT IS **NOT** ZERO ANY MORE.
     *
     * The founder set 5 storeys, PRYZM created 5 records on 5 different levels, and he reported
     * *"created it but only ground floor"*. His own log agreed with him and with PRYZM at the same
     * time: `drew 5/5 authored envelope(s) [level@3.0m, level@3.0m, level@2.6m, level@15.3m,
     * level@3.0m] · base=90.22 m`. **ONE base for all five.** Five prisms with the same footprint
     * and the same base are five prisms in the same place — the stack read as one ground plate.
     *
     * ⛔ THE VALUE WAS A TYPE LITERAL `0`, SO THE DEFECT WAS UNREPRESENTABLE AS A BUG AND
     * UNFIXABLE AS A VALUE. It was correct exactly once — when this family's only producer was
     * `adoptProposalAsEnvelope`, which mints ONE plate on the GROUND storey, whose elevation IS 0.
     * The day a gesture minted a SECOND storey the literal became a lie, and nothing could catch
     * it because `0` was the type.
     *
     * ⛔⭐ THE DATUM, STATED — AND IT IS A DELIBERATE DEPARTURE FROM C114 §"Datum".
     * C114 says *"level-relative: `baseOffset` and `height` are measured from the owning level's
     * datum"*, which would make `0` right and put the storey elevation in the RENDER TRANSFORM
     * (C114's own field table says `baseOffset` is *"TRANSFORMED → prism base Y"*). **Every
     * rasteriser in this repo implements the identity transform instead:**
     *   · `apps/editor/src/engine/SpaceEnvelopeMeshBuilder.ts` `_faceGeometry`:
     *       `const baseY = prism.baseOffset;`                      ← no level elevation
     *   · `apps/editor/src/ui/geospatial/CesiumViewport.ts` `renderSpaceEnvelopes`:
     *       `const bottom = baseHeight + baseOffset;`              ← terrain seat, no level elevation
     *   · `apps/editor/src/engine/SpaceEnvelopePlanSymbolBuilder.ts`:
     *       `const y = entry.baseElevation ?? entry.baseOffset;`   ← the two as ALTERNATIVES for
     *         one quantity, which is only coherent if `baseOffset` already IS the base
     *   · `apps/editor/src/ui/room-programme/roomEnvelopePlan.ts`:
     *       `baseOffset: level.baseOffset` — a room COPIES its host level envelope's seat rather
     *         than deriving one from the storey, which again only works if the seat is absolute.
     * ⇒ Four consumers, one convention: **`baseOffset` is the prism's base above the PROJECT
     * datum** (scene-Y 0 on the BIM canvas, the terrain seat on the 3-D Site). The prose is the
     * outlier, not the code, and this field now follows the four things that draw it.
     *
     * ⛔ THE ALTERNATIVE WAS REJECTED FOR A REASON, NOT FOR CONVENIENCE. "Leave `0` and teach the
     * renderers to add `level.elevation`" is the C114-literal fix — but it cannot be done to ONE
     * rasteriser at a time, and the two site rasterisers are owned by different lanes. A tree in
     * which the BIM canvas adds the storey elevation and the 3-D Site does not is TWO answers to
     * *"where is this envelope"*, and the face-drag pick reads the 3-D Site's frame while the
     * gizmo draws in the BIM one — so the half-migrated state is a grab that lands on nothing
     * (§L-430 / L-10740), which is strictly worse than the bug being fixed. **L-13147 files the
     * reconciliation of C114's datum sentence and `packages/schemas/src/elements/SpaceEnvelope.ts`'s
     * matching doc comment; it is a prose change and it is not this lane's to make.**
     *
     * ⛔ IT IS THE STOREY'S OWN `elevation`, NEVER AN ACCUMULATION OF THE STOREY HEIGHTS.
     * Summing `height` up the stack would be a SECOND answer to *"where is storey N"* — one this
     * module invented — and it would disagree with the level records the moment a floor-to-floor
     * is edited without the levels above it moving (which is a real state: `SetLevelHeightCommand`
     * and `level.update` write them independently). The model already knows where each storey is.
     * If two storeys share an elevation their envelopes still coincide — that is the MODEL saying
     * so, and reporting it faithfully is the honest answer (C84 EI-9).
     */
    readonly baseOffset: number;
    readonly height: number;
    readonly role: 'level';
    readonly withinId: null;
    readonly name: string;
    /**
     * §ENVELOPE-DRAW — WHO made this. ALWAYS `authoredProvenance(detail)` here: this planner only
     * ever records a human decision (C58 §1.19 clause 3), and `authored` is reachable through
     * exactly one constructor so a grep finds every site that claims a user acted (C75 §2.2).
     * ⛔ A replacement stays `authored` — never `regenerated`, which is a SYSTEM origin and would
     * make the next generated massing option free to sweep the user's drawing away.
     */
    readonly provenance: ValueProvenance;
    /**
     * ⭐ ADR-0383 / C114 §6d clause 6 — WHICH BUILDING this storey belongs to, echoed verbatim
     * from `EnvelopeAuthoringInput.group`. `null` on every single-building gesture, which is every
     * gesture that predates ADR-0383 and every one where the user has not named a block.
     *
     * ⛔ IT IS EMITTED ON EVERY SPEC, INCLUDING WHEN IT IS `null`, and that is deliberate. A field
     * present-but-null says *"this planner considered the question and the answer is the ungrouped
     * bucket"*; a field sometimes-absent would make the spec shape depend on the input, and the one
     * consumer (`CreateSpaceEnvelopeSpec.group?`) distinguishes absent from null by design.
     */
    readonly group: SpaceEnvelopeGroup | null;
}

/** One storey of the plan, so a surface can list what it is about to create BEFORE the click. */
export interface AuthoredStoreyRow {
    readonly levelId: string;
    readonly label: string;
    readonly elevation: number;
    readonly heightM: number;
    readonly heightSource: AdoptHeightSource;
}

export interface EnvelopeAuthoringPlan {
    readonly ok: true;
    readonly command: 'spaceEnvelope.batch.create';
    readonly payload: {
        readonly envelopes: readonly AuthoredEnvelopeSpec[];
        /**
         * §ENVELOPE-DRAW R8 / C114 §6d — the level envelopes this batch REPLACES, removed in the
         * SAME command so the swap is ONE undo. Empty when every target storey was clear.
         */
        readonly supersedes: readonly string[];
    };
    /** `replace` when `supersedes` is non-empty — the surface says so BEFORE the click. */
    readonly intent: 'create' | 'replace';
    /** What is being replaced, as VALUES, so a surface renders them without parsing prose. */
    readonly replaces: readonly ExistingLevelEnvelope[];
    readonly storeys: readonly AuthoredStoreyRow[];
    /** The footprint area every storey carries, m² — passed IN, never re-derived here. */
    readonly footprintAreaM2: number;
    /**
     * The total floor area this gesture will declare as intended, m² — `footprintAreaM2 × storeys`.
     * ⚠ It is stated so the user sees it BEFORE creating, and it is the number the live BRUT check
     * will measure against the allowance afterwards.
     */
    readonly totalIntendedM2: number;
    /** `null` when the ordinance published no storey count, or the ask is within it. */
    readonly advisory: EnvelopeAuthoringAdvisory | null;
    /** Plain language: what will be created, on which storeys, how tall, and what it is NOT. */
    readonly statement: string;
}

export interface EnvelopeAuthoringRefusal {
    readonly ok: false;
    readonly reason: EnvelopeAuthoringRefusalReason;
    readonly statement: string;
    /**
     * ⭐ §ENVELOPE-PER-LEVEL — the storeys this gesture COULD have seated on, whenever the refusal
     * happened late enough to know them (`null` before the levels are read).
     *
     * ⛔ IT IS ON THE REFUSAL, NOT ONLY ON THE PLAN, AND THAT IS THE POINT. `AuthoredStoreyRow`'s
     * own doc has always said it exists so a surface can list the storeys BEFORE the click — but
     * only `.length` was ever read, so a user refused for *"you asked for 4, this project has 1"*
     * was told a number and shown nothing. A roster on the refusal is what lets the surface name
     * the storeys that DO exist and offer the way out ([[refusing-half-needs-its-escape-hatch]]).
     */
    readonly seatable?: readonly AuthoredStoreyRow[] | null;
    /**
     * §ENVELOPE-PER-LEVEL / D3 — how many storeys are MISSING, when that is the refusal. Carried as
     * a VALUE so the escape hatch states what it will create without parsing the sentence.
     */
    readonly missingStoreys?: number;
}

export type EnvelopeAuthoringResult = EnvelopeAuthoringPlan | EnvelopeAuthoringRefusal;

export interface EnvelopeAuthoringInput {
    /**
     * The footprint ring, scene-XZ metres — the SAME frame as the parcel ring and the envelope's
     * `insetPolygon`. Supplied by the caller from ONE producer; this module never solves a ring.
     */
    readonly ring: readonly Pt[] | null | undefined;
    /**
     * That ring's area, m², from the same producer that supplied the ring.
     * ⛔ NOT RECOMPUTED HERE — a second area routine is how a card comes to state a figure the
     * scene disagrees with (C84 EI-9). `null` when the producer could not state one.
     */
    readonly ringAreaM2: number | null;
    /** What the ring IS, in the user's words — printed, so the plan names its own provenance. */
    readonly ringSourceLabel: string;
    /** Straight off a text field, so `unknown` on purpose: it is CLASSIFIED here, never trusted. */
    readonly requestedStoreys: unknown;
    /** The ordinance figures, as the ONE parcel-law model states them. `null` ⇒ not published. */
    readonly ordinance: {
        readonly maxHeightM: number | null;
        readonly maxFloors: number | null;
    };
    /** The project's storeys (`readLevelCandidates(bimManager.getLevels())`). */
    readonly levels: readonly AdoptLevelCandidate[];
    /** One `spaceEnvelope_<ulid>` per storey, minted by the CALLER (C16 CA-2). */
    readonly mintedIds: readonly string[];
    /**
     * §ENVELOPE-DRAW R8 — what is ALREADY in the space-envelope store, as the READ returned it.
     * ⛔ REQUIRED, and the read RESULT rather than a bare array, because *"the store could not be
     * read"* and *"the storey is empty"* must not arrive here as the same value — the first refuses,
     * the second creates. A caller that does not read the store gets no plan, by type: that is the
     * accumulation defect made unrepresentable rather than remembered.
     */
    readonly existing: LevelEnvelopeReadResult;
    /**
     * The `authoredProvenance` detail — where the ring came from, in the caller's words, e.g.
     * *"user drew the envelope perimeter on the 3D Site view"*. Defaults to a sentence built from
     * `ringSourceLabel`, so provenance is never blank even when a caller says nothing more.
     */
    readonly provenanceDetail?: string;
    /**
     * ⭐ §ENVELOPE-PER-LEVEL (lane FACE-DRAG-2, 2026-09-07) — WHICH STOREY THE ENVELOPE STARTS ON.
     * The founder: *"we shall have an independent buildable envelope for each level."*
     *
     * ⛔ THE GAP THIS CLOSES WAS UNCHOOSEABILITY, NOT THE SCHEMA. `SpaceEnvelope` has carried
     * `levelId` and `role:'level'` all along and this planner has always emitted ONE record PER
     * STOREY; what it did was `seatable.slice(0, asked)` — always the LOWEST n, with no way to say
     * otherwise. A user with a 4-storey project who wanted an envelope on floors 2–4 could not
     * express it, and nothing on the surface said the choice existed.
     *
     * `null` / omitted keeps the previous behaviour exactly — start at the lowest seatable storey —
     * so every existing caller and spec is unaffected. A named id that is NOT seatable REFUSES
     * (`start-storey-not-seatable`) rather than falling back, because a silent fallback puts the
     * building on a different floor than the user pointed at and says nothing.
     */
    readonly startStoreyId?: string | null;
    /**
     * ⭐⭐ §MASSING-GROUPS (ADR-0383 D1/D3 · C114 §6e) — WHICH BUILDING THIS GESTURE IS BUILDING.
     *
     * A parcel may hold several independent buildings. Omitted or `null` ⇒ the UNGROUPED bucket,
     * which is **byte-identical to the behaviour that predates ADR-0383** — every existing caller
     * and every existing spec is unaffected, by construction rather than by care.
     *
     * ⛔⛔ THIS ARGUMENT IS THE WHOLE OF THE MULTI-PROFILE CORRECTNESS, AND IT IS ONE LINE.
     * It is forwarded to `resolveLevelEnvelopeSupersession`'s third parameter, which is what scopes
     * the supersession to THIS block. Without it, building Block B on a storey that already carries
     * Block A computes **Block A's ids into `supersedes`** — so creating the second tower DELETES
     * the first, in the same `produceCommand`, silently, with a sentence that says it replaced "the
     * level envelope already on this storey". That is precisely the defect ADR-0383 §2 exists to
     * end, and it is invisible to every gate.
     *
     * ⛔ AND THE FIX COULD NOT BE APPLIED DOWNSTREAM. Post-processing this planner's `supersedes`
     * in a caller would require re-running the group rule there — a SECOND implementation of the
     * one rule, which is this repository's dominant defect (the fix lands in the copy nobody is
     * looking at, and the guarding test stays green because it measured the other one). The bucket
     * is decided in exactly one place, inside the resolver; this field is how the decision reaches
     * it. Ownership of this file for this edit was granted by ORCHESTRATOR RULING 2026-09-09,
     * ADR-0383 §4b, for that reason.
     */
    readonly group?: SpaceEnvelopeGroup | null;
}

const isWholePositive = (n: number): boolean => Number.isFinite(n) && n > 0 && Number.isInteger(n);

/** The storeys an envelope may be seated on, lowest first. Below-datum storeys are excluded —
 *  the same datum rule `pickGroundLevel` applies, extended from "the ground one" to "the stack". */
export function seatableStoreys(
    levels: readonly AdoptLevelCandidate[],
): readonly AdoptLevelCandidate[] {
    return [...levels]
        .filter((l) => l.elevation >= -0.01)
        .sort((a, b) => (a.elevation - b.elevation) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const labelOf = (l: AdoptLevelCandidate): string =>
    l.name ?? `storey at ${l.elevation.toFixed(2)} m`;

/**
 * ⭐ §ENVELOPE-PER-LEVEL (lane FACE-DRAG-2, 2026-09-07) — THE STOREYS AN ENVELOPE MAY BE SEATED
 * ON, described: label, elevation, the height it would get and WHERE that height came from.
 *
 * ⛔ ONE PRODUCER, TWO READERS, AND THAT IS WHY IT IS EXPORTED. The plan builds its storey rows
 * from this, and the surface builds its storey SELECTOR from it. A surface that computed its own
 * labels would be a second answer to *"what are this project's storeys called?"* — and the list the
 * user chooses from would be free to disagree with the list the plan seats on, which is a bug that
 * only appears on projects with unnamed or oddly-elevated levels (C84 EI-9).
 *
 * ⚠ `heightSource` is carried, not just the number: a storey PRYZM assumed 3 m for is a different
 * fact from one the model states, and the selector says so before the click rather than after.
 */
export function describeSeatableStoreys(
    levels: readonly AdoptLevelCandidate[],
    ordinance: { readonly maxHeightM: number | null; readonly maxFloors: number | null },
): readonly AuthoredStoreyRow[] {
    return seatableStoreys(levels).map((l) => {
        const { heightM, heightSource } = resolveStoreyHeight(l, ordinance);
        return { levelId: l.id, label: labelOf(l), elevation: l.elevation, heightM, heightSource };
    });
}

/**
 * ⭐ BUILD THE PLAN. Pure; total; never throws.
 *
 * @param input everything the decision needs, all of it supplied by ONE producer per figure.
 */
export function buildEnvelopeAuthoringPlan(
    input: EnvelopeAuthoringInput,
): EnvelopeAuthoringResult {
    const span = _tracer.startSpan('pryzm.site.buildEnvelopeAuthoringPlan');
    try {
        const ring = Array.isArray(input.ring) ? input.ring : null;
        if (ring === null || ring.length < AUTHORING_MIN_RING_VERTICES) {
            span.setAttribute('pryzm.authoring.refusal', 'no-footprint-ring');
            return {
                ok: false,
                reason: 'no-footprint-ring',
                statement:
                    'There is no footprint to extrude. PRYZM has not solved a buildable footprint for '
                    + 'this parcel and you have not fitted a ground-floor plate, so there is no ring to '
                    + 'make an envelope from. This is a gap in what PRYZM has — NOT a finding that '
                    + 'nothing may be built.',
            };
        }

        const rawStoreys = typeof input.requestedStoreys === 'number'
            ? input.requestedStoreys
            : typeof input.requestedStoreys === 'string' && input.requestedStoreys.trim() !== ''
                ? Number(input.requestedStoreys)
                : NaN;
        if (!Number.isFinite(rawStoreys)) {
            span.setAttribute('pryzm.authoring.refusal', 'storeys-not-a-number');
            return {
                ok: false,
                reason: 'storeys-not-a-number',
                statement: 'Enter how many floor levels the envelope should have — a whole number of storeys.',
            };
        }
        if (!isWholePositive(rawStoreys)) {
            span.setAttribute('pryzm.authoring.refusal', 'storeys-not-positive');
            return {
                ok: false,
                reason: 'storeys-not-positive',
                statement:
                    `A building has a whole number of storeys, and at least one — ${String(input.requestedStoreys)} `
                    + 'is not one. Nothing was created.',
            };
        }
        if (rawStoreys > AUTHORING_MAX_STOREYS) {
            span.setAttribute('pryzm.authoring.refusal', 'storeys-above-batch-limit');
            return {
                ok: false,
                reason: 'storeys-above-batch-limit',
                statement:
                    `You asked for ${rawStoreys} storeys; PRYZM mints at most ${AUTHORING_MAX_STOREYS} envelopes in `
                    + 'one gesture, so that one undo can still remove the whole thing. Nothing was created. '
                    + 'This is a limit on the GESTURE, not a statement about what this parcel allows.',
            };
        }
        const asked = rawStoreys;

        if (input.levels.length === 0) {
            // §ENVELOPE-CREATE-DEADEND — the shortfall travels as a VALUE here too. See the
            // `not-enough-storeys` arm: a refusal that names a fix carries what the fix needs.
            span.setAttribute('pryzm.authoring.refusal', 'no-levels');
            return {
                ok: false,
                reason: 'no-levels',
                seatable: [],
                missingStoreys: asked,
                statement:
                    'This project has no storeys yet, so there is nothing to seat a level envelope on. '
                    + 'Create a level first; PRYZM will not invent one.',
            };
        }
        const seatable = seatableStoreys(input.levels);
        if (seatable.length === 0) {
            span.setAttribute('pryzm.authoring.refusal', 'no-ground-level');
            return {
                ok: false,
                reason: 'no-ground-level',
                seatable: [],
                missingStoreys: asked,
                statement:
                    `Every one of the ${input.levels.length} storeys in this project sits below the datum, so `
                    + 'there is no ground floor to start the envelope from. Add a storey at or above 0 m.',
            };
        }
        // ⭐ §ENVELOPE-PER-LEVEL — the roster EVERY late refusal carries, built once, so a surface
        // can list the storeys that DO exist instead of being handed only a count.
        const seatableRows = describeSeatableStoreys(input.levels, input.ordinance);

        if (seatable.length < asked) {
            // ⛔ BOTH NUMBERS, and the fix named. This is NOT a judgement about the design — it is
            // an admission that the model has nowhere to put the record.
            // ⭐ AND THE WAY OUT TRAVELS WITH IT (D3 / §REFUSING-HALF-NEEDS-ITS-ESCAPE-HATCH,
            // L-942). The SENTENCE is unchanged — it was already right — but the refusal now also
            // carries the storey roster and the shortfall as VALUES, so the surface can offer a
            // control that CREATES the missing storeys instead of telling the user to go and find
            // one. A gate whose "yes" branch the user cannot reach is a regression with a citation.
            span.setAttribute('pryzm.authoring.refusal', 'not-enough-storeys');
            return {
                ok: false,
                reason: 'not-enough-storeys',
                seatable: seatableRows,
                missingStoreys: asked - seatable.length,
                statement:
                    `You asked for ${asked} floor levels, but this project has ${seatable.length} storey`
                    + `${seatable.length === 1 ? '' : 's'} at or above the datum to seat them on. PRYZM will `
                    + 'not create a storey to hold a number. Add the missing levels first, then create the '
                    + `envelope — nothing was created. ⚠ This is about the MODEL, not the ordinance: it says `
                    + 'nothing about how many floors this parcel permits.',
            };
        }

        // ── ⭐ §ENVELOPE-PER-LEVEL — WHICH STOREY THIS ENVELOPE STARTS ON ────────────────────
        //
        // ⛔ A NAMED START THAT DOES NOT RESOLVE REFUSES; it never falls back to the lowest. A
        // fallback would seat the building on a floor the user did not point at and would look
        // exactly like a success.
        let startIndex = 0;
        const wantedStart = typeof input.startStoreyId === 'string' && input.startStoreyId !== ''
            ? input.startStoreyId
            : null;
        if (wantedStart !== null) {
            startIndex = seatable.findIndex((l) => l.id === wantedStart);
            if (startIndex < 0) {
                span.setAttribute('pryzm.authoring.refusal', 'start-storey-not-seatable');
                return {
                    ok: false,
                    reason: 'start-storey-not-seatable',
                    seatable: seatableRows,
                    statement:
                        `PRYZM was asked to start the envelope on a storey it cannot seat one on. The storeys `
                        + `available are: ${seatableRows.map((s) => s.label).join(', ')}. Nothing was created — `
                        + 'choose one of those and try again. (A storey below the datum is excluded on purpose: '
                        + 'a level envelope is measured from its own storey datum upwards.)',
                };
            }
            const above = seatable.length - startIndex;
            if (above < asked) {
                // ⛔ A DIFFERENT FACT FROM `not-enough-storeys`, WITH A DIFFERENT FIX. The project
                // HAS the storeys; there are not enough at or above the chosen start. Telling the
                // user to "add levels" here would send them to build storeys they already own.
                span.setAttribute('pryzm.authoring.refusal', 'not-enough-storeys-above-start');
                return {
                    ok: false,
                    reason: 'not-enough-storeys-above-start',
                    seatable: seatableRows,
                    missingStoreys: asked - above,
                    statement:
                        `You asked for ${asked} floor levels starting at ${seatableRows[startIndex]!.label}, but `
                        + `only ${above} storey${above === 1 ? '' : 's'} sit${above === 1 ? 's' : ''} at or above `
                        + `it — this project has ${seatable.length} seatable storey`
                        + `${seatable.length === 1 ? '' : 's'} in all. Start lower, ask for fewer, or add `
                        + `${asked - above} more storey${asked - above === 1 ? '' : 's'} above it. Nothing was created.`,
                };
            }
        }
        const used = seatable.slice(startIndex, startIndex + asked);
        if (input.mintedIds.length < asked) {
            span.setAttribute('pryzm.authoring.refusal', 'too-few-ids');
            return {
                ok: false,
                reason: 'too-few-ids',
                statement:
                    `PRYZM was handed ${input.mintedIds.length} element id(s) for ${asked} storeys, so it did `
                    + 'not create anything. This is a gap in PRYZM\'s wiring, not a refusal about your design.',
            };
        }

        // ── §ENVELOPE-DRAW R8 — WHAT IS ALREADY ON EACH TARGET STOREY, asked AFTER the storeys are
        // known and never before: the supersession is scoped to the storeys this gesture seats on,
        // so every other storey is untouched by construction rather than by care.
        if (!input.existing.readable) {
            span.setAttribute('pryzm.authoring.refusal', 'envelopes-unreadable');
            return { ok: false, reason: 'envelopes-unreadable', statement: input.existing.text };
        }
        const supersedes: string[] = [];
        const replaces: ExistingLevelEnvelope[] = [];
        const replacedCountByLevel = new Map<string, number>();
        const blockedSentences: string[] = [];
        // ⭐⭐ §MASSING-GROUPS — THE BUCKET THIS GESTURE SUPERSEDES WITHIN. See `input.group`: this
        // one expression is what stops creating Block B from deleting Block A. `null` is the
        // UNGROUPED bucket and is the default, so every pre-ADR-0383 caller is unchanged.
        const groupId = input.group?.id ?? null;
        for (const level of used) {
            const onStorey = input.existing.rows.filter((e) => e.levelId === level.id);
            // ⛔ THE ROWS ARE NOT PRE-FILTERED BY GROUP HERE, ON PURPOSE. The resolver takes the
            // whole storey and buckets INSIDE (C114 §6e clause 3) — filtering here would be the
            // second implementation of the group rule, and it would also cost the resolver the
            // peer count it needs to say "the 2 other blocks on this storey are untouched".
            const s = resolveLevelEnvelopeSupersession(onStorey, OWN_AUTHORING_RULE, groupId);
            if (s.kind === 'blocked') {
                blockedSentences.push(`On ${labelOf(level)} — ${s.sentence}`);
            } else if (s.kind === 'replace') {
                supersedes.push(...s.ids);
                replaces.push(...s.targets);
                replacedCountByLevel.set(level.id, s.ids.length);
            }
        }
        if (blockedSentences.length > 0) {
            // ⛔ REFUSE THE WHOLE GESTURE, not the storey: creating on three storeys and skipping
            // the fourth would leave the user with a partial building and no sentence saying which
            // floor is missing. Both numbers are in the storey sentences; the way out is named.
            span.setAttribute('pryzm.authoring.refusal', 'rival-envelope-not-authored');
            span.setAttribute('pryzm.authoring.blockedStoreys', blockedSentences.length);
            return {
                ok: false,
                reason: 'rival-envelope-not-authored',
                statement:
                    `${blockedSentences.join(' ')} ⚠ Nothing was created on ANY storey: this gesture is one `
                    + 'envelope per storey in one undo, and PRYZM will not create the other storeys and '
                    + 'leave this one out silently.',
            };
        }
        const intent: 'create' | 'replace' = supersedes.length > 0 ? 'replace' : 'create';

        // ⛔ The area is the CALLER's figure, echoed — never recomputed (see `ringAreaM2`).
        const footprintAreaM2 = input.ringAreaM2 !== null && Number.isFinite(input.ringAreaM2)
            ? input.ringAreaM2
            : 0;

        // §ENVELOPE-DRAW — the ONE detail every spec of this gesture carries, so the create arm and
        // the replace arm cannot describe the same producer two ways (C84 EI-8a). A storey that
        // replaced something says how many, so an N > 1 heal is not recorded as a fresh create.
        const baseDetail = input.provenanceDetail
            ?? `user extruded ${input.ringSourceLabel} over ${asked} storey${asked === 1 ? '' : 's'} `
               + 'from the envelope authoring control';

        /**
         * ⛔ §ENVELOPE-PER-LEVEL — ONE RING OBJECT PER STOREY, NEVER ONE SHARED BY ALL OF THEM.
         *
         * This built the ring ONCE and assigned the SAME array — and the same vertex objects —
         * into every storey's spec. The storeys were then independent RECORDS sharing ONE
         * GEOMETRY, which is the difference between "an independent envelope for each level" and a
         * copy of one envelope wearing n level ids. Anything downstream that mutated a vertex in
         * place — a face drag's planner output written back, a profile edit, a normalising pass —
         * would move every storey at once, and the user would see the whole stack shift while
         * dragging one floor's wall. It has not bitten yet only because nothing has mutated it in
         * place; that is an accident of the current callers, not a property of the design.
         *
         * ⚠ THE VERTICES ARE COPIED TOO, not just the array. A `slice()` of shared objects is a
         * second array over the SAME points and would keep exactly this defect while looking fixed.
         */
        const footprintFor = (): { x: number; y: 0; z: number }[] =>
            ring.map((p) => ({ x: p.x, y: 0 as const, z: p.z }));

        const storeys: AuthoredStoreyRow[] = [];
        const envelopes: AuthoredEnvelopeSpec[] = [];
        let assumedHeights = 0;
        for (let i = 0; i < used.length; i++) {
            const level = used[i]!;
            const { heightM, heightSource } = resolveStoreyHeight(level, input.ordinance);
            if (heightSource === 'assumed-3m') assumedHeights++;
            const label = labelOf(level);
            storeys.push({
                levelId: level.id,
                label,
                elevation: level.elevation,
                heightM,
                heightSource,
            });
            envelopes.push({
                spaceEnvelopeId: input.mintedIds[i]!,
                levelId: level.id,
                // ⛔ ITS OWN ring — see `footprintFor`. Storeys that share geometry are not
                // independent envelopes, whatever their ids say.
                footprint: footprintFor(),
                // ⭐ §ENVELOPE-STOREY-SEAT — THE STOREY'S OWN ELEVATION. See `baseOffset`'s doc:
                // a literal 0 here put every storey of a 5-storey stack on the ground, which is
                // exactly what the founder saw and what his log printed (`base=90.22 m` × 5).
                // ⛔ `level.elevation` comes from `readLevelCandidates` — the SAME producer the
                // storey row below reports — so the seat this record is drawn at and the elevation
                // the panel prints cannot disagree.
                baseOffset: level.elevation,
                height: heightM,
                role: 'level',
                withinId: null,
                // ⭐ The NAME carries the honesty, because it is the one field that follows an
                // element into every panel: a storey whose height PRYZM assumed says so here.
                name: heightSource === 'assumed-3m'
                    ? `Level envelope · ${label} · ${footprintAreaM2.toFixed(0)} m² · height assumed`
                    : `Level envelope · ${label} · ${footprintAreaM2.toFixed(0)} m²`,
                // ⭐ ADR-0383 — echoed, never derived. Every storey of one gesture is one building.
                group: input.group ?? null,
                // ⭐ C58 §1.19 clause 3 — ALWAYS the user's. See `AuthoredEnvelopeSpec.provenance`.
                provenance: authoredProvenance(
                    (replacedCountByLevel.get(level.id) ?? 0) > 0
                        ? `${baseDetail}; replaced ${replacedCountByLevel.get(level.id)} envelope`
                          + `${replacedCountByLevel.get(level.id) === 1 ? '' : 's'} the user authored earlier on this storey`
                        : baseDetail,
                ),
            });
        }

        // ── The ADVISORY (never a refusal — see the header and C114 §12). ─────────────────────
        const permitted = input.ordinance.maxFloors;
        const advisory: EnvelopeAuthoringAdvisory | null =
            permitted !== null && Number.isFinite(permitted) && permitted > 0 && asked > permitted
                ? {
                    code: 'exceeds-permitted-storeys',
                    askedStoreys: asked,
                    permittedStoreys: permitted,
                    statement:
                        `You asked for ${asked} floor levels; the study PRYZM solved for this parcel derives `
                        + `${permitted} — ${asked - permitted} more than the ordinance figure. PRYZM is telling `
                        + 'you, not stopping you: the permitted storey count is a STUDY, not a permit, and an '
                        + 'architect may well be entitled to draw this. It is created as INTENT and reported '
                        + 'against the study, never as it.',
                }
                : null;

        const totalIntendedM2 = footprintAreaM2 * asked;
        const heightNote = assumedHeights === 0
            ? ''
            : ` ⚠ ${assumedHeights} of the ${asked} storey height${assumedHeights === 1 ? ' was' : 's were'} `
              + 'ASSUMED at 3.0 m, because neither the storey record nor the ordinance supplied one — each such '
              + 'envelope says so in its name.';
        const createHalf =
            `${intent === 'replace' ? 'In their place: creates' : 'Creates'} ${asked} level envelope${asked === 1 ? '' : 's'} `
            + `of ${footprintAreaM2.toFixed(0)} m² each — `
            + `${used.map((l) => labelOf(l)).join(', ')} — from ${input.ringSourceLabel}. `
            + `${totalIntendedM2.toFixed(0)} m² of intended floor area in total. It records what you INTEND to `
            + 'build; it is not the permitted envelope and does not change it. '
            + (intent === 'replace'
                ? 'The replacement is ONE undo — Ctrl+Z brings back what it replaced and removes all of this.'
                : 'One undo removes all of it.')
            + heightNote;
        // ⛔⛔ §ENVELOPE-CARD-COMPACT (L-13248) — ONE SENTENCE FOR N STOREYS, NOT N PARAGRAPHS.
        //
        // This used to join N COPIES of `resolveLevelEnvelopeSupersession`'s own sentence, one per
        // replaced storey — and that sentence is written for a SINGLE supersede command, closing
        // "The replacement is ONE undo — Ctrl+Z brings the previous one back." Correct once; wrong
        // read six times. This planner dispatches every replacement AND every create in the SAME
        // `spaceEnvelope.batch.create` (§ENVELOPE-DRAW R8 / C114 §6a — see `command` below), so
        // there is exactly ONE undo for the whole gesture, and `createHalf` already states that,
        // once, correctly, a few lines down. Six near-identical paragraphs each restating "ONE
        // undo" told the founder there were six — the panel's own worst offender, measured at
        // ~350 characters × 6 in his screenshot.
        //
        // The WHICH is unchanged — `replaces`/`supersedes` still come from
        // `resolveLevelEnvelopeSupersession` exactly as before; only how many times the fact gets
        // SPOKEN changes, from reading the STRUCTURED records rather than joining their prose.
        const replacedByLevel = new Map<string, ExistingLevelEnvelope[]>();
        for (const r of replaces) {
            const arr = replacedByLevel.get(r.levelId) ?? [];
            arr.push(r);
            replacedByLevel.set(r.levelId, arr);
        }
        const replacedStoreyLines = used
            .filter((level) => replacedByLevel.has(level.id))
            .map((level) => `${labelOf(level)} (${
                replacedByLevel.get(level.id)!.map(describeLevelEnvelope).join(', ')
            })`);
        const replaceSummary = replacedStoreyLines.length === 0
            ? ''
            : replacedStoreyLines.length === 1
                ? `Replaces the level envelope already on ${replacedStoreyLines[0]}, which `
                  + `${OWN_AUTHORING_RULE.replacedClause}. `
                : `Replaces the level envelope already authored on ${replacedStoreyLines.length} `
                  + `storeys — ${replacedStoreyLines.join('; ')} — because ${OWN_AUTHORING_RULE.replacedClause} `
                  + 'on each. ';
        // ⭐ THE REPLACEMENT HALF STILL COMES FIRST. A user about to lose an envelope reads that
        // before the verb that creates the new one.
        const statement = intent === 'replace'
            ? `${replaceSummary}${createHalf}`
            : createHalf;

        span.setAttribute('pryzm.authoring.storeys', asked);
        span.setAttribute('pryzm.authoring.advisory', advisory !== null);
        span.setAttribute('pryzm.authoring.assumedHeights', assumedHeights);
        span.setAttribute('pryzm.authoring.intent', intent);
        span.setAttribute('pryzm.authoring.supersedes', supersedes.length);
        return {
            ok: true,
            command: 'spaceEnvelope.batch.create',
            payload: { envelopes, supersedes },
            intent,
            replaces,
            storeys,
            footprintAreaM2,
            totalIntendedM2,
            advisory,
            statement,
        };
    } finally {
        span.end();
    }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ §ENVELOPE-CREATE-DEADEND (lane ENVELOPE-CREATE-DEADEND, 2026-09-07) — THE REFUSAL'S YES
// ══════════════════════════════════════════════════════════════════════════════════════════════
// L-13086 · §REFUSING-HALF-NEEDS-ITS-ESCAPE-HATCH (L-942) · C114 §12 · C16 CA-2 · P6.
//
// THE FOUNDER, ON THE 3D SITE WITH THE ENVELOPE PANEL OPEN: *"i CANT STILL CREATE THE PROFILE — I
// DEFINE THE POINTS … CLICK ENTER — BUT EVEN WITH THE LEVELS PROVIDED DOESNT WORK."* The panel
// refused him with `not-enough-storeys`, and that refusal is CORRECT: he asked for 3 floor levels
// and a fresh project carries exactly ONE storey (`BimKernel` seeds `L0 "Ground"` at 0 m and
// committing a parcel creates none — the ordinance's derived 6 is a STUDY, not a model fact, and
// minting storeys from it would be the fabrication C58 §1.4 / L-616 keeps logging).
//
// ⛔ WHAT WAS WRONG IS THE SENTENCE'S SECOND HALF, NOT ITS VERDICT. It said *"Add the missing
// levels first, then create the envelope"* — and from the 3D Site with this panel open there was no
// control that adds a level. L-942 names that exact shape: *a gate whose "yes" branch the user
// cannot reach is a regression with a citation attached.*
//
// ⭐ SO THE REFUSAL KEEPS ITS NO AND GAINS A YES THE USER TAKES ON PURPOSE. This function is the
// arithmetic behind that offer, and nothing else: WHICH storeys are missing, WHERE each one seats,
// HOW TALL it is and WHERE that height came from. It creates nothing, dispatches nothing and is
// never called on a render — the surface calls it to DESCRIBE the offer, and again when the user
// clicks it. ⛔ It is never called silently to "top up" the project: PRYZM still will not invent a
// storey; a human does, having read what they are about to make.
//
// ⛔ THE STACKING RULE IS `LevelManagerPanel._addLevel`'s, EXTENDED TO N — NOT A SECOND ONE.
// That control (the ONE existing "add a storey" surface) seats a new level at
// `topElevation + topHeight`, names it `Level <count>` and defaults 3 m. Two rules for "where does
// the next storey go" would put the envelope panel's storeys at different elevations from the
// level panel's, which is C84 EI-9 in the one place a user would read as the model being wrong.
// The ONE improvement is the height ladder: `resolveStoreyHeight` (the SAME producer the envelope
// plan above uses) replaces the hard 3.0, so the height a new storey gets and the height its
// envelope gets cannot disagree, and an ASSUMED height says so.

/** One storey the offer would create. Exactly a `level.add` payload, plus why it is that tall. */
export interface MissingStoreySpec {
    readonly levelId: string;
    readonly name: string;
    readonly elevation: number;
    readonly height: number;
    /** Where `height` came from — carried so the offer can admit an ASSUMED 3 m before the click. */
    readonly heightSource: AdoptHeightSource;
}

/** Why the offer could not be described. Closed — a new arm is a type error at every switch. */
export type MissingStoreyRefusalReason =
    /** Nothing is missing, or the shortfall arrived as something that is not a whole count. */
    | 'nothing-missing'
    /** More storeys than one gesture may mint, the same ceiling the envelope batch carries. */
    | 'missing-above-batch-limit'
    /** The caller minted fewer level ids than storeys. A wiring fault, surfaced not swallowed. */
    | 'too-few-level-ids';

export interface MissingStoreyPlan {
    readonly ok: true;
    /**
     * ⚠ THE BUS VERB, AND IT IS SINGULAR ON PURPOSE. `level.add` is the ONE registered level-create
     * verb (`initBusHandlers.ts` → `AddLevelCommand`); `level.createMultiple` is DECLARED in
     * `packages/command-bus/src/commands.ts` and has NO handler anywhere — dispatching it would be
     * a silent no-op (L-13087). So N storeys are N dispatches and therefore N undo entries, and the
     * surface SAYS so rather than promising a single Ctrl+Z it cannot keep. The ENVELOPE half stays
     * exactly one undo (C114 §6a) — that invariant is untouched by this.
     */
    readonly command: 'level.add';
    readonly levels: readonly MissingStoreySpec[];
    /** True when the storey height had to be assumed — the surface admits it before the click. */
    readonly anyHeightAssumed: boolean;
    /** Plain language: what will be created, where, how tall, and what it is NOT. */
    readonly statement: string;
}

export interface MissingStoreyRefusal {
    readonly ok: false;
    readonly reason: MissingStoreyRefusalReason;
    readonly statement: string;
}

export type MissingStoreyResult = MissingStoreyPlan | MissingStoreyRefusal;

export interface MissingStoreyInput {
    /** The project's storeys, from the SAME `readLevelCandidates` the envelope plan reads. */
    readonly levels: readonly AdoptLevelCandidate[];
    /** The ordinance figures, for the height ladder's second rung. `null` ⇒ not published. */
    readonly ordinance: {
        readonly maxHeightM: number | null;
        readonly maxFloors: number | null;
    };
    /**
     * How many storeys are missing — the VALUE off the refusal (`EnvelopeAuthoringRefusal.
     * missingStoreys`), never re-derived by parsing its sentence.
     */
    readonly missingStoreys: number;
    /** One level id per missing storey, minted by the CALLER (C16 CA-2 — redo must reuse them). */
    readonly mintedLevelIds: readonly string[];
}

/**
 * ⭐ DESCRIBE THE STOREYS THE REFUSAL'S OFFER WOULD CREATE. Pure; total; never throws.
 *
 * @param input the project's storeys, the ordinance, the shortfall and the caller's minted ids.
 */
export function buildMissingStoreyPlan(input: MissingStoreyInput): MissingStoreyResult {
    const span = _tracer.startSpan('pryzm.site.buildMissingStoreyPlan');
    try {
        const n = input.missingStoreys;
        if (!isWholePositive(n)) {
            span.setAttribute('pryzm.missingStorey.refusal', 'nothing-missing');
            return {
                ok: false,
                reason: 'nothing-missing',
                statement:
                    'PRYZM was asked to add storeys without being told how many are missing, so it added '
                    + 'none. Nothing changed — this is a gap in PRYZM wiring, not a refusal about your design.',
            };
        }
        if (n > AUTHORING_MAX_STOREYS) {
            span.setAttribute('pryzm.missingStorey.refusal', 'missing-above-batch-limit');
            return {
                ok: false,
                reason: 'missing-above-batch-limit',
                statement:
                    `That would add ${n} storeys at once; PRYZM adds at most ${AUTHORING_MAX_STOREYS} in one `
                    + 'gesture. Nothing was created. This is a limit on the GESTURE, not a statement about '
                    + 'what this parcel allows.',
            };
        }
        if (input.mintedLevelIds.length < n) {
            span.setAttribute('pryzm.missingStorey.refusal', 'too-few-level-ids');
            return {
                ok: false,
                reason: 'too-few-level-ids',
                statement:
                    `PRYZM was handed ${input.mintedLevelIds.length} level id(s) for ${n} storeys, so it did `
                    + 'not create anything. This is a gap in PRYZM wiring, not a refusal about your design.',
            };
        }

        // ── WHERE THE STACK CONTINUES FROM ────────────────────────────────────────────────────
        // ⛔ THE SEATABLE TOP, NOT SIMPLY THE TOP. A project whose storeys ALL sit below the datum
        // is the `no-ground-level` refusal, and stacking three storeys above a basement at −10 m
        // could land every one of them still below 0 — an offer that runs, reports success and
        // leaves the SAME refusal standing. When there is no ground floor the first new storey IS
        // the ground floor, at the datum.
        const seatable = seatableStoreys(input.levels);
        const topSeatable = seatable.length > 0 ? seatable[seatable.length - 1]! : null;
        const byElevation = [...input.levels].sort((a, b) => a.elevation - b.elevation);
        const topAny = byElevation.length > 0 ? byElevation[byElevation.length - 1]! : null;
        const heightReference: Pick<AdoptLevelCandidate, 'height'> = topSeatable ?? topAny ?? { height: null };
        const { heightM: ftf, heightSource } = resolveStoreyHeight(heightReference, input.ordinance);

        // ⛔ NAMES ARE TAKEN FROM THE PROJECT, NOT COUNTED BLIND. `LevelManagerPanel` names the
        // next storey `Level <count>`; doing that N times in a row would mint N storeys called
        // "Level 1" on a project that already has one. Skip every name already in use.
        const taken = new Set<string>();
        for (const l of input.levels) if (l.name !== null) taken.add(l.name);
        let nextNumber = input.levels.length;
        const nextName = (): string => {
            for (;;) {
                const candidate = `Level ${nextNumber}`;
                nextNumber += 1;
                if (!taken.has(candidate)) { taken.add(candidate); return candidate; }
            }
        };

        const levels: MissingStoreySpec[] = [];
        for (let i = 0; i < n; i++) {
            const elevation = topSeatable !== null
                ? topSeatable.elevation + (i + 1) * ftf
                : i * ftf;
            levels.push({
                levelId: input.mintedLevelIds[i]!,
                name: nextName(),
                elevation,
                height: ftf,
                heightSource,
            });
        }

        const anyHeightAssumed = heightSource === 'assumed-3m';
        const whereFrom = topSeatable !== null
            ? `stacked above ${labelOf(topSeatable)} at ${topSeatable.elevation.toFixed(2)} m`
            : 'starting at the datum (0.00 m), because this project has no storey at or above it yet';
        const heightWhy = heightSource === 'level-record'
            ? `each ${ftf.toFixed(2)} m tall — the floor-to-floor your top storey already records`
            : heightSource === 'derived-floor-to-floor'
                ? `each ${ftf.toFixed(2)} m tall — the ordinance's max height divided by its derived storey `
                  + 'count, an even division for study and not a regulated storey height'
                : `each an ASSUMED ${ftf.toFixed(2)} m tall, because neither your storeys nor the ordinance `
                  + 'supplied a floor-to-floor';
        const undoNote = n === 1
            ? 'It is one undo.'
            : `Each storey is its own undo entry, so ${n} undos remove them all.`;
        const roster = levels
            .map((l) => `${l.name} at ${l.elevation.toFixed(2)} m`)
            .join(', ');
        const statement =
            `Adds ${n} storey${n === 1 ? '' : 's'} to this project — ${roster} — ${whereFrom}, ${heightWhy}. `
            + '⚠ This is a change to your MODEL, and it says nothing about how many floors this parcel '
            + 'permits — PRYZM is not deciding you may build them; you are asking for somewhere to put the '
            + `envelope. ${undoNote}`;

        span.setAttribute('pryzm.missingStorey.count', n);
        span.setAttribute('pryzm.missingStorey.heightSource', heightSource);
        span.setAttribute('pryzm.missingStorey.fromDatum', topSeatable === null);
        return { ok: true, command: 'level.add', levels, anyHeightAssumed, statement };
    } finally {
        span.end();
    }
}
