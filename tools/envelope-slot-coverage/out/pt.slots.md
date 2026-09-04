# Portugal — envelope slot coverage, MEASURED 2026-09-03

> Command: `npx tsx tools/envelope-slot-coverage/measurePt.ts --frame both --n 120 --seed 20260903`  · slots: setback.front, setback.side, setback.rear, maxHeight, maxFloors, maxFAR, maxCoverage, permittedUse

### Frame `land`

**Frame (the denominator, stated):** points drawn UNIFORMLY AT RANDOM over the shipped `PORTUGAL_BBOX` mainland routing constant. Answers "what does a random click on mainland Portugal get?" — sea and un-transcribed land are REAL outcomes here (`no-plan-served`), not failures.

| class | n | share of answered points |
|---|---:|---:|
| `service-failure` (EXCLUDED from every denominator) | 0 | — |
| `no-plan-served` (source answered, nothing here) | 64 | 53.3 % |
| **F2** correct-null — the ordinance answers "no envelope" | 53 | 44.2 % |
| **F1** gap — governed + buildable, PRYZM serves no mechanism | 3 | 2.5 % |
| `resolved` — at least one envelope slot resolved | 0 | 0.0 % |
| probed | 120 | |

**⭐ ENVELOPE SLOT COVERAGE = 0.0 %** — 0 slots resolved ÷ (8 × 3 answerable points).

Answerable = F1 + resolved. **F2 is excluded from this denominator by construction.**

| slot | resolved on n of 3 answerable |
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
| Solo urbano - Solo de urbanização programada - Zona de construção programada tipo II | 1 |
| Solo Urbanizado - Espaços Centrais - Baixa Densidade | 1 |
| Perímetro Urbano de Lagoiços | 1 |

### Frame `fabric`

**Frame (the denominator, stated):** points drawn by the proven two-stage sampler in `tools/city-completion/parcelSampleProbe.mjs` (equal-probability tile draw × footprint-area-proportional point draw ⇒ unbiased FOR AREA) over OSM NON-PUBLIC building footprints in Lisboa + Porto. An INDEPENDENT, conservative proxy for private buildable land — NOT the legal denominator (L-656).

| class | n | share of answered points |
|---|---:|---:|
| `service-failure` (EXCLUDED from every denominator) | 0 | — |
| `no-plan-served` (source answered, nothing here) | 0 | 0.0 % |
| **F2** correct-null — the ordinance answers "no envelope" | 16 | 13.3 % |
| **F1** gap — governed + buildable, PRYZM serves no mechanism | 104 | 86.7 % |
| `resolved` — at least one envelope slot resolved | 0 | 0.0 % |
| probed | 120 | |

**⭐ ENVELOPE SLOT COVERAGE = 0.0 %** — 0 slots resolved ÷ (8 × 104 answerable points).

Answerable = F1 + resolved. **F2 is excluded from this denominator by construction.**

| slot | resolved on n of 104 answerable |
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
| Solo Urbano - Espaço Central e Habitacional - Traçado Urbano A Consolidado | 16 |
| Solo Urbano  – Espaços centrais – Área de frente urbana contínua tipo II | 15 |
| Solo Urbano - Espaço Central e Habitacional - Traçado Urbano B Consolidado | 12 |
| Solo Urbano  – Espaços centrais –  Área de frente urbana contínua tipo I | 8 |
| Solo Urbano  – Espaços centrais – Área de edifícios de tipo moradia | 7 |
| Solo Urbano - Espaços Centrais | 7 |
| Espaço urbano | 5 |
| Solo Urbano - Espaço Central e Habitacional - Traçado Urbano C Consolidado | 5 |
| Solo Urbano  – Espaços centrais – Área de blocos isolados de implantação livre | 5 |
| Solo Urbano - Espaço de Actividades Económicas Consolidado | 4 |
| Solo Urbano - Solo Urbanizado - Espaços Residenciais - Tipo I | 4 |
| Solo Urbano - Solo Urbanizado - Espaços Residenciais - Tipo II | 3 |
| Área Urbanizada Consolidada de Tipologia de Moradia | 3 |
| Solo Urbano - Espaço Central e Habitacional a Consolidar | 2 |
| Solo Urbano - Espaço Central e Habitacional - Traçado Urbano D Consolidado | 2 |

