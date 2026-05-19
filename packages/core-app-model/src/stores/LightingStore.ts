/**
 * @file LightingStore.ts
 *
 * Plain DTO store for placed lighting fixtures.
 *
 * Contract compliance:
 *  §01 §3 — stores hold plain DTOs only; no THREE.js objects, no classes.
 *  §01 §3.4 — add() / update() accept plain objects; returns void.
 *  §03 §3   — getAll() returns structuredClone'd copies.
 */

import { LightingData } from './LightingTypes';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

export class LightingStore {
    private readonly _data = new Map<string, LightingData>();

    add(data: LightingData): void {
        this._data.set(data.id, Object.freeze({ ...data }));
        _bus.emit('bim-lighting-added', { id: data.id }); // F.events.17
    }

    update(id: string, patch: Partial<LightingData>): void {
        const existing = this._data.get(id);
        if (!existing) return;
        const merged = Object.freeze({ ...existing, ...patch, id });
        this._data.set(id, merged);
        _bus.emit('bim-lighting-updated', { id }); // F.events.17
    }

    remove(id: string): void {
        if (!this._data.has(id)) return;
        this._data.delete(id);
        _bus.emit('bim-lighting-removed', { id }); // F.events.17
    }

    get(id: string): LightingData | undefined {
        const d = this._data.get(id);
        return d ? structuredClone(d) : undefined;
    }

    getAll(): LightingData[] {
        return [...this._data.values()].map(d => structuredClone(d));
    }

    getAllForLevel(levelId: string): LightingData[] {
        return this.getAll().filter(d => d.levelId === levelId);
    }

    /** Lighting fixtures whose `roomId` matches the given room. */
    getAllForRoom(roomId: string): LightingData[] {
        return this.getAll().filter(d => d.roomId === roomId);
    }

    has(id: string): boolean {
        return this._data.has(id);
    }

    get size(): number {
        return this._data.size;
    }
}
