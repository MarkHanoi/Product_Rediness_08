// BARCELONA-GIS-AUDIT-SPIKE — Barcelona clau 18 (*ordenació en volumetria específica*), the second
// real use of `explicit-area` (after Madrid NZ 1).
//
// ⚠⚠ THIS PACK IS A DECLARATION, AND IT IS DELIBERATELY **UNREGISTERED**. It does NOT flip clau 18's
//    refusal. Read this header before touching it or the registry.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// clau 18 (22.5 % of Barcelona's private buildable land) is a PERMANENT refusal in the classification
// table (`esBarcelonaZoneClassification.ts`, code `derived-plan`): PGM Art. 306 points buildability
// at *"the established volumetric ordering"*, a per-site document PRYZM was assumed not to hold. The
// GIS audit (`findings/BARCELONA-GIS-AUDIT-SPIKE.md`, 2026-07-24) found the AMB has ALREADY vectorised
// that ordering and publishes it as queryable geometry (`OV_Trames`: a closed volumetric footprint +
// a `PLANTES` floor count, 100 % populated over 5 073 Barcelona polygons). So the honest kind is
// `explicit-area` — the footprint IS the rule, resolved at the provider boundary — exactly as for
// Madrid's `Fondo de la Edificación`.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY IT DOES NOT REGISTER, AND WHY THAT IS THE SAFE STATE
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   1. clau 18 stays a refusal in `resolveZoneDisposition` — the classification table refuses it,
//      and this file is NOT imported by `registry.ts`. The clau-18 render path is a SEPARATE branch
//      in the L5 dispatcher (mirroring Madrid's `applyMadridZoningThenFallback`), gated on
//      `BCN_REFOS_OV_CERTIFIED` (`bcnRefosOVProvider.ts` — SIGNED, SIG-3, 2026-08-01). While the
//      gate is closed the dispatcher shows the existing cited refusal and never reaches this pack.
//   2. The Refós is a *transcripció* with a provenance ceiling. The spike's ceiling revision was
//      explicitly CONDITIONAL on L-449 certifying its vintage — nothing rendered until the founder
//      signed (SIG-3). §BCN-OV-CONFIDENCE (L-1660): the DETERMINATION is engine-stamped (§L-572)
//      `block-constructed` when the Art. 327.2 conversion is table-exact (SIG-5, 2026-08-21) and
//      stays `estimated-ruleset` when extrapolated — NEVER `structured` — with a caveat naming the
//      AMB Refós source. The PACK seed below stays `estimated-ruleset`: a pack cannot self-certify.
//
// ⇒ Every numeric field below is `null` — not "to be filled later", but "this zone does not STATE
//    them; its geometry is the rule, and the floor count is resolved live by `resolveBcnRefosOV`".
//
// Confidence: the pack SEED is `estimated-ruleset` — a pack cannot self-certify
// (§PACK-CONFIDENCE-CEILING; `packPublishedConfidenceUnchanged.test.ts` pins it). The per-parcel
// DETERMINATION is engine-stamped `block-constructed` under the SIG-5 declaration when the
// footprint clip succeeds AND the floors→metres conversion is table-exact (§BCN-OV-CONFIDENCE,
// L-1660). The footprint is live published DATA (vintage accepted, SIG-3); the height is a
// floors→metres convention (Art. 327.2 storey module) applied to a sourced floor count.
//
// PURE + deterministic (C58 §1.1). Strategic context: C58 §1.2/§1.4/§1.11/§2.2, ADR-0270,
// `findings/BARCELONA-GIS-AUDIT-SPIKE.md`, L-449, L-590h.

import { trace } from '@opentelemetry/api';
import {
    JurisdictionZoningContractSchema,
    type JurisdictionZoningContract,
    type GeometricRule,
} from '@pryzm/schemas';
import { BCN_REFOS_OV_RING_REF } from '../providers/bcnRefosOVProvider.js';
import type { IneCode } from '../providers/esMunicipalCode.js';

const volumetriaTracer = trace.getTracer('pryzm.zoning.es.amb');

/** The jurisdiction id — the SAME Barcelona id the registry and other BCN packs use. */
export const BCN_JURISDICTION_ID = 'es-08019-barcelona';

/** The MUC clau this pack answers for — `18`, *ordenació en volumetria específica*. */
export const BCN_VOLUMETRIA_18_ZONE_CODE = '18' as const;

/**
 * The governing citation. Names Art. 306 for the ORDINANCE fact (buildability = the approved
 * volumetric ordering) and the AMB Refós for the DATA that supplies it — the honest split, because
 * the number comes from the Refós geometry, not from the PGM prose.
 */
export const BCN_VOLUMETRIA_18_ORDINANCE_REF =
    'PGM-1976 NNUU Art. 306 (Zona subjecta a ordenació volumètrica específica): the buildable volume ' +
    'is that resulting from the approved volumetric ordering for the site, which the PGM points at ' +
    'rather than states. That ordering is PUBLISHED AS GEOMETRY on the AMB "Refós de Planejament" ' +
    'ArcGIS plane (qualificacio_refos_3857, layer OV_Trames: a closed volumetric footprint + a ' +
    'PLANTES floor count), which is why this zone is modelled as explicit-area rather than refused. ' +
    // §BCN-OV-CONFIDENCE (L-1660) — this string used to end "its vintage/authority is UNCERTIFIED
    // (L-449 gate `BCN_REFOS_OV_CERTIFIED`)", which became FALSE on 2026-08-01 when the founder
    // signed SIG-3. This is the citation the card renders; it must not contradict the gate.
    '⚠ The Refós is a transcripció gràfica i alfanumèrica (a re-edition); its vintage was accepted ' +
    'under the recorded L-449 sign-off (SIG-3, founder, 2026-08-01 — `BCN_REFOS_OV_CERTIFIED`), ' +
    'not certified by the publisher. Source: findings/BARCELONA-GIS-AUDIT-SPIKE.md.';

/**
 * The clau-18 geometric rule. `explicit-area` carries ONLY a `ringRef`: the volumetric footprint is
 * resolved at the provider boundary (`resolveBcnRefosOV`), never inlined. The handle is versioned so
 * a Refós vintage change is a diff, and it is asserted equal to `BCN_REFOS_OV_RING_REF` in the
 * resolver so a drift refuses rather than resolves against the wrong plane.
 */
export const BCN_VOLUMETRIA_18_RULE: GeometricRule = {
    kind: 'explicit-area',
    ringRef: BCN_REFOS_OV_RING_REF,
};

/**
 * clau 18. Every numeric field is `null` — the zone's geometry IS its rule and is resolved
 * externally; the floor count (and the height derived from it) are attached by the dispatcher from
 * the live `OV_Trames` PLANTES, under the certification gate.
 */
function volumetria18Zone(code: string) {
    return {
        code,
        label: 'Ordenació en volumetria específica (clau 18)',
        permittedUse: ['residential'] as const,
        // NULL, every one — see the header. Not "to be filled later".
        maxHeight_m: null,
        maxFloors: null,
        plotRatioFAR: null,
        maxCoverage: null,
        setbacks: { front_m: null, side_m: null, rear_m: null },
        geometricRule: BCN_VOLUMETRIA_18_RULE,
        fieldProvenance: {
            // The footprint is live published geometry; nothing here is a green chip.
            permittedUse: 'ordinance-pdf' as const,
        },
        ordinanceRef: BCN_VOLUMETRIA_18_ORDINANCE_REF,
    };
}

/**
 * The Barcelona clau-18 volumetric pack. `defaultConfidence: 'estimated-ruleset'` — see header. A
 * DECLARATION of the `explicit-area` kind + its ringRef; the dispatcher solves it against the live
 * OV footprint ONLY when `BCN_REFOS_OV_CERTIFIED` is true.
 */
export const ES_BARCELONA_VOLUMETRIA_18_PACK: JurisdictionZoningContract =
    JurisdictionZoningContractSchema.parse({
        jurisdictionId: BCN_JURISDICTION_ID,
        displayName: 'Barcelona — clau 18 (ordenació en volumetria específica)',
        source: 'catastro-muc',
        crs: 'EPSG:3857', // the AMB Refós OV plane publishes in Web Mercator.
        lastReviewed: '2026-07-24',
        defaultConfidence: 'estimated-ruleset',
        zones: [volumetria18Zone(BCN_VOLUMETRIA_18_ZONE_CODE)],
    });

/** The zone code(s) this pack answers for. */
export const BCN_VOLUMETRIA_18_ZONE_CODES = [BCN_VOLUMETRIA_18_ZONE_CODE] as const;

// ══════════════════════════════════════════════════════════════════════════════════════════════
// §AMB-VOLUMETRIA-18-PACK-RESOLUTION (2026-08-02) — THE THIRD UNBINDING.
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `siteDispatch.ts` used to name `ES_BARCELONA_VOLUMETRIA_18_PACK` as a CONSTANT on the clau-18
// path. Once the OV resolver became metropolitan, that constant was the remaining Barcelona bind:
// a Sant Boi parcel routed down the same branch would have been handed a pack whose
// `jurisdictionId` is `es-08019-barcelona` and whose `ordinanceRef` cites Barcelona — another
// municipality's land answered under Barcelona's citation, which is precisely the §LH-ENVELOPE /
// L-652 mis-citation the registry's specificity rule exists to prevent.
//
// ⇒ The pack is now RESOLVED FROM THE MUNICIPALITY, and the resolution FAILS CLOSED.
//
// ⚠⚠ WHY THIS RETURNS `null` FOR 35 OF 36 MUNICIPALITIES, AND WHY THAT IS NOT A GAP TO FILL.
// The blocker is NOT wiring, and it is NOT the dataset. SIG-3 certifies the Refós DATASET VINTAGE
// across the whole service, so READING Gavà's OV footprint needs no new signature. What is missing
// is the ORDINANCE half:
//
//   • The footprint + PLANTES are metropolitan DATA — transferable.
//   • The CITATION is `PGM-1976 Art. 306`, and Art. 306's metropolitan force is a per-municipality
//     question this repo answers elsewhere: `esAmbPgmScope.ts` records footnote 37 on Art. 306
//     naming **Cerdanyola del Vallès** and **Sant Cugat del Vallès** as having REWRITTEN it. On
//     those two the metropolitan text demonstrably does not govern, so the citation would be false.
//   • And for the other 33, `ambArticleScopeFor` answers `'unknown'` — PRYZM holds no PGM scope
//     record for them at all, and the compendium is expressly non-exhaustive and consolidated only
//     to 31-12-2009. `'unknown'` is not `'unmodified'`.
//   • The floors→metres conversion is PGM Art. 327.2, whose footnote 49 names Badalona AND
//     Barcelona as modifiers — so even the height convention is not uniformly metropolitan.
//
// ⇒ Extending this map is a RESEARCH act (read Art. 306 + Art. 327 scope for that municipality,
//   record it, have a human sign it), never a wiring convenience. An absent envelope costs nothing;
//   a footprint published under the wrong municipality's article costs a fabricated legal claim.

/**
 * The AMB municipalities whose clau-18 volumetric pack PRYZM is authorised to CITE, keyed on INE.
 *
 * Exactly one entry today. See §AMB-VOLUMETRIA-18-PACK-RESOLUTION above before adding a second —
 * the bar is a recorded Art. 306 + Art. 327 scope finding, not a working fetch.
 */
const VOLUMETRIA_18_PACK_BY_INE: ReadonlyMap<string, JurisdictionZoningContract> = new Map([
    ['08019', ES_BARCELONA_VOLUMETRIA_18_PACK],
]);

/**
 * §AMB-VOLUMETRIA-18 — the clau-18 `explicit-area` pack for this municipality, or `null` when PRYZM
 * holds no authorised transcription for it.
 *
 * ⛔ FAILS CLOSED. `null` for every municipality except Barcelona, and the caller must then keep
 * the cited clau-18 refusal — never substitute Barcelona's pack, and never publish a footprint with
 * no citation behind it.
 *
 * ⚠ The argument is the branded `IneCode`, not a string, so a Catastro DGC code cannot select a
 * pack: DGC 08196 (Sant Andreu de Llavaneres) and INE 08196 (Sant Andreu de la Barca) are different
 * municipalities and this map must never be reachable by the wrong vocabulary.
 *
 * P8 — emits `pryzm.zoning.es.amb.volumetria18PackFor`.
 */
export function ambVolumetria18PackFor(ineCode: IneCode): JurisdictionZoningContract | null {
    const span = volumetriaTracer.startSpan('pryzm.zoning.es.amb.volumetria18PackFor');
    try {
        const pack = VOLUMETRIA_18_PACK_BY_INE.get(ineCode as string) ?? null;
        span.setAttribute('ineCode', ineCode as string);
        span.setAttribute('authorised', pack !== null);
        return pack;
    } finally {
        span.end();
    }
}
