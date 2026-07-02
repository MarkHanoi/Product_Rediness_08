// UpdateWallBaselineHandler — E.5.x migration bridge.
// Maps bus type wall.updateBaseline to the legacy UpdateWallBaselineCommand.
// TODO(F-1.4): replace with authoritative wall-store Immer update.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type Patch,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { UpdateWallBaselineCommand } from '@pryzm/command-registry';

type Pt = { x: number; y: number; z: number };

const _clonePt = (p: Pt): Pt => ({ x: p.x, y: p.y, z: p.z });

/**
 * §FIX-WALL-MOVE-UNDO-CAPTURE (L-49) — build the forward/inverse PatchPair that
 * records a 3D-gizmo wall move on the ring buffer (the single unified undo
 * timeline; C03 §4.1 / §4.6). Returns `null` when the payload lacks a usable
 * `prevBaseLine` (the ONLY input that lets undo restore the pre-move position),
 * so such callers keep the previous empty-patch behaviour rather than recording
 * a half-undoable step.
 */
function _baselinePatchPair(cmd: UpdateWallBaselinePayload): { forward: Patch[]; inverse: Patch[] } | null {
  const nb = cmd.newBaseLine;
  const pb = cmd.prevBaseLine;
  if (!Array.isArray(nb) || nb.length !== 2 || !nb[0] || !nb[1]) return null;
  if (!Array.isArray(pb) || pb.length !== 2 || !pb[0] || !pb[1]) return null;
  // Store-relative JSON-Patch (path[0] = wall id, path[1] = field) — the exact
  // shape elementUndoStoreAdapter routes to `wallStore.update(id, { baseLine })`,
  // which emits `bim-wall-updated` → WallRebuildCoordinator rebuilds the mesh.
  // WallStore.update clears `_sourceBaseLine` when baseLine changes without it, so
  // the join resolver re-seeds from the restored baseLine (no snap-back) — we do
  // NOT touch the join/baseline-preserve logic here (that is a sibling's concern).
  return {
    forward: [{ op: 'replace', path: [cmd.wallId, 'baseLine'], value: [_clonePt(nb[0]), _clonePt(nb[1])] }],
    inverse: [{ op: 'replace', path: [cmd.wallId, 'baseLine'], value: [_clonePt(pb[0]), _clonePt(pb[1])] }],
  };
}

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
  /**
   * §FIX-WALL-MOVE-UNDO-CAPTURE (L-49) — opt this dispatch into the unified
   * ring-buffer undo timeline. When `true`, execute() returns a forward/inverse
   * baseLine PatchPair (in addition to the commandManager bridge below), so the
   * move is captured as ONE undoable step on the ring buffer — the SAME stack the
   * unified performUndo() consults first, and the commandManager twin is
   * shadow-dropped after a ring-buffer undo (dual-dispatch, exactly like a 3D
   * wall CREATE). Only the 3D-gizmo drag-end sets this today; other baseline
   * callers (plan-view move/align tools, property panel) keep their existing
   * empty-patch behaviour so their undo routing is left untouched.
   */
  readonly _recordUndo?: boolean;
}

export const UpdateWallBaselineHandler: CommandHandler<UpdateWallBaselinePayload, Record<string, unknown>> = {
  type: 'wall.updateBaseline',
  // §FIX-WALL-MOVE-UNDO-CAPTURE (L-49) — declare the `wall` store so the
  // forward/inverse baseLine PatchPair this handler emits is routed onto the
  // ring buffer (CommandBus §U-B6 routes patches by affectedStores). Previously
  // this was `[]` with empty patches, so the CommandBus classified every 3D wall
  // move as an EMPTY-PATCH record and SKIPPED the ring buffer — the move landed
  // ONLY in the legacy commandManager (via the bridge below). Because the unified
  // performUndo() is ring-buffer-FIRST, any covered `wall` entry already on the
  // ring (the wall's own create, a generated batch, …) was undone instead, and
  // the commandManager-only move — stranded on the independent cm cursor — was
  // never reached ("wall stays moved", log: `ring-buffer applied — stores: wall`).
  affectedStores: ['wall'] as const,

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
      // §FIX-WALL-MOVE-UNDO-CAPTURE (L-49) — record the move on the ring buffer as
      // ONE undoable step, but ONLY when the caller opted in via `_recordUndo`
      // (the 3D-gizmo drag-end). The bridge below (commandManager) still performs
      // the authoritative store mutation + rebuild-with-voids at execute time;
      // these patches are applied ONLY on undo/redo (via elementUndoStoreAdapter →
      // wallStore.update), and the commandManager twin is shadow-dropped by
      // performUndo() after the ring-buffer undo. Callers that do NOT opt in
      // (plan-view move/align tools, property panel) keep the previous empty-patch
      // behaviour so their undo routing is untouched. A missing prevBaseLine also
      // yields null → empty patches (nothing half-undoable is recorded).
      const patches = cmd._recordUndo ? _baselinePatchPair(cmd) : null;
      const result: HandlerResult = patches ?? { forward: [], inverse: [] };

      // [F-1.2 R2/R3] Skip bridge when the call site already issued a direct
      // window.commandManager direct execute call (P4.4).
      // This prevents a duplicate undo-stack entry and a redundant rebuild pass.
      // External callers (AI pipeline, CRDT sync, IFC importer) that only reach
      // the wall through the bus do NOT set _skipBridge and are bridged normally.
      if (cmd._skipBridge) {
        return result;
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
      return result;
    });
  },
};
