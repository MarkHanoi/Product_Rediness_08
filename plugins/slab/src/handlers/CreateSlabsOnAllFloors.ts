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
//
// ─── §FIX-SLAB-BATCH-REFUSAL-DISCARDED (C16 §5.1 CA-18), sibling site ────────
// Same defect FAMILY as UpdateSlabsSystemTypeBatch.ts, found by rule 5 of that
// fix's sweep and repaired in the same change. Three shapes here all resolved
// the bus dispatch as SUCCESS over a verb that did nothing:
//   1. `cm` absent      → the `if (cm)` fell through to the empty pair silently.
//   2. the bridge threw → caught, console.error'd, empty pair returned.
//   3. the command refused → `CreateSlabsOnAllFloorsCommand.canExecute` returns
//      `{ok:false, reason:'Reference slab <id> not found.'}` (:31) and execute
//      returns `{success:false, info:[…]}` (:41); `CommandManagerImpl.execute`
//      hands that back WITHOUT throwing, and this bridge's local type declared
//      `execute(...): void` — the refusal was not merely ignored, it was TYPED
//      AWAY. That type is now the real `CommandResult` shape and is read.
// C16 §5.1 CA-18 prohibits exactly this: "(b) `{forward:[],inverse:[]}` returned
// as the outcome of a mutation the user asked for". The console.warn/error calls
// are KEPT — the console was never the defect, the return value was.
// BLAST RADIUS: zero live dispatch sites exist for 'slab.create-on-all-floors'
// (grep: registration in this package's index.ts, the type table in
// packages/command-bus/src/commands.ts, and ChatCommandClassification.ts — no
// caller), so nothing today can observe the change from success to rejection.

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
        // Unreachable via the bus (canExecute already refuses a missing
        // referenceSlabId), but a direct caller must not get an empty pair.
        throw new Error('slab.create-on-all-floors: referenceSlabId is required — nothing was created.');
      }
      const cm = window.commandManager as
        | {
            execute(
              cmd: unknown,
              options?: unknown,
            ): { success: boolean; affectedElementIds: string[]; info?: string[] };
          }
        | undefined;
      if (!cm) {
        throw new Error(
          'slab.create-on-all-floors: the command manager is not available in this session — nothing was created.',
        );
      }
      let result: { success: boolean; info?: string[] };
      try {
        result = cm.execute(new CreateSlabsOnAllFloorsCommand(cmd.referenceSlabId));
      } catch (e) {
        console.error('[slab.create-on-all-floors.handler] bridge failed:', e);
        throw new Error(
          `slab.create-on-all-floors: the bridge threw: ${String((e as Error)?.message ?? e)} — nothing was created.`,
        );
      }
      if (!result?.success) {
        // Quote the command's own sentence ('Reference slab <id> not found.').
        throw new Error(
          `slab.create-on-all-floors: ${result?.info?.[0] ?? 'the command refused, and no reason was given'}`,
        );
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  }
}
