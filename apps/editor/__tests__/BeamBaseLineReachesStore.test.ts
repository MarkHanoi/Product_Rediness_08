/**
 * §FIX-BEAM-CEB-BASELINE (L-971 · C84 EI-2b · C11 §5.2 · ADR-002 §5)
 *
 * ─── THE DEFECT ─────────────────────────────────────────────────────────────
 * `beam.create` has TWO producers dispatching TWO different geometry shapes:
 *
 *   plugins/beam/src/tool.ts:62          → { baseLine: [a, b] }      ← the L0 field
 *   views/plantools/BeamPlanToolHandler  → { startPoint, endPoint }  ← a legacy alias
 *
 * `CreateBeamHandler.resolveBaseLine()` accepts BOTH and commits `baseLine`.
 * `CommandEventBridge`'s SINGLE `beam.create` case read only `startPoint` /
 * `endPoint`, so a beam drawn with the beam plugin's own tool emitted
 * `beam.created` with `startPoint === undefined`; the §FT2 mirror's guard
 * dropped it, `BeamStore.add()` was never called, and no mesh was ever built —
 * silently. Only the `beam.batch.create` case converted `baseLine`.
 *
 * ─── WHY THE ASSERTIONS READ THE STORE ──────────────────────────────────────
 * Per §committed-is-not-reachable the claim is "the record LANDS", not "the
 * function returned the right object": every arm drives the REAL
 * `wireCommandEventBridge`, feeds its emitted event to THE `beamCreatedMirror`
 * that `initTools.ts` calls, and reads the value back out of a real `BeamStore`
 * — the store `BeamFragmentBuilder` meshes from.
 */

import { describe, it, expect, vi } from 'vitest';
import { BeamStore } from '@pryzm/core-app-model';

const LEVEL_ID = 'L0';
let _seq = 0;
const nextBeamId = (): string => `beam-baseline-probe-${++_seq}`;

const A = { x: 1, y: 3, z: 2 };
const B = { x: 7, y: 3, z: 2 };

/** Drive the REAL `CommandEventBridge` and hand back every event it emitted.
 *  Imported from source, not the barrel: `@pryzm/runtime-composer`'s index
 *  transitively pulls `pdfjs-dist`, which touches `DOMMatrix` at module scope. */
async function emitBeamCreate(
    payload: Record<string, unknown>,
): Promise<{ names: string[]; beamCreated: Record<string, unknown> | undefined }> {
    const { wireCommandEventBridge } = await import(
        '../../../packages/runtime-composer/src/CommandEventBridge'
    );
    const names: string[] = [];
    let beamCreated: Record<string, unknown> | undefined;
    let emit!: (bytes: unknown, record: unknown) => void;
    const patches = { subscribe: (cb: (b: unknown, r: unknown) => void) => { emit = cb; return () => {}; } };
    const events = {
        emit: (name: string, p: unknown) => {
            names.push(name);
            if (name === 'beam.created') beamCreated = p as Record<string, unknown>;
        },
    };
    wireCommandEventBridge(patches as never, events as never);
    emit(new Uint8Array(), {
        id: 'evt-beam-baseline', type: 'beam.create', payload,
        affectedStores: ['beam'], audit: { actorId: 'probe' }, forward: [],
    });
    return { names, beamCreated };
}

/** The full hop for a single `beam.create`: bus record → real CEB → the §FT2
 *  mirror → a real `BeamStore`. `null` when nothing reached the store. */
async function storedBeamFor(payload: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const { beamCreated } = await emitBeamCreate(payload);
    if (!beamCreated) return null;
    const { beamRecordFromCreatedEvent } = await import('../src/engine/beamCreatedMirror');
    const record = beamRecordFromCreatedEvent(beamCreated as never);
    if (!record) return null;
    const store = new BeamStore();
    store.add(record as never);
    return (store.get(payload['id'] as string) ?? null) as unknown as Record<string, unknown> | null;
}

describe('§FIX-BEAM-CEB-BASELINE — both beam.create producers reach the BeamStore', () => {
    it('ARM 1 — a beam from the BEAM PLUGIN\'S OWN TOOL (`baseLine`) lands in the store with its real endpoints', async () => {
        const id = nextBeamId();
        const stored = await storedBeamFor({
            id, levelId: LEVEL_ID, baseLine: [A, B], width: 0.25, depth: 0.45,
        });
        expect(
            stored,
            'plugins/beam/src/tool.ts dispatches `baseLine` — the L0 Beam schema\'s own field. The bridge read only startPoint/endPoint, so the beam vanished between the command and the mesh.',
        ).not.toBeNull();
        // Positive AND negative on the SAME expression.
        expect(stored!['startPoint']).toEqual(A);
        expect(stored!['startPoint']).not.toBeUndefined();
        expect(stored!['endPoint']).toEqual(B);
        expect(stored!['levelId']).toBe(LEVEL_ID);
    });

    it('ARM 1 MECHANISM — the emitted `beam.created` itself carries the geometry, not just the store record', async () => {
        const { beamCreated } = await emitBeamCreate({
            id: nextBeamId(), levelId: LEVEL_ID, baseLine: [A, B],
        });
        expect(beamCreated, 'a usable beam.create must still emit beam.created').toBeDefined();
        expect(beamCreated!['startPoint']).toEqual(A);
        expect(beamCreated!['endPoint']).toEqual(B);
    });

    it('CONTROL — the LEGACY alias (`startPoint`/`endPoint`, BeamPlanToolHandler) still lands, so ARM 1 did not swap one producer for the other', async () => {
        const id = nextBeamId();
        const stored = await storedBeamFor({
            id, levelId: LEVEL_ID, startPoint: A, endPoint: B, width: 0.25, depth: 0.45,
        });
        expect(stored, 'the plan tool\'s shape must keep working').not.toBeNull();
        expect(stored!['startPoint']).toEqual(A);
        expect(stored!['endPoint']).toEqual(B);
    });

    it('CONTROL — `baseLine` WINS over a contradictory legacy alias, matching CreateBeamHandler.resolveBaseLine()', async () => {
        const id = nextBeamId();
        const stored = await storedBeamFor({
            id, levelId: LEVEL_ID,
            baseLine: [A, B],
            startPoint: { x: -99, y: -99, z: -99 },
            endPoint: { x: -98, y: -98, z: -98 },
        });
        expect(stored!['startPoint']).toEqual(A);
        expect(stored!['startPoint']).not.toEqual({ x: -99, y: -99, z: -99 });
    });

    it('ARM 2 — a payload carrying NEITHER shape is REFUSED BY NAME and emits no `beam.created`', async () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const id = nextBeamId();
            const { names, beamCreated } = await emitBeamCreate({ id, levelId: LEVEL_ID, width: 0.25 });
            expect(
                beamCreated,
                'emitting a geometry-less beam.created is the silent drop itself — the subscriber\'s guard swallows it with no trace',
            ).toBeUndefined();
            // Paired positive on the SAME expression: the generic relay still fired,
            // so `names` is a live list and `not.toContain` can actually fail.
            expect(names).toContain('command.executed');
            expect(names).not.toContain('beam.created');
            expect(err, 'the refusal must be said out loud').toHaveBeenCalled();
            const msg = String(err.mock.calls[0]?.[0]);
            expect(msg).toContain(id);
            expect(msg).toContain('baseLine');
        } finally {
            err.mockRestore();
        }
    });
});
