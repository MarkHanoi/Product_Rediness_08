// DeselectSelectionHandler — `selection.deselect`.  S16-T7.

import type {
  CommandHandler,
  HandlerContext,
  HandlerResult,
  ValidationResult,
} from '@pryzm/plugin-sdk';
import { withHandlerSpan } from '@pryzm/plugin-sdk';
import type { SelectionStore } from '@pryzm/plugin-sdk';

export interface DeselectPayload {
  readonly ids: readonly string[];
}

type SelectionStores = Readonly<{ selection: SelectionStore } & Record<string, unknown>>;

export class DeselectSelectionHandler
  implements CommandHandler<DeselectPayload, SelectionStores>
{
  readonly type = 'selection.deselect';
  readonly affectedStores = ['selection'] as const;

  canExecute(_ctx: HandlerContext<SelectionStores>, cmd: DeselectPayload): ValidationResult {
    if (!Array.isArray(cmd.ids)) {
      return { valid: false, reason: 'ids must be an array' };
    }
    for (let i = 0; i < cmd.ids.length; i++) {
      if (typeof cmd.ids[i] !== 'string' || cmd.ids[i]!.length === 0) {
        return { valid: false, reason: `ids[${i}] must be a non-empty string` };
      }
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<SelectionStores>, cmd: DeselectPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    ctx.stores.selection.deselect(cmd.ids);
    return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  }
}
