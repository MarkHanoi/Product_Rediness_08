// LANE RO — THE ROMANIA COUNTRY ADAPTER (REPORT §J shape). Assembles the RO arms into the §J shape
// the EE adapter established (mirror the proven executor, no rival). Romania is a TWO-GATE DECLARED
// DEFERRAL, and the shape is the point — the adapter states exactly what is and is not reachable:
//
//   GATE 1 (SERVICE)      — ANCPI geoportal host NXDOMAIN (roAncpiGate.ts). No served bytes.
//   GATE 2 (JURISDICTION) — ROU absent from the national boundary set (roJurisdiction.ts). No claim.
//
// Either gate alone keeps the RO parcel row DORMANT; both are open today. The registry row is
// written in its FINAL form so that clearing the gates is a single-line flip (roJurisdiction.ts
// header): add ROU to the resolver and re-point the host, and Romanian clicks route + resolve with
// no change here.
//
// §J CONFORMANCE MAP:
//   country      → 'RO'
//   sources()    → RO_SOURCES (1 row: the ANCPI cadastre, DEFERRED, with the NXDOMAIN probe log)
//   parcel       → resolveRoParcelByInspireId / resolveRoParcelAtWgs84Point   ⛔ DEFERRED (GATE 1)
//   planGeometry → none — Romania serves no national plan geometry (PUG/PUZ stock is CAD/PDF)
//   rules        → kind: 'deferred' — the HONEST NO-RULE-PACK path (see below); no rule mapper
//   documents    → none served for the structured path (the 2024 GIS-PUG standard is emerging)
//   precedence   → RO_APPLICABILITY_LADDER, recorded as DATA with its honest caveats
//   vocabulary   → none (no structured rule channel to map yet)
//
// ⛔ WHY NO RULE MAPPER (the honest no-rule-pack path, per this lane's brief). The rest-of-europe
// sweep verified NO rules channel serving normative envelope parameters per parcel. Romania's
// planning stock (PUG/PUZ/PUD) is CAD/PDF per municipality; MDLPA's Date Locale platform publishes
// a GIS-PUG technical standard (v1.1, 15.07.2024, datelocale.mdlpa.ro/ro/about/tehnic_planurb/ —
// census-verified HTTP 200 2026-09-02) that PRESCRIBES structured slots (regim de înălțime / POT /
// CUT / aliniament) for NEW plans, but serves no plan geometry yet, and no standard-conformant
// PUG-GIS package has been observed served. A rule mapper stub is justified ONLY where a real rules
// channel was sweep-verified; there is none, so this adapter mints no rules and says so — never a
// speculative vocabulary built from a standard document ([[fake-more-capable-than-real]]).
//
// ⛔ C74 §3.8 — THE UNWIRED IS DECLARED IN THE BARREL, NOT ONLY IN THE FILES. `RO_DEFERRED_LEGS`
// below is the machine-readable list of everything in this directory that looks callable and
// deliberately refuses ([[committed-is-not-reachable]]).

// Only the names the ADAPTER VALUE below consumes are imported; everything else in this
// directory reaches consumers through the re-export blocks at the bottom (the root tsc is
// stricter than the package one — an import used only by a re-export is an unused local there).
import type { SiteIntelSource } from '@pryzm/schemas';
import {
    resolveRoParcelAtWgs84Point,
    resolveRoParcelByInspireId,
} from './roParcelProvider.js';
import { RO_SOURCES } from './roSources.js';

/**
 * §J `precedence: ApplicabilityLadder` — Romania's, as DATA. It exists in LAW (PUG → PUZ → PUD,
 * with RLU regulations and POT/CUT indices) but NOT as machine-readable geometry today, so no rung
 * is emitted as a per-rule R1 rank — recording the ladder here and refusing to fake a per-rule value
 * is the distinction between "no ladder exists" and "the ladder exists but is adapter data".
 */
export const RO_APPLICABILITY_LADDER = [
    {
        step: 'PUZ / PUD (zonal / detail urban plan) — the most specific binding instrument',
        mode:
            'DOCUMENT-BOUND (RLU regulament local de urbanism, POT/CUT indices, regim de înălțime, ' +
            'aliniament) as CAD/PDF per municipality. NOT REACHABLE as geometry — no national channel.',
    },
    {
        step: 'PUG (general urban plan) — the municipal comprehensive plan + RLU',
        mode:
            'DOCUMENT-BOUND today. The MDLPA GIS-PUG standard (v1.1, 2024-07-15) prescribes structured ' +
            'slots for NEW/updated plans; stock stays CAD/PDF. Watch: first standard-conformant PUG-GIS ' +
            'package becomes consumable (source-class upgrade path).',
    },
    {
        step: 'national norms (Legea 350/2001, RGU) — defaults where the plan is silent',
        mode: 'LEGAL-TEXT. Not consumed by this lane (control: recorded, not scoped).',
    },
    {
        step: 'not-in-cadastre disambiguation',
        mode:
            'absent from ANCPI ≠ no parcel: systematic land registration is INCOMPLETE nationally, so ' +
            'an AOI may have no cadastral polygon while a real parcel exists — a registration-coverage ' +
            'fact, never "no land here".',
    },
] as const;

/**
 * C74 §3.8 — every export in this directory that is callable and deliberately refuses, with the
 * reason and the endpoint. A test asserts each one actually refuses, so this list cannot drift into
 * a stale claim of deferral for something that has since been wired (or the reverse).
 */
export const RO_DEFERRED_LEGS = [
    { leg: 'parcel by INSPIRE_ID', fn: 'resolveRoParcelByInspireId' },
    { leg: 'parcel at WGS84 point', fn: 'resolveRoParcelAtWgs84Point' },
] as const;

/**
 * The assembled RO country adapter — the §J shape as a value. `rules.kind: 'deferred'` is the
 * honest no-rule-pack path (fr/index.ts uses the same token for a non-structured rules leg): there
 * is no structured rules channel to fetch, and this adapter refuses to invent one. When the E1bc
 * SDK `CountryAdapter` type lands, reconcile HERE (rename/wrap), never by editing core to match an
 * adapter (§SEAM-E1BC-FETCHCHAIN, ee/index.ts).
 */
export const roCountryAdapter = {
    country: 'RO' as const,
    sources: (): readonly SiteIntelSource[] => RO_SOURCES,
    parcel: {
        byNationalId: resolveRoParcelByInspireId,
        atPoint: resolveRoParcelAtWgs84Point,
    },
    rules: {
        kind: 'deferred' as const,
        reason:
            'no national machine-readable rules channel: PUG/PUZ/PUD stock is CAD/PDF; the 2024 ' +
            'GIS-PUG standard is emerging and serves no plan geometry yet.',
    },
    precedence: RO_APPLICABILITY_LADDER,
};

export {
    ROMANIA_BBOX,
    RO_JURISDICTION_DEFERRAL,
    claimsRomania,
    isInRomania,
} from './roJurisdiction.js';
export {
    RO_ANCPI_DEFERRAL,
    RO_ANCPI_DEFERRED_TOKEN,
    RO_ANCPI_ENDPOINTS,
    RO_ANCPI_INSPIRE_ID_FIELD,
    assertRoAncpiDeferralNotExpired,
    roAncpiDeferredRefusal,
} from './roAncpiGate.js';
export {
    RO_PARCEL_PROVIDER_ID,
    RO_PARCEL_PROVIDER_LABEL,
    resolveRoParcelAtWgs84Point,
    resolveRoParcelByInspireId,
    type RoCadastralParcel,
} from './roParcelProvider.js';
export { RO_ANCPI_SOURCE_ID, RO_SOURCES } from './roSources.js';
