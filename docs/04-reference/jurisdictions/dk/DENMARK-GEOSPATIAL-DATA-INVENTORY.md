# Denmark (`dk`) — Geospatial Data Inventory (SDFI / Dataforsyningen platform)

**Level:** country · **Last updated:** 2026-07-30 · **Maintainer:** UNASSIGNED ·
**Status:** RESEARCH INVENTORY — benchmark, re-probe-before-prod

> **What this file is.** A single-table inventory of the national geospatial layers PRYZM would
> consume for Denmark, folded from the founder-supplied Danish geospatial + context deep-dive of
> 2026-07-30. It catalogues **who owns each layer, how it is accessed, its licence, and whether it
> is production-ready** — the geospatial (data-availability) axis, NOT the buildable-rule axis
> (`RATE.md`) and NOT the LOD/height physical-model axis (`LOD-RATE.md`). **Never conflate the
> three; this file changes NO RATE % cell.**
>
> ## 🏆 HEADLINE — Denmark is the benchmark (the 10/10 reference country)
>
> **Denmark is the ONLY audited country with machine-readable national planning data.**
> **PLANDATA.dk** publishes every *Lokalplan* + *Kommuneplanramme* as structured REST/WFS
> JSON/GML — the Legislation/Envelope *data* exists **nationally**, live, keyless. This is the
> single differentiator: every other jurisdiction (ES, DE, IT, PT, …) has zone geometry but must
> reconstruct the dimensional rule from scanned plans or curated rule-packs. Denmark reads it
> directly. Because the whole substrate quartet — **parcels (Matriklen) + buildings (BBR) +
> addresses (DAR) + terrain/elevation (national LiDAR/DTM/DSM) + planning (PLANDATA.dk)** — is
> authoritative, national, and open, Denmark is the reference implementation all other countries
> are measured against (see `DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md`, L-383).
>
> ## Why the RATE LEGISLATION / ENVELOPE axes still read `not-assessed` (read this before quoting the RATE)
>
> Denmark's RATE LEGISLATION and ENVELOPE axes are `not-assessed` **because the L-449
> human-verification gate is unsigned per-city — NOT because the data is absent.** The planning
> data is machine-readable and live-probed (PLANDATA.dk, national structured-fill prior ≈96%; the
> byzone click-weighted dimensional fill is ≈87% today with the structured path alone — see
> `README.md` and `findings/L-609/L-610/L-611`). Two *legal* items (§USABLE-FALLBACK precedence +
> byggefelt bindingness) need a Danish planner's sign-off (`sources/VERIFICATION.md`). **Denmark is
> therefore the country whose RATE can rise furthest, fastest: the data is there; it needs the
> verification gate + wiring, not more sourcing.** This inventory does not — and must not — move any
> RATE cell; it records the data axis that the gate, once signed, would let the RATE reflect.
>
> ## Confidence discipline (§CONTEXT-DATA-HONESTY)
>
> Denmark's confidence is **`VERIFIED-PRIMARY` / benchmark** — authoritative national registers on
> a single documented platform, and the **Planning rows are additionally `VERIFIED-LIVE`**
> (Plandata.dk GeoServer WFS probed 2026-07-23; see `sources/SOURCES.md` / `sources/VERIFICATION.md`).
> **But a failed probe and an empty result are the same value.** The geospatial *context* endpoints
> (buildings/height/terrain/roads/water/parks) are documented from authoritative sources and the
> reference architecture, **not yet live-probed this pass** — so every such row carries a
> **⚠ re-probe-before-prod** flag. Ship the Phase-1 probe (`findings/DENMARK-CONTEXT-DATA-DEEP-DIVE-L513.md`
> §Probe checklist) before any context row gates a production decision. Even at 10/10, re-probe
> endpoints before prod.

Companion files: strategic architecture → `DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md`
(L-383, toolchain validation); per-layer source hierarchies + 3-tier badging →
`findings/DENMARK-CONTEXT-DATA-DEEP-DIVE-L513.md` (L-513); planning per-field citations →
`sources/SOURCES.md`; human sign-off gate → `sources/VERIFICATION.md`; envelope-rule axis →
`RATE.md` / `ENVELOPE-RULES.md` (NOT touched here).

**Platform & access model.** Almost everything is the **SDFI** (Styrelsen for Dataforsyning og
Infrastruktur) / **Dataforsyningen** platform. Three access flavours coexist and matter:

- **Datafordeler** (authoritative registers: Matriklen, BBR, DAR, Danmark-i-3D, DHM) —
  **open-with-key**, free self-service service-user API-key (`DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md`
  §2.1; server-side only, browser never sees it).
- **Dataforsyningen / api.dataforsyningen.dk** mirror — many layers **keyless with a `token=`** param.
- **PLANDATA.dk GeoServer WFS** (`geoserver.plandata.dk`) — **fully keyless / open** (`sources/SOURCES.md`).

**Column legend:** **National?** = one national feed vs municipal/per-theme · **prod-ready** =
usable in a production wiring today (Y / partial / N) · **Confidence** = `VERIFIED-LIVE` ·
`VERIFIED-PRIMARY` (authoritative national source, documented, ⚠ re-probe endpoint before prod).
All CRS **EPSG:25832** (ETRS89 / UTM 32N — metric; shoelace yields m² directly) and all licences
**Open** (Danish public-authority open data, commercial use allowed) unless noted.

---

## Priority 1 — routing, parcels, planning-as-data (the benchmark tier)

| Layer | Authority | Access | API | Licence | CRS | National? | prod-ready | Confidence |
|---|---|---|---|---|---|---|---|---|
| **Administrative boundaries** (kommune / region) | SDFI (DAGI) | Dataforsyningen / Datafordeler | WFS 2.0 / OGC API Features | Open | 25832 | ✅ YES | Y | `VERIFIED-PRIMARY` ⚠ re-probe |
| **Municipality codes** (kommunekode routing key) | Danmarks Statistik (Statistics DK) | Statistics DK | REST (StatBank API) | Open | n/a (code list) | ✅ YES | Y | `VERIFIED-PRIMARY` ⚠ re-probe |
| **Matriklen** — cadastre (`jordstykke` parcels) | SDFI (Matriklen2) | Datafordeler (open-with-key) | WFS 2.0 / OGC API Features / REST / bulk | Open | 25832 | ✅ YES, survey-quality | Y | `VERIFIED-PRIMARY` ⚠ re-probe |
| **Parcels** (matrikelkort geometry) | SDFI | Datafordeler / Dataforsyningen | WFS / OGC API / WMS · GML/GeoJSON/SHP | Open | 25832 | ✅ YES | Y | `VERIFIED-PRIMARY` ⚠ re-probe |
| **🏆 PLANDATA.dk** — national planning register (Lokalplaner + Kommuneplan) | Erhvervsstyrelsen (Danish Business Authority) | `geoserver.plandata.dk` — **keyless/open** | WFS 2.0 (GeoServer) / REST · GML/GeoJSON | Open | 25832 | ✅ YES — **machine-readable national planning (the differentiator)** | Y | **`VERIFIED-LIVE` (2026-07-23)** |
| **Zoning — Lokalplaner** (local plans + delområde sub-areas + byggefelt footprints) | Erhvervsstyrelsen (via PLANDATA) | `geoserver.plandata.dk` — keyless | WFS 2.0 / REST | Open | 25832 | ✅ YES | Y | **`VERIFIED-LIVE` (2026-07-23)** |
| **Municipal — Kommuneplan** (kommuneplanramme framework — fall-through floor) | Erhvervsstyrelsen (via PLANDATA) | `geoserver.plandata.dk` — keyless | WFS 2.0 / REST | Open | 25832 | ✅ YES | Y | **`VERIFIED-LIVE` (2026-07-23)** |

Notes:
- **Kommunekode is the routing prerequisite** (`coordinate → DAGI kommune polygon → kommunekode`);
  Denmark's jurisdiction-routing analogue of Germany's AGS / France's INSEE.
- **PLANDATA.dk carries structured dimensional fields** — `bebygpct` (bebyggelsesprocent = FAR×100),
  `maxbygnhjd` (max height m), `maxetager` (max floors), `anvendelsegenerel` (use) — per-plan and
  per-delområde. `maxCoverage` and per-edge setbacks are honestly `null` (not published on the plan
  feature; byggefelt gives a footprint *polygon*, not a %). See `sources/SOURCES.md` for the full
  per-field map and `findings/L-609/L-611` for the fill measurements + the coverage/OCR path.

---

## Priority 2 — buildings, height, terrain, orthophotos (Denmark's height strength)

| Layer | Authority | Access | API | Licence | CRS | National? | prod-ready | Confidence |
|---|---|---|---|---|---|---|---|---|
| **BBR — Bygnings- og Boligregistret** (construction year / use / floors / floor-area / roof / status / units / energy) | Klimadatastyrelsen (Climate Data Agency) | Datafordeler | **REST JSON** / WFS | Open | 25832 | ✅ YES — rich per-building attribute register | Y | `VERIFIED-PRIMARY` ⚠ re-probe |
| **Building attributes** (BBR passthrough — floors/year/use/roof/units) | Klimadatastyrelsen | Datafordeler | REST JSON | Open | 25832 | ✅ YES | Y | `VERIFIED-PRIMARY` ⚠ re-probe |
| **DAR — Danmarks Adresseregister** (addresses / reverse-geocode → kommune) | SDFI | Datafordeler / Dataforsyningen | REST | Open | 25832 | ✅ YES | Y | `VERIFIED-PRIMARY` ⚠ re-probe |
| **GeoDanmark** — national topographic base (building footprints, roads, hydro, veg…) | GeoDanmark (SDFI + municipalities) | Dataforsyningen / Datafordeler | WFS 2.0 / OGC API Features | Open | 25832 | ✅ YES | Y | `VERIFIED-PRIMARY` ⚠ re-probe |
| **National LiDAR** (DHM point cloud, ~4.5 pts/m², 13 classes) | SDFI (DHM) | Datafordeler / Dataforsyningen | LAZ tiles (10 km blocks) | Open | 25832 | ✅ YES | Y (offline) | `VERIFIED-PRIMARY` ⚠ re-probe |
| **DTM** — Danmarks Højdemodel terrain (0.4 m) | SDFI (DHM) | Dataforsyningen | **WCS** / GeoTIFF | Open | 25832 | ✅ YES | Y | `VERIFIED-PRIMARY` ⚠ re-probe |
| **DSM** — surface model (0.4 m) | SDFI (DHM) | Dataforsyningen | **WCS** / GeoTIFF | Open | 25832 | ✅ YES | Y | `VERIFIED-PRIMARY` ⚠ re-probe |
| **Building-height model** — DSM−DTM (P90) **validated vs BBR floor-count** | Derived (SDFI LiDAR + BBR) | derived in-module | derived (nDSM + BBR cross-check) | Open (inputs) | 25832 | ✅ YES (national inputs) | Y (derived) | `VERIFIED-PRIMARY` ⚠ re-probe |
| **Orthophotos** — national imagery | SDFI | Dataforsyningen | **WMTS** / WMS | Open | 25832 | ✅ YES | Y | `VERIFIED-PRIMARY` ⚠ re-probe |
| **"Danmark i 3D"** — LOD2 semantic CityGML (per-building ID, roof surfaces) | SDFI → Klimadatastyrelsen | Datafordeler (open-with-key) | CityGML (XML) | Open | 25832 | ✅ YES — real semantic LOD2 at national scale | Y (offline bake) | `VERIFIED-PRIMARY` ⚠ re-probe |

Notes:
- **Height is Denmark's edge** (★★★★★): national LiDAR → DSM−DTM (P90) → **BBR floor-count
  VALIDATION** — a cross-check of the measured height against the registered floor count that no
  other country in the study can do. LiDAR + BBR + DSM/DTM all cross-validate; roof reconstruction
  via RANSAC. No nDSM guess presented as truth — the BBR register grounds it.
- **No national semantic BIM / LOD3**; "Danmark i 3D" is LOD2. Municipal 3D city models exist for
  Copenhagen / Aarhus / Odense / Aalborg (engineering-grade, licence per-municipality). Utilities
  are fragmented and some municipal engineering data is local. These are the honest weaknesses.

---

## Priority 3 — context vector (roads, rail, hydro, coast, land cover)

| Layer | Authority | Access | API | Licence | CRS | National? | prod-ready | Confidence |
|---|---|---|---|---|---|---|---|---|
| **Road network** (centrelines + class) | GeoDanmark (+ municipal engineering GIS) | Dataforsyningen | WFS 2.0 | Open | 25832 | ✅ YES | Y | `VERIFIED-PRIMARY` ⚠ re-probe |
| **Cycle infrastructure** (segregated tracks / lanes / priority routes) | Municipal engineering GIS (+ GeoDanmark) | per-municipality | WFS / download | Open (per-muni) | 25832 | ⚠ municipal delivery | partial | `VERIFIED-PRIMARY` ⚠ re-probe |
| **Railways** | GeoDanmark / Banedanmark | Dataforsyningen | WFS 2.0 | Open | 25832 | ✅ YES | Y | `VERIFIED-PRIMARY` ⚠ re-probe |
| **Hydrography** (rivers / lakes / canals / wetlands) | GeoDanmark + Danish Environmental Portal | Dataforsyningen / Miljøportal | WFS / WMS | Open | 25832 | ✅ YES | Y | `VERIFIED-PRIMARY` ⚠ re-probe |
| **Coastline** | GeoDanmark | Dataforsyningen | WFS 2.0 | Open | 25832 | ✅ YES | Y | `VERIFIED-PRIMARY` ⚠ re-probe |
| **Land cover** | GeoDanmark / Basemap (Aarhus Univ.) | Dataforsyningen | WFS / raster | Open | 25832 | ✅ YES | Y | `VERIFIED-PRIMARY` ⚠ re-probe |

Note: **cycle infrastructure is a genuine DK differentiator** — segregated tracks, lanes and
priority routes carried in municipal engineering GIS (Copenhagen especially). Width-by-class buffer
→ terrain drape. Pedestrian (sidewalks/plazas/crossings/kerbs/tactile/ramps/stairs) is likewise
strong in municipal engineering datasets → ortho segmentation → procedural.

---

## Priority 4 — environmental, heritage, flood (national-by-theme)

| Layer | Authority | Access | API | Licence | CRS | National? | prod-ready | Confidence |
|---|---|---|---|---|---|---|---|---|
| **Nature protection** (§3 protected nature) | Danish Environmental Portal (Miljøportal) | Miljøportal | WMS / WFS | Open | 25832 | ✅ YES | Y | `VERIFIED-PRIMARY` ⚠ re-probe |
| **Natura 2000** | Danish Environmental Portal / Miljøstyrelsen | Miljøportal | WMS / WFS | Open | 25832 | ✅ YES | Y | `VERIFIED-PRIMARY` ⚠ re-probe |
| **Flood / coastal risk** | Kystdirektoratet (Coastal Authority) | Kystdirektoratet / Miljøportal | WMS / WFS | Open | 25832 | ✅ YES | partial | `VERIFIED-PRIMARY` ⚠ re-probe |
| **Protected buildings** (fredede bygninger) | Slots- og Kulturstyrelsen (Agency for Culture & Palaces) | FBB register | WFS / REST | Open | 25832 | ✅ YES | Y | `VERIFIED-PRIMARY` ⚠ re-probe |

---

## The layer-precedence honesty model (summary — full hierarchies in the L-513 deep-dive)

Each derived answer has an ordered fallback chain. **Every downgrade must be badged in the
product; a fallback value is never presented as authoritative. Empty and failed are the same value
— the badge distinguishes them.** Denmark's advantage is that its *primary* rung is an
authoritative national register far more often than any other country, so the chain rarely
degrades. Full per-layer hierarchies + the 3-tier REAL / DERIVED / ESTIMATED badging matrix are in
`findings/DENMARK-CONTEXT-DATA-DEEP-DIVE-L513.md`.

### Parcel geometry
```
Matriklen jordstykke (SDFI, survey-quality)     [primary — VERIFIED-PRIMARY]
  → municipal cadastre                           [rarely needed]
  → OSM footprint                                 [BADGE: approximate — not legal Matriklen]
```

### Building height
```
DSM − DTM (P90) VALIDATED vs BBR floor count    [primary — the DK cross-validated strength]
  → "Danmark i 3D" LOD2 measuredHeight            [semantic LOD2 alternative]
  → BBR floors × storey height                    [BADGE: derived from register]
  → OSM building:levels × 3.2 m                    [BADGE: estimated]
  → fabricated 9 m                                 [BADGE: fabricated — last resort]
```

### Zone / envelope rule
```
PLANDATA byggefelt / delområde / lokalplan structured attrs (bebygpct/height/etager)  [primary — VERIFIED-LIVE]
  → kommuneplanramme framework (fall-through where the tighter plan is silent)          [§USABLE-FALLBACK, legal sign-off PENDING]
  → plan-PDF text extraction (doklink; ≈79% born-digital — L-611)                        [pipeline-extracted-unverified]
  → BR18 national building regulation                                                    [reasoned deferral — no per-plan number]
```
> The §USABLE-FALLBACK precedence + byggefelt bindingness are the two items awaiting a Danish
> planner's sign-off (`sources/VERIFICATION.md`) — the L-449 gate. That gate, not data absence, is
> why the RATE LEGISLATION axis reads `not-assessed`.

---

## §Probe steps (the Phase-1 geospatial probe queue)

Even for the benchmark, **re-probe endpoints before prod.** These are the exact live probes that
would upgrade the `VERIFIED-PRIMARY` rows to `VERIFIED-LIVE`. Full checklist (per-endpoint) in
`findings/DENMARK-CONTEXT-DATA-DEEP-DIVE-L513.md §Probe checklist`.

1. **Dataforsyningen OGC API** — landing / `collections` / declared CRS / paging limits.
2. **Matriklen** — parcel schema, ids, update cadence.
3. **GeoDanmark** — buildings / roads / hydro / rail / veg / coast / bridges feature types.
4. **BBR** — lookup by point, floors / year / use / roof / building id.
5. **DAR** — address + reverse-geocode → kommunekode.
6. **National LiDAR** — acquisition date / density / classification / tile grid.
7. **DTM / DSM** — resolution / CRS / refresh schedule.
8. **PLANDATA.dk** — Lokalplaner / Kommuneplan / zoning status / restrictions / licence
   (already `VERIFIED-LIVE` 2026-07-23 — re-confirm before prod).
9. **Environmental Portal** — Natura2000 / §3-protected / wetland / flood.
10. **Municipal** (Copenhagen / Aarhus / Odense / Aalborg / Frederiksberg / Esbjerg) — engineering
    GIS / trees / parks / 3D city model / licence.

**Honesty gate:** until a context row is re-probed live, it stays `VERIFIED-PRIMARY` (⚠ re-probe)
here and unchanged in every RATE / LOD-RATE cell. Ship the probe before the fix.

---

## Cross-references

- `DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md` — L-383 strategic architecture + OSS toolchain
  validation (parcel → zoning → LOD2 → terrain, end-to-end on open data).
- `findings/DENMARK-CONTEXT-DATA-DEEP-DIVE-L513.md` — per-layer source hierarchies + 3-tier badging
  matrix + shared modules + Phase-1 probe checklist.
- `sources/SOURCES.md` — PLANDATA.dk per-field citations + the SDFI/Datafordeler platform anchors.
- `sources/VERIFICATION.md` — the L-449 human sign-off gate (2 legal items PENDING a Danish planner).
- `README.md` — the national-zoning jurisdiction index + the fill numbers (byzone ≈87%).
- `RATE.md` / `LOD-RATE.md` / `ENVELOPE-RULES.md` — the rule / physical-model / envelope axes
  (**NOT** touched by this file).

---

*Last updated: 2026-07-30. Denmark = the benchmark (10/10): the ONLY country with machine-readable
national planning (PLANDATA.dk). Planning rows `VERIFIED-LIVE` (2026-07-23); all other rows
`VERIFIED-PRIMARY` (authoritative national source, documented) — **⚠ re-probe endpoints before
prod.** The RATE LEGISLATION / ENVELOPE `not-assessed` state is the unsigned L-449 gate, NOT data
absence. This file moves NO RATE % cell. Maintainer: UNASSIGNED.*
