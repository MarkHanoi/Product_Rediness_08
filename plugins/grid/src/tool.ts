// GridPlacementTool — vanilla TS, THREE-free (S12-T4).
//
// One-click placement: caller projects the click, tool dispatches
// `grid.create` immediately with a default rectangular grid.

import type { CommandBus } from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import { generateRectGridLines, type RectGridSpec } from './intent.js';

export const GRID_TOOL_ID = 'grid.placement';

export interface GridToolPoint3D { x: number; y: number; z: number }

export type GridScreenToWorld = (
  ev: { clientX: number; clientY: number; pointerId: number },
) => GridToolPoint3D | undefined;

export interface GridPlacementToolDeps {
  readonly commandBus: CommandBus;
  readonly screenToWorld: GridScreenToWorld;
  readonly levelId?: () => string;
  readonly defaultSpec?: Omit<RectGridSpec, 'origin'>;
}

export class GridPlacementTool {
  private readonly bus: CommandBus;
  private readonly screenToWorld: GridScreenToWorld;
  private readonly levelId: () => string;
  private readonly defaults: Omit<RectGridSpec, 'origin'>;

  constructor(deps: GridPlacementToolDeps) {
    if (!deps.commandBus) throw new Error('[GridPlacementTool] commandBus is required');
    if (!deps.screenToWorld) throw new Error('[GridPlacementTool] screenToWorld is required');
    this.bus = deps.commandBus;
    this.screenToWorld = deps.screenToWorld;
    this.levelId = deps.levelId ?? (() => '');
    this.defaults = deps.defaultSpec ?? {
      spacingX: 6, spacingZ: 6, countX: 5, countZ: 4, extent: 24,
    };
  }

  async onPointerDown(ev: {
    clientX: number;
    clientY: number;
    pointerId: number;
  }): Promise<string | undefined> {
    const p = this.screenToWorld(ev);
    if (!p) return undefined;
    const id = createId('grid');
    const lines = generateRectGridLines({ ...this.defaults, origin: p });
    await this.bus.executeCommand('grid.create', {
      id, levelId: this.levelId(), lines,
    });
    return id;
  }
}
