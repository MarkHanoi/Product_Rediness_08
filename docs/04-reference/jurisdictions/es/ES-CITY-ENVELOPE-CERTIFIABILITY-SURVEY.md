# Spain — 10-Biggest-Cities Envelope-Certifiability Survey

> **Status:** LIVE-VERIFIED survey, 2026-07-26. Every endpoint below was **hit live**
> this session (WMS GetCapabilities / WFS GetFeature / ArcGIS REST `?f=json` + `/query`),
> not merely referenced. Negatives (PDF-only / no-backend) are from live 404 / redirect /
> closed-viewer responses.
>
> **Purpose:** decide, per city, whether a **computed certified buildable envelope** is
> reachable from a queryable GIS, or whether it is an honest **PDF-gated refusal**. This is
> the sourcing map for the Spain "10 biggest cities" envelope-pack rollout the founder
> requested ("if Spain Envelope is by municipality — target the 10 biggest cities").
>
> Governs against **C58** (jurisdiction-agnostic envelope engine) + **§CONTEXT-DATA-HONESTY**
> (failure ≠ empty ≠ fabricated — a cited PDF refusal beats an invented number). Cross-refs
> `GEO-DATA-SOURCING-MASTER.md` (terrain + height sourcing) and `ADR-0277`.

## The one recurring shape

Every Spanish municipality follows the **same two-part model**:

1. **Spatial key (queryable, free):** a GIS polygon carrying a *calificación / zona de
   ordenanza* **code** + clase de suelo + uso, cadastre-joinable. This is machine-readable
   and certifiable **as geometry + zone identity**.
2. **Numeric envelope (the cost):** edificabilidad (m²/m²), ocupación %, altura/nº plantas,
   patios — almost never inline attributes. They resolve from the **PGOU/PGO normativa keyed
   by the zone code**. Digitizing that per-zone parameter table is the **whole cost**, and it
   is **SOURCING — human-gated**, not an engineering gap (same conclusion as
   `barcelona-data-pipeline-map`).

So "CERTIFIABLE" below means **the spatial key is live + queryable and the normativa
crosswalk is a bounded one-time digitization**. "PDF-ONLY" means **even the spatial key is
not exposed** — no live queryable backend — so a computed envelope is an honest refusal today.

## Ranked verdict table (the 10 biggest + Córdoba)

| # | City | Verdict | Backend (live-hit) | Zone code | Height in GIS? | Crosswalk cost |
|---|------|---------|--------------------|-----------|----------------|----------------|
| 1 | **Madrid** | RING-ONLY (decided) | Catastro + ficha | n/a | — | E not computed; ring + cited COEF_Z is the defensible end-state (see `madrid-nz1-ring-only-decision`) |
| 2 | **Barcelona** | ✅ CERTIFIED (constructed) | MUC + Art.242.2 | clau | derived | shipped — edificabilitat is an algorithm not a lookup (`barcelona-edificabilitat-is-a-construction`) |
| — | **Córdoba** | ✅ VERIFIED computable | GeoServer WFS `coaco:*` | zona | via `vhex25_max_plantas` | PEPCH'01 Arts 43-55 model confirmed; resolver pending |
| 3 | **Valencia** | ⚠ PARTIAL (PDF-dependent) | ArcGIS REST `geoportal.valencia.es/server` L231 | `califi`+`tipoca` | **NO** (not even height) | full parameter crosswalk required |
| 4 | **Sevilla** | ⚠ PARTIAL → near-CERTIFIABLE | ArcGIS REST `cdu.urbanismosevilla.org/arcgis` L25 | `zona_orden` | ✅ `altura_max` (plantas) | per-zone FAR/ocupación only; endpoint hands the exact PDF URL per parcel |
| 5 | **Zaragoza** | ✅ CERTIFIABLE | GeoServer `idezar-sig.zaragoza.es/servicios/geoserver` | calificación (WMS GetFeatureInfo) | ✅ `urbanismo:Alturas_Edificios` (WFS) | zone-code→edificabilidad; host is 503-flaky |
| 6 | **Málaga** | ❌ PDF-ONLY | none live/public (sig.malaga.eu REST 404; PEPRI visor closed) | — | — | honest refusal — INFURB certificate + PDF normativa only |
| 7 | **Murcia** | ❌ PDF-ONLY | GeoServer `geoserver.murcia.es` (geometry only) | withheld | — | honest refusal — envelope behind `infourb` PDFs |
| 8 | **Palma de Mallorca** | ✅ CERTIFIABLE | ArcGIS REST `ideib.caib.es/.../GOIB_MUIB` L10 | `CODIMUIB` | ✅ via `normativa.jsp` | **structured HTML sheet** (NP/HR/O/PM/setbacks) one HTTP hop away — high leverage, covers ALL Balearics |
| 9 | **Las Palmas GC** | ⚠ PARTIAL | GRAFCAN WMS `idecan2.grafcan.es/ServicioWMS/Planeamiento` | `ZUSO`/`CLA`/`EDIF` | — | code→PGO crosswalk; GRAFCAN covers all Canarias |
| 10 | **Bilbao** | ⚠ PARTIAL | GeoBizkaia ArcGIS REST `geo.bizkaia.eus/.../Plangintza_Planeamiento` | `CalificacionPormenorizada*` | — | code→PGOU crosswalk; ⚠ authoritative geoEuskadi UDALPLAN WFS was geo-blocked from our egress — re-probe before locking |

**Tally:** 4 CERTIFIABLE now (Barcelona✅shipped, Córdoba, Zaragoza, Palma) · 1 near-certifiable
(Sevilla) · 3 PARTIAL needing crosswalk (Valencia, Las Palmas, Bilbao) · 2 honest PDF refusals
(Málaga, Murcia) · Madrid ring-only by decision.

## Per-city detail

### Valencia — PARTIAL (leaning PDF-dependent)
- **Endpoint:** `https://geoportal.valencia.es/server/rest/services/OPENDATA/UrbanismoEInfraestructuras/MapServer`, zoning = **layer 231 "PGOU - Calificaciones"** (the `/server/...` path is stable; `/arcgis/...` throws intermittent ECONNRESET).
- **Fields (live):** `califi` (zone code), `clase`, `uso`, `tipoca`, `categoria`, `linkid`. Sample: `califi="ENS"/clase="SU"/tipoca="1"` (Ensanche); `califi="EDA"` (Edif. abierta); `CHP`, `RV`. **NO** edificabilidad / altura / ocupación anywhere in the schema; no `refcat` join key on the zoning layer.
- **Why PARTIAL:** polygons + code fully certifiable, but **every** numeric parameter is withheld to the PGOU normas keyed by `califi`+`tipoca` — weaker than Sevilla (Valencia doesn't even expose height).
- **Authority:** Ajuntament de València, Servei de Planejament (PGOU 1988; PGE in drafting). Cartographic backup: ICV / Terrasit (GVA).

### Sevilla — PARTIAL → near-CERTIFIABLE
- **Endpoint:** `https://cdu.urbanismosevilla.org/arcgis/rest/services/Info_Urban_Groups/PGOU/MapServer`, zoning = **layer 25 "Calificación"** (FeatureServer + MapServer).
- **Fields (live):** `clase_cat`, `u_global` (30+ coded uses), `zona_orden` (ordinance zone), **`altura_max`** (structured!), `enlace_ng`/`enlace_np` (deep links to the per-zone Normas PDF). Sample: `u_global="Residencial. Vivienda"/zona_orden="SB: Suburbana"/altura_max="4"/enlace_np=…06_TR_NORMAS_SB.pdf`.
- **Why near-CERTIFIABLE:** clase + zona + uso + **height** come straight from attributes and are computable now; only FAR/ocupación need a one-time per-zone digitization — and the endpoint **hands you the exact PDF URL per parcel**. Same zone-code→table shape as Córdoba/Madrid, but with height already structured. **Best PARTIAL of the set.**
- **Authority:** Gerencia de Urbanismo y Medio Ambiente (GUMA), Ayto. de Sevilla — IDE.Sevilla. Instrument: Texto Refundido PGOU 2006.

### Zaragoza — CERTIFIABLE
- **Endpoint:** `https://idezar-sig.zaragoza.es/servicios/geoserver/` (behind the Visor de Urbanismo). WMS 1.3.0 + WFS 1.1.0 GetCapabilities both retrieved live. ⚠ host is WAF-throttled — 503 on ~3 attempts then answers; genuinely public. (The other host `idezar.zaragoza.es/geoserver` carries only parcelario/heat-island — not planeamiento.)
- **Layers (live, `queryable="1"`):** `Plano_Calificacion` (zoning — **WMS GetFeatureInfo only**, not a WFS type), `Plano_Clasificacion`, `Plano_Estructura`; **`urbanismo:Alturas_Edificios`** (per-building height, **on WFS**), `Parcelas`, `Manzanas`, `Lineas_Edificaciones`, `suelos_vacantes`, INSPIRE `cp:CadastralParcel/Zoning`.
- **Why CERTIFIABLE:** genuine per-parcel queryable GIS (WMS GetFeatureInfo on calificación + WFS parcels/heights), cadastre-joinable. Numeric edificabilidad needs the normativa crosswalk per zone code (same as Barcelona/Córdoba).
- **Authority:** PGOU de Zaragoza (Texto Refundido), Ayto. de Zaragoza; latest prescriptions CPU 50/2024/123, BOPZ 01-Feb-2025.

### Málaga — PDF-ONLY (honest refusal)
- **No public queryable zoning GIS found live:** `sig.malaga.eu/arcgis|/server/rest/services` → 404; `geoportal.malaga.eu` → 301 to the callejero; `datosabiertos.malaga.eu` → only callejero/vial; the PEPRI GIS visor → **"Visor cerrado temporalmente, en proceso de actualización"**; malagadata ArcGIS hub search → 0 urbanismo matches; an INSPIRE "WMS Urbanismo" record exists but no live GetCapabilities resolved.
- **Regime delivery:** per-parcel urbanistic data via **INFURB/INFUSO/INFPE** certificates through the sede electrónica (tramite 8394) — **narrative PDF certificates**, not queryable fields; PGOU normativa published as PDFs.
- **Verdict:** honest refusal for a computed certified envelope today; would flip to PARTIAL only if the PEPRI/INSPIRE WMS is confirmed reopened.
- **Authority:** PGOU Málaga (Aprob. Definitiva Jul-2011), Gerencia Municipal de Urbanismo (GMU); regional IDEAndalucía is not a per-parcel service.

### Murcia — PDF-ONLY (honest refusal)
- **Endpoint:** GeoServer `http://geoserver.murcia.es/geoserver/wfs` (+ `/wms`) — the only backend; **no ArcGIS REST directory**. Enumerated all 212 WFS FeatureTypes live.
- **Fields (live):** `Murcia:pgou_sectores` → only `sector`, `clase_suelo`, `categoria`, `uso_global`, `superficie`, `url`/`url2` (**PDF links**) — **no edificabilidad/plantas/altura/ocupación**. `Murcia:pgou_nf1` (calificación polygons) → **geometry-only, zero attributes**. Cadastral join exists but carries no planning parameters.
- **Verdict:** spatial classification queryable; the envelope is coded/withheld into PGOU PDFs via `infourb` links — honest refusal for a computed envelope.
- **Authority:** PGOU de Murcia — Gerencia de Urbanismo, Ayto. de Murcia. (Region CARTOMUR/IDERM only WMS-renders, not the parameter source.)

### Palma de Mallorca — CERTIFIABLE (high leverage)
- **Endpoint:** ArcGIS REST **MUIB** (Mapa Urbanístic de les Illes Balears, Govern Balear): `https://ideib.caib.es/geoserveis/rest/services/public/GOIB_MUIB/MapServer`, zoning = **`/10` QUALIFICACIONS** (+ `/12` classificació, `/11` rural). Palma fully populated (`exceededTransferLimit:true`).
- **Fields (live):** `CODIMUIB` (zone code, e.g. `RE_EU_CJ_E`), `NOM`, `CODICLAS` (`SU`/`SB`), `IDENTITAT`, **`URL`** → `muib.caib.es/mapurbibfront/normativa.jsp?identitat=…`. That page returns a **structured HTML table** (not a PDF): `NP` plantes=3, `HR` altura=7 m, `O` ocupació=20 %, `PM` parcel·la mínima=1000 m², setbacks RA/RF/RM=6/3/3 m, permitted/prohibited usos.
- **Why CERTIFIABLE + high leverage:** polygon→`IDENTITAT`/`URL`→**typed machine-readable parameters** — same shape as Madrid/Córdoba but parameters one HTTP hop away in a structured sheet. **One endpoint pattern covers ALL Balearic municipalities.** Caveat: MUIB is "**caràcter informatiu**" (harmonized, not the legal instrument) — cite the underlying Pla General, use MUIB as transport.
- **Authority:** PGOU de Palma — Gerència d'Urbanisme, Ajuntament de Palma; MUIB compiled by SITIBSA/IDEIB (Govern de les Illes Balears).

### Las Palmas de Gran Canaria — PARTIAL
- **Endpoint:** GRAFCAN/IDECanarias `https://idecan2.grafcan.es/ServicioWMS/Planeamiento?` — WMS 1.3.0, **all 18 layers `queryable="1"`** (GetFeatureInfo). Companion `.../PlanosOrdenacion?`; portals `geobdp.grafcan.es/core/` (consulta urbanística report), downloadable FIP/SIPU shapefiles via `opendata.sitcan.es`. City visor `sit.laspalmasgc.es` is offline — GRAFCAN is the live path.
- **Fields (live):** `CLASI/CLA`, `ZUSO`, `UG`, `EDIF`, `EDIFL`, `TRAP` (rasantes), `AMB`. Samples: `ZUSO="DE - Deportivo"`, `CLA="SUCO - Suelo Urbano Consolidado"`. **GetFeatureInfo returns the zone/use CODE only — no edificabilidad/altura/plantas/ocupación.**
- **Why PARTIAL:** queryable per-parcel zoning + cadastral geometry live; numeric envelope withheld to PGO normativa (or the geobdp "consulta urbanística" report). GRAFCAN pattern covers **all Canarias**.
- **Authority:** PGO de Las Palmas GC — Ayto. LPGC / Gerencia de Urbanismo; served by GRAFCAN (Gobierno de Canarias).

### Bilbao — PARTIAL (re-probe caveat)
- **Endpoint:** GeoBizkaia (Diputación Foral de Bizkaia) `https://geo.bizkaia.eus/arcgisserverinspire/rest/services/LurraldeAntolamendua_PlanificacionTerritorial/Plangintza_Planeamiento/MapServer` — full ArcGIS `/query`. ⚠ The **authoritative** geoEuskadi **UDALPLAN** WFS (`geo.euskadi.eus`) **refused all connections (ECONNREFUSED, geo-blocked)** from our egress — confirmed Bilbao against GeoBizkaia instead.
- **Fields (live):** groups Clasificación / Usos globales / **Calificaciones (26 layers)** / Ámbitos. Layer-12: `Municipio`, `CalificacionPormenorizadaCA`, `CalificacionPormenorizadaEU`, `NombreAmbito`, `Shape`. Sample (`Municipio LIKE '%BILBAO%'`): `CalificacionPormenorizadaCA="Casco histórico con delimitación de A.R.I"`, `NombreAmbito="IB.02 Casco Viejo"`. **No edificabilidad/altura/plantas/ocupación fields.**
- **Why PARTIAL:** live per-parcel zoning + cadastral geometry; numeric envelope withheld to PGOU normativa. **⚠ Re-probe UDALPLAN WFS + `udalplan_descripcion_archivos_shp.pdf` from a non-blocked egress before locking** — the shapefile schema may carry more fields than GeoBizkaia's re-served layer.
- **Authority:** PGOU de Bilbao (texto feb-2023) — Ayto. de Bilbao, Área de Planificación Urbana; UDALPLAN aggregated by Gobierno Vasco, re-served by Diputación Foral de Bizkaia.

## Rollout implication

**Build order (best spatial-key + lowest crosswalk cost first):**
1. **Palma** — structured HTML parameter sheet (`normativa.jsp`), machine-readable; covers all Balearics. *Highest leverage.*
2. **Sevilla** — height already structured; only per-zone FAR/ocupación to digitize, with the PDF URL handed per parcel.
3. **Zaragoza** — WMS GetFeatureInfo + WFS heights; needs the zone-code→edificabilidad table (host 503-tolerance needed).
4. **Córdoba** — model already verified (PEPCH'01), resolver is the remaining build.
5. **Las Palmas / Bilbao** — queryable spatial key; full code→normativa crosswalk; Bilbao pending a UDALPLAN re-probe.
6. **Valencia** — code-only zoning; full parameter crosswalk before any envelope.
7. **Málaga / Murcia** — honest PDF refusals; no build until a queryable backend appears (Málaga PEPRI visor reopening; Murcia has none).

Every crosswalk is **SOURCING (human-gated)**, per the Barcelona precedent — the GIS gives the spatial key for free; the per-zone parameter table is the deliberate, bounded cost.
