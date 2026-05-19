// CreateDoorHandler — mint a new door (S11-T1).
//
// Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S11 line 1190:
//   "plugins/door/store.ts + 6 handlers ... Door's affectedStores:
//    ['door', 'wall'] — wall because doors mutate wall.openings[]."
//
// IMPLEMENTATION NOTE.  We follow the *actual* PRYZM 2 architecture
// established by `plugins/wall/handlers/CreateWallOpening.ts`: cross-
// store mutation lives in TWO commands, not one.  The door tool
// dispatches:
//
//     bus.executeCommand('wall.createOpening', { wallId, opening: { ... } });
//     bus.executeCommand('door.create',         { wallId, openingId, ... });
//
// Each handler declares only its own store.  This preserves K1B-2
// (plugin owns its store) and lets each command's undo step be atomic
// — the L4 cascade infra (S10) chains them so undoing the door also
// undoes the opening reservation.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { Door, createId } from '@pryzm/plugin-sdk';
import {
  DoorSchemaError,
  DoorDimensionsError,
  DoorTypeNotFoundError,
} from '../errors.js';
import type { DoorData, DoorsState } from '../store.js';
import { getDoorType } from '@pryzm/plugin-sdk';

export interface CreateDoorPayload {
  /** Host wall id — branded `WallId`. */
  readonly wallId: string;
  /** Opening id reserved by a previous `wall.createOpening`.  Stored on
   *  the door so the cascade (slabs/levels/etc.) can find the door from
   *  the wall side. */
  readonly openingId: string;
  /** Optional caller-provided id (test fixtures). */
  readonly id?: string;
  /** Distance along the host wall baseline from start, in metres. */
  readonly offset?: number;
  readonly width?: number;
  readonly height?: number;
  readonly sillHeight?: number;
  readonly doorType?: DoorData['doorType'];
  readonly systemTypeId?: string;
  readonly frameThickness?: number;
  readonly frameWidth?: number;
  readonly frameColor?: string;
  readonly leafColor?: string;
  readonly fireRating?: string;
  readonly accessibilityType?: string;
}

type DoorHandlerStores = Readonly<{ door: DoorsState } & Record<string, unknown>>;

export class CreateDoorHandler
  implements CommandHandler<CreateDoorPayload, DoorHandlerStores>
{
  readonly type = 'door.create';
  readonly affectedStores = ['door'] as const;

  canExecute(_ctx: HandlerContext<DoorHandlerStores>, cmd: CreateDoorPayload): ValidationResult {
    if (typeof cmd.wallId !== 'string' || cmd.wallId.length === 0) {
      return { valid: false, reason: 'wallId must be a non-empty string' };
    }
    if (typeof cmd.openingId !== 'string' || cmd.openingId.length === 0) {
      return { valid: false, reason: 'openingId must be a non-empty string' };
    }
    if (cmd.width !== undefined && (!Number.isFinite(cmd.width) || cmd.width <= 0)) {
      return { valid: false, reason: 'width must be > 0' };
    }
    if (cmd.height !== undefined && (!Number.isFinite(cmd.height) || cmd.height <= 0)) {
      return { valid: false, reason: 'height must be > 0' };
    }
    if (cmd.offset !== undefined && (!Number.isFinite(cmd.offset) || cmd.offset < 0)) {
      return { valid: false, reason: 'offset must be ≥ 0' };
    }
    if (
      cmd.sillHeight !== undefined &&
      (!Number.isFinite(cmd.sillHeight) || cmd.sillHeight < 0)
    ) {
      return { valid: false, reason: 'sillHeight must be ≥ 0' };
    }
    if (cmd.systemTypeId !== undefined && cmd.systemTypeId.length > 0) {
      if (!getDoorType(cmd.systemTypeId)) {
        return {
          valid: false,
          reason: `door type not found: ${cmd.systemTypeId}`,
        };
      }
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<DoorHandlerStores>, cmd: CreateDoorPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    // Resolve type defaults if a known systemTypeId was supplied.
    const typeDefaults = cmd.systemTypeId ? getDoorType(cmd.systemTypeId) : undefined;
    if (cmd.systemTypeId && !typeDefaults) {
      throw new DoorTypeNotFoundError(cmd.systemTypeId);
    }

    const id = (cmd.id ?? createId('door')) as DoorData['id'];
    const seed: Partial<DoorData> = {
      id,
      wallId: cmd.wallId as DoorData['wallId'],
      openingId: cmd.openingId,
      doorType: cmd.doorType ?? 'single',
      width: cmd.width ?? typeDefaults?.width ?? 0.9,
      height: cmd.height ?? typeDefaults?.height ?? 2.1,
      sillHeight: cmd.sillHeight ?? 0,
      offset: cmd.offset ?? 0,
      frameThickness: cmd.frameThickness ?? typeDefaults?.frameThickness ?? 0.05,
      frameWidth: cmd.frameWidth ?? typeDefaults?.frameWidth ?? 0.05,
      frameColor: cmd.frameColor ?? typeDefaults?.frameColor,
      leafColor: cmd.leafColor ?? typeDefaults?.leafColor,
      fireRating: cmd.fireRating ?? typeDefaults?.fireRating,
      accessibilityType: cmd.accessibilityType ?? typeDefaults?.accessibility,
    };

    let door: DoorData;
    try {
      door = Door.parse(seed);
    } catch (err) {
      throw new DoorSchemaError(err);
    }

    if (door.frameWidth * 2 > door.width) {
      throw new DoorDimensionsError('frameWidth must not exceed half the leaf width');
    }

    const [next, forward, inverse] = produceCommand<DoorsState>(ctx.stores.door, (draft) => {
      draft[door.id] = door;
    });

    return { forward, inverse, nextStates: { door: next } };
    }); // withHandlerSpan — C10 §2
  }
}
