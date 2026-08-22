# C102 — VIEW & SHEET INTEGRITY

- **Status**: CANONICAL — binding on every PR that touches a `ViewDefinition`, a `SheetDefinition`,
  a `VisibilityIntent` binding, or the panels that surface them
- **Date**: 2026-08-22 (lane ANNO15)
- **Spawned by**: [C84 §6](C84-ELEMENT-INTEGRITY.md), applied to the two entities the per-element
  block does not cover. A view and a sheet are not element families, so C85–C99's twelve sections
  are used **selectively and the omissions are declared** (§0.2) rather than padded.

> ## §0.1 — ⛔ WHAT THIS CONTRACT DELIBERATELY DOES NOT OWN
>
> **Views and sheets are already governed. This contract is NOT a rival, and refusing to re-answer
> is the first thing it does** — C84 EI-9, *one answer per question*. A second contract answering a
> question C24 already answers would make both unreadable, which is the exact failure the suite index
> records at C00 row 4.
>
> | Question | Owner — go there, not here |
> |---|---|
> | What governs an element's appearance in a view? | **[C09 §4](C09-AI-AND-VISIBILITY-INTENT.md)** — the Visibility Intent system |
> | How is a sheet composed; what is a viewport? | **[C24](C24-SHEET-COMPOSITION-ENGINE.md)** + **[C24.1](C24.1-AUTO-DOCUMENTATION-SHEETS-PROTOCOL.md)** |
> | How does a sheet become a PDF? | **[C29](C29-PDF-VECTOR-EXPORT.md)** |
> | Drawing sets, revisions, issue register, transmittals | **[C30](C30-DRAWING-SET-MANAGEMENT.md)** |
> | Pens, weights, paper sizes, drawing standards | **[C34](C34-PRINT-AND-DRAWING-STANDARDS.md)** |
> | How are multiple view panes hosted on screen? | **[C59](C59-MULTI-PANE-VIEW-SYSTEM.md)** |
> | What is drawn ON a view (annotations)? | **[C101](C101-ELEMENT-ANNOTATION.md)** |
>
> **C102 owns exactly one question those seven do not ask:** *for the view and sheet entities — what
> are the representations, WHICH ONE IS THE AUTHORITY, what does undo restore, and what is reachable
> from a UI control?* That is C84's integrity question, and nothing had asked it of these two.

> ## §0.2 — Sections of C84 §6 declared NOT APPLICABLE, with the reason
>
> A skipped section must be declared, never omitted (C84 §6: *"a contract that omits a section is
> incomplete"*). §5 **bridge field map**, §9 **material vocabulary** and §10 **geometry stacks** do
> not apply: a `ViewDefinition` has no kernel producer, no material and no Stack A / Stack B
> rivalry. §8 **cascades** applies and is answered.

- **Evidence**: measured in the MAIN worktree on **2026-08-22** by `grep -n` / line-numbered read.
  Every claim carries `file:line`. Unverifiable cells read **NOT MEASURED**.

> ## THE TWO ONE-LINE VERDICTS
>
> **(1) THE VIEW→TEMPLATE BINDING HAS NO WRITER, AND HAS NOT HAD ONE FOR SIXTEEN WEEKS.**
> `ViewDefinition.viewTemplateId` is written only by `SetViewTemplateCommand` and
> `AssignViewTemplateToViewCommand` (`packages/command-registry/src/views/`). Measured
> `grep -rn` over `apps packages plugins src`: **hits only inside those two files and the two barrels
> that re-export them. ZERO production callers, no bus verb, no UI path.** The field is a schema
> member nothing sets.
>
> **(2) THAT IS NOT A BUG — IT IS THE FINISHED HALF OF A RATIFIED MIGRATION, LEFT VISIBLE.**
> `ViewTemplateStore.ts`'s header, stamped **2026-04-26**, says *"@deprecated … View Templates have
> been absorbed into `VisibilityIntent.viewSeed` … NEW CODE MUST NOT WRITE TO THIS STORE."*
> [C09 §4.5](C09-AI-AND-VISIBILITY-INTENT.md) says *"Visibility intents replace Revit-style view
> templates."* The binding moved to `viewIntentInstanceStore`. **What was left behind was a UI panel
> still reading the retired store** — and it reported twelve rows of `VIEWS 0` because the count was
> structurally incapable of being anything else.

---

## §1 — IDENTITY

### AS-IS — measured

| Entity | L0 / type | Store | Snapshot slice |
|---|---|---|---|
| `ViewDefinition` | `packages/core-app-model/src/views/ViewDefinitionTypes.ts` | `ViewDefinitionStore.ts` (`viewDefinitionStore`) | `ProjectSerializer.ts` (views slice) |
| `VisibilityIntent` | `packages/core-app-model/src/presentation/VisibilityIntentTypes.ts:423` | `VisibilityIntentStore.ts:132` (`visibilityIntentStore`) | `serialize()` `:105` |
| **`ViewIntentInstance`** | `presentation/ViewIntentInstanceStore.ts` | `viewIntentInstanceStore` — `assign()` `:62` | `serialize()` `:163` |
| `ViewTemplate` | `views/ViewTemplateTypes.ts` | `ViewTemplateStore.ts` — **`@deprecated readable`** | `serialize()` present, legacy |
| `SheetDefinition` | `views/SheetDefinitionTypes.ts:148` | `SheetStore.ts` (`sheetStore` `:411`) | `ProjectSerializer.ts:916` |
| `SheetViewport` | `SheetDefinitionTypes.ts:63` (position = **bottom-left**, §SHEET-PDF-PLACES-THE-VIEWPORT L-1874, `:69-88`); `scale` `:89`; annotation crop `:99` | inside `SheetDefinition` | with the sheet |
| `RevisionEntry` | `SheetDefinitionTypes.ts:35`; `SheetDefinition.revisions?[]` `:186`; legacy string `revision` `:163` | inside `SheetDefinition` | with the sheet |
| `TitleBlock` | `views/TitleBlockTypes.ts` | `TitleBlockStore.ts` | with the sheet |

**FIVE system intents**, `presentation/SystemIntents.ts:8-21` — `architecturalDocumentation`,
`architecturalPlanCurrentLevel`, `setOut`, `cleanPresentation`, `structuralCoordination`. They are
loaded by `VisibilityIntentStore`'s **constructor** (`:20-24`), so the intent list is **never empty
and never needs seeding**.

### TO-BE — normative

- **V-ID-1.** ⭐ **A VIEW IS BOUND TO AN INTENT, NEVER TO A TEMPLATE.** The binding is
  `ViewIntentInstance` (`viewIntentInstanceStore.assign(viewId, intentId)`). `viewTemplateId` is
  **legacy read-only** and MUST NOT acquire a new writer.
- **V-ID-2.** **A "VIEW TEMPLATE" IS A KIND OF INTENT** — specifically, an intent carrying a
  `viewSeed` (`VisibilityIntentTypes.ts:537`: *"Replaces the legacy ViewTemplate concept"*). The two
  are **ONE domain concept with two historical surfaces**, not two concepts that overlap. Any UI that
  presents them as separate lists is asserting an architecture this repo does not have.

---

## §2 — STORES — and which is THE AUTHORITY

### AS-IS — measured. FOUR representations of "what governs this view".

| Representation | Written by | Read by | Live? |
|---|---|---|---|
| `viewIntentInstanceStore` | `AssignViewIntentCommand` ← bus verb **`vg.assignIntent`** (`initBusHandlers.ts:2526-2530`) ← `HeaderIntentPicker.ts:96` | `intentUsageCount()`, the resolver chain | **YES — THE AUTHORITY** |
| `visibilityIntentStore` | `vg.createVisibilityIntent` `:2532`, `vg.updateVisibilityIntent` `:2538` | everything | YES |
| `view.viewTemplateId` | `SetViewTemplateCommand`, `AssignViewTemplateToViewCommand` | `SyncStateEngine.ts:187`, `DeleteViewTemplateCommand.ts:49`, the migration `:247` | **NO WRITER** (verdict 1) |
| `vgGovernanceStore` (legacy VG cascade) | `SetVGCategoryStyleCommand` etc. | `VgCanvasStyleResolver` | YES, but **defaults contribute nothing** — C09 §4.5.1 |

### THE AUTHORITY

**`viewIntentInstanceStore`.** It is the only one of the four with a live writer reachable from a UI
control, and `intentUsageCount()` (`presentation/selectors/intentUsageCount.ts`) is the only correct
"which views use this?" reader in the repo.

⭐ **THE MEASURED CONSEQUENCE, AND WHY A ZERO IS THE MOST DANGEROUS READING A PANEL CAN SHOW.**
Until 2026-08-22 the rail panel counted `viewDefinitionStore.getAll().filter(v => v.viewTemplateId === id)`.
Because that field has no writer, **the column was pinned at 0 by construction**. Twelve rows of zero
looked exactly like *"nothing assigned yet"*, which is a legitimate state — so the panel was
**indistinguishable from a correct panel on an empty project**. §CONTEXT-DATA-HONESTY at the UI
layer: *failure* and *empty* were the same value, and a reader could not tell.

**The discriminator is motion, not value.** A test asserting *"shows 0"* scores 1.000 on the broken
build. `visibilityIntentPanelReadsIntents.spec.ts` binds a view through
`viewIntentInstanceStore.assign()` and asserts the number **MOVES** — and it is the only assertion in
that file that could ever have failed. **A count that cannot move is not a count.**

### TO-BE — normative

- **V-ST-1.** Any surface reporting *"views using X"* MUST read `viewIntentInstanceStore`, via
  `intentUsageCount()`. Reading `viewTemplateId` for this purpose is forbidden.
- **V-ST-2.** ⛔ **NO NEW WRITE TO `viewTemplateStore`.** Its own header has forbidden this since
  2026-04-26. `ViewTemplateManagerPanel._ensureDefaultTemplates()` violated it — twelve
  `viewTemplate.create` dispatches on first open — and is DELETED (`4e91e98a`).
- **V-ST-3.** ⭐ **A COUNTER MUST BE PROVEN BY MOTION.** Any panel column derived from a store
  binding MUST carry a test that CHANGES the binding and asserts the displayed value follows.
  Asserting a static value is not a guard. This generalises C09 §4.5.1 ¶4's positive-control rule
  from strokes to counts.

---

## §3 — CONSUMERS

### AS-IS — measured

| Consumer | Reads | Note |
|---|---|---|
| `VisibilityIntentManagerPanel` (rail) | `visibilityIntentStore` + `intentUsageCount` | ← **repointed 2026-08-22**, `4e91e98a` |
| `HeaderIntentPicker.ts` | `visibilityIntentStore`, `viewIntentInstanceStore` | the "GOVERNS THIS VIEW" surface — **the binding writer** |
| `VisibilityIntentPanel.ts` | intent element rules | the **rule editor**; lazy-loaded, `initUI.ts:730-768` |
| `ViewPropertiesPanel.ts` | intent + view | |
| `SyncStateEngine.ts:187` | `viewTemplateId` | **reads a field with no writer** — its `viewSyncState` output is therefore always the no-template branch |
| `ViewTemplateToIntentMigration.ts` | both | runs at project load; **skips wholesale once any `migrated-vt-*` intent exists** |
| `SheetEditorPanel` + `ViewportSvgComposer` | `sheetStore`, viewports | C24's surface |

### THE SPLIT-BRAIN, stated precisely

**`SYNC —` on every row was a TRUE report of a DEAD computation.** `_computeAggregateSyncState`
returned `—` for an empty view list, and the list was empty for the reason in §2. **The sync column
was not broken; it was correctly summarising nothing.** This is worth recording precisely because it
is the opposite of the intuition: two adjacent columns, one structurally dead (`VIEWS`) and one
faithfully reporting the consequence (`SYNC`).

### TO-BE — normative

- **V-CN-1.** `SyncStateEngine`'s template branch MUST either acquire a writer or be re-expressed
  over `ViewIntentInstance.pinnedVersion` (`ViewIntentInstanceStore.ts:129` `pinViewVersion`), which
  is the intent-era equivalent of template sync. DELTA-3.
- **V-CN-2.** The migration runs **only at project load**. A legacy template written after load is
  never absorbed. Such rows MUST be **surfaced with the reason**, never silently hidden — a row the
  user authored that vanishes is worse than a row labelled stale. Implemented as the panel's
  *"Legacy view templates (N)"* group.

---

## §4 — REACHABILITY FROM A UI CONTROL

### AS-IS — measured, and this is the section C84 §6 §4 exists for

| Capability | Command | Bus verb | Reachable from a control? |
|---|---|---|---|
| Bind a view to an intent | `AssignViewIntentCommand` | **`vg.assignIntent`** `:2526` | ✅ `HeaderIntentPicker.ts:96` |
| Create an intent | `CreateVisibilityIntentCommand` | **`vg.createVisibilityIntent`** `:2532` | ✅ rail panel `+ New` (2026-08-22) |
| Update an intent | `UpdateVisibilityIntentCommand` | **`vg.updateVisibilityIntent`** `:2538` | ✅ rail panel detail |
| Take latest intent version | — | **`vg.takeLatestIntentVersion`** `:2732` | NOT MEASURED |
| **Delete an intent** | **`DeleteVisibilityIntentCommand` EXISTS** — `packages/command-registry/src/vg/` | ⛔ **NONE** | ⛔ **UNREACHABLE** |
| Create an intent from a view | `CreateIntentFromViewCommand` exists (`index.ts:314`) | ⛔ **NONE** | ⛔ **UNREACHABLE** |
| Unbind a view | `UnbindViewIntentCommand` exists (`index.ts:333`) | ⛔ **NONE** | ⛔ **UNREACHABLE** |
| Pin / unpin intent version | `PinViewIntentVersionCommand` exists (`index.ts:325`) | ⛔ **NONE** | ⛔ **UNREACHABLE** |
| Bind a view to a template | `SetViewTemplateCommand`, `AssignViewTemplateToViewCommand` | ⛔ **NONE** | ⛔ **UNREACHABLE** — and correctly so (V-ID-1) |

⭐ **FIVE COMMANDS ARE WRITTEN, EXPORTED FROM THE BARREL, AND REGISTERED ON NO VERB.**
Per C01 §6 rule 6 this is **UNREACHABLE, not ABSENT**, and the distinction decides the fix: each is a
**handler row in `initBusHandlers.ts`**, not a build. This is [[authored-but-unwired-is-the-bottleneck]]
in its purest form — the expensive half is done and the three-line half is not.

⚠ **Four of the five are not obviously safe to wire blind.** `UnbindViewIntentCommand` leaves a view
governed by nothing; `DeleteVisibilityIntentCommand` may orphan bound views. **What each does to
bound views is NOT MEASURED**, and wiring a verb whose cascade is unmeasured is how
[[refusing-half-needs-its-escape-hatch]] happens in reverse. They are logged, not wired.

### TO-BE — normative

- **V-RE-1.** ⭐ **A CONTROL FOR AN UNREACHABLE CAPABILITY MUST RENDER DISABLED WITH THE REASON
  NAMED** — [C82](C82-RIBBON-CAPABILITY-SURFACE.md)'s second legal state. It MUST NOT render enabled
  and no-op, and it MUST NOT be quietly omitted: omission makes the gap invisible and the capability
  unfindable. The intent panel's delete icon implements this and names L-5062.
- **V-RE-2.** No `vg.*` verb may be registered for a command whose effect on **bound views** has not
  been measured and written into this section.

---

## §6 — VERBS

Four `vg.*` verbs are registered (`initBusHandlers.ts:2526, :2532, :2538, :2732`). Five commands are
not (§4). `vg.createVisibilityIntent` forwards **the whole command object** to
`new CreateVisibilityIntentCommand(cmd)`, so its payload is a complete `VisibilityIntent`; its
`canExecute` refuses a missing id, a missing name, `isSystem: true`, and a duplicate id
(`CreateVisibilityIntentCommand.ts:17-21`).

- **V-VB-1.** A new intent MUST be seeded from `cloneDefaultElementGraphicsRules()`. An intent with
  empty `elementRules` resolves to nothing drawn — a "new intent" that blanks the view.

---

## §7 — UNDO / REDO

`CreateVisibilityIntentCommand.undo()` → `visibilityIntentStore.delete()` (`:31`).
`AssignViewIntentCommand`, `UpdateVisibilityIntentCommand` carry inverses.
`affectedStores = ['visibility-intent']` (`:6`).

⚠ **NOT MEASURED:** whether `createSnapshot` covers `visibility-intent` and `view-intent-instance`
(C84 EI-7d), and whether an undo of `vg.assignIntent` restores the PREVIOUS binding or clears it.
DELTA-4.

---

## §8 — CASCADES

| Mutation | Cascade | Reversed? |
|---|---|---|
| `vg.assignIntent` | stamps the intent's `documentation` block onto the `ViewDefinition` (C09 §4, `documentation?` doc) | NOT MEASURED |
| section / elevation / callout mark placed | mints a `ViewDefinition` | ✓ — C101 §8 |
| project load | `ViewTemplateToIntentMigration` folds templates → intents and re-binds views (`:247`) | n/a — one-time, idempotent |
| `DeleteViewTemplateCommand` | does **NOT** cascade-clear `viewTemplateId` on views (`ViewDefinitionStore.ts:479-486` note) | n/a |

⚠ **`DefaultViewsManager` creates a 3-D view, one plan and four elevations — and NO SECTION**
(recorded in C09 §4.5.1). Sections are supported and governed; none exists by default. Carried here
because it is a **view-lifecycle** fact, and C09 records it only in passing.

---

## §11 — THE DELTA

| # | Item | Invariant | Proof | Cost |
|---|---|---|---|---|
| 1 | Register bus verbs for the five unreachable `vg` commands — **after** measuring each cascade | V-RE-2 | each verb dispatches and undoes | small each, **gated on the measurement** |
| 2 | Measure what `DeleteVisibilityIntentCommand` / `UnbindViewIntentCommand` do to bound views | V-RE-2 | a bound view after delete | small |
| 3 | Re-express `SyncStateEngine`'s template branch over `pinnedVersion` | V-CN-1 | SYNC shows a real state | medium |
| 4 | Confirm `createSnapshot` covers both intent stores | C84 EI-7d | undo across a reload | small |
| 5 | Retire `viewTemplateStore`'s write API once the legacy group reads empty on all projects | V-ST-2 | no writer, no reader | medium |
| 6 | A default SECTION view in `DefaultViewsManager` | §8 | a new project has one | small |
| 7 | Surface the sheet-viewport annotation crop (`SheetDefinitionTypes.ts:99`) — is it honoured? | C101 NOT-MEASURED 8 | a cropped viewport prints cropped | small |

---

## §12 — REFUSALS

**R-1 — a view may NOT carry its own stored material overrides.** C09 §4.5, upheld here. Override
state is computed from intent + lens + element state.

**R-2 — system intents may not be edited or deleted.** `VisibilityIntentStore` refuses;
`CreateVisibilityIntentCommand.canExecute` refuses `isSystem: true` (`:19`). The panel renders a
read-only notice rather than inputs that discard input — a control that accepts a keystroke and
discards it is worse than one that explains itself.

**R-3 — `viewTemplateId` may not acquire a new writer.** V-ID-1. The absence of a writer is the
**correct end state**, not a defect. ⭐ **Recorded explicitly because it is exactly the shape a future
audit will "fix":** a field with no writer looks like an oversight, and re-wiring it would resurrect
the model C09 §4.5 retired.

**R-4 — this contract refuses to own sheet composition, PDF export, drawing sets, print standards or
pane hosting.** §0.1. Five contracts already answer those.

### Explicitly NOT REFUSED, and that is a finding

- **Nothing prevents a view from being bound to no intent at all.** `viewIntentInstanceStore.get()`
  returns `undefined` and `HeaderIntentPicker` shows *"— pick an intent —"*. What such a view renders
  with is **NOT MEASURED**.
- **Nothing prevents deleting an intent that views are bound to** — because nothing can delete an
  intent at all (§4). The refusal is accidental, not designed.

---

## NOT MEASURED — the honest register

⛔ Gaps, not clearances (C84 EI-1b).

1. **Every UI claim here is a SOURCE reading.** Lane ANNO15 had no browser. That the renamed panel
   renders correctly in the running app is **unverified**; the 5 green specs run in happy-dom.
2. **`createSnapshot` coverage** for `visibility-intent` / `view-intent-instance` (§7).
3. **Undo semantics of `vg.assignIntent`** — restore vs clear (§7).
4. **The cascade of the five unwired commands** (§4).
5. **What an unbound view renders with** (§12).
6. **Sheet-viewport annotation crop** honouring (§11 DELTA-7).
7. **`vg.takeLatestIntentVersion` reachability** — the verb is registered; its control is not traced.
8. **Whether the app builds `apps/editor/src/engine/persistence/` or `packages/persistence-client/`.**
   Both contain a `ViewTemplateToIntentMigration.ts`. C85 calls the `packages/` copy dead; C101 §0
   measured it. **Unresolved, and it decides whether the migration cited throughout this contract is
   the one that runs.** This is the sharpest open question in both contracts.
