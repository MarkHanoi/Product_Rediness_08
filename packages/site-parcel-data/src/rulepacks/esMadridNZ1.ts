// L-608 — Madrid (INE 28079) rule pack, Norma Zonal 1 (Protección del Patrimonio Histórico).
//
// ⚠⚠ THIS PACK IS A DECLARATION, NOT A SOLVE. IT IS DELIBERATELY **UNREGISTERED** AND CANNOT
//     PRODUCE AN ENVELOPE YET. Read this whole header before touching it or the registry.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS AT ALL — the first real use of `explicit-area` (C58 §2.2)
// ═════════════════════════════════════════════════════════════════════════════════════════════
// Every geometricRule kind shipped so far erodes or clips a parcel from PARAMETERS. Madrid NZ 1 is
// the case ADR-0270 anticipated but nothing had exercised: the ordinance **publishes the buildable
// footprint DIRECTLY as geometry**, so transcribing it into parameters would be a lossy
// re-derivation of something already authoritative. Verified LIVE 2026-07-23 (see
// `docs/04-reference/jurisdictions/es/es-md/28079-madrid/sources/SOURCES.md` §A):
//
//   sigma.madrid.es/hosted/rest/services/PGOUM97/PG_CONDICIONES_EDIFICACION/MapServer
//     • layer 2  "Fondo de la Edificación"   (polyline) — the rear buildable-depth line
//     • layer 6  "Condiciones de la Edificación" (polygon) — carries COEF_Z (Coeficiente Z, the
//                weighted edificabilidad), COND_EDIF (grado), CODMANZANA (the key it is per)
//     • layer 1  "Ficha Específica"          (point)    — parcels with individually-defined conditions
//     • layer 10 "Fondo"                     (polygon)  — candidate closed buildable area
//
// So `ExplicitAreaRuleSchema` — whose own docstring names *"Madrid's Fondo de la Edificación
// polyline"* — is the correct and only honest kind here.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// WHY IT DOES NOT SOLVE, AND WHY THAT IS THE SAFE STATE (C58 §2.2 KG-4)
// ═════════════════════════════════════════════════════════════════════════════════════════════
//   1. THE ENGINE HAS NO `explicit-area` BRANCH. The solver's discriminated-union switch is
//      exhaustive, so wiring this pack into the registry would be a COMPILE error until the branch
//      exists — which is the designed-in safety gate, not a bug to work around. Do NOT add a
//      no-op branch to silence it.
//   2. THE ringRef RESOLVER DOES NOT EXIST. `ringRef` names a provider-side resolver that must
//      turn the published geometry into a closed buildable RING for the clicked parcel (design:
//      `findings/L-608-MADRID-PACK-SPEC.md` §4). `Fondo de la Edificación` is a POLYLINE (rear
//      line), not a closed ring — the resolver closes it against the Alineaciones (front) or reads
//      the layer-6/10 polygon; which is correct is UNVERIFIED.
//   3. `COEF_Z` IS PER-MANZANA (block granularity, C58 §1.11) AND TYPED **String** — its numeric
//      parse is UNVERIFIED. It is NOT a zone constant, so it is NOT set on the zone here; it is
//      resolved live per manzana by the (future) resolver, under assertion, refusing on an
//      unparseable code rather than defaulting to zero.
//
// ⇒ Every numeric field below is `null` — not "to be filled later", but "this zone does not state
//    them; its geometry IS the rule, and the geometry is resolved externally".
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// WIRING TODO (orchestrator) — DO NOT DO THIS FROM AN IMPLEMENTER AGENT
// ═════════════════════════════════════════════════════════════════════════════════════════════
//   This file is intentionally NOT imported by `registry.ts` or `index.ts` (the L-608 hard
//   constraint, and the KG-4 compile gate). Registration is unlocked only AFTER, in one unit:
//     (a) the engine grows a `solveExplicitArea(parcel, ring)` branch;
//     (b) a provider `resolveMadridNZ1Ring(codManzana)` closes the published geometry into a ring;
//     (c) `COEF_Z` parsing + granularity=`block` handling is verified (SOURCES.md §A caveat 1);
//     (d) the L-449 human-verification gate (VERIFICATION.md) is signed.
//   Then: add a Madrid `JurisdictionRegistration` (extent = a Madrid bbox + `contains` predicate),
//   register `[ES_MADRID_NZ1_PACK, MADRID_NZ1_ZONE_CODES]` in its `packsByZone`, and add a Madrid
//   `refusalFor` covering NZ 3 (`derived-plan`) and the derived-ámbito land.
//
// Confidence: `estimated-ruleset` — a pack cannot self-certify, and although NZ 1's footprint is
// live published DATA (which would earn `structured` per-field once solved), NOTHING here is
// certified and the geometry is not yet resolved. The zone-code(s) this pack answers for are still
// UNVERIFIED against the live calificación plane (that service was down this pass).
//
// PURE + deterministic (C58 §1.1). Strategic context: C58 §1.2/§1.4/§1.11/§2.2 (KG-4), ADR-0270,
// docs/04-reference/jurisdictions/es/es-md/28079-madrid/.

import {
    JurisdictionZoningContractSchema,
    type JurisdictionZoningContract,
    type GeometricRule,
    type EnvelopeRefusal,
} from '@pryzm/schemas';

/** The jurisdiction id Madrid packs and records use — equals the folder identity (playbook §2). */
export const MADRID_JURISDICTION_ID = 'es-28079-madrid';

/**
 * The governing citation carried on every value in this pack.
 */
export const MADRID_NZ1_ORDINANCE_REF =
    'PGOUM-97 (Plan General de Ordenación Urbana de Madrid, BOE 19-04-1997), Normas Urbanísticas ' +
    'Cap. 8.1 — Norma Zonal 1 "Protección del Patrimonio Histórico"; living text = Compendio de ' +
    'las Normas Urbanísticas, Compendio 2023. The buildable footprint (Fondo de la Edificación) ' +
    'and the weighted edificabilidad (COEF_Z) are PUBLISHED AS GEOMETRY on the municipal ArcGIS ' +
    'plane sigma.madrid.es/.../PGOUM97/PG_CONDICIONES_EDIFICACION (verified live 2026-07-23), which ' +
    'is why this zone is modelled as explicit-area rather than transcribed into parameters.';

/**
 * The NZ 1 geometric rule. `explicit-area` carries ONLY a `ringRef`: the geometry is resolved at
 * the provider boundary (ADR-0270 / ExplicitAreaRuleSchema), never inlined here.
 *
 * ⚠ NO ENGINE BRANCH SOLVES THIS YET (C58 §2.2 KG-4). The ringRef resolver is designed in
 * `findings/L-608-MADRID-PACK-SPEC.md` §4 and does not exist. The handle is versioned so the
 * pack stays diffable when the source vintage changes.
 */
export const MADRID_NZ1_RULE: GeometricRule = {
    kind: 'explicit-area',
    // Provider-side resolver handle over the PG_CONDICIONES_EDIFICACION layers (fondo polyline +
    // condiciones/fondo polygon + alineaciones). Resolves the buildable ring per manzana.
    ringRef: 'madrid-nz1:fondo-condiciones/v-2023',
};

/**
 * Norma Zonal 1. Every numeric field is `null` — the zone's geometry IS its rule and is resolved
 * externally; `COEF_Z` is per-manzana live data, not a zone constant (see header §3).
 *
 * `permittedUse: ['residential']` is the grado-1º qualified use (NNUU Cap. 8.1 / the 2016 Cap. 8.3
 * regime). ⚠ Currently SECONDARY-sourced (COAM); re-cite to the Compendio 2023 before this earns
 * anything better than the amber estimate badge (SOURCES.md §B).
 */
function madridNZ1Zone(code: string) {
    return {
        code,
        label: 'Norma Zonal 1 — Protección del Patrimonio Histórico',
        permittedUse: ['residential'] as const,
        // NULL, every one — see the header. Not "to be filled later".
        maxHeight_m: null,
        maxFloors: null,
        plotRatioFAR: null,   // COEF_Z is per-manzana live data, resolved by the ring resolver.
        maxCoverage: null,
        setbacks: { front_m: null, side_m: null, rear_m: null },
        geometricRule: MADRID_NZ1_RULE,
        fieldProvenance: {
            // The footprint is live published geometry (published-structured once solved); the
            // permitted use is still ordinance-pdf/secondary. Nothing here is a green chip yet.
            permittedUse: 'ordinance-pdf' as const,
        },
        ordinanceRef: MADRID_NZ1_ORDINANCE_REF,
    };
}

/**
 * The zone code(s) this pack answers for — VERIFIED by the MADRID-DATA-RECON-SPIKE (2026-07-24, §2).
 *
 * The Norma-Zonal code is a `<zona>.<grado>` string served by the master calificación layer
 * `DESARROLLO_URBANO_ACTUALIZADO/NORMAS_ZONALES/MapServer/0.AMB_TX_ETIQ`, and Norma Zonal 1 is the
 * set `"1.1" … "1.6"` (the six grados). The routing predicate is `AMB_TX_ETIQ.startsWith('1.')`.
 * This REPLACES the old `'NZ1'` placeholder (the recon overturned the "code unknown / service 500"
 * state that placeholder was pinned to). NZ 4/8/5/7 (`"4"`, `"8.*"`, `"5.*"`, `"7.*"`) are NOT NZ 1
 * and stay refusing — they are not answered by this pack.
 *
 * ⚠ Each grado shares the SAME `explicit-area` rule: NZ 1's buildability is the PUBLISHED footprint,
 * identical in kind across grados 1–6 (the geometry IS the rule), so one zone per code carries the
 * same `MADRID_NZ1_RULE`. Registration under these codes is still gated by `MADRID_NZ1_CERTIFIED`
 * (default OFF, `resolveMadridNZ1Ring.ts`): while closed, the dispatcher renders the cited refusal.
 */
export const MADRID_NZ1_ZONE_CODES = ['1.1', '1.2', '1.3', '1.4', '1.5', '1.6'] as const;

/**
 * The routing PREFIX for the Norma Zonal 1 family, as the docstring above states it
 * (*"the routing predicate is `AMB_TX_ETIQ.startsWith('1.')`"*).
 *
 * ⚠ Exported so the registry and the L5 dispatcher route on the SAME constant rather than each
 * restating a `'1.'` literal — the rule the extent/predicate pairing already follows. It is
 * DELIBERATELY a prefix and not the six-code enumeration: if the municipal layer ever publishes a
 * seventh grado, an enumeration would silently send an NZ-1 parcel to the coverage-gap card, whereas
 * a prefix keeps it on NZ 1's settled explicit-area answer.
 */
export const MADRID_NZ1_CODE_PREFIX = '1.' as const;

/**
 * The Madrid Norma Zonal 1 pack. `defaultConfidence: 'estimated-ruleset'` — see header. This pack
 * is a DECLARATION of the `explicit-area` kind + its ringRef; each grado (`1.1`…`1.6`) carries the
 * SAME rule because the geometry is the rule. It renders only when `MADRID_NZ1_CERTIFIED` is signed.
 */
export const ES_MADRID_NZ1_PACK: JurisdictionZoningContract =
    JurisdictionZoningContractSchema.parse({
        jurisdictionId: MADRID_JURISDICTION_ID,
        displayName: 'Madrid — Norma Zonal 1 (PGOUM-97, patrimonio histórico)',
        source: 'madrid-pgou',
        crs: 'EPSG:25830', // the municipal ArcGIS planes publish in UTM 30N / ETRS89.
        lastReviewed: '2026-07-24',
        defaultConfidence: 'estimated-ruleset',
        zones: MADRID_NZ1_ZONE_CODES.map((code) => madridNZ1Zone(code)),
    });

/**
 * L-608 / STRUCTURAL-SEAM-4 — the Madrid NZ 1 TRANSIENT refusal: PRYZM holds the rule and the
 * footprint IS published, but the municipal source did not answer for this parcel (the sigma.madrid.es
 * PG_CONDICIONES_EDIFICACION plane returned HTTP 500 in recon, 2026-07-23). This is NOT "no footprint
 * here" and NOT "Madrid is not available yet" — it is a fetch that failed and will be retried.
 *
 * ⚠ RECONCILED 2026-07-27 (was worded "could not be resolved … yet", implying a permanent
 * coming-soon, and used indiscriminately for BOTH the HTTP failure AND a genuine no-footprint point).
 * With `MADRID_NZ1_CERTIFIED = true` (L-608 sign-off) and the same-origin `/api/madrid/condiciones`
 * proxy wired (returning 502 on upstream failure, 200-empty on a genuine miss), the two cases are now
 * DISTINCT: this builder is the TRANSIENT (`source-data-unavailable`) case — the dispatcher only
 * reaches it after the bounded auto-retry still failed, so the copy says "temporarily unreachable —
 * retrying". A genuine no-footprint point uses `madridNZ1AbsentRefusal` (`no-plan-at-point`) instead.
 *
 * `code: 'source-data-unavailable'` (transient, retry-honest): PRYZM HOLDS the rule (this
 * explicit-area declaration + `resolveMadridNZ1Ring`), and the fetch of the published footprint did
 * not complete. `legallyGrounded: false` — the LAW is known; what failed is our data path, a
 * statement about PRYZM's inputs, not the ordinance. `ordinanceRef` cites PGOUM-97 for the one LEGAL
 * claim we make (that NZ 1 is published as geometry), never for a number.
 */
export function madridNZ1Refusal(knownFacts: readonly string[] = []): EnvelopeRefusal {
    return {
        code: 'source-data-unavailable',
        headline:
            'Madrid Norma Zonal 1 — the municipal source was temporarily unreachable for this parcel.',
        detail:
            'PRYZM models Madrid NZ 1 (PGOUM-97, protección del patrimonio histórico) as an ' +
            'explicit-area zone: the ordinance publishes the buildable footprint (Fondo de la ' +
            'Edificación) and the weighted edificabilidad (COEF_Z) directly as GEOMETRY on the ' +
            'municipal ArcGIS plane, rather than as setback distances. That footprint is fetched ' +
            'live for your manzana, and the municipal service did not answer this time (it has been ' +
            'retried automatically). This is a temporary outage of the source, NOT a statement that ' +
            'your parcel has no published footprint. Rather than fabricate a setback triple or an ' +
            'edificabilidad, PRYZM declines to draw a buildable envelope — no number is shown ' +
            'because none can be cited. Re-select the parcel to try again.',
        ordinanceRef: MADRID_NZ1_ORDINANCE_REF,
        legallyGrounded: false,
        knownFacts: [...knownFacts],
    };
}

/**
 * L-608 / STRUCTURAL-SEAM-4 — the Madrid NZ 1 GENUINE-ABSENCE refusal: the municipal plane ANSWERED
 * and there is no published NZ-1 buildable footprint at this point (the parcel is outside any NZ-1
 * manzana, or the returned geometry was degenerate). A DURABLE fact, not a fetch failure — so
 * `code: 'no-plan-at-point'`, NOT the transient `source-data-unavailable`, and the card offers NO
 * retry (re-asking returns the same empty). This is the other half of the seam-4 split: absent and
 * unreachable are different answers and must never share a card (§CONTEXT-DATA-HONESTY, L-422/457/469).
 */
export function madridNZ1AbsentRefusal(knownFacts: readonly string[] = []): EnvelopeRefusal {
    return {
        code: 'no-plan-at-point',
        headline:
            'Madrid Norma Zonal 1 — no published buildable footprint at this point.',
        detail:
            'PRYZM queried the municipal PGOUM-97 PG_CONDICIONES_EDIFICACION plane at this parcel and ' +
            'the source answered with no NZ-1 buildable footprint (Fondo de la Edificación) here — ' +
            'the point falls outside any NZ-1 manzana the plane publishes, or the returned geometry ' +
            'was not a usable ring. This is the source’s answer, not a failed fetch: it will not ' +
            'change on a retry. PRYZM declines to draw a buildable envelope rather than fabricate one.',
        ordinanceRef: MADRID_NZ1_ORDINANCE_REF,
        legallyGrounded: false,
        knownFacts: [...knownFacts],
    };
}
