// CreateDoorBatchHandler — create multiple doors atomically in one command (§A28).
//
// `door.batch.create` — batch-creates an arbitrary list of doors whose specs
// are fully resolved by the caller.  Designed for AI floor-plan placement
// batches (e.g. AI places N doors across walls in one operation) and for any
// tool that needs to commit N doors as one undo-stack entry.
//
// PAYLOAD SHAPE
//   • `doors` — one CreateDoorPayload per door.  Same per-entry validation
//     rules as CreateDoorHandler apply to each entry.
//   • Each entry MUST supply its own `wallId` and `openingId` — the opening
//     must be reserved via `wall.createOpening` before this dispatch.  The
//     batch handler writes only to the door store; wall mutation is
//     responsibility of the caller (C11 §5.2: single-store handlers).
//
// UNDO: a single Immer batch produces ONE forward + ONE inverse patch for the
// whole set — undoing a "batch create doors" gesture is one stack pop, not N.
//
// VALIDATION strategy mirrors CreateDoorHandler:
//   • Per-entry `wallId`, `openingId` presence + dimension bounds checked at
//     `canExecute` time.
//   • Schema failures surface as DoorSchemaError (thrown so the bus does NOT
//     push a partial batch to the undo stack).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { Door, createId, getDoorType } from '@pryzm/plugin-sdk';
import {
  DoorDimensionsError,
  DoorSchemaError,
  DoorTypeNotFoundError,
} from '../errors.js';
import type { DoorData, DoorsState } from '../store.js';
import type { CreateDoorPayload } from './CreateDoor.js';

export interface CreateDoorBatchPayload {
  /** One spec per door to create.  Must be a non-empty array.
   *  Each entry must carry its own `wallId` and `openingId`. */
  readonly doors: readonly CreateDoorPayload[];
}

type DoorHandlerStores = Readonly<{ door: DoorsState } & Record<string, unknown>>;

export class CreateDoorBatchHandler
  implements CommandHandler<CreateDoorBatchPayload, DoorHandlerStores>
{
  readonly type = 'door.batch.create';
  readonly affectedStores = ['door'] as const;

  canExecute(
    _ctx: HandlerContext<DoorHandlerStores>,
    cmd: CreateDoorBatchPayload,
  ): ValidationResult {
    if (!Array.isArray(cmd.doors) || cmd.doors.length === 0) {
      return { valid: false, reason: 'doors must be a non-empty array' };
    }
    for (let i = 0; i < cmd.doors.length; i++) {
      const d = cmd.doors[i]!;
      if (typeof d.wallId !== 'string' || d.wallId.length === 0) {
        return { valid: false, reason: `doors[${i}].wallId must be a non-empty string` };
      }
      if (typeof d.openingId !== 'string' || d.openingId.length === 0) {
        return { valid: false, reason: `doors[${i}].openingId must be a non-empty string` };
      }
      if (d.id !== undefined && (typeof d.id !== 'string' || d.id.length === 0)) {
        return { valid: false, reason: `doors[${i}].id must be a non-empty string when provided` };
      }
      if (d.width !== undefined && (!Number.isFinite(d.width) || d.width <= 0)) {
        return { valid: false, reason: `doors[${i}].width must be > 0` };
      }
      if (d.height !== undefined && (!Number.isFinite(d.height) || d.height <= 0)) {
        return { valid: false, reason: `doors[${i}].height must be > 0` };
      }
      if (d.systemTypeId !== undefined && d.systemTypeId.length > 0) {
        if (!getDoorType(d.systemTypeId)) {
          return { valid: false, reason: `doors[${i}]: door type not found: ${d.systemTypeId}` };
        }
      }
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<DoorHandlerStores>, cmd: CreateDoorBatchPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      const fresh: DoorData[] = [];

      for (let i = 0; i < cmd.doors.length; i++) {
        const d = cmd.doors[i]!;
        const typeDefaults = d.systemTypeId ? getDoorType(d.systemTypeId) : undefined;
        if (d.systemTypeId && !typeDefaults) {
          throw new DoorTypeNotFoundError(d.systemTypeId);
        }

        const id = (d.id ?? createId('door')) as DoorData['id'];
        const seed: Partial<DoorData> = {
          id,
          wallId: d.wallId as DoorData['wallId'],
          openingId: d.openingId,
          doorType: d.doorType ?? 'single',
          width: d.width ?? typeDefaults?.width ?? 0.9,
          height: d.height ?? typeDefaults?.height ?? 2.1,
          sillHeight: d.sillHeight ?? 0,
          offset: d.offset ?? 0,
          frameThickness: d.frameThickness ?? typeDefaults?.frameThickness ?? 0.05,
          frameWidth: d.frameWidth ?? typeDefaults?.frameWidth ?? 0.05,
          frameColor: d.frameColor ?? typeDefaults?.frameColor,
          leafColor: d.leafColor ?? typeDefaults?.leafColor,
          fireRating: d.fireRating ?? typeDefaults?.fireRating,
          accessibilityType: d.accessibilityType ?? typeDefaults?.accessibility,
        };

        let door: DoorData;
        try {
          door = Door.parse(seed) as DoorData;
        } catch (parseErr) {
          throw new DoorSchemaError(
            new Error(`door.batch.create — doors[${i}] (id=${id})`, { cause: parseErr as Error }),
          );
        }

        if (door.frameWidth * 2 > door.width) {
          throw new DoorDimensionsError(`doors[${i}]: frameWidth must not exceed half the leaf width`);
        }

        fresh.push(door);
      }

      // One Immer batch for the whole set — single undo-stack entry.
      const [next, forward, inverse] = produceCommand<DoorsState>(ctx.stores.door, draft => {
        for (const d of fresh) draft[d.id] = d;
      });

      return { forward, inverse, nextStates: { door: next } };
    }); // withHandlerSpan — C10 §2
  }
}
