// @vitest-environment happy-dom

/**
 * §FIX-PLAN-WALL-LAYER-CASE (L-275) — "ONLY when I place a door does the wall fill."
 *
 * THE REPORT, AND WHY IT WAS SUCH A GOOD ONE
 * ------------------------------------------
 * The founder sent two screenshots of the SAME WALL in the SAME VIEW:
 *   • no door → a hollow outline (no poché)
 *   • door    → a properly filled, poché'd wall
 * He isolated the variable himself. His log corroborated it exactly:
 *
 *     no door :  1 edge geometries across 1 ISO layer(s)     applied= 6/14 layers
 *     door    :  9 edge geometries across 2 ISO layer(s)     applied=12/14 layers
 *
 * The `:cut` layer NEVER MATERIALISED for a plain wall.
 *
 * THE ROOT CAUSE (proven, not assumed — his own diagnostic named it)
 * -----------------------------------------------------------------
 *     [EdgeProjectorService] §DIAG-EPS-01 … elemType=wall …          ← LOWERCASE
 *
 * `ELEMENT_TYPE_TO_PROJECTION_LAYER` keys walls as `Wall` / `WallPart` / `LayeredWall` /
 * `WallLayer` / `WallEdges` / `CurtainWall` — ALL CAPITALISED — while it keys floors,
 * ceilings, doors and windows in LOWERCASE (`floor`, `ceiling`, `door`, `window`).
 * THE MAP MIXES TWO NAMING CONVENTIONS. A plain wall stamps `'wall'`, matches nothing,
 * and falls through to `projection-visible` — outside `A-WALL`, outside the pen table,
 * outside the cut gate. NO A-WALL ⇒ NO CUT SECTION ⇒ NO POCHÉ.
 *
 * Place a door and the wall is rebuilt through the opening/CSG path, which stamps a
 * CAPITALISED type. It lands on `A-WALL`, the section builds, the wall fills. That is
 * precisely the two images.
 *
 * WHY THE FIX IS A NORMALISER, NOT ONE MORE ALIAS
 * ----------------------------------------------
 * Adding `wall: 'A-WALL'` would have fixed the screenshot and LEFT THE LANDMINE ARMED.
 * This is the THIRD time a layer-stamp mismatch has silently dropped geometry out of the
 * pen table (L-257: layered walls drawn on layer 0; L-261: opening-hosting wall layers
 * carrying no `elementType` at all). A case- and separator-sensitive map is a BUG
 * GENERATOR, so the LOOKUP is fixed, not the map.
 *
 * WHAT THIS GUARDS
 *   C-1  the reported bug itself: 'wall' (lowercase) resolves to A-WALL
 *   C-2  every convention resolves — case, hyphen, underscore
 *   C-3  an UNKNOWN type still falls back safely (we did not break the fallback)
 *   C-4  NO raw `MAP[elementType]` lookup survives — a second raw index is how the
 *        mismatch hid here in the first place
 *   C-5  no two authoring keys COLLIDE onto one canonical form (the normaliser must
 *        never silently merge two element types)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { resolveProjectionLayer } from '../src/engine/views/EdgeProjectorService';

const _here = dirname(fileURLToPath(import.meta.url));
const EPS_SRC = resolve(_here, '../src/engine/views/EdgeProjectorService.ts');

describe('§FIX-PLAN-WALL-LAYER-CASE — a wall is a wall, however it is spelled (L-275)', () => {
    it('C-1: THE BUG — a plain wall stamps `wall` (lowercase) and MUST land on A-WALL', () => {
        // This is the exact string from the founder's log: `elemType=wall`.
        // Before the fix this returned 'projection-visible', and with it went the
        // wall's :cut layer, its pen weight, and its poché — all silently.
        expect(resolveProjectionLayer('wall')).toBe('A-WALL');
    });

    it('C-2: every spelling of every wall type resolves to A-WALL', () => {
        for (const spelling of [
            'wall', 'Wall', 'WALL',
            'wallpart', 'WallPart', 'wall-part', 'wall_part',
            'layeredwall', 'LayeredWall',
            'walllayer', 'WallLayer',
            'walledges', 'WallEdges',
            'curtainwall', 'CurtainWall',
        ]) {
            expect(resolveProjectionLayer(spelling)).toBe('A-WALL');
        }

        // …and the other families keep working, in EITHER convention. The map's
        // lowercase entries (floor/door/window) were never the problem — the point is
        // that BOTH conventions must now resolve, for every family.
        expect(resolveProjectionLayer('Slab')).toBe('A-FLOR');
        expect(resolveProjectionLayer('slab')).toBe('A-FLOR');
        expect(resolveProjectionLayer('door')).toBe('A-DOOR');
        expect(resolveProjectionLayer('Door')).toBe('A-DOOR');
        expect(resolveProjectionLayer('window')).toBe('A-GLAZ');
        expect(resolveProjectionLayer('Column')).toBe('A-COLS');
    });

    it('C-3: an unknown type still falls back safely — the fallback was not broken', () => {
        expect(resolveProjectionLayer('SomethingNobodyHasBuiltYet')).toBe('projection-visible');
        expect(resolveProjectionLayer(undefined)).toBe('projection-visible');
        expect(resolveProjectionLayer('')).toBe('projection-visible');
    });

    it('C-4: NO raw `ELEMENT_TYPE_TO_PROJECTION_LAYER[...]` lookup survives', () => {
        const src = readFileSync(EPS_SRC, 'utf8');
        const code = src
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '');

        // A second raw index lookup is EXACTLY how this bug hid: one call site was
        // fixed at some point and the other was not. There must be ONE resolver.
        expect(code).not.toMatch(/ELEMENT_TYPE_TO_PROJECTION_LAYER\s*\[/);
        expect(code).toMatch(/resolveProjectionLayer\(/);
    });

    it('C-5: no two authoring keys collide onto one canonical form', () => {
        // The normaliser lowercases and strips -/_/space. If a future edit adds both
        // `WallPart` and `wall_part` pointing at DIFFERENT layers, one would silently
        // win. That must be impossible, so we assert it here rather than discover it
        // as another "geometry vanished" bug six months from now.
        const src = readFileSync(EPS_SRC, 'utf8');
        const mapBlock = src.slice(
            src.indexOf('const ELEMENT_TYPE_TO_PROJECTION_LAYER'),
            src.indexOf('/** Layer name used for element types not covered'),
        );

        const entries = [...mapBlock.matchAll(/(['"]?)([A-Za-z_][\w-]*)\1\s*:\s*'([^']+)'/g)]
            .map(m => ({ key: m[2]!, layer: m[3]! }));

        expect(entries.length).toBeGreaterThan(10); // sanity: we actually parsed the map

        const canon = new Map<string, string>();
        for (const { key, layer } of entries) {
            const c = key.toLowerCase().replace(/[-_\s]/g, '');
            const seen = canon.get(c);
            if (seen !== undefined) {
                // Two keys collapse to the same canonical form — they MUST agree on the layer.
                expect(seen, `keys collapsing to "${c}" disagree on their layer`).toBe(layer);
            }
            canon.set(c, layer);
        }
    });
});
