/**
 * OPEN38 — THE BEFORE/AFTER RECORD for §FEAT-WALL-PROFILE-OPENINGS (L-7400, L-7403).
 *
 * ⭐ IT WAS BANKED AS A "BEFORE" AND IT IS NOW THE "AFTER", WITH THE BEFORE QUOTED. Written
 *   in the gate commit (a77a4c86) to pin what the build did while the refusal still stood, so
 *   the geometry commit could show its change against a measurement rather than against a
 *   memory. Both readings are kept: a test that only ever asserted the fixed behaviour cannot
 *   tell a later reader what was broken, and this family's whole failure mode is refusals
 *   whose stated mechanism outlived the mechanism.
 *
 * Q1 ASKED: does a wall carrying `layers: [ONE layer]` plus a `wallProfile` reach the profile
 *     arm? `profileAuthorability` refused on `layers.length > 1` while `WallFragmentBuilder`'s
 *     LAYERED body arm was entered on `wall.layers.length > 0` and RETURNED — one apart.
 *     ANSWER: no, it did not. A one-layer profiled wall was ADMITTED by the gate and drawn as
 *     a full rectangle, which is L-1064's exact shape one gate over, and which mattered
 *     because `CreateWallCommand` stamps `layers` from the WallSystemType — so a 1-layer
 *     "Plain Wall" is the founder's ACTUAL wall and the feature was unreachable in production
 *     while every existing test (all of which build walls with no `layers` key) stayed green.
 *     FIXED at the router (L-7403): the layered arm now steps aside for a single-layer
 *     profiled wall. Tightening the GATE to `> 0` instead would have refused a profile on
 *     every real wall — the direction of the fix is the whole of it.
 *
 * Q2 ASKED: does a wall carrying a profile AND an opening reach the profile arm ahead of the
 *     opening arm? The profile arm is placed first among the body arms and returns.
 *     ANSWER: yes — so it drew the ring and the opening arms below it never ran. That single
 *     measurement is what established the refusal could NOT lift on its own: gate and geometry
 *     had to move together, and the gate had to move first (a77a4c86, then this).
 *     FIXED (L-7400): `WallHoleBodyParams.outerRing`.
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
    it('Q1a — the GATE still admits a ONE-layer profiled wall, and now the BUILDER honours it', () => {
        const verdict = profileAuthorability({
            wallProfile: GABLE,
            baseLine: [{ x: 0, z: 0 }, { x: L, z: 0 }],
            height: H,
            layers: [{ thickness: T }],
        } as never);
        expect(verdict.ok).toBe(true);
    });

    it('Q1b — ✅ FIXED (L-7403): the BUILDER now CUTS that wall. It drew a full rectangle.', () => {
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
        // ── MEASURED BEFORE THE FIX ──
        //   endTop = 3.0000, distinct y = 0, 3  — the ring authored 1.5 at the ends and the
        //   body ignored it, because the LAYERED arm is entered on `layers.length > 0` and
        //   RETURNS while the gate only refuses `> 1`. L-1064's off-by-one, one gate over.
        // ── MEASURED AFTER ──
        expect(endTop).toBeCloseTo(1.5, 3);
        expect(ys.some(y => Math.abs(y - 1.5) < 1e-3)).toBe(true);
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

    it('Q2 — ✅ FIXED (L-7400): the builder draws the ring AND the hole. It dropped the hole.', () => {
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
        // ── MEASURED BEFORE THE FIX ──
        //   midTop = 3.0000, holeVerts = 0. The profile arm is placed FIRST among the body
        //   arms and RETURNS, so it drew the ring and the opening arms below it never ran.
        //   That is why the refusal could not lift on its own: the gate and the geometry had
        //   to move in the same tier, and the gate had to move first.
        // ── MEASURED AFTER ──
        expect(midTop).toBeCloseTo(H, 3);       // the RING is still drawn …
        expect(holeVerts.length).toBeGreaterThan(0);   // … and now so is the OPENING.
    });

    it('Q2b — the GATE that stopped it is NARROWED, not removed: this opening FITS', () => {
        const verdict = profileAuthorability({
            wallProfile: GABLE,
            baseLine: [{ x: 0, z: 0 }, { x: L, z: 0 }],
            height: H,
            openings: [{ id: 'op-1', offset: 2.5, width: 1, height: 1.2, sillHeight: 0.9 }],
        } as never);
        // ── BEFORE ── ok:false, code:'hosted-openings' — for EVERY opening, on category alone.
        // ── AFTER  ── this window sits under the gable apex, so it fits and is admitted. The
        //   refusal survives per-opening and with a number; see OPEN38ProfileOpeningBody §C.
        expect(verdict.ok).toBe(true);
    });
});
