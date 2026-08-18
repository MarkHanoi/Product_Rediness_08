/**
 * §FIX-BEAM-BRIDGE-LOADBEARING / §FIX-BEAM-BRIDGE-SECTION
 * (C84 EI-2a + EI-2c · C84 §9 "the eleven unread `.created` bridge bodies" ·
 *  C79 §7.4 · C11 §3)
 *
 * ─── THE DEFECT ─────────────────────────────────────────────────────────────
 * The §FT2 `beam.created` bridge in `initTools.ts` wrote two literals into the
 * legacy `BeamData` it mirrors:
 *
 *     loadBearing: false                            ← every other path writes true
 *     sectionType: (ev.shape ?? 'rectangular') as any   ← a union with no such member
 *
 * `loadBearing` is the live half. `BeamData.loadBearing` is REQUIRED
 * (`BeamTypes.ts:18`), so the mirror must write something — but
 * `CreateBeamCommand.ts:190` writes `input.loadBearing ?? true`, and that is the
 * path the 3-D `BeamTool`, `ProjectLoader` and the IFC importer all take.
 * `BeamCommandPlan.ts:204` writes `true` too. So the SAME beam was structural if
 * drawn in 3-D and non-structural if drawn in plan.
 *
 * That is not cosmetic. `BeamReader.ts:23` puts the field in the exported IFC
 * pset as `LoadBearing`; `ScheduleExtractor.ts:414` prints it Yes/No on the beam
 * schedule; `RuleEngine.ts:1005` filters `loadBearing === true && !fireRating`
 * for a fire-rating check, so every plan-drawn beam was invisible to it.
 *
 * ─── WHY THE ASSERTIONS READ THE STORE ──────────────────────────────────────
 * Per §committed-is-not-reachable, every arm reads the value back out of a real
 * `BeamStore` — the store `BeamFragmentBuilder` meshes from,
 * `ScheduleExtractor` reads and `BeamReader` exports — never off the mapper's
 * return value. The mapping is driven from the extracted
 * `beamCreatedMirror.ts`, which is THE function `initTools.ts` calls.
 */

import { describe, it, expect, vi } from 'vitest';
import { BeamStore } from '@pryzm/core-app-model';

const LEVEL_ID = 'L0';
let _seq = 0;
const nextBeamId = (): string => `beam-lb-probe-${++_seq}`;

/** Drive the REAL `CommandEventBridge` and hand back the `beam.created` payload.
 *  Imported from source, not the barrel: `@pryzm/runtime-composer`'s index
 *  transitively pulls `pdfjs-dist`, which touches `DOMMatrix` at module scope. */
async function beamCreatedEventFor(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
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
        id: 'evt-beam-lb', type: 'beam.create', payload,
        affectedStores: ['beam'], audit: { actorId: 'probe' }, forward: [],
    });
    if (!ev) throw new Error('CommandEventBridge emitted no beam.created for a beam.create record');
    return ev;
}

/**
 * What `BeamPlanToolHandler.ts:95-102` and `CopyPlanToolHandler.ts:444-454`
 * dispatch — `startPoint` / `endPoint`, plus the `loadBearing` the copy tool
 * sends and this hop cannot carry.
 *
 * ⚠ NOT `baseLine`, deliberately, and the difference is a SEPARATE measured
 * finding reported to C84 §9 rather than fixed here: the L0 `Beam` schema
 * declares `baseLine` (`Beam.ts:46`) and `plugins/beam/src/tool.ts:62`
 * dispatches it, but `CommandEventBridge`'s single `beam.create` case
 * (`:561-583`) reads `p.startPoint` / `p.endPoint` — only its `beam.batch.create`
 * case converts from `baseLine`. A beam created through the plugin's own tool
 * therefore emits `beam.created` with no geometry and this mirror's guard drops
 * it silently. That repair belongs in `runtime-composer`, not in this lane.
 */
function planDispatch(beamId: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: beamId,
        levelId: LEVEL_ID,
        startPoint: { x: 0, y: 3, z: 0 },
        endPoint: { x: 5, y: 3, z: 0 },
        width: 0.25,
        depth: 0.45,
        loadBearing: true,
        ...extra,
    };
}

/** The PLAN path, end to end: bus record → real CEB → the §FT2 mirror → a real
 *  `BeamStore`. Returns the stored record, or `null` when the mirror refused. */
async function planPathStoredBeam(extra: Record<string, unknown> = {}): Promise<Record<string, unknown> | null> {
    const beamId = nextBeamId();
    const ev = await beamCreatedEventFor(planDispatch(beamId, extra));
    const { beamRecordFromCreatedEvent } = await import('../src/engine/beamCreatedMirror');
    const record = beamRecordFromCreatedEvent(ev as never);
    if (!record) return null;
    const store = new BeamStore();
    store.add(record as never);
    const stored = store.get(beamId);
    expect(stored, 'the mirrored beam must reach the BeamStore').toBeDefined();
    return stored as unknown as Record<string, unknown>;
}

describe('§FIX-BEAM-BRIDGE-LOADBEARING — a plan-drawn beam is as structural as a 3-D one', () => {
    it('MECHANISM — `beam.created` carries `width` but NEVER `loadBearing`, so the mirror cannot read it off the event', async () => {
        // Positive and negative on the SAME object: if the emitter ever starts
        // listing loadBearing, this goes red and the default below is re-opened.
        const ev = await beamCreatedEventFor(planDispatch(nextBeamId()));
        expect(ev['width'], 'width IS on the emitter\'s named subset').toBe(0.25);
        expect(
            ev['loadBearing'],
            'loadBearing is NOT on the named subset — the caller set it and it was dropped in flight',
        ).toBeUndefined();
    });

    it('ARM 1 — the mirrored beam must be load-bearing, as CreateBeamCommand\'s `?? true` makes every other path', async () => {
        const stored = await planPathStoredBeam();
        expect(stored, 'a plain rectangular beam must not be refused').not.toBeNull();
        expect(
            stored!['loadBearing'],
            'the §FT2 mirror wrote the literal `false` — the same beam drawn in 3-D is `true`, and the IFC pset, the beam schedule and the fire-rating rule all read this field',
        ).toBe(true);
        expect(stored!['loadBearing'], 'the literal must not survive').not.toBe(false);
    });

    it('CONTROL — the geometry the mirror DOES carry still arrives intact (the fixture is sound)', async () => {
        const stored = await planPathStoredBeam();
        expect(stored!['width']).toBe(0.25);
        expect(stored!['depth']).toBe(0.45);
        expect(stored!['sectionType']).toBe('rectangular');
        expect(stored!['levelId']).toBe(LEVEL_ID);
    });

    it('ARM 2 — a shape the legacy `sectionType` union cannot hold is REFUSED BY NAME, not cast to a box', async () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const stored = await planPathStoredBeam({ shape: 't-section' });
            expect(
                stored,
                'BeamData.sectionType is `rectangular|UB|UC`; a t-section had been cast through `as any` and rendered as a plain box',
            ).toBeNull();
            expect(err, 'the refusal must be said out loud — a silent drop is the defect').toHaveBeenCalled();
            expect(String(err.mock.calls[0]?.[0])).toContain('t-section');
        } finally {
            err.mockRestore();
        }
    });

    it('ARM 2 CONTROL — the SAME expression accepts `rectangular`, so ARM 2 is not refusing everything', async () => {
        const stored = await planPathStoredBeam({ shape: 'rectangular' });
        expect(stored, 'the one member both vocabularies share must still pass').not.toBeNull();
        expect(stored!['sectionType']).toBe('rectangular');
    });
});
