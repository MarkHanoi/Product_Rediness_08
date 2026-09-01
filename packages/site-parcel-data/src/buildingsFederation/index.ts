// LANE FED (E5 partial · DECISION-SUMMARY row 2) — buildings-federation scaffold barrel.
// The four pieces: typed GERS key (+ the published-bridge seam) · source-priority model as
// data · match/dedup/federate · the ODbL separability boundary. See each file's header for
// its audit citations and its measurements.
export { parseGersId, sameGersEntity, type GersBridge, type GersId } from './gersId.js';
export {
    BUILDINGS_FEDERATION_SOURCES,
    FEDERATION_CONFLATION_STRATEGY,
    assertUsableFederationSource,
    conflationStrategyFor,
    federationSourceRow,
    usableLicenceClass,
    type FederationBridgeStatus,
    type FederationConflationRow,
    type FederationConflationStrategy,
    type FederationLicenceClass,
    type FederationSourceId,
    type FederationSourceRole,
    type FederationSourceRow,
    type FederationSourceStatus,
} from './sourcePriority.js';
export {
    FEDERATION_IOU_THRESHOLD,
    candidateBounds,
    federateBuildings,
    federationProvenance,
    geometryIou,
    matchByIdentity,
    matchCandidates,
    type FederateOptions,
    type FederatedBuilding,
    type FederationCandidate,
    type FederationInput,
    type FederationPairNote,
    type FederationProvenanceView,
    type FederationReport,
    type IdentityVerdict,
    type MatchVerdict,
} from './conflate.js';
export {
    addToFederationStore,
    createFederationStore,
    type FederationStore,
    type NonOdblFederatedBuilding,
    type StoreAddOutcome,
    type StoreLicencePolicy,
} from './odblStore.js';
