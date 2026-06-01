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
//   - types (payload schemas + event types + result + warnings shape)
//
// Deferred to A.7.c.3+ slices (context buildings · resync · climate /
// building link · replace · delete):
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
export { siteUpdateZoning } from './siteUpdateZoning.js';
export { siteSetFootprint } from './siteSetFootprint.js';
export { siteClearFootprint } from './siteClearFootprint.js';

export {
    SiteCreatePayloadSchema,
    SiteUpdateLocationPayloadSchema,
    SiteSetParcelBoundaryPayloadSchema,
    SiteUpdateZoningPayloadSchema,
    SiteSetFootprintPayloadSchema,
    SiteClearFootprintPayloadSchema,
    type SiteCreatePayload,
    type SiteUpdateLocationPayload,
    type SiteSetParcelBoundaryPayload,
    type SiteUpdateZoningPayload,
    type SiteSetFootprintPayload,
    type SiteClearFootprintPayload,
    type SiteCommandResult,
    type SiteCommandRejection,
    type SiteCommandWarnings,
    type SiteCreatedEvent,
    type SiteLocationChangedEvent,
    type SiteParcelBoundarySetEvent,
    type SiteZoningUpdatedEvent,
    type SiteFootprintSetEvent,
    type SiteFootprintClearedEvent,
} from './types.js';
