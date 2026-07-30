# City RATE — master completion scorecard — Riyadh (sa-01, RUH)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 — scorecard function not yet shipped (C63 §8); the CHEAP axes (DATA-SOURCES · TERRAIN · CONTEXT) are cited-derived per C63 §8.1, every human-gated axis is not-assessed with a typed C62 reason. NO cell is a fabricated number. Saudi is nationally data-blocked (geo-fenced Balady cadastre + no open GEOSA DTM); the resulting LOW cheap-axis scores are CORRECT, not a failure. -->

**Overall completion (assessed subset): `19%` · `partial: true`** — renormalised over the ASSESSED
axes only (DATA-SOURCES · TERRAIN · CONTEXT); the missing axes (PARCEL · LEGISLATION · ENVELOPE ·
HEIGHTS/LOD) are honestly `not-assessed`, not 0 % (C63 §1.2/§1.5). **`honestyOk: true`** (no fabricated
value; every unknown typed; the geo-fenced fields are scored reachable-in-principle-not-from-here, never absent).

> **Weighting** `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4).
> Arithmetic: (DATA-SOURCES 0.20×15 + TERRAIN 0.00×10 + CONTEXT 0.56×5) ÷ (15+10+5) = 5.78 ÷ 30 = **~19 %**.

## The 7 axes (C63 §3 — fixed definitions)

| # | Axis | Weight | Score | Validation | Unknown reason | Derivation (which state was read) |
|---|---|---:|---|---|---|---|
| 1 | **PARCEL** | 15 % | `not-assessed` | `not-checked` | `license-restriction` | A Saudi provider IS registered (`parcelProviders/registry.ts` `isInSaudiArabia`, `regionCode:'SA'`) but it is **footprint-fallback** — the authoritative Balady/U-Maps cadastre is IP geo-fenced (WAF-blocks non-SA IPs, L-606); a footprint is never a legal parcel (C57 §L-640, capped-low-by-construction). No `computeParcelConfidence` sample run. |
| 2 | **LEGISLATION** | 25 % | `not-assessed` | `not-checked` | `pending-implementation` | A national-footprint rule pack IS authored (`rulepacks/saRiyadhDemo.ts`, L-606: `sa-villa` 0.75 / `sa-apartment` 0.65 + `resolveSaudiSetbacks`) but is **NOT registered and NOT signed** (`sources/VERIFICATION.md` unsigned → `estimated-ruleset`); C63 Axis 2 needs the L-449 human sign-off + a clau audit. The `~54 %` in `LEGISLATION-RATE.md` is the structured-fill PRIOR, not this axis's verified score. |
| 3 | **DATA-SOURCES** | 15 % | **20%** | `not-checked` | — | 5-slot checklist: cadastre-parcel **blocked** (Balady geo-fenced, footprint-fallback only) · regional-zone-GIS **none** (no SA-01 regional zoning instrument, `sa-01/README.md`) · building-height nDSM **blocked** (`heightSources.mjs` `ml_sa` impl:`blocked`; Balady `NOOFFLOORS` geo-fenced, GLO-30 = sanity DEM only) · terrain DEM **blocked** (`terrain.mjs` source `sa` verdict `blocked`, GEOSA no open national DTM) · context-OSM **live** (`bake.mjs` REGIONS `riyadh`, buildings via Overture). Mean = 1/5 = 0.20. |
| 4 | **ENVELOPE** | 20 % | `not-assessed` | `not-checked` | `pending-implementation` | The `saRiyadhDemo.ts` pack is authored but unwired; solver coverage is unmeasured (C58). Height/floors are a field-level BOUNDED cited-null refusal (villa ≤14 m §5-1-5 cl.3 / apt ≤23 m §3-2) — an HONEST refusal, not a fill (C63 §3.1). No `packsByZone × buildable-land-share` measurement exists. |
| 5 | **TERRAIN** | 10 % | **0%** | `not-checked` | — | `terrain.mjs` HAS a `riyadh` row (`source:'sa'`, bbox `46.60,24.58,46.83,24.80`) but it is **`blocked`** (`'SA — no open national DTM (GEOSA). Founder-gated.'`) → NO quantized-mesh tileset is baked → rung **0 = none**. This is a cited 0 (the pipeline was inspected and produces no tileset by a cited blocker), not `not-assessed`. |
| 6 | **HEIGHTS/LOD** | 10 % | `not-assessed` | `not-checked` | `license-restriction` | No measured height baked. `heightSources.mjs` `ml_sa` impl:`blocked` — the national per-building source (Balady `NOOFFLOORS`) is geo-fenced (403), GLO-30 is a coarse DEM sanity layer only. Overture buildings carry ~0 % height in Saudi (ML footprints, `CONTEXT-BUILDING-SOURCE-EVALUATION.md`) → context renders the honest 9 m `assumed`. No provenance histogram probed. |
| 7 | **CONTEXT** | 5 % | **56%** | `not-checked` | — | Inside the `riyadh` context bake bbox (`bake.mjs` REGIONS `riyadh`; buildings = **Overture** 2026-07-22.0, ~299,918 footprints vs OSM 56,278 — 5.3×). Confirmed long-shipped layers: buildings · roads · water · parks · landuse (**5/9**). rail + trees are config-added (`bake.mjs`, L-642) but the re-bake is not-yet-landed → excluded (honest 0). pedestrian: not a baked layer. sea: Riyadh is INLAND (no coastline) → 0. Score 5/9 = 56 %. |

## §CONTEXT-DATA-HONESTY note

DOES: baked OSM/Overture context (5/9 layers, dense Overture buildings). REFUSES: an envelope (pack
authored but unwired/unsigned) + the exact vertical value (field-level BOUNDED refusal with the national
ceiling cited) — never a borrowed/invented number. UNKNOWN (typed): PARCEL quality (`license-restriction`
— Balady geo-fenced), LEGISLATION + ENVELOPE (`pending-implementation`), HEIGHTS (`license-restriction`),
TERRAIN cited 0 (no open GEOSA DTM). **Failure ≠ empty**: every geo-fenced field is reachable-in-principle,
not-reachable-from-here — scored so, never as absent (L-606). `honestyOk: true`.

## Dossier index (C63 §5)

This `RATE.md` is the composite master; the siblings FEED it (naming: `../../../_TEMPLATE/NAMING-CONVENTION.md`).

| File | About | Feeds axis |
|---|---|---|
| **`RATE.md`** (this) | 7-axis composite completion scorecard | — |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | structured legislation/data-fill rate (~54 %) — the authored MOMRAH footprint | LEGISLATION |
| [`ENVELOPE.md`](./ENVELOPE.md) | buildable-envelope solver status | ENVELOPE |
| [`HEIGHT.md`](./HEIGHT.md) | building-height provenance status | HEIGHTS/LOD |
| [`README.md`](./README.md) | what governs here · pack status · municipal-code choice | all |
| [`NEXT.md`](./NEXT.md) | where we stopped · blockers · TRIP-WIRES · resume steps | all |
| [`RISK-REGISTER.md`](./RISK-REGISTER.md) | honesty guardrails | — |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | phased climb to 100 % | all |
| `sources/` | per-field citations + human sign-off (L-449 gate) | LEGISLATION · ENVELOPE |
| `findings/` | L-606 Riyadh demo pack + geo-fence probes | — |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authority: [C63](../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Scaffolded under audit L-649 Phase-1; axis state from `tools/context-bake/{bake,terrain,heightSources}.mjs` + `packages/site-parcel-data/src/parcelProviders/registry.ts`.*
