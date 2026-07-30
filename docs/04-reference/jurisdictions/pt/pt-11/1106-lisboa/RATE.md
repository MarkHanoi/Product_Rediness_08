# City RATE — master completion scorecard — Lisboa (pt-11, 1106)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 — scorecard function not yet shipped (C63 §8); the CHEAP axes (DATA-SOURCES · CONTEXT) are cited-derived per C63 §8.1, every other axis is not-assessed with a typed C62 reason. NO cell is a fabricated number. -->

**Overall completion (assessed subset): `36%` · `partial: true`** — renormalised over the ASSESSED
axes only (DATA-SOURCES · CONTEXT); the missing axes (PARCEL · LEGISLATION · ENVELOPE · TERRAIN ·
HEIGHTS/LOD) are honestly `not-assessed`, not 0 % (C63 §1.2/§1.5). **`honestyOk: true`** (no fabricated
value; every unknown typed).

> **Weighting** `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4). Assessed subset here =
> DATA-SOURCES (15) + CONTEXT (5) = 20; overall = (0.30·15 + 0.556·5) / 20 = **36 %**.

## The 7 axes (C63 §3 — fixed definitions)

| # | Axis | Weight | Score | Validation | Unknown reason | Derivation (which state was read) |
|---|---|---:|---|---|---|---|
| 1 | **PARCEL** | 15 % | `not-assessed` | `not-checked` | `not-queried` | **No PT parcel provider is wired** — `parcelProviders/registry.ts` routes only ES/FR/NL/NO/DE/NRW/CH/DK/SA (no `isInPortugal`). The national Carta Cadastral (DGT) **does not cover the Lisboa urban core** (`heightSources.mjs` `dgt_pt` note: "weak parcels … NOT Lisbon/Porto cores"; legacy `LEGISLATION-RATE.md` Layer 1). No `computeParcelConfidence` sample drawn (C57 §2.4). |
| 2 | **LEGISLATION** | 25 % | `not-assessed` | `not-checked` | `pending-implementation` | No rule pack for Lisboa (`rulepacks/registry.ts` is ES-only); no clau audit; no signed `sources/VERIFICATION.md`. PDM Lisboa numeric values (índice, altura da edificação, afastamentos) are **PDF-only** → legacy structured-fill ≈ **~0 %** (`LEGISLATION-RATE.md`). Inventing legal parameters is forbidden (§CONTEXT-DATA-HONESTY). |
| 3 | **DATA-SOURCES** | 15 % | **30%** | `not-checked` | — | 5-slot checklist: cadastre-parcel **none** (not wired; Carta Cadastral misses the core) · regional-zone-GIS **none** (SNIT PDM zone WFS not wired) · building-height nDSM **documented** (`heightSources.mjs` `dgt_pt` = DGT national LiDAR nDSM, impl:`documented`, provenance `tagged`; unbaked) · terrain DEM **blocked** (`terrain.mjs` `pt` — no open national bare-earth DTM, verdict `blocked`) · context-OSM **live** (`bake.mjs` REGIONS `lisbon`). Mean = (0+0+0.5+0+1.0)/5 = **0.30**. |
| 4 | **ENVELOPE** | 20 % | `not-assessed` | `not-checked` | `pending-implementation` | No buildable-envelope rule pack registered (`rulepacks/registry.ts` ES-only); solver coverage unmeasured (C58). Lisboa additionally needs a C58 `transferableRights` overlay for *créditos de construção* before a pack can be complete (`LEGISLATION-RATE.md` Layer 3). |
| 5 | **TERRAIN** | 10 % | `not-assessed` | `not-checked` | `license-restriction` | `terrain.mjs` cities list HAS a `lisbon` row (`source:'pt'`) but it is flagged **`blocked: 'PT — no open national bare-earth DTM (DGT)'`**; the `pt` source verdict is `blocked` (DGT publishes cartography but no open national high-res bare-earth DTM; only Copernicus GLO-30 DSM, not commercial-cleared). No tileset can be baked → honestly `not-assessed`, **not** rung-0 (§1.2). |
| 6 | **HEIGHTS/LOD** | 10 % | `not-assessed` | `not-checked` | `not-queried` | No measured height baked; context buildings render OSM/assumed (9 m). `dgt_pt` DGT LiDAR nDSM (impl:`documented`, provenance `tagged`, "~75 %" real height) is **capable** via an Overture/OSM footprint join but **unbaked** — no per-city provenance histogram probed. Capability ≠ measurement. |
| 7 | **CONTEXT** | 5 % | **56%** | `not-checked` | — | Inside the `lisbon` city-clip bake (`bake.mjs` REGIONS `lisbon`, bbox `-9.23,38.68,-9.08,38.80`). Long-shipped layers: buildings · roads · water · parks · landuse (**5/9**). rail + trees are config-added (`bake.mjs` LAYERS, L-642) but not yet re-baked → excluded (honest 0). pedestrian: not a baked layer. sea: coastal (Tagus estuary) via water/coastline, not tile-probed here → excluded. Score 5/9 = **56 %**. |

## §CONTEXT-DATA-HONESTY note

DOES: baked OSM context (5/9 layers) + a documented (unbaked) national LiDAR height source. REFUSES: an
envelope (no rule pack), a parcel (no PT provider wired + cadastre misses the core), and terrain (national
DTM blocked) — never a borrowed/invented number. UNKNOWN (typed): PARCEL (`not-queried`), LEGISLATION +
ENVELOPE (`pending-implementation`), TERRAIN (`license-restriction`), HEIGHTS (`not-queried`).
`honestyOk: true`.

## Dossier index (C63 §5)

This `RATE.md` is the composite master; the siblings FEED it (naming: `../../../_TEMPLATE/NAMING-CONVENTION.md`).

| File | About | Feeds axis |
|---|---|---|
| **`RATE.md`** (this) | 7-axis composite completion scorecard | — |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | structured legislation/data-fill rate (was legacy `RATE.md`; renamed L-649) | LEGISLATION |
| [`ENVELOPE.md`](./ENVELOPE.md) | buildable-envelope solver status | ENVELOPE |
| [`HEIGHT.md`](./HEIGHT.md) | building-height provenance status | HEIGHTS/LOD |
| [`README.md`](./README.md) | what governs here · instrument chain · open questions | all |
| [`NEXT.md`](./NEXT.md) | where we stopped · blockers · resume steps | all |
| [`RISK-REGISTER.md`](./RISK-REGISTER.md) | honesty guardrails | — |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | phased climb to 100 % | all |
| `sources/` | per-field citations + human sign-off (L-449 gate) | LEGISLATION · ENVELOPE |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authority: [C63](../../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Scaffolded under audit L-649 Phase-1.*
