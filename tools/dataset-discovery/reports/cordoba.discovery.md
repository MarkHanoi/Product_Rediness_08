# Stage 0 — Dataset discovery · Córdoba

> Protocol `v1.0` · classifier `v1.0` · mode **live** · run 2026-08-02T08:54:49.162Z
> **Cost:** 63 requests · 5.6 s wall-clock · 686 KiB · 0 failed (0 UNKNOWN, counted separately).

## Endpoints

| id | service | publisher | result | service extent verdict | layers |
|---|---|---|---|---|---:|
| `ide-cordoba-wfs` | WFS | ayto-cordoba | 200 OK | local (0 km) | 105 |
| `ide-cordoba-wms` | WMS | ayto-cordoba | 200 OK | local (0 km) | 105 |
| `coaco-wfs` | WFS | coaco | 200 OK | local (0 km) | 15 |

## Top 30 by triage rank

> ⚠ **Triage rank is not a score.** It orders what a human looks at first. It contains no legal-authority term and never enters a publication decision (ADR-0288).

| # | layer | kind | geom | MR | LA | reusable | candidate variables | flags |
|---:|---|---|---|---:|---:|:---:|---|---|
| 1 | `coaco:actuaciones` | normative | polygon | 1.00 | 0.80 |  | zoning-regime, use-designation, public-system, plan-delegation |  |
| 2 | `coaco:ordenanzas` | normative | polygon | 1.00 | 0.80 |  | zoning-regime, coverage-ratio, floor-area-ratio, use-designation, public-system |  |
| 3 | `coaco:hojas_cus` | normative | polygon | 1.00 | 0.80 |  | zoning-regime, use-designation, public-system, sheet-index |  |
| 4 | `coaco:usos_dotacionales` | normative | polygon | 1.00 | 0.60 |  | zoning-regime, use-designation, public-system |  |
| 5 | `coaco:vhex25_max_plantas` | normative | mixed | 1.00 | 0.60 |  | storey-count, parcel-boundary, parcel-area, sheet-index | caveat:plantas |
| 6 | `coaco:vhex25_n_construc` | geometry | mixed | 1.00 | 0.40 |  | parcel-boundary, parcel-area, building-footprint, sheet-index |  |
| 7 | `coaco:vhex25_sup_brasante_m2` | geometry | mixed | 1.00 | 0.40 |  | parcel-boundary, parcel-area, terrain-rasante, sheet-index | caveat:rasante |
| 8 | `coaco:vhex25_sup_srasante_m2` | geometry | mixed | 1.00 | 0.40 |  | parcel-boundary, parcel-area, terrain-rasante, sheet-index | caveat:rasante |
| 9 | `coaco:vbuilding` | geometry | mixed | 1.00 | 0.20 |  | parcel-boundary, parcel-area, building-footprint |  |
| 10 | `coaco:vhex25_anyo_antiguedad_inmueble` | geometry | mixed | 1.00 | 0.40 |  | parcel-boundary, parcel-area, sheet-index |  |
| 11 | `coaco:vhex25_n_inmuebles` | geometry | mixed | 1.00 | 0.40 |  | parcel-boundary, parcel-area, sheet-index |  |
| 12 | `coaco:vhex25_sup_total_m2` | geometry | mixed | 1.00 | 0.40 |  | parcel-boundary, parcel-area, sheet-index |  |
| 13 | `idecordoba:ejes_red_viaria` | normative | line | 1.00 | 0.40 | ✅ | axis-designation, street-surface | caveat:eje · caveat:vial |
| 14 | `idecordoba:manzana` | geometry | polygon | 1.00 | 0.20 | ✅ | block-ring, block-depth |  |
| 15 | `idecordoba:parcelas_catastrales` | geometry | polygon | 1.00 | 0.20 | ✅ | parcel-boundary, parcel-area |  |
| 16 | `coaco:usos_globales` | normative | polygon | 1.00 | 0.40 |  | use-designation |  |
| 17 | `idecordoba:zonas_verdes` | normative | polygon | 1.00 | 0.40 |  | public-system |  |
| 18 | `idecordoba:construcciones` | geometry | polygon | 1.00 | 0.20 | ✅ | building-footprint |  |
| 19 | `idecordoba:superficie_construcciones` | geometry | polygon | 1.00 | 0.20 | ✅ | building-footprint |  |
| 20 | `coaco:distritos` | geometry | polygon | 1.00 | 0.00 | ✅ | admin-boundary |  |
| 21 | `idecordoba:elementos_red_viaria` | geometry | line | 1.00 | 0.20 | ✅ | street-surface | caveat:vial |
| 22 | `idecordoba:linea_auxiliar` | geometry | line | 1.00 | 0.20 | ✅ | street-surface | caveat:vial |
| 23 | `idecordoba:municipio` | geometry | polygon | 1.00 | 0.20 | ✅ | admin-boundary |  |
| 24 | `idecordoba:r1_smarina_sagustin` | geometry | point | 1.00 | 0.20 |  | admin-boundary |  |
| 25 | `idecordoba:r2_slorenzo_srafael` | geometry | point | 1.00 | 0.20 |  | admin-boundary |  |
| 26 | `idecordoba:r4_spedro_santiago` | geometry | point | 1.00 | 0.20 |  | admin-boundary |  |
| 27 | `idecordoba:r5_juderia` | geometry | point | 1.00 | 0.20 |  | admin-boundary |  |
| 28 | `idecordoba:red_viaria` | geometry | polygon | 1.00 | 0.20 | ✅ | street-surface | caveat:vial |
| 29 | `idecordoba:sup_viales` | geometry | polygon | 1.00 | 0.20 | ✅ | street-surface | caveat:vial |
| 30 | `idecordoba:tramo_vial` | geometry | line | 1.00 | 0.40 | ✅ | street-surface | caveat:vial |

`⌊` = the score is a **lower bound**: at least one bit was not probed. It is not a measurement (PROBE-DISCIPLINE R8).

## Draft rows for the MACHINE-READABLE EVIDENCE REGISTER

> Stage 0 **populates** the register; a human **moves rows in**. `Publishable` is emitted as the ADR-0288 constant because discovery structurally cannot answer that column.

| Dataset | Machine-readable | Publishable | Status | Next action (one, owned) |
|---|---|---|---|---|
| coaco: coaco:actuaciones | Yes | not-assessed-by-discovery | Investigate | Candidate supply for Zoning regime (calificación / ordenanza / clave) — run the ADR-0285 four-part test — **exit:** parts 1+2 answered from the instrument by a human; part 3 answered by publisher standing; part 4 pinned by a fixture test |
| coaco: coaco:ordenanzas | Yes | not-assessed-by-discovery | Investigate | Candidate supply for Zoning regime (calificación / ordenanza / clave) — run the ADR-0285 four-part test — **exit:** parts 1+2 answered from the instrument by a human; part 3 answered by publisher standing; part 4 pinned by a fixture test |
| coaco: coaco:hojas_cus | Yes | not-assessed-by-discovery | Investigate | Candidate supply for Zoning regime (calificación / ordenanza / clave) — run the ADR-0285 four-part test — **exit:** parts 1+2 answered from the instrument by a human; part 3 answered by publisher standing; part 4 pinned by a fixture test |
| coaco: coaco:usos_dotacionales | Yes | not-assessed-by-discovery | Investigate | Candidate supply for Zoning regime (calificación / ordenanza / clave) — run the ADR-0285 four-part test — **exit:** parts 1+2 answered from the instrument by a human; part 3 answered by publisher standing; part 4 pinned by a fixture test |
| coaco: coaco:vhex25_max_plantas | Yes | not-assessed-by-discovery | Investigate | Candidate supply for Storey count (número de plantas) — run the ADR-0285 four-part test — **exit:** parts 1+2 answered from the instrument by a human; part 3 answered by publisher standing; part 4 pinned by a fixture test |
| ayto-cordoba: idecordoba:ejes_red_viaria | Yes | not-assessed-by-discovery | Investigate | Evaluate as REUSABLE GEOMETRY for street-surface — published geometry outranks our own reconstruction (ADR-0283) — **exit:** coverage of the layer against the target frame is MEASURED, and the incumbent derivation is demoted to fallback or kept |
| ayto-cordoba: idecordoba:manzana | Yes | not-assessed-by-discovery | Investigate | Evaluate as REUSABLE GEOMETRY for block-ring — published geometry outranks our own reconstruction (ADR-0283) — **exit:** coverage of the layer against the target frame is MEASURED, and the incumbent derivation is demoted to fallback or kept |
| ayto-cordoba: idecordoba:parcelas_catastrales | Yes | not-assessed-by-discovery | Investigate | Evaluate as REUSABLE GEOMETRY for parcel-boundary — published geometry outranks our own reconstruction (ADR-0283) — **exit:** coverage of the layer against the target frame is MEASURED, and the incumbent derivation is demoted to fallback or kept |
| coaco: coaco:usos_globales | Yes | not-assessed-by-discovery | Investigate | Candidate supply for Use designation (uso característico / compatible) — run the ADR-0285 four-part test — **exit:** parts 1+2 answered from the instrument by a human; part 3 answered by publisher standing; part 4 pinned by a fixture test |
| ayto-cordoba: idecordoba:zonas_verdes | Yes | not-assessed-by-discovery | Investigate | Candidate supply for Public system (dotacional / equipamiento / espacio libre) — run the ADR-0285 four-part test — **exit:** parts 1+2 answered from the instrument by a human; part 3 answered by publisher standing; part 4 pinned by a fixture test |
| ayto-cordoba: idecordoba:construcciones | Yes | not-assessed-by-discovery | Investigate | Evaluate as REUSABLE GEOMETRY for building-footprint — published geometry outranks our own reconstruction (ADR-0283) — **exit:** coverage of the layer against the target frame is MEASURED, and the incumbent derivation is demoted to fallback or kept |
| ayto-cordoba: idecordoba:superficie_construcciones | Yes | not-assessed-by-discovery | Investigate | Evaluate as REUSABLE GEOMETRY for building-footprint — published geometry outranks our own reconstruction (ADR-0283) — **exit:** coverage of the layer against the target frame is MEASURED, and the incumbent derivation is demoted to fallback or kept |
| coaco: coaco:distritos | Yes | not-assessed-by-discovery | Investigate | Evaluate as REUSABLE GEOMETRY for admin-boundary — published geometry outranks our own reconstruction (ADR-0283) — **exit:** coverage of the layer against the target frame is MEASURED, and the incumbent derivation is demoted to fallback or kept |
| ayto-cordoba: idecordoba:elementos_red_viaria | Yes | not-assessed-by-discovery | Investigate | Evaluate as REUSABLE GEOMETRY for street-surface — published geometry outranks our own reconstruction (ADR-0283) — **exit:** coverage of the layer against the target frame is MEASURED, and the incumbent derivation is demoted to fallback or kept |
| ayto-cordoba: idecordoba:linea_auxiliar | Yes | not-assessed-by-discovery | Investigate | Evaluate as REUSABLE GEOMETRY for street-surface — published geometry outranks our own reconstruction (ADR-0283) — **exit:** coverage of the layer against the target frame is MEASURED, and the incumbent derivation is demoted to fallback or kept |
| ayto-cordoba: idecordoba:municipio | Yes | not-assessed-by-discovery | Investigate | Evaluate as REUSABLE GEOMETRY for admin-boundary — published geometry outranks our own reconstruction (ADR-0283) — **exit:** coverage of the layer against the target frame is MEASURED, and the incumbent derivation is demoted to fallback or kept |
| ayto-cordoba: idecordoba:red_viaria | Yes | not-assessed-by-discovery | Investigate | Evaluate as REUSABLE GEOMETRY for street-surface — published geometry outranks our own reconstruction (ADR-0283) — **exit:** coverage of the layer against the target frame is MEASURED, and the incumbent derivation is demoted to fallback or kept |
| ayto-cordoba: idecordoba:sup_viales | Yes | not-assessed-by-discovery | Investigate | Evaluate as REUSABLE GEOMETRY for street-surface — published geometry outranks our own reconstruction (ADR-0283) — **exit:** coverage of the layer against the target frame is MEASURED, and the incumbent derivation is demoted to fallback or kept |
| ayto-cordoba: idecordoba:tramo_vial | Yes | not-assessed-by-discovery | Investigate | Evaluate as REUSABLE GEOMETRY for street-surface — published geometry outranks our own reconstruction (ADR-0283) — **exit:** coverage of the layer against the target frame is MEASURED, and the incumbent derivation is demoted to fallback or kept |

## Acid test — the datasets humans missed

| layer | rank | of | percentile | kind | MR | LA | reusable | verdict |
|---|---:|---:|---:|---|---:|---:|:---:|---|
| `idecordoba:manzana` | 14 | 120 | 89.2 | geometry | 1 | 0.2 | ✅ | ✅ surfaced in the top 20 |
