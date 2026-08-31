// ClearSelectionHandler — `selection.clear`.  S16-T7.

import type {
  CommandHandler,
  HandlerContext,
  HandlerResult,
  ValidationResult,
} from '@pryzm/plugin-sdk';
import { withHandlerSpan } from '@pryzm/plugin-sdk';
import type { SelectionStore } from '@pryzm/plugin-sdk';
import { resolveSelectionStore } from './selectionStoreAccess.js';

// Empty payload — the command type alone carries the intent.
export type ClearSelectionPayload = Record<string, never>;

type SelectionStores = Readonly<{ selection: SelectionStore } & Record<string, unknown>>;

export class ClearSelectionHandler
  implements CommandHandler<ClearSelectionPayload, SelectionStores>
{
  readonly type = 'selection.clear';
  readonly affectedStores = ['selection'] as const;

  /** §SEL-STORE-IDENTITY — canonical store ADOPTED from the composition root. */
  constructor(private readonly store: SelectionStore | null = null) {}

  canExecute(_ctx: HandlerContext<SelectionStores>, _cmd: ClearSelectionPayload): ValidationResult {
    return { valid: true };
  }

  execute(ctx: HandlerContext<SelectionStores>, _cmd: ClearSelectionPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    resolveSelectionStore(this.store, ctx.stores, this.type).clear();
    return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  }
}
