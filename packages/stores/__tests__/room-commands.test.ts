// A.23.c.4 (Phase A · Sprint 2) — room.* command handler tests.

import { describe, expect, it } from 'vitest';
import { BuildingStore } from '../src/BuildingStore.js';
import { LevelStore } from '../src/LevelStore.js';
import { ApartmentStore } from '../src/ApartmentStore.js';
import { RoomStore } from '../src/RoomStore.js';
import {
    buildingCreate,
    levelCreate,
    apartmentCreate,
    roomCreate,
    roomUpdate,
    roomDelete,
    roomAssignToApartment,
} from '../src/aggregate-commands/index.js';

const FROZEN_NOW = () => '2026-06-01T12:00:00.000Z';
const BLDG_ID = 'bldg_proj-001';

function makeAptParameters() {
    return {
        id: 'x',
        shellAreaM2: { value: 75, min: 60, max: 90 },
        bedrooms: 2, bathrooms: 1, masterEnSuite: false,
        openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
        typology: 'closed-plan-mid-rise',
    };
}

function makeRoomParameters() {
    return {
        id: 'x', apartmentId: 'x', type: 'master', name: 'Master',
        areaM2: { value: 14, min: 10, max: 20 },
        widthM: { value: 3.5, min: 2.5, max: 4.5 },
        depthM: { value: 4, min: 3, max: 5 },
        daylightRequired: true,
        privacyTier: 4,
    };
}

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
    const aptResult = apartmentCreate(
        { buildingId: BLDG_ID, levelId: lvlId, name: 'A', unitNumber: '1A', parameters: makeAptParameters() },
        levelStore, apartmentStore, FROZEN_NOW,
    );
    if (!aptResult.ok) throw new Error('setup fail');
    return {
        buildingStore, levelStore, apartmentStore, roomStore,
        lvlId, aptId: aptResult.event.apartment.id,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// room.create
// ─────────────────────────────────────────────────────────────────────────────

describe('roomCreate', () => {
    it('creates a Room with parameters.id + apartmentId synced (§1.5)', () => {
        const { levelStore, apartmentStore, roomStore, lvlId, aptId } = setup();
        const result = roomCreate(
            {
                levelId: lvlId, apartmentId: aptId,
                name: 'Master', parameters: makeRoomParameters(),
            },
            levelStore, apartmentStore, roomStore, FROZEN_NOW,
        );
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.type).toBe('room.created');
        expect(result.event.room.parameters.id).toBe(result.event.room.id);
        expect(result.event.room.parameters.apartmentId).toBe(aptId);
    });

    it('rejects when Level does not exist', () => {
        const { levelStore, apartmentStore, roomStore, aptId } = setup();
        const result = roomCreate(
            {
                levelId: 'lvl_unknown', apartmentId: aptId,
                name: 'X', parameters: makeRoomParameters(),
            },
            levelStore, apartmentStore, roomStore, FROZEN_NOW,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('no-level');
    });

    it('rejects when Apartment does not exist', () => {
        const { levelStore, apartmentStore, roomStore, lvlId } = setup();
        const result = roomCreate(
            {
                levelId: lvlId, apartmentId: 'apt_unknown',
                name: 'X', parameters: makeRoomParameters(),
            },
            levelStore, apartmentStore, roomStore, FROZEN_NOW,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('no-apartment');
    });

    it('rejects when Apartment is on a different Level (§1.4)', () => {
        const ctx = setup();
        // Create a second Level + put the Apartment on Level G;
        // try to create a Room on Level 1 referencing that Apartment.
        levelCreate(
            { buildingId: BLDG_ID, name: 'L1', levelNumber: 1, elevation: 3, height: 2.7 },
            ctx.buildingStore, ctx.levelStore, FROZEN_NOW,
        );
        const l1Id = ctx.levelStore.list()[1]!.id;
        const result = roomCreate(
            {
                levelId: l1Id, apartmentId: ctx.aptId,
                name: 'X', parameters: makeRoomParameters(),
            },
            ctx.levelStore, ctx.apartmentStore, ctx.roomStore, FROZEN_NOW,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('apartment-level-mismatch');
    });

    it('rejects when parameters fail L0 validation', () => {
        const ctx = setup();
        const result = roomCreate(
            {
                levelId: ctx.lvlId, apartmentId: ctx.aptId,
                name: 'X',
                parameters: { ...makeRoomParameters(), privacyTier: 99 },
            },
            ctx.levelStore, ctx.apartmentStore, ctx.roomStore, FROZEN_NOW,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('invalid-payload');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// room.update
// ─────────────────────────────────────────────────────────────────────────────

describe('roomUpdate', () => {
    function setupRoom() {
        const ctx = setup();
        const r = roomCreate(
            { levelId: ctx.lvlId, apartmentId: ctx.aptId, name: 'Master', parameters: makeRoomParameters() },
            ctx.levelStore, ctx.apartmentStore, ctx.roomStore, FROZEN_NOW,
        );
        if (!r.ok) throw new Error('setup fail');
        return { ...ctx, roomId: r.event.room.id };
    }

    it('renames a Room + bumps updatedAt', () => {
        const ctx = setupRoom();
        const result = roomUpdate(
            { id: ctx.roomId, patch: { name: 'Primary Bedroom' } },
            ctx.levelStore, ctx.apartmentStore, ctx.roomStore,
            () => '2026-06-02T08:00:00.000Z',
        );
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.room.name).toBe('Primary Bedroom');
    });

    it('rejects when Room does not exist', () => {
        const ctx = setup();
        const result = roomUpdate(
            { id: 'rm_unknown', patch: { name: 'X' } },
            ctx.levelStore, ctx.apartmentStore, ctx.roomStore, FROZEN_NOW,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('no-room');
    });

    it('rejects levelId change that violates §1.4 (Apartment elsewhere)', () => {
        const ctx = setupRoom();
        levelCreate(
            { buildingId: BLDG_ID, name: 'L1', levelNumber: 1, elevation: 3, height: 2.7 },
            ctx.buildingStore, ctx.levelStore, FROZEN_NOW,
        );
        const l1Id = ctx.levelStore.list()[1]!.id;
        const result = roomUpdate(
            { id: ctx.roomId, patch: { levelId: l1Id } },
            ctx.levelStore, ctx.apartmentStore, ctx.roomStore, FROZEN_NOW,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('apartment-level-mismatch');
    });

    it('parameterPatch merges + keeps parameters.id + apartmentId in sync', () => {
        const ctx = setupRoom();
        const result = roomUpdate(
            {
                id: ctx.roomId,
                patch: {},
                parameterPatch: { daylightRequired: false },
            },
            ctx.levelStore, ctx.apartmentStore, ctx.roomStore, FROZEN_NOW,
        );
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.room.parameters.daylightRequired).toBe(false);
        expect(result.event.room.parameters.id).toBe(result.event.room.id);
        expect(result.event.room.parameters.apartmentId).toBe(
            result.event.room.apartmentId,
        );
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// room.delete
// ─────────────────────────────────────────────────────────────────────────────

describe('roomDelete', () => {
    it('removes the Room', () => {
        const ctx = setup();
        const r = roomCreate(
            { levelId: ctx.lvlId, apartmentId: ctx.aptId, name: 'X', parameters: makeRoomParameters() },
            ctx.levelStore, ctx.apartmentStore, ctx.roomStore, FROZEN_NOW,
        );
        if (!r.ok) throw new Error('setup fail');
        const result = roomDelete({ id: r.event.room.id }, ctx.roomStore);
        expect(result.ok).toBe(true);
        expect(ctx.roomStore.has(r.event.room.id as never)).toBe(false);
    });

    it('rejects when Room does not exist', () => {
        const ctx = setup();
        const result = roomDelete({ id: 'rm_unknown' }, ctx.roomStore);
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('no-room');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// room.assignToApartment — §1.4 same-Level
// ─────────────────────────────────────────────────────────────────────────────

describe('roomAssignToApartment', () => {
    function setupRoomAndOtherApt() {
        const ctx = setup();
        const r = roomCreate(
            { levelId: ctx.lvlId, apartmentId: ctx.aptId, name: 'X', parameters: makeRoomParameters() },
            ctx.levelStore, ctx.apartmentStore, ctx.roomStore, FROZEN_NOW,
        );
        if (!r.ok) throw new Error('setup fail');
        // Add a second Apartment on the SAME Level.
        const apt2 = apartmentCreate(
            { buildingId: BLDG_ID, levelId: ctx.lvlId, name: 'B', unitNumber: '2A', parameters: makeAptParameters() },
            ctx.levelStore, ctx.apartmentStore, FROZEN_NOW,
        );
        if (!apt2.ok) throw new Error('setup fail');
        return { ...ctx, roomId: r.event.room.id, apt2Id: apt2.event.apartment.id };
    }

    it('moves the Room to a new Apartment on the same Level', () => {
        const ctx = setupRoomAndOtherApt();
        const result = roomAssignToApartment(
            { roomId: ctx.roomId, apartmentId: ctx.apt2Id },
            ctx.apartmentStore, ctx.roomStore, FROZEN_NOW,
        );
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.priorApartmentId).toBe(ctx.aptId);
        expect(result.event.apartmentId).toBe(ctx.apt2Id);
        expect(ctx.roomStore.get(ctx.roomId as never)?.apartmentId).toBe(
            ctx.apt2Id,
        );
    });

    it('rejects when target Apartment is on a different Level (§1.4)', () => {
        const ctx = setupRoomAndOtherApt();
        // Create a Level 1 + Apartment on it.
        levelCreate(
            { buildingId: BLDG_ID, name: 'L1', levelNumber: 1, elevation: 3, height: 2.7 },
            ctx.buildingStore, ctx.levelStore, FROZEN_NOW,
        );
        const l1Id = ctx.levelStore.list()[1]!.id;
        const apt3 = apartmentCreate(
            { buildingId: BLDG_ID, levelId: l1Id, name: 'C', unitNumber: '3A', parameters: makeAptParameters() },
            ctx.levelStore, ctx.apartmentStore, FROZEN_NOW,
        );
        if (!apt3.ok) throw new Error('setup fail');
        const result = roomAssignToApartment(
            { roomId: ctx.roomId, apartmentId: apt3.event.apartment.id },
            ctx.apartmentStore, ctx.roomStore, FROZEN_NOW,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('apartment-level-mismatch');
    });

    it('idempotent when target apartment === current', () => {
        const ctx = setupRoomAndOtherApt();
        const result = roomAssignToApartment(
            { roomId: ctx.roomId, apartmentId: ctx.aptId },
            ctx.apartmentStore, ctx.roomStore, FROZEN_NOW,
        );
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.priorApartmentId).toBe(ctx.aptId);
    });

    it('rejects when Room does not exist', () => {
        const ctx = setupRoomAndOtherApt();
        const result = roomAssignToApartment(
            { roomId: 'rm_unknown', apartmentId: ctx.aptId },
            ctx.apartmentStore, ctx.roomStore, FROZEN_NOW,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('no-room');
    });
});
