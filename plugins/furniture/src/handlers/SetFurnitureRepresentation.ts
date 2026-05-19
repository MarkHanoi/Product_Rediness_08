// SetFurnitureRepresentationHandler — install/replace one per-LOD
// representation (S27 / ADR-0027 §2 + §4).
//
// Used by:
//   • the placement tool, immediately after `furniture.create`, to copy
//     each LOD slot from the catalogue entry,
//   • the dynamic editor (S58), to overwrite a single LOD when the user
//     edits an authoring-time geometry.
//
// Pass `representation: undefined` to clear a slot.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { FurnitureNotFoundError, FurnitureLodError, FurnitureSchemaError } from '../errors.js';
import { FurnitureRepresentation } from '@pryzm/plugin-sdk';
import type { FurnitureData, FurnituresState } from '../store.js';
import { isValidLod } from '../intent.js';

type LodKey = '0' | '1' | '2' | '3' | '4';

export interface SetFurnitureRepresentationPayload {
  readonly furnitureId: string;
  readonly lod: FurnitureData['activeLod'];
  /** When omitted, the slot is cleared. */
  readonly representation?: FurnitureData['representations'][LodKey];
}

type Stores = Readonly<{ furniture: FurnituresState } & Record<string, unknown>>;

export class SetFurnitureRepresentationHandler
  implements CommandHandler<SetFurnitureRepresentationPayload, Stores>
{
  readonly type = 'furniture.setRepresentation';
  readonly affectedStores = ['furniture'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: SetFurnitureRepresentationPayload): ValidationResult {
    if (typeof cmd.furnitureId !== 'string' || cmd.furnitureId.length === 0) {
      return { valid: false, reason: 'furnitureId must be a non-empty string' };
    }
    if (!isValidLod(cmd.lod)) {
      return { valid: false, reason: 'lod must be one of {0,1,2,3,4}' };
    }
    if (!ctx.stores.furniture[cmd.furnitureId]) {
      return { valid: false, reason: `furniture not found: ${cmd.furnitureId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: SetFurnitureRepresentationPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.furniture[cmd.furnitureId]) throw new FurnitureNotFoundError(cmd.furnitureId);
    if (!isValidLod(cmd.lod)) throw new FurnitureLodError(cmd.lod);

    let parsed: FurnitureData['representations'][LodKey] | undefined;
    if (cmd.representation !== undefined) {
      try { parsed = FurnitureRepresentation.parse(cmd.representation); }
      catch (err) { throw new FurnitureSchemaError(err); }
    }

    const key = String(cmd.lod) as LodKey;
    const [next, forward, inverse] = produceCommand<FurnituresState>(ctx.stores.furniture, (draft) => {
      const f = draft[cmd.furnitureId];
      if (!f) return;
      if (parsed === undefined) {
        delete f.representations[key];
      } else {
        f.representations[key] = parsed;
      }
    });
    return { forward, inverse, nextStates: { furniture: next } };
    }); // withHandlerSpan — C10 §2
  }
}
