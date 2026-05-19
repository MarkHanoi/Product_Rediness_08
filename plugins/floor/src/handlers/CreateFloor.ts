// CreateFloorHandler — mint a new floor finish element (§P3.2-FL).
//
// Replaces the `floor.create` bridge in initBusHandlers.ts that routed to the
// legacy CreateFloorCommand via _cmExec.  This typed handler stores the new
// FloorData in the Immer `floor` store; the initTools.ts §P3.2-FL bridge
// mirrors it to the legacy FloorStore for FloorFragmentBuilder mesh rendering.
//
// NOTE: bimManager.registerElement() and elementRegistry.registerSemantic()
// are called by the initTools.ts bridge (not here) because those singletons
// are not injected into HandlerContext.  A TODO(F.1.x) tracks moving them here.
//
// Governing contracts: C11 §5 (handler MUST/MUST NOT), C14 §2.1 (no commandManager.execute).

import {
  produceCommand,
  withHandlerSpan,
  createId,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type {
  FloorData,
  FloorVertex,
  FloorLayer,
  FloorFinishSpec,
  FloorServiceHole,
} from '@pryzm/core-app-model';
import type { FloorsState } from '../store.js';

export interface CreateFloorPayload {
  /** Pre-generated UUID from the calling tool.  Auto-generated if absent. */
  readonly floorId?: string;
  /** Pre-generated IFC GUID — stable across undo/redo.  Auto-generated if absent. */
  readonly ifcGuid?: string;
  /** CCW polygon of floor boundary (xz-plane).  Min 3 vertices required. */
  readonly polygon?: FloorVertex[];
  /** Y offset above level datum (m).  Default: 0. */
  readonly baseOffset?: number;
  /** Assembly thickness (m).  Default: 0.075 (75 mm). */
  readonly thickness?: number;
  readonly levelId?: string;
  readonly label?: string;
  readonly systemTypeId?: string;
  readonly layers?: FloorLayer[];
  readonly finishSpec?: Partial<FloorFinishSpec>;
  readonly serviceHoles?: FloorServiceHole[];
  readonly hostSlabId?: string;
  readonly hostRoomId?: string;
  readonly createdBy?: string;
}

type FloorHandlerStores = Readonly<{ floor: FloorsState } & Record<string, unknown>>;

export class CreateFloorHandler
  implements CommandHandler<CreateFloorPayload, FloorHandlerStores>
{
  readonly type = 'floor.create';
  readonly affectedStores = ['floor'] as const;

  canExecute(
    _ctx: HandlerContext<FloorHandlerStores>,
    cmd: CreateFloorPayload,
  ): ValidationResult {
    if (cmd.polygon !== undefined && cmd.polygon.length < 3) {
      return { valid: false, reason: 'polygon requires ≥ 3 vertices' };
    }
    const thickness = cmd.thickness ?? 0.075;
    if (!Number.isFinite(thickness) || thickness <= 0) {
      return { valid: false, reason: 'thickness must be > 0' };
    }
    if (cmd.baseOffset !== undefined && !Number.isFinite(cmd.baseOffset)) {
      return { valid: false, reason: 'baseOffset must be a finite number' };
    }
    return { valid: true };
  }

  execute(
    ctx: HandlerContext<FloorHandlerStores>,
    cmd: CreateFloorPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      const floorId = (cmd.floorId ?? createId('floor')) as string;
      const now = Date.now();
      const thickness = cmd.thickness ?? 0.075;
      const baseOffset = cmd.baseOffset ?? 0;
      const polygon: FloorVertex[] = cmd.polygon ?? [];

      const floorCount = Object.keys(ctx.stores.floor).length + 1;
      const label = cmd.label ?? `Floor-${floorCount.toString().padStart(2, '0')}`;

      const finishSpec: FloorFinishSpec = {
        finishColor: '#D4C4A8',
        finishPattern: 'none',
        exposedScreed: false,
        ...(cmd.finishSpec ?? {}),
      } as FloorFinishSpec;

      const newFloor: FloorData = {
        id: floorId,
        type: 'floor',
        levelId:    cmd.levelId ?? '',
        parentId:   cmd.levelId ?? '',
        label,
        floorNumber: `F.${floorCount.toString().padStart(2, '0')}`,
        boundary: {
          polygon,
          baseOffset,
          thickness,
          detectionMethod: 'manual-polygon',
        },
        systemTypeId:   cmd.systemTypeId,
        layers:         cmd.layers ? [...cmd.layers] : undefined,
        finishSpec,
        slope:          undefined,
        serviceHoles:   cmd.serviceHoles ? [...cmd.serviceHoles] : [],
        coveredRoomIds: cmd.hostRoomId ? [cmd.hostRoomId] : [],
        boundingWallIds: [],
        hostSlabId:     cmd.hostSlabId,
        hostRoomId:     cmd.hostRoomId,
        colour:         undefined,
        opacity:        1,
        visible:        true,
        properties:     {},
        ifcData: {
          guid:            cmd.ifcGuid ?? crypto.randomUUID(),
          ifcClass:        'IfcCovering',
          predefinedType:  'FLOORING',
        },
        metadata: {
          createdAt:  now,
          modifiedAt: now,
          createdBy:  cmd.createdBy ?? 'user',
          version:    1,
        },
      } as unknown as FloorData;

      const [next, forward, inverse] = produceCommand<FloorsState>(
        ctx.stores.floor,
        (draft) => { draft[floorId] = newFloor; },
      );

      return { forward, inverse, nextStates: { floor: next } };
    });
  }
}
