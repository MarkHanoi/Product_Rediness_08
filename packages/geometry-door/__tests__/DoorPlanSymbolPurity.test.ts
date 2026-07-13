/**
 * §FIX-DOOR-PLAN-SYMBOL-PURITY (L-266) — "those lines are imaginary".
 *
 * THE REPORT
 * ──────────
 * The founder, on the shipped plan door symbol: *"There are lines that are really not
 * needed — those lines are imaginary. In the symbol we only need the FRAME, the LEAF
 * (opened — correct) and the CURVED LINE representing the opening. That's all. If you
 * can, you can represent the leaf when CLOSED in GREY and DASHED."*
 *
 * WHAT THE LINES ACTUALLY WERE (reproduced, not assumed)
 * ─────────────────────────────────────────────────────
 * The standing hypothesis was that they were the WALL's base/head edges projecting
 * through the door void, un-clipped because a plain wall stamped a lowercase
 * `elemType='wall'` and so never reached the `layerName === 'A-WALL'` suppression gate
 * (§FIX-PLAN-WALL-LAYER-CASE, 7b64ea7f). **That is refuted.** A wall that HOSTS an
 * opening is segmented into `WallPart` / `WallLayer` meshes — capitalised, already on
 * `A-WALL` — which is precisely why the founder saw poché appear the moment he placed a
 * door. The clip was therefore ALREADY running on every door-hosting wall, and the true
 * plan cut section is void at the opening BY CONSTRUCTION (L-246). The wall was never
 * the producer.
 *
 * The lines came from the DOOR, from two producers, and this suite pins both:
 *
 *   1. THE SYMBOL drew two FRAME FACE LINES from void edge to void edge at ±half the
 *      wall thickness — the WALL, re-drawn straight through the doorway — plus (at LOD
 *      300) a THRESHOLD chord across the clear opening. Three imaginary chords.
 *   2. THE 3D DOOR MESH. `DoorBuilder`'s frame HEAD BAR spans the full opening width at
 *      ~2 m; the projector classifies every edge above the 1.2 m cut plane as PROJECTION
 *      linework, so the head bar, the hinges, the threshold plate, the centre mullion and
 *      the glazing dumped their outlines across the void, on top of the symbol.
 *
 * THE RULE THIS LOCKS DOWN
 * ────────────────────────
 * At the plan cut height A DOOR OPENING IS EMPTY — the leaf has swung out of it. NOTHING
 * MAY BRIDGE THE VOID except the leaf, its arc, and (at LOD 300) its closed ghost. (A
 * WINDOW is the opposite case and legitimately keeps its spanning lines: its frame and
 * glazing ARE cut by the plane.)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DoorPlanSymbolBuilder } from '../src/DoorPlanSymbolBuilder';
import { DEFAULT_DOOR_DIMENSIONS } from '../src/DoorDimensions';
import { doorSystemTypeStore } from '../src/DoorSystemTypeStore';
import { penZoneFromLayerName, resolvePen, FALLBACK_PEN } from '@pryzm/core-app-model';

type Lod = 'coarse' | 'medium' | 'fine';

// Wall along +X, 200 mm thick. Door: 900 mm void at offset 1.0, hinged left, inward.
const WALL = { baseLine: [{ x: 0, z: 0 }, { x: 4, z: 0 }], thickness: 0.2, levelId: 'L0' };
const DOOR = {
    id: 'd1', wallId: 'w1', width: 0.9, offset: 1.0, handle: true,
    doorType: 'single' as const, hingesSide: 'left', swingDirection: 'inward',
};

const HALF_THK  = WALL.thickness / 2;              // 0.10 — the wall band
const HALF_W    = DOOR.width / 2;                  // 0.45
const CENTRE_X  = DOOR.offset + HALF_W;            // 1.45 — the door's mid-plane
const FRAME_T   = DEFAULT_DOOR_DIMENSIONS.frameThickness;   // 0.05
const LEAF_T    = DEFAULT_DOOR_DIMENSIONS.leafThickness;    // 0.04
const CLEAR_HALF = HALF_W - FRAME_T;               // 0.40 — centre → inner frame corner

type Geo = { getAttribute(n: string): { array: ArrayLike<number> } } | null;
interface Geos { cut: Geo; proj: Geo; ghost: Geo }

function build(lod: Lod, door: Record<string, unknown> = DOOR): { cut: number[]; proj: number[]; ghost: number[] } {
    const geos = (new DoorPlanSymbolBuilder() as unknown as {
        _computeSwingGeometry(d: unknown, w: unknown, lod: Lod): Geos | null;
    })._computeSwingGeometry(door, WALL, lod)!;
    return {
        cut:   Array.from(geos.cut?.getAttribute('position').array ?? []),
        proj:  Array.from(geos.proj?.getAttribute('position').array ?? []),
        ghost: Array.from(geos.ghost?.getAttribute('position').array ?? []),
    };
}

interface Seg { x0: number; z0: number; x1: number; z1: number }
function segs(flat: number[]): Seg[] {
    const out: Seg[] = [];
    for (let i = 0; i < flat.length; i += 6) {
        out.push({ x0: flat[i], z0: flat[i + 2], x1: flat[i + 3], z1: flat[i + 5] });
    }
    return out;
}

/**
 * THE PREDICATE THE FOUNDER DREW A RED LINE THROUGH.
 *
 * The wall runs along +X, so "along the wall" is x and "across the wall" is z. A segment
 * is an IMAGINARY CHORD when it stays inside the wall band (|z| ≤ halfThickness — i.e. it
 * is drawn in the wall's own depth, where at the cut height there is NOTHING) *and* it
 * crosses the door's mid-plane. The open leaf and the swing arc escape it because they
 * project far outside the wall band (the leaf tip is 800 mm clear of the wall face); the
 * frame linings escape it because they live at the jambs and never reach the mid-plane.
 */
function bridgesTheVoid(s: Seg): boolean {
    const inBand = Math.abs(s.z0) <= HALF_THK + 1e-6 && Math.abs(s.z1) <= HALF_THK + 1e-6;
    const spansMid = Math.min(s.x0, s.x1) < CENTRE_X - 1e-6 && Math.max(s.x0, s.x1) > CENTRE_X + 1e-6;
    return inBand && spansMid;
}

describe('L-266 — the plan symbol contains ONLY frame + leaf + arc (+ ghost/hardware at 300)', () => {
    it('NO cut or projection line bridges the door void, at ANY detail level', () => {
        for (const lod of ['coarse', 'medium', 'fine'] as Lod[]) {
            const g = build(lod);
            const offenders = [...segs(g.cut), ...segs(g.proj)].filter(bridgesTheVoid);
            expect(offenders).toEqual([]);
        }
    });

    it('the ONLY thing allowed to lie in the void is the CLOSED-LEAF GHOST', () => {
        // The ghost IS the leaf, drawn where the leaf would be if it were shut. It is the
        // one line-set that may bridge the void — and it is on the lighter BEYOND pen.
        const ghost = segs(build('fine').ghost);
        expect(ghost.length).toBe(4);
        expect(ghost.some(bridgesTheVoid)).toBe(true);
        // Its thickness is the REAL leaf thickness, centred on the wall centreline —
        // exactly where DoorBuilder centres the 3D leaf.
        const zs = ghost.flatMap(s => [s.z0, s.z1]);
        expect(Math.max(...zs)).toBeCloseTo(+LEAF_T / 2, 9);
        expect(Math.min(...zs)).toBeCloseTo(-LEAF_T / 2, 9);
    });

    it('the frame is TWO LININGS at the jambs — never a box around the doorway', () => {
        // Every cut segment must live at a jamb (within frameThickness of a void edge)
        // or be part of the leaf (outside the wall band). Nothing in between.
        for (const s of segs(build('fine').cut)) {
            const atJamb = [s.x0, s.x1].every(x =>
                Math.abs(x - DOOR.offset) <= FRAME_T + 1e-6 ||
                Math.abs(x - (DOOR.offset + DOOR.width)) <= FRAME_T + 1e-6);
            const isLeaf = Math.abs(s.z0) > HALF_THK + 1e-6 || Math.abs(s.z1) > HALF_THK + 1e-6
                || Math.abs(s.x0 - (CENTRE_X - CLEAR_HALF)) <= LEAF_T + 1e-6;   // leaf hinge edge
            expect(atJamb || isLeaf).toBe(true);
        }
    });
});

describe('L-266 — every dimension is DERIVED FROM THE RECORD, never a literal', () => {
    // ADR-121 §4.4: "a richer HARDCODED glyph is the same bug at higher resolution."
    // Register a door type with dimensions that share NO value with the defaults, then
    // assert every feature of the LOD-300 symbol moved with it.
    const TYPE_ID = 'l266-heavy-oak';
    const D = { frameThickness: 0.09, leafThickness: 0.07, width: 0.9, height: 2.1, frameDepth: 0.12 };

    it('the lining, the rebate, the leaf and the HARDWARE all follow the door type', () => {
        (doorSystemTypeStore as unknown as { add?: (t: unknown) => void }).add?.({
            id: TYPE_ID, name: 'Heavy Oak', dimensions: D,
        });
        // If the store rejects registration in this environment, the resolver falls back to
        // the defaults and the test below would be vacuous — so assert it took.
        expect(doorSystemTypeStore.getById(TYPE_ID)?.dimensions?.leafThickness).toBe(D.leafThickness);

        const g = build('fine', { ...DOOR, systemTypeId: TYPE_ID });
        const clearHalf = HALF_W - D.frameThickness;              // 0.36 (was 0.40)
        const hingeX    = CENTRE_X - clearHalf;                   // inner frame corner
        const leafLen   = DOOR.width - 2 * D.frameThickness;      // 0.72 (was 0.80)

        const has = (flat: number[], x: number, z: number) =>
            segs(flat).some(s =>
                (Math.abs(s.x0 - x) < 1e-6 && Math.abs(s.z0 - z) < 1e-6) ||
                (Math.abs(s.x1 - x) < 1e-6 && Math.abs(s.z1 - z) < 1e-6));

        // Leaf: hinged at the TYPE's inner frame corner, TYPE thickness, TYPE clear width.
        expect(has(g.cut, hingeX, 0)).toBe(true);
        expect(has(g.cut, hingeX + D.leafThickness, 0)).toBe(true);
        expect(has(g.cut, hingeX, leafLen)).toBe(true);
        // Rebate: offset from the leaf's closed plane by half the TYPE's leaf thickness.
        expect(has(g.cut, DOOR.offset, D.leafThickness / 2)).toBe(true);
        // Hardware: the rose sits 3 × the TYPE's leaf thickness back from the latch edge.
        const roseAxis = leafLen - 3 * D.leafThickness;
        expect(has(g.proj, hingeX, roseAxis - D.leafThickness)).toBe(true);   // rose cheek A
        // Ghost: the TYPE's leaf, lying closed.
        const gz = segs(g.ghost).flatMap(s => [s.z0, s.z1]);
        expect(Math.max(...gz)).toBeCloseTo(D.leafThickness / 2, 9);

        // …and NONE of the DEFAULT-derived positions survive.
        expect(has(g.cut, CENTRE_X - (HALF_W - FRAME_T), 0)).toBe(false);
    });

    it('a door whose record says it has NO handle gets NO ironmongery', () => {
        const withH    = build('fine', { ...DOOR, handle: true });
        const withoutH = build('fine', { ...DOOR, handle: false });
        expect(segs(withoutH.proj).length).toBe(segs(withH.proj).length - 8);
    });
});

describe('L-266 — every line resolves to a PEN-TABLE weight (Contract 23 §8)', () => {
    // "Grey + dashed" is a PEN, not a hex literal in a builder. Each sub-layer this
    // builder authors must classify into a zone the pen table actually prices.
    it.each([
        ['A-DOOR-CUT',    'CUT'],
        ['A-DOOR-PROJ',   'PROJECTION'],
        ['A-DOOR-BEYOND', 'BEYOND'],
    ])('%s → %s zone → a real door pen', (layer, zone) => {
        expect(penZoneFromLayerName(layer)).toBe(zone);
        const pen = resolvePen(zone as 'CUT' | 'PROJECTION' | 'BEYOND', 'door');
        expect(pen).not.toBe(FALLBACK_PEN);
        expect(pen.widthMm).toBeGreaterThan(0);
    });

    it('the ghost pen IS the lighter pen — grey, thinner than cut AND than projection', () => {
        // THE ONE PLACE THIS DIVERGES FROM THE FOUNDER'S WORDS, DELIBERATELY.
        // He asked for the closed-leaf ghost "in GREY and DASHED". The same founder, the
        // same day, made C09 §4.6.4 normative (§FEAT-REVIT-LINE-TYPE-SEMANTICS, L-277):
        // *"Dashed lines should be reserved ONLY for true hidden edges."* The ghost is not
        // an occluded edge — it is reference linework we DELIBERATELY show, which is the
        // exact definition of the BEYOND zone. So it takes BEYOND's pen: grey, translucent
        // and lighter than everything else on the symbol. A dash here would have to come
        // from an explicit GraphicsRules intent override — never from a literal in a
        // builder, and never by mis-filing the ghost as a hidden edge.
        const cut   = resolvePen('CUT', 'door');
        const proj  = resolvePen('PROJECTION', 'door');
        const ghost = resolvePen('BEYOND', 'door');
        expect(ghost.widthMm).toBeLessThan(cut.widthMm);
        expect(ghost.widthMm).toBeLessThan(proj.widthMm);
        expect(ghost.opacity).toBeLessThan(1);
        expect(ghost.dashPx).toBeNull();          // L-277: only HIDDEN dashes
    });

    it('the builder authors NO colour literal — it asks for a zone', () => {
        // The only colours in the file are the THREE material stubs (0x000000), which the
        // plan canvas overrides with the resolved pen. A hex/rgb pen literal would mean a
        // builder had started deciding style. (PlanViewCanvas re-resolves from the layer.)
        const src = readFileSync(resolve(__dirname, '../src/DoorPlanSymbolBuilder.ts'), 'utf8');
        const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        expect(code).not.toMatch(/#[0-9a-fA-F]{6}/);
        expect(code).not.toMatch(/rgba?\(/);
    });
});
