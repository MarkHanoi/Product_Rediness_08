# ES-CATASTRO-3D — working investigation log

> Lane: SPAIN CATASTRO 3D AS-IS · probed 2026-09-01 · brief: `../ES-CATASTRO-3D-BRIEF.md`.
> Raw responses in scratchpad `es3d/` (session-local). PROBED = live request made and read.
> Delta-only: does NOT re-derive lane `spain-france-portugal.md` ES-1 probes of 2026-08-31.

## P1 · INSPIRE Building WFS (`ovc.catastro.meh.es/INSPIRE/wfsBU.aspx`) — PROBED 2026-09-01 ~06:56–07:10 UTC

- GetCapabilities: HTTP 200 (16,182 B) — after one transient 400. Declares feature types
  `bu:Building`, `bu:BuildingPart`, `bu:OtherConstruction` and operations GetCapabilities /
  DescribeFeatureType / ListStoredQueries / DescribeStoredQueries / GetFeature.
- ⭐ **DescribeFeatureType, ListStoredQueries, DescribeStoredQueries ALL return HTTP 400**
  ("No se puede procesar su petición" HTML, 2,189 B) in every tried casing/param variant —
  **declared-not-served**. Schema knowledge must come from the published XSD/documentation,
  not the service. (GetCapabilities-is-not-an-inventory, inverted: here even the standard
  introspection ops are dead.)
- Call shape that the repo PROVES works (prod `parcelZoningProxy.js:318`): misspelled
  `STOREDQUERIE_ID=` + uppercase `REFCAT=` + `srsName=EPSG:4326`.
- ⭐⭐ **SOFT-BLOCK MEASURED**: after ~20 requests in ~10 min (mix of valid + malformed),
  the ENTIRE ovc.catastro.meh.es INSPIRE family started answering HTTP 400 (same "No se
  puede procesar su petición" page) — including the exact GetCapabilities URL that had
  returned 200 five minutes earlier, and the production-proven CP `GetParcel` shape.
  This is an IP-level soft-block or WAF trip, NOT a malformed request. Recovery time:
  being measured (see P1b). Implication for Q3: burst tolerance is LOW (tens of requests);
  PRYZM's 7-day-cache proxy survives because its steady-state rate is tiny.

## P2 · Licencia.pdf — FETCHED AND READ (closes founder item 10b for Catastro) — 2026-09-01

Source: `https://www.catastro.hacienda.gob.es/webinspire/documentos/Licencia.pdf` (HTTP 200,
100,483 B, fetched 2026-09-01 ~07:15 UTC). "LICENCIA DE ACCESO Y USO DE LOS SERVICIOS Y
CONJUNTOS DE DATOS INSPIRE DE LA DIRECCIÓN GENERAL DEL CATASTRO — CP · AD · BU — Versión 1.0,
Julio 2016". Terms in substance:

1. Massive download + web-service access authorised for (a) the licensee's OWN USE, or (b)
   making and distributing NEW VALUE-ADDED PRODUCTS from cadastral info **provided the
   licensee TRANSFORMS it**. Public use INCLUDING COMMERCIAL of TRANSFORMED info is
   authorised (art. 21 TRLPI test: the modification must produce a DIFFERENT WORK).
   **Redistribution of the ORIGINAL untransformed info is FORBIDDEN** ("no se autoriza la
   difusión, distribución o comercialización de la información original suministrada, que no
   puede ser difundida por Internet… sin su previa transformación").
2. No warranty of currency/correctness; no obligation to update prior downloads.
3. DGC not liable for derived products; derived data carries NO fehaciencia (evidentiary
   status); transformation must not alter content or denaturalise meaning; derived products
   MUST NOT be identified as "cartografía catastral"/"información catastral" or confusable terms.
4. **Suspension clause**: the service may be suspended per-user AUTOMATICALLY when
   "intensidad, frecuencia" of access degrades other users — exactly the behaviour measured
   in P1 (the soft-block is CONTRACTUAL, not just infrastructural).
5. Revocation for misuse (art. 78 RD 417/2006; appeal via art. 54 Ley del Catastro).

⭐ **CORRECTION to lane ES-1.5**: the lane recorded "CC BY 4.0 per the DG Catastro licensing
resolution (effective 2023)". **The service metadata says otherwise**: all 53 DG Catastro
entries in the BU ATOM feed carry `<rights>Copyright (c) 2012, ES.SDGC; all rights
reserved</rights>`; the ONLY CC-licensed entries in that feed are the FORAL ones (Navarra =
CC BY 4.0, Bizkaia = CC BY 3.0 ES). No 2023 CC BY resolution was found by search
(2026-09-01). Working verdict: **DG Catastro = custom transformation-required licence**;
the CC BY 4.0 belief likely conflates IGN/CNIG (PNOA/MDSnE, genuinely CC BY 4.0) or the
foral feeds with DG Catastro.
- **For PRYZM: GREEN-for-purpose** — PRYZM's products (3D reconstruction, envelopes, zonal
  stats, massing) are unambiguous transformations; attribution "© Dirección General del
  Catastro" already shipped. **RED for**: re-serving raw GML/FXCC/KML tiles, or branding
  anything "cadastral cartography". Never call the derived model authoritative-cadastral.

## P3 · inspire-bu-WFS.pdf (service spec v1.0 Jul-2016) — READ 2026-09-01

- Stored queries (exact ids): `GetBuildingByParcel`, `GetBuildingPartByParcel`,
  **`GetOtherBuildingByParcel`** (returns BU:OTHERCONSTRUCTION). Params `REFCAT` (M),
  `SRSNAME` (O). Doc's own examples use `STOREDQUERIE_ID` (the misspelling is canonical).
- ⭐ **BBOX GetFeature IS supported on wfsBU** (`typenames=BU.BUILDING|BU.BUILDINGPART|
  BU.OTHERCONSTRUCTION&bbox=…`), limited to a **4 km² box and 5,000 elements**; no generic
  SQL/filter queries. (The repo's "ID-keyed only" note is about wfsCP parcels.)
- SRS: 4326, 4258, 25829/25830/25831, 3857/3785.
- Completeness: **95% of DGC territory** (= all Spain EXCEPT País Vasco + Navarra, foral).
- Production scale: **urban 1:1000 or better; rustic 1:5000 or better** (the accuracy answer).
- Freshness: served LIVE from the cadastral DB "actualizados al momento de la invocación".
- Schema: `inspire.ec.europa.eu/draft-schemas/bu-ext2d/2.0/BuildingExtended2D.xsd` (extended-2D
  draft profile — the "ext2d" namespace the GML uses).
- DescribeFeatureType/ListStoredQueries documented as supported — but P1 measured them 400
  (declared-not-served or blocked-state artifact; retry post-recovery).

## P4 · "Catastro 3D en Internet" (Virgós/Olivares, DGC, JIDEE 2008) — READ 2026-09-01
Source: `https://idee.es/resources/presentaciones/JIDEE08/ARTICULOS_JIDEE2008/Articulo76.pdf`.
The DGC's own engineers describing how BOTH 3D products are generated. This is the
Q4/Q5/Q6 authority:

- **Volumetría storage model**: cadastral cartography stores, per recinto (constru/subparcela),
  a ROMAN-NUMERAL floor code concatenating below/above-ground counts (e.g. `-I+VII` = 1
  basement + 7 floors). Nature codes for non-volumetric constructions: PI (piscina), FUT,
  POR (porche), TZA (terraza), etc.
- ⭐ **The 3 m/floor constant is baked in AT SOURCE**: "Este valor se multiplicará por 3
  metros, como media bastante real de… la altura de una planta". BOTH the parcel KML
  (extruded recintos) and the FXCC-floors KML (per-local volumes: floor polygon + same
  polygon raised 3 m + vertical wall planes) use fixed 3 m. **No real floor height exists
  anywhere in the cadastral DB** — the paper lists "la altura real de cada local" as a known
  limitation, along with: prisms only, everything rests ON the terrain (no floating volumes
  at a given floor), no pitched/inclined roofs, basements cannot render below the terrain
  model, churches (1 floor > 3 m) wrong.
- **FXCC-by-floors semantic richness**: per REAL floor (SOTANO -2 … BAJA 00 … PISO NN, plus
  PLANTA GENERAL), per LOCAL (unit) with USO/DESTINO colour symbology (Viviendas, Elementos
  Comunes, Aparcamientos, Almacenes/Trasteros, Comercios, Oficinas, Enseñanza, Turístico,
  Industrial, Deportivo, Piscina, Solar, Público, Religioso, Espectáculos, Otros). Open
  volumes modelled honestly: terrazas = floor + walls <1.5 m; soportales = floor+ceiling no
  walls; pools/courts = floor only.
- **FXCC provenance/coverage**: born from paper Croquis (CU-1) digitisation; FXCC is the
  contractor-delivery interchange format; by 2008 ~3M parcels had FXCC + facade JPG in the
  central Oracle DB ("volumen de información en porcentaje aún no es muy alto") — FXCC
  coverage is PARTIAL BY CONSTRUCTION (exists where a croquis was digitised/delivered).
  Per-parcel FXCC = ZIP { DXF (per-floor vectors, layered) + ASC (attributes) + JPG (facade) }.
- 2008 access note: the OVC "Cartografía 3D" page was registered-users-only then; the KML
  itself viewable in Google Earth. (Current access state probed in P6.)
- KML structure (parcel product): refcat folder → parcel perimeter → SUBPARCELAS (each coded
  `-I+XII` etc.) → placemark with address + OVC hyperlink. FXCC product: refcat folder →
  PLANTA GENERAL + each real floor ascending → per-local 3D models.

## P5 · SEC services guide (v1.11, 23-02-2024) + descarga-masiva licence — READ 2026-09-01

Guide: `https://www.catastro.hacienda.gob.es/ayuda/Guia_de_servicios_SEC_ciudadanos.pdf`.
- **§3 free-without-auth interactive channels** (per-parcel, from the visor pop-up): parcel
  GML · parcel FXCC (planta general, "para TODAS las parcelas", with/without colindantes) ·
  **FXCC por plantas — "si existe para esa parcela"** (conditional coverage, matches P4) ·
  PDF print · **parcel KML — "Con objeto de evitar descargas automatizadas, en el acceso no
  autentificado a este servicio es necesario teclear un código Captcha"** (verbatim) ·
  KML por plantas · building GML. Changelog v1.4 (03-03-2015): the CAPTCHA regime for
  unauthenticated FXCC-por-plantas dates from 2015.
- **§3.1.1.6 Visor 3D** (added v1.11, 23-02-2024): DGC in-browser 3D building model viewer,
  no plugin. Class C (visual-only) per the brief.
- **§3.2 web services**: SOAP/.svc family "orientados a la automatización… pero NO al
  barrido sistemático de la base de datos catastral". ⭐ **DOCUMENTED RATE LIMIT: 7,200
  requests/hour per IP; exceeding it → service denied for FOUR HOURS.** (My P1 soft-block
  tripped at ~20 requests — far below 7,200/h — so the INSPIRE WFS aspx family has a
  SEPARATE, stricter/undocumented WAF trip on top; the 4-hour penalty window is the
  plausible recovery horizon.)
- **§5.6 Descarga masiva (AUTHENTICATED, Cl@ve/certificate)**: whole-PROVINCE downloads —
  CAT format (ALL alphanumeric except ownership + valor catastral; includes per-unit/
  per-floor type-14 construction records) + **shapefile cartography per province** (incl.
  CONSTRU layer with the roman-numeral volumetría) — **refreshed TWICE A YEAR, first week
  of February and August**; each download requires declaring activity/use and accepting
  `licdescargaES.pdf`. §5.9 consulta masiva: batch-XML of refcats → offline job (~1 h).
- **`licdescargaES.pdf` (Licencia de descarga de productos catastrales**, based on
  Resolución 23-03-2011; fetched + read): same transformation regime as P2 licence, PLUS:
  licence term **10 years** (resets on accessing an updated version); worldwide territorial
  scope; IP of the transformed work belongs to its author; **mandatory source citation
  "Dirección General del Catastro" AND the DATE OF ACCESS in every derived product**;
  original untransformed data NEVER on the Internet; formats changeable unilaterally;
  enforcement = cease-and-desist (10–15 days) → BOE-published revocation → Ley 37/2007
  art. 11 sanctions; abusive use → denial of service.

## P6 · INSPIRE ATOM bulk channel — PROBED LIVE 2026-09-01

- Top feed `https://www.catastro.hacienda.gob.es/INSPIRE/buildings/ES.SDGC.BU.atom.xml`
  (HTTP 200, 682 KB): 53 DG-Catastro territorial-office sub-feeds + THE FORAL FEEDS LINKED
  IN THE SAME INDEX (Araba geo.araba.eus, Bizkaia apli.bizkaia.eus CC BY 3.0 ES, Gipuzkoa,
  **Navarra filescartografia.navarra.es CC BY 4.0**) — the national index federates the
  foral cadastres' own ATOMs even though DGC data excludes them.
- Province 08 feed → per-municipality ZIPs. **Downloaded `A.ES.SDGC.BU.08002.zip` (Aguilar
  de Segarra, 130 KB, file dates 2026-02-20 — consistent with the Feb/Aug refresh)**:
  contains `*.building.gml`, `*.buildingpart.gml`, `*.otherconstruction.gml` + ISO metadata.
  Attributes verified in the GML: Building = currentUse, numberOfBuildingUnits,
  numberOfDwellings, conditionOfConstruction (functional/declined/ruin),
  beginLifespanVersion, OfficialArea (m², officialAreaReference + sourceStatus),
  **horizontalGeometryEstimatedAccuracy = 0.1 m (declared)**, externalReference,
  **documentLink → keyless facade-photo GET service**
  `http://ovc.catastro.meh.es/OVCServWeb/OVCWcfLibres/OVCFotoFachada.svc/RecuperarFotoFachadaGet?ReferenciaCatastral=…`;
  BuildingPart = numberOfFloorsAboveGround **+ numberOfFloorsBelowGround** + footprint;
  OtherConstruction = constructionNature (here 23× openAirPool).
  BuildingParts carry NO use; per-unit uses live in DNPRC (lane ES-1.1).

---

# LANE 2 — WHAT THE MODEL ENCODES + THE RECONSTRUCTION QUESTION (brief Q4 · Q5 · Q6)

> Lane 2 · probed 2026-09-01 ~14:30–14:40 UTC · scratchpad `es3d-l2/` (session-local).
> **Delta-only.** Does NOT re-probe P1–P6; cites them by P-number. Where a P-section is
> confirmed independently, that is stated as a SECOND source, not a re-derivation.
> Sample subjects: `2940601DF3824B` (Barcelona) · `2255404VK4725E` (Madrid) — the two
> lane-3 ES-5 parcels — plus municipality-scale statistics from the P6 ATOM channel.

## L2-0 · What this lane added

| # | Evidence | Kind |
|---|---|---|
| a | ATOM BU municipality **08095-GRANOLLERS** (urban, 3,529,939 B, `Last-Modified` 2026-02-21) — 6,030 Building · 27,005 BuildingPart · 288 OtherConstruction, parsed in full | PROBED + measured |
| b | ATOM BU municipality **08002-AGUILAR DE SEGARRA** (rural, 130,627 B) — metadata only, as the urban/rustic control | PROBED |
| c | **`formato_fxcc.pdf`** — the FXCC spec, **version 2024** (not the 2006 edition) | FETCHED + READ |
| d | **`catastro_fin_cat_2006.pdf`** — CAT alphanumeric format, registros tipo 13 + 14 | FETCHED + READ |
| e | **`FICCFormatoUinficado2012.pdf`** — unified cartography format (the volumetría encoding) | FETCHED + READ |
| f | `Consulta_DNPRC` on BOTH audited refcats — **the per-unit FLOOR CODE field**, which lane 3 ES-1.1 did not report | PROBED |
| g | SEC help page `ayuda/informacion_kml_fxcc_gml.htm` (product contents) | FETCHED + READ |

All PDFs at `https://www.catastro.hacienda.gob.es/documentos/formatos_intercambio/<name>`.

---

## L2-1 · Q4 THE DECISIVE QUESTION — **the Catastro model is floors WITHOUT metric heights. CONFIRMED**, from four independent sources

The brief asked to confirm or refute with a citation. **CONFIRMED.** Four sources, three of
them measured rather than read:

**(i) The alphanumeric register carries no height field at all.** `catastro_fin_cat_2006.pdf`,
the CAT interchange format — the complete unprotected alphanumeric cadastral record —
contains **ZERO occurrences of the string "altura"** across all 26 pages. The full
`Datos Físicos` block of **registro tipo 14 (Registro de Construcción)**, the per-floor
per-unit record, is 34 characters and reads verbatim:

| Pos | Len | Fmt | Field |
|---|---|---|---|
| 65 | 3 | X | **Planta** |
| 68 | 3 | X | Puerta |
| 71 | 3 | X | Código de Destino según codificación establecida por la DGC |
| 74 | 1 | X | Indicador del tipo de reforma o rehabilitación (R/O/E/I o blanco) |
| 75 | 4 | N | Año de reforma en caso de existir |
| 79 | 4 | N | Año de antigüedad efectiva en Catastro |
| 83 | 1 | X | Indicador de local interior (S/N) |
| 84 | 7 | N | **Superficie total del local** a efectos de catastro, incluida la que corresponda imputar de porches y terrazas (m²) |
| 91 | 7 | N | Superficie de porches y terrazas del local (m²), a título informativo |
| 98 | 7 | N | Superficie imputable al local situada en otras plantas (m²), a título informativo |
| 105 | 5 | X | Tipología constructiva según Normas Técnicas de Valoración |

There is a floor **identifier**, a use, three areas and a construction typology. **There is no
storey height, no floor-to-floor dimension, no building height, and no ground elevation.**
`Registro tipo 13 (Unidad Constructiva)` is thinner still: its only physical data are
`Superficie de suelo ocupada` (m²) and `Longitud de fachada` (cm) — **it does not even carry a
floor count**; positions 313–414 are explicitly `Campo intencionadamente en blanco/con ceros`.

**(ii) In Catastro's vocabulary "altura" MEANS STOREY COUNT, not metres.** This is the trap
that makes a naive grep look like a hit. `FICCFormatoUinficado2012.pdf` §"Subparcelas",
verbatim: *"Subparcela de construcción **(alturas edificadas)**… Por ejemplo un edificio de dos
**alturas** se codifica **II**."* And the field that holds it is a **24-character TEXT field**:
*"AAAAAAA (A24) 33-56 — Atributo reducido. Si el atributo es de construcción se rellenará con
**las alturas del recinto**…"*. The entire volumetric encoding of the Spanish cadastre is a
roman-numeral string in a text attribute. The same word appears in FXCC as
*"las áreas edificadas **a la altura de la(s) planta(s) reales**"* — i.e. *at the level of*, again
not a dimension. The only genuine metres-and-centimetres "altura" in either cartography spec is
**`Altura del símbolo en décimas de milímetro`** and **`Altura de letra`** — map-symbol
rendering sizes, a pure false positive.

**(iii) MEASURED: the one metric height the national INSPIRE product does serve is a synthetic
restatement of the floor count.** `BuildingPart` carries exactly five `bu-ext2d` elements —
`geometry`, `numberOfFloorsAboveGround`, `numberOfFloorsBelowGround`, `heightBelowGround`. That
`heightBelowGround` has `uom="m"` and looks like a measurement. It is not. Joint distribution
over **all 27,005 parts of Granollers, zero exceptions**:

| `numberOfFloorsBelowGround` | `heightBelowGround` (m) | parts |
|---|---|---|
| 0 | 0 | 20,112 |
| 1 | 3 | 5,207 |
| 2 | 6 | 1,369 |
| 3 | 9 | 312 |
| 4 | 12 | 4 |
| 5 | 15 | 1 |

`heightBelowGround ≡ 3 × numberOfFloorsBelowGround`, exactly, every row. **It carries zero
information beyond the floor count it is computed from.** This independently confirms P4's
finding — *"Este valor se multiplicará por 3 metros, como media bastante real de… la altura de
una planta"* (DGC engineers, 2008) — and shows the same 3 m constant is still baked into the
national INSPIRE product **eighteen years later**, in a February-2026 extract.

⛔ **Consumption trap, and it is exactly the class this audit exists to catch:
`heightBelowGround` is a source-side TIER-3 DETERMINISTIC INFERENCE wearing a tier-1
attribute's clothes.** Anything that reads it as an authoritative served measurement has
overstated. PRYZM must either drop it or re-derive it itself, with its own confidence tier
attached — never pass it through as `authoritative-machine-readable`.

**(iv) MEASURED: there is no above-ground height element anywhere.** `heightAboveGround`,
`BuildingHeight`, `elevation`, `lowestFloor`/`highestFloor` — **0 occurrences** across all three
GML files (`building`, `buildingpart`, `otherconstruction`) of both the urban and the rural
municipality. The SEC's own help page (L2-0g) describes the building GML as *"el esquema **2D
extendido**"* and mentions no vertical dimension; it describes *"KML por plantas"* as
*"el modelado en 3D de las diferentes plantas"* while stating **no height in metres at all**.

> **VERDICT Q4-height: the Spanish cadastre encodes storeys, not heights.** No metric storey
> height, no building height, no ground elevation, no roof elevation exists in any DGC channel —
> INSPIRE, CAT, FICC or FXCC. Every metre-valued figure in the 3D products is `count × 3 m`
> applied downstream of a register that never held a height.

---

## L2-2 · Q4 what the INSPIRE BU product actually encodes — measured at municipality scale

Granollers 08095, complete parse. **Class A** (authoritative machine-readable, keyless, bulk).

| Level | n | What it carries |
|---|---|---|
| `Building` | 6,030 | `currentUse` (6 classes) · `numberOfBuildingUnits` · `numberOfDwellings` · `conditionOfConstruction` · `dateOfConstruction` · `OfficialArea` · `documentLink` (façade photo) · `externalReference` · footprint |
| `BuildingPart` | 27,005 | footprint · `numberOfFloorsAboveGround` · `numberOfFloorsBelowGround` · `heightBelowGround` (= 3×below) |
| `OtherConstruction` | 288 | `constructionNature` — **288 of 288 `openAirPool`** |

- ⭐ **`numberOfFloorsAboveGround` is nil at Building level in 6,030 of 6,030 cases**
  (`nilReason="other:unpopulated"`). This is SYSTEMATIC, not the one-off lane 3 ES-1.2 saw.
  **Floors live only on the PART.** Any adapter reading floors off `Building` gets nothing,
  nationally.
- ⭐ **The part decomposition is the massing model.** 5,318 buildings have >1 part; of those
  **4,896 (92.1%) are STEPPED** — their parts differ in `numberOfFloorsAboveGround`. Floor-count
  distribution over parts: 1→8,771 · 2→5,131 · 3→5,050 · 4→2,871 · 5→1,666 · 6→1,139 … 14→3.
  1.2% of parts have 0 above-ground floors (below-ground-only volumes).
- ⚠ **`OfficialArea` is declared NOT official.** `sourceStatus = NotOfficial` in **6,030 of
  6,030**; `officialAreaReference = grossFloorArea`. The value is a real GFA and reconciles
  superbly (L2-6), but the element name overstates its own status and DGC says so in the
  adjacent field. Lane 3 ES-1.2 / ES-5 record it as *"official gross floor area 19,567 m²"* —
  the number is right, the word "official" is the source's element name, not its declared
  status. **Cite it as `grossFloorArea (sourceStatus=NotOfficial)`.**
- `OtherConstruction` was **only** `openAirPool` in both municipalities sampled (288 and, per P6,
  23). The codelist is wider (P4 lists PI/FUT/POR/TZA…); **what is POPULATED nationally in the
  INSPIRE channel appears to be pools alone.** Not established beyond two municipalities —
  NOT CONFIRMED for the rest of Spain.
- **No use, no area, no unit information on parts.** Per-floor use and area live in DNPRC (L2-4).

**Absent, verified rather than assumed:** roof geometry · roof shape/pitch · any Z ordinate ·
eaves height · ground elevation · per-floor geometry. The geometry is declared
`horizontalGeometryReference = footPrint` in 100% of features.

---

## L2-3 · Q4 what FXCC encodes — from the **2024** spec (Class B: served per-parcel, CAPTCHA-gated per P5; partial coverage per P4)

The founder's premise is right and richer than expected, with one structural correction.

**⭐ THE CORRECTION — FXCC floors are "plantas significativas", not real floors.** Verbatim
definition: *"una representación singular de **una o varias plantas reales** de un edificio que
tengan iguales características."* The `.ASC` carries `NUMPLS` (how many significant floors) and,
per significant floor, **`NUMPLR` — "Número de plantas reales que simboliza la significativa"**.
A 12-storey tower with identical floors 2–11 is drawn as ~4 significant floors, not 12.
**So the product is per-floor-TYPE geometry plus a multiplicity count — not one polygon per
real floor.** Reconstruction repeats the polygon `NUMPLR` times, which is deterministic and
fine; but *"Catastro serves per-floor polygons for every floor"* is an overstatement, and the
model asserts by construction that nothing varies within a repeated group.

**`.ASC` structure (per parcel):** `SUPBR` (superficie bajo rasante) · `SUPCONS` (superficie
total construida) · `NUMPLS`, then per significant floor: `NUMPLR` · `NOMPL` (nombre de la
planta, 30 chars) · `NUMUSOS`, then per use: `CODUSO` (up to 20 chars) · `SUPUSO` (m²).

**Floor naming (`NOMPL`)** ends in the real-floor codes from the FIN tape, comma-separated or
as a range: `Planta sótano -2` · `Planta sótano -1` · `PLANTA SEMISOTANO SM` · `Planta baja 00` ·
`Plantas 01,02,03` · `[Plantas 01 a 03]` · `Planta 04` · `Planta ático AT`. Ordered
bottom-to-top in the file. Below-rasante rule: a name starting `-`, **or** any floor below the
one named BAJA/00.

**`.DXF` layers** — `PG` = planta general, `PSnn` = significant floor nn (`PS01`, `PS02`, …),
suffixed by element type: `-LP` línea perimetral · `-LI` líneas interiores · `-AU` códigos de
destino · `-AS` superficies de locales · `-AL` códigos de locales · `-TL/-TP/-TO` textos ·
`-CO` acotaciones. (The PDF's two-column table extracts with its label column offset by one
row; the reading above is the mnemonic-consistent one — AU = atributo uso, AS = atributo
superficie — and matches the prose. Worth a visual re-check before code is written against it.)

**⭐⭐ The georeferencing fact that makes Q6 answerable at all** (§2.4.2.1.3, verbatim):
*"todas las plantas significativas, y no solo la general, estarán **perfectamente
georreferenciadas al sistema UTM** en el mismo huso que la cartografía catastral. La unidad de
medida será el **metro del terreno**."* And: *"**Serán rechazados** aquellos FX-CC a los que se
haya aplicado algún tipo de **desplazamiento o giro**"* — except, explicitly, for *"municipios en
los que no se disponga de cartografía georreferenciada"*. **Per-floor polygons therefore arrive
already registered to the parcel in real UTM metres — no alignment step, no viewer scraping.
The legacy façade-oriented exception is a real failure mode PRYZM must detect, not assume away.**

**Geometry is strictly 2D.** *"poligonales o cadenas vectoriales"*; arcs decomposed to vertices
at a **5 cm sagitta tolerance, never below 2 cm**. No Z ordinate. No roof layer. Topology is a
fully-connected planar network per floor — *"sin cabos sueltos"*, no crossing lines — so
deterministic polygonisation of each floor into `recintos` is well-defined.

**Per-floor semantics.** Each recinto gets one centroid carrying two attributes: a use/destino
code (**Annex IV: ~150 codes**, hierarchical — `V` vivienda, `C` comercio, `I` industria,
`O` oficina, `G` hotel, `E` enseñanza, `K` deportivo, `P` público, `R` religioso,
`T` espectáculos, `A` almacenamiento, `M` suelo sin edificar, `Y` otros) and a surface in m².
Horizontal division is expressed by dotted qualifiers: `V.A` (vivienda A), `V.A.2` (escalera 2),
`AAP.123.12.AAAA.1234` (parking space, escalera, bloque, portal). **Courtyards are explicit**:
`PTO` (patio o hueco) — *"se debe excluir dado que no computa en el cálculo de superficie
construida"*. Overhangs are explicit too: perimeters differ between floors *"por no estar
construida toda la superficie o **por haber voladizos**"*.

⚠ **`SUPUSO` is not always a physical area.** For `TZA`/`SOP` (terraza/soportal, which compute
at 50%) the spec requires *"la superficie que se pondrá en el centroide será aquella resultante
de aplicar **el coeficiente reductor**, y no la superficie física"*. Summing `SUPUSO` yields
COMPUTABLE area, not measured floor area.

**The volumetría grammar** (FXCC Annex III, the `PG-AA` layer): `-I, -II…` = volumes below
rasante (1, 2 storeys); `I, II…` = volumes above. Non-volumetric natures: `B` balcón · `T`
tribuna · `TZA` terraza · `POR` porche · `SOP` soportal · `PJE` pasaje · `MAR` marquesina ·
`P` patio · `CO` cobertizo · `EPT` entreplanta · `SS` semisótano · `ALT` altillo · `PI` piscina ·
`VOL` voladizo · `RUINA` · `CONS` en construcción · … `VERTE` vertedero (**added in the 2024
revision**). ⭐ **Composition is an ascending stack expression**: *"uniendo estos códigos, **en
sentido ascendente**, con el signo (+). Ejemplo: **-II+IV+TZA**"* = 2 basements, 4 storeys, a
terrace on top. That string is the whole vertical model of a cadastral recinto.

---

## L2-4 · Q4 the floor-level ALPHANUMERIC channel — keyless, national, **no CAPTCHA** (Class A)

⭐ **New this lane: `Consulta_DNPRC` returns a per-unit FLOOR CODE.** Lane 3 ES-1.1 reported
use/area/year/address; it did not report that `dt.locs.lous.lourb.loint` carries
**`es` (escalera) · `pt` (PLANTA) · `pu` (puerta)** — the tipo-14 triple. This matters
enormously for Q6: **floor-level USE and AREA are obtainable nationally, keyless, without
FXCC and without the CAPTCHA**, because the FXCC-gated part is the *geometry*, not the
attributes.

**Subject ES-A · `2940601DF3824B`** (Barcelona, C/ Sancho de Ávila) — probed 2026-09-01 14:37
UTC, HTTP 200, 61,248 B, `cudnp` 161 units, 6 escaleras:

| Planta | units | Σ sfc (m²) | use mix |
|---|---|---|---|
| **-1** | 20 | 512 | Almacen-Estacionamiento ×20 |
| 0 | 26 | 3,411 | Comercial ×8 · Residencial ×18 |
| 01 | 23 | 3,136 | Residencial ×23 |
| 02 | 23 | 3,130 | Residencial ×23 |
| 03 | 23 | 3,128 | Residencial ×23 |
| 04 | 23 | 3,127 | Residencial ×23 |
| 05 | 23 | 3,129 | Residencial ×23 |
| **Σ** | **161** | **19,573** | — |

⭐ **Cross-channel agreement to 0.03%**: Σ per-unit `sfc` = **19,573 m²** against wfsBU
`OfficialArea` = **19,567 m²** (lane 3 ES-1.2) — 6 m² apart, two independent Catastro services.
And the shape is self-consistent with lane 3's BuildingParts (`numberOfFloorsAboveGround` max 6
= planta 0 + 01–05; 1 basement ⇒ `heightBelowGround` 3 m = 1 × 3, exactly the L2-1 rule).
Floors 01–05 differ by ≤9 m² — **textbook `plantas significativas`: FXCC would draw these five
as ONE significant floor with `NUMPLR=5`.**

**Subject ES-B · `2255404VK4725E`** (Madrid, C/ Castelló 47) — probed 14:38 UTC, HTTP 200,
3,672 B, 10 units, all `ant`=1925: planta **00** 2 units 341 m² Comercial · **01** 2/398 ·
**02** 2/397 · **03** 2/398 · **04** 2/366, all Residencial. Σ 1,900 m². No basement.

⛔ **PARSING TRAP, measured: `pt` is NOT a normalised code.** Barcelona returns `"0"` and
`"-1"`; Madrid returns `"00"`. Same national service, same field, different width. A national
adapter must normalise (`-2 … -1 · 00 · 01…` plus the alpha codes `SM`, `AT`, `EPT`) rather than
compare strings. `es`/`pt`/`pu` are each independently OPTIONAL — 20 of the 161 Barcelona units
carry no `es`.

---

## L2-5 · Q5 accuracy and limitations — measured where possible

**Cartographic scale.** P3 (service spec) gives production scale *urban 1:1000 or better,
rustic 1:5000 or better*. ⚠ **Do not read that as a per-municipality property.** The ISO 19115
metadata shipped inside the ATOM ZIP declares `gmd:denominator` = **1000 for BOTH** the urban
municipality (08095 Granollers) **and** the rural one (08002 Aguilar de Segarra). The 1:1000 /
1:5000 split is *urban vs rustic cadastre* — the two registers that coexist inside a single
municipality — and **the delivered dataset exposes no per-feature discriminator telling you
which regime a given building came from.**

**Declared accuracy is a nominal constant, not an estimate.**
`horizontalGeometryEstimatedAccuracy = 0.1 m` in **33,035 of 33,035** Granollers features and
**1,186 of 1,186** Aguilar features — identical in an urban and a rural municipality. It is a
schema-filling constant. **Never present 0.1 m to a user as the accuracy of a particular
footprint.**

**Lineage is two regimes, undifferentiated.** ISO metadata, verbatim: *"Developed by means of
numeric restitution from a photogrammetric flight, **or** by digitalizing graphic documents
existing at the Cadastre."* Photogrammetric restitution and the digitisation of paper croquis
(P4: FXCC was born from CU-1 croquis digitisation) have materially different error
characteristics, and **which one produced any given polygon is not recoverable from the
product.** In FXCC the `.ASC` *does* carry a per-parcel `Escala de captura` — *"el denominador
de la escala de captura… **como referencia de la precisión del registro gráfico**"* — so the
per-parcel discriminator exists in the FXCC channel and is absent from the INSPIRE channel.

**Update lag — MEASURED.** `beginLifespanVersion` over 6,030 Granollers Buildings:

| period | n | share | cumulative |
|---|---|---|---|
| 2000–2004 | 759 | 12.6% | 12.6% |
| 2005–2009 | 3,468 | 57.5% | **70.1%** |
| 2010–2014 | 896 | 14.9% | 85.0% |
| 2015–2019 | 457 | 7.6% | 92.5% |
| 2020–2024 | 357 | 5.9% | 98.5% |
| 2025–2026 | 93 | 1.5% | 100% |

**70% of building records have not changed since before 2010**; 7.4% since 2020. The typical
graphic record is ~17–20 years old. (Caveat: `beginLifespanVersion` marks the last *edit event*
and may reset on bulk reprocessing — the 57.5% spike in 2005–09 looks like a mass
re-cadastration, so read this as an upper bound on freshness, not a clean age distribution.)
`dateOfConstruction` corroborates a new-build tail-off: 1970s 963 · 1990s 834 · 2000s 646 ·
**2010s 127 · 2020s 114**. Refresh cadence of the bulk channel itself is twice yearly
(P5; the file dates 2026-02-21 confirm the February wave).

**Known systematic errors** — P4's list (DGC's own engineers), now with this lane's additions:
prisms only · everything rests ON the terrain, no volume floating at a given level · **no
pitched or inclined roofs** · basements cannot be rendered below the terrain model · churches
(one storey, far more than 3 m) come out wrong · *"la altura real de cada local"* is named as a
known limitation. Add: geometry is `footPrint` (100% of features) while any nDSM measures the
**roof surface**, so eaves overhang is a systematic footprint-vs-raster mismatch on every join;
and `OfficialArea` self-declares `NotOfficial`.

**Licence note (does not overturn P2).** The ISO metadata inside the ATOM ZIP declares
`gmd:useLimitation` = *"No conditions apply"* and `gmd:otherConstraints` = *"no limitation"* —
which **contradicts both** the P2 `Licencia.pdf` transformation requirement and the P6 ATOM
`<rights>Copyright (c) 2012, ES.SDGC; all rights reserved</rights>`. **Three different licence
statements inside one product family.** P2 is the governing instrument (it is the actual licence
document); the metadata string is not a grant. Flagged, not resolved.

---

## L2-6 · Q6 · **THE RECONSTRUCTION VERDICT**

> **Can PRYZM deterministically build a per-floor 3D building without touching the viewer?**
>
> ### YES for the SOLID — footprint per floor, floor identity, use and area per floor.
> ### NO for the METRIC — every vertical dimension is derived. There is no served height.
>
> The honest one-liner the brief asked for: **footprint-per-floor YES, metric heights NO.**

**Assumption declared** (lane 1 had not landed when this was written): that FXCC-por-plantas is
retrievable at some rate and yields per-significant-floor polygons + floor codes. **Everything
in Path 1 below is independent of that assumption** and needs no FXCC at all.

### Path 1 — INSPIRE-only, national, keyless, bulk, NO CAPTCHA · needs no FXCC

`Level_k footprint = ⋃ { part.geometry : part.numberOfFloorsAboveGround ≥ k }`

Because parts form a planar partition and 92.1% of multi-part buildings are stepped, the
threshold-union over parts **is** a per-floor footprint series — a genuine stepped LoD1 massing,
for 95% of Spanish territory (P3), from a bulk download.

**MEASURED VALIDATION — the reconstruction identity closes.** Over all 5,995 Granollers
buildings carrying both parts and a GFA, testing
`Σ_parts(area × floors) / OfficialArea`:

| model | median | within ±10% | large (>2,000 m²) median | large within ±10% |
|---|---|---|---|---|
| above-ground floors only | 0.995 | 65.2% | 0.830 | 33.9% |
| **above + below ground** | **1.000** | **76.9%** | **0.986** | **71.4%** |

**`grossFloorArea` = Σ over parts of (footprint area × (floorsAbove + floorsBelow)), at a
median of 1.000 across a whole municipality.** Adding basements moves large buildings from
0.830 → 0.986 and more than doubles their hit rate, which both explains the residual and
confirms that the part decomposition is a *complete* volumetric account of the building. This
is a checksum PRYZM can run per building, for free, and refuse on when it fails.

### Path 2 — FXCC-por-plantas, where retrievable (Class B) · adds the INTERIOR

Adds what Path 1 cannot give: interior subdivision into `recintos`, per-recinto use (~150
codes), per-recinto area, per-unit identity (`V.A.2`), explicit courtyards (`PTO`), explicit
overhangs (`VOL`), and per-floor perimeters that differ from the footprint. Already in UTM
metres, already registered (L2-3). Repeat each significant floor `NUMPLR` times to expand to
real floors.

### Path 3 — DNPRC attributes, national, keyless (Class A) · adds use + area per floor

Per-unit `planta` × `uso` × `superficie` × `año`, nationally, no CAPTCHA (L2-4). **This is the
important architectural point: the floor-level ATTRIBUTES are a Class-A national service. Only
the floor-level GEOMETRY is Class-B/CAPTCHA-gated.** A per-floor use-and-area stack — which is
most of what a development-potential product needs — is available for all of Spain today.

### The A / D split, stated per value

| Value | Class | Source | Confidence tier (FROZEN model) |
|---|---|---|---|
| Parcel polygon | **A** | INSPIRE CP WFS (PRYZM prod) | **1** authoritative-machine-readable |
| Building / part footprint | **A** | INSPIRE BU (bulk ATOM) | **1** |
| Floors above / below ground, per part | **A** | INSPIRE BU | **1** |
| Per-floor footprint (threshold-union) | **D** | derived from A above | **3** deterministic-inference |
| Floor identity / code per unit | **A** | DNPRC `loint.pt` | **1** |
| Use per floor | **A** | DNPRC `luso` (or FXCC `CODUSO`) | **1** |
| Constructed area per floor | **A** | DNPRC `sfc` (or FXCC `SUPUSO`) | **1** |
| Existing total GFA | **A** | INSPIRE `grossFloorArea` (`NotOfficial`) | **1**, cite the sourceStatus |
| Per-floor interior subdivision | **B** | FXCC-por-plantas (CAPTCHA, partial) | **1** where retrieved |
| **Building total height** | **D** | **MDSnE P90 zonal (`mdsn_e025`)** — PRYZM's existing `fetchSpainBuildingHeights` | **3** deterministic-inference, SURVEYED |
| **Per-storey height** | **D** | total ÷ floors, or an assumed storey height | **3** at best — see below |
| `heightBelowGround` as served | ⛔ | INSPIRE — **is `3 × floors`, not a measurement** | **3**, never 1 |
| Roof geometry / pitch | — | **nothing, anywhere** | **6** uncertain-missing |
| Ground elevation / rasante | — | not in any Catastro channel | **6** from Catastro; PRYZM's terrain supplies it |
| Floor-to-floor of a *named* storey | — | **does not exist in any register** | **6** |

**The metric leg, precisely.** PRYZM's `fetchSpainBuildingHeights` / `mdsHeightForBuilding`
(P90 over a 1 m-eroded interior, `minSamples:3`) already samples the IGN **MDSnE** `mdsn_e025`
raster and is re-verified live in `impl/e3b-state-heights-verdict.md`. That gives a **measured
total height** — genuinely better than any floor-count proxy, and the repo already ranks
`mds_edificacion` above `catastro` for every ES region. Two hard limits carried from e3b:

1. **Per-footprint coverage is only 32–40% in dense centres** (many small parts fail
   `minSamples:3` at 2.5 m sampling after erosion). For the other ~60%+ there is **no measured
   height at all** and the honest value is the floor count with `METRES_PER_LEVEL = 3.2`
   (`heightSources.mjs:51`) — a **tier-3 assumption**, and e3b measured the real centre-of-city
   figure at **~3.76–3.84 m/floor**, so 3.2 understates by ~0.6 m/floor.
2. **Distributing a sampled total across floors is not measurement.** `h_floor = H_MDSnE / n_floors`
   is arithmetic over one measured scalar and one count; it is **tier 3, uniformly, for every
   floor**, and it is *wrong in a specific direction* — ground-floor commercial storeys are
   systematically taller than the residential floors above them, which the uniform division
   silently denies. Subject ES-A is exactly that shape: planta 0 Comercial, 01–05 Residencial.

⛔ **The line PRYZM must not cross.** A per-floor model whose slab elevations came from
`H_MDSnE / n` must never be presented as *"the building's floors"*. It is a massing with
plausible slab positions. The floor **count**, the floor **identity**, the floor **use** and the
floor **area** are authoritative; the floor **elevations** are inferred. Those are different
tiers and the FROZEN model has a field for exactly that distinction — use it per value, not per
building (`RuleProvenanceSchema`, `derivation: DERIVED`, `valueLocation: attribute`, tier 3;
tier 6 with `value: null` where even the inference has no basis).

---

## L2-7 · What would make the reconstruction WRONG — the named failure modes

1. **Mezzanines / entreplantas.** `EPT` is a first-class subparcela code and `entreplanta`
   appears as a real planta. It counts as a floor but is nowhere near a full storey. Any
   `H / n_floors` division is corrupted by one. **Detect**: an `EPT`/`ALT` planta code.
2. **⛔ The semisótano ordering trap — the file order is not the physical order.** FXCC
   verbatim: if a semisótano below the baja is really above rasante and valued as such,
   *"se pondrá la planta semisótano **por encima de la baja** para evitar que los programas de
   validación muestren error"*. **The spec instructs producers to misorder the stack to satisfy
   a validator.** Never stack on `.ASC` sequence alone; key on the floor code.
3. **Sloped ground.** Catastro has no ground elevation and everything is modelled resting on
   terrain (P4). On a slope "planta baja" is not one elevation — the rasante varies along the
   façade. This is the same defect class as **L-584** (rasante sampled at the centroid where the
   ordinance measures at the façade). A single ground datum per building will be wrong on any
   sloping parcel, and wrong *legally*, not just visually.
4. **Courtyards.** `PTO` recintos are excluded from computed surface, and INSPIRE footprints
   carry real interior rings (818 `gml:interior` in Granollers). Extruding an outer ring only
   overstates volume and GFA. **Honour interior rings.**
5. **`plantas significativas` collapse.** One drawn floor stands for `NUMPLR` real floors and
   asserts they are identical. Where they are not, the model cannot tell you.
6. **50%-coefficient areas.** `TZA`/`SOP`/`YSP` surfaces are recorded **post-coefficient**.
   Summing them gives computable, not physical, area.
7. **Casas engalabernadas.** The spec handles inter-parcel overhang with codes like
   `.III02II03I` (3 storeys total, 2 to parcel 02, 1 to parcel 03). A per-parcel extrusion that
   ignores this double-counts or misattributes volume. Rare, real, and specified.
8. **Non-georeferenced legacy FXCC.** Permitted for *"municipios en los que no se disponga de
   cartografía georreferenciada"* — those are façade-oriented and will land in the wrong place
   if assumed UTM. **Detect before trusting placement.**
9. **Foral gap.** País Vasco + Navarra are outside DGC entirely (P3: 95% coverage; P6: their
   ATOMs are federated in the same index under different licences). Not a national answer.
10. **Footprint vs roof.** `horizontalGeometryReference = footPrint`, but MDSnE measures roofs.
    Eaves overhang biases every zonal join.

---

## L2-8 · Corrections and additions offered to sibling lanes (evidence attached, not applied)

- **Lane 3 ES-1.2 / ES-5** — *"official gross floor area 19,567 m²"*: the value is right; the
  element's own `sourceStatus` is **`NotOfficial`** in 6,030/6,030 cases. Recommend citing as
  `grossFloorArea (sourceStatus=NotOfficial)`.
- **Lane 3 ES-1.2** — *"`numberOfFloorsAboveGround` is nil AT BUILDING LEVEL"*: confirmed and
  **generalised — 6,030 of 6,030, systematic, not incidental.**
- **Lane 3 ES-1.2** — *"`heightBelowGround` (3 m)"*: it is **`3 × numberOfFloorsBelowGround`,
  exactly, 27,005/27,005**. Derived at source; must not be consumed as a measurement.
- **Lane 3 ES-1.1** — DNPRC also returns **`loint.es/pt/pu`**, i.e. **per-unit floor codes**.
  This upgrades DNPRC from "existing-GFA datum" to "**floor-level use+area datum, national,
  keyless**" and is the single most useful unremarked finding for the Spain spine.
- **E5 sweep row ES** — the *"FXCC per-floor plans"* cell should note that FXCC floors are
  **plantas significativas + `NUMPLR`**, not per-real-floor geometry; and that ES's floor-level
  **attributes** (DNPRC) are Class A even though the floor-level **geometry** is Class B. The
  ES/SI comparison sharpens: **SI serves per-floor geometry *with* `VISINA_ETAZE` and
  `NADMORSKA_VISINA` — real metric floor heights and altitudes (Class A). ES serves per-floor
  geometry with NO height whatsoever.** Slovenia's floor product is strictly richer on the
  vertical axis; Spain's is richer on use/unit semantics and national coverage.
- **P3** — *"urban 1:1000, rustic 1:5000"*: correct as a production statement, but the shipped
  ISO metadata declares **1000 for a rural municipality too**; the split is urban-vs-rustic
  *cadastre*, and no per-feature discriminator ships.

## L2-9 · NOT CONFIRMED (stays not confirmed)

- Whether `OtherConstruction` carries natures other than `openAirPool` anywhere in Spain
  (2 municipalities sampled, both 100% pools).
- Whether the GFA reconciliation (median 1.000, 76.9% within ±10%) holds outside Granollers.
  **One municipality, one province.** It should be re-run on a Madrid and an Andalusian
  municipality before it is relied on as a national gate.
- FXCC-por-plantas retrievability, rate limits and coverage — **lane 1's subject**, deliberately
  not probed here.
- Whether `beginLifespanVersion` resets on bulk reprocessing (which would make the 70%-pre-2010
  figure an artefact of the 2005–09 spike rather than true staleness).
- The FXCC DXF layer-table label alignment (PDF two-column extraction offset; prose-consistent
  reading given, visual confirmation still owed before code).


---

## L1 · FXCC / KML floor channels (brief Q1 · Q2 · Q3) — LIVE-PROBED 2026-09-01 14:27-14:53 UTC

> **Full lane report: `es-catastro-3d-l1-fxcc-kml-channels.md`** (sibling file; written there
> because L2 was appending to this log concurrently). 85 live requests. Headlines only below.

- **The four channels' real endpoints were DISCOVERED, not documented.** The SEC guide names the
  products but publishes no URL; all six are `__doPostBack` targets on `OVCListaBienes.aspx`.
  Recovered: `GeneraFXCU1.aspx` (a, +`&colindantes=Y`) · `FXCC/DescargaFXCC.aspx` (b) ·
  `WMS/BuscarParcelaGoogle3D.aspx?tipo=3d` (c) · **`FXCC/FXCC_KML.aspx`** (d). No documented API.
- ⭐⭐ **CORRECTION TO §L2-6 Path 3.** *"Only the floor-level GEOMETRY is Class-B/CAPTCHA-gated"* is
  **false as measured**. The captcha gates the FXCC *ZIP* delivery; **`FXCC_KML.aspx` serves the same
  per-floor geometry keyless, cold** (HTTP 200, 177,075 B, no cookie/session/referer/captcha).
  Licence still constrains volume — the *technical* gate is absent, not the legal one.
- ⭐ **The by-floor KML is the floor-level prize and it is real**: 7 folders (PLANTA GENERAL + 6 real
  floors), 430 polygons, closed prism per LOCAL, per-unit **use** (`Vivienda`/`Local COMUN`/`Almacén`),
  per-floor footprints that genuinely differ (top floor -6.9 %, cross-confirming Madrid's
  `IT_ATICO = "Si. Retranqueado 3m"`). It **pre-expands `NUMPLR`**, labelling copies `(1/4)…(4/4)` —
  so 8 rendered floors can come from 5 surveyed croquis. Per-floor-GROUP, not per-floor.
- ⛔ **Floor height is the constant 3.0 m in 55/55 bands across 9 buildings.** Confirms P4 by
  measurement. FXCC itself (both variants) has **zero DXF group-code 30/38 — strictly 2D**.
- ⛔ **D1 BASEMENT STACK-SHIFT.** The by-floor KML stacks sótanos from z=0; the parcel KML omits them.
  The two DGC products disagree on the same building by exactly `3 m x (sotano levels)`, verified 4/4.
  `2255407VK4725E` reads **30 m by-floor vs 24 m parcel** — a naive ingest overstates real
  above-ground fabric by 43 %. Deterministic Class-D correction available.
- ⛔ **D2 THREE ABSENCE SHAPES**, none an error status: empty 200; a well-formed 5,886 B KML with
  **0 folders / 0 polygons** (Sevilla) that passes any validity check; and an HTML `alert()` in a
  download flow. Gate on polygon count, never on status or bytes.
- ⛔ **D3** the KML declares `ISO-8859-1` but is UTF-8 (header says utf-8) - strict parsers mojibake
  every accented use label. **D4** floor labels are free text with no controlled vocabulary.
- **Coverage is the binding constraint, and it is territorial.** Barcelona **0/5** (the flagship
  parcel `2940601DF3824B` included), Madrid **10/10**; city spot-check 4/8 (Madrid, Valencia, Malaga
  yes; Zaragoza, Vigo, Murcia, Barcelona no; Sevilla degenerate). No coverage index exists. No
  percentage published - n is far too small.
- **At scale, measured:** captcha token is **parcel-bound, unforgeable, replayable**; 20 sequential
  `FXCC_KML.aspx` GETs in 29 s (0.69/s) = **20/20 HTTP 200, no throttling** - a *different* WAF posture
  from P1's INSPIRE soft-block, so do not carry P1's figure across hosts. **Bulk: planta-general
  geometry YES (Shapefile `CONSTRU`), floor attributes YES (CAT type-14), per-floor GEOMETRY NO -
  at any access tier.** That asymmetry decides the lane.
- ⭐ **Four official GFA readings of one building: 1,900 / 1,920 / 1,928 / 1,932 m2** (DNPRC / FXCC
  por-plantas 2018 / FXCC general live / KML integration). There is no single official Spanish GFA.
- **Freshness split:** FXCC planta general is generated **live** (`01/09/26`); FXCC **por plantas is a
  stored artefact dated `25/05/18`** and already 8 m2 adrift. Surface the FXCC date.
- **Verdict:** bulk `CONSTRU` + CAT type-14 = use at scale. Channel (c) = compute, do not fetch.
  Channel (d) = the only per-floor geometry in Spain, usable **on-demand, low-volume, cached, never
  swept**. Channels (a)(b)(b') per-parcel = **do not automate** (that is the anti-automation control).

## L3 · comparison, planning content, combine-with — IN A SIBLING FILE

> Lane L3 (brief Q7 · Q9 · Q10) wrote its findings to **`es-catastro-3d-L3-comparison-planning.md`**
> to avoid clobbering concurrent appends to this log. Headlines, so nobody re-derives them:
> **Q7** — Spain has NO national and NO regional LoD2 (six probes with controls: datos.gob.es,
> IDEAndalucía, GeoEuskadi, ICV, ICGC, Navarra + awesome-citygml); the only LoD2 is **Madrid**
> (keyless 1.55 GB SLPK, roof-line restitution 1:1000, cuatrimestral) and **Barcelona CartoBCN**.
> Catastro Barcelona 08900 MEASURED city-wide: **Building-level floors 0 % populated (all nil),
> BuildingPart floors ~100 % of 319,098 parts**; use/dwellings/year/OfficialArea ~100 %.
> **Q9 — NO planning content.** CAT tipo 11/14/15 field lists, the DNPRC key set, TRLCI art. 7,
> RD 1020/1993 and the DGC CP-WFS spec all read: `CP:CadastralZoning` is **manzana/polígono**, not
> land-use zoning; a ponencia edificabilidad may lawfully be **the mean or mode of what exists**.
> **Q10** — two NEW probed rows: **CartoBCN prod 107** (21,298 qualification polygons, keyless,
> daily; ALCADES 36 % free text, FONDARIA 0.8 %) and the **SIU national WFS**, which is ALIVE at
> `…/SIU/Servicios_OGC/…` while the INSPIRE-catalogued `Servicios_OGC_SIU` URL 404s.
> **Also correcting P1:** the OVC block is **host-scoped and IP-scoped**, still active ≥7.5 h later
> (an independent vantage point served the same URL); `www.catastro.hacienda.gob.es` is unaffected.

---

## MEMO · THE DECISION MEMO IS WRITTEN — `../ES-CATASTRO-3D-MEMO.md`

> Synthesis lane, 2026-09-01. **Append-only**: P1–P6, L1, L2, L3 are untouched and are cited by
> section, never re-derived. No new probes were made — the memo is a decision over the four lanes'
> evidence, resolving their conflicts by the stronger source (live probe > document > inference).

**The memo answers the brief in its A–H format.** Headlines, so nobody re-derives them:

- **A** — ten channels classified. Class **A**: INSPIRE BU (ATOM bulk + WFS) · DNPRC floor-level
  attributes. Class **B**: FXCC planta general / por plantas / **KML por plantas** · the
  authenticated `CONSTRU` + CAT bulk. Class **D**: the parcel KML (`footprint × roman numeral × 3 m`
  — compute it). Class **C**: the Visor 3D, never scraped. **No metric height in any of them.**
- **B / C** — automate the **ATOM bulk plane**, DNPRC, the authenticated province bulk, and
  `FXCC_KML.aspx` **on demand only**. Never automate the captcha-gated channels, never sweep, never
  scrape the viewer, never re-probe the blocked OVC host from a production IP.
- **⚖ LICENCE VERDICT — 🟢 GREEN** for PRYZM's transformed products under four binding duties
  (transform · cite *"Dirección General del Catastro"* **+ the access date** · never re-serve the
  original · never brand output *"cartografía catastral"*); **🔴 RED** for redistribution of raw
  GML/FXCC/KML/tiles. ⭐ **This overturns the repo:** `sourceRegistry/es.ts` carries
  `CC-BY-4.0 (Catastro resolution 2023)` on all three ES rows and **that is refuted by P2** — DG
  Catastro is a custom transformation licence; only the FORAL feeds in the same ATOM index are CC.
- **D** — the hierarchy splits by VALUE: geometry `city LoD2 (MD/BCN only) → Catastro BU parts →
  threshold-union per-floor (D) → FXCC-KML on demand → Overture → EUBUCCO`; height is a **separate**
  ladder (MDSnE SURVEYED → floors × constant), and **Catastro's z is never tier 1**; semantics are
  Catastro-first **everywhere, including inside Madrid and Barcelona**.
- **E** — **DATA, NOT ARCHITECTURE.** Five source-priority data rows change (ES licence rows · an
  ATOM row of its own · the ES `bridge-file` flag is to **IGN-España, not Catastro** · measured
  6-month bulk staleness · EUBUCCO droppable for Spain). ⛔ **Per-floor geometry does NOT enter E5** —
  no bulk at any tier, territorial coverage, undocumented endpoint. **It is recorded for E10.**
  E4-EXECUTION-CONTROL §1's precondition (a demonstrated implementation failure) is **not met**.
- **F** — Catastro exposes **zero** normative planning content, five ways. `CP:CadastralZoning` is
  **manzana/polígono**, `Clase UR/RU` is a tax flag, a ponencia edificabilidad may lawfully be **the
  mean or mode of what already stands**.
- **G** — Madrid CM → CartoBCN 107 (licence NOT CONFIRMED) → AMB Refós → Murcia → **SIU as the
  national classification spine (CC BY 4.0)**; the rest of Spain is document-rule.
- **H** — ten minimum items, none implemented. H1 (licence rows) is XS and highest value; H2
  (floors live on the PART) prevents silent zero-storey massing nationally; H7 (the five FXCC-KML
  defences, incl. the **43 % basement over-height**) is **E10's**, not E5's.

⭐ **The correction this lane owes the E5 sweep** (`e5-asis-national-sweep.md` §3.1): ES and SI are
both floor-level-geometry countries, **but only Slovenia's is usable at scale** — `ETAZE` is a
keyless WFS with real `VISINA_ETAZE` / `NADMORSKA_VISINA` metres and a bulk channel, while Spain's is
per-parcel, un-bulk-able, territorially patchy, and carries no height at all.
