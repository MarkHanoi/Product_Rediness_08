// LANE E6-PL — THE POLAND COUNTRY ADAPTER (REPORT §J shape; plan Wave E6), built on the
// ESTONIA exemplar (`countryAdapters/ee/`) and deliberately NOT a second adapter idiom
// (C84 EI-9 — one authority per concept): same source rows, same FetchOutcome discipline, same
// R1 referent ladder, same tier-6 UNKNOWN handling, same validity typing.
//
// §J CONFORMANCE MAP (the interface is REPORT §J's TypeScript sketch):
//   country      → 'PL'
//   sources()    → PL_ADAPTER_SOURCES (the thin registry's PL rows BY REFERENCE + the one
//                  adapter-owned APP GML row, carrying its `not-yet-live` status)
//   parcel       → resolvePlParcelById / resolvePlParcelAtWgs84Point (GUGiK ULDK, keyless)
//   buildings    → ABSENT BY DESIGN: BDOT10k's national GeoParquet is registry-documented
//                  (`pl-bdot10k-buildings-geoparquet`) but wiring a DuckDB-over-HTTP reader is
//                  outside this lane's approved scope (E4 control 2). Recorded, not faked.
//   planGeometry → the zones this adapter mints (`mapPlAppGmlDocument` → PlResolvedZone[])
//   rules        → kind 'structured' — resolvePlParcelChain / parsePlPogDocument
//   documents    → app:DokumentFormalny → SiteIntelDocument, but ONLY where the act serves an
//                  `app:lacze` URL; the identity otherwise travels verbatim on every rule's
//                  `source.document`
//   precedence   → PL_APPLICABILITY_LADDER (MPZP → POG → WZ → not-in-RU), DATA + caveat
//   vocabulary   → PL_RULE_VOCABULARY (plRuleMapper.ts)
//
// §SEAM-E1BC-FETCHCHAIN (inherited verbatim from the EE adapter's header): REPORT §J sketches
// `rules.fetch(parcel): FetchOutcome<Rule[]>`; this adapter serves
// `rules.fetchChain(parcelId, deps?, nowIso?): FetchOutcome<PlParcelChain>` for the same reason
// EE does — it carries the minted Plan/Zone referents the R1 contract requires alongside the
// rules. The shared SDK type is E1bc's to mint; a grep on 2026-09-01 still finds no
// `CountryAdapter`/`fetchChain` type outside the two adapter directories, so guessing it here
// would mint a rival core interface from a lane. When it lands, reconcile HERE — never by
// editing core to match an adapter.
//
// ⚠ THE ONE THING TO READ BEFORE USING THIS ADAPTER: `PL_CHAIN_GRADES`. The POG channel is
// IMPLEMENTED and PROVEN on the official ministry artifact, and it is NOT LIVE — Rejestr
// Urbanistyczny publishes no discoverable service before 2026-11-30 (`PL_RU_ENDPOINT_DISCOVERY`
// carries the dated, controlled transcript of the attempt). Every leg says which it is.

import type { SiteIntelSource } from '@pryzm/schemas';
import { PL_ADAPTER_SOURCES } from './plSources.js';
import { PL_APPLICABILITY_LADDER, resolvePlParcelChain } from './plPogChain.js';

/**
 * The assembled PL country adapter — the §J shape as a value (the EE pattern). The shared SDK
 * *type* is roadmap item 3, NOT this lane's to mint: see §SEAM-E1BC-FETCHCHAIN above before
 * "reconciling" this.
 */
export const plCountryAdapter = {
    country: 'PL' as const,
    sources: (): readonly SiteIntelSource[] => PL_ADAPTER_SOURCES,
    rules: { kind: 'structured' as const, fetchChain: resolvePlParcelChain },
    precedence: PL_APPLICABILITY_LADDER,
};

export { POLAND_BBOX, isInPoland } from './plJurisdiction.js';
export {
    PL_ADAPTER_OWN_SOURCES,
    PL_ADAPTER_SOURCES,
    PL_ADAPTER_STATUS_NOT_YET_LIVE,
    PL_APP_GML_SOURCE_ID,
    PL_RU_ENDPOINT_DISCOVERY,
    PL_RU_TRANSITION_ENDS,
    PL_ULDK_SOURCE_ID,
} from './plSources.js';
export {
    PL_NATIVE_CRS,
    PL_PARCEL_PROVIDER_ID,
    PL_PARCEL_PROVIDER_LABEL,
    PL_ULDK_BASE,
    PL_ULDK_RESULT_FIELDS,
    buildUldkByIdUrl,
    buildUldkByXyUrl,
    parsePlSridPolygon,
    parsePlUldkRecord,
    plUldkGet,
    resolvePlParcelAtWgs84Point,
    resolvePlParcelById,
    type PlCadastralParcel,
    type PlUldkDeps,
} from './plUldkClient.js';
export {
    PL_ACT_STATUS_CODELIST,
    PL_ACT_STATUS_IN_FORCE,
    PL_RULE_AUTHORITY,
    PL_RULE_DATASET,
    PL_RULE_VOCABULARY,
    PL_VALUE_BASIS_SCHEME,
    mapPlAktToPlanContext,
    mapPlDokumentToDocument,
    mapPlStrefaToRules,
    plCodeTail,
    plCrsFromSrsName,
    plDocumentEntityId,
    plGeometryOf,
    plHrefMatchesIip,
    plIipIdentity,
    plPlanEntityId,
    plZoneEntityId,
    type PlMappedZone,
    type PlPlanContext,
    type PlRuleVocabularyEntry,
} from './plRuleMapper.js';
export {
    PL_APPLICABILITY_LADDER,
    PL_CHAIN_GRADES,
    PL_POG_NOT_YET_LIVE_REASON,
    defaultPlStrefaLocator,
    fetchPlPogDocument,
    mapPlAppGmlDocument,
    parsePlPogDocument,
    resolvePlParcelChain,
    resolvePlZoneAtParcel,
    type PlChainDeps,
    type PlParcelChain,
    type PlPogDeps,
    type PlPogRuleSet,
    type PlResolvedZone,
    type PlStrefaLocator,
    type PlUnmappedFeatureClass,
} from './plPogChain.js';
