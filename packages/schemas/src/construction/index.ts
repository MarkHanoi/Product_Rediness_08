// §CONSTRUCTION-4D (L-3110) — the 4D TIME vocabulary at L0.
//
// ⚠ NOT the same concept as `PhaseFilter` (`@pryzm/core-app-model/views`). That
// models Revit-style DESIGN phases — Existing / Demolition / New Construction /
// Future — a categorical, unordered-in-time classification used to decide what a
// VIEW draws. This models a CONSTRUCTION SEQUENCE: dated tasks with durations.
// They are complementary and neither is a rival of the other; the distinction is
// written down here because "phase" reads as both, and building a second phase
// store would have been the obvious mistake (ADR-0351 §1).
export type { ConstructionTask, TaskDurationSource, TaskProgressState } from './ConstructionTask.js';
export {
    TASK_DEPENDENCIES_ARE_RECORDED_NOT_SOLVED,
    DURATIONS_ARE_CALENDAR_DAYS,
    MS_PER_DAY,
    isIsoDate,
    isoToMs,
    msToIso,
    addDays,
    taskFinishDate,
    taskWindowMs,
    taskProgressAt,
    scheduleWindowMs,
    taskDefects,
} from './ConstructionTask.js';
