/**
 * FloorSlabBindingHandler — Slab binding constraint handler.
 *
 * THE KEY CONSTRAINT:
 * When a Floor has hostSlabId set, the floor's top face (FFL) is bound to
 * the slab's top face. When the slab moves (baseOffset changes), the floor follows.
 *
 * When the slab is DELETED, the floor stays at its last FFL position (hostSlabId set to null).
 *
 * Data flow:
 *   bim-slab-updated event → find all floors with hostSlabId === slab.id
 *                          → update floor.boundary.baseOffset
 *                          → dispatch bim-floor-updated → FloorPanelBuilder.buildFloor
 *
 * This handler is created in EngineBootstrap after both slabStore and floorStore exist.
 */

import { FloorStore } from '@pryzm/core-app-model/stores';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

export interface SlabBindingHandlerDeps {
  floorStore: FloorStore;
  bimManager?: any;
}

export class FloorSlabBindingHandler {
  private readonly _floorStore: FloorStore;
  private readonly _bimManager: any;
  private _boundSlabUpdated: ((e: Event) => void) | null = null;
  private _boundSlabRemoved: ((e: Event) => void) | null = null;

  constructor(deps: SlabBindingHandlerDeps) {
    this._floorStore = deps.floorStore;
    this._bimManager = deps.bimManager;
  }

  /** Attach window event listeners. Call from EngineBootstrap during init. */
  attach(): void {
    this._boundSlabUpdated = (e: Event) => this._onSlabUpdated(e as CustomEvent);
    this._boundSlabRemoved = (e: Event) => this._onSlabRemoved(e as CustomEvent);

    window.addEventListener('bim-slab-updated', this._boundSlabUpdated);
    window.addEventListener('bim-slab-removed', this._boundSlabRemoved);
    window.addEventListener('bim-level-updated', this._boundLevelUpdated.bind(this));
    console.log('[FloorSlabBindingHandler] Attached slab binding listeners.');
  }

  /** Detach all listeners. Call from EngineBootstrap during dispose. */
  detach(): void {
    if (this._boundSlabUpdated) {
      window.removeEventListener('bim-slab-updated', this._boundSlabUpdated);
      this._boundSlabUpdated = null;
    }
    if (this._boundSlabRemoved) {
      window.removeEventListener('bim-slab-removed', this._boundSlabRemoved);
      this._boundSlabRemoved = null;
    }
  }

  // ── Event handlers ─────────────────────────────────────────────────────────

  private _onSlabUpdated(e: CustomEvent): void {
    const slab = e.detail?.slab ?? e.detail;
    if (!slab?.id) return;

    const boundFloors = this._floorStore.getByHostSlab(slab.id);
    if (boundFloors.length === 0) return;

    console.log(`[FloorSlabBindingHandler] Slab "${slab.id}" updated — re-binding ${boundFloors.length} floor(s).`);

    for (const floor of boundFloors) {
      // The slab's top face is at: level.elevation + slab.baseOffset (or slab.position.y)
      // The floor's baseOffset should equal the slab's top face relative to its level.
      const newBaseOffset = this._resolveSlabTopOffset(slab, floor.levelId);
      if (Math.abs(newBaseOffset - floor.boundary.baseOffset) < 0.0001) continue; // No change

      const updated = this._floorStore.update(floor.id, {
        boundary: { ...floor.boundary, baseOffset: newBaseOffset },
      });
      if (!updated) continue;

      // Dispatch DOM event so EngineBootstrap's listener triggers FloorPanelBuilder.buildFloor
      _bus.emit('bim-floor-updated', { id: updated.id }); // F.events.18
      console.log(`[FloorSlabBindingHandler] Floor "${floor.id}" re-bound to slab top at Y=${newBaseOffset}.`);
    }
  }

  private _onSlabRemoved(e: CustomEvent): void {
    const slabId = e.detail?.slabId ?? e.detail?.id;
    if (!slabId) return;

    const boundFloors = this._floorStore.getByHostSlab(slabId);
    if (boundFloors.length === 0) return;

    console.log(`[FloorSlabBindingHandler] Slab "${slabId}" removed — unbinding ${boundFloors.length} floor(s).`);

    for (const floor of boundFloors) {
      // Floor stays in place — hostSlabId is cleared
      this._floorStore.update(floor.id, { hostSlabId: undefined });
      console.log(`[FloorSlabBindingHandler] Floor "${floor.id}" unbound from deleted slab "${slabId}".`);
    }
  }

  private _boundLevelUpdated(e: Event): void {
    const customEvent = e as CustomEvent;
    const level = customEvent.detail?.level ?? customEvent.detail;
    if (!level?.id) return;

    // Level elevation changed — all floors on this level need rebuilding
    // (even without slab binding, level.elevation affects their world Y).
    const floorsOnLevel = this._floorStore.getByLevel(level.id);
    for (const floor of floorsOnLevel) {
      // Just trigger a visual rebuild — data doesn't change (baseOffset is relative to level)
      _bus.emit('bim-floor-updated', { id: floor.id }); // F.events.18
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Compute the slab's top face offset relative to the floor's level.
   * Returns a baseOffset value to assign to floor.boundary.baseOffset.
   *
   * Slab top face world Y = level.elevation + slab.baseOffset (PRYZM convention).
   * Floor's FFL should be at the same world Y, so floor.boundary.baseOffset = slab.baseOffset.
   */
  private _resolveSlabTopOffset(slab: any, floorLevelId: string): number {
    // Try to get baseOffset from slab (standard PRYZM slab has slab.boundary.baseOffset)
    if (typeof slab.boundary?.baseOffset === 'number') {
      // slab top face is at: level.elevation + slab.boundary.baseOffset + slab.boundary.thickness
      return (slab.boundary.baseOffset ?? 0) + (slab.boundary.thickness ?? 0);
    }

    // Fallback: try slab.position.y relative to level
    if (this._bimManager && typeof slab.position?.y === 'number') {
      const level = this._bimManager.getLevelById(floorLevelId);
      const levelElevation = level?.elevation ?? 0;
      return slab.position.y - levelElevation;
    }

    // Default: floor stays at current baseOffset
    return 0;
  }
}
