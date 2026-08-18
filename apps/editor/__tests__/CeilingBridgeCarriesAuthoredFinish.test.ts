/**
 * §FIX-CEILING-BRIDGE-FINISH (L-973 · C84 EI-2a "named-subset re-emit" · C79 §7.4)
 *
 * ─── THE DEFECT ─────────────────────────────────────────────────────────────
 * The §P3.2-CL `ceiling.created` bridge hardcoded the ENTIRE finish
 * specification of every bus-created ceiling:
 *
 *   label: 'Ceiling'   ceilingNumber: ''   baseOffset: 0
 *   finishSpec: { soffitColor: '#F5F5F0', soffitPattern: 'none', exposedStructure: false }
 *
 * `materialId` and `materialColor` ARE on the L0 `Ceiling` schema
 * (`Ceiling.ts:54-55`) and ARE accepted by `CreateCeilingHandler`, but
 * `CommandEventBridge` listed neither, so an authored ceiling finish was
 * destroyed in flight and the bridge wrote a constant over it.
 *
 * The divergence is measurable against the OTHER creation path:
 * `CreateCeilingCommand.ts:175` writes `soffitColor: roomMaterialColor ??
 * '#F5F5F0'` and `:188` names ceilings `Ceiling-01`, `Ceiling-02`, … — so the
 * same ceiling drawn through the legacy 3-D path carried its colour and a unique
 * label, while every bus-created ceiling was grey and called "Ceiling".
 * `CeilingColourSystem.ts:38` reads `finishSpec.soffitColor` to colour the mesh.
 *
 * ─── WHY THE ASSERTIONS READ THE STORE ──────────────────────────────────────
 * Per §committed-is-not-reachable each arm drives the REAL
 * `wireCommandEventBridge`, feeds its event to THE `ceilingCreatedMirror` that
 * `initTools.ts` calls, and reads the value back out of a real `CeilingStore`.
 */

import { describe, it, expect } from 'vitest';
import { CeilingStore } from '@pryzm/core-app-model';
import { ceilingRecordFromCreatedEvent } from '../src/engine/ceilingCreatedMirror';

const LEVEL_ID = 'L0';
let _seq = 0;
const nextCeilingId = (): string => `ceiling-finish-probe-${++_seq}`;

const RECT = [
    { x: 0, y: 0, z: 0 },
    { x: 4, y: 0, z: 0 },
    { x: 4, y: 0, z: 3 },
    { x: 0, y: 0, z: 3 },
];

/** Drive the REAL `CommandEventBridge` and hand back the `ceiling.created`
 *  payload. Imported from source, not the barrel: `@pryzm/runtime-composer`'s
 *  index transitively pulls `pdfjs-dist`, which touches `DOMMatrix` at module
 *  scope. */
async function ceilingCreatedEventFor(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { wireCommandEventBridge } = await import(
        '../../../packages/runtime-composer/src/CommandEventBridge'
    );
    let ev: Record<string, unknown> | undefined;
    let emit!: (bytes: unknown, record: unknown) => void;
    const patches = { subscribe: (cb: (b: unknown, r: unknown) => void) => { emit = cb; return () => {}; } };
    const events = {
        emit: (name: string, p: unknown) => { if (name === 'ceiling.created') ev = p as Record<string, unknown>; },
    };
    wireCommandEventBridge(patches as never, events as never);
    emit(new Uint8Array(), {
        id: 'evt-ceiling-finish', type: 'ceiling.create', payload,
        affectedStores: ['ceiling'], audit: { actorId: 'probe' }, forward: [],
    });
    if (!ev) throw new Error('CommandEventBridge emitted no ceiling.created for a ceiling.create record');
    return ev;
}

/** The full hop: bus record → real CEB → the §P3.2-CL mirror → a real
 *  `CeilingStore`. `store` is supplied so ordinal-dependent arms can share one. */
async function storedCeiling(
    extra: Record<string, unknown> = {},
    store: InstanceType<typeof CeilingStore> = new CeilingStore(),
): Promise<Record<string, unknown>> {
    const id = nextCeilingId();
    const ev = await ceilingCreatedEventFor({ id, levelId: LEVEL_ID, boundary: RECT, ceilingHeight: 2.7, ...extra });
    const record = ceilingRecordFromCreatedEvent(ev as never, { existingCeilingCount: store.getAll().length });
    expect(record, 'a well-formed ceiling.create must not be refused').not.toBeNull();
    store.add(record as never);
    const stored = store.getById(id);
    expect(stored, 'the mirrored ceiling must reach the CeilingStore').toBeDefined();
    return stored as unknown as Record<string, unknown>;
}

describe('§FIX-CEILING-BRIDGE-FINISH — an authored ceiling finish survives to the store', () => {
    it('MECHANISM — `ceiling.created` must list `materialColor` and `materialId`, not only the geometry it already carried', async () => {
        const ev = await ceilingCreatedEventFor({
            id: nextCeilingId(), levelId: LEVEL_ID, boundary: RECT,
            ceilingHeight: 2.7, thickness: 0.03,
            materialColor: '#3A5F8A', materialId: 'mat-acoustic-tile',
        });
        // Positive control on the SAME object: a field that WAS on the emit list.
        expect(ev['thickness'], 'thickness was always carried').toBe(0.03);
        expect(
            ev['materialColor'],
            'materialColor is on the L0 Ceiling schema and accepted by CreateCeilingHandler — CEB dropped it',
        ).toBe('#3A5F8A');
        expect(ev['materialId']).toBe('mat-acoustic-tile');
    });

    it('ARM 1 — an authored soffit colour reaches finishSpec.soffitColor instead of the hardcoded #F5F5F0', async () => {
        const stored = await storedCeiling({ materialColor: '#3A5F8A' });
        const finish = stored['finishSpec'] as Record<string, unknown>;
        expect(finish['soffitColor']).toBe('#3A5F8A');
        expect(finish['soffitColor'], 'the literal must not survive').not.toBe('#F5F5F0');
    });

    it('ARM 2 — an authored materialId reaches finishSpec.soffitMaterialId, the slot CeilingFinishSpec already has', async () => {
        const stored = await storedCeiling({ materialId: 'mat-acoustic-tile' });
        const finish = stored['finishSpec'] as Record<string, unknown>;
        expect(finish['soffitMaterialId']).toBe('mat-acoustic-tile');
        expect(finish['soffitMaterialId']).not.toBeUndefined();
    });

    it('ARM 3 — successive ceilings get DISTINCT labels, as CreateCeilingCommand:188 gives them', async () => {
        const store = new CeilingStore();
        const first = await storedCeiling({}, store);
        const second = await storedCeiling({}, store);
        expect(first['label']).toBe('Ceiling-01');
        expect(second['label']).toBe('Ceiling-02');
        expect(
            second['label'],
            'every bus-created ceiling was called "Ceiling" while the legacy path numbered them',
        ).not.toBe(first['label']);
    });

    it('CONTROL — with nothing authored, the SAME expressions still yield the documented defaults', async () => {
        const stored = await storedCeiling({ thickness: 0.03 });
        const finish = stored['finishSpec'] as Record<string, unknown>;
        expect(finish['soffitColor'], 'unstated colour is still #F5F5F0').toBe('#F5F5F0');
        expect(finish['soffitMaterialId'], 'unstated material leaves the slot empty, not blank-stringed').toBeUndefined();
        expect(finish['soffitPattern']).toBe('none');
        expect(finish['exposedStructure']).toBe(false);
        // The geometry the bridge always carried must be untouched by this change.
        const boundary = stored['boundary'] as Record<string, unknown>;
        expect(boundary['height']).toBe(2.7);
        expect(boundary['thickness']).toBe(0.03);
        expect(boundary['baseOffset']).toBe(0);
        expect((boundary['polygon'] as unknown[]).length).toBe(4);
        expect((boundary['polygon'] as Array<Record<string, number>>)[1]).toEqual({ x: 4, z: 0 });
        expect(stored['levelId']).toBe(LEVEL_ID);
    });
});
