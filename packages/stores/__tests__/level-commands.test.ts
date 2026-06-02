// A.23.c.2 (Phase A · Sprint 2) — level.* command handler tests.

import { describe, expect, it } from 'vitest';
import { BuildingStore } from '../src/BuildingStore.js';
import { LevelStore } from '../src/LevelStore.js';
import { ApartmentStore } from '../src/ApartmentStore.js';
import {
    buildingCreate,
    levelCreate,
    levelUpdate,
    levelSetActive,
    levelDelete,
} from '../src/aggregate-commands/index.js';
import {
    ApartmentSchema,
    type Apartment,
} from '@pryzm/schemas/aggregates';

const FROZEN_NOW = () => '2026-06-01T12:00:00.000Z';
const BLDG_ID = 'bldg_proj-001';

function setupBuilding(): {
    buildingStore: BuildingStore;
    levelStore: LevelStore;
    apartmentStore: ApartmentStore;
} {
    const buildingStore = new BuildingStore();
    buildingCreate(
        { projectId: 'proj-001', name: 'Building A' },
        buildingStore,
        FROZEN_NOW,
    );
    return {
        buildingStore,
        levelStore: new LevelStore(),
        apartmentStore: new ApartmentStore(),
    };
}

function makeApartment(over: Partial<Apartment> = {}): Apartment {
    const id = over.id ?? 'apt_1a';
    return ApartmentSchema.parse({
        id,
        buildingId: BLDG_ID,
        levelId: 'lvl_g',
        name: 'Unit 1A',
        unitNumber: '1A',
        parameters: {
            id,
            shellAreaM2: { value: 75, min: 60, max: 90 },
            bedrooms: 2,
            bathrooms: 1,
            masterEnSuite: false,
            openPlanKitchenDining: true,
            livingRoom: true,
            entranceHall: true,
            typology: 'closed-plan-mid-rise',
        },
        createdAt: FROZEN_NOW(),
        updatedAt: FROZEN_NOW(),
        ...over,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// level.create — §1.2 uniqueness + monotonic
// ─────────────────────────────────────────────────────────────────────────────

describe('levelCreate', () => {
    it('creates a ground-floor Level', () => {
        const { buildingStore, levelStore } = setupBuilding();
        const result = levelCreate(
            {
                buildingId: BLDG_ID,
                name: 'Ground Floor',
                levelNumber: 0,
                elevation: 0,
                height: 2.7,
            },
            buildingStore,
            levelStore,
            FROZEN_NOW,
        );
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.type).toBe('level.created');
        expect(result.event.level.levelNumber).toBe(0);
        expect(levelStore.size()).toBe(1);
    });

    it('rejects when Building does not exist (level-buildingId-mismatch)', () => {
        const buildingStore = new BuildingStore();         // empty
        const levelStore = new LevelStore();
        const result = levelCreate(
            {
                buildingId: 'bldg_x',
                name: 'L1', levelNumber: 1, elevation: 3, height: 2.7,
            },
            buildingStore,
            levelStore,
            FROZEN_NOW,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('level-buildingId-mismatch');
    });

    it('rejects duplicate levelNumber (§1.2)', () => {
        const { buildingStore, levelStore } = setupBuilding();
        levelCreate(
            {
                buildingId: BLDG_ID, name: 'G', levelNumber: 0,
                elevation: 0, height: 2.7,
            },
            buildingStore, levelStore, FROZEN_NOW,
        );
        const result = levelCreate(
            {
                buildingId: BLDG_ID, name: 'G again', levelNumber: 0,
                elevation: 1, height: 2.7,
            },
            buildingStore, levelStore, FROZEN_NOW,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('level-number-conflict');
    });

    it('rejects duplicate elevation (§1.2)', () => {
        const { buildingStore, levelStore } = setupBuilding();
        levelCreate(
            {
                buildingId: BLDG_ID, name: 'G', levelNumber: 0,
                elevation: 0, height: 2.7,
            },
            buildingStore, levelStore, FROZEN_NOW,
        );
        const result = levelCreate(
            {
                buildingId: BLDG_ID, name: 'Other', levelNumber: 1,
                elevation: 0, height: 2.7,
            },
            buildingStore, levelStore, FROZEN_NOW,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('elevation-conflict');
    });

    it('rejects monotonic violation (Level 1 below Level 0)', () => {
        const { buildingStore, levelStore } = setupBuilding();
        levelCreate(
            {
                buildingId: BLDG_ID, name: 'G', levelNumber: 0,
                elevation: 0, height: 2.7,
            },
            buildingStore, levelStore, FROZEN_NOW,
        );
        // Try to insert Level 1 at elevation -1 (below Level 0).
        const result = levelCreate(
            {
                buildingId: BLDG_ID, name: 'Bogus', levelNumber: 1,
                elevation: -1, height: 2.7,
            },
            buildingStore, levelStore, FROZEN_NOW,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('elevation-conflict');
        expect(result.message).toMatch(/monotonic/i);
    });

    it('accepts basement Level (negative levelNumber + elevation)', () => {
        const { buildingStore, levelStore } = setupBuilding();
        levelCreate(
            { buildingId: BLDG_ID, name: 'G', levelNumber: 0, elevation: 0, height: 2.7 },
            buildingStore, levelStore, FROZEN_NOW,
        );
        const result = levelCreate(
            { buildingId: BLDG_ID, name: 'B1', levelNumber: -1, elevation: -3, height: 2.7 },
            buildingStore, levelStore, FROZEN_NOW,
        );
        expect(result.ok).toBe(true);
    });

    it('rejects invalid payload (height > 20m cap)', () => {
        const { buildingStore, levelStore } = setupBuilding();
        const result = levelCreate(
            { buildingId: BLDG_ID, name: 'X', levelNumber: 0, elevation: 0, height: 25 },
            buildingStore, levelStore, FROZEN_NOW,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('invalid-payload');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// level.update — re-validation when number/elevation changes
// ─────────────────────────────────────────────────────────────────────────────

describe('levelUpdate', () => {
    function setupTwoLevels() {
        const { buildingStore, levelStore } = setupBuilding();
        levelCreate(
            { buildingId: BLDG_ID, name: 'G', levelNumber: 0, elevation: 0, height: 2.7 },
            buildingStore, levelStore, FROZEN_NOW,
        );
        levelCreate(
            { buildingId: BLDG_ID, name: 'L1', levelNumber: 1, elevation: 3, height: 2.7 },
            buildingStore, levelStore, FROZEN_NOW,
        );
        // Find the level ids minted.
        const list = levelStore.list();
        return {
            buildingStore, levelStore,
            groundId: list[0]!.id,
            l1Id: list[1]!.id,
        };
    }

    it('renames a Level + bumps updatedAt', () => {
        const { levelStore, groundId } = setupTwoLevels();
        const result = levelUpdate(
            { id: groundId, patch: { name: 'Reception' } },
            levelStore,
            () => '2026-06-02T08:00:00.000Z',
        );
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.level.name).toBe('Reception');
        expect(result.event.level.updatedAt).toBe('2026-06-02T08:00:00.000Z');
    });

    it('rejects when target Level does not exist', () => {
        const { levelStore } = setupTwoLevels();
        const result = levelUpdate(
            { id: 'lvl_unknown', patch: { name: 'X' } },
            levelStore,
            FROZEN_NOW,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('no-level');
    });

    it('rejects when patch changes levelNumber to a duplicate', () => {
        const { levelStore, l1Id } = setupTwoLevels();
        const result = levelUpdate(
            { id: l1Id, patch: { levelNumber: 0 } },
            levelStore,
            FROZEN_NOW,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('level-number-conflict');
    });

    it('rejects when patch changes elevation to break monotonic order', () => {
        const { levelStore, l1Id } = setupTwoLevels();
        const result = levelUpdate(
            { id: l1Id, patch: { elevation: -1 } },
            levelStore,
            FROZEN_NOW,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('elevation-conflict');
    });

    it('event carries the prior Level for undo', () => {
        const { levelStore, groundId } = setupTwoLevels();
        const result = levelUpdate(
            { id: groundId, patch: { name: 'New Name' } },
            levelStore, FROZEN_NOW,
        );
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.prior.name).toBe('G');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// level.setActive — zero-or-one active per Building
// ─────────────────────────────────────────────────────────────────────────────

describe('levelSetActive', () => {
    function setupTwoLevels() {
        const { buildingStore, levelStore } = setupBuilding();
        levelCreate(
            { buildingId: BLDG_ID, name: 'G', levelNumber: 0, elevation: 0, height: 2.7 },
            buildingStore, levelStore, FROZEN_NOW,
        );
        levelCreate(
            { buildingId: BLDG_ID, name: 'L1', levelNumber: 1, elevation: 3, height: 2.7 },
            buildingStore, levelStore, FROZEN_NOW,
        );
        const list = levelStore.list();
        return { levelStore, groundId: list[0]!.id, l1Id: list[1]!.id };
    }

    it('activates the target Level', () => {
        const { levelStore, l1Id } = setupTwoLevels();
        const result = levelSetActive({ id: l1Id }, levelStore, FROZEN_NOW);
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.type).toBe('level.active-set');
        expect(result.event.priorActiveId).toBeNull();
        expect(levelStore.get(l1Id as never)?.isActive).toBe(true);
    });

    it('clears the prior active when switching (zero-or-one invariant)', () => {
        const { levelStore, groundId, l1Id } = setupTwoLevels();
        levelSetActive({ id: groundId }, levelStore, FROZEN_NOW);
        const result = levelSetActive({ id: l1Id }, levelStore, FROZEN_NOW);
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.priorActiveId).toBe(groundId);
        expect(levelStore.get(groundId as never)?.isActive).toBe(false);
        expect(levelStore.get(l1Id as never)?.isActive).toBe(true);
    });

    it('is idempotent when target is already active', () => {
        const { levelStore, groundId } = setupTwoLevels();
        levelSetActive({ id: groundId }, levelStore, FROZEN_NOW);
        const result = levelSetActive({ id: groundId }, levelStore, FROZEN_NOW);
        expect(result.ok).toBe(true);
        expect(levelStore.get(groundId as never)?.isActive).toBe(true);
    });

    it('rejects when target Level does not exist', () => {
        const { levelStore } = setupTwoLevels();
        const result = levelSetActive(
            { id: 'lvl_unknown' },
            levelStore, FROZEN_NOW,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('no-level');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// level.delete — §1.9 cascade-first
// ─────────────────────────────────────────────────────────────────────────────

describe('levelDelete', () => {
    function setupTwoLevels() {
        const { buildingStore, levelStore, apartmentStore } = setupBuilding();
        levelCreate(
            { buildingId: BLDG_ID, name: 'G', levelNumber: 0, elevation: 0, height: 2.7 },
            buildingStore, levelStore, FROZEN_NOW,
        );
        levelCreate(
            { buildingId: BLDG_ID, name: 'L1', levelNumber: 1, elevation: 3, height: 2.7 },
            buildingStore, levelStore, FROZEN_NOW,
        );
        const list = levelStore.list();
        return {
            levelStore, apartmentStore,
            groundId: list[0]!.id, l1Id: list[1]!.id,
        };
    }

    it('deletes an EMPTY Level', () => {
        const { levelStore, apartmentStore, l1Id } = setupTwoLevels();
        const result = levelDelete({ id: l1Id }, levelStore, apartmentStore);
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.type).toBe('level.deleted');
        expect(levelStore.has(l1Id as never)).toBe(false);
    });

    it('REJECTS when Apartments still on the Level (§1.9 cascade-first)', () => {
        const { levelStore, apartmentStore, groundId } = setupTwoLevels();
        apartmentStore.add(makeApartment({ levelId: groundId as never }));
        const result = levelDelete(
            { id: groundId }, levelStore, apartmentStore,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('level-has-apartments');
        expect(result.message).toMatch(/cascade.*first/i);
        // Level UNCHANGED.
        expect(levelStore.has(groundId as never)).toBe(true);
    });

    it('rejects when Level does not exist', () => {
        const { levelStore, apartmentStore } = setupTwoLevels();
        const result = levelDelete(
            { id: 'lvl_unknown' }, levelStore, apartmentStore,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('no-level');
    });
});
