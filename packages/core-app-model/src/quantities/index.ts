/**
 * @pryzm/core-app-model — quantities sub-barrel.
 *
 * The *medición* (quantity take-off) read-model and the 4D / 5D / 6D layers that
 * stand on it. ONE measurement engine, three questions asked of it.
 *
 * · lane DATA1, 2026-08-21 — the take-off and 5D cost. ADR-0350.
 * · lane DIM46, 2026-08-21 — 4D time and 6D carbon. ADR-0351. ADR-0350's
 *   statement that "4D and 6D are NOT here" is SUPERSEDED, not deleted: it named
 *   the four inputs 4D lacked and the two 6D lacked, and ADR-0351 §2 records
 *   which of those six were real (four) and which had already been closed by
 *   other work (two).
 */

export type {
  QuantityUnit,
  TakeoffChapterId,
  TakeoffChapterDef,
  SecondaryMeasure,
  TakeoffContribution,
  TakeoffLine,
  CoverageState,
  CoverageRow,
  TakeoffResult,
} from './TakeoffTypes.js';
export { UNIT_LABEL, TAKEOFF_CHAPTERS, desgloseSumsToLineTotal, everyUnattributedLineStatesItsReason, elementIdsMatchContributions } from './TakeoffTypes.js';

export type {
  TakeoffStores,
  ListStore,
  WallReadStore,
  RoomLike,
  PolyElementLike,
  LinearElementLike,
  CountedElementLike,
  OpeningElementLike,
  StairLike,
} from './QuantityTakeoff.js';
export { computeTakeoff, defaultTakeoffStores, wallBaselineLength, openingVoidArea, openingPerimeter } from './QuantityTakeoff.js';

export type {
  RateEntry,
  RateBook,
  CostedLine,
  CostedTakeoff,
  CostSummary,
  UnpricedReason,
} from './CostModel.js';
export { applyRates, chapterSubtotals } from './CostModel.js';

export type { RateImportResult } from './takeoffCsv.js';
export { takeoffToCsv, costedTakeoffToCsv, rateBookToCsv, parseRateCsv } from './takeoffCsv.js';

// ── 6D — embodied carbon (ADR-0351 §6D) ───────────────────────────────────────
export type {
  CarbonOverrideBook,
  CarbonMaterialRow,
  CarbonLine,
  CarbonChapterTotal,
  CarbonGapRow,
  CarbonSummary,
  CarbonResult,
} from './CarbonModel.js';
export { computeCarbon } from './CarbonModel.js';
export type { MaterialVolume } from './TakeoffTypes.js';

// ── 4D — construction programme (ADR-0351 §4D) ────────────────────────────────
export type {
  ConstructionSchedule,
  ConstructionTask,
  TaskProgressState,
  ResolvedTask,
  TaskStateAt,
  ScheduleStateAt,
  ScheduleCoverage,
} from './ScheduleModel.js';
export {
  EMPTY_SCHEDULE,
  resolveTasks,
  scheduleStateAt,
  scheduleCoverage,
  taskFromLine,
  taskFinishDate,
  taskWindowMs,
  taskProgressAt,
  scheduleWindowMs,
  taskDefects,
} from './ScheduleModel.js';

export { carbonToCsv, scheduleToCsv } from './carbonCsv.js';
