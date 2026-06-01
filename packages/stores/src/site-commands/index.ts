// A.7.c (Phase A · Sprint 2) — Public surface for `site.*` command
// handlers.
//
// Pure functions: `(payload, store) → SiteCommandResult<Event>`. The
// L5 adapter (command-bus wiring + OTel span + LTP-ENU rebase + domain
// event emit) lives elsewhere (apps/editor or runtime-composer) and
// composes against these handlers.
//
// Slice contents (A.7.c — minimum viable subset for typology Stage 2):
//   - siteCreate                — §4.1 `site.create`
//   - siteUpdateLocation        — §4.1 `site.updateLocation`
//   - siteSetParcelBoundary     — §4.1 `site.setParcelBoundary`
//   - types (payload schemas + event types + result shape)
//
// Deferred to later A.7.c slices (zoning · footprint · context
// buildings · resync · climate/building link · replace):
//   - siteUpdateZoning           — §4.1
//   - siteSetFootprint           — §4.1 + §1.6 containment check
//   - siteClearFootprint         — §4.1
//   - siteAddContextBuilding     — §4.1
//   - siteRemoveContextBuilding  — §4.1
//   - siteReplaceContextBuilding — §4.1
//   - siteResyncContextBuildings — §4.1 (async ingest)
//   - siteLinkClimate            — §4.1
//   - siteLinkBuilding           — §4.1
//   - siteReplace                — §4.1 + §1.4 (whole-site replacement)
//   - siteDelete                 — §4.1 + §1.1 (cascade from project.delete)

export { siteCreate, deterministicSiteId } from './siteCreate.js';
export { siteUpdateLocation } from './siteUpdateLocation.js';
export { siteSetParcelBoundary } from './siteSetParcelBoundary.js';

export {
    SiteCreatePayloadSchema,
    SiteUpdateLocationPayloadSchema,
    SiteSetParcelBoundaryPayloadSchema,
    type SiteCreatePayload,
    type SiteUpdateLocationPayload,
    type SiteSetParcelBoundaryPayload,
    type SiteCommandResult,
    type SiteCommandRejection,
    type SiteCreatedEvent,
    type SiteLocationChangedEvent,
    type SiteParcelBoundarySetEvent,
} from './types.js';
