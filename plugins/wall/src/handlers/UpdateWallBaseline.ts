// UpdateWallBaselineHandler — E.5.x migration bridge.
// Maps bus type wall.updateBaseline to the legacy UpdateWallBaselineCommand.
// TODO(F-1.4): replace with authoritative wall-store Immer update.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { UpdateWallBaselineCommand } from '@pryzm/command-registry';

type Pt = { x: number; y: number; z: number };

export interface UpdateWallBaselinePayload {
  readonly wallId: string;
  readonly newBaseLine: [Pt, Pt];
  readonly prevBaseLine: [Pt, Pt];
  /**
   * [F-1.2 R2/R3] Set to `true` by call sites that have already executed
   * `UpdateWallBaselineCommand` directly via `window.commandManager` (P4.4).
   * Prevents a second commandManager invocation (which would push a duplicate
   * onto the undo stack and trigger a redundant WallRebuildCoordinator pass).
   * External callers (AI pipeline, collaborative sync) that arrive ONLY through
   * the bus do NOT set this flag — the bridge runs normally for them.
   */
  readonly _skipBridge?: boolean;
}

export const UpdateWallBaselineHandler: CommandHandler<UpdateWallBaselinePayload, Record<string, unknown>> = {
  type: 'wall.updateBaseline',
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: UpdateWallBaselinePayload,
  ): ValidationResult {
    if (!cmd.wallId) return { valid: false, reason: 'wallId is required' };
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: UpdateWallBaselinePayload,
  ): HandlerResult {
    return withHandlerSpan('wall.updateBaseline.handler', { 'pryzm.command.type': 'wall.updateBaseline' }, () => {
      // [F-1.2 R2/R3] Skip bridge when the call site already issued a direct
      // window.commandManager direct execute call (P4.4).
      // This prevents a duplicate undo-stack entry and a redundant rebuild pass.
      // External callers (AI pipeline, CRDT sync, IFC importer) that only reach
      // the wall through the bus do NOT set _skipBridge and are bridged normally.
      if (cmd._skipBridge) {
        return { forward: [], inverse: [] };
      }
      const cm = window.commandManager as { execute(cmd: unknown, options?: unknown): void } | undefined;
      if (cm) {
        try {
          cm.execute(new UpdateWallBaselineCommand({
            wallId:       cmd.wallId,
            newBaseLine:  cmd.newBaseLine,
            prevBaseLine: cmd.prevBaseLine,
          }));
        } catch (e) {
          console.error('[wall.updateBaseline.handler] bridge failed:', e);
        }
      }
      return { forward: [], inverse: [] };
    });
  },
};
