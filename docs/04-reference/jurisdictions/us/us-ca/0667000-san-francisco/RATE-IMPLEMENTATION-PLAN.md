# Rate Implementation Plan — San Francisco (`us-ca-0667000`) city

**Current overall:** `53 % partial` (see [`RATE.md`](./RATE.md)) · **Current legislation rate:** `NOT YET
ASSESSED` (see [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md)) · **Realistic legislation ceiling:** MODERATE (SF
publishes zoning + height-bulk, above the US free average) · **Last updated:** 2026-07-30 · **Owner:** UNASSIGNED

## 1 — The ceiling

SF's **completion** ceiling is driven by the cheap physical axes (terrain/context/height — each can reach 100 %
per city via 3DEP + OSM). Its **legislation/envelope** ceiling is MODERATE (higher than the ~12 % US free
average) because SF, as a consolidated city-county, publishes zoning + **height-and-bulk district** layers on
DataSF as machine-readable data — but the density-per-lot + Discretionary-Review + area-plan machinery caps a
clean parcel-level envelope. Do not promise a Denmark-like number.

## 2 — Phase tracker

| Phase | Goal | Unlocks | From→to | Effort | Status |
|---|---|---|---|---|---|
| **0** | AUDIT — scaffold dossier, cite cheap axes | honest baseline (53 %) | — → 53 % | done | SHIPPED |
| **1** | Verify + bake SF terrain (`terrain.verify.mjs`) | TERRAIN 50→100 | 53 → ~55 % | low | NOT STARTED |
| **2** | Wire Overture/3DEP nDSM height stamp + re-bake | HEIGHTS not-assessed→measured | ~55 → ~65 % | high | NOT STARTED |
| **3** | Wire DataSF zoning + height-bulk as zone source | LEGISLATION/ENVELOPE begins | — | medium | NOT STARTED |
| **4** | Build SF height/bulk envelope pack (+ L-449) | ENVELOPE certified/constructed | — | high | NOT STARTED |

## 3 — The gap to Denmark (~96%)

SF is closer than most US cities: (b) fragmentation is minimal (one city-county) and the numbers ARE published as
DataSF layers — but they are not yet sourced/wired/verified, and Discretionary Review + area plans make the base
envelope incomplete. The gap is engineering + the L-449 human gate, not the absence of data.

## 4 — Dependencies, blockers, reuse

- **Reuse:** the Overture/3DEP nDSM stamp is the US analogue of the FR LiDAR HD / DK DHM engine (Phase 2).
- **Blocker:** no national US cadastre — SF Assessor parcels are per-county (wire the SF layer specifically).
- **Reuse:** an SF height-and-bulk pack is a template for other CA charter cities that publish height districts.

---
*Model references: **Denmark** `../../../dk/` (structured ceiling) · **Barcelona**
`../../../es/es-ct/08019-barcelona/` (pilot climb). Governing: **C58**, **C63**, **L-449**.*
