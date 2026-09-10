/**
 * ADR-0385 §4 — THE CONTENTS ARM: elements authored inside a block's envelope land
 * in THAT block's `IfcBuilding`, measured in the file.
 *
 * ⭐ WHY THIS FILE EXISTS WHEN `massing-group-emits-n-buildings.test.ts` IS GREEN
 *
 * That suite proves N massing groups emit N `IfcBuilding` with the right storeys.
 * It has NO elements in its model — and until this lane, an element on any of
 * those storeys resolved `unknown` (every block sits on the project's one storey
 * ladder, so every level fans) and fell into UNASSIGNED. ADR-0385 §4 named that
 * before it was built: N correct containers with nothing inside them.
 *
 * This file measures the join that closes it, at the layer a consumer reads:
 *
 *     grouped envelopes WITH FOOTPRINTS
 *       -> applyMassingGroupProjection     (store rows, the AUTHORITY)
 *       -> readBuildingSubstrate(store, envelopes)   (ONE read of both)
 *       -> applyBuildingContainment         (plan sample from world-space geometry
 *                                            -> resolveElementBuilding)
 *       -> IfcSpatialStructure / IfcModelBuilder     (the real writers)
 *       -> IFCRELCONTAINEDINSPATIALSTRUCTURE          (which storey holds the wall)
 *
 * ⛔ THE ASSERTIONS ARE COMPUTED FROM THE IDENTITY FORMULAS, NOT READ BACK. The
 * storey a wall must land in is `globalIdFromStableKey(storeyKey(storeySlot(B, 'L1')))`,
 * where B is `projectedBuildingId('g-b')` — so the arm cannot pass by agreeing with
 * whatever the writer happened to emit.
 *
 * ⚠ THE STUB LEDGER. `web-ifc`, the spatial writer, the model builder, the
 * projection, the resolver and the containment join are all production code. The
 * hierarchy store is a fresh injected `HierarchyStore` (never the singleton). The
 * envelope records are LITERALS in the shape the store holds, because this package
 * is L4 and may not import the L6 plugin; the REAL create path — `spaceEnvelope
 * .batch.create` and `wall.create` on a composed runtime — is measured in
 * `apps/editor/__tests__/blockContentsRouteFromRealCreatePath.test.ts`, which meets
 * this file on `readBuildingSubstrate` + `applyBuildingContainment`.
 */

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import * as WEBIFC from 'web-ifc';

// L-8521 — `debug()` reads `window.__PRYZM_SHOW_DEBUG_OVERLAY` unguarded.
vi.stubGlobal('window', (globalThis as { window?: unknown }).window ?? {});

import { IfcSpatialStructure } from '../src/export/ifc/IfcSpatialStructure';
import { IfcGeometryWriter } from '../src/export/ifc/IfcGeometryWriter';
import { IfcPropertyWriter } from '../src/export/ifc/IfcPropertyWriter';
import { IfcModelBuilder } from '../src/export/ifc/IfcModelBuilder';
import {
    ExportDiagnostics, DEFAULT_BUILDING_ID, storeySlot, storeyKey, elementKey,
    relContainedKey, buildingKey, siteKey, projectKey, UNASSIGNED_LEVEL_ID,
} from '../src/export/ifc/ifcIdentity';
import { applyBuildingContainment, elementPlanSample } from '../src/export/ifc/buildingContainment';
import type { IntermediateModel, ExportElement, ExportLevel } from '../src/export/ifc/IntermediateModel';
import { globalIdFromStableKey } from '@pryzm/schemas/ifc';
import {
    HierarchyStore,
    readBuildingSubstrate,
    applyMassingGroupProjection,
    readMassingGroupSubstrate,
    projectedBuildingId,
} from '@pryzm/core-app-model';

// ── the harness ─────────────────────────────────────────────────────────────

let api: WEBIFC.IfcAPI;
const openModels: number[] = [];

beforeAll(async () => {
    api = new WEBIFC.IfcAPI();
    await api.Init();
}, 60_000);

afterEach(() => {
    while (openModels.length) {
        try { api.CloseModel(openModels.pop()!); } catch { /* already closed */ }
    }
});

/** Drive the REAL writers; return the STEP text and the storey each element sits in. */
function emit(m: IntermediateModel, diagnostics = new ExportDiagnostics()) {
    const modelID = api.CreateModel({ schema: 'IFC4' });
    openModels.push(modelID);
    const spatial = new IfcSpatialStructure(api, modelID);
    const refs = spatial.create(m);
    const geometryWriter = new IfcGeometryWriter(api, modelID, refs.contextRef);
    const propertyWriter = new IfcPropertyWriter(api, modelID, refs.ownerHistoryRef);
    const builder = new IfcModelBuilder(api, modelID, geometryWriter, propertyWriter, refs, diagnostics);
    builder.createElements(m.elements);
    spatial.finaliseBuildingAggregation(refs);
    const step = new TextDecoder().decode(api.SaveModel(modelID));

    // element GlobalId -> { storeyGuid, storeyName } via IfcRelContainedInSpatialStructure.
    const storeyOf = new Map<string, { guid: string; name: string }>();
    const relIds = api.GetLineIDsWithType(modelID, WEBIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE);
    for (let i = 0; i < relIds.size(); i++) {
        const rel = api.GetLine(modelID, relIds.get(i)) as {
            RelatingStructure?: { value: number };
            RelatedElements?: { value: number }[];
        };
        const storey = api.GetLine(modelID, rel.RelatingStructure!.value) as {
            GlobalId: { value: string }; Name?: { value: string };
        };
        for (const e of rel.RelatedElements ?? []) {
            const el = api.GetLine(modelID, e.value) as { GlobalId: { value: string } };
            storeyOf.set(el.GlobalId.value, { guid: storey.GlobalId.value, name: storey.Name?.value ?? '' });
        }
    }
    return { step, storeyOf, diagnostics };
}

const countOf = (step: string, entity: string) =>
    (step.match(new RegExp(`=\\s*${entity}\\(`, 'g')) ?? []).length;

/** An axis-aligned box in WORLD metres — the frame `FragmentReader.extractGeometry` bakes. */
function box(x0: number, z0: number, x1: number, z1: number, y0 = 0, h = 3): ExportElement['geometry'] {
    const v = [
        x0, y0, z0,  x1, y0, z0,  x1, y0 + h, z0,  x0, y0 + h, z0,
        x0, y0, z1,  x1, y0, z1,  x1, y0 + h, z1,  x0, y0 + h, z1,
    ];
    const idx = [
        0, 1, 2, 0, 2, 3,  5, 4, 7, 5, 7, 6,  4, 0, 3, 4, 3, 7,
        1, 5, 6, 1, 6, 2,  3, 2, 6, 3, 6, 7,  4, 5, 1, 4, 1, 0,
    ];
    return { vertices: new Float32Array(v), indices: new Uint32Array(idx) };
}

/** A wall whose plan is the segment (x0,z0)→(x1,z0), 0.3 m thick. */
function wall(id: string, levelId: string, x0: number, x1: number, z: number): ExportElement {
    return {
        id, ifcClass: 'IfcWall', name: id, levelId,
        geometry: box(x0, z - 0.15, x1, z + 0.15),
        position: { x: x0, y: 0, z }, rotation: { x: 0, y: 0, z: 0 }, propertySets: [],
    };
}

const levels = (ids: readonly string[]): ExportLevel[] =>
    ids.map((id, i) => ({ id, name: `Level ${i + 1}`, elevation: i * 3, height: 3 }));

function model(elements: ExportElement[], levelIds: readonly string[]): IntermediateModel {
    return {
        project: { id: 'project-1', name: 'Master Plan' },
        site: { id: 'site-1', name: 'Site' },
        buildings: [{ id: DEFAULT_BUILDING_ID, name: 'Default Building' }],
        levels: levels(levelIds),
        elements,
    };
}

/** A 6 × 6 square at x0, OPEN, `y` carried as the schema requires. */
const square = (x0: number) => [
    { x: x0, y: 0, z: 0 }, { x: x0 + 6, y: 0, z: 0 }, { x: x0 + 6, y: 0, z: 6 }, { x: x0, y: 0, z: 6 },
];
const env = (id: string, levelId: string, group: { id: string; label: string } | null, x0: number) =>
    ({ id, levelId, role: 'level', group, footprint: square(x0) });

const A = projectedBuildingId('g-a');
const B = projectedBuildingId('g-b');

/** Block A at x∈[0,6] and Block B at x∈[20,26], BOTH on L1 and L2 — the founder's shape. */
const twoBlocksSharingTheLadder = () => [
    env('eA1', 'L1', { id: 'g-a', label: 'Block A' }, 0),
    env('eB1', 'L1', { id: 'g-b', label: 'Block B' }, 20),
    env('eA2', 'L2', { id: 'g-a', label: 'Block A' }, 0),
    env('eB2', 'L2', { id: 'g-b', label: 'Block B' }, 20),
];

function substrateFor(envelopes: ReturnType<typeof env>[], envelopesForRead: Iterable<unknown> | null | undefined = envelopes) {
    const store = new HierarchyStore();
    const p = applyMassingGroupProjection(store, readMassingGroupSubstrate(envelopes));
    if (!p.ok) throw new Error(`projection refused: ${p.refusal}`);
    return readBuildingSubstrate(store, envelopesForRead);
}

const storeyGuid = (buildingId: string, levelId: string) =>
    globalIdFromStableKey(storeyKey(storeySlot(buildingId, levelId)));
const elementGuid = (id: string) => globalIdFromStableKey(elementKey(id));

// ═════════════════════════════════════════════════════════════════════════════
// ⭐ THE FOUNDER'S ASK, THE OTHER HALF: contents, measured in the file
// ═════════════════════════════════════════════════════════════════════════════

describe('ADR-0385 §4 — an element inside a block\'s envelope exports INTO that block\'s IfcBuilding', () => {
    it('⭐⭐ two blocks on a shared ladder: each wall lands in ITS block\'s storey; the street wall is UNASSIGNED and named', () => {
        const m = model([
            wall('wall_a', 'L1', 1, 5, 3),      // inside Block A
            wall('wall_b', 'L1', 21, 25, 3),    // inside Block B
            wall('wall_b2', 'L2', 21, 25, 3),   // inside Block B, upper storey
            wall('wall_street', 'L1', 10, 14, 3), // between the blocks
        ], ['L1', 'L2']);
        const diagnostics = new ExportDiagnostics();
        const report = applyBuildingContainment(m, diagnostics, substrateFor(twoBlocksSharingTheLadder()));

        // The join, in the model.
        expect(report.buildingCount).toBe(2);
        expect(report.fannedLevelIds).toEqual(['L1', 'L2']);
        expect(report.routedElements).toBe(3);
        expect(report.unroutedElements.map((u) => u.elementId)).toEqual(['wall_street']);
        expect(report.unroutedElements[0]!.why).toContain('stands in NONE');
        expect(m.elements.find((e) => e.id === 'wall_a')!.buildingId).toBe(A);
        expect(m.elements.find((e) => e.id === 'wall_b')!.buildingId).toBe(B);
        expect(m.elements.find((e) => e.id === 'wall_b2')!.buildingId).toBe(B);
        expect(m.elements.find((e) => e.id === 'wall_street')!.buildingId).toBeUndefined();

        // The join, in the FILE — against the identity formulas, not the writer's output.
        const { step, storeyOf } = emit(m, diagnostics);
        expect(countOf(step, 'IFCBUILDING')).toBe(2);
        expect(storeyOf.get(elementGuid('wall_a'))!.guid).toBe(storeyGuid(A, 'L1'));
        expect(storeyOf.get(elementGuid('wall_b'))!.guid).toBe(storeyGuid(B, 'L1'));
        expect(storeyOf.get(elementGuid('wall_b2'))!.guid).toBe(storeyGuid(B, 'L2'));
        // ⛔ Not guessed into either block: the explicit UNASSIGNED storey, loudly.
        expect(storeyOf.get(elementGuid('wall_street'))!.name).toContain('UNASSIGNED');
        expect(diagnostics.count('UNRESOLVED_LEVEL')).toBe(1);
        expect(diagnostics.all().some((d) => d.code === 'UNRESOLVED_BUILDING' && d.elementId === 'wall_street')).toBe(true);
        // …and the level diagnostic reports the arithmetic rather than "carry no building axis".
        const l1 = diagnostics.all().find((d) => d.code === 'UNRESOLVED_BUILDING' && d.message.includes('"L1"') && !d.elementId);
        expect(l1!.message).toContain('2 routed, 1 could not be');
    });

    it('⛔ a wall standing in TWO overlapping blocks is not routed — a party wall belongs to neither alone', () => {
        const overlapping = [...twoBlocksSharingTheLadder(), env('eC1', 'L1', { id: 'g-c', label: 'Block C' }, 22)];
        const m = model([wall('wall_shared', 'L1', 22.5, 24, 3)], ['L1']);
        const diagnostics = new ExportDiagnostics();
        const report = applyBuildingContainment(m, diagnostics, substrateFor(overlapping));
        expect(report.unroutedElements[0]!.why).toContain('overlapping massing');
        expect(m.elements[0]!.buildingId).toBeUndefined();
        const { storeyOf } = emit(m, diagnostics);
        expect(storeyOf.get(elementGuid('wall_shared'))!.name).toContain('UNASSIGNED');
    });

    it('⛔ envelope geometry NOT SUPPLIED vs UNREADABLE: same UNASSIGNED placement, DIFFERENT stated reasons', () => {
        // §CONTEXT-DATA-HONESTY: the file looks the same in both cases — it must — and
        // the report is the only thing that tells a missing wire from a broken store.
        const notSupplied = applyBuildingContainment(
            model([wall('wall_b', 'L1', 21, 25, 3)], ['L1']), undefined,
            substrateFor(twoBlocksSharingTheLadder(), undefined),
        );
        const unreadable = applyBuildingContainment(
            model([wall('wall_b', 'L1', 21, 25, 3)], ['L1']), undefined,
            substrateFor(twoBlocksSharingTheLadder(), null),
        );
        expect(notSupplied.routedElements).toBe(0);
        expect(unreadable.routedElements).toBe(0);
        expect(notSupplied.unroutedElements[0]!.why).toContain('not supplied');
        expect(unreadable.unroutedElements[0]!.why).toContain('could not be read');
        expect(notSupplied.unroutedElements[0]!.why).not.toBe(unreadable.unroutedElements[0]!.why);
    });

    it('a storey with ONE owner routes by the store alone — the plan sample is not consulted', () => {
        const disjoint = [
            env('eA1', 'L1', { id: 'g-a', label: 'Block A' }, 0),
            env('eB2', 'L2', { id: 'g-b', label: 'Block B' }, 20),
        ];
        // wall_far is on L2 (Block B's alone) but stands where Block A would be.
        const m = model([wall('wall_far', 'L2', 1, 5, 3)], ['L1', 'L2']);
        const report = applyBuildingContainment(m, undefined, substrateFor(disjoint));
        expect(report.fannedLevelIds).toEqual([]);
        expect(report.routedElements).toBe(0);               // routed by the STORE, not by geometry
        expect(m.elements[0]!.buildingId).toBe(B);
        expect(emit(m).storeyOf.get(elementGuid('wall_far'))!.guid).toBe(storeyGuid(B, 'L2'));
    });

    it('the plan sample is the world-space bbox centre, with the placement as the fallback', () => {
        const w = wall('w', 'L1', 21, 25, 3);
        expect(elementPlanSample(w)).toEqual({ x: 23, z: 3 });
        expect(elementPlanSample({ ...w, geometry: { vertices: new Float32Array(0), indices: new Uint32Array(0) } }))
            .toEqual({ x: 21, z: 3 });
        expect(elementPlanSample({ ...w, geometry: { vertices: new Float32Array(0), indices: new Uint32Array(0) }, position: { x: NaN, y: 0, z: 0 } }))
            .toBeNull();
    });

    it('is IDEMPOTENT — routing is re-derived from geometry every call, never accumulated', () => {
        const sub = substrateFor(twoBlocksSharingTheLadder());
        const m = model([wall('wall_b', 'L1', 21, 25, 3), wall('wall_street', 'L1', 10, 14, 3)], ['L1']);
        applyBuildingContainment(m, undefined, sub);
        const first = JSON.stringify(m.elements.map((e) => [e.id, e.buildingId]));
        applyBuildingContainment(m, undefined, sub);
        applyBuildingContainment(m, undefined, sub);
        expect(JSON.stringify(m.elements.map((e) => [e.id, e.buildingId]))).toBe(first);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// ⛔ THE BACK-COMPATIBILITY PIN — a legacy single-building project round-trips
// with IDENTICAL GlobalIds (L-8501), with the join installed and running
// ═════════════════════════════════════════════════════════════════════════════

describe('ADR-0385 §4 — a legacy single-building project is byte-identical with the contents join installed', () => {
    /** Every project authored before ADR-0383: ungrouped envelopes, walls on the ladder. */
    const legacy = () => model([
        wall('wall_1', 'L1', 1, 5, 3),
        wall('wall_2', 'L2', 1, 5, 3),
        { ...wall('room_1', 'L1', 0, 6, 3), id: 'room_1', ifcClass: 'IfcSpace', name: 'room_1' },
    ], ['L1', 'L2']);
    const ungrouped = () => [env('e1', 'L1', null, 0), env('e2', 'L2', null, 0)];

    it('⛔⛔ every spatial, element and relationship GlobalId equals the PRE-ADR-0385 formula, computed independently', () => {
        const m = legacy();
        const report = applyBuildingContainment(m, undefined, substrateFor(ungrouped()));
        expect(report.buildingCount).toBe(1);
        expect(report.routedElements).toBe(0);
        expect(report.unroutedElements).toEqual([]);
        expect(m.elements.every((e) => e.buildingId === undefined)).toBe(true);
        const { step } = emit(m);

        // The OLD formulas, with no building anywhere in them (the slot degenerates
        // to the bare levelId for the default building). Recomputed here rather than
        // copied from a previous run, so the arm cannot rot into a tautology.
        for (const key of [
            projectKey('project-1'), siteKey('site-1'), buildingKey(DEFAULT_BUILDING_ID),
            'storey:L1', 'storey:L2', 'relcontained:L1', 'relcontained:L2',
            elementKey('wall_1'), elementKey('wall_2'), elementKey('room_1'),
        ]) {
            expect(step, `GlobalId for ${key} churned`).toContain(globalIdFromStableKey(key));
        }
        expect(storeySlot(DEFAULT_BUILDING_ID, 'L1')).toBe('L1');
        expect(relContainedKey(storeySlot(DEFAULT_BUILDING_ID, 'L1'))).toBe('relcontained:L1');
        expect(countOf(step, 'IFCBUILDING')).toBe(1);
        expect(countOf(step, 'IFCBUILDINGSTOREY')).toBe(2);
        expect(countOf(step, 'IFCRELAGGREGATES')).toBe(4); // project->site, site->building, building->storeys… and the storey->spaces aggregate
        expect(step).not.toContain(UNASSIGNED_LEVEL_ID);
    });

    it('two exports of the same legacy model produce the identical GlobalId set, envelopes supplied or not', () => {
        const ids = (s: string) => [...s.matchAll(/=\s*IFC\w+\(\s*'([^']{22})'/g)].map((x) => x[1]).sort();
        const withEnvelopes = emit((() => { const m = legacy(); applyBuildingContainment(m, undefined, substrateFor(ungrouped())); return m; })()).step;
        const withoutEnvelopes = emit((() => { const m = legacy(); applyBuildingContainment(m, undefined, substrateFor(ungrouped(), undefined)); return m; })()).step;
        const emptyStore = emit((() => { const m = legacy(); applyBuildingContainment(m, undefined, readBuildingSubstrate(new HierarchyStore())); return m; })()).step;
        expect(ids(withEnvelopes).length).toBeGreaterThan(8);
        expect(ids(withoutEnvelopes)).toEqual(ids(withEnvelopes));
        expect(ids(emptyStore)).toEqual(ids(withEnvelopes));
    });
});
