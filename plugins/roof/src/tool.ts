// RoofPlacementTool — vanilla TS, THREE-free (S11-T3).
//
// Roofs are placed by capturing a polygon footprint (e.g. via a drag
// session bounding box, a slab outline, or a manual polyline tool).
// This tool is intentionally minimal: callers feed it the resolved
// boundary and it dispatches `roof.create`.  Boundary capture itself
// is the editor's concern — the plugin must not own UI state.

import type { CommandBus } from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import { validatePolygon } from './intent.js';
import {
  getRoofType,
  DEFAULT_ROOF_TYPE_ID,
  type RoofType,
} from '@pryzm/plugin-sdk';

export const ROOF_TOOL_ID = 'roof.placement';

interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface RoofPlacementToolDeps {
  readonly commandBus: CommandBus;
  readonly defaultType?: RoofType;
}

export interface RoofPlacementInput {
  readonly boundary: readonly Vec3Like[];
  readonly levelId?: string;
  readonly systemTypeId?: string;
}

export class RoofPlacementTool {
  private readonly bus: CommandBus;
  private readonly defaultType: RoofType;

  constructor(deps: RoofPlacementToolDeps) {
    if (!deps.commandBus) throw new Error('[RoofPlacementTool] commandBus is required');
    this.bus = deps.commandBus;
    this.defaultType =
      deps.defaultType ??
      getRoofType(DEFAULT_ROOF_TYPE_ID) ??
      (() => {
        throw new Error('[RoofPlacementTool] default roof type not found');
      })();
  }

  async place(
    input: RoofPlacementInput,
  ): Promise<{ roofId: string } | undefined> {
    const validation = validatePolygon(input.boundary);
    if (!validation.valid) return undefined;

    const typeId = input.systemTypeId ?? this.defaultType.id;
    const type = getRoofType(typeId) ?? this.defaultType;
    const roofId = createId('roof');
    await this.bus.executeCommand('roof.create', {
      id: roofId,
      levelId: input.levelId ?? '',
      boundary: input.boundary.map((p) => ({ x: p.x, y: p.y, z: p.z })),
      shape: type.shape,
      pitch: type.pitch,
      thickness: type.thickness,
      overhang: type.overhang,
      materialColor: type.materialColor,
      systemTypeId: type.id,
    });
    return { roofId };
  }
}
