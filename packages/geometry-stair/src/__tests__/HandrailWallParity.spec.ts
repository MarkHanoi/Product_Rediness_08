/**
 * §HANDRAIL-WALL-PARITY (ADR-0332) — the handrail's parametric controls, asserted
 * at the BUILT GEOMETRY.
 *
 * ⚠ WHY THIS FILE IS NEW RATHER THAN AN EXTENSION OF AN EXISTING SPEC.
 * Measured 2026-08-18: there was NO test anywhere asserting that any
 * `HandrailData` field affects the emitted mesh. `HandrailInstancing.spec.ts`
 * asserts instance REGISTRATION, `RailingIsolationDispose.spec.ts` asserts
 * teardown. Neither would notice if `balusterSpacing` were ignored outright.
 * That is the gap that let three baluster fields sit read-by-the-builder and
 * unauthorable-by-anything for as long as they have.
 *
 * Every assertion here reads a real `THREE.Mesh` position out of the scene
 * graph. None of them assert "did not throw", and none assert a command's
 * return value — §COMMITTED-IS-NOT-REACHABLE.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import type { HandrailData } from '@pryzm/core-app-model/stores';
import { HandrailFragmentBuilder } from '../HandrailFragmentBuilder';
import {
    handrailRakeAuthorability,
    handrailRunLength,
    intermediateMemberStations,
    isCurvedHandrail,
    rakedMemberTilt,
} from '../HandrailRunGeometry';

/** Minimal BimManager stub — the builder only ever calls getLevelById. */
const stubBim = { getLevelById: (_id: string) => ({ elevation: 0 }) } as any;

let seq = 0;
const nextId = (): string => `hr-parity-${seq++}`;

function makeRail(over: Partial<HandrailData> = {}): HandrailData {
    return {
        id: nextId(),
        type: 'handrail' as any,
        levelId: 'level-1',
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }],
        height: 1.0,
        thickness: 0.05,
        baseOffset: 0,
        materialColor: '#888888',
        fillType: 'baluster',
        balusterSpacing: 0.5,
        balusterShape: 'rectangular',
        balusterWidth: 0.02,
        postSpacing: 1.0,
        railProfile: 'rectangular',
        ...over,
    } as HandrailData;
}

/** Every descendant mesh of the handrail root, with its WORLD position. */
function members(scene: THREE.Scene, id: string): Array<{
    kind: string; x: number; y: number; z: number; mesh: THREE.Mesh;
}> {
    const root = scene.children.find(
        (c) => (c.userData as { id?: string })?.id === id,
    ) as THREE.Group | undefined;
    if (!root) return [];
    root.updateMatrixWorld(true);
    const out: Array<{ kind: string; x: number; y: number; z: number; mesh: THREE.Mesh }> = [];
    root.traverse((o) => {
        if (!(o as THREE.Mesh).isMesh) return;
        const w = new THREE.Vector3();
        o.getWorldPosition(w);
        out.push({
            kind: String((o.userData as { member?: string })?.member ?? 'untagged'),
            x: w.x, y: w.y, z: w.z,
            mesh: o as THREE.Mesh,
        });
    });
    return out;
}

const near = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) <= eps;

describe('§HANDRAIL-WALL-PARITY — built geometry', () => {
    let scene: THREE.Scene;
    let builder: HandrailFragmentBuilder;

    beforeEach(() => {
        scene = new THREE.Scene();
        builder = new HandrailFragmentBuilder(scene, stubBim);
    });

    // ── CONTROL 4 (non-regression) — a straight vertical rail is unchanged ────
    //
    // These are the EXACT positions the pre-feature builder produced, computed by
    // hand from its algorithm, not captured from the new one. If the refactor
    // moved a member by a millimetre this fails.
    it('straight vertical handrail builds the exact legacy member set', () => {
        const rail = makeRail();
        builder.updateHandrail(rail);
        const m = members(scene, rail.id);

        // 1 top rail + 3 balusters (floor(2/0.5)-1) + 3 posts (2 end + 1 mid)
        expect(m).toHaveLength(7);

        const rails = m.filter((x) => x.kind === 'rail');
        expect(rails).toHaveLength(1);
        expect(near(rails[0]!.x, 1)).toBe(true);
        expect(near(rails[0]!.y, 1.0)).toBe(true);
        expect(near(rails[0]!.z, 0)).toBe(true);

        const bal = m.filter((x) => x.kind === 'baluster').sort((a, b) => a.x - b.x);
        expect(bal.map((b) => b.x)).toEqual([0.5, 1.0, 1.5]);
        // bHeight = height - 0.05 = 0.95 → centre at 0.475
        for (const b of bal) expect(near(b.y, 0.475)).toBe(true);

        const posts = m.filter((x) => x.kind === 'post').sort((a, b) => a.x - b.x);
        expect(posts.map((p) => p.x)).toEqual([0, 1, 2]);
        for (const p of posts) expect(near(p.y, 0.5)).toBe(true);
    });

    // ── CONTROL 3 — baluster spacing set in the panel changes BUILT geometry ──
    it('balusterSpacing changes the number of balusters actually built', () => {
        const coarse = makeRail({ balusterSpacing: 0.5 });
        builder.updateHandrail(coarse);
        expect(members(scene, coarse.id).filter((x) => x.kind === 'baluster')).toHaveLength(3);

        const fine = makeRail({ balusterSpacing: 0.25 });
        builder.updateHandrail(fine);
        expect(members(scene, fine.id).filter((x) => x.kind === 'baluster')).toHaveLength(7);
    });

    it('balusterWidth and balusterShape reach the built primitive', () => {
        const round = makeRail({ balusterShape: 'round', balusterWidth: 0.06 });
        builder.updateHandrail(round);
        const b = members(scene, round.id).find((x) => x.kind === 'baluster')!;
        expect(b.mesh.geometry.type).toBe('CylinderGeometry');
        const p = (b.mesh.geometry as THREE.CylinderGeometry).parameters;
        expect(near(p.radiusTop, 0.03)).toBe(true);

        const box = makeRail({ balusterShape: 'rectangular', balusterWidth: 0.04 });
        builder.updateHandrail(box);
        const b2 = members(scene, box.id).find((x) => x.kind === 'baluster')!;
        expect(b2.mesh.geometry.type).toBe('BoxGeometry');
        expect(near((b2.mesh.geometry as THREE.BoxGeometry).parameters.width, 0.04)).toBe(true);
    });

    // ── CONTROL 1 — a curved handrail builds along the ARC, not the chord ─────
    it('curved handrail places its members on the arc, not the chord', () => {
        // Quadratic Bezier (0,0) -> control (2,0,2) -> (4,0,0).
        // B(0.5) = 0.25*P0 + 0.5*C + 0.25*P1 = (2, 1). Chord midpoint is (2, 0).
        const rail = makeRail({
            baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
            curve: { control: { x: 2, y: 0, z: 2 }, segments: 8 },
            balusterSpacing: 0.5,
            postSpacing: 0,
        } as Partial<HandrailData>);

        expect(isCurvedHandrail(rail as any)).toBe(true);
        // The arc is strictly longer than the 4 m chord.
        expect(handrailRunLength(rail as any)).toBeGreaterThan(4.0);

        builder.updateHandrail(rail);
        const bal = members(scene, rail.id).filter((x) => x.kind === 'baluster');
        expect(bal.length).toBeGreaterThan(3);

        // A chord-built rail would put every member at z == 0. The arc bulges to
        // z = 1 at mid-run, so SOME member must be well off the chord.
        const maxZ = Math.max(...bal.map((b) => b.z));
        expect(maxZ).toBeGreaterThan(0.5);

        // And every member must lie ON the sampled curve — check each against the
        // true Bezier by finding its nearest t, tolerance = tessellation sag.
        const onCurve = (x: number, z: number): number => {
            let best = Infinity;
            for (let i = 0; i <= 2000; i++) {
                const t = i / 2000, u = 1 - t;
                const bx = u * u * 0 + 2 * u * t * 2 + t * t * 4;
                const bz = u * u * 0 + 2 * u * t * 2 + t * t * 0;
                best = Math.min(best, Math.hypot(x - bx, z - bz));
            }
            return best;
        };
        for (const b of bal) expect(onCurve(b.x, b.z)).toBeLessThan(0.05);
    });

    // ── CONTROL 2 — a raked handrail honours the rake ─────────────────────────
    it('raked handrail displaces its top rail by height * cot(rake)', () => {
        // 60 deg -> cot(60) = 0.57735. Run is along +X, so leftPerp is +Z.
        const rail = makeRail({ rakeAngleDeg: 60, height: 1.0 } as Partial<HandrailData>);
        builder.updateHandrail(rail);
        const m = members(scene, rail.id);

        const top = m.find((x) => x.kind === 'rail')!;
        const expected = 1.0 / Math.tan((60 * Math.PI) / 180);
        expect(near(top.z, expected, 1e-6)).toBe(true);
        expect(near(top.y, 1.0, 1e-6)).toBe(true);

        // The balusters must lean WITH the rail, not stay upright underneath it.
        const bal = m.filter((x) => x.kind === 'baluster');
        expect(bal.length).toBeGreaterThan(0);
        for (const b of bal) {
            // centre of a 0.95-tall leaning member sits at half its top offset
            expect(near(b.z, (0.95 / 2) * expected / 1.0 * (1.0 / 1.0), 1e-6)).toBe(true);
            expect(b.mesh.rotation.x).not.toBe(0);
        }
    });

    it('a vertical handrail is bit-identical whether rake is absent or exactly 90', () => {
        const a = makeRail();
        const b = makeRail({ rakeAngleDeg: 90 } as Partial<HandrailData>);
        builder.updateHandrail(a);
        builder.updateHandrail(b);
        const ma = members(scene, a.id).map((x) => [x.kind, x.x, x.y, x.z]);
        const mb = members(scene, b.id).map((x) => [x.kind, x.x, x.y, x.z]);
        expect(mb).toEqual(ma);
    });

    // ── fillType 'panel' must build something, or nothing must offer it ───────
    it("fillType 'panel' builds a solid infill board", () => {
        const rail = makeRail({ fillType: 'panel' } as Partial<HandrailData>);
        builder.updateHandrail(rail);
        const infill = members(scene, rail.id).filter((x) => x.kind === 'infill');
        expect(infill).toHaveLength(1);
    });

    it("fillType 'glass' still builds exactly one transparent panel", () => {
        const rail = makeRail({ fillType: 'glass' } as Partial<HandrailData>);
        builder.updateHandrail(rail);
        const infill = members(scene, rail.id).filter((x) => x.kind === 'infill');
        expect(infill).toHaveLength(1);
        expect((infill[0]!.mesh.material as THREE.MeshStandardMaterial).transparent).toBe(true);
    });
});

describe('§HANDRAIL-WALL-PARITY — pure gate', () => {
    const straight = {
        baseLine: [{ x: 0, z: 0 }, { x: 2, z: 0 }] as const,
    };

    it('a vertical or absent rake is always authorable', () => {
        expect(handrailRakeAuthorability({ ...straight } as any).ok).toBe(true);
        expect(handrailRakeAuthorability({ ...straight, rakeAngleDeg: 90 } as any).ok).toBe(true);
    });

    it('refuses an out-of-range rake by name', () => {
        const r = handrailRakeAuthorability({ ...straight, rakeAngleDeg: 5 } as any);
        expect(r.ok).toBe(false);
        expect(r.code).toBe('out-of-range');
        expect(r.reason).toContain('90 = vertical');
    });

    it('refuses rake on a CURVED handrail, in both authoring directions', () => {
        const r = handrailRakeAuthorability({
            ...straight,
            rakeAngleDeg: 60,
            curve: { control: { x: 1, z: 1 }, segments: 8 },
        } as any);
        expect(r.ok).toBe(false);
        expect(r.code).toBe('curved');
    });

    it('refuses rake with GLASS infill', () => {
        const r = handrailRakeAuthorability({
            ...straight, rakeAngleDeg: 60, fillType: 'glass',
        } as any);
        expect(r.ok).toBe(false);
        expect(r.code).toBe('glass-infill');
        expect(r.reason).toContain('glass');
    });

    it('preserves the legacy intermediate-member count rule exactly', () => {
        expect(intermediateMemberStations(2, 0.5)).toEqual([0.5, 1.0, 1.5]);
        expect(intermediateMemberStations(2, 1.0)).toEqual([1.0]);
        expect(intermediateMemberStations(2, 0)).toEqual([]);
        expect(intermediateMemberStations(0.5, 1.0)).toEqual([]);
    });

    it('rakedMemberTilt keeps the member top at the authored height', () => {
        const t = rakedMemberTilt(60, 1.0);
        const k = 1 / Math.tan((60 * Math.PI) / 180);
        expect(near(t.topOffset, k)).toBe(true);
        // length * cos(tilt) must be exactly the authored height
        expect(near(t.scaledLength * Math.cos(t.tiltRad), 1.0)).toBe(true);
    });
});
