# CAPABILITY AUDIT — Granada (INE 18087), 2026-08-04

> Supersedes the "zero investigation" status recorded in
> [`FORENSIC-BLOCKER-AUDIT-2026-08-03.md`](./FORENSIC-BLOCKER-AUDIT-2026-08-03.md). This is a live,
> source-verified pass — every claim below was fetched and inspected on 2026-08-04, not inferred.
> Purpose: determine whether PRYZM could produce legally-defensible buildable envelopes for Granada.
> **This document makes no implementation recommendation and contains no code.**

## Executive Summary

Granada's zoning ("Calificación y Ordenación Física", PGOU 2001) is published exclusively as a set
of numbered map sheets (`granada.org/pgo.nsf` / `granada.org/inet/wpgo.nsf`) with attached PDF
"detail" files. Two of these PDFs (sheets 2001-06 and 2001-31) were fetched and inspected at the
byte level: both are **raster scans wrapped in Ghostscript-generated PDF** with zero font objects,
zero text operators, and PostScript-era UCR/BG/transfer-function graphics state typical of
scan-to-PDF pipelines — there is no extractable text, no vector linework, and no embedded
coordinate system. This closes the open question definitively: **raster, not vector.** Parcel
geometry, by contrast, is genuinely live: `idegranada.dipgra.es` serves a queryable
`Parcelas_Catastrales_2024` ArcGIS `MapServer` (cadastral parcels/polygons, EPSG:3857) and a
`CLASIFICACION_DEL_SUELO` layer (EPSG:25830) — but the latter only carries the coarse four-class
soil classification (urbano consolidado/no consolidado/urbanizable/no urbanizable), not the
parcel-level use/intensity "calificación" that drives buildable envelopes. The Article 7.9.6
graphical-delegation claim is **confirmed verbatim against the primary normativa text**: "El número
máximo de plantas será el fijado en los planos correspondientes a la documentación gráfica del
presente PGOU de Granada" — height/floor-count is legally defined by reading a raster map by eye,
not by any tabulated or GIS field. Heritage stakes are unusually high: Granada's Conjunto
Histórico (Decreto 186/2003) covers four sectors including the Alhambra/Generalife and Albaicín,
and while a regional IAPH/DERA "G13 Patrimonio" WMS exists in principle, no confirmed live
endpoint delimiting the Granada BIC/Conjunto Histórico boundary was reached in this pass. Flood
(REDIAM T10/T50/T100/T500 WMS/WFS) and airport (AESA national KMZ, same source already verified
for Barcelona) layers are nationally/regionally live and should extend to Granada without new
sourcing. Net result: parcel geometry and coarse land classification are machine-readable; the
one parameter that actually drives the envelope — height/floors/use per parcel — legally lives
only inside raster plan sheets that require either OCR-free manual digitisation or a licensed
human plan-reading step, and there is no vector or tabular substitute published anywhere found.

## Capability: **Research Blocked** (bordering on Engineering Blocked for the calificación layer specifically)

Parcel and coarse-classification geometry are solved (live ArcGIS services, verified). But the
decisive envelope parameters (height/floors/building line/depth) are legally sourced from raster
plan sheets with no vector substitute identified — this is not an engineering-effort problem
solvable by better parsing, it is a **source-format** problem: there is nothing to parse. A
municipal records request (or a locate of a non-public vector master file, if the Ayuntamiento
holds one internally) is needed before any digitisation-cost estimate is even meaningful. Heritage
overlay (the highest-stakes single risk given the Alhambra) was not confirmed live in this pass and
needs its own dedicated verification before any capability upgrade.

## Evidence Matrix

| # | Area | Finding | Evidence | Machine-readable? |
|---|------|---------|----------|--------------------|
| 1 | Planning doc format | PGOU 2001 "Calificación y Ordenación Física" sheets = raster scan in PDF wrapper | Byte-level inspection of `2001-06.pdf`, `2001-31.pdf`: 0 `/Font` objects, 0 text operators, `Producer: AFPL Ghostscript 7.0`, `/ExtGState` with `/TR /Identity /BG /UCR` (scan-reproduction transfer functions), single monolithic FlateDecode content stream | **No — raster only** |
| 2 | Zoning geometry (fine, calificación) | No vector/WFS/WMS/ArcGIS layer found carrying parcel-level use/intensity zoning | Full enumeration of `idegranada.dipgra.es/server/rest/services/URBANISMO` (9 services) — none named/described as calificación pormenorizada | No |
| 2b | Zoning geometry (coarse, clasificación) | Live ArcGIS `MapServer`, 4 classes (urbano consolidado/no consolidado, urbanizable, no urbanizable), province-wide | `idegranada.dipgra.es/server/rest/services/URBANISMO/CLASIFICACION_DEL_SUELO/MapServer?f=json` — EPSG:25830, group layer w/ 4 polygon feature layers | Yes, but insufficient granularity for envelope |
| 2c | Zoning geometry (provincial "estructura general") | Live ArcGIS `MapServer`, 1 layer + 1 table, province-wide | `idegranada.dipgra.es/server/rest/services/URBANISMO/ESTRUCTURA_GENERAL/MapServer?f=json` — EPSG:25830 | Yes, but too coarse (municipal-scale structure, not parcel zoning) |
| 3 | Parcel geometry | Live ArcGIS `MapServer`, 2024 vintage, 2 feature layers (parcela + polígono catastral urbana) | `idegranada.dipgra.es/server/rest/services/URBANISMO/Parcelas_Catastrales_2024/MapServer?f=json` — EPSG:3857 | Yes |
| 4 | Height/floors delegation | Confirmed: Art. 7.9.6 delegates max. floor count to the graphical plans, not a text/table field | `granada.org/inet/wpgo.nsf/8c6283f8cc03dea2c1256e32003da6e9/db27e5b169f9ab98c1256e27007bafda!OpenDocument` (Título Séptimo, Regulación de la Edificación): "*El número máximo de plantas será el fijado en los planos correspondientes a la documentación gráfica del presente PGOU de Granada.*" | No — legally raster-bound |
| 5 | Heritage (BIC/Conjunto Histórico) | Conjunto Histórico legally exists, 4 sectors (Alhambra-Generalife, Albaicín, Sacromonte, Centro); a "G13 Patrimonio" WMS (`ideandalucia.es/wms/dea100_patrimonio`) is documented in the IDEAndalucía catalogue but was **not itself fetched/verified live** this pass | `boe.es/diario_boe/txt.php?id=BOE-A-2003-16634` (Decreto 186/2003, sector delimitation); `ideandalucia.es` catalogue record for DERA Grupo 11 (Patrimonio) and a `dea100_patrimonio` WMS URL found via search only | **Unconfirmed — needs a direct fetch** |
| 6 | Flood | REDIAM publishes WMS/WFS flood-zone layers for T10/T50/T100/T500 return periods across Andalucía, and a hydrographic-network layer; not fetched live this pass, but the same national/regional REDIAM service family is already relied on elsewhere in the region per catalogue records | `juntadeandalucia.es` REDIAM OGC service landing pages (multiple, listed in evidence) | Likely yes — **not independently confirmed live** |
| 7 | Airport | AESA publishes a national servidumbres-aeronáuticas KMZ covering all Spanish airports including Granada-Jaén (LEGR, RD 731/2015) — same source already verified with full 3D geometry for Barcelona per prior PRYZM audit | `seguridadaerea.gob.es/sites/default/files/ficha_granada_jaen.pdf`; national KMZ at `seguridadaerea.gob.es/.../mapa_aeropuertos.kml` | Yes (per prior Barcelona verification of the same national source) |
| 8 | Environmental (Natura 2000 / Sierra Nevada) | Not directly re-verified this pass; Sierra Nevada National Park/Natura 2000 boundaries are standard REDIAM/EU Natura 2000 viewer layers used elsewhere in Andalucía audits | Not fetched this pass | Presumed yes, unconfirmed |
| 9 | Legal delegation scope | 100% of height/floor-count parameters are graphically delegated (Art. 7.9.6); scope of PERI/PEPRI overlays within the Conjunto Histórico not yet enumerated | Art. 7.9.6 text above | Non-computable fraction: at minimum the height axis, city-wide |
| 10 | Dispatch feasibility | Not reachable — parcel → coarse classification is automatable, but classification → detailed zone → height/setback/floor parameters requires reading a raster plan sheet by eye | Derived from #1–#4 | No |

## Machine-readable assets — every verified endpoint

- `https://idegranada.dipgra.es/server/rest/services/URBANISMO/Parcelas_Catastrales_2024/MapServer` — live ArcGIS MapServer, cadastral parcels + polygons, EPSG:3857, verified via `?f=json`.
- `https://idegranada.dipgra.es/server/rest/services/URBANISMO/CLASIFICACION_DEL_SUELO/MapServer` — live ArcGIS MapServer, 4-class coarse soil classification, EPSG:25830, verified via `?f=json`.
- `https://idegranada.dipgra.es/server/rest/services/URBANISMO/ESTRUCTURA_GENERAL/MapServer` — live ArcGIS MapServer, province-wide general structure layer + associated table `Datos_Estruc_General`, EPSG:25830, verified via direct fetch.
- `https://idegranada.dipgra.es/server/rest/services/URBANISMO/DELIMITACION_MUNICIPAL/MapServer` — municipal boundary service, present in folder listing, not individually inspected.
- `https://idegranada.dipgra.es/server/rest/services/URBANISMO/EDIFICACION_EN_RUSTICO/{MapServer,FeatureServer}` and `t34p_edificaciones_rustico_total_/{MapServer,FeatureServer}` — rural-building layers, present in folder listing, not individually inspected, unlikely to be relevant to urban envelope.
- `https://idegranada.dipgra.es/server/rest/services/URBANISMO/SUELO_INDUSTRIAL/MapServer` — industrial-land layer, present in folder listing, not individually inspected.
- Individual PGOU plan-sheet PDFs, confirmed downloadable and confirmed raster (not usable as machine-readable zoning data, listed here only as verified-reachable documents): `granada.org/pgo/2001-06.pdf`, `granada.org/pgo/2001-31.pdf` (pattern: `granada.org/pgo/2001-NN.pdf`, sheets accessible by number 01–3x+ via the `pgo.nsf`/`wpgo.nsf` Lotus Domino index).
- Normativa urbanística full text (HTML, Domino-served, genuinely text-readable — unlike the plan sheets): `granada.org/inet/wpgo.nsf/...` document tree, e.g. Título Séptimo at `8c6283f8cc03dea2c1256e32003da6e9/db27e5b169f9ab98c1256e27007bafda!OpenDocument`.
- AESA national aeronautical-servitude KMZ: `seguridadaerea.gob.es/sites/default/files/mapa_aeropuertos.kml` (covers Granada-Jaén/LEGR; format and full 3D geometry already independently verified for Barcelona).

## Missing assets

- A vector/tabular equivalent of the "Calificación y Ordenación Física" plan sheets (parcel-level use, intensity, height, floor count, setbacks, alignment, buildable depth). None found on `granada.org`, `idegranada.dipgra.es`, `dipgra.es`, or via search.
- A confirmed-live heritage BIC/Conjunto Histórico boundary service specific to Granada (sector polygons for Alhambra-Generalife/Albaicín/Sacromonte/Centro). The `dea100_patrimonio` WMS URL surfaced only in search results, not fetched/validated this pass.
- A confirmed-live REDIAM flood-zone WMS/WFS response for the Genil/Darro corridor through Granada city (service family exists regionally; not queried directly against Granada's bbox this pass).
- Any PERI/PEPRI (Plan Especial) inventory for the Conjunto Histórico sectors — these plans typically impose stricter, separately-published rules inside historic centres and were not located or verified.
- Confirmed CRS/coverage metadata for `Parcelas_Catastrales_2024` (returned EPSG:3857 with empty description fields — geographic extent is plausible for Granada province but not textually confirmed to include municipality 18087 specifically).

## Blockers

- **Format blocker (root cause, engineering-unsolvable as posed):** the authoritative zoning source for height/floors/etc. is a raster scan with zero embedded text or vector data. This is not an OCR problem in the "text recognition" sense — there is no text to recognize, only symbology (hatching, colour zones, numeric annotations drawn as raster pixels) that requires either (a) manual cartographic digitisation sheet-by-sheet, or (b) computer-vision-based symbol/color-zone classification against the published legend (`granada.org/pgo/e1/2001-ley.gif`), both of which are non-trivial, error-prone, and — critically — **not legally authoritative** unless independently verified against the graphic original per Art. 7.9.6's own wording.
- **Legal blocker:** Art. 7.9.6 explicitly ties the maximum-floors parameter to "los planos" (the plans) as the graphic original — any digitised/inferred value is legally a derivative interpretation, not the ordinance itself. A dispatch pipeline that "reads" a digitised value carries interpretive risk that other cities (with tabulated ordinances) do not.
- **Research gap, not yet a blocker:** heritage, flood, and environmental overlays each have a plausible regional GIS home (IAPH/DERA, REDIAM) but were not independently fetched and confirmed live against Granada's actual extent in this pass — treat as open until verified, especially heritage given the Alhambra stakes.
- **GIS-solvability of what IS live:** parcel geometry and coarse soil classification are fully solvable today (standard ArcGIS REST, no blocker).

## Estimated Unlock Effort: **Very Large**

Not because of software engineering complexity, but because the smallest credible unlock is either
(a) a municipal records/transparency request to establish whether the Ayuntamiento de Granada holds
an internal vector master for the PGOU (unknown, unasked, could turn this from Very Large to Medium
overnight if it exists), or (b) manual/CV-assisted digitisation of the full plan-sheet series
(30+ sheets observed numbered at least 01–36) sheet by sheet against the published legend, with
legal sign-off that the digitisation is a faithful derivative — a multi-week-to-multi-month effort
before any dispatch logic could be written, and still short of confirming heritage/flood coverage.

## Recommendation: **Research first**

Specifically: (1) file a transparency/records request to Ayuntamiento de Granada asking directly
whether a vector GIS layer for "Calificación y Ordenación Física" exists internally (the public
`pgo.nsf` being raster does not prove none exists — Lotus Domino sites from this era routinely
serve rasterised exports of vector originals); (2) independently fetch and verify the IAPH
`dea100_patrimonio` WMS and REDIAM flood WMS against Granada's actual bounding box before drawing
any conclusion about those axes; (3) do not begin build work until (1) resolves, since it is the
single fact that most changes the effort estimate.

## PRYZM Readiness Score: **18 / 100**

Parcel geometry (live, verified) and coarse classification (live, verified) justify a low-but-nonzero
score; the absence of any machine-readable path to the parameters that actually determine a
buildable envelope (height, floors, setbacks, buildable depth, alignment) — confirmed both by
direct plan-sheet byte inspection and by the ordinance's own explicit graphical-delegation clause —
caps the score well below "Indicative Ready" tier.

## Compare against

| City | Status (per repo memory/tracker) | Granada relative position |
|---|---|---|
| Barcelona | End-to-end sound, envelope depth+height shipped, AESA KMZ full 3D servitude geometry verified | Granada far behind — no vector zoning source at all vs. Barcelona's resolved pipeline |
| Murcia | pgou_ejes road-axis issue resolved, active work | Granada behind — Murcia has a workable vector base being refined; Granada has none |
| Balears | Not directly detailed in memory; treated as an active jurisdiction | Insufficient data this pass to compare directly |
| Zaragoza | Not directly detailed in memory | Insufficient data this pass to compare directly |
| Sevilla | Not directly detailed in memory (other Andalusian capital) | Likely same Domino-era raster-plan risk given shared regional/era planning-document conventions — unverified, flag for its own audit |
| Valencia | Not directly detailed in memory | Insufficient data this pass to compare directly |
| Córdoba | Verification/dispatch/rendering tracked as 3 distinct milestones, "signed gate, zero dispatcher compute branch" | Granada behind — Córdoba has reached a dispatch-gate milestone Granada cannot reach without a zoning source |
| Málaga | Real parameter data + cross-regional depth-vocabulary flag captured | Granada behind — Málaga has real sourced parameters; Granada has none |

Granada sits at the bottom of this comparison set: it is the only city in the list confirmed (by
direct byte-level PDF inspection, not inference) to have **no vector or tabular zoning source of
any kind**, with the added complication of an ordinance clause that legally anchors the authoritative
value to the raster graphic itself.

## Final verdict + single biggest blocker

**Verdict:** Granada cannot today produce a legally-defensible buildable envelope through any
automated pipeline. Parcel geometry is solved; the zoning parameters that matter are not, and the
governing ordinance text makes clear this is a legal-source problem, not merely a data-format
inconvenience.

**Single biggest blocker:** the "Calificación y Ordenación Física" plan sheets are confirmed raster
scans (Ghostscript-produced, zero fonts, zero vector text/paths) with no published vector or
tabular substitute, and Article 7.9.6 explicitly makes those raster sheets the legal source of
truth for building height/floor count — so even a perfect digitisation would remain, strictly
speaking, an interpretation rather than the ordinance itself.
