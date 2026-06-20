/**
 * @file CommandRegistry.ts
 * @migration S89-WIRE (2026-05-01) — moved from `src/collaboration/CommandRegistry.ts`
 *   to `src/engine/subsystems/CommandRegistry.ts`.
 *
 *   Layer rationale: CommandRegistry imports ~60 command classes from `src/commands/`.
 *   Commands are L7-tier content that will eventually move to plugin handlers (Wave 10).
 *   Until that migration, this file belongs in `src/engine/subsystems/` alongside
 *   `initCollaboration.ts`, its only consumer.  It cannot go to `packages/sync-client/`
 *   (L3 pure) because it hard-depends on the full `src/commands/` tree.
 *
 *   The `src/collaboration/` directory is deleted by this migration.  The sole
 *   structural importer (`src/engine/subsystems/initCollaboration.ts` line 49) has
 *   been updated to the new path (`./RemoteCommandDispatcher`).  All `../commands/`
 *   import paths corrected to `../../commands/` for the new depth.
 *
 * CommandRegistry
 *
 * Maps CommandType strings to factory functions that reconstruct Command objects
 * from their serialized (over-wire) form. Used by RemoteCommandDispatcher to
 * replay remote collaborator commands through the local CommandManager.
 *
 * Coverage: the ~60 command types that form the core BIM authoring vocabulary.
 * Unknown types return null — callers fall back to the toast-only notification.
 *
 * Contracts:
 *   §30-REAL-TIME-COLLABORATION §3.1 — registry is the only path from serialized
 *     wire payload back to a typed Command object.
 *   §01-BIM-ENGINE-CORE §1.1 — engine-layer imports only; no UI deps.
 */

import type { SerializedCommand, Command } from '@pryzm/command-registry';

// ── Wall commands ──────────────────────────────────────────────────────────────
import { CreateWallCommand } from '@pryzm/command-registry';
import { DeleteElementCommand } from '@pryzm/command-registry';
import { UpdateWallHeightCommand } from '@pryzm/command-registry';
import { UpdateWallDimensionsCommand } from '@pryzm/command-registry';
import { UpdateWallColorCommand } from '@pryzm/command-registry';
import { UpdateWallLayersCommand } from '@pryzm/command-registry';
import { UpdateWallSystemTypeCommand } from '@pryzm/command-registry';
import { UpdateWallBaselineCommand } from '@pryzm/command-registry';
import { ChangeWallLevelCommand } from '@pryzm/command-registry';
import { CreateWallOpeningCommand } from '@pryzm/command-registry';
import { SetWallWidthCommand } from '@pryzm/command-registry';
import { SetAllWallsWidthCommand } from '@pryzm/command-registry';
import { CreateWallsFromSlabCommand } from '@pryzm/command-registry';

// ── Door commands ──────────────────────────────────────────────────────────────
import { MoveDoorCommand } from '@pryzm/command-registry';
import { UpdateDoorWidthCommand } from '@pryzm/command-registry';
import { UpdateDoorHeightCommand } from '@pryzm/command-registry';
import { UpdateDoorSillHeightCommand } from '@pryzm/command-registry';
import { UpdateDoorFireRatingCommand } from '@pryzm/command-registry';
import { UpdateDoorAccessibilityTypeCommand } from '@pryzm/command-registry';
import { UpdateDoorFrameColorCommand } from '@pryzm/command-registry';
import { UpdateDoorLeafColorCommand } from '@pryzm/command-registry';

// ── Window commands ────────────────────────────────────────────────────────────
import { MoveWindowCommand } from '@pryzm/command-registry';
import { UpdateWindowWidthCommand } from '@pryzm/command-registry';
import { UpdateWindowHeightCommand } from '@pryzm/command-registry';
import { UpdateWindowSillHeightCommand } from '@pryzm/command-registry';
import { UpdateWindowFireRatingCommand } from '@pryzm/command-registry';
import { UpdateWindowFrameColorCommand } from '@pryzm/command-registry';

// ── Slab commands ──────────────────────────────────────────────────────────────
import { CreateSlabCommand } from '@pryzm/command-registry';
import { DeleteSlabCommand } from '@pryzm/command-registry';
import { UpdateSlabCommand } from '@pryzm/command-registry';
import { UpdateSlabDimensionsCommand } from '@pryzm/command-registry';
import { UpdateSlabLevelCommand } from '@pryzm/command-registry';
import { UpdateSlabLayersCommand } from '@pryzm/command-registry';
// W1 §SLAB-SYSTEM-AUDIT-2026: 12 previously-unregistered slab command factories.
import { UpdateSlabPolygonCommand } from '@pryzm/command-registry';
import { UpdateSlabSketchCommand } from '@pryzm/command-registry';
import { CreateOpeningCommand } from '@pryzm/command-registry';
import { UpdateOpeningCommand } from '@pryzm/command-registry';
import { DeleteOpeningCommand } from '@pryzm/command-registry';
import { DegradeSlabSketchCommand } from '@pryzm/command-registry';
import { RemoveSlabsOnLevelCommand } from '@pryzm/command-registry';
import { CreateAllSlabsFromLevelToTopLevelCommand } from '@pryzm/command-registry';
import { CreateAllSlabsFromLevelToAllFloorsCommand } from '@pryzm/command-registry';
import { CreateSlabsOnAllFloorsCommand } from '@pryzm/command-registry';
import { ReplicateSelectedSlabToAllLevelsCommand } from '@pryzm/command-registry';
import { UpdateAllSlabsCommand } from '@pryzm/command-registry';

// ── Room commands ──────────────────────────────────────────────────────────────
import { CreateRoomCommand } from '@pryzm/command-registry';
import { DeleteRoomCommand } from '@pryzm/command-registry';
import { UpdateRoomCommand } from '@pryzm/command-registry';
import { SetRoomOccupancyCommand } from '@pryzm/command-registry';
import { RenameRoomCommand } from '@pryzm/command-registry';

// ── Column commands ────────────────────────────────────────────────────────────
import { CreateColumnCommand } from '@pryzm/command-registry';
import { UpdateColumnCommand } from '@pryzm/command-registry';
// §COLUMN-AUDIT-2026 §C1 / §C2 / §W7: 3 previously-unregistered column
// command factories are added below.
import { DeleteColumnCommand } from '@pryzm/command-registry';
import { UpdateColumnLevelCommand } from '@pryzm/command-registry';
import { RemoveColumnsOnLevelCommand } from '@pryzm/command-registry';

// ── Level commands ─────────────────────────────────────────────────────────────
import { AddLevelCommand } from '@pryzm/command-registry';
import { UpdateLevelCommand } from '@pryzm/command-registry';
import { DeleteLevelCommand } from '@pryzm/command-registry';
import { DuplicateFloorPlanCommand } from '@pryzm/command-registry';

// ── Floor / Ceiling commands ───────────────────────────────────────────────────
import { CreateFloorCommand } from '@pryzm/command-registry';
import { UpdateFloorCommand } from '@pryzm/command-registry';
import { RemoveFloorCommand } from '@pryzm/command-registry';
import { CreateCeilingCommand } from '@pryzm/command-registry';
import { UpdateCeilingCommand } from '@pryzm/command-registry';
import { RemoveCeilingCommand } from '@pryzm/command-registry';

// ── Grid commands ──────────────────────────────────────────────────────────────
import { UpdateGridCommand } from '@pryzm/command-registry';
import { RemoveGridCommand } from '@pryzm/command-registry';

// ── Curtain wall commands ──────────────────────────────────────────────────────
import { CreateCurtainWallCommand } from '@pryzm/command-registry';
import { UpdateCurtainWallCommand } from '@pryzm/command-registry';

// ── Roof commands ──────────────────────────────────────────────────────────────
import { CreateRoofCommand } from '@pryzm/command-registry';
import { UpdateRoofCommand } from '@pryzm/command-registry';
import { DeleteRoofCommand } from '@pryzm/command-registry';

// ── Stair commands ─────────────────────────────────────────────────────────────
import { CreateStairCommand } from '@pryzm/command-registry';
import { UpdateStairParametersCommand } from '@pryzm/command-registry';

// ── Beam commands ──────────────────────────────────────────────────────────────
import { CreateBeamCommand } from '@pryzm/command-registry';
import { UpdateBeamCommand } from '@pryzm/command-registry';
import { AssignBeamSupportsCommand } from '@pryzm/command-registry';

// ── Handrail commands ──────────────────────────────────────────────────────────
import { CreateHandrailCommand } from '@pryzm/command-registry';
import { UpdateHandrailCommand } from '@pryzm/command-registry';
import { DeleteHandrailCommand } from '@pryzm/command-registry';

// ── Furniture / Plumbing / Lighting commands ───────────────────────────────────
// §ELEMENT-REPLAY-AUDIT (founder 2026-06-19) — placed elements must keep their id and
// survive move/rotate/delete across collaboration catch-up. With the dispatcher's
// §REMOTE-EXEC-FALLBACK, a registry factory alone makes a family replayable.
import { CreateFurnitureCommand } from '@pryzm/command-registry';
import { UpdateFurnitureParametersCommand } from '@pryzm/command-registry';
import { CreatePlumbingFixtureCommand } from '@pryzm/command-registry';
import { UpdatePlumbingParametersCommand } from '@pryzm/command-registry';
import { MovePlumbingCommand } from '@pryzm/command-registry';
import { CreateLightingCommand } from '@pryzm/command-registry';
import { UpdateLightingParametersCommand } from '@pryzm/command-registry';
import { MoveLightingCommand } from '@pryzm/command-registry';
import { MoveStairCommand } from '@pryzm/command-registry';
// §ELEMENT-REPLAY-AUDIT Phase 1 (2026-06-20) — per-element EDIT commands that were
// serialized on collaboration catch-up but had NO factory → reconstructed as null
// ("No factory") and silently dropped, so the edit reverted on every remote peer /
// reconnect (same class of bug as §FURNITURE-UPDATE-REPLAY). These are the highest-
// value gaps: the generic property-panel apply (ALL element types), window centring,
// stair reshape/flights/delete, and element mark/annotation edits.
import { UpdateElementParameterCommand } from '@pryzm/command-registry';
import { CenterWindowInWallCommand } from '@pryzm/command-registry';
import { ChangeStairShapeCommand } from '@pryzm/command-registry';
import { UpdateStairFlightsCommand } from '@pryzm/command-registry';
import { UpdateElementMarkCommand } from '@pryzm/command-registry';
import { DeleteStairCommand } from '@pryzm/command-registry';
// §ELEMENT-REPLAY-AUDIT Phase 1 cluster 2 (2026-06-20) — curtain-grid edits, multi-
// wall baseline cascade, grid pin/system, floor layers, room boundary. All had a
// command-registry class + serialize() but no factory → unreplayable.
import { AddCurtainGridLineCommand } from '@pryzm/command-registry';
import { RemoveCurtainGridLineCommand } from '@pryzm/command-registry';
import { UpdateAllCurtainWallsCommand } from '@pryzm/command-registry';
import { CascadeWallBaselineCommand } from '@pryzm/command-registry';
import { TogglePinGridCommand } from '@pryzm/command-registry';
import { CreateGridSystemCommand } from '@pryzm/command-registry';
import { UpdateFloorLayersCommand } from '@pryzm/command-registry';
import { UpdateRoomBoundaryCommand } from '@pryzm/command-registry';

// ── Room Bounding Line commands ────────────────────────────────────────────────
import { CreateRoomBoundingLineCommand } from '@pryzm/command-registry';
import { DeleteRoomBoundingLineCommand } from '@pryzm/command-registry';
import { UpdateRoomBoundingLineCommand } from '@pryzm/command-registry';

// ─────────────────────────────────────────────────────────────────────────────

type CommandFactory = (s: SerializedCommand) => Command;

const REGISTRY = new Map<string, CommandFactory>([

    // ── Walls ────────────────────────────────────────────────────────────────
    ['CREATE_WALL', (s) => new CreateWallCommand(
        s.payload.wallId,
        {
            start:        s.payload.start,
            end:          s.payload.end,
            height:       s.payload.height,
            thickness:    s.payload.thickness,
            levelId:      s.payload.levelId,
            baseOffset:   s.payload.baseOffset,
            materialId:   s.payload.materialId,
            materialColor: s.payload.materialColor,
            curve:        s.payload.curve,
            systemTypeId: s.payload.systemTypeId,
        },
    )],
    ['DELETE_ELEMENT', (s) => new DeleteElementCommand(s.payload.elementId)],
    ['UPDATE_WALL_HEIGHT', (s) => new UpdateWallHeightCommand(s.payload as any)],
    ['UPDATE_WALL_DIMENSIONS', (s) => new UpdateWallDimensionsCommand(s.payload as any)],
    ['UPDATE_WALL_COLOR', (s) => new UpdateWallColorCommand(s.payload as any)],
    ['UPDATE_WALL_LAYERS', (s) => new UpdateWallLayersCommand(s.payload as any)],
    ['UPDATE_WALL_SYSTEM_TYPE', (s) => new UpdateWallSystemTypeCommand(s.payload as any)],
    ['UPDATE_WALL_BASELINE', (s) => new UpdateWallBaselineCommand(s.payload as any)],
    ['CHANGE_WALL_LEVEL', (s) => new ChangeWallLevelCommand(s.payload as any)],
    ['ADD_OPENING', (s) => new CreateWallOpeningCommand({
        wallId:      s.payload.wallId,
        openingData: s.payload.openingData,
    })],
    // SetWallWidthCommand(elementIds[], newWidth) — serialize gives { elementIds, width }
    ['UPDATE_ELEMENT_THICKNESS', (s) => new SetWallWidthCommand(s.payload.elementIds, s.payload.width)],
    ['UPDATE_WALL_BASELINE_WIDTH', (s) => new SetAllWallsWidthCommand(
        s.payload.elementIds,
        s.payload.width,
    )],
    ['CREATE_WALLS_FROM_SLAB', (s) => new CreateWallsFromSlabCommand(s.payload as any)],

    // ── Doors ────────────────────────────────────────────────────────────────
    ['MOVE_DOOR', (s) => new MoveDoorCommand(s.payload.doorId, s.payload.distance, s.payload.direction)],
    ['UPDATE_DOOR_WIDTH', (s) => new UpdateDoorWidthCommand(s.payload.doorId, s.payload.newValue)],
    ['UPDATE_DOOR_HEIGHT', (s) => new UpdateDoorHeightCommand(s.payload.doorId, s.payload.newValue)],
    ['UPDATE_DOOR_SILL_HEIGHT', (s) => new UpdateDoorSillHeightCommand(s.payload.doorId, s.payload.newValue)],
    ['UPDATE_DOOR_FIRE_RATING', (s) => new UpdateDoorFireRatingCommand(s.payload.doorId, s.payload.newValue)],
    ['UPDATE_DOOR_ACCESSIBILITY_TYPE', (s) => new UpdateDoorAccessibilityTypeCommand(s.payload.doorId, s.payload.newValue)],
    ['UPDATE_DOOR_FRAME_COLOR', (s) => new UpdateDoorFrameColorCommand(s.payload.doorId, s.payload.newValue)],
    ['UPDATE_DOOR_LEAF_COLOR', (s) => new UpdateDoorLeafColorCommand(s.payload.doorId, s.payload.newValue)],

    // ── Windows ──────────────────────────────────────────────────────────────
    ['MOVE_WINDOW', (s) => new MoveWindowCommand(s.payload.windowId, s.payload.distance, s.payload.direction)],
    ['UPDATE_WINDOW_WIDTH', (s) => new UpdateWindowWidthCommand(s.payload.windowId, s.payload.newValue)],
    ['UPDATE_WINDOW_HEIGHT', (s) => new UpdateWindowHeightCommand(s.payload.windowId, s.payload.newValue)],
    ['UPDATE_WINDOW_SILL_HEIGHT', (s) => new UpdateWindowSillHeightCommand(s.payload.windowId, s.payload.newValue)],
    ['UPDATE_WINDOW_FIRE_RATING', (s) => new UpdateWindowFireRatingCommand(s.payload.windowId, s.payload.newValue)],
    ['UPDATE_WINDOW_FRAME_COLOR', (s) => new UpdateWindowFrameColorCommand(s.payload.windowId, s.payload.newValue)],

    // ── Slabs ─────────────────────────────────────────────────────────────────
    ['CREATE_SLAB', (s) => new CreateSlabCommand(s.payload as any)],
    // C2 §SLAB-SYSTEM-AUDIT-2026: Register dedicated slab-delete factory.
    ['DELETE_SLAB', (s) => new DeleteSlabCommand(s.payload.slabId as string)],
    ['UPDATE_SLAB', (s) => new UpdateSlabCommand(s.payload as any)],
    ['UPDATE_SLAB_DIMENSIONS', (s) => new UpdateSlabDimensionsCommand(s.payload as any)],
    ['UPDATE_SLAB_LEVEL', (s) => new UpdateSlabLevelCommand(s.payload as any)],
    ['UPDATE_SLAB_LAYERS', (s) => new UpdateSlabLayersCommand(s.payload as any)],
    // W1 §SLAB-SYSTEM-AUDIT-2026: 12 previously-unregistered slab command factories.
    ['UPDATE_SLAB_POLYGON', (s) => new UpdateSlabPolygonCommand(s.payload as any)],
    ['UPDATE_SLAB_SKETCH', (s) => new UpdateSlabSketchCommand(s.payload as any)],
    ['CREATE_OPENING', (s) => new CreateOpeningCommand(s.payload as any)],
    ['UPDATE_OPENING', (s) => new UpdateOpeningCommand(s.payload as any)],
    ['DELETE_OPENING', (s) => new DeleteOpeningCommand(s.payload.openingId as string)],
    ['DEGRADE_SLAB_SKETCH', (s) => new DegradeSlabSketchCommand(s.payload as any)],
    ['REMOVE_SLABS_ON_LEVEL', (s) => new RemoveSlabsOnLevelCommand(s.payload as any)],
    ['CREATE_ALL_SLABS_FROM_LEVEL_TO_TOP_LEVEL', (s) => new CreateAllSlabsFromLevelToTopLevelCommand(s.payload.sourceLevelId as string)],
    ['CREATE_ALL_SLABS_FROM_LEVEL_TO_ALL_FLOORS', (s) => new CreateAllSlabsFromLevelToAllFloorsCommand(s.payload.sourceLevelId as string)],
    ['CREATE_SLABS_ON_ALL_FLOORS', (s) => new CreateSlabsOnAllFloorsCommand(s.payload.referenceSlabId as string)],
    ['CREATE_SLAB_ON_LEVEL_SIMILAR_TO_SELECTED', (s) => new ReplicateSelectedSlabToAllLevelsCommand(s.payload as any)],
    ['UPDATE_ALL_SLABS', (s) => new UpdateAllSlabsCommand(s.payload as any)],

    // ── Rooms ─────────────────────────────────────────────────────────────────
    ['CREATE_ROOM', (s) => new CreateRoomCommand(s.payload.roomData)],
    ['DELETE_ROOM', (s) => new DeleteRoomCommand(s.payload.roomId)],
    ['UPDATE_ROOM', (s) => new UpdateRoomCommand(s.payload.roomId, s.payload.updates)],
    ['SET_ROOM_OCCUPANCY', (s) => new SetRoomOccupancyCommand(s.payload.roomId, s.payload.occupancyType)],
    ['RENAME_ROOM', (s) => new RenameRoomCommand(s.payload.roomId, s.payload.updates)],

    // ── Columns ───────────────────────────────────────────────────────────────
    ['CREATE_COLUMN', (s) => new CreateColumnCommand(s.payload as any)],
    ['UPDATE_COLUMN', (s) => new UpdateColumnCommand(s.payload as any)],
    ['DELETE_COLUMN', (s) => new DeleteColumnCommand(s.payload as any)],
    ['UPDATE_COLUMN_LEVEL', (s) => new UpdateColumnLevelCommand(s.payload as any)],
    ['REMOVE_COLUMNS_ON_LEVEL', (s) => new RemoveColumnsOnLevelCommand(s.payload as any)],

    // ── Levels ────────────────────────────────────────────────────────────────
    ['CREATE_LEVEL', (s) => new AddLevelCommand(s.payload as any)],
    ['UPDATE_LEVEL', (s) => new UpdateLevelCommand(s.payload as any)],
    ['DELETE_LEVEL', (s) => new DeleteLevelCommand(s.payload as any)],
    ['DUPLICATE_FLOOR_PLAN', (s) => new DuplicateFloorPlanCommand(s.payload as any)],

    // ── Floors / Ceilings ─────────────────────────────────────────────────────
    ['CREATE_FLOOR', (s) => new CreateFloorCommand(s.payload as any)],
    ['UPDATE_FLOOR', (s) => new UpdateFloorCommand(s.payload as any)],
    ['CREATE_CEILING', (s) => new CreateCeilingCommand(s.payload as any)],
    ['UPDATE_CEILING', (s) => new UpdateCeilingCommand(s.payload as any)],
    // §ELEMENT-REPLAY-AUDIT Phase 1 — floor/ceiling REMOVE were unreplayable.
    ['REMOVE_FLOOR', (s) => new RemoveFloorCommand(s.payload as any)],
    ['REMOVE_CEILING', (s) => new RemoveCeilingCommand(s.payload.ceilingId as string)],

    // ── Grids ─────────────────────────────────────────────────────────────────
    // §ELEMENT-REPLAY-AUDIT Phase 1 — grid update/remove were unreplayable.
    ['UPDATE_GRID', (s) => new UpdateGridCommand(s.payload as any)],
    ['REMOVE_GRID', (s) => new RemoveGridCommand(s.payload as any)],

    // ── Curtain Walls ─────────────────────────────────────────────────────────
    ['CREATE_CURTAIN_WALL', (s) => new CreateCurtainWallCommand(s.payload as any)],
    ['UPDATE_CURTAIN_WALL', (s) => new UpdateCurtainWallCommand(s.payload as any)],

    // ── Roofs ─────────────────────────────────────────────────────────────────
    // CreateRoofCommand(roofId, CreateRoofPayload) — serialize gives { roofId, ...payload }
    ['CREATE_ROOF', (s) => {
        const { roofId, ...rest } = s.payload;
        return new CreateRoofCommand(roofId as string, rest as any);
    }],
    ['UPDATE_ROOF', (s) => new UpdateRoofCommand(s.payload.roofId, s.payload.updates)],
    // §ELEMENT-REPLAY-AUDIT Phase 1 — DELETE was unreplayable for these element types.
    ['DELETE_ROOF', (s) => new DeleteRoofCommand(s.payload.roofId as string)],

    // ── Stairs ────────────────────────────────────────────────────────────────
    ['CREATE_STAIR', (s) => new CreateStairCommand(s.payload as any)],
    ['UPDATE_STAIR_PARAMETERS', (s) => new UpdateStairParametersCommand(s.payload as any)],

    // ── Beams ─────────────────────────────────────────────────────────────────
    // CreateBeamCommand uses non-standard serialize format: { type, id, input, ... }
    ['CREATE_BEAM', (s) => new CreateBeamCommand((s as any).input ?? s.payload as any)],
    ['UPDATE_BEAM', (s) => new UpdateBeamCommand((s as any).input ?? s.payload as any)],
    // §BEAM-AUDIT-2026-W11: ASSIGN_BEAM_SUPPORTS was declared in CommandType
    // but never wired into the registry — collaboration peers received the
    // wire frame and silently dropped it, so support reassignments propagated
    // to the local store and SemanticGraph but NOT to remote viewers.
    ['ASSIGN_BEAM_SUPPORTS', (s) => new AssignBeamSupportsCommand((s as any).input ?? s.payload as any)],

    // ── Handrails ─────────────────────────────────────────────────────────────
    ['CREATE_HANDRAIL', (s) => new CreateHandrailCommand(s.payload as any)],
    ['UPDATE_HANDRAIL', (s) => new UpdateHandrailCommand(s.payload as any)],
    // DeleteHandrailCommand(handrailId: string) — serialize gives { handrailId }
    ['DELETE_HANDRAIL', (s) => new DeleteHandrailCommand(s.payload.handrailId as string)],

    // ── Furniture / Plumbing ──────────────────────────────────────────────────
    ['CREATE_FURNITURE', (s) => new CreateFurnitureCommand(s.payload as any)],
    // §FURNITURE-UPDATE-REPLAY (founder 2026-06-19) — furniture MOVE/ROTATE/resize
    // dispatch UPDATE_FURNITURE_PARAMETERS, which had NO registry factory → on every
    // collaboration catch-up/reconnect (frequent on Fly: socket transport-close →
    // replay) the command was skipped ("No factory") so the furniture reverted to its
    // CREATE_FURNITURE state — the founder's "sofa rotates back to origin after I move
    // it". Reconstruct it so it is replayable (mirrors the slab/column/beam audit
    // gaps fixed above). UpdateFurnitureParametersCommand takes a single payload obj.
    ['UPDATE_FURNITURE_PARAMETERS', (s) => new UpdateFurnitureParametersCommand(s.payload as any)],
    ['CREATE_PLUMBING_FIXTURE', (s) => new CreatePlumbingFixtureCommand(s.payload as any)],
    // §ELEMENT-REPLAY-AUDIT — same revert-on-catch-up gap as furniture for the OTHER
    // placed elements the user moves/rotates. With §REMOTE-EXEC-FALLBACK these factories
    // make plumbing fixtures, lighting and stairs survive collaboration replay. (Per-
    // element DELETE goes through the generic DELETE_ELEMENT factory above.)
    ['UPDATE_PLUMBING_PARAMETERS', (s) => new UpdatePlumbingParametersCommand(s.payload as any)],
    // §ELEMENT-SEMANTIC-AUDIT S4 (2026-06-20) — new MovePlumbingCommand makes plumbing
    // fixtures gizmo-movable AND replay-survive. serialize emits { id, to }.
    ['MOVE_PLUMBING', (s) => new MovePlumbingCommand(s.payload as any)],
    ['CREATE_LIGHTING', (s) => new CreateLightingCommand(s.payload as any)],
    ['UPDATE_LIGHTING_PARAMETERS', (s) => new UpdateLightingParametersCommand(s.payload as any)],
    ['MOVE_LIGHTING', (s) => new MoveLightingCommand(s.payload as any)],
    ['MOVE_STAIR', (s) => new MoveStairCommand(s.payload as any)],

    // ── Room Bounding Lines ───────────────────────────────────────────────────
    ['CREATE_ROOM_BOUNDING_LINE', (s) => new CreateRoomBoundingLineCommand(s.payload as any)],
    ['DELETE_ROOM_BOUNDING_LINE', (s) => new DeleteRoomBoundingLineCommand(s.payload.elementId)],
    ['UPDATE_ROOM_BOUNDING_LINE', (s) => new UpdateRoomBoundingLineCommand(
        s.payload.elementId,
        s.payload.patch,
    )],

    // ── §ELEMENT-REPLAY-AUDIT Phase 1 (2026-06-20): per-element EDIT commands ──────
    // UpdateElementParameterCommand is the generic PropertyPanel "Apply Changes" path
    // for EVERY element type (routes per-elementType internally) — its replay gap meant
    // ANY parametric edit reverted on a remote peer. serialize() emits payload = input.
    ['UPDATE_ELEMENT_PARAMETER', (s) => new UpdateElementParameterCommand(s.payload as any)],
    // UpdateElementMarkCommand — element mark/annotation (tag) edits; payload = input.
    ['UPDATE_ELEMENT_MARK', (s) => new UpdateElementMarkCommand(s.payload as any)],
    // CenterWindowInWallCommand(windowId: string) — serialize emits { windowId }.
    ['CENTER_WINDOW_IN_WALL', (s) => new CenterWindowInWallCommand(s.payload.windowId as string)],
    // Stair edits — serialize payloads round-trip 1:1 into each Input.
    ['CHANGE_STAIR_SHAPE', (s) => new ChangeStairShapeCommand(s.payload as any)],
    ['UPDATE_STAIR_FLIGHTS', (s) => new UpdateStairFlightsCommand(s.payload as any)],
    ['DELETE_STAIR', (s) => new DeleteStairCommand(s.payload as any)],

    // ── §ELEMENT-REPLAY-AUDIT Phase 1 cluster 2 (2026-06-20) ──────────────────────
    // Curtain-grid edits — payload = this.payload, ctor takes that payload.
    ['ADD_CURTAIN_GRID_LINE', (s) => new AddCurtainGridLineCommand(s.payload as any)],
    ['REMOVE_CURTAIN_GRID_LINE', (s) => new RemoveCurtainGridLineCommand(s.payload as any)],
    // UpdateAllCurtainWallsCommand(properties) — serialize emits { properties }.
    ['UPDATE_ALL_CURTAIN_WALLS', (s) => new UpdateAllCurtainWallsCommand((s.payload as any).properties)],
    // CascadeWallBaselineCommand(input{cause,entries}) — forward-replay is exact; note
    // serialize drops per-entry prevBaseLine so undo-after-replay can't restore the old
    // baseline (pre-existing; forward apply on a remote peer is what replay needs).
    ['CASCADE_WALL_BASELINE', (s) => new CascadeWallBaselineCommand(s.payload as any)],
    // Grid pin/system + floor layers — payload round-trips 1:1 into each ctor.
    ['TOGGLE_PIN_GRID', (s) => new TogglePinGridCommand(s.payload as any)],
    ['CREATE_GRID_SYSTEM', (s) => new CreateGridSystemCommand(s.payload as any)],
    ['UPDATE_FLOOR_LAYERS', (s) => new UpdateFloorLayersCommand(s.payload as any)],
    // UpdateRoomBoundaryCommand(roomId, newBoundary, newBoundingWallIds?) — 3-arg ctor.
    ['UPDATE_ROOM_BOUNDARY', (s) => new UpdateRoomBoundaryCommand(
        (s.payload as any).roomId,
        (s.payload as any).newBoundary,
        (s.payload as any).newBoundingWallIds,
    )],
]);

// ─────────────────────────────────────────────────────────────────────────────

export const CommandRegistry = {
    /**
     * Reconstruct a typed Command from its serialized wire payload.
     * Returns null when the type is unknown (caller shows toast-only).
     */
    create(s: SerializedCommand): Command | null {
        const factory = REGISTRY.get(s.type as string);
        if (!factory) return null;
        try {
            return factory(s);
        } catch (err) {
            console.warn('[CommandRegistry] Factory failed for type:', s.type, err);
            return null;
        }
    },

    /**
     * Whether the registry can reconstruct commands of this type.
     * Use for logging / telemetry.
     */
    hasType(type: string): boolean {
        return REGISTRY.has(type);
    },

    /** Total number of registered command factories. */
    get size(): number {
        return REGISTRY.size;
    },
};
