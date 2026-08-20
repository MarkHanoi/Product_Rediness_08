export { CreateStairCommand } from './CreateStairCommand';
export type { CreateStairInput } from './CreateStairCommand';
export { UpdateStairParametersCommand } from './UpdateStairParametersCommand';
export type { UpdateStairParametersInput } from './UpdateStairParametersCommand';
export { ValidateStairCommand } from './ValidateStairCommand';
export type { ValidateStairInput } from './ValidateStairCommand';
export { GenerateStairGeometryCommand } from './GenerateStairGeometryCommand';
export type { GenerateStairGeometryInput } from './GenerateStairGeometryCommand';
export { DeleteStairCommand } from './DeleteStairCommand';
export type { DeleteStairInput } from './DeleteStairCommand';
export { MoveStairCommand } from './MoveStairCommand';
export type { MoveStairInput } from './MoveStairCommand';
export { UpdateStairFlightsCommand } from './UpdateStairFlightsCommand';
export type { UpdateStairFlightsInput, StairFlightInput, StairLandingInput } from './UpdateStairFlightsCommand';
export { UpdateStairRailingCommand } from './UpdateStairRailingCommand';
export type { UpdateStairRailingPayload } from './UpdateStairRailingCommand';
export { ChangeStairShapeCommand } from './ChangeStairShapeCommand';
export type { ChangeStairShapeInput } from './ChangeStairShapeCommand';

// §STAIR-PIERCES-EVERY-HORIZONTAL-HOST (L-1431) — the derived host set. Exported
// so a test can drive the real registry, and so a future horizontal family can
// register without editing any stair command.
export {
    HORIZONTAL_HOST_PIERCERS,
    pierceStairHorizontalHosts,
    unpierceStairHorizontalHosts,
    findStairHorizontalHostPierces,
    stairHostPierceId,
    stairHostPiercePrefix,
    stairPiercedLevelIds,
} from './StairHorizontalHostPiercing';
export type {
    HorizontalHost,
    HorizontalHostPiercer,
    StairHostPierce,
} from './StairHorizontalHostPiercing';
