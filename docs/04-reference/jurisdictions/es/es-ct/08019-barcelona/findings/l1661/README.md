# L-1661 — RB Poblenou 10 (3634514DF3833D) "no zone": measured root cause

**Date:** 2026-08-21 · **Lane:** BCN1 · **Verdict:** the data EXISTS (founder was right). The
refusal was a ROUNDING artefact in the MUC WMS, not a source gap and not an outage.

## The measured chain (raw bodies in this directory)

1. **Parcel rings** — Catastro INSPIRE CP `GetParcel` (`ring-*.gml`): 3634514DF3833D and
   3634515DF3833D share an edge (same block 36345). Centroids (shoelace over the WGS84 ring):
   - 3634514: lat 41.3981329, lon 2.2054181
   - 3634515: lat 41.3982134, lon 2.2056443
2. **MUC WMS GetFeatureInfo at 3634514's centroid** (`muc-3634514-centroid.json`): **2 features**
   — clau **18** (Ordenació en volumetria específica, CODI_QUAL_MUC R4) AND **SX1** (Sistema
   viari: eixos estructurants — the Rambla del Poblenou), a city-wide MultiPolygon with 5,688 ring
   points. ⚠ **Coordinates are serialised to ~4 decimals (≈ 8–11 m).** Running the proxy's own
   `pointInRing` over both rounded geometries: **BOTH contain the centroid** →
   `selectContainingQualification` (one-container-or-refuse, L-480) returns null → the card's
   §L-663 "Temporarily unavailable" — the WRONG SENTENCE for what happened: the lookup returned
   the zone, twice-contained.
3. **Control** — same query at 3634515's centroid (`muc-3634515-centroid.json`): **1 feature**
   (clau 18) → resolves. That is the entire difference between the working parcel and the
   "unavailable" one: how the rounded road polygon happened to fall.
4. **Full-precision truth** — AMB `qualificacio_refos_3857` (server-side containment, no client
   PIP, `amb-l16-*.json` / `amb-l17-*.json`):
   - layer 16 `QU_Trames` at 3634514's centroid → **exactly 1 feature, `CLAU_URB='18'`** (no SX1).
   - layer 17 `OV_Trames` → **the SAME OV polygon (OBJECTID 26824) as the neighbour**:
     `PLANTES='B+4'`, `EXP='1992/002796'`, `CLAU=''` (genuinely empty attribute — why the OV log
     prints `clau=`; `CLAU_URB='18'` is populated).

## The fix (§MUC-AMB-DISAMBIGUATION, `server/jurisdiction/mucZoningProxy.js`)

When the WMS containment test is ambiguous, ask AMB `QU_Trames` (full precision) which clau
contains the point, and accept it ONLY if it matches exactly one of the MUC's own candidates —
corroboration, never introduction. Fail-closed five ways (see the section header). Result: RB
Poblenou 10 resolves clau 18 → flows down the SAME §BCN-CLAU18-OV path as its neighbour → the
SAME published volumetric ordering (B+4, 19.05 m table-exact) as its OWN determination — the
founder's demo fallback (L-1662, adopt the neighbour's height) is therefore VOID.

## Catastro built heights (L-1663, `bupart-*.gml`)

INSPIRE BU `GetBuildingPartByParcel`, `numberOfFloorsAboveGround` per part: both parcels carry
parts of 4/5/6 floors → **max 6 above ground** on each. Feeds the §CTX-HEIGHT-ADOPTION
`derived-levels` entries (real storey count × assumed 3.2 m) in
`apps/editor/src/ui/geospatial/contextHeightAdoptions.ts`.
