// CreateWallOpeningHandler — add a host opening to a wall (S10-T4).
//
// Mirrors `src/commands/walls/CreateWallOpeningCommand.ts:267`.  The
// HOSTING wall is the only store this handler writes (door/window
// stores are owned by their own plugins — S11).  This is the wall-side
// half of the door/window create choreography:
//
//   1) Door plugin calls `wall.createOpening { wallId, opening }` to
//      reserve the host slot — this handler.
//   2) Door plugin calls `door.create { wallId, openingId }` to mint
//      the door element itself — handled in S11 by `plugins/door`.
//
// The two commands are dispatched as a single bus transaction by the
// door tool (S11); undo of the door cmd cascades back to undo of the
// opening reservation per the L4 cascade infra (S10-T6).
//
// VALIDATION:
//   • Opening payload checked against the schema's `Opening` shape:
//     non-empty id, type ∈ {window, door}, offset ≥ 0, width > 0,
//     height > 0, sillHeight ≥ 0, non-empty elementId.
//   • Occupancy checked via `WallOccupancyStore.canPlace` — handler
//     surfaces the conflicting ids in the error reason.
//   • The Wall schema's refine (3) requires `childrenIds ⊇
//     openings[*].elementId` — the handler adds `elementId` to
//     `childrenIds` in the same Immer draft (one atomic step).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { WallNotFoundError, WallSystemError } from '../errors.js';
import type { WallData, WallsState } from '../store.js';
import { wallOccupancyStore } from '../occupancy.js';

type Opening = WallData['openings'][number];

export interface CreateWallOpeningPayload {
  readonly wallId: string;
  readonly opening: Opening;
}

type WallHandlerStores = Readonly<{ wall: WallsState } & Record<string, unknown>>;

export class WallOpeningOverlapError extends WallSystemError {
  public readonly conflictIds: readonly string[];
  constructor(message: string, conflictIds: readonly string[]) {
    super(message, 'WallOpeningOverlapError');
    this.conflictIds = conflictIds;
  }
}

function validateOpeningShape(o: unknown):
  | { valid: true; opening: Opening }
  | { valid: false; reason: string }
{
  if (typeof o !== 'object' || o === null) {
    return { valid: false, reason: 'opening must be an object' };
  }
  const r = o as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id.length === 0) {
    return { valid: false, reason: 'opening.id must be a non-empty string' };
  }
  if (r.type !== 'window' && r.type !== 'door') {
    return { valid: false, reason: "opening.type must be 'window' or 'door'" };
  }
  if (typeof r.offset !== 'number' || !Number.isFinite(r.offset) || r.offset < 0) {
    return { valid: false, reason: 'opening.offset must be a finite number ≥ 0' };
  }
  if (typeof r.width !== 'number' || !Number.isFinite(r.width) || r.width <= 0) {
    return { valid: false, reason: 'opening.width must be a finite number > 0' };
  }
  if (typeof r.height !== 'number' || !Number.isFinite(r.height) || r.height <= 0) {
    return { valid: false, reason: 'opening.height must be a finite number > 0' };
  }
  if (typeof r.sillHeight !== 'number' || !Number.isFinite(r.sillHeight) || r.sillHeight < 0) {
    return { valid: false, reason: 'opening.sillHeight must be a finite number ≥ 0' };
  }
  if (typeof r.elementId !== 'string' || r.elementId.length === 0) {
    return { valid: false, reason: 'opening.elementId must be a non-empty string' };
  }
  return { valid: true, opening: r as unknown as Opening };
}

export class CreateWallOpeningHandler
  implements CommandHandler<CreateWallOpeningPayload, WallHandlerStores>
{
  readonly type = 'wall.createOpening';
  readonly affectedStores = ['wall'] as const;

  canExecute(
    ctx: HandlerContext<WallHandlerStores>,
    cmd: CreateWallOpeningPayload,
  ): ValidationResult {
    if (typeof cmd.wallId !== 'string' || cmd.wallId.length === 0) {
      return { valid: false, reason: 'wallId must be a non-empty string' };
    }
    const shape = validateOpeningShape(cmd.opening);
    if (!shape.valid) return { valid: false, reason: shape.reason };

    const wall = ctx.stores.wall[cmd.wallId];
    if (wall === undefined) {
      return { valid: false, reason: `wall not found: ${cmd.wallId}` };
    }
    // Reject duplicate ids before the occupancy check so the reason
    // surfaces the right cause.
    if ((wall.openings ?? []).some((o) => o.id === shape.opening.id)) {
      return { valid: false, reason: `opening id already exists on wall: ${shape.opening.id}` };
    }
    const occ = wallOccupancyStore.canPlace(
      wall,
      shape.opening.offset,
      shape.opening.width,
    );
    if (!occ.valid) {
      return { valid: false, reason: occ.reason ?? 'opening placement rejected' };
    }
    return { valid: true };
  }

  execute(
    ctx: HandlerContext<WallHandlerStores>,
    cmd: CreateWallOpeningPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const wall = ctx.stores.wall[cmd.wallId];
    if (wall === undefined) throw new WallNotFoundError(cmd.wallId);

    // Race-defensive re-check (occupancy could have changed between gate
    // and execute if a concurrent command landed).  Throw OUTWARD with
    // a typed error so the bus skips the undo push.
    const occ = wallOccupancyStore.canPlace(wall, cmd.opening.offset, cmd.opening.width);
    if (!occ.valid) {
      throw new WallOpeningOverlapError(
        occ.reason ?? `opening overlap on wall ${cmd.wallId}`,
        occ.conflictIds,
      );
    }

    const opening: Opening = {
      ...cmd.opening,
    };

    const [next, forward, inverse] = produceCommand<WallsState>(ctx.stores.wall, draft => {
      const w = draft[cmd.wallId];
      if (w === undefined) return;
      w.openings = [...(w.openings ?? []), opening];
      // Schema refine (3): childrenIds MUST be a superset.
      if (!w.childrenIds.includes(opening.elementId)) {
        w.childrenIds = [...w.childrenIds, opening.elementId];
      }
    });
    return { forward, inverse, nextStates: { wall: next } };
    }); // withHandlerSpan — C10 §2
  }
}
