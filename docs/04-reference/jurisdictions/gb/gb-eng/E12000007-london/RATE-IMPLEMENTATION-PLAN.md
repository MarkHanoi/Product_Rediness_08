# Rate Implementation Plan — Greater London (`gb-E12000007`) city

**Current overall:** `51 % partial` (see [`RATE.md`](./RATE.md)) · **Current legislation rate:** `NOT YET
ASSESSED` (see [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md)) · **Realistic legislation ceiling:** LOW
(discretionary planning) · **Last updated:** 2026-07-30 · **Owner:** UNASSIGNED

## 1 — The ceiling

London's **completion** ceiling is driven by the cheap physical axes (terrain/context/height — each can reach
100 % per city via OGL-open EA/OSM data). Its **legislation/envelope** ceiling is structurally LOW: GB permission
is discretionary (London Plan + borough Local Plans + design review), so there is no by-right numeric envelope to
solve. Do not promise a Denmark-like legislation number — the numbers do not exist as data.

## 2 — Phase tracker

| Phase | Goal | Unlocks | From→to | Effort | Status |
|---|---|---|---|---|---|
| **0** | AUDIT — scaffold dossier, cite cheap axes | honest baseline (51 %) | — → 51 % | done | SHIPPED |
| **1** | Verify + bake London terrain (`terrain.verify.mjs`) | TERRAIN 50→100 | 51 → ~53 % | low | NOT STARTED |
| **2** | Wire EA DSM−DTM height stamp + re-bake | HEIGHTS not-assessed→measured; +10 % weight enters | ~53 → ~63 % | medium | NOT STARTED |
| **3** | Land rail/trees/sea context re-bake | CONTEXT 56→higher | small | low | NOT STARTED |
| **4** | Model Permitted Development Rights | LEGISLATION/ENVELOPE small (the only by-right slice) | small | medium | NOT STARTED |

## 3 — The gap to Denmark (~96%)

The numbers **do not exist as data** — discretionary planning grants permission case-by-case with no structured
density/height field. This is a harder ceiling than PDF-transcription jurisdictions (which at least have a written
numeric rule). London can be high on COMPLETION (physical axes) while staying honestly low on LEGISLATION/ENVELOPE.

## 4 — Dependencies, blockers, reuse

- **Reuse:** the EA DSM−DTM nDSM stamp = the SAME engine as DK (DHM) / ES (MDS) / NO/PT/IT — Phase 2 is a source swap.
- **Blocker:** EA LiDAR is England-only (irrelevant for London, relevant if GB expands).
- **Skip:** OS MasterMap + OS Building Heights (commercial).

---
*Model references: **France** `../../../fr/` (strong context, discretionary-ish rules) · **Denmark** `../../../dk/`
(structured ceiling). Governing: **C58**, **C63**, **L-449**.*
