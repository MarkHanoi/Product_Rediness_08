// @pryzm/ai-worker — CV pipeline barrel (S50).
//
// Public surface for the floorplan-segmentation CV pipeline core.
// Imported by `apps/ai-worker/src/handlers.ts` (default registry)
// and by tests / benches.

export {
  classifyPage,
  PLAN_ROUTING_THRESHOLD,
} from './page-classification.js';

export { runSegmentationModel } from './floorplan-segmentation.js';

export {
  createCvHandler,
  PDF_TO_BIM_PER_PAGE_CEILING_USD,
} from './handler.js';
export type {
  CostMeterLike,
  CreateCvHandlerOpts,
  FloorplanSegOutcomeSink,
} from './handler.js';

export {
  selectRuntimeKind,
  loadRuntime,
  MOCK_RUNTIME,
} from './runtime.js';

export {
  InMemoryStorage,
  createStorage,
  maskKey,
} from './storage.js';

export type {
  BinaryMask,
  CvEnv,
  FloorplanSegJob,
  FloorplanSegOutcome,
  ModelRuntime,
  ModelRuntimeKind,
  PageClassification,
  PageKind,
  PdfPage,
  SegmentationResult,
  StoragePorter,
} from './types.js';
