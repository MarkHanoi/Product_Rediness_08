/**
 * ⭐ §FIX-ORPHANED-HOSTED-MESH (L-3400 … L-3403, founder 2026-08-22) — THE WINDOW THAT
 * SURVIVES ITS OWN UNDO.
 *
 * ── WHAT THE FOUNDER SAW ────────────────────────────────────────────────────────────
 * He undid all his changes. A window stayed in the 3-D view with no opening under it. He
 * could SELECT it. He could not DELETE it. It did not appear in plan.
 *
 * His console carries the whole mechanism:
 *
 *     [CommandManager] UNDO: ADD_OPENING (history remaining: 0)
 *     [BimManager] Unregistered element 2f9fb49c-...
 *     [VDT] §G3-STALE-EVENT for unregistered element 2f9fb49c-... type= window
 *     [CommandManager] UNDO result: success=true
 *     ...
 *     [PickDiag] candidates=[Window:2f9fb49c@197.27, ...]
 *     [CommandManager] REFUSED DELETE_ELEMENT: Element 2f9fb49c-... not found in any store
 *
 * ── THE ROOT, MEASURED (not a theory about what "probably" happened) ────────────────
 * `WindowBuilder` builds on a QUEUE. `windowStore` 'add' calls `_enqueue()`, which stores
 * the task and schedules a `pre-render` callback for a LATER frame. `windowStore` 'remove'
 * calls `dispose()`, which — before this fix — only tore down what was ALREADY BUILT.
 *
 * So an undo that lands between the enqueue and the drain hits this order:
 *
 *     add    -> _enqueue()            task parked, nothing in the scene yet
 *     remove -> dispose()             NO-OP: windowGroups has no entry for this id
 *     tick   -> _drainBuildQueue()    builds the group and adds it to the scene
 *
 * The result is an object in the SCENE and in NO STORE — which is precisely, and in one
 * mechanism, every symptom he listed:
 *   • 3-D shows it        — the scene object is real.
 *   • plan does NOT       — plan projection is registry/store-driven, so a scene orphan
 *                           is invisible to it. ⭐ THE DIVERGENCE IS THE DIAGNOSTIC: it
 *                           localises the orphan to the scene graph, not to a store.
 *   • delete REFUSES      — `DeleteElementCommand.canExecute` is right to refuse; the
 *                           record genuinely is not there.
 *
 * ⛔ THE ASSERTIONS BELOW READ THE SCENE GRAPH, NEVER A FUNCTION'S RETURN VALUE. That is
 * the whole point: the defect IS that a pure-function-level "the store no longer has it"
 * was true the entire time the founder was looking at the window
 * ([[committed-is-not-reachable]]). A test that asserted `windowStore.has(id) === false`
 * would have passed against the broken build.
 *
 * ⛔ NON-VACUITY IS TESTED EXPLICITLY. If the drain never built anything for ANY window,
 * every "the scene is empty" assertion would pass for the wrong reason, so §1 first proves
 * the same harness DOES put a group in the scene on the ordinary path.
 *
 * C84 (Element Integrity) — mandatory for an element-family change.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { getFrameScheduler, _resetFrameSchedulerForTest, FakeRafAdapter } from '@pryzm/frame-scheduler';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { WindowBuilder } from '../src/WindowBuilder';
import { windowStore } from '../src/WindowStore';

const WALL = {
    id: 'w-orphan', levelId: 'L0', thickness: 0.2, height: 3, baseOffset: 0,
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }],
};

function win(id: string) {
    return {
        id, wallId: 'w-orphan', openingId: 'o-' + id,
        offset: 2, width: 1.2, height: 1.4, sillHeight: 0.9,
        frameThickness: 0.05, frameDepth: 0.2, frameColor: '#e8e8e8',
        columnRatios: [1], rowRatios: [1],
        columnDividerThickness: 0.03, rowDividerThickness: 0.03,
        sill: true, sillDepth: 0.08, sillThickness: 0.03,
        glassOpacity: 0.3, windowType: 'single',
    } as never;
}

let scene: THREE.Scene;
let builder: WindowBuilder;
let raf: FakeRafAdapter;

/**
 * Run the frame the builder scheduled. THIS IS THE TICK THE FOUNDER'S UNDO RACED, and it
 * is driven through the real `FrameScheduler` on a fake rAF clock rather than by poking
 * the builder's private drain — the race only exists BECAUSE the build is deferred to a
 * frame, so a test that skipped the frame would not be testing it.
 */
function pumpFrame(): void {
    raf.pumpFrames(1);
}

/** THE assertion surface — the scene graph, by the name the builder gives its group. */
function sceneGroupFor(id: string): THREE.Object3D | undefined {
    let found: THREE.Object3D | undefined;
    scene.traverse((o) => { if (o.name === 'window-' + id) found = o; });
    return found;
}

beforeEach(() => {
    _resetFrameSchedulerForTest();
    raf = new FakeRafAdapter();
    getFrameScheduler().start(raf);
    windowStore.clear?.();
    scene = new THREE.Scene();
    builder = new WindowBuilder(scene, {
        getById: () => WALL,
        getLevelById: () => ({ id: 'L0', elevation: 0 }),
    } as never);
    builder.activate();
});

afterEach(() => {
    builder.deactivate?.();
    windowStore.clear?.();
    getFrameScheduler().stop();
    _resetFrameSchedulerForTest();
});

describe('§1 — NON-VACUITY: the harness really does build a window into the scene', () => {
    it('add + one frame puts a group in the scene and a root in the registry', () => {
        windowStore.add(win('win-live'));
        pumpFrame();
        expect(sceneGroupFor('win-live')).toBeDefined();
        expect(elementRegistry.getRoot('win-live')).toBeDefined();
    });
});

describe('§2 — ⭐ THE FOUNDER DEFECT: undo BEFORE the build frame must leave nothing behind', () => {
    it('add -> remove -> frame leaves NO scene object (the queued build is cancelled)', () => {
        windowStore.add(win('win-orphan'));
        // Ctrl+Z lands here — after the enqueue, before the drain. This is the exact race.
        windowStore.remove('win-orphan');
        pumpFrame();
        pumpFrame(); // a second frame, in case the drain re-armed itself

        expect(sceneGroupFor('win-orphan')).toBeUndefined();
        expect(elementRegistry.getRoot('win-orphan')).toBeUndefined();
        // and the store agrees — an orphan is defined by these two DISAGREEING.
        expect(windowStore.has('win-orphan')).toBe(false);
    });

    it('⛔ the ONE fact that defines the orphan: scene and store never disagree', () => {
        windowStore.add(win('win-a'));
        windowStore.add(win('win-b'));
        windowStore.remove('win-a');
        pumpFrame();
        pumpFrame();

        // b survives because it was never removed — so the removal is TARGETED, not a
        // blanket "the queue was dropped", which would be a different (and worse) bug.
        expect(windowStore.has('win-b')).toBe(true);
        expect(sceneGroupFor('win-b')).toBeDefined();

        expect(windowStore.has('win-a')).toBe(false);
        expect(sceneGroupFor('win-a')).toBeUndefined();
    });

    it('the ALREADY-BUILT case still works — this fix must not regress the normal delete', () => {
        windowStore.add(win('win-built'));
        pumpFrame();
        expect(sceneGroupFor('win-built')).toBeDefined();   // built first, THEN removed
        windowStore.remove('win-built');
        expect(sceneGroupFor('win-built')).toBeUndefined();
        pumpFrame();
        expect(sceneGroupFor('win-built')).toBeUndefined();
    });
});
