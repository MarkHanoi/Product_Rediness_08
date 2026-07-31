# Portugal (`pt`) — Geospatial Data Inventory (DGT OGC API platform)

> **What this file is.** A single-table inventory of the national geospatial layers PRYZM would
> consume for Portugal, folded from the founder-supplied expert review of 2026-07-30
> (*Portugal Geospatial Infrastructure Review*). It catalogues **who owns each layer, how it is
> accessed, its licence, and whether it is production-ready** — the geospatial (data-availability)
> axis, NOT the buildable-rule axis (`RATE.md`) and NOT the LOD/height physical-model axis
> (`LOD-RATE.md`). Never conflate the three.
>
> **Confidence discipline (§CONTEXT-DATA-HONESTY).** Every claim in this file is
> **`CONVERGENT-SECONDARY`** — sourced from an expert review that cites authoritative providers but
> was **NOT live-probed** this pass. A doc claiming a source is available is **not** a wired or
> probed source. **Each row must be confirmed by direct probe before it gates a production decision
> or raises any RATE / LOD-RATE cell.** This file changes NO RATE % cell; the probe items in
> §Probe steps are what would, once PROBED + WIRED, become the Phase-3 PLAN that raises Portugal.
>
> **Session date:** 2026-07-30 · **Maintainer:** UNASSIGNED · **Status:** captured, pending-probe.
> **Probe update 2026-07-31:** the two axis-critical rows (DGT OGC API base + CAOP, and Cadastro Predial
> parcels) are now **`VERIFIED-LIVE`** — see §PROBE RESULT below. No RATE % cell moves on this (the code
> provider is wired-pending-proxy; the server proxy is not yet built).

---

## §PROBE RESULT — DGT endpoints live-probed 2026-07-31 (Phase-4 pt parcel provider)

Direct live probe while building `packages/site-parcel-data/src/parcelProviders/dgtParcelProvider.ts`.
Upgrades two rows from `CONVERGENT-SECONDARY` to **`VERIFIED-LIVE`**, and **corrects one inventory
assumption**:

1. **DGT OGC API platform is LIVE** — base URL is **`https://ogcapi.dgterritorio.gov.pt/`** (OGC API
   Features). `/collections` enumerates CAOP (`municipios`, `freguesias`, `distritos`, `admin`, NUTS,
   `trocos`), COS (`cos2018v3` / `cos2023v1` / `cosc2018..2023`), and 30 cm orthophotos (`ortos-rgb` /
   `ortos-irg`). **storageCrs `EPSG:3763`**, also offered in `EPSG:4326` / `4258` / `3857`.
2. **CAOP DICOFRE join key confirmed** — the `freguesias` queryables expose **`dtmnfr`** (the 6-digit
   distrito+concelho+freguesia = DICOFRE code) as the id attribute, plus `municipio` / `freguesia` /
   `distrito_ilha` / `designacao_simplificada`. (No literal `dicofre` field name — `dtmnfr` IS it.)
3. **⚠ CORRECTION: Cadastro Predial is NOT on the OGC API.** The inventory row below implied the parcel
   layer is on the DGT OGC API platform; the `/collections` listing has **no parcel collection**. Parcels
   are on a **separate INSPIRE WFS** — the SNIC GeoServer.
4. **Cadastro Predial (Continente) WFS is LIVE** — `https://snicws.dgterritorio.gov.pt/geoserver/inspire/ows`,
   WFS 2.0.0, typeName **`inspire:cadastralparcel`**, **licence CC BY 4.0 (declared on the WFS
   GetCapabilities itself)**, **1,789,404 features**. `DefaultCRS = EPSG:3763` (projected metres); the
   formal CRS list does **not** advertise 4326, **but** a `GetFeature` with `srsName=EPSG:4326&
   outputFormat=application/json` **returns GeoJSON in real WGS84 degrees** (`[-7.5534, 39.6713]`) — the
   server-side reprojection seam works (the DK/BE/NL/NO pattern). DescribeFeatureType attributes:
   `inspireid` (`PT.DGT.CP.<NIC>`), `nationalcadastralreference`, `label` (the NIC, e.g. `AAA 001 318 684`),
   `areavalue` (m²), `administrativeunit` (município code, e.g. `051102`).

**PARCEL axis status → `wired-pending-probe`.** A package-local `dgtParcelProvider` is wired to the LIVE
endpoint above (typed refusal union, never-throws, EPSG:3763→WGS84 CRS guard, OTel span, injectable
`fetchImpl`, `/api/parcel/pt` proxy). It is **NOT yet production-serving**: the server-side
`/api/parcel/pt` proxy is not built, and the registry row is orchestrator-owned. **No RATE / LOD-RATE %
cell moves.** Standing caveat (unchanged): Cadastro Predial coverage is **mainland-only** and **per-
município (CGPR/SiNErGIC)** — still **unconfirmed for the Lisbon (1106) / Porto (1315) urban cores**
(README §2.1 / NEXT §3.1); a click in an unmapped área returns an honest `no-parcel-here`, never a
fabricated ring.

---

## Headline (from the review)

Portugal's national geospatial infrastructure is delivered largely through the **DGT OGC API
platform** (`dgterritorio.gov.pt` / `snig.dgterritorio.gov.pt`) and, for geology, a modern **LNEG
OGC API**. The reviewer scored the **infrastructure 9/10** (EXCLUDING envelope/zoning rules ≈ 0%
and building heights, which are the weak axes). The review reports the DGT platform layers as
**CC BY 4.0** — but this, like every claim here, is `CONVERGENT-SECONDARY` and pending direct
probe.

- **CAOP** (admin boundaries) is the reviewer's "easiest win" — the jurisdiction-routing analogue
  of Germany's AGS and France's INSEE lookup.
- **Building height is the biggest unknown**: there is **no national building-height raster**
  (unlike Spain's CNIG MDS Edificación). Height is derivable as **nDSM = DSM − DTM** from DGT
  LiDAR (~90% continental); there is no national floor-count attribute and RMSE-Z is unpublished.
- **Copernicus DEM (~30 m)** is a **terrain fallback** for the NW-mainland gap outside DGT LiDAR —
  terrain, NOT building height. Do not conflate.

---

## The inventory

| Layer | Authority | Access | API | Download | Licence | CRS | National | Production-ready | Confidence |
|---|---|---|---|---|---|---|---|---|---|
| **CAOP** — administrative boundaries (distrito + concelho + freguesia) | DGT | **`https://ogcapi.dgterritorio.gov.pt/`** (OGC API Features) | **OGC API Features — collections `municipios`/`freguesias`/`distritos` (PROBED 2026-07-31); DICOFRE join attr = `dtmnfr`** | GeoPackage / Shapefile via SNIG | CC BY 4.0 *(platform reports; parcel WFS confirms)* | **EPSG:3763 storageCrs; 4326/4258/3857 offered (PROBED)** | Yes | **Reviewer ★★★★★ "easiest win"** — **VERIFIED-LIVE** | **`VERIFIED-LIVE` (2026-07-31)** |
| **Cadastro Predial (Continente)** — parcel geometry + NIC | DGT (SNIC — Autoridade Nacional de Cadastro Predial) | **SNIC INSPIRE WFS `https://snicws.dgterritorio.gov.pt/geoserver/inspire/ows` — NOT the OGC API (corrected)** | **WFS 2.0.0, typeName `inspire:cadastralparcel` (PROBED 2026-07-31); 1,789,404 features** | Shapefile / GeoPackage / DXF / GeoJSON per parcel | **CC BY 4.0 (declared on the WFS GetCapabilities)** | **DefaultCRS EPSG:3763; `srsName=EPSG:4326` reprojection returns real WGS84 GeoJSON (PROBED)** | **Mainland only**; coverage varies (CGPR/SiNErGIC ~134 munis; NOT confirmed for Lisbon/Porto cores — see §2.1 README) | ★★★★☆ **coverage-limited** — **VERIFIED-LIVE endpoint; `wired-pending-probe` provider** | **`VERIFIED-LIVE` (2026-07-31)** |
| **CRUS** — Classificação e Uso do Solo (territorial classification) | DGT | DGT OGC API platform | OGC API — *collection name pending-probe* | GeoPackage / Shapefile via SNIG | CC BY 4.0 *(reported; pending-probe)* | pending-probe | Yes | ★★★★★ — pending-probe | `CONVERGENT-SECONDARY` |
| **COS** — Carta de Ocupação do Solo (land cover) | DGT | DGT OGC API platform | **OGC API** *(review upgrades from prior WMS/WFS lead)* | GeoPackage / Shapefile via SNIG | **CC BY 4.0** *(review upgrades from "Open")* | pending-probe | Yes | ★★★★★ — pending-probe (too coarse for individual park boundaries; district-scale context only) | `CONVERGENT-SECONDARY` |
| **Orthophotos** — 30 cm national imagery | DGT | DGT OGC API platform (analogue of Spain's PNOA) | OGC API / tiled imagery — *pending-probe* | Tiled orthoimagery via SNIG | CC BY 4.0 *(reported; pending-probe)* | pending-probe | Yes | ★★★★★ — pending-probe | `CONVERGENT-SECONDARY` |
| **Geology (LNEG)** — geological mapping | **LNEG** (Laboratório Nacional de Energia e Geologia — energy + geology lab) | LNEG geoportal | **Modern OGC API** *(review upgrade)* | via LNEG geoportal | *pending-probe* | pending-probe | Yes | ★★★★★ — pending-probe. **DISTINCT from LNEC** (civil-eng lab, geotech) — do NOT conflate | `CONVERGENT-SECONDARY` |
| **DGT LiDAR → nDSM** — derived building height | DGT (PRR campaign, flown Apr 2024 – Mar 2025) | `cdd.dgterritorio.gov.pt` (Centro de Dados do Território) | tile grid / QGIS "DGT CDD Downloader" plugin | LAZ 10 pts/m² · DTM 50 cm · DSM 2 m GeoTIFF | "sem qualquer tipo de restrição" *(pending-probe)* | pending-probe | **~90% continental** (NW gap, rolling) | **★★★☆☆ — biggest unknown.** No national height raster; **height = nDSM (DSM − DTM)** in-module; no floor-count attribute; RMSE-Z unpublished | `CONVERGENT-SECONDARY` |
| **Copernicus DEM** — ~30 m terrain (fallback) | ESA / Copernicus | Copernicus Data Space | GLO-30 tiles | GeoTIFF | Copernicus open licence | EPSG:4326 (GLO-30) | Global (fills NW-mainland ~10% gap outside DGT LiDAR) | ★★★★★ as **terrain fallback** — **NOT a building-height source** | `CONVERGENT-SECONDARY` |
| **Building-height raster (national)** | — | — | — | — | — | — | **Does NOT exist** (unlike ES CNIG MDS Edificación) | **N/A — the biggest gap.** Derive via DGT-LiDAR nDSM module | `CONVERGENT-SECONDARY` (negative) |
| **Environmental (REN / RAN / Natura 2000 / Protected / Flood)** | APA / LNEG / CCDR (scattered) | Multiple portals (no single portal) | mixed | mixed | Open *(pending-probe)* | pending-probe | Yes, but fragmented | ★★★★☆ — **available but scattered**; no single catalogue | `CONVERGENT-SECONDARY` |

**Ranked building-height sources (review, best-first):** (1) **DGT LiDAR → nDSM** [our shared
ES/FR/PT module]; (2) **municipal LiDAR** (e.g. Lisbon CML 3D, licence TBV); (3) **Copernicus DEM
~30 m** [terrain fallback, NOT height]; (4) **derived DSM** (compute-heavy). Note (3) is terrain,
listed only to rank it below the true height sources.

---

## Strategy note (from the review)

> "Litehaus = catalogue; trace every layer to its authoritative provider (DGT / APA / LNEG /
> Copernicus)." Depend on **stable public services**, not an aggregator. The DGT OGC API platform,
> the LNEG OGC API, and Copernicus are the authoritative anchors; an aggregator/catalogue is a
> convenience index, never the source of record.

The review **upgrades many prior `VERIFIED-LEAD` entries to `CONVERGENT-SECONDARY` pending probe**
— it corroborates them with an expert second source, but does not live-probe them. It therefore
does **not** raise Portugal above its current rate; it defines the probe queue that would.

---

## §Probe steps (the geospatial probe queue)

These are the exact live probes that would upgrade the rows above from `CONVERGENT-SECONDARY` to
`VERIFIED-LIVE` and, once WIRED, become Phase-3 PLAN items. Mirrors the review's NEXT §8 list. See
also `../NEXT.md`.

1. **✅ DONE 2026-07-31 — Confirm the DGT OGC API base URL.** Base = **`https://ogcapi.dgterritorio.gov.pt/`**
   (OGC API **Features**); `/collections` lists CAOP/COS/ortho, storageCrs EPSG:3763. See §PROBE RESULT.
2. **✅ DONE 2026-07-31 — Probe CAOP OGC API.** `municipios` + `freguesias` collections live; DICOFRE join
   attribute is **`dtmnfr`** (freguesias queryables). See §PROBE RESULT #2.
3. **Probe CRUS collection.** Confirm the CRUS collection exists on the OGC API, returns
   territorial-classification polygons, and record the classification attribute schema.
4. **Probe LNEG OGC API.** Confirm the LNEG (geology) OGC API endpoint is live and distinct from
   any LNEC (civil-eng) service; record the base URL + one collection name. Do NOT conflate the two
   labs.
5. **Confirm COS + 30 cm ortho as OGC API + CC BY 4.0.** Verify COS is served via OGC API (not only
   WMS/WFS) and that the DGT platform licence string is genuinely CC BY 4.0 platform-wide (read the
   licence/attribution field, don't infer).
6. **◐ PARTIAL 2026-07-31 — Confirm Cadastro Predial endpoint + coverage.** Endpoint DONE: it is a **WFS
   (NOT the OGC API)** — `snicws.dgterritorio.gov.pt/geoserver/inspire/ows`, `inspire:cadastralparcel`,
   CC BY 4.0, 4326-reprojection works, geometry + NIC + área confirmed (§PROBE RESULT #4). **STILL OPEN:**
   the CGPR/SiNErGIC per-município coverage for Lisboa (1106) / Porto (1315) / Braga (0303) — the standing
   #1 blocker (README §2.1 / NEXT §3.1) — is NOT resolved by this probe (the WFS answers where covered; it
   does not publish the coverage list).
7. **Confirm Copernicus DEM fallback boundary.** Record which NW-mainland municipalities fall in the
   ~10% DGT-LiDAR gap that Copernicus GLO-30 backfills (terrain only).

**Honesty gate:** until a row is probed, it stays `CONVERGENT-SECONDARY` here and `null`/unchanged
in every RATE and LOD-RATE cell. Ship the probe before the fix.

---

## Cross-references

- `sources/SOURCES.md` — per-field national data-source citations (this review folded into §A.2).
- `findings/PORTUGAL-GEOSPATIAL-INFRASTRUCTURE-REVIEW.md` — the narrative source analysis + reviewer
  9/10 infrastructure score.
- `LOD-RATE.md` — the physical-model (height/parcel) axis; carries the "no national height raster;
  Copernicus DEM terrain fallback" note.
- `README.md §2` — national data-source narrative (parcels, SNIT, LiDAR, heritage, context).
- `NEXT.md §9` — the geospatial probe queue in resume-step form.

---

*Last updated: 2026-07-31. The CAOP + Cadastro Predial rows are now `VERIFIED-LIVE` (see §PROBE RESULT);
all other rows remain `CONVERGENT-SECONDARY` (expert review, NOT live-probed). A live endpoint is not a
wired production source — no RATE / LOD-RATE cell moves until the `/api/parcel/pt` proxy + registry row
land. Maintainer: UNASSIGNED.*
