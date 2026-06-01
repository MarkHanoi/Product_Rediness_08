// A.7.c (Phase A · Sprint 2) — Public surface for `site.*` command
// handlers.
//
// Pure functions: `(payload, store) → SiteCommandResult<Event>`. The
// L5 adapter (command-bus wiring + OTel span + LTP-ENU rebase + domain
// event emit) lives elsewhere (apps/editor or runtime-composer) and
// composes against these handlers.
//
// Slice contents:
//   A.7.c.1 (Sprint 1) — minimum viable subset for typology Stage 2:
//     - siteCreate                — §4.1 `site.create`
//     - siteUpdateLocation        — §4.1 `site.updateLocation`
//     - siteSetParcelBoundary     — §4.1 `site.setParcelBoundary`
//   A.7.c.2 (Sprint 1) — mutable parcel + footprint authoring:
//     - siteUpdateZoning          — §4.1 patches mutable parcel fields
//     - siteSetFootprint          — §4.1 + §1.6 soft-warn containment
//     - siteClearFootprint        — §4.1 sets footprint to null
//   A.7.c.3 (Sprint 1) — context-building registry:
//     - siteAddContextBuilding     — §4.1 + §1.5 append; rejects duplicates
//     - siteRemoveContextBuilding  — §4.1 by id; rejects when absent
//     - siteReplaceContextBuilding — §4.1 atomic remove + add; preserves order
//   - types (payload schemas + event types + result + warnings shape)
//
// Deferred to A.7.c.4+ slices (resync · climate/building link · replace · delete):
//   - siteResyncContextBuildings — §4.1 (async ingest from cesium/osm/msft)
//   - siteLinkClimate            — §4.1
//   - siteLinkBuilding           — §4.1
//   - siteReplace                — §4.1 + §1.4 (whole-site replacement)
//   - siteDelete                 — §4.1 + §1.1 (cascade from project.delete)

export { siteCreate, deterministicSiteId } from './siteCreate.js';
export { siteUpdateLocation } from './siteUpdateLocation.js';
export { siteSetParcelBoundary } from './siteSetParcelBoundary.js';
export { siteUpdateZoning } from './siteUpdateZoning.js';
export { siteSetFootprint } from './siteSetFootprint.js';
export { siteClearFootprint } from './siteClearFootprint.js';
export { siteAddContextBuilding } from './siteAddContextBuilding.js';
export { siteRemoveContextBuilding } from './siteRemoveContextBuilding.js';
export { siteReplaceContextBuilding } from './siteReplaceContextBuilding.js';

export {
    SiteCreatePayloadSchema,
    SiteUpdateLocationPayloadSchema,
    SiteSetParcelBoundaryPayloadSchema,
    SiteUpdateZoningPayloadSchema,
    SiteSetFootprintPayloadSchema,
    SiteClearFootprintPayloadSchema,
    SiteAddContextBuildingPayloadSchema,
    SiteRemoveContextBuildingPayloadSchema,
    SiteReplaceContextBuildingPayloadSchema,
    type SiteCreatePayload,
    type SiteUpdateLocationPayload,
    type SiteSetParcelBoundaryPayload,
    type SiteUpdateZoningPayload,
    type SiteSetFootprintPayload,
    type SiteClearFootprintPayload,
    type SiteAddContextBuildingPayload,
    type SiteRemoveContextBuildingPayload,
    type SiteReplaceContextBuildingPayload,
    type SiteCommandResult,
    type SiteCommandRejection,
    type SiteCommandWarnings,
    type SiteCreatedEvent,
    type SiteLocationChangedEvent,
    type SiteParcelBoundarySetEvent,
    type SiteZoningUpdatedEvent,
    type SiteFootprintSetEvent,
    type SiteFootprintClearedEvent,
    type SiteContextBuildingAddedEvent,
    type SiteContextBuildingRemovedEvent,
    type SiteContextBuildingReplacedEvent,
} from './types.js';
