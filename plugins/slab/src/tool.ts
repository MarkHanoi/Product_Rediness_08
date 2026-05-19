// SlabPlacementTool — vanilla TS, THREE-free (S12-T2).
//
// Drives the floor-sketch UX: caller streams click points; on
// `commit()` the tool dispatches a single `slab.create` command with
// the accumulated boundary.
//
// Strict-injection (constructor throws on missing dependencies),
// matching the door / roof tools.

import type { CommandBus } from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import { validateSlabBoundary } from './intent.js';

export const SLAB_TOOL_ID = 'slab.placement';

export interface SlabToolPoint3D {
  x: number;
  y: number;
  z: number;
}

export type SlabScreenToWorld = (
  ev: { clientX: number; clientY: number; pointerId: number },
) => SlabToolPoint3D | undefined;

export interface SlabPlacementToolDeps {
  readonly commandBus: CommandBus;
  readonly screenToWorld: SlabScreenToWorld;
  /** Optional: level to assign to the new slab.  Defaults to ''. */
  readonly levelId?: () => string;
  /** Optional: thickness (m).  Defaults to 0.2 (matches schema default). */
  readonly thickness?: number;
}

export class SlabPlacementTool {
  private readonly bus: CommandBus;
  private readonly screenToWorld: SlabScreenToWorld;
  private readonly levelId: () => string;
  private readonly thickness: number;
  private readonly points: SlabToolPoint3D[] = [];

  constructor(deps: SlabPlacementToolDeps) {
    if (!deps.commandBus) throw new Error('[SlabPlacementTool] commandBus is required');
    if (!deps.screenToWorld) throw new Error('[SlabPlacementTool] screenToWorld is required');
    this.bus = deps.commandBus;
    this.screenToWorld = deps.screenToWorld;
    this.levelId = deps.levelId ?? (() => '');
    this.thickness = deps.thickness ?? 0.2;
  }

  /** Append a click to the in-progress polygon.  Returns the running
   *  vertex count, or `undefined` when the click could not be
   *  projected to world space. */
  onPointerDown(ev: {
    clientX: number;
    clientY: number;
    pointerId: number;
  }): number | undefined {
    const p = this.screenToWorld(ev);
    if (!p) return undefined;
    this.points.push(p);
    return this.points.length;
  }

  /** Discard the in-progress sketch. */
  cancel(): void {
    this.points.length = 0;
  }

  /** Finalise the sketch: validate, dispatch `slab.create`, return the
   *  minted slab id.  Returns `undefined` when the polygon is invalid. */
  async commit(): Promise<string | undefined> {
    const validation = validateSlabBoundary(this.points);
    if (!validation.ok) {
      this.points.length = 0;
      return undefined;
    }
    const id = createId('slab');
    await this.bus.executeCommand('slab.create', {
      id,
      boundary: [...this.points],
      thickness: this.thickness,
      levelId: this.levelId(),
    });
    this.points.length = 0;
    return id;
  }

  /** Snapshot of the in-progress polygon (test fixture). */
  get pendingPoints(): readonly SlabToolPoint3D[] {
    return this.points;
  }
}
