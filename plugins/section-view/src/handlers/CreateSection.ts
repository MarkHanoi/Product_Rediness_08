// CreateSectionHandler — mint a new section (W-09).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type { SectionData, SectionsState } from '@pryzm/plugin-sdk';

export interface CreateSectionPayload {
  readonly id?: string;
  readonly mark?: string;
  readonly line: SectionData['line'];
  readonly scale?: number;
  readonly seq?: number;
}

type Stores = Readonly<{ section: SectionsState } & Record<string, unknown>>;

let _seq = 0;
function mintId(): string { return `section-${Date.now().toString(36)}-${(++_seq).toString(36)}`; }

export class CreateSectionHandler implements CommandHandler<CreateSectionPayload, Stores> {
  readonly type = 'section.create';
  readonly affectedStores = ['section'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: CreateSectionPayload): ValidationResult {
    if (cmd.id !== undefined && (typeof cmd.id !== 'string' || cmd.id.length === 0)) {
      return { valid: false, reason: 'id, when supplied, must be a non-empty string' };
    }
    if (cmd.id !== undefined && ctx.stores.section[cmd.id]) {
      return { valid: false, reason: `section id "${cmd.id}" already exists` };
    }
    if (!cmd.line || typeof cmd.line !== 'object') {
      return { valid: false, reason: 'line is required' };
    }
    const { a, b, lookDepth } = cmd.line;
    if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) {
      return { valid: false, reason: 'line.{a,b}.{x,y} must be finite numbers' };
    }
    if (!Number.isFinite(lookDepth) || lookDepth < 0) {
      return { valid: false, reason: 'line.lookDepth must be a non-negative finite number' };
    }
    if (cmd.scale !== undefined && (!Number.isFinite(cmd.scale) || cmd.scale <= 0)) {
      return { valid: false, reason: 'scale must be a positive finite number' };
    }
    if (cmd.seq !== undefined && (!Number.isInteger(cmd.seq) || cmd.seq < 0)) {
      return { valid: false, reason: 'seq must be a non-negative integer' };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: CreateSectionPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const id = cmd.id ?? mintId();
    let nextSeq = cmd.seq;
    if (nextSeq === undefined) {
      let max = -1;
      for (const s of Object.values(ctx.stores.section)) if (s.seq > max) max = s.seq;
      nextSeq = max + 1;
    }
    const data: SectionData = {
      id,
      ...(cmd.mark !== undefined ? { mark: cmd.mark } : {}),
      line: {
        a: { x: cmd.line.a.x, y: cmd.line.a.y },
        b: { x: cmd.line.b.x, y: cmd.line.b.y },
        lookDepth: cmd.line.lookDepth,
      },
      scale: cmd.scale ?? 50,
      seq: nextSeq,
    };
    const [next, forward, inverse] = produceCommand<SectionsState>(ctx.stores.section, (draft) => {
      draft[data.id] = data;
    });
    return { forward, inverse, nextStates: { section: next } };
    }); // withHandlerSpan — C10 §2
  }
}
