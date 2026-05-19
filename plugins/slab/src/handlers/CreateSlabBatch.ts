// CreateSlabBatchHandler — create multiple slabs atomically in one command (§A27).
//
// `slab.batch.create` — batch-creates an arbitrary list of slabs whose specs
// are fully resolved by the caller.  Designed for AI-generated batches
// (e.g. CreateSlabsOnAllFloorsCommand migration path) and for any tool that
// needs to commit N slabs in one undo-stack entry.
//
// PAYLOAD SHAPE
//   • `slabs` — one CreateSlabPayload per slab to create.  The same
//     per-slab validation rules as CreateSlabHandler apply to each entry.
//   • `levelId` — default levelId applied to any slab whose payload does
//     not supply its own `levelId`.  Optional; slabs without a levelId (and
//     no default supplied) store an empty string (S07 allowance).
//
// UNDO: a single Immer batch produces ONE forward + ONE inverse patch for
// the whole set — undoing a "batch create slabs" gesture is one stack pop,
// not N pops.
//
// VALIDATION strategy mirrors CreateSlabHandler:
//   • Per-slab `thickness`, `boundary`, `baseOffset`, and `holes` bounds
//     checked at canExecute time.
//   • Schema-level parse failures surface as SlabSchemaError (thrown outward
//     so the bus does NOT push a partial batch to the undo stack).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { Slab, createId } from '@pryzm/plugin-sdk';
import {
  SlabBoundaryError,
  SlabSchemaError,
  SlabThicknessError,
} from '../errors.js';
import type { SlabData, SlabsState } from '../store.js';
import { validateSlabBoundary } from '../intent.js';
import type { CreateSlabPayload } from './CreateSlab.js';

export interface CreateSlabBatchPayload {
  /** One spec per slab to create.  Must be a non-empty array. */
  readonly slabs: readonly CreateSlabPayload[];
  /** Default levelId applied to any slab entry that omits its own `levelId`.
   *  Optional — slabs with no levelId and no batch-level default store `''`
   *  (S07 allowance; 1C tightens this to a non-empty branded id). */
  readonly levelId?: string;
}

type SlabHandlerStores = Readonly<{ slab: SlabsState } & Record<string, unknown>>;

export class CreateSlabBatchHandler
  implements CommandHandler<CreateSlabBatchPayload, SlabHandlerStores>
{
  readonly type = 'slab.batch.create';
  readonly affectedStores = ['slab'] as const;

  canExecute(
    _ctx: HandlerContext<SlabHandlerStores>,
    cmd: CreateSlabBatchPayload,
  ): ValidationResult {
    if (!Array.isArray(cmd.slabs) || cmd.slabs.length === 0) {
      return { valid: false, reason: 'slabs must be a non-empty array' };
    }
    for (let i = 0; i < cmd.slabs.length; i++) {
      const s = cmd.slabs[i]!;
      if (s.thickness !== undefined && (!Number.isFinite(s.thickness) || s.thickness <= 0)) {
        return { valid: false, reason: `slabs[${i}].thickness must be > 0` };
      }
      if (s.baseOffset !== undefined && !Number.isFinite(s.baseOffset)) {
        return { valid: false, reason: `slabs[${i}].baseOffset must be a finite number` };
      }
      if (s.id !== undefined && (typeof s.id !== 'string' || s.id.length === 0)) {
        return { valid: false, reason: `slabs[${i}].id must be a non-empty string when provided` };
      }
      if (s.boundary !== undefined) {
        const v = validateSlabBoundary(s.boundary);
        if (!v.ok) return { valid: false, reason: `slabs[${i}].boundary: ${v.reason ?? 'invalid'}` };
      }
      if (s.holes !== undefined) {
        for (let h = 0; h < s.holes.length; h++) {
          const v = validateSlabBoundary(s.holes[h]!);
          if (!v.ok) {
            return { valid: false, reason: `slabs[${i}].holes[${h}]: ${v.reason ?? 'invalid hole'}` };
          }
        }
      }
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<SlabHandlerStores>, cmd: CreateSlabBatchPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      const defaultLevelId = cmd.levelId ?? '';
      const fresh: SlabData[] = [];

      for (let i = 0; i < cmd.slabs.length; i++) {
        const s = cmd.slabs[i]!;
        const id = (s.id ?? createId('slab')) as SlabData['id'];

        // Race-defensive thickness re-check (store may mutate between canExecute
        // and execute in a concurrent session).
        const thickness = s.thickness ?? 0.2;
        if (thickness <= 0) {
          throw new SlabThicknessError(thickness);
        }

        if (s.boundary !== undefined) {
          const v = validateSlabBoundary(s.boundary);
          if (!v.ok) throw new SlabBoundaryError(v.reason ?? 'invalid');
        }
        if (s.holes !== undefined) {
          for (let h = 0; h < s.holes.length; h++) {
            const v = validateSlabBoundary(s.holes[h]!);
            if (!v.ok) throw new SlabBoundaryError(`hole[${h}]: ${v.reason ?? 'invalid'}`);
          }
        }

        let slab: SlabData;
        try {
          slab = Slab.parse({
            id,
            levelId: s.levelId ?? defaultLevelId,
            thickness,
            baseOffset: s.baseOffset ?? 0,
            holes: s.holes ?? [],
            ...(s.boundary !== undefined ? { boundary: s.boundary } : {}),
            ...(s.materialId !== undefined ? { materialId: s.materialId } : {}),
            ...(s.materialColor !== undefined ? { materialColor: s.materialColor } : {}),
            ...(s.systemTypeId !== undefined ? { systemTypeId: s.systemTypeId } : {}),
          }) as SlabData;
        } catch (parseErr) {
          throw new SlabSchemaError(
            new Error(`slab.batch.create — slabs[${i}] (id=${id})`, { cause: parseErr as Error }),
          );
        }

        fresh.push(slab);
      }

      // One Immer batch for the whole set — single undo-stack entry.
      const [next, forward, inverse] = produceCommand<SlabsState>(ctx.stores.slab, draft => {
        for (const s of fresh) draft[s.id] = s;
      });

      return { forward, inverse, nextStates: { slab: next } };
    }); // withHandlerSpan — C10 §2
  }
}
