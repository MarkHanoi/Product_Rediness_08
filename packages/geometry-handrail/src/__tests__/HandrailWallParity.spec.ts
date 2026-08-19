/**
 * §HANDRAIL-WALL-PARITY (ADR-0332) — the handrail's parametric controls, asserted
 * at the BUILT GEOMETRY.
 *
 * ⚠ WHY THIS FILE EXISTS. Measured 2026-08-18: there was NO test anywhere
 * asserting that any `HandrailData` field affects the emitted mesh.
 * `HandrailInstancing.spec.ts` asserts instance REGISTRATION,
 * `RailingIsolationDispose.spec.ts` asserts teardown. Neither would notice if
 * `balusterSpacing` were ignored outright. That is the gap that let three
 * baluster fields sit read-by-the-builder and unauthorable-by-anything.
 *
 * Every assertion reads a real `THREE.Mesh` out of the scene graph. None assert
 * "did not throw"; none assert a command's return value
 * (§COMMITTED-IS-NOT-REACHABLE).
 *
 * ── SCOPE OF THIS PHASE ───────────────────────────────────────────────────────
 * Built here: legacy non-regression · baluster parameters · fillType panel/open ·
 * materialId resolution · SLOPE.
 * NOT built here, and deliberately not asserted at the builder: CURVE and
 * LEANING rake (ADR-0332 Tier 2 second / third). Their PURE policy gate IS
 * implemented and is asserted below — a gate may exist before the geometry it
 * guards, because its whole job is to REFUSE.
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

/** Every descendant mesh of the handrail root, tagged, with its LOCAL position. */
function members(scene: THREE.Scene, id: string): Array<{
    kind: string; x: number; y: number; z: number; mesh: THREE.Mesh;
}> {
    const root = scene.children.find(
        (c) => (c.userData as { id?: string })?.id === id,
    ) as THREE.Group | undefined;
    if (!root) return [];
    const out: Array<{ kind: string; x: number; y: number; z: number; mesh: THREE.Mesh }> = [];
    root.traverse((o) => {
        if (!(o as THREE.Mesh).isMesh) return;
        out.push({
            kind: String((o.userData as { member?: string })?.member ?? 'untagged'),
            x: o.position.x, y: o.position.y, z: o.position.z,
            mesh: o as THREE.Mesh,
        });
    });
    return out;
}

const near = (a: number, b: number, eps = 1e-9): boolean => Math.abs(a - b) <= eps;

describe('§HANDRAIL-WALL-PARITY — built geometry', () => {
    let scene: THREE.Scene;
    let builder: HandrailFragmentBuilder;

    beforeEach(() => {
        scene = new THREE.Scene();
        builder = new HandrailFragmentBuilder(scene, stubBim);
    });

    // ── NON-REGRESSION — a flat rail is member-for-member what it always was ──
    //
    // These are the EXACT positions the pre-feature builder produced, computed by
    // hand from its algorithm, not captured from the new one.
    it('flat handrail builds the exact legacy member set', () => {
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
        // A flat run must carry NO pitch at all — not merely a small one.
        expect(rails[0]!.mesh.rotation.z).toBe(0);

        const bal = m.filter((x) => x.kind === 'baluster').sort((a, b) => a.x - b.x);
        expect(bal.map((b) => b.x)).toEqual([0.5, 1.0, 1.5]);
        for (const b of bal) expect(near(b.y, 0.475)).toBe(true); // (1.0-0.05)/2

        const posts = m.filter((x) => x.kind === 'post').sort((a, b) => a.x - b.x);
        expect(posts.map((p) => p.x)).toEqual([0, 1, 2]);
        for (const p of posts) expect(near(p.y, 0.5)).toBe(true);
    });

    // ── Baluster parameters reach the built geometry ──────────────────────────
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
        expect(near((b.mesh.geometry as THREE.CylinderGeometry).parameters.radiusTop, 0.03)).toBe(true);

        const box = makeRail({ balusterShape: 'rectangular', balusterWidth: 0.04 });
        builder.updateHandrail(box);
        const b2 = members(scene, box.id).find((x) => x.kind === 'baluster')!;
        expect(b2.mesh.geometry.type).toBe('BoxGeometry');
        expect(near((b2.mesh.geometry as THREE.BoxGeometry).parameters.width, 0.04)).toBe(true);
    });

    // ── fillType — all FOUR enum members accounted for ────────────────────────
    it("fillType 'panel' builds a solid, opaque infill board", () => {
        const rail = makeRail({ fillType: 'panel' } as Partial<HandrailData>);
        builder.updateHandrail(rail);
        const infill = members(scene, rail.id).filter((x) => x.kind === 'infill');
        expect(infill).toHaveLength(1);
        expect((infill[0]!.mesh.material as THREE.MeshStandardMaterial).transparent).toBe(false);
    });

    it("fillType 'glass' builds exactly one transparent panel", () => {
        const rail = makeRail({ fillType: 'glass' } as Partial<HandrailData>);
        builder.updateHandrail(rail);
        const infill = members(scene, rail.id).filter((x) => x.kind === 'infill');
        expect(infill).toHaveLength(1);
        expect((infill[0]!.mesh.material as THREE.MeshStandardMaterial).transparent).toBe(true);
    });

    it("fillType 'open' builds NO infill — deliberately — and no balusters", () => {
        const rail = makeRail({ fillType: 'open' } as Partial<HandrailData>);
        builder.updateHandrail(rail);
        const m = members(scene, rail.id);
        expect(m.filter((x) => x.kind === 'infill')).toHaveLength(0);
        expect(m.filter((x) => x.kind === 'baluster')).toHaveLength(0);
        // …but it is still a railing: rail + 3 posts.
        expect(m.filter((x) => x.kind === 'rail')).toHaveLength(1);
        expect(m.filter((x) => x.kind === 'post')).toHaveLength(3);
    });

    // ── materialId now reaches the rendered colour ────────────────────────────
    it('materialColor still wins over materialId', () => {
        const rail = makeRail({ materialColor: '#ff0000', materialId: 'user-mat-x' } as Partial<HandrailData>);
        builder.updateHandrail(rail);
        const railMesh = members(scene, rail.id).find((x) => x.kind === 'rail')!;
        expect((railMesh.mesh.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('ff0000');
    });

    it('an unresolvable materialId falls back to the default colour, not to black', () => {
        const rail = makeRail({ materialColor: undefined, materialId: 'no-such-material' } as Partial<HandrailData>);
        builder.updateHandrail(rail);
        const railMesh = members(scene, rail.id).find((x) => x.kind === 'rail')!;
        expect((railMesh.mesh.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('cccccc');
    });

    // ── SLOPE (ADR-0332 Tier 2, first) ────────────────────────────────────────
    it('a sloped handrail pitches its rail and lengthens it to the incline', () => {
        // rise 1.0 over a plan run of 2.0
        const rail = makeRail({
            baseLine: [{ x: 0, y: 0, z: 0 }, { x: 2, y: 1, z: 0 }],
        } as Partial<HandrailData>);
        builder.updateHandrail(rail);

        const railMesh = members(scene, rail.id).find((x) => x.kind === 'rail')!;
        expect(near(railMesh.mesh.rotation.z, Math.atan2(1, 2))).toBe(true);
        expect(near(railMesh.x, 1.0)).toBe(true);
        expect(near(railMesh.y, 1.0 + 0.5)).toBe(true);
        // Spans the INCLINE, not the plan length — a plan-length rail would fall
        // short of the top post by sqrt(5) - 2 = 0.236 m.
        expect(near((railMesh.mesh.geometry as THREE.BoxGeometry).parameters.width, Math.sqrt(5))).toBe(true);
    });

    it('sloped posts and balusters stay PLUMB with their bases on the incline', () => {
        const rail = makeRail({
            baseLine: [{ x: 0, y: 0, z: 0 }, { x: 2, y: 1, z: 0 }],
        } as Partial<HandrailData>);
        builder.updateHandrail(rail);
        const m = members(scene, rail.id);

        const posts = m.filter((x) => x.kind === 'post').sort((a, b) => a.x - b.x);
        expect(posts.map((p) => p.x)).toEqual([0, 1, 2]);
        expect(near(posts[0]!.y, 0.0 + 0.5)).toBe(true);
        expect(near(posts[1]!.y, 0.5 + 0.5)).toBe(true);
        expect(near(posts[2]!.y, 1.0 + 0.5)).toBe(true);
        for (const p of posts) expect(p.mesh.rotation.z).toBe(0); // PLUMB

        const bal = m.filter((x) => x.kind === 'baluster').sort((a, b) => a.x - b.x);
        expect(near(bal[0]!.y, 0.25 + 0.475)).toBe(true);
        expect(near(bal[1]!.y, 0.50 + 0.475)).toBe(true);
        expect(near(bal[2]!.y, 0.75 + 0.475)).toBe(true);
        for (const b of bal) expect(b.mesh.rotation.z).toBe(0); // PLUMB
    });

    it('a sloped glass panel follows the incline', () => {
        const rail = makeRail({
            fillType: 'glass',
            baseLine: [{ x: 0, y: 0, z: 0 }, { x: 2, y: 1, z: 0 }],
        } as Partial<HandrailData>);
        builder.updateHandrail(rail);
        const infill = members(scene, rail.id).find((x) => x.kind === 'infill')!;
        expect(near(infill.mesh.rotation.z, Math.atan2(1, 2))).toBe(true);
        expect(near((infill.mesh.geometry as THREE.BoxGeometry).parameters.width, Math.sqrt(5))).toBe(true);
    });

    it('the ABSOLUTE baseLine y is still ignored — only the relative rise matters', () => {
        // Both endpoints lifted by 5: same rise, so the SAME local geometry.
        const flatHigh = makeRail({
            baseLine: [{ x: 0, y: 5, z: 0 }, { x: 2, y: 5, z: 0 }],
        } as Partial<HandrailData>);
        const flatZero = makeRail();
        builder.updateHandrail(flatHigh);
        builder.updateHandrail(flatZero);
        const a = members(scene, flatHigh.id).map((x) => [x.kind, x.x, x.y, x.z]);
        const b = members(scene, flatZero.id).map((x) => [x.kind, x.x, x.y, x.z]);
        expect(a).toEqual(b);
    });
});

describe('§HANDRAIL-WALL-PARITY — pure gate (guards geometry not yet built)', () => {
    const straight = { baseLine: [{ x: 0, z: 0 }, { x: 2, z: 0 }] as const };

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

    it('refuses rake on a CURVED handrail', () => {
        const r = handrailRakeAuthorability({
            ...straight, rakeAngleDeg: 60, curve: { control: { x: 1, z: 1 }, segments: 8 },
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
        expect(near(t.topOffset, k, 1e-12)).toBe(true);
        expect(near(t.scaledLength * Math.cos(t.tiltRad), 1.0, 1e-12)).toBe(true);
    });

    it('arc length exceeds the chord, and a straight run reduces to the chord', () => {
        expect(isCurvedHandrail({ ...straight } as any)).toBe(false);
        expect(near(handrailRunLength({ ...straight } as any), 2, 1e-12)).toBe(true);
        const curved = {
            baseLine: [{ x: 0, z: 0 }, { x: 4, z: 0 }],
            curve: { control: { x: 2, z: 2 }, segments: 8 },
        };
        expect(isCurvedHandrail(curved as any)).toBe(true);
        expect(handrailRunLength(curved as any)).toBeGreaterThan(4);
    });
});
