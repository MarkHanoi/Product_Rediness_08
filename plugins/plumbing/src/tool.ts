// PlumbingPlacementTool — single-click placement of a pipe segment.

import type { CommandBus } from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import { isFiniteVec3 } from './intent.js';
import type { PlumbingData } from './store.js';

export const PLUMBING_TOOL_ID = 'plumbing.placement';

export interface PlumbingToolPoint3D { x: number; y: number; z: number }

export type PlumbingScreenToWorld = (
  ev: { clientX: number; clientY: number; pointerId: number },
) => PlumbingToolPoint3D | undefined;

export interface PlumbingPlacementToolDeps {
  readonly commandBus: CommandBus;
  readonly screenToWorld: PlumbingScreenToWorld;
  readonly levelId?: () => string;
  readonly kind?: PlumbingData['kind'];
  readonly diameter?: number;
  readonly length?: number;
  readonly systemTag?: string;
}

export class PlumbingPlacementTool {
  private readonly bus: CommandBus;
  private readonly screenToWorld: PlumbingScreenToWorld;
  private readonly levelId: () => string;
  private readonly kind: PlumbingData['kind'];
  private readonly diameter: number;
  private readonly length: number;
  private readonly systemTag: string;

  constructor(deps: PlumbingPlacementToolDeps) {
    if (!deps.commandBus) throw new Error('[PlumbingPlacementTool] commandBus is required');
    if (!deps.screenToWorld) throw new Error('[PlumbingPlacementTool] screenToWorld is required');
    this.bus = deps.commandBus;
    this.screenToWorld = deps.screenToWorld;
    this.levelId = deps.levelId ?? (() => '');
    this.kind = deps.kind ?? 'straight';
    this.diameter = deps.diameter ?? 0.05;
    this.length = deps.length ?? 1;
    this.systemTag = deps.systemTag ?? 'cold-water';
  }

  async onPointerDown(ev: { clientX: number; clientY: number; pointerId: number }): Promise<string | undefined> {
    const p = this.screenToWorld(ev);
    if (!isFiniteVec3(p)) return undefined;
    const id = createId('plumbing');
    await this.bus.executeCommand('plumbing.create', {
      id, origin: p, kind: this.kind, diameter: this.diameter,
      length: this.length, systemTag: this.systemTag, levelId: this.levelId(),
    });
    return id;
  }
}
