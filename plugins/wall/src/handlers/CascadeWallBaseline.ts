// CascadeWallBaselineHandler — E.5.x migration bridge.
// Maps bus type wall.cascadeBaseline to the legacy CascadeWallBaselineCommand.
// TODO(F-1.4): replace with authoritative wall-store Immer batch update.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { CascadeWallBaselineCommand } from '@pryzm/command-registry';

type Pt = { x: number; y: number; z: number };

export interface CascadeWallBaselineEntry {
  readonly wallId: string;
  readonly newBaseLine: [Pt, Pt];
  readonly prevBaseLine: [Pt, Pt];
}

export interface CascadeWallBaselinePayload {
  readonly entries: CascadeWallBaselineEntry[];
  readonly cause: string;
  /**
   * [F-1.2 R2/R3] Set by call sites that already invoked
   * `window.commandManager` directly (P4.4).
   * Skips the bridge to prevent a double undo-stack entry.
   */
  readonly _skipBridge?: boolean;
}

export const CascadeWallBaselineHandler: CommandHandler<CascadeWallBaselinePayload, Record<string, unknown>> = {
  type: 'wall.cascadeBaseline',
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: CascadeWallBaselinePayload,
  ): ValidationResult {
    if (!cmd.entries?.length) return { valid: false, reason: 'entries must be non-empty' };
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: CascadeWallBaselinePayload,
  ): HandlerResult {
    return withHandlerSpan('wall.cascadeBaseline.handler', { 'pryzm.command.type': 'wall.cascadeBaseline' }, () => {
      // [F-1.2 R2/R3] Skip bridge when the call site already executed
      // CascadeWallBaselineCommand directly (prevents double undo-stack entry).
      if (cmd._skipBridge) {
        return { forward: [], inverse: [] };
      }
      const cm = window.commandManager as { execute(cmd: unknown, options?: unknown): void } | undefined;
      if (cm) {
        try {
          cm.execute(new CascadeWallBaselineCommand({
            entries: cmd.entries,
            cause:   cmd.cause,
          }));
        } catch (e) {
          console.error('[wall.cascadeBaseline.handler] bridge failed:', e);
        }
      }
      return { forward: [], inverse: [] };
    });
  },
};
