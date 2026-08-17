/**
 * L-934 — a LAYERED interior partition next to an L-corner renders one stretch in
 * the wrong material (founder, 2026-08-17, PRODUCTION, screenshot: a full-height
 * TAN/BEIGE band with a crisp vertical edge, beside the corner, on an otherwise
 * white wall).
 *
 * ── THE CHEAP EXPLANATION IS RULED OUT, BY CONSTRUCTION ──────────────────────
 * Test 1 below gives every wall in the scene the SAME wall system type
 * (`wt-monolithic`, "Monolithic (Default)" — the type a user draws with before
 * choosing one) and therefore byte-identical layer sets. The colour split still
 * appears. So the two walls do NOT "genuinely have different finishes": one type
 * renders in two colours.
 *
 * ── WHAT IS ACTUALLY MEASURED ────────────────────────────────────────────────
 * The colour ACTUALLY BOUND to the rendered face — `mesh.material.color` read off
 * the scene graph for the mesh path, and the `THREE.Material` actually handed to
 * `WallInstanceBridge.register()` for the instanced path. Not a builder's return
 * value: this repo has shipped four "fixed" defects that could not run.
 *
 * ── THE MECHANISM ────────────────────────────────────────────────────────────
 * `WallFragmentBuilder.buildWall` routes on `isSimpleWall` (:1105-1111), which is
 * FALSE as soon as the wall carries miter join data — i.e. as soon as it touches a
 * junction. The two arms disagree about the default colour of the very same wall:
 *
 *   • no join  → instanced arm  (:1137) → `wall.materialColor ?? '#e8e8e8'`  WHITE
 *                and `wall.layers` is IGNORED ENTIRELY — one unit box, one colour.
 *   • join     → layered arm    (:1478) → `layer.materialColor ?? … ?? '#d4c5b0'`
 *                and `wt-monolithic`'s only layer DECLARES `#d4c5b0`            TAN
 *
 * `§BEIGE-WALL-FIX (2026-06-08)` is quoted in the builder at :1125 describing this
 * EXACT symptom — "the old '#d4c5b0' beige fallback made join/opening-free walls
 * render tan while their opening-bearing neighbours rendered white". It was applied
 * to the instanced arm (:1137) and to `WallInstanceBridge.register` (:81) and
 * NOWHERE ELSE. The layered arm kept the beige. The junction is what selects the
 * arm, which is why the band sits NEXT TO the corner and why its edge is crisp:
 * it is a different mesh with a different material, exactly as the founder says.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { WallFragmentBuilder } from '../src/WallFragmentBuilder';
import { WallJoinResolver } from '../src/WallJoinResolver';
import { WallSystemTypeStore } from '../src/WallSystemTypeStore';
import type { WallData } from '../src/WallTypes';

// ─── The founder's scene ──────────────────────────────────────────────────────
// Two existing walls mitred into an L at (5,0); a LAYERED interior partition drawn
// out of that corner with its FIRST POINT on the junction, then continuing away.
// Same geometry family as `LayeredWallCornerClash.test.ts` (the 2026-08-06 report
// of the same setup, different symptom).

/** `wt-monolithic` — the DEFAULT type. One layer, and it declares '#d4c5b0'. */
const MONOLITHIC = new WallSystemTypeStore().getById('wt-monolithic')!;
/** `wt-interior-partition` — plaster / stud / plaster, THREE distinct declared colours. */
const PARTITION = new WallSystemTypeStore().getById('wt-interior-partition')!;

let _seq = 0;
function mk(s: [number, number], e: [number, number], type = MONOLITHIC): WallData {
    const layers = type.layers.map(l => ({ ...l }));
    const thickness = layers.reduce((t, l) => t + l.thickness, 0);
    return {
        id: `l934_${_seq++}`, type: 'wall', levelId: 'L', properties: {}, childrenIds: [],
        baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
        height: 3, thickness, baseOffset: 0, openings: [],
        systemTypeId: type.id,
        layers,
        metadata: { createdAt: _seq },
    } as unknown as WallData;
}

/**
 * A recording stand-in for `WallInstanceBridge`. The builder only ever calls
 * `register` / `isInstanced` / `unregister` on it (grepped: :1138, :1179, :1180,
 * :797), so this covers the whole surface — and `register`'s 4th argument IS the
 * material the GPU will draw with, which is the thing under measurement.
 */
function recordingBridge() {
    const registered = new Map<string, THREE.Material>();
    return {
        registered,
        register: (w: WallData, _y: number, _j: unknown, m: THREE.Material) => { registered.set(w.id, m); },
        isInstanced: (id: string) => registered.has(id),
        unregister: (id: string) => { registered.delete(id); },
    };
}

/**
 * Builds every wall through the REAL builder with REAL `WallJoinResolver` join
 * data, then reports the colour ACTUALLY BOUND to each wall's rendered faces —
 * read from the scene graph (mesh arm) or from the register() call (instanced arm).
 */
function renderedColours(walls: WallData[]): Map<string, { arm: string; colours: string[] }> {
    const scene = new THREE.Scene();
    const builder = new WallFragmentBuilder(scene, {} as any);
    const bridge = recordingBridge();
    builder.setInstanceBridge(bridge as any);

    const joins = WallJoinResolver.resolveLevel(walls.map(w => ({ ...w })), { snapRadius: 0.5 });

    const out = new Map<string, { arm: string; colours: string[] }>();
    for (const w of walls) {
        const jd: any = joins.get(w.id) ?? null;
        // eslint-disable-next-line no-console
        console.log(`  [join] ${w.id} startMN=${jd?.startMN ? 'YES' : 'no'} endMN=${jd?.endMN ? 'YES' : 'no'}`);
        builder.buildWall(w, jd, undefined, 0);

        const inst = bridge.registered.get(w.id);
        if (inst) {
            out.set(w.id, {
                arm: 'instanced',
                colours: [`#${(inst as THREE.MeshStandardMaterial).color.getHexString()}`],
            });
            continue;
        }

        // Mesh arm — read the material bound to every rendered wall body face.
        const root = scene.children.find(c => c.userData?.id === w.id)!;
        const colours: string[] = [];
        let arm = 'mesh';
        root.traverse(o => {
            const m = o as THREE.Mesh;
            if (!(m as any).isMesh) return;
            if (m.userData?.role === 'hit-proxy') return;          // invisible picking box
            if (m.userData?.elementType === 'WallLayer') arm = 'mesh:layered';
            const mat = m.material as THREE.MeshStandardMaterial;
            if (!mat || !mat.color) return;                        // edge overlays are LineSegments
            if ((mat as any).colorWrite === false) return;         // writes nothing to the frame
            colours.push(`#${mat.color.getHexString()}`);
        });
        out.set(w.id, { arm, colours });
    }
    return out;
}

describe('L-934 — one wall type, two colours, decided by junction adjacency', () => {

    it('THE CHEAP EXPLANATION IS RULED OUT: all three walls carry the SAME type and layer set', () => {
        _seq = 0;
        const A = mk([0, 0], [5, 0]);           // existing shell wall
        const B = mk([5, 0], [5, 5]);           // existing shell wall — L-corner at (5,0)
        const C = mk([5, 0], [1, 0.0001]);      // the founder's partition, first point ON the corner

        for (const w of [A, B, C]) {
            expect((w as any).systemTypeId).toBe('wt-monolithic');
            expect(JSON.stringify((w as any).layers)).toBe(JSON.stringify(MONOLITHIC.layers));
        }
        // §L934-ONE-WALL-ONE-COLOUR — the DEFAULT type used to declare '#d4c5b0', which
        // is the tan the founder photographed: the layered arm paints the layer's own
        // colour, so the default type was declaring the very beige §BEIGE-WALL-FIX had
        // removed from the code. It must now declare the same white the plain arm uses.
        expect(MONOLITHIC.layers.map(l => l.materialColor)).not.toContain('#d4c5b0');
        expect(MONOLITHIC.layers.map(l => l.materialColor)).toEqual(['#e8e8e8']);
    });

    it('MEASUREMENT: the colour bound to the rendered face differs across walls of ONE type', () => {
        _seq = 0;
        // Geometry taken verbatim from the PROVEN L-corner fixture
        // (`WallJoinResolver.newWallLCornerFlush.test.ts`): A ⟂ B mitre at (5,0),
        // and C is the new partition drawn diagonally out of that same corner.
        const A = mk([0, 0], [5, 0]);
        const B = mk([5, 0], [5, 5]);
        const C = mk([5, 0], [3.5, 1.5]);
        const walls = [A, B, C];

        const measured = renderedColours(walls);

        // eslint-disable-next-line no-console
        console.log('\n[L-934] colour ACTUALLY BOUND to the rendered face, per wall:');
        for (const w of walls) {
            const r = measured.get(w.id)!;
            // eslint-disable-next-line no-console
            console.log(`  ${w.id}  arm=${r.arm.padEnd(12)}  colours=${[...new Set(r.colours)].join(', ')}`);
        }

        const distinct = new Set([...measured.values()].flatMap(r => r.colours));
        // eslint-disable-next-line no-console
        console.log(`  → DISTINCT COLOURS IN THE SCENE: ${[...distinct].join(', ')}\n`);

        // THE DEFECT: one wall type must render in ONE colour. Every wall here has
        // byte-identical layers; only junction adjacency differs.
        expect(distinct.size).toBeGreaterThan(0);          // never pass on an empty read
        expect([...distinct]).toEqual([...distinct].slice(0, 1));
    });

    it("THE FOUNDER'S OBSERVABLE: a polyline partition out of an L-corner is TAN at the corner and WHITE beyond it", () => {
        _seq = 0;
        const A  = mk([0, 0], [5, 0]);          // existing shell
        const B  = mk([5, 0], [5, 5]);          // existing shell — L-corner at (5,0)
        const C1 = mk([5, 0], [3.5, 1.5]);      // partition segment 1 — FIRST POINT on the corner
        const C2 = mk([3.5, 1.5], [2, 3]);      // segment 2 — collinear continuation, free end
        const walls = [A, B, C1, C2];

        const measured = renderedColours(walls);

        // eslint-disable-next-line no-console
        console.log('\n[L-934] the founder\'s polyline partition, per segment:');
        for (const w of walls) {
            const r = measured.get(w.id)!;
            // eslint-disable-next-line no-console
            console.log(`  ${w.id}  arm=${r.arm.padEnd(12)}  colours=${[...new Set(r.colours)].join(', ')}`);
        }

        const seg1 = new Set(measured.get(C1.id)!.colours);
        const seg2 = new Set(measured.get(C2.id)!.colours);
        // eslint-disable-next-line no-console
        console.log(`  → corner-adjacent segment: ${[...seg1]}   continuation: ${[...seg2]}\n`);

        // ONE partition, ONE type, drawn in ONE gesture — it must render in ONE colour.
        expect(seg1.size).toBeGreaterThan(0);
        expect(seg2.size).toBeGreaterThan(0);
        expect([...seg1]).toEqual([...seg2]);
    });

    it('THE SAME ROUTER ALSO FLATTENS a multi-layer wall: unjoined, its 3 declared layer colours vanish', () => {
        _seq = 0;
        // A free-standing plaster/stud/plaster partition, touching nothing.
        const P = mk([0, 0], [4, 0], PARTITION);
        const declared = new Set(PARTITION.layers.map(l => l.materialColor!));

        const measured = renderedColours([P]);
        const rendered = new Set(measured.get(P.id)!.colours);

        // eslint-disable-next-line no-console
        console.log(`\n[L-934] wt-interior-partition, UNJOINED — arm=${measured.get(P.id)!.arm}`);
        // eslint-disable-next-line no-console
        console.log(`  declared layer colours: ${[...declared].join(', ')}`);
        // eslint-disable-next-line no-console
        console.log(`  rendered colours:       ${[...rendered].join(', ')}\n`);

        // Every colour the type DECLARES must appear on the rendered wall.
        expect(rendered.size).toBeGreaterThan(0);
        for (const c of declared) expect([...rendered]).toContain(c);
    });
});
