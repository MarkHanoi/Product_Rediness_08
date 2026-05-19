// CreateStairRailingHandler — F-1.3 migration bridge.
// Exfiltrates commandManager.execute(CreateStairRailingCommand) from apps/editor/src/.
// TODO(F-1.4): replace with authoritative stair-store railing Immer update.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { CreateStairRailingCommand  } from '@pryzm/command-registry';

export interface CreateStairRailingPayload {
  readonly stairId?: string;
  readonly side?: string;
  readonly topRailHeight?: number;
  readonly balusterSpacing?: number;
  readonly balusterShape?: string;
  readonly balusterWidth?: number;
  readonly postAtStart?: boolean;
  readonly postAtEnd?: boolean;
  readonly material?: string;
  readonly [k: string]: unknown;
}

export const CreateStairRailingHandler: CommandHandler<CreateStairRailingPayload, Record<string, unknown>> = {
  type: 'stair.createRailing',
  affectedStores: [] as const,

  canExecute(
    ctx: HandlerContext<Record<string, unknown>>,
    cmd: CreateStairRailingPayload,
  ): ValidationResult {
    // TASK-03 (MASTER-IMPL-PLAN-2026-05-18 BUG-2): validate stairId before bridge dispatch.
    // Without this check, StairRailingBuilder.resolveStair(undefined) returns undefined,
    // the `if (stair)` guard silently skips buildRailing(), and the railing is committed
    // to stairRailingStore with no 3D mesh — a silent no-render.
    if (!cmd.stairId || typeof cmd.stairId !== 'string' || cmd.stairId.trim() === '') {
      return { valid: false, reason: 'stairId is required and must be a non-empty string' };
    }
    // Best-effort store presence check. ctx.stores may or may not expose stairStore for
    // bridge handlers (affectedStores: []); use optional chaining so the check degrades
    // gracefully if the store is unavailable (the builder's null guard provides a second
    // line of defence in that case — see StairRailingBuilder.ts).
    const stairStore = (ctx.stores as Record<string, unknown>)['stairStore'] as
      | { getById?(id: string): unknown; get?(id: string): unknown }
      | undefined;
    if (stairStore !== undefined) {
      const stair = stairStore.getById?.(cmd.stairId) ?? stairStore.get?.(cmd.stairId);
      if (!stair) {
        return {
          valid: false,
          reason: `Stair ID '${cmd.stairId}' does not exist in stairStore — railing cannot be built`,
        };
      }
    }
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: CreateStairRailingPayload,
  ): HandlerResult {
    return withHandlerSpan('stair.createRailing.handler', { 'pryzm.command.type': 'stair.createRailing' }, () => {
      const cm = window.commandManager as { execute(cmd: unknown, options?: unknown): void } | undefined;
      if (cm) {
        try {
          cm.execute(new CreateStairRailingCommand(cmd as any));
        } catch (e) {
          console.error('[stair.createRailing.handler] bridge failed:', e);
        }
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  },
};
