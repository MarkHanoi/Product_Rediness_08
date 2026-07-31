// @pryzm/ordinance-extraction — the GERMAN legal-regime table (data for
// `gates/regimeGate.ts`).
//
// Transcribed from the regime table in
// docs/04-reference/jurisdictions/de/de-be/11000-berlin/EXTRACTION-PIPELINE.md §2,
// which the Germany City-Adapter-Contract §4 ranks **100% reusable** across German
// cities: "BauGB is federal law; the §30 / §34 / §35 branch is identical
// nationwide; §34 → cited refusal everywhere."
//
// ⚠ NO PLANNING NUMBER APPEARS IN THIS FILE. A regime says whether numbers exist by
// law and what to say when they do not. The numbers themselves are extracted from
// the plan document, human-gated, and cited (L-449).

import { type PlanningRegime, type RegimeTable } from '../gates/regimeGate.js';

/** Qualifizierter / vorhabenbezogener B-Plan — the regime that sets numbers. */
export const DE_BPLAN_30: PlanningRegime = {
    id: 'de-bplan-30',
    displayName: 'Qualifizierter B-Plan',
    legalBasis: 'BauGB § 30',
    numericExtraction: 'allowed',
};

/**
 * Unplanned interior area. THE IMPORTANT ONE: no numeric envelope exists BY LAW,
 * so the refusal below is the product's positive answer, not a gap in our data.
 * Roughly a third of German parcels sit here or under §35 — which is why the
 * country's human-review ceiling is ~65–70% (de/COUNTRY-DATA-STRATEGY.md), a
 * ceiling that is a property of German law, not of our pipeline.
 */
export const DE_UNPLANNED_34: PlanningRegime = {
    id: 'de-unplanned-34',
    displayName: 'Unbeplanter Innenbereich',
    legalBasis: 'BauGB § 34',
    numericExtraction: 'refused',
    // Verbatim from EXTRACTION-PIPELINE.md §2.
    refusal:
        'This parcel lies in an unplanned interior area (§34 BauGB). No numeric building envelope is defined — buildability is assessed case-by-case.',
};

/** Outlying area — presumptively not buildable; likewise a cited refusal. */
export const DE_OUTLYING_35: PlanningRegime = {
    id: 'de-outlying-35',
    displayName: 'Außenbereich',
    legalBasis: 'BauGB § 35',
    numericExtraction: 'refused',
    refusal:
        'This parcel lies in an outlying area (§35 BauGB). No numeric building envelope is defined and development is presumptively not permitted; only privileged projects are assessed, case-by-case.',
};

/**
 * Berlin's Baunutzungsplan 1958/1960, still operative as übergeleitetes Recht under
 * §173(3) BBauG. Numbers CAN be derived (Baustufe → translated value) but the
 * instrument carries a judicial voidance risk — courts have held parts
 * *funktionslos* (OVG Berlin-Brandenburg, Az. 2 B 10.17, 15 Sep 2020). So it is
 * `conditional`: extract, caveat every value, and cap the ladder permanently.
 *
 * ⚠ ON THE CAP. The source dossier writes `confidenceCap: "corroborated"`, but
 * "corroborated" belongs to that document's own four-step ladder
 * (unknown → extracted → corroborated → verified), NOT to the C58 §1.2
 * EnvelopeConfidence ladder. Mapping one onto the other would be an invention, so
 * this encodes only what the dossier actually asserts — "NEVER `structured` /
 * `verified`" — as the two forbidden C58 tiers. Anything finer needs a decision
 * recorded in the dossier first.
 */
export const DE_BERLIN_LEGACY_BAUNUTZUNGSPLAN: PlanningRegime = {
    id: 'de-be-baunutzungsplan-1958',
    displayName: 'Baunutzungsplan 1958/1960 (übergeleitetes Recht)',
    legalBasis: 'BBauG § 173(3)',
    numericExtraction: 'conditional',
    caveat:
        'Derived from the Berlin Baunutzungsplan 1958/60 (Baustufe). Historical validity must be verified per parcel: parts have been held funktionslos (OVG Berlin-Brandenburg, Az. 2 B 10.17, 15 Sep 2020). Voidance risk applies.',
    forbiddenTiers: ['structured', 'authoritative'],
};

/**
 * The German regime table. The first three are federal (BauGB) and apply in every
 * German city; the fourth is a Berlin-specific legacy branch — exactly the ~20%
 * per-city surface the adapter contract §4 describes ("a whole extra parser most
 * cities do not need").
 */
export const GERMAN_REGIMES: RegimeTable = [
    DE_BPLAN_30,
    DE_UNPLANNED_34,
    DE_OUTLYING_35,
    DE_BERLIN_LEGACY_BAUNUTZUNGSPLAN,
];
