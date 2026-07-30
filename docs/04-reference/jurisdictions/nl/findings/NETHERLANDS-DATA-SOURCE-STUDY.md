# Netherlands — DATA-SOURCE & RULE-MECHANISM STUDY (C63 Phase-1 summary)

**Companion to the France/Belgium studies, same method: separate genuinely-national layers from
sub-national variation, and treat a different legal mechanism as a different engineering problem.**

**Status:** Physical-data layers wired/verified; legislation layer NOT probed. **Last updated:** 2026-07-30.
This summary consolidates the pre-existing `../README.md` (context-data spike), `../LOD-RATE.md`
(LoD2.2 ceiling), and `../RATE.md` (legislation NOT YET ASSESSED) for the C63 audit; it adds no new probes.

---

## Headline findings

**First headline — the Netherlands is the world's context-data ceiling.** 3DBAG (BAG building register ×
AHN national LiDAR) publishes every building at four LoD tiers simultaneously (LoD 0/1.2/1.3/2.2) with real
roof-plane geometry, roof type, and percentile roof heights, sub-metre RMSE, keyless CC-BY-4.0. `../LOD-RATE.md`
rates it **LoD2.2, ~99% real-height, ~97% headline — VERIFIED**. This is a genuine LoD2 product, not a height
attribute on a flat box (France) nor a floor-count estimate (Spain).

**Second headline — the physical stack is uniquely national AND wired.** Unlike every other jurisdiction,
three of PRYZM's four physical feeds are national + open + already wired: Kadaster **BRK** parcel
(`parcelProviders/registry.ts` `pdok-nl`, the only wired national cadastre), **3DBAG** height
(`heightSources.mjs 3dbag`, impl:live), **AHN** terrain (`terrain.mjs nl`, keyless CC0). This is why NL posts
the highest DATA-SOURCES axis (90%) of any country audited.

**Third headline — the legislation layer is the whole unknown.** The Omgevingswet (in force 1 Jan 2024)
replaced ~26 sectoral laws + the per-area bestemmingsplan with one gemeente-wide **omgevingsplan**, served via
the national **DSO** (Digitaal Stelsel Omgevingswet) / `ruimtelijkeplannen.nl` under the machine-oriented
**STOP/TPOD** standard. This *suggests* a high structured-fill ceiling (Nordic-tier) — but whether the DSO
"Regels op de kaart" API returns numeric rule values (functie / bouwhoogte / bebouwingspercentage) as typed
fields or as plan text is **NOT YET PROBED** (`../RATE.md`, `../NEXT.md §3.1`). No number can be stated honestly.

---

## PART A — What is national (and wired)

| Layer | Source | National? | Wired? | Note |
|---|---|---|---|---|
| Parcels | Kadaster BRK (PDOK) | ✅ | ✅ `pdok-nl` | the only wired national cadastre in PRYZM |
| Building geometry + height | 3DBAG (BAG × AHN) | ✅ | ✅ `heightSources.mjs 3dbag` | LoD2.2, measured, keyless |
| Terrain | AHN (PDOK WCS) | ✅ | ✅ `terrain.mjs nl` | keyless CC0, per-city bakeable |
| Context (buildings/roads/water/parks) | OSM bake | ✅ (national bbox) | ✅ `bake.mjs netherlands` | whole-country |
| Zoning / building rules | omgevingsplan / DSO | ✅ (framework) | ❌ | the whole remaining cost |

## PART B — The rule mechanism (omgevingsplan)

Dutch building rules are structured per *gebied*: **functie** (use), **goothoogte** (eaves height),
**bouwhoogte** (building height), **bebouwingspercentage** (coverage %). If the DSO delivers these as typed
fields, NL is a **Lyon-style structured-attribute** integration (config), NOT a new engine KIND (Paris/Brussels).
Two residual complexities: (1) the 2024 **Omgevingswet transition** — a parcel may still be governed by a
legacy bestemmingsplan under transitional law; (2) welstand (aesthetic) + heritage (rijks/gemeentelijke
monumenten) overlays apply on top.

## PART C — What this means for scale

The Netherlands' cost shape is the **inverse of Belgium's**: Belgium has a strong parcel layer but three
independent, discretionary, PDF-bound legal systems; the Netherlands has one national digital-first legal
framework AND the best physical data — so the marginal cost per gemeente is low **once the DSO feed is probed
and wired once nationally**. The gating action is a single Phase-0 DSO probe (`../RATE.md` "What would raise
the rate"), not per-city sourcing.

## PART D — Honest current state

- Physical data (parcel/height/terrain/context): **wired / verified** — DATA-SOURCES 90%.
- Deployed context tiles render **OSM `assumed` heights**, not 3DBAG, until the per-city 3DBAG bake or the
  OSM-footprint-join lands (the whole-country bake refuses 3DBAG per-tile). HEIGHTS therefore `not-assessed`.
- Legislation/envelope: **not-assessed** — the DSO probe is unrun. The ceiling cannot be set honestly yet.

---

**Cross-refs:** `../README.md` (context spike) · `../LOD-RATE.md` (LoD2.2 ceiling) · `../RATE.md` (legislation
NOT YET ASSESSED) · `../COUNTRY-RATE.md` (composite) · Omgevingswet 2024 · DSO / STOP-TPOD ·
`tools/context-bake/{bake,terrain,heightSources}.mjs`.
