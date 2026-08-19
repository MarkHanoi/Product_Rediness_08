// @vitest-environment happy-dom
/**
 * §GPU-CASTER-RELEASE-CHOKEPOINT (L-1290) / §FIX-HANDRAIL-PARAM-DOUBLE-REBUILD (L-1291)
 *
 * ═══ THE FOUNDER'S P0, ONE ROUTE OVER ══════════════════════════════════════
 *
 * L-1189 fixed *"changing a handrail TYPE loses the WebGPU device"* by putting
 * `bim-handrail-*` into the one classified list of geometry-caster mutation
 * events. A day later the identical crash came back for *"changing a railing
 * MATERIAL"*:
 *
 *   Destroyed texture [Texture "ShadowDepthTexture"] used in a submit.
 *   … and 2 automatic repair attempts did not fix it.
 *
 * The material route is not the type route. It runs through the GENERIC
 * `element.updateParameters` bridge (`initBusHandlers.ts:2203`) →
 * `UpdateElementParameterCommand` → `handrailStore.update()`. A per-family event
 * list is the wrong SHAPE for a generic parameter bridge: every new route has to
 * REMEMBER to announce itself, and this repo has been bitten by that shape five
 * times in a week.
 *
 * So the guard moved to where the danger IS. Every element builder frees its
 * meshes through `scheduleGpuRelease` / `detachAndReleaseChildren` (ADR-0297
 * INVARIANT L2 made that the only legal way), so the instant a shadow CASTER is
 * actually released is observable in the release funnel — with no cooperation
 * from the route that caused it.
 *
 * ⛔ NOTHING IN THE SUBJECT IS STUBBED. The real `HandrailStore`, the real
 * `UpdateElementParameterCommand`, the real `HandrailFragmentBuilder`, the real
 * `safeDispose` release queue. The only test double is the OBSERVER — which is
 * the thing under observation, not the thing under test (`RenderPipelineManager`
 * installs the production one; ARM D pins that wiring in the manager's own
 * suite). A fake built from the header cannot falsify the header.
 *
 * CONTRACTS: C04 §GPU-RESOURCE-LIFETIME · ADR-0297 (L1 ownership / L2 ordering) ·
 * ADR-0111 · C95 §15.5 (the 279-mesh / 93-material census) · C16 §8.6 (one
 * gesture, one command, one rebuild) · C84 EI-4a (a derived chokepoint beats an
 * enumerated one).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import {
    setShadowCasterReleaseObserver,
    hasShadowCasterReleaseObserver,
    subtreeHasShadowCaster,
    pendingGpuReleaseCount,
    drainGpuReleaseQueue,
} from '@pryzm/renderer-three';
import type { HandrailData } from '@pryzm/core-app-model/stores';
import { HandrailStore } from '@pryzm/core-app-model/stores';
import { HandrailFragmentBuilder } from '@pryzm/geometry-handrail';
import { UpdateElementParameterCommand } from '@pryzm/command-registry';

const stubBim = { getLevelById: (_id: string) => ({ elevation: 0 }) } as never;

/** The store's only dependency: the active-level source. Not the subject. */
const projectContext = { activeLevelId: 'level-1' } as never;

function railRecord(over: Partial<HandrailData> = {}): HandrailData {
    return {
        id: 'mat-route-rail',
        type: 'handrail',
        levelId: 'level-1',
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
        height: 1.0,
        thickness: 0.05,
        baseOffset: 0,
        materialColor: '#888888',
        fillType: 'baluster',
        balusterSpacing: 0.1,
        balusterShape: 'rectangular',
        balusterWidth: 0.02,
        postSpacing: 1.0,
        ...over,
    } as HandrailData;
}

function meshesOf(root: THREE.Object3D): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    root.traverse((o) => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh); });
    return out;
}

/**
 * `PascalSceneLighting._enableShadowsOnScene()` promotes every non-denylisted
 * mesh in the live scene to `castShadow = true`. `packages/geometry-handrail`
 * itself never writes `castShadow` (measured: zero occurrences in the package),
 * so a handrail's meshes acquire the flag from that pass — which has always run
 * by the time a user edits an EXISTING railing. Applying it here reproduces the
 * state of the meshes that are about to be released, which is the only state
 * this guard reads.
 */
function promoteToCasters(root: THREE.Object3D): number {
    let n = 0;
    for (const m of meshesOf(root)) { m.castShadow = true; n++; }
    return n;
}

describe('§GPU-CASTER-RELEASE-CHOKEPOINT — ARM A: the REAL material route notifies the frame owner', () => {
    let scene: THREE.Scene;
    let builder: HandrailFragmentBuilder;
    let store: HandrailStore;
    let notifications: number;

    beforeEach(() => {
        drainGpuReleaseQueue();           // start from an empty queue
        setShadowCasterReleaseObserver(null);
        notifications = 0;
        scene   = new THREE.Scene();
        builder = new HandrailFragmentBuilder(scene, stubBim);
        store   = new HandrailStore(projectContext);
    });

    afterEach(() => {
        setShadowCasterReleaseObserver(null);
        drainGpuReleaseQueue();
    });

    it('a material change on a live railing releases shadow casters, and the release ARMS the guard', () => {
        // ── Build the railing and put it in the state a user's scene is in ──────
        store.add(railRecord());
        const record = store.getAll().find((h) => h.id === 'mat-route-rail')!;
        builder.updateHandrail(record);

        const root = scene.children.find((c) => c.children.length > 0) ?? scene;
        const built = meshesOf(root);
        // PREMISE 1 — the builder emits real meshes. Without this the rest is vacuous.
        expect(built.length, 'the handrail builder must emit meshes').toBeGreaterThan(0);
        const promoted = promoteToCasters(root);
        expect(promoted).toBe(built.length);
        expect(subtreeHasShadowCaster(root), 'a promoted handrail subtree IS a caster set').toBe(true);

        // ── The observer the frame owner installs ──────────────────────────────
        setShadowCasterReleaseObserver(() => { notifications++; });
        expect(hasShadowCasterReleaseObserver()).toBe(true);

        // ── THE REAL GESTURE — the C100 material picker's verb, unmodified ──────
        // `element.updateParameters` { elementId, elementType:'handrail',
        // parameters:{ materialId } } is exactly what PropertyPanel.onApply()
        // dispatches (PropertyPanel.ts:973); the bridge at initBusHandlers.ts:2211
        // constructs precisely this command with precisely this payload.
        const cmd = new UpdateElementParameterCommand({
            elementId:   'mat-route-rail',
            elementType: 'handrail',
            parameters:  { materialId: 'metal-steel-brushed' },
        });
        const result = cmd.execute({ stores: { handrailStore: store } } as never);
        expect(result.success, `the real command must succeed: ${JSON.stringify(result.info)}`).toBe(true);

        // The command wrote the record; the rebuild is what the store event drives.
        const after = store.getAll().find((h) => h.id === 'mat-route-rail')!;
        expect((after as unknown as { materialId?: string }).materialId).toBe('metal-steel-brushed');

        // The rebuild itself — the real builder, re-run against the updated record,
        // which is what `initBuilders.ts:921` does on `bim-handrail-updated`.
        builder.updateHandrail(after);

        // ⛔ THE ASSERTION THAT FAILS WITHOUT THE FIX.
        // Before §GPU-CASTER-RELEASE-CHOKEPOINT the release funnel had no observer
        // slot at all, so a teardown reaching it told the frame owner nothing and
        // the shadow-safe window was opened only if some listener happened to
        // recognise the BIM event. Now the DISPOSE arms it.
        expect(
            notifications,
            'releasing a promoted handrail\'s meshes must notify the frame owner',
        ).toBeGreaterThan(0);

        // PREMISE 2 — the release really is DEFERRED, not performed on this tick.
        // (If it were immediate, arming a window afterwards would be pointless.)
        expect(pendingGpuReleaseCount(), 'the release must be queued for the frame boundary')
            .toBeGreaterThan(0);
    });

    it('the notification is COALESCED to once per release batch, not once per mesh', () => {
        store.add(railRecord({ id: 'coalesce-rail' }));
        const rec = store.getAll().find((h) => h.id === 'coalesce-rail')!;
        builder.updateHandrail(rec);
        const root = scene.children.find((c) => c.children.length > 0) ?? scene;
        const meshCount = promoteToCasters(root);
        // The coalescing only means something if there is more than one mesh to
        // coalesce — a 31-segment run is 279 of them (C95 §15.5).
        expect(meshCount).toBeGreaterThan(1);

        setShadowCasterReleaseObserver(() => { notifications++; });
        builder.updateHandrail(rec);

        expect(notifications, 'one window per batch, not one per released mesh').toBe(1);

        // …and the NEXT batch re-arms, or a second gesture would run unguarded.
        drainGpuReleaseQueue();
        promoteToCasters(scene);
        builder.updateHandrail(rec);
        expect(notifications, 'a batch drained is a window closed; the next release re-arms').toBe(2);
    });

    it('a release with NO shadow caster in it does not arm the window', () => {
        // The guard must not pause submits for geometry that cannot participate in
        // the shadow pass — that would be a per-edit frame skip for no safety.
        store.add(railRecord({ id: 'non-caster-rail' }));
        const rec = store.getAll().find((h) => h.id === 'non-caster-rail')!;
        builder.updateHandrail(rec);
        const root = scene.children.find((c) => c.children.length > 0) ?? scene;
        for (const m of meshesOf(root)) m.castShadow = false;
        expect(subtreeHasShadowCaster(root)).toBe(false);

        setShadowCasterReleaseObserver(() => { notifications++; });
        builder.updateHandrail(rec);
        expect(notifications, 'no caster released ⇒ no submit pause').toBe(0);
    });
});

describe('§FIX-HANDRAIL-PARAM-DOUBLE-REBUILD — ARM B: one gesture, ONE event', () => {
    let store: HandrailStore;

    beforeEach(() => { store = new HandrailStore(projectContext); });

    it('a material change through element.updateParameters emits bim-handrail-updated exactly ONCE', () => {
        store.add(railRecord({ id: 'emit-count-rail' }));

        let emitted = 0;
        const count = (): void => { emitted++; };
        window.addEventListener('bim-handrail-updated', count);
        try {
            const cmd = new UpdateElementParameterCommand({
                elementId:   'emit-count-rail',
                elementType: 'handrail',
                parameters:  { materialId: 'metal-steel-brushed' },
            });
            const result = cmd.execute({ stores: { handrailStore: store } } as never);
            expect(result.success).toBe(true);
        } finally {
            window.removeEventListener('bim-handrail-updated', count);
        }

        // ⛔ THE ASSERTION THAT FAILS WITHOUT THE FIX — it read 2.
        // `HandrailStore.update()` self-emits (HandrailStore.ts:203) AND the
        // command's legacy rebuild ladder emitted the same event again, so
        // `initBuilders.ts:921` tore down and re-minted the whole element TWICE for
        // one material pick — doubling what C95 §15.5 measures as the largest GPU
        // churn in the product, on the exact gesture the founder crashed on.
        expect(emitted, 'one write, one event, one rebuild (C16 §8.6)').toBe(1);
    });

    it('PREMISE — the store is the emitter, which is WHY the ladder\'s copy was redundant', () => {
        // The removal above rests entirely on this fact. If HandrailStore ever stops
        // self-emitting, this test fails HERE rather than leaving a railing that
        // silently never rebuilds.
        store.add(railRecord({ id: 'store-emits-rail' }));
        let emitted = 0;
        const count = (): void => { emitted++; };
        window.addEventListener('bim-handrail-updated', count);
        try {
            store.update('store-emits-rail', { materialColor: '#ff0000' });
        } finally {
            window.removeEventListener('bim-handrail-updated', count);
        }
        expect(emitted, 'HandrailStore.update() must announce its own write').toBe(1);
    });
});
