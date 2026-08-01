# Córdoba PGOU-2001 — the rule-pack SPEC + the authored starter pack

> **Stamp** 2026-07-23 · **RE-STAMPED 2026-08-01** · **Status** SPEC + **REGISTERED, GATED SHUT** pack.
> ⬆ **THE "UNREGISTERED / NOT IMPORTED ANYWHERE" STATUS BELOW IS STALE AND IS CORRECTED HERE.** The
> pack is registered in `rulepacks/registry.ts` (13 subzones) and has been since `068a02ce`. What
> stops a number reaching a user is the **dispatcher's verification gate**
> (`CORDOBA_ENVELOPE_VERIFIED = false`), not the absence of registration — §4 below reasons from the
> superseded premise and its CONCLUSION (publish nothing until a human signs) still holds, by a
> different and stronger mechanism. See [`../CLOSURE-REGISTER.md`](../CLOSURE-REGISTER.md).
> The pack is `packages/site-parcel-data/src/rulepacks/esCordobaPGOU2001.ts` — authored, schema-valid
> (runtime-parsed against the live `JurisdictionZoningContractSchema`).
> Values are `pipeline-extracted-unverified` (machine-read, human sign-off pending). Extraction record +
> per-family value tables: `OCR-EXTRACTION-RESULTS.md`. §CONTEXT-DATA-HONESTY throughout.

---

## 1 — What the pack IS, and the shape of a Córdoba envelope

Córdoba is a **calificación → ordenanza → document** jurisdiction (C58 §2.2), the same KIND as Barcelona's
*clau*: a `coaco:ordenanzas` polygon carries an `ordenanza` name + a `link` to the ordinance PDF; the
numeric parameters live in the PDF. The pack fills those numbers per **subzone** (PAS-1, MC-3, …), not per
family — the ordinance's own granularity.

Two geometric shapes appear, and the pack must not confuse them:
- **Setback zones** (detached/attached typologies: PAS, OA, UAD) — the ordinance states real
  front/lateral/rear distances. `kind:'setback'` (the schema default via populated `setbacks` +
  `geometricRule:null`). These are the FULLY-specified families.
- **Alignment zones** (dense urban typologies: MC, CTP-1) — the façade sits ON the vial line, so a
  front/side/rear triple is the wrong operation. `setbacks:null` (containment SKIPS the edge; C58 §1.7a),
  and `geometricRule:null` (the legacy per-edge inset erodes nothing on all-null setbacks). The envelope is
  shaped by `maxCoverage` (+ FAR where stated). Height, where it is a per-street-width table, is `null`.

## 2 — The zone table the pack ships (13 subzones)

| code | kind | FAR | coverage | height (m) | setbacks (f/s/r) | note |
|---|---|---|---|---|---|---|
| PAS-1 | setback | 1.2 | 0.40 | 12.75 (PB+3) | 3 / 6.375 / 6.375 | lateral = ½·h @ max h |
| PAS-2 | setback | 1.66 | 0.50 | 12.75 (PB+3) | 3 / 6.375 / 6.375 | |
| PAS-3 | setback | 2.0 | 0.40 | 19.50 (PB+5) | 3 / 9.75 / 9.75 | |
| OA-1 | setback | 1.4 | 0.40 | 21 (PB+6 max) | null / 10.5 / 10.5 | front open; lateral ½·h min 3 |
| OA-2 | setback | 1.6 | 0.40 | 21 (PB+6 max) | 0 / 10.5 / 10.5 | front aligns to vial |
| UAD-1 | setback | 1.0 | 0.60 | 7 (PB+1) | 4 / 0 / 5 | side = party-wall (adosada) |
| UAD-2 | setback | 0.7 | 0.40 | 7 (PB+1) | 5 / 0 / 6 | |
| UAD-3 | setback | 1.0 | 0.60 | 7 (PB+1) | 0 / 0 / 5 | front aligns to vial |
| CTP-1 | alignment | **null (DERIVED)** | 0.80 | 7 (PB+1) | null / null / null | ocup. is a step-fn; 0.80 = >125 m² value |
| MC-1 | alignment | **null (DERIVED)** | 0.70 | **null (TABLE)** | null / null / null | plantas altas 70 % |
| MC-2 | alignment | **null (DERIVED)** | 0.70 | **null (TABLE)** | null / null / null | |
| MC-3 | alignment | **3.5 🔴** | 0.70 | **null (TABLE)** | null / null / null | FAR > range gate [0.2,3.0] → human |
| MC-4 | alignment | **null (DERIVED)** | 0.90 | **null (TABLE)** | null / null / null | plantas altas 90 % |

Each `null` is a *finding with a reason* (see the pack header §NULLS): DERIVED edificabilidad (the
"resultante de las Normas de Composición" algorithm), the per-street-width height TABLE, and the alignment
façade. None is a placeholder to be filled later.

## 3 — What is DELIBERATELY NOT packed (each a cited "no", never an estimate)

| family | disposition | reason |
|---|---|---|
| Uso Industrial | not packed | 1 parcel; calificación does not say the IND subzone (unbindable); ocupación DERIVED (sufficiency trap). Values recorded in `OCR-EXTRACTION-RESULTS.md §2.6`. |
| CTP1-Campo de la Verdad | not packed → refusal | envelope is in the Conjunto Histórico **Tomo VI**, a document we do not hold. Only its parcelación borrows from CTP. |
| Uso Comercial | not packed → refusal | a use overlay; defers to the underlying zone or a Plan Parcial. No single envelope. |
| Elemento protegido | not packed → refusal (`not-determined`) | a preservation regime; the envelope is the existing building, not a new entitlement. |
| Unifamiliar Aislada | not packed | dead `O_UAS1` link; content in no held document. |
| *(blank ordenanza)* — 422 pilot parcels | coverage-gap refusal | the parcel carries no calificación in the join. |

## 4 — The honesty tier (the one control that matters)

The pack's TRUE tier is **`pipeline-extracted-unverified`** — the permanent tier BELOW `estimated-ruleset`
(`ORDINANCE-EXTRACTION-PIPELINE.md §3`), which does not yet exist in `ProvenanceFlags.ts` (OCR-core owns it).
So the pack ships `defaultConfidence:'estimated-ruleset'` and `fieldProvenance:'estimated'` **as
placeholders**, with the intended tiers exported as `CORDOBA_INTENDED_DEFAULT_CONFIDENCE` /
`CORDOBA_INTENDED_FIELD_PROVENANCE`. Because `estimated-ruleset` OVER-states machine-extracted-unverified
confidence, the pack ~~**must stay UNREGISTERED until the tier lands and a human verifies the values**~~
⬆ **SUPERSEDED 2026-08-01 — THE INTERLOCK MOVED, IT DID NOT DISAPPEAR.** The
`pipeline-extracted-unverified` tier landed, so the pack now self-labels it honestly and no longer
over-states; and the pack is **REGISTERED**, because registration wires ROUTING (the coverage globe,
`resolveZoneDisposition`, the subzone resolver) and does **not** authorise output. The interlock is now
the dispatcher's **verification gate** (`CORDOBA_ENVELOPE_VERIFIED = false`), which refuses every
Córdoba parcel *before* the registry is consulted — a strictly stronger guarantee than
unregistered-ness, and one that is proven by driving the real dispatch
(`apps/editor/__tests__/cordobaSiteDispatch.test.ts`) rather than inferred from an import graph.

## 5 — WIRING-TODO (orchestrator / owning PR)

The full ordered list is in the pack file footer. In brief:
1. OCR-core lands `pipeline-extracted-unverified` + `pipeline-extracted` in `ProvenanceFlags.ts`.
2. Flip the pack's `defaultConfidence` + `fieldProvenance` to the intended tiers.
3. **Human-verify** every value in `OCR-EXTRACTION-RESULTS.md §2` against the source crop → `VERIFICATION.md`
   + a C23 AIArtefact `humanApproval` (no-silent-graduation).
4. Register in `registry.ts` (Sur+Noroeste extent + `contains`; `packMap`; a `noRulePackRefusal` for the
   not-extractable families and the blank-ordenanza parcels; a coverage-gap card stating the 2-district scope).
5. Dispatcher resolves the subzone from `ordenanza` + the `O_*` link suffix; renders the louder-than-estimated
   "machine-extracted, unverified" affordance until step 3.
6. Add the CTP-1 ocupación step-function hook (from `sup_pc_m2`) and the MC per-street-width height resolver
   (Córdoba analogue of `bcnAlcadaNucliAntic.ts`) to lift MC/CTP from partial to full.

**Related:** `OCR-EXTRACTION-RESULTS.md` · `CALIFICACION-ENDPOINT-PROBE.md` · `../sources/SOURCES.md` ·
`../../../ORDINANCE-EXTRACTION-PIPELINE.md` · `packages/site-parcel-data/src/rulepacks/esCordobaPGOU2001.ts`.
