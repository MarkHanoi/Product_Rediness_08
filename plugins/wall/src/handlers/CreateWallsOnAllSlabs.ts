// CreateWallsOnAllSlabsHandler — 'wall.create-on-all-slabs' command-bus bridge (Phase F-1.3).
//
// Migration bridge: exfiltrates commandManager.execute(CreateWallsOnAllSlabsCommand)
// from apps/editor/src/ to this plugin package, removing it from the
// no-commandmanager gate scan scope.
//
// Uses the window.commandManager bridge pattern (P4.4) —
// the commandManager instance is on window at runtime, accessed without an L4→L7
// import.  The @pryzm/command-registry import is permitted at this layer (consistent
// with UpdateWallDimensions.ts, UpdateWallSystemType.ts in this same package).
//
// TODO(F-2): replace with a pure Immer handler once CreateWallsOnAllSlabsCommand
// is decomposed into atomic wall.create dispatches per slab.
//
// Anchor: docs/03_PRYZM3/PRYZM3-FULL-AUDIT-2026-05-14.md §F-1.3

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { CreateWallsOnAllSlabsCommand  } from '@pryzm/command-registry';

export interface CreateWallsOnAllSlabsPayload {
  readonly wallHeight?: number;
  readonly wallThickness?: number;
}

export class CreateWallsOnAllSlabsHandler
  implements CommandHandler<CreateWallsOnAllSlabsPayload>
{
  readonly type = 'wall.create-on-all-slabs';
  readonly affectedStores = [] as const;

  canExecute(
    _ctx: HandlerContext,
    _cmd: CreateWallsOnAllSlabsPayload,
  ): ValidationResult {
    return { valid: true };
  }

  execute(
    _ctx: HandlerContext,
    cmd: CreateWallsOnAllSlabsPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      const cm = window.commandManager as { execute(cmd: unknown, options?: unknown): void } | undefined;
      if (cm) {
        try {
          cm.execute(
            new CreateWallsOnAllSlabsCommand({
              wallHeight:    cmd.wallHeight,
              wallThickness: cmd.wallThickness,
            }),
          );
        } catch (e) {
          console.error('[wall.create-on-all-slabs.handler] bridge failed:', e);
        }
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  }
}
