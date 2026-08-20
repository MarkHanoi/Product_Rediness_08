/**
 * ⭐ C100 §2.1 / §9.6.c step 3 / L-1460 — A FURNITURE `materialId` REACHES THE
 * RENDERED MESH.
 *
 * ─── ⛔ WHY THIS FILE EXISTS AND NOT ANOTHER PRODUCER TEST ────────────────────
 *
 * C100 §9.3 RETRACTED a coverage proof because it was titled *"resolves an id-only
 * door"*, never constructed a door, and *"would pass unchanged if `producers/door.ts`
 * were deleted"*. Its own header had forbidden exactly that: *"asserting
 * `materialHex()` returns a hex would prove only that a pure function works."*
 *
 * ⭐ **The same trap, one layer up, is the reason this suite is here at all.** C100
 * §9.8 records slice S16 routing `geometry-kernel/producers/furniture.ts` through the
 * master resolver, with its own real-DTO-through-real-producer-into-real-bridge test,
 * and the gate's ARM C agrees. All of that is true. ⛔ **And none of it renders the
 * founder's furniture**, because production furniture is not committed through that
 * producer. `initTools.ts` §FT-FURNITURE says so in its own words — the PRYZM-3
 * `CreateFurniturePayload` *"does NOT match the legacy `FurnitureData` model … and no
 * bus→legacy bridge existed"* — so the plan tool, the carousel drag-drop, the kitchen
 * and wardrobe tools, copy/paste and the whole D-FLE `furniture.batch.create` furnish
 * run are mirrored into the legacy `FurnitureStore` and rendered by
 * `FurnitureFragmentBuilder`. A test can be honest about its producer and still be
 * measuring a path the user never travels.
 *
 * **So this suite drives the path the user travels, to the deepest artefact
 * available in a headless test:** it constructs a real `FurnitureData`, hands it to a
 * real `FurnitureFragmentBuilder` attached to a real `THREE.Scene`, and reads the
 * colour off the real `THREE.Material` on the real `THREE.Mesh` that lands in that
 * scene. Every expected hex is read OUT of `MATERIAL_CATALOG`, never typed.
 *
 * ⚠ WHAT IT STILL DOES NOT PROVE, stated so it is never read as coverage (C70 §7.1):
 * that a frame was encoded, that the committer used this builder in production, or
 * that the colour survives the GPU-instancing arm (`setInstanceBridge`, not exercised
 * here). It proves the material reaches the MESH. C100 §9.7's *"ARM C proves the
 * import, not the frame"* applies to this suite too, one artefact further along.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { describe, expect, it } from 'vitest';
import { MATERIAL_CATALOG } from '@pryzm/schemas/materials';
import { FurnitureFragmentBuilder } from '../src/FurnitureFragmentBuilder';
import { UNRESOLVED_FURNITURE_MATERIAL_COLOR } from '../src/furnitureMaterialColour';
import type { FurnitureData } from '../src/FurnitureTypes';

/** Read from the master. NEVER transcribed — that is what §9.3 punishes. */
const masterHex = (id: string): string => {
    const row = (MATERIAL_CATALOG as ReadonlyArray<{ id: string; color: string }>).find(m => m.id === id);
    if (!row) throw new Error(`fixture id "${id}" is not in MATERIAL_CATALOG — reconcile it (C100 §9.5), do not retype a hex`);
    return row.color.toLowerCase();
};

const furniture = (over: Partial<FurnitureData> = {}): FurnitureData => ({
    id: `f-${Math.random().toString(36).slice(2)}`,
    type: 'furniture',
    furnitureType: 'table',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, order: 'XYZ' },
    levelId: 'L0', levelName: 'L0', levelElevation: 0, baseOffset: 0,
    width: 1.2, length: 0.8, height: 0.75,
    material: 'wood',
    properties: {},
    ...over,
} as FurnitureData);

/**
 * Every distinct colour on a real material of a real mesh, after the real builder
 * has put it in a real scene. Hex strings, lower-case.
 */
function paintedColours(data: FurnitureData): string[] {
    const scene = new THREE.Scene();
    new FurnitureFragmentBuilder(scene).updateFurniture(data);

    const root = scene.children.find(c => (c.userData as { id?: string } | undefined)?.id === data.id);
    expect(root, 'the builder must attach a root group for this furniture id').toBeDefined();

    const out = new Set<string>();
    root!.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const m of (Array.isArray(mesh.material) ? mesh.material : [mesh.material])) {
            const c = (m as THREE.MeshStandardMaterial | undefined)?.color;
            if (c) out.add(`#${c.getHexString().toLowerCase()}`);
        }
    });
    expect(out.size, 'the builder must produce at least one material').toBeGreaterThan(0);
    return [...out];
}

describe('C100 §2.1 / L-1460 — a furniture materialId reaches the rendered mesh', () => {
    // ─── 1. THE DEFECT ITSELF ────────────────────────────────────────────────
    it('a table naming wood-oak is painted the MASTER\'s oak, on a real mesh', () => {
        expect(paintedColours(furniture({ materialId: 'wood-oak' })))
            .toContain(masterHex('wood-oak'));
    });

    // ─── 2. ⭐ THE LOAD-BEARING CASE ─────────────────────────────────────────
    // Case 1 alone would pass if every furniture item were painted oak. What a user
    // actually sees is the DIFFERENCE between two materials, and C100 §9.4 records
    // this family's historic failure as a COLLISION — a djb2 hash over 8 buckets
    // painting oak and walnut identically. Assert they differ, not merely that one
    // is right.
    it('oak and walnut are painted DIFFERENTLY — the collision C100 §9.4 records', () => {
        const oak = paintedColours(furniture({ materialId: 'wood-oak' }));
        const walnut = paintedColours(furniture({ materialId: 'wood-walnut' }));

        expect(oak).toContain(masterHex('wood-oak'));
        expect(walnut).toContain(masterHex('wood-walnut'));
        expect(masterHex('wood-oak')).not.toBe(masterHex('wood-walnut'));
        expect(oak.includes(masterHex('wood-walnut')), 'light timber must not be painted dark timber').toBe(false);
    });

    // ─── 3. C100 §5 — a NAMED failure, never a plausible timber ──────────────
    it('an id that names nothing in the master paints MAGENTA, not a believable colour', () => {
        const painted = paintedColours(furniture({ materialId: 'walnut.dark', color: '#112233' }));
        expect(painted, 'C100 §5 — "your material was lost" must not look like a design choice')
            .toContain(UNRESOLVED_FURNITURE_MATERIAL_COLOR);
        expect(painted.includes('#112233'), 'a NAMED failure outranks the style colour beside it').toBe(false);
    });

    // ─── 4. ⭐ THE NOTHING-REPAINTS CONTROL ──────────────────────────────────
    // C100 §9.6.b names repainting the product as the thing that would rightly get
    // this convergence reverted. Every furniture record in every saved project today
    // carries no materialId — the field did not exist — so this case IS the whole
    // existing product, and it must be byte-identical.
    it('furniture naming NO material keeps its existing colour exactly', () => {
        expect(paintedColours(furniture({ color: '#c09a6b' }))).toContain('#c09a6b');
    });

    it('furniture naming neither a material NOR a colour keeps the builder default', () => {
        // 0x8b4513 is TableBuilder's own untouched default. Asserted as a control,
        // not as an intention: if this moves, the change was not additive.
        expect(paintedColours(furniture({}))).toContain('#8b4513');
    });

    // ─── 5. The precedence deviation, DECLARED and therefore PINNED ──────────
    // furnitureMaterialColour.ts documents why materialId outranks `color` on this
    // path (the D-FLE furnish engine stamps `color` on every item it places as a
    // style default, so honouring it first would mean a chosen material could never
    // render on auto-furnished furniture). A declared divergence that no test pins
    // is a comment, not a decision.
    it('a named material OUTRANKS the furnish engine\'s style colour', () => {
        const painted = paintedColours(furniture({ materialId: 'wood-walnut', color: '#c09a6b' }));
        expect(painted).toContain(masterHex('wood-walnut'));
        expect(painted.includes('#c09a6b')).toBe(false);
    });
});
