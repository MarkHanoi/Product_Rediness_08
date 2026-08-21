/**
 * Barrel export for all Room command classes.
 * Import individual commands from here.
 */

export { CreateRoomCommand }      from './CreateRoomCommand';
export { UpdateRoomCommand }      from './UpdateRoomCommand';
export { UpdateRoomBoundaryCommand } from './UpdateRoomBoundaryCommand';
export { DeleteRoomCommand }      from './DeleteRoomCommand';
export { RenameRoomCommand }      from './RenameRoomCommand';
export { SetRoomOccupancyCommand } from './SetRoomOccupancyCommand';
// §ROOM-VG-CATEGORY (L-1614) -- HOW rooms are colour-coded (by type / size /
// user-defined / all white). A VG category write, not a room write.
export { SetRoomColourModeCommand } from './SetRoomColourModeCommand';
export type { RoomColourModeScope } from './SetRoomColourModeCommand';
export { UpdateRoomFinishesCommand } from './UpdateRoomFinishesCommand';
export { UpdateRoomFinishesBulkCommand } from './UpdateRoomFinishesBulkCommand';
export type { RoomFinishPatch } from './UpdateRoomFinishesBulkCommand';
export { DetectRoomFromWallsCommand } from './DetectRoomFromWallsCommand';
export { DetectAllRoomsCommand }  from './DetectAllRoomsCommand';
export { BatchCreateRoomsCommand } from './BatchCreateRoomsCommand';
export { ReDetectRoomsCommand }   from './ReDetectRoomsCommand';
// SAFE MODE ROOM RESHAPE — commits the PREDICTED geometry verbatim (no second algorithm).
export { ApplyPredictedRoomGeometryCommand } from './ApplyPredictedRoomGeometryCommand';
export type {
  PredictedRoomGeometry,
  UndeterminedRoomGeometry,
  AppliedRoomOutcome,
} from './ApplyPredictedRoomGeometryCommand';
