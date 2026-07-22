# NEXT — Portugal (`pt`)

> Where Portugal stopped and how to resume. **Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED
> **Status:** DORMANT — a context-data spike exists (`README.md`); the **legal/zoning layer is not started**.

## 1 — WHERE WE STOPPED
Only the **3D-context-data** spike is done, and its endpoints are **NOT live-probed** (per founder
deep-dive — see `README.md` and `PORTUGAL-CONTEXT-DEEP-DIVE.md`). No parcel/zoning legal work: Portugal
is a **separate jurisdiction** (L-443) — PDM ≠ PGOU, different infrastructure (DGT/SNIG), needs its own
live-verification pass before any estimate.

## 2 — THE NUMBER
Zoning full-envelope resolution: **0% (not started).** Context-data coverage is per-layer /
per-municipality (parcels ~134 munis via Carta Cadastral; height single-source via DGT LiDAR nDSM).

## 3 — BLOCKERS
### 3.1 — Context endpoints are unverified
- Carta Cadastral / SNIC, DGT LiDAR, Lisbon CML 3D model, IP roads — all NOT PROBED.
- **RESUME STEP.** Live-probe each endpoint in `README.md`'s lead table before exiting Phase 1;
  verify the **Lisbon CML open-redistribution licence** before integrating it.
### 3.2 — Legal/zoning layer not begun
- **RESUME STEP.** Run P1 (legal structure) for PDM: is zoning municipal under a national framework?
  Where do the numbers live — PDM regulamento text or a queryable layer? Add `pt-<subdiv>/` +
  `<DICOFRE>-<slug>/` folders only when a municipality is actually worked.

## 4 — TRIP-WIRES
- **4.1 — A working nDSM height module** (built for ES/FR) → PT feeds the SAME module (L-511c/L-512b),
  different inputs; do not one-off it.
- **4.2 — A DICOFRE-keyed municipality register** → it is the join key for the pt municipality layer.

## 5 — WHAT IS ALREADY BUILT
- The context-data spike analysis (`PORTUGAL-CONTEXT-DEEP-DIVE.md`) + per-layer badging matrix.

## 6 — VERIFIED SOURCES
None live-probed yet. Leads only — see `README.md`.

## 7 — DEAD ENDS
- Assuming BUPi is a parcel source (it is not); assuming Lisbon/Porto city cores are Carta-Cadastral-covered.

## 8 — THE SMALLEST NEXT STEP
Live-probe DGT LiDAR + Carta Cadastral endpoints (context), OR run P1 legal-structure discovery for a
single pilot municipality (zoning) — whichever the roadmap prioritises.
