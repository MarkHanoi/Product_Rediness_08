// A.23.b.1 (Phase A · Sprint 2) — LevelStore tests.

import { describe, expect, it, vi } from 'vitest';
import { LevelStore } from '../src/LevelStore.js';
import {
    LevelSchema,
    type Level,
} from '@pryzm/schemas/aggregates';

function makeLevel(over: Partial<Level> = {}): Level {
    return LevelSchema.parse({
        id: 'lvl_ground',
        buildingId: 'bldg_proj-001',
        name: 'Ground Floor',
        levelNumber: 0,
        elevation: 0,
        height: 2.7,
        createdAt: '2026-06-01T12:00:00.000Z',
        updatedAt: '2026-06-01T12:00:00.000Z',
        ...over,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Construction + basic CRUD
// ─────────────────────────────────────────────────────────────────────────────

describe('LevelStore — construction + add/get/remove', () => {
    it('starts empty', () => {
        const s = new LevelStore();
        expect(s.size()).toBe(0);
        expect(s.list()).toEqual([]);
    });

    it('add() + get() round-trip', () => {
        const s = new LevelStore();
        s.add(makeLevel());
        expect(s.get('lvl_ground' as never)?.name).toBe('Ground Floor');
    });

    it('add() throws on duplicate id', () => {
        const s = new LevelStore();
        s.add(makeLevel());
        expect(() => s.add(makeLevel())).toThrow(/already exists/i);
    });

    it('update() throws on unknown id', () => {
        const s = new LevelStore();
        expect(() => s.update(makeLevel())).toThrow(/cannot update unknown/i);
    });

    it('remove() drops the Level + notifies', () => {
        const s = new LevelStore();
        const listener = vi.fn();
        s.add(makeLevel({ id: 'lvl_x' }));
        s.subscribe(listener);
        s.remove('lvl_x' as never);
        expect(s.has('lvl_x' as never)).toBe(false);
        expect(listener).toHaveBeenCalledTimes(1);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// list() sort + filter
// ─────────────────────────────────────────────────────────────────────────────

describe('LevelStore — list() + listForBuilding()', () => {
    it('list() sorts by elevation ascending', () => {
        const s = new LevelStore();
        s.add(makeLevel({
            id: 'lvl_1', levelNumber: 1, elevation: 3.0,
            name: 'L1',
        }));
        s.add(makeLevel({
            id: 'lvl_neg1', levelNumber: -1, elevation: -3.0,
            name: 'Basement',
        }));
        s.add(makeLevel({ id: 'lvl_0', levelNumber: 0, elevation: 0, name: 'Ground' }));
        const ids = s.list().map((l) => l.id);
        expect(ids).toEqual(['lvl_neg1', 'lvl_0', 'lvl_1']);
    });

    it('listForBuilding() filters to one Building', () => {
        const s = new LevelStore();
        s.add(makeLevel({
            id: 'lvl_a0', buildingId: 'bldg_a', levelNumber: 0, elevation: 0,
        }));
        s.add(makeLevel({
            id: 'lvl_b0', buildingId: 'bldg_b', levelNumber: 0, elevation: 0,
        }));
        s.add(makeLevel({
            id: 'lvl_a1', buildingId: 'bldg_a', levelNumber: 1, elevation: 3,
        }));
        const aLevels = s.listForBuilding('bldg_a' as never);
        expect(aLevels.map((l) => l.id)).toEqual(['lvl_a0', 'lvl_a1']);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// activeForBuilding / findByNumber / findByElevation
// ─────────────────────────────────────────────────────────────────────────────

describe('LevelStore — query helpers (cross-row reads for command checks)', () => {
    it('activeForBuilding returns the unique active Level (or undefined)', () => {
        const s = new LevelStore();
        s.add(makeLevel({
            id: 'lvl_0', buildingId: 'bldg_a', levelNumber: 0, elevation: 0,
            isActive: false,
        }));
        s.add(makeLevel({
            id: 'lvl_1', buildingId: 'bldg_a', levelNumber: 1, elevation: 3,
            isActive: true,
        }));
        expect(s.activeForBuilding('bldg_a' as never)?.id).toBe('lvl_1');
    });

    it('activeForBuilding returns undefined when no Level is active', () => {
        const s = new LevelStore();
        s.add(makeLevel({ buildingId: 'bldg_a', isActive: false }));
        expect(s.activeForBuilding('bldg_a' as never)).toBeUndefined();
    });

    it('findByNumber returns the Level with the given (buildingId, levelNumber)', () => {
        const s = new LevelStore();
        s.add(makeLevel({
            id: 'lvl_0', buildingId: 'bldg_a', levelNumber: 0, elevation: 0,
        }));
        s.add(makeLevel({
            id: 'lvl_neg1', buildingId: 'bldg_a', levelNumber: -1, elevation: -3,
        }));
        expect(s.findByNumber('bldg_a' as never, -1)?.id).toBe('lvl_neg1');
        expect(s.findByNumber('bldg_a' as never, 99)).toBeUndefined();
    });

    it('findByElevation returns the Level with the given (buildingId, elevation)', () => {
        const s = new LevelStore();
        s.add(makeLevel({
            id: 'lvl_0', buildingId: 'bldg_a', levelNumber: 0, elevation: 0,
        }));
        s.add(makeLevel({
            id: 'lvl_1', buildingId: 'bldg_a', levelNumber: 1, elevation: 3,
        }));
        expect(s.findByElevation('bldg_a' as never, 3)?.id).toBe('lvl_1');
        expect(s.findByElevation('bldg_a' as never, 99)).toBeUndefined();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle (reset / dispose / subscribe resilience)
// ─────────────────────────────────────────────────────────────────────────────

describe('LevelStore — lifecycle', () => {
    it('reset() clears + notifies once', () => {
        const s = new LevelStore();
        s.add(makeLevel({ id: 'lvl_0' }));
        s.add(makeLevel({ id: 'lvl_1', levelNumber: 1, elevation: 3 }));
        const listener = vi.fn();
        s.subscribe(listener);
        s.reset();
        expect(s.size()).toBe(0);
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('reset() on empty does not notify', () => {
        const s = new LevelStore();
        const listener = vi.fn();
        s.subscribe(listener);
        s.reset();
        expect(listener).not.toHaveBeenCalled();
    });

    it('dispose() is idempotent', () => {
        const s = new LevelStore();
        s.dispose();
        expect(() => s.dispose()).not.toThrow();
    });
});
