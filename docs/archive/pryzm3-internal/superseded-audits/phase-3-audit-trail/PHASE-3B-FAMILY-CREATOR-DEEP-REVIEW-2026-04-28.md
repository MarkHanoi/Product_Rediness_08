# Phase 3-B Family Creator — Deep Review (2026-04-28, post-S59)

| Field | Value |
|---|---|
| Status | Final review of record for Phase 3-B exit |
| Date | 2026-04-28 |
| Author | Architecture review |
| Scope | The plan document `phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md` AND the implementation it produced (S52 → S59) |
| Question asked | Are all Revit family-level capabilities covered? Is the UI/UX complete? Is everything wired? Would the user journey match Revit-in-the-cloud? |
| Verdict | Architecture: strong. File format & determinism: strong. UI/UX surface: ~5 % of a Revit family editor. Multiple shipped modules are not user-reachable. Plan document contains an internal contradiction between §19's per-sprint audit blocks and the §22.1 exit-audit table. Phase 3-B exits with the foundation proven and the first-mile author surface unbuilt. |
| Cross-refs | `phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md`, `PROCESS-TRACKER.md` §11 row S59, `replit.md` §PRYZM-2-PHASE-3B-S59 |

---

## 1. The plan document itself is internally inconsistent

The plan has **two audit blocks that contradict each other** because they were written at different points during 2026-04-28 and never reconciled:

| Audit block | Says | Reality |
|---|---|---|
| §19.1 – §19.8 (lines 767–970) — "AUDIT 2026-04-28" inside each sprint section | S52 ~60 %, S53 ~5 %, S54 0 %, S55 0 %, S56 0 %, S57 0 %, S58 ~10 %, S59 0 % | Stale. Written before S55–S59 were delivered later the same day. |
| §22.1 (lines 1027–1050) — "Phase 3-B exit audit" | 4 ✅ / 7 ◐ / 1 ⏳, "all hard-blocking goals green" | Optimistic. Several ◐ rows describe code that *exists in files* but is **not wired into any user-reachable UI**. |

**Recommendation A (must do before Phase 3-C kicks off):** delete or rewrite the §19 per-sprint audit blocks so they no longer contradict §22.1.

---

## 2. Plan promises vs files actually on disk

### 2.1 Promised in §3.2 — `panels/` directory with 10 panels

| Promised | On disk |
|---|---|
| `panels/Ribbon.ts` | ❌ does not exist |
| `panels/ProjectBrowser.ts` | ❌ does not exist |
| `panels/ParameterTable.ts` | ❌ does not exist |
| `panels/TypeCatalog.ts` | ❌ does not exist |
| `panels/MaterialSlots.ts` | ❌ does not exist |
| `panels/IfcMapping.ts` | ❌ does not exist |
| `panels/Inspector.ts` | ❌ does not exist |
| `panels/ViewTabs.ts` | ✅ inline in `AppShell.ts` |
| `panels/StatusBar.ts` | ✅ in `app/StatusBar.ts` |
| `panels/ApplicationMenu.ts` | ❌ does not exist |

There is no `apps/component-editor/src/panels/` directory at all. **8 of 10 promised panels are missing.**

### 2.2 Promised in §8 — 40 commands

Actual count: **~9 commands** across the file system:

- `commands/constraint/` — `addCoincident`, `addDistance`, `addFixed`, `addParallel`, `addPerpendicular` (5 of 15 promised)
- `commands/solid/` — 3 verbs in one barrel file (`add`, `remove`, `setLodBitmask`)
- `commands/referencePlane/` — 1 barrel
- **Missing entirely**: `commands/profile/` (10 verbs), `commands/parameter/` (7 verbs), `commands/type/` (5 verbs), `commands/material/` (4 verbs), and 10 of the 15 promised `commands/constraint/` verbs (no horizontal, vertical, tangent, equal-length, radius, angle, diameter, point-line distance, parameter binding, delete).

### 2.3 Promised in §6 — real planegcs WASM

`packages/constraint-solver/` still ships `MockSolver` as the runtime default. `familyEditorRuntime.ts` does call `loadSolver()` to upgrade asynchronously, but `packages/constraint-solver/src/planegcs-porter.ts` and `planegcs-node-porter.ts` (named in §6.2) **do not exist**, and `planegcs` is not in `packages/constraint-solver/package.json`. This is the same partial state the §19.1 audit flagged at S52 — never closed.

### 2.4 Promised in §7.3 — five geometry producers

Actual: `extrude.ts`, `sweep.ts`, `loft.ts`, `revolve.ts`, `boolean.ts` all exist in `packages/geometry-kernel/src/producers/`. ✅

But there is **no UI command that invokes sweep / loft / revolve / boolean** — only `solid.add` exists with a `kind` parameter. The entire 3D-feature creation flow is not user-reachable.

### 2.5 Promised in §9 — sketch tools

Actual: `LineTool`, `RectangleTool`, `ArcTool`, `CircleTool`, `FilletTool`, `TrimTool`, `SelectTool` all exist in `apps/component-editor/src/sketch/tools/`. ✅ Genuinely shipped.

### 2.6 Promised in §3.1 — `apps/marketplace-web/`

Directory exists as a Vite SPA scaffold but has no production deploy. Per §22.1 row 10, deferred to S60.

---

## 3. Wiring gaps — code exists but the user can't reach it

This is the most important finding. These files are implemented, tested, and in the bundle — but the SPA never mounts them, so a real author has no way to invoke them:

| Module | File | Wired into AppShell? | Consequence |
|---|---|---|---|
| `aiHostBridge.ts` | exists | ❌ never instantiated | "AI batch-execute" demo from §16 is unreachable |
| `approvalQueue.ts` | exists | ❌ never mounted as a panel | AI approvals can't be reviewed |
| `marketplace/publishFlow.ts` | exists, 7 integration tests pass | ❌ no menu / no button calls it | Authors can't actually publish from the UI |
| `marketplace/signing.ts` | exists, 5 unit tests pass | ❌ only invoked by `publishFlow` | Transitively unreachable |
| `app/deepLink.ts` | exists, parses `?file=` | ◐ parses then logs to console; comment says "wiring deferred" | Marketplace deep links don't open anything |
| `family-pack.ts` / `family-unpack.ts` | exist in `packages/file-format/` | ❌ no Save / Open / Load button in the UI | Authors can't save or open a `.pryzm-family` file from the SPA |
| `commands/solid/*` | exist | ❌ no toolbar / menu invokes them | Authors can't create solids |
| `commands/referencePlane/*` | exist | ❌ no UI | Authors can't add / edit reference planes |
| Geometry producers (`sweep`, `loft`, `revolve`, `boolean`) | exist, pure Node | ❌ no command dispatches them | Sweep / loft / revolve / boolean unreachable |

`AppShell.ts` mounts exactly one interactive surface: a sketch canvas with a constraint toolbar. The 3D tab and Parameters tab render `appSplash.ts` ("under construction") — confirmed by reading both files.

---

## 4. Revit family-level capability coverage — gap matrix

Revit's family editor is the gold standard. Comparing capability-by-capability:

| Revit family-editor capability | Plan § | Implementation status | Notes |
|---|---|---|---|
| 2D parametric sketch | §9 | ✅ Sketch canvas + 7 tools + 5 constraints | Strongest area |
| Reference planes (named, host-able) | §7.2 | ⚠️ Store + commands exist, **no kernel module**, no UI | Plan promises `packages/geometry-kernel/src/sketch/reference-plane.ts` — not created |
| Reference lines | — | ❌ Not in plan | Revit users use these constantly |
| Real constraint solver (planegcs) | §6 | ⚠️ `MockSolver` only; planegcs files not on disk | |
| Dimensions with parameter binding | §10 | ❌ No ParameterTable panel | Constraints land but can't be parameter-bound |
| Family parameters (type / instance) | §10 | ❌ No UI; no `commands/parameter/` | The whole table is missing |
| Formula expressions on parameters | §7.5 | ✅ `@pryzm/family-runtime/expression/` exists with tokenizer + parser + evaluator + functions | But no UI consumes it |
| Reporting parameters | — | ❌ Not in plan | Revit reads constraint values back as parameters |
| Shared parameters | §21 | ❌ Out of scope (Phase 3D Q4) | OK, but flag for users |
| Family types catalog | §11 | ❌ No TypeCatalog panel; no `commands/type/` | |
| **Solid: Extrusion** | §8.4 | ⚠️ kernel ✅ / UI ❌ | |
| **Solid: Blend (loft)** | §8.4 | ⚠️ kernel ✅ / UI ❌ | |
| **Solid: Revolve** | §8.4 | ⚠️ kernel ✅ / UI ❌ | |
| **Solid: Sweep** | §8.4 | ⚠️ kernel ✅ / UI ❌ | |
| **Solid: Swept Blend** | — | ❌ Not in plan | Standard Revit feature |
| **Voids (cut)** | §8.4 mentions `booleanCombine` only | ❌ No void semantics; the boolean combine isn't a true subtractive-form workflow | Critical for windows / doors |
| Material by category / by parameter | §12 | ⚠️ Slot exists in schema; no `commands/material/`; no MaterialSlots panel | |
| LOD / Detail level visibility | §12.2 | ✅ Bitmask in store + `setLodBitmask` command | But no UI toggle |
| View-specific visibility (plan / elevation / 3D / RCP) | — | ❌ Not in plan | Revit families control this per-form |
| Subcategories (line styles per object) | — | ❌ Not in plan | |
| Family categories (60+ in Revit) | §5.2 | ⚠️ Reduced to 8 IFC entities + 8 categories | OK for v1 |
| **Hosted families (door-in-wall, window-in-wall)** | — | ❌ Not in plan | This is the *defining* Revit feature — without it you cannot author a real door |
| Cut on host (the void cuts the wall) | — | ❌ Not in plan | Same as above |
| Nested families | §21 | ❌ Out of scope (Phase 4) | |
| MEP connectors | §21 | ❌ Out of scope (Phase 4) | |
| Arrays (linear / radial) with array parameter | — | ❌ Not in plan | |
| Family preview thumbnails | §17 | ◐ Single thumbnail / icon; no per-type thumbnails | |
| **IFC Pset bindings** | §10.2 | ⚠️ Schema exists; no IfcMapping panel | |
| Save / Load / Open UI | §17 (publish only) | ❌ No File menu of any kind | |
| Load family into project | §11.2, §19.5 | ✅ Bake-side proven by 200-instance test | But no main-editor UI surface |
| Migration on version bump | §5.5, §19.6 | ✅ Framework + identity migrator + tests | Not user-visible (no migration prompt) |

---

## 5. UI/UX completeness — what an author actually sees

Open the SPA today and the entire reachable surface is:

```
┌─────────────────────────────────────────────────┐
│ [skip-link] PRYZM Family Creator        header  │
├─────────────────────────────────────────────────┤
│ [Sketch] [3D] [Parameters]                      │  ← only Sketch is functional
├─────────────────────────────────────────────────┤
│ [coincident][parallel][perpendicular]           │  ← constraint toolbar
│ [horizontal][vertical][distance]                │
├─────────────────────────────────────────────────┤
│                                                 │
│              <sketch canvas>                    │
│                                                 │
├─────────────────────────────────────────────────┤
│ footer                                          │
├─────────────────────────────────────────────────┤
│ status: solver idle, 0 free DoF                 │
└─────────────────────────────────────────────────┘
```

What an author **cannot** do from the UI:

- Open a file
- Save a file
- See or edit family parameters
- Add or edit family types
- Set materials or material slots
- Set IFC bindings
- See a 3D preview (tab is a placeholder)
- Create an extrusion / sweep / loft / revolve / void
- Add reference planes from a tool
- Use AI assistance
- Publish to the marketplace

That is roughly **5 %** of a Revit family editor's UI surface.

---

## 6. Test pyramid — what the green tests actually prove

The 52 green tests prove a lot of *correctness* but very little *integration*:

| Layer | Tests | What they prove | What they don't prove |
|---|---|---|---|
| `packages/file-format` (10) | sig + round-trip | File format is byte-stable | Nothing about whether anyone in the SPA calls it |
| `apps/component-editor` quality gates (17) | LoC ≤ 300, no THREE, no React, no `window.*`, a11y, bundle | Architecture rules are enforced | Nothing about UX |
| `apps/component-editor` marketplace (18) | sign + publish-flow with mocked fetch | The publish module works in isolation | Nothing about whether the user can reach it |
| `tests/family-marketplace-publish` (7) | server route happy path + signature tamper + EICAR + non-monotonic version | The server side accepts / rejects correctly | Nothing about the SPA → server end-to-end |
| `tests/family-load-into-project` (200-instance bake) | Bake-worker can resolve a family | Bake works | Nothing about the main-editor UI showing it |

There are **zero Playwright e2e tests**, **zero `axe-core` integration sweeps over real panels**, and **zero "open the SPA, click, save, reopen" tests**. The "author journey" §22.1 row 5 calls ⏳ has no harness at all.

---

## 7. Would the user journey match Revit-in-the-cloud?

Honest answer: **not yet — the foundation is real, the experience is not.**

What is genuinely strong, and would translate well to a cloud Revit competitor:

- The 8-layer architecture is enforced by lint + bundle gates, not by convention
- Pure-Node geometry kernel + WASM solver path is the right design
- Deterministic, signed, byte-stable file format with a real migration framework
- Server-side validation pipeline (schema + virus scan + monotonic versions) is the right shape
- A11y primitives (skip-link, live region) are in the right place

What is genuinely weak:

- The SPA has the surface area of a sketcher demo, not a family editor. A Revit user opening this would close it within 30 seconds because they cannot save, cannot create a 3D form, cannot define a parameter, cannot publish, and cannot see what they made.
- "Hosted families" — the entire conceptual centre of Revit families (cut hole in wall, place door in hole, host glazing in window) — is not in the plan at all
- Voids (subtractive forms) have no real workflow
- Reference planes — Revit's primary parametric scaffold — have a store and commands but no kernel module and no UI
- AI integration is built but not mounted anywhere
- Marketplace publish flow is built but has no entry point in the UI

---

## 8. Honest summary

| Dimension | Score | Note |
|---|---|---|
| Plan document quality | 7/10 | Architecture is excellent; §19 audit blocks now contradict §22.1; several Revit family fundamentals (hosted families, voids, subcategories, reference lines, reporting params) are missing entirely from the plan |
| Code quality where it exists | 9/10 | The bits that ship are clean, tested, deterministic, layer-respecting |
| Surface-area coverage vs the plan | 4/10 | ~9 of 40 commands, 2 of 10 panels, 1 of 5 producer-UIs, no File menu, no AI mount, no publish entry point |
| Revit family-level capability coverage | 3/10 | Strong on 2D constrained sketch; missing voids, hosts, parameters UI, types UI, materials UI, IFC mapping UI, 3D form creation UI, save / open UI |
| User-journey parity with Revit | 2/10 | Today an author can sketch a constrained polyline. That is the entire reachable workflow. |
| Wiring (built but unmounted) | 5/10 | AI bridge, approval queue, publish flow, deep link, save / load, sweep / loft / revolve / boolean producers, solid commands, reference-plane commands all exist on disk but are not user-reachable |

**The §22.1 audit's claim that "Sketch + Constraint + Inspector + Type/Parameter + Pack/Sign + Publish surfaces all in code at S59" is technically true at the file-existence level but materially false at the user-reachable level.** The Inspector panel does not exist as a file. The Type / Parameter panels do not exist as files. The Pack / Sign and Publish modules exist but no UI mounts them.

Phase 3-B as written exits with the architecture proven and the first-mile user surface unbuilt. The honest next-sprint scope to deliver "Revit-in-the-cloud, v1" is not a polish pass — it is roughly **another full sprint of UI work** (panels + menu + 3D-form invocation UI + publish entry point + AI mount + save / open) on top of the productisation items already in the §22.1 carry-forward list.

---

## 9. Recommended S60 scope (revised, in priority order)

The §22.1 carry-forward list described S60 as productisation polish. The findings in §3, §4 and §5 above mean that framing is wrong. The honest S60 backlog, in priority order:

1. **`panels/ApplicationMenu.ts`** — File / New / Open / Save / Save As / Publish… / Load into Project. Without this, nothing else in the SPA is usable. Wire it to the existing `family-pack.ts` / `family-unpack.ts` and `marketplace/publishFlow.ts`. (Closes wiring rows in §3 for save / load and publish.)
2. **`panels/ParameterTable.ts`** — the table from plan §10. Wire it to a new `commands/parameter/` (7 verbs from §8.3). This unblocks Revit-parity rows "Family parameters", "Formula expressions consumed by UI", "Dimensions with parameter binding".
3. **`panels/TypeCatalog.ts`** — the type matrix from plan §11. Wire it to a new `commands/type/` (5 verbs from §8.5).
4. **3D form-creation toolbar in the 3D tab** — replace `appSplash.ts` for the 3D tab with a real surface that dispatches the existing `commands/solid/add` against `kind ∈ {extrude, sweep, loft, revolve, boolean}`. This makes the 4 unreachable producers reachable.
5. **`panels/Inspector.ts`** — selection-driven property inspector for sketch entities, solids, parameters and types. The plan calls for this in §3.2 and §11.2.
6. **`panels/MaterialSlots.ts` + `commands/material/`** (4 verbs from §8.6) — material binding from plan §12.
7. **`panels/IfcMapping.ts`** — Pset / property mapping from plan §10.2.
8. **AI mount + approval queue panel** — instantiate `aiHostBridge.ts` and mount `approvalQueue.ts` into a right-rail panel as §16.2 prescribes.
9. **Reference-plane kernel module** — write `packages/geometry-kernel/src/sketch/reference-plane.ts` (promised in §7.2 but never created) and wire a UI tool to the existing `commands/referencePlane/` barrel.
10. **`apps/marketplace-web/` production deploy + Postgres + R2 swap** — the original §22.1 row 10 carry-forward; subordinate to items 1-9 because no one can publish anything until item 1 lands.
11. **Real `planegcs` WASM swap** — replace `MockSolver` runtime default with a real `PlanegcsSolverPorter` + `PlanegcsNodePorter` per §6.2. The §19.1 carry-forward never closed.
12. **Playwright e2e + axe full sweep** — the §22.1 carry-forwards now have real panels to scan.
13. **50-document round-trip corpus + UX timing study** — the remaining two §22.1 carry-forwards.

Items 1-4 are the unblock for "Revit-in-the-cloud v1". Items 5-9 are the parity push. Items 10-13 are the productisation polish that §22.1 originally described.

---

## 10. Revit family-level capabilities still missing from the plan entirely

These are NOT yet in `phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md` and need a §21.1 amendment or a successor doc:

- **Hosted families** — door-in-wall, window-in-wall, light-on-ceiling. The defining Revit family concept.
- **Cut-on-host / void-cuts-host** — the void in a window family is what makes the wall opening appear.
- **Reference lines** (distinct from reference planes — drive angular constraints).
- **Reporting parameters** — read a constraint value back into a parameter.
- **Subcategories** — per-object line styles, used by every Revit family in production.
- **Swept Blend** — the fifth Revit form type alongside Extrusion / Blend / Revolve / Sweep.
- **Linear and radial arrays driven by an integer parameter** — used heavily for railings, louvres, mullions.
- **Per-type thumbnails** — Revit shows a different preview per type in the Type Selector.
- **View-specific visibility** (per-form coarse / medium / fine *and* per-view-direction visibility settings).

The plan's §21 "out of scope" lists scripted families, nesting depth > 2, structural-analytical, MEP fittings, site / planting families, real-time collaboration, custom unit systems, and validation rules. The list above is **not** in §21 — it is simply absent from the plan. Whichever ones are intended for v1 should be added to the spec; whichever are intended for Phase 4 should be added to §21.

---

## 11. Cross-references

- Plan document being reviewed: `phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md`
- Phase 3-B exit-audit table written today: §22.1 of the same document
- Sprint tracker row this review supersedes / amends: `PROCESS-TRACKER.md` §11 row S59
- Top-of-tree pointer for the next agent: `replit.md` §PRYZM-2-PHASE-3B-S59-FAMILY-CREATOR-TRACK
- Successor phase (currently presumes Phase 3-B is done): `phases/PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md`

---

*Last updated: 2026-04-28. Owner: Architecture review. Status: final review of record. Phase 3-B exits with foundation proven and first-mile author surface unbuilt; the honest S60 scope is in §9 above.*
