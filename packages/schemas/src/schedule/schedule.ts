// Schedule schemas — ScheduleData + ScheduleColumn (S41 / Phase 2C / ADR-0032).
//
// Spec: `phases/PHASE-2C-Q3-M19-M21-SHEETS-SCHEDULES.md` §S41 lines
// 725–905 ("Schedule Store + Schedule View").
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • Pure data — NO DOM, NO THREE, NO Node-only globals.  Round-trips
//   through Zod parse on Node (export-worker / bake-worker) and browser
//   identically.
// • A `ScheduleData` defines a tabular report bound to ONE element family
//   (`elementType`, e.g. 'door', 'wall', 'room').  Columns derive cell
//   values from that family's element DTOs via a pure formula DSL
//   (parsed and evaluated by `plugins/schedules/formula-evaluator.ts`).
// • `groupBy` (when set) is the field name on the element by which to
//   aggregate rows.  COUNT / SUM formulas inside columns then aggregate
//   over the group rather than over the whole element set.
// • `filter` (when set) is a boolean formula evaluated per element; only
//   elements that satisfy the filter contribute rows.  The empty string
//   is sentinel "no filter" (every element contributes).
// • Two columns within ONE schedule MUST NOT share an id (refined).
// • `seq` is the canonical display order across schedules — `list()`
//   on the store sorts by `seq` ascending, ties broken by id.
//
// EXIT CRITERIA (S41 sprint plan §"S41 Exit Criteria")
// ─────────────────────────────────────────────────────────────────────────────
// • `ScheduleSchema.parse(seed)` round-trips for the door-schedule
//   example in §S41 (formula examples lines 808–816).
// • Schema typechecks under `tsc --noEmit` with zero `any`.

import { z } from 'zod';

/** A column in a schedule.  The `formula` is a pure DSL expression
 *  (see ADR-0032).  Default empty formula evaluates to `null` for every
 *  row and renders as a blank cell. */
export const ScheduleColumnSchema = z.object({
  /** Stable column id within this schedule (not globally unique). */
  id: z.string().min(1),
  /** Display header (rendered as the table TH text). */
  header: z.string().min(1),
  /** DSL formula string.  Parsed lazily by the evaluator and cached. */
  formula: z.string().default(''),
  /** Result type hint — used for cell formatting (right-align numbers,
   *  centre booleans) and for sort order (numeric vs lexicographic). */
  type: z.enum(['number', 'string', 'boolean']).default('string'),
  /** Optional unit suffix appended to the header (e.g. "Width (mm)"). */
  unit: z.string().optional(),
  /** Display width on a sheet, in millimetres (advisory — used by the
   *  ScheduleSnapshot widget for fitting; the live table view ignores
   *  this and uses CSS-driven widths). */
  widthMm: z.number().finite().positive().default(20),
});
export type ScheduleColumnDto = z.infer<typeof ScheduleColumnSchema>;

/** A single schedule definition.  The element family bound to the
 *  schedule (`elementType`) MUST match a registered store key
 *  (validated at handler-time, not here — keeps the schema fixture-free). */
export const ScheduleSchema = z.object({
  /** Stable schedule id (e.g. 'sched-door-default'). */
  id: z.string().min(1),
  /** Display name (e.g. 'Door Schedule', 'Window Schedule — North Façade'). */
  name: z.string().min(1).max(200),
  /** Element family this schedule iterates (storeKey: 'door', 'wall', …). */
  elementType: z.string().min(1),
  /** Ordered list of columns.  Order matters — defines column display
   *  order and CSV/XLSX column order on export (S42). */
  columns: z.array(ScheduleColumnSchema).default([]),
  /** Optional groupBy field name on the element.  When set, rows are
   *  collapsed by the element's value at `groupBy` and aggregate
   *  columns (SUM, COUNT) operate over the group. */
  groupBy: z.string().optional(),
  /** Optional boolean filter formula.  Empty string ⇒ no filter. */
  filter: z.string().default(''),
  /** Canonical display order across schedules. */
  seq: z.number().int().nonnegative().default(0),
}).refine(
  (s) => new Set(s.columns.map((c) => c.id)).size === s.columns.length,
  { message: 'Schedule column ids must be unique within a single schedule.' },
);
export type ScheduleData = z.infer<typeof ScheduleSchema>;
export type ScheduleId = string;
