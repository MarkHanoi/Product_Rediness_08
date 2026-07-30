# Data Readiness Rate — Sant Boi de Llobregat (`es-ct`, INE 08200)

**Headline rate: NOT MEASURED (typed-unknown).**

> ⚠ **§CONTEXT-DATA-HONESTY.** No structured-fill rate is stated here because none has been measured
> for Sant Boi. Barcelona's ~48% was *derived from direct endpoint/schema checks over 24 primary
> documents* (`../08019-barcelona/LEGISLATION-RATE.md`); no equivalent per-clau measurement has been run here. A
> borrowed Barcelona number would be a fabrication about another municipality's land — exactly the
> harm the honesty gate in `packages/site-parcel-data/src/rulepacks/esSantBoi.ts` forbids. The rate
> stays **not-measured** until the H1/clau audit in [`NEXT.md`](./NEXT.md) is run.

Sant Boi is the **FOURTH Catalan municipality** of the envelope replication
(`ENVELOPE-IMPLEMENTATION-PLAN.md` §1 Phase 2), mirroring L'Hospitalet + Badalona: onboarding a city is
a **DATA addition at five slots**, not an engine edit. It is **ROUTED and WIRED**, and it returns an
**honest cited refusal** — never a number — until a human verifies its parameters.

---

## Readiness scorecard (qualitative — no fabricated %)

| Field | State | Source / basis | Note |
|---|---|---|---|
| Parcel geometry | ✅ **Routed** | Catastro INSPIRE WFS (national) — the SAME provider Barcelona uses (S1). | Structural; not Sant Boi-specific. Block-ring dissolve success **not-queried** for 08200. |
| Plan/zone existence + boundary | ✅ **Routed** | Generalitat de Catalunya **MUC** — the SAME Catalonia-wide zone source as Barcelona (S3). | The PGM-1976 zone polygons cover the whole AMB. |
| Zone/use code (clau) | ✅ **Routed** | MUC, per-parcel (S3). | Resolves a clau; whether each clau maps to Barcelona's rule *shape* is **unverified**. |
| Density metric (FAR / depth / coverage) | ⛔ **Cited refusal** | `SANT_BOI_ENVELOPE_VERIFIED = false` → `santBoiUnverifiedRefusal` (`code:'no-rule-pack'`, `legallyGrounded:false`, `ordinanceRef:null`). | The Art. 242.2 depth **construction** is metropolitan (geometry would transfer), but Sant Boi's numbers are **not verified**. |
| Max height (parcel-level, ordinance) | ⛔ **Cited refusal** | Same gate. Barcelona's *alçada reguladora* / *ample oficial* tables are `es-08019` data and **do not transfer**. | Municipality-specific *modificacions puntuals* over the PGM are unverified. |
| Setback / alignment | ⛔ **Cited refusal** | Same gate. | — |
| Building footprint + height (context 3D / LOD) | ⚠️ **Estimated (unverified)** | OSM footprints via the `spain` bake region; heights **estimated** (OSM `building:levels`×3.2 m or the 9 m `assumed` default). See [`HEIGHT.md`](./HEIGHT.md). | The measured CNIG MDS join exists for `spain` but **per-08200 coverage is not-queried**. |
| Terrain (DTM/DSM) | ✅ / ❌ | Cesium World Terrain sampled in production (metropolitan, not Sant Boi-specific). | *rasant*/nDSM ❌, same defect class as Barcelona (L-584). |
| Heritage / overlay | ❌ **Not-queried** | No overlay layer confirmed for 08200. | Do not assume Barcelona's overlay findings apply. |

---

## Why the answer is a refusal, not a number

"Same instrument" is **not** "same numbers." Sant Boi is governed by the same metropolitan **PGM-1976**
as Barcelona and its clau is read from the same MUC, so a parcel is correctly identified and the Art.
242.2 buildable-depth construction *would* apply. But PRYZM has **not** verified, clau by clau, that
Sant Boi's height/FAR/coverage equal Barcelona's — and Barcelona's *alçada reguladora* and *ample
oficial* tables are Barcelona's own. Reusing a Barcelona figure here would be a **confident mis-citation
on another municipality's land**. This is the same discipline that keeps Córdoba's OCR'd pack refusing
and Barcelona's 22a unregistered: *an absent number costs nothing; a confident wrong one costs
credibility.*

---

## What would give Sant Boi a measured rate

See [`NEXT.md`](./NEXT.md) and [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md). In
short: (1) run the clau-coverage audit (which claus appear in 08200, and each one's rule shape); (2)
source Sant Boi's own height/street-width tables; (3) author an `es-08200-sant-boi` pack (or a cited
per-clau equivalence ruling) and sign `sources/VERIFICATION.md` (the L-449 gate). Only then is a number
honest — and only then is it measured, not assumed.

---

*Last updated: 2026-07-30. Routing + registration confirmed live in
`packages/site-parcel-data/src/rulepacks/esSantBoi.ts` + `providers/santBoiBbox.ts` +
`rulepacks/registry.ts`. Envelope gate `SANT_BOI_ENVELOPE_VERIFIED = false` (cited refusal).
Structured-fill rate: NOT MEASURED. Maintainer: UNASSIGNED.*
