// RemoveCurtainGridLineHandler — TASK-07 Phase B (MASTER-IMPL-PLAN-2026-05-18 BUG-7).
//
// Replaced E.5.x commandManager bridge with authoritative Immer produceCommand so
// the RingBufferUndoStack receives a real inverse patch and Ctrl+Z actually works.
//
// The Immer inverse patch captures the full grid line re-insertion at the exact
// position it occupied before removal — equivalent to the legacy command's full
// CurtainWallData snapshot (§MI-01), but via structural Immer diffing rather than
// a manual deep-clone.
//
// Previously returned { forward: [], inverse: [] } causing curtainwall.removeGridLine
// to be non-undoable. RemoveCurtainGridLineCommand in packages/command-registry/ is
// now orphaned by this path.
// TODO(E.5.x): ORPHANED — bridge migrated to produceCommand. Confirm no other
// callers remain then remove RemoveCurtainGridLineCommand in Phase E.5.x cleanup.

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
  removeGridLine,
  type CurtainGridSystem,
} from '@pryzm/geometry-curtain-wall';
import type { CurtainWallsState } from '../store.js';

export interface RemoveCurtainGridLinePayload {
  readonly curtainWallId: string;
  /** The CurtainGridLine.id to remove. */
  readonly gridLineId: string;
  /** 'u' removes from uLines; 'v' removes from vLines. */
  readonly axis: 'u' | 'v';
}

type CWHandlerStores = Readonly<{ curtainwall: CurtainWallsState } & Record<string, unknown>>;

export const RemoveCurtainGridLineHandler: CommandHandler<RemoveCurtainGridLinePayload, CWHandlerStores> = {
  type: 'curtainwall.removeGridLine',
  affectedStores: ['curtainwall'] as const,

  canExecute(
    ctx: HandlerContext<CWHandlerStores>,
    cmd: RemoveCurtainGridLinePayload,
  ): ValidationResult {
    if (!cmd.curtainWallId) return { valid: false, reason: 'curtainWallId is required' };
    if (!cmd.gridLineId)    return { valid: false, reason: 'gridLineId is required' };
    if (cmd.axis !== 'u' && cmd.axis !== 'v') return { valid: false, reason: 'axis must be u or v' };

    const cw = ctx.stores.curtainwall[cmd.curtainWallId];
    if (!cw) return { valid: false, reason: `curtain wall not found: ${cmd.curtainWallId}` };

    // If gridSystem not yet migrated, allow execute() to migrate-then-remove.
    const grid = (cw as any).gridSystem as CurtainGridSystem | undefined;
    if (grid) {
      const lines = cmd.axis === 'u' ? grid.uLines : grid.vLines;
      const line  = lines.find(l => l.id === cmd.gridLineId);
      if (!line) {
        return { valid: false, reason: `grid line '${cmd.gridLineId}' not found on ${cmd.axis}-axis` };
      }
      if (line.t < 0.001 || line.t > 0.999) {
        return { valid: false, reason: 'cannot remove a boundary grid line (t=0 or t=1)' };
      }
      if (lines.length <= 2) {
        return { valid: false, reason: `cannot remove the last interior grid line on ${cmd.axis}-axis` };
      }
    }

    return { valid: true };
  },

  execute(
    ctx: HandlerContext<CWHandlerStores>,
    cmd: RemoveCurtainGridLinePayload,
  ): HandlerResult {
    return withHandlerSpan('curtainwall.removeGridLine.handler', { 'pryzm.command.type': 'curtainwall.removeGridLine' }, () => {
      const [next, forward, inverse] = produceCommand<CurtainWallsState>(ctx.stores.curtainwall, draft => {
        const cw = draft[cmd.curtainWallId];
        if (!cw) {
          console.error('[curtainwall.removeGridLine] curtain wall not found in store:', cmd.curtainWallId);
          return;
        }

        // Compute baseLine length without THREE (P0.3 DTO migration).
        const [start, end] = cw.baseLine;
        const dx = end.x - start.x, dy = end.y - start.y, dz = end.z - start.z;
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

        const currentGrid: CurtainGridSystem = (cw as any).gridSystem
          ?? migrateToGridSystem(length, cw.height, (cw as any).gridXSpacing, (cw as any).gridYSpacing);

        (cw as any).gridSystem = {
          uLines: cmd.axis === 'u'
            ? removeGridLine(currentGrid.uLines, cmd.gridLineId)
            : currentGrid.uLines.map(l => ({ ...l })),
          vLines: cmd.axis === 'v'
            ? removeGridLine(currentGrid.vLines, cmd.gridLineId)
            : currentGrid.vLines.map(l => ({ ...l })),
        } satisfies CurtainGridSystem;
      });

      return { forward, inverse, nextStates: { curtainwall: next } };
    }); // withHandlerSpan — C10 §2
  },
};
