# L-608 — the Madrid NZ 1 PROVIDER/ADAPTER is built + fixture-tested, and sigma answered LIVE this pass

> **What this is.** The provider-work record: the Madrid-specific adapter that turns
> `sigma.madrid.es` PGOUM-97 Norma Zonal 1 geometry into the generic `ExplicitAreaSource` the
> already-merged `explicit-area` solver consumes. It also records a LIVE re-probe of sigma (which
> was network-blocked last pass and is reachable this pass), which RESOLVES two long-open questions
> and confirms two measured negatives. One pre-existing engine-interface defect was discovered.
>
> Author: provider agent, 2026-07-23. Governance: C58 §1.5/§1.9/§1.10/§1.11/§2.2 (KG-4), ADR-0270,
> JURISDICTION-PLAYBOOK P6. Honesty rule: *failure and empty are the same VALUE, never the same
> ANSWER.* Confidence tier on every claim is labelled.

---

## 0 — TL;DR

- **The NZ 1 provider/adapter SHIPPED** (`packages/site-parcel-data/src/rulepacks/esMadridNZ1Provider.ts`)
  + a fixture-driven test (`__tests__/esMadridNZ1Provider.test.ts`, +20 tests, suite 551 → 571,
  all green). It ADAPTS Madrid into the generic primitive — it does NOT re-implement the solve.
- **sigma.madrid.es was LIVE this pass** (Tier: VERIFIED-LIVE 2026-07-23) — it was network-blocked
  on the previous pass. I re-probed and this **resolves the two blockers the spec left open**:
  1. **Which layer is the buildable ring → LAYER 6.** `PG_CONDICIONES_EDIFICACION/6` is
     `esriGeometryPolygon`, single-ring, in EPSG:25830, carrying `COEF_Z` — it IS the closed
     buildable footprint, read directly. No polyline-closing against Alineaciones is needed.
  2. **`COEF_Z` value vocabulary → a CODED String, not a float.** Live distinct values observed:
     `"-"`, `"4"`, `"5"`, `"0 / 5"`, `"0 / 4"`. This vindicates the defensive-parse mandate and
     sharpens it (see §2).
- **Two measured negatives confirmed live:** the calificación plane `pgoum97/PG_ORDENACION` is
  STILL `HTTP "Service not started"` (so the NZ-code for registration is still unverified), and
  **no sigma service publishes NZ 4/8/5/7 fondo/altura as queryable attributes** — the `pgoum97`
  folder's up services are the NZ 1 / historic-catalogue planes only. NZ 4/8/5/7 stay document-gated.
- **One PRE-EXISTING DEFECT discovered** (not mine, not fixable this round): the committed
  `explicit-area` engine branch reads `input.explicitAreaFootprint` but
  `ComputeBuildableEnvelopeInput` never declares that field ⇒ the base already fails `tsc` (3
  errors) even though `vitest` is green. See §4 — it is the engine/schema owner's to close.

---

## 1 — What shipped (the adapter, C58 §1.5/§3.1)

`packages/site-parcel-data/src/rulepacks/esMadridNZ1Provider.ts` — the Madrid-specific half of the
`explicit-area` pipeline. All Madrid knowledge lives here; the engine and the solver primitive stay
jurisdiction-agnostic.

| Export | Kind | Role |
|---|---|---|
| `parseCoefZ(raw)` | pure | the COEF_Z defensive classifier: `absent` / `numeric` / `coded` (§2) |
| `mapMadridConditionsToExplicitAreaSource(response, opts)` | pure | layer-6 ArcGIS JSON → generic `ExplicitAreaSource` (ring + edificabilidad + override), or a typed refusal |
| `MadridNZ1RingProvider.fetchExplicitAreaSource(lat, lon, deps)` | impure (1 fetch) | same-origin proxy fetch → the mapper; OTel span, `isInMadrid` gate, NEVER throws |
| `isInMadrid`, `MADRID_BBOX`, `MADRID_NZ1_RING_REF`, `MADRID_NZ1_*_PATH` | pure/const | jurisdiction gate, ring handle (taken from the pack), proxy routes |

**It ADAPTS, never re-implements.** The ring validation (`resolveExplicitAreaRing`) and the clip
(`solveExplicitArea`) stay in the merged `geometry/explicitArea.ts`. The adapter's output is a plain
`ExplicitAreaSource`; the test drives the full real chain
`mapper → resolveExplicitAreaRing → solveExplicitArea` and asserts the parcel is clipped to the
published band (600 m² of a 1200 m² plot), never the whole plot.

**Coordinate frame (honest seam).** The ArcGIS rings are EPSG:25830 (UTM 30N) metres. The mapper
emits them via an injectable `projectPoint`, defaulting to `{x: easting, z: northing}`. The L5
editor injects the real scene-XZ rebase — a pure TRANSLATION, and `parcel ∩ footprint` is
translation-invariant, so both parcel and footprint must be rebased by the SAME transform. The
adapter does not itself hold the scene origin (it is L2, pure).

---

## 2 — The `COEF_Z` honesty gate (the load-bearing part)

`COEF_Z` is typed **String(255)** and its LIVE vocabulary (probed 2026-07-23) is **not a bare
float**. `parseCoefZ` classifies it into a closed vocabulary:

| Raw | Class | Why |
|---|---|---|
| `"-"`, `""`, null | `absent` | the source publishes NO coefficient — **NOT zero** |
| `"4"`, `"5"`, `"1,20"` | `numeric` | a single clean number (Spanish comma-decimal tolerated) |
| `"0 / 5"`, `"0 / 4"`, `"PB+4"` | `coded` | a compound/opaque code — **REFUSED**, never coerced |

**The trap this stops:** `parseFloat("0 / 5") === 0`. A naïve parse would silently publish a
zero-edificabilidad envelope. `parseCoefZ` reports `coded`, and the mapper sets
`edificabilidad = null`, never 0 — even when the caller passes `assertCoefZAsFAR: true`.

**Two-stage assertion (§CONTEXT-DATA-HONESTY).** Even a cleanly-numeric COEF_Z is **withheld from
`edificabilidad`** (which the engine feeds to `maxFAR → volume`) unless the caller passes
`assertCoefZAsFAR: true`. Reason: the m²/m² SEMANTICS of "Coeficiente Z" are **UNVERIFIED** against
the primary NNUU — the observed `4`/`5` read like grados/plantas, not FAR ratios, and promoting a
grado-looking `5` to FAR = 5 would multiply the volume ~5×. The FOOTPRINT ring (the real NZ 1
envelope) flows regardless; the FAR stays `null` until a human confirms the coding and signs L-449.
The assertion flag **is** the human "parse under assertion".

---

## 3 — The Ficha Específica override (layer 1)

`PG_CONDICIONES_EDIFICACION/1` "Ficha Específica" (VERIFIED-LIVE) is `esriGeometryPoint`, fields
`NNUMORD` (int catalogue no.) + `FESPECIFICA` (String). A point in the parcel ⇒ individually-defined
conditions govern ⇒ the mapper sets `hasParcelOverride: true` ⇒ `resolveExplicitAreaRing` returns
`{ ok: false, reason: 'parcel-override' }` (it DEFERS to the per-parcel ficha PRYZM does not hold,
rather than applying the general footprint to a parcel it was not drawn for). Tested.

---

## 4 — DISCOVERED DEFECT: `ComputeBuildableEnvelopeInput` is missing `explicitAreaFootprint`

**Tier: MEASURED (tsc output, this pass).** The merged engine branch reads
`input.explicitAreaFootprint` (`ZoningRulesEngine.ts:651`) and the committed
`explicitAreaEnvelope.test.ts:87` passes it, but the `ComputeBuildableEnvelopeInput` interface
(`ZoningRulesEngine.ts:41–77`) **never declares the field**. So:

- `npx tsc -p packages/site-parcel-data` **fails at the base** (3 errors), independent of this
  work — including `ZoningRulesEngine.ts:651` itself. `vitest` is green because it strips types.
- Per the "build-uses-stricter-root-tsc" rule, this would **hard-fail the Fly build**.

**Why I did not fix it:** this round's constraints forbid touching `ZoningRulesEngine.ts` (and
`packages/schemas`). The one-line fix is to add
`readonly explicitAreaFootprint?: ReadonlyArray<Pt> | null;` to `ComputeBuildableEnvelopeInput`
(exactly like `blockRing`). **This is the engine/schema owner's action** and is a prerequisite for
ANY explicit-area zone (Madrid NZ 1 or otherwise) to pass the real build. My provider test is
deliberately confined to the `mapper → resolver → solveExplicitArea` chain so it adds **zero** new
tsc errors; the engine end-to-end remains covered by the pre-existing `explicitAreaEnvelope.test.ts`.

---

## 5 — NZ 4/8/5/7 sourcing: measured negatives this pass (still document-gated)

- **sigma `pgoum97` folder (LIVE)** — the up services are `PG_CONDICIONES_EDIFICACION` and
  `PG_ANALISIS_EDIFICACION` (the NZ 1 / historic-catalogue planes) plus `PG_ORDENACION_SIN_AMBITO`
  (Norma Zonal 1.5, Alineaciones, Fondo). **No service publishes NZ 4/8 fondo/altura/retranqueos as
  queryable attributes** — unlike NZ 1, they are not DATA. `PG_ORDENACION` (the general calificación
  plane) is STILL `HTTP "Service not started"`.
- **Web search (NZ 4 Art. 8.4)** — surfaced `"16 m fondo edificable"` + `"18 m planta-baja body,
  Art. 8.4.7.2.d"`, but these are **SECONDARY** (blog / a specific application) and NZ 4 is
  grado-structured; a single scalar is the bare-`20a` category error. **Not promoted.** The primary
  Compendio 2023 PDF is still >10 MB (WebFetch cannot open it). NZ 4/8/5/7 stay `null`, human-gated.
- **NEW structural fact carried from the prior pass stands:** NZ 4's altura is an Art. 8.9.10
  CONSTRUCTION (street width × plantas), so once sourced it needs a street-width resolver, not a
  scalar — the Madrid analogue of Barcelona Art. 327.2 (L-525a).

---

## 6 — What remains for NZ 1 (the exact human-gated acts)

1. **Add `explicitAreaFootprint` to `ComputeBuildableEnvelopeInput`** (engine owner — §4). Without
   it the explicit-area path cannot pass the build. One line.
2. **Server-side same-origin proxy** forwarding `/api/madrid/pgoum97/{condiciones,ficha}` →
   `sigma.madrid.es/.../PG_CONDICIONES_EDIFICACION/MapServer/{6,1}/query` (C57 pattern, `server/`).
   The adapter is proxy-agnostic and ready; this is the only network wiring left.
3. **Confirm `COEF_Z` FAR semantics** against the primary NNUU (Cap. 8.1), then set
   `assertCoefZAsFAR` accordingly — or leave the FAR null and ship the footprint alone.
4. **Re-verify the NZ-code** (`PG_ORDENACION` was down) so `MADRID_NZ1_ZONE_CODES` is not a
   placeholder — required before registration in `registry.ts`.
5. **L-449 human sign-off** (`VERIFICATION.md`), then the registration unit in the pack header.

## 7 — Honest resolution (denominator named)

Denominator: a Madrid residential parcel click. **Shippable envelopes today ≈ 0 %** — unchanged
(the field defect + proxy + sign-off gate NZ 1; NZ 4/8/5/7 document-gated). Ceiling once the four
NZs are sourced + NZ 1 wired ≈ **60–62 %** (0.65 × 0.96), per-NZ split UNSOURCED. What moved this
pass: NZ 1's provider EXISTS and is proven against the merged solver; its remaining blockers are all
**wiring + sign-off**, no research and no reusable-primitive engineering left. NZ 1's data questions
(ring layer, COEF_Z coding) are now ANSWERED, not open.
