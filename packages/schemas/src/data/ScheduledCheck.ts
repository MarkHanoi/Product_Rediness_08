// C28 DAT-α-1 (Data Panel & Automation) — L0 ScheduledCheck substrate.
//
// A cron-style scheduled quality-check (C28 §9).  Persisted in the
// future `ScheduledChecksStore` (C28 §3); the actual cron daemon lives
// in `packages/data-engine/src/scheduler/` (later slice).
//
// L0-pure: Zod only.
//
// References:
//   - C28-DATA-PANEL-AND-AUTOMATION.md §2 (schema table),
//                                     §9 (automation)
//   - master plan Part VI (DAT-α-1 substrate slice)

import { z } from 'zod';

/**
 * Summary of the most recent run.  `summary` is a human-readable
 * one-liner ("12 errors, 47 warnings"); the full violation set lives in
 * a separate report blob the engine owns.
 */
export const ScheduledCheckResultSchema = z.object({
    violationCount: z.number().int().min(0),
    summary: z.string(),
});
export type ScheduledCheckResult = z.infer<typeof ScheduledCheckResultSchema>;

export const ScheduledCheckSchema = z.object({
    id: z.string().min(1),
    ruleIds: z.array(z.string().min(1)),
    /** Cron expression (validated as opaque string here; the scheduler parses). */
    cron: z.string().min(1),
    /** Email recipients.  Validated as opaque strings here (the scheduler does the email send). */
    recipients: z.array(z.string().min(1)),
    /** ISO 8601 timestamp of the most recent run, if any. */
    lastRun: z.string().min(1).optional(),
    lastResult: ScheduledCheckResultSchema.optional(),
});
export type ScheduledCheck = z.infer<typeof ScheduledCheckSchema>;
