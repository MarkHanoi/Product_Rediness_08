# Córdoba — EXHAUSTIVE SEARCH FOR A MACHINE-READABLE CALIFICACIÓN SOURCE

> **Stamp 2026-08-02.** A **REFUTATION** task, run to the founder's brief: *"Prove that no
> machine-readable source exists before committing to manual reconstruction."*
> Time-boxed to 1–2 days. Six probes + a schema-leak analysis, every one recorded with its exact
> URL, HTTP status, content-type and byte count.
>
> **Trigger:** a live ArcGIS REST **`GMU_Services (FeatureServer)`** attributed to GMU Córdoba.
>
> ⚠ **Every negative below is a MEASURED negative.** Per §CONTEXT-DATA-HONESTY a 403, a timeout, a
> DNS failure and an empty result are four different values, and they are kept apart throughout. A
> DNS failure is recorded as `ERR fetch failed` and claims **nothing** about whether a service exists.

---

## VERDICT

> ## ⛔ NO MACHINE-READABLE CALIFICACIÓN SOURCE EXISTS BEYOND THE COACo 2-DISTRICT PILOT.
>
> **AND — the finding that changes the roadmap — MANUAL VECTORISATION IS ALSO NOT CURRENTLY POSSIBLE.**
> CLOSURE-REGISTER blocker 22 proposes georeferencing *"the remaining 69 of 77 GMU CUS raster
> sheets"*. **Measured this pass: 41 of the 49 urban sheets return a 69-byte "Server under
> construction" page. Only 8 serve a real JPG — and those 8 are, to within two sheets, exactly the
> ones COACo already vectorised.** The rasters that the manual-vectorisation plan would consume **are
> not published**. Blocker 22 is therefore **not an engineering task at all**; it is a **data request
> to GMU Córdoba**, and it must be re-scoped as one.
>
> ⇒ The correct next action is neither *"vectorise"* nor *"keep searching"*. It is **one email to
> GMU**, and the schema-leak analysis in §7 says precisely what to ask for.

---

## Probe 1 — Exhaust the ArcGIS REST service `GMU_Services (FeatureServer)`

**RESULT: the service is real, and it is not Córdoba. `GMU` is an acronym collision.**

Located via the ArcGIS Online sharing API (`/sharing/rest/search`), the only `GMU_Services`
FeatureServer that exists:

```
https://services4.arcgis.com/8HngwjvgUOjvnliw/arcgis/rest/services/GMU_Services/FeatureServer?f=json
  → HTTP 200, application/json, 3 077 bytes
    owner            1033586_SBH_SBHS_GIS      (a US school-district GIS account)
    layers           ["0:GMU_Services"]
    serviceDescription / description / copyrightText   all EMPTY
    spatialReference {"wkid":102100,"latestWkid":3857}
    fullExtent       xmin −8608596.03  ymin 4698503.61  xmax −8601700.05  ymax 4703965.61
```

**Reprojected from EPSG:3857 that extent is 38.8381 °N, −77.3323 °W — Fairfax, Virginia.
`6 148 km` from Córdoba (37.8882, −4.7794).** It is **George Mason University**.

Every AGOL hit for the token `GMU` resolves to either **George Mason University** or a US
**Game Management Unit** (`Skokomish_Hunting_Units_WFL1`, `Wolf_Project_22_1220`). And every
Spanish-language query returns **`total: 0`**:

| AGOL query | `total` |
|---|---:|
| `GMU_Services` | 161 — all US universities / hunting units |
| `title:GMU_Services` | 6 — same |
| `GMU Cordoba urbanismo` | **0** |
| `owner:GMU_Cordoba` | **0** |
| `Cordoba PGOU calificacion` | **0** |
| `Gerencia Municipal Urbanismo Cordoba` | **0** |
| `PGOU Cordoba` | **0** |
| `calificacion Cordoba 14021` | **0** |

⚠ **There is nothing to enumerate.** The layer-definition / domain / subtype / relationship-class
walk the brief asks for is moot: layer 0 is a US campus-services point layer. No Spanish GMU
ArcGIS tenancy was found by any query. *(Probe 5 is folded in here — it is the same search space.)*

## Probe 2 — Hidden FeatureServer / MapServer layers, and unlisted layer ids

**RESULT: no Córdoba ArcGIS deployment found. One GeoServer had WMS-only layers; they are not
WFS-queryable.**

Direct host probes (all `?f=json` against `/arcgis/rest/services` and `/server/rest/services`):

| Host | Result |
|---|---|
| `www.gmucordoba.es/arcgis/rest/services` | **404** text/html 984 B (Joomla 404 — the site exists, the path does not) |
| `www.gmucordoba.es/server/rest/services` | **404** text/html 984 B |
| `www.cordoba.es/arcgis/rest/services` | **404** text/html 49 444 B |
| `sig.gmucordoba.es` · `geoportal.gmucordoba.es` · `servicios.gmucordoba.es` | **`ERR fetch failed`** — DNS does not resolve. ⚠ NOT "no data": these hosts do not exist. |
| `sig.cordoba.es` · `geoportal.cordoba.es` · `cartografia.cordoba.es` · `mapas.cordoba.es` · `visor.gmucordoba.es` | **`ERR fetch failed`** — DNS does not resolve |
| `ide.cordoba.es/arcgis/rest/services` | **200** but returns the Angular SPA shell (5 799 B, `<title>Visor</title>`) — a catch-all route, **not** an ArcGIS directory |

**Unlisted-layer test on the COACo GeoServer.** Its **WMS advertises three names its WFS does not**
(`areas`, `parcelario_urbanismo`, `actuaciones_tramitado`) — exactly the "an unlisted id often still
answers" case. Tested via `WFS GetFeature&resultType=hits`:

```
coaco:areas                  → 400  ows:ExceptionText "Feature type coaco:areas unknown"
coaco:parcelario_urbanismo   → 400  "Feature type coaco:parcelario_urbanismo unknown"
coaco:actuaciones_tramitado  → 400  "Feature type coaco:actuaciones_tramitado unknown"
coaco:calificacion · :calificaciones · :pgou · :ordenanzas_completo ·
coaco:zonificacion · :cus · :planeamiento · :normativa · :alturas   → 400 unknown (all)
```

`GetFeatureInfo` on `areas` → `ServiceException code="LayerNotDefined"`. They are layer groups /
styled views, carrying no queryable features of their own.

## Probe 3 — OGC capabilities

**RESULT: complete enumeration of both GeoServers. Only the already-known pilot carries zoning.**

| Endpoint | Status | Bytes | Zoning layers |
|---|---|---:|---|
| `geoserver.pgou.coacordoba.org/geoserver/wfs?…GetCapabilities` (2.0.0) | 200 | — | **15 layers** — the known pilot |
| `geoserver.pgou.coacordoba.org/geoserver/coaco/wms?…GetCapabilities` (1.3.0) | 200 | 244 910 | 25 names, superset above is WMS-only styling |
| `ide.cordoba.es/geoserver/wfs?…GetCapabilities` (2.0.0) | 200 | 157 326 | **105 layers — ZERO zoning** |
| `ide.cordoba.es/geoserver/wms?…GetCapabilities` (1.3.0) | 200 | 363 539 | **119 layers — ZERO zoning** |
| `ideandalucia.es/services/DERA_g6_usos_suelo/wfs` | 200 | 102 039 | land **cover**, not calificación (known dead end, re-confirmed) |

Filtered against `/urban|califi|ordenan|pgou|planea|zonif|suelo|edificab|altura|planta|normativ|clasific/i`
the Ayuntamiento's 105 WFS + 119 WMS layers yield **`(none)`**.

## Probe 4 — COACo viewer network traffic

**RESULT: decisive. The viewer touches no ArcGIS endpoint at all.**

`visor.pgou.coacordoba.org/` → 200, 36 489 B → app at `/app/` → 200, 507 B → bundle
`/app/assets/index-c4150013.js` → **200, 4 669 993 B**. Every absolute URL in the 4.67 MB bundle was
extracted. The **entire data plane** is:

```
https://geoserver.pgou.coacordoba.org/geoserver/coaco/wms      ← the known pilot
https://geoserver.pgou.coacordoba.org/geoserver/coaco/ows      ← the known pilot
https://visor.pgou.coacordoba.org/api/  ·  /api/catastro/      ← a CORS proxy, see below
https://ovc.catastro.meh.es/…                                  ← national Catastro
https://tms-pnoa-ma.idee.es/1.0.0/pnoa-ma/                      ← national orthophoto
tile.openstreetmap.org · cartodb · stamen · mapbox              ← basemaps
```

**Zero occurrences of `FeatureServer`, `MapServer`, `VectorTileServer` or `arcgis`.** The only
`MapServer` string is an OpenLayers server-type enum (`{CARMENTA_SERVER, GEOSERVER, MAPSERVER, QGIS}`).

`/api/` → 200, 38 B, body `Error de API!!. Falta el parámetro url` — a **generic URL proxy**, not a
data API. `/api/layers` and `/api/config` → **404 nginx/1.25.1**.

⭐ **This probe did find something real, just not ArcGIS**: `ide.cordoba.es/geoserver` — a **second,
previously-undocumented GeoServer owned by the Ayuntamiento**, found by the same bundle-grep
technique that originally found COACo's. See §6.

## Probe 5 — ArcGIS Online / Hub items

Folded into Probe 1 (same API, same search space). **All Spanish-language queries: `total: 0`.**
Additionally, three AGOL org ids surfaced by web search were dereferenced:
`services.arcgis.com/BQTQBNBsmxjF8vus` → 200, 76 468 B, but its service list is Colombian
(`Accidentes_Bogotá_CUE_2022`, `Accidentalidad_Sabaneta`, `…Barranquilla`) — not Córdoba, Spain.
`jif0hURWxN9TitFw` and `RVvWzU3lgJISqdke` → `{"error":{"code":400,"message":"Invalid URL"}}`.

## Probe 6 — Is manual vectorisation therefore correct?

**NO — and this is the pass's most consequential measurement.**

CLOSURE-REGISTER blocker 22 states the GMU publishes the calificación municipality-wide as **77
georeferenceable raster JPGs (49 urban `CUS01W…CUS49W` + 28 peripheral)**, of which COACo vectorised
8, and proposes georeferencing **the remaining 69**. That claim was generalised **from a single
sheet** (`CUS41W` → 200). All 49 urban sheets were fetched this pass:

| Sheet state | Count | Evidence |
|---|---:|---|
| **LIVE** `image/jpeg`, 365 KB–500 KB | **8** | CUS18W 447 384 · CUS19W 499 576 · CUS25W 481 662 · CUS26W 478 290 · CUS34W 423 880 · CUS41W 461 957 · CUS45W 365 349 · CUS46W 376 024 |
| **DEAD** — 69-byte `Server under construction` HTML | **41** | CUS01–17W, CUS20–24W, CUS27–33W, CUS35–40W, CUS42–44W, CUS47–49W |
| Peripheral sheets under any of 4 tested suffixes (`E`/`P`/`N`/`S`, 112 candidates) | **0 live** | none served |

**`coaco:hojas_cus` lists the vectorised set: CUS25W, CUS26W, CUS34W, CUS41W, CUS45W, CUS46W
(6 distinct, 8 rows).** So the **live** set is the vectorised set **plus exactly two** (CUS18W,
CUS19W).

⚠ **The 69 sheets the manual-vectorisation plan would consume DO NOT EXIST as retrievable rasters.**
The marginal gain available from raster work today is **2 sheets**, not 69.

⚠ **And they are not georeferenced either.** No world file or projection sidecar is served for any
sheet — `.jgw`, `.wld`, `.jpw`, `.aux.xml`, `.prj` all return the same 69-byte page — and the JPEG
carries no EXIF/XMP producer string. The register's word *"georeferenceable"* was an assumption, never
a measurement. This also engages the founder's signed doctrine directly: **a non-georeferenced raster
is not authoritative published geometry**, so it could not authorise a dispatched envelope even if
traced.

---

## 7 — THE SCHEMA-LEAK ANALYSIS (the founder's third avenue)

*If COACo worked from something structured, the published pilot should leak that source's schema.*
**It does leak — and it leaks AGAINST a broader dataset existing.**

**(a) No Esri artefacts whatsoever.** `coaco:ordenanzas` carries exactly four attributes —
`ordenanza:string`, `et:string`, `sup_m2:float`, `link:string`. There is **no `OBJECTID`, no
`GlobalID`, no `Shape_Area`, no `Shape_Length`**, and feature ids are `ordenanzas.485` — the
**PostGIS/GeoServer `table.pk` form**. An export from an Esri enterprise geodatabase or a File
Geodatabase virtually always carries at least `OBJECTID` and the `Shape_*` pair. **This is positive
evidence that the pilot did not come out of an ArcGIS deployment** — consistent with Probes 1–5
finding no such deployment.

**(b) The schema is thin and purpose-built, not an internal export.** Four columns, one of which
(`link`) is a *document URL* rather than a planning attribute. There is no código, no subzona, no
artículo, no ámbito, no fecha, no source-sheet reference. Contrast the sibling
`coaco:vcatastro_urbanismo`, which carries **29** richly-typed columns — that layer *is* a real
join against Catastro, and it shows what COACo publishes when it *has* a structured source.
`ordenanzas` looks like something drawn for the viewer, not exported from a register.
⚠ `et` is populated on **270 of 453** and is publisher-undocumented (L-661) — a residue whose meaning
COACo has never stated, and the single best question to put to them.

**(c) Coordinate precision is HETEROGENEOUS — the strongest signal.** Decimal places on the X
ordinate across all 5 357 vertices of the 453 polygons:

| decimals | 1 | 2 | 3 | 4 | 5 | 6 | 8 |
|---|---:|---:|---:|---:|---:|---:|---:|
| vertices | 6 | 54 | 1 652 | 1 755 | 80 | 1 767 | 43 |

A single machine export from one structured source is **homogeneous** in precision. A spread across
1–8 decimals is the signature of **mixed provenance** — geometry partly snapped to an existing base
(cadastral parcel corners) and partly digitised by hand.

**(d) Topology — reported with its confound.** Only **53 of 4 893 distinct vertices (1.1 %)** are
shared by more than one polygon (matched at 4 dp = 0.1 mm in EPSG:25830). A topologically clean
GIS-born coverage would share most boundary vertices. ⚠ **But this is NOT conclusive on its own**:
`ordenanzas` covers only 32.8 % of the pilot districts and most polygons are genuinely disjoint
blocks separated by viario, so low sharing is partly *expected*. Recorded as **supporting**, not
load-bearing — (a) and (c) carry the argument.

⇒ **CONCLUSION: the pilot was hand-traced into PostGIS over a raster/cadastral base.** There is no
internal municipal GIS schema showing through, because — on this evidence — the pilot is not an
export of one. **This is the founder's own test, and it returns a negative.**

---

## 8 — WHAT *WAS* FOUND (leads, deliberately not acted on this turn)

`ide.cordoba.es/geoserver` — the **Ayuntamiento de Córdoba's** own GeoServer + a GeoNetwork
catalogue at `ide.cordoba.es/geonetwork/srv/spa` (**56 records, `any=calificacion` → 0 hits**) and a
backend at `/idecordobaback`. It carries **no zoning**, but it does carry base cartography nobody in
this dossier has recorded, and two rows bear directly on open blockers:

| Layer | Bears on | Why it matters |
|---|---|---|
| `idecordoba:sup_viales` · `red_viaria` · `tramo_vial` · `ejes_red_viaria` · `elementos_red_viaria` | ⭐ **blocker 8** — the MC per-street-width height table (Art. 13.5.3.1), worth **0.88 pp** of the ENVELOPE axis | This is a candidate **Córdoba street-width source**, the one input blocker 8 has been waiting on. It is municipal, authoritative and machine-readable. |
| `idecordoba:manzana` (city blocks) | **blocker 20** / the block ring | A published block polygon could sidestep the cadastral dissolve entirely rather than reconstructing it from parcels. |
| `idecordoba:parcelas_catastrales` · `construcciones` · `superficie_construcciones` | PARCEL / HEIGHTS cross-checks | A third parcel lineage, municipal. |

⚠ **NOT acted on, deliberately.** The brief forbids binding a source this turn, ENVELOPE stays a
measured 0.0 %, and the gate-sequencing finding stands (**blockers 4 and 3 before 2**). These are
recorded so the next pass starts from them instead of rediscovering them.

## 9 — One metadata anomaly, recorded and NOT resolved

`coaco:hojas_cus`'s WMS abstract reads *"…planos de Calificación, Usos y Sistemas del **PGOU 2021**
de Córdoba"*, while its three sibling layers (`ordenanzas`, `actuaciones`, `usos_dotacionales`) all
say **PGOU 2001**, and the national SIU registry answers, for `CodINE='14021'`:

```
FiguraVigente "Plan General"   FechaFigura 2002
UrlLink https://ws132.juntadeandalucia.es/situadifusion/pages/search.jsf
```

**Most likely a publisher typo** (one layer of four, contradicted by the national registry). It is
**not** recorded as a supersession finding — but it is exactly what `supersessionChecked: false` in
`cordoba.measurements.json` covers, and it is the second question to put to COACo.

---

## 10 — What to ask GMU Córdoba for, by name

The probes make the request precise, which is the whole value of having run them:

1. **The CUS series as data** — the 41 urban sheets that 404, *and* whichever internal layer the 8
   published sheets were plotted from. §7 says the plotted source is not an ArcGIS service; ask for
   the **PostGIS/CAD/DWG original**.
2. **World files / projection for the 8 live sheets**, so the two un-vectorised live sheets
   (CUS18W, CUS19W) become tractable at all.
3. **The definition of `et`** — populated on 270 of 453 polygons, publisher-undocumented (L-661),
   and agreeing with the link key on every polygon it shares.
4. **Confirmation of the instrument date** (§9).

---

## 11 — THE STOPPING RULE IS SATISFIED, AND THE PRE-APPROVAL'S PREMISE IS NOT

The founder's rule: if ArcGIS REST · FeatureServer · MapServer · ArcGIS Online · hidden layers ·
relationship tables all fail, declare **"no discoverable machine-readable source exists"**, and
full vectorisation is pre-authorised — *"The source data are already public."*

**The first half is satisfied. Declared, on the probe evidence in §§1–5, 7:**

> ## No discoverable machine-readable calificación source exists for Córdoba beyond the COACo 2-district pilot.

⚠⚠ **THE SECOND HALF IS NOT, AND IT MUST BE SAID BEFORE ANYONE STARTS TRACING.** The pre-approval
rests on *"the source data are already public"*. **Measured: they are not.** 41 of the 49 urban CUS
sheets return a 69-byte "Server under construction" page (§6). **Vectorisation is authorised and the
thing to vectorise is missing.** The available work is **2 sheets** — CUS18W and CUS19W, the only
live sheets COACo has not already done — not 69.

⇒ **Blocker 22 does NOT migrate Data acquisition → Engineering.** Under the new standard a category
change requires explicit evidence; the evidence points the other way. It **stays Data acquisition**,
because the exit criterion *"the dataset is obtained"* is precisely what is unmet.

| | |
|---|---|
| **Blocker 22 — the 41 unpublished CUS sheets** | **Category: Data acquisition** · Owner: **the founder** (a request to GMU Córdoba; no agent can close it) · **Exit: GMU serves the 41 missing sheets, or answers that it will not.** |
| **Blocker 22b — vectorise the 2 live un-vectorised sheets** *(new, split out)* | **Category: Engineering** · Owner: **the Córdoba agent** · **Exit: CUS18W + CUS19W vectorised, bound through the existing resolver, and the ENVELOPE axis re-measured.** |

## 12 — COSTED VECTORISATION PLAN, WITH THE DELEGATION NETTED OUT

⚠ **Sized so nobody reads "vectorise the sheets" as "unlock 97 % of Córdoba".** Three deductions
apply to *any* newly vectorised land, all measured, all permanent-or-blocked:

| Deduction | Measured | Nature |
|---|---:|---|
| **Legally delegated** to a Plan Parcial / Plan Especial / PERI / Estudio de Detalle | **44.73 %** of ordenanza land (178/453 polygons, 728 522.65 m², centroid method) | ⛔ **PERMANENT.** Correctly `not-determined`. Vectorising more geometry produces more *cited refusals* here, not more envelopes. |
| **Manzana Cerrada**, blocked on the street-width table (Art. 13.5.3.1) | 16.86 pp of ordenanza land | Blocked until blocker 8 — for which §8 above just found a candidate source |
| Legally-grounded / unbindable families (Comercial · PTC · EP · UAS · IND) | 4.53 % | ⛔ Permanent (see ENVELOPE.md) |
| **⇒ PGOU-direct AND packed — the only slice that can ever become an envelope** | **52.87 %** of ordenanza land | the real multiplier |

**Per-sheet yield, measured:** the 6 vectorised sheets carry 1 628 615.63 m² of ordenanza polygons =
**≈ 0.27 km² per sheet**. ⚠ Per-sheet yield varies with how much of a sheet is urban fabric, so this
is an **order of magnitude, not a forecast**.

| Scenario | New ordenanza land | Direct+packed (×0.5287) | ENVELOPE axis after blockers 2+3+4 |
|---|---:|---:|---:|
| **today** | — | — | **0.0 %** (gate shut, resolver uncalled) |
| blockers 2+3+4 only, no new geometry | — | 567 649 m² | **≈ 0.68 %** |
| **\+ blocker 22b — the 2 live sheets** *(the only work available now)* | ≈ 0.54 km² | ≈ 0.29 km² | **≈ 1.0 %** |
| \+ blocker 8 (MC street width) on existing pilot | — | +293 410 m² | **≈ 1.35 %** |
| **hypothetical: all 49 urban sheets published AND vectorised** | — | — | **≈ 8 %, order of magnitude only** |

⚠ **THE 8 % IS AN EXTRAPOLATION AND IS LABELLED AS ONE.** It assumes the pilot's measured
private-buildable fraction (**37.3 %** of district area) and its 52.87 % direct+packed share hold
city-wide, at tier `estimated-ruleset` (0.4). **Applying a pilot ratio city-wide is exactly what
produced the withdrawn "~19 % / ~89 %".** It is quoted only to establish that the full prize is
single-digit percent, not the ~31 % a careless reading of the pilot suggests. **Do not put it in a
tracker as a target.**

**Doctrine constraints on the derived dataset** (`fd1492ef`):
- **ADR-0283** — the CUS sheets are a published *drawing*, not authoritative published geometry.
  Anything traced from them is **our derivation** and its tier must say so. It may not exceed
  `estimated-ruleset`, and `authoritative` remains unreachable (blocker 19).
- **ADR-0284** — tracing a calificación boundary is derived **geometry**: permitted. Deciding which
  ordenanza applies where a sheet is illegible, or which MC subzone a bare label means, is derived
  **law**: **forbidden** — that is a cited refusal (`regime-undetermined`), exactly as the bare-`O_MC`
  case already ships.
- **ADR-0286** — every derived polygon carries legal source (the PGOU article), computational source
  (the sheet id + the georeferencing used), and its confidence tier, through to the UI.
- The ordinance **TEXT** is already transcribed and is per-*ordenanza*, not per-district, so
  vectorisation adds **geometry only** and re-opens no legal question. Keep it that way.

⚠ **Vectorisation does not bypass the gate sequencing.** Blockers **4** (the missing UAD
*profundidad*, Art. 13.9.3.3) and **3** (the uncalled resolver) must land **before** 2, or flipping
the gate ships the L-616 whole-parcel overstatement on UAD-3's 31 505 m² of clickable land. New
geometry only enlarges that exposure.

⚠ **The dissolve is NOT a blocker and must not re-enter the list.** Measured at scale: Catastro
INSPIRE **76.9 %**, COACo **88.5 %**. The three-block sample that made it a P1 is refuted.

---

*Authority: C58 · C60 §2/§3 · C63 §1.1/§1.5 · ADR-0283/0284/0286 · BLOCKER-CLASSIFICATION-STANDARD ·
L-422/457/467/469 · L-656 · L-661 ·
§CONTEXT-DATA-HONESTY · the founder's platform doctrine on authoritative published geometry.
All probes run 2026-08-02 and reproducible from the URLs above. Sibling:
[`../CLOSURE-REGISTER.md`](../CLOSURE-REGISTER.md) blocker 22,
[`OCR-EXTRACTION-RESULTS.md`](./OCR-EXTRACTION-RESULTS.md),
[`CALIFICACION-ENDPOINT-PROBE.md`](./CALIFICACION-ENDPOINT-PROBE.md).*
