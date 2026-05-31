// Sub-barrel for the apartment-layout REPORTING surface.
//
// Single import path for callers that want the Markdown / one-liner /
// grouping helpers built on top of the orchestrator's
// `AggregatedViolationReport`:
//
//   import {
//       formatViolationReport,
//       formatViolationLine,
//       groupByClass,
//       groupByRoom,
//   } from '@pryzm/ai-host/.../reporting';
//
// The orchestrator (`../validators/orchestrator.ts`) remains the source of
// the report itself — this barrel only re-exports the formatter surface.

export {
    formatViolationReport,
    formatViolationLine,
    groupByClass,
    groupByRoom,
} from './report-formatter.js';
export type { FormatOptions } from './report-formatter.js';
