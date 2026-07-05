// CreateFurnitureBatchHandler — create N furniture instances atomically (§FIX-FURNISH-BATCH-PERF, L-100).
//
// `furniture.batch.create` — the batch sibling of `furniture.create`. The
// auto-furnish path (D-FLE, apps/editor FurnishLayoutExecutor) previously
// dispatched ONE `furniture.create` per placed item, so furnishing a whole
// apartment ran N separate `produceCommand`s — each an Immer draft + structural
// snapshot that is O(store size), giving an O(N²) cost that made "furnish all"
// slow. This handler collapses the whole set into ONE `produceCommand` → ONE
// forward + ONE inverse patch → ONE undo-stack entry.
//
// PAYLOAD SHAPE
//   • `furniture` — one entry per item to create. Entries carry the LEGACY
//     furniture-create fields (furnitureType / position / width / … + a
//     pre-minted `id`) that the §FT-FURNITURE bridge (initTools.ts) reads to
//     build the 3D mesh + plan symbol. The PRYZM3 furniture record this handler
//     writes is a stub (mirrors CreateFurnitureHandler, which also ignores the
//     legacy fields); the CommandEventBridge `furniture.batch.create` case fans
//     out one `furniture.created` per entry so the render path is byte-identical
//     to the single-create path.
//   • `levelId` — default levelId applied to any entry that omits its own.
//
// Mirrors CreateWallBatch / CreateSlabBatch (P2c / §A27). Schema-parse failures
// throw outward so the bus never pushes a partial batch to the undo stack.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { Furniture, createId } from '@pryzm/plugin-sdk';
import { FurnitureSchemaError } from '../errors.js';
import type { FurnitureData, FurnituresState } from '../store.js';
import { isFiniteVec3, isValidLod, isValidScale } from '../intent.js';
import type { CreateFurniturePayload } from './CreateFurniture.js';

/** A batch entry accepts the PRYZM3 furniture fields (origin/size/…) AND the
 *  legacy furnish fields (furnitureType/position/width/…). Only the PRYZM3
 *  fields shape the stored record; the legacy fields ride through to the
 *  CommandEventBridge fan-out. */
export interface CreateFurnitureBatchEntry extends CreateFurniturePayload {
  /** Legacy furnish position (world XZ + floor datum Y). Mapped to `origin`
   *  when no explicit `origin` is supplied, so the PRYZM3 record still carries
   *  a location. */
  readonly position?: FurnitureData['origin'];
  readonly furnitureType?: string;
  readonly [k: string]: unknown;
}

export interface CreateFurnitureBatchPayload {
  /** One spec per item to create. Must be a non-empty array. */
  readonly furniture: readonly CreateFurnitureBatchEntry[];
  /** Default levelId applied to any entry that omits its own `levelId`. */
  readonly levelId?: string;
}

type Stores = Readonly<{ furniture: FurnituresState } & Record<string, unknown>>;

export class CreateFurnitureBatchHandler
  implements CommandHandler<CreateFurnitureBatchPayload, Stores>
{
  readonly type = 'furniture.batch.create';
  readonly affectedStores = ['furniture'] as const;

  canExecute(_ctx: HandlerContext<Stores>, cmd: CreateFurnitureBatchPayload): ValidationResult {
    if (!Array.isArray(cmd.furniture) || cmd.furniture.length === 0) {
      return { valid: false, reason: 'furniture must be a non-empty array' };
    }
    for (let i = 0; i < cmd.furniture.length; i++) {
      const f = cmd.furniture[i]!;
      const origin = f.origin ?? f.position;
      if (origin !== undefined && !isFiniteVec3(origin)) {
        return { valid: false, reason: `furniture[${i}].origin/position must have finite x, y, z` };
      }
      if (f.rotation !== undefined && !Number.isFinite(f.rotation)) {
        return { valid: false, reason: `furniture[${i}].rotation must be finite` };
      }
      if (f.scale !== undefined && !isValidScale(f.scale)) {
        return { valid: false, reason: `furniture[${i}].scale must be > 0 and finite` };
      }
      if (f.activeLod !== undefined && !isValidLod(f.activeLod)) {
        return { valid: false, reason: `furniture[${i}].activeLod must be one of {0,1,2,3,4}` };
      }
      if (f.size !== undefined && !isFiniteVec3(f.size)) {
        return { valid: false, reason: `furniture[${i}].size override must have finite x, y, z` };
      }
      if (f.id !== undefined && (typeof f.id !== 'string' || f.id.length === 0)) {
        return { valid: false, reason: `furniture[${i}].id must be a non-empty string when provided` };
      }
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: CreateFurnitureBatchPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      const defaultLevelId = cmd.levelId ?? '';
      const fresh: FurnitureData[] = [];

      for (let i = 0; i < cmd.furniture.length; i++) {
        const cmdF = cmd.furniture[i]!;
        const id = (cmdF.id ?? createId('furniture')) as FurnitureData['id'];
        const seed: Partial<FurnitureData> = {
          id,
          levelId: cmdF.levelId ?? defaultLevelId,
          catalogId: cmdF.catalogId ?? '',
          // Map the legacy furnish `position` to `origin` when no explicit origin
          // is supplied — keeps the PRYZM3 record location-aware (harmless; the
          // single CreateFurnitureHandler defaults origin to {0,0,0}).
          origin: cmdF.origin ?? cmdF.position ?? { x: 0, y: 0, z: 0 },
          rotation: cmdF.rotation ?? 0,
          scale: cmdF.scale ?? 1,
          size: cmdF.size,
          activeLod: cmdF.activeLod ?? 2,
          representations: cmdF.representations ?? {},
          materialSlots: cmdF.materialSlots ?? {},
          materialId: cmdF.materialId,
        };

        let f: FurnitureData;
        try { f = Furniture.parse(seed); }
        catch (err) {
          throw new FurnitureSchemaError(
            new Error(`furniture.batch.create — furniture[${i}] (id=${id})`, { cause: err as Error }),
          );
        }
        fresh.push(f);
      }

      // One Immer batch for the whole set — single undo-stack entry (O(N), not O(N²)).
      const [next, forward, inverse] = produceCommand<FurnituresState>(ctx.stores.furniture, (draft) => {
        for (const f of fresh) draft[f.id] = f;
      });
      return { forward, inverse, nextStates: { furniture: next } };
    }); // withHandlerSpan — C10 §2
  }
}
