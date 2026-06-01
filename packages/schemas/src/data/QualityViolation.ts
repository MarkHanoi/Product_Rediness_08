// C28 DAT-α-1 (Data Panel & Automation) — L0 QualityViolation substrate.
//
// The record emitted by `data.runQualityCheck` / `data.runAllChecks` when
// a `QualityRule` predicate fails on a target element.  Severity +
// message + fixSuggestion are copied from the rule at emission time so
// downstream consumers (UI, email, webhook) don't need to keep the rule
// table in scope.
//
// L0-pure: Zod only.
//
// References:
//   - C28-DATA-PANEL-AND-AUTOMATION.md §2 (schema table)
//   - master plan Part VI (DAT-α-1 substrate slice)

import { z } from 'zod';
import { QualityRuleSeveritySchema } from './QualityRule.js';

export const QualityViolationSchema = z.object({
    ruleId: z.string().min(1),
    elementId: z.string().min(1),
    severity: QualityRuleSeveritySchema,
    message: z.string(),
    fixSuggestion: z.string().optional(),
});
export type QualityViolation = z.infer<typeof QualityViolationSchema>;
