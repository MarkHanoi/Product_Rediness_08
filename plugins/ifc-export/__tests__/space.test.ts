/**
 * IfcSpace exporter tests — IFC-α-2 (2026-06-01).
 *
 * Covers `plugins/ifc-export/src/exporters/space.ts` per master plan §7.2.
 * Exit criteria: every PRYZM Room becomes an `IfcSpace` aggregated under
 * the right `IfcBuildingStorey`, with `Pset_SpaceCommon` carrying
 * NetFloorArea / GrossFloorArea / GrossVolume / FinishCeilingHeight /
 * OccupancyType / IsExternal.
 */

import { describe, expect, it } from 'vitest';
import * as WebIFC from 'web-ifc';

import { exportProjectToIFC4X3 } from '../src/exporters/IFC4X3Exporter.js';
import { spaceTypeFor, type RoomToExport } from '../src/exporters/space.js';
import { InMemoryIFCMetaStore } from '../src/index.js';
import { buildTier1Fixture, FIXTURE_LEVEL } from './fixtures.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ROOM_ULID_A = '00000000000000000000000RMA';
const ROOM_ULID_B = '00000000000000000000000RMB';
const ROOM_ULID_C = '00000000000000000000000RMC';

function livingRoom(): RoomToExport {
    return {
        id: `room_${ROOM_ULID_A}`,
        name: 'Living Room',
        type: 'living',
        netAreaM2: 24.5,
        grossAreaM2: 26.0,
        heightM: 2.7,
        perimeter: [
            { x: 0, z: 0 },
            { x: 5, z: 0 },
            { x: 5, z: 5 },
            { x: 0, z: 5 },
        ],
        isExternal: false,
        levelId: FIXTURE_LEVEL.id,
    };
}

function bedroom(): RoomToExport {
    return {
        id: `room_${ROOM_ULID_B}`,
        name: 'Master Bedroom',
        type: 'bedroom',
        netAreaM2: 14.0,
        heightM: 2.7,
        perimeter: [
            { x: 6, z: 0 },
            { x: 10, z: 0 },
            { x: 10, z: 4 },
            { x: 6, z: 4 },
        ],
        isExternal: false,
        levelId: FIXTURE_LEVEL.id,
    };
}

function balcony(): RoomToExport {
    return {
        id: `room_${ROOM_ULID_C}`,
        name: 'Balcony',
        type: 'balcony',
        netAreaM2: 5.0,
        heightM: 2.7,
        perimeter: [
            { x: 0, z: 6 },
            { x: 3, z: 6 },
            { x: 3, z: 8 },
            { x: 0, z: 8 },
        ],
        isExternal: true,
        levelId: FIXTURE_LEVEL.id,
    };
}

async function parseIFC4X3(bytes: Uint8Array) {
    const api = new WebIFC.IfcAPI();
    await api.Init();
    const modelId = api.OpenModel(bytes);
    return { api, modelId };
}

interface ParsedPset {
    name: string;
    properties: Record<string, string | number | boolean | null>;
}

function readPsetsForElement(
    api: WebIFC.IfcAPI,
    modelId: number,
    elementExpressId: number,
): ParsedPset[] {
    const relIds = api.GetLineIDsWithType(modelId, WebIFC.IFCRELDEFINESBYPROPERTIES);
    const out: ParsedPset[] = [];
    for (let i = 0; i < relIds.size(); i += 1) {
        const rel = api.GetLine(modelId, relIds.get(i)) as Record<string, unknown>;
        const relating = rel.RelatingPropertyDefinition as { value: number } | undefined;
        const related = rel.RelatedObjects as Array<{ value: number }> | undefined;
        if (!relating || !related) continue;
        if (!related.some((r) => r.value === elementExpressId)) continue;
        const pset = api.GetLine(modelId, relating.value) as Record<string, unknown>;
        if (pset.type !== WebIFC.IFCPROPERTYSET) continue;
        const psetName = pset.Name ? String((pset.Name as { value: string }).value) : '';
        const propRefs = (pset.HasProperties as Array<{ value: number }> | undefined) ?? [];
        const properties: ParsedPset['properties'] = {};
        for (const ref of propRefs) {
            const prop = api.GetLine(modelId, ref.value) as Record<string, unknown>;
            const nameObj = prop.Name as { value: string } | undefined;
            const valObj = prop.NominalValue as { value: unknown } | undefined;
            if (!nameObj) continue;
            properties[nameObj.value] =
                valObj && valObj.value !== undefined
                    ? (valObj.value as string | number | boolean | null)
                    : null;
        }
        out.push({ name: psetName, properties });
    }
    return out;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('spaceTypeFor (pure helper)', () => {
    it('maps interior room types to INTERNAL', () => {
        expect(spaceTypeFor('living', false)).toBe('INTERNAL');
        expect(spaceTypeFor('kitchen', false)).toBe('INTERNAL');
        expect(spaceTypeFor('bedroom', false)).toBe('INTERNAL');
        expect(spaceTypeFor('bathroom', false)).toBe('INTERNAL');
        expect(spaceTypeFor('corridor', false)).toBe('INTERNAL');
        expect(spaceTypeFor('wc', false)).toBe('INTERNAL');
    });

    it('maps balcony to EXTERNAL even when not flagged isExternal', () => {
        expect(spaceTypeFor('balcony', false)).toBe('EXTERNAL');
    });

    it('maps terrace to EXTERNAL even when not flagged isExternal', () => {
        expect(spaceTypeFor('terrace', false)).toBe('EXTERNAL');
    });

    it('isExternal flag forces EXTERNAL regardless of room type', () => {
        expect(spaceTypeFor('living', true)).toBe('EXTERNAL');
        expect(spaceTypeFor('bedroom', true)).toBe('EXTERNAL');
    });

    it('is case-insensitive on the balcony / terrace overrides', () => {
        expect(spaceTypeFor('Balcony', false)).toBe('EXTERNAL');
        expect(spaceTypeFor('TERRACE', false)).toBe('EXTERNAL');
    });
});

describe('exportRoomToSpace (IFC-α-2)', () => {
    it('emits exactly one IFCSPACE entity per room', async () => {
        const { snapshot, metaStore } = buildTier1Fixture();
        const { bytes, counts } = await exportProjectToIFC4X3(
            { ...snapshot, rooms: [livingRoom(), bedroom()] },
            metaStore,
            { name: 'IFC-α-2' },
        );

        expect((counts as { spaces: number }).spaces).toBe(2);

        const { api, modelId } = await parseIFC4X3(bytes);
        try {
            const spaceIds = api.GetLineIDsWithType(modelId, WebIFC.IFCSPACE);
            expect(spaceIds.size()).toBe(2);
        } finally {
            api.CloseModel(modelId);
        }
    });

    it('preserves IfcSpace.Name and ObjectType from the Room', async () => {
        const { snapshot, metaStore } = buildTier1Fixture();
        const { bytes } = await exportProjectToIFC4X3(
            { ...snapshot, rooms: [livingRoom()] },
            metaStore,
            { name: 'P' },
        );
        const { api, modelId } = await parseIFC4X3(bytes);
        try {
            const spaceIds = api.GetLineIDsWithType(modelId, WebIFC.IFCSPACE);
            expect(spaceIds.size()).toBe(1);
            const line = api.GetLine(modelId, spaceIds.get(0)) as Record<string, unknown>;
            const name = (line.Name as { value: string } | undefined)?.value;
            const objectType = (line.ObjectType as { value: string } | undefined)?.value;
            const longName = (line.LongName as { value: string } | undefined)?.value;
            expect(name).toBe('Living Room');
            expect(objectType).toBe('living');
            expect(longName).toBe('Living Room');
        } finally {
            api.CloseModel(modelId);
        }
    });

    it('IfcSpace.GlobalId is a 22-character base64-ish IFC GUID', async () => {
        const { snapshot, metaStore } = buildTier1Fixture();
        const { bytes } = await exportProjectToIFC4X3(
            { ...snapshot, rooms: [livingRoom()] },
            metaStore,
            { name: 'P' },
        );
        const { api, modelId } = await parseIFC4X3(bytes);
        try {
            const spaceIds = api.GetLineIDsWithType(modelId, WebIFC.IFCSPACE);
            const line = api.GetLine(modelId, spaceIds.get(0)) as Record<string, unknown>;
            const gid = line.GlobalId as { value: string } | string | undefined;
            const resolved = typeof gid === 'string' ? gid : gid?.value;
            expect(resolved).toBeTruthy();
            expect(resolved!.length).toBe(22);
            // IFC GUID alphabet: base64-ish (A-Z, a-z, 0-9, _, $).
            expect(resolved!).toMatch(/^[A-Za-z0-9_$]{22}$/);
        } finally {
            api.CloseModel(modelId);
        }
    });

    it('IfcSpace.PredefinedType is INTERNAL for interior rooms', async () => {
        const { snapshot, metaStore } = buildTier1Fixture();
        const { bytes } = await exportProjectToIFC4X3(
            { ...snapshot, rooms: [livingRoom()] },
            metaStore,
            { name: 'P' },
        );
        const { api, modelId } = await parseIFC4X3(bytes);
        try {
            const spaceIds = api.GetLineIDsWithType(modelId, WebIFC.IFCSPACE);
            const line = api.GetLine(modelId, spaceIds.get(0)) as Record<string, unknown>;
            const predef = line.PredefinedType;
            const predefValue = typeof predef === 'string' ? predef : (predef as { value: string } | undefined)?.value;
            expect(predefValue).toBe('INTERNAL');
        } finally {
            api.CloseModel(modelId);
        }
    });

    it('IfcSpace.PredefinedType is EXTERNAL for balcony rooms', async () => {
        const { snapshot, metaStore } = buildTier1Fixture();
        const { bytes } = await exportProjectToIFC4X3(
            { ...snapshot, rooms: [balcony()] },
            metaStore,
            { name: 'P' },
        );
        const { api, modelId } = await parseIFC4X3(bytes);
        try {
            const spaceIds = api.GetLineIDsWithType(modelId, WebIFC.IFCSPACE);
            const line = api.GetLine(modelId, spaceIds.get(0)) as Record<string, unknown>;
            const predef = line.PredefinedType;
            const predefValue = typeof predef === 'string' ? predef : (predef as { value: string } | undefined)?.value;
            expect(predefValue).toBe('EXTERNAL');
        } finally {
            api.CloseModel(modelId);
        }
    });

    it('attaches Pset_SpaceCommon with all 7 required properties', async () => {
        const { snapshot, metaStore } = buildTier1Fixture();
        const { bytes } = await exportProjectToIFC4X3(
            { ...snapshot, rooms: [livingRoom()] },
            metaStore,
            { name: 'P' },
        );
        const { api, modelId } = await parseIFC4X3(bytes);
        try {
            const spaceIds = api.GetLineIDsWithType(modelId, WebIFC.IFCSPACE);
            const psets = readPsetsForElement(api, modelId, spaceIds.get(0));
            const common = psets.find((p) => p.name === 'Pset_SpaceCommon');
            expect(common).toBeDefined();
            expect(Object.keys(common!.properties).sort()).toEqual([
                'FinishCeilingHeight',
                'GrossFloorArea',
                'GrossVolume',
                'IsExternal',
                'NetFloorArea',
                'OccupancyType',
                'Reference',
            ]);
        } finally {
            api.CloseModel(modelId);
        }
    });

    it('Pset_SpaceCommon.NetFloorArea equals room.netAreaM2', async () => {
        const { snapshot, metaStore } = buildTier1Fixture();
        const { bytes } = await exportProjectToIFC4X3(
            { ...snapshot, rooms: [livingRoom()] },
            metaStore,
            { name: 'P' },
        );
        const { api, modelId } = await parseIFC4X3(bytes);
        try {
            const spaceIds = api.GetLineIDsWithType(modelId, WebIFC.IFCSPACE);
            const psets = readPsetsForElement(api, modelId, spaceIds.get(0));
            const common = psets.find((p) => p.name === 'Pset_SpaceCommon');
            expect(common?.properties.NetFloorArea).toBe(24.5);
        } finally {
            api.CloseModel(modelId);
        }
    });

    it('Pset_SpaceCommon.GrossFloorArea uses explicit grossAreaM2 when present', async () => {
        const { snapshot, metaStore } = buildTier1Fixture();
        const { bytes } = await exportProjectToIFC4X3(
            { ...snapshot, rooms: [livingRoom()] },
            metaStore,
            { name: 'P' },
        );
        const { api, modelId } = await parseIFC4X3(bytes);
        try {
            const spaceIds = api.GetLineIDsWithType(modelId, WebIFC.IFCSPACE);
            const psets = readPsetsForElement(api, modelId, spaceIds.get(0));
            const common = psets.find((p) => p.name === 'Pset_SpaceCommon');
            expect(common?.properties.GrossFloorArea).toBe(26.0);
        } finally {
            api.CloseModel(modelId);
        }
    });

    it('Pset_SpaceCommon.GrossFloorArea falls back to netAreaM2 when grossAreaM2 omitted', async () => {
        const { snapshot, metaStore } = buildTier1Fixture();
        // `bedroom()` has no grossAreaM2 — exporter must fall back.
        const { bytes } = await exportProjectToIFC4X3(
            { ...snapshot, rooms: [bedroom()] },
            metaStore,
            { name: 'P' },
        );
        const { api, modelId } = await parseIFC4X3(bytes);
        try {
            const spaceIds = api.GetLineIDsWithType(modelId, WebIFC.IFCSPACE);
            const psets = readPsetsForElement(api, modelId, spaceIds.get(0));
            const common = psets.find((p) => p.name === 'Pset_SpaceCommon');
            expect(common?.properties.GrossFloorArea).toBe(14.0); // == netAreaM2
        } finally {
            api.CloseModel(modelId);
        }
    });

    it('Pset_SpaceCommon.OccupancyType carries the granular room type', async () => {
        const { snapshot, metaStore } = buildTier1Fixture();
        const { bytes } = await exportProjectToIFC4X3(
            { ...snapshot, rooms: [bedroom()] },
            metaStore,
            { name: 'P' },
        );
        const { api, modelId } = await parseIFC4X3(bytes);
        try {
            const spaceIds = api.GetLineIDsWithType(modelId, WebIFC.IFCSPACE);
            const psets = readPsetsForElement(api, modelId, spaceIds.get(0));
            const common = psets.find((p) => p.name === 'Pset_SpaceCommon');
            expect(common?.properties.OccupancyType).toBe('bedroom');
        } finally {
            api.CloseModel(modelId);
        }
    });

    it('Pset_SpaceCommon.FinishCeilingHeight equals room.heightM', async () => {
        const { snapshot, metaStore } = buildTier1Fixture();
        const { bytes } = await exportProjectToIFC4X3(
            { ...snapshot, rooms: [livingRoom()] },
            metaStore,
            { name: 'P' },
        );
        const { api, modelId } = await parseIFC4X3(bytes);
        try {
            const spaceIds = api.GetLineIDsWithType(modelId, WebIFC.IFCSPACE);
            const psets = readPsetsForElement(api, modelId, spaceIds.get(0));
            const common = psets.find((p) => p.name === 'Pset_SpaceCommon');
            expect(common?.properties.FinishCeilingHeight).toBe(2.7);
        } finally {
            api.CloseModel(modelId);
        }
    });

    it('Pset_SpaceCommon.GrossVolume = grossArea × heightM', async () => {
        const { snapshot, metaStore } = buildTier1Fixture();
        const { bytes } = await exportProjectToIFC4X3(
            { ...snapshot, rooms: [livingRoom()] },
            metaStore,
            { name: 'P' },
        );
        const { api, modelId } = await parseIFC4X3(bytes);
        try {
            const spaceIds = api.GetLineIDsWithType(modelId, WebIFC.IFCSPACE);
            const psets = readPsetsForElement(api, modelId, spaceIds.get(0));
            const common = psets.find((p) => p.name === 'Pset_SpaceCommon');
            // gross=26.0 × height=2.7 = 70.2
            expect(common?.properties.GrossVolume).toBeCloseTo(70.2, 6);
        } finally {
            api.CloseModel(modelId);
        }
    });

    it('Pset_SpaceCommon.IsExternal matches room.isExternal', async () => {
        const { snapshot, metaStore } = buildTier1Fixture();
        const { bytes } = await exportProjectToIFC4X3(
            { ...snapshot, rooms: [livingRoom(), balcony()] },
            metaStore,
            { name: 'P' },
        );
        const { api, modelId } = await parseIFC4X3(bytes);
        try {
            const spaceIds = api.GetLineIDsWithType(modelId, WebIFC.IFCSPACE);
            const flags: boolean[] = [];
            for (let i = 0; i < spaceIds.size(); i += 1) {
                const psets = readPsetsForElement(api, modelId, spaceIds.get(i));
                const common = psets.find((p) => p.name === 'Pset_SpaceCommon');
                flags.push(common?.properties.IsExternal as boolean);
            }
            // One true (balcony), one false (living).
            expect(flags.sort()).toEqual([false, true]);
        } finally {
            api.CloseModel(modelId);
        }
    });

    it('emits IfcRelAggregates linking storey → IfcSpace', async () => {
        const { snapshot, metaStore } = buildTier1Fixture();
        const { bytes } = await exportProjectToIFC4X3(
            { ...snapshot, rooms: [livingRoom(), bedroom()] },
            metaStore,
            { name: 'P' },
        );
        const { api, modelId } = await parseIFC4X3(bytes);
        try {
            // Find every IfcRelAggregates whose RelatedObjects include any IfcSpace.
            const spaceIds = api.GetLineIDsWithType(modelId, WebIFC.IFCSPACE);
            const spaceExpressIds = new Set<number>();
            for (let i = 0; i < spaceIds.size(); i += 1) spaceExpressIds.add(spaceIds.get(i));

            const relIds = api.GetLineIDsWithType(modelId, WebIFC.IFCRELAGGREGATES);
            let spacesAggregated = 0;
            let storeyAggregating = 0;
            for (let i = 0; i < relIds.size(); i += 1) {
                const rel = api.GetLine(modelId, relIds.get(i)) as Record<string, unknown>;
                const related = rel.RelatedObjects as Array<{ value: number }> | undefined;
                const relating = rel.RelatingObject as { value: number } | undefined;
                if (!related || !relating) continue;
                const relatedSpaces = related.filter((r) => spaceExpressIds.has(r.value));
                if (relatedSpaces.length === 0) continue;
                spacesAggregated += relatedSpaces.length;
                // Verify the aggregating element is an IfcBuildingStorey.
                const parent = api.GetLine(modelId, relating.value) as Record<string, unknown>;
                if (parent.type === WebIFC.IFCBUILDINGSTOREY) storeyAggregating += 1;
            }
            expect(spacesAggregated).toBe(2);
            expect(storeyAggregating).toBeGreaterThan(0);
        } finally {
            api.CloseModel(modelId);
        }
    });

    it('three rooms produce three IfcSpaces (interior + interior + balcony)', async () => {
        const { snapshot, metaStore } = buildTier1Fixture();
        const { bytes, counts } = await exportProjectToIFC4X3(
            { ...snapshot, rooms: [livingRoom(), bedroom(), balcony()] },
            metaStore,
            { name: 'P' },
        );
        expect((counts as { spaces: number }).spaces).toBe(3);

        const { api, modelId } = await parseIFC4X3(bytes);
        try {
            const spaceIds = api.GetLineIDsWithType(modelId, WebIFC.IFCSPACE);
            expect(spaceIds.size()).toBe(3);
        } finally {
            api.CloseModel(modelId);
        }
    });

    it('empty rooms array → no IFCSPACE entities', async () => {
        const { snapshot, metaStore } = buildTier1Fixture();
        const { bytes, counts } = await exportProjectToIFC4X3(
            { ...snapshot, rooms: [] },
            metaStore,
            { name: 'P' },
        );
        expect((counts as { spaces: number }).spaces).toBe(0);

        const { api, modelId } = await parseIFC4X3(bytes);
        try {
            const spaceIds = api.GetLineIDsWithType(modelId, WebIFC.IFCSPACE);
            expect(spaceIds.size()).toBe(0);
        } finally {
            api.CloseModel(modelId);
        }
    });

    it('omitted rooms (undefined) → no IFCSPACE entities (backwards compatibility)', async () => {
        const { snapshot, metaStore } = buildTier1Fixture();
        const { bytes, counts } = await exportProjectToIFC4X3(
            snapshot,
            metaStore,
            { name: 'P' },
        );
        // Existing IFC4X3 callers (zero rooms) keep working unchanged.
        expect((counts as { spaces: number }).spaces).toBe(0);

        const { api, modelId } = await parseIFC4X3(bytes);
        try {
            expect(api.GetLineIDsWithType(modelId, WebIFC.IFCSPACE).size()).toBe(0);
        } finally {
            api.CloseModel(modelId);
        }
    });

    it('Room with NaN/negative netAreaM2 throws (defensive guard)', async () => {
        const { snapshot, metaStore } = buildTier1Fixture();
        const bad: RoomToExport = { ...livingRoom(), netAreaM2: Number.NaN };
        await expect(
            exportProjectToIFC4X3(
                { ...snapshot, rooms: [bad] },
                metaStore,
                { name: 'P' },
            ),
        ).rejects.toThrow(/netAreaM2/);

        const bad2: RoomToExport = { ...livingRoom(), netAreaM2: -3 };
        await expect(
            exportProjectToIFC4X3(
                { ...snapshot, rooms: [bad2] },
                metaStore,
                { name: 'P' },
            ),
        ).rejects.toThrow(/netAreaM2/);
    });

    it('Room with degenerate (< 3 point) perimeter throws', async () => {
        const { snapshot, metaStore } = buildTier1Fixture();
        const bad: RoomToExport = {
            ...livingRoom(),
            perimeter: [{ x: 0, z: 0 }, { x: 1, z: 0 }],
        };
        await expect(
            exportProjectToIFC4X3(
                { ...snapshot, rooms: [bad] },
                metaStore,
                { name: 'P' },
            ),
        ).rejects.toThrow(/perimeter/);
    });

    it('honours side-car Psets from IFCMetaStore (on top of Pset_SpaceCommon)', async () => {
        const { snapshot, metaStore } = buildTier1Fixture();
        const room = livingRoom();
        // Register a side-car Pset_SpaceFireSafetyRequirements for the room.
        (metaStore as InMemoryIFCMetaStore).add({
            pryzmElementId: room.id,
            globalId: '0Room0Room0Room0Room00',
            typeName: 'IFCSPACE',
            name: 'Living Room',
            psets: {
                Pset_SpaceFireSafetyRequirements: {
                    FireRiskFactor: 'LOW',
                    SprinklerProtection: true,
                },
            },
            tier: 1,
        });

        const { bytes } = await exportProjectToIFC4X3(
            { ...snapshot, rooms: [room] },
            metaStore,
            { name: 'P' },
        );
        const { api, modelId } = await parseIFC4X3(bytes);
        try {
            const spaceIds = api.GetLineIDsWithType(modelId, WebIFC.IFCSPACE);
            const psets = readPsetsForElement(api, modelId, spaceIds.get(0));
            const names = psets.map((p) => p.name).sort();
            expect(names).toContain('Pset_SpaceCommon');
            expect(names).toContain('Pset_SpaceFireSafetyRequirements');
        } finally {
            api.CloseModel(modelId);
        }
    });

    it('does NOT contaminate Tier-1 IfcRelContainedInSpatialStructure counts', async () => {
        const { snapshot, metaStore } = buildTier1Fixture();
        const { bytes } = await exportProjectToIFC4X3(
            { ...snapshot, rooms: [livingRoom(), bedroom()] },
            metaStore,
            { name: 'P' },
        );
        const { api, modelId } = await parseIFC4X3(bytes);
        try {
            // IfcSpaces must NOT appear in IfcRelContainedInSpatialStructure.RelatedElements
            // (that relation is reserved for IfcElements; spaces aggregate via IfcRelAggregates).
            const spaceIds = api.GetLineIDsWithType(modelId, WebIFC.IFCSPACE);
            const spaceExpressIds = new Set<number>();
            for (let i = 0; i < spaceIds.size(); i += 1) spaceExpressIds.add(spaceIds.get(i));

            const relIds = api.GetLineIDsWithType(modelId, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE);
            for (let i = 0; i < relIds.size(); i += 1) {
                const rel = api.GetLine(modelId, relIds.get(i)) as Record<string, unknown>;
                const related = rel.RelatedElements as Array<{ value: number }> | undefined;
                for (const r of related ?? []) {
                    expect(spaceExpressIds.has(r.value)).toBe(false);
                }
            }
        } finally {
            api.CloseModel(modelId);
        }
    });

    it('rooms loop is additive — existing 6 Tier-1 element counts unchanged', async () => {
        const { snapshot, metaStore } = buildTier1Fixture();
        const { counts } = await exportProjectToIFC4X3(
            { ...snapshot, rooms: [livingRoom(), bedroom()] },
            metaStore,
            { name: 'P' },
        );
        expect(counts.walls).toBe(1);
        expect(counts.slabs).toBe(1);
        expect(counts.doors).toBe(1);
        expect(counts.windows).toBe(1);
        expect(counts.columns).toBe(1);
        expect(counts.beams).toBe(1);
        // Pset count grows by 2 (one Pset_SpaceCommon per room) on top of the
        // 6 Tier-1 Psets.
        expect(counts.psets).toBeGreaterThanOrEqual(8);
    });
});
