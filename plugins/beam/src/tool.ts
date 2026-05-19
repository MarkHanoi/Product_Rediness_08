// BeamPlacementTool — vanilla TS, THREE-free (S12-T3).
//
// Two-click placement: caller streams clicks; on the second click the
// tool dispatches `beam.create`.

import type { CommandBus } from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import { isFiniteVec3, isNonZeroBaseLine } from './intent.js';

export const BEAM_TOOL_ID = 'beam.placement';

export interface BeamToolPoint3D { x: number; y: number; z: number }

export type BeamScreenToWorld = (
  ev: { clientX: number; clientY: number; pointerId: number },
) => BeamToolPoint3D | undefined;

export interface BeamPlacementToolDeps {
  readonly commandBus: CommandBus;
  readonly screenToWorld: BeamScreenToWorld;
  readonly levelId?: () => string;
  readonly width?: number;
  readonly depth?: number;
}

export class BeamPlacementTool {
  private readonly bus: CommandBus;
  private readonly screenToWorld: BeamScreenToWorld;
  private readonly levelId: () => string;
  private readonly width: number;
  private readonly depth: number;
  private firstPoint: BeamToolPoint3D | undefined;

  constructor(deps: BeamPlacementToolDeps) {
    if (!deps.commandBus) throw new Error('[BeamPlacementTool] commandBus is required');
    if (!deps.screenToWorld) throw new Error('[BeamPlacementTool] screenToWorld is required');
    this.bus = deps.commandBus;
    this.screenToWorld = deps.screenToWorld;
    this.levelId = deps.levelId ?? (() => '');
    this.width = deps.width ?? 0.2;
    this.depth = deps.depth ?? 0.4;
  }

  async onPointerDown(ev: {
    clientX: number;
    clientY: number;
    pointerId: number;
  }): Promise<string | undefined> {
    const p = this.screenToWorld(ev);
    if (!isFiniteVec3(p)) return undefined;
    if (!this.firstPoint) {
      this.firstPoint = p;
      return undefined;
    }
    if (!isNonZeroBaseLine(this.firstPoint, p)) {
      this.firstPoint = undefined;
      return undefined;
    }
    const id = createId('beam');
    await this.bus.executeCommand('beam.create', {
      id,
      baseLine: [this.firstPoint, p],
      width: this.width,
      depth: this.depth,
      levelId: this.levelId(),
    });
    this.firstPoint = undefined;
    return id;
  }

  cancel(): void { this.firstPoint = undefined; }
  get pendingFirstPoint(): BeamToolPoint3D | undefined { return this.firstPoint; }
}
