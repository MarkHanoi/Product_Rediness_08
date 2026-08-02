# Stage 0 — Dataset discovery · Murcia

> Protocol `v1.0` · classifier `v1.0` · mode **live** · run 2026-08-02T08:55:08.003Z
> **Cost:** 50 requests · 2.9 s wall-clock · 792 KiB · 0 failed (0 UNKNOWN, counted separately).

## Endpoints

| id | service | publisher | result | service extent verdict | layers |
|---|---|---|---|---|---:|
| `murcia-wfs` | WFS | ayto-murcia | 200 OK | contains-but-broad (0 km) | 212 |
| `murcia-wms` | WMS | ayto-murcia | 200 OK | contains-but-broad (0 km) | 214 |

## Top 30 by triage rank

> ⚠ **Triage rank is not a score.** It orders what a human looks at first. It contains no legal-authority term and never enters a publication decision (ADR-0288).

| # | layer | kind | geom | MR | LA | reusable | candidate variables | flags |
|---:|---|---|---|---:|---:|:---:|---|---|
| 1 | `Murcia:catastro` | normative | point | 1.00 | 0.60 |  | building-height, parcel-boundary, parcel-area, building-footprint, address-point | caveat:altura |
| 2 | `Murcia:parcelas_patrimonio` | normative | polygon | 1.00 | 0.60 | ✅ | heritage-constraint, parcel-boundary, parcel-area |  |
| 3 | `Murcia:protecciones_zonificacion_porn_valle` | normative | polygon | 1.00 | 0.40 |  | zoning-regime, heritage-constraint |  |
| 4 | `Murcia:cincomil_Construcciones_puntuales` | normative | point | 1.00 | 0.40 |  | heritage-constraint, building-footprint |  |
| 5 | `Murcia:cincomil_Cultivos` | normative | polygon | 1.00 | 0.40 |  | land-classification, use-designation |  |
| 6 | `Murcia:construcciones_puntuales` | normative | point | 1.00 | 0.40 |  | heritage-constraint, building-footprint |  |
| 7 | `Murcia:cultivos` | normative | polygon | 1.00 | 0.40 |  | land-classification, use-designation |  |
| 8 | `Murcia:edificios_catalogados` | normative | polygon | 1.00 | 0.40 | ✅ | heritage-constraint, building-footprint |  |
| 9 | `Murcia:pgou_eje_comercial` | normative | line | 1.00 | 0.60 | ✅ | axis-designation, street-surface, use-designation | caveat:eje |
| 10 | `Murcia:pgou_eje_comercial_2001` | normative | line | 1.00 | 0.80 | ✅ | axis-designation, street-surface, use-designation | superseded-edition-suspect · caveat:eje |
| 11 | `Murcia:pgou_eje_comercial_2007` | normative | line | 1.00 | 0.80 | ✅ | axis-designation, street-surface, use-designation | superseded-edition-suspect · caveat:eje |
| 12 | `Murcia:IGNBaseTodo` | normative | ? | 0.20⌊ | 0.40⌊ | ✅ | land-classification, use-designation, public-system, heritage-constraint, block-ring, block-depth, building-footprint, street-surface, terrain-rasante, admin-boundary, address-point | extent-too-broad-to-prove-locality · feature-count-unknown · caveat:vial · caveat:rasante |
| 13 | `Murcia:pgou_alineaciones` | normative | polygon | 1.00 | 0.80 |  | building-line, street-width, block-depth, frontage |  |
| 14 | `Murcia:pgou_alineaciones_2001` | normative | polygon | 1.00 | 0.80 |  | building-line, street-width, block-depth, frontage | superseded-edition-suspect |
| 15 | `Murcia:pgou_alineaciones_2007` | normative | polygon | 1.00 | 0.80 |  | building-line, street-width, block-depth, frontage | superseded-edition-suspect |
| 16 | `Murcia:pgou_alineaciones_2012` | normative | polygon | 1.00 | 0.80 |  | building-line, street-width, block-depth, frontage | superseded-edition-suspect |
| 17 | `Murcia:pgou_sectores` | normative | polygon | 1.00 | 0.80 |  | plan-delegation |  |
| 18 | `Murcia:pgou_sectores_2001` | normative | polygon | 1.00 | 0.80 |  | plan-delegation | superseded-edition-suspect |
| 19 | `Murcia:pgou_sectores_2007` | normative | polygon | 1.00 | 0.80 |  | plan-delegation | superseded-edition-suspect |
| 20 | `Murcia:pgou_sectores_2012` | normative | polygon | 1.00 | 0.80 |  | plan-delegation | superseded-edition-suspect |
| 21 | `Murcia:5000_construcciones_puntuales` | normative | ? | 0.20⌊ | 0.40⌊ | ✅ | heritage-constraint, building-footprint | feature-count-unknown |
| 22 | `Murcia:5000_cultivos` | normative | ? | 0.20⌊ | 0.40⌊ |  | land-classification, use-designation | feature-count-unknown |
| 23 | `Murcia:catastro_pgou_textos` | geometry | point | 1.00 | 0.40 |  | parcel-boundary, parcel-area |  |
| 24 | `Murcia:cincomil_Toponimia` | geometry | point | 1.00 | 0.20 |  | building-footprint, admin-boundary |  |
| 25 | `Murcia:parcelas_viviendas` | geometry | line | 1.00 | 0.20 | ✅ | parcel-boundary, parcel-area |  |
| 26 | `Murcia:toponimia` | geometry | point | 1.00 | 0.20 |  | building-footprint, admin-boundary |  |
| 27 | `Murcia:v_catastro_pgou_textos` | geometry | point | 1.00 | 0.40 |  | parcel-boundary, parcel-area |  |
| 28 | `Murcia:Cartografía Base a color` | normative | ? | 0.20⌊ | 0.40⌊ |  | buildable-depth, block-depth | feature-count-unknown |
| 29 | `Murcia:Cartografía Fondo Gris` | normative | ? | 0.20⌊ | 0.40⌊ |  | buildable-depth, block-depth | feature-count-unknown |
| 30 | `Murcia:Cartografía_GRIS_wms_ine` | normative | ? | 0.20⌊ | 0.40⌊ |  | buildable-depth, block-depth | feature-count-unknown |

`⌊` = the score is a **lower bound**: at least one bit was not probed. It is not a measurement (PROBE-DISCIPLINE R8).

## Draft rows for the MACHINE-READABLE EVIDENCE REGISTER

> Stage 0 **populates** the register; a human **moves rows in**. `Publishable` is emitted as the ADR-0288 constant because discovery structurally cannot answer that column.

| Dataset | Machine-readable | Publishable | Status | Next action (one, owned) |
|---|---|---|---|---|
| ayto-murcia: Murcia:catastro | Yes | not-assessed-by-discovery | Investigate | Candidate supply for Building height (altura de cornisa) — run the ADR-0285 four-part test — **exit:** parts 1+2 answered from the instrument by a human; part 3 answered by publisher standing; part 4 pinned by a fixture test |
| ayto-murcia: Murcia:parcelas_patrimonio | Yes | not-assessed-by-discovery | Investigate | Evaluate as REUSABLE GEOMETRY for parcel-boundary — published geometry outranks our own reconstruction (ADR-0283) — **exit:** coverage of the layer against the target frame is MEASURED, and the incumbent derivation is demoted to fallback or kept |
| ayto-murcia: Murcia:protecciones_zonificacion_porn_valle | Yes | not-assessed-by-discovery | Investigate | Candidate supply for Zoning regime (calificación / ordenanza / clave) — run the ADR-0285 four-part test — **exit:** parts 1+2 answered from the instrument by a human; part 3 answered by publisher standing; part 4 pinned by a fixture test |
| ayto-murcia: Murcia:cincomil_Construcciones_puntuales | Yes | not-assessed-by-discovery | Investigate | Candidate supply for Heritage / protection constraint — run the ADR-0285 four-part test — **exit:** parts 1+2 answered from the instrument by a human; part 3 answered by publisher standing; part 4 pinned by a fixture test |
| ayto-murcia: Murcia:cincomil_Cultivos | Yes | not-assessed-by-discovery | Investigate | Candidate supply for Land classification (suelo urbano / urbanizable / rústico) — run the ADR-0285 four-part test — **exit:** parts 1+2 answered from the instrument by a human; part 3 answered by publisher standing; part 4 pinned by a fixture test |
| ayto-murcia: Murcia:construcciones_puntuales | Yes | not-assessed-by-discovery | Investigate | Candidate supply for Heritage / protection constraint — run the ADR-0285 four-part test — **exit:** parts 1+2 answered from the instrument by a human; part 3 answered by publisher standing; part 4 pinned by a fixture test |
| ayto-murcia: Murcia:cultivos | Yes | not-assessed-by-discovery | Investigate | Candidate supply for Land classification (suelo urbano / urbanizable / rústico) — run the ADR-0285 four-part test — **exit:** parts 1+2 answered from the instrument by a human; part 3 answered by publisher standing; part 4 pinned by a fixture test |
| ayto-murcia: Murcia:edificios_catalogados | Yes | not-assessed-by-discovery | Investigate | Evaluate as REUSABLE GEOMETRY for building-footprint — published geometry outranks our own reconstruction (ADR-0283) — **exit:** coverage of the layer against the target frame is MEASURED, and the incumbent derivation is demoted to fallback or kept |
| ayto-murcia: Murcia:pgou_eje_comercial | Yes | not-assessed-by-discovery | Investigate | Evaluate as REUSABLE GEOMETRY for street-surface — published geometry outranks our own reconstruction (ADR-0283) — **exit:** coverage of the layer against the target frame is MEASURED, and the incumbent derivation is demoted to fallback or kept |
| ayto-murcia: Murcia:pgou_eje_comercial_2001 | Yes | not-assessed-by-discovery | Investigate | Evaluate as REUSABLE GEOMETRY for street-surface — published geometry outranks our own reconstruction (ADR-0283) — **exit:** coverage of the layer against the target frame is MEASURED, and the incumbent derivation is demoted to fallback or kept |
| ayto-murcia: Murcia:pgou_eje_comercial_2007 | Yes | not-assessed-by-discovery | Investigate | Evaluate as REUSABLE GEOMETRY for street-surface — published geometry outranks our own reconstruction (ADR-0283) — **exit:** coverage of the layer against the target frame is MEASURED, and the incumbent derivation is demoted to fallback or kept |
| ayto-murcia: Murcia:IGNBaseTodo | Partial/Unknown — 0.20 floor; unprobed: schemaRetrievable, featuresReturn, semanticAttributes | not-assessed-by-discovery | Investigate | Evaluate as REUSABLE GEOMETRY for block-ring, building-footprint, street-surface, terrain-rasante, admin-boundary — published geometry outranks our own reconstruction (ADR-0283) — **exit:** coverage of the layer against the target frame is MEASURED, and the incumbent derivation is demoted to fallback or kept |
| ayto-murcia: Murcia:pgou_alineaciones | Yes | not-assessed-by-discovery | Investigate | Candidate supply for Building line / alignment (alineación) — run the ADR-0285 four-part test — **exit:** parts 1+2 answered from the instrument by a human; part 3 answered by publisher standing; part 4 pinned by a fixture test |
| ayto-murcia: Murcia:pgou_alineaciones_2001 | Yes | not-assessed-by-discovery | Investigate | Candidate supply for Building line / alignment (alineación) — run the ADR-0285 four-part test — **exit:** parts 1+2 answered from the instrument by a human; part 3 answered by publisher standing; part 4 pinned by a fixture test |
| ayto-murcia: Murcia:pgou_alineaciones_2007 | Yes | not-assessed-by-discovery | Investigate | Candidate supply for Building line / alignment (alineación) — run the ADR-0285 four-part test — **exit:** parts 1+2 answered from the instrument by a human; part 3 answered by publisher standing; part 4 pinned by a fixture test |
| ayto-murcia: Murcia:pgou_alineaciones_2012 | Yes | not-assessed-by-discovery | Investigate | Candidate supply for Building line / alignment (alineación) — run the ADR-0285 four-part test — **exit:** parts 1+2 answered from the instrument by a human; part 3 answered by publisher standing; part 4 pinned by a fixture test |
| ayto-murcia: Murcia:pgou_sectores | Yes | not-assessed-by-discovery | Investigate | Candidate supply for Delegation to a derived plan (sector / ámbito / UE / PERI / ED) — run the ADR-0285 four-part test — **exit:** parts 1+2 answered from the instrument by a human; part 3 answered by publisher standing; part 4 pinned by a fixture test |
| ayto-murcia: Murcia:pgou_sectores_2001 | Yes | not-assessed-by-discovery | Investigate | Candidate supply for Delegation to a derived plan (sector / ámbito / UE / PERI / ED) — run the ADR-0285 four-part test — **exit:** parts 1+2 answered from the instrument by a human; part 3 answered by publisher standing; part 4 pinned by a fixture test |
| ayto-murcia: Murcia:pgou_sectores_2007 | Yes | not-assessed-by-discovery | Investigate | Candidate supply for Delegation to a derived plan (sector / ámbito / UE / PERI / ED) — run the ADR-0285 four-part test — **exit:** parts 1+2 answered from the instrument by a human; part 3 answered by publisher standing; part 4 pinned by a fixture test |
| ayto-murcia: Murcia:pgou_sectores_2012 | Yes | not-assessed-by-discovery | Investigate | Candidate supply for Delegation to a derived plan (sector / ámbito / UE / PERI / ED) — run the ADR-0285 four-part test — **exit:** parts 1+2 answered from the instrument by a human; part 3 answered by publisher standing; part 4 pinned by a fixture test |
| ayto-murcia: Murcia:5000_construcciones_puntuales | Partial/Unknown — 0.20 floor; unprobed: schemaRetrievable, featuresReturn, semanticAttributes | not-assessed-by-discovery | Investigate | Evaluate as REUSABLE GEOMETRY for building-footprint — published geometry outranks our own reconstruction (ADR-0283) — **exit:** coverage of the layer against the target frame is MEASURED, and the incumbent derivation is demoted to fallback or kept |
| ayto-murcia: Murcia:5000_cultivos | Partial/Unknown — 0.20 floor; unprobed: schemaRetrievable, featuresReturn, semanticAttributes | not-assessed-by-discovery | Investigate | Candidate supply for Land classification (suelo urbano / urbanizable / rústico) — run the ADR-0285 four-part test — **exit:** parts 1+2 answered from the instrument by a human; part 3 answered by publisher standing; part 4 pinned by a fixture test |
| ayto-murcia: Murcia:parcelas_viviendas | Yes | not-assessed-by-discovery | Investigate | Evaluate as REUSABLE GEOMETRY for parcel-boundary — published geometry outranks our own reconstruction (ADR-0283) — **exit:** coverage of the layer against the target frame is MEASURED, and the incumbent derivation is demoted to fallback or kept |
| ayto-murcia: Murcia:Cartografía Base a color | Partial/Unknown — 0.20 floor; unprobed: schemaRetrievable, featuresReturn, semanticAttributes | not-assessed-by-discovery | Investigate | Candidate supply for Buildable depth (fondo / profundidad edificable) — run the ADR-0285 four-part test — **exit:** parts 1+2 answered from the instrument by a human; part 3 answered by publisher standing; part 4 pinned by a fixture test |
| ayto-murcia: Murcia:Cartografía Fondo Gris | Partial/Unknown — 0.20 floor; unprobed: schemaRetrievable, featuresReturn, semanticAttributes | not-assessed-by-discovery | Investigate | Candidate supply for Buildable depth (fondo / profundidad edificable) — run the ADR-0285 four-part test — **exit:** parts 1+2 answered from the instrument by a human; part 3 answered by publisher standing; part 4 pinned by a fixture test |
| ayto-murcia: Murcia:Cartografía_GRIS_wms_ine | Partial/Unknown — 0.20 floor; unprobed: schemaRetrievable, featuresReturn, semanticAttributes | not-assessed-by-discovery | Investigate | Candidate supply for Buildable depth (fondo / profundidad edificable) — run the ADR-0285 four-part test — **exit:** parts 1+2 answered from the instrument by a human; part 3 answered by publisher standing; part 4 pinned by a fixture test |

## Acid test — the datasets humans missed

| layer | rank | of | percentile | kind | MR | LA | reusable | verdict |
|---|---:|---:|---:|---|---:|---:|:---:|---|
| `Murcia:pgou_alineaciones` | 13 | 289 | 95.8 | normative | 1 | 0.8 |  | ✅ surfaced in the top 20 |
| `Murcia:pgou_eje_comercial` | 9 | 289 | 97.2 | normative | 1 | 0.6 | ✅ | ✅ surfaced in the top 20 |
