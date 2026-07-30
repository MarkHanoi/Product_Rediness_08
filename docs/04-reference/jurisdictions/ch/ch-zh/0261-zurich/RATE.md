# City RATE — master completion scorecard — Zürich (ch-zh, BFS 0261)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 — scorecard function not yet shipped (C63 §8); the three CHEAP axes (DATA-SOURCES · TERRAIN · CONTEXT) are cited-derived per C63 §8.1, every other axis is not-assessed with a typed C62 reason. NO cell is a fabricated number. -->

**Overall completion (assessed subset): `66%` · `partial: true`** — renormalised over the ASSESSED
axes only (DATA-SOURCES · TERRAIN · CONTEXT); the missing axes (PARCEL · LEGISLATION · ENVELOPE ·
HEIGHTS/LOD) are honestly `not-assessed`, not 0 % (C63 §1.2/§1.5). **`honestyOk: true`** (no fabricated
value; every unknown typed; the BZO envelope path REFUSES `regime-ambiguous` rather than guess a height).

> **Weighting** `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4).

## The 7 axes (C63 §3 — fixed definitions)

| # | Axis | Weight | Score | Validation | Unknown reason | Derivation (which state was read) |
|---|---|---:|---|---|---|---|
| 1 | **PARCEL** | 15 % | `not-assessed` | `not-checked` | `not-queried` | National swisstopo **Amtliche Vermessung** cadastre IS wired (`parcelProviders/registry.ts` `isInSwitzerland`→`swisstopo-av`, `api3.geo.admin.ch` identify `ch.kantone.cadastralwebmap-farbe` → real Grundstück with `egris_egrid` + local number + canton, keyless, all-canton, ZH+GE live-verified 2026-07-26). The cantonal ZH WFS `maps.zh.ch/wfs/AVZHWFS` `liegenschaften_f` returns a real 184-vertex parcel ring (`AA5070`, EGRID `CH349199778779`, 750 m², `bfsnr 261`; `findings/ZURICH-BZO-PROBE.md` §1). CH is **cadastral-capable** (not footprint-fallback). But Axis 1 measures the parcel-quality distribution over an N-parcel sample and **no `computeParcelConfidence` run has been executed** for this bbox (C63 §8). |
| 2 | **LEGISLATION** | 25 % | `not-assessed` | `not-checked` | `not-queried` | A **rule pack EXISTS** for Zürich (`rulepacks/chZurichBzo.ts` + `providers/chZurichBzoCatalogue.ts`): the BZO 700.100 Ausnützungsziffer / Vollgeschosse / Gebäudehöhe table transcribed for BOTH regimes (91/99 + 2016), registered as canton `ZH` in `CH_CANTON_FAR_CATALOGUES`. `sources/VERIFICATION.md` records a 2026-07-26 repo-owner sign-off flipping `CH_FAR_CERTIFIED` ON at `estimated-ruleset`. ⚠ **BUT the same file's per-parcel "Zürich BZO sign-off" line remains UNSIGNED with open items (a) docid→regime crosswalk populated-but-not-human-CONFIRMED, (b) exact source-PDF URLs NOT CONFIRMED — an internal contradiction** (RISK R3). Because (1) the C63 scorecard has NOT computed the verified-cited-clau ÷ total-clau fraction and (2) the sign-off state is contradictory, **no LEGISLATION percentage is asserted** (§1.1 forbids a hand-typed number; §CONTEXT-DATA-HONESTY forbids laundering an ambiguous sign-off into completeness). The national ~20–25 % structured-fill is the COARSE prior (`LEGISLATION-RATE.md`), not the Axis-2 count. |
| 3 | **DATA-SOURCES** | 15 % | **80%** | `not-checked` | — | 5-slot checklist: cadastre-parcel **live** (swisstopo AV `swisstopo-av`, keyless, all-canton) · regional-zone-GIS **documented** (national geodienste `ms:grundnutzung` — canton ZH `full`; the **City-of-Zürich BZO WFS** `bzo_zone_v` is even richer, `typ` + per-parcel `rechtsvorschrift_url`, live-probed `findings/ZURICH-BZO-PROBE.md` §2; rated `documented` not `live` because `resolveZurichBzoZone`'s `/api/ch/zurich-bzo` proxy + CSP wiring is unlanded — resolves `endpoint-unreachable`) · building-height nDSM **documented** (`heightSources.mjs` `swissbuildings3d` impl:`documented`, `REGION_SOURCE` `zurich:'swissbuildings3d'`; swissSURFACE3D−swissALTI3D nDSM keyless via STAC, but the STAC→COG-stitch + LV95 reprojection is a BUILD, §SWISS-NDSM-STAC-BUILD) · terrain DEM **live** (`terrain.mjs` `ch` = swissALTI3D STAC, keyless, HTTP 200) · context-OSM **live** (`bake.mjs` REGIONS `zurich`). Mean = (1.0+0.5+0.5+1.0+1.0)/5 = 0.8. |
| 4 | **ENVELOPE** | 20 % | `not-assessed` | `not-checked` | `not-queried` | A buildable-envelope pack EXISTS (`chZurichBzo.ts`): AZ × parcel area → GFA → floors (via the Vollgeschosse code) → height, shipping at `estimated-ruleset` for parcels whose BZO regime resolves via the crosswalk (`zurichBzoRegimeResolver.ts`), and a **cited refusal** (`regime-ambiguous`) for the rest — 100 % honest (C63 §3.1). This is NOT "no pack" (contrast Genève/Bern). But the **buildable-land coverage fraction** (what share of ZH parcels resolve to a certified/constructed envelope vs refuse) is UNMEASURED — no C58 coverage survey run — and `estimated-ruleset` sits below `certified` (C58 tier); `human-reviewed` needs the un-contradicted signed VERIFICATION. So the axis is `not-assessed` pending a coverage measurement. See `ENVELOPE.md`. |
| 5 | **TERRAIN** | 10 % | **50%** | `not-checked` | — | Terrain row present: `terrain.mjs` REGIONS `zurich` (source `ch` = swissALTI3D STAC `ch.swisstopo.swissalti3d`, keyless HTTP 200; bbox `[8.45,47.34,8.62,47.43]`; geoidSepM 49.5 at Zürich). Rung **50 = baked-but-unverified** — no `terrain.verify.mjs` round-trip nor deployed `layer.json` 200 independently re-probed in this audit. |
| 6 | **HEIGHTS/LOD** | 10 % | `not-assessed` | `not-checked` | `not-queried` | Measured-**CAPABLE**: swisstopo nDSM (swissSURFACE3D DSM − swissALTI3D DTM) is keyless OpenData and the STAC collections return HTTP 200 (`heightSources.mjs` `swissbuildings3d`, `REGION_SOURCE` `zurich`). But impl is **`documented`, not `live`** — the plain WCS-in-4326 shape is FALSE (data.geo.admin.ch is an object store, 404 NoSuchKey); the real wiring is the STAC→COG-stitch path + an LV95↔WGS84 projector, which the buildings bake runner does not yet install (§SWISS-NDSM-STAC-BUILD). No per-building `heightProvenance` histogram probed. Capability is never reported as a measurement (§CONTEXT-DATA-HONESTY). See `HEIGHT.md`. |
| 7 | **CONTEXT** | 5 % | **56%** | `not-checked` | — | Inside the `zurich` context bake bbox (`bake.mjs` REGIONS `zurich`). Confirmed long-shipped layers: buildings · roads · water · parks · landuse (**5/9**). rail + trees are config-added (`bake.mjs` LAYERS, L-642) but that re-bake is not-yet-landed → excluded (honest 0). pedestrian: not a baked layer. sea: Switzerland is landlocked — genuinely absent (Lake Zürich rides the `water` layer), not fabricated. Score 5/9. |

## §CONTEXT-DATA-HONESTY note

DOES: terrain (swissALTI3D, unverified rung-50) + national swisstopo AV cadastre routing (cadastral) + baked OSM context (5/9) + national zone-GIS AND a registered City-of-Zürich BZO rule pack that computes an `estimated-ruleset` envelope for regime-resolved parcels. REFUSES: any parcel whose BZO regime is unresolved (`regime-ambiguous`) — the W2bIII 8.5 m (91/99) vs 9.0 m (2016) height split means a guessed regime is a fabricated height, so the resolver refuses. UNKNOWN (typed): PARCEL quality (`not-queried`), LEGISLATION + ENVELOPE (`not-queried` — pack exists, coverage/count not scorecard-computed, sign-off contradictory), HEIGHTS (`not-queried`, measured-capable via swisstopo nDSM). `honestyOk: true`.

## Dossier index (C63 §5)

This `RATE.md` is the composite master; the siblings FEED it (naming: `../../../_TEMPLATE/NAMING-CONVENTION.md`).

| File | About | Feeds axis |
|---|---|---|
| **`RATE.md`** (this) | 7-axis composite completion scorecard | — |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | structured legislation/data-fill rate (~20–25 % national prior; the BZO 700.100 transcription) | LEGISLATION |
| [`ENVELOPE.md`](./ENVELOPE.md) | buildable-envelope solver status (BZO pack + `estimated-ruleset` + regime refusal) | ENVELOPE |
| [`HEIGHT.md`](./HEIGHT.md) | building-height provenance status (swisstopo nDSM measured-capable) | HEIGHTS/LOD |
| [`NEXT.md`](./NEXT.md) | where we stopped · blockers · resume steps | all |
| [`RISK-REGISTER.md`](./RISK-REGISTER.md) | honesty guardrails (incl. the sign-off contradiction) | — |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | phased climb to 100 % | all |
| [`findings/ZURICH-BZO-PROBE.md`](./findings/ZURICH-BZO-PROBE.md) | the cantonal AV + City BZO WFS probe (re-nested from `regions/zurich` this pass) | LEGISLATION · PARCEL |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authority: [C63](../../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Composite scaffolded under audit L-649 Phase-1; both the composite `RATE.md` and the per-axis `LEGISLATION-RATE.md` are authored new this pass (no legacy city RATE to migrate).*
