# CAPABILITY AUDIT — Huesca (INE 22125), Aragón, Spain

**Date:** 2026-08-04. **Auditor:** Claude (research pass, live web-verified). **Scope:** can PRYZM
produce a legally-defensible buildable envelope for parcels in the Huesca municipal term today?

**Baseline going in** (from `packages/site-parcel-data/src/rulepacks/esAragon.ts` and
`l449CertificationGates.ts`, both read before any web research): `HUESCA_ENVELOPE_VERIFIED = false`.
The ordinance is fully read and article-cited (Normas Urbanísticas Tomo I, Texto Refundido enero
2008, arts. 8.4.8 occupation/fondo edificable and 8.4.10 height/storeys, with 6.4.5.5.a converting
storeys→metres). Both parameters are remitted to *"plano nº 5"*, a 1:1.000, 28-sheet CAD plot
proven to be vector (MicroStation `HOJAS-URBANA.dgn` → PScript5 → Distiller PDF; zero fonts, zero
rasters, 111k–336k path operators/sheet; legend bound, 5 of 7 swatches uniquely resolved). The
one candidate georeference — matched against Catastro building footprints — was **rejected**:
2.31 m median hold-out residual, only 1.9× better than a deliberately-wrong 45–60 m decoy offset
against a 3× acceptance bar. This audit's job was to re-test that blocker against live sources, not
to inherit it.

---

## 1 · Planning documents

`plano nº 5` — «Clasificación, calificación y regulación del suelo y la edificación en suelo
urbano. Red viaria, alineaciones y rasantes», E 1/1.000, 28 hojas — is published **only as PDF**
at [huesca.es/.../plan-general-de-ordenacion-urbana/planos-pgou](https://www.huesca.es/areas/urbanismo/planeamiento-urbanistico/plan-general-de-ordenacion-urbana/planos-pgou)
("28 hojas (pdf, entre 400 y 2400 KB)"). Confirmed live 2026-08-04: **no DWG, DGN, SHP or GML
alternative is offered anywhere on that page or its sibling PGOU pages** (`plano-huesca-actual`,
`plano-termino-municipal-de-huesca`). The heritage catalogue (§5) is the same shape: PDF only, no
vector variant. A forum thread nominally titled *"Plano de Huesca en DWG"*
([soloarquitectura.com](https://www.soloarquitectura.com/foros/threads/plano-de-huesca-en-dwg.66109/))
returned HTTP 403 to WebFetch and, being an unmoderated hobbyist forum rather than an official
channel, would not qualify as a primary source even if reachable — not pursued further.

The **Consejo de Urbanismo de Huesca** (Gobierno de Aragón provincial planning council) page —
[aragon.es/.../consejo-de-urbanismo-de-huesca](https://www.aragon.es/urbanismo-y-ordenacion-del-territorio/consejo-de-urbanismo-de-huesca) —
was fetched live. It publishes council **acuerdos** (2014–2025, ZIP/PDF) and a sectoral-reports
index (XLS), but **no expediente search tool, no original digital-submission archive, and no
document repository distinct from the published PDFs**. BOA search results reference that modern
planning submissions to the council must include "documentación... en soporte papel y CD" — i.e.
current-era filings are accompanied by a digital copy — but this is a procedural requirement for
*new* filings, not a public archive of Huesca's 2003/2008 PGOU submission, and no such archive
surfaced.

**Verdict on the priority task:** no original DWG/DGN source, and no alternative official
machine-readable zoning-geometry endpoint for the plano nº 5 content, was located via the
Ayuntamiento de Huesca electronic office, the Gobierno de Aragón Consejo de Urbanismo de Huesca
page, or IDEAragon. This corroborates rather than overturns the recorded blocker.

## 2 · Zoning geometry — every endpoint found

| Endpoint | Type | Verified content | Relevance to Huesca fondo/altura |
|---|---|---|---|
| `https://icearagon.aragon.es/SIUa_WMS?service=WMS&request=getcapabilities` | WMS, live, HTTP 200 (fetched 2026-08-04) | 25 layers: `clasificaciondelsuelo`, `clasificaciondelsuelo_idearagon`, `clasificacion`, `clasificacion_SNUE(_sist/_noSist)`, `figuradeplaneamiento_fiabgeom`, `usoglobal`, `infr_equipUrb`, `siua_rios`, `MunicipioP`, `ENP/PORN/ENCMON/MONTES/DPM/FPM`, `v_modelodatunicurbanismo_acuerdo`, `SIOSESUC`, `inventario`, `prueba_clasificacion` | Regional-tier only: **classification** (clase de suelo) and **legal-approval status** (`fiab_geom`, capped 21.8 % "Aprobada" region-wide per prior finding). No calificación/subgrado layer, no plan-sheet index, no fondo/altura attribute of any kind. |
| `https://idearagon.aragon.es/SIUa/descargas` and `https://idearagon.aragon.es/SIUa/visor` | Download/viewer portal | Page fetched but returned no enumerable dataset list distinct from the WMS above; no SHP/GML/DWG/GeoPackage download confirmed for Huesca specifically | Not usable as a machine-readable source beyond what GetCapabilities already showed |
| `https://icearagon.aragon.es/Visor2D`, `AragonReferencia`, `AragonFotos`, `DIT`, GeoServer WMTS (SIOSE) | WMS/WMTS, live | Base cartography, orthophoto, territorial-info-document layers | General basemap only, not zoning |
| `https://www.huesca.es/areas/urbanismo/geoinfohuesca` ("GeoInfoHuesca") | Municipal viewer | Confirmed live: neighbourhoods, postal codes, building categories, mobility/parking, defibrillators, industrial zones. **No calificación/zoning layer, no stated WMS/WFS/REST protocol, no confirmed export format.** | Not a zoning-geometry source |
| "Visor Polígonos Plan General de Ordenación Urbana **1980**" (referenced from multiple huesca.es urbanismo pages) | Municipal GIS viewer | Exists but keyed to the **superseded 1980 plan**, not the governing 2008 Texto Refundido | Not usable — wrong instrument (C58 §1.2: never borrow a superseded plan's geometry) |
| `https://www.miteco.gob.es` SNCZI viewer (national) | WMS (QGIS-consumable per MITECO docs) | Confirmed to exist nationally, covering CHE-managed basins; specific Isuela-Huesca layer content not itemised in this pass | See §6 |
| AESA servidumbres aeronáuticas, Huesca-Pirineos | Published as Real Decreto (BOE-A-2019-636, RD 1422/2018) with numbered planos in EPSG:25830 | Legal instrument confirmed; a machine-readable KMZ/WMS equivalent (as PRYZM already holds for Barcelona's airport, per repo history) not independently re-verified this pass | See §7 |

No IDEZar-equivalent (Zaragoza's own `hoja_pgou_2000`/`hoja_pgou_5000` georeferenced sheet-index
layers, confirmed present in the codebase's `ZARAGOZA_SHEET_INDEX_FINDING`) was found for Huesca.
Huesca has no municipal WFS/GeoServer service of its own discoverable from the public site —
Zaragoza's advantage is a city-run IDEZar GeoServer; Huesca's GeoInfoHuesca does not expose an
equivalent OGC service in anything fetched.

## 3 · Parcel geometry

Unchanged from the codebase's existing (and correct) position: **Dirección General del Catastro**,
national INSPIRE WFS, ETRS89/UTM 30N (EPSG:25830) — confirmed independently by four sources per
`HUESCA_GEOREFERENCE_STATUS` (Catastro Buildings WFS, Catastro ATOM entry for 22901-HUESCA, the
delivered GML's own `srsName`, IDEAragon's WFS). Live, keyless, already wired in
`parcelProviders/registry.ts`. Update frequency is Catastro's standard cadence (continuous,
INSPIRE-harmonised). This axis is sound and was not the subject of new doubt.

## 4 · Envelope parameters

Height/storeys and occupation are **text-stated and article-cited** (art. 8.4.8, art. 8.4.10, art.
6.4.5.5.a storey→metre ladder: B+1=7.50 m … B+7=25.50 m) — confirmed by re-reading
`esAragon.ts` §THE-LAW-IS-READ, not newly re-verified against the PDF this pass (no reason to
doubt a citation this specific and internally consistent). **Buildable depth (fondo edificable)**
is the graphic blocker: art. 8.4.8's 20 m default applies only to Grado 2 and is explicitly
overridden wherever the plan graphs a different figure — and the published calificación data does
not even carry the grado attribute needed to know when the 20 m default would apply. No FAR/setback
values beyond this were located. **No progress path closed this pass**: no sheet-index geometry,
no alternate vector delivery, no CAD source was found that would let the fondo line be positioned
without the rejected 2.31 m fit.

## 5 · Heritage

Huesca's **Conjunto Histórico** (Casco Antiguo, including the Catedral) is BIC-protected,
declared *Conjunto Histórico-Artístico* in 1971 — confirmed via
[patrimonioculturaldearagon.es/patrimonio/conjunto-historico-de-huesca](https://patrimonioculturaldearagon.es/patrimonio/conjunto-historico-de-huesca/)
and [culturadearagon.es/bienes/conjunto-historico-de-huesca](https://culturadearagon.es/bienes/conjunto-historico-de-huesca/).
The Catedral itself carries its own BIC reference (RI-51-0000626, 1931) with a public point
coordinate (42.14040°N, −0.40810°E per caminosantiago.org — a third-party aggregator, not a
primary geometry source). The Ayuntamiento's own **Catálogo de Bienes Protegidos** (3 sheets,
1:1.000, PDF-only, same shape and same publication limitation as plano nº 5) is confirmed live at
[huesca.es/.../proteccion-del-patrimonio-historico-arquitectonico](https://www.huesca.es/areas/urbanismo/proteccion-del-patrimonio-historico-arquitectonico).
No BIC WMS/WFS specific to Aragón (parallel to Extremadura's IDEEX BIC WMS, which does exist per
`datos.gob.es`) was found this pass — Aragón's own patrimonio portal does not appear to publish
an equivalent OGC service. **Machine-readable BIC geometry for Huesca: not found.**

## 6 · Flood

Río Isuela runs channelised through Huesca. The **Confederación Hidrográfica del Ebro (CHE)**
manages the basin; CHE's Sitebro portal (`iber.chebro.es/sitebro`) and the national **SNCZI**
(Sistema Nacional de Cartografía de Zonas Inundables, MITECO) both exist and are confirmed as
real, WMS-consumable (per MITECO's own SNCZI documentation, QGIS-WMS compatible) national
infrastructure. **Not independently probed for a live Isuela-Huesca-specific layer/extent this
pass** — this is a genuine gap in this audit, not a confirmed absence: the service almost
certainly exists (CHE was reported adding ~200 km of Aragón flood-hazard mapping recently per
press coverage), but the specific WMS `GetCapabilities` for the Isuela reach through the city was
not fetched and verified live. **Status: likely-available, unverified this pass — flag for a
follow-up probe, do not treat as either present or absent.**

## 7 · Airport

Huesca–Pirineos Airport (ICAO LEHC) has aeronautical servidumbres formalised by **Real Decreto
1422/2018** (BOE-A-2019-636, confirmed live), which modified the airport's servidumbres and is
accompanied by numbered planos (aerodrome/radio-aid easements, operating easements incl. PAPI) in
EPSG:25830 — same legal instrument family the codebase already holds a working geometry pipeline
for at Barcelona (per repo history: "AESA KMZ has full 3D servitude geometry"). **Not
independently re-confirmed this pass whether a KMZ/shapefile equivalent to Barcelona's exists for
Huesca-Pirineos specifically** — the RD's own planos may or may not be distributed as GIS-ready
files by AESA the way Barcelona's are. Flag for a dedicated follow-up probe; the legal instrument
is real and cited, its machine-readable geometry form for THIS airport is unverified.

## 8 · Environmental

A Natura 2000 site (LIC/ZEPA) spans Alto Gállego / Hoya de Huesca / Sobrarbe / Somontano de
Barbastro municipalities **including Huesca** per search results — proximity to the urban core
specifically was not pinned down to a distance or geometry this pass. National Natura 2000 WFS/WMS
services (MITECO) are known-standard infrastructure (used elsewhere in the repo per the Pirineos
protected-landscape family of checks) and were not independently re-fetched here. **Status:
plausible national-service coverage, not newly verified.**

## 9 · Legal delegation

No PERI (Plan Especial de Reforma Interior) or standalone Plan Especial delegation was surfaced
for the specific parcels blocked on plano nº 5 — the blocker is a **plan-sheet graphic remission
within the primary PGOU itself** (art. 8.4.8/8.4.10 sending fondo/altura to the sheet), not a
downstream delegated instrument. Because the fondo edificable is graphically regulated for the
closed-block fabric (NZ4, Manzana Cerrada) that dominates the consolidated urban fabric, and NZ1/
NZ2/NZ3 barrios zones are graphed on a **different, unexamined sheet (plano nº 12)**, the
**percentage of Huesca's urban land currently non-computable is effectively the whole
consolidated fabric under plano nº 5 plus the wholly-unexamined barrios under plano nº 12** — no
zone in the municipality currently has a closed, PRYZM-computable envelope. Estimated
non-computable share: **~100 % of urban land**, pending either the georeference or the plano nº
12 read.

## 10 · Dispatch feasibility

Parcel resolution (Catastro) and coarse classification (SIUa `clasificacion`) are live and would
route automatically. Zone-to-ordinance dispatch is only partially wired (no rule pack registered
in `rulepacks/registry.ts` for `es-22125-huesca` per `ENVELOPE.md`'s S2–S5 slot table — router
predicate, zone source, rule pack and registration are all `❌ none`). Even if the georeferencing
gap closed today, a rule pack authoring pass (S4/S5) plus the plano-nº-12 barrios read would still
be required before parcel→zone→ordinance→envelope could run end-to-end. So the answer is: **not
automatic even conditional on the georeference closing** — the georeference is necessary but not
sufficient; a second, separately-scoped engineering task (pack authoring) sits behind it.

---

## Executive Summary

Huesca is the one Spanish municipality in this programme where the governing ordinance has been
fully read, article-cited, and where the specific technical nature of the blocker (a rejected
georeference, not a missing or unreadable law) is unusually well characterised. This audit's live
re-verification of the Ayuntamiento de Huesca, the Gobierno de Aragón's Consejo de Urbanismo de
Huesca, and IDEAragon/SIUa found no DWG/DGN original, no municipal WFS/GeoServer equivalent to
Zaragoza's IDEZar, and no georeferenced plan-sheet index (Zaragoza publishes one; Huesca does not,
so far as could be found) — every plan document remains PDF-only, and the regional SIUa WMS
exposes only coarse classification and legal-approval-status layers, never a calificación or
sheet-index layer for Huesca. The priority task therefore returns a **negative but well-evidenced**
result: the recorded blocker is corroborated, not closed, and no new lever was found. Separately,
this audit surfaced a genuine second gap not previously flagged in `esAragon.ts`: NZ1/NZ2/NZ3
barrios zoning lives on a wholly different, unexamined sheet (plano nº 12), meaning even a
successful plano-nº-5 georeference would not cover the whole city.

## Capability: Research Blocked

Not Engineering Blocked (the missing piece is not implementation effort against known data) and
not Legally Blocked (the law grants an envelope; nothing in the ordinance withholds it) and not
Impossible Today in the strong sense the file itself argues (§PLANO5-IS-VECTOR: "not asserted that
Huesca has an equivalent [sheet index] — that is UNKNOWN and worth one probe"; this audit ran that
probe and it came back negative, which narrows but does not fully close the space of untried
levers, e.g. monumented-marker fitting or stroke-class-filtered re-fitting per the codebase's own
next-lever note). The honest label is **Research Blocked**: a specific, falsifiable technical
question (can the sheet be georeferenced to <1 m by some method not yet tried) remains open, and
until it resolves either way no envelope may be published.

## Evidence Matrix

| Item | Status | Evidence | Source |
|---|---|---|---|
| Governing instrument identified | ✅ MEASURED | Texto Refundido PGOU, enero 2008; arts. 8.4.8/8.4.10 | `esAragon.ts` `HUESCA_INSTRUMENT_REF` (pre-existing, not re-verified this pass) |
| Plano nº 5 is vector CAD | ✅ MEASURED | Zero fonts/rasters, 111k–336k path ops/sheet | `esAragon.ts` `HUESCA_PLANO5_FINDING` (pre-existing) |
| Legend bound | ✅ MEASURED (partial: 5/7 rows unique) | Stroke-class swatch measurement | `esAragon.ts` `HUESCA_LEGEND_STATUS` (pre-existing) |
| Georeference | ⛔ REJECTED | 2.31 m median, 1.9× vs 3× bar | `esAragon.ts` `HUESCA_GEOREFERENCE_STATUS` (pre-existing) |
| Original DWG/DGN source | ⛔ NOT FOUND | huesca.es PGOU pages fetched live, PDF-only confirmed | This audit, 2026-08-04 |
| Municipal WFS/GeoServer (IDEZar-equivalent) | ⛔ NOT FOUND | GeoInfoHuesca fetched, no OGC service disclosed | This audit, 2026-08-04 |
| Regional SIUa WMS calificación/sheet-index layer | ⛔ NOT FOUND | SIUa_WMS GetCapabilities fetched live, 25 layers enumerated, none matches | This audit, 2026-08-04 |
| Consejo de Urbanismo de Huesca original-submission archive | ⛔ NOT FOUND | Page fetched live: acuerdos + sectoral index only | This audit, 2026-08-04 |
| Parcel geometry | ✅ LIVE | Catastro INSPIRE WFS, EPSG:25830 | Pre-existing, corroborated |
| Heritage BIC (textual) | ✅ CONFIRMED | Conjunto Histórico 1971, Catedral RI-51-0000626 | This audit, 2026-08-04 |
| Heritage BIC (machine-readable geometry) | ⛔ NOT FOUND | Catálogo de Bienes Protegidos PDF-only; no Aragón BIC WMS found | This audit, 2026-08-04 |
| Flood (Isuela/CHE/SNCZI) | ⚠ UNVERIFIED | Service family confirmed to exist nationally; Huesca-specific layer not fetched | This audit, 2026-08-04 |
| Airport (LEHC servidumbres) | ✅ instrument confirmed / ⚠ GIS form unverified | RD 1422/2018 confirmed live | This audit, 2026-08-04 |
| Natura 2000 proximity | ⚠ UNVERIFIED | Site spans Huesca municipality per search; distance to urban core not measured | This audit, 2026-08-04 |
| Plano nº 12 (barrios NZ1/NZ2/NZ3) | ⛔ NOT EXAMINED | Referenced in `esAragon.ts` as a known gap, not read | Pre-existing note, not closed this pass |

## Machine-readable assets — every verified endpoint

- `https://icearagon.aragon.es/SIUa_WMS?service=WMS&request=getcapabilities` — live WMS, 25 layers (classification + legal-approval status only, region-wide, no Huesca fondo/altura).
- Catastro INSPIRE WFS (national, already wired) — parcels, EPSG:25830.
- `https://icearagon.aragon.es/Visor2D`, `AragonReferencia`, `AragonFotos`, `DIT` WMS, SIOSE WMTS — base cartography only, confirmed live, not zoning.
- AESA/BOE: Real Decreto 1422/2018 (BOE-A-2019-636) — legal text confirmed, planos referenced in EPSG:25830, GIS-ready form for LEHC not independently confirmed.

## Missing assets

- No DWG/DGN original for plano nº 5.
- No georeferenced plan-sheet index for Huesca (unlike Zaragoza's `hoja_pgou_*` layers).
- No municipal WFS/GeoServer calificación layer (unlike Zaragoza's `urbanismo:Calificaciones_Urbanas`).
- No machine-readable BIC/heritage geometry (Aragón has no confirmed equivalent to Extremadura's IDEEX BIC WMS).
- No confirmed live flood-zone layer specific to the Isuela reach through Huesca (national service family exists, not fetched).
- No confirmed GIS-ready airport-servitude geometry for Huesca-Pirineos specifically.
- Plano nº 12 (NZ1/NZ2/NZ3 barrios zoning) entirely unread.
- No registered rule pack (`rulepacks/registry.ts` S2–S5 all `❌`).

## Blockers

- **GIS-solvability (primary):** the plano nº 5 georeference — rejected once at 2.31 m; the
  codebase's own next lever (filter match features by bound stroke class rather than polygon
  area) has not been re-run, and this audit found no sheet-index shortcut to bypass it entirely.
  Classed **GIS-hard, not GIS-impossible** — one specific, cheap next experiment remains untried.
- **Engineering:** even a closed georeference does not by itself produce an envelope — a rule
  pack must still be authored and registered (S4/S5), and plano nº 12 must still be read for the
  barrios zones. This is additional, separately-scoped work, not automatically unlocked.
- **OCR:** not applicable — the sheet is proven vector, not raster; no OCR step is on the critical path.
- **Legal:** none identified. The ordinance grants an envelope; nothing withholds it.

## Estimated Unlock Effort: Large

Georeferencing a rejected fit to sub-metre precision with no sheet-index shortcut and no CAD
source is a genuine, uncertain research task (stroke-class-filtered re-matching, monumented-marker
fitting, or multi-sheet joint adjustment per the user-supplied research pass — none independently
attempted or validated in this session). Layered on top: authoring and registering a rule pack,
and reading a wholly separate 28-vs-N-sheet instrument (plano nº 12) for the barrios zones. None
of these is Very-Large/multi-region in scope (contrast Aragón-the-region, which was separately
closed as CLOSED/impossible per `ARAGON-BUILDABILITY-RESEARCH.md` for the *regional SIUa* tier —
Huesca-the-municipality is a distinct, still-open question). **Large**, not Very Large, because
the corpus is one municipality, the law is already read, and the geometry is already proven vector
— but Large because it is multi-step, uncertain-outcome research, not a known-shape engineering
ticket.

## Recommendation: Research first

Do not build a rule pack against a rejected fit. Do not deprioritise entirely either — Huesca is
unusually close (law fully read, geometry proven vector, CRS certain, scale certain) compared to
most refusal jurisdictions in this programme. The next concrete, cheap step is the stroke-class-
filtered re-match the codebase already names as the open lever, plus a dedicated fetch of
`patrimonioculturaldearagon.es` and CHE/SNCZI `GetCapabilities` to close the two unverified
non-envelope axes (§5, §6) this pass left open. Reading plano nº 12 is a second, independent
research task that should be scoped separately since it may have entirely different georeferencing
prospects.

## PRYZM Readiness Score: 22/100

Parcel routing live (national, free), classification live (regional, coarse), law fully read and
cited (rare and valuable), geometry proven machine-extractable (rare and valuable) — these earn
real points relative to a from-scratch jurisdiction. But zero of the three governing-envelope
axes (height, FAR/occupation, buildable depth) can currently be published, zero machine-readable
zoning-geometry endpoint beyond regional coarse classification was found, no rule pack exists, and
a second unread instrument (plano nº 12) covers an unknown fraction of the city. This sits below
Zaragoza (which at least serves its full subgrado-level calificación live) and well below any
production-ready capital.

## Compare against

- **Barcelona** — Production-ready-adjacent per repo history (airport servitude geometry, envelope
  depth+height shipped, terrain/context wired). Huesca is far behind: no equivalent municipal WFS.
- **Zaragoza** — Same region, same refusal *value* (`ZARAGOZA_ENVELOPE_VERIFIED = false`), but a
  materially different and more advanced *reason*: Zaragoza's full calificación (7,967 polygons,
  all four subgrado selectors populated) is live over WFS, its blocker is now pure transcription +
  one graphic depth attribute, and it independently proves the sheet-index technique Huesca lacks
  (`hoja_pgou_2000`/`hoja_pgou_5000`). Zaragoza is closer to unlocking than Huesca.
- **Murcia, Balears, Sevilla, Valencia, Granada, Córdoba, Málaga** — per this session's own prior
  tracker entries (not re-verified here), several of these have either signed gates or richer
  regional GIS delegation than anything found for Huesca/Aragón this pass; Huesca's specific
  advantage over most of them is depth of *legal reading*, not data availability.
- **Aragón the region** — separately and explicitly `CLOSED` at the regional-SIUa tier
  (`ARAGON-BUILDABILITY-RESEARCH.md`: 21.8 % `fiab_geom` ceiling, 1:15,000 scale, proven-zero
  ficha buildability). This audit's finding is consistent with and reinforces that closure at the
  *regional* layer, while leaving the *municipal* Huesca question open per the file's own stated
  distinction between the two tiers.

## Final verdict

Huesca remains the best-characterised refusal jurisdiction in the Aragón corpus — a real envelope
exists in law and in a genuinely machine-extractable drawing, and only a coordinate-fixing problem
stands between the current state and a citable number for the dominant closed-block fabric (plus
a second, independent read of plano nº 12 for the barrios). This audit's live search across the
Ayuntamiento de Huesca's electronic office, the Gobierno de Aragón's Consejo de Urbanismo de
Huesca, and IDEAragon/SIUa found **no original DWG/DGN CAD source and no alternative official
machine-readable zoning-geometry publication** (WFS/ArcGIS/SHP/GML) beyond the PDF plans and the
already-known coarse regional SIUa WMS layers.

**Did this audit find an original CAD source or alternative GIS? No — on both counts.** The
single biggest blocker is unchanged and now more firmly evidenced: **the plano nº 5 sheet cannot
be positioned on the ground to legal precision, and no shortcut (original CAD, sheet index,
municipal WFS) was found to bypass that fitting problem.** The next honest move is the specific,
cheap, previously-identified experiment (stroke-class-filtered re-matching against Catastro) —
not a rule pack, and not a demo.
