// Room handler registration helper (S25).

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { CreateRoomHandler } from './CreateRoom.js';
import { DeleteRoomHandler } from './DeleteRoom.js';
import { MoveRoomHandler } from './MoveRoom.js';
import { SetRoomNameHandler } from './SetRoomName.js';
import { SetRoomNumberHandler } from './SetRoomNumber.js';
import { SetRoomOccupancyHandler } from './SetRoomOccupancy.js';
import { SetRoomMaterialHandler } from './SetRoomMaterial.js';
import { SetRoomHeightOffsetHandler } from './SetRoomHeightOffset.js';
import { RecomputeRoomBoundaryHandler } from './RecomputeRoomBoundary.js';
import { RedetectRoomsHandler } from './RedetectRooms.js';
import { RenameRoomHandler } from './RenameRoom.js';
import { CreateTemplateHandler } from './CreateTemplate.js';
import { AssignTemplateToNodeHandler } from './AssignTemplateToNode.js';

export const ROOM_HANDLER_TYPES = [
  'room.create',
  'room.delete',
  'room.move',
  'room.setName',
  'room.setNumber',
  'room.setOccupancy',
  'room.setMaterial',
  'room.setHeightOffset',
  'room.recomputeBoundary',
  'rooms.redetect',
  'room.rename',
  'template.create',
  'template.assignToNode',
] as const;

export type RoomHandlerType = (typeof ROOM_HANDLER_TYPES)[number];

export function buildRoomHandlerSet(): readonly CommandHandler<unknown>[] {
  return [
    new CreateRoomHandler() as unknown as CommandHandler<unknown>,
    new DeleteRoomHandler() as unknown as CommandHandler<unknown>,
    new MoveRoomHandler() as unknown as CommandHandler<unknown>,
    new SetRoomNameHandler() as unknown as CommandHandler<unknown>,
    new SetRoomNumberHandler() as unknown as CommandHandler<unknown>,
    new SetRoomOccupancyHandler() as unknown as CommandHandler<unknown>,
    new SetRoomMaterialHandler() as unknown as CommandHandler<unknown>,
    new SetRoomHeightOffsetHandler() as unknown as CommandHandler<unknown>,
    new RecomputeRoomBoundaryHandler() as unknown as CommandHandler<unknown>,
    new RedetectRoomsHandler() as unknown as CommandHandler<unknown>,
    RenameRoomHandler as unknown as CommandHandler<unknown>,
    CreateTemplateHandler as unknown as CommandHandler<unknown>,
    AssignTemplateToNodeHandler as unknown as CommandHandler<unknown>,
  ];
}

export function registerRoomHandlers(bus: CommandBus): readonly string[] {
  for (const h of buildRoomHandlerSet()) bus.register(h);
  return ROOM_HANDLER_TYPES;
}

export { CreateRoomHandler, type CreateRoomPayload } from './CreateRoom.js';
export { DeleteRoomHandler, type DeleteRoomPayload } from './DeleteRoom.js';
export { MoveRoomHandler, type MoveRoomPayload } from './MoveRoom.js';
export { SetRoomNameHandler, type SetRoomNamePayload } from './SetRoomName.js';
export { SetRoomNumberHandler, type SetRoomNumberPayload } from './SetRoomNumber.js';
export { SetRoomOccupancyHandler, type SetRoomOccupancyPayload } from './SetRoomOccupancy.js';
export { SetRoomMaterialHandler, type SetRoomMaterialPayload } from './SetRoomMaterial.js';
export {
  SetRoomHeightOffsetHandler,
  type SetRoomHeightOffsetPayload,
} from './SetRoomHeightOffset.js';
export {
  RecomputeRoomBoundaryHandler,
  type RecomputeRoomBoundaryPayload,
} from './RecomputeRoomBoundary.js';
export {
  RedetectRoomsHandler,
  type RedetectRoomsPayload,
} from './RedetectRooms.js';
export { RenameRoomHandler, type RenameRoomPayload } from './RenameRoom.js';
export { CreateTemplateHandler, type CreateTemplatePayload } from './CreateTemplate.js';
export { AssignTemplateToNodeHandler, type AssignTemplateToNodePayload } from './AssignTemplateToNode.js';
