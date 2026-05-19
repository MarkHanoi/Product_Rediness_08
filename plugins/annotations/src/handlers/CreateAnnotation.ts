// CreateAnnotationHandler — mint a new annotation element (S34 / ADR-0026).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { Annotation, createId } from '@pryzm/plugin-sdk';
import type { AnnotationData, AnnotationsState } from '@pryzm/plugin-sdk';
import { AnnotationSchemaError } from '../errors.js';
import { isFiniteVec3, isAnnotationKind, ANNOTATION_TEXT_HEIGHT_MAX_MM } from '../intent.js';

export interface CreateAnnotationPayload {
  readonly id?: string;
  readonly viewId?: string;
  readonly kind?: AnnotationData['kind'];
  readonly anchor?: AnnotationData['anchor'];
  readonly hostElementId?: string;
  readonly text?: string;
  readonly rotation?: number;
  readonly textHeightMm?: number;
  readonly color?: string;
}

type Stores = Readonly<{ annotation: AnnotationsState } & Record<string, unknown>>;

export class CreateAnnotationHandler
  implements CommandHandler<CreateAnnotationPayload, Stores>
{
  readonly type = 'annotation.create';
  readonly affectedStores = ['annotation'] as const;

  canExecute(_ctx: HandlerContext<Stores>, cmd: CreateAnnotationPayload): ValidationResult {
    if (cmd.kind !== undefined && !isAnnotationKind(cmd.kind)) {
      return { valid: false, reason: `kind must be one of the AnnotationKind enum, got: ${String(cmd.kind)}` };
    }
    if (cmd.anchor !== undefined && !isFiniteVec3(cmd.anchor)) {
      return { valid: false, reason: 'anchor must be a finite Vec3 ({x,y,z} all finite)' };
    }
    if (cmd.rotation !== undefined && !Number.isFinite(cmd.rotation)) {
      return { valid: false, reason: 'rotation must be finite' };
    }
    if (cmd.textHeightMm !== undefined) {
      if (!Number.isFinite(cmd.textHeightMm) || cmd.textHeightMm <= 0) {
        return { valid: false, reason: 'textHeightMm must be a positive finite number' };
      }
      if (cmd.textHeightMm > ANNOTATION_TEXT_HEIGHT_MAX_MM) {
        return { valid: false, reason: `textHeightMm must be ≤ ${ANNOTATION_TEXT_HEIGHT_MAX_MM} mm at sheet scale` };
      }
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: CreateAnnotationPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const id = (cmd.id ?? createId('annotation')) as AnnotationData['id'];
    const seed: Partial<AnnotationData> = {
      id,
      viewId: cmd.viewId ?? '',
      kind: cmd.kind ?? 'text-note',
      anchor: cmd.anchor ?? { x: 0, y: 0, z: 0 },
      hostElementId: cmd.hostElementId,
      text: cmd.text ?? '',
      rotation: cmd.rotation ?? 0,
      textHeightMm: cmd.textHeightMm ?? 2.5,
      color: cmd.color,
    };

    let a: AnnotationData;
    try { a = Annotation.parse(seed); }
    catch (err) { throw new AnnotationSchemaError(err); }

    const [next, forward, inverse] = produceCommand<AnnotationsState>(ctx.stores.annotation, (draft) => {
      draft[a.id] = a;
    });
    return { forward, inverse, nextStates: { annotation: next } };
    }); // withHandlerSpan — C10 §2
  }
}
