/**
 * §FIX-BEAM-CEB-STEEL (L-974 · C84 EI-2a · C79 §7.4)
 *
 * ─── THE DEFECT ─────────────────────────────────────────────────────────────
 * `CopyPlanToolHandler.ts:444-454` copies a beam by dispatching `beam.create`
 * with `sectionType`, `steelProfileName`, `loadBearing`, `fireRating` and
 * `material`. `CommandEventBridge`'s named subset listed NONE of them, so
 * copying a steel UB beam produced a plain concrete beam — silently.
 * `BeamFragmentBuilder.ts:253` takes its steel branch only on
 * `(sectionType === 'UB' || 'UC') && steelProfileName`, so the copy rendered as
 * a box; `BeamReader.ts:23` exported it with the wrong `LoadBearing` pset and
 * `RuleEngine.ts:1005` skipped it in the fire-rating check.
 *
 * ─── WHY THIS DRIVES THE REAL HANDLER ───────────────────────────────────────
 * The fix carries the values through the L0 `Beam` schema, so proving it at the
 * bridge alone would prove nothing about whether they SURVIVE a commit. Each arm
 * therefore runs the REAL `CreateBeamHandler`, hands its REAL forward patches to
 * the REAL `CommandEventBridge`, feeds the emitted event to THE
 * `beamCreatedMirror` that `initTools.ts` calls, and reads the value back out of
 * a real `BeamStore` — the store `BeamFragmentBuilder` meshes from,
 * `ScheduleExtractor` reports and `BeamReader` exports.
 */

import { describe, it, expect, vi } from 'vitest';
import { BeamStore } from '@pryzm/core-app-model';
import { createId } from '@pryzm/schemas';

const LEVEL_ID = 'L0';
const A = { x: 0, y: 3, z: 0 };
const B = { x: 6, y: 3, z: 0 };
/** A real member of `SteelProfileLibrary.UB` (`SteelProfileLibrary.ts:117`). */
const UB_PROFILE = '254x146x37';

/** Exactly what `CopyPlanToolHandler._copyBeam` sends, id added. */
function copyToolDispatch(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id,
        startPoint: A,
        endPoint: B,
        width: 0.25,
        depth: 0.45,
        levelId: LEVEL_ID,
        material: 'mat-steel-s355',
        loadBearing: true,
        fireRating: 'R60',
        sectionType: 'UB',
        steelProfileName: UB_PROFILE,
        ...extra,
    };
}

/** Run the REAL `CreateBeamHandler` and return its forward patches. */
async function commitBeam(payload: Record<string, unknown>): Promise<readonly unknown[]> {
    const { CreateBeamHandler } = await import('../../../plugins/beam/src/handlers/CreateBeam');
    const handler = new CreateBeamHandler();
    const ctx = { stores: { beam: {} } } as never;
    const verdict = handler.canExecute(ctx, payload as never);
    if (!verdict.valid) throw new Error(`REFUSED: ${verdict.reason}`);
    return handler.execute(ctx, payload as never).forward as readonly unknown[];
}

/** bus record → real CEB → the emitted `beam.created`. */
async function beamCreatedFor(
    payload: Record<string, unknown>,
    forward: readonly unknown[],
): Promise<Record<string, unknown>> {
    const { wireCommandEventBridge } = await import(
        '../../../packages/runtime-composer/src/CommandEventBridge'
    );
    let ev: Record<string, unknown> | undefined;
    let emit!: (bytes: unknown, record: unknown) => void;
    const patches = { subscribe: (cb: (b: unknown, r: unknown) => void) => { emit = cb; return () => {}; } };
    const events = {
        emit: (name: string, p: unknown) => { if (name === 'beam.created') ev = p as Record<string, unknown>; },
    };
    wireCommandEventBridge(patches as never, events as never);
    emit(new Uint8Array(), {
        id: 'evt-beam-steel', type: 'beam.create', payload,
        affectedStores: ['beam'], audit: { actorId: 'probe' }, forward,
    });
    if (!ev) throw new Error('CommandEventBridge emitted no beam.created for a beam.create record');
    return ev;
}

/** The whole chain, ending at a real `BeamStore`. `null` when the mirror refused. */
async function copiedBeamInStore(extra: Record<string, unknown> = {}): Promise<Record<string, unknown> | null> {
    const id = createId('beam') as unknown as string;
    const payload = copyToolDispatch(id, extra);
    const forward = await commitBeam(payload);
    const ev = await beamCreatedFor(payload, forward);
    const { beamRecordFromCreatedEvent } = await import('../src/engine/beamCreatedMirror');
    const record = beamRecordFromCreatedEvent(ev as never);
    if (!record) return null;
    const store = new BeamStore();
    store.add(record as never);
    return (store.get(id) ?? null) as unknown as Record<string, unknown> | null;
}

describe('§FIX-BEAM-CEB-STEEL — a copied steel beam is still a steel beam', () => {
    it('MECHANISM — the COMMITTED beam keeps the copy tool\'s structural fields, so the bridge has something to relay', async () => {
        const id = createId('beam') as unknown as string;
        const forward = await commitBeam(copyToolDispatch(id));
        const committed = (forward as Array<{ value?: Record<string, unknown> }>)[0]?.value ?? {};
        // Positive control on the SAME object: a field L0 always carried.
        expect(committed['width'], 'width was always on the L0 Beam schema').toBe(0.25);
        expect(committed['loadBearing'], 'the copy tool sends it and `Beam.parse` used to strip it').toBe(true);
        expect(committed['fireRating']).toBe('R60');
        expect(committed['steelProfileName']).toBe(UB_PROFILE);
        expect(committed['shape'], 'legacy `sectionType: UB` is an I-section in the L0 vocabulary').toBe('i-section');
        expect(committed['materialId'], '`material` is the legacy spelling of `materialId`').toBe('mat-steel-s355');
    });

    it('ARM 1 — the stored beam takes BeamFragmentBuilder\'s steel branch, not the concrete box', async () => {
        const stored = await copiedBeamInStore();
        expect(stored, 'a copied UB beam must not be refused').not.toBeNull();
        // The exact conjunction `BeamFragmentBuilder.ts:253` gates on.
        expect(stored!['sectionType']).toBe('UB');
        expect(stored!['steelProfileName']).toBe(UB_PROFILE);
        expect(
            stored!['sectionType'],
            'the bridge dropped sectionType, so every copied steel beam rendered as plain concrete',
        ).not.toBe('rectangular');
    });

    it('ARM 2 — `fireRating` and `material` survive, the fields RuleEngine and the IFC export read', async () => {
        const stored = await copiedBeamInStore();
        expect(stored!['fireRating']).toBe('R60');
        expect(stored!['fireRating']).not.toBeUndefined();
        expect(stored!['material']).toBe('mat-steel-s355');
    });

    it('ARM 3 — an AUTHORED `loadBearing: false` is honoured instead of the default', async () => {
        const stored = await copiedBeamInStore({ loadBearing: false });
        expect(
            stored!['loadBearing'],
            'the mirror wrote BEAM_LOAD_BEARING_DEFAULT unconditionally because no emitter carried the field',
        ).toBe(false);
    });

    it('ARM 3 CONTROL — an UNSTATED `loadBearing` still lands on the repo default `true`', async () => {
        const id = createId('beam') as unknown as string;
        const payload = copyToolDispatch(id);
        delete payload['loadBearing'];
        const forward = await commitBeam(payload);
        const ev = await beamCreatedFor(payload, forward);
        const { beamRecordFromCreatedEvent } = await import('../src/engine/beamCreatedMirror');
        const record = beamRecordFromCreatedEvent(ev as never);
        const store = new BeamStore();
        store.add(record as never);
        expect(store.get(id)!['loadBearing']).toBe(true);
    });

    it('ARM 4 — a plain rectangular beam is untouched by any of this', async () => {
        const stored = await copiedBeamInStore({
            sectionType: 'rectangular', steelProfileName: undefined,
            material: undefined, fireRating: undefined,
        });
        expect(stored, 'the ordinary case must not be refused').not.toBeNull();
        expect(stored!['sectionType']).toBe('rectangular');
        expect(stored!['steelProfileName']).toBeUndefined();
        expect(stored!['startPoint']).toEqual(A);
    });

    it('ARM 5 — `sectionType: "UC"` is REFUSED BY NAME at the handler, not silently downgraded', async () => {
        await expect(
            commitBeam(copyToolDispatch(createId('beam') as unknown as string, { sectionType: 'UC' })),
        ).rejects.toThrow(/UC/);
        // Paired positive on the SAME expression: 'UB' is accepted, so ARM 5 is
        // not refusing every steel section.
        await expect(
            commitBeam(copyToolDispatch(createId('beam') as unknown as string, { sectionType: 'UB' })),
        ).resolves.toBeDefined();
    });

    it('ARM 6 — an I-section with NO profile name is refused by name, since the steel branch cannot build without one', async () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const stored = await copiedBeamInStore({ steelProfileName: undefined });
            expect(
                stored,
                'BeamFragmentBuilder needs `steelProfileName` to build an I-section; without it the beam would silently draw as a box',
            ).toBeNull();
            expect(err).toHaveBeenCalled();
            expect(String(err.mock.calls[0]?.[0])).toContain('steelProfileName');
        } finally {
            err.mockRestore();
        }
    });
});
