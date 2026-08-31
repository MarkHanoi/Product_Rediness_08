/**
 * §FIX-CEB-READ-THE-COMMIT (lane W4fg) — READ-BACK PROBES for the four defects
 * wave 4f/4g found in the bus→legacy-store creation chain.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⛔ WHAT THREE OF THE FOUR HAVE IN COMMON, AND WHY IT IS ONE SENTENCE.
 * ═══════════════════════════════════════════════════════════════════════════════
 * `CommandEventBridge` relays a NAMED SUBSET of `record.payload` — the REQUEST —
 * while the handler's own normalisation (alias folding, defaults, and above all
 * the id it MINTS when the payload omits one) lives in `record.forward`, the
 * COMMIT. Wall is the only family already immune, and only because it happens to
 * index the committed patch and take its id from there. Everywhere else, a
 * dispatcher that omits a field the handler is allowed to supply gets a COMMITTED
 * element and NO event: the command reports success, the plugin store holds the
 * element, and no mesh, plan symbol or snapshot row ever exists for it.
 *
 * ⭐ ONE OF THE FOUR IS NOT A REACHABILITY DEFECT AT ALL. The roof arm below
 * proves `materialId` / `materialColor` surviving the bridge. The roof always
 * DREW — `renders_3d` read YES throughout — it drew in the DEFAULT finish rather
 * than the one the user chose. No milestone in the seven-fact chain asks that
 * question, which is why it survived every audit that did.
 *
 * ⭐ AND ONE OF THE FOUR IS A REFUTATION. The beam arm's finding is that the
 * bridge was RIGHT not to follow the commit: the phantom belonged to the
 * dispatch, not the relay. See §FIX-BEAM-PHANTOM-TELEMETRY below.
 *
 * VERIFY AT THE OUTCOME, NOT AT THE SEAM: every arm reads a record back out of a
 * real store, or reads the event a real `CommandEventBridge` really emitted.
 * `success === true` is never asserted on its own.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ PROPOSED — THE EIGHTH FACT: `renders_faithfully`.
 * ═══════════════════════════════════════════════════════════════════════════════
 * The seven-fact chain (authored · dispatchable · reachable · renders_3d ·
 * renders_plan · persists · exports) is a REACHABILITY chain end to end. Every one
 * of its questions is answered by the existence of an artefact. None of them is
 * answered by that artefact's CONTENT. §FIX-ROOF-CEB-MATERIAL is the receipt: the
 * roof family read 7/7 while the bridge discarded the user's material choice on
 * every hop, because "something drew" satisfies `renders_3d` and "the thing the
 * user asked for drew" is a question the chain never asks.
 *
 * WHAT IT MEASURES — for one family, over a NAMED set of user-authored fields:
 *   for every field F in AUTHORED_FIELDS(family):
 *     dispatch create with F = a distinguishable, non-default value V
 *     read F back off the LEGACY render record (the one the fragment builder, the
 *     plan projector, the IFC exporter and ProjectSerializer share)
 *     require: readback(F) ≡ V under the family's declared translation for F
 *   the fact is YES only when the set is non-empty AND every member holds.
 *
 * THE THREE PARTS THAT MAKE IT FALSIFIABLE, none of which is optional:
 *   1. AUTHORED_FIELDS IS A DECLARED LIST, NOT AN INFERRED ONE. It is the fields a
 *      user or an AI can state that the element is expected to WEAR — material,
 *      finish, type/system id, section, per-family geometry qualifiers. Inferring
 *      it from the schema would re-admit the defect: `materialId` is `.optional()`
 *      on both sides, so a schema walk cannot tell "the user stated nothing" from
 *      "the hop dropped it". Undeclared ⇒ unmeasured ⇒ the family cannot read YES.
 *   2. V MUST BE DISTINGUISHABLE FROM THE DEFAULT. `materialColor: undefined`
 *      reaching a store whose default is `undefined` is the failure-and-emptiness
 *      collision: the probe would pass against a hop that copies nothing. Every V
 *      is chosen to differ from the field's default AND from its neighbours' — the
 *      scramble control that `CONTROL — an UNSTATED finish stays unstated` below
 *      is the other half of.
 *   3. THE READBACK IS THE LEGACY RENDER RECORD, NEVER THE PLUGIN DTO STORE. The
 *      plugin store is where the handler wrote; asserting there proves the handler,
 *      which was never the defective hop. Every one of the four defects in this
 *      file sits BETWEEN the plugin store and the render record.
 *
 * HOW IT IS PROVEN — the shape this file already is, generalised. A gate
 * (`tools/ga-gate/check-render-fidelity.ts`, unwritten) drives one create per
 * family through the REAL `CommandEventBridge` and the REAL `*CreatedMirror`, then
 * diffs the declared field set against the legacy record. Its ledger is
 * shrink-only and three-valued per family: HOLDS · DROPS(field, …) · UNDECLARED.
 * ⛔ UNDECLARED MUST NOT COUNT AS HOLDS — a family with no declared field list has
 * not been measured, and reporting silence as success is the precise defect the
 * eighth fact exists to catch.
 *
 * WHAT IT STILL WOULD NOT SAY: that the material RESOLVES to the right pixels,
 * that the mesh has the right form, or anything about update verbs — those are
 * `check-mirror-completeness`'s ledger and the mesh-layer suites. The eighth fact
 * is only the claim that the VALUE the user stated is the value the render record
 * holds. That claim is currently made by nothing.
 */

import { describe, it, expect, vi } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack, attachStores, createId } from '@pryzm/plugin-sdk';
import { RoofStore as LegacyRoofStore } from '@pryzm/geometry-roof';
import { BeamStore as PluginBeamStore, buildBeamHandlerSet } from '@pryzm/plugin-beam';

const LEVEL = 'L0';

/** One `add` patch as a single-store `produceCommand` emits it: `draft[id] = rec`. */
const addPatch = (id: string, value: unknown) => ({ op: 'add', path: [id], value });

/**
 * Drive the REAL `CommandEventBridge` over one bus record and hand back every
 * event it emitted, in order.
 *
 * Imported from SOURCE, not the barrel: `@pryzm/runtime-composer`'s index
 * transitively pulls `pdfjs-dist`, which touches `DOMMatrix` at module scope —
 * the constraint `BeamBaseLineReachesStore.test.ts` already documents.
 */
async function relay(
    type: string,
    payload: Record<string, unknown>,
    forward: ReadonlyArray<{ op: string; path: (string | number)[]; value?: unknown }> = [],
): Promise<Array<{ name: string; payload: Record<string, unknown> }>> {
    const { wireCommandEventBridge } = await import(
        '../../../packages/runtime-composer/src/CommandEventBridge'
    );
    const out: Array<{ name: string; payload: Record<string, unknown> }> = [];
    let emit!: (bytes: unknown, record: unknown) => void;
    const patches = {
        subscribe: (cb: (b: unknown, r: unknown) => void) => { emit = cb; return () => {}; },
    };
    const events = {
        emit: (name: string, p: unknown) => { out.push({ name, payload: p as Record<string, unknown> }); },
    };
    wireCommandEventBridge(patches as never, events as never);
    emit(new Uint8Array(), {
        id: `evt-${type}`, type, payload,
        affectedStores: ['probe'], audit: { actorId: 'probe' }, forward,
    });
    return out;
}

const only = (
    evs: Array<{ name: string; payload: Record<string, unknown> }>,
    name: string,
): Array<Record<string, unknown>> => evs.filter((e) => e.name === name).map((e) => e.payload);

// ═════════════════════════════════════════════════════════════════════════════
describe('§FIX-ROOF-CEB-MATERIAL (B2-ROOF-01) — the FIDELITY axis: a roof that drew is not a roof that drew RIGHT', () => {
    const BOUNDARY = [
        { x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 3 }, { x: 0, y: 0, z: 3 },
    ];

    it('ARM 1 — the user\'s materialId and materialColor survive the bridge', async () => {
        const evs = await relay(
            'roof.create',
            { id: 'roof-1', levelId: LEVEL, boundary: BOUNDARY, shape: 'gable', pitch: 0.4 },
            [addPatch('roof-1', {
                id: 'roof-1', levelId: LEVEL, materialId: 'mat-zinc', materialColor: '#8899aa',
            })],
        );
        const [roof] = only(evs, 'roof.created');
        expect(roof, 'a well-formed roof.create must still emit roof.created').toBeDefined();
        // Positive AND negative on the SAME expression — the drop spelled both ways.
        expect(roof!['materialId']).toBe('mat-zinc');
        expect(roof!['materialId']).not.toBeUndefined();
        expect(roof!['materialColor']).toBe('#8899aa');
        expect(roof!['materialColor']).not.toBeUndefined();
    });

    it('ARM 1 READ-BACK — and they reach the LEGACY RoofStore, the record the fragment builder, the plan projector, the IFC exporter and ProjectSerializer all read', async () => {
        const evs = await relay(
            'roof.create',
            { id: 'roof-2', levelId: LEVEL, boundary: BOUNDARY, shape: 'gable', pitch: 0.4 },
            [addPatch('roof-2', {
                id: 'roof-2', levelId: LEVEL, materialId: 'mat-zinc', materialColor: '#8899aa',
            })],
        );
        const [ev] = only(evs, 'roof.created');
        const { roofRecordFromCreatedEvent } = await import('../src/engine/roofCreatedMirror');
        const record = roofRecordFromCreatedEvent(ev as never, [3.0]);
        expect(record, 'the mirror must build a record for a boundary-carrying roof').not.toBeNull();
        const store = new LegacyRoofStore();
        store.add(record as never);
        const back = store.getById('roof-2') as unknown as Record<string, unknown>;
        expect(back).toBeDefined();
        expect(
            back['materialId'],
            'the roof rendered in the DEFAULT finish, not the chosen one — and renders_3d still read YES',
        ).toBe('mat-zinc');
        expect(back['materialColor']).toBe('#8899aa');
    });

    it('CONTROL — an UNSTATED finish stays unstated; the fix must not write a default over an absence', async () => {
        const evs = await relay(
            'roof.create',
            { id: 'roof-3', levelId: LEVEL, boundary: BOUNDARY, shape: 'flat' },
            [addPatch('roof-3', { id: 'roof-3', levelId: LEVEL })],
        );
        const [ev] = only(evs, 'roof.created');
        const { roofRecordFromCreatedEvent } = await import('../src/engine/roofCreatedMirror');
        const record = roofRecordFromCreatedEvent(ev as never, [3.0]) as unknown as Record<string, unknown>;
        expect(record).not.toBeNull();
        // Spread-conditional, so the KEY itself must be absent — an explicit
        // `undefined` would assert "the user chose no material", a different fact.
        expect(Object.prototype.hasOwnProperty.call(record, 'materialId')).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(record, 'materialColor')).toBe(false);
    });

    it('ARM 2 — a roof whose payload names no id is emitted under the id the handler MINTED', async () => {
        const evs = await relay(
            'roof.create',
            { levelId: LEVEL, boundary: BOUNDARY, shape: 'flat' },
            [addPatch('roof_minted_01', {
                id: 'roof_minted_01', levelId: LEVEL, materialId: 'mat-felt',
            })],
        );
        const [roof] = only(evs, 'roof.created');
        expect(
            roof,
            'CreateRoof.ts:56 mints `cmd.id ?? createId("roof")`, so an id-less dispatch commits a real roof',
        ).toBeDefined();
        expect(roof!['id']).toBe('roof_minted_01');
        expect(roof!['materialId']).toBe('mat-felt');
    });

    it('ARM 3 — a roof.create that neither names nor commits a single id is REFUSED BY NAME, not emitted id-less', async () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const evs = await relay('roof.create', { levelId: LEVEL, boundary: BOUNDARY }, []);
            // Paired positive on the SAME list, so `not.toContain` can really fail.
            expect(evs.map((e) => e.name)).toContain('command.executed');
            expect(evs.map((e) => e.name)).not.toContain('roof.created');
            expect(
                err,
                'the refusal must be said out loud — an id-less roof.created is swallowed by the subscriber guard with no trace',
            ).toHaveBeenCalled();
            expect(String(err.mock.calls[0]?.[0])).toContain('REFUSED');
        } finally { err.mockRestore(); }
    });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('§FIX-ROOF-UPDATE-MIRROR — setShape and setPitch reach the legacy record, under the names it uses', () => {
    const SEED = {
        id: 'roof-u', type: 'roof', levelId: LEVEL,
        footprint: { polygon: [[0, 0], [4, 0], [4, 3]], centroid: [2, 1] },
        roofType: 'flat', overhang: 0.3, baseOffset: 2.7, thickness: 0.2,
    };

    async function mirror(
        changed: string[],
        pluginRecord: Record<string, unknown>,
        seed: Record<string, unknown>,
    ) {
        const { applyElementUpdate } = await import('../src/engine/elementUpdatedMirror');
        const store = new LegacyRoofStore();
        store.add(seed as never);
        const outcome = applyElementUpdate(
            { elementKind: 'roof', elementId: 'roof-u', changedFields: changed },
            { roofStore: store as never, pluginRecord: () => pluginRecord },
        );
        return { outcome, back: store.getById('roof-u') as unknown as Record<string, unknown> };
    }

    it('ARM 1 — roof.setPitch writes legacy `slope` = tan(pitch). The standing "cannot be mirrored" note grepped for the NAME `pitch`; the record carries the CONCEPT as `slope`', async () => {
        const { outcome, back } = await mirror(
            ['pitch'],
            { id: 'roof-u', shape: 'gable', pitch: 0.4 },
            { ...SEED, roofType: 'gable' },
        );
        expect(outcome.applied, JSON.stringify(outcome)).toBe(true);
        expect(back['slope']).toBeCloseTo(Math.tan(0.4), 10);
        expect(back['slope']).not.toBeUndefined();
    });

    it('ARM 2 — roof.setShape writes legacy `roofType`, and `mono` becomes `shed`: the two vocabularies spell ONE roof form differently (L-699)', async () => {
        const { outcome, back } = await mirror(
            ['shape'],
            { id: 'roof-u', shape: 'mono', pitch: 0.3 },
            SEED,
        );
        expect(outcome.applied, JSON.stringify(outcome)).toBe(true);
        expect(
            back['roofType'],
            'a `mono` roof fell through RoofGeometryBuilder\'s switch to default: and rendered FLAT',
        ).toBe('shed');
        expect(back['roofType']).not.toBe('mono');
    });

    it('ARM 3 — a gable→flat setShape carries BOTH fields, because the handler writes both (`if (cmd.shape === "flat") r.pitch = 0`)', async () => {
        const { outcome, back } = await mirror(
            ['shape', 'pitch'],
            { id: 'roof-u', shape: 'flat', pitch: 0 },
            { ...SEED, roofType: 'gable', slope: 0.9 },
        );
        expect(outcome.applied, JSON.stringify(outcome)).toBe(true);
        expect(back['roofType']).toBe('flat');
        // "Flat" is spelled by the field's ABSENCE in this model, never by a zero:
        // RoofDataSchema.ts:149 deletes a non-positive slope and
        // RoofGeometryBuilder.ts:1127 branches on `data.slope && data.slope > 0`.
        expect(back['slope']).toBeUndefined();
        expect(back['slope']).not.toBe(0.9);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('§FIX-CEB-READ-THE-COMMIT (B2-COL-01) — column.batch.create emitted NOTHING for id-less members', () => {
    it('ARM 1 — three id-less members yield three column.created events, under the ids the handler minted', async () => {
        const committed = ['column_a', 'column_b', 'column_c'];
        const evs = await relay(
            'column.batch.create',
            { levelId: LEVEL, columns: [{}, {}, {}] },
            committed.map((id, i) => addPatch(id, {
                id, levelId: LEVEL, origin: { x: i, y: 0, z: 0 },
                shape: 'rectangular', width: 0.4, depth: 0.4,
                height: 3, baseOffset: 0, rotation: 0,
            })),
        );
        const created = only(evs, 'column.created');
        // The defect was `if (!c.id || !c.origin) continue;` — a SILENT skip, so
        // the COUNT is the whole assertion. It used to be 0.
        expect(created).toHaveLength(3);
        expect(created.map((c) => c['id'])).toEqual(committed);
        expect(created[1]!['origin']).toEqual({ x: 1, y: 0, z: 0 });
        expect(created[0]!['levelId']).toBe(LEVEL);
    });

    it('CONTROL — members that DO name their ids still arrive, so ARM 1 did not swap one source for the other', async () => {
        const evs = await relay(
            'column.batch.create',
            { levelId: LEVEL, columns: [{ id: 'c1', origin: { x: 9, y: 0, z: 9 } }] },
            [addPatch('c1', { id: 'c1', levelId: LEVEL, origin: { x: 9, y: 0, z: 9 }, height: 3 })],
        );
        const created = only(evs, 'column.created');
        expect(created).toHaveLength(1);
        expect(created[0]!['id']).toBe('c1');
        expect(created[0]!['origin']).toEqual({ x: 9, y: 0, z: 9 });
    });

    it('CONTROL — with an UNINDEXABLE commit the payload fallback still runs, so the fix is degraded-never-wrong rather than all-or-nothing', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const evs = await relay(
                'column.batch.create',
                { levelId: LEVEL, columns: [{ id: 'c9', origin: { x: 1, y: 0, z: 1 } }] },
                [{ op: 'replace', path: ['c9', 'height'], value: 4 }],
            );
            const created = only(evs, 'column.created');
            expect(created).toHaveLength(1);
            expect(created[0]!['id']).toBe('c9');
            expect(warn).toHaveBeenCalled();
        } finally { warn.mockRestore(); }
    });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('§FIX-SLAB-CEB-BOUNDARY (B1-SLAB-01) — the single create was DEAF to the field its live caller sends', () => {
    const RING = [
        { x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, { x: 5, y: 0, z: 4 }, { x: 0, y: 0, z: 4 },
    ];

    it('ARM 1 — a payload spelling the outline `boundary` (PreviewManager.ts:333) now emits a usable `polygon`', async () => {
        const evs = await relay(
            'slab.create',
            { id: 'slab-1', levelId: LEVEL, boundary: RING, thickness: 0.25 },
            [addPatch('slab-1', { id: 'slab-1', levelId: LEVEL, boundary: RING, thickness: 0.25 })],
        );
        const [slab] = only(evs, 'slab.created');
        expect(
            slab,
            'the single create read `p.polygon` and never `p.boundary`, while the BATCH case twenty lines below read `polygon ?? boundary`',
        ).toBeDefined();
        // Plan convention: {x, y} with y carrying world Z.
        expect(slab!['polygon']).toEqual([
            { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 4 }, { x: 0, y: 4 },
        ]);
        expect(slab!['polygon']).not.toBeUndefined();
        expect(slab!['thickness']).toBe(0.25);
    });

    it('CONTROL — the `polygon` spelling (SlabPlanToolHandler) still wins where present, so ARM 1 did not swap the conventions', async () => {
        const evs = await relay(
            'slab.create',
            { id: 'slab-2', levelId: LEVEL, polygon: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }] },
            [addPatch('slab-2', { id: 'slab-2', levelId: LEVEL, boundary: RING })],
        );
        const [slab] = only(evs, 'slab.created');
        expect(slab!['polygon']).toEqual([{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }]);
    });

    it('ARM 2 — a slab.create that names no outline at all is REFUSED BY NAME', async () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const evs = await relay('slab.create', { id: 'slab-3', levelId: LEVEL }, []);
            expect(evs.map((e) => e.name)).toContain('command.executed');
            expect(evs.map((e) => e.name)).not.toContain('slab.created');
            expect(err).toHaveBeenCalled();
        } finally { err.mockRestore(); }
    });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('§FIX-BEAM-PHANTOM-TELEMETRY — the 3-D BeamTool\'s `{}` dispatch committed a phantom, and the bridge was RIGHT not to follow it', () => {
    function bootBeamBus() {
        const beam = new PluginBeamStore();
        const emitter = new PatchEmitter();
        const bus = new CommandBus({
            audit: { actorId: 'probe', projectId: 'p', clientId: 'c' },
            emitter,
            undoStack: new UndoStack({ maxSize: 20 }),
            storesProvider: () => ({ beam: Object.fromEntries(beam.getState()) }),
        });
        for (const h of buildBeamHandlerSet()) bus.register(h);
        const detach = attachStores(emitter, { beam: beam as never });
        return { beam, bus, detach };
    }

    it('ARM 1 — `beam.create {}` is REFUSED and mints nothing. BeamTool.ts:222 fires exactly this on every 3-D beam placement', async () => {
        const { beam, bus, detach } = bootBeamBus();
        try {
            await expect(bus.executeCommand('beam.create', {})).rejects.toThrow(/baseline/i);
            // The whole point: it used to COMMIT, at the L0 schema's default
            // (0,0,0)→(4,0,0) on level ''. The store is the assertion, not the throw.
            expect(beam.size()).toBe(0);
        } finally { detach(); }
    });

    it('CONTROL — a real beam still commits, so ARM 1 refused the phantom and not the family', async () => {
        const { beam, bus, detach } = bootBeamBus();
        const id = createId('beam');
        try {
            await bus.executeCommand('beam.create', {
                id, levelId: LEVEL,
                baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
            });
            expect(beam.size()).toBe(1);
            const rec = beam.get(id) as unknown as Record<string, unknown>;
            expect(rec['baseLine']).toEqual([{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }]);
        } finally { detach(); }
    });

    it('CONTROL — the LEGACY alias spelling is still accepted, so the refusal keys on "no line described", not on one producer\'s field name', async () => {
        const { beam, bus, detach } = bootBeamBus();
        try {
            await bus.executeCommand('beam.create', {
                id: createId('beam'), levelId: LEVEL,
                startPoint: { x: 0, y: 0, z: 0 }, endPoint: { x: 3, y: 0, z: 0 },
            });
            expect(beam.size()).toBe(1);
        } finally { detach(); }
    });
});
