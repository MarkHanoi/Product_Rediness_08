/**
 * @vitest-environment happy-dom
 */
// componentDefinitionTravelsWithProject — §82.7-DEFINITIONS-TRAVEL-WITH-PROJECT.
// STR-UCE-MASTER-SPEC §82.7 · C111 §4.3-a/b · C47 · C16 CA-21 · UCE-REACHABILITY-AUDIT
// A14 / rank 2 ("an authored component dies on F5").
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐⭐ THE FOUNDER'S 82.7: "Author, reload, the family is still in the catalogue and
//     its instances still resolve." — through the REAL serializer, the REAL loader
//     leg and the REAL catalogue, across the JSON boundary a save to disk crosses.
// ═══════════════════════════════════════════════════════════════════════════════
//
// `componentJoinThroughComposedRuntime.test.ts` ARM G proves the OCCURRENCE survives
// a save → reload. It could not prove the DEFINITION does, because nothing wrote it:
// the catalogue was process-lifetime and its header said so. This file proves the
// other half and the JOIN between them — after the round trip, a verb that the
// resolver gates (`component.setInstanceParameter` refuses an unknown definitionId
// BY NAME) dispatches against the RESTORED definition.
//
// ─── WHAT THIS FILE DOES NOT PROVE — stated ────────────────────────────────────
//  1. That `ProjectLoader.load()` calls the restore in the browser. Grep-asserted in
//     ARM F (the lift test's D-1 idiom); NOT browser-verified this lane.
//  2. That an UNSAVED workspace draft survives — it does not, by design; `save()`
//     is what registers bytes with the catalogue.

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { composeRuntime } from '@pryzm/runtime-composer';
import { packFamily, type FamilyDocument, type FamilyManifest } from '@pryzm/file-format';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';
import { componentCatalog } from '../src/services/componentCatalog/index.js';
import { ProjectSerializer } from '../src/engine/persistence/ProjectSerializer';
import { restoreCompoundFamilies } from '../src/engine/persistence/restoreCompoundFamilies';
import {
    restoreComponentDefinitions,
    serializeComponentDefinitions,
} from '../src/engine/persistence/restoreComponentDefinitions';

const AUDIT = { actorId: 'component-def-persist', projectId: 'component-def-persist', clientId: 'node' } as const;
const BUDGET = 600_000;
const LEVEL_ID = 'level-1';

const ULID_STEM = '01BXZ3NDEKTSV4RRFFQ69G5P';
function ulidN(n: number): string {
    const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    return ULID_STEM + A[Math.floor(n / 32) % 32] + A[n % 32];
}
const DEF_ID = `fam_${ulidN(1)}`;
const TYPE_A = `typ_${ulidN(2)}`;
const PARAM_WIDTH = `par_${ulidN(4)}`;
const COMPONENT_ID = `component_${ulidN(9)}`;

/* eslint-disable @typescript-eslint/no-explicit-any */
let rt: any;
let fixtureBytes: Uint8Array;
let fixtureHash = '';

function store(): any {
    const s = (rt.stores as Record<string, unknown>)['component'];
    if (s === undefined) throw new Error('[test] runtime.stores.component missing on the REAL composed runtime.');
    return s;
}
function wipe(): void {
    const ids = [...store().getState().keys()];
    if (ids.length > 0) store().applyPatch(ids.map((id: string) => ({ op: 'remove', path: [id] })));
}
function sentinel(): any {
    return {
        getAll: () => [], getLevels: () => [], isBuiltIn: () => true, getCustom: () => [],
        size: () => 0, serialize: () => ({}), getState: () => new Map(), activeLevelId: LEVEL_ID,
    };
}
function serializerBundle(): any {
    const b: any = {};
    for (const k of [
        'wallStore', 'slabStore', 'columnStore', 'gridStore', 'stairStore', 'beamStore',
        'curtainWallStore', 'roofStore', 'plumbingStore', 'furnitureStore', 'handrailStore',
        'openingStore', 'roomStore', 'ceilingStore', 'floorStore',
        'slabSystemTypeStore', 'wallSystemTypeStore', 'ceilingSystemTypeStore',
        'floorSystemTypeStore', 'doorSystemTypeStore', 'windowSystemTypeStore',
        'handrailTypeStore', 'roomBoundingLineStore', 'curtainPanelStore',
    ]) b[k] = sentinel();
    return b;
}
function save(): any {
    return JSON.parse(ProjectSerializer.stringify(
        ProjectSerializer.serialize(serializerBundle(), null as any, { projectName: 'component-def-persist' }),
    ));
}

async function packFixture(): Promise<Uint8Array> {
    const document: FamilyDocument = {
        formatVersion: '1.1',
        referencePlanes: [],
        parameters: [
            { id: PARAM_WIDTH, name: 'Width', kind: 'instance', dataType: 'length', defaultValue: 900, expression: null, ifcMapping: null, exposed: true },
        ],
        profiles: [], solids: [], materialSlots: [],
        types: [
            { id: TYPE_A, name: 'S-900', values: {}, checksum: 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a' },
        ],
        representations: [], connectors: [], propertySets: [], featureEdges: [],
    } as unknown as FamilyDocument;
    const manifest: FamilyManifest = {
        formatVersion: '1.1', id: DEF_ID, name: 'PersistFixtureShelf', semver: '1.0.0',
        author: { id: 'usr_01HZ00000000000000000ASR01', displayName: 'lane-82-7' },
        description: 'componentDefinitionTravelsWithProject fixture', ifcEntity: 'IfcFurniture', category: 'Furniture', tags: [],
        minPRYZMVersion: '2.0.0',
        schemaHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
        createdAt: '2026-09-05T00:00:00.000Z', lastModifiedAt: '2026-09-05T00:00:00.000Z',
    } as unknown as FamilyManifest;
    const packed = await packFamily({ manifest, document });
    if (!packed.ok) throw new Error(`[test] packFamily failed: ${(packed as { message?: string }).message}`);
    return packed.bytes;
}

const PLACE = {
    componentId: COMPONENT_ID, levelId: LEVEL_ID, definitionId: DEF_ID, typeId: TYPE_A,
    origin: { x: 2, y: 0, z: 3 }, rotation: 0,
};

beforeAll(async () => {
    rt = await composeRuntime({ audit: AUDIT, canvas: null, bootstrapFn: bootstrapWithEverything as never });
    (window as unknown as { runtime: unknown }).runtime = rt;
    componentCatalog.clear();
    fixtureBytes = await packFixture();
    const loaded = await componentCatalog.loadFromBytes(fixtureBytes, { provenance: 'project' });
    if (!loaded.ok) throw new Error(`[test] catalogue load failed: ${loaded.message}`);
    fixtureHash = loaded.entry.family.schemaHash;
}, BUDGET);

afterAll(() => {
    componentCatalog.clear();
    rt?.dispose?.();
});

describe('§82.7 — the component DEFINITION travels with the project, and its instances still resolve after reload', () => {

    it('ARM A — SAVE writes the definition set: exact envelope bytes, keyed (definitionId, schemaHash) — C111 §4.3-b', async () => {
        wipe();
        await rt.bus.executeCommand('component.place', PLACE);
        const saved = save();

        expect(saved.components, 'the occurrence is in the file (ARM G of the join suite)').toHaveLength(1);
        expect(saved.componentDefinitions, '⭐ the DEFINITION is in the file — the half that was never written').toHaveLength(1);
        const row = saved.componentDefinitions[0];
        expect(row.definitionId).toBe(DEF_ID);
        expect(row.schemaHash, 'content address, not id alone').toBe(fixtureHash);
        expect(row.schemaHash).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(row.provenance).toBe('project');
        expect(row.name).toBe('PersistFixtureShelf');
        // The bytes are the ENVELOPE, opaque and exact — decode and compare byte-for-byte.
        const back = new Uint8Array(Buffer.from(row.bytesBase64, 'base64'));
        expect(back.length).toBe(fixtureBytes.length);
        expect(Buffer.compare(Buffer.from(back), Buffer.from(fixtureBytes))).toBe(0);
        // No parsed document rides along — the snapshot holds no second schema.
        expect(row.document).toBeUndefined();
        expect(row.manifest).toBeUndefined();
    }, BUDGET);

    it('ARM B — ⭐⭐ RELOAD: catalogue EMPTIED (F5), definitions restored FIRST, occurrences restored, and the gated verb DISPATCHES against the restored definition', async () => {
        wipe();
        await rt.bus.executeCommand('component.place', PLACE);
        const saved = save();

        // ── F5 ──────────────────────────────────────────────────────────────────
        componentCatalog.clear();
        wipe();
        expect(componentCatalog.has(DEF_ID), 'the process-lifetime catalogue is EMPTY — this is the defect').toBe(false);
        expect(store().getState().size).toBe(0);

        // ── the loader's common tail, in its order: definitions, then records ──
        const defs = await restoreComponentDefinitions(saved);
        expect(defs.errors).toEqual([]);
        expect(defs.restored).toEqual([DEF_ID]);
        expect(componentCatalog.has(DEF_ID), 'THE FAMILY IS STILL IN THE CATALOGUE').toBe(true);
        expect(componentCatalog.entry(DEF_ID)!.family.schemaHash, 'same content address').toBe(fixtureHash);
        expect(componentCatalog.view(DEF_ID)!.provenance).toBe('project');

        const compound = restoreCompoundFamilies(saved);
        expect(compound.errors).toEqual([]);
        expect(compound.restored['component']).toBe(1);

        // ⭐ THE ACCEPTANCE — "its instances still resolve". `setInstanceParameter`
        // asks the resolver whether DEF_ID declares PARAM_WIDTH as an instance
        // parameter; on an empty catalogue it REFUSES by name. It must now dispatch,
        // and the override must be read back OUT OF THE AUTHORITATIVE STORE (CA-21).
        await expect(rt.bus.executeCommand('component.setInstanceParameter', {
            componentId: COMPONENT_ID, parameterId: PARAM_WIDTH, value: 1200,
        })).resolves.toBeDefined();
        const rec = store().getState().get(COMPONENT_ID);
        expect(rec.instanceParameters[PARAM_WIDTH]).toBe(1200);
    }, BUDGET);

    it('ARM C — NEGATIVE CONTROL: on the EMPTY catalogue the same verb REFUSES by name (so ARM B\'s green is the restore, not a lenient verb)', async () => {
        wipe();
        await rt.bus.executeCommand('component.place', PLACE);
        const saved = save();
        componentCatalog.clear();
        wipe();
        restoreCompoundFamilies(saved); // records back, definitions NOT
        await expect(rt.bus.executeCommand('component.setInstanceParameter', {
            componentId: COMPONENT_ID, parameterId: PARAM_WIDTH, value: 1200,
        })).rejects.toThrow(new RegExp(DEF_ID));
        // Restore the fixture for the arms that follow.
        await restoreComponentDefinitions(saved);
        expect(componentCatalog.has(DEF_ID)).toBe(true);
    }, BUDGET);

    it('ARM D — a TAMPERED row (schemaHash ≠ bytes) is REFUSED with BOTH hashes and NOT registered (C111 §4.3-b)', async () => {
        const saved = save();
        expect(saved.componentDefinitions).toHaveLength(1);
        const forged = {
            ...saved,
            componentDefinitions: [{ ...saved.componentDefinitions[0], schemaHash: 'sha256:' + 'f'.repeat(64) }],
        };
        const res = await restoreComponentDefinitions(forged);
        expect(res.restored).toEqual([]);
        expect(res.errors).toHaveLength(1);
        expect(res.errors[0]).toMatch(new RegExp(DEF_ID));
        expect(res.errors[0]).toContain('sha256:' + 'f'.repeat(64));
        expect(res.errors[0]).toContain(fixtureHash);
        expect(res.errors[0]).toMatch(/NOT registered/);
        expect(componentCatalog.has(DEF_ID), 'refused means refused').toBe(false);
        // A row whose bytes name a DIFFERENT manifest id is refused by the loader's expectId.
        const wrongId = {
            componentDefinitions: [{ ...saved.componentDefinitions[0], definitionId: `fam_${ulidN(30)}` }],
        };
        const res2 = await restoreComponentDefinitions(wrongId);
        expect(res2.restored).toEqual([]);
        expect(res2.errors[0]).toMatch(/identity-mismatch/);
        // Put the fixture back.
        await restoreComponentDefinitions(saved);
    }, BUDGET);

    it('ARM E — NEGATIVE CONTROL for ARM A: an EMPTY catalogue writes NO `componentDefinitions` key (C47 omit-when-absent)', async () => {
        wipe();
        const bytes = componentCatalog.entry(DEF_ID)!.bytes;
        componentCatalog.clear();
        const saved = save();
        expect(saved.componentDefinitions).toBeUndefined();
        expect(serializeComponentDefinitions()).toEqual([]);
        const res = await restoreComponentDefinitions(saved);
        expect(res.total).toBe(0);
        await componentCatalog.loadFromBytes(bytes, { provenance: 'project' });
    }, BUDGET);

    it('ARM F — the REAL loader awaits the restore BEFORE the occurrence restore, in the common tail (grep-asserted; NOT browser-verified)', () => {
        const src = readFileSync(resolve(__dirname, '../src/engine/persistence/ProjectLoader.ts'), 'utf8');
        const defsAt = src.indexOf('await restoreComponentDefinitions(snapshot)');
        const compoundAt = src.indexOf('restoreCompoundFamilies(snapshot)');
        expect(defsAt, 'the definition restore is called').toBeGreaterThan(0);
        expect(compoundAt).toBeGreaterThan(0);
        expect(defsAt, 'DEFINITIONS BEFORE OCCURRENCES').toBeLessThan(compoundAt);
        const ser = readFileSync(resolve(__dirname, '../src/engine/persistence/ProjectSerializer.ts'), 'utf8');
        expect(ser).toMatch(/componentDefinitions:\s*componentDefinitions\.length \? componentDefinitions : undefined/);
    });
});
