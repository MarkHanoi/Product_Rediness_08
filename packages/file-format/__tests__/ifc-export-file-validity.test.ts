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
