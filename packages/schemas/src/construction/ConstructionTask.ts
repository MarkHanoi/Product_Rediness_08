// §CONSTRUCTION-4D (L-3110) — the 4D TIME entity, and the productivity figure it
// refuses to invent.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⭐ THE ONE RULE THIS FILE EXISTS TO ENFORCE
// ─────────────────────────────────────────────────────────────────────────────
// **A duration in PRYZM is USER-ENTERED, and the type says so.** `durationSource`
// is a union with exactly ONE member today, `'USER_ENTERED'`, so a future author
// who wants to derive a duration from an output rate (m²/day) has to widen the
// union — a deliberate, reviewable act — rather than quietly assigning a number.
//
// This is the 5D rate-book ruling applied to time. PRYZM ships no prices because
// it holds no licensed price database; it ships no output rates for exactly the
// same reason, and a fabricated "walls: 12 m²/bricklayer-day" would look like a
// programme and be a drawing. See ADR-0351 §4D.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⭐ WHY A TASK POINTS AT TAKE-OFF LINE CODES, NOT AT ELEMENT IDS
// ─────────────────────────────────────────────────────────────────────────────
// `TakeoffLine.code` is documented as a STABLE JOIN KEY: "re-running the take-off
// after an edit has to land on the same code so the rate the user typed survives"
// (`TakeoffTypes.ts`). A raw element id does not survive a delete-and-redraw; a
// line code does. So the primary assignment axis is the line code, and the
// element set is RESOLVED FROM THE LIVE TAKE-OFF every time it is needed.
//
// The consequence is the useful one: draw three more walls of an already-scheduled
// type and they are already scheduled. `elementIds` remains available for the
// one-off case, and is the axis that does NOT survive a redraw — stated, not hidden.
//
// ⛔ THIS FILE MAY NOT GROW: a resource model, a cost-loaded schedule, a critical
// path, or a calendar with holidays. Each of those is a real thing that would need
// its own inputs, and half of one is worse than none. Dependencies are recorded
// (`dependsOn`) but NOT solved — see `TASK_DEPENDENCIES_ARE_RECORDED_NOT_SOLVED`.
//
// Layer: L0 — packages/schemas. Pure scalars and pure functions; no I/O, no
// THREE, no DOM, no `Date.now()` in any exported function (P5 + determinism:
// every function here takes the instant it needs as an argument).

/**
 * Where a task's duration came from.
 *
 * ⛔ ONE MEMBER, ON PURPOSE. PRYZM holds no output-rate database. Widening this
 * union is the reviewable act that would let a duration be computed; until then
 * every duration on every surface is labelled USER-ENTERED.
 */
export type TaskDurationSource = 'USER_ENTERED';

/** What a task is doing at a given instant. `'NOT_STARTED'` is not "absent". */
export type TaskProgressState = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE';

/**
 * One construction task — a named piece of work, a start, a duration, and the
 * quantities it covers.
 */
export interface ConstructionTask {
  /** Stable id, minted once. */
  readonly id: string;
  readonly name: string;
  /**
   * The take-off chapter this task belongs to, when it maps to one. Free string
   * rather than an import of `TakeoffChapterId`, because that vocabulary lives at
   * L2 and L0 may not reach up for it; the UI validates it against the real list.
   */
  readonly chapter?: string;
  /** Start date, ISO `YYYY-MM-DD`. Local calendar day; no time, no zone. */
  readonly startDate: string;
  /** Whole calendar days, ≥ 1. Calendar days, NOT working days — see the note below. */
  readonly durationDays: number;
  /** ⛔ Always `'USER_ENTERED'`. See {@link TaskDurationSource}. */
  readonly durationSource: TaskDurationSource;
  /**
   * Take-off line codes this task builds. The element set is resolved from the
   * LIVE take-off, so it tracks the model.
   */
  readonly lineCodes: readonly string[];
  /**
   * Explicitly named elements, for work that is not a whole take-off line.
   * ⚠ These do NOT survive a delete-and-redraw of the element.
   */
  readonly elementIds: readonly string[];
  /**
   * Ids of tasks this one follows. RECORDED, NOT SOLVED — nothing in PRYZM
   * reschedules a task when its predecessor moves. See the constant below.
   */
  readonly dependsOn: readonly string[];
  readonly notes?: string;
  /** '#rrggbb' for the bar. Presentation only; never load-bearing. */
  readonly colorHex?: string;
}

/**
 * ⚠ STATED SO NOBODY INFERS OTHERWISE. `dependsOn` is stored, displayed and
 * exported. It does NOT drive anything: moving a predecessor does not move a
 * successor, there is no forward pass, no float and no critical path. A programme
 * that silently re-plans is far worse than one that plainly does not, and a
 * half-implemented CPM is the same defect shape as a fabricated output rate.
 */
export const TASK_DEPENDENCIES_ARE_RECORDED_NOT_SOLVED = true as const;

/**
 * ⚠ DURATIONS ARE CALENDAR DAYS. PRYZM holds no working calendar — no weekends,
 * no public holidays, no shift patterns, and no jurisdiction to take them from.
 * A "20-day" task therefore finishes 20 calendar days after it starts, and the
 * UI says so rather than quietly meaning something else.
 */
export const DURATIONS_ARE_CALENDAR_DAYS = true as const;

// ── Date helpers — pure, UTC-anchored, no `Date.now()` ────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a well-formed, real `YYYY-MM-DD` calendar date. */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(ms)) return false;
  // Rejects 2026-02-30, which `Date.parse` silently rolls over in some engines.
  return new Date(ms).toISOString().slice(0, 10) === value;
}

/** `YYYY-MM-DD` → epoch ms at UTC midnight. `null` when the string is not a date. */
export function isoToMs(value: string): number | null {
  if (!isIsoDate(value)) return null;
  return Date.parse(`${value}T00:00:00Z`);
}

/** Epoch ms → `YYYY-MM-DD` (UTC). */
export function msToIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export const MS_PER_DAY = 86_400_000;

/** Add whole calendar days to an ISO date. `null` when the input is not a date. */
export function addDays(iso: string, days: number): string | null {
  const ms = isoToMs(iso);
  if (ms === null) return null;
  return msToIso(ms + Math.round(days) * MS_PER_DAY);
}

/**
 * The LAST instant of `iso` (UTC 23:59:59.999).
 *
 * ⭐ WHY THIS IS AN EXPORTED FUNCTION AND NOT AN INLINE `+ MS_PER_DAY - 1`.
 * {@link taskProgressAt} answers about an INSTANT, and the answer for a task's
 * finish day depends on which instant you pick: at MIDDAY of the finish day the
 * task is genuinely still IN_PROGRESS, and at the END of that day it is COMPLETE.
 * Both are correct; they are answers to different questions. A date scrubber is
 * asking "has this been built by the end of this day?", so it must pass THIS
 * instant — and hand-rolling the arithmetic at each call site is how one surface
 * comes to disagree with another about whether the last day counts.
 */
export function endOfDayMs(iso: string): number | null {
  const ms = isoToMs(iso);
  return ms === null ? null : ms + MS_PER_DAY - 1;
}

// ── Task arithmetic ───────────────────────────────────────────────────────────

/**
 * The task's finish date — the LAST day it is on site, inclusive.
 *
 * A 1-day task starting on the 5th finishes on the 5th. Off-by-one here is the
 * classic programme bug, so it is spelled out and tested rather than implied.
 */
export function taskFinishDate(task: ConstructionTask): string | null {
  if (!(task.durationDays >= 1) || !Number.isFinite(task.durationDays)) return null;
  return addDays(task.startDate, Math.round(task.durationDays) - 1);
}

/**
 * `[startMs, endMs]` in UTC ms, where `endMs` is the END of the finish day (so a
 * scrubber sitting exactly on the finish date reads COMPLETE). `null` when the
 * task's dates are not usable.
 */
export function taskWindowMs(task: ConstructionTask): { startMs: number; endMs: number } | null {
  const startMs = isoToMs(task.startDate);
  const finish = taskFinishDate(task);
  const finishMs = finish === null ? null : isoToMs(finish);
  if (startMs === null || finishMs === null) return null;
  return { startMs, endMs: finishMs + MS_PER_DAY - 1 };
}

/** What the task is doing at `atMs`. Returns `null` when the task has no usable window. */
export function taskProgressAt(task: ConstructionTask, atMs: number): TaskProgressState | null {
  const w = taskWindowMs(task);
  if (w === null) return null;
  if (atMs < w.startMs) return 'NOT_STARTED';
  if (atMs >= w.endMs) return 'COMPLETE';
  return 'IN_PROGRESS';
}

/**
 * The span the whole programme occupies. `null` when NO task has a usable window
 * — which is a real answer ("nothing is scheduled") and must not be rendered as
 * a zero-length bar at the epoch.
 */
export function scheduleWindowMs(
  tasks: readonly ConstructionTask[],
): { startMs: number; endMs: number } | null {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const t of tasks) {
    const w = taskWindowMs(t);
    if (w === null) continue;
    if (w.startMs < lo) lo = w.startMs;
    if (w.endMs > hi) hi = w.endMs;
  }
  return Number.isFinite(lo) && Number.isFinite(hi) ? { startMs: lo, endMs: hi } : null;
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Every defect in a task, in words. EMPTY means valid.
 *
 * Returns the list rather than a boolean because the UI shows the reasons: "this
 * task is invalid" is the kind of message that makes a user delete good data.
 */
export function taskDefects(task: ConstructionTask): string[] {
  const out: string[] = [];
  if (!task.id) out.push('The task has no id.');
  if (!task.name?.trim()) out.push('The task has no name.');
  if (!isIsoDate(task.startDate)) {
    out.push(`Start date "${task.startDate}" is not a calendar date (expected YYYY-MM-DD).`);
  }
  if (!Number.isFinite(task.durationDays) || task.durationDays < 1) {
    out.push('Duration must be at least 1 whole calendar day.');
  } else if (Math.round(task.durationDays) !== task.durationDays) {
    out.push('Duration must be a whole number of calendar days.');
  }
  if (task.durationSource !== 'USER_ENTERED') {
    out.push(
      `durationSource is "${String(task.durationSource)}". PRYZM holds no output rates, `
      + 'so USER_ENTERED is the only source a duration can honestly have.',
    );
  }
  if (task.lineCodes.length === 0 && task.elementIds.length === 0) {
    out.push('The task covers no take-off lines and no elements — it schedules nothing.');
  }
  return out;
}
