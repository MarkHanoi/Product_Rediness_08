// AddLevelHandler — F-1.3 migration bridge.
// Exfiltrates commandManager.execute(AddLevelCommand) from apps/editor/src/.
// Placed in stair plugin to avoid creating a new plugin registration.
// TODO(F-1.4): move to a dedicated levels plugin handler once levels plugin
//              gains its own handler set registered in PluginRegistry.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { AddLevelCommand  } from '@pryzm/command-registry';

/**
 * §R7-FIX: Added `levelId`, `height`, and `_skipBridge` to match the corrected
 * `MiscMutationCommands['level.add']` type in `packages/command-bus/src/commands.ts`.
 *
 * `levelId` and `height` were previously absent — the handler was calling
 * `new AddLevelCommand(cmd as any)` with `levelId: undefined` because the field
 * was not declared in the payload type and therefore typed as `never`.
 *
 * `_skipBridge`: callers that have already dispatched AddLevelCommand directly
 * via commandManager (the §R7 dual-write pattern, C02 §3.4) set this flag so
 * this handler skips the redundant second commandManager.execute() call.
 */
export interface AddLevelPayload {
  readonly levelId?: string;
  readonly name?: string;
  readonly elevation?: number;
  readonly height?: number;
  readonly _skipBridge?: boolean;
}

export const AddLevelHandler: CommandHandler<AddLevelPayload, Record<string, unknown>> = {
  type: 'level.add',
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    _cmd: AddLevelPayload,
  ): ValidationResult {
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: AddLevelPayload,
  ): HandlerResult {
    return withHandlerSpan('level.add.handler', { 'pryzm.command.type': 'level.add' }, () => {
      // §R7-FIX: _skipBridge guard — skip commandManager.execute() when the caller
      // has already dispatched AddLevelCommand directly (dual-write pattern, C02 §3.4).
      // Without this guard, the second execution attempt would be rejected by
      // AddLevelCommand.canExecute() ("Level ID already exists") and log a warning.
      if (cmd._skipBridge) return { forward: [], inverse: [] };

      const cm = window.commandManager as { execute(cmd: unknown, options?: unknown): void } | undefined;
      if (cm) {
        try {
          cm.execute(new AddLevelCommand(cmd as any));
        } catch (e) {
          console.error('[level.add.handler] bridge failed:', e);
        }
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  },
};
