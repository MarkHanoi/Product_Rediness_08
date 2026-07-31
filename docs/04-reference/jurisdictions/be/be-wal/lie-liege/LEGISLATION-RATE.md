# Data Readiness Rate — Liège (`be-wal-liege`) city

> **Naming note (L-649 reconciliation, 2026-07-30).** This file was `RATE.md`; its content is the
> **structured legislation / data-fill rate** (the C58/L-449 comparable ruler), which
> [`NAMING-CONVENTION`](../../../_TEMPLATE/NAMING-CONVENTION.md) §1 names `LEGISLATION-RATE.md`. It now
> **feeds** the composite master [`RATE.md`](./RATE.md) (the 7-axis C63 scorecard) as **Axis 2
> (LEGISLATION)**. Content below is unchanged — only the filename moved.

**Headline rate: ~0–2%**

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (**zone/use code + a density metric [FAR / coverage /
> %-utilisation] + height**) **without reading an ordinance text/PDF**. This definition is IDENTICAL
> across every jurisdiction (Denmark / Madrid / Saudi / Barcelona / Norway / Germany / France …) so
> the scores are directly comparable. Derived from direct endpoint/schema checks, not assumed from
> Wallonia's open-data reputation.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Saudi (national) | ~55% |
| Barcelona | ~48% |
| Norway (national) | ~32% |
| Germany (national) | ~28% |
| France (national) | ~22% |
| Belgium (national, blended) | ~10–14% |
| Brussels-Capital Region | ~5–10% |
| Antwerp (Flanders / VCRO) | ~0–5% |
| **Liège (Wallonia / CoDT)** | **~0–2%** |

Liège sits at the lowest point of this benchmark. The rate is near-zero not because Wallonia's
zoning data is poor — the plan de secteur WFS is **VERIFIED LIVE, fully open, and modern** (OGC
API Features + WMS, no key required) — but because **the plan de secteur supplies only a broad
land-use affectation and no height, FAR, or setback dimension whatsoever**. What fills the zone-
boundary hit is structurally decoupled from what fills the height/FAR question.

The operative standard for most specific envelope questions in Wallonia is **CoDT Art. D.IV.13**
(*bon aménagement des lieux*) — a mandatory discretionary compatibility test that is close to the
load-bearing mechanism for most real-world permit answers. Unlike Germany's §34 (which applies only
where no B-Plan exists), *bon aménagement des lieux* is layered on top of every permit, including
on zoned parcels. The plan de secteur's coarseness (23 broad-category polygons for all of Wallonia,
adopted 1977–1987) means it does not supply the number; the Guide régional d'urbanisme (GRU) is
explicitly indicative only; and **whether Liège has adopted a Guide communal d'urbanisme (GCU) with
real numeric content is a research task that has not yet been completed**.

The small non-zero credit (~0–2%) reflects the VERIFIED LIVE zone-boundary hit (the plan de secteur
affectation category is a structured, queryable result — a correct zoning label, if not a numeric
envelope answer) and the remote possibility that a GCU, if confirmed adopted, adds isolated numeric
provisions for some zones.

---

> **⚠ Founder research (2026-07-31) — Wallonia is the INVERSE of Brussels: GIS-RICH, legislation-poor.**
> Wallonia has **no PRAS**; its planning data is unusually machine-readable, exposed through the SPW
> **`geoservices.wallonie.be` ArcGIS REST catalogue** (+ downloadable GeoPackage/FileGDB + INSPIRE OGC
> API, **CC-BY**). What is thin is the *legal-semantic* layer: the dimensional numbers (height, setback,
> coverage, buildable depth, floors) are **not regional GIS attributes** — they require article-level
> extraction from **CoDT + local instruments** (SOL, communal guides). So the honest model is a
> **resolution-STRATEGY per field**, not one blended rate:
> - `spatial_join` — zoning/affectation (PDS) and its intersecting prescriptions/perimeters/overlays.
> - `legislation_lookup` / `hierarchy_lookup` — dimensional rules: priority **SOL → communal guide →
>   CoDT**; value stays `null` until an instrument specifies it, but the resolution PATH is deterministic.
> - `explicitly_not_defined` — FAR (no regional FAR): value `null`, **never 0**.
> - `spatial_overlay` — heritage / flood / terrain / soil / land-cover (all REST overlays).
>
> ⚠ HONESTY: **GIS existence ≠ schema audited.** ArcGIS layer + field names below are marked `PROBE:`
> until a live GetFeature confirms them — do not assert an attribute unseen.

| Field | Resolution strategy | Source (PROBE: names unaudited) | Score |
|---|---|---|---|
| Parcel geometry | `spatial_join` (federal) | CADMAP/CadGIS WFS (AGDP/SPF Finances); VERIFIED LIVE 2026-07-24 — same source as Flanders/Brussels (survey-grade, national) | ~90% |
| Plan de Secteur (PDS) — zoning backbone | `spatial_join` — query ALL intersecting layers, not just the zone polygon | SPW ArcGIS REST `PROBE: AMENAGEMENT_TERRITOIRE/PDS` (+ GeoServer `inspire_lu` `LU.ZoningElement_pds` VERIFIED LIVE 2026-07-24; GeoPackage/FileGDB + INSPIRE OGC API; CC-BY). Richer than zones: **prescriptions supplémentaires, périmètres de protection, mesures d'aménagement, landscape/cultural/ecological overlays, revisions** | ~95% (zone + overlays queryable; NO numeric envelope dimension) |
| GRU (Guide Régional d'Urbanisme) — spatial overlays | `spatial_overlay` | SPW ArcGIS REST `PROBE: AMENAGEMENT_TERRITOIRE/GRU` — GRU is **SPATIAL** (GIS overlay layers: protected urban areas, rural building regs, accessibility, acoustic), not just text | ~60% (overlay presence queryable; still legally indicative for numbers) |
| Height / floors / setbacks / buildable-depth | `legislation_lookup` / `hierarchy_lookup` (SOL → communal guide → CoDT) | NOT a regional GIS attribute. Article-level extraction from **CoDT + local instruments**. Value `null` until an instrument specifies it; resolution PATH deterministic (priority SOL → communal guide → CoDT). *Bon aménagement des lieux* (CoDT Art. D.IV.13) sits over all of it | ~0% fill (deterministic PATH, no stored number) |
| FAR / plot ratio | `explicitly_not_defined` | No Wallonia-wide FAR metric — genuine absence. Value `null`, **NEVER 0** | `n-a` (explicit non-definition) |
| Guide communal d'urbanisme (GCU) — numeric provisions | `hierarchy_lookup` (communal tier) | Whether Liège has adopted a GCU with numeric content is unconfirmed — the highest-value LEGAL research action. Feeds the `SOL → communal guide → CoDT` cascade | ~0% until GCU status confirmed |
| SOL (schéma d'orientation local) / SDC | `hierarchy_lookup` (top priority when present) | ArcGIS REST / GeoServer `LU.SpatialPlan_sol` / `_sdc` `PROBE:` — the SOL is the highest-priority tier in the dimensional cascade where adopted | ~0% fill (path node, not a stored number) |
| Heritage overlay (AWaP) | `spatial_overlay` | SPW Géoportail "Patrimoine — biens classés et zones de protection," CC-BY 4.0 `PROBE:` field schema; existence + licence confirmed, GetFeature not re-fetched | ~85% (stated) |
| Flood (zones inondables) | `spatial_overlay` | SPW ArcGIS REST `PROBE: EAU/ZI` — flood/aléa d'inondation overlay | ~70% (layer named; schema unaudited) |
| Soil (potentially polluted) | `spatial_overlay` | SPW ArcGIS REST `PROBE: CNSW` (Carte des sols de Wallonie / soil register) | ~60% (layer named; schema unaudited) |
| Land cover | `spatial_overlay` | SPW ArcGIS REST `PROBE: COSW` (Carte d'occupation du sol de Wallonie) | ~60% (layer named; schema unaudited) |
| Terrain / LiDAR | `spatial_overlay` | Official **LiDAR MNT 2021–22 (50 cm)** — SPW ArcGIS REST `PROBE: RELIEF` folder; parity with Flanders DHMV II now credible (official 50 cm product) | ~65% (official product identified; schema unaudited) |
| Existing building footprints (PICC) | `spatial_join` | PICC (Projet Informatique de Cartographie Continue) `PROBE:` field schema; confirmed by name | ~40% |

---

## The structural gap

Liège's near-zero fill is a **legal-design gap, not a data-access gap**. The plan de secteur WFS
is the best-confirmed live endpoint in the whole Belgian study — fully open, modern (OGC API
Features), not geo-blocked, not bot-blocked. The rate is near-zero because **the plan de secteur
was designed in 1977–1987 to record broad land-use affectation (zone type), not building envelopes
(height, FAR, setbacks)**. There is no height field in the layer; there is no FAR field; there
never was. This is not a schema gap to be filled — it is a deliberate instrument-design choice from
a generation of planning legislation that predates the idea of machine-readable dimensional data.

The GRU (Guide régional d'urbanisme) was introduced to supply some gabarit guidance but was drafted
as explicitly indicative and non-binding — so even if its provisions were queryable (they are not;
they are a PDF document), shipping them as values would misrepresent their legal weight.

*Bon aménagement des lieux* (CoDT Art. D.IV.13) is therefore not a fallback for a small set of
hard cases — it is the **primary operative mechanism** for most specific envelope questions in
Liège. The correct output for most clicks on a Liège parcel is a reasoned refusal: "zone d'habitat
— no numeric ceiling published; *bon aménagement des lieux* applies as the operative standard." A
system that fills a number here without a GCU or a confirmed municipal instrument is mis-stating the
law.

**The GCU is the one realistic path to improving Liège's rate without a regional policy change.**
If Liège has adopted a GCU with numeric height or coverage provisions for some zones, those
provisions would be the only structured numeric fills available. Without confirming the GCU, no
honest rate estimate above ~0–2% is possible.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Confirm whether Liège has adopted a Guide communal d'urbanisme (GCU); if yes, obtain the text and extract any numeric provisions | The single highest-value research action — determines whether Liège's ceiling is ~5–10% (GCU with content) or stays at ~0–2% (no GCU or qualitative-only GCU) | Low (municipal document search + legal read) |
| Run WFS GetFeature against `LU.ZoningElement_pds` for a known Liège parcel | Confirms the live zone-affectation query path end-to-end; closes the "endpoint live but GetFeature untested" gap | Low (endpoint already VERIFIED LIVE) |
| Fetch AWaP heritage layer (SPW Géoportail) GetCapabilities + GetFeature for Liège area | Confirms heritage overlay schema and coverage; converts "stated" to "VERIFIED LIVE" | Low |
| Probe Wallonia PICC building-footprint WFS and LiDAR terrain product for field schema + coverage | Confirms context-data layer parity with Flanders; required before any Liège context-data dev-day estimate | Low–Medium |
| Regional policy change: Wallonia adopts a provision-code catalogue or a binding numeric GRU | The structural intervention — if the GRU were binding and its provisions numeric, Wallonia's rate could approach ~20–30%; if a Planbestämmelsekatalog equivalent were adopted, higher still | Political/administrative — not currently underway |

> **STRATEGIC DIRECTION (record only — do NOT build now).** Because Wallonia is GIS-rich and its
> planning data is exposed through one SPW **ArcGIS REST catalogue** (PDS + GRU + SDT + RELIEF + the
> flood/soil/land-cover/heritage overlays), the reusable win is a **Wallonia Planning SDK** wrapping that
> catalogue once — then **Liège, Namur, Charleroi, Mons, Tournai reuse it wholesale**; only the local
> instruments (SOL, communal guides, GCU) are per-city. This is the Wallonia analogue of the Barcelona
> per-clau infrastructure: build the spatial-join/overlay plumbing once regionally, pay the legal-SOURCING
> cost per municipality. The parcel provider (`walloniaParcelProvider.ts`, federal CadGIS) is the first
> brick; the SDK is future Phase-C direction, not this pass.

---

*Last updated: 2026-07-31. Founder research folded in: Wallonia is GIS-rich / legislation-poor (the
inverse of Brussels), exposed through the SPW `geoservices.wallonie.be` ArcGIS REST catalogue (PDS + GRU
spatial overlays + RELIEF LiDAR MNT 2021–22 50 cm + EAU/ZI flood + CNSW soil + COSW land-cover), CC-BY.
Resolution-strategy model per field: `spatial_join` (PDS + intersecting layers) · `legislation_lookup`/
`hierarchy_lookup` SOL→communal-guide→CoDT (dimensional) · `explicitly_not_defined` (FAR, null not 0) ·
`spatial_overlay` (heritage/flood/terrain/soil/land-cover). ⚠ ArcGIS layer/field names are `PROBE:` until
a live GetFeature confirms them — GIS existence ≠ schema audited. Plan de secteur GeoServer WFS + OGC API
Features VERIFIED LIVE 2026-07-24; federal cadastre VERIFIED LIVE. Whether Liège has adopted a GCU is NOT
YET ASSESSED — no dimensional cell rises above ~0–2% until a SOL/communal-guide/GCU instrument specifies a
number. Strategic direction: a reusable Wallonia Planning SDK around the ArcGIS REST catalogue (record
only, not built). Maintainer: UNASSIGNED.*
