# Parcel Selection → Buildable-Envelope Feature — Scoping, Architecture & Phased Plan

> **Stamp**: 2026-07-17 · **Status**: SCOPING (no code changed, no contract flipped, no tracker edited)
> **Author**: Principal GIS / Urban-Planning-Tech / Product Architect (scoping pass)
> **Tracker**: **L-380** (this initiative) · sub-items L-380a–e (see §13). Sibling of **L-374** (provider-agnostic
> Context Engine) and **L-373** (data-credibility discipline) — this feature reuses both patterns.
> **Governance posture**: this is a launch-readiness/strategy scoping doc, NOT a `*-AUDIT.md` contract-derivative.
> It references the canonical C-contracts and never redefines them. Recommends NEW governance (§9) but authors none here.
> **Zero-dependency claim**: additive; ZERO dependency on the in-flight September P0/P1 launch work
> (data-loss L-334/L-360, collab L-335, WebGPU device-loss L-361/L-372, generation-perf L-377). See §12.

---

## §0 — The item, in one line

> A user **selects a real parcel** on PRYZM's existing 2D GIS map; PRYZM fetches the **real cadastral geometry**,
> highlights it in the brand violet, then computes and shows the **buildable envelope** (setbacks, height limit,
> plot ratio / FAR, permitted use) from that parcel's municipal zoning — feeding the existing
> site-boundary → generate flow. **Spain-first pilot** (Catastro + Catalonia MUC), Switzerland (ÖREB) fast-follow.

Today the user **draws** a boundary. This feature adds **select-a-real-parcel** as the input, without removing draw
(draw remains the universal fallback for jurisdictions with no data — §8.5).

---

## §1 — Executive summary + recommendation

**Recommended pilot (ranked, live-evidence in §3–§5):**

1. **Spain — pilot municipality Barcelona (Catastro parcels + Catalonia MUC zoning).** Honours the founder's
   Spain-first mandate. Parcel access is **best-in-class and free**: the Catastro INSPIRE WFS is **live-verified**
   (`cp:CadastralParcel`, WFS 2.0.0, GML 3.2.1, default EPSG:4326 + EPSG:25830) and the OVC `Consulta_RCCOOR`
   reverse-geocode turns a map click into a *referencia catastral* keyless. Zoning is strongest in **Catalonia via
   the MUC** (Mapa Urbanístic de Catalunya) — a Catalonia-wide **standardized** WFS/WMS + Shapefile/GML with
   *classificació del sòl* + *qualificació urbanística* zones, refreshed semi-annually. **Madrid** is municipality #2
   (Catastro parcel excellent; PGOUM-97 zoning via geoportal WMS + *edificabilidad* polygons, some fields PDF-only).
2. **Switzerland — fast-follow (geodienste.ch parcels + ÖREB-Kataster + optional Terrara).** *Structurally* the most
   standardized: one EGRID-keyed national cadastre (live WFS/GeoJSON, EPSG:2056) and a federally-standardized ÖREB
   extract (XML per EGRID) giving zone-type + a legal-document reference nationwide. **Caveat (decisive):** the
   *numeric* envelope (height / Ausnützungsziffer-FAR / setback) still lives in a referenced *Baureglement* **PDF**,
   not structured fields — the same gap Spain has. **Terrara** (terrara.ch) is the one vendor that has normalized
   3,000+ municipal building codes → a buy-vs-build decision (§4.4, §9.2).
3. **Denmark — reference / best expansion target (Plandata.dk).** The single most standardized *national* open zoning
   register (WFS/WMS/WMTS; *bebyggelsesprocent* / height / floors as **structured** fields on ~40% of local plans).
   Not Spain-first, so out of pilot scope, but the reference architecture the Zoning Rules Engine should generalize to.
   Norway is mid-governance-churn (plan register handed to DiBK from 2025-12-31); Sweden's *detaljplan* is nationally
   incomplete — both rank below.

**The honest architectural conclusion** (§6): *numeric* building rules are **PDF-trapped in every jurisdiction except
Denmark**. Therefore the **Zoning Rules Engine** must support two input fidelities — (a) *structured* numeric fields
where published, and (b) **zone-class → curated envelope ruleset** (a hand-maintained per-jurisdiction lookup, mirroring
the existing `rules/programRules.ts` architectural-program DB) for everything else — and every derived envelope MUST be
labelled *estimated / verify against ordinance* per the **L-373 credibility discipline**, never presented as authoritative.

**Effort to ONE working pilot** (Barcelona: click-parcel → highlighted geometry → envelope in plan): **~5–7 dev-weeks**
across the two systems + server proxy + UI (§11). Scale to a second municipality/country: **~2–3 wk each** once the
provider abstractions exist.

---

## §2 — Existing-code grounding (do NOT build net-new map infra)

The feature slots into seams that already exist. Verified `file:line`:

| Seam | Where | Role in this feature |
|---|---|---|
| 2D GIS map (MapLibre) | `apps/editor/src/ui/geospatial/SiteBoundaryMap2D.ts` | The host surface. Already does map click, `queryRenderedFeatures` footprint snapping, brand violet `#6600FF`, Map/Satellite toggle, a mode strip. **Add a "Select parcel" mode** next to Rectangle/Linear/etc. |
| Draw→boundary commit | `SiteBoundaryMap2D.ts` (`vertices`, `commit()`) → `buildBoundaryFromLatLonRing` (`apps/editor/src/ui/site/boundaryProjection.ts:143`) | Converts a lat/lon ring → scene-XZ metres. A **fetched parcel polygon is just a pre-supplied ring** — reuse verbatim. |
| Boundary dispatch | `dispatchParcelBoundary` (`apps/editor/src/ui/site/siteDispatch.ts:454`) → `siteSetParcelBoundary` (`packages/stores/src/site-commands/siteSetParcelBoundary.ts:35`) | One-shot, C19 §1.4 immutable. Emits `site.parcel-boundary-set`. **Parcel-select commits down this identical path.** |
| Location dispatch + LTP-ENU origin | `dispatchSiteLocation` (`siteDispatch.ts:391`) sets `LTPENURebase` origin (C19 §1.3) | Reverse-geocode → set location first, then the parcel polygon projects in that frame. |
| Site model + zoning fields | C19 `Parcel` schema (`docs/02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md` §2.3) already carries `setbacks.{front,side,rear}`, `maxFAR`, `maxHeight`, `zoning.{category,overlays,jurisdictionRef}` + the `site.updateZoning` command (§4.1) | **The envelope's destination already exists.** No schema invention for the *output* — the zoning engine populates these mutable fields via `site.updateZoning`. |
| Generate seam | `generateResidentialFromBoundary` (`apps/editor/src/ui/residential-building/residentialFromBoundary.ts:173`) reads `store.getParcelBoundary()` | Envelope must feed **here** (existing boundary→generate path, P6 bus) — not a one-off. Setback-inset polygon + maxHeight become generator constraints. |
| Server-side geo proxy precedent | `server/overpassProxy.js` (`/api/overpass`, shared 24h LRU cache, forwards once, non-fatal empty fallback, CSP `connect-src 'self'`); mounted `server.js:357` | **The exact template** for a Catastro/MUC/ÖREB proxy (CORS + rate-limit + GML→GeoJSON normalize + cache). |
| Geocode provider pattern | `geocodeAddress` (`apps/editor/src/ui/site/geocodeAddress.ts:40`) — env-overridable endpoint, CSP-gated, keyless Nominatim | Pattern for a provider-agnostic, env-overridable data source. |
| Provider-agnostic Context Engine | L-374 (`docs/04-reference/FORMA-CONTEXT-ENGINE-AUDIT.md`) — `BuildingProvider`/`TerrainProvider` adapters, open+premium tiers | **Mirror this exactly**: `ParcelProvider` / `ZoningProvider` adapters, open tier (Catastro/MUC/ÖREB) + premium tier (Terrara). |
| Credibility discipline | L-373 (`docs/04-reference/3D-SITE-ANALYSIS-AUDIT.md`) — provenance labels, absolute-vs-relative, CI fidelity-label gate | Every derived envelope carries provenance + an "estimated, verify" badge; a CI gate enforces the label. |
| Brand colour | C18 §; `#6600FF` (violet) throughout `SiteBoundaryMap2D.ts`; C19 §5.5 mandates `#6600FF` for Site/Parcel previews | Parcel highlight + envelope preview MUST use `#6600FF`. |
| Vision anchor | STR-12 §2.1 already declares "**Plot boundary** — the legal extent of the site, from **cadastral / GIS data**" and "**Regulatory context** — planning code + setback rules + height envelopes + use-class per C19" as first-class site substrate | This feature **realizes** an already-declared (but today aspirational — user draws) part of the vision. |

**Net**: there is NO net-new map infrastructure. This is (1) a data-fetch layer, (2) a deterministic rules layer,
(3) one new map interaction mode, and (4) a reuse of the existing commit + generate seams.

---

## §3 — Step 1: Parcel Data Layer feasibility (LIVE research)

### §3.1 — Spain — Dirección General del Catastro (PILOT) — **VERIFIED LIVE**

| Aspect | Finding | Evidence |
|---|---|---|
| Parcel geometry (INSPIRE WFS) | **Live GetCapabilities confirmed.** FeatureType `cp:CadastralParcel` ("Cadastral parcel polygons"), **WFS 2.0.0**, output `text/xml; subtype=gml/3.2.1` + `application/gml+xml`. Default CRS **EPSG:4326**; also EPSG:25829–25831 (Spanish UTM), 3857, 3035, 4258. National bbox −18.5…5.3 lon / 26.2…44.8 lat. **No result paging / no stored-query management.** | `https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?service=WFS&request=GetCapabilities` (fetched 2026-07-17) |
| Query-by-point | **CRITICAL CONSTRAINT (verified): the Catastro WFS does NOT support BBOX / ad-hoc spatial filters** — only ID-based stored queries (`GetParcel`, `GetZoning`, `GetFeatureById`, `GetNeighbourParcel`, `GetParcelsByZoning`) keyed by *referencia catastral* (REFCAT). So the point→parcel flow is: reverse-geocode the click to a REFCAT (OVC, below), then `STOREDQUERIE_ID=GetParcel&REFCAT=<ref>`. Alternative one-shot: the **Cartografía WMS `GetFeatureInfo`** returns the parcel at a point directly. | ListStoredQueries (live 2026-07-17); sample `wfsCP.aspx?...request=getfeature&STOREDQUERIE_ID=GetParcel&REFCAT=36050A01000100` |
| One-shot point query (WMS) | **Cartografía WMS 1.3.0 verified live**: `http://ovc.catastro.meh.es/cartografia/INSPIRE/spadgcwms.aspx` — queryable layers `CP.CadastralParcel`, `CP.CadastralZoning`, `BU.Building`, `AD.Address`; `GetFeatureInfo` → parcel at a click. **License clause (quoted): "Free access, but massive downloads and tiled petitions are not allowed"** → use for interactive picking only, NOT as a tile backend. | `spadgcwms.aspx?service=WMS&request=GetCapabilities` (live) |
| Click → cadastral ref (reverse-geocode) | **OVC `Consulta_RCCOOR`** — keyless. `http://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_RCCOOR` with `SRS` + `Coordenada_X/Y` → returns the *referencia catastral* + address (town/street/number). `Consulta_RCCOOR_Distancia` returns candidates within ~50 m² if the point misses. | rOpenSpain `CatastRo` docs (`ropenspain.github.io/CatastRo`), gist `fpsampayo/6c1ca0363...` |
| Bulk / download | **ATOM** download service (per-municipality GML), + Cartografía WMS at `ovc.catastro.meh.es/Cartografia`. | catastro webinspire docs |
| License | Catastro INSPIRE data is **open / reusable** (public administration, INSPIRE-mandated interoperable services). Confidence HIGH. | datos.gob.es dataset `e0dat0002` |
| Rate limits | Public WFS/OVC are shared endpoints; **must** be fronted by our server proxy + cache (§6.4). Real limits undocumented → treat conservatively (mirror `overpassProxy.js` throttle). | inference |

**Click→select design (Spain, corrected for the no-BBOX WFS):** map click → `pointer lngLat` → **`Consulta_RCCOOR_Distancia`**
(X,Y in EPSG:4326; the *_Distancia* variant returns nearest parcels within a radius, robust when the point misses a
centroid — prefer it over plain `Consulta_RCCOOR`) → *referencia catastral* + address → set site location
(`dispatchSiteLocation`) → **WFS `GetParcel` stored query by REFCAT** → parse GML → brand-highlighted selectable overlay
on `SiteBoundaryMap2D`. (Fast alternative for the hover-preview: **WMS `GetFeatureInfo`** at the cursor.)

### §3.2 — Switzerland — ÖREB substrate (fast-follow) — **VERIFIED LIVE**

| Aspect | Finding | Evidence |
|---|---|---|
| Parcel geometry (national WFS) | **geodienste.ch** aggregated cantonal AV: WFS 2.0.0, feature type `ms:RESF` (legally-valid parcels), formats GML 2.1.2/3.x + **GeoJSON**, default **EPSG:2056** (CH1903+/LV95). OGC API Features also available. Coverage nationwide but **canton-gated** (a few cantons meter/charge). | `https://geodienste.ch/db/av_0/deu?SERVICE=WFS&REQUEST=GetCapabilities` (live) |
| Click → parcel (EGRID) | **swisstopo** `https://api3.geo.admin.ch/rest/services/api/MapServer/identify`, layer `ch.kantone.cadastralwebmap-farbe`, `sr=2056` → returns **EGRID** + parcel number + canton + polygon. Live test returned `egris_egrid: "CH507635214670"`. Max 50 features/req; ownership NOT public. | live identify call |
| License | Predominantly OGD, cantonally governed. Confidence HIGH on endpoints; MEDIUM on the per-canton fee matrix. | geodienste Datenbezug |

**Verdict**: Switzerland is **easier for parcel geometry** (one EGRID-keyed national cadastre) than Spain's regional
patchwork — but the founder's Spain-first mandate + Catastro's free best-in-class WFS make Spain the correct pilot; CH
is the natural #2.

### §3.3 — Nordics — parcel access (brief)

| Country | Parcel source | Status |
|---|---|---|
| **Denmark** | Matriklen2 via **Datafordeler.dk** (WFS 2.0.0/GML, EPSG:25832) | Free open data, but **free API key/registration required** (not keyless). |
| **Norway** | **Matrikkelen** via Geonorge + REST `https://ws.geonorge.no/eiendom/v1/` (GeoJSON/OGC-API, EPSG:25833), NLOD | **Fully keyless** open subset — the lowest-friction of all candidates. |
| **Sweden** | Lantmäteriet *fastighetsindelning* (SWEREF99 EPSG:3006, CC0) | Free since Feb-2025 (EU HVD) but **Geotorget account-gated**. |

Parcel access is genuinely open across the Nordics; the differentiator is **zoning** (§4.3). **Notable for a zero-friction
technical POC**: Norway's DiBK national zoning copy is keyless GeoJSON (`https://nap.ft.dibk.no/services/rest/reguleringsplaner/vn1`) —
if a non-Spain spike is ever wanted, Norway is the fastest to stand up; **Denmark Plandata.dk** is the richest/most complete.

---

## §4 — Step 2: Zoning / buildable-envelope feasibility (LIVE research)

Checklist fields for a "buildable envelope": **max height**, **setbacks (front/side/rear)**, **plot ratio / FAR /
edificabilidad**, **permitted use**, **max coverage / ocupación**.

### §4.1 — Barcelona / Catalonia — MUC (PILOT zoning source) — **VERIFIED LIVE**

- **Catalonia PLANEJAMENT WFS — verified live** (this is the concrete endpoint, previously unknown):
  `https://sig.gencat.cat/ows/PLANEJAMENT/wfs?service=wfs&version=2.0.0&request=GetCapabilities`. **17 feature types**
  incl. `PLANEJAMENT:MUC_QUALIFICACIONS` (*qualificació urbanística* / *clau*), `PLANEJAMENT:MUC_CLASSIFICACIONS`
  (land classification), `MUC_SECTOR_DESENVOLUPAMENT`. **Output = GML, GeoJSON (JSON), KML, CSV, Shapefile.**
  **Spatial filtering IS supported** (Intersects / Within / Contains / distance) → **you can query by point or BBOX and
  get GeoJSON directly** — the clean "click → qualification polygon" path (unlike Catastro's WFS). Default **EPSG:25831**
  (ETRS89 UTM31N); also 4326/4258. Covers all Catalonia incl. Barcelona. License: INSPIRE "No limitations" / open reuse.
  Refresh **semi-annual**. Companion MUC WMS: `https://dtes.gencat.cat/webmap/MUC/service.svc/get`.
- **What is machine-readable**: zone *class* + *qualification* geometry as GeoJSON attributes (structured). **What is
  MEDIUM-confidence**: the fine numeric envelope (edificabilitat m²/m², altura reguladora, ocupació) — run a
  `DescribeFeatureType` on `MUC_QUALIFICACIONS` in P0.1 to confirm which numeric fields exist; those absent live in the
  municipal **POUM normativa** (PDF) and need the curated ruleset (§6.3 / §7).
- Barcelona city SHP (CC BY 4.0, updated 2025-09-23) `opendata-ajuntament.barcelona.cat/data/dataset/qualificacions-urbanistiques`
  is a fallback (carries the *clau* code; few numeric params) — **prefer the Catalonia PLANEJAMENT WFS** for a point-query GeoJSON API.

### §4.2 — Madrid — PGOUM 97 (municipality #2)

- **Verified queryable ArcGIS REST** (better than WMS): `https://sigma.madrid.es/hosted/rest/services/PGOUM97/PG_ORDENACION/MapServer`
  reports `"capabilities":"Query,Map,Data"` (vector, not a raster cache). Queryable layers *Norma Zonal*, *Ámbitos de
  Ordenación*, *Alineaciones* + lookup tables `USO_NPG`, `USO_ESPECIFICO`; hit `/MapServer/<layer>/query?...&f=geojson`
  for **structured attributes** (zonal norm, use codes, buildability coefficients). *Condiciones de la Edificación* layer
  carries buildable-volume coefficients. EPSG:25830. Open reuse w/ attribution. Dataset refreshed 2019 (PGOUM base 1997).
- **Format reality**: zone + use + some coefficients ARE machine-readable (ArcGIS REST → GeoJSON); the full setback/height
  rulebook per zonal norm remains partly in **normative text (PDF)** → needs the curated ruleset. Also available: region-level
  **IDEM Comunidad de Madrid** INSPIRE **PlannedLandUse WFS** (UNVERIFIED — likely live) as a standardized alternative schema.
  Confidence HIGH that Madrid is queryable structured GIS; MEDIUM on numeric-envelope completeness.

### §4.3 — Denmark / Switzerland on the same checklist (comparison)

| Jurisdiction | Zone geometry | Max height | Setbacks | FAR / plot ratio | Permitted use | Max coverage | National standardization |
|---|---|---|---|---|---|---|---|
| **Denmark (Plandata.dk)** | ✅ WFS/WMS/WMTS | ✅ *(structured, ~40% of plans)* | ~ (varies) | ✅ *bebyggelsesprocent* (structured) | ✅ zone/anvendelse | ✅ | **Best — one national register, 35k+ lokalplaner** |
| **Catalonia MUC** | ✅ WFS/SHP/GML | PDF (POUM) | PDF | partial | ✅ *qualificació* | partial | High (Catalonia-wide) |
| **Madrid PGOUM** | ✅ WMS/visor | ✅ *(VEDA/edificabilidad)* | PDF | ✅ *edificabilidad* | ✅ | ✅ *ocupación* | Per-municipality |
| **Switzerland ÖREB** | ✅ XML extract per EGRID + WFS; + "Bauzonen Schweiz harmonisiert" (9 coarse classes, national) | **PDF (Baureglement)** | **PDF** | **PDF (Ausnützungsziffer)** | ✅ zone type | **PDF** | **Highest *model* standardization; numbers PDF-trapped** |

**Key finding**: numeric building rules are **PDF-trapped in every pilot candidate except Denmark**. This drives the
two-fidelity Zoning Rules Engine design (§6.3).

### §4.4 — Terrara (buy-vs-build, Switzerland) — options, not a decision

- **Offering** (site-verified): ~**4M parcels** across all 26 cantons, **3,000+ municipal building-code/zoning**
  normalizations, AI analysis over **142 parameters** (building potential, value, risk), deliverables in **DXF/DWG/IFC**
  + 3D terrain. It has done the *exact* painful cross-canton normalization raw ÖREB leaves open.
- **Unknowns (UNVERIFIED)**: no public API docs, no published pricing; access is registration-walled + direct-sales.
  Whether FAR/height/setback come as **numeric fields** vs references is undocumented — validate with a 3–5 parcel sample.
- **Recommendation**: present as a **buy option** for the Switzerland fast-follow only; do NOT couple the Spain pilot to
  it. Human/commercial decision (§9.2). Build the `ZoningProvider` interface so Terrara is a drop-in premium adapter.

---

## §5 — Pilot ranking (decision table)

| Rank | Jurisdiction | Parcel ease | Structured zoning | Standardization | Fit to mandate | Verdict |
|---|---|---|---|---|---|---|
| **1** | **Spain / Barcelona (Catastro + MUC)** | ★★★★★ (free WFS + OVC reverse-geocode, live) | ★★★☆ (MUC zone class ✅; numeric params curated) | ★★★★ (Catalonia-wide) | ✅ Spain-first mandate | **PILOT** |
| 1b | Spain / Madrid (Catastro + PGOUM) | ★★★★★ | ★★★ (edificabilidad/VEDA ✅; some PDF) | ★★★ | ✅ | Municipality #2 |
| 2 | Switzerland (geodienste + ÖREB + Terrara) | ★★★★★ (EGRID national) | ★★☆ (zone ✅; numbers PDF unless Terrara) | ★★★★★ (model) | ~ (fast-follow) | #2, needs buy-vs-build |
| 3 | Denmark (Plandata.dk) | ★★★★ | ★★★★★ (bebyggelsesprocent/height structured) | ★★★★★ (national) | ✗ (not Spain-first) | Best expansion / reference |
| 4 | Norway | ★★★★ | ★★★ | ★★★ (churn: DiBK 2025-12-31) | ✗ | Later |
| 5 | Sweden | ★★★ | ★★ (detaljplan incomplete) | ★★ | ✗ | Later |

---

## §6 — Architecture: two separable systems (multi-layer)

**Up front: this is multi-layer.** (1) a **client map interaction** on `SiteBoundaryMap2D`; (2) a **SERVER proxy**
for CORS / rate-limit / cache / GML→GeoJSON normalization of Catastro/MUC/ÖREB (mirrors `overpassProxy.js`); (3) a
**pure schema + deterministic rules** layer. The two *domain* systems are separable and independently testable:

### §6.1 — System A — Parcel Data Layer (provider-agnostic ingestion)

Mirrors the L-374 Context-Engine provider pattern + the Overpass proxy/cache.

```
ParcelProvider (interface, L2)
  ├─ reverseGeocode(lat, lon)            → { parcelRef, address, jurisdictionId }
  ├─ fetchParcelByRef(parcelRef)         → ParcelFeature (polygon WGS84 + attrs + provenance)
  └─ fetchParcelAtPoint(lat, lon)        → ParcelFeature | null   (bbox + point-in-polygon)

Adapters (L2, one per source):
  ├─ CatastroParcelProvider   (Spain: OVC Consulta_RCCOOR + INSPIRE cp:CadastralParcel WFS)
  ├─ OerebParcelProvider      (CH: api3.geo.admin identify → EGRID + geodienste ms:RESF WFS)
  └─ TerraraParcelProvider    (premium, optional — DXF/DWG/IFC + attrs)

All fetches go through the SERVER PROXY (System C) — never browser→gov endpoint directly (CORS + rate-limit + cache).
Output: a WGS84 ring → reuses buildBoundaryFromLatLonRing → dispatchParcelBoundary → site.parcel-boundary-set.
```

`ParcelFeature.provenance` populates C19 §2.6 `ProvenanceRecord` (`source: 'catastro' | 'oereb' | 'terrara'`,
`sourceVersion`, `ingestTimestamp`, `license`) — extend the C19 `ProvenanceRecord.source` enum.

### §6.2 — System B — Zoning Rules Engine (deterministic envelope)

```
ZoningProvider (interface, L2)
  └─ fetchZoning(parcelRef | polygon, jurisdictionId) → ZoningRecord (zone class + any structured numeric fields)

Adapters:
  ├─ MucZoningProvider     (Catalonia MUC WFS → zone class + qualification)
  ├─ MadridPgouProvider    (geoportal WMS/VEDA → edificabilidad/height where structured)
  ├─ OerebZoningProvider   (CH ÖREB XML extract → zone type + LegalProvision reference)
  └─ TerraraZoningProvider (premium → normalized numeric rules)

ZoningRulesEngine (PURE, L2 — deterministic, unit-testable):
  input:  ZoningRecord + JurisdictionZoningContract (curated ruleset) + Parcel polygon + edge classifications
  output: BuildableEnvelope {
            setbacks{front,side,rear}, maxHeight, maxFAR, maxCoverage, permittedUse[],
            insetPolygon (parcel ⊖ setbacks),  maxVolume (insetPolygon × maxHeight),
            confidence: 'authoritative' | 'structured' | 'estimated-ruleset',
            provenance, caveats[]
          }
  → dispatches site.updateZoning (C19 §4.1) to populate the MUTABLE parcel fields.
```

### §6.3 — Two input fidelities (the honest core)

Because numeric rules are PDF-trapped everywhere but Denmark, the engine resolves the envelope in priority order:

1. **`structured`** — the provider returns numeric fields (Denmark bebyggelsesprocent; Madrid VEDA edificabilidad;
   Terrara) → use directly, confidence `structured`.
2. **`estimated-ruleset`** — provider returns only a **zone class** → look up a **per-jurisdiction curated
   `JurisdictionZoningContract`** (zone code → numeric envelope), authored/maintained by PRYZM, mirroring the existing
   `rules/programRules.ts` normative-DB pattern. Confidence `estimated-ruleset` — MUST be badged "verify against
   ordinance" (L-373).
3. **`none`** — no data → graceful fallback to manual draw (§8.5), envelope hidden.

**L-373 discipline is mandatory**: an `estimated-ruleset` envelope is NEVER shown in an authoritative style; the
info-card and 3D volume carry a provenance chip + confidence label, and a CI fidelity-label gate (mirroring
`check-windcfd-beta-label.ts`) enforces it.

### §6.4 — System C — Server proxy + cache (mirrors `server/overpassProxy.js`)

- New same-origin routes: `POST /api/parcel/reverse`, `GET /api/parcel/:ref`, `GET /api/zoning/:jurisdiction/:ref`.
- Server forwards ONCE to Catastro/MUC/ÖREB, **normalizes GML → GeoJSON** server-side, caches by request hash
  (TTL: parcels ~7 d, zoning ~24 h), bounded LRU, **non-fatal empty fallback** (`{}`/`null` → client falls to draw).
- CSP: same-origin `connect-src 'self'` already covers it (per `overpassProxy.js` note); the gov origins are added to
  `server/securityHeaders.js` only if a direct-fetch fallback is kept. **Flag, don't silently change CSP.**
- P8: each new exported server/handler + each provider fn opens an OTel span (`pryzm.parcel.*`, `pryzm.zoning.*`).

### §6.5 — Layer placement (8-layer model)

| Component | Package (proposed) | Layer |
|---|---|---|
| `ParcelFeature` / `ZoningRecord` / `BuildableEnvelope` / `JurisdictionZoningContract` schemas (pure Zod) | `packages/schemas/src/elements/site/zoning/` | **L0** |
| `ParcelProvider` / `ZoningProvider` interfaces + adapters + `ZoningRulesEngine` (pure) | `packages/site-parcel-data/` (new, L2) | **L2** |
| `site.updateZoning` consumption / envelope→generator constraint | existing `packages/site-runtime` + `stores` | **L2–L3** |
| Server proxy | `server/parcelZoningProxy.js` (new) | server (BFF) |
| Map "Select parcel" mode + info card + envelope render | `apps/editor/src/ui/geospatial/` + `.../site/` | **L5** |

No P2 (THREE-owner) impact — the 3D envelope volume renders via existing renderer paths, not a new THREE import site.

---

## §7 — The per-jurisdiction "zoning contract" schema

Pure Zod (L0), consumed by the ZoningRulesEngine. This is the curated ruleset that fills the PDF gap.

```ts
// packages/schemas/src/elements/site/zoning/JurisdictionZoningContract.ts  (PROPOSED)
JurisdictionZoningContract = {
  jurisdictionId: string;            // e.g. "es-barcelona", "es-madrid", "ch-zh-8001"
  displayName: string;
  source: 'catastro-muc' | 'madrid-pgou' | 'oereb' | 'plandata-dk' | 'terrara' | 'manual';
  crs: string;                       // EPSG of the source geometry
  lastReviewed: ISODate;             // curation freshness (L-373 provenance)
  zones: Array<{
    code: string;                    // jurisdiction zone code (e.g. MUC "clau", Madrid "norma zonal", ÖREB zone type)
    label: string;
    permittedUse: Array<'residential'|'commercial'|'industrial'|'mixed'|'civic'|'green'|'other'>;
    maxHeight_m: number | null;      // absolute height cap (m)
    maxFloors: number | null;
    plotRatioFAR: number | null;     // edificabilitat m²/m² / Ausnützungsziffer / bebyggelsesprocent(→ratio)
    maxCoverage: number | null;      // ocupación (0..1)
    setbacks: { front_m: number|null; side_m: number|null; rear_m: number|null };
    fieldProvenance: Record<string,'published-structured'|'ordinance-pdf'|'estimated'>;  // per-field L-373
    ordinanceRef: string | null;     // URL/citation of the governing legal doc
  }>;
  defaultConfidence: 'structured' | 'estimated-ruleset';
}
```

The engine result maps 1:1 onto C19 `Parcel.{setbacks,maxFAR,maxHeight,zoning.category,zoning.overlays}` via
`site.updateZoning` — **no change to C19's output schema is required** (only the C19 `ProvenanceRecord.source` enum
gains `'catastro' | 'oereb' | 'terrara' | 'plandata'`).

---

## §8 — UI / UX flow + ASCII state mockups

Ground: the existing onboarding spine (location → draw → generate) and `SiteBoundaryMap2D` mode strip. Add a **mode
toggle** at the top of the map: **`◉ Select parcel   ○ Draw boundary`**. **Default = Select parcel** *when the current
jurisdiction has a ParcelProvider* (Spain/CH in pilot); **default = Draw** otherwise. Selecting a parcel and drawing are
mutually exclusive; either terminates in the same `site.parcel-boundary-set`.

### §8.1 — Idle (Select-parcel mode armed)
```
┌───────────────────────────────────────────────────────────────┐
│  [◉ Select parcel] [○ Draw boundary]        [Map|Satellite] [✕]│
│                                                                │
│      · · · · ·  (cadastral parcels faint on hover-eligible)    │
│         ▢     ▢      ▢         Hover a plot to preview          │
│      ▢     ▢     ▢       ▢                                      │
│                                                                │
│   ⌖ move the cursor over a building/plot · Esc to draw instead │
└───────────────────────────────────────────────────────────────┘
```

### §8.2 — Hover (live preview of the parcel under the cursor)
```
┌───────────────────────────────────────────────────────────────┐
│  [◉ Select parcel] [○ Draw boundary]        [Map|Satellite] [✕]│
│                                                                │
│            ╔══════════╗   ← parcel outline, violet #6600FF     │
│            ║▓▓▓▓▓▓▓▓▓▓║      8% violet fill, dashed edge        │
│            ║▓▓ 512 m² ▓║      live area chip                    │
│            ╚══════════╝                                         │
│                                                                │
│   click to select this parcel · Esc to draw instead           │
└───────────────────────────────────────────────────────────────┘
```

### §8.3 — Selected + info card
```
┌───────────────────────────────────────────────────────────────┐
│  [◉ Select parcel] [○ Draw boundary]        [Map|Satellite] [✕]│
│            ╔══════════╗          ┌───────────────────────────┐ │
│            ║██████████║          │ PARCEL                     │ │
│            ║██ SELECTED║         │ Ref  0123456 VK4802S       │ │
│            ║██████████║          │ Addr Carrer d'Exemple 12   │ │
│            ╚══════════╝          │ Area 512 m²                │ │
│                                  │ Zone 22a (MUC) · residential│ │
│                                  │ ── zoning: structured ✓ ── │ │
│                                  │ [ Use this parcel  → ]     │ │
│                                  │ [ Draw instead ]           │ │
│                                  └───────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

### §8.4 — Envelope shown (plan inset + 3D max-height volume)
```
PLAN                                   3D (on confirm → Cesium/renderer)
┌────────────────────────┐            ┌────────────────────────┐
│   ╔══════════════════╗ │            │        ╱▔▔▔▔▔▔╲        │
│   ║ parcel  #6600FF  ║ │            │       ╱ max    ╱│      │
│   ║  ┌────────────┐  ║ │            │      ╱ height  ╱ │  ← translucent
│   ║  │ buildable  │  ║ │            │     ▕ volume  ▕  │     violet extrusion
│   ║  │ envelope   │  ║ │            │     ▕ 512 m² × ▕ ╱      to maxHeight
│   ║  │ (setbacks) │  ║ │            │     ▕ 18.0 m   ▕╱       │
│   ║  └────────────┘  ║ │            │      ▔▔▔▔▔▔▔▔▔▔         │
│   ╚══════════════════╝ │            └────────────────────────┘
│  front 5 · side 3 · rear 5m         FAR 2.4 · H≤18m · use: residential
│  ⓘ estimated from zone ruleset — verify against POUM ordinance
└────────────────────────┘            [ Generate building here → ]
```

### §8.5 — Zoning unavailable (graceful fallback)
```
┌───────────────────────────────────────────────────────────────┐
│            ╔══════════╗          ┌───────────────────────────┐ │
│            ║██ parcel ║          │ PARCEL  512 m²             │ │
│            ║██████████║          │ ⚠ Zoning unavailable here  │ │
│            ╚══════════╝          │   No published envelope    │ │
│                                  │   for this jurisdiction.   │ │
│                                  │ [ Use parcel (no envelope) ]│ │
│                                  │ [ Enter setbacks manually ]│ │
│                                  │ [ Draw boundary instead ]  │ │
│                                  └───────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

### §8.6 — Provenance / confidence discipline (L-373)
- Every envelope shows a confidence chip: **`authoritative` / `structured` / `estimated (verify)`**.
- `estimated-ruleset` renders with a distinct dashed style + "verify against ordinance" tooltip and the `ordinanceRef`
  link. Never a solid, certificate-looking presentation. CI gate enforces the label is present.

### §8.7 — Hand-off to BIM authoring
Confirm ("Use this parcel") → `dispatchSiteLocation` (from reverse-geocode) → `dispatchParcelBoundary`
(`site.parcel-boundary-set`) → `site.updateZoning` (envelope numeric fields) → the generator
(`generateResidentialFromBoundary` et al.) reads `getParcelBoundary()` **and** the new envelope constraint (setback
inset + maxHeight) as generation bounds. One P6 command path; one undo unit per commit.

---

## §9 — Governance impact (recommend; author NONE here)

### §9.1 — VISION update (STR-02 / STR-12)
STR-12 §2.1 already declares cadastral plot boundary + regulatory context as first-class substrate, but frames it
aspirationally. Recommend a **vision amendment** elevating **site-feasibility / zoning-intelligence** from "backdrop
data" to a **named product wedge**: PRYZM as a *site-feasibility platform*, not only a BIM editor — "select a plot,
see what you can build, then build it." Author in `STR-02-product-vision.md` (§ roadmap) + `STR-12` §2.1. **Conflict to
flag (human decision):** does zoning-intelligence become a headline pillar for V1+ positioning, or a Phase-B feature?
Report, do not resolve.

### §9.2 — Strategy ADR (new)
`ADR-02XX — Parcel-data + per-jurisdiction zoning strategy + buy-vs-build (Terrara).` Records: provider-agnostic
Parcel/Zoning layers; the two-fidelity engine; Spain-first pilot; the **buy-vs-build decision on Terrara** (present
options — build raw ÖREB normalizer vs license Terrara — recommend *build Spain, evaluate Terrara for CH fast-follow*;
do not silently commit). Next free ADR number (≈ ADR-0269+; confirm against `docs/02-decisions/adrs/README.md`).

### §9.3 — New contracts
- **`C57 — Parcel Data Layer`** (provider-agnostic parcel ingestion; proxy/cache; provenance; CRS handling; ties C12/C19).
- **`C58 — Zoning Rules Engine`** (the `JurisdictionZoningContract` schema §7; deterministic envelope; two-fidelity
  resolution; L-373 credibility gate; ties C19 §1.4/§1.6 + `site.updateZoning`).
  Numbers are the next free slots after C56 — **confirm against the C00 index** (`docs/02-decisions/contracts/README.md`).
  **Conflict to flag:** C19 §9 currently *defers* "jurisdiction-specific building-code databases" and §10.2 leaves the
  jurisdiction-registry shape *pending* — C58 fills exactly that reserved slot; C19 §10.2 should reference C58 on ratify.

### §9.4 — New spec
`SPEC-PARCEL-SELECTION` (`docs/03-execution/specs/`) — the map interaction: select-vs-draw mode, hover-preview, info
card, envelope render (plan + 3D), fallback states, provenance chips, and the commit→generate hand-off (§8).

---

## §10 — Phased implementation plan

Each sub-phase: **scope · effort · deps · verify-gate · contracts-authored.**

### PHASE 0 — Foundations & endpoint hardening  *(2–3 dev-days)*
- **P0.1 Verify field-level schema + pin endpoints.** Endpoints are pinned (Catastro WFS/OVC/WMS, Catalonia PLANEJAMENT
  WFS, Madrid sigma ArcGIS REST, geodienste, api3.geo.admin — all live-verified §3–§4). Remaining: run `DescribeFeatureType`
  on `PLANEJAMENT:MUC_QUALIFICACIONS` + the Madrid PGOUM layers to enumerate which numeric envelope fields (height/FAR/
  setback/coverage) are published vs PDF-trapped (drives the §7 curated-ruleset scope). *Verify:* a scripted call returns a
  real Barcelona parcel polygon (Catastro GetParcel) + its MUC qualification polygon (GeoJSON).
- **P0.2 Author governance stubs** (VISION amend draft, strategy ADR, C57/C58 skeletons, SPEC-PARCEL-SELECTION). *Verify:*
  C00 index numbering reserved; no conflicts unresolved-in-silence.
- *deps:* none. *contracts:* C57/C58 skeleton, SPEC, ADR.

### PHASE 1 — Parcel Data Layer (Spain) + server proxy  *(1.5–2 wk)*
- **P1.1 Schemas (L0).** `ParcelFeature`, `ProvenanceRecord.source` enum extend. *Verify:* Zod round-trip tests; P5 purity gate.
- **P1.2 Server proxy (BFF).** `server/parcelZoningProxy.js` — `/api/parcel/reverse` + `/api/parcel/:ref`; forward once,
  GML→GeoJSON normalize, hash cache, non-fatal empty fallback (clone `overpassProxy.js`). *Verify:* proxy returns
  Barcelona parcel GeoJSON; 429/timeout → `{}`; cache hit on repeat. CSP note surfaced (not silently changed).
- **P1.3 `CatastroParcelProvider` (L2).** `Consulta_RCCOOR_Distancia` (point→REFCAT) → WFS `GetParcel` stored query by
  REFCAT (no BBOX available); WMS `GetFeatureInfo` for the hover-preview fast path. *Verify:* unit tests on fixture GML;
  OTel spans present (P8).
- *deps:* P0. *contracts:* C57.

### PHASE 2 — Select-parcel UI + commit seam  *(1–1.5 wk)*
- **P2.1 "Select parcel" map mode** on `SiteBoundaryMap2D` — hover-preview (violet `#6600FF`), area chip, click-select.
  *Verify:* Playwright — hover highlights, click selects, Esc → draw mode.
- **P2.2 Parcel info card** (ref/address/area/zone) + "Use this parcel" / "Draw instead". *Verify:* card renders from provider.
- **P2.3 Commit seam** → `dispatchSiteLocation` + `dispatchParcelBoundary` (reuse `buildBoundaryFromLatLonRing`). *Verify:*
  selecting a parcel emits one `site.parcel-boundary-set`; boundary is C19 §1.4 immutable; area matches Catastro.
- *deps:* P1. *contracts:* SPEC-PARCEL-SELECTION.

### PHASE 3 — Zoning Rules Engine (Barcelona)  *(1.5–2 wk)*
- **P3.1 Schemas (L0):** `ZoningRecord`, `BuildableEnvelope`, `JurisdictionZoningContract` (§7). *Verify:* Zod + purity gate.
- **P3.2 `MucZoningProvider`** + curated **`es-barcelona` JurisdictionZoningContract** (zone codes → envelope, per-field
  provenance). *Verify:* fixture zone → expected envelope; `lastReviewed` present.
- **P3.3 `ZoningRulesEngine` (pure):** parcel ⊖ setbacks inset polygon; maxHeight/FAR/coverage; confidence resolution;
  → `site.updateZoning`. *Verify:* deterministic unit tests incl. inset correctness on L-shaped parcel; confidence label present.
- *deps:* P2. *contracts:* C58 (+ its L-373 credibility gate `check-zoning-fidelity-label.ts`).

### PHASE 4 — Envelope render + generate hand-off  *(1–1.5 wk)*
- **P4.1 Plan render:** setback-inset envelope polygon (violet) + dimension chips (reuse the map dim-chip pattern). *Verify:* inset matches engine.
- **P4.2 3D volume:** translucent max-height extrusion via existing renderer path (NO new THREE site — P2 safe). *Verify:* volume = area×maxHeight; P2 gate green.
- **P4.3 Generator constraint:** envelope (inset + maxHeight) threaded into `generateResidentialFromBoundary` (+ apartment/house). *Verify:* generated footprint ⊂ inset; height ≤ maxHeight; §1.6 lint passes.
- **P4.4 Fallback + provenance UI** (§8.5/§8.6): zoning-missing → manual/draw; confidence chips + `ordinanceRef`. *Verify:* CI fidelity-label gate; missing-data path never blocks.
- *deps:* P3. *contracts:* C58, SPEC.

### PHASE 5 — Scale (municipality #2 + country #2)  *(2–3 wk each, post-pilot)*
- **P5.1 Madrid** `MadridPgouProvider` + `es-madrid` contract (VEDA edificabilidad structured where available).
- **P5.2 Switzerland** `OerebParcelProvider` (EGRID) + `OerebZoningProvider` + `Terrara*` premium adapters (pending §9.2 buy decision).
- **P5.3 Denmark** `PlandataProvider` (best structured zoning — reference expansion).
- *Verify:* each new jurisdiction is a pure adapter + curated contract; no core change. *contracts:* C57/C58 adapters only.

---

## §11 — Effort: one working pilot vs scale

- **ONE working pilot** (Barcelona: click-parcel → highlighted geometry → info card → envelope in plan, committed to
  `site.parcel-boundary-set` + `site.updateZoning`): **Phases 0–4 ≈ 5–7 dev-weeks** (1 eng), incl. server proxy, the
  provider abstractions, the pure engine, the UI mode, and the credibility gate. Add ~1 wk for the 3D volume + generate
  hand-off polish (P4.2–P4.3).
- **Scale**: each additional municipality with existing structured zoning ≈ **2–3 wk** (a `ZoningProvider` adapter + a
  curated `JurisdictionZoningContract`). A new *country* parcel source ≈ **1–1.5 wk** (a `ParcelProvider` adapter +
  proxy route). Terrara (if bought) collapses the CH zoning curation to an integration task.
- **The curation cost is the real long-tail**, not the code: maintaining `JurisdictionZoningContract` rulesets where
  numbers are PDF-trapped. Budget ongoing curation (or Terrara-style buy) per §9.2.

---

## §12 — Zero-dependency-on-September-launch confirmation

This feature is **strictly additive** and shares **no** code path with the September P0/P1 launch work:
- **Data-loss L-334/L-360** (persistence/sync) — untouched; parcel commit uses the *existing* `site.setParcelBoundary`
  path already in production, adds no new persistence surface beyond the C19 fields that already persist.
- **Collab L-335** — no CRDT change; Site is singular (C19 §4.3, no batch).
- **WebGPU device-loss L-361/L-372** — the 3D envelope volume is one translucent extrusion via existing renderer paths;
  no new THREE site (P2 safe), no new shader, gated behind the feature and defer-able.
- **Generation-perf L-377** — the envelope only *constrains* the existing generators (a polygon inset + a height cap);
  it adds no new heavy pass. It can ship dark (behind a flag) and be enabled post-launch.
New surfaces (server proxy route, `packages/site-parcel-data`, a map mode) are net-new and isolated; nothing the
launch touches imports them. **Strategic priority is HIGH (business direction); launch-severity is P2/P3 (post-launch).**

---

## §13 — L-380 audit rows (ready-to-paste; NOT written to any tracker here)

Format: `| ID | Reported | **[Pn - AREA] bold** | Area/contracts | Status | route -> queue |`

```
| L-380 | founder 2026-07-17 (business-direction: parcel-select → buildable-envelope, Spain-first) | **[P2 - STRATEGY / GIS] Select a REAL cadastral parcel on the 2D GIS map → fetch real geometry (brand-highlight #6600FF) → compute + show the buildable envelope (setbacks/height/FAR/use) from municipal zoning, feeding the existing boundary→generate flow.** Today the user only DRAWS (SiteBoundaryMap2D.ts); this adds parcel-SELECT as the input. HIGH strategic priority (business model direction); P2/P3 for the Sept launch (post-launch, additive, zero launch dependency — see scoping §12). Two separable systems: a provider-agnostic Parcel Data Layer + a deterministic Zoning Rules Engine; envelope feeds the existing site.parcel-boundary-set + site.updateZoning path (P6 bus). Full scoping: docs/04-reference/PARCEL-ZONING-FEATURE-SCOPING.md. | Geospatial / site-feasibility. Reuses SiteBoundaryMap2D.ts, dispatchParcelBoundary (siteDispatch.ts:454), buildBoundaryFromLatLonRing (boundaryProjection.ts:143), generateResidentialFromBoundary (residentialFromBoundary.ts:173), server/overpassProxy.js (proxy template); mirrors L-374 provider pattern + L-373 credibility. C19 Parcel already carries setbacks/maxFAR/maxHeight/zoning + site.updateZoning. COVERAGE GAP: no contract governs parcel-data ingestion or a zoning-rules engine (C19 §9/§10.2 explicitly defer the jurisdiction code registry). CONFLICT (human decision): zoning-intelligence as a headline V1 pillar vs Phase-B feature; Terrara buy-vs-build. | **OPEN — SCOPED, not started.** owner UNASSIGNED, target TBD. Sub-items L-380a..e. | route -> geospatial / site-feasibility queue. |
| L-380a | L-380 scoping (Parcel Data Layer) | **[P2 - GIS] Provider-agnostic Parcel Data Layer — ParcelProvider interface + CatastroParcelProvider (OVC Consulta_RCCOOR reverse-geocode + INSPIRE cp:CadastralParcel WFS, live-verified) + OerebParcelProvider (CH EGRID) + optional Terrara premium; WGS84 ring → buildBoundaryFromLatLonRing → site.parcel-boundary-set.** | Geospatial (new C57-PARCEL-DATA-LAYER — GAP; ties C12 CRS, C19 §1.3/§1.4). dep: L-380d. | **OPEN.** owner UNASSIGNED, target TBD. | route -> geospatial queue. |
| L-380b | L-380 scoping (Zoning Rules Engine) | **[P2 - GIS] Deterministic Zoning Rules Engine — per-jurisdiction JurisdictionZoningContract (zone code → setbacks/maxHeight/FAR/coverage/use) + ZoningProvider adapters (MUC / Madrid PGOU / ÖREB / Terrara) → BuildableEnvelope (parcel ⊖ setbacks inset + maxHeight volume) → site.updateZoning.** Two fidelities: structured fields where published, curated ruleset (mirror rules/programRules.ts) where PDF-trapped; L-373 confidence labels mandatory. | Geospatial (new C58-ZONING-RULES-ENGINE — GAP; fills C19 §9/§10.2 deferred registry; ties C19 §1.4/§1.6). dep: L-380a. | **OPEN.** owner UNASSIGNED, target TBD. | route -> geospatial queue. |
| L-380c | L-380 scoping (Select-parcel UI/UX) | **[P2 - GIS / UX] Parcel-select map mode on SiteBoundaryMap2D — select-vs-draw toggle (default select where a provider exists), hover-preview + area chip (#6600FF), info card (ref/address/area/zone), "Use this parcel", envelope render in PLAN (inset) + 3D (max-height volume), graceful "zoning unavailable → draw manually" fallback, provenance/confidence chips (L-373).** | UX / Geospatial (new SPEC-PARCEL-SELECTION — GAP; C18/C19 §5.5 brand #6600FF). dep: L-380a/b. | **OPEN.** owner UNASSIGNED, target TBD. | route -> geospatial / UX queue. |
| L-380d | L-380 scoping (server proxy/cache) | **[P2 - GIS / SERVER] Same-origin parcel/zoning proxy + shared cache — server/parcelZoningProxy.js (/api/parcel/reverse, /api/parcel/:ref, /api/zoning/:jurisdiction/:ref): forward-once to Catastro/MUC/ÖREB, GML→GeoJSON normalize, hash LRU cache (parcels ~7d, zoning ~24h), non-fatal empty fallback; clone server/overpassProxy.js; CSP connect-src note surfaced not silently changed.** | Server / BFF (ties ADR-0088 proxy pattern; C12). dep: none. | **OPEN.** owner UNASSIGNED, target TBD. | route -> server / geospatial queue. |
| L-380e | L-380 scoping (governance) | **[P2 - GOVERNANCE] Author governance: VISION update (PRYZM as site-feasibility/zoning-intelligence platform — STR-02/STR-12 §2.1), strategy ADR (parcel-data + per-jurisdiction zoning + Terrara buy-vs-build), new contracts C57-PARCEL-DATA-LAYER + C58-ZONING-RULES-ENGINE (w/ JurisdictionZoningContract schema), new SPEC-PARCEL-SELECTION.** | Governance (C00 index; C19 §9/§10.2 reference C58 on ratify). dep: none. | **OPEN — recommend, unauthored.** owner UNASSIGNED, target TBD. Human decisions: zoning as V1 pillar?; Terrara buy-vs-build. | route -> governance / architecture queue. |
```

**Master-execution-tracker row (ready-to-paste):**
```
| **L-380** Parcel-select → buildable-envelope (Spain-first: Catastro + MUC) (P2, HIGH strategic) | UNASSIGNED | post-Sept | Select a real cadastral parcel on the 2D map → real geometry + brand highlight → zoning-derived buildable envelope → existing boundary→generate flow. Two systems: Parcel Data Layer + Zoning Rules Engine. Additive, zero Sept-launch dependency. Scoping: docs/04-reference/PARCEL-ZONING-FEATURE-SCOPING.md | Geospatial/site-feasibility. New C57/C58 + SPEC-PARCEL-SELECTION + strategy ADR + VISION update. Reuses SiteBoundaryMap2D/siteDispatch/overpassProxy; mirrors L-374/L-373. |
```

---

## §14 — Risks & human decisions (report, don't resolve)

1. **Numeric rules are PDF-trapped** (all pilots except Denmark) → ongoing curation cost or a Terrara-style buy. **Decision:** build Spain rulesets vs license a normalizer.
2. **Terrara**: closed/undocumented API + pricing (UNVERIFIED) → validate with a parcel sample before coupling. Commercial decision.
3. **Field-level numeric completeness** — MUC/PLANEJAMENT WFS is verified live (GeoJSON + spatial query), but whether it
   carries numeric height/FAR/setback per polygon is MEDIUM-confidence → confirm via `DescribeFeatureType` in P0.1; the
   gap is filled by the §7 curated ruleset (expected long-tail cost, not a blocker).
4. **Catastro WFS has no BBOX** (verified) + WMS "no massive/tiled downloads" clause → point→RC→GetParcel flow + a
   conservative server-side throttle + cache is mandatory (mirror ADR-0088). Gov rate-limits otherwise undocumented.
5. **Licensing** — Catastro/MUC/ÖREB open+reusable (HIGH confidence); confirm attribution/reuse terms per source at integration.
6. **Positioning conflict** — zoning-intelligence as a headline V1 wedge vs Phase-B feature (§9.1). Founder decision.
7. **Confidence discipline** — an `estimated-ruleset` envelope must NEVER read as authoritative (L-373); CI gate enforces.

---

## §15 — Live sources (verified 2026-07-17)

- Catastro INSPIRE CP WFS — **live** (no BBOX; stored query `GetParcel` by REFCAT): `https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?service=WFS&request=GetCapabilities`
- Catastro OVC reverse-geocode — **live** (prefer `_Distancia`): `http://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_RCCOOR`
- Catastro Cartografía WMS (GetFeatureInfo point query) — **live**: `http://ovc.catastro.meh.es/cartografia/INSPIRE/spadgcwms.aspx?service=WMS&request=GetCapabilities`
- Catalonia PLANEJAMENT/MUC WFS — **live** (GeoJSON + spatial query; `MUC_QUALIFICACIONS`): `https://sig.gencat.cat/ows/PLANEJAMENT/wfs?service=wfs&version=2.0.0&request=GetCapabilities`
- Madrid PGOUM-97 ArcGIS REST — **live** (`f=geojson` query): `https://sigma.madrid.es/hosted/rest/services/PGOUM97/PG_ORDENACION/MapServer`
- Switzerland parcels (geodienste WFS, `ms:RESF`) — **live**: `https://geodienste.ch/db/av_0/deu?SERVICE=WFS&REQUEST=GetCapabilities`
- Switzerland click→EGRID (identify) — **live**: `https://api3.geo.admin.ch/rest/services/api/MapServer/identify`
- Switzerland ÖREB web service: `https://www.cadastre.ch/de/oereb-webservice`; Bauzonen harmonisiert: `https://opendata.swiss/en/dataset/bauzonen-schweiz-harmonisiert`
- Terrara: `https://www.terrara.ch/index-en.html` (API/pricing UNVERIFIED — direct-sales)
- Denmark Matriklen2 (Datafordeler, free key) + Plandata.dk zoning: `https://datafordeler.dk` / `http://wfs.plansystem.dk/geoserver/wfs?service=WFS&request=GetCapabilities`
- Norway zoning (DiBK national copy, keyless GeoJSON) — **verified**: `https://nap.ft.dibk.no/services/rest/reguleringsplaner/vn1`; parcels: `https://ws.geonorge.no/eiendom/v1/` (plan-register distribution → DiBK from 2025-12-31)
```
```
