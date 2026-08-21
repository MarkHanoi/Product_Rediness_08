/**
 * §NAV-PICK-QUADRATIC (L-1850) — the GPU pick path must not scan the whole model
 * to answer a question about ONE group.
 *
 * ⭐ WHY THIS FILE EXISTS. `InstancedElementRenderer` is a MODULE-LEVEL SINGLETON.
 * Its `_elements` map holds every instanced registration in the project at once —
 * windows, walls, furniture, columns, beams, railings. `_createGroup` installs two
 * closures on every group, and both used to answer by walking ALL of it:
 *
 *     getOccupiedInstanceSlots()      O(N)  — called ONCE PER GROUP
 *     getInstanceElementId(slot)      O(N)  — called ONCE PER OCCUPIED SLOT
 *
 * `packages/picking/src/gpu-pick.ts` `_syncInstancedGroup` (lines 1190-1201) calls
 * them in exactly that pattern to build its membership signature, and
 * `SelectionManager` drives `syncPickScene()` from the HOVER rAF. One pass was
 * therefore `G·N + N²`, measured on the real renderer through the real closures:
 *
 *     N=500 → 7.9 ms · N=1000 → 13.7 ms · N=2000 → 73.0 ms
 *     N=4000 → 312.4 ms · N=6000 → 550.0 ms
 *
 * 312 ms of blocked main thread per pointermove is the founder's 2026-08-21
 * "nothing can be done - is frozen".
 *
 * ⛔ THE TIMING TEST IS NOT THE POINT AND MUST NOT BE THE ONLY TEST. A wall-clock
 * assertion is a proxy, and a slow CI box can make a linear implementation look
 * quadratic. So the file asserts TWO different things:
 *
 *   1. CORRECTNESS — the closures return exactly what they returned before, across
 *      register / re-register / unregister / re-key eviction / clear. This is the
 *      half that would let a wrong-but-fast index ship.
 *   2. INDEPENDENCE — answering for a ONE-MEMBER group costs the same whether the
 *      renderer holds 1 other registration or 10 000. That is the structural
 *      property; the margin between the two implementations here is ~1000x, which
 *      is what makes a wall-clock check safe to assert at all.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { InstancedElementRenderer } from './InstancedElementRenderer';

interface PickClosures {
    getOccupiedInstanceSlots?: () => readonly number[];
    getInstanceElementId?: (slot: number) => string | undefined;
}

function closuresOf(mesh: THREE.InstancedMesh): Required<PickClosures> {
    const ud = mesh.userData as PickClosures;
    if (!ud.getOccupiedInstanceSlots || !ud.getInstanceElementId) {
        throw new Error('group is missing the §SELECT-INSTANCED-PICK closures');
    }
    return {
        getOccupiedInstanceSlots: ud.getOccupiedInstanceSlots,
        getInstanceElementId: ud.getInstanceElementId,
    };
}

function groupsIn(scene: THREE.Scene): THREE.InstancedMesh[] {
    const out: THREE.InstancedMesh[] = [];
    scene.traverse((o) => {
        if ((o as THREE.InstancedMesh).isInstancedMesh && o.userData?.isInstancedGroup === true) {
            out.push(o as THREE.InstancedMesh);
        }
    });
    return out;
}

/**
 * The EXACT membership-signature loop from `gpu-pick.ts _syncInstancedGroup`
 * (lines 1190-1201). Copied rather than imported because importing
 * `@pryzm/picking` here would drag a WebGL renderer into a node vitest env — but
 * the two functions it CALLS are the production closures, unmodified, which is
 * where the whole cost lived.
 */
function syncPickPass(groups: readonly THREE.InstancedMesh[]): number {
    let seen = 0;
    for (const group of groups) {
        const { getOccupiedInstanceSlots, getInstanceElementId } = closuresOf(group);
        const occupied = getOccupiedInstanceSlots();
        const pairs: string[] = [];
        for (const slot of occupied) {
            const eid = getInstanceElementId(slot);
            if (eid !== undefined) pairs.push(`${slot}\x1f${eid}`);
        }
        pairs.sort();
        seen += pairs.length;
    }
    return seen;
}

describe('InstancedElementRenderer — §NAV-PICK-QUADRATIC (L-1850)', () => {
    let scene: THREE.Scene;
    let renderer: InstancedElementRenderer;
    let matA: THREE.MeshStandardMaterial;
    let matB: THREE.MeshStandardMaterial;

    const box = (): THREE.BufferGeometry => new THREE.BoxGeometry(0.4, 1, 0.4);
    const at = (x: number): THREE.Matrix4 => new THREE.Matrix4().makeTranslation(x, 0, 0);

    beforeEach(() => {
        scene = new THREE.Scene();
        renderer = new InstancedElementRenderer();
        renderer.setScene(scene);
        matA = new THREE.MeshStandardMaterial({ color: '#c0c0c0' });
        matB = new THREE.MeshStandardMaterial({ color: '#804020' });
    });

    afterEach(() => {
        renderer.clear();
    });

    // ── 1. CORRECTNESS ───────────────────────────────────────────────────────

    describe('the closures answer exactly what they answered before', () => {
        it('resolves EVERY occupied slot to its OWN element id', () => {
            const geo = box();
            for (let i = 0; i < 5; i++) {
                renderer.register(`col-${i}`, geo, matA, at(i), 'level-1', 'column');
            }
            const groups = groupsIn(scene);
            expect(groups).toHaveLength(1);

            const { getOccupiedInstanceSlots, getInstanceElementId } = closuresOf(groups[0]);
            const occupied = getOccupiedInstanceSlots();
            expect(occupied).toHaveLength(5);

            const resolved = occupied.map((s) => getInstanceElementId(s));
            expect([...resolved].sort()).toEqual(['col-0', 'col-1', 'col-2', 'col-3', 'col-4']);
        });

        it('returns the PICK id, not the storage key (§FURNITURE-MULTIPART-INSTANCING)', () => {
            const geo = box();
            // Two parts of ONE furniture item: distinct storage keys, ONE pick id.
            renderer.register('chair-1#seat', geo, matA, at(0), 'level-1', 'furniture', 'chair-1');
            renderer.register('chair-1#back', geo, matA, at(1), 'level-1', 'furniture', 'chair-1');

            const groups = groupsIn(scene);
            const { getOccupiedInstanceSlots, getInstanceElementId } = closuresOf(groups[0]);
            const ids = getOccupiedInstanceSlots().map((s) => getInstanceElementId(s));
            expect(ids).toEqual(['chair-1', 'chair-1']);
        });

        it('a slot vacated by unregister() stops resolving', () => {
            const geo = box();
            renderer.register('a', geo, matA, at(0), 'level-1', 'column');
            renderer.register('b', geo, matA, at(1), 'level-1', 'column');

            const group = groupsIn(scene)[0];
            const { getOccupiedInstanceSlots, getInstanceElementId } = closuresOf(group);
            const slotOfA = getOccupiedInstanceSlots().find((s) => getInstanceElementId(s) === 'a');
            expect(slotOfA).toBeDefined();

            renderer.unregister('a');

            expect(getInstanceElementId(slotOfA!)).toBeUndefined();
            expect(getOccupiedInstanceSlots()).toHaveLength(1);
            expect(getInstanceElementId(getOccupiedInstanceSlots()[0])).toBe('b');
        });

        it('a freed slot REUSED by a different element resolves to the NEW element', () => {
            // This is the defect an index maintained in the wrong place produces:
            // InstanceGroup recycles slots through a free list, so a stale row does
            // not merely go missing — it answers with somebody else's id.
            const geo = box();
            renderer.register('a', geo, matA, at(0), 'level-1', 'column');
            const group = groupsIn(scene)[0];
            const { getOccupiedInstanceSlots, getInstanceElementId } = closuresOf(group);
            const slot = getOccupiedInstanceSlots()[0];

            renderer.unregister('a');
            // The group emptied, so it was removed; register a fresh one and assert
            // on whatever group now hosts it.
            renderer.register('z', geo, matA, at(0), 'level-1', 'column');
            const g2 = groupsIn(scene)[0];
            const c2 = closuresOf(g2);
            expect(c2.getInstanceElementId(c2.getOccupiedInstanceSlots()[0])).toBe('z');
            expect(c2.getOccupiedInstanceSlots()).toHaveLength(1);
            // And the old handle must not still claim the recycled slot for 'a'.
            expect(closuresOf(group).getInstanceElementId(slot)).not.toBe('a');
        });

        it('re-registering under a DIFFERENT key evicts the old group row (§WALL-AUDIT move-revert)', () => {
            const geo = box();
            renderer.register('w-1', geo, matA, at(0), 'level-1', 'wall');
            renderer.register('keep', geo, matA, at(1), 'level-1', 'wall');
            const first = groupsIn(scene).find((g) => g.userData.elementType === 'wall')!;
            const firstClosures = closuresOf(first);
            const slotOfW1 = firstClosures
                .getOccupiedInstanceSlots()
                .find((s) => firstClosures.getInstanceElementId(s) === 'w-1')!;

            // A different MATERIAL re-keys the element into a new group.
            renderer.register('w-1', geo, matB, at(0), 'level-1', 'wall');

            // The vacated slot in the ORIGINAL group must no longer resolve to w-1,
            // or the pick path reports a phantom at the pre-move position.
            expect(firstClosures.getInstanceElementId(slotOfW1)).toBeUndefined();
            expect(firstClosures.getOccupiedInstanceSlots()).toEqual([
                firstClosures.getOccupiedInstanceSlots()[0],
            ]);
            expect(
                firstClosures.getInstanceElementId(firstClosures.getOccupiedInstanceSlots()[0]),
            ).toBe('keep');

            // And exactly one group anywhere resolves w-1.
            const hits = groupsIn(scene).flatMap((g) => {
                const c = closuresOf(g);
                return c.getOccupiedInstanceSlots().filter((s) => c.getInstanceElementId(s) === 'w-1');
            });
            expect(hits).toHaveLength(1);
        });

        it('clear() leaves nothing resolvable from the PREVIOUS project', () => {
            const geo = box();
            renderer.register('a', geo, matA, at(0), 'level-1', 'column');
            const group = groupsIn(scene)[0];
            const { getOccupiedInstanceSlots, getInstanceElementId } = closuresOf(group);
            const slot = getOccupiedInstanceSlots()[0];

            renderer.clear();

            expect(getInstanceElementId(slot)).toBeUndefined();
            expect(getOccupiedInstanceSlots()).toHaveLength(0);
        });

        it('elementType in the group key keeps two look-alike families APART (§NAV-TYPE-IN-GROUP-KEY)', () => {
            // SharedMaterialCache deduplicates two look-alike materials to one uuid,
            // so the key can only tell these apart via elementType. Asserted here
            // because the membership index is per-GROUP: if the key collapsed, the
            // two families would share one membership map.
            const geo = box();
            renderer.register('h-1', geo, matA, at(0), 'level-1', 'handrail');
            renderer.register('r-1', geo, matA, at(1), 'level-1', 'stair-railing');

            const byType = new Map(groupsIn(scene).map((g) => [g.userData.elementType as string, g]));
            expect([...byType.keys()].sort()).toEqual(['handrail', 'stair-railing']);

            const h = closuresOf(byType.get('handrail')!);
            const r = closuresOf(byType.get('stair-railing')!);
            expect(h.getOccupiedInstanceSlots().map((s) => h.getInstanceElementId(s))).toEqual(['h-1']);
            expect(r.getOccupiedInstanceSlots().map((s) => r.getInstanceElementId(s))).toEqual(['r-1']);
        });
    });

    // ── 2. INDEPENDENCE — the structural property ────────────────────────────

    describe('answering for ONE group is independent of the WHOLE model size', () => {
        /**
         * Register `bulk` unrelated instances, then time 2000 pick-style answers for
         * a ONE-MEMBER group. Under the O(N) closures each answer scanned all
         * `bulk + 1` records, so this loop cost ~2000 x bulk record visits; under the
         * index it is ~2000 map hits regardless of `bulk`.
         *
         * The assertion is a RATIO between two bulk sizes, never an absolute ms
         * budget, so a slow machine scales both arms equally.
         */
        function timeOneGroupAnswers(bulk: number): number {
            const s = new THREE.Scene();
            const r = new InstancedElementRenderer();
            r.setScene(s);
            const geo = box();
            const bulkMat = new THREE.MeshStandardMaterial({ color: '#123456' });
            for (let i = 0; i < bulk; i++) {
                r.register(`bulk-${i}`, geo, bulkMat, at(i), `L${i % 7}`, 'column');
            }
            // The subject: its OWN group, holding exactly one member.
            const soloMat = new THREE.MeshStandardMaterial({ color: '#abcdef' });
            r.register('solo', box(), soloMat, at(0), 'solo-level', 'beam');
            const solo = groupsIn(s).find((g) => g.userData.elementType === 'beam')!;
            const c = closuresOf(solo);

            // Warm.
            for (let i = 0; i < 200; i++) c.getInstanceElementId(c.getOccupiedInstanceSlots()[0]);

            const t0 = performance.now();
            for (let i = 0; i < 2000; i++) {
                const occ = c.getOccupiedInstanceSlots();
                c.getInstanceElementId(occ[0]);
            }
            const elapsed = performance.now() - t0;
            r.clear();
            return elapsed;
        }

        it('a 40x bigger model does not make a one-member group 40x slower to answer', () => {
            const small = timeOneGroupAnswers(250);
            const large = timeOneGroupAnswers(10_000);

            // Under the old O(N) closures this ratio was ~40 (it IS the model-size
            // ratio, by construction). Under the index it is ~1. The threshold is
            // deliberately far from both: anything under 8 cannot be a linear scan
            // of a 40x larger map, and anything near 1 is what we expect.
            const ratio = large / Math.max(small, 0.05);
            expect(ratio).toBeLessThan(8);
        });

        it('a full pick pass over a railing-scale model stays well under one frame', () => {
            // 6000 instances is the scale f80ed827 put in reach: its own census
            // measures 240 railing elements as 4920 meshes. The old implementation
            // measured 550 ms for this pass. A 60 Hz frame is 16.7 ms; 100 ms is a
            // ceiling loose enough to survive a loaded CI box and still be two
            // orders of magnitude below the number that broke the demo.
            const s = new THREE.Scene();
            const r = new InstancedElementRenderer();
            r.setScene(s);
            const geo = box();
            const mats = [0, 1, 2, 3].map(() => new THREE.MeshStandardMaterial({ color: '#777777' }));
            for (let i = 0; i < 6000; i++) {
                r.register(`e-${i}`, geo, mats[i % 4], at(i), `L${i % 7}`, `fam${i % 4}`);
            }
            const groups = groupsIn(s);
            expect(groups.length).toBeGreaterThan(1);

            syncPickPass(groups); // warm
            const t0 = performance.now();
            const seen = syncPickPass(groups);
            const elapsed = performance.now() - t0;

            expect(seen).toBe(6000);
            expect(elapsed).toBeLessThan(100);
            r.clear();
        });
    });
});
