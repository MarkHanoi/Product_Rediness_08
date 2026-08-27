// Room handler registration helper (S25).

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { CreateRoomHandler } from './CreateRoom.js';
import { DeleteRoomHandler } from './DeleteRoom.js';
import { MoveRoomHandler } from './MoveRoom.js';
import { SetRoomNameHandler } from './SetRoomName.js';
import { SetRoomNumberHandler } from './SetRoomNumber.js';
// §DEPT153 (L-12540+) — the manual Department entry point, mirroring SetRoomNumber.
import { SetRoomDepartmentHandler } from './SetRoomDepartment.js';
import { SetRoomOccupancyHandler } from './SetRoomOccupancy.js';
import { SetRoomColourModeHandler } from './SetRoomColourMode.js';
import { SetRoomMaterialHandler } from './SetRoomMaterial.js';
import { SetRoomFinishHandler } from './SetRoomFinish.js';
import { SetRoomHeightOffsetHandler } from './SetRoomHeightOffset.js';
import { RecomputeRoomBoundaryHandler } from './RecomputeRoomBoundary.js';
import { RedetectRoomsHandler } from './RedetectRooms.js';
import { RegenerateRoomsHandler } from './RegenerateRooms.js';
import { RenameRoomHandler } from './RenameRoom.js';
import { CreateTemplateHandler } from './CreateTemplate.js';
import { BulkAutoClassifyRoomsHandler } from './BulkAutoClassifyRooms.js';
// §ROOM-TOMBSTONE (L-10814) — the APPLY half of the DERIVATION + TOMBSTONE ruling.
import { RestoreRoomMeaningHandler } from './RestoreRoomMeaning.js';

export const ROOM_HANDLER_TYPES = [
  'room.create',
  'room.delete',
  'room.move',
  'room.setName',
  'room.setNumber',
  // §DEPT153 (L-12540+) — the manual Department field's bus verb. See
  // SetRoomDepartment.ts.
  'room.setDepartment',
  'room.setOccupancy',
  // §ROOM-VG-CATEGORY (L-1614) -- HOW rooms are colour-coded (by type / size /
  // user-defined / all white). A `room` VG CATEGORY write, not a room mutation.
  'room.setColourMode',
  'room.setMaterial',
  'room.setFinish',
  'room.setHeightOffset',
  'room.recomputeBoundary',
  'room.redetect',
  // C80 GEN-GAP-1 — the first generation-family bus verb. v1 REFUSES (typed,
  // returned not thrown); see RegenerateRooms.ts for why refusing is the
  // design and what closes it.
  'room.regenerate',
  'room.rename',
  // §ROOMTYPE142 — bulk content-based autofill (name + occupancy), one undo
  // entry for the whole batch. See BulkAutoClassifyRooms.ts.
  'room.autoClassify.batch',
  // §ROOM-TOMBSTONE (L-10814) / C94 RM-3 — restores the NAME/NUMBER/OCCUPANCY of a
  // room a re-detection destroyed, onto the new room that replaced it. ⛔ MEANING
  // only: it writes no id and no geometry, because the founder's ruling granted
  // durable LOSS, not durable identity. One command, one Ctrl+Z.
  'room.restoreMeaning',
  'template.create',
  // §FIX-TEMPLATE-ASSIGN-SHADOW (MT-03) — 'template.assignToNode' is NOT
  // declared here. It has a live §E.5.7 bridge in initBusHandlers.ts:2352, and
  // this plugin claiming the type first was the ONLY reason that bridge never
  // registered (the §OI-053 `registry.has()` skip at :2575). Both sites built
  // the SAME AssignTemplateToNodeCommand; the plugin arm additionally swallowed
  // a failed dispatch into `{forward:[],inverse:[]}` (C16 CA-18 PROHIBITED) and
  // dropped the bridge's `assignedBy: 'user'` default. Authority declared: the
  // bridge. Loser deleted, not commented. Pin: __tests__/templateAssignShadow.test.ts.
] as const;

export type RoomHandlerType = (typeof ROOM_HANDLER_TYPES)[number];

export function buildRoomHandlerSet(): readonly CommandHandler<unknown>[] {
  return [
    new CreateRoomHandler() as unknown as CommandHandler<unknown>,
    new DeleteRoomHandler() as unknown as CommandHandler<unknown>,
    new MoveRoomHandler() as unknown as CommandHandler<unknown>,
    new SetRoomNameHandler() as unknown as CommandHandler<unknown>,
    new SetRoomNumberHandler() as unknown as CommandHandler<unknown>,
    new SetRoomDepartmentHandler() as unknown as CommandHandler<unknown>,
    new SetRoomOccupancyHandler() as unknown as CommandHandler<unknown>,
    new SetRoomColourModeHandler() as unknown as CommandHandler<unknown>,
    new SetRoomMaterialHandler() as unknown as CommandHandler<unknown>,
    new SetRoomFinishHandler() as unknown as CommandHandler<unknown>,
    new SetRoomHeightOffsetHandler() as unknown as CommandHandler<unknown>,
    new RecomputeRoomBoundaryHandler() as unknown as CommandHandler<unknown>,
    new RedetectRoomsHandler() as unknown as CommandHandler<unknown>,
    new RegenerateRoomsHandler() as unknown as CommandHandler<unknown>,
    new RestoreRoomMeaningHandler() as unknown as CommandHandler<unknown>,
    RenameRoomHandler as unknown as CommandHandler<unknown>,
    CreateTemplateHandler as unknown as CommandHandler<unknown>,
    BulkAutoClassifyRoomsHandler as unknown as CommandHandler<unknown>,
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
export { SetRoomDepartmentHandler, type SetRoomDepartmentPayload } from './SetRoomDepartment.js';
export { SetRoomOccupancyHandler, type SetRoomOccupancyPayload } from './SetRoomOccupancy.js';
export { SetRoomColourModeHandler, type SetRoomColourModePayload } from './SetRoomColourMode.js';
export { SetRoomMaterialHandler, type SetRoomMaterialPayload } from './SetRoomMaterial.js';
export {
  SetRoomFinishHandler,
  ROOM_FINISH_SURFACES,
  type SetRoomFinishPayload,
  type RoomFinishSurface,
  type RoomFinishSpecInput,
} from './SetRoomFinish.js';
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
export {
  RegenerateRoomsHandler,
  buildRegenerationRefusal,
  type RegenerateRoomsPayload,
} from './RegenerateRooms.js';
export { RenameRoomHandler, type RenameRoomPayload } from './RenameRoom.js';
export { CreateTemplateHandler, type CreateTemplatePayload } from './CreateTemplate.js';
export {
  BulkAutoClassifyRoomsHandler,
  type BulkAutoClassifyRoomsPayload,
  type BulkAutoClassifyRoomsPatch,
} from './BulkAutoClassifyRooms.js';
