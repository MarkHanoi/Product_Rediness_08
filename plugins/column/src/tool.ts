// ColumnPlacementTool — vanilla TS, THREE-free (S12-T3).
//
// One-click placement: caller projects the click, tool dispatches
// `column.create` immediately.

import type { CommandBus } from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import { isFiniteVec3 } from './intent.js';

export const COLUMN_TOOL_ID = 'column.placement';

export interface ColumnToolPoint3D { x: number; y: number; z: number }

export type ColumnScreenToWorld = (
  ev: { clientX: number; clientY: number; pointerId: number },
) => ColumnToolPoint3D | undefined;

export interface ColumnPlacementToolDeps {
  readonly commandBus: CommandBus;
  readonly screenToWorld: ColumnScreenToWorld;
  readonly levelId?: () => string;
  readonly height?: number;
  readonly width?: number;
  readonly depth?: number;
}

export class ColumnPlacementTool {
  private readonly bus: CommandBus;
  private readonly screenToWorld: ColumnScreenToWorld;
  private readonly levelId: () => string;
  private readonly height: number;
  private readonly width: number;
  private readonly depth: number;

  constructor(deps: ColumnPlacementToolDeps) {
    if (!deps.commandBus) throw new Error('[ColumnPlacementTool] commandBus is required');
    if (!deps.screenToWorld) throw new Error('[ColumnPlacementTool] screenToWorld is required');
    this.bus = deps.commandBus;
    this.screenToWorld = deps.screenToWorld;
    this.levelId = deps.levelId ?? (() => '');
    this.height = deps.height ?? 3;
    this.width = deps.width ?? 0.4;
    this.depth = deps.depth ?? 0.4;
  }

  async onPointerDown(ev: {
    clientX: number;
    clientY: number;
    pointerId: number;
  }): Promise<string | undefined> {
    const p = this.screenToWorld(ev);
    if (!isFiniteVec3(p)) return undefined;
    const id = createId('column');
    await this.bus.executeCommand('column.create', {
      id,
      origin: p,
      height: this.height,
      width: this.width,
      depth: this.depth,
      levelId: this.levelId(),
    });
    return id;
  }
}
