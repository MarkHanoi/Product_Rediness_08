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
    // §FIX-CREATE-LIVENESS-LIE (BIM20 C5/C6, Wave 4) — there is no step 2 any more.
    //
    // This used to follow with `bus.executeCommand('door.create', …)`. That verb now
    // REFUSES (see `handlers/CreateDoor.ts`): it wrote only the detached plugin DTO
    // store, and the CA-21 executed read-back caught it reporting success while the
    // authoritative `doorStore` did not move.
    //
    // Nothing is lost, because step 1 above was ALREADY the whole creation.
    // `wall.createOpening` → `CreateWallOpeningCommand` reserves the wall-side opening
    // AND writes the authoritative `doorStore` record (`CreateWallOpeningCommand.ts:151`)
    // with its resolved system type, finishes and canonical mark — one command, one
    // undo entry, both halves of a hosted element minted atomically. The second
    // dispatch was the redundant half all along; `elementId` on the opening is what
    // carries `doorId` into the model.
    return { doorId, wallId: placement.wallId, offset: placement.offset };
  }
}
