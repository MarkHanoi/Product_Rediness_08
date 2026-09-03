// LANE HR — THE CROATIA COUNTRY ADAPTER (REPORT §J shape), on the sibling shape the EE adapter
// established: "Core stays country-agnostic; ONLY adapters know sources, schemas, semantics,
// documents." This module assembles the HR arms into the §J shape.
//
// §J CONFORMANCE MAP:
//   country      → 'HR'
//   sources()    → HR_SOURCES (typed SiteIntelSource rows, dated probe logs)
//   parcel       → resolveHrParcelAtWgs84Point (DGU/Uređena zemlja cp_wms:CP.CadastralParcel, keyless)
//   planGeometry → NONE machine-readable at parcel grain. The national construction-area WFS
//                  (gis4.mgipu.hr Građevinska područja, 89,911 polygons) is SCREENING-GRADE
//                  envelope geometry (register: "ne smiju [se] koristiti u svrhu izdavanja akata")
//                  — recorded in HR_SOURCES for the rule-pack lane, NOT consumed here.
//   rules        → kind: 'none' — HR has NO machine-readable rule pack (HR_NO_RULE_PACK_CAVEAT).
//                  Croatia's numeric provisions (odredbe za provođenje) are per-plan PDF; plan
//                  CONTENT is served as raster (PPRaster* county WMS). This is the HONEST
//                  no-rule-pack path, not a stub that pretends structure exists.
//   documents    → none minted (no structured rule cites a document at parcel grain yet).
//   precedence   → n/a (no rule ladder without a rule pack).
//
// §SEAM-E1BC-FETCHCHAIN (the EE seam): REPORT §J sketches `rules.fetch(parcel)`. HR has no rules
// leg to serve, so the adapter exposes ONLY the parcel provider under §J; when a Croatia rule pack
// is authored (PDF-extraction lane), it reconciles HERE, never by editing core.
//
// Everything is FetchOutcome end-to-end (C57 §1.5): empty and failure are DIFFERENT values.

import { type FetchOutcome, type SiteIntelSource } from '@pryzm/schemas';
import { resolveHrParcelAtWgs84Point, type HrCadastralParcel } from './hrParcelProvider.js';
import { HR_SOURCES } from './hrSources.js';

/**
 * Why HR carries NO rule pack, stated as data so silence is never read as "no rules exist".
 * Croatia DOES aggregate spatial plans nationally (rare in the region — ISPU), but the numeric
 * envelope provisions (odredbe za provođenje) remain per-plan PDF, and plan CONTENT is served as
 * scanned raster (the county PPRaster* WMS). The one national machine-readable geometry — MGIPU's
 * Građevinska područja — is a SCREENING-GRADE buildable/non-buildable mask (a first gate), never
 * the legal envelope. So there is nothing to map to structured rules at parcel grain today.
 */
export const HR_NO_RULE_PACK_CAVEAT =
    'Croatia has no machine-readable rule pack at parcel grain: numeric provisions (odredbe za ' +
    'provođenje) are per-plan PDF and plan content is raster (county PPRaster* WMS). The national ' +
    'Građevinska područja WFS is a SCREENING-GRADE buildable mask (register: not for issuing acts), ' +
    'not a rule source. Authoring one is a PDF-extraction lane (sweep tier 2).';

/**
 * The assembled HR country adapter — the §J shape as a value. Field-for-field mapping to the
 * REPORT §J sketch is in the header comment. The shared SDK *type* is not this lane's to mint (the
 * EE §SEAM-E1BC-FETCHCHAIN note: grep finds no `CountryAdapter` type outside the adapter dirs);
 * `rules.kind: 'none'` is the honest marker for a country with no structured rules yet.
 */
export const hrCountryAdapter = {
    country: 'HR' as const,
    sources: (): readonly SiteIntelSource[] => HR_SOURCES,
    parcel: {
        resolveAtWgs84Point: (
            lat: number,
            lon: number,
        ): Promise<FetchOutcome<HrCadastralParcel>> => resolveHrParcelAtWgs84Point(lat, lon),
    },
    rules: { kind: 'none' as const, reason: HR_NO_RULE_PACK_CAVEAT },
};

// ── Curated re-export surface (the EE style; DK's `export *` is the recorded odd one out,
//    L-12875). Every name is Hr/HR_-prefixed, so the src/index.ts barrel wildcard cannot collide. ─
export { CROATIA_BBOX, isInCroatia } from './hrJurisdiction.js';
export {
    HR_CP_WFS_BASE,
    HR_NATIVE_CRS,
    HR_PARCEL_LAYER,
    HR_ZONING_LAYER,
    HR_WGS84_URN,
    buildHrWgs84BboxUrl,
    extractOwsExceptionText,
    hrWfsGetFeatures,
    type HrWfsDeps,
    type HrWfsFeature,
} from './hrWfsClient.js';
export {
    HR_PARCEL_PROVIDER_ID,
    HR_PARCEL_PROVIDER_LABEL,
    parseHrParcelFeature,
    resolveHrParcelAtWgs84Point,
    type HrCadastralParcel,
} from './hrParcelProvider.js';
export { HR_PARCEL_SOURCE_ID, HR_SOURCES } from './hrSources.js';
