// C28 DAT-α-1 (Data Panel & Automation) — public surface for the L0
// data-panel substrate.  Re-exported through the root barrel
// (`@pryzm/schemas`).  A later slice may add a `./data` subpath entry
// in `package.json` to mirror the annotation/view/apartment supplements.
//
// Slice DAT-α-1 contents:
//   - DataFilter:         DataFilterSchema, ParameterFilterSchema (+ types)
//   - DataSort:           DataSortSchema (+ type)
//   - DataGroupBy:        DataGroupBySchema (+ type)
//   - QualityRule:        QualityRuleSchema + scope/severity/source sub-enums (+ types)
//   - QualityViolation:   QualityViolationSchema (+ type)
//   - BulkUpdatePayload:  BulkUpdatePayloadSchema, BulkUpdateValueSchema (+ types)
//   - ScheduledCheck:     ScheduledCheckSchema, ScheduledCheckResultSchema (+ types)
//
// Deferred to later slices: DataStore, QualityRuleStore, ScheduledChecksStore
// (L3 stores), data-engine package (L3), Data tab UI (L7.5).

export * from './DataFilter.js';
export * from './DataSort.js';
export * from './DataGroupBy.js';
export * from './QualityRule.js';
export * from './QualityViolation.js';
export * from './BulkUpdatePayload.js';
export * from './ScheduledCheck.js';
