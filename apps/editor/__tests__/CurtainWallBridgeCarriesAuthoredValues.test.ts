/**
 * §FIX-CW-BRIDGE-AUTHORED-VALUES / §FIX-CW-BRIDGE-DEAD-ARMS
 * (L-972 · C84 EI-2a + EI-2b · C84 §9 "the eleven unread `.created` bridge bodies")
 *
 * ─── THE DEFECT ─────────────────────────────────────────────────────────────
 * The §P3.1-CW `curtain-wall.created` bridge in `initTools.ts` contained FIVE
 * reads that could never be true:
 *
 *   typeof _cwEv['baseOffset']     === 'number' ? … : 0      ← never a number
 *   typeof _cwEv['panelThickness'] === 'number' ? … : 0.05   ← never a number
 *   ct === 'curtain-wall.batch.create' || 'curtainwall.create' || 'curtainwall.batch.create'
 *
 * `baseOffset` and `panelThickness` existed on NEITHER the L0 `CurtainWall`
 * schema NOR `CommandEventBridge`'s emit list, so the defaults ALWAYS won and an
 * authored value could not take effect — while `UpdateAllCurtainWallsCommand`,
 * the AI capability registry (`panelThickness` read AND write) and
 * `ScheduleExtractor.ts:366` all treat both as first-class. The three extra
 * accept-arms named command types the sole emitter never writes.
 *
 * ─── WHY THE ASSERTIONS READ THE STORE ──────────────────────────────────────
 * Per §committed-is-not-reachable each arm drives the REAL
 * `wireCommandEventBridge`, feeds its event to THE `curtainWallCreatedMirror`
 * that `initTools.ts` calls, and reads the value back out of a real
 * `CurtainWallStore` — the store `CurtainWallBuilder` meshes from and
 * `ScheduleExtractor` reports from.
 */

import { describe, it, expect, vi } from 'vitest';
import { CurtainWallStore } from '@pryzm/geometry-curtain-wall';
import {
    curtainWallRecordFromCreatedEvent,
    ACCEPTED_CURTAIN_WALL_COMMAND_TYPES,
} from '../src/engine/curtainWallCreatedMirror';

const LEVEL_ID = 'L0';
let _seq = 0;
const nextCwId = (): string => `cw-authored-probe-${++_seq}`;

const BASE_LINE = [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }];

/** Drive the REAL `CommandEventBridge` and hand back the `curtain-wall.created`
 *  payload. Imported from source, not the barrel: `@pryzm/runtime-composer`'s
 *  index transitively pulls `pdfjs-dist`, which touches `DOMMatrix` at module
 *  scope. */
async function cwCreatedEventFor(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { wireCommandEventBridge } = await import(
        '../../../packages/runtime-composer/src/CommandEventBridge'
    );
    let ev: Record<string, unknown> | undefined;
    let emit!: (bytes: unknown, record: unknown) => void;
    const patches = { subscribe: (cb: (b: unknown, r: unknown) => void) => { emit = cb; return () => {}; } };
    const events = {
        emit: (name: string, p: unknown) => { if (name === 'curtain-wall.created') ev = p as Record<string, unknown>; },
    };
    wireCommandEventBridge(patches as never, events as never);
    emit(new Uint8Array(), {
        id: 'evt-cw-authored', type: 'curtain-wall.create', payload,
        affectedStores: ['curtainwall'], audit: { actorId: 'probe' }, forward: [],
    });
    if (!ev) throw new Error('CommandEventBridge emitted no curtain-wall.created for a curtain-wall.create record');
    return ev;
}

/** The full hop: bus record → real CEB → the §P3.1-CW mirror → a real
 *  `CurtainWallStore`. Returns the STORED record. */
async function storedCurtainWall(extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const id = nextCwId();
    const ev = await cwCreatedEventFor({ id, levelId: LEVEL_ID, baseLine: BASE_LINE, height: 3.4, ...extra });
    const record = curtainWallRecordFromCreatedEvent(ev as never);
    expect(record, 'a well-formed curtain-wall.create must not be refused').not.toBeNull();
    const store = new CurtainWallStore();
    store.add(record as never);
    const stored = store.get(id);
    expect(stored, 'the mirrored curtain wall must reach the CurtainWallStore').toBeDefined();
    return stored as unknown as Record<string, unknown>;
}

describe('§FIX-CW-BRIDGE-AUTHORED-VALUES — an authored curtain-wall value survives to the store', () => {
    it('MECHANISM — `curtain-wall.created` must list `baseOffset` and `panelThickness`, not only the fields it already carried', async () => {
        const ev = await cwCreatedEventFor({
            id: nextCwId(), levelId: LEVEL_ID, baseLine: BASE_LINE,
            height: 3.4, baseOffset: 1.5, panelThickness: 0.024, mullionThickness: 0.06,
        });
        // Positive control on the SAME object: a field that WAS on the emit list.
        expect(ev['mullionThickness'], 'mullionThickness was always carried').toBe(0.06);
        expect(
            ev['baseOffset'],
            'the bridge tested `typeof _cwEv["baseOffset"] === "number"` against an emitter that never listed it',
        ).toBe(1.5);
        expect(
            ev['panelThickness'],
            'same defect, second field — ScheduleExtractor:366 prints this value and the AI registry writes it',
        ).toBe(0.024);
    });

    it('ARM 1 — an authored `baseOffset` reaches the CurtainWallStore instead of the hardcoded 0', async () => {
        const stored = await storedCurtainWall({ baseOffset: 1.5 });
        expect(stored['baseOffset']).toBe(1.5);
        expect(stored['baseOffset'], 'the constant-false guard always fell through to 0').not.toBe(0);
    });

    it('ARM 2 — an authored `panelThickness` reaches the store instead of the hardcoded 0.05', async () => {
        const stored = await storedCurtainWall({ panelThickness: 0.024 });
        expect(stored['panelThickness']).toBe(0.024);
        expect(stored['panelThickness']).not.toBe(0.05);
    });

    it('CONTROL — with nothing authored, the SAME expressions still yield the documented defaults', async () => {
        const stored = await storedCurtainWall();
        expect(stored['baseOffset'], 'unstated baseOffset is 0, as before').toBe(0);
        expect(stored['panelThickness'], 'unstated panelThickness is 0.05, as before').toBe(0.05);
        // The geometry the bridge always carried must be untouched by this change.
        expect(stored['height']).toBe(3.4);
        expect(stored['gridXSpacing']).toBe(1.2);
        expect(stored['gridYSpacing']).toBe(1.5);
        expect(stored['mullionSize']).toBe(0.05);
        expect(stored['levelId']).toBe(LEVEL_ID);
    });

    it('ARM 3 — `materialId` is no longer destroyed at the bridge, and the hop that cannot place it SAYS SO', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const ev = await cwCreatedEventFor({
                id: nextCwId(), levelId: LEVEL_ID, baseLine: BASE_LINE, materialId: 'mat-anodised-alu',
            });
            expect(
                ev['materialId'],
                'materialId is on the L0 CurtainWall schema (CurtainWall.ts:71) and CEB dropped it outright',
            ).toBe('mat-anodised-alu');
            const record = curtainWallRecordFromCreatedEvent(ev as never);
            expect(record, 'the wall must still be mirrored — geometry is not forfeit over a material').not.toBeNull();
            expect(warn, 'the shortfall must be said out loud, not dropped silently').toHaveBeenCalled();
            expect(String(warn.mock.calls[0]?.[0])).toContain('materialId');
        } finally {
            warn.mockRestore();
        }
    });

    it('ARM 3 CONTROL — a wall WITHOUT materialId warns about nothing, so ARM 3 is not warning unconditionally', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            await storedCurtainWall();
            expect(warn).not.toHaveBeenCalled();
        } finally {
            warn.mockRestore();
        }
    });

    it('ARM 4 — the accepted command-type set is exactly what the sole emitter can write', () => {
        // Paired positive + negative on the SAME value.
        expect(
            ACCEPTED_CURTAIN_WALL_COMMAND_TYPES.has('curtain-wall.create'),
            'CommandEventBridge writes this literal on BOTH its single and its batch case',
        ).toBe(true);
        for (const dead of ['curtain-wall.batch.create', 'curtainwall.create', 'curtainwall.batch.create']) {
            expect(
                ACCEPTED_CURTAIN_WALL_COMMAND_TYPES.has(dead),
                `${dead} is an accept-arm no emitter can satisfy — C84 EI-2b`,
            ).toBe(false);
        }
        expect(ACCEPTED_CURTAIN_WALL_COMMAND_TYPES.size).toBe(1);
    });

    it('ARM 4 MECHANISM — the batch case really does write the single-create literal', async () => {
        const { wireCommandEventBridge } = await import(
            '../../../packages/runtime-composer/src/CommandEventBridge'
        );
        const seen: string[] = [];
        let emit!: (bytes: unknown, record: unknown) => void;
        const patches = { subscribe: (cb: (b: unknown, r: unknown) => void) => { emit = cb; return () => {}; } };
        const events = {
            emit: (name: string, p: unknown) => {
                if (name === 'curtain-wall.created') seen.push(String((p as Record<string, unknown>)['commandType']));
            },
        };
        wireCommandEventBridge(patches as never, events as never);
        emit(new Uint8Array(), {
            id: 'evt-cw-batch', type: 'curtain-wall.batch.create',
            payload: { levelId: LEVEL_ID, curtainWalls: [{ id: nextCwId(), baseLine: BASE_LINE }] },
            affectedStores: ['curtainwall'], audit: { actorId: 'probe' }, forward: [],
        });
        expect(seen).toEqual(['curtain-wall.create']);
        expect(seen).not.toContain('curtain-wall.batch.create');
    });
});
