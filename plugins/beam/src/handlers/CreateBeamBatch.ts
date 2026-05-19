// CreateBeamBatchHandler — create multiple beams atomically in one command (§A28).
//
// `beam.batch.create` — batch-creates an arbitrary list of beams whose specs
// are fully resolved by the caller.  Designed for AI structural-layout
// batches (e.g. grid-based beam placement) and any tool that needs to commit
// N beams as one undo-stack entry.
//
// PAYLOAD SHAPE
//   • `beams` — one CreateBeamPayload per beam.  Same per-entry validation
//     rules as CreateBeamHandler apply.
//   • `levelId` — default levelId applied to any entry that omits its own.
//     Optional; entries without a levelId store `''` (S07 allowance).
//
// UNDO: a single Immer batch produces ONE forward + ONE inverse patch —
// undoing a "batch create beams" gesture is one stack pop, not N pops.
//
// VALIDATION strategy mirrors CreateBeamHandler:
//   • Per-entry baseLine endpoints, width, depth bounds checked at
//     canExecute time.
//   • Schema failures surface as BeamSchemaError (thrown so the bus does
//     NOT push a partial batch to the undo stack).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { Beam, createId } from '@pryzm/plugin-sdk';
import { BeamGeometryError, BeamSchemaError } from '../errors.js';
import type { BeamData, BeamsState } from '../store.js';
import { isFiniteVec3, isNonZeroBaseLine } from '../intent.js';
import type { CreateBeamPayload } from './CreateBeam.js';

export interface CreateBeamBatchPayload {
  /** One spec per beam to create.  Must be a non-empty array. */
  readonly beams: readonly CreateBeamPayload[];
  /** Default levelId applied to any entry that omits its own `levelId`.
   *  Optional — entries with no levelId and no batch-level default store `''`
   *  (S07 allowance). */
  readonly levelId?: string;
}

type BeamHandlerStores = Readonly<{ beam: BeamsState } & Record<string, unknown>>;

export class CreateBeamBatchHandler
  implements CommandHandler<CreateBeamBatchPayload, BeamHandlerStores>
{
  readonly type = 'beam.batch.create';
  readonly affectedStores = ['beam'] as const;

  canExecute(
    _ctx: HandlerContext<BeamHandlerStores>,
    cmd: CreateBeamBatchPayload,
  ): ValidationResult {
    if (!Array.isArray(cmd.beams) || cmd.beams.length === 0) {
      return { valid: false, reason: 'beams must be a non-empty array' };
    }
    for (let i = 0; i < cmd.beams.length; i++) {
      const b = cmd.beams[i]!;
      if (b.id !== undefined && (typeof b.id !== 'string' || b.id.length === 0)) {
        return { valid: false, reason: `beams[${i}].id must be a non-empty string when provided` };
      }
      if (b.baseLine !== undefined) {
        const [a, bPt] = b.baseLine;
        if (!isFiniteVec3(a) || !isFiniteVec3(bPt)) {
          return { valid: false, reason: `beams[${i}].baseLine endpoints must be finite Vec3` };
        }
        if (!isNonZeroBaseLine(a, bPt)) {
          return { valid: false, reason: `beams[${i}].baseLine endpoints must differ` };
        }
      }
      if (b.width !== undefined && (!Number.isFinite(b.width) || b.width <= 0)) {
        return { valid: false, reason: `beams[${i}].width must be > 0` };
      }
      if (b.depth !== undefined && (!Number.isFinite(b.depth) || b.depth <= 0)) {
        return { valid: false, reason: `beams[${i}].depth must be > 0` };
      }
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<BeamHandlerStores>, cmd: CreateBeamBatchPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      const defaultLevelId = cmd.levelId ?? '';
      const fresh: BeamData[] = [];

      for (let i = 0; i < cmd.beams.length; i++) {
        const b = cmd.beams[i]!;
        const id = (b.id ?? createId('beam')) as BeamData['id'];

        // Race-defensive baseLine geometry re-check.
        if (b.baseLine !== undefined) {
          const [a, bPt] = b.baseLine;
          if (!isNonZeroBaseLine(a, bPt)) {
            throw new BeamGeometryError(`beams[${i}] baseLine endpoints must differ`);
          }
        }

        const seed: Partial<BeamData> = {
          id,
          levelId: b.levelId ?? defaultLevelId,
          shape: b.shape ?? 'rectangular',
          width: b.width ?? 0.2,
          depth: b.depth ?? 0.4,
          rotation: b.rotation ?? 0,
          materialId: b.materialId ?? b.systemTypeId,
        };
        if (b.baseLine !== undefined) seed.baseLine = b.baseLine;

        let beam: BeamData;
        try {
          beam = Beam.parse(seed) as BeamData;
        } catch (parseErr) {
          throw new BeamSchemaError(
            new Error(`beam.batch.create — beams[${i}] (id=${id})`, { cause: parseErr as Error }),
          );
        }

        fresh.push(beam);
      }

      // One Immer batch for the whole set — single undo-stack entry.
      const [next, forward, inverse] = produceCommand<BeamsState>(ctx.stores.beam, draft => {
        for (const b of fresh) draft[b.id] = b;
      });

      return { forward, inverse, nextStates: { beam: next } };
    }); // withHandlerSpan — C10 §2
  }
}
