# Berlin (11000) — SOURCES (buildability dossier)

> **Captured:** 2026-07-31 · **Source:** founder research.
> This is the dossier-level source register (endpoints, laws, licences). The live-probe LOG (2026-07-23 reconnaissance, HTTP results, schema dumps) lives separately in `sources/SOURCES.md` — read both.

---

## A — Data endpoints

| Source | Answers | Endpoint | CRS | Licence | Confidence |
|---|---|---|---|---|---|
| B-Plan WFS — **plu_bplan** (new OGC) | plan boundary + document linkage (`inhalt`) | `https://gdi.berlin.de/services/wfs/plu_bplan` | EPSG:25833 | DL-DE/Zero-2.0 | **VERIFIED-SCHEMA** (endpoint/protocol/CRS/licence VERIFIED; schema per Datenformatbeschreibung) |
| B-Plan WFS — **bplan / FIS-Broker** (legacy) | plan boundary + PDF (`scan_www`) | `https://gdi.berlin.de/services/wfs/bplan` · `fbinter.stadt-berlin.de` | EPSG:25833 | DL-DE/Zero-2.0 | **CONVERGENT-SECONDARY** (2026-07-24 recon; matches LAND-REGISTRY Berlin row) |
| ALKIS parcels (Flurstücke) | parcel geometry + id spine | `https://gdi.berlin.de/services/wfs/alkis_flurstuecke` · base `…/services/wfs` | EPSG:25833 | DL-DE Zero 2.0 (founder) / DL-DE BY 2.0 (LAND-REGISTRY) | endpoint **VERIFIED-per-founder**; id field + licence **PROBE-REQUIRED** |
| LoD2 3D-Gebäudemodell | existing built form / heights (CONTEXT only) | `gdi.berlin.de/services/wfs/lod2_gebaeude` | EPSG:25833 (DHHN2016) | DL-DE BY family | **PROBE-GATED** (prior URL 404 — reconfirm via FIS-Broker) |
| DGM1 terrain / DOP20 ortho | terrain + orthophoto (CONTEXT / visual-QA only) | GDI-BE WCS / WMTS | EPSG:25833 (DHHN2016) | DL-DE BY family | **PROBE-GATED** |

> ⚠ **Endpoint DISCREPANCY (flagged, not resolved):** `plu_bplan/inhalt` (new OGC, VERIFIED-SCHEMA) vs `bplan/scan_www` (FIS-Broker legacy, CONVERGENT-SECONDARY). BOTH recorded; the production endpoint is resolved by a live GetCapabilities on each — see `NEXT.md`. No winner asserted.
> ⚠ **Licence discrepancy (flagged):** founder records DL-DE/Zero-2.0 for the B-Plan WFS; `de/LAND-REGISTRY.md` records DL-DE BY 2.0 for GDI-BE broadly. Confirm per-service.

---

## B — Legal framework (cited)

| Instrument | Answers | Citation URL | Confidence |
|---|---|---|---|
| Datenformatbeschreibung Bebauungsplanverfahren | plu_bplan field schema | `gdi.berlin.de/data/bplan/docs/Datenformatbeschreibung_Bebauungsplanverfahren.pdf` | VERIFIED-SCHEMA |
| BauGB §30 | modern B-Plan basis | `gesetze-im-internet.de/bbaug/__30.html` | published |
| BauGB §34 | unplanned interior — refusal basis | `gesetze-im-internet.de/bbaug/__34.html` | published |
| BauGB §35 | outlying area — refusal basis | `gesetze-im-internet.de/bbaug/__35.html` | published |
| §173(3) BBauG | Baunutzungsplan 1958/60 legal binding | historic Bundesbaugesetz | published |
| BauNVO §17 | national density ceilings — **NEVER a parcel answer** | `gesetze-im-internet.de/baunutzungsv/__17.html` | published (orientation only) |
| BauO Bln §6 | Berlin Abstandsflächen (setbacks) | `gesetze.berlin.de` → BauO Bln §6 | **multiplier PROBE-REQUIRED** — do NOT copy NRW's 0.4H |
| OVG Berlin-Brandenburg, Az. 2 B 10.17 (15 Sep 2020) | Baunutzungsplan *funktionslos* voidance precedent | court ruling | published |

---

## C — Fixtures

| Fixture | Status | File |
|---|---|---|
| Bebauungsplan 8-30 (Neukölln) | VERIFIED_DOCUMENT_EXISTENCE — festgesetzt 2018-11-20, GVBl 2018-12-15 p.678; ZERO numbers extracted | `plans/8-30-neukoelln/metadata.json` |

---

**Related:** `sources/SOURCES.md` (live-probe log) · `LEGISLATION.md` · `gis/bplan-source.json` · `EXTRACTION-PIPELINE.md` · `NEXT.md`
