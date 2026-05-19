// CeilingPlacementTool — minimal click-loop boundary tool (S14-T8).
//
// Each click adds a boundary point.  `commit()` issues `ceiling.create`
// with the accumulated boundary and resets state.

import type { CommandBus } from '@pryzm/plugin-sdk';

export const CEILING_TOOL_ID = 'ceiling.placement';

export type CeilingToolPoint3D = { readonly x: number; readonly y: number; readonly z: number };
export type CeilingScreenToWorld = (sx: number, sy: number) => CeilingToolPoint3D | null;

export interface CeilingPlacementToolDeps {
  readonly bus: CommandBus;
  readonly screenToWorld: CeilingScreenToWorld;
  readonly defaults?: { readonly ceilingHeight?: number; readonly thickness?: number };
}

export class CeilingPlacementTool {
  readonly id = CEILING_TOOL_ID;
  private points: CeilingToolPoint3D[] = [];

  constructor(private readonly deps: CeilingPlacementToolDeps) {}

  onClick(sx: number, sy: number): void {
    const p = this.deps.screenToWorld(sx, sy);
    if (p) this.points.push(p);
  }

  pointCount(): number { return this.points.length; }

  async commit(): Promise<string | null> {
    if (this.points.length < 3) return null;
    const id = `ceiling_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
    await this.deps.bus.executeCommand('ceiling.create', {
      id,
      boundary: [...this.points],
      ceilingHeight: this.deps.defaults?.ceilingHeight ?? 2.7,
      thickness: this.deps.defaults?.thickness ?? 0.05,
    });
    this.points = [];
    return id;
  }

  reset(): void { this.points = []; }
}
