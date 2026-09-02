# LANE 4C — ⭐⭐ THE JOIN: the `component` element kind and its verbs

**Date:** 2026-09-02 · **Authority:** ADR-0376 (D1–D5 + the **D9/D10** addendum), audit §12 Phase-4
row 4C, §11.3 R11/R12/R14, C84 §6 + **§6.2**, C16 CA-21, C69, C110/C111/C112, spec §63/§66/§76.
**Gate:** §76 **B** (no duplicate source of truth) · **G** (placed instances remain parametric).
**Contract minted:** **C113 — ELEMENT: PLACED COMPONENT** (twelve sections, C84 §6.2a).

> ⛔ **Every number below was read from a redirected file with `$?` taken immediately.** No reading
> in this document came through a pipe.
> ⛔ **Nothing is committed.** The lane's brief says so; this file is the handover.

---

## §0 — THE HEADLINE

**The gap is closed at the model layer and open at the presentation layer, and those are two
different sentences that must not be merged into one.**

A component definition can now be placed into a project, read back out of the authoritative store,
saved, reloaded and undone — every leg executed, none declared. And **a placed component does not
appear in the viewport**, which is Phase 4E's under ADR-0376 D10, whose descope is pre-authorised.

⭐ **The suite now holds one example of each of three states this repository routinely conflates,
and C113 §0.1-a names them so the next reader inherits the distinction rather than the confusion:**

| State | Example | Evidence |
|---|---|---|
| honestly **UNBUILT** | C107 adaptive component | zero hits on all four C84 §3.5.1 axes |
| **BUILT, TESTED, UNREACHABLE** | C110 `family-runtime` | 1,118 src lines · 63 passing tests · 0 importers in `apps/editor` |
| ⭐ **BUILT AND REACHED, PIXELS MISSING** | **this family** | 10/10 executed arms through the REAL composed runtime · 3 `UNMIRRORED` rows |

---

## §1 — WHAT LANDED

| Lane-row item | State | Where |
|---|---|---|
| `packages/schemas/src/elements/Component.ts` | ✅ | `Component`, via `defineElement('component')` |
| `component` in `ElementType` / `IdFor` / `AnyElementId` | ✅ | `packages/schemas/src/types/Id.ts` (`ComponentId`) |
| `SCHEMA_REGISTRY` row **in the same commit** as the kind | ✅ | `packages/schemas/src/registry.ts` (D9 binding condition) |
| `component.place` · `component.swapType` · `component.setInstanceParameter` as C16 Path-B handlers | ✅ | `plugins/component/src/handlers/**` |
| `affectedStores` · `canExecute` · a REAL patch pair | ✅ | one store declared, one written; `produceCommand` → Immer forward/inverse |
| **C69 register rows from the first commit** | ✅ | regenerated; all three **LIVE**, store `component`, undo `patch-pair → component` |
| `snapshotFamilyCoverage` row **whose read channel is PROVEN to resolve** | ✅ | §3 — and the proof is a gate this lane did not author |
| a real undo adapter (rather than an `UNMAPPED_BUS_STORE_KEYS` row) | ✅ | `composedStoreUndoAdapter('component', …)` in `buildUndoStoreMap()` |
| ⛔ **C16 CA-21 executed read-back from the AUTHORITATIVE store** | ✅ | §2 |
| ⛔ **SAVE → RELOAD → the component is still there** | ✅ | §2 ARM G |
| C84 §6.2a twelve-section contract | ✅ | **C113**, minted with its README row in the same commit |

**Suites:** `componentJoinThroughComposedRuntime` **10/10** · `componentRecord` **7/7** ·
`persistedFamiliesReachTheSerializerChannel` **8/8** (pre-existing) ·
`balconyReachableThroughComposedRuntime` **13/13** (pre-existing, unaffected) ·
`snapshotFamilyRoundTrip` **8/8** (pre-existing, unaffected). **Root `tsc --skipLibCheck --noEmit` → RC=2 — ⚠ both errors are in `packages/site-parcel-data/**` (the Europe collision boundary, TRACKED AND UNMODIFIED), ZERO in any file this lane touched. §6.1 carries the correction and the attribution; this line read RC=0 ten minutes earlier and that reading is superseded.**

---

## §2 — THE ACCEPTANCE, AND WHY IT IS THE SHAPE IT IS

The lane row's acceptance is the hardest in the phase and it is three separate demands. Each is met
by an arm of `apps/editor/__tests__/componentJoinThroughComposedRuntime.test.ts`.

### §2.1 — It obtains its runtime the ONE way P1 permits, and constructs nothing

`composeRuntime({ bootstrapFn: bootstrapWithEverything })`, then reads `rt.stores.component` — the
SAME key `ProjectSerializer.readPluginStore('component')` resolves in production. **It never builds
a store, a `stores` object or a bus.**

That is not stylistic. R12: *"Had I probed the DTO store, all fifteen would have shown a correct
patch and returned a FALSE PASS."* R14: `tests/family-load-into-project/` — a directory named for
this lane's subject — touches no project, no store, no element and no bus. And the pool: a thorough
suite running the real bus, the real ring buffer and the real multi-store router, green for weeks,
while `pool.create` could not be dispatched by the application at all — because the suite SUPPLIED
the stores provider and the stores provider was the broken thing.

### §2.2 — The arms

| ARM | Property | How it is read |
|---|---|---|
| A | the composition root contributes the `component` store | `rt.stores.component instanceof ComponentStore` |
| **B** | ⭐ `component.place` dispatches **and the occurrence is in the authoritative store** | `rt.stores.component.getState().get(id)` — never `success`, never a spy, never `nextStates` |
| C | NEGATIVE CONTROL — bad `definitionId` / bad `typeId` / duplicate id are REFUSED and write nothing | store size stays 0 |
| D | `swapType` moves the type rung **and does not touch the overrides** | read back both fields |
| E | `setInstanceParameter` sets, clears (key REMOVED, not nulled), and refuses all three ambiguous cases | read back the map |
| **F** | ⭐ spec §66 **F-2**, structural half: 20 placed, 1 overridden, all 20 swapped | 20 read-backs, one by one |
| **G** | ⭐⭐ **SAVE → JSON → RELOAD → still there**, through the REAL serializer and the REAL restore | read back after `restoreCompoundFamilies` |
| H | NEGATIVE CONTROL for G — an empty store writes NO `components` key (C47) | `saved.components` is `undefined` |
| I | the coverage row and the code agree about WHICH key | reads `SNAPSHOT_FAMILY_COVERAGE` |
| **J** | undo is COVERED — the adapter resolves and the REAL inverse reverts the REAL record | read back after `applyPatch` |

### §2.3 — ⭐ ARM F is the §66 property, and it is honest about which half it proves

F-2 has a structural half and a resolution half. **The structural half is this lane's and it passes:
no occurrence holds a resolved copy, so the nineteen follow a type change because there is nothing
of theirs to go stale, and the twentieth keeps its override because `swapType` writes `typeId` and
nothing else.** The resolution half — *does `Width` evaluate to 1600?* — needs
`resolveParameter()` plus the definition document, and there is no project-level definition registry
(§5.2). **Not measured, and not claimed.**

---

## §3 — ⭐ THE READ-CHANNEL PROOF, AND WHY IT IS NOT MINE

R11: *"a `persisted` row asserts the READ CHANNEL resolves, not merely that a key and a writer
exist."* The `balcony` row read `persisted` for **four days** while every balcony was destroyed on
reload, because the family had a store, a writer and a snapshot key, and `StoresSlot` had no
`balcony` key — so `readPluginStore('balcony')` resolved `undefined`.

**The instrument that catches this already exists and this lane did not write it.**
`apps/editor/__tests__/persistedFamiliesReachTheSerializerChannel.test.ts` ARM A **scans
`readPluginStore('…')` out of the serializer's own source** and asserts every key it finds resolves
on a REAL `composeRuntime()`. Adding `readPluginStore('component')` therefore enrolled this family
in that arm automatically — a hand-written list could not have done that, and the test's own header
says so.

⭐ **It was seen failing first.** Removing `component` from the `StoresSlot` literal produced, from
that pre-existing test:

```
AssertionError: these storeKey(s) are READ by ProjectSerializer through window.runtime.stores and
are UNDECLARED/UNATTACHED on the composed runtime, so the save reads undefined and the slice is
silently dropped: [component]: expected [ 'component' ] to deeply equal []
```

---

## §4 — FALSIFICATION

Three removals, each seen RED, each restored **byte-identically (sha256 verified)**.

| # | Removed | Result | Restore |
|---|---|---|---|
| **F1** | `component: componentStore,` from `StoresSlot` in `composeRuntime.ts` | **9 arms RED** across TWO files — my ARMs A–H **and** the pre-existing channel test naming `[component]` | `aaa96f90…9260` ✅ |
| **F2** | the `store.applyPatch(side.patches)` leg in `restoreCompoundFamilies.ts` | **ARM G alone RED** (`one occurrence restored: expected undefined to be 1`); ARMs A–F, H stayed green | `9bfae0ea…2f87` ✅ |
| **F3** | `component: composedStoreUndoAdapter(…)` from `buildUndoStoreMap()` | **ARM J alone RED** (`the component key must have an undo adapter: expected undefined to be defined`) | `201b622c…5a38` ✅ |

⭐ **F2 and F3 each turned exactly ONE arm red.** That is the property that makes the suite a
measurement rather than a smoke test: the save leg, the restore leg and the undo leg are
independently observable, so a green ARM G is not a green ARM J wearing a different name.

**A fourth control** was run for the contract: `check-contract-cited-paths` reads **507 unresolved
with C113 present and 507 with it removed** — so this lane's contract contributes **zero** unresolved
citations, and the ratchet breach is pre-existing (§6.2). Both files restored byte-identically.

---

## §5 — FINDINGS

### §5.1 — ⛔ THE LANE ROW'S `OWNS` COLUMN CANNOT SATISFY THE LANE ROW'S ACCEPTANCE

The `OWNS` column names five paths. The acceptance requires *"save → reload → the component is still
there"* and *"a `snapshotFamilyCoverage` row whose read channel is proven to resolve."* **Neither is
reachable from those five paths.** Closing the join required, in addition:

| File | Why it was unavoidable |
|---|---|
| `plugins/component/**` *(new)* | the coverage gate's SUBJECT is `super('<key>')` under `plugins/*/src/`. A row with no plugin store fails ARM B; a plugin store with no row fails ARM A. There is no third option. |
| `apps/editor/src/PluginRegistry.ts` | without the descriptor `CommandBus.buildContext` throws before any mutation — the verb is registered and undispatchable (L-5200) |
| `packages/runtime-composer/src/types.ts` + `composeRuntime.ts` | `StoresSlot.component` **is** the read channel R11 demands. This is L-11530 exactly. |
| `apps/editor/src/engine/persistence/ProjectSerializer.ts` | the save leg |
| `apps/editor/src/engine/persistence/restoreCompoundFamilies.ts` | the load leg — and it must be in the COMMON TAIL, not a branch (L-11528) |
| `apps/editor/src/engine/persistence/ProjectLoader.ts` | the emptiness predicate and the `__pushIds` completeness list |
| `apps/editor/package.json` + `pnpm-lock.yaml` | the workspace dependency |
| `tools/ga-gate/mirror-debt.json` | §5.3 |
| `docs/02-decisions/contracts/C113…` + `README.md` | C84 §6.2a, a D9 binding condition |

⚠ **None is on the serialize-only list or the collision boundary, and no other Phase-4 lane names
any of them** — 4E owns `plugins/component/src/committer/**` only, which is untouched. **But the
audit's `OWNS` column should be corrected**, because the next lane reading it will under-scope the
same way and will discover the gap after writing the code, not before.

### §5.2 — ⛔ THE LARGEST OPEN ITEM IS UNASSIGNED: THERE IS NO PROJECT-LEVEL DEFINITION REGISTRY

Nothing can answer *"does `fam_…` exist in this project?"* The handlers therefore refuse a
malformed reference and accept a well-formed one, and **four checks are impossible today**:

1. that `definitionId` names a definition the project holds;
2. that `typeId` names a type **that definition declares**;
3. that `par_…` is a parameter of `kind: 'instance'` — C111 makes a **type** parameter non-overridable
   per occurrence, and nothing enforces it;
4. ⭐ **that a value's unit kind matches the parameter's `dataType`** — C110 §3.5-a, whose
   `UnitMismatchError` lane 4A made throwable **for the first time in the repository's history**.
   The kind algebra exists; reaching it from a placement needs the definition document, which needs
   the registry.

**This is not on any Phase-4 lane row.** It is named in C113 §11 item 2 as the largest open item
with **owner: unassigned**, and it is recommended as the next thing after 4E/4G.

### §5.3 — THE RENDER GAP IS DECLARED `UNMIRRORED`, AND THE EASIER GREEN WAS REFUSED TWICE

`check-mirror-completeness` ARM A went RED on all three verbs. Two exits were available and both
easy ones were refused:

- ⛔ **not `kind: 'no-render'`** — that claims a family reaches no builder BY DESIGN, and a component
  is meant to be seen (spec §63's 3-D leg). It would be the naming-vs-behaviour defect C84 §6.2c
  forbids **for this family by name**.
- ⛔ **not a `CommandEventBridge` case** — with no subscriber and no builder, a `case` emits an event
  nobody consumes. That is **inventing a consumer**, the failure `pluginStoreUndoAdapter.ts` names
  for `structural` and `dimension`.

Three `UNMIRRORED` rows, each naming Phase 4E / D10 as owner and stating what is NOT lost meanwhile
(the record, the round trip, the undo — all executed). Gate back to **RC=0**.

### §5.4 — ⛔ ONE RED RATCHET WAS MADE WORSE, AND IT IS REPORTED RATHER THAN ABSORBED

`check-chat-capability-coverage`: **UNDECLARED 13 (baseline 0) at HEAD → 17 with this family.**

The four are `component.place`, `component.swapType`, `component.setInstanceParameter`, and a bare
`component` — the last being the same extraction artefact the ledger already shows for `balcony` and
`lift`, not something this lane introduced.

⛔ **It is not fixable from this lane.** The declaration surfaces (`ChatCapabilityRegistry`,
`CHAT_UNAVAILABLE`) are Phase 4H's exclusive files, and `tools/ga-gate/check-chat-capability-coverage.ts`
is on the serialize-only list as 4H's. **4H's ENTRY condition is literally *"4C's verbs
registered"*** — so the plan schedules this delta deliberately, and its row already names
`component.*`. **That makes it OWED, not acceptable**, and it is recorded in C113 §12.4 in those
words. No ceiling was raised, no gate disabled, no `gate-debt.json` entry added.

### §5.5 — `SCHEMA_REGISTRY` DRIFT (audit T9) IS ONE ROW SMALLER, NOT CLOSED

T9 measured *"28 registry entries, 32 files in `src/elements/`"* — `Balcony`, `BoundaryLine`,
`Section` and `CurtainPanelVocabulary` omitted, two of them governed by real contracts (C103, C106).
`component` was added in the same commit as the kind, per D9. **The other four are still omitted**
and the registry comment says so rather than implying the class is closed.

### §5.6 — A RETRACTION

While verifying, this lane briefly concluded that `snapshotFamilyRoundTrip.spec.ts` — the C67 rule-12
proof for the five §PERSIST103 families — **never runs**, because `apps/editor/vitest.config.ts`
includes only `*.test.ts` and the file is `*.spec.ts`. **That conclusion was wrong and is retracted.**
`apps/editor/vitest.config.ts` states in its own comment that the in-src `.spec.ts` suite *"is claimed
by the ROOT"* config, and running it from the repo root gives **8/8 pass, RC=0**. The first probe
failed only because an ad-hoc config lacked the root's `@app/*` alias. Recorded because the retraction
is worth more than the claim would have been: a test's runner is a fact to measure, not to infer from
its suffix.

### §5.7 — AN UNRELATED MODIFIED FILE IN THE WORKING TREE

`apps/editor/src/ui/dataworkbench/RelationshipExplorerPanel.ts` is modified at this lane's HEAD and
**was not touched by this lane**. Named so the orchestrator's cherry-pick does not attribute it here.

---

## §6 — GATES, EXECUTED

| Gate | RC | Reading |
|---|---|---|
| `check-snapshot-family-coverage` | **0** | 31 store keys · 31 rows · sets equal both directions · 28 persistence claims verified · UNPERSISTED ledger unchanged at **2/2** |
| `check-verb-register` | **0** | after `--write`; 364 verbs; the three rows **LIVE**, store `component`, undo `patch-pair → component` |
| `check-mirror-completeness` | **0** | 157 uncovered / 157 listed, both directions clean (110 `UNMIRRORED`) |
| `check-contract-index-equivalence` | **0** | arm A **18 = baseline**, arms B/C/D clean — C113's file and row moved together |
| `check-layer-boundaries` | **0** | within baselines (violations **48/102**, unclassified 13/13, sdk-bypass **156/182**) |
| `check-domain-purity` | **0** | 202 files, **0 impurities**, hard-fail at zero |
| `check-otel-spans` | **0** | ZONE A **277/277** at zero tolerance; ZONE B **52 of 88 against a baseline of 52** — the new plugin barrel and all three handlers are instrumented |
| `check-provenance-coverage` | **0** | 0 findings, hard-0 |
| **root `tsc --skipLibCheck --noEmit`** | ~~0~~ **2** | ⚠ **CORRECTED — see §6.1. Two errors, BOTH in `packages/site-parcel-data/**`. ZERO in any file this lane created or edited.** |
| `check-chat-capability-coverage` | ⛔ **3** | **UNDECLARED 13 → 17** — §5.4, OWED to 4H |
| `check-contract-cited-paths` | ⛔ **3** | **507 / 490 — PRE-EXISTING.** Measured **507 both with and without C113**; this lane contributes zero |
| `check-no-dark-test-files` | ⛔ **3** | **35 / 13 — PRE-EXISTING.** Zero occurrences of `component` in the output; the findings are untracked `audit/element-creation/2026-08-29/probe/*.probe.test.ts` files in the working tree |

### §6.1 — ⚠ CORRECTING THIS LANE'S OWN ROOT-`tsc` READING, INSIDE TEN MINUTES

The row above first read **RC=0, 0 errors**, measured at **08:33**. Re-run at **08:43** after the documentation edits: **RC=2**, two `TS6133` (*declared but never read*) errors — `packages/site-parcel-data/src/countryAdapters/dk/dkRuleMapper.ts` (`planName`) and `packages/site-parcel-data/src/countryAdapters/lt/ltRuleMapper.ts` (`LtAsgrClassifiedValue`).

**Attribution, measured rather than assumed:** both files are **TRACKED AND UNMODIFIED** (`git status` lists neither), last written **2026-09-01**, and they belong to `packages/site-parcel-data/**` — the **Europe-waves collision boundary this lane is forbidden to touch** (audit R9 / §12.0 rule 1). Neither error is in a file this lane created or edited; `grep` for this lane's paths over the tsc output returns **nothing**. **Not fixed, and deliberately so.**

⛔ **I cannot explain the 08:33 → 08:43 change and I am not going to pretend I can.** The candidates are TypeScript incremental state (`packages/command-registry/tsconfig.tsbuildinfo` is modified in the working tree) and a race with a concurrent Europe-lane write in this shared tree. **The honest reading is the RED one**, and it is recorded here because the alternative — leaving a green line measured ten minutes before a red one — is the stale-optimistic transcription CLAUDE.md's own P4 correction boxes exist to punish: *stale-pessimistic wastes budget; stale-optimistic certifies a breach as clean.*

⚠ **CONSEQUENCE FOR THE ORCHESTRATOR:** the Fly build runs the root `tsc` and hard-fails on it ([[build-uses-stricter-root-tsc]]). **This tree cannot deploy until those two unused locals are removed**, and the fix belongs to the Europe wave that owns that package — not to a universal-component-editor lane.

⚠ **The three RED readings are reported with both numbers and with their attribution.** One is this
lane's and is owed to a named lane; two are pre-existing and were measured to be so rather than
assumed.

---

## §7 — WHAT THIS LANE DOES **NOT** ESTABLISH

Stated so no green above is over-read. Each is in C113 §11 with an owner.

1. **That a placed component RENDERS.** Nothing subscribes the store's dirty channel. Phase 4E / D10.
2. **That a CLICK places one.** No tool, no palette entry, no property panel. Phase 4F.
3. **That a `definitionId` resolves.** §5.2 — the largest open item, unassigned.
4. **That a parameter resolves through the ladder.** §2.3 — the structural half only.
5. **That the World Model knows.** No `instantiates` / `specializes` / `dependsOnDefinition`. Phase 4G.
6. **That chat can reach it.** §5.4. Phase 4H.
7. **Delete, move, rotate, level-change, batch place** — five ordinary verbs this family does not have.
8. **Hosting, nesting, connectors** — D11 / D6 / C112, each OPEN, each declared inert rather than absent
   where a field exists (`hostId`).

---

## §8 — HANDOVER

**Nothing is committed.** The tree carries this lane's changes alongside 4A's (`family-runtime`) and
4B's (`file-format`) uncommitted work.

**If the orchestrator commits this lane alone, these must move together** — the row-and-range rule
applied at three levels:

- the kind **and** its `SCHEMA_REGISTRY` row (D9 binding condition);
- the family **and** its `snapshotFamilyCoverage` row **and** its `StoresSlot` key (R11 — a row
  without the key is the four-day balcony lie);
- **C113 and its `README.md` row and the README's range paragraph** (the shape that has failed seven
  times on this suite);
- the three verbs **and** the regenerated `API-VERB-REGISTER.md` (C69 §0.1 — the register is
  generated, never transcribed);
- `apps/editor/package.json` **and** `pnpm-lock.yaml` (frozen-lockfile).

---

# §9 — INDEPENDENT RE-VERIFICATION ADDENDUM (2026-09-02, second 4C session)

A second 4C session found this document (mtime 08:44) and the full delta on disk, uncommitted.
Per the standing mtime rule it **VERIFIED BY EXECUTION rather than redid** — and the re-execution
was **mandatory, not courtesy**: `packages/runtime-composer/src/{types,composeRuntime}.ts` carry
mtime **09:38**, LATER than every transcript above ([[verification-artifact-can-predate-subject]] —
a proof older than its subject proves nothing). Lanes 4E/4F/4G/4H had also landed in the shared
tree since. Every number below is from a redirected file with `$?` read immediately.

## §9.1 — Re-executed at the 11:10–11:25 HEAD

| Leg | Result | Transcript |
|---|---|---|
| `componentJoinThroughComposedRuntime` + `persistedFamiliesReachTheSerializerChannel` | **18/18 · RC=0** | `lane-4c-VERIFY-join-and-channel.txt` |
| `componentRecord` (plugins/component) | **7/7 · RC=0** | `lane-4c-VERIFY-componentRecord.txt` |
| `snapshotFamilyRoundTrip.spec.ts` (root config) | **8/8 · RC=0** | `lane-4c-VERIFY-roundtrip-spec.txt` |
| `check-snapshot-family-coverage` | **RC=0** | `lane-4c-VERIFY-gates.txt` |
| `check-mirror-completeness` | **RC=0** | same |
| `check-contract-index-equivalence` | **RC=0** — re-run again after §9.4's C84 edit, still RC=0 | same + `/tmp/idx2.txt` |
| `check-verb-register` | ⚠ **RC=1 → RC=0** — §9.3 | `lane-4c-VERIFY-gates.txt`, `lane-4c-VERIFY-verbregister-rewrite.txt` |
| root `tsc --skipLibCheck --noEmit` | **RC=0, zero errors** — §9.2 | `lane-4c-VERIFY-root-tsc.txt` |
| `check-chat-capability-coverage` | **UNDECLARED 0 (baseline 0)** — §5.4's owed 13→17 is **CLOSED by 4H**; the gate still exits 3 on OTHER arms (3 unresolvable parameter sources, scope/spatial modes, 47 panel-editables) and `component` appears in that output ONLY on the element-kind-discriminator exclusion line | `lane-4c-VERIFY-chat-coverage.txt` |

The `component` StoresSlot key was verified to have SURVIVED the 09:38 runtime-composer edits
(`composeRuntime.ts` `component: componentStore` · `types.ts` `readonly component?:` both present),
and the suite's `store()` helper was re-read at source: it reads `rt.stores` off the REAL composed
runtime and throws if the key is absent — the CA-21 read-back is genuine, not nominal.

## §9.2 — §6.1 IS RESOLVED AT HEAD; and root tsc needs the build's heap

The two `TS6133` errors §6.1 attributed to `packages/site-parcel-data/**` are **GONE** — the Europe
wave fixed its own files. ⚠ Two measurement notes: at the default Node heap, root tsc **dies RC=134
(V8 OOM)** — the green reading requires `NODE_OPTIONS=--max-old-space-size=6144`, the same heap the
`build` script sets; a lane that reads RC=134 should raise the heap before concluding anything.
**The §6.1 deploy-blocker is therefore lifted at this HEAD.**

## §9.3 — THE VERB REGISTER WENT STALE *AGAIN* BETWEEN SESSIONS, BY THE SAME MECHANISM

At 11:15 `check-verb-register` read **RC=1**: *"the verb set matches but 19 line(s) disagree —
Regenerate with --write."* Attribution, measured: this lane regenerated the register at **08:24**;
4H's `ChatCapabilityRegistry.ts` landed at **09:46**, flipping 19 rows' chat column from
`UNDECLARED` to `deferred (CHAT_UNAVAILABLE)` — among them all three `component.*` rows.
Regenerated per the gate's own instruction (C69 §0.1 — generated, never transcribed) → **RC=0,
matches the code both directions**; the three `component.*` rows remain **LIVE · patch-pair →
component**. ⭐ The lesson is §8's move-together rule operating at the SESSION scale: in a shared
tree, ANY lane that changes a declaration surface owes the regeneration, and the LAST lane out
must re-run the gate.

## §9.4 — D9'S CENSUS CONDITION WAS ONLY HALF-DISCHARGED; THE C84 ROW IS NOW ADDED

D9: *"the family census row moves IN THE SAME COMMIT as the kind."* §1 mapped that condition to the
`SCHEMA_REGISTRY` row alone. But the audit's D9 row (line 1300) says the kind *"changes the family
census"* in the **C84 §6 sense**, and measurement showed **C84 §6.1's block-beyond-C99 table had NO
C113 row** (C101/C104/C106/C107/C109 only) with C84 unmodified in the tree. **This session added the
C113 row to C84 §6.1** — component (placed occurrence), naming the three verbs, the D9 authority and
the 4E/D10 render owner — so kind + registry row + coverage row + contract + README row + **census
row** genuinely move in one commit. `check-contract-index-equivalence` re-run after the edit: RC=0.

## §9.5 — FALSIFICATION, RE-RUN FRESH (not inherited)

F3 re-executed at this HEAD on `performUndoRedo.ts` (serialize-only, this lane's): BEFORE sha256
`201b622c…5a38` — **byte-identical to §4 F3's restore hash**, proving continuity with the prior
session's tree. Adapter line commented → **ARM J ALONE red** (`the component key must have an undo
adapter: expected undefined to be defined`, 1 failed | 9 passed, RC=1) → restored from copy,
`sha256sum -c` **OK** → **10/10 RC=0**. Transcripts: `lane-4c-VERIFY-falsify-{sha256,SEEN-FAILING,RESTORED-GREEN}.txt`.

## §9.6 — THE `OWNS` DEVIATION, VERIFIED RATHER THAN RE-LITIGATED

The lane row's `packages/command-registry/src/component/**` was never created; the handlers live at
`plugins/component/src/handlers/**`. Verified justified and left alone: the coverage gate's subject
is `super('<key>')` under `plugins/*/src/` (§5.1 — there is no third option), the verb-register rows
classify all three verbs through the **§BLSTORE/§BATH102 StoresSlot-singleton** precedent exactly as
`bathroomPod.*` and `balcony.*` are classified, and moving files to satisfy a path string in a
planning row would break a green, falsified, gate-clean join for zero behavioural gain. The audit's
§12 row should be corrected to read `plugins/component/src/{handlers,store,errors}/**` — same
correction class as §5.1.

**Nothing committed** (per brief). §8's move-together list gains one line: **the C84 §6.1 census row
travels with the kind** — it is in the tree now, and the orchestrator's cherry-pick must include
`docs/02-decisions/contracts/C84-ELEMENT-INTEGRITY.md` and the regenerated
`docs/04-reference/API-VERB-REGISTER.md`.
