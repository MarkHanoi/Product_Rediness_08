/**
 * ADR-0385 §2 — THE END-TO-END ARM: massing groups in, N `IfcBuilding` out.
 *
 * ⭐ WHY THIS FILE EXISTS WHEN `ifc-export-file-validity.test.ts` IS ALREADY GREEN
 *
 * That suite proves the EXPORTER emits N buildings when it is HANDED an
 * `IntermediateModel` that already carries N (`multiBuildingModel`). It says nothing
 * about how a model comes to carry N, and until 2026-09-09 the answer was **it never
 * did** — `hierarchyStore` was the containment authority and nothing wrote it, so the
 * founder's three-block master plan produced one building with all the storeys in it.
 *
 * This file measures the WHOLE chain, at the layer the founder experiences:
 *
 *     space envelopes carrying `group`
 *       -> readMassingGroupSubstrate      (the massing-group read)
 *       -> applyMassingGroupProjection    (⭐ the edge that was missing)
 *       -> hierarchyStore                 (the containment AUTHORITY, ADR-0328)
 *       -> readBuildingSubstrate          (the ONE resolver's snapshot)
 *       -> applyBuildingContainment       (the join into the export model)
 *       -> IfcSpatialStructure            (the real writer)
 *       -> STEP text                      (what a downstream consumer reads)
 *
 * ⛔ IT DOES NOT EDIT — OR RESTATE — THE EXISTING SUITE'S ARMS. In particular the two
 * `IFCRELAGGREGATES === 4` arms there are the ADR-0383 D3 back-compatibility
 * guarantee (the arithmetic of exactly one site and one building) and are preserved
 * verbatim by that file. What this file adds is the arm that PROVES the projection
 * cannot break them: an UNGROUPED envelope set is run through the projection and the
 * emitted file is checked to be the one-building shape, byte-identical storey key
 * included.
 *
 * ⚠ THE STUB LEDGER. Nothing on the measured path is stubbed. `web-ifc` is real and
 * so are `IfcSpatialStructure` / `IfcModelBuilder`; the hierarchy store is a REAL
 * `HierarchyStore` (a fresh instance per test, injected — never the singleton, so the
 * suite cannot leak state into its neighbours); the projection, the resolver and the
 * containment join are the production functions. The one substitution is that the
 * envelope records are LITERALS rather than records read back out of a live
 * `SpaceEnvelopeStore` — because `packages/file-format` is L4 and may not import the
 * L6 plugin. The REAL create path is measured in
 * `apps/editor/__tests__/massingGroupProjectsIntoHierarchy.test.ts`, which dispatches
 * `spaceEnvelope.batch.create` on a real `composeRuntime()` bus, reads the records
 * back OUT of the composed store, and feeds them to the SAME
 * `readMassingGroupSubstrate` this file calls. The two arms meet on that function, so
 * there is no unmeasured seam between them.
 */

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import * as WEBIFC from 'web-ifc';

// L-8521 — `debug()` reads `window.__PRYZM_SHOW_DEBUG_OVERLAY` unguarded, so every
// IFC writer throws outside a browser. Same stub, same reason, as the sibling suite.
vi.stubGlobal('window', (globalThis as { window?: unknown }).window ?? {});

import { IfcSpatialStructure } from '../src/export/ifc/IfcSpatialStructure';
import { IfcGeometryWriter } from '../src/export/ifc/IfcGeometryWriter';
import { IfcPropertyWriter } from '../src/export/ifc/IfcPropertyWriter';
import { IfcModelBuilder } from '../src/export/ifc/IfcModelBuilder';
import { ExportDiagnostics, DEFAULT_BUILDING_ID, storeySlot, storeyKey } from '../src/export/ifc/ifcIdentity';
import { applyBuildingContainment } from '../src/export/ifc/buildingContainment';
import type { IntermediateModel, ExportLevel } from '../src/export/ifc/IntermediateModel';
import { globalIdFromStableKey } from '@pryzm/schemas/ifc';
import {
    HierarchyStore,
    readBuildingSubstrate,
    applyMassingGroupProjection,
    readMassingGroupSubstrate,
    type MassingGroupMemberView,
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

/** Drive the REAL writers and return the STEP text a consumer would read. */
function emit(m: IntermediateModel): string {
    const modelID = api.CreateModel({ schema: 'IFC4' });
    openModels.push(modelID);
    const diagnostics = new ExportDiagnostics();
    const spatial = new IfcSpatialStructure(api, modelID);
    const refs = spatial.create(m);
    const geometryWriter = new IfcGeometryWriter(api, modelID, refs.contextRef);
    const propertyWriter = new IfcPropertyWriter(api, modelID, refs.ownerHistoryRef);
    const builder = new IfcModelBuilder(api, modelID, geometryWriter, propertyWriter, refs, diagnostics);
    builder.createElements(m.elements);
    spatial.finaliseBuildingAggregation(refs);
    return new TextDecoder().decode(api.SaveModel(modelID));
}

const countOf = (step: string, entity: string) =>
    (step.match(new RegExp(`=\\s*${entity}\\(`, 'g')) ?? []).length;

const namesOf = (step: string, entity: string) =>
    [...step.matchAll(new RegExp(`=\\s*${entity}\\(\\s*'[^']*'\\s*,[^,]*,\\s*'([^']*)'`, 'g'))]
        .map((m) => m[1]);

/**
 * A model whose LEVEL SET is `levelIds` and whose buildings are UNRESOLVED —
 * exactly what `FragmentReader` produces before `applyBuildingContainment` runs.
 * The default building is the seed the containment join then replaces or keeps.
 */
function unresolvedModel(levelIds: readonly string[]): IntermediateModel {
    const levels: ExportLevel[] = levelIds.map((id, i) => ({
        id, name: `Level ${i}`, elevation: i * 3, height: 3,
    }));
    return {
        project: { id: 'project-1', name: 'Master Plan' },
        site: { id: 'site-1', name: 'Site' },
        buildings: [{ id: DEFAULT_BUILDING_ID, name: 'Default Building' }],
        levels,
        elements: [],
    };
}

/** One level envelope, in the shape the space-envelope store holds. */
function env(
    id: string,
    levelId: string,
    group: { id: string; label: string } | null,
): MassingGroupMemberView {
    return { id, levelId, role: 'level', group };
}

/**
 * Run the WHOLE chain on a fresh store and return the emitted STEP text.
 *
 * ⛔ `applyBuildingContainment` is given the substrate EXPLICITLY rather than being
 * allowed to read the `hierarchyStore` singleton, so this suite cannot be polluted by
 * — or pollute — anything else running in the same worker. It is the same function
 * production calls; only the store handle differs.
 */
function chain(envelopes: readonly MassingGroupMemberView[], levelIds: readonly string[]) {
    const store = new HierarchyStore();
    const projection = applyMassingGroupProjection(store, readMassingGroupSubstrate(envelopes));
    const model = unresolvedModel(levelIds);
    const containment = applyBuildingContainment(model, undefined, readBuildingSubstrate(store));
    return { store, projection, model, containment, step: emit(model) };
}

// ═════════════════════════════════════════════════════════════════════════════
// ⭐ THE FOUNDER'S REQUIREMENT, MEASURED IN THE FILE
// ═════════════════════════════════════════════════════════════════════════════

describe('ADR-0385 — a master plan authored as N massing groups exports as N IfcBuilding', () => {
    it('⭐⭐ TWO groups on disjoint storeys emit TWO IfcBuilding, named after the groups', () => {
        // The founder, 2026-09-09: *"each building should be considered as a different
        // building entity for the IFC schema and the inspect tree etc… as per IFC
        // standards."*
        const { projection, containment, step } = chain(
            [
                env('e1', 'L1', { id: 'g-a', label: 'Block A' }),
                env('e2', 'L2', { id: 'g-a', label: 'Block A' }),
                env('e3', 'L3', { id: 'g-b', label: 'Block B' }),
                env('e4', 'L4', { id: 'g-b', label: 'Block B' }),
            ],
            ['L1', 'L2', 'L3', 'L4'],
        );

        expect(projection.ok).toBe(true);
        expect(projection.groups).toBe(2);
        expect(containment.buildingCount).toBe(2);

        // ⛔ THE ASSERTION THAT CANNOT PASS BY LUCK. Without the projection the model
        // resolves to ONE building called "Default Building" — a different cardinality
        // AND a different name — so neither of these two lines can be satisfied by the
        // fallback path.
        expect(countOf(step, 'IFCBUILDING')).toBe(2);
        expect(namesOf(step, 'IFCBUILDING').sort()).toEqual(['Block A', 'Block B']);
        expect(step).not.toContain('Default Building');

        // Four storeys, one site, and every storey distinguishable.
        expect(countOf(step, 'IFCBUILDINGSTOREY')).toBe(4);
        expect(countOf(step, 'IFCSITE')).toBe(1);
    });

    it('⭐⭐ THREE groups SHARING the project storey ladder emit 3 buildings and NINE storeys', () => {
        // ⛔⛔ THIS IS THE FOUNDER'S ACTUAL GESTURE, AND IT IS THE ONE THAT WAS BROKEN.
        // `masterPlanAuthoringPlan` hands every profile the SAME `levels` — the
        // project's one storey ladder — so a real master plan's blocks all sit on
        // L1/L2/L3. Before this lane, `buildBuildingRoster` resolved every such level
        // `unknown` and dropped it into the default building, so a correctly-projected
        // three-building hierarchy STILL emitted ONE `IfcBuilding`. The projection was
        // right and the roster threw the answer away; the disjoint-storey arm above
        // passed the whole time, which is exactly why this arm exists.
        //
        // C25 §1.3 as amended: Block A "Level 1" and Block B "Level 1" are ONE PRYZM
        // levelId and TWO `IfcBuildingStorey` entities. The composite `storeySlot` is
        // what makes nine.
        const envelopes: MassingGroupMemberView[] = [];
        for (const [gid, label] of [['g-a', 'Block A'], ['g-b', 'Block B'], ['g-c', 'Block C']] as const) {
            for (const lv of ['L1', 'L2', 'L3']) {
                envelopes.push(env(`e-${gid}-${lv}`, lv, { id: gid, label }));
            }
        }
        const { containment, step } = chain(envelopes, ['L1', 'L2', 'L3']);

        expect(containment.buildingCount).toBe(3);
        expect(containment.fannedLevelIds).toEqual(['L1', 'L2', 'L3']);
        expect(countOf(step, 'IFCBUILDING')).toBe(3);
        expect(countOf(step, 'IFCBUILDINGSTOREY')).toBe(9);
        expect(namesOf(step, 'IFCBUILDING').sort()).toEqual(['Block A', 'Block B', 'Block C']);

        // Nine DISTINCT storey GlobalIds. A collision would mean two blocks share one
        // storey entity, which is the failure the composite key exists to prevent.
        const storeyGuids = new Set(
            [...step.matchAll(/=\s*IFCBUILDINGSTOREY\(\s*'([^']*)'/g)].map((m) => m[1]),
        );
        expect(storeyGuids.size).toBe(9);
    });

    it('⛔ a fanned level is reported as such — its ELEMENTS are unroutable and say so', () => {
        // ADR-0385 §4's named gap, kept visible rather than papered over. The storeys
        // are correct; a wall on a shared storey carries no building axis, so it is
        // NOT stamped and lands in the explicit UNASSIGNED storey with a diagnostic
        // (L-8510) instead of being guessed into one of the blocks.
        const store = new HierarchyStore();
        applyMassingGroupProjection(store, readMassingGroupSubstrate([
            env('e1', 'L1', { id: 'g-a', label: 'Block A' }),
            env('e2', 'L1', { id: 'g-b', label: 'Block B' }),
        ]));
        const model = unresolvedModel(['L1']);
        const diagnostics = new ExportDiagnostics();
        const report = applyBuildingContainment(model, diagnostics, readBuildingSubstrate(store));

        expect(report.buildingCount).toBe(2);
        expect(report.fannedLevelIds).toEqual(['L1']);
        expect(report.unresolvedLevels.map((u) => u.levelId)).toEqual(['L1']);
        expect(diagnostics.count('UNRESOLVED_BUILDING')).toBe(1);
        expect(diagnostics.all()[0]!.message).toContain('STOREYS are written correctly');
        expect(model.levels).toHaveLength(2);   // one ExportLevel per owning building
    });

    it('⛔ the fan-out is IDEMPOTENT — three storeys never become nine and then twenty-seven', () => {
        // The hazard the de-duplication in `applyBuildingContainment` exists for: a
        // second call sees the ALREADY-EXPANDED level rows, and without collapsing
        // first it would fan each of them out again.
        const store = new HierarchyStore();
        applyMassingGroupProjection(store, readMassingGroupSubstrate([
            env('e1', 'L1', { id: 'g-a', label: 'Block A' }),
            env('e2', 'L1', { id: 'g-b', label: 'Block B' }),
            env('e3', 'L1', { id: 'g-c', label: 'Block C' }),
        ]));
        const model = unresolvedModel(['L1']);
        const sub = readBuildingSubstrate(store);
        applyBuildingContainment(model, undefined, sub);
        const first = JSON.stringify({ b: model.buildings, l: model.levels });
        applyBuildingContainment(model, undefined, sub);
        applyBuildingContainment(model, undefined, sub);
        expect(JSON.stringify({ b: model.buildings, l: model.levels })).toBe(first);
        expect(model.levels).toHaveLength(3);
        expect(countOf(emit(model), 'IFCBUILDINGSTOREY')).toBe(3);
    });

    it('renaming a group renames the IfcBuilding — it does not add a fourth entity', () => {
        const store = new HierarchyStore();
        const before = [env('e1', 'L1', { id: 'g-a', label: 'Block A' })];
        applyMassingGroupProjection(store, readMassingGroupSubstrate(before));
        applyMassingGroupProjection(store, readMassingGroupSubstrate(
            [env('e1', 'L1', { id: 'g-a', label: 'Podium' })],
        ));

        const model = unresolvedModel(['L1']);
        applyBuildingContainment(model, undefined, readBuildingSubstrate(store));
        const step = emit(model);

        expect(countOf(step, 'IFCBUILDING')).toBe(1);
        expect(namesOf(step, 'IFCBUILDING')).toEqual(['Podium']);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// ⛔ THE BACK-COMPATIBILITY PIN — the projection must not disturb ADR-0383 D3
// ═════════════════════════════════════════════════════════════════════════════

describe('ADR-0385 — an UNGROUPED project is untouched by the projection', () => {
    it('⛔ running the projection over ungrouped envelopes emits the ONE-building file', () => {
        // Every project authored before ADR-0383 has `group: null` everywhere and now
        // has this projection running over it on every store change. This arm is the
        // guarantee that doing so changes NOTHING.
        const { store, projection, containment, step } = chain(
            [env('e1', 'L1', null), env('e2', 'L2', null)],
            ['L1', 'L2'],
        );

        expect(projection.ok).toBe(true);
        expect([...projection.added, ...projection.updated, ...projection.removed]).toEqual([]);
        expect(store.getAll()).toEqual([]);           // hierarchyStore untouched
        expect(containment.buildingCount).toBe(1);

        expect(countOf(step, 'IFCBUILDING')).toBe(1);
        expect(namesOf(step, 'IFCBUILDING')).toEqual(['Default Building']);
        // project->site, site->building, building->storeys : the one-building arithmetic.
        expect(countOf(step, 'IFCRELAGGREGATES')).toBe(3);
    });

    it('⛔⛔ the ungrouped storey GlobalId is BYTE-IDENTICAL to the pre-ADR-0385 key (L-8501)', () => {
        // `storeySlot()` degenerates to the bare levelId for the default building, and
        // that is the whole of the pin: if the projection ever caused an ungrouped
        // level to carry a non-default `buildingId`, every storey GlobalId in every
        // existing project would re-churn. The expected value is computed from the
        // SEED, not copied from a previous run, so it cannot rot into a tautology.
        const { step } = chain([env('e1', 'L1', null)], ['L1']);
        const expected = globalIdFromStableKey(storeyKey(storeySlot(DEFAULT_BUILDING_ID, 'L1')));
        expect(storeySlot(DEFAULT_BUILDING_ID, 'L1')).toBe('L1');
        expect(step).toContain(expected);
    });

    it('a MIXED project keeps the ungrouped storeys in the default building', () => {
        // L1 is grouped, L2 is not. The grouped storey moves; the ungrouped one must
        // stay exactly where it was, or the pin above is only true for pure projects.
        const { containment, step } = chain(
            [env('e1', 'L1', { id: 'g-a', label: 'Block A' }), env('e2', 'L2', null)],
            ['L1', 'L2'],
        );
        expect(containment.buildingCount).toBe(2);
        expect(namesOf(step, 'IFCBUILDING').sort()).toEqual(['Block A', 'Default Building']);
        expect(step).toContain(globalIdFromStableKey(storeyKey(storeySlot(DEFAULT_BUILDING_ID, 'L2'))));
    });
});
