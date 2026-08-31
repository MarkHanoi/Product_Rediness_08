/**
 * §AXIS-L-W1 (2026-08-31) — a duplicate create event STILL registers VDT + bimManager.
 *
 * ─── THE DEFECT ─────────────────────────────────────────────────────────────
 * Ten bus→legacy-store bridges in `initTools.ts` early-returned on a dedup hit
 * BEFORE `viewDependencyTracker.registerElement` + `bimManager.registerElement`.
 * So a duplicate create event — or an element that reached the legacy store via
 * another path (legacy-first dual dispatch, persistence, sync) — never registered
 * for plan view or the BIM tree. Wall (§P2.1 / §FIX-VDT-DUAL-PATH) was the only
 * correct family: its guard gates the add() mirror ONLY.
 *
 * ─── WHY THIS HARNESS EXTRACTS THE REAL CLOSURES ────────────────────────────
 * `initTools()` needs a THREE world and twenty stores to run one line, so its
 * closures are unreachable from any suite by import — which is exactly how the
 * guard-order defect survived (the L-972/L-973 lesson). This harness therefore
 * reads `initTools.ts`, locates the `runtime.events.on('<family>.created', …)`
 * arrow function via the TypeScript AST (comment- and brace-safe), transpiles
 * THAT text and executes it against a real legacy store + recording sinks. The
 * code under test is the shipped text, not a copy — edit the closure and this
 * suite sees the edit on the next run.
 *
 * Three families:
 *   ceiling  — was ADD-BEFORE-REGISTER behind the guard (order-fixed §G3-STALE-FIX)
 *   lighting — was REGISTER-BEFORE-ADD but the guard sat above the registration
 *   door     — §P2.3-REG (lane L3a, 2026-08-31): the wall.opening.created bridge had
 *              NO registration at all (L2b measurement, Probe B: vdt=0, bim=0 on the
 *              shipped arrow); registration now sits above the dedup guard, keyed on
 *              the opening's ELEMENT id against the HOST wall's levelId
 *
 * The recording sinks reproduce the PROVEN semantics of the real ones:
 *   VDT.registerElement        = Map.set (replace)        — ViewDependencyTracker.ts:453-455
 *   BimManager.registerElement = includes-guarded push,
 *                                throws on empty levelId  — BimKernel.ts:243-268
 *
 * ─── FALSIFICATION CONTROL (manual, recorded in the lane findings) ──────────
 * Re-introduce ONE early return above the registration in initTools.ts
 * (e.g. restore `if (ceilingStore.has(ceilingRecord.id)) return;` above the
 * hoisted registration block) → the duplicate-delivery arms FAIL. Restore the
 * file byte-for-byte → they PASS. The harness reads the file at run time, so
 * the control genuinely exercises the shipped text.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { CeilingStore, FLOOR_MOUNTED_FIXTURES, generateMark } from '@pryzm/core-app-model';
import { ceilingRecordFromCreatedEvent } from '../src/engine/ceilingCreatedMirror';
// Deep import, NOT the `@pryzm/geometry-lighting` barrel: the barrel exports
// `LightingFragmentBuilder`, which imports THREE at module scope. Same dodge as
// CeilingBridgeCarriesAuthoredFinish.test.ts uses for runtime-composer.
import { LightingStore } from '../../../packages/geometry-lighting/src/LightingStore';
// Deep imports for the same reason — the `@pryzm/geometry-door` barrel exports
// DoorBuilder, which imports THREE at module scope. The REAL DoorStore class and the
// REAL buildDoorStoreRecord chokepoint (C11 §3) are both Node-safe by deep path.
import { DoorStore } from '../../../packages/geometry-door/src/DoorStore';
import { buildDoorStoreRecord } from '../../../packages/geometry-door/src/DoorOpeningFactory';

// ─── harness ────────────────────────────────────────────────────────────────

const initToolsSource: Promise<string> = readFile(
    new URL('../src/engine/initTools.ts', import.meta.url),
    'utf8',
);

/** Locate `*.events.on('<eventName>', (ev) => { … })` and return the arrow's text. */
function extractHandlerText(src: string, eventName: string): string {
    const sf = ts.createSourceFile('initTools.ts', src, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
    let found: ts.ArrowFunction | undefined;
    const visit = (node: ts.Node): void => {
        if (found) return;
        if (
            ts.isCallExpression(node) &&
            ts.isPropertyAccessExpression(node.expression) &&
            node.expression.name.text === 'on' &&
            node.arguments.length >= 2 &&
            ts.isStringLiteral(node.arguments[0]) &&
            node.arguments[0].text === eventName &&
            ts.isArrowFunction(node.arguments[1])
        ) {
            found = node.arguments[1];
            return;
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    if (!found) throw new Error(`no ${eventName} handler found in initTools.ts`);
    return found.getText(sf);
}

/** Transpile the extracted TS arrow and bind its free identifiers to the given deps. */
function compileHandler(arrowText: string, deps: Record<string, unknown>): (ev: unknown) => void {
    const js = ts.transpileModule(`const __h = (${arrowText});`, {
        compilerOptions: { target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const names = Object.keys(deps);
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const factory = new Function(...names, `${js}\nreturn __h;`);
    return factory(...names.map((n) => deps[n])) as (ev: unknown) => void;
}

/** Faithful to ViewDependencyTracker.ts:453-455 — Map.set, replace semantics. */
function makeVdt() {
    const map = new Map<string, string>();
    const calls: Array<[string, string]> = [];
    return {
        map,
        calls,
        registerElement(id: string, levelId: string): void {
            map.set(id, levelId);
            calls.push([id, levelId]);
        },
    };
}

/** Faithful to BimKernel.ts:243-268 — throws on empty levelId, includes-guarded push. */
function makeBim() {
    const childrenIds: string[] = [];
    const calls: Array<[string, string]> = [];
    return {
        childrenIds,
        calls,
        registerElement(id: string, levelId: string): void {
            calls.push([id, levelId]);
            if (!levelId) throw new Error('Spatial Authority Violation: levelId is mandatory for element registration.');
            if (!childrenIds.includes(id)) childrenIds.push(id);
        },
        getLevelById(_id: string): { elevation: number; height: number } {
            return { elevation: 0, height: 3 };
        },
    };
}

const RECT = [
    { x: 0, y: 0, z: 0 },
    { x: 4, y: 0, z: 0 },
    { x: 4, y: 0, z: 3 },
    { x: 0, y: 0, z: 3 },
];

// ─── ceiling — the order-fixed shape ────────────────────────────────────────

describe('§AXIS-L-W1 ceiling — duplicate ceiling.created still registers (order-fixed shape)', () => {
    it('same event twice: ONE store record, registration on BOTH deliveries, registration BEFORE add, no doubled BIM row', async () => {
        const src = await initToolsSource;
        const text = extractHandlerText(src, 'ceiling.created');

        // Structural belt (diagnostic clarity when the behavioural arms fail):
        // registration must appear ABOVE the dedup guard AND above the add().
        const regAt = text.indexOf('viewDependencyTracker.registerElement(ceilingRecord.id');
        const guardAt = text.indexOf('if (ceilingStore.has(ceilingRecord.id)) return;');
        const addAt = text.indexOf('ceilingStore.add(ceilingRecord)');
        expect(regAt, 'ceiling handler must register in VDT').toBeGreaterThan(-1);
        expect(guardAt, 'ceiling handler must keep its dedup guard').toBeGreaterThan(-1);
        expect(addAt, 'ceiling handler must still mirror into the store').toBeGreaterThan(-1);
        expect(regAt, 'registration must sit ABOVE the dedup guard (§AXIS-L-W1)').toBeLessThan(guardAt);
        expect(regAt, 'registration must sit ABOVE the add() (§G3-STALE-FIX)').toBeLessThan(addAt);

        const ceilingStore = new CeilingStore();
        const vdt = makeVdt();
        const bim = makeBim();
        const handler = compileHandler(text, {
            ceilingRecordFromCreatedEvent,
            ceilingStore,
            viewDependencyTracker: vdt,
            bimManager: bim,
        });

        const ev = {
            commandType: 'ceiling.create',
            id: 'axisL-dup-ceiling-1',
            levelId: 'L0',
            boundary: RECT,
            ceilingHeight: 2.7,
            thickness: 0.03,
        };

        handler(ev);
        expect(ceilingStore.getAll().length, 'first delivery mirrors ONE ceiling').toBe(1);
        expect(vdt.calls.length, 'first delivery registers in VDT').toBe(1);
        expect(bim.calls.length, 'first delivery registers in bimManager').toBe(1);
        expect(vdt.map.get('axisL-dup-ceiling-1')).toBe('L0');

        handler(ev); // THE defect made executable: the SAME create event again
        expect(ceilingStore.getAll().length, 'duplicate delivery must NOT double the store record').toBe(1);
        expect(vdt.calls.length, 'VDT registration must STILL occur on the duplicate delivery').toBe(2);
        expect(bim.calls.length, 'bimManager registration must STILL occur on the duplicate delivery').toBe(2);
        expect(
            bim.childrenIds.filter((id) => id === 'axisL-dup-ceiling-1').length,
            'the BIM tree must hold exactly ONE row for the id — a doubled row is a worse defect than the one fixed',
        ).toBe(1);
        expect(vdt.map.size, 'VDT holds exactly one entry for the id (Map.set replace)').toBe(1);
    });
});

// ─── lighting — the guard-only shape ────────────────────────────────────────

describe('§AXIS-L-W1 lighting — duplicate lighting.created still registers (guard-only shape)', () => {
    it('same event twice: ONE store record, ONE mesh build, registration on BOTH deliveries', async () => {
        const src = await initToolsSource;
        const text = extractHandlerText(src, 'lighting.created');

        const regAt = text.indexOf('viewDependencyTracker.registerElement(ev.id, _regLevelId)');
        const guardAt = text.indexOf('if (_ls.has(ev.id)) return;');
        const addAt = text.indexOf('_ls.add(_data)');
        expect(regAt, 'lighting handler must register in VDT').toBeGreaterThan(-1);
        expect(guardAt, 'lighting handler must keep its dedup guard').toBeGreaterThan(-1);
        expect(addAt, 'lighting handler must still mirror into the store').toBeGreaterThan(-1);
        expect(regAt, 'registration must sit ABOVE the dedup guard (§AXIS-L-W1)').toBeLessThan(guardAt);
        expect(regAt, 'registration must sit ABOVE the add() (§G3-STALE-FIX)').toBeLessThan(addAt);

        const lightingStore = new LightingStore();
        const builderAdds: unknown[] = [];
        const vdt = makeVdt();
        const bim = makeBim();
        const handler = compileHandler(text, {
            window: {
                lightingStore,
                lightingBuilder: { add: (d: unknown) => { builderAdds.push(d); } },
            },
            viewDependencyTracker: vdt,
            bimManager: bim,
            FLOOR_MOUNTED_FIXTURES,
            // Seating resolvers stubbed: their output feeds only position.y, which is
            // not under test here; the REAL ones are covered by their own suites.
            resolveFloorSeatingDatumFrom: () => ({ x: 0, y: 0, z: 0 }),
            resolveCeilingSeatingDatumFrom: () => ({ x: 0, y: 0, z: 0 }),
            floorStore: { getByLevel: () => [] },
            ceilingStore: { getByLevel: () => [] },
        });

        const ev = {
            commandType: 'lighting.create',
            id: 'axisL-dup-light-1',
            levelId: 'L0',
            origin: { x: 1, y: 0, z: 2 },
            kind: 'downlight',
        };

        handler(ev);
        expect(lightingStore.has('axisL-dup-light-1'), 'first delivery mirrors the fixture').toBe(true);
        expect(lightingStore.getAll().length, 'first delivery mirrors ONE fixture').toBe(1);
        expect(builderAdds.length, 'first delivery builds ONE mesh').toBe(1);
        expect(vdt.calls.length, 'first delivery registers in VDT').toBe(1);
        expect(bim.calls.length, 'first delivery registers in bimManager').toBe(1);

        handler(ev); // the SAME create event again
        expect(lightingStore.getAll().length, 'duplicate delivery must NOT double the store record').toBe(1);
        expect(builderAdds.length, 'duplicate delivery must NOT double-build the mesh — the guard still gates the mirror').toBe(1);
        expect(vdt.calls.length, 'VDT registration must STILL occur on the duplicate delivery').toBe(2);
        expect(bim.calls.length, 'bimManager registration must STILL occur on the duplicate delivery').toBe(2);
        expect(
            bim.childrenIds.filter((id) => id === 'axisL-dup-light-1').length,
            'the BIM tree must hold exactly ONE row for the id',
        ).toBe(1);
    });

    it('empty levelId still refuses SPATIAL registration by name (§DIAG-WALL-LEVEL preserved), and the mirror still lands', async () => {
        const src = await initToolsSource;
        const text = extractHandlerText(src, 'lighting.created');
        const lightingStore = new LightingStore();
        const vdt = makeVdt();
        const bim = makeBim();
        const handler = compileHandler(text, {
            window: { lightingStore, lightingBuilder: { add: () => {} } },
            viewDependencyTracker: vdt,
            bimManager: bim,
            FLOOR_MOUNTED_FIXTURES,
            resolveFloorSeatingDatumFrom: () => ({ x: 0, y: 0, z: 0 }),
            resolveCeilingSeatingDatumFrom: () => ({ x: 0, y: 0, z: 0 }),
            floorStore: { getByLevel: () => [] },
            ceilingStore: { getByLevel: () => [] },
        });

        handler({ commandType: 'lighting.create', id: 'axisL-nolevel-light', origin: { x: 0, y: 0, z: 0 } });
        expect(vdt.calls.length, 'no spatial registration under an EMPTY levelId — an orphan id must not be minted').toBe(0);
        expect(bim.calls.length, 'no bimManager registration under an EMPTY levelId').toBe(0);
        expect(lightingStore.has('axisL-nolevel-light'), 'the legacy record itself still lands (S07 allows empty levelId)').toBe(true);
    });
});

// ─── door — the no-registration-at-all shape (§P2.3-REG, lane L3a) ──────────

/**
 * Faithful to WallStore.ts:1199-1326 (`addOpening`): the opening lands in the host
 * wall record's `openings` array under the SAME `id`, which is exactly the probe the
 * §P2.3 dedup guard runs (`_legacyWall?.openings?.some(existing => existing.id === id)`).
 * Recording fake — the real WallStore's barrel-mates pull THREE at module scope and
 * `add()` demands a Zod-valid wall, neither of which is under test here.
 */
function makeLegacyWallStore(wall: { id: string; levelId: string }) {
    const record: { id: string; levelId: string; openings: Array<Record<string, unknown>> } = {
        ...wall,
        openings: [],
    };
    const addOpeningCalls: Array<[string, Record<string, unknown>]> = [];
    return {
        record,
        addOpeningCalls,
        getById(id: string) {
            return id === record.id ? record : undefined;
        },
        addOpening(wallId: string, opening: Record<string, unknown>): void {
            addOpeningCalls.push([wallId, opening]);
            record.openings.push(opening);
        },
    };
}

describe('§P2.3-REG door — duplicate wall.opening.created still registers (no-registration shape)', () => {
    it('same event twice: ONE addOpening mirror, ONE DoorStore record, VDT+bim registered on BOTH deliveries against the host wall levelId', async () => {
        const src = await initToolsSource;
        const text = extractHandlerText(src, 'wall.opening.created');

        // Structural belt (diagnostic clarity when the behavioural arms fail):
        // registration must appear ABOVE the dedup guard AND above the addOpening mirror.
        const regAt = text.indexOf("viewDependencyTracker.registerElement(elementId, _legacyWall?.levelId ?? '')");
        const guardAt = text.indexOf('if (_legacyWall?.openings?.some((existing: any) => existing.id === id)) return;');
        const addAt = text.indexOf('_legacyWallStoreForOpeningBridge.addOpening(ev.wallId, opening as any)');
        expect(regAt, 'opening handler must register the ELEMENT id in VDT').toBeGreaterThan(-1);
        expect(guardAt, 'opening handler must keep its dedup guard').toBeGreaterThan(-1);
        expect(addAt, 'opening handler must still mirror into the legacy WallStore').toBeGreaterThan(-1);
        expect(regAt, 'registration must sit ABOVE the dedup guard (§AXIS-L-W1)').toBeLessThan(guardAt);
        expect(regAt, 'registration must sit ABOVE the addOpening() mirror (§G3-STALE-FIX)').toBeLessThan(addAt);

        const legacyWallStore = makeLegacyWallStore({ id: 'axisL-host-wall', levelId: 'L1' });
        const realDoorStore = new DoorStore();
        const vdt = makeVdt();
        const bim = makeBim();
        const handler = compileHandler(text, {
            _legacyWallStoreForOpeningBridge: legacyWallStore,
            doorStore: realDoorStore,
            buildDoorStoreRecord,
            // window branch is dead for a door event; stubs guard against accidental evaluation
            windowStore: { has: () => false, add: () => {}, getAll: () => [] },
            buildWindowStoreRecord: () => ({}),
            generateMark,
            viewDependencyTracker: vdt,
            bimManager: {
                ...bim,
                // resolveMark's level lookup — one level is enough for a real mark
                getLevels: () => [{ id: 'L1', name: 'Level 1' }],
            },
        });

        const ev = {
            wallId: 'axisL-host-wall',
            opening: {
                id: 'axisL-dup-open-1',
                elementId: 'axisL-dup-door-1',
                type: 'door',
                offset: 1.2,
                width: 0.9,
                height: 2.1,
                sillHeight: 0,
            },
        };

        handler(ev);
        expect(legacyWallStore.addOpeningCalls.length, 'first delivery mirrors ONE opening into the wall').toBe(1);
        expect(realDoorStore.has('axisL-dup-door-1'), 'first delivery mirrors the door record (real DoorStore, real buildDoorStoreRecord)').toBe(true);
        expect(realDoorStore.getAll().length, 'first delivery mirrors ONE door').toBe(1);
        expect(vdt.calls.length, 'first delivery registers in VDT').toBe(1);
        expect(bim.calls.length, 'first delivery registers in bimManager').toBe(1);
        expect(vdt.map.get('axisL-dup-door-1'), 'VDT registration keys the ELEMENT id against the HOST wall levelId').toBe('L1');
        expect(bim.calls[0], 'bimManager registration keys the ELEMENT id against the HOST wall levelId').toEqual(['axisL-dup-door-1', 'L1']);

        handler(ev); // THE defect made executable: the SAME create event again
        expect(legacyWallStore.addOpeningCalls.length, 'duplicate delivery must NOT double the wall-opening mirror — the guard still gates it').toBe(1);
        expect(realDoorStore.getAll().length, 'duplicate delivery must NOT double the DoorStore record').toBe(1);
        expect(vdt.calls.length, 'VDT registration must STILL occur on the duplicate delivery').toBe(2);
        expect(bim.calls.length, 'bimManager registration must STILL occur on the duplicate delivery').toBe(2);
        expect(
            bim.childrenIds.filter((id) => id === 'axisL-dup-door-1').length,
            'the BIM tree must hold exactly ONE row for the id — a doubled row is a worse defect than the one fixed',
        ).toBe(1);
        expect(vdt.map.size, 'VDT holds exactly one entry for the id (Map.set replace)').toBe(1);
    });

    it('missing host wall: bimManager throw lands in the NAMED console.error, never escapes, and the empty-level registration attempt is visible', async () => {
        const src = await initToolsSource;
        const text = extractHandlerText(src, 'wall.opening.created');
        const legacyWallStore = makeLegacyWallStore({ id: 'some-other-wall', levelId: 'L1' });
        const vdt = makeVdt();
        const bim = makeBim();
        const errors: unknown[][] = [];
        const consoleSpy = {
            log: () => {},
            warn: () => {},
            error: (...args: unknown[]) => { errors.push(args); },
        };
        const handler = compileHandler(text, {
            _legacyWallStoreForOpeningBridge: legacyWallStore,
            doorStore: { has: () => true, add: () => {}, getAll: () => [] }, // door mirror gated off — not under test
            buildDoorStoreRecord,
            windowStore: { has: () => false, add: () => {}, getAll: () => [] },
            buildWindowStoreRecord: () => ({}),
            generateMark,
            viewDependencyTracker: vdt,
            bimManager: { ...bim, getLevels: () => [] },
            console: consoleSpy,
        });

        // Host wall id resolves to NOTHING -> levelId '' -> bimManager.registerElement throws.
        expect(() => handler({
            wallId: 'axisL-ghost-wall',
            opening: { id: 'axisL-op-2', elementId: 'axisL-door-2', type: 'door', offset: 0, width: 0.9, height: 2.1, sillHeight: 0 },
        }), 'the bimManager throw must be caught inside the handler').not.toThrow();

        expect(bim.calls.length, 'bimManager.registerElement was attempted with the empty levelId').toBe(1);
        expect(bim.calls[0]).toEqual(['axisL-door-2', '']);
        expect(bim.childrenIds.length, 'the throw means NO BIM row was minted').toBe(0);
        const named = errors.filter((args) => typeof args[0] === 'string' && (args[0] as string).includes('§P2.3-REG: bimManager.registerElement FAILED for door'));
        expect(named.length, 'the failure is refused BY NAME (family + id) in console.error (C74 CA-18)').toBe(1);
        expect(named[0], 'the console.error names the element id').toContain('axisL-door-2');
    });
});
