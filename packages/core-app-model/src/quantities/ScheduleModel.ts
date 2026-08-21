/**
 * ScheduleModel — 4D. A construction programme laid over the take-off, and the
 * productivity figure it refuses to invent.
 *
 * Layer:    L2 — packages/core-app-model
 * Contract: C66 §1.1 by analogy · C03 (read model; this module MUTATES NOTHING
 *           in the element stores and produces no undo entry) · ADR-0351 §4D
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ WHAT THIS MODULE MAY NEVER DO
 * ─────────────────────────────────────────────────────────────────────────────
 *   • Compute a duration. PRYZM ships no output rates (m²/bricklayer-day) for the
 *     same reason it ships no prices, and `TaskDurationSource` has exactly one
 *     member so that a derived duration cannot be added without widening a union
 *     in a reviewed edit. Every duration on every surface is USER-ENTERED.
 *   • Reschedule anything. `dependsOn` is recorded and exported; it drives no
 *     forward pass and no critical path. A programme that silently re-plans is
 *     worse than one that plainly does not.
 *   • Treat UNSCHEDULED as NOT-YET-BUILT. ⭐ This is the §CONTEXT-DATA-HONESTY
 *     rule applied to time: "this wall is scheduled for week 14" and "nobody has
 *     said when this wall is built" are DIFFERENT ANSWERS, and a scrubber that
 *     hides both is asserting the second is the first. {@link scheduleStateAt}
 *     therefore returns unscheduled elements as their own set, and the caller has
 *     to decide — visibly — what to do with them.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ WHY A TASK POINTS AT TAKE-OFF LINE CODES
 * ─────────────────────────────────────────────────────────────────────────────
 * `TakeoffLine.code` is designed as a stable join key that survives an edit — it
 * is what makes a 5D rate outlive a redraw. A 4D task reuses the same key, so the
 * element set behind a task is RESOLVED FROM THE LIVE TAKE-OFF every time. Draw
 * three more walls of a scheduled type and they are already scheduled; delete one
 * and it leaves. An `elementIds` escape hatch exists for one-off work, and it is
 * the axis that does NOT survive a delete-and-redraw — stated, never hidden.
 */

import {
  taskWindowMs,
  taskProgressAt,
  taskFinishDate,
  scheduleWindowMs,
  taskDefects,
  type ConstructionTask,
  type TaskProgressState,
} from '@pryzm/schemas/construction';
import type { TakeoffResult, QuantityUnit } from './TakeoffTypes.js';

export type { ConstructionTask, TaskProgressState };

/** The stored programme. Versioned so a later shape change can migrate rather than guess. */
export interface ConstructionSchedule {
  readonly version: 1;
  readonly tasks: readonly ConstructionTask[];
}

export const EMPTY_SCHEDULE: ConstructionSchedule = Object.freeze({ version: 1, tasks: [] });

// ── Resolution ────────────────────────────────────────────────────────────────

/** What one task actually covers, resolved against a live take-off. */
export interface ResolvedTask {
  readonly task: ConstructionTask;
  /** Union of the elements behind its line codes, plus its explicit element ids. */
  readonly elementIds: readonly string[];
  /** The quantities this task builds, one row per line code that resolved. */
  readonly quantities: ReadonlyArray<{
    readonly code: string;
    readonly description: string;
    readonly quantity: number;
    readonly unit: QuantityUnit;
  }>;
  /**
   * Line codes on the task that the CURRENT take-off does not produce. Real and
   * reportable: it means the work was scheduled and then the model changed, which
   * is a thing a programme owner must see rather than have quietly dropped.
   */
  readonly unresolvedLineCodes: readonly string[];
  /** Defects in the task itself, in words. Empty ⇒ valid. */
  readonly defects: readonly string[];
}

/** Resolve every task against a take-off. Pure; no store reads. */
export function resolveTasks(
  schedule: ConstructionSchedule,
  takeoff: TakeoffResult,
): ResolvedTask[] {
  const byCode = new Map(takeoff.lines.map((l) => [l.code, l]));
  return schedule.tasks.map((task) => {
    const ids = new Set<string>(task.elementIds);
    const quantities: ResolvedTask['quantities'][number][] = [];
    const unresolved: string[] = [];
    for (const code of task.lineCodes) {
      const line = byCode.get(code);
      if (!line) { unresolved.push(code); continue; }
      for (const id of line.elementIds) ids.add(id);
      quantities.push({
        code: line.code,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
      });
    }
    return {
      task,
      elementIds: [...ids],
      quantities,
      unresolvedLineCodes: unresolved,
      defects: taskDefects(task),
    };
  });
}

// ── The time slice ────────────────────────────────────────────────────────────

export interface TaskStateAt {
  readonly task: ConstructionTask;
  /** `null` when the task's dates are unusable — a defect, not a state. */
  readonly state: TaskProgressState | null;
  readonly elementIds: readonly string[];
}

/**
 * The model as it stands at one instant.
 *
 * ⭐ FOUR SETS, NOT TWO. `built` / `inProgress` / `notStarted` / `unscheduled` are
 * kept apart because collapsing the fourth into the third is the exact lie this
 * module exists to refuse: an element nobody scheduled is not "not yet built", it
 * is UNKNOWN, and a viewport that hides it is making a claim the data does not
 * support. The caller chooses, and the surface says which choice it made.
 */
export interface ScheduleStateAt {
  readonly atMs: number;
  readonly tasks: readonly TaskStateAt[];
  /** Elements in a task that has FINISHED by `atMs`. */
  readonly builtElementIds: readonly string[];
  /** Elements in a task that has started but not finished. PRYZM draws them whole. */
  readonly inProgressElementIds: readonly string[];
  /** Elements in a task that has not started. */
  readonly notStartedElementIds: readonly string[];
  /** Measured elements that NO task covers. Not a synonym for "not yet built". */
  readonly unscheduledElementIds: readonly string[];
}

/**
 * Slice the programme at `atMs`.
 *
 * An element covered by more than one task takes the STRONGEST state it has
 * anywhere — complete beats in-progress beats not-started — because a wall whose
 * blockwork is done and whose plaster is scheduled for June exists in the model
 * in June's view.
 */
export function scheduleStateAt(
  schedule: ConstructionSchedule,
  takeoff: TakeoffResult,
  atMs: number,
): ScheduleStateAt {
  const resolved = resolveTasks(schedule, takeoff);
  const rank: Record<TaskProgressState, number> = { NOT_STARTED: 0, IN_PROGRESS: 1, COMPLETE: 2 };
  const best = new Map<string, TaskProgressState>();
  const tasks: TaskStateAt[] = [];

  for (const r of resolved) {
    const state = taskProgressAt(r.task, atMs);
    tasks.push({ task: r.task, state, elementIds: r.elementIds });
    if (state === null) continue;
    for (const id of r.elementIds) {
      const cur = best.get(id);
      if (cur === undefined || rank[state] > rank[cur]) best.set(id, state);
    }
  }

  const built: string[] = [];
  const inProgress: string[] = [];
  const notStarted: string[] = [];
  for (const [id, state] of best) {
    if (state === 'COMPLETE') built.push(id);
    else if (state === 'IN_PROGRESS') inProgress.push(id);
    else notStarted.push(id);
  }

  const unscheduled: string[] = [];
  for (const line of takeoff.lines) {
    for (const id of line.elementIds) {
      if (!best.has(id) && !unscheduled.includes(id)) unscheduled.push(id);
    }
  }

  return {
    atMs,
    tasks,
    builtElementIds: built,
    inProgressElementIds: inProgress,
    notStartedElementIds: notStarted,
    unscheduledElementIds: unscheduled,
  };
}

// ── Coverage (the honest half, mirroring the take-off's own) ───────────────────

export interface ScheduleCoverage {
  readonly taskCount: number;
  readonly validTaskCount: number;
  readonly defectiveTaskCount: number;
  /** Distinct measured elements covered by at least one task. */
  readonly scheduledElementCount: number;
  /** Distinct measured elements covered by NO task. */
  readonly unscheduledElementCount: number;
  /** Take-off line codes referenced by a task that the take-off no longer produces. */
  readonly unresolvedLineCodes: readonly string[];
  /** Take-off line codes no task references at all. */
  readonly unscheduledLineCodes: readonly string[];
  readonly windowMs: { startMs: number; endMs: number } | null;
  /**
   * The sentence that MUST accompany any 4D view. Generated here so a second
   * surface cannot render a scrubber without stating what it does not know.
   */
  readonly coverageStatement: string;
}

export function scheduleCoverage(
  schedule: ConstructionSchedule,
  takeoff: TakeoffResult,
): ScheduleCoverage {
  const resolved = resolveTasks(schedule, takeoff);
  const scheduledIds = new Set<string>();
  const unresolved = new Set<string>();
  const usedCodes = new Set<string>();
  let defective = 0;

  for (const r of resolved) {
    if (r.defects.length > 0) defective++;
    for (const id of r.elementIds) scheduledIds.add(id);
    for (const c of r.unresolvedLineCodes) unresolved.add(c);
    for (const q of r.quantities) usedCodes.add(q.code);
  }

  const allIds = new Set<string>();
  const unscheduledCodes: string[] = [];
  for (const line of takeoff.lines) {
    for (const id of line.elementIds) allIds.add(id);
    if (!usedCodes.has(line.code)) unscheduledCodes.push(line.code);
  }
  let covered = 0;
  for (const id of allIds) if (scheduledIds.has(id)) covered++;
  const uncovered = allIds.size - covered;

  const parts: string[] = [];
  if (schedule.tasks.length === 0) {
    parts.push('No task has been created, so nothing is scheduled and the time filter has nothing to hide.');
  } else {
    parts.push(
      `${schedule.tasks.length} task${schedule.tasks.length === 1 ? '' : 's'} cover `
      + `${covered} of ${allIds.size} measured elements.`,
    );
    if (uncovered > 0) {
      parts.push(
        `${uncovered} measured element${uncovered === 1 ? ' is' : 's are'} UNSCHEDULED. `
        + 'That is not the same as "not yet built" — nobody has said when they are built, '
        + 'so the time filter cannot answer for them and says so rather than hiding them.',
      );
    }
    if (unresolved.size > 0) {
      parts.push(
        `${unresolved.size} take-off line code${unresolved.size === 1 ? '' : 's'} referenced by a task `
        + `no longer exist${unresolved.size === 1 ? 's' : ''} in the take-off `
        + `(${[...unresolved].sort().join(', ')}). The model changed after the task was written.`,
      );
    }
    if (defective > 0) {
      parts.push(`${defective} task${defective === 1 ? ' has' : 's have'} a defect and are listed with the reason.`);
    }
  }
  parts.push(
    'Every duration here was TYPED BY A USER. PRYZM ships no output rates and computes no '
    + 'duration from a quantity — a productivity figure it cannot cite would make this look '
    + 'like a programme while being a drawing.',
  );
  parts.push('Durations are CALENDAR days: there is no working calendar, no weekends and no holidays.');

  return {
    taskCount: schedule.tasks.length,
    validTaskCount: schedule.tasks.length - defective,
    defectiveTaskCount: defective,
    scheduledElementCount: covered,
    unscheduledElementCount: uncovered,
    unresolvedLineCodes: [...unresolved].sort(),
    unscheduledLineCodes: unscheduledCodes.sort(),
    windowMs: scheduleWindowMs(schedule.tasks),
    coverageStatement: parts.join(' '),
  };
}

// ── Task construction helper ──────────────────────────────────────────────────

/**
 * Build a task from a take-off line. The duration is REQUIRED from the caller and
 * there is no default — a defaulted duration is a fabricated one, and the whole
 * point of this module is that PRYZM does not have one to offer.
 */
export function taskFromLine(args: {
  id: string;
  lineCode: string;
  description: string;
  chapter: string;
  startDate: string;
  durationDays: number;
}): ConstructionTask {
  return {
    id: args.id,
    name: args.description,
    chapter: args.chapter,
    startDate: args.startDate,
    durationDays: args.durationDays,
    durationSource: 'USER_ENTERED',
    lineCodes: [args.lineCode],
    elementIds: [],
    dependsOn: [],
  };
}

/** Re-export so a consumer needs one import for the whole 4D surface. */
export { taskFinishDate, taskWindowMs, taskProgressAt, scheduleWindowMs, taskDefects };
