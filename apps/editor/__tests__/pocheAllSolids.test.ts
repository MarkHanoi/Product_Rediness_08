// @vitest-environment happy-dom

/**
 * §FEAT-POCHE-ALL-SOLIDS (L-261 residual · ADR-121 §5.2(3) · C09 §4.6)
 *
 * THE RULE THIS GUARDS
 * --------------------
 * An element is a SOLID. A view either CUTS it (→ heavy outline + poché fill) or
 * PROJECTS it. **GEOMETRY decides which — never a layer name.**
 *
 * WHY THE GUARD EXISTS
 * --------------------
 * Poché shipped WALL-ONLY. The cut-section gate in `EdgeProjectorService` read:
 *
 *     if (isPlanView && cutPlaneY !== null && layerName === 'A-WALL') { … }
 *
 * So a COLUMN standing squarely in the 1.2 m cut plane drew as a HOLLOW OUTLINE right
 * next to a properly filled wall. A stair flight crossing the plane: hollow. That is
 * not a missing feature — it is the SOLIDITY RULE applied to ONE element type and no
 * other, which is precisely the habit ADR-121 exists to name: *PRYZM's documentation
 * layer is built for ONE case and never carried across* (L-262 LOD, L-263 auto-dim,
 * L-264 solidity, L-265 tagging, L-268 one-building — five sightings, one disease).
 *
 * The fix replaces the layer-name test with a set of SOLID ELEMENT LAYERS. This test
 * pins the RULE, not the instance:
 *
 *   S-1  the gate is a SET of solids — not the string 'A-WALL'
 *   S-2  a column / stair / beam / slab / roof is cut-eligible (they are solids)
 *   S-3  doors, glazing, furniture and plumbing are NOT — and each exclusion is
 *        principled, not an oversight (a door in the cut plane is a SYMBOL, and the
 *        wall's own cut section already carries the void the opening makes)
 *   S-4  widening the gate is SAFE: a solid that does not intersect the plane
 *        contributes nothing (buildPlanCutSectionGeometry returns null)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as THREE from '@pryzm/renderer-three/three';
import { buildPlanCutSectionGeometry } from '../src/engine/views/EdgeProjectorService';

const _here = dirname(fileURLToPath(import.meta.url));
const EPS_SRC = resolve(_here, '../src/engine/views/EdgeProjectorService.ts');

/** A solid box centred at (0, cy, 0) — stands in for a column, a wall, a stair tread. */
function solidBox(w: number, h: number, d: number, cy: number): THREE.Mesh {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
    mesh.position.set(0, cy, 0);
    mesh.updateMatrixWorld(true);
    return mesh;
}

describe('§FEAT-POCHE-ALL-SOLIDS — the cut plane cuts SOLIDS, not just walls', () => {
    it('S-1: the CUT GATE is a SET of solid layers — NOT a hardcoded `A-WALL`', () => {
        const src = readFileSync(EPS_SRC, 'utf8');
        const code = src
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '');

        // THE CUT GATE — the one that decides whether an element gets a `:cut` section
        // at all, and therefore whether it can ever be poché'd — must test the SOLID SET.
        expect(code).toMatch(/CUT_ELIGIBLE_PLAN_LAYERS\.has\(layerName\)/);
        expect(code).not.toMatch(/cutPlaneY\s*!==\s*null\s*&&\s*layerName\s*===\s*['"]A-WALL['"]/);

        // ── A NOTE ON WHAT THIS TEST DELIBERATELY DOES *NOT* FORBID ──────────────────
        //
        // An earlier draft of this guard asserted that NO `layerName === 'A-WALL'`
        // survived ANYWHERE in the file. It went red — and the PRODUCT was right, the
        // TEST was wrong. Recording that here, because the reflex to "make the test
        // pass" would have broken working code:
        //
        //   _suppressWallOpeningSeams(...)      — wall-only, CORRECTLY
        //   _suppressPlanViewOpeningLines(...)  — wall-only, CORRECTLY
        //
        // Openings (doors, windows) are hosted IN WALLS AND NOWHERE ELSE (C15). A column
        // has no openings; a stair has no openings. Those two gates are wall-specific
        // because the CONCEPT is wall-specific — that is not the walls-only disease, it
        // is the domain.
        //
        // THE RULE THIS TEST ENCODES: what must generalise across solids is the CUT/
        // PROJECT classification (C09 §4.6). What must NOT be generalised is behaviour
        // that is genuinely about a wall's openings. A guard that cannot tell those two
        // apart teaches you to delete correct code.
    });

    it('S-2: columns, stairs, beams, slabs and roofs are CUT-ELIGIBLE — they are solids', () => {
        const src = readFileSync(EPS_SRC, 'utf8');
        const setBlock = src.slice(
            src.indexOf('const CUT_ELIGIBLE_PLAN_LAYERS'),
            src.indexOf('(function _preinternLayerNames'),
        );

        // A column in the cut plane is as cut as a wall is. So is a stair flight.
        for (const layer of ['A-WALL', 'A-COLS', 'A-STRS', 'A-BEAM', 'A-FLOR', 'A-ROOF']) {
            expect(setBlock).toContain(`'${layer}'`);
        }
    });

    it('S-3: doors, glazing, furniture and plumbing are EXCLUDED — and that is principled', () => {
        const src = readFileSync(EPS_SRC, 'utf8');
        const setBlock = src.slice(
            src.indexOf('const CUT_ELIGIBLE_PLAN_LAYERS'),
            src.indexOf('(function _preinternLayerNames'),
        );
        // Strip the comment block so we test the SET's contents, not the prose that
        // explains the exclusions (which necessarily names them).
        const members = setBlock.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

        // A door/window in the cut plane is drawn as a SYMBOL, and the wall's own cut
        // section already carries the VOID at the opening (L-246). Poché-ing the leaf
        // would fill the very hole the opening exists to make.
        expect(members).not.toContain("'A-DOOR'");
        expect(members).not.toContain("'A-GLAZ'");
        // Furniture and fittings are symbols in plan, never poché.
        expect(members).not.toContain("'A-FURN'");
        expect(members).not.toContain("'A-PLMB'");
        // A ceiling is above the cut plane by definition — a reflected concept, not a cut one.
        expect(members).not.toContain("'A-CEIL'");
    });

    it('S-4: widening the gate is SAFE — a solid that misses the plane contributes NOTHING', () => {
        const CUT_Y = 1.2;

        // A column that STANDS IN the cut plane (0 → 3 m) must yield a real section.
        const column = solidBox(0.4, 3.0, 0.4, 1.5);
        const cutThrough = buildPlanCutSectionGeometry(column, CUT_Y);
        expect(cutThrough).not.toBeNull();

        // A ground slab BELOW the plane (−0.2 → 0 m) must yield NOTHING — not an error,
        // not an empty-but-present layer. This is why the wider gate costs nothing:
        // geometry decides, and a miss is free.
        const groundSlab = solidBox(10, 0.2, 10, -0.1);
        expect(buildPlanCutSectionGeometry(groundSlab, CUT_Y)).toBeNull();

        // A ceiling beam ABOVE the plane (2.8 → 3.2 m) — likewise nothing.
        const highBeam = solidBox(6, 0.4, 0.3, 3.0);
        expect(buildPlanCutSectionGeometry(highBeam, CUT_Y)).toBeNull();
    });
});
