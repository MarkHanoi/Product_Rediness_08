// UpdateSlabPolygonHandler — TASK-07 Phase A (MASTER-IMPL-PLAN-2026-05-18 BUG-7).
//
// Replaced F-1.3 commandManager bridge with authoritative Immer produceCommand so
// the RingBufferUndoStack receives a real inverse patch for polygon edits.
//
// Previously returned { forward: [], inverse: [] } — polygon edits were not undoable.
// UpdateSlabPolygonCommand in packages/command-registry/ is now orphaned by this path.
// TODO(E.5.x): ORPHANED — confirm no other callers then remove in Phase E.5.x cleanup.
//
// clearSketch (plan canvas sketch overlay) is a read-side side-effect; there is no
// corresponding Immer field on SlabData. The sketch is cleared by the plan canvas view
// via the domain event emitted when the store state changes — no explicit call needed here.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type { SlabsState } from '../store.js';

export interface UpdateSlabPolygonPayload {
  readonly slabId: string;
  readonly polygon: Array<{ x: number; y: number }>;
  readonly clearSketch?: boolean;
}

type SlabHandlerStores = Readonly<{ slab: SlabsState } & Record<string, unknown>>;

export const UpdateSlabPolygonHandler: CommandHandler<UpdateSlabPolygonPayload, SlabHandlerStores> = {
  type: 'slab.updatePolygon',
  affectedStores: ['slab'] as const,

  canExecute(
    ctx: HandlerContext<SlabHandlerStores>,
    cmd: UpdateSlabPolygonPayload,
  ): ValidationResult {
    if (!cmd.slabId) return { valid: false, reason: 'slabId is required' };
    if (!ctx.stores.slab[cmd.slabId]) return { valid: false, reason: `slab not found: ${cmd.slabId}` };
    if (!cmd.polygon || cmd.polygon.length < 3) {
      return { valid: false, reason: 'polygon must have at least 3 vertices' };
    }
    return { valid: true };
  },

  execute(
    ctx: HandlerContext<SlabHandlerStores>,
    cmd: UpdateSlabPolygonPayload,
  ): HandlerResult {
    return withHandlerSpan('slab.updatePolygon.handler', { 'pryzm.command.type': 'slab.updatePolygon' }, () => {
      const [next, forward, inverse] = produceCommand<SlabsState>(ctx.stores.slab, draft => {
        const slab = draft[cmd.slabId];
        if (!slab) {
          console.error('[slab.updatePolygon] slab not found in store:', cmd.slabId);
          return;
        }
        // SlabData.boundary is Vec3[] (z = elevation plane). Incoming polygon is {x,y} plan
        // coordinates — z is the slab's existing elevation (preserve from current boundary).
        const baseZ = slab.boundary[0]?.z ?? 0;
        slab.boundary = cmd.polygon.map(p => ({ x: p.x, y: p.y, z: baseZ })) as typeof slab.boundary;
      });
      return { forward, inverse, nextStates: { slab: next } };
    }); // withHandlerSpan — C10 §2
  },
};
