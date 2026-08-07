// DeleteAnnotationHandler — S34 / ADR-0026.

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
import { annotationStore } from '../subsystem/AnnotationStore.js';
import { mirrorRecordFor, sinkDelete } from './canonicalAnnotationSink.js';

export interface DeleteAnnotationPayload { readonly annotationId: string }

type Stores = Readonly<{ annotation: AnnotationsState } & Record<string, unknown>>;

export class DeleteAnnotationHandler
  implements CommandHandler<DeleteAnnotationPayload, Stores>
{
  readonly type = 'annotation.delete';
  readonly affectedStores = ['annotation'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: DeleteAnnotationPayload): ValidationResult {
    if (typeof cmd.annotationId !== 'string' || cmd.annotationId.length === 0) {
      return { valid: false, reason: 'annotationId must be a non-empty string' };
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

  execute(ctx: HandlerContext<Stores>, cmd: DeleteAnnotationPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    // §ANN-ONE-STORE — the guard and the mutation both act on the CANONICAL store.
    // `ctx.stores.annotation` is a derived ledger; back-fill it so the patch pair this
    // handler returns describes a real before/after instead of an empty no-op.
    const _mirror = ctx.stores.annotation[cmd.annotationId] ?? mirrorRecordFor(cmd.annotationId);
    if (!_mirror) throw new AnnotationNotFoundError(cmd.annotationId);
    const [next, forward, inverse] = produceCommand<AnnotationsState>(ctx.stores.annotation, (draft) => {
      if (!draft[cmd.annotationId]) draft[cmd.annotationId] = _mirror as AnnotationsState[string];
      delete draft[cmd.annotationId];
    });
    // ADR-0299 §RECOVERY-MUST-REFUSE — if the canonical projection fails the user
    // must NOT be told the edit landed.
    const _p = sinkDelete(cmd.annotationId);
    if (!_p.ok) throw new AnnotationNotFoundError(`${cmd.annotationId} — ${_p.reason}`);
    return { forward, inverse, nextStates: { annotation: next } };
    }); // withHandlerSpan — C10 §2
  }
}
