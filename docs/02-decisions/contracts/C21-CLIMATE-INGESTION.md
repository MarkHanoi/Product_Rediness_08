# C21 — Climate Ingestion

> **Stamp**: 2026-06-01 · **Ratified**: 2026-07-16 · **Status**: CANONICAL
> _Ratified DRAFT→CANONICAL 2026-07-16 (founder-approved sweep): full C31 anatomy present (§1 Invariants … §9 "What is NOT" + §10 Solar Exposure), and climate ingestion + solar/sun-hours analysis are implemented (`@pryzm/solar-analysis`, ADR-0074)._
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
- ~~No EPW reader.~~ ⛔ **FALSE at HEAD** — `packages/climate-host/src/epwParser.ts` **and**
  `epwHeader.ts` exist, with `packages/climate-host/__tests__/epwHeader.test.ts`.
- ~~No NOAA reader.~~ ⛔ **FALSE at HEAD** — `packages/climate-host/src/noaaNormalsReader.ts`
  exists, alongside `liveNormalsAdapter.ts` and `bundledNormals.ts`.
- ~~No `ClimateStore`~~ ⛔ **FALSE at HEAD** — `ClimateStore` is imported at
  `packages/runtime-composer/src/composeRuntime.ts:54`, **constructed at `:1020`**, exposed on the
  runtime object at **`:1818`**, disposed at **`:1715`**, and typed at
  `packages/runtime-composer/src/types.ts:3789`.
- **No `ClimateHost`** — ✅ **this one is STILL TRUE.** `grep -rn "ClimateHost" --include=*.ts
  --exclude-dir=node_modules packages apps plugins` → **0 occurrences.**

> ⛔ **CORRECTION 2026-08-18 — §8.1 is a "today's substrate" snapshot that stopped being today.**
> **Three of its four gap claims are false**; only `ClimateHost` remains genuinely absent, and
> §8.2's migration steps **3, 4, 5 and 6 are therefore substantially DONE**. An engineer executing
> §8.2 top-to-bottom rebuilds ~1,100 LOC of shipped, tested code — defect shape **A**, a "NOT BUILT"
> outliving the code.
>
> ```
> ls packages/climate-host/src/
> # bundledNormals.ts degreeDaysBuilder.ts designTempsBuilder.ts epwHeader.ts epwParser.ts
> # fallbackDataset.ts index.ts liveNormalsAdapter.ts monthlyNormalsBuilder.ts
> # noaaNormalsReader.ts solarPath.ts windRoseBuilder.ts        (12 files)
> ```
>
> ⚠ **And the runtime property is NOT `runtime.climate`.** §8.2 steps 1 and 6 both name
> `runtime.climate`; the shipped name is **`runtime.climateStore`**, and it is genuinely reached —
> `grep -rn "runtime\.climate" --include=*.ts --exclude-dir=node_modules packages apps plugins`
> → **6 live sites**, all in `apps/editor/src/ui/` (`climate/ClimatePanel.ts:18`,
> `climate/ensureSiteClimate.ts:7,131,156`, `geospatial/FormaSiteAnalysisControls.ts:268`,
> `tools-panel/panels/GISRailPanel.ts:150`). **Cite `runtime.climateStore`; `runtime.climate`
> resolves to nothing.**
>
> ⭐ **The status of this subsystem was stated three different ways in one contract** — CANONICAL in
> the front matter, "no reader exists" here in §8.1, and a migration plan in §8.2 written as though
> none of it had started. **Re-run the `ls` before quoting any of the three.**

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

> **Note (§10, 2026-06-16).** This §9 list previously had no entry for per-surface **solar exposure / sun-hours** analysis. That gap is now SCOPED — not deferred, not forked to a new contract — by the new §10 below, which governs it as a derived consumer of C21's solar substrate (per ADR-0074). The §9.b (CFD), §9.c (microclimate) and other deferrals are unaffected.

---

## §10 — Solar Exposure & Sun-Hours Analysis

> Added 2026-06-16 per [ADR-0074](../adrs/ADR-0074-gpu-solar-sun-hours-environmental-analysis.md). Sister derived-analysis section to [C54 In-Browser Wind CFD](./C54-IN-BROWSER-WIND-CFD.md) (ADR-0064) — both carve a per-surface environmental analysis out of a C21/C19 substrate rather than minting a fresh contract.

Per-surface **solar exposure / sun-hours** — "how many hours does *this* roof facet / *this* façade panel actually see the sun across the analysis window, accounting for self-shadowing and neighbours" — and its irradiance-weighted sibling are a **DERIVED CONSUMER** of C21's solar substrate. They are governed HERE, as a normative section, NOT as a new contract. This mirrors how ADR-0064's wind-CFD invariants live in [C54](./C54-IN-BROWSER-WIND-CFD.md) (consuming C21's wind rose) rather than re-deciding C21, and it is the direct application of the §1.10 "consumer derives discipline-specific quantities" pattern: solar POSITION (§1.3) and irradiance MAGNITUDE (§2.2) already belong to C21, so per-surface exposure extends C21 rather than forking solar ownership.

The numbered rules below are RFC 2119 normative and carry §10.N ids (usable in `TODO(C21.10.N)` annotations and `check-solar-*.ts` CI gate messages), continuing C21's §1.N invariant convention.

### §10.1 — Ownership: derived consumer of the C21 solar substrate, governed here

Per-surface sun-hours / solar exposure MUST be treated as a derived analysis OVER the C21 substrate, never as an independent data source. Its only legitimate inputs are:

- the **sun direction** per time sample, from the C21 §3.3 `SolarPathReader` (today's `RealSunService` NOAA algorithm) — solar position is COMPUTED, never stored (reaffirming §1.3);
- optionally, the **irradiance magnitude** from a non-`fallback-defaults` `ClimateDataset` (the §2.2 `EPWRecord.directNormalWm2` / `diffuseHorizontalWm2` / `globalHorizontalWm2` beam + diffuse fields);
- the **building massing** (real roof + façade triangles) for occlusion;
- the **latitude / orientation** from `ProjectLocation` resolved through [C12 Geospatial](./C12-GEOSPATIAL.md) (lat/lon → LTP-ENU scene frame) plus the Project-North → True-North rotation (per ADR-0070).

A solar-exposure analysis MUST NOT introduce a parallel sun-position algorithm, a parallel climate source, or a parallel building model. It consumes the C21 reader + (optionally) the `ClimateStore` and the C12/C19 geometry READ-ONLY. There is no new owning contract; this section is the owner.

**Rationale.** A second sun-position or irradiance source would diverge from the canonical `SolarPathReader` / `ClimateDataset` the rest of the platform analyses, exactly the divergence §1.1 (Site anchor) and C54 §1.5 (Site-derived domain) forbid for their substrates.

### §10.2 — Solar position is COMPUTED per sample, never stored (reaffirms §1.3)

Every sun direction the analysis integrates over MUST be produced at run time by the §3.3 `SolarPathReader.sample(lat, lon, dateTimeUtc)` for each `dateTimeUtc` in the requested window (a single day at N-minute steps, or a day-range / typical-day cadence). The analysis MUST NOT persist the sun-sample set — it is derived, deterministic, and cheap to recompute (§7.2 budget), exactly like a `SolarSample` (§1.3, §2.4). Below-horizon samples (altitude ≤ 0) contribute nothing and are dropped at generation.

### §10.3 — Pure geometric sun-hours need NO external data

PURE GEOMETRIC sun-hours — hours of direct-beam exposure — depend ONLY on sun geometry + occlusion. A sample contributes its time slice `Δt` to a surface point when and only when ALL of:

1. the sun is **above the horizon** (`altitudeDeg > 0`), AND
2. the surface is **sun-facing** (`dot(outwardNormal, sunDir) > 0`), AND
3. the point is **not occluded** (`!isOccluded(point, sunDir)`).

This metric requires NO `ClimateDataset` — only the §3.3 sun positions + an occlusion oracle. It is the ThatOpen-equivalent sun-HOURS readout and the analysis's baseline output; it ships and runs even on the `'fallback-defaults'` tier (§1.2) because it consumes no climate fields.

### §10.4 — Irradiance-weighted exposure additionally consumes EPW irradiance

IRRADIANCE-WEIGHTED exposure (absolute W·h/m², kWh/m²) additionally consumes the C21 §2.2 EPW irradiance fields (`directNormalWm2` + `diffuseHorizontalWm2`, with cosine-of-incidence and atmospheric attenuation). Therefore:

- absolute-magnitude output MUST be gated on a non-`fallback-defaults` `ClimateDataset` (per §1.2). When the resolved tier is `'fallback-defaults'`, the pass MUST refuse to report absolute kWh/m² and degrade to **geometric sun-hours only** (§10.3), surfacing the §5.3 climate-quality gate;
- absolute-magnitude output MUST be labelled with the climate-data tier it consumed (`'epw'` vs `'noaa-normals'`) so a consumer can read its quality (the §1.2 `source` discipline carried to the surface).

### §10.5 — Results are DERIVED / transient — computed, never stored

A sun-hours / exposure result (per-surface scalar field + AVG/MAX/MIN readout) is a DERIVED, transient projection of the substrate, in the same class as a `SolarSample` (§1.3). It MUST NOT be persisted into the `ClimateDataset` or any C21 store — re-running the analysis for a given `(site, window, step, mesh)` reproduces it (§10.7). The **heatmap is a visualisation projection, NOT source data**: it is an overlay material on the model, never a store mutation, mirroring the §3.3 `RealSunService` "projection-layer only, never mutates a store" contract and C21 §1.7 (climate data is read-only). If a downstream consumer (e.g. a per-room solar heat-gain rollup feeding the layout engine) needs the result, it consumes the transient analysis output and, per C54 §1.6, refines an EXISTING driver input rather than persisting a parallel datum.

### §10.6 — Layering + P2: pure L2 core, ALL GPU in `renderer-three`

The analysis is split across exactly two layers, and the boundary is binding:

- **L2 pure core — [`@pryzm/solar-analysis`](../../../packages/solar-analysis/).** The sun-sample generation (`generateSunSamples`) + per-surface accumulation (`accumulateSunHours(surfaces, samples, isOccluded, opts)` with an INJECTED occlusion oracle `IsOccluded`) + the AVG/MAX/MIN reducer. This core MUST stay **THREE-free, DOM-free, I/O-free and deterministic** (no `Date.now`, no RNG — per its package contract): same inputs ⇒ byte-identical output. It is the ONLY place that reads `runtime.climate` (for irradiance, §10.4) and the §3.3 sun positions; it is unit-testable with a mock oracle.
- **L1 GPU — [`packages/renderer-three/`](../../../packages/renderer-three/) ONLY (P2).** ALL GPU resources live here: the shadow-map / occlusion pass that supplies the real `isOccluded` oracle, the glass-transmittance-aware occluder (transparent glazing PARTIALLY occludes — a façade behind glass receives reduced, not zero, sun-hours), and the heatmap overlay material that paints `SunHoursResult` onto the real mesh. Per **P2** (single THREE owner) + [C04](./C04-RENDERING-AND-SCHEDULING.md), `import * as THREE` and every WebGPU/WebGL resource are allowed ONLY in `packages/renderer-three/`. `@pryzm/solar-analysis` is *invoked by* this pass for orchestration but owns no GPU resource.

This is the same split C54 §1.8 enforces for the CFD solver (pure low-layer compute package + result rendered through `renderer-three`).

### §10.7 — Determinism + honesty (BETA + fallback tiering)

- **Determinism.** A run is reproducible per the tuple `(site lat/lon, date-range, sun-step, mesh, climate dataset version)` — re-running the same configuration yields the same per-surface field (GPU floating-point reduction order is the only permitted variance source, as in C54 §1.3). This lets a result be audited (the future C23 Provenance) and fed deterministically to the layout / AI engines.
- **Honesty + fallback.** The GPU occlusion + heatmap pass is **BETA**. Following [ADR-0007](../adrs/ADR-0007-webgpu-webgl2-dual-mode.md) (WebGPU/WebGL2 dual-mode) and the C54 §1.1 / §1.2 honesty + graceful-fallback discipline: the WebGPU compute-accumulation path MUST detect device availability and degrade gracefully — a WebGL2 additive-render fallback, and below that a CPU path — never crashing the frame loop; every surface that presents a result MUST carry a visible **BETA** label, and an indicative geometric sun-hours figure MUST NOT be presented as a certified solar/energy analysis. Absolute irradiance MUST additionally carry its climate-data tier (§10.4). This is the C54 / ADR-0064 beta-honesty rule carried into C21 §10.

### §10.8 — Read-only / overlay-only + an OTel span per run (P8)

A solar-exposure run MUST NOT mutate any store (it is read-only over C21 + C12/C19 and writes only a transient overlay, per §10.5). Per **P8** (and §1.6), the L2 orchestration entry point MUST open an OpenTelemetry span `pryzm.climate.solarExposure` carrying attributes `{ siteRef?, latE2?, lonE2?, datasetVersion?, source?, sampleCount, surfaceCount, gpuBackend: 'webgpu' | 'webgl2' | 'cpu', durationMs }`, so a run is observable end-to-end alongside the other `pryzm.climate.*` spans (§1.6). The span name extends the §1.6 `pryzm.climate.<verb>` family; `check-otel-spans.ts` (§6.3) covers it.

### §10.10 — Solar HEAT GAIN: per-room thermal rollup ("real heat")

> Added 2026-06-17. The founder asked for **real HEAT** (not just real sun POSITION / sun-HOURS): "how much solar thermal load actually enters *this room*." §10.3 gives geometric sun-hours; §10.4 gives per-surface irradiance (W/m²). This section governs the next derived quantity — **solar heat GAIN per room** (W / kWh of solar thermal energy entering the conditioned space) — as a further derived consumer, not a new contract or store.

Per-room **solar heat gain** MUST be treated as a DERIVED rollup over the §10.4 irradiance-weighted exposure and the room's glazing inventory, never an independent datum. It is the §1.10 "consumer derives discipline-specific quantities" pattern applied one step beyond §10.4: surface irradiance (W/m²) → glazing-transmitted gain (W) → per-room load (W, kWh over the window).

- **§10.10.1 — Quantity + formula (normative shape, not tuned constants).** For a room `R`, the solar heat gain over the analysis window is
  `Q_solar(R) = Σ_g [ I_inc(g) · A_g · SHGC_g ] · Δt  (+ optional opaque-envelope term)`,
  summed over each glazing element `g` hosted in `R`'s exterior walls, where `I_inc(g)` is the §10.4 cosine-of-incidence irradiance on `g`'s host surface (with the §10.6 glass-transmittance-aware occlusion), `A_g` is the glazed area, and `SHGC_g` is the element's solar-heat-gain coefficient (a glazing MATERIAL property, read from the element/material catalogue — NOT a climate field). The opaque-envelope conduction-driven term (sol-air temperature) is OPTIONAL and, if added, MUST be clearly separable so the glazing-transmitted gain — the dominant, defensible term — can be reported alone.
- **§10.10.2 — Inputs + tiering.** The gain's ONLY legitimate inputs are: (a) §10.4 surface irradiance (which carries the §1.2 climate tier), (b) the room's glazing geometry + per-element SHGC (from the model, NOT C21), and (c) the §10.1 sun/frame substrate. Absolute-magnitude gain (W / kWh) MUST therefore inherit §10.4's tier gate: on a `'fallback-defaults'` climate tier it MUST refuse absolute kWh and degrade to a **relative** gain index (per-room ratio of geometric sun-hours × glazed area), surfacing the §5.3 climate-quality gate. SHGC MUST default to a documented conservative value when a glazing element carries none, and that defaulting MUST be visible (not silent).
- **§10.10.3 — Derived / transient / overlay-only (reaffirms §10.5).** A per-room heat-gain result is transient: computed, never persisted into the `ClimateDataset` or a parallel store. When it feeds a consumer (the layout / comfort / acoustic-vs-solar zoning engines, or a future thermal-comfort score), it MUST, per C54 §1.6, refine an EXISTING driver input (e.g. the room's environmental score / `ObjectiveVector` solar axis) rather than mint a stored datum. The per-room readout is a visualisation projection (a room-tint / schedule column), never source data.
- **§10.10.4 — Layering, BETA, honesty, span.** The rollup is pure arithmetic over §10.4 output × glazing inventory and MUST live in the **L2 pure core** (`@pryzm/solar-analysis`, THREE-free + deterministic, §10.6) — it owns no GPU resource. It inherits §10.7's **BETA** + graceful-fallback discipline (an indicative gain is never presented as a certified energy/HVAC sizing figure) and §10.8's read-only + OTel rule: the run extends the `pryzm.climate.solarExposure` span with `{ roomCount, glazingCount, gainMode: 'absolute-kwh' | 'relative-index' }` rather than opening a parallel span.

Implementation is the next step (a `accumulateRoomHeatGain(surfaces, rooms, glazing, irradianceResult, opts)` reducer in `@pryzm/solar-analysis`, unit-tested with a mock irradiance result + glazing fixture); this section is the governing contract it must satisfy.

### §10.11 — WHICH SURFACES the façade study paints, and the BASIS of its scale

> Added 2026-08-23 (lane FACADE13, [L-10120](../../04-reference/ISSUE-LOG.md)) after the founder: *"windows should NOT be coloured but all the rest of the surfaces yes, according to sun exposition."* §10.3–§10.5 govern WHAT is computed; nothing governed **which surfaces the result may be painted onto**, and the drape painted every one of them. §10.6 already treats glazing as its own surface class on the OCCLUSION side ("transparent glazing PARTIALLY occludes"); this section closes the same distinction on the DISPLAY side.

- **§10.11.1 — The studied surface is the ENVELOPE PLANE. Anything not on it MUST NOT take its value.** The façade lattice is a planar grid over each envelope panel, evaluated at that panel's outward normal. Therefore a fragment MUST carry an analysis colour only when it lies on that plane. **Glazing** (a window/curtain-wall/skylight pane *and its frame*) is not wall surface; an **opening's reveal** (jamb, head, sill) is real wall but is perpendicular to the studied plane and is never evaluated by any lattice node. Both MUST be withheld from the paint. Painting either with the panel's value is FABRICATION — it presents a number the study never computed, which §10.7's honesty rule forbids as squarely as an uncertified absolute figure.
- **§10.11.2 — A withheld surface MUST show the model's own material — never a neutral, never a hole.** Withholding is "this surface has no analysis value", not "this surface does not exist". A `discard` (the pre-L-10120 behaviour) deletes real geometry: it took the window's glass, the opening's reveals, and every roof eave overhanging the study footprint, and framed each opening with a see-through hole onto whatever lay behind. A flat neutral is a different wrong answer — it asserts a surface class the model does not have. The surface MUST render as it renders with the analysis OFF.
- **§10.11.3 — The glazing test MUST NOT depend on the authored-openings record.** An openings array can be **UNRECORDED**, and per §FIX-FORMA-OPENINGS-UNKNOWN (GR-10) / C75 §1.4 that is UNKNOWN, never a determined "this building has no windows". A mask sourced only from that record therefore fails exactly where the record is thin — measured on the founder's building as `2 opening(s)` across a five-panel 15.2 m envelope. The classifier MUST come from the rendered model itself. On the 3D-Site path it does: the GLB is exported `formaWhite: true`, which paints every opaque element with one shared opaque material and every glazed element (pane **and** frame, the role resolved by walking UP the element tree) with one shared translucent glass material, so base-colour alpha separates the two per fragment. Where a mask *does* still rest on the authored record — **doors** and opening **reveals**, which are opaque in that export — the run MUST NAME that dependency and MUST NAME an unrecorded set as unknown rather than presenting the unmasked result as complete.
- **§10.11.4 — Withholding colour MUST NOT move a number; moving one MUST be declared.** The façade field is per-point (`lit / sunSampleCount`) and its single aggregate — the display normaliser's divisor — is the realised MAX wall-node intensity over the **solid** face rectangles, **opening regions included**. It is not an area integral, so excluding texels from the PAINT changes no reported quantity, and a display fix stays byte-identical at the numbers (the ADR-0110 discipline). Excluding those NODES from the lattice would move the divisor and rescale every colour on the building; that is a **basis change** and, per [C66](./C66-CONCURRENCY-AND-SCALE.md) §1.1, MUST be declared at the surface that reports it rather than slipped in behind a visual fix. Whichever basis is in force MUST be stated in the run's own diagnostic line, in the terms above — "GLOBAL" alone says the divisor is shared and says nothing about the area it covers.
- **§10.11.5 — OPEN, and named rather than guessed.** The façade ramp is **relative** to that realised max (a §FEAT-FACADE-ANALYSIS-MATCH-SUNHOURS-QUALITY range-stretch), while the shared `sunHours` legend declares `unit: 'h'` with qualitative endpoints (`Shaded` → `Sunny`) and no numeric axis. No absolute hour figure is presented anywhere for the façade, so nothing currently reads as a false quantity — but the unit label and the scale disagree, and the legend is shared with the ground grid. Reconciling them (an honest relative label, or an absolute axis on both) is NOT decided here because it changes what the GROUND heatmap claims too, which is outside this section's subject.

### §10.9 — Cross-references

| Ref | Relationship |
|---|---|
| [ADR-0074](../adrs/ADR-0074-gpu-solar-sun-hours-environmental-analysis.md) | The decision record this section contract-izes (GPU sun-hours, real model geometry, heatmap). |
| [ADR-0064](../adrs/ADR-0064-in-browser-wind-cfd-webgpu-lbm.md) / [C54](./C54-IN-BROWSER-WIND-CFD.md) | Sister env-sim: client-side WebGPU analysis over a C21/C19 substrate; source of the BETA-honesty + graceful-fallback + single-THREE-owner patterns reused here. |
| [ADR-0007](../adrs/ADR-0007-webgpu-webgl2-dual-mode.md) | WebGPU/WebGL2 dual-mode — the rendering substrate + fallback tiering cited in §10.7. |
| [ADR-0070](../adrs/ADR-0070-project-north-vs-true-north-authoring-frame.md) | Project-North → True-North rotation that aligns the model frame to the compass the sun is computed in (§10.1). |
| [C12 Geospatial](./C12-GEOSPATIAL.md) | lat/lon → LTP-ENU scene frame + orientation (§10.1). |
| [C04 Rendering & Scheduling](./C04-RENDERING-AND-SCHEDULING.md) | THREE / rAF ownership for the GPU pass (§10.6, P2). |
| C21 §1.3, §2.2, §3.3, §1.10, §5.3 | The substrate this section derives from (computed solar position; EPW irradiance; `SolarPathReader`; consumer-derives pattern; climate-quality gate). |
| Glazing / material catalogue + element store | §10.10 per-room heat gain reads per-element SHGC + glazed area from the MODEL (a material property), NOT from C21 — keeping climate ownership clean (§10.10.2). |
| [C12 §11.4](./C12-GEOSPATIAL.md) + `GLBExporter` forma-white export | §10.11.3 — the per-fragment glazing classifier the 3D-Site drape uses is a property of that export (one shared opaque material, one shared glass material), not of C21. If the 3D-Site view ever stops exporting `formaWhite`, the classifier's premise is gone and §10.11.3's "MUST come from the rendered model itself" needs a new mechanism, not a fallback to the authored record. |
| [C66 §1.1](./C66-CONCURRENCY-AND-SCALE.md) | §10.11.4 — a number whose basis changed must say so; the façade normaliser's basis is stated in the run's own diagnostic line. |

---

*End — C21 Climate Ingestion (DRAFT, 2026-06-01; §10 Solar Exposure & Sun-Hours added 2026-06-16; §10.10 Solar Heat Gain / "real heat" added 2026-06-17; §10.11 paintable-surface + normalisation-basis rules added 2026-08-23, L-10120).*
