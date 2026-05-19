// Bench dashboard — public barrel (W-1C-6).

export type { BenchEntry, BaselineReport, CoverageResult, BenchStatus } from './types.js';
export { parseReport, loadAllReports } from './loader.js';
export { auditCoverage, listBenchFiles, defaultPaths } from './coverage.js';
export { renderHtml } from './render.js';
export { buildDashboard, type BuildResult } from './build.js';
