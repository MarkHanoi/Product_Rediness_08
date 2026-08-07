/**
 * @pryzm/core-app-model — geometry sub-barrel (Sprint B P9-W8, Sprint D P9-W9, Sprint E P9-W10)
 */

// ── Sprint E P9-W10 (2026-05-10) — JoinData type (extracted from WallJoinResolver) ──
export type { JoinData } from './WallJoinTypes.js';

export type { NMEExportOptions } from './NativeElementMeshExporter.js';
export { NativeElementMeshExporter, nativeElementMeshExporter } from './NativeElementMeshExporter.js';

// ── Sprint D P9-W9 (2026-05-10) — WallJoinAuditUtils (pure THREE, no src/ deps) ──

export type { JoinAdjustment, JoinResult } from './WallJoinAuditUtils.js';
export {
    validateEndpointConvergence,
    computeBisector,
    computeMiterNormal,
    diagnoseJoinRobustness,
} from './WallJoinAuditUtils.js';

// ── §FEAT-WALL-MOVE-DIMENSIONS (founder L-29, 2026-07-02) — pure move-time set-out ──
export type {
    MovePtXZ,
    MoveWallSegment,
    WallMoveDimension,
    WallMoveDimensionOptions,
    MovingWallAxis,
} from './wallMoveDimensions.js';
export {
    computeWallMoveDimensions,
    classifyMovingWallAxis,
} from './wallMoveDimensions.js';

// ── §FEAT-PLAN-HOSTED-DRAG-HANDLES (founder, 2026-08-07) — host-parameter layer ──
// beneath the plan-view two-arrow drag affordance for hosted doors/windows.
export type {
    HostedOccupant,
    HostedDragHost,
    HostedSlideResult,
    HostedHandle,
    HostedHandleLayout,
    HostedHandleLayoutOptions,
} from './hostedDragParam.js';
export {
    projectCursorToHostOffset,
    resolveHostedSlide,
    computeHostedHandleLayout,
    hitTestHostedHandles,
    HOSTED_HANDLE_HIT_PX,
} from './hostedDragParam.js';
