# City RATE — master completion scorecard — Zürich (ch-zh, BFS 0261)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 — scorecard function not yet shipped (C63 §8); the three CHEAP axes (DATA-SOURCES · TERRAIN · CONTEXT) are cited-derived per C63 §8.1, every other axis is not-assessed with a typed C62 reason. NO cell is a fabricated number. -->

**Overall completion (assessed subset): `67.7%` · `partial: true` — over 45 % of the ratified weight**
— renormalised over the four ASSESSED axes (**PARCEL** · DATA-SOURCES · TERRAIN · CONTEXT, Σ weight
15+15+10+5 = **45**). LEGISLATION · ENVELOPE · HEIGHTS/LOD stay honestly `not-assessed`, not 0 %
(C63 §1.2/§1.5). **`honestyOk: true`** (no fabricated value; every unknown typed; the BZO envelope path
REFUSES `regime-ambiguous` rather than guess a height).

> ⚠ **ZÜRICH IS THE ONE CITY WHOSE PARCEL AXIS IS CAPPED BY A SINGLE MISSING FIELD — and it is
> measured, not inferred.** Against the WIRED endpoint the axis scores **50.0 %** on a perfect
> 120/120 sample: every point returned a real Grundstück with a complete ring and the click inside,
> yet **0** reached the C57 `high` tier, because `api3.geo.admin.ch/identify` publishes **no area
> attribute** and `high` requires a registry-declared official area. A counterfactual run against
> `geodienste.ch/db/av_0/deu` layer `ms:RESF` — which *does* publish `ms:Flaeche` — scored
> **100.0 % (60/60 high)**. **One endpoint swap is worth +7.5 weighted points, per Swiss city.**
> This does **not** contradict the L-449 sign-off that Swiss AV is survey-grade: that is a claim
> about the DATA, this is a claim about the ENDPOINT we happen to call.
>
> ⚠ **CONTEXT sensitivity:** against the tile-VERIFIED 5/9 rather than the scorecard's
> declaration-based 8/9 the composite is **64.0 %**.

> **Weighting** `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4).

## The 7 axes (C63 §3 — fixed definitions)

| # | Axis | Weight | Score | Validation | Unknown reason | Derivation (which state was read) |
|---|---|---:|---|---|---|---|
| 1 | **PARCEL** | 15 % | **50.0%** *(measured, wired endpoint)* · **100.0 %** *(measured, `ms:RESF` counterfactual)* | `auto-validated` | — | **MEASURED 2026-08-01** (`parcelSampleProbe.mjs --city zurich`, seed `20260801`). **DENOMINATOR = private buildable land** (L-656), sampled independently of the cadastre as **OSM non-public building-footprint area** — 1,450–2,000 footprints in 40 uniformly-random 330 m tiles over `[8.45,47.34,8.62,47.43]`, points drawn **∝ footprint area**. **N = 120: high 0 · medium 120 · low 0 · no-parcel-here 0 · 0 transport failures.** Every single point returned a real Grundstück (`egris_egrid`), a complete ring, and `clickInside = true` — the sample is *perfect on geometry*. It scores 0.5 for exactly ONE reason: `api3.geo.admin.ch/…/identify` on `ch.kantone.cadastralwebmap-farbe` publishes `ak` / `number` / `identnd` / `egris_egrid` and **NO area field**, and C57 `high` requires a registry-declared official area, so `high` is **unreachable by construction on this endpoint**. **COUNTERFACTUAL, measured not asserted:** the keyless all-canton `geodienste.ch/db/av_0/deu` WFS layer **`ms:RESF`** publishes **`ms:Flaeche`** (verified live: Grundstück `AA8043`, EGRID `CH107791929988`, 33 558 m²); an N=60 run through it scored **60/60 `high` = 100.0 %**. ⚠ This **falsifies the standing note in `parcelProviders/registry.ts`** that the geodienste `av_0` host has no keyless Liegenschaft layer — it has one, and it carries the missing corroborator. Flagged to that file's owner, not edited here. **The L-449 sign-off is NOT contradicted:** it rules on the DATA (survey-grade), this measures the ENDPOINT. RETAINED SIGN-OFF RECORD → **L-449 founder sign-off 2026-07-30: swisstopo AV is authoritative, survey-grade cadastral data → PARCEL scores HIGH** (downgrade only for non-AV derivatives / generalized tiles / field-survey tasks; `../../sources/VERIFICATION.md`). National swisstopo **Amtliche Vermessung** cadastre IS wired (`parcelProviders/registry.ts` `isInSwitzerland`→`swisstopo-av`, `api3.geo.admin.ch` identify `ch.kantone.cadastralwebmap-farbe` → real Grundstück with `egris_egrid` + local number + canton, keyless, all-canton, ZH+GE live-verified 2026-07-26). The cantonal ZH WFS `maps.zh.ch/wfs/AVZHWFS` `liegenschaften_f` returns a real 184-vertex parcel ring (`AA5070`, EGRID `CH349199778779`, 750 m², `bfsnr 261`; `findings/ZURICH-BZO-PROBE.md` §1). CH is **cadastral** (not footprint-fallback). The `computeParcelConfidence` run would still refine the numeric high/medium/low distribution (C63 §8 scorecard); the axis is **signed HIGH now** (DERIVED, qualitative — not folded into the numeric Overall until §8 assigns it a %). |
| 2 | **LEGISLATION** | 25 % | `not-assessed` | `not-checked` | `not-queried` | A **rule pack EXISTS** for Zürich (`rulepacks/chZurichBzo.ts` + `providers/chZurichBzoCatalogue.ts`): the BZO 700.100 Ausnützungsziffer / Vollgeschosse / Gebäudehöhe table transcribed for BOTH regimes (91/99 + 2016), registered as canton `ZH` in `CH_CANTON_FAR_CATALOGUES`. `sources/VERIFICATION.md` records a 2026-07-26 repo-owner sign-off flipping `CH_FAR_CERTIFIED` ON at `estimated-ruleset`. ⚠ **BUT the same file's per-parcel "Zürich BZO sign-off" line remains UNSIGNED with open items (a) docid→regime crosswalk populated-but-not-human-CONFIRMED, (b) exact source-PDF URLs NOT CONFIRMED — an internal contradiction** (RISK R3). Because (1) the C63 scorecard has NOT computed the verified-cited-clau ÷ total-clau fraction and (2) the sign-off state is contradictory, **no LEGISLATION percentage is asserted** (§1.1 forbids a hand-typed number; §CONTEXT-DATA-HONESTY forbids laundering an ambiguous sign-off into completeness). The national ~20–25 % structured-fill is the COARSE prior (`LEGISLATION-RATE.md`), not the Axis-2 count. |
| 3 | **DATA-SOURCES** | 15 % | **90%** | `auto-validated` | — | 5-slot checklist: cadastre-parcel **live** (swisstopo AV `swisstopo-av`, keyless, all-canton; 120/120 real Grundstücke this session) · regional-zone-GIS **live** — ⚠ **CORRECTION, +10 pp:** the 2026-07-30 audit rated this `documented` because "`/api/ch/zurich-bzo` proxy + CSP wiring is unlanded". **That is stale.** `CH_ZURICH_BZO_PATH` is **mounted in `server.js`** → `server/chZurichBzoProxy.js` → `www.ogd.stadt-zuerich.ch/wfs/geoportal/Nutzungsplanung___kommunale_Bau__und_Zonenordnung__BZO_`, GetCapabilities **HTTP 200 2026-08-01** (`geodienste.ch/db/npl_nutzungsplanung_v1_2_0/deu` also 200 as the cantonal fallback) · building-height nDSM **documented** (`heightSources.mjs` `swissbuildings3d` impl:`documented`, `REGION_SOURCE` `zurich:'swissbuildings3d'`; swissSURFACE3D−swissALTI3D nDSM keyless via STAC, but the STAC→COG-stitch + LV95 reprojection is a BUILD, §SWISS-NDSM-STAC-BUILD) · terrain DEM **live** (`terrain.mjs` `ch` = swissALTI3D STAC, keyless, HTTP 200) · context-OSM **live** (`bake.mjs` REGIONS `zurich`). Mean = (1.0 cadastre + 1.0 zone-GIS + 0.5 height + 1.0 terrain + 1.0 context)/5 = **0.90**. The building-height slot stays `documented` on merit: `swissbuildings3d` really is `impl:'documented'` (the STAC→COG-stitch is an unbuilt BUILD), which is a claim about the FEED and therefore belongs here — unlike ES/FR/NL, where the audit had downgraded a live feed for an Axis-6 tile defect. |
| 4 | **ENVELOPE** | 20 % | `not-assessed` | `not-checked` | `not-queried` | A buildable-envelope pack EXISTS (`chZurichBzo.ts`): AZ × parcel area → GFA → floors (via the Vollgeschosse code) → height, shipping at `estimated-ruleset` for parcels whose BZO regime resolves via the crosswalk (`zurichBzoRegimeResolver.ts`), and a **cited refusal** (`regime-ambiguous`) for the rest — 100 % honest (C63 §3.1). This is NOT "no pack" (contrast Genève/Bern). But the **buildable-land coverage fraction** (what share of ZH parcels resolve to a certified/constructed envelope vs refuse) is UNMEASURED — no C58 coverage survey run — and `estimated-ruleset` sits below `certified` (C58 tier); `human-reviewed` needs the un-contradicted signed VERIFICATION. So the axis is `not-assessed` pending a coverage measurement. See `ENVELOPE.md`. |
| 5 | **TERRAIN** | 10 % | **50%** | `not-checked` | — | Terrain row present: `terrain.mjs` REGIONS `zurich` (source `ch` = swissALTI3D STAC `ch.swisstopo.swissalti3d`, keyless HTTP 200; bbox `[8.45,47.34,8.62,47.43]`; geoidSepM 49.5 at Zürich). Rung **50 = baked-but-unverified** — no `terrain.verify.mjs` round-trip nor deployed `layer.json` 200 independently re-probed in this audit. |
| 6 | **HEIGHTS/LOD** | 10 % | `not-assessed` | `not-checked` | `not-queried` | Measured-**CAPABLE**: swisstopo nDSM (swissSURFACE3D DSM − swissALTI3D DTM) is keyless OpenData and the STAC collections return HTTP 200 (`heightSources.mjs` `swissbuildings3d`, `REGION_SOURCE` `zurich`). But impl is **`documented`, not `live`** — the plain WCS-in-4326 shape is FALSE (data.geo.admin.ch is an object store, 404 NoSuchKey); the real wiring is the STAC→COG-stitch path + an LV95↔WGS84 projector, which the buildings bake runner does not yet install (§SWISS-NDSM-STAC-BUILD). No per-building `heightProvenance` histogram probed. Capability is never reported as a measurement (§CONTEXT-DATA-HONESTY). See `HEIGHT.md`. |
| 7 | **CONTEXT** | 5 % | **56%** | `not-checked` | — | Inside the `zurich` context bake bbox (`bake.mjs` REGIONS `zurich`). Confirmed long-shipped layers: buildings · roads · water · parks · landuse (**5/9**). rail + trees are config-added (`bake.mjs` LAYERS, L-642) but that re-bake is not-yet-landed → excluded (honest 0). pedestrian: not a baked layer. sea: Switzerland is landlocked — genuinely absent (Lake Zürich rides the `water` layer), not fabricated. Score 5/9. |

## The THREE PARCEL numbers — never conflated (L-656 / MASTER-ROI-TRACKER §0.5.2)

All three are true statements about Zürich on **2026-08-01**, each with a different denominator.
Reproduce: `node tools/city-completion/summariseSamples.mjs`.

| Metric | Denominator | N | Value | Answers |
|---|---|---:|---|---|
| **Axis score** (C63 PARCEL, wired endpoint) | private **buildable** land (OSM non-public footprint-area proxy) | 120 | **50.0 %** | *how good is the cadastre where one may build — as we currently read it?* |
| **Axis score** (`ms:RESF` counterfactual) | same | 60 | **100.0 %** | *what is available from the same national cadastre through a different door?* |
| **Click coverage** | **every** point in the region bbox — lake, Uetliberg forest included | 60 | **100 %** | *what does a random click get?* |
| **Answer correctness** | every point in the region bbox | 60 | **100 %** | *did every click get a TRUE answer?* |

**Switzerland is parcelled edge to edge — including the lake.** A control probe in the middle of the
Zürichsee returned Grundstück `7145`, EGRID `CH794177936293`. There is no measured-absence class here,
so the 50 % is *entirely* the missing-area cap, not a coverage hole.

⚠ **The buildable-land proxy is NOT the legal denominator** — a conservative OSM stand-in, not a Swiss
buildable-land census; it under-counts vacant plots, gardens and setbacks.

## §CONTEXT-DATA-HONESTY note

DOES: terrain (swissALTI3D, unverified rung-50) + national swisstopo AV cadastre routing (cadastral) + baked OSM context (5/9) + national zone-GIS AND a registered City-of-Zürich BZO rule pack that computes an `estimated-ruleset` envelope for regime-resolved parcels. REFUSES: any parcel whose BZO regime is unresolved (`regime-ambiguous`) — the W2bIII 8.5 m (91/99) vs 9.0 m (2016) height split means a guessed regime is a fabricated height, so the resolver refuses. PARCEL: **HIGH (DERIVED — L-449 signed 2026-07-30, AV survey-grade)**, no longer `not-queried`. UNKNOWN (typed): LEGISLATION + ENVELOPE (`not-queried` — pack exists, coverage/count not scorecard-computed, sign-off contradictory), HEIGHTS (`not-queried`, measured-capable via swisstopo nDSM). `honestyOk: true`.

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
*Last updated: 2026-08-01 (L-658 — PARCEL measured 50 % on the wired endpoint, 100 % on a measured `ms:RESF` counterfactual; zone-GIS slot corrected to live). Maintainer: UNASSIGNED. Authority: [C63](../../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Composite scaffolded under audit L-649 Phase-1; both the composite `RATE.md` and the per-axis `LEGISLATION-RATE.md` are authored new this pass (no legacy city RATE to migrate).*
