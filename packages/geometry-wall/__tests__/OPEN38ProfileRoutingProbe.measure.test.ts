/**
 * OPEN38 — MEASUREMENT ONLY. Probes the two routing questions this lane's design rests on,
 * BEFORE any refusal is relaxed. It asserts what is TRUE TODAY, so that the tier commits can
 * show the change against a pinned "before".
 *
 * Q1. Does a wall carrying `layers: [ONE layer]` plus a `wallProfile` reach the profile arm?
 *     `profileAuthorability` refuses on `layers.length > 1`; `WallFragmentBuilder`'s LAYERED
 *     body arm is entered on `wall.layers.length > 0` and RETURNS. If those two boundaries
 *     really are one apart, a one-layer profiled wall is ADMITTED by the gate and drawn as a
 *     full rectangle — L-1064's exact shape, in the profile gate rather than the rake gate.
 *
 * Q2. Does a wall carrying a profile AND an opening reach the profile arm ahead of the
 *     opening arm? The profile arm is placed first and returns, so the prediction is a
 *     profiled solid with NO hole. Nothing can author that today (the gate refuses), so this
 *     probe writes the field directly to see what the BUILDER would do if the gate lifted —
 *     which is the fact that decides whether the gate may lift alone.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { WallFragmentBuilder } from '../src/WallFragmentBuilder';
import { WallJoinResolver } from '../src/WallJoinResolver';
import { profileAuthorability } from '../src/WallProfile';
import type { WallData } from '../src/WallTypes';

const H = 3;
const T = 0.2;
const L = 6;

/** A gable: full height at the ends, cut down to 1.5 m at mid-span... inverted — a NOTCH. */
const GABLE = { ring: [{ u: 0, v: 0 }, { u: L, v: 0 }, { u: L, v: 1.5 }, { u: L / 2, v: H }, { u: 0, v: 1.5 }] };

let _seq = 0;
function mk(opts: { layers?: unknown[]; profile?: unknown; openings?: unknown[] } = {}): WallData {
    return {
        id: `open38-${_seq++}`, type: 'wall', levelId: 'L', properties: {}, childrenIds: [],
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: L, y: 0, z: 0 }],
        height: H, thickness: T, baseOffset: 0,
        openings: opts.openings ?? [],
        ...(opts.layers ? { layers: opts.layers } : {}),
        ...(opts.profile ? { wallProfile: opts.profile } : {}),
        metadata: { createdAt: _seq, modifiedAt: _seq, createdBy: 'open38', version: 1 },
    } as unknown as WallData;
}

function levelProvider() {
    const level = { id: 'L', name: 'Ground', elevation: 0, height: H, childrenIds: [] };
    return {
        getLevelById: (id: string) => (id === 'L' ? { ...level } : undefined),
        getLevels: () => [{ ...level }],
    };
}

const specOf = (w: WallData) => ({
    id: w.id,
    startXZ: { x: w.baseLine[0].x, z: w.baseLine[0].z },
    endXZ: { x: w.baseLine[1].x, z: w.baseLine[1].z },
    thickness: w.thickness,
    layered: !!(w as unknown as { layers?: unknown[] }).layers,
});

function bodyVerts(w: WallData): THREE.Vector3[] {
    const far = mk();
    (far.baseLine as unknown as { x: number; z: number }[])[0] = { x: 50, z: 50 };
    (far.baseLine as unknown as { x: number; z: number }[])[1] = { x: 55, z: 50 };
    const walls = [w, far];
    const scene = new THREE.Scene();
    const builder = new WallFragmentBuilder(scene, levelProvider() as never);
    builder.refreshV2Cache(walls.map(specOf) as never);
    const joins = WallJoinResolver.resolveLevel(walls.map(x => ({ ...x })), { snapRadius: 0.5 });
    for (const x of walls) builder.buildWall(x, (joins.get(x.id) ?? null) as never, undefined, 0);
    const root = builder.getWallRoot(w.id) as unknown as THREE.Object3D | null;
    if (!root) return [];
    root.updateMatrixWorld(true);
    const out: THREE.Vector3[] = [];
    root.traverse(o => {
        const m = o as THREE.Mesh;
        if (!(m as unknown as { isMesh?: boolean }).isMesh) return;
        const ud = m.userData as { role?: string; elementType?: string };
        if (ud?.role !== 'geometry') return;
        if (ud.elementType !== undefined && ud.elementType !== 'WallLayer' && ud.elementType !== 'WallPart') return;
        const pos = m.geometry.getAttribute('position');
        if (!pos) return;
        for (let i = 0; i < pos.count; i++) {
            out.push(m.localToWorld(new THREE.Vector3().fromBufferAttribute(pos as THREE.BufferAttribute, i)));
        }
    });
    return out;
}

/** Greatest y within `r` of plan point (x, z) — RK1's local instrument, not a global max. */
function topNear(vs: THREE.Vector3[], x: number, z: number, r = 0.35): number {
    let best = -Infinity;
    for (const v of vs) if (Math.hypot(v.x - x, v.z - z) <= r && v.y > best) best = v.y;
    return best;
}

describe('OPEN38 · routing probe (measurement of the CURRENT build)', () => {
    it('Q1a — the GATE admits a ONE-layer profiled wall (it refuses only `layers.length > 1`)', () => {
        const verdict = profileAuthorability({
            wallProfile: GABLE,
            baseLine: [{ x: 0, z: 0 }, { x: L, z: 0 }],
            height: H,
            layers: [{ thickness: T }],
        } as never);
        expect(verdict.ok).toBe(true);
    });

    it('Q1b — and the BUILDER draws that wall as a FULL RECTANGLE: the ring is lost', () => {
        const layered = bodyVerts(mk({ layers: [{ thickness: T, name: 'Plain' }], profile: GABLE }));
        expect(layered.length).toBeGreaterThan(0);
        // ⚠ INSTRUMENT NOTE, earned on the first run. `topNear(L/2)` came back −Infinity here
        // and that is NOT evidence of a low wall: a box / mitre prism carries vertices only at
        // its CORNERS, so mid-span is empty by construction. The apex assertion belongs to the
        // control below, which builds a real extruded outline. What proves the defect here is
        // the END: the ring cuts it to v = 1.5, and the body is still at the full 3 m.
        const endTop = topNear(layered, 0.05, 0);
        const ys = [...new Set(layered.map(v => Number(v.y.toFixed(4))))].sort((a, b) => a - b);
        // eslint-disable-next-line no-console
        console.log(`[OPEN38 Q1b] layers:[1] + profile → endTop=${endTop.toFixed(4)} distinct y = ${ys.join(', ')} (ring wants 1.5 at the ends, 3.0 at mid-span)`);
        expect(endTop).toBeCloseTo(H, 3);      // ⛔ un-cut — the profile never reached the body
        // A body that honoured the ring MUST carry a vertex at the authored end height.
        expect(ys.some(y => Math.abs(y - 1.5) < 1e-3)).toBe(false);
    });

    it('Q1c — CONTROL: the same wall with NO `layers` key IS cut', () => {
        const plain = bodyVerts(mk({ profile: GABLE }));
        const endTop = topNear(plain, 0.05, 0);
        const midTop = topNear(plain, L / 2, 0);
        // eslint-disable-next-line no-console
        console.log(`[OPEN38 Q1c] no layers + profile → endTop=${endTop.toFixed(4)} midTop=${midTop.toFixed(4)}`);
        expect(endTop).toBeCloseTo(1.5, 3);
        expect(midTop).toBeCloseTo(H, 3);
    });

    it('Q2 — profile + opening, gate BYPASSED: the builder draws the ring and DROPS the hole', () => {
        const opening = {
            id: 'op-1', type: 'window', offset: 2.5, width: 1, height: 1.2,
            sillHeight: 0.9, elementId: 'win-1',
        };
        const w = mk({ profile: GABLE, openings: [opening] });
        const vs = bodyVerts(w);
        expect(vs.length).toBeGreaterThan(0);
        const midTop = topNear(vs, L / 2, 0);
        // Any vertex at the window's sill/head plane inside its span would prove a hole exists.
        const holeVerts = vs.filter(v =>
            v.x > 2.5 - 1e-3 && v.x < 3.5 + 1e-3 &&
            (Math.abs(v.y - 0.9) < 1e-3 || Math.abs(v.y - 2.1) < 1e-3));
        // eslint-disable-next-line no-console
        console.log(`[OPEN38 Q2] profiled+opening → midTop=${midTop.toFixed(4)} holeVerts=${holeVerts.length}`);
        expect(midTop).toBeCloseTo(H, 3);       // the RING was drawn …
        expect(holeVerts.length).toBe(0);       // … and the OPENING was not.
    });

    it('Q2b — and the GATE is what stops that today', () => {
        const verdict = profileAuthorability({
            wallProfile: GABLE,
            baseLine: [{ x: 0, z: 0 }, { x: L, z: 0 }],
            height: H,
            openings: [{ id: 'op-1', offset: 2.5, width: 1, height: 1.2, sillHeight: 0.9 }],
        } as never);
        expect(verdict.ok).toBe(false);
        expect(verdict.code).toBe('hosted-openings');
    });
});
