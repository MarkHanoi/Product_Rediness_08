# United Kingdom (`gb`) — Jurisdiction Overview

**Level:** country · **ISO 3166-1:** `GB` · **Join key:** ONS GSS codes (E/S/W/N + 8 digits; see
`COUNTRY-RATE.md` §0) · **Subdivision law:** four constituent countries (England / Scotland / Wales /
Northern Ireland), each with its OWN planning system + its OWN geodata portals · **Last updated:** 2026-07-30 ·
**Maintainer:** UNASSIGNED · **Status:** SCAFFOLD — Phase-1 AUDIT only, no rule pack

> Country-level umbrella. City dossiers live under `gb/<gb-subdiv>/<GSS>-<slug>/`. No rule pack is implemented
> for any GB jurisdiction. This file records what the national data layer DOES / can achieve / lacks; the
> per-city cheap-axis derivation is in each city's `RATE.md`.

## 1 — What governs here (national structure)

**GB planning is DISCRETIONARY, not as-of-right.** There is **no codified numeric zoning envelope** (no FAR
table, no by-right height limit) equivalent to Spain's ordenanzas, Germany's BauNVO, or NYC's Zoning Resolution.
Development is decided case-by-case by the Local Planning Authority against a **Local Plan** (policy TEXT + a
Policies Map), material considerations, and the **National Planning Policy Framework (NPPF)**; appeals go to the
Planning Inspectorate. The consequence for a completion scorecard is structural: **the LEGISLATION + ENVELOPE
axes cannot be filled from a national numeric source** because no such source exists — a permitted envelope is an
outcome of discretion, not a lookup. (Permitted Development Rights are the narrow as-of-right exception.)

```
UK Parliament (Town and Country Planning Act 1990 + Levelling-up and Regeneration Act 2023)
  → constituent-country planning system (England NPPF; Scotland NPF4; Wales PPW; NI SPPS)
    → Local Planning Authority Local Plan (policy TEXT + Policies Map)  ← THE governing instrument
      → discretionary determination (material considerations, NPPF, s.106)  ← NOT a numeric rule
      → Permitted Development Rights (the narrow as-of-right slice)
    → Conservation Areas + Listed Buildings (Historic England / NRHW / HES / HED overlays)
```

## 2 — National data sources (the cheap axes)

| Layer | Source | Wired? | Licence | State |
|---|---|---|---|---|
| **Terrain DTM** | EA **LIDAR Composite DTM 1 m** (Environment Agency) WCS 2.0.1 | ✅ `terrain.mjs` `gb` | OGL v3 | `live` — HTTP 200 keyless, live-probed 2026-07-25 (England; Scotland/Wales/NI separate portals) |
| **Context OSM** | Geofabrik `greater-london` extract → PMTiles | ✅ `bake.mjs` REGIONS `london` | ODbL | `live` — buildings/roads/water/parks/landuse baked |
| **Building height** | EA **LIDAR Composite DSM 1 m** − DTM (derive) + OS Open Buildings / OSM footprints | ❌ not wired | OGL v3 | `documented` — derive path in `GEO-DATA-SOURCING-MASTER.md`; `heightSources.mjs` maps `london` → `no-source` (OS Building Heights is a **commercial** attribute, deliberately skipped) |
| **Parcel cadastre** | HM Land Registry INSPIRE Index Polygons (OGL, freehold **index** extents — NOT a legal parcel) / OS MasterMap (licensed) | ❌ not wired | mixed | `blocked/none` — no keyless national **parcel** cadastre → `parcelProviders/registry.ts` has no GB entry → footprint-fallback |
| **Zoning GIS** | none (discretionary planning; Local Plan Policies Maps are per-LPA, not a national numeric layer) | ❌ | — | `none` |

## 3 — Overlay / refusal risk

Conservation Areas (~10,000 in England), Listed Buildings (~400,000 UK-wide, Historic England / Cadw / HES / HED),
Article 4 Directions (remove Permitted Development), Green Belt, and flood zones (EA Flood Map) are all
**discretionary refusal overlays** — mandatory before any GB envelope could be shippable, and none is packed.

## 4 — Rate context

See `LEGISLATION-RATE.md` (national structured-fill = **NOT YET ASSESSED**; ceiling structurally low because the
numbers are discretionary, not published as fields) and `LOD-RATE.md` (physical-model / height LOD). The
completion roll-up is `COUNTRY-RATE.md`.

## 5 — Municipality coverage

GSS join key: `gb/<gb-subdiv>/<GSS>-<slug>/`. Tackled (bake-covered): **Greater London (`E12000007`, gb-eng)**.

## 6 — Files in this folder

`COUNTRY-RATE.md` (composite master) · `LEGISLATION-RATE.md` · `LOD-RATE.md` · `README.md` (this) ·
`COUNTRY-DATA-STRATEGY.md` · `RATE-IMPLEMENTATION-PLAN.md` · `NEXT.md` · `sources/` · `regions/` ·
`gb-eng/E12000007-london/` (city dossier).

## 7 — Open questions / unverified

- EA LIDAR Composite **DSM** 1 m GetCoverage route (the DSM sibling of the wired DTM) not yet live-probed — needed
  to confirm the DSM−DTM height derive is keyless end-to-end.
- HM Land Registry INSPIRE Index Polygons: OGL and downloadable, but they are **freehold index** extents, not
  cadastral parcels — whether they are usable as a `footprint-fallback`-plus routing source is unprobed.
- Scotland/Wales/NI terrain + footprint portals unmapped (England-only today).
