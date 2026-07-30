# City RATE — master completion scorecard — Bern (ch-be, BFS 0351)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 — scorecard function not yet shipped (C63 §8); the three CHEAP axes (DATA-SOURCES · TERRAIN · CONTEXT) are cited-derived per C63 §8.1, every other axis is not-assessed with a typed C62 reason. NO cell is a fabricated number. -->

**Overall completion (numerically-assessed subset): `66%` · `partial: true`** — renormalised over the
numerically-assessed axes only (DATA-SOURCES · TERRAIN · CONTEXT). **PARCEL is now DERIVED/HIGH** (L-449
founder sign-off 2026-07-30 — AV survey-grade; qualitative, off `not-assessed` but not yet folded into the
numeric Overall). LEGISLATION · ENVELOPE · HEIGHTS/LOD stay honestly `not-assessed`, not 0 %
(C63 §1.2/§1.5). **`honestyOk: true`** (no fabricated
value; the national CH zoning pack REFUSES the envelope rather than borrow a number).

> **Weighting** `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4).

## The 7 axes (C63 §3 — fixed definitions)

| # | Axis | Weight | Score | Validation | Unknown reason | Derivation (which state was read) |
|---|---|---:|---|---|---|---|
| 1 | **PARCEL** | 15 % | **HIGH** (DERIVED, L-449) | `human-reviewed` | `—` | **L-449 founder sign-off 2026-07-30: swisstopo AV is authoritative, survey-grade cadastral data → PARCEL scores HIGH** (downgrade only for non-AV derivatives / generalized tiles / field-survey tasks; `../../sources/VERIFICATION.md`). National swisstopo **Amtliche Vermessung** cadastre IS wired (`parcelProviders/registry.ts` `isInSwitzerland`→`swisstopo-av`, keyless, all-canton via the federal `api3.geo.admin.ch` identify service). CH is cadastral (not footprint-fallback). The `computeParcelConfidence` run would refine the numeric distribution (C63 §8); the axis is **signed HIGH now** (qualitative — not folded into the numeric Overall until §8 assigns a %). |
| 2 | **LEGISLATION** | 25 % | `not-assessed` | `not-checked` | `pending-implementation` | **No city rule pack for Bern** — only the national zone-ID pack (`chZoning.ts`). ⚠ Canton BE is in the geodienste `ms:grundnutzung` **`incomplete`** cohort (BE, GR, SO, VS) — the national WFS coverage is PARTIAL for BE; zone identity leans on the ÖREB BE endpoint (among the 25/26 federal M2M URLs). The Baurecht/Nutzungsziffer + Gebäudehöhe are model+PDF-bound (canton BE BauG + the City Bauordnung), none transcribed or signed. Coarse national prior ~20–25 % (`../../RATE.md`), not the Axis-2 count. |
| 3 | **DATA-SOURCES** | 15 % | **80%** | `not-checked` | — | 5-slot checklist: cadastre-parcel **live** (swisstopo AV, keyless, all-canton) · regional-zone-GIS **documented** (⚠ national geodienste `ms:grundnutzung` is `incomplete` for canton BE → the `documented` (0.5) credit rests on the **ÖREB BE** endpoint, not the WFS; `siteDispatch.ts` wiring unconfirmed) · building-height nDSM **documented** (`heightSources.mjs` `swissbuildings3d`, `REGION_SOURCE` `bern`; keyless swisstopo nDSM via STAC, wiring is a BUILD §SWISS-NDSM-STAC-BUILD) · terrain DEM **live** (`terrain.mjs` `ch` = swissALTI3D STAC, keyless HTTP 200) · context-OSM **live** (`bake.mjs` REGIONS `bern`). Mean = (1.0+0.5+0.5+1.0+1.0)/5 = 0.8 (the BE-incomplete caveat does not drop the slot below `documented` — the ÖREB BE endpoint carries the zone-ID). |
| 4 | **ENVELOPE** | 20 % | `not-assessed` | `not-checked` | `pending-implementation` | No city buildable-envelope pack for Bern. The national `chZoning.ts` pack identifies the zone and returns a **cited REFUSAL** (`chZoningEnvelopeRefusal`) — 100 % honest (C63 §3.1) but 0 % complete. Unlike Zürich, BE has no transcribed FAR. See `ENVELOPE.md`. |
| 5 | **TERRAIN** | 10 % | **50%** | `not-checked` | — | Terrain row present: `terrain.mjs` REGIONS `bern` (source `ch` = swissALTI3D STAC, keyless HTTP 200; bbox `[7.40,46.93,7.48,46.99]`). Rung **50 = baked-but-unverified** — no `terrain.verify.mjs` round-trip nor deployed `layer.json` 200 independently re-probed in this audit. |
| 6 | **HEIGHTS/LOD** | 10 % | `not-assessed` | `not-checked` | `not-queried` | Measured-**CAPABLE**: swisstopo nDSM (swissSURFACE3D DSM − swissALTI3D DTM) keyless, STAC-live (`heightSources.mjs` `swissbuildings3d`, impl:`documented`; `REGION_SOURCE` `bern`). But the per-city bake has NOT landed and the wiring is a BUILD (§SWISS-NDSM-STAC-BUILD) — region keeps the honest OSM default. No provenance histogram probed. See `HEIGHT.md`. |
| 7 | **CONTEXT** | 5 % | **56%** | `not-checked` | — | Inside the `bern` context bake bbox (`bake.mjs` REGIONS `bern`). Confirmed long-shipped layers: buildings · roads · water · parks · landuse (**5/9**). rail + trees are config-added (`bake.mjs` LAYERS, L-642) but that re-bake is not-yet-landed → excluded (honest 0). pedestrian: not a baked layer. sea: landlocked — genuinely absent (the Aare rides the `water` layer), not fabricated. Score 5/9. |

## §CONTEXT-DATA-HONESTY note

DOES: terrain (swissALTI3D, rung-50) + national swisstopo AV cadastre routing (cadastral) + baked OSM context (5/9) + a national/cantonal zone-GIS (ÖREB BE; geodienste BE partial). REFUSES: a buildable envelope (no city FAR pack; national pack cites the missing density) — never a borrowed/invented number. PARCEL: **HIGH (DERIVED — L-449 signed 2026-07-30, AV survey-grade)**, no longer `not-queried`. UNKNOWN (typed): LEGISLATION + ENVELOPE (`pending-implementation`), HEIGHTS (`not-queried`, measured-capable via swisstopo nDSM). `honestyOk: true`.

## Dossier index (C63 §5)

This `RATE.md` is the composite master; the siblings FEED it (naming: `../../../_TEMPLATE/NAMING-CONVENTION.md`).

| File | About | Feeds axis |
|---|---|---|
| **`RATE.md`** (this) | 7-axis composite completion scorecard | — |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | structured legislation/data-fill rate (~20–25 % national prior; the BE-incomplete WFS caveat) | LEGISLATION |
| [`ENVELOPE.md`](./ENVELOPE.md) | buildable-envelope solver status (national cited-refusal) | ENVELOPE |
| [`HEIGHT.md`](./HEIGHT.md) | building-height provenance status (swisstopo nDSM measured-capable) | HEIGHTS/LOD |
| [`NEXT.md`](./NEXT.md) | where we stopped · blockers · resume steps | all |
| [`RISK-REGISTER.md`](./RISK-REGISTER.md) | honesty guardrails | — |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | phased climb to 100 % | all |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authority: [C63](../../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Composite scaffolded under audit L-649 Phase-1; both the composite `RATE.md` and the per-axis `LEGISLATION-RATE.md` are authored new this pass.*
