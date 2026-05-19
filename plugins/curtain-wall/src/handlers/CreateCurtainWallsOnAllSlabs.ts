// CreateCurtainWallsOnAllSlabsHandler — 'curtain-wall.create-on-all-slabs' bridge (Phase F-1.3).
//
// Migration bridge: exfiltrates commandManager.execute(CreateCurtainWallsOnAllSlabsCommand)
// from apps/editor/src/ to this plugin package, removing it from the
// no-commandmanager gate scan scope.
//
// Uses the window.commandManager bridge pattern (P4.4).
// @pryzm/command-registry is permitted at this layer (UpdateCurtainWall.ts in this
// same package already imports from it).
//
// TODO(F-2): replace with pure Immer batch once CreateCurtainWallsOnAllSlabsCommand
// is decomposed into atomic curtainwall.create dispatches per slab perimeter.
//
// Anchor: docs/03_PRYZM3/PRYZM3-FULL-AUDIT-2026-05-14.md §F-1.3

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { CreateCurtainWallsOnAllSlabsCommand  } from '@pryzm/command-registry';

export interface CreateCurtainWallsOnAllSlabsPayload {
  readonly height?: number;
  readonly gridXSpacing?: number;
  readonly gridYSpacing?: number;
}

export class CreateCurtainWallsOnAllSlabsHandler
  implements CommandHandler<CreateCurtainWallsOnAllSlabsPayload>
{
  readonly type = 'curtain-wall.create-on-all-slabs';
  readonly affectedStores = [] as const;

  canExecute(
    _ctx: HandlerContext,
    _cmd: CreateCurtainWallsOnAllSlabsPayload,
  ): ValidationResult {
    return { valid: true };
  }

  execute(
    _ctx: HandlerContext,
    cmd: CreateCurtainWallsOnAllSlabsPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      const cm = window.commandManager as { execute(cmd: unknown, options?: unknown): void } | undefined;
      if (cm) {
        try {
          cm.execute(
            new CreateCurtainWallsOnAllSlabsCommand({
              height:       cmd.height,
              gridXSpacing: cmd.gridXSpacing,
              gridYSpacing: cmd.gridYSpacing,
            }),
          );
        } catch (e) {
          console.error('[curtain-wall.create-on-all-slabs.handler] bridge failed:', e);
        }
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  }
}
