# LANE 4D — PROFILE EVALUATION + THE GEOMETRY ADAPTER

**Date:** 2026-09-02 · **Owns:** `packages/family-instance/**` · `packages/geometry-kernel/src/index.ts`
(barrel re-exports only) · **Gate:** §76 **F** (geometry derived from canonical intent)
**Authority read, in order:** ADR-0376 **D1–D5 + addendum D9/D10** · audit §12 PHASE 4 row **4D**,
§11.3 R1–R14, §12.0 standing rules · `STR-UNIVERSAL-COMPONENT-EDITOR-MASTER-SPEC.md` §17–20, §57,
§63–§70, §75 · **C110** (parameters/units/expressions) and **C111** (component definition) as the
canonical contracts this lane touches · inherited: `phase3/tessellation-hypothesis-verdict.md`,
`phase4/lane-4a-parameter-engine.md`, `phase4/lane-4b-schema-delta-and-migrators.md`.

**Handoff received: 4B = null.** 4B's file was nevertheless on disk (mtime **2026-09-02 00:06**) and
its source edits were in the tree uncommitted; this lane read both and built on the tree, not on the
handoff. ⭐ Every inherited claim was **re-measured from source**, never quoted — see §1.

> ⛔ **Every number in this document was read from a redirected file with `$?` taken immediately.**
> No reading came through a pipe. Nothing was committed. `git stash` was never used.
> `packages/schemas/src/siteintel/**` and `packages/site-parcel-data/**` were never opened.

---

## §0 — THE HEADLINE, IN FOUR SENTENCES

1. **The half of §5.3 that holds, holds — and it is now executed.** `profileToPolygon` flattens
   `line` / `arc` / `circle` closed-form, so **curved `extrude` works**, including spec §64's
   *"arched top"*: **186 verts / 120 tris, every head vertex on the circle to 9.833e-8 m** — four
   orders of magnitude inside the kernel's declared `COINCIDENT_M`.
2. ⛔ **The lane row's instruction to route arcs "through the existing `arcToPoints`" cannot be
   followed, and this lane re-falsified that from source rather than citing the inherited verdict.**
   `arcToPoints` is a quadratic Bézier sampler; its error against a true circle is **0.060660 m and
   INVARIANT in `segments` (8, 32, 256, 4096 — all identical)**, and for a **semicircle no finite
   control point exists at all** (best-`k` floor **0.1077 m**, 108 × `COINCIDENT_M`). The audit line
   that says otherwise is FALSE and the correction is owed (§7).
3. **The `switch (solid.kind)` is gone.** `bakeFamilyInstance` now takes an injected
   **`GeometryAdapter`** port (spec §18: *"the kernel is an EVALUATOR"*), capabilities are declared
   by method PRESENCE, and `produceSweep` / `produceLoft` / `produceRevolve` are exported from the
   kernel barrel and implemented on the default adapter.
4. ⛔ **`sweep` / `loft` / `revolve` still refuse — and the refusal no longer lies.** It named "the
   S57 constraint solver"; the true cause is **six missing SCHEMA fields**, decisively a
   `ReferencePlane` with no in-plane basis. **That is lane 4B's delta and it is written out in §5,
   ready to take.** ⛔ No solver was built (C74 §4.1).

**Acceptance §67-partial: MET.** Rectangular, arched, polygon (hexagon) and rhomboid profiles
**regenerate from parameters**, read back from the descriptor. `packages/family-instance` suite
**5 → 23 tests, RC=0**; **18 of the 18 new tests were SEEN FAILING** at HEAD.

---

## §1 — WHAT WAS RE-MEASURED RATHER THAN INHERITED, AND WHY IT MATTERED

The brief told me to read `phase3/tessellation-hypothesis-verdict.md` first. I did — and then
re-measured its three load-bearing claims, because **its subject moved after it was written**:

| Artefact | mtime | |
|---|---|---|
| `phase3/tessellation-hypothesis-verdict.md` | 2026-09-01 **18:34** | the verdict |
| `packages/file-format/src/family-schema.ts` | 2026-09-01 **23:54** | **its subject, edited by lane 4B five hours later** |

A verdict about `ReferencePlaneSchema` and `ProfileEntitySchema` written *before* the lane that
rewrote that file is exactly the shape `[verification-artifact-can-predate-subject]` warns about.
`probes/probe-4d-arc.local.mts` re-reads all three from source at HEAD-with-4A/4B-in-tree.

**Transcript: `phase4/lane-4d-probe-arc.txt` · RC=0 · FAIL 0.**

```
COINCIDENT_M (declared, geometry-kernel/src/tolerance.ts) = 0.001 m

--- E1: arcToPoints (quadratic Bezier) vs a TRUE circle, 90 deg, R = 1 m ---
  segments=   8  max|r-R| = 0.060660 m  = 60.7x COINCIDENT_M
  segments=  32  max|r-R| = 0.060660 m  = 60.7x COINCIDENT_M
  segments= 256  max|r-R| = 0.060660 m  = 60.7x COINCIDENT_M
  segments=4096  max|r-R| = 0.060660 m  = 60.7x COINCIDENT_M

--- E2: spec §64 ARCHED TOP (semicircle, R = 1 m) — best single Bezier ---
  best k = 2.215   floor max|r-R| = 0.1077 m = 108x COINCIDENT_M

--- E3: closed-form trig tessellation, same semicircle ---
  n= 16  max vertex |r-R| = 2.220e-16 m   chord sagitta = 4.815e-3 m

--- E4: ReferencePlaneSchema / ProfileEntitySchema re-read AFTER lane 4B ---
  ReferencePlane parsed keys: id, isHost, name, normal, origin
  basis A -> (2.0000, 0.0000, 0.0000)
  basis B -> (1.0000, 0.0000, 1.7321)      separation 2.0000 m = 2000x COINCIDENT_M
  arc with {banana:3} accepted=true; arc with {} accepted=true
```

⭐ **The three inherited claims SURVIVE lane 4B unchanged** — `ReferencePlane` still carries no
basis, `ProfileEntity.data` is still an uncontracted `z.record`, and `arcToPoints` is still a Bézier.
**That is a re-measurement, not a citation**, and it is what licenses building on them.

---

## §2 — WHAT LANDED

| Lane-row item | State | Where |
|---|---|---|
| Extend `profileToPolygon` to flatten `line`/`arc`/`circle` | ✅ **closed-form** | `src/profileToPolygon.ts` `§4D-CLOSED-FORM-PROFILE` |
| …*"through the existing `arcToPoints`"* | ⛔ **REFUSED, with the measurement** | §1, §7 correction 1 |
| Export `produceSweep`/`produceLoft`/`produceRevolve` | ✅ + their types | `geometry-kernel/src/index.ts` |
| Replace `bakeFamilyInstance`'s `switch (solid.kind)` with an injected `GeometryAdapter` | ✅ | `src/geometryAdapter.ts` `§4D-GEOMETRY-ADAPTER` |
| ⛔ If the hypothesis fails, say so and stop — no solver | ✅ **said so, stopped, no solver** | §5 |
| **§67 partial: rectangular / arched / polygon / rhomboid regenerate FROM PARAMETERS** | ✅ **executed** | §3 |
| *(not in the row, found while doing it)* extrude `direction` was persisted and never read | ✅ **now refuses** | §6.1 |
| *(not in the row)* two hand-written mm→m divides would have existed | ✅ **one seam** | `src/units.ts` `§4D-ONE-LENGTH-SEAM` |
| *(not in the row)* 4B left this package's suite type-broken | ✅ **fixed, 1 → 0 in-package `error TS`** | §6.3 |

**Files changed (NOT committed):**

```
 M packages/family-instance/__tests__/bakeFamilyInstance.test.ts
 M packages/family-instance/src/bakeFamilyInstance.ts
 M packages/family-instance/src/index.ts
 M packages/family-instance/src/profileToPolygon.ts
 M packages/geometry-kernel/src/index.ts                 (barrel re-exports ONLY)
?? packages/family-instance/__tests__/profileRegeneration.test.ts
?? packages/family-instance/src/geometryAdapter.ts
?? packages/family-instance/src/units.ts
?? packages/family-instance/probes/                       (3 *.local.mts probes)
```

⛔ **Nothing outside the two owned paths was written.** No serialize-only file was opened. No
ceiling raised, no gate disabled, no `gate-debt.json` entry.

---

## §3 — ACCEPTANCE: §67-PARTIAL, EXECUTED

### §3.1 — ⛔ Where the property is read back (audit R14 / C16 CA-21)

**Every assertion reads `BufferGeometryDescriptor.position` — the buffer the REAL `produceExtrude`
returned from inside the REAL, unmodified `bakeFamilyInstance`.** Not `profileToPolygon`'s return
value (that is the function under test, and reading a property back out of the function that
computed it is precisely R14's "trusting a test's name"), not `ok: true`, not a spy. If the polygon
were right and the bake dropped it, every test below fails.

### §3.2 — The measured shapes (`phase4/lane-4d-probe-shapes.txt`, RC=0)

```
COINCIDENT_M = 0.001 m
segmentsForSweep(R=0.6 m, sweep=PI)   = 28
segmentsForSweep(R=0.5 m, sweep=2PI)  = 50
segmentsForSweep(R=6.0 m, sweep=PI)   = 87

shape       | verts | tris  | x-extent | z-extent | max |r-R| on the curve
Rect        |    24 |    12 | 1.2000   | 1.5000   | —
Arched      |   186 |   120 | 1.2000   | 2.1000   | 9.833e-8 m
Hexagon     |    36 |    20 | 1.0000   | 0.8660   | —
Rhomboid    |    24 |    12 | 1.5000   | 1.5000   | —
Circle      |   300 |   196 | 1.0000   | 0.9980   | 1.255e-8 m

ok=true baked=5 unsupported=0
```

⚖ **The honest reading of `9.833e-8 m`, stated because it is NOT the `2.220e-16` of §1's E3.** The
trigonometry places each vertex on the circle to double precision; the **descriptor stores
`Float32Array`**, so ~1e-7 m is float32's resolution at metre scale, not the tessellator's error.
It is still **10,000 × inside `COINCIDENT_M`**, against the Bézier's **0.1077 m**, which is
**108 × outside** it. The comparison is not close.

⭐ **`Circle` z-extent 0.9980 vs x-extent 1.0000 is the density formula working, not a defect.** With
50 segments from angle 0 no vertex lands exactly at π/2; the inscribed-polygon sagitta is
`R(1−cos(π/50)) = 9.86e-4 m` — i.e. **the density is chosen so the chord error sits exactly at the
declared tolerance and no tighter**, which is the whole point of taking it from `tolerance.ts`.

### §3.3 — Regeneration, and its negative controls

| Test | What changes | What must NOT change |
|---|---|---|
| RECTANGULAR | `Width` 1200 → 1800 ⇒ x-extent 1.2 → **1.8 m** | depth stays **1.5 m** |
| ARCHED | `Width` 1200 → 2000 ⇒ crown 2.1 → **2.5 m** (`Height + Width/2`) | — |
| POLYGON | `R` 500 → 1000 ⇒ extent 1.0 → **2.0 m** | **exactly 6** unique XZ vertices survive |
| RHOMBOID | `Skew` 300 → 900 ⇒ x-span 1.5 → **2.1 m** | ⛔ **the two bottom corners stay 1.2 m apart** — it is the LEAN that moved, not the base |

⭐ The rhomboid's negative control is the one that matters: an implementation that simply scaled the
whole profile would pass every "it got bigger" assertion and fail this one.

### §3.4 — Determinism

Four profiles baked twice in one process: `position`, `index` and `descriptor.hash` all
**byte-identical**. `segmentsForSweep` is a pure function of `(radius, sweep, COINCIDENT_M)` — no
clock, no counter, no random, **and deliberately no `lod` input** (see §6.2).

⚠ **NOT PROVEN, and not claimed: CROSS-MACHINE determinism** (C73 §5.4-b). `Math.acos`/`cos`/`sin`
are not required to be correctly rounded. The claim is *"deterministic on one engine version"* —
the exact wording the audit's Phase-5C row instructs lanes to use until measured otherwise.

---

## §4 — FALSIFICATION

### §4.1 — Seen failing (`phase4/lane-4d-tests-SEEN-FAILING.txt`)

The four source files reverted with `git checkout --` (no stash), the NEW suite run against HEAD:

```
⎯⎯⎯⎯⎯⎯ Failed Tests 18 ⎯⎯⎯⎯⎯⎯⎯
 Test Files  1 failed | 1 passed (2)
      Tests  18 failed | 5 passed (23)
RC=1
```

**18 of 18 new tests fail without the change; the 5 pre-existing tests still pass** — so the failure
is the new property, not a broken harness.

⚠ **One arm was WEAKER than it looked and was strengthened rather than counted.** *"a STRING
coordinate with no resolvable parameter refuses instead of defaulting to zero"* **passed at HEAD**
on the first cut (HEAD's `typeof x === 'number'` check already refused a string). It is now also
asserted on the **classification** — `'unsupported-feature'` (not determined by the resolved scope)
where HEAD reported `'profile-eval-failed'` (a malformed coordinate) — which is a real falsifier.
Before that fix the count was **17**; it is recorded here because a "18 seen failing" that was
really 17 is the kind of number this programme keeps having to correct.

### §4.2 — Byte-identical restore (sha256)

Recorded before the first edit, re-verified after each of the three revert/restore cycles:

```
49c81dbbdff21390f07278a420ac4c5337b24027c1b3cb1bb41fa8d2e00309be  src/profileToPolygon.ts     (mine)
cba4d6b01dabf8debdb51840e52f79cfb872a87e148440e073e1acec61c7f1eb  src/bakeFamilyInstance.ts   (mine)
fc7ebc1262da5132cccb5c64bc4b1b54d1e5cad2c8c1f7dc43cbb61171fa0cda  src/index.ts                (mine)
eb6fd334a12a12e15f390f959f6e3ad8a43cc354569143f09dcbf9ee529a994c  geometry-kernel/src/index.ts (mine)

e140c006819f1127b3ccccb2c84d7360134c14f81a3a3137b543ffa6a13439ed  src/profileToPolygon.ts     (HEAD)
d23e438b5a35e912c5f46411a267771f30242e7960f97cb61891afd10462205a  src/bakeFamilyInstance.ts   (HEAD)
bbf627c9db1195b6f811346e20832d612f63b37c4e2bb737342d4b4ed1521311  src/index.ts                (HEAD)
f6f25449bab3bcf534ce90aaa4d5edb3ed518f614e405c31e766c4f0506eda56  geometry-kernel/src/index.ts (HEAD)
```

### §4.3 — ⭐ THE BACKWARD-COMPATIBILITY CONTROL: the v1 path is byte-identical, proven by hash

A rewrite of the profile walker is worthless if it silently changes what every existing document
bakes to. `probes/probe-4d-legacy-parity.local.mts` bakes the committed v1 all-`point` door fixture
and hashes the descriptor's raw buffers. Run under BOTH source states:

| | `phase4/lane-4d-legacy-parity-BEFORE.txt` (HEAD) | `phase4/lane-4d-legacy-parity-AFTER.txt` (this lane) |
|---|---|---|
| verts / tris | 24 / 12 | 24 / 12 |
| geometry hash | `extrude:1\|h=2.100000\|y=0.000000\|m=extrude\|default\|v=0.000000,0.000000\|…` | *identical* |
| **DESCRIPTOR_SHA256** | **`5c5f1282186f2eb2588b85e762aae9f132092e32d346d9ff65bfe61f65cf947d`** | **`5c5f1282186f2eb2588b85e762aae9f132092e32d346d9ff65bfe61f65cf947d`** |

**The mechanism that guarantees it** is `§4D-CONSTRUCTION-BY-REFERENCE`: an entity is construction
geometry iff another entity REFERENCES it. In a v1 all-`point` profile nothing is referenced, so
every point still emits, in document order, through the identical arithmetic.

### §4.4 — Gates: re-run in the foreground, `$?` from a redirect, before AND after

| Gate | Before | After | Verdict |
|---|---|---|---|
| `check-epsilon-policy` | RC=**3** · E2 **306**/246 · E5 **92**/72 · E4 0 | RC=**3** · E2 **306** · E5 **92** · E4 **0** | **unchanged**; ⭐ E3 CONSUMPTION **39 → 40** production (+1: `profileToPolygon` consumes `COINCIDENT_M`) and 10 → 11 in tests — the gate's only movable arm moved the right way |
| `check-deterministic-regeneration` | RC=**3** · D1 **92**/84 · D2 **46**/41 · D3 9/9 | RC=**3** · D1 **92** · D2 **46** · D3 **9** | **unchanged** |
| `check-no-hidden-mock` | (R4: RC=3) | RC=**3** · 3 findings vs declared 0 | **unchanged**; the 3 are `AnthropicRelay` / `VoiceCommand` / `constraint-solver` — **zero mention of any file in this lane** |
| `check-predicate-canonical` | (R4: 139/138) | RC=**3** · C1 3 PIP rivals | **unchanged**; **zero mention of any file in this lane** |

⛔ All four were **already RED at HEAD** (audit §11.3 R4). This lane **did not touch a baseline, a
ceiling or `gate-debt.json`**, and grepping each gate's output for `family-instance` /
`geometryAdapter` / `profileToPolygon` returns **nothing except the epsilon gate's E3 CONSUMPTION
list** — the positive arm.

### §4.5 — Suites and typecheck

| Command | Result |
|---|---|
| `pnpm --filter @pryzm/family-instance test` | **RC=0 · 23/23** (was 5/5) |
| `pnpm --filter @pryzm/geometry-kernel test` | **RC=0 · 852/852 across 50 files** |
| `pnpm --filter @pryzm/family-instance typecheck` | RC=2 · 1893 `error TS` · ⭐ **0 of them in `src/`, `__tests__/` or `probes/` of this package, and 0 in `../geometry-kernel`** |
| `pnpm --filter @pryzm/bake-worker test` | RC=1 · 18 pass, **1 file fails: `ReferenceError: DOMMatrix is not defined`** |

**The bake-worker failure is PRE-EXISTING and was proven so, not assumed.** The identical run with
this lane's four files reverted to HEAD produces the **identical** failure and the identical
18-pass/1-fail split. It is the same `pdfjs-dist` → `DOMMatrix` root cause lane 4B recorded in its
§0 — see §6.4, because it is now known to disable a **third** suite.

The 1893 typecheck errors are the pre-existing strict-mode transitive tree (`geometry-wall` 266,
`core-app-model/views` 180, `input-host` 158, …), exactly as lane 4A measured; **no consumer of the
two changed APIs is among them, and both changes are strictly additive** (an optional second
parameter on `profileToPolygon`, an optional field on `BakeFamilyInstanceInput`, and new barrel
exports). `profileToPolygon` has **no caller outside this package**; `bakeFamilyInstance` has two,
both passing an object literal.

---

## §5 — ⛔ THE SCHEMA DELTA, HANDED TO LANE 4B

**This is the deliverable the brief asked for in place of a work-around.** After this lane the
producers are complete, exported, and implemented on the adapter. **The ONLY thing between a
document and a sweep/loft/revolve is persisted fields.** ⛔ An exact B-Rep kernel would be **just as
unable**: the information is absent from the DOCUMENT, not from the evaluator. **Do not build a
solver** (C74 §4.1) — and do not derive what must be persisted (§5.2).

### §5.1 — The delta

| # | Where | Add | Why, in one line |
|---|---|---|---|
| **D-4D-1** ⭐ | `ReferencePlaneSchema` | an **in-plane basis** — e.g. `right: Vec3` (unit, ⊥ normal), with `up = normal × right` derived, or a full frame | `{origin, normal}` leaves the **spin about the normal free**: two legal orthonormal bases lift `(x=2, z=0)` to points **2.0000 m apart** (measured §1 E4b). Without it a 2-D profile **has no determined position in 3-D at all** — this one field blocks all three kinds. |
| **D-4D-2** | `SolidFeatureSchema` `sweep` arm | the PATH as **3-D**, or a rule lifting `pathProfileId` via D-4D-1 | `produceSweep(profile, path: Point3D[])` wants world 3-D; the document has a plane-bound 2-D `Profile`. |
| **D-4D-3** | `SolidFeatureSchema` `sweep` arm | `closed: boolean` | `SweepOptions.closed` decides whether end caps exist; **the arm has no field for it at all**. |
| **D-4D-4** | `SolidFeatureSchema` `loft` arm | a **vertex-arity rule** on `profileIds[]` | `produceLoft` throws unless every section has the same vertex count; the schema states no such rule, so an unevaluable shape is persistable (C111 §9.3). |
| **D-4D-5** | `SolidFeatureSchema` `revolve` arm | the **AXIS** (origin + direction) | `produceRevolve` measures `r` from an axis it hard-wires to world +Y. |
| **D-4D-6** | `ProfileSchema` / `SolidFeatureSchema` `revolve` arm | which document ordinate is `r` and which is `y` | Today it is **convention only**, recorded nowhere. |
| **D-4D-7** | `ExtrudeOptions` (⚠ `geometry-kernel`, not `file-format`) | a direction/axis | `SolidFeature.extrude.direction` is persisted and **`produceExtrude` has no way to honour it** — see §6.1. |
| **D-4D-8** ⭐ | `ProfileEntitySchema.data` | a **discriminated union per `kind`** replacing `z.record` | `{}` and `{banana: 3}` both parse as an `arc` (measured §1 E4c). §6.5 states the read contract this lane had to adopt in the evaluator **because the schema declares none**. |

### §5.2 — ⛔ DERIVING the basis is not a fix, and the reason is measurable

The obvious dodge — derive `right`/`up` from the normal by a dominant-axis rule — makes profile
orientation **discontinuous under authoring**: two normals **1e-12 apart**, a thousand times below
the repo's declared `PARALLEL_RAD = 1e-9`, select different seed axes and spin every profile on that
plane by 90°. It would also be a **second source of truth for orientation**, which is the §76 gate B
defect. **Persist it.**

### §5.3 — ⛔ AND D-4D-8 HAS NO OWNING CONTRACT

`grep -rn "SolidFeatureSchema\|ReferencePlaneSchema\|ProfileEntitySchema" docs/02-decisions/contracts/`
returned nothing when lane TESS ran it, and **C110 does not close it** — its Governs clause scopes to
the *parameter* half of the document. The **geometry** half is governed by C05 §4, which audit §0.3
**F1** measured as describing a format that does not exist. ⛔ **Whoever takes this delta must name
its owner first** (extend C110's Governs, extend C111, or mint a geometry-side contract). Landing a
`formatVersion` bump with a phase plan as its only authority is the defect F1 exists to stop.

---

## §6 — FINDINGS THIS LANE MADE (not in its row)

### §6.1 ⭐ `SolidFeature.extrude.direction` was persisted, validated, migrated — and NEVER READ

`ExtrudeOptions` is `{material?, worldY?}`. `produceExtrude` builds along **+Y, always**. The bake
called `produceExtrude(polygon, heightM, {})` and **never looked at `solid.direction`**, so a
document asking for a horizontal extrusion silently got a vertical one — the **L-11530 shape** (*"a
`persisted` row can be a lie in the dangerous direction"*), and spec §75's *"no visual-only state"*.

**It now REFUSES** (`unsupported-feature`, message naming the field and the missing
`ExtrudeOptions` axis), tested. ⚠ **Behaviour change**, confined to documents setting a non-default
direction: the schema default is +Y and **no writer for any other value exists in the tree.** The
real fix is **D-4D-7**, in the kernel, not here.

### §6.2 `SolidFeature.lod` is the SAME SHAPE, still open

`lod: {coarse, medium, fine}` is persisted on all five solid arms and **nothing in the bake reads
it**. This lane deliberately did **not** feed it into `segmentsForSweep` — LOD-dependent density
would make regeneration non-byte-identical while `check-deterministic-regeneration` is already RED —
but it is the same "validated field that changes nothing" defect and it is **named, not fixed**.

### §6.3 ⚠ Lane 4B left this package's suite TYPE-BROKEN, and only `typecheck` could see it

4B reported *"downstream: … `family-instance` **5 pass**"* — true, and **not the whole reading**.
`pnpm --filter @pryzm/family-instance typecheck` reported the fixture was no longer a
`FamilyDocument`: `defaults` had been removed and `representations` / `connectors` / `propertySets` /
`featureEdges` added. **Vitest transpiles without checking, so a green suite proved nothing about
it.** Fixed in place (the key removed, the four arrays added) — **1 → 0 in-package `error TS`**.
⭐ The transferable lesson: after a schema change, `test` and `typecheck` are two different readings
and the passing one is the weaker.

### §6.4 ⛔ `DOMMatrix` now disables a THIRD suite — including the ONE production caller's

4B recorded two suites collecting zero tests from `pdfjs-dist` → `ReferenceError: DOMMatrix is not
defined` (`family-round-trip`, `family-loader/loadFamily`). Measured here: **`apps/bake-worker`'s
`RebakeFamilyInstanceJob.test.ts` is a third**, and that job is the **only production caller of
`bakeFamilyInstance` in the tree**. So the bake's single real integration point has **no executing
test**, for a reason unrelated to the bake. Root cause is a barrel import dragging a browser
dependency into a Node suite — `[server-safe-entry-can-import-browser-ui]`. **Named, not fixed:
`packages/file-format/**` is lane 4B's.**

### §6.5 The `ProfileEntity.data` read contract this lane had to adopt

Because the schema requires no key (§1 E4c), the evaluator had to read *something*. ⭐ **It reads the
spelling that already exists** (audit R1: EXTEND, do not mint) — `SketchPoint` / `SketchLine` /
`SketchCircle` / `SketchArc` from `apps/component-editor/src/sketch/entities.ts`, the S52–S53 sketch
surface ADR-0376 **D1** rules is HARVESTED. Only the unit differs (the sketch store is mm, the
document metres).

| kind | keys | notes |
|---|---|---|
| `point` | `x`, `z` | |
| `line` | `p1`, `p2` | ids of sibling `point` entities |
| `circle` | `center`, `radius` | `center` = id of a sibling `point` |
| `arc` | `center`, `radius`, `startAngle`, `endAngle` | radians, CCW from +X; sweep taken **as authored**, never normalised, so an authored major arc is not silently shortened |
| `spline` | — | ⛔ **refused**: no spline control-point spelling exists anywhere in the repo, so the curve is not determined by the document (spec §75 — not approximated) |

Every length key and every angle key may be a **number** (document units) **or a string expression**
evaluated against the resolved parameter scope. ⛔ **This is a READ contract enforced by refusal, not
a persisted one** — until **D-4D-8** lands, a document can persist an `arc` this evaluator must
refuse and nothing upstream stops it.

### §6.6 ⭐ Parameter-driven profiles needed NO schema change — and that is the §67 result

`ProfileEntitySchema.data` already admits `string`. So a coordinate may be an **expression**,
evaluated through `@pryzm/family-runtime` — **the one expression engine; this lane mints none**
(R1). That is the entire mechanism behind "regenerate from parameters", and it costs zero schema,
zero migrator, zero `formatVersion` bump.

⭐ **The scope is KINDED, not bare numbers.** Lane 4A's `§UNIT-KIND-ERASURE` fix made `EvalScope`
accept `{value, kind}`, which is what gives `UnitMismatchError` a reachable throw site; passing bare
numbers here would have opted every profile-coordinate expression **out** of that refusal — 4A's
defect re-opened one package downstream. `buildEvalScope` carries each parameter's `dataType`
through `kindOfDataType`.

### §6.7 ⚠ `§4D-ONE-LENGTH-SEAM` — the 1000× hazard this lane would otherwise have doubled

ADR-0376 **D3** rules metres canonical and calls two canonical length units *"a 1000× defect
class"*. Lane 4A **correctly did not execute D3**: `family-runtime`'s `CANONICAL_LENGTH_UNIT` is
still `'mm'`, with a guard test asserting the OWED state. So a value **out of the runtime** is
millimetres and a value **authored in the document** is metres.

That conversion used to be one invisible `lengthMm / MM_PER_M` inside the extrude arm. This lane
adds a second consumer (expression-valued coordinates), and **two hand-written ÷1000s is exactly how
a 1000× defect survives a migration**. Both now call `runtimeLengthToMetres` in `src/units.ts`, so
**D3 is one line here** when it lands. ⚠ Angles are deliberately **not** converted and the absence is
declared: radians is canonical on both sides, and adding a seam there would invent the defect.

---

## §7 — CORRECTIONS OWED (to documents this lane does not own)

1. ⛔ **Audit §12 lane-4D row and §5.3 fact #2: *"through the existing `arcToPoints`"* is FALSE.**
   Re-measured from source by this lane (§1): a quadratic Bézier's error against a circle is
   **0.060660 m and invariant in `segments`**, and a **semicircle — spec §64's own demo — is
   impossible at any tolerance with one span** (floor 0.1077 m). The row should read *"flatten
   `line`/`arc`/`circle` **closed-form**; `arcToPoints` is a quadratic Bézier sampler and cannot do
   it"*. (Lane TESS owed the same correction; it is restated because the row is what the next lane
   reads.)
2. **The refusal message no longer says *"requires the S57 constraint solver"*.** The code
   `'profile-needs-solver'` is **NOT renamed** — it is a refusal value on the wire and C69 §1.1 makes
   that a versioned change. ⭐ Instead it **stops being thrown where it was false** (a determined
   `line`/`arc`/`circle`) and **keeps being thrown where it is true** (an entity whose data does not
   determine it — C74 §4.2(c)'s genuine under-determined case). The name and the behaviour now agree
   without a wire change.
3. **`@pryzm/family-instance`'s `package.json` description** still claims it *"dispatches
   `@pryzm/geometry-kernel` producers (extrude/sweep/loft/revolve)"*. It dispatches `extrude` and
   refuses the rest. ⚠ **Deliberately left**: C107 §0.2-a's naming-vs-behaviour clause applies, but
   editing a `package.json` mid-fleet is `[agent-packagejson-breaks-frozen-lockfile]` territory and
   the honest text depends on §5's delta landing. **Orchestrator's call.**
4. **Lane 4A's O-5 recurs here, and this is the second lane it has blocked.** `@pryzm/family-instance`
   declares `test` but **no `test:ci`**, and is **line 27 of
   `scripts/check/test-ci-coverage-baseline.json`**. ⛔ **These 23 tests do not run in CI.** The fix
   is two lines in two files — and **both halves must land together**, because adding `test:ci`
   without striking the baseline row leaves a STALE ledger entry, which that gate reports as a
   finding. The baseline file is outside this lane's ownership, so it is **named, not done**.
   ⭐ Two lanes have now been stopped by the same two lines; it should be one orchestrator commit.

---

## §8 — FOUR-AXIS REACHABILITY (a claim naming fewer than four axes is not a claim)

| Axis | Reading at HEAD |
|---|---|
| **1 · import / construction** | ✅ `produceExtrude` **and now** `produceSweep`/`produceLoft`/`produceRevolve` are on the kernel's public index, with their types. `GeometryAdapter` / `kernelGeometryAdapter` / `segmentsForSweep` / `runtimeLengthToMetres` are on `@pryzm/family-instance`'s. |
| **2 · bus verb** | ⛔ **ZERO.** No `family.*` or `component.*` verb dispatches a bake. Every `family.bake.*` string in the tree is an **OTel span name or attribute**. **A span name is not a verb.** This is lane **4C**'s. |
| **3 · build graph** | ⚠ **PARTIAL.** `grep -rn "@pryzm/family-instance" apps/editor` → **no files found**. And `package.json` scripts are `{test, test:watch, typecheck}` — **no `test:ci`** — with `@pryzm/family-instance` on line 27 of the unguarded baseline: **this suite is silently skipped by `pnpm -r run test:ci`.** |
| **4 · call** | ⚠ **ONE** production call site, `apps/bake-worker/src/jobs/RebakeFamilyInstanceJob.ts` — and **its own test file cannot execute** (§6.4). |

⛔ **Therefore: this is a CAPABILITY gain, NOT a user-visible gain.** Curved and parameter-driven
profiles now bake; **no user reaches them** until axes 2 and 4 exist. `[committed-is-not-reachable]`.
⛔ **Nothing in this lane was rendered, placed, or seen.** Lane **4E** owns that, and audit §5.4 R13
— the descriptor path has never run in production — is untouched here.

---

## §9 — WHAT WOULD FALSIFY THIS LANE

*Stated so a blank is never read as "fine".*

- **A committed arc-subdivision routine I failed to find.** If some file chains quadratic Bézier
  spans to tolerance, §1's conclusion weakens from *"cannot"* to *"a longer path exists"*. I searched
  `arcToPoints|startAngle|tessellateArc|sampleArc` across `**/*.ts` (**36 files**) and read the
  candidates; none subdivides. ⚠ **A `grep` through the Bash tool returned EMPTY for the same pattern
  the ripgrep tool matched 36 files on** — `[grep-silence-has-three-causes]` fired mid-lane, and the
  36-file reading is the one that was checked.
- **A ProfileEntity payload spelling that is authoritative and different from §6.5's.** I adopted the
  sketch surface's because it is the only one that exists and D1 harvests it. If a writer appears
  with different keys, the evaluator must move to it — **and the schema, not this file, must say so**
  (D-4D-8).
- **A `Float32Array` precision objection.** §3.2's `9.833e-8 m` is float32 resolution, not
  tessellation error. If a consumer needs better, the descriptor's element type is the subject, not
  `profileToPolygon`.
- **A caller relying on `profileToPolygon` refusing every non-`point` entity.** There is none
  (no caller outside this package), but a future one written against the old behaviour would break.
- **The gate readings are point measurements at HEAD-with-4A/4B-uncommitted-in-tree.** All four were
  already RED; a later reading that differs is a *change*, not a contradiction. ⛔ Re-run them.

## §10 — WHAT THIS LANE DID NOT ESTABLISH

- **Nothing was rendered.** No committer, no `scene.mount`, no viewport. §67's own list also contains
  **multi-curve, sweep, boolean and "exact geometry where supported"** — none of which this lane
  delivers, and three of which §5 explains are schema-blocked.
- **`boolean` is refused, not wired.** `produceBoolean` exists and works, but evaluating a boolean
  feature needs a **feature-graph ORDER** (which solids are consumed and therefore must not also
  appear in the output). 4B added `featureEdges[]` and **declared it INERT** with **ADR-0376 D7
  OPEN**. ⛔ Wiring it would decide D7 by accident and freeze it. The refusal names D7.
- **No `.pryzm-family` round trip of a curved profile.** Everything here was parsed and baked
  in-memory; nothing was written to or re-read from a ZIP.
- **No performance measurement.** Tessellation density vs triangle count vs bake time is unmeasured;
  the Circle profile is 300 verts where a v1 4-point profile is 24, and nobody has looked at what
  that costs at scale.
- **Problem B (under-determined sketches) was not touched.** It remains the genuine C74 §4.2(c)
  solving candidate. This lane only narrows `'profile-needs-solver'` **onto** it.
- **The three probes are uncommitted.** Precedent for committing `*.local.mts` exists
  (`packages/geometry-wall/probes/` — 5 committed files). **Orchestrator's call: commit or delete.**

---

### Artefacts

| Path | What it is |
|---|---|
| `packages/family-instance/probes/probe-4d-arc.local.mts` | independent re-falsification of the `arcToPoints` route + the schema re-read after 4B |
| `packages/family-instance/probes/probe-4d-legacy-parity.local.mts` | the v1 byte-identity control (descriptor sha256) |
| `packages/family-instance/probes/probe-4d-shapes.local.mts` | descriptor census for the §67 shapes |
| `phase4/lane-4d-probe-arc.txt` · `-probe-shapes.txt` | executed transcripts, RC recorded |
| `phase4/lane-4d-tests-SEEN-FAILING.txt` · `-tests-PASSING.txt` | 18 failed / 5 passed → 23 passed |
| `phase4/lane-4d-legacy-parity-BEFORE.txt` · `-AFTER.txt` | identical `DESCRIPTOR_SHA256` |

---

## §11 — INDEPENDENT RE-VERIFICATION ADDENDUM (2026-09-02, second 4D session)

A second lane-4D session was dispatched and found this document and every source edit already in
the tree, uncommitted (findings doc mtime 2026-09-02 08:27; sources 07:59–08:24). Per the standing
mtime rule it **VERIFIED BY EXECUTION rather than redid**. Every command below was run fresh in the
foreground, redirected to a file, `$?` read immediately.

| Check | Result | Transcript |
|---|---|---|
| Working-tree sha256 of the 4 modified files | **all four match §4.2's "mine" hashes exactly** | (inline in falsify-sha256) |
| `pnpm --filter @pryzm/family-instance test` | **RC=0 · 23/23** | `lane-4d-VERIFY-suite-PASSING.txt` |
| `probe-4d-shapes.local.mts` | **RC=0** — §3.2's table reproduced digit-for-digit (Arched 186/120, max\|r−R\| 9.833e-8 m; `ok=true baked=5 unsupported=0`) | `lane-4d-VERIFY-probe-shapes.txt` |
| `probe-4d-legacy-parity.local.mts` (lane state) | **RC=0** — `DESCRIPTOR_SHA256=5c5f1282…cf947d`, identical to §4.3's BEFORE and AFTER | `lane-4d-VERIFY-legacy-parity.txt` |
| `probe-4d-arc.local.mts` | **RC=0 · FAIL 0** — E1 invariant 0.060660 m, E2 floor 0.1077 m, E4a/b/c all still hold at HEAD-with-4B | `lane-4d-VERIFY-probe-arc.txt` |
| **Falsification re-run**: 4 owned source files → `git checkout --` (HEAD; hashes matched §4.2's HEAD row), new tests kept | **RC=1 · 18 failed / 5 passed** — same split as §4.1 | `lane-4d-VERIFY-falsify-SEEN-FAILING.txt` |
| Restore from scratchpad byte-copies | **sha256 all four = §4.2 "mine" hashes** (byte-identical) | `lane-4d-VERIFY-falsify-sha256.txt` |
| Suite after restore | **RC=0 · 23/23** | `lane-4d-VERIFY-falsify-RESTORED-GREEN.txt` |
| `pnpm --filter @pryzm/geometry-kernel test` (the barrel is the one file owned outside the package) | **RC=0 · 852/852 across 50 files** | `lane-4d-VERIFY-geometry-kernel.txt` |
| Root `tsc --skipLibCheck` | **RC=0 · 0 `error TS`** at the build script's own `--max-old-space-size=6144`. ⚠ At Node's DEFAULT heap it dies **OOM RC=134 before typechecking anything** — that RC is the heap, not the tree; the transcript records both runs so neither reading is mistaken for the other. | `lane-4d-VERIFY-root-tsc.txt` |

**Method notes.** No `git stash` (the 4 tracked files were byte-copied to the session scratchpad,
reverted with `git checkout --`, restored by copy, equality proven by sha256 against §4.2's recorded
hashes — the untracked files stayed in place throughout). The `git diff` of
`packages/geometry-kernel/src/index.ts` was read in full: **re-exports + comment only**, within the
barrel-only ownership. ADR-0376 addendum **D9/D10** were read: neither binds 4D beyond what §8/§10
already state (no rival kind minted, nothing mounted, descriptors only). Nothing was committed;
`packages/schemas/src/siteintel/**` and `packages/site-parcel-data/**` were never opened.

**What this addendum does NOT re-establish.** The four RED-at-HEAD gate readings in §4.4 were not
re-run by this session (they were before/after-verified by the first session and this lane's files
appear in none of their findings); the §4.5 downstream rows (`bake-worker` DOMMatrix,
family-instance package `typecheck`) were not re-run — root tsc RC=0 is the stronger superset
reading for type health. The §7/§8 OWED items are unchanged and still owed: `test:ci` +
baseline-row (two lines, two files, one orchestrator commit), the `package.json` description,
the audit §12 row's false `arcToPoints` clause, and the §5 schema delta D-4D-1…8 which remains
**handed to lane 4B with no owning contract named** (§5.3).
