# C21 — Climate Ingestion

> **Stamp**: 2026-06-01 · **Status**: DRAFT
> **Scope**: how PRYZM ingests, normalises, caches, and serves climate data (EPW · NOAA · solar position · wind · temperature) to every site-aware workflow; sister contract to [C12 Geospatial](./C12-GEOSPATIAL.md) (coordinate substrate) and the future [C19 Site Model](./C19-SITE-MODEL-AND-PARCEL.md) (parcel + jurisdiction).
> **Depends on**: [C03 Schemas, Commands & State](./C03-SCHEMAS-COMMANDS-AND-STATE.md) · [C09 AI & Visibility Intent](./C09-AI-AND-VISIBILITY-INTENT.md) · [C10 Performance & Observability](./C10-PERFORMANCE-AND-OBSERVABILITY.md) · [C12 Geospatial](./C12-GEOSPATIAL.md) · [C16 Command Authoring Protocol](./C16-COMMAND-AUTHORING-PROTOCOL.md)
> **Downstream**: `packages/climate-host/` (new), `packages/ai-host/src/workflows/apartmentLayout/environment/`, every Cognition-Stack L1 environmental engine, every site-aware AI workflow (apartment / facade / lighting / massing / MEP), the IFC `IfcSite` exporter, and the future Inspect / Schedule surfaces that quote heating-load / daylight-autonomy figures.
> **Key principles**: P1 (single composition root — `composeRuntime()` wires `ClimateHost`) · P5 (schemas pure — climate schemas live in `packages/schemas/`) · P6 (commands are the only mutation path) · P8 (every public function adds an OTel span)

---

## §1 — Invariants

The numbered rules below are RFC 2119 normative. Code that violates any of them fails CI.

### §1.1 — Climate data is anchored to a Site (lat/lon)

Every `ClimateDataset` MUST carry a `siteRef` (an opaque Site element id, per the future [C19 Site Model](./C19-SITE-MODEL-AND-PARCEL.md)) AND a copy of the resolved `(lat, lon, elevationM)` triple at the moment of ingestion. Orphan climate datasets (no `siteRef`) MUST NOT be persisted; an attempt to ingest without a Site MUST fail with the typed error `ClimateIngestionError.kind = 'no-site'`. Workflows that need climate data MUST query by `siteRef`, not by raw lat/lon — the resolution of `siteRef → climate` is the `ClimateStore`'s job (per §3).

**Rationale.** A climate dataset without a Site is unprovenanced data: it cannot be invalidated when the Site moves (e.g. a parcel re-survey shifts coordinates), it cannot be share-link-gated (per the future C22), and it cannot be audited (per the future C23 Provenance). The Site is the ONLY legitimate anchor.

### §1.2 — EPW is authoritative; NOAA normals are fallback

When a site has BOTH an ingested EPW file AND NOAA monthly normals available, the `ClimateStore.resolve(siteRef)` API MUST return the EPW-derived dataset. NOAA normals MUST be returned only when EPW is absent or has been explicitly invalidated. The dataset's `source` field MUST record which path served the query (`'epw'` | `'noaa-normals'` | `'fallback-defaults'`) so downstream consumers (and audits) can see the data quality tier they consumed.

`'fallback-defaults'` is the lowest tier — a hard-coded mid-latitude temperate climate used ONLY for projects without geocoded coordinates (concept design, fictional projects). Workflows that require real climate (energy simulation, sun-shadow analysis, code-bound thermal calcs) MUST refuse to run against `'fallback-defaults'` and surface a user-facing prompt to ingest EPW or refresh NOAA.

### §1.3 — Solar position is COMPUTED, never stored

`SolarSample` records (per-hour altitude + azimuth + irradiance) MUST be computed at query time from `(lat, lon, dateTime)` using the NOAA solar position algorithm (the same algorithm `packages/core-app-model/src/rendering/RealSunService.ts` already implements). The `ClimateDataset` MUST NOT persist solar samples — they are derived, deterministic, and cheap to recompute (< 0.1 ms per sample, per §7).

Persisting solar samples would (a) bloat the dataset by ~50 KB per year, (b) drift if the algorithm version bumps, and (c) duplicate truth (lat/lon already encodes the sun). Any consumer that wants a year of hourly sun positions MUST iterate `SolarPathReader.sample(lat, lon, dateTime)` itself; the reader MUST be pure + deterministic + side-effect-free.

### §1.4 — Cache key is (lat·100 round, lon·100 round, dataset version)

The `ClimateCacheKey` MUST be a tuple `{ latE2: number; lonE2: number; datasetVersion: string }` where `latE2 = Math.round(lat * 100)` (i.e. latitude rounded to 0.01° ≈ 1.1 km at the equator) and `lonE2` likewise. `datasetVersion` is the SemVer of the upstream dataset (`'epw-2024.1'`, `'noaa-normals-1991-2020'`, etc.).

**Rationale.** EPW + NOAA data is identical across all sites within ~1 km of each other (climate stations are typically 10-100 km apart). Coarsening the key to 0.01° lets every project in a city share a single cache entry, raising hit ratio above 95 % (per §7) without compromising fidelity. The dataset version is part of the key so a NOAA reissue (e.g. 2030 normals replacing 1991–2020) does NOT silently change downstream answers — the new dataset gets a new cache slot, and consumers explicitly re-resolve.

### §1.5 — Cache invalidates when dataset version bumps

When `ClimateStore` detects an upstream dataset-version bump (NOAA publishes new normals, EPW vendor reissues a TMY3 file), it MUST:

1. Mark every cache entry with the OLD `datasetVersion` as `stale`.
2. Emit an OTel event `pryzm.climate.dataset_version_bump` with `{ oldVersion, newVersion, affectedSites: number }`.
3. KEEP serving the stale entry to in-flight queries (no mid-flight switch); the next query that opts into the fresh version reads the new dataset.
4. NEVER delete the stale entry — it is retained for audit + reproducibility (per the future C23 Provenance).

Workflows that have already consumed the stale entry MUST NOT be silently re-run against the new entry; that is a separate user action (a `climate.refreshNOAA(siteId)` command per §4).

### §1.6 — Every climate query emits an OTel span

Per P8, every public exported function in `packages/climate-host/` MUST emit an OpenTelemetry span. Span names follow the pattern `pryzm.climate.<verb>`:

- `pryzm.climate.ingestEpw` — file → ClimateDataset
- `pryzm.climate.refreshNoaa` — site → ClimateDataset
- `pryzm.climate.resolveSite` — siteRef → ClimateDataset
- `pryzm.climate.solarSample` — (lat, lon, dateTime) → SolarSample
- `pryzm.climate.windRose` — siteRef → WindRoseAggregate
- `pryzm.climate.invalidateCache` — siteRef → void

Each span MUST carry attributes `{ siteRef?, latE2?, lonE2?, datasetVersion?, source?, cacheHit?, durationMs }`. The CI gate `check-otel-spans.ts` (planned, per [C10 §3](./C10-PERFORMANCE-AND-OBSERVABILITY.md)) enforces presence.

### §1.7 — Climate data is read-only after ingestion

No editor command, no UI, no AI workflow MAY mutate a `ClimateDataset` after it has been ingested. The only legitimate write paths are:

- `climate.ingestEPW` — initial creation OR replacement of an existing dataset
- `climate.refreshNOAA` — refresh NOAA-sourced dataset to current vintage
- `climate.invalidateCache` — mark cache entries stale (does NOT delete)

A `ClimateDataset` is treated as a value, not an entity: editing fields in place is forbidden. To change anything, ingest a new dataset. The command bus (per [C03 §6 P6](./C03-SCHEMAS-COMMANDS-AND-STATE.md)) is the only way through; direct store writes from UI or AI code fail the lint rule `no-direct-climate-store-write` (planned).

### §1.8 — Units are SI, with explicit unit-bearing field names

Every numeric field on every climate schema MUST carry its unit in the field name OR have an explicit `unit` sibling field. Mandatory conventions:

| Quantity | Unit | Convention |
|---|---|---|
| Temperature | °C | field name ends `…C` (e.g. `dryBulbC`, `dewPointC`) |
| Wind speed | m/s | field name ends `…Mps` (e.g. `windSpeedMps`) |
| Wind direction | degrees from N, clockwise | field name ends `…Deg` (e.g. `windDirDeg`) |
| Solar irradiance | W/m² | field name ends `…Wm2` (e.g. `directNormalWm2`) |
| Precipitation | mm | field name ends `…Mm` (e.g. `precipMm`) |
| Relative humidity | % | field name ends `…Pct` (e.g. `relHumidityPct`) |
| Pressure | Pa | field name ends `…Pa` (e.g. `stationPressurePa`) |
| Cloud cover | tenths (0–10) | field name ends `…Tenths` (e.g. `totalCloudTenths`) |
| Visibility | km | field name ends `…Km` (e.g. `visibilityKm`) |
| Time | ISO 8601 UTC | field name `…UtcIso` or `…At` |

EPW source files MAY use imperial units (rare — EPW is SI by default); the reader MUST convert at ingestion and persist only SI. The CI gate `check-climate-units.ts` (per §6) scans for unit-less numeric fields in climate schemas.

### §1.9 — Time is UTC at storage, local at presentation

All persisted timestamps in `ClimateDataset` MUST be UTC (ISO 8601 with `Z` suffix). Local time MUST be derived at presentation time from the site's `(lat, lon)` + IANA timezone resolved via the future Site Model (per C19 §N — TBD). A climate dataset that stores local timestamps is non-deterministic across DST boundaries and across editor users in different timezones, so this rule is non-negotiable.

EPW TMY3 hour-of-year indices (1–8760) MUST be converted to UTC datetimes during ingestion using the file's `Time Zone` header field; the original local-hour index MAY be retained as a sibling field `localHourOfYear` for trace / debug.

### §1.10 — Discipline-neutral by design

`ClimateDataset` MUST NOT carry any residential-only / commercial-only / industrial-only fields. The schema is the LOWEST-COMMON-DENOMINATOR shape every discipline needs (apartment generation, office facade design, hospital MEP sizing, industrial wind loading). Discipline-specific derived quantities (e.g. "heating-degree-days base 18°C" — an HVAC convention; or "wind pressure coefficient at level 12" — a structural convention) MUST be derived by the consumer, not stored on the dataset.

This is the same principle PG0.12 (Discipline-Neutrality Audit, per [docs/03-execution/plans/geospatial-foundation.md §13](../../03-execution/plans/geospatial-foundation.md)) applies to Site / Building / Apartment aggregates.

### §1.11 — No live forecasting

C21 covers DESIGN-TIME climate ingestion only. Real-time weather APIs, 7-day forecasts, current observations, and any "what is the weather right now" surface are EXPLICITLY out of scope (see §9). PRYZM is a design tool; consumers needing live weather (digital-twin operations) integrate via a separate twin contract (TBD).

EPW + NOAA normals + future IWEC / WeatherKit historical APIs are all DESIGN-TIME data: typical years, multi-decade averages. Their values do not change minute-by-minute. This invariant lets C21 commit to long cache TTLs (months to years) without staleness concerns.

### §1.12 — Provenance fields are mandatory

Every `ClimateDataset` MUST carry, alongside the climate fields proper, a `provenance` block:

```typescript
provenance: {
  source: 'epw' | 'noaa-normals' | 'fallback-defaults';
  vendor: string;                  // e.g. 'EnergyPlus.net', 'NOAA NCEI', 'PRYZM-builtin'
  datasetVersion: string;          // SemVer or vintage string
  filename?: string;               // if EPW upload
  fileSha256?: string;             // if EPW upload — for reproducibility
  fetchedAtUtcIso: string;         // when WE pulled the data
  license: string;                 // SPDX or vendor license string
  notes?: string;                  // free-form annotation
}
```

This is the C21 contribution to the future C23 Provenance contract — every site-derived datum traces back to its source.

---

## §2 — Schema

All schemas live in `packages/schemas/src/climate/` (per P5 — pure, no I/O, no THREE, no DOM). The TypeScript shapes below are AUTHORITATIVE — the Zod definitions in the package must match.

### §2.1 — `ClimateDataset`

The unified shape every workflow consumes, regardless of whether ingest source was EPW or NOAA.

```typescript
interface ClimateDataset {
  /** Stable id, set by ClimateStore at ingestion. Format: 'climate:<ulid>'. */
  readonly id: ClimateDatasetId;
  /** Site this dataset belongs to (per §1.1). */
  readonly siteRef: SiteId;
  /** Resolved coordinates at ingestion time (defensive copy from Site). */
  readonly lat: number;
  readonly lon: number;
  readonly elevationM: number;
  /** IANA timezone (e.g. 'Europe/London'). Resolved from lat/lon at ingestion. */
  readonly timezone: string;
  /** Source tier per §1.2. */
  readonly source: 'epw' | 'noaa-normals' | 'fallback-defaults';
  /** Per-hour TMY records (present only when source = 'epw'). 8760 entries. */
  readonly hourly?: readonly EPWRecord[];
  /** Per-month NOAA normals (present for both 'epw' and 'noaa-normals'). 12 entries, Jan..Dec. */
  readonly monthlyNormals: readonly NOAANormal[];
  /** Wind rose aggregate (16 sectors × 6 speed bins). Derived from hourly OR monthly. */
  readonly windRose: WindRoseAggregate;
  /** Design temperatures per ASHRAE 99 % / 1 % convention. */
  readonly designTemps: DesignTemperatures;
  /** Heating + cooling degree-day aggregates at standard bases. */
  readonly degreeDays: DegreeDayAggregates;
  /** Provenance block per §1.12. */
  readonly provenance: ClimateProvenance;
  /** UTC timestamp when this dataset record was persisted. */
  readonly ingestedAtUtcIso: string;
}
```

### §2.2 — `EPWRecord`

One per hour-of-year. Present only when source = 'epw'. Fields mirror the EPW TMY3 standard but renamed to PRYZM unit conventions.

```typescript
interface EPWRecord {
  readonly utcIso: string;            // ISO 8601 UTC
  readonly localHourOfYear: number;   // 1..8760 — original file index
  readonly dryBulbC: number;
  readonly dewPointC: number;
  readonly relHumidityPct: number;
  readonly stationPressurePa: number;
  readonly directNormalWm2: number;   // beam radiation
  readonly diffuseHorizontalWm2: number;
  readonly globalHorizontalWm2: number;
  readonly windSpeedMps: number;
  readonly windDirDeg: number;        // 0 = N, 90 = E, clockwise
  readonly totalCloudTenths: number;
  readonly opaqueCloudTenths: number;
  readonly visibilityKm: number;
  readonly precipMm: number;
}
```

### §2.3 — `NOAANormal`

Monthly average. 12 records per dataset (Jan..Dec). Present for BOTH 'epw' (derived from hourly) AND 'noaa-normals' (the primary payload).

```typescript
interface NOAANormal {
  readonly month: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  readonly avgDryBulbC: number;
  readonly avgMinDryBulbC: number;
  readonly avgMaxDryBulbC: number;
  readonly avgRelHumidityPct: number;
  readonly avgPrecipMm: number;        // monthly total
  readonly avgWindSpeedMps: number;
  readonly prevailingWindDirDeg: number;
  readonly avgGlobalHorizontalWm2: number;  // monthly mean of daily totals / hours
  readonly heatingDegreeDaysBase18: number;
  readonly coolingDegreeDaysBase18: number;
}
```

### §2.4 — `SolarSample` (NOT persisted — recomputed on demand per §1.3)

```typescript
interface SolarSample {
  readonly utcIso: string;
  readonly altitudeRad: number;     // radians above horizon; negative = below
  readonly azimuthRad: number;      // radians clockwise from N
  readonly isAboveHorizon: boolean;
  readonly approxDirectWm2: number; // closed-form estimate from altitude alone
}
```

### §2.5 — `WindSample` / `WindRoseAggregate`

```typescript
interface WindSample {
  readonly windDirDeg: number;
  readonly windSpeedMps: number;
}

interface WindRoseAggregate {
  /** 16 directional sectors, each spanning 22.5°. Index 0 = North (centred). */
  readonly sectors: readonly WindRoseSector[];
  /** Mean wind speed across the full year. */
  readonly meanSpeedMps: number;
  /** 99 %-percentile gust. */
  readonly p99SpeedMps: number;
}

interface WindRoseSector {
  readonly sectorDeg: number;        // 0, 22.5, 45, …, 337.5
  /** Frequency bins by speed: [0-1.5, 1.5-3.3, 3.3-5.4, 5.4-7.9, 7.9-10.7, >10.7] m/s (Beaufort-ish). */
  readonly speedBinHours: readonly [number, number, number, number, number, number];
}
```

### §2.6 — `DesignTemperatures` + `DegreeDayAggregates`

```typescript
interface DesignTemperatures {
  /** ASHRAE 99.6 % heating design dry-bulb (the coldest design point). */
  readonly heating99_6C: number;
  /** ASHRAE 0.4 % cooling design dry-bulb (the hottest design point). */
  readonly cooling0_4C: number;
  /** Mean coincident wet-bulb at the 0.4 % cooling point. */
  readonly cooling0_4MwbC: number;
}

interface DegreeDayAggregates {
  /** Heating degree-days base 18 °C (UK / ISO convention). */
  readonly hddBase18: number;
  /** Cooling degree-days base 18 °C. */
  readonly cddBase18: number;
  /** Heating degree-days base 65 °F (≈ 18.3 °C) for US-convention consumers. */
  readonly hddBase65F: number;
  /** Cooling degree-days base 65 °F. */
  readonly cddBase65F: number;
}
```

### §2.7 — `ClimateCacheKey`

```typescript
interface ClimateCacheKey {
  readonly latE2: number;          // round(lat * 100)
  readonly lonE2: number;          // round(lon * 100)
  readonly datasetVersion: string; // e.g. 'epw-tmy3-2024.1', 'noaa-normals-1991-2020'
}
```

Two keys are equal iff all three fields are equal (deep equality). The cache MUST use a canonical string serialisation `'${latE2}|${lonE2}|${datasetVersion}'` for hash-map lookup.

### §2.8 — `ClimateProvenance`

Per §1.12. The shape is given in full above; included here in the schema table for completeness:

| Field | Type | Required | Note |
|---|---|---|---|
| `source` | `'epw' \| 'noaa-normals' \| 'fallback-defaults'` | ✅ | mirrors `ClimateDataset.source` |
| `vendor` | `string` | ✅ | e.g. `'EnergyPlus.net'` |
| `datasetVersion` | `string` | ✅ | SemVer or vintage |
| `filename` | `string` | optional | EPW uploads only |
| `fileSha256` | `string` | optional | EPW uploads only |
| `fetchedAtUtcIso` | `string` | ✅ | ISO 8601 |
| `license` | `string` | ✅ | SPDX identifier preferred |
| `notes` | `string` | optional | free-form |

### §2.9 — Typed error

```typescript
type ClimateIngestionError =
  | { kind: 'no-site'; siteRef?: never }
  | { kind: 'epw-parse-failed'; line: number; message: string }
  | { kind: 'noaa-fetch-failed'; httpStatus: number; siteRef: SiteId }
  | { kind: 'license-violation'; license: string; siteRef: SiteId }
  | { kind: 'unit-conversion-failed'; field: string; rawValue: string }
  | { kind: 'site-coordinates-missing'; siteRef: SiteId };
```

Workflows that catch climate errors MUST exhaustively switch on `kind` (a TypeScript compile-time guarantee per the `assertNever` helper in `packages/runtime-composer/`).

---

## §3 — Stores / API surface

### §3.1 — `ClimateStore` (L3, per C01 layering)

`ClimateStore` lives in `packages/climate-host/src/ClimateStore.ts`. Constructed once by `composeRuntime()` (per P1); consumed by every workflow via `runtime.climate`.

```typescript
interface ClimateStore {
  /** Resolve climate for a site. Returns the highest-tier dataset available (per §1.2). */
  resolve(siteRef: SiteId): Promise<ClimateDataset>;

  /** Synchronous variant — returns the cached dataset OR throws 'no-cached-climate'. Used in hot paths. */
  resolveSync(siteRef: SiteId): ClimateDataset;

  /** Lower-level: get by cache key. Used by ingestion to dedupe across sites at the same coord. */
  getByCacheKey(key: ClimateCacheKey): ClimateDataset | undefined;

  /** Sample the sun position at (siteRef, dateTime). Solar is computed, NOT stored (per §1.3). */
  sampleSun(siteRef: SiteId, dateTimeUtc: Date): SolarSample;

  /** List all ingested datasets in the current project. Used by audit / Inspect surfaces. */
  list(): readonly ClimateDataset[];

  /** Subscribe to ingestion events (new dataset, refresh, invalidate). */
  subscribe(listener: (event: ClimateStoreEvent) => void): () => void;
}

type ClimateStoreEvent =
  | { kind: 'ingested'; datasetId: ClimateDatasetId; siteRef: SiteId }
  | { kind: 'refreshed'; datasetId: ClimateDatasetId; siteRef: SiteId }
  | { kind: 'invalidated'; cacheKey: ClimateCacheKey; affectedSites: readonly SiteId[] }
  | { kind: 'dataset-version-bump'; oldVersion: string; newVersion: string };
```

`ClimateStore` is read-mostly. Writes happen only through the command bus (per §4 + §1.7). Subscribers receive events AFTER the store has settled — listener order is not deterministic, but a single listener sees events in the order they happened.

### §3.2 — `ClimateHost` (composition surface)

```typescript
interface ClimateHost {
  readonly store: ClimateStore;
  /** Ingest pipeline — wired into command handlers. */
  readonly ingest: {
    epw(file: ArrayBuffer | string, siteRef: SiteId, license: string): Promise<ClimateDataset>;
    noaa(siteRef: SiteId): Promise<ClimateDataset>;
    fallbackDefaults(siteRef: SiteId): ClimateDataset;
  };
  /** Reader interfaces — each is independently testable + injectable. */
  readonly readers: {
    epw: EPWReader;
    noaa: NOAAReader;
    solar: SolarPathReader;
  };
  /** Cache — pluggable so tests can use an in-memory impl. */
  readonly cache: ClimateCache;
}
```

`composeRuntime()` constructs ONE `ClimateHost` and exposes it as `runtime.climate`. Plugin code accesses it via the SDK facade `import { useClimateHost } from '@pryzm/plugin-sdk'`.

### §3.3 — Reader interfaces

```typescript
interface EPWReader {
  /** Parse an EPW file into 8760 EPWRecords + monthly aggregates. Pure; no I/O. */
  parse(epwContent: string): { hourly: readonly EPWRecord[]; monthly: readonly NOAANormal[]; timezone: string; lat: number; lon: number; elevationM: number };
}

interface NOAAReader {
  /** Fetch monthly normals for a site. Hits the NOAA NCEI API; honours licence. */
  fetchNormals(lat: number, lon: number): Promise<readonly NOAANormal[]>;
}

interface SolarPathReader {
  /** NOAA solar position algorithm. Pure; no I/O. < 0.1 ms per call (§7.2). */
  sample(lat: number, lon: number, dateTimeUtc: Date): SolarSample;
  /** Convenience: an iterator over a year of hourly samples. Used by daylight-autonomy calcs. */
  sampleYear(lat: number, lon: number, year: number): Iterable<SolarSample>;
}
```

`SolarPathReader` is implemented today by `packages/core-app-model/src/rendering/RealSunService.ts` — the migration plan (§8) moves the pure NOAA algorithm into `packages/climate-host/` so `RealSunService` reduces to a Three.js-side adapter.

### §3.4 — `ClimateCache`

```typescript
interface ClimateCache {
  get(key: ClimateCacheKey): ClimateDataset | undefined;
  put(key: ClimateCacheKey, dataset: ClimateDataset): void;
  invalidate(key: ClimateCacheKey): void;
  invalidateByVersion(datasetVersion: string): readonly ClimateCacheKey[];
  /** For audit. Listed in cache-key order. */
  entries(): IterableIterator<readonly [ClimateCacheKey, ClimateDataset]>;
  /** Diagnostics — hit/miss/evict counts since process start. */
  stats(): { hits: number; misses: number; entries: number };
}
```

The default in-process cache is an in-memory LRU bounded at 256 entries (256 sites' worth of climate × ~50 KB/each EPW ≈ 13 MB worst case — acceptable). A persistent cache (PG0.5 deliverable per the geospatial-foundation plan) MAY be wired in later via a second `ClimateCache` impl; the interface is stable.

---

## §4 — Commands

All climate-affecting state changes flow through the command bus (per P6 + [C16 Command Authoring Protocol](./C16-COMMAND-AUTHORING-PROTOCOL.md)). Five commands cover the surface; all live in the `climate.*` namespace.

### §4.1 — `climate.ingestEPW`

```typescript
{
  kind: 'climate.ingestEPW';
  siteRef: SiteId;
  /** EPW file as string OR base64-encoded ArrayBuffer. */
  fileContent: string;
  /** SPDX licence identifier; rejected if vendor licence is not on the allow-list. */
  license: string;
}
```

**Effect.** Parses the EPW, derives the WindRose + DegreeDays + DesignTemps + monthly aggregates, writes to `ClimateStore`, evicts any prior dataset for the same `siteRef`, emits `ingested` event. Idempotent on `(siteRef, fileSha256)` — re-ingesting the same file is a no-op.

**Undo.** Restores the prior dataset (if any) OR clears the dataset.

### §4.2 — `climate.refreshNOAA`

```typescript
{
  kind: 'climate.refreshNOAA';
  siteRef: SiteId;
}
```

**Effect.** Fetches the latest NOAA normals for the site's `(lat, lon)`, writes to `ClimateStore` at the lower-priority tier (EPW, if present, still wins on resolve). Emits `refreshed`.

**Undo.** Restores the prior NOAA-tier dataset (the EPW tier is unaffected).

### §4.3 — `climate.invalidateCache`

```typescript
{
  kind: 'climate.invalidateCache';
  siteRef: SiteId;
  /** Optional reason for audit. */
  reason?: 'manual' | 'site-moved' | 'license-revoked' | 'version-bump';
}
```

**Effect.** Marks every cache entry for the site as stale. Does NOT delete. Emits `invalidated` event with the affected sites.

**Undo.** None — invalidation is a one-way operation. (Re-ingest to re-populate.)

### §4.4 — `climate.applyFallbackDefaults`

```typescript
{
  kind: 'climate.applyFallbackDefaults';
  siteRef: SiteId;
}
```

**Effect.** Writes the hard-coded mid-latitude temperate `ClimateDataset` (the `'fallback-defaults'` tier per §1.2). Used by load-time auto-promotion of pre-C19 projects.

**Undo.** Clears the dataset.

### §4.5 — `climate.dropDataset`

```typescript
{
  kind: 'climate.dropDataset';
  siteRef: SiteId;
}
```

**Effect.** Removes the dataset for a site. Used when a site is deleted (cascaded by the future C19 `site.delete` command) and for explicit user-requested removal.

**Undo.** Restores the dropped dataset.

Command authoring conforms to [C16 §3 (level-oriented) + §4 (semantic-first)](./C16-COMMAND-AUTHORING-PROTOCOL.md). Each handler emits a span `pryzm.command.climate.<verb>` in addition to the lower-level `pryzm.climate.<verb>` (per §1.6) so a single user action is observable end-to-end.

---

## §5 — UI

Climate UI lives in the Site authoring surface (the future GS0.6 / PG0.7 deliverable, per [docs/03-execution/plans/geospatial-and-site-intelligence.md §4](../../03-execution/plans/geospatial-and-site-intelligence.md)). C21 codifies the visual contract.

### §5.1 — Climate status badge

Every Site element in the Inspect tree (per [C27 BIM 3.0 Inspect](./C27-BIM3-INSPECT-MODEL.md)) MUST display a climate status badge. The badge has four states:

| State | Visual | When |
|---|---|---|
| **EPW** | Solid green dot + label "EPW (2024)" | `source === 'epw'` |
| **NOAA** | Solid amber dot + label "NOAA normals" | `source === 'noaa-normals'` |
| **Defaults** | Hollow grey dot + label "Default climate" | `source === 'fallback-defaults'` |
| **Stale** | Solid red dot + label "Dataset stale — refresh" | cache invalidated (per §1.5) |

Badge colours are unrelated to the §41 preview-purple convention — these are STATUS indicators, not interactive previews.

### §5.2 — Climate ingestion panel

The Site authoring panel MUST surface, alongside the parcel-drawing tools, a "Climate" subsection containing:

1. **Status row** — the badge from §5.1 + the dataset's `vendor` + `datasetVersion`.
2. **Action buttons** — `Ingest EPW…` (file picker → `climate.ingestEPW`), `Refresh NOAA` (→ `climate.refreshNOAA`), `Reset to defaults` (→ `climate.applyFallbackDefaults`).
3. **Wind-rose preview** — a small SVG wind rose (16 sectors, colour-graded by frequency) rendered from `WindRoseAggregate`. Click to expand.
4. **Design-temperature row** — heating 99.6 % + cooling 0.4 %.

When a site has no resolved coordinates, the panel renders the action buttons as disabled with a tooltip pointing to the Geocode step.

### §5.3 — Climate-quality gate dialog

When a user invokes a workflow that requires real climate (per §1.2 — e.g. `apartment.layout` with `'climate-aware'` toggle), and the resolved tier is `'fallback-defaults'`, the workflow MUST surface a modal:

> **Climate data needed.** This workflow uses real climate to choose window types, lighting scenes, and material recommendations. The current Site has no EPW or NOAA data ingested. Continue anyway with default mid-latitude climate, OR ingest data first?
>
> [Ingest EPW…] [Refresh NOAA] [Continue with defaults] [Cancel]

The modal is non-blocking and remembers the per-Site choice for the session.

### §5.4 — No climate editing UI

The schema is read-only post-ingestion (per §1.7). The UI MUST NOT expose fields to edit individual `EPWRecord` values, `NOAANormal` values, or any climate-derived aggregate. The only path to change climate data is re-ingestion.

---

## §6 — Tests / CI gates

### §6.1 — `check-climate-units.ts`

Static analysis: scans every Zod schema in `packages/schemas/src/climate/` for numeric fields whose names do not end with one of the unit suffixes in §1.8 (`C`, `Mps`, `Deg`, `Wm2`, `Mm`, `Pct`, `Pa`, `Tenths`, `Km`). Allow-list: `lat`, `lon`, `elevationM`, `month`, `localHourOfYear`, `sectorDeg`, `speedBinHours[*]`, and SemVer-like strings. Hard-fail at Phase 6.1 (currently soft-fail).

### §6.2 — `check-climate-completeness.ts`

Walks every Site in a representative test project; asserts that every site with `status === 'site-aware-AI-enabled'` (per the future C19 + C20) has a non-fallback `ClimateDataset` resolved. A site marked site-aware that has only `'fallback-defaults'` is a configuration error.

### §6.3 — `check-otel-spans.ts` (extended)

Existing P8 gate extended to require `pryzm.climate.*` spans on every public function in `packages/climate-host/`. Implementation reuses the AST scan from [C10 §3](./C10-PERFORMANCE-AND-OBSERVABILITY.md).

### §6.4 — `check-climate-immutability.ts`

Lint rule (typescript-eslint custom): forbids `Object.assign`, spread-mutation, or `as any` casts on values of type `ClimateDataset`, `EPWRecord`, `NOAANormal`, `WindRoseAggregate`. The schemas are sealed in TS via `readonly` modifiers; this gate catches runtime escapes.

### §6.5 — Unit tests

`packages/climate-host/__tests__/`:

- `EPWReader.test.ts` — round-trip parse of the bundled EPW fixture (London Gatwick TMY3); asserts 8760 hourly records + 12 monthly aggregates + correct unit conversions.
- `SolarPathReader.test.ts` — verifies solar altitude at known reference points (solstice noon at 51.5°N, equinox sunrise at the equator) within ±0.5°.
- `WindRoseAggregate.test.ts` — synthetic uniform input ⇒ even sector distribution; synthetic single-direction input ⇒ all hours in one sector.
- `ClimateCache.test.ts` — get/put/invalidate; LRU eviction at boundary; `invalidateByVersion` returns the right key list.
- `ClimateStore.test.ts` — `resolve` returns EPW over NOAA when both present; falls through to NOAA when EPW absent; falls through to defaults when neither present.
- `ingestionCommands.test.ts` — every command in §4 round-trips through the bus with undo.

### §6.6 — Property tests

`@fast-check` properties:

- `roundTripEPW(file) === file` for a curated set of fixtures (idempotent parse → serialise).
- `sampleSun(lat, lon, t).altitudeRad ∈ [-π/2, π/2]` for arbitrary `(lat, lon, t)`.
- `windRose.sectors.reduce(sum) === hourly.length` for any EPW (hours are accounted-for).

### §6.7 — Integration tests

`packages/climate-host/__tests__/integration/`:

- `apartment-climate-roundtrip.test.ts` — ingest EPW for siteX → `runtime.ai.apartment.layout({ siteRef: siteX, climateAware: true })` → assert the layout's `provenance` block cites the EPW dataset id.

---

## §7 — NFT targets

Per [C10 Performance & Observability](./C10-PERFORMANCE-AND-OBSERVABILITY.md). These are the binding non-functional-target budgets for C21.

### §7.1 — EPW ingestion < 2 s for 8760-hour file

An 8760-record EPW file (the standard TMY3 size, ≈ 1.5 MB text) MUST parse + derive aggregates + persist in under 2 s on the reference dev machine (M1 Pro / equivalent). The 2 s budget breaks down approximately as:

- Parse + tokenise: ≤ 600 ms
- Unit conversion + record assembly: ≤ 300 ms
- WindRose + DegreeDays + DesignTemps derivation: ≤ 400 ms
- Provenance + persistence: ≤ 200 ms
- Buffer for I/O + scheduling: 500 ms

Measured by `bench/epw-ingest.bench.ts` (planned). Hard-fail at Phase 6.1.

### §7.2 — Solar position lookup < 0.1 ms

`SolarPathReader.sample(lat, lon, dateTimeUtc)` MUST return in under 0.1 ms (100 µs) on the reference machine. This budget exists because daylight-autonomy calcs (the future Cognition-Stack L1 environmental engine) iterate 8760 times per room per design alternative — a single 0.1 ms call permits ~17 k samples per design iteration without blocking the frame.

Measured by `bench/solar-sample.bench.ts`. The current `RealSunService` implementation already meets this (per L1-α-2 internal bench).

### §7.3 — Cache hit ratio > 95 % in steady state

After the first day of authoring on a new site, the cache hit ratio for `resolve(siteRef)` calls in a project session MUST exceed 95 %. This is measured by `ClimateCache.stats().hits / (hits + misses)`.

Rationale: every site-aware workflow query resolves climate; the dataset rarely changes within a session; 95 % is achievable at the §1.4 cache-key granularity.

### §7.4 — NOAA fetch < 5 s p95

`NOAAReader.fetchNormals(lat, lon)` MUST complete in under 5 s at p95 over the test fixture suite. Failures (network, rate-limit) are caught and reported as `ClimateIngestionError.kind = 'noaa-fetch-failed'`; they do NOT count against the latency budget.

### §7.5 — Wind rose render < 16 ms

The `<WindRose />` UI component MUST render in under 16 ms (one frame at 60 Hz) on the reference machine for the 16-sector aggregate. Implementation is SVG (no `<canvas>`), no React-reconciliation in the hot path.

### §7.6 — Memory budget

`ClimateStore` resident memory MUST stay below 32 MB per project regardless of site count. With the LRU cache bound at 256 sites × ~50 KB/each ≈ 13 MB, this leaves headroom for solar samples, indexes, and wind-rose aggregates.

---

## §8 — Migration plan

### §8.1 — Today's substrate

- `packages/core-app-model/src/rendering/RealSunService.ts` — the NOAA solar position algorithm + Three.js DirectionalLight management. Already used by the viewport.
- `packages/ai-host/src/workflows/apartmentLayout/environment/facadeValueField.ts` — hard-coded mid-latitude sunlight scores by cardinal direction (§1.10 — discipline-neutral defaults).
- `packages/ai-host/src/workflows/apartmentLayout/environment/daylightDepthField.ts` — daylight-depth approximation; NOT yet climate-aware.
- No EPW reader.
- No NOAA reader.
- No `ClimateStore`, no `ClimateHost`.

### §8.2 — Migration steps (aligned with PG0.5)

1. **Create `packages/climate-host/`** — new L3 package. Layered above `packages/schemas/` (L0) + `packages/runtime-composer/` (L3). Re-exports nothing into `plugin-sdk` initially (workflows access via `runtime.climate`).
2. **Move the NOAA solar algorithm.** Extract the pure portion of `RealSunService.ts` into `packages/climate-host/src/readers/SolarPathReader.ts`. `RealSunService` is reduced to a Three.js adapter that calls `SolarPathReader.sample` + manages the DirectionalLight. No behaviour change. ~150 LOC migrated.
3. **Add `EPWReader`.** ~400 LOC pure parser + unit conversion + aggregate derivation. Bundled fixture: London Gatwick TMY3 (~30 KB). Tests per §6.5.
4. **Add `NOAAReader`.** ~200 LOC NCEI API client + license check + caching. The NOAA NCDC normals API is free + open-licensed but rate-limited; the reader honours `Retry-After`.
5. **Add `ClimateStore` + `ClimateHost` + `ClimateCache`.** ~500 LOC plus tests.
6. **Wire into `composeRuntime()`.** ~30 LOC change in `packages/runtime-composer/`. `runtime.climate` becomes available.
7. **Wire commands.** Five new command handlers per §4. ~300 LOC + tests.
8. **Site authoring panel.** ~200 LOC UI (the panel itself is a PG0.7 deliverable; C21 contributes only the climate subsection).
9. **Update `facadeValueField.ts` to accept an optional `ClimateDataset`.** When present, sunlight scores are scaled by latitude + seasonal sun path; when absent (legacy callers), fall back to the hard-coded mid-latitude table per §1.10. Backward-compatible.
10. **Update `daylightDepthField.ts` to accept an optional `ClimateDataset`.** Same pattern.
11. **Update apartment-layout workflow input schema.** Optional `climateRef: ClimateDatasetId` added to `ApartmentLayoutOptions` (per [C09 §3.4](./C09-AI-AND-VISIBILITY-INTENT.md)). Workflows that pass `climateAware: true` plus a `siteRef` resolve climate via `runtime.climate.store.resolve(siteRef)`.
12. **Auto-promotion at load.** Projects loaded without a Site element trigger `climate.applyFallbackDefaults(legacySiteId)` so every workflow can assume `runtime.climate.store.resolve(siteRef)` always returns a dataset. The legacy mode is preserved indefinitely (per [docs/03-execution/plans/geospatial-foundation.md §8](../../03-execution/plans/geospatial-foundation.md)).

### §8.3 — Backward compatibility

- Projects without a Site (every project before C19 lands) auto-receive a default Site at load time, with `climate.applyFallbackDefaults` populated. Existing workflows see no behaviour change.
- The current `RealSunService` API is preserved: callers still call `realSunService.setConfig({ lat, lng, date })`. The pure-algorithm refactor is invisible.
- The `facadeValueField` + `daylightDepthField` signatures gain optional parameters; existing call sites compile + behave identically.

### §8.4 — Sequencing within PG0

C21 is deliverable PG0.5 (per [docs/03-execution/plans/geospatial-foundation.md §13](../../03-execution/plans/geospatial-foundation.md)). It depends on PG0.1 (Site / Building / Apartment schemas) for the `SiteId` type, and feeds PG0.8 (site-aware AI workflow extension) + PG0.9 (site-aware environmental fields). Estimated 2 dev-weeks (per the plan).

### §8.5 — Contract issuance

This contract (C21) is initially DRAFT; it ratchets to CANONICAL after:

1. The `packages/climate-host/` package lands.
2. At least one AI workflow (apartment-layout is the canonical first consumer) consumes climate via `runtime.climate`.
3. The CI gates in §6.1–§6.4 are wired (initially soft-fail; ratchet to hard-fail per [C31 §5](./C31-DOCUMENTATION-AUTHORING-PROTOCOL.md)).

---

## §9 — What is NOT in this contract

- **Site geometry** (parcel boundary, jurisdiction, terrain) — owned by the future [C19 Site Model & Parcel](./C19-SITE-MODEL-AND-PARCEL.md). C21 only assumes a `SiteId` exists and resolves to `(lat, lon, elevationM)`.
- **Coordinate transforms** (LTP-ENU rebasing, EPSG handling, IfcProjectedCRS round-trip) — owned by [C12 Geospatial](./C12-GEOSPATIAL.md). C21 consumes `(lat, lon)` in WGS84; C12 owns the math that puts those coordinates in scene space.
- **AI workflow integration mechanics** — owned by [C09 AI & Visibility Intent](./C09-AI-AND-VISIBILITY-INTENT.md). C21 publishes the data; C09 publishes the workflow surface.
- **Carbon / embodied energy / lifecycle analysis** — DEFERRED. A future contract (provisionally "C36 Carbon & Lifecycle Analysis", TBD) will consume `ClimateDataset` + grid emissions factors + material EPDs to produce carbon figures. C21 is the climate substrate; the carbon contract is its consumer.
- **Live weather forecasting** — OUT OF SCOPE (§1.11). PRYZM is design-time. Operations / twin consumers integrate via a future digital-twin contract.
- **Wind CFD simulation** — OUT OF SCOPE for v1. C21 ships a wind ROSE (statistical aggregate per §2.5) which is the right input to facade orientation decisions; full CFD around the building (pedestrian comfort, microclimate eddy analysis) is a future contract — see open design question §9.b below.
- **Acoustic / noise environment** — OUT OF SCOPE. Road / rail / industrial noise contours are separate environmental data with separate sources (DEFRA, EPA, etc.); they belong to a future "C37 Acoustic Environment" contract (TBD).
- **Air quality / pollution data** — OUT OF SCOPE. PM2.5 / NO₂ / O₃ contours are separate licensed datasets; future contract TBD.
- **Hydrology / flood / drainage** — OUT OF SCOPE. Flood-zone maps + drainage analysis are a separate substrate; future contract TBD.
- **Geology / soil / seismic hazard** — OUT OF SCOPE. Bearing capacity + soil class + seismic hazard maps belong to a structural-engineering substrate; future contract TBD.
- **Climate projections (future climate)** — OUT OF SCOPE for v1. IPCC AR6 + CMIP6 downscaled projections are valuable for long-life buildings but introduce a different data tier (modelled, not measured) with different provenance + uncertainty handling. Queued as an open design question (§9.a).
- **Display / unit-presentation policy** — owned by the future C46 i18n / L10n contract. C21 mandates SI at storage (§1.8); how those values render to a user in Fahrenheit vs Celsius is a presentation concern.

### Open design questions

**(a) Climate-change projections.** For 50+ year design life, historical EPW (1991–2020) is increasingly stale. IPCC AR6 + future-EPW generators (e.g. CCWorldWeatherGen, Meteonorm) produce 2050 / 2080 projections. Do we ingest those as a separate dataset tier (`source: 'epw-projected-2050'`), or as a deformation layer on top of the historical EPW? Decision deferred to PG0.5 implementation; capture in an ADR when chosen.

**(b) CFD wind simulation.** A wind ROSE tells you frequency by direction; it does NOT tell you how a 70 m tower deflects wind onto its podium. Full pedestrian-comfort CFD (Lawson criteria, NEN 8100) is a heavy compute load — minutes per design alternative, typically GPU. Queued as a candidate future contract (provisionally "C38 Wind & Pedestrian Comfort") rather than an extension to C21.

**(c) Microclimate / urban-heat-island effects.** EPW captures airport / station-grade climate; urban canyons can differ by 2–5°C. UMI / EnergyPlus EP-UCM workflows exist but require dense building-context data (per [docs/03-execution/plans/geospatial-foundation.md §1](../../03-execution/plans/geospatial-foundation.md) §2 WHAT IS AROUND IT). Deferred until the Cesium-ingestion adapter (PG0.4) lands a usable neighbour-massing layer.

**(d) NOAA vs IWEC vs WeatherKit selection policy.** The contract names NOAA as the v1 fallback; for non-US sites, IWEC (International Weather for Energy Calculations) is the analogous dataset. Multiple fallbacks introduce a tier-selection policy. The current rule is geographic (NOAA for US; IWEC elsewhere); whether to add WeatherKit (Apple's API) or ECMWF reanalysis (ERA5) as additional tiers is open — driven by license costs and customer geographies.

**(e) Cache eviction granularity.** §1.4 rounds to 0.01° (≈ 1.1 km). For high-density urban projects on adjacent blocks (e.g. multiple towers within one borough), this rounds them all to the same cache key — correct for climate, possibly wrong for noise / air quality / urban heat. Whether to share the cache key across data tiers or keep separate keys per tier is open. Current decision: share, because all C21 fields are genuinely uniform at the 1 km scale; the sister "noise" / "air quality" contracts will choose their own cache granularity.

**(f) Discipline-specific derived quantities — should any be cached?** §1.10 says no (consumer derives). But heating-degree-days base 18°C is computed on every apartment-layout call; cheap to derive once and reuse. The pragmatic answer is to cache derived quantities on the dataset (already done in §2.6 `DegreeDayAggregates`) for STANDARD bases, and let consumers derive non-standard bases themselves. This matches the schema as written; the open question is whether to add more standard bases as the consumer set grows.

---

*End — C21 Climate Ingestion (DRAFT, 2026-06-01).*
