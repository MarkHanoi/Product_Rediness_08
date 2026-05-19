/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Semantic Model (Store layer)
 * File:             src/elements/roomBoundingLines/RoomBoundingLineStore.ts
 * Contracts:        01-BIM-ENGINE-CORE-CONTRACT §3 — Store rules
 *                   03-BIM-SEMANTIC-MODEL-CONTRACT §1 — ElementSchema
 *
 * Single source of truth for all RoomBoundingLineData records.
 * Immutable store — every record is Object.freeze()'d.
 * All writes go through Commands; never mutated directly by UI.
 *
 * Layer compliance:
 *   - No THREE.js scene access.
 *   - No builder calls.
 *   - No elementRegistry calls.
 *   - Emits StoreEventBus events + legacy DOM events. // TODO(TASK-08)
 */

import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)
import {
  RoomBoundingLineData,
  RoomBoundingLineEventType,
  RoomBoundingLineEventListener,
} from './RoomBoundingLineTypes';

export class RoomBoundingLineStore {
  private _lines: Map<string, RoomBoundingLineData> = new Map();
  private _levelIndex: Map<string, Set<string>> = new Map();
  private _listeners: RoomBoundingLineEventListener[] = [];

  // ── Read API ──────────────────────────────────────────────────────────────

  get(id: string): Readonly<RoomBoundingLineData> | undefined {
    return this._lines.get(id);
  }

  getAll(): Readonly<RoomBoundingLineData>[] {
    return Array.from(this._lines.values());
  }

  getByLevel(levelId: string): Readonly<RoomBoundingLineData>[] {
    const ids = this._levelIndex.get(levelId);
    if (!ids) return [];
    return Array.from(ids)
      .map(id => this._lines.get(id))
      .filter((l): l is RoomBoundingLineData => l !== undefined);
  }

  has(id: string): boolean {
    return this._lines.has(id);
  }

  count(): number {
    return this._lines.size;
  }

  countByLevel(levelId: string): number {
    return this._levelIndex.get(levelId)?.size ?? 0;
  }

  // ── Write API (called only from Commands) ──────────────────────────────────

  add(data: RoomBoundingLineData): void {
    const frozen = Object.freeze({ ...data });
    this._lines.set(frozen.id, frozen);
    this._updateLevelIndex(frozen.id, undefined, frozen.levelId);

    storeEventBus.emit({
      elementId: frozen.id,
      elementType: 'roomBoundingLine',
      operation: 'create',
      timestamp: Date.now(),
    });
    _bus.emit('bim-room-bounding-line-added', { id: frozen.id }); // F.events.17
    this._notify('add', frozen);
  }

  update(id: string, patch: Partial<RoomBoundingLineData>): void {
    const existing = this._lines.get(id);
    if (!existing) {
      console.warn(`[RoomBoundingLineStore] update: element '${id}' not found`);
      return;
    }
    const prevState = { ...existing };
    const updated = Object.freeze({ ...existing, ...patch, metadata: { ...existing.metadata, modifiedAt: Date.now(), version: existing.metadata.version + 1 } });
    this._lines.set(id, updated);

    if (patch.levelId && patch.levelId !== existing.levelId) {
      this._updateLevelIndex(id, existing.levelId, patch.levelId);
    }

    storeEventBus.emit({
      elementId: id,
      elementType: 'roomBoundingLine',
      operation: 'update',
      timestamp: Date.now(),
    });
    _bus.emit('bim-room-bounding-line-updated', { id: updated.id }); // F.events.17
    this._notify('update', updated, prevState as RoomBoundingLineData);
  }

  remove(id: string): void {
    const existing = this._lines.get(id);
    if (!existing) return;
    const snapshot = { ...existing };
    this._lines.delete(id);
    this._removeLevelIndex(id, existing.levelId);

    storeEventBus.emit({
      elementId: id,
      elementType: 'roomBoundingLine',
      operation: 'delete',
      timestamp: Date.now(),
    });
    _bus.emit('bim-room-bounding-line-removed', { id: snapshot.id }); // F.events.17
    this._notify('remove', snapshot as RoomBoundingLineData);
  }

  clear(): void {
    const all = Array.from(this._lines.values());
    this._lines.clear();
    this._levelIndex.clear();
    for (const line of all) {
      storeEventBus.emit({ elementId: line.id, elementType: 'roomBoundingLine', operation: 'delete', timestamp: Date.now() });
      this._notify('remove', line);
    }
  }

  // ── Event subscription ─────────────────────────────────────────────────────

  subscribe(listener: RoomBoundingLineEventListener): () => void {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter(l => l !== listener);
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _notify(event: RoomBoundingLineEventType, line: RoomBoundingLineData, prevState?: RoomBoundingLineData): void {
    for (const fn of this._listeners) {
      try { fn(event, line, prevState); } catch (e) { console.error('[RoomBoundingLineStore] listener error', e); }
    }
  }

  private _updateLevelIndex(id: string, oldLevel: string | undefined, newLevel: string): void {
    if (oldLevel) this._removeLevelIndex(id, oldLevel);
    if (!this._levelIndex.has(newLevel)) this._levelIndex.set(newLevel, new Set());
    this._levelIndex.get(newLevel)!.add(id);
  }

  private _removeLevelIndex(id: string, levelId: string): void {
    this._levelIndex.get(levelId)?.delete(id);
  }
}

/** Singleton instance — registered globally in initBuilders.ts */
export const roomBoundingLineStore = new RoomBoundingLineStore();

import { projectScopeRegistry } from '../persistence/ProjectScopeRegistry';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();
projectScopeRegistry.register({
    scopeName: 'roomBoundingLineStore',
    clear: () => {
        for (const rb of roomBoundingLineStore.getAll()) {
            roomBoundingLineStore.remove(rb.id);
        }
    },
});
