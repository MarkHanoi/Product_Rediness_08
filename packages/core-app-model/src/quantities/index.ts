/**
 * @pryzm/core-app-model — quantities sub-barrel (lane DATA1, 2026-08-21).
 *
 * The *medición* (quantity take-off) read-model and the 5D cost layer that sits
 * on it. See ADR-0343 for why 4D and 6D are NOT here.
 */

export type {
  QuantityUnit,
  TakeoffChapterId,
  TakeoffChapterDef,
  SecondaryMeasure,
  TakeoffLine,
  CoverageState,
  CoverageRow,
  TakeoffResult,
} from './TakeoffTypes.js';
export { UNIT_LABEL, TAKEOFF_CHAPTERS } from './TakeoffTypes.js';

export type {
  TakeoffStores,
  ListStore,
  WallReadStore,
  RoomLike,
  PolyElementLike,
  LinearElementLike,
  CountedElementLike,
} from './QuantityTakeoff.js';
export { computeTakeoff, defaultTakeoffStores, wallBaselineLength, openingVoidArea } from './QuantityTakeoff.js';

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
