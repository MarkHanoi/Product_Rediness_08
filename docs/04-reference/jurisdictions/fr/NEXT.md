# NEXT — France (`fr`)

> **Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED · **Status:** DORMANT — context-data spike
> only (`README.md`); the **legal/zoning layer (PLU) is not started**.

## 1 — WHERE WE STOPPED
Context-data spike only: target LOD1 (real footprint + height) from **BD TOPO + LiDAR HD**; spike NOT
started/probed. No parcel/zoning legal work. Municipalities key on **INSEE**.

## 2 — THE NUMBER
Zoning full-envelope resolution: **0% (not started).**

## 3 — BLOCKERS
### 3.1 — Legal/zoning layer not begun
- French zoning is the **PLU/PLUi** (communal/intercommunal), published via the **GPU (Géoportail de
  l'Urbanisme)**. **RESUME STEP.** Run P1: confirm whether GPU exposes zone + règlement as data or as
  PDF règlement; classify each source `VERIFIED-LIVE` / `document` / `absent` before any estimate.
### 3.2 — Context endpoints unverified
- BD TOPO + LiDAR HD (IGN) NOT probed. **RESUME STEP.** Live-probe before exiting Phase 1.

## 4 — TRIP-WIRES
- **4.1 — The nDSM height module** (ES/PT) → FR feeds the SAME module (LiDAR HD), different inputs.
- **4.2 — An INSEE-keyed municipality register** → the join key for the fr municipality layer.

## 5 — WHAT IS ALREADY BUILT
- The context-data spike analysis (`README.md`).

## 6 — VERIFIED SOURCES
None live-probed yet — leads only (`README.md`).

## 7 — DEAD ENDS
- (none recorded yet)

## 8 — THE SMALLEST NEXT STEP
Probe the GPU for a single commune: does it return zone code + règlement text as data, or only a PDF?
That one answer sets the whole French curation cost. Add `fr-<subdiv>/` + `<INSEE>-<slug>/` only then.
