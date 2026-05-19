// CurtainWallPlacementTool — vanilla TS, THREE-free (S12-T5).

import type { CommandBus } from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import { isFiniteVec3, isNonZeroBaseLine } from './intent.js';

export const CURTAIN_WALL_TOOL_ID = 'curtainwall.placement';

export interface CurtainWallToolPoint3D { x: number; y: number; z: number }

export type CurtainWallScreenToWorld = (
  ev: { clientX: number; clientY: number; pointerId: number },
) => CurtainWallToolPoint3D | undefined;

export interface CurtainWallPlacementToolDeps {
  readonly commandBus: CommandBus;
  readonly screenToWorld: CurtainWallScreenToWorld;
  readonly levelId?: () => string;
  readonly height?: number;
  readonly bayWidth?: number;
  readonly bayHeight?: number;
  readonly mullionThickness?: number;
}

export class CurtainWallPlacementTool {
  private readonly bus: CommandBus;
  private readonly screenToWorld: CurtainWallScreenToWorld;
  private readonly levelId: () => string;
  private readonly height: number;
  private readonly bayWidth: number;
  private readonly bayHeight: number;
  private readonly mullionThickness: number;
  private firstPoint: CurtainWallToolPoint3D | undefined;

  constructor(deps: CurtainWallPlacementToolDeps) {
    if (!deps.commandBus) throw new Error('[CurtainWallPlacementTool] commandBus is required');
    if (!deps.screenToWorld) throw new Error('[CurtainWallPlacementTool] screenToWorld is required');
    this.bus = deps.commandBus;
    this.screenToWorld = deps.screenToWorld;
    this.levelId = deps.levelId ?? (() => '');
    this.height = deps.height ?? 3;
    this.bayWidth = deps.bayWidth ?? 1.2;
    this.bayHeight = deps.bayHeight ?? 1.5;
    this.mullionThickness = deps.mullionThickness ?? 0.05;
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
    const id = createId('curtainwall');
    await this.bus.executeCommand('curtainwall.create', {
      id,
      baseLine: [this.firstPoint, p],
      height: this.height,
      bayWidth: this.bayWidth,
      bayHeight: this.bayHeight,
      mullionThickness: this.mullionThickness,
      levelId: this.levelId(),
    });
    this.firstPoint = undefined;
    return id;
  }

  cancel(): void { this.firstPoint = undefined; }
  get pendingFirstPoint(): CurtainWallToolPoint3D | undefined { return this.firstPoint; }
}
