# Germany — Geospatial Data Inventory (Priority 1–4)

**Level:** country · **Last updated:** 2026-07-30 · **Maintainer:** UNASSIGNED ·
**Status:** RESEARCH INVENTORY — probe-gated

> **Confidence banner (§CONTEXT-DATA-HONESTY):** all rows are **CONVERGENT-SECONDARY**
> (multi-source, unprobed) **EXCEPT** the single **VERIFIED-LIVE** row: **NRW LoD2-DE CityGML
> open download** (`opengeodata.nrw.de`, probed 2026-07-24). Confidence column flags each row.
> An empty result and a failed probe are the same value — probe before a RATE cell moves.

Companion files: national architecture → `GERMANY.md`; 16-Land matrix → `LAND-REGISTRY.md`;
legal umbrella (regimes / BauNVO / XPlanung) → `README.md`; citations → `sources/SOURCES.md`.

Column legend: **National?** = one national feed vs per-Land · **prod-ready** = usable in a
production wiring today (Y / N / partial) · **Confidence** = VERIFIED-LIVE · CONVERGENT-SECONDARY.

---

## Priority 1 — routing, parcels, planning-as-data

| Dataset | Authority | Access | API | Licence | CRS | National? | prod-ready | Confidence |
|---|---|---|---|---|---|---|---|---|
| **VG250** — Verwaltungsgebiete (AGS routing) | BKG | Download + WFS | WFS 2.0 / ATOM | DL-DE BY 2.0 | 25832 / 4326 | ✅ YES | Y | CONVERGENT-SECONDARY |
| **ALKIS** — `Flurstück` parcels | Per-Land Vermessungsverwaltung (AdV schema) | Per-Land WFS / OGC-API / NAS | WFS 2.0 / OGC API Features | Varies per Land (free: NRW, Berlin/Brandenburg GDI-BE, Sachsen-Anhalt; else fee/registration) | 25832 (W) / 25833 (E) | ❌ per-Land | partial | CONVERGENT-SECONDARY |
| **ALKIS `Gebäude`** — building footprints + `Gebäudefunktion` (use) | Per-Land | Per-Land WFS | WFS 2.0 | Per-Land | 25832 / 25833 | ❌ per-Land | partial | CONVERGENT-SECONDARY |
| **XPlanung / XPlanGML v6.1** — structured B-Plan (GRZ/GFZ/Höhe) | Municipalities via **DiPlanung** | Per-municipality WFS | WFS / XPlanGML | Per-municipality | 25832 / 25833 | ⚠ standard national, delivery per-municipality | N (null-rate unknown) | CONVERGENT-SECONDARY |
| **BauNVO zone taxonomy** (WA/MI/GE/GH/MK…, §17 GRZ/GFZ ceilings) | Federal (BauNVO §§2–11, §17) | Static — hard-code ONCE | n/a (closed list) | gesetze-im-internet (public) | n/a | ✅ YES | Y | CONVERGENT-SECONDARY |

Notes:
- **VG250 is the prerequisite.** `coordinate → VG250 polygon → AGS → Land`. Nothing else routes
  without it (see `GERMANY.md §3`).
- **XPlanung reality check:** DiPlanung operational in 7 Länder as of 2026-07-23 (Bayern, Berlin,
  Brandenburg, Bremen, Hamburg, Niedersachsen, Schleswig-Holstein); Hamburg 100 % migrated. The
  **GRZ/GFZ/Höhe attribute null-rate is UNKNOWN** — a compliant XPlanGML file may carry geometry +
  a scanned-PDF link only. Probe one B-Plan before building the ingestion (see `NEXT.md §8`).
- **BauNVO taxonomy** is a fixed national closed list — build it once, reuse in every Land/city.

---

## Priority 2 — buildings, heights, terrain, orthophotos

| Dataset | Authority | Access | API | Licence | CRS | National? | prod-ready | Confidence |
|---|---|---|---|---|---|---|---|---|
| **LoD2-DE** — CityGML LoD2 buildings (~58 M; measuredHeight + traufhoehe/firsthoehe + roof planes) | ZSHH (national gateway) + per-Land tiles | **NRW: open download (VERIFIED)**; others per-Land | OGC API Features / REST / WMS / ATOM / I3S | DL-DE Zero 2.0 (NRW); per-Land otherwise; ZSHH national feed INSPIRE Art.13(1)(e) RESTRICTED | 25832 (W) / 25833 (E) | ⚠ data national, access per-Land | partial (NRW: Y) | **VERIFIED-LIVE (NRW)** / else CONVERGENT-SECONDARY |
| **DGM** — DGM1/2/5/10 LiDAR terrain | Per-Land | Per-Land WCS / GeoTIFF download | WCS 2.0 / GeoTIFF | DL-DE Zero / BY 2.0 (per-Land) | 25832 / 25833 | ❌ per-Land (Copernicus DEM 30 m = national fallback) | partial | CONVERGENT-SECONDARY |
| **DOP20 / DOP10** — orthophotos (20 cm / 10 cm) | Per-Land | Per-Land WMTS / WMS / download | WMTS / WMS | DL-DE Zero / BY 2.0 (per-Land) | 25832 / 25833 | ❌ per-Land (Copernicus fallback) | partial | CONVERGENT-SECONDARY |
| **ATKIS Basis-DLM** — roads / water / land-use context | Per-Land (one AdV object catalogue) | Per-Land WFS / download | WFS 2.0 | Per-Land | 25832 / 25833 | ❌ per-Land (OSM = national fallback) | partial | CONVERGENT-SECONDARY |

Notes:
- **LoD2 = Germany's edge.** LoD2 CityGML carries TRUE height (measuredHeight, eaves `traufhoehe`,
  ridge `firsthoehe`, roof planes) directly — **skip the DSM/nDSM derivation pipeline entirely**.
- **Terrain / orthophoto** = the Spanish PNOA workflow (GeoTIFF → quantized mesh / WMTS), one
  provider per Land, no parser difference. Copernicus DEM (30 m) / Copernicus imagery are the
  always-available national fallbacks.

---

## Priority 3 — environmental (national-by-theme, federated)

| Dataset | Authority | Access | API | Licence | CRS | National? | prod-ready | Confidence |
|---|---|---|---|---|---|---|---|---|
| **Natura2000 + Landscape** | BfN — `geodienste.bfn.de` | WFS / WMS | WFS 2.0 / WMS | DL-DE (BfN terms) | 25832 / 4326 | ✅ federal | partial | CONVERGENT-SECONDARY |
| **Soil / geology** | BGR — `geoviewer.bgr.de` | WMS / download | WMS | BGR terms | 25832 / 4326 | ✅ federal | partial | CONVERGENT-SECONDARY |
| **Flood + water** (EU Flood Directive, INSPIRE) | UBA / LAWA + Länder | WMS / WFS (some PDF-only) | WMS / WFS | Per-authority | 25832 / 25833 | ⚠ federal frame, per-Land delivery | N (mixed) | CONVERGENT-SECONDARY |
| **Forest** (Bundeswaldinventur, 10-yr) | Thünen-Institut / BMEL | Download | n/a | Federal | 25832 / 4326 | ✅ federal | partial | CONVERGENT-SECONDARY |

---

## Priority 4 — discovery / control (supporting)

| Dataset | Authority | Access | API | Licence | CRS | National? | prod-ready | Confidence |
|---|---|---|---|---|---|---|---|---|
| **GovData** — national metadata discovery | GovData (Bund/Länder) | Portal / CKAN API | CKAN | Per-record | n/a | ✅ YES | Y (discovery only) | CONVERGENT-SECONDARY |
| **AFIS** — geodetic control (ETRS89 + DHHN2016) | AdV / Länder | Reference frame | n/a | Public | 25832 / 25833 | ✅ standard | Y (as datum) | CONVERGENT-SECONDARY |
| **Addresses** — Hauskoordinaten (HK) / GA | ZSHH + per-Land | Per-Land | WFS / download | Per-Land | 25832 / 25833 | ⚠ per-Land | partial | CONVERGENT-SECONDARY |

---

## The layer-precedence honesty model

Each derived answer has an ordered fallback chain. **Every downgrade must be badged in the
product; a fallback value is never presented as authoritative.** Empty and failed are the same
value — the badge distinguishes them.

### Parcel geometry
```
ALKIS Flurstück (legal cadastre, per-Land)
  → historic / register geometry (where ALKIS licence-blocked)
  → OSM footprint  [BADGE: "approximate — not legal ALKIS"]
```

### Building height
```
LoD2-DE measuredHeight / firsthoehe / traufhoehe (TRUE height + roof)   [primary]
  → ALKIS LoD1 traufhoehe / firsthoehe                                   [LoD1 fallback]
  → OSM building:levels × 3.2 m                                          [BADGE: estimated]
  → fabricated 9 m                                                       [BADGE: fabricated — last resort]
```
> nDSM / DSM-derivation is **ABSENT by design** — LoD2 makes it unnecessary. Do not build it.

### Zone / envelope rule
```
XPlanung WFS structured attrs (GRZ/GFZ/Höhe)          [if non-null — probe null-rate first]
  → B-Plan Satzung PDF (legally binding scanned plan)  [manual extraction]
  → §17 BauNVO ceiling                                 [UPPER-BOUND SANITY ONLY — NEVER a parcel default]
  → §34 BauGB "Einfügen"                               [reasoned REFUSAL — no numeric table by law]
  → §35 BauGB                                          [presumptively not buildable — refusal]
```
> The §30/§34/§35 **regime classifier must run FIRST**. §17 ceilings are the sanity bound, never
> the answer. §34 output is a refusal, not a gap to fill.

---

## Cross-references / sources

- Full citations: `sources/SOURCES.md` (VG250, DGM, DOP, ATKIS, BfN, BGR, UBA rows added 2026-07-30).
- Legal structure (regimes, BauNVO §17 table, XPlanung): `README.md §1–2`.
- Height / LOD strategy: `LOD-RATE.md` (NRW LoD2 VERIFIED-LIVE evidence appendix).
- 16-Land endpoint matrix: `LAND-REGISTRY.md`.

---

*Confidence: CONVERGENT-SECONDARY throughout, except NRW LoD2-DE = VERIFIED-LIVE
(opengeodata.nrw.de, 2026-07-24). No numeric GRZ/GFZ/Höhe value is verified for any German parcel.*
