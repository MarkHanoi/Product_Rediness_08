// @vitest-environment happy-dom
/**
 * SL2 PROBE — founder 2026-08-19, called "a major bug", reproduced in production:
 *   "When I create a slab — normally BY REGION around the boundary of the parcel — and
 *    I change either the BOTTOM OFFSET or the THICKNESS, THE SLAB IS DISPLACED — IT MOVES."
 *
 * His console showed, after EVERY slab mutation:
 *   [LevelPlaneConstraint] Locked model Y=-0.2000 (view Y=-0.2000, level-explode offset=0.0000)
 * always -0.2000 = MINUS THE DEFAULT SLAB THICKNESS, no matter what he typed.
 *
 * This probe couples the REAL `SlabFragmentBuilder` to the REAL `LevelPlaneConstraint`
 * and replays the production sequence for a selected slab whose parameter changes:
 *   select → LevelPlaneConstraint.attach (latches obj.position.y)
 *   edit    → SlabStore write → `bim-slab-updated` → builder rebuild (writes a NEW root.y)
 *   defer   → SelectionManager._reresolveSelectionAfterRebuild → applyHighlight →
 *             clearHighlight() → transformControls.detach()  ← fires 'change'
 *
 * The TransformControls double is a THREE.EventDispatcher — the real class's own base and
 * its real `change` dispatch — so the event path under test is production's, not a more
 * capable fake.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { SlabFragmentBuilder } from '../src/SlabFragmentBuilder';
import { LevelPlaneConstraint } from '../../input-host/src/LevelPlaneConstraint';
import { appendFileSync, writeFileSync } from 'node:fs';

const OUT = 'C:/Users/LENOVO/AppData/Local/Temp/claude/c--Users-LENOVO-OneDrive-Desktop-PRYZM-Product-Rediness-08/95d62064-33dc-4fe7-8416-4b9ffe5b4bc9/scratchpad/sl2-probeC.txt';
try { writeFileSync(OUT, ''); } catch { /* ignore */ }
const say = (...a: unknown[]) => {
    try { appendFileSync(OUT, a.map(String).join(' ') + String.fromCharCode(10)); } catch { /* ignore */ }
    console.log(...(a as never[]));
};

/** The founder's ring: parcel-scale, far from origin, 177 free (mostly curved) edges. */
function parcelRing(n = 177): { x: number; y: number }[] {
    const cx = 48.7, cz = -132.4, r = 41.0;
    const ring: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2;
        const rr = r * (1 + 0.18 * Math.sin(3 * t) + 0.07 * Math.cos(5 * t));
        ring.push({ x: cx + rr * Math.cos(t), y: cz + rr * Math.sin(t) });
    }
    return ring;
}
const RING = parcelRing();
const xs = RING.map(p => p.x), zs = RING.map(p => p.y);
const BB = { w: Math.max(...xs) - Math.min(...xs), d: Math.max(...zs) - Math.min(...zs) };

function slabData(over: Record<string, unknown> = {}) {
    return {
        id: 'slab-parcel', type: 'slab', levelId: 'L0', parentId: 'L0',
        position: { x: 0, y: 0, z: 0 },
        width: BB.w, depth: BB.d, thickness: 0.2, baseOffset: 0,
        polygon: RING.map(p => ({ ...p })),
        sketch: {
            outerLoop: {
                edges: RING.map((p, i) => ({
                    type: 'freeLine' as const, start: { x: p.x, y: p.y }, end: RING[(i + 1) % RING.length],
                })),
            },
        },
        properties: {}, ifcData: { guid: 'g', ifcClass: 'IfcSlab' },
        ...over,
    } as never;
}

/** Faithful stand-in: the real TransformControls extends EventDispatcher and fires 'change'. */
class TransformControlsDouble extends THREE.EventDispatcher<{ change: object }> {
    mode = 'translate';
    showY = true;
    object: THREE.Object3D | undefined;
    attach(o: THREE.Object3D) { if (this.object !== o) { this.object = o; this.dispatchEvent({ type: 'change' }); } return this; }
    /** SelectionManager.clearHighlight() ends with exactly this, on EVERY applyHighlight(). */
    detach() { if (this.object !== undefined) { this.object = undefined; this.dispatchEvent({ type: 'change' }); } return this; }
}

function makeBuilder(scene: THREE.Scene) {
    return new SlabFragmentBuilder(scene, { getLevelById: () => ({ id: 'L0', elevation: 0 }) } as never);
}

function topFace(root: THREE.Object3D) {
    root.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(root);
    return { top: b.max.y, bot: b.min.y, cx: (b.min.x + b.max.x) / 2, cz: (b.min.z + b.max.z) / 2 };
}

describe('SL2 PROBE — a SELECTED slab whose thickness / baseOffset changes', () => {
    it('replays select → edit → rebuild → re-highlight, and measures where the slab ends up', () => {
        const scene = new THREE.Scene();
        const builder = makeBuilder(scene);
        const tc = new TransformControlsDouble();
        const lpc = new LevelPlaneConstraint(tc as never, () => 0);

        // ── 1. build the parcel slab and SELECT it (this is what the founder does) ──
        builder.updateSlab(slabData());
        const root = builder.getRootById('slab-parcel')!;
        tc.attach(root);
        lpc.attach(root);
        const t0 = topFace(root);
        say('[SL2-B] after select   : rootY=', root.position.y.toFixed(4),
            ' top=', t0.top.toFixed(4), ' bot=', t0.bot.toFixed(4),
            ' lockedModelY=', String(lpc.lockedModelY));

        // ── 2. THICKNESS 0.20 → 0.40 : store write → bim-slab-updated → builder rebuild ──
        builder.updateSlab(slabData({ thickness: 0.4 }));
        const t1 = topFace(root);
        say('[SL2-B] builder wrote  : rootY=', root.position.y.toFixed(4),
            ' top=', t1.top.toFixed(4), ' bot=', t1.bot.toFixed(4),
            '   <-- C92 §10 TOP-referenced: top must still be 0.0000');

        // ── 3. the DEFERRED SelectionManager re-highlight (setTimeout 0 in production):
        //       applyHighlight() → clearHighlight() → transformControls.detach() ──
        tc.detach();
        const t2 = topFace(root);
        say('[SL2-B] after detach   : rootY=', root.position.y.toFixed(4),
            ' top=', t2.top.toFixed(4), ' bot=', t2.bot.toFixed(4),
            '   <-- LevelPlaneConstraint clamp fires HERE');

        // ...then the re-latch, which is the line in the founder's console
        tc.attach(root);
        lpc.detach();
        lpc.attach(root);
        const t3 = topFace(root);
        say('[SL2-B] after re-latch : rootY=', root.position.y.toFixed(4),
            ' top=', t3.top.toFixed(4), ' bot=', t3.bot.toFixed(4),
            ' lockedModelY=', String(lpc.lockedModelY));
        say('[SL2-B] NET DISPLACEMENT of the TOP face across the thickness edit =',
            (t3.top - t0.top).toFixed(4), 'm   (correct answer: 0.0000)');
        say('[SL2-B] NET XZ displacement =', (t3.cx - t0.cx).toFixed(6), (t3.cz - t0.cz).toFixed(6));
        expect(true).toBe(true);
    });

    it('replays the same sequence for a BASE OFFSET edit', () => {
        const scene = new THREE.Scene();
        const builder = makeBuilder(scene);
        const tc = new TransformControlsDouble();
        const lpc = new LevelPlaneConstraint(tc as never, () => 0);

        builder.updateSlab(slabData());
        const root = builder.getRootById('slab-parcel')!;
        tc.attach(root);
        lpc.attach(root);
        const t0 = topFace(root);

        builder.updateSlab(slabData({ baseOffset: 0.5 }));
        const t1 = topFace(root);
        say('[SL2-B] baseOffset 0 → 0.5, builder wrote top=', t1.top.toFixed(4),
            ' (correct answer: 0.5000)');

        tc.detach();
        tc.attach(root);
        lpc.detach();
        lpc.attach(root);
        const t3 = topFace(root);
        say('[SL2-B] baseOffset 0 → 0.5, AFTER re-highlight top=', t3.top.toFixed(4),
            '  Δfrom-before-edit=', (t3.top - t0.top).toFixed(4),
            '  lockedModelY=', String(lpc.lockedModelY));
        expect(true).toBe(true);
    });
});
