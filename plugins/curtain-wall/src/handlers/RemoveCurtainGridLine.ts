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
// Previously returned { forward: [], inverse: [] } causing curtain-wall.removeGridLine
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
  type: 'curtain-wall.removeGridLine',
  /** §FIX-COMMAND-NAMESPACE (L-796) — deprecated pre-migration spelling. */
  aliases: ['curtainwall.removeGridLine'] as const,
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
    return withHandlerSpan('curtain-wall.removeGridLine.handler', { 'pryzm.command.type': 'curtain-wall.removeGridLine' }, () => {
      const [next, forward, inverse] = produceCommand<CurtainWallsState>(ctx.stores.curtainwall, draft => {
        const cw = draft[cmd.curtainWallId];
        if (!cw) {
          console.error('[curtain-wall.removeGridLine] curtain wall not found in store:', cmd.curtainWallId);
          return;
        }

        // Compute baseLine length without THREE (P0.3 DTO migration).
        const [start, end] = cw.baseLine;
        const dx = end.x - start.x, dy = end.y - start.y, dz = end.z - start.z;
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

        //
        // §L-1052 — THESE TWO ARGUMENTS USED TO BE `(cw as any).gridXSpacing` /
        // `.gridYSpacing`, AND THEY WERE `undefined` ON EVERY EXECUTION. `cw` here
        // is `ctx.stores.curtainwall[id]` — the L0-parsed DTO record
        // (`CreateCurtainWall.ts:99` does `CurtainWall.parse(seed)`), whose spacing
        // fields are `bayWidth` / `bayHeight`
        // (`packages/schemas/src/elements/CurtainWall.ts:91,93`). `gridXSpacing` is
        // the LEGACY name and appears nowhere on that schema; the `as any` at both
        // reads is what stopped `tsc` saying so (C84 EI-2c). The consequence was
        // not a wrong number but an INVALID grid: `length / undefined` is NaN,
        // `Math.max(1, NaN)` is NaN, and the generation loop never ran, so the
        // migration returned `{uLines: [], vLines: []}` — below this module's own
        // >=2-lines invariant — and that is what got written to the store and
        // carried to the AUTHORITATIVE legacy record by the 2-segment undo path
        // (C87 §6, the row that reads "works today"). Reading the real fields also
        // removes the two casts.
        const currentGrid: CurtainGridSystem = (cw as any).gridSystem
          ?? migrateToGridSystem(length, cw.height, cw.bayWidth, cw.bayHeight, cmd.curtainWallId);

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
