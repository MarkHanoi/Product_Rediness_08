# NEXT — Switzerland (`ch`)

> **Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED · **Status:** DORMANT — context-data spike
> only (`README.md`); the **legal/zoning layer (Nutzungsplanung) is not started**.

## 1 — WHERE WE STOPPED
Context-data spike only. No parcel/zoning legal work. Switzerland's law is **per-canton** (26
cantons; the ÖREB/RDPPF cadastre rollout is per-canton, some in 3.0β), so a region layer
(`ch-<subdiv>`, ISO 3166-2 e.g. `ch-zh` Zürich) will be needed once a municipality is worked.

## 2 — THE NUMBER
Zoning full-envelope resolution: **0% (not started).**

## 3 — BLOCKERS
### 3.1 — Legal/zoning layer not begun; per-canton fragmentation
- Zoning = municipal **Nutzungsplanung / Bau- und Zonenordnung**, surfaced via the **ÖREB/RDPPF
  cadastre** (cadastre of public-law restrictions) per canton. **RESUME STEP.** Run P1 for one pilot
  canton: does the ÖREB cadastre expose zone + degree-of-use (Ausnützungsziffer) as data, or only the
  legal-provision PDF? Classify each source per canton.
### 3.2 — Context endpoints unverified (per-canton 3.0β rollout — `README.md`).

## 4 — TRIP-WIRES
- **4.1 — An ÖREB/RDPPF cadastre reader** → reusable across every canton on the federal data model;
  Switzerland's structural advantage — verify before assuming.
- **4.2 — swisstopo swissBUILDINGS3D / swissSURFACE3D LiDAR** → national surveyed heights for the nDSM
  module and neighbour-height checks.

## 5 — WHAT IS ALREADY BUILT
- The context-data spike analysis (`README.md`).

## 6 — VERIFIED SOURCES
None live-probed yet — leads only.

## 7 — DEAD ENDS
- (none recorded yet)

## 8 — THE SMALLEST NEXT STEP
Query one canton's ÖREB cadastre at an address and check whether zone + Ausnützungsziffer come back as
data. Add `ch-<subdiv>/` + `<BFS>-<slug>/` only then.
