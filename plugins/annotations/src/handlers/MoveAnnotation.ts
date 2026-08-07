// MoveAnnotationHandler — translate the anchor by `delta` (S34 / ADR-0026).
//
// Annotations carry a single `anchor: Vec3` (no leader points in the
// canonical schema), so move is a one-point translation.  Plan-view leader
// waypoints are derived per-frame in the renderer adapter; they don't move
// independently from the anchor.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type { AnnotationsState } from '@pryzm/plugin-sdk';
import { AnnotationNotFoundError } from '../errors.js';
import { mirrorRecordFor, sinkUpdate } from './canonicalAnnotationSink.js';
import { annotationStore } from '../subsystem/AnnotationStore.js';

export interface MoveAnnotationPayload {
  readonly annotationId: string;
  readonly delta: { readonly x: number; readonly y: number; readonly z: number };
}

type Stores = Readonly<{ annotation: AnnotationsState } & Record<string, unknown>>;

export class MoveAnnotationHandler
  implements CommandHandler<MoveAnnotationPayload, Stores>
{
  readonly type = 'annotation.move';
  readonly affectedStores = ['annotation'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: MoveAnnotationPayload): ValidationResult {
    if (typeof cmd.annotationId !== 'string' || cmd.annotationId.length === 0) {
      return { valid: false, reason: 'annotationId must be a non-empty string' };
    }
    if (!cmd.delta
        || !Number.isFinite(cmd.delta.x)
        || !Number.isFinite(cmd.delta.y)
        || !Number.isFinite(cmd.delta.z)) {
      return { valid: false, reason: 'delta must have finite x, y, z' };
    }
    // §ANN-ONE-STORE — existence is decided by the CANONICAL store. Asking the derived
    // `AnnotationsState` ledger rejected EVERY tool-created annotation (tools write the
    // canonical store), which is how "annotation edits do nothing" survived: the refusal
    // was correct about the ledger and wrong about the model. Both are accepted so a
    // ledger-only record from an older session still validates.
    if (!ctx.stores.annotation[cmd.annotationId] && !annotationStore.has(cmd.annotationId)) {
      return { valid: false, reason: `annotation not found: ${cmd.annotationId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: MoveAnnotationPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    // §ANN-ONE-STORE — the guard and the mutation both act on the CANONICAL store.
    // `ctx.stores.annotation` is a derived ledger; back-fill it so the patch pair this
    // handler returns describes a real before/after instead of an empty no-op.
    const _mirror = ctx.stores.annotation[cmd.annotationId] ?? mirrorRecordFor(cmd.annotationId);
    if (!_mirror) throw new AnnotationNotFoundError(cmd.annotationId);
    const [next, forward, inverse] = produceCommand<AnnotationsState>(ctx.stores.annotation, (draft) => {
      if (!draft[cmd.annotationId]) draft[cmd.annotationId] = _mirror as AnnotationsState[string];
      const a = draft[cmd.annotationId];
      if (!a) return;
      a.anchor.x += cmd.delta.x;
      a.anchor.y += cmd.delta.y;
      a.anchor.z += cmd.delta.z;
    });
    // §ANN-ONE-STORE — translate the CANONICAL element's geometry too. The ledger
    // carries a single `anchor`; the canonical element carries every control point
    // (a linear dimension has two), so all of them move by `delta` or the dimension
    // would shear. ADR-0299 §RECOVERY-MUST-REFUSE — a projection that cannot land
    // must not be reported as a completed move.
    const _el = annotationStore.getById(cmd.annotationId);
    if (_el) {
      const _p = sinkUpdate(cmd.annotationId, {
        geometry2D: {
          ..._el.geometry2D,
          modelPoints: (_el.geometry2D?.modelPoints ?? []).map(pt => ({
            x: pt.x + cmd.delta.x, y: pt.y + cmd.delta.y, z: pt.z + cmd.delta.z,
          })),
        },
      });
      if (!_p.ok) throw new AnnotationNotFoundError(`${cmd.annotationId} — ${_p.reason}`);
    }
    return { forward, inverse, nextStates: { annotation: next } };
    }); // withHandlerSpan — C10 §2
  }
}
