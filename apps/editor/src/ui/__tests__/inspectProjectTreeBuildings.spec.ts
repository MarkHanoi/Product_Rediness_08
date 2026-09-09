/**
 * ADR-0385 — the inspect tree's IfcBuilding tier.
 *
 * The founder, 2026-09-09: *"each building should be considered as a different
 * building entity for the IFC schema AND THE INSPECT TREE etc… as per IFC
 * standards."* These arms cover the tree half.
 *
 * ⛔ WHAT THE TREE DREW BEFORE, and why this file exists. `ProjectTreeZone.ts`
 * emitted exactly two hard-coded rows — a `<span>Building</span>` with no data
 * behind it and, indented UNDERNEATH it, a `<span>Site</span>` — and then rendered
 * every level as a FLAT SIBLING of both. So a master plan of three blocks drew one
 * row saying "Building", the site appeared to be inside the building, and no level
 * was contained by anything. That is fabricated spatial structure, which is the
 * failure C01 §6 rule 6 exists to prevent, and it is what the founder was looking
 * at.
 *
 * ⭐ THE POINT OF THESE ARMS IS THE SHARED AUTHORITY, not the rows. The tier is
 * built by `buildBuildingRoster()` from `@pryzm/core-app-model` — the SAME call
 * `packages/file-format/src/export/ifc/buildingContainment.ts` makes. C84 EI-9: the
 * IFC file and the tree agree because they ask one function, not because two
 * implementations were written carefully. An arm that checked the tree alone would
 * stay green while the exporter said something else, which is precisely
 * [[same-rule-two-implementations]].
 */

import { describe, it, expect } from 'vitest';
import {
    HierarchyStore,
    readBuildingSubstrate,
    UNREADABLE_SUBSTRATE,
    DEFAULT_BUILDING_ID,
} from '@pryzm/core-app-model';
import { buildProjectTreeModel } from '../inspect/audit/projectTreeModel';

const LEVELS = ['L1', 'L2', 'L3'];

/** A hierarchy node with the boilerplate the store requires. */
const node = (over: Record<string, unknown>) => ({
    plannedData: { customProperties: {} },
    syncState: 'no-template',
    metadata: { createdAt: 0, modifiedAt: 0, createdBy: 'spec', version: 1 },
    ...over,
}) as never;

describe('ADR-0385 — the inspect tree groups storeys under their IfcBuilding', () => {
    it('THE BACK-COMPAT ARM: no hierarchy buildings ⇒ ONE derived building holding every level', () => {
        // ADR-0383 D3. Every project authored before ADR-0385 is in this state, and
        // its tree must be unchanged: one building row, every level under it, in
        // input order. The renderer draws this one as the literal word "Building",
        // exactly where the old hard-coded row sat.
        const model = buildProjectTreeModel(LEVELS, '', readBuildingSubstrate(new HierarchyStore()));

        expect(model.buildings).toHaveLength(1);
        expect(model.buildings[0]!.buildingId).toBe(DEFAULT_BUILDING_ID);
        expect(model.buildings[0]!.kind).toBe('derived');
        expect(model.buildings[0]!.levels.map((l) => l.levelId)).toEqual(LEVELS);
        expect(model.unresolvedBuildings).toEqual([]);
    });

    it('three hierarchy buildings ⇒ three rungs, each owning ITS OWN storeys', () => {
        const store = new HierarchyStore();
        store.add(node({ id: 'site-1', type: 'site', name: 'Site' }));
        for (const [b, name, level] of [
            ['b-a', 'Block A', 'L1'],
            ['b-b', 'Block B', 'L2'],
            ['b-c', 'Block C', 'L3'],
        ] as const) {
            store.add(node({ id: b, type: 'building', name, siteId: 'site-1' }));
            store.add(node({ id: `hl-${b}`, type: 'level', name: `${name} storey`, buildingId: b, bimLevelId: level }));
        }

        const model = buildProjectTreeModel(LEVELS, '', readBuildingSubstrate(store));

        expect(model.buildings).toHaveLength(3);
        expect(model.buildings.map((b) => b.name)).toEqual(['Block A', 'Block B', 'Block C']);
        expect(model.buildings.every((b) => b.kind === 'carried')).toBe(true);
        expect(model.buildings.map((b) => b.levels.map((l) => l.levelId))).toEqual([['L1'], ['L2'], ['L3']]);
    });

    it('one building owning several storeys keeps them together, in level order', () => {
        const store = new HierarchyStore();
        store.add(node({ id: 'b-a', type: 'building', name: 'Block A', siteId: 's' }));
        store.add(node({ id: 'h1', type: 'level', name: 'a', buildingId: 'b-a', bimLevelId: 'L1' }));
        store.add(node({ id: 'h3', type: 'level', name: 'c', buildingId: 'b-a', bimLevelId: 'L3' }));

        const model = buildProjectTreeModel(LEVELS, '', readBuildingSubstrate(store));

        // L2 is claimed by nobody, so it falls to the default — TWO rungs, and the
        // unclaimed level is NOT quietly folded into Block A.
        expect(model.buildings.map((b) => b.name)).toEqual(['Block A', 'Default Building']);
        expect(model.buildings[0]!.levels.map((l) => l.levelId)).toEqual(['L1', 'L3']);
        expect(model.buildings[1]!.levels.map((l) => l.levelId)).toEqual(['L2']);
    });

    it('⛔ AN UNREADABLE HIERARCHY IS A FAILURE, NOT AN EMPTY PROJECT', () => {
        // §CONTEXT-DATA-HONESTY (L-581/L-616), and the arm that pairs with the
        // back-compat one above. Both draw ONE building — they must, or the levels
        // would vanish from the tree — so the ONLY thing separating "this project has
        // no buildings" from "I could not read the hierarchy" is
        // `unresolvedBuildings`. If these two arms ever agree, a failure is being
        // rendered as an emptiness.
        const empty = buildProjectTreeModel(LEVELS, '', readBuildingSubstrate(new HierarchyStore()));
        const broken = buildProjectTreeModel(LEVELS, '', UNREADABLE_SUBSTRATE);

        expect(broken.buildings).toHaveLength(1);
        expect(broken.buildings[0]!.levels.map((l) => l.levelId)).toEqual(LEVELS);

        expect(empty.unresolvedBuildings).toHaveLength(0);
        expect(broken.unresolvedBuildings).toHaveLength(3);
        expect(broken.unresolvedBuildings[0]!.why).toContain('unreadable');
    });

    it('a DANGLING buildingId is reported, not silently defaulted', () => {
        const store = new HierarchyStore();
        store.add(node({ id: 'h1', type: 'level', name: 'a', buildingId: 'ghost', bimLevelId: 'L1' }));
        const model = buildProjectTreeModel(LEVELS, '', readBuildingSubstrate(store));
        expect(model.unresolvedBuildings.map((u) => u.levelId)).toEqual(['L1']);
        expect(model.unresolvedBuildings[0]!.why).toContain('resolves to no building');
    });

    it('THE REGROUPING IS BY REFERENCE — buildings and levels cannot drift apart', () => {
        // `buildings` is not a second traversal and not a copy: it holds the SAME
        // `LevelTreeGroups` objects `levels` holds. Two records of one fact is this
        // repo's dominant defect; identity is the cheapest possible guarantee against
        // it, and this arm is what pins that the guarantee is still identity.
        const store = new HierarchyStore();
        store.add(node({ id: 'b-a', type: 'building', name: 'Block A', siteId: 's' }));
        store.add(node({ id: 'h1', type: 'level', name: 'a', buildingId: 'b-a', bimLevelId: 'L1' }));

        const model = buildProjectTreeModel(LEVELS, '', readBuildingSubstrate(store));

        const flat = new Set(model.levels);
        const nested = model.buildings.flatMap((b) => b.levels);
        expect(nested).toHaveLength(model.levels.length);
        for (const l of nested) expect(flat.has(l), 'a building holds a COPY, not the level itself').toBe(true);

        // …and every level appears under exactly one building.
        expect(new Set(nested).size).toBe(model.levels.length);
        // …and the per-building totals sum to the header total.
        expect(model.buildings.reduce((n, b) => n + b.listed, 0)).toBe(model.listedTotal);
    });
});
