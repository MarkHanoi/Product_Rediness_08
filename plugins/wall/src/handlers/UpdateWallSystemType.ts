// UpdateWallSystemTypeHandler — F-1.3 migration bridge.
// Covers both UpdateWallSystemTypeCommand (full type change) and
// UpdateWallLayersCommand (layer-only edit that fires wall.updateSystemType bus type).
// Exfiltrates commandManager.execute() from apps/editor/src/.
// TODO(F-1.4): merge into SetWallSystemTypeHandler + SetWallLayersHandler with
//              proper payload routing.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { UpdateWallSystemTypeCommand, UpdateWallLayersCommand  } from '@pryzm/command-registry';

export interface UpdateWallSystemTypePayload {
  readonly wallId: string;
  readonly systemTypeId?: string | null;
  readonly layers?: unknown[];
  readonly thickness?: number;
}

export const UpdateWallSystemTypeHandler: CommandHandler<UpdateWallSystemTypePayload, Record<string, unknown>> = {
  type: 'wall.updateSystemType',
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: UpdateWallSystemTypePayload,
  ): ValidationResult {
    if (!cmd.wallId) return { valid: false, reason: 'wallId is required' };
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: UpdateWallSystemTypePayload,
  ): HandlerResult {
    return withHandlerSpan('wall.updateSystemType.handler', { 'pryzm.command.type': 'wall.updateSystemType' }, () => {
      const cm = window.commandManager as { execute(cmd: unknown, options?: unknown): void } | undefined;
      if (cm) {
        try {
          // ── §FIX-WALL-LAYEREDIT-PROPAGATION (founder 2026-08-06) ──────────────
          // THE DEFECT: "editing a LAYER's thickness inside an already-assigned wall
          // system type produces NO visible change."
          //
          // ROOT CAUSE — this branch was inverted relative to BOTH commands' stated
          // intent. It discriminated on "does the wall have a type", but the two
          // commands differ by WHAT IS BEING EDITED, not by whether a type exists:
          //
          //   • UpdateWallLayersCommand is the LAYER-STACK editor. Its whole reason to
          //     exist is the typed case — UpdateWallLayersCommand.ts:90-117 reads
          //     `systemTypeId ?? wall.systemTypeId`, calls `typeStore.update(typeId,
          //     { layers })` and then walks `wallStore.getAll()` re-stamping every
          //     sibling with the same `systemTypeId`. Its doc-block
          //     (§03-WALL-THICKNESS-CONTRACT §2, UpdateWallLayersCommand.ts:15-24 and
          //     :38-42) says exactly that.
          //   • UpdateWallSystemTypeCommand is the type REBIND. It writes
          //     `systemTypeId`/`layers`/`thickness` onto ONE wall
          //     (UpdateWallSystemTypeCommand.ts:43-52) and never touches the type store.
          //
          // So a layer edit on a TYPED wall — the only case the founder can actually
          // perform, since the layer editor seeds from `wall.layers` — was routed to the
          // single-wall rebind. The type definition was never updated, no sibling was
          // re-stamped, and because `WallData.layers` is a frozen create-time snapshot
          // (WallTypes.ts:255-256) nothing else in the system would ever re-derive it.
          // The one correct propagation implementation in the repo was gated behind
          // `typeId` being FALSY — i.e. reachable only for walls that have no type.
          //
          // FIX: discriminate on the PAYLOAD. A payload carrying a layer stack is a
          // layer edit → UpdateWallLayersCommand (type write + sibling propagation).
          // A payload with no layers is a bare rebind → UpdateWallSystemTypeCommand.
          //
          // Rebuild/junction correctness: the N+1 `wallStore.updateWall()` calls all land
          // inside ONE synchronous command execution, so `WallRebuildCoordinator`
          // accumulates them into a single `_pendingWallEvents` batch and runs exactly
          // ONE `resolveLevel` per affected level (C16 §173 invariant B-5, C11 §1182) —
          // not one per wall. The resulting thickness change is then re-mitred correctly
          // by §FIX-WALL-TYPECHANGE-MITRE, which is what stops a propagated thickness
          // step from degrading every junction it touches.
          //
          // Escape hatch: `__pryzmWallLayerEditPropagation = false` restores the pre-fix
          // routing (single-wall write, no propagation) for diagnostics.
          const layerStack = Array.isArray(cmd.layers) ? cmd.layers : null;
          const propagationOn =
            (globalThis as { __pryzmWallLayerEditPropagation?: boolean })
              .__pryzmWallLayerEditPropagation !== false;
          const isLayerEdit = propagationOn && layerStack !== null && layerStack.length > 0;

          if (isLayerEdit) {
            // `UpdateWallLayersCommand.canExecute` rejects a non-positive thickness, so
            // derive the total from the stack when the caller omitted it rather than
            // passing 0 and having the command silently refuse.
            const total = typeof cmd.thickness === 'number' && cmd.thickness > 0
              ? cmd.thickness
              : layerStack.reduce(
                  (s: number, l: unknown) => s + (Number((l as { thickness?: number })?.thickness) || 0),
                  0,
                );
            cm.execute(new UpdateWallLayersCommand({
              wallId: cmd.wallId,
              layers: layerStack as any,
              thickness: total,
              systemTypeId: cmd.systemTypeId ?? null,
            }));
          } else {
            cm.execute(new UpdateWallSystemTypeCommand({
              wallId: cmd.wallId,
              systemTypeId: cmd.systemTypeId ?? null,
              layers: (cmd.layers ?? null) as any,
              thickness: cmd.thickness,
            }));
          }
        } catch (e) {
          console.error('[wall.updateSystemType.handler] bridge failed:', e);
        }
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  },
};
