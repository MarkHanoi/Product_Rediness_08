# LANE 4F — THE AUTHORING UI

**Date:** 2026-09-02 · **Authority:** ADR-0376 **D2** (+ D1, D4, D9/D10 as context) ·
`ARCHITECTURE-AND-CONTRACT-AUDIT.md` §12 Phase 4 row **4F** · spec §63–§70, **§76 gate J** ·
C86 §10.1 **PR-1/PR-2/PR-8/PR-9** + §10.6.1 · C74 **§4.6** · C110 **§2.2/§2.4/§2.5/§3.3** ·
C111 (profile/plane/parameter schemas).
**OWNS:** `apps/editor/src/ui/component/**` *(new)* · `apps/editor/src/ui/ElevationOutlineSurface.ts`
*(serialize-only, held by this lane)* · **+ one line** in root `vitest.config.ts` (see §6).
**NOT COMMITTED** — per the brief.

---

## 0 — THE ONE-PARAGRAPH ANSWER

The surface's **subject** was generalised from *a wall elevation* to *a `Profile` on a declared
`ReferencePlane`* **by extending the one surface, not forking it**; a **constraint-glyph layer**
was added that draws C74 §4.6.0's two constraint vocabularies as two visibly different things and
**refuses to author the eight kinds nothing evaluates**; and the **parameter table** that has been
a TYPE with nothing behind it since S55 now has a body that shows **which of C110 §2.2's four
sources supplied every number**. **Gate J is GREEN**: the reachability spec, both other panel
specs, the wall-profile chrome suite and the C86 PR-2 non-regression baseline all pass at the same
counts as before the change (**94 tests, RC=0 on every arm**), and PR-9's own obligation — *"the
general path must not change one byte of the rectangle"* — is discharged against a byte fixture
**generated from the pre-change file**. Root `tsc` RC=0 over the whole repo.

⚠ **The one thing this lane did NOT achieve, stated first:** the new UI has **no production
importer**. It is reachable on three of the four axes and **not on the build graph** — see §7,
which names the seam and what must exist before it can be mounted. That is
`[[authored-but-unwired-is-the-bottleneck]]`, declared rather than discovered.

---

## 1 — GATE J — MEASURED, BEFORE AND AFTER

Every run foreground, redirected, `$?` read from the redirect on the next line (never a pipe).

| Suite | BEFORE | AFTER | Transcript |
|---|---|---|---|
| `openingProfilePanelReachability.spec.ts` (**gate J names this one**) | 19 passed · RC=0 | 19 passed · RC=0 | `lane-4f-BASELINE-gateJ-reachability.txt` · `lane-4f-AFTER-gateJ-panel.txt` |
| `finishTypeOutlineSection.spec.ts` (caller 3 — `FinishTypeEditorModal`) | 6 passed · RC=0 | 6 passed · RC=0 | same pair |
| `wallProfileEditorChrome.test.ts` (caller 1 — `WallProfileEditor`) | 30 passed · RC=0 | 30 passed · RC=0 | `lane-4f-BASELINE-gateJ-wpe-chrome.txt` · `lane-4f-AFTER-gateJ-wpe-chrome.txt` |
| `WPE1WallProfileEditMode.test.ts` + **`WallProfileNonRegressionBaseline.test.ts`** (C86 §10.1 **PR-2**) | 39 passed · RC=0 | 39 passed · RC=0 | `lane-4f-BASELINE-gateJ-pr2-and-wpe1.txt` · `lane-4f-AFTER-gateJ-pr2-and-wpe1.txt` |
| **TOTAL** | **94 · RC=0** | **94 · RC=0** | — |

**The third caller, `WindowOutlineEditorDialog`, is covered inside the reachability spec** (its
§OUTLINE81 block drives *"Edit outline…"* through `setWindowOutlineEditorOpener`), which is why
gate J names that spec and "all three callers" in one breath. Measured, not assumed:
`grep -l` over `**/*.{spec,test}.ts` returns exactly three files naming the three callers.

**Other gates re-run at HEAD-with-this-lane:**

| Gate | Result |
|---|---|
| root `tsc -p tsconfig.json --noEmit --skipLibCheck` | **RC=0**, zero errors repo-wide (`lane-4f-tsc-root.txt`) |
| `npx eslint` over both owned paths | **RC=0** (`lane-4f-eslint.txt`) |
| `tools/ga-gate/check-layer-boundaries.ts` | **RC=0** — *"within baselines (violations 48/102, unclassified 13/13, sdk-bypass 159/182)"* |
| lane 4F's own suite | **3 files · 40 tests · RC=0** |

⚠ **Two measurement notes worth carrying forward.**
1. **The root `tsc` aborts (RC=134, a V8 OOM) without a raised heap.** `NODE_OPTIONS=--max-old-space-size=8192` was required. A lane that read RC=134 as "failed" would report a false red; one that read it as "ran" would report a false green. Neither is true — it did not run.
2. **The tree moved under this lane mid-run.** An intermediate `tsc` reported one error in `packages/runtime-composer/src/composeRuntime.ts` (`'opts' is declared but its value is never read`); the file's mtime was **inside this lane's window** and its own new comment says `§ENVELOPE-REACHES-THE-BUS (lane 4H)`. The final re-run is clean. **Not this lane's file, not this lane's error, and not a residual defect** — recorded because a transcript timestamped mid-edit is exactly what produces a wrong attribution later.

---

## 2 — DELIVERABLE 1 — THE SUBJECT IS NOW A PROFILE ON A DECLARED PLANE

**`§SUBJECT-IS-A-PROFILE-ON-A-DECLARED-PLANE`** (in `ElevationOutlineSurface.ts`'s header).

### 2.1 What was actually done, and why it is small on purpose

The surface gained **one optional field** (`plane`), one getter, and a `<title>`/two `data-*`
attributes emitted only when that field is present. The **substantive** half of the
generalisation is `apps/editor/src/ui/component/profileSurfaceAdapter.ts`, which turns a document
`Profile` into the ring the surface already draws.

⭐ **That the surface change is small is the RESULT, not a shortcut.** Audit **R1** rejects any
lane proposing a new sketch surface; C86 §10.6 rule 4 already made the wall modal and the two
opening callers *"two CALLERS of one surface rather than two implementations of one idea"*. A
generalisation that needed to rewrite the surface would have been evidence the extraction was
wrong. It did not.

### 2.2 Why a `plane` field is the whole generalisation and not decoration

C86 §10.6.1a is normative that the admissibility boundary is **plane inference**, not the letter
"3-D": *"a gesture is admissible in 3-D iff its result is determined without inferring a work
plane."* This surface was always on the admissible side — **but only by accident of its callers**,
because nothing in it NAMED a plane. `plane` makes the declaration structural and readable, so
*"the author meant this plane"* is a value the surface carries rather than one a reader
reconstructs from which modal happened to open it. §10.6.1c's three forbidden shortcuts —
nearest face, last selection, camera forward axis — are impossible here by construction: the field
is what the caller passed, or `null`, and there is no other code path that can set it.

### 2.3 ⛔ PR-8 INHERITED — the size vocabulary did NOT become `{u, v}`

The obvious move was to rename `extents: {length, height}` to `{u, v}` for a component profile
whose axes really are called u and v. **It was rejected on PR-9's own terms.** PR-8 generalises as
a PRINCIPLE — *"ONE metres-valued size vocabulary per record … the rule that transfers is the
prohibition"* — so admitting a second spelling would mint the nonsense state (both set) and make
every consumer learn two ways to ask one question. The axis NAMES are presentation
(`plane.uLabel` / `vLabel`); the size FIELDS stay `length`/`height` for every subject.

### 2.4 ⭐ PR-1 INHERITED — and the finding that matters most in this section

**There are two arc flatteners in this repository and they are not interchangeable.**

| Flattener | Density | Subject |
|---|---|---|
| `outlineArcSegment` (`geometry-wall/OutlineAuthoring.ts`) | fixed 16 chords (`OUTLINE_ARC_SEGMENTS = BOUNDARY_ARC_SEGMENTS`) | the surface's own 3-click arc **GESTURE**, for wall/opening outlines |
| `profileToPolygon` + `segmentsForSweep` (`family-instance`, lane 4D) | tolerance-driven closed-form trig | a **DOCUMENT's** `arc`/`circle` entities |

⛔ **The adapter samples NOTHING.** It calls lane 4D's `profileToPolygon` — the same function
`bakeFamilyInstance` feeds to the kernel — so **what the author sees drawn is what the bake
extrudes, because it is the same flattening.** PR-9 names the alternative outcome explicitly: *"A
component sketch surface that tessellates its own arc is the second producer"*, with
`CurtainWallTool`'s rival `ARC_SEGMENTS = 10` beside `boundaryArc.ts`'s 16 as the live cautionary
case. Writing a third sampler here would have produced a drawing that disagreed with its own
solid — and no test in either package would have caught it, because each would have been
self-consistent.

**The rule for the next lane, written down so it is inherited:** the day a component profile gains
a 3-click arc gesture, that gesture **writes an `arc` ENTITY and lets `profileToPolygon` flatten
it**. It does not append the gesture's chords.

### 2.5 ⛔ `§NO-SILENT-DEPARAMETRISATION` — most profiles are READ-ONLY on this surface

The surface edits a **ring of vertices**. A profile carrying an `arc`, a `circle` or an
expression-valued coordinate carries INTENT a ring cannot hold. Committing an edited ring over it
would replace a parametric curve with sixteen chords and a formula with a frozen number —
**silently, with a save button attached**. `profileWriteBackDisposition` refuses it by name and the
panel shows the refusal before the author makes a gesture (the status line reads
`read-only — profile 'Arched opening' carries a 'arc' entity …`).

Three refusals, each with its own reason and live alternative (C16 CA-18):

| Case | Refusal code | Why |
|---|---|---|
| `arc` / `circle` / `spline` / `line` entity | `profile-not-a-ring-source` | a curve replaced by its flattening |
| expression-valued `x`/`z` | `profile-not-a-ring-source` | spec §64's *"glass width is always opening width − 2 × frame width"* frozen to a literal — **the D4 defect one layer over** |
| vertex inserted or deleted | `profile-vertex-count-changed` | closing the gap needs NEW entity ids, and **id minting is uncontracted** — L-666 OPEN, C11 §7.6's own clause still *"Proposed"*. ⛔ Minting here would have added a fourth measured violation to that ledger to make an editor gesture work. |

### 2.6 ⛔ `§ANCHOR-BY-CONTAINMENT` — and the gap it exposes

A glyph is anchored only where a constraint's entities resolve to `point` entities whose numeric
coordinates are **exactly** a ring vertex. Nothing picks the nearest vertex: C15 §2.2.2 axis 3 is
normative that a subject is *resolved by containment, never by proximity*, and a glyph that
drifted onto the wrong edge would assert a constraint the document does not carry. Ambiguity (two
entities at one coordinate) is **also** refused rather than resolved by picking one.

⚠ **OWED → `packages/family-instance` (lane 4D's file).** `profileToPolygon` already computes a
per-vertex `sourceId` internally (`EmittedPoint.sourceId`) and **discards it at the return**.
Exposing it would let any consumer join `constraints[].entityIds` to polygon vertices exactly, and
would delete this restriction entirely. **This is the single highest-value one-line change
available to the next lane in this area.**

---

## 3 — DELIVERABLE 2 — THE CONSTRAINT-GLYPH LAYER

**`§GLYPH-STATUS-IS-THE-C74-RECORD`** (`apps/editor/src/ui/component/profileConstraints.ts`).

### 3.1 The layer draws C74 §4.6.0's measurement, and the arithmetic is not `12 − 5 = 7`

| Side | Members |
|---|---|
| **PERSISTED — 12** (`ProfileConstraintSchema.kind`) | `coincident` `parallel` `perpendicular` `horizontal` `vertical` `tangent` `distance` `radius` `angle` `diameter` `equalLength` `distancePointLine` |
| **EXECUTABLE — 5** (`buildConstraintSet.ts`) | `fixed` `coincident-pp` `distance-pp` `parallel` `perpendicular` |

- **4 of 12 persisted kinds reach an executor** — `parallel`/`perpendicular` verbatim,
  `coincident`→`coincident-pp` and `distance`→`distance-pp` **across a near-miss spelling gap**
  (C71 §3.3's named defect). The table carries the crossing spelling rather than hiding it.
- **8 of 12 reach nothing.**
- **`fixed` is executable and UNPERSISTABLE** — a pin with nowhere to be written.

⭐ **The layer makes the difference VISIBLE, not merely attributed.** An evaluated constraint is a
**filled** purple glyph; a declared-only one is **hollow and dashed**, and its `<title>` says
`PERSISTED ONLY. No evaluator exists for this constraint (C74 §4.6.0), so nothing enforces it.`
Drawing both alike would make *"this constraint holds"* and *"this is recorded and nothing enforces
it"* the same value on the only surface the author consults — `[[envelope-solid-overstates-partial-data]]`
in a sketch.

### 3.2 C74 §4.6.3's MUST is implemented as a refusal, not a silence

*"The component editor MUST NOT persist a constraint kind it cannot evaluate … Silently accepting
the author's click and writing an inert record is the forbidden outcome."*
`constraintAuthoringDisposition(kind)` returns a **refusal object**, never `false`, carrying
**kind + reason + live alternative**. Measured through the DOM: asking for `tangent` produces
`Cannot add 'tangent': no evaluator exists for 'tangent' … Use the four kinds that do execute —
parallel, perpendicular, coincident, distance.` `fixed` is refused for its *other* reason
(*"nowhere in the document to write it"*), which is the distinction §4.6.0 exists to preserve.

⛔ **§4.6.3's MUST NOT is respected too:** the eight are **not deleted** from any enum. Deleting a
persisted member breaks `deserialize` for any document carrying one (C71 §2.4). They stay
declared, they stay unauthorable, and the difference is recorded in code rather than inferred from
an empty toolbar.

### 3.3 ⚠ OWED — this table RESTATES C74 §4.6.0 and no gate keeps them in sync

It **cannot** be derived: `buildConstraintSet.ts` lives in `apps/component-editor`, an L7 sibling
app that ADR-0376 **D1** retires, and it speaks the other alphabet — there is no import that would
make either side the source of the other, and reaching across would be the second composition root
P1 forbids, arrived at through a type import.

> **OWED GATE (proposed, not built):** a `check-constraint-vocabulary-equivalence` arm comparing
> `ProfileConstraintSchema.kind`'s members, `buildConstraintSet.ts`'s switch cases and
> `profileConstraints.ts`'s two tables **as SETS in all three directions**, exactly as
> `check-contract-index-equivalence` compares files against rows. ⛔ It must compare sets, never a
> count — a count can be right while a member is wrong, which is the failure shape CLAUDE.md
> records six times over.

---

## 4 — DELIVERABLE 3 — THE PARAMETER TABLE

**`§PARAM-SOURCE-IS-VISIBLE`** (`apps/editor/src/ui/component/ComponentParameterTable.ts`).

### 4.1 The claim it fills, verified at HEAD

`apps/component-editor/src/stores/viewTabStore.ts` declares `ViewTab = 'sketch' | '3d' |
'parameters'` and `AppShell.ts` renders the label — and `renderActivePanel` mounts real content
**only** for `'sketch'`; every other tab falls through to `renderSplash(active)`. Verified by
reading the symbol, not a line number. This lane builds the body in the **canonical** editor, not
in the rival runtime D1 retires.

### 4.2 ⭐ Why a name/value table would have been the D4 defect with a UI on top

C110 §2.3 records what the inverted order cost: a formula *"written, persisted, validated,
dependency-sorted — and never evaluated, with `ok: true` and zero diagnostics."* **The user-visible
symptom of every failure in that family is a plausible number whose SOURCE is invisible.** So every
row names its source, and C110 §2.2's four sources render as four visibly distinct badges —
asserted as four distinct strings, so a table that rendered one badge for all four fails.

Read back **from the DOM** (audit R14):

| Fixture | `data-cpt-source` | value |
|---|---|---|
| instance override `p1: 1800` | `instance` | `1800` |
| type value `p2: 1600` | `type` | `1600` |
| `expression: 'Width * Height'` | `expression` | computed |
| `defaultValue: 1200` only | `default` | `1200` |
| nothing set | `unresolved` | `—` |
| **default `999` AND `expression: 'Width - 150'`** | **`expression`** | **`1050`, and `999` appears nowhere in the cell** |

The last row is **ADR-0376 D4 on screen**.

### 4.3 ⛔ `§SUPERSEDED-DEFAULT` reaches the screen — the arm that matters most

C110 §2.4 makes the both-present case a **`warn`**, deliberately not an error, so **the pass stays
`ok: true`** — which means a renderer that draws only values would discard it entirely and the
author would never learn their default is dead data. §OPENING-PROFILE-PANEL-REACHABILITY measured
the identical shape one panel over: *"`dispatch()` returned `void` and sent every refusal to
`console.warn` … a user whose change was correctly refused saw a control that appeared to do
nothing."* Here the footer reads `ok` **and** the warning is rendered against its row, naming the
parameter, and the footer counts it (`… · 1 warning`).

### 4.4 ⭐ `§PARAM-SOURCE-DERIVED-THEN-VERIFIED`

The source is derived from the input in §2.2's order and then **verified against the resolver's own
output**: if `resolveParameter` produced no value, the row reads `unresolved` regardless of what
the derivation said. That second step is what stops the table becoming a rival implementation of
the precedence — **the derivation can only ever LABEL a value the authoritative resolver actually
produced, never assert one it did not.** Removing that one line makes three arms fail (§5,
falsification 3), including *"a parse error does NOT read as Formula"*.

⚠ **OWED → `packages/family-runtime` (lane 4A's file).** `ResolverOk` returns `values` and `order`
but **not the SOURCE**. Returning a per-parameter source would delete `buildParameterTableModel`'s
derivation and remove the one place §PARAM-PRECEDENCE is stated twice (C84 **EI-9**).

### 4.5 ⛔ The unit label is DERIVED FROM THE SEAM, never typed

C110 §3.1 rules metres canonical; **C110 §3.3 measures that the code is still millimetres** and
calls the delta OWED (lane 4A executed D4 and deliberately not D3). A table that printed `m`
because the contract says metres would be describing the repository we wish we had. The label is
computed from `RUNTIME_LENGTH_UNITS_PER_METRE` (family-instance's `§4D-ONE-LENGTH-SEAM`), so **the
day D3 flips that constant to 1 this table says `m` without being edited**, and until then it says
`mm` because that is what the number IS.

⭐ **A finding that came out of the compiler, and is worth keeping.** `RUNTIME_LENGTH_UNITS_PER_METRE`
is a `const` with no annotation, so TypeScript infers the **literal type `1000`** and rejects
`=== 1` as *"types '1000' and '1' have no overlap"* — the compiler stating C110 §3.3's fact
directly: **the metre branch is unreachable today.** The branch is kept and the comparison widened
deliberately; deleting the branch to satisfy the compiler would delete the thing that makes the
function survive the D3 flip untouched.

⭐ **The fixture obeys C110 §3.3-b's negative control**: `2100` mm / `2.1` m — three orders of
magnitude apart and both physically plausible head heights, so it **can** falsify a 1000× error.
A fixture of `1` could not.

### 4.6 ⛔ Nothing is substituted for a failed computation

C110 §2.5/§6.5, read back from the DOM: an expression that throws leaves the cell **`—`** (red),
`data-cpt-value=""`, source `unresolved`, and the footer says `Resolution FAILED … nothing has been
substituted`. **The `999` default it did not fall back to appears nowhere.** A unit mismatch —
the diagnostic lane 4A made throwable for the first time — reaches the screen **as
`unit-mismatch`**, not as a generic failure.

---

## 5 — FALSIFICATION — four mutations, each SEEN FAILING, each restored byte-identically

`lane-4f-falsification-sha256-BEFORE.txt` == `lane-4f-falsification-sha256-AFTER.txt`
(`diff` clean; **BYTE-IDENTICAL RESTORE CONFIRMED**).

| # | Mutation | Result | Transcript |
|---|---|---|---|
| **1** | glyph layer created **eagerly** (the defect `§EMPTY-LAYER-IS-ABSENT` forbids) | `surfaceByteIdentity.spec.ts` **6 of 9 FAIL**, RC=1 | `lane-4f-FALSIFY-1-eager-glyph-layer.txt` |
| **1b** | ⭐ same mutation, against **gate J's own suite** | `wallProfileEditorChrome.test.ts` **4 of 30 FAIL**, RC=1 | `lane-4f-FALSIFY-1b-gateJ-under-mutation.txt` |
| **2** | `constraintStatus` always returns `'evaluated'` (the C74 §4.6.0 overstatement) | `componentProfileSurface.spec.ts` **5 of 17 FAIL**, RC=1 | `lane-4f-FALSIFY-2-all-constraints-evaluated.txt` |
| **3** | the `§PARAM-SOURCE-DERIVED-THEN-VERIFIED` line removed | `componentParameterTable.spec.ts` **3 of 14 FAIL**, RC=1 | `lane-4f-FALSIFY-3-source-label-unverified.txt` |
| **4** | `profileWriteBackDisposition` always writable (the lossy commit) | `componentProfileSurface.spec.ts` **2 of 17 FAIL**, RC=1 | `lane-4f-FALSIFY-4-lossy-commit-allowed.txt` |

⭐ **1b is the result worth keeping.** The eager layer breaks the **wall profile modal's own
existing chrome test**, independently of the new byte fixture. The two instruments agree — which
means the byte fixture is not the only thing standing between this generalisation and a regression
in shipped Window/Wall functionality, and gate J was a real gate rather than a formality.

**PR-9's obligation, discharged:** `fixtures/elevationOutlineSurface.bytes.json` carries **12 arms**
(4 caller configurations × 3 states: empty ring / rectangle / open polyline draft) plus a
`__provenance` block recording the **subject file's sha256 at generation,
`9837d0915e42d4456d99c891e7b2c20344c284798834633951a4221fb3571e92`** — the file's hash **before**
this lane edited it. The generator spec was **deleted in the same commit**: a probe that can
rewrite its own fixture proves nothing (`[[verification-artifact-can-predate-subject]]`). The
spec's last block proves the fixture **can** fail (a declared plane changes the bytes; a glyph
changes the bytes), so the comparison is not vacuous.

---

## 6 — THE ONE FILE OUTSIDE `OWNS`, AND WHY IT WAS UNAVOIDABLE

**`vitest.config.ts` (root) — one `include` line added.**

The root config's `include` list is an **ALLOWLIST**, and its own comment records why that matters:
§L-851 is *"72 spec files / 1,433 test cases that had NEVER executed in CI"* because a pattern
pointed at a tree that had moved — *"NEVER RAN and PASSED printed the same value."* A spec outside
the list is **not skipped, it is never discovered**, and `vitest run <path>` prints *"No test
files found"* rather than failing.

⛔ **Without this line, all 40 of this lane's tests would be decorative** — which is exactly the
authored-but-unreachable shape this lane's own deliverables exist to refuse. The line was added
**in lock-step with the files**, per the config's own instruction, and it is not on any lane's
serialize-only list (`initBusHandlers.ts` · `performUndoRedo.ts` · `registry.ts` ·
`ElevationOutlineSurface.ts` · `check-chat-capability-coverage.ts`).

⚠ **Flag for the orchestrator:** it is a shared file. If another Phase-4 lane also added an
`include` line, the two edits must be merged rather than one overwriting the other.

**No `package.json` was touched.** `@pryzm/family-runtime`, `@pryzm/family-instance`,
`@pryzm/file-format` and `@pryzm/geometry-wall` are all declared at the **ROOT** `package.json` and
linked in root `node_modules` — which is how the pre-existing `@pryzm/geometry-wall/profile` import
in `ElevationOutlineSurface.ts` already resolves. So `pnpm-lock.yaml` is untouched
(`[[agent-packagejson-breaks-frozen-lockfile]]`).

**No ceiling raised, no gate disabled, no `gate-debt.json` entry.** Nothing under
`packages/schemas/src/siteintel/**` or `packages/site-parcel-data/**` was read or written. No
`git stash`. Nothing committed.

---

## 7 — ⚠ REACHABILITY, ON ALL FOUR AXES — AND THE ONE THAT IS UNMET

Per §12.0 rule 6, *"a claim naming fewer than four axes is not a claim."*

| Axis | State |
|---|---|
| **1 · import / construction** | ✅ `apps/editor/src/ui/component/index.ts` exports every symbol; the specs import and construct all three surfaces against schema-parsed documents. |
| **2 · bus verb** | ⛔ **NONE, BY DESIGN.** P6: the panel dispatches nothing and holds no store — the identical split `WallProfileEditor`, `WindowOutlineEditorDialog` and `FinishTypeEditorModal` already made. `component.*` verbs are **lane 4C's** OWNS. |
| **3 · build graph** | ⛔ **UNMET.** `grep -rn "ui/component"` over `apps/editor/src` returns **zero production importers** (one comment reference in the surface's own header). The directory is in the **test** graph and therefore in CI, and in no other graph. |
| **4 · call** | ✅ within the test graph — 40 tests, all reading back from the DOM; ⛔ zero calls from a user gesture. |

**Why axis 3 was not closed here, and what would close it.** Mounting requires (a) a `component`
element kind and a way to *have* a component document open — **lane 4C's** OWNS, D9's subject —
and (b) an edit to a mount point (`PropertyPanelBodyRenderer`, or a workspace mode) which is **not
in this lane's OWNS** and would be a collision. There is no `apps/editor/src/ui/index.ts` barrel to
land in either (verified: the file does not exist).

> **THE SEAM, NAMED SO THE NEXT LANE DOES NOT HUNT FOR IT.** The pattern to copy is
> `setWindowOutlineEditorOpener` — `WindowSection` injects an opener function, the panel-mounting
> module wires it, and `openingProfilePanelReachability.spec.ts`'s **ARM B** asserts source-level
> that the wiring exists *and* that a missing wire states itself rather than no-op'ing silently.
> A `setComponentProfileEditorOpener` of the same shape, wired at the same site, closes axis 3 —
> and it must land **with** its ARM B, because *"with NO opener wired, 'Edit outline…' states the
> missing wire"* is the arm that makes the other one non-vacuous.

⛔ **This is declared, not discovered.** C107 §0.1 records **fifteen** built-but-unreachable
surfaces found in one session; `[[authored-but-unwired-is-the-bottleneck]]` is a standing memory.
**Lane 4F's deliverables are AUTHORED AND TESTED, and they are NOT YET REACHABLE BY A USER.**

---

## 8 — THE OWED REGISTER (this lane's, ranked)

| # | Owed | To whom | Why it matters |
|---|---|---|---|
| **O-1** | **Mount the surfaces** — `setComponentProfileEditorOpener` + its ARM B | a lane that owns a mount point, after 4C | Axis 3 above. Until then this is fifteen-plus-one. |
| **O-2** | **Expose `EmittedPoint.sourceId` from `profileToPolygon`** | `packages/family-instance` (lane 4D) | Deletes `§ANCHOR-BY-CONTAINMENT`'s restriction; lets constraints join polygon vertices exactly. **One line, highest value.** |
| **O-3** | **Return a per-parameter SOURCE from `resolveParameter`** | `packages/family-runtime` (lane 4A) | Deletes this lane's precedence derivation — the one place §PARAM-PRECEDENCE is stated twice (C84 EI-9). |
| **O-4** | **`check-constraint-vocabulary-equivalence`** (sets, never counts) | a gate lane | §3.3. Three declarations of one vocabulary, nothing keeping them in sync. |
| **O-5** | **Resolve the two near-miss spellings** (`coincident`/`coincident-pp`, `distance`/`distance-pp`) | C74 §4.6.3 already MUSTs this | *"resolved while both sides are still unreachable from the editor, which is the only moment it is free"* — and this lane is the moment that window starts closing. |
| **O-6** | **`fixed` has nowhere to persist** | C74 §4.6.0 named it LATENT | The UI now refuses it by name, so it can no longer be lost silently — but the schema gap is still open. |
| **O-7** | **`ProfileEntitySchema.data` is uncontracted** (`z.record`, requires no key, forbids none) | `packages/file-format` (lane 4B) | Lane 4D already carries this; this lane's adapter reads the same `§4D-ENTITY-READ-CONTRACT` spelling and inherits the same exposure. |
| **O-8** | **L-666 — element/entity id minting is uncontracted** | already OPEN | It is why `commitRingToProfile` refuses vertex insert/delete. The refusal is correct; the ledger entry is what should close. |

---

## 9 — WHAT THIS LANE DID **NOT** DO (so nobody reads absence as completion)

- **No 3-D authoring.** D2 makes 3-D first-class for selection, picking, parameter/dimension
  manipulation and material/host preview, and **NOT** a sketch-input surface until a camera-plane
  guarantee exists (C86 §10.6.1b). This lane touched the **explicit-plane SVG surface only**;
  it built no 3-D gesture and moved no row of §10.6.1's table.
- **No constraint SOLVER, and nothing that budgets one.** C74 §4.1 is a MUST NOT and C110 §6.6
  restates that it binds this programme. The glyph layer **reads** the §4.6 record; it proves
  nothing about §4.6.2's four candidate kinds and authorises nothing.
- **No new schema, no new expression engine, no new refusal vocabulary, no new sketch surface**
  (audit R1). Every model type consumed here is C111's; every evaluation is lane 4D's or 4A's.
- **No command, no store, no dispatch** (P6) — see axis 2.
- **Nothing committed**, per the brief.

---

## 10 — INDEPENDENT RE-VERIFICATION ADDENDUM (second 4F session, 2026-09-02 ~11:27–11:35)

A second session found this lane COMPLETE and UNCOMMITTED (findings doc mtime 09:40, all owned
files on disk). Per the standing mtime rule it VERIFIED BY EXECUTION rather than redid. Every run
foreground, redirected, `$?` read from the redirect.

| Check | Result | Transcript |
|---|---|---|
| Gate J — `wallProfileEditorChrome.test.ts` (caller 1) | **30 passed · RC=0** (same count) | `lane-4f-VERIFY-gateJ-wpe-chrome.txt` |
| Gate J — `WPE1WallProfileEditMode` + `WallProfileNonRegressionBaseline` (**PR-2**) | **39 passed · RC=0** (same count) | `lane-4f-VERIFY-gateJ-pr2-and-wpe1.txt` |
| Gate J — reachability + finishType + the lane's 3 spec files, root config | **5 files · 65 passed · RC=0** (19+6+40, same counts) | `lane-4f-VERIFY-panel-and-lane-suite.txt` |
| root `tsc -p tsconfig.json --noEmit --skipLibCheck` (heap 8192 per §1 note 1) | **RC=0** | `lane-4f-VERIFY-root-tsc.txt` |
| `check-layer-boundaries.ts` | **RC=0** — *same reading verbatim*: violations 48/102 · unclassified 13/13 · sdk-bypass 159/182 | `lane-4f-VERIFY-gate-layers.txt` |
| `npx eslint` over both owned paths | **RC=0** | `lane-4f-VERIFY-eslint.txt` |

**Independent falsification — a FIFTH mutation, not a replay of §5's four.** The surface was
mutated to stamp `data-<prefix>-plane` UNCONDITIONALLY (`plane?.id ?? "inferred"`) — the silent
plane-inference shape C86 §10.6.1c forbids, applied to the three legacy callers.

- `surfaceByteIdentity.spec.ts` → **6 of 9 FAIL, RC=1** (`lane-4f-VERIFY-falsify-SEEN-FAILING-byteidentity.txt`).
- ⭐ **`wallProfileEditorChrome.test.ts` → 30/30 PASS on the MUTANT, RC=0**
  (`lane-4f-VERIFY-falsify-SEEN-FAILING-wpe-chrome.txt`). §5's finding 1b showed the two
  instruments AGREE on the eager glyph layer; this shows they are NOT redundant — **the byte
  fixture is the ONLY instrument that catches a stray plane attribute on the legacy callers.**
  PR-9's fixture is load-bearing, not a formality duplicating the chrome suite.
- Restore by deleting the one mutant line: `lane-4f-VERIFY-falsify-sha256-BEFORE.txt` ==
  `lane-4f-VERIFY-falsify-sha256-AFTER.txt` (`diff` clean, hash
  `8622c2249b3268dd9629c1b35f21cc4a02908682778e64bd4a4a55a0de43fd70`); re-run **9/9 · RC=0**
  (`lane-4f-VERIFY-falsify-RESTORED-GREEN.txt`).

**Provenance chain closed a step further than §5 claimed.** The fixture's `__provenance` sha256
`9837d091…3571e92` == `lane-4f-surface-sha256-BEFORE.txt` == **`git show
HEAD:apps/editor/src/ui/ElevationOutlineSurface.ts | sha256sum`**. The pre-change file is not
merely recorded — it is the COMMITTED file, so anyone can regenerate the comparison from git alone
(`[[verification-artifact-can-predate-subject]]` discharged in its strongest form).

**Cross-checks read at the source, not the doc:** production caller census = exactly
`WallProfileEditor.ts` · `WindowOutlineEditorDialog.ts` · `FinishTypeEditorModal.ts` (+ the lane's
own `ComponentProfilePanel.ts`); §3.1's vocabularies verified at both declarations
(`ProfileConstraintSchema.kind` enum begins with the 12; `buildConstraintSet.ts` switches on
exactly `fixed` / `coincident-pp` / `distance-pp` / `parallel` / `perpendicular` — the two
near-miss spellings live); R14/C16 CA-21: the two behavioural specs contain **49 DOM read-backs
and ZERO `vi.fn`/`vi.spyOn`/`toHaveBeenCalled`**, and the D4-on-screen arm asserts
`not.toContain('999')` against the value CELL.

**Unchanged by this session:** the OWED register (§8), the axis-3 gap (§7), everything in §9.
Nothing committed. Nothing outside OWNS written except these transcripts and this addendum; the
one mutation was restored byte-identically.
