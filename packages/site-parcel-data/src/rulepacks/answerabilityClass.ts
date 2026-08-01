// L-601 (a) / Phase 5 — THE ANSWERABILITY CLASSIFIER: parcel → what PRYZM can SAY about the land.
//
// WHAT THIS IS, AND WHAT IT IS EMPHATICALLY NOT
// ---------------------------------------------
// L-599 colours *what a building IS* (OSM `building=*`). This layer colours *what PRYZM can SAY
// about the land under a parcel* — a different question, on a different seam (L-601 §task-5). Its
// entire job is to project the ONE shipping answer path — `resolveZoneDisposition` plus the
// refusal vocabulary it returns — onto a small, closed set of user-facing classes a map legend and
// a query panel can render.
//
// ⚠ IT IS NOT A SECOND STATEMENT OF "WHAT PRYZM COVERS". That statement lives exactly once, in the
// rule-pack registry (`registry.ts` `REGISTRATIONS`) and the refusal tables it consults. This
// module holds NO zone lists, NO clau literals, NO jurisdiction knowledge. It takes a
// `ZoneDisposition` that the registry already produced and TRANSLATES it. The distinction is the
// whole point of L-601 §task-2 (C60 §2 identity discipline): a parallel "coverage table" would
// drift invisibly from the code path that actually answers the click — the L-422/457/467/469
// failure family. Here, registering a new pack changes `resolveZoneDisposition`'s output and the
// class changes with it, with no edit to this file. That property is asserted, not asserted-about,
// in `answerabilityClass.test.ts`.
//
// THE SEVEN CLASSES, AND THE ONE AXIS THAT SEPARATES THEM (the sixth, `no-plan-published`, is the
// STRUCTURAL-SEAM-4 genuine data-absence — see its case in `classifyRefusalCode`; the seventh,
// `pack-unverified`, is the L-665 AUTHORISATION seam — see its case in `classifyDisposition`)
// -----------------------------------------------------
// The axis is *who owns the reason there is (or is not) an envelope*, and it is already carried by
// the disposition + refusal the registry returns — this module never re-derives it:
//
//   • `full-envelope`          — a curated pack answers AND its jurisdiction is authorised to
//                                publish; PRYZM computes a real buildable volume.
//   • `pack-unverified`        — a curated pack EXISTS for the zone but the city's human
//                                verification gate is shut, so nothing may be published yet
//                                (§ENVELOPE-PUBLICATION-AUTHORISATION, L-665). A statement about
//                                PRYZM'S SIGNATURE, never about the land.
//   • `systems-land`           — the ORDINANCE denies a private zone envelope: public domain
//                                (*sistema*), park, equipament, protected/non-urbanisable soil,
//                                protected private green. A legal fact about the land.
//   • `plan-defined`           — the ordinance DELEGATES buildability to an approved plan/overlay
//                                PRYZM does not hold (clau 18 *volumetria específica* and the
//                                remodelació/conservació/renovació families). The rule exists; it
//                                is elsewhere.
//   • `zone-unencoded`         — the land IS privately buildable and PRYZM cannot answer for it
//                                yet: no pack authored (`no-rule-pack`), an unresolved dual regime
//                                (`regime-undetermined` — the pack exists but the ordinance's two
//                                regimes are keyed on a fact no source records), or a
//                                jurisdiction/zone the registry does not cover at all (the
//                                estimated-fallback path). A statement about PRYZM'S coverage,
//                                never about the law.
//   • `construction-incomplete`— PRYZM HAS the pack and it applies, but the per-parcel
//                                determination could not be completed (`source-data-unavailable` —
//                                block outline unfetchable, dissolve refused, no solution).
//
// ⚠ C58 §1.4 / §CONTEXT-DATA-HONESTY, RESTATED AT THE COLOUR LAYER: `systems-land`/`plan-defined`
// (a correct legal refusal) and `zone-unencoded` (an owned coverage gap) are OPPOSITE claims and
// must never collapse. The legend (L-601 §task-4) must render them visibly distinct — a
// developer told "the law grants no envelope" when the truth is "we haven't encoded your zone yet"
// is the false-negative-about-someone's-land error L-553 ranks as the worst of the set. This module
// keeps them separate by construction: it reads the SAME `legallyGrounded` flag and refusal `code`
// the registry set, and never guesses.
//
// PURITY: L2-pure (C58 §1.1/§1.9) — no I/O, no THREE, no DOM, no clock, no RNG. A classification
// is data. It consumes only `resolveZoneDisposition` (L2) and the L0 refusal-code enum.
//
// SCOPE OF THIS SLICE (L-601 §tasks 1–3 only): the pure classifier + its tests. The UI half
// (§tasks 4–8: palette/legend, the `ContextUseMode` second mode, the query panel, the 2D/3D
// drape) is sequenced BEHIND L-600 and is NOT built here. This module is therefore intentionally
// NOT yet re-exported from the package barrel (`index.ts`) — see the WIRING TODO at the foot of the
// file. Consumers in this slice import it directly.
//
// Strategic context — V1-LAUNCH-IMPLEMENTATION-PLAN.md L-601, C58 §1.4, C60 §2, ADR-0272.

import type { EnvelopeRefusalCode } from '@pryzm/schemas';
import {
    resolveZoneDisposition,
    type ZoneDisposition,
    type ZoneDispositionHints,
} from './registry.js';
// §ENVELOPE-PUBLICATION-AUTHORISATION (L-665) — the gate the classifier was missing. This module
// adds NO exported function of its own (P8 is satisfied at the gate's own exported entry point,
// `isEnvelopePublicationAuthorised`, which carries the span); the two existing entry points here
// stay the pure translations they always were.
import { isEnvelopePublicationAuthorised } from './envelopeAuthorisation.js';

/**
 * The seven user-facing answerability classes. A closed union rather than a string, for the same
 * reason the refusal `code` is a closed enum: these render as distinct colours and distinct copy,
 * and a typo would silently paint one class as another.
 *
 * ⚠ ORDER IS THE INTENDED LEGEND ORDER — most-answered to least — not significant to any logic.
 */
export type AnswerabilityClass =
    | 'full-envelope'
    | 'systems-land'
    | 'plan-defined'
    | 'zone-unencoded'
    | 'construction-incomplete'
    // STRUCTURAL-SEAM-4 (C58 §1.13.8) — the authoritative planning source ANSWERED and there is no
    // adopted plan / buildable footprint published at this point. A DURABLE data-absence, and it fits
    // none of the four refusal buckets above without a false statement: it is NOT a legal denial
    // (`systems-land`/`plan-defined`), NOT PRYZM's coverage gap (`zone-unencoded` says "buildable, we
    // haven't encoded it YET" — the opposite of "the authority publishes nothing here"), and NOT the
    // TRANSIENT `construction-incomplete` (a retry never changes a durable empty). Its own class so
    // absent and unreachable can never share a colour (the §CONTEXT-DATA-HONESTY collapse, L-422/457/469).
    | 'no-plan-published'
    // §ENVELOPE-PUBLICATION-AUTHORISATION (L-665) — PRYZM HOLDS a transcribed, cited rule pack for
    // this zone and is NOT YET AUTHORISED to publish its numbers: the city's `*_ENVELOPE_VERIFIED`
    // gate is shut, awaiting a human signature on `sources/VERIFICATION.md`. Madrid, Córdoba and
    // Murcia are all in exactly this state today.
    //
    // ⚠ IT IS ITS OWN CLASS BECAUSE IT IS ITS OWN VALUE, and every neighbour would be a false
    // statement (§CONTEXT-DATA-HONESTY — outage, empty and refusal are three different values):
    //   • NOT `full-envelope`   — no number ships; that was the bug.
    //   • NOT `systems-land` / `plan-defined` — those blame the ORDINANCE. The law here is known,
    //     published and transcribed. Nothing about the land is being refused.
    //   • NOT `zone-unencoded`  — that says "buildable, we have not encoded it YET". We HAVE
    //     encoded it, with articles and quotes. Saying otherwise understates our coverage and
    //     misdirects the reader to a data-entry backlog that does not exist.
    //   • NOT `construction-incomplete` — that is TRANSIENT and invites a retry. A retry never
    //     produces a signature; only a person reading the ordinance does.
    //   • NOT `no-plan-published` — the plan is published; we are checking our reading of it.
    | 'pack-unverified';

/** Every class, frozen. Exported so the legend enumerates the SOURCE OF TRUTH, never a hand copy. */
export const ANSWERABILITY_CLASSES: readonly AnswerabilityClass[] = Object.freeze([
    'full-envelope',
    'pack-unverified',
    'systems-land',
    'plan-defined',
    'zone-unencoded',
    'construction-incomplete',
    'no-plan-published',
] as const);

/** Compile-time exhaustiveness guard — an unmapped case becomes a `tsc` error, not a wrong colour. */
function assertNever(x: never, context: string): never {
    throw new Error(`[site-parcel-data] answerability classifier: unmapped ${context} — ${String(x)}`);
}

/**
 * Map a refusal `code` to its answerability class.
 *
 * ⚠ THIS IS A PROJECTION, NOT A PARALLEL TABLE. The `code` and its `legallyGrounded` companion are
 * set once, by the refusal vocabulary the registry returns (`esBarcelonaZoneClassification.ts`);
 * this switch only re-buckets those existing codes for display. It states no clau, no article and
 * no coverage claim of its own, so it cannot disagree with the answer path (L-601 §task-2).
 *
 * The switch is EXHAUSTIVE over `EnvelopeRefusalCode`. Adding a code to that L0 enum without adding
 * a case here is a compile error via `assertNever` — a new legal/coverage distinction must make a
 * conscious colour decision, it cannot fall silently into a neighbour's bucket (the debt-gate
 * lesson: a mapping that "passes while measuring nothing" is exactly what this guard prevents).
 */
export function classifyRefusalCode(code: EnvelopeRefusalCode): AnswerabilityClass {
    switch (code) {
        // ── The ordinance itself denies a PRIVATE zone envelope. A legal fact about the land. ──
        // `legallyGrounded: true` in every one of these (asserted in the test against the shipping
        // refusal, so this grouping cannot drift from the flag the registry actually sets).
        case 'public-system':
        case 'public-open-space':
        case 'facility-plan':
        case 'protected-soil':
        case 'protected-private-green':
            return 'systems-land';

        // ── The ordinance DELEGATES buildability to a plan/overlay PRYZM does not hold. ──
        // `derived-plan` is the honest label for clau 18 (22.5 % of the city's buildable land) and
        // for the remodelació/conservació/renovació families: the rule is not absent, it is in
        // another instrument. `overlay-uncertain` joins it because it, too, says "a special plan /
        // heritage catalogue governs (or may govern) and we do not hold it" — from the user's
        // answerability standpoint that is the same bucket: plan-governed, not answerable by us.
        // ⚠ `overlay-uncertain` is defined in the L0 enum but is NOT currently emitted by any
        // shipping path, so this mapping is a forward declaration validated only by the
        // exhaustiveness guard — it takes effect the day a path produces it. Grouping it with the
        // coverage gap (`zone-unencoded`) would falsely say "we just haven't encoded this zone";
        // grouping it with `construction-incomplete` would falsely promise a retry helps.
        case 'derived-plan':
        case 'overlay-uncertain':
            return 'plan-defined';

        // ── Privately buildable, but PRYZM cannot answer for it YET. About OUR coverage. ──
        // `no-rule-pack`: the land is buildable and no pack is authored, so it falls to the
        // coverage-gap refusal. `regime-undetermined` (§L-590c / ADR-0274): the pack EXISTS and
        // every input is present, but the ordinance states two regimes keyed on a fact no public
        // source records (clau 22a) — still "we cannot give you this zone's envelope". Both are
        // `legallyGrounded: false`, and both share this coverage bucket precisely because a
        // developer must never read either as a legal denial.
        // ⚠ This is the branch L-601 §task-3 pins: clau 22a lands here *because the registry does
        // not list it as a pack*, so the day 22a is registered, `resolveZoneDisposition` returns
        // `kind: 'pack'` and the class becomes `full-envelope` with no edit to this file.
        case 'no-rule-pack':
        case 'regime-undetermined':
            return 'zone-unencoded';

        // ── Encoded and applicable, but the per-parcel construction could not complete. ──
        // The one TRANSIENT refusal (block unavailable / dissolve refused / no solution). Its own
        // class because it is neither a legal denial nor a coverage gap — both would be a different
        // false statement (§L-574).
        case 'source-data-unavailable':
            return 'construction-incomplete';

        // ── STRUCTURAL-SEAM-4 — the source answered and there is genuinely no plan published here. ──
        // A durable data-absence: not the law's denial, not our coverage gap, not a transient. Its
        // own class so it never wears the transient's retry colour nor the coverage gap's "coming soon".
        case 'no-plan-at-point':
            return 'no-plan-published';

        default:
            return assertNever(code, 'EnvelopeRefusalCode');
    }
}

/**
 * Classify a `ZoneDisposition` the registry already produced.
 *
 * Prefer this overload when the caller ALREADY holds the disposition (e.g. the dispatcher, which
 * resolved it to answer the click) — classifying the same object it acted on is what guarantees the
 * colour and the answer can never disagree.
 *
 * `unregistered` → `zone-unencoded`: a jurisdiction/zone the registry does not cover falls to the
 * estimated fallback, which is, honestly, "PRYZM has not encoded rules for this land here". It
 * shares the coverage bucket with `no-rule-pack` deliberately — both are the same claim about our
 * reach, and a developer must never read a coverage limit as a legal one.
 */
export function classifyDisposition(disposition: ZoneDisposition): AnswerabilityClass {
    switch (disposition.kind) {
        // §ENVELOPE-PUBLICATION-AUTHORISATION (L-665) — A PACK IS NOT AN ANSWER UNTIL IT IS SIGNED.
        //
        // THE DEFECT THIS CLOSES. This arm used to return `full-envelope` for any registered pack,
        // so `classifyAnswerability('es-14021-cordoba', 'PAS-1')` — and the same for Murcia's
        // `RM1`, and Madrid's 23 Título-8 codes — promised "PRYZM computes a real buildable volume
        // here" for parcels that receive a cited REFUSAL and no number at all. Córdoba has carried
        // that claim since the day it was registered.
        //
        // ROOT CAUSE, SHARED WITH THE `ZoningRulesEngine` CONFIDENCE DEFECT: a consumer reading the
        // REGISTRY without reading the GATE. `packsByZone` states what is WIRED; the city's
        // `*_ENVELOPE_VERIFIED` constant states what is AUTHORISED. Reading the first as if it were
        // the second is the whole bug, in both places.
        //
        // ⚠ FIXED HERE, IN THE CLASSIFIER — NEVER BY DE-REGISTERING THE PACK. De-registration would
        // silence one city and leave the next gated one to rediscover this, and it would ALSO put
        // out the C60 coverage globe: we DO answer in Córdoba, with an honest cited refusal, which
        // is an answer. Registration wires routing; it does not authorise output.
        //
        // ⚠ THE GATE IS CHECKED HERE AND NOT IN `classifyAnswerability`, deliberately: the pack
        // carries its own `jurisdictionId`, so BOTH entry points inherit the check from one site and
        // the "agree by construction" property is preserved rather than re-argued. A caller that
        // already holds a disposition gets the same answer as one that resolves a zone code.
        case 'pack':
            return isEnvelopePublicationAuthorised(disposition.pack.jurisdictionId)
                ? 'full-envelope'
                : 'pack-unverified';
        case 'refusal':
            return classifyRefusalCode(disposition.refusal.code);
        case 'unregistered':
            return 'zone-unencoded';
        default:
            return assertNever(disposition, 'ZoneDisposition.kind');
    }
}

/**
 * Classify a parcel by (jurisdiction, zone code), resolving the disposition through the SHIPPING
 * answer path. The convenience entry point for callers that hold a zone code but not a disposition
 * (e.g. a map layer colouring a parcel it just picked).
 *
 * Identical in result to `classifyDisposition(resolveZoneDisposition(...))` — and defined exactly
 * that way, so there is a single resolution site and no opportunity for a second, drifting one.
 */
export function classifyAnswerability(
    jurisdictionId: string,
    zoneCode: string,
    hints?: ZoneDispositionHints,
): AnswerabilityClass {
    return classifyDisposition(resolveZoneDisposition(jurisdictionId, zoneCode, hints));
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// WIRING TODO (L-601 §tasks 4–8, sequenced BEHIND L-600 — do NOT start until L-600 lands):
//   • Re-export { AnswerabilityClass, ANSWERABILITY_CLASSES, classifyAnswerability,
//     classifyDisposition, classifyRefusalCode } from the package barrel (`src/index.ts`).
//     ⚠ Left undone in this slice ONLY to avoid an `index.ts` merge collision with the concurrent
//     OCR/Madrid/Saudi/Denmark rulepack work — it is a one-line addition, not a design gap.
//   • Palette + legend with live per-view counts; `plan-defined` visually distinct from
//     `zone-unencoded`; no `#6600FF` (reserved for the envelope), no off-white (context fill).
//   • Second mode on the existing `ContextUseMode` seam — NEVER a branch inside `classifyContextUse`
//     (a test pins `classifyContextUse.length === 1`).
//   • Selection → the read-only query panel showing the class + ITS CITATION (the refusal's
//     `ordinanceRef`, which rides along on the same disposition).
// ─────────────────────────────────────────────────────────────────────────────────────────────
