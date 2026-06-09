# C55 — Geodata Analytical Layers

> **Stamp**: 2026-06-09 · **Status**: DRAFT
> **Scope**: governs PRYZM's **analytical geodata layer subsystem** — the Hektar-style **Layers panel** on the Forma 3D site view that drapes national open-data analytical layers (flood, landslide, slope, soil, noise, protected habitats, population, property/detail plans, ancient monuments, drainage basins, ground coverage, terrain shading) over the Cesium terrain + white building massing. Each layer is a **toggle + opacity slider**, grouped by country, sourced through a **pluggable provider abstraction** so national registries plug in without core changes. Companion to [C19](./C19-SITE-MODEL-AND-PARCEL.md) (the Site the layers contextualise), [C21](./C21-CLIMATE-INGESTION.md) (climate layers share the site substrate), [C54](./C54-IN-BROWSER-WIND-CFD.md) (the wind-CFD field is a sibling analytical layer), and [C12](./C12-GEOSPATIAL.md) (the coordinate substrate the layers are draped in).
> **Depends on**: [C03](./C03-SCHEMAS-COMMANDS-AND-STATE.md) (layer schemas/commands), [C04](./C04-RENDERING-AND-SCHEDULING.md) (single THREE owner / single rAF — the Cesium-imagery + draped-geometry render path), [C19](./C19-SITE-MODEL-AND-PARCEL.md) (Site + parcel + bbox the layers query against), [C12](./C12-GEOSPATIAL.md) (LTP-ENU + WGS84 reprojection), [C22](./C22-PRIVACY-AND-PII-TIER.md) (the privacy/PII tier for population + sensitive layers), [C23](./C23-PROVENANCE-AND-AI-AUDIT.md) (per-source attribution as provenance), [C10](./C10-PERFORMANCE-AND-OBSERVABILITY.md) (lazy-load + tile perf budget + OTel), [C45](./C45-BROWSER-AND-DEVICE-MATRIX.md) (raster/vector tiling tiering), [C49](./C49-MULTI-REGION-AND-SOVEREIGNTY.md) (per-country data sovereignty of the registries).
> **Downstream**: the Forma site view ([SPEC-FORMA-SITE-VIEW](../../03-execution/specs/SPEC-FORMA-SITE-VIEW.md) §5 toggle UI + §6 analysis hooks — the Layers panel sits alongside the existing climate/sun/wind overlays); the generative layout engine ([SPEC-ENVIRONMENTAL-DESIGN-DRIVERS](../../03-execution/specs/SPEC-ENVIRONMENTAL-DESIGN-DRIVERS.md)) — a flood/landslide/slope layer MAY later feed a **keep-out / suitability constraint** for the generator (future tie-in, §1.8), never a parallel objective.
> **Decision record**: [ADR-0065](../adrs/0065-geodata-analytical-layers-pluggable-provider.md) — the decision to provide geodata as a first-class **pluggable-provider** layer subsystem draped on Forma/Cesium (vs hardcoded per-country layers vs none).
> **Engineering spec**: [SPEC-GEODATA-ANALYTICAL-LAYERS](../../03-execution/specs/SPEC-GEODATA-ANALYTICAL-LAYERS.md).
> **Key principles**: **P2** (single THREE owner — only `packages/renderer-three/` may `import * as THREE`; draped vector geometry renders through it, raster imagery through the Cesium owner), **P3** (single rAF — layer fetch/tile-load never spins a private `requestAnimationFrame`; opacity animates via the frame scheduler), **P4** (no `(window as any)` — the layer registry is a runtime service, not a window global), **P5** (schemas pure — the layer-descriptor/provider-result schemas in `packages/schemas/` carry no Cesium/THREE/DOM/I-O imports), **P6** (every layer toggle/opacity/refresh is a `geodata.*` command, never a direct store write), **P8** (every public layer op opens an OTel span `pryzm.geodata.<verb>`).

---

## §1 — Invariants

The numbered rules below are binding on every PR that touches the geodata-layers subsystem. Each invariant has an §1.N id usable in `TODO(C55.N)` annotations and in `check-geodata-*.ts` CI gate failure messages.

### §1.1 — The Layer model is a declarative descriptor; rendering is derived

Every layer is described by a **pure `GeodataLayer` descriptor** (P5) carrying at minimum: `id`, `group` (the panel accordion — a country `SE`/`NO`/`DK`/… or the cross-country top group `Europe`), `title`, `sourceProviderId`, `geometryKind` (`raster` | `vector`), `legend` (ordinal/continuous ramp + units), `drapeMode` (`terrain` (clamped to ground) | `building` (also over massing) | `overlay` (screen-space)), `defaultOpacity`, `dataTier` (per C22 — §1.6), and `attribution` (per C23 — §1.5). The descriptor is **data, not code**: the panel, the renderer, and the provider lookup are all derived from it. A new layer is an entry in a provider's catalogue, never a bespoke render branch.

**Why**: a declarative descriptor is the precondition for the pluggable-provider model (§1.3) and the country-grouped panel (the Hektar UX) without per-layer special-casing.

### §1.2 — Layers DRAPE; they never become BIM geometry

An analytical layer is a **visual analytical overlay** draped on the Cesium terrain + Forma white massing (raster via a Cesium `ImageryLayer`, vector via clamped-to-ground entities / a draped renderer through the THREE owner). A layer MUST NOT be committed as a BIM element, mutate the Site (C19), or enter the `.pryzm` model. It is read-only context. Toggling/opacity changes visibility intent (P7), not the model.

**Why**: geodata is *context for* the design, not part of it — conflating the two would pollute the model, the file format, and the schedules with non-authored data.

### §1.3 — Providers are pluggable; the core knows no country

National data sources plug in through a single **`GeodataProvider` interface** (`id`, `country`, `listLayers()` → descriptors, `fetchTile(layerId, bbox, z)` → raster/vector payload, `legendFor(layerId)`, `attribution()`). The core registry, panel, and renderer MUST depend only on this interface — adding Norway or Denmark is **registering a new provider**, never editing the core. The first reference provider is a **Swedish Lantmäteriet + SGU adapter**; a generic OGC adapter (WMS/WMTS/WFS) is the fallback for any registry that speaks the standards. No country id, registry URL, or layer name may be hardcoded in L1/L2 core or the panel.

**Why**: the founder's reference groups layers by country (DK/NO/SE) explicitly so the registries can grow per-country; hardcoding any one country freezes the subsystem to Sweden.

### §1.4 — Graceful absence: no provider / no data is a quiet no-op, never a crash

When a country has no registered provider, a provider returns no data for the current bbox, a tile request fails, or the layer's CRS can't be reprojected, the subsystem MUST degrade quietly: the affected accordion/layer shows a "no data here" affordance (greyed toggle), the existing Forma view + other layers stay intact, and no exception propagates to the frame loop. A provider fetch MUST be cancellable and time-bounded.

**Why**: geodata coverage is sparse and per-region; the panel must work everywhere the Forma view works, degrading layer-by-layer rather than breaking the site view.

### §1.5 — Provenance / attribution is mandatory per source

Every active layer MUST surface its **source attribution** (the registry + dataset, e.g. "Lantmäteriet", "SGU — Sveriges geologiska undersökning", basemap "Mapbox", imagery "Nimbo") visibly in the panel/legend and record it as provenance per [C23](./C23-PROVENANCE-AND-AI-AUDIT.md). When an AI workflow consumes a layer (§1.8 future tie-in), the provenance record carries the source, dataset version, fetch timestamp, and licence. Attribution MUST NOT be droppable by configuration.

**Why**: the reference tool credits each source by name; many open-data licences (and the C23 audit posture) make attribution a hard requirement, not a courtesy.

### §1.6 — Sensitive layers carry the C22 privacy/PII tier

Layers that expose population, demographic, or otherwise sensitive data (e.g. **Population per km²**, **Noise Pollution**) MUST be tagged with the appropriate `dataTier` per [C22](./C22-PRIVACY-AND-PII-TIER.md) and respect region/sovereignty bounds per [C49](./C49-MULTI-REGION-AND-SOVEREIGNTY.md) — aggregated public statistics are PROJECT/DERIVED tier; a layer MUST NOT down-resolve to individual-level PII. Per-tier consent/region gating applies before such a layer fetches.

**Why**: "population" + "noise" are aggregate public datasets, but the tier discipline (C22) must be explicit so a future finer-grained registry can't silently leak individual-level data.

### §1.7 — Perf: lazy-load, tile, and change opacity without re-fetch

- Layers are **lazy**: a provider's tiles are requested only when its layer is toggled on and only for the current view bbox/zoom (tiled fetch per C45 tiering); toggling off drops the GPU/imagery resources.
- **Opacity is a render parameter, not a re-fetch**: dragging the opacity slider MUST mutate the existing `ImageryLayer.alpha` / draped material opacity in place (animated via the frame scheduler, P3) and MUST NOT re-query the provider.
- Tiles are cached per `(providerId, layerId, bbox, z)` (the C10 perf budget; exact LRU size in the SPEC). A panel of N toggled layers MUST not stall the frame loop.

**Why**: an analytical-layers panel is only usable if toggling and fading layers is instant; re-fetching on every opacity tick would make it unusable and hammer the registries.

### §1.8 — Layers feed analysis through EXISTING consumers; no parallel objective

A geodata layer is **better DATA**, not a new engine. When a layer later informs design (e.g. **Calculated Maximum Flood** / **Landslide Susceptibility** / **Terrain Slope** as a build keep-out or suitability surface for the generator), it MUST feed an **existing** consumer — a site-constraint / suitability input the layout engine already reads (SPEC-ENVIRONMENTAL-DESIGN-DRIVERS) — NOT a parallel "geodata objective" competing with the environmental drivers. This tie-in is explicitly **future / out of scope for the initial layer subsystem** (GL.1–GL.5 are visualisation only); it is recorded here so the seam is reserved.

**Why**: single-source-of-truth per design driver (the C52/C53 "one engine input per knob" doctrine + the C54 §1.6 precedent) — a flood layer is a constraint surface, not a new scorer.

### §1.9 — Layered placement

The subsystem splits across the 8-layer model:
- a **pure data model + registry/provider abstraction** in a new low-layer package (`packages/geodata-layers/`, L1/L2 — descriptors, `GeodataProvider` interface, tile cache, reprojection helpers; no Cesium/THREE/DOM);
- the **layer schemas** in `packages/schemas/` (L0, pure — P5);
- the **render binding** through `packages/renderer-three/` (P2, vector drape) + the Cesium imagery owner (raster);
- the **Layers panel + provider adapters** in `apps/editor/` (L5) launched via `geodata.*` commands (P6).

Provider adapters (the Lantmäteriet/SGU reference, the OGC fallback) live at the editor/app layer (L5), not in the L1/L2 core — the core ships zero registry knowledge.

**Why**: keeps the THREE owner singular (P2), the rAF singular (P3), the core registry reusable/testable independent of any country, and the country-specific I/O at the app boundary.

---

## §2 — Command surface (normative shape — full schema in SPEC)

| Command | Effect |
|---|---|
| `geodata.toggleLayer` | Turn a layer on/off — lazy-loads its tiles on first enable, drops resources on disable (§1.7). Visibility intent (P7). |
| `geodata.setOpacity` | Set a layer's opacity in place — render-only, no re-fetch (§1.7). |
| `geodata.registerProvider` | Register a `GeodataProvider` (a country adapter / the OGC fallback) at runtime (§1.3). |
| `geodata.refreshBbox` | Re-query active layers for a new view bbox/zoom (§1.7). |
| `geodata.clear` | Drop all active layers + their resources. |

All emit OTel spans `pryzm.geodata.<verb>` (§1, P8). All mutate via the command bus only (P6).

---

## §3 — CI gates

| Gate | Type | Checks |
|---|---|---|
| `check-geodata-no-hardcoded-country.ts` | hard-fail | no country id / registry URL / layer name in L1/L2 core or the panel; all via `GeodataProvider` (§1.3) |
| `check-geodata-attribution.ts` | hard-fail | every layer descriptor carries a non-empty `attribution`; result surfaces render it (§1.5) |
| `check-geodata-no-three-outside-renderer.ts` | hard-fail | THREE/Cesium ownership boundary (§1.9, P2) |
| `check-geodata-pii-tier.ts` | hard-fail | population/sensitive layers carry a `dataTier` (§1.6, C22) |
| `check-geodata-otel-spans.ts` | soft-fail → hard at subsystem GA | every public layer op opens a `pryzm.geodata.*` span (§1, P8) |

---

## §4 — Status

DRAFT 2026-06-09. Queued behind the Geodata-Layers work (tracker §29). No layer code ships with this contract; it governs the subsystem when picked up. DRAFT → CANONICAL ratifies on the first PR after stakeholder sign-off + the §3 hard-fail gates green.
