// SetWallSystemTypeHandler — re-bind a wall to a catalogue system-type
// AND materialise the resolved `layers[]` into the store (S10-T3).
//
// Mirrors `src/commands/walls/UpdateWallSystemTypeCommand.ts:72`.
//
// CONTRACT (per S08 producer-input contract):  the producer sees only
// resolved layers — handler-time materialisation keeps the producer
// purely synchronous (`code-level ADR docs/architecture/adr/0009-wall-producer-signature.md`).
// On rebind we therefore (a) write the new `systemTypeId`, AND (b)
// overwrite the wall's `layers[]` array with a deep clone of the
// catalogue layers, AND (c) recompute `thickness` from layer-sum.
//
// SPECIAL CASE — `systemTypeId === null` clears the rebind, removing
// both the catalogue reference AND the resolved `layers[]` field
// (returning the wall to a "monolithic" body with the existing
// `thickness` preserved).  This mirrors PRYZM 1's "Detach Type" UI.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import {
  WallNotFoundError,
  WallSystemTypeNotFoundError,
} from '../errors.js';
import type { WallsState, WallData } from '../store.js';
import type { WallSystemTypeStore } from '../system-type-store.js';

export interface SetWallSystemTypePayload {
  readonly id: string;
  /** New system-type id, or `null` to detach (clear `systemTypeId` and
   *  `layers[]`). */
  readonly systemTypeId: string | null;
}

type WallHandlerStores = Readonly<{ wall: WallsState } & Record<string, unknown>>;

export class SetWallSystemTypeHandler
  implements CommandHandler<SetWallSystemTypePayload, WallHandlerStores>
{
  readonly type = 'wall.setSystemType';
  readonly affectedStores = ['wall'] as const;

  /** The catalogue is REQUIRED for this handler — unlike `wall.create`
   *  which accepts an unset catalogue (S07-T8 fixtures don't wire one),
   *  rebinding is a direct catalogue lookup and would silently corrupt
   *  the wall if the catalogue is unset. */
  constructor(private readonly systemTypeStore: WallSystemTypeStore) {}

  canExecute(
    ctx: HandlerContext<WallHandlerStores>,
    cmd: SetWallSystemTypePayload,
  ): ValidationResult {
    if (typeof cmd.id !== 'string' || cmd.id.length === 0) {
      return { valid: false, reason: 'cmd.id must be a non-empty string' };
    }
    if (cmd.systemTypeId !== null) {
      if (typeof cmd.systemTypeId !== 'string' || cmd.systemTypeId.length === 0) {
        return { valid: false, reason: 'systemTypeId must be a non-empty string or null' };
      }
      if (!this.systemTypeStore.has(cmd.systemTypeId)) {
        return { valid: false, reason: `unknown systemTypeId: ${cmd.systemTypeId}` };
      }
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.wall, cmd.id)) {
      return { valid: false, reason: `wall not found: ${cmd.id}` };
    }
    return { valid: true };
  }

  execute(
    ctx: HandlerContext<WallHandlerStores>,
    cmd: SetWallSystemTypePayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const wall = ctx.stores.wall[cmd.id];
    if (wall === undefined) throw new WallNotFoundError(cmd.id);

    if (cmd.systemTypeId !== null && !this.systemTypeStore.has(cmd.systemTypeId)) {
      // Race: catalogue mutated between gate + execute.
      throw new WallSystemTypeNotFoundError(cmd.systemTypeId);
    }

    const [next, forward, inverse] = produceCommand<WallsState>(ctx.stores.wall, draft => {
      const w = draft[cmd.id];
      if (w === undefined) return;
      if (cmd.systemTypeId === null) {
        delete (w as { systemTypeId?: string }).systemTypeId;
        delete (w as { layers?: WallData['layers'] }).layers;
        return;
      }
      const type = this.systemTypeStore.get(cmd.systemTypeId);
      if (type === undefined) return;
      w.systemTypeId = type.id;
      w.layers = type.layers.map((l) => ({ ...l }));
      // Per `code-level ADR docs/architecture/adr/0009-wall-producer-signature.md`:
      // total wall thickness ALWAYS equals the sum of layer thicknesses
      // when a system-type is bound — keeps the inspector + producer in
      // agreement and avoids a stale-thickness assertion in the producer.
      w.thickness = type.totalThickness;
    });
    return { forward, inverse, nextStates: { wall: next } };
    }); // withHandlerSpan — C10 §2
  }
}
