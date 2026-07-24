# NEXT — Switzerland (`ch`)

> **What this file is.** The single place recording where we stopped on Switzerland, exactly why, and
> precisely what to do to go further the moment it becomes possible — so a source/technique found
> while working on another jurisdiction can be brought straight back here.
> **Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** Context-data GATE PASSED;
> legal/zoning layer NOT STARTED.

---

## 1 — WHERE WE STOPPED

The context-data layer (L-511) is fully researched and the Gate is passed: buildings (LOD2 nationwide,
GWR EGID join, swissSURFACE3D LiDAR, swissALTI3D DTM), roads, water, parks, and trees are all
confirmed as object-level, nationwide, free OGD via swisstopo/BFS. The one regional nuance — the
swissBUILDINGS3D 3.0 Beta biannual canton rollout — is documented with a routing strategy and a
6-month re-check cadence.

The legal/zoning layer has not been started at all. The operative instrument is the **ÖREB/RDPPF
cadastre** (federal ordinance V-ÖREB), implemented per-canton as the Nutzungsplanung /
Bau- und Zonenordnung. No canton's ÖREB endpoint has been queried. The key unknown: whether a typical
canton's ÖREB response returns zone code + Ausnützungsziffer + max height as structured machine-readable
fields, or delivers only linked-PDF provisions. That single question determines the realistic rate ceiling.

---

## 2 — THE NUMBER

**Context-data structured fill:** ~85% (all four topic layers confirmed nationwide; see `RATE.md`).

**Building-rule structured fill** (zone code + density metric + height rule, per parcel):
**NOT YET ASSESSED — 0 cantons probed.** The honest current answer is: unknown, pending one pilot
ÖREB query. Do not invent a percentage.

---

## 3 — BLOCKERS

### 3.1 — Legal/zoning layer not begun; ÖREB/RDPPF structured-field question unanswered

- **What it is.** Zero ÖREB/RDPPF queries run for any Swiss canton. The V-ÖREB ordinance mandates a
  standardized data model across all cantons, but whether canton implementations actually populate
  zone + Ausnützungsziffer + height as structured attributes (vs. PDF URLs) is unknown.
- **Why it blocks.** Without knowing this, the rate ceiling is undefined and no pack work can be
  scoped.
- **What would unblock it.** One pilot query against any canton's ÖREB endpoint for a known address.
  Recommended pilot cantons (most advanced ÖREB digitization): **Zürich (`ch-zh`)** or **Bern
  (`ch-be`)** — both are large, technically capable, and have published ÖREB documentation.
- **THE EXACT RESUME STEP.**
  ```
  # 1. Get the federal ÖREB XML service endpoint for a test canton, e.g. Zürich:
  #    https://geodienste.ch/db/oereb_2_0/deu  (federal aggregator — lists all canton endpoints)
  # 2. Query a known address, e.g. an address in Zürich:
  #    https://oereb.zh.ch/extract/reduced/json/coord/2683448,1248342
  # 3. Inspect the response: does it include a structured field for the zone code
  #    (e.g. `Bezeichnung` / `Typ_Kt`) AND a numeric Ausnützungsziffer/GFZ AND max height?
  #    Or only `PDF_URL` for the ordinance text?
  # 4. Record result in ch-zh/NEXT.md and update RATE.md.
  ```

### 3.2 — GWR Merkmalskatalog field schema not transcribed

- **What it is.** The GWR attribute catalogue (`housing-stat.ch/files/881-2200.pdf`) has not been
  read field-by-field. Confirmed attributes (Anzahl Geschosse, Baujahr, Gebäudeart,
  Gebäudefläche, heating, dwelling count) exist; full type/domain list not yet verified.
- **Why it blocks.** Cannot commit a schema mapping for the EGID-join pipeline without it.
- **THE EXACT RESUME STEP.** Download `housing-stat.ch/files/881-2200.pdf`; record Stufe A field
  names, types, and domain values in `sources/SOURCES.md §A`.

### 3.3 — CityGML export conformance level not confirmed

- **What it is.** swissBUILDINGS3D CityGML exports: version 2.0 or 3.0 not confirmed from a sample.
- **Why it blocks.** The ingestion pipeline schema depends on which CityGML version is delivered.
- **THE EXACT RESUME STEP.** Download one sample `.gml` tile from `map.geo.admin.ch`; inspect the
  `cityGMLVersion` declaration in the file header; record in `topics/buildings-lod-height.md §Open items`.

---

## 4 — TRIP-WIRES

- **4.1 — ÖREB/RDPPF structured data confirmed in any canton** → come back here (§3.1) and run the
  same probe for additional cantons using the same federal aggregator endpoint. The V-ÖREB federal
  data model means a working reader is reusable across all 26 cantons.
- **4.2 — swissBUILDINGS3D 3.0 Beta adds a new canton** → update `regions/README.md` canton table
  and `topics/buildings-lod-height.md §Coverage gaps`. Check biannually at
  `opendata.swiss/en/dataset/swissbuildings3d-3-0-beta`.
- **4.3 — Any Swiss city publishes an open-data tree cadastre** → update `topics/parks-trees.md
  §Known limitation` and document the endpoint in `sources/SOURCES.md`.
- **4.4 — swissSURFACE3D COPC tile reader built for another jurisdiction** → reuse for Switzerland
  directly; same format (COPC, LAZ 1.2 fallback), same free OGD licence.
- **4.5 — GWR EGID join pattern proven in another context** → the same join (geometry + EGID +
  `housing-stat.ch` API) is identical for all Swiss cantons; no per-canton variation.

---

## 5 — WHAT IS ALREADY BUILT (do not redo)

- **Context-data layer research:** all four topics researched, Gate PASSED. `topics/` files filled.
- **3.0 Beta canton routing table:** `regions/README.md` with full canton-level 3.0 Beta / 2.0
  routing logic and 6-month re-check cadence.
- **GWR EGID join documented:** method and open items in `topics/buildings-lod-height.md`.
- **RATE.md scaffold:** current rate and field-by-field breakdown for the context layer.

---

## 6 — VERIFIED SOURCES

| Source | Answers | Tier | Exact query / note |
|---|---|---|---|
| `swisstopo.admin.ch/en/landscape-model-swissbuildings3d-2-0` | Buildings LOD2 product spec, licence, coverage | `document` | Product description page — coverage confirmed nationally since 2018 |
| `opendata.swiss/en/dataset/swissbuildings3d-3-0-beta` | 3.0 Beta canton coverage list | `document` | Dataset distribution page — canton list dated 2026-07-24 |
| `swisstopo.admin.ch` — swissTLM3D | Roads, water, parks, trees — object-level confirmation, attribute names, licence | `document` | Object catalogue (Objektkatalog swissTLM3D versions 1.7–2.4) |
| `housing-stat.ch` (BFS) | GWR attributes (Anzahl Geschosse, Baujahr, Gebäudeart, Gebäudefläche, etc.), update cadence, Stufe A public access | `document` | GWR product documentation; field-by-field schema PDF (Merkmalskatalog) NOT YET READ |
| `map.geo.admin.ch` | Download UI for all swisstopo products | `stated` | No login required; commercial use permitted |

---

## 7 — DEAD ENDS

- None recorded yet — no live probe attempts have been made for Switzerland.

---

## 8 — THE SMALLEST NEXT STEP

Query one canton's ÖREB/RDPPF endpoint (recommended: Zürich at
`https://oereb.zh.ch/extract/reduced/json/coord/2683448,1248342`) and check whether zone code +
Ausnützungsziffer + max height come back as structured data fields. Cost: one HTTP GET. Outcome A
(structured fields): Switzerland's rate ceiling approaches Denmark; scope Phase 1 for the full 26
cantons. Outcome B (PDF URL only): ceiling is lower; scope the OCR/transcription pipeline question
(L-449). Add `ch-zh/` + `<BFS>-<slug>/` only after this probe.
