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
//      `BCN_REFOS_OV_CERTIFIED` (default OFF, `bcnRefosOVProvider.ts`). While the gate is closed the
//      dispatcher shows the existing cited refusal and never reaches this pack.
//   2. The Refós is a *transcripció* with a provenance ceiling. The spike's ceiling revision is
//      explicitly CONDITIONAL on L-449 certifying its vintage — so nothing renders until a human
//      signs off, and even then at `estimated-ruleset` (a constructed envelope, NEVER `structured`),
//      with a caveat naming the AMB Refós source.
//
// ⇒ Every numeric field below is `null` — not "to be filled later", but "this zone does not STATE
//    them; its geometry is the rule, and the floor count is resolved live by `resolveBcnRefosOV`".
//
// Confidence: `estimated-ruleset` — a pack cannot self-certify, and the Refós is a re-edition whose
// vintage is uncertified. The footprint is live published DATA, but the height is a floors→metres
// convention (Art. 327.2 storey module) applied to a sourced floor count, not a sourced height.
//
// PURE + deterministic (C58 §1.1). Strategic context: C58 §1.2/§1.4/§1.11/§2.2, ADR-0270,
// `findings/BARCELONA-GIS-AUDIT-SPIKE.md`, L-449, L-590h.

import {
    JurisdictionZoningContractSchema,
    type JurisdictionZoningContract,
    type GeometricRule,
} from '@pryzm/schemas';
import { BCN_REFOS_OV_RING_REF } from '../providers/bcnRefosOVProvider.js';

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
    '⚠ The Refós is a transcripció gràfica i alfanumèrica (a re-edition); its vintage/authority is ' +
    'UNCERTIFIED (L-449 gate `BCN_REFOS_OV_CERTIFIED`). Source: findings/BARCELONA-GIS-AUDIT-SPIKE.md.';

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
