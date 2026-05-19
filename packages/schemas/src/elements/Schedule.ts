import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';

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
