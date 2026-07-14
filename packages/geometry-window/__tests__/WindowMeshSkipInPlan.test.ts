/**
 * §FEAT-WINDOW-CUT-ZONE-AND-LOD (L-278) — IN PLAN, THE WINDOW IS ITS SYMBOL.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * THIS SUITE EXISTS TO SETTLE AN ARGUMENT, SO THE ARGUMENT IS WRITTEN DOWN.
 *
 * L-278 was briefed as: *"A door is `skipInPlan` because at 1.2 m a door opening is EMPTY.
 * A WINDOW IS THE OPPOSITE CASE — the cut plane passes THROUGH its frame and glazing, so
 * those spanning lines are REAL CUT GEOMETRY. Tagging a window `skipInPlan` would DELETE
 * THE VERY LINES THAT MAKE IT A WINDOW."*
 *
 * THE PREMISE IS TRUE AND THE CONCLUSION IS FALSE, which is why it needed a test rather
 * than an opinion. The plane really does cut the frame, the mullion and the glazing —
 * **but those cut lines do not come from the MESH.** They are authored, at the real
 * dimensions, from the real record, by `WindowPlanSymbolBuilder`, which
 * `EdgeProjectorService` injects into every plan view (Phase 6). L-280 measured that
 * symbol's frame band and found it DIMENSIONALLY EXACT.
 *
 * So the mesh does not ADD the window's cut section — it DUPLICATES it from a second,
 * un-LOD'd, un-penned source, and dumps on top of it the members a plan must NOT show at
 * all: the head bar at ~2.2 m (ABOVE the cut plane), the transoms and every pane outline,
 * each projected as a flat rectangle straight across the symbol. That is the door's
 * disease verbatim (L-266) and `skipInPlan` is its cure. Contract 48 §5 is the RULE:
 * AN ELEMENT WITH A PLAN SYMBOL DOES NOT ALSO EMIT ITS MESH EDGES IN PLAN.
 *
 * WHAT THIS GUARDS — and note that W-4/W-5 are the half that makes the tag SAFE:
 *   W-1  EVERY window mesh carries `skipInPlan` (not a hand-maintained role allowlist)
 *   W-2  the HEAD BAR — the offender that is genuinely above the plane — really does span
 *        the full opening, so the regression is stated in geometry, not in prose
 *   W-3  the tag REACHES the view (the projector's generic gate still exists)
 *   W-4  *** THE SYMBOL STILL CARRIES THE CUT LINES. *** If someone ever "simplifies" the
 *        symbol away, `skipInPlan` silently becomes exactly the deletion the brief feared.
 *        This is the assertion that makes W-1 legitimate rather than destructive.
 *   W-5  the MULLION is cut geometry, and it is drawn — from the record's own pane grid.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from '@pryzm/renderer-three/three';
import { WindowBuilder } from '../src/WindowBuilder';
import { WindowPlanSymbolBuilder } from '../src/WindowPlanSymbolBuilder';

const WALL = {
    id: 'w1', levelId: 'L0', thickness: 0.2, height: 3,
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
};
const wallStoreStub = {
    getById: (id: string) => (id === 'w1' ? WALL : undefined),
    getLevelById: () => ({ id: 'L0', elevation: 0 }),
} as never;

/** A real casement: sill at 1.0 m, head at 2.2 m — so a 1.2 m plan cut passes THROUGH it. */
const WIN = {
    id: 'win1', wallId: 'w1', openingId: 'o1',
    offset: 1.0, width: 1.2, height: 1.2, sillHeight: 1.0,
    frameThickness: 0.05, frameDepth: 0.2, frameColor: '#e8e8e8',
    columnRatios: [1], rowRatios: [1],
    columnDividerThickness: 0.03, rowDividerThickness: 0.03,
    sill: true, sillDepth: 0.08, sillThickness: 0.03,
    glassOpacity: 0.3, windowType: 'single',
};

function buildWindow(win: Record<string, unknown>): THREE.Mesh[] {
    const scene = new THREE.Scene();
    const builder = new WindowBuilder(scene, wallStoreStub);
    (builder as unknown as { rebuild(w: unknown): void }).rebuild(win);
    const meshes: THREE.Mesh[] = [];
    scene.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    return meshes;
}

/** The plan symbol's own geometry, in the same frame the drawing consumes it. */
function symbol(win: object, lod: 'coarse' | 'medium' | 'fine' = 'fine'): { cut: number[]; proj: number[] } {
    const b = new WindowPlanSymbolBuilder();
    const geos = (b as unknown as {
        _computeSymbolGeometry(w: unknown, wall: unknown, lod: string): {
            cut: { getAttribute(n: string): { array: ArrayLike<number> } } | null;
            proj: { getAttribute(n: string): { array: ArrayLike<number> } } | null;
        } | null;
    })._computeSymbolGeometry(win, WALL, lod);
    expect(geos).not.toBeNull();
    return {
        cut:  Array.from(geos!.cut?.getAttribute('position').array ?? []),
        proj: Array.from(geos!.proj?.getAttribute('position').array ?? []),
    };
}
const segCount = (flat: number[]) => flat.length / 6;

describe('L-278 — the 3D window does not draw itself into the plan', () => {
    let meshes: THREE.Mesh[];
    beforeEach(() => { meshes = buildWindow(WIN); });

    it('builds a real window (frame bars, glazing, sill)', () => {
        expect(meshes.length).toBeGreaterThan(4);
    });

    it('W-1 — EVERY window mesh is tagged skipInPlan', () => {
        for (const m of meshes) {
            expect(m.userData.skipInPlan, `mesh role=${m.userData.role ?? '<none>'}`).toBe(true);
        }
    });

    it('W-2 — the HEAD BAR spans the whole opening ABOVE the cut plane: this is the phantom', () => {
        // The group is centred on the opening; the wall runs along local X. The head bar
        // therefore spans x ∈ [-w/2, +w/2] and sits at the TOP of the frame (y > 0).
        // In WORLD terms it is at 1.0 + 1.2 - ft/2 ≈ 2.175 m — far above a 1.2 m plan cut,
        // so nothing about it belongs in a plan, yet it is exactly what got dumped there.
        const spanning = meshes.filter(m => {
            m.geometry.computeBoundingBox();
            const bb = m.geometry.boundingBox!;
            return (bb.max.x - bb.min.x) >= WIN.width - 1e-6 && m.position.y > 0;
        });
        expect(spanning.length).toBeGreaterThan(0);                          // the head bar exists…
        for (const m of spanning) expect(m.userData.skipInPlan).toBe(true);  // …and is silenced
    });

    it('W-3 — the tag REACHES the view: the projector still honours the generic gate', () => {
        // Verify at the OUTCOME, not the seam. If this gate is removed the head bar comes
        // straight back and pollutes the symbol again, with nothing else failing.
        const eps = readFileSync(
            resolve(__dirname, '../../../apps/editor/src/engine/views/EdgeProjectorService.ts'),
            'utf8',
        );
        expect(eps).toMatch(/isPlanView\s*&&\s*mesh\.userData\.skipInPlan\s*===\s*true/);
        // …and the symbol really is injected into the plan (otherwise skipInPlan deletes the window).
        expect(eps).toMatch(/windowPlanSymbolBuilder\.inject\(/);
    });
});

describe('L-278 — …because THE SYMBOL carries the cut lines. skipInPlan is not a deletion.', () => {
    it('W-4 — the window is STILL CUT in plan: frame face lines + jamb ticks survive', () => {
        const { cut, proj } = symbol(WIN);
        // The frame cut profile — the lines the brief feared `skipInPlan` would delete.
        // They are here, and they come from the record, not from the mesh.
        expect(segCount(cut)).toBeGreaterThanOrEqual(4);
        // The glazing — the other half of "the lines that make it a window".
        expect(segCount(proj)).toBeGreaterThanOrEqual(1);

        const VOID_L = WIN.offset;                 // 1.00 — the opening's void edges…
        const VOID_R = WIN.offset + WIN.width;     // 2.20
        const HALF_T = WALL.thickness / 2;
        const has = (x: number, z: number) => {
            for (let i = 0; i < cut.length; i += 3) {
                if (Math.abs(cut[i]! - x) < 1e-5 && Math.abs(cut[i + 2]! - z) < 1e-5) return true;
            }
            return false;
        };
        // …with the jamb ticks landing exactly on them, at both wall faces.
        for (const n of [-HALF_T, +HALF_T]) {
            expect(has(VOID_L, n)).toBe(true);
            expect(has(VOID_R, n)).toBe(true);
        }
    });

    it('W-5 — a DOUBLE window is cut through its MEETING STILE, and the symbol draws it', () => {
        // The mullion is the member that proves the window is CUT rather than empty. It is
        // drawn ONLY because the record's pane grid says a pane boundary exists there.
        const single = symbol({ ...WIN, columnRatios: [1] });
        const double = symbol({ ...WIN, windowType: 'double' });

        // A single pane has NO post — the symbol must not invent one (L-127)…
        // …a double has exactly one, drawn as a closed rectangle (4 segments).
        expect(segCount(double.cut)).toBe(segCount(single.cut) + 4);

        // And the glass does not run through the post: the single-pane window has one
        // glazing run, the double has two (each drawn as a true double line).
        expect(segCount(double.proj)).toBe(segCount(single.proj) + 2);
    });
});
