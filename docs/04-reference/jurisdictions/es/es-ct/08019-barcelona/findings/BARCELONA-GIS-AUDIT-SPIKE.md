# BARCELONA-GIS-AUDIT-SPIKE — does the official planning GIS already carry the envelope number?

**2026-07-24.** Live audit (curl against the production ArcGIS/WFS services, asserting on
Content-Type + body) of Barcelona's PUBLISHED planning GIS, to test the L-590h hypothesis that the
~48% envelope ceiling is a hard wall because *"parcel-level height is ~0% extractable — it lives on
un-OCR-able plànol drawings, and vectorising them is a separate project beyond OCR."*

> ## HEADLINE — the hypothesis is PARTLY REFUTED. The vectorisation L-590h called "a separate, harder, beyond-OCR project" HAS ALREADY BEEN DONE by the AMB and is published as a queryable GIS attribute.
>
> The **qualification** polygon (what PRYZM joins today) carries the clau **code only** — no
> dimension — so **48% stays the proven MINIMUM.** But a **separate official layer, `OV_Trames`
> (Ordenació Volumètrica) in the AMB "Refós de Planejament", carries `PLANTES` (floor count) as a
> 100%-populated polygon attribute** — 5,073 Barcelona polygons, real values `B+1…B+32`, including
> `18hs`. **Footprint polygon + floor count = an extrudable envelope.** Measured coverage of the
> clau-18 slice (the R1 blocker, 22.5% of private buildable land, previously a permanent refusal):
> **~32% (interior-point lower bound) to ~64% (polygon-intersect / area-ratio upper bound)** of
> clau-18 qualification area falls inside an `OV_Trames` polygon carrying a floor count. Buildable
> **depth** is also digitised (`Cotes` polylines, `LONGITUD` in metres, 4,725 lines) but as loose
> annotation, not a clean parcel join. **Revised honest band: 48% MIN (proven) · ~58% LIKELY ·
> ~68% POSSIBLE**, each conditional and tied below to a specific attribute on a specific layer.

⚠ **The single correction to the model:** L-590h measured the wrong artifact for the height
question. It read the raw **Pla Parcial PDFs** (where height genuinely IS an un-OCR-able block-label →
plànol, 0/24) and concluded the number is unreachable. It never queried the **AMB Refós GIS**, which
is the AMB's own *"transcripció gràfica i alfanumèrica del contingut dels expedients"* — i.e. the AMB
has already vectorised those plànols into floor-count polygons. The number PRYZM was going to
reconstruct from drawings is **already a queryable field**. It does not exist for every parcel, and
it is floors-not-metres, so it lifts the ceiling partially, not to Denmark — but "gap-to-ceiling ~0"
is wrong.

---

## 1 — Reachable endpoints (all probed LIVE, 2026-07-24, HTTP 200)

| # | Service | Endpoint | Content-Type verified | What it is |
|---|---|---|---|---|
| A | **MUC WFS** (Generalitat, Mapa Urbanístic de Catalunya v1.2) | `https://sig.gencat.cat/ows/PLANEJAMENT/wfs` | `application/xml` (Caps), `application/json` (GetFeature) | Catalonia-wide synthetic qualification + development-sector polygons |
| B | **AMB Refós de Planejament** (ArcGIS REST MapServer) | `https://geoportal.amb.cat/geoserveis/rest/services/qualificacio_refos_3857/MapServer` | `application/json` | The metropolitan consolidated planning transcription — **the layer that carries the dimensions** |
| C | Open Data BCN "Mapa urbanístic" | `opendata-ajuntament.barcelona.cat/data/ca/dataset/mapa-urbanistic` | — | **WMS/WMTS only** — raster tiles, `API CKAN: No`. Carries NO downloadable attribute table. Dead for this question. |
| D | Open Data BCN "Qualificacions i altres elements urbanístics" | via WMS | — | WMS render of qualification + volumetric ordination + substitute alignment. Raster, not attributed download. |

Service B provenance (from `?f=json` copyrightText): **"Servei d'Informació Urbanística — Àrea de
Desenvolupament de Polítiques Urbanístiques, AMB."** Official AMB urban-planning data service. It is
a *transcription* (Refós), so vintage/authority still needs the L-449 certification gate before any
value ships — a wrong-vintage transcription passes the gate as easily as a right one (the L-526 trap).

**Note on the founder-relayed CartoBCN DGN layers (`QUA_13PE_PL`, `QUA_11VP_PL`, `QUA_12VC_PL`,
`QUA_08_PL`).** Those are MicroStation **DGN** (CAD) level names on `w20.bcn.cat/CartoBCN`. DGN is a
drawing format — geometry + level(layer) name, generally **no attribute table**. I did not fetch a
raw DGN (it is a bulk CAD download, not a queryable service). The **AMB Refós ArcGIS service (B) is
the attributed GIS equivalent of the same content** — `QU_*` = qualificació, `OV_*` = ordenació
volumètrica, `Cotes` = the profunditat/amplada dimension lines — and it is what actually answers "does
the geometry carry the number." So the audit went to the attributed source, not the CAD.

---

## 2 — THE MATRIX: layer × (geometry? · dimensional attribute? · envelope value · replaces PDF?)

Every row below was pulled live (DescribeFeatureType / MapServer layer `?f=json` / a real
`GetFeature` over `CODI_INE='08019'`).

### Qualification polygons — geometry + CODE ONLY, no dimension

| Layer (service) | geometry? | dimensional attribute? | value carried | replaces PDF? |
|---|---|---|---|---|
| **`MUC_QUALIFICACIONS`** (A) | ✅ polygon | ❌ **none** | `CODI_QUAL_AJUNT` = the clau (`'18'`, `'20a'`, `'6a'`…) + description. **No depth/height/floors/FAR.** | ❌ gives *identity*, not envelope |
| **`QU_Trames`** (B, layer 16) | ✅ polygon | ❌ **none** | `CLAU_URB`, `SIGLES`, `SINTETIC`, `CODI_SECT`, `NORMATIV`, `INE_URB`. Codes + refs, **no dimension**. | ❌ same — the clau, not the number |
| `MUC_PDERIVAT_QUALIFICACIO` (A) | ✅ polygon | ~ | `SUPERFICIE_SOL` only (soil area). No envelope. | ❌ |

⇒ **This is why 48% is the floor and stays there.** The polygon PRYZM point-in-polygon-joins to a
parcel today (`qualificacio_refos`) tells you the clau and nothing dimensional. A parcel whose only
GIS hit is a qualification polygon still needs the ordinance/PDF for the envelope.

### Volumetric ordering — CARRIES THE DIMENSION (this is the finding)

| Layer (service) | geometry? | dimensional attribute? | value carried | replaces PDF? |
|---|---|---|---|---|
| **`OV_Trames`** (B, layer 17) | ✅ polygon | ✅ **`PLANTES` (floor count)** | `PLANTES` `'B+7'`,`'B+5'`,`'PX+3'`,`'B+32'` — **100% populated** on all 5,073 BCN polygons, 46 distinct real values. Plus `CLAU` (`'18hs'`,`'7b/13E*-'`,`'22@…'`), `SIGLES`, `EXP` (expedient). | ✅ **PARTIAL→FULL for the covered slice.** Footprint (the polygon) + floors → extrudable volume. Height via floor→m needs a convention (§4). |
| `OV_Etiquetes` (B, layer 11) | point | ~ | `TEXTSTRING` = the map label text (annotation). Not a structured field. | ~ annotation only |
| **`MUC_SECTOR_DESENVOLUPAMENT`** (A) | ✅ polygon | ✅ **`INDEX_EDIF_BRUTA` (FAR)** | `INDEX_EDIF_BRUTA` (e.g. `2.45`), `DENSITAT`, `NUM_HABITATGES`, `SUP_SOSTRE_HPO`, `SUP_SOL_PRIVAT`, +25 fields. Populated for pending/development sectors. | ✅ **for development sectors** — sector-level FAR, structured, **no OCR needed**. But sector-level, **no height**. |
| `MUC_PDERIVAT_SECTOR` (A) | ✅ polygon | ~ | `EXPEDIENT`, `NOM_PLA`, `ESTAT_PLANEJAMENT`, `SUP_TOTAL_SECTOR`. Index/signpost, no envelope. | ❌ (this is the signpost tier — L-590h §6) |

### Buildable depth — digitised, but as loose dimension geometry

| Layer (service) | geometry? | dimensional attribute? | value carried | replaces PDF? |
|---|---|---|---|---|
| **`Cotes`** (B, layer 3) | ✅ **polyline** | ✅ **`LONGITUD` (metres)** | `LONGITUD` `'20.0'`,`'30.0'`,`'8.0'`,`'15.0'` — 4,725 BCN dimension lines, one `CAPA` type `LinCotaAMPC` (amplada/profunditat cota). | ~ **PARTIAL** — the depth number IS digitised, but as a **loose dimension line**, not bound to a parcel/façade. Needs spatial association to consume. |
| `xbld_Etiquetes` (B, layer 9) | point | ❌ | `NOMBLOC`, `CLAUPD`, `HABPROT`, `EXP` — block/plan labels. **No depth number.** | ❌ |

---

## 3 — THE MEASURABLE ANSWER

**Q: What fraction of Barcelona residential parcels already intersect an official buildable-depth or
volumetric polygon that carries a usable dimensional attribute?**

Measured on the **clau-18** slice (Ordenació en volumetria específica — the R1 blocker, ~22.5% of
private buildable land, previously a permanent refusal), because that is the slice `OV_Trames` is
built for. Method: pulled all **1,282** BCN clau-18 `QU_Trames` polygons (`CLAU_URB LIKE '18%'`,
`SHAPE_Area` sum = **5.60 M m²**); sampled 80; point-in-polygon and polygon-intersects tested each
against `OV_Trames` filtered to `PLANTES IS NOT NULL`.

| estimator | coverage of clau-18 by an OV polygon carrying `PLANTES` | note |
|---|---:|---|
| interior-point (avg-of-vertices, **biased LOW** — lands outside concave parcels) | **32.5%** (26/80) | lower bound |
| polygon-intersects (any overlap, biased HIGH — counts edge touches) | **63.8%** (51/80) | upper bound |
| area ratio cross-check: `OV_Trames` total area 3.55 M m² ÷ clau-18 QU area 5.60 M m² | **63.4%** | independent, corroborates the upper bound |

**Best reading:** the polygon-intersect rate (63.8%) and the independent area ratio (63.4%) coincide
— strong evidence that `OV_Trames` covers essentially the **built footprint** of the clau-18 zone
(~60%), the uncovered ~37% being interior patios / setbacks that carry no volume anyway. So **roughly
half to two-thirds of clau-18 buildable land already intersects a polygon that carries an explicit
floor count.** That floor count is a *usable* dimensional attribute: `OV_Trames` polygon = footprint,
`PLANTES` = storeys → extrude → the envelope.

**Depth:** digitised city-wide (4,725 `Cotes` lines with metres) but **not parcel-joinable as-is** —
counts as "present, not yet consumable," not as a clean win.

**Sector FAR:** `INDEX_EDIF_BRUTA` is a populated structured attribute for development sectors — a
free sector-level FAR with no OCR, matching L-590h §2.1's OCR win but as data.

---

## 4 — WHAT THIS DOES TO THE CEILING (evidence-tied, two denominators kept)

Per C58 §1.2/§1.4, each number is tied to a *specific attribute on a specific layer*, and "geometry
exists" is kept sharply distinct from "geometry carries the number."

| tier | ceiling | tied to | confidence |
|---|---:|---|---|
| **MIN** | **~48%** | The qualification polygon (`QU_Trames`/`MUC_QUALIFICACIONS`) carries the **clau code only, no dimension** (§2). Where a parcel's only GIS hit is the qualification, the envelope still needs the PDF. The Pla Parcial OCR wall (L-590h, 0/24 heights) is real. **PROVEN — unchanged.** | proven |
| **LIKELY** | **~58%** | `OV_Trames.PLANTES` is a **100%-populated floor-count attribute** covering **~50% (32–64%)** of clau-18 (22.5% of buildable). `0.5 × 22.5% ≈ +11 pts`. Footprint = the OV polygon; floors → height via the **already-shipped** `bcnAlcadaReguladora.ts` Art. 327.2 table (RATE plan §4 / L-525a) — **no new machinery**. Conditional on: (a) L-449 certifying the Refós vintage; (b) building the OV point-in-polygon resolver. | **measured, conditional** |
| **POSSIBLE** | **~68%** | `OV_Trames` also carries `PLANTES` for volumetric parcels in **other claus** (`7b/13E`, `7-derived`, `22@` seen in the data) — not measured here — and `Cotes.LONGITUD` gives buildable **depth** for alignment claus **if** spatially bound to façades. Both are real data already published; folding them in is a build, not a data-acquisition. | plausible, **un-measured** — do not bank |

**~80%+ stays gated** behind: the residual uncovered clau-18, alignment-clau depth binding (`Cotes`
→ parcel), floor→metre certification per subzone, and the parcels with no OV/Cotes at all.

**The precise correction to L-590h / the RATE plan:** the claim *"parcel-level height ~0%, reachable
only by a plànol-vectorisation project beyond OCR"* was measured against the **PDF corpus** and is
true **there** — but the height (as floors) and the depth (as metres) are **already vectorised and
published as GIS attributes by the AMB.** "Construction becomes reading" for the covered volumetric
slice. Not for all of Barcelona (the qualification-only parcels still refuse), so **48% remains the
honest floor and Denmark's 96% remains far** — but the pilot's "gap-to-ceiling ~0, ceiling is a hard
48% wall" is refuted: there is ~+10 proven and ~+20 possible on the table, in official data, reachable
now.

---

## 5 — REPRODUCE (exact live calls)

```bash
AMB="https://geoportal.amb.cat/geoserveis/rest/services/qualificacio_refos_3857/MapServer"
# OV_Trames carries floors — 5,073 BCN polygons, ALL populated:
curl "$AMB/17/query" --data-urlencode "where=CODI_INE='08019'" --data "returnCountOnly=true&f=json"
curl "$AMB/17/query" --data-urlencode "where=CODI_INE='08019' AND PLANTES IS NOT NULL AND PLANTES<>''" --data "returnCountOnly=true&f=json"   # → 5073 == total
curl "$AMB/17/query" --data-urlencode "where=CODI_INE='08019' AND CLAU LIKE '18%'" --data "outFields=CLAU,PLANTES,EXP&returnGeometry=false&f=json"  # → 18hs / B+7 ...
# QU_Trames carries NO dimension (code only):
curl "$AMB/16/query?f=json&returnGeometry=false&resultRecordCount=1&where=CODI_INE%3D%2708019%27&outFields=*"
# Cotes carries depth in metres:
curl "$AMB/3/query" --data-urlencode "where=CODI_INE='08019'" --data "outFields=CAPA,LONGITUD&returnGeometry=false&resultRecordCount=8&f=json"
# MUC WFS — qualification (code only) + sector FAR:
WFS="https://sig.gencat.cat/ows/PLANEJAMENT/wfs?service=wfs&version=2.0.0"
curl "$WFS&request=GetFeature&typeNames=PLANEJAMENT:MUC_QUALIFICACIONS&count=5&outputFormat=application/json&CQL_FILTER=CODI_INE=%2708019%27"
curl "$WFS&request=DescribeFeatureType&typeNames=PLANEJAMENT:MUC_SECTOR_DESENVOLUPAMENT"  # → INDEX_EDIF_BRUTA
```

Measurement scripts (this session): `scratchpad/measure_cov.py` (interior-point, 32.5%),
`scratchpad/measure_cov2.py` (polygon-intersects, 63.8%).

---

## 6 — HONESTY LEDGER (C58)

- **48% is not weakened.** The qualification polygon carries no dimension — proven by
  DescribeFeatureType and a real GetFeature. Every parcel whose only hit is the qualification still
  refuses without a document.
- **"Geometry exists" ≠ "geometry carries the number"** — applied per row. `QU_Trames` has geometry,
  no number (does NOT lift the ceiling). `OV_Trames` has geometry **and** `PLANTES` (does). `Cotes`
  has the number but detached geometry (partial).
- **Floors ≠ metres.** `PLANTES` is a storey count; height needs the Art. 327.2 floor-height table.
  That table is already sourced/shipped (`bcnAlcadaReguladora.ts`), so this is a resolver step, not a
  data gap — but it is a step, and it is human-gated.
- **The Refós is a transcription.** Authority/vintage uncertified here; the L-449 gate and the L-526
  vintage-trap discipline apply before any `PLANTES` value ships as a citeable envelope.
- **Coverage is partial and clau-18-specific.** ~50% of clau-18; the non-18 OV coverage and the
  `Cotes` depth-binding are **un-measured** — the ~68% "possible" tier is explicitly not banked.
- **Barcelona-specific.** The AMB Refós exists because the AMB transcribed the 36 metropolitan
  municipalities. Madrid/Córdoba have no equivalent — this lifts **Barcelona's** ceiling, not the
  national template's.
- No fetch was fabricated; every endpoint returned HTTP 200 with the asserted Content-Type.

**Related:** `L-590h-BARCELONA-SUFFICIENCY-CEILING.md` (the PDF-corpus measurement this corrects for
the GIS artifact) · `L-590c` §11 (the ceiling) · `RATE-IMPLEMENTATION-PLAN.md` §1 (updated) · R1
blocker (`BARCELONA-COMPLETE-COVERAGE-PLAN.md` §7 — clau-18 refusal, now partly reachable).
