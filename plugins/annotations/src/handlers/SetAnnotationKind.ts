// SetAnnotationKindHandler — change the schema-level kind (S34 / ADR-0026).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type { AnnotationData, AnnotationsState } from '@pryzm/plugin-sdk';
import { AnnotationNotFoundError } from '../errors.js';
import { annotationStore } from '../subsystem/AnnotationStore.js';
import { mirrorRecordFor, sinkUpdate } from './canonicalAnnotationSink.js';
import { isAnnotationKind } from '../intent.js';

export interface SetAnnotationKindPayload {
  readonly annotationId: string;
  readonly kind: AnnotationData['kind'];
}

type Stores = Readonly<{ annotation: AnnotationsState } & Record<string, unknown>>;

export class SetAnnotationKindHandler
  implements CommandHandler<SetAnnotationKindPayload, Stores>
{
  readonly type = 'annotation.setKind';
  readonly affectedStores = ['annotation'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: SetAnnotationKindPayload): ValidationResult {
    if (typeof cmd.annotationId !== 'string' || cmd.annotationId.length === 0) {
      return { valid: false, reason: 'annotationId must be a non-empty string' };
    }
    if (!isAnnotationKind(cmd.kind)) {
      return { valid: false, reason: `kind must be one of the AnnotationKind enum, got: ${String(cmd.kind)}` };
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

  execute(ctx: HandlerContext<Stores>, cmd: SetAnnotationKindPayload): HandlerResult {
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
      a.kind = cmd.kind;
    });
    // ADR-0299 §RECOVERY-MUST-REFUSE — if the canonical projection fails the user
    // must NOT be told the edit landed.
    const _p = sinkUpdate(cmd.annotationId, { type: cmd.kind as never });
    if (!_p.ok) throw new AnnotationNotFoundError(`${cmd.annotationId} — ${_p.reason}`);
    return { forward, inverse, nextStates: { annotation: next } };
    }); // withHandlerSpan — C10 §2
  }
}
