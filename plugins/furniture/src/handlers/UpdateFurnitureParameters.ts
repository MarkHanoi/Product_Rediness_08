// UpdateFurnitureParametersHandler — F-1.3 migration bridge.
// Exfiltrates commandManager.execute(UpdateFurnitureParametersCommand) from apps/editor/src/.
// TODO(F-1.4): replace with authoritative furniture-store Immer update.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type Patch,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { UpdateFurnitureParametersCommand  } from '@pryzm/command-registry';

type Vec = { readonly x: number; readonly y: number; readonly z: number };
type Rot = { readonly x: number; readonly y: number; readonly z: number; readonly order?: string };

export interface UpdateFurnitureParametersPayload {
  readonly id: string;
  /** §FIX-UNDO-CAPTURE-SYSTEMIC (L-72) — new absolute position committed by a
   *  3D-gizmo move (present on the drag path). */
  readonly position?: Vec;
  /** §FIX-UNDO-CAPTURE-SYSTEMIC (L-72) — new absolute rotation committed by a
   *  3D-gizmo move/rotate (present on the drag path). */
  readonly rotation?: Rot;
  /**
   * §FIX-UNDO-CAPTURE-SYSTEMIC (L-72) — opt this dispatch into the unified
   * ring-buffer undo timeline (mirrors §FIX-WALL-MOVE-UNDO-CAPTURE / L-49). Only
   * the 3D-gizmo drag-end sets this today; it also supplies the pre-move
   * `_prevPosition` / `_prevRotation` so the emitted inverse PatchPair can restore
   * the exact prior pose. Other callers (property panel, AI pipeline) leave it
   * unset and keep the previous empty-patch behaviour (undo routing untouched).
   */
  readonly _recordUndo?: boolean;
  readonly _prevPosition?: Vec;
  readonly _prevRotation?: Rot;
  readonly [k: string]: unknown;
}

/**
 * §FIX-UNDO-CAPTURE-SYSTEMIC (L-72) — build the forward/inverse PatchPair that
 * records a 3D-gizmo furniture MOVE / ROTATE on the ring buffer (the single
 * unified undo timeline; C03 §4.1 / §4.6). Store-relative JSON-Patch (path[0] =
 * furniture id, path[1] = field) — the exact shape elementUndoStoreAdapter routes
 * to `furnitureStore.update(id, { position | rotation })`, which emits
 * `bim-furniture-updated` → the furniture mesh + plan symbol re-project. Returns
 * `null` (→ empty patches, nothing half-undoable) unless at least one field has
 * BOTH a next and a matching pre-move value.
 */
function _furnitureMovePatchPair(cmd: UpdateFurnitureParametersPayload): { forward: Patch[]; inverse: Patch[] } | null {
  const forward: Patch[] = [];
  const inverse: Patch[] = [];
  if (cmd.position && cmd._prevPosition) {
    forward.push({ op: 'replace', path: [cmd.id, 'position'], value: { ...cmd.position } });
    inverse.push({ op: 'replace', path: [cmd.id, 'position'], value: { ...cmd._prevPosition } });
  }
  if (cmd.rotation && cmd._prevRotation) {
    forward.push({ op: 'replace', path: [cmd.id, 'rotation'], value: { ...cmd.rotation } });
    inverse.push({ op: 'replace', path: [cmd.id, 'rotation'], value: { ...cmd._prevRotation } });
  }
  return forward.length > 0 ? { forward, inverse } : null;
}

export const UpdateFurnitureParametersHandler: CommandHandler<UpdateFurnitureParametersPayload, Record<string, unknown>> = {
  type: 'furniture.updateParameters',
  // §FIX-UNDO-CAPTURE-SYSTEMIC (L-72) — declare the `furniture` store so the
  // forward/inverse PatchPair emitted on a 3D-gizmo move/rotate is routed onto the
  // ring buffer (CommandBus routes patches by affectedStores). Previously this was
  // `[]` with empty patches, so EVERY 3D furniture move/rotate was classified as an
  // EMPTY-PATCH record and SKIPPED the ring buffer — the move landed ONLY in the
  // legacy commandManager, so the ring-buffer-FIRST performUndo() undid whatever
  // covered element was on the ring and the furniture "stayed moved" (same class as
  // L-49 for walls). Non-drag callers still return empty patches → still skipped.
  affectedStores: ['furniture'] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: UpdateFurnitureParametersPayload,
  ): ValidationResult {
    if (!cmd.id) return { valid: false, reason: 'furniture id is required' };
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: UpdateFurnitureParametersPayload,
  ): HandlerResult {
    return withHandlerSpan('furniture.updateParameters.handler', { 'pryzm.command.type': 'furniture.updateParameters' }, () => {
      // §FIX-UNDO-CAPTURE-SYSTEMIC (L-72) — record the move/rotate on the ring
      // buffer as ONE undoable step when the 3D-gizmo drag-end opts in via
      // `_recordUndo`. The commandManager bridge below still performs the
      // authoritative store mutation + mesh rebuild at execute time; these patches
      // are applied ONLY on undo/redo (elementUndoStoreAdapter → furnitureStore.update),
      // and the commandManager twin is shadow-dropped by performUndo() after the
      // ring-buffer undo (dual-dispatch — exactly like a 3D CREATE).
      const patches = cmd._recordUndo ? _furnitureMovePatchPair(cmd) : null;
      const result: HandlerResult = patches ?? { forward: [], inverse: [] };

      const cm = window.commandManager as { execute(cmd: unknown, options?: unknown): void } | undefined;
      if (cm) {
        try {
          cm.execute(new UpdateFurnitureParametersCommand(cmd as any));
        } catch (e) {
          console.error('[furniture.updateParameters.handler] bridge failed:', e);
        }
      }
      return result;
    }); // withHandlerSpan — C10 §2
  },
};
