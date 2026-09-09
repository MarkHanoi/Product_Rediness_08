/**
 * ADR-0385 — the branches of the ONE building resolver that its three CONSUMERS
 * cannot reach.
 *
 * The resolver is already exercised end-to-end from three directions:
 *   `packages/file-format/__tests__/ifc-export-file-validity.test.ts` (the exporter),
 *   `apps/editor/src/ui/__tests__/inspectProjectTreeBuildings.spec.ts` (the PRYZM tree),
 *   `plugins/ifc-inspector/__tests__/tree-building-rung.test.ts` (the IFC tree).
 *
 * ⛔ So this file deliberately does NOT restate those arms. A fourth copy of
 * "two buildings split the levels" would add confidence in nothing and would be
 * [[same-rule-two-implementations]] applied to tests. What it covers is the set of
 * branches NO consumer can drive from outside:
 *
 *   1. `readBuildingSubstrate()` when the store THROWS. Every consumer passes an
 *      already-built substrate or a healthy store, so the catch is unreachable
 *      from them — and it is the branch where a FAILURE most easily becomes an
 *      EMPTINESS (§CONTEXT-DATA-HONESTY, L-581/L-616).
 *   2. `readBuildingSubstrate()` when the store returns a non-array.
 *   3. The `buildingId === null ⟺ kind === 'unknown'` invariant, stated as an
 *      invariant rather than checked case by case.
 *   4. `resolveElementBuilding`'s wrapper, which must not lose the `why`.
 */

import { describe, it, expect } from 'vitest';
import {
    readBuildingSubstrate,
    resolveLevelBuilding,
    resolveElementBuilding,
    buildBuildingRoster,
    UNREADABLE_SUBSTRATE,
    DEFAULT_BUILDING_ID,
    type BuildingSubstrate,
} from './BuildingResolver.js';
import { HierarchyStore } from './HierarchyStore.js';

/** A store that fails the way a real one fails: by throwing on read. */
const throwingStore = () => ({
    getBuildings() { throw new Error('boom'); },
    getLevels() { return []; },
}) as unknown as HierarchyStore;

/** A store that answers with the wrong SHAPE rather than an error. */
const lyingStore = () => ({
    getBuildings() { return undefined; },
    getLevels() { return []; },
}) as unknown as HierarchyStore;

describe('ADR-0385 — readBuildingSubstrate keeps FAILURE and EMPTINESS apart', () => {
    it('a healthy but EMPTY store reads as [] — an emptiness', () => {
        const s = readBuildingSubstrate(new HierarchyStore());
        expect(s.buildings).toEqual([]);
        expect(s.levels).toEqual([]);
        expect(s.note).toContain('0 building(s)');
    });

    it('⛔ a THROWING store reads as null — a failure, and it names the throw', () => {
        // If this ever returns [] the whole design collapses quietly: every element
        // would resolve `derived` into the default building and the export would
        // look perfect.
        const s = readBuildingSubstrate(throwingStore());
        expect(s.buildings).toBeNull();
        expect(s.levels).toBeNull();
        expect(s.note).toContain('threw');
        expect(s.note).toContain('boom');
    });

    it('⛔ a store answering with the wrong SHAPE is also a failure, not an empty project', () => {
        const s = readBuildingSubstrate(lyingStore());
        expect(s.buildings).toBeNull();
        expect(s.note).toContain('non-array');
    });

    it('the two are distinguishable by a consumer, which is the whole point', () => {
        const empty = readBuildingSubstrate(new HierarchyStore());
        const broken = readBuildingSubstrate(throwingStore());
        expect(resolveLevelBuilding('L1', empty).kind).toBe('derived');
        expect(resolveLevelBuilding('L1', broken).kind).toBe('unknown');
    });
});

describe('ADR-0385 — the resolver contract holds across every branch', () => {
    const store = new HierarchyStore();
    const node = (over: Record<string, unknown>) => ({
        plannedData: { customProperties: {} },
        syncState: 'no-template',
        metadata: { createdAt: 0, modifiedAt: 0, createdBy: 'spec', version: 1 },
        ...over,
    }) as never;
    store.add(node({ id: 'b-a', type: 'building', name: 'Block A', siteId: 's' }));
    store.add(node({ id: 'b-b', type: 'building', name: 'Block B', siteId: 's' }));
    store.add(node({ id: 'h1', type: 'level', name: 'A/L1', buildingId: 'b-a', bimLevelId: 'L1' }));
    store.add(node({ id: 'h2', type: 'level', name: 'ghost', buildingId: 'nope', bimLevelId: 'L2' }));
    store.add(node({ id: 'h3', type: 'level', name: 'A/L3', buildingId: 'b-a', bimLevelId: 'L3' }));
    store.add(node({ id: 'h4', type: 'level', name: 'B/L3', buildingId: 'b-b', bimLevelId: 'L3' }));
    const sub = readBuildingSubstrate(store);

    /** One case per branch the resolver can take. */
    const cases: [string, BuildingSubstrate, string | null | undefined, string][] = [
        ['carried',          sub,                  'L1',  'carried'],
        ['dangling',         sub,                  'L2',  'unknown'],
        ['ambiguous',        sub,                  'L3',  'unknown'],
        ['unclaimed level',  sub,                  'L9',  'derived'],
        ['no levelId',       sub,                  undefined, 'derived'],
        ['empty levelId',    sub,                  '',    'derived'],
        ['unreadable',       UNREADABLE_SUBSTRATE, 'L1',  'unknown'],
    ];

    it.each(cases)('%s resolves as %s', (_label, substrate, levelId, kind) => {
        expect(resolveLevelBuilding(levelId, substrate).kind).toBe(kind);
    });

    it('⛔ THE INVARIANT: buildingId is null if and only if kind is unknown', () => {
        // Stated once, over every branch, rather than re-asserted case by case —
        // so a NEW branch added later cannot quietly return `unknown` with an id,
        // or `derived` with none.
        for (const [label, substrate, levelId] of cases) {
            const r = resolveLevelBuilding(levelId, substrate);
            expect(r.buildingId === null, `${label}: buildingId`).toBe(r.kind === 'unknown');
            expect(r.name === null, `${label}: name`).toBe(r.kind === 'unknown');
            expect(r.why.length, `${label}: a bare kind is not an explanation`).toBeGreaterThan(0);
        }
    });

    it('the ambiguous case NAMES both candidates instead of picking one', () => {
        const r = resolveLevelBuilding('L3', sub);
        expect(r.candidateBuildingIds?.slice().sort()).toEqual(['b-a', 'b-b']);
    });

    it('resolveElementBuilding keeps the level reason AND names the element', () => {
        const level = resolveLevelBuilding('L2', sub);
        const element = resolveElementBuilding('wall_7', 'L2', sub);
        expect(element.kind).toBe(level.kind);
        expect(element.why).toContain('wall_7');
        expect(element.why).toContain(level.why);
    });

    it('a roster over NO levels is still one building — never an empty list', () => {
        // A caller must always have a building to write into; the honesty lives in
        // `unknown`, never in a missing entity.
        const roster = buildBuildingRoster([], sub);
        expect(roster.buildings).toHaveLength(1);
        expect(roster.buildings[0]!.id).toBe(DEFAULT_BUILDING_ID);
        expect(roster.buildings[0]!.levelIds).toEqual([]);
    });

    it('a building holding one carried level is carried, even beside a fallback one', () => {
        const roster = buildBuildingRoster(['L1', 'L9'], sub);
        expect(roster.buildings.map((b) => [b.id, b.kind])).toEqual([
            ['b-a', 'carried'],
            [DEFAULT_BUILDING_ID, 'derived'],
        ]);
        // Block B owns no level in this pass, so it is reported and not emitted.
        expect(roster.unusedBuildingIds).toEqual(['b-b']);
    });
});
