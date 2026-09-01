# ES-CATASTRO-3D — LANE L3: comparison, planning content, combine-with

> Lane L3 of the SPAIN CATASTRO 3D investigation · brief `../ES-CATASTRO-3D-BRIEF.md` Q7 / Q9 / Q10.
> Sibling of the predecessor log `es-catastro-3d-investigation.md` (sections P1–P6, **not rewritten
> here — cited by P-number**). All probes made 2026-09-01 between **14:29 and 14:58 UTC**; every
> claim below carries its URL + time. **PROBED** = live request made and response read ·
> **MEASURED** = a count over a real corpus, re-runnable · **READ** = document read, service not
> reached · **NOT CONFIRMED** stays NOT CONFIRMED.
> Classification per the brief: **A** authoritative machine-readable · **B** downloadable but
> access-constrained · **C** visual-only viewer · **D** derived geometry Pryzm could calculate.

## L3 · comparison, planning content, combine-with

### L3-0 · Probe-state correction to P1: the OVC block is HOST-scoped, and it outlived P1 by 7.5 h

P1 measured a soft-block on the `ovc.catastro.meh.es` INSPIRE family at ~07:10 UTC and left the
recovery horizon open (P5's documented penalty is **4 h**, for the SOAP quota). Measured this lane:

| Probe | Time (UTC) | Result |
|---|---|---|
| `ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCallejero.svc/json/Consulta_DNPRC?RefCat=2255404VK4725E` | 14:41:22 | **HTTP 400**, 2,189 B "Sede Electrónica del Catastro" page |
| same service, **the refcat ES-1.1 proved on 2026-08-31** (`2940601DF3824B`) | 14:41:40 | **HTTP 400**, 2,189 B |
| `https://ovc.catastro.meh.es/` — **the host ROOT** | 14:41:45 | **HTTP 400**, 2,189 B |
| **the same DNPRC URL from an independent vantage point** (WebFetch, not this IP) | 14:42 | **HTTP 200 — real JSON**, 10 units, `luso` Comercial/Residencial, `ant` 1925 |
| `www.catastro.hacienda.gob.es/INSPIRE/buildings/ES.SDGC.BU.atom.xml` (ATOM plane) | 14:56:29 | **HTTP 200**, 682,565 B, Last-Modified 2026-02-24 |
| 44.6 MB municipality ZIP from the same host | 14:58 | **HTTP 200**, downloaded in 37 s |

⭐ **Three facts follow, and only the third was previously known.**
1. **The block is IP-scoped, not a service outage** — the independent vantage point served the
   exact URL in the same minute. (MEMORY *probe-can-be-wrong-three-ways*: the discriminator was an
   INDEPENDENT source, not a retry.)
2. **It is HOST-scoped, not service-scoped**: the whole of `ovc.catastro.meh.es` answers 400
   (root included), while **`www.catastro.hacienda.gob.es` — the ATOM/documents plane — is
   untouched** and served a 44.6 MB download without complaint.
3. **Duration ≥ 7.5 h** (07:10 → 14:42), i.e. **the recovery horizon is NOT P5's 4-hour SOAP
   penalty**. Nothing this lane distinguishes 7.5 h from "still blocked".

⇒ **Architecture consequence (feeds Q7's automation column and Q10's cost ranking):** the OVC
**query plane is class B at scale** (burst-fragile, opaque, no published quota for the aspx/svc
families, recovery ≥7.5 h once tripped), while the **INSPIRE ATOM bulk plane is class A**
(unauthenticated, un-blocked, whole-municipality). Any Spain adapter that needs more than a
trickle must be built on ATOM mirroring, not on per-parcel querying. PRYZM's existing 7-day-cache
proxy (`server/jurisdiction/parcelZoningProxy.js`) survives precisely because its steady rate is tiny.

---

### L3-1 · Q7 — the comparison table

Axes per the brief. Every cell is PROBED/MEASURED this lane unless marked otherwise; the evidence
is in L3-2…L3-5.

| Axis | **Catastro** (INSPIRE BU + FXCC) | **Spanish LoD2** (city only: Madrid, Barcelona) | **Overture** buildings | **EUBUCCO v0.2** |
|---|---|---|---|---|
| **Coverage** | **National minus foral** — 95 % of DGC territory (P3); PV + Navarra out | **TWO CITIES.** No national, no regional product exists (L3-2, six probes) | Global | EU-27 + NO/CH/UK, 322 M bldgs (E5-9) |
| **Geometry richness** | 2D footprint per **BuildingPart** + floors ⇒ **LoD1-by-part**; the 3D products (parcel KML, FXCC-floors KML) are **fixed-3 m prisms, flat roofs, everything resting on terrain** (P4) | **Real LoD2**: Madrid = extrusion from **restitution of every roof line at 1:1000**, "gran precisión geométrica en cubierta"; Barcelona = SLPK city model + DWG-3D per barri | 2D footprint/roofprint **only**; `height`/`num_floors` optional ⇒ LoD1 at best | 2D footprint + attributes; no 3D |
| **Floor-level geometry** | ⭐ **FXCC por plantas** — per real floor, per local, with use symbology (P4). The only such product in Europe besides SI (E5 evidence) | none (a single solid per building) | none | none |
| **Attributes (MEASURED, Barcelona 08900, L3-4)** | Building: use **99.7 %**, dwellings **100 %**, year **~100 %**, OfficialArea **~100 %**; **floors at Building level 0 %** (all `nilReason="other:unpopulated"`); **BuildingPart floors ~100 %** (319,098 parts) | Madrid: 3D objects + 2D companion joined by `ID_3D`; **thematic attributes are whatever you join** — the model itself is geometry | bbox sample (L3-5): `num_floors` **90.6 %**, `height` **12.8 %**, `roof_shape` **2.7 %**, `class` **88.4 %** | "100 % complete" is **ML-IMPUTED**: floors ground-truth **16.6 %**, height **43.2 %**, type **38.1 %** (E5-9) |
| **Freshness** | **WFS = live** "actualizados al momento de la invocación" (P3). **Bulk ATOM = 6-monthly, and MEASURED STALE**: Barcelona `A.ES.SDGC.BU.08900.zip` Last-Modified **2026-02-20**; the August-2026 refresh had **not landed** at 14:58 UTC on 2026-09-01 | Madrid **cuatrimestralmente** (metadata); SLPK file Last-Modified **2025-06-25**. Barcelona prod 145 data-date **2025-12-13**, prod 146 **2026-04-01** | monthly releases; latest **2026-08-19.0** (S3 listing probed 14:31 UTC) | irregular; v0.2 is a 2026 snapshot of 55 frozen sources |
| **Licence** | **Custom DGC licence — transformation REQUIRED, redistribution of the original FORBIDDEN** (P2). ⚠ not CC BY | Madrid: Ayto conditions — **commercial reuse allowed, attribution "Origen de los datos: Ayuntamiento de Madrid"**. Barcelona CartoBCN: **NOT CONFIRMED** (no `<rights>` in the ATOM; the web UI has a conditions-acceptance registration the downloads do not enforce) | **ODbL** (OSM, Microsoft) + CC BY (Esri, Google, **IGN-ES "BTN 2024"**) ⇒ **YELLOW, keep separable** | ODbL default with RED pockets (lane 1 §C.2) ⇒ YELLOW |
| **Honest verdict** | **A for attributes and footprints, national. C/B for its own 3D** — the "3D Catastro" is a 3 m-per-floor prism, not a survey. Best national *semantic* source in Spain, not the best *geometric* one | **A, and geometrically the best in Spain — in exactly two cities.** Beats Catastro on roofs, loses on coverage (2 municipalities vs ~8,100) | **D (derived/conflated).** In Spain it is mostly OSM (97.8 % of the sample) — its floors are NOT provably cadastral (L3-5) | **D, provenance-tiered.** Never as authoritative floors/heights |

**Source-priority answer implied for Q8 (stated here because the table settles it, not to pre-empt
that lane):** for AS-IS geometry, `city LoD2 (MD/BCN) → Catastro BU (footprint+floors, national)
→ MDSnE/PNOA nDSM cross-check → Overture → EUBUCCO/GBA`. For AS-IS **semantics** (use, dwellings,
year, GFA) Catastro is first everywhere, including inside Madrid and Barcelona, because neither
city model carries them.

---

### L3-2 · "There is no Spanish national or regional LoD2" — VERIFIED, six independent probes

The predecessor asserted it; the brief asked for verification. Each probe below carries a
**control** (the MEMORY rule: *empty ≠ failure* — a catalogue that answers 0 to everything proves
nothing).

| Probe | URL | Time | Result | Control |
|---|---|---|---|---|
| National open-data catalogue | `datos.gob.es/apidata/catalog/dataset/title/{citygml,lod2,modelo-3d,maqueta3d,edificios3d}` | 14:29–14:30 | **0 items for every 3D term** | `title/lidar` → 5, `title/catastro` → 5, `title/edificaciones` → 5 ⇒ endpoint works |
| **Andalucía** (IDEAndalucía CSW, XML POST) | `www.ideandalucia.es/catalogo/inspire/srv/spa/csw` | 14:52 | **CityGML 0 · LOD2 0**; "tridimensional" 14 = Carmona archaeology, DERA relieve, MDT | `LiDAR` → **232** |
| **País Vasco** (GeoEuskadi CSW) | `www.geo.euskadi.eus/geonetwork/srv/spa/csw` | 14:44 | **CityGML 0 · tridimensional 0 · "3D" 1** (an ecosystem-services layer) | `LIDAR` → **49** (incl. an **MDS−MDT 1 m nDSM**, 2012) |
| **C. Valenciana** (ICV CSW) | `catalogo.icv.gva.es/geonetwork/srv/spa/csw` | 14:53 | **CityGML 0**; "tridimensional" 11 → 8 are shade-maps/rail; **2 are `Cartografía tridimensional por municipios de la Comunitat Valenciana` (2009, 2017)** — see the NOT-CONFIRMED list | `LiDAR` → **87** |
| **Catalunya** (ICGC) | `www.icgc.cat/en/Innovation/Projects/Custom-projects/3D-city-models` | 14:33 | 3D city models are **custom/commissioned projects**, *"in 3D city models we work between LOD1 and LOD3"*, formats *"GML3, CityGML, DAE…"* on request; three fulfilled models (Barcelona, Vilafranca del Penedès, Riudoms). **No open regional dataset** | page is the ICGC's own service description |
| **Navarra** (foral, own file server) | `filescartografia.navarra.es/` + `/1_…/`, `/2_…/` | 14:30–14:31 | 9 top-level folders: topográfica (CAD/SIG/BTA/BTU), temática, ortofoto, **LiDAR**, **MDE**, … **no 3D/CityGML building product** | directory listing is the server's own index |
| Curated global list | `raw.githubusercontent.com/OloOcki/awesome-citygml/main/README.md` | 14:38 | **Spain has exactly ONE entry: Barcelona** ("Buildings in LoD1 and LoD2 available… under Products under the download link") | — |

⇒ **VERDICT (Q7, LoD2 axis): Spain has NO national and NO regional LoD2. It has two city products.**
The one open lead is C. Valenciana's *Cartografía tridimensional por municipios* — flagged, not claimed.

---

### L3-3 · The two Spanish city LoD2 products — PROBED, with their own caveats

**Madrid — Ayuntamiento de Madrid, Dpto. de Cartografía. Class A (keyless bulk).**
- Metadata `geoportal.madrid.es/IDEAM_WBGEOPORTAL/xml?id=ece2d15a-d16f-46e8-aaec-9576771b9997`
  (HTTP 200, 22,017 B, 14:44:44 UTC), revision date **2025-04-01**, EPSG:25830.
- Its own words: *"El proceso de extrusión para generar la geometría en 3D se realiza a partir de la
  **restitución de todas las líneas de cubierta** … a escala 1:1000. Se obtiene un nivel de detalle
  **LOD2** … de **gran precisión geométrica en cubierta**."*
- Update frequency **"Cuatrimestralmente"**. Formats: I3S/SLPK, **Shapefile Multipatch por distritos**,
  **OBJ por edificio**, plus 2D polygon layers (`01_EDIFICIO_P`, `01_PORCHE_CASETA_COBERTIZO_P`,
  `01_MARQUESINA_P`, `06_ASCENSOR_P`, …) sharing a join key **`ID_3D`**.
- **Downloads are keyless** (HEAD, 14:46 UTC):
  `…/3D_EDIFICACIONES_CONSTRUCCIONES/I3S_SLPK/MODELADO_3D_MADRID.zip` → **200, 1,550,079,032 B,
  Last-Modified 2025-06-25**; `…/EDIFICACIONES_CONSTRUCCIONES_2D_P.zip` → **200, 36,152,423 B, 2025-06-26**.
- **Licence GREEN**: `datos.madrid.es/pages/condiciones-generales-ayuntamiento-de-madrid` — reuse
  *"para fines comerciales y no comerciales"*, transformation allowed, attribution *"Origen de los
  datos: Ayuntamiento de Madrid"* required (Ley 37/2007 framework; no named CC licence).
- ⚠ **The LoD2 label is not uniform across vintages.** The 2016 dataset's own metadata
  (`id=2b0b5161-…`, 14:44 UTC) says: *"Para el LOD2 se han utilizado modelos de cubiertas **(sin
  precisión geométrica)** con la nube de puntos … para dar una apariencia más realista."* Cosmetic
  roofs in 2016; measured roofs claimed in the 2025 product. **Never treat "LoD2" as a quality
  guarantee without reading the vintage's own lineage** — the same defect shape as SURVEYED-vs-NORMATIVE.

**Barcelona — CartoBCN (Ajuntament / IMI). Class A geometry, licence NOT CONFIRMED.**
- Catalogue ATOM `w20.bcn.cat/cartobcn/atom.ashx` (HTTP 200, 154,380 B, 14:34 UTC) — **70 products**.
- **prod 145 "Model Tridimensional d'edificacions" (SLPK, whole city)**, data date **2025-12-13**,
  feed updated 2026-04-30; **prod 146 "…CAD 3D" (DWG 3D, per barri, 73 files)**, data **2026-04-01**.
- Downloads are plain `getFile.ashx?prod=…` links; two unrelated products were fetched anonymously
  this lane (7.9 MB and 6.4 MB) with **no login, no CAPTCHA, no cookie**.
- ⚠ **Licence NOT CONFIRMED**: the ATOM carries no `<rights>`; the CartoBCN web UI has a
  registration flow with *"He llegit i accepto les condicions d'ús"* that the ATOM/getFile plane does
  not enforce. **Read those conditions before shipping anything derived from CartoBCN.**

---

### L3-4 · Catastro's real attribute density — MEASURED city-wide (Barcelona 08900)

Downloaded `https://www.catastro.hacienda.gob.es/INSPIRE/Buildings/08/08900-BARCELONA/A.ES.SDGC.BU.08900.zip`
(HTTP 200, **44,624,867 B**, Last-Modified **2026-02-20**, fetched 14:58 UTC) and streamed the GML.

| File | Uncompressed | Features | Populated |
|---|---|---|---|
| `…building.gml` | 337,608,527 B | **69,897 Buildings** | `currentUse` ≈ 69,690 (**99.7 %**) · `numberOfDwellings` ≈ 69,897 (**100 %**) · `numberOfBuildingUnits` ≈ 69,896 · `dateOfConstruction` ≈ 69,895 · `OfficialArea` **69,895** · `conditionOfConstruction` ≈ 69,894 · `horizontalGeometryEstimatedAccuracy` ≈ 69,896 |
| | | | ⛔ **`numberOfFloorsAboveGround` populated at Building level: ZERO.** Every occurrence is `<bu-ext2d:numberOfFloorsAboveGround xsi:nil="true" nilReason="other:unpopulated">` — the literal open tag `<bu-ext2d:numberOfFloorsAboveGround>` occurs **0 times in 337 MB** |
| `…buildingpart.gml` | 813,923,927 B | **319,098 BuildingParts** | `numberOfFloorsAboveGround` ≈ **319,092 (99.998 %)** · `numberOfFloorsBelowGround` ≈ 319,096 · `conditionOfConstruction` 319,098 · `heightBelowGround uom="m"` present |
| `…otherconstruction.gml` | 2,427,714 B | (pools etc.) | `conditionOfConstruction` ≈ 1,179 |

> **Method honesty:** element counts are open/close **tag-pair** counts over a streamed read with a
> 200-char chunk overlap, so they carry a **small upward bias (<0.01 %)** — hence "≈". The two
> load-bearing readings are bias-free: the Building-level floors count is an **exact 0**, and the
> part-level ratio is 638,184 tag matches over 319,098 parts.

⭐ **This promotes ES-1.2 from a one-parcel observation to a city-wide structural fact:** in Catastro,
**floors live on the PART, never on the BUILDING**, and the part-level population is effectively
total. Any adapter that reads `Building.numberOfFloorsAboveGround` reads a nil for every building in
Barcelona and will silently produce zero-storey massing (**failure and empty are the same value** —
MEMORY *context-data-honesty-family*).

⚠ **And the bulk channel is 6 months stale at probe time.** P5 documents refreshes in the first week
of **February and August**; the Barcelona file served on 2026-09-01 is dated **2026-02-20**. The
August-2026 refresh had not landed. *(Live currency requires the WFS — i.e. the plane that is
IP-blocked in L3-0. That tension is the real operating constraint for Spain.)*

---

### L3-5 · Overture in Spain — MEASURED, and one attractive hypothesis REFUTED

**Overture buildings, release `2026-08-19.0`** (release listing probed on the public S3 bucket at
14:31 UTC: only `2026-07-22.0` and `2026-08-19.0` present), queried with DuckDB 1.5.5 httpfs over
`s3://overturemaps-us-west-2/release/2026-08-19.0/theme=buildings/type=building/*`, bbox
**2.19–2.21 E / 41.395–41.41 N** (≈2.8 km² around audited parcel `2940601DF3824B`), 14:47 UTC:

| n | height | num_floors | num_floors_underground | roof_shape | subtype | class |
|---|---|---|---|---|---|---|
| **2,586** | 332 (**12.8 %**) | **2,342 (90.6 %)** | 382 (14.8 %) | 71 (2.7 %) | 2,299 (88.9 %) | 2,287 (88.4 %) |

By first source dataset: **OpenStreetMap 2,529 (97.8 %)** — height 314, floors 2,310 ·
**Instituto Geográfico Nacional (España) 39** — height 0, floors 32 · **Microsoft ML Buildings 18** —
height 18, floors 0.

- Overture's attribution page (fetched 14:38 UTC) names a Spanish official source verbatim:
  *"Work derived from **BTN 2024** ign.es. Available under **CC BY 4.0**"*.
- Cross-check with lane 1 §F: PRYZM measured **73.2 % height-or-floors citywide in Barcelona**
  (2026-07-24). My 90.6 % is a **central, denser bbox on a newer release** — a different scope, not a
  contradiction. Do not average the two.

⛔ **The hypothesis I formed and then had to drop.** "Overture's Spanish floors are Catastro
laundered through OSM under ODbL" is **NOT CONFIRMED — and the evidence points against it.**
Overpass (`overpass-api.de/api/interpreter`, 14:50–14:51 UTC), same bbox: **2,087 OSM building
ways**, **1,898 with `building:levels`**, but only **3** with a `source` matching `atastro`. The
provenance of those levels is **not established**. State it as unknown; do not claim Overture ES is
derivative of Catastro, and do not claim it is independent of it either.

⇒ **Overture stays class D for Spain** (conflated, mostly OSM, ODbL-entangled), useful as backbone
and as a GERS join target (the ES **GERS bridge to IGN-España** exists — `e5-oss-delta.md` D1), never
as the authoritative floors source when Catastro's part-level floors are one HTTP call away.

---

### L3-6 · Q9 — does Catastro expose ANY machine-readable planning content? **NO.**

The expectation in the brief was "no beyond incidental hints". Confirmed, with the field-level
evidence. Five independent readings:

**(a) The bulk interchange format carries none.** `catastro_fin_cat_2006.pdf` — *Formatos de
Intercambio, fichero CAT* (fetched 14:39 UTC, 733,420 B, 26 pp., text-extracted):
- **Tipo 11 (Finca/parcel)**: delegación/municipio codes, parcel ref, address, polígono/parcela
  rústica codes, paraje, **superficie de la finca**, **superficie construida total / sobre rasante /
  bajo rasante / cubierta**, X/Y. Then a long run of *"campo intencionadamente en blanco"*.
  **No classification, no use, no buildability, no height, no plan reference.**
- **Tipo 14 (Construcción)**: bloque · escalera · **planta** · puerta · **código de destino** ·
  año de reforma · **año de antigüedad efectiva** · superficie del local · superficie de porches y
  terrazas · **"Tipología constructiva según Normas Técnicas de Valoración"** — a **valuation**
  typology, not a planning typology.
- The only "class" field anywhere: **"Clase del Bien inmueble (UR, RU, BI)"** (tipos 13 and 15).
- "Zona de valor / tramo de ponencia" appears **only** as a reason to split unidades constructivas —
  it is **not a delivered field**. And P5 already established the free bulk CAT excludes valor catastral.

**(b) The per-parcel query service carries none.** Full JSON key set of
`Consulta_DNPRC?RefCat=2255404VK4725E` (the audited Madrid parcel), read 14:42 UTC via the
independent vantage point: `consulta_dnprcResult, control, cudnp, lrcdnp, rcdnp, rc, pc1, pc2, car,
cc1, cc2, dt, loine, cp, cm, cmc, np, nm, locs, lous, lourb, dir, cv, tv, nv, pnp, loint, pt, pu, dp,
dm, debi, luso, sfc, cpt, ant`. **No planning designation, no buildability, no height, no setback, no
alignment.** `luso` is the **use of the unit** (Comercial/Residencial) — it is *not* a land
classification; `sfc` is built area; `ant` is the year (1925 here).

**(c) The one incidental hint, stated precisely.** The cadastral **UR/RU** flag *is* derived from
planning — TRLCI (RDLeg 1/2004) **art. 7.2**, consolidated text read at BOE 14:42 UTC:
*"Se entiende por suelo de naturaleza urbana: a) **El clasificado o definido por el planeamiento
urbanístico como urbano, urbanizado o equivalente**…"* — but it is a **two-values-plus-BICE tax
flag**, carries **no parameter**, and lags the plan. It tells you which side of a line a parcel is on;
it never tells you what may be built.

**(d) The naming trap that will fool a reader: `CP:CadastralZoning` is NOT zoning.** The DGC's own
CP-WFS spec `catastro.hacienda.gob.es/webinspire/documentos/inspire-cp-WFS.pdf` (fetched 14:57 UTC)
defines the stored query **`GetZoning`** as *"**Manzanas** de urbana y **polígonos** de rústica"*,
keyed `COD_ZONA` (urban 12 digits = manzana(5)+PCAT2(7); rustic 9 = del+mun+sector+polígono), with
`GetParcelsByZoning` returning the parcels inside. The CP WFS declares exactly two feature types —
`cp:CadastralParcel` and `cp:CadastralZoning` (GetCapabilities read 14:56 UTC). **This is cadastral
SUBDIVISION, not land-use zoning.** An adapter that maps `CadastralZoning` → "zoning" ships a
category error with an INSPIRE citation attached.

**(e) The valuation apparatus — and why a ponencia coefficient is NOT a planning rule.**
RD 1020/1993 (Normas Técnicas de Valoración), BOE consolidated text read 14:41 UTC. Norma 9/16 do
embed buildability: VUB is derived from VRB *"considerando la **edificabilidad de la parcela tipo
definida por el planeamiento**"*. ⭐ **But the same norm authorises a surveyed substitute:** the
street-level value may use an edificabilidad *"definida por el planeamiento … **o por la media de las
edificabilidades existentes; o por la edificabilidad más frecuente** en las edificaciones más
representativas de la calle, tramo de calle, zona o paraje"*, and where no repercusión exists the
unit value is fixed *"en función de las circunstancias urbanística y de mercado"*.
⇒ **A ponencia's implied edificabilidad may be the MEAN OR MODE OF WHAT ALREADY STANDS.** It is a
tax-valuation input, it is not published per parcel in any free machine-readable channel, and reading
it as permitted buildability would be the exact SURVEYED-as-NORMATIVE overstatement the
never-overstate gate forbids. **Never derive an envelope, a height or a GFA allowance from it.**

> **Q9 verdict — NO.** Catastro exposes: SURVEYED use, dwellings, units, year, official area,
> per-part floors above/below ground, condition, footprints, facade photos, per-floor FXCC where it
> exists (P4/P6). It exposes **zero** normative planning content: no designation, no edificabilidad,
> no altura máxima, no retranqueos, no alineaciones, no envelope, no protection status. What looks
> like planning content (`Clase UR/RU`, `CadastralZoning`, the ponencia typologies) is
> classification-derived, subdivision, or valuation.

---

### L3-7 · Q10 — the combine-with list, ranked by adapter cost vs coverage

**Two rows are new and probed this lane. The rest are repo/lane rows, cited not re-derived.**

#### ⭐ NEW · R1 — Barcelona CartoBCN "**Temàtic Planejament Urbanístic — GIS**" (product 107)

`http://w20.bcn.cat/CartoBCN/getFile.ashx?prod=107.BARCELONA.2` — HTTP 200, **6,447,529 B**,
downloaded anonymously 14:36 UTC; its ATOM entry shows updated **2026-09-01T03:10:02Z** (a **daily**
refresh). One shapefile, **21,298 qualification polygons for the whole city**, and the schema is the
Barcelona PGM ordinance itself. **MEASURED population over all 21,298 rows:**

| Field | Populated | Sample | Reading |
|---|---|---|---|
| `CLAU` (qualification key) | **21,298 / 100 %** | `7a`, `18`, `13b`, `6b` — **669 distinct** | the join key to the PGM ordinance |
| `CLASSIFIC` | 100 % | `SUC` / `SUNC` / `SNU` | land classification |
| `CODI_PLA` | 100 % | `PGM` | governing plan |
| `NOM_CLAU` | 15,166 (71 %) | *"Zona en densificació urbana semiintensiva"* | |
| `USOS` | 11,419 (53.6 %) | Art. 306 use lists, free text | |
| `TIPUS_ORD` | 8,144 (38.2 %) | `ALINEACIONS DE VIAL` 4,624 · `VOLUMETRIA ESPECIFICA` 1,481 · `EDIFICACIÓ AÏLLADA` 1,052 | ⭐ the ordination type — the branch PRYZM's envelope engine needs first |
| **`ALCADES`** | **7,745 (36.4 %)** | `6,10 m (PB+1)` · `PB+4P (17.70 m.)` · `PB+6P\r\nPB+7P` · **`Veure plànol 26`** | ⛔ **free text, multi-valued, and sometimes a POINTER TO A DRAWING** |
| `NP` (nº plantes) | 5,665 (26.6 %) | `B`, `B+4`, `B+5` | |
| `FAC_MN` | 3,096 (14.5 %) | `5.00` | |
| `DENSITAT` | 3,391 (15.9 %) | *"1 viv. per cada 1000 m…"* | |
| `EDIFIC` | 1,354 (6.4 %) | `1.00` | |
| `ARM` (alçada reguladora màxima) | 1,337 (6.3 %) | `8.50`, `16.10` | |
| **`FONDARIA1/2/3/4`** | **170 / 31 / 14 / 0 → 0.8 %** | `19.50`, `11.25` | ⛔ **profunditat edificable is essentially ABSENT** |
| `SOSTRE_MAX`, `CO_ED_BRUT`, `SUPERFICIE`, `NOM_PLA`, `DATA_AD`, `ESTAT` | **0** | — | schema present, corpus empty |

⭐ **Two findings PRYZM should act on.**
1. This is an **official, keyless, daily-refreshed, city-wide alternative/complement to the AMB Refós
   WFS** PRYZM already uses in production — with `TIPUS_ORD` and `ALCADES` carried as attributes.
2. ⭐ **It independently corroborates the repo's Barcelona depth saga** (MEMORY
   *barcelona-edificabilitat-is-a-construction*): **the municipality's own planning delivery carries
   profunditat edificable on 0.8 % of polygons.** The depth PRYZM computes is not a missing lookup —
   **the datum does not exist in the plan's vector layer**, so constructing it was correct.
   Equally: `ALCADES` at 36 % populated is **not** 36 % machine-usable — `Veure plànol 26` is a
   refusal, not a height (`CLAU 18`, 3,303 polygons, is exactly this case).

⚠ **And the trap next door:** CartoBCN product **105 "Planejament Urbanístic — GIS"** (same daily
cadence, 7,920,804 B, fetched 14:33 UTC) looks like the same thing and is **not**: it is a **CAD
conversion** — `LINIES` (69,560 drawing lines), `POLIGONS` (**114 rows**), `PUNTS` — and across those
114 polygons **the only populated normative field is `CLASSIFIC`**; `CLAU`, `SOSTRE_MAX`, `ALCADES`,
`EDIFIC`, `FONDARIA*`, `TIPUS_ORD`, `USOS` are **0/114** despite all being in the schema. Picking 105
over 107 would ship a source that looks rich and is empty (*a field name proves nothing* —
ES-ALL-REGIONS §3/§4).

#### ⭐ NEW · R2 — SIU national WFS: **alive, but not where the INSPIRE catalogue says**

- The catalogued endpoint is **DEAD**: `mapas.fomento.gob.es/arcgis/services/SIU/**Servicios_OGC_SIU**/MapServer/WFSServer`
  → **HTTP 499 ArcGIS Server Error**; the REST twin → `{"error":{"code":404,"message":"Service
  SIU/Servicios_OGC_SIU/MapServer not found"}}` (14:53–14:54 UTC). The older documented host
  `visorsiu.fomento.es` and `mapas.mivau.gob.es` **do not resolve**.
- The service **exists under a different name**: `…/arcgis/rest/services/SIU?f=json` lists 25 services
  (`CLASES_DE_SUELO`, `Planeamiento_Vigente`, `Grado_de_Desarrollo`, `Antigüedad_Planeamiento`, …);
  the live WFS is **`…/arcgis/services/SIU/Servicios_OGC/MapServer/WFSServer`** — GetCapabilities
  **HTTP 200, 20,083 B, WFS 2.0.0**, 19 feature types (14:54 UTC).
  *(Textbook* MEMORY *bulk-vs-query-endpoint-false-refusals: the refusal was about the wrong product name.)*
- **What it actually serves (DescribeFeatureType, all probed 14:55 UTC):**
  `OGC_Clases_Suelo` → `ProvINE, **ClaseSuelo**, NuclRural, FechaBaja, AreaLambert, Shape` ·
  `OGC_Sectores` → `ProvINE, **IdSector**, FechaBaja, Shape` (**and nothing else**) ·
  `OGC_Recintos` → `ProvINE, IdSector, **UsoSuelo**, FechaBaja, Shape` · `OGC_Areas_Urbanas` →
  `COD_AU, NOMBRE_AU` · plus SIOSE/CORINE series.
- **Live data confirmed, not just declared:** GetFeature bbox over the audited Madrid parcel returned
  `numberMatched="2"`, e.g. `ProvINE 28079 · ClaseSuelo "SISTEMAS GENERALES Y OTROS" · NuclRural 0`.
- **Licence GREEN**: the IDEE INSPIRE record (`idee.es/csw-inspire-idee/home/api/records/spamfomwfsvivenda`,
  14:47 UTC) states access *"Sin limitaciones al acceso público"* and use constraint **CC BY 4.0**.
- ⭐ **Refinement of the repo's §0 SIU finding:** the repo says the national model carries
  *"sector · land type · surface · use · **edificabilidad** — at SECTOR level"*. **The WFS carries the
  geometry and the ids only** — `IdSector` with no attributes at all. The edificabilidad lives in the
  SIU's separate **alphanumeric (Excel) products**, joinable on `IdSector`. So the national row is
  *"geometry service + spreadsheet join"*, not *"a WFS with buildability in it"*. **Do not rank SIU as
  a live parameter source.**

#### The ranked list (cost = adapter effort to first correct envelope input; coverage = territory)

| # | Source | Coverage | What it gives | Cost | Class · Licence | Verdict |
|---|---|---|---|---|---|---|
| 1 | **Madrid CM `idem.comunidad.madrid/geoserver3/wfs` · `sitcm:VPLA_V_ORDENANZA`** (repo MEASURED 93,839 feats, altura 70.2 % / plantas 72.9 % regionally; **capital only 3.6 %**; lane ES-B probed the audited parcel) | 1 CCAA, 6.7 M people | ordenanza + NZ/grado + tipología + `IT_ATICO` retranqueo + plan citation | **LOW** — already probed end-to-end | A · GREEN | **wire first**; ⚠ **query in EPSG:25830 — a 4326 bbox returns 0 features silently** |
| 2 | **Barcelona CartoBCN prod 107** (NEW, above) | 1 city | 21,298 qualification polygons, `CLAU` 100 %, `TIPUS_ORD` 38 %, `ALCADES` 36 % (text) | **LOW** — one keyless ZIP, daily | A · **licence NOT CONFIRMED** | **wire after reading the conditions**; complements AMB Refós |
| 3 | **AMB Refós `qualificacio_refos_3857`** (repo, PRYZM production) | 36 munis (27 with PGM) | qualification (clau) polygons | **ZERO** — already live | A · GREEN | keep as the Barcelona primary; 107 is the cross-check |
| 4 | **Región de Murcia municipal GeoServer** — `Edificabilidad` + `Enlace_ficha`, and **alineaciones published as geometry** (repo MEASURED; MEMORY *murcia-pgou-ejes-is-road-axis*) | 1 CCAA | the only measured ES **alineación** geometry | MED — per-muni | A · GREEN | the alignment pilot; ⚠ `pgou_ejes` is a **road axis, not an alignment** |
| 5 | **SIU national WFS `Servicios_OGC`** (NEW, above) + SIU Excel join | **NATIONAL** | `ClaseSuelo`, sector/recinto geometry + `UsoSuelo`; edificabilidad only via the Excel join | LOW for geometry, MED for the join | A · **CC BY 4.0** | the **national classification spine**; never a parameter source |
| 6 | **C. Valenciana `terramapas.icv.gva.es` zonificación** (repo grade **READ**, not probed) | 1 CCAA | ordinance codes, semantics unbound (D-004) | MED | A? · GREEN | **owed: one probe** to move READ→MEASURED |
| 7 | **Illes Balears MUIB `CODIAJ` + per-feature normativa URL** (repo READ) | 1 CCAA | code + document link | MED | A · — | ⚠ repo notes `OBS`: **Eivissa rows not in force** |
| 8 | **Galicia SIOTUGA** (repo MEASURED: serves **classification only**; Anexo 3 *mandates* ordenanza/altura/edif) | 1 CCAA | classification now; parameters mandated, not served | HIGH (wait) | A(thin) · — | **SCHEMA-MANDATED-NOT-SERVED** — monitor |
| 9 | **Andalucía SITUA/VITUA** (repo MEASURED: `EDIF_*`+`DENS`, **no altura/plantas**, template ships **0 rows**; Normas Directoras in force 24-04-2026, **forward-only**) | 1 CCAA | schema only, today | HIGH | A(empty) · — | monitor; new plans only |
| 10 | **Aragón ICEARAGON WMS GetFeatureInfo** (repo MEASURED: `edificab` non-zero **1.3 %**, `aprove` **0.0 %**) | 1 CCAA | classification 100 %, parameters ~0 | HIGH | A(thin) · — | document-rule region |
| 11 | **Extremadura CICTEX** (repo MEASURED: `CALIFICACION_*` returns **`msGeometry` and nothing else**) | 1 CCAA | geometry only | HIGH | A(empty) · — | document-rule region |
| 12 | **Castilla y León SIUCyL** (repo READ) | 1 CCAA | region **vectorises determinations itself** | MED | ⚠ metadata: *"sin validez jurídica, carácter informativo"* | usable as a lead, never as the norm |
| — | **País Vasco / Navarra** | foral | **outside DG Catastro entirely** — separate cadastre AND planning adapters. Navarra's own file server carries a `SISTEMA_INFORMACION_URBANISTICA_NAVARRA…E1000_2000_2003` folder (vintage **2000–2003**) | HIGH | — | fence the national assumption |

**Geometry side to pair with all of the above (repo, no new probe needed):** Catastro CP parcels
(`parcelZoningProxy.js`, live) · Catastro BU parts+floors (L3-4) · **MDSnE** national building-height
nDSM + `fetchSpainBuildingHeights` / `stampMdsHeightsOnGeojsonseq` (re-verified in
`impl/e3b-state-heights-verdict.md`) · PNOA LiDAR 3rd coverage. Three independent SURVEYED height
signals before any normative reading — none of them a permitted height.

> **Q10 verdict.** The cheapest correct pairing today is **Catastro parcel + building geometry
> (national, A) × per-CCAA planning attributes (A only in Madrid, Catalunya, Murcia; F elsewhere)**,
> with **SIU as the national classification spine** and **PRYZM computing the envelope**. Spain does
> not have — at any level of government — a national machine-readable parcel-level buildability
> service. Nothing found this lane changes that; two rows (Barcelona 107, SIU `Servicios_OGC`) make
> the reachable part cheaper, and one (the SIU catalogue URL) shows how easily a dead link masks a
> live service.

---

### L3-8 · NOT CONFIRMED — the honest gaps this lane leaves open

1. **C. Valenciana "Cartografía tridimensional por municipios" (2009 + 2017)** — found in the ICV
   catalogue (`spaicvCartografiaTridimensional2017`, 14:53 UTC); its geometry content was **not
   probed**. It is a 3D *topographic restitution* by name, **not** a CityGML/LoD2 building product,
   but that is an inference. **One probe owed** before the "no regional LoD2" line is closed for CV.
2. **CartoBCN licence** — no `<rights>` in the ATOM; the UI's `condicions d'ús` text was not read.
   Gating for row 2 of the Q10 ranking and for the Barcelona 3D model.
3. **Overture ES floors provenance** — 90.6 % populated, 97.8 % OSM-sourced, only 3/2,087 OSM ways
   carry a `catastro` source tag. Where the levels come from is **unknown**.
4. **Madrid/Barcelona LoD2 roof accuracy** — the 2025 Madrid metadata *claims* "gran precisión
   geométrica en cubierta"; the 2016 vintage admits "sin precisión geométrica". Neither was verified
   against ground truth this lane.
5. **Like-for-like Catastro vs Overture on an identical bbox** — Catastro was measured city-wide
   (69,897 buildings / 319,098 parts), Overture on a 2.8 km² bbox (2,586). **No ratio between the two
   is stated, because none was measured.**
6. **Ponencia de valores publication channel** — `sedecatastro.gob.es/Accesos/SECAccPonencias.aspx`
   returned **404** (14:45 UTC). Whether ponencias are downloadable, and in what form, is not
   established. It does not change Q9: RD 1020/1993 already shows the coefficient is not normative.
7. **The OVC block** — 7.5 h and counting; whether it clears in 12 h, 24 h, or needs a request to the
   DGC is **not measured**. Do not re-probe that host from a production IP to find out.
