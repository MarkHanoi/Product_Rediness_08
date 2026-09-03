// LANE AU-OPEN — THE AUSTRALIA (open states) PARCEL ADAPTER barrel.
//
// Scope: PARCELS for the six open states/territories (NSW · VIC · QLD · SA · TAS · ACT), plus the
// two declared deferrals (WA · NT). This is the light US sub-national idiom (bbox predicate +
// injectable-fetch resolver + pure parse + provider handle), NOT the richer §J CountryAdapter — no
// envelope/rules/buildings arm here. Every export is `Au*`/`AU_*`/`isIn*`-named so a star re-export
// from the package barrel cannot collide.

export {
    // Routing predicates + bboxes (the registry imports the bboxes for REGION_BBOX + the predicates
    // for each row's `contains`).
    type AuBbox,
    type AuRegionCode,
    AU_NSW_BBOX,
    AU_VIC_BBOX,
    AU_QLD_BBOX,
    AU_SA_BBOX,
    AU_TAS_BBOX,
    AU_ACT_BBOX,
    AU_WA_BBOX,
    AU_NT_BBOX,
    isInNsw,
    isInVic,
    isInQld,
    isInSaAu,
    isInTas,
    isInAct,
    isInWa,
    isInNt,
} from './auJurisdiction.js';

export {
    // The shared cadastre client: types, pure parse, the impure resolver, the descriptor table.
    type AuLatLon,
    type AuCadastralRegionCode,
    type AuParcelIdentity,
    type AuParcel,
    type AuParcelRefusalReason,
    type AuParcelResult,
    type AuStateDescriptor,
    type AuCadastreDeps,
    type AuStateParcelProvider,
    AU_SA_REFERER,
    AU_STATE_DESCRIPTORS,
    auAttr,
    auStr,
    auCollapseWs,
    auParseRing,
    auRingAreaM2,
    parseAuFeature,
    parseAuResponse,
    fetchAuParcelAtPoint,
    auStateParcelProvider,
} from './auStateCadastre.js';

export {
    // The typed source registry (per-state provenance + the WA/NT deferral gate transcripts).
    type AuAccessClass,
    type AuSource,
    AU_SOURCES,
    AU_DEFERRALS,
} from './auSources.js';
