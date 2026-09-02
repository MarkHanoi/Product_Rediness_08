# LANE 4G — WORLD MODEL REGISTRATION

**Date:** 2026-09-02 · **Owns:** `packages/core-app-model/src/SemanticGraph.ts` ·
`packages/ai-host/src/graph/GraphQueryService.ts` ·
**Authority:** ADR-0376 (D1–D5 + D9/D10) · audit §12 PHASE 4 row 4G · §11.3 R1/R14 ·
**C71 §1.5 / §2.5 / §2.6 / §2.7** · **C112 §3.2 / §5** · spec §69 · §76 gate **H**.
**NOT COMMITTED** — working tree only, per the lane brief.

---

## 0 · THE ONE-PARAGRAPH ANSWER

The three definition-axis edges are landed with a write API, six typed refusal-bearing readers,
a persist-only rebuild disposition proven across a real JSON wire, and an asymmetric delete
behaviour whose definition half is a **refusal**, not a cascade. `graph.query(<definition>,
'instantiates')` **returns the instances** and says which question it answered. **Three graph gates
read exactly what they read at HEAD** (write-coverage RC=0/0-findings, persistence RC=0/0-findings,
delete-integrity RC=1 at its declared level of 10) and **root `tsc --skipLibCheck` — the deploy gate
— is RC=0.**

⛔ **AND THE OBLIGATION THAT IS NOT DISCHARGED, stated first because the gate prints it:**
`check-graph-write-coverage` now measures the three families as

```
instantiates           writer  0 · reader  2 · rebuild —
specializes            writer  0 · reader  2 · rebuild —
dependsOnDefinition    writer  0 · reader  2 · rebuild —
```

**`writer 0`.** C71 §2.7 obligation 1 is *"the command that creates the relationship, and ONLY that
command"*, and that command is **4C's `component.place`, which does not exist** —
`packages/schemas/src/elements/Component.ts` and `packages/command-registry/src/component/` are both
absent at the time of writing, so **this lane's ENTRY condition ("4C's element kind exists") was
UNMET.** This lane therefore landed the half C71 says is the legitimate first step (*"a reader is the
legitimate first unparking step"* — the write-coverage gate's own executed control) and did **not**
land the half C71 §2.5 calls a defect. **Do not report the four obligations as discharged.**

---

## 1 · WHAT LANDED

### 1.1 `RelationshipType` gains three members (C71 §2.7)

| Family | Endpoints (declared) | Author-keyed? | Rebuild disposition |
|---|---|---|---|
| `instantiates` | *instance* → *definition* | no — the instance IS an endpoint | **PERSIST-ONLY** |
| `specializes` | *type* → *definition* \| *type* | no — the type IS an endpoint | **PERSIST-ONLY** |
| `dependsOnDefinition` | *definition* → *definition* | ⭐ **YES**, `authoredBy: <slotId>` | **PERSIST-ONLY** |

**Why only the third is author-keyed** — C112 §3.2's membership test applied, not copied: *does the
`(sourceId, targetId)` pair identify the edge's SUBJECT?* One definition may nest another through
**two different slots**, and the slot appears in neither endpoint. That is `connectedByStair`'s shape
exactly, so it takes `connectedByStair`'s fix. **`dependsOnDefinition` is added to
`AUTHOR_KEYED_RELATIONSHIP_TYPES`; the other two are deliberately not.** The collapse is measured in
both directions by a scramble control (§3.2 below).

### 1.2 The seventh semantic — node kind (C71 §1.5), made real

`GraphNodeKind` · `DEFINITION_AXIS_ENDPOINT_KINDS` · `isDefinitionAxisRelationship` ·
`SemanticGraphManager.resolveDefinitionAxisNodeKind(id, family)`.

The kind is decided by **the family and the position**, from two DECLARED sources — the writer's
per-family, per-side coverage marks, and the id's position in that family's edges. ⛔ **Never an id
prefix** (C71 §1.5 MUST NOT), and there is a named test that proves it: a definition id spelled
`wall-1234` resolves as a *definition*, which a prefix-reading resolver could not do.

**Five coverage marks, not one**, and the reason is the whole point: a single "the definition-axis
writers have seen this id" mark cannot tell an instance from a definition, so a reader consulting it
would answer *"which instances instantiate this?"* with a confident `[]` for a **type** id — a
category error stated as an established fact.

### 1.3 Writers (the write API — **not** the writer)

`recordInstantiation` · `recordSpecialization` · `recordDefinitionDependency` ·
`markDefinitionAxisCoverage` · `removeDefinitionDependenciesAuthoredBy`.

Same shape as the shipped `replaceJoinedToForLevelWalls`: a family-specific typed entry point that
maintains its derived state **at the writer** (C71 §3.4). `recordSpecialization` takes `parentKind`
as a **required** argument and stores it in `metadata.parentKind` — C71 §1.5 forbids deducing an
endpoint's kind at a call site, and `specializes` is the one family with two legal target kinds.

### 1.4 Typed readers (C71 §2.6 obligation 2, C71 §4.4)

| Reader | Question | Positive empty via |
|---|---|---|
| `getInstantiatedDefinition(instanceId)` | *what IS this thing?* | — (single-valued; 2 edges = corruption refusal) |
| `getInstancesOfDefinition(definitionId)` | ⭐ *which instances exist over this?* | target-side mark |
| `getSpecializedParent(typeId)` | *what does this type refine?* | — (single-valued) |
| `getSpecializationsOf(parentId)` | *which types exist over this?* | target-side mark |
| `getDefinitionDependencies(definitionId)` | *what does this nest or reuse?* | mark |
| `getDefinitionDependents(definitionId)` | *what breaks if this changes?* | mark |
| `findDefinitionDependencyCycle(definitionId)` | *does it transitively contain itself?* | — |
| `getDefinitionDeleteDisposition(definitionId)` | *may this definition be deleted?* | — |

**None is a `getAll()` sweep** (C71 §1.3) and **none invents a refusal vocabulary** (audit R1): every
`reason` is forwarded verbatim through the query surface, proven by a named test that asserts the
service and the reader agree.

### 1.5 The query surface (§76 gate H — *the World Model understands components without meshes*)

`DEFINITION_AXIS_READERS` in `GraphQueryService`, a **second** table beside `TYPED_TARGET_READERS`,
plus `GraphQueryResult.direction` and `.targetNodeKind` on the ok-branch, and
`GRAPH_QUERY_DEFINITION_AXIS_RELATIONSHIPS` exported so a gate can assert the routing and its
disjointness from the six L-12860 families.

⭐ **Why a second table, and why this is not the `sitsOn` folding that file already refused.** That
file excludes `sitsOn` because `getElementsSittingOn` is level→elements while
`getTargets(id,'sitsOn')` is element→level, and *"routing them here would **SILENTLY** change the
direction of the answer."* The objection is about **the silence**. A definition-axis answer carries
`direction` and `targetNodeKind`, so the caller is **told** which of the family's two questions was
answered and what kind of ids it holds — the measured hazard of C71 §1.5, closed at the surface
where a bare `[]` stops being a value and becomes English in a prompt. ⛔ **This must not be copied
onto the twelve instance-only families**; for them `getTargets` IS the question, and `sitsOn` stays
excluded for exactly the reason it always was.

---

## 2 · ACCEPTANCE — MEASURED, AND WHERE IT DOES NOT REACH

**The layer (audit R14).** `apps/editor/src/engine/graphQueryBusHandlers.ts`'s
`buildGraphQueryHandlers` registers `type: 'graph.query'` with the execute body
`service.query(cmd.elementId, cmd.relationshipType)` — a **pass-through**. The object the acceptance
suite asserts on **is the object the bus verb returns.** Reading back from `SemanticGraphManager`
would have been the C16 CA-21 mistake one graph over.

| Acceptance clause | State |
|---|---|
| `graph.query(<definition>, 'instantiates')` returns INSTANCES instead of refusing | ✅ **MET** — and it reports `direction: 'incoming'`, `targetNodeKind: 'instance'` |
| `graph.query(<**type**>, 'instantiates')` returns instances | ⛔ **NOT MET, AND NOT MEETABLE UNDER C71 §2.7** — see §4.1. The audit row's wording and the contract disagree; the contract wins. |
| §69 — **definition** exposed without inspecting a mesh | ✅ `query(instanceId,'instantiates')` |
| §69 — **type** exposed without inspecting a mesh | ⚠ **PARTIAL** — "which types exist over this definition" ✅; "which type is THIS instance of" ⛔ (§4.1) |
| §69 — **relationships** exposed without inspecting a mesh | ✅ `graph.neighbors` |
| §69 — **identity** | ✅ (the ids the graph joins) |
| §69 — category · parameters · properties · materials · host · location · orientation · geometry · representations · provenance | ⛔ **NOT THIS LANE.** They are element-schema and format facets — 4C's `Component.ts` and 4B's `Representation[]` / `PropertySet`. §69 is a property of the whole slice; this lane discharges three of its fourteen legs and asserts nothing about the other eleven. |

---

## 3 · FALSIFICATION — SEEN FAILING, THEN BYTE-IDENTICALLY RESTORED

`sha256` **before any edit** ·
`SemanticGraph.ts` `64e9530e004068e66a059e3caace7308d733c44d9f16f8134d7e98174f5402c9` ·
`GraphQueryService.ts` `a8fa81883b127a1e4de6740851c2f4a04950dca693bc5d4d8216dec6246b00e9`.
`sha256` **after the lane, and after both severings were reverted** ·
`SemanticGraph.ts` `7ad39a9b075dc6c8443e72969cf0cea1bc161671b0b09c3bb2e28fb5b08b27b1` ·
`GraphQueryService.ts` `8ef3913d47beb23f50d7cebdb98df120ce6b043bd475a6c5d02facf298f31531`
— **identical to the pre-severing digests, verified by `sha256sum` immediately after each restore.**

### 3.1 SEVER THE WRITER → the ACCEPTANCE test fails

`recordInstantiation` made a no-op. `npx vitest run --root packages/ai-host` →
**`Tests  9 failed | 6 passed (15)`, RC=1**, the first named failure being

```
 FAIL  __tests__/graphQueryServiceDefinitionAxis.test.ts > ACCEPTANCE — graph.query(definition,
 "instantiates") returns INSTANCES > ⭐ returns the two placed instances instead of refusing
```

### 3.2 SEVER THE READER → a DIFFERENT named test fails, and the confident `[]` returns

The `instantiates` row removed from `DEFINITION_AXIS_READERS`, so the family falls through to the raw
`getTargets` path. **`Tests  8 failed | 7 passed (15)`, RC=1.** Two of the eight fail **only** under
this severing and not under §3.1 —

```
 FAIL  … > ACCEPTANCE … > the three families are ROUTED to the definition axis, not to the getTargets path
 FAIL  … > FAILURE ≠ EMPTINESS at the query surface > a definition the writer covered with nothing
        placed answers a POSITIVE empty
```

⭐ **And the failure mode is the exact defect the routing exists to prevent** — verbatim:

```
- Expected            + Received
- [ "inst-1", "inst-2", ]
+ []
```

`r.ok === true` with `targets: []` — a **confident empty** at the surface where it becomes a sentence
in a prompt.

### 3.3 In-suite controls that can fail on their own

- **the scramble control** — the same two writes **unkeyed** collapse onto ONE edge
  (`toHaveLength(1)`), which is what makes the keyed `toHaveLength(2)` mean something.
- **the over-purge control** — `removeAllRelationshipsForElement(definitionId)` tears down **both**
  slots' edges, measuring the naive repair C112 §5 calls *"worse than the defect"*.
- **the non-vacuity control** — an unsevered graph answers, so §3.1/§3.2 are not vacuous.
- ⛔ **Three tests failed organically during authoring** (a `hosts` fixture that omitted the
  `hostedBy` inverse, and two refusal-reason assertions that named the wrong step). The fixture was
  wrong, not the code — `getHostedOpenings` refuses a half-written pair
  (`hosts-hostedBy-pair-broken`) and that behaviour is pre-existing and correct.

---

## 4 · FINDINGS THE ORCHESTRATOR MUST CARRY

### 4.1 ⛔ **THERE IS NO instance → TYPE EDGE, AND §66 NEEDS ONE.** (the headline)

C71 §2.7 declares `instantiates` as *instance → **definition***, and `specializes` as *type →
definition / type*. **Nothing joins an instance to its TYPE.** So the graph can answer *"which
instances exist over this definition"* and *"which types exist over this definition"*, but **not**
*"which instances use the Medium type"* — which is precisely **§66's twenty-instance test**: *change
the TYPE to 1600 and the nineteen follow.* Finding the nineteen is unanswerable from this graph today.

**The audit's own 4G row writes the acceptance as `graph.query(typeId,'instantiates')`, which
requires the edge C71 §2.7 does not declare.** They disagree; the contract outranks the audit, so
this lane implemented C71.

Two resolutions, and **no lane should pick one silently**:

- **(a) widen `instantiates`'s declared target kind to `definition | type`** — a C71 §2.7 amendment,
  which is **3C's file, not this lane's**. Cheapest, and it makes the audit's sentence literally true.
  `DEFINITION_AXIS_ENDPOINT_KINDS` is one line and the readers need no change.
- **(b) make it a DERIVED projection over the instance's `typeId` field** — the **ADR-0328 `partOf`
  precedent** exactly: one substrate, re-derived at the moment of the read, no second record to
  disagree. More work, and the better fit if the type lives on the element as a field anyway.

⛔ **This is a D-level decision and it blocks Phase 4's EXIT, not just this lane.**

### 4.2 The writer obligation is owed, and its landing has THREE mechanical consequences

When 4C's `component.place` calls `semanticGraphManager.recordInstantiation(...)`, **all three of the
following move in that same commit or a gate turns red:**

1. **`tools/ga-gate/check-graph-write-coverage.ts` → `HELPER_WRITERS`** gains
   `recordInstantiation: 'instantiates'`, `recordSpecialization: 'specializes'`,
   `recordDefinitionDependency: 'dependsOnDefinition'`. Without it the gate keeps printing
   `writer 0` for a family that has one — the false-negative direction.
2. **`tools/rac-conformance/certification/gates/graph-persistence-debt.json`** gains the three by
   name. Measured today: ARM A already classifies all three **persist-only**, and ARM B (*persist-only
   **with a live writer*** — the persist-or-lose set) still names only `connectedByLift` and
   `measuredAt`. **The moment a live writer exists, the three join ARM B and an unledgered
   persist-or-lose family exits 3.**
3. **`packages/persistence-client/src/loader/rebuildSemanticGraph.ts`** gains
   `unreconstructable.push('instantiates')` (and the two siblings) so a snapshot lacking them
   **reports the named loss** (C70 I-INV-3, gate ARM C). ⛔ C71 §2.7: *"a component instance that
   loses `instantiates` on load is an element that no longer knows what it is."*
4. And the C71 **§2.1 row** plus the gate's `REQUIRED` array move together — C71 §2.7: *"Each family
   joins §2.1 in the PR that lands its writer and its typed reader together, and its row moves in
   that same commit."*

### 4.3 The gate's ⚠ classification line is CORRECT and was deliberately left standing

`check-graph-write-coverage` prints:

> ⚠ 3 union member(s) carry NO C71 §2 classification and were not expected: instantiates,
> specializes, dependsOnDefinition.

It is a **warning line, not a finding** (RC is unaffected). **Silencing it by adding the three to
`UNCLASSIFIED_EXPECTED` was considered and rejected**: the line is the instrument's own statement
that these families have no §2.1 row yet, which is exactly the fact §4.2 must not lose. Close it by
landing the writer, never by editing the array.

### 4.4 Files touched outside this lane's declared OWNS — each forced, each named

| File | Why it was unavoidable |
|---|---|
| `packages/core-app-model/src/index.ts` | additive barrel exports; `GraphQueryService` imports these types from `@pryzm/core-app-model`, as it already did for `SemanticGraphManager`. |
| `packages/core-app-model/src/DependencyResolver.ts` | `Record<RelationshipType, number>` is **exhaustive**; widening the union is a compile error until the rows move. Set to priority **5 = record only** — a definition edit reaches its instances through C65 §3.6's stated-count propagation, never through a silent cascade this resolver enqueues (two propagation paths for one concept is C84 EI-9). |
| `apps/editor/src/ui/dataworkbench/RelationshipExplorerPanel.ts` | three more exhaustive `Record<RelationshipType, …>` maps — label, icon, order. |
| `tools/ga-gate/check-graph-write-coverage.ts` | **the gate's own instructed remedy.** Its `unregistered-reader` arm exits **3** for any `SemanticGraphManager` method returning a `*Query` type that is absent from `DEDICATED_READERS`, and prints *"Register it, pinning the receiver if the name is shared with another graph."* Seven rows added; **no receiver pin** — each spelling was measured to occur only in `SemanticGraph.ts`, its own suite and `GraphQueryService.ts`, so the room-topology collision that forced the existing pins does not exist here. ⛔ **No ceiling raised, no gate disabled, no `gate-debt.json` entry, and `REQUIRED` untouched.** |

⭐ **The exhaustive-`Record` breaks are the row-and-range rule one level down, enforced by the
compiler instead of by a document.** They were caught by **root `tsc`, not by either package's own
`typecheck`** — see §5.

### 4.5 Two measurement hazards found while running this lane, reported not fixed

1. **Neither owned package's `typecheck` script is a usable signal.** `pnpm --filter
   @pryzm/core-app-model typecheck` reads **658 errors at HEAD** and `pnpm --filter @pryzm/ai-host
   typecheck` reads **2589**, both dominated by `plugins/**` pulled in through path mapping. Worse,
   `core-app-model`'s own `tsconfig.json` sets **`strictNullChecks: false`**, under which
   discriminated-union narrowing on `.ok` **does not work at all** — it produces identical
   `TS2339 Property 'reason' does not exist` errors on the **pre-existing, untouched**
   `TYPED_TARGET_READERS` lines. **The signal that matters is root `tsc --skipLibCheck`** (the `npm
   run build` step, and the deploy gate per §L-540-CI-GATE), which is **RC=0** with this lane applied.
2. **`npx vitest run --root packages/<pkg>` from the repo root breaks any test that reads a file
   relative to `process.cwd()`.** Two core-app-model suites fail with `ENOENT` under that invocation
   and **pass** when run with the package as cwd. A future lane reporting "2 failing suites in
   core-app-model" from that invocation would be reporting its own invocation.

---

## 5 · EXECUTED PROOF — every reading foreground, redirected, `$?` read immediately

| What | Command | HEAD | With this lane |
|---|---|---|---|
| graph write coverage | `npx tsx tools/ga-gate/check-graph-write-coverage.ts` | **RC=0** · `0 findings, hard-0, no baseline` | **RC=0** · `0 findings, hard-0, no baseline` |
| graph persistence | `npx tsx tools/rac-conformance/certification/gates/check-graph-persistence.ts` | **RC=0** · 0/0 · 26 members · persist-only 14 | **RC=0** · 0/0 · **29 members** · **persist-only 17** (the three added) · ARM B unchanged |
| graph delete integrity | `npx tsx tools/rac-conformance/certification/gates/check-graph-delete-integrity.ts` | **RC=1** · 10 findings at declared level 10 | **RC=1** · 10 at 10 |
| OTel spans (P8) | `npx tsx tools/ga-gate/check-otel-spans.ts` | — | **RC=0** · Zone A 277/277 · Zone B 52/52 baseline |
| layer boundaries | `npx tsx tools/ga-gate/check-layer-boundaries.ts` | — | **RC=0** · violations 48/102 · unclassified 13/13 · sdk-bypass 156/182 |
| **root typecheck (the deploy gate)** | `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --skipLibCheck` | — | **RC=0**, no output (4 errors before §4.4's Record rows were moved) |
| new model suite | `npx vitest run src/SemanticGraph.definitionAxis.test.ts` | — | **RC=0** · **28 passed** |
| new query suite | `npx vitest run __tests__/graphQueryServiceDefinitionAxis.test.ts` | — | **RC=0** · **15 passed** |
| graph regression (model) | `npx vitest run src/SemanticGraph` | — | **RC=0** · 7 files · **107 passed** |
| graph regression (query) | `npx vitest run __tests__/graphQueryService` | — | **RC=0** · 3 files · **46 passed** |
| DependencyResolver | `npx vitest run src/__tests__/DependencyResolver.getAffected.test.ts` | — | **RC=0** · 4 passed |
| whole core-app-model | `npx vitest run src/` (package cwd for the two cwd-sensitive suites) | — | **1756 passed, 0 failed** |

---

## 6 · FILES

**Owned, modified** — `packages/core-app-model/src/SemanticGraph.ts` (+884) ·
`packages/ai-host/src/graph/GraphQueryService.ts` (+239).
**Outside OWNS, modified, each justified in §4.4** — `packages/core-app-model/src/index.ts` (+25) ·
`packages/core-app-model/src/DependencyResolver.ts` (+14) ·
`apps/editor/src/ui/dataworkbench/RelationshipExplorerPanel.ts` (+14) ·
`tools/ga-gate/check-graph-write-coverage.ts` (+44).
**New** — `packages/core-app-model/src/SemanticGraph.definitionAxis.test.ts` ·
`packages/ai-host/__tests__/graphQueryServiceDefinitionAxis.test.ts`.

⛔ **Untouched, as required:** `packages/schemas/src/siteintel/**` · `packages/site-parcel-data/**` ·
`initBusHandlers.ts` · `performUndoRedo.ts` · `packages/schemas/src/registry.ts` ·
`ElevationOutlineSurface.ts` · `check-chat-capability-coverage.ts`. **No `git stash`. No commit.**

---

## 7 · INDEPENDENT RE-VERIFICATION ADDENDUM (2026-09-02, second 4G session)

A second lane-4G session found this document (mtime 2026-09-02 08:34) and both owned files
(mtime 08:24) already carrying the full lane, uncommitted. Per the standing mtime rule (the
lane-4B precedent, [[verification-artifact-can-predate-subject]]), the work was **VERIFIED BY
EXECUTION, not redone**. Every reading below is this second session's own — foreground,
redirected, `$?` read immediately.

### 7.1 The inherited state is exactly what §3 claims it restored to

`sha256sum` at session start: `SemanticGraph.ts` `7ad39a9b…b27b1` · `GraphQueryService.ts`
`8ef3913d…31531` — **byte-identical to §3's post-restore digests.** Every §1 symbol was
grepped on disk before any suite ran (three union members · `AUTHOR_KEYED_RELATIONSHIP_TYPES`
gaining only `dependsOnDefinition` · `GraphNodeKind` / `DEFINITION_AXIS_ENDPOINT_KINDS` /
`resolveDefinitionAxisNodeKind` · the five writers · the eight readers ·
`DEFINITION_AXIS_READERS` / `GRAPH_QUERY_DEFINITION_AXIS_RELATIONSHIPS` / `direction` /
`targetNodeKind`). `git diff --stat` matches §6 exactly: +884 · +239 · +25 · +14 · +14 · +44.

### 7.2 Re-executed proof

| What | RC | Reading | Transcript |
|---|---|---|---|
| new model suite (package cwd) | **0** | **28 passed (28)** | `lane-4g-VERIFY-model-suite.txt` |
| new query suite (package cwd) | **0** | **15 passed (15)** | `lane-4g-VERIFY-query-suite.txt` |
| graph regression, model | **0** | 7 files · **107 passed** | `lane-4g-VERIFY-model-regression.txt` |
| graph regression, query | **0** | 3 files · **46 passed** | `lane-4g-VERIFY-query-regression.txt` |
| DependencyResolver.getAffected | **0** | 4 passed | (spot check) |
| `check-graph-write-coverage` | **0** | 0 findings, hard-0 · the three read `writer 0 · reader 2` · the ⚠ classification line **stands** (§4.3) | `lane-4g-VERIFY-gate-write-coverage.txt` |
| `check-graph-persistence` | **0** | 0/0 · **29 members** · persist-only **17** (the three named) · **ARM B unchanged**: `connectedByLift` + `measuredAt` only | `lane-4g-VERIFY-gate-persistence.txt` |
| `check-graph-delete-integrity` | **1** | 10 findings at declared level 10 — unchanged from HEAD | `lane-4g-VERIFY-gate-delete-integrity.txt` |
| **root `tsc --skipLibCheck`** (deploy gate) | **0** | no errors | `lane-4g-VERIFY-root-tsc.txt` |
| whole core-app-model (package cwd) | **0** | **152 files · 1738 passed · 0 failed** | `lane-4g-VERIFY-whole-core-app-model.txt` |

⚠ **One denominator named:** §5's whole-package row says **1756 passed**; this session measures
**1738** at **152/152 files, 0 failed**. No test file exists outside `src/`, so 1738 is the
whole-package count under `npx vitest run src/` from the package cwd; 1756 is most plausibly the
first session's summation counting the two cwd-sensitive suites twice (once inside the sweep it
described, once in their separate package-cwd runs). **Zero failures both times** — the
discrepancy is in the bookkeeping of a denominator, not in any verdict.

### 7.3 Falsification RE-RUN, fresh severs, this session

- **SEVER THE WRITER** (`recordInstantiation` → immediate return, no marks, no edge):
  **`Tests 9 failed | 6 passed (15)`, RC=1**, first named failure verbatim `ACCEPTANCE —
  graph.query(definition, "instantiates") returns INSTANCES > ⭐ returns the two placed instances
  instead of refusing` — identical to §3.1. Restored from a pre-sever byte copy;
  `sha256sum` → `7ad39a9b…b27b1`, **byte-identical**. `lane-4g-VERIFY-falsify-WRITER-SEVERED.txt`.
- **SEVER THE READER** (the `instantiates` row deleted from `DEFINITION_AXIS_READERS`):
  **`Tests 8 failed | 7 passed (15)`, RC=1**, and the two severing-specific tests of §3.2 fail
  (`…ROUTED to the definition axis, not to the getTargets path` · `…answers a POSITIVE empty`),
  with the confident-empty diff reproduced verbatim (`- "inst-2", - ] + []` at
  `graphQueryServiceDefinitionAxis.test.ts:63`). Restored; `sha256sum` → `8ef3913d…31531`,
  **byte-identical**. `lane-4g-VERIFY-falsify-READER-SEVERED.txt`.
- **RESTORED-GREEN control:** the same suite immediately after both restores — **15 passed, RC=0**
  (`lane-4g-VERIFY-falsify-RESTORED-GREEN.txt`). Digest ledger:
  `lane-4g-VERIFY-falsify-sha256-BEFORE.txt` / `lane-4g-VERIFY-falsify-sha256-AFTER-RESTORE.txt`.

The two severings fail **different named tests** — the acceptance clause's falsification
condition ("sever the writer → a named test fails; sever the reader → a DIFFERENT named test
fails") is **re-proven, not inherited**.

### 7.4 Claims checked against their sources, not against §1's prose

- **C71 §1.5 / §2.5 / §2.6 / §2.7 and C112 §5 were read in full**; the lane's citations are
  accurate, including §2.7's exact endpoint declarations and obligation 4's asymmetric
  refusal-not-cascade. `removeDefinitionDependenciesAuthoredBy` matches on
  `metadata.slotId || authoredBy` **edge-wise** — the §FIX-STAIR-DELETE-LEAVES-GRAPH-EDGES shape
  C112 §5 mandates, not the endpoint purge it forbids; the in-suite over-purge control (§3.3)
  measures the forbidden shape.
- **R14 layer claim re-measured:** `graphQueryBusHandlers.ts` (untouched by any lane) registers
  `type: 'graph.query'` with execute body `service.query(cmd.elementId, cmd.relationshipType)` —
  a pass-through, so the suite's assertion object IS the bus verb's return.
- **§4.4's gate edit re-read in the diff:** +44 lines, all inside `DEDICATED_READERS` — seven
  rows, no receiver pin (each spelling measured unique), **`REQUIRED` untouched, no ceiling
  raised, no `gate-debt.json` entry**, and the comment block itself restates §4.3's refusal to
  silence the ⚠ line.
- **§4.1 (no instance→type edge, §66 unanswerable) re-checked against C71 §2.7's table:** the
  contract's declared endpoints are `instance → definition` and `type → definition|type`;
  the audit row's `graph.query(typeId,'instantiates')` spelling indeed requires an edge the
  contract does not declare. **The D-level finding stands and still blocks Phase 4 EXIT.**
- **Working-tree hygiene:** the other modified files in `git status` belong to sibling lanes
  (`ChatCapabilityRegistry.ts` / `ChatCommandClassification.ts` / `check-chat-capability-coverage.ts`
  → 4H, confirmed against `lane-4h-ai-reaches-the-slice.md` §files; `performUndoRedo.ts` /
  `ElevationOutlineSurface.ts` / persistence + component files → their serialize-only owners).
  ⛔ `packages/schemas/src/siteintel/**` and `packages/site-parcel-data/**` untouched by 4G in
  both sessions. **No `git stash`. Nothing committed.**

**Verdict: the inherited lane is REAL, its documented claims reproduce under independent
execution, and its owed register (§0, §4.1, §4.2) is accurate and still owed.**
