/**
 * §FIX-OPENINGS-FAST-PATH-UNREACHABLE (W2-2, EV-03 R-3) — THE SEAM TEST.
 *
 * ── Why this file exists, and why WallDeltaClassifier.test.ts could not catch
 *    the bug it is written for ────────────────────────────────────────────────
 *
 * ADR-057 P1 shipped a correct openings-only rebuild fast path. It was also
 * completely unreachable in production for ~every door and window move, because
 * `WallStore.updateDoor` / `updateWindow` called `this.emit('update', frozen)`
 * with TWO arguments where the signature takes three — so `classifyWallDelta`
 * hit guard 3 (`if (!prevState) return { kind:'whole-level', reason:'no-prevState' }`)
 * and every drag re-solved the whole storey.
 *
 * The existing classifier suite passed the entire time. It had to: its subject is
 * a HAND-BUILT `prevState` fixture. A test that constructs the very argument the
 * emitter forgot to pass is, by construction, incapable of detecting that the
 * emitter forgot to pass it — it tests the classifier and stops one call short of
 * the seam. This suite therefore never writes a `prevState` of its own. Every
 * batch it classifies is assembled from the events the REAL `WallStore` actually
 * emitted during a REAL opening edit, so the third argument is the thing under
 * test rather than the thing supplied.
 *
 * Structure mirrors the certification doctrine "a criterion scores PASS only on a
 * run that could have said otherwise": the last test in each block re-classifies
 * the SAME captured event with `prevState` deleted and asserts
 * `whole-level / no-prevState`, proving the assertion above is discriminating and
 * not merely true.
 */

import { describe, it, expect } from 'vitest';

import { WallStore } from '../src/WallStore';
import { classifyWallDelta, type WallDeltaEntry } from '../src/WallDeltaClassifier';
import type { WallData, DoorData, WindowData } from '../src/WallTypes';
import { ProjectContext } from '@pryzm/core-app-model';
import { SetDoorOffsetCommand } from '@pryzm/command-registry';
import type { CommandContext } from '@pryzm/command-registry';

const LEVEL_ID = 'level-0';

function makeLevelProvider() {
    const level = { id: LEVEL_ID, name: 'Ground', elevation: 0, height: 3, childrenIds: [] };
    return {
        getLevelById: (id: string) => (id === LEVEL_ID ? { ...level } : undefined),
        getLevels: () => [{ ...level }],
    };
}

function newStore(): WallStore {
    return new WallStore(
        new ProjectContext(),
        makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1],
    );
}

/** A 6 m × 3 m wall hosting one opening of the requested kind. */
function makeHostWall(kind: 'door' | 'window'): WallData {
    return {
        id: 'w_host',
        type: 'wall',
        levelId: LEVEL_ID,
        properties: {},
        childrenIds: [`${kind}_1`],
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
        height: 3,
        thickness: 0.2,
        baseOffset: 0,
        openings: [{
            id: 'op_1',
            type: kind,
            elementId: `${kind}_1`,
            offset: 1.5,
            width: 0.9,
            height: kind === 'door' ? 2.1 : 1.2,
            sillHeight: kind === 'door' ? 0 : 0.9,
        }],
        metadata: { createdAt: 1, modifiedAt: 1, createdBy: 't', version: 1 },
    } as unknown as WallData;
}

function hostedDoor(): DoorData {
    return {
        id: 'door_1', type: 'door', levelId: LEVEL_ID, parentId: 'w_host',
        wallId: 'w_host', openingId: 'op_1',
        width: 0.9, height: 2.1, sillHeight: 0, offset: 1.5,
        frameThickness: 0.15, frameWidth: 0.05,
        properties: { mark: 'DO001' },
    } as unknown as DoorData;
}

function hostedWindow(): WindowData {
    return {
        id: 'window_1', type: 'window', levelId: LEVEL_ID, parentId: 'w_host',
        wallId: 'w_host', openingId: 'op_1',
        width: 0.9, height: 1.2, sillHeight: 0.9, offset: 1.5,
        frameThickness: 0.15, frameWidth: 0.05,
        properties: { mark: 'WN001' },
    } as unknown as WindowData;
}

/**
 * Subscribes to the store and records the events VERBATIM as classifier batch
 * entries. The `prevState` field is copied straight off the emit's third
 * argument — never synthesised here. That is the whole point of this harness.
 */
function captureBatch(store: WallStore): { entries: WallDeltaEntry[]; stop: () => void } {
    const entries: WallDeltaEntry[] = [];
    const stop = store.subscribe((event, wall, prevState) => {
        entries.push({ event, wall, prevState });
    });
    return { entries, stop };
}

describe('§FIX-OPENINGS-FAST-PATH-UNREACHABLE — the emitter→classifier seam', () => {

    it('a REAL door offset edit through WallStore classifies openings-only', () => {
        const store = newStore();
        store.add(makeHostWall('door'));
        store.addDoor(hostedDoor());

        const { entries, stop } = captureBatch(store);
        store.updateDoor('door_1', { offset: 3.2 });     // the real edit
        stop();

        // The store must have spoken at all — emptiness is never a pass.
        expect(entries.length).toBeGreaterThan(0);
        const updates = entries.filter(e => e.event === 'update');
        expect(updates.length).toBeGreaterThan(0);

        const result = classifyWallDelta(updates);
        expect(result.kind).toBe('openings-only');
        if (result.kind === 'openings-only') {
            expect(result.wallIds).toEqual(['w_host']);
            expect(result.levelId).toBe(LEVEL_ID);
        }
    });

    it('a REAL window offset edit through WallStore classifies openings-only', () => {
        const store = newStore();
        store.add(makeHostWall('window'));
        store.addWindow(hostedWindow());

        const { entries, stop } = captureBatch(store);
        store.updateWindow('window_1', { offset: 3.2 });
        stop();

        const updates = entries.filter(e => e.event === 'update');
        expect(updates.length).toBeGreaterThan(0);
        expect(classifyWallDelta(updates).kind).toBe('openings-only');
    });

    it('the door OFFSET actually moved — the batch is a real edit, not a no-op emit', () => {
        const store = newStore();
        store.add(makeHostWall('door'));
        store.addDoor(hostedDoor());

        const { entries, stop } = captureBatch(store);
        store.updateDoor('door_1', { offset: 3.2 });
        stop();

        const update = entries.find(e => e.event === 'update')!;
        const prevOpening = update.prevState!.openings![0];
        const nextOpening = update.wall.openings![0];
        expect(prevOpening.offset).toBeCloseTo(1.5, 6);
        expect(nextOpening.offset).toBeCloseTo(3.2, 6);
        // Same opening SET, only its value moved — which is exactly the shape the
        // fast path is proved safe for.
        expect(prevOpening.id).toBe(nextOpening.id);
    });

    it('SetDoorOffsetCommand — the production verb — reaches the fast path', () => {
        const store = newStore();
        store.add(makeHostWall('door'));
        store.addDoor(hostedDoor());

        const ctx = { stores: { wallStore: store } } as unknown as CommandContext;
        const cmd = new SetDoorOffsetCommand('door_1', 3.2, 1.5);
        expect(cmd.canExecute(ctx).ok).toBe(true);

        const { entries, stop } = captureBatch(store);
        cmd.execute(ctx);
        stop();

        const updates = entries.filter(e => e.event === 'update');
        expect(updates.length).toBeGreaterThan(0);
        expect(classifyWallDelta(updates).kind).toBe('openings-only');
    });

    it('CONTROL — the same captured event WITHOUT prevState falls to whole-level/no-prevState', () => {
        // This is the pre-fix world, reproduced from the post-fix capture by
        // deleting exactly the argument the fix adds. It proves the assertions
        // above are discriminating: they are decided by the emitter's third
        // argument and by nothing else. Before the fix, the four tests above
        // returned this verdict.
        const store = newStore();
        store.add(makeHostWall('door'));
        store.addDoor(hostedDoor());

        const { entries, stop } = captureBatch(store);
        store.updateDoor('door_1', { offset: 3.2 });
        stop();

        const stripped: WallDeltaEntry[] = entries
            .filter(e => e.event === 'update')
            .map(e => ({ event: e.event, wall: e.wall }));

        const result = classifyWallDelta(stripped);
        expect(result.kind).toBe('whole-level');
        if (result.kind === 'whole-level') expect(result.reason).toBe('no-prevState');
    });
});
