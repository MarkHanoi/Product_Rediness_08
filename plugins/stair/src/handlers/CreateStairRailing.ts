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
    // §RAILING-CREATE-BROKEN (DAILY-USE 2026-05-21) — Best-effort store
    // presence check, NOW shape-tolerant.  ctx.stores.stairStore can arrive
    // as either:
    //   (a) the legacy class instance with `getById(id)` / `get(id)` methods, OR
    //   (b) the PRYZM-3 Immer plain-object store keyed by id (no methods).
    // Previously this check only honoured shape (a) — when the bridge ran
    // with the Immer store both `getById?.` and `get?.` returned undefined,
    // the `if (!stair)` rejected every valid railing create, the bus call
    // failed, and NO railing was ever built (silent — the user-reported
    // "railing element doesn't get created" symptom).  Shape (b) lookup
    // added.  Either shape now resolves the stair correctly; absence of
    // BOTH the methods AND the keyed entry triggers the rejection.
    type LegacyStairStore = { getById?(id: string): unknown; get?(id: string): unknown };
    type ImmerStairStore  = Record<string, unknown>;
    const stairStore = (ctx.stores as Record<string, unknown>)['stairStore'] as
      | (LegacyStairStore & ImmerStairStore)
      | undefined;
    if (stairStore !== undefined) {
      const stair =
        stairStore.getById?.(cmd.stairId)
        ?? stairStore.get?.(cmd.stairId)
        ?? stairStore[cmd.stairId];                 // §RAILING-CREATE-BROKEN — Immer plain-object lookup
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
      // §RAILING-CREATE-BROKEN — probe so the live log shows whether the
      // bridge reached commandManager.execute() at all. Previously, a
      // commandManager-missing situation silently no-op'd; runtime had no
      // signal that the bridge was bypassing every railing creation.
      if (!cm) {
        console.error(
          '[stair.createRailing.handler] window.commandManager is undefined — ',
          'railing for stair ' + cmd.stairId + ' will NOT be created. ',
          'This usually means the bridge fired before initTools assigned ',
          'window.commandManager (race condition); check initialisation order.',
        );
        return { forward: [], inverse: [] };
      }
      try {
        console.log(
          '[stair.createRailing.handler] dispatching CreateStairRailingCommand ',
          'stairId=' + cmd.stairId + ' side=' + (cmd.side ?? '?'),
        );
        cm.execute(new CreateStairRailingCommand(cmd as any));
      } catch (e) {
        console.error('[stair.createRailing.handler] bridge failed:', e);
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  },
};
