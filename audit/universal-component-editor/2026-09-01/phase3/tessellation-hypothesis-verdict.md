# LANE TESS — VERDICT ON THE §5.3 TESSELLATION HYPOTHESIS

**Date:** 2026-09-01 · **Lane:** TESS (audit §12.9 item 5) · **Status:** COMPLETE, verdict issued
**Subject:** `ARCHITECTURE-AND-CONTRACT-AUDIT.md` §5.3 ⭐ *"The cheapest capability gain in the
programme, and it needs no technology"* / lane H `h-technology-investigation.md` §4.6.
**Authority read, in order:** ADR-0376 D1–D5 (D3 metres, D4 expression, D5 `Component` vocabulary) ·
the audit §5.3 + §11.3 + §0.2 · `STR-UNIVERSAL-COMPONENT-EDITOR-MASTER-SPEC.md` §57 + §64.
**Standing rule honoured (audit R1):** this lane proposes **no** new schema, sketch surface,
expression engine, refusal vocabulary or AI tool schema. It contracts what exists and names the gaps.
**Collision boundary honoured (audit R9):** nothing under `packages/schemas/src/siteintel/**` or
`packages/site-parcel-data/**` was read, written or moved. No `git stash`. Nothing committed.

---

## §1 — THE VERDICT, IN ONE PARAGRAPH

**PARTIALLY HOLDS — and the half that holds is NOT the half the audit named.**

The *reasoning* the hypothesis attacks is confirmed dead: `bakeFamilyInstance`'s refusal of
`sweep`/`loft`/`revolve` cites a constraint solver, and **a constraint solver is not what is missing.**
C74 §1.2 is right and the comment is wrong. But the *payoff clause* — *"three of four §57 Solid tools
light up with no new dependency, no WASM and no C74 authorisation"* — **is FALSE, and falsified by
execution.** Routing `solid.kind` to the already-written producers lights up **zero** of the three,
because `SolidFeatureSchema` and `ReferencePlaneSchema` do not carry **six** of the eleven inputs
those producers demand — including the one that decides everything: **a `ReferencePlane` has an
`origin` and a `normal` and no in-plane basis, so a 2-D profile has no determined position in 3-D.**
The blocker was never a solver **and it was never a tessellator either**: it is a **schema gap**.

**What *does* hold, and it is worth having:** extending `profileToPolygon` to flatten `line`/`arc`/
`circle` closed-form lights up **curved `extrude`** — including spec §64's *"arched top"*, the
founder's own headline demo — **with zero new dependency, zero WASM, zero C74 authorisation and zero
schema change.** That was executed end-to-end through the unmodified real bake (§4 below). It is one
tool, not three; it is real, and it is cheap.

> ⭐ **The decision this lane exists to inform: Phase 8 does NOT need a kernel to unblock
> `sweep`/`loft`/`revolve`.** It needs a `formatVersion` bump, a migrator and four persisted fields.
> A kernel would not fix this — an OCCT evaluator handed the same document would be **just as unable
> to place the profile**, because the missing information is not in the evaluator, it is not in the
> document. §7's staged-kernel recommendation is untouched by this verdict and neither confirmed nor
> weakened by it.

---

## §2 — HOW IT WAS TESTED

**Probe:** `packages/family-instance/probes/probe-tess53.local.mts` — the `*.local.mts` convention
already committed under `packages/geometry-wall/probes/` (`git ls-files` → 5 such files) and used by
`audit/europe-site-intel/.../probe-lt-chain.mts`. **It implements nothing.** Every "fix" in it is
six lines long, lives inside the probe, and is thrown away; the point is to measure what the
hypothesis costs, not to pay it. **Phase 8 owns any build.**

```
npx tsx packages/family-instance/probes/probe-tess53.local.mts > /tmp/tess.txt 2>&1; echo "RC=$?" >> /tmp/tess.txt
→ RC=1        (the probe's OWN `process.exit(fail > 0 ? 1 : 0)`, not a crash.
               Terminal line: `PROBE SUMMARY — OK 12 · FAIL 8`. Every FAIL is a
               falsified sub-claim, which is this lane's deliverable, not a defect in it.)
```

⚠ Run in the FOREGROUND, redirected to a file, `$?` read immediately — never piped to `tail`
(audit §13's named measurement hazard). Full transcript: **`phase3/tess-probe-transcript.txt`**.

**Everything it drives is real machinery, never a fake** — `FamilyDocumentSchema` /
`ProfileEntitySchema` / `SolidFeatureSchema` (`packages/file-format/src/family-schema.ts`),
`bakeFamilyInstance` + `profileToPolygon` (`packages/family-instance/src/`), `produceSweep` /
`produceLoft` / `produceRevolve` / `arcToPoints` / `assertValidDescriptor` / `COINCIDENT_M` /
`PARALLEL_RAD` (`packages/geometry-kernel/src/`). Per `[fake-more-capable-than-real]`: a fixture
built from the header cannot falsify the header, so **no producer, schema or evaluator was stubbed.**

**Nothing was committed. No source file was modified.** The only new files are the probe, this
verdict and the transcript.

---

## §3 — THE CLAIM, SPLIT INTO ITS FOUR PARTS, EACH WITH ITS MEASURED OUTCOME

| # | The claim as written in §5.3 / §4.6 | Verdict | Measured evidence |
|---|---|---|---|
| **C1** | *"a fully-determined profile is expressible with an empty `constraints[]`"* — the audit's own stated pre-test | ✅ **HOLDS** | `FamilyDocumentSchema.safeParse` **ACCEPTS** a document whose profiles carry `line` + `arc` entities and `constraints: []`. (E1/E3) |
| **C2** | *"Problem A is closed-form tessellation, not a solver problem"* (C74 §1.2: SOLVING is reserved for simultaneous systems with no closed form) | ✅ **HOLDS** | A six-line trig tessellator reproduces a circular arc to **max \|r−R\| = 2.22e-16 m** at 16 segments. No simultaneity, no iteration, no solver. (E4) |
| **C3** | *"Arc tessellation already exists in the kernel — `arcToPoints`, used by `buildCurvedLayer`"* (§5.3 fact #2) | ⛔ **FALSE** | `arcToPoints` is a **quadratic Bézier sampler**, not a circular-arc tessellator, and it is **not exported from the kernel's public index**. (E4, below) |
| **C4** | *"three of four §57 Solid tools light up with no new dependency, no WASM and no C74 authorisation"* — the payoff | ⛔ **FALSE** | **0 of 3.** `produceSweep`/`produceLoft`/`produceRevolve` demand **11** inputs; the document supplies **3**, decrees **2** by convention, and **6 are absent from the schema**. (E5, E5b, E5c) |

### C3 — why "reuse `arcToPoints`" fails, with the number

`arcToPoints(p0, p1, p2, segments)` in `geometry-kernel/src/producers/_internal/WallPath.ts` samples
`B(t) = (1−t)²P0 + 2(1−t)tP1 + t²P2` — its own header says *"Quadratic Bézier sampler — same formula
as PRYZM 1's `PathResolver.arcToPoints`"*. A quadratic Bézier is **a different curve from a circle**,
so raising `segments` reduces chord error against the *Bézier*, never against the *circle*:

| segments | max \|r − R\| for a 90° arc, R = 1 m | vs `COINCIDENT_M` = 0.001 m |
|---|---|---|
| 8 | 0.060660 m | **×61 OUTSIDE** |
| 32 | 0.060660 m | **×61 OUTSIDE** |
| 256 | 0.060660 m | **×61 OUTSIDE** |
| 4096 | 0.060660 m | **×61 OUTSIDE** |

**And 90° is the generous case.** For spec §64's own *"arched top"* — a **semicircle** — the end
tangents are anti-parallel, so the tangent intersection is at infinity and **no** finite control
point works. Searching k over `[0.1, 8]` for the best symmetric control point `(0, 0, k·R)` gives a
floor of **max \|r−R\| = 0.1077 m at k = 2.215** — **108× `COINCIDENT_M`**. `arcToPoints` cannot
express the founder's headline demo at any tolerance.

⚖ **The fair caveat, stated because it weakens my own finding:** a *chain* of quadratic Bézier spans
converges to a circle. So the claim "`arcToPoints` can be made to work" is not mathematically absurd
— it requires an **arc-subdivision routine that does not exist in this repo**, and writing it is
strictly *more* code than the exact six-line trig tessellator. **The shortest path is not the reuse.**
The other cited precedent, `resolveBoundarySegments` (`geometry-slab/src/boundaryArc.ts`), runs in the
**opposite direction** — it *recovers* quadratic runs *from* a sampled ring. It is an inverse, not a
tessellator. ⚠ This is `[grep-for-the-existing-solver-first]` recurring in reverse: the memory's lesson
was *"grep for the existing solver before writing your own"*; the lesson here is **"having grepped it,
read what it actually computes."** Both cited functions are real. Neither does the named job.

### C1's hidden half — the arc payload is UNCONTRACTED

`ProfileEntitySchema.data` is `z.record(z.string(), z.union([z.number(), z.string(), z.boolean(),
z.null()]))`. Measured: the schema **accepts** `{ id, kind: 'arc', data: {} }` and
`{ id, kind: 'arc', data: { banana: 3, wheelbase: 'blue' } }`. **No key is required and none is
forbidden.** So "a fully-determined profile is expressible" is true at the *type* level and false as
a *contract*: there is no persisted definition of what an `arc` is.

Two rival spellings already exist in the tree and they are incompatible:
`apps/component-editor/src/sketch/entities.ts` `SketchArc` = `{center: EntityId, radius, startAngle,
endAngle}` **in millimetres**; `geometry-kernel`'s `WallPath` arc = `{start, control, end}` **quadratic
Bézier in metres**. **Neither is `ProfileEntitySchema`'s, because `ProfileEntitySchema` has none.**
⛔ There is **no writer** for a non-`point` `ProfileEntity` anywhere in the tree —
`grep 'ProfileSchema'` outside `file-format` returns nothing, and `apps/component-editor` contains
**no serializer to `Profile` and no tessellation code at all**. This is
`[authored-but-unwired-is-the-bottleneck]`: the sketch surface authors arcs into a store that has no
route to the document.

---

## §4 — WHAT ACTUALLY HOLDS: CURVED `extrude`, EXECUTED END-TO-END

`profileToPolygon`'s **return type is `{x, z}[]`** — which is exactly what a closed-form tessellator
emits and exactly what `produceExtrude` consumes. So the extrude arm needs **nothing else**: no plane
basis, no axis, no 3-D lift. Proven by execution (E7): an arched outline was flattened closed-form,
expressed as the point entities the *current* schema and the *current* evaluator already accept, and
run through the **unmodified** `bakeFamilyInstance`:

```
[OK] ARCHED extrude baked through the UNMODIFIED bake: 90 verts, 56 tris,
     hash=extrude:1|h=2.100000|y=0…        (assertValidDescriptor passed)
```

**The only thing standing between spec §64's "arched top" and that descriptor is
`profileToPolygon`'s `ProfileEvalError('profile-needs-solver')` on the first non-`point` entity.**
Confirmed by execution: `profileToPolygon(determinedSection)` throws exactly that code.

**Scope of the win, stated exactly so it is not oversold:**
- ✅ Curved `extrude` — arched windows, rounded profiles, circular columns, filleted mullion sections.
- ✅ Zero new dependency · zero WASM · zero C74 authorisation · **zero schema change** · no
  `formatVersion` bump.
- ⛔ **Not** `sweep`, **not** `loft`, **not** `revolve`.
- ⛔ **Not** under-determined sketches (Problem B) — that remains the genuine C74 §4.2(c) candidate
  and this lane says nothing new about it.

⚠ **Two conditions the implementing lane must carry, or the win becomes a defect:**
1. **Tessellation density must come from `packages/geometry-kernel/src/tolerance.ts`**, never from a
   literal at the call site (audit §5.2's C73 clause; `check-epsilon-policy` is a **RED ratchet at
   322/318** per §11.3 R4 — adding a literal makes it worse, and a ratchet breach is never absorbable
   as debt).
2. **Segment count must be a pure function of the resolved parameters**, or
   `check-deterministic-regeneration` (**RED at 137/134**) regresses further. Regenerate twice →
   byte-identical is the gate, and a density that depends on anything but the inputs breaks it.

---

## §5 — WHY `sweep`/`loft`/`revolve` DO NOT LIGHT UP: THE INPUT-DEMAND LEDGER

Executed against the real producers and a real parsed `FamilyDocument` (E5b). **11 demanded inputs —
3 SUPPLIED · 2 CONVENTION-ONLY · 6 MISSING FROM THE SCHEMA.**

| | Producer demands | Document supplies | |
|---|---|---|---|
| `produceSweep` | `profile: {u,v}[]` closed, metres, local cross-section | `Profile.entities` → `(x,z)` | ⚠ CONVENTION |
| `produceSweep` | **`path: Point3D[]` — WORLD 3-D, ≥2** | `pathProfileId` → **a 2-D `Profile` bound to a plane** | ⛔ MISSING |
| `produceSweep` | `options.closed` | *(no field on the sweep arm)* | ⛔ MISSING |
| `produceLoft` | `section.profile` — **same vertex count in every section** | `profileIds[]`, **no arity rule** | ⛔ MISSING |
| `produceLoft` | `section.worldOrigin: Point3D` | `ReferencePlane.origin` | ✅ SUPPLIED |
| `produceLoft` | **`section.right`** unit, in-plane +U | *(`ReferencePlane` has `origin`+`normal` only)* | ⛔ MISSING |
| `produceLoft` | **`section.up`** unit, in-plane +V | *(same)* | ⛔ MISSING |
| `produceRevolve` | `profile: {r,y}[]`, `r` ≥ 0 from the axis | `(x,z)`; which is `r` and which is `y` is unrecorded | ⚠ CONVENTION |
| `produceRevolve` | **the AXIS** (hard-wired to world +Y) | *(no axis field on the revolve arm)* | ⛔ MISSING |
| `produceRevolve` | `startAngle`/`endAngle` radians | `sweepDeg` degrees | ✅ SUPPLIED |
| `produceRevolve` | `segments` ≥ 3 | `segments` ≥ 3, default 24 | ✅ SUPPLIED |

**The producers themselves are fine** — hand-fed, all three returned descriptors that pass
`assertValidDescriptor`: sweep 20 verts / 20 tris, loft 16 / 12, revolve 72 / 96. §5.3's fact #1
(*"the producers already exist and are complete"*) is **CONFIRMED**. The defect is entirely on the
document side.

### §5.1 — ⭐ THE DECISIVE MEASUREMENT: the plane→world lift is underdetermined by one rotation DOF

`ReferencePlaneSchema` carries exactly `{id, name, origin, normal, isHost}` — measured from the
parsed document, keys printed. A `normal` fixes a plane's *orientation in space* but leaves the
**spin about that normal free**. Two bases, both perfectly orthonormal, both exactly perpendicular to
the same normal, lift the **same document point** `(x=2, z=0)` to:

```
basis A → (2.0000, 0.0000, 0)
basis B → (1.0000, 1.7321, 0)          separation 2.0000 m = 2000 × COINCIDENT_M
```

⛔ **A sweep PATH and every loft SECTION are therefore unplaceable in 3-D from the document as it
stands.** This is not a solver gap and not a tessellation gap. **It is a schema gap**, and it is the
reason C4 fails.

### §5.2 — and DERIVING the basis instead of persisting it is not a fix

The obvious dodge — derive `right`/`up` from the normal by a dominant-axis rule, the trick
`produceSweep` uses internally for its first frame — was tested and **fails on determinism** (E6):

```
normal (0,     1, 0    ) → seed axis (1,0,0)
normal (1e-12, 1, 0    ) → seed axis (0,0,1)      ← flipped
normal (0,     1, 1e-12) → seed axis (1,0,0)
```

Two normals **1e-12 apart — a thousand times below the repo's declared `PARALLEL_RAD` = 1e-9** — pick
**different** seed axes, spinning every profile on that plane by 90°. A derived basis makes profile
orientation **discontinuous under authoring**, and `check-deterministic-regeneration` is already RED.
⛔ It would also be a **second source of truth for orientation** — precisely the §76 Gate B defect the
audit's §4.4 exists to prevent. **Persist the basis; do not derive it.**

---

## §6 — FOUR-AXIS REACHABILITY OF THE PAYOFF

*A claim naming fewer than four axes is not a claim.* This is the reachability of the capability this
lane says **does** hold (curved `extrude`), measured at HEAD:

| Axis | Reading |
|---|---|
| **1 · import / construction** | ✅ for the win: `produceExtrude` **is** on `@pryzm/geometry-kernel`'s public index. ⛔ for the rest: **`produceSweep` / `produceLoft` / `produceRevolve` are NOT exported from it** — the index comment says *"extrude first; sweep / loft / revolve at S53"*. Even had C4 held, axis 1 was broken for all three. |
| **2 · bus verb** | ⛔ **ZERO.** No `family.*` or `component.*` verb dispatches a bake. Every `family.bake.*` hit in the tree is an **OTel span name or span attribute** (`pryzm.family.bake.instance`, `pryzm.family.bake.resolveType`), plus one `'family.created'` event-log `kind` inside a `file-format` test fixture. **A span name is not a verb.** |
| **3 · build graph** | ⚠ **PARTIAL.** `@pryzm/family-instance` is depended on by `apps/bake-worker` and `tests/family-load-into-project` only. **`apps/editor` has zero importers.** ⚠ And `@pryzm/family-instance` sits in `scripts/check/test-ci-coverage-baseline.json`'s `unguarded` list alongside `@pryzm/file-format`, `@pryzm/family-runtime`, `@pryzm/family-loader` and `@pryzm/component-editor` — **they declare `test` but not `test:ci`, so `pnpm -r --if-present run test:ci` skips their suites silently.** The bake's tests do not run in CI. Same defect shape as audit §0.2 item 3. |
| **4 · call** | ⚠ **ONE** production call site — `apps/bake-worker/src/jobs/RebakeFamilyInstanceJob.ts` — and that job's own header says it *"will start emitting `family.instance.placed` events after S56 D4 lands"*. **The one caller is unfed.** |

⛔ **Consequence, stated so the win is not oversold:** lighting up curved `extrude` is a **capability
gain, not a user-visible gain.** It changes what the bake *can* produce; **no user reaches it** until
Phase 4's lanes supply axes 2 and 4. `[committed-is-not-reachable]`. Any lane reporting "curved
profiles work" must read back at the layer the user experiences — C16 **CA-21** is explicit that
`success: true`, a spy, a patch-pair shape and a read-back from the DTO store the handler wrote are
all **not** evidence.

---

## §7 — CORRECTIONS OWED

**To the audit** (each is a measured contradiction of a line it currently states):

1. **§5.3 fact #2 is FALSE.** *"`arcToPoints` already exists in the kernel and is used by
   `buildCurvedLayer`"* → it exists, it is used, and it is a **quadratic Bézier sampler**, not a
   circular-arc tessellator; it is also **not on the kernel's public index**. Residual for a 90° arc:
   **60.7 mm, invariant in `segments`**. For §64's semicircle: **impossible at any tolerance** with a
   single span.
2. **§5.3's payoff clause is FALSE.** *"three of four §57 Solid tools light up"* → **zero of three**,
   for **six schema-side missing inputs**. The correct residue is **curved `extrude`**.
3. **The phrase "three of four §57 Solid tools" conflates two different sets.** §57's **Solid**
   group names **nine** tools (*extrude, revolve, sweep, loft, boolean ∪/−/∩, shell, thicken,
   pattern, array* — eleven if the three booleans count separately). **Four** is the arm count of
   `SolidFeatureSchema`. The honest sentence is *"three of the four `SolidFeatureSchema` kinds"* —
   which is **three of nine §57 Solid tools**, and the audit's own §3.5 already records that
   `SolidFeatureSchema` has **no boolean arm at all** despite `produceBoolean` existing and working.
4. **§13's caution was right and should be kept, not deleted.** *"The §5.3 tessellation hypothesis is
   NOT verified by execution… Lane H is explicit that it did not read `SolidFeatureSchema`'s
   `sweep`/`loft`/`revolve` arms."* **Reading those arms is exactly what falsified the payoff.** The
   audit's own honesty clause found its own error. Record that, because it is the argument for
   keeping such clauses.

**To the code** (naming-vs-behaviour defects found while probing; **not fixed by this lane** — no
source file was modified):

5. ⛔ **`bakeFamilyInstance`'s refusal message names the wrong cause and an expired milestone.** It
   says *"requires the S57 constraint solver to evaluate path/section profiles"*. It requires no
   solver. C74 §1.2 forbids the reasoning; C74 §5.c names the undated-scaffold shape ("S57" passed,
   and `apps/component-editor`'s roadmap puts the solver at **S52**, so the two files do not agree on
   which sprint owed it). The same false cause is repeated in `profileToPolygon`'s header and in its
   `ProfileEvalError` code **`'profile-needs-solver'`** — a **refusal value on the wire**, so C69 §1.1
   makes renaming it a versioned change, not a typo fix. ⭐ **The refusal is still correct BEHAVIOUR
   (§75 satisfied — it refuses rather than substituting an extrude). Only its stated reason is
   false.** Do not "fix" it by making it bake something.
6. ⚠ **`@pryzm/family-instance`'s `package.json` description claims it *"dispatches
   `@pryzm/geometry-kernel` producers (extrude/sweep/loft/revolve)"*.** It dispatches `extrude`.
   C107 §0.2-a's clause — *"a family named for a behaviour it does not have is the
   naming-vs-behaviour defect this repository logs repeatedly"* — applies verbatim.
7. ⚠ **`SolidFeatureSchema`'s `extrude` arm carries a `direction` field that `bakeOneSolid` never
   reads.** `produceExtrude(polygon, heightM, {})` is called with no direction. A persisted,
   validated, migrated field that changes nothing is the L-11530 shape (*"a `persisted` row can be a
   lie in the dangerous direction"*) — the field round-trips, so nothing reports it.

---

## §8 — WHAT PHASE 8 SHOULD DO WITH THIS (recommendation only; this lane implements nothing)

**Split the item the audit filed as one into three, because they have three different costs:**

| | Work | Cost | Needs |
|---|---|---|---|
| **T1** | Closed-form `line`/`arc`/`circle` tessellation in `profileToPolygon` → **curved `extrude`** | ~1 file, density from `tolerance.ts` | **nothing** — no dependency, no WASM, no C74, no schema change |
| **T2** | Define the `ProfileEntity.data` payload per `kind` (a discriminated union in place of `z.record`), and write the `apps/component-editor` sketch → `Profile` serializer that has never existed | schema + `formatVersion` + migrator + the missing serializer | a **contract**, not a kernel |
| **T3** | Persist a **plane in-plane basis** (or a full frame) on `ReferencePlane`; add an **axis** to the `revolve` arm; add a **vertex-arity rule** to `loft`; decide `sweep`'s path representation (3-D polyline vs plane-bound profile) → **then** route `solid.kind` | schema + `formatVersion` + migrator + export the three producers from the kernel index | a **contract**, not a kernel |

⛔ **T1 must not be reported as "sweep/loft/revolve unblocked".** It unblocks curved extrude. Saying
otherwise reproduces exactly the overstatement this lane was sent to falsify.

⛔ **None of T1–T3 is a kernel decision.** An exact B-Rep evaluator handed today's `FamilyDocument`
would be **just as unable to place a loft section**, because the information is absent from the
document, not from the evaluator. §7's staged-kernel trigger stands unchanged; this verdict neither
pulls it forward nor pushes it back.

### §8.1 — ⛔ AND T2/T3 HAVE NO OWNING CONTRACT — a sharpening of audit §0.3 F1 / §11.3 R5

Measured in this tree, 2026-09-01:

```
$ grep -rn "SolidFeatureSchema\|ReferencePlaneSchema\|ProfileEntitySchema" docs/02-decisions/contracts/
(no output)
```

**Not one contract in the suite names any of the three schemas this verdict is about.** And **C110**,
minted concurrently by the Phase-3A lane, does **not** close it: its own **Governs** clause scopes to
*"the parameter, unit and expression semantics of `FamilyParameterSchema` and
`FamilyDocumentSchema.defaults`"* — the **parameter** half of the document. The **geometry** half —
profiles, entities, reference planes, solid features — is governed by **C05 §4, which audit §0.3 F1
measured as describing a format that does not exist** (`family-descriptor.json`; `grep` → no output),
and whose real spec source is a **phase plan** sitting below SPECs in the conflict-resolution order.

⛔ **So T2 and T3 are not "a schema change against a contract" — there is no contract to be wrong
against.** Whoever takes them must first name their owner: extend C110's Governs clause, extend
C111, or mint a geometry-side contract. **Do not let a `formatVersion` bump land with a phase plan as
its only authority** — that is the defect §0.3 F1 exists to stop, and repeating it here would mint a
second instance of it in the same programme.

**No contract is minted by this lane, so no `index-row-<Cxxx>.txt` is owed and
`docs/02-decisions/contracts/README.md` was not touched** (the C00 index protocol has nothing to
apply for TESS). The schema work T2/T3 imply is recorded here as **findings, not as a design** —
audit R1 forbids this lane proposing a `ComponentDefinitionSchema`, and it has not.

---

## §9 — WHAT WOULD FALSIFY THIS VERDICT

*Stated so a blank is never read as "fine".*

- **A persisted in-plane basis I failed to find.** If a `ReferencePlane`'s in-plane orientation is
  determined somewhere I did not read — a migrator default, a loader post-process, a convention
  enforced in `family-loader` — then §5.1 collapses and `loft` becomes reachable. I measured
  `Object.keys` on a **parsed** plane (`id, isHost, name, normal, origin`) and read
  `ReferencePlaneSchema` directly; I did **not** read every file in `@pryzm/family-loader`.
- **A `sweep` path convention in the phase plan.** `family-schema.ts`'s own header cites
  `phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md` §5.2–5.4 as its spec source. **I did not read that
  plan.** If §7.3 there defines the 2-D→3-D lift, the *information* exists — but it would live in a
  phase plan, which sits **below SPECs** in the conflict-resolution order and is not in the contract
  suite, which is audit §0.3 F1's finding restated, not a refutation of this one.
- **A different `arcToPoints` reading.** If someone shows a committed arc-subdivision routine that
  chains quadratic Bézier spans to tolerance, C3's *"not the shorter path"* weakens to *"a longer
  path that exists"*. My grep for `arcToPoints` returned **3 real sites** (`WallPath` definition,
  `WallPath.pathToPolyline`, `buildCurvedLayer`) plus a `geometry-wall` THREE-typed private copy and
  an `.ignored_geometry-kernel` mirror under `geometry-roof/node_modules`. **None subdivides.**
- **The four-axis reading is a point measurement at HEAD.** Axis 2 and axis 4 are exactly what Phase 4
  intends to change. A later reading showing a `component.*` verb is a *change*, not a contradiction.

## §10 — WHAT THIS LANE DID NOT ESTABLISH

- **No GA gate was run by this lane.** Every gate reading quoted here (`check-epsilon-policy` 322/318,
  `check-deterministic-regeneration` 137/134) is **attributed to audit §11.3 R4** and is **NOT
  re-measured**. ⛔ Re-run before quoting — redirect to a file and read `$?` immediately.
- **Nothing was rendered, placed, or typed into a live editor.** The descriptor in §4 was validated by
  `assertValidDescriptor`, which is a *shape* check. **No component was seen.** Audit §5.4's R13 —
  the descriptor path has never run in production — is untouched by this lane.
- **Problem B (under-determined sketches) was not tested at all.** It remains the genuine C74 §4.2(c)
  solving candidate. This lane's verdict says nothing about whether a solver is needed for *it* —
  only that a solver is not what blocks Problem A.
- **No performance measurement.** Tessellation density vs triangle count vs bake time is unmeasured.
- **The `.pryzm-family` round-trip of a tessellated profile was not tested** — the probe parsed and
  baked in-memory; it never wrote or re-read a ZIP.

---

### Artefacts

| Path | What it is |
|---|---|
| `packages/family-instance/probes/probe-tess53.local.mts` | The probe. Uncommitted. Precedent for committing it as-is: `packages/geometry-wall/probes/*.local.mts` (5 committed files). **Orchestrator's call: commit as a probe, or delete.** |
| `audit/universal-component-editor/2026-09-01/phase3/tess-probe-transcript.txt` | Full executed transcript, `RC=1` (OK 12 · FAIL 8). |
| `audit/universal-component-editor/2026-09-01/phase3/tessellation-hypothesis-verdict.md` | This file. |
