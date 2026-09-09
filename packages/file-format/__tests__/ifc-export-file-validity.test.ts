/**
 * L-8500..L-8520 — assertions on the EMITTED IFC FILE, not on the code.
 *
 * ⛔ The whole point of this suite. A passing unit test that produces an invalid
 * IFC file proves nothing, and that is exactly the state the audit found:
 * Pipeline A had tests, and every file it had ever written was schema-invalid at
 * every GlobalId. So every assertion here parses the STEP text that
 * `SaveModel()` returns and asserts on what a downstream IFC consumer would see.
 *
 * These drive the real writers (`IfcSpatialStructure`, `IfcModelBuilder`,
 * `IfcPropertyWriter`, `IfcGeometryWriter`) against a real `web-ifc` instance.
 * They do NOT go through `IfcExporter`, whose `SetWasmPath('/wasm/')` is a
 * browser path — the writers are the part that produces the bytes.
 */

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import * as WEBIFC from 'web-ifc';

// L-8521 — `debug()` in `@pryzm/core-app-model/src/debugOverlay.ts:7` reads
// `window.__PRYZM_SHOW_DEBUG_OVERLAY` UNGUARDED, so every IFC export writer
// throws `ReferenceError: window is not defined` outside a browser. That makes
// IFC export impossible from a worker or the server, and it is why this suite
// has to stub the global. Logged against core-app-model, not fixed here.
vi.stubGlobal('window', (globalThis as { window?: unknown }).window ?? {});

import { IfcSpatialStructure } from '../src/export/ifc/IfcSpatialStructure';
import { IfcGeometryWriter } from '../src/export/ifc/IfcGeometryWriter';
import { IfcPropertyWriter } from '../src/export/ifc/IfcPropertyWriter';
import { IfcModelBuilder } from '../src/export/ifc/IfcModelBuilder';
import { ExportDiagnostics, UNASSIGNED_LEVEL_ID, DEFAULT_BUILDING_ID, storeySlot, storeyKey } from '../src/export/ifc/ifcIdentity';
import type { IntermediateModel, ExportElement, ExportLevel, TriangulatedGeometry } from '../src/export/ifc/IntermediateModel';
import { applyBuildingContainment } from '../src/export/ifc/buildingContainment';
import { globalIdFromStableKey } from '@pryzm/schemas/ifc';
import { HierarchyStore, readBuildingSubstrate, UNREADABLE_SUBSTRATE } from '@pryzm/core-app-model';
import { isIfcGlobalId } from '@pryzm/schemas/ifc';

// ── fixtures ────────────────────────────────────────────────────────────────

function box(): TriangulatedGeometry {
    return {
        vertices: new Float32Array([
            0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0,
            0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1,
        ]),
        indices: new Uint32Array([
            0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6,
            0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2,
            2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0,
        ]),
    };
}

function el(partial: Partial<ExportElement> & { id: string; ifcClass: string }): ExportElement {
    return {
        name: partial.id,
        geometry: box(),
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        propertySets: [],
        levelId: 'L0',
        ...partial,
    } as ExportElement;
}

/**
 * The UNGROUPED model - one building, exactly as every project authored before
 * ADR-0385 exports.
 *
 * ADR-0385 turned `IntermediateModel.building` (singular) into `buildings` (an
 * array), so this CONSTRUCTOR had to change. Every ASSERTION below is untouched -
 * in particular the two `IFCRELAGGREGATES === 4` arms, which are the arithmetic of
 * exactly one site and exactly one building and are therefore the ADR-0383 D3
 * back-compatibility guarantee. They were preserved verbatim rather than edited to
 * accommodate the change; editing them would have retired the guarantee silently.
 *
 * The id MUST be `DEFAULT_BUILDING_ID` - it is the sentinel that keeps the storey
 * slot equal to the bare levelId, and therefore every storey GlobalId byte-identical
 * (`ifcIdentity.storeySlot`, the L-8501 pin).
 */
function model(elements: ExportElement[], levels: ExportLevel[] = [{ id: 'L0', name: 'Ground Floor', elevation: 0, height: 3 }]): IntermediateModel {
    return {
        project: { id: 'project-1', name: 'Validity Project' },
        site: { id: 'site-1', name: 'Site' },
        buildings: [{ id: DEFAULT_BUILDING_ID, name: 'Building' }],
        levels,
        elements,
    };
}

/** A model of N buildings, each owning its own storeys. ADR-0385. */
function multiBuildingModel(
    buildings: { id: string; name: string; levels: ExportLevel[] }[],
    elements: ExportElement[] = [],
): IntermediateModel {
    return {
        project: { id: 'project-1', name: 'Master Plan' },
        site: { id: 'site-1', name: 'Site' },
        buildings: buildings.map((b) => ({ id: b.id, name: b.name })),
        levels: buildings.flatMap((b) => b.levels.map((l) => ({ ...l, buildingId: b.id }))),
        elements,
    };
}

// ── harness ─────────────────────────────────────────────────────────────────

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

interface Emitted {
    step: string;
    diagnostics: ExportDiagnostics;
}

function emit(m: IntermediateModel): Emitted {
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

    const bytes = api.SaveModel(modelID);
    return { step: new TextDecoder().decode(bytes), diagnostics };
}

/**
 * Every GlobalId in the file, extracted **through the IFC parser** rather than by
 * regex.
 *
 * A first attempt matched "the first quoted string after the entity name" and
 * produced a false positive on `IFCGEOMETRICREPRESENTATIONCONTEXT('Model',…)`,
 * whose attribute #1 is a ContextIdentifier, not a GlobalId. Rather than
 * whitelist entity names — which would silently stop checking any entity someone
 * forgot to add — this reopens the saved bytes and asks web-ifc which lines
 * actually carry a `GlobalId`. That is the same question a downstream consumer
 * asks, and it cannot drift as the entity set grows.
 */
function globalIds(step: string): string[] {
    const reopened = api.OpenModel(new TextEncoder().encode(step));
    openModels.push(reopened);
    const out: string[] = [];
    const lineIDs = api.GetAllLines(reopened);
    for (let i = 0; i < lineIDs.size(); i += 1) {
        let line: unknown;
        try {
            line = api.GetLine(reopened, lineIDs.get(i));
        } catch {
            continue; // unparsable line type — not a GlobalId carrier
        }
        const g = (line as { GlobalId?: { value?: unknown } } | null)?.GlobalId;
        if (g && typeof g.value === 'string') out.push(g.value);
    }
    return out;
}

/** Attribute #2 of a rooted entity is OwnerHistory: `#n` or `$`. */
function ownerHistorySlots(step: string, entity: string): string[] {
    const slots: string[] = [];
    const re = new RegExp(`=\\s*${entity}\\(\\s*'[^']*'\\s*,\\s*([^,]+),`, 'g');
    let match: RegExpExecArray | null;
    while ((match = re.exec(step)) !== null) slots.push((match[1] as string).trim());
    return slots;
}

const countOf = (step: string, entity: string) =>
    (step.match(new RegExp(`=\\s*${entity}\\(`, 'g')) ?? []).length;

// ── L-8500: GlobalId validity ───────────────────────────────────────────────

describe('L-8500 — every GlobalId in the emitted file is a valid IfcGloballyUniqueId', () => {
    it('emits no 36-character UUID anywhere in the file', () => {
        const { step } = emit(model([
            el({ id: 'wall_1', ifcClass: 'IfcWall' }),
            el({ id: 'slab_1', ifcClass: 'IfcSlab' }),
            el({ id: 'col_1', ifcClass: 'IfcColumn' }),
        ]));
        // The exact defect: crypto.randomUUID() written verbatim into GlobalId.
        expect(step).not.toMatch(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
    });

    it('every GlobalId passes isIfcGlobalId', () => {
        const { step } = emit(model([
            el({ id: 'wall_1', ifcClass: 'IfcWall' }),
            el({ id: 'win_1', ifcClass: 'IfcWindow', hostWallId: 'wall_1', openingGeometry: box() }),
            el({ id: 'door_1', ifcClass: 'IfcDoor', hostWallId: 'wall_1', openingGeometry: box() }),
            el({ id: 'room_1', ifcClass: 'IfcSpace' }),
            el({ id: 'beam_1', ifcClass: 'IfcBeam' }),
            el({ id: 'roof_1', ifcClass: 'IfcRoof', predefinedType: 'FLAT_ROOF' }),
        ]));
        const ids = globalIds(step);
        expect(ids.length).toBeGreaterThan(10);
        const invalid = ids.filter((g) => !isIfcGlobalId(g));
        expect(invalid).toEqual([]);
    });

    it('preserves an already-valid GlobalId carried in from an imported IFC file', () => {
        const imported = '3n2mAyxIf1PhCA1eyOFR0i';
        const { step } = emit(model([el({ id: 'wall_1', ifcClass: 'IfcWall', guid: imported })]));
        expect(step).toContain(`'${imported}'`);
    });

    it('encodes — not passes through — a persisted UUID-shaped ifcData.guid', () => {
        const uuid = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
        const { step } = emit(model([el({ id: 'wall_1', ifcClass: 'IfcWall', guid: uuid })]));
        expect(step).not.toContain(uuid);
        expect(globalIds(step).every(isIfcGlobalId)).toBe(true);
    });
});

// ── L-8501: GlobalId stability ──────────────────────────────────────────────

describe('L-8501 — GlobalIds are stable across exports of an unchanged model', () => {
    it('two exports of the same model produce the identical GlobalId set', () => {
        const build = () => model([
            el({ id: 'wall_1', ifcClass: 'IfcWall' }),
            el({ id: 'wall_2', ifcClass: 'IfcWall' }),
            el({ id: 'door_1', ifcClass: 'IfcDoor', hostWallId: 'wall_1', openingGeometry: box() }),
            el({ id: 'room_1', ifcClass: 'IfcSpace' }),
        ]);
        const a = globalIds(emit(build()).step);
        const b = globalIds(emit(build()).step);
        expect(a).toEqual(b);
    });

    it('covers the RELATIONSHIP entities too, not just the elements', () => {
        // Openings, RelVoids, RelFills, RelContained, RelAggregates and every
        // IfcPropertySet were all crypto.randomUUID() before this fix, so a
        // stability check that only looked at elements would have passed while
        // most of the file still churned.
        const build = () => model([
            el({
                id: 'wall_1', ifcClass: 'IfcWall',
                propertySets: [{ name: 'Pset_WallCommon', properties: [{ name: 'IsExternal', value: true, type: 'boolean' }] }],
            }),
            el({ id: 'door_1', ifcClass: 'IfcDoor', hostWallId: 'wall_1', openingGeometry: box() }),
        ]);
        const first = emit(build()).step;
        const second = emit(build()).step;
        for (const entity of [
            'IFCOPENINGELEMENT', 'IFCRELVOIDSELEMENT', 'IFCRELFILLSELEMENT',
            'IFCRELCONTAINEDINSPATIALSTRUCTURE', 'IFCRELAGGREGATES',
            'IFCPROPERTYSET', 'IFCRELDEFINESBYPROPERTIES',
            'IFCPROJECT', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY',
        ]) {
            const re = new RegExp(`=\\s*${entity}\\(\\s*'([^']*)'`, 'g');
            const a = [...first.matchAll(re)].map((m) => m[1]);
            const b = [...second.matchAll(re)].map((m) => m[1]);
            expect(a.length, `${entity} was not emitted`).toBeGreaterThan(0);
            expect(b, `${entity} GlobalId churned between exports`).toEqual(a);
        }
    });

    it('gives different elements different GlobalIds', () => {
        const { step } = emit(model([
            el({ id: 'wall_1', ifcClass: 'IfcWall' }),
            el({ id: 'wall_2', ifcClass: 'IfcWall' }),
            el({ id: 'wall_3', ifcClass: 'IfcWall' }),
        ]));
        const ids = globalIds(step);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

// ── L-8503: OwnerHistory ────────────────────────────────────────────────────

describe('L-8503 — OwnerHistory is present on every owned entity, not just IfcProject', () => {
    it('IfcProject, IfcSite, IfcBuilding and IfcBuildingStorey all reference it', () => {
        const { step } = emit(model([el({ id: 'wall_1', ifcClass: 'IfcWall' })]));
        for (const entity of ['IFCPROJECT', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY']) {
            const slots = ownerHistorySlots(step, entity);
            expect(slots.length, `${entity} missing`).toBeGreaterThan(0);
            expect(slots.every((s) => s.startsWith('#')), `${entity} OwnerHistory is $`).toBe(true);
        }
    });

    it('building elements and their psets reference it', () => {
        const { step } = emit(model([
            el({
                id: 'wall_1', ifcClass: 'IfcWall',
                propertySets: [{ name: 'Pset_WallCommon', properties: [{ name: 'IsExternal', value: true, type: 'boolean' }] }],
            }),
        ]));
        for (const entity of ['IFCWALL', 'IFCPROPERTYSET', 'IFCRELDEFINESBYPROPERTIES', 'IFCRELCONTAINEDINSPATIALSTRUCTURE']) {
            const slots = ownerHistorySlots(step, entity);
            expect(slots.length, `${entity} missing`).toBeGreaterThan(0);
            expect(slots.every((s) => s.startsWith('#')), `${entity} OwnerHistory is $`).toBe(true);
        }
    });

    it('there is exactly ONE IfcOwnerHistory, shared', () => {
        const { step } = emit(model([
            el({ id: 'wall_1', ifcClass: 'IfcWall' }),
            el({ id: 'wall_2', ifcClass: 'IfcWall' }),
        ]));
        expect(countOf(step, 'IFCOWNERHISTORY')).toBe(1);
    });
});

// ── L-8504: IfcSpace uses IfcRelAggregates ──────────────────────────────────

describe('L-8504 — IfcSpace nests under its storey with IfcRelAggregates, not IfcRelContainedInSpatialStructure', () => {
    it('a model of spaces alone emits no IfcRelContainedInSpatialStructure', () => {
        const { step } = emit(model([
            el({ id: 'room_1', ifcClass: 'IfcSpace' }),
            el({ id: 'room_2', ifcClass: 'IfcSpace' }),
        ]));
        expect(countOf(step, 'IFCSPACE')).toBe(2);
        expect(countOf(step, 'IFCRELCONTAINEDINSPATIALSTRUCTURE')).toBe(0);
        // project->site, site->building, building->storeys, storey->spaces
        expect(countOf(step, 'IFCRELAGGREGATES')).toBe(4);
    });

    it('a mixed model routes products to containment and spaces to aggregation', () => {
        const { step } = emit(model([
            el({ id: 'wall_1', ifcClass: 'IfcWall' }),
            el({ id: 'room_1', ifcClass: 'IfcSpace' }),
        ]));
        expect(countOf(step, 'IFCRELCONTAINEDINSPATIALSTRUCTURE')).toBe(1);
        expect(countOf(step, 'IFCRELAGGREGATES')).toBe(4);
    });
});

// ── L-8505: predefinedType survives ─────────────────────────────────────────

describe('L-8505 — predefinedType reaches the file for Wall, Window, Door and Column', () => {
    it.each([
        ['IfcWall', 'IFCWALL', 'PARTITIONING'],
        ['IfcWindow', 'IFCWINDOW', 'SKYLIGHT'],
        ['IfcDoor', 'IFCDOOR', 'GATE'],
        ['IfcColumn', 'IFCCOLUMN', 'PILASTER'],
    ])('%s carries %s', (ifcClass, entity, pdt) => {
        const { step } = emit(model([el({ id: 'x_1', ifcClass, predefinedType: pdt })]));
        const line = step.split(/;\r?\n/).find((l) => l.includes(`= ${entity}(`) || l.includes(`=${entity}(`));
        expect(line, `${entity} not emitted`).toBeDefined();
        expect(line).toContain(`.${pdt}.`);
    });

    it('IfcSpace still defaults to INTERNAL when the model states nothing', () => {
        const { step } = emit(model([el({ id: 'room_1', ifcClass: 'IfcSpace' })]));
        expect(step).toContain('.INTERNAL.');
    });
});

// ── L-8510..L-8515: the silent fallbacks are now loud ───────────────────────

describe('L-8510 — an unresolved levelId no longer silently relocates the element', () => {
    it('places it in an explicit UNASSIGNED storey and raises an error diagnostic', () => {
        const { step, diagnostics } = emit(model(
            [
                el({ id: 'wall_1', ifcClass: 'IfcWall', levelId: 'L0' }),
                el({ id: 'wall_lost', ifcClass: 'IfcWall', levelId: 'LEVEL_THAT_DOES_NOT_EXIST' }),
            ],
            [
                { id: 'L0', name: 'Ground Floor', elevation: 0, height: 3 },
                { id: 'L1', name: 'First Floor', elevation: 3, height: 3 },
            ],
        ));

        // The old behaviour: wall_lost silently joins L0 — the FIRST storey —
        // and the file looks perfect. Assert we did NOT do that.
        const diag = diagnostics.all().filter((d) => d.code === 'UNRESOLVED_LEVEL');
        expect(diag).toHaveLength(1);
        expect(diag[0]!.severity).toBe('error');
        expect(diag[0]!.elementId).toBe('wall_lost');

        expect(step).toContain('UNASSIGNED (PRYZM export');
        // 2 authored storeys + the UNASSIGNED one.
        expect(countOf(step, 'IFCBUILDINGSTOREY')).toBe(3);
        // ...and it is aggregated under the building, not orphaned.
        const agg = step.match(/=\s*IFCRELAGGREGATES\([^;]*/g) ?? [];
        const buildingAgg = agg.find((a) => (a.match(/#/g) ?? []).length >= 4);
        expect(buildingAgg, 'building->storeys aggregation missing').toBeDefined();
    });

    it('a clean model raises no diagnostics at all', () => {
        const { diagnostics } = emit(model([
            el({ id: 'wall_1', ifcClass: 'IfcWall' }),
            el({ id: 'door_1', ifcClass: 'IfcDoor', hostWallId: 'wall_1', openingGeometry: box() }),
        ]));
        expect(diagnostics.all()).toEqual([]);
        expect(diagnostics.summary()).toBe('no defects detected');
    });
});

describe('L-8511 — a missing host wall is reported, not swallowed', () => {
    it('raises MISSING_HOST_WALL and writes no void/fill', () => {
        const { step, diagnostics } = emit(model([
            el({ id: 'door_1', ifcClass: 'IfcDoor', hostWallId: 'wall_that_was_not_exported', openingGeometry: box() }),
        ]));
        expect(diagnostics.count('MISSING_HOST_WALL')).toBe(1);
        expect(diagnostics.errorCount).toBe(1);
        expect(countOf(step, 'IFCOPENINGELEMENT')).toBe(0);
        expect(countOf(step, 'IFCRELVOIDSELEMENT')).toBe(0);
        // The door itself is still exported — the diagnostic is not a data loss.
        expect(countOf(step, 'IFCDOOR')).toBe(1);
    });
});

describe('L-8512 — an opening with no geometry is refused rather than written null', () => {
    it('raises OPENING_WITHOUT_GEOMETRY and writes no opening at all', () => {
        const { step, diagnostics } = emit(model([
            el({ id: 'wall_1', ifcClass: 'IfcWall' }),
            el({ id: 'door_1', ifcClass: 'IfcDoor', hostWallId: 'wall_1' }), // no openingGeometry
        ]));
        expect(diagnostics.count('OPENING_WITHOUT_GEOMETRY')).toBe(1);
        // Previously: an IfcOpeningElement with a null Representation, plus
        // RelVoids/RelFills claiming the wall was voided when it was not.
        expect(countOf(step, 'IFCOPENINGELEMENT')).toBe(0);
        expect(countOf(step, 'IFCRELVOIDSELEMENT')).toBe(0);
        expect(countOf(step, 'IFCRELFILLSELEMENT')).toBe(0);
    });

    it('writes the full void/fill chain when the geometry IS present', () => {
        const { step, diagnostics } = emit(model([
            el({ id: 'wall_1', ifcClass: 'IfcWall' }),
            el({ id: 'door_1', ifcClass: 'IfcDoor', hostWallId: 'wall_1', openingGeometry: box() }),
        ]));
        expect(diagnostics.all()).toEqual([]);
        expect(countOf(step, 'IFCOPENINGELEMENT')).toBe(1);
        expect(countOf(step, 'IFCRELVOIDSELEMENT')).toBe(1);
        expect(countOf(step, 'IFCRELFILLSELEMENT')).toBe(1);
    });
});

describe('L-8520 — an unmapped ifcClass is reported before it degrades to a proxy', () => {
    it('warns for a class outside IFC_CLASS_MAP', () => {
        const { diagnostics } = emit(model([el({ id: 'x_1', ifcClass: 'IfcBuildingStorey' })]));
        expect(diagnostics.count('UNKNOWN_IFC_CLASS')).toBe(1);
    });

    it('IfcGrid is now mapped, so it does NOT warn', () => {
        // CoreElement.ts:77 maps `grid` -> 'IfcGrid'; the export table lacked it,
        // so every grid silently became an IfcBuildingElementProxy.
        const { diagnostics } = emit(model([el({ id: 'grid_1', ifcClass: 'IfcGrid' })]));
        expect(diagnostics.count('UNKNOWN_IFC_CLASS')).toBe(0);
    });
});

describe('L-8550 — furniture and plumbing follow C25 §2.1, where the contract beat the code', () => {
    it('emits IFCFURNITURE and IFCSANITARYTERMINAL, not the abstract supertypes', () => {
        const { step, diagnostics } = emit(model([
            el({ id: 'furn_1', ifcClass: 'IfcFurniture' }),
            el({ id: 'plumb_1', ifcClass: 'IfcSanitaryTerminal' }),
        ]));
        expect(diagnostics.count('UNKNOWN_IFC_CLASS')).toBe(0);
        expect(countOf(step, 'IFCFURNITURE')).toBe(1);
        expect(countOf(step, 'IFCSANITARYTERMINAL')).toBe(1);
    });

    it('still round-trips an IMPORTED element that genuinely carries a supertype', () => {
        // Rewriting an imported IfcFurnishingElement into IfcFurniture would be
        // a round-trip regression: the upstream file said what it said.
        const { step, diagnostics } = emit(model([
            el({ id: 'imported_1', ifcClass: 'IfcFurnishingElement' }),
        ]));
        expect(diagnostics.count('UNKNOWN_IFC_CLASS')).toBe(0);
        expect(countOf(step, 'IFCFURNISHINGELEMENT')).toBe(1);
    });
});

// ── the file still parses ───────────────────────────────────────────────────

describe('the emitted file is still a readable IFC model', () => {
    it('round-trips through web-ifc OpenModel with its elements intact', () => {
        const modelID = api.CreateModel({ schema: 'IFC4' });
        openModels.push(modelID);
        const m = model([
            el({ id: 'wall_1', ifcClass: 'IfcWall' }),
            el({ id: 'door_1', ifcClass: 'IfcDoor', hostWallId: 'wall_1', openingGeometry: box() }),
            el({ id: 'room_1', ifcClass: 'IfcSpace' }),
        ]);
        const diagnostics = new ExportDiagnostics();
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
        const bytes = api.SaveModel(modelID);

        const reopened = api.OpenModel(bytes);
        openModels.push(reopened);
        expect(api.GetLineIDsWithType(reopened, WEBIFC.IFCWALL).size()).toBe(1);
        expect(api.GetLineIDsWithType(reopened, WEBIFC.IFCDOOR).size()).toBe(1);
        expect(api.GetLineIDsWithType(reopened, WEBIFC.IFCSPACE).size()).toBe(1);
        expect(api.GetLineIDsWithType(reopened, WEBIFC.IFCOPENINGELEMENT).size()).toBe(1);
        expect(api.GetLineIDsWithType(reopened, WEBIFC.IFCBUILDINGSTOREY).size()).toBe(1);
    });
});

// ── guard against a second divergence ───────────────────────────────────────

describe('UNASSIGNED_LEVEL_ID is a reserved sentinel', () => {
    it('is not a plausible real level id', () => {
        expect(UNASSIGNED_LEVEL_ID).toBe('__PRYZM_UNASSIGNED__');
    });
});

// ── ADR-0385: N IfcBuilding, each owning its own storeys ────────────────────

/**
 * The spatial decomposition graph, read THROUGH the IFC parser rather than by
 * regex — the same discipline `globalIds()` above adopted after a regex produced
 * a false positive. Returns, for every `IfcRelAggregates`, the express id of the
 * relating object and of each related object.
 *
 * IFC4 §5.1.3.3 / IFC2x3 IfcKernel: `IfcRelAggregates(RelatingObject,
 * RelatedObjects)` is the ONE relationship that decomposes site into buildings and
 * building into storeys.
 */
function aggregations(step: string): { relating: number; related: number[] }[] {
    const reopened = api.OpenModel(new TextEncoder().encode(step));
    openModels.push(reopened);
    const out: { relating: number; related: number[] }[] = [];
    const ids = api.GetLineIDsWithType(reopened, WEBIFC.IFCRELAGGREGATES);
    for (let i = 0; i < ids.size(); i += 1) {
        const line = api.GetLine(reopened, ids.get(i)) as {
            RelatingObject?: { value?: number };
            RelatedObjects?: { value?: number }[];
        };
        out.push({
            relating: line.RelatingObject?.value ?? -1,
            related: (line.RelatedObjects ?? []).map((r) => r?.value ?? -1),
        });
    }
    return out;
}

/** Express ids of every line of one type, via the parser. */
function idsOfType(step: string, type: number): number[] {
    const reopened = api.OpenModel(new TextEncoder().encode(step));
    openModels.push(reopened);
    const v = api.GetLineIDsWithType(reopened, type);
    const out: number[] = [];
    for (let i = 0; i < v.size(); i += 1) out.push(v.get(i));
    return out;
}

describe('ADR-0385 — each building is its own IfcBuilding, with its OWN storeys', () => {
    it('THE BACK-COMPAT ARM: an ungrouped model still emits exactly ONE IfcBuilding', () => {
        // ADR-0383 D3 / ADR-0385 §3. This is the guarantee the whole change is
        // built around, and it is stated as its own arm rather than left implied by
        // the two `IFCRELAGGREGATES === 4` arms above (which are preserved verbatim).
        const { step } = emit(model([el({ id: 'wall_1', ifcClass: 'IfcWall' })]));
        expect(countOf(step, 'IFCBUILDING')).toBe(1);
        expect(countOf(step, 'IFCBUILDINGSTOREY')).toBe(1);
        expect(countOf(step, 'IFCRELAGGREGATES')).toBe(3); // project->site, site->building, building->storey
    });

    it('THE PIN: an ungrouped storey GlobalId is byte-identical to the pre-ADR-0385 key', () => {
        // `storeyKey()` seeds `ifcGlobalId()`, and re-keying storeys by
        // (building, level) without preserving the default building's seed re-churns
        // every storey GlobalId in every existing project — the exact defect L-8501
        // fixed. The expected value is recomputed here from the OLD formula
        // (`storey:${levelId}`, no building anywhere in it), INDEPENDENTLY of the
        // production code path, so this cannot pass by agreeing with itself.
        const { step } = emit(model(
            [el({ id: 'wall_1', ifcClass: 'IfcWall', levelId: 'L0' })],
            [{ id: 'L0', name: 'Ground Floor', elevation: 0, height: 3 },
             { id: 'L1', name: 'First Floor', elevation: 3, height: 3 }],
        ));
        for (const levelId of ['L0', 'L1']) {
            const preAdr0385 = globalIdFromStableKey(`storey:${levelId}`);
            expect(step, `storey ${levelId} GlobalId churned`).toContain(preAdr0385);
        }
        // …and the slot itself is the bare levelId for the default building.
        expect(storeySlot(DEFAULT_BUILDING_ID, 'L0')).toBe('L0');
        expect(storeyKey(storeySlot(DEFAULT_BUILDING_ID, 'L0'))).toBe('storey:L0');
    });

    it('three blocks sharing PRYZM level ids emit 3 buildings and NINE storeys, not three', () => {
        // ⭐ ADR-0385 §3's headline case. Block A "Level 1" and Block B "Level 1" are
        // ONE PRYZM levelId and TWO IfcBuildingStorey entities. A `Map<levelId, …>`
        // collapses these to three storeys; the composite slot is what makes nine.
        const lv = (): ExportLevel[] => [
            { id: 'L1', name: 'Level 1', elevation: 0, height: 3 },
            { id: 'L2', name: 'Level 2', elevation: 3, height: 3 },
            { id: 'L3', name: 'Level 3', elevation: 6, height: 3 },
        ];
        const { step } = emit(multiBuildingModel([
            { id: 'block-a', name: 'Block A', levels: lv() },
            { id: 'block-b', name: 'Block B', levels: lv() },
            { id: 'block-c', name: 'Block C', levels: lv() },
        ]));

        expect(countOf(step, 'IFCBUILDING')).toBe(3);
        expect(countOf(step, 'IFCBUILDINGSTOREY')).toBe(9);
        for (const name of ['Block A', 'Block B', 'Block C']) expect(step).toContain(name);

        // Nine DISTINCT storey GlobalIds — a collision would mean two blocks share
        // an entity, which is the failure this composite key exists to prevent.
        const storeyGuids = new Set(
            [...step.matchAll(/=\s*IFCBUILDINGSTOREY\(\s*'([^']*)'/g)].map((m) => m[1]),
        );
        expect(storeyGuids.size).toBe(9);
    });

    it('every storey is aggregated under EXACTLY ONE building, and the site under all three', () => {
        const lv = (): ExportLevel[] => [
            { id: 'L1', name: 'Level 1', elevation: 0, height: 3 },
            { id: 'L2', name: 'Level 2', elevation: 3, height: 3 },
        ];
        const { step } = emit(multiBuildingModel([
            { id: 'block-a', name: 'Block A', levels: lv() },
            { id: 'block-b', name: 'Block B', levels: lv() },
            { id: 'block-c', name: 'Block C', levels: lv() },
        ]));

        const buildings = new Set(idsOfType(step, WEBIFC.IFCBUILDING));
        const storeys = new Set(idsOfType(step, WEBIFC.IFCBUILDINGSTOREY));
        const sites = idsOfType(step, WEBIFC.IFCSITE);
        expect(buildings.size).toBe(3);
        expect(storeys.size).toBe(6);
        expect(sites).toHaveLength(1);

        const aggs = aggregations(step);

        // site -> all three buildings, in ONE relationship (IFC4 §5.1.2.5).
        const siteAgg = aggs.filter((a) => a.relating === sites[0]);
        expect(siteAgg).toHaveLength(1);
        expect(new Set(siteAgg[0]!.related)).toEqual(buildings);

        // Each building aggregates its OWN two storeys…
        const owners = new Map<number, number[]>();
        for (const a of aggs) {
            if (!buildings.has(a.relating)) continue;
            expect(a.related, 'a building must own exactly its own storeys').toHaveLength(2);
            for (const s of a.related) {
                owners.set(s, [...(owners.get(s) ?? []), a.relating]);
            }
        }
        // …and every storey has exactly one owner. Three of three, never one of six.
        expect(owners.size).toBe(6);
        for (const [storey, os] of owners) {
            expect(storeys.has(storey), 'aggregated a non-storey').toBe(true);
            expect(os, `storey ${storey} is owned by ${os.length} buildings`).toHaveLength(1);
        }
    });

    it('an element lands in the storey OF ITS OWN BUILDING, not the first one with that levelId', () => {
        // The containment half. Two blocks both have "L1"; a wall stamped with
        // block-b must be contained by block-b's L1 storey.
        const lv = (): ExportLevel[] => [{ id: 'L1', name: 'Level 1', elevation: 0, height: 3 }];
        const { step, diagnostics } = emit(multiBuildingModel(
            [
                { id: 'block-a', name: 'Block A', levels: lv() },
                { id: 'block-b', name: 'Block B', levels: lv() },
            ],
            [
                el({ id: 'wall_a', ifcClass: 'IfcWall', levelId: 'L1', buildingId: 'block-a' }),
                el({ id: 'wall_b', ifcClass: 'IfcWall', levelId: 'L1', buildingId: 'block-b' }),
            ],
        ));

        // No element was relocated: two storeys, two containments, no diagnostics.
        expect(diagnostics.all()).toEqual([]);
        expect(countOf(step, 'IFCRELCONTAINEDINSPATIALSTRUCTURE')).toBe(2);

        const reopened = api.OpenModel(new TextEncoder().encode(step));
        openModels.push(reopened);
        const buildings = idsOfType(step, WEBIFC.IFCBUILDING);
        const nameOf = (id: number) =>
            String((api.GetLine(reopened, id) as { Name?: { value?: string } }).Name?.value ?? '');

        // storey -> owning building name, from the aggregations.
        const storeyOwner = new Map<number, string>();
        for (const a of aggregations(step)) {
            if (!buildings.includes(a.relating)) continue;
            for (const s of a.related) storeyOwner.set(s, nameOf(a.relating));
        }

        // element -> containing storey, from IfcRelContainedInSpatialStructure.
        const contained = api.GetLineIDsWithType(reopened, WEBIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE);
        const seen = new Map<string, string>();
        for (let i = 0; i < contained.size(); i += 1) {
            const rel = api.GetLine(reopened, contained.get(i)) as {
                RelatedElements?: { value?: number }[];
                RelatingStructure?: { value?: number };
            };
            const storey = rel.RelatingStructure?.value ?? -1;
            for (const e of rel.RelatedElements ?? []) {
                seen.set(nameOf(e.value ?? -1), storeyOwner.get(storey) ?? '(no owning building)');
            }
        }
        expect(seen.get('wall_a')).toBe('Block A');
        expect(seen.get('wall_b')).toBe('Block B');
    });
});

// ── ADR-0385: the containment JOIN, and its honesty ─────────────────────────

describe('ADR-0385 — applyBuildingContainment reads the ONE authority, and reports what it cannot answer', () => {
    /** A model shaped like a real read: three PRYZM levels, no buildings stamped. */
    const threeLevels = (): IntermediateModel => model(
        [
            el({ id: 'wall_1', ifcClass: 'IfcWall', levelId: 'L1' }),
            el({ id: 'wall_2', ifcClass: 'IfcWall', levelId: 'L2' }),
        ],
        [
            { id: 'L1', name: 'Level 1', elevation: 0, height: 3 },
            { id: 'L2', name: 'Level 2', elevation: 3, height: 3 },
        ],
    );

    const hs = () => new HierarchyStore();
    const node = (over: Record<string, unknown>) => ({
        code: undefined, description: undefined, templateId: undefined,
        plannedData: { customProperties: {} }, syncState: 'no-template',
        metadata: { createdAt: 0, modifiedAt: 0, createdBy: 't', version: 1 },
        ...over,
    }) as never;

    it('AN EMPTY STORE IS AN EMPTINESS: one default building, and NO diagnostic', () => {
        // The overwhelmingly common case, and the D3 guarantee. Nothing is wrong
        // here, so nothing may be reported as wrong.
        const m = threeLevels();
        const diagnostics = new ExportDiagnostics();
        const report = applyBuildingContainment(m, diagnostics, readBuildingSubstrate(hs()));
        expect(report.buildingCount).toBe(1);
        expect(m.buildings).toEqual([{ id: DEFAULT_BUILDING_ID, name: 'Default Building' }]);
        expect(m.levels.every((l) => l.buildingId === undefined)).toBe(true);
        expect(diagnostics.all()).toEqual([]);
    });

    it('AN UNREADABLE STORE IS A FAILURE: same one building, but a diagnostic PER LEVEL', () => {
        // ⛔ §CONTEXT-DATA-HONESTY (L-581/L-616). This is the arm that matters: the
        // FILE looks identical to the empty-store case above — it must, or the
        // export would be lost — and the two are told apart by the diagnostics, not
        // by the geometry. If these two arms ever produce the same diagnostics, a
        // failure is being reported as an emptiness.
        const m = threeLevels();
        const diagnostics = new ExportDiagnostics();
        const report = applyBuildingContainment(m, diagnostics, UNREADABLE_SUBSTRATE);
        expect(report.buildingCount).toBe(1);
        expect(report.unresolvedLevels).toHaveLength(2);
        expect(diagnostics.count('UNRESOLVED_BUILDING')).toBe(2);
        expect(report.unresolvedLevels[0]!.why).toContain('unreadable');
    });

    it('a store with two buildings splits the levels between them', () => {
        const store = hs();
        store.add(node({ id: 'site-1', type: 'site', name: 'Site' }));
        store.add(node({ id: 'b-a', type: 'building', name: 'Block A', siteId: 'site-1' }));
        store.add(node({ id: 'b-b', type: 'building', name: 'Block B', siteId: 'site-1' }));
        store.add(node({ id: 'hl-1', type: 'level', name: 'A/L1', buildingId: 'b-a', bimLevelId: 'L1' }));
        store.add(node({ id: 'hl-2', type: 'level', name: 'B/L2', buildingId: 'b-b', bimLevelId: 'L2' }));

        const m = threeLevels();
        const diagnostics = new ExportDiagnostics();
        const report = applyBuildingContainment(m, diagnostics, readBuildingSubstrate(store));

        expect(report.buildingCount).toBe(2);
        expect(m.buildings.map((b) => b.name).sort()).toEqual(['Block A', 'Block B']);
        expect(m.levels.find((l) => l.id === 'L1')!.buildingId).toBe('b-a');
        expect(m.levels.find((l) => l.id === 'L2')!.buildingId).toBe('b-b');
        // …and the elements follow their levels.
        expect(m.elements.find((e) => e.id === 'wall_1')!.buildingId).toBe('b-a');
        expect(m.elements.find((e) => e.id === 'wall_2')!.buildingId).toBe('b-b');
        expect(diagnostics.all()).toEqual([]);
    });

    it('A DANGLING buildingId is unknown, NOT a quietly-defaulted level', () => {
        const store = hs();
        store.add(node({ id: 'hl-1', type: 'level', name: 'A/L1', buildingId: 'ghost', bimLevelId: 'L1' }));
        const m = threeLevels();
        const diagnostics = new ExportDiagnostics();
        const report = applyBuildingContainment(m, diagnostics, readBuildingSubstrate(store));
        expect(report.unresolvedLevels).toHaveLength(1);
        expect(report.unresolvedLevels[0]!.levelId).toBe('L1');
        expect(report.unresolvedLevels[0]!.why).toContain('resolves to no building');
        expect(diagnostics.count('UNRESOLVED_BUILDING')).toBe(1);
    });

    it('TWO buildings claiming one bimLevelId is unknown — the element is unroutable and says so', () => {
        // ADR-0385 §4's named gap. The two STOREYS are fine; it is the ELEMENT that
        // cannot be routed, because no element schema carries a building axis.
        // Arbitrating between the two would be the "answer confidently and be wrong"
        // failure C84 §9 records.
        const store = hs();
        store.add(node({ id: 'b-a', type: 'building', name: 'Block A', siteId: 's' }));
        store.add(node({ id: 'b-b', type: 'building', name: 'Block B', siteId: 's' }));
        store.add(node({ id: 'hl-1', type: 'level', name: 'A/L1', buildingId: 'b-a', bimLevelId: 'L1' }));
        store.add(node({ id: 'hl-2', type: 'level', name: 'B/L1', buildingId: 'b-b', bimLevelId: 'L1' }));

        const m = threeLevels();
        const diagnostics = new ExportDiagnostics();
        const report = applyBuildingContainment(m, diagnostics, readBuildingSubstrate(store));
        const bad = report.unresolvedLevels.find((u) => u.levelId === 'L1');
        expect(bad, 'the ambiguous level was silently resolved').toBeDefined();
        expect(bad!.why).toContain('claimed by 2 buildings');
        expect(diagnostics.count('UNRESOLVED_BUILDING')).toBeGreaterThan(0);
    });

    it('a building owning NO exported storey is reported, never written as an empty container', () => {
        const store = hs();
        store.add(node({ id: 'b-a', type: 'building', name: 'Block A', siteId: 's' }));
        store.add(node({ id: 'b-z', type: 'building', name: 'Block Z', siteId: 's' }));
        store.add(node({ id: 'hl-1', type: 'level', name: 'A/L1', buildingId: 'b-a', bimLevelId: 'L1' }));
        store.add(node({ id: 'hl-2', type: 'level', name: 'A/L2', buildingId: 'b-a', bimLevelId: 'L2' }));

        const m = threeLevels();
        const diagnostics = new ExportDiagnostics();
        const report = applyBuildingContainment(m, diagnostics, readBuildingSubstrate(store));
        expect(report.buildingCount).toBe(1);
        expect(report.unusedBuildingIds).toEqual(['b-z']);
        expect(diagnostics.count('UNRESOLVED_BUILDING')).toBe(1);
    });

    it('is IDEMPOTENT — containment is re-derived, never accumulated (ADR-0328 discipline)', () => {
        const store = hs();
        store.add(node({ id: 'b-a', type: 'building', name: 'Block A', siteId: 's' }));
        store.add(node({ id: 'hl-1', type: 'level', name: 'A/L1', buildingId: 'b-a', bimLevelId: 'L1' }));
        const m = threeLevels();
        applyBuildingContainment(m, undefined, readBuildingSubstrate(store));
        const first = JSON.stringify({ b: m.buildings, l: m.levels.map((l) => l.buildingId) });
        applyBuildingContainment(m, undefined, readBuildingSubstrate(store));
        applyBuildingContainment(m, undefined, readBuildingSubstrate(store));
        expect(JSON.stringify({ b: m.buildings, l: m.levels.map((l) => l.buildingId) })).toBe(first);
    });
});
