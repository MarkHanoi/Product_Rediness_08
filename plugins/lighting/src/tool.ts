// LightingPlacementTool — single-click placement of a fixture.

import type { CommandBus } from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import { isFiniteVec3 } from './intent.js';
import type { LightingData } from './store.js';

export const LIGHTING_TOOL_ID = 'lighting.placement';

export interface LightingToolPoint3D { x: number; y: number; z: number }

export type LightingScreenToWorld = (
  ev: { clientX: number; clientY: number; pointerId: number },
) => LightingToolPoint3D | undefined;

export interface LightingPlacementToolDeps {
  readonly commandBus: CommandBus;
  readonly screenToWorld: LightingScreenToWorld;
  readonly levelId?: () => string;
  readonly kind?: LightingData['kind'];
  readonly intensity?: number;
  readonly range?: number;
}

export class LightingPlacementTool {
  private readonly bus: CommandBus;
  private readonly screenToWorld: LightingScreenToWorld;
  private readonly levelId: () => string;
  private readonly kind: LightingData['kind'];
  private readonly intensity: number;
  private readonly range: number;

  constructor(deps: LightingPlacementToolDeps) {
    if (!deps.commandBus) throw new Error('[LightingPlacementTool] commandBus is required');
    if (!deps.screenToWorld) throw new Error('[LightingPlacementTool] screenToWorld is required');
    this.bus = deps.commandBus;
    this.screenToWorld = deps.screenToWorld;
    this.levelId = deps.levelId ?? (() => '');
    this.kind = deps.kind ?? 'downlight';
    this.intensity = deps.intensity ?? 1;
    this.range = deps.range ?? 6;
  }

  async onPointerDown(ev: { clientX: number; clientY: number; pointerId: number }): Promise<string | undefined> {
    const p = this.screenToWorld(ev);
    if (!isFiniteVec3(p)) return undefined;
    const id = createId('lighting');
    await this.bus.executeCommand('lighting.create', {
      id, origin: p, kind: this.kind, intensity: this.intensity, range: this.range,
      levelId: this.levelId(),
    });
    return id;
  }
}
