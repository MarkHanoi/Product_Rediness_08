/**
 * SL2 PROBE — founder 2026-08-19: "create a slab BY REGION around the parcel boundary,
 * change the BOTTOM OFFSET or the THICKNESS, and THE SLAB IS DISPLACED — IT MOVES."
 *
 * This file is a PROBE, not yet a guard. It measures the WORLD-SPACE bounding box of the
 * rendered slab subtree before and after each parameter change, on a ring shaped like the
 * founder's: parcel-scale, far from the origin, 177 edges, all FREE (no host walls),
 * mostly curved. Every number below is measured, none is asserted from reading.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { SlabFragmentBuilder } from '../src/SlabFragmentBuilder';
import { appendFileSync, writeFileSync } from 'node:fs';

const OUT = 'C:/Users/LENOVO/AppData/Local/Temp/claude/c--Users-LENOVO-OneDrive-Desktop-PRYZM-Product-Rediness-08/95d62064-33dc-4fe7-8416-4b9ffe5b4bc9/scratchpad/sl2-probe.txt';
try { writeFileSync(OUT, ''); } catch { /* first writer wins */ }
const say = (...a: unknown[]) => {
    try { appendFileSync(OUT, a.map(String).join(' ') + String.fromCharCode(10)); } catch { /* ignore */ }
    console.log(...(a as never[]));
};

/** A parcel-shaped ring: a closed curve, far from the world origin, 177 vertices. */
function parcelRing(n = 177): { x: number; y: number }[] {
    const cx = 48.7, cz = -132.4, r = 41.0;
    const ring: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2;
        // a lobed radius so it is NOT a tidy circle — a real parcel outline
        const rr = r * (1 + 0.18 * Math.sin(3 * t) + 0.07 * Math.cos(5 * t));
        ring.push({ x: cx + rr * Math.cos(t), y: cz + rr * Math.sin(t) });
    }
    return ring;
}

/** 177 FREE edges — the founder's log: "0 host-referenced edge(s), 177 FREE edge(s)". */
function freeSketch(ring: { x: number; y: number }[]) {
    return {
        outerLoop: {
            edges: ring.map((p, i) => ({
                type: 'freeLine' as const,
                start: { x: p.x, y: p.y },
                end: ring[(i + 1) % ring.length],
            })),
        },
    };
}

function bbox(ring: { x: number; y: number }[]) {
    const xs = ring.map(p => p.x), zs = ring.map(p => p.y);
    return {
        w: Math.max(...xs) - Math.min(...xs),
        d: Math.max(...zs) - Math.min(...zs),
    };
}

const RING = parcelRing();
const BB = bbox(RING);

function slabData(over: Record<string, unknown> = {}) {
    return {
        id: 'slab-parcel', type: 'slab', levelId: 'L0', parentId: 'L0',
        position: { x: 0, y: 0, z: 0 },
        width: BB.w, depth: BB.d,
        thickness: 0.2, baseOffset: 0,
        polygon: RING.map(p => ({ ...p })),
        sketch: freeSketch(RING),
        properties: {},
        ifcData: { guid: 'g', ifcClass: 'IfcSlab' },
        ...over,
    } as never;
}

function makeBuilder() {
    const scene = new THREE.Scene();
    return new SlabFragmentBuilder(scene, {
        getLevelById: () => ({ id: 'L0', elevation: 0 }),
    } as never);
}

/** WORLD-space AABB of everything the viewport would draw for this slab. */
function worldBox(builder: SlabFragmentBuilder, id: string) {
    const root = builder.getRootById(id)!;
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    return {
        minX: box.min.x, maxX: box.max.x,
        minY: box.min.y, maxY: box.max.y,
        minZ: box.min.z, maxZ: box.max.z,
        cx: (box.min.x + box.max.x) / 2,
        cz: (box.min.z + box.max.z) / 2,
        rootY: root.position.y,
        rootX: root.position.x,
        rootZ: root.position.z,
    };
}

describe('SL2 PROBE — does a parcel-scale curved region slab MOVE on a thickness change?', () => {
    it('measures the world box before/after a THICKNESS change', () => {
        const b = makeBuilder();
        b.updateSlab(slabData());
        const before = worldBox(b, 'slab-parcel');
        say('[SL2 PROBE] verdict  =', JSON.stringify(b.getBuildVerdict('slab-parcel')));
        say('[SL2 PROBE] ringSrc  =', SlabFragmentBuilder.resolveBuildRing(slabData()).source);
        say('[SL2 PROBE] BEFORE t=0.20', JSON.stringify(before, null, 0));

        b.updateSlab(slabData({ thickness: 0.4 }));
        const after = worldBox(b, 'slab-parcel');
        say('[SL2 PROBE] AFTER  t=0.40', JSON.stringify(after, null, 0));

        say('[SL2 PROBE] ΔcentreX =', (after.cx - before.cx).toFixed(6),
                    ' ΔcentreZ =', (after.cz - before.cz).toFixed(6),
                    ' ΔtopY =', (after.maxY - before.maxY).toFixed(6),
                    ' ΔbotY =', (after.minY - before.minY).toFixed(6));
        expect(true).toBe(true);
    });

    it('measures the world box before/after a BASE OFFSET change', () => {
        const b = makeBuilder();
        b.updateSlab(slabData());
        const before = worldBox(b, 'slab-parcel');
        b.updateSlab(slabData({ baseOffset: 1.0 }));
        const after = worldBox(b, 'slab-parcel');
        say('[SL2 PROBE] baseOffset 0 → 1.0 :  ΔcentreX =', (after.cx - before.cx).toFixed(6),
                    ' ΔcentreZ =', (after.cz - before.cz).toFixed(6),
                    ' ΔtopY =', (after.maxY - before.maxY).toFixed(6));
        expect(true).toBe(true);
    });

    it('measures a LAYERED parcel slab (the UPDATE_SLAB_LAYERS path) on a thickness change', () => {
        const b = makeBuilder();
        const layered = (t: number, layers: unknown[]) => slabData({ thickness: t, layers });
        b.updateSlab(layered(0.2, [
            { name: 'Finish', thickness: 0.05, function: 'finish', materialColor: '#cccccc' },
            { name: 'Structure', thickness: 0.15, function: 'structure', materialColor: '#909090' },
        ]));
        const before = worldBox(b, 'slab-parcel');
        b.updateSlab(layered(0.4, [
            { name: 'Finish', thickness: 0.05, function: 'finish', materialColor: '#cccccc' },
            { name: 'Structure', thickness: 0.35, function: 'structure', materialColor: '#909090' },
        ]));
        const after = worldBox(b, 'slab-parcel');
        say('[SL2 PROBE] LAYERED t 0.2 → 0.4 :  ΔcentreX =', (after.cx - before.cx).toFixed(6),
                    ' ΔcentreZ =', (after.cz - before.cz).toFixed(6),
                    ' ΔtopY =', (after.maxY - before.maxY).toFixed(6),
                    ' ΔbotY =', (after.minY - before.minY).toFixed(6));
        expect(true).toBe(true);
    });
});
