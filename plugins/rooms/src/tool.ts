// RoomSeedTool — vanilla TS, THREE-free (S25).
//
// Single-click placement: the user clicks once inside the rough
// area where they want a room.  The click point becomes the room's
// `seedPoint`; the producer flood-fills from there to derive the
// boundary.  No multi-click sketching — that path lives on the
// sketched-mode boundary editor (S26 follow-up).

import type { CommandBus } from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';

export const ROOM_TOOL_ID = 'room.seed';

export interface RoomToolPoint3D {
  x: number;
  y: number;
  z: number;
}

export type RoomScreenToWorld = (
  ev: { clientX: number; clientY: number; pointerId: number },
) => RoomToolPoint3D | undefined;

export interface RoomSeedToolDeps {
  readonly commandBus: CommandBus;
  readonly screenToWorld: RoomScreenToWorld;
  /** Optional: level to assign to the new room.  Defaults to ''. */
  readonly levelId?: () => string;
  /** Optional: room name template.  Defaults to "Room <N>" where N is
   *  a tool-local counter.  Hosts that maintain their own room-naming
   *  policy should pass this in. */
  readonly nameOf?: (counter: number) => string;
  /** Optional: occupancy tag to stamp on every minted room (e.g. the
   *  active palette in the sidebar). */
  readonly occupancy?: () => string | undefined;
}

export class RoomSeedTool {
  private readonly bus: CommandBus;
  private readonly screenToWorld: RoomScreenToWorld;
  private readonly levelId: () => string;
  private readonly nameOf: (counter: number) => string;
  private readonly occupancy: () => string | undefined;
  private counter = 0;

  constructor(deps: RoomSeedToolDeps) {
    if (!deps.commandBus) throw new Error('[RoomSeedTool] commandBus is required');
    if (!deps.screenToWorld) throw new Error('[RoomSeedTool] screenToWorld is required');
    this.bus = deps.commandBus;
    this.screenToWorld = deps.screenToWorld;
    this.levelId = deps.levelId ?? (() => '');
    this.nameOf = deps.nameOf ?? ((n) => `Room ${n}`);
    this.occupancy = deps.occupancy ?? (() => undefined);
  }

  /** Project the click to world space and dispatch `room.create`.
   *  Returns the minted room id, or `undefined` when the click could
   *  not be projected. */
  async onPointerDown(ev: {
    clientX: number;
    clientY: number;
    pointerId: number;
  }): Promise<string | undefined> {
    const p = this.screenToWorld(ev);
    if (!p) return undefined;
    const id = createId('room');
    this.counter += 1;
    await this.bus.executeCommand('room.create', {
      id,
      levelId: this.levelId(),
      name: this.nameOf(this.counter),
      occupancy: this.occupancy(),
      boundaryMode: 'wallBound',
      seedPoint: p,
    });
    return id;
  }

  /** Reset the per-session counter (e.g. when the user switches
   *  level or activates a different tool). */
  resetCounter(start = 0): void {
    this.counter = start;
  }
}
