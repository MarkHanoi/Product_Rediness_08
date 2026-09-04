// FRANCE — `frEnvelopeRuleStates`: the ONE entry point that turns already-fetched GPU facts into a
// typed `RuleState[]`. This is the module that makes the FR rule packs REACHABLE rather than merely
// present.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE EXISTS — the defect it closes is REACHABILITY, not correctness
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Measured 2026-09-04, lane ENVELOPE-FR round 4, by grepping the whole repo for every FR pack:
//
//     frCnigPrescriptionTree · frRnuNationalPack · frFrontage · frPau · frPlanningRegime
//     · frImplantationRule · frHeightDatum
//
//         → consumers OUTSIDE their own tests and `src/index.ts`:  **ZERO**
//
// Seven pure, tested rule packs, every one of them exported from the package barrel, and not one of
// them on a path that a parcel resolution actually walks. That is the §AUTHORED-BUT-UNWIRED failure
// in its purest form: `git log` says the work landed, the product answers as if it never did. ⛔ The
// audit that matters is REACHABILITY, never existence — a pack nobody calls is worth exactly the
// same as a pack nobody wrote, and it is more expensive because it looks finished.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE COMPOSITION RULE — one parameter, one pack, decided by REGIME
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The packs are not alternatives to be merged; each one owns the parcels its regime governs, and the
// regime verdict (`frPlanningRegime.ts`) is what routes between them:
//
//   RNU · POS-caduc  → `frRnuNationalPack`   — the ~12,400 communes with no municipal document.
//                      The applicable rules are the Code's own articles, and they are STRUCTURED.
//   PLU · PLUi · CC  → `frCnigPrescriptionTree` — a local instrument governs; its drawn
//   · PSMV             prescriptions are the reachable half of it.
//   undetermined     → NEITHER speaks. Two disagreeing publisher statements do not average.
//
// ⛔ THEY NEVER BOTH EMIT FOR ONE PARAMETER. `frRnuRuleStates` already returns `[]` unless
// `verdict.rnuRulesApply`, and this module additionally refuses to let a later pack overwrite an
// earlier one's rule (`pushUnlessClaimed`). A parcel that received the RNU's R.111-16 height must
// not also receive a CNIG `39.02`: the second would look like corroboration and is in fact a
// different legal claim about the same parcel.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE TWO DERIVATIONS ARE INPUTS TO THE PACKS, NOT RIVALS OF THEM
// ══════════════════════════════════════════════════════════════════════════════════════════════
//  • FRONTAGE (`frFrontage.ts`) — its derived road width is R.111-16's `A4`, i.e. the fact that
//    turns the RNU height rule from a formula into a number. So it runs FIRST and is passed IN as
//    `facts.roadWidthM`. Emitting frontage beside the pack, without feeding it, would leave the
//    height `unrecovered` next to the very number that resolves it.
//  • PAU (`frPau.ts`) — `frRnuRuleStates` seats a supplied derivation as `B5` itself
//    (`frPauRuleState`). So the derivation is passed IN, never pushed separately; otherwise the
//    parcel carries two B5 states, one `resolved/derivable` and one `refused`, and a reducer counts
//    both.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ WHAT THIS RE-CLASSIFIES — the founder's `missing-source` finding, made operational
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Founder blocker review §4: *"Some of the 59 are RNU communes correctly observed and wrongly
// concluded. 'No PLU found' is the OBSERVATION; 'no source' is the wrong INFERENCE."* Routing on the
// regime is what makes that concrete: a commune whose `is_rnu=true` is not missing a source, it has
// a DIFFERENT one, and the national pack cites it by article. `frMissingSourceReclassification()`
// below states the rule a re-count must apply, so the re-classification is a function rather than a
// paragraph somebody has to remember.
//
// ⭐ AND `discretionary` STOPS BEING AN ARTEFACT. Review §4: *"Under the RNU the conseil municipal
// may authorise constructions outside the urbanised parts by REASONED DELIBERATION … That is
// textbook E4. A correct France run has a substantial discretionary bucket."* The national pack
// emits exactly that `E4` state (L.111-4 4° / L.111-5 / R.111-14 / R.111-19 / R.111-27). It emitted
// it into nothing until this module; on this path every RNU parcel now carries it.
//
// PURE + deterministic (C58 §1.1/§1.9): no I/O, no clock, no THREE, no DOM, no RNG. Takes
// already-fetched facts and already-parsed geometry. Same inputs → byte-identical output.

import type { EnvelopeParameterKey, Pt, RuleSourceRef, RuleState } from '@pryzm/schemas';

import { frCnigRuleStates, type FrPrescriptionRow } from './frCnigPrescriptionTree.js';
import { deriveFrFrontage, type FrFrontageOptions, type FrRoadSegment } from './frFrontage.js';
import { deriveFrPau, type FrPauDwelling, type FrPauParameters } from './frPau.js';
import { classifyFrPlanningRegime, type FrRegimeFacts, type FrRegimeVerdict } from './frPlanningRegime.js';
import { frRnuRuleStates, type FrRnuRoadClass } from './frRnuNationalPack.js';

/* ────────────────────────────── the input ─────────────────────────────── */

/** The parcel geometry the two derivations need, in the scene XZ metre frame. `null` = not held. */
export interface FrParcelGeometry {
    readonly ring: readonly Pt[];
    readonly roads: readonly FrRoadSegment[];
    /** Neighbouring dwellings for the PAU density/continuity test. */
    readonly dwellings: readonly FrPauDwelling[];
    /**
     * Was the dwelling set COMPLETE within the PAU radius? ⛔ `'unknown'` when the fetch was capped,
     * bbox-clipped or degraded — an empty set is then not evidence of emptiness, and `deriveFrPau`
     * returns `indeterminate` rather than `outside` (§CONTEXT-DATA-HONESTY).
     */
    readonly dwellingsCoverage: 'complete-within-radius' | 'unknown';
}

export interface FrResolutionInput {
    /** The GPU statements the regime classifier reads. */
    readonly facts: FrRegimeFacts;
    /** Prescriptions intersecting the parcel (`prescription_surf` + `_lin`), already parsed. */
    readonly prescriptions: readonly FrPrescriptionRow[];
    /** The base legal address; each pack overrides `authority` / `dataset` / `article` for its own. */
    readonly ref: RuleSourceRef;
    /**
     * Is the règlement REACHABLE (a NOMFIC or URLFIC was served)? Decides `pdf` vs `missing-source`
     * on a CNIG gap — two different remedies, never one label.
     */
    readonly reglementReachable: boolean;
    /** Parcel + neighbourhood geometry, when held. `null` ⇒ neither derivation runs. */
    readonly geometry?: FrParcelGeometry | null;
    /**
     * The ministerial road classification for L.111-6. ⛔ Never inferred from BD TOPO: the article
     * turns on an administrative classification, and guessing it manufactures a 75/100 m band.
     */
    readonly roadClass?: FrRnuRoadClass | null;
    /** L.111-6's second predicate — `en dehors des espaces urbanisés`. `null` = not established. */
    readonly outsideEspacesUrbanises?: boolean | null;
    readonly frontageOptions?: FrFrontageOptions;
    readonly pauParameters?: FrPauParameters;
}

/* ────────────────────────────── the output ─────────────────────────────── */

export interface FrResolution {
    readonly regime: FrRegimeVerdict;
    /** Which pack answered, in the order they were consulted — auditable routing, not a guess. */
    readonly packsConsulted: readonly ('rnu-national' | 'cnig-prescriptions' | 'frontage' | 'pau')[];
    readonly states: readonly RuleState[];
}

/**
 * Output order. ⚠ It is the DECLARED order, never the order the packs happened to emit in, so two
 * runs over the same parcel are byte-comparable and a diff of two records is a diff of two answers.
 */
export const FR_RESOLUTION_ORDER: readonly EnvelopeParameterKey[] = [
    'A2', 'A3', 'A4', 'B2', 'B4', 'B5', 'C2', 'C3', 'C4', 'C5', 'C6', 'D1', 'E4',
];

/* ────────────────────────────── the composer ─────────────────────────────── */

/**
 * Resolve every envelope parameter the FR sources speak to at one parcel. **Pure, total,
 * deterministic.**
 *
 * ⚠ IT NEVER MANUFACTURES A ROW FOR A PARAMETER NO SOURCE SPEAKS TO. A parameter with no state is
 * not "no limit" — the rule is very probably in a règlement nobody parsed — and inventing an
 * `unrecovered` row here would put OUR unopened document into the same bucket as a plan that
 * genuinely lacks the mechanism (F1). The caller owns that judgement; only the caller knows whether
 * the document was opened.
 */
export function frEnvelopeRuleStates(input: FrResolutionInput): FrResolution {
    const regime = classifyFrPlanningRegime(input.facts);
    const consulted: FrResolution['packsConsulted'][number][] = [];
    const out: RuleState[] = [];

    // A rule already answered by a higher-precedence pack is never answered twice (see the header).
    const claimed = new Set<EnvelopeParameterKey>();
    const pushUnlessClaimed = (states: readonly RuleState[]): void => {
        for (const s of states) {
            if (claimed.has(s.rule)) continue;
            out.push(s);
        }
        for (const s of states) claimed.add(s.rule);
    };

    // ── 1 · FRONTAGE first — it produces the FACT the RNU height rule consumes ─────────────────
    const geo = input.geometry ?? null;
    const frontage =
        geo !== null && geo.ring.length >= 3
            ? deriveFrFrontage(geo.ring, geo.roads, input.ref, input.frontageOptions)
            : null;
    if (frontage !== null) consulted.push('frontage');

    // The governing frontage width for R.111-16's `A4`: the NARROWEST front edge that carries a
    // measured width. ⚠ MIN, not mean and not max — the article caps height at the width of the
    // road the building fronts, and averaging two frontages would grant height the narrow one
    // refuses (L-616: on partial data, err toward the constraint).
    const roadWidthM = frontage === null
        ? null
        : frontage.edges
            .filter((e) => e.physical === 'road' && typeof e.roadWidthM === 'number' && e.roadWidthM > 0)
            .reduce<number | null>((m, e) => (m === null ? e.roadWidthM! : Math.min(m, e.roadWidthM!)), null);

    // ── 2 · PAU — derived only where the L.111-3 test actually applies ─────────────────────────
    // ⛔ Running it elsewhere would attach a constructibilité-limitée verdict to a parcel governed
    // by a PLU, where the test has no subject at all.
    const pau =
        regime.pauTestApplies && geo !== null && geo.ring.length >= 3
            ? deriveFrPau({
                parcelRing: geo.ring,
                dwellings: geo.dwellings,
                dwellingsCoverage: geo.dwellingsCoverage,
                roadAccess: frontage === null ? null : frontage.roadAccess,
                ...(input.pauParameters === undefined ? {} : { parameters: input.pauParameters }),
            })
            : null;
    if (pau !== null) consulted.push('pau');

    // ── 3 · the regime's own pack ─────────────────────────────────────────────────────────────
    if (regime.rnuRulesApply) {
        consulted.push('rnu-national');
        pushUnlessClaimed(
            frRnuRuleStates({
                verdict: regime,
                ref: input.ref,
                facts: {
                    roadWidthM,
                    pau,
                    roadClass: input.roadClass ?? null,
                    outsideEspacesUrbanises: input.outsideEspacesUrbanises ?? null,
                },
            }),
        );
    } else if (regime.regime === 'PLU' || regime.regime === 'PLUi' || regime.regime === 'PSMV' || regime.regime === 'CC') {
        consulted.push('cnig-prescriptions');
        pushUnlessClaimed(
            frCnigRuleStates({
                prescriptions: input.prescriptions,
                ref: input.ref,
                reglementReachable: input.reglementReachable,
            }),
        );
    }
    // `undetermined-*` consults NEITHER pack — deliberately. A conflict between two publisher
    // statements is not resolved by picking the pack that yields more rows.

    // ── 4 · the frontage states last: A3/A4 are FACTS about the parcel, not rules ─────────────
    // They are emitted even when a pack already answered C2/C5, because they describe a different
    // thing (which edges front a road, and how wide it is) and never claim a parameter a rule owns.
    if (frontage !== null) out.push(...frontage.states);

    const rank = new Map(FR_RESOLUTION_ORDER.map((k, i) => [k, i] as const));
    const states = out
        .map((s, i) => ({ s, i }))
        .sort((p, q) => (rank.get(p.s.rule) ?? 99) - (rank.get(q.s.rule) ?? 99) || p.i - q.i)
        .map((x) => x.s);

    return { regime, packsConsulted: consulted, states };
}

/* ─────────────────────── the `missing-source` re-classification ─────────────────────── */

export type FrMissingSourceVerdict =
    /** No municipal document exists BY LAW; the national articles govern and are cited. */
    | 'rnu-national-source-applies'
    /** A local document is declared and none was served — genuinely missing, remedy = sourcing. */
    | 'genuinely-missing'
    /** Two publisher statements disagree; neither regime, and no source, may be asserted. */
    | 'undetermined-conflict';

/**
 * Re-classify a state that a GPU-only trace labelled `missing-source`. **Pure, total.**
 *
 * ⭐ Founder blocker review §4, made executable: *"'No PLU found' is the observation; 'no source' is
 * the wrong inference."* Under the RNU there is no municipal PDF to find, and saying so is not a gap
 * report — the Code's own articles are the source, they are structured, and `frRnuNationalPack`
 * cites them. Only a commune that DECLARES a local document (`is_rnu=false`) and then serves none is
 * genuinely missing one.
 *
 * ⚠ It re-classifies the LABEL, not the recovery. A parcel moved out of `missing-source` has not
 * gained a parameter; it has gained a correct remedy — *read the national articles* instead of *go
 * find a PDF that does not exist*. Reporting it as a recovery would be the same over-claim in the
 * opposite direction.
 */
export function frMissingSourceReclassification(facts: FrRegimeFacts): FrMissingSourceVerdict {
    const verdict = classifyFrPlanningRegime(facts);
    if (verdict.rnuRulesApply) return 'rnu-national-source-applies';
    if (verdict.regime === 'undetermined-conflict') return 'undetermined-conflict';
    return 'genuinely-missing';
}
