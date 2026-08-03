// §OPEN-TOP-INDICATIVE — THE THIRD PUBLICATION STATE: **DRAW, BUT REFUSE TO CLAIM.**
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE PROBLEM THIS SOLVES
// ══════════════════════════════════════════════════════════════════════════════════════════════
// A jurisdiction can be in a state the two-valued gate cannot express: geometry ✅, parameters ✅,
// envelope generation ✅ — and a gate that is SHUT, correctly, because PRYZM cannot claim a
// BUILDABLE RIGHT. ⭐ BUT NOTHING WAS EVER TRYING TO CLAIM ONE. The blocker was the WORDING of the
// claim, not the certainty of the data, and a binary `authorised` has no way to say
// *"this is indicative, here is exactly what it does not account for"*.
//
// ADR-0293 already names the answer — an **OPEN TOP WITH A STATED REASON**, never a closed box —
// but it lived as a RENDERING CONVENTION, which is precisely why it could not unblock anything: a
// convention cannot be read by a gate. This module promotes it to an AUTHORISATION STATE so the
// posture is a value, in the type system, that a consumer must handle.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔⛔ WHY THIS IS A SEPARATE MODULE AND NOT AN EDIT TO `envelopeAuthorisation.ts`
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ THIS IS THE LOAD-BEARING DESIGN DECISION IN THE FILE. READ IT BEFORE "SIMPLIFYING" IT.
//
// `envelopeAuthorisation.ts` answers exactly ONE question — *"may PRYZM publish a numeric envelope
// as a DETERMINATION for this jurisdiction?"* — and it answers it from two hand-maintained tables
// whose default INVERTED to fail-closed on 2026-08-02. That module is the single authority for the
// determination question, and this module DOES NOT RESTATE, SHADOW OR OVERRIDE IT: it IMPORTS
// `envelopePublicationAuthorisation()` and REFINES its answer.
//
// The property that makes the composition safe, and it is a strong one:
//
//   ⭐ THIS MODULE CAN ONLY EVER **NARROW**, NEVER WIDEN. `determination` is returned if and only if
//     the owned gate already said `authorised: true`. Adding a jurisdiction to
//     `OPEN_TOP_INDICATIVE_JURISDICTIONS` cannot grant it determination status, cannot flip a
//     `*_ENVELOPE_VERIFIED` constant, and cannot make `isEnvelopePublicationAuthorised()` return
//     anything different — that function is not called by this one and is untouched by it.
//
// A second module answering a NEARBY question is the parallel-wiring hazard this repo has fought
// repeatedly, so the mitigation is explicit and matches existing precedent: `l449CertificationGates.ts`
// is already a second module beside `envelopeAuthorisation.ts`, asking a different question
// (*"where is the signature?"*) and reading — never restating — the constants the other one reads.
// This module sits in the same relation.
//
// ⚠ IF A FUTURE AUTHOR MERGES THIS INTO `envelopePublicationAuthorisation()`'s OWN RETURN TYPE — and
// that IS the cleaner end state — the merge MUST preserve all four guarantees below, and it must be
// done in ONE file by ONE author. Two agents adding the same state to that module independently is
// how this package produced parallel wiring before.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE FOUR THINGS THIS STATE MUST NOT BECOME — each is enforced, not merely documented
// ══════════════════════════════════════════════════════════════════════════════════════════════
//  1. ⛔ IT IS NOT `gate-open` WITH A LABEL. `mayPublishAsDetermination()` returns **false** for
//     `open-top-indicative`, and the posture is a distinct union member, so a consumer asking "may I
//     publish this as a determination?" gets NO — programmatically, not by reading prose.
//  2. ⛔ IT STILL FAILS CLOSED FOR AN UNLISTED JURISDICTION. Membership is by EXPLICIT ENTRY in
//     `OPEN_TOP_INDICATIVE_JURISDICTIONS`. An id in neither that map nor the owned gate's two tables
//     is `refused` / `unknown-jurisdiction` — never indicative. An unassessed id used to publish
//     silently; it must not now draw silently either.
//  3. ⛔ THE REASON LIST IS DATA, NOT DECORATION. `openTopIndicativeRecord()` REFUSES to construct a
//     record with an empty `missingConstraints` — an open top with nothing named is a closed box
//     wearing a label, which is strictly worse than a shut gate because it looks like disclosure.
//  4. ⭐ RENDERING MUST MAKE IT UNMISTAKABLE — and `rendererCanExpressOpenTop` is where that claim is
//     recorded rather than assumed. See its docstring: it is now `true`, WITH THE MEASUREMENT — the
//     posture is a fourth input to `classifyEnvelopeCompleteness`, `complete` is UNREACHABLE for an
//     indicative envelope, and both rasterisers draw it UNCAPPED. ⚠ That changed the PICTURE, not the
//     PERMISSION: the registry below is still empty and still a founder line.
//
// ⛔ NOTHING HERE SIGNS ANYTHING. L-449 reserves certification to humans. Every gate stays
// `signature: null`, and `OPEN_TOP_INDICATIVE_JURISDICTIONS` ships EMPTY — enabling a jurisdiction
// is a founder line, and it is deliberately a one-line, reviewable change with its risks enumerated
// beside it in the record itself.
//
// PURITY: L2-pure (C58 §1.1/§1.9) — no I/O, no clock, no RNG. Strategic context — ADR-0283,
// ADR-0293, C58 §1.4/§1.13, C63 §1.6, L-449, L-665, L-677.

import { trace } from '@opentelemetry/api';
import type { EnvelopePublicationPosture } from '@pryzm/schemas';
import {
    envelopePublicationAuthorisation,
    type EnvelopeAuthorisationReason,
} from './envelopeAuthorisation.js';
import { BALEARS_JURISDICTION_ID } from './esBalearsMuib.js';
import { BALEARS_MISSING_CONSTRAINTS } from '../providers/resolveBalearsMuib.js';

const tracer = trace.getTracer('pryzm.zoning.openTop');

/**
 * Why an envelope is INDICATIVE rather than a determination.
 *
 * A closed vocabulary, because each member implies a different remedy: modelling the constraint
 * layers, verifying supersession, or establishing which articles govern where.
 */
export type OpenTopReason =
    /** Constraint layers (heritage / flood / airport / coastal / environmental) are not modelled. */
    | 'constraints-not-modelled'
    /** Whether the cited instrument is still the governing one has not been verified. */
    | 'supersession-not-verified'
    /** Which articles govern which land has not been established (a scope question, not a data one). */
    | 'article-governance-not-established';

/** Has supersession of the cited instrument been checked? ⚠ `NOT_VERIFIED` is the honest default. */
export type SupersessionStatus = 'NOT_VERIFIED' | 'VERIFIED_CURRENT';

/** Has the governing scope of the cited articles been established? */
export type ArticleGovernanceStatus = 'NOT_ESTABLISHED' | 'ESTABLISHED';

/**
 * ONE jurisdiction's indicative posture, with its risks ENUMERATED IN THE DATA.
 *
 * ⚠ Every field is REQUIRED. An optional field here would let a caller construct a record that
 * discloses nothing while still being typed as a disclosure.
 */
export interface OpenTopIndicativeRecord {
    readonly jurisdictionId: string;
    readonly reason: OpenTopReason;
    /**
     * ⛔ MUST BE NON-EMPTY — enforced by the constructor, not by convention. This is the list a card
     * has to show. Each entry can only ever REDUCE the envelope, which is what makes the published
     * solid an upper bound and the top "open".
     */
    readonly missingConstraints: readonly string[];
    /** What legal apparatus this indicative reading rests on, in one sentence. */
    readonly legalProvenance: string;
    readonly supersession: SupersessionStatus;
    readonly articleGovernance: ArticleGovernanceStatus;
}

/**
 * Construct an `OpenTopIndicativeRecord`, REFUSING an empty `missingConstraints`.
 *
 * ⛔ THROWS, at construction. This is the `packMap()` discipline: a malformed publication posture is
 * not a resolvable ambiguity, and the only failure mode that cannot be mistaken for a working state
 * is a load-time throw. Returning null would let a caller `??` it away into silence.
 */
export function openTopIndicativeRecord(r: OpenTopIndicativeRecord): OpenTopIndicativeRecord {
    if (r.missingConstraints.length === 0) {
        throw new Error(
            `[site-parcel-data] OPEN_TOP_INDICATIVE for "${r.jurisdictionId}" names NO missing ` +
                'constraints. An open top with nothing named is a closed box wearing a label — ' +
                'either enumerate what is not modelled, or use the determination gate.',
        );
    }
    return Object.freeze({ ...r, missingConstraints: Object.freeze([...r.missingConstraints]) });
}

/**
 * THE REGISTRY OF INDICATIVE JURISDICTIONS — ⛔ **EMPTY, AND THAT IS THE SHIPPED STATE.**
 *
 * Listing a jurisdiction here is a PUBLICATION DECISION (the `UNGATED_AUTHORISED_JURISDICTIONS`
 * discipline). It claims less than a determination, which is exactly why it is a founder line rather
 * than an implementer's — but it is still a decision to DRAW on someone's land, and an implementer
 * making it silently would be the L-449 defect wearing a smaller claim.
 *
 * ⚠ EMPTY IS NOT A TODO. Until an entry is added by a human, `envelopePublicationPosture()` returns
 * exactly what `envelopePublicationAuthorisation()` already returns, for every id in existence.
 */
export const OPEN_TOP_INDICATIVE_JURISDICTIONS: ReadonlyMap<string, OpenTopIndicativeRecord> =
    new Map<string, OpenTopIndicativeRecord>([]);

/**
 * ⭐ THE ILLES BALEARS RECORD, BUILT AND TESTED BUT **NOT LISTED**.
 *
 * This is the one-line change: adding `[BALEARS_JURISDICTION_ID, BALEARS_OPEN_TOP_INDICATIVE]` to the
 * map above turns Balears from `refused`/`unknown-jurisdiction` into `open-top-indicative`. It is
 * exported so the entry can be REVIEWED — with its risks enumerated beside it — before it is made.
 *
 * ⚠ IT STILL AUTHORISES NO DETERMINATION. Even listed, `mayPublishAsDetermination()` returns false
 * and `isEnvelopePublicationAuthorised()` (the owned gate) is unchanged and still `false`.
 */
export const BALEARS_OPEN_TOP_INDICATIVE: OpenTopIndicativeRecord = openTopIndicativeRecord({
    jurisdictionId: BALEARS_JURISDICTION_ID,
    reason: 'constraints-not-modelled',
    missingConstraints: BALEARS_MISSING_CONSTRAINTS,
    legalProvenance:
        'GOIB MUIB normative fitxa apparatus accepted as the parameter source (the ajuntament\'s own ' +
        'published zone table, read at the point). ⚠ Only 2.0 % of fitxes both carry a complete rule ' +
        'and cite the governing article on the parameter itself, so on most zones the relationship ' +
        'between the fitxa cell and the ordinance article is ASSERTED-UNVERIFIED, not established.',
    supersession: 'NOT_VERIFIED',
    articleGovernance: 'NOT_ESTABLISHED',
});

/**
 * What PRYZM may do with an envelope for this jurisdiction.
 *
 *  • `determination`       — publishable AS A DETERMINATION. Only ever from the owned gate.
 *  • `open-top-indicative` — DRAWS, but claims no buildable right. Carries its reasons in the data.
 *  • `refused`             — draws nothing.
 *
 * ⛔ RE-EXPORTED, NOT RESTATED. The vocabulary itself lives in L0 (`EnvelopePublicationPostureSchema`)
 * because the posture is now CARRIED on `BuildableEnvelope` and read by the L2 render classifier — a
 * second hand-written copy of the union here is precisely how "indicative" would acquire a fourth
 * spelling that one layer honours and another does not. L0 owns the WORDS; this module owns the
 * DECISION, and nothing else may make one.
 */
export type { EnvelopePublicationPosture };

export interface EnvelopePosture {
    readonly posture: EnvelopePublicationPosture;
    /** The UNDERLYING reason from the determination gate, always — never masked by the refinement. */
    readonly authorisationReason: EnvelopeAuthorisationReason;
    /** Present iff `posture === 'open-top-indicative'`. */
    readonly openTop: OpenTopIndicativeRecord | null;
}

/**
 * Resolve the publication posture for a jurisdiction.
 *
 * ⭐ THE ORDER IS THE SAFETY PROPERTY: the DETERMINATION gate is consulted FIRST and its answer is
 * never overridden. The indicative registry is consulted ONLY when that gate said no — so this
 * function can narrow a `true` to nothing, and can lift a `false` no further than "draws, claims
 * nothing". It cannot manufacture an authorisation.
 *
 * ⚠ `authorisationReason` is ALWAYS the owned gate's own reason, carried through unmodified, so
 * `gate-shut` and `unknown-jurisdiction` remain distinguishable downstream even when both surface as
 * the same posture. Collapsing them would lose the difference between "a human has not signed yet"
 * and "nobody has ever looked at this place".
 *
 * @param registry injected ONLY so tests can exercise a populated map without shipping an entry —
 *        listing a jurisdiction for real is an edit to `OPEN_TOP_INDICATIVE_JURISDICTIONS`, and a
 *        test that could authorise by argument would not be testing the shipped posture.
 *
 * P8 — emits `pryzm.zoning.envelopePublicationPosture`.
 */
export function envelopePublicationPosture(
    jurisdictionId: string,
    registry: ReadonlyMap<string, OpenTopIndicativeRecord> = OPEN_TOP_INDICATIVE_JURISDICTIONS,
): EnvelopePosture {
    const span = tracer.startSpan('pryzm.zoning.envelopePublicationPosture');
    try {
        const { authorised, reason } = envelopePublicationAuthorisation(jurisdictionId);
        let result: EnvelopePosture;
        if (authorised) {
            result = { posture: 'determination', authorisationReason: reason, openTop: null };
        } else {
            const rec = registry.get(jurisdictionId) ?? null;
            result = rec
                ? { posture: 'open-top-indicative', authorisationReason: reason, openTop: rec }
                : { posture: 'refused', authorisationReason: reason, openTop: null };
        }
        span.setAttribute('jurisdictionId', jurisdictionId);
        span.setAttribute('posture', result.posture);
        span.setAttribute('authorisationReason', result.authorisationReason);
        return result;
    } finally {
        span.end();
    }
}

/**
 * ⭐ THE DETERMINATION-LEVEL CONSUMER GUARD. *"May I publish this as a determination?"*
 *
 * ⛔ **FALSE FOR `open-top-indicative`.** That is the whole contract: a compliance report, an export,
 * an API response or any surface that states a buildable right must call THIS, and must get NO for an
 * indicative envelope. A consumer that branched on "did we draw something?" would silently promote an
 * indicative solid to a determination — the failure this state exists to prevent.
 *
 * P8 — emits `pryzm.zoning.mayPublishAsDetermination`.
 */
export function mayPublishAsDetermination(
    jurisdictionId: string,
    registry: ReadonlyMap<string, OpenTopIndicativeRecord> = OPEN_TOP_INDICATIVE_JURISDICTIONS,
): boolean {
    const span = tracer.startSpan('pryzm.zoning.mayPublishAsDetermination');
    try {
        const { posture } = envelopePublicationPosture(jurisdictionId, registry);
        span.setAttribute('jurisdictionId', jurisdictionId);
        span.setAttribute('posture', posture);
        return posture === 'determination';
    } finally {
        span.end();
    }
}

/**
 * May an envelope be DRAWN at all (determination or indicative)?
 *
 * ⚠ SEPARATE FROM `mayPublishAsDetermination` ON PURPOSE. Renderers ask this one; anything that makes
 * a legal statement asks the other. Fusing them is how "we drew it" becomes "we determined it".
 */
export function mayDrawEnvelope(
    jurisdictionId: string,
    registry: ReadonlyMap<string, OpenTopIndicativeRecord> = OPEN_TOP_INDICATIVE_JURISDICTIONS,
): boolean {
    const { posture } = envelopePublicationPosture(jurisdictionId, registry);
    return posture === 'determination' || posture === 'open-top-indicative';
}

/**
 * ⭐ CAN THE RENDERER ACTUALLY EXPRESS AN OPEN TOP TODAY? **`true` — AND THIS IS A MEASUREMENT OF THE
 * RENDER PATH, NOT A PUBLICATION DECISION.**
 *
 * ADR-0293 requires an indicative envelope to READ as an open top, never as a closed box, and the
 * instruction accompanying this state was explicit: *if the renderer cannot express that yet, SAY SO
 * — do not ship a solid that looks complete.* This constant is that statement, in code, so a caller
 * gates on it instead of discovering the gap on a screenshot.
 *
 * ── ⚠ THE HISTORY, KEPT BECAUSE THE FIRST TWO DIAGNOSES WERE BOTH WRONG ──────────────────────────
 * (a) "the flag is produced and consumed by nothing" — FALSE. `footprintIsUpperBound` was always
 *     consumed, in one place, by design. (b) "the renderer has no provisional style" — FALSE. The
 *     provisional grey `#9A93B0` channel was fully wired on both surfaces. The REAL gap, measured
 *     2026-08-02, was narrower: `classifyEnvelopeCompleteness` took exactly THREE signals —
 *     `confidence`, `hasRealHeight`, `footprintIsUpperBound` — and the posture was none of them, so
 *     an indicative envelope with a trusted confidence, a real height and a solved footprint
 *     classified `complete: true` and rendered in the SAME CONFIDENT VIOLET as a determination. The
 *     existing signals bounded the FOOTPRINT; nothing bounded the TOP.
 *
 * ── ⭐ WHAT NOW EXISTS, AND WHERE TO GO AND CHECK IT ─────────────────────────────────────────────
 *  1. L0 carries the posture: `BuildableEnvelope.publicationPosture`
 *     (`EnvelopePublicationPostureSchema`, additive, `null` = NOT STATED).
 *  2. L2 decides on it ONCE: `classifyEnvelopeCompleteness(confidence, hasRealHeight,
 *     footprintIsUpperBound, publicationPosture)` returns `complete: false` + `openTop: true` for
 *     `'open-top-indicative'`. ⛔ `complete` is UNREACHABLE for that posture, so no renderer — including
 *     one written later, by someone who never read this file — can paint it the determination violet.
 *  3. Both rasterisers obey `openTop` and draw the volume UNCAPPED: `CesiumViewport` via
 *     `closeTop: !solid.style.openTop`, `ParcelBoundarySceneRenderer` via a transparent
 *     `ExtrudeGeometry` cap group. The open top is LITERAL geometry, so it survives a greyscale
 *     screenshot and a colour-blind viewer — the hue is the second channel, not the only one.
 *
 * ⛔ THIS CONSTANT AUTHORISES NOTHING. It says the PICTURE can now tell the two states apart. It does
 * not list a jurisdiction, does not flip any `*_ENVELOPE_VERIFIED`, and does not make
 * `mayPublishAsDetermination()` return true for anything. `OPEN_TOP_INDICATIVE_JURISDICTIONS` is
 * still EMPTY and enabling a jurisdiction is still a founder line — that was always a separate
 * decision, and this only removes the reason it could not be taken.
 */
export const rendererCanExpressOpenTop = true as const;
