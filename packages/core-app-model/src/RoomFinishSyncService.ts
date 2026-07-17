/**
 * RoomFinishSyncService
 *
 * Listens to 'bim-room-updated' DOM events. When a room's finishes change,
 * it finds all Floor and Ceiling elements that are linked to that room
 * (via hostRoomId) and propagates the new material names / colours to their
 * finishSpec, keeping the elements in sync with the room data.
 *
 * This is a lightweight event-driven observer — it writes directly to the
 * stores (no undo entry) so that finish propagation is transparent and does
 * not pollute the command history.
 */

export interface RoomFinishSyncDeps {
  getRoomStore: () => any;
  getFloorStore: () => any;
  getCeilingStore: () => any;
}

/**
 * §GEN-LOG-GATING (L-369, 2026-07-17) — true while a project load or a building generation is
 * in flight. During a resi/office/house generation the finish chain fires one
 * `bim-room-updated` per room and this observer then logs one line PER synced floor/ceiling
 * element plus a per-room summary — hundreds of main-thread-blocking `console.log`s. The
 * per-element lines are gated behind this on those bulk paths; interactive finish edits still
 * log so a designer can see propagation happening.
 */
function __pryzmGenOrLoadActive(): boolean {
  const g = globalThis as unknown as { __pryzmProjectLoadActive?: boolean; __pryzmBuildingGenActive?: boolean };
  return g.__pryzmProjectLoadActive === true || g.__pryzmBuildingGenActive === true;
}

export class RoomFinishSyncService {
  private _deps: RoomFinishSyncDeps;
  private _handler: ((e: Event) => void) | null = null;

  constructor(deps: RoomFinishSyncDeps) {
    this._deps = deps;
  }

  start(): void {
    this._handler = (e: Event) => this._onRoomUpdated(e as CustomEvent);
    window.addEventListener('bim-room-updated', this._handler);
    console.log('[RoomFinishSyncService] Started — listening for room finish changes.');
  }

  stop(): void {
    if (this._handler) {
      window.removeEventListener('bim-room-updated', this._handler);
      this._handler = null;
    }
  }

  private _onRoomUpdated(e: CustomEvent): void {
    const roomId: string | undefined = e.detail?.id;
    if (!roomId) return;

    const roomStore = this._deps.getRoomStore();
    const floorStore = this._deps.getFloorStore();
    const ceilingStore = this._deps.getCeilingStore();

    if (!roomStore || !floorStore || !ceilingStore) return;

    const room = roomStore.getById(roomId);
    if (!room) return;

    const floorFinishes = room.finishes?.floor;
    const ceilingFinishes = room.finishes?.ceiling;

    // Only proceed if the room has finish data to propagate
    if (!floorFinishes && !ceilingFinishes) return;

    let synced = 0;

    // Propagate to linked Floor elements
    if (floorFinishes) {
      const floors: any[] = floorStore.getAll().filter((f: any) => f.hostRoomId === roomId);
      for (const floor of floors) {
        const updatedFinishSpec = {
          ...floor.finishSpec,
          materialName: floorFinishes.materialName ?? floor.finishSpec.materialName,
          finishColor: floorFinishes.materialColor ?? floor.finishSpec.finishColor,
        };
        floorStore.update(floor.id, { finishSpec: updatedFinishSpec });
        synced++;
        if (!__pryzmGenOrLoadActive()) {
          console.log(
            `[RoomFinishSyncService] Synced floor ${floor.id} → material: "${floorFinishes.materialName}", colour: ${floorFinishes.materialColor}`
          );
        }
      }
    }

    // Propagate to linked Ceiling elements
    if (ceilingFinishes) {
      const ceilings: any[] = ceilingStore.getAll().filter((c: any) => c.hostRoomId === roomId);
      for (const ceiling of ceilings) {
        const updatedFinishSpec = {
          ...ceiling.finishSpec,
          materialName: ceilingFinishes.materialName ?? ceiling.finishSpec.materialName,
          soffitColor: ceilingFinishes.materialColor ?? ceiling.finishSpec.soffitColor,
        };
        ceilingStore.update(ceiling.id, { finishSpec: updatedFinishSpec });
        synced++;
        if (!__pryzmGenOrLoadActive()) {
          console.log(
            `[RoomFinishSyncService] Synced ceiling ${ceiling.id} → material: "${ceilingFinishes.materialName}", colour: ${ceilingFinishes.materialColor}`
          );
        }
      }
    }

    if (synced > 0 && !__pryzmGenOrLoadActive()) {
      console.log(`[RoomFinishSyncService] Propagated room "${roomId}" finishes to ${synced} element(s).`);
    }
  }
}
