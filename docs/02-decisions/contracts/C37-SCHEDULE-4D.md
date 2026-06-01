# C37 — Schedule / 4D

> **Stamp**: 2026-06-01 · **Status**: DRAFT
> **Scope**: governs construction-phase scheduling export — 4D BIM. Time-based phasing (planned vs actual, per element), timeline-driven animation playback, critical-path identification, schedule-driven view filtering, and round-trip with industry-standard scheduling tools (Synchro · Asta Powerproject · MS Project · Primavera P6) via XER · MPP · PPV (IFC4 4D MVD).
> **Depends on**: [C03](C03-SCHEMAS-COMMANDS-AND-STATE.md) (schemas + commandBus), [C04](C04-RENDERING-AND-SCHEDULING.md) (frame scheduler P3), [C10](C10-PERFORMANCE-AND-OBSERVABILITY.md) (NFT + P8 spans), [C16](C16-COMMAND-AUTHORING-PROTOCOL.md) (command authoring), [C25](C25-IFC-EXPORT-PRODUCTION.md) (IFC4 4D MVD as the schedule wire-format).
> **Downstream**: [C28](C28-DATA-PANEL-AND-AUTOMATION.md) §6 (read-only Gantt + task tables surfaced in the Data panel), [C36](C36-CLASH-DETECTION-AND-COORDINATION.md) (clash status MAY annotate tasks), [C38](C38-COST-5D.md) (5D cost binds quantities × rates × **time** — depends on C37 task ids).
> **Key principles**: **P3** (timeline animator MUST be driven by the single FrameScheduler), **P5** (schedule schemas pure — no I/O, no THREE, no DOM in `packages/schemas/src/schedule/`), **P6** (all schedule mutations flow through commandBus — no direct store writes from UI), **P8** (every exported function adds ≥ 1 OpenTelemetry span).
> **Master plan**: missing — to be added as Tier 6.1 item 11 per [MISSING-CONTRACTS-AUDIT-2026-06-01.md §3.2](../MISSING-CONTRACTS-AUDIT-2026-06-01.md).
> **Sibling contracts**: [C36 Clash Detection](C36-CLASH-DETECTION-AND-COORDINATION.md) · [C38 Cost / 5D](C38-COST-5D.md).

---

## §1 — Invariants

### §1.1 — At most one task assignment per element

Every element (Wall · Door · Window · Slab · Furniture · Site · etc.) MAY be assigned to at most **one** `ScheduleTask`. An element MUST NOT carry references to multiple tasks. Multi-task work breakdown (e.g. "rough-in" + "finish" for one wall) MUST be modelled as child tasks of a parent that owns the element, with the **child** holding the assignment.

Rationale: the timeline animator (§3.3) MUST be able to answer, for any element at time `t`, "is this element built yet?" in O(1). Multi-assignment forces O(N) tie-breaking and creates inconsistent visibility.

**CI gate**: `tools/ga-gate/check-schedule-single-assignment.ts` (planned) — scans `ScheduleStore` and fails on any element appearing as `taskId` payload of two distinct tasks.

### §1.2 — Circular dependencies are rejected at validation

`TaskDependency` edges (`predecessor → successor`) MUST form a DAG. The validator MUST reject any cycle at command-time, before the dependency is committed to the store. Detection: Tarjan or Kahn topological sort over the dependency graph; rejection emits a `ScheduleCommandError('CYCLIC_DEPENDENCY', cycleNodes)`.

**CI gate**: `tools/ga-gate/check-schedule-acyclic.ts` — runs Kahn on every test fixture, asserts no cycle. Hard-fail on any cycle.

### §1.3 — Planned-end ≥ planned-start

For every `ScheduleTask`, `plannedEnd >= plannedStart` MUST hold. Equality is permitted for zero-duration milestones. The schema validator (Zod refine) MUST reject any task that violates this. Same rule applies to `actualEnd >= actualStart` whenever both fields are set; either MAY remain `null` for tasks not yet started or in progress.

### §1.4 — Timeline animator is driven by the FrameScheduler (P3)

The 4D timeline animator (`packages/schedule-4d/src/TimelineAnimator.ts`) MUST subscribe to `runtime.scheduler.onFrame()` per [C04 §2](C04-RENDERING-AND-SCHEDULING.md). It MUST NOT call `requestAnimationFrame` directly. It MUST NOT use `setInterval` or `setTimeout` for playback — the frame bus is the single time source.

Playback state (`{ playing: boolean, currentTime: ISODateString, playbackRate: number }`) is held in `TimelineStore`; per-frame the animator advances `currentTime` by `playbackRate × frameDeltaSeconds` and emits a `timeline.tick` event.

**CI gate**: extends existing `check-raf-count.ts` — `packages/schedule-4d/` is forbidden from importing `requestAnimationFrame`.

### §1.5 — IFC4 4D MVD export MUST include all task linkages

When exporting to IFC4 4D MVD, every `IfcTask` MUST be linked to the elements it owns via `IfcRelAssignsToProcess`, every dependency MUST be expressed as an `IfcRelSequence` with the correct `SequenceType` (FINISH_START / START_START / FINISH_FINISH / START_FINISH) and `TimeLag`, and the schedule root MUST be wrapped in an `IfcWorkSchedule` carrying `StartTime` + `FinishTime`. No task linkage MAY be dropped silently — if an element id cannot be resolved at export time, the export MUST fail loud with the unresolved ids in the error.

### §1.6 — Schedule changes flow through commandBus (P6)

Every mutation to `ScheduleStore` MUST be expressed as a command on the bus per [C03 §3](C03-SCHEMAS-COMMANDS-AND-STATE.md) + [C16](C16-COMMAND-AUTHORING-PROTOCOL.md). UI MUST NOT call `scheduleStore.setTask(...)` directly. The eight commands in §4 are the only public mutation surface.

**CI gate**: extends existing `check-commandmanager.ts` — `packages/schedule-4d/` and `plugins/schedules/` UI surfaces are forbidden from importing `ScheduleStore` setters.

### §1.7 — Every exported function opens a span (P8)

Every public function exported from `packages/schedule-4d/` MUST open at least one OpenTelemetry span. Span names follow the convention `pryzm.schedule.<verb><Noun>`:

- `pryzm.schedule.assignTask` — attributes `{ taskId, elementCount }`
- `pryzm.schedule.linkDependency` — attributes `{ predecessorId, successorId, sequenceType }`
- `pryzm.schedule.exportXer` — attributes `{ taskCount, durationMs, byteSize }`
- `pryzm.schedule.exportMpp` — attributes `{ taskCount, durationMs, byteSize }`
- `pryzm.schedule.exportIfc4D` — attributes `{ taskCount, dependencyCount, byteSize }`
- `pryzm.schedule.animateTimeline.seek` — attributes `{ fromTime, toTime, dt }`
- `pryzm.schedule.runCriticalPath` — attributes `{ taskCount, criticalCount, durationMs }`

### §1.8 — Critical path is deterministic

The critical-path algorithm (Forward Pass + Backward Pass over the DAG) MUST be deterministic — for a given `(tasks, dependencies)` input the resulting `criticalTaskIds` set MUST be identical across runs and OSes. Ties in float values use the lexicographic `taskId` order. Cache key: `hash(tasks) ⊕ hash(dependencies)`; CI seeds a fixture and asserts byte-equal output.

**CI gate**: `tools/ga-gate/check-schedule-critical-path-determinism.ts` (planned).

### §1.9 — Phase groups are first-class, not strings

`SchedulePhase` is a first-class enum + schema (§2). Tasks MUST reference a phase by id, not by free-text label. The eight canonical phases (§2.5) cover 95% of construction schedules; custom phases require an explicit `SchedulePhase` registration (one command).

Rationale: phase-based view filtering ("show only Structure") and phase-based clash scoping (C36) depend on a stable enum.

### §1.10 — Schedule-driven view filter is intent, not UI state (P7)

Per [C09 §3](C09-AI-AND-VISIBILITY-INTENT.md), the "show only elements built by date X" filter is **visibility intent**, not UI state. It lives in `VisibilityIntentStore.scheduleFilter`, not in the Schedule panel's local React state. The Inspect tree (C27) and 3D viewport (C04) both subscribe to the same intent.

### §1.11 — Read-back from scheduling tools is opt-in and never destructive

When importing an updated schedule from P6 / MS Project / Synchro, the import MUST be opt-in (one explicit user command) and MUST surface a diff modal before any task mutation. Silent overwrite of `actualStart` / `actualEnd` from a re-import is forbidden — the import MAY only fill `null` actuals or queue a conflict for the user, per [C08 §6](C08-COLLABORATION-AND-SECURITY.md) CRDT conflict rules.

### §1.12 — Task ids are typed and stable across exports

`TaskId` is a branded string per [C03 §1.4](C03-SCHEMAS-COMMANDS-AND-STATE.md) ID branding. Task ids MUST be stable across re-exports — exporting → editing in P6 → re-importing the same task MUST resolve to the same `TaskId`. The exporter MAY map to P6's `task_code` field; the meta-store side-car (parallel to `IFCMetaStore` per C25 §1.5) holds the `TaskId ↔ task_code` round-trip table.

---

## §2 — Schema (in `packages/schemas/src/schedule/`)

Per P5, every type below is a pure Zod schema — no I/O, no THREE, no DOM imports.

### §2.1 — `ScheduleTask`

| Field | Type | Notes |
|---|---|---|
| `id` | `TaskId` (branded) | Stable across exports per §1.12 |
| `code` | `string` | Human-facing code, e.g. `A1010.10` (Uniformat) or `03 30 00` (CSI MasterFormat) |
| `name` | `string` | Display name |
| `phase` | `SchedulePhaseId` | One of the eight canonical phases or a registered custom phase |
| `plannedStart` | `ISODateString` | Required |
| `plannedEnd` | `ISODateString` | Required, ≥ `plannedStart` per §1.3 |
| `actualStart` | `ISODateString \| null` | Set when work begins |
| `actualEnd` | `ISODateString \| null` | Set when work completes, ≥ `actualStart` per §1.3 |
| `assignedElementIds` | `ElementId[]` | Elements built by this task; per §1.1 each `ElementId` appears in at most one task across the whole schedule |
| `parentTaskId` | `TaskId \| null` | For WBS (work breakdown structure) hierarchy |
| `progressPct` | `number` (0–100) | Manually entered or computed from `(today − actualStart) / (plannedEnd − plannedStart)` |
| `notes` | `string` | Optional |
| `meta` | `Record<string, string>` | Round-trip side-car for foreign tool fields (P6 `task_code`, MSP `UID`, Synchro `objId`) |

### §2.2 — `TaskDependency`

| Field | Type | Notes |
|---|---|---|
| `id` | `DependencyId` (branded) | |
| `predecessorId` | `TaskId` | |
| `successorId` | `TaskId` | |
| `sequenceType` | `'FINISH_START' \| 'START_START' \| 'FINISH_FINISH' \| 'START_FINISH'` | IFC4 `IfcRelSequence.SequenceType` |
| `lagDays` | `number` | Positive = lag, negative = lead. 0 default. |

### §2.3 — `SchedulePhase`

| Field | Type | Notes |
|---|---|---|
| `id` | `SchedulePhaseId` (branded) | |
| `name` | `string` | Display name |
| `colour` | `HexColor` | Gantt + 3D phase-tint colour |
| `order` | `number` | Display + critical-path tie-break |
| `kind` | `'canonical' \| 'custom'` | Canonical = one of §2.5; custom = registered via `schedule.registerPhase` |

### §2.4 — `WorkSchedule`

The schedule root, one per project (multi-schedule MAY arrive in a future revision).

| Field | Type | Notes |
|---|---|---|
| `id` | `WorkScheduleId` (branded) | |
| `name` | `string` | |
| `startTime` | `ISODateString` | Earliest `plannedStart` of any task |
| `finishTime` | `ISODateString` | Latest `plannedEnd` of any task |
| `dataDate` | `ISODateString` | "As of" date for actuals |
| `taskIds` | `TaskId[]` | All tasks in this schedule |

### §2.5 — Canonical phase enum

The eight canonical `SchedulePhase` ids built into the system; cover ~95% of typical construction schedules:

1. `site-prep` — site clearance, temporary works
2. `foundation` — excavation, piling, footings, slab-on-grade
3. `structure` — frame (steel/concrete/timber), shear walls, structural slabs
4. `envelope` — exterior walls, roof, curtain wall, weatherproofing
5. `mep` — mechanical / electrical / plumbing rough-in
6. `interior-rough` — interior partitions, doors, windows (frames)
7. `finishes` — flooring, paint, ceiling, fixtures
8. `commissioning` — testing, balancing, handover, punch list

Each phase has a stable `SchedulePhaseId` and a default colour. Custom phases (kind = `'custom'`) are registered via `schedule.registerPhase`.

### §2.6 — `TimelineState`

In-memory animator state (not persisted to .pryzm — derived from `dataDate` + UI).

| Field | Type | Notes |
|---|---|---|
| `currentTime` | `ISODateString` | Where the playhead is now |
| `playing` | `boolean` | True = advancing every frame |
| `playbackRate` | `number` | Days per real-time second; default 7 (one week per second) |
| `loop` | `boolean` | Restart at `startTime` when `finishTime` is reached |

---

## §3 — Stores

| Store | Path | Owns |
|---|---|---|
| `ScheduleStore` | `packages/stores/src/ScheduleStore.ts` (NEW) | `WorkSchedule`, all `ScheduleTask`s, all `TaskDependency`s, all `SchedulePhase`s |
| `TimelineStore` | `packages/stores/src/TimelineStore.ts` (NEW) | `TimelineState` — animator playhead, playback rate, play/pause |
| `CriticalPathCache` | `packages/schedule-4d/src/CriticalPathCache.ts` (NEW, derived) | Memoised `criticalTaskIds: Set<TaskId>` keyed by `(tasksHash, dependenciesHash)` |

`ScheduleStore` is the single source of truth for schedule data and is the only store written by the eight schedule commands (§4). It exposes typed selectors:

```ts
interface ScheduleStore {
  // selectors (pure reads)
  readonly tasks:        ReadonlyMap<TaskId, ScheduleTask>;
  readonly dependencies: ReadonlyMap<DependencyId, TaskDependency>;
  readonly phases:       ReadonlyMap<SchedulePhaseId, SchedulePhase>;
  readonly schedule:     WorkSchedule;

  // derived
  getTaskForElement(id: ElementId):           ScheduleTask | undefined;
  getElementsBuiltBy(t: ISODateString):       ReadonlySet<ElementId>;
  getCriticalPath():                          ReadonlySet<TaskId>;
  getTopologicalOrder():                      readonly TaskId[];
}
```

`TimelineStore` is read by the `TimelineAnimator` (§3.3) and the 3D viewport visibility plane.

### §3.1 — Persistence

`ScheduleStore` state is part of the `.pryzm` file per [C05 §3](C05-PERSISTENCE-AND-FILE-FORMAT.md). New top-level key `schedule` carrying `{ workSchedule, tasks[], dependencies[], phases[] }`. `TimelineStore` is NOT persisted — playhead is a UI concern.

### §3.2 — Round-trip side-car

Parallel to `IFCMetaStore` (C25 §1.5), `SchedulingMetaStore` holds the `TaskId ↔ external-tool-id` mapping for P6 / MSP / Synchro / Powerproject round-trip. Stored as `.pryzm/schedule-meta.json` inside the project package.

### §3.3 — TimelineAnimator

`packages/schedule-4d/src/TimelineAnimator.ts` is the per-frame driver. Per §1.4 it MUST subscribe to `runtime.scheduler.onFrame()`. Pseudocode:

```ts
class TimelineAnimator {
  start() {
    this.unsub = runtime.scheduler.onFrame((dt) => {
      const state = timelineStore.getState();
      if (!state.playing) return;
      const newTime = advance(state.currentTime, state.playbackRate * dt);
      runtime.commandBus.dispatch({ type: 'schedule.animateTimeline', payload: { to: newTime } });
    });
  }
}
```

Note: per §1.6 the animator MUST dispatch a command rather than mutate the store directly.

---

## §4 — Commands

| Command | Effect | Undo step |
|---|---|---|
| `schedule.assignTask` | Assign N elements to a task (creates the task if missing; per §1.1 elements already assigned MUST be reassigned, with prior assignment recorded for undo). | One step covers N elements |
| `schedule.linkDependency` | Add a `TaskDependency` edge. Runs the §1.2 cycle check; rejects on cycle. | One step |
| `schedule.unlinkDependency` | Remove a `TaskDependency`. | One step |
| `schedule.updateTask` | Mutate any subset of `ScheduleTask` fields (dates, progress, notes). Runs §1.3 date sanity check. | One step |
| `schedule.deleteTask` | Remove a task; per §1.1 reassigns elements to `parentTaskId` or leaves them unassigned. | One step |
| `schedule.registerPhase` | Register a custom `SchedulePhase` (kind = `'custom'`). | One step |
| `schedule.runCriticalPath` | Recompute critical path; updates `CriticalPathCache`. Pure compute; reversible by re-running. | Not undoable (idempotent) |
| `schedule.animateTimeline` | Advance the playhead. Dispatched by `TimelineAnimator` every frame. | Not undoable (transient UI state) |
| `schedule.setPlayback` | `{ playing: boolean, rate?: number, loop?: boolean }`. UI play/pause/scrub controls dispatch this. | Not undoable |
| `schedule.scheduleFilterBy` | Set `VisibilityIntentStore.scheduleFilter = { kind: 'built-by', date }` per §1.10. | One step |
| `schedule.exportXer` | Export `WorkSchedule` + tasks + dependencies → Primavera P6 `.xer` text format. | Not a mutation — read-only |
| `schedule.exportMpp` | Export → MS Project `.mpp` (binary OLE-compound) via the `mpp-writer` adapter, OR `.xml` (MS Project XML) when `.mpp` writer unavailable. | Read-only |
| `schedule.exportPpv` | Export → Asta Powerproject `.ppv` via IFC4 4D MVD bridge (Powerproject reads IFC4 4D MVD natively). | Read-only |
| `schedule.exportIfc4D` | Export → IFC4 4D MVD (`IfcWorkSchedule` + `IfcTask` + `IfcRelSequence` + `IfcRelAssignsToProcess`). | Read-only |
| `schedule.importFromXer` | Opt-in import of a P6 `.xer` per §1.11 diff modal. | One step per accepted diff entry |
| `schedule.importFromMpp` | Opt-in import of `.mpp` / MS Project XML per §1.11. | One step per accepted diff entry |
| `schedule.importFromIfc4D` | Opt-in import of IFC4 4D MVD (typically used when the GC's preferred tool was Powerproject or Synchro). | One step per accepted diff entry |

All commands open OTel spans per P8 (§1.7) and route through commandBus per P6 (§1.6).

### §4.1 — Command authoring

Per [C16](C16-COMMAND-AUTHORING-PROTOCOL.md):

- Commands live in `packages/schedule-4d/src/commands/`, one file per command.
- Each command's payload is a pure Zod schema (P5).
- Each command's handler is the only place the corresponding `ScheduleStore` mutation occurs.
- Each command emits a span per §1.7.
- Each command handles undo via the standard ring-buffer pattern.

### §4.2 — Export adapter table

| Adapter | Format | Lib | Notes |
|---|---|---|---|
| XER writer | Primavera P6 `.xer` text | NEW `packages/schedule-4d/src/exporters/xer.ts` | Tab-delimited text; spec is public |
| MPP writer | MS Project `.mpp` (OLE compound) OR `.xml` (MS Project XML) | NEW; tracks `microsoft-ole` lib; fallback to MS Project XML (no third-party dep) | OPEN Q (§A) — see Open Questions below |
| PPV bridge | Asta Powerproject `.ppv` | Powerproject 16+ reads IFC4 4D MVD natively → re-uses IFC4 4D exporter | No separate writer needed |
| IFC4 4D MVD | Buildingsmart IFC4X3 with 4D MVD subset | Extends `plugins/ifc-export/` per C25 | Wire-format for Powerproject + Synchro + generic |
| Synchro | Bentley Synchro | Native reads IFC4 4D MVD | Same path as Powerproject |

### §4.3 — IFC4 4D MVD wire-format

The IFC4 4D MVD is a Model View Definition layered on top of the base IFC4X3 export (C25). It adds these entities to the IFC file:

```
IfcWorkPlan  ── (1)  the "project schedule" wrapper
  └─ IfcWorkSchedule ── (N) one per WorkSchedule in §2.4
       └─ IfcRelAssignsTasks ── connects schedule to its IfcTask list
            └─ IfcTask ── one per ScheduleTask in §2.1
                 ├─ IfcRelAssignsToProcess ── connects task to its assigned IfcRoot elements
                 ├─ IfcTaskTime ── carries plannedStart/End + actualStart/End + Duration
                 └─ IfcRelSequence ── one per TaskDependency in §2.2 (predecessor → successor)
```

Mapping rules:

- `ScheduleTask.id` (branded `TaskId`) → `IfcTask.GlobalId` (compressed 22-char). The `SchedulingMetaStore` (§3.2) holds the bidi map so re-import is stable.
- `ScheduleTask.phase` → `IfcTask.ObjectType` (free-text in the spec; we serialise the `SchedulePhase.name`).
- `ScheduleTask.assignedElementIds` → `IfcRelAssignsToProcess.RelatedObjects` resolved to the IFC `GlobalId` of each element via the base C25 GUID generator.
- `TaskDependency.sequenceType` → `IfcRelSequence.SequenceType` (1:1 with the four IFC enum values).
- `TaskDependency.lagDays` → `IfcRelSequence.TimeLag` as an `IfcLagTime` in `IfcDuration` ISO-8601 `P<n>D`.

Per §1.5 the exporter MUST surface unresolved element ids loud. Per §1.7 the export opens `pryzm.schedule.exportIfc4D` and the C25 base export's spans nest under it.

---

## §5 — UI

### §5.1 — Schedule panel

`apps/editor/src/panels/SchedulePanel/` (NEW). Three sub-views:

1. **Gantt** — left column: WBS tree (tasks + child tasks indented by `parentTaskId`); right column: time-axis bars coloured by phase. Critical-path tasks rendered with red outline. Bars are draggable (re-schedules the task — dispatches `schedule.updateTask`). Dependencies rendered as arrows between bars.
2. **Timeline scrubber** — horizontal time-axis with current playhead, Play / Pause / Stop / 1× / 2× / 4× / 7× / 30× / 365× buttons (days per second). Scrubbing dispatches `schedule.animateTimeline` per drag tick. Loop toggle.
3. **Filter strip** — "Show only elements built by [date picker]" — sets `VisibilityIntentStore.scheduleFilter` per §1.10. "Highlight critical path" toggle — adds a red overlay material to critical-path elements in the 3D viewport.

### §5.2 — Data panel integration (read-only per C28)

Per [C28 §6](C28-DATA-PANEL-AND-AUTOMATION.md), the Data panel surfaces a read-only Tasks table view (columns: `code · name · phase · plannedStart · plannedEnd · actualStart · actualEnd · progressPct · isCritical`). The Data panel **MUST NOT** offer edit affordances on schedule columns — edits route through the Schedule panel's commands. C37 owns the writes; C28 owns the read views.

### §5.3 — 3D viewport visibility plane

The schedule filter is applied at the visibility plane per [C09 §3](C09-AI-AND-VISIBILITY-INTENT.md). When `VisibilityIntentStore.scheduleFilter = { kind: 'built-by', date: t }`, the visibility plane:

- For each element, looks up its `taskId` via `ScheduleStore.getTaskForElement(elementId)`.
- If `task.plannedEnd <= t` (or `actualEnd <= t` when present), element is VISIBLE.
- Else element is HIDDEN.
- Elements not assigned to any task: governed by a project-wide setting (`'show'` or `'hide'`), default `'show'` for safety (don't accidentally hide unscheduled elements).

Per-phase tint MAY be optionally applied: the renderer overlays the phase colour at 25% alpha so the user can see which trade is on-screen. Toggle via the Filter strip.

### §5.4 — Import diff modal

Per §1.11 every import command (`schedule.importFromXer`, `schedule.importFromMpp`, `schedule.importFromIfc4D`) MUST surface a diff modal before any task mutation. The modal layout:

| Column | Content |
|---|---|
| `Task code` | Foreign tool's task code |
| `Local task` | Resolved `TaskId` (via `SchedulingMetaStore`) — empty when new |
| `Field` | `plannedStart` · `plannedEnd` · `actualStart` · `actualEnd` · `progressPct` · `name` · `phase` — one row per changed field |
| `Old` | The PRYZM value before import |
| `New` | The foreign tool's value |
| `Action` | Per-row checkbox: `Accept` (default for fields where the local value is `null`) / `Skip` (default for fields where the local value is non-null and differs) |

User clicks "Apply N changes". The applied diff is a single undo step. Skipped rows are remembered in `SchedulingMetaStore` as `lastConflict` so the same conflict isn't surfaced again until the foreign value changes.

### §5.5 — Gantt library

OPEN Q (§B) — see Open Questions.

### §5.6 — Preview semantics

Per [C18](C18-ELEMENT-PREVIEW-VISUAL-CONTRACT.md), no preview applies to scheduling actions (no geometry creation). However, the timeline scrubber-induced visibility changes are NOT considered preview — they are committed visibility intent updates per P7.

---

## §6 — Tests / CI gates

| Gate | What it checks | Implementation | Hard-fail timeline |
|---|---|---|---|
| `check-schedule-acyclic` | Every fixture's dependency DAG is acyclic (§1.2) | NEW — `tools/ga-gate/check-schedule-acyclic.ts` | At C37 ratification |
| `check-schedule-otel` | Every public function exported from `packages/schedule-4d/` opens at least one span (§1.7) | NEW — extends existing P8 span-coverage check | At C37 ratification |
| `check-schedule-single-assignment` | No element appears in two tasks (§1.1) | NEW | At C37 ratification |
| `check-schedule-critical-path-determinism` | Same `(tasks, dependencies)` input → same `criticalTaskIds` output across runs (§1.8) | NEW | At C37 ratification |
| `check-schedule-no-direct-raf` | `packages/schedule-4d/` does not import `requestAnimationFrame`, `setInterval`, or `setTimeout` for playback (§1.4) | extends `check-raf-count.ts` | At C37 ratification |
| `check-schedule-no-direct-store-writes` | UI does not import `ScheduleStore` setters (§1.6) | extends `check-commandmanager.ts` | At C37 ratification |
| `check-schedule-ifc4d-task-linkage` | Every `IfcTask` in a 4D MVD export resolves all assigned element ids and dependencies (§1.5) | NEW | At C37 ratification + IFC-α completion |
| XER round-trip | Export → re-import preserves `TaskId` ↔ `task_code` (§1.12) | NEW — `schedule-xer-roundtrip.test.ts` | At C37 ratification |

### §6.0a — Worked example: 5-task DAG

A minimal DAG used in tests and onboarding (one of the conformance fixtures):

```
                ┌─ T2 Frame (FS) ─┐
T1 Foundation ──┤                 ├─ T4 Finishes ── T5 Punch
                └─ T3 MEP   (SS+2)┘
```

- T1 → T2: FINISH_START, lag 0
- T1 → T3: START_START, lag +2 days
- T2 → T4: FINISH_START, lag 0
- T3 → T4: FINISH_START, lag 0
- T4 → T5: FINISH_START, lag 0

Forward pass: ES(T1)=0, ES(T2)=10, ES(T3)=2, ES(T4)=max(30, 22)=30, ES(T5)=50. Backward pass yields zero float on T1 → T2 → T4 → T5; T3 has float (10-2-20=−12 → 8 day positive float; T3 floats 8 days). Critical path = {T1, T2, T4, T5}. The conformance test asserts this exact set.

### §6.1 — Conformance suite

The conformance suite covers:

- All eight canonical phases register correctly.
- 10 random DAGs of size N ∈ {10, 100, 1000} pass cycle check.
- One known cyclic graph fails cycle check with correct cycle node trace.
- Critical-path algorithm matches a hand-computed expected result on a 12-node reference graph from the Synchro academic samples.
- IFC4 4D MVD export validates against `ifc-validator` (extends C25 §8 gate).
- XER export validates against a P6 sample reader (a small native-Node parser stub is included in tests).
- Timeline animator advances `currentTime` correctly at playback rate × dt over 60 simulated frames.
- Schedule filter at the visibility plane hides exactly the un-built elements at time `t`.

---

## §7 — NFT targets

| NFT | Target | Bench |
|---|---|---|
| 10k-element schedule playback | 60 fps sustained (16.6 ms / frame) over 60 s | `schedule-10k-playback.bench.ts` |
| XER export (1k tasks) | < 1 s | `schedule-xer-1k.bench.ts` |
| XER export (10k tasks) | < 5 s | `schedule-xer-10k.bench.ts` |
| IFC4 4D MVD export (10k elements + 1k tasks) | < 25 s (5 s budget over the C25 IFC 10k baseline) | `schedule-ifc4d-10k.bench.ts` |
| Critical-path compute (1k tasks, 3k edges) | < 100 ms | `schedule-cpm-1k.bench.ts` |
| Schedule filter visibility update on a 10k-element model | < 30 ms per filter change | `schedule-filter-10k.bench.ts` |
| MS Project XML export (1k tasks) | < 2 s | `schedule-mspx-1k.bench.ts` |

Bench cadence: nightly in CI per [C10 §5](C10-PERFORMANCE-AND-OBSERVABILITY.md); regressions > 10% block merge.

---

## §8 — Migration plan

`plugins/schedules/` exists today as the PRYZM 2 S41 schedule **TABLE** plugin — a Revit-style quantity schedule, NOT a construction phasing schedule. It owns: per-element-type tabular schedules, formula DSL, CSV / XLSX export. It does NOT own: time, dependencies, critical path, animation, 4D export.

C37 extends `plugins/schedules/` to add the time-based phasing layer alongside the existing quantity schedules. The two concepts coexist in the same plugin:

| Capability | Owner before C37 | Owner after C37 |
|---|---|---|
| Quantity schedule (door schedule, wall schedule…) | `plugins/schedules/` (S41 / ADR-0032) | `plugins/schedules/` — unchanged |
| Time-based phasing | NONE | `packages/schedule-4d/` (NEW L3) + `plugins/schedules/` UI extension |
| Timeline animator | NONE | `packages/schedule-4d/` (NEW) |
| XER / MPP / PPV / IFC 4D export | NONE | `packages/schedule-4d/exporters/` (NEW) |
| Gantt UI | NONE | `apps/editor/src/panels/SchedulePanel/` (NEW) |

### §8.1 — Phase plan (~14 dev-weeks total)

Tier-2 work formerly tagged in the apartment-cognition-stack programme is folded here. Sequence:

- **4D-α (3 wk)** — Schemas (P5) + `ScheduleStore` + 8 core commands (`assignTask`, `linkDependency`, `unlinkDependency`, `updateTask`, `deleteTask`, `registerPhase`, `runCriticalPath`, `animateTimeline`) + ring-buffer undo wiring. + `check-schedule-acyclic`, `check-schedule-single-assignment`, `check-schedule-otel` CI gates.
- **4D-β (3 wk)** — `TimelineAnimator` wired to FrameScheduler + `TimelineStore` + schedule filter at the visibility plane + 3D viewport phase tint.
- **4D-γ (4 wk)** — Gantt UI in `SchedulePanel`, scrubber, drag-to-reschedule, critical-path highlight.
- **4D-δ (2 wk)** — XER + MS Project XML exporters + import diff modal (§1.11).
- **4D-ε (2 wk)** — IFC4 4D MVD extension to `plugins/ifc-export/` (depends on C25 IFC-α completion) + PPV pass-through.

### §8.2 — Dependency on C25

The IFC4 4D MVD exporter (4D-ε) blocks on C25 IFC-α (IfcSpace / IfcZone / IfcSite). 4D-α through 4D-δ can ship first; 4D-ε ships after C25 IFC-α merges.

### §8.3 — Dependency on C38 (Cost / 5D, sibling)

C38 binds quantities × rates × **time**. The `TaskId` schema in §2.1 is the integration point — C38's `CostItem` will reference `taskId` to roll cost up by phase. Schemas in §2 are stable so that C38 can land in parallel.

### §8.4 — Read-back / round-trip with foreign tools

- **From P6**: import of `.xer` populates / updates tasks. Per §1.11 the import is opt-in + surfaces a diff modal.
- **From MS Project**: import of MS Project XML (`.xml`). `.mpp` import is OPEN Q (§A).
- **From Synchro / Powerproject**: import of IFC4 4D MVD.

In all cases the side-car `SchedulingMetaStore` (§3.2) preserves the foreign tool's primary key so round-trip is stable.

---

## §9 — What is NOT in this contract

- **Cost / 5D estimation, quantity takeoff, BOQ pricing** — [C38 Cost / 5D](C38-COST-5D.md). C37 owns time; C38 owns money.
- **Generic IFC export schema + Pset coverage** — [C25 IFC Export](C25-IFC-EXPORT-PRODUCTION.md). C37 owns the 4D MVD subset overlay (`IfcWorkSchedule` + `IfcTask` + `IfcRelSequence`) but the base IFC4X3 export pipeline, spatial structure, and Pset depth are C25's territory.
- **Clash detection and federated coordination** — [C36 Clash Detection & Coordination](C36-CLASH-DETECTION-AND-COORDINATION.md). C36 detects clashes between elements; C37 schedules elements over time. C36 MAY annotate tasks with clash status; the annotation channel lives in C36, not C37.
- **Data-panel grid + bulk edit + quality rules** — [C28 Data Panel & Automation](C28-DATA-PANEL-AND-AUTOMATION.md). The Data panel surfaces schedule tables read-only; all schedule mutations route through the Schedule panel + C37 commands.
- **Quantity schedules (Revit-style door / window / wall schedules)** — `plugins/schedules/` (PRYZM 2 S41 / ADR-0032). C37 adds time-based phasing alongside; it does not replace quantity schedules.
- **BCF (BIM Collaboration Format) issue interchange** — `plugins/bcf/`. BCF tickets MAY reference a `TaskId`; the BCF contract owns the schema.
- **Construction-site safety, permits, weather** — out of scope. Future C-contracts MAY codify these. C37 deliberately scopes to schedule-time mechanics.
- **Project management — task assignment to humans, hour tracking, payroll** — out of scope. C37 owns the construction schedule; resource loading and human-task management are separate concerns.
- **Drawing-set issuance / submittals / RFIs** — [C30 Drawing Set Management](C30-DRAWING-SET-MANAGEMENT.md) owns drawing issuance; submittals + RFIs are out of scope.

---

## §10 — Open questions (to resolve before CANONICAL)

### §A — MS Project export format (`.mpp` binary vs `.xml` text)

`.mpp` is a Microsoft OLE compound document — proprietary binary, no public spec. Writing `.mpp` from JavaScript requires either:
1. A native add-on / WASM port of the OLE writer (e.g. `microsoft-ole` lib — bundle size + Windows-only build risk).
2. A round-trip via MS Project's COM automation (server-side Windows-only).
3. A WASM-compiled C# library wrapping `MPXJ` (Java) or `Office Open XML`.

MS Project also reads the simpler **MS Project XML** (`.xml`) format natively, with no binary writer needed. **Tentative resolution**: ship MS Project XML in 4D-δ and treat true `.mpp` binary as a deferred adapter pending product validation that customers actually need binary `.mpp` (most GC workflows accept XML).

Final ratification needs product input.

### §B — Gantt UX library

Three viable options for the Gantt UI in §5.1:

1. **dhtmlx-gantt** — mature, commercial, ~$700/year per dev. Rich features, mature React wrapper.
2. **frappe-gantt** — MIT, lightweight, ~10 KB. Limited features but customisable.
3. **Custom build on `packages/ui-base/` + `packages/drawing-primitives/`** — full control, no dep, ~3 weeks of UI work.

Tentative recommendation: frappe-gantt for 4D-γ MVP; revisit custom build at 4D-ε if frappe's animation perf doesn't hit the 60 fps NFT (§7).

Architecture-team decision needed at ratification.

### §C — Activity-code authority (CSI MasterFormat vs Uniformat II vs free-text)

`ScheduleTask.code` (§2.1) is free-text today. Industry conventions:

- **CSI MasterFormat** (`03 30 00` for cast-in-place concrete) — Specs-domain; aligns with submittals.
- **Uniformat II** (`A1010.10` for standard foundations) — Estimating-domain; aligns with cost (C38).
- **Free-text** (e.g. `STR-CONC-FDN-01`) — GC-internal convention.

C37 deliberately leaves `code` as free-text in §2.1 to avoid premature normalisation. The question: should we ship a code-resolver helper that maps known conventions to `SchedulePhaseId`? If yes, where does the code dictionary live — `packages/schedule-4d/`, `packages/schemas/`, or a new `packages/aec-conventions/`?

Deferred to post-ratification.

---

## §11 — Cross-references

- [C03 Schemas, Commands & State §3](C03-SCHEMAS-COMMANDS-AND-STATE.md) — commandBus + ring-buffer undo
- [C04 Rendering & Scheduling §2](C04-RENDERING-AND-SCHEDULING.md) — FrameScheduler P3
- [C05 Persistence & File Format §3](C05-PERSISTENCE-AND-FILE-FORMAT.md) — `.pryzm` top-level keys
- [C09 AI & Visibility Intent §3](C09-AI-AND-VISIBILITY-INTENT.md) — visibility intent vs UI state P7
- [C10 Performance & Observability §5](C10-PERFORMANCE-AND-OBSERVABILITY.md) — NFT bench cadence + P8
- [C16 Command Authoring Protocol](C16-COMMAND-AUTHORING-PROTOCOL.md) — command authoring doctrine
- [C18 Element Preview Visual Contract](C18-ELEMENT-PREVIEW-VISUAL-CONTRACT.md) — no preview applies here, but link kept
- [C25 IFC Export (Production) §1.3 / §2 / §8](C25-IFC-EXPORT-PRODUCTION.md) — IFC4 4D MVD wire-format base
- [C28 Data Panel & Automation §6](C28-DATA-PANEL-AND-AUTOMATION.md) — read-only schedule tables in the Data panel
- [C36 Clash Detection & Coordination](C36-CLASH-DETECTION-AND-COORDINATION.md) — sibling, may annotate tasks
- [C38 Cost / 5D](C38-COST-5D.md) — sibling, binds quantities × rates × time via `TaskId`
- [ADR-0032 Schedules plugin](../adrs/ADR-0032-schedules-plugin.md) — PRYZM 2 S41 ancestor
- [MISSING-CONTRACTS-AUDIT-2026-06-01.md §3.2](../MISSING-CONTRACTS-AUDIT-2026-06-01.md) — gap-audit row

---

*End — C37 Schedule / 4D, 2026-06-01.*
