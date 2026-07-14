/**
 * §FEAT-WINDOW-CUT-ZONE-AND-LOD (L-278) — the 3D window (and therefore the ELEVATION)
 * consumes DetailLevel. THE WINDOW ROW OF ADR-121'S LOD MATRIX.
 *
 * ADR-121 §3.3: of 42 (element × view-type) pairs, only door×plan and window×plan
 * discriminated the detail level at all — *"ELEVATION AND SECTION CONSUME LOD IN ZERO
 * CELLS."* L-266 closed the DOOR row (4 of 42). The window's 3D + elevation cells were
 * still ✗, and this suite closes them.
 *
 * WHY THE 3D MESH IS THE RIGHT PLACE, AND NOT A SECOND SYMBOL ENGINE: an elevation is a
 * PROJECTION OF THESE MESHES. ADR-121 §4.3 — *"One resolver, three consumers — NOT a second
 * symbol engine per view type… There must not be a `resolveElevationDetailLevel`."* So the
 * mesh gains the articulation, the elevation inherits it for free, and the tier is resolved
 * by the SAME `resolveEffectiveDetailLevel` the plan symbol calls, against the real
 * `vd-sys-3d-1` ViewDefinition. No private `detailed` flag — THE LOD IS THE VIEW'S DECISION.
 *
 *   coarse 100 — the MASSING window: outer frame + ONE sheet of glass. No dividers, no
 *                sash, no bead, no sill.
 *   medium 200 — TODAY'S WINDOW, exactly: frame + mullions/transoms + per-cell panes + sill.
 *                Pinned, so no view setting can ever REGRESS the model that ships.
 *   fine   300 — + the SASH (the openable leaf frame) and the GLAZING BEAD standing in the
 *                frame rebate — the founder's *"real multi-line profile: outer frame, sash,
 *                mullion/meeting-stile, and the glazing line."*
 *
 * Every dimension is resolved through `resolveWindowDimensions()` (record → systemType →
 * canonical default). A richer HARDCODED window would be the same bug at higher resolution
 * (ADR-121 §4.4), so the last test proves the sash MOVES with the record.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { viewDefinitionStore, DEFAULT_3D_VIEW_ID, initDefaultViewsManager } from '@pryzm/core-app-model';
import { WindowBuilder } from '../src/WindowBuilder';

const WALL = {
    id: 'w1', levelId: 'L0', thickness: 0.2, height: 3,
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
};
const wallStoreStub = {
    getById: () => WALL,
    getLevelById: () => ({ id: 'L0', elevation: 0 }),
} as never;

const WIN = {
    id: 'win1', wallId: 'w1', openingId: 'o1',
    offset: 1.0, width: 1.2, height: 1.2, sillHeight: 1.0,
    frameThickness: 0.05, frameDepth: 0.2, frameColor: '#e8e8e8',
    columnRatios: [1], rowRatios: [1],
    columnDividerThickness: 0.03, rowDividerThickness: 0.03,
    sill: true, sillDepth: 0.08, sillThickness: 0.03,
    glassOpacity: 0.3, windowType: 'single',
};

type Lod = 'coarse' | 'medium' | 'fine';

/** Build at `lod` by setting the 3D VIEW's detail level — the real C09 precedence path. */
function buildAt(lod: Lod, win: object = WIN): THREE.Mesh[] {
    initDefaultViewsManager();                                  // ensures vd-sys-3d-1 exists
    viewDefinitionStore.update(DEFAULT_3D_VIEW_ID, { output: { detailLevel: lod } } as never);
    const scene = new THREE.Scene();
    const builder = new WindowBuilder(scene, wallStoreStub);
    (builder as unknown as { rebuild(w: unknown): void }).rebuild(win);
    const meshes: THREE.Mesh[] = [];
    scene.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    return meshes;
}

const count = (m: THREE.Mesh[], role: string) =>
    m.filter(x => (x.userData.role as string) === role).length;

describe('L-278 — the 3D window reads the SHARED DetailLevel resolver, via the 3D ViewDefinition', () => {
    it('the view\'s Detail Level actually changes the mesh (it is a real consumer)', () => {
        expect(buildAt('coarse').length).toBeLessThan(buildAt('medium').length);
        expect(buildAt('medium').length).toBeLessThan(buildAt('fine').length);
    });

    it('coarse is the MASSING window — frame + ONE sheet of glass, nothing else', () => {
        const m = buildAt('coarse');
        expect(count(m, 'windowFrame')).toBe(4);      // head, cill, two jambs
        expect(count(m, 'windowGlazing')).toBe(1);    // a single sheet, not a pane grid
        expect(count(m, 'windowSash')).toBe(0);
        expect(count(m, 'windowBead')).toBe(0);
        expect(count(m, 'windowSill')).toBe(0);       // no sill board on the massing window
    });

    it('medium is TODAY\'S WINDOW — frame + panes + sill, no sash (no regression, ever)', () => {
        const m = buildAt('medium');
        expect(count(m, 'windowFrame')).toBe(4);
        expect(count(m, 'windowGlazing')).toBe(1);    // 1 col × 1 row
        expect(count(m, 'windowSill')).toBe(1);
        expect(count(m, 'windowSash')).toBe(0);       // the sash is LOD-300 articulation
        expect(count(m, 'windowBead')).toBe(0);
    });

    it('fine adds the SASH — four mitred members around every pane', () => {
        expect(count(buildAt('fine'), 'windowSash')).toBe(4);      // 1 pane × 4 members
        expect(count(buildAt('fine'), 'windowBead')).toBeGreaterThan(0);
    });

    it('fine is a strict SUPERSET of medium: it ADDS members, never removes one', () => {
        const med  = buildAt('medium');
        const fine = buildAt('fine');
        for (const role of ['windowFrame', 'windowGlazing', 'windowSill'] as const) {
            expect(count(fine, role)).toBeGreaterThanOrEqual(count(med, role));
        }
        expect(fine.length).toBeGreaterThan(med.length);
    });

    it('a DOUBLE window grows a MULLION at every tier that has a pane grid', () => {
        const dbl = { ...WIN, windowType: 'double' };
        // DW-11: a `double` ALWAYS has two sashes on a structural centre post…
        expect(count(buildAt('medium', dbl), 'windowMullion')).toBe(1);
        expect(count(buildAt('medium', dbl), 'windowGlazing')).toBe(2);
        // …and at fine each of the two panes gets its own sash.
        expect(count(buildAt('fine', dbl), 'windowSash')).toBe(8);
        // The massing window has no grid at all.
        expect(count(buildAt('coarse', dbl), 'windowMullion')).toBe(0);
    });
});

describe('L-278 — ADR-121 §4.4: the articulation is DERIVED from the record, never typed', () => {
    it('a record sashThickness override MOVES the sash by exactly that much', () => {
        const sashDepthOf = (win: object) => {
            const sashes = buildAt('fine', win).filter(m => m.userData.role === 'windowSash');
            const top = sashes.reduce((a, b) => (a.position.y > b.position.y ? a : b));
            top.geometry.computeBoundingBox();
            const bb = top.geometry.boundingBox!;
            return bb.max.y - bb.min.y;      // the sash member's face width
        };
        // The default casement sash is 34 mm. A record that says 60 mm must draw 60 mm —
        // if a literal survived in the builder, this number would not move.
        expect(sashDepthOf(WIN)).toBeCloseTo(0.034, 5);
        expect(sashDepthOf({ ...WIN, sashThickness: 0.06 })).toBeCloseTo(0.06, 5);
    });

    it('the DOUBLE meeting stile is widened to its 60 mm minimum — resolved, not re-derived', () => {
        // Two sashes MEET on this post, so it carries two frame sections. The rule used to
        // live as `Math.max(cdt, 0.06)` inside WindowBuilder, where the plan symbol could not
        // see it — so the 3D grew a 60 mm stile and the symbol drew the record's 30 mm one.
        const mullion = buildAt('medium', { ...WIN, windowType: 'double' })
            .find(m => m.userData.role === 'windowMullion')!;
        mullion.geometry.computeBoundingBox();
        const bb = mullion.geometry.boundingBox!;
        expect(bb.max.x - bb.min.x).toBeCloseTo(0.06, 5);   // NOT the record's 0.03
    });
});
