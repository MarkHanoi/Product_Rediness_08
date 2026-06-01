// A.23.b.1 (Phase A · Sprint 2) — BuildingStore tests.

import { describe, expect, it, vi } from 'vitest';
import { BuildingStore } from '../src/BuildingStore.js';
import {
    BuildingSchema,
    type Building,
} from '@pryzm/schemas/aggregates';

function makeBuilding(over: Partial<Building> = {}): Building {
    return BuildingSchema.parse({
        id: 'bldg_proj-001',
        projectId: 'proj-001',
        name: 'Building A',
        createdAt: '2026-06-01T12:00:00.000Z',
        updatedAt: '2026-06-01T12:00:00.000Z',
        ...over,
    });
}

describe('BuildingStore — construction + read', () => {
    it('starts empty', () => {
        const s = new BuildingStore();
        expect(s.size()).toBe(0);
        expect(s.list()).toEqual([]);
        expect(s.has('bldg_x' as never)).toBe(false);
        expect(s.first()).toBeUndefined();
    });

    it('list() sorts by ordinal asc then createdAt asc', () => {
        const s = new BuildingStore();
        s.add(makeBuilding({ id: 'bldg_b', ordinal: 1, createdAt: '2026-06-01T12:00:00.000Z' }));
        s.add(makeBuilding({ id: 'bldg_c', ordinal: 0, createdAt: '2026-06-02T12:00:00.000Z' }));
        s.add(makeBuilding({ id: 'bldg_a', ordinal: 0, createdAt: '2026-06-01T12:00:00.000Z' }));
        const list = s.list();
        expect(list.map((b) => b.id)).toEqual(['bldg_a', 'bldg_c', 'bldg_b']);
    });

    it('first() returns the first registered Building (single-Building mode helper)', () => {
        const s = new BuildingStore();
        s.add(makeBuilding({ id: 'bldg_only' }));
        expect(s.first()?.id).toBe('bldg_only');
    });
});

describe('BuildingStore — add / update / remove', () => {
    it('add() stores the Building and notifies', () => {
        const s = new BuildingStore();
        const listener = vi.fn();
        s.subscribe(listener);
        s.add(makeBuilding({ id: 'bldg_a' }));
        expect(s.has('bldg_a' as never)).toBe(true);
        expect(s.get('bldg_a' as never)?.id).toBe('bldg_a');
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('add() throws on duplicate id', () => {
        const s = new BuildingStore();
        s.add(makeBuilding({ id: 'bldg_a' }));
        expect(() => s.add(makeBuilding({ id: 'bldg_a' }))).toThrow(
            /already exists/i,
        );
    });

    it('update() replaces the Building and notifies', () => {
        const s = new BuildingStore();
        s.add(makeBuilding({ id: 'bldg_a', name: 'Original' }));
        s.update(makeBuilding({ id: 'bldg_a', name: 'Renamed' }));
        expect(s.get('bldg_a' as never)?.name).toBe('Renamed');
    });

    it('update() throws on unknown id', () => {
        const s = new BuildingStore();
        expect(() => s.update(makeBuilding({ id: 'bldg_x' }))).toThrow(
            /cannot update unknown/i,
        );
    });

    it('remove() drops the Building and notifies', () => {
        const s = new BuildingStore();
        const listener = vi.fn();
        s.add(makeBuilding({ id: 'bldg_a' }));
        s.subscribe(listener);
        s.remove('bldg_a' as never);
        expect(s.has('bldg_a' as never)).toBe(false);
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('remove() on unknown id is a no-op (no listener fire)', () => {
        const s = new BuildingStore();
        const listener = vi.fn();
        s.subscribe(listener);
        s.remove('bldg_x' as never);
        expect(listener).not.toHaveBeenCalled();
    });
});

describe('BuildingStore — reset / dispose / lifecycle', () => {
    it('reset() clears all + notifies', () => {
        const s = new BuildingStore();
        s.add(makeBuilding({ id: 'bldg_a' }));
        s.add(makeBuilding({ id: 'bldg_b' }));
        const listener = vi.fn();
        s.subscribe(listener);
        s.reset();
        expect(s.size()).toBe(0);
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('reset() on empty store does NOT fire listeners', () => {
        const s = new BuildingStore();
        const listener = vi.fn();
        s.subscribe(listener);
        s.reset();
        expect(listener).not.toHaveBeenCalled();
    });

    it('unsubscribe stops further notifications', () => {
        const s = new BuildingStore();
        const listener = vi.fn();
        const unsub = s.subscribe(listener);
        s.add(makeBuilding({ id: 'bldg_a' }));
        unsub();
        s.add(makeBuilding({ id: 'bldg_b' }));
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('a throwing listener does not break the fan-out', () => {
        const s = new BuildingStore();
        const throwing = vi.fn(() => {
            throw new Error('boom');
        });
        const good = vi.fn();
        s.subscribe(throwing);
        s.subscribe(good);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        s.add(makeBuilding({ id: 'bldg_a' }));
        expect(throwing).toHaveBeenCalled();
        expect(good).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('dispose() is idempotent + freezes further writes', () => {
        const s = new BuildingStore();
        s.dispose();
        expect(() => s.dispose()).not.toThrow();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        s.add(makeBuilding({ id: 'bldg_a' }));
        expect(s.size()).toBe(0);
        warn.mockRestore();
    });
});
