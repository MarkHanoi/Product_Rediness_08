// @pryzm/render-pipeline — metrics sub-barrel (Wave A16 S122, A16-T2).
//
// CONTRACT (C10 §2): All render performance types and the service are
// exported from this path so consumers can tree-shake the metrics module
// independently of the render passes.
//
//   import { RenderPerformanceService } from '@pryzm/render-pipeline/metrics';
//
// Layer: L4 (Rendering)

export { RenderPerformanceService } from './RenderPerformanceService.js';
export type {
  RenderFrameMetrics,
  RenderPerformanceSnapshot,
  RenderAuditWarning,
  RenderAuditWarningCode,
  RenderPerformanceServiceOptions,
} from './RenderingAuditData.js';
