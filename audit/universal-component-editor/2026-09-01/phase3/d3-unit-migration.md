# D3 — the metres-canonical migration plan for the component stack

**Lane U · 2026-09-01 · OWED, not executed.** Authority: `ADR-0376` **D3** (metres is canonical at
every model boundary). Verdict required by the lane brief: *"if it is larger than one coherent
change-set, DO NOT half-do it."*

## Verdict: LARGER THAN ONE CHANGE-SET. Not executed. The reason below is measured, not estimated.

The parameter axis alone is genuinely small — six files, all test-reachable-only. **It is not the
whole boundary**, and executing it alone produces exactly the state the brief forbids: `metres is
canonical` true of parameters and false of sketch coordinates, with no gate saying which is which.

---

## 1 — What ADR-0376 D3 did not know: the seam ALREADY disagrees with itself

D3 frames the problem as *"two canonical length units in one repository."* The measurement is
sharper, and worse. Inside the component stack there is **one seam where the two conventions meet
and only one of the two axes converts**:

| Axis into `produceExtrude` | Declared unit | Converted? | Where it is declared |
|---|---|---|---|
| **height** | mm → m | **YES** — `heightM = lengthMm / MM_PER_M` | `bakeFamilyInstance.ts` §`MM_PER_M` |
| **profile polygon** | **metres** | **NO** — passed straight through | `profileToPolygon.ts` header: *"Each point's `data` carries `x` and `z` numeric coordinates in METRES"* |

And the surface that will author those profile points declares the opposite:

- `apps/component-editor/src/sketch/entities.ts` — *"Coordinate convention: XZ plane in
  millimetres … millimetres internally so the constraint solver's tolerance"*
- `apps/component-editor/src/sketch/transform.ts` — *"World units: millimetres in the XZ plane"*

⭐ **This is LATENT, not live — state it that way and do not overstate it.**
`grep -rln "Profile\b" apps/component-editor/src` → **0 files**. The component editor has a
`SketchEntity` store and **no writer from the sketch into `.pryzm-family` `profiles[]`**. Nothing
today feeds mm into a metres contract. The 1000× is a **contract mismatch between two surfaces that
are not yet joined** — and that join is precisely the work D3 exists to unblock.

**Consequence for the plan:** this migration is not "change a constant." It must *decide the sketch
coordinate unit*, and that decision is coupled to the constraint solver's tolerance — which is the
stated reason the sketch chose mm. Nobody has measured that coupling. The measurement is a
prerequisite, not a step.

## 2 — Four-axis reachability (why the cost is bounded — verified on four axes, not one)

ADR-0376 D3 justifies "payable now" with a single measurement (`grep '@pryzm/family-runtime'
apps/editor` → 0). All four axes agree, so the premise holds. Recorded here so the next reader does
not have to re-derive it:

| Axis | Reading |
|---|---|
| **import / construction** | `apps/editor` → **0** imports of `@pryzm/family-runtime`, `family-instance`, `family-loader` |
| **bus verb** | `packages/schemas/src/registry.ts` → **0** `family.*` verbs registered |
| **build graph** | `@pryzm/family-runtime` is declared by exactly **3** manifests: `family-instance`, `family-loader`, itself. No app, no plugin. |
| **call** | `bakeFamilyInstance(` → **1** production call site, `apps/bake-worker/src/jobs/RebakeFamilyInstanceJob.ts`. That job's own export `processFamilyInstanceJob` is called from **tests only** (`apps/bake-worker/__tests__/`, `tests/family-load-into-project/`). No route, no queue consumer. |

⇒ **The stack is test-reachable only.** No production data is in millimetres, and **no
`.pryzm-family` document exists anywhere in the repo** (`find . -name "*.pryzm-family"` → none), so
there is **no migration corpus and no `formatVersion` bump required**. That single fact is what
makes this cheap — and it stops being true the moment the first component is authored and saved.

⛔ **This is a DECAYING window.** Defer past the first saved `.pryzm-family` and the cost changes
class: from an edit to a data migration with a format-version bump.

## 3 — The exact change-set

### Group A — the parameter axis (`@pryzm/family-runtime`) · 4 files

1. `src/expression/unit-coercion.ts` §`toCanonical` — the ONLY conversion function in the package.
   `case 'm'` becomes identity; `case 'mm'` becomes `value / 1000`. Angles are untouched (radians is
   already canonical and D3 does not rule on it).
2. `src/expression/unit-coercion.ts` header — *"length parameters → millimetres"* and *"`5 m + 200
   mm` resolves to `5200` mm cleanly"* both become metres (`5.2`).
3. `src/types.ts` — two docstrings: `FamilyParameterDataType` (*"stored in millimetres"*) and
   `FamilyParameter.defaultValue` (*"Always in canonical units (mm / rad)"*).
4. `__tests__/unit-coercion.test.ts` — the arms named *"treats mm as canonical"* and *"converts
   m → mm by ×1000"* **invert**. `__tests__/evaluator.test.ts` — `evaluate('5 m + 200 mm')`
   goes `5200` → `5.2`.

### Group B — the bake seam (`@pryzm/family-instance`) · 2 files · NET DELETION

5. `src/bakeFamilyInstance.ts` — delete `MM_PER_M`, delete `heightM = lengthMm / MM_PER_M`, rename
   `lengthMm` → `lengthM`, and correct `evalLengthExpression`'s docstring (*"Returns the value in
   millimetres"*).
6. `__tests__/bakeFamilyInstance.test.ts` — fixture defaults `2100` → `2.1`, `900` → `0.9`,
   `50` → `0.05`; the comments *"Height resolves to 2100mm = 2.1m"* and *"Override Height to 3000mm
   = 3.0m"* each collapse to one number.

⭐ **Group B is why metres is the SIMPLIFYING choice, not merely the ruled one.** After it,
`profileToPolygon`'s metres contract and the height axis agree **for the first time**, and the
seam's only conversion disappears. The migration removes code rather than adding it.

### Group C — integration fixtures · 1 file

7. `tests/family-load-into-project/family-load-into-project.test.ts` — the parameter defaults and
   the `heightOverride = 2000 + i * 5` sweep are mm literals.

### Group D — ⛔ THE BLOCKER. The sketch coordinate system.

8. `apps/component-editor/src/sketch/{entities,transform}.ts`, plus every file that inherits the
   convention: `snap.ts`, `hitTest.ts`, `SketchCanvas.ts`, `commands/constraint/addDistance.ts`,
   `sketch/tools/*`.

**Group D cannot ride along with Groups A–C, for three measured reasons:**

- The mm choice carries a **stated engineering rationale** — solver tolerance — and the coupling
  between that tolerance and the coordinate scale **has been measured by nobody**. Changing the
  scale without that measurement is changing solver behaviour blind.
- `ADR-0376` **D1 rules this application RETIRED**, its assets harvested onto the canonical bus.
  Re-unit-ing code that is ruled for retirement is work done twice or work thrown away — and D1 is
  itself gated on a Phase-7 lane.
- It lives behind a **different composition root** (`createFamilyEditorRuntime`, ADR-0316 — the one
  rival `check-single-compose` counts), so it is a different review surface with different owners.

## 4 — Sequencing, and the gate that must exist first

⛔ **Do not start at Group A.** Groups A–C are the easy two-thirds, and they are precisely the
two-thirds that create a silent 1000× if Group D never lands. The order is:

1. **Measure the solver-tolerance ↔ coordinate-scale coupling** in `apps/component-editor`'s
   constraint path. This is a measurement task, not a migration task, and it decides Group D.
2. **Settle D1 first if it is going to be settled at all.** Retirement moves the sketch onto the
   canonical bus, where its unit becomes the canonical unit by construction — Group D may evaporate
   entirely. Executing Group D before D1 is the likeliest wasted work in this plan.
3. **Then A + B + C + D as ONE change-set**, with the gate below merged in the same commit.
4. **`formatVersion` is NOT bumped** — but only while `find . -name "*.pryzm-family"` stays empty.
   Re-run it at the start of the lane. If it returns a file, this plan is void and a migrator
   (`scale-length-parameters`, a sibling of `introduce-expression`) becomes step 0.

**The gate that does not exist and must.** Without it, "metres is canonical" is a sentence in an ADR
— which is the exact failure class this audit is about (`L-809`, `L-812`, `L-12830`):

`tools/ga-gate/check-canonical-length-unit.ts` — asserts that no file in the component stack
declares millimetres as a *storage* unit, with the Group-D sketch files as a **named, shrink-only
baseline** so the outstanding half is *counted and printed on every run* rather than silently owed.
That is the `MAX_RIVALS` treatment — **baselined, not allowlisted** — and for the same reason:
a debt that disappears from the output is indistinguishable from no debt.

## 5 — Falsification, for when it is executed

Set a `length` parameter default to `2.1`, author `1200mm` as a literal inside an expression, bake,
then assert the extrude descriptor's height is `2.1` and the literal resolved to `1.2`. Revert
`toCanonical`'s two cases → the conversion-at-parse arm must fail **naming the literal and BOTH
numbers** (`1200` vs `1.2`), never a bare *"expected 1.2"*. Restore byte-identically and re-run.

⛔ **The negative control that actually matters:** a fixture whose numbers are unit-ambiguous (`1`,
`2`, `10`) **cannot falsify a 1000× error** — both readings look plausible and the assertion passes
either way. Every fixture value in this migration must be one where the mm and m readings differ by
three orders of magnitude *and both are physically plausible for the quantity*. `2.1 m` / `2100 mm`
is such a value. `1` is not.
