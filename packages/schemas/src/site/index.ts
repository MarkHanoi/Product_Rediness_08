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
// §SITE-SCOPE (L-645, C12 §13 / ADR-0382) — the persisted 3D-Site scope: ONE extent every context
// layer reads, cuts to, and is complete within.
export * from './SiteScope.js';
export * from './Parcel.js';
// §L-1580 (C57 §1.4 / §2.2) — the persisted cadastral provenance of a committed parcel.
export * from './ParcelProvenance.js';
export * from './BuildingFootprint.js';
export * from './ContextBuilding.js';
export * from './ProvenanceRecord.js';
export * from './SiteModel.js';
export * from './legacyProjectLocation.js';

// C58 — zoning-rules & buildable-envelope schemas (pure L0 data shapes).
export * from './zoning/index.js';

// ADR-0377 (§S1-DATUM) — the height datum seat: which plane a stated height is measured from.
export * from './HeightDatum.js';

// North Star §6.2 (Context Scene-Compiler & Terrain) — the regulation-aware HeightProfile datum.
export * from './context/index.js';
// §C62 (ADR-0280) — the shared data-confidence / provenance / unknown-reason model.
export * from './metadata/DataConfidence.js';
// §C63 (ADR-0281) — the 7-axis city-completion scorecard (composes C62).
export * from './completion/CityCompletionScorecard.js';
// §C63 §3.2 (L-664) — the exhaustive EnvelopeConfidence → ENVELOPE-axis weight map.
export * from './completion/EnvelopeAxisWeight.js';
