/**
 * Public API for the 2D stair path drawing tool.
 *
 * Usage:
 *   import { StairPathToolController } from '.';
 *
 *   const tool = new StairPathToolController({
 *       container,
 *       planViewCanvas,
 *       commandManager,
 *       baseLevelId,
 *       topLevelId,
 *       baseLevelElevation: 0,
 *       topLevelElevation: 3,
 *       width: 1.0,
 *   });
 *   tool.activate();
 */

export { PolylineModel }         from './PolylineModel';
export type { Point2D }          from './PolylineModel';

export { StairSolver2D }         from './StairSolver2D';
export type {
    SegmentSolution,
    LandingSolution,
    SolverResult2D,
    StairShape2D,
}                                from './StairSolver2D';

export { StairPreviewRenderer }  from './StairPreviewRenderer';
export type { ToScreen }         from './StairPreviewRenderer';

export { StairPathAdapter }      from './StairPathAdapter';
export type { StairPathAdapterConfig } from './StairPathAdapter';

export { StairPathToolController } from './StairPathToolController';
export type {
    StairPathState,
    StairPathToolConfig,
}                                from './StairPathToolController';

export { StairPathHUD }          from './StairPathHUD';

export { StairPathParamPanel } from './StairPathParamPanel';
export type {
    StairMode,
    StairParams,
    OnParamsChange,
    StairLevelOption,
} from './StairPathParamPanel';

export { CurvedStairSolver } from './CurvedStairSolver';
export type { CurvedStepSlice, CurvedSolverResult } from './CurvedStairSolver';

export { CurvedStairRenderer } from './CurvedStairRenderer';
