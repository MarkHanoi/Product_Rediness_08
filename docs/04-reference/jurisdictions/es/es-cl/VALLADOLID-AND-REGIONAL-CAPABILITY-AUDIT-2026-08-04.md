# Valladolid + Castilla y León — Capability Audit

> **Date:** 2026-08-04. **Scope:** Valladolid capital (INE 47186) + regional picture, 9 provincial capitals,
> 2,248 municipalities. **Method:** live endpoint verification (WebFetch/WebSearch, this session) layered on
> top of PRYZM's existing Phase-1 scaffold and prior regional research (cited below — this is **not** a true
> cold start; see §0). No code was written or recommended. No GIS dataset is asserted without a source.

---

## 0 · This is not a cold start — what PRYZM already knows

A repo search before any live research found:

1. **A C63 Phase-1 scaffold exists for all 9 provincial capitals** (`docs/04-reference/jurisdictions/es/es-cl/{05019-avila,09059-burgos,24089-leon,34120-palencia,37274-salamanca,40194-segovia,42173-soria,47186-valladolid,49275-zamora}/`), each with `RATE.md`, `ENVELOPE.md`, `HEIGHT.md`, `LEGISLATION-RATE.md`, `NEXT.md`, `RISK-REGISTER.md`. For Valladolid specifically: **overall 61% on the assessed subset only** (DATA-SOURCES 70%, TERRAIN 50%, CONTEXT 56%), with PARCEL, LEGISLATION, ENVELOPE, HEIGHTS honestly `not-assessed`. National Catastro parcel routing and PNOA terrain are wired; **no rule pack, no regional zone-GIS wiring, no legislation sourcing exists anywhere in the region** (`rulepacks/registry.ts` — confirmed no `esCastillaYLeon*` or `es47186*` file).
2. **`ES-ALL-REGIONS-STATUS.md`** already rates Castilla y León at the region level: **"RU ⚠ blocked on law, not data"** — SIUCyL (`idecyl.jcyl.es/geoserver/lu/wms` + `/urbanismo/wms`) is READ (document read, service not query-verified in that pass), with the finding that the region **vectorises PDF plans into georeferenced *recintos* with determinations attached**, but IDECyL's own metadata states **«sin validez jurídica, carácter informativo»** (no legal validity, informative character only).
3. **`ES-REGIONAL-PLANNING-DATA-STANDARDS.md` §6.3** frames this as a live, unresolved question sent to legal counsel (`ES-LEGAL-COUNSEL-QUESTIONS-2026-08-02.md` Q4): does that disclaimer disqualify the vector as a basis for a legally-defensible determination, or is it a routing hint to an instrument that remains authoritative only in written (PDF) form? **This question is not answered anywhere in the repo as of this audit.** It also notes CyL has provincial *normas subsidiarias* (supletory instruments, Q5) that could matter for the ~1,357 municipalities with no municipal plan nationally.

This audit **verifies these prior findings live**, extends them to Valladolid specifically, and adds the axes the prior passes did not cover (parcel geometry, floods, airport, heritage detail, environmental, dispatch feasibility).

---

## 1 · Planning documents

- **Regional framework law**: **Ley 5/1999, de 8 de abril, de Urbanismo de Castilla y León**, developed by **Decreto 22/2004, de 29 de enero (Reglamento de Urbanismo de Castilla y León)**. Both exist as **native, searchable text** — consolidated versions available via BOE (`boe.es/buscar/act.php?id=BOE-A-1999-12599`; consolidated Decreto 22/2004 PDF at `boe.es/buscar/pdf/2004/BOCL-h-2004-90152-consolidado.pdf`) and via `noticias.juridicas.com`. This is genuinely favorable: the governing regional statute is not a scanned document.
- **Valladolid PGOU**: the municipality is mid-**revision** of its PGOU. `valladolid.es` hosts a dedicated PGOU-revision page and, per a municipal news item found via search (`valladolid.es/.../revision-pgou-web-municipal-cuenta-visor-facilitar-consulta`), the drafting team built an **interactive viewer** in collaboration with the "Servicio de Cartografía e Información Urbana" — parcel-level lookup by address or cadastral reference, showing ordering/building/use conditions and cataloguing per plot. **Two direct municipal URLs attempted in this session 404'd** (`valladolid.es/es/ayuntamiento/urbanismo-vivienda/...` and a guessed PGOU path) — the site's URL structure could not be confirmed live in this session; the viewer's existence is **READ** (via search-result summary of a municipal news article), not independently query-verified.
- The municipal cartography portal **`www10.ava.es/cartografia/inicio_gis_valladolid.html`** (Centro de Delineación, Cartografía y Evaluación Urbana) **was reached live** and confirmed to host: multiple "PGOU A.DEFINITIVA" ArcGIS WebAppViewer instances (urban soil, historic centre, rural/urbanizable zones), historical orthophotos 1940–2023, and downloadable **DWG/SHP/PDF**. Endpoints observed: `www10.ava.es/portalva/apps/webappviewer/...` and `gisava.valladolid.es/portal/apps/...` (ArcGIS Experience Builder / WebAppViewer for street directory, noise maps, mobility, tourism, DROUS/environmental).
- **Verdict on Area 1**: the *law* is native text (favorable, rare among CyL peers per prior findings on other regions). The *plan* (PGOU) is in active revision, has a dedicated ArcGIS-based municipal viewer with per-parcel lookup — a materially better starting position than "no digital plan" — but the **legally-current, in-force PGOU document's downloadability/format** was not independently confirmed live (the found viewer serves the **revision draft**, whose legal force during processing is itself a separate question).

## 2 · Zoning geometry

- **`idecyl.jcyl.es/geoserver/lu/wms`** (SIUCyL — Sistema de Información Urbanística de Castilla y León) — **attempted live GetCapabilities in this session, returned HTTP 404.** The exact path used (`.../lu/wms?service=WMS&version=1.3.0&request=GetCapabilities`) could not be confirmed reachable; this does not prove the service is down, only that this session could not verify it with the path used. Prior research (READ-grade, not query-verified) describes SIUCyL as vectorising *recintos* from the PGOU PDFs with alphanumeric determinations attached.
- **Cultural-heritage layer, verified live this session** (see §5) via `idecyl.jcyl.es/geonetwork/...` metadata records: confirms IDECyL's GeoNetwork catalogue **is reachable**, records resolve, and **WFS + WMS + SHP/GPKG downloads exist** for at least the heritage theme, in 4 CRS (EPSG:25830, 25829, 4258, 4326). This is evidence IDECyL as an infrastructure is live even though the specific `lu/wms` zoning endpoint could not be confirmed in this pass.
- **Regional Red Natura 2000 WMS** confirmed via search at `idecyl.jcyl.es/geoserver/ps/wms` (Protected Natural Spaces / ZEC / ZEPA layers) — see §8.
- **Municipal viewer** (§1) is ArcGIS-based (`www10.ava.es`, `gisava.valladolid.es`) but no direct WMS/WFS/REST endpoint URL for the zoning service layers themselves was surfaced by the search/fetch in this session — only the human-facing viewer app URLs.
- **Critical carry-forward finding (not re-litigated, cited from prior work)**: the CyL heritage-layer metadata **independently confirmed in this session** carries the identical disclaimer found on the zoning layer by the prior pass — **"Sin validez jurídica, carácter informativo. Uso libre y gratuito."** This is now corroborated on a second CyL regional layer (heritage, not just zoning), strengthening the prior finding that this is a **region-wide IDECyL house policy**, not an isolated caveat on one dataset.

## 3 · Parcel geometry

- **National Catastro INSPIRE WFS** is the wired provider (`parcelProviders/registry.ts`, `isInSpain` → `catastro`), confirmed in the existing Valladolid scaffold as live/keyless — this is the same national cadastral parcel service used across all Spanish jurisdictions PRYZM has touched (Barcelona, Madrid, Córdoba, etc.), CRS ETRS89/UTM, updated per Catastro's standard cycle, identified by `referencia catastral`. Not CyL-specific; no regional override needed or found.
- **No CyL-specific parcel enrichment** (e.g., a regional cadastral overlay) was found or searched for beyond the national service — none expected, since cadastre is a state (not regional) competence in Spain.
- **Axis 1 (PARCEL) in the existing scorecard remains `not-assessed`**: the routing is wired but no `computeParcelConfidence` sample run has been executed for the 47186 bbox. This audit did not run one (out of scope — "not to build code").

## 4 · Envelope parameters (height, floors, FAR, occupancy, setbacks, buildable depth, alignment)

- **No machine-readable, per-zone envelope parameter set for Valladolid was found or confirmed live.** The `idecyl.jcyl.es/geoserver/lu/wms` endpoint that would carry this (per prior READ-grade research) could not be reached in this session (§2). No alternative endpoint serving `altura`/`edificabilidad`/`ocupación`/`retranqueos` fields for Valladolid or any CyL municipality was found.
- Per the existing `ENVELOPE.md` for Valladolid: **no rule pack exists** (`rulepacks/registry.ts` carries sourced packs only for Barcelona/Madrid/Córdoba); this audit found nothing to change that status.
- **This is the single largest gap area.** Even if the SIUCyL WMS were reachable, the prior regional finding (`ES-ALL-REGIONS-STATUS.md` row for Castilla y León) explicitly flags the parameter-population status as unestablished beyond "the region vectorises determinations" — it does not confirm which fields (height/floors/FAR/etc.) are actually populated per-zone, unlike Madrid or Aragón where a sampled-field measurement was run.

## 5 · Heritage (BIC / historic centres / archaeological zones)

- **Best-evidenced axis in this audit.** Confirmed live (WebFetch on the GeoNetwork record):
  - **WMS**: `pacu_cyl_bic_prot_vw` layer (PACU = Patrimonio Cultural).
  - **WFS**: downloadable in **Shapefile and GeoPackage**.
  - **CRS**: EPSG:25830, 25829, 4258, 4326.
  - **Update frequency**: metadata states "según sea necesario" (as needed) alongside a conflicting "daily" note in the free-text description — an internal inconsistency, not resolved here.
  - **Legal caveat**: same **"sin validez jurídica, carácter informativo"** disclaimer as the zoning layer (§2).
- **Open Data catalogue** (`datosabiertos.jcyl.es`) lists **"Bienes de Interés Cultural (BIC) de Castilla y León: bienes inmuebles"** and a companion **"...: ejes"** (axes) dataset — attempted live fetch **failed on a TLS certificate-verification error** ("unable to verify the first certificate"), so this dataset's exact download formats were **not independently confirmed** in this session, only surfaced via search-result summary and the separate GeoNetwork record above.
- Statutory basis: **Ley 12/2002 de Patrimonio Cultural de Castilla y León**, developed by **Decreto 37/2007** — per search-result summary, not independently fetched as primary text in this session.
- **Region has the highest UNESCO density in Spain** (Ávila walls, Salamanca old city, Segovia old city + aqueduct, Burgos cathedral, Camino de Santiago (Castilla y León section), Las Médulas, Atapuerca archaeological site) — none of these individual UNESCO buffer zones were checked for a dedicated GIS layer beyond the general BIC service; UNESCO buffer zones in Spain are typically a **subset of, or overlapping with, the national BIC "Conjunto Histórico" declaration**, which the CyL BIC WMS should in principle carry, but this was not verified per-site.
- **Net**: heritage geometry **does exist, is vectorised, and is technically downloadable** — the same legal-force question from §2 applies with equal force here, since the disclaimer is now confirmed on both the zoning and heritage layers.

## 6 · Flood (Río Pisuerga / Duero, Valladolid)

- Flood-zone mapping in Spain is a **national, not regional, competence**: the **SNCZI (Sistema Nacional de Cartografía de Zonas Inundables)**, run under MITECO, with basin-level delivery via the **Confederación Hidrográfica del Duero (CHDuero)** — Valladolid sits on the Duero basin (Pisuerga is a Duero tributary through the city). Per search results, SNCZI publishes a **cartographic viewer, WMS service, and SHP/KMZ downloads**, for return periods T=10/50/100/500 years. **CHDuero also runs MAPRI** (Mapas de Peligrosidad y Riesgo de Inundación, 2nd cycle) specific to the Duero basin.
- **Not independently WebFetch-verified live in this session** (only surfaced via WebSearch summaries) — no direct GetCapabilities call was made against a CHDuero or SNCZI WMS endpoint. This is a **carry-over gap**: the endpoint exists per multiple independent sources but was not query-verified here.
- This axis is **structurally identical across all Spanish jurisdictions** PRYZM has assessed (flood is national infra, not municipal/regional) — no CyL-specific blocker expected, consistent with how flood has been treated elsewhere in the repo's Spain work.

## 7 · Airport (Valladolid — Villanubla)

- Valladolid Airport operates from the **Base Aérea de Villanubla** (shared civil/military aerodrome). Its aeronautical servidumbres (obstacle-limitation surfaces) are established by **Real Decreto 1358/2011, de 3 de octubre** (superseding RD 1409/1998), published in the BOE. This is a **national (state), not regional or municipal, instrument** — consistent with how the Barcelona airport servitude was resolved in prior PRYZM work (AESA/ENAIRE KMZ geometry, per the memory record `[Barcelona airport resolved — AESA KMZ has full 3D servitude geometry]`).
- **No AESA/ENAIRE KMZ or GIS layer specific to Villanubla/Valladolid was searched for or found in this session** — only the underlying BOE legal instrument was confirmed. Given the Barcelona precedent (AESA publishes a national KMZ layer with 3D servitude geometry for all Spanish airports), it is **plausible but not verified** that the same national AESA dataset covers Villanubla — this should be treated as **UNKNOWN, not absent**, pending a direct check of the AESA servitude portal for this aerodrome.

## 8 · Environmental (Natura 2000, protected landscapes)

- **Confirmed via search**: IDECyL WMS at **`idecyl.jcyl.es/geoserver/ps/wms`** serves **REN CyL (Red de Espacios Naturales)**, **ZEC CyL**, and **ZEPA CyL** (Red Natura 2000 Special Conservation Zones / Special Protection Areas for Birds) layers, catalogued individually in GeoNetwork (`SPAGOBCYLMNADTSPSZEC`, `SPAGOBCYLMNADTSPSZEP`). Legal basis: **Ley 4/2015 de Patrimonio Natural de Castilla y León**.
- **Coverage is unusually large**: per search-result summary (sourced to what reads as an official/near-official figure), **1,296 of 2,248 CyL municipalities (57.67%) coincide totally or partially with Natura 2000** — this is a materially higher intersection rate than most other Spanish regions PRYZM has assessed, meaning environmental-constraint checks will bind on a majority of the region's municipalities, not an edge case.
- **This specific WMS endpoint (`.../ps/wms`) was not independently WebFetch-verified live in this session** (surfaced only via WebSearch) — same caveat as §2/§6.
- **Picos de Europa**: the national park itself sits mainly in Asturias/Cantabria/Castilla y León's northern fringe (León province) — not relevant to Valladolid capital directly, but relevant to the regional picture (parts of León province). Not separately verified in this session.

## 9 · Legal delegation (PERI / Plan Especial / supletory instruments)

- Prior research (`ES-LEGAL-COUNSEL-QUESTIONS-2026-08-02.md` §5) already flags that **Castilla y León has provincial *normas subsidiarias*** functioning as a supletory instrument, and that CyL's own municipality listing pairs a "Sin Plan" (no municipal plan) status with an explicit **NSAP** (Normas Subsidiarias de Ámbito Provincial) pointer for municipalities lacking their own plan. This matters enormously for CyL's **~2,248 municipalities**, the vast majority tiny and plausibly plan-less.
- **This audit did not independently verify or quantify** how many of CyL's municipalities fall into "Sin Plan + NSAP applies" versus "has own PGOU/NNSS." That count was not attempted here (would require a query against the SIUCyL planning-instrument registry, which could not be reached in §2).
- **Legal delegation estimate — non-computable %**: given (a) Valladolid capital itself is mid-**PGOU revision** (the currently-in-force instrument's exact status during a revision period is itself a live-legal-force question, not resolved here), and (b) the region-wide open question of whether SIUCyL's vectorised, disclaimer-bearing data can be relied upon at all (§0.3), a **conservative estimate is that legal delegation / non-computability affects a majority of CyL municipalities outside the 9 provincial capitals**, and even Valladolid itself carries an open question about which instrument (in-force PGOU vs. revision draft) governs at any given moment. This is an **estimate, not a measurement** — no census of instrument status per municipality was run.

## 10 · Dispatch feasibility — parcel → zone → ordinance → envelope, automatic, Valladolid

**Not achievable today**, for reasons independent of engineering effort:

1. Parcel: ✅ national Catastro WFS wired.
2. Zone: ⚠ SIUCyL WMS endpoint exists per prior research but was **not reachable in this session's live check**; even if reached, the region's own metadata disclaims legal validity.
3. Ordinance/parameter values: ❌ no confirmed per-zone height/FAR/setback dataset for Valladolid was found, live or cited.
4. Envelope rule pack: ❌ none exists (`rulepacks/registry.ts` has no CyL entry).
5. Even a fully-wired pipeline through steps 1–4 would still terminate on the **unresolved legal-force question** (§0, Q4) before an envelope could be called "legally defensible" rather than "indicative."

---

## Evidence Matrix

| # | Area | Grade | Evidence | Live-verified this session? |
|---|---|---|---|---|
| 1 | Regional law (Ley 5/1999 + Decreto 22/2004) | **MEASURED** (native text exists) | BOE consolidated text URLs | Search only (not fetched as primary text) |
| 1 | Valladolid PGOU + revision viewer | READ | Municipal news article (search summary) | Partial — municipal page 404'd; `www10.ava.es` portal fetched live |
| 2 | SIUCyL zoning WMS (`idecyl.jcyl.es/geoserver/lu/wms`) | READ (prior) / **UNVERIFIED** (this session) | Prior repo research; GetCapabilities attempt returned 404 | ❌ failed live |
| 2 | Legal-force disclaimer on regional vector data | **MEASURED** (corroborated 2nd layer) | GeoNetwork record fetched live for heritage layer | ✅ |
| 3 | National Catastro parcel WFS | MEASURED (pre-existing scaffold) | `parcelProviders/registry.ts` | Not re-verified (pre-existing) |
| 4 | Per-zone envelope parameters, Valladolid | **ABSENT / UNKNOWN** | No endpoint found | — |
| 5 | Heritage BIC WMS/WFS | **MEASURED** | GeoNetwork record, live fetch | ✅ |
| 5 | Heritage open-data portal | READ | Search summary | ❌ TLS error on fetch |
| 6 | Flood SNCZI / CHDuero MAPRI | READ | Search summaries (multiple independent sources) | ❌ not fetched |
| 7 | Airport servidumbres (Villanubla, RD 1358/2011) | **MEASURED** (legal instrument confirmed) | BOE listing via search | Search only |
| 7 | Airport GIS geometry (AESA/ENAIRE) | **UNKNOWN** | Not searched | ❌ |
| 8 | Natura 2000 WMS (`.../ps/wms`, ZEC/ZEPA) | READ | Search summary + GeoNetwork record titles | ❌ not fetched |
| 9 | Supletory NSAP delegation scale | READ (prior) | `ES-LEGAL-COUNSEL-QUESTIONS` §5 | Not quantified |
| 10 | End-to-end dispatch | **Impossible today** | Composite of above | — |

---

## Machine-readable assets — every verified/cited endpoint

- `https://idecyl.jcyl.es/geoserver/lu/wms` — SIUCyL zoning WMS (cited by prior research; **404 on GetCapabilities path attempted this session** — not confirmed reachable).
- `https://idecyl.jcyl.es/urbanismo/wms` — companion SIUCyL endpoint (cited by prior research only; not attempted this session).
- `https://idecyl.jcyl.es/geoserver/ps/wms` — Natura 2000 / protected-spaces WMS (cited via search; not fetched this session).
- `https://idecyl.jcyl.es/geonetwork/...` (GeoNetwork catalogue, e.g. record `SPAGOBCYLPCUDTSPSBICP`) — **confirmed live**, serves WMS layer `pacu_cyl_bic_prot_vw` + WFS + SHP/GPKG download, 4 CRS, for BIC protection areas.
- `https://datosabiertos.jcyl.es/web/jcyl/set/es/cultura-ocio/bienes-inmuebles/1284872768044` — BIC bienes inmuebles open-data listing (search-confirmed; fetch failed on TLS cert error).
- `https://www10.ava.es/cartografia/inicio_gis_valladolid.html` — **confirmed live**, Valladolid municipal GIS portal (PGOU viewers, orthophotos, DWG/SHP/PDF downloads); sub-apps at `www10.ava.es/portalva/apps/webappviewer/...` and `gisava.valladolid.es/portal/apps/...`.
- Catastro INSPIRE WFS (national) — pre-existing in PRYZM's parcel-provider registry, not re-verified here.
- SNCZI viewer + WMS + SHP/KMZ download (national, MITECO) and CHDuero MAPRI (basin-level) — cited via search, not fetched.
- BOE consolidated texts for Ley 5/1999 and Decreto 22/2004 — cited via search, not fetched as primary text.
- RD 1358/2011 (Villanubla aeronautical servitudes) — cited via search (BOE listing), not fetched as primary text.

## Missing assets

- A confirmed-reachable SIUCyL zoning WMS response (the specific endpoint 404'd in this session).
- Any per-zone, machine-readable height/FAR/setback/occupancy/buildable-depth dataset for Valladolid.
- The currently-in-force Valladolid PGOU document itself (native text vs scanned — not established; only the revision-draft viewer was found).
- AESA/ENAIRE servitude GIS geometry specifically for Villanubla/Valladolid (only the legal instrument was found, not a geometry layer).
- A quantified count of CyL municipalities with "Sin Plan + NSAP" status vs. own PGOU/NNSS.
- Any resolution of the region-wide legal-force question (§0, Q4) — this remains open in the repo as of this audit.

## Blockers

- **Legal (primary, region-wide)**: IDECyL's own metadata disclaims legal validity on every CyL vector layer checked (zoning per prior research, heritage confirmed live this session). Until legal counsel answers Q4 (`ES-LEGAL-COUNSEL-QUESTIONS-2026-08-02.md`), no CyL vector-derived determination can be represented as legally defensible — it can at best be indicative/routing.
- **GIS-solvability (engineering, secondary)**: the zoning WMS endpoint could not be reached live in this session; whether that's a transient issue, a wrong path, or an access restriction is unresolved. Not GIS-unsolvable on its face (the endpoint has a documented existence per prior research and the sibling heritage/Natura services on the same `idecyl.jcyl.es` host were either reachable or well-documented) — but unverified.
- **OCR/format**: not a blocker for the regional *law* (native text). Unknown/unverified for the *in-force* Valladolid PGOU document itself.
- **Fragmentation (structural, region-wide)**: 2,248 municipalities, most tiny, likely a large share plan-less and dependent on a supletory instrument whose own applicability logic (gap vs. delegation, per Q5) is itself an open legal question.

## Estimated Unlock Effort

**Large.** Breakdown: (a) legal-counsel resolution of Q4/Q5 is a prerequisite, not an engineering task, and is already queued but unanswered; (b) even with a favorable Q4 answer, sourcing and citing per-zone ordinance values for Valladolid (and separately for each of 8 more provincial capitals, before even touching the 2,248-municipality long tail) is the same class of human-gated sourcing cost documented for every other CyL capital's `RATE-IMPLEMENTATION-PLAN.md` (Phase P5/P6, explicitly "LAST because they cannot be automated"); (c) the SIUCyL endpoint itself needs live re-verification before any of that sourcing work can even begin.

## Recommendation

**Research first — specifically, resolve the standing legal-counsel question (Q4) before any CyL-specific engineering or sourcing investment.** This is not a "wait for an external source to appear" case (the source — SIUCyL — already exists); it is a "the source's own legal status is unresolved" case, which is a counsel question, not a data-availability question. Do not build a CyL rule pack until Q4 is answered, because the answer determines whether SIUCyL-derived data is usable at all versus merely a routing hint requiring PDF-instrument citation underneath.

## PRYZM Readiness Score: 14/100

Composed from: national parcel routing present (+), regional law is native text (+), a real municipal GIS portal exists with per-parcel PGOU lookup (+), heritage and Natura 2000 layers are vectorised and technically downloadable (+) — offset by: no reachable/confirmed zoning-parameter endpoint (−−), no rule pack or sourced zones anywhere in the region (−−), the region-wide legal-force disclaimer unresolved (−−−, the dominant factor), the currently-in-force PGOU's own format/status unconfirmed (−), and extreme municipal fragmentation with an unquantified supletory-instrument dependency (−−).

## Compare against other assessed Spanish jurisdictions

| Jurisdiction | Relative position |
|---|---|
| **Barcelona** | Far ahead — mature, signed implementation; AMB Refós is a governing framework (L4) with a legal-force answer already settled favorably in PRYZM's usage. CyL is not close. |
| **Madrid** | Ahead — Madrid SIT reaches a measured L3 (93,839 features, sampled fill-rate 66–73%) via a regional GeoServer WFS that PRYZM could query directly; Madrid shares the same "no binding legal value" disclaimer problem as CyL, so the two are *comparably blocked on Q4*, but Madrid at least has a queryable, measured service — CyL's equivalent endpoint was unreachable in this session. |
| **Córdoba / Andalucía** | Ahead on legal delivery standard (Andalucía has a named, in-force delivery standard — Normas Directoras, Orden 18-02-2026), though the SITUA/VITUA schema is confirmed to lack altura/plantas/profundidad/ocupación/retranqueos. CyL has not even reached schema-confirmation for those fields. |
| **Murcia** | Roughly comparable maturity — Murcia's municipal GeoServer schema shows `Edificabilidad`/`Enlace_ficha` fields present but population/normativity unestablished (READ grade), same as CyL's zoning layer. |
| **Zaragoza / Aragón** | Ahead on measurement rigor — Aragón's NOTEPA-backed WMS was sampled (n=78) and shown to have a near-null-value integrity problem, which is at least a *measured* finding; CyL has no equivalent sample. Aragón also shares CyL's supletory-instrument structure (provincial normas subsidiarias), so the Q5 delegation question applies to both. |
| **Sevilla** | Same regional (Andalucía) position as Córdoba — ahead of CyL on legal delivery standard, behind on populated fields. |
| **Valencia** | Comparable — `terramapas.icv.gva.es` zonificación layer is READ-grade with ordinance codes present but not confirmed populated/normative, similar uncertainty to CyL. |
| **Granada** | Same Andalucía position as Córdoba/Sevilla. |
| **Balears** | Worse in one specific way, comparable overall — Balears' MUIB data explicitly self-flags rows as **not in force** (`OBS` field), an even more direct disqualifier than CyL's general disclaimer; both are queued under the same Q4 counsel question. |

**Overall**: Castilla y León sits in the **lower-middle of PRYZM's assessed Spanish jurisdictions** — better than jurisdictions with no service at all, materially behind Barcelona/Madrid/Andalucía on either measured population-rate or a named legal delivery standard, and sharing its central blocker (legal force of regional vector data) with at least three other regions PRYZM has already touched.

## Final verdict + single biggest blocker

**Verdict**: Castilla y León, including Valladolid capital, is **Research Blocked**, not Engineering Blocked and not Legally Blocked outright — the legal question is open, not decided against PRYZM. Real, vectorised, technically-downloadable regional data exists (confirmed live this session for the heritage layer; documented by prior research for zoning); a native-text regional statute exists; a real municipal GIS portal with per-parcel PGOU lookup exists. None of that converts into a legally-defensible envelope while the region's own metadata disclaims legal validity and that disclaimer's legal meaning is unresolved.

**Single biggest blocker**: the unanswered legal-counsel question — **does IDECyL's "sin validez jurídica, carácter informativo" disclaimer disqualify Castilla y León's vectorised planning/heritage data as a basis for a legally-defensible determination, or does it merely mean the vector is a routing hint to a PDF instrument that remains authoritative in its written form?** This question already sits in `ES-LEGAL-COUNSEL-QUESTIONS-2026-08-02.md` (Q4) unanswered, applies with equal force to at least Madrid and Balears, and this audit's live confirmation that the *same* disclaimer also covers CyL's heritage layer (not just zoning) makes it, if anything, a larger and more central blocker than previously documented — not a smaller one.
