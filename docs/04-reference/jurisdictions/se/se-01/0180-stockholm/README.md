# Stockholm (`0180`) — Jurisdiction Pack

**Country:** `se` · **County (län):** Stockholms län (`se-01`, ISO SE-AB) · **Kommunkod:** `0180` ·
**Governing instrument:** detaljplan (municipal, PBL 2010:900) + översiktsplan ·
**Last updated:** 2026-07-30 · **Maintainer:** UNASSIGNED

---

## Pack status

| Dimension | Status | Gate condition |
|---|---|---|
| **Zoning identification** | RESEARCH ONLY — NGP/Planbestämmelsekatalog documented, geo-blocked from non-SE IPs, not live-probed | Live detaljplan probe from an SE IP → structured provision codes |
| **Parcel provider** | NOT WIRED — falls to OSM footprint fallback | `isInSweden` predicate + Lantmäteriet Fastighetsindelning wired in `parcelProviders/registry.ts` |
| **Context data (LOD1)** | BAKED — OSM context 5/9 layers (`bake.mjs` REGIONS `stockholm`) | — (assessed) |
| **Terrain** | CONFIGURED — `terrain.mjs` `stockholm` (source `se`), key-gated (`LANTMATERIET_API_KEY`) | `terrain.verify.mjs` round-trip + `layer.json` 200 |
| **Rule pack** | NOT STARTED | detaljplan provision-code decoding + a sourced pack |

**Overall status: NOT STARTED (bake-covered; legislation research at the national level only).**

---

## The Swedish mechanism (national context)

Sweden's binding land-use instrument is the municipal **detaljplan** (PBL 2010:900). Post-2022 plans are
authored against a national digital standard (**Planbestämmelsekatalog**) and published through the
**Nationella Geodataplattformen (NGP)** — a STAC/OAPIF stack — so a post-2022 plan can in principle return
zone use, a density metric, and height as structured provision codes. Pre-2022 plans (which dominate land
area) are scanned PDF/raster. This bimodality is the whole spread in the national rate
(`~40 %` optimistic post-2022 vs `~20–30 %` land-area-weighted — see [`../../RATE.md`](../../RATE.md)).

NGP is **geo-blocked from non-Swedish IPs**, so live probing needs an SE-resident proxy; nothing has been
live-probed for Stockholm specifically.

---

## Source hierarchy

| Data needed | Source | Confidence |
|---|---|---|
| Parcel geometry | Lantmäteriet Fastighetsindelning (national) | `documented` — NOT wired |
| Zone code + provisions | NGP / Planbestämmelsekatalog (post-2022 detaljplaner) | `documented` — geo-blocked, not probed |
| Building height nDSM | Lantmäteriet national LiDAR + CC0 footprints (`heightSources.mjs` `lidar_se`) | `documented` |
| Terrain DEM | Lantmäteriet Höjddata (`terrain.mjs` source `se`) | `documented` — free key (`LANTMATERIET_API_KEY`) |
| Context buildings/roads/… | OSM (`bake.mjs` REGIONS `stockholm`) | `live` (baked) |

---

**Related files:** `../../README.md` (country umbrella) · `../../RATE.md` (national legislation rate) ·
`RATE.md` (composite scorecard) · `LEGISLATION-RATE.md` · `NEXT.md` · `sources/SOURCES.md`
