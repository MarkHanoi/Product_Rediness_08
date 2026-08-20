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

// §STAIR-VOID-FOLLOWS-SPAN (L-1532, closes L-1432) — the ONE verb every command
// that moves or re-parameterises a stair calls to make its void set match it,
// across every horizontal family and every deck, including decks that LEFT the
// span. Exported so a test can drive it directly against real stores.
export {
    cascadeStairVoids,
    undoStairVoidCascade,
    toStairVoidSource,
    EMPTY_STAIR_VOID_CASCADE,
} from './StairVoidCascade';
export type { StairVoidCascade, StairVoidSource } from './StairVoidCascade';
