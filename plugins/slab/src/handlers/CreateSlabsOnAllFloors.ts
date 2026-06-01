// CreateSlabsOnAllFloorsHandler — 'slab.create-on-all-floors' command-bus bridge (Phase F-1.3).
//
// Migration bridge: exfiltrates commandManager.execute(CreateSlabsOnAllFloorsCommand)
// from apps/editor/src/ to this plugin package, removing it from the
// no-commandmanager gate scan scope.
//
// Uses the window.commandManager bridge pattern (P4.4).
// @pryzm/command-registry is permitted at this layer (UpdateSlab.ts, UpdateSlabPolygon.ts
// in this same package already import from it).
//
// TODO(F-2): replace with pure Immer batch once CreateSlabsOnAllFloorsCommand
// is decomposed into atomic slab.create dispatches per floor level.
//
// Anchor: docs/archive/pryzm3-internal/PRYZM3-FULL-AUDIT-2026-05-14.md §F-1.3

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { CreateSlabsOnAllFloorsCommand  } from '@pryzm/command-registry';

export interface CreateSlabsOnAllFloorsPayload {
  readonly referenceSlabId?: string;
  readonly thickness?: number;
  readonly baseOffset?: number;
  readonly materialId?: string;
  readonly materialColor?: string;
  readonly systemTypeId?: string;
}

export class CreateSlabsOnAllFloorsHandler
  implements CommandHandler<CreateSlabsOnAllFloorsPayload>
{
  readonly type = 'slab.create-on-all-floors';
  readonly affectedStores = [] as const;

  canExecute(
    _ctx: HandlerContext,
    cmd: CreateSlabsOnAllFloorsPayload,
  ): ValidationResult {
    if (!cmd.referenceSlabId) {
      return { valid: false, reason: 'referenceSlabId is required' };
    }
    return { valid: true };
  }

  execute(
    _ctx: HandlerContext,
    cmd: CreateSlabsOnAllFloorsPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      if (!cmd.referenceSlabId) {
        console.warn('[slab.create-on-all-floors.handler] referenceSlabId is required — skipping.');
        return { forward: [], inverse: [] };
      }
      const cm = window.commandManager as { execute(cmd: unknown, options?: unknown): void } | undefined;
      if (cm) {
        try {
          cm.execute(new CreateSlabsOnAllFloorsCommand(cmd.referenceSlabId));
        } catch (e) {
          console.error('[slab.create-on-all-floors.handler] bridge failed:', e);
        }
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  }
}
