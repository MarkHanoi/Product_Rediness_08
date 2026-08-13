import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { RetrofittedProvenanceSchema } from '../provenance/ValueOrigin.js';

const ScheduleKind = z.enum([
  'door-schedule',
  'window-schedule',
  'wall-schedule',
  'room-schedule',
  'furniture-schedule',
  'custom',
]);

const SortDirection = z.enum(['asc', 'desc']);

const ScheduleColumn = z.object({
  id: z.string().min(1),
  /** Field path on the source element (e.g. "width", "metadata.tags[0]"). */
  field: z.string().min(1),
  header: z.string().min(1),
  /** Display width on a sheet, in millimetres. */
  widthMm: z.number().positive().default(20),
  formatter: z.enum(['plain', 'mm', 'm', 'percent', 'count']).default('plain'),
});

const ScheduleSort = z.object({
  columnId: z.string().min(1),
  direction: SortDirection.default('asc'),
});

/**
 * Schedule — tabular report of one element family, used on sheets.
 */
export const Schedule = defineElement('schedule', {
  /**
   * PV-04 / C75 §2.4 — where this element's values came from: one of the five
   * (`ValueOrigin.ts`, which owns the vocabulary and is never restated here),
   * or an explicit unknown carrying its reason.
   *
   * ⚠ `RetrofittedProvenanceSchema`, spelled out at every kind rather than
   * spread from a shared constant or folded into `BaseNodeShape`, and that is
   * deliberate twice over. C75 §2.5 requires optional-with-an-UNKNOWN-default so
   * a snapshot written before this field existed parses unchanged and lands on
   * `predates-provenance` — never on a member of the five (§2.1 and §2.5 are the
   * same rule). And `check-provenance-coverage` measures the file that declares
   * `defineElement('<kind>')`: an indirection hides the field from the C3
   * retrofit-safety arm, so coverage you cannot see at the point of use is the
   * §4.d defect in a new place.
   */
  provenance: RetrofittedProvenanceSchema,
  kind: ScheduleKind.default('door-schedule'),
  title: z.string().default('Schedule'),
  /** Element family this schedule iterates (e.g. 'door'). */
  source: z.string().default('door'),
  columns: z.array(ScheduleColumn).default([]),
  sort: z.array(ScheduleSort).default([]),
  /** Optional filter expression — interpreted by the schedule engine. */
  filter: z.string().optional(),
}).refine(
  (s) => new Set(s.columns.map((c) => c.id)).size === s.columns.length,
  { message: 'Schedule column ids must be unique within a single schedule.' },
);

export type Schedule = z.infer<typeof Schedule>;
