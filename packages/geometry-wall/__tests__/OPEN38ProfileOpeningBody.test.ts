/**
 * OPEN38 · TIER 1 — §FEAT-WALL-PROFILE-OPENINGS (L-7400). THE GEOMETRY.
 *
 * The founder: *"Openings (windows + doors) in raked profile-edited walls + profile-edited
 * walls + layered profile-edited walls."*
 *
 * ── THE SHAPE OF THE CHANGE, AND WHY IT IS SMALL ────────────────────────────────────────
 *
 * `WallHoleBodyBuilder` already built a wall as a `THREE.Shape` whose BOTTOM edge is a walk —
 * it dips up and over every floor-reaching door so the door's reveal becomes part of the outer
 * boundary. Its TOP edge was a single constant, `yt = baseOffset + height`. The whole feature
 * is making that top edge a function of x: the ring's UPPER CHAIN. Same extruder, same frame,
 * same `translate(0, 0, −t/2)`, no CSG, no WASM.
 *
 * ⭐ §A IS THE ASSERTION THAT MAKES THE REST TRUSTWORTHY. The generalisation is checked
 *   against the thing it generalises: handed the RECTANGLE ring, the new walk must produce the
 *   geometry the literal path produces, vertex for vertex. A generalisation that cannot
 *   reproduce its own base case is not one.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { buildWallHoleBodyGeometry } from '../src/WallHoleBodyBuilder';
import { buildWallProfileBodyGeometry } from '../src/WallProfileBodyBuilder';
import { profileAuthorability } from '../src/WallProfile';
import { WallFragmentBuilder } from '../src/WallFragmentBuilder';
import { WallJoinResolver } from '../src/WallJoinResolver';
import type { WallData } from '../src/WallTypes';

const L = 6;
const H = 3;
const T = 0.2;

/** Shoulders at 1.5 m, apex 3 m at mid-span. Flat foot — a door can be carved out of it. */
const GABLE = [
    { u: 0, v: 0 }, { u: L, v: 0 }, { u: L, v: 1.5 }, { u: L / 2, v: H }, { u: 0, v: 1.5 },
];
const RECT = [{ u: 0, v: 0 }, { u: L, v: 0 }, { u: L, v: H }, { u: 0, v: H }];

const WINDOW = { offset: 2.5, width: 1, height: 1.2, sillHeight: 0.9 };
const DOOR = { offset: 2.4, width: 1.2, height: 2.1, sillHeight: 0 };

function positions(g: THREE.BufferGeometry | null): Float32Array | null {
    if (!g) return null;
    return (g.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
}

// ─────────────────────────────────────────────────────────────────────────────────────
describe('OPEN38 §A · the generalisation reproduces its own base case', () => {
    it('outerRing = THE RECTANGLE gives the geometry the literal walk gives, vertex for vertex', () => {
        const params = { length: L, height: H, thickness: T, baseOffset: 0, openings: [WINDOW] };
        const literal = positions(buildWallHoleBodyGeometry(params))!;
        const ringed = positions(buildWallHoleBodyGeometry({ ...params, outerRing: RECT }))!;
        expect(ringed.length).toBe(literal.length);
        for (let i = 0; i < literal.length; i++) expect(ringed[i]).toBe(literal[i]);
    });

    it('…and with a DOOR too — the notch walk is the same walk on both paths', () => {
        const params = { length: L, height: H, thickness: T, baseOffset: 0, openings: [DOOR] };
        const literal = positions(buildWallHoleBodyGeometry(params))!;
        const ringed = positions(buildWallHoleBodyGeometry({ ...params, outerRing: RECT }))!;
        expect(ringed.length).toBe(literal.length);
        for (let i = 0; i < literal.length; i++) expect(ringed[i]).toBe(literal[i]);
    });

    it('a profiled body with NO openings is unchanged by the new parameter', () => {
        const a = positions(buildWallProfileBodyGeometry({ ring: GABLE, thickness: T, baseOffset: 0 }))!;
        const b = positions(buildWallProfileBodyGeometry({
            ring: GABLE, thickness: T, baseOffset: 0, openings: [], length: L, height: H,
        }))!;
        expect(b.length).toBe(a.length);
        for (let i = 0; i < a.length; i++) expect(b[i]).toBe(a[i]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────
describe('OPEN38 §B · the body carries BOTH the ring and the void', () => {
    /** Distinct y values the body's vertices occupy, rounded to 0.1 mm. */
    const ys = (g: THREE.BufferGeometry | null): number[] => {
        const a = positions(g)!;
        const out = new Set<number>();
        for (let i = 1; i < a.length; i += 3) out.add(Number(a[i]!.toFixed(4)));
        return [...out].sort((p, q) => p - q);
    };

    it('a WINDOW in a GABLE wall — the apex is drawn AND the hole is cut', () => {
        const g = buildWallProfileBodyGeometry({
            ring: GABLE, thickness: T, baseOffset: 0, openings: [WINDOW], length: L, height: H,
        });
        expect(g).not.toBeNull();
        const y = ys(g);
        // The RING: shoulders at 1.5, apex at 3.0. Neither exists on a rectangular body.
        expect(y).toContain(1.5);
        expect(y).toContain(3);
        // The VOID: sill 0.9 and head 2.1. Neither exists on a solid profiled body.
        expect(y).toContain(0.9);
        expect(y).toContain(2.1);
        // ⭐ NON-VACUITY — the solid ring body has the ring's heights and NOT the void's.
        const solid = ys(buildWallProfileBodyGeometry({ ring: GABLE, thickness: T, baseOffset: 0 }));
        expect(solid).toContain(3);
        expect(solid).not.toContain(0.9);
        expect(solid).not.toContain(2.1);
    });

    it('a DOOR in a GABLE wall — the notch reaches the floor and the apex survives', () => {
        const g = buildWallProfileBodyGeometry({
            ring: GABLE, thickness: T, baseOffset: 0, openings: [DOOR], length: L, height: H,
        });
        expect(g).not.toBeNull();
        const y = ys(g);
        expect(y).toContain(3);        // apex — the ring
        expect(y).toContain(2.1);      // the door head — the notch
        expect(y[0]).toBe(0);          // the notch reaches the floor
        // A door is carved out of the OUTER boundary, so the body must have vertices at the
        // door's jambs on the bottom edge. Measured on x rather than on a vertex count, which
        // a non-indexed extrude makes meaningless.
        const a = positions(g)!;
        let footVerts = 0;
        for (let i = 0; i < a.length; i += 3) {
            if (Math.abs(a[i + 1]!) < 1e-6
                && (Math.abs(a[i]! - DOOR.offset) < 1e-6
                    || Math.abs(a[i]! - (DOOR.offset + DOOR.width)) < 1e-6)) footVerts++;
        }
        expect(footVerts).toBeGreaterThan(0);
    });

    it('a WINDOW **and** a DOOR together', () => {
        const g = buildWallProfileBodyGeometry({
            ring: GABLE, thickness: T, baseOffset: 0,
            openings: [{ offset: 0.6, width: 0.8, height: 0.6, sillHeight: 0.6 }, DOOR],
            length: L, height: H,
        });
        expect(g).not.toBeNull();
        const y = ys(g);
        expect(y).toContain(3);        // ring
        expect(y).toContain(1.2);      // window head
        expect(y).toContain(2.1);      // door head
    });

    it('the builder REFUSES rather than dropping the ring when an opening escapes it', () => {
        // The gate refuses this at every write boundary, so reaching the builder means the
        // model was mutated behind it. A null returns the caller to a body it can draw; it
        // must never be a profiled body with the hole silently omitted.
        const g = buildWallProfileBodyGeometry({
            ring: GABLE, thickness: T, baseOffset: 0,
            openings: [{ offset: 0.2, width: 1, height: 1.2, sillHeight: 0.9 }],  // at the shoulder
            length: L, height: H,
        });
        expect(g).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────
describe('OPEN38 §C · the gate narrowed from a CATEGORY to a MEASUREMENT', () => {
    const base = {
        wallProfile: { ring: GABLE },
        baseLine: [{ x: 0, z: 0 }, { x: L, z: 0 }] as const,
        height: H,
    };

    it('a wall that hosts an opening WHICH FITS is now authorable — the old blanket "no" is gone', () => {
        const v = profileAuthorability({ ...base, openings: [{ id: 'w1', ...WINDOW }] } as never);
        expect(v.ok).toBe(true);
    });

    it('a DOOR on a flat-footed ring is authorable too', () => {
        const v = profileAuthorability({ ...base, openings: [{ id: 'd1', ...DOOR }] } as never);
        expect(v.ok).toBe(true);
    });

    it('an opening the ring CUTS AWAY is refused, naming the opening and the metres', () => {
        const v = profileAuthorability({
            ...base, openings: [{ id: 'w-shoulder', offset: 0.2, width: 1, height: 1.2, sillHeight: 0.9 }],
        } as never);
        expect(v.ok).toBe(false);
        expect(v.code).toBe('hosted-openings');
        expect(v.reason).toContain('w-shoulder');   // WHICH opening
        expect(v.reason).toContain('1.600');        // where the outline falls to
        expect(v.reason).toContain('0.500');        // by how much it misses
        // ⛔ NOT-YET is gone because it is now BUILT; what is left must read as a fixable
        //    geometric fact about THIS wall, never as a law about walls.
        expect(v.reason).not.toMatch(/is not supported|impossible|ill-posed|never/i);
    });

    it('⭐ THE REVERSE DIRECTION — dragging a profile vertex through an existing window REFUSES', () => {
        // This is the same gate call `WallStore.update` makes against the MERGED wall, so it
        // is what an author meets when they pull the outline DOWN over a window that is
        // already there. Recorded as a decision, not an accident: the edit is refused rather
        // than the window being moved or clipped, because moving it edits an element the
        // author did not select in order to honour one they did (C84 EI-2).
        const cutBelowTheWindow = {
            ring: [{ u: 0, v: 0 }, { u: L, v: 0 }, { u: L, v: 1.2 }, { u: 0, v: 1.2 }],
        };
        const v = profileAuthorability({
            ...base, wallProfile: cutBelowTheWindow, openings: [{ id: 'w1', ...WINDOW }],
        } as never);
        expect(v.ok).toBe(false);
        expect(v.code).toBe('hosted-openings');
        expect(v.reason).toContain('w1');
        expect(v.reason).toContain('1.200');
        // ⭐ And the opening is NEVER left in removed material — which was the entire point
        //   of the refusal this arm replaced.
    });

    it('an UNJUDGEABLE opening is its own verdict, not folded into "does not fit"', () => {
        const v = profileAuthorability({ ...base, openings: [{}] } as never);
        expect(v.ok).toBe(false);
        expect(v.code).toBe('hosted-openings-unjudgeable');
    });

    it('CURVED × openings × profile stays refused, and says NOT YET rather than never', () => {
        const v = profileAuthorability({
            ...base,
            curve: { control: { x: 3, y: 0, z: 1.2 }, segments: 12 },
            openings: [{ id: 'w1', ...WINDOW }],
        } as never);
        expect(v.ok).toBe(false);
        expect(v.code).toBe('curved-hosted-openings');
        expect(v.reason).toMatch(/NOT YET/);
        expect(v.reason).not.toMatch(/impossible|ill-posed|never/i);
    });

    it('MULTI-layer × profile stays refused — the V2 band slicer has no per-station top', () => {
        expect(profileAuthorability({ ...base, layers: [{}, {}] } as never).code).toBe('layered');
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────
describe('OPEN38 §D · end to end through WallFragmentBuilder', () => {
    let _seq = 0;
    const mk = (o: Record<string, unknown> = {}): WallData => ({
        id: `open38b-${_seq++}`, type: 'wall', levelId: 'L', properties: {}, childrenIds: [],
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: L, y: 0, z: 0 }],
        height: H, thickness: T, baseOffset: 0, openings: [],
        metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'open38', version: 1 },
        ...o,
    } as unknown as WallData);

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
        rakeAngleDeg: (w as unknown as { rakeAngleDeg?: number }).rakeAngleDeg,
        layered: !!(w as unknown as { layers?: unknown[] }).layers,
    });

    function bodyVerts(w: WallData): THREE.Vector3[] {
        const far = mk({ baseLine: [{ x: 50, y: 0, z: 50 }, { x: 55, y: 0, z: 50 }] });
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
    const distinctY = (vs: THREE.Vector3[]) =>
        [...new Set(vs.map(v => Number(v.y.toFixed(4))))].sort((a, b) => a - b);

    it('a PROFILE-EDITED wall with a WINDOW renders with both, through the real router', () => {
        const w = mk({
            wallProfile: { ring: GABLE },
            openings: [{ id: 'op-1', type: 'window', elementId: 'win-1', ...WINDOW }],
        });
        const y = distinctY(bodyVerts(w));
        expect(y).toContain(1.5);      // the ring's shoulder
        expect(y).toContain(3);        // the ring's apex
        expect(y).toContain(0.9);      // the window sill
        expect(y).toContain(2.1);      // the window head
    });

    it('a PROFILE-EDITED wall with a DOOR renders with both', () => {
        const w = mk({
            wallProfile: { ring: GABLE },
            openings: [{ id: 'op-1', type: 'door', elementId: 'door-1', ...DOOR }],
        });
        const y = distinctY(bodyVerts(w));
        expect(y).toContain(1.5);
        expect(y).toContain(3);
        expect(y).toContain(2.1);      // the door head
    });

    it('§FIX-PROFILE-ONE-LAYER-ROUTING (L-7403) — a ONE-LAYER profiled wall is CUT', () => {
        // ⛔ It was not. The gate refuses `layers.length > 1`; the layered body arm is entered
        //    on `> 0` and returns, so a one-layer profiled wall was admitted and drawn as a
        //    full rectangle — measured at 3.000 m where the ring authored 1.500 m. And
        //    `CreateWallCommand` stamps `layers` from the WallSystemType, so a 1-layer "Plain
        //    Wall" is the founder's actual wall: this was the feature being unreachable in
        //    production while every existing test (which builds walls with no `layers` key)
        //    stayed green.
        const w = mk({ layers: [{ thickness: T, name: 'Plain' }], wallProfile: { ring: GABLE } });
        const y = distinctY(bodyVerts(w));
        expect(y).toContain(1.5);
        expect(y).toContain(3);
    });

    it('…and a one-layer profiled wall WITH an opening', () => {
        const w = mk({
            layers: [{ thickness: T, name: 'Plain' }],
            wallProfile: { ring: GABLE },
            openings: [{ id: 'op-1', type: 'window', elementId: 'win-1', ...WINDOW }],
        });
        const y = distinctY(bodyVerts(w));
        expect(y).toContain(3);
        expect(y).toContain(0.9);
        expect(y).toContain(2.1);
    });

    it('⛔ NON-VACUITY — a MULTI-layer wall still goes to the band path, ring or no ring', () => {
        // The gate refuses to create this, so it is asserted as ROUTING, not as a supported
        // combination: the point is that the one-layer exemption did not widen into two.
        const w = mk({
            layers: [{ thickness: 0.1, name: 'A' }, { thickness: 0.1, name: 'B' }],
            wallProfile: { ring: GABLE },
        });
        const y = distinctY(bodyVerts(w));
        expect(y).not.toContain(1.5);
    });
});
