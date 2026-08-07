/**
 * §ANN-UPDATE-VERB — UpdateAnnotationHandler (`annotation.update`).
 *
 * THE GAP THIS CLOSES. The annotation family exposed create / delete / move / setText /
 * setKind / setRotation / setTextHeight / setColor — and no general update. Any edit that
 * was not one of those seven single fields (the system type, a tag's displayed property,
 * a dimension's text override, semantics, parameters) had NO bus verb at all, so the UI
 * either wrote a store directly (P6 violation) or reported a success it never performed.
 *
 * This handler is the single general-purpose annotation mutation, routed through
 * §ANN-ONE-STORE's canonical sink like every other annotation verb.
 *
 * Contract compliance:
 *   C03 §P6      — the only mutation path for a general annotation edit.
 *   C03 §4.5-4.8 — returns a forward/inverse patch pair so Ctrl+Z covers it.
 *   C10 §2 / P8  — `withHandlerSpan` on execute.
 *   C16          — verb named `<family>.<verb>`, payload is data, handler is pure-ish.
 *   ADR-0299     — a projection that cannot land throws; it never reports success.
 */

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
import { mirrorRecordFor, sinkUpdate, sinkStyle, sinkParameters } from './canonicalAnnotationSink.js';
import { ANNOTATION_TEXT_HEIGHT_MAX_MM } from '../intent.js';
import type { AnnotationElement, AnnotationStyle } from '../subsystem/AnnotationTypes.js';

export interface UpdateAnnotationPayload {
  readonly annotationId: string;
  /** §ANN-TYPE — re-type the annotation (the Revit "change type" edit). */
  readonly systemTypeId?: string;
  /** Style overrides MERGED onto the element's existing style (never replacing it). */
  readonly style?: Partial<AnnotationStyle>;
  /** Type-specific parameters MERGED onto the element's existing parameters. */
  readonly parameters?: Record<string, unknown>;
  /** §ANN-C2 semantic metadata (intent / regulation / performance / severity). */
  readonly semantics?: AnnotationElement['semantics'];
  /** Driving-dimension flag (Phase C). */
  readonly isDriving?: boolean;
}

type Stores = Readonly<{ annotation: AnnotationsState } & Record<string, unknown>>;

export class UpdateAnnotationHandler
  implements CommandHandler<UpdateAnnotationPayload, Stores>
{
  readonly type = 'annotation.update';
  readonly affectedStores = ['annotation'] as const;

  canExecute(_ctx: HandlerContext<Stores>, cmd: UpdateAnnotationPayload): ValidationResult {
    if (typeof cmd.annotationId !== 'string' || cmd.annotationId.length === 0) {
      return { valid: false, reason: 'annotationId is required' };
    }
    const noOp =
      cmd.systemTypeId === undefined && cmd.style === undefined &&
      cmd.parameters === undefined && cmd.semantics === undefined &&
      cmd.isDriving === undefined;
    if (noOp) {
      // ADR-0299 — an update that changes nothing must be refused, not reported as done.
      return { valid: false, reason: 'annotation.update carries no field to change' };
    }
    const h = cmd.style?.textSizeMm;
    if (h !== undefined && (!Number.isFinite(h) || h <= 0 || h > ANNOTATION_TEXT_HEIGHT_MAX_MM)) {
      return { valid: false, reason: `style.textSizeMm must be > 0 and ≤ ${ANNOTATION_TEXT_HEIGHT_MAX_MM} mm at sheet scale` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: UpdateAnnotationPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      const mirror = ctx.stores.annotation[cmd.annotationId] ?? mirrorRecordFor(cmd.annotationId);
      if (!mirror) throw new AnnotationNotFoundError(cmd.annotationId);

      // Canonical projections first — each refuses loudly if it cannot land.
      const refuse = (r?: string): never => {
        throw new AnnotationNotFoundError(`${cmd.annotationId} — ${r ?? 'canonical projection failed'}`);
      };
      if (cmd.systemTypeId !== undefined || cmd.semantics !== undefined || cmd.isDriving !== undefined) {
        const p = sinkUpdate(cmd.annotationId, {
          ...(cmd.systemTypeId !== undefined ? { systemTypeId: cmd.systemTypeId } : {}),
          ...(cmd.semantics !== undefined ? { semantics: cmd.semantics } : {}),
          ...(cmd.isDriving !== undefined ? { isDriving: cmd.isDriving } : {}),
        });
        if (!p.ok) refuse(p.reason);
      }
      if (cmd.style !== undefined) {
        const p = sinkStyle(cmd.annotationId, cmd.style as Record<string, unknown>);
        if (!p.ok) refuse(p.reason);
      }
      if (cmd.parameters !== undefined) {
        const p = sinkParameters(cmd.annotationId, cmd.parameters);
        if (!p.ok) refuse(p.reason);
      }

      // Ledger patch pair, so Ctrl+Z has something to revert.
      const [next, forward, inverse] = produceCommand<AnnotationsState>(ctx.stores.annotation, (draft) => {
        if (!draft[cmd.annotationId]) draft[cmd.annotationId] = mirror as AnnotationsState[string];
        const refreshed = mirrorRecordFor(cmd.annotationId);
        if (refreshed) draft[cmd.annotationId] = refreshed as AnnotationsState[string];
      });
      return { forward, inverse, nextStates: { annotation: next } };
    }); // withHandlerSpan — C10 §2
  }
}
