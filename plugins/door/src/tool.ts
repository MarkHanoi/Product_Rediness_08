// DoorPlacementTool — vanilla TS, THREE-free (S11-T1).
//
// Single-click state machine: click on a wall → resolve to a door
// placement → dispatch `wall.createOpening` then `door.create` as a
// pair so the L4 cascade infra (S10) keeps undo atomic.
//
// Keeps strict-injection (constructor throws on missing dependencies),
// matching `WallCreationTool`.

import type { CommandBus } from '@pryzm/plugin-sdk';
import { resolveDoorPlacement } from './intent.js';
import type { WallsState } from '@pryzm/plugin-wall';
import { createId } from '@pryzm/plugin-sdk';
import { getDoorType, DEFAULT_DOOR_TYPE_ID, type DoorType } from '@pryzm/plugin-sdk';

export const DOOR_TOOL_ID = 'door.placement';

export interface DoorToolPoint3D {
  x: number;
  y: number;
  z: number;
}

export type DoorScreenToWorld = (
  ev: { clientX: number; clientY: number; pointerId: number },
) => DoorToolPoint3D | undefined;

/** Snapshot accessor — returns the current `WallsState` whenever the
 *  tool needs to resolve a hit. */
export type WallsSnapshot = () => WallsState;

export interface DoorCreationToolDeps {
  readonly commandBus: CommandBus;
  readonly screenToWorld: DoorScreenToWorld;
  readonly wallsSnapshot: WallsSnapshot;
  /** Default door type to mint when the user has not picked one. */
  readonly defaultType?: DoorType;
}

export class DoorPlacementTool {
  private readonly bus: CommandBus;
  private readonly screenToWorld: DoorScreenToWorld;
  private readonly wallsSnapshot: WallsSnapshot;
  private readonly defaultType: DoorType;

  constructor(deps: DoorCreationToolDeps) {
    if (!deps.commandBus) throw new Error('[DoorPlacementTool] commandBus is required');
    if (!deps.screenToWorld) throw new Error('[DoorPlacementTool] screenToWorld is required');
    if (!deps.wallsSnapshot) throw new Error('[DoorPlacementTool] wallsSnapshot is required');
    this.bus = deps.commandBus;
    this.screenToWorld = deps.screenToWorld;
    this.wallsSnapshot = deps.wallsSnapshot;
    this.defaultType =
      deps.defaultType ??
      getDoorType(DEFAULT_DOOR_TYPE_ID) ??
      (() => {
        throw new Error('[DoorPlacementTool] default door type not found');
      })();
  }

  /** Drive the tool from a single pointer-down event.  Returns the
   *  resolved placement when a door was minted; `undefined` when the
   *  click missed every wall. */
  async onPointerDown(ev: {
    clientX: number;
    clientY: number;
    pointerId: number;
  }): Promise<{ doorId: string; wallId: string; offset: number } | undefined> {
    const click = this.screenToWorld(ev);
    if (!click) return undefined;

    const walls = this.wallsSnapshot();
    const placement = resolveDoorPlacement(
      click,
      walls,
      this.defaultType.width,
    );
    if (!placement || !placement.fits) return undefined;

    const openingId = createId('opening');
    const doorId = createId('door');

    // 1) Reserve the wall-side opening (occupancy + childrenIds).
    await this.bus.executeCommand('wall.createOpening', {
      wallId: placement.wallId,
      opening: {
        id: openingId,
        type: 'door',
        offset: placement.offset - this.defaultType.width / 2,
        width: this.defaultType.width,
        height: this.defaultType.height,
        sillHeight: placement.sillHeight,
        elementId: doorId,
      },
    });
    // 2) Mint the door element.
    await this.bus.executeCommand('door.create', {
      id: doorId,
      wallId: placement.wallId,
      openingId,
      offset: placement.offset - this.defaultType.width / 2,
      width: this.defaultType.width,
      height: this.defaultType.height,
      sillHeight: placement.sillHeight,
      systemTypeId: this.defaultType.id,
    });

    return { doorId, wallId: placement.wallId, offset: placement.offset };
  }
}
