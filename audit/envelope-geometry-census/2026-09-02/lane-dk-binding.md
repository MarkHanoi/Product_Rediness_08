# LANE DK-BINDING — byggefelt `bygkunifelt` binding-vs-maximum semantics

**Date:** 2026-09-02 · **Status:** SHIPPED (no commit) · **Goal:** GOAL-3 (envelopes everywhere) ·
**Axis opened:** never-UNDERSTATE (the E5 reconciliation dual of never-overstate).

The census re-proved Denmark's byggefelt as the Type-A exemplar and surfaced a BINDING field
(`bygkunifelt=True`) that the LANDED DK machinery consumed as geometry but did **not distinguish**
from a maximum. This lane types that distinction and records the obligation debt the frozen schema
cannot yet carry.

---

## 1. The binding-vs-maximum transcript (verbatim, from the census)

Source: `audit/envelope-geometry-census/2026-09-02/transcripts-nordic-baltic/dk-byggefelt-cph.json`
(GetFeature `pdk:theme_pdk_byggefelt_vedtaget`, Strandgade/Christianshavn bbox, GeoJSON EPSG:4326,
HTTP 200, `totalFeatures: 2826`). Both features are in the SAME pull.

### MAXIMUM — feature `1490813`, Lokalplan 477 "Strandgade Nord" (København)

```
id            1490813
planid        9438203       lokplan_id 1468290    komnr 101 (København)
lp_plannr     "477"         lp_plannavn "Strandgade Nord"
bygkunifelt   False         bygvejledende True        ← ADVISORY (indicative) field
maxetager     2             maxbygnhjd 6              eareal 250
doklink       https://dokument.plandata.dk/20_1468290_1786976657855.pdf
geometry      MultiPolygon, one 7-vertex ring [[12.5957240557,55.6760893799], …]
```

→ TYPED **`maximum`**: the field geometry is a buildable-area **UPPER BOUND**
(`footprintIsUpperBound = true`, `footprintIsRequired = false`, `obligationRepresentation =
schema-native`). This is the CURRENT behaviour — the drawn footprint capped at `maxbygnhjd`.
Cited to Lokalplan 477 + doklink.

### BINDING — feature `1214869`, Lokalplan 593 "Lindgreens Allé II" (København)

```
id            1214869
planid        9669527       lokplan_id 9654905    komnr 101 (København)
lp_plannr     "593"         lp_plannavn "Lindgreens Allé II"
bygkunifelt   True          bygvejledende False       ← BINDING: "byggeri kun i felt"
maxetager     1             maxbygnhjd 4              eareal null
doklink       https://dokument.plandata.dk/20_9654905_1593760927385.pdf
geometry      MultiPolygon, one 5-vertex ring [[12.6213320572,55.6668985476], …]
```

→ TYPED **`binding-obligation`**: the field is a **MANDATORY placement** — the building MUST occupy
it (a MIN obligation), NOT a maximum. `footprintIsUpperBound = false` **AND** `footprintIsRequired =
true`. Cited to Lokalplan 593 + doklink. Carries the OWED marker + the exact caveat
`"This is a REQUIRED field, shown as its geometry; obligation semantics owed."`

**The point:** the SAME polygon means OPPOSITE things — a maximum says "no MORE than this"; a
`bygkunifelt=true` field says "no LESS than this". Drawing the binding field as merely permitted
UNDERSTATES the obligation. That is the failure this lane names.

---

## 2. Obligation-representation status: **OWED BY NAME** (not faked)

`BuildableEnvelope` (C58 §2.4, `packages/schemas/src/site/zoning/BuildableEnvelope.ts`) carries
`footprintIsUpperBound: z.boolean().default(false)` — the MAX side — and **nothing** on the
MIN/obligation side. There is no `footprintIsRequired`. The schema is FROZEN this lane.

Handled per the lane's honesty rule (never fake, record OWED):

- The distinction is typed correctly in the package-local `DkByggefeltEnvelopeContribution`
  (`footprintIsRequired` is a field of THAT type, not of the L0 schema).
- The debt is recorded by name in `DK_BYGGEFELT_OBLIGATION_OWED`
  (`id: 'OBLIGATION-SEMANTICS-OWED'`), with the proposed field
  `BuildableEnvelope.footprintIsRequired: z.boolean().default(false)` and the ADR it is owed against
  (a superseder over C58 §2.4).
- The interim behaviour ships a binding field down the SAME geometry/maximum (explicit-area) path
  the envelope already has, with the typed caveat — so it is never rendered as a solved permission.

**OWED:** `BuildableEnvelope.footprintIsRequired` (a MIN/required-placement flag). Until a
superseding ADR mints it, the obligation half of a binding byggefelt lives in the package-local
contribution + the caveat, not in the shipped schema shape.

---

## 3. What was built (new files only — no schema, no dk-parcel, no sibling wave touched)

- **`packages/site-parcel-data/src/rulepacks/dkByggefeltBinding.ts`** — the pure L2 resolver
  `resolveDkByggefeltEnvelopeContribution(props)`. Reuses the single classifier
  `classifyByggefeltLegalStatus` (bindingness is NOT re-decided) and routes height/storeys through
  `resolveDkPlanEnvelope` (the L-449 signed mapping — so a real Copenhagen point flows THROUGH
  dkPlandataEnvelope, not a twin). Maps legal status → envelope semantics:
  `binding → binding-obligation` · `illustrative / not-declared → maximum` ·
  `metadata-conflict / metadata-unavailable → not-placeable` (§NULL-IS-NOT-FALSE: a null flag is not
  a fake maximum). Exports `DK_BYGGEFELT_OBLIGATION_OWED`, `DK_BYGGEFELT_REQUIRED_FIELD_CAVEAT`,
  `dkByggefeltCitation`.
- **`packages/site-parcel-data/__tests__/dkByggefeltBinding.test.ts`** — 19 tests against the
  RECORDED census fixtures (1490813, 1214869) + the four existing `byggefeltFixtures`.
- **`packages/site-parcel-data/src/index.ts`** — additive barrel export block only (reachability).

Untouched, as required: schemas (frozen), dk PARCEL files, PL-POG, FR envelope, all
parcel/context/perf/UI waves, the never-overstate gate, the placement resolver, the classifier.

---

## 4. Proofs

- **New suite:** `pnpm --filter @pryzm/site-parcel-data exec vitest run
  __tests__/dkByggefeltBinding.test.ts` → **19 passed / 19**, RC=0.
- **Scoped tsc:** `tsc -p packages/site-parcel-data/tsconfig.json --noEmit` — my two files are
  **clean** (0 errors). The single remaining tsc error is a SIBLING's untracked file
  `__tests__/frPrescriptionGeometry.test.ts` (`Pt` not exported from index) — out of this lane
  (FR prescriptions), pre-existing.
- **Never-overstate gate:** `npx tsx tools/ga-gate/check-envelope-never-overstates.ts` →
  **RC=0** after (was RC=2 before, whose sole cause was a sibling's in-flight FR plan-masse arm,
  fixed by that sibling between runs — the after/before diff is ONLY the FR arm, nothing this lane
  touched). All DK arms green: `§DK-DENOMINATOR-LIVE Nørrebro (GFA 5664 ≤ 5664)` /
  `Aarhus (FAR withheld, naive 14927 absent)`. Verdict: *"0 overstatement(s) across 191
  zone-solve(s)"*. My module is a new pure function not walked by the gate, so it is neutral to it.

### Falsification (each attempted, each caught)

- **Flip a maximum fixture's byggefelt to exceed the parcel → never-overstate catches it.** The REAL
  `solveExplicitArea` clips a 40×40 (1600 m²) field to a 20×20 (400 m²) parcel → `areaM2 = 400`
  (NOT 1600), `footprintCoversParcel = true`. The excess is clipped; the field cannot over-state
  past the plot. The recorded 1490813 ring (projected) flows through the same solve with preserved
  (never-over) area.
- **Mistype a binding field as permitted → a fixture arm catches the understatement.** The
  §UNDERSTATE-GUARD arm asserts `binding.semantics !== maximum.semantics`,
  `binding.footprintIsRequired === true`, `binding.footprintIsUpperBound === false`, and
  `binding.obligationOwed !== null`. Collapsing the binding field to the maximum reading fails all
  four; the OWED caveat is asserted present.
- **Byte-identical restore.** Deleting the two new files and reverting the single additive index
  export block returns the tree byte-identical.

---

## 5. Shared-tree note

The tree carried heavy concurrent sibling activity (FR prescriptions, ~11 new country adapters,
PL-POG). This lane added ONLY new files + one additive barrel export, so it collides with nothing
and reverts cleanly. The two "sibling" items above (FR frPrescription tsc error; the FR plan-masse
gate arm) are NOT this lane's and are explicitly out of scope (FR envelope = untouched).
