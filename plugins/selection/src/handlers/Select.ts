// SelectSelectionHandler — `selection.select`.  S16-T7.
//
// Per-spec: every selection handler is `ephemeral` (selection state is
// not undoable — re-selecting after Ctrl-Z would be confusing UX) so
// the bus must NOT push it to the undo stack.  We surface that intent
// via the `ephemeral: true` flag the command bus reads.
//
// Patch shape: produced directly against the SelectionStore's underlying
// Map<id, SelectionDto>; no immer producer needed because the
// SelectionStore.select() method already coalesces the patches into a
// single applyPatch call (verified by S16-T6 subscribeDirty test).

import type {
  CommandHandler,
  HandlerContext,
  HandlerResult,
  ValidationResult,
} from '@pryzm/plugin-sdk';
import { withHandlerSpan } from '@pryzm/plugin-sdk';
import type {
  SelectionStore,
  SelectionMode,
  SelectionTarget,
} from '@pryzm/plugin-sdk';

export interface SelectPayload {
  readonly targets: readonly SelectionTarget[];
  /** Default `replace`. */
  readonly mode?: SelectionMode;
}

type SelectionStores = Readonly<{ selection: SelectionStore } & Record<string, unknown>>;

export class SelectSelectionHandler
  implements CommandHandler<SelectPayload, SelectionStores>
{
  readonly type = 'selection.select';
  readonly affectedStores = ['selection'] as const;

  canExecute(_ctx: HandlerContext<SelectionStores>, cmd: SelectPayload): ValidationResult {
    if (!Array.isArray(cmd.targets)) {
      return { valid: false, reason: 'targets must be an array' };
    }
    for (let i = 0; i < cmd.targets.length; i++) {
      const t = cmd.targets[i]!;
      if (typeof t.id !== 'string' || t.id.length === 0) {
        return { valid: false, reason: `targets[${i}].id must be a non-empty string` };
      }
      if (typeof t.kind !== 'string' || t.kind.length === 0) {
        return { valid: false, reason: `targets[${i}].kind must be a non-empty string` };
      }
    }
    if (
      cmd.mode !== undefined &&
      cmd.mode !== 'replace' &&
      cmd.mode !== 'add' &&
      cmd.mode !== 'toggle'
    ) {
      return { valid: false, reason: `unknown mode "${String(cmd.mode)}"` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<SelectionStores>, cmd: SelectPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    // Selection handlers are EPHEMERAL — they mutate the store directly
    // (so subscribers fire) and return empty forward/inverse so the bus
    // records an audit event without a meaningful undo entry.  Per
    // ADR-0015 §"Consequences", undoing a selection would be confusing
    // UX; per-spec line 718 selection state is ephemeral by design.
    ctx.stores.selection.select(cmd.targets, cmd.mode ?? 'replace');
    return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  }
}
