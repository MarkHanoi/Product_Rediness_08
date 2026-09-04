# Illes Balears (Manacor 07033 + Palma 07040) — envelope slot coverage on REAL parcels, MEASURED 2026-09-04

> Command: `npx tsx tools/envelope-slot-coverage/measureBalears.ts --n 40 --seed 20260904 --gap 300` (ONLINE — Catastro ATOM + wfsCP oracle, GOIB MUIB ArcGIS layer 10, muib.caib.es fitxes) · asOf 2026-09-04 · slots: setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage, permittedUse

> ⛔ **NOTHING HERE IS SIGNED.** The shipped publication state was READ from the code at run time:
>
> `BALEARS_ENVELOPE_VERIFIED` = **false** · `isEnvelopePublicationAuthorised('es-ib-balears')` = **false** · `envelopePublicationPosture` = **`open-top-indicative`** (authorisationReason `gate-shut`) · `mayDrawEnvelope` = true · `mayPublishAsDetermination` = **false** · `rendererCanExpressOpenTop` = true · server proxy path == client path: true
>
> **AS SHIPPED — determination arm: 0 numbers reach a user as a determination** (gate SHUT ⇒ every `ok` resolution is F1 by `measureEs.ts`'s own rule). **AS SHIPPED — indicative arm: the editor DOES compute and draw an OPEN-TOP INDICATIVE solid from the fitxa's numbers** (`applyBalearsZoningThenFallback`, stamped `open-top-indicative`, claims no buildable right). ⚠ That function's comment near line 7870 (“BOTH ARE UNREACHABLE TODAY … `OPEN_TOP_INDICATIVE_JURISDICTIONS` ships empty”) is STALE — the registry lists Balears. **IF SIGNED:** the slot counts equal the indicative arm — a signature changes the stamp, not which slots the fitxa fills.

## MANACOR (INE 07033)

**Frame:** 40 REAL Catastro parcels drawn UNIFORMLY WITHOUT REPLACEMENT (seed 20260904) over MANACOR's FULL INSPIRE CP parcel population of 34,257 parcels (ATOM enclosure A.ES.SDGC.CP.07033.zip, 77.4 MB GML, cached 2026-09-04; CRS read from the file: http://www.opengis.net/def/crs/EPSG/0/25831). Each parcel's re-projected centroid was cross-checked against the independent `wfsCP.aspx` oracle; the shipped `resolveBalearsMuib` was then run at the point through the server's own `fetchBalearsMuibAtPoint` mapping, `asOf` 2026-09-04.

### Headline counts

| measure | n / denominator |
|---|---:|
| parcels drawn (uniform, seed-stated, over the full municipal Catastro CP population) | 40 |
| centroid CONFIRMED by the independent `wfsCP.aspx` oracle (same refcat returned at the point) | 40 / 40 (100.0 %) |
| … of which the point had to be relocated to a GetParcel interior point (concave/multipart) | 0 |
| `service-failure` (an upstream did not answer — EXCLUDED below) | 0 |
| answered points | 40 |
| MUIB QUALIFICACIONS returned ≥ 1 polygon at the point | 40 / 40 (100.0 %) |
| a zone identity reached the record/refusal (CODIMUIB or CODIAJ) | 40 / 40 (100.0 %) |
| resolver `ok` (zone + fitxa + drawable parameters) | 11 / 40 (27.5 %) |
| fitxa HTML FETCHED by the proxy (first feature's own `URL`) — any land class | 40 / 40 (100.0 %) |
| … of which on SU/SB land (a ZONE fitxa; SR pages are rustic category sheets the resolver never reads) | 16 / 40 (40.0 %) |
| fitxa READ by the resolver (ok, or refused AFTER parsing) | 16 / 40 (40.0 %) |
| fitxa cites an article ON an envelope-bearing parameter (NP/HR/HT/O/E/RA/RF/RM/PE) — per parcel, over ALL fitxes fetched | 16 / 40 (40.0 %) |
| fitxa cites an article ON an envelope-bearing parameter — per parcel, over SU/SB fitxes fetched | 16 / 16 (100.0 %) |
| fitxa cites an article ANYWHERE on the page (weak form) — per parcel, over ALL fitxes fetched | 16 / 40 (40.0 %) |
| fitxa cites an article ANYWHERE on the page (weak form) — per parcel, over SU/SB fitxes fetched | 16 / 16 (100.0 %) |
| `ok` records whose `articleRefs` is non-empty — over `ok` | 11 / 11 (100.0 %) |
| DISTINCT fitxes (by the feature's own `URL`) fetched — any class | 9 |
| … of which cite an article on a parameter | 8 / 9 (88.9 %) |
| DISTINCT SU/SB fitxes fetched | 8 |
| … of which cite an article on a parameter | 8 / 8 (100.0 %) |
| `resolved` on the INDICATIVE arm (≥ 1 slot) | 11 / 40 (27.5 %) |
| `resolved` on the DETERMINATION arm (the shipped gate) | 0 / 40 (0.0 %) |

### Resolver outcome histogram

| resolver outcome (CLOSED vocabulary, `resolveBalearsMuib.ts`) | n | share of parcels |
|---|---:|---:|
| `not-buildable-class` | 24 | 60.0 % |
| `ok` | 11 | 27.5 % |
| `no-drawable-parameters` | 5 | 12.5 % |

### Zones seen

| zone (CODIAJ · CODIMUIB · NOM · CODICLAS — verbatim) | parcels | outcomes |
|---|---:|---|
| ? · SR ·  · SR | 24 | not-buildable-class×24 |
| RE-IP-1 · RE_IP_1 · Intensiva Manacor RE-IP-1 · SU | 4 | no-drawable-parameters×4 |
| RE-IP-3 · RE_IP_3 · Intensiva plurifamiliar RE-IP-3 · SU | 3 | ok[3 slots]×3 |
| RE-NA · RE_NA · Nucli antic RE-NA · SU | 3 | ok[3 slots]×3 |
| RE-EP-4 · RE_EP_4 · Extensiva plurifamiliar RE-EP-4 · SU | 2 | ok[3 slots]×2 |
| RE-CB-2 · RE_IP_CB_2 · Fartàritx RE-CB-2 · SU | 1 | no-drawable-parameters×1 |
| RE-EP-1 · RE_EP_1 · Extensiva plurifamiliar RE-EP-1 · SU | 1 | ok[3 slots]×1 |
| RE-EU-11 · RE_EU_11 · Extensiva unifamiliar RE-EU-11 · SU | 1 | ok[3 slots]×1 |
| RE-EU-3 · RE_EU_3 · Extensiva unifamiliar RE-EU-3 · SU | 1 | ok[3 slots]×1 |

### Frame `manacor/determination`

**Frame (the denominator, stated):** 40 REAL Catastro parcels drawn UNIFORMLY WITHOUT REPLACEMENT (seed 20260904) over MANACOR's FULL INSPIRE CP parcel population of 34,257 parcels (ATOM enclosure A.ES.SDGC.CP.07033.zip, 77.4 MB GML, cached 2026-09-04; CRS read from the file: http://www.opengis.net/def/crs/EPSG/0/25831). Each parcel's re-projected centroid was cross-checked against the independent `wfsCP.aspx` oracle; the shipped `resolveBalearsMuib` was then run at the point through the server's own `fetchBalearsMuibAtPoint` mapping, `asOf` 2026-09-04. ARM: determination (the shipped L-449 gate).

| class | n | share of answered points |
|---|---:|---:|
| `service-failure` (EXCLUDED from every denominator) | 0 | — |
| `no-plan-served` (source answered, nothing here) | 0 | 0.0 % |
| **F2** correct-null — the ordinance answers "no envelope" | 24 | 60.0 % |
| **F1** gap — governed + buildable, PRYZM serves no mechanism | 16 | 40.0 % |
| `shape-rule-unmeasured` — the pack answers with a SHAPE, not scalars (EXCLUDED from the slot denominator) | 0 | 0.0 % |
| `resolved` — at least one envelope slot resolved | 0 | 0.0 % |
| probed | 40 | |

**⭐ ENVELOPE SLOT COVERAGE = 0.0 %** — 0 slots resolved ÷ (8 × 16 answerable points).

Answerable = F1 + resolved. **F2 and `shape-rule-unmeasured` are excluded from this denominator by construction** — the first has no subject, the second has no scalar to fill.

| slot | resolved on n of 16 answerable |
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
| RE-IP-1 | 4 |
| RE-NA | 3 |
| RE-IP-3 | 3 |
| RE-EP-4 | 2 |
| RE-CB-2 | 1 |
| RE-EP-1 | 1 |
| RE-EU-11 | 1 |
| RE-EU-3 | 1 |

### Frame `manacor/indicative`

**Frame (the denominator, stated):** 40 REAL Catastro parcels drawn UNIFORMLY WITHOUT REPLACEMENT (seed 20260904) over MANACOR's FULL INSPIRE CP parcel population of 34,257 parcels (ATOM enclosure A.ES.SDGC.CP.07033.zip, 77.4 MB GML, cached 2026-09-04; CRS read from the file: http://www.opengis.net/def/crs/EPSG/0/25831). Each parcel's re-projected centroid was cross-checked against the independent `wfsCP.aspx` oracle; the shipped `resolveBalearsMuib` was then run at the point through the server's own `fetchBalearsMuibAtPoint` mapping, `asOf` 2026-09-04. ARM: indicative draw (= "if signed" for slot counting).

| class | n | share of answered points |
|---|---:|---:|
| `service-failure` (EXCLUDED from every denominator) | 0 | — |
| `no-plan-served` (source answered, nothing here) | 0 | 0.0 % |
| **F2** correct-null — the ordinance answers "no envelope" | 24 | 60.0 % |
| **F1** gap — governed + buildable, PRYZM serves no mechanism | 5 | 12.5 % |
| `shape-rule-unmeasured` — the pack answers with a SHAPE, not scalars (EXCLUDED from the slot denominator) | 0 | 0.0 % |
| `resolved` — at least one envelope slot resolved | 11 | 27.5 % |
| probed | 40 | |

**⭐ ENVELOPE SLOT COVERAGE = 25.8 %** — 33 slots resolved ÷ (8 × 16 answerable points).

Answerable = F1 + resolved. **F2 and `shape-rule-unmeasured` are excluded from this denominator by construction** — the first has no subject, the second has no scalar to fill.

| slot | resolved on n of 16 answerable |
|---|---:|
| `setback.front` | 0 |
| `setback.side` | 0 |
| `setback.rear` | 0 |
| `maxHeight` | 0 |
| `maxFloors` | 11 |
| `maxFAR` | 11 |
| `maxCoverage` | 11 |
| `permittedUse` | 0 |

**The F1 build queue, measured (top zones by point count):**

| zone (verbatim from the source) | n |
|---|---:|
| RE-IP-1 | 4 |
| RE-CB-2 | 1 |

## PALMA (INE 07040)

**Frame:** 40 REAL Catastro parcels drawn UNIFORMLY WITHOUT REPLACEMENT (seed 20260904) over PALMA's FULL INSPIRE CP parcel population of 45,333 parcels (ATOM enclosure A.ES.SDGC.CP.07040.zip, 103.3 MB GML, fetched 2026-09-04; CRS read from the file: http://www.opengis.net/def/crs/EPSG/0/25831). Each parcel's re-projected centroid was cross-checked against the independent `wfsCP.aspx` oracle; the shipped `resolveBalearsMuib` was then run at the point through the server's own `fetchBalearsMuibAtPoint` mapping, `asOf` 2026-09-04.

### Headline counts

| measure | n / denominator |
|---|---:|
| parcels drawn (uniform, seed-stated, over the full municipal Catastro CP population) | 40 |
| centroid CONFIRMED by the independent `wfsCP.aspx` oracle (same refcat returned at the point) | 40 / 40 (100.0 %) |
| … of which the point had to be relocated to a GetParcel interior point (concave/multipart) | 0 |
| `service-failure` (an upstream did not answer — EXCLUDED below) | 0 |
| answered points | 40 |
| MUIB QUALIFICACIONS returned ≥ 1 polygon at the point | 40 / 40 (100.0 %) |
| a zone identity reached the record/refusal (CODIMUIB or CODIAJ) | 40 / 40 (100.0 %) |
| resolver `ok` (zone + fitxa + drawable parameters) | 0 / 40 (0.0 %) |
| fitxa HTML FETCHED by the proxy (first feature's own `URL`) — any land class | 40 / 40 (100.0 %) |
| … of which on SU/SB land (a ZONE fitxa; SR pages are rustic category sheets the resolver never reads) | 36 / 40 (90.0 %) |
| fitxa READ by the resolver (ok, or refused AFTER parsing) | 0 / 40 (0.0 %) |
| fitxa cites an article ON an envelope-bearing parameter (NP/HR/HT/O/E/RA/RF/RM/PE) — per parcel, over ALL fitxes fetched | 0 / 40 (0.0 %) |
| fitxa cites an article ON an envelope-bearing parameter — per parcel, over SU/SB fitxes fetched | 0 / 36 (0.0 %) |
| fitxa cites an article ANYWHERE on the page (weak form) — per parcel, over ALL fitxes fetched | 0 / 40 (0.0 %) |
| fitxa cites an article ANYWHERE on the page (weak form) — per parcel, over SU/SB fitxes fetched | 0 / 36 (0.0 %) |
| `ok` records whose `articleRefs` is non-empty — over `ok` | 0 / 0 (n/a) |
| DISTINCT fitxes (by the feature's own `URL`) fetched — any class | 21 |
| … of which cite an article on a parameter | 0 / 21 (0.0 %) |
| DISTINCT SU/SB fitxes fetched | 20 |
| … of which cite an article on a parameter | 0 / 20 (0.0 %) |
| `resolved` on the INDICATIVE arm (≥ 1 slot) | 0 / 40 (0.0 %) |
| `resolved` on the DETERMINATION arm (the shipped gate) | 0 / 40 (0.0 %) |

### Resolver outcome histogram

| resolver outcome (CLOSED vocabulary, `resolveBalearsMuib.ts`) | n | share of parcels |
|---|---:|---:|
| `plan-not-current` | 40 | 100.0 % |

### Zones seen

| zone (CODIAJ · CODIMUIB · NOM · CODICLAS — verbatim) | parcels | outcomes |
|---|---:|---|
| B2a · RE_IP_B2a · Plurifamiliar amb alineació façana b2a · SU | 8 | plan-not-current×8 |
| B3x · RE_IP_B3x · Plurifamiliar amb alineació façana b3x · SU | 6 | plan-not-current×6 |
| ? · SR ·  · SR | 4 | plan-not-current×4 |
| J2b · RE_IU_J2b · Unifamiliar Suburbana J2b · SU | 3 | plan-not-current×3 |
| B3a · RE_IP_B3a · Residencial plurifamiliar amb planta baixa dedicaca a comercial i serveis · SU | 2 | plan-not-current×2 |
| E4a · RE_EP_E4a · Plurifamiliar aillada · SU | 2 | plan-not-current×2 |
| A6a · RE_IP_A6a · Plurifamiliar amb Alineació Façana A6a · SU | 1 | plan-not-current×1 |
| A7a · RE_IP_A7a · Plurifamiliar amb Alineació Façana A7a · SU | 1 | plan-not-current×1 |
| ARE 42-01 · RE_IP_ARE_42_01 · Establiments · SU | 1 | plan-not-current×1 |
| ARE-SUC · RE_IP_ARE_SUC · Sòl urbà consolidat · SU | 1 | plan-not-current×1 |
| D(3+a)p · RE_IP_D3ap_fp · Edificación residencial entre medianeras: 3 alturas más ático y porche; fuera de profundidad edificable · SU | 1 | plan-not-current×1 |
| D2a · RE_IP_D2a · Plurifamiliar amb Alineació Façana - Reculada (3 mts) D2a · SU | 1 | plan-not-current×1 |
| D3a · RE_IP_D3a · Plurifamiliar amb Alineació Façana - Reculada (3 mts) D3a · SU | 1 | plan-not-current×1 |
| E5a · RE_EP_E5a · Plurifamiliar Aillada E5a · SU | 1 | plan-not-current×1 |
| EQ-AP04 DO · EQ_DO_EQ-AP04_DO · Equipamientos y dotaciones: Docente · SU | 1 | plan-not-current×1 |
| F0a · RE_IP_F0a · Plurifamiliar Volumetría Específica F0a · SU | 1 | plan-not-current×1 |
| I2a · RE_EU_I2a · Unifamiliar · SU | 1 | plan-not-current×1 |
| I2a · RE_EU_I2a · Viviendas unifamiliares aisladas, subzona a · SU | 1 | plan-not-current×1 |
| I2d · RE_EU_I2d · Unifamiliar Aillada I2d · SU | 1 | plan-not-current×1 |
| J2a · RE_EU_J2a · Unifamiliar Suburbana J2a · SU | 1 | plan-not-current×1 |
| L2a · IN_L2a · Secundàri Minipoligons L2a · SU | 1 | plan-not-current×1 |

### Frame `palma/determination`

**Frame (the denominator, stated):** 40 REAL Catastro parcels drawn UNIFORMLY WITHOUT REPLACEMENT (seed 20260904) over PALMA's FULL INSPIRE CP parcel population of 45,333 parcels (ATOM enclosure A.ES.SDGC.CP.07040.zip, 103.3 MB GML, fetched 2026-09-04; CRS read from the file: http://www.opengis.net/def/crs/EPSG/0/25831). Each parcel's re-projected centroid was cross-checked against the independent `wfsCP.aspx` oracle; the shipped `resolveBalearsMuib` was then run at the point through the server's own `fetchBalearsMuibAtPoint` mapping, `asOf` 2026-09-04. ARM: determination (the shipped L-449 gate).

| class | n | share of answered points |
|---|---:|---:|
| `service-failure` (EXCLUDED from every denominator) | 0 | — |
| `no-plan-served` (source answered, nothing here) | 0 | 0.0 % |
| **F2** correct-null — the ordinance answers "no envelope" | 40 | 100.0 % |
| **F1** gap — governed + buildable, PRYZM serves no mechanism | 0 | 0.0 % |
| `shape-rule-unmeasured` — the pack answers with a SHAPE, not scalars (EXCLUDED from the slot denominator) | 0 | 0.0 % |
| `resolved` — at least one envelope slot resolved | 0 | 0.0 % |
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

### Frame `palma/indicative`

**Frame (the denominator, stated):** 40 REAL Catastro parcels drawn UNIFORMLY WITHOUT REPLACEMENT (seed 20260904) over PALMA's FULL INSPIRE CP parcel population of 45,333 parcels (ATOM enclosure A.ES.SDGC.CP.07040.zip, 103.3 MB GML, fetched 2026-09-04; CRS read from the file: http://www.opengis.net/def/crs/EPSG/0/25831). Each parcel's re-projected centroid was cross-checked against the independent `wfsCP.aspx` oracle; the shipped `resolveBalearsMuib` was then run at the point through the server's own `fetchBalearsMuibAtPoint` mapping, `asOf` 2026-09-04. ARM: indicative draw (= "if signed" for slot counting).

| class | n | share of answered points |
|---|---:|---:|
| `service-failure` (EXCLUDED from every denominator) | 0 | — |
| `no-plan-served` (source answered, nothing here) | 0 | 0.0 % |
| **F2** correct-null — the ordinance answers "no envelope" | 40 | 100.0 % |
| **F1** gap — governed + buildable, PRYZM serves no mechanism | 0 | 0.0 % |
| `shape-rule-unmeasured` — the pack answers with a SHAPE, not scalars (EXCLUDED from the slot denominator) | 0 | 0.0 % |
| `resolved` — at least one envelope slot resolved | 0 | 0.0 % |
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

## Both municipalities pooled

### Headline counts

| measure | n / denominator |
|---|---:|
| parcels drawn (uniform, seed-stated, over the full municipal Catastro CP population) | 80 |
| centroid CONFIRMED by the independent `wfsCP.aspx` oracle (same refcat returned at the point) | 80 / 80 (100.0 %) |
| … of which the point had to be relocated to a GetParcel interior point (concave/multipart) | 0 |
| `service-failure` (an upstream did not answer — EXCLUDED below) | 0 |
| answered points | 80 |
| MUIB QUALIFICACIONS returned ≥ 1 polygon at the point | 80 / 80 (100.0 %) |
| a zone identity reached the record/refusal (CODIMUIB or CODIAJ) | 80 / 80 (100.0 %) |
| resolver `ok` (zone + fitxa + drawable parameters) | 11 / 80 (13.8 %) |
| fitxa HTML FETCHED by the proxy (first feature's own `URL`) — any land class | 80 / 80 (100.0 %) |
| … of which on SU/SB land (a ZONE fitxa; SR pages are rustic category sheets the resolver never reads) | 52 / 80 (65.0 %) |
| fitxa READ by the resolver (ok, or refused AFTER parsing) | 16 / 80 (20.0 %) |
| fitxa cites an article ON an envelope-bearing parameter (NP/HR/HT/O/E/RA/RF/RM/PE) — per parcel, over ALL fitxes fetched | 16 / 80 (20.0 %) |
| fitxa cites an article ON an envelope-bearing parameter — per parcel, over SU/SB fitxes fetched | 16 / 52 (30.8 %) |
| fitxa cites an article ANYWHERE on the page (weak form) — per parcel, over ALL fitxes fetched | 16 / 80 (20.0 %) |
| fitxa cites an article ANYWHERE on the page (weak form) — per parcel, over SU/SB fitxes fetched | 16 / 52 (30.8 %) |
| `ok` records whose `articleRefs` is non-empty — over `ok` | 11 / 11 (100.0 %) |
| DISTINCT fitxes (by the feature's own `URL`) fetched — any class | 29 |
| … of which cite an article on a parameter | 8 / 29 (27.6 %) |
| DISTINCT SU/SB fitxes fetched | 28 |
| … of which cite an article on a parameter | 8 / 28 (28.6 %) |
| `resolved` on the INDICATIVE arm (≥ 1 slot) | 11 / 80 (13.8 %) |
| `resolved` on the DETERMINATION arm (the shipped gate) | 0 / 80 (0.0 %) |

### Resolver outcome histogram

| resolver outcome (CLOSED vocabulary, `resolveBalearsMuib.ts`) | n | share of parcels |
|---|---:|---:|
| `plan-not-current` | 40 | 50.0 % |
| `not-buildable-class` | 24 | 30.0 % |
| `ok` | 11 | 13.8 % |
| `no-drawable-parameters` | 5 | 6.3 % |

### Frame `ALL/determination`

**Frame (the denominator, stated):** both municipalities pooled — 80 real Catastro parcels. ARM: determination.

| class | n | share of answered points |
|---|---:|---:|
| `service-failure` (EXCLUDED from every denominator) | 0 | — |
| `no-plan-served` (source answered, nothing here) | 0 | 0.0 % |
| **F2** correct-null — the ordinance answers "no envelope" | 64 | 80.0 % |
| **F1** gap — governed + buildable, PRYZM serves no mechanism | 16 | 20.0 % |
| `shape-rule-unmeasured` — the pack answers with a SHAPE, not scalars (EXCLUDED from the slot denominator) | 0 | 0.0 % |
| `resolved` — at least one envelope slot resolved | 0 | 0.0 % |
| probed | 80 | |

**⭐ ENVELOPE SLOT COVERAGE = 0.0 %** — 0 slots resolved ÷ (8 × 16 answerable points).

Answerable = F1 + resolved. **F2 and `shape-rule-unmeasured` are excluded from this denominator by construction** — the first has no subject, the second has no scalar to fill.

| slot | resolved on n of 16 answerable |
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
| RE-IP-1 | 4 |
| RE-NA | 3 |
| RE-IP-3 | 3 |
| RE-EP-4 | 2 |
| RE-CB-2 | 1 |
| RE-EP-1 | 1 |
| RE-EU-11 | 1 |
| RE-EU-3 | 1 |

### Frame `ALL/indicative`

**Frame (the denominator, stated):** both municipalities pooled — 80 real Catastro parcels. ARM: indicative draw.

| class | n | share of answered points |
|---|---:|---:|
| `service-failure` (EXCLUDED from every denominator) | 0 | — |
| `no-plan-served` (source answered, nothing here) | 0 | 0.0 % |
| **F2** correct-null — the ordinance answers "no envelope" | 64 | 80.0 % |
| **F1** gap — governed + buildable, PRYZM serves no mechanism | 5 | 6.3 % |
| `shape-rule-unmeasured` — the pack answers with a SHAPE, not scalars (EXCLUDED from the slot denominator) | 0 | 0.0 % |
| `resolved` — at least one envelope slot resolved | 11 | 13.8 % |
| probed | 80 | |

**⭐ ENVELOPE SLOT COVERAGE = 25.8 %** — 33 slots resolved ÷ (8 × 16 answerable points).

Answerable = F1 + resolved. **F2 and `shape-rule-unmeasured` are excluded from this denominator by construction** — the first has no subject, the second has no scalar to fill.

| slot | resolved on n of 16 answerable |
|---|---:|
| `setback.front` | 0 |
| `setback.side` | 0 |
| `setback.rear` | 0 |
| `maxHeight` | 0 |
| `maxFloors` | 11 |
| `maxFAR` | 11 |
| `maxCoverage` | 11 |
| `permittedUse` | 0 |

**The F1 build queue, measured (top zones by point count):**

| zone (verbatim from the source) | n |
|---|---:|
| RE-IP-1 | 4 |
| RE-CB-2 | 1 |

### ⚠ The ratified F1/F2 seam on `plan-not-current`

`balearsRefusal('plan-not-current')` ships `legallyGrounded: true` (“grounded in the PUBLISHER'S OWN statement”), so `classifyRefusal` files the **40** such parcels (palma 40) as **F2 correct-null** and they LEAVE the answerable denominator. Read literally against the brief's F1 definition (“a plan governs, no mechanism — GAP”) these are land where a plan DOES govern and PRYZM has no current mechanism; the publisher merely says MUIB is out of date there. This harness does NOT re-class them (no rival vocabulary — `slots.ts` header), but it prints the alternative so nobody reads Palma's absence from the F1 build queue as coverage: if `plan-not-current` were read as F1, the pooled answerable denominator would be 56 instead of 16, and the indicative slot coverage 7.4 % instead of 25.8 %.

### Upstream HTTP log (every outbound request this run made)

| host | status | n | median ms |
|---|---|---:|---:|
| ideib.caib.es | 200 | 80 | 226 |
| ovc.catastro.meh.es | 200 | 80 | 172 |
| muib.caib.es | 200 | 29 | 327 |
| (fitxa cache) | served from per-run cache | 51 | |

_Article cross-check: the resolver's `articleRefs` and this harness's re-parse of the same HTML agree on every `ok` record (11)._

## Per-parcel records

| muni | refcat | oracle | zone CODIAJ (CODIMUIB) | class | plan | identitat | outcome | slots (indicative arm) | articles on params | articles anywhere |
|---|---|---|---|---|---|---:|---|---|---|---|
| manacor | 000700100ED18B | hit | — (SR) | SR | — | — | not-buildable-class → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| manacor | 07033A02600757 | hit | — (SR) | SR | — | — | not-buildable-class → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| manacor | 8097607ED1789N | hit | RE-NA (RE_NA) | SU | 2021_PG_MANACOR_033 | 292430 | ok → det:f1-gap / ind:resolved | maxFloors, maxFAR, maxCoverage | Article 66; Article 56.3.j | Article 66; Article 56.3.j |
| manacor | 8397034ED1789N | hit | RE-CB-2 (RE_IP_CB_2) | SU | 2021_PG_MANACOR_033 | 292433 | no-drawable-parameters → det:f1-gap / ind:f1-gap | — | Article 66; Article 56.3.j | Article 56.3.j; Article 66; Article 74 |
| manacor | 07033A02500867 | hit | — (SR) | SR | — | — | not-buildable-class → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| manacor | 07033A02700646 | hit | — (SR) | SR | — | — | not-buildable-class → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| manacor | 07033A03400144 | hit | — (SR) | SR | — | — | not-buildable-class → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| manacor | 07033A02700429 | hit | — (SR) | SR | — | — | not-buildable-class → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| manacor | 07033A02401369 | hit | — (SR) | SR | — | — | not-buildable-class → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| manacor | 07033A00400193 | hit | — (SR) | SR | — | — | not-buildable-class → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| manacor | 07033A00300007 | hit | — (SR) | SR | — | — | not-buildable-class → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| manacor | 7507008ED1870N | hit | RE-IP-1 (RE_IP_1) | SU | 2021_PG_MANACOR_033 | 292441 | no-drawable-parameters → det:f1-gap / ind:f1-gap | — | Article 66 | Article 66; Article 74 |
| manacor | 07033A03400054 | hit | — (SR) | SR | — | — | not-buildable-class → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| manacor | 07033A01800174 | hit | — (SR) | SR | — | — | not-buildable-class → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| manacor | 07033A00700208 | hit | — (SR) | SR | — | — | not-buildable-class → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| manacor | 8506510ED1880N | hit | RE-IP-1 (RE_IP_1) | SU | 2021_PG_MANACOR_033 | 292441 | no-drawable-parameters → det:f1-gap / ind:f1-gap | — | Article 66 | Article 66; Article 74 |
| manacor | 8094706ED1789S | hit | RE-IP-1 (RE_IP_1) | SU | 2021_PG_MANACOR_033 | 292441 | no-drawable-parameters → det:f1-gap / ind:f1-gap | — | Article 66 | Article 66; Article 74 |
| manacor | 07033A01500175 | hit | — (SR) | SR | — | — | not-buildable-class → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| manacor | 07033A02200114 | hit | — (SR) | SR | — | — | not-buildable-class → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| manacor | 7703613ED1870S | hit | RE-NA (RE_NA) | SU | 2021_PG_MANACOR_033 | 292430 | ok → det:f1-gap / ind:resolved | maxFloors, maxFAR, maxCoverage | Article 66; Article 56.3.j | Article 66; Article 56.3.j |
| manacor | 8964001ED2786S | hit | RE-EP-1 (RE_EP_1) | SU | 2021_PG_MANACOR_033 | 292436 | ok → det:f1-gap / ind:resolved | maxFloors, maxFAR, maxCoverage | Article 66 | Article 66 |
| manacor | 25700A1ED2627S | hit | RE-EP-4 (RE_EP_4) | SU | 2021_PG_MANACOR_033 | 292439 | ok → det:f1-gap / ind:resolved | maxFloors, maxFAR, maxCoverage | Article 66 | Article 66 |
| manacor | 07033A01800028 | hit | — (SR) | SR | — | — | not-buildable-class → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| manacor | 07033A02300306 | hit | — (SR) | SR | — | — | not-buildable-class → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| manacor | 8775201ED2787N | hit | RE-IP-3 (RE_IP_3) | SU | 2021_PG_MANACOR_033 | 292443 | ok → det:f1-gap / ind:resolved | maxFloors, maxFAR, maxCoverage | Article 66; Article 56.3.j | Article 66; Article 56.3.j; Article 74 |
| manacor | 8400015ED1880S | hit | RE-NA (RE_NA) | SU | 2021_PG_MANACOR_033 | 292430 | ok → det:f1-gap / ind:resolved | maxFloors, maxFAR, maxCoverage | Article 66; Article 56.3.j | Article 66; Article 56.3.j |
| manacor | 07033A02300204 | hit | — (SR) | SR | — | — | not-buildable-class → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| manacor | 7301402ED1870S | hit | RE-IP-1 (RE_IP_1) | SU | 2021_PG_MANACOR_033 | 292441 | no-drawable-parameters → det:f1-gap / ind:f1-gap | — | Article 66 | Article 66; Article 74 |
| manacor | 38870C6ED2638N | hit | RE-EU-11 (RE_EU_11) | SU | 2021_PG_MANACOR_033 | 292455 | ok → det:f1-gap / ind:resolved | maxFloors, maxFAR, maxCoverage | Article 66 | Article 66 |
| manacor | 07033A02509372 | hit | — (SR) | SR | — | — | not-buildable-class → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| manacor | 8768102ED2786N | hit | RE-IP-3 (RE_IP_3) | SU | 2021_PG_MANACOR_033 | 292443 | ok → det:f1-gap / ind:resolved | maxFloors, maxFAR, maxCoverage | Article 66; Article 56.3.j | Article 66; Article 56.3.j; Article 74 |
| manacor | 2570043ED2627S | hit | RE-EP-4 (RE_EP_4) | SU | 2021_PG_MANACOR_033 | 292439 | ok → det:f1-gap / ind:resolved | maxFloors, maxFAR, maxCoverage | Article 66 | Article 66 |
| manacor | 07033A02300137 | hit | — (SR) | SR | — | — | not-buildable-class → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| manacor | 07033A02300486 | hit | — (SR) | SR | — | — | not-buildable-class → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| manacor | 07033A02300578 | hit | — (SR) | SR | — | — | not-buildable-class → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| manacor | 07033A00600244 | hit | — (SR) | SR | — | — | not-buildable-class → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| manacor | 9126707ED1892N | hit | RE-EU-3 (RE_EU_3) | SU | 2021_PG_MANACOR_033 | 292447 | ok → det:f1-gap / ind:resolved | maxFloors, maxFAR, maxCoverage | Article 66 | Article 66 |
| manacor | 07033A02200294 | hit | — (SR) | SR | — | — | not-buildable-class → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| manacor | 07033A03400864 | hit | — (SR) | SR | — | — | not-buildable-class → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| manacor | 9374207ED2797S | hit | RE-IP-3 (RE_IP_3) | SU | 2021_PG_MANACOR_033 | 292443 | ok → det:f1-gap / ind:resolved | maxFloors, maxFAR, maxCoverage | Article 66; Article 56.3.j | Article 66; Article 56.3.j; Article 74 |
| palma | 9829511DD6892H | hit | B3x (RE_IP_B3x) | SU | REV_DEL_PLAN_GENERAL_DE_ORDENACION_URBANA_1998 | 48470 | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 6102419DD7860C | hit | B2a (RE_IP_B2a) | SU | REV_DEL_PLAN_GENERAL_DE_ORDENACION_URBANA_1998 | 48468 | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 9014210DD6891C | hit | B3x (RE_IP_B3x) | SU | REV_DEL_PLAN_GENERAL_DE_ORDENACION_URBANA_1998 | 48470 | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 5610812DD7851B | hit | D2a (RE_IP_D2a) | SU | REV_DEL_PLAN_GENERAL_DE_ORDENACION_URBANA_1998 | 48491 | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 9914518DD6891D | hit | A6a (RE_IP_A6a) | SU | REV_DEL_PLAN_GENERAL_DE_ORDENACION_URBANA_1998 | 48444 | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 7860929DD6876B | hit | ARE 42-01 (RE_IP_ARE_42_01) | SU | REV_DEL_PLAN_GENERAL_DE_ORDENACION_URBANA_1998 | 87269 | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 2191513DD7729A | hit | B2a (RE_IP_B2a) | SU | REV_DEL_PLAN_GENERAL_DE_ORDENACION_URBANA_1998 | 48468 | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 07040A00200070 | hit | — (SR) | SR | — | — | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 2304502DD7820C | hit | L2a (IN_L2a) | SU | REV_DEL_PLAN_GENERAL_DE_ORDENACION_URBANA_1998 | 48638 | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 7948516DD7774H | hit | I2a (RE_EU_I2a) | SU | PLA_REC_PLATJA_PALMA_7040_2015 | 289098 | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 1418517DD7811G | hit | B3a (RE_IP_B3a) | SU | REV_DEL_PLAN_GENERAL_DE_ORDENACION_URBANA_1998 | 48469 | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 8732519DD7783D | hit | D(3+a)p (RE_IP_D3ap_fp) | SU | PLA_REC_PLATJA_PALMA_7040_2015 | 289034 | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 0707510DD7800F | hit | A7a (RE_IP_A7a) | SU | REV_DEL_PLAN_GENERAL_DE_ORDENACION_URBANA_1998 | 48445 | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 3333508DD7833C | hit | J2b (RE_IU_J2b) | SU | REV_DEL_PLAN_GENERAL_DE_ORDENACION_URBANA_1998 | 48635 | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 5032450DD6853A | hit | I2d (RE_EU_I2d) | SU | REV_DEL_PLAN_GENERAL_DE_ORDENACION_URBANA_1998 | 48633 | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 1910804DD7811B | hit | ARE-SUC (RE_IP_ARE_SUC) | SU | REV_DEL_PLAN_GENERAL_DE_ORDENACION_URBANA_1998 | 87266 | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 9616108DD6891F | hit | F0a (RE_IP_F0a) | SU | REV_DEL_PLAN_GENERAL_DE_ORDENACION_URBANA_1998 | 48752 | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 7628703DD6872H | hit | J2b (RE_IU_J2b) | SU | REV_DEL_PLAN_GENERAL_DE_ORDENACION_URBANA_1998 | 48635 | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 9829713DD6892H | hit | B3x (RE_IP_B3x) | SU | REV_DEL_PLAN_GENERAL_DE_ORDENACION_URBANA_1998 | 48470 | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 7956611DD6875F | hit | I2a (RE_EU_I2a) | SU | REV_DEL_PLAN_GENERAL_DE_ORDENACION_URBANA_1998 | 48630 | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 8408803DD6880G | hit | B2a (RE_IP_B2a) | SU | REV_DEL_PLAN_GENERAL_DE_ORDENACION_URBANA_1998 | 48468 | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 2092601DD7729A | hit | B2a (RE_IP_B2a) | SU | REV_DEL_PLAN_GENERAL_DE_ORDENACION_URBANA_1998 | 48468 | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 1706515DD7810F | hit | B3x (RE_IP_B3x) | SU | REV_DEL_PLAN_GENERAL_DE_ORDENACION_URBANA_1998 | 48470 | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 0859526DD7805H | hit | J2a (RE_EU_J2a) | SU | REV_DEL_PLAN_GENERAL_DE_ORDENACION_URBANA_1998 | 48634 | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 2205521DD7820E | hit | B3a (RE_IP_B3a) | SU | REV_DEL_PLAN_GENERAL_DE_ORDENACION_URBANA_1998 | 48469 | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 1288915DD8718G | hit | B2a (RE_IP_B2a) | SU | REV_DEL_PLAN_GENERAL_DE_ORDENACION_URBANA_1998 | 48468 | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 7626247DD6872F | hit | J2b (RE_IU_J2b) | SU | REV_DEL_PLAN_GENERAL_DE_ORDENACION_URBANA_1998 | 48635 | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 3682502DD7738B | hit | D3a (RE_IP_D3a) | SU | REV_DEL_PLAN_GENERAL_DE_ORDENACION_URBANA_1998 | 48493 | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 07040A00200095 | hit | — (SR) | SR | — | — | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 0471101DD8707A | hit | B2a (RE_IP_B2a) | SU | REV_DEL_PLAN_GENERAL_DE_ORDENACION_URBANA_1998 | 48468 | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 07040A01100288 | hit | — (SR) | SR | — | — | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 8116805DD6881E | hit | E5a (RE_EP_E5a) | SU | REV_DEL_PLAN_GENERAL_DE_ORDENACION_URBANA_1998 | 48530 | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 07040A00900366 | hit | — (SR) | SR | — | — | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 8837024DD7783F | hit | EQ-AP04 DO (EQ_DO_EQ-AP04_DO) | SU | PLA_REC_PLATJA_PALMA_7040_2015 | 289147 | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 2823515DD7822D | hit | B2a (RE_IP_B2a) | SU | REV_DEL_PLAN_GENERAL_DE_ORDENACION_URBANA_1998 | 48468 | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 1099607DD7719G | hit | B3x (RE_IP_B3x) | SU | REV_DEL_PLAN_GENERAL_DE_ORDENACION_URBANA_1998 | 48470 | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 8312401DD6881C | hit | E4a (RE_EP_E4a) | SU | REV_DEL_PLAN_GENERAL_DE_ORDENACION_URBANA_1998 | 48522 | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 5582503DD6758D | hit | E4a (RE_EP_E4a) | SU | REV_DEL_PLAN_GENERAL_DE_ORDENACION_URBANA_1998 | 48522 | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 2392020DD7729A | hit | B3x (RE_IP_B3x) | SU | REV_DEL_PLAN_GENERAL_DE_ORDENACION_URBANA_1998 | 48470 | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |
| palma | 2723512DD7822D | hit | B2a (RE_IP_B2a) | SU | REV_DEL_PLAN_GENERAL_DE_ORDENACION_URBANA_1998 | 48468 | plan-not-current → det:f2-correct-null / ind:f2-correct-null | — | (none) | (none) |

---

_Method notes._ (1) The parcel frame is the Catastro INSPIRE CP ATOM enclosure per municipality (`tools/cold-start-probe/catastroParcelFrame.mjs`), NOT `wfsCP.aspx`; `wfsCP.aspx` is the independent oracle (`validateReprojection.mjs` shape). (2) The zoning leg calls the SHIPPED `resolveBalearsMuib` with a `fetchImpl` that answers `/api/es/balears-muib` by calling the server's own `fetchBalearsMuibAtPoint` — the production upstream URL and fitxa SSRF guard, imported. (3) The envelope leg is the editor's drawing-arm call (`balearsResolvedPack` → `computeBuildableEnvelope`) on the harness's neutral 40 m square ring, so slot figures are comparable with the ES/PT arms; the real ring is NOT used for the slot count (the ring is not the subject). (4) F1/F2 is `classifyRefusal` over the shipped `balearsRefusal().legallyGrounded`; transient reasons are `service-failure`; `no-zoning-here` is `no-plan-served`. (5) Same fitxa URL is fetched once per run (per-run cache); all requests are sequential with a stated gap.
