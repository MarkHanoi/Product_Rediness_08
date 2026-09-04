# Canarias — TELDE (INE 35026) envelope slot coverage on REAL parcels, MEASURED 2026-09-04

> Command: `npx tsx tools/envelope-slot-coverage/measureCanarias.ts --n 40 --seed 20260904` (ONLINE — Catastro INSPIRE CP ATOM; the zone layer and the pack are OFFLINE and committed)

> ⛔⛔ **THIS IS TELDE, AND TELDE IS THE CEILING.** Canarias has **88 municipalities**; exactly **ONE** has a transcribed pack. 41 are routable-but-unpacked, and the rest are blocked by `CANARIAS_MULTI_INSTRUMENT_BLOCKER`: *MULTI-INSTRUMENT, NO VIGENCIA SOURCE — this municipality publishes more than one municipality-wide base instrument on opendata.sitcan.es, and Canarias publishes no currency/validity field in ANY SIPU …* Multiplying Telde's figure by 88 is the error "measure parcels, not datasets" exists to prevent, one level up.

> ⛔ **NOTHING IS SIGNED.** `CANARIAS_ENVELOPE_VERIFIED` = **false** ⇒ **AS SHIPPED, 0 numbers reach a user as a determination**; every pack answer is F1. The IF-SIGNED arm below demonstrates what an L-449 signature would open — it is not an authorisation and not a request for one.

**Frame:** 40 REAL Catastro parcels drawn UNIFORMLY WITHOUT REPLACEMENT (seed 20260904) over TELDE's FULL INSPIRE CP parcel population of 35324; each centroid resolved through the SHIPPED offline `resolveTeldeZoneFromRecords` over the committed EDIF extract (2643 rings), then through `ES_TELDE_PGO2003_PACK` + `computeBuildableEnvelope` on a neutral 40 m square ring.

## Zone resolution over the drawn parcels

| outcome | n | of |
|---|---:|---:|
| centroid landed in an EDIF zone polygon | 20 | 40 |
| … in a PACKED zone (15 of Telde's 46 EDIF codes are packed) | 15 | 40 |
| … in a GRF (drawn building line) zone — refuses on LEGAL terms, and keeps refusing after any signature | 0 | 40 |
| … in an UNPACKED, non-GRF zone — a PRYZM coverage gap | 5 | 40 |
| no EDIF polygon at the centroid (the layer's own served zero — NOT a gap) | 20 | 40 |
| `data-unavailable` (a SERVICE FAILURE — excluded from every denominator) | 0 | 40 |

**Distinct zone codes seen:** `A2` · `A3` · `B1` · `B2` · `E` · `F` · `G` · `H` · `R2`

## ⭐ The founder's 14 SIPU fields, ON REAL PARCELS

> The cross-map (`ES-SIPU-PARAMETER-CROSSMAP.md` §2) answered *"does the mapping hold?"* against the 135-table CENSUS: **6 of 14 map exactly onto a C58 seat, 6 have no seat anywhere, 1 is ambiguous, 1 is lossy.** This table answers it against PARCELS — of the parcels that landed in a PACKED zone, how many have a VALUE in that seat. ⛔ A mapping that holds on a schema and fills nothing on the ground is not a shortcut.

| SIPU field | C58 seat | filled on n of 15 packed parcels | note |
|---|---|---:|---|
| `SupMin` | **none** | — (no seat to fill) | superficie mínima de parcela — NO SEAT in ZoningRule |
| `LongMin` | **none** | — (no seat to fill) | longitud mínima de fachada — NO SEAT |
| `CircInsc` | **none** | — (no seat to fill) | círculo inscribible — NO SEAT, no rival anywhere |
| `SepMinFr` | `setbacks.front_m` | 15 | EXACT |
| `SepMinPs` | `setbacks.rear_m` | 14 | EXACT |
| `SepMinLt` | `setbacks.side_m` | 14 | EXACT (⚠ A3 per-edge classification has no seat, so sides are not differentiated) |
| `FondoMax` | **none** | — (no seat to fill) | AMBIGUOUS — and 1 non-sentinel cell in 8,415 rows, and that cell is the string "IDEM" |
| `SepMnVol` | **none** | — (no seat to fill) | NO SEAT (RUS family) |
| `PMaxOcup` | `maxCoverage` | 13 | EXACT |
| `SupOcMax` | **none** | — (no seat to fill) | NO SEAT (RUS family) |
| `EdifMax` | `plotRatioFAR` | 15 | EXACT |
| `SupEdMax` | **none** | — (no seat to fill) | NO SEAT |
| `AltMaxPl` | `maxFloors` | 15 | EXACT |
| `AltMaxMt` | `maxHeight_m` | 15 | LOSSY — AltMaxMt states NO DATUM; 45/8,719 = 0.5 % valid corpus-wide, and 0/73 EDIF tables carry it at all |

## Slot-coverage frames (the shared classifier — `slots.ts`)

### TELDE · AS SHIPPED (gate SHUT)

**Frame (the denominator, stated):** 40 REAL Catastro parcels drawn UNIFORMLY WITHOUT REPLACEMENT (seed 20260904) over TELDE's FULL INSPIRE CP parcel population of 35324; each centroid resolved through the SHIPPED offline `resolveTeldeZoneFromRecords` over the committed EDIF extract (2643 rings), then through `ES_TELDE_PGO2003_PACK` + `computeBuildableEnvelope` on a neutral 40 m square ring. Gate SHUT — the shipped state.

| class | n | share of answered points |
|---|---:|---:|
| `service-failure` (EXCLUDED from every denominator) | 0 | — |
| `no-plan-served` (source answered, nothing here) | 20 | 50.0 % |
| **F2** correct-null — the ordinance answers "no envelope" | 0 | 0.0 % |
| **F1** gap — governed + buildable, PRYZM serves no mechanism | 20 | 50.0 % |
| `shape-rule-unmeasured` — the pack answers with a SHAPE, not scalars (EXCLUDED from the slot denominator) | 0 | 0.0 % |
| `resolved` — at least one envelope slot resolved | 0 | 0.0 % |
| probed | 40 | |

**⭐ ENVELOPE SLOT COVERAGE = 0.0 %** — 0 slots resolved ÷ (8 × 20 answerable points).

Answerable = F1 + resolved. **F2 and `shape-rule-unmeasured` are excluded from this denominator by construction** — the first has no subject, the second has no scalar to fill.

| slot | resolved on n of 20 answerable |
|---|---:|
| `setback.front` | 0 |
| `setback.side` | 0 |
| `setback.rear` | 0 |
| `maxHeight` | 0 |
| `maxFloors` | 0 |
| `maxFAR` | 0 |
| `maxCoverage` | 0 |
| `permittedUse` | 0 |

**The F1 build queue, measured (top zones by point count):**

| zone (verbatim from the source) | n |
|---|---:|
| B1 | 7 |
| E | 3 |
| A2 | 3 |
| B2 | 2 |
| F | 1 |
| R2 | 1 |
| H | 1 |
| A3 | 1 |
| G | 1 |

### TELDE · IF SIGNED (demonstration)

**Frame (the denominator, stated):** 40 REAL Catastro parcels drawn UNIFORMLY WITHOUT REPLACEMENT (seed 20260904) over TELDE's FULL INSPIRE CP parcel population of 35324; each centroid resolved through the SHIPPED offline `resolveTeldeZoneFromRecords` over the committed EDIF extract (2643 rings), then through `ES_TELDE_PGO2003_PACK` + `computeBuildableEnvelope` on a neutral 40 m square ring. Gate treated as OPEN — a demonstration of what an L-449 signature would open, not an authorisation.

| class | n | share of answered points |
|---|---:|---:|
| `service-failure` (EXCLUDED from every denominator) | 0 | — |
| `no-plan-served` (source answered, nothing here) | 20 | 50.0 % |
| **F2** correct-null — the ordinance answers "no envelope" | 0 | 0.0 % |
| **F1** gap — governed + buildable, PRYZM serves no mechanism | 5 | 12.5 % |
| `shape-rule-unmeasured` — the pack answers with a SHAPE, not scalars (EXCLUDED from the slot denominator) | 0 | 0.0 % |
| `resolved` — at least one envelope slot resolved | 15 | 37.5 % |
| probed | 40 | |

**⭐ ENVELOPE SLOT COVERAGE = 72.5 %** — 116 slots resolved ÷ (8 × 20 answerable points).

Answerable = F1 + resolved. **F2 and `shape-rule-unmeasured` are excluded from this denominator by construction** — the first has no subject, the second has no scalar to fill.

| slot | resolved on n of 20 answerable |
|---|---:|
| `setback.front` | 15 |
| `setback.side` | 14 |
| `setback.rear` | 14 |
| `maxHeight` | 15 |
| `maxFloors` | 15 |
| `maxFAR` | 15 |
| `maxCoverage` | 13 |
| `permittedUse` | 15 |

**The F1 build queue, measured (top zones by point count):**

| zone (verbatim from the source) | n |
|---|---:|
| A2 | 3 |
| R2 | 1 |
| A3 | 1 |

## Per parcel

| # | ref | zone | packed | AS SHIPPED | IF SIGNED |
|---:|---|---|:-:|---|---|
| 1 | 35026A01000004 | — |  | no-plan-served | no-plan-served |
| 2 | 1863110DS6916S | B1 | ✓ | f1-gap | resolved [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage, permittedUse] |
| 3 | 3281300DR6938S | F | ✓ | f1-gap | resolved [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage, permittedUse] |
| 4 | 9830706DR5998S | — |  | no-plan-served | no-plan-served |
| 5 | 3262633DR6936S | E | ✓ | f1-gap | resolved [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage, permittedUse] |
| 6 | 35026A02000667 | — |  | no-plan-served | no-plan-served |
| 7 | 4953312DS5945S | A2 |  | f1-gap | f1-gap |
| 8 | 35026A01700448 | — |  | no-plan-served | no-plan-served |
| 9 | 1888413DS6918N | B1 | ✓ | f1-gap | resolved [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage, permittedUse] |
| 10 | 35026A01901389 | — |  | no-plan-served | no-plan-served |
| 11 | 1454904DS6915S | B1 | ✓ | f1-gap | resolved [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage, permittedUse] |
| 12 | 2487806DS6928N | E | ✓ | f1-gap | resolved [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage, permittedUse] |
| 13 | 35026A01600787 | — |  | no-plan-served | no-plan-served |
| 14 | 2436803DR5923N | R2 |  | f1-gap | f1-gap |
| 15 | 35026A01300011 | — |  | no-plan-served | no-plan-served |
| 16 | 1386540DS6918N | B2 | ✓ | f1-gap | resolved [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage, permittedUse] |
| 17 | 2546332DS6924N | H | ✓ | f1-gap | resolved [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, permittedUse] |
| 18 | 0798406DS6906N | B1 | ✓ | f1-gap | resolved [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage, permittedUse] |
| 19 | 9372704DS5997S | A3 |  | f1-gap | f1-gap |
| 20 | 35026A01400216 | — |  | no-plan-served | no-plan-served |
| 21 | 35026A02200542 | — |  | no-plan-served | no-plan-served |
| 22 | 9367426DS5996N | B1 | ✓ | f1-gap | resolved [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage, permittedUse] |
| 23 | 35026A02300924 | — |  | no-plan-served | no-plan-served |
| 24 | 1384603DS6918N | B1 | ✓ | f1-gap | resolved [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage, permittedUse] |
| 25 | 8908603DS5080N | A2 |  | f1-gap | f1-gap |
| 26 | 2073711DS6927S | B1 | ✓ | f1-gap | resolved [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage, permittedUse] |
| 27 | 002001600DS59H | A2 |  | f1-gap | f1-gap |
| 28 | 7766904DR5976N | G | ✓ | f1-gap | resolved [setback.front, maxHeight, maxFloors, maxFAR, permittedUse] |
| 29 | 1790306DS6910S | B2 | ✓ | f1-gap | resolved [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage, permittedUse] |
| 30 | 35026A01400148 | — |  | no-plan-served | no-plan-served |
| 31 | 35026A01901938 | — |  | no-plan-served | no-plan-served |
| 32 | 35026A01901310 | — |  | no-plan-served | no-plan-served |
| 33 | 35026A01800793 | — |  | no-plan-served | no-plan-served |
| 34 | 35026A01800532 | — |  | no-plan-served | no-plan-served |
| 35 | 1976631DR6917N | E | ✓ | f1-gap | resolved [setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage, permittedUse] |
| 36 | 35026A01500429 | — |  | no-plan-served | no-plan-served |
| 37 | 35026A01901270 | — |  | no-plan-served | no-plan-served |
| 38 | 35026A02001016 | — |  | no-plan-served | no-plan-served |
| 39 | 35026A01601007 | — |  | no-plan-served | no-plan-served |
| 40 | 35026A01300029 | — |  | no-plan-served | no-plan-served |

> Wall time 1 s.
