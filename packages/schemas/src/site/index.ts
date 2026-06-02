// A.7.a (Phase A · Sprint 1) — Public surface for the L0 Site substrate.
//
// Re-exported through the root barrel (`@pryzm/schemas`).
//
// Slice contents (A.7.a):
//   - types:              branded ids (SiteId / ContextBuildingId / ...) + Pt + Vec3
//   - SiteLocation:       lat/lon/elev/true-north/CRS/address
//   - Parcel:             boundary polygon + setbacks + zoning + maxFAR/maxHeight
//   - BuildingFootprint:  the project's own building outline on the parcel
//   - ContextBuilding:    reference-only neighbour shapes (always editable:false)
//   - ProvenanceRecord:   shared provenance shape (Site + ContextBuilding)
//   - SiteModel:          the canonical root schema (one per Project)
//
// Deferred to later slices:
//   - A.7.b SiteStore (L3 reactive wrapper) in @pryzm/stores
//   - A.7.c site.* commands per C16 (commandBus authoring)
//   - A.7.d cross-schema validations (containment / FAR / edge-class)
//   - A.7.e migration path from legacy `Project.location`
//   - A.7.f IfcSite round-trip (per C25 §3)
//
// Strategic context: docs/02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md.

export * from './types.js';
export * from './SiteLocation.js';
export * from './Parcel.js';
export * from './BuildingFootprint.js';
export * from './ContextBuilding.js';
export * from './ProvenanceRecord.js';
export * from './SiteModel.js';
export * from './legacyProjectLocation.js';
