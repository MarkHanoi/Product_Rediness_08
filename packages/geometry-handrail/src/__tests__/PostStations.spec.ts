/**
 * §FEAT-HANDRAIL-POST-REDISTRIBUTE (C95 §15.3, R5).
 *
 * The defect C95 measured, asserted as a defect: on a **4.000 m** run at 1.0 m
 * spacing the old `Math.floor(L/s) - 1` emitted interior members at 1, 2 and 3 m;
 * on a **4.001 m** run it emitted *the same three*, leaving a **2.001 m final
 * bay** — twice the authored spacing, which for a guard is the one bay a 100 mm
 * sphere passes through.
 *
 * The pure function is asserted directly, and then through the REAL builder by
 * counting the post meshes it emits — because a station list nobody consumes is
 * the "committed ≠ reachable" failure this repo has logged repeatedly.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { postStations, derivedPostId, DEFAULT_HANDRAIL_END_CONDITION } from '../postStations';
import { HandrailFragmentBuilder } from '../HandrailFragmentBuilder';

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/** Bay widths implied by a station list on a run of `length`. */
function bays(length: number, stations: readonly number[]): number[] {
    const pts = [0, ...stations, length];
    return pts.slice(1).map((p, i) => p - pts[i]);
}

describe('postStations — the end condition is explicit, never an off-by-one', () => {
    it('the default is REDISTRIBUTE', () => {
        expect(DEFAULT_HANDRAIL_END_CONDITION).toBe('redistribute');
        expect(postStations(4.001, 1.0)).toEqual(postStations(4.001, 1.0, 'redistribute'));
    });

    it('⭐ THE MEASURED DEFECT: no bay ever exceeds the authored spacing', () => {
        // The exact pair C95 §15.3 names.
        for (const L of [4.0, 4.001, 4.999, 7.3, 0.999, 12.75]) {
            const st = postStations(L, 1.0);
            for (const b of bays(L, st)) {
                expect(b, `run ${L} produced a ${b} m bay`).toBeLessThanOrEqual(1.0 + 1e-9);
            }
        }
        // And the specific number: 4.001 m used to leave 2.001 m.
        expect(Math.max(...bays(4.001, postStations(4.001, 1.0)))).toBeLessThan(1.0 + 1e-9);
    });

    it('redistribute gives EQUAL bays, ceil(L/s) of them', () => {
        const L = 4.001, s = 1.0;
        const st = postStations(L, s, 'redistribute');
        expect(st).toHaveLength(Math.ceil(L / s) - 1); // 5 bays ⇒ 4 interior
        const bs = bays(L, st);
        for (const b of bs) expect(near(b, bs[0])).toBe(true);
    });

    it('an EXACT division emits no member on either end post', () => {
        const st = postStations(4.0, 1.0, 'redistribute');
        expect(st.map(x => Number(x.toFixed(9)))).toEqual([1, 2, 3]);
        // 'fixed' must agree here — the two conventions only differ on a remainder.
        expect(postStations(4.0, 1.0, 'fixed').map(x => Number(x.toFixed(9)))).toEqual([1, 2, 3]);
        // …and neither may place one AT the end, which would double the end post.
        for (const c of ['redistribute', 'fixed', 'centred'] as const) {
            for (const x of postStations(4.0, 1.0, c)) {
                expect(x).toBeGreaterThan(0);
                expect(x).toBeLessThan(4.0);
            }
        }
    });

    it('fixed keeps the authored pitch and puts the remainder in ONE end bay', () => {
        const st = postStations(4.001, 1.0, 'fixed');
        expect(st.map(x => Number(x.toFixed(9)))).toEqual([1, 2, 3, 4]);
        expect(near(bays(4.001, st)[4], 0.001)).toBe(true);
    });

    it('centred keeps the pitch and splits the remainder into TWO equal end bays', () => {
        const L = 4.5, s = 1.0;
        const st = postStations(L, s, 'centred');
        const bs = bays(L, st);
        expect(near(bs[0], bs[bs.length - 1])).toBe(true);
        expect(near(bs[0], 0.25)).toBe(true);
        for (const b of bs.slice(1, -1)) expect(near(b, 1.0)).toBe(true);
    });

    it('degenerate inputs answer "no members" rather than throwing or guessing', () => {
        for (const args of [[0, 1], [4, 0], [4, -1], [-4, 1], [NaN, 1], [4, Infinity]] as const) {
            expect(postStations(args[0], args[1])).toEqual([]);
        }
        // A run shorter than one spacing has no interior member under ANY
        // convention — so short runs are untouched by the default change.
        for (const c of ['redistribute', 'fixed', 'centred'] as const) {
            expect(postStations(0.8, 1.0, c)).toEqual([]);
        }
    });

    it('it is a PURE FUNCTION — same inputs, same stations, and no random identity', () => {
        expect(postStations(7.31, 0.9, 'centred')).toEqual(postStations(7.31, 0.9, 'centred'));
        // C95 §15.3 / L-1051: a post's id comes from (railId, index), never from
        // crypto.randomUUID().
        expect(derivedPostId('hr-1', 3)).toBe('hr-1#post-3');
        expect(derivedPostId('hr-1', 3)).toBe(derivedPostId('hr-1', 3));
        expect(derivedPostId('hr-1', 3, 'baluster')).toBe('hr-1#baluster-3');
        expect(derivedPostId.toString()).not.toContain('randomUUID');
        expect(postStations.toString()).not.toContain('randomUUID');
    });
});

describe('the REAL builder consumes it — committed ≠ reachable', () => {
    function countPosts(handrail: Record<string, unknown>): number {
        const scene = new THREE.Scene();
        const builder = new HandrailFragmentBuilder(scene, { getLevelById: () => ({ elevation: 0 }) } as never);
        builder.updateHandrail(handrail as never);
        let posts = 0;
        scene.traverse((o) => {
            if ((o as THREE.Mesh).isMesh && (o.userData as { member?: string }).member === 'post') posts++;
        });
        return posts;
    }

    // ElementRegistry.registerSemantic THROWS on a duplicate id and the registry
    // is a module singleton, so each build gets a fresh id.
    let _seq = 0;
    const rail = (length: number, extra: Record<string, unknown> = {}) => ({
        id: `hr-stations-${_seq++}`, type: 'handrail', levelId: 'L0', parentId: 'L0',
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: length, y: 0, z: 0 }],
        height: 1.0, thickness: 0.05, baseOffset: 0,
        fillType: 'open', postSpacing: 1.0, properties: {},
        ...extra,
    });

    it('a 4.001 m run at 1.0 m spacing gets 4 interior posts, not 3 — 6 in total with both ends', () => {
        expect(countPosts(rail(4.001))).toBe(6);
        // The old behaviour, for contrast: floor(4.001/1) - 1 = 3 interior ⇒ 5.
        expect(countPosts(rail(4.001))).not.toBe(5);
    });

    it('an exact 4.000 m run is UNCHANGED — 3 interior, 5 total', () => {
        expect(countPosts(rail(4.0))).toBe(5);
    });

    it('the end condition is honoured through the builder, not only in the pure function', () => {
        expect(countPosts(rail(4.001, { postEndCondition: 'fixed' }))).toBe(6); // 4 interior + 2 ends
        expect(countPosts(rail(4.5, { postEndCondition: 'centred' }))).toBe(7); // 5 interior + 2 ends
        expect(countPosts(rail(4.5, { postEndCondition: 'redistribute' }))).toBe(6); // ceil(4.5)=5 bays
    });
});
