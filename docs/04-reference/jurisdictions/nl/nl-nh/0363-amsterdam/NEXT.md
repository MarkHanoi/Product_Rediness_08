# NEXT — Amsterdam (0363)

> **Last updated:** 2026-07-30 · **Maintainer:** UNASSIGNED

**Where we stopped:** C63 Phase-1 dossier scaffolded. Context bake LIVE (`bake.mjs netherlands`), Kadaster
BRK parcel provider WIRED + live (`pdok-nl`), 3DBAG height source + AHN terrain both wired/keyless. No rule
pack. The DSO/omgevingsplan zoning feed is researched but not wired.

---

## 1 — BLOCKERS

### B1 — 3DBAG per-city bake unlanded (HEIGHTS `not-assessed`)
The whole-country `netherlands` bake refuses 3DBAG per-tile (paginated `items` API truncates a 4°×3° scan) →
deployed tiles render OSM `assumed`, not the real 3DBAG roof heights.
**RESUME STEP:** add a per-city Amsterdam 3DBAG bbox bake (`4.83,52.34,4.97,52.42`) OR wire the OSM-footprint-
join (stamp 3DBAG height onto bake's OSM clip — the named follow-up), then probe the deployed provenance
histogram to compute the `tagged` fraction.

### B2 — Terrain rung-50 (unverified)
`terrain.mjs` REGIONS `amsterdam` (AHN, keyless) is bakeable but no `terrain.verify.mjs` round-trip nor a
deployed `layer.json` 200 has been re-probed.
**RESUME STEP:** bake + run `terrain.verify.mjs --tileset` → promote to rung-100 on a clean round-trip.

### B3 — omgevingsplan / DSO zoning not wired (LEGISLATION + ENVELOPE)
NL zoning is national (omgevingsplan via DSO / `ruimtelijkeplannen.nl`, STOP/TPOD) but not probed or wired.
**RESUME STEP:** probe the DSO API for an Amsterdam parcel → confirm structured *functie* + *goothoogte*/
*bouwhoogte* attributes; sample N parcels to compute the LEGISLATION structured-fill; wire into `siteDispatch.ts`.

### B4 — PARCEL sample not run (Axis 1)
The Kadaster BRK provider is wired + live but no `computeParcelConfidence` sample has been drawn.
**RESUME STEP:** run `computeParcelConfidence` over an Amsterdam N-parcel sample → compute PARCEL Axis 1
(expected high — national Kadaster, `national-cadastre` authority rank).

---

## 2 — TRIP-WIRES

- **If the DSO returns structured height attributes** (goothoogte/bouwhoogte) → NL is a Lyon-style config
  integration, not a new engine KIND. Start the pack immediately.
- **If a parcel is under a transitional bestemmingsplan** (not yet migrated to the omgevingsplan) → the
  operative document differs; resolve the transitional-law precedence before shipping any value.
- **3DBAG is LoD2-mesh capable** (`b3_dak_type` roof geometry) — the next tier beyond LoD1 real-height; note
  for the mesh render path, do not conflate with the LoD1-now bake.

---

## 3 — SMALLEST NEXT STEP (0.5 dev-days)

Run two probes: (1) `computeParcelConfidence` over an Amsterdam sample → PARCEL number; (2) DSO /
`ruimtelijkeplannen.nl` GetFeature for an Amsterdam parcel → structured-attribute yes/no. Record in
`sources/SOURCES.md`.
