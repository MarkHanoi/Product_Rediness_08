// L-550 / Phase 0.1 — THE RULE-PACK REGISTRY.
//
// WHAT IT REPLACES
// ----------------
// `apps/editor/src/ui/site/siteDispatch.ts` gated the whole real-envelope path on a literal:
//
//     const eixampleCodes = BCN_ENSANCHE_ZONE_CODES as readonly string[];
//     if (!qual || !eixampleCodes.includes(qual.clau)) { …estimated fallback… }
//
// So EVERY new clau — and every new city — required an edit to an L5 editor file, and the
// editor had to know which pack answers for which zone code. That is jurisdiction knowledge
// living above the data layer, which C58 §1.5 exists to forbid ("adding DK/ES is a new pack,
// never an engine edit" — the same argument applies one layer up, to the dispatcher).
//
// The registry inverts it: the editor asks *"what is the disposition of this zone?"* and gets one
// of three answers. Adding clau 13b, or Madrid, becomes a DATA ADDITION in this package.
//
// WHY THREE OUTCOMES AND NOT TWO
// ------------------------------
// The tempting shape is `pack | null`. It cannot express the distinction Phase 1b is entirely
// about: **"the ordinance grants no envelope here" and "we have not encoded this zone yet" are
// opposite claims.** A boolean collapses them, and the collapse is what put a fabricated setback
// triple on Collserola. So:
//
//   • `pack`         — a curated pack answers for this zone. Solve it.
//   • `refusal`      — the ordinance answers, and its answer is "no private buildable envelope".
//                      Dispatch a cited refusal. A POSITIVE result.
//   • `unregistered` — PRYZM has no pack for a zone that IS privately buildable. Keep today's
//                      behaviour (the estimated fallback, which honestly badges every value as
//                      ESTIMATED). ⚠ Deliberately NOT a refusal: refusing here would tell the
//                      user the law forbids building on their perfectly buildable plot.
//
// ⚠ PRECEDENCE, AND WHY IT IS THIS WAY ROUND: a registered PACK BEATS a refusal classification.
// If a future pack is authored for a clau this table currently refuses, the pack is the more
// specific, more researched statement and must win — and the mistake (a clau both refused and
// packed) then surfaces as a working envelope rather than as a silent denial. A silent denial is
// the harder bug to notice, so precedence points away from it.
//
// PURITY: L2-pure. Data + a lookup. No I/O.
//
// Strategic context — BARCELONA-COMPLETE-COVERAGE-PLAN.md §5 Phase 0.1, C58 §1.5, ADR-0272.

import type { JurisdictionZoningContract, EnvelopeRefusal } from '@pryzm/schemas';
import { ES_BARCELONA_ENSANCHE_PACK, BCN_ENSANCHE_ZONE_CODES } from './esBarcelonaEnsanche.js';
import {
    ES_BARCELONA_SEMIINTENSIVA_PACK,
    BCN_SEMIINTENSIVA_ZONE_CODES,
} from './esBarcelonaSemiintensiva.js';
import {
    barcelonaZoneRefusalFor,
    barcelonaNoRulePackRefusal,
} from './esBarcelonaZoneClassification.js';

/** The jurisdiction id Barcelona packs and records use. One constant, not a scattered literal. */
export const BCN_JURISDICTION_ID = 'es-08019-barcelona';

/** What the registry knows about a (jurisdiction, zone) pair. */
export type ZoneDisposition =
    | {
          readonly kind: 'pack';
          readonly pack: JurisdictionZoningContract;
          readonly zoneCode: string;
      }
    | { readonly kind: 'refusal'; readonly zoneCode: string; readonly refusal: EnvelopeRefusal }
    | { readonly kind: 'unregistered'; readonly zoneCode: string };

/**
 * One jurisdiction's registrations. `packsByZone` is the authoritative map; `refusalFor` is a
 * function rather than a map so a jurisdiction may classify by pattern where its ordinance
 * genuinely works that way (Barcelona's does not — see `esBarcelonaZoneClassification.ts` on why
 * it enumerates).
 */
interface JurisdictionRegistration {
    readonly jurisdictionId: string;
    readonly packsByZone: ReadonlyMap<string, JurisdictionZoningContract>;
    readonly refusalFor: (
        zoneCode: string,
        harmonisedCode?: string | null,
        knownFacts?: readonly string[],
    ) => EnvelopeRefusal | null;
    /**
     * L-553 — the COVERAGE-GAP refusal for a privately-buildable zone this jurisdiction has no
     * pack for. Per-jurisdiction because the copy must name that jurisdiction's roadmap and speak
     * about its ordination types; a generic "no data" string would be exactly the illegible
     * honesty this decision exists to avoid.
     *
     * ⚠ OPTIONAL, and its absence is meaningful. A jurisdiction that declares NO coverage-gap
     * refusal keeps the estimated fallback for its unpacked zones. That is the correct default
     * for suburban/detached fabric, where a setback triple is the RIGHT shape and an estimate is
     * genuinely just an estimate. Switching it off wholesale would be standardising over a real
     * legal difference — the founder's ranking, inverted.
     */
    readonly noRulePackRefusal?: (
        zoneCode: string,
        zoneLabel?: string | null,
        knownFacts?: readonly string[],
    ) => EnvelopeRefusal;
}

/**
 * Extra signals the provider already returned, which a classifier MAY use — never must.
 *
 * `harmonisedCode` is Catalonia's cross-municipal `CODI_QUAL_MUC`. It exists here because the
 * L-550 coverage probe found COMPOSITE claus (`1a-5b`, `3-6b`, …) that no enumeration can
 * anticipate but whose harmonised class identifies them unambiguously as systems. It is an
 * OPTIONAL hint: omitting it degrades to the per-clau table, never to a wrong answer.
 */
export interface ZoneDispositionHints {
    readonly harmonisedCode?: string | null;
    /**
     * L-553 — the zone's name in the ordinance's own words (`DESC_QUAL_AJUNT` from the MUC).
     * Carried so the COVERAGE-GAP card can open by naming the user's zone, which is the fastest
     * way to distinguish "we don't have this zone's rules" from "it crashed".
     */
    readonly zoneLabel?: string | null;
    /**
     * L-553 — short "label: value" facts about this parcel the caller already holds (reference,
     * address, area). Shown so the refusal card is never a blank panel. Facts only — never a
     * constraint.
     */
    readonly knownFacts?: readonly string[];
}

/**
 * Build the zone→pack map from one or more (pack, codes) registrations.
 *
 * ⚠ THROWS on a duplicate code, at module load. Two packs claiming the same clau is not a
 * resolvable ambiguity — whichever the map ordering happened to keep would silently decide which
 * ordinance governs someone's land, and the loser would fail nowhere. A load-time throw is the
 * only failure mode that cannot be mistaken for a working envelope (the same reasoning that makes
 * `esBarcelonaEnsanche.ts` parse its schema at load).
 */
function packMap(
    ...registrations: ReadonlyArray<
        readonly [pack: JurisdictionZoningContract, codes: readonly string[]]
    >
): ReadonlyMap<string, JurisdictionZoningContract> {
    const m = new Map<string, JurisdictionZoningContract>();
    for (const [pack, codes] of registrations) {
        for (const c of codes) {
            if (m.has(c)) {
                throw new Error(
                    `[site-parcel-data] duplicate rule-pack registration for zone code "${c}" ` +
                        `(${m.get(c)!.displayName} vs ${pack.displayName}). One clau, one pack.`,
                );
            }
            m.set(c, pack);
        }
    }
    return m;
}

const REGISTRATIONS: readonly JurisdictionRegistration[] = [
    {
        jurisdictionId: BCN_JURISDICTION_ID,
        packsByZone: packMap(
            // ADR-0271 — clau 13a/13E, the block-derived *profunditat edificable* pack. 24.2 % of
            // Barcelona's private buildable land (measured, plan §2.2).
            [ES_BARCELONA_ENSANCHE_PACK, BCN_ENSANCHE_ZONE_CODES],
            // L-583 §9 — clau 13b (*densificació urbana semiintensiva*), +8.8 pp ⇒ 33.0 %. The
            // SAME Art. 242 depth construction (it is the same article, reached via Art. 326), a
            // DIFFERENT height table (Art. 328, not Art. 327 — see `bcnAlcadaByZone.ts`, which is
            // what stops the dispatcher handing this zone 13a's numbers under 13a's citation).
            [ES_BARCELONA_SEMIINTENSIVA_PACK, BCN_SEMIINTENSIVA_ZONE_CODES],
            // ⚠⚠ §L-590 — `ES_BARCELONA_INDUSTRIAL_PACK` (clau 22a) EXISTS AND IS **NOT** LISTED
            // HERE. THIS IS NOT AN OVERSIGHT. Do not "finish the job" by adding it.
            //
            // The pack is fully sourced from the primary PGM text (Art. 350, p. 116 of the
            // committed NNUU PDF) and its scalars are right. What is missing is a GEOMETRIC RULE:
            // Art. 350.2 grants a ≤90 %-of-PARCEL ground floor plus, above it, a tower confined to
            // a band concentric with the BLOCK equal to 70 % of the block — a two-tier solid.
            // `GeometricRule` has no kind for that and `BuildableEnvelope` carries one prism, so
            // the pack's `geometricRule` is `null`; and `null` means "legacy per-edge inset", which
            // on this zone's (correctly) all-null setbacks erodes nothing. Registering it would
            // therefore publish an envelope covering **100 %** of the plot on the same card as the
            // **90 %** occupation cap it read from the same article — an over-statement that
            // contradicts its own citation, which is strictly worse than the coverage-gap refusal
            // 22a gets today.
            //
            // Read `BCN_22A_ENVELOPE_BLOCKER` in `esBarcelonaIndustrial.ts` before touching this.
        ),
        refusalFor: barcelonaZoneRefusalFor,
        // L-553, founder-decided: Barcelona's remaining unpacked buildable claus (12, 12b, 22a,
        // 22@, 20a/*) refuse rather than show a generic setback triple. The dense Barcelona fabric is
        // *alineacions de vial*, so that triple is the wrong geometric OPERATION, and no badge
        // can label a category error.
        noRulePackRefusal: barcelonaNoRulePackRefusal,
    },
];

const BY_JURISDICTION: ReadonlyMap<string, JurisdictionRegistration> = new Map(
    REGISTRATIONS.map((r) => [r.jurisdictionId, r]),
);

/**
 * Resolve what to do with a zone code. The ONE question the dispatcher asks.
 *
 * An unknown jurisdiction yields `unregistered`, not a throw: a plot outside every registered
 * city must keep working on the estimated path exactly as it does today.
 */
export function resolveZoneDisposition(
    jurisdictionId: string,
    zoneCode: string,
    hints?: ZoneDispositionHints,
): ZoneDisposition {
    const reg = BY_JURISDICTION.get(jurisdictionId);
    if (!reg) return { kind: 'unregistered', zoneCode };
    const pack = reg.packsByZone.get(zoneCode);
    // Pack precedence — see the header on why this order and not the reverse.
    if (pack) return { kind: 'pack', pack, zoneCode };
    const refusal = reg.refusalFor(
        zoneCode,
        hints?.harmonisedCode ?? null,
        hints?.knownFacts ?? [],
    );
    if (refusal) return { kind: 'refusal', zoneCode, refusal };
    // L-553 — a privately-buildable zone with no pack. If the jurisdiction declares a
    // coverage-gap refusal, REFUSE rather than let the caller draw a generic setback estimate.
    // Order matters: this runs LAST, so a legal refusal (a statement about the ordinance) can
    // never be displaced by a coverage refusal (a statement about PRYZM). Those two must not be
    // interchangeable and the precedence is what guarantees it.
    if (reg.noRulePackRefusal) {
        return {
            kind: 'refusal',
            zoneCode,
            refusal: reg.noRulePackRefusal(zoneCode, hints?.zoneLabel ?? null, hints?.knownFacts ?? []),
        };
    }
    return { kind: 'unregistered', zoneCode };
}

/**
 * Every zone code a pack answers for, per jurisdiction. Exported for the coverage probe so
 * "what does the engine cover today?" is read from the shipping registry rather than re-stated
 * in the probe — the probe must not be able to disagree with the code path it measures.
 */
export function registeredPackZoneCodes(jurisdictionId: string): readonly string[] {
    return [...(BY_JURISDICTION.get(jurisdictionId)?.packsByZone.keys() ?? [])];
}
