// A.23.c.3 (Phase A · Sprint 2) — apartment.* command handler tests.

import { describe, expect, it } from 'vitest';
import { BuildingStore } from '../src/BuildingStore.js';
import { LevelStore } from '../src/LevelStore.js';
import { ApartmentStore } from '../src/ApartmentStore.js';
import { RoomStore } from '../src/RoomStore.js';
import {
    buildingCreate,
    levelCreate,
    apartmentCreate,
    apartmentUpdate,
    apartmentDelete,
} from '../src/aggregate-commands/index.js';
import { RoomSchema, type Room } from '@pryzm/schemas/aggregates';

const FROZEN_NOW = () => '2026-06-01T12:00:00.000Z';
const BLDG_ID = 'bldg_proj-001';

function setup() {
    const buildingStore = new BuildingStore();
    const levelStore = new LevelStore();
    const apartmentStore = new ApartmentStore();
    const roomStore = new RoomStore();
    buildingCreate(
        { projectId: 'proj-001', name: 'Building A' },
        buildingStore, FROZEN_NOW,
    );
    levelCreate(
        { buildingId: BLDG_ID, name: 'G', levelNumber: 0, elevation: 0, height: 2.7 },
        buildingStore, levelStore, FROZEN_NOW,
    );
    const lvlId = levelStore.list()[0]!.id;
    return { buildingStore, levelStore, apartmentStore, roomStore, lvlId };
}

function makeParameters(over: Record<string, unknown> = {}) {
    return {
        // id is replaced by the handler — placeholder here:
        id: 'placeholder',
        shellAreaM2: { value: 75, min: 60, max: 90 },
        bedrooms: 2,
        bathrooms: 1,
        masterEnSuite: false,
        openPlanKitchenDining: true,
        livingRoom: true,
        entranceHall: true,
        typology: 'closed-plan-mid-rise',
        ...over,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// apartment.create
// ─────────────────────────────────────────────────────────────────────────────

describe('apartmentCreate', () => {
    it('creates an Apartment (parameters.id auto-set to Apartment.id per §1.5)', () => {
        const { levelStore, apartmentStore, lvlId } = setup();
        const result = apartmentCreate(
            {
                buildingId: BLDG_ID,
                levelId: lvlId,
                name: 'Unit 1A',
                unitNumber: '1A',
                parameters: makeParameters(),
            },
            levelStore, apartmentStore, FROZEN_NOW,
        );
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.type).toBe('apartment.created');
        expect(result.event.apartment.parameters.id).toBe(
            result.event.apartment.id,
        );
    });

    it('rejects when Level does not exist (no-level)', () => {
        const { levelStore, apartmentStore } = setup();
        const result = apartmentCreate(
            {
                buildingId: BLDG_ID,
                levelId: 'lvl_unknown',
                name: 'Unit 1A',
                unitNumber: '1A',
                parameters: makeParameters(),
            },
            levelStore, apartmentStore, FROZEN_NOW,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('no-level');
    });

    it('rejects when buildingId does not match Level.buildingId', () => {
        const { levelStore, apartmentStore, lvlId } = setup();
        const result = apartmentCreate(
            {
                buildingId: 'bldg_other',
                levelId: lvlId,
                name: 'Unit',
                unitNumber: '1A',
                parameters: makeParameters(),
            },
            levelStore, apartmentStore, FROZEN_NOW,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('apartment-level-mismatch');
    });

    it('rejects duplicate unitNumber within Building (§1.3)', () => {
        const { levelStore, apartmentStore, lvlId } = setup();
        apartmentCreate(
            {
                buildingId: BLDG_ID, levelId: lvlId, name: 'A',
                unitNumber: '1A', parameters: makeParameters(),
            },
            levelStore, apartmentStore, FROZEN_NOW,
        );
        const result = apartmentCreate(
            {
                buildingId: BLDG_ID, levelId: lvlId, name: 'B',
                unitNumber: '1A', parameters: makeParameters(),
            },
            levelStore, apartmentStore, FROZEN_NOW,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('unit-number-conflict');
    });

    it('rejects when parameters fail L0 validation (e.g. typology not in enum)', () => {
        const { levelStore, apartmentStore, lvlId } = setup();
        const result = apartmentCreate(
            {
                buildingId: BLDG_ID, levelId: lvlId, name: 'X',
                unitNumber: '1A',
                parameters: makeParameters({ typology: 'manor-house' }),
            },
            levelStore, apartmentStore, FROZEN_NOW,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('invalid-payload');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// apartment.update
// ─────────────────────────────────────────────────────────────────────────────

describe('apartmentUpdate', () => {
    function setupApartment() {
        const ctx = setup();
        const created = apartmentCreate(
            {
                buildingId: BLDG_ID, levelId: ctx.lvlId, name: 'Unit 1A',
                unitNumber: '1A', parameters: makeParameters(),
            },
            ctx.levelStore, ctx.apartmentStore, FROZEN_NOW,
        );
        if (!created.ok) throw new Error('setup failed');
        return { ...ctx, aptId: created.event.apartment.id };
    }

    it('renames an Apartment + bumps updatedAt', () => {
        const { levelStore, apartmentStore, aptId } = setupApartment();
        const result = apartmentUpdate(
            { id: aptId, patch: { name: 'Penthouse' } },
            levelStore, apartmentStore,
            () => '2026-06-02T08:00:00.000Z',
        );
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.apartment.name).toBe('Penthouse');
    });

    it('rejects unitNumber change that collides with another Apartment', () => {
        const { levelStore, apartmentStore, lvlId, aptId } = setupApartment();
        // Add a second Apartment with unitNumber 2A.
        apartmentCreate(
            {
                buildingId: BLDG_ID, levelId: lvlId, name: 'B', unitNumber: '2A',
                parameters: makeParameters(),
            },
            levelStore, apartmentStore, FROZEN_NOW,
        );
        const result = apartmentUpdate(
            { id: aptId, patch: { unitNumber: '2A' } },
            levelStore, apartmentStore, FROZEN_NOW,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('unit-number-conflict');
    });

    it('rejects levelId change to a Level in a different Building', () => {
        const { buildingStore, levelStore, apartmentStore, aptId } =
            setupApartment();
        // Create a second Building + a Level in it.
        // (single-Building rule rejects 2nd building.create — we add
        // the Level directly to a hypothetical 2nd building for the test)
        levelStore.add({
            id: 'lvl_other_g',
            buildingId: 'bldg_other',
            name: 'G',
            levelNumber: 0,
            elevation: 0,
            height: 2.7,
            isActive: false,
            isReference: false,
            createdAt: FROZEN_NOW(),
            updatedAt: FROZEN_NOW(),
        } as never);
        void buildingStore;             // unused
        const result = apartmentUpdate(
            { id: aptId, patch: { levelId: 'lvl_other_g' } },
            levelStore, apartmentStore, FROZEN_NOW,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('apartment-level-mismatch');
    });

    it('rejects when Apartment does not exist', () => {
        const { levelStore, apartmentStore } = setup();
        const result = apartmentUpdate(
            { id: 'apt_unknown', patch: { name: 'X' } },
            levelStore, apartmentStore, FROZEN_NOW,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('no-apartment');
    });

    it('applies parameterPatch + keeps parameters.id === Apartment.id', () => {
        const { levelStore, apartmentStore, aptId } = setupApartment();
        const result = apartmentUpdate(
            {
                id: aptId,
                patch: {},
                parameterPatch: { bedrooms: 3 },
            },
            levelStore, apartmentStore, FROZEN_NOW,
        );
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.apartment.parameters.bedrooms).toBe(3);
        expect(result.event.apartment.parameters.id).toBe(
            result.event.apartment.id,
        );
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// apartment.delete — Room cascade
// ─────────────────────────────────────────────────────────────────────────────

describe('apartmentDelete', () => {
    function makeRoom(aptId: string, lvlId: string, id: string): Room {
        return RoomSchema.parse({
            id,
            levelId: lvlId,
            apartmentId: aptId,
            name: 'Master',
            parameters: {
                id, apartmentId: aptId, type: 'master',
                name: 'Master',
                areaM2: { value: 14, min: 10, max: 20 },
                widthM: { value: 3.5, min: 2.5, max: 4.5 },
                depthM: { value: 4, min: 3, max: 5 },
                daylightRequired: true,
                privacyTier: 4,
            },
            createdAt: FROZEN_NOW(),
            updatedAt: FROZEN_NOW(),
        });
    }

    it('cascades to Rooms via removeForApartment + reports count', () => {
        const ctx = setup();
        const created = apartmentCreate(
            {
                buildingId: BLDG_ID, levelId: ctx.lvlId, name: 'A',
                unitNumber: '1A', parameters: makeParameters(),
            },
            ctx.levelStore, ctx.apartmentStore, FROZEN_NOW,
        );
        if (!created.ok) throw new Error('setup fail');
        const aptId = created.event.apartment.id;
        // Add 2 Rooms for this Apartment + 1 for a different Apartment.
        ctx.roomStore.add(makeRoom(aptId, ctx.lvlId, 'rm_1'));
        ctx.roomStore.add(makeRoom(aptId, ctx.lvlId, 'rm_2'));
        ctx.roomStore.add(makeRoom('apt_other', ctx.lvlId, 'rm_other'));

        const result = apartmentDelete(
            { id: aptId },
            ctx.apartmentStore,
            ctx.roomStore,
        );
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.cascadedRoomCount).toBe(2);
        expect(ctx.apartmentStore.has(aptId as never)).toBe(false);
        // Only the rm_other room survives.
        expect(ctx.roomStore.size()).toBe(1);
    });

    it('rejects when Apartment does not exist', () => {
        const ctx = setup();
        const result = apartmentDelete(
            { id: 'apt_unknown' },
            ctx.apartmentStore,
            ctx.roomStore,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('no-apartment');
    });
});
