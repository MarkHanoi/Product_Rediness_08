// HandrailPlacementTool — minimal two-click handrail placement (S14-T4).

import type { CommandBus } from '@pryzm/plugin-sdk';
import type { HandrailData } from './store.js';

export const HANDRAIL_TOOL_ID = 'handrail.placement';

export type HandrailToolPoint3D = { readonly x: number; readonly y: number; readonly z: number };
export type HandrailScreenToWorld = (sx: number, sy: number) => HandrailToolPoint3D | null;

export interface HandrailPlacementToolDeps {
  readonly bus: CommandBus;
  readonly screenToWorld: HandrailScreenToWorld;
  readonly defaults?: Partial<Pick<HandrailData, 'shape' | 'height' | 'diameter'>>;
}

export class HandrailPlacementTool {
  readonly id = HANDRAIL_TOOL_ID;
  private firstPoint: HandrailToolPoint3D | null = null;

  constructor(private readonly deps: HandrailPlacementToolDeps) {}

  async onClick(sx: number, sy: number): Promise<string | null> {
    const p = this.deps.screenToWorld(sx, sy);
    if (!p) return null;
    if (!this.firstPoint) {
      this.firstPoint = p;
      return null;
    }
    const path = [this.firstPoint, p];
    this.firstPoint = null;
    const id = `handrail_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
    await this.deps.bus.executeCommand('handrail.create', {
      id,
      path,
      shape: this.deps.defaults?.shape ?? 'round',
      height: this.deps.defaults?.height ?? 1.0,
      diameter: this.deps.defaults?.diameter ?? 0.04,
    });
    return id;
  }

  reset(): void { this.firstPoint = null; }
}
