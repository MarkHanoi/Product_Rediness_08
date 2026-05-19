// Intentional fixture — `pryzm/store-single-channel` MUST flag the class below.
// This handler touches two stores (wall + roof), which violates the
// single-channel contract.  See W-1A-1 completion plan notes.

import type { CommandHandler, HandlerContext, HandlerResult, ValidationResult } from '@pryzm/command-bus';

export class TwoStoreHandler
  implements CommandHandler<Record<string, unknown>, Record<string, unknown>>
{
  readonly type = 'multi.store.bad';
  readonly affectedStores = ['wall', 'roof'] as const;

  canExecute(_ctx: HandlerContext<Record<string, unknown>>): ValidationResult {
    return { valid: true };
  }

  execute(_ctx: HandlerContext<Record<string, unknown>>): HandlerResult {
    return { forward: [], inverse: [], nextStates: {} };
  }
}
