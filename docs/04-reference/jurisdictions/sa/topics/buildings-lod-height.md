# Saudi Arabia — buildings, LOD, and height (context data)

**Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** RESEARCH — national sources
characterised (GEOSA licensed; Balady geo-fenced); global ML fallbacks are the reachable layer

---

## Summary

Saudi Arabia has a national geospatial custodian — **GEOSA (General Authority for Survey & Geospatial
Information)** — running the **National Geoportal (geoportal.sa)** and the National Spatial Data
Infrastructure (NSDI). But the national access model is **LICENSED, not open** (confirmed from the GEOSA
landing page + the launched Geospatial Licensing & Permitting System), and the per-parcel building backend
(Balady `MapServer/27`) is **geo-fenced** from outside SA. Consequently, for a commercial engine outside
Saudi Arabia, the **reachable** building layer is almost entirely **global ML fallbacks** — Microsoft Global
ML Building Footprints and Google Open Buildings — both of which cover Saudi Arabia. There is **no confirmed
open national LoD2 volumetric model.**

---

## Layer inventory

| Layer | Source | Content | LOD | Access | Licence | Confidence |
|---|---|---|---|---|---|---|
| **Building footprints (global ML)** | **Microsoft Global ML Building Footprints** | AI-derived footprint polygons; Saudi Arabia covered — +2.5M buildings added, later +590k edits from Maxar/Vexcel imagery | LOD0/LOD1 footprint | Free download (GitHub `microsoft/GlobalMLBuildingFootprints`), ODbL-compatible | Open (ODbL / MS terms) | `published` — **the reachable primary for KSA footprints** |
| **Building footprints (global ML)** | **Google Open Buildings** | AI-derived footprints; global south focus, includes KSA | LOD0 footprint | Free (Earth Engine / download) | Open (CC BY) | `published` |
| **Building footprints (community)** | **OpenStreetMap Saudi Arabia** | Community footprints; good in central/urban Riyadh, Jeddah, Dammam; sparse elsewhere | LOD0 + tags | Free, ODbL | ODbL | `published` — completeness varies by city |
| **Building footprints + resolved rules (national)** | Balady `Umaps_Click/MapServer/27` (building) + `/28` (parcel) | Building geometry + per-parcel setbacks/use/floors (`NOOFFLOORS`) | Footprint + attributes | **geo-fenced** (NXDOMAIN on ArcGIS host, WAF on proxy) | MOMRAH/Balady | `geo-fenced` — exists, not reachable from outside SA |
| **National building/topographic layers** | **GEOSA National Geoportal (geoportal.sa)** | National topographic + urban clusters + isolated rural buildings | Varies | **Licensed** (NGC publishing policy; `geo-licensing.geosa.gov.sa`) | GEOSA licence | `published` (existence); `TBD` (open access — it is not open) |
| **Building heights** | Microsoft ML (some releases carry height); DEM difference (DSM−DTM) | Height estimate | — | Free | Open | `corroborated` — sanity-check only, not authoritative |

---

## GEOSA — the national custodian, and the licence gate

⚠ **GEOSA is Saudi Arabia's version of the Norway FKB-Bygning licence gate — but broader.** Where Norway
gates only building footprints (FKB-Bygning: free for Norge digitalt parties, purchase for commercial) while
keeping parcel geometry and terrain open, **GEOSA gates the whole national product line** under the National
Geospatial Committee's publishing policy:

- **Confirmed (GEOSA landing page, reachable 2026-07-24):** the National Geoportal serves 78+ government
  agencies, 52+ private-sector beneficiaries, 18+ academic institutions, under a "defined publishing policy
  that protects rights and enhances data security." A **Geospatial Licensing and Permitting System** is
  launched (`geo-licensing.geosa.gov.sa`) covering surveying, high-resolution mapping, aerial/panoramic
  imaging.
- **Measured geo-fence:** `my.gov.sa/en/content/gis` (the National Portal GIS page) returned **HTTP 403**
  from outside SA — a WAF/geo block, consistent with the Balady geo-fence.
- **Implication:** a national building/terrain product exists but is **not free/open**; a commercial engine
  needs a GEOSA data agreement to use it. Until then, **global ML footprints are the reachable substitute.**

---

## No true national LoD2 (volumetric 3D model)

No confirmed Saudi national source provides a true LoD2 volumetric model (roof shape, wall geometry). The
reachable layers provide:
- Microsoft/Google ML: **2D footprint polygons only** (LOD0/LOD1), some with a coarse height estimate.
- Balady `MapServer/27`: footprint + attributes, but geo-fenced.

For architectural massing the engine must combine **ML footprints + a DEM** (Copernicus GLO-30 or a licensed
GEOSA product) rather than using a ready-made 3D building model — the same LoD2 gap Norway (FKB-Bygning is
2.5D, not true LoD2), Germany and France all have.

---

## Height — the legal vs the physical

Two distinct height concepts must not be conflated:

1. **Regulatory height (the envelope)** — the 2024 MOMRAH decision caps total height (villa ≤ 14 m §5-1-5
   cl. 3; apartment ≤ 23 m §3-2), measured *from the pavement/rasant at the main entrance to the top of the
   upper-annex roof slab* (§2). The **exact** permitted height beneath the cap is municipal + geo-fenced. See
   [`../README.md`](../README.md) §2a and
   [`../findings/SAUDI-MASTER-DATA-SOURCE-STUDY.md`](../findings/SAUDI-MASTER-DATA-SOURCE-STUDY.md) §A.4.
2. **Physical building height (context data)** — for existing neighbours (context massing), use Microsoft ML
   footprint heights where present, or estimate from DSM−DTM using a DEM. This is `corroborated`, not
   authoritative — a sanity-check layer, never a source for the regulatory answer.

⚠ Because total height is measured from the **rasant at the façade** (not the plot centroid), the same
terrain-sampling defect flagged for Barcelona (L-584 — sampling one point at the block centroid understates
the ordinance's façade-rasant basis) applies here. Budget a per-façade terrain sample, not a single centroid.

---

## Recommended integration sequence

1. Use **Microsoft Global ML Building Footprints** (free, open, KSA covered) as the primary context building
   layer — no licence step. Supplement with **OSM** in dense urban cores (Riyadh/Jeddah/Dammam centres).
2. Use a **DEM** (Copernicus GLO-30, free — see [`water.md`](water.md) / terrain notes) for terrain-referenced
   height and per-façade rasant sampling.
3. For a production national footprint/height product, resolve a **GEOSA data agreement** (licensed) and/or a
   **Balady data agreement** (`MapServer/27`+`/28`, geo-fenced) — the latter also unblocks the *exact*
   regulatory floors (`NOOFFLOORS`) per parcel.
4. Never present an ML-derived physical height as the regulatory height — the regulatory value is capped
   nationally and refused (exact value) per [`../README.md`](../README.md).

---

**Open questions / unverified** (not for `SOURCES.md`):
- Whether GEOSA publishes any *open* (non-licensed) building or terrain tile — the landing page implies not,
  but the exact free-tier boundary was not established (geo-fenced National Portal page, 403).
- Microsoft ML / Google Open Buildings **completeness fraction** for Riyadh / Jeddah / Dammam specifically —
  literature notes KSA coverage is complete in northern/populated areas, sparser in the south; not measured
  per target city in this pass.
