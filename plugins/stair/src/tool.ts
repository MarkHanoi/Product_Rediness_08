// StairPlacementTool — minimal click-to-place stair tool (S14-T1).
//
// The tool layer is non-rendering: it captures one click → emits a
// `stair.create` command via the bus.  Renderer-side tool affordances
// (preview ghost, snap glyphs) live in a future viewport tool layer.

import type { CommandBus } from '@pryzm/plugin-sdk';
import type { StairData } from './store.js';

export const STAIR_TOOL_ID = 'stair.placement';

export type StairToolPoint3D = { readonly x: number; readonly y: number; readonly z: number };
export type StairScreenToWorld = (sx: number, sy: number) => StairToolPoint3D | null;

export interface StairPlacementToolDeps {
  readonly bus: CommandBus;
  readonly screenToWorld: StairScreenToWorld;
  readonly defaults?: Partial<Pick<StairData,
    'shape' | 'numRisers' | 'treadDepth' | 'riserHeight' | 'width'
  >>;
}

export class StairPlacementTool {
  readonly id = STAIR_TOOL_ID;
  constructor(private readonly deps: StairPlacementToolDeps) {}

  async onClick(sx: number, sy: number): Promise<string | null> {
    const p = this.deps.screenToWorld(sx, sy);
    if (!p) return null;
    const id = `stair_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
    await this.deps.bus.executeCommand('stair.create', {
      id,
      origin: p,
      shape: this.deps.defaults?.shape ?? 'straight',
      numRisers: this.deps.defaults?.numRisers ?? 15,
      treadDepth: this.deps.defaults?.treadDepth ?? 0.28,
      riserHeight: this.deps.defaults?.riserHeight ?? 0.18,
      width: this.deps.defaults?.width ?? 1.0,
    });
    return id;
  }
}
