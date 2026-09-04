# Comunidad de Madrid (REGION, capital excluded) — envelope slot coverage + boundary-gate feasibility, MEASURED 2026-09-04

> Command: `npx tsx tools/envelope-slot-coverage/measureMadridRegion.ts --n 40 --seed 20260802` · ONLINE (idem.comunidad.madrid WFS + catastro.hacienda.gob.es ATOM) · slots: setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage, permittedUse

> Shipped state read from `esMadridSpacm.ts`: `CM_SPACM_REGISTRATION_BLOCKED = true` · `CM_SPACM_ENVELOPE_VERIFIED = false` · jurisdiction id `es-md-comunidad-madrid`. ⛔ **The capital (INE 28079) is a separate registration and is not in any frame below.**

> ⚠ TWO FRAMES PER MUNICIPALITY, NEVER BLENDED. **AS SHIPPED**: nothing routes to this adapter by click and every record carries `verification-gate-closed` ⇒ **0 numbers reach a user**; the live ordinance answer is used as a WITNESS only (a legally-grounded refusal — public system / non-urban soil / ámbito delegation — is a fact about the LAND and is F2 whether or not PRYZM shows the card). **IF SIGNED**: the same records under `verificationGateOpen: true` — a demonstration of what an L-449 signature would open, not an authorisation.

> ⚠ A slot is counted RESOLVED only when the record is DRAWABLE (no refusal, envelope non-null, grammar known) and the dimension is `isKnown`. `computeBuildableEnvelope` is NOT run: the adapter emits a `GeometricRule`, and building a pack around it would wire the registration this arm may not wire. `permittedUse` can never resolve here (the adapter does not read `DS_US_PRED`); `depth` (NM_FDO_MX_ED) has no shared slot and is reported beside the eight.

## GOAL A — `Callejero:SIGI_V_MUNICIPIOS` as a polygon `contains` routing gate (FEASIBILITY EVIDENCE, NOT WIRED)

> Request (the exact shape of `tools/madrid-spacm-probe/02-paging-and-domains.mjs` §b): `https://idem.comunidad.madrid/geoserver3/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=Callejero%3ASIGI_V_MUNICIPIOS&outputFormat=application%2Fjson&count=1000`

> HTTP 200 · `application/json;charset=UTF-8` · **4,121,578 bytes**

- Saved verbatim to `out/cm-sigi-municipios.geojson` — **4,121,578 bytes**, **179 features** (the layer's own census is 179).
- CRS the features ARRIVE in: declared `urn:ogc:def:crs:EPSG::25830` · inferred from coordinate magnitude: **projected-metres**.
- Geometry types: Polygon × 170, MultiPolygon × 9 · **192 rings · 153,499 vertices** in total.
- Properties: `CDID`, `CDMUNICIPIO`, `DSMUNICIPIO_ORI`, `DSMUNICIPIO`.
- The INE key: property **`CDMUNICIPIO`**, 3-digit zero-padded (INE-5 with the `28` province prefix stripped); 179 distinct values over 179 features. Compose INE-5 as `'28' + CDMUNICIPIO` — the same key `sitcm:VPLA_V_ORDENANZA.CD_MUNICIPIO` uses (`'079'` returns 22,181 rows; `'28079'` returns ZERO on a clean 200).

### Per-municipality (the two that interleave, plus the two Goal-B municipalities and Moralzarzal)

| CDMUNICIPIO | DSMUNICIPIO | geometry | rings | vertices | bbox WGS84 lon | bbox WGS84 lat | bbox quoted in `esMadridSpacm.ts` (read 2026-08-02) |
|---|---|---|---:|---:|---|---|---|
| 079 | MADRID | Polygon | 1 | 4,539 | [-3.885537, -3.519992] | [40.310222, 40.64397] | lon [-3.888963, -3.518126] lat [40.312065, 40.64328] |
| 022 | BOADILLA DEL MONTE | Polygon | 1 | 477 | [-3.951887, -3.83848] | [40.377021, 40.456653] | lon [-3.952589, -3.837814] lat [40.377684, 40.456197] |
| 045 | COLMENAR VIEJO | Polygon | 1 | 3,837 | [-3.864397, -3.585483] | [40.591161, 40.732896] | — |
| 090 | MORALZARZAL | MultiPolygon | 2 | 459 | [-3.996108, -3.874619] | [40.597075, 40.718343] | — |
| 080 | MAJADAHONDA | Polygon | 1 | 1,057 | [-3.944704, -3.834821] | [40.441702, 40.502221] | — |

### Are 079 (MADRID) and 022 (BOADILLA DEL MONTE) geometrically disjoint?

- bboxes overlap: **true** (this is the 4.35 km interleave the registration is blocked on).
- vertices of 079 strictly inside 022 (shipped even-odd PIP): **0** · vertices of 022 inside 079: **0**.
- PROPER segment crossings between the two boundaries (0 bbox-overlapping segment pairs tested): **0**.
- shared boundary vertices (identical to 1 mm): **0** — no shared vertices (not neighbours in this layer).
- ⇒ **interiors disjoint: YES**.

### 20 known points through the SHIPPED even-odd PIP (`geometry/pointInRingsEvenOdd.ts`) — **20 of 20 land in exactly ONE municipality**

`band` = inside the 4.35 km longitudinal interleave of the two quoted bboxes. `expect` is the author's prior; the polygon wins.

| point | lat, lon | band | hits (CDMUNICIPIO → DSMUNICIPIO) | exactly one | expect | agrees | DP-20 m same | DP-50 m same |
|---|---|:-:|---|:-:|---|:-:|:-:|:-:|
| Puerta del Sol (Madrid capital) | 40.41694, -3.70347 |  | 079 → MADRID | ✓ | 079 | ✓ | ✓ | ✓ |
| Boadilla del Monte — Plaza de la Cruz (town centre) | 40.40560, -3.87760 | ● | 022 → BOADILLA DEL MONTE | ✓ | 022 | ✓ | ✓ | ✓ |
| Colmenar Viejo — Plaza del Pueblo | 40.65880, -3.76580 |  | 045 → COLMENAR VIEJO | ✓ | 045 | ✓ | ✓ | ✓ |
| Moralzarzal — Plaza de la Constitución | 40.67590, -3.97020 |  | 090 → MORALZARZAL | ✓ | 090 | ✓ | ✓ | ✓ |
| Alcalá de Henares — Plaza de Cervantes | 40.48200, -3.36430 |  | 005 → ALCALA DE HENARES | ✓ | 005 | ✓ | ✓ | ✓ |
| Getafe — Plaza de la Constitución | 40.30570, -3.73280 |  | 065 → GETAFE | ✓ | 065 | ✓ | ✓ | ✓ |
| Casa de Campo — lake | 40.41930, -3.74410 |  | 079 → MADRID | ✓ | 079 | ✓ | ✓ | ✓ |
| Casa de Campo — west edge | 40.42500, -3.77800 |  | 115 → POZUELO DE ALARCON | ✓ | 079 | ✗ | ✓ | ✓ |
| El Pardo — village | 40.51650, -3.77470 |  | 079 → MADRID | ✓ | 079 | ✓ | ✓ | ✓ |
| Monte de El Pardo — western sector (band) | 40.53000, -3.86000 | ● | 127 → LAS ROZAS DE MADRID | ✓ | — | — | ✓ | ✓ |
| Monte de El Pardo — north-west (band) | 40.56000, -3.85000 | ● | 079 → MADRID | ✓ | — | — | ✓ | ✓ |
| Boadilla — Ciudad Financiera (east edge, band) | 40.43700, -3.85500 | ● | 115 → POZUELO DE ALARCON | ✓ | 022 | ✗ | ✓ | ✓ |
| Boadilla — Las Lomas (band; 05-prove candidate) | 40.42000, -3.86000 | ● | 022 → BOADILLA DEL MONTE | ✓ | 022 | ✓ | ✓ | ✓ |
| Boadilla — Olivar de Mirabal (band; 05-prove candidate) | 40.40320, -3.87120 | ● | 022 → BOADILLA DEL MONTE | ✓ | 022 | ✓ | ✓ | ✓ |
| Boadilla — proven parcel 4228504VK2742N (committed capture) | 40.40119, -3.89331 |  | 022 → BOADILLA DEL MONTE | ✓ | 022 | ✓ | ✓ | ✓ |
| Boadilla east edge / Pozuelo frontier (band) | 40.40000, -3.84500 | ● | 022 → BOADILLA DEL MONTE | ✓ | — | — | ✓ | ✓ |
| Pozuelo — Ciudad de la Imagen (just east of the band) | 40.39300, -3.83300 |  | 007 → ALCORCON | ✓ | — | — | ✓ | ✓ |
| Majadahonda — centre (band longitude, north of Boadilla) | 40.47300, -3.87200 | ● | 080 → MAJADAHONDA | ✓ | 080 | ✓ | ✓ | ✓ |
| Ventorro del Cano — Boadilla/Alcorcón/Madrid corner (band) | 40.36500, -3.84000 | ● | 007 → ALCORCON | ✓ | — | — | ✓ | ✓ |
| Cuatro Vientos aerodrome (Madrid capital) | 40.37070, -3.78500 |  | 079 → MADRID | ✓ | 079 | ✓ | ✓ | ✓ |

### Simplified sizes (Douglas-Peucker, per ring, in the arrival frame) and whether classification survives

| variant | tolerance | vertices | reduction | approx JSON bytes (2-dp coords) | 079 vertices | 022 vertices | 20 test points identical | 079∩022 interiors disjoint | seeded control (n=3000) identical | control zero-hit (full → simp) | control multi-hit (full → simp) |
|---|---:|---:|---:|---:|---:|---:|---:|:-:|---:|---|---|
| full | 0 m | 153,499 | 0 % | 4,121,578 (as served) | 4,539 | 477 | 20/20 | YES | — | 1674 | 0 |
| dp20 | 20 m | 20,682 | 86.5 % | 477,740 | 570 | 84 | 20/20 | YES | 2999/3000 (100.0 %) | 1674 → 1674 | 0 → 0 |
| dp50 | 50 m | 12,236 | 92 % | 285,712 | 319 | 55 | 20/20 | YES | 2992/3000 (99.7 %) | 1674 → 1677 | 0 → 0 |

> ⚠ Simplifying neighbours INDEPENDENTLY opens hairline gaps and slivers along shared borders — that is what the control's zero-hit / multi-hit deltas measure. A production simplification would have to be topology-preserving (simplify shared edges once) or accept a "near a border → ask both" fallback. The control points are uniform over the layer's bbox, so most of the delta sits on borders in open country, not on parcels.

## GOAL B — BOADILLA DEL MONTE (INE 28022 · CD_MUNICIPIO '022')

**Frame:** 8,456 cadastral parcels — the municipality's FULL Catastro INSPIRE CP population (ATOM `https://www.catastro.hacienda.gob.es/INSPIRE/CadastralParcels/28/ES.SDGC.CP.atom_28.xml` → enclosure DGC 28022, matched by `name+code-agree`; GML 20.5 MB, `http://www.opengis.net/def/crs/EPSG/0/25830` → WGS84 by the frame builder's inverse UTM). **40 drawn uniformly without replacement**, every parcel weighs 1.

**Ámbito register (routing half), fetched live per `CD_MUNICIPIO`:**

| layer | numberMatched (hits) | rows captured | complete | error |
|---|---:|---:|:-:|---|
| `VPLA_V_AMBITO` | 28 | 28 | ✓ |  |
| `VPLA_V_AMBITO_MODIF` | 2 | 2 | ✓ |  |

### The ordinance query, per parcel centroid (`INTERSECTS(GEOMETRY1, POINT(x y))`, EPSG:25830, no municipality pre-filter)

| outcome | n | of |
|---|---:|---:|
| WFS service failure (EXCLUDED) | 0 | 40 |
| **0 rows** — no ordinance polygon at the centroid | 1 | 40 |
| **1 row** — adapted | 39 | 40 |
| **>1 rows** — AMBIGUOUS, refused, never picked | 0 | 40 |
| rows carrying a CD_MUNICIPIO ≠ '022' | 0 | 40 |
| centroid lands in exactly the SIGI polygon '022' (Goal-A predicate, cross-check) | 40 | 40 |

**Shipped registry's claim at these 40 centroids (`resolveRegisteredJurisdictionAt`):** `resolved→es-28079-madrid` × 30 · `none` × 10

### Per-parameter — published, non-zero, in band (`isKnown`) over the 39 single-row parcels — ⚠ NOT "resolved"; a refusal still voids the record

| parameter (source column) | known | of 39 |
|---|---:|---:|
| height (NM_ALTURA) | 39 | 100.0 % |
| storeys (NM_N_PLTA) | 38 | 97.4 % |
| coverage (NM_OCP_MX) | 35 | 89.7 % |
| depth (NM_FDO_MX_ED) — no shared slot | 0 | 0.0 % |
| setback front (NM_RTR_FRNT) | 36 | 92.3 % |
| setback side (NM_RTR_LATL) | 36 | 92.3 % |
| setback rear (NM_RTR_POST) | 36 | 92.3 % |
| setback TRIPLE complete | 36 | 92.3 % |
| FAR — from NM_C_ED_ORD (per ORDINANCE) | 5 | 12.8 % |
| FAR — from NM_C_ED_MAZ (per MANZANA — block granularity, read only when ORD is absent) | 30 | 76.9 % |
| min frontage (NM_FRTE_MIN) | 0 | 0.0 % |
| **impossible storey height** (NM_ALTURA ÷ NM_N_PLTA outside [2.2, 5.0] → `parameters-contradict`) | 0 | 0.0 % |

**Grammar:** `setback` × 35 · `unknown` × 3 · `industrial` × 1

**Ordinance designations (DS_NOMB_ORD):** RESIDENCIAL UNIFAMILIAR × 31 · TERCIARIO COMERCIAL × 2 · ZONAS VERDES × 2 · INDUSTRIAL LIMPIA × 1 · SERVICIOS URBANOS E INFRAESTRUCTURAS × 1 · ESPACIOS DE TRANSICIÓN × 1 · EQUIPAMIENTO × 1

**Soil class (DS_CLAS_SUE):** Suelo Urbano Consolidado × 37 · Suelo Urbano No Consolidado × 2

**Ámbito:** named on 2 of 39 · resolved in the register 2 · ambiguous key (>1 instrument) 0

**Refusals — AS SHIPPED (gate closed):** `verification-gate-closed` × 39 · `public-system` × 5 · `development-ambito-governs` × 2 ⇒ drawable **0 of 39** — **as shipped: 0 numbers reach a user** (and `CM_SPACM_REGISTRATION_BLOCKED` means no card from this adapter does either).

**Refusals — IF SIGNED (`verificationGateOpen: true`):** `(none — drawable)` × 33 · `public-system` × 5 · `development-ambito-governs` × 2 ⇒ drawable **33 of 39**.

### Per parcel

| # | ref | area m² | rows | CD_MUN | DS_NOMB_ORD | soil | ámbito (register matches) | grammar | known: H/P/OCP/FDO/F/S/R/FAR(src) | contradiction | IF SIGNED | AS SHIPPED |
|---:|---|---:|---:|---|---|---|---|---|---|:-:|---|---|
| 1 | 2859037VK2725N | 1418 | 1 | 022 | RESIDENCIAL UNIFAMILIAR | Suelo Urbano Consolidado | — (0) | setback | HPO·FSRA(MAZ) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |
| 2 | 5029329VK2752N | 203 | 1 | 022 | RESIDENCIAL UNIFAMILIAR | Suelo Urbano Consolidado | — (0) | setback | HPO·FSRA(MAZ) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |
| 3 | 4728243VK2742N | 205 | 1 | 022 | RESIDENCIAL UNIFAMILIAR | Suelo Urbano Consolidado | — (0) | setback | HPO·FSRA(MAZ) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |
| 4 | 4728245VK2742N | 207 | 1 | 022 | RESIDENCIAL UNIFAMILIAR | Suelo Urbano Consolidado | — (0) | setback | HPO·FSRA(MAZ) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |
| 5 | 7720704VK2771N | 1160 | 1 | 022 | INDUSTRIAL LIMPIA | Suelo Urbano Consolidado | — (0) | industrial | H·O·FSRA(MAZ) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFAR, maxCoverage] | f1-gap |
| 6 | 3847710VK2734N | 1166 | 1 | 022 | RESIDENCIAL UNIFAMILIAR | Suelo Urbano Consolidado | — (0) | setback | HPO·FSRA(MAZ) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |
| 7 | 4766021VK2746N | 2568 | 1 | 022 | RESIDENCIAL UNIFAMILIAR | Suelo Urbano Consolidado | — (0) | setback | HPO·FSRA(MAZ) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |
| 8 | 3461409VK2736S | 2370 | 1 | 022 | RESIDENCIAL UNIFAMILIAR | Suelo Urbano Consolidado | — (0) | setback | HPO·FSRA(MAZ) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |
| 9 | 2068031VK2716N | 2721 | 1 | 022 | RESIDENCIAL UNIFAMILIAR | Suelo Urbano Consolidado | — (0) | setback | HPO·FSRA(MAZ) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |
| 10 | 2048409VK2724N | 328 | 1 | 022 | RESIDENCIAL UNIFAMILIAR | Suelo Urbano Consolidado | — (0) | setback | HPO·FSRA(ORD) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |
| 11 | 4927110VK2742N | 43 | 1 | 022 | TERCIARIO COMERCIAL | Suelo Urbano Consolidado | — (0) | setback | HPO·FSRA(MAZ) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |
| 12 | 2642809VK2724S | 300 | 1 | 022 | RESIDENCIAL UNIFAMILIAR | Suelo Urbano No Consolidado | UE-2 OLIVAR 3ª FASE (1) | setback | HPO·FSRA(ORD) |  | f2-correct-null (development-ambito-governs) | f2-correct-null |
| 13 | 3850912VK2745S | 252 | 1 | 022 | RESIDENCIAL UNIFAMILIAR | Suelo Urbano Consolidado | — (0) | setback | HPO·FSRA(ORD) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |
| 14 | 4253804VK2745S | 3327 | 1 | 022 | ZONAS VERDES | Suelo Urbano Consolidado | — (0) | unknown | HP······ |  | f2-correct-null (public-system) | f2-correct-null |
| 15 | 5216119VK2751N | 11018 | 1 | 022 | TERCIARIO COMERCIAL | Suelo Urbano Consolidado | — (0) | setback | HPO·FSRA(ORD) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |
| 16 | 3847719VK2734N | 980 | 1 | 022 | RESIDENCIAL UNIFAMILIAR | Suelo Urbano Consolidado | — (0) | setback | HPO·FSRA(MAZ) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |
| 17 | 3060014VK2735N | 1075 | 1 | 022 | RESIDENCIAL UNIFAMILIAR | Suelo Urbano Consolidado | — (0) | setback | HPO·FSRA(MAZ) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |
| 18 | 4356115VK2745N | 2410 | 1 | 022 | RESIDENCIAL UNIFAMILIAR | Suelo Urbano Consolidado | — (0) | setback | HPO·FSRA(MAZ) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |
| 19 | 3844205VK2734S | 1431 | 1 | 022 | RESIDENCIAL UNIFAMILIAR | Suelo Urbano Consolidado | — (0) | setback | HPO·FSRA(MAZ) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |
| 20 | 5754505VK2755S | 1361 | 1 | 022 | RESIDENCIAL UNIFAMILIAR | Suelo Urbano Consolidado | — (0) | setback | HPO·FSRA(MAZ) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |
| 21 | 4728234VK2742N | 210 | 1 | 022 | RESIDENCIAL UNIFAMILIAR | Suelo Urbano Consolidado | — (0) | setback | HPO·FSRA(MAZ) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |
| 22 | 4575021VK2747N | 1254 | 1 | 022 | RESIDENCIAL UNIFAMILIAR | Suelo Urbano Consolidado | — (0) | setback | HPO·FSRA(MAZ) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |
| 23 | 8126143VK2782N | 3139 | 1 | 022 | RESIDENCIAL UNIFAMILIAR | Suelo Urbano Consolidado | — (0) | setback | HPO·FSRA(MAZ) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |
| 24 | 5750008VK2754N | 1427 | 1 | 022 | RESIDENCIAL UNIFAMILIAR | Suelo Urbano Consolidado | — (0) | setback | HPO·FSRA(MAZ) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |
| 25 | 5029336VK2752N | 204 | 1 | 022 | RESIDENCIAL UNIFAMILIAR | Suelo Urbano Consolidado | — (0) | setback | HPO·FSRA(MAZ) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |
| 26 | 4664414VK2746S | 2656 | 1 | 022 | RESIDENCIAL UNIFAMILIAR | Suelo Urbano Consolidado | — (0) | setback | HPO·FSRA(MAZ) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |
| 27 | 2056322VK2725N | 40 | 1 | 022 | SERVICIOS URBANOS E INFRAESTRUCTURAS | Suelo Urbano No Consolidado | AH-30 CORTIJO NORTE (1) | setback | HP··FSR· |  | f2-correct-null (public-system+development-ambito-governs) | f2-correct-null |
| 28 | 4465406VK2746S | 4809 | 1 | 022 | RESIDENCIAL UNIFAMILIAR | Suelo Urbano Consolidado | — (0) | setback | HPO·FSRA(MAZ) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |
| 29 | 5550605VK2754N | 1597 | 1 | 022 | RESIDENCIAL UNIFAMILIAR | Suelo Urbano Consolidado | — (0) | setback | HPO·FSRA(MAZ) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |
| 30 | 28022A02109005 | 2562 | 0 |  |  |  |  |  |  |  | no-plan-served | no-plan-served |
| 31 | 4766023VK2746N | 2570 | 1 | 022 | RESIDENCIAL UNIFAMILIAR | Suelo Urbano Consolidado | — (0) | setback | HPO·FSRA(MAZ) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |
| 32 | 8532310VK2783S | 404 | 1 | 022 | RESIDENCIAL UNIFAMILIAR | Suelo Urbano Consolidado | — (0) | setback | HPO·FSRA(MAZ) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |
| 33 | 5139304VK2753N | 26 | 1 | 022 | ESPACIOS DE TRANSICIÓN | Suelo Urbano Consolidado | — (0) | unknown | HP······ |  | f2-correct-null (public-system) | f2-correct-null |
| 34 | 3645504VK2734S | 1062 | 1 | 022 | RESIDENCIAL UNIFAMILIAR | Suelo Urbano Consolidado | — (0) | setback | HPO·FSRA(MAZ) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |
| 35 | 27650C3VK2726S | 984 | 1 | 022 | RESIDENCIAL UNIFAMILIAR | Suelo Urbano Consolidado | — (0) | setback | HPO·FSRA(MAZ) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |
| 36 | 5439403VK2753N | 2195 | 1 | 022 | EQUIPAMIENTO | Suelo Urbano Consolidado | — (0) | setback | HPO·FSRA(ORD) |  | f2-correct-null (public-system) | f2-correct-null |
| 37 | 3778021VK2737S | 1903 | 1 | 022 | RESIDENCIAL UNIFAMILIAR | Suelo Urbano Consolidado | — (0) | setback | HPO·FSRA(MAZ) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |
| 38 | 3870022VK2736N | 2180 | 1 | 022 | RESIDENCIAL UNIFAMILIAR | Suelo Urbano Consolidado | — (0) | setback | HPO·FSRA(MAZ) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |
| 39 | 4855082VK2745S | 561 | 1 | 022 | ZONAS VERDES | Suelo Urbano Consolidado | — (0) | unknown | HP······ |  | f2-correct-null (public-system) | f2-correct-null |
| 40 | 5431960VK2753S | 82 | 1 | 022 | RESIDENCIAL UNIFAMILIAR | Suelo Urbano Consolidado | — (0) | setback | HPO·FSRA(MAZ) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |

## GOAL B — COLMENAR VIEJO (INE 28045 · CD_MUNICIPIO '045')

**Frame:** 13,028 cadastral parcels — the municipality's FULL Catastro INSPIRE CP population (ATOM `https://www.catastro.hacienda.gob.es/INSPIRE/CadastralParcels/28/ES.SDGC.CP.atom_28.xml` → enclosure DGC 28045, matched by `name+code-agree`; GML 37.5 MB, `http://www.opengis.net/def/crs/EPSG/0/25830` → WGS84 by the frame builder's inverse UTM). **40 drawn uniformly without replacement**, every parcel weighs 1.

**Ámbito register (routing half), fetched live per `CD_MUNICIPIO`:**

| layer | numberMatched (hits) | rows captured | complete | error |
|---|---:|---:|:-:|---|
| `VPLA_V_AMBITO` | 33 | 33 | ✓ |  |
| `VPLA_V_AMBITO_MODIF` | 97 | 97 | ✓ |  |

### The ordinance query, per parcel centroid (`INTERSECTS(GEOMETRY1, POINT(x y))`, EPSG:25830, no municipality pre-filter)

| outcome | n | of |
|---|---:|---:|
| WFS service failure (EXCLUDED) | 0 | 40 |
| **0 rows** — no ordinance polygon at the centroid | 13 | 40 |
| **1 row** — adapted | 27 | 40 |
| **>1 rows** — AMBIGUOUS, refused, never picked | 0 | 40 |
| rows carrying a CD_MUNICIPIO ≠ '045' | 0 | 40 |
| centroid lands in exactly the SIGI polygon '045' (Goal-A predicate, cross-check) | 40 | 40 |

**Shipped registry's claim at these 40 centroids (`resolveRegisteredJurisdictionAt`):** `none` × 33 · `resolved→es-28079-madrid` × 7

### Per-parameter — published, non-zero, in band (`isKnown`) over the 27 single-row parcels — ⚠ NOT "resolved"; a refusal still voids the record

| parameter (source column) | known | of 27 |
|---|---:|---:|
| height (NM_ALTURA) | 27 | 100.0 % |
| storeys (NM_N_PLTA) | 27 | 100.0 % |
| coverage (NM_OCP_MX) | 15 | 55.6 % |
| depth (NM_FDO_MX_ED) — no shared slot | 1 | 3.7 % |
| setback front (NM_RTR_FRNT) | 13 | 48.1 % |
| setback side (NM_RTR_LATL) | 12 | 44.4 % |
| setback rear (NM_RTR_POST) | 9 | 33.3 % |
| setback TRIPLE complete | 8 | 29.6 % |
| FAR — from NM_C_ED_ORD (per ORDINANCE) | 14 | 51.9 % |
| FAR — from NM_C_ED_MAZ (per MANZANA — block granularity, read only when ORD is absent) | 0 | 0.0 % |
| min frontage (NM_FRTE_MIN) | 10 | 37.0 % |
| **impossible storey height** (NM_ALTURA ÷ NM_N_PLTA outside [2.2, 5.0] → `parameters-contradict`) | 0 | 0.0 % |

**Grammar:** `unknown` × 11 · `setback` × 8 · `occupation` × 5 · `industrial` × 2 · `alignment` × 1

**Ordinance designations (DS_NOMB_ORD):** AO-1 CASCO ANTIGUO × 9 · AO-4 COLONIAS DEL NORTE × 2 · AO-5 COLONIAS DEL SUR × 2 · AE-33 INDUSTRIAL AGROPECUARIA × 2 · AE-26 HOYO DE MANZANARES EQUIPAMIENTO × 1 · AE-41 FUENTESANTA UNIFAMILIAR × 1 · UD-3 CIUDADCAMPO × 1 · AE-7 GRANADA UNIFAMILIAR × 1 · AE-38 PRADO ROSALES × 1 · API-61 RESIDENCIAL UNIFAMILIAR × 1 · AE-36 DIPRIFE UNIFAMILIAR × 1 · AE-44 SIERRA NEVADA UNIFAMILIAR × 1 · API-72 RESIDENCIAL UNIFAMILIAR × 1 · API-69 A. RESIDENCIAL UNIFAMILIAR OLOVASIO × 1 · API-70 RESIDENCIAL UNIFAMILIAR × 1 · AE-40 PUENTE VIEJO × 1

**Soil class (DS_CLAS_SUE):** Suelo Urbano × 27

**Ámbito:** named on 0 of 27 · resolved in the register 0 · ambiguous key (>1 instrument) 0

**Refusals — AS SHIPPED (gate closed):** `verification-gate-closed` × 27 · `no-grammar-determined` × 10 · `public-system` × 1 ⇒ drawable **0 of 27** — **as shipped: 0 numbers reach a user** (and `CM_SPACM_REGISTRATION_BLOCKED` means no card from this adapter does either).

**Refusals — IF SIGNED (`verificationGateOpen: true`):** `(none — drawable)` × 16 · `no-grammar-determined` × 10 · `public-system` × 1 ⇒ drawable **9 of 27**.

### Per parcel

| # | ref | area m² | rows | CD_MUN | DS_NOMB_ORD | soil | ámbito (register matches) | grammar | known: H/P/OCP/FDO/F/S/R/FAR(src) | contradiction | IF SIGNED | AS SHIPPED |
|---:|---|---:|---:|---|---|---|---|---|---|:-:|---|---|
| 1 | 4229511VL3042N | 398 | 1 | 045 | AO-4 COLONIAS DEL NORTE | Suelo Urbano | — (0) | unknown | HP··FS·A(ORD) |  | f1-gap (no-grammar-determined) | f1-gap |
| 2 | 5110501VL3051S | 164 | 1 | 045 | AO-1 CASCO ANTIGUO | Suelo Urbano | — (0) | unknown | HP······ |  | f1-gap (no-grammar-determined) | f1-gap |
| 3 | 4610901VL3041S | 146 | 1 | 045 | AE-26 HOYO DE MANZANARES EQUIPAMIENTO | Suelo Urbano | — (0) | unknown | HP·····A(ORD) |  | f2-correct-null (public-system) | f2-correct-null |
| 4 | 28045A04300032 | 16939 | 0 |  |  |  |  |  |  |  | no-plan-served | no-plan-served |
| 5 | 4104610VL3040S | 458 | 1 | 045 | AO-5 COLONIAS DEL SUR | Suelo Urbano | — (0) | setback | HPO·FSRA(ORD) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |
| 6 | 28045A02309019 | 701 | 0 |  |  |  |  |  |  |  | no-plan-served | no-plan-served |
| 7 | 3927707VL3032N | 494 | 1 | 045 | AE-41 FUENTESANTA UNIFAMILIAR | Suelo Urbano | — (0) | occupation | HPO·FS·A(ORD) |  | f1-gap (—) | f1-gap |
| 8 | 9580138VK4997N | 2836 | 1 | 045 | UD-3 CIUDADCAMPO | Suelo Urbano | — (0) | setback | HPO·FSR· |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxCoverage] | f1-gap |
| 9 | 5316312VL3051N | 85 | 1 | 045 | AO-1 CASCO ANTIGUO | Suelo Urbano | — (0) | unknown | HP······ |  | f1-gap (no-grammar-determined) | f1-gap |
| 10 | 4324411VL3042S | 120 | 1 | 045 | AE-7 GRANADA UNIFAMILIAR | Suelo Urbano | — (0) | occupation | HPO····· |  | f1-gap (—) | f1-gap |
| 11 | 5817709VL3051N | 507 | 1 | 045 | AE-33 INDUSTRIAL AGROPECUARIA | Suelo Urbano | — (0) | industrial | HPO··S·A(ORD) |  | f1-gap (—) | f1-gap |
| 12 | 28045A01500304 | 6857 | 0 |  |  |  |  |  |  |  | no-plan-served | no-plan-served |
| 13 | 5610873VL3051S | 85 | 0 |  |  |  |  |  |  |  | no-plan-served | no-plan-served |
| 14 | 5423506VL3052S | 498 | 1 | 045 | AE-38 PRADO ROSALES | Suelo Urbano | — (0) | setback | HPO·FSR· |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxCoverage] | f1-gap |
| 15 | 5312412VL3051S | 178 | 1 | 045 | AO-1 CASCO ANTIGUO | Suelo Urbano | — (0) | unknown | HP······ |  | f1-gap (no-grammar-determined) | f1-gap |
| 16 | 5016611VL3051N | 89 | 1 | 045 | AO-1 CASCO ANTIGUO | Suelo Urbano | — (0) | unknown | HP······ |  | f1-gap (no-grammar-determined) | f1-gap |
| 17 | 5110521VL3051S | 206 | 1 | 045 | AO-1 CASCO ANTIGUO | Suelo Urbano | — (0) | unknown | HP······ |  | f1-gap (no-grammar-determined) | f1-gap |
| 18 | 28045A03200058 | 309220 | 0 |  |  |  |  |  |  |  | no-plan-served | no-plan-served |
| 19 | 3907801VL3030N | 1065 | 1 | 045 | AO-5 COLONIAS DEL SUR | Suelo Urbano | — (0) | setback | HPO·FSRA(ORD) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |
| 20 | 3923104VL3032S | 203 | 1 | 045 | API-61 RESIDENCIAL UNIFAMILIAR | Suelo Urbano | — (0) | setback | HPO·FSRA(ORD) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |
| 21 | 5617104VL3051N | 301 | 1 | 045 | AE-36 DIPRIFE UNIFAMILIAR | Suelo Urbano | — (0) | occupation | HPO·F··· |  | f1-gap (—) | f1-gap |
| 22 | 28045A03200042 | 17715 | 0 |  |  |  |  |  |  |  | no-plan-served | no-plan-served |
| 23 | 28045A00600004 | 280694 | 0 |  |  |  |  |  |  |  | no-plan-served | no-plan-served |
| 24 | 4811807VL3041S | 170 | 1 | 045 | AE-44 SIERRA NEVADA UNIFAMILIAR | Suelo Urbano | — (0) | alignment | HPOD···A(ORD) |  | **resolved** [maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |
| 25 | 28045A03000043 | 62707 | 0 |  |  |  |  |  |  |  | no-plan-served | no-plan-served |
| 26 | 5413909VL3051S | 305 | 1 | 045 | AO-1 CASCO ANTIGUO | Suelo Urbano | — (0) | unknown | HP······ |  | f1-gap (no-grammar-determined) | f1-gap |
| 27 | 4809720VL3040N | 127 | 1 | 045 | AO-1 CASCO ANTIGUO | Suelo Urbano | — (0) | unknown | HP······ |  | f1-gap (no-grammar-determined) | f1-gap |
| 28 | 28045A01200027 | 34624 | 0 |  |  |  |  |  |  |  | no-plan-served | no-plan-served |
| 29 | 28045A01500262 | 8225 | 0 |  |  |  |  |  |  |  | no-plan-served | no-plan-served |
| 30 | 5408509VL3050N | 121 | 1 | 045 | API-72 RESIDENCIAL UNIFAMILIAR | Suelo Urbano | — (0) | occupation | HPO·F··A(ORD) |  | f1-gap (—) | f1-gap |
| 31 | 4630613VL3043S | 734 | 1 | 045 | AO-4 COLONIAS DEL NORTE | Suelo Urbano | — (0) | setback | HP··FSRA(ORD) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR] | f1-gap |
| 32 | 4116259VL3041S | 595 | 1 | 045 | API-69 A. RESIDENCIAL UNIFAMILIAR OLOVASIO | Suelo Urbano | — (0) | setback | HPO·FSRA(ORD) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |
| 33 | 4814915VL3041S | 40 | 1 | 045 | AO-1 CASCO ANTIGUO | Suelo Urbano | — (0) | unknown | HP······ |  | f1-gap (no-grammar-determined) | f1-gap |
| 34 | 5610817VL3051S | 94 | 1 | 045 | API-70 RESIDENCIAL UNIFAMILIAR | Suelo Urbano | — (0) | occupation | HPO·F·RA(ORD) |  | f1-gap (—) | f1-gap |
| 35 | 5917206VL3051N | 2656 | 1 | 045 | AE-33 INDUSTRIAL AGROPECUARIA | Suelo Urbano | — (0) | industrial | HPO··S·A(ORD) |  | f1-gap (—) | f1-gap |
| 36 | 5211331VL3051S | 184 | 1 | 045 | AO-1 CASCO ANTIGUO | Suelo Urbano | — (0) | unknown | HP······ |  | f1-gap (no-grammar-determined) | f1-gap |
| 37 | 000900800VK39H | 4911 | 0 |  |  |  |  |  |  |  | no-plan-served | no-plan-served |
| 38 | 28045A04100004 | 2663 | 0 |  |  |  |  |  |  |  | no-plan-served | no-plan-served |
| 39 | 28045A02300012 | 105884 | 0 |  |  |  |  |  |  |  | no-plan-served | no-plan-served |
| 40 | 3928107VL3042N | 477 | 1 | 045 | AE-40 PUENTE VIEJO | Suelo Urbano | — (0) | setback | HPO·FSRA(ORD) |  | **resolved** [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage] | f1-gap |

## Slot-coverage frames (the shared classifier — `slots.ts`)

### Frame `boadilla-del-monte · AS SHIPPED`

**Frame (the denominator, stated):** 40 REAL Catastro parcels drawn uniformly (seed 20260802) over BOADILLA DEL MONTE's FULL INSPIRE CP population of 8,456; one live `sitcm:VPLA_V_ORDENANZA` INTERSECTS query per centroid; the SHIPPED `adaptSpacmRow` with the live ámbito register — gate CLOSED (the shipped state).

| class | n | share of answered points |
|---|---:|---:|
| `service-failure` (EXCLUDED from every denominator) | 0 | — |
| `no-plan-served` (source answered, nothing here) | 1 | 2.5 % |
| **F2** correct-null — the ordinance answers "no envelope" | 6 | 15.0 % |
| **F1** gap — governed + buildable, PRYZM serves no mechanism | 33 | 82.5 % |
| `shape-rule-unmeasured` — the pack answers with a SHAPE, not scalars (EXCLUDED from the slot denominator) | 0 | 0.0 % |
| `resolved` — at least one envelope slot resolved | 0 | 0.0 % |
| probed | 40 | |

**⭐ ENVELOPE SLOT COVERAGE = 0.0 %** — 0 slots resolved ÷ (8 × 33 answerable points).

Answerable = F1 + resolved. **F2 and `shape-rule-unmeasured` are excluded from this denominator by construction** — the first has no subject, the second has no scalar to fill.

| slot | resolved on n of 33 answerable |
|---|---:|
| `setback.front` | 0 |
| `setback.side` | 0 |
| `setback.rear` | 0 |
| `maxHeight` | 0 |
| `maxFloors` | 0 |
| `maxFAR` | 0 |
| `maxCoverage` | 0 |
| `permittedUse` | 0 |

**The F1 build queue, measured (top zones by point count):**

| zone (verbatim from the source) | n |
|---|---:|
| RESIDENCIAL UNIFAMILIAR | 30 |
| TERCIARIO COMERCIAL | 2 |
| INDUSTRIAL LIMPIA | 1 |

### Frame `boadilla-del-monte · IF SIGNED`

**Frame (the denominator, stated):** 40 REAL Catastro parcels drawn uniformly (seed 20260802) over BOADILLA DEL MONTE's FULL INSPIRE CP population of 8,456; one live `sitcm:VPLA_V_ORDENANZA` INTERSECTS query per centroid; the SHIPPED `adaptSpacmRow` with the live ámbito register — `verificationGateOpen: true` (DEMONSTRATION, not authorisation).

| class | n | share of answered points |
|---|---:|---:|
| `service-failure` (EXCLUDED from every denominator) | 0 | — |
| `no-plan-served` (source answered, nothing here) | 1 | 2.5 % |
| **F2** correct-null — the ordinance answers "no envelope" | 6 | 15.0 % |
| **F1** gap — governed + buildable, PRYZM serves no mechanism | 0 | 0.0 % |
| `shape-rule-unmeasured` — the pack answers with a SHAPE, not scalars (EXCLUDED from the slot denominator) | 0 | 0.0 % |
| `resolved` — at least one envelope slot resolved | 33 | 82.5 % |
| probed | 40 | |

**⭐ ENVELOPE SLOT COVERAGE = 87.1 %** — 230 slots resolved ÷ (8 × 33 answerable points).

Answerable = F1 + resolved. **F2 and `shape-rule-unmeasured` are excluded from this denominator by construction** — the first has no subject, the second has no scalar to fill.

| slot | resolved on n of 33 answerable |
|---|---:|
| `setback.front` | 33 |
| `setback.side` | 33 |
| `setback.rear` | 33 |
| `maxHeight` | 33 |
| `maxFloors` | 32 |
| `maxFAR` | 33 |
| `maxCoverage` | 33 |
| `permittedUse` | 0 |

### Frame `colmenar-viejo · AS SHIPPED`

**Frame (the denominator, stated):** 40 REAL Catastro parcels drawn uniformly (seed 20260802) over COLMENAR VIEJO's FULL INSPIRE CP population of 13,028; one live `sitcm:VPLA_V_ORDENANZA` INTERSECTS query per centroid; the SHIPPED `adaptSpacmRow` with the live ámbito register — gate CLOSED (the shipped state).

| class | n | share of answered points |
|---|---:|---:|
| `service-failure` (EXCLUDED from every denominator) | 0 | — |
| `no-plan-served` (source answered, nothing here) | 13 | 32.5 % |
| **F2** correct-null — the ordinance answers "no envelope" | 1 | 2.5 % |
| **F1** gap — governed + buildable, PRYZM serves no mechanism | 26 | 65.0 % |
| `shape-rule-unmeasured` — the pack answers with a SHAPE, not scalars (EXCLUDED from the slot denominator) | 0 | 0.0 % |
| `resolved` — at least one envelope slot resolved | 0 | 0.0 % |
| probed | 40 | |

**⭐ ENVELOPE SLOT COVERAGE = 0.0 %** — 0 slots resolved ÷ (8 × 26 answerable points).

Answerable = F1 + resolved. **F2 and `shape-rule-unmeasured` are excluded from this denominator by construction** — the first has no subject, the second has no scalar to fill.

| slot | resolved on n of 26 answerable |
|---|---:|
| `setback.front` | 0 |
| `setback.side` | 0 |
| `setback.rear` | 0 |
| `maxHeight` | 0 |
| `maxFloors` | 0 |
| `maxFAR` | 0 |
| `maxCoverage` | 0 |
| `permittedUse` | 0 |

**The F1 build queue, measured (top zones by point count):**

| zone (verbatim from the source) | n |
|---|---:|
| AO-1 CASCO ANTIGUO | 9 |
| AO-4 COLONIAS DEL NORTE | 2 |
| AO-5 COLONIAS DEL SUR | 2 |
| AE-33 INDUSTRIAL AGROPECUARIA | 2 |
| AE-41 FUENTESANTA UNIFAMILIAR | 1 |
| UD-3 CIUDADCAMPO | 1 |
| AE-7 GRANADA UNIFAMILIAR | 1 |
| AE-38 PRADO ROSALES | 1 |
| API-61 RESIDENCIAL UNIFAMILIAR | 1 |
| AE-36 DIPRIFE UNIFAMILIAR | 1 |
| AE-44 SIERRA NEVADA UNIFAMILIAR | 1 |
| API-72 RESIDENCIAL UNIFAMILIAR | 1 |
| API-69 A. RESIDENCIAL UNIFAMILIAR OLOVASIO | 1 |
| API-70 RESIDENCIAL UNIFAMILIAR | 1 |
| AE-40 PUENTE VIEJO | 1 |

### Frame `colmenar-viejo · IF SIGNED`

**Frame (the denominator, stated):** 40 REAL Catastro parcels drawn uniformly (seed 20260802) over COLMENAR VIEJO's FULL INSPIRE CP population of 13,028; one live `sitcm:VPLA_V_ORDENANZA` INTERSECTS query per centroid; the SHIPPED `adaptSpacmRow` with the live ámbito register — `verificationGateOpen: true` (DEMONSTRATION, not authorisation).

| class | n | share of answered points |
|---|---:|---:|
| `service-failure` (EXCLUDED from every denominator) | 0 | — |
| `no-plan-served` (source answered, nothing here) | 13 | 32.5 % |
| **F2** correct-null — the ordinance answers "no envelope" | 1 | 2.5 % |
| **F1** gap — governed + buildable, PRYZM serves no mechanism | 17 | 42.5 % |
| `shape-rule-unmeasured` — the pack answers with a SHAPE, not scalars (EXCLUDED from the slot denominator) | 0 | 0.0 % |
| `resolved` — at least one envelope slot resolved | 9 | 22.5 % |
| probed | 40 | |

**⭐ ENVELOPE SLOT COVERAGE = 27.4 %** — 57 slots resolved ÷ (8 × 26 answerable points).

Answerable = F1 + resolved. **F2 and `shape-rule-unmeasured` are excluded from this denominator by construction** — the first has no subject, the second has no scalar to fill.

| slot | resolved on n of 26 answerable |
|---|---:|
| `setback.front` | 8 |
| `setback.side` | 8 |
| `setback.rear` | 8 |
| `maxHeight` | 9 |
| `maxFloors` | 9 |
| `maxFAR` | 7 |
| `maxCoverage` | 8 |
| `permittedUse` | 0 |

**The F1 build queue, measured (top zones by point count):**

| zone (verbatim from the source) | n |
|---|---:|
| AO-1 CASCO ANTIGUO | 9 |
| AE-33 INDUSTRIAL AGROPECUARIA | 2 |
| AO-4 COLONIAS DEL NORTE | 1 |
| AE-41 FUENTESANTA UNIFAMILIAR | 1 |
| AE-7 GRANADA UNIFAMILIAR | 1 |
| AE-36 DIPRIFE UNIFAMILIAR | 1 |
| API-72 RESIDENCIAL UNIFAMILIAR | 1 |
| API-70 RESIDENCIAL UNIFAMILIAR | 1 |

### Frame `ALL · AS SHIPPED`

**Frame (the denominator, stated):** both municipalities pooled — 80 real Catastro parcels — gate CLOSED.

| class | n | share of answered points |
|---|---:|---:|
| `service-failure` (EXCLUDED from every denominator) | 0 | — |
| `no-plan-served` (source answered, nothing here) | 14 | 17.5 % |
| **F2** correct-null — the ordinance answers "no envelope" | 7 | 8.8 % |
| **F1** gap — governed + buildable, PRYZM serves no mechanism | 59 | 73.8 % |
| `shape-rule-unmeasured` — the pack answers with a SHAPE, not scalars (EXCLUDED from the slot denominator) | 0 | 0.0 % |
| `resolved` — at least one envelope slot resolved | 0 | 0.0 % |
| probed | 80 | |

**⭐ ENVELOPE SLOT COVERAGE = 0.0 %** — 0 slots resolved ÷ (8 × 59 answerable points).

Answerable = F1 + resolved. **F2 and `shape-rule-unmeasured` are excluded from this denominator by construction** — the first has no subject, the second has no scalar to fill.

| slot | resolved on n of 59 answerable |
|---|---:|
| `setback.front` | 0 |
| `setback.side` | 0 |
| `setback.rear` | 0 |
| `maxHeight` | 0 |
| `maxFloors` | 0 |
| `maxFAR` | 0 |
| `maxCoverage` | 0 |
| `permittedUse` | 0 |

**The F1 build queue, measured (top zones by point count):**

| zone (verbatim from the source) | n |
|---|---:|
| RESIDENCIAL UNIFAMILIAR | 30 |
| AO-1 CASCO ANTIGUO | 9 |
| TERCIARIO COMERCIAL | 2 |
| AO-4 COLONIAS DEL NORTE | 2 |
| AO-5 COLONIAS DEL SUR | 2 |
| AE-33 INDUSTRIAL AGROPECUARIA | 2 |
| INDUSTRIAL LIMPIA | 1 |
| AE-41 FUENTESANTA UNIFAMILIAR | 1 |
| UD-3 CIUDADCAMPO | 1 |
| AE-7 GRANADA UNIFAMILIAR | 1 |
| AE-38 PRADO ROSALES | 1 |
| API-61 RESIDENCIAL UNIFAMILIAR | 1 |
| AE-36 DIPRIFE UNIFAMILIAR | 1 |
| AE-44 SIERRA NEVADA UNIFAMILIAR | 1 |
| API-72 RESIDENCIAL UNIFAMILIAR | 1 |

### Frame `ALL · IF SIGNED`

**Frame (the denominator, stated):** both municipalities pooled — 80 real Catastro parcels — gate OPEN (demonstration).

| class | n | share of answered points |
|---|---:|---:|
| `service-failure` (EXCLUDED from every denominator) | 0 | — |
| `no-plan-served` (source answered, nothing here) | 14 | 17.5 % |
| **F2** correct-null — the ordinance answers "no envelope" | 7 | 8.8 % |
| **F1** gap — governed + buildable, PRYZM serves no mechanism | 17 | 21.3 % |
| `shape-rule-unmeasured` — the pack answers with a SHAPE, not scalars (EXCLUDED from the slot denominator) | 0 | 0.0 % |
| `resolved` — at least one envelope slot resolved | 42 | 52.5 % |
| probed | 80 | |

**⭐ ENVELOPE SLOT COVERAGE = 60.8 %** — 287 slots resolved ÷ (8 × 59 answerable points).

Answerable = F1 + resolved. **F2 and `shape-rule-unmeasured` are excluded from this denominator by construction** — the first has no subject, the second has no scalar to fill.

| slot | resolved on n of 59 answerable |
|---|---:|
| `setback.front` | 41 |
| `setback.side` | 41 |
| `setback.rear` | 41 |
| `maxHeight` | 42 |
| `maxFloors` | 41 |
| `maxFAR` | 40 |
| `maxCoverage` | 41 |
| `permittedUse` | 0 |

**The F1 build queue, measured (top zones by point count):**

| zone (verbatim from the source) | n |
|---|---:|
| AO-1 CASCO ANTIGUO | 9 |
| AE-33 INDUSTRIAL AGROPECUARIA | 2 |
| AO-4 COLONIAS DEL NORTE | 1 |
| AE-41 FUENTESANTA UNIFAMILIAR | 1 |
| AE-7 GRANADA UNIFAMILIAR | 1 |
| AE-36 DIPRIFE UNIFAMILIAR | 1 |
| API-72 RESIDENCIAL UNIFAMILIAR | 1 |
| API-70 RESIDENCIAL UNIFAMILIAR | 1 |

> Wall time 40 s.
