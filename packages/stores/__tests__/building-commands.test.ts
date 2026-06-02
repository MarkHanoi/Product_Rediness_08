// A.23.c.1 (Phase A · Sprint 2) — building.* command handler tests.

import { describe, expect, it } from 'vitest';
import { BuildingStore } from '../src/BuildingStore.js';
import {
    buildingCreate,
    buildingUpdate,
    buildingDelete,
    deterministicBuildingId,
} from '../src/aggregate-commands/index.js';

const FROZEN_NOW = () => '2026-06-01T12:00:00.000Z';

// ─────────────────────────────────────────────────────────────────────────────
// building.create
// ─────────────────────────────────────────────────────────────────────────────

describe('buildingCreate', () => {
    it('creates a Building with deterministic id', () => {
        const store = new BuildingStore();
        const result = buildingCreate(
            { projectId: 'proj-001', name: 'Holborn Block A' },
            store,
            FROZEN_NOW,
        );
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.type).toBe('building.created');
        expect(result.event.building.id).toBe('bldg_proj-001');
        expect(result.event.building.name).toBe('Holborn Block A');
        expect(store.size()).toBe(1);
    });

    it('REJECTS when a Building already exists (§1.1)', () => {
        const store = new BuildingStore();
        buildingCreate(
            { projectId: 'proj-001', name: 'First' },
            store,
            FROZEN_NOW,
        );
        const result = buildingCreate(
            { projectId: 'proj-001', name: 'Second' },
            store,
            FROZEN_NOW,
        );
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('building-already-exists');
        expect(result.message).toMatch(/C20 §1\.1/);
    });

    it('accepts optional description + siteId', () => {
        const store = new BuildingStore();
        const result = buildingCreate(
            {
                projectId: 'proj-001',
                name: 'Building A',
                description: 'A 6-storey mixed-use building',
                siteId: 'site_proj-001',
            },
            store,
            FROZEN_NOW,
        );
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.building.description).toBe(
            'A 6-storey mixed-use building',
        );
        expect(result.event.building.siteId).toBe('site_proj-001');
    });

    it('rejects invalid payload (empty name)', () => {
        const store = new BuildingStore();
        const result = buildingCreate(
            { projectId: 'proj-001', name: '' },
            store,
            FROZEN_NOW,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('invalid-payload');
    });

    it('deterministicBuildingId returns bldg_<projectId>', () => {
        expect(deterministicBuildingId('proj-abc')).toBe('bldg_proj-abc');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// building.update
// ─────────────────────────────────────────────────────────────────────────────

describe('buildingUpdate', () => {
    function setupBuilding() {
        const store = new BuildingStore();
        buildingCreate(
            { projectId: 'proj-001', name: 'Original Name' },
            store,
            FROZEN_NOW,
        );
        return store;
    }

    it('patches the name + bumps updatedAt', () => {
        const store = setupBuilding();
        const result = buildingUpdate(
            {
                id: 'bldg_proj-001',
                patch: { name: 'Renamed' },
            },
            store,
            () => '2026-06-02T08:00:00.000Z',
        );
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.type).toBe('building.updated');
        expect(result.event.building.name).toBe('Renamed');
        expect(result.event.building.updatedAt).toBe('2026-06-02T08:00:00.000Z');
        expect(result.event.building.createdAt).toBe('2026-06-01T12:00:00.000Z');
    });

    it('event carries the PRIOR Building for undo', () => {
        const store = setupBuilding();
        const result = buildingUpdate(
            {
                id: 'bldg_proj-001',
                patch: { name: 'Renamed' },
            },
            store,
            FROZEN_NOW,
        );
        if (!result.ok) throw new Error('unreachable');
        expect(result.event.prior.name).toBe('Original Name');
    });

    it('siteId: string sets the link; siteId: null CLEARS it', () => {
        const store = setupBuilding();
        buildingUpdate(
            { id: 'bldg_proj-001', patch: { siteId: 'site_proj-001' } },
            store,
            FROZEN_NOW,
        );
        expect(store.get('bldg_proj-001' as never)?.siteId).toBe(
            'site_proj-001',
        );
        buildingUpdate(
            { id: 'bldg_proj-001', patch: { siteId: null } },
            store,
            FROZEN_NOW,
        );
        expect(store.get('bldg_proj-001' as never)?.siteId).toBeUndefined();
    });

    it('REJECTS when Building does not exist', () => {
        const store = new BuildingStore();
        const result = buildingUpdate(
            { id: 'bldg_x', patch: { name: 'X' } },
            store,
            FROZEN_NOW,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('no-building');
    });

    it('rejects empty patch (Zod refine)', () => {
        const store = setupBuilding();
        const result = buildingUpdate(
            { id: 'bldg_proj-001', patch: {} },
            store,
            FROZEN_NOW,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('invalid-payload');
    });

    it('rejects description over 2000 chars', () => {
        const store = setupBuilding();
        const result = buildingUpdate(
            {
                id: 'bldg_proj-001',
                patch: { description: 'x'.repeat(2001) },
            },
            store,
            FROZEN_NOW,
        );
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('invalid-payload');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// building.delete — FORBIDDEN per §1.1
// ─────────────────────────────────────────────────────────────────────────────

describe('buildingDelete', () => {
    it('ALWAYS returns forbidden-delete (single-Building rule)', () => {
        const store = new BuildingStore();
        buildingCreate(
            { projectId: 'proj-001', name: 'A' },
            store,
            FROZEN_NOW,
        );
        const result = buildingDelete({ id: 'bldg_proj-001' }, store);
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('forbidden-delete');
        expect(result.message).toMatch(/C20 §1\.1/);
        // Store unchanged.
        expect(store.size()).toBe(1);
    });

    it('still rejects when the id is unknown (forbidden takes precedence)', () => {
        const store = new BuildingStore();
        const result = buildingDelete({ id: 'bldg_unknown' }, store);
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('forbidden-delete');
    });

    it('rejects invalid payload (missing id)', () => {
        const store = new BuildingStore();
        const result = buildingDelete({}, store);
        if (result.ok) throw new Error('unreachable');
        expect(result.reason).toBe('invalid-payload');
    });
});
