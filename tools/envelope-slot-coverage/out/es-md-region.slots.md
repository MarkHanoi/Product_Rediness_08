# Comunidad de Madrid (REGION, capital excluded) — envelope slot coverage + boundary-gate feasibility, MEASURED 2026-09-04

> Command: `npx tsx tools/envelope-slot-coverage/measureMadridRegion.ts --n 40 --seed 20260802` · ONLINE (idem.comunidad.madrid WFS + catastro.hacienda.gob.es ATOM) · slots: setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage, permittedUse

> Shipped state read from `esMadridSpacm.ts`: `CM_SPACM_REGISTRATION_BLOCKED = true` · `CM_SPACM_ENVELOPE_VERIFIED = false` · jurisdiction id `es-md-comunidad-madrid`. ⛔ **The capital (INE 28079) is a separate registration and is not in any frame below.**

> ⚠ TWO FRAMES PER MUNICIPALITY, NEVER BLENDED. **AS SHIPPED**: nothing routes to this adapter by click and every record carries `verification-gate-closed` ⇒ **0 numbers reach a user**; the live ordinance answer is used as a WITNESS only (a legally-grounded refusal — public system / non-urban soil / ámbito delegation — is a fact about the LAND and is F2 whether or not PRYZM shows the card). **IF SIGNED**: the same records under `verificationGateOpen: true` — a demonstration of what an L-449 signature would open, not an authorisation.

> ⚠ A slot is counted RESOLVED only when the record is DRAWABLE (no refusal, envelope non-null, grammar known) and the dimension is `isKnown`. `computeBuildableEnvelope` is NOT run: the adapter emits a `GeometricRule`, and building a pack around it would wire the registration this arm may not wire. `permittedUse` can never resolve here (the adapter does not read `DS_US_PRED`); `depth` (NM_FDO_MX_ED) has no shared slot and is reported beside the eight.

## GOAL A — `Callejero:SIGI_V_MUNICIPIOS` as a polygon `contains` routing gate (FEASIBILITY EVIDENCE, NOT WIRED)

> Request (the exact shape of `tools/madrid-spacm-probe/02-paging-and-domains.mjs` §b): `https://idem.comunidad.madrid/geoserver3/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=Callejero%3ASIGI_V_MUNICIPIOS&outputFormat=application%2Fjson&count=1000`

> HTTP 400 · `application/xml` · **823 bytes** · OWS exception: java.lang.RuntimeException: Unable to obtain connection: Error de E/S: The Network Adapter could not establish the connection
Unable to obtain connection: Error de E/S: The Network Adapter could not establish the connection
Error de E/S: The Network Adapter could not establish the connection
The Network Adapter could not establish the connection
probsit

⛔ **The upstream did not answer. Goal A stops here — a service failure is NEVER a zero.**

- UPSTREAM REFUSED — HTTP 400 · java.lang.RuntimeException: Unable to obtain connection: Error de E/S: The Network Adapter could not establish the connection
Unable to obtain connection: Error de E/S: The Network Adapter could not establish the connection
Error de E/S: The Network Adapter could not establish the connection
The Network Adapter could not establish the connection
probsit. Goal A stops here; a service failure is NEVER a zero.

## GOAL B — BOADILLA DEL MONTE (INE 28022 · CD_MUNICIPIO '022')

**Frame:** 8,456 cadastral parcels — the municipality's FULL Catastro INSPIRE CP population (ATOM `https://www.catastro.hacienda.gob.es/INSPIRE/CadastralParcels/28/ES.SDGC.CP.atom_28.xml` → enclosure DGC 28022, matched by `name+code-agree`; GML 20.5 MB, `http://www.opengis.net/def/crs/EPSG/0/25830` → WGS84 by the frame builder's inverse UTM). **40 drawn uniformly without replacement**, every parcel weighs 1.

**Ámbito register (routing half), fetched live per `CD_MUNICIPIO`:**

| layer | numberMatched (hits) | rows captured | complete | error |
|---|---:|---:|:-:|---|
| `VPLA_V_AMBITO` | NULL | 0 | ✗ | hits failed — java.lang.RuntimeException: Unable to obtain connection: Error de E/S: The Network Adapter could not establish the connection
Unable to obtain connection: Error de E/S: The Network Adapter could not establish the connection
Error de E/S: The Network Adapter could not establish the connection
The Network Adapter could not establish the connection
probsit |
| `VPLA_V_AMBITO_MODIF` | NULL | 0 | ✗ | hits failed — java.lang.RuntimeException: Unable to obtain connection: Error de E/S: The Network Adapter could not establish the connection
Unable to obtain connection: Error de E/S: The Network Adapter could not establish the connection
Error de E/S: The Network Adapter could not establish the connection
The Network Adapter could not establish the connection
probsit |

### The ordinance query, per parcel centroid (`INTERSECTS(GEOMETRY1, POINT(x y))`, EPSG:25830, no municipality pre-filter)

| outcome | n | of |
|---|---:|---:|
| WFS service failure (EXCLUDED) | 40 | 40 |
| **0 rows** — no ordinance polygon at the centroid | 0 | 40 |
| **1 row** — adapted | 0 | 40 |
| **>1 rows** — AMBIGUOUS, refused, never picked | 0 | 40 |
| rows carrying a CD_MUNICIPIO ≠ '022' | 0 | 40 |
| centroid lands in exactly the SIGI polygon '022' (Goal-A predicate, cross-check) | — | 40 |

**Shipped registry's claim at these 40 centroids (`resolveRegisteredJurisdictionAt`):** `resolved→es-28079-madrid` × 30 · `none` × 10

### Per-parameter — published, non-zero, in band (`isKnown`) over the 0 single-row parcels — ⚠ NOT "resolved"; a refusal still voids the record

| parameter (source column) | known | of 0 |
|---|---:|---:|
| height (NM_ALTURA) | 0 | n/a |
| storeys (NM_N_PLTA) | 0 | n/a |
| coverage (NM_OCP_MX) | 0 | n/a |
| depth (NM_FDO_MX_ED) — no shared slot | 0 | n/a |
| setback front (NM_RTR_FRNT) | 0 | n/a |
| setback side (NM_RTR_LATL) | 0 | n/a |
| setback rear (NM_RTR_POST) | 0 | n/a |
| setback TRIPLE complete | 0 | n/a |
| FAR — from NM_C_ED_ORD (per ORDINANCE) | 0 | n/a |
| FAR — from NM_C_ED_MAZ (per MANZANA — block granularity, read only when ORD is absent) | 0 | n/a |
| min frontage (NM_FRTE_MIN) | 0 | n/a |
| **impossible storey height** (NM_ALTURA ÷ NM_N_PLTA outside [2.2, 5.0] → `parameters-contradict`) | 0 | n/a |

**Grammar:** —

**Ordinance designations (DS_NOMB_ORD):** —

**Soil class (DS_CLAS_SUE):** —

**Ámbito:** named on 0 of 0 · resolved in the register 0 · ambiguous key (>1 instrument) 0

**Refusals — AS SHIPPED (gate closed):** — ⇒ drawable **0 of 0** — **as shipped: 0 numbers reach a user** (and `CM_SPACM_REGISTRATION_BLOCKED` means no card from this adapter does either).

**Refusals — IF SIGNED (`verificationGateOpen: true`):** — ⇒ drawable **0 of 0**.

### Per parcel

| # | ref | area m² | rows | CD_MUN | DS_NOMB_ORD | soil | ámbito (register matches) | grammar | known: H/P/OCP/FDO/F/S/R/FAR(src) | contradiction | IF SIGNED | AS SHIPPED |
|---:|---|---:|---:|---|---|---|---|---|---|:-:|---|---|
| 1 | 2859037VK2725N | 1418 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 2 | 5029329VK2752N | 203 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 3 | 4728243VK2742N | 205 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 4 | 4728245VK2742N | 207 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 5 | 7720704VK2771N | 1160 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 6 | 3847710VK2734N | 1166 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 7 | 4766021VK2746N | 2568 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 8 | 3461409VK2736S | 2370 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 9 | 2068031VK2716N | 2721 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 10 | 2048409VK2724N | 328 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 11 | 4927110VK2742N | 43 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 12 | 2642809VK2724S | 300 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 13 | 3850912VK2745S | 252 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 14 | 4253804VK2745S | 3327 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 15 | 5216119VK2751N | 11018 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 16 | 3847719VK2734N | 980 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 17 | 3060014VK2735N | 1075 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 18 | 4356115VK2745N | 2410 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 19 | 3844205VK2734S | 1431 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 20 | 5754505VK2755S | 1361 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 21 | 4728234VK2742N | 210 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 22 | 4575021VK2747N | 1254 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 23 | 8126143VK2782N | 3139 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 24 | 5750008VK2754N | 1427 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 25 | 5029336VK2752N | 204 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 26 | 4664414VK2746S | 2656 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 27 | 2056322VK2725N | 40 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 28 | 4465406VK2746S | 4809 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 29 | 5550605VK2754N | 1597 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 30 | 28022A02109005 | 2562 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 31 | 4766023VK2746N | 2570 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 32 | 8532310VK2783S | 404 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 33 | 5139304VK2753N | 26 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 34 | 3645504VK2734S | 1062 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 35 | 27650C3VK2726S | 984 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 36 | 5439403VK2753N | 2195 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 37 | 3778021VK2737S | 1903 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 38 | 3870022VK2736N | 2180 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 39 | 4855082VK2745S | 561 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 40 | 5431960VK2753S | 82 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |

## GOAL B — COLMENAR VIEJO (INE 28045 · CD_MUNICIPIO '045')

**Frame:** 13,028 cadastral parcels — the municipality's FULL Catastro INSPIRE CP population (ATOM `https://www.catastro.hacienda.gob.es/INSPIRE/CadastralParcels/28/ES.SDGC.CP.atom_28.xml` → enclosure DGC 28045, matched by `name+code-agree`; GML 37.5 MB, `http://www.opengis.net/def/crs/EPSG/0/25830` → WGS84 by the frame builder's inverse UTM). **40 drawn uniformly without replacement**, every parcel weighs 1.

**Ámbito register (routing half), fetched live per `CD_MUNICIPIO`:**

| layer | numberMatched (hits) | rows captured | complete | error |
|---|---:|---:|:-:|---|
| `VPLA_V_AMBITO` | NULL | 0 | ✗ | hits failed — java.lang.RuntimeException: Unable to obtain connection: Error de E/S: The Network Adapter could not establish the connection
Unable to obtain connection: Error de E/S: The Network Adapter could not establish the connection
Error de E/S: The Network Adapter could not establish the connection
The Network Adapter could not establish the connection
probsit |
| `VPLA_V_AMBITO_MODIF` | NULL | 0 | ✗ | hits failed — java.lang.RuntimeException: Unable to obtain connection: Error de E/S: The Network Adapter could not establish the connection
Unable to obtain connection: Error de E/S: The Network Adapter could not establish the connection
Error de E/S: The Network Adapter could not establish the connection
The Network Adapter could not establish the connection
probsit |

### The ordinance query, per parcel centroid (`INTERSECTS(GEOMETRY1, POINT(x y))`, EPSG:25830, no municipality pre-filter)

| outcome | n | of |
|---|---:|---:|
| WFS service failure (EXCLUDED) | 40 | 40 |
| **0 rows** — no ordinance polygon at the centroid | 0 | 40 |
| **1 row** — adapted | 0 | 40 |
| **>1 rows** — AMBIGUOUS, refused, never picked | 0 | 40 |
| rows carrying a CD_MUNICIPIO ≠ '045' | 0 | 40 |
| centroid lands in exactly the SIGI polygon '045' (Goal-A predicate, cross-check) | — | 40 |

**Shipped registry's claim at these 40 centroids (`resolveRegisteredJurisdictionAt`):** `none` × 33 · `resolved→es-28079-madrid` × 7

### Per-parameter — published, non-zero, in band (`isKnown`) over the 0 single-row parcels — ⚠ NOT "resolved"; a refusal still voids the record

| parameter (source column) | known | of 0 |
|---|---:|---:|
| height (NM_ALTURA) | 0 | n/a |
| storeys (NM_N_PLTA) | 0 | n/a |
| coverage (NM_OCP_MX) | 0 | n/a |
| depth (NM_FDO_MX_ED) — no shared slot | 0 | n/a |
| setback front (NM_RTR_FRNT) | 0 | n/a |
| setback side (NM_RTR_LATL) | 0 | n/a |
| setback rear (NM_RTR_POST) | 0 | n/a |
| setback TRIPLE complete | 0 | n/a |
| FAR — from NM_C_ED_ORD (per ORDINANCE) | 0 | n/a |
| FAR — from NM_C_ED_MAZ (per MANZANA — block granularity, read only when ORD is absent) | 0 | n/a |
| min frontage (NM_FRTE_MIN) | 0 | n/a |
| **impossible storey height** (NM_ALTURA ÷ NM_N_PLTA outside [2.2, 5.0] → `parameters-contradict`) | 0 | n/a |

**Grammar:** —

**Ordinance designations (DS_NOMB_ORD):** —

**Soil class (DS_CLAS_SUE):** —

**Ámbito:** named on 0 of 0 · resolved in the register 0 · ambiguous key (>1 instrument) 0

**Refusals — AS SHIPPED (gate closed):** — ⇒ drawable **0 of 0** — **as shipped: 0 numbers reach a user** (and `CM_SPACM_REGISTRATION_BLOCKED` means no card from this adapter does either).

**Refusals — IF SIGNED (`verificationGateOpen: true`):** — ⇒ drawable **0 of 0**.

### Per parcel

| # | ref | area m² | rows | CD_MUN | DS_NOMB_ORD | soil | ámbito (register matches) | grammar | known: H/P/OCP/FDO/F/S/R/FAR(src) | contradiction | IF SIGNED | AS SHIPPED |
|---:|---|---:|---:|---|---|---|---|---|---|:-:|---|---|
| 1 | 4229511VL3042N | 398 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 2 | 5110501VL3051S | 164 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 3 | 4610901VL3041S | 146 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 4 | 28045A04300032 | 16939 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 5 | 4104610VL3040S | 458 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 6 | 28045A02309019 | 701 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 7 | 3927707VL3032N | 494 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 8 | 9580138VK4997N | 2836 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 9 | 5316312VL3051N | 85 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 10 | 4324411VL3042S | 120 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 11 | 5817709VL3051N | 507 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 12 | 28045A01500304 | 6857 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 13 | 5610873VL3051S | 85 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 14 | 5423506VL3052S | 498 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 15 | 5312412VL3051S | 178 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 16 | 5016611VL3051N | 89 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 17 | 5110521VL3051S | 206 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 18 | 28045A03200058 | 309220 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 19 | 3907801VL3030N | 1065 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 20 | 3923104VL3032S | 203 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 21 | 5617104VL3051N | 301 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 22 | 28045A03200042 | 17715 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 23 | 28045A00600004 | 280694 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 24 | 4811807VL3041S | 170 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 25 | 28045A03000043 | 62707 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 26 | 5413909VL3051S | 305 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 27 | 4809720VL3040N | 127 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 28 | 28045A01200027 | 34624 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 29 | 28045A01500262 | 8225 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 30 | 5408509VL3050N | 121 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 31 | 4630613VL3043S | 734 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 32 | 4116259VL3041S | 595 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 33 | 4814915VL3041S | 40 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 34 | 5610817VL3051S | 94 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 35 | 5917206VL3051N | 2656 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 36 | 5211331VL3051S | 184 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 37 | 000900800VK39H | 4911 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 38 | 28045A04100004 | 2663 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 39 | 28045A02300012 | 105884 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |
| 40 | 3928107VL3042N | 477 | ERR 400 |  |  |  |  |  |  |  | service-failure | service-failure |

## Slot-coverage frames (the shared classifier — `slots.ts`)

### Frame `boadilla-del-monte · AS SHIPPED`

**Frame (the denominator, stated):** 40 REAL Catastro parcels drawn uniformly (seed 20260802) over BOADILLA DEL MONTE's FULL INSPIRE CP population of 8,456; one live `sitcm:VPLA_V_ORDENANZA` INTERSECTS query per centroid; the SHIPPED `adaptSpacmRow` with the live ámbito register — gate CLOSED (the shipped state).

| class | n | share of answered points |
|---|---:|---:|
| `service-failure` (EXCLUDED from every denominator) | 40 | — |
| `no-plan-served` (source answered, nothing here) | 0 | n/a |
| **F2** correct-null — the ordinance answers "no envelope" | 0 | n/a |
| **F1** gap — governed + buildable, PRYZM serves no mechanism | 0 | n/a |
| `shape-rule-unmeasured` — the pack answers with a SHAPE, not scalars (EXCLUDED from the slot denominator) | 0 | n/a |
| `resolved` — at least one envelope slot resolved | 0 | n/a |
| probed | 40 | |

**⭐ ENVELOPE SLOT COVERAGE = null (no answerable point)** — 0 slots resolved ÷ (8 × 0 answerable points).

Answerable = F1 + resolved. **F2 and `shape-rule-unmeasured` are excluded from this denominator by construction** — the first has no subject, the second has no scalar to fill.

| slot | resolved on n of 0 answerable |
|---|---:|
| `setback.front` | 0 |
| `setback.side` | 0 |
| `setback.rear` | 0 |
| `maxHeight` | 0 |
| `maxFloors` | 0 |
| `maxFAR` | 0 |
| `maxCoverage` | 0 |
| `permittedUse` | 0 |

### Frame `boadilla-del-monte · IF SIGNED`

**Frame (the denominator, stated):** 40 REAL Catastro parcels drawn uniformly (seed 20260802) over BOADILLA DEL MONTE's FULL INSPIRE CP population of 8,456; one live `sitcm:VPLA_V_ORDENANZA` INTERSECTS query per centroid; the SHIPPED `adaptSpacmRow` with the live ámbito register — `verificationGateOpen: true` (DEMONSTRATION, not authorisation).

| class | n | share of answered points |
|---|---:|---:|
| `service-failure` (EXCLUDED from every denominator) | 40 | — |
| `no-plan-served` (source answered, nothing here) | 0 | n/a |
| **F2** correct-null — the ordinance answers "no envelope" | 0 | n/a |
| **F1** gap — governed + buildable, PRYZM serves no mechanism | 0 | n/a |
| `shape-rule-unmeasured` — the pack answers with a SHAPE, not scalars (EXCLUDED from the slot denominator) | 0 | n/a |
| `resolved` — at least one envelope slot resolved | 0 | n/a |
| probed | 40 | |

**⭐ ENVELOPE SLOT COVERAGE = null (no answerable point)** — 0 slots resolved ÷ (8 × 0 answerable points).

Answerable = F1 + resolved. **F2 and `shape-rule-unmeasured` are excluded from this denominator by construction** — the first has no subject, the second has no scalar to fill.

| slot | resolved on n of 0 answerable |
|---|---:|
| `setback.front` | 0 |
| `setback.side` | 0 |
| `setback.rear` | 0 |
| `maxHeight` | 0 |
| `maxFloors` | 0 |
| `maxFAR` | 0 |
| `maxCoverage` | 0 |
| `permittedUse` | 0 |

### Frame `colmenar-viejo · AS SHIPPED`

**Frame (the denominator, stated):** 40 REAL Catastro parcels drawn uniformly (seed 20260802) over COLMENAR VIEJO's FULL INSPIRE CP population of 13,028; one live `sitcm:VPLA_V_ORDENANZA` INTERSECTS query per centroid; the SHIPPED `adaptSpacmRow` with the live ámbito register — gate CLOSED (the shipped state).

| class | n | share of answered points |
|---|---:|---:|
| `service-failure` (EXCLUDED from every denominator) | 40 | — |
| `no-plan-served` (source answered, nothing here) | 0 | n/a |
| **F2** correct-null — the ordinance answers "no envelope" | 0 | n/a |
| **F1** gap — governed + buildable, PRYZM serves no mechanism | 0 | n/a |
| `shape-rule-unmeasured` — the pack answers with a SHAPE, not scalars (EXCLUDED from the slot denominator) | 0 | n/a |
| `resolved` — at least one envelope slot resolved | 0 | n/a |
| probed | 40 | |

**⭐ ENVELOPE SLOT COVERAGE = null (no answerable point)** — 0 slots resolved ÷ (8 × 0 answerable points).

Answerable = F1 + resolved. **F2 and `shape-rule-unmeasured` are excluded from this denominator by construction** — the first has no subject, the second has no scalar to fill.

| slot | resolved on n of 0 answerable |
|---|---:|
| `setback.front` | 0 |
| `setback.side` | 0 |
| `setback.rear` | 0 |
| `maxHeight` | 0 |
| `maxFloors` | 0 |
| `maxFAR` | 0 |
| `maxCoverage` | 0 |
| `permittedUse` | 0 |

### Frame `colmenar-viejo · IF SIGNED`

**Frame (the denominator, stated):** 40 REAL Catastro parcels drawn uniformly (seed 20260802) over COLMENAR VIEJO's FULL INSPIRE CP population of 13,028; one live `sitcm:VPLA_V_ORDENANZA` INTERSECTS query per centroid; the SHIPPED `adaptSpacmRow` with the live ámbito register — `verificationGateOpen: true` (DEMONSTRATION, not authorisation).

| class | n | share of answered points |
|---|---:|---:|
| `service-failure` (EXCLUDED from every denominator) | 40 | — |
| `no-plan-served` (source answered, nothing here) | 0 | n/a |
| **F2** correct-null — the ordinance answers "no envelope" | 0 | n/a |
| **F1** gap — governed + buildable, PRYZM serves no mechanism | 0 | n/a |
| `shape-rule-unmeasured` — the pack answers with a SHAPE, not scalars (EXCLUDED from the slot denominator) | 0 | n/a |
| `resolved` — at least one envelope slot resolved | 0 | n/a |
| probed | 40 | |

**⭐ ENVELOPE SLOT COVERAGE = null (no answerable point)** — 0 slots resolved ÷ (8 × 0 answerable points).

Answerable = F1 + resolved. **F2 and `shape-rule-unmeasured` are excluded from this denominator by construction** — the first has no subject, the second has no scalar to fill.

| slot | resolved on n of 0 answerable |
|---|---:|
| `setback.front` | 0 |
| `setback.side` | 0 |
| `setback.rear` | 0 |
| `maxHeight` | 0 |
| `maxFloors` | 0 |
| `maxFAR` | 0 |
| `maxCoverage` | 0 |
| `permittedUse` | 0 |

### Frame `ALL · AS SHIPPED`

**Frame (the denominator, stated):** both municipalities pooled — 80 real Catastro parcels — gate CLOSED.

| class | n | share of answered points |
|---|---:|---:|
| `service-failure` (EXCLUDED from every denominator) | 80 | — |
| `no-plan-served` (source answered, nothing here) | 0 | n/a |
| **F2** correct-null — the ordinance answers "no envelope" | 0 | n/a |
| **F1** gap — governed + buildable, PRYZM serves no mechanism | 0 | n/a |
| `shape-rule-unmeasured` — the pack answers with a SHAPE, not scalars (EXCLUDED from the slot denominator) | 0 | n/a |
| `resolved` — at least one envelope slot resolved | 0 | n/a |
| probed | 80 | |

**⭐ ENVELOPE SLOT COVERAGE = null (no answerable point)** — 0 slots resolved ÷ (8 × 0 answerable points).

Answerable = F1 + resolved. **F2 and `shape-rule-unmeasured` are excluded from this denominator by construction** — the first has no subject, the second has no scalar to fill.

| slot | resolved on n of 0 answerable |
|---|---:|
| `setback.front` | 0 |
| `setback.side` | 0 |
| `setback.rear` | 0 |
| `maxHeight` | 0 |
| `maxFloors` | 0 |
| `maxFAR` | 0 |
| `maxCoverage` | 0 |
| `permittedUse` | 0 |

### Frame `ALL · IF SIGNED`

**Frame (the denominator, stated):** both municipalities pooled — 80 real Catastro parcels — gate OPEN (demonstration).

| class | n | share of answered points |
|---|---:|---:|
| `service-failure` (EXCLUDED from every denominator) | 80 | — |
| `no-plan-served` (source answered, nothing here) | 0 | n/a |
| **F2** correct-null — the ordinance answers "no envelope" | 0 | n/a |
| **F1** gap — governed + buildable, PRYZM serves no mechanism | 0 | n/a |
| `shape-rule-unmeasured` — the pack answers with a SHAPE, not scalars (EXCLUDED from the slot denominator) | 0 | n/a |
| `resolved` — at least one envelope slot resolved | 0 | n/a |
| probed | 80 | |

**⭐ ENVELOPE SLOT COVERAGE = null (no answerable point)** — 0 slots resolved ÷ (8 × 0 answerable points).

Answerable = F1 + resolved. **F2 and `shape-rule-unmeasured` are excluded from this denominator by construction** — the first has no subject, the second has no scalar to fill.

| slot | resolved on n of 0 answerable |
|---|---:|
| `setback.front` | 0 |
| `setback.side` | 0 |
| `setback.rear` | 0 |
| `maxHeight` | 0 |
| `maxFloors` | 0 |
| `maxFAR` | 0 |
| `maxCoverage` | 0 |
| `permittedUse` | 0 |

> Wall time 159 s.
