// L-609 / §NL-NATIONWIDE — Netherlands (national) bestemmingsplan rule pack: the `explicit-area`
// zone. NATIONWIDE (was Amsterdam gemeente 0363 only) and served by a KEYLESS source.
//
// ⚠⚠ THIS PACK IS A DECLARATION, NOT A SOLVE. Its numeric fields are all `null`: an NL parcel's
//     REAL numbers come LIVE from the plan's `maatvoering` objects (resolved by
//     `resolveNlBestemmingsplan`), not from this pack. What the pack declares is the SHAPE of the
//     rule (`explicit-area` — the ordinance publishes the buildable `bouwvlak` as geometry) and the
//     governing citation. Read this header before touching it or the registry.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// WHY explicit-area, AND WHY NL IS THE STRONGEST CASE FOR IT (C58 §2.2 / ADR-0270)
// ═════════════════════════════════════════════════════════════════════════════════════════════
// Like Madrid NZ 1, the Dutch bestemmingsplan PUBLISHES THE BUILDABLE FOOTPRINT DIRECTLY AS
// GEOMETRY — the `bouwvlak` polygon (IMRO2012 / SVBP2012). Transcribing it into setback parameters
// would be a lossy re-derivation of something already authoritative, so `explicit-area` (ADR-0270)
// is the correct and only honest kind.
//
// Where NL is STRONGER than Madrid: the `maatvoering` objects carry the rule NUMBERS with
// UNAMBIGUOUS SVBP2012 units — "maximum bouwhoogte (m)" (height), "maximum bebouwingspercentage (%)"
// (coverage), "maximum aantal bouwlagen" (storeys). Madrid's COEF_Z is a coded token whose FAR
// semantics stay withheld (⇒ estimated-ruleset even when certified); a clean NL "maximum bouwhoogte
// (m)" is a genuine `published-structured` metre value. So a CERTIFIED NL parcel with a real
// maatvoering renders `structured` (the dispatcher feeds the height into `structuredFields`), not
// merely `estimated-ruleset`. See `resolveNlBestemmingsplan.ts` + the dispatcher.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// WHY IT SOLVES NOW — the KEYLESS route (§NL-NATIONWIDE, 2026-07-26)
// ═════════════════════════════════════════════════════════════════════════════════════════════
// The original slice routed through the DSO Ruimtelijke Plannen API v4, which is GATED behind an
// Informatiehuis Ruimte API key PRYZM does not hold (probe 2026-07-25 → HTTP 401). This slice uses
// the founder-verified KEYLESS route instead: the PDOK "Ruimtelijke plannen" WMS
// (`service.pdok.nl/kadaster/ruimtelijke-plannen/wms/v1_0`), a national mirror of every officially-
// published Wro/Bro plan. `GetFeatureInfo` at a point returns the bouwvlak geometry + the maatvoering
// numbers, no key. Verified live (2026-07-26): maximum bouwhoogte Rotterdam 40 m, Utrecht 26 m,
// Groningen 24 m. So `NL_BESTEMMINGSPLAN_CERTIFIED` is ON and a parcel with a resolved maatvoering
// renders a real `structured` envelope; a plan that GENUINELY lacks a maatvoering refuses honestly
// (naming the plan), rather than invent a height (§CONTEXT-DATA-HONESTY).
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// REGISTRATION NOTE (orchestrator)
// ═════════════════════════════════════════════════════════════════════════════════════════════
//   This file is intentionally NOT imported by `registry.ts` (mirrors the Madrid L-608 constraint):
//   the dispatcher (`applyNlZoningThenFallback`) references the pack directly, gated on
//   `isInNetherlands` + `NL_BESTEMMINGSPLAN_CERTIFIED`. If a `JurisdictionRegistration` is ever
//   added to the coverage globe, its extent is the national NL bbox + `contains` predicate.
//
// Confidence: `estimated-ruleset` as a PACK default — a pack cannot self-certify. The per-parcel
// render is `structured` when a live maatvoering resolves under the certified gate (see above).
//
// PURE + deterministic (C58 §1.1). Strategic context: C58 §1.4/§2.2, ADR-0270, and the mirrored
// `esMadridNZ1.ts`.

import {
    JurisdictionZoningContractSchema,
    type JurisdictionZoningContract,
    type GeometricRule,
    type EnvelopeRefusal,
    type PermittedUse,
} from '@pryzm/schemas';
import { NL_RING_REF } from '../providers/resolveNlBestemmingsplan.js';

/** The jurisdiction id NL bestemmingsplan packs and records use (national, was `nl-0363-amsterdam`). */
export const NL_JURISDICTION_ID = 'nl-bestemmingsplan';

/** The single generic zone code this pack answers for. The real bestemming (zone naam) rides on the
 *  `ZoningRecord` per parcel; the pack keys one `explicit-area` zone because the buildability SHAPE
 *  is identical across bestemmingen — the `bouwvlak` IS the rule (mirrors Madrid's one-rule pack). */
export const NL_ZONE_CODE = 'nl:bouwvlak' as const;

/** The governing citation carried on the pack + the refusal. */
export const NL_ORDINANCE_REF =
    'Bestemmingsplan (Wet ruimtelijke ordening) — het buildable `bouwvlak` en de `maatvoering` ' +
    '(o.a. "maximum bouwhoogte (m)", "maximum bebouwingspercentage (%)", "maximum aantal ' +
    'bouwlagen") worden machine-leesbaar gepubliceerd volgens IMRO2012 / SVBP2012, landelijk ' +
    'keyless ontsloten via de PDOK-webservice "Ruimtelijke plannen" (WMS), ' +
    'service.pdok.nl/kadaster/ruimtelijke-plannen/wms/v1_0 (live geverifieerd 2026-07-26). Daarom ' +
    'is deze zone gemodelleerd als explicit-area (het bouwvlak IS de regel), niet getranscribeerd ' +
    'naar setback-afstanden.';

/**
 * The NL bestemmingsplan geometric rule. `explicit-area` carries ONLY a `ringRef`: the `bouwvlak`
 * geometry is resolved at the provider boundary (`resolveNlBestemmingsplan`), never inlined here.
 * The handle is versioned so the pack stays diffable across API vintages.
 */
export const NL_RULE: GeometricRule = {
    kind: 'explicit-area',
    ringRef: NL_RING_REF,
};

/**
 * The generic NL bestemmingsplan zone. Every numeric field is `null` — the parcel's real numbers are
 * the LIVE maatvoering, resolved externally; the `bouwvlak` geometry IS the shape rule.
 */
function nlZone(code: string) {
    return {
        code,
        label: 'Bestemmingsplan bouwvlak (IMRO2012 / SVBP2012)',
        permittedUse: [] as PermittedUse[], // the bestemming (Wonen/Gemengd/…) rides live per parcel.
        maxHeight_m: null, // "maximum bouwhoogte (m)" is live maatvoering, not a pack constant.
        maxFloors: null,
        plotRatioFAR: null,
        maxCoverage: null,
        setbacks: { front_m: null, side_m: null, rear_m: null },
        geometricRule: NL_RULE,
        fieldProvenance: {},
        ordinanceRef: NL_ORDINANCE_REF,
    };
}

/**
 * The NL bestemmingsplan pack. `defaultConfidence: 'estimated-ruleset'` — a pack cannot
 * self-certify; the per-parcel render upgrades to `structured` when a live maatvoering resolves
 * under the certified gate. `source: 'manual'` — the pack asserts NO numbers (all null); the real
 * data source (`nl-pdok-rp-wms`) is stamped on the `ZoningRecord.provenance` at dispatch time.
 */
export const NL_BESTEMMINGSPLAN_PACK: JurisdictionZoningContract =
    JurisdictionZoningContractSchema.parse({
        jurisdictionId: NL_JURISDICTION_ID,
        displayName: 'Netherlands — bestemmingsplan bouwvlak + maatvoering (PDOK RP WMS)',
        source: 'manual',
        crs: 'EPSG:4326', // the proxy asks the RP WMS for WGS84 (crs EPSG:4326); L5 projects it.
        lastReviewed: '2026-07-26',
        defaultConfidence: 'estimated-ruleset',
        zones: [nlZone(NL_ZONE_CODE)],
    });

/**
 * Map a Dutch bestemming (zone) naam onto the closed `PermittedUse` vocabulary (C58 §2.2 — the
 * jurisdiction use-code → shared-vocabulary hand-off the schema mandates). A DIRECT translation of
 * the authoritative bestemming, not a guess; an unrecognised bestemming → `'other'` (honest, never
 * dropped). Case-insensitive, prefix-tolerant ("Wonen - 1", "Gemengd-2" both classify).
 */
export function bestemmingToPermittedUse(bestemming: string | null | undefined): PermittedUse | null {
    if (typeof bestemming !== 'string') return null;
    const s = bestemming.trim().toLowerCase();
    if (s === '') return null;
    if (s.startsWith('wonen') || s.startsWith('woondoeleinden') || s.includes('woning')) return 'residential';
    if (s.startsWith('gemengd') || s.startsWith('centrum')) return 'mixed';
    if (
        s.startsWith('bedrijf') ||
        s.startsWith('bedrijventerrein') ||
        s.startsWith('bedrijvent') ||
        s.startsWith('industrie')
    ) {
        return 'industrial';
    }
    if (
        s.startsWith('kantoor') ||
        s.startsWith('detailhandel') ||
        s.startsWith('horeca') ||
        s.startsWith('dienstverlening')
    ) {
        return 'commercial';
    }
    if (s.startsWith('maatschappelijk') || s.startsWith('sport') || s.startsWith('cultuur')) return 'civic';
    if (s.startsWith('groen') || s.startsWith('natuur') || s.startsWith('recreatie')) return 'green';
    return 'other';
}

/**
 * L-609 — the NL bestemmingsplan REFUSAL, shipped when a resolved plan genuinely lacks a `bouwvlak`
 * (or no plan at all covers the point, or the keyless service is transiently unreachable).
 *
 * ⚠ With `NL_BESTEMMINGSPLAN_CERTIFIED` ON this is NOT the default output — a parcel WITH a resolved
 * bouwvlak + maatvoering renders a real `structured` envelope. This refusal is the honest answer for
 * the residual cases (§CONTEXT-DATA-HONESTY: a REFUSAL and a FAILURE must not collapse to the same
 * value; never a fabricated bouwhoogte or bebouwingspercentage — C58 §1.4).
 *
 * `code: 'source-data-unavailable'` — PRYZM HOLDS the rule (this explicit-area declaration +
 * `resolveNlBestemmingsplan`), but no bouwvlak/maatvoering could be resolved for THIS parcel.
 * `legallyGrounded: false` — the LAW is known; what is missing is our data path for this parcel, a
 * statement about PRYZM's inputs, not about the ordinance. The `ordinanceRef` cites the
 * bestemmingsplan / IMRO publication for the one LEGAL claim we make (that NL publishes the bouwvlak
 * as geometry), never for a number.
 */
export function nlBestemmingsplanRefusal(
    planName: string | null = null,
    knownFacts: readonly string[] = [],
): EnvelopeRefusal {
    const planClause = planName ? ` (plan: ${planName})` : '';
    return {
        code: 'source-data-unavailable',
        headline:
            'Bestemmingsplan — the PDOK planning service was temporarily unreachable for this ' +
            `parcel${planClause}.`,
        detail:
            'PRYZM models the Dutch bestemmingsplan as an explicit-area zone: the plan publishes ' +
            'the buildable envelope (bouwvlak) and its dimensions (maatvoering — e.g. "maximum ' +
            'bouwhoogte (m)", "maximum bebouwingspercentage (%)") machine-readable per IMRO2012 / ' +
            'SVBP2012, served keyless by the national PDOK "Ruimtelijke plannen" WMS. That service ' +
            'did not answer for this parcel (it has been retried automatically) — a temporary outage ' +
            'of the source, NOT a statement that no plan is published here. Rather than fabricate a ' +
            'maximum height or coverage, PRYZM declines to draw a buildable envelope — no number is ' +
            'shown because none can be cited. Re-select the parcel to try again.',
        ordinanceRef: NL_ORDINANCE_REF,
        legallyGrounded: false,
        knownFacts: [...knownFacts],
    };
}

/**
 * §L-11840 / L-449 — the NL PUBLICATION-NOT-AUTHORISED refusal: `NL_BESTEMMINGSPLAN_CERTIFIED` is
 * SHUT (§UNSIGNED-GATE-DEFAULTS-SHUT, 2026-08-02), so this branch fires WITHOUT ever querying the
 * PDOK RP WMS for this parcel.
 *
 * ⚠ THE DEFECT THIS REPLACES. The dispatcher used to answer the gate-shut case with
 * `nlBestemmingsplanRefusal()` — the SAME copy used for a genuine transient PDOK outage
 * ("temporarily unavailable ... has been retried automatically ... Re-select the parcel to try
 * again"). That is a category error: a shut human-verification gate is a PERMANENT, administrative
 * fact about PRYZM's own publication policy, not a network hiccup — no retry, automatic or manual,
 * ever clears it, only a founder signature does (ADR-0283 Doctrine B). Telling the user to
 * "try again" for a state that cannot change on a retry is the exact failure≠empty conflation
 * §CONTEXT-DATA-HONESTY exists to prevent, one level removed (governance-hold vs. transient
 * failure instead of absence vs. failure).
 *
 * Mirrors `cordobaUnverifiedRefusal` (`esCordobaZoneClassification.ts`) and the §ENVELOPE-
 * PUBLICATION-AUTHORISATION (L-665) `pack-unverified` answerability class: PRYZM HOLDS a proven,
 * live, keyless-resolved rule (nationwide PDOK RP WMS, verified live at Rotterdam/Utrecht/
 * Groningen) and is simply not yet authorised to publish it. `code: 'no-rule-pack'` — the enum
 * carries no dedicated "unverified/unauthorised" code (same honest-fit compromise Córdoba's
 * refusal documents); the copy carries the precise meaning instead.
 *
 * `legallyGrounded: false` — a statement about PRYZM's OWN sign-off state, never about the
 * ordinance or the parcel's land. No retry affordance: re-selecting the parcel re-runs this same
 * branch and returns this same refusal until a human signs.
 */
export function nlPublicationNotAuthorisedRefusal(): EnvelopeRefusal {
    return {
        code: 'no-rule-pack',
        headline:
            'Bestemmingsplan — PRYZM has read and proven this rule live, but has not yet been ' +
            'authorised to publish a number for it.',
        detail:
            'The Netherlands publishes the buildable envelope (bouwvlak) and its dimensions ' +
            '(maatvoering) machine-readable nationwide via the keyless PDOK "Ruimtelijke plannen" ' +
            'WMS, and PRYZM\'s reader is proven against real published values (e.g. Rotterdam 40 m, ' +
            'Utrecht 26 m, Groningen 24 m maximum bouwhoogte). What is missing is not data: a ' +
            'human sign-off on publishing NL numbers nationwide is still outstanding ' +
            '(§UNSIGNED-GATE-DEFAULTS-SHUT — every open-and-unsigned gate found in this repo is ' +
            'shut by default until a person signs it, ADR-0283). This parcel was not even queried ' +
            '— the gate closes before the fetch, so no amount of re-selecting the parcel changes ' +
            'this answer. Only a recorded signature does.',
        ordinanceRef: NL_ORDINANCE_REF,
        legallyGrounded: false,
        knownFacts: [],
    };
}

/**
 * L-609 / STRUCTURAL-SEAM-4 — the NL GENUINE-ABSENCE refusal: the PDOK WMS ANSWERED and there is no
 * adopted bestemmingsplan (or no bouwvlak / usable zone-extent) at this point. A DURABLE coverage
 * fact, not a failed fetch — so `code: 'no-plan-at-point'`, NOT the transient `source-data-unavailable`,
 * and the card offers no retry (re-asking returns the same empty). The other half of the seam-4 split
 * from `nlBestemmingsplanRefusal` (§CONTEXT-DATA-HONESTY: absent ≠ unreachable, L-422/457/467/469).
 */
export function nlNoPlanRefusal(
    planName: string | null = null,
    knownFacts: readonly string[] = [],
): EnvelopeRefusal {
    const planClause = planName ? ` (plan: ${planName})` : '';
    return {
        code: 'no-plan-at-point',
        headline:
            `Bestemmingsplan — no published buildable envelope at this point${planClause}.`,
        detail:
            'PRYZM queried the national PDOK "Ruimtelijke plannen" WMS at this parcel and the source ' +
            'answered with no usable buildable envelope here — the point falls outside an adopted ' +
            'bestemmingsplan, or the plan publishes neither a bouwvlak nor a zone extent carrying a ' +
            'usable maatvoering. This is the source’s answer, not a failed fetch: it will not change ' +
            'on a retry. Rather than fabricate a maximum height or coverage, PRYZM declines to draw a ' +
            'buildable envelope — no number is shown because none can be cited.',
        ordinanceRef: NL_ORDINANCE_REF,
        legallyGrounded: false,
        knownFacts: [...knownFacts],
    };
}
