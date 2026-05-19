// AddCurtainGridLineHandler — TASK-07 Phase B (MASTER-IMPL-PLAN-2026-05-18 BUG-7).
//
// Replaced E.5.x commandManager bridge with authoritative Immer produceCommand so
// the RingBufferUndoStack receives a real inverse patch and Ctrl+Z actually works.
//
// §MI-05 preserved: newLineId is pre-generated before produceCommand so the Immer
// forward patch records insertion of that specific, stable ID. Undo applies the
// inverse patch (removes the line by ID). Redo applies forward.ops — ID stability
// is automatic because the patch encodes the exact state, not a re-execution.
//
// Previously returned { forward: [], inverse: [] } causing curtainwall.addGridLine
// to be non-undoable. AddCurtainGridLineCommand in packages/command-registry/ is
// now orphaned by this path.
// TODO(E.5.x): ORPHANED — bridge migrated to produceCommand. Confirm no other
// callers remain then remove AddCurtainGridLineCommand in Phase E.5.x cleanup.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import {
  migrateToGridSystem,
  insertGridLine,
  type CurtainGridSystem,
} from '@pryzm/geometry-curtain-wall';
import type { CurtainWallsState } from '../store.js';

export interface AddCurtainGridLinePayload {
  readonly curtainWallId: string;
  /** 'u' inserts along the length axis; 'v' inserts along the height axis. */
  readonly axis: 'u' | 'v';
  /** Normalized position on the axis (0..1 exclusive of boundaries). */
  readonly t: number;
}

type CWHandlerStores = Readonly<{ curtainwall: CurtainWallsState } & Record<string, unknown>>;

export const AddCurtainGridLineHandler: CommandHandler<AddCurtainGridLinePayload, CWHandlerStores> = {
  type: 'curtainwall.addGridLine',
  affectedStores: ['curtainwall'] as const,

  canExecute(
    ctx: HandlerContext<CWHandlerStores>,
    cmd: AddCurtainGridLinePayload,
  ): ValidationResult {
    if (!cmd.curtainWallId) return { valid: false, reason: 'curtainWallId is required' };
    if (cmd.axis !== 'u' && cmd.axis !== 'v') return { valid: false, reason: 'axis must be u or v' };
    if (!Number.isFinite(cmd.t) || cmd.t <= 0.001 || cmd.t >= 0.999) {
      return { valid: false, reason: 't must be between 0.001 and 0.999' };
    }
    if (!ctx.stores.curtainwall[cmd.curtainWallId]) {
      return { valid: false, reason: `curtain wall not found: ${cmd.curtainWallId}` };
    }
    return { valid: true };
  },

  execute(
    ctx: HandlerContext<CWHandlerStores>,
    cmd: AddCurtainGridLinePayload,
  ): HandlerResult {
    return withHandlerSpan('curtainwall.addGridLine.handler', { 'pryzm.command.type': 'curtainwall.addGridLine' }, () => {
      // §MI-05 preserved: pre-generate the line ID outside produceCommand so the
      // exact same ID is embedded in the forward Immer patch. Redo via
      // applyPatches(forward.ops) re-inserts the line with this stable ID, keeping
      // any subsequent RemoveCurtainGridLine history entries consistent.
      const newLineId = crypto.randomUUID();

      const [next, forward, inverse] = produceCommand<CurtainWallsState>(ctx.stores.curtainwall, draft => {
        const cw = draft[cmd.curtainWallId];
        if (!cw) {
          console.error('[curtainwall.addGridLine] curtain wall not found in store:', cmd.curtainWallId);
          return;
        }

        // Compute baseLine length without THREE (P0.3 DTO migration: baseLine is [Point3D, Point3D]).
        const [start, end] = cw.baseLine;
        const dx = end.x - start.x, dy = end.y - start.y, dz = end.z - start.z;
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // Resolve current grid system (or migrate from scalar spacing fields).
        const currentGrid: CurtainGridSystem = (cw as any).gridSystem
          ?? migrateToGridSystem(length, cw.height, (cw as any).gridXSpacing, (cw as any).gridYSpacing);

        (cw as any).gridSystem = {
          uLines: cmd.axis === 'u'
            ? insertGridLine(currentGrid.uLines, cmd.t, 0.001, newLineId)
            : currentGrid.uLines.map(l => ({ id: l.id, t: l.t })),
          vLines: cmd.axis === 'v'
            ? insertGridLine(currentGrid.vLines, cmd.t, 0.001, newLineId)
            : currentGrid.vLines.map(l => ({ id: l.id, t: l.t })),
        } satisfies CurtainGridSystem;
      });

      return { forward, inverse, nextStates: { curtainwall: next } };
    }); // withHandlerSpan — C10 §2
  },
};
