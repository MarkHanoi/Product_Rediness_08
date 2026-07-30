# City RATE — master completion scorecard — Jeddah (sa-02, JED)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 — scorecard function not yet shipped (C63 §8); the CHEAP axes (DATA-SOURCES · TERRAIN · CONTEXT) are cited-derived per C63 §8.1, every human-gated axis is not-assessed with a typed C62 reason. NO cell is a fabricated number. Saudi is nationally data-blocked (geo-fenced Balady cadastre + no open GEOSA DTM); the resulting LOW cheap-axis scores are CORRECT, not a failure. -->

**Overall completion (assessed subset): `19%` · `partial: true`** — renormalised over the ASSESSED
axes only (DATA-SOURCES · TERRAIN · CONTEXT); the missing axes (PARCEL · LEGISLATION · ENVELOPE ·
HEIGHTS/LOD) are honestly `not-assessed`, not 0 % (C63 §1.2/§1.5). **`honestyOk: true`** (no fabricated
value; the Al-Balad heritage parcels return a CORRECT refusal, not a blank).

> **Weighting** `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4).
> Arithmetic: (DATA-SOURCES 0.20×15 + TERRAIN 0.00×10 + CONTEXT 0.56×5) ÷ (15+10+5) = 5.78 ÷ 30 = **~19 %**.

## The 7 axes (C63 §3 — fixed definitions)

| # | Axis | Weight | Score | Validation | Unknown reason | Derivation (which state was read) |
|---|---|---:|---|---|---|---|
| 1 | **PARCEL** | 15 % | `not-assessed` | `not-checked` | `license-restriction` | Saudi provider registered (`parcelProviders/registry.ts` `isInSaudiArabia`) but **footprint-fallback** — Balady/U-Maps cadastre IP geo-fenced (L-606); a footprint is never a legal parcel (C57 §L-640). No `computeParcelConfidence` sample run for the Jeddah bbox. |
| 2 | **LEGISLATION** | 25 % | `not-assessed` | `not-checked` | `pending-implementation` | Jeddah reuses the national `saRiyadhDemo.ts` footprint pack (unchanged, own bbox) — **not registered, not signed** (`sources/VERIFICATION.md` unsigned). Adds the **Al-Balad UNESCO overlay** (a refusal surface, not held: JHD 651-building GIS not confirmed open). No clau audit. The `~53 %` in `LEGISLATION-RATE.md` is the structured-fill PRIOR, not this axis. |
| 3 | **DATA-SOURCES** | 15 % | **20%** | `not-checked` | — | 5-slot: cadastre-parcel **blocked** (Balady geo-fenced) · regional-zone-GIS **none** (no SA-02 instrument) · building-height nDSM **blocked** (`heightSources.mjs` `ml_sa` impl:`blocked`) · terrain DEM **blocked** (`terrain.mjs` source `sa` verdict `blocked`, no open GEOSA DTM) · context-OSM **live** (`bake.mjs` REGIONS `jeddah`, buildings via Overture). Mean = 1/5 = 0.20. |
| 4 | **ENVELOPE** | 20 % | `not-assessed` | `not-checked` | `pending-implementation` | National pack authored, unwired; solver coverage unmeasured (C58). Vertical is a field-level BOUNDED cited-null refusal (villa ≤14 m / apt ≤23 m; exact = Amanat Jeddah + Jeddah Development Authority, geo-fenced). Al-Balad parcels → correct heritage refusal (HONEST, C63 §3.1), not a fill. |
| 5 | **TERRAIN** | 10 % | **0%** | `not-checked` | — | `terrain.mjs` HAS a `jeddah` row (`source:'sa'`, bbox `39.10,21.45,39.28,21.62`) but it is **`blocked`** (`'SA — no open national DTM (GEOSA). Founder-gated.'`) → NO tileset baked → rung **0 = none**. A cited 0 (pipeline inspected, blocked), not `not-assessed`. |
| 6 | **HEIGHTS/LOD** | 10 % | `not-assessed` | `not-checked` | `license-restriction` | No measured height baked. `ml_sa` impl:`blocked` (Balady `NOOFFLOORS` geo-fenced, GLO-30 sanity DEM only). Overture height ~0 % in Saudi (ML footprints) → context renders 9 m `assumed`. No provenance histogram probed. |
| 7 | **CONTEXT** | 5 % | **56%** | `not-checked` | — | Inside the `jeddah` context bake bbox (`bake.mjs` REGIONS `jeddah`; buildings = **Overture** 2026-07-22.0, ~167,766 vs OSM 23,247 — 7.2×). Long-shipped layers: buildings · roads · water · parks · landuse (**5/9**). rail + trees config-added (L-642) but re-bake not-landed → excluded. pedestrian: not a baked layer. sea: Jeddah IS coastal (Red Sea) — sea CAN ride the water/coastline path, but it is NOT tile-probed in this audit → excluded (honest 0). Score 5/9 = 56 %. |

## §CONTEXT-DATA-HONESTY note

DOES: baked OSM/Overture context (5/9 layers, dense Overture buildings). REFUSES: an envelope (pack
unwired/unsigned) + the exact vertical (BOUNDED cited-null, ceiling cited) + Al-Balad heritage parcels
(correct conservation refusal) — never a borrowed/invented number. UNKNOWN (typed): PARCEL
(`license-restriction`), LEGISLATION + ENVELOPE (`pending-implementation`), HEIGHTS (`license-restriction`),
TERRAIN cited 0 (no open GEOSA DTM). **Failure ≠ empty** (L-606). `honestyOk: true`.

## Dossier index (C63 §5)

This `RATE.md` is the composite master; the siblings FEED it (naming: `../../../_TEMPLATE/NAMING-CONVENTION.md`).

| File | About | Feeds axis |
|---|---|---|
| **`RATE.md`** (this) | 7-axis composite completion scorecard | — |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | structured legislation/data-fill rate (~53 %; + Al-Balad refusal surface) | LEGISLATION |
| [`ENVELOPE.md`](./ENVELOPE.md) | buildable-envelope solver status | ENVELOPE |
| [`HEIGHT.md`](./HEIGHT.md) | building-height provenance status | HEIGHTS/LOD |
| [`README.md`](./README.md) | what governs here · pack status | all |
| [`NEXT.md`](./NEXT.md) | where we stopped · blockers · resume steps | all |
| [`RISK-REGISTER.md`](./RISK-REGISTER.md) | honesty guardrails | — |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | phased climb to 100 % | all |
| `sources/` | per-field citations + human sign-off (L-449 gate) | LEGISLATION · ENVELOPE |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authority: [C63](../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Scaffolded under audit L-649 Phase-1; axis state from `tools/context-bake/{bake,terrain,heightSources}.mjs` + `packages/site-parcel-data/src/parcelProviders/registry.ts`.*
