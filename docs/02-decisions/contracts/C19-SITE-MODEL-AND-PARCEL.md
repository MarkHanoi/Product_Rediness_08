# C19 — Site Model & Parcel

> **Stamp**: 2026-06-01 · **Status**: DRAFT
> **Scope**: governs the **Site / Parcel / BuildingFootprint / ContextBuilding** schemas, runtime stores, command surface, UI surface, and IFC mapping. Companion to [C12](./C12-GEOSPATIAL.md) (which owns coordinate transforms only) — C19 owns the Site as a domain element above C12's CRS substrate.
> **Depends on**: [C03](./C03-SCHEMAS-COMMANDS-AND-STATE.md), [C12](./C12-GEOSPATIAL.md), [C13](./C13-PROJECT-LIFECYCLE-AND-ISOLATION.md), [C11](./C11-ELEMENT-CREATION-PIPELINE.md), [C16](./C16-COMMAND-AUTHORING-PROTOCOL.md).
> **Downstream**: [C20 Building & Apartment Aggregates](./C20-BUILDING-AND-APARTMENT-AGGREGATES.md) (proposed — consumes the Site as the outermost element); [C21 Climate Ingestion](./C21-CLIMATE-INGESTION.md) (proposed — populates `SiteModel.climate` cache); [C22 Privacy & PII Tier](./C22-PRIVACY-AND-PII-TIER.md) (proposed — gates `SiteModel.location` storage); [C23 Provenance & AI Audit](./C23-PROVENANCE-AND-AI-AUDIT.md) (proposed — every site-derived datum carries provenance); [C25 IFC Export](./C25-IFC-EXPORT-PRODUCTION.md) §1.4 (`IfcSite` already shipped at α-1 against this schema); apartment-layout AI workflows (climate-aware after C21 ratifies); the `apps/editor/src/ui/site/` authoring surface (PG0.7 deliverable).
> **Key principles**: **P5** (schemas pure — no THREE / no I/O in `packages/schemas/src/elements/site/`), **P6** (every Site mutation goes through `commandBus`; no direct store writes from UI), **P8** (every public site op opens an OTel span `pryzm.site.<verb>`), **P1** (single composition root — `SiteModelStore` is wired in `composeRuntime` only).
> **Master plan**: [geospatial-foundation.md](../../03-execution/plans/geospatial-foundation.md) §13 (PG0.1, PG0.2, PG0.4, PG0.7, PG0.10, PG0.11) and [geospatial-and-site-intelligence.md](../../03-execution/plans/geospatial-and-site-intelligence.md) §5, §13 (GS0.1, GS0.2, GS0.3, GS0.6, GS0.8, GS0.9).
> **Audit context**: [MISSING-CONTRACTS-AUDIT-2026-06-01.md §3.1](../MISSING-CONTRACTS-AUDIT-2026-06-01.md) — C19 is the first of the five Phase-3.5 reserved-slot fills.

---

## §1 — Invariants

The numbered rules below are binding on every PR that touches Site / Parcel / Footprint / ContextBuilding code. Each invariant has an §1.N id usable in `TODO(C19.N)` annotations and in `check-site-*.ts` CI gate failure messages.

### §1.1 — One Site per Project

A `Project` MUST contain exactly one `SiteModel` — never zero, never more than one. The Site is the outermost domain element in the project tree (the Building lives on it; the Building's levels live in it; rooms live on the levels). Multi-site portfolios are NOT modelled within a single project; each site is a separate project.

- A newly created project (`project.create`) MUST receive a default `SiteModel` synthesised by the loader — see §8.1 for the legacy-promotion rule.
- Loading a snapshot without a `SiteModel` MUST auto-promote a default one in memory; the persisted snapshot is NOT rewritten until the next save (per [C05](./C05-PERSISTENCE-AND-FILE-FORMAT.md)).
- `SiteModel.id` MUST be deterministic per project so that legacy auto-promotion is idempotent across reloads. Convention: `site_<projectId>` for auto-promoted sites; UUIDv7 for user-authored sites.

**Why**: every downstream contract (C20 Building, C21 Climate, C25 IFC `IfcSite`, every climate-aware AI workflow) assumes a single resolvable Site reference. Plurality is a multi-project portfolio concern, out of scope here.

### §1.2 — Site is read-only outside dedicated site-edit commands

The `SiteModel` slice of the runtime store MUST NOT be mutated except via the `site.*` command surface defined in §4. Specifically:

- UI code MUST NOT call `siteModelStore.setState()` directly.
- Plugin code MUST NOT subscribe to a store slice mutation that bypasses the command bus.
- The `SiteModel` slice is **read-only** from the perspective of every consumer that is not a site command handler.

This invariant inherits directly from **P6** (commands are the only mutation path). It is restated here because the Site is a structurally privileged element — easy to accidentally short-circuit during ingestion adapters (Cesium tile pull, EPW import) where the temptation to write the store directly is highest.

**Enforcement**: `check-site-no-direct-writes.ts` lints for any imported `siteModelStore.setState` call from outside `packages/site-runtime/src/commands/`.

### §1.3 — Site stores geographic origin via the C12 LTP-ENU substrate

The `SiteModel.location` field MUST reference the C12 LTP-ENU origin and MUST include `latitude`, `longitude`, `elevationAsl`, and `trueNorth`. C19 OWNS the schema shape of `SiteModel.location`; C12 OWNS the math that projects scene coordinates to/from those geographic coordinates. No duplication.

- When a `SiteModel` is created (`site.create`) or its location is updated (`site.updateLocation`), the command handler MUST call `LTPENURebase.setOrigin(lat, lon, elev)` synchronously before emitting `site.location-changed`. Race conditions where scene geometry is interpreted against a stale LTP origin are forbidden.
- A `SiteModel.location.crs` field MAY carry an EPSG / Proj4 string for IFC `IfcProjectedCRS` round-trip (C12 §1.2 / §1.3). When absent, the local UTM zone is the default — resolved at write-time by `packages/geospatial/`.
- `trueNorth` is in **radians** (C12 convention). UI conversion to degrees is an L5 concern.

**Why**: precision (`float32` GPU buffers — see C12 §1.1) requires the scene origin to be the LTP-ENU projection of `SiteModel.location`. Treating Site as a separate substrate from CRS produces two sources of truth for "where the project is."

### §1.4 — Parcel polygon is immutable post-create; setbacks/FAR/zoning are mutable

The `Parcel.boundary` polygon (the legal lot outline) MUST be authored once (via `site.setParcelBoundary` at site-create time or from an ingested survey/GeoJSON) and is then **immutable** for the lifetime of the Site. Setbacks, FAR, height limits, and zoning attributes attached to the parcel are MUTABLE.

- A Project that needs to redraw the parcel boundary MUST replace the entire Site (`site.replace`) — there is no `site.editParcelBoundary` command.
- Setbacks/FAR/zoning are mutated via `site.updateZoning` and DO emit a domain event without invalidating the parcel polygon hash.
- The parcel polygon SHOULD have ≤ 50 vertices (NFT target §7.3). The schema does not hard-cap this, but the UI authoring surface (§5) SHOULD warn at > 30 vertices and refuse at > 200.

**Why**: the parcel polygon is the legal title document's outline — surveyed, recorded, immutable in real-world meaning. Setbacks, FAR caps, and zoning categories CAN change (zoning revisions, variances, code updates) without the legal lot changing. Modelling the polygon as immutable enforces this real-world boundary in code.

### §1.5 — ContextBuildings are reference-only

`ContextBuilding` entries — surrounding neighbour buildings whether ingested from Cesium 3D Tiles, OSM, manual import, or hand-drawn massing — MUST be marked `editable: false` in their schema metadata. They are NOT editable by any `site.*` command except `site.addContextBuilding` and `site.removeContextBuilding`.

- ContextBuildings have NO inner structure (no levels, no rooms, no elements). They are opaque massing volumes for **shadow / view / privacy / urban-canyon** analysis only.
- A ContextBuilding's height, footprint, and roof shape MAY be edited via a single `site.replaceContextBuilding` (remove + add atomically) — this preserves provenance: the consumer knows the volume changed because the user reauthored it, not because some hidden mutation occurred.
- ContextBuildings MUST NOT appear in element schedules, IFC export (except as `IfcSite.SiteContext` references — out of scope C25 α-1), or property panels for selection-based editing. They appear in the **Site Inspector** (§5.3) only.

**Why**: the Inspect/Data/Selection systems (C27, C28) assume editable BIM elements. ContextBuildings are environment, not BIM. Conflating the two breaks the selection / property-panel semantics.

### §1.6 — Footprint must lie inside Parcel minus setbacks

The `BuildingFootprint.polygon` (the project's own building outline on the parcel) MUST satisfy:

1. **Containment**: every vertex of `BuildingFootprint.polygon` MUST lie inside the `Parcel.boundary` polygon.
2. **Setback compliance**: every vertex of `BuildingFootprint.polygon` MUST lie at least `Parcel.setbacks.front | side | rear` metres from the corresponding parcel edge classification (front edge → front setback, etc.). Setback edge classification is determined at parcel-create time and stored on `Parcel.boundary.edgeClassifications: ('front'|'side'|'rear'|'unclassified')[]`.
3. **Height cap**: a `BuildingFootprint` SHOULD declare a `maxHeightHint` field; the linked Building (per [C20](./C20-BUILDING-AND-APARTMENT-AGGREGATES.md)) MUST NOT exceed `Parcel.maxHeight` minus any zoning-overlay height penalties.
4. **FAR (floor-area ratio)**: the sum of all Apartment + Common-Area gross floor areas under the linked Building (per [C20](./C20-BUILDING-AND-APARTMENT-AGGREGATES.md)) divided by `area(Parcel.boundary)` MUST be ≤ `Parcel.maxFAR` when `maxFAR` is set.

Containment and setback violations MUST be surfaced as a **non-fatal** lint warning in the Site Inspector (§5.3) and a **hard** fail in IFC export (per [C25](./C25-IFC-EXPORT-PRODUCTION.md) §1.4 — IfcSite cannot reference a footprint that violates its own parcel envelope).

**Why**: footprint-outside-parcel is one of the canonical zoning bugs. Codifying it at the contract level prevents the AI massing/layout workflows from generating non-compliant proposals. The "non-fatal lint at edit time, hard at export time" split lets users iterate without blocking the design loop but prevents non-compliant deliverables.

### §1.7 — Every site mutation emits an OTel span `pryzm.site.<verb>`

Per **P8**, every command handler in §4 MUST open an OpenTelemetry span named `pryzm.site.<verb>` (e.g. `pryzm.site.create`, `pryzm.site.updateZoning`, `pryzm.site.addContextBuilding`). Required span attributes:

| Attribute | Required | Type | Notes |
|---|---|---|---|
| `siteId` | yes | string | `SiteModel.id` |
| `projectId` | yes | string | scope check vs C13 isolation |
| `verb` | yes | string | redundant with span name but useful for `where verb = …` aggregation |
| `actor` | yes | `'user' \| 'ai' \| 'ingest' \| 'migration'` | who initiated the mutation |
| `payloadHash` | recommended | string | SHA-256 of the canonicalised command payload — supports the [C23](./C23-PROVENANCE-AND-AI-AUDIT.md) audit trail |
| `result` | yes | `'ok' \| 'rejected' \| 'noop'` | outcome — `rejected` for invariant violations |

Spans MUST be closed within the command handler's synchronous body — async tails MUST open their own child span. This matches the C09 §6 / C10 §3 observability rule.

**Why**: Site mutations are sensitive (legal-boundary changes, climate-reference changes, geolocation changes) and audit-relevant. Without uniform spans, the audit trail in [C23](./C23-PROVENANCE-AND-AI-AUDIT.md) is incomplete.

### §1.8 — ContextBuilding ingestion is snapshot-based

When a ContextBuilding is sourced from an external tile service (Cesium ion, OSM, Microsoft Building Footprints), the ingested representation MUST be **snapshotted** into the `SiteModel` at ingest time — NOT held as a live tile-fetch handle.

- The `ContextBuilding.provenance` field MUST record `{ source, tilesetVersion, ingestTimestamp, license }`. This is the data the [C23 Provenance](./C23-PROVENANCE-AND-AI-AUDIT.md) contract consumes.
- Re-fetching the upstream tile is a separate user-initiated command (`site.resyncContextBuildings`) which atomically replaces the snapshot and bumps `ingestTimestamp`. The old snapshot MAY be retained for delta comparison if `Project.config.siteRetainContextHistory` is true.
- The snapshot SHOULD be a simplified massing (decimated to ≤ 100 polygons per building per the NFT target §7.2) — full-fidelity tiles remain in the Cesium visualization layer (out of band).

**Why**: live tile-fetch couples the project's design-time state to upstream availability and pricing. A project archived for a year and reopened MUST still load. Snapshot semantics also unlock the [C23](./C23-PROVENANCE-AND-AI-AUDIT.md) reproducibility claim ("this layout was scored against this exact context snapshot").

### §1.9 — Climate is referenced, not embedded

The `SiteModel.climateRef` field is a string reference to a climate cache entry owned by [C21 Climate Ingestion](./C21-CLIMATE-INGESTION.md). C19 MUST NOT embed climate data (EPW arrays, NOAA normals, wind roses) directly in the `SiteModel` schema.

- Schema purity (**P5**): embedding climate (a multi-megabyte payload of arrays) inside the schema would make `SiteModel` a heavy snapshot citizen and break the per-element CRDT replication budget (per [C08](./C08-COLLABORATION-AND-SECURITY.md)).
- Resolution: a consumer that needs climate data calls `siteContextService.getClimate(site.climateRef)` (the C21 surface) — a cache-friendly read.
- A `SiteModel` with `climateRef === null` is valid; consumers that need climate fall back to mid-latitude temperate defaults (per [C21](./C21-CLIMATE-INGESTION.md), once ratified).

**Why**: separation of concerns — Site identifies WHERE; Climate is the time-varying data at that WHERE. Cross-contract cohesion at the reference boundary keeps both contracts evolvable independently.

### §1.10 — Site does NOT own the Building / Apartment / Room hierarchy

The Building element is the next aggregate down (Site → Building → Level → Apartment → Room → Element). The Site's contract responsibility ends at the BuildingFootprint and the link to a single Building id (per [C20](./C20-BUILDING-AND-APARTMENT-AGGREGATES.md)).

- C19 schemas MUST NOT carry level lists, apartment lists, room references, or any per-element inner data.
- The `SiteModel.buildingRef` field carries exactly ONE `BuildingId` (C20 type) — see §1.1 (one Site per Project ⇒ one Building per Site in the default topology; future multi-building parcels are a C20 extension, not a C19 extension).

**Why**: scope discipline — boundary clarity between C19 (the WHERE) and C20 (the WHAT-LIVES-THERE).

### §1.11 — Site teardown follows C13 project lifecycle

When `pryzm-project-switch` fires (per [C13](./C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) §3.7), the `SiteModelStore` MUST be reset to its initial empty state before `pryzm-project-context-set` fires for the new project.

- `siteModelStore.reset()` MUST be called from the C13 teardown sequence (§4 step 6, new).
- Any in-flight `site.resyncContextBuildings` async work for the prior project MUST be cancelled (cancel-token pattern, same as C13 §3.6 for the redetect sweep).
- A `pryzm-site-teardown` OTel span MUST fire as part of the teardown sequence with attribute `priorSiteId`.

**Why**: cross-project Site leak (Project A's parcel polygon rendering against Project B's BuildingFootprint) is a §3.8-class isolation bug. The C19 store joins the C13 reset list.

---

## §2 — Schema

The schemas below live in `packages/schemas/src/elements/site/`. They are **pure Zod** — no THREE, no DOM, no I/O (per **P5**).

### §2.1 — `SiteModel`

| Field | Type | Default | Validation | Notes |
|---|---|---|---|---|
| `id` | `SiteId` (branded string) | — | `site_<uuid7>` or `site_<projectId>` for auto-promoted | §1.1 |
| `projectId` | `ProjectId` | — | parent project link; must exist | C13 |
| `name` | `string` | `'Site'` | min 1 char | display |
| `location` | `SiteLocation` (see §2.2) | derived from `Project.location` for legacy | §2.2 invariants | §1.3 |
| `parcel` | `Parcel` (see §2.3) | empty parcel (`boundary: []`, `setbacks: {0,0,0}`) | §1.4 | §1.4 |
| `footprint` | `BuildingFootprint \| null` | `null` | §1.6 containment | §1.6 |
| `contextBuildings` | `ContextBuilding[]` | `[]` | each entry §1.5 / §1.8 | §1.5 |
| `climateRef` | `ClimateRefId \| null` | `null` | C21 reference | §1.9 |
| `buildingRef` | `BuildingId \| null` | `null` | C20 reference | §1.10 |
| `provenance` | `ProvenanceRecord` (see §2.6) | `{ source: 'auto-promoted', ... }` | C23 reference | §1.8 |
| `schemaVersion` | `number` | `1` | bumped on breaking change | C47 (proposed) |

```ts
// packages/schemas/src/elements/site/SiteModel.ts
export const SiteModel = defineElement('site', {
  id: SiteIdSchema,
  projectId: ProjectIdSchema,
  name: z.string().min(1).default('Site'),
  location: SiteLocation,
  parcel: Parcel,
  footprint: BuildingFootprint.nullable().default(null),
  contextBuildings: z.array(ContextBuilding).default([]),
  climateRef: ClimateRefIdSchema.nullable().default(null),
  buildingRef: BuildingIdSchema.nullable().default(null),
  provenance: ProvenanceRecord,
  schemaVersion: z.number().int().positive().default(1),
});
export type SiteModel = z.infer<typeof SiteModel>;
```

### §2.2 — `SiteLocation`

Mirrors today's `ProjectLocation` (see `packages/schemas/src/elements/Project.ts:16-26`) but lives on the Site, not the Project. The Project's `location` field becomes a **read-only getter** that delegates to `Site.location` (the legacy-promotion path — §8.2).

| Field | Type | Default | Validation |
|---|---|---|---|
| `latitude` | `number` | `0` | `[-90, 90]` decimal degrees, WGS84 |
| `longitude` | `number` | `0` | `[-180, 180]` decimal degrees, WGS84 |
| `elevationAsl` | `number` | `0` | metres above sea level; range `[-500, 9000]` warn-soft |
| `trueNorth` | `number` | `0` | radians; range `[-π, π]` |
| `crs` | `string \| null` | `null` | EPSG code (e.g. `'EPSG:27700'`) or Proj4 string; null = local UTM zone |
| `basePoint` | `Vec3` | `{x:0,y:0,z:0}` | scene-space origin (per C12 LTP-ENU) |
| `siteAddress` | `string \| null` | `null` | free-form postal address — **PII** per [C22](./C22-PRIVACY-AND-PII-TIER.md) |
| `landTitleNumber` | `string \| null` | `null` | jurisdiction-specific legal id — **PII** per [C22](./C22-PRIVACY-AND-PII-TIER.md) |

### §2.3 — `Parcel`

| Field | Type | Default | Notes |
|---|---|---|---|
| `boundary.polygon` | `Pt[]` (closed loop, scene-XZ metres) | `[]` | immutable post-create (§1.4) |
| `boundary.edgeClassifications` | `('front' \| 'side' \| 'rear' \| 'unclassified')[]` | `[]` | one per edge; len = polygon.length |
| `setbacks.front` | `number` | `0` | metres |
| `setbacks.side` | `number` | `0` | metres |
| `setbacks.rear` | `number` | `0` | metres |
| `maxFAR` | `number \| null` | `null` | floor-area ratio cap; `null` = unrestricted |
| `maxHeight` | `number \| null` | `null` | metres; `null` = unrestricted |
| `zoning.category` | `string \| null` | `null` | jurisdiction-specific zone code (e.g. `'R-2'`, `'C-1'`) |
| `zoning.overlays` | `string[]` | `[]` | overlay codes (conservation area, flood zone, heritage) |
| `zoning.jurisdictionRef` | `JurisdictionId \| null` | `null` | links to a future Jurisdiction registry (out of scope C19) |
| `area` | `number` (computed) | derived | square metres of polygon — recomputed on `site.create` only (§1.4) |

### §2.4 — `BuildingFootprint`

| Field | Type | Default | Notes |
|---|---|---|---|
| `polygon` | `Pt[]` (closed loop, scene-XZ metres) | `[]` | inside parcel minus setbacks (§1.6) |
| `maxHeightHint` | `number \| null` | `null` | metres; informs C20 Building creation |
| `groundElevation` | `number` | `0` | metres above SiteLocation.elevationAsl — for stepped sites |
| `entryAnchor` | `Pt \| null` | `null` | the building's primary entry; for AI access-aware workflows |

### §2.5 — `ContextBuilding`

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | `ContextBuildingId` (branded string) | — | `ctx_<uuid7>` |
| `footprint` | `Pt[]` (closed loop) | — | scene-XZ metres |
| `height` | `number` | `10` | metres above ground |
| `groundElevation` | `number` | `0` | metres above SiteLocation.elevationAsl |
| `roofShape` | `'flat' \| 'gable' \| 'hip' \| 'opaque'` | `'opaque'` | `opaque` = no detail, just a massing block |
| `editable` | `false` | `false` | always false per §1.5 |
| `provenance` | `ProvenanceRecord` | — | C23 |
| `polygonCount` | `number` | derived | warn-soft if > 100 (NFT §7.2) |

### §2.6 — `ProvenanceRecord`

Shared between `SiteModel.provenance` and `ContextBuilding.provenance`. Forward-compat with [C23 Provenance & AI Audit](./C23-PROVENANCE-AND-AI-AUDIT.md).

| Field | Type | Default | Notes |
|---|---|---|---|
| `source` | `'auto-promoted' \| 'user-authored' \| 'cesium-ion' \| 'osm' \| 'msft-footprints' \| 'ifc-import' \| 'survey' \| 'ai'` | `'auto-promoted'` | |
| `sourceVersion` | `string \| null` | `null` | tileset version, OSM revision, survey reference |
| `ingestTimestamp` | `ISODateString` | now | UTC ISO-8601 |
| `license` | `string \| null` | `null` | SPDX-id or free-form |
| `actor` | `'system' \| <userId>` | `'system'` | C13 actor model |

### §2.7 — Cross-schema validations (Zod refinements)

These run as `.refine()` blocks on `SiteModel`:

1. **§1.6 containment**: `footprint.polygon ⊂ parcel.boundary.polygon ⊖ setbacks` (polygon difference). Pure geometry — implemented in `packages/site-runtime/src/validations/containment.ts`.
2. **§1.6 FAR**: `sum(buildingGrossFloorAreas) ≤ parcel.maxFAR × area(parcel.boundary)` — soft validation (warn) unless export-time hard (§6).
3. **§2.3 edgeClassifications length**: `parcel.boundary.edgeClassifications.length === parcel.boundary.polygon.length`.
4. **§1.4 polygon immutability hash**: a `_polygonHash` private field is set at `site.create` and verified on every subsequent read; mismatch throws.

---

## §3 — Stores / API surface

### §3.1 — `SiteModelStore` (L3)

Lives in `packages/stores/src/site/SiteModelStore.ts`. Single per-runtime Zustand slice constructed inside `composeRuntime` (per **P1**).

```ts
// packages/stores/src/site/SiteModelStore.ts
export interface SiteModelStore {
  // Read API (subscribable)
  getSite(): SiteModel | null;
  subscribe(listener: (site: SiteModel | null) => void): Unsubscribe;

  // Resolution helpers (read-only)
  getParcelBoundary(): Pt[] | null;
  getFootprint(): BuildingFootprint | null;
  getContextBuildings(): readonly ContextBuilding[];
  getLocation(): SiteLocation | null;

  // Command-only mutation (internal — used by §4 handlers only)
  /** @internal */ _setSite(site: SiteModel): void;
  /** @internal */ _patchSite(patch: Partial<SiteModel>): void;
  /** @internal */ reset(): void;  // C13 teardown — see §1.11
}
```

`_setSite` and `_patchSite` are package-internal (TypeScript `@internal` JSDoc + ESLint boundary rule) — only handlers in `packages/site-runtime/src/commands/` may call them. UI code calls only the read API.

### §3.2 — `siteContextService` (read-aggregator)

Lives in `packages/site-runtime/src/SiteContextService.ts`. The platform-level read-aggregator that workflows query (per `geospatial-foundation.md §13 PG0.3`).

```ts
export interface SiteContextService {
  /** Snapshot read — single function call, no live subscription. */
  readContext(siteRef: SiteId): SiteContext;

  /** Resolve climate from climateRef — delegates to C21. */
  getClimate(climateRef: ClimateRefId | null): ClimateData | null;

  /** Convenience for the apartment-layout AI workflow. */
  getOrientationVector(siteRef: SiteId): Vec3;  // derived from trueNorth
}
```

The service is read-only. All mutation flows through the §4 command surface. Workflows pass a `siteRef` and receive a frozen snapshot — this is the cross-workflow contract that the climate/orientation/context-buildings extensions in `[geospatial-foundation.md §5]` rely on.

### §3.3 — Package boundaries

| Package | Layer | Responsibility |
|---|---|---|
| `packages/schemas/src/elements/site/` | L0 | Zod schemas only (§2). No I/O, no THREE, no DOM. |
| `packages/site-runtime/` | L2 | Command handlers, validations, `SiteContextService`. |
| `packages/stores/src/site/` | L3 | `SiteModelStore` slice; L3-canonical wiring. |
| `packages/geospatial/` | L2 | C12 — receives `SiteLocation` updates and recentres LTP-ENU. |
| `apps/editor/src/ui/site/` | L5 | Site authoring UI (Cesium-backed parcel drawing). |
| `plugins/geospatial/` | L7 | Cesium bridge + ingestion adapter for context buildings. |
| `plugins/ifc-export/` | L7 | Reads `SiteModel` for `IfcSite` attribute population (C25 §1.4). |
| `plugins/ifc-import/` | L7 | Constructs `SiteModel` from `IFCPROJECTEDCRS` + `IFCMAPCONVERSION` (C12 §1.2). |

Dependency direction: `apps/editor` ← `plugins/*` ← `site-runtime` ← `stores` ← `schemas`. No reverse imports.

### §3.4 — Project ↔ Site getter

For backward compatibility (§8.2), `Project.location` becomes a getter that reads from `SiteModelStore.getLocation()`. The setter remains on the Project schema for legacy snapshots that haven't been promoted; once promotion completes (synchronously at load time), writes to `Project.location` are forwarded to `site.updateLocation` (legacy adapter layer in `packages/persistence/src/migration/v2-to-v3.ts`).

---

## §4 — Commands

All commands are authored per [C16 Command Authoring Protocol](./C16-COMMAND-AUTHORING-PROTOCOL.md) — `commandBus.execute()` only; no legacy `commandManager.execute()` per [C14 Legacy Elimination](./C14-LEGACY-ELIMINATION-AND-PRYZM3-ENFORCEMENT.md).

### §4.1 — Command surface

| Command | Payload (Zod-validated) | Effect | Span | Notes |
|---|---|---|---|---|
| `site.create` | `{ projectId, name?, location, parcel, footprint?, contextBuildings? }` | Creates the project's single Site. Idempotent: re-issuing for an existing project replaces the auto-promoted default. | `pryzm.site.create` | §1.1 |
| `site.updateLocation` | `{ siteId, location: SiteLocation }` | Replaces `SiteModel.location` and calls `LTPENURebase.setOrigin()` synchronously. | `pryzm.site.updateLocation` | §1.3 |
| `site.setParcelBoundary` | `{ siteId, boundary: { polygon, edgeClassifications } }` | One-shot polygon authoring. **REJECTED** if Parcel.boundary is already non-empty (§1.4). | `pryzm.site.setParcelBoundary` | §1.4 |
| `site.updateZoning` | `{ siteId, zoning?, setbacks?, maxFAR?, maxHeight? }` | Patches mutable parcel fields. Polygon NOT touched. | `pryzm.site.updateZoning` | §1.4 |
| `site.setFootprint` | `{ siteId, footprint: BuildingFootprint }` | Sets or replaces the BuildingFootprint. Runs §1.6 containment check; **REJECTED** on hard violation. | `pryzm.site.setFootprint` | §1.6 |
| `site.clearFootprint` | `{ siteId }` | Removes the BuildingFootprint (sets to `null`). Used when redrawing. | `pryzm.site.clearFootprint` | §1.6 |
| `site.addContextBuilding` | `{ siteId, contextBuilding: ContextBuilding }` | Appends to `contextBuildings[]`. | `pryzm.site.addContextBuilding` | §1.5 |
| `site.removeContextBuilding` | `{ siteId, contextBuildingId }` | Removes one entry. | `pryzm.site.removeContextBuilding` | §1.5 |
| `site.replaceContextBuilding` | `{ siteId, contextBuildingId, replacement: ContextBuilding }` | Atomic remove + add (preserves order). | `pryzm.site.replaceContextBuilding` | §1.5 |
| `site.resyncContextBuildings` | `{ siteId, source: 'cesium-ion' \| 'osm' \| 'msft-footprints', radius?: number }` | Re-fetches and atomically replaces all `editable: false` context buildings sourced from the given upstream. Async — returns a promise that resolves on commit. | `pryzm.site.resyncContextBuildings` | §1.8 |
| `site.linkClimate` | `{ siteId, climateRef: ClimateRefId \| null }` | Sets `climateRef`. Does NOT itself ingest climate data (C21 owns that). | `pryzm.site.linkClimate` | §1.9 |
| `site.linkBuilding` | `{ siteId, buildingRef: BuildingId }` | Sets `buildingRef`. Called once at C20 Building.create time. | `pryzm.site.linkBuilding` | §1.10 |
| `site.replace` | `{ siteId, replacement: SiteModel }` | Complete replacement (legal-document-level edit). Required when the parcel polygon must change. Issues a single undo entry covering the whole replacement. | `pryzm.site.replace` | §1.4 |
| `site.delete` | `{ siteId }` | **Forbidden** in normal flow (§1.1 — one Site per Project). Only available in the project-delete path (cascade from `project.delete`). | `pryzm.site.delete` | §1.1 |

### §4.2 — Domain events

Each command emits a domain event (per [C03 §3](./C03-SCHEMAS-COMMANDS-AND-STATE.md)):

- `site.created`
- `site.location-changed`
- `site.parcel-boundary-set`
- `site.zoning-updated`
- `site.footprint-set`
- `site.footprint-cleared`
- `site.context-building-added` / `.context-building-removed` / `.context-building-replaced`
- `site.context-resynced`
- `site.climate-linked`
- `site.building-linked`
- `site.replaced`
- `site.deleted`

Downstream subscribers (the C12 LTP-ENU rebaser, the apartment-layout workflow, the C25 IFC exporter, the C27 Inspect tree) listen on these events. The trueNorth subscription in `RealSunService` (per `geospatial-and-site-intelligence.md §1`) migrates from `Project.location` to `site.location-changed`.

### §4.3 — Batch semantics

There is **no** `site.batch.create` — Site creation is intrinsically singular (§1.1). The C17 batch catalogue MUST NOT register a Site batch entry. Context buildings can be batch-imported via `site.resyncContextBuildings` (which is itself a single command emitting one undo entry); raw multi-add is `site.addContextBuilding` × N driven by the importer.

### §4.4 — Undo semantics

Per [C03 §4](./C03-SCHEMAS-COMMANDS-AND-STATE.md) and the unified undo path (`performUndoRedo.ts`):

- `site.replace` and `site.delete` produce single undo entries that snapshot the entire prior `SiteModel`.
- All other commands produce property-level undo deltas.
- `site.resyncContextBuildings` is undoable as a single delta (the prior context-buildings array is snapshotted).
- The undo entry actor flag `'user' | 'ai' | 'ingest'` is preserved for the [C23](./C23-PROVENANCE-AND-AI-AUDIT.md) audit trail.

---

## §5 — UI

The Site authoring UI lives at `apps/editor/src/ui/site/` (per `geospatial-foundation.md §13 PG0.7` — 4 wk deliverable). DRAFT scope below.

### §5.1 — Site Designer Tab

A top-level editor tab `Site` (visible to users with the `site:edit` permission per [C08](./C08-COLLABORATION-AND-SECURITY.md)). Three sub-panels:

1. **Location** — lat/lon picker, address lookup, true-north slider, CRS dropdown. Backed by `site.updateLocation`.
2. **Parcel** — Cesium-backed polygon drawing tool (per PG0.7). Setbacks/FAR/zoning form. Backed by `site.setParcelBoundary` (one-shot) and `site.updateZoning` (mutable).
3. **Context** — ContextBuildings panel: list + remove + resync from upstream. Backed by `site.addContextBuilding` / `site.removeContextBuilding` / `site.resyncContextBuildings`.

### §5.2 — Cesium integration

The Parcel drawing tool MUST use the `plugins/geospatial` Cesium bridge (per `geospatial-and-site-intelligence.md §7`). Cesium owns the visualization; PRYZM owns the data.

- The user draws a polygon on the Cesium globe; on commit, the polygon is converted to scene-XZ metres via `LTPENURebase.projectToScene` (per [C12](./C12-GEOSPATIAL.md)) and dispatched as `site.setParcelBoundary`.
- ContextBuildings can be selected from a Cesium 3D Tiles overlay (Cesium ion building footprints layer) and marked for ingestion; on confirm, each selected building is decimated to ≤ 100 polygons and dispatched as `site.addContextBuilding`.

### §5.3 — Site Inspector

A right-side panel showing the live Site state. Three sections:

1. **Location** — readonly summary: lat/lon, elevation, true-north (degrees), CRS, address (PII-gated per [C22](./C22-PRIVACY-AND-PII-TIER.md)).
2. **Parcel** — area (m²), setback summary, FAR utilisation (sum of building floor areas / parcel area / maxFAR), height utilisation (current building height / maxHeight). Soft-warns on §1.6 violations.
3. **Context** — count of context buildings, last ingest timestamp, source, license — surfaces the §2.6 ProvenanceRecord.

### §5.4 — Footprint authoring

The BuildingFootprint is authored either:

- Implicitly — derived from the Building element's perimeter (per [C20](./C20-BUILDING-AND-APARTMENT-AGGREGATES.md)); on Building.create the footprint is auto-set via `site.setFootprint`.
- Explicitly — via the Parcel-tab footprint sub-tool, which lets the user draw the footprint inside the parcel polygon.

The implicit path is the default; the explicit path is for users who want to constrain massing **before** placing a Building.

### §5.5 — Preview colour

All Site/Parcel/Footprint/ContextBuilding previews MUST use the canonical PRYZM purple `#6600FF` per [C18 Element Preview Visual Contract](./C18-ELEMENT-PREVIEW-VISUAL-CONTRACT.md). ContextBuildings render in a desaturated 50%-opacity grey (`#999999` at α=0.5) to signal their reference-only role.

---

## §6 — Tests / CI gates

| Gate | Path | Verifies | When ratchets to hard-fail |
|---|---|---|---|
| `check-site-uniqueness` | `tools/ga-gate/check-site-uniqueness.ts` | Every project has exactly one Site (§1.1) | Now |
| `check-site-no-direct-writes` | `tools/ga-gate/check-site-no-direct-writes.ts` | No imports of `siteModelStore.setState` outside command handlers (§1.2) | Now |
| `check-footprint-in-parcel` | unit test in `packages/site-runtime/__tests__/footprint.test.ts` | §1.6 containment + setback compliance | Now |
| `check-zoning-conformance` | unit test in `packages/site-runtime/__tests__/zoning.test.ts` | FAR + maxHeight enforcement on `site.setFootprint` / on `building.update` cascade | After C20 ratifies |
| `check-site-otel-spans` | `tools/ga-gate/check-site-spans.ts` | Every `site.*` command handler opens `pryzm.site.<verb>` (§1.7) | Now |
| `check-parcel-immutability` | unit test in `packages/site-runtime/__tests__/parcel-immutable.test.ts` | `site.setParcelBoundary` rejected when polygon already set (§1.4) | Now |
| `check-context-snapshot` | unit test in `packages/site-runtime/__tests__/context-snapshot.test.ts` | ContextBuilding payload includes ProvenanceRecord (§1.8) | Now |
| `check-c13-site-teardown` | `tools/ga-gate/check-c13-site-teardown.ts` | C13 teardown sequence calls `siteModelStore.reset()` (§1.11) | After PG0.2 lands |
| `check-ifc-site-population` | `plugins/ifc-export/__tests__/site.test.ts` | IfcSite attributes match `SiteModel.location` (§1.6 hard at export) | Now (C25 α-1 shipped) |

### §6.1 — E2E test

`tests/e2e/site-authoring.spec.ts` MUST pass:

```
1. Open a new project.
2. Assert: SiteModel exists with auto-promoted defaults (§1.1).
3. Open the Site tab → Parcel sub-panel.
4. Draw a 50×30 m rectangular polygon on the Cesium viewport.
5. Set front setback = 5, side = 3, rear = 5.
6. Save → assert `site.setParcelBoundary` and `site.updateZoning` fire.
7. Draw a building footprint 20×20 m placed centred.
8. Assert: §1.6 containment passes (no warnings in Site Inspector).
9. Move footprint to overlap setback → assert soft-warn (yellow lint) in Site Inspector.
10. Move footprint outside parcel → assert hard-reject on `site.setFootprint`.
11. Trigger IFC export → assert export fails with §1.6 hard error.
```

### §6.2 — Conformance: legacy promotion

`tests/integration/site-legacy-promotion.spec.ts` MUST pass:

```
1. Load a snapshot saved before C19 (i.e. with `Project.location` but no `Site`).
2. Assert: `SiteModelStore.getSite()` returns a non-null SiteModel.
3. Assert: `SiteModel.location` === the snapshot's `Project.location`.
4. Assert: `SiteModel.id` === `site_<projectId>` (deterministic per §1.1).
5. Assert: snapshot on disk is UNCHANGED (per §1.1: promotion is in-memory only).
6. Issue any `site.*` command.
7. Save.
8. Assert: snapshot now contains explicit `site` block.
```

---

## §7 — NFT targets

Per [C10 Performance & Observability](./C10-PERFORMANCE-AND-OBSERVABILITY.md).

### §7.1 — Site load < 2 s

Loading a project with a complete Site (parcel polygon ≤ 50 vertices + 100 ContextBuildings + a fully-populated location block) MUST complete the `SiteModelStore` initialisation in < 2 seconds, measured from `pryzm-project-context-set` to `siteModelStore.getSite() !== null`.

Span: `pryzm.site.load` — attributes `{ contextBuildingCount, polygonVertexCount, hasClimateRef }`.

### §7.2 — ContextBuildings render budget

Rendering 100 ContextBuildings (each ≤ 100 polygons — soft cap) MUST NOT exceed 16 ms per frame at the 95th percentile on the reference hardware (per [C10](./C10-PERFORMANCE-AND-OBSERVABILITY.md) §4 reference hardware spec).

- Above 100 ContextBuildings, the renderer SHOULD aggregate into a single InstancedMesh (per the §INSTANCED-LEVEL-VIS pattern documented in `memory/instanced-aggregate-level-visibility.md`).
- The §1.8 100-polygon decimation cap is the schema-side enforcement.

### §7.3 — Parcel polygon ≤ 50 vertices

The parcel polygon SHOULD have ≤ 50 vertices for performant containment / setback / FAR checks (the §2.7 refinements run on every `site.setFootprint`). Polygons above 50 vertices warn-soft; above 200, the schema HARD-rejects.

### §7.4 — `site.resyncContextBuildings` < 10 s for 200 buildings

The Cesium ion tile fetch + decimation + atomic replace for a 500 m radius around the Site location MUST complete in < 10 s (200 typical neighbour buildings at 100 polygons each) on the reference hardware. Above 10 s, the user sees a progress toast.

---

## §8 — Migration plan

### §8.1 — Auto-promotion at load time

Every snapshot loaded that lacks a `site` block triggers in-memory auto-promotion:

```
1. Loader detects: snapshot has `project.location` but no `project.site`.
2. Loader synthesises:
   - SiteModel.id = `site_${projectId}`
   - SiteModel.location = clone(project.location)
   - SiteModel.parcel.boundary.polygon = [] (empty — no polygon authored yet)
   - SiteModel.footprint = null
   - SiteModel.contextBuildings = []
   - SiteModel.provenance = { source: 'auto-promoted', ingestTimestamp: now, actor: 'system' }
3. Loader dispatches `site.create` synchronously BEFORE `pryzm-project-context-set` fires.
4. Project.location field is preserved on disk; the next save writes the new schema (project.site populated + project.location field deprecated-but-preserved).
```

This is identical to the §3.1 / §3.2 strategy in [C13](./C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) — silent, deterministic, idempotent.

### §8.2 — `Project.location` deprecation

`Project.location` becomes a **deprecated alias** for `Project.site.location`. Sequence:

- v1: `Project.location` is the source of truth. (Pre-C19)
- v2 (C19 ratify): both fields present; `Project.location` is a getter delegating to `Project.site.location`. Write-back legacy adapter writes both. Schema bump: `Project.schemaVersion = 2`.
- v3 (next breaking change): `Project.location` removed from schema; legacy snapshots load via v1→v2 migration.

This per [C47 File-Format Versioning](./C47-FILE-FORMAT-VERSIONING.md) (proposed). For now, dual-write at v2.

### §8.3 — Existing plumbing reuse

| Existing | Wraps to |
|---|---|
| `ProjectLocation` schema in `packages/schemas/src/elements/Project.ts` | `SiteLocation` in `packages/schemas/src/elements/site/SiteLocation.ts` — 1:1 field mapping |
| `RealSunService.subscribeToProjectLocation()` | `RealSunService.subscribeToSiteLocation()` (rename) — same Vec3 input |
| `LTPENURebase.setOrigin(lat, lon, elev)` (C12 §1.1) | Unchanged; called by `site.updateLocation` handler instead of by `project.updateLocation` handler |
| `plugins/ifc-import/IfcProjectedCRSReader` (C12 §1.2) | Constructs a `SiteModel` instead of patching `Project.location` |
| `plugins/ifc-export/hierarchy.ts` (C25 §1.4) | Reads `SiteModel` instead of `Project.location` — already gap-fill IFC-α-1 in C25 master plan |
| `plugins/geospatial/CesiumThreeBridge.ts` | Unchanged — visualization-only; receives a `SiteContextService` handle to subscribe to context changes |
| `apps/editor/src/ui/geospatial/CesiumViewport.ts` | Unchanged for visualisation; gains the §5.2 parcel-drawing tool overlay |

### §8.4 — Migration steps

1. **PG0.1 / GS0.1** — Land schemas + legacy-promotion loader. NO behaviour change for existing workflows.
2. **PG0.2 / GS0.2** — Land `SiteModelStore` + `site.*` commands. Subscribe `RealSunService` to the store. Project.location dual-write.
3. **PG0.4 / GS0.3** — Cesium ingestion adapter — first user-facing `site.addContextBuilding` flow.
4. **PG0.7 / GS0.6** — Site authoring UI shipped.
5. **PG0.10 / GS0.8** — IfcSite full-attribute round-trip (C25 IFC-α-1 + this contract's §1.4 hard validation).
6. **PG0.11 / GS0.9** — This contract moves from DRAFT to CANONICAL.
7. **Post-PG0** — `Project.location` removed in next schema-breaking version (C47).

---

## §9 — What is NOT in this contract

This contract intentionally does NOT cover the following — boundary clarity matters:

| Concern | Owner |
|---|---|
| Coordinate transforms (WGS84 ↔ scene, LTP-ENU rebasing, logarithmic depth buffer) | [C12 Geospatial](./C12-GEOSPATIAL.md) — C19 only carries the schema shape of `SiteLocation`; the math is C12's. |
| Climate / weather / wind / temperature data (EPW reader, NOAA normals, IWEC, wind rose) | [C21 Climate Ingestion](./C21-CLIMATE-INGESTION.md) (proposed) — C19 only carries a `climateRef` string. |
| Building → Level → Apartment → Room hierarchy (the WHAT-LIVES-ON-THE-SITE) | [C20 Building & Apartment Aggregates](./C20-BUILDING-AND-APARTMENT-AGGREGATES.md) (proposed) — C19 only carries a `buildingRef` link. |
| Project session model, project switching, store reset sequencing | [C13 Project Lifecycle & Isolation](./C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) — C19's §1.11 invariant references C13 §3.7. |
| Site address / land title PII handling, encryption-at-rest, share-link permissions | [C22 Privacy & PII Tier](./C22-PRIVACY-AND-PII-TIER.md) (proposed) — C19 marks `siteAddress` + `landTitleNumber` as PII; the storage/permission policy is C22's. |
| AI-generated site context audit trail, reproducibility, prompt/output provenance | [C23 Provenance & AI Audit](./C23-PROVENANCE-AND-AI-AUDIT.md) (proposed) — C19 carries the `ProvenanceRecord` schema shape but not the audit-log surface or retention policy. |
| Jurisdiction-specific building code databases (UK Approved Documents, IBC, NCC) | Future contract (TBD) — C19's `Parcel.zoning.jurisdictionRef` is the hook, but the registry + code-lookup is not C19. |
| Terrain / DEM / slope analysis | C19 anticipates a `SiteModel.terrain?` extension but does NOT codify the DEM tile pipeline. Future C19 amendment OR a new contract under PG0.5 (climate sibling). |
| Cesium ion pricing, license tiers, fallback to MapLibre / self-hosted tiles | Operations / commerce concern. See [C39 Pricing & Plan Tiers](./C39-PRICING-AND-PLAN-TIERS.md) (proposed). |
| IFC `IfcSite` write-out + `IfcMapConversion` writing | [C25 IFC Export §1.4](./C25-IFC-EXPORT-PRODUCTION.md) — uses this contract's schema as input. |
| IFC `IfcSite` read-in + `IfcProjectedCRS` parsing | [C12 §1.2](./C12-GEOSPATIAL.md) + future C26 Revit/IFC import contract; produces a `SiteModel` per §8.3. |
| Element preview colours for Site/Parcel/Footprint authoring | [C18 Element Preview Visual Contract](./C18-ELEMENT-PREVIEW-VISUAL-CONTRACT.md) — C19 §5.5 only points at C18. |
| Site versioning across breaking schema changes | [C47 File-Format Versioning](./C47-FILE-FORMAT-VERSIONING.md) (proposed) — C19 §8.2 carries the v1→v2→v3 narrative but not the migration-runner machinery. |
| Multi-site portfolios (a single PRYZM project containing multiple sites) | Explicitly out of scope (§1.1). A future "portfolio" contract MAY revisit; until then, multi-site = multi-project. |
| Multi-building parcels (a single Site containing multiple Buildings) | [C20](./C20-BUILDING-AND-APARTMENT-AGGREGATES.md) extension territory; §1.10 anticipates it but defers the schema. |

---

## §10 — Open design questions (§N — pending decision tags)

The following items are flagged for ratification review. Each `§10.N — pending` becomes either an invariant addition, a §9 scope-out, or an ADR before C19 ratifies from DRAFT to CANONICAL.

### §10.1 — pending: parcel edge classification authoring

Edge classifications (front / side / rear) are required for §1.6 setback compliance. Today there is no UI surface for assigning them. Options:

- **A** — User clicks each edge after drawing the polygon and tags it.
- **B** — Heuristic: edge nearest the longest street (per ingested street data) = front; opposite = rear; remaining = side.
- **C** — Required field at `site.setParcelBoundary` time (no defaults — user MUST classify).

Recommendation: **B** as default with **A** as override. Pending product review.

### §10.2 — pending: zoning jurisdiction registry shape

`Parcel.zoning.jurisdictionRef` points at a future jurisdiction registry. Whether that registry is per-tenant, per-project, or a platform singleton is undecided. The §1.4 invariant DOES NOT depend on this — zoning attributes are stored locally on the parcel — but cross-project zoning lookups (e.g. "all my LA-county projects") need a registry shape. Pending C21/C22 ratification (they share the platform-singleton question).

### §10.3 — pending: ContextBuilding polygon decimation algorithm

§1.8 mandates decimation to ≤ 100 polygons per ContextBuilding. The specific algorithm (Quadric Edge Collapse, Visvalingam-Whyatt, custom) is not specified. The decimation MUST be deterministic (same input → same output) for snapshot reproducibility but the algorithm choice is a runtime concern. Pending L1 implementation in PG0.4.

### §10.4 — pending: site.replace undo size cap

`site.replace` snapshots the entire prior `SiteModel`. For a site with 200 ContextBuildings × 100 polygons each, that snapshot is ~5 MB. The undo ring buffer (per `memory/undo-architecture-three-stores.md`) may need a per-element size cap. Pending [C03 §4.5–§4.8](./C03-SCHEMAS-COMMANDS-AND-STATE.md) amendment.

### §10.5 — pending: Site-less mode

The base assumption (§1.1) is that every project has exactly one Site, auto-promoted at load. Some user scenarios (concept design, fictional projects, educational) may benefit from an explicit "site-less" toggle — present the Site UI with `disabled=true` and skip Site-derived behaviours (no LTP-ENU recentre on edit, no climate, no IfcSite write). The `geospatial-foundation.md §12 Option B` analysis says site-less mode is preserved indefinitely; the contract today preserves it implicitly (an auto-promoted Site with empty parcel + null climate is functionally site-less). Whether to surface the toggle in UI is a product decision. Pending.

### §10.6 — pending: ContextBuilding sub-typing for materiality

The §2.5 schema treats ContextBuildings as opaque massing. For privacy / view / acoustic analysis, the building's material (glass curtain wall vs solid brick) may matter. Whether to add a `material: 'opaque' | 'glazed' | 'mixed'` field — and whether to ingest that from Cesium's 3D Tiles attribution if available — is open. Pending L1-α facade-analysis review.

### §10.7 — pending: cross-Site references for federated projects

Future federated projects (multiple PRYZM projects collaborating on a shared site, e.g. two architects per parcel) may want a shared `SiteModel` referenced by `SiteRef` from each project. §1.1 ("one Site per Project") would need clarification: "one OWNED Site per Project; referenced Sites are read-only." Pending [C08 Collaboration & Security](./C08-COLLABORATION-AND-SECURITY.md) amendment.

---

## §11 — Cross-references

This contract intersects with the following:

- [C00 Index](./README.md) — register C19 entry on ratification.
- [C03 Schemas, Commands & State](./C03-SCHEMAS-COMMANDS-AND-STATE.md) — Site commands follow C03 §3 patterns; Site undo follows C03 §4.5–§4.8.
- [C05 Persistence & File Format](./C05-PERSISTENCE-AND-FILE-FORMAT.md) — `Project.site` is a new top-level snapshot field; the §8.1 loader is wired into the C05 load pipeline.
- [C08 Collaboration & Security](./C08-COLLABORATION-AND-SECURITY.md) — `site:edit` permission scope; share-link gating for `SiteLocation.siteAddress` / `landTitleNumber`.
- [C09 AI & Visibility Intent](./C09-AI-AND-VISIBILITY-INTENT.md) — apartment-layout / lighting / furnish workflow inputs gain optional `siteRef: SiteId`; output schemas gain provenance carrying the snapshot's `SiteModel.provenance.ingestTimestamp`.
- [C10 Performance & Observability](./C10-PERFORMANCE-AND-OBSERVABILITY.md) — `pryzm.site.*` span family registered.
- [C11 Element Creation Pipeline](./C11-ELEMENT-CREATION-PIPELINE.md) — Site is a first-class element through the same polymorphic pipeline; no special-casing.
- [C12 Geospatial](./C12-GEOSPATIAL.md) — parent of the coordinate substrate; C19 sits above it.
- [C13 Project Lifecycle & Isolation](./C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) — §1.11 site-teardown invariant joins the C13 teardown sequence.
- [C14 Legacy Elimination](./C14-LEGACY-ELIMINATION-AND-PRYZM3-ENFORCEMENT.md) — site.* commands MUST NOT use `commandManager.execute`.
- [C16 Command Authoring Protocol](./C16-COMMAND-AUTHORING-PROTOCOL.md) — all §4 commands are CA-1…CA-16 compliant.
- [C17 Batch Creation Catalogue](./C17-BATCH-CREATION-CATALOGUE-AND-PANEL-BINDING.md) — §4.3 forbids a Site batch entry.
- [C18 Element Preview Visual](./C18-ELEMENT-PREVIEW-VISUAL-CONTRACT.md) — §5.5 colour rule.
- [C20 Building & Apartment Aggregates](./C20-BUILDING-AND-APARTMENT-AGGREGATES.md) (proposed) — consumes `SiteModel.buildingRef`; references this contract's §1.10 boundary.
- [C21 Climate Ingestion](./C21-CLIMATE-INGESTION.md) (proposed) — populates `SiteModel.climateRef`; references this contract's §1.9 boundary.
- [C22 Privacy & PII Tier](./C22-PRIVACY-AND-PII-TIER.md) (proposed) — gates `SiteLocation.siteAddress` / `landTitleNumber`.
- [C23 Provenance & AI Audit](./C23-PROVENANCE-AND-AI-AUDIT.md) (proposed) — consumes the §2.6 ProvenanceRecord shape.
- [C25 IFC Export §1.4](./C25-IFC-EXPORT-PRODUCTION.md) — IfcSite attribute population reads `SiteModel.location`.
- [C27 BIM3 Inspect Model](./C27-BIM3-INSPECT-MODEL.md) — the Site Inspector (§5.3) is the C27 surface for Site state.
- [C28 Data Panel & Automation](./C28-DATA-PANEL-AND-AUTOMATION.md) — Site attributes are queryable via the data grid; FAR / setback / area derivations are formula fields.
- [C31 Documentation Authoring Protocol §2.1](./C31-DOCUMENTATION-AUTHORING-PROTOCOL.md) — this contract conforms to the §2.1 anatomy.

External (non-contract) references:

- [geospatial-foundation.md](../../03-execution/plans/geospatial-foundation.md) — PG0 platform plan; PG0.1, PG0.2, PG0.4, PG0.7, PG0.10, PG0.11 deliver this contract's surface.
- [geospatial-and-site-intelligence.md](../../03-execution/plans/geospatial-and-site-intelligence.md) — apartment-consumer plan; GS0.1, GS0.2, GS0.3, GS0.6, GS0.8, GS0.9 deliver this contract's apartment-specific consumer integration.
- [MISSING-CONTRACTS-AUDIT-2026-06-01.md §3.1](../MISSING-CONTRACTS-AUDIT-2026-06-01.md) — the audit row that scoped this contract.

---

## §12 — Contract history

| Date | Change |
|---|---|
| 2026-06-01 | Initial DRAFT — fills the C19 reserved slot per the Phase-3.5 missing-contracts audit. Author: Phase-3.5 documentation track. |
