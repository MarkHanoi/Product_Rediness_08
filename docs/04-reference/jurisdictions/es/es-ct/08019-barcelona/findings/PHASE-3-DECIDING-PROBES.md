# PHASE 3 — THE THREE DECIDING PROBES (Barcelona, INE 08019)

**Run 2026-07-31.** Deliverable of `GEOGRAPHIC-ROLLOUT-MASTER-TRACKER.md` §3. Each probe **vetoes a
branch of Phase 4 (HEIGHTS)**. This document is a **measurement and a verdict, not an
implementation** — no Phase-4 code was written.

Probe scripts (small, rerunnable, dependency-light):
- `tools/phase3-probes/probe-v8-terrain-posting.mjs`
- `tools/phase3-probes/probe-v3-ml-heights-vs-levels.mjs`
- V2 is a licence-reading probe; its evidence chain is the fetch log in §V2.4.

**Evidence tags** (G11 discipline, `DENMARK-GAP-ROADMAP.md` §G11):
`VERIFIED` = I fetched the primary bytes/text and read them myself ·
`ASSERTED-UNVERIFIED` = read only through a secondary or summarising layer ·
`UNKNOWN` = not established, recorded as a gap rather than inferred.
**No citation is invented.** Where a value has no traceable clause, it says so.

---

## §0 — THE THREE VERDICTS ON ONE LINE

| Probe | Question | Verdict | What it does to Phase 4 |
|---|---|---|---|
| **V8** ⭐ | posting spacing of the terrain we hold under Barcelona | ⛔ **CANNOT resolve a 20 m street** — served median vertex spacing **57.3 m**, source native GSD **25.0 m**, requirement **≤ 10 m** | **VETOES running V6 against this data.** The rasant question (L-584 / Phase 5) is currently **UNANSWERABLE, not answered.** ⇒ Fix is a **two-value config change**, measured in §V8.6 — not an acquisition programme |
| **V2** | may a DERIVED nDSM be redistributed commercially? | ✅ **YES**, both PNOA/CNIG and ICGC — **conditional on attribution we do not currently emit** | **Path B is NOT licence-blocked.** The G1 licence gate does **not** veto it |
| **V3-gate** | do Overture/MS-ML heights beat `levels × 3.2 m` against our surveyed ground truth? | ⛔ **THE QUESTION IS UNANSWERABLE AS POSED** — the ML heights and the ground truth are **disjoint (overlap = 0 of 14,803)**. On indirect evidence the ML heights **fail a physical-plausibility test (55.7% imply an impossible storey height)** | **Path A does not clear.** It cannot be shown to beat our estimate, and the one independent check available says it is worse |

### ⇒ THE HEADLINE

**The terrain under Barcelona physically cannot resolve a 20 m street.** Every number that a
centroid-vs-façade test would produce today is an artefact of the instrument. **L-584 is open and
currently unmeasurable** — that is a different and more honest state than "measured, delta is small".

### ⇒ THE SECOND HEADLINE, which changes the Phase-4 shape

Phase 4 was framed as *"path A is days, path B is weeks, and the licence may kill B."*
**Both halves of that framing are now wrong:**

- **The licence does not kill B.** V2 clears it, and IGN already publishes **`MDSnEdificación2,5`** —
  a pre-computed **normalised building-surface model**, i.e. an nDSM *already differenced*, under the
  same CC BY 4.0. The "acquire → difference → zonal stats" work may reduce to "acquire → zonal
  stats". `ASSERTED-UNVERIFIED` — the product is listed in the SCNE product table; **its Barcelona
  coverage, resolution and download route have NOT been probed.** That probe is the single highest-
  value next measurement on this board.
- **Path A is days of work for a number we cannot validate and that fails the one plausibility check
  we can run.** Cheap is not the same as worth doing.

---

# PROBE V8 ⭐ — terrain posting spacing under Barcelona

## §V8.1 — Question

What is the actual **posting spacing** (ground sample distance) of the terrain data we hold under
Barcelona — and **can it resolve a 20 m street, yes or no?**

**Why it gates V6.** The Eixample block module is ~133 m with a 20 m street. If the posting is
coarser than the street, the block **centroid** and the **façade** fall inside the *same* cell, a
centroid-vs-façade test measures ≈ 0, and the L-584 rasant question is closed **falsely — for
instrumental reasons.** This repo has already been burned by the sibling failure (the L-581
retraction: every aggregate healthy, geometry wrong by 12×, caught only by an independent oracle).
**Measure the instrument before using it.**

## §V8.2 — Method

Three **independent** measurements, deliberately not one method three times. `n` and provenance
stated for each.

| | What it measures | Instrument |
|---|---|---|
| **M1** | what we **SERVE** | decode the real quantized-mesh tiles from R2; recover the lattice from the shipped bytes; measure vertex spacing in metres |
| **M2** | what we **FETCH** | read the source GeoTIFF's own `ModelPixelScale` tag (33550) with a hand-rolled TIFF IFD reader — **no geotiff dependency**, so nothing between the bytes and the number |
| **M3** | what the **PUBLISHER DECLARES** | WCS 2.0.1 `DescribeCoverage` → `offsetVector`, plus `GetCapabilities` to enumerate what else is on offer |
| **M4** | what would **FIX IT** | same TIFF measurement applied to the finer coverage; plus the bake maxzoom arithmetic |

M1 measures the product; M2/M3 measure the input. **If M1 is coarser than M2 the loss is OURS.**
That distinction decides config-change vs acquisition-programme, and it is the reason the probe is
built this way rather than as a single number.

⚠ **What was deliberately NOT accepted as evidence:** the repo's own
`tools/context-bake/terrain.mjs` `TERRAIN_SOURCES.es.resolutionM`. See §V8.7 — it is wrong, and
trusting it would have produced the opposite verdict.

## §V8.3 — Raw measurement

### M1 — what we serve · `VERIFIED`

**Chain:** `https://pub-1ad4f6c5dec849b5b25a45586898fd4d.r2.dev/tiles/terrain/barcelona/layer.json`
→ HTTP **200**, 1,686 B, `application/json` → `format=quantized-mesh-1.0`, `scheme=tms`,
`minzoom=0`, **`maxzoom=10`**, `extensions=["octvertexnormals"]`, bounds `[2.09, 41.32, 2.23, 41.47]`.

**Chain:** `…/terrain/barcelona/10/1036/747.terrain` → HTTP **200**, **489,721 B**,
`application/vnd.quantized-mesh` → decoded **24,525 vertices / 48,825 triangles**, height range
51.00 … 565.82 m ellipsoidal. Tile rect `2.10938,41.30859 → 2.28516,41.48438` =
**14,679 m E–W × 19,568 m N–S**. (Reference point: Eixample, Pau Claris / C. de Mallorca,
41.3948 / 2.1637.)

| Measurement | Value | `n` |
|---|---|---|
| recovered quantisation lattice, `u` | modal step **128/32767**, in **175 of 183** consecutive gaps over 184 distinct values | 24,525 vertices |
| recovered lattice, `v` | modal step **128/32767**, **219 of 229** gaps over 230 distinct values | 24,525 |
| ⇒ finest cell the shipped bytes can express | **57.3 m (E–W) × 76.4 m (N–S)** | — |
| ⇒ implied source grid per tile | **257 × 257** | — |
| **nearest-neighbour vertex spacing (m)** | min 56.89 · p05 57.34 · p25 57.34 · **median 57.34** · p75 57.34 · p95 95.56 · max 3,669.85 | **4,088** sampled (stride 6) |
| **TIN edge length (m)** | min 56.89 · p05 57.34 · p25 57.34 · **median 76.44** · p75 95.56 · p95 152.88 · max 6,115.62 | **73,349** unique edges |
| vertex density | **85.4 vertices / km²** ⇒ mean spacing **108.2 m** | 24,525 over 287 km² |

⚠ The lattice was recovered **from the shipped bytes, not read from the bake config.** The config
says `gridSize = 257`; the bytes independently imply 257. They agree — but the measurement does not
depend on the config being right, which is the point.

### ⭐ M1(d) — THE DECIDING TEST · `VERIFIED`

A **1,000 m × 20 m** street corridor centred on the Eixample reference point:

| | |
|---|---|
| corridor area | 0.0200 km² |
| **expected** vertices from the measured density | **1.71** |
| **MEASURED** vertices in the corridor | **0** |

**A 20 m street in the Eixample carries zero terrain samples. It is not sampled sparsely — it is not
sampled at all.**

### M2 — what we fetch · `VERIFIED`

**Chain:** `tools/context-bake/terrain.mjs` `DTM_FETCH.es` requests coverage **`Elevacion4258_25`**
from `https://servicios.idee.es/wcs-inspire/mdt` (WCS 2.0.1 GetCoverage, `image/tiff`, no
`SCALESIZE` ⇒ the server returns its native grid). The probe issues the **identical** request over a
~1,000 × 1,000 m box at the reference point → HTTP **200**, **4,658 B**, `image/tiff`.

Read directly from the returned TIFF's IFD:

| Tag | Value |
|---|---|
| `ImageWidth` / `ImageLength` (256/257) | **53 × 40 px** |
| `ModelPixelScale` (33550) | **`[0.000225925, 0.0002246, 0]`** degrees |
| `ModelTiepoint` (33922) | `[0, 0, 0, 2.157713, 41.399292, 0]` |
| **⇒ native GSD** | **18.87 m (E–W) × 25.00 m (N–S)** |
| cross-check: 53×40 px over ~1,000 m | **18.87 × 25.00 m/px** — agrees to 2 d.p. |

### M3 — what the publisher declares · `VERIFIED`

**Chain:** `…/wcs-inspire/mdt?…REQUEST=DescribeCoverage&COVERAGEID=Elevacion4258_25` → HTTP **200**,
2,522 B, `text/xml`.

- `GridEnvelope` low `[0 0]` high `[102774 72362]`; Envelope lower `[27.63 −18.21]` upper `[43.93 4.94]`
- **`offsetVector` = `"0 0.000225"` and `"−0.000225 0"`** ⇒ declared spacing **0.000225°** ≈
  **25.05 m** (N–S) / **18.79 m** (E–W at lat 41.4)

**Independent agreement:** M2 (18.87 / 25.00) and M3 (18.79 / 25.05) come from two different
mechanisms — the raster's own georeferencing tags vs the server's coverage description — and agree
to within 0.4%.

`GetCapabilities` → HTTP **200**, 12,162 B, **17 coverages**:
`Elevacion{4258,4326,25830,4083}_{5,25,200,500,1000}`. IGN's naming is
`Elevacion<epsg>_<gridMetres>`, so `_25` = MDT25 and **`_5` = MDT05 exists on the same endpoint.**

## §V8.4 — ⇒ VERDICT

| | |
|---|---|
| served terrain, median nearest-neighbour vertex spacing | **57.34 m** (n = 4,088) |
| served terrain, median TIN edge length | **76.44 m** (n = 73,349) |
| source raster native GSD | **25.00 m** (two independent instruments) |
| terrain samples inside a 1,000 × 20 m Eixample street | **0** |
| **requirement** to *resolve* a 20 m feature (Nyquist: posting ≤ ½ feature) | **≤ 10 m** |

# ⛔ **NO. The terrain we hold under Barcelona CANNOT resolve a 20 m street.**

It fails at **both** levels, and the two failures are independent:

1. **The source is already too coarse.** PNOA **MDT25** at 25 m is 2.5× coarser than Nyquist for a
   20 m street. Even a perfect bake could not recover the street.
2. **Our bake then loses another factor of ~2.3.** `maxzoom = 10` with a 257-sample grid puts the
   served posting at 57 × 76 m. **This half is self-inflicted** — the same class of finding as
   Phase 4's schema note: *a limitation we chose, not a data gap.*

## §V8.5 — ⇒ WHAT THIS VETOES

**V6 MUST NOT BE RUN AGAINST THIS DATA.** A centroid-vs-façade elevation test on this terrain would
return a near-zero delta and would look like a clean, quantitative refutation of L-584. It would be
an artefact. Concretely: the Eixample centroid→façade distance is ~56.6 m; the median spacing
between independent heights is 57.3–76.4 m. **The two points the test compares are, on average,
inside the same cell or in immediate neighbours whose values are a bilinear blend of the same
postings.**

⇒ **The L-584 / Phase-5 rasant question is currently UNANSWERABLE, not answered.** Any document
stating that the rasant delta has been measured and is small should be read as un-sourced until a
terrain meeting §V8.6 is in place.

⇒ Note also what V8 does **not** say. It says nothing about whether the rasant *matters* legally —
that is **V7**, a reading task, and the tracker is right that no dataset shortens it.

## §V8.6 — ⇒ WHAT WOULD FIX IT — measured, and it is cheap · `VERIFIED`

**Chain:** identical WCS request, coverage **`Elevacion4258_5`** → HTTP **200**, **106,398 B**,
`image/tiff`, **266 × 199 px** over the same ~1 km box.

| | MDT25 (today) | **MDT05 (available now)** | needed |
|---|---|---|---|
| native GSD, measured from `ModelPixelScale` | 18.87 × **25.00 m** | **3.76 × 5.03 m** | ≤ 10 m |
| meets Nyquist for a 20 m street | ❌ | ✅ | — |
| endpoint | same | **same** | — |
| auth | keyless | **keyless** | — |
| licence | CC BY 4.0 | **same** (§V2) | — |

**Bake side.** At `gridSize = 257` the served posting is `tile span ÷ 256`, so:

| | today | needed |
|---|---|---|
| `maxzoom` | **10** | **13** |
| served posting at that level | 57 × 76 m | **7.2 × 9.6 m** |
| extra tiles at the finest level | — | ≈ **64×** — but Barcelona occupies only **2 tiles at z10**, so ≈ **128 tiles** |

⇒ **The fix is two values: the coverage id in `DTM_FETCH.es`, and the tileset maxzoom.** No new
source, no new licence, no new auth, no acquisition programme. It is a Phase-5 change, not a
Phase-4 one — and it is explicitly **not implemented here** (probes only).

⚠ **And the asymmetry the tracker already flags still holds and is now load-bearing:** this fix
serves the **RASANT** and does **nothing** for building heights. It must not be funded as, or
confused with, the nDSM line item.

## §V8.7 — ⚠ TWO REPO CLAIMS THIS PROBE CONTRADICTS

Both would have inverted the verdict if trusted.

1. **`tools/context-bake/terrain.mjs` line 107: `resolutionM: 5.0` for `es`.** ❌ **WRONG for what
   the code actually fetches.** The registry row also names endpoint
   `https://servicios.idee.es/wms-inspire/mdt` and `coverageId: 'EL.ElevationGridCoverage'`, but the
   **live fetch path** is `DTM_FETCH.es` → `wcs-inspire/mdt`, `Elevacion4258_25` — **measured at 25 m**.
   The registry row and the fetch adapter describe different products, and the registry is the one
   humans read. `.github/workflows/terrain-bake.yml` is the honest one: it says *"barcelona/madrid/
   cordoba (ES PNOA **MDT25**)"*. **Anyone reasoning from `resolutionM: 5.0` would conclude the
   terrain already met Nyquist.** `VERIFIED` — measured, not inferred.
2. **"Barcelona terrain is Cesium World Terrain."** ❌ Stale. On the Forma (free) path
   `CesiumViewport.maybeAttachTerrainProvider` attaches **our baked R2 quantized-mesh tileset** via
   `CesiumTerrainProvider.fromUrl`; the only alternative in that code path is
   `EllipsoidTerrainProvider` (flat, base 0) when the toggle is off, the city is un-baked, or the
   photoreal path is active. **The terrain under Barcelona is ours, and its resolution is ours to
   fix.** `VERIFIED` (source read).

## §V8.8 — WHAT WOULD FALSIFY THIS VERDICT

- **A finer tileset being served that the probe did not look at.** Falsified by: a `layer.json` for
  Barcelona with `maxzoom ≥ 13`, or an `available` array with entries beyond level 10. Re-run
  `--m1`; the probe reads `maxzoom` from the live file rather than assuming it.
- **A second terrain provider attached at runtime that I did not find.** Falsified by: a browser
  Network tab on `pryzm.fly.dev` showing `.terrain` requests to a host other than the R2 tiles base,
  or a `sampleTerrainMostDetailed` call against a provider other than the one
  `maybeAttachTerrainProvider` sets. **A code grep cannot fully close this** — the same limitation
  recorded for the proxy-deletion item in Phase 6. Treat §V8.7(2) as `VERIFIED-BY-SOURCE-READ`, not
  as observed in a browser.
- **The MARTINI TIN being adaptive in our favour.** It is not — but if a *different* tile (e.g. over
  Montjuïc, where relief is high) carried much denser vertices, the "0 in the corridor" result would
  be local. Falsified by: re-running M1 against z10/1035/747 or another reference point. ⚠ Note the
  lattice bound at §V8.3 is a **hard floor** that no adaptivity can beat: 57.3 × 76.4 m is the
  finest cell the shipped tiles can express, anywhere in the city.
- **Nyquist being the wrong bar.** If the requirement were merely "produce *a* different value at
  centroid and façade" rather than "resolve the street", a coarser grid could still yield a non-zero
  delta by interpolation. **That delta would be an interpolation artefact, not a measurement of the
  ground** — which is precisely the trap. If someone wants to argue for a looser bar, they must
  argue it explicitly and in this document.

---

# PROBE V2 — licence: may a DERIVED product be redistributed commercially?

## §V2.1 — Question

May an **nDSM computed as DSM − DTM**, reduced to per-footprint zonal statistics and baked into
**commercially distributed** 3D tiles, be redistributed under (a) IGN/CNIG **PNOA** and (b) **ICGC**
(Catalonia — the authority that covers Barcelona)?

A "no" kills path B outright.

## §V2.2 — Method

Read the **primary licence instrument**, not a summary page. Where a licence PDF could not be parsed
by the fetch layer, its content streams were **zlib-decompressed and the text operators read
directly** — that is the only reason the IGN clauses below can be quoted verbatim. Every fetch is
logged with its HTTP status in §V2.4, including the failures.

## §V2.3 — Raw evidence

### (a) IGN / CNIG — PNOA · `VERIFIED`

**Chain:** `http://www.ign.es/resources/licencia/Condiciones_licenciaUso_IGN.pdf` → HTTP **200**,
**145,381 B** → the automated fetch layer could **not** read it (FlateDecode streams) → 11 content
streams zlib-decompressed → text recovered.

**The licence IS CC BY 4.0** (not merely "compatible with" it — which is what the *summary* page
says):

> «El uso de los productos de datos geográficos digitales mencionados en el Artículo 2 tendrá
> carácter libre y gratuito, siempre que se mencione el origen y propiedad de los datos […] **el uso
> de los productos y servicios de información geográfica del IGN definidos en el ámbito de la Orden
> FOM/2807/2015 conlleva la aceptación por el usuario de una licencia CC-BY 4.0**»

**Derived works are explicit, and the worked example is PNOA itself:**

> «4. Cuando el usuario licenciado genere una **obra derivada** de uno o varios de los productos y
> servicios de datos del IGN, se añadirá «Obra derivada de» delante de la expresión general, con lo
> que quedará «**Obra derivada de \<identificador del producto\> \<fecha\> CC-BY 4.0 \<atribución de
> productores\>**» […] Como en: **Obra derivada de PNOA 2010-2013 CC-BY scne.es**»

**Two obligations bare CC BY 4.0 does NOT impose, and both bind a baked-tile pipeline:**

> «5. Si el usuario **genera un nuevo conjunto de datos por modificación del original del IGN**, el
> licenciado está obligado a […] **incluir también tales expresiones en los metadatos** […]
> concretamente […] **resumen (abstract), linaje (lineage) y en las restricciones de acceso
> (AccessConstraints)**.»

> «6. Si el usuario **genera un nuevo servicio web** […] está obligado a incorporar las expresiones
> de reconocimiento […] también en **la autodescripción del servicio (GetCapabilities o similar)**»

**Where attribution must appear** (stricter than bare CC BY):

> «Esta mención de atribución obligatoria **se mostrará visible junto con los datos, de forma legible
> y a pie de mapa, imagen, presentación o ventana de visualización.**»

Abbreviated form is permitted for space: «CC-BY 4.0 \<atribución productores\> \<fecha\>», e.g.
`CC-BY 4.0 scne.es 2010`.

**Does the licence differ between point cloud / MDT / MDS?** **No.** `VERIFIED` via
`http://www.scne.es/tablaProductos.php` → HTTP **200** — one table, one licence; only the
`<identificador>` and producer list vary (`LiDAR-PNOA-cobN`, `MDT05-cob1` / `MDT02-cob2` /
`MDT50cm-cob3`, `MDS05` / `MDS02` / `MDS50cm-cob3`, **`MDSNE` / `MDSnEdificación2,5`**).
⚠ 3rd-coverage products add producers (Unión Europea, AENA, DG de Bosques y Desertificación) — **the
attribution string changes if we ingest 3rd-coverage tiles.**

⚠ `ASSERTED-UNVERIFIED`: **Orden FOM/2807/2015** (BOE-A-2015-14129) was read only in summarised
form. It does not change the verdict — the licence PDF is the operative instrument and quotes Art. 4
itself — but it is tagged honestly.

### (b) ICGC — Catalonia · `VERIFIED`

**Chain:** `https://www.icgc.cat/en/ICGC/Public-Information/Transparency/Re-use-information` →
HTTP **200**:

> "The Creative Commons licence that rules ICGC's information is the **Attribution 4.0
> International, known as CC BY 4.0**" … allows "the **reproduction and dissemination by any means
> and the creation of information products and services based on these data with added value**".

Derived-work attribution pattern, as printed: *"**Map derived from** the Orthophoto of Catalonia
1:5.000 of the Institut Cartogràfic i Geològic de Catalunya (ICGC), **used under a CC BY 4.0
license**"*.

**Elevation products specifically** — `…/Elevacions/Elevacions-territorial/Models-delevacions` →
HTTP **200**:

> «Geoinformació de l'Institut Cartogràfic i Geològic de Catalunya subjecta a una **llicència
> Creative Commons de Reconeixement 4.0 Internacional (CC BY 4.0)**.»

⚠ **THE ONE AMBIGUITY, quoted rather than resolved by assumption.** The general clause reads:

> "The geoinformation of the ICGC (**with some exceptions, such as** the orthophotos of American
> flights, certain topographic maps 1:1,000, **etc.**) is under a Creative Commons Attribution 4.0
> International License."

*"such as … etc."* is an **open-ended, non-exhaustive** exception list. Standing alone that would be
**UNCLEAR**. It is resolved *for elevation* only because the elevation-models product page states
CC BY 4.0 affirmatively and independently. **Residual risk LOW but non-zero: for any ICGC product
other than the elevation models, re-check that product's own page. Do not rely on the general
statement.**

## §V2.4 — Fetch log (failures reported as failures)

| URL | Status | Result |
|---|---|---|
| `centrodedescargas.cnig.es/…/Condiciones_Uso_IGN_CNIG.pdf` | **404** | guessed path — does not exist |
| `ign.es/web/ign/portal/ign-aviso-legal` | **404** | guessed path |
| `ign.es/web/ign/portal/qsm-cnig` | 200 | no licence content |
| `centrodedescargas.cnig.es/CentroDescargas/politica-datos` | 200 | *summary* — says "compatible con CC-BY 4.0" ⚠ weaker than the instrument |
| `ign.es/web/ign/portal/politica-datos` | 200 | same summary; links the PDF |
| `boe.es/buscar/act.php?id=BOE-A-2015-14129` | 200 | Orden FOM/2807/2015 — **summary only**, tagged `ASSERTED-UNVERIFIED` |
| **`ign.es/resources/licencia/Condiciones_licenciaUso_IGN.pdf`** | **200 (145,381 B)** | unreadable by the fetch layer; **recovered via zlib stream extraction** — primary source for §V2.3(a) |
| `scne.es/productos.html` | **302** → `productos.php` | cross-host redirect; refetched |
| **`scne.es/tablaProductos.php`** | **200** | full product table — all LiDAR/MDT/MDS identifiers + producers |
| `creativecommons.org/licenses/by/4.0/legalcode(.en)` | 200 | §2(a)(1), §2(a)(5)(B), §3(a); no NC/SA/ND |
| `icgc.cat/ca/Coneixeu-nos/Sobre-l-ICGC/Drets-d-us` | **404** | the URL commonly cited for this is **dead** |
| `icgc.cat/…/Transparencia/Reutilitzacio-de-la-informacio` | **404** | Catalan path |
| **`icgc.cat/en/ICGC/Public-Information/Transparency/Re-use-information`** | **200** | primary ICGC re-use terms (English is the served version) |
| `icgc.cat/en/Data-and-products/…/1x1-m-Terrain-elevation-model` | **403** | blocked — **not** treated as absence |
| **`icgc.cat/ca/…/Models-delevacions`** | **200** | elevation models → CC BY 4.0, verbatim Catalan |

⚠ **Method caveat, stated because it is the difference between VERIFIED and not.** The web fetch
layer renders pages through a summarising model. Everything tagged `VERIFIED` above is either
(a) from the zlib-extracted IGN PDF, read as raw text operators, or (b) a quoted string reproduced
verbatim inside quotation marks from the primary host. Anything received only as prose summary is
tagged `ASSERTED-UNVERIFIED`.

## §V2.5 — ⇒ VERDICT

# ✅ **YES — a derived nDSM may be redistributed commercially, under both licences.**

| Question | PNOA / IGN | ICGC |
|---|---|---|
| (i) commercial use | ✅ CC BY 4.0, "even commercially" | ✅ |
| (ii) derived works redistributable | ✅ clause 4, verbatim, PNOA as the example | ✅ "products and services … with added value" |
| (iii) mandatory attribution | `Obra derivada de <identificador> <fecha> CC-BY 4.0 scne.es`, **visible at the foot of the viewport**, plus metadata abstract/lineage/AccessConstraints | `Model derivat del Model d'elevacions del terreny de l'ICGC, utilitzat sota una llicència CC BY 4.0` |
| (iv) share-alike / ND / "no alteración" | **none** | **none** |
| (v) data itself vs products from it | both permitted; ⚠ CC BY §2(a)(5)(B) — **our ToS must not purport to restrict the IGN-derived component** | both permitted |
| (vi) differs by product (LiDAR / MDT / MDS) | **no** — one licence, only the identifier and producers change | no divergence found |

**⇒ PATH B IS NOT LICENCE-BLOCKED. The G1 licence gate does not veto it.** A negative result was
the cheap outcome here and we did not get it — path B remains open on the merits.

## §V2.6 — ⚠ WHAT THIS VERDICT IS CONDITIONAL ON, and it is currently UNMET

The verdict is **YES conditional on attribution**, because attribution is the *sole* condition of
both grants. **We currently emit none.** A grep of `tools/context-bake/` for
`attribution|atribuc|Obra derivada|credits|©` finds only a README note about Overture and a German
`dl-de/by-2-0` label. **There is no attribution emission for the Spain terrain source anywhere** —
not in the tiles, not in metadata, not in the viewport. Unattributed commercial redistribution is
the one way to actually breach either licence, and IGN clause 5 adds a metadata obligation that a
baked-tile pipeline will not satisfy by accident.

Two further repo defects, both `VERIFIED`:

1. **`terrain.mjs:109` `license: 'CC-BY 4.0 (PNOA-LiDAR)'` names the wrong product.** We consume the
   **MDT raster**, not the LiDAR point cloud (§V8.3 M2 proves it: `Elevacion4258_25`). IGN requires
   the **actual product identifier** in the attribution string, so shipping *"Obra derivada de
   PNOA-LiDAR…"* would be a factually false attribution. The correct token is an `MDT…-cobN`
   identifier plus its `<fecha>`. Mirrored in
   `docs/04-reference/geospatial/CONTEXT-DATA-TERRAIN.md:49`.
2. **`commercialOk: true` is CORRECT** — verified, not refuted. That field can be upgraded from
   the table's "(UNVERIFIED)" header for Spain.

## §V2.7 — ⇒ THE FINDING THAT MOST CHANGES PATH B'S COST

`ASSERTED-UNVERIFIED`, and it should be probed before any nDSM programme is scoped:

**IGN already publishes `MDSnEdificación2,5` and `MDSNE` — pre-computed *normalised* surface models
for buildings**, under the same licence, listed in the same SCNE product table read above.
Phase 4 path B is scoped as *"acquire → difference → zonal stats → bake"*. If that product covers
Barcelona at a usable resolution, **the "difference" step is already done by the publisher** and
path B collapses toward "acquire → zonal stats → bake".

**UNKNOWN, and each must be measured, not assumed:** Barcelona coverage · actual grid resolution ·
download route and whether it is keyless · vintage · whether "normalised" means the same thing we
need (height above local ground) or something narrower.

## §V2.8 — WHAT WOULD FALSIFY THIS VERDICT

- A **product-specific** "condiciones específicas" page for PNOA-LiDAR/MDT/MDS carrying a carve-out
  the general licence does not. None was found; the SCNE table shows one licence across all rows.
- A **superseding Orden** replacing FOM/2807/2015.
- PNOA-LiDAR/MDT being **removed** from the `scne.es` product table (all three coverages are
  currently present).
- For ICGC: the elevation models later landing inside that open-ended *"etc."* exception list, or an
  elevation-specific terms page contradicting the general CC BY 4.0 statement. **The 403 on the
  1×1 m terrain-model page means one relevant page was NOT read** — that is a real gap, not a
  clean bill.

---

# PROBE V3-gate — do ML heights beat `levels × 3.2 m`?

## §V3.1 — Question

Do **Overture / Microsoft-ML** building heights beat **`building:levels × 3.2 m`** when both are
scored against our **surveyed ground truth**? If not, **path A is worthless** — swapping our
estimate for someone else's estimate relocates the error rather than reducing it.

## §V3.2 — Method

Three stages, each rerunnable and each writing its intermediate file
(`tools/phase3-probes/probe-v3-ml-heights-vs-levels.mjs`).

| Stage | Source | Instrument |
|---|---|---|
| **A** | Overture Maps buildings, release `2026-07-22.0` (the release `tools/context-bake/bake.mjs` pins) | DuckDB 1.1.3 over the public S3 GeoParquet, anonymous. Keeps **per-property source attribution** |
| **B** | **our own baked `buildings.pmtiles` on R2** — the bytes the client actually reads | PMTiles range reads, MVT decode, z16, 600 tiles |
| **C** | offline | greedy one-to-one nearest-centroid match (tol 12 m), then scoring |

Study bbox `[2.10, 41.35, 2.23, 41.45]` — deliberately the **same bbox**
`CONTEXT-BUILDING-SOURCE-EVALUATION.md` used, so the counts are comparable.

**Two design decisions that carry the whole probe:**

1. **Polygon-only feature filter** in stage B. `osmium export` emits every building **twice** (as a
   linestring and as a polygon) — the §BAKE-GEOMETRY-TYPES defect from L-513b. Without the filter
   every footprint double-counts. The probe replicates the shipping reader's rule rather than
   inventing one.
2. **An admissibility check that runs BEFORE the score is allowed to mean anything** (§V3.4b/§V3.5).
   This is the guard against the wrong-PROPERTY error. It fired.

## §V3.3 — Raw measurement

### Stage A — Overture · `VERIFIED`

DuckDB over `s3://overturemaps-us-west-2/release/2026-07-22.0/theme=buildings/type=building/*`,
157.9 s, anonymous:

| | |
|---|---|
| features in bbox | **85,725** |
| carrying a `height` | **17,728 (20.7%)** |

⚠ **This exactly reproduces `CONTEXT-BUILDING-SOURCE-EVALUATION.md` line 49 (85,725 / 17,728 /
20.7%)** from a fresh query. That doc's Barcelona row is **independently confirmed**.

**Where those heights come from** — `sources[]` filtered to `property = '/properties/height'`:

| height source | n | share of heighted |
|---|---|---|
| **Microsoft ML Buildings** | **15,835** | **89.3%** |
| unattributed (whole-feature provenance only) | 1,893 | 10.7% |
| OpenStreetMap, property-attributed | **0** | 0.0% |

Whole-feature source mix in the bbox: `OpenStreetMap` 79,307 · `Microsoft ML Buildings` 1,580 ·
`Instituto Geográfico Nacional (España)` 4,838. **IGN contributes footprints here, not heights.**

### Stage B — our baked tiles · `VERIFIED`

`https://…r2.dev/tiles/buildings.pmtiles`, header `minZoom=12 maxZoom=16 tileCompression=2`;
z16 x 33150..33173 · y 24462..24486 = **600 tiles** → **493 ok · 107 empty/no-layer · 0 failed**.

| | n | share |
|---|---|---|
| unique polygonal buildings | **96,472** | — |
| `tagged` (a real surveyed OSM `height`) | **454** | **0.5%** |
| `derived-levels` (real `building:levels` × our 3.2 m) | **61,141** | **63.4%** |
| `assumed` (the fabricated 9 m default) | **34,877** | **36.2%** |

⚠ **THIS IS A DIFFERENT DENOMINATOR FROM L-582 AND MUST NOT BE QUOTED AS A CONTRADICTION.** L-582
measured **23,251** footprints across **four named districts** and got 0.9% / 79.3% / 19.8%. This is
**96,472** footprints across the **whole 2.10–2.23 × 41.35–41.45 bbox**, which includes low-density
periphery where `building:levels` is much sparser. Both are true; they measure different areas.
**State which denominator you mean, every time** — the same rule §2.0 of the tracker applies to
coverage. L-582's script did not survive; **this stage is a working re-implementation of that
measurement and can be re-run.**

### Stage C — match · `VERIFIED`

Greedy one-to-one nearest centroid, tolerance 12 m: **78,650 of 96,472 matched (81.5%)**;
17,822 unmatched. Match distance (m): median **2.19** · p75 3.59 · p90 5.94 · p95 7.87 · p99 10.91.
**The match is tight** — the median pairing is 2.2 m apart, so pairing error is not driving the
result.

### §V3.4 — THE HEAD-TO-HEAD, n = 133

Ground truth = a matched building carrying a **surveyed OSM `height`**: **305**.
Of those, also having `building:levels` (so estimator 1 exists) **and** an Overture height (so
estimator 2 exists): **n = 133** — the same 133 buildings score both estimators.

| |error| (m) | median | p75 | p90 | p95 | p99 | max | mean | RMSE | ≤1 m | ≤2 m | ≤3 m |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **E1 — ours, `levels × 3.2`** | **3.20** | 5.60 | 16.80 | **21.80** | 35.20 | 35.60 | 5.71 | **9.31** | 21.8% | 33.1% | 49.6% |
| **E2 — Overture** | **0.00** | 0.00 | 0.00 | **0.00** | 0.00 | 3.33 | 0.03 | **0.29** | 99.2% | 99.2% | 99.2% |

Signed error, ours: median **−0.80**, mean **−3.13** — **we under-estimate on average.** Paired,
per building: ours closer **1 (0.8%)**, Overture closer **132 (99.2%)**.

**On its face Overture annihilates our estimator.** It does not.

### §V3.4b — ⛔ ADMISSIBILITY — THE SCORE IS INVALID

| | n | share |
|---|---|---|
| Overture height **exactly equals** the surveyed height (< 1e-6 m) | **132 / 133** | **99.2%** |
| within 0.01 m | 132 / 133 | 99.2% |
| height attributed to **Microsoft ML** on this set | **0** | 0.0% |

**Overture is not estimating these buildings. It is echoing the ground truth back.** On the surveyed
set, Overture's height *is* the OSM `height` tag we already hold — the exact tag that *defines* the
ground truth. The 0.29 m RMSE is the ground truth grading itself.

⇒ **The head-to-head in §V3.4 is INADMISSIBLE as evidence about path A.** Reported in full precisely
because it is the number a less careful probe would have published as a decisive win for path A.

### §V3.5 — ⭐ DISJOINTNESS — the measurement that actually decides it

| | n |
|---|---|
| matched buildings carrying an **ML-attributed** Overture height | **14,803** |
| of those, **also** carrying a surveyed OSM height | **0** |

# **ZERO OVERLAP.**

Overture's conflation applies the ML height **only where OSM has no height**. The two populations are
**disjoint by construction**. Therefore:

**⇒ The ML heights CANNOT be scored against our surveyed ground truth. Not "they lose" — the
experiment does not exist.** Any future claim that ML heights were validated against our 0.9%
surveyed set is measuring the wrong population, and this is the measurement that proves it.

### §V3.6 — INDIRECT DIAGNOSTIC — the one check that IS available, and ML fails it

No ground truth is needed for this. For buildings carrying a **real floor count** and an **ML
height**, the implied storey height `ML_height ÷ levels` is a physical quantity with a known
plausible band (~2.6–4.0 m for European residential). `n = 8,523`:

| implied storey height (m) | min | p05 | p25 | **median** | p75 | p90 | p95 | p99 | max |
|---|---|---|---|---|---|---|---|---|---|
| | 0.18 | 1.27 | 1.86 | **2.37** | 3.17 | 4.66 | 6.06 | 9.77 | 25.06 |

| | n | share |
|---|---|---|
| inside a plausible **2.6–4.0 m** band | 2,194 | **25.7%** |
| **below 2.6 m/storey** | 5,081 | **59.6%** |
| above 4.0 m/storey | 1,248 | 14.6% |
| **below 2.5 m/storey — physically impossible for a habitable floor** | **4,745** | **55.7%** |

**More than half the ML heights imply a storey height that cannot exist in a habitable building.**
The median implied storey is **2.37 m** — 0.83 m below our 3.2 m constant and below any Spanish
habitability minimum once a slab is included. The distribution is not merely biased, it is **wide**:
p05 1.27 m to p95 6.06 m on the same instrument.

`|ML − levels×3.2|` on this set: median **4.20** · p75 7.75 · p95 **14.85** · max 64.28 m.
⚠ **That is AGREEMENT, not accuracy** — two estimates disagreeing tells you at least one is wrong;
two agreeing would prove neither. It is reported for scale, not as a score.

⚠ **Honest counter-reading, stated because it is the strongest objection.** A low implied storey
could also mean OSM's `building:levels` is *over*-stated rather than the ML height under-stated —
`building:levels` excludes basements but is sometimes tagged inconsistently. **This probe cannot
separate the two**, and does not claim to. What it does establish is that **the two independent
signals are grossly inconsistent on 74.3% of a 8,523-building sample**, which is sufficient to deny
path A the claim "ML heights are better".

### §V3.7 — INCREMENTAL COVERAGE — path A's real payload

Path A's other justification is coverage: heights where we currently have **none**.

| | n | share |
|---|---|---|
| matched buildings today rendering the **fabricated 9 m default** | **28,195** | — |
| of those, Overture supplies **a** height | **6,329** | **22.4%** |
| of those, attributed to Microsoft ML | 6,280 | 99.2% |

⇒ Path A would replace a fabricated 9 m on **22.4%** of the fabricated population with an
**ML-estimated, unvalidatable** number that fails §V3.6. It would also move those buildings from
`assumed` (which the client honestly renders as *"Unknown"* / wireframe) to something the ladder
would rank higher — **converting a visible admission of ignorance into an invisible one.** That is
the §CONTEXT-DATA-HONESTY failure mode, in the direction the tracker already warns about:
*"An honest 0.9% beats a laundered 100%."*

## §V3.8 — ⇒ VERDICT

# ⛔ **PATH A DOES NOT CLEAR.**

Precisely stated, because the imprecise version is wrong in both directions:

1. **The question as posed is UNANSWERABLE.** ML heights and our surveyed ground truth are
   **disjoint (0 of 14,803)**. There is no experiment. `VERIFIED`, n = 14,803.
2. **The apparent 99.2% win for Overture is a TAUTOLOGY** — 99.2% of the scored Overture heights are
   *exactly* the ground truth. `VERIFIED`, n = 133.
3. **The only independent check available says the ML heights are bad:** 55.7% imply a physically
   impossible storey height; only 25.7% are plausible. `VERIFIED`, n = 8,523.
4. **The coverage it buys is real but modest** — 22.4% of the fabricated-9 m population — and buying
   it *hides* the uncertainty rather than resolving it. `VERIFIED`, n = 28,195.

⇒ **Do not ingest Overture/MS-ML heights for Barcelona.** The tracker's own rule applies:
*"Fails ⇒ skip it entirely and wait for the nDSM."*

⚠ **Scope.** This is a **Barcelona** verdict. Overture's height mix is per-city; a city where the ML
share, or the ML quality, differs must be probed separately. Notably `README.md` already records
Overture height at ~0% in Saudi — the failure mode there is absence, here it is quality.

## §V3.9 — ⇒ THE BY-PRODUCT THAT IS WORTH MORE THAN THE VERDICT

**We now have, for the first time, a measured error distribution for OUR OWN height estimator**
against surveyed truth (n = 133, §V3.4):

> `levels × 3.2 m` — median |error| **3.20 m** · p95 **21.80 m** · RMSE **9.31 m** · only **49.6%**
> within ±3 m · signed mean **−3.13 m (we under-estimate)**

⚠ **This is the number that should be attached to `derived-levels` wherever the product presents it.**
The client currently prefixes such heights with *"≈"*; **"≈" is doing the work of "±3 m at the
median, ±22 m at the p95".** For envelope work — where a height feeds a legal maximum — a p95 of
21.8 m is not a rounding note.

⚠ And it is a **third** independent argument for the nDSM: not just coverage (36.2% fabricated) and
not just honesty, but that **our own estimator's tail is 22 m wide on the 0.5% we can check.**

## §V3.10 — WHAT WOULD FALSIFY THIS VERDICT

- **A different ground truth.** The whole probe rests on OSM `height` tags being "surveyed". They are
  the repo's stated ground truth, but they are **crowd-sourced, not surveyed by us** — `n = 454`
  city-wide, `n = 133` scored. A **cadastral or LiDAR ground-truth set** would supersede this
  entirely, and would also break the disjointness that makes §V3.5 fatal — because a non-OSM ground
  truth **would** overlap the ML population. **This is the single change that would make V3
  answerable, and it is the same acquisition as path B.**
- **The match being wrong.** Falsified by: a materially different result at a tighter tolerance.
  Median match distance is 2.19 m against a 12 m tolerance, so this is unlikely — but `--score` is
  offline and the tolerance is a one-line change, so it is cheap to test.
- **`building:levels` being systematically wrong**, which would invalidate §V3.6 (see the honest
  counter-reading there). Falsified by: comparing `building:levels` against Catastro `ALTURAS` floor
  counts on a sample — **a probe worth running, and not run here.**
- **A newer Overture release with a different height provenance mix.** The release is pinned in the
  script; re-run stage A with `PRYZM_OVERTURE_RELEASE` to test.
- **§V3.7's coverage being understated** because 17,822 of our buildings did not match any Overture
  feature. If those skew toward the fabricated population, path A's coverage gain is larger than
  22.4%. **UNKNOWN — not measured.** It would not change the quality verdict.

---

## §4 — WHAT PHASE 4 AND PHASE 5 LOOK LIKE AFTER THESE THREE PROBES

*Prose for the tracker; not landed here (§3 of the tracker is not edited by this document).*

| | Before Phase 3 | **After Phase 3** |
|---|---|---|
| **Path A** (Overture/MS-ML attribute join) | "days, ML-estimated, licence risk" | ⛔ **closed.** Unvalidatable against our ground truth (disjoint), and fails the one independent plausibility check available (55.7% impossible). Licence was never the blocker; **quality is** |
| **Path B** (nDSM) | "weeks, measured, **G1 licence gate can veto**" | ✅ **licence-cleared** for commercial redistribution of a derived product, conditional on attribution we do not emit. And possibly **cheaper than scoped** — IGN may already publish the normalised model (`MDSnEdificación2,5`), which must be probed before the programme is sized |
| **Phase 5 / rasant (L-584)** | "we have terrain; the defect is one sample at the block centroid" | ⛔ **the terrain cannot resolve a street.** The single-sample defect is real but is **not the binding constraint** — fixing the sampling on 25 m source data delivered at 57 m posting would change nothing. **V6 must not be run until §V8.6 lands** |
| **The cheapest real win on this board** | — | **§V8.6: swap `Elevacion4258_25` → `Elevacion4258_5` and raise the tileset maxzoom 10 → 13.** Same endpoint, same licence, keyless, ~128 extra tiles for Barcelona. Measured 3.76 × 5.03 m — meets Nyquist |
| **The most valuable unrun probe** | — | **does `MDSnEdificación2,5` cover Barcelona, at what resolution, by what route?** It sits on the critical path of the only surviving height programme |

⚠ **Do not fund the rasant fix and the height programme as one line item.** V8 and V3 confirm the
tracker's asymmetry from opposite ends: **a DTM upgrade serves the RASANT and does nothing for
heights; an nDSM serves HEIGHTS and does nothing for the rasant.** They are separate programmes with
separate sources and separate acceptance tests.

⚠ **And the Phase-4 schema note stands and is now more urgent, not less.** Path B writes a *measured*
height onto a footprint whose *shape* came from OSM. Today's context feature carries shape and
height as one record from one provider, so there is nowhere to put it. **Splitting the pair is
cheap, is a schema change not a pipeline, and is now the ONLY surviving height path's prerequisite.**

---

## §5 — HOW TO RE-RUN

```bash
# V8 — no dependencies at all
node tools/phase3-probes/probe-v8-terrain-posting.mjs           # all four measurements
node tools/phase3-probes/probe-v8-terrain-posting.mjs --json    # machine-readable

# V3 — two external tools, both free, both OUTSIDE the pnpm workspace on purpose
#   (a package.json inside the repo would break --frozen-lockfile)
#   DuckDB CLI  → github.com/duckdb/duckdb/releases
#   node deps   → npm i pmtiles@4 @mapbox/vector-tile@2 pbf@4   (in any scratch dir)
PRYZM_DUCKDB=/path/to/duckdb PRYZM_V3_DEPS=/path/to/scratch \
  node tools/phase3-probes/probe-v3-ml-heights-vs-levels.mjs --out ./v3-probe-out
# stages are independent and rerunnable: --overture | --osm | --score
```

Both probes print every fetch with its **HTTP status, byte count and content-type**. Per
§CONTEXT-DATA-HONESTY: a 404, a 403, a timeout, an empty result and a **200 with a truncated body**
are five different outcomes and none of them is "there is nothing there".

---

*Authority: `GEOGRAPHIC-ROLLOUT-MASTER-TRACKER.md` §3 (the task) · §2.0 (the three rules governing
every number) · `DENMARK-GAP-ROADMAP.md` §G11 (evidence-chain format) · C58 §1.6 · C63.
Created 2026-07-31. Probes only — **no Phase-4 implementation was performed.***
