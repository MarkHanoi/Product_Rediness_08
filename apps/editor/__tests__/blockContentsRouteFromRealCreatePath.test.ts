/**
 * @vitest-environment happy-dom
 */
// ADR-0385 §4 — THE CONTENTS JOIN, MEASURED FROM THE REAL CREATE PATH TO THE FILE.
//
// ADR-0385 §4 · ADR-0383 D1 / D3 · ADR-0328 · C114 §6a · C16 CA-2 · C84 EI-9 ·
// [[committed-is-not-reachable]] · [[fake-more-capable-than-real]].
//
// ══════════════════════════════════════════════════════════════════════════════════
// ⭐ WHAT THIS FILE ESTABLISHES THAT THE TWO UNIT-SHAPED SUITES CANNOT
// ══════════════════════════════════════════════════════════════════════════════════
// `packages/core-app-model/src/hierarchy/BuildingResolver.contents.test.ts` proves
// the resolver's rule over hand-built envelope literals; `packages/file-format/
// __tests__/block-contents-route-into-their-building.test.ts` proves the writers put
// a routed element in the right storey, over hand-built elements. Neither proves
// that the founder's GESTURE — draw blocks, put a wall in one — produces records the
// join can read. [[committed-is-not-reachable]]: four fixes in one session ran nowhere.
//
// So this file:
//   1. obtains a runtime the ONE way production does — `composeRuntime()` (P1);
//   2. authors TWO blocks on a SHARED storey ladder through the REAL create verb,
//      `spaceEnvelope.batch.create`, and lets the REAL subscription
//      (`attachMassingGroupHierarchy`) project them into the hierarchy store;
//   3. authors walls through the REAL `wall.create` verb — one inside each block, one
//      in the street between them;
//   4. reads the walls back out of the composed store through the REAL `WallReader`
//      (parametric geometry, no scene), the envelopes through the REAL L7 lookup
//      (`liveEnvelopeRecords`, the same function the PRYZM tree calls), and runs the
//      REAL `applyBuildingContainment` and the REAL writers;
//   5. asserts, in the STEP text, that each wall's `IfcRelContainedInSpatialStructure`
//      names ITS block's storey — computed from the identity formulas, not read back.
//
// ⚠ STUB LEDGER. The runtime, bus, envelope store, wall store, projection, resolver,
// containment join, wall reader and IFC writers are all production code. TWO
// substitutions, both declared: the hierarchy store is a FRESH `HierarchyStore`
// injected into the projection (the same class the singleton is an instance of; keeps
// this file from leaking projected rows into every other suite), and the wall reader
// is handed a `ReaderContext` that finds no scene mesh, so it takes its own parametric
// path — the path `ExportIFC.ts` itself falls back to when no scene is available.

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import * as WEBIFC from 'web-ifc';
import { composeRuntime } from '@pryzm/runtime-composer';
import { createId } from '@pryzm/schemas';
import { globalIdFromStableKey } from '@pryzm/schemas/ifc';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';
import {
    HierarchyStore,
    readBuildingSubstrate,
    projectedBuildingId,
    DEFAULT_BUILDING_ID,
    DEFAULT_BUILDING_NAME,
} from '@pryzm/core-app-model';
import {
    attachMassingGroupHierarchy,
    type DirtyEnvelopeStore,
} from '../src/engine/attachMassingGroupHierarchy';
import { liveEnvelopeRecords } from '../src/engine/liveBuildingSubstrate';
// The exporter's own modules, by path: `@pryzm/file-format` is not a dependency of
// this app, and adding one for a test would be the wrong direction (L7 -> L4 is fine
// in principle, but the app reaches the exporter through `ExportIFC.ts` today).
import { applyBuildingContainment } from '../../../packages/file-format/src/export/ifc/buildingContainment';
import { WallReader } from '../../../packages/file-format/src/export/ifc/readers/WallReader';
import type { ReaderContext } from '../../../packages/file-format/src/export/ifc/readers/ReaderContext';
import { IfcSpatialStructure } from '../../../packages/file-format/src/export/ifc/IfcSpatialStructure';
import { IfcGeometryWriter } from '../../../packages/file-format/src/export/ifc/IfcGeometryWriter';
import { IfcPropertyWriter } from '../../../packages/file-format/src/export/ifc/IfcPropertyWriter';
import { IfcModelBuilder } from '../../../packages/file-format/src/export/ifc/IfcModelBuilder';
import {
    ExportDiagnostics, storeySlot, storeyKey, elementKey,
} from '../../../packages/file-format/src/export/ifc/ifcIdentity';
import type { IntermediateModel } from '../../../packages/file-format/src/export/ifc/IntermediateModel';

const AUDIT = { actorId: 'block-contents', projectId: 'block-contents', clientId: 'node' } as const;
const BUDGET = 600_000;
const LEVELS = ['L1', 'L2'] as const;

/* eslint-disable @typescript-eslint/no-explicit-any */
let rt: any;
let hs: HierarchyStore;
let detach: (() => void) | null = null;
let priorRuntime: unknown;
let api: WEBIFC.IfcAPI;
const openModels: number[] = [];

beforeAll(async () => {
    rt = await composeRuntime({
        audit: AUDIT,
        canvas: null,
        bootstrapFn: bootstrapWithEverything as never,
    });
    priorRuntime = (window as unknown as { runtime?: unknown }).runtime;
    (window as unknown as { runtime: unknown }).runtime = rt;
    api = new WEBIFC.IfcAPI();
    await api.Init();
}, BUDGET);

afterAll(() => {
    try { detach?.(); } catch { /* non-fatal */ }
    while (openModels.length) {
        try { api.CloseModel(openModels.pop()!); } catch { /* already closed */ }
    }
    (window as unknown as { runtime?: unknown }).runtime = priorRuntime;
    try { rt?.tearDown?.(); } catch { /* non-fatal */ }
});

// Real prefixed ULIDs — `defineElement('spaceEnvelope')` enforces the shape.
const ULID_STEM = '01ARZ3NDEKTSV4RRFFQ69G5F';
function ulidN(n: number): string {
    const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    return `spaceEnvelope_${ULID_STEM}${A[Math.floor(n / 32) % 32]}${A[n % 32]}`;
}

/** ⛔ Read off `rt`, NEVER constructed — a store this file built could falsify nothing. */
function envelopeStore(): DirtyEnvelopeStore {
    const s = (rt.stores as Record<string, unknown>)['spaceEnvelope'];
    if (s === undefined) throw new Error('[test] runtime.stores.spaceEnvelope is undefined on the REAL composed runtime');
    return s as DirtyEnvelopeStore;
}
function wallStore(): { getState(): ReadonlyMap<string, unknown> } {
    const s = (rt.stores as Record<string, unknown>)['wall'];
    if (s === undefined) throw new Error('[test] runtime.stores.wall is undefined on the REAL composed runtime');
    return s as { getState(): ReadonlyMap<string, unknown> };
}

/** A 6 × 6 m square at (x0, 0), OPEN. */
function square(x0: number) {
    return [
        { x: x0, y: 0, z: 0 }, { x: x0 + 6, y: 0, z: 0 }, { x: x0 + 6, y: 0, z: 6 }, { x: x0, y: 0, z: 6 },
    ];
}

/** Two blocks, two storeys each, on the SAME project storeys — `masterPlanAuthoringPlan`'s shape. */
const BLOCKS = [
    { gid: 'mg-a', label: 'Block A', x: 0 },
    { gid: 'mg-b', label: 'Block B', x: 20 },
] as const;
const A = projectedBuildingId('mg-a');
const B = projectedBuildingId('mg-b');

function twoBlockBatch() {
    const envelopes: Record<string, unknown>[] = [];
    let n = 0;
    for (const b of BLOCKS) {
        for (const [i, levelId] of LEVELS.entries()) {
            envelopes.push({
                spaceEnvelopeId: ulidN(n++),
                levelId, footprint: square(b.x), baseOffset: i * 3, height: 3,
                role: 'level', group: { id: b.gid, label: b.label },
            });
        }
    }
    return { envelopes };
}

function wipe(): void {
    for (const store of [envelopeStore(), wallStore()]) {
        const s = store as unknown as { getState(): ReadonlyMap<string, unknown>; applyPatch(p: unknown[]): unknown };
        const ids = [...s.getState().keys()];
        if (ids.length > 0) s.applyPatch(ids.map((id) => ({ op: 'remove', path: [id] })));
    }
}

/** The reader context `ExportIFC.ts` degrades to when no scene is available: parametric geometry. */
const NO_SCENE: ReaderContext = {
    findMesh: () => null,
    extractGeometry: () => null,
    extractColor: () => null,
};

/** Drive the REAL writers; return which storey each element is contained in. */
function emit(m: IntermediateModel, diagnostics: ExportDiagnostics) {
    const modelID = api.CreateModel({ schema: 'IFC4' });
    openModels.push(modelID);
    const spatial = new IfcSpatialStructure(api, modelID);
    const refs = spatial.create(m);
    const builder = new IfcModelBuilder(
        api, modelID,
        new IfcGeometryWriter(api, modelID, refs.contextRef),
        new IfcPropertyWriter(api, modelID, refs.ownerHistoryRef),
        refs, diagnostics,
    );
    builder.createElements(m.elements);
    spatial.finaliseBuildingAggregation(refs);
    const step = new TextDecoder().decode(api.SaveModel(modelID));
    const storeyOf = new Map<string, { guid: string; name: string }>();
    const relIds = api.GetLineIDsWithType(modelID, WEBIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE);
    for (let i = 0; i < relIds.size(); i++) {
        const rel = api.GetLine(modelID, relIds.get(i)) as {
            RelatingStructure?: { value: number }; RelatedElements?: { value: number }[];
        };
        const storey = api.GetLine(modelID, rel.RelatingStructure!.value) as {
            GlobalId: { value: string }; Name?: { value: string };
        };
        for (const e of rel.RelatedElements ?? []) {
            const el = api.GetLine(modelID, e.value) as { GlobalId: { value: string } };
            storeyOf.set(el.GlobalId.value, { guid: storey.GlobalId.value, name: storey.Name?.value ?? '' });
        }
    }
    return { step, storeyOf };
}

const storeyGuid = (buildingId: string, levelId: string) =>
    globalIdFromStableKey(storeyKey(storeySlot(buildingId, levelId)));
const elementGuid = (id: string) => globalIdFromStableKey(elementKey(id));

// ═════════════════════════════════════════════════════════════════════════════════
// THE MEASUREMENT
// ═════════════════════════════════════════════════════════════════════════════════

describe('ADR-0385 §4 — a wall created inside a block\'s envelope exports into THAT block\'s IfcBuilding', () => {
    it('create-in-envelope -> export: each wall is contained in its own block\'s storey; the street wall is UNASSIGNED', async () => {
        hs = new HierarchyStore();
        detach = attachMassingGroupHierarchy(envelopeStore(), { store: hs });
        wipe();
        expect(hs.getAll()).toEqual([]);

        // ── THE GESTURE, half one: two blocks on the shared ladder, ONE dispatch.
        await rt.bus.executeCommand('spaceEnvelope.batch.create', twoBlockBatch());
        expect(envelopeStore().getState().size).toBe(4);
        expect(hs.getBuildings().map((b) => b.name)).toEqual(['Block A', 'Block B']);

        // ── THE GESTURE, half two: walls, through the real verb. A 4 m wall inside
        // each block on L1, one on L2 in Block B, and one in the street between them.
        const wallA = createId('wall');
        const wallB = createId('wall');
        const wallB2 = createId('wall');
        const wallStreet = createId('wall');
        const line = (x0: number, x1: number, z: number) => [{ x: x0, y: 0, z }, { x: x1, y: 0, z }];
        await rt.bus.executeCommand('wall.create', { id: wallA, levelId: 'L1', baseLine: line(1, 5, 3) });
        await rt.bus.executeCommand('wall.create', { id: wallB, levelId: 'L1', baseLine: line(21, 25, 3) });
        await rt.bus.executeCommand('wall.create', { id: wallB2, levelId: 'L2', baseLine: line(21, 25, 3) });
        await rt.bus.executeCommand('wall.create', { id: wallStreet, levelId: 'L1', baseLine: line(10, 14, 3) });
        expect(wallStore().getState().size).toBe(4);

        // ── THE READ, exactly as the exporter and the tree perform it.
        const live = liveEnvelopeRecords();
        expect(live, 'the L7 lookup must reach the REAL composed envelope store').not.toBeNull();
        expect([...(live as Iterable<unknown>)]).toHaveLength(4);
        const substrate = readBuildingSubstrate(hs, live);
        expect(substrate.envelopes).toHaveLength(4);

        const walls = [...wallStore().getState().values()];
        const elements = new WallReader({ getAll: () => walls } as never, NO_SCENE).read();
        expect(elements.map((e) => e.id).sort()).toEqual([wallA, wallB, wallB2, wallStreet].sort());

        const model: IntermediateModel = {
            project: { id: 'project-1', name: 'Master Plan' },
            site: { id: 'site-1', name: 'Site' },
            buildings: [{ id: DEFAULT_BUILDING_ID, name: DEFAULT_BUILDING_NAME }],
            levels: LEVELS.map((id, i) => ({ id, name: `Level ${i + 1}`, elevation: i * 3, height: 3 })),
            elements,
        };
        const diagnostics = new ExportDiagnostics();
        const report = applyBuildingContainment(model, diagnostics, substrate);

        // ── THE JOIN, in the model. Before this lane every one of these was `undefined`
        // and every wall fell into UNASSIGNED — N containers, nothing inside (§4).
        expect(report.buildingCount).toBe(2);
        expect(report.fannedLevelIds).toEqual(['L1', 'L2']);
        expect(report.routedElements).toBe(3);
        expect(report.unroutedElements.map((u) => u.elementId)).toEqual([wallStreet]);
        expect(report.unroutedElements[0]!.why).toContain('stands in NONE');
        const by = (id: string) => model.elements.find((e) => e.id === id)!;
        expect(by(wallA).buildingId).toBe(A);
        expect(by(wallB).buildingId).toBe(B);
        expect(by(wallB2).buildingId).toBe(B);
        expect(by(wallStreet).buildingId).toBeUndefined();

        // ── THE JOIN, in the FILE, against the identity formulas.
        const { step, storeyOf } = emit(model, diagnostics);
        expect((step.match(/=\s*IFCBUILDING\(/g) ?? []).length).toBe(2);
        expect(storeyOf.get(elementGuid(wallA))!.guid).toBe(storeyGuid(A, 'L1'));
        expect(storeyOf.get(elementGuid(wallB))!.guid).toBe(storeyGuid(B, 'L1'));
        expect(storeyOf.get(elementGuid(wallB2))!.guid).toBe(storeyGuid(B, 'L2'));
        expect(storeyOf.get(elementGuid(wallStreet))!.name).toContain('UNASSIGNED');
        expect(diagnostics.count('UNRESOLVED_LEVEL')).toBe(1);
        expect(diagnostics.all().some((d) => d.code === 'UNRESOLVED_BUILDING' && d.elementId === wallStreet)).toBe(true);
    }, BUDGET);

    it('the legacy shape — walls with NO massing groups — still exports ONE building with the pre-ADR-0385 storey keys', async () => {
        hs = new HierarchyStore();
        detach?.();
        detach = attachMassingGroupHierarchy(envelopeStore(), { store: hs });
        wipe();

        const wall1 = createId('wall');
        await rt.bus.executeCommand('wall.create', { id: wall1, levelId: 'L1', baseLine: [{ x: 1, y: 0, z: 3 }, { x: 5, y: 0, z: 3 }] });
        const substrate = readBuildingSubstrate(hs, liveEnvelopeRecords());
        expect(substrate.envelopes).toEqual([]);           // read, and empty — not null

        const elements = new WallReader({ getAll: () => [...wallStore().getState().values()] } as never, NO_SCENE).read();
        const model: IntermediateModel = {
            project: { id: 'project-1', name: 'Legacy' },
            site: { id: 'site-1', name: 'Site' },
            buildings: [{ id: DEFAULT_BUILDING_ID, name: DEFAULT_BUILDING_NAME }],
            levels: [{ id: 'L1', name: 'Level 1', elevation: 0, height: 3 }],
            elements,
        };
        const diagnostics = new ExportDiagnostics();
        const report = applyBuildingContainment(model, diagnostics, substrate);
        expect(report.buildingCount).toBe(1);
        expect(report.routedElements).toBe(0);
        expect(model.elements[0]!.buildingId).toBeUndefined();
        const { step, storeyOf } = emit(model, diagnostics);
        expect(storeyOf.get(elementGuid(wall1))!.guid).toBe(globalIdFromStableKey('storey:L1'));
        expect(step).toContain(globalIdFromStableKey('relcontained:L1'));
        expect(diagnostics.all()).toEqual([]);
    }, BUDGET);
});
