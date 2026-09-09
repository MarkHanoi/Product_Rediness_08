/**
 * §LIGHTING-IS-A-CLASSIFIED-LAYER (founder 2026-09-09 · L-13267 · C09 §4.6)
 *
 * THE ASK, VERBATIM:
 *   *"LIGHTING FIXTURES DEFINITELY SHOULD HAVE A SYMBOL FOR EACH"* — and, in the same message,
 *   *"THE QUALITY ATM IS REALLY BAD - THE LINES ARE ALMOST NOT READABLE"*.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * ⭐⭐ THE PEN EXISTED THE WHOLE TIME AND NOTHING COULD REACH IT
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * `PenWeightTable` has carried `lighting: pen(0.13, '#303030')` in ALL THREE zones (cut,
 * projection, hidden) since it was written. It was unreachable, because the chain that would
 * resolve to it was broken in three places at once:
 *
 *   1. `ELEMENT_TYPE_TO_PROJECTION_LAYER` had no `Lighting` row, so luminaire linework fell to
 *      the generic `projection-visible` layer.
 *   2. `penCategoryForLayerTag` had no `isLighting` flag, so that tag classified as
 *      `'projection'` and drew at the `__default__` pen — **the WALL weight, 0.25 mm black**.
 *      A light fitting was being drawn as heavy as a structural wall, and the founder's plan
 *      shows exactly that: dense black scribbles where the 672-face luminaire meshes project.
 *   3. `ISO_LAYER_TO_VG_CATEGORY` had nothing to map, and the visibility-intent list had no
 *      `lighting` row — so there was no toggle either. The family was DRAWN AND UNGOVERNABLE,
 *      which is the state `DrawingLayerIdentity`'s own header warns about.
 *
 * ⭐ This is [[authored-but-unwired-is-the-bottleneck]]: the pen, the zones and the opacity
 * ramp were all authored. **Audit reachability, not existence.**
 *
 * ⛔ THIS SUITE PINS THE WHOLE CHAIN, NOT ONE LINK. Each of the three sites is independently
 * removable, and removing any one of them silently restores the WALL pen. A test that checked
 * only the map, or only the classifier, would pass over a broken drawing.
 */

import { describe, it, expect } from 'vitest';
import { categoryFromFlags, penCategoryForLayerTag, resolvePen } from './PenWeightTable';
import { ISO_LAYER_TO_VG_CATEGORY } from './DrawingLayerIdentity';

describe('§LIGHTING-IS-A-CLASSIFIED-LAYER — the classifier', () => {
    it('⭐ an A-LGHT tag resolves to the `lighting` pen category, not `projection`', () => {
        // BEFORE L-13267 this returned 'projection' and the line drew at the WALL weight.
        expect(penCategoryForLayerTag('A-LGHT')).toBe('lighting');
    });

    it('the ISO sub-layer forms resolve too — cut / proj / beyond compose onto the tag', () => {
        for (const tag of ['A-LGHT-CUT', 'A-LGHT-PROJ', 'A-LGHT-BEYOND', 'a-lght']) {
            expect(penCategoryForLayerTag(tag), tag).toBe('lighting');
        }
    });

    it('⛔ the regex is A-LGHT|lighting, NOT a bare /light/', () => {
        // A loose /light/ would claim three unrelated things this repo draws. Each of these
        // must keep its own category rather than being painted as a luminaire.
        for (const notALight of ['A-GLAZ-skylight', 'daylight-analysis', 'A-WALL-light-well']) {
            expect(penCategoryForLayerTag(notALight), notALight).not.toBe('lighting');
        }
    });

    it('furniture still wins when a tag carries both words', () => {
        // Ordering is the decision: furniture is the broader family, and a ceiling-mounted
        // fitting can legitimately compose both names into one tag.
        expect(categoryFromFlags({
            isWall: false, isDoor: false, isSlab: false, isCol: false, isStair: false,
            isRoof: false, isCeiling: false, isFurniture: true, isLighting: true,
        })).toBe('furniture');
    });

    it('and lighting wins over the generic fallback', () => {
        expect(categoryFromFlags({
            isWall: false, isDoor: false, isSlab: false, isCol: false, isStair: false,
            isRoof: false, isCeiling: false, isLighting: true,
        })).toBe('lighting');
    });
});

describe('§LIGHTING-IS-A-CLASSIFIED-LAYER — the pen it now reaches', () => {
    it('⭐ in PROJECTION — the HIERARCHY zone — a luminaire draws lighter than a wall', () => {
        // THE FOUNDER-VISIBLE FACT, and PROJECTION is where it matters: a light fitting drawn at
        // the wall weight destroys the hierarchy that makes a plan readable at all. This is the
        // zone his screenshot is in.
        expect(resolvePen('PROJECTION', 'lighting').widthMm)
            .toBeLessThan(resolvePen('PROJECTION', 'wall').widthMm);
    });

    it('⚠ in BEYOND and HIDDEN they are EQUAL — the table design, not a gap', () => {
        // ⛔ CORRECTED WHILE WRITING THIS SUITE. The first version asserted "lighter than wall in
        // every zone" and failed — not because lighting was wrong, but because the assertion was.
        // `resolvePen`'s own note says it: only the HIERARCHY zones (CUT, PROJECTION) are
        // modulated; BEYOND and HIDDEN are DE-EMPHASIS zones that share a base width, and a
        // ladder there would be INVERTED by the modulation. Pinning the equality stops a later
        // lane "restoring the hierarchy" in a zone that deliberately has none.
        for (const zone of ['BEYOND', 'HIDDEN'] as const) {
            expect(resolvePen(zone, 'lighting').widthMm, zone)
                .toBe(resolvePen(zone, 'wall').widthMm);
        }
    });

    it('⚠ CUT deliberately has NO lighting row, and that is correct', () => {
        // A luminaire is an OVERHEAD object: the floor-plan cut plane passes below it, so it is
        // never sliced the way a wall is. It is projected or beyond, never cut. Asserting a CUT
        // pen here would have invented a zone the drawing convention does not have — and this
        // arm exists so a later lane does not "complete the table" by adding one.
        const cutLighting = resolvePen('CUT', 'lighting');
        const projLighting = resolvePen('PROJECTION', 'lighting');
        expect(cutLighting.widthMm).not.toBe(projLighting.widthMm);
    });

    it('the projection pen is the 0.13 mm dark grey the table always carried', () => {
        const p = resolvePen('PROJECTION', 'lighting');
        expect(p.widthMm).toBe(0.13);
        expect(String(p.color).toLowerCase()).toBe('#303030');
    });
});

describe('§LIGHTING-IS-A-CLASSIFIED-LAYER — the governance it now has', () => {
    it('⭐ A-LGHT maps to a V/G category, so V/G can hide it', () => {
        // Without this row `vgCategoryForLayer('A-LGHT')` is null and the family is drawn but
        // ungovernable — the exact state DrawingLayerIdentity's header calls out.
        expect(ISO_LAYER_TO_VG_CATEGORY['A-LGHT']).toBe('lighting');
    });

    it('⭐ `lighting` is DECLARED in the visibility-intent category list', () => {
        // Declaring the family is what puts a row in the founder's Visibility Intent panel —
        // the toggle and the colour he said he could not find.
        // Read as source rather than imported: ELEMENT_TYPES is module-private by design.
        const src = readDefaults();
        expect(src).toMatch(/^\s*'lighting',\s*$/m);
    });

    it('⛔ THE WHOLE CHAIN, not one link — each site independently restores the WALL pen', () => {
        // The three sites are in three packages and are individually removable. This arm is the
        // one that fails if a later lane "tidies" any single one of them away.
        const layerMap = readProjectionLayerMap();
        expect(layerMap, 'EdgeProjectorService must map Lighting to A-LGHT').toMatch(/Lighting:\s*'A-LGHT'/);
        expect(ISO_LAYER_TO_VG_CATEGORY['A-LGHT']).toBe('lighting');
        expect(penCategoryForLayerTag('A-LGHT')).toBe('lighting');
        expect(resolvePen('PROJECTION', 'lighting').widthMm)
            .toBeLessThan(resolvePen('PROJECTION', 'wall').widthMm);
    });
});

// ── source readers ───────────────────────────────────────────────────────────────────────
// ⚠ Source-read, and said so plainly: `ELEMENT_TYPES` is module-private and the projection map
// lives in another package. These two arms measure that the DECLARATION is present, not that a
// pixel changed — the pen arms above are the ones that measure behaviour.
function readDefaults(): string {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { resolve } = require('node:path') as typeof import('node:path');
    return readFileSync(
        resolve(__dirname, '../presentation/VisibilityIntentDefaults.ts'), 'utf8',
    );
}

function readProjectionLayerMap(): string {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { resolve } = require('node:path') as typeof import('node:path');
    return readFileSync(
        resolve(__dirname, '../../../../apps/editor/src/engine/views/EdgeProjectorService.ts'),
        'utf8',
    );
}
