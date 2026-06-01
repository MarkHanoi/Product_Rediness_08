# ADR-0016 — View state as command-driven, persisted entities

* Status: **Accepted**
* Date: 2026-04-27
* Sprint: S17 (Sub-phase 1C / Q3 / M9)
* Supersedes: —
* Superseded by: —
* Authors: PRYZM 2 architecture group
* Cross-references:
  * Spec: `docs/03-execution/plans/legacy/phases/PHASE-1/1C-Q3-M7-M9-ELEMENT-FAMILIES.md`
    §S17 (lines 776-933).
  * Strategic ADR-002 — events-first / patches-second.
  * Strategic ADR-007 — OTel coverage lint.
  * Strategic ADR-020 — headless determinism.
  * Code-level ADR-0006 — idle-continuation budget (referenced for
    motion / suppression).
  * Code-level ADR-0014 — TRAA/SSGI under idle budget (referenced for
    `IdleAccumulator.onMotionStart()` interplay).

## Context

PRYZM 1 stored "the current camera" and "the active view" as
`useState`-style transient editor concerns: switching views was a
direct mutation of the camera object, with no event emission, no
persistence, and no audit trail. Two consequences hurt:

1. **No reload restore.** Reopening a project always landed on the
   default 3D view; the user's last view (and any custom views they
   created) were lost.
2. **No view as a first-class artefact.** Plan, section, schedule, and
   sheet views cannot meaningfully exist as UX entities if they aren't
   persisted; downstream features (saved view sets, sheet view
   thumbnails, view-aware filters) had nowhere to hang their state.

S17 lands the foundational layer for views in PRYZM 2: a typed
`ViewDefinition`, a `ViewRegistry` Store, an `ActiveViewStore`, and
five command handlers (`view.create`, `view.delete`, `view.rename`,
`view.switch`, `view.update-camera`).

The architectural question this ADR answers is: **how should view
state be modelled?** Three options were on the table:

* **Option A — Transient editor state.** Mirror PRYZM 1: views live in
  the editor app's `useState`, never persisted. Simple. No reload
  restore. No path to plan/section. Rejected — fails K1-A (kernel
  purity demands view be reachable from the headless app too) and
  fails the persistence contract.

* **Option B — Stores, but mutated directly.** `ViewRegistry` /
  `ActiveViewStore` exist as `Store<T>` subclasses, but the editor
  mutates them directly (`registry.add(...)`, `activeView.set(...)`)
  outside the command bus. Simple. Reload restore works (state
  hydrates from the store). But: no event-log audit; no undo of
  view-create / view-delete; no replayability.

* **Option C — Command-driven views.** Both `ViewRegistry` and
  `ActiveViewStore` are conventional Stores driven by the command bus
  via dedicated handlers. View create / delete / rename / camera-update
  go through the patch + event-log path; view-switch goes through the
  bus too but is **ephemeral** (mirrors S16's selection treatment —
  switching a view is a UX gesture, not a domain change worth undoing).

This ADR adopts **Option C**.

## Decision

### View state lives in two Stores driven by command handlers

```
plugins/view/handlers/{Create,Delete,Rename,UpdateCamera}.ts
        │ produceCommand → patches
        ▼
ViewRegistry (extends Store<ViewDefinition>) ◄── persistence-client → S04 event log → reload restore
        │
        ▼
plugins/view/handlers/Switch.ts
        │ mutates ActiveViewStore directly (ephemeral)
        ▼
ActiveViewStore ◄── singleton-shaped Store<ActiveViewState>
        │ subscribeDirty
        ▼
ViewController.switchTo() → CameraController.applyPose() under FrameScheduler motion gate
```

* `ViewRegistry` is a normal `Store<ViewDefinition>` keyed by `ViewId`.
  `defaults()` returns a seed list (`Default3DView`, `LevelOverview`)
  that the bootstrap calls on a new project.

* `ActiveViewStore` is a `Store<ActiveViewState>` with a single fixed
  id `'active'` (singleton-shaped). Holds `{ activeViewId, activeToolId }`.
  Mutated by the `view.switch` handler and by `tools.activate` (S08).

* `ViewController` orchestrates the camera animation under the
  `FrameScheduler`'s motion gate (added in S17 alongside this work — see
  T006 in the session plan). `switchTo(viewId)` returns a Promise that
  resolves when the camera finishes animating.

### Why `view.switch` is ephemeral

Per S16 / ADR-0015 §"Consequences": undoing an ephemeral UX gesture is
confusing UX. Selecting a wall and then pressing Cmd-Z should undo the
last *edit*, not the selection. The same logic applies to view
switching: the user's mental model is "I switched to the section view
to look at something", not "I performed an undoable action". The
`view.switch` handler returns `{ forward: [], inverse: [] }` and
mutates `ActiveViewStore` directly, exactly as `selection.select`
does.

`view.create`, `view.delete`, `view.rename`, and `view.update-camera`
ARE persistent — those mutations belong on the event log so reload
restores the user's view collection.

### Camera animation under the FrameScheduler motion gate

S15's `IdleAccumulator` (ADR-0014) re-converges TRAA / SSGI on every
motion-start signal. A naive view switch would mark the scene dirty
once at the start of the animation, then leave 24 of the 25
animation-frames classified as idle by the scheduler — which would
trigger TRAA / SSGI mid-animation and produce visible shimmer over the
moving camera.

S17 adds two additive methods to `FrameScheduler`:

```ts
beginMotion(): void   // sets motion flag; subscribers (IdleAccumulator) reset
endMotion(): void     // clears motion flag; idle-continuation resumes naturally
onMotionStart(cb): Disposer  // accumulators subscribe so they re-converge
```

`ViewController.switchTo()` wraps the animation in
`beginMotion()` / `endMotion()` so:

* IdleAccumulator stays in motion-reset throughout the animation.
* The scheduler's `markDirty('view-switch')` per tick keeps the loop
  pumping at 60 fps for the duration.
* `endMotion()` lets the IdleAccumulator restart accumulation from
  frame 0 on the new pose.

These methods are additive — every existing call site
(`markDirty('camera')`, `markDirty('selection')`) continues to work
unchanged.

### Schema shape (frozen)

```ts
ViewDefinitionSchema = z.object({
  id:            z.string().brand<'ViewId'>(),
  name:          z.string(),
  kind:          z.enum(['3d-perspective', '3d-orthographic']),
  camera: z.object({
    position:    Vec3,                  // metres, world coords
    target:      Vec3,
    up:          Vec3,
    fovDeg:      z.number().min(10).max(120).optional(),
    orthoSize:   z.number().positive().optional(),
  }),
  renderMode:    z.enum(['shaded', 'wireframe', 'shaded-with-edges']),
  levelFilter:   z.array(z.string().brand<'LevelId'>()).nullable(),
  elementKindFilter: z.array(z.string()).nullable(),
});
```

`'plan'` and `'section'` discriminators are deliberately out — those
land in 2A / 2B. The schema is closed under additive `kind` extensions
(see "Forward compatibility" below).

## Consequences

### Positive

* **Reload restore.** `ViewRegistry` patches stream through the S04
  event log; reopening a project rebuilds the user's full view
  collection. `ActiveViewStore` is also patched (by `view.switch`)
  but its ephemeral nature means reload always lands on the registry's
  default view (an explicit invariant; the alternative would be to
  persist the active view too, but that conflicts with the "switch is
  not an edit" framing — open question for S20+).
* **Audit trail.** `view.create` / `view.delete` / `view.rename` /
  `view.update-camera` show up in OTel as `pryzm.command.execute`
  spans with the standard payload trail. Auditors get full history.
* **Headless reachability (K1-A).** `apps/headless` can construct
  a project with views entirely through the command bus — no DOM,
  no THREE outside the optional ViewController. This unblocks the
  "create-3-views from a CLI then open in browser" demo in S18.
* **Plan/section path.** The `kind` discriminator is the wedge — 2A
  adds `'plan'` and a 2D camera shape; the schema's existing
  optional-field pattern (perspective uses `fovDeg`, ortho uses
  `orthoSize`) generalises naturally.
* **No fight with post-FX.** The `beginMotion` / `endMotion` hooks
  on the scheduler give clean composition with the S15 IdleAccumulator;
  the spec's bench gates `IdleAccumulator does NOT fire during
  transition` and we expect green there.

### Negative

* **Three workspaces in this sprint** — `packages/view-state`,
  `packages/stores` (additive), `plugins/view`. Plus FrameScheduler
  and CameraController API additions. Larger than typical S-sprint
  surface but additive throughout (no breaking changes).
* **Camera ownership migration.** Today the editor's bootstrap owns
  the CameraController and pushes camera state into the renderer's
  `THREE.PerspectiveCamera`. After S17 the ViewController also drives
  camera state via `applyPose`. We avoid contention by routing both
  through the same `applyPose` API — the user's orbit input wins
  during direct interaction, the ViewController wins during animation.
  Concurrent inputs are a follow-up (S18+).
* **Scheduler API surface grows.** `beginMotion` / `endMotion` /
  `onMotionStart` add three methods. Each is one-line; total LOC ≤ 30.
  The risk is API sprawl — we accept it because the alternative
  (every animation owner re-implementing motion suppression) is
  worse.

### Risks and mitigations

| Risk | Mitigation |
|---|---|
| `view.switch` patches still hit the event log even though they're empty (S16 carry-forward of the same problem). | D7 follow-up: PatchEmitter should branch on `Store.ephemeral === true` and skip event-log persistence. Scheduled for S18. |
| Camera fights between user input and `ViewController.switchTo` mid-animation. | `switchTo()` cancels any prior in-flight transition; user input registered via `markDirty('camera')` causes the controller to abort the animation early. Documented in `docs/04-reference/architecture-detail/camera.md` (S17 D8 deliverable). |
| `ActiveViewStore` reload semantics ambiguous — should it persist or always reset to Default3DView? | This ADR sets the invariant: reload lands on `defaults()[0]`. If user research later demands "remember last view", revisit in a follow-up ADR. |
| `LevelOverview` requires LevelStore (lands S18+). | `LevelOverview.levelFilter = null` (all levels) ships in defaults today; replaced with a real level-id list once LevelStore exists. |

### Forward compatibility

A `kind: 'plan'` discriminator added in 2A extends the schema via
Zod's discriminated-union pattern:

```ts
// future extension (2A)
ViewDefinitionSchema = z.discriminatedUnion('kind', [
  ThreeDViewSchema,        // existing
  PlanViewSchema,          // adds: cuttingPlaneZ, planScale
  SectionViewSchema,       // adds: cuttingPlaneNormal, etc.
]);
```

The existing `ViewRegistry` `Store<ViewDefinition>` continues to work
because TypeScript narrows the union per entry. The `kind` field is
already a `z.enum` discriminator in S17, so the migration is
mechanical.

## Implementation notes (S17 deliverables)

* `packages/view-state/src/ViewDefinition.ts` — Zod schema (this ADR's
  shape).
* `packages/view-state/src/ViewRegistry.ts` — `Store<ViewDefinition>` +
  `defaults()`.
* `packages/view-state/src/ViewController.ts` — `switchTo(viewId)` with
  scheduler motion gate.
* `packages/stores/src/ActiveViewStore.ts` — singleton-shaped
  `Store<ActiveViewState>`.
* `packages/frame-scheduler/src/FrameScheduler.ts` — additive
  `beginMotion` / `endMotion` / `onMotionStart`.
* `packages/renderer/src/CameraController.ts` — additive `snapshot()` /
  `applyPose()`.
* `plugins/view/src/handlers/{Create,Delete,Rename,Switch,UpdateCamera}.ts`.
* `apps/bench/src/benches/view-switch.bench.ts` — view-switch p95
  gate (target < 200 ms; spec line 812).

## OTel surface (locked)

| Span / event | Trigger |
|---|---|
| `pryzm.view.switch` | `ViewController.switchTo()` start; ends on resolve. Attributes: `view.from`, `view.to`, `view.switch.duration_ms`, `transition.eased`. |
| `pryzm.view.create` / `.delete` / `.rename` / `.update-camera` | `pryzm.command.execute` child spans. Attributes: `view.id`, `view.name?`, `view.kind?`. |
| `pryzm.view.cameraAnimation.tick` | Per-tick during `switchTo()`, sampled 1/10 in DEV. Attributes: `t` (0..1), `tick.index`, `pose.{x,y,z}`. |

## Open questions deferred

* **Active view persistence.** Per "Risks" above, this ADR sets reload
  → `defaults()[0]`. Revisit if user research justifies "remember last
  view".
* **Concurrent input + animation.** S17 documents the cancellation
  semantic ("user input aborts in-flight animation"); test coverage
  for this sits in S18 alongside the visual-diff harness.
* **Plan / section schema extensions.** Tracked under 2A / 2B.
