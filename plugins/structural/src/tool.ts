// StructuralPlacementTool — single-click placement of brace/footing/connection.
//
// THREE-free.  The wrapping renderer projects the click to a Vec3 via
// `screenToWorld`, then this tool dispatches the create command.

import type { CommandBus } from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import { isFiniteVec3 } from './intent.js';
import type { StructuralData } from './store.js';

export const STRUCTURAL_TOOL_ID = 'structural.placement';

export interface StructuralToolPoint3D { x: number; y: number; z: number }

export type StructuralScreenToWorld = (
  ev: { clientX: number; clientY: number; pointerId: number },
) => StructuralToolPoint3D | undefined;

export interface StructuralPlacementToolDeps {
  readonly commandBus: CommandBus;
  readonly screenToWorld: StructuralScreenToWorld;
  readonly levelId?: () => string;
  readonly kind?: StructuralData['kind'];
  readonly width?: number;
  readonly depth?: number;
  readonly thickness?: number;
  readonly radius?: number;
}

export class StructuralPlacementTool {
  private readonly bus: CommandBus;
  private readonly screenToWorld: StructuralScreenToWorld;
  private readonly levelId: () => string;
  private readonly kind: StructuralData['kind'];
  private readonly width: number;
  private readonly depth: number;
  private readonly thickness: number;
  private readonly radius: number;

  constructor(deps: StructuralPlacementToolDeps) {
    if (!deps.commandBus) throw new Error('[StructuralPlacementTool] commandBus is required');
    if (!deps.screenToWorld) throw new Error('[StructuralPlacementTool] screenToWorld is required');
    this.bus = deps.commandBus;
    this.screenToWorld = deps.screenToWorld;
    this.levelId = deps.levelId ?? (() => '');
    this.kind = deps.kind ?? 'footing';
    this.width = deps.width ?? 0.6;
    this.depth = deps.depth ?? 0.6;
    this.thickness = deps.thickness ?? 0.4;
    this.radius = deps.radius ?? 0.06;
  }

  async onPointerDown(ev: {
    clientX: number; clientY: number; pointerId: number;
  }): Promise<string | undefined> {
    const p = this.screenToWorld(ev);
    if (!isFiniteVec3(p)) return undefined;
    const id = createId('structural');
    await this.bus.executeCommand('structural.create', {
      id,
      origin: p,
      kind: this.kind,
      width: this.width,
      depth: this.depth,
      thickness: this.thickness,
      radius: this.radius,
      levelId: this.levelId(),
    });
    return id;
  }
}
