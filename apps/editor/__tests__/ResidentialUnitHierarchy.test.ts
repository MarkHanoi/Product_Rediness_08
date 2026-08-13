// L-864 / UNIT CONTAINMENT — the generated building's hierarchy spine.
//
// THE FINDING (production, 2026-08-13): a five-apartments-per-floor building shipped a tree
// reading "Unassigned rooms on Level 01" with every room flat under its level, a building
// object with `BUILDING USE —` / `STOREYS —` / `No template assigned`, and a `+ Unit`
// affordance the generator never used. The generator KNEW all of it at generation time.
//
// `planUnitHierarchy` is the pure planner: given what already exists in `hierarchyStore`, the
// BIM levels just minted, and the per-apartment unit plan, it emits the ORDERED list of
// EXISTING bus verbs (hierarchy.createSite / createBuilding / createLevel / createUnit /
// updateNode) that build the spine — plus the unitId each apartment's rooms must carry.
//
// No NEW bus verb is registered and no NEW user-visible attribute is minted (C67/C68): every
// verb and every field here already exists and is already chat-classified.

import { describe, it, expect } from 'vitest';
import {
    planUnitHierarchy,
    unitKey,
    type ExistingHierarchy,
} from '../src/ui/residential-building/residentialUnitHierarchy';
import type { PlannedUnit } from '@pryzm/ai-host';
// Deep source imports, NOT the `@pryzm/room-topology` barrel: the barrel pulls the whole
// topology package (detection engine + boundary builder) into this suite and costs minutes of
// transform for two symbols. These are the exact two modules the executor's room path uses.
import { roomDataFromGraphSpec } from '../../../packages/room-topology/src/roomFromGraphSpec';
import { RoomDataAddSchema } from '../../../packages/room-topology/src/RoomDataSchema';

const EMPTY: ExistingHierarchy = { sites: [], buildings: [], levels: [] };

function unit(levelIndex: number, indexOnLevel: number, letter: string, beds: number): PlannedUnit {
    const code = String(levelIndex).padStart(2, '0');
    return {
        levelIndex,
        indexOnLevel,
        unitNumber: `${code}${letter}`,
        name: `Apartment ${code}${letter}`,
        unitType: beds === 0 ? 'studio' : `${beds}-bed`,
        bedrooms: beds,
        typology: 'T2',
        grossUnitAreaM2: 70,
        roomCount: 6,
    } as PlannedUnit;
}

const BIM_LEVELS = [
    { bimLevelId: 'bim-0', name: 'Ground', levelIndex: 0 },
    { bimLevelId: 'bim-1', name: 'Level 01', levelIndex: 1 },
    { bimLevelId: 'bim-2', name: 'Level 02', levelIndex: 2 },
];

let seq = 0;
const newId = (): string => `id-${++seq}`;
const freshIds = (): (() => string) => { seq = 0; return newId; };

describe('planUnitHierarchy — from an EMPTY hierarchy', () => {
    it('mints the whole spine site → building → levels → units, in dependency order', () => {
        const plan = planUnitHierarchy({
            existing: EMPTY,
            projectName: 'Plot 7',
            bimLevels: BIM_LEVELS,
            units: [unit(1, 0, 'A', 2), unit(1, 1, 'B', 1)],
            storeys: 3,
            newId: freshIds(),
        });
        const verbs = plan.ops.map(o => o.verb);
        expect(verbs[0]).toBe('hierarchy.createSite');
        expect(verbs[1]).toBe('hierarchy.createBuilding');
        // every createLevel precedes every createUnit
        const lastLevel = verbs.lastIndexOf('hierarchy.createLevel');
        const firstUnit = verbs.indexOf('hierarchy.createUnit');
        expect(lastLevel).toBeGreaterThan(-1);
        expect(firstUnit).toBeGreaterThan(lastLevel);
        expect(verbs.filter(v => v === 'hierarchy.createLevel')).toHaveLength(3);
        expect(verbs.filter(v => v === 'hierarchy.createUnit')).toHaveLength(2);
    });

    it('names the site from the project and the building carries USE + STOREYS (not blank)', () => {
        const plan = planUnitHierarchy({
            existing: EMPTY, projectName: 'Plot 7', bimLevels: BIM_LEVELS,
            units: [unit(1, 0, 'A', 2)], storeys: 3, newId: freshIds(),
        });
        const site = plan.ops.find(o => o.verb === 'hierarchy.createSite')!;
        expect(site.payload.name).toBe('Plot 7');
        const update = plan.ops.find(o => o.verb === 'hierarchy.updateNode')!;
        expect(update.payload.id).toBe(plan.buildingId);
        expect(update.payload.updates).toMatchObject({ buildingUse: 'Residential', numberOfStoreys: 3 });
    });

    it('the unit ops carry the number and the AS-BUILT type, and each maps back to its apartment', () => {
        const plan = planUnitHierarchy({
            existing: EMPTY, projectName: 'P', bimLevels: BIM_LEVELS,
            units: [unit(1, 0, 'A', 2), unit(1, 1, 'B', 0), unit(2, 0, 'A', 3)],
            storeys: 3, newId: freshIds(),
        });
        const unitOps = plan.ops.filter(o => o.verb === 'hierarchy.createUnit');
        expect(unitOps.map(o => o.payload.unitNumber)).toEqual(['01A', '01B', '02A']);
        expect(unitOps.map(o => o.payload.unitType)).toEqual(['2-bed', 'studio', '3-bed']);
        expect(plan.unitIdByKey.get(unitKey(1, 0))).toBe(unitOps[0]!.payload.id);
        expect(plan.unitIdByKey.get(unitKey(1, 1))).toBe(unitOps[1]!.payload.id);
        expect(plan.unitIdByKey.get(unitKey(2, 0))).toBe(unitOps[2]!.payload.id);
        expect(plan.unitIdByKey.size).toBe(3);
    });

    it('parents each unit on the HIERARCHY level whose bimLevelId matches its BIM level', () => {
        const plan = planUnitHierarchy({
            existing: EMPTY, projectName: 'P', bimLevels: BIM_LEVELS,
            units: [unit(2, 0, 'A', 1)], storeys: 3, newId: freshIds(),
        });
        const level2 = plan.ops.find(o => o.verb === 'hierarchy.createLevel' && o.payload.bimLevelId === 'bim-2')!;
        const unitOp = plan.ops.find(o => o.verb === 'hierarchy.createUnit')!;
        expect(unitOp.payload.levelId).toBe(level2.payload.id);
        expect(unitOp.payload.levelId).not.toBe('bim-2');   // the HIERARCHY id, never the BIM id
    });
});

describe('planUnitHierarchy — REUSE, so a second generation does not duplicate the spine', () => {
    const existing: ExistingHierarchy = {
        sites: [{ id: 'site-1', name: 'Existing site' }],
        buildings: [{ id: 'bld-1', siteId: 'site-1' }],
        levels: [{ id: 'lvl-1', buildingId: 'bld-1', bimLevelId: 'bim-1' }],
    };

    it('reuses an existing site + building + level instead of minting rivals', () => {
        const plan = planUnitHierarchy({
            existing, projectName: 'P', bimLevels: BIM_LEVELS,
            units: [unit(1, 0, 'A', 2)], storeys: 3, newId: freshIds(),
        });
        expect(plan.ops.some(o => o.verb === 'hierarchy.createSite')).toBe(false);
        expect(plan.ops.some(o => o.verb === 'hierarchy.createBuilding')).toBe(false);
        expect(plan.siteId).toBe('site-1');
        expect(plan.buildingId).toBe('bld-1');
        // bim-1 already has a hierarchy level → only bim-0 and bim-2 are created
        const created = plan.ops.filter(o => o.verb === 'hierarchy.createLevel').map(o => o.payload.bimLevelId);
        expect(created.sort()).toEqual(['bim-0', 'bim-2']);
        // and the unit hangs off the EXISTING level node
        expect(plan.ops.find(o => o.verb === 'hierarchy.createUnit')!.payload.levelId).toBe('lvl-1');
    });
});

describe('the stamped room — the executor writes room.unitId at BIRTH', () => {
    // The executor builds each room with `roomDataFromGraphSpec(...)` and, when the apartment has
    // a planned unit, ships `{ ...rd, unitId }`. That object must survive the SAME Zod gate
    // `RoomStore.add` runs, or the whole containment silently drops every room.
    it('a graph room stamped with a unitId still passes RoomDataAddSchema', () => {
        const rd = roomDataFromGraphSpec(
            {
                levelId: 'bim-1',
                name: 'Bedroom 1',
                occupancyType: 'bedroom',
                polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }],
            },
            { levelHeightM: 2.7, roomNumber: '01' },
        );
        expect(rd).not.toBeNull();
        // Unstamped: the pre-L-864 shape, an "unassigned room".
        expect(RoomDataAddSchema.safeParse(rd).success).toBe(true);
        expect((rd as { unitId?: string }).unitId).toBeUndefined();
        // Stamped: what the executor now dispatches.
        const stamped = { ...rd!, unitId: 'unit-01A' };
        const parsed = RoomDataAddSchema.safeParse(stamped);
        expect(parsed.success).toBe(true);
        expect((parsed as { data: { unitId?: string } }).data.unitId).toBe('unit-01A');
    });
});

describe('planUnitHierarchy — degenerate input', () => {
    it('plans nothing at all when there are no units to contain', () => {
        const plan = planUnitHierarchy({
            existing: EMPTY, projectName: 'P', bimLevels: BIM_LEVELS,
            units: [], storeys: 3, newId: freshIds(),
        });
        expect(plan.ops).toEqual([]);
        expect(plan.unitIdByKey.size).toBe(0);
    });

    it('skips a unit whose level has no BIM level (cannot be parented) rather than orphaning it', () => {
        const plan = planUnitHierarchy({
            existing: EMPTY, projectName: 'P', bimLevels: [BIM_LEVELS[0]!],
            units: [unit(1, 0, 'A', 2)], storeys: 1, newId: freshIds(),
        });
        expect(plan.ops.filter(o => o.verb === 'hierarchy.createUnit')).toHaveLength(0);
        expect(plan.unitIdByKey.size).toBe(0);
    });
});
