# Buildable-Envelope Realism Matrix — per jurisdiction (L-616)

> **Status:** code-audit, 2026-07-26, every claim line-cited. Companion to audit item **L-616**
> (the envelope SOLID overstates when rule-pack data is partial). This maps which jurisdictions
> overstate, which are honest, and the shared root. Governs against **C58** + **§CONTEXT-DATA-HONESTY**.

## Three engine facts that frame everything

1. **Null setback → 0 inset (mechanism A).** `ZoningRulesEngine.ts:248-250` (`frontV = front.value ?? 0`, same side/rear). A pack that leaves setbacks null AND has `geometricRule` = `setback`/`null` insets by nothing → `insetPolygon = full parcel`, `status:'ok'`.
2. **FAR never caps volume (mechanism B).** `ZoningRulesEngine.ts:726-731` — `cap = (tiers.length>0 && maxCoverage.value!==null) ? maxCoverage×parcelArea : Infinity`; `maxVolumeM3 = min(insetArea,cap) × height`. `maxFAR.value` is returned at `:826` but **never** read into the volume. Only a `tiered-occupation` zone with a coverage gets any cap.
3. **⚠ THE 3D SOLID IGNORES `maxVolumeM3` ENTIRELY (the root).** `CesiumViewport.ts:4745-4746` (`envTop = baseHeight + maxHeightM`) + `:4767` (`extrudedHeight: envTop`). The drawn massing is `insetPolygon × maxHeightM`, full stop. **So even fixing the engine's `maxVolumeM3` cannot bind the solid until the Cesium extrude reads it.** A null height draws a 0.5 m footprint slab (`:4731-4746`).

## Matrix

| Jurisdiction | Setbacks (file:line) | FAR | Coverage | Tiered | A? | B? | VERDICT |
|---|---|---|---|---|---|---|---|
| **Denmark (Plandata)** | NULL — `mapPlandataToZoningRecord.ts:277` | `bebygpct/100` `:203` | null `:275` | No | **YES** | **YES** | **OVERSTATES-BOTH** (live) |
| **BCN 13a/13E ensanche** | null, block-derived depth clip `esBarcelonaEnsanche.ts:154,96-141` | null `:152` | null | No | No | No | **REALISTIC** |
| **BCN 13b semiintensiva** | null, block-derived depth `esBarcelonaSemiintensiva.ts:235,130-170` | null | null | No | No | No | **REALISTIC** |
| **BCN 12 nucli antic** | null, block-derived depth `esBarcelonaNucliAntic.ts:342,191-207` | **1.40** `:338` | null | No | No | **YES** | **OVERSTATES-FAR** (live) |
| **BCN 20a aïllada** | **REAL** front/side/rear `esBarcelona20aAillada.ts:526-539` | real `:522` | real 30% `:523` | No | No | **YES** | **OVERSTATES-FAR** (live) |
| **BCN 22a industrial**
 | tiered-occupation — **NOT registered** `registry.ts:280-331` | 2.0 | 0.9 | Yes | — | — | **REFUSES** |
| **BCN 18 volumetria** | explicit-area, gated OFF | null | null | No | — | — | **REFUSES** |
| **Madrid NZ1** | explicit-area, empty `registry.ts:397-401` | null | null | No | — | — | **REFUSES** (ring-only) |
| **Córdoba PGOU-2001** | mixed (PAS/OA/UAD real; CTP-1 `alignment` geometricRule 16 m depth, MC `explicit-area` unresolvable-ring refusal — both guards closed `6dbad1f2`, 2026-07-26) — gate OFF | real | real | No | No (closed) | No | **REFUSES** (gate OFF; guards in place) |
| **Switzerland national** | zones `[]`, refusal | null | null | No | — | — | **REFUSES** |
| **Switzerland/Zürich BZO** | zones `[]`; **compute NOT wired into dispatcher** | AZ catalogue (gate `true` but unused) | — | No | — | latent | **REFUSES** |
| **Paris PLU-b** | gate `false` → refuses; new ECM engine ready but dispatcher not repointed | null | null | No | latent | No | **REFUSES** |
| **Netherlands** | explicit-area = real bouwvlak geometry `nlBestemmingsplan.ts:13-24` | maatvoering | maatvoering | No | No | No | **REALISTIC** |
| **Saudi/Riyadh** | REAL, street-width `saRiyadhResolvedPack:391-413` | null | 0.65/0.75 | No | No | No | **REALISTIC** |

## Ranked fix list (worst first)

1. **Denmark — OVERSTATES-BOTH, live.** The only jurisdiction that draws today AND stacks both mechanisms (the founder's Copenhagen defect). Fix: honest DK footprint (refuse/flag when byggelinjer absent, don't inset by 0) + FAR binds volume.
2. **BCN 20a aïllada — OVERSTATES-FAR, live.** Real setbacks bind, but a real 30% ocupació + FAR are discarded; solid is footprint×height. Highest-traffic overstating BCN pack.
3. **BCN 12 nucli antic — OVERSTATES-FAR, live.** The 1.40 net edificabilitat is ignored by the volume path.
4. ✅ **CLOSED (2026-07-26, `6dbad1f2`).** ~~Córdoba — latent OVERSTATES-BOTH behind `CORDOBA_ENVELOPE_VERIFIED`. CTP-1/MC subzones have null setbacks + NO `geometricRule` → full parcel (mechanism A) the moment the gate opens. Add a `geometricRule` before signing.~~ **Stale as of the same day it was written**: `esCordobaPGOU2001.ts` now carries a real `alignment` geometricRule on CTP-1 (16 m *profundidad edificable*, Art. 13.8.2.4) and an `explicit-area` geometricRule with the deliberately-unresolvable `CORDOBA_MC_FONDO_UNRESOLVED_RING` handle on MC-1..4 (hard-fails to `status:'degenerate'`, never a full-parcel box). Neither can hit mechanism A once `CORDOBA_ENVELOPE_VERIFIED` flips. Gate itself is still OFF and unsigned — see `sources/VERIFICATION.md` — so nothing renders today regardless. A real, still-open, unrelated gap remained on **UAD-3** (same mechanism-A shape, no depth band) until it too was closed 2026-08-02 (`ef0e966b`).
5. **Paris — latent OVERSTATES-SETBACK behind `FR_PARIS_PLU_CERTIFIED`.** Old `FR_PARIS_PLU_PACK` UG zone is `setbacks:{0,0,0}`. Repoint the dispatcher to the new real-ECM `computeParisEnvelope` BEFORE flipping the gate.
6. **Switzerland/Zürich — latent OVERSTATES-FAR if wired.** `CH_FAR_CERTIFIED=true` but `computeZurichBzoEnvelope` isn't called (the flip is currently inert — Zürich still refuses). Wire the AZ/GFA cap into the solid, not just footprint×height.

**REALISTIC (no fix):** BCN 13a/13E, 13b (depth binds, FAR null — *these are the ones the founder tested and liked*); Netherlands (real bouwvlak geometry); Riyadh (resolved-pack flow — add a guard so the base pack's null setbacks can't reach the engine). **REFUSES/draws nothing:** Madrid, BCN 18/22a, Switzerland, Paris.

## The one structural fix that helps all of them

Because of fact #3, the highest-leverage change is: **make the Cesium massing honor `maxVolumeM3`/GFA, not just `maxHeightM`** (`CesiumViewport.ts:4745-4767`), AND stop the `?? 0` full-parcel inset when setbacks are unknown (`ZoningRulesEngine.ts:248`). Those two lines are the root of both mechanisms across every jurisdiction. Per founder direction (2026-07-26), this is done **per-jurisdiction and measured** — Barcelona 13a/13b (realistic) must not regress; only the overstating packs change.
