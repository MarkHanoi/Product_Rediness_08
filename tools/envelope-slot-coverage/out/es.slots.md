# Spain — envelope slot coverage, MEASURED 2026-09-04

> Command: `npx tsx tools/envelope-slot-coverage/measureEs.ts` (OFFLINE — no network) · slots: setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage, permittedUse

> ⛔ **NOT AN UPPER BOUND — AND NOT A LOWER BOUND EITHER. It is a DIFFERENT QUANTITY, and the difference is COUNTED at the foot of this file rather than asserted here.** What is measured is SCALAR envelope-slot resolution FROM THE DATA LAYER ALONE (`resolveRegisteredJurisdictionAt` → `resolveZoneDisposition` → `isEnvelopePublicationAuthorised` → `computeBuildableEnvelope`). It runs BELOW what a user sees wherever a live provider supplies inputs beyond the zone code (Barcelona `13a`/`13b`: a *profunditat edificable* band this harness cannot construct, scored `shape-rule-unmeasured` and never `f1-gap`), and ABOVE it wherever the editor never reaches this layer at all — `apps/editor/src/ui/site/siteDispatch.ts` `applyZoning` is a hand-ordered `isInX(lat, lon)` bbox chain and only the Barcelona/AMB branches call `resolveZoneDisposition`. An earlier revision of this banner said “upper bound”; the independent witness falsified it on the first run. See this file's header.

### Frame `barcelona`

**Frame (the denominator, stated):** 400 REAL Catastro parcels drawn uniformly over barcelona's parcel population by tools/cold-start-probe (seed 20260802, measured 2026-08-02T09:14:39.292Z). Verdicts recomputed here from the SHIPPED registry + engine; the committed `cat` is used as evidence for `nonBuildable` ONLY (see header).

| class | n | share of answered points |
|---|---:|---:|
| `service-failure` (EXCLUDED from every denominator) | 0 | — |
| `no-plan-served` (source answered, nothing here) | 0 | 0.0 % |
| **F2** correct-null — the ordinance answers "no envelope" | 116 | 29.0 % |
| **F1** gap — governed + buildable, PRYZM serves no mechanism | 17 | 4.3 % |
| `shape-rule-unmeasured` — the pack answers with a SHAPE, not scalars (EXCLUDED from the slot denominator) | 171 | 42.8 % |
| `resolved` — at least one envelope slot resolved | 96 | 24.0 % |
| probed | 400 | |

**⭐ ENVELOPE SLOT COVERAGE = 35.7 %** — 323 slots resolved ÷ (8 × 113 answerable points).

Answerable = F1 + resolved. **F2 and `shape-rule-unmeasured` are excluded from this denominator by construction** — the first has no subject, the second has no scalar to fill.

| slot | resolved on n of 113 answerable |
|---|---:|
| `setback.front` | 24 |
| `setback.side` | 24 |
| `setback.rear` | 24 |
| `maxHeight` | 20 |
| `maxFloors` | 20 |
| `maxFAR` | 91 |
| `maxCoverage` | 24 |
| `permittedUse` | 96 |

**The F1 build queue, measured (top zones by point count):**

| zone (verbatim from the source) | n |
|---|---:|
| 22a | 6 |
| 20a | 5 |
| 15 | 2 |
| 17/7 | 2 |
| 12 | 1 |
| 13a | 1 |

### Frame `madrid`

**Frame (the denominator, stated):** 400 REAL Catastro parcels drawn uniformly over madrid's parcel population by tools/cold-start-probe (seed 20260802, measured 2026-08-02T09:17:08.331Z). Verdicts recomputed here from the SHIPPED registry + engine; the committed `cat` is used as evidence for `nonBuildable` ONLY (see header).

| class | n | share of answered points |
|---|---:|---:|
| `service-failure` (EXCLUDED from every denominator) | 0 | — |
| `no-plan-served` (source answered, nothing here) | 0 | 0.0 % |
| **F2** correct-null — the ordinance answers "no envelope" | 219 | 54.8 % |
| **F1** gap — governed + buildable, PRYZM serves no mechanism | 181 | 45.3 % |
| `shape-rule-unmeasured` — the pack answers with a SHAPE, not scalars (EXCLUDED from the slot denominator) | 0 | 0.0 % |
| `resolved` — at least one envelope slot resolved | 0 | 0.0 % |
| probed | 400 | |

**⭐ ENVELOPE SLOT COVERAGE = 0.0 %** — 0 slots resolved ÷ (8 × 181 answerable points).

Answerable = F1 + resolved. **F2 and `shape-rule-unmeasured` are excluded from this denominator by construction** — the first has no subject, the second has no scalar to fill.

| slot | resolved on n of 181 answerable |
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
| 4 | 82 |
| 1.3 | 20 |
| 8.4 | 17 |
| 1.1 | 12 |
| 8.3.a | 10 |
| 1.4 | 7 |
| 1.2 | 6 |
| 8.2.a | 6 |
| 7.1.a | 4 |
| 8.3.c | 3 |
| 1.6 | 3 |
| 9.5 | 2 |
| 8.1.a | 2 |
| 9.1 | 1 |
| 9.4.a | 1 |

### Frame `murcia`

**Frame (the denominator, stated):** 400 REAL Catastro parcels drawn uniformly over murcia's parcel population by tools/cold-start-probe (seed 20260802, measured 2026-08-02T09:22:56.775Z). Verdicts recomputed here from the SHIPPED registry + engine; the committed `cat` is used as evidence for `nonBuildable` ONLY (see header).

| class | n | share of answered points |
|---|---:|---:|
| `service-failure` (EXCLUDED from every denominator) | 0 | — |
| `no-plan-served` (source answered, nothing here) | 0 | 0.0 % |
| **F2** correct-null — the ordinance answers "no envelope" | 167 | 41.8 % |
| **F1** gap — governed + buildable, PRYZM serves no mechanism | 153 | 38.3 % |
| `shape-rule-unmeasured` — the pack answers with a SHAPE, not scalars (EXCLUDED from the slot denominator) | 0 | 0.0 % |
| `resolved` — at least one envelope slot resolved | 80 | 20.0 % |
| probed | 400 | |

**⭐ ENVELOPE SLOT COVERAGE = 27.6 %** — 514 slots resolved ÷ (8 × 233 answerable points).

Answerable = F1 + resolved. **F2 and `shape-rule-unmeasured` are excluded from this denominator by construction** — the first has no subject, the second has no scalar to fill.

| slot | resolved on n of 233 answerable |
|---|---:|
| `setback.front` | 80 |
| `setback.side` | 80 |
| `setback.rear` | 60 |
| `maxHeight` | 74 |
| `maxFloors` | 74 |
| `maxFAR` | 50 |
| `maxCoverage` | 16 |
| `permittedUse` | 80 |

**The F1 build queue, measured (top zones by point count):**

| zone (verbatim from the source) | n |
|---|---:|
| RM | 70 |
| RC | 35 |
| RX | 11 |
| RR | 9 |
| RJ | 8 |
| IP | 3 |
| UC | 3 |
| RU | 2 |
| RBA | 2 |
| MX | 2 |
| RD1 | 1 |
| RM-A | 1 |
| IC | 1 |
| RB-3 | 1 |
| TC | 1 |

### Frame `valencia`

**Frame (the denominator, stated):** 400 REAL Catastro parcels drawn uniformly over valencia's parcel population by tools/cold-start-probe (seed 20260802, measured 2026-08-02T09:24:58.018Z). Verdicts recomputed here from the SHIPPED registry + engine; the committed `cat` is used as evidence for `nonBuildable` ONLY (see header).

| class | n | share of answered points |
|---|---:|---:|
| `service-failure` (EXCLUDED from every denominator) | 0 | — |
| `no-plan-served` (source answered, nothing here) | 0 | 0.0 % |
| **F2** correct-null — the ordinance answers "no envelope" | 75 | 18.8 % |
| **F1** gap — governed + buildable, PRYZM serves no mechanism | 325 | 81.3 % |
| `shape-rule-unmeasured` — the pack answers with a SHAPE, not scalars (EXCLUDED from the slot denominator) | 0 | 0.0 % |
| `resolved` — at least one envelope slot resolved | 0 | 0.0 % |
| probed | 400 | |

**⭐ ENVELOPE SLOT COVERAGE = 0.0 %** — 0 slots resolved ÷ (8 × 325 answerable points).

Answerable = F1 + resolved. **F2 and `shape-rule-unmeasured` are excluded from this denominator by construction** — the first has no subject, the second has no scalar to fill.

| slot | resolved on n of 325 answerable |
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
| SU\|ENS\|PGOU | 126 |
| SU\|EDA\|PGOU | 43 |
| SU\|CHP\|PE2020 | 37 |
| SU\|CHP\|PE2070 | 31 |
| SU\|UFA\|PGOU | 22 |
| SU\|ENS\|PE1761 | 9 |
| SU\|CHP\|PGOU | 7 |
| SU\|CHP\|RI1265 | 4 |
| SU\|UFA\|RI1409 | 4 |
| SU\|ENS\|PE1653 | 4 |
| SU\|CHP2\|PE2013 | 3 |
| SU\|ENS\|MP2098A | 3 |
| SU\|UFA\|RI1464 | 2 |
| SU\|ENS\|PE1574 | 2 |
| SU\|IND\|PGOU | 2 |

### Frame `cordoba`

**Frame (the denominator, stated):** 400 REAL Catastro parcels drawn uniformly over cordoba's parcel population by tools/cold-start-probe (seed 20260802, measured 2026-08-02T09:24:59.431Z). Verdicts recomputed here from the SHIPPED registry + engine; the committed `cat` is used as evidence for `nonBuildable` ONLY (see header).

| class | n | share of answered points |
|---|---:|---:|
| `service-failure` (EXCLUDED from every denominator) | 0 | — |
| `no-plan-served` (source answered, nothing here) | 0 | 0.0 % |
| **F2** correct-null — the ordinance answers "no envelope" | 0 | 0.0 % |
| **F1** gap — governed + buildable, PRYZM serves no mechanism | 400 | 100.0 % |
| `shape-rule-unmeasured` — the pack answers with a SHAPE, not scalars (EXCLUDED from the slot denominator) | 0 | 0.0 % |
| `resolved` — at least one envelope slot resolved | 0 | 0.0 % |
| probed | 400 | |

**⭐ ENVELOPE SLOT COVERAGE = 0.0 %** — 0 slots resolved ÷ (8 × 400 answerable points).

Answerable = F1 + resolved. **F2 and `shape-rule-unmeasured` are excluded from this denominator by construction** — the first has no subject, the second has no scalar to fill.

| slot | resolved on n of 400 answerable |
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
| (unnamed zone) | 352 |
| http://visor.pgou.coacordoba.org/doc/ordenanzas/O_CTP1.pdf | 34 |
| http://visor.pgou.coacordoba.org/doc/ordenanzas/O_OA1.pdf | 7 |
| http://visor.pgou.coacordoba.org/doc/ordenanzas/O_MC2.pdf | 3 |
| http://visor.pgou.coacordoba.org/doc/ordenanzas/O_UAD1.pdf | 2 |
| http://visor.pgou.coacordoba.org/doc/ordenanzas/O_EP.pdf | 1 |
| http://visor.pgou.coacordoba.org/doc/ordenanzas/O_PTC.pdf | 1 |

### Frame `ALL`

**Frame (the denominator, stated):** every city above pooled — 2000 real Catastro parcels across 5 cities.

| class | n | share of answered points |
|---|---:|---:|
| `service-failure` (EXCLUDED from every denominator) | 0 | — |
| `no-plan-served` (source answered, nothing here) | 0 | 0.0 % |
| **F2** correct-null — the ordinance answers "no envelope" | 577 | 28.8 % |
| **F1** gap — governed + buildable, PRYZM serves no mechanism | 1076 | 53.8 % |
| `shape-rule-unmeasured` — the pack answers with a SHAPE, not scalars (EXCLUDED from the slot denominator) | 171 | 8.6 % |
| `resolved` — at least one envelope slot resolved | 176 | 8.8 % |
| probed | 2000 | |

**⭐ ENVELOPE SLOT COVERAGE = 8.4 %** — 837 slots resolved ÷ (8 × 1252 answerable points).

Answerable = F1 + resolved. **F2 and `shape-rule-unmeasured` are excluded from this denominator by construction** — the first has no subject, the second has no scalar to fill.

| slot | resolved on n of 1252 answerable |
|---|---:|
| `setback.front` | 104 |
| `setback.side` | 104 |
| `setback.rear` | 84 |
| `maxHeight` | 94 |
| `maxFloors` | 94 |
| `maxFAR` | 141 |
| `maxCoverage` | 40 |
| `permittedUse` | 176 |

**The F1 build queue, measured (top zones by point count):**

| zone (verbatim from the source) | n |
|---|---:|
| (unnamed zone) | 352 |
| SU\|ENS\|PGOU | 126 |
| 4 | 82 |
| RM | 70 |
| SU\|EDA\|PGOU | 43 |
| SU\|CHP\|PE2020 | 37 |
| RC | 35 |
| http://visor.pgou.coacordoba.org/doc/ordenanzas/O_CTP1.pdf | 34 |
| SU\|CHP\|PE2070 | 31 |
| SU\|UFA\|PGOU | 22 |
| 1.3 | 20 |
| 8.4 | 17 |
| 1.1 | 12 |
| RX | 11 |
| 8.3.a | 10 |

### Cross-check against the independent witness

The committed `cold-start-probe` category (`cat`) was computed by a different probe on a different date. Rows where its `envelope`/not-`envelope` verdict disagrees with this harness's `resolved`/not-`resolved`:

**279 of 2000 rows disagree.**

| disagreement | n |
|---|---:|
| barcelona: witness=envelope · ours=shape-rule-unmeasured | 167 |
| madrid: witness=envelope · ours=f1-gap | 48 |
| murcia: witness=refusal-delegated · ours=resolved | 28 |
| murcia: witness=envelope · ours=f1-gap | 24 |
| barcelona: witness=envelope · ours=f2-correct-null | 7 |
| barcelona: witness=no-pack · ours=resolved | 3 |
| barcelona: witness=envelope · ours=f1-gap | 2 |
